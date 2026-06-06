import { parseJpdbVocabularyUrl, type JpdbVocabularyUrlIdentity } from './jpdb-text';
import { requestText as requestReaderText, type ReaderHttpOptions } from './reader-http';

const JPDB_SEARCH_URL = 'https://jpdb.io/search';
const REQUEST_BACKOFF_INITIAL_MS = 30_000;
const REQUEST_BACKOFF_MAX_MS = 5 * 60_000;

type TextNormalizer = (value: string) => string;

export class JpdbPublicLookupBackoff {
    private requestBackoffUntil = 0;
    private requestBackoffMs = REQUEST_BACKOFF_INITIAL_MS;

    isActive(): boolean {
        return Date.now() < this.requestBackoffUntil;
    }

    noteSuccess(): void {
        this.reset();
    }

    noteFailure(error: unknown): void {
        if (!isPublicLookupBackoffError(error)) return;
        this.requestBackoffUntil = Date.now() + this.requestBackoffMs;
        this.requestBackoffMs = Math.min(this.requestBackoffMs * 2, REQUEST_BACKOFF_MAX_MS);
    }

    reset(): void {
        this.requestBackoffUntil = 0;
        this.requestBackoffMs = REQUEST_BACKOFF_INITIAL_MS;
    }
}

export function compactJpdbText(value: string): string {
    return value.replace(/\s+/g, '').trim();
}

export function jpdbSearchUrl(query: string): string {
    return `${JPDB_SEARCH_URL}?q=${encodeURIComponent(query)}`;
}

export function jpdbVocabularyResultRoots(doc: Document): Element[] {
    return Array.from(doc.querySelectorAll('.result.vocabulary'));
}

export function jpdbVocabularyRootMatches(
    root: Element,
    spelling: string,
    reading: string,
    normalize: TextNormalizer = compactJpdbText,
): boolean {
    return jpdbVocabularyIdentities(root).some(identity => jpdbVocabularyIdentityMatches(identity, spelling, reading, normalize));
}

export function jpdbDocumentMatchesVocabulary(
    doc: Document,
    spelling: string,
    reading: string,
    normalize: TextNormalizer = compactJpdbText,
): boolean {
    const identity = jpdbDocumentVocabularyIdentity(doc);
    return identity ? jpdbVocabularyIdentityMatches(identity, spelling, reading, normalize) : false;
}

export function jpdbDocumentVocabularyIdentity(doc: Document): JpdbVocabularyUrlIdentity | null {
    const canonical = doc.querySelector<HTMLLinkElement>('link[rel="canonical"][href*="/vocabulary/"]')?.href ?? '';
    return parseJpdbVocabularyUrl(canonical);
}

export function hasRequestedJpdbVocabularyIdentity(
    spelling: string,
    reading: string,
    normalize: TextNormalizer = compactJpdbText,
): boolean {
    return Boolean(normalize(spelling) || normalize(reading));
}

export function requestPublicJpdbText(url: string, options: ReaderHttpOptions): Promise<string> {
    return requestReaderText(url, options);
}

export function unique<T>(values: T[]): T[] {
    return [...new Set(values)];
}

function jpdbVocabularyIdentities(root: ParentNode): JpdbVocabularyUrlIdentity[] {
    return Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href^="/vocabulary/"], a[href*="jpdb.io/vocabulary/"]'))
        .filter(link => !link.closest('.subsection-used-in, .subsection-examples'))
        .map(link => parseJpdbVocabularyUrl(link.href || link.getAttribute('href') || ''))
        .filter((identity): identity is JpdbVocabularyUrlIdentity => identity !== null);
}

function jpdbVocabularyIdentityMatches(
    identity: JpdbVocabularyUrlIdentity,
    spelling: string,
    reading: string,
    normalize: TextNormalizer,
): boolean {
    const requestedSpelling = normalize(spelling);
    const requestedReading = normalize(reading);
    const expression = normalize(identity.expression);
    const canonicalReading = normalize(identity.reading);
    const requested = new Set([requestedSpelling, requestedReading].filter(Boolean));
    if (!requested.size) return true;
    if (!jpdbVocabularyIdentityIntersectsRequest(requested, expression, canonicalReading)) return false;
    if (!requestedReading) return true;
    return jpdbVocabularyIdentityMatchesReading(expression, canonicalReading, requestedSpelling, requestedReading);
}

function jpdbVocabularyIdentityIntersectsRequest(requested: Set<string>, expression: string, canonicalReading: string): boolean {
    return requested.has(expression) || requested.has(canonicalReading);
}

function jpdbVocabularyIdentityMatchesReading(
    expression: string,
    canonicalReading: string,
    requestedSpelling: string,
    requestedReading: string,
): boolean {
    return canonicalReading === requestedReading
        || expression === requestedReading
        || expression === requestedSpelling;
}

function isPublicLookupBackoffError(error: unknown): boolean {
    return error instanceof Error
        && /\b(?:429|525|too many requests|rate[- ]?limited)\b|cloudflare/i.test(error.message);
}
