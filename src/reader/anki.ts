import { runLimited } from './async-utils';
import { escapeHtml } from './dom';
import type { AnkiWordAudioMedia } from './audio';
import { ANKI_CARD_COLOR_TOKENS } from './color-tokens';
import { formatPartOfSpeech, formatPartOfSpeechDetails } from './pos';
import { isYomuHostedAppUrl } from './app-pages';
import { GITHUB_PAGES_ORIGIN } from './constants';
import { resolveUiLanguage, uiText } from './i18n';
import { formatMetaFrequency, groupTermEntriesByDictionary } from './local-dictionary-groups';
import { Logger } from './logger';
import { gmStorageDeleteSync, gmStorageGet, gmStorageGetSync, gmStorageSet, gmStorageSetSync } from './storage';
import type { AnkiFieldMapping, AnkiFieldMappings, CardState, DictionaryPreference, JPDBCard, JPDBGrade, ReaderSettings } from './types';
import { getUserscriptHttpRequest } from './userscript';
import {
    glossaryToHtml,
    glossaryToText,
    type YomitanKanjiEntry,
    type YomitanMetaEntry,
    type YomitanTermEntry,
} from './yomitan';

const ANKI_VERSION = 6;
const ANKI_STATUS_INDEX_STORAGE_KEY = 'yomu:anki-status-index:v1';
const ANKI_STATUS_INDEX_REBUILD_LEASE_STORAGE_KEY = 'yomu:anki-status-index-rebuild:v1';
const ANKI_STATUS_INDEX_VERSION = 1;
const ANKI_STATUS_INDEX_COUNT_CHECK_MS = 5 * 60 * 1000;
const ANKI_STATUS_INDEX_MAX_STALE_MS = 30 * 60 * 1000;
const ANKI_STATUS_INDEX_REBUILD_LEASE_TTL_MS = 15 * 60 * 1000;
const ANKI_STATUS_INDEX_NOTE_CHUNK_SIZE = 500;
const ANKI_STATUS_INDEX_NOTE_CONCURRENCY = 3;
const ANKI_STATUS_INDEX_DB_NAME = 'yomu-anki-status-index';
const ANKI_STATUS_INDEX_DB_VERSION = 1;
const ANKI_STATUS_INDEX_META_STORE = 'meta';
const ANKI_STATUS_INDEX_ENTRY_STORE = 'entries';
const ANKI_STATUS_INDEX_ENTRY_READ_CHUNK_SIZE = 500;
const ANKI_STATUS_INDEX_ENTRY_WRITE_CHUNK_SIZE = 1000;
const ANKI_STATUS_ONLY_LOOKUP_TERM_CHUNK_SIZE = 120;
const ANKI_CONNECT_REQUEST_TIMEOUT_MS = 5_000;
const ANKI_BACKGROUND_REQUEST_TIMEOUT_MS = 1_500;
const ANKI_BACKGROUND_AVAILABILITY_TTL_MS = 15_000;
const ANKI_BACKGROUND_UNAVAILABLE_COOLDOWN_MS = 60_000;
const ANKI_MODEL_SCAN_SAMPLE_NOTE_LIMIT = 24;
const ANKI_MODEL_SCAN_CONCURRENCY = 3;
const ANKI_RENDERED_MEDIA_LIMIT = 12;
const ANKI_RENDERED_MEDIA_CONCURRENCY = 3;
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

interface AnkiResponse<T> {
    result: T;
    error: string | null;
}

interface AnkiNote {
    deckName: string;
    modelName: string;
    fields: Record<string, string>;
    tags?: string[];
    options?: {
        allowDuplicate?: boolean;
        duplicateScope?: string;
    };
    picture?: Array<{
        filename: string;
        data: string;
        fields: string[];
    }>;
    audio?: AnkiMediaFile[];
}

type AnkiPicture = NonNullable<AnkiNote['picture']>[number];

interface AnkiMediaFile {
    filename: string;
    fields: string[];
    data?: string;
    url?: string;
    skipHash?: string;
}

interface AnkiNoteInfo {
    noteId: number;
    modelName: string;
    tags: string[];
    fields: Record<string, { value: string; order?: number }>;
    cards: number[];
}

interface AnkiCardInfo {
    cardId: number;
    deckName: string;
    queue: number;
    type: number;
    isDue?: boolean;
    question?: string;
    answer?: string;
    due?: number;
    reps?: number;
    lapses?: number;
    interval?: number;
    note?: number;
}

interface AnkiDeckStats {
    total_in_deck?: number;
}

interface AnkiMultiAction {
    action: string;
    params?: Record<string, unknown>;
}

export interface AnkiRenderedCard {
    cardId: number;
    deckName: string;
    question: string;
    answer: string;
    mediaDataUrls?: Record<string, string>;
}

export type AnkiAudioMergeMode = 'both' | 'theirs' | 'ours';

export interface AnkiMergeYomuResult {
    noteId: number;
    modelName: string;
    updatedFields: string[];
    audioAdded: boolean;
    imageAdded: boolean;
}

export interface AnkiExistingNote {
    noteId: number;
    modelName: string;
    deckNames: string[];
    cardIds: number[];
    primaryCardId: number | null;
    state: CardState;
    fields: Record<string, string>;
    renderedCards?: AnkiRenderedCard[];
    detailsUnavailable?: boolean;
    tags: string[];
    reps: number;
    lapses: number;
}

export interface AnkiLookupResult {
    state: CardState;
    notes: AnkiExistingNote[];
    primary: AnkiExistingNote | null;
    trusted?: boolean;
}

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

export type AnkiFieldRole = 'expression' | 'reading' | 'meaning' | 'sentence' | 'audio' | 'image';
const ANKI_FIELD_ROLES: AnkiFieldRole[] = ['expression', 'reading', 'meaning', 'sentence', 'audio', 'image'];

export interface AnkiFieldSuggestion {
    role: AnkiFieldRole;
    fieldName: string | null;
    confidence: 'high' | 'medium' | 'low';
}

export interface AnkiModelScanResult {
    modelName: string;
    fields: string[];
    suggestions: AnkiFieldSuggestion[];
    score: number;
}

export interface AnkiLibraryScanResult {
    deckNames: string[];
    models: AnkiModelScanResult[];
    suggestedModel: AnkiModelScanResult | null;
}

export interface AnkiCardContext {
    deckName?: string;
    imageDataUrl?: string;
    audioDataUrl?: string;
    audioUrl?: string;
    wordAudioDataUrl?: string;
    wordAudioUrl?: string;
    localEntries?: YomitanTermEntry[];
    kanjiEntries?: YomitanKanjiEntry[];
    metaEntries?: YomitanMetaEntry[];
    dictionaryPreferences?: DictionaryPreference[];
    sourceUrl?: string;
    sourceTitle?: string;
    interfaceLanguage?: ReaderSettings['interfaceLanguage'];
}

interface AnkiFieldContext {
    localEntries: YomitanTermEntry[];
    kanjiEntries: YomitanKanjiEntry[];
    metaEntries: YomitanMetaEntry[];
    dictionaryPreferences: DictionaryPreference[];
    sourceUrl: string;
    sourceTitle: string;
    interfaceLanguage: ReaderSettings['interfaceLanguage'];
}

interface ParsedAnkiImageDataUrl {
    extension: string;
    data: string;
}

interface ParsedAnkiAudioDataUrl {
    extension: string;
    data: string;
}

interface AnkiNoteUpdate {
    id: number;
    fields: Record<string, string>;
    audio?: AnkiMediaFile[];
    picture?: AnkiPicture[];
}

interface AnkiStatusIndexEntry {
    state: CardState;
    noteId: number;
    primaryCardId: number | null;
    deckNames: string[];
    reps: number;
    lapses: number;
    modelName: string;
}

interface AnkiStatusIndex {
    version: number;
    settingsKey: string;
    syncedAt: number;
    checkedAt: number;
    cardCount: number;
    entryCount?: number;
    entries: Record<string, AnkiStatusIndexEntry>;
    entryStore?: 'indexeddb';
}

interface AnkiStatusIndexRebuildLease {
    owner: string;
    settingsKey: string;
    startedAt: number;
    expiresAt: number;
}

type StoredAnkiStatusIndexMeta = Omit<AnkiStatusIndex, 'entries'> & { id: 'current'; entries?: Record<string, never> };

interface StoredAnkiStatusIndexEntry {
    key: string;
    entry: AnkiStatusIndexEntry;
}

interface AnkiStatusIndexCardSets {
    all: Set<number>;
    due: Set<number>;
    learning: Set<number>;
    new: Set<number>;
    suspended: Set<number>;
}

interface AnkiStatusIndexCardData {
    sets: AnkiStatusIndexCardSets;
    cardsByNote: Map<number, AnkiCardInfo[]>;
}

interface AnkiFieldContentSample {
    raw: string;
    text: string;
}

type AnkiFieldContentSamples = Record<string, AnkiFieldContentSample[]>;

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
    private isDestroyed = false;

    constructor(private getSettings: () => ReaderSettings) {}

    destroy(): void {
        this.isDestroyed = true;
        this.lookupInflight.clear();
        this.statusIndexLoad = undefined;
        this.statusIndexRefresh = undefined;
        this.statusIndexRefreshQueued = false;
        this.availabilityProbe = undefined;
    }

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
        return this.refreshStatusIndexIfNeeded({ rebuildIfMissing: true }) ?? Promise.resolve(this.statusIndex ?? null);
    }

    async findExistingCards(card: JPDBCard): Promise<AnkiLookupResult> {
        return (await this.findExistingCardsBatch([card]))[0] ?? emptyAnkiLookupResult();
    }

    async findCachedStatusBatch(cards: JPDBCard[]): Promise<AnkiLookupResult[]> {
        const empty = emptyAnkiLookupResult();
        const untrustedEmpty = untrustedAnkiLookupResult();
        if (!cards.length) return [];
        if (this.isDestroyed) return cards.map(() => untrustedEmpty);
        if (this.isLookupCoolingDown()) return cards.map(() => untrustedEmpty);

        const results: AnkiLookupResult[] = cards.map(() => untrustedEmpty);
        const pending: Array<{ card: JPDBCard; index: number; cacheKey: string }> = [];
        cards.forEach((card, index) => {
            const cacheKey = this.lookupCacheKey(card);
            const cached = this.readStatusLookupCache(cacheKey);
            if (cached) {
                results[index] = cached;
                return;
            }
            pending.push({ card, index, cacheKey });
        });
        if (!pending.length) return results;

        const statusIndex = await this.loadStatusIndex();
        if (this.isDestroyed) return cards.map(() => untrustedEmpty);
        if (!statusIndex) {
            this.queueStatusIndexRefresh({ rebuildIfMissing: true });
        } else if (this.statusIndexNeedsCountCheck(statusIndex)) {
            this.queueStatusIndexRefresh();
        }
        const statusEntries = await this.loadStatusEntriesForCards(statusIndex, pending.map(item => item.card));
        if (this.isDestroyed) return results;
        const indexNeedsRefresh = Boolean(statusIndex && this.statusIndexNeedsCountCheck(statusIndex));
        const canUseStatusIndexHits = Boolean(statusIndex && statusIndex.syncedAt > 0);
        const hasActiveRebuildLease = Boolean(activeAnkiStatusIndexRebuildLease(statusIndex?.settingsKey));
        const canTrustStatusMiss = Boolean(statusIndex
            && canUseStatusIndexHits
            && !this.statusIndexRefresh
            && !this.statusIndexRefreshQueued
            && !indexNeedsRefresh
            && !hasActiveRebuildLease
            && (statusIndex.entryStore !== 'indexeddb' || statusEntries));
        pending.forEach(({ card, index, cacheKey }) => {
            const indexed = canUseStatusIndexHits ? this.lookupStatusIndex(statusIndex, card, statusEntries) : null;
            if (!indexed) {
                if (canTrustStatusMiss) {
                    this.writeStatusLookupCache(cacheKey, empty);
                    results[index] = empty;
                }
                return;
            }
            this.writeStatusLookupCache(cacheKey, indexed);
            results[index] = indexed;
        });
        return results;
    }

    async findExistingCardsBatch(cards: JPDBCard[]): Promise<AnkiLookupResult[]> {
        const empty = emptyAnkiLookupResult();
        if (!cards.length) return [];
        if (this.isDestroyed) return cards.map(() => empty);
        if (this.isLookupCoolingDown()) return cards.map(() => empty);
        const results: AnkiLookupResult[] = cards.map(() => empty);
        const pending = new Map<string, { card: JPDBCard; indexes: number[] }>();
        cards.forEach((card, index) => {
            const cacheKey = this.lookupCacheKey(card);
            const cached = this.readLookupCache(cacheKey);
            if (cached) {
                results[index] = cached;
                return;
            }
            const group = pending.get(cacheKey) ?? { card, indexes: [] };
            group.indexes.push(index);
            pending.set(cacheKey, group);
        });
        if (!pending.size) return results;

        const inFlight: Array<[string, { indexes: number[] }, Promise<AnkiLookupResult>]> = [];
        const uncached: Array<[string, { card: JPDBCard; indexes: number[] }]> = [];
        for (const [cacheKey, group] of pending) {
            const promise = this.lookupInflight.get(cacheKey);
            if (promise) inFlight.push([cacheKey, group, promise]);
            else uncached.push([cacheKey, group]);
        }

        try {
            const done = log.time('findExistingCardsBatch', { terms: pending.size, inFlight: inFlight.length });
            await Promise.all(inFlight.map(async ([cacheKey, group, promise]) => {
                const result = await promise;
                if (this.isDestroyed) return;
                this.writeLookupCache(cacheKey, result);
                group.indexes.forEach(index => {
                    results[index] = result;
                });
            }));
            if (this.isDestroyed) return results;
            const resolved = uncached.length
                ? await this.findExistingCardsBatchUncachedWithInflight(uncached, empty)
                : new Map<string, AnkiLookupResult>();
            if (this.isDestroyed) return results;
            for (const [cacheKey, result] of resolved) {
                this.writeLookupCache(cacheKey, result);
                pending.get(cacheKey)?.indexes.forEach(index => {
                    results[index] = result;
                });
            }
            done();
            return results;
        } catch (error) {
            log.warn('Anki batch lookup failed; entering cooldown', { terms: pending.size }, error);
            this.unavailableUntil = Date.now() + ANKI_BACKGROUND_UNAVAILABLE_COOLDOWN_MS;
            return results;
        }
    }

    private lookupCacheKey(card: JPDBCard): string {
        return lookupKeyTermsForCard(card).join('|');
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
            log.warn('IndexedDB Anki status index load failed', error);
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
            log.warn('IndexedDB Anki status entry lookup failed', error);
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

    private refreshStatusIndexIfNeeded(options: { rebuildIfMissing?: boolean } = {}): Promise<AnkiStatusIndex | null> | null {
        if (this.isDestroyed || this.isLookupCoolingDown()) return null;
        if (this.statusIndexRefresh) return this.statusIndexRefresh;
        const run = async (): Promise<AnkiStatusIndex | null> => {
            const index = await this.loadStatusIndex();
            if (this.isDestroyed) return null;
            const now = Date.now();
            if (index && now - index.checkedAt < ANKI_STATUS_INDEX_COUNT_CHECK_MS) return index;
            if (!index && !options.rebuildIfMissing) return null;
            if (!await this.isAvailableForBackground()) return index;
            if (this.isDestroyed) return null;
            const deckStatsCardCount = index ? await this.collectionCardCountFromDeckStats() : null;
            if (this.isDestroyed) return null;
            if (index
                && deckStatsCardCount !== null
                && deckStatsCardCount === index.cardCount
                && now - index.syncedAt < ANKI_STATUS_INDEX_MAX_STALE_MS) {
                const checked = { ...index, checkedAt: now };
                this.statusIndex = checked;
                await saveAnkiStatusIndexCheckedAt(checked);
                return checked;
            }
            const settingsKey = this.statusIndexSettingsKey();
            const rebuildLeaseOwner = claimAnkiStatusIndexRebuildLease(settingsKey);
            if (!rebuildLeaseOwner) return index;
            try {
                const rebuildStartedAt = Date.now();
                const cardIds = await this.invoke<number[]>('findCards', { query: 'deck:*' });
                touchAnkiStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
                if (this.isDestroyed) return null;
                if (index && cardIds.length === index.cardCount && rebuildStartedAt - index.syncedAt < ANKI_STATUS_INDEX_MAX_STALE_MS) {
                    const checked = { ...index, checkedAt: rebuildStartedAt };
                    this.statusIndex = checked;
                    await saveAnkiStatusIndexCheckedAt(checked);
                    return checked;
                }
                return await this.rebuildStatusIndex(cardIds, rebuildStartedAt, rebuildLeaseOwner);
            } finally {
                releaseAnkiStatusIndexRebuildLease(rebuildLeaseOwner);
            }
        };
        this.statusIndexRefresh = run()
            .catch(error => {
                log.warn('Anki status index refresh failed', error);
                return null;
            })
            .finally(() => {
                this.statusIndexRefresh = undefined;
            });
        return this.statusIndexRefresh;
    }

    private queueStatusIndexRefresh(options: { rebuildIfMissing?: boolean } = {}): void {
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
            window.setTimeout(run, 0);
        } else {
            void Promise.resolve().then(run);
        }
    }

    private statusIndexNeedsCountCheck(index: AnkiStatusIndex, now = Date.now()): boolean {
        return now - index.checkedAt >= ANKI_STATUS_INDEX_COUNT_CHECK_MS;
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
        if (this.isDestroyed) return null;
        const settings = this.getSettings();
        const settingsKey = this.statusIndexSettingsKey(settings);
        if (rebuildLeaseOwner) touchAnkiStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
        const allCardIds = cardIds ?? await this.invoke<number[]>('findCards', { query: 'deck:*' });
        if (this.isDestroyed) return null;
        if (rebuildLeaseOwner) touchAnkiStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
        const cardData = await this.loadStatusIndexCardData(allCardIds, rebuildLeaseOwner, settingsKey);
        if (this.isDestroyed) return null;
        if (rebuildLeaseOwner) touchAnkiStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
        const noteIds = allCardIds.length
            ? await this.invokeOrDefault<number[]>('findNotes', { query: 'deck:*' }, [])
            : [];
        if (this.isDestroyed) return null;
        if (rebuildLeaseOwner) touchAnkiStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);

        if (canUseIndexedDb()) {
            const indexed = await this.rebuildStatusIndexToIndexedDb(
                noteIds,
                cardData,
                allCardIds.length,
                now,
                settings,
                settingsKey,
                rebuildLeaseOwner,
            ).catch(error => {
                log.warn('IndexedDB Anki status index rebuild failed; falling back to value storage', error);
                return null;
            });
            if (indexed || this.isDestroyed) return indexed;
        }

        const noteChunks = chunkArray(noteIds, ANKI_STATUS_INDEX_NOTE_CHUNK_SIZE);
        const notesByChunk: AnkiNoteInfo[][] = Array.from({ length: noteChunks.length }, () => []);
        await runLimited(noteChunks, ANKI_STATUS_INDEX_NOTE_CONCURRENCY, async (chunk, index) => {
            notesByChunk[index] = await this.invokeOrDefault<AnkiNoteInfo[]>('notesInfo', { notes: chunk }, []);
            if (rebuildLeaseOwner) touchAnkiStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
        });
        const notes = notesByChunk.flat();
        if (this.isDestroyed) return null;
        const entries: Record<string, AnkiStatusIndexEntry> = {};
        for (const { key, entry } of statusIndexEntriesForNotes(notes, cardData, settings)) entries[key] = entry;
        const index: AnkiStatusIndex = {
            version: ANKI_STATUS_INDEX_VERSION,
            settingsKey,
            syncedAt: now,
            checkedAt: now,
            cardCount: allCardIds.length,
            entryCount: Object.keys(entries).length,
            entries,
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
                const entries = statusIndexEntriesForNotes(notes, cardData, settings);
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
        if (this.isDestroyed) return { sets, cardsByNote: new Map() };
        if (rebuildLeaseOwner) touchAnkiStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
        const cards = await this.loadStatusIndexCards(allCardIds, sets, rebuildLeaseOwner, settingsKey);
        return {
            sets,
            cardsByNote: cardsByNoteId(cards),
        };
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

    private async loadStatusIndexCards(
        allCardIds: number[],
        cardSets: AnkiStatusIndexCardSets,
        rebuildLeaseOwner: string | undefined,
        settingsKey: string,
    ): Promise<AnkiCardInfo[]> {
        const cardChunks = chunkArray(unique(allCardIds).map(Number).filter(Number.isFinite), ANKI_STATUS_INDEX_NOTE_CHUNK_SIZE);
        const cardsByChunk: AnkiCardInfo[][] = Array.from({ length: cardChunks.length }, () => []);
        await runLimited(cardChunks, ANKI_STATUS_INDEX_NOTE_CONCURRENCY, async (chunk, index) => {
            const cards = await this.invokeOrDefault<AnkiCardInfo[]>('cardsInfo', { cards: chunk }, []);
            cardsByChunk[index] = Array.isArray(cards) ? cards.map(card => statusIndexCardWithSetState(card, cardSets)) : [];
            if (rebuildLeaseOwner) touchAnkiStatusIndexRebuildLease(rebuildLeaseOwner, settingsKey);
        });
        return cardsByChunk.flat();
    }

    private isLookupCoolingDown(): boolean {
        if (Date.now() >= this.unavailableUntil) return false;
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
        groups: Array<[string, { card: JPDBCard }]>,
        fallback: AnkiLookupResult,
    ): Promise<Map<string, AnkiLookupResult>> {
        if (this.isDestroyed) return new Map(groups.map(([cacheKey]) => [cacheKey, fallback]));
        const batch = this.findExistingCardsBatchUncached(groups);
        for (const [cacheKey] of groups) {
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

    private async findExistingCardsBatchUncached(groups: Array<[string, { card: JPDBCard }]>): Promise<Map<string, AnkiLookupResult>> {
        const empty = emptyAnkiLookupResult();
        if (this.isDestroyed) return new Map(groups.map(([cacheKey]) => [cacheKey, empty]));
        const statusNoteIdsByKey = await this.findStatusIndexNoteIdsByLookupKey(groups);
        if (this.isDestroyed) return new Map(groups.map(([cacheKey]) => [cacheKey, empty]));
        const noteIdsByKey = new Map([...statusNoteIdsByKey].map(([cacheKey, noteIds]) => [cacheKey, new Set(noteIds)]));
        const searchedNoteIds = await this.findCandidateNoteIdsByLookupKey(groups);
        for (const [cacheKey, noteIds] of searchedNoteIds) {
            const merged = noteIdsByKey.get(cacheKey) ?? new Set<number>();
            noteIds.forEach(noteId => merged.add(noteId));
            noteIdsByKey.set(cacheKey, merged);
        }
        if (this.isDestroyed) return new Map(groups.map(([cacheKey]) => [cacheKey, empty]));
        const allNoteIds = unique(Array.from(noteIdsByKey.values()).flatMap(noteIds => [...noteIds]));
        if (!allNoteIds.length) {
            return new Map(groups.map(([cacheKey]) => [cacheKey, empty]));
        }

        const notes = await this.invoke<AnkiNoteInfo[]>('notesInfo', { notes: allNoteIds });
        if (this.isDestroyed) return new Map(groups.map(([cacheKey]) => [cacheKey, empty]));
        const notesById = new Map(notes.map(note => [note.noteId, note]));
        const matchingNotesByKey = new Map<string, AnkiNoteInfo[]>();
        const matchingNotesById = new Map<number, AnkiNoteInfo>();
        for (const [cacheKey, { card }] of groups) {
            const candidateIds = noteIdsByKey.get(cacheKey) ?? new Set<number>();
            const trustedStatusIds = statusNoteIdsByKey.get(cacheKey) ?? new Set<number>();
            const matchingNotes = [...candidateIds]
                .map(noteId => notesById.get(noteId))
                .filter((note): note is AnkiNoteInfo => Boolean(note && (
                    trustedStatusIds.has(note.noteId) || noteLooksLikeCard(note, card, this.getSettings())
                )));
            matchingNotesByKey.set(cacheKey, matchingNotes);
            matchingNotes.forEach(note => matchingNotesById.set(note.noteId, note));
        }
        const cardsByNote = await this.loadCardsByNote([...matchingNotesById.values()]);
        if (this.isDestroyed) return new Map(groups.map(([cacheKey]) => [cacheKey, empty]));
        const results = new Map<string, AnkiLookupResult>();
        for (const [cacheKey] of groups) {
            const matchingNotes = matchingNotesByKey.get(cacheKey) ?? [];
            const existing = matchingNotes.map(note => ankiExistingNoteFromInfo(note, cardsByNote.get(note.noteId) ?? []));
            if (existing.length) await this.hydrateExistingNoteRenderedMedia(existing);
            results.set(cacheKey, existing.length ? {
                state: stateFromExistingNotes(existing),
                notes: existing,
                primary: pickPrimaryExistingNote(existing),
            } : empty);
        }
        return results;
    }

    private async findStatusIndexNoteIdsByLookupKey(groups: Array<[string, { card: JPDBCard }]>): Promise<Map<string, Set<number>>> {
        const noteIdsByKey = new Map(groups.map(([cacheKey]) => [cacheKey, new Set<number>()]));
        const statusIndex = await this.loadStatusIndex();
        if (!statusIndex || this.isDestroyed) return noteIdsByKey;
        const statusEntries = await this.loadStatusEntriesForCards(statusIndex, groups.map(([, { card }]) => card));
        if (this.isDestroyed) return noteIdsByKey;
        for (const [cacheKey, { card }] of groups) {
            const noteId = Number(this.lookupStatusIndex(statusIndex, card, statusEntries)?.primary?.noteId);
            if (Number.isFinite(noteId) && noteId > 0) noteIdsByKey.get(cacheKey)?.add(noteId);
        }
        return noteIdsByKey;
    }

    private async findCandidateNoteIdsByLookupKey(groups: Array<[string, { card: JPDBCard }]>): Promise<Map<string, Set<number>>> {
        const noteIdsByKey = new Map(groups.map(([cacheKey]) => [cacheKey, new Set<number>()]));
        if (this.isDestroyed) return noteIdsByKey;
        const keysByTerm = new Map<string, Set<string>>();
        for (const [cacheKey, { card }] of groups) {
            for (const term of lookupKeyTermsForCard(card)) {
                const keys = keysByTerm.get(term) ?? new Set<string>();
                keys.add(cacheKey);
                keysByTerm.set(term, keys);
            }
        }
        const terms = [...keysByTerm.keys()];
        const responses: Array<number[] | undefined> = [];
        for (const chunk of chunkArray(terms, ANKI_STATUS_ONLY_LOOKUP_TERM_CHUNK_SIZE)) {
            responses.push(...await this.invokeMulti<number[]>(chunk.map(term => ({
                action: 'findNotes',
                params: { query: quoteAnkiSearch(term) },
            }))));
        }
        if (this.isDestroyed) return noteIdsByKey;
        terms.forEach((term, index) => {
            const ids = responses[index] ?? [];
            for (const cacheKey of keysByTerm.get(term) ?? []) {
                const noteIds = noteIdsByKey.get(cacheKey);
                ids.forEach(id => noteIds?.add(id));
            }
        });
        return noteIdsByKey;
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

    async addCard(card: JPDBCard, sentence = '', options: AnkiCardContext = {}): Promise<number | null> {
        const settings = this.getSettings();
        if (!settings.ankiEnabled) {
            return null;
        }
        const note = this.buildAnkiNote(card, sentence, settings, options);

        try {
            return await this.addNoteViaConnect(note, card);
        } catch (error) {
            return this.addCardWithFallback(error, settings, note, card);
        }
    }

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
        this.logAnkiNoteAdd(card, preparedNote);
        const noteId = await this.invoke<number | null>('addNote', { note: preparedNote });
        log.info('Anki note added', { term: card.spelling, noteId });
        await this.refreshLookupCacheAfterAdd(card, noteId);
        if (noteId === null) throw new AnkiDuplicateNoteError(this.text('alreadyInAnki'));
        return noteId;
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
            const dirty: AnkiStatusIndex = { ...valid, syncedAt: 0, checkedAt: 0 };
            this.statusIndex = dirty;
            void saveAnkiStatusIndexDirtyMarker(dirty)
                .catch(error => {
                    log.warn('Anki status index dirty marker failed', { reason }, error);
                })
                .finally(() => {
                    if (!this.isDestroyed) this.queueStatusIndexRefresh();
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
                log.warn('Anki status index dirty marker failed', { reason }, error);
            });
    }

    private addCardWithFallback(error: unknown, settings: ReaderSettings, note: AnkiNote, card: JPDBCard): null {
        if (!canUseMobileAnkiHandoff(settings) || !isMobileHandoffRecoverableAddError(error)) throw error;
        log.warn('AnkiConnect add failed; trying mobile handoff', { term: card.spelling }, error);
        if (!openMobileAnkiHandoff(retargetAnkiNoteForMobileHandoff(note, settings))) throw new Error(this.text('ankiHandoffCancelled'));
        return null;
    }

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
        const response = await postJson<AnkiResponse<T>>(url, body, timeoutMs).catch(error => {
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
                log.warn('AnkiConnect multi action failed; entering cooldown', error);
                this.unavailableUntil = Date.now() + ANKI_BACKGROUND_UNAVAILABLE_COOLDOWN_MS;
                return actions.map(() => undefined);
            }
            log.warn('AnkiConnect multi action failed; falling back to individual actions', error);
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

function postJson<T>(url: string, body: string, timeoutMs = ANKI_CONNECT_REQUEST_TIMEOUT_MS): Promise<T> {
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
        return new Promise((resolve, reject) => {
            const handleLoad = (response: UserscriptHttpResponse) => {
                if (response.status >= 200 && response.status < 300) resolve(response.response as T);
                else reject(new Error(`AnkiConnect request failed (${response.status}).`));
            };
            const result = userscriptRequest({
                method: 'POST',
                url,
                headers: { 'Content-Type': 'application/json' },
                data: body,
                responseType: 'json',
                timeout: timeoutMs,
                onload: handleLoad,
                onerror: error => reject(error instanceof Error ? error : new Error('AnkiConnect request failed.')),
                ontimeout: () => reject(new Error('AnkiConnect timed out.')),
            });
            if (result && typeof (result as Promise<UserscriptHttpResponse>).then === 'function') {
                (result as Promise<UserscriptHttpResponse>).then(handleLoad, reject);
            }
        });
    }

    if (!canFetchAnkiConnect(url)) {
        return Promise.reject(new Error('AnkiConnect needs the userscript request bridge on content pages.'));
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
    }).then(async response => {
        if (!response.ok) throw new Error(`AnkiConnect request failed (${response.status}).`);
        return response.json() as Promise<T>;
    }).catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') throw new Error('AnkiConnect timed out.');
        throw error;
    }).finally(() => {
        window.clearTimeout(timeoutId);
    });
}


function resolvedAnkiDeckName(deckOverride: string | undefined, settings: ReaderSettings): string {
    return deckOverride?.trim() || settings.ankiDeck || 'よむ';
}

function resolvedAnkiModelName(settings: ReaderSettings): string {
    return settings.ankiModel || 'よむ Japanese';
}

function activeAnkiStatusIndexRebuildLease(settingsKey?: string, now = Date.now()): AnkiStatusIndexRebuildLease | null {
    const lease = gmStorageGetSync<unknown>(ANKI_STATUS_INDEX_REBUILD_LEASE_STORAGE_KEY, null);
    if (!isAnkiStatusIndexRebuildLease(lease)) return null;
    if (lease.expiresAt <= now) {
        gmStorageDeleteSync(ANKI_STATUS_INDEX_REBUILD_LEASE_STORAGE_KEY);
        return null;
    }
    if (settingsKey && lease.settingsKey !== settingsKey) return null;
    return lease;
}

function claimAnkiStatusIndexRebuildLease(settingsKey: string, now = Date.now()): string | null {
    if (activeAnkiStatusIndexRebuildLease(undefined, now)) return null;
    const owner = createAnkiStatusIndexRebuildLeaseOwner();
    const lease: AnkiStatusIndexRebuildLease = {
        owner,
        settingsKey,
        startedAt: now,
        expiresAt: now + ANKI_STATUS_INDEX_REBUILD_LEASE_TTL_MS,
    };
    gmStorageSetSync(ANKI_STATUS_INDEX_REBUILD_LEASE_STORAGE_KEY, lease);
    return activeAnkiStatusIndexRebuildLease(undefined, now)?.owner === owner ? owner : null;
}

function touchAnkiStatusIndexRebuildLease(owner: string, settingsKey: string, now = Date.now()): void {
    const lease = activeAnkiStatusIndexRebuildLease(undefined, now);
    if (!lease || lease.owner !== owner) return;
    gmStorageSetSync(ANKI_STATUS_INDEX_REBUILD_LEASE_STORAGE_KEY, {
        ...lease,
        settingsKey,
        expiresAt: now + ANKI_STATUS_INDEX_REBUILD_LEASE_TTL_MS,
    });
}

function releaseAnkiStatusIndexRebuildLease(owner: string): void {
    const lease = gmStorageGetSync<unknown>(ANKI_STATUS_INDEX_REBUILD_LEASE_STORAGE_KEY, null);
    if (isAnkiStatusIndexRebuildLease(lease) && lease.owner === owner) {
        gmStorageDeleteSync(ANKI_STATUS_INDEX_REBUILD_LEASE_STORAGE_KEY);
    }
}

function isAnkiStatusIndexRebuildLease(value: unknown): value is AnkiStatusIndexRebuildLease {
    if (!value || typeof value !== 'object') return false;
    const lease = value as Partial<AnkiStatusIndexRebuildLease>;
    return typeof lease.owner === 'string'
        && typeof lease.settingsKey === 'string'
        && typeof lease.startedAt === 'number'
        && typeof lease.expiresAt === 'number';
}

function createAnkiStatusIndexRebuildLeaseOwner(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function canFetchAnkiConnect(url: string): boolean {
    return canFetchAnkiConnectFrom(url, safeLocationHref());
}

async function saveAnkiStatusIndex(index: AnkiStatusIndex): Promise<void> {
    try {
        await saveAnkiStatusIndexToIndexedDb(index);
        await gmStorageSet(ANKI_STATUS_INDEX_STORAGE_KEY, ankiStatusIndexMeta(index));
    } catch (error) {
        log.warn('IndexedDB Anki status index save failed; falling back to browser value storage', error);
        await gmStorageSet(ANKI_STATUS_INDEX_STORAGE_KEY, { ...index, entryStore: undefined });
    }
}

async function saveAnkiStatusIndexCheckedAt(index: AnkiStatusIndex): Promise<void> {
    if (index.entryStore !== 'indexeddb') {
        await saveAnkiStatusIndex(index);
        return;
    }
    const meta = ankiStatusIndexMeta(index);
    try {
        await putStoredAnkiStatusIndexMeta(meta);
        await gmStorageSet(ANKI_STATUS_INDEX_STORAGE_KEY, meta);
    } catch (error) {
        log.warn('IndexedDB Anki status index metadata update failed', error);
        await gmStorageSet(ANKI_STATUS_INDEX_STORAGE_KEY, meta);
    }
}

async function saveAnkiStatusIndexDirtyMarker(index: AnkiStatusIndex): Promise<void> {
    const dirty: AnkiStatusIndex = { ...index, syncedAt: 0, checkedAt: 0 };
    if (dirty.entryStore !== 'indexeddb') {
        gmStorageSetSync(ANKI_STATUS_INDEX_STORAGE_KEY, { ...dirty, entryStore: undefined });
        return;
    }
    const meta = ankiStatusIndexMeta(dirty);
    gmStorageSetSync(ANKI_STATUS_INDEX_STORAGE_KEY, meta);
    await putStoredAnkiStatusIndexMeta(meta);
}

async function loadAnkiStatusIndexFromIndexedDb(): Promise<AnkiStatusIndex | null> {
    if (!canUseIndexedDb()) return null;
    const db = await openAnkiStatusIndexDb();
    try {
        const meta = await idbRequest<StoredAnkiStatusIndexMeta | undefined>(
            db.transaction(ANKI_STATUS_INDEX_META_STORE, 'readonly')
                .objectStore(ANKI_STATUS_INDEX_META_STORE)
                .get('current'),
        );
        if (!meta) return null;
        return {
            version: meta.version,
            settingsKey: meta.settingsKey,
            syncedAt: meta.syncedAt,
            checkedAt: meta.checkedAt,
            cardCount: meta.cardCount,
            entryCount: meta.entryCount,
            entryStore: 'indexeddb',
            entries: {},
        };
    } finally {
        db.close();
    }
}

async function loadAnkiStatusIndexEntriesFromIndexedDb(keys: string[]): Promise<Map<string, AnkiStatusIndexEntry>> {
    if (!canUseIndexedDb()) return new Map();
    const db = await openAnkiStatusIndexDb();
    try {
        const records: Array<readonly [string, StoredAnkiStatusIndexEntry | undefined]> = [];
        for (const chunk of chunkArray(unique(keys), ANKI_STATUS_INDEX_ENTRY_READ_CHUNK_SIZE)) {
            const tx = db.transaction(ANKI_STATUS_INDEX_ENTRY_STORE, 'readonly');
            const store = tx.objectStore(ANKI_STATUS_INDEX_ENTRY_STORE);
            const chunkRecords = await Promise.all(chunk.map(key => (
                idbRequest<StoredAnkiStatusIndexEntry | undefined>(store.get(key)).then(record => [key, record] as const)
            )));
            await idbTransactionDone(tx);
            records.push(...chunkRecords);
        }
        return new Map(records
            .filter((record): record is readonly [string, StoredAnkiStatusIndexEntry] => Boolean(record[1]))
            .map(([key, record]) => [key, record.entry]));
    } finally {
        db.close();
    }
}

async function saveAnkiStatusIndexToIndexedDb(index: AnkiStatusIndex): Promise<void> {
    if (!canUseIndexedDb()) throw new Error('IndexedDB is unavailable.');
    const db = await openAnkiStatusIndexDb();
    try {
        await clearAnkiStatusIndexStores(db);
        const entries = Object.entries(index.entries).map(([key, entry]) => ({ key, entry }));
        for (const chunk of chunkArray(entries, ANKI_STATUS_INDEX_ENTRY_WRITE_CHUNK_SIZE)) {
            await putAnkiStatusIndexEntries(db, chunk);
        }
        await putAnkiStatusIndexMeta(db, ankiStatusIndexMeta(index));
    } finally {
        db.close();
    }
}

function ankiStatusIndexMeta(index: AnkiStatusIndex): StoredAnkiStatusIndexMeta {
    return {
        id: 'current',
        version: index.version,
        settingsKey: index.settingsKey,
        syncedAt: index.syncedAt,
        checkedAt: index.checkedAt,
        cardCount: index.cardCount,
        entryCount: index.entryCount ?? Object.keys(index.entries).length,
        entryStore: 'indexeddb',
        entries: {},
    };
}

function clearAnkiStatusIndexStores(db: IDBDatabase): Promise<void> {
    const tx = db.transaction([ANKI_STATUS_INDEX_META_STORE, ANKI_STATUS_INDEX_ENTRY_STORE], 'readwrite');
    tx.objectStore(ANKI_STATUS_INDEX_META_STORE).clear();
    tx.objectStore(ANKI_STATUS_INDEX_ENTRY_STORE).clear();
    return idbTransactionDone(tx);
}

function putAnkiStatusIndexMeta(db: IDBDatabase, meta: StoredAnkiStatusIndexMeta): Promise<void> {
    const tx = db.transaction(ANKI_STATUS_INDEX_META_STORE, 'readwrite');
    tx.objectStore(ANKI_STATUS_INDEX_META_STORE).put(meta);
    return idbTransactionDone(tx);
}

async function putStoredAnkiStatusIndexMeta(meta: StoredAnkiStatusIndexMeta): Promise<void> {
    if (!canUseIndexedDb()) throw new Error('IndexedDB is unavailable.');
    const db = await openAnkiStatusIndexDb();
    try {
        await putAnkiStatusIndexMeta(db, meta);
    } finally {
        db.close();
    }
}

function putAnkiStatusIndexEntries(db: IDBDatabase, entries: StoredAnkiStatusIndexEntry[]): Promise<void> {
    const tx = db.transaction(ANKI_STATUS_INDEX_ENTRY_STORE, 'readwrite');
    const store = tx.objectStore(ANKI_STATUS_INDEX_ENTRY_STORE);
    entries.forEach(entry => store.put(entry));
    return idbTransactionDone(tx);
}

function putBestAnkiStatusIndexEntries(db: IDBDatabase, entries: StoredAnkiStatusIndexEntry[]): Promise<void> {
    if (!entries.length) return Promise.resolve();
    const tx = db.transaction(ANKI_STATUS_INDEX_ENTRY_STORE, 'readwrite');
    const store = tx.objectStore(ANKI_STATUS_INDEX_ENTRY_STORE);
    entries.forEach(candidate => {
        const request = store.get(candidate.key);
        request.onsuccess = () => {
            const current = (request.result as StoredAnkiStatusIndexEntry | undefined)?.entry;
            if (!current || shouldReplaceAnkiStatusIndexEntry(current, candidate.entry)) store.put(candidate);
        };
    });
    return idbTransactionDone(tx);
}

function countAnkiStatusIndexEntries(db: IDBDatabase): Promise<number> {
    const tx = db.transaction(ANKI_STATUS_INDEX_ENTRY_STORE, 'readonly');
    const done = idbTransactionDone(tx);
    const count = idbRequest<number>(tx.objectStore(ANKI_STATUS_INDEX_ENTRY_STORE).count());
    return count.then(async value => {
        await done;
        return value;
    });
}

function openAnkiStatusIndexDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(ANKI_STATUS_INDEX_DB_NAME, ANKI_STATUS_INDEX_DB_VERSION);
        request.onerror = () => reject(request.error ?? new Error('Could not open Anki status index database.'));
        request.onblocked = () => reject(new Error('Anki status index database upgrade was blocked.'));
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(ANKI_STATUS_INDEX_META_STORE)) {
                db.createObjectStore(ANKI_STATUS_INDEX_META_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(ANKI_STATUS_INDEX_ENTRY_STORE)) {
                db.createObjectStore(ANKI_STATUS_INDEX_ENTRY_STORE, { keyPath: 'key' });
            }
        };
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => db.close();
            resolve(db);
        };
    });
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
    });
}

function idbTransactionDone(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted.'));
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed.'));
    });
}

function canUseIndexedDb(): boolean {
    return typeof indexedDB !== 'undefined';
}

function isAnkiConnectAvailabilityError(error: unknown): boolean {
    if (error instanceof Error && error.cause && error.cause !== error) {
        return isAnkiConnectAvailabilityError(error.cause);
    }
    if (!(error instanceof Error)) return false;
    return /timed out|failed to fetch|networkerror|request bridge/i.test(error.message);
}

function isMobileHandoffRecoverableAddError(error: unknown): boolean {
    if (isAnkiConnectAvailabilityError(error)) return true;
    if (error instanceof Error && error.cause && error.cause !== error) {
        return isMobileHandoffRecoverableAddError(error.cause);
    }
    if (!(error instanceof Error)) return false;
    return /unsupported action|action.*unsupported|unknown action|invalid action|not supported/i.test(error.message);
}

export function canFetchAnkiConnectFrom(url: string, currentHref: string): boolean {
    const current = readAnkiUrl(currentHref);
    if (!current) return false;
    const target = readAnkiUrl(url, current.href);
    if (!target) return false;
    if (target.origin === current.origin) return true;
    if (isLoopbackHostname(current.hostname)) return true;
    // The hosted app cannot use AnkiConnect's default localhost-only CORS path.
    // Keep loopback AnkiConnect traffic on the userscript request bridge, while
    // still allowing explicitly configured non-local endpoints such as Tailnet hosts.
    return isYomuHostedAppUrl(current.href) && isHttpUrl(target) && !isLoopbackHostname(target.hostname);
}

export function needsHostedAnkiConnectSetupHint(url: string, currentHref = safeLocationHref()): boolean {
    if (getUserscriptHttpRequest()) return false;
    const current = readAnkiUrl(currentHref);
    if (!current || current.origin !== GITHUB_PAGES_ORIGIN || !isYomuHostedAppUrl(current.href)) return false;
    const target = readAnkiUrl(url, current.href);
    return Boolean(target && target.origin !== current.origin && isHttpUrl(target));
}

function readAnkiUrl(value: string, base?: string): URL | null {
    try {
        return new URL(value, base);
    } catch {
        return null;
    }
}

function isHttpUrl(url: URL): boolean {
    return url.protocol === 'http:' || url.protocol === 'https:';
}

function isLoopbackHostname(hostname: string): boolean {
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname);
}

export function buildYomuAnkiFields(card: JPDBCard, sentence = '', context: AnkiCardContext = {}): Record<string, string> {
    const fieldContext = ankiFieldContext(context);
    const jpdbUrl = jpdbVocabularyUrl(card);
    return {
        Expression: escapeHtml(card.spelling),
        Reading: renderCardReading(card),
        Meaning: renderJpdbMeanings(card),
        Sentence: renderSentence(sentence, card.spelling),
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

export function buildYomuAnkiPreviewFields(card: JPDBCard, sentence: string, settings: ReaderSettings, context: AnkiCardContext = {}): Record<string, string> {
    const yomuFields = buildYomuAnkiFields(card, sentence, {
        ...context,
        interfaceLanguage: settings.interfaceLanguage,
    });
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

function retargetAnkiNoteForMobileHandoff(note: AnkiNote, settings: ReaderSettings): AnkiNote {
    const mapping = settings.ankiFieldMappings?.[note.modelName];
    if (!mapping || !Object.values(mapping).some(value => value?.trim())) return note;
    const audioField = mobileMappedFieldName(mapping, 'audio');
    const imageField = mobileMappedFieldName(mapping, 'image');
    return {
        ...note,
        fields: mobileHandoffFieldsWithMappings(note.fields, mapping),
        ...(audioField && note.audio?.length ? { audio: retargetMediaFiles(note.audio, audioField) } : {}),
        ...(imageField && note.picture?.length ? { picture: retargetMediaFiles(note.picture, imageField) } : {}),
    };
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

function fieldNameForRole(fieldNames: string[], role: AnkiFieldRole, mapping?: AnkiFieldMapping): string {
    const mapped = mappedFieldName(fieldNames, mapping, role);
    if (mapped) return mapped;
    return suggestAnkiField(role, fieldNames, new Set()).fieldName ?? '';
}

function ankiFieldMappingForModel(settings: ReaderSettings, modelName: string, fieldNames: string[]): AnkiFieldMapping | undefined {
    const mapping = settings.ankiFieldMappings?.[modelName];
    if (!mapping) return undefined;
    const normalized: AnkiFieldMapping = {};
    for (const role of ANKI_FIELD_ROLES) {
        const fieldName = mappedFieldName(fieldNames, mapping, role);
        if (fieldName) normalized[role] = fieldName;
    }
    return Object.keys(normalized).length ? normalized : undefined;
}

function mappedFieldName(fieldNames: string[], mapping: AnkiFieldMapping | undefined, role: AnkiFieldRole): string {
    const fieldName = mapping?.[role]?.trim();
    if (!fieldName) return '';
    const exact = fieldNames.find(candidate => candidate === fieldName);
    if (exact) return exact;
    const normalizedFieldName = normalizeAnkiFieldName(fieldName);
    return fieldNames.find(candidate => normalizeAnkiFieldName(candidate) === normalizedFieldName) ?? '';
}

function ankiFieldMappingsSettingsKey(mappings: AnkiFieldMappings | undefined): Record<string, AnkiFieldMapping> {
    const normalized: Record<string, AnkiFieldMapping> = {};
    for (const modelName of Object.keys(mappings ?? {}).sort()) {
        const mapping = mappings?.[modelName];
        if (!mapping) continue;
        const modelMapping: AnkiFieldMapping = {};
        for (const role of ANKI_FIELD_ROLES) {
            const fieldName = mapping[role]?.trim();
            if (fieldName) modelMapping[role] = fieldName;
        }
        if (Object.keys(modelMapping).length) normalized[modelName] = modelMapping;
    }
    return normalized;
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
        const value = yomuValueForExistingField(fieldName, yomuFields, mapping);
        if (!value) continue;
        if (!canOwnYomuFields && existingFields[fieldName]) continue;
        fields[fieldName] = value;
    }
    return fields;
}

function yomuValueForExistingField(fieldName: string, yomuFields: Record<string, string>, mapping?: AnkiFieldMapping): string {
    const mappedRole = mappedRoleForField(fieldName, mapping);
    if (mappedRole) return yomuFields[yomuFieldForRole(mappedRole)] ?? '';
    return yomuFields[fieldName] ?? yomuFields[yomuFieldAlias(fieldName)] ?? '';
}

function mappedRoleForField(fieldName: string, mapping?: AnkiFieldMapping): AnkiFieldRole | null {
    if (!mapping) return null;
    const normalized = normalizeAnkiFieldName(fieldName);
    for (const role of ANKI_FIELD_ROLES) {
        const mapped = mapping[role];
        if (mapped && normalizeAnkiFieldName(mapped) === normalized) return role;
    }
    return null;
}

function yomuFieldForRole(role: AnkiFieldRole): string {
    return {
        expression: 'Expression',
        reading: 'Reading',
        meaning: 'Meaning',
        sentence: 'Sentence',
        audio: 'Audio',
        image: 'Image',
    }[role];
}

function yomuFieldAlias(fieldName: string): string {
    const normalized = fieldName.replace(/[_\s-]+/g, '').toLowerCase();
    return YOMU_FIELD_ALIASES[normalized] ?? '';
}

const YOMU_FIELD_ALIASES: Record<string, string> = {
    baseform: 'Expression',
    dictionaryform: 'Expression',
    expressiontext: 'Expression',
    headword: 'Expression',
    headwordkanji: 'Expression',
    jlabkanji: 'Expression',
    japaneseword: 'Expression',
    japaneseexpression: 'Expression',
    lemma: 'Expression',
    searchterm: 'Expression',
    targetword: 'Expression',
    termtext: 'Expression',
    termkanji: 'Expression',
    word: 'Expression',
    wordexpression: 'Expression',
    wordkanji: 'Expression',
    vocab: 'Expression',
    vocabkanji: 'Expression',
    vocabulary: 'Expression',
    vocabularyexpression: 'Expression',
    vocabularykanji: 'Expression',
    term: 'Expression',
    front: 'Expression',
    expressionreading: 'Reading',
    furigana: 'Reading',
    furiganareading: 'Reading',
    hiragana: 'Reading',
    jlabhiragana: 'Reading',
    japanesereading: 'Reading',
    kanareading: 'Reading',
    readings: 'Reading',
    kana: 'Reading',
    ruby: 'Reading',
    termkana: 'Reading',
    termreading: 'Reading',
    vocabfurigana: 'Reading',
    vocabkana: 'Reading',
    vocabreading: 'Reading',
    vocabularyfurigana: 'Reading',
    wordkana: 'Reading',
    vocabularyreading: 'Reading',
    wordreading: 'Reading',
    yomi: 'Reading',
    def: 'Meaning',
    definition1: 'Meaning',
    definition: 'Meaning',
    definitionenglish: 'Meaning',
    definitions: 'Meaning',
    defs: 'Meaning',
    english: 'Meaning',
    englishdefinition: 'Meaning',
    englishmeaning: 'Meaning',
    gloss: 'Meaning',
    glosses: 'Meaning',
    glossary: 'Meaning',
    jlabdictionarylookup: 'Meaning',
    jlabremarks: 'Meaning',
    jlabtranslation: 'Meaning',
    meaningenglish: 'Meaning',
    meanings: 'Meaning',
    otherback: 'Meaning',
    remarksback: 'Meaning',
    sense: 'Meaning',
    termmeaning: 'Meaning',
    translation: 'Meaning',
    translation1: 'Meaning',
    vocabdef: 'Meaning',
    vocabdefinition: 'Meaning',
    vocabularyenglish: 'Meaning',
    vocabularymeaning: 'Meaning',
    wordmeaning: 'Meaning',
    back: 'Meaning',
    example: 'Sentence',
    examplesentence: 'Sentence',
    examplesentencetext: 'Sentence',
    contextsentence: 'Sentence',
    contexttext: 'Sentence',
    sentenceexpression: 'Sentence',
    sentencefurigana: 'Sentence',
    sentencekanji: 'Sentence',
    sentencetext: 'Sentence',
    sentkanji: 'Sentence',
    japanesesentence: 'Sentence',
    miningsentence: 'Sentence',
    sourcesentence: 'Sentence',
    sourcetext: 'Sentence',
    sourceurl: 'Url',
    url: 'Url',
    pos: 'PartOfSpeech',
    partofspeech: 'PartOfSpeech',
    pitchaccent: 'Pitch',
    dictionary: 'DictionaryDefinitions',
    dictionaries: 'DictionaryDefinitions',
    dictionarydefinition: 'DictionaryDefinitions',
    dictionarydefinitions: 'DictionaryDefinitions',
};

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
    const fieldName = fieldNameForRole(fieldNames, 'audio', mapping) || mediaFieldName(fieldNames, [
        'Audio',
        'audio',
        'Word Audio',
        'WordAudio',
        'Vocabulary Audio',
        'VocabularyAudio',
        'Vocab Audio',
        'VocabAudio',
        'Expression Audio',
        'ExpressionAudio',
        'Term Audio',
        'TermAudio',
        'Sentence Audio',
        'SentenceAudio',
        'SentAudio',
        'Sentence Sound',
        'SentenceSound',
        'Example Audio',
        'ExampleAudio',
        'Context Audio',
        'ContextAudio',
        'Sound',
        'sound',
        'Voice',
        'Pronunciation',
        'PronunciationAudio',
        'Pronunciation Audio',
    ]);
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
    const fieldName = fieldNameForRole(fieldNames, 'image', mapping) || mediaFieldName(fieldNames, [
        'Image',
        'image',
        'Picture',
        'picture',
        'Screenshot',
        'screenshot',
        'Snapshot',
        'snapshot',
        'Word Image',
        'WordImage',
        'Vocabulary Image',
        'VocabularyImage',
        'Vocab Image',
        'VocabImage',
        'Sentence Image',
        'SentenceImage',
        'SentencePicture',
        'Sentence Screenshot',
        'SentenceScreenshot',
        'Example Image',
        'ExampleImage',
        'Context Image',
        'ContextImage',
        'Source Image',
        'SourceImage',
        'Term Image',
        'TermImage',
        'Frame',
        'frame',
        'Photo',
        'photo',
        'Still',
        'still',
        'Image File',
        'ImageFile',
    ]);
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

const ANKI_MEDIA_MIME_TYPES: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'jfif': 'image/jpeg',
    'pjpeg': 'image/jpeg',
    'pjp': 'image/jpeg',
    'webp': 'image/webp',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'avif': 'image/avif',
    'svg': 'image/svg+xml',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'oga': 'audio/ogg',
    'opus': 'audio/ogg',
    'webm': 'audio/webm',
    'm4a': 'audio/mp4',
    'mp4': 'audio/mp4',
    'aac': 'audio/mp4',
    'flac': 'audio/flac',
};

function ankiMediaMimeType(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase() ?? '';
    return ANKI_MEDIA_MIME_TYPES[extension] ?? 'audio/mpeg';
}

function safeAnkiMediaName(card: JPDBCard): string {
    return card.spelling.replace(/[^\p{L}\p{N}-]+/gu, '_').slice(0, 24) || 'yomu';
}

function isMobileAnkiHandoffEnvironment(): boolean {
    const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    return /iPad|iPhone|iPod/i.test(userAgent)
        || isIpadOSDesktopUserAgent()
        || (/Android/i.test(userAgent) && /Chrome|Firefox|Firefox\/|FxiOS|EdgA/i.test(userAgent));
}

export function canUseMobileAnkiHandoff(settings: ReaderSettings): boolean {
    return settings.ankiMobileHandoff && isMobileAnkiHandoffEnvironment();
}

function isIpadOSDesktopUserAgent(): boolean {
    if (typeof navigator === 'undefined') return false;
    const maxTouchPoints = navigator.maxTouchPoints ?? 0;
    const platform = navigator.platform ?? '';
    return maxTouchPoints > 1
        && /Mac/i.test(platform)
        && /Macintosh/i.test(navigator.userAgent ?? '');
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
    return `Open ${appName} to add "${title}"? Mobile handoff creates a new note only; status sync and updates need AnkiConnect.`;
}

function iosAnkiMobileUrl(note: AnkiNote): string {
    const params = new URLSearchParams();
    params.set('type', note.modelName);
    params.set('deck', note.deckName);
    if (note.tags?.length) params.set('tags', note.tags.join(' '));
    Object.entries(iosAnkiMobileFields(note)).forEach(([field, value]) => {
        const handoffValue = iosAnkiMobileFieldValue(field, value);
        if (handoffValue !== null) params.set(`fld${field}`, handoffValue);
    });
    return `anki://x-callback-url/addnote?${params.toString()}`;
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

function quoteAnkiSearch(term: string): string {
    return `"${term.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function unique<T>(items: T[]): T[] {
    return [...new Set(items)];
}

function chunkArray<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
    return chunks;
}

function flattenNoteFields(fields: AnkiNoteInfo['fields']): Record<string, string> {
    const out: Record<string, string> = {};
    Object.entries(fields ?? {}).forEach(([name, value]) => {
        out[name] = stripHtml(String(value?.value ?? ''));
    });
    return out;
}

function emptyAnkiLookupResult(): AnkiLookupResult {
    return { state: 'not-in-deck', notes: [], primary: null };
}

function untrustedAnkiLookupResult(): AnkiLookupResult {
    return { ...emptyAnkiLookupResult(), trusted: false };
}

function normalizeStatusIndexValue(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function statusIndexKey(value: string): string {
    return normalizeStatusIndexValue(value).toLocaleLowerCase();
}

function statusIndexEntriesForNotes(notes: AnkiNoteInfo[], cardData: AnkiStatusIndexCardData, settings: ReaderSettings): StoredAnkiStatusIndexEntry[] {
    const entries = new Map<string, AnkiStatusIndexEntry>();
    for (const note of notes) {
        const existing = ankiExistingNoteFromStatusData(note, cardData);
        const candidate = statusIndexEntryFromExisting(existing);
        for (const key of statusIndexKeysForNote(note, settings)) {
            const current = entries.get(key);
            if (!current || shouldReplaceAnkiStatusIndexEntry(current, candidate)) entries.set(key, candidate);
        }
    }
    return [...entries].map(([key, entry]) => ({ key, entry }));
}

function statusIndexKeysForNote(note: AnkiNoteInfo, settings: ReaderSettings): string[] {
    const fields = flattenNoteFields(note.fields);
    const mapping = ankiFieldMappingForModel(settings, note.modelName, Object.keys(fields));
    const keys = new Set<string>();
    for (const value of statusIndexFieldValues(fields, mapping)) {
        if (value.length <= 80) keys.add(statusIndexKey(value));
        value
            .split(/[\s,;；、。・/／|｜()[\]（）「」『』【】<>＜＞]+/u)
            .map(statusIndexKey)
            .filter(value => value.length >= 2)
            .forEach(value => keys.add(value));
    }
    return [...keys].filter(Boolean);
}

function statusIndexFieldValues(fields: Record<string, string>, mapping?: AnkiFieldMapping): string[] {
    const expression = firstNoteExpressionValue(fields, mapping);
    const reading = mappedNoteField(fields, mapping, 'reading') || firstNoteReading(fields);
    const preferred = (expression ? [expression] : [reading])
        .map(value => value.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    if (preferred.length) return unique(preferred);
    return noteFieldValues(fields).filter(value => value.length <= 80 && /[\u3040-\u30ff\u3400-\u9fff]/.test(value));
}

function statusIndexKeysForCard(card: JPDBCard): string[] {
    return unique(noteCardExpressionTargets(card).map(statusIndexKey));
}

function statusIndexEntryForCard(
    index: AnkiStatusIndex,
    card: JPDBCard,
    entries?: Map<string, AnkiStatusIndexEntry> | null,
): AnkiStatusIndexEntry | null {
    return statusIndexKeysForCard(card)
        .map(key => entries?.get(key) ?? index.entries[key])
        .find(Boolean) ?? null;
}

function statusIndexEntryFromExisting(note: AnkiExistingNote): AnkiStatusIndexEntry {
    return {
        state: note.state,
        noteId: note.noteId,
        primaryCardId: note.primaryCardId,
        deckNames: note.deckNames,
        reps: note.reps,
        lapses: note.lapses,
        modelName: note.modelName,
    };
}

function statusIndexCardWithSetState(card: AnkiCardInfo, cardSets: AnkiStatusIndexCardSets): AnkiCardInfo {
    const cardId = Number(card.cardId);
    if (!Number.isFinite(cardId)) return card;
    return card.queue === 2 ? { ...card, isDue: cardSets.due.has(cardId) } : card;
}

function ankiExistingNoteFromStatusData(note: AnkiNoteInfo, cardData: AnkiStatusIndexCardData): AnkiExistingNote {
    const noteCards = cardData.cardsByNote.get(note.noteId) ?? [];
    if (noteCards.length) return ankiExistingNoteFromInfo(note, noteCards);
    return ankiExistingNoteFromStatusSets(note, cardData.sets);
}

function ankiExistingNoteFromStatusSets(note: AnkiNoteInfo, cardSets: AnkiStatusIndexCardSets): AnkiExistingNote {
    const cardIds = (note.cards ?? []).map(Number).filter(Number.isFinite);
    const primaryCardId = pickPrimaryCardIdFromStatusSets(cardIds, cardSets);
    const state = stateFromStatusIndexCardIds(cardIds, cardSets);
    return {
        noteId: note.noteId,
        modelName: note.modelName,
        deckNames: [],
        cardIds,
        primaryCardId,
        state,
        fields: flattenNoteFields(note.fields),
        tags: note.tags ?? [],
        reps: 0,
        lapses: 0,
    };
}

function stateFromStatusIndexCardIds(cardIds: number[], cardSets: AnkiStatusIndexCardSets): CardState {
    if (!cardIds.length) return 'known';
    if (cardIds.some(cardId => cardSets.due.has(cardId))) return 'due';
    if (cardIds.some(cardId => cardSets.learning.has(cardId))) return 'learning';
    if (cardIds.some(cardId => cardSets.new.has(cardId))) return 'new';
    if (cardIds.every(cardId => cardSets.suspended.has(cardId))) return 'suspended';
    return 'known';
}

function pickPrimaryCardIdFromStatusSets(cardIds: number[], cardSets: AnkiStatusIndexCardSets): number | null {
    const orderedSets = [cardSets.due, cardSets.learning, cardSets.new, cardSets.all, cardSets.suspended];
    for (const set of orderedSets) {
        const match = cardIds.find(cardId => set.has(cardId));
        if (match !== undefined) return match;
    }
    return cardIds[0] ?? null;
}

function ankiStatusIndexStateRank(state: CardState): number {
    const order: CardState[] = ['failed', 'due', 'learning', 'new', 'known', 'suspended', 'in-deck', 'not-in-deck'];
    const index = order.indexOf(state);
    return index < 0 ? order.length : index;
}

function shouldReplaceAnkiStatusIndexEntry(current: AnkiStatusIndexEntry, candidate: AnkiStatusIndexEntry): boolean {
    return ankiStatusIndexStateRank(candidate.state) < ankiStatusIndexStateRank(current.state);
}

function cardsByNoteId(cards: AnkiCardInfo[]): Map<number, AnkiCardInfo[]> {
    const cardsByNote = new Map<number, AnkiCardInfo[]>();
    for (const cardInfo of cards) addCardInfoByNoteId(cardsByNote, cardInfo);
    return cardsByNote;
}

function addCardInfoByNoteId(cardsByNote: Map<number, AnkiCardInfo[]>, cardInfo: AnkiCardInfo): void {
    const noteId = Number(cardInfo.note);
    if (!Number.isFinite(noteId)) return;
    const list = cardsByNote.get(noteId) ?? [];
    list.push(cardInfo);
    cardsByNote.set(noteId, list);
}

function ankiExistingNoteFromInfo(note: AnkiNoteInfo, noteCards: AnkiCardInfo[]): AnkiExistingNote {
    const state = stateFromAnkiCards(noteCards);
    return {
        noteId: note.noteId,
        modelName: note.modelName,
        deckNames: ankiNoteDeckNames(noteCards),
        cardIds: note.cards ?? [],
        primaryCardId: ankiNotePrimaryCardId(note, noteCards),
        state,
        fields: flattenNoteFields(note.fields),
        renderedCards: ankiRenderedCards(noteCards),
        tags: note.tags ?? [],
        ...ankiNoteReviewMetrics(noteCards),
    };
}

function ankiNoteHasRenderableDetails(note: AnkiExistingNote): boolean {
    if (note.renderedCards?.some(card => card.question.trim() || card.answer.trim())) return true;
    return Object.values(note.fields).some(value => value.trim());
}

function ankiRenderedCards(noteCards: AnkiCardInfo[]): AnkiRenderedCard[] {
    return noteCards
        .filter(card => card.question || card.answer)
        .map(card => ({
            cardId: card.cardId,
            deckName: card.deckName,
            question: String(card.question ?? ''),
            answer: String(card.answer ?? ''),
        }));
}

function ankiRenderedCardMediaFilenames(card: AnkiRenderedCard): string[] {
    return unique([card.question, card.answer]
        .flatMap(ankiCardHtmlMediaFilenames)
        .filter(shouldHydrateRenderedAnkiMedia));
}

function ankiCardHtmlMediaFilenames(html: string): string[] {
    return Array.from(html.matchAll(/\b(?:src|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi), match =>
        ankiMediaFilenameFromCardUrl(match[1] ?? match[2] ?? match[3] ?? ''),
    ).filter((filename): filename is string => Boolean(filename));
}

function shouldHydrateRenderedAnkiMedia(filename: string): boolean {
    return ankiMediaMimeType(filename).startsWith('image/');
}

export function ankiMediaFilenameFromCardUrl(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('/') || trimmed.startsWith('\\')) return null;
    if (/^(?:https?|data|blob|file|mailto|tel|javascript|vbscript):/i.test(trimmed)) return null;
    const filename = trimmed.split(/[?#]/, 1)[0]?.replace(/^\.\//, '') ?? '';
    if (!filename || filename.includes('..') || /^[a-z][a-z0-9+.-]*:/i.test(filename)) return null;
    try {
        return decodeURIComponent(filename);
    } catch {
        return filename;
    }
}

function ankiNoteDeckNames(noteCards: AnkiCardInfo[]): string[] {
    return unique(noteCards.map(item => item.deckName).filter(Boolean));
}

function ankiNotePrimaryCardId(note: AnkiNoteInfo, noteCards: AnkiCardInfo[]): number | null {
    return pickPrimaryCard(noteCards)?.cardId ?? note.cards?.[0] ?? null;
}

function ankiNoteReviewMetrics(noteCards: AnkiCardInfo[]): Pick<AnkiExistingNote, 'reps' | 'lapses'> {
    return {
        reps: sumAnkiCardMetric(noteCards, 'reps'),
        lapses: sumAnkiCardMetric(noteCards, 'lapses'),
    };
}

function sumAnkiCardMetric(cards: AnkiCardInfo[], metric: 'reps' | 'lapses'): number {
    return cards.reduce((sum, item) => sum + Number(item[metric] || 0), 0);
}

function noteLooksLikeCard(note: AnkiNoteInfo, card: JPDBCard, settings?: ReaderSettings): boolean {
    const fields = flattenNoteFields(note.fields);
    const mapping = settings ? ankiFieldMappingForModel(settings, note.modelName, Object.keys(fields)) : undefined;
    const expressionTargets = noteCardExpressionTargets(card);
    return noteHasExactTarget(fields, expressionTargets)
        || noteExpressionContainsTarget(fields, expressionTargets, mapping)
        || noteReadingContainsTarget(fields, card, mapping, expressionTargets);
}

function noteCardExpressionTargets(card: JPDBCard): string[] {
    return unique([card.spelling, ...(card.fallbackLookupTerms ?? [])]
        .map(value => value?.replace(/\s+/g, ' ').trim() ?? '')
        .filter(Boolean));
}

function noteFieldValues(fields: Record<string, string>): string[] {
    return Object.values(fields).map(value => value.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function noteHasExactTarget(fields: Record<string, string>, exactTargets: string[]): boolean {
    const values = noteFieldValues(fields);
    return exactTargets.some(target => values.some(value => value === target));
}

function noteExpressionContainsTarget(fields: Record<string, string>, exactTargets: string[], mapping?: AnkiFieldMapping): boolean {
    const expressions = noteExpressionCandidates(fields, mapping);
    return expressions.some(expression => exactTargets.some(target =>
        target.length >= 2
        && japaneseFieldContainsStandaloneTarget(expression.value, target)
        && (!expression.generic || genericExpressionLooksLikeHeadword(expression.value, target)),
    ));
}

function firstNoteField(fields: Record<string, string>, names: string[]): string {
    const exact = names.map(name => fields[name]).find(Boolean);
    if (exact) return exact;
    const normalizedNames = new Set(names.map(normalizeAnkiFieldName));
    return Object.entries(fields).find(([name, value]) => normalizedNames.has(normalizeAnkiFieldName(name)) && Boolean(value))?.[1] ?? '';
}

function noteReadingContainsTarget(fields: Record<string, string>, card: JPDBCard, mapping: AnkiFieldMapping | undefined, expressionTargets: string[]): boolean {
    const expressionValues = noteExpressionValues(fields, mapping);
    if (expressionValues.length && !expressionValues.some(expression =>
        expressionTargets.some(target => target.length >= 2 && japaneseFieldContainsStandaloneTarget(expression, target)),
    )) {
        return false;
    }
    const readings = unique([
        mappedNoteField(fields, mapping, 'reading'),
        firstNoteReading(fields),
    ].filter(Boolean));
    return Boolean(card.reading && card.reading.length >= 2 && readings.some(reading => japaneseFieldContainsStandaloneTarget(reading, card.reading)));
}

function noteExpressionValues(fields: Record<string, string>, mapping?: AnkiFieldMapping): string[] {
    return unique(noteExpressionCandidates(fields, mapping).map(candidate => candidate.value).filter(Boolean));
}

function firstNoteExpressionValue(fields: Record<string, string>, mapping?: AnkiFieldMapping): string {
    return noteExpressionCandidates(fields, mapping)[0]?.value ?? '';
}

function noteExpressionCandidates(fields: Record<string, string>, mapping?: AnkiFieldMapping): Array<{ value: string; generic: boolean }> {
    const candidates: Array<{ value: string; generic: boolean }> = [];
    const mapped = mappedNoteField(fields, mapping, 'expression');
    if (mapped) candidates.push({ value: mapped, generic: false });
    const headword = firstNoteField(fields, ANKI_HEADWORD_FIELD_NAMES);
    if (headword) candidates.push({ value: headword, generic: false });
    const generic = firstNoteField(fields, ANKI_GENERIC_EXPRESSION_FIELD_NAMES);
    if (generic) candidates.push({ value: generic, generic: true });
    const seen = new Set<string>();
    return candidates.filter(candidate => {
        const key = normalizeStatusIndexValue(candidate.value);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function genericExpressionLooksLikeHeadword(value: string, target: string): boolean {
    const normalizedValue = value.replace(/\s+/g, ' ').trim();
    if (normalizedValue === target) return true;
    if (/[。！？!?]/u.test(normalizedValue)) return false;
    return japaneseCharacterCount(normalizedValue) <= japaneseCharacterCount(target) + 4;
}

function lookupKeyTermsForCard(card: JPDBCard): string[] {
    return unique([card.spelling, card.reading, ...(card.fallbackLookupTerms ?? [])]
        .map(value => value?.replace(/\s+/g, ' ').trim() ?? '')
        .filter(Boolean));
}

function japaneseFieldContainsStandaloneTarget(value: string, target: string): boolean {
    const normalizedValue = value.replace(/\s+/g, ' ').trim();
    if (normalizedValue === target) return true;
    return normalizedValue
        .split(/[\s,;；、。・/／|｜()[\]（）「」『』【】<>＜＞]+/u)
        .some(part => part === target);
}

function firstNoteReading(fields: Record<string, string>): string {
    return firstNoteField(fields, ANKI_READING_FIELD_NAMES);
}

function mappedNoteField(fields: Record<string, string>, mapping: AnkiFieldMapping | undefined, role: AnkiFieldRole): string {
    const fieldName = mappedFieldName(Object.keys(fields), mapping, role);
    return fieldName ? fields[fieldName] ?? '' : '';
}

export const ANKI_EXPRESSION_FIELD_NAMES = [
    'Vocabulary-Kanji',
    'Vocabulary Kanji',
    'Vocab Kanji',
    'Jlab-Kanji',
    'Japanese_Word',
    'Word',
    'Word Kanji',
    'Japanese Word',
    'Headword',
    'Headword Kanji',
    'Term Kanji',
    'Term Text',
    'Expression Text',
    'Base Form',
    'Dictionary Form',
    'Expression',
    'Expression Reading',
    'Front',
    'Japanese',
    'Japanese Expression',
    'Kanji',
    'Katakana',
    'Learnable',
    'Lemma',
    'Primary',
    'Search Term',
    'Target Word',
    'Term',
    'Vocab',
    'Vocabulary',
    'Vocabulary Expression',
    'Word Expression',
];

const ANKI_HEADWORD_FIELD_NAMES = [
    'Vocabulary-Kanji',
    'Vocabulary Kanji',
    'Vocab Kanji',
    'Jlab-Kanji',
    'Japanese_Word',
    'Word',
    'Word Kanji',
    'Japanese Word',
    'Headword',
    'Headword Kanji',
    'Term Kanji',
    'Term Text',
    'Expression Text',
    'Base Form',
    'Dictionary Form',
    'Expression Reading',
    'Japanese Expression',
    'Learnable',
    'Lemma',
    'Primary',
    'Search Term',
    'Target Word',
    'Term',
    'Vocab',
    'Vocabulary',
    'Vocabulary Expression',
    'Word Expression',
];

const ANKI_GENERIC_EXPRESSION_FIELD_NAMES = [
    'Expression',
    'Front',
    'Japanese',
    'Kanji',
    'Katakana',
];

export const ANKI_READING_FIELD_NAMES = [
    'Vocabulary-Kana',
    'Vocabulary Kana',
    'Vocabulary-Furigana',
    'Vocabulary Furigana',
    'Vocab Kana',
    'Vocab Furigana',
    'Jlab-Hiragana',
    'Readings',
    'Expression Reading',
    'Furigana',
    'Furigana Reading',
    'Hiragana',
    'Japanese Reading',
    'Kana',
    'Kana Reading',
    'On',
    'On Reading',
    'Onyomi',
    'Kun',
    'Kun Reading',
    'Kunyomi',
    'Pronunciation',
    'Reading',
    'Ruby',
    'Term Kana',
    'Term Reading',
    'Vocab Reading',
    'Vocabulary Reading',
    'Word Kana',
    'Word Reading',
    'Yomi',
];

export const ANKI_MEANING_FIELD_NAMES = [
    'Vocabulary-English',
    'Vocabulary English',
    'Vocabulary-Meaning',
    'Vocabulary Meaning',
    'Translation_1',
    'Jlab-Translation',
    'RemarksBack',
    'Jlab-Remarks',
    'Other-Back',
    'Jlab-DictionaryLookup',
    'Meaning',
    'Def',
    'Defs',
    'Definition',
    'Definition 1',
    'Definition English',
    'Definitions',
    'English',
    'English Definition',
    'English Meaning',
    'Gloss',
    'Glosses',
    'Glossary',
    'Keyword',
    'MainDefinition',
    'Meanings',
    'Mnemonic',
    'Back',
    'DictionaryDefinitions',
    'Sense',
    'Term Meaning',
    'Translation',
    'Translation 1',
    'Vocab Def',
    'Vocab Definition',
    'Word Meaning',
];

export const ANKI_SENTENCE_FIELD_NAMES = [
    'Sentence',
    'Example',
    'Example Sentence',
    'Example Sentence Text',
    'Context',
    'Context Sentence',
    'Context Text',
    'ExpressionSentence',
    'Japanese Sentence',
    'Mining Sentence',
    'SentKanji',
    'Sentence Furigana',
    'Sentence Kanji',
    'Sentence-Kanji',
    'Sentence Text',
    'Source Sentence',
    'Source Text',
];

const ANKI_AUDIO_FIELD_NAMES = [
    'Audio',
    'Context Audio',
    'Example Audio',
    'Expression Audio',
    'SentAudio',
    'Sentence Audio',
    'Sentence Sound',
    'SentenceAudio',
    'Sound',
    'Term Audio',
    'Voice',
    'Vocab Audio',
    'Vocabulary Audio',
    'Word Audio',
    'PronunciationAudio',
];

const ANKI_IMAGE_FIELD_NAMES = [
    'Context Image',
    'Example Image',
    'Frame',
    'Image',
    'Image File',
    'Photo',
    'Picture',
    'Snapshot',
    'Screenshot',
    'Sentence Image',
    'Sentence Screenshot',
    'SentencePicture',
    'Still',
    'Source Image',
    'Term Image',
    'Vocab Image',
    'Vocabulary Image',
    'Word Image',
];

const ANKI_FIELD_ROLE_CANDIDATES: Record<AnkiFieldRole, string[]> = {
    expression: ANKI_EXPRESSION_FIELD_NAMES,
    reading: ANKI_READING_FIELD_NAMES,
    meaning: ANKI_MEANING_FIELD_NAMES,
    sentence: ANKI_SENTENCE_FIELD_NAMES,
    audio: ANKI_AUDIO_FIELD_NAMES,
    image: ANKI_IMAGE_FIELD_NAMES,
};

function scanAnkiModelFields(modelName: string, fields: string[], sampleNotes: AnkiNoteInfo[] = []): AnkiModelScanResult {
    const usedFields = new Set<string>();
    const samples = ankiFieldContentSamples(fields, sampleNotes);
    const suggestions = (Object.keys(ANKI_FIELD_ROLE_CANDIDATES) as AnkiFieldRole[])
        .map(role => {
            const suggestion = suggestAnkiField(role, fields, usedFields, samples);
            if (suggestion.fieldName) usedFields.add(suggestion.fieldName);
            return suggestion;
        });
    return {
        modelName,
        fields,
        suggestions,
        score: ankiModelScanScore(suggestions),
    };
}

function suggestAnkiField(
    role: AnkiFieldRole,
    fields: string[],
    usedFields: Set<string>,
    samples: AnkiFieldContentSamples = {},
): AnkiFieldSuggestion {
    const candidates = ANKI_FIELD_ROLE_CANDIDATES[role];
    const availableFields = fields.filter(field => !usedFields.has(field)
        && !ankiFieldDisallowedForRole(field, role)
        && (
            ankiFieldAllowedForRole(field, role)
            || ankiFieldContentRoleScore(role, samples[field] ?? []) >= 50
        ));
    const exact = firstMatchingAnkiField(availableFields, candidates);
    const content = suggestAnkiFieldFromContent(role, availableFields, samples);
    const exactContentScore = exact ? ankiFieldContentRoleScore(role, samples[exact] ?? []) : 0;
    if (content.fieldName && (!exact || isGenericAnkiFieldName(exact))) return content;
    if (content.fieldName && exact && content.fieldName !== exact && exactContentScore === 0 && content.confidence === 'high') return content;
    if (exact) return { role, fieldName: exact, confidence: 'high' };
    const fuzzy = firstFuzzyAnkiField(availableFields, candidates);
    if (content.fieldName && (!fuzzy || content.confidence === 'high')) return content;
    if (fuzzy) return { role, fieldName: fuzzy, confidence: 'medium' };
    if (content.fieldName) return content;
    return { role, fieldName: null, confidence: 'low' };
}

function suggestAnkiFieldFromContent(
    role: AnkiFieldRole,
    fields: string[],
    samples: AnkiFieldContentSamples,
): AnkiFieldSuggestion {
    const ranked = fields
        .map(fieldName => ({
            fieldName,
            score: ankiFieldContentRoleScore(role, samples[fieldName] ?? []),
        }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score || fields.indexOf(a.fieldName) - fields.indexOf(b.fieldName));
    const best = ranked[0];
    if (!best) return { role, fieldName: null, confidence: 'low' };
    return {
        role,
        fieldName: best.fieldName,
        confidence: best.score >= 50 ? 'high' : 'medium',
    };
}

function ankiFieldContentRoleScore(role: AnkiFieldRole, samples: AnkiFieldContentSample[]): number {
    if (!samples.length) return 0;
    const scores = samples
        .map(sample => ankiFieldContentSampleRoleScore(role, sample))
        .filter(score => score > 0)
        .sort((a, b) => b - a);
    if (!scores.length) return 0;
    const strongest = scores[0] ?? 0;
    const second = scores[1] ?? 0;
    return Math.min(100, strongest + Math.min(15, second / 3) + Math.min(10, scores.length * 2));
}

interface AnkiTextRoleMetrics {
    length: number;
    japaneseLength: number;
    hasJapanese: boolean;
    hasKanji: boolean;
    kanaLength: number;
    hasLatin: boolean;
    sentenceLike: boolean;
}

type AnkiTextRole = Extract<AnkiFieldRole, 'expression' | 'reading' | 'meaning' | 'sentence'>;

const ANKI_TEXT_ROLE_SCORERS: Record<AnkiTextRole, (metrics: AnkiTextRoleMetrics) => number> = {
    expression({ length, hasJapanese, hasKanji, kanaLength, sentenceLike }) {
        if (!hasJapanese || sentenceLike || length > 40) return 0;
        return 28 + (hasKanji ? 24 : 0) + (kanaLength && hasKanji ? 8 : 0) + Math.max(0, 12 - Math.floor(length / 2));
    },
    reading({ length, japaneseLength, hasJapanese, hasKanji, kanaLength }) {
        if (!hasJapanese || hasKanji || length > 40) return 0;
        const mostlyKana = kanaLength >= Math.max(1, japaneseLength - 1);
        return mostlyKana ? 54 + Math.max(0, 10 - Math.floor(length / 4)) : 20;
    },
    meaning({ length, hasJapanese, hasLatin }) {
        if (hasJapanese) return 0;
        if (hasLatin) return 54 + (length > 8 ? 6 : 0);
        return length >= 2 ? 24 : 0;
    },
    sentence({ length, hasJapanese, sentenceLike }) {
        if (!hasJapanese) return 0;
        if (sentenceLike) return 65 + (length > 20 ? 8 : 0);
        return length >= 14 ? 42 : 0;
    },
};

function ankiFieldContentSampleRoleScore(role: AnkiFieldRole, sample: AnkiFieldContentSample): number {
    const raw = sample.raw.trim();
    const text = sample.text.replace(/\s+/g, ' ').trim();
    if (role === 'audio') return ankiAudioFieldContentScore(raw, text);
    if (role === 'image') return ankiImageFieldContentScore(raw, text);
    if (ankiAudioFieldContentScore(raw, text) || ankiImageFieldContentScore(raw, text)) return 0;
    if (!text) return 0;
    const scorer = ANKI_TEXT_ROLE_SCORERS[role as AnkiTextRole];
    if (!scorer) return 0;
    const japaneseLength = japaneseCharacterCount(text);
    return scorer({
        length: text.length,
        japaneseLength,
        hasJapanese: japaneseLength > 0,
        hasKanji: /[\u3400-\u9fff]/u.test(text),
        kanaLength: kanaCharacterCount(text),
        hasLatin: /[A-Za-z]/.test(text),
        sentenceLike: japaneseSentenceLike(text),
    });
}

function ankiAudioFieldContentScore(raw: string, text: string): number {
    const value = `${raw} ${text}`.toLowerCase();
    if (/\[sound:[^\]]+\]/.test(value)) return 90;
    if (/<audio\b/.test(value)) return 85;
    if (/\.(?:mp3|m4a|ogg|oga|wav|flac)(?:[?#"'\s>]|$)/.test(value)) return 75;
    return 0;
}

function ankiImageFieldContentScore(raw: string, text: string): number {
    const value = `${raw} ${text}`.toLowerCase();
    if (/<img\b/.test(value)) return 90;
    if (/\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?:[?#"'\s>]|$)/.test(value)) return 75;
    return 0;
}

function ankiFieldContentSamples(fields: string[], notes: AnkiNoteInfo[]): AnkiFieldContentSamples {
    const out: AnkiFieldContentSamples = Object.fromEntries(fields.map(field => [field, []]));
    for (const note of notes) {
        for (const fieldName of fields) {
            const raw = String(note.fields?.[fieldName]?.value ?? '');
            if (!raw.trim()) continue;
            out[fieldName]?.push({ raw, text: stripHtml(raw) });
        }
    }
    return out;
}

function isGenericAnkiFieldName(fieldName: string): boolean {
    const normalized = normalizeAnkiFieldName(fieldName);
    return /^(?:front|back|primary|secondary|text|field\d+|f\d+)$/.test(normalized);
}

function japaneseCharacterCount(value: string): number {
    return (value.match(/[\u3040-\u30ff\u3400-\u9fff]/gu) ?? []).length;
}

function kanaCharacterCount(value: string): number {
    return (value.match(/[\u3040-\u30ff]/gu) ?? []).length;
}

function japaneseSentenceLike(value: string): boolean {
    if (/[。！？!?]/u.test(value)) return true;
    if (japaneseCharacterCount(value) >= 12) return true;
    return /(?:^|[\s　]).{2,}[\s　].{2,}/u.test(value) && japaneseCharacterCount(value) >= 8;
}

function ankiFieldAllowedForRole(fieldName: string, role: AnkiFieldRole): boolean {
    const normalized = normalizeAnkiFieldName(fieldName);
    const audioLike = /(?:audio|sound|voice)/.test(normalized);
    const imageLike = /(?:image|picture|screenshot|snapshot|photo|frame|still)/.test(normalized);
    if (role === 'audio') return audioLike && !imageLike;
    if (role === 'image') return imageLike && !audioLike && !/^frame(?:id|no|num|number|v?\d)/.test(normalized);
    return !audioLike && !imageLike;
}

function ankiFieldDisallowedForRole(fieldName: string, role: AnkiFieldRole): boolean {
    if (role === 'audio' || role === 'image') return false;
    const normalized = normalizeAnkiFieldName(fieldName);
    return /^(?:source|sourceurl|url|origin|originurl|link|deck|deckname|model|modelname|tags?|remarksfront|frontremarks)$/.test(normalized);
}

function firstMatchingAnkiField(fields: string[], names: string[]): string {
    const fieldByName = new Map<string, string>();
    fields.forEach(field => {
        const normalized = normalizeAnkiFieldName(field);
        if (!fieldByName.has(normalized)) fieldByName.set(normalized, field);
    });
    for (const name of names) {
        const match = fieldByName.get(normalizeAnkiFieldName(name));
        if (match) return match;
    }
    return '';
}

function firstFuzzyAnkiField(fields: string[], names: string[]): string {
    const normalizedNames = names
        .map(normalizeAnkiFieldName)
        .filter(name => name.length >= 4);
    return fields.find(field => {
        const normalized = normalizeAnkiFieldName(field);
        return normalizedNames.some(name => normalized.includes(name));
    }) ?? '';
}

function ankiModelScanScore(suggestions: AnkiFieldSuggestion[]): number {
    return suggestions.reduce((score, suggestion) => {
        if (!suggestion.fieldName) return score;
        const roleWeight = suggestion.role === 'expression' ? 6
            : suggestion.role === 'meaning' ? 4
                : suggestion.role === 'reading' || suggestion.role === 'sentence' ? 3
                    : 1;
        const confidenceWeight = suggestion.confidence === 'high' ? 2 : 1;
        return score + roleWeight * confidenceWeight;
    }, 0);
}

function normalizeAnkiFieldName(value: string): string {
    return value.replace(/[_\s-]+/g, '').toLowerCase();
}

function stripHtml(value: string): string {
    return value
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
}

function stateFromAnkiCards(cards: AnkiCardInfo[]): CardState {
    if (!cards.length) return 'known';
    if (cards.some(card => card.type === 3 || card.queue === 3)) return 'failed';
    if (cards.some(isAnkiCardDue)) return 'due';
    if (cards.some(card => card.queue === 1 || card.type === 1)) return 'learning';
    if (cards.some(card => card.queue === 0 || card.type === 0)) return 'new';
    if (cards.every(card => card.queue === -1)) return 'suspended';
    return 'known';
}

function stateFromExistingNotes(notes: AnkiExistingNote[]): CardState {
    const order: CardState[] = ['failed', 'due', 'learning', 'new', 'known', 'suspended'];
    return order.find(state => notes.some(note => note.state === state)) ?? (notes.length ? 'known' : 'not-in-deck');
}

function pickPrimaryCard(cards: AnkiCardInfo[]): AnkiCardInfo | null {
    const order = (card: AnkiCardInfo) => {
        if (card.type === 3 || card.queue === 3) return 0;
        if (isAnkiCardDue(card)) return 1;
        if (card.queue === 1 || card.type === 1) return 2;
        if (card.queue === 0 || card.type === 0) return 3;
        return 4;
    };
    return [...cards].sort((a, b) => order(a) - order(b))[0] ?? null;
}

function isAnkiCardDue(card: AnkiCardInfo): boolean {
    if (card.queue !== 2) return false;
    if (typeof card.isDue === 'boolean') return card.isDue;
    return Number(card.due ?? 0) <= 0;
}

function pickPrimaryExistingNote(notes: AnkiExistingNote[]): AnkiExistingNote | null {
    const order = (note: AnkiExistingNote) => {
        if (note.state === 'failed') return 0;
        if (note.state === 'due') return 1;
        if (note.state === 'learning') return 2;
        if (note.state === 'new') return 3;
        if (note.state === 'known') return 4;
        return 5;
    };
    return [...notes].sort((a, b) => order(a) - order(b))[0] ?? null;
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

function renderSentence(sentence: string, expression: string): string {
    if (!sentence) return '';
    if (!expression || !sentence.includes(expression)) return escapeHtml(sentence);
    return sentence.split(expression)
        .map(part => escapeHtml(part))
        .join(`<span class="yomu-highlight">${escapeHtml(expression)}</span>`);
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
