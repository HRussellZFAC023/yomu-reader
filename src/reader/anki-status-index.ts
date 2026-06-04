import { gmStorageDeleteSync, gmStorageGetSync, gmStorageSet, gmStorageSetSync } from './storage';
import { Logger } from './logger';
import type { AnkiFieldMapping, CardState, JPDBCard, ReaderSettings } from './types';
import {
    type AnkiExistingNote,
    type AnkiNoteInfo,
    type AnkiStatusIndex,
    type AnkiStatusIndexCardData,
    type AnkiStatusIndexCardSets,
    type AnkiStatusIndexEntry,
    type AnkiStatusIndexRebuildLease,
    type StoredAnkiStatusIndexEntry,
    type StoredAnkiStatusIndexMeta,
} from './anki-types';
import {
    ankiFieldMappingForModel,
    firstNoteExpressionValue,
    firstNoteReading,
    flattenNoteFields,
    isKanaStatusLookupSurface,
    mappedNoteField,
    noteCardExpressionTargets,
    noteFieldValues,
} from './anki-field-mapping';
import { ankiExistingNoteFromInfo } from './anki-card-details';

export const ANKI_STATUS_INDEX_STORAGE_KEY = 'yomu:anki-status-index:v1';
export const ANKI_STATUS_INDEX_VERSION = 1;
export const ANKI_STATUS_INDEX_COUNT_CHECK_MS = 5 * 60 * 1000;
export const ANKI_STATUS_INDEX_MAX_STALE_MS = 30 * 60 * 1000;
export const ANKI_STATUS_INDEX_NOTE_CHUNK_SIZE = 500;
export const ANKI_STATUS_INDEX_NOTE_CONCURRENCY = 3;

const ANKI_STATUS_INDEX_REBUILD_LEASE_STORAGE_KEY = 'yomu:anki-status-index-rebuild:v1';
const ANKI_STATUS_INDEX_REBUILD_LEASE_TTL_MS = 15 * 60 * 1000;
const ANKI_STATUS_INDEX_DB_NAME = 'yomu-anki-status-index';
const ANKI_STATUS_INDEX_DB_VERSION = 1;
const ANKI_STATUS_INDEX_META_STORE = 'meta';
const ANKI_STATUS_INDEX_ENTRY_STORE = 'entries';
const ANKI_STATUS_INDEX_ENTRY_READ_CHUNK_SIZE = 500;
const ANKI_STATUS_INDEX_ENTRY_WRITE_CHUNK_SIZE = 1000;

const log = Logger.scope('Anki');

export function activeAnkiStatusIndexRebuildLease(settingsKey?: string, now = Date.now()): AnkiStatusIndexRebuildLease | null {
    const lease = gmStorageGetSync<unknown>(ANKI_STATUS_INDEX_REBUILD_LEASE_STORAGE_KEY, null);
    if (!isAnkiStatusIndexRebuildLease(lease)) return null;
    if (lease.expiresAt <= now) {
        gmStorageDeleteSync(ANKI_STATUS_INDEX_REBUILD_LEASE_STORAGE_KEY);
        return null;
    }
    if (settingsKey && lease.settingsKey !== settingsKey) return null;
    return lease;
}

export function claimAnkiStatusIndexRebuildLease(settingsKey: string, now = Date.now()): string | null {
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

export function touchAnkiStatusIndexRebuildLease(owner: string, settingsKey: string, now = Date.now()): void {
    const lease = activeAnkiStatusIndexRebuildLease(undefined, now);
    if (!lease || lease.owner !== owner) return;
    gmStorageSetSync(ANKI_STATUS_INDEX_REBUILD_LEASE_STORAGE_KEY, {
        ...lease,
        settingsKey,
        expiresAt: now + ANKI_STATUS_INDEX_REBUILD_LEASE_TTL_MS,
    });
}

export function releaseAnkiStatusIndexRebuildLease(owner: string): void {
    const lease = gmStorageGetSync<unknown>(ANKI_STATUS_INDEX_REBUILD_LEASE_STORAGE_KEY, null);
    if (isAnkiStatusIndexRebuildLease(lease) && lease.owner === owner) {
        gmStorageDeleteSync(ANKI_STATUS_INDEX_REBUILD_LEASE_STORAGE_KEY);
    }
}

export async function saveAnkiStatusIndex(index: AnkiStatusIndex): Promise<void> {
    try {
        await saveAnkiStatusIndexToIndexedDb(index);
        await gmStorageSet(ANKI_STATUS_INDEX_STORAGE_KEY, ankiStatusIndexMeta(index));
    } catch (error) {
        log.warn('IndexedDB Anki status index save failed; falling back to browser value storage', error);
        await gmStorageSet(ANKI_STATUS_INDEX_STORAGE_KEY, { ...index, entryStore: undefined });
    }
}

export async function saveAnkiStatusIndexCheckedAt(index: AnkiStatusIndex): Promise<void> {
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

export async function saveAnkiStatusIndexDirtyMarker(index: AnkiStatusIndex): Promise<void> {
    const dirty: AnkiStatusIndex = { ...index, syncedAt: 0, checkedAt: 0 };
    if (dirty.entryStore !== 'indexeddb') {
        gmStorageSetSync(ANKI_STATUS_INDEX_STORAGE_KEY, { ...dirty, entryStore: undefined });
        return;
    }
    const meta = ankiStatusIndexMeta(dirty);
    gmStorageSetSync(ANKI_STATUS_INDEX_STORAGE_KEY, meta);
    await putStoredAnkiStatusIndexMeta(meta);
}

export async function loadAnkiStatusIndexFromIndexedDb(): Promise<AnkiStatusIndex | null> {
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
            readingKeys: meta.readingKeys,
        };
    } finally {
        db.close();
    }
}

export async function loadAnkiStatusIndexEntriesFromIndexedDb(keys: string[]): Promise<Map<string, AnkiStatusIndexEntry>> {
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

export async function saveAnkiStatusIndexToIndexedDb(index: AnkiStatusIndex): Promise<void> {
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

export function ankiStatusIndexMeta(index: AnkiStatusIndex): StoredAnkiStatusIndexMeta {
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
        readingKeys: index.readingKeys,
    };
}

export function clearAnkiStatusIndexStores(db: IDBDatabase): Promise<void> {
    const tx = db.transaction([ANKI_STATUS_INDEX_META_STORE, ANKI_STATUS_INDEX_ENTRY_STORE], 'readwrite');
    tx.objectStore(ANKI_STATUS_INDEX_META_STORE).clear();
    tx.objectStore(ANKI_STATUS_INDEX_ENTRY_STORE).clear();
    return idbTransactionDone(tx);
}

export function putAnkiStatusIndexMeta(db: IDBDatabase, meta: StoredAnkiStatusIndexMeta): Promise<void> {
    const tx = db.transaction(ANKI_STATUS_INDEX_META_STORE, 'readwrite');
    tx.objectStore(ANKI_STATUS_INDEX_META_STORE).put(meta);
    return idbTransactionDone(tx);
}

export function putBestAnkiStatusIndexEntries(db: IDBDatabase, entries: StoredAnkiStatusIndexEntry[]): Promise<void> {
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

export function countAnkiStatusIndexEntries(db: IDBDatabase): Promise<number> {
    const tx = db.transaction(ANKI_STATUS_INDEX_ENTRY_STORE, 'readonly');
    const done = idbTransactionDone(tx);
    const count = idbRequest<number>(tx.objectStore(ANKI_STATUS_INDEX_ENTRY_STORE).count());
    return count.then(async value => {
        await done;
        return value;
    });
}

export function openAnkiStatusIndexDb(): Promise<IDBDatabase> {
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

export function canUseIndexedDb(): boolean {
    return typeof indexedDB !== 'undefined';
}

export function statusIndexEntriesForNotes(notes: AnkiNoteInfo[], cardData: AnkiStatusIndexCardData, settings: ReaderSettings): StoredAnkiStatusIndexEntry[] {
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

export function statusIndexKeysForCard(card: JPDBCard): string[] {
    const keys = noteCardExpressionTargets(card).map(statusIndexKey);
    if (shouldUseStatusReadingKey(card)) keys.push(statusIndexReadingKey(card.reading || card.spelling));
    return unique(keys);
}

export function statusIndexEntryForCard(
    index: AnkiStatusIndex,
    card: JPDBCard,
    entries?: Map<string, AnkiStatusIndexEntry> | null,
): AnkiStatusIndexEntry | null {
    return statusIndexKeysForCard(card)
        .map(key => entries?.get(key) ?? index.entries[key])
        .find(Boolean) ?? null;
}

export function ankiExistingNoteFromStatusData(note: AnkiNoteInfo, cardData: AnkiStatusIndexCardData): AnkiExistingNote {
    const noteCards = cardData.cardsByNote.get(note.noteId) ?? [];
    if (noteCards.length) return ankiExistingNoteFromInfo(note, noteCards);
    return ankiExistingNoteFromStatusSets(note, cardData.sets);
}

export function shouldReplaceAnkiStatusIndexEntry(current: AnkiStatusIndexEntry, candidate: AnkiStatusIndexEntry): boolean {
    return ankiStatusIndexStateRank(candidate.state) < ankiStatusIndexStateRank(current.state);
}

function putAnkiStatusIndexEntries(db: IDBDatabase, entries: StoredAnkiStatusIndexEntry[]): Promise<void> {
    const tx = db.transaction(ANKI_STATUS_INDEX_ENTRY_STORE, 'readwrite');
    const store = tx.objectStore(ANKI_STATUS_INDEX_ENTRY_STORE);
    entries.forEach(entry => store.put(entry));
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

function normalizeStatusIndexValue(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function statusIndexKey(value: string): string {
    return normalizeStatusIndexValue(value).toLocaleLowerCase();
}

function statusIndexReadingKey(value: string): string {
    return `reading:${statusIndexKey(value)}`;
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
    for (const value of statusIndexReadingFieldValues(fields, mapping)) {
        if (value.length <= 80) keys.add(statusIndexReadingKey(value));
        value
            .split(/[\s,;；、。・/／|｜()[\]（）「」『』【】<>＜＞]+/u)
            .map(statusIndexReadingKey)
            .filter(value => value.length >= 'reading:'.length + 2)
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

function statusIndexReadingFieldValues(fields: Record<string, string>, mapping?: AnkiFieldMapping): string[] {
    return unique([
        mappedNoteField(fields, mapping, 'reading'),
        firstNoteReading(fields),
    ]
        .map(value => value.replace(/\s+/g, ' ').trim())
        .filter(value => value.length >= 2));
}

function shouldUseStatusReadingKey(card: JPDBCard): boolean {
    const reading = (card.reading || '').replace(/\s+/g, ' ').trim();
    const spelling = (card.spelling || '').replace(/\s+/g, ' ').trim();
    const readingTarget = reading || (isKanaStatusLookupSurface(spelling) ? spelling : '');
    if (!readingTarget || readingTarget.length < 2) return false;
    if (!spelling || spelling.length < 2) return false;
    return spelling === readingTarget || isKanaStatusLookupSurface(spelling);
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

function unique<T>(items: T[]): T[] {
    return [...new Set(items)];
}

function chunkArray<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
    return chunks;
}
