import { JpdbClient } from './jpdb';
import { getPitchClass } from './jpdb-parser';
import { Logger } from './logger';
import { localPitchPatternFromMeta } from './popup-render';
import type { JPDBCard, JPDBToken, ReaderSettings } from './types';
import { YomitanDictionaryStore, glossaryToText, type YomitanMetaEntry, type YomitanTermEntry } from './yomitan';

const LOCAL_MATCH_LIMIT = 40;
const LOCAL_PARSE_CACHE_LIMIT = 600;
const LOCAL_PITCH_CACHE_LIMIT = 800;
const JPDB_PARSE_FALLBACK_TIMEOUT_MS = 6_000;
const JAPANESE_SCRIPT_GROUP_RE = /[\u3400-\u9fff々〆ヵヶ]+|[\u3040-\u309fー]+|[\u30a0-\u30ffー]+/gu;
const JAPANESE_TEXT_RUN_RE = /[\u3040-\u30ff\u3400-\u9fff々〆ヵヶー]+/gu;
const JAPANESE_CHARACTER_RE = /[\u3040-\u30ff\u3400-\u9fff々〆ヵヶ]/u;
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
                return result;
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
            if (tokens.length) return tokens;
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

type JapaneseTextSegment = { surface: string; start: number; end: number };
type IntlSegmentRecord = { segment: string; index: number; isWordLike?: boolean };
type IntlSegmenter = { segment(value: string): Iterable<IntlSegmentRecord> };
type IntlSegmenterConstructor = new (
    locale: string,
    options: { granularity: 'word' },
) => IntlSegmenter;
let cachedSegmenterConstructor: IntlSegmenterConstructor | null | undefined;
let cachedJapaneseWordSegmenter: IntlSegmenter | null | undefined;

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
    return mergeAdjacentKanjiSegments(Array.from(segmenter.segment(text))
        .filter(isUsefulJapaneseSegment)
        .map(segment => ({
            surface: segment.segment,
            start: offset + segment.index,
            end: offset + segment.index + segment.segment.length,
        })));
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
    return segment.isWordLike !== false
        && JAPANESE_CHARACTER_RE.test(surface);
}

function mergeAdjacentKanjiSegments(segments: JapaneseTextSegment[]): JapaneseTextSegment[] {
    const merged: JapaneseTextSegment[] = [];
    for (const segment of segments) {
        const previous = merged.at(-1);
        if (previous && previous.end === segment.start && isKanjiOnlySegment(previous.surface) && isKanjiOnlySegment(segment.surface)) {
            previous.surface += segment.surface;
            previous.end = segment.end;
            continue;
        }
        merged.push({ ...segment });
    }
    return merged;
}

function isKanjiOnlySegment(surface: string): boolean {
    return /^[\u3400-\u9fff々〆ヵヶ]+$/u.test(surface);
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
