import type { JPDBToken, ReaderSettings } from '../app/types';
import { managedSessionStorage } from '../app/storage';
import {
    parsedSubtitleHtmlHasReaderWords,
    subtitleParseSourceSignature,
    SUBTITLE_EMPTY_PARSE_RETRY_MS,
} from './subtitle-parse-policy';
import type { ParsedSubtitleHtmlResult, SubtitleParseBatchItem } from './subtitle-parse-batch';

// Session-storage persistence for parsed cue html: parsed ruby survives a
// reload of the same video/session. Keys are hashed so the raw parse key (which
// embeds the full cue text) never lands verbatim in storage.
const SUBTITLE_SESSION_PARSE_CACHE_PREFIX = 'yomu:subtitle-parse:v5:';
const SUBTITLE_SESSION_PARSE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function subtitleSessionParseHash(key: string): string {
    let h1 = 0x811c9dc5;
    let h2 = 0x1505;
    for (let i = 0; i < key.length; i += 1) {
        const code = key.charCodeAt(i);
        h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
        h2 = (Math.imul(h2, 33) ^ code) >>> 0;
    }
    return `${h1.toString(36)}${h2.toString(36)}`;
}

const SUBTITLE_PARSE_CACHE_MIN_ENTRIES = 180;
export const SUBTITLE_PARSE_CACHE_MAX_ENTRIES = 5000;
const SUBTITLE_PARSE_CACHE_TRANSCRIPT_HEADROOM = 64;

const SUBTITLE_FURIGANA_KANJI_RE = /[㐀-鿿]/u;
const SUBTITLE_FURIGANA_KANA_RE = /^[぀-ヿー・]+$/u;

// After this many hydration passes an unresolved fallback cue settles to bare
// instead of re-requesting an unresolvable word on every tick.
const SUBTITLE_INCOMPLETE_ENRICHMENT_RETRY_LIMIT = 6;
const SUBTITLE_PARSE_CONTEXT_CHANGED = 'Subtitle parse context changed';

// Everything the parsed-html cache reads back off the controller, made
// explicit: current settings, whether parsing is enabled at all, whether an
// authoritative (API-credentialed) parse tier exists to upgrade to, and the
// current transcript row count used to size the bounded caches.
export interface SubtitleParsedHtmlCacheDeps {
    getSettings(): ReaderSettings;
    parseContextKey(): string;
    shouldParseSubtitles(): boolean;
    hasAuthoritativeParseTier(settings?: ReaderSettings): boolean;
    transcriptRowCount(): number;
}

export interface SubtitleParsedCueHtmlWriteResult {
    html: string;
    provisional: boolean;
}

type SubtitleParsedCueHtmlWriteOptions = {
    provisional?: boolean;
    forceNotify?: boolean;
    enriched?: boolean;
};

type StoredParsedCueHtml = {
    at: number;
    html: string;
    fallback?: boolean;
};

// Parsed subtitle/transcript HTML caching extracted from the controller: owns
// every parsed-html store (authoritative + provisional tiers, empty-parse TTL,
// in-flight promise dedupe, parsed-token cache, session persistence) plus the
// key derivation, enrichment bookkeeping, bounded eviction and invalidation.
// The controller keeps the parse/render orchestration and delegates all cache
// state through this collaborator; every controller input flows through
// SubtitleParsedHtmlCacheDeps.
export class SubtitleParsedHtmlCache {
    readonly parsedHtmlCache = new Map<string, string>();
    readonly fallbackParsedHtmlKeys = new Set<string>();
    readonly provisionalParsedHtmlCache = new Map<string, string>();
    readonly enrichedProvisionalParsedHtmlKeys = new Set<string>();
    readonly incompleteEnrichmentAttempts = new Map<string, number>();
    readonly sessionParseCacheChecked = new Set<string>();
    readonly emptyParsedHtmlCache = new Map<string, { html: string; expiresAt: number }>();
    readonly pendingParsedHtml = new Map<string, Promise<string>>();
    readonly pendingProvisionalParsedHtml = new Map<string, Promise<string>>();
    readonly parsedTokenCache = new Map<string, JPDBToken[]>();
    readonly parsedTokenNotifiedAt = new Map<string, number>();

    constructor(private readonly deps: SubtitleParsedHtmlCacheDeps) {}

    parseCacheKey(text: string, settings = this.deps.getSettings()): string {
        return `${this.currentParseKeyPrefix()}${[
            subtitleParseSourceSignature(settings),
            settings.showFurigana,
            settings.furiganaMode,
            settings.hideKnownFurigana,
            [...settings.furiganaHiddenStateGroups].sort().join(','),
            settings.showPitchAccent,
            settings.wordHighlightColorSource,
            settings.wordUnderlineColorSource,
            settings.wordTextColorSource,
            settings.subtitleHighlightColorSource,
            settings.subtitleUnderlineColorSource,
            settings.subtitleTextColorSource,
            text,
        ].join(':')}`;
    }

    isCurrentParseKey(key: string): boolean {
        return key.startsWith(this.currentParseKeyPrefix());
    }

    // TARGET generation is part of every cache key, and a context adoption
    // drops all reachable state in one transaction. Promises already running
    // may still settle for their original callers, but the write guards below
    // prevent them from repopulating any tier after A -> B (or A -> B -> A).
    invalidateParseContext(): void {
        this.parsedHtmlCache.clear();
        this.fallbackParsedHtmlKeys.clear();
        this.provisionalParsedHtmlCache.clear();
        this.enrichedProvisionalParsedHtmlKeys.clear();
        this.incompleteEnrichmentAttempts.clear();
        this.sessionParseCacheChecked.clear();
        this.emptyParsedHtmlCache.clear();
        this.pendingParsedHtml.clear();
        this.pendingProvisionalParsedHtml.clear();
        this.parsedTokenCache.clear();
        this.parsedTokenNotifiedAt.clear();
    }

    private currentParseKeyPrefix(): string {
        // This key is also embedded in transcript data attributes. Keep the
        // boundary HTML-safe: browsers replace NUL/control delimiters while
        // parsing attributes, which would make the DOM key differ from Maps.
        return `context:${encodeURIComponent(this.deps.parseContextKey())}:`;
    }

    usableProvisionalParsedHtml(key: string, options: { refreshProvisional?: boolean; requireEnrichedProvisional?: boolean }): string | undefined {
        if (!this.isCurrentParseKey(key)) return undefined;
        const html = this.provisionalParsedHtmlCache.get(key);
        if (!html) return undefined;
        if ((options.refreshProvisional || options.requireEnrichedProvisional) && !this.enrichedProvisionalParsedHtmlKeys.has(key)) return undefined;
        return html;
    }

    // A cue is only "fully enriched" when every kanji-bearing token can render
    // furigana (explicit rubies, or a usable kana reading != surface). A
    // fallback token whose public lookup has not resolved yet leaves the cue
    // re-hydratable, so a later pass (e.g. after orientationchange/resize) can
    // retry it instead of the enriched-once flag freezing the missing furigana
    // forever. Local/authoritative tokens are final and never block. Mirrors
    // sourceTokenRubies (dom/index.ts).
    private tokensFullyEnriched(tokens: JPDBToken[]): boolean {
        return tokens.every(token => {
            if (token.rubies.length) return true;
            const surface = token.card.spelling || '';
            if (!SUBTITLE_FURIGANA_KANJI_RE.test(surface)) return true;
            if (token.card.source !== 'fallback') return true;
            const reading = token.card.reading.trim();
            return Boolean(reading) && reading !== surface && SUBTITLE_FURIGANA_KANA_RE.test(reading);
        });
    }

    // Decide whether a freshly parsed provisional cue is "enriched" (sticky, no
    // re-hydration). A fully-resolved cue is sticky immediately. A cue that
    // still has an unresolved fallback kanji word is left re-hydratable so a
    // later pass can retry — but only up to a bounded number of attempts, after
    // which it settles to bare to avoid re-requesting an unresolvable word on
    // every hydration tick.
    shouldMarkCueEnriched(key: string, tokens: JPDBToken[], enrichRequested: boolean): boolean {
        if (!this.isCurrentParseKey(key)) return false;
        if (!enrichRequested) return false;
        if (this.tokensFullyEnriched(tokens)) {
            this.incompleteEnrichmentAttempts.delete(key);
            return true;
        }
        const attempts = (this.incompleteEnrichmentAttempts.get(key) ?? 0) + 1;
        if (attempts >= SUBTITLE_INCOMPLETE_ENRICHMENT_RETRY_LIMIT) {
            this.incompleteEnrichmentAttempts.delete(key);
            return true;
        }
        if (this.incompleteEnrichmentAttempts.size >= SUBTITLE_PARSE_CACHE_MAX_ENTRIES) {
            this.incompleteEnrichmentAttempts.delete(this.incompleteEnrichmentAttempts.keys().next().value ?? '');
        }
        this.incompleteEnrichmentAttempts.set(key, attempts);
        return false;
    }

    rememberParsedCueHtml(key: string, html: string, tokens: JPDBToken[] = [], options: SubtitleParsedCueHtmlWriteOptions = {}): SubtitleParsedCueHtmlWriteResult {
        const provisional = options.provisional === true;
        this.assertWritableParseKey(key);
        if (!this.deps.shouldParseSubtitles()) return { html, provisional };
        const incomingHasReaderWords = parsedSubtitleHtmlHasReaderWords(html);
        const existing = this.existingParsedCueWinner(key, provisional, incomingHasReaderWords, options);
        if (existing) return existing;
        return incomingHasReaderWords
            ? this.rememberParsedReaderWords(key, html, tokens, provisional, options)
            : this.rememberEmptyParsedCue(key, html, provisional);
    }

    private assertWritableParseKey(key: string): void {
        if (!this.isCurrentParseKey(key)) throw new Error(SUBTITLE_PARSE_CONTEXT_CHANGED);
    }

    // Every parse consumer receives the cache's canonical HTML, not
    // necessarily the result of the promise it happened to await. A late
    // cheap/empty parse therefore cannot paint over richer work for the key.
    private existingParsedCueWinner(
        key: string,
        provisional: boolean,
        incomingHasReaderWords: boolean,
        options: SubtitleParsedCueHtmlWriteOptions,
    ): SubtitleParsedCueHtmlWriteResult | undefined {
        const authoritative = this.authoritativeParsedCueWinner(key, provisional, incomingHasReaderWords);
        if (authoritative) return authoritative;
        return this.provisionalParsedCueWinner(key, provisional, incomingHasReaderWords, options);
    }

    private authoritativeParsedCueWinner(
        key: string,
        provisional: boolean,
        incomingHasReaderWords: boolean,
    ): SubtitleParsedCueHtmlWriteResult | undefined {
        const html = this.parsedHtmlCache.get(key);
        if (!html) return undefined;
        if (provisional) return { html, provisional: false };
        if (!incomingHasReaderWords) return { html, provisional: false };
        return undefined;
    }

    private provisionalParsedCueWinner(
        key: string,
        provisional: boolean,
        incomingHasReaderWords: boolean,
        options: SubtitleParsedCueHtmlWriteOptions,
    ): SubtitleParsedCueHtmlWriteResult | undefined {
        const html = this.provisionalParsedHtmlCache.get(key);
        if (!html) return undefined;
        if (!incomingHasReaderWords) return { html, provisional: true };
        if (this.keepsEnrichedProvisionalWinner(key, provisional, options.enriched === true)) return { html, provisional: true };
        return undefined;
    }

    private keepsEnrichedProvisionalWinner(key: string, provisional: boolean, enriched: boolean): boolean {
        return provisional && !enriched && this.enrichedProvisionalParsedHtmlKeys.has(key);
    }

    private rememberParsedReaderWords(
        key: string,
        html: string,
        tokens: JPDBToken[],
        provisional: boolean,
        options: SubtitleParsedCueHtmlWriteOptions,
    ): SubtitleParsedCueHtmlWriteResult {
        this.storeParsedReaderWords(key, html, provisional, options.enriched === true, tokens);
        // UT-48: persist only a fully enriched cue; provisional work is durable
        // only when no authoritative tier exists and visible enrichment won.
        if (this.shouldPersistParsedCue(tokens, provisional, options.enriched === true)) {
            this.persistSessionParsedCueHtml(key, html, containsFallbackToken(tokens));
        }
        this.emptyParsedHtmlCache.delete(key);
        if (tokens.length) this.parsedTokenCache.set(key, tokens);
        this.pruneParsedSubtitleCaches();
        return { html, provisional };
    }

    private storeParsedReaderWords(
        key: string,
        html: string,
        provisional: boolean,
        enriched: boolean,
        tokens: JPDBToken[],
    ): void {
        if (provisional) this.storeProvisionalParsedReaderWords(key, html, enriched);
        else this.storeAuthoritativeParsedReaderWords(key, html, tokens);
    }

    private storeProvisionalParsedReaderWords(key: string, html: string, enriched: boolean): void {
        this.provisionalParsedHtmlCache.set(key, html);
        if (enriched) this.enrichedProvisionalParsedHtmlKeys.add(key);
        else this.enrichedProvisionalParsedHtmlKeys.delete(key);
    }

    private storeAuthoritativeParsedReaderWords(key: string, html: string, tokens: JPDBToken[]): void {
        this.parsedHtmlCache.set(key, html);
        syncSetMembership(this.fallbackParsedHtmlKeys, key, containsFallbackToken(tokens));
        this.provisionalParsedHtmlCache.delete(key);
        this.enrichedProvisionalParsedHtmlKeys.delete(key);
    }

    private shouldPersistParsedCue(tokens: JPDBToken[], provisional: boolean, enriched: boolean): boolean {
        if (!this.tokensFullyEnriched(tokens)) return false;
        if (!provisional) return true;
        return enriched && !this.deps.hasAuthoritativeParseTier();
    }

    private rememberEmptyParsedCue(key: string, html: string, provisional: boolean): SubtitleParsedCueHtmlWriteResult {
        // Provisional empties are final for keyless parsing; keyed authoritative
        // work overwrites this retry-bounded entry when it lands.
        this.emptyParsedHtmlCache.set(key, { html, expiresAt: Date.now() + SUBTITLE_EMPTY_PARSE_RETRY_MS });
        this.pruneParsedSubtitleCaches();
        return { html, provisional };
    }

    // Parser/enrichment rejection is different from an ordinary empty parse:
    // any provisional HTML for this key is incomplete by definition and must
    // not win canonicalization over the stable plain fallback. Keep a settled
    // authoritative result if one already won the race; otherwise discard all
    // uncommitted tiers and cache the plain frame for the normal retry TTL.
    rememberPlainCueFallback(key: string, html: string): string {
        if (!this.isCurrentParseKey(key)) return html;
        const authoritative = this.parsedHtmlCache.get(key);
        if (authoritative !== undefined) return authoritative;
        this.deleteParsedSubtitleKey(key);
        this.emptyParsedHtmlCache.set(key, { html, expiresAt: Date.now() + SUBTITLE_EMPTY_PARSE_RETRY_MS });
        this.pruneParsedSubtitleCaches();
        return html;
    }

    canonicalParsedHtmlResults(results: ParsedSubtitleHtmlResult[]): ParsedSubtitleHtmlResult[] {
        return results.map(result => {
            const authoritative = this.parsedHtmlCache.get(result.key);
            if (authoritative !== undefined) return { key: result.key, html: authoritative };
            const provisional = this.provisionalParsedHtmlCache.get(result.key);
            if (provisional !== undefined) return { key: result.key, html: provisional, provisional: true };
            return result.provisional ? { ...result, provisional: true } : { key: result.key, html: result.html };
        });
    }

    async resolveParsedHtmlBatch(
        ready: Promise<ParsedSubtitleHtmlResult>[],
        batch: SubtitleParseBatchItem[],
        parsedHtml: Promise<ParsedSubtitleHtmlResult>[],
        pendingCache: Map<string, Promise<string>>,
    ): Promise<ParsedSubtitleHtmlResult[]> {
        const pendingHtml = parsedHtml.map(promise => promise.then(result => result.html));
        batch.forEach((item, index) => pendingCache.set(item.key, pendingHtml[index]));
        try {
            return this.canonicalParsedHtmlResults(await Promise.all([...ready, ...parsedHtml]));
        } finally {
            batch.forEach((item, index) => {
                if (pendingCache.get(item.key) === pendingHtml[index]) pendingCache.delete(item.key);
            });
        }
    }

    pruneParsedSubtitleCaches(): void {
        const limit = this.parsedSubtitleCacheLimit();
        this.pruneParsedSubtitleCache(this.parsedHtmlCache, limit);
        this.pruneParsedSubtitleCache(this.provisionalParsedHtmlCache, limit);
        while (this.emptyParsedHtmlCache.size > SUBTITLE_PARSE_CACHE_MIN_ENTRIES) this.deleteParsedSubtitleKey(this.emptyParsedHtmlCache.keys().next().value ?? '');
        while (this.parsedTokenCache.size > limit) this.deleteParsedSubtitleKey(this.parsedTokenCache.keys().next().value ?? '');
    }

    private parsedSubtitleCacheLimit(): number {
        const transcriptRows = this.deps.transcriptRowCount();
        return Math.min(
            SUBTITLE_PARSE_CACHE_MAX_ENTRIES,
            Math.max(SUBTITLE_PARSE_CACHE_MIN_ENTRIES, transcriptRows + SUBTITLE_PARSE_CACHE_TRANSCRIPT_HEADROOM),
        );
    }

    // UT-48 session persistence: parsed cue html survives reloads of the
    // same video/session. Quota errors and disabled storage degrade to the
    // in-memory caches silently.
    private persistSessionParsedCueHtml(key: string, html: string, fallback: boolean): void {
        try {
            managedSessionStorage.setItem(`${SUBTITLE_SESSION_PARSE_CACHE_PREFIX}${subtitleSessionParseHash(key)}`, JSON.stringify({ at: Date.now(), html, fallback }));
        } catch {
            // Storage full or unavailable — in-memory cache still applies.
        }
    }

    restoreSessionParsedCueHtml(key: string): string | undefined {
        if (this.sessionParseCacheChecked.has(key)) return undefined;
        this.sessionParseCacheChecked.add(key);
        const value = readStoredParsedCueHtml(key);
        if (!value) return undefined;
        this.parsedHtmlCache.set(key, value.html);
        syncSetMembership(this.fallbackParsedHtmlKeys, key, value.fallback === true);
        this.pruneParsedSubtitleCaches();
        return value.html;
    }

    private pruneParsedSubtitleCache(cache: Map<string, string>, limit = this.parsedSubtitleCacheLimit()): void {
        while (cache.size > limit) this.deleteParsedSubtitleKey(cache.keys().next().value ?? '');
    }

    // Invalidate a single parse key across every tier so an evicted or stale
    // cue leaves no orphaned provisional/empty/pending/token remnant behind.
    deleteParsedSubtitleKey(key: string): void {
        if (!key) return;
        this.parsedHtmlCache.delete(key);
        this.fallbackParsedHtmlKeys.delete(key);
        this.provisionalParsedHtmlCache.delete(key);
        this.enrichedProvisionalParsedHtmlKeys.delete(key);
        this.incompleteEnrichmentAttempts.delete(key);
        this.sessionParseCacheChecked.delete(key);
        this.emptyParsedHtmlCache.delete(key);
        this.pendingParsedHtml.delete(key);
        this.pendingProvisionalParsedHtml.delete(key);
        this.parsedTokenCache.delete(key);
        this.parsedTokenNotifiedAt.delete(key);
    }

    hasFreshEmptyParsedHtml(key: string): boolean {
        return Boolean(this.freshEmptyParsedHtml(key));
    }

    freshEmptyParsedHtml(key: string): string | undefined {
        if (!this.isCurrentParseKey(key)) return undefined;
        const cached = this.emptyParsedHtmlCache.get(key);
        if (!cached) return undefined;
        if (cached.expiresAt > Date.now()) return cached.html;
        this.emptyParsedHtmlCache.delete(key);
        return undefined;
    }

    cachedParsedCueHtml(key: string, settings: ReaderSettings): string | undefined {
        const cached = this.authoritativeCachedParsedCueHtml(key);
        if (!cached) return undefined;
        if (this.fallbackCueNeedsAuthoritativeUpgrade(key, settings)) {
            this.parsedHtmlCache.delete(key);
            return undefined;
        }
        return cached;
    }

    private authoritativeCachedParsedCueHtml(key: string): string | undefined {
        const cached = this.parsedHtmlCache.get(key);
        if (cached !== undefined) return cached;
        return this.restoreSessionParsedCueHtml(key);
    }

    private fallbackCueNeedsAuthoritativeUpgrade(key: string, settings: ReaderSettings): boolean {
        return this.deps.hasAuthoritativeParseTier(settings) && this.fallbackParsedHtmlKeys.has(key);
    }

    // Keyless both tiers produce the same local-tokenizer result, so an
    // in-flight parse on EITHER tier satisfies the other — without this the
    // overlay warmup and the transcript-tail warmup tokenized the same cue
    // twice whenever their windows overlapped.
    pendingParsedCueHtml(key: string, tier: 'authoritative' | 'provisional'): Promise<string> | undefined {
        const own = tier === 'provisional' ? this.pendingProvisionalParsedHtml.get(key) : this.pendingParsedHtml.get(key);
        if (own || this.deps.hasAuthoritativeParseTier()) return own;
        return tier === 'provisional' ? this.pendingParsedHtml.get(key) : this.pendingProvisionalParsedHtml.get(key);
    }
}

function containsFallbackToken(tokens: JPDBToken[]): boolean {
    return tokens.some(token => token.card.source === 'fallback');
}

function syncSetMembership(values: Set<string>, key: string, present: boolean): void {
    if (present) values.add(key);
    else values.delete(key);
}

function readStoredParsedCueHtml(key: string): StoredParsedCueHtml | undefined {
    const raw = storedParsedCueHtmlRaw(key);
    if (!raw) return undefined;
    const value = parseStoredParsedCueHtml(raw);
    if (!isFreshStoredParsedCueHtml(value)) return undefined;
    return value;
}

function storedParsedCueHtmlRaw(key: string): string | null | undefined {
    try {
        return managedSessionStorage.getItem(`${SUBTITLE_SESSION_PARSE_CACHE_PREFIX}${subtitleSessionParseHash(key)}`);
    } catch {
        return undefined;
    }
}

function parseStoredParsedCueHtml(raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        return undefined;
    }
}

function isFreshStoredParsedCueHtml(value: unknown): value is StoredParsedCueHtml {
    if (!isObjectRecord(value)) return false;
    const candidate = value as Partial<StoredParsedCueHtml>;
    if (typeof candidate.html !== 'string') return false;
    if (typeof candidate.at !== 'number') return false;
    return Date.now() - candidate.at <= SUBTITLE_SESSION_PARSE_CACHE_TTL_MS;
}

function isObjectRecord(value: unknown): value is object {
    return Boolean(value) && typeof value === 'object';
}
