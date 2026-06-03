import { JpdbClient } from './jpdb';
import { deinflectJapaneseTerm, type DeinflectedTerm } from './deinflect';
import { getPitchClass } from './jpdb-parser';
import { Logger } from './logger';
import { localPitchPatternFromMeta } from './pitch-meta';
import type { JPDBCard, JPDBToken, ReaderSettings } from './types';
import { YomitanDictionaryStore, glossaryToText, type YomitanMetaEntry, type YomitanTermEntry } from './yomitan';

const LOCAL_MATCH_LIMIT = 40;
const LOCAL_PARSE_CACHE_LIMIT = 600;
const LOCAL_PITCH_CACHE_LIMIT = 800;
const JPDB_PARSE_FALLBACK_TIMEOUT_MS = 6_000;
const JAPANESE_SCRIPT_GROUP_RE = /[\u3400-\u9fff々〆ヵヶ]+|[\u3040-\u309fー]+|[\u30a0-\u30ffー]+/gu;
const JAPANESE_TEXT_RUN_RE = /[\u3040-\u30ff\u3400-\u9fff々〆ヵヶー]+/gu;
const JAPANESE_CHARACTER_RE = /[\u3040-\u30ff\u3400-\u9fff々〆ヵヶ]/u;
const FALLBACK_INFLECTION_MAX_SEGMENTS = 8;
const FALLBACK_INFLECTION_MAX_LENGTH = 18;
const FALLBACK_LOOKUP_TERM_LIMIT = 8;
const INFLECTION_BOUNDARY_SEGMENTS = new Set(['は', 'が', 'を', 'に', 'へ', 'と', 'で', 'の', 'や', 'から', 'まで', 'より', 'だけ', 'しか', 'など']);
const INFLECTION_CONTINUATION_SEGMENT_RE = /^(?:っ?た|っ?て|だ|で|ん|んで|ま|ない|なかっ|なかった|ます|まし|ました|ませ|ません|ましょう|たい|たく|しま|した|し|する|でき|出来|できる|できます|できた|できて|できない|できなかった|いる|い|いた|いて|れる|られ|せる|させる)$/u;
const HIRAGANA_SEGMENT_RE = /^[\u3040-\u309fー]+$/u;
const SINGLE_KANJI_HIRAGANA_STEM_RE = /^[\u3400-\u9fff][\u3040-\u309fー]*$/u;
const SURU_STEM_SEGMENT_RE = /[\u3400-\u9fff々〆ヵヶ\u30a0-\u30ff]/u;
const SURU_AUXILIARY_SUFFIX_RE = /^(?:し|する|した|して|します|しました|しましょう|しない|でき|出来|できる|できます|できた|できて|できない|できなかった)/u;
const log = Logger.scope('ReaderParser');

export interface ReaderParserParseOptions {
    jpdbTimeoutMs?: number;
    allowJpdbTimeoutFallback?: boolean;
    includeLocalPitch?: boolean;
    skipJpdb?: boolean;
    requireJpdb?: boolean;
    allowSegmentedFallback?: boolean;
}

export interface ReaderParserDependencies {
    getSettings: () => ReaderSettings;
    jpdb: JpdbClient;
    dictionaries: YomitanDictionaryStore;
}

export function jpdbFirstParseOptions(options: ReaderParserParseOptions = {}): ReaderParserParseOptions {
    return { requireJpdb: true, includeLocalPitch: false, ...options };
}

export class ReaderParser {
    private localCardCache = new Map<string, JPDBCard>();
    private localParseCache = new Map<string, Promise<JPDBToken[]>>();
    private localPitchCache = new Map<string, Promise<string>>();

    constructor(private dependencies: ReaderParserDependencies) {}

    async parse(paragraphs: string[], options: ReaderParserParseOptions = {}): Promise<JPDBToken[][]> {
        const { getSettings, jpdb } = this.dependencies;
        const settings = getSettings();
        const done = log.time('parse', {
            paragraphs: paragraphs.length,
            hasApiKey: Boolean(settings.apiKey.trim()),
            localFallback: settings.localDictionariesEnabled,
        });
        if (settings.apiKey.trim() && !options.skipJpdb) {
            try {
                const parsePromise = jpdb.parse(paragraphs);
                const timeoutMs = options.allowJpdbTimeoutFallback ? options.jpdbTimeoutMs ?? JPDB_PARSE_FALLBACK_TIMEOUT_MS : 0;
                const result = timeoutMs > 0
                    ? await withTimeout(parsePromise, timeoutMs, () => new Error('JPDB parse timed out.'))
                    : await parsePromise;
                done();
                return this.withSegmentedFallbackGaps(paragraphs, result, options);
            } catch (error) {
                if (options.requireJpdb) {
                    log.warn('JPDB-first parse failed without local fallback', error);
                    done();
                    throw error;
                }
                if (!this.canUseParseFallback(options)) {
                    log.warn('JPDB parse failed without fallback', error);
                    done();
                    throw error;
                }
                log.warn('JPDB parse failed; using local or segmented fallback', error);
            }
        }
        try {
            const result = await Promise.all(paragraphs.map(text => this.parseLocalOrSegmentedText(text, options)));
            return result;
        } finally {
            done();
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
    }

    localCardFromEntry(entry: YomitanTermEntry): JPDBCard {
        const id = -stableLocalId(`${entry.dictionary}\n${entry.expression}\n${entry.reading}`);
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
        const id = -stableLocalId(`fallback\n${spelling}`);
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
        const settings = getSettings();
        const matches = await dictionaries.findTermMatches(text, LOCAL_MATCH_LIMIT, settings.dictionaryPreferences).catch(error => {
            log.warn('Local dictionary parse failed', { length: text.length }, error);
            return [];
        });
        return Promise.all(matches.map(async match => {
            const card = this.localCardFromEntry(match.entry);
            const pitch = await this.localPitchPattern(card, options);
            if (pitch && !card.pitchAccent.length) card.pitchAccent = [pitch];
            const reading = !match.deinflected && card.reading && card.reading !== match.surface ? card.reading : '';
            return {
                card,
                start: match.start,
                end: match.end,
                length: match.end - match.start,
                rubies: reading ? [{ text: reading, start: match.start, end: match.end, length: match.end - match.start }] : [],
                pitchClass: pitch ? getPitchClass([pitch], card.reading) : '',
                sentence: text,
            };
        }));
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
        const replacementTokens = fallbackTokens
            .filter(fallback => shouldPreferInflectedFallbackToken(fallback, tokens));
        const keptTokens = replacementTokens.length
            ? tokens.filter(token => !replacementTokens.some(fallback => tokenInsideRange(token, fallback.start, fallback.end)))
            : tokens;
        const extraFallbackTokens = fallbackTokens
            .filter(fallback => replacementTokens.includes(fallback)
                || !keptTokens.some(token => rangesOverlap(fallback.start, fallback.end, token.start, token.end)));
        return extraFallbackTokens.length ? [...keptTokens, ...extraFallbackTokens].sort(compareTokensByOffset) : tokens;
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
        }).catch(error => {
            log.warn('Local pitch lookup failed while parsing text', { term: card.spelling }, error);
            return '';
        });
        this.rememberLocalPitchCacheEntry(key, promise);
        return promise;
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

function shouldPreferInflectedFallbackToken(fallback: JPDBToken, tokens: JPDBToken[]): boolean {
    if (!fallback.card.fallbackLookupTerms?.length) return false;
    const overlapping = tokens.filter(token => rangesOverlap(fallback.start, fallback.end, token.start, token.end));
    return overlapping.length === 1
        && overlapping.every(token => tokenInsideRange(token, fallback.start, fallback.end) && token.length < fallback.length);
}

function compareTokensByOffset(a: JPDBToken, b: JPDBToken): number {
    return a.start - b.start || b.length - a.length;
}

function normalizeFallbackTerm(text: string): string {
    return text.replace(/\s+/g, ' ').trim().slice(0, 80);
}

function stableLocalId(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) || 1;
}

function cardCacheKey(vid: number, sid: number): string {
    return `${vid}:${sid}`;
}

export type JapaneseTextSegment = { surface: string; start: number; end: number };
type IntlSegmentRecord = { segment: string; index: number; isWordLike?: boolean };
type IntlSegmenter = { segment(value: string): Iterable<IntlSegmentRecord> };
type IntlSegmenterConstructor = new (
    locale: string,
    options: { granularity: 'word' },
) => IntlSegmenter;
let cachedSegmenterConstructor: IntlSegmenterConstructor | null | undefined;
let cachedJapaneseWordSegmenter: IntlSegmenter | null | undefined;

export function fallbackJapaneseSegments(text: string): JapaneseTextSegment[] {
    return segmentJapaneseText(text);
}

function segmentJapaneseText(text: string): JapaneseTextSegment[] {
    const segmenter = japaneseWordSegmenter();
    if (!segmenter) {
        return Array.from(text.matchAll(JAPANESE_SCRIPT_GROUP_RE)).flatMap(match => {
            const start = match.index ?? 0;
            return fallbackJapaneseRunSegment(match[0], start);
        });
    }
    return Array.from(text.matchAll(JAPANESE_TEXT_RUN_RE)).flatMap(match => {
        const start = match.index ?? 0;
        return segmentJapaneseRun(match[0], start, segmenter);
    });
}

function segmentJapaneseRun(text: string, offset: number, segmenter: IntlSegmenter): JapaneseTextSegment[] {
    const segments = Array.from(segmenter.segment(text))
        .filter(isUsefulJapaneseSegment)
        .map(segment => ({
            surface: segment.segment,
            start: offset + segment.index,
            end: offset + segment.index + segment.segment.length,
        }));
    return mergeInflectedFallbackSegments(segments);
}

function mergeInflectedFallbackSegments(segments: JapaneseTextSegment[]): JapaneseTextSegment[] {
    const merged: JapaneseTextSegment[] = [];
    for (let index = 0; index < segments.length;) {
        const span = inflectedFallbackSpanAt(segments, index);
        if (span) {
            merged.push(span.segment);
            index = span.nextIndex;
            continue;
        }
        merged.push(segments[index]);
        index += 1;
    }
    return merged;
}

function inflectedFallbackSpanAt(
    segments: JapaneseTextSegment[],
    startIndex: number,
): { segment: JapaneseTextSegment; nextIndex: number } | null {
    const first = segments[startIndex];
    if (!first || isInflectionBoundarySegment(first.surface)) return null;
    let surface = '';
    let best: { segment: JapaneseTextSegment; nextIndex: number } | null = null;
    for (let index = startIndex; index < Math.min(segments.length, startIndex + FALLBACK_INFLECTION_MAX_SEGMENTS); index += 1) {
        const current = segments[index];
        if (!current || current.start !== (index === startIndex ? first.start : segments[index - 1]?.end)) break;
        if (index > startIndex && isInflectionBoundarySegment(current.surface)) break;
        if (index > startIndex && !canContinueInflectedFallbackSpan(surface, current.surface)) break;
        surface += current.surface;
        if (surface.length > FALLBACK_INFLECTION_MAX_LENGTH) break;
        const lookupTerms = fallbackLookupTermsForText(surface);
        if (index === startIndex || lookupTerms.length <= 1) continue;
        if (shouldKeepSuruAuxiliaryBoundary(segments, startIndex, surface, lookupTerms)) continue;
        best = {
            segment: { surface, start: first.start, end: current.end },
            nextIndex: index + 1,
        };
    }
    return best;
}

function isInflectionBoundarySegment(surface: string): boolean {
    return INFLECTION_BOUNDARY_SEGMENTS.has(surface);
}

function isInflectionContinuationSegment(surface: string): boolean {
    return INFLECTION_CONTINUATION_SEGMENT_RE.test(surface);
}

function canContinueInflectedFallbackSpan(currentSurface: string, nextSurface: string): boolean {
    return isInflectionContinuationSegment(nextSurface)
        || (HIRAGANA_SEGMENT_RE.test(nextSurface) && SINGLE_KANJI_HIRAGANA_STEM_RE.test(currentSurface));
}

function shouldKeepSuruAuxiliaryBoundary(
    segments: JapaneseTextSegment[],
    startIndex: number,
    surface: string,
    lookupTerms: string[],
): boolean {
    const first = segments[startIndex]?.surface ?? '';
    if (!first || !SURU_STEM_SEGMENT_RE.test(first)) return false;
    const suffix = surface.slice(first.length);
    return SURU_AUXILIARY_SUFFIX_RE.test(suffix)
        && lookupTerms.some(term => term.endsWith('する'));
}

function japaneseWordSegmenter(): IntlSegmenter | null {
    const Segmenter = intlSegmenter();
    if (!Segmenter) {
        cachedSegmenterConstructor = null;
        cachedJapaneseWordSegmenter = null;
        return null;
    }
    if (cachedSegmenterConstructor !== Segmenter) {
        cachedSegmenterConstructor = Segmenter;
        cachedJapaneseWordSegmenter = new Segmenter('ja', { granularity: 'word' });
    }
    return cachedJapaneseWordSegmenter ?? null;
}

function isUsefulJapaneseSegment(segment: IntlSegmentRecord): boolean {
    const surface = segment.segment.trim();
    return JAPANESE_CHARACTER_RE.test(surface);
}

function intlSegmenter(): IntlSegmenterConstructor | null {
    const candidate = (Intl as unknown as { Segmenter?: IntlSegmenterConstructor }).Segmenter;
    return typeof candidate === 'function' ? candidate : null;
}

function fallbackJapaneseRunSegment(text: string, offset: number): JapaneseTextSegment[] {
    const surface = text.trim();
    if (!surface || !JAPANESE_CHARACTER_RE.test(surface)) return [];
    const start = offset + text.indexOf(surface);
    return [{ surface, start, end: start + surface.length }];
}

export function fallbackLookupTermsForText(text: string): string[] {
    const source = normalizeFallbackTerm(text);
    if (!source) return [];
    const terms = deinflectJapaneseTerm(source)
        .filter(isUsefulFallbackLookupCandidate)
        .sort(compareFallbackLookupCandidates)
        .map(candidate => normalizeFallbackTerm(candidate.term))
        .filter(Boolean);
    return uniqueStrings([source, ...terms]).slice(0, FALLBACK_LOOKUP_TERM_LIMIT);
}

export function fallbackLookupTermsForCard(card: JPDBCard): string[] {
    return uniqueStrings([card.spelling, ...(card.fallbackLookupTerms ?? [])]
        .map(normalizeFallbackTerm)
        .filter(Boolean));
}

function isUsefulFallbackLookupCandidate(candidate: DeinflectedTerm): boolean {
    return candidate.depth > 0
        && JAPANESE_CHARACTER_RE.test(candidate.term)
        && candidate.term.length > 1;
}

function compareFallbackLookupCandidates(a: DeinflectedTerm, b: DeinflectedTerm): number {
    return a.depth - b.depth
        || fallbackRulePriority(a) - fallbackRulePriority(b)
        || b.term.length - a.term.length
        || a.term.localeCompare(b.term);
}

function fallbackRulePriority(candidate: DeinflectedTerm): number {
    if (candidate.rules.some(rule => rule === 'vs' || rule === 'vs-s' || rule === 'suru' || rule === 'vk' || rule === 'kuru')) return 0;
    if (candidate.rules.some(rule => rule === 'v1')) return 1;
    if (candidate.rules.some(rule => rule.startsWith('v5') || rule === 'v5')) return 1;
    if (candidate.rules.some(rule => rule === 'adj-i' || rule === 'i-adj')) return 2;
    return 3;
}

function uniqueStrings(values: string[]): string[] {
    const seen = new Set<string>();
    return values.filter(value => {
        if (seen.has(value)) return false;
        seen.add(value);
        return true;
    });
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
