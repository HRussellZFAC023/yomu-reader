import { Logger } from './logger';
import { getUserscriptHttpRequest } from './userscript';

const JPDB_SEARCH_URL = 'https://jpdb.io/search';
const REQUEST_TIMEOUT_MS = 6000;
const SMALL_KANA = new Set('ゃゅょャュョァィゥェォ');
const log = Logger.scope('JpdbPublicPitch');

export class JpdbPublicPitchClient {
    private cache = new Map<string, Promise<string[]>>();

    lookup(spelling: string, reading: string): Promise<string[]> {
        const normalizedSpelling = cleanText(spelling);
        const normalizedReading = cleanText(reading);
        if (!normalizedSpelling && !normalizedReading) return Promise.resolve([]);

        const key = `${normalizedSpelling}\n${normalizedReading}`;
        let promise = this.cache.get(key);
        if (!promise) {
            promise = this.fetchPitch(normalizedSpelling, normalizedReading);
            this.cache.set(key, promise);
        }
        return promise;
    }

    private async fetchPitch(spelling: string, reading: string): Promise<string[]> {
        for (const query of unique([spelling, reading].filter(Boolean))) {
            const url = `${JPDB_SEARCH_URL}?q=${encodeURIComponent(query)}`;
            const html = await requestText(url).catch(error => {
                log.warn('Public JPDB pitch request failed', { query }, error);
                return '';
            });
            const pitch = html ? parseJpdbPublicPitchHtml(html, spelling, reading) : [];
            if (pitch.length) {
                log.debug('Public JPDB pitch loaded', { spelling, reading, query, pitch });
                return pitch;
            }
        }
        log.debug('Public JPDB pitch not found', { spelling, reading });
        return [];
    }
}

export function parseJpdbPublicPitchHtml(html: string, spelling = '', reading = ''): string[] {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const roots = Array.from(doc.querySelectorAll('.result.vocabulary'));
    const matchingRoots = roots.filter(root => vocabularyRootMatches(root, spelling, reading));
    const hasRequestedIdentity = Boolean(cleanText(spelling) || cleanText(reading));
    const candidates: ParentNode[] = matchingRoots.length
        ? matchingRoots
        : (!hasRequestedIdentity && roots.length === 1) || documentMatchesVocabulary(doc, spelling, reading)
            ? [roots[0] ?? doc]
            : [];
    const patterns = candidates.flatMap(readPitchPatterns).filter(Boolean);
    return unique(patterns);
}

function readPitchPatterns(root: ParentNode): string[] {
    const patterns: string[] = [];
    root.querySelectorAll('.subsection-pitch-accent').forEach(section => {
        const stack = section.querySelector('.subsection > div') ?? section;
        Array.from(stack.children).forEach(row => {
            const pattern = Array.from(row.querySelectorAll<HTMLElement>('div[style*="--pitch-low"], div[style*="--pitch-high"]'))
                .map(segment => pitchSegmentPattern(segment))
                .join('');
            if (pattern.length >= 2) patterns.push(pattern);
        });
    });
    return patterns;
}

function pitchSegmentPattern(segment: HTMLElement): string {
    const style = segment.getAttribute('style') ?? '';
    const level = style.includes('--pitch-high') ? 'H' : style.includes('--pitch-low') ? 'L' : '';
    if (!level) return '';
    return level.repeat(splitMorae(cleanText(segment.textContent ?? '')).length);
}

function vocabularyRootMatches(root: Element, spelling: string, reading: string): boolean {
    return vocabularyIdentities(root).some(identity => vocabularyIdentityMatches(identity, spelling, reading));
}

function documentMatchesVocabulary(doc: Document, spelling: string, reading: string): boolean {
    const canonical = doc.querySelector<HTMLLinkElement>('link[rel="canonical"][href*="/vocabulary/"]')?.href ?? '';
    const identity = vocabularyIdentityFromUrl(canonical);
    return identity ? vocabularyIdentityMatches(identity, spelling, reading) : false;
}

function vocabularyIdentities(root: ParentNode): Array<{ expression: string; reading: string }> {
    return Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href^="/vocabulary/"], a[href*="jpdb.io/vocabulary/"]'))
        .filter(link => !link.closest('.subsection-used-in, .subsection-examples'))
        .map(link => vocabularyIdentityFromUrl(link.href || link.getAttribute('href') || ''))
        .filter((identity): identity is { expression: string; reading: string } => identity !== null);
}

function vocabularyIdentityFromUrl(value: string): { expression: string; reading: string } | null {
    if (!value) return null;
    try {
        const parsed = new URL(value, 'https://jpdb.io');
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts[0] !== 'vocabulary') return null;
        return {
            expression: decodePathPart(parts[2] ?? ''),
            reading: decodePathPart(parts[3] ?? ''),
        };
    } catch {
        return null;
    }
}

function vocabularyIdentityMatches(identity: { expression: string; reading: string }, spelling: string, reading: string): boolean {
    const requestedSpelling = cleanText(spelling);
    const requestedReading = cleanText(reading);
    const expression = cleanText(identity.expression);
    const canonicalReading = cleanText(identity.reading);
    const requested = new Set([requestedSpelling, requestedReading].filter(Boolean));
    if (!requested.size) return true;
    if (!requested.has(expression) && !requested.has(canonicalReading)) return false;
    if (!requestedReading) return true;
    return canonicalReading === requestedReading || expression === requestedReading || expression === requestedSpelling;
}

function splitMorae(value: string): string[] {
    const morae: string[] = [];
    for (const char of Array.from(value)) {
        if (morae.length && SMALL_KANA.has(char)) morae[morae.length - 1] += char;
        else morae.push(char);
    }
    return morae;
}

function decodePathPart(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function cleanText(value: string): string {
    return value.replace(/\s+/g, '').trim();
}

function unique<T>(values: T[]): T[] {
    return [...new Set(values)];
}

function requestText(url: string): Promise<string> {
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
        return new Promise((resolve, reject) => {
            userscriptRequest({
                method: 'GET',
                url,
                timeout: REQUEST_TIMEOUT_MS,
                onload: response => {
                    if (response.status >= 200 && response.status < 300) resolve(String(response.responseText ?? response.response ?? ''));
                    else reject(new Error(`Public JPDB pitch request failed (${response.status}).`));
                },
                onerror: reject,
                ontimeout: () => reject(new Error('Public JPDB pitch request timed out.')),
            });
        });
    }

    const fetchUrl = publicFetchUrl(url);
    if (!fetchUrl) {
        return Promise.reject(new Error('Cross-origin JPDB public request needs a userscript HTTP bridge.'));
    }

    return fetch(fetchUrl).then(response => {
        if (!response.ok) throw new Error(`Public JPDB pitch request failed (${response.status}).`);
        return response.text();
    });
}

function publicFetchUrl(url: string): string | null {
    try {
        const target = new URL(url, location.href);
        if (target.origin === location.origin) return target.href;
        if (isLoopbackPage()) return `/__jpdb-reader-dictionary-proxy?url=${encodeURIComponent(target.href)}`;
        return null;
    } catch {
        return url;
    }
}

function isLoopbackPage(): boolean {
    return typeof location !== 'undefined' && ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
}
