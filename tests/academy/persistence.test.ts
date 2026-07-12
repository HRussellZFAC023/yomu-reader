import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';
import { openAcademyPersistence } from '../../src/academy/persistence/indexeddb';
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
            schemaVersion: 1,
            route: 'campus',
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
        expect(await restored.checkpoint.load()).toMatchObject({ route: 'campus', selectedFork: 'sound' });
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
