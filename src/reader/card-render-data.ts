import { canUseMobileAnkiHandoff, type AnkiConnectClient, type AnkiLookupResult } from './anki';
import { cardKey } from './card-utils';
import type { JpdbClient } from './jpdb';
import type { JpdbPublicPitchClient } from './jpdb-public-pitch';
import type { JpdbVocabularyClient, JpdbVocabularyInfo } from './jpdb-vocabulary';
import { Logger } from './logger';
import type { JPDBCard, JPDBDeck, ReaderSettings } from './types';
import type { YomitanDictionaryStore, YomitanKanjiEntry, YomitanMetaEntry, YomitanTermEntry } from './yomitan';

const log = Logger.scope('CardRenderData');
const CARD_RENDER_DATA_CACHE_TTL_MS = 30_000;
const CARD_RENDER_DETAIL_TIMEOUT_MS = 9_000;

export interface CardRenderData {
    localEntries: YomitanTermEntry[];
    kanjiEntries: YomitanKanjiEntry[];
    metaEntries: YomitanMetaEntry[];
    ankiLookup: AnkiLookupResult;
    jpdbDecks: JPDBDeck[];
    ankiDecks: string[];
    jpdbVocabularyInfo: JpdbVocabularyInfo | null;
}

export interface CardRenderDataLoad {
    localEntries: Promise<YomitanTermEntry[]>;
    all: Promise<CardRenderData>;
}

export interface CardRenderDataLoaderDependencies {
    getSettings: () => ReaderSettings;
    dictionaries: YomitanDictionaryStore;
    jpdbPublicPitch: JpdbPublicPitchClient;
    jpdbVocabulary: JpdbVocabularyClient;
    anki: AnkiConnectClient;
    jpdb: JpdbClient;
    isJpdbBackedCard: (card: JPDBCard) => boolean;
}

export function loadingCardRenderData(localEntries: YomitanTermEntry[], ankiLookup: AnkiLookupResult): CardRenderData & { loading: boolean } {
    return {
        localEntries,
        kanjiEntries: [],
        metaEntries: [],
        ankiLookup,
        jpdbDecks: [],
        ankiDecks: [],
        jpdbVocabularyInfo: null,
        loading: true,
    };
}

export class CardRenderDataLoader {
    private cache = new Map<string, { expiresAt: number; load: CardRenderDataLoad }>();

    constructor(private readonly dependencies: CardRenderDataLoaderDependencies) {}

    clear(): void {
        this.cache.clear();
    }

    load(card: JPDBCard): CardRenderDataLoad {
        const key = this.cacheKey(card);
        const now = Date.now();
        const cached = this.cache.get(key);
        if (cached && cached.expiresAt > now) return cached.load;

        const load = this.fetch(card);
        void load.all.catch(() => {
            if (this.cache.get(key)?.load === load) this.cache.delete(key);
        });
        this.cache.set(key, { expiresAt: now + CARD_RENDER_DATA_CACHE_TTL_MS, load });
        return load;
    }

    private fetch(card: JPDBCard): CardRenderDataLoad {
        const timeoutMs = this.detailTimeoutMs();
        const localEntries = this.loadLocalTermEntries(card, timeoutMs);
        const all = this.loadAll(card, timeoutMs, localEntries);
        return { localEntries, all };
    }

    private detailTimeoutMs(): number {
        return Math.max(CARD_RENDER_DETAIL_TIMEOUT_MS, this.settings().audioTimeoutMs + 1_000);
    }

    private withFallback<T>(card: JPDBCard, timeoutMs: number, detail: string, promise: Promise<T>, fallback: T): Promise<T> {
        return cardRenderDetailWithFallback(detail, card, promise, fallback, timeoutMs);
    }

    private loadLocalTermEntries(card: JPDBCard, timeoutMs: number): Promise<YomitanTermEntry[]> {
        const settings = this.settings();
        if (!settings.localDictionariesEnabled) return Promise.resolve([]);
        return this.withFallback(card, timeoutMs, 'local term dictionary', this.dependencies.dictionaries.lookup(card.spelling, card.reading, settings.localDictionaryMaxResults, settings.dictionaryPreferences).catch(error => {
            log.warn('Local term lookup failed while rendering card', { term: card.spelling }, error);
            return [];
        }), [] as YomitanTermEntry[]);
    }

    private loadLocalKanjiEntries(card: JPDBCard, timeoutMs: number): Promise<YomitanKanjiEntry[]> {
        const settings = this.settings();
        if (!settings.localDictionariesEnabled || !settings.localDictionaryShowKanji) return Promise.resolve([]);
        return this.withFallback(card, timeoutMs, 'local kanji dictionary', this.dependencies.dictionaries.lookupKanji(card.spelling, settings.localDictionaryMaxResults, settings.dictionaryPreferences).catch(error => {
            log.warn('Local kanji lookup failed while rendering card', { term: card.spelling }, error);
            return [];
        }), [] as YomitanKanjiEntry[]);
    }

    private loadLocalMetaEntries(card: JPDBCard, timeoutMs: number): Promise<YomitanMetaEntry[]> {
        const settings = this.settings();
        if (!settings.localDictionariesEnabled) return Promise.resolve([]);
        return this.withFallback(card, timeoutMs, 'local metadata dictionary', this.dependencies.dictionaries.lookupTermMeta(card.spelling, 12, settings.dictionaryPreferences).catch(error => {
            log.warn('Local metadata lookup failed while rendering card', { term: card.spelling }, error);
            return [];
        }), [] as YomitanMetaEntry[]);
    }

    private loadPublicPitch(card: JPDBCard, timeoutMs: number): Promise<string[]> {
        const settings = this.settings();
        if (!settings.showPitchAccent || card.pitchAccent.length) return Promise.resolve([]);
        return this.withFallback(card, timeoutMs, 'JPDB public pitch', this.dependencies.jpdbPublicPitch.lookup(card.spelling, card.reading).catch(error => {
            log.warn('Public JPDB pitch lookup failed while rendering card', { term: card.spelling }, error);
            return [];
        }), [] as string[]);
    }

    private loadJpdbVocabularyInfo(card: JPDBCard, timeoutMs: number): Promise<JpdbVocabularyInfo | null> {
        const settings = this.settings();
        if (!settings.jpdbDefinitionsEnabled) return Promise.resolve(null);
        return this.withFallback(card, timeoutMs, 'JPDB vocabulary details', this.dependencies.jpdbVocabulary.lookup(card.vid, card.spelling, card.reading).catch(error => {
            log.warn('JPDB vocabulary page lookup failed while rendering card', { term: card.spelling }, error);
            return null;
        }), null as JpdbVocabularyInfo | null);
    }

    private loadAnkiLookup(card: JPDBCard, timeoutMs: number): Promise<AnkiLookupResult> {
        const fallback: AnkiLookupResult = { state: 'not-in-deck', notes: [], primary: null };
        if (!this.settings().ankiEnabled || canUseMobileAnkiHandoff(this.settings())) return Promise.resolve(fallback);
        return this.withFallback(card, timeoutMs, 'Anki existing cards', this.dependencies.anki.findExistingCards(card).catch(error => {
            log.warn('Anki lookup failed while rendering card', { term: card.spelling }, error);
            return fallback;
        }), fallback);
    }

    private loadJpdbDecks(card: JPDBCard, timeoutMs: number): Promise<JPDBDeck[]> {
        const settings = this.settings();
        if (!settings.jpdbMiningEnabled || !settings.apiKey.trim() || !this.dependencies.isJpdbBackedCard(card)) return Promise.resolve([]);
        return this.withFallback(card, timeoutMs, 'JPDB deck list', this.dependencies.jpdb.listDecks().catch(error => {
            log.warn('JPDB deck list failed while rendering card', { term: card.spelling }, error);
            return [];
        }), [] as JPDBDeck[]);
    }

    private loadAnkiDecks(card: JPDBCard, timeoutMs: number): Promise<string[]> {
        if (!this.settings().ankiEnabled || canUseMobileAnkiHandoff(this.settings())) return Promise.resolve([]);
        return this.withFallback(card, timeoutMs, 'Anki deck list', this.dependencies.anki.deckNames().catch(error => {
            log.warn('Anki deck list failed while rendering card', { term: card.spelling }, error);
            return [];
        }), [] as string[]);
    }

    private loadAll(card: JPDBCard, timeoutMs: number, localEntries: Promise<YomitanTermEntry[]>): Promise<CardRenderData> {
        return Promise.all([
            localEntries,
            this.loadLocalKanjiEntries(card, timeoutMs),
            this.loadLocalMetaEntries(card, timeoutMs),
            this.loadPublicPitch(card, timeoutMs),
            this.loadAnkiLookup(card, timeoutMs),
            this.loadJpdbDecks(card, timeoutMs),
            this.loadAnkiDecks(card, timeoutMs),
            this.loadJpdbVocabularyInfo(card, timeoutMs),
        ]).then(([localEntriesValue, kanjiEntries, metaEntries, jpdbPublicPitch, ankiLookup, jpdbDecks, ankiDecks, jpdbVocabularyInfo]) => {
            if (!card.pitchAccent.length && jpdbPublicPitch.length) card.pitchAccent = jpdbPublicPitch;
            return { localEntries: localEntriesValue, kanjiEntries, metaEntries, ankiLookup, jpdbDecks, ankiDecks, jpdbVocabularyInfo };
        });
    }

    private cacheKey(card: JPDBCard): string {
        const settings = this.settings();
        return JSON.stringify({
            card: cardKey(card),
            local: settings.localDictionariesEnabled,
            kanji: settings.localDictionaryShowKanji,
            max: settings.localDictionaryMaxResults,
            pitch: settings.showPitchAccent,
            anki: settings.ankiEnabled,
            dictionaries: settings.dictionaryPreferences.map(preference => ({
                name: preference.name,
                enabled: preference.enabled,
                priority: preference.priority,
            })),
        });
    }

    private settings(): ReaderSettings {
        return this.dependencies.getSettings();
    }
}

function cardRenderDetailWithFallback<T>(detail: string, card: JPDBCard, promise: Promise<T>, fallback: T, timeoutMs: number): Promise<T> {
    return Promise.race([
        promise,
        delay(timeoutMs).then(() => {
            log.debug(`${detail} timed out while rendering card`, { term: card.spelling, timeoutMs });
            return fallback;
        }),
    ]);
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, ms));
}
