import { runLimited } from '../core/async-utils';
import { escapeHtml } from '../dom';
import type { AnkiWordAudioMedia } from './audio';
import { isAppleTouchBrowser } from '../platform/browser';
import { ANKI_CARD_COLOR_TOKENS } from '../theme/color-tokens';
import { formatPartOfSpeech, formatPartOfSpeechDetails } from '../lookup/pos';
import { resolveUiLanguage, uiText } from '../app/i18n';
import { formatMetaFrequency, groupTermEntriesByDictionary } from '../dictionaries/groups';
import { Logger } from '../app/logger';
import { gmStorageGet, gmStorageGetSync, gmStorageSet } from '../app/storage';
import type { AnkiFieldMapping, DictionaryPreference, JPDBCard, JPDBGrade, ReaderSettings } from '../app/types';
import {
    glossaryToHtml,
    glossaryToText,
    type YomitanKanjiEntry,
    type YomitanMetaEntry,
    type YomitanTermEntry,
} from '../dictionaries/yomitan';
import {
    ANKI_FIELD_ROLES,
    type AnkiAudioMergeMode,
    type AnkiCardContext,
    type AnkiCardInfo,
    type AnkiDeckStats,
    type AnkiExistingNote,
    type AnkiFieldContext,
    type AnkiFieldRole,
    type AnkiLibraryScanResult,
    type AnkiLookupResult,
    type AnkiMediaFile,
    type AnkiMergeYomuResult,
    type AnkiModelScanResult,
    type AnkiMultiAction,
    type AnkiNote,
    type AnkiNoteInfo,
    type AnkiNoteUpdate,
    type AnkiPicture,
    type AnkiResponse,
    type AnkiStatusIndex,
    type AnkiStatusIndexCardData,
    type AnkiStatusIndexCardSets,
    type AnkiStatusIndexEntry,
    type ParsedAnkiAudioDataUrl,
    type ParsedAnkiImageDataUrl,
} from './types';
import {
    hasUserscriptAnkiBridge,
    isAnkiConnectAvailabilityError,
    postAnkiJson,
} from './transport';
import {
    ankiFieldMappingForModel,
    ankiFieldMappingsSettingsKey,
    fieldNameForRole,
    flattenNoteFields,
    lookupKeyTermsForCard,
    mappedRoleForField,
    noteLooksLikeCard,
    normalizeAnkiFieldName,
    scanAnkiModelFields,
    stripHtml,
    yomuFieldForRole,
} from './field-mapping';
import {
    ankiExistingNoteFromInfo,
    ankiMediaMimeType,
    ankiNoteHasRenderableDetails,
    ankiRenderedCardMediaFilenames,
    cardsByNoteId,
    emptyAnkiLookupResult,
    pickPrimaryExistingNote,
    stateFromExistingNotes,
    untrustedAnkiLookupResult,
} from './card-details';
import {
    ANKI_STATUS_INDEX_COUNT_CHECK_MS,
    ANKI_STATUS_INDEX_FOCUS_REFRESH_MIN_MS,
    ANKI_STATUS_INDEX_MAX_STALE_MS,
    ANKI_STATUS_INDEX_NOTE_CHUNK_SIZE,
    ANKI_STATUS_INDEX_NOTE_CONCURRENCY,
    ANKI_STATUS_INDEX_STORAGE_KEY,
    ANKI_STATUS_INDEX_VERSION,
    activeAnkiStatusIndexRebuildLease,
    ankiStatusIndexMeta,
    canUseIndexedDb,
    claimAnkiStatusIndexRebuildLease,
    clearAnkiStatusIndexStores,
    countAnkiStatusIndexEntries,
    loadAnkiStatusIndexEntriesFromIndexedDb,
    loadAnkiStatusIndexFromIndexedDb,
    openAnkiStatusIndexDb,
    putAnkiStatusIndexMeta,
    putBestAnkiStatusIndexEntries,
    releaseAnkiStatusIndexRebuildLease,
    saveAnkiStatusIndex,
    saveAnkiStatusIndexCheckedAt,
    saveAnkiStatusIndexDirtyMarker,
    shouldReplaceAnkiStatusIndexEntry,
    statusIndexEntriesForNotes,
    statusIndexEntryForCard,
    statusIndexKeysForCard,
    touchAnkiStatusIndexRebuildLease,
} from './status-index';
import { quoteAnkiSearch } from './search-escape';

export type {
    AnkiAudioMergeMode,
    AnkiCardContext,
    AnkiExistingNote,
    AnkiLibraryScanResult,
    AnkiLookupResult,
    AnkiMergeYomuResult,
    AnkiRenderedCard,
} from './types';
export { canFetchAnkiConnectFrom, isAnkiConnectAvailabilityError, hasUserscriptAnkiBridge } from './transport';
export {
    ANKI_EXPRESSION_FIELD_NAMES,
    ANKI_MEANING_FIELD_NAMES,
    ANKI_READING_FIELD_NAMES,
    ANKI_SENTENCE_FIELD_NAMES,
} from './field-mapping';
export { ankiMediaFilenameFromCardUrl, untrustedAnkiLookupResult } from './card-details';

const ANKI_VERSION = 6;
const ANKI_FIELD_TARGET_PLAN_TTL_MS = 5 * 60 * 1000;
// First-scan status lookups: smaller multi requests processed a few at a
// time keep AnkiConnect responsive instead of one thundering-herd request
// that blocks Anki's UI thread while the whole page resolves.
const ANKI_STATUS_LOOKUP_TERM_CHUNK_SIZE = 50;
const ANKI_STATUS_LOOKUP_CHUNK_CONCURRENCY = 3;
const ANKI_CONNECT_REQUEST_TIMEOUT_MS = 5_000;
const ANKI_BACKGROUND_REQUEST_TIMEOUT_MS = 1_500;
const ANKI_BACKGROUND_AVAILABILITY_TTL_MS = 15_000;
const ANKI_BACKGROUND_UNAVAILABLE_COOLDOWN_MS = 60_000;
const ANKI_STATUS_INDEX_BACKGROUND_REFRESH_DELAY_MS = 2_500;
const ANKI_MODEL_SCAN_SAMPLE_NOTE_LIMIT = 24;
const ANKI_MODEL_SCAN_CONCURRENCY = 3;
const ANKI_STATUS_INDEX_CARD_CHUNK_SIZE = 500;
const ANKI_EDITED_SWEEP_MAX_DAYS = 30;
const ANKI_EDITED_SWEEP_MOD_LIMIT = 2_000;
const ANKI_EDITED_SWEEP_DAY_MS = 24 * 60 * 60 * 1000;
const ANKI_STATUS_INDEX_CARD_CONCURRENCY = 3;
const ANKI_RENDERED_MEDIA_LIMIT = 12;
const ANKI_RENDERED_MEDIA_CONCURRENCY = 3;
const ANKI_PRONUNCIATION_AUDIO_FIELD_NAMES = ['Pronunciation'];
const ANKI_MOBILE_FALLBACK_DECK = 'Default';
const YOMU_DEFAULT_DECK_NAMES = new Set(['よむ', 'yomu']);
const log = Logger.scope('Anki');
const ANKI_EASE_BY_GRADE: Record<JPDBGrade, number> = {
    nothing: 1,
    fail: 1,
    something: 2,
    hard: 2,
    okay: 3,
    pass: 3,
    easy: 4,
};
export const YOMU_MODEL_FIELDS = [
    'Expression',
    'Reading',
    'Meaning',
    'Sentence',
    'Url',
    'Frequency',
    'PartOfSpeech',
    'Image',
    'Audio',
    'JPDB',
    'Status',
    'Pitch',
    'DictionaryDefinitions',
    'Kanji',
    'Source',
];

export function ankiLookupWithUnavailableDetails(lookup: AnkiLookupResult): AnkiLookupResult {
    const mark = (note: AnkiExistingNote): AnkiExistingNote => ankiNoteHasRenderableDetails(note)
        ? note
        : { ...note, detailsUnavailable: true };
    const notes = lookup.notes.map(mark);
    const primary = lookup.primary ? mark(lookup.primary) : null;
    return { ...lookup, notes, primary };
}

export class AnkiDuplicateNoteError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AnkiDuplicateNoteError';
    }
}

export function isAnkiDuplicateNoteError(error: unknown): error is AnkiDuplicateNoteError {
    return error instanceof AnkiDuplicateNoteError;
}

interface PendingAnkiLookupGroup {
    card: JPDBCard;
    indexes: number[];
    cacheKey: string;
}

interface StatusIndexRefreshOptions {
    rebuildIfMissing?: boolean;
    deferDirtyIfCountUnchanged?: boolean;
}

interface StatusIndexRefreshDecision {
    handled: boolean;
    index: AnkiStatusIndex | null;
}

interface PendingLookupBatches {
    inFlight: Array<[PendingAnkiLookupGroup, Promise<AnkiLookupResult>]>;
    uncached: PendingAnkiLookupGroup[];
    pendingByCacheKey: Map<string, PendingAnkiLookupGroup>;
}

interface CachedStatusLookupContext {
    canTrustStatusMiss: boolean;
    canUseStatusIndexHits: boolean;
    hasActiveRebuildLease: boolean;
    statusEntries: Map<string, AnkiStatusIndexEntry> | null;
    statusIndex: AnkiStatusIndex | null;
}

interface StatusIndexRebuildContext {
    allCardIds: number[];
    cardData: AnkiStatusIndexCardData;
    noteIds: number[];
    now: number;
    rebuildLeaseOwner?: string;
    settings: ReaderSettings;
    settingsKey: string;
}

interface MatchingAnkiNotesByLookupKey {
    notesByCacheKey: Map<string, AnkiNoteInfo[]>;
    uniqueNotes: AnkiNoteInfo[];
}

export class AnkiConnectClient {
    private lookupCache = new Map<string, { at: number; result: AnkiLookupResult }>();
    private statusLookupCache = new Map<string, { at: number; result: AnkiLookupResult }>();
    private lookupInflight = new Map<string, Promise<AnkiLookupResult>>();
    private statusIndex?: AnkiStatusIndex | null;
    private statusIndexLoad?: Promise<AnkiStatusIndex | null>;
    private statusIndexRefresh?: Promise<AnkiStatusIndex | null>;
    private statusIndexRefreshQueued = false;
    private availabilityProbe?: Promise<boolean>;
    private availabilityCheckedAt = 0;
    private unavailableUntil = 0;
    private fieldTargetPlanCache?: { key: string; expiresAt: number; promise: Promise<AnkiNoteFieldTargetPlan | null> };
    private isDestroyed = false;
    private focusStatusRefreshListener?: () => void;
    private lastFocusStatusRefreshAt = 0;

    constructor(private getSettings: () => ReaderSettings) {
        this.installFocusStatusRefresh();
    }

    destroy(): void {
        this.isDestroyed = true;
        this.lookupInflight.clear();
        this.statusIndexLoad = undefined;
        this.statusIndexRefresh = undefined;
        this.statusIndexRefreshQueued = false;
        this.availabilityProbe = undefined;
        if (this.focusStatusRefreshListener) {
            window.removeEventListener('focus', this.focusStatusRefreshListener);
            document.removeEventListener('visibilitychange', this.focusStatusRefreshListener);
            this.focusStatusRefreshListener = undefined;
        }
    }

    // The status index is validated by deck card COUNT, which misses reviews
    // done in Anki itself (state changes, same count). Returning to the tab
    // after being away is exactly when that happens, so expire the index then.
    private installFocusStatusRefresh(): void {
        if (typeof window === 'undefined') return;
        this.focusStatusRefreshListener = () => {
            if (this.isDestroyed || document.visibilityState === 'hidden') return;
            const awayMs = Date.now() - this.lastFocusStatusRefreshAt;
            if (awayMs < ANKI_STATUS_INDEX_FOCUS_REFRESH_MIN_MS) return;
            this.lastFocusStatusRefreshAt = Date.now();
            const index = this.validStatusIndex(this.statusIndex);
            if (!index) return;
            this.statusIndex = { ...index, syncedAt: 0, checkedAt: 0, dirtyAt: Date.now() };
            this.queueStatusIndexRefresh();
        };
        window.addEventListener('focus', this.focusStatusRefreshListener);
        document.addEventListener('visibilitychange', this.focusStatusRefreshListener);
    }

    // Used by settings connection checks through the Anki client dependency.
    async isConnected(): Promise<boolean> {
        try {
            await this.invoke<number>('version');
            this.markAvailable();
            return true;
        } catch (error) {
            log.warnOnce('connection-unavailable', 'AnkiConnect unavailable', error);
            return false;
        }
    }

    async isAvailableForBackground(): Promise<boolean> {
        if (this.isDestroyed) return false;
        if (this.isLookupCoolingDown()) return false;
        const now = Date.now();
        if (now - this.availabilityCheckedAt < ANKI_BACKGROUND_AVAILABILITY_TTL_MS) return true;
        if (this.availabilityProbe) return this.availabilityProbe;
        this.availabilityProbe = this.invokeWithTimeout<number>('version', {}, ANKI_BACKGROUND_REQUEST_TIMEOUT_MS)
            .then(() => {
                if (this.isDestroyed) return false;
                this.markAvailable();
                return true;
            })
            .catch(error => {
                log.warnOnce('background-availability-unavailable', 'AnkiConnect unavailable for background work', error);
                this.unavailableUntil = Date.now() + ANKI_BACKGROUND_UNAVAILABLE_COOLDOWN_MS;
                return false;
            })
            .finally(() => {
                this.availabilityProbe = undefined;
            });
        return this.availabilityProbe;
    }

    async deckNames(): Promise<string[]> {
        const decks = await this.invoke<string[]>('deckNames');
        return decks;
    }

    async modelNames(): Promise<string[]> {
        const models = await this.invoke<string[]>('modelNames');
        return models;
    }

    // Mirrors prepareAnkiNoteForConnect's decision so card previews can show
    // exactly which fields a mining write will target instead of silently
    // retargeting into an existing non-Yomu model at write time.
    async noteFieldTargetPlan(): Promise<AnkiNoteFieldTargetPlan | null> {
        const settings = this.getSettings();
        if (!settings.ankiEnabled) return null;
        if (canUseMobileAnkiHandoff(settings) && !hasUserscriptAnkiBridge()) return null;
        const modelName = resolvedAnkiModelName(settings);
        const key = `${settings.ankiConnectUrl}|${modelName}`;
        const now = Date.now();
        if (this.fieldTargetPlanCache?.key === key && this.fieldTargetPlanCache.expiresAt > now) return this.fieldTargetPlanCache.promise;
        const promise = this.loadNoteFieldTargetPlan(modelName, settings).catch((): null => null);
        this.fieldTargetPlanCache = { key, expiresAt: now + ANKI_FIELD_TARGET_PLAN_TTL_MS, promise };
        return promise;
    }

    private async loadNoteFieldTargetPlan(modelName: string, settings: ReaderSettings): Promise<AnkiNoteFieldTargetPlan | null> {
        const modelNames = await this.modelNames();
        // A missing model is created as a Yomu-managed model on first write.
        if (!modelNames.includes(modelName)) return { modelName, yomuManaged: true, fieldNames: [] };
        const fieldNames = await this.invokeOrDefault<string[]>('modelFieldNames', { modelName }, []);
        return { modelName, yomuManaged: shouldTreatExistingModelAsYomuManaged(modelName, settings, fieldNames), fieldNames };
    }

    // Used by settings library scan through the Anki client dependency.
    async scanLibrary(): Promise<AnkiLibraryScanResult> {
        const [deckNames, modelNames] = await Promise.all([
            this.deckNames().catch((): string[] => []),
            this.modelNames().catch((): string[] => []),
        ]);
        const models: AnkiModelScanResult[] = [];
        await runLimited(modelNames, ANKI_MODEL_SCAN_CONCURRENCY, async modelName => {
            const [fields, sampleNotes] = await Promise.all([
                this.invokeOrDefault<string[]>('modelFieldNames', { modelName }, []),
                this.sampleModelNotes(modelName),
            ]);
            models.push(scanAnkiModelFields(modelName, fields, sampleNotes));
        });
        const sortedModels = [...models].sort((a, b) => b.score - a.score || a.modelName.localeCompare(b.modelName));
        return {
            deckNames,
            models: sortedModels,
            suggestedModel: sortedModels[0] ?? null,
        };
    }

    private async sampleModelNotes(modelName: string): Promise<AnkiNoteInfo[]> {
        const noteIds = await this.invokeOrDefault<number[]>('findNotes', { query: `note:${quoteAnkiSearch(modelName)}` }, []);
        const sampleIds = Array.isArray(noteIds)
            ? unique(noteIds.map(Number).filter(Number.isFinite)).slice(0, ANKI_MODEL_SCAN_SAMPLE_NOTE_LIMIT)
            : [];
        if (!sampleIds.length) return [];
        return await this.invokeOrDefault<AnkiNoteInfo[]>('notesInfo', { notes: sampleIds }, []);
    }

    warmStatusIndex(): Promise<AnkiStatusIndex | null> {
        if (this.isDestroyed) return Promise.resolve(null);
        return this.refreshStatusIndexIfNeeded({ rebuildIfMissing: true }) ?? this.loadStatusIndex();
    }

    async findExistingCards(card: JPDBCard): Promise<AnkiLookupResult> {
        return (await this.findExistingCardsBatch([card]))[0] ?? emptyAnkiLookupResult();
    }

    async findCachedStatusBatch(cards: JPDBCard[]): Promise<AnkiLookupResult[]> {
        const empty = emptyAnkiLookupResult();
        const untrustedEmpty = untrustedAnkiLookupResult();
        if (!cards.length) return [];
        if (!this.canUseCachedStatusLookup()) return cards.map(() => untrustedEmpty);

        const results: AnkiLookupResult[] = cards.map(() => untrustedEmpty);
        const pending = this.collectPendingLookupGroups(cards, results, cacheKey => this.readStatusLookupCache(cacheKey));
        if (!pending.length) return results;

        const context = await this.cachedStatusLookupContext(pending);
        if (this.isDestroyed) return cards.map(() => untrustedEmpty);
        const unresolved = this.applyCachedStatusLookupPlan(
            pending,
            results,
            context.statusIndex,
            context.statusEntries,
            context.canUseStatusIndexHits,
            context.canTrustStatusMiss,
            empty,
        );
        await this.resolveUncachedStatusLookups(unresolved, results, empty);
        return results;
    }

    private canUseCachedStatusLookup(): boolean {
        if (this.isDestroyed) return false;
        if (!this.getSettings().ankiEnabled) return false;
        return !this.isLookupCoolingDown();
    }

    private queueStatusIndexRefreshForLookup(statusIndex: AnkiStatusIndex | null): void {
        if (!statusIndex || this.statusIndexNeedsCountCheck(statusIndex) || this.statusIndexIsTooStale(statusIndex)) {
            this.queueStatusIndexRefresh({ rebuildIfMissing: false });
        }
    }

    private async cachedStatusLookupContext(pending: PendingAnkiLookupGroup[]): Promise<CachedStatusLookupContext> {
        const statusIndex = await this.loadStatusIndex();
        if (statusIndex) this.queueStatusIndexRefreshForLookup(statusIndex);
        const statusEntries = await this.loadStatusEntriesForCards(statusIndex, pending.map(item => item.card));
        const canUseStatusIndexHits = this.canUseStatusIndexHits(statusIndex);
        const hasActiveRebuildLease = this.hasActiveStatusIndexRebuildLease(statusIndex);
        return {
            statusIndex,
            statusEntries,
            canUseStatusIndexHits,
            hasActiveRebuildLease,
            canTrustStatusMiss: this.canTrustStatusIndexMiss(statusIndex, {
                canUseStatusIndexHits,
                hasActiveRebuildLease,
                statusEntries,
            }),
        };
    }

    private canUseStatusIndexHits(statusIndex: AnkiStatusIndex | null): boolean {
        return Boolean(statusIndex && this.statusIndexHasEntries(statusIndex));
    }

    private hasActiveStatusIndexRebuildLease(statusIndex: AnkiStatusIndex | null): boolean {
        return Boolean(activeAnkiStatusIndexRebuildLease(statusIndex?.settingsKey));
    }

    private canTrustStatusIndexMiss(
        statusIndex: AnkiStatusIndex | null,
        context: Pick<CachedStatusLookupContext, 'canUseStatusIndexHits' | 'hasActiveRebuildLease' | 'statusEntries'>,
    ): boolean {
        if (!statusIndex) return false;
        if (!context.canUseStatusIndexHits || context.hasActiveRebuildLease) return false;
        if (!this.isStatusIndexFreshForMissTrust(statusIndex)) return false;
        if (this.hasPendingStatusIndexRefresh()) return false;
        if (this.statusIndexNeedsCountCheck(statusIndex)) return false;
        if (this.statusIndexIsTooStale(statusIndex)) return false;
        return this.hasStatusIndexMissCoverage(statusIndex, context.statusEntries);
    }

    private isStatusIndexFreshForMissTrust(statusIndex: AnkiStatusIndex): boolean {
        return statusIndex.syncedAt > 0 && !this.statusIndexIsDirty(statusIndex);
    }

    private hasPendingStatusIndexRefresh(): boolean {
        return Boolean(this.statusIndexRefresh || this.statusIndexRefreshQueued);
    }

    private hasStatusIndexMissCoverage(
        statusIndex: AnkiStatusIndex,
        statusEntries: Map<string, AnkiStatusIndexEntry> | null,
    ): boolean {
        return statusIndex.entryStore !== 'indexeddb' || Boolean(statusEntries);
    }

    private applyCachedStatusLookupPlan(
        pending: PendingAnkiLookupGroup[],
        results: AnkiLookupResult[],
        statusIndex: AnkiStatusIndex | null,
        statusEntries: Map<string, AnkiStatusIndexEntry> | null,
        canUseStatusIndexHits: boolean,
        canTrustStatusMiss: boolean,
        empty: AnkiLookupResult,
    ): PendingAnkiLookupGroup[] {
        const unresolved: PendingAnkiLookupGroup[] = [];
        for (const group of pending) {
            const indexed = canUseStatusIndexHits
                ? this.lookupStatusIndex(statusIndex, group.card, statusEntries)
                : null;
            if (indexed) {
                this.writeStatusLookupCache(group.cacheKey, indexed);
                this.applyLookupGroupResult(results, group.indexes, indexed);
                continue;
            }
            if (!canTrustStatusMiss) {
                unresolved.push(group);
                continue;
            }
            this.writeStatusLookupCache(group.cacheKey, empty);
            this.applyLookupGroupResult(results, group.indexes, empty);
        }
        return unresolved;
    }

    private async resolveUncachedStatusLookups(
        unresolved: PendingAnkiLookupGroup[],
        results: AnkiLookupResult[],
        empty: AnkiLookupResult,
    ): Promise<void> {
        if (!unresolved.length) return;
        this.queueStatusIndexRefresh();
        try {
            const resolved = await this.findExistingCardsBatchUncachedWithInflight(unresolved, empty);
            for (const group of unresolved) {
                const result = resolved.get(group.cacheKey) ?? empty;
                this.writeStatusLookupCache(group.cacheKey, result);
                this.applyLookupGroupResult(results, group.indexes, result);
            }
        } catch (error) {
            log.warn('Exact Anki status lookup failed', error);
        }
    }

    private collectPendingLookupGroups(
        cards: JPDBCard[],
        results: AnkiLookupResult[],
        readCache: (cacheKey: string) => AnkiLookupResult | null,
    ): PendingAnkiLookupGroup[] {
        const pendingByCacheKey = new Map<string, PendingAnkiLookupGroup>();
        cards.forEach((card, index) => {
            const cacheKey = this.lookupCacheKey(card);
            const cached = readCache(cacheKey);
            if (cached) {
                results[index] = cached;
                return;
            }
            let pending = pendingByCacheKey.get(cacheKey);
            if (!pending) {
                pending = { card, indexes: [], cacheKey };
                pendingByCacheKey.set(cacheKey, pending);
            }
            pending.indexes.push(index);
        });
        return [...pendingByCacheKey.values()];
    }

    async findExistingCardsBatch(cards: JPDBCard[]): Promise<AnkiLookupResult[]> {
        const empty = emptyAnkiLookupResult();
        if (!cards.length) return [];
        if (this.isDestroyed) return cards.map(() => empty);
        const results: AnkiLookupResult[] = cards.map(() => empty);
        const pending = this.collectPendingLookupGroups(cards, results, cacheKey => this.readLookupCache(cacheKey));
        if (!pending.length) return results;

        const batches = this.pendingLookupBatches(pending);

        try {
            const done = log.time('findExistingCardsBatch', { terms: pending.length, inFlight: batches.inFlight.length });
            if (batches.inFlight.length) await this.applyInFlightLookupResults(batches.inFlight, results);
            if (this.isDestroyed) return results;
            const resolved = await this.resolveUncachedLookupBatches(batches.uncached, empty);
            if (this.isDestroyed) return results;
            this.applyResolvedLookupResults(resolved, batches.pendingByCacheKey, results);
            done();
            return results;
        } catch (error) {
            log.warn('Anki batch lookup failed', { terms: pending.length }, error);
            this.unavailableUntil = Date.now() + ANKI_BACKGROUND_UNAVAILABLE_COOLDOWN_MS;
            return results;
        }
    }

    private pendingLookupBatches(pending: PendingAnkiLookupGroup[]): PendingLookupBatches {
        const inFlight: Array<[PendingAnkiLookupGroup, Promise<AnkiLookupResult>]> = [];
        const uncached: PendingAnkiLookupGroup[] = [];
        const pendingByCacheKey = new Map(pending.map(group => [group.cacheKey, group]));
        for (const group of pending) {
            const promise = this.lookupInflight.get(group.cacheKey);
            if (promise) inFlight.push([group, promise]);
            else uncached.push(group);
        }
        return { inFlight, uncached, pendingByCacheKey };
    }

    private async applyInFlightLookupResults(
        inFlight: Array<[PendingAnkiLookupGroup, Promise<AnkiLookupResult>]>,
        results: AnkiLookupResult[],
    ): Promise<void> {
        await Promise.all(inFlight.map(async ([group, promise]) => {
            const result = await promise;
            if (this.isDestroyed) return;
            this.writeLookupCache(group.cacheKey, result);
            this.applyLookupGroupResult(results, group.indexes, result);
        }));
    }

    private async resolveUncachedLookupBatches(
        uncached: PendingAnkiLookupGroup[],
        empty: AnkiLookupResult,
    ): Promise<Map<string, AnkiLookupResult>> {
        return uncached.length
            ? await this.findExistingCardsBatchUncachedWithInflight(uncached, empty)
            : new Map<string, AnkiLookupResult>();
    }

    private applyResolvedLookupResults(
        resolved: Map<string, AnkiLookupResult>,
        pendingByCacheKey: Map<string, PendingAnkiLookupGroup>,
        results: AnkiLookupResult[],
    ): void {
        for (const [cacheKey, result] of resolved) {
            this.writeLookupCache(cacheKey, result);
            const indexes = pendingByCacheKey.get(cacheKey)?.indexes;
            if (indexes) this.applyLookupGroupResult(results, indexes, result);
        }
    }

    private lookupCacheKey(card: JPDBCard): string {
        return lookupKeyTermsForCard(card).join('|');
    }

    private applyLookupGroupResult(results: AnkiLookupResult[], indexes: number[], result: AnkiLookupResult): void {
        indexes.forEach(index => {
            results[index] = result;
        });
    }

    private statusIndexSettingsKey(settings = this.getSettings()): string {
        const fieldMappings = ankiFieldMappingsSettingsKey(settings.ankiFieldMappings);
        return JSON.stringify({
            url: settings.ankiConnectUrl || 'http://127.0.0.1:8765',
            ...(Object.keys(fieldMappings).length ? { fieldMappings } : {}),
        });
    }

    private loadStatusIndex(): Promise<AnkiStatusIndex | null> {
        if (this.statusIndex !== undefined) return Promise.resolve(this.validStatusIndex(this.statusIndex));
        const syncIndex = this.validStatusIndex(gmStorageGetSync<AnkiStatusIndex | null>(ANKI_STATUS_INDEX_STORAGE_KEY, null));
        if (syncIndex && syncIndex.entryStore !== 'indexeddb') {
            this.statusIndex = syncIndex;
            return Promise.resolve(syncIndex);
        }
        if (!this.statusIndexLoad) {
            this.statusIndexLoad = this.loadStoredStatusIndex()
                .then(index => {
                    this.statusIndex = index;
                    return this.statusIndex;
                })
                .finally(() => {
                    this.statusIndexLoad = undefined;
                });
        }
        return this.statusIndexLoad;
    }

    private async loadStoredStatusIndex(): Promise<AnkiStatusIndex | null> {
        const indexed = await loadAnkiStatusIndexFromIndexedDb().catch(error => {
            log.warn('Anki status load failed', error);
            return null;
        });
        const validIndexed = this.validStatusIndex(indexed);
        if (validIndexed) return validIndexed;
        const stored = await gmStorageGet<AnkiStatusIndex | null>(ANKI_STATUS_INDEX_STORAGE_KEY, null);
        const validStored = this.validStatusIndex(stored);
        return validStored?.entryStore === 'indexeddb' ? null : validStored;
    }

    private validStatusIndex(index: AnkiStatusIndex | null | undefined): AnkiStatusIndex | null {
        if (!index || index.version !== ANKI_STATUS_INDEX_VERSION) return null;
        return index.settingsKey === this.statusIndexSettingsKey() ? index : null;
    }

    private async loadStatusEntriesForCards(
        index: AnkiStatusIndex | null,
        cards: JPDBCard[],
    ): Promise<Map<string, AnkiStatusIndexEntry> | null> {
        if (!index) return null;
        if (index.entryStore !== 'indexeddb') return null;
        const keys = unique(cards.flatMap(statusIndexKeysForCard));
        if (!keys.length) return new Map();
        return loadAnkiStatusIndexEntriesFromIndexedDb(keys).catch(error => {
            log.warn('Anki status entry failed', error);
            return null;
        });
    }

    private lookupStatusIndex(
        index: AnkiStatusIndex | null,
        card: JPDBCard,
        entries?: Map<string, AnkiStatusIndexEntry> | null,
    ): AnkiLookupResult | null {
        const entry = index ? statusIndexEntryForCard(index, card, entries) : null;
        if (!entry) return null;
        if (index?.dirtyAt && (!entry.updatedAt || entry.updatedAt < index.dirtyAt)) return null;
        const note: AnkiExistingNote = {
            noteId: entry.noteId,
            modelName: entry.modelName,
            deckNames: entry.deckNames,
            cardIds: entry.primaryCardId ? [entry.primaryCardId] : [],
            primaryCardId: entry.primaryCardId,
            state: entry.state,
            fields: {},
            tags: [],
            reps: entry.reps,
            lapses: entry.lapses,
        };
        return {
            state: entry.state,
            notes: [note],
            primary: note,
        };
    }

    private statusIndexHasEntries(index: AnkiStatusIndex): boolean {
        return index.cardCount === 0 || (index.entryCount ?? Object.keys(index.entries).length) > 0;
    }

    private refreshStatusIndexIfNeeded(options: StatusIndexRefreshOptions = {}): Promise<AnkiStatusIndex | null> | null {
        if (this.isDestroyed || this.isLookupCoolingDown()) return null;
        if (this.statusIndexRefresh) return this.statusIndexRefresh;
        this.statusIndexRefresh = this.runStatusIndexRefresh(options)
            .catch(error => {
                log.warn('Anki status index refresh failed', error);
                return null;
            })
            .finally(() => {
                this.statusIndexRefresh = undefined;
            });
        return this.statusIndexRefresh;
    }

    private async runStatusIndexRefresh(options: StatusIndexRefreshOptions): Promise<AnkiStatusIndex | null> {
        const index = await this.loadStatusIndex();
        if (this.isDestroyed) return null;
        const now = Date.now();
        const needsReadingKeyRefresh = this.statusIndexNeedsReadingKeyRefresh(index);
        if (this.canReuseRecentlyCheckedStatusIndex(index, needsReadingKeyRefresh, now)) return index;
        if (this.shouldSkipMissingStatusIndexRebuild(index, options)) return null;
        if (!await this.isAvailableForBackground()) return index;
        if (this.isDestroyed) return null;

        const countCheck = await this.refreshStatusIndexFromCollectionCount(index, needsReadingKeyRefresh, now, options);
        if (countCheck.handled) return countCheck.index;
        return this.rebuildStatusIndexWithLease(index, needsReadingKeyRefresh);
    }

    private statusIndexNeedsReadingKeyRefresh(index: AnkiStatusIndex | null): boolean {
        return Boolean(index && !index.readingKeys);
    }

    private statusIndexIsDirty(index: AnkiStatusIndex): boolean {
        const dirtyAt = Number(index.dirtyAt) || 0;
        return dirtyAt > 0 && index.syncedAt <= dirtyAt;
    }

    private canReuseRecentlyCheckedStatusIndex(
        index: AnkiStatusIndex | null,
        needsReadingKeyRefresh: boolean,
        now: number,
    ): index is AnkiStatusIndex {
        return Boolean(index
            && !needsReadingKeyRefresh
            && !this.statusIndexIsDirty(index)
            && index.syncedAt > 0
            && now - index.syncedAt < ANKI_STATUS_INDEX_MAX_STALE_MS
            && now - index.checkedAt < ANKI_STATUS_INDEX_COUNT_CHECK_MS);
    }

    private shouldSkipMissingStatusIndexRebuild(index: AnkiStatusIndex | null, options: StatusIndexRefreshOptions): boolean {
        return !index && !options.rebuildIfMissing;
    }

    private async refreshStatusIndexFromCollectionCount(
        index: AnkiStatusIndex | null,
        needsReadingKeyRefresh: boolean,
        now: number,
        options: StatusIndexRefreshOptions,
    ): Promise<StatusIndexRefreshDecision> {
        if (!index) return { handled: false, index: null };
        const deckStatsCardCount = await this.collectionCardCountFromDeckStats();
        if (this.isDestroyed) return { handled: true, index: null };
        if (this.canMarkStatusIndexCountCurrent(index, deckStatsCardCount, needsReadingKeyRefresh, now)) {
            // Same-count edits (reviews done in Anki itself, field edits) are
            // invisible to the count gate. Sweep recently-edited cards by
            // mod-time (asbplayer's cardsModTime pattern) and fall through to
            // the dirty path when anything changed since the last sync —
            // incremental-refresh ticket; the sweep failing (old AnkiConnect)
            // leaves the count gate as before.
            const edited = await this.statusIndexEditedSinceSync(index, now);
            if (this.isDestroyed) return { handled: true, index: null };
            if (!edited) {
                return { handled: true, index: await this.saveCheckedStatusIndex(index, now) };
            }
            const dirty: AnkiStatusIndex = { ...index, syncedAt: 0, checkedAt: 0, dirtyAt: now };
            this.statusIndex = dirty;
            await saveAnkiStatusIndexDirtyMarker(dirty).catch(error => {
                log.warn('Anki edited-sweep dirty marker failed', error);
            });
            return { handled: false, index: dirty };
        }
        if (this.canDeferStatusIndexRebuild(index, needsReadingKeyRefresh, options)) {
            return { handled: true, index: await this.saveCheckedStatusIndex(index, now, deckStatsCardCount) };
        }
        return { handled: false, index };
    }

    private async statusIndexEditedSinceSync(index: AnkiStatusIndex, now: number): Promise<boolean> {
        const sinceMs = index.syncedAt;
        if (!(sinceMs > 0)) return false;
        const days = Math.min(ANKI_EDITED_SWEEP_MAX_DAYS, Math.max(1, Math.ceil((now - sinceMs) / ANKI_EDITED_SWEEP_DAY_MS) + 1));
        try {
            const ids = await this.invoke<number[]>('findCards', { query: `edited:${days}` });
            if (this.isDestroyed || !ids.length) return false;
            const mods = await this.invoke<Array<{ cardId: number; mod: number }>>('cardsModTime', { cards: ids.slice(0, ANKI_EDITED_SWEEP_MOD_LIMIT) });
            const sinceSeconds = Math.floor(sinceMs / 1000);
            return mods.some(entry => Number(entry?.mod) > sinceSeconds);
        } catch {
            // cardsModTime needs AnkiConnect >= 23; without it the count gate
            // keeps working exactly as before.
            return false;
        }
    }

    private canMarkStatusIndexCountCurrent(
        index: AnkiStatusIndex,
        deckStatsCardCount: number | null,
        needsReadingKeyRefresh: boolean,
        now: number,
    ): boolean {
        return !needsReadingKeyRefresh
            && !this.statusIndexIsDirty(index)
            && deckStatsCardCount !== null
            && deckStatsCardCount === index.cardCount
            && index.syncedAt >= 0
            && now >= index.syncedAt;
    }

    private canDeferStatusIndexRebuild(
        index: AnkiStatusIndex,
        needsReadingKeyRefresh: boolean,
        options: StatusIndexRefreshOptions,
    ): boolean {
        return Boolean(index
            && !needsReadingKeyRefresh
            && (!this.statusIndexIsDirty(index) || options.deferDirtyIfCountUnchanged)
            && !options.rebuildIfMissing);
    }

    private async saveCheckedStatusIndex(
        index: AnkiStatusIndex,
        checkedAt: number,
        deckStatsCardCount?: number | null,
    ): Promise<AnkiStatusIndex> {
        const cardCountChanged = deckStatsCardCount !== undefined
            && deckStatsCardCount !== null
            && deckStatsCardCount !== index.cardCount;
        const checked: AnkiStatusIndex = {
            ...index,
            checkedAt,
            ...(deckStatsCardCount !== undefined && deckStatsCardCount !== null ? { cardCount: deckStatsCardCount } : {}),
            ...(cardCountChanged ? { syncedAt: 0 } : {}),
        };
        this.statusIndex = checked;
        await saveAnkiStatusIndexCheckedAt(checked);
        return checked;
    }

    private async rebuildStatusIndexWithLease(
        index: AnkiStatusIndex | null,
        needsReadingKeyRefresh: boolean,
    ): Promise<AnkiStatusIndex | null> {
        const settingsKey = this.statusIndexSettingsKey();
        const rebuildLeaseOwner = claimAnkiStatusIndexRebuildLease(settingsKey);
        if (!rebuildLeaseOwner) return index;
        try {
            return await this.rebuildStatusIndexWithClaimedLease(
                index,
                needsReadingKeyRefresh,
                settingsKey,
                rebuildLeaseOwner,
            );
        } finally {
            releaseAnkiStatusIndexRebuildLease(rebuildLeaseOwner);
        }
    }

    private async rebuildStatusIndexWithClaimedLease(
        index: AnkiStatusIndex | null,
        needsReadingKeyRefresh: boolean,
        settingsKey: string,
        rebuildLeaseOwner: string,
    ): Promise<AnkiStatusIndex | null> {
        const rebuildStartedAt = Date.now();
        const cardIds = await this.invoke<number[]>('findCards', { query: 'deck:*' });
        touchAnkiStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
        if (this.isDestroyed) return null;
        if (this.canReuseStatusIndexAfterCardScan(index, needsReadingKeyRefresh, cardIds.length, rebuildStartedAt)) {
            return await this.saveCheckedStatusIndex(index, rebuildStartedAt);
        }
        return await this.rebuildStatusIndex(cardIds, rebuildStartedAt, rebuildLeaseOwner);
    }

    private canReuseStatusIndexAfterCardScan(
        index: AnkiStatusIndex | null,
        needsReadingKeyRefresh: boolean,
        scannedCardCount: number,
        rebuildStartedAt: number,
    ): index is AnkiStatusIndex {
        return Boolean(index
            && !needsReadingKeyRefresh
            && scannedCardCount === index.cardCount
            && rebuildStartedAt - index.syncedAt < ANKI_STATUS_INDEX_MAX_STALE_MS);
    }

    private queueStatusIndexRefresh(options: StatusIndexRefreshOptions = {}): void {
        if (this.isDestroyed || this.isLookupCoolingDown() || this.statusIndexRefresh || this.statusIndexRefreshQueued) return;
        this.statusIndexRefreshQueued = true;
        const run = () => {
            this.statusIndexRefreshQueued = false;
            if (this.isDestroyed) return;
            void this.refreshStatusIndexIfNeeded(options)?.catch(error => {
                log.warn('Queued Anki status index refresh failed', error);
                return null;
            });
        };
        if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
            window.setTimeout(run, ANKI_STATUS_INDEX_BACKGROUND_REFRESH_DELAY_MS);
        } else {
            void Promise.resolve().then(run);
        }
    }

    private statusIndexNeedsCountCheck(index: AnkiStatusIndex, now = Date.now()): boolean {
        return now - index.checkedAt >= ANKI_STATUS_INDEX_COUNT_CHECK_MS;
    }

    private statusIndexIsTooStale(index: AnkiStatusIndex, now = Date.now()): boolean {
        return now - index.syncedAt >= ANKI_STATUS_INDEX_MAX_STALE_MS;
    }

    private async collectionCardCountFromDeckStats(): Promise<number | null> {
        const deckNames = await this.deckNames().catch((): string[] => []);
        if (!Array.isArray(deckNames) || !deckNames.length) return null;
        const stats = await this.invokeOrDefault<Record<string, AnkiDeckStats> | null>('getDeckStats', { decks: deckNames }, null);
        if (!stats || typeof stats !== 'object') return null;
        const totals = Object.values(stats)
            .map(deck => Number(deck?.total_in_deck))
            .filter(count => Number.isFinite(count) && count >= 0);
        if (!totals.length) return null;
        return totals.reduce((sum, count) => sum + count, 0);
    }

    async rebuildStatusIndex(cardIds?: number[], now = Date.now(), rebuildLeaseOwner?: string): Promise<AnkiStatusIndex | null> {
        const rebuild = await this.loadStatusIndexRebuildContext(cardIds, now, rebuildLeaseOwner);
        if (!rebuild) return null;
        const indexed = await this.tryRebuildStatusIndexToIndexedDb(rebuild);
        if (indexed || this.isDestroyed) return indexed;
        return await this.rebuildStatusIndexToValueStorage(rebuild);
    }

    private async loadStatusIndexRebuildContext(
        cardIds: number[] | undefined,
        now: number,
        rebuildLeaseOwner?: string,
    ): Promise<StatusIndexRebuildContext | null> {
        if (this.isDestroyed) return null;
        const settings = this.getSettings();
        const settingsKey = this.statusIndexSettingsKey(settings);
        this.touchStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
        const allCardIds = cardIds ?? await this.invoke<number[]>('findCards', { query: 'deck:*' });
        if (this.isDestroyed) return null;
        this.touchStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
        const cardData = await this.loadStatusIndexCardData(allCardIds, rebuildLeaseOwner, settingsKey);
        if (this.isDestroyed) return null;
        this.touchStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
        const noteIds = this.statusIndexNoteIdsFromCardData(cardData) ?? await this.findStatusIndexNoteIds(allCardIds);
        if (this.isDestroyed) return null;
        this.touchStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
        return { allCardIds, cardData, noteIds, now, rebuildLeaseOwner, settings, settingsKey };
    }

    private touchStatusIndexRebuildLease(rebuildLeaseOwner: string | undefined, settingsKey: string): void {
        if (rebuildLeaseOwner) touchAnkiStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
    }

    private async findStatusIndexNoteIds(allCardIds: number[]): Promise<number[]> {
        return allCardIds.length
            ? await this.invokeOrDefault<number[]>('findNotes', { query: 'deck:*' }, [])
            : [];
    }

    private statusIndexNoteIdsFromCardData(cardData: AnkiStatusIndexCardData): number[] | null {
        const noteIds = [...cardData.cardsByNote.keys()].filter(Number.isFinite);
        return noteIds.length ? noteIds : null;
    }

    private async tryRebuildStatusIndexToIndexedDb(rebuild: StatusIndexRebuildContext): Promise<AnkiStatusIndex | null> {
        if (!canUseIndexedDb()) return null;
        return await this.rebuildStatusIndexToIndexedDb(
            rebuild.noteIds,
            rebuild.cardData,
            rebuild.allCardIds.length,
            rebuild.now,
            rebuild.settings,
            rebuild.settingsKey,
            rebuild.rebuildLeaseOwner,
        ).catch(error => {
            log.warn('Anki status rebuild fell back', error);
            return null;
        });
    }

    private async rebuildStatusIndexToValueStorage(rebuild: StatusIndexRebuildContext): Promise<AnkiStatusIndex | null> {
        const { allCardIds, cardData, noteIds, now, rebuildLeaseOwner, settings, settingsKey } = rebuild;
        const noteChunks = chunkArray(noteIds, ANKI_STATUS_INDEX_NOTE_CHUNK_SIZE);
        const notesByChunk: AnkiNoteInfo[][] = Array.from({ length: noteChunks.length }, () => []);
        await runLimited(noteChunks, ANKI_STATUS_INDEX_NOTE_CONCURRENCY, async (chunk, index) => {
            notesByChunk[index] = await this.invokeOrDefault<AnkiNoteInfo[]>('notesInfo', { notes: chunk }, []);
            this.touchStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
        });
        const notes = notesByChunk.flat();
        if (this.isDestroyed) return null;
        const entries: Record<string, AnkiStatusIndexEntry> = {};
        for (const { key, entry } of statusIndexEntriesForNotes(notes, cardData, settings, now)) entries[key] = entry;
        const index: AnkiStatusIndex = {
            version: ANKI_STATUS_INDEX_VERSION,
            settingsKey,
            syncedAt: now,
            checkedAt: now,
            cardCount: allCardIds.length,
            entryCount: Object.keys(entries).length,
            entries,
            readingKeys: true,
        };
        this.statusIndex = index;
        this.statusLookupCache.clear();
        await saveAnkiStatusIndex(index);
        return index;
    }

    private async rebuildStatusIndexToIndexedDb(
        noteIds: number[],
        cardData: AnkiStatusIndexCardData,
        cardCount: number,
        now: number,
        settings: ReaderSettings,
        settingsKey: string,
        rebuildLeaseOwner?: string,
    ): Promise<AnkiStatusIndex | null> {
        if (this.isDestroyed) return null;
        const db = await openAnkiStatusIndexDb();
        try {
            await clearAnkiStatusIndexStores(db);
            const noteChunks = chunkArray(noteIds, ANKI_STATUS_INDEX_NOTE_CHUNK_SIZE);
            let writeQueue = Promise.resolve();
            await runLimited(noteChunks, ANKI_STATUS_INDEX_NOTE_CONCURRENCY, async chunk => {
                const notes = await this.invokeOrDefault<AnkiNoteInfo[]>('notesInfo', { notes: chunk }, []);
                if (this.isDestroyed) return;
                if (rebuildLeaseOwner) touchAnkiStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
                const entries = statusIndexEntriesForNotes(notes, cardData, settings, now);
                if (!entries.length) return;
                writeQueue = writeQueue.then(() => putBestAnkiStatusIndexEntries(db, entries));
                await writeQueue;
            });
            await writeQueue;
            if (this.isDestroyed) return null;
            const entryCount = await countAnkiStatusIndexEntries(db);
            const index: AnkiStatusIndex = {
                version: ANKI_STATUS_INDEX_VERSION,
                settingsKey,
                syncedAt: now,
                checkedAt: now,
                cardCount,
                entryCount,
                entryStore: 'indexeddb',
                entries: {},
                readingKeys: true,
            };
            await putAnkiStatusIndexMeta(db, ankiStatusIndexMeta(index));
            await gmStorageSet(ANKI_STATUS_INDEX_STORAGE_KEY, ankiStatusIndexMeta(index));
            this.statusIndex = index;
            this.statusLookupCache.clear();
            return index;
        } finally {
            db.close();
        }
    }

    private async loadStatusIndexCardData(
        allCardIds: number[],
        rebuildLeaseOwner: string | undefined,
        settingsKey: string,
    ): Promise<AnkiStatusIndexCardData> {
        const sets = await this.loadStatusIndexCardSets(allCardIds);
        if (rebuildLeaseOwner) touchAnkiStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
        const cardsByNote = await this.loadStatusIndexCardsByNote(allCardIds, sets, rebuildLeaseOwner, settingsKey);
        if (rebuildLeaseOwner) touchAnkiStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
        return {
            sets,
            cardsByNote,
        };
    }

    private async loadStatusIndexCardsByNote(
        allCardIds: number[],
        sets: AnkiStatusIndexCardSets,
        rebuildLeaseOwner: string | undefined,
        settingsKey: string,
    ): Promise<Map<number, AnkiCardInfo[]>> {
        const cardChunks = chunkArray(unique(allCardIds).map(Number).filter(Number.isFinite), ANKI_STATUS_INDEX_CARD_CHUNK_SIZE);
        const cardsByChunk: AnkiCardInfo[][] = Array.from({ length: cardChunks.length }, () => []);
        await runLimited(cardChunks, ANKI_STATUS_INDEX_CARD_CONCURRENCY, async (chunk, index) => {
            const cards = await this.invokeOrDefault<AnkiCardInfo[] | null>('cardsInfo', { cards: chunk }, []);
            cardsByChunk[index] = (Array.isArray(cards) ? cards : [])
                .map(card => this.statusIndexCardInfoWithDueFlag(card, sets));
            this.touchStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
        });
        return cardsByNoteId(cardsByChunk.flat());
    }

    private statusIndexCardInfoWithDueFlag(card: AnkiCardInfo, sets: AnkiStatusIndexCardSets): AnkiCardInfo {
        const cardId = Number(card.cardId);
        return Number.isFinite(cardId) ? { ...card, isDue: sets.due.has(cardId) } : card;
    }

    private async loadStatusIndexCardSets(allCardIds: number[]): Promise<AnkiStatusIndexCardSets> {
        const all = new Set(unique(allCardIds).map(Number).filter(Number.isFinite));
        if (!all.size) return { all, due: new Set(), learning: new Set(), new: new Set(), suspended: new Set() };
        const [due, learning, newCards, suspended] = await Promise.all([
            this.findCardIdSet('deck:* is:due'),
            this.findCardIdSet('deck:* is:learn'),
            this.findCardIdSet('deck:* is:new'),
            this.findCardIdSet('deck:* is:suspended'),
        ]);
        return { all, due, learning, new: newCards, suspended };
    }

    private async findCardIdSet(query: string): Promise<Set<number>> {
        const cardIds = await this.invokeOrDefault<number[]>('findCards', { query }, []);
        return new Set(cardIds.map(Number).filter(Number.isFinite));
    }

    private isLookupCoolingDown(): boolean {
        if (Date.now() >= this.unavailableUntil) return false;
        if (hasUserscriptAnkiBridge()) {
            this.markAvailable();
            return false;
        }
        return true;
    }

    private readLookupCache(cacheKey: string): AnkiLookupResult | null {
        const cached = this.lookupCache.get(cacheKey);
        if (!cached || Date.now() - cached.at >= 45000) return null;
        return cached.result;
    }

    private readStatusLookupCache(cacheKey: string): AnkiLookupResult | null {
        const cached = this.statusLookupCache.get(cacheKey);
        if (!cached || Date.now() - cached.at >= 45000) return null;
        return cached.result;
    }

    private writeLookupCache(cacheKey: string, result: AnkiLookupResult): void {
        this.lookupCache.set(cacheKey, { at: Date.now(), result });
    }

    private writeStatusLookupCache(cacheKey: string, result: AnkiLookupResult): void {
        this.statusLookupCache.set(cacheKey, { at: Date.now(), result });
    }

    private async findExistingCardsBatchUncachedWithInflight(
        groups: PendingAnkiLookupGroup[],
        fallback: AnkiLookupResult,
    ): Promise<Map<string, AnkiLookupResult>> {
        if (this.isDestroyed) return new Map(groups.map(group => [group.cacheKey, fallback]));
        const batch = this.findExistingCardsBatchUncached(groups);
        for (const { cacheKey } of groups) {
            const promise = batch
                .then(results => results.get(cacheKey) ?? fallback)
                .finally(() => {
                    this.lookupInflight.delete(cacheKey);
                });
            this.lookupInflight.set(cacheKey, promise);
            void promise.catch(() => undefined);
        }
        return batch;
    }

    private async findExistingCardsBatchUncached(groups: PendingAnkiLookupGroup[]): Promise<Map<string, AnkiLookupResult>> {
        const empty = emptyAnkiLookupResult();
        if (this.isDestroyed) return this.emptyLookupResultsForGroups(groups, empty);
        const statusNoteIdsByKey = await this.findStatusIndexNoteIdsByLookupKey(groups);
        if (this.isDestroyed) return this.emptyLookupResultsForGroups(groups, empty);
        const noteIdsByKey = await this.findCombinedCandidateNoteIdsByLookupKey(groups, statusNoteIdsByKey);
        if (this.isDestroyed) return this.emptyLookupResultsForGroups(groups, empty);
        const allNoteIds = this.uniqueLookupNoteIds(noteIdsByKey);
        if (!allNoteIds.length) return this.emptyLookupResultsForGroups(groups, empty);

        const notes = await this.invoke<AnkiNoteInfo[]>('notesInfo', { notes: allNoteIds });
        if (this.isDestroyed) return this.emptyLookupResultsForGroups(groups, empty);
        const matching = this.matchingNotesByLookupKey(groups, noteIdsByKey, notes, statusNoteIdsByKey);
        const cardsByNote = await this.loadCardsByNote(matching.uniqueNotes);
        if (this.isDestroyed) return this.emptyLookupResultsForGroups(groups, empty);
        return await this.existingLookupResultsFromMatches(groups, matching.notesByCacheKey, cardsByNote, empty);
    }

    private async findCombinedCandidateNoteIdsByLookupKey(
        groups: PendingAnkiLookupGroup[],
        statusNoteIdsByKey: Map<string, Set<number>>,
    ): Promise<Map<string, Set<number>>> {
        const noteIdsByKey = this.copyNoteIdsByLookupKey(statusNoteIdsByKey);
        const searchedNoteIds = await this.findCandidateNoteIdsByLookupKey(groups);
        this.mergeNoteIdsByLookupKey(noteIdsByKey, searchedNoteIds);
        return noteIdsByKey;
    }

    private copyNoteIdsByLookupKey(noteIdsByKey: Map<string, Set<number>>): Map<string, Set<number>> {
        return new Map([...noteIdsByKey].map(([cacheKey, noteIds]) => [cacheKey, new Set(noteIds)]));
    }

    private mergeNoteIdsByLookupKey(target: Map<string, Set<number>>, source: Map<string, Set<number>>): void {
        for (const [cacheKey, noteIds] of source) {
            const merged = target.get(cacheKey) ?? new Set<number>();
            noteIds.forEach(noteId => merged.add(noteId));
            target.set(cacheKey, merged);
        }
    }

    private uniqueLookupNoteIds(noteIdsByKey: Map<string, Set<number>>): number[] {
        return unique(Array.from(noteIdsByKey.values()).flatMap(noteIds => [...noteIds]));
    }

    private matchingNotesByLookupKey(
        groups: PendingAnkiLookupGroup[],
        noteIdsByKey: Map<string, Set<number>>,
        notes: AnkiNoteInfo[],
        trustedNoteIdsByKey?: Map<string, Set<number>>,
    ): MatchingAnkiNotesByLookupKey {
        const notesById = new Map(notes.map(note => [note.noteId, note]));
        const notesByCacheKey = new Map<string, AnkiNoteInfo[]>();
        const uniqueNotesById = new Map<number, AnkiNoteInfo>();
        for (const { cacheKey, card } of groups) {
            const trustedNoteIds = trustedNoteIdsByKey?.get(cacheKey);
            const matchingNotes = [...(noteIdsByKey.get(cacheKey) ?? [])]
                .map(noteId => notesById.get(noteId))
                .filter((note): note is AnkiNoteInfo => this.isMatchingAnkiNoteForCard(note, card, trustedNoteIds));
            notesByCacheKey.set(cacheKey, matchingNotes);
            matchingNotes.forEach(note => uniqueNotesById.set(note.noteId, note));
        }
        return {
            notesByCacheKey,
            uniqueNotes: [...uniqueNotesById.values()],
        };
    }

    private isMatchingAnkiNoteForCard(
        note: AnkiNoteInfo | undefined,
        card: JPDBCard,
        trustedNoteIds?: Set<number>,
    ): note is AnkiNoteInfo {
        if (!note) return false;
        if (trustedNoteIds?.has(note.noteId)) return true;
        return noteLooksLikeCard(note, card, this.getSettings());
    }

    private async existingLookupResultsFromMatches(
        groups: PendingAnkiLookupGroup[],
        matchingNotesByKey: Map<string, AnkiNoteInfo[]>,
        cardsByNote: Map<number, AnkiCardInfo[]>,
        empty: AnkiLookupResult,
    ): Promise<Map<string, AnkiLookupResult>> {
        const results = new Map<string, AnkiLookupResult>();
        for (const { cacheKey } of groups) {
            const matchingNotes = matchingNotesByKey.get(cacheKey) ?? [];
            const existing = matchingNotes.map(note => ankiExistingNoteFromInfo(note, cardsByNote.get(note.noteId) ?? []));
            if (existing.length) await this.hydrateExistingNoteRenderedMedia(existing);
            results.set(cacheKey, lookupResultFromExistingNotes(existing, empty));
        }
        await this.rememberStatusIndexNotes(unique([...matchingNotesByKey.values()].flatMap(notes => notes)), cardsByNote)
            .catch(error => {
                log.warn('Anki status cache update failed', error);
            });
        return results;
    }

    private async rememberStatusIndexNotes(notes: AnkiNoteInfo[], cardsByNote: Map<number, AnkiCardInfo[]>): Promise<void> {
        if (!notes.length || this.isDestroyed) return;
        const settings = this.getSettings();
        const settingsKey = this.statusIndexSettingsKey(settings);
        const now = Date.now();
        const entries = this.rememberedStatusIndexEntries(notes, cardsByNote, settings, now);
        if (!entries.length || this.isDestroyed) return;
        const current = this.validStatusIndex(await this.loadStatusIndex());
        const base = await this.baseStatusIndexForRememberedNotes(current, settingsKey, now, entries.length);
        const checkedAt = Math.max(base.checkedAt, now);
        if (this.shouldRememberStatusIndexEntriesInIndexedDb(base, current)) {
            await this.rememberIndexedDbStatusIndexEntries({ ...base, checkedAt, entryStore: 'indexeddb', entries: {} }, entries);
            return;
        }
        await this.rememberValueStatusIndexEntries(base, checkedAt, entries);
    }

    private rememberedStatusIndexEntries(
        notes: AnkiNoteInfo[],
        cardsByNote: Map<number, AnkiCardInfo[]>,
        settings: ReaderSettings,
        updatedAt: number,
    ): ReturnType<typeof statusIndexEntriesForNotes> {
        return statusIndexEntriesForNotes(notes, {
            cardsByNote,
            sets: emptyAnkiStatusIndexCardSets(),
        }, settings, updatedAt);
    }

    private async baseStatusIndexForRememberedNotes(
        current: AnkiStatusIndex | null,
        settingsKey: string,
        now: number,
        rememberedCount: number,
    ): Promise<AnkiStatusIndex> {
        if (current) return current;
        return {
            version: ANKI_STATUS_INDEX_VERSION,
            settingsKey,
            syncedAt: 0,
            checkedAt: now,
            cardCount: rememberedCount,
            entryCount: 0,
            entries: {},
            readingKeys: true,
        };
    }

    private shouldRememberStatusIndexEntriesInIndexedDb(
        base: AnkiStatusIndex,
        current: AnkiStatusIndex | null,
    ): boolean {
        return base.entryStore === 'indexeddb' || (!current && canUseIndexedDb());
    }

    private async rememberValueStatusIndexEntries(
        base: AnkiStatusIndex,
        checkedAt: number,
        entries: ReturnType<typeof statusIndexEntriesForNotes>,
    ): Promise<void> {
        const mergedEntries = { ...base.entries };
        for (const candidate of entries) {
            const currentEntry = mergedEntries[candidate.key];
            if (!currentEntry || shouldReplaceAnkiStatusIndexEntry(currentEntry, candidate.entry)) {
                mergedEntries[candidate.key] = candidate.entry;
            }
        }
        const index: AnkiStatusIndex = {
            ...base,
            checkedAt,
            entryCount: Object.keys(mergedEntries).length,
            entries: mergedEntries,
            readingKeys: true,
        };
        this.statusIndex = index;
        await gmStorageSet(ANKI_STATUS_INDEX_STORAGE_KEY, index);
    }

    private async rememberIndexedDbStatusIndexEntries(
        index: AnkiStatusIndex,
        entries: ReturnType<typeof statusIndexEntriesForNotes>,
    ): Promise<void> {
        const db = await openAnkiStatusIndexDb();
        try {
            await putBestAnkiStatusIndexEntries(db, entries);
            const entryCount = await countAnkiStatusIndexEntries(db);
            const next: AnkiStatusIndex = {
                ...index,
                entryStore: 'indexeddb',
                entries: {},
                entryCount,
                readingKeys: true,
            };
            await putAnkiStatusIndexMeta(db, ankiStatusIndexMeta(next));
            await gmStorageSet(ANKI_STATUS_INDEX_STORAGE_KEY, ankiStatusIndexMeta(next));
            this.statusIndex = next;
        } finally {
            db.close();
        }
    }

    private emptyLookupResultsForGroups(groups: PendingAnkiLookupGroup[], empty: AnkiLookupResult): Map<string, AnkiLookupResult> {
        return new Map(groups.map(group => [group.cacheKey, empty]));
    }

    private async findStatusIndexNoteIdsByLookupKey(groups: PendingAnkiLookupGroup[]): Promise<Map<string, Set<number>>> {
        const noteIdsByKey = new Map(groups.map(group => [group.cacheKey, new Set<number>()]));
        const statusIndex = await this.loadStatusIndex();
        if (!statusIndex || this.isDestroyed) return noteIdsByKey;
        const statusEntries = await this.loadStatusEntriesForCards(statusIndex, groups.map(group => group.card));
        if (this.isDestroyed) return noteIdsByKey;
        for (const { cacheKey, card } of groups) {
            const noteId = Number(this.lookupStatusIndex(statusIndex, card, statusEntries)?.primary?.noteId);
            if (Number.isFinite(noteId) && noteId > 0) noteIdsByKey.get(cacheKey)?.add(noteId);
        }
        return noteIdsByKey;
    }

    private async findCandidateNoteIdsByLookupKey(groups: PendingAnkiLookupGroup[]): Promise<Map<string, Set<number>>> {
        const noteIdsByKey = new Map(groups.map(group => [group.cacheKey, new Set<number>()]));
        if (this.isDestroyed) return noteIdsByKey;
        const keysByTerm = new Map<string, Set<string>>();
        for (const { cacheKey, card } of groups) {
            for (const term of lookupKeyTermsForCard(card)) {
                const keys = keysByTerm.get(term) ?? new Set<string>();
                keys.add(cacheKey);
                keysByTerm.set(term, keys);
            }
        }
        const terms = [...keysByTerm.keys()];
        // Stage 1 — field-scoped candidates (asbplayer/yomitan pattern): when
        // the active mapping names expression/reading fields, search only
        // those, so sentences/definitions can never create false matches.
        const lookupFields = this.statusLookupFieldNames();
        if (lookupFields.length) {
            const fieldQuery = (term: string) => lookupFields.map(field => quoteAnkiSearch(`${field}:${term}`)).join(' OR ');
            await this.collectCandidateNoteIds(terms, keysByTerm, noteIdsByKey, fieldQuery);
            if (this.isDestroyed) return noteIdsByKey;
        }
        // Stage 2 — the raw-term probe is explicitly a LOW-CONFIDENCE final
        // pass: it only runs for terms whose every target key is still empty
        // (covers unmapped/nonstandard models); noteLooksLikeCard remains the
        // downstream content gate for whatever it dredges up.
        const unresolvedTerms = lookupFields.length
            ? terms.filter(term => [...(keysByTerm.get(term) ?? [])].some(cacheKey => (noteIdsByKey.get(cacheKey)?.size ?? 0) === 0))
            : terms;
        if (unresolvedTerms.length) {
            await this.collectCandidateNoteIds(unresolvedTerms, keysByTerm, noteIdsByKey, term => quoteAnkiSearch(term));
        }
        return noteIdsByKey;
    }

    private statusLookupFieldNames(): string[] {
        const settings = this.getSettings();
        const mapping = settings.ankiFieldMappings?.[resolvedAnkiModelName(settings)];
        return [...new Set([mapping?.expression, mapping?.reading]
            .map(value => value?.trim())
            .filter((value): value is string => Boolean(value)))];
    }

    private async collectCandidateNoteIds(
        terms: string[],
        keysByTerm: Map<string, Set<string>>,
        noteIdsByKey: Map<string, Set<number>>,
        buildQuery: (term: string) => string,
    ): Promise<void> {
        const chunks = chunkArray(terms, ANKI_STATUS_LOOKUP_TERM_CHUNK_SIZE);
        const chunkResponses: Array<Array<number[] | undefined>> = new Array(chunks.length);
        await runLimited(chunks, ANKI_STATUS_LOOKUP_CHUNK_CONCURRENCY, async (chunk, index) => {
            chunkResponses[index] = await this.invokeMulti<number[]>(chunk.map(term => ({
                action: 'findNotes',
                params: { query: buildQuery(term) },
            })));
        });
        if (this.isDestroyed) return;
        const responses: Array<number[] | undefined> = chunkResponses.flat();
        terms.forEach((term, index) => {
            const ids = responses[index] ?? [];
            for (const cacheKey of keysByTerm.get(term) ?? []) {
                const noteIds = noteIdsByKey.get(cacheKey);
                ids.forEach(id => noteIds?.add(id));
            }
        });
    }

    private async loadExistingNotes(card: JPDBCard, noteIds: Set<number>): Promise<{ existing: AnkiExistingNote[]; candidateNotes: number }> {
        if (this.isDestroyed) return { existing: [], candidateNotes: 0 };
        const notes = await this.invoke<AnkiNoteInfo[]>('notesInfo', { notes: [...noteIds] });
        if (this.isDestroyed) return { existing: [], candidateNotes: notes.length };
        const matchingNotes = notes.filter(note => noteLooksLikeCard(note, card, this.getSettings()));
        const cardsByNote = await this.loadCardsByNote(matchingNotes);
        const existing = matchingNotes.map(note => ankiExistingNoteFromInfo(note, cardsByNote.get(note.noteId) ?? []));
        await this.hydrateExistingNoteRenderedMedia(existing);
        return {
            existing,
            candidateNotes: notes.length,
        };
    }

    private async hydrateExistingNoteRenderedMedia(notes: AnkiExistingNote[]): Promise<void> {
        const cards = notes.flatMap(note => note.renderedCards ?? []);
        if (!cards.length || this.isDestroyed) return;
        await runLimited(cards, ANKI_RENDERED_MEDIA_CONCURRENCY, async card => {
            const filenames = ankiRenderedCardMediaFilenames(card).slice(0, ANKI_RENDERED_MEDIA_LIMIT);
            if (!filenames.length || this.isDestroyed) return;
            const mediaDataUrls: Record<string, string> = {};
            await runLimited(filenames, ANKI_RENDERED_MEDIA_CONCURRENCY, async filename => {
                if (this.isDestroyed) return;
                try {
                    mediaDataUrls[filename] = await this.mediaFileDataUrl(filename);
                } catch (error) {
                    log.warnOnce(`rendered-media:${filename}`, 'Could not load Anki rendered card media', { filename }, error);
                }
            });
            if (Object.keys(mediaDataUrls).length) card.mediaDataUrls = mediaDataUrls;
        });
    }

    private async loadCardsByNote(notes: AnkiNoteInfo[]): Promise<Map<number, AnkiCardInfo[]>> {
        if (this.isDestroyed) return new Map();
        const cardIds = unique(notes.flatMap(note => note.cards ?? []));
        const cards = cardIds.length
            ? await this.invokeOrDefault<AnkiCardInfo[]>('cardsInfo', { cards: cardIds }, [])
            : [];
        if (this.isDestroyed) return new Map();
        return cardsByNoteId(await this.annotateDueCards(cards));
    }

    private async annotateDueCards(cards: AnkiCardInfo[]): Promise<AnkiCardInfo[]> {
        if (this.isDestroyed) return cards;
        const reviewCardIds = cards
            .filter(card => card.queue === 2)
            .map(card => Number(card.cardId))
            .filter(Number.isFinite);
        if (!reviewCardIds.length) return cards;
        const dueFlags = await this.invokeOrDefault<boolean[]>('areDue', { cards: reviewCardIds }, []);
        if (this.isDestroyed) return cards;
        const dueByCardId = new Map(reviewCardIds.map((cardId, index) => [cardId, dueFlags[index]]));
        return cards.map(card => card.queue === 2 && dueByCardId.has(Number(card.cardId))
            ? { ...card, isDue: dueByCardId.get(Number(card.cardId)) === true }
            : card);
    }

    async answerCard(cardId: number, grade: JPDBGrade): Promise<void> {
        const ease = ankiEaseFromGrade(grade);
        log.info('Answering Anki card', { cardId, grade, ease });
        await this.invoke<null>('answerCards', { answers: [{ cardId, ease }] });
        this.lookupCache.clear();
        this.statusLookupCache.clear();
        this.markStatusIndexDirtyAfterMutation('review');
    }

    // Suspension is Anki's native blacklist analog: suspended cards never
    // come up for review and already render with the dedicated state color.
    // Used by the card action controller's deck-state mapping.
    // fallow-ignore-next-line unused-class-member
    async setCardsSuspended(cardIds: number[], suspended: boolean): Promise<void> {
        if (!cardIds.length) return;
        log.info('Setting Anki card suspension', { cardIds, suspended });
        await this.invoke<boolean | null>(suspended ? 'suspend' : 'unsuspend', { cards: cardIds });
        this.lookupCache.clear();
        this.statusLookupCache.clear();
        this.markStatusIndexDirtyAfterMutation('review');
    }

    // The never-forget analog: a tag the user can also filter on inside Anki.
    // Used by the card action controller's deck-state mapping.
    // fallow-ignore-next-line unused-class-member
    async setNotesTag(noteIds: number[], tag: string, present: boolean): Promise<void> {
        if (!noteIds.length) return;
        log.info('Setting Anki note tag', { noteIds, tag, present });
        await this.invoke<null>(present ? 'addTags' : 'removeTags', { notes: noteIds, tags: tag });
        this.lookupCache.clear();
        this.statusLookupCache.clear();
        this.markStatusIndexDirtyAfterMutation('merge');
    }

    // Used by card action controls to open existing notes from rendered Anki status.
    // fallow-ignore-next-line unused-class-member
    async browseNote(noteId: number): Promise<void> {
        log.info('Opening Anki note browser', { noteId });
        await this.invoke<unknown>('guiBrowse', { query: `nid:${noteId}` });
    }

    async mediaFileDataUrl(filename: string): Promise<string> {
        const cleanFilename = filename.trim();
        if (!cleanFilename) throw new Error(this.text('ankiAudioFileNotFound'));
        const data = await this.invoke<string | false>('retrieveMediaFile', { filename: cleanFilename });
        if (!data) throw new Error(this.text('ankiAudioFileNotFound'));
        return `data:${ankiMediaMimeType(cleanFilename)};base64,${data}`;
    }

    // Used by card action controls to merge mining context into existing Anki notes.
    async mergeYomuData(noteId: number, card: JPDBCard, sentence = '', options: AnkiCardContext & { audioMergeMode?: AnkiAudioMergeMode } = {}): Promise<AnkiMergeYomuResult> {
        const [note] = await this.invoke<AnkiNoteInfo[]>('notesInfo', { notes: [noteId] });
        if (!note) throw new Error(this.text('ankiNoteNotFound'));

        const merge = this.buildYomuNoteMerge(note, card, sentence, options);
        if (!merge.updatedFields.length && !merge.audioAdded && !merge.imageAdded) {
            return merge;
        }

        await this.invoke<null>('updateNoteFields', { note: merge.note });
        this.clearLookupCachesForCard(card);
        this.markStatusIndexDirtyAfterMutation('merge');
        return merge;
    }

    // Used by card action controls for desktop Anki mining.
    async addCard(card: JPDBCard, sentence = '', options: AnkiCardContext = {}): Promise<number | null> {
        const settings = this.getSettings();
        if (!settings.ankiEnabled) {
            return null;
        }
        const note = this.buildAnkiNote(card, sentence, settings, options);

        if (canUseMobileAnkiHandoff(settings) && !hasUserscriptAnkiBridge()) {
            if (!openMobileAnkiHandoff(retargetAnkiNoteForMobileHandoff(note, settings))) throw new Error(this.text('ankiHandoffCancelled'));
            return null;
        }

        try {
            return await this.addNoteViaConnect(note, card);
        } catch (error) {
            return this.addCardWithFallback(error, settings, note, card);
        }
    }

    // Used by card action controls for mobile Anki handoff mining.
    // fallow-ignore-next-line unused-class-member
    async addCardViaMobileHandoff(card: JPDBCard, sentence = '', options: AnkiCardContext = {}): Promise<null> {
        const settings = this.getSettings();
        if (!settings.ankiEnabled) return null;
        if (!canUseMobileAnkiHandoff(settings)) throw new Error('Mobile Anki handoff is not available here.');
        const note = retargetAnkiNoteForMobileHandoff(this.buildAnkiNote(card, sentence, settings, options), settings);
        if (!openMobileAnkiHandoff(note)) throw new Error(this.text('ankiHandoffCancelled'));
        return null;
    }

    private buildAnkiNote(card: JPDBCard, sentence: string, settings: ReaderSettings, options: AnkiCardContext): AnkiNote {
        const note: AnkiNote = {
            deckName: this.ankiDeckName(options, settings),
            modelName: settings.ankiModel || 'よむ Japanese',
            fields: buildYomuAnkiFields(card, sentence, this.ankiFieldContext(options, settings)),
            tags: tagsFromString(settings.ankiTags),
            options: {
                allowDuplicate: false,
                duplicateScope: 'collection',
            },
        };
        this.attachAnkiNoteImage(note, options.imageDataUrl, card);
        this.attachAnkiNoteAudio(note, options, card);
        return note;
    }

    private buildYomuNoteMerge(note: AnkiNoteInfo, card: JPDBCard, sentence: string, options: AnkiCardContext & { audioMergeMode?: AnkiAudioMergeMode }): AnkiMergeYomuResult & { note: AnkiNoteUpdate } {
        const settings = this.getSettings();
        const fieldNames = Object.keys(note.fields ?? {});
        const existingFields = flattenNoteFields(note.fields);
        const yomuFields = buildYomuAnkiFields(card, sentence, this.ankiFieldContext(options, settings));
        const canOwnYomuFields = noteLooksLikeYomuModel(note.modelName, settings, fieldNames);
        const mapping = ankiFieldMappingForModel(settings, note.modelName, fieldNames);
        const fields = mergedYomuFields(fieldNames, existingFields, yomuFields, canOwnYomuFields, mapping);
        const audio = mergeAudioFilesForNote(fieldNames, options, card, mapping);
        const picture = mergePictureFilesForNote(fieldNames, existingFields, options, card, canOwnYomuFields, mapping);
        applyMediaFieldClears(fields, audio, picture, options.audioMergeMode, canOwnYomuFields);
        return {
            noteId: note.noteId,
            modelName: note.modelName,
            updatedFields: Object.keys(fields),
            audioAdded: Boolean(audio.length),
            imageAdded: Boolean(picture.length),
            note: {
                id: note.noteId,
                fields,
                ...(audio.length ? { audio } : {}),
                ...(picture.length ? { picture } : {}),
            },
        };
    }

    private ankiDeckName(options: AnkiCardContext, settings: ReaderSettings): string {
        return options.deckName?.trim() || settings.ankiDeck || 'よむ';
    }

    private ankiFieldContext(options: AnkiCardContext, settings: ReaderSettings): AnkiCardContext {
        return {
            ...options,
            sourceUrl: options.sourceUrl ?? safeLocationHref(),
            sourceTitle: options.sourceTitle ?? safeDocumentTitle(),
            dictionaryPreferences: options.dictionaryPreferences ?? settings.dictionaryPreferences,
            interfaceLanguage: options.interfaceLanguage ?? settings.interfaceLanguage,
        };
    }

    private attachAnkiNoteImage(note: AnkiNote, imageDataUrl: string | undefined, card: JPDBCard): void {
        const image = imageDataUrl ? imageFromDataUrl(imageDataUrl, card) : null;
        if (image) note.picture = [image];
    }

    private attachAnkiNoteAudio(note: AnkiNote, options: AnkiCardContext, card: JPDBCard): void {
        const audio = audioFilesFromContext(options, card);
        if (audio.length) note.audio = audio;
    }

    private logAnkiNoteAdd(card: JPDBCard, note: AnkiNote): void {
        log.info('Adding Anki note', {
            term: card.spelling,
            deck: note.deckName,
            model: note.modelName,
            hasImage: Boolean(note.picture?.length),
            hasAudio: Boolean(note.audio?.length),
            tags: note.tags,
        });
    }

    private async addNoteViaConnect(note: AnkiNote, card: JPDBCard): Promise<number | null> {
        const preparedNote = await this.prepareAnkiNoteForConnect(note);
        await this.ensureAnkiNoteCanAdd(preparedNote);
        this.logAnkiNoteAdd(card, preparedNote);
        const noteId = await this.invoke<number | null>('addNote', { note: preparedNote });
        log.info('Anki note added', { term: card.spelling, noteId });
        await this.refreshLookupCacheAfterAdd(card, noteId);
        if (noteId === null) throw new AnkiDuplicateNoteError(this.text('alreadyInAnki'));
        return noteId;
    }

    private async ensureAnkiNoteCanAdd(note: AnkiNote): Promise<void> {
        const [canAdd] = await this.invoke<boolean[]>('canAddNotes', { notes: [ankiNoteForDuplicatePreflight(note)] })
            .catch(error => {
                if (isAnkiConnectAvailabilityError(error)) throw error;
                log.warn('Anki duplicate preflight failed', error);
                return [true];
            });
        if (canAdd === false) throw new AnkiDuplicateNoteError(this.text('alreadyInAnki'));
    }

    private async prepareAnkiNoteForConnect(note: AnkiNote): Promise<AnkiNote> {
        const settings = this.getSettings();
        await this.ensureDeck(note.deckName);
        const modelNames = await this.modelNames().catch((): string[] => []);
        if (!modelNames.includes(note.modelName)) {
            await this.createYomuModel(note.modelName, settings);
            return note;
        }
        const fieldNames = await this.invokeOrDefault<string[]>('modelFieldNames', { modelName: note.modelName }, []);
        if (shouldTreatExistingModelAsYomuManaged(note.modelName, settings, fieldNames)) {
            await this.updateExistingModel(note.modelName, settings);
            return note;
        }
        return retargetAnkiNoteToExistingModel(note, fieldNames, settings);
    }

    private async refreshLookupCacheAfterAdd(card: JPDBCard, noteId: number | null): Promise<void> {
        const cacheKey = this.lookupCacheKey(card);
        this.statusLookupCache.delete(cacheKey);
        if (!noteId) {
            this.lookupCache.delete(cacheKey);
            return;
        }
        try {
            const { existing } = await this.loadExistingNotes(card, new Set([noteId]));
            const result: AnkiLookupResult = {
                state: stateFromExistingNotes(existing),
                notes: existing,
                primary: pickPrimaryExistingNote(existing),
            };
            this.writeLookupCache(cacheKey, result);
            this.writeStatusLookupCache(cacheKey, result);
            this.markStatusIndexDirtyAfterMutation('add');
        } catch (error) {
            log.warn('Anki lookup refresh after add failed', { term: card.spelling, noteId }, error);
            this.lookupCache.delete(cacheKey);
            this.statusLookupCache.delete(cacheKey);
            this.markStatusIndexDirtyAfterMutation('add');
        }
    }

    private clearLookupCachesForCard(card: JPDBCard): void {
        const cacheKey = this.lookupCacheKey(card);
        this.lookupCache.delete(cacheKey);
        this.statusLookupCache.delete(cacheKey);
    }

    private markStatusIndexDirtyAfterMutation(reason: 'add' | 'merge' | 'review'): void {
        const dirtyLoadedIndex = (index: AnkiStatusIndex | null | undefined): boolean => {
            const valid = this.validStatusIndex(index);
            if (!valid) return false;
            const dirty: AnkiStatusIndex = { ...valid, syncedAt: 0, checkedAt: 0, dirtyAt: Date.now() };
            this.statusIndex = dirty;
            void saveAnkiStatusIndexDirtyMarker(dirty)
                .catch(error => {
                    log.warn('Anki dirty marker failed', { reason }, error);
                })
                .finally(() => {
                    if (!this.isDestroyed) this.queueStatusIndexRefresh({ deferDirtyIfCountUnchanged: true });
                });
            return true;
        };

        if (this.statusIndex !== undefined) {
            dirtyLoadedIndex(this.statusIndex);
            return;
        }

        void this.loadStatusIndex()
            .then(index => {
                if (this.isDestroyed) return;
                dirtyLoadedIndex(index);
            })
            .catch(error => {
                log.warn('Anki dirty marker failed', { reason }, error);
            });
    }

    private addCardWithFallback(error: unknown, settings: ReaderSettings, note: AnkiNote, card: JPDBCard): null {
        if (!canUseMobileAnkiHandoff(settings) || !isMobileHandoffRecoverableAddError(error)) throw error;
        log.warn('AnkiConnect add failed', { term: card.spelling }, error);
        if (!openMobileAnkiHandoff(retargetAnkiNoteForMobileHandoff(note, settings))) throw new Error(this.text('ankiHandoffCancelled'));
        return null;
    }

    // Used by settings save/setup flow to prepare the configured Anki deck and model.
    // fallow-ignore-next-line unused-class-member
    async ensureDeckAndModel(deckOverride?: string): Promise<void> {
        const settings = this.getSettings();
        const deckName = resolvedAnkiDeckName(deckOverride, settings);
        const modelName = resolvedAnkiModelName(settings);
        await this.ensureDeck(deckName);
        const modelNames = await this.modelNames().catch((): string[] => []);
        await this.ensureYomuModel(modelNames, modelName, settings);
    }

    private async ensureDeck(deckName: string): Promise<void> {
        await this.invokeOrDefault<null>('createDeck', { deck: deckName }, null);
    }

    private async updateExistingModel(modelName: string, settings: ReaderSettings): Promise<void> {
        await this.ensureModelFields(modelName);
        await this.invoke<null>('updateModelTemplates', { model: { name: modelName, templates: yomuCardTemplates(settings) } });
        await this.invoke<null>('updateModelStyling', { model: { name: modelName, css: yomuCardCss() } });
    }

    private async ensureYomuModel(modelNames: string[], modelName: string, settings: ReaderSettings): Promise<void> {
        return modelNames.includes(modelName)
            ? await this.updateExistingModel(modelName, settings)
            : await this.createYomuModel(modelName, settings);
    }

    private async createYomuModel(modelName: string, settings: ReaderSettings): Promise<void> {
        await this.invoke<unknown>('createModel', {
            modelName,
            inOrderFields: YOMU_MODEL_FIELDS,
            css: yomuCardCss(),
            cardTemplates: Object.entries(yomuCardTemplates(settings)).map(([Name, template]) => ({ Name, ...template })),
        });
        log.info('Anki model created', { modelName });
    }

    private async ensureModelFields(modelName: string): Promise<void> {
        const fieldNames = await this.invokeOrDefault<string[]>('modelFieldNames', { modelName }, []);
        const existing = new Set(fieldNames);
        for (const fieldName of YOMU_MODEL_FIELDS) {
            if (!existing.has(fieldName)) {
                await this.invoke<null>('modelFieldAdd', { modelName, fieldName });
            }
        }
    }

    async invoke<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
        return this.invokeWithTimeout<T>(action, params, ANKI_CONNECT_REQUEST_TIMEOUT_MS);
    }

    private async invokeOrDefault<T>(action: string, params: Record<string, unknown>, fallback: T): Promise<T> {
        return this.invoke<T>(action, params).catch(() => fallback);
    }

    private async invokeWithTimeout<T>(action: string, params: Record<string, unknown>, timeoutMs: number): Promise<T> {
        const settings = this.getSettings();
        const url = settings.ankiConnectUrl || 'http://127.0.0.1:8765';
        const body = JSON.stringify({ action, version: ANKI_VERSION, params });
        const response = await postAnkiJson<AnkiResponse<T>>(url, body, timeoutMs).catch(error => {
            if (isAnkiConnectAvailabilityError(error)) this.unavailableUntil = Date.now() + ANKI_BACKGROUND_UNAVAILABLE_COOLDOWN_MS;
            throw this.localizedConnectError(error);
        });
        this.markAvailable();
        if (response.error) {
            log.warn('AnkiConnect action returned error', { action, error: response.error });
            throw new Error(resolveUiLanguage(settings.interfaceLanguage) === 'ja' ? this.text('ankiConnectActionFailed') : response.error);
        }
        return response.result;
    }

    private async invokeMulti<T>(actions: AnkiMultiAction[]): Promise<Array<T | undefined>> {
        if (!actions.length) return [];
        try {
            const responses = await this.invoke<Array<T | AnkiResponse<T>>>('multi', { actions });
            return responses.map(response => (
                isAnkiMultiActionResponse(response)
                    ? (response.error ? undefined : response.result)
                    : response
            ));
        } catch (error) {
            if (isAnkiConnectAvailabilityError(error)) {
                log.warn('AnkiConnect multi failed; cooling down', error);
                this.unavailableUntil = Date.now() + ANKI_BACKGROUND_UNAVAILABLE_COOLDOWN_MS;
                return actions.map(() => undefined);
            }
            log.warn('AnkiConnect multi failed; retrying solo', error);
            return Promise.all(actions.map(action =>
                this.invoke<T>(action.action, action.params ?? {}).catch(() => undefined),
            ));
        }
    }

    private text(key: Parameters<typeof uiText>[1]): string {
        return uiText(this.getSettings().interfaceLanguage, key);
    }

    private localizedConnectError(error: unknown): Error {
        const language = this.getSettings().interfaceLanguage;
        if (resolveUiLanguage(language) !== 'ja') return error instanceof Error ? error : new Error(this.text('ankiConnectRequestFailed'));
        if (error instanceof Error && /timed out/i.test(error.message)) return new Error(this.text('ankiConnectTimedOut'), { cause: error });
        const status = error instanceof Error ? error.message.match(/\((\d{3})\)/)?.[1] : '';
        const suffix = status ? `（${status}）` : '';
        return new Error(`${this.text('ankiConnectRequestFailed')}${suffix}`, error instanceof Error ? { cause: error } : undefined);
    }

    private markAvailable(): void {
        this.availabilityCheckedAt = Date.now();
        this.unavailableUntil = 0;
    }
}

function isAnkiMultiActionResponse<T>(value: T | AnkiResponse<T>): value is AnkiResponse<T> {
    return typeof value === 'object'
        && value !== null
        && !Array.isArray(value)
        && Object.prototype.hasOwnProperty.call(value, 'result')
        && Object.prototype.hasOwnProperty.call(value, 'error');
}

function emptyAnkiStatusIndexCardSets(): AnkiStatusIndexCardSets {
    return {
        all: new Set(),
        due: new Set(),
        learning: new Set(),
        new: new Set(),
        suspended: new Set(),
    };
}

function lookupResultFromExistingNotes(existing: AnkiExistingNote[], empty: AnkiLookupResult): AnkiLookupResult {
    return existing.length ? {
        state: stateFromExistingNotes(existing),
        notes: existing,
        primary: pickPrimaryExistingNote(existing),
    } : empty;
}

export function captureActiveVideoFrame(): string | undefined {
    const video = Array.from(document.querySelectorAll('video'))
        .filter(item => item.readyState >= 2 && item.videoWidth > 0 && item.videoHeight > 0)
        .sort((a, b) => visibleArea(b) - visibleArea(a))[0];
    if (!video) {
        return undefined;
    }
    try {
        const canvas = document.createElement('canvas');
        const maxWidth = 960;
        const scale = Math.min(1, maxWidth / video.videoWidth);
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) return undefined;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
        return dataUrl;
    } catch (error) {
        log.warn('Active video frame capture failed', error);
        return undefined;
    }
}

function resolvedAnkiDeckName(deckOverride: string | undefined, settings: ReaderSettings): string {
    return deckOverride?.trim() || settings.ankiDeck || 'よむ';
}

function resolvedAnkiModelName(settings: ReaderSettings): string {
    return settings.ankiModel || 'よむ Japanese';
}

function isMobileHandoffRecoverableAddError(error: unknown): boolean {
    if (isAnkiConnectAvailabilityError(error)) return true;
    if (error instanceof Error && error.cause && error.cause !== error) {
        return isMobileHandoffRecoverableAddError(error.cause);
    }
    if (!(error instanceof Error)) return false;
    return /unsupported action|action.*unsupported|unknown action|invalid action|not supported/i.test(error.message);
}

export function buildYomuAnkiFields(card: JPDBCard, sentence = '', context: AnkiCardContext = {}): Record<string, string> {
    const fieldContext = ankiFieldContext(context);
    const jpdbUrl = jpdbVocabularyUrl(card);
    return {
        Expression: escapeHtml(card.spelling),
        Reading: renderCardReading(card),
        Meaning: renderJpdbMeanings(card),
        Sentence: renderSentence(sentence, sentenceHighlightTargets(card, fieldContext)),
        Url: escapeHtml(fieldContext.sourceUrl),
        Frequency: renderFrequency(card, fieldContext.metaEntries, fieldContext.dictionaryPreferences),
        PartOfSpeech: renderPartOfSpeech(card.partOfSpeech),
        Image: '',
        Audio: '',
        JPDB: renderJpdbLink(jpdbUrl, fieldContext.interfaceLanguage),
        Status: renderCardStatus(card, fieldContext.interfaceLanguage),
        Pitch: renderPitchField(card, fieldContext.metaEntries, fieldContext.dictionaryPreferences),
        DictionaryDefinitions: renderDictionaryDefinitions(fieldContext.localEntries, fieldContext.dictionaryPreferences),
        Kanji: renderKanjiDefinitions(fieldContext.kanjiEntries, fieldContext.dictionaryPreferences, fieldContext.interfaceLanguage),
        Source: renderSource(fieldContext.sourceUrl, fieldContext.sourceTitle),
    };
}

export interface AnkiNoteFieldTargetPlan {
    modelName: string;
    yomuManaged: boolean;
    fieldNames: string[];
}

export function buildYomuAnkiPreviewFields(card: JPDBCard, sentence: string, settings: ReaderSettings, context: AnkiCardContext = {}, fieldTargetPlan?: AnkiNoteFieldTargetPlan | null): Record<string, string> {
    const yomuFields = buildYomuAnkiFields(card, sentence, {
        ...context,
        interfaceLanguage: settings.interfaceLanguage,
    });
    // When the configured model is an existing non-Yomu model, the write path
    // retargets fields into that model; preview the retargeted fields so the
    // user sees exactly what will be written.
    if (fieldTargetPlan && !fieldTargetPlan.yomuManaged && fieldTargetPlan.fieldNames.length) {
        const mapping = ankiFieldMappingForModel(settings, fieldTargetPlan.modelName, fieldTargetPlan.fieldNames);
        const retargeted = retargetYomuFieldsToExistingModel(yomuFields, fieldTargetPlan.fieldNames, mapping);
        const written = Object.fromEntries(Object.entries(retargeted).filter(([, value]) => value.trim()));
        if (Object.keys(written).length) return written;
    }
    const mapping = settings.ankiFieldMappings?.[settings.ankiModel.trim() || 'よむ Japanese'];
    if (!mapping || !Object.values(mapping).some(value => value?.trim())) return yomuFields;

    const fields: Record<string, string> = {};
    for (const role of ANKI_FIELD_ROLES) {
        const fieldName = mapping[role]?.trim();
        const value = yomuFields[yomuFieldForRole(role)];
        if (fieldName && value) fields[fieldName] = value;
    }
    return Object.keys(fields).length ? fields : yomuFields;
}

function renderCardReading(card: JPDBCard): string {
    return card.reading && card.reading !== card.spelling ? escapeHtml(card.reading) : '';
}

function renderPartOfSpeech(partOfSpeech: string[]): string {
    return escapeHtml(formatPartOfSpeech(partOfSpeech) || formatPartOfSpeechDetails(partOfSpeech));
}

function renderJpdbLink(jpdbUrl: string, language: ReaderSettings['interfaceLanguage']): string {
    return jpdbUrl ? `<a href="${jpdbUrl}">${escapeHtml(uiText(language, 'openOnJpdb'))}</a>` : '';
}

function ankiFieldContext(context: AnkiCardContext): AnkiFieldContext {
    return {
        localEntries: fallbackArray(context.localEntries),
        kanjiEntries: fallbackArray(context.kanjiEntries),
        metaEntries: fallbackArray(context.metaEntries),
        dictionaryPreferences: fallbackArray(context.dictionaryPreferences),
        sentenceTarget: fallbackString(context.sentenceTarget),
        sourceUrl: fallbackString(context.sourceUrl),
        sourceTitle: fallbackString(context.sourceTitle),
        interfaceLanguage: context.interfaceLanguage ?? 'en',
    };
}

function fallbackArray<T>(value: T[] | undefined): T[] {
    return value ?? [];
}

function fallbackString(value: string | undefined): string {
    return value ?? '';
}

function jpdbVocabularyUrl(card: JPDBCard): string {
    return card.source === 'local' || card.source === 'anki'
        ? ''
        : `https://jpdb.io/vocabulary/${card.vid}/${encodeURIComponent(card.spelling)}/${encodeURIComponent(card.reading)}`;
}

function renderCardStatus(card: JPDBCard, language: ReaderSettings['interfaceLanguage']): string {
    if (card.source === 'local') return `<span class="yomu-chip">${escapeHtml(uiText(language, 'ankiLocalDictionaryStatus'))}</span>`;
    if (card.source === 'anki') return '<span class="yomu-chip">Anki</span>';
    return card.cardState.map(state => `<span class="yomu-chip">${escapeHtml(state)}</span>`).join(' ');
}

function tagsFromString(value: string): string[] {
    return value.split(/[,\s]+/).map(tag => tag.trim()).filter(Boolean);
}

function retargetAnkiNoteToExistingModel(note: AnkiNote, fieldNames: string[], settings: ReaderSettings): AnkiNote {
    const mapping = ankiFieldMappingForModel(settings, note.modelName, fieldNames);
    const fields = retargetYomuFieldsToExistingModel(note.fields, fieldNames, mapping);
    const audioField = fieldNameForRole(fieldNames, 'audio', mapping);
    const imageField = fieldNameForRole(fieldNames, 'image', mapping);
    return {
        deckName: note.deckName,
        modelName: note.modelName,
        fields,
        tags: note.tags,
        options: note.options,
        ...(audioField && note.audio?.length ? { audio: retargetMediaFiles(note.audio, audioField) } : {}),
        ...(imageField && note.picture?.length ? { picture: retargetMediaFiles(note.picture, imageField) } : {}),
    };
}

function ankiNoteForDuplicatePreflight(note: AnkiNote): AnkiNote {
    return {
        deckName: note.deckName,
        modelName: note.modelName,
        fields: note.fields,
        tags: note.tags,
        options: note.options,
    };
}

function retargetAnkiNoteForMobileHandoff(note: AnkiNote, settings: ReaderSettings): AnkiNote {
    const mapping = activeMobileHandoffMapping(note, settings);
    if (!mapping) return note;
    return {
        ...note,
        fields: mobileHandoffFieldsWithMappings(note.fields, mapping),
        ...retargetMobileHandoffMedia(note, mapping),
    };
}

function activeMobileHandoffMapping(note: AnkiNote, settings: ReaderSettings): AnkiFieldMapping | null {
    const mapping = settings.ankiFieldMappings?.[note.modelName];
    return mapping && Object.values(mapping).some(value => value?.trim()) ? mapping : null;
}

function mobileHandoffFieldsWithMappings(yomuFields: Record<string, string>, mapping: AnkiFieldMapping): Record<string, string> {
    const fields = { ...yomuFields };
    for (const role of ANKI_FIELD_ROLES) {
        const fieldName = mobileMappedFieldName(mapping, role);
        const value = yomuFields[yomuFieldForRole(role)];
        if (fieldName && value) fields[fieldName] = value;
    }
    return fields;
}

function retargetMobileHandoffMedia(note: AnkiNote, mapping: AnkiFieldMapping): Partial<Pick<AnkiNote, 'audio' | 'picture'>> {
    const media: Partial<Pick<AnkiNote, 'audio' | 'picture'>> = {};
    const audioField = mobileMappedFieldName(mapping, 'audio');
    const imageField = mobileMappedFieldName(mapping, 'image');
    if (audioField && note.audio?.length) media.audio = retargetMediaFiles(note.audio, audioField);
    if (imageField && note.picture?.length) media.picture = retargetMediaFiles(note.picture, imageField);
    return media;
}

function mobileMappedFieldName(mapping: AnkiFieldMapping, role: AnkiFieldRole): string {
    return mapping[role]?.trim() ?? '';
}

function retargetYomuFieldsToExistingModel(yomuFields: Record<string, string>, fieldNames: string[], mapping?: AnkiFieldMapping): Record<string, string> {
    const valuesByRole: Partial<Record<AnkiFieldRole, string>> = {
        expression: yomuFields.Expression,
        reading: yomuFields.Reading,
        meaning: yomuFields.Meaning,
        sentence: yomuFields.Sentence,
    };
    const fields = Object.fromEntries(fieldNames.map(fieldName => [fieldName, '']));
    for (const role of ['expression', 'reading', 'meaning', 'sentence'] as AnkiFieldRole[]) {
        const fieldName = fieldNameForRole(fieldNames, role, mapping);
        const value = valuesByRole[role];
        if (fieldName && value) fields[fieldName] = value;
    }
    return fields;
}

function imageFromDataUrl(dataUrl: string, card: JPDBCard): AnkiPicture | null {
    const parsed = parseAnkiImageDataUrl(dataUrl);
    if (!parsed) return null;
    return {
        filename: `yomu_${safeAnkiMediaName(card)}_${Date.now()}.${parsed.extension}`,
        data: parsed.data,
        fields: ['Image'],
    };
}

function mergedYomuFields(fieldNames: string[], existingFields: Record<string, string>, yomuFields: Record<string, string>, canOwnYomuFields: boolean, mapping?: AnkiFieldMapping): Record<string, string> {
    const fields: Record<string, string> = {};
    for (const fieldName of fieldNames) {
        const value = yomuValueForExistingField(fieldName, yomuFields, mapping, canOwnYomuFields);
        if (!value) continue;
        if (!canOwnYomuFields && existingFields[fieldName]) continue;
        fields[fieldName] = value;
    }
    return fields;
}

function yomuValueForExistingField(fieldName: string, yomuFields: Record<string, string>, mapping: AnkiFieldMapping | undefined, canOwnYomuFields: boolean): string {
    const mappedRole = mappedRoleForField(fieldName, mapping);
    if (mappedRole) return yomuFields[yomuFieldForRole(mappedRole)] ?? '';
    const alias = yomuFieldAlias(fieldName);
    if (alias && !canOwnYomuFields) return yomuFields[alias] ?? '';
    return yomuFields[fieldName] ?? (alias ? yomuFields[alias] ?? '' : '');
}

function yomuFieldAlias(fieldName: string): string {
    return YOMU_FIELD_ALIASES[normalizeAnkiFieldName(fieldName)] ?? '';
}

const YOMU_FIELD_ALIASES: Record<string, string> = Object.fromEntries([
    ...yomuAliasEntries('Expression', 'baseform|character|characters|dictionaryform|expressiontext|headword|headwordkanji|jlabkanji|japaneseword|japaneseexpression|kanji|lemma|searchterm|targetkanji|targetword|termtext|termkanji|word|wordexpression|wordkanji|vocab|vocabkanji|vocabulary|vocabularycharacter|vocabularyexpression|vocabularykanji|term|front'),
    ...yomuAliasEntries('Reading', 'expressionreading|furigana|furiganareading|hiragana|jlabhiragana|japanesereading|kanareading|readings|kana|ruby|termkana|termreading|vocabfurigana|vocabkana|vocabreading|vocabularyfurigana|wordkana|vocabularyreading|wordreading|yomi'),
    ...yomuAliasEntries('Meaning', 'def|definition1|definition|definitionenglish|definitions|defs|english|englishdefinition|englishmeaning|gloss|glosses|glossary|heisigkeyword|jlabdictionarylookup|jlabremarks|jlabtranslation|keyword|meaningenglish|meanings|otherback|remarksback|sense|termmeaning|translation|translation1|vocabdef|vocabdefinition|vocabularyenglish|vocabularymeaning|wordmeaning|back'),
    ...yomuAliasEntries('Sentence', 'example|examplesentence|examplesentencetext|contextsentence|contexttext|sentenceexpression|sentencefurigana|sentencekanji|sentencetext|sentkanji|japanesesentence|miningsentence|sourcesentence|sourcetext'),
    ...yomuAliasEntries('Url', 'sourceurl|url'),
    ...yomuAliasEntries('PartOfSpeech', 'pos|partofspeech'),
    ...yomuAliasEntries('Pitch', 'pitchaccent'),
    ...yomuAliasEntries('DictionaryDefinitions', 'dictionary|dictionaries|dictionarydefinition|dictionarydefinitions'),
]);

function yomuAliasEntries(field: string, aliases: string): Array<[string, string]> {
    return aliases.split('|').map(alias => [alias, field]);
}

function noteLooksLikeYomuModel(modelName: string, settings: ReaderSettings, fieldNames: string[]): boolean {
    const configuredModel = resolvedAnkiModelName(settings);
    if (modelName === configuredModel) return true;
    return yomuModelFieldSet(fieldNames);
}

function shouldTreatExistingModelAsYomuManaged(modelName: string, settings: ReaderSettings, fieldNames: string[]): boolean {
    const configuredModel = resolvedAnkiModelName(settings);
    if (modelName === configuredModel && isDefaultYomuModelName(configuredModel)) return true;
    return yomuModelFieldSet(fieldNames);
}

function isDefaultYomuModelName(modelName: string): boolean {
    return modelName === 'よむ Japanese' || modelName === 'Yomu Japanese';
}

function yomuModelFieldSet(fieldNames: string[]): boolean {
    const fieldSet = new Set(fieldNames);
    return ['Expression', 'Meaning', 'Sentence', 'DictionaryDefinitions'].every(field => fieldSet.has(field));
}

function mergeAudioFilesForNote(fieldNames: string[], options: AnkiCardContext & { audioMergeMode?: AnkiAudioMergeMode }, card: JPDBCard, mapping?: AnkiFieldMapping): AnkiMediaFile[] {
    if (options.audioMergeMode === 'theirs') return [];
    const fieldName = fieldNameForRole(fieldNames, 'audio', mapping) || mediaFieldName(fieldNames, ANKI_PRONUNCIATION_AUDIO_FIELD_NAMES);
    if (!fieldName) return [];
    return retargetMediaFiles(audioFilesFromContext(options, card), fieldName);
}

function mergePictureFilesForNote(
    fieldNames: string[],
    existingFields: Record<string, string>,
    options: AnkiCardContext,
    card: JPDBCard,
    canOwnYomuFields: boolean,
    mapping?: AnkiFieldMapping,
): AnkiPicture[] {
    const fieldName = fieldNameForRole(fieldNames, 'image', mapping);
    if (!fieldName || !options.imageDataUrl) return [];
    if (!canOwnYomuFields && existingFields[fieldName]) return [];
    const image = imageFromDataUrl(options.imageDataUrl, card);
    return image ? [{ ...image, fields: [fieldName] }] : [];
}

function applyMediaFieldClears(
    fields: Record<string, string>,
    audio: AnkiMediaFile[],
    picture: AnkiPicture[],
    audioMergeMode: AnkiAudioMergeMode | undefined,
    canOwnYomuFields: boolean,
): void {
    if (audio.length && audioMergeMode === 'ours') fields[audio[0].fields[0]] = '';
    if (picture.length && canOwnYomuFields) fields[picture[0].fields[0]] = '';
}

function mediaFieldName(fieldNames: string[], preferredNames: string[]): string {
    const exact = preferredNames.find(name => fieldNames.includes(name));
    if (exact) return exact;
    const preferredLower = new Set(preferredNames.map(name => name.toLowerCase()));
    return fieldNames.find(name => preferredLower.has(name.toLowerCase())) ?? '';
}

function retargetMediaFiles<T extends AnkiMediaFile | AnkiPicture>(files: T[], fieldName: string): T[] {
    return files.map(file => ({ ...file, fields: [fieldName] }));
}

function audioFilesFromContext(options: AnkiCardContext, card: JPDBCard): AnkiMediaFile[] {
    const files = [
        audioFromMedia({ dataUrl: options.wordAudioDataUrl, url: options.wordAudioUrl, kind: 'word' }, card),
        audioFromMedia({ dataUrl: options.audioDataUrl, url: options.audioUrl, kind: 'context' }, card),
    ].filter((file): file is AnkiMediaFile => Boolean(file));
    return uniqueAnkiAudioFiles(files);
}

function audioFromMedia(media: AnkiWordAudioMedia & { kind: string }, card: JPDBCard): AnkiMediaFile | null {
    const fromData = media.dataUrl ? audioFromDataUrl(media.dataUrl, card, media.kind) : null;
    if (fromData) return fromData;
    return media.url ? audioFromUrl(media.url, card, media.kind) : null;
}

function audioFromDataUrl(dataUrl: string, card: JPDBCard, kind: string): AnkiMediaFile | null {
    const parsed = parseAnkiAudioDataUrl(dataUrl);
    if (!parsed) return null;
    return {
        filename: `yomu_${safeAnkiMediaName(card)}_${kind}_${Date.now()}.${parsed.extension}`,
        data: parsed.data,
        fields: ['Audio'],
    };
}

function audioFromUrl(url: string, card: JPDBCard, kind: string): AnkiMediaFile | null {
    const cleanUrl = url.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) return null;
    return {
        filename: `yomu_${safeAnkiMediaName(card)}_${kind}_${Date.now()}${audioUrlExtension(cleanUrl)}`,
        url: cleanUrl,
        fields: ['Audio'],
    };
}

function uniqueAnkiAudioFiles(files: AnkiMediaFile[]): AnkiMediaFile[] {
    const seen = new Set<string>();
    return files.filter(file => {
        const key = file.data ? `data:${file.data}` : `url:${file.url ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function parseAnkiImageDataUrl(dataUrl: string): ParsedAnkiImageDataUrl | null {
    const match = /^data:image\/(png|jpeg|jpg|webp|svg\+xml)(?:;[^,]*)?;base64,(.+)$/i.exec(dataUrl);
    return match ? { extension: ankiImageExtension(match[1]), data: match[2] } : null;
}

function parseAnkiAudioDataUrl(dataUrl: string): ParsedAnkiAudioDataUrl | null {
    const match = /^data:audio\/([a-z0-9.+-]+)(?:;[^,]*)?;base64,(.+)$/i.exec(dataUrl);
    return match ? { extension: ankiAudioExtension(match[1]), data: match[2] } : null;
}

const ANKI_IMAGE_EXTENSION_ALIASES: Record<string, string> = {
    'jpeg': 'jpg',
    'svg+xml': 'svg',
};

function ankiImageExtension(rawExtension: string): string {
    const extension = rawExtension.toLowerCase();
    return ANKI_IMAGE_EXTENSION_ALIASES[extension] ?? extension;
}

const ANKI_AUDIO_EXTENSION_ALIASES: Record<string, string> = {
    'mpeg': 'mp3',
    'mp3': 'mp3',
    'wav': 'wav',
    'wave': 'wav',
    'x-wav': 'wav',
    'ogg': 'ogg',
    'oga': 'ogg',
    'webm': 'webm',
    'mp4': 'mp4',
    'aac': 'aac',
    'flac': 'flac',
};

function ankiAudioExtension(rawExtension: string): string {
    return ANKI_AUDIO_EXTENSION_ALIASES[rawExtension.toLowerCase()] ?? 'mp3';
}

function audioUrlExtension(url: string): string {
    try {
        const pathname = new URL(url, location.href).pathname;
        const match = /\.([a-z0-9]+)$/i.exec(pathname);
        if (match) return `.${ankiAudioExtension(match[1])}`;
    } catch {
        // Fall through to the common Immersion Kit format.
    }
    return '.mp3';
}

function safeAnkiMediaName(card: JPDBCard): string {
    return card.spelling.replace(/[^\p{L}\p{N}-]+/gu, '_').slice(0, 24) || 'yomu';
}

function isMobileAnkiHandoffEnvironment(): boolean {
    const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    return isAppleTouchBrowser()
        || (/Android/i.test(userAgent) && /Chrome|Firefox|Firefox\/|FxiOS|EdgA/i.test(userAgent));
}

export function canUseMobileAnkiHandoff(settings: ReaderSettings): boolean {
    return settings.ankiEnabled && settings.ankiMobileHandoff && isMobileAnkiHandoffEnvironment();
}

function openMobileAnkiHandoff(note: AnkiNote): boolean {
    const handoff = mobileAnkiHandoffTarget(note);
    if (!window.confirm(mobileAnkiHandoffPrompt(note, handoff.appName))) return false;
    location.href = handoff.url;
    return true;
}

function mobileAnkiHandoffTarget(note: AnkiNote): { appName: string; url: string } {
    if (isAndroidUserAgent()) return { appName: 'AnkiDroid', url: androidAnkiDroidIntentUrl(note) };
    return { appName: 'AnkiMobile', url: iosAnkiMobileUrl(note) };
}

export function mobileAnkiHandoffAppName(): string {
    return isAndroidUserAgent() ? 'AnkiDroid' : 'AnkiMobile';
}

function isAndroidUserAgent(): boolean {
    return /Android/i.test(typeof navigator === 'undefined' ? '' : navigator.userAgent);
}

function mobileAnkiHandoffPrompt(note: AnkiNote, appName: string): string {
    const title = stripForMobileHandoff(note.fields.Expression || note.fields.Sentence || 'this note');
    return `Open ${appName} to add "${title}"? This creates a new note only.`;
}

function iosAnkiMobileUrl(note: AnkiNote): string {
    const params = new URLSearchParams();
    params.set('type', note.modelName);
    params.set('deck', iosAnkiMobileDeckName(note.deckName));
    if (note.tags?.length) params.set('tags', note.tags.join(' '));
    Object.entries(iosAnkiMobileFields(note)).forEach(([field, value]) => {
        const handoffValue = iosAnkiMobileFieldValue(field, value);
        if (handoffValue !== null) params.set(`fld${field}`, handoffValue);
    });
    return `anki://x-callback-url/addnote?${params.toString()}`;
}

function iosAnkiMobileDeckName(deckName: string): string {
    const trimmed = deckName.trim();
    return YOMU_DEFAULT_DECK_NAMES.has(trimmed.toLowerCase()) ? ANKI_MOBILE_FALLBACK_DECK : trimmed || ANKI_MOBILE_FALLBACK_DECK;
}

function iosAnkiMobileFields(note: AnkiNote): Record<string, string> {
    const fields = { ...note.fields };
    const audioUrl = firstMobileHandoffMediaUrl(note.audio);
    const audioField = firstMobileHandoffMediaField(note.audio) || 'Audio';
    if (audioUrl && !(fields[audioField] ?? '').trim()) fields[audioField] = audioUrl;
    const imageUrl = firstMobileHandoffMediaUrl(note.picture);
    const imageField = firstMobileHandoffMediaField(note.picture) || 'Image';
    if (imageUrl && !(fields[imageField] ?? '').trim()) fields[imageField] = imageUrl;
    return fields;
}

function firstMobileHandoffMediaUrl(files: Array<AnkiMediaFile | AnkiPicture> | undefined): string {
    return files?.map(file => 'url' in file ? file.url ?? '' : '').find(isMobileHandoffMediaUrl) ?? '';
}

function firstMobileHandoffMediaField(files: Array<AnkiMediaFile | AnkiPicture> | undefined): string {
    return files?.flatMap(file => file.fields ?? []).map(field => field.trim()).find(Boolean) ?? '';
}

function isMobileHandoffMediaUrl(value: string): boolean {
    return /^https?:\/\//i.test(value)
        && /\.(?:aac|flac|gif|jpe?g|m4a|mp3|mp4|oga|ogg|opus|png|svg|webm|webp|wav)(?:[?#].*)?$/i.test(value);
}

function iosAnkiMobileFieldValue(field: string, value: string): string | null {
    if (field !== 'Image') return value;
    const trimmed = value.trim();
    if (!trimmed || /^data:/i.test(trimmed)) return null;
    return trimmed;
}

function androidAnkiDroidIntentUrl(note: AnkiNote): string {
    const front = stripForMobileHandoff(note.fields.Expression || note.fields.Sentence || '');
    const back = stripForMobileHandoff([
        note.fields.Reading,
        note.fields.Meaning,
        note.fields.DictionaryDefinitions,
        note.fields.Source,
    ].filter(Boolean).join('\n\n'));
    return [
        'intent:#Intent',
        'action=android.intent.action.SEND',
        'type=text/plain',
        'package=com.ichi2.anki',
        `S.android.intent.extra.SUBJECT=${encodeURIComponent(front)}`,
        `S.android.intent.extra.TEXT=${encodeURIComponent(back)}`,
        `S.browser_fallback_url=${encodeURIComponent('https://play.google.com/store/apps/details?id=com.ichi2.anki')}`,
        'end',
    ].join(';');
}

function stripForMobileHandoff(value: string): string {
    return stripHtml(value).replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function visibleArea(element: HTMLElement): number {
    const rect = element.getBoundingClientRect();
    const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
    const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    return width * height;
}

function unique<T>(items: T[]): T[] {
    return [...new Set(items)];
}

function chunkArray<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
    return chunks;
}

function ankiEaseFromGrade(grade: JPDBGrade): number {
    return ANKI_EASE_BY_GRADE[grade] ?? 3;
}

const YOMU_RECOGNITION_TEMPLATE_NAME = 'Recognition';
const YOMU_CONTEXT_TEMPLATE_NAME = 'Context';

function yomuCardTemplates(settings: ReaderSettings): Record<string, { Front: string; Back: string }> {
    const language = settings.interfaceLanguage;
    const recognitionFront = `
<main class="yomu-card yomu-front">
    <div class="yomu-expression">{{Expression}}</div>
    ${settings.ankiFrontReading ? '{{#Reading}}<div class="yomu-reading">{{Reading}}</div>{{/Reading}}' : ''}
    ${settings.ankiFrontSentence ? '{{#Sentence}}<div class="yomu-sentence">{{Sentence}}</div>{{/Sentence}}' : ''}
    ${settings.ankiFrontImage ? '{{#Image}}<div class="yomu-image">{{Image}}</div>{{/Image}}' : ''}
</main>`;
    const contextFront = `
<main class="yomu-card yomu-front">
    {{#Sentence}}<div class="yomu-sentence yomu-sentence-front">{{Sentence}}</div>{{/Sentence}}
    ${settings.ankiFrontImage ? '{{#Image}}<div class="yomu-image">{{Image}}</div>{{/Image}}' : ''}
    <div class="yomu-prompt">${escapeHtml(uiText(language, 'ankiPromptRecallWord'))}</div>
</main>`;
    const back = `
{{FrontSide}}
<main class="yomu-card yomu-back">
    <section class="yomu-section yomu-answer">
        <div class="yomu-expression">{{Expression}}</div>
        {{#Reading}}<div class="yomu-reading">{{Reading}}</div>{{/Reading}}
        {{#Audio}}<div class="yomu-audio">{{Audio}}</div>{{/Audio}}
    </section>
    {{#Meaning}}<section class="yomu-section"><h2>${escapeHtml(uiText(language, 'ankiMeaningHeading'))}</h2><div class="yomu-meaning">{{Meaning}}</div></section>{{/Meaning}}
    {{#DictionaryDefinitions}}<section class="yomu-section"><h2>${escapeHtml(uiText(language, 'dictionaries'))}</h2>{{DictionaryDefinitions}}</section>{{/DictionaryDefinitions}}
    {{#Kanji}}<section class="yomu-section"><h2>${escapeHtml(uiText(language, 'kanji'))}</h2>{{Kanji}}</section>{{/Kanji}}
    <section class="yomu-section yomu-meta">
        {{#Frequency}}<div><strong>${escapeHtml(uiText(language, 'factFrequency'))}</strong>{{Frequency}}</div>{{/Frequency}}
        {{#Pitch}}<div><strong>${escapeHtml(uiText(language, 'ankiPitchHeading'))}</strong>{{Pitch}}</div>{{/Pitch}}
        {{#PartOfSpeech}}<div><strong>${escapeHtml(uiText(language, 'ankiPartOfSpeechHeading'))}</strong><span>{{PartOfSpeech}}</span></div>{{/PartOfSpeech}}
        {{#JPDB}}<div><strong>${escapeHtml(uiText(language, 'ankiLinksHeading'))}</strong><span>{{JPDB}}</span></div>{{/JPDB}}
        {{#Source}}<div><strong>${escapeHtml(uiText(language, 'ankiSourceHeading'))}</strong><span>{{Source}}</span></div>{{/Source}}
    </section>
</main>`;
    const templateName = settings.ankiTemplateMode === 'context'
        ? YOMU_CONTEXT_TEMPLATE_NAME
        : YOMU_RECOGNITION_TEMPLATE_NAME;
    return {
        [templateName]: {
            Front: settings.ankiTemplateMode === 'context' ? contextFront : recognitionFront,
            Back: back,
        },
    };
}

function yomuCardCss(): string {
    const color = ANKI_CARD_COLOR_TOKENS;
    return `
.card {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Yu Gothic", sans-serif;
    font-size: 20px;
    line-height: 1.45;
    text-align: left;
    color: ${color.text};
    background: ${color.background};
}
.yomu-card { max-width: 760px; margin: 0 auto; padding: 22px; }
.yomu-expression { font-size: 44px; font-weight: 850; letter-spacing: 0; line-height: 1.1; }
.yomu-reading { margin-top: 6px; color: ${color.muted}; font-size: 24px; }
.yomu-prompt { margin-top: 14px; color: ${color.muted}; font-size: 16px; }
.yomu-sentence {
    margin-top: 18px;
    padding: 14px 16px;
    border: 1px solid ${color.sentenceBorder};
    border-radius: 12px;
    background: ${color.sentenceBackground};
    color: ${color.sentenceText};
}
.yomu-highlight { color: ${color.highlight}; font-weight: 800; }
.yomu-sentence-front { font-size: 28px; }
.yomu-image img, .yomu-image { max-width: 100%; border-radius: 10px; margin-top: 16px; }
.yomu-section {
    margin-top: 16px;
    padding: 14px 16px;
    border: 1px solid ${color.sectionBorder};
    border-radius: 12px;
    background: ${color.sectionBackground};
}
.yomu-section h2 {
    margin: 0 0 10px;
    color: ${color.headingText};
    font-size: 14px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
}
.yomu-definition, .yomu-dict-entry, .yomu-kanji-entry { margin-top: 12px; }
.yomu-definition:first-child, .yomu-dict-entry:first-child, .yomu-kanji-entry:first-child { margin-top: 0; }
.yomu-pos, .yomu-dict-label, .yomu-tags {
    display: inline-block;
    margin: 0 8px 6px 0;
    color: ${color.labelText};
    font-size: 14px;
    font-style: italic;
}
.yomu-glossary div { margin-top: 4px; }
.yomu-dict-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; margin-bottom: 4px; }
.yomu-dict-expression, .yomu-kanji-char { color: ${color.expressionText}; font-size: 24px; font-weight: 800; }
.yomu-dict-reading, .yomu-kanji-reading { color: ${color.readingText}; }
.yomu-kanji-char { font-size: 34px; }
.yomu-chip {
    display: inline-block;
    margin: 2px 6px 2px 0;
    padding: 2px 8px;
    border: 1px solid ${color.chipBorder};
    border-radius: 999px;
    color: ${color.chipText};
    font-size: 14px;
}
.yomu-meta > div { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.yomu-meta > div:first-child { margin-top: 0; }
.yomu-meta strong { min-width: 112px; color: ${color.metaLabelText}; }
a { color: ${color.highlight}; text-decoration: none; }
a:hover { text-decoration: underline; }
ul, ol { margin: 6px 0 0 22px; padding: 0; }
table { max-width: 100%; border-collapse: collapse; }
td, th { border: 1px solid ${color.tableBorder}; padding: 4px 6px; }
`;
}

function renderJpdbMeanings(card: JPDBCard): string {
    return card.meanings.slice(0, 8).map(meaning => {
        const pos = formatPartOfSpeech(meaning.partOfSpeech);
        return `<div class="yomu-definition">
            ${pos ? `<span class="yomu-pos">${escapeHtml(pos)}</span>` : ''}
            <div>${escapeHtml(meaning.glosses.join('; '))}</div>
        </div>`;
    }).join('');
}

function sentenceHighlightTargets(card: JPDBCard, context: AnkiFieldContext): string[] {
    return [context.sentenceTarget, card.spelling, card.reading];
}

function renderSentence(sentence: string, targets: string[]): string {
    if (!sentence) return '';
    const target = firstSentenceHighlightTarget(sentence, targets);
    if (!target) return escapeHtml(sentence);
    return sentence.split(target)
        .map(part => escapeHtml(part))
        .join(`<span class="yomu-highlight">${escapeHtml(target)}</span>`);
}

function firstSentenceHighlightTarget(sentence: string, targets: string[]): string {
    const seen = new Set<string>();
    for (const target of targets) {
        const normalized = target.trim();
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        if (sentence.includes(normalized)) return normalized;
    }
    return '';
}

function renderDictionaryDefinitions(entries: YomitanTermEntry[], preferences: DictionaryPreference[]): string {
    const groups = Array.from(groupTermEntriesByDictionary(entries).entries()).slice(0, 6);
    return groups.map(([dictionary, items]) => `
        <div class="yomu-dict-group">
            <h3 class="yomu-dict-label">${escapeHtml(dictionaryLabel(dictionary, preferences))}</h3>
            ${items.slice(0, 6).map(entry => `
                <div class="yomu-dict-entry">
                    <div class="yomu-dict-head">
                        <span class="yomu-dict-expression">${escapeHtml(entry.expression)}</span>
                        ${entry.reading && entry.reading !== entry.expression ? `<span class="yomu-dict-reading">${escapeHtml(entry.reading)}</span>` : ''}
                        ${entry.definitionTags || entry.rules || entry.termTags ? `<span class="yomu-tags">${escapeHtml([entry.definitionTags, entry.rules, entry.termTags].filter(Boolean).join(' · '))}</span>` : ''}
                    </div>
                    <div class="yomu-glossary" data-dictionary="${escapeHtml(entry.dictionary)}">${entry.glossary.slice(0, 5).map(item => `<div>${safeGlossaryHtml(item, entry.dictionary)}</div>`).join('')}</div>
                </div>
            `).join('')}
        </div>
    `).join('');
}

function renderKanjiDefinitions(entries: YomitanKanjiEntry[], preferences: DictionaryPreference[], language: ReaderSettings['interfaceLanguage']): string {
    const byCharacter = new Map<string, YomitanKanjiEntry[]>();
    for (const entry of entries) {
        const group = byCharacter.get(entry.character) ?? [];
        group.push(entry);
        byCharacter.set(entry.character, group);
    }
    return Array.from(byCharacter.entries()).slice(0, 8).map(([character, items]) => `
        <div class="yomu-kanji-entry">
            <div class="yomu-dict-head">
                <span class="yomu-kanji-char">${escapeHtml(character)}</span>
                <span class="yomu-dict-label">${escapeHtml(items.map(item => dictionaryLabel(item.dictionary, preferences)).filter(uniqueValue).slice(0, 3).join(' · '))}</span>
            </div>
            ${items.slice(0, 3).map(item => `
                <div>
                    ${item.onyomi.length ? `<span class="yomu-kanji-reading">${escapeHtml(uiText(language, 'onReading'))} ${escapeHtml(item.onyomi.join('、'))}</span>` : ''}
                    ${item.kunyomi.length ? `<span class="yomu-kanji-reading"> ${escapeHtml(uiText(language, 'kunReading'))} ${escapeHtml(item.kunyomi.join('、'))}</span>` : ''}
                    <div>${item.meanings.slice(0, 8).map(meaning => escapeHtml(meaning)).join('; ')}</div>
                    ${item.tags.length ? `<span class="yomu-tags">${escapeHtml(item.tags.join(' · '))}</span>` : ''}
                </div>
            `).join('')}
        </div>
    `).join('');
}

function renderFrequency(card: JPDBCard, entries: YomitanMetaEntry[], preferences: DictionaryPreference[]): string {
    const chips: string[] = [];
    if (card.frequencyRank) chips.push(`<span class="yomu-chip">JPDB #${card.frequencyRank}</span>`);
    for (const entry of entries) {
        appendFrequencyChip(chips, entry, preferences);
        if (chips.length >= 8) break;
    }
    return chips.filter(uniqueValue).join(' ');
}

function appendFrequencyChip(chips: string[], entry: YomitanMetaEntry, preferences: DictionaryPreference[]): void {
    if (entry.mode !== 'freq') return;
    const value = formatMetaFrequency(entry.data);
    if (value) chips.push(`<span class="yomu-chip">${escapeHtml(dictionaryLabel(entry.dictionary, preferences))} ${escapeHtml(value)}</span>`);
}

function renderPitchField(card: JPDBCard, entries: YomitanMetaEntry[], preferences: DictionaryPreference[]): string {
    const chips = firstJpdbPitchChip(card);
    for (const entry of entries) {
        appendPitchChip(chips, entry, preferences);
        if (chips.length >= 4) break;
    }
    return chips.filter(uniqueValue).join(' ');
}

function firstJpdbPitchChip(card: JPDBCard): string[] {
    const pitch = card.pitchAccent.find(Boolean);
    if (!pitch) return [];
    const reading = card.reading && card.reading !== card.spelling ? `${card.reading} ` : '';
    return [`<span class="yomu-chip">JPDB ${escapeHtml(reading)}${escapeHtml(pitch)}</span>`];
}

function appendPitchChip(chips: string[], entry: YomitanMetaEntry, preferences: DictionaryPreference[]): void {
    if (entry.mode !== 'pitch') return;
    const value = formatMetaPitch(entry.data);
    if (value) chips.push(`<span class="yomu-chip">${escapeHtml(dictionaryLabel(entry.dictionary, preferences))} ${escapeHtml(value)}</span>`);
}

function renderSource(sourceUrl: string, sourceTitle: string): string {
    const source = ankiSourceLink(sourceUrl, sourceTitle);
    if (!source.label) return '';
    return source.href ? `<a href="${escapeHtml(source.href)}">${escapeHtml(source.label)}</a>` : escapeHtml(source.label);
}

function ankiSourceLink(sourceUrl: string, sourceTitle: string): { href: string; label: string } {
    return { href: sourceUrl, label: sourceTitle || sourceUrl };
}

function dictionaryLabel(name: string, preferences: DictionaryPreference[]): string {
    return preferences.find(item => item.name === name)?.alias || name;
}

function uniqueValue<T>(value: T, index: number, array: T[]): boolean {
    return array.indexOf(value) === index;
}

function safeGlossaryHtml(value: unknown, dictionary: string): string {
    const html = glossaryToHtml(value, dictionary);
    return html || escapeHtml(glossaryToText(value));
}

function formatMetaPitch(value: unknown): string {
    const record = metaRecord(value);
    if (!record) return '';
    const positions = metaPitchPositions(record);
    return positions.length ? formatPitchPositions(positions) : formatPitchPosition(record.position);
}

function metaRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function metaPitchPositions(record: Record<string, unknown>): unknown[] {
    if (Array.isArray(record.pitches)) return record.pitches;
    return Array.isArray(record.positions) ? record.positions : [];
}

function formatPitchPositions(positions: unknown[]): string {
    return positions.slice(0, 4).map(String).join(', ');
}

function formatPitchPosition(position: unknown): string {
    return typeof position === 'number' ? String(position) : '';
}

function safeLocationHref(): string {
    return typeof location === 'undefined' ? '' : location.href;
}

function safeDocumentTitle(): string {
    return typeof document === 'undefined' ? '' : document.title;
}
