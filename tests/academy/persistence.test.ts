import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';
import {
    loadAcademyCheckpointSafely,
    migrateAcademyCheckpoint,
    openAcademyPersistence,
} from '../../src/academy/persistence/indexeddb';
import {
    createLearnerRecord,
    type LearnerEvent,
} from '../../src/academy/domain/learner-record';
import { projectCharacterDirectory } from '../../src/academy/domain/progress-projections';

describe('Academy IndexedDB persistence', () => {
    it('recovers a corrupt checkpoint without discarding learner events or blocking boot', async () => {
        const fallback = {
            schemaVersion: 2 as const,
            route: 'access' as const,
            routeHistory: [],
            presentationMode: 'story' as const,
            updatedAt: 123,
        };
        const save = vi.fn(async () => undefined);

        await expect(loadAcademyCheckpointSafely({
            load: async () => { throw new TypeError('corrupt checkpoint'); },
            save,
        }, fallback)).resolves.toEqual(fallback);
        expect(save).toHaveBeenCalledWith(fallback);

        await expect(loadAcademyCheckpointSafely({
            load: async () => { throw new TypeError('corrupt checkpoint'); },
            save: async () => { throw new Error('read-only storage'); },
        }, fallback)).resolves.toEqual(fallback);
    });

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
                accountRequired: false,
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
                accountRequired: false,
                source: 'local-qa',
            },
            updatedAt: 101,
        });

        expect(await persistence.checkpoint.load()).toMatchObject({ route: 'day-end' });
        expect(await persistence.events.readAll()).toEqual([]);
        persistence.close();
    });

    it('persists authored-week cursors outside route history and rejects malformed cursor data', async () => {
        const persistence = await openAcademyPersistence(fakeIndexedDB, `academy-test-${crypto.randomUUID()}`);
        await persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'classroom',
            routeHistory: [],
            presentationMode: 'story',
            authoredWeekProgress: {
                'l1-l01': {
                    sourceSha256: '0'.repeat(64),
                    position: { phase: 'question', activityId: 'authored:l1-l01/ex-input-job' },
                },
            },
            updatedAt: 101,
        });

        expect(await persistence.checkpoint.load()).toMatchObject({
            route: 'classroom',
            authoredWeekProgress: {
                'l1-l01': {
                    sourceSha256: '0'.repeat(64),
                    position: { phase: 'question', activityId: 'authored:l1-l01/ex-input-job' },
                },
            },
        });
        await expect(persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'classroom',
            routeHistory: [],
            presentationMode: 'story',
            authoredWeekProgress: {
                'l1-l01': {
                    sourceSha256: '0'.repeat(64),
                    position: { phase: 'question', activityId: '' },
                },
            },
            updatedAt: 102,
        })).rejects.toThrow('invalid authored week progress');
        persistence.close();
    });

    it('persists classroom-expression progress and rejects malformed session snapshots', async () => {
        const persistence = await openAcademyPersistence(fakeIndexedDB, `academy-test-${crypto.randomUUID()}`);
        const classroomExpressionProgress = {
            schemaVersion: 1 as const,
            sessionId: 'session:lesson-zero-classroom-expressions' as const,
            status: 'paused' as const,
            cursor: {
                phaseId: 'understanding-and-repair' as const,
                expressionId: 'classroom-08',
                probeId: 'probe:classroom-08-check',
            },
            attempts: [{
                probeId: 'probe:classroom-08-check',
                sourceQuestionId: 'question:lesson-zero-classroom-08',
                outcome: 'lapse' as const,
                independent: true,
                at: 100,
            }],
            passedProbeIds: [],
            revealedModelProbeIds: [],
            visitedExpressionIds: ['classroom-08'],
        };
        await persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'source-activity',
            routeHistory: [],
            presentationMode: 'story',
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-reconstruct-repair',
            classroomExpressionProgress,
            updatedAt: 101,
        });

        expect(await persistence.checkpoint.load()).toMatchObject({ classroomExpressionProgress });
        await expect(persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'source-activity',
            routeHistory: [],
            presentationMode: 'story',
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-reconstruct-repair',
            classroomExpressionProgress: {
                ...classroomExpressionProgress,
                attempts: [{ ...classroomExpressionProgress.attempts[0], at: -1 }],
            },
            updatedAt: 102,
        })).rejects.toThrow('invalid classroom-expression progress');
        persistence.close();
    });

    it('persists embodied classroom-instruction progress and rejects unknown actions', async () => {
        const persistence = await openAcademyPersistence(fakeIndexedDB, `academy-test-${crypto.randomUUID()}`);
        const classroomInstructionProgress = {
            schemaVersion: 1 as const,
            sessionId: 'session:lesson-zero-follow-instructions' as const,
            status: 'paused' as const,
            cursor: 1,
            passedCueIds: ['cue:lesson-zero-instruction:look'],
            attempts: [{
                cueId: 'cue:lesson-zero-instruction:look',
                chosenActionId: 'look' as const,
                outcome: 'pass' as const,
                at: 100,
            }],
        };
        await persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'source-activity',
            routeHistory: [],
            presentationMode: 'story',
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-follow-instructions',
            classroomInstructionProgress,
            updatedAt: 101,
        });

        expect(await persistence.checkpoint.load()).toMatchObject({ classroomInstructionProgress });
        await expect(persistence.checkpoint.save({
            schemaVersion: 2,
            route: 'source-activity',
            routeHistory: [],
            presentationMode: 'story',
            lessonId: 'lesson:foundation-00',
            activityId: 'activity:lesson-zero-follow-instructions',
            classroomInstructionProgress: {
                ...classroomInstructionProgress,
                attempts: [{ ...classroomInstructionProgress.attempts[0], chosenActionId: 'teleport' as never }],
            },
            updatedAt: 102,
        })).rejects.toThrow('invalid classroom-instruction progress');
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
                accountRequired: true,
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
                accountRequired: true,
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
                    accountRequired: true,
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

    it('restores an encountered classmate as a journal and roster unlock after reopening', async () => {
        const name = `academy-test-${crypto.randomUUID()}`;
        const persistence = await openAcademyPersistence(fakeIndexedDB, name);
        const record = createLearnerRecord({ repository: persistence.events, now: () => 100 });
        await record.record({
            kind: 'characters-encountered',
            eventId: 'encounter:class-week:l1-l01',
            encounterId: 'class-week:l1-l01',
            sceneId: 'scene:class-week:l1-l01',
            attendeeIds: ['aakash'],
        });
        persistence.close();

        const restored = await openAcademyPersistence(fakeIndexedDB, name);
        const projection = await createLearnerRecord({ repository: restored.events }).snapshot();
        const aakash = projectCharacterDirectory(projection).find(character => character.characterId === 'aakash');

        expect(projection.encounteredCharacters.aakash).toEqual({
            encounterIds: ['class-week:l1-l01'],
            sceneIds: ['scene:class-week:l1-l01'],
        });
        expect(aakash).toMatchObject({
            unlocked: true,
            portrait: '/academy/art/characters/aakash/aakash__sprite__neutral__front-near-front__v009.png',
            revisitPaths: [{
                encounterId: 'class-week:l1-l01',
                kind: 'class-week',
                targetId: 'l1-l01',
            }],
        });
        restored.close();
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
