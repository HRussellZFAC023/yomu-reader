import type { InviteSession } from '../access/gateway';
import {
    authoredWeekProgressRecordIsValid,
    type AuthoredWeekProgressRecord,
} from '../domain/authored-week-progress';
import { learnerEventsAreEquivalent, type LearnerEvent, type LearnerEventRepository, type JlptBand } from '../domain/learner-record';
import {
    isAcademyPresentationMode,
    isAcademyRoute,
    type AcademyRoute,
    type AcademyRouteHistoryState,
} from '../routing/route-history';
import { isWorldPlaceId, type WorldPlaceId } from '../domain/world-locations';

export type { AcademyRoute } from '../routing/route-history';

export interface AcademyCheckpoint extends AcademyRouteHistoryState {
    readonly schemaVersion: 2;
    readonly session?: InviteSession;
    /** Durable one-time scene/action introductions. Kept out of route history. */
    readonly seenIntroductions?: readonly string[];
    /** Deterministic revisit state for the location world; not route history. */
    readonly worldVisits?: Readonly<Partial<Record<WorldPlaceId, number>>>;
    /** Per-package lesson cursor. It survives leaving the lesson; evidence remains canonical for answers. */
    readonly authoredWeekProgress?: AuthoredWeekProgressRecord;
    readonly selectedBand?: JlptBand;
    readonly selectedFork?: 'sound' | 'text' | 'speaking';
    readonly placementOverride?: boolean;
    readonly updatedAt: number;
}

export type AcademyCheckpointUpdate = Partial<Omit<
    AcademyCheckpoint,
    'schemaVersion' | 'route' | 'routeHistory' | 'presentationMode' | 'updatedAt'
>>;

export interface AcademyCheckpointStore {
    load(): Promise<AcademyCheckpoint | null>;
    save(checkpoint: AcademyCheckpoint): Promise<void>;
}

export interface AcademyPersistence {
    readonly events: LearnerEventRepository;
    readonly checkpoint: AcademyCheckpointStore;
    close(): void;
}

/**
 * A malformed or partially-written checkpoint must not strand the learner on
 * boot. Learner events remain canonical; navigation can safely return to the
 * access screen and be rebuilt from those events.
 */
export async function loadAcademyCheckpointSafely(
    store: AcademyCheckpointStore,
    fallback: AcademyCheckpoint,
): Promise<AcademyCheckpoint> {
    try {
        return structuredClone(await store.load() ?? fallback);
    } catch {
        try { await store.save(fallback); } catch { /* keep this session usable even if storage is read-only */ }
        return structuredClone(fallback);
    }
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
                if (!record) return null;
                const checkpoint = migrateAcademyCheckpoint(record.value);
                if (checkpoint.schemaVersion !== checkpointSchemaVersion(record.value)) await writeCheckpoint(database, checkpoint);
                return structuredClone(checkpoint);
            },
            async save(checkpoint) {
                await writeCheckpoint(database, checkpoint);
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
    readonly value: unknown;
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

export function migrateAcademyCheckpoint(value: unknown): AcademyCheckpoint {
    if (!value || typeof value !== 'object') throw new TypeError('Academy checkpoint must be an object.');
    const record = value as Record<string, unknown>;
    if (record.schemaVersion === 1) {
        const checkpoint: AcademyCheckpoint = {
            schemaVersion: 2,
            route: record.route as AcademyRoute,
            routeHistory: [],
            presentationMode: 'story',
            ...(record.session === undefined ? {} : { session: structuredClone(record.session) as InviteSession }),
            ...(record.selectedBand === undefined ? {} : { selectedBand: record.selectedBand as JlptBand }),
            ...(record.selectedFork === undefined ? {} : { selectedFork: record.selectedFork as AcademyCheckpoint['selectedFork'] }),
            ...(record.placementOverride === undefined ? {} : { placementOverride: record.placementOverride as boolean }),
            updatedAt: record.updatedAt as number,
        };
        validateCheckpoint(checkpoint);
        return checkpoint;
    }
    if (record.schemaVersion !== 2) throw new TypeError('Academy checkpoint schemaVersion must be 1 or 2.');
    const checkpoint = structuredClone(value) as AcademyCheckpoint;
    validateCheckpoint(checkpoint);
    return checkpoint;
}

function validateCheckpoint(value: AcademyCheckpoint): void {
    if (value.schemaVersion !== 2) throw new TypeError('Academy checkpoint schemaVersion must be 2.');
    if (!Number.isSafeInteger(value.updatedAt) || value.updatedAt < 0) throw new TypeError('Academy checkpoint needs a valid timestamp.');
    if (!isAcademyRoute(value.route)) throw new TypeError('Academy checkpoint has an invalid route.');
    if (!Array.isArray(value.routeHistory) || value.routeHistory.some(frame => !routeFrameIsValid(frame))) {
        throw new TypeError('Academy checkpoint has an invalid route history.');
    }
    if (!isAcademyPresentationMode(value.presentationMode)) throw new TypeError('Academy checkpoint has an invalid presentation mode.');
    if (value.seenIntroductions !== undefined && (!Array.isArray(value.seenIntroductions)
        || value.seenIntroductions.some(id => typeof id !== 'string' || !id.trim())
        || new Set(value.seenIntroductions).size !== value.seenIntroductions.length)) {
        throw new TypeError('Academy checkpoint has invalid seen introductions.');
    }
    if (value.worldVisits !== undefined && (!value.worldVisits || typeof value.worldVisits !== 'object'
        || Object.entries(value.worldVisits).some(([place, visits]) => !isWorldPlaceId(place)
            || !Number.isSafeInteger(visits) || visits < 0))) {
        throw new TypeError('Academy checkpoint has invalid world visits.');
    }
    if (value.authoredWeekProgress !== undefined
        && !authoredWeekProgressRecordIsValid(value.authoredWeekProgress)) {
        throw new TypeError('Academy checkpoint has invalid authored week progress.');
    }
    validateRouteContext(value);
}

function routeFrameIsValid(value: unknown): boolean {
    if (!value || typeof value !== 'object' || !isAcademyRoute((value as { route?: unknown }).route)) return false;
    const allowedKeys = new Set([
        'route',
        'selectedBand',
        'selectedFork',
        'placementOverride',
        'lessonId',
        'sectionId',
        'activityId',
        'worldPlace',
    ]);
    if (Object.keys(value).some(key => !allowedKeys.has(key))) return false;
    try {
        validateRouteContext(value as AcademyCheckpoint);
        return true;
    } catch {
        return false;
    }
}

function validateRouteContext(value: Pick<
    AcademyCheckpoint,
    'selectedBand' | 'selectedFork' | 'placementOverride' | 'lessonId' | 'sectionId' | 'activityId' | 'worldPlace'
>): void {
    if (value.selectedBand !== undefined && !['n5', 'n4', 'n3', 'n2', 'n1'].includes(value.selectedBand)) {
        throw new TypeError('Academy checkpoint has an invalid selected band.');
    }
    if (value.selectedFork !== undefined && !['sound', 'text', 'speaking'].includes(value.selectedFork)) {
        throw new TypeError('Academy checkpoint has an invalid selected fork.');
    }
    if (value.placementOverride !== undefined && typeof value.placementOverride !== 'boolean') {
        throw new TypeError('Academy checkpoint has an invalid placement override.');
    }
    if (value.lessonId !== undefined && (typeof value.lessonId !== 'string' || value.lessonId.length === 0)) {
        throw new TypeError('Academy checkpoint has an invalid lesson id.');
    }
    if (value.sectionId !== undefined && (typeof value.sectionId !== 'string' || value.sectionId.length === 0)) {
        throw new TypeError('Academy checkpoint has an invalid section id.');
    }
    if (value.activityId !== undefined && (typeof value.activityId !== 'string' || value.activityId.length === 0)) {
        throw new TypeError('Academy checkpoint has an invalid activity id.');
    }
    if (value.worldPlace !== undefined && !isWorldPlaceId(value.worldPlace)) {
        throw new TypeError('Academy checkpoint has an invalid world place.');
    }
}

async function writeCheckpoint(database: IDBDatabase, checkpoint: AcademyCheckpoint): Promise<void> {
    validateCheckpoint(checkpoint);
    const transaction = database.transaction(META_STORE, 'readwrite');
    transaction.objectStore(META_STORE).put({ id: CHECKPOINT_ID, value: structuredClone(checkpoint) } satisfies MetaRecord);
    await transactionComplete(transaction);
}

function checkpointSchemaVersion(value: unknown): number | undefined {
    return value && typeof value === 'object' && 'schemaVersion' in value
        ? Number((value as { schemaVersion?: unknown }).schemaVersion)
        : undefined;
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
