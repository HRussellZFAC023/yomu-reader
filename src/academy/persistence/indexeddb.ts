import type { InviteSession } from '../access/gateway';
import { learnerEventsAreEquivalent, type LearnerEvent, type LearnerEventRepository, type JlptBand } from '../domain/learner-record';

export type AcademyRoute =
    | 'access'
    | 'profile'
    | 'rie-unlock'
    | 'start'
    | 'manual-band'
    | 'placement-mock'
    | 'placement-result'
    | 'arrival-bridge'
    | 'band-entry'
    | 'lesson-fork'
    | 'source-activity'
    | 'aakash-meet'
    | 'writing-practice'
    | 'campus'
    | 'lab'
    | 'review'
    | 'journal';

export interface AcademyCheckpoint {
    readonly schemaVersion: 1;
    readonly route: AcademyRoute;
    readonly session?: InviteSession;
    readonly selectedBand?: JlptBand;
    readonly selectedFork?: 'sound' | 'text' | 'speaking';
    readonly placementOverride?: boolean;
    readonly updatedAt: number;
}

export interface AcademyCheckpointStore {
    load(): Promise<AcademyCheckpoint | null>;
    save(checkpoint: AcademyCheckpoint): Promise<void>;
}

export interface AcademyPersistence {
    readonly events: LearnerEventRepository;
    readonly checkpoint: AcademyCheckpointStore;
    close(): void;
}

const DEFAULT_DB_NAME = 'yomu-academy-v1';
const DB_VERSION = 1;
const EVENT_STORE = 'learner-events';
const META_STORE = 'meta';
const CHECKPOINT_ID = 'active-checkpoint';

export async function openAcademyPersistence(
    factory: IDBFactory = indexedDB,
    databaseName: string | undefined = DEFAULT_DB_NAME,
): Promise<AcademyPersistence> {
    const database = await openDatabase(factory, databaseName ?? DEFAULT_DB_NAME);
    return {
        events: {
            readAll: () => readAllEvents(database),
            append: events => appendEvents(database, events),
        },
        checkpoint: {
            async load() {
                const record = await request<MetaRecord | undefined>(database.transaction(META_STORE).objectStore(META_STORE).get(CHECKPOINT_ID));
                return record?.value ? structuredClone(record.value) : null;
            },
            async save(checkpoint) {
                validateCheckpoint(checkpoint);
                const transaction = database.transaction(META_STORE, 'readwrite');
                transaction.objectStore(META_STORE).put({ id: CHECKPOINT_ID, value: structuredClone(checkpoint) } satisfies MetaRecord);
                await transactionComplete(transaction);
            },
        },
        close() { database.close(); },
    };
}

export function createMemoryAcademyPersistence(): AcademyPersistence {
    const events: LearnerEvent[] = [];
    let checkpoint: AcademyCheckpoint | null = null;
    return {
        events: {
            async readAll() { return structuredClone(events); },
            async append(candidates) {
                for (const candidate of candidates) {
                    const previous = events.find(event => event.eventId === candidate.eventId);
                    if (!previous) events.push(structuredClone(candidate));
                    else if (!learnerEventsAreEquivalent(previous, candidate)) throw new Error(`Conflicting learner event id: ${candidate.eventId}`);
                }
            },
        },
        checkpoint: {
            async load() { return checkpoint ? structuredClone(checkpoint) : null; },
            async save(value) { validateCheckpoint(value); checkpoint = structuredClone(value); },
        },
        close() {},
    };
}

interface MetaRecord {
    readonly id: string;
    readonly value: AcademyCheckpoint;
}

function openDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const pending = factory.open(name, DB_VERSION);
        pending.onupgradeneeded = () => {
            const database = pending.result;
            if (!database.objectStoreNames.contains(EVENT_STORE)) database.createObjectStore(EVENT_STORE, { keyPath: 'eventId' });
            if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE, { keyPath: 'id' });
        };
        pending.onsuccess = () => resolve(pending.result);
        pending.onerror = () => reject(pending.error ?? new Error('Could not open Academy storage.'));
        pending.onblocked = () => reject(new Error('Academy storage upgrade is blocked by another tab.'));
    });
}

async function readAllEvents(database: IDBDatabase): Promise<readonly LearnerEvent[]> {
    const values = await request<LearnerEvent[]>(database.transaction(EVENT_STORE).objectStore(EVENT_STORE).getAll());
    return values
        .map(value => structuredClone(value))
        .sort((left, right) => left.at - right.at || left.eventId.localeCompare(right.eventId));
}

function appendEvents(database: IDBDatabase, candidates: readonly LearnerEvent[]): Promise<void> {
    return new Promise((resolve, reject) => {
        let events: LearnerEvent[];
        try {
            events = uniqueEvents(candidates);
        } catch (error) {
            reject(error);
            return;
        }
        if (!events.length) {
            resolve();
            return;
        }
        const transaction = database.transaction(EVENT_STORE, 'readwrite');
        const store = transaction.objectStore(EVENT_STORE);
        let conflict: Error | null = null;
        events.forEach(event => {
            const read = store.get(event.eventId);
            read.onsuccess = () => {
                const previous = read.result as LearnerEvent | undefined;
                if (previous && !learnerEventsAreEquivalent(previous, event)) {
                    conflict = new Error(`Conflicting learner event id: ${event.eventId}`);
                    transaction.abort();
                    return;
                }
                if (!previous) store.add(structuredClone(event));
            };
            read.onerror = () => {
                conflict = read.error ?? new Error('Could not read learner event.');
                transaction.abort();
            };
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => { /* onabort reports the precise batch failure */ };
        transaction.onabort = () => reject(conflict ?? transaction.error ?? new Error('Could not store learner event batch.'));
    });
}

function uniqueEvents(candidates: readonly LearnerEvent[]): LearnerEvent[] {
    const events = new Map<string, LearnerEvent>();
    for (const candidate of candidates) {
        const event = structuredClone(candidate);
        const previous = events.get(event.eventId);
        if (previous && !learnerEventsAreEquivalent(previous, event)) {
            throw new Error(`Conflicting learner event id: ${event.eventId}`);
        }
        events.set(event.eventId, event);
    }
    return [...events.values()];
}

function validateCheckpoint(value: AcademyCheckpoint): void {
    if (value.schemaVersion !== 1) throw new TypeError('Academy checkpoint schemaVersion must be 1.');
    if (!Number.isSafeInteger(value.updatedAt) || value.updatedAt < 0) throw new TypeError('Academy checkpoint needs a valid timestamp.');
    if (![
        'access', 'profile', 'rie-unlock', 'start', 'manual-band', 'placement-mock', 'placement-result',
        'arrival-bridge', 'band-entry', 'lesson-fork', 'source-activity', 'aakash-meet', 'writing-practice', 'campus', 'lab', 'review', 'journal',
    ].includes(value.route)) throw new TypeError('Academy checkpoint has an invalid route.');
}

function request<T>(pending: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        pending.onsuccess = () => resolve(pending.result);
        pending.onerror = () => reject(pending.error ?? new Error('IndexedDB request failed.'));
    });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
        transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    });
}
