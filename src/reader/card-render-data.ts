import { ankiLookupWithUnavailableDetails, type AnkiConnectClient, type AnkiExistingNote, type AnkiLookupResult } from './anki';
import { normalizeCardStates, primaryCardState } from './card-state';
import { cardKey } from './card-utils';
import type { JpdbClient } from './jpdb';
import type { JpdbPublicPitchClient } from './jpdb-public-pitch';
import type { JpdbVocabularyClient, JpdbVocabularyInfo } from './jpdb-vocabulary';
import { Logger } from './logger';
import { localPitchPatternFromMeta } from './pitch-meta';
import { shouldLookupAnkiStatus } from './settings';
import type { JPDBCard, JPDBDeck, ReaderSettings } from './types';
import type { YomitanDictionaryStore, YomitanKanjiEntry, YomitanMetaEntry, YomitanTermEntry } from './yomitan';

const log = Logger.scope('CardRenderData');
const CARD_RENDER_DATA_CACHE_TTL_MS = 30_000;
const CARD_RENDER_DATA_CACHE_LIMIT = 120;
const CARD_RENDER_LOCAL_TIMEOUT_MS = 2_500;
const CARD_RENDER_JPDB_DETAIL_TIMEOUT_MS = 4_000;
const CARD_RENDER_ANKI_TIMEOUT_MS = 4_000;
const CARD_RENDER_DECK_TIMEOUT_MS = 1_500;
const CARD_RENDER_DECK_POOL_TIMEOUT_MS = 4_000;
const CARD_RENDER_PITCH_TIMEOUT_MS = 6_500;
const CARD_RENDER_LOCAL_PITCH_GRACE_MS = 120;
const CARD_RENDER_SHARED_DECK_CACHE_TTL_MS = 5 * 60 * 1000;

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
    localMetaEntries?: Promise<YomitanMetaEntry[]>;
    pitchAccent?: Promise<string[]>;
    ankiLookup?: Promise<AnkiLookupResult>;
    hydrateAnkiLookup?: () => Promise<AnkiLookupResult>;
    jpdbVocabularyInfo?: Promise<JpdbVocabularyInfo | null>;
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

export function loadingCardRenderData(
    localEntries: YomitanTermEntry[],
    ankiLookup: AnkiLookupResult,
    metaEntries: YomitanMetaEntry[] = [],
    jpdbVocabularyInfo: JpdbVocabularyInfo | null = null,
): CardRenderData & { loading: boolean } {
    return {
        localEntries,
        kanjiEntries: [],
        metaEntries,
        ankiLookup,
        jpdbDecks: [],
        ankiDecks: [],
        jpdbVocabularyInfo,
        loading: true,
    };
}

export class CardRenderDataLoader {
    private cache = new Map<string, { expiresAt: number; load: CardRenderDataLoad }>();
    private jpdbDecksCache?: { key: string; expiresAt: number; promise: Promise<JPDBDeck[]> };
    private ankiDecksCache?: { key: string; expiresAt: number; promise: Promise<string[]> };

    constructor(private readonly dependencies: CardRenderDataLoaderDependencies) {}

    clear(): void {
        this.cache.clear();
        this.jpdbDecksCache = undefined;
        this.ankiDecksCache = undefined;
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
        pruneExpiringMap(this.cache, now, CARD_RENDER_DATA_CACHE_LIMIT);
        return load;
    }

    private fetch(card: JPDBCard): CardRenderDataLoad {
        const localEntries = this.loadLocalTermEntries(card);
        const localMetaEntries = this.loadLocalMetaEntries(card).then(metaEntries => {
            this.applyLocalPitchAccent(card, metaEntries);
            return metaEntries;
        });
        const pitchAccent = this.loadPublicPitchAfterLocalPitchGrace(card, localMetaEntries).then(publicPitch => {
            if (!card.pitchAccent.length && publicPitch.length) card.pitchAccent = publicPitch;
            return publicPitch;
        });
        const fastAnkiLookup = this.loadFastAnkiLookup(card);
        let detailedAnkiLookup: Promise<AnkiLookupResult> | undefined;
        const hydrateAnkiLookup = () => {
            detailedAnkiLookup ??= this.loadDetailedAnkiLookup(card, fastAnkiLookup);
            return detailedAnkiLookup;
        };
        const jpdbDeckMembership = this.loadJpdbDeckMembership(card);
        const jpdbVocabularyInfo = this.loadJpdbVocabularyInfo(card);
        void pitchAccent.catch(() => undefined);
        void jpdbDeckMembership.catch(() => undefined);
        const all = this.loadAll(card, localEntries, localMetaEntries, fastAnkiLookup, jpdbDeckMembership, jpdbVocabularyInfo);
        return { localEntries, localMetaEntries, pitchAccent, ankiLookup: fastAnkiLookup, hydrateAnkiLookup, jpdbVocabularyInfo, all };
    }

    private withFallback<T>(card: JPDBCard, timeoutMs: number, detail: string, promise: Promise<T>, fallback: T): Promise<T> {
        return cardRenderDetailWithFallback(detail, card, promise, fallback, timeoutMs);
    }

    private loadLocalTermEntries(card: JPDBCard): Promise<YomitanTermEntry[]> {
        const settings = this.settings();
        if (!settings.localDictionariesEnabled) return Promise.resolve([]);
        return this.withFallback(card, CARD_RENDER_LOCAL_TIMEOUT_MS, 'local term dictionary', this.dependencies.dictionaries.lookup(card.spelling, card.reading, settings.localDictionaryMaxResults, settings.dictionaryPreferences).catch(error => {
            log.warn('Local term lookup failed while rendering card', { term: card.spelling }, error);
            return [];
        }), [] as YomitanTermEntry[]);
    }

    private loadLocalKanjiEntries(card: JPDBCard): Promise<YomitanKanjiEntry[]> {
        const settings = this.settings();
        if (!settings.localDictionariesEnabled || !settings.localDictionaryShowKanji) return Promise.resolve([]);
        return this.withFallback(card, CARD_RENDER_LOCAL_TIMEOUT_MS, 'local kanji dictionary', this.dependencies.dictionaries.lookupKanji(card.spelling, settings.localDictionaryMaxResults, settings.dictionaryPreferences).catch(error => {
            log.warn('Local kanji lookup failed while rendering card', { term: card.spelling }, error);
            return [];
        }), [] as YomitanKanjiEntry[]);
    }

    private loadLocalMetaEntries(card: JPDBCard): Promise<YomitanMetaEntry[]> {
        const settings = this.settings();
        if (!settings.localDictionariesEnabled) return Promise.resolve([]);
        return this.withFallback(card, CARD_RENDER_LOCAL_TIMEOUT_MS, 'local metadata dictionary', this.dependencies.dictionaries.lookupTermMeta(card.spelling, 12, settings.dictionaryPreferences).catch(error => {
            log.warn('Local metadata lookup failed while rendering card', { term: card.spelling }, error);
            return [];
        }), [] as YomitanMetaEntry[]);
    }

    private loadPublicPitch(card: JPDBCard): Promise<string[]> {
        const settings = this.settings();
        if (!settings.showPitchAccent || card.pitchAccent.length) return Promise.resolve([]);
        return this.withFallback(card, CARD_RENDER_PITCH_TIMEOUT_MS, 'JPDB public pitch', this.dependencies.jpdbPublicPitch.lookup(card.spelling, card.reading).catch(error => {
            log.warn('Public JPDB pitch lookup failed while rendering card', { term: card.spelling }, error);
            return [];
        }), [] as string[]);
    }

    private async loadPublicPitchAfterLocalPitchGrace(card: JPDBCard, localMetaEntries: Promise<YomitanMetaEntry[]>): Promise<string[]> {
        await Promise.race([localMetaEntries, delay(CARD_RENDER_LOCAL_PITCH_GRACE_MS)]);
        return this.loadPublicPitch(card);
    }

    private loadJpdbVocabularyInfo(card: JPDBCard): Promise<JpdbVocabularyInfo | null> {
        const settings = this.settings();
        if (!settings.jpdbDefinitionsEnabled) return Promise.resolve(null);
        return this.withFallback(card, CARD_RENDER_JPDB_DETAIL_TIMEOUT_MS, 'JPDB vocabulary details', this.dependencies.jpdbVocabulary.lookup(card.vid, card.spelling, card.reading).catch(error => {
            log.warn('JPDB vocabulary page lookup failed while rendering card', { term: card.spelling }, error);
            return null;
        }), null as JpdbVocabularyInfo | null);
    }

    private loadFastAnkiLookup(card: JPDBCard): Promise<AnkiLookupResult> {
        const fallback = ankiLookupFromSourceCard(card) ?? emptyAnkiLookupResult();
        if (!shouldLookupAnkiStatus(this.settings())) return Promise.resolve(fallback);
        if (typeof this.dependencies.anki.findCachedStatusBatch !== 'function') return Promise.resolve(fallback);
        return this.dependencies.anki.findCachedStatusBatch([card])
            .then(([lookup]) => lookup ?? fallback)
            .catch(error => {
                log.warn('Cached Anki status lookup failed while rendering card', { term: card.spelling }, error);
                return fallback;
            });
    }

    private loadDetailedAnkiLookup(card: JPDBCard, fastLookup: Promise<AnkiLookupResult>): Promise<AnkiLookupResult> {
        if (!shouldLookupAnkiStatus(this.settings())) return fastLookup;
        return fastLookup.then(fallback => this.withFallback(card, CARD_RENDER_ANKI_TIMEOUT_MS, 'Anki existing cards', this.loadAnkiLookupWhenAvailable(card, fallback).catch(error => {
            log.warn('Anki lookup failed while rendering card', { term: card.spelling }, error);
            return ankiLookupWithUnavailableDetails(fallback);
        }), ankiLookupWithUnavailableDetails(fallback)));
    }

    private async loadAnkiLookupWhenAvailable(card: JPDBCard, fallback: AnkiLookupResult): Promise<AnkiLookupResult> {
        if (typeof this.dependencies.anki.isAvailableForBackground === 'function'
            && !await this.dependencies.anki.isAvailableForBackground()) {
            return ankiLookupWithUnavailableDetails(fallback);
        }
        const lookup = await this.dependencies.anki.findExistingCards(card);
        const resolved = lookup.primary || lookup.trusted !== false ? lookup : fallback;
        return ankiLookupWithUnavailableDetails(resolved);
    }

    private loadJpdbDecks(card: JPDBCard): Promise<JPDBDeck[]> {
        const settings = this.settings();
        if (!settings.jpdbMiningEnabled || !settings.apiKey.trim() || !this.dependencies.isJpdbBackedCard(card)) return Promise.resolve([]);
        return this.withFallback(card, CARD_RENDER_DECK_TIMEOUT_MS, 'JPDB deck list', this.cachedJpdbDecks(settings).catch(error => {
            log.warn('JPDB deck list failed while rendering card', { term: card.spelling }, error);
            return [];
        }), [] as JPDBDeck[]);
    }

    private loadAnkiDecks(card: JPDBCard): Promise<string[]> {
        if (!this.settings().ankiEnabled) return Promise.resolve([]);
        return this.withFallback(card, CARD_RENDER_DECK_TIMEOUT_MS, 'Anki deck list', this.cachedAnkiDecks(this.settings()).catch(error => {
            log.warn('Anki deck list failed while rendering card', { term: card.spelling }, error);
            return [];
        }), [] as string[]);
    }

    private loadJpdbDeckMembership(card: JPDBCard): Promise<boolean> {
        const settings = this.settings();
        if (!normalizeCardStates(card.cardState).includes('not-in-deck')) return Promise.resolve(false);
        if (!settings.jpdbMiningEnabled || !settings.apiKey.trim() || !this.dependencies.isJpdbBackedCard(card)) return Promise.resolve(false);
        const isInUserDeckPool = this.dependencies.jpdb.isInUserDeckPool?.bind(this.dependencies.jpdb);
        if (typeof isInUserDeckPool !== 'function') return Promise.resolve(false);
        return this.withFallback(card, CARD_RENDER_DECK_POOL_TIMEOUT_MS, 'JPDB pooled deck membership', isInUserDeckPool(card).catch(error => {
            log.warn('JPDB pooled deck membership failed while rendering card', { term: card.spelling }, error);
            return false;
        }), false);
    }

    private loadAll(
        card: JPDBCard,
        localEntries: Promise<YomitanTermEntry[]>,
        localMetaEntries: Promise<YomitanMetaEntry[]>,
        ankiLookup: Promise<AnkiLookupResult>,
        jpdbDeckMembership: Promise<boolean>,
        jpdbVocabularyInfo: Promise<JpdbVocabularyInfo | null>,
    ): Promise<CardRenderData> {
        const ankiDecks = ankiLookup.then(lookup => lookup.primary ? [] : this.loadAnkiDecks(card));
        return Promise.all([
            localEntries,
            this.loadLocalKanjiEntries(card),
            localMetaEntries,
            ankiLookup,
            this.loadJpdbDecks(card),
            ankiDecks,
            jpdbDeckMembership,
            jpdbVocabularyInfo,
        ]).then(([localEntriesValue, kanjiEntries, metaEntries, ankiLookup, jpdbDecks, ankiDecks, jpdbDeckMembership, jpdbVocabularyInfo]) => {
            if (jpdbDeckMembership) this.applyPooledJpdbDeckState(card);
            return { localEntries: localEntriesValue, kanjiEntries, metaEntries, ankiLookup, jpdbDecks, ankiDecks, jpdbVocabularyInfo };
        });
    }

    private applyLocalPitchAccent(card: JPDBCard, metaEntries: YomitanMetaEntry[]): void {
        if (card.pitchAccent.length) return;
        const pitch = localPitchPatternFromMeta(card.reading, metaEntries);
        if (pitch) card.pitchAccent = [pitch];
    }

    private applyPooledJpdbDeckState(card: JPDBCard): void {
        const states = normalizeCardStates(card.cardState).filter(state => state !== 'not-in-deck');
        card.cardState = states.length ? states : ['in-deck'];
    }

    private cachedJpdbDecks(settings: ReaderSettings): Promise<JPDBDeck[]> {
        const key = `jpdb:${settings.apiKey.trim()}`;
        const now = Date.now();
        if (this.jpdbDecksCache?.key === key && this.jpdbDecksCache.expiresAt > now) return this.jpdbDecksCache.promise;
        const promise = this.dependencies.jpdb.listDecks().catch(error => {
            if (this.jpdbDecksCache?.promise === promise) this.jpdbDecksCache = undefined;
            throw error;
        });
        this.jpdbDecksCache = { key, expiresAt: now + CARD_RENDER_SHARED_DECK_CACHE_TTL_MS, promise };
        return promise;
    }

    private cachedAnkiDecks(settings: ReaderSettings): Promise<string[]> {
        const key = `anki:${settings.ankiConnectUrl}`;
        const now = Date.now();
        if (this.ankiDecksCache?.key === key && this.ankiDecksCache.expiresAt > now) return this.ankiDecksCache.promise;
        const promise = this.dependencies.anki.deckNames().catch(error => {
            if (this.ankiDecksCache?.promise === promise) this.ankiDecksCache = undefined;
            throw error;
        });
        this.ankiDecksCache = { key, expiresAt: now + CARD_RENDER_SHARED_DECK_CACHE_TTL_MS, promise };
        return promise;
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
            ankiSection: settings.ankiSectionEnabled,
            ankiStatus: shouldLookupAnkiStatus(settings),
            ankiConnectUrl: settings.ankiConnectUrl,
            ankiMobileHandoff: settings.ankiMobileHandoff,
            jpdbDefinitions: settings.jpdbDefinitionsEnabled,
            jpdbMining: settings.jpdbMiningEnabled,
            hasApiKey: Boolean(settings.apiKey.trim()),
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

function emptyAnkiLookupResult(): AnkiLookupResult {
    return { state: 'not-in-deck', notes: [], primary: null };
}

function ankiLookupFromSourceCard(card: JPDBCard): AnkiLookupResult | null {
    if (card.source !== 'anki' && card.reviewSource !== 'anki') return null;
    const primaryCardId = Number(card.ankiCardId ?? card.rid);
    if (!Number.isFinite(primaryCardId) || primaryCardId <= 0) return null;
    const state = primaryCardState(normalizeCardStates(card.cardState));
    const noteId = Number(card.ankiNoteId ?? 0);
    const renderedCards = card.ankiRenderedCards?.length
        ? card.ankiRenderedCards
        : [{
            cardId: primaryCardId,
            deckName: card.ankiDeckNames?.[0] ?? '',
            question: card.spelling,
            answer: ankiFieldsFromSourceCard(card).Meaning,
        }];
    const note: AnkiExistingNote = {
        noteId: Number.isFinite(noteId) ? noteId : 0,
        modelName: card.ankiModelName ?? '',
        deckNames: card.ankiDeckNames ?? [],
        cardIds: [primaryCardId],
        primaryCardId,
        state,
        fields: ankiFieldsFromSourceCard(card),
        renderedCards,
        tags: [],
        reps: card.ankiReps ?? 0,
        lapses: card.ankiLapses ?? 0,
    };
    return {
        state,
        notes: [note],
        primary: note,
    };
}

function ankiFieldsFromSourceCard(card: JPDBCard): Record<string, string> {
    return {
        Expression: card.spelling,
        Reading: card.reading,
        Meaning: card.meanings.flatMap(meaning => meaning.glosses).join('; '),
        Sentence: card.sentence ?? '',
    };
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

function pruneExpiringMap<T>(cache: Map<string, { expiresAt: number; load: T }>, now: number, limit: number): void {
    for (const [key, value] of cache) {
        if (value.expiresAt <= now) cache.delete(key);
    }
    while (cache.size > limit) {
        const oldest = cache.keys().next().value;
        if (typeof oldest !== 'string') break;
        cache.delete(oldest);
    }
}
