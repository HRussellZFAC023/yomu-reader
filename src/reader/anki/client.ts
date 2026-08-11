import { runLimited } from '../core/async-utils';
import { chunkArray, unique } from '../core/array-utils';
import { resolveUiLanguage, uiText } from '../app/i18n';
import { Logger } from '../app/logger';
import { gmStorageGet, gmStorageGetSync, gmStorageSet } from '../app/storage';
import type { JPDBCard, JPDBGrade, ReaderSettings } from '../app/types';
import {
    type AnkiAudioMergeMode,
    type AnkiCardContext,
    type AnkiCardInfo,
    type AnkiDeckStats,
    type AnkiExistingNote,
    type AnkiLibraryScanResult,
    type AnkiLookupResult,
    type AnkiMergeYomuResult,
    type AnkiModelScanResult,
    type AnkiModelUpdatePlan,
    type AnkiMultiAction,
    type AnkiNote,
    type AnkiNoteInfo,
    type AnkiNoteUpdate,
    type AnkiResponse,
    type AnkiStatusIndex,
    type AnkiStatusIndexCardData,
    type AnkiStatusIndexCardSets,
    type AnkiStatusIndexEntry,
} from './types';
import {
    hasUserscriptAnkiBridge,
    isAnkiConnectAvailabilityError,
    postAnkiJson,
    safeLocationHref,
} from './transport';
import { resolvedAnkiDeckName, resolvedAnkiModelName } from './anki-settings';
import {
    noteLooksLikeYomuModel,
    shouldTreatExistingModelAsYomuManaged,
} from './model-fields';
import { missingYomuModelFields, YOMU_MODEL_FIELDS } from './model-schema';
import {
    ankiFieldMappingForModel,
    flattenNoteFields,
    lookupKeyTermsForCard,
    noteLooksLikeCard,
    scanAnkiModelFields,
} from './field-mapping';
import {
    ankiNoteForDuplicatePreflight,
    mergedYomuFields,
    retargetAnkiNoteForMobileHandoff,
    retargetAnkiNoteToExistingModel,
} from './field-retarget';
import { buildYomuAnkiFields, type AnkiNoteFieldTargetPlan } from './field-render';
import {
    ankiExistingNoteFromInfo,
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
import { canUseMobileAnkiHandoff, openMobileAnkiHandoff } from './mobile-handoff';
import {
    applyMediaFieldClears,
    audioFilesFromContext,
    imageFromDataUrl,
    mergeAudioFilesForNote,
    mergePictureFilesForNote,
} from './media-files';
import { yomuCardCss, yomuCardTemplates } from './card-template';
import {
    AccountBoundAnkiStatusIndexLoader,
    AnkiMediaDataUrlCache,
    ankiAccountContextKey,
    ankiStatusIndexSettingsKey,
    currentAnkiFieldTargetPlan,
    resolvedAnkiStatusIds,
    shouldLoadAnkiFieldTargetPlan,
    type AnkiStatusIndexRebuildContext,
} from './account-context';

export type {
    AnkiAudioMergeMode,
    AnkiCardContext,
    AnkiLibraryScanResult,
    AnkiLookupResult,
    AnkiMergeYomuResult,
} from './types';

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
const STATUS_INDEX_REBUILD_CANCELLED = Symbol('status-index-rebuild-cancelled');
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

interface MatchingAnkiNotesByLookupKey {
    notesByCacheKey: Map<string, AnkiNoteInfo[]>;
    uniqueNotes: AnkiNoteInfo[];
}

export class AnkiConnectClient {
    private lookupCache = new Map<string, { at: number; result: AnkiLookupResult }>();
    private readonly mediaDataUrls: AnkiMediaDataUrlCache;
    private statusLookupCache = new Map<string, { at: number; result: AnkiLookupResult }>();
    private lookupInflight = new Map<string, Promise<AnkiLookupResult>>();
    private statusIndex?: AnkiStatusIndex | null;
    private readonly statusIndexLoader: AccountBoundAnkiStatusIndexLoader;
    private statusIndexRefresh?: Promise<AnkiStatusIndex | null>;
    private statusIndexRefreshQueued = false;
    private availabilityProbe?: Promise<boolean>;
    private availabilityCheckedAt = 0;
    private unavailableUntil = 0;
    private fieldTargetPlanCache?: { key: string; expiresAt: number; promise: Promise<AnkiNoteFieldTargetPlan | null> };
    private isDestroyed = false;
    private focusStatusRefreshListener?: () => void;
    private lastFocusStatusRefreshAt = 0;
    private accountEpoch = 0;

    constructor(private getSettings: () => ReaderSettings) {
        this.mediaDataUrls = new AnkiMediaDataUrlCache(
            () => ankiAccountContextKey(this.getSettings()),
            filename => this.invoke<string | false>('retrieveMediaFile', { filename }),
        );
        this.statusIndexLoader = new AccountBoundAnkiStatusIndexLoader({
            current: () => this.statusIndex,
            store: index => { this.statusIndex = index; },
            valid: index => this.validStatusIndex(index),
            synchronous: () => gmStorageGetSync<AnkiStatusIndex | null>(ANKI_STATUS_INDEX_STORAGE_KEY, null),
            loadStored: () => this.loadStoredStatusIndex(),
            settingsKey: () => ankiStatusIndexSettingsKey(this.getSettings()),
        });
        this.installFocusStatusRefresh();
    }

    // Companion lifecycle API consumed by page and newtab runtimes through the structural Anki client.
    // fallow-ignore-next-line unused-class-member
    destroy(): void {
        this.isDestroyed = true;
        this.clearAccountContext();
        if (this.focusStatusRefreshListener) {
            window.removeEventListener('focus', this.focusStatusRefreshListener);
            document.removeEventListener('visibilitychange', this.focusStatusRefreshListener);
            this.focusStatusRefreshListener = undefined;
        }
    }

    clearAccountContext(): void {
        this.accountEpoch++;
        this.lookupCache.clear();
        this.statusLookupCache.clear();
        this.lookupInflight.clear();
        this.mediaDataUrls.clear();
        this.statusIndex = undefined;
        this.statusIndexLoader.clear();
        this.statusIndexRefresh = undefined;
        this.statusIndexRefreshQueued = false;
        this.availabilityProbe = undefined;
        this.availabilityCheckedAt = 0;
        this.unavailableUntil = 0;
        this.fieldTargetPlanCache = undefined;
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
    // fallow-ignore-next-line unused-class-member
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
        const cachedAvailability = this.cachedBackgroundAvailability();
        if (cachedAvailability !== undefined) return cachedAvailability;
        const epoch = this.accountEpoch;
        const probe = this.invokeWithTimeout<number>('version', {}, ANKI_BACKGROUND_REQUEST_TIMEOUT_MS)
            .then(() => {
                if (this.isDestroyed || epoch !== this.accountEpoch) return false;
                this.markAvailable();
                return true;
            })
            .catch(error => {
                if (epoch !== this.accountEpoch) return false;
                log.warnOnce('background-availability-unavailable', 'AnkiConnect unavailable for background work', error);
                this.unavailableUntil = Date.now() + ANKI_BACKGROUND_UNAVAILABLE_COOLDOWN_MS;
                return false;
            })
            .finally(() => {
                if (this.availabilityProbe === probe) this.availabilityProbe = undefined;
            });
        this.availabilityProbe = probe;
        return probe;
    }

    private cachedBackgroundAvailability(): boolean | Promise<boolean> | undefined {
        if (this.isDestroyed || this.isLookupCoolingDown()) return false;
        return Date.now() - this.availabilityCheckedAt < ANKI_BACKGROUND_AVAILABILITY_TTL_MS
            ? true
            : this.availabilityProbe;
    }

    async deckNames(): Promise<string[]> {
        return this.invoke<string[]>('deckNames');
    }

    async modelNames(): Promise<string[]> {
        return this.invoke<string[]>('modelNames');
    }

    // Mirrors prepareAnkiNoteForConnect's decision so card previews can show
    // exactly which fields a mining write will target instead of silently
    // retargeting into an existing non-Yomu model at write time.
    // Public preview helper used by card render data through the Anki dependency.
    // fallow-ignore-next-line unused-class-member
    async noteFieldTargetPlan(): Promise<AnkiNoteFieldTargetPlan | null> {
        const settings = this.getSettings();
        if (!shouldLoadAnkiFieldTargetPlan(settings.ankiEnabled, canUseMobileAnkiHandoff(settings), hasUserscriptAnkiBridge())) return null;
        const modelName = resolvedAnkiModelName(settings);
        const key = `${ankiAccountContextKey(settings)}|${modelName}`;
        const now = Date.now();
        const cached = currentAnkiFieldTargetPlan(this.fieldTargetPlanCache, key, now);
        if (cached) return cached;
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
    // fallow-ignore-next-line unused-class-member
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

    // Public warm-up hook used by app, newtab, and card preload flows through the Anki dependency.
    // fallow-ignore-next-line unused-class-member
    warmStatusIndex(): Promise<AnkiStatusIndex | null> {
        if (this.isDestroyed) return Promise.resolve(null);
        return this.refreshStatusIndexIfNeeded({ rebuildIfMissing: true }) ?? this.loadStatusIndex();
    }

    // Public card status lookup used by popup, page, and newtab render paths through the Anki dependency.
    // fallow-ignore-next-line unused-class-member
    async findExistingCards(card: JPDBCard): Promise<AnkiLookupResult> {
        return (await this.findExistingCardsBatch([card]))[0] ?? emptyAnkiLookupResult();
    }

    // Public batched status lookup used by popup, page, and newtab enrichment through the Anki dependency.
    // fallow-ignore-next-line unused-class-member
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
        return `${ankiAccountContextKey(this.getSettings())}:${lookupKeyTermsForCard(card).join('|')}`;
    }

    private applyLookupGroupResult(results: AnkiLookupResult[], indexes: number[], result: AnkiLookupResult): void {
        indexes.forEach(index => {
            results[index] = result;
        });
    }

    private loadStatusIndex(): Promise<AnkiStatusIndex | null> {
        return this.statusIndexLoader.load();
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
        return index.settingsKey === ankiStatusIndexSettingsKey(this.getSettings()) ? index : null;
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
        const settingsKey = ankiStatusIndexSettingsKey(this.getSettings());
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

    private async loadStatusIndexRebuildContext(cardIds: number[] | undefined, now: number, rebuildLeaseOwner?: string): Promise<AnkiStatusIndexRebuildContext | null> {
        try {
            this.assertStatusIndexRebuildActive();
            const settings = this.getSettings();
            const settingsKey = ankiStatusIndexSettingsKey(settings);
            this.touchStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
            const allCardIds = await resolvedAnkiStatusIds(cardIds, () => this.invoke<number[]>('findCards', { query: 'deck:*' }));
            this.statusIndexRebuildCheckpoint(rebuildLeaseOwner, settingsKey);
            const cardData = await this.loadStatusIndexCardData(allCardIds, rebuildLeaseOwner, settingsKey);
            this.statusIndexRebuildCheckpoint(rebuildLeaseOwner, settingsKey);
            const noteIds = await resolvedAnkiStatusIds(this.statusIndexNoteIdsFromCardData(cardData), () => this.findStatusIndexNoteIds(allCardIds));
            this.statusIndexRebuildCheckpoint(rebuildLeaseOwner, settingsKey);
            return { allCardIds, cardData, noteIds, now, rebuildLeaseOwner, settings, settingsKey };
        } catch (error) {
            if (error === STATUS_INDEX_REBUILD_CANCELLED) return null;
            throw error;
        }
    }

    private assertStatusIndexRebuildActive(): void { if (this.isDestroyed) throw STATUS_INDEX_REBUILD_CANCELLED; }

    private statusIndexRebuildCheckpoint(rebuildLeaseOwner: string | undefined, settingsKey: string): void {
        this.assertStatusIndexRebuildActive();
        this.touchStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
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

    private async tryRebuildStatusIndexToIndexedDb(rebuild: AnkiStatusIndexRebuildContext): Promise<AnkiStatusIndex | null> {
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

    private async rebuildStatusIndexToValueStorage(rebuild: AnkiStatusIndexRebuildContext): Promise<AnkiStatusIndex | null> {
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
        // UT-50: cardsInfo renders every card's templates server-side
        // (~110ms/card — minutes on large collections). The index only needs
        // note/deck/state per card, all of which come from three fast bulk
        // calls; fall back to the rendering path if they are unavailable.
        const fast = await this.loadStatusIndexCardsByNoteFast(allCardIds, sets, rebuildLeaseOwner, settingsKey);
        if (fast) return fast;
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

    private async loadStatusIndexCardsByNoteFast(
        allCardIds: number[],
        sets: AnkiStatusIndexCardSets,
        rebuildLeaseOwner: string | undefined,
        settingsKey: string,
    ): Promise<Map<number, AnkiCardInfo[]> | null> {
        const cardIds = unique(allCardIds).map(Number).filter(Number.isFinite);
        if (!cardIds.length) return new Map();
        try {
            const [noteIds, decks, relearning] = await Promise.all([
                this.invoke<number[]>('cardsToNotes', { cards: cardIds }),
                this.invoke<Record<string, number[]>>('getDecks', { cards: cardIds }),
                this.findCardIdSet('deck:* is:learn is:review'),
            ]);
            if (!Array.isArray(noteIds) || noteIds.length !== cardIds.length || !decks || typeof decks !== 'object') return null;
            this.touchStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
            const deckByCard = new Map<number, string>();
            for (const [deckName, deckCardIds] of Object.entries(decks)) {
                for (const id of deckCardIds ?? []) deckByCard.set(Number(id), deckName);
            }
            const cards = cardIds.map((cardId, index) => this.syntheticStatusIndexCardInfo(cardId, Number(noteIds[index]), deckByCard.get(cardId) ?? '', sets, relearning));
            return cardsByNoteId(cards);
        } catch {
            return null;
        }
    }

    // queue/type synthesized so stateFromAnkiCards classifies exactly like
    // the rendering path: relearn > due > learning > new > suspended > known.
    private syntheticStatusIndexCardInfo(
        cardId: number,
        noteId: number,
        deckName: string,
        sets: AnkiStatusIndexCardSets,
        relearning: Set<number>,
    ): AnkiCardInfo {
        const queue = relearning.has(cardId) ? 3
            : sets.learning.has(cardId) ? 1
            : sets.new.has(cardId) ? 0
            : sets.suspended.has(cardId) ? -1
            : 2;
        return {
            cardId,
            note: noteId,
            deckName,
            queue,
            type: queue === 3 ? 3 : queue === 1 ? 1 : queue === 0 ? 0 : 2,
            reps: 0,
            lapses: 0,
            isDue: sets.due.has(cardId),
        } as AnkiCardInfo;
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
        if (!this.canRememberStatusIndexItems(notes.length)) return;
        const settings = this.getSettings();
        const settingsKey = ankiStatusIndexSettingsKey(settings);
        const now = Date.now();
        const entries = this.rememberedStatusIndexEntries(notes, cardsByNote, settings, now);
        if (!this.canRememberStatusIndexItems(entries.length)) return;
        const current = this.validStatusIndex(await this.loadStatusIndex());
        const base = await this.baseStatusIndexForRememberedNotes(current, settingsKey, now, entries.length);
        const checkedAt = Math.max(base.checkedAt, now);
        if (this.shouldRememberStatusIndexEntriesInIndexedDb(base, current)) {
            await this.rememberIndexedDbStatusIndexEntries({ ...base, checkedAt, entryStore: 'indexeddb', entries: {} }, entries);
            return;
        }
        await this.rememberValueStatusIndexEntries(base, checkedAt, entries);
    }

    private canRememberStatusIndexItems(count: number): boolean { return count > 0 && !this.isDestroyed; }

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

    // Public review action used by card and newtab controls to answer rendered Anki review cards.
    // fallow-ignore-next-line unused-class-member
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
        return this.mediaDataUrls.load(filename, this.text('ankiAudioFileNotFound'));
    }

    // Used by card action controls to merge mining context into existing Anki notes.
    // fallow-ignore-next-line unused-class-member
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
    // fallow-ignore-next-line unused-class-member
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

    // A note type made by an earlier Yomu keeps working, but has no field for
    // what newer releases mine (audio and pitch are the ones users notice).
    // Report what it would gain so settings can offer the update, and null
    // once it already matches — the offer clears itself.
    // Used by the settings Anki panel through the Anki dependency.
    async yomuModelUpdatePlan(): Promise<AnkiModelUpdatePlan | null> {
        const settings = this.getSettings();
        if (!settings.ankiEnabled) return null;
        const modelName = resolvedAnkiModelName(settings);
        const modelNames = await this.modelNames().catch((): string[] => []);
        if (!modelNames.includes(modelName)) return null;
        const fieldNames = await this.invokeOrDefault<string[]>('modelFieldNames', { modelName }, []);
        // An empty read is a failed request, not an empty note type: staying
        // quiet beats offering to "add" all fifteen fields.
        if (!fieldNames.length) return null;
        if (!shouldTreatExistingModelAsYomuManaged(modelName, settings, fieldNames)) return null;
        const missingFields = missingYomuModelFields(fieldNames);
        return missingFields.length ? { modelName, missingFields } : null;
    }

    // Accepting the settings offer lands here. It writes only what the plan
    // above says, re-read now: every reason that plan has for staying quiet —
    // a third-party note type, a field read that failed — is a reason to write
    // nothing, and fifteen fields is a collection-wide schema change Anki has
    // no cheap undo for. An offer made against another note type is declined
    // rather than retargeted, so a stale prompt is a no-op.
    // Fields only: templates and styling stay as the user left them.
    // Used by the settings Anki panel through the Anki dependency.
    // fallow-ignore-next-line unused-class-member
    async addMissingYomuModelFields(expectedModelName: string): Promise<string[]> {
        const plan = await this.yomuModelUpdatePlan();
        if (!plan) return [];
        if (plan.modelName !== expectedModelName) {
            log.info('Anki note type update declined', { offered: expectedModelName, configured: plan.modelName });
            return [];
        }
        await this.addModelFields(plan.modelName, plan.missingFields);
        this.fieldTargetPlanCache = undefined;
        return plan.missingFields;
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

    // Adding nothing is the steady state once the note type matches this
    // release. A field list that would not read is a failed request, not a
    // note type with no fields — Anki has no such thing — so it waits for a
    // read it can trust rather than widening a note type it cannot see.
    private async ensureModelFields(modelName: string): Promise<void> {
        const fieldNames = await this.invoke<string[]>('modelFieldNames', { modelName }).catch((): null => null);
        if (!fieldNames?.length) return;
        await this.addModelFields(modelName, missingYomuModelFields(fieldNames));
    }

    private async addModelFields(modelName: string, fieldNames: string[]): Promise<void> {
        for (const fieldName of fieldNames) {
            await this.invoke<null>('modelFieldAdd', { modelName, fieldName });
        }
        if (fieldNames.length) log.info('Anki model fields added', { modelName, fields: fieldNames });
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
        const body = JSON.stringify({ action, version: ANKI_VERSION, params }, omitInternalAnkiMediaKeys);
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

// yomuAudioKind is internal routing metadata on media files (which audio slot a
// clip belongs to). It has to survive until the retarget pass picks a field, but
// must never appear in an AnkiConnect payload — every action serialises through
// invokeWithTimeout, so drop it here rather than at each of the write paths.
function omitInternalAnkiMediaKeys(key: string, value: unknown): unknown {
    return key === 'yomuAudioKind' ? undefined : value;
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

function isMobileHandoffRecoverableAddError(error: unknown): boolean {
    if (isAnkiConnectAvailabilityError(error)) return true;
    if (error instanceof Error && error.cause && error.cause !== error) {
        return isMobileHandoffRecoverableAddError(error.cause);
    }
    if (!(error instanceof Error)) return false;
    return /unsupported action|action.*unsupported|unknown action|invalid action|not supported/i.test(error.message);
}

function tagsFromString(value: string): string[] {
    return value.split(/[,\s]+/).map(tag => tag.trim()).filter(Boolean);
}

function visibleArea(element: HTMLElement): number {
    const rect = element.getBoundingClientRect();
    const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
    const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    return width * height;
}

function ankiEaseFromGrade(grade: JPDBGrade): number {
    return ANKI_EASE_BY_GRADE[grade] ?? 3;
}

function safeDocumentTitle(): string {
    return typeof document === 'undefined' ? '' : document.title;
}
