import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';
import { migrateAcademyCheckpoint, openAcademyPersistence } from '../../src/academy/persistence/indexeddb';
import type { LearnerEvent } from '../../src/academy/domain/learner-record';

describe('Academy IndexedDB persistence', () => {
    it('restores idempotent learner events and an offline navigation checkpoint', async () => {
        const name = `academy-test-${crypto.randomUUID()}`;
        const persistence = await openAcademyPersistence(fakeIndexedDB, name);
        const event: LearnerEvent = {
            schemaVersion: 1,
            eventId: 'event-1',
            at: 100,
            kind: 'scene-completed',
            sceneId: 'scene:opening',
        };
        await persistence.events.append([event, structuredClone(event)]);
        await persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'campus',
            routeHistory: [{ route: 'class', selectedBand: 'n4' }],
            presentationMode: 'course',
            selectedBand: 'n4',
            selectedFork: 'sound',
            session: {
                sessionId: 'local-session',
                expiresAt: 200,
                offlineResumeUntil: 300,
                source: 'local-qa',
            },
            updatedAt: 101,
        });
        persistence.close();

        const restored = await openAcademyPersistence(fakeIndexedDB, name);
        expect(await restored.events.readAll()).toEqual([event]);
        expect(await restored.checkpoint.load()).toMatchObject({
            schemaVersion: 2,
            route: 'campus',
            routeHistory: [{ route: 'class', selectedBand: 'n4' }],
            presentationMode: 'course',
            selectedBand: 'n4',
            selectedFork: 'sound',
        });
        restored.close();
    });

    it('rejects conflicting event ids instead of overwriting evidence', async () => {
        const persistence = await openAcademyPersistence(fakeIndexedDB, `academy-test-${crypto.randomUUID()}`);
        const event: LearnerEvent = {
            schemaVersion: 1,
            eventId: 'event-1',
            at: 100,
            kind: 'scene-completed',
            sceneId: 'scene:opening',
        };
        await persistence.events.append([event]);
        await expect(persistence.events.append([{ ...event, sceneId: 'scene:other' }])).rejects.toThrow('Conflicting learner event id');
        expect(await persistence.events.readAll()).toEqual([event]);
        persistence.close();
    });

    it('persists a day-end navigation checkpoint without a completion event', async () => {
        const persistence = await openAcademyPersistence(fakeIndexedDB, `academy-test-${crypto.randomUUID()}`);
        await persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'day-end',
            routeHistory: [{ route: 'campus' }],
            presentationMode: 'story',
            session: {
                sessionId: 'local-session',
                expiresAt: 200,
                offlineResumeUntil: 300,
                source: 'local-qa',
            },
            updatedAt: 101,
        });

        expect(await persistence.checkpoint.load()).toMatchObject({ route: 'day-end' });
        expect(await persistence.events.readAll()).toEqual([]);
        persistence.close();
    });

    it('migrates schema 1 checkpoints without losing the invite session or lesson state', () => {
        expect(migrateAcademyCheckpoint({
            schemaVersion: 1,
            route: 'source-activity',
            selectedBand: 'n4',
            selectedFork: 'sound',
            placementOverride: true,
            session: {
                sessionId: 'existing-session',
                expiresAt: 2_000,
                offlineResumeUntil: 3_000,
                source: 'cloudflare',
            },
            updatedAt: 101,
        })).toEqual({
            schemaVersion: 2,
            route: 'source-activity',
            routeHistory: [],
            presentationMode: 'story',
            selectedBand: 'n4',
            selectedFork: 'sound',
            placementOverride: true,
            session: {
                sessionId: 'existing-session',
                expiresAt: 2_000,
                offlineResumeUntil: 3_000,
                source: 'cloudflare',
            },
            updatedAt: 101,
        });
    });

    it('writes a migrated schema 1 checkpoint back during IndexedDB resume', async () => {
        const name = `academy-test-${crypto.randomUUID()}`;
        (await openAcademyPersistence(fakeIndexedDB, name)).close();
        const database = await openDatabase(name);
        const transaction = database.transaction('meta', 'readwrite');
        transaction.objectStore('meta').put({
            id: 'active-checkpoint',
            value: {
                schemaVersion: 1,
                route: 'review',
                session: {
                    sessionId: 'existing-session',
                    expiresAt: 2_000,
                    offlineResumeUntil: 3_000,
                    source: 'cloudflare',
                },
                selectedFork: 'text',
                updatedAt: 101,
            },
        });
        await transactionDone(transaction);
        database.close();

        const restored = await openAcademyPersistence(fakeIndexedDB, name);
        expect(await restored.checkpoint.load()).toMatchObject({
            schemaVersion: 2,
            route: 'review',
            routeHistory: [],
            presentationMode: 'story',
            selectedFork: 'text',
            session: { sessionId: 'existing-session' },
        });
        restored.close();

        const writtenDatabase = await openDatabase(name);
        const written = await request<{ value: { schemaVersion: number } }>(
            writtenDatabase.transaction('meta').objectStore('meta').get('active-checkpoint'),
        );
        expect(written.value.schemaVersion).toBe(2);
        writtenDatabase.close();
    });

    it('rejects authentication material inside persisted route-history frames', () => {
        expect(() => migrateAcademyCheckpoint({
            schemaVersion: 2,
            route: 'class',
            routeHistory: [{ route: 'access', session: { sessionId: 'must-not-be-copied' } }],
            presentationMode: 'story',
            updatedAt: 101,
        })).toThrow('invalid route history');
    });

    it('commits event batches atomically when a later event conflicts', async () => {
        const persistence = await openAcademyPersistence(fakeIndexedDB, `academy-test-${crypto.randomUUID()}`);
        const existing: LearnerEvent = {
            schemaVersion: 1,
            eventId: 'event-existing',
            at: 100,
            kind: 'scene-completed',
            sceneId: 'scene:existing',
        };
        await persistence.events.append([existing]);
        await expect(persistence.events.append([
            { ...existing, eventId: 'event-new', sceneId: 'scene:new' },
            { ...existing, sceneId: 'scene:conflict' },
        ])).rejects.toThrow('Conflicting learner event id');
        expect(await persistence.events.readAll()).toEqual([existing]);
        persistence.close();
    });

    it('deduplicates a retried idempotent event even when its retry timestamp differs', async () => {
        const persistence = await openAcademyPersistence(fakeIndexedDB, `academy-test-${crypto.randomUUID()}`);
        const event: LearnerEvent = {
            schemaVersion: 1,
            eventId: 'milestone:rie-introduction:scene',
            at: 100,
            kind: 'scene-completed',
            sceneId: 'scene:opening-rie-introduction',
        };
        await persistence.events.append([event]);
        await persistence.events.append([{ ...event, at: 200 }]);
        expect(await persistence.events.readAll()).toEqual([event]);
        persistence.close();
    });
});

function openDatabase(name: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const pending = fakeIndexedDB.open(name);
        pending.onsuccess = () => resolve(pending.result);
        pending.onerror = () => reject(pending.error);
    });
}

function request<T>(pending: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        pending.onsuccess = () => resolve(pending.result);
        pending.onerror = () => reject(pending.error);
    });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => reject(transaction.error);
    });
}
