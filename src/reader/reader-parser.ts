import { JpdbClient } from './jpdb';
import { Logger } from './logger';
import type { JPDBCard, JPDBToken, ReaderSettings } from './types';
import { YomitanDictionaryStore, glossaryToText, type YomitanTermEntry } from './yomitan';

const LOCAL_MATCH_LIMIT = 40;
const log = Logger.scope('ReaderParser');

export interface ReaderParserDependencies {
    getSettings: () => ReaderSettings;
    jpdb: JpdbClient;
    dictionaries: YomitanDictionaryStore;
}

export class ReaderParser {
    private localCardCache = new Map<string, JPDBCard>();

    constructor(private dependencies: ReaderParserDependencies) {}

    async parse(paragraphs: string[]): Promise<JPDBToken[][]> {
        const { getSettings, jpdb } = this.dependencies;
        const settings = getSettings();
        const done = log.time('parse', {
            paragraphs: paragraphs.length,
            hasApiKey: Boolean(settings.apiKey.trim()),
            localFallback: settings.localDictionariesEnabled,
        });
        if (settings.apiKey.trim()) {
            try {
                const result = await jpdb.parse(paragraphs);
                log.debug('Parsed with JPDB', {
                    paragraphs: result.length,
                    tokens: result.reduce((sum, tokens) => sum + tokens.length, 0),
                });
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
            log.debug('Parsing skipped; no JPDB key or local fallback');
            done();
            return paragraphs.map(() => []);
        }
        try {
            const result = await Promise.all(paragraphs.map(text => this.parseLocalDictionaryText(text)));
            log.debug('Parsed with local dictionary fallback', {
                paragraphs: result.length,
                tokens: result.reduce((sum, tokens) => sum + tokens.length, 0),
            });
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
        return card.source !== 'local' && card.vid > 0 && card.sid > 0 && Boolean(this.dependencies.getSettings().apiKey.trim());
    }

    getCachedCard(vid: number, sid: number): JPDBCard | undefined {
        return this.dependencies.jpdb.getCard(vid, sid) ?? this.localCardCache.get(cardCacheKey(vid, sid));
    }

    localCardFromEntry(entry: YomitanTermEntry): JPDBCard {
        const id = -stableLocalId(`${entry.dictionary}\n${entry.expression}\n${entry.reading}`);
        const card: JPDBCard = {
            vid: id,
            sid: id,
            rid: 0,
            spelling: entry.expression,
            reading: entry.reading || entry.expression,
            frequencyRank: null,
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
        return matches.map(match => {
            const card = this.localCardFromEntry(match.entry);
            const reading = !match.deinflected && card.reading && card.reading !== match.surface ? card.reading : '';
            return {
                card,
                start: match.start,
                end: match.end,
                length: match.end - match.start,
                rubies: reading ? [{ text: reading, start: match.start, end: match.end, length: match.end - match.start }] : [],
                pitchClass: '',
                sentence: text,
            };
        });
    }
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
