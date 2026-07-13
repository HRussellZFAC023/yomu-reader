import {
    createLearnerRecord,
    createMemoryLearnerEventRepository,
    type LearnerEvent,
} from '../../src/academy/domain/learner-record';

describe('learner record', () => {
    it('serializes concurrent writes and derives learning, story, bond and profile projections', async () => {
        const ids = ['event-1', 'event-2', 'event-3', 'event-4'];
        let time = 100;
        const record = createLearnerRecord({
            now: () => time++,
            createEventId: () => ids.shift() ?? 'unexpected',
        });

        await Promise.all([
            record.record({
                kind: 'attempt-recorded',
                activityId: 'repair-please-repeat',
                sourceQuestionId: 'source:q1',
                conceptIds: ['repair-language'],
                responseKind: 'choice',
                outcome: 'lapse',
                errorTags: ['register'],
            }),
            record.record({
                kind: 'attempt-recorded',
                activityId: 'repair-please-repeat',
                sourceQuestionId: 'source:q1',
                conceptIds: ['repair-language'],
                responseKind: 'choice',
                outcome: 'pass',
                score: 1,
            }),
            record.record({ kind: 'scene-completed', sceneId: 'opening-rie' }),
            record.record({ kind: 'bond-changed', characterId: 'rie', delta: 1 }),
        ]);
        await record.record({
            kind: 'profile-changed',
            profile: {
                displayName: 'Haru',
                learningReason: 'Read novels',
                portraitId: 'quality-3',
            },
        });

        const history = await record.history();
        const projection = await record.snapshot();
        expect(history.map(event => event.eventId)).toEqual(['event-1', 'event-2', 'event-3', 'event-4', 'unexpected']);
        expect(projection.activities['repair-please-repeat']).toMatchObject({
            attemptCount: 2,
            lapseCount: 1,
            lastOutcome: 'pass',
        });
        expect(projection.completedScenes).toEqual(['opening-rie']);
        expect(projection.bonds.rie).toBe(1);
        expect(projection.profile?.displayName).toBe('Haru');
    });

    it('accepts an idempotent replay and rejects a conflicting event id', async () => {
        const event: LearnerEvent = {
            schemaVersion: 1,
            eventId: 'same-event',
            at: 1,
            kind: 'scene-completed',
            sceneId: 'opening',
        };
        const repository = createMemoryLearnerEventRepository([event]);
        await expect(repository.append([structuredClone(event)])).resolves.toBeUndefined();
        await expect(repository.append([{ ...event, sceneId: 'different' }])).rejects.toThrow('Conflicting learner event id');
        expect(await repository.readAll()).toHaveLength(1);
    });

    it('rejects empty profile identity fields', async () => {
        const record = createLearnerRecord();
        await expect(record.record({
            kind: 'profile-changed',
            profile: {
                displayName: '',
                learningReason: 'Read novels',
                portraitId: 'quality-3',
            },
        })).rejects.toThrow('profile.displayName');
    });

    it('keeps placement evidence separate from curriculum entry and story completion', async () => {
        const record = createLearnerRecord();
        await record.record({
            kind: 'placement-assessed',
            assessmentId: 'orientation:v1',
            targetBand: 'n3',
            itemIds: ['knowledge:1', 'reading:1', 'listening:1'],
            scores: {
                'language-knowledge': 0.8,
                reading: 0.6,
                listening: 0.4,
                'speaking-confidence': 0.5,
                'writing-confidence': 0.3,
            },
            recommendedBand: 'n4',
            calibration: 'vertical-slice',
        });
        await record.record({
            kind: 'curriculum-entry-chosen',
            route: 'placement-mock',
            band: 'n4',
            recommendationAccepted: true,
        });

        const projection = await record.snapshot();
        expect(projection.latestPlacement?.recommendedBand).toBe('n4');
        expect(projection.curriculumEntry?.band).toBe('n4');
        expect(projection.completedScenes).toEqual([]);
    });

    it('projects collection undo, day closure, and ceremony-seen facts without deriving achievement truth', async () => {
        const record = createLearnerRecord();
        const collected = await record.record({
            kind: 'vocabulary-collected',
            eventId: 'collection:add',
            collectionItemId: 'word:駅',
            expression: '駅',
            reading: 'えき',
            meanings: ['station'],
            provenance: { origin: 'academy', encounterId: 'encounter:1', activityId: 'lesson:1' },
        });
        await record.record({
            kind: 'vocabulary-collection-undone',
            eventId: 'collection:undo',
            collectionItemId: 'word:駅',
            collectedEventId: collected.eventId,
        });
        await record.record({
            kind: 'academy-day-closed',
            eventId: 'day:1:closed',
            dayId: 'day:1',
            mainLessonCompleted: true,
            optionalActivityIds: ['listen'],
            elapsedMs: 900_000,
        });
        await record.record({
            kind: 'achievement-ceremony-seen',
            eventId: 'ceremony:1',
            achievementId: 'kana-hiragana-recall',
            tier: 'bronze',
        });
        await record.record({
            kind: 'relationship-chapter-unlocked',
            eventId: 'relationship:rie:1',
            characterId: 'rie',
            chapter: 1,
            majorTurn: 'recognition',
        });
        const projection = await record.snapshot();
        expect(projection.vocabularyCollection).toEqual({});
        expect(projection.closedDays['day:1']?.optionalActivityIds).toEqual(['listen']);
        expect(projection.seenAchievementCeremonies).toEqual(['kana-hiragana-recall:bronze']);
        expect(projection.relationshipJournal.rie).toEqual({ chapters: [1], majorTurns: ['recognition'] });
    });
});
