import { Logger } from '../app/logger';
import {
    compactJpdbText,
    JpdbPublicLookupBackoff,
    jpdbSearchUrl,
    requestPublicJpdbText,
    unique,
} from './jpdb-public-lookup';
import { parseJpdbPublicPitchHtml } from './jpdb-public-pitch-parser';

const REQUEST_TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_LIMIT = 600;
const log = Logger.scope('JpdbPublicPitch');

export class JpdbPublicPitchClient {
    private cache = new Map<string, { expiresAt: number; promise: Promise<string[]> }>();
    private readonly requestBackoff = new JpdbPublicLookupBackoff();

    constructor(private readonly getCorsProxyUrl: () => string = () => '') {}

    lookup(spelling: string, reading: string): Promise<string[]> {
        const normalizedSpelling = compactJpdbText(spelling);
        const normalizedReading = compactJpdbText(reading);
        if (!normalizedSpelling && !normalizedReading) return Promise.resolve([]);

        const key = `${normalizedSpelling}\n${normalizedReading}`;
        const now = Date.now();
        const cached = this.cache.get(key);
        if (cached && cached.expiresAt > now) {
            this.cache.delete(key);
            this.cache.set(key, cached);
            return cached.promise;
        }
        if (cached) this.cache.delete(key);

        const promise = this.fetchPitch(normalizedSpelling, normalizedReading);
        this.cache.set(key, { expiresAt: now + CACHE_TTL_MS, promise });
        this.pruneCache(now);
        return promise;
    }

    private pruneCache(now: number): void {
        for (const [key, entry] of this.cache) {
            if (entry.expiresAt <= now) this.cache.delete(key);
        }
        while (this.cache.size > CACHE_LIMIT) {
            const oldest = this.cache.keys().next().value;
            if (typeof oldest !== 'string') break;
            this.cache.delete(oldest);
        }
    }

    private async fetchPitch(spelling: string, reading: string): Promise<string[]> {
        if (this.requestBackoff.isActive()) return [];
        for (const query of unique([spelling, reading].filter(Boolean))) {
            const url = jpdbSearchUrl(query);
            const html = await requestText(url, this.getCorsProxyUrl()).catch(error => {
                this.noteRequestFailure('Public JPDB pitch request failed', { query }, error);
                return '';
            });
            if (html) this.requestBackoff.noteSuccess();
            const pitch = html ? parseJpdbPublicPitchHtml(html, spelling, reading) : [];
            if (pitch.length) return pitch;
            if (this.requestBackoff.isActive()) break;
        }
        return [];
    }

    private noteRequestFailure(message: string, context: Record<string, unknown>, error: unknown): void {
        this.requestBackoff.noteFailure(error);
        log.warn(message, context, error);
    }
}

function requestText(url: string, proxyUrl = ''): Promise<string> {
    return requestPublicJpdbText(url, {
        proxyUrl,
        timeoutMs: REQUEST_TIMEOUT_MS,
        failureLabel: 'Public JPDB pitch request',
        timeoutLabel: 'Public JPDB pitch request timed out.',
    });
}
