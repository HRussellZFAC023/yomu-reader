import { JpdbClient } from './jpdb';
import { getPitchClass } from './jpdb-parser';
import { Logger } from './logger';
import { localPitchPatternFromMeta } from './popup-render';
import type { JPDBCard, JPDBToken, ReaderSettings } from './types';
import { YomitanDictionaryStore, glossaryToText, type YomitanMetaEntry, type YomitanTermEntry } from './yomitan';

const LOCAL_MATCH_LIMIT = 40;
const JPDB_PARSE_FALLBACK_TIMEOUT_MS = 6_000;
const JAPANESE_SCRIPT_GROUP_RE = /[\u3400-\u9fff々〆ヵヶ]+|[\u3040-\u309fー]+|[\u30a0-\u30ffー]+/gu;
const log = Logger.scope('ReaderParser');

export interface ReaderParserParseOptions {
    jpdbTimeoutMs?: number;
}

export interface ReaderParserDependencies {
    getSettings: () => ReaderSettings;
    jpdb: JpdbClient;
    dictionaries: YomitanDictionaryStore;
}

export class ReaderParser {
    private localCardCache = new Map<string, JPDBCard>();

    constructor(private dependencies: ReaderParserDependencies) {}

    async parse(paragraphs: string[], options: ReaderParserParseOptions = {}): Promise<JPDBToken[][]> {
        const { getSettings, jpdb } = this.dependencies;
        const settings = getSettings();
        const done = log.time('parse', {
            paragraphs: paragraphs.length,
            hasApiKey: Boolean(settings.apiKey.trim()),
            localFallback: settings.localDictionariesEnabled,
        });
        if (settings.apiKey.trim()) {
            try {
                const parsePromise = jpdb.parse(paragraphs);
                const timeoutMs = options.jpdbTimeoutMs ?? JPDB_PARSE_FALLBACK_TIMEOUT_MS;
                const result = timeoutMs > 0 && this.canUseLocalDictionaryFallback()
                    ? await withTimeout(parsePromise, timeoutMs, () => new Error('JPDB parse timed out.'))
                    : await parsePromise;
                done();
                return result;
            } catch (error) {
                if (!this.canUseLocalDictionaryFallback()) {
                    log.warn('JPDB parse failed without local fallback', error);
                    done();
                    throw error;
                }
                log.warn('JPDB parse failed; using local dictionary fallback', error);
            }
        }
        if (!this.canUseLocalDictionaryFallback()) {
            done();
            return paragraphs.map(() => []);
        }
        try {
            const result = await Promise.all(paragraphs.map(text => this.parseLocalDictionaryText(text)));
            return result;
        } finally {
            done();
        }
    }

    canParse(): boolean {
        const settings = this.dependencies.getSettings();
        return Boolean(settings.apiKey.trim()) || this.canUseLocalDictionaryFallback();
    }

    isJpdbBackedCard(card: JPDBCard): boolean {
        return (!card.source || card.source === 'jpdb') && card.vid > 0 && card.sid > 0;
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
            reading: spelling,
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

    private async parseLocalDictionaryText(text: string): Promise<JPDBToken[]> {
        const { dictionaries, getSettings } = this.dependencies;
        const settings = getSettings();
        const matches = await dictionaries.findTermMatches(text, LOCAL_MATCH_LIMIT, settings.dictionaryPreferences).catch(error => {
            log.warn('Local dictionary parse failed', { length: text.length }, error);
            return [];
        });
        return Promise.all(matches.map(async match => {
            const card = this.localCardFromEntry(match.entry);
            const pitch = await this.localPitchPattern(card);
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

    private async localPitchPattern(card: JPDBCard): Promise<string> {
        const settings = this.dependencies.getSettings();
        if (!settings.showPitchAccent || !settings.localDictionariesEnabled) return '';
        const lookupTermMeta = this.dependencies.dictionaries.lookupTermMeta as ((expression: string, limit: number, preferences?: ReaderSettings['dictionaryPreferences']) => Promise<YomitanMetaEntry[]>) | undefined;
        if (typeof lookupTermMeta !== 'function') return '';
        const metaEntries = await lookupTermMeta.call(this.dependencies.dictionaries, card.spelling, 12, settings.dictionaryPreferences).catch(error => {
            log.warn('Local pitch lookup failed while parsing text', { term: card.spelling }, error);
            return [] as YomitanMetaEntry[];
        });
        return localPitchPatternFromMeta(card.reading, metaEntries);
    }
}

export function fallbackLookupTermAtOffset(text: string, offset: number): string {
    const clampedOffset = Math.max(0, Math.min(offset, Math.max(0, text.length - 1)));
    for (const match of text.matchAll(JAPANESE_SCRIPT_GROUP_RE)) {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        if (offsetInsideFallbackMatch(start, end, clampedOffset)) {
            return normalizeFallbackTerm(match[0]);
        }
    }
    return normalizeFallbackTerm(text);
}

function offsetInsideFallbackMatch(start: number, end: number, offset: number): boolean {
    return (start <= offset && offset < end) || (start < offset && offset <= end);
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
