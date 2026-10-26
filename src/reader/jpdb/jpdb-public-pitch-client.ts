import { Logger } from '../app/logger';
import {
    compactJpdbText,
    JpdbPublicLookupBackoff,
    jpdbSearchUrl,
    requestPublicJpdbText,
} from './jpdb-public-lookup';
import { unique } from '../core/array-utils';
import { readPublicJpdbCache, writePublicJpdbCache } from './jpdb-public-cache';
import { parseJpdbPublicPitchHtml } from './jpdb-public-pitch-parser';

const REQUEST_TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_LIMIT = 600;
// Search pages are kept briefly, for the other readings of a word asked in
// the same pass; the contours they give are what is kept for long.
const PAGE_TTL_MS = 60_000;
const PAGE_LIMIT = 24;
const log = Logger.scope('JpdbPublicPitch');

type CacheEntry<T> = { expiresAt: number; promise: Promise<T> };
type PitchAnswer = { pitch: string[]; complete: boolean };

export class JpdbPublicPitchClient {
    private cache = new Map<string, CacheEntry<string[]>>();
    // One jpdb.io search page per query string: 復習 asked with two readings,
    // or as one word's spelling and another's reading, is fetched once.
    private pages = new Map<string, CacheEntry<string | null>>();
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

        // An answered lookup is kept for a day, an empty one too: jpdb.io
        // showing no contour today shows none on the next page either.
        const persistent = readPublicJpdbCache<string[]>('pitch', key, now);
        const promise = Array.isArray(persistent)
            ? Promise.resolve(persistent)
            : this.fetchPitch(normalizedSpelling, normalizedReading).then(({ pitch, complete }) => {
                if (complete) writePublicJpdbCache('pitch', key, pitch);
                return pitch;
            });
        this.cache.set(key, { expiresAt: now + CACHE_TTL_MS, promise });
        pruneCache(this.cache, now);
        return promise;
    }

    private async fetchPitch(spelling: string, reading: string): Promise<PitchAnswer> {
        if (this.requestBackoff.isActive()) return { pitch: [], complete: false };
        let complete = true;
        for (const query of unique([spelling, reading].filter(Boolean))) {
            const html = await this.page(query);
            if (html === null) complete = false;
            const pitch = html ? parseJpdbPublicPitchHtml(html, spelling, reading) : [];
            if (pitch.length) return { pitch, complete: true };
            if (this.requestBackoff.isActive()) return { pitch: [], complete: false };
        }
        return { pitch: [], complete };
    }

    // The search page for one query, or null when it could not be fetched.
    private page(query: string): Promise<string | null> {
        const now = Date.now();
        const cached = this.pages.get(query);
        if (cached && cached.expiresAt > now) return cached.promise;
        const entry: CacheEntry<string | null> = {
            expiresAt: now + PAGE_TTL_MS,
            promise: requestText(jpdbSearchUrl(query), this.getCorsProxyUrl()).then(html => {
                this.requestBackoff.noteSuccess();
                return html;
            }, error => {
                // A failure is not an answer: the next lookup may ask again.
                entry.expiresAt = 0;
                this.noteRequestFailure('Public JPDB pitch request failed', { query }, error);
                return null;
            }),
        };
        this.pages.set(query, entry);
        pruneCache(this.pages, now, PAGE_LIMIT);
        return entry.promise;
    }

    private noteRequestFailure(message: string, context: Record<string, unknown>, error: unknown): void {
        this.requestBackoff.noteFailure(error);
        log.warn(message, context, error);
    }
}

function pruneCache<T>(cache: Map<string, CacheEntry<T>>, now: number, limit = CACHE_LIMIT): void {
    for (const [key, entry] of cache) {
        if (entry.expiresAt <= now) cache.delete(key);
    }
    while (cache.size > limit) {
        const oldest = cache.keys().next().value;
        if (typeof oldest !== 'string') break;
        cache.delete(oldest);
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
