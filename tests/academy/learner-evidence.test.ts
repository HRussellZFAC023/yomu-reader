import { constructedResponseActivityPlugin } from '../../src/academy/activities/constructed-response';
import { createAakashDirectionsActivity, AAKASH_RAINY_DIRECTIONS_SCENE_ID } from '../../src/academy/content/aakash-meet';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { createMemoryLearnerEventRepository } from '../../src/academy/domain/learner-record';
import { createLearnerEvidence } from '../../src/academy/evidence/learner-evidence';
import type { ReviewQueueService } from '../../src/academy/integration/yomu-bridge';

function reviewService(): ReviewQueueService {
    return {
        async ingest() {},
        async due() { return []; },
        async rate() {},
    };
}

describe('learner evidence deep module', () => {
    it('makes profile unlock milestones idempotent across profile edits', async () => {
        const repository = createMemoryLearnerEventRepository();
        const evidence = createLearnerEvidence(repository, reviewService());
        await evidence.initialize();
        await expect(evidence.saveProfile({
            displayName: 'Riku',
            learningReason: 'Read novels',
            portraitId: 'quality-2',
        })).resolves.toEqual({ firstIntroduction: true });
        await expect(evidence.saveProfile({
            displayName: 'Riku',
            learningReason: 'Read novels and speak with friends',
            portraitId: 'quality-3',
        })).resolves.toEqual({ firstIntroduction: false });

        expect(evidence.projection.bonds.rie).toBe(1);
        expect(evidence.projection.unlockedAssets).toContain('character:rie');
        expect((await repository.readAll()).filter(event => event.kind === 'bond-changed')).toHaveLength(1);
    });

    it('schedules one review and awards one bond when a milestone evaluation is retried', async () => {
        const repository = createMemoryLearnerEventRepository();
        const evidence = createLearnerEvidence(repository, reviewService());
        await evidence.initialize();
        const runtime = createActivityRuntime([constructedResponseActivityPlugin]);
        const evaluation = runtime.evaluate(createAakashDirectionsActivity(), 'この道をまっすぐ行って、右です。');
        const milestone = {
            id: 'aakash-rainy-directions',
            sceneId: AAKASH_RAINY_DIRECTIONS_SCENE_ID,
            unlock: { assetId: 'character:aakash', characterId: 'aakash', bondDelta: 1 },
        } as const;

        await evidence.recordActivity(evaluation, milestone);
        await evidence.recordActivity(evaluation, milestone);

        expect(evidence.projection.bonds.aakash).toBe(1);
        expect(evidence.projection.relationshipJournal.aakash).toEqual({
            chapters: [1],
            majorTurns: ['recognition'],
        });
        expect(evidence.projection.completedScenes).toContain(AAKASH_RAINY_DIRECTIONS_SCENE_ID);
        const events = await repository.readAll();
        expect(events.filter(event => event.kind === 'review-scheduled')).toHaveLength(1);
        expect(events.filter(event => event.kind === 'bond-changed' && event.characterId === 'aakash')).toHaveLength(1);
        expect(events.filter(event => event.kind === 'relationship-chapter-unlocked' && event.characterId === 'aakash')).toHaveLength(1);
        expect(events.filter(event => event.kind === 'attempt-recorded')).toHaveLength(2);
    });

    it('records earned support use as neutral evidence, not a wrong attempt or progress', async () => {
        const repository = createMemoryLearnerEventRepository();
        const evidence = createLearnerEvidence(repository, reviewService());
        await evidence.initialize();
        await evidence.recordSupportUse('activity:listening-1', 'transcript', 'choice:replay');

        expect(evidence.projection.supportUses).toEqual([expect.objectContaining({
            kind: 'support-used',
            activityId: 'activity:listening-1',
            supportKind: 'transcript',
            choiceId: 'choice:replay',
        })]);
        expect(evidence.projection.activities).toEqual({});
        expect((await repository.readAll()).filter(event => event.kind === 'attempt-recorded')).toHaveLength(0);
    });
});
