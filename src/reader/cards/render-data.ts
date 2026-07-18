import { ankiLookupWithUnavailableDetails, type AnkiConnectClient, type AnkiLookupResult, type AnkiNoteFieldTargetPlan } from '../anki/index';
import { applyPooledJpdbDeckState, cardNeedsJpdbDeckPoolLookup, sourceCardAnkiLookupOrEmpty } from './render-state';
import { cardKey } from './utils';
import { delay } from '../core/async-utils';
import { pruneExpiringMapEntries } from '../core/expiring-map';
import type { JitenApiClient, JitenVocabularyInfo, JitenVocabularyWordSummary } from '../dictionaries/jiten';
import type { JpdbClient } from '../jpdb/jpdb';
import type { JpdbPublicPitchClient } from '../jpdb/jpdb-public-pitch';
import type { JpdbVocabularyClient, JpdbVocabularyInfo } from '../jpdb/jpdb-vocabulary';
import { lookupBunproDefinitionResult, type BunproDefinitionInfo, type BunproDefinitionStatus } from '../bunpro/definition';
import type { BunproClient } from '../bunpro/bunpro';
import { Logger } from '../app/logger';
import { fallbackLookupTermsForCard } from '../lookup/parser';
import { pitchPatternFromPosition } from '../lookup/pitch-accent';
import { localPitchPatternFromMeta, localPitchResolutionFromMetaLookup } from '../lookup/pitch-meta';
import { cardPronunciationReading, EXPRESSION_CONNECTIVE_KANA, isKanjiCharacter, type ExpressionComponentLookup, type ExpressionComponentPitch } from '../popup/pitch';
import { shouldLookupAnkiStatus } from '../settings/index';
import { effectiveJitenApiKey, effectiveJpdbApiKey, hasBunproFrontendCredential, hasJitenApiCredential, hasJpdbApiCredential, isBunproFrontendCredentialExpired } from '../settings/api-credential';
import { isJitenBackedCard } from './srs-providers';
import type { ApiDeck, JPDBCard, JPDBDeck, ReaderSettings } from '../app/types';
import type { YomitanDictionaryStore, YomitanKanjiEntry, YomitanMetaEntry, YomitanTermEntry } from '../dictionaries/yomitan';
import {
    cardFrequencyRanks,
    exactJitenFrequencyRank,
    exactJpdbFrequencyRank,
    jitenFrequencyRankForCard,
    liveFrequencyEnabled,
    withFrequencyRank,
    type ProviderFrequencyRank,
    type ProviderFrequencyRanks,
} from './frequency-ranks';

const log = Logger.scope('CardRenderData');
const CARD_RENDER_DATA_CACHE_TTL_MS = 30_000;
const CARD_RENDER_DATA_CACHE_LIMIT = 120;
const CARD_RENDER_LOCAL_TIMEOUT_MS = 2_500;
const CARD_RENDER_JPDB_DETAIL_TIMEOUT_MS = 4_000;
const CARD_RENDER_JITEN_DETAIL_TIMEOUT_MS = 4_000;
const CARD_RENDER_FREQUENCY_TIMEOUT_MS = 4_000;
const CARD_RENDER_BUNPRO_DETAIL_TIMEOUT_MS = 4_000;
const CARD_RENDER_ANKI_TIMEOUT_MS = 4_000;
const CARD_RENDER_DECK_TIMEOUT_MS = 1_500;
const CARD_RENDER_DECK_POOL_TIMEOUT_MS = 4_000;
const CARD_RENDER_PITCH_TIMEOUT_MS = 6_500;
const CARD_RENDER_LOCAL_PITCH_GRACE_MS = 120;
const CARD_RENDER_SHARED_DECK_CACHE_TTL_MS = 5 * 60 * 1000;
const CARD_RENDER_COMPONENT_PITCH_TIMEOUT_MS = 4_000;
const CARD_RENDER_META_LOOKUP_LIMIT = 12;

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
    frequencyRanks?: ProviderFrequencyRanks;
    bunproDefinitionInfo?: BunproDefinitionInfo | null;
    bunproDefinitionStatus?: BunproDefinitionStatus;
    expressionComponents?: ExpressionComponentLookup[];
    componentPitches?: ExpressionComponentPitch[];
    ankiFieldTargetPlan?: AnkiNoteFieldTargetPlan | null;
}

export interface CardRenderDataLoad {
    localEntries: Promise<YomitanTermEntry[]>;
    hydrateLocalEntries?: () => Promise<YomitanTermEntry[]>;
    localMetaEntries?: Promise<YomitanMetaEntry[]>;
    pitchAccent?: Promise<string[]>;
    ankiLookup?: Promise<AnkiLookupResult>;
    hydrateAnkiLookup?: () => Promise<AnkiLookupResult>;
    jpdbVocabularyInfo?: Promise<JpdbVocabularyInfo | null>;
    jitenVocabularyInfo?: Promise<JitenVocabularyInfo | null>;
    hydrateJitenVocabularyInfo?: () => Promise<JitenVocabularyInfo | null>;
    frequencyRanks?: Promise<ProviderFrequencyRanks>;
    hydrateFrequencyRanks?: () => Promise<ProviderFrequencyRanks>;
    bunproDefinitionInfo?: Promise<BunproDefinitionInfo | null>;
    bunproDefinitionStatus?: Promise<BunproDefinitionStatus>;
    hydrateBunproDefinitionInfo?: () => Promise<BunproDefinitionInfo | null>;
    hydrateBunproDefinitionResult?: () => Promise<BunproDefinitionHydrationResult>;
    all: Promise<CardRenderData>;
}

export interface CardRenderDataLoadOptions {
    includeBunproDefinition?: boolean;
}

export interface CardRenderDataLoaderDependencies {
    getSettings: () => ReaderSettings;
    dictionaries: YomitanDictionaryStore;
    jpdbPublicPitch: JpdbPublicPitchClient;
    jpdbVocabulary: JpdbVocabularyClient;
    anki: AnkiConnectClient;
    jpdb: JpdbClient;
    jiten?: JitenApiClient;
    bunpro?: BunproClient;
    isJpdbBackedCard: (card: JPDBCard) => boolean;
}

interface LocalMetaEntriesLoad {
    entries: YomitanMetaEntry[];
    completed: boolean;
}

interface FrequencyRankLoad {
    initial: Promise<ProviderFrequencyRanks>;
    hydrated: Promise<ProviderFrequencyRanks>;
}

export interface BunproDefinitionHydrationResult {
    info: BunproDefinitionInfo | null;
    status: BunproDefinitionStatus;
}

export function loadingCardRenderData(
    localEntries: YomitanTermEntry[],
    ankiLookup: AnkiLookupResult,
    metaEntries: YomitanMetaEntry[] = [],
    jpdbVocabularyInfo: JpdbVocabularyInfo | null = null,
    jitenVocabularyInfo: JitenVocabularyInfo | null = null,
    bunproDefinitionInfo: BunproDefinitionInfo | null = null,
    frequencyRanks: ProviderFrequencyRanks = {},
    bunproDefinitionStatus: BunproDefinitionStatus = { state: 'loading' },
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
        frequencyRanks,
        bunproDefinitionInfo,
        bunproDefinitionStatus,
        expressionComponents: [],
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

    load(card: JPDBCard, options: CardRenderDataLoadOptions = {}): CardRenderDataLoad {
        const key = this.cacheKey(card, options);
        const now = Date.now();
        const cached = this.cache.get(key);
        if (cached && cached.expiresAt > now) return cached.load;

        const load = this.fetch(card, options);
        void load.all.catch(() => {
            if (this.cache.get(key)?.load === load) this.cache.delete(key);
        });
        this.cache.set(key, { expiresAt: now + CARD_RENDER_DATA_CACHE_TTL_MS, load });
        pruneExpiringMapEntries(this.cache, CARD_RENDER_DATA_CACHE_LIMIT, now);
        return load;
    }

    private fetch(card: JPDBCard, options: CardRenderDataLoadOptions): CardRenderDataLoad {
        const settings = this.settings();
        const localEntriesUncapped = this.loadLocalTermEntriesUncapped(card);
        const localEntries = this.loadLocalTermEntries(card, localEntriesUncapped);
        const localMetaEntries = this.loadLocalMetaEntries(card).then(async localMeta => {
            if (localMeta.completed) {
                await this.withFallback(card, CARD_RENDER_LOCAL_TIMEOUT_MS, 'local pitch accent', this.applyLocalPitchAccent(card, localMeta.entries), undefined);
            }
            return localMeta.entries;
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
        const cardRanks = cardFrequencyRanks(card, this.dependencies.isJpdbBackedCard);
        const seededFrequencyRanks: ProviderFrequencyRanks = {};
        if (liveFrequencyEnabled(settings, 'jiten') && cardRanks.jiten) seededFrequencyRanks.jiten = cardRanks.jiten;
        if (liveFrequencyEnabled(settings, 'jpdb') && cardRanks.jpdb) seededFrequencyRanks.jpdb = cardRanks.jpdb;
        const jitenVocabularyLookup = this.loadJitenVocabularyInfo(card, settings.jitenDefinitionsEnabled);
        const jitenVocabularyInfo = settings.jitenDefinitionsEnabled
            ? this.withFallback(card, CARD_RENDER_JITEN_DETAIL_TIMEOUT_MS, 'Jiten vocabulary details', jitenVocabularyLookup, null as JitenVocabularyInfo | null)
            : Promise.resolve(null);
        const frequencyRankLoad = this.loadFrequencyRanks(card, jitenVocabularyLookup, seededFrequencyRanks);
        const bunproDefinitionLookup = this.lookupBunproDefinitionResult(card, options.includeBunproDefinition !== false);
        const bunproDefinitionResult = this.withFallback(
            card,
            CARD_RENDER_BUNPRO_DETAIL_TIMEOUT_MS,
            'Bunpro definition',
            bunproDefinitionLookup,
            { info: null, status: { state: 'timeout' } } as BunproDefinitionHydrationResult,
        );
        const bunproDefinitionInfo = bunproDefinitionResult.then(result => result.info);
        const bunproDefinitionStatus = bunproDefinitionResult.then(result => result.status);
        const expressionComponents = this.withFallback(
            card,
            CARD_RENDER_COMPONENT_PITCH_TIMEOUT_MS,
            'expression components',
            this.loadExpressionComponents(card, localEntries, jitenVocabularyLookup),
            [] as ExpressionComponentLookup[],
        );
        const componentPitches = this.withFallback(
            card,
            CARD_RENDER_COMPONENT_PITCH_TIMEOUT_MS,
            'expression component pitch',
            this.loadExpressionComponentPitches(expressionComponents, jitenVocabularyLookup),
            [] as ExpressionComponentPitch[],
        );
        void pitchAccent.catch(() => undefined);
        void jpdbDeckMembership.catch(() => undefined);
        void jitenVocabularyInfo.catch(() => undefined);
        void frequencyRankLoad.initial.catch(() => undefined);
        void bunproDefinitionInfo.catch(() => undefined);
        void expressionComponents.catch(() => undefined);
        void componentPitches.catch(() => undefined);
        const all = this.loadAll(card, localEntries, localMetaEntries, fastAnkiLookup, jpdbDeckMembership, jpdbVocabularyInfo, jitenVocabularyInfo, frequencyRankLoad.initial, bunproDefinitionInfo, bunproDefinitionStatus, expressionComponents, componentPitches);
        return {
            localEntries,
            localMetaEntries,
            pitchAccent,
            ankiLookup: fastAnkiLookup,
            hydrateAnkiLookup,
            jpdbVocabularyInfo,
            jitenVocabularyInfo,
            hydrateJitenVocabularyInfo: () => jitenVocabularyLookup,
            frequencyRanks: frequencyRankLoad.initial,
            hydrateFrequencyRanks: () => frequencyRankLoad.hydrated,
            bunproDefinitionInfo,
            bunproDefinitionStatus,
            hydrateLocalEntries: () => localEntriesUncapped,
            hydrateBunproDefinitionInfo: () => bunproDefinitionLookup.then(result => result.info),
            hydrateBunproDefinitionResult: () => bunproDefinitionLookup,
            all,
        };
    }

    private withFallback<T>(card: JPDBCard, timeoutMs: number, detail: string, promise: Promise<T>, fallback: T): Promise<T> {
        return cardRenderDetailWithFallback(detail, card, promise, fallback, timeoutMs);
    }

    // Uncapped lookup kept alongside the render-capped race: a slow local
    // dictionary (cold IndexedDB, WebKit/iPad) must render LATE via the
    // hydration pass, never NEVER — the capped race alone silently discarded
    // the real result and the local source vanished from the popover.
    private loadLocalTermEntriesUncapped(card: JPDBCard): Promise<YomitanTermEntry[]> {
        const settings = this.settings();
        if (!settings.localDictionariesEnabled) return Promise.resolve([]);
        return this.lookupLocalTermEntries(card, settings).catch(error => {
            log.warn('Local term lookup failed', { term: card.spelling }, error);
            return [];
        });
    }

    private loadLocalTermEntries(card: JPDBCard, uncapped: Promise<YomitanTermEntry[]>): Promise<YomitanTermEntry[]> {
        return this.withFallback(card, CARD_RENDER_LOCAL_TIMEOUT_MS, 'local term dictionary', uncapped, [] as YomitanTermEntry[]);
    }

    private async lookupLocalTermEntries(card: JPDBCard, settings: ReaderSettings): Promise<YomitanTermEntry[]> {
        const terms = card.source === 'fallback'
            ? fallbackLookupTermsForCard(card)
            : [card.spelling];
        for (const term of terms) {
            const entries = await this.dependencies.dictionaries.lookup(
                term,
                term === card.spelling ? card.reading : term,
                settings.localDictionaryMaxResults,
                settings.dictionaryPreferences,
            );
            if (entries.length) return entries;
        }
        return [];
    }

    private loadLocalKanjiEntries(card: JPDBCard): Promise<YomitanKanjiEntry[]> {
        const settings = this.settings();
        if (!settings.localDictionariesEnabled || !settings.localDictionaryShowKanji || !isLocalKanjiDictionaryCard(card)) return Promise.resolve([]);
        return this.withFallback(card, CARD_RENDER_LOCAL_TIMEOUT_MS, 'local kanji dictionary', this.dependencies.dictionaries.lookupKanji(card.spelling, settings.localDictionaryMaxResults, settings.dictionaryPreferences).catch(error => {
            log.warn('Local kanji lookup failed', { term: card.spelling }, error);
            return [];
        }), [] as YomitanKanjiEntry[]);
    }

    private loadLocalMetaEntries(card: JPDBCard): Promise<LocalMetaEntriesLoad> {
        const settings = this.settings();
        if (!settings.localDictionariesEnabled) return Promise.resolve({ entries: [], completed: false });
        const lookup = this.dependencies.dictionaries.lookupTermMeta(card.spelling, CARD_RENDER_META_LOOKUP_LIMIT, settings.dictionaryPreferences).then(entries => ({
            entries,
            completed: true,
        })).catch(error => {
            log.warn('Local metadata lookup failed', { term: card.spelling }, error);
            return { entries: [], completed: false };
        });
        return Promise.race([
            lookup,
            delay(CARD_RENDER_LOCAL_TIMEOUT_MS).then(() => {
                log.debug('local metadata dictionary timed out while rendering card', { term: card.spelling, timeoutMs: CARD_RENDER_LOCAL_TIMEOUT_MS });
                return { entries: [], completed: false };
            }),
        ]);
    }

    private loadPublicPitch(card: JPDBCard): Promise<string[]> {
        const settings = this.settings();
        // Public JPDB pitch is keyless (scrapes the public search page; the hosted
        // reader proxies it CORS-safely). Gating it on a JPDB API credential left
        // Jiten-only and no-key users with no pitch graph during study/lookup — so
        // only require the pitch feature itself and an as-yet-unknown accent.
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
        if (!settings.jpdbDefinitionsEnabled || !hasJpdbApiCredential(settings)) return Promise.resolve(null);
        return this.withFallback(card, CARD_RENDER_JPDB_DETAIL_TIMEOUT_MS, 'JPDB vocabulary details', this.dependencies.jpdbVocabulary.lookup(card.vid, card.spelling, card.reading).catch(error => {
            log.warn('JPDB page lookup failed', { term: card.spelling }, error);
            return null;
        }), null as JpdbVocabularyInfo | null);
    }

    // The raw (uncapped) Jiten lookup. A non-Jiten-backed card needs two or three
    // sequential round trips (search → info → examples); over a slow link or the
    // hosted proxy that easily exceeds the render timeout. The caller caps this for
    // the initial full render but ALSO keeps the uncapped promise so a slow result
    // still hydrates the popover instead of being discarded (which left the Jiten
    // frequency pill blank and the Jiten source missing — see the hydration pass).
    private loadJitenVocabularyInfo(card: JPDBCard, enabled: boolean): Promise<JitenVocabularyInfo | null> {
        if (!enabled || typeof this.dependencies.jiten?.lookupVocabularyInfoForCard !== 'function') return Promise.resolve(null);
        return this.dependencies.jiten.lookupVocabularyInfoForCard(card).then(info => {
            this.applyJitenVocabularyInfoPitchAccent(card, info);
            return info;
        }).catch(error => {
            log.warn('Jiten vocabulary lookup failed', { term: card.spelling }, error);
            return null;
        });
    }

    private loadFrequencyRanks(
        card: JPDBCard,
        jitenVocabularyLookup: Promise<JitenVocabularyInfo | null>,
        seeded: ProviderFrequencyRanks,
    ): FrequencyRankLoad {
        const settings = this.settings();
        const searchJiten = this.dependencies.jiten?.searchVocabulary?.bind(this.dependencies.jiten);
        const jiten = liveFrequencyEnabled(settings, 'jiten') && !seeded.jiten
            ? settings.jitenDefinitionsEnabled
                ? jitenVocabularyLookup.then(info => jitenFrequencyRankForCard(card, info))
                : searchJiten
                    ? searchJiten(card.spelling, 10)
                        .then(candidates => exactJitenFrequencyRank(card, candidates))
                        .catch(error => {
                            log.warn('Jiten frequency lookup failed', { term: card.spelling }, error);
                            return null;
                        })
                    : Promise.resolve(null)
            : Promise.resolve(null);
        const searchJpdb = this.dependencies.jpdbVocabulary.search?.bind(this.dependencies.jpdbVocabulary);
        const jpdb = liveFrequencyEnabled(settings, 'jpdb') && !seeded.jpdb && searchJpdb
            ? searchJpdb(card.spelling, 10)
                .then(candidates => exactJpdbFrequencyRank(card, candidates))
                .catch(error => {
                    log.warn('JPDB frequency lookup failed', { term: card.spelling }, error);
                    return null;
                })
            : Promise.resolve(null);
        const combine = ([jitenRank, jpdbRank]: [ProviderFrequencyRank | null, ProviderFrequencyRank | null]) =>
            withFrequencyRank(withFrequencyRank(seeded, jitenRank), jpdbRank);
        return {
            initial: Promise.all([
                this.withFallback(card, CARD_RENDER_FREQUENCY_TIMEOUT_MS, 'Jiten frequency rank', jiten, null),
                this.withFallback(card, CARD_RENDER_FREQUENCY_TIMEOUT_MS, 'JPDB frequency rank', jpdb, null),
            ]).then(combine),
            hydrated: Promise.all([jiten, jpdb]).then(combine),
        };
    }

    private lookupBunproDefinitionResult(card: JPDBCard, included: boolean): Promise<BunproDefinitionHydrationResult> {
        const settings = this.settings();
        if (!included) return Promise.resolve({ info: null, status: { state: 'disabled', reason: 'load-excluded' } });
        if (!settings.bunproDefinitionsEnabled) return Promise.resolve({ info: null, status: { state: 'disabled', reason: 'definitions-disabled' } });
        if (!this.dependencies.bunpro) return Promise.resolve({ info: null, status: { state: 'client-unavailable' } });
        if (!hasBunproFrontendCredential(settings)) return Promise.resolve({ info: null, status: { state: 'auth-missing' } });
        if (isBunproFrontendCredentialExpired(settings)) return Promise.resolve({ info: null, status: { state: 'auth-expired' } });
        const startedAt = performance.now();
        log.debug('Bunpro definition lookup started', { term: card.spelling });
        return lookupBunproDefinitionResult(this.dependencies.bunpro, card).then(result => {
            const resolved: BunproDefinitionHydrationResult = {
                info: result.info,
                status: result.state === 'success'
                    ? { state: 'success' }
                    : { state: 'no-match', reason: result.reason },
            };
            log.debug('Bunpro definition lookup completed', {
                term: card.spelling,
                state: resolved.status.state,
                reason: resolved.status.state === 'no-match' ? resolved.status.reason : undefined,
                durationMs: Math.round(performance.now() - startedAt),
            });
            return resolved;
        }).catch(error => {
            log.warn('Bunpro definition lookup failed', { term: card.spelling }, error);
            return { info: null, status: { state: 'error' } };
        });
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
        if (!settings.jpdbMiningEnabled || !hasJpdbApiCredential(settings) || !this.dependencies.isJpdbBackedCard(card)) return Promise.resolve([]);
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
        if (!settings.jpdbMiningEnabled || !isJitenBackedCard(card) || !hasJitenApiCredential(settings)) return Promise.resolve([]);
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
        if (!settings.jpdbMiningEnabled || !hasJpdbApiCredential(settings) || !this.dependencies.isJpdbBackedCard(card)) return Promise.resolve(false);
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
        frequencyRanks: Promise<ProviderFrequencyRanks>,
        bunproDefinitionInfo: Promise<BunproDefinitionInfo | null>,
        bunproDefinitionStatus: Promise<BunproDefinitionStatus>,
        expressionComponents: Promise<ExpressionComponentLookup[]>,
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
            frequencyRanks,
            bunproDefinitionInfo,
            bunproDefinitionStatus,
            expressionComponents.catch(() => [] as ExpressionComponentLookup[]),
            componentPitches.catch(() => [] as ExpressionComponentPitch[]),
            ankiFieldTargetPlan,
        ]).then(([localEntriesValue, kanjiEntries, metaEntries, ankiLookup, jpdbDecks, jitenDecks, ankiDecks, jpdbDeckMembership, jpdbVocabularyInfo, jitenVocabularyInfo, frequencyRanks, bunproDefinitionInfo, bunproDefinitionStatus, expressionComponentsValue, componentPitchesValue, ankiFieldTargetPlanValue]) => {
            if (jpdbDeckMembership) applyPooledJpdbDeckState(card);
            return { localEntries: localEntriesValue, kanjiEntries, metaEntries, ankiLookup, jpdbDecks, jitenDecks, ankiDecks, jpdbVocabularyInfo, jitenVocabularyInfo, frequencyRanks, bunproDefinitionInfo, bunproDefinitionStatus, expressionComponents: expressionComponentsValue, componentPitches: componentPitchesValue, ankiFieldTargetPlan: ankiFieldTargetPlanValue };
        });
    }

    private async loadExpressionComponents(
        card: JPDBCard,
        localEntries: Promise<YomitanTermEntry[]>,
        jitenVocabularyInfo: Promise<JitenVocabularyInfo | null>,
    ): Promise<ExpressionComponentLookup[]> {
        if (this.settings().localDictionariesEnabled) {
            const entries = await localEntries.catch(() => [] as YomitanTermEntry[]);
            if (entries.length || looksComposableExpression(card.spelling)) {
                const segmented = await this.segmentExpressionComponents(card.spelling);
                if (segmented.length) return segmented;
            }
        }

        // Component navigation is a reader feature, not a local-dictionary
        // feature. Jiten already returns the same decomposition for the card;
        // surface it through the generic lookup chips even when Yomitan banks
        // are disabled instead of burying the only usable links in one source.
        const info = await jitenVocabularyInfo.catch(() => null);
        return jitenExpressionComponents(info);
    }

    // Expressions and compounds expose their parts as lookup chips. Keep each
    // part's own pitch available for chip colouring even when the card now has
    // a whole-word pitch graph from direct or composed metadata.
    private async loadExpressionComponentPitches(
        expressionComponents: Promise<ExpressionComponentLookup[]>,
        jitenVocabularyInfo: Promise<JitenVocabularyInfo | null>,
    ): Promise<ExpressionComponentPitch[]> {
        const settings = this.settings();
        if (!settings.showPitchAccent) return [];
        const [components, jitenInfo] = await Promise.all([
            expressionComponents.catch(() => [] as ExpressionComponentLookup[]),
            jitenVocabularyInfo.catch(() => null),
        ]);
        if (!components.length) return [];
        const pitches: ExpressionComponentPitch[] = [];
        for (const component of components) {
            const jitenWord = jitenInfo?.composedOf.find(word => {
                const candidate = jitenExpressionComponent(word);
                return candidate?.text === component.text && candidate.reading === component.reading;
            });
            const jitenPitch = jitenWord?.pitchAccents
                ?.map(position => pitchPatternFromPosition(component.reading, position))
                .find(Boolean);
            if (jitenPitch) {
                pitches.push({ text: component.text, reading: component.reading, pitch: jitenPitch });
                continue;
            }
            const meta = settings.localDictionariesEnabled
                ? await this.dependencies.dictionaries.lookupTermMeta(component.text, CARD_RENDER_META_LOOKUP_LIMIT, settings.dictionaryPreferences)
                    .catch(() => [] as YomitanMetaEntry[])
                : [];
            const localPitch = localPitchPatternFromMeta(component.text, component.reading, meta);
            if (localPitch) {
                pitches.push({ text: component.text, reading: component.reading, pitch: localPitch });
                continue;
            }
            const pitch = await this.dependencies.jpdbPublicPitch.lookup(component.text, component.reading)
                .then(patterns => patterns[0] ?? '')
                .catch(() => '');
            if (pitch) pitches.push({ text: component.text, reading: component.reading, pitch });
        }
        return pitches;
    }

    private async segmentExpressionComponents(spelling: string): Promise<ExpressionComponentLookup[]> {
        const characters = Array.from(spelling.trim());
        if (characters.length < 3 || characters.length > 24) return [];
        const settings = this.settings();
        const components: ExpressionComponentLookup[] = [];
        let cursor = 0;
        let misses = 0;
        let connectiveSkips = 0;
        while (cursor < characters.length && components.length < 8 && misses <= 6) {
            const matched = await this.longestExpressionComponentAt(characters, cursor, settings);
            if (matched) {
                components.push(matched);
                cursor += Array.from(matched.text).length;
                continue;
            }
            // Particles and connective kana between components are expected;
            // anything else unmatchable counts toward the miss budget.
            if (EXPRESSION_CONNECTIVE_KANA.has(characters[cursor])) connectiveSkips += 1;
            else misses += 1;
            cursor += 1;
        }
        if (components.length >= 2) return components;
        // A lone content word plus connective kana (実際は, 気合いを) still has a
        // usable subword: its pitch and lookup chip come from the content word.
        if (components.length === 1 && connectiveSkips > 0 && misses === 0) return components;
        return [];
    }

    private async longestExpressionComponentAt(
        characters: string[],
        cursor: number,
        settings: ReaderSettings,
    ): Promise<ExpressionComponentLookup | null> {
        const maxLength = Math.min(8, characters.length - cursor);
        for (let length = maxLength; length >= 1; length--) {
            if (cursor === 0 && length === characters.length) continue;
            const candidate = characters.slice(cursor, cursor + length).join('');
            if (length === 1 && !isKanjiCharacter(candidate)) return null;
            const entries = await this.dependencies.dictionaries.lookup(candidate, candidate, 3, settings.dictionaryPreferences).catch(() => [] as YomitanTermEntry[]);
            const exact = entries.find(entry => entry.expression === candidate || (!entry.expression && entry.reading === candidate) || entry.reading === candidate);
            if (exact) return { text: candidate, reading: exact.reading || candidate };
        }
        return null;
    }

    private async applyLocalPitchAccent(card: JPDBCard, metaEntries: YomitanMetaEntry[]): Promise<void> {
        const settings = this.settings();
        if (!settings.showPitchAccent || !settings.localDictionariesEnabled) return;
        const resolution = await localPitchResolutionFromMetaLookup(
            card.spelling,
            card.reading,
            expression => this.dependencies.dictionaries.lookupTermMeta(expression, CARD_RENDER_META_LOOKUP_LIMIT, settings.dictionaryPreferences),
            { initialEntries: metaEntries },
        ).catch(error => {
            log.warn('Local pitch lookup failed', { term: card.spelling }, error);
            return { patterns: [] } as import('../lookup/pitch-meta').LocalPitchResolution;
        });
        const patterns = resolution.patterns;
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

    private applyJitenVocabularyInfoPitchAccent(card: JPDBCard, info: JitenVocabularyInfo | null): void {
        if (!info?.pitchAccents.length) return;
        const reading = cardPronunciationReading(card) || card.reading.trim();
        const patterns = info.pitchAccents
            .map(position => pitchPatternFromPosition(reading, position))
            .filter(Boolean);
        if (!patterns.length) return;
        if (!card.pitchAccent.length) {
            card.pitchAccent = patterns;
            return;
        }
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

    private cacheKey(card: JPDBCard, options: CardRenderDataLoadOptions): string {
        const settings = this.settings();
        return JSON.stringify({
            card: cardKey(card),
            cardFrequency: {
                rank: card.frequencyRank,
                source: card.source,
                reviewSource: card.reviewSource,
                jitenWordId: card.jitenWordId,
                jitenReadingIndex: card.jitenReadingIndex,
            },
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
            liveFrequency: {
                jiten: liveFrequencyEnabled(settings, 'jiten'),
                jpdb: liveFrequencyEnabled(settings, 'jpdb'),
            },
            bunproDefinitions: settings.bunproDefinitionsEnabled,
            includeBunproDefinition: options.includeBunproDefinition !== false,
            apiMining: settings.jpdbMiningEnabled || settings.bunproMiningEnabled,
            hasApiKey: hasJpdbApiCredential(settings),
            hasJitenApiKey: hasJitenApiCredential(settings),
            hasBunproToken: hasBunproFrontendCredential(settings) && !isBunproFrontendCredentialExpired(settings),
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

function isKanaCharacter(character: string): boolean {
    const code = character.codePointAt(0) ?? 0;
    return code >= 0x3040 && code <= 0x30ff; // hiragana + katakana (incl. ー)
}

function looksComposableExpression(spelling: string): boolean {
    const characters = Array.from(spelling.trim());
    // Three characters is only enough when a connective particle is present
    // (実際は = word + trailing particle); other shapes need four to be worth
    // a segmentation pass.
    if (characters.length < 3) return false;
    const hasConnective = characters.some(character => EXPRESSION_CONNECTIVE_KANA.has(character));
    if (characters.length === 3 && !hasConnective) return false;
    const kanjiCount = characters.filter(isKanjiCharacter).length;
    return hasConnective
        || characters.every(isKanjiCharacter)
        // Kanji-led ALL-JAPANESE compounds (国内向け, 海外向け, 取り扱い, 食べ物): a
        // kanji stem with okurigana/kana. Restricting to kanji+kana excludes
        // digit/latin-bearing tokens (単語10, A社) so bulk card loads don't run a
        // pointless segmentation pass. Segmentation + the >=2 component gate
        // downstream still keep this from producing spurious chips.
        || (isKanjiCharacter(characters[0]) && kanjiCount >= 2
            && characters.every(character => isKanjiCharacter(character) || isKanaCharacter(character)));
}

function jitenExpressionComponents(info: JitenVocabularyInfo | null): ExpressionComponentLookup[] {
    const seen = new Set<string>();
    return (info?.composedOf ?? []).flatMap(word => {
        const component = jitenExpressionComponent(word);
        if (!component) return [];
        const key = `${component.text}\n${component.reading}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [component];
    });
}

function jitenExpressionComponent(word: JitenVocabularyWordSummary): ExpressionComponentLookup | null {
    const annotated = word.readingFurigana.trim();
    const text = (word.matchSurface.trim() || cleanJitenAnnotatedSpelling(annotated) || cleanJitenAnnotatedSpelling(word.reading)).trim();
    if (!text) return null;
    const reading = (jitenAnnotatedReading(annotated) || word.reading.trim() || text).trim();
    return { text, reading };
}

function cleanJitenAnnotatedSpelling(value: string): string {
    return value.replace(/([\u4e00-\u9faf\u3005-\u3007]+)\[[^\]]+]/g, '$1');
}

function jitenAnnotatedReading(value: string): string {
    const source = value.trim();
    const reading = source.replace(/([\u4e00-\u9faf\u3005-\u3007]+)\[([^\]]+)]/g, '$2').trim();
    return reading === source ? '' : reading;
}

function isLocalKanjiDictionaryCard(card: JPDBCard): boolean {
    const characters = Array.from(card.spelling.trim());
    return characters.length === 1 && isKanjiCharacter(characters[0] ?? '') && (card.reading === card.spelling || Boolean(card.kanjiKeyword));
}

function emptyAnkiLookupResult(): AnkiLookupResult {
    return { state: 'not-in-deck', notes: [], primary: null };
}
