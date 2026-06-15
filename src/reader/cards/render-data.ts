import { ankiLookupWithUnavailableDetails, type AnkiConnectClient, type AnkiLookupResult, type AnkiNoteFieldTargetPlan } from '../anki/index';
import { applyPooledJpdbDeckState, cardNeedsJpdbDeckPoolLookup, sourceCardAnkiLookupOrEmpty } from './render-state';
import { cardKey } from './utils';
import { pruneExpiringMapEntries } from '../core/expiring-map';
import type { JitenApiClient, JitenVocabularyInfo } from '../dictionaries/jiten';
import type { JpdbClient } from '../jpdb/jpdb';
import type { JpdbPublicPitchClient } from '../jpdb/jpdb-public-pitch';
import type { JpdbVocabularyClient, JpdbVocabularyInfo } from '../jpdb/jpdb-vocabulary';
import { Logger } from '../app/logger';
import { localPitchPatternFromMeta, localPitchPatternsFromMeta } from '../lookup/pitch-meta';
import { isKanjiCharacter, type ExpressionComponentPitch } from '../popup/pitch';
import { shouldLookupAnkiStatus } from '../settings/index';
import { effectiveJitenApiKey, effectiveJpdbApiKey, hasJitenApiCredential, hasJpdbApiCredential } from '../settings/api-credential';
import { isApiMiningEnabled, isJitenBackedCard } from './srs-providers';
import type { ApiDeck, JPDBCard, JPDBDeck, ReaderSettings } from '../app/types';
import type { YomitanDictionaryStore, YomitanKanjiEntry, YomitanMetaEntry, YomitanTermEntry } from '../dictionaries/yomitan';

const log = Logger.scope('CardRenderData');
const CARD_RENDER_DATA_CACHE_TTL_MS = 30_000;
const CARD_RENDER_DATA_CACHE_LIMIT = 120;
const CARD_RENDER_LOCAL_TIMEOUT_MS = 2_500;
const CARD_RENDER_JPDB_DETAIL_TIMEOUT_MS = 4_000;
const CARD_RENDER_JITEN_DETAIL_TIMEOUT_MS = 4_000;
const CARD_RENDER_ANKI_TIMEOUT_MS = 4_000;
const CARD_RENDER_DECK_TIMEOUT_MS = 1_500;
const CARD_RENDER_DECK_POOL_TIMEOUT_MS = 4_000;
const CARD_RENDER_PITCH_TIMEOUT_MS = 6_500;
const CARD_RENDER_LOCAL_PITCH_GRACE_MS = 120;
const CARD_RENDER_SHARED_DECK_CACHE_TTL_MS = 5 * 60 * 1000;
const CARD_RENDER_COMPONENT_PITCH_TIMEOUT_MS = 4_000;
const EXPRESSION_CONNECTIVE_KANA = new Set(['を', 'が', 'に', 'で', 'と', 'は', 'も', 'へ', 'や', 'の', 'お', 'ご']);

export interface CardRenderData {
    localEntries: YomitanTermEntry[];
    kanjiEntries: YomitanKanjiEntry[];
    metaEntries: YomitanMetaEntry[];
    ankiLookup: AnkiLookupResult;
    jpdbDecks: JPDBDeck[];
    jitenDecks?: ApiDeck[];
    ankiDecks: string[];
    jpdbVocabularyInfo: JpdbVocabularyInfo | null;
    jitenVocabularyInfo?: JitenVocabularyInfo | null;
    componentPitches?: ExpressionComponentPitch[];
    ankiFieldTargetPlan?: AnkiNoteFieldTargetPlan | null;
}

export interface CardRenderDataLoad {
    localEntries: Promise<YomitanTermEntry[]>;
    localMetaEntries?: Promise<YomitanMetaEntry[]>;
    pitchAccent?: Promise<string[]>;
    ankiLookup?: Promise<AnkiLookupResult>;
    hydrateAnkiLookup?: () => Promise<AnkiLookupResult>;
    jpdbVocabularyInfo?: Promise<JpdbVocabularyInfo | null>;
    jitenVocabularyInfo?: Promise<JitenVocabularyInfo | null>;
    all: Promise<CardRenderData>;
}

export interface CardRenderDataLoaderDependencies {
    getSettings: () => ReaderSettings;
    dictionaries: YomitanDictionaryStore;
    jpdbPublicPitch: JpdbPublicPitchClient;
    jpdbVocabulary: JpdbVocabularyClient;
    anki: AnkiConnectClient;
    jpdb: JpdbClient;
    jiten?: JitenApiClient;
    isJpdbBackedCard: (card: JPDBCard) => boolean;
}

export function loadingCardRenderData(
    localEntries: YomitanTermEntry[],
    ankiLookup: AnkiLookupResult,
    metaEntries: YomitanMetaEntry[] = [],
    jpdbVocabularyInfo: JpdbVocabularyInfo | null = null,
    jitenVocabularyInfo: JitenVocabularyInfo | null = null,
): CardRenderData & { loading: boolean } {
    return {
        localEntries,
        kanjiEntries: [],
        metaEntries,
        ankiLookup,
        jpdbDecks: [],
        jitenDecks: [],
        ankiDecks: [],
        jpdbVocabularyInfo,
        jitenVocabularyInfo,
        loading: true,
    };
}

export class CardRenderDataLoader {
    private cache = new Map<string, { expiresAt: number; load: CardRenderDataLoad }>();
    private jpdbDecksCache?: { key: string; expiresAt: number; promise: Promise<JPDBDeck[]> };
    private jitenDecksCache?: { key: string; expiresAt: number; promise: Promise<ApiDeck[]> };
    private ankiDecksCache?: { key: string; expiresAt: number; promise: Promise<string[]> };

    constructor(private readonly dependencies: CardRenderDataLoaderDependencies) {}

    clear(): void {
        this.cache.clear();
        this.jpdbDecksCache = undefined;
        this.jitenDecksCache = undefined;
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
        pruneExpiringMapEntries(this.cache, CARD_RENDER_DATA_CACHE_LIMIT, now);
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
        const jitenVocabularyInfo = this.loadJitenVocabularyInfo(card);
        const componentPitches = this.withFallback(
            card,
            CARD_RENDER_COMPONENT_PITCH_TIMEOUT_MS,
            'expression component pitch',
            this.loadExpressionComponentPitches(card, localMetaEntries),
            [] as ExpressionComponentPitch[],
        );
        void pitchAccent.catch(() => undefined);
        void jpdbDeckMembership.catch(() => undefined);
        void jitenVocabularyInfo.catch(() => undefined);
        void componentPitches.catch(() => undefined);
        const all = this.loadAll(card, localEntries, localMetaEntries, fastAnkiLookup, jpdbDeckMembership, jpdbVocabularyInfo, jitenVocabularyInfo, componentPitches);
        return { localEntries, localMetaEntries, pitchAccent, ankiLookup: fastAnkiLookup, hydrateAnkiLookup, jpdbVocabularyInfo, jitenVocabularyInfo, all };
    }

    private withFallback<T>(card: JPDBCard, timeoutMs: number, detail: string, promise: Promise<T>, fallback: T): Promise<T> {
        return cardRenderDetailWithFallback(detail, card, promise, fallback, timeoutMs);
    }

    private loadLocalTermEntries(card: JPDBCard): Promise<YomitanTermEntry[]> {
        const settings = this.settings();
        if (!settings.localDictionariesEnabled) return Promise.resolve([]);
        return this.withFallback(card, CARD_RENDER_LOCAL_TIMEOUT_MS, 'local term dictionary', this.dependencies.dictionaries.lookup(card.spelling, card.reading, settings.localDictionaryMaxResults, settings.dictionaryPreferences).catch(error => {
            log.warn('Local term lookup failed', { term: card.spelling }, error);
            return [];
        }), [] as YomitanTermEntry[]);
    }

    private loadLocalKanjiEntries(card: JPDBCard): Promise<YomitanKanjiEntry[]> {
        const settings = this.settings();
        if (!settings.localDictionariesEnabled || !settings.localDictionaryShowKanji || !isLocalKanjiDictionaryCard(card)) return Promise.resolve([]);
        return this.withFallback(card, CARD_RENDER_LOCAL_TIMEOUT_MS, 'local kanji dictionary', this.dependencies.dictionaries.lookupKanji(card.spelling, settings.localDictionaryMaxResults, settings.dictionaryPreferences).catch(error => {
            log.warn('Local kanji lookup failed', { term: card.spelling }, error);
            return [];
        }), [] as YomitanKanjiEntry[]);
    }

    private loadLocalMetaEntries(card: JPDBCard): Promise<YomitanMetaEntry[]> {
        const settings = this.settings();
        if (!settings.localDictionariesEnabled) return Promise.resolve([]);
        return this.withFallback(card, CARD_RENDER_LOCAL_TIMEOUT_MS, 'local metadata dictionary', this.dependencies.dictionaries.lookupTermMeta(card.spelling, 12, settings.dictionaryPreferences).catch(error => {
            log.warn('Local metadata lookup failed', { term: card.spelling }, error);
            return [];
        }), [] as YomitanMetaEntry[]);
    }

    private loadPublicPitch(card: JPDBCard): Promise<string[]> {
        const settings = this.settings();
        if (!settings.showPitchAccent || card.pitchAccent.length) return Promise.resolve([]);
        return this.withFallback(card, CARD_RENDER_PITCH_TIMEOUT_MS, 'JPDB public pitch', this.dependencies.jpdbPublicPitch.lookup(card.spelling, card.reading).catch(error => {
            log.warn('Public pitch lookup failed', { term: card.spelling }, error);
            return [];
        }), [] as string[]);
    }

    private async loadPublicPitchAfterLocalPitchGrace(card: JPDBCard, localMetaEntries: Promise<YomitanMetaEntry[]>): Promise<string[]> {
        await Promise.race([localMetaEntries, delay(CARD_RENDER_LOCAL_PITCH_GRACE_MS)]);
        return this.loadPublicPitch(card);
    }

    private loadJpdbVocabularyInfo(card: JPDBCard): Promise<JpdbVocabularyInfo | null> {
        const settings = this.settings();
        if (!settings.jpdbDefinitionsEnabled || isJitenBackedCard(card)) return Promise.resolve(null);
        return this.withFallback(card, CARD_RENDER_JPDB_DETAIL_TIMEOUT_MS, 'JPDB vocabulary details', this.dependencies.jpdbVocabulary.lookup(card.vid, card.spelling, card.reading).catch(error => {
            log.warn('JPDB page lookup failed', { term: card.spelling }, error);
            return null;
        }), null as JpdbVocabularyInfo | null);
    }

    private loadJitenVocabularyInfo(card: JPDBCard): Promise<JitenVocabularyInfo | null> {
        const settings = this.settings();
        if (!settings.jitenDefinitionsEnabled || typeof this.dependencies.jiten?.lookupVocabularyInfoForCard !== 'function') return Promise.resolve(null);
        return this.withFallback(card, CARD_RENDER_JITEN_DETAIL_TIMEOUT_MS, 'Jiten vocabulary details', this.dependencies.jiten.lookupVocabularyInfoForCard(card).catch(error => {
            log.warn('Jiten vocabulary lookup failed', { term: card.spelling }, error);
            return null;
        }), null as JitenVocabularyInfo | null);
    }

    private loadFastAnkiLookup(card: JPDBCard): Promise<AnkiLookupResult> {
        if (!shouldLookupAnkiStatus(this.settings())) return Promise.resolve(emptyAnkiLookupResult());
        const fallback = sourceCardAnkiLookupOrEmpty(card);
        if (typeof this.dependencies.anki.findCachedStatusBatch !== 'function') return Promise.resolve(fallback);
        return this.dependencies.anki.findCachedStatusBatch([card])
            .then(([lookup]) => lookup ?? fallback)
            .catch(error => {
                log.warn('Cached Anki status failed', { term: card.spelling }, error);
                return fallback;
            });
    }

    private loadDetailedAnkiLookup(card: JPDBCard, fastLookup: Promise<AnkiLookupResult>): Promise<AnkiLookupResult> {
        if (!shouldLookupAnkiStatus(this.settings())) return fastLookup;
        return fastLookup.then(fallback => this.withFallback(card, CARD_RENDER_ANKI_TIMEOUT_MS, 'Anki existing cards', this.loadAnkiLookupWhenAvailable(card, fallback).catch(error => {
            log.warn('Anki lookup failed', { term: card.spelling }, error);
            return ankiLookupWithUnavailableDetails(fallback);
        }), ankiLookupWithUnavailableDetails(fallback)));
    }

    private async loadAnkiLookupWhenAvailable(card: JPDBCard, fallback: AnkiLookupResult): Promise<AnkiLookupResult> {
        const lookup = await this.dependencies.anki.findExistingCards(card);
        const resolved = lookup.primary || lookup.trusted !== false ? lookup : fallback;
        return ankiLookupWithUnavailableDetails(resolved);
    }

    private loadJpdbDecks(card: JPDBCard): Promise<JPDBDeck[]> {
        const settings = this.settings();
        if (!isApiMiningEnabled(settings) || !hasJpdbApiCredential(settings) || !this.dependencies.isJpdbBackedCard(card)) return Promise.resolve([]);
        return this.withFallback(card, CARD_RENDER_DECK_TIMEOUT_MS, 'JPDB deck list', this.cachedJpdbDecks(settings).catch(error => {
            log.warn('JPDB deck list failed', { term: card.spelling }, error);
            return [];
        }), [] as JPDBDeck[]);
    }

    private loadAnkiDecks(card: JPDBCard): Promise<string[]> {
        if (!this.settings().ankiEnabled) return Promise.resolve([]);
        return this.withFallback(card, CARD_RENDER_DECK_TIMEOUT_MS, 'Anki deck list', this.cachedAnkiDecks(this.settings()).catch(error => {
            log.warn('Anki deck list failed', { term: card.spelling }, error);
            return [];
        }), [] as string[]);
    }

    private loadJitenDecks(card: JPDBCard): Promise<ApiDeck[]> {
        const settings = this.settings();
        if (!isApiMiningEnabled(settings) || !isJitenBackedCard(card) || !hasJitenApiCredential(settings)) return Promise.resolve([]);
        return this.withFallback(card, CARD_RENDER_DECK_TIMEOUT_MS, 'Jiten deck list', this.cachedJitenDecks(settings).catch(error => {
            log.warn('Jiten deck list failed', { term: card.spelling }, error);
            return [];
        }), [] as ApiDeck[]);
    }

    // Field-target plan for the new-card preview: shows which fields a mining
    // write will actually target when the configured model is non-Yomu.
    private loadAnkiFieldTargetPlan(card: JPDBCard): Promise<AnkiNoteFieldTargetPlan | null> {
        const settings = this.settings();
        if (!settings.ankiEnabled || !settings.ankiSectionEnabled) return Promise.resolve(null);
        if (typeof this.dependencies.anki.noteFieldTargetPlan !== 'function') return Promise.resolve(null);
        return this.withFallback(card, CARD_RENDER_DECK_TIMEOUT_MS, 'Anki field target plan', this.dependencies.anki.noteFieldTargetPlan().catch(error => {
            log.warn('Anki field target plan failed', { term: card.spelling }, error);
            return null;
        }), null as AnkiNoteFieldTargetPlan | null);
    }

    private loadJpdbDeckMembership(card: JPDBCard): Promise<boolean> {
        const settings = this.settings();
        if (!cardNeedsJpdbDeckPoolLookup(card)) return Promise.resolve(false);
        if (!isApiMiningEnabled(settings) || !hasJpdbApiCredential(settings) || !this.dependencies.isJpdbBackedCard(card)) return Promise.resolve(false);
        const isInUserDeckPool = this.dependencies.jpdb.isInUserDeckPool?.bind(this.dependencies.jpdb);
        if (typeof isInUserDeckPool !== 'function') return Promise.resolve(false);
        return this.withFallback(card, CARD_RENDER_DECK_POOL_TIMEOUT_MS, 'JPDB pooled deck membership', isInUserDeckPool(card).catch(error => {
            log.warn('JPDB pool lookup failed', { term: card.spelling }, error);
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
        jitenVocabularyInfo: Promise<JitenVocabularyInfo | null>,
        componentPitches: Promise<ExpressionComponentPitch[]>,
    ): Promise<CardRenderData> {
        const ankiDecks = ankiLookup.then(lookup => lookup.primary ? [] : this.loadAnkiDecks(card));
        const ankiFieldTargetPlan = ankiLookup.then(lookup => lookup.primary ? null : this.loadAnkiFieldTargetPlan(card));
        return Promise.all([
            localEntries,
            this.loadLocalKanjiEntries(card),
            localMetaEntries,
            ankiLookup,
            this.loadJpdbDecks(card),
            this.loadJitenDecks(card),
            ankiDecks,
            jpdbDeckMembership,
            jpdbVocabularyInfo,
            jitenVocabularyInfo,
            componentPitches.catch(() => [] as ExpressionComponentPitch[]),
            ankiFieldTargetPlan,
        ]).then(([localEntriesValue, kanjiEntries, metaEntries, ankiLookup, jpdbDecks, jitenDecks, ankiDecks, jpdbDeckMembership, jpdbVocabularyInfo, jitenVocabularyInfo, componentPitchesValue, ankiFieldTargetPlanValue]) => {
            if (jpdbDeckMembership) applyPooledJpdbDeckState(card);
            return { localEntries: localEntriesValue, kanjiEntries, metaEntries, ankiLookup, jpdbDecks, jitenDecks, ankiDecks, jpdbVocabularyInfo, jitenVocabularyInfo, componentPitches: componentPitchesValue, ankiFieldTargetPlan: ankiFieldTargetPlanValue };
        });
    }

    // Expressions have no whole-word accent: when every pitch source for the
    // card itself stays empty, segment the spelling against the local
    // dictionaries (greedy longest match, particles skipped) and collect each
    // component's own pitch for the per-component popover graphs.
    private async loadExpressionComponentPitches(
        card: JPDBCard,
        localMetaEntries: Promise<YomitanMetaEntry[]>,
    ): Promise<ExpressionComponentPitch[]> {
        const settings = this.settings();
        if (!settings.showPitchAccent || !settings.localDictionariesEnabled) return [];
        // Only the timeout-bounded local meta is awaited; if the slower public
        // pitch lands later, updateRenderedPitch swaps the component graphs
        // for the whole-word graph.
        const metaEntries = await localMetaEntries.catch(() => [] as YomitanMetaEntry[]);
        if (card.pitchAccent.length) return [];
        if (localPitchPatternFromMeta(card.reading, metaEntries)) return [];

        const components = await this.segmentExpressionComponents(card.spelling);
        if (components.length < 2) return [];
        const pitches: ExpressionComponentPitch[] = [];
        for (const component of components) {
            const meta = await this.dependencies.dictionaries.lookupTermMeta(component.expression, 12, settings.dictionaryPreferences).catch(() => [] as YomitanMetaEntry[]);
            const pitch = localPitchPatternFromMeta(component.reading, meta);
            if (pitch) pitches.push({ text: component.expression, reading: component.reading, pitch });
        }
        return pitches;
    }

    private async segmentExpressionComponents(spelling: string): Promise<Array<{ expression: string; reading: string }>> {
        const characters = Array.from(spelling.trim());
        if (characters.length < 3 || characters.length > 16) return [];
        const settings = this.settings();
        const components: Array<{ expression: string; reading: string }> = [];
        let cursor = 0;
        let misses = 0;
        while (cursor < characters.length && components.length < 4 && misses <= 4) {
            const matched = await this.longestExpressionComponentAt(characters, cursor, settings);
            if (matched) {
                components.push(matched);
                cursor += Array.from(matched.expression).length;
                continue;
            }
            // Particles and connective kana between components are expected;
            // anything else unmatchable counts toward the miss budget.
            if (!EXPRESSION_CONNECTIVE_KANA.has(characters[cursor])) misses += 1;
            cursor += 1;
        }
        return components;
    }

    private async longestExpressionComponentAt(
        characters: string[],
        cursor: number,
        settings: ReaderSettings,
    ): Promise<{ expression: string; reading: string } | null> {
        const maxLength = Math.min(8, characters.length - cursor);
        for (let length = maxLength; length >= 1; length--) {
            const candidate = characters.slice(cursor, cursor + length).join('');
            if (length === 1 && !isKanjiCharacter(candidate)) return null;
            const entries = await this.dependencies.dictionaries.lookup(candidate, candidate, 3, settings.dictionaryPreferences).catch(() => [] as YomitanTermEntry[]);
            const exact = entries.find(entry => entry.expression === candidate || (!entry.expression && entry.reading === candidate) || entry.reading === candidate);
            if (exact) return { expression: candidate, reading: exact.reading || candidate };
        }
        return null;
    }

    private applyLocalPitchAccent(card: JPDBCard, metaEntries: YomitanMetaEntry[]): void {
        const patterns = localPitchPatternsFromMeta(card.reading, metaEntries);
        if (!patterns.length) return;
        if (!card.pitchAccent.length) {
            card.pitchAccent = patterns;
            return;
        }
        // UT-65: jpdb supplies one accent — append the other accepted
        // variants the pitch dictionary knows about.
        for (const pattern of patterns) {
            if (!card.pitchAccent.includes(pattern)) card.pitchAccent.push(pattern);
        }
    }

    private cachedJpdbDecks(settings: ReaderSettings): Promise<JPDBDeck[]> {
        const key = `jpdb:${effectiveJpdbApiKey(settings)}`;
        const now = Date.now();
        if (this.jpdbDecksCache?.key === key && this.jpdbDecksCache.expiresAt > now) return this.jpdbDecksCache.promise;
        const promise = this.dependencies.jpdb.listDecks().catch(error => {
            if (this.jpdbDecksCache?.promise === promise) this.jpdbDecksCache = undefined;
            throw error;
        });
        this.jpdbDecksCache = { key, expiresAt: now + CARD_RENDER_SHARED_DECK_CACHE_TTL_MS, promise };
        return promise;
    }

    private cachedJitenDecks(settings: ReaderSettings): Promise<ApiDeck[]> {
        if (!this.dependencies.jiten) return Promise.resolve([]);
        const key = `jiten:${effectiveJitenApiKey(settings)}`;
        const now = Date.now();
        if (this.jitenDecksCache?.key === key && this.jitenDecksCache.expiresAt > now) return this.jitenDecksCache.promise;
        const promise = this.dependencies.jiten.listReaderStudyDecks()
            .then(decks => decks.map(deck => ({ id: String(deck.userStudyDeckId), name: deck.name })))
            .catch(error => {
                if (this.jitenDecksCache?.promise === promise) this.jitenDecksCache = undefined;
                throw error;
            });
        this.jitenDecksCache = { key, expiresAt: now + CARD_RENDER_SHARED_DECK_CACHE_TTL_MS, promise };
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
            jitenDefinitions: settings.jitenDefinitionsEnabled,
            apiMining: isApiMiningEnabled(settings),
            hasApiKey: hasJpdbApiCredential(settings),
            hasJitenApiKey: hasJitenApiCredential(settings),
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

function isLocalKanjiDictionaryCard(card: JPDBCard): boolean {
    const characters = Array.from(card.spelling.trim());
    return characters.length === 1 && isKanjiCharacter(characters[0] ?? '') && (card.reading === card.spelling || Boolean(card.kanjiKeyword));
}

function emptyAnkiLookupResult(): AnkiLookupResult {
    return { state: 'not-in-deck', notes: [], primary: null };
}
