import { JpdbClient } from '../jpdb/jpdb';
import { ConcurrencyGate, mapLimited } from '../core/async-utils';
import {
    JAPANESE_CHARACTER_RE,
    JAPANESE_SCRIPT_GROUP_RE,
    fallbackLookupTermsForText,
    isBoundarySegment,
    normalizeFallbackTerm,
    segmentJapaneseText,
} from './japanese-segments';
import { splitReadingAcrossKanji } from './kanji-ruby-split';
import { getPitchClass } from '../jpdb/jpdb-parser';
import { Logger } from '../app/logger';
import { localPitchPatternFromMeta } from './pitch-meta';
import { stablePositiveHashId } from '../core/stable-hash';
import { hasJitenApiCredential, hasJpdbApiCredential } from '../settings/api-credential';
import type { JitenApiClient } from '../dictionaries/jiten';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../app/types';
import { glossaryToText, type YomitanDictionaryStore, type YomitanMetaEntry, type YomitanTermEntry } from '../dictionaries/yomitan';

export { fallbackJapaneseSegments, fallbackLookupTermsForText, fallbackDictionaryLookupTermsForText, fallbackLookupTermsForCard } from './japanese-segments';

const LOCAL_MATCH_LIMIT = 40;
// Cap concurrent IndexedDB-backed enrichment (pitch meta + per-kanji readings)
// ACROSS all in-flight cue parses. Keyless YouTube warmup parses several cues
// at once, each fanning out over up to LOCAL_MATCH_LIMIT matches; without a
// shared gate that was thousands of concurrent IndexedDB requests at cold
// start, starving the main thread so cues rendered late / half-enriched.
const LOCAL_ENRICHMENT_CONCURRENCY = 12;
const LOCAL_PARSE_CACHE_LIMIT = 600;
const LOCAL_PITCH_CACHE_LIMIT = 800;
const JPDB_PARSE_FALLBACK_TIMEOUT_MS = 6_000;
const YOUTUBE_VIEW_METRIC_RE = /回視聴/gu;
const LOCAL_RUBY_SPLIT_BASE_RE = /^[\u3040-\u30ff\u3400-\u9fff々ー・]+$/u;
const LOCAL_RUBY_SPLIT_KANJI_RE = /[\u3400-\u9fff々]/u;
const LOCAL_RUBY_SPLIT_KANJI_CHAR_RE = /^[\u3400-\u9fff々]$/u;
const LOCAL_RUBY_SPLIT_READING_RE = /^[\u3040-\u30ffー・]+$/u;
const log = Logger.scope('ReaderParser');

export interface ReaderParserParseOptions {
    apiTimeoutMs?: number;
    allowApiTimeoutFallback?: boolean;
    jpdbTimeoutMs?: number;
    allowJpdbTimeoutFallback?: boolean;
    includeLocalPitch?: boolean;
    skipApi?: boolean;
    skipJpdb?: boolean;
    requireApi?: boolean;
    requireJpdb?: boolean;
    allowSegmentedFallback?: boolean;
}

export interface ReaderParserDependencies {
    getSettings: () => ReaderSettings;
    jpdb: JpdbClient;
    jiten?: JitenApiClient;
    jitenPublicVocabulary?: { parse: (paragraphs: readonly string[]) => Promise<JPDBToken[][]> };
    dictionaries: YomitanDictionaryStore;
}

function apiFirstParseOptions(options: ReaderParserParseOptions = {}): ReaderParserParseOptions {
    const requireApi = options.requireApi ?? options.requireJpdb ?? true;
    return { includeLocalPitch: false, ...options, requireApi };
}

export function jpdbFirstParseOptions(options: ReaderParserParseOptions = {}): ReaderParserParseOptions {
    const requireApi = options.requireApi ?? options.requireJpdb ?? true;
    const requireJpdb = options.requireJpdb ?? requireApi;
    return apiFirstParseOptions({ ...options, requireApi, requireJpdb });
}

export class ReaderParser {
    private localCardCache = new Map<string, JPDBCard>();
    private localParseCache = new Map<string, Promise<JPDBToken[]>>();
    private localPitchCache = new Map<string, Promise<string>>();
    private localTermDictionaryAvailability?: Promise<boolean | undefined>;
    private readonly enrichmentGate = new ConcurrencyGate(LOCAL_ENRICHMENT_CONCURRENCY);
    private kanjiReadingCache = new Map<string, Promise<string[]>>();

    constructor(private dependencies: ReaderParserDependencies) {}

    async parse(paragraphs: string[], options: ReaderParserParseOptions = {}): Promise<JPDBToken[][]> {
        const { getSettings } = this.dependencies;
        const settings = getSettings();
        const done = log.time('parse', {
            paragraphs: paragraphs.length,
            hasApiKey: hasJpdbApiCredential(settings),
            hasJitenApiKey: hasJitenApiCredential(settings),
            localFallback: settings.localDictionariesEnabled,
        });
        try {
            const parsed = await this.parseWithPreferredSource(paragraphs, options, settings);
            const rubyAligned = await this.withLocallySplitKanjiRubies(paragraphs, parsed);
            return this.withNormalizedMetricParseResult(paragraphs, rubyAligned);
        } finally {
            done();
        }
    }

    private async parseWithPreferredSource(paragraphs: string[], options: ReaderParserParseOptions, settings: ReaderSettings): Promise<JPDBToken[][]> {
        // Local-first never touches Jiten/JPDB, even for requireApi/requireJpdb
        // flows ("propagate remote errors", not a data dependency).
        if (settings.parserProvider === 'local' && await this.hasLocalTermDictionaries(true)) {
            return Promise.all(paragraphs.map(text => this.parseLocalOrSegmentedText(text, options)));
        }
        if (shouldPreferJitenParser(settings, options, this.dependencies.jiten)) {
            const jitenResult = await this.tryParseWithJiten(paragraphs, options, settings);
            if (jitenResult) return jitenResult;
            const jpdbResult = await this.tryParseWithJpdb(paragraphs, options, settings);
            if (jpdbResult) return jpdbResult;
            return this.parseWithFallbackSource(paragraphs, options);
        }
        const jpdbResult = await this.tryParseWithJpdb(paragraphs, options, settings);
        if (jpdbResult) return jpdbResult;
        const jitenResult = await this.tryParseWithJiten(paragraphs, options, settings);
        if (jitenResult) return jitenResult;
        return this.parseWithFallbackSource(paragraphs, options);
    }

    private async tryParseWithJpdb(paragraphs: string[], options: ReaderParserParseOptions, settings: ReaderSettings): Promise<JPDBToken[][] | null> {
        if (!hasJpdbApiCredential(settings) || shouldSkipApiParser(options)) return null;
        try {
            const result = await this.parseWithJpdb(paragraphs, options);
            return this.withSegmentedFallbackGaps(paragraphs, result, options);
        } catch (error) {
            this.handleRemoteParseError('JPDB', error, options);
            return null;
        }
    }

    private async parseWithJpdb(paragraphs: string[], options: ReaderParserParseOptions): Promise<JPDBToken[][]> {
        const parsePromise = this.dependencies.jpdb.parse(paragraphs);
        const timeoutMs = remoteParseFallbackTimeoutMs(options);
        return timeoutMs > 0
            ? withTimeout(parsePromise, timeoutMs, () => new Error('JPDB parse timed out.'))
            : parsePromise;
    }

    private async tryParseWithJiten(paragraphs: string[], options: ReaderParserParseOptions, settings: ReaderSettings): Promise<JPDBToken[][] | null> {
        if (!shouldUseJitenParser(settings, options, this.dependencies.jiten)) return null;
        try {
            const result = await this.parseWithJiten(paragraphs, options);
            return this.withSegmentedFallbackGaps(paragraphs, result, options);
        } catch (error) {
            this.handleRemoteParseError('Jiten', error, options);
            return null;
        }
    }

    private async parseWithJiten(paragraphs: string[], options: ReaderParserParseOptions): Promise<JPDBToken[][]> {
        const parsePromise = this.dependencies.jiten!.parse(paragraphs);
        const timeoutMs = remoteParseFallbackTimeoutMs(options);
        return timeoutMs > 0
            ? withTimeout(parsePromise, timeoutMs, () => new Error('Jiten parse timed out.'))
            : parsePromise;
    }

    private handleRemoteParseError(source: 'JPDB' | 'Jiten', error: unknown, options: ReaderParserParseOptions): void {
        const canFallback = this.canUseParseFallback(options);
        log.warn(remoteParseErrorMessage(source, options, canFallback), error);
        if (shouldRethrowRemoteParseError(options, canFallback)) throw error;
    }

    private async parseWithFallbackSource(paragraphs: string[], options: ReaderParserParseOptions): Promise<JPDBToken[][]> {
        if (!await this.hasLocalTermDictionaries()) {
            const publicJitenResult = await this.tryParseWithPublicJiten(paragraphs, options);
            if (publicJitenResult) return publicJitenResult;
        }
        return Promise.all(paragraphs.map(text => this.parseLocalOrSegmentedText(text, options)));
    }

    private async tryParseWithPublicJiten(paragraphs: string[], options: ReaderParserParseOptions): Promise<JPDBToken[][] | null> {
        if (options.allowSegmentedFallback !== true || shouldSkipApiParser(options)) return null;
        // Offline the public round-trip is doomed and would only delay the
        // segmented first paint until the request timeout fires.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
        const parser = this.dependencies.jitenPublicVocabulary;
        if (typeof parser?.parse !== 'function') return null;
        try {
            const parsed = await parser.parse(paragraphs);
            if (!parsed.some(tokens => tokens.length)) return null;
            return this.withSegmentedFallbackGaps(paragraphs, parsed, options);
        } catch (error) {
            log.warn('Jiten public parse failed; using local or segmented fallback', error);
            return null;
        }
    }

    canParse(): boolean {
        return true;
    }

    isJpdbBackedCard(card: JPDBCard): boolean {
        return (!card.source || card.source === 'jpdb') && card.vid > 0;
    }

    getCachedCard(vid: number, sid: number): JPDBCard | undefined {
        return this.dependencies.jpdb.getCard(vid, sid) ?? this.localCardCache.get(cardCacheKey(vid, sid));
    }

    cacheCards(cards: JPDBCard[]): void {
        cards.forEach(card => {
            if ((card.source && card.source !== 'jpdb') || card.vid <= 0 || card.sid <= 0) {
                this.localCardCache.set(cardCacheKey(card.vid, card.sid), card);
            }
        });
    }

    clearLocalCache(): void {
        this.localCardCache.clear();
        this.localParseCache.clear();
        this.localPitchCache.clear();
        this.localTermDictionaryAvailability = undefined;
    }

    localCardFromEntry(entry: YomitanTermEntry): JPDBCard {
        const id = -stablePositiveHashId(`${entry.dictionary}\n${entry.expression}\n${entry.reading}`);
        const card: JPDBCard = {
            vid: id,
            sid: id,
            rid: 0,
            spelling: entry.expression,
            reading: entry.reading || entry.expression,
            frequencyRank: entry.jpdbFrequency ?? null,
            partOfSpeech: [],
            meanings: [{
                glosses: entry.glossary.map(glossaryToText).filter(Boolean).slice(0, 8),
                partOfSpeech: [],
            }],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'local',
        };
        this.localCardCache.set(cardCacheKey(card.vid, card.sid), card);
        return card;
    }

    fallbackCardFromText(text: string): JPDBCard {
        const spelling = normalizeFallbackTerm(text);
        const id = -stablePositiveHashId(`fallback\n${spelling}`);
        const fallbackLookupTerms = fallbackLookupTermsForText(spelling).slice(1);
        const card: JPDBCard = {
            vid: id,
            sid: id,
            rid: 0,
            spelling,
            reading: '',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'fallback',
            ...(fallbackLookupTerms.length ? { fallbackLookupTerms } : {}),
        };
        this.localCardCache.set(cardCacheKey(card.vid, card.sid), card);
        return card;
    }

    private canUseLocalDictionaryFallback(): boolean {
        return this.dependencies.getSettings().localDictionariesEnabled;
    }

    private canUseParseFallback(options: ReaderParserParseOptions): boolean {
        return this.canUseLocalDictionaryFallback() || options.allowSegmentedFallback === true;
    }

    private async parseLocalOrSegmentedText(text: string, options: ReaderParserParseOptions): Promise<JPDBToken[]> {
        const settings = this.dependencies.getSettings();
        const key = localParseCacheKey(text, options, settings);
        const cached = this.localParseCache.get(key);
        if (cached) {
            this.localParseCache.delete(key);
            this.localParseCache.set(key, cached);
            return cached;
        }
        const promise = this.parseLocalOrSegmentedTextUncached(text, options).catch(error => {
            if (this.localParseCache.get(key) === promise) this.localParseCache.delete(key);
            throw error;
        });
        this.rememberLocalParseCacheEntry(key, promise);
        return promise;
    }

    private async parseLocalOrSegmentedTextUncached(text: string, options: ReaderParserParseOptions): Promise<JPDBToken[]> {
        if (this.canUseLocalDictionaryFallback()) {
            const tokens = await this.parseLocalDictionaryText(text, options);
            if (tokens.length) {
                return options.allowSegmentedFallback === true
                    ? this.fillSegmentedFallbackGaps(text, tokens)
                    : tokens;
            }
        }
        return options.allowSegmentedFallback === true ? this.parseSegmentedText(text) : [];
    }

    private rememberLocalParseCacheEntry(key: string, promise: Promise<JPDBToken[]>): void {
        this.localParseCache.set(key, promise);
        while (this.localParseCache.size > LOCAL_PARSE_CACHE_LIMIT) {
            const oldest = this.localParseCache.keys().next().value;
            if (typeof oldest !== 'string') break;
            this.localParseCache.delete(oldest);
        }
    }

    private async parseLocalDictionaryText(text: string, options: ReaderParserParseOptions): Promise<JPDBToken[]> {
        const { dictionaries, getSettings } = this.dependencies;
        if (!await this.hasLocalTermDictionaries()) return [];
        const settings = getSettings();
        const matches = await dictionaries.findTermMatches(text, LOCAL_MATCH_LIMIT, settings.dictionaryPreferences).catch(error => {
            log.warn('Local dictionary parse failed', { length: text.length }, error);
            return [];
        });
        // The card (identity/state) is synchronous; only the pitch + ruby
        // enrichment hits IndexedDB. Gate that enrichment through a shared
        // concurrency limiter so parsing many cues at once (keyless warmup)
        // cannot flood IndexedDB and stall the main thread.
        return mapLimited(matches, LOCAL_ENRICHMENT_CONCURRENCY, async match => {
            const card = this.localCardFromEntry(match.entry);
            const reading = !match.deinflected && card.reading && card.reading !== match.surface ? card.reading : '';
            const pitch = await this.enrichmentGate.run(() => this.localPitchPattern(card, options));
            if (pitch && !card.pitchAccent.length) card.pitchAccent = [pitch];
            const rubies = reading
                ? await this.enrichmentGate.run(() => this.localRubySegments(match.surface, reading, match.start, match.end))
                : [];
            return {
                card,
                start: match.start,
                end: match.end,
                length: match.end - match.start,
                rubies,
                pitchClass: pitch ? getPitchClass([pitch], card.reading) : '',
                sentence: text,
            };
        });
    }

    // A store that cannot report availability still gets a chance in the
    // fallback path (it tolerates empty lookups), but local-first replaces
    // remote parsing outright, so `confirmed` demands a positive report.
    private async hasLocalTermDictionaries(confirmed = false): Promise<boolean> {
        if (!this.canUseLocalDictionaryFallback()) return false;
        return await this.reportedTermDictionaryAvailability() ?? !confirmed;
    }

    private reportedTermDictionaryAvailability(): Promise<boolean | undefined> {
        const store = this.dependencies.dictionaries as YomitanDictionaryStore & {
            hasTermDictionaries?: () => Promise<boolean>;
        };
        if (typeof store.hasTermDictionaries !== 'function') return Promise.resolve(undefined);
        this.localTermDictionaryAvailability ??= store.hasTermDictionaries().catch(error => {
            this.localTermDictionaryAvailability = undefined;
            log.warn('Local term dictionary availability check failed', { error });
            return undefined;
        });
        return this.localTermDictionaryAvailability;
    }

    private parseSegmentedText(text: string): JPDBToken[] {
        return segmentJapaneseText(text).map(segment => {
            const card = this.fallbackCardFromText(segment.surface);
            return {
                card,
                start: segment.start,
                end: segment.end,
                length: segment.end - segment.start,
                rubies: [],
                pitchClass: '',
                sentence: text,
            };
        });
    }

    private withSegmentedFallbackGaps(paragraphs: string[], parsed: JPDBToken[][], options: ReaderParserParseOptions): JPDBToken[][] {
        if (options.allowSegmentedFallback !== true) return parsed;
        return parsed.map((tokens, index) => this.fillSegmentedFallbackGaps(paragraphs[index] ?? '', tokens));
    }

    private fillSegmentedFallbackGaps(text: string, tokens: JPDBToken[]): JPDBToken[] {
        const fallbackTokens = this.parseSegmentedText(text);
        const repaired = fallbackRepairTokens(text, fallbackTokens, tokens);
        const broad = tokens.filter(token => isBroadPublic(token)
            && fallbackTokens.some(fallback => tokenInsideRange(fallback, token.start, token.end)
                && (fallback.start !== token.start || fallback.end !== token.end)
                && isBoundarySegment(fallback.card.spelling)));
        const replacements = [
            ...fallbackTokens.filter(fallback => preferInflectedFallback(fallback, tokens)),
            ...fallbackTokens.filter(fallback => broad.some(token => tokenInsideRange(fallback, token.start, token.end))),
        ];
        const extras = fallbackTokens.filter(fallback => replacements.includes(fallback)
            || repaired.includes(fallback)
            || !tokens.some(token => rangesOverlap(fallback.start, fallback.end, token.start, token.end)));
        const keptTokens = extras.length
            ? tokens.filter(token => !extras.some(fallback => rangesOverlap(fallback.start, fallback.end, token.start, token.end)))
            : tokens;
        return extras.length ? [...keptTokens, ...extras].sort(compareTokensByOffset) : tokens;
    }

    // All-kanji compounds get their reading split per kanji when the user's
    // kanji dictionaries allow an exact, unambiguous alignment (琉球藍 →
    // 琉=りゅう 球=きゅう 藍=あい); otherwise the whole-word ruby stays.
    private async localRubySegments(surface: string, reading: string, start: number, end: number): Promise<JPDBToken['rubies']> {
        const whole = [{ text: reading, start, end, length: end - start }];
        const characters = [...new Set(Array.from(surface).filter(character => LOCAL_RUBY_SPLIT_KANJI_CHAR_RE.test(character)))];
        if (characters.length < 2) return whole;
        const readings = new Map<string, string[]>();
        await Promise.all(characters.map(async character => {
            readings.set(character, await this.cachedKanjiReadings(character));
        }));
        const segments = splitReadingAcrossKanji(surface, reading, kanji => readings.get(kanji) ?? []);
        if (!segments) return whole;
        return segments.map(segment => ({
            text: segment.text,
            start: start + segment.start,
            end: start + segment.end,
            length: segment.end - segment.start,
        }));
    }

    private cachedKanjiReadings(character: string): Promise<string[]> {
        const cached = this.kanjiReadingCache.get(character);
        if (cached) return cached;
        const settings = this.dependencies.getSettings();
        const lookupKanji = this.dependencies.dictionaries.lookupKanji as ((text: string, limit: number, preferences?: ReaderSettings['dictionaryPreferences']) => Promise<Array<{ onyomi: string[]; kunyomi: string[] }>>) | undefined;
        const promise = typeof lookupKanji === 'function' && settings.localDictionariesEnabled
            ? lookupKanji.call(this.dependencies.dictionaries, character, 3, settings.dictionaryPreferences)
                .then(entries => entries.flatMap(entry => [...entry.onyomi, ...entry.kunyomi]))
                .catch(() => [])
            : Promise.resolve([]);
        this.kanjiReadingCache.set(character, promise);
        if (this.kanjiReadingCache.size > 400) {
            const oldest = this.kanjiReadingCache.keys().next().value;
            if (oldest) this.kanjiReadingCache.delete(oldest);
        }
        return promise;
    }

    private async withLocallySplitKanjiRubies(paragraphs: string[], parsed: JPDBToken[][]): Promise<JPDBToken[][]> {
        if (!this.canUseLocalKanjiRubySplits()) return parsed;
        let nextParsed = parsed;
        await Promise.all(parsed.map(async (tokens, paragraphIndex) => {
            let nextTokens = tokens;
            await Promise.all(tokens.map(async (token, tokenIndex) => {
                const surface = paragraphs[paragraphIndex]?.slice(token.start, token.end) ?? '';
                const split = await this.locallySplitTokenRubies(surface, token);
                if (!split || rubiesEqual(split, token.rubies)) return;
                if (nextTokens === tokens) nextTokens = [...tokens];
                nextTokens[tokenIndex] = { ...token, rubies: split };
                this.syncCardWordWithReadingFromTokenRuby(nextTokens[tokenIndex], surface);
            }));
            if (nextTokens === tokens) return;
            if (nextParsed === parsed) nextParsed = [...parsed];
            nextParsed[paragraphIndex] = nextTokens;
        }));
        return nextParsed;
    }

    private canUseLocalKanjiRubySplits(): boolean {
        const settings = this.dependencies.getSettings();
        return settings.localDictionariesEnabled
            && typeof this.dependencies.dictionaries.lookupKanji === 'function';
    }

    private async locallySplitTokenRubies(surface: string, token: JPDBToken): Promise<JPDBToken['rubies'] | null> {
        if (!surface) return null;
        if (token.rubies.length) {
            return await this.locallySplitExistingRubies(surface, token);
        }
        const reading = token.card.reading.trim();
        if (!shouldTryLocalKanjiRubySplit(surface, reading)) return null;
        const whole = [{ text: reading, start: token.start, end: token.end, length: token.end - token.start }];
        const split = await this.enrichmentGate.run(() => this.localRubySegments(surface, reading, token.start, token.end));
        return rubiesEqual(split, whole) ? null : split;
    }

    private async locallySplitExistingRubies(surface: string, token: JPDBToken): Promise<JPDBToken['rubies'] | null> {
        let changed = false;
        const split: JPDBToken['rubies'] = [];
        for (const ruby of token.rubies) {
            const start = ruby.start - token.start;
            const end = ruby.end - token.start;
            const base = surface.slice(start, end);
            if (!shouldTryLocalKanjiRubySplit(base, ruby.text)) {
                split.push(ruby);
                continue;
            }
            const next = await this.enrichmentGate.run(() => this.localRubySegments(base, ruby.text, ruby.start, ruby.end));
            changed ||= !rubiesEqual(next, [ruby]);
            split.push(...next);
        }
        return changed ? split : null;
    }

    private syncCardWordWithReadingFromTokenRuby(token: JPDBToken, surface: string): void {
        if (!token.rubies.length || token.card.spelling !== surface) return;
        const word = Array.from(token.card.spelling);
        for (let index = token.rubies.length - 1; index >= 0; index -= 1) {
            const { text, start, length } = token.rubies[index];
            word.splice(start - token.start + length, 0, `[${text}]`);
        }
        token.card.wordWithReading = word.join('');
    }

    private async localPitchPattern(card: JPDBCard, options: ReaderParserParseOptions): Promise<string> {
        const settings = this.dependencies.getSettings();
        if (options.includeLocalPitch === false) return '';
        if (!settings.showPitchAccent || !settings.localDictionariesEnabled) return '';
        const lookupTermMeta = this.dependencies.dictionaries.lookupTermMeta as ((expression: string, limit: number, preferences?: ReaderSettings['dictionaryPreferences']) => Promise<YomitanMetaEntry[]>) | undefined;
        if (typeof lookupTermMeta !== 'function') return '';
        const key = localPitchCacheKey(card, settings);
        const cached = this.localPitchCache.get(key);
        if (cached) return cached;
        const promise = lookupTermMeta.call(this.dependencies.dictionaries, card.spelling, 12, settings.dictionaryPreferences).then(metaEntries => {
            return localPitchPatternFromMeta(card.reading, metaEntries);
        }).then(pattern => {
            // Pitch banks key rows by kanji expression (これ等) while the parsed
            // card may carry the kana form (これら) — an exact-match retry on the
            // reading recovers kana-keyed rows the spelling query misses.
            const reading = card.reading.trim();
            if (pattern || !reading || reading === card.spelling.trim()) return pattern;
            return lookupTermMeta.call(this.dependencies.dictionaries, reading, 12, settings.dictionaryPreferences)
                .then(metaEntries => localPitchPatternFromMeta(card.reading, metaEntries));
        }).catch(error => {
            log.warn('Local pitch parse failed', { term: card.spelling }, error);
            return '';
        });
        this.rememberLocalPitchCacheEntry(key, promise);
        return promise;
    }

    private withNormalizedMetricTokens(text: string, tokens: JPDBToken[]): JPDBToken[] {
        if (!text.includes('回視聴')) return tokens;
        const replacements: JPDBToken[] = [];
        const replacementRanges: Array<{ start: number; end: number }> = [];
        for (const match of text.matchAll(YOUTUBE_VIEW_METRIC_RE)) {
            const start = match.index ?? -1;
            if (start < 0) continue;
            const end = start + match[0].length;
            const overlapping = tokens.filter(token => rangesOverlap(start, end, token.start, token.end));
            const alreadyCovered = overlapping.some(token => token.start >= start + 1 && token.end <= end && token.card.spelling === '視聴');
            const hasBrokenMetricToken = overlapping.some(token => text.slice(token.start, token.end) === '回視');
            if (alreadyCovered && !hasBrokenMetricToken) continue;
            if (!hasBrokenMetricToken && overlapping.length > 0) continue;
            replacementRanges.push({ start, end });
            replacements.push(
                this.metricToken(text, '回', 'かい', start, start + 1),
                this.metricToken(text, '視聴', 'しちょう', start + 1, end),
            );
        }
        if (!replacements.length) return tokens;
        return [
            ...tokens.filter(token => !replacementRanges.some(range => rangesOverlap(range.start, range.end, token.start, token.end))),
            ...replacements,
        ].sort(compareTokensByOffset);
    }

    private withNormalizedMetricParseResult(paragraphs: string[], parsed: JPDBToken[][]): JPDBToken[][] {
        let normalized = parsed;
        for (const [index, tokens] of parsed.entries()) {
            const nextTokens = this.withNormalizedMetricTokens(paragraphs[index] ?? '', tokens);
            if (nextTokens === tokens) continue;
            if (normalized === parsed) normalized = [...parsed];
            normalized[index] = nextTokens;
        }
        return normalized;
    }

    private metricToken(sentence: string, surface: string, reading: string, start: number, end: number): JPDBToken {
        const card = this.fallbackCardFromText(surface);
        card.reading = reading;
        return {
            card,
            start,
            end,
            length: end - start,
            rubies: [{ text: reading, start, end, length: end - start }],
            pitchClass: '',
            sentence,
        };
    }

    private rememberLocalPitchCacheEntry(key: string, promise: Promise<string>): void {
        this.localPitchCache.set(key, promise);
        while (this.localPitchCache.size > LOCAL_PITCH_CACHE_LIMIT) {
            const oldest = this.localPitchCache.keys().next().value;
            if (typeof oldest !== 'string') break;
            this.localPitchCache.delete(oldest);
        }
    }
}

function remoteParseFallbackTimeoutMs(options: ReaderParserParseOptions): number {
    return (options.allowApiTimeoutFallback ?? options.allowJpdbTimeoutFallback)
        ? options.apiTimeoutMs ?? options.jpdbTimeoutMs ?? JPDB_PARSE_FALLBACK_TIMEOUT_MS
        : 0;
}

function shouldTryLocalKanjiRubySplit(base: string, reading: string): boolean {
    return Array.from(base).length >= 2
        && LOCAL_RUBY_SPLIT_BASE_RE.test(base)
        && LOCAL_RUBY_SPLIT_KANJI_RE.test(base)
        && LOCAL_RUBY_SPLIT_READING_RE.test(reading.trim());
}

function rubiesEqual(first: JPDBToken['rubies'], second: JPDBToken['rubies']): boolean {
    return first.length === second.length
        && first.every((ruby, index) => {
            const other = second[index];
            return Boolean(other)
                && ruby.text === other.text
                && ruby.start === other.start
                && ruby.end === other.end
                && ruby.length === other.length;
        });
}

function shouldUseJitenParser(settings: ReaderSettings, options: ReaderParserParseOptions, jiten: JitenApiClient | undefined): boolean {
    return Boolean(hasJitenApiCredential(settings) && jiten && !shouldSkipApiParser(options));
}

function shouldPreferJitenParser(settings: ReaderSettings, options: ReaderParserParseOptions, jiten: JitenApiClient | undefined): boolean {
    return shouldUseJitenParser(settings, options, jiten) && options.requireJpdb !== true;
}

function shouldSkipApiParser(options: ReaderParserParseOptions): boolean {
    return Boolean(options.skipApi ?? options.skipJpdb);
}

function remoteParseErrorMessage(source: 'JPDB' | 'Jiten', options: ReaderParserParseOptions, canFallback: boolean): string {
    if (shouldRequireRemoteParse(options)) return `${source}-first parse failed without local fallback`;
    return canFallback
        ? `${source} parse failed; using local or segmented fallback`
        : `${source} parse failed without fallback`;
}

function shouldRethrowRemoteParseError(options: ReaderParserParseOptions, canFallback: boolean): boolean {
    return shouldRequireRemoteParse(options) || !canFallback;
}

function shouldRequireRemoteParse(options: ReaderParserParseOptions): boolean {
    return options.requireApi === true || options.requireJpdb === true;
}

function localPitchCacheKey(card: JPDBCard, settings: ReaderSettings): string {
    return JSON.stringify({
        spelling: card.spelling,
        reading: card.reading,
        dictionaries: settings.dictionaryPreferences.map(preference => ({
            name: preference.name,
            enabled: preference.enabled,
            priority: preference.priority,
        })),
    });
}

function localParseCacheKey(text: string, options: ReaderParserParseOptions, settings: ReaderSettings): string {
    const localDictionariesEnabled = settings.localDictionariesEnabled;
    return JSON.stringify({
        text,
        localDictionariesEnabled,
        allowSegmentedFallback: options.allowSegmentedFallback === true,
        includeLocalPitch: localDictionariesEnabled && settings.showPitchAccent && options.includeLocalPitch !== false,
        dictionaries: localDictionariesEnabled ? settings.dictionaryPreferences.map(preference => ({
            name: preference.name,
            enabled: preference.enabled,
            priority: preference.priority,
        })) : [],
    });
}

export function fallbackLookupTermAtOffset(text: string, offset: number): string {
    const range = fallbackLookupRangeAtOffset(text, offset);
    if (range) return normalizeFallbackTerm(text.slice(range.start, range.end));
    return normalizeFallbackTerm(text);
}

export function fallbackLookupRangeAtOffset(text: string, offset: number): { start: number; end: number } | undefined {
    const clampedOffset = Math.max(0, Math.min(offset, Math.max(0, text.length - 1)));
    const segment = segmentJapaneseText(text).find(item => offsetInsideFallbackMatch(item.start, item.end, clampedOffset));
    if (segment) return { start: segment.start, end: segment.end };
    for (const match of text.matchAll(JAPANESE_SCRIPT_GROUP_RE)) {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        if (offsetInsideFallbackMatch(start, end, clampedOffset)) {
            return { start, end };
        }
    }
    return undefined;
}

function offsetInsideFallbackMatch(start: number, end: number, offset: number): boolean {
    return start <= offset && offset < end;
}

function rangesOverlap(start: number, end: number, otherStart: number, otherEnd: number): boolean {
    return start < otherEnd && otherStart < end;
}

function tokenInsideRange(token: JPDBToken, start: number, end: number): boolean {
    return token.start >= start && token.end <= end;
}

function preferInflectedFallback(fallback: JPDBToken, tokens: JPDBToken[]): boolean {
    if (!fallback.card.fallbackLookupTerms?.length) return false;
    const overlapping = tokens.filter(token => rangesOverlap(fallback.start, fallback.end, token.start, token.end));
    return overlapping.length === 1
        && overlapping.every(token => tokenInsideRange(token, fallback.start, fallback.end) && token.length < fallback.length);
}

function isBroadPublic(token: JPDBToken): boolean {
    return token.card.source === 'jiten'
        && !token.card.pitchAccent.length
        && !token.pitchClass;
}

function fallbackRepairTokens(text: string, fallbackTokens: JPDBToken[], tokens: JPDBToken[]): JPDBToken[] {
    const repaired = new Set<JPDBToken>();
    for (const fallback of fallbackTokens) {
        const group = fallbackRepairGroupForToken(text, fallback, fallbackTokens, tokens);
        group?.forEach(token => repaired.add(token));
    }
    return [...repaired].sort(compareTokensByOffset);
}

function fallbackRepairGroupForToken(
    text: string,
    fallback: JPDBToken,
    fallbackTokens: JPDBToken[],
    tokens: JPDBToken[],
): JPDBToken[] | null {
    if (!isCompleteFallbackRepairCandidate(fallback)) return null;
    if (!rangeHasUncoveredJapaneseText(text, fallback.start, fallback.end, tokens)) return null;
    const overlapping = tokens.filter(token => rangesOverlap(fallback.start, fallback.end, token.start, token.end));
    if (!overlapping.length) return null;
    const start = Math.min(fallback.start, ...overlapping.map(token => token.start));
    const end = Math.max(fallback.end, ...overlapping.map(token => token.end));
    if (!tokens.every(token => !rangesOverlap(start, end, token.start, token.end) || tokenInsideRange(token, start, end))) return null;
    return fallbackTokensCoveringRange(fallbackTokens, start, end);
}

function isCompleteFallbackRepairCandidate(fallback: JPDBToken): boolean {
    const surface = fallback.card.spelling;
    return Boolean(fallback.card.fallbackLookupTerms?.length)
        || (/^[\u3040-\u309fー]{3,}$/u.test(surface))
        || (/[\u3400-\u9fff々〆ヵヶ]/u.test(surface) && surface.length >= 2);
}

function rangeHasUncoveredJapaneseText(text: string, start: number, end: number, tokens: JPDBToken[]): boolean {
    for (let index = start; index < end; index += 1) {
        if (!JAPANESE_CHARACTER_RE.test(text[index] ?? '')) continue;
        if (!tokens.some(token => token.start <= index && index < token.end)) return true;
    }
    return false;
}

function fallbackTokensCoveringRange(fallbackTokens: JPDBToken[], start: number, end: number): JPDBToken[] | null {
    const group = fallbackTokens.filter(token => token.start >= start && token.end <= end);
    if (!group.length) return null;
    group.sort(compareTokensByOffset);
    if (group[0]?.start !== start || group[group.length - 1]?.end !== end) return null;
    for (let index = 1; index < group.length; index += 1) {
        if (group[index - 1]?.end !== group[index]?.start) return null;
    }
    return group;
}

function compareTokensByOffset(a: JPDBToken, b: JPDBToken): number {
    return a.start - b.start || b.length - a.length;
}

function cardCacheKey(vid: number, sid: number): string {
    return `${vid}:${sid}`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorFactory: () => Error): Promise<T> {
    let timeoutId = 0;
    const timeout = new Promise<never>((_resolve, reject) => {
        timeoutId = window.setTimeout(() => reject(errorFactory()), timeoutMs);
    });
    return Promise.race([
        promise,
        timeout,
    ]).finally(() => window.clearTimeout(timeoutId));
}
