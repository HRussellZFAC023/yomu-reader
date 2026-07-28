import { constructedResponseActivityPlugin } from '../../src/academy/activities/constructed-response';
import { createAakashDirectionsActivity, AAKASH_RAINY_DIRECTIONS_SCENE_ID } from '../../src/academy/content/aakash-meet';
import { createMegaPackLessonOneBeats } from '../../src/academy/content/mega-pack-lesson-one';
import { N3_ADVANCED_ENTRY_SOURCE_ID } from '../../src/academy/content/advanced-entry';
import { createLessonThirtyTwoMinna074ListeningBeat } from '../../src/academy/content/lesson-thirty-two-minna-074-listening';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { createMemoryLearnerEventRepository } from '../../src/academy/domain/learner-record';
import { projectWorldPlace } from '../../src/academy/domain/world-locations';
import { completedWorldPracticeEvaluation } from '../../src/academy/domain/world-practice-evidence';
import { createLearnerEvidence } from '../../src/academy/evidence/learner-evidence';
import { projectCharacterDirectory } from '../../src/academy/domain/progress-projections';
import type { ReviewQueueService } from '../../src/academy/integration/yomu-bridge';
import { createAcademyActivityRuntime } from '../../src/academy/minigames';
import type { SentenceBuilderModel } from '../../src/academy/minigames/sentence-builder';
import type { MinnaTrueFalseListeningModel } from '../../src/academy/minigames/minna-true-false-listening';
import { groundedLessonForEvaluation, staticGroundedLessonResolver } from './fixtures/grounded-lesson';

function reviewService(): ReviewQueueService {
    return {
        async ingest() {},
        async due() { return []; },
        async rate() {},
    };
}

describe('learner evidence deep module', () => {
    it('records the Rie introduction only after it happens and keeps the milestone idempotent', async () => {
        const repository = createMemoryLearnerEventRepository();
        const evidence = createLearnerEvidence(repository, reviewService());
        await evidence.initialize();
        await expect(evidence.saveProfile({
            displayName: 'Riku',
            learningReason: 'Read novels',
            portraitId: 'quality-2',
        })).resolves.toEqual({ firstIntroduction: true });

        expect(evidence.projection.bonds.rie).toBeUndefined();
        expect(evidence.projection.unlockedAssets).not.toContain('character:rie');
        expect(evidence.projection.completedEncounterIds).not.toContain('opening-rie-introduction');
        expect((await repository.readAll()).filter(event => event.kind === 'characters-encountered')).toHaveLength(0);

        await expect(evidence.completeRieIntroduction()).resolves.toEqual({ recorded: true });
        await expect(evidence.saveProfile({
            displayName: 'Riku',
            learningReason: 'Read novels and speak with friends',
            portraitId: 'quality-3',
        })).resolves.toEqual({ firstIntroduction: false });
        await expect(evidence.completeRieIntroduction()).resolves.toEqual({ recorded: false });

        expect(evidence.projection.bonds.rie).toBe(1);
        expect(evidence.projection.unlockedAssets).toContain('character:rie');
        expect(evidence.projection.completedEncounterIds).toContain('opening-rie-introduction');
        expect((await repository.readAll()).filter(event => event.kind === 'bond-changed')).toHaveLength(1);
        expect((await repository.readAll()).filter(event => event.kind === 'characters-encountered')).toHaveLength(1);
        expect((await repository.readAll()).filter(event => event.kind === 'scene-completed')).toHaveLength(1);
    });

    it('schedules one review and awards one bond when a milestone evaluation is retried', async () => {
        const repository = createMemoryLearnerEventRepository();
        const runtime = createActivityRuntime([constructedResponseActivityPlugin]);
        const evaluation = runtime.evaluate(createAakashDirectionsActivity(), 'この道をまっすぐ行って、右です。');
        const lesson = groundedLessonForEvaluation(evaluation);
        const evidence = createLearnerEvidence(repository, reviewService(), staticGroundedLessonResolver(lesson));
        await evidence.initialize();
        const milestone = {
            id: 'aakash-rainy-directions',
            sceneId: AAKASH_RAINY_DIRECTIONS_SCENE_ID,
            unlock: { assetId: 'character:aakash', characterId: 'aakash', bondDelta: 1 },
            journalLine: {
                lineId: 'journal:aakash:rainy-directions',
                characterId: 'aakash',
                text: { ja: '雨の中で道を案内できた。', en: 'I gave directions in the rain.' },
            },
        } as const;

        await evidence.recordActivity(evaluation, lesson.lessonId, milestone);
        await evidence.recordActivity(evaluation, lesson.lessonId, milestone);

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
        expect(events.filter(event => event.kind === 'journal-line-recorded')).toEqual([
            expect.objectContaining({
                journalLineId: 'journal:aakash:rainy-directions',
                activityId: evaluation.attempt.activityId,
            }),
        ]);
        expect(evidence.projection.journalLines['journal:aakash:rainy-directions']?.text.en)
            .toBe('I gave directions in the rain.');
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

    it('records a completed world replay as a reviewable attempt without claiming a lesson completion', async () => {
        const repository = createMemoryLearnerEventRepository();
        const ingest = vi.fn(async () => undefined);
        const evidence = createLearnerEvidence(repository, {
            ...reviewService(),
            ingest,
        });
        const evaluation = completedWorldPracticeEvaluation(
            projectWorldPlace('cafe', { completedScenes: [], completedEncounterIds: [] }).practice!,
        )!;
        await evidence.initialize();

        await evidence.recordWorldPractice?.(evaluation);
        await evidence.recordWorldPractice?.(evaluation);

        expect(ingest).toHaveBeenCalledWith(evaluation.reviewSeeds);
        const events = await repository.readAll();
        expect(events.filter(event => event.kind === 'attempt-recorded')).toHaveLength(2);
        expect(events.filter(event => event.kind === 'review-scheduled')).toEqual([
            expect.objectContaining({
                conceptId: 'concept:world:cafe:coffee-price',
                provenance: { activity: 'activity:world:cafe-coffee-price' },
            }),
        ]);
        expect(evidence.projection.completedScenes).toEqual([]);
    });

    it('records a package-scoped authored-week extension and rejects another package namespace', async () => {
        const repository = createMemoryLearnerEventRepository();
        const evidence = createLearnerEvidence(repository, reviewService());
        await evidence.initialize();
        const activity = createMegaPackLessonOneBeats()[0].activity as SentenceBuilderModel;
        const evaluation = createAcademyActivityRuntime().evaluate(activity, {
            order: activity.payload.correctOrder,
        });

        await expect(evidence.recordActivity(evaluation, 'authored-week:l1-l01')).resolves.toBeUndefined();
        await expect(evidence.recordActivity({
            ...evaluation,
            attempt: { ...evaluation.attempt, activityId: 'activity:l1-l010-spoofed' },
        }, 'authored-week:l1-l01')).rejects.toThrow('does not belong to authored-week:l1-l01');
        expect((await repository.readAll()).filter(event => event.kind === 'attempt-recorded')).toHaveLength(1);
    });

    it('records source-owned adaptive entry evidence without completing plot or encounters', async () => {
        const repository = createMemoryLearnerEventRepository();
        const evidence = createLearnerEvidence(repository, reviewService());
        await evidence.initialize();
        const activity = createLessonThirtyTwoMinna074ListeningBeat().activity as MinnaTrueFalseListeningModel;
        const evaluation = createAcademyActivityRuntime().evaluate(activity, {
            answers: activity.payload.tasks.map(task => ({ taskId: task.id, mark: task.correctMark })),
        });

        await evidence.recordActivity(evaluation, 'authored-week:l2-l07', undefined, {
            modeId: 'advanced-entry:n3:guided',
            skill: 'listening',
            action: 'listen',
            sourceId: N3_ADVANCED_ENTRY_SOURCE_ID,
            independent: false,
        });

        expect(await repository.readAll()).toEqual(expect.arrayContaining([
            expect.objectContaining({
                kind: 'learning-evidence-recorded',
                activityId: activity.id,
                modeId: 'advanced-entry:n3:guided',
                sourceId: N3_ADVANCED_ENTRY_SOURCE_ID,
                independent: false,
                outcome: 'pass',
            }),
        ]));
        expect(evidence.projection.completedScenes).toEqual([]);
        expect(evidence.projection.completedEncounterIds).toEqual([]);
    });

    it('unlocks a single grounded encounter in the canonical directory with its approved portrait', async () => {
        const repository = createMemoryLearnerEventRepository();
        const evidence = createLearnerEvidence(repository, reviewService());
        await evidence.initialize();

        await evidence.recordEncounter({
            encounterId: 'story:rainy-directions',
            sceneId: 'scene:rainy-directions',
            attendeeIds: ['aakash'],
        });

        expect(evidence.projection.encounteredCharacters.aakash).toEqual({
            encounterIds: ['story:rainy-directions'],
            sceneIds: ['scene:rainy-directions'],
        });
        expect(projectCharacterDirectory(evidence.projection).find(character => character.characterId === 'aakash'))
            .toMatchObject({ unlocked: true, portrait: '/academy/art/characters/aakash/aakash__neutral-route-map-burgundy-hoodie__front-near-front__fullbody__v010.png' });
    });

    it('unlocks exactly the attendees of a completed class-wide introduction', async () => {
        const repository = createMemoryLearnerEventRepository();
        const evidence = createLearnerEvidence(repository, reviewService());
        await evidence.initialize();

        await evidence.recordEncounter({
            encounterId: 'class-week:l1-l01',
            sceneId: 'scene:class-week:l1-l01',
            attendeeIds: ['aakash', 'peter'],
        });

        expect(Object.keys(evidence.projection.encounteredCharacters).sort()).toEqual(['aakash', 'peter']);
        expect(projectCharacterDirectory(evidence.projection).find(character => character.characterId === 'xingyu')?.unlocked).toBe(false);
    });

    it('does not append a second unlock when an encounter is replayed', async () => {
        const repository = createMemoryLearnerEventRepository();
        const evidence = createLearnerEvidence(repository, reviewService());
        await evidence.initialize();
        const encounter = {
            encounterId: 'story:rainy-directions',
            sceneId: 'scene:rainy-directions',
            attendeeIds: ['aakash'],
        } as const;

        await evidence.recordEncounter(encounter);
        await evidence.recordEncounter(encounter);

        expect((await repository.readAll()).filter(event => event.kind === 'characters-encountered')).toHaveLength(1);
        expect(evidence.projection.encounteredCharacters.aakash?.encounterIds).toEqual(['story:rainy-directions']);
    });
});
