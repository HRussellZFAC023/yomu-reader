import { LANTERN_ATLAS_CANON } from '../../src/academy/content/lantern-atlas-canon';
import { projectStoryProgression } from '../../src/academy/domain/story-progression';
import {
    projectDailyReplayPractice,
    replayLanguageBands,
    projectWeeklyReplayPractice,
    type ReplaySceneDefinition,
} from '../../src/academy/domain/story-replay-projection';
import { N3_BATCH_REPLAY_SCENES } from '../../src/academy/content/story-replay-catalog';
import type { LearnerEvent } from '../../src/academy/domain/learner-record';

const DAY = 86_400_000;

const replayScenes: readonly ReplaySceneDefinition[] = [
    {
        id: 'replay:blank-atlas:greeting',
        chapterId: 's1e01-the-blank-atlas',
        completionSceneId: 'scene:story:s1e01-the-blank-atlas',
        introducedAt: 'foundation',
        availableLanguageBands: ['foundation', 'n5', 'n4'],
        conceptIds: ['concept:greeting'],
    },
    {
        id: 'replay:margin-map:kana',
        chapterId: 's1e02-margin-map',
        completionSceneId: 'scene:story:s1e02-margin-map',
        introducedAt: 'foundation',
        availableLanguageBands: ['foundation', 'n5', 'n4'],
        conceptIds: ['concept:kana'],
    },
];

describe('finite Lantern Atlas canon', () => {
    it('has four fixed twelve-chapter seasons and a single ending', () => {
        expect(LANTERN_ATLAS_CANON.chapters).toHaveLength(48);
        expect(LANTERN_ATLAS_CANON.chapters.map(chapter => chapter.season)).toEqual([
            ...Array(12).fill(1), ...Array(12).fill(2), ...Array(12).fill(3), ...Array(12).fill(4),
        ]);
        expect(LANTERN_ATLAS_CANON.finalChapterId).toBe('s4e12-next-page');
        expect(LANTERN_ATLAS_CANON.postgameRule).toBe('practice-memories-and-authored-alumni-only');
    });

    it('accepts only a contiguous canonical prefix, so an out-of-order record cannot counterfeit graduation', () => {
        const sparse = projectStoryProgression([
            storyEncounter('s4e12-next-page', 1),
            storyEncounter('s1e02-margin-map', 2),
            storyEncounter('s1e01-the-blank-atlas', 3),
        ]);

        expect(sparse).toMatchObject({
            recordedChapterIds: ['s1e01-the-blank-atlas', 's1e02-margin-map', 's4e12-next-page'],
            completedChapterIds: ['s1e01-the-blank-atlas', 's1e02-margin-map'],
            nextChapter: { id: 's1e03-route-zero' },
            state: 'in-progress',
            canonicalWritesFromReplay: false,
        });

        const graduation = projectStoryProgression(LANTERN_ATLAS_CANON.chapters.map((chapter, index) =>
            storyEncounter(chapter.id, index + 1)));
        expect(graduation).toMatchObject({
            completedChapterCount: 48,
            nextChapter: null,
            state: 'graduated',
            replayAvailable: true,
        });
    });
});

describe('story replay practice projection', () => {
    it('returns a due SRS callback and a higher-language memory, both anchored to completed canon and mastered material', () => {
        const now = DAY * 10;
        const day = projectDailyReplayPractice([
            storyEncounter('s1e01-the-blank-atlas', 1),
            storyEncounter('s1e02-margin-map', 2),
            sceneCompleted('scene:story:s1e01-the-blank-atlas', 3),
            sceneCompleted('scene:story:s1e02-margin-map', 4),
            ...mastery('concept:greeting', 10),
            ...mastery('concept:kana', 20),
            reviewScheduled('review:greeting', 'concept:greeting', now - 1, 40),
        ], replayScenes, { now, targetLanguageBand: 'n4' });

        expect(day).toMatchObject({ localDay: '1970-01-11' });
        expect(day.tasks).toEqual(expect.arrayContaining([
            expect.objectContaining({
                kind: 'srs-callback',
                sceneId: 'replay:blank-atlas:greeting',
                reviewItemId: 'review:greeting',
                languageBand: 'n4',
            }),
            expect.objectContaining({
                kind: 'slice-of-life',
                sceneId: 'replay:margin-map:kana',
                languageBand: 'n4',
            }),
        ]));
        expect(day.tasks.every(task => task.practiceMemory && !task.canonicalWrites)).toBe(true);
    });

    it('exposes only authored higher New Game+ layers and never the introductory layer again', () => {
        expect(replayLanguageBands(N3_BATCH_REPLAY_SCENES)).toEqual(['n2']);
        expect(replayLanguageBands([
            { ...replayScenes[0]!, availableLanguageBands: ['foundation', 'n5', 'ngPlus'] },
            ...N3_BATCH_REPLAY_SCENES,
        ])).toEqual(['n5', 'n2', 'ngPlus']);
    });

    it('does not manufacture practice from a completed scene when its content is not mastered', () => {
        const now = DAY * 10;
        const day = projectDailyReplayPractice([
            storyEncounter('s1e01-the-blank-atlas', 1),
            sceneCompleted('scene:story:s1e01-the-blank-atlas', 2),
            evidence('concept:greeting', now - DAY, 'pass', 3),
            evidence('concept:greeting', now, 'lapse', 4),
            reviewScheduled('review:greeting', 'concept:greeting', now - 1, 5),
        ], replayScenes, { now, targetLanguageBand: 'n5' });

        expect(day.tasks).toEqual([]);
    });

    it('is deterministic across a week and never repeats a scene or SRS item inside the generated week', () => {
        const now = DAY * 10 + 42;
        const events: readonly LearnerEvent[] = [
            storyEncounter('s1e01-the-blank-atlas', 1),
            storyEncounter('s1e02-margin-map', 2),
            sceneCompleted('scene:story:s1e01-the-blank-atlas', 3),
            sceneCompleted('scene:story:s1e02-margin-map', 4),
            ...mastery('concept:greeting', 10),
            ...mastery('concept:kana', 20),
            reviewScheduled('review:greeting', 'concept:greeting', now - 1, 40),
        ];
        const first = projectWeeklyReplayPractice(events, replayScenes, { now, targetLanguageBand: 'n5' });
        const second = projectWeeklyReplayPractice(events, replayScenes, { now, targetLanguageBand: 'n5' });
        const tasks = first.flatMap(day => day.tasks);

        expect(first).toEqual(second);
        expect(tasks.map(task => task.sceneId)).toEqual([...new Set(tasks.map(task => task.sceneId))]);
        expect(tasks.flatMap(task => task.reviewItemId ?? [])).toEqual([...new Set(tasks.flatMap(task => task.reviewItemId ?? []))]);
    });

    it('lets a recorded later N3 scene become a higher-layer memory without backfilling earlier canon', () => {
        const now = DAY * 10;
        const plan = projectDailyReplayPractice([
            storySceneEncounter('s3e04-terms-of-invitation', 1),
            ...masteryForActivity('activity:story-n3:invitation-scope', 'concept:story-n3:consent-scope', 10),
            reviewScheduled('review:n3-consent', 'concept:story-n3:consent-scope', now - 1, 50),
        ], N3_BATCH_REPLAY_SCENES, { now, targetLanguageBand: 'n2' });

        expect(plan.tasks).toEqual([expect.objectContaining({
            kind: 'srs-callback',
            chapterId: 's3e04-terms-of-invitation',
            languageBand: 'n2',
            canonicalWrites: false,
        })]);
    });
});

function storyEncounter(chapterId: string, eventId: number): LearnerEvent {
    return {
        schemaVersion: 1,
        eventId: `story:${eventId}:${chapterId}`,
        at: eventId,
        kind: 'characters-encountered',
        encounterId: `story:${chapterId}`,
        sceneId: `scene:story:${chapterId}`,
        attendeeIds: ['rie'],
    };
}

function storySceneEncounter(chapterId: string, eventId: number): LearnerEvent {
    return {
        schemaVersion: 1,
        eventId: `story-scene:${eventId}:${chapterId}`,
        at: eventId,
        kind: 'characters-encountered',
        encounterId: `story:${chapterId}:scene:scene:${chapterId}`,
        sceneId: `scene:${chapterId}`,
        attendeeIds: ['mika'],
    };
}

function sceneCompleted(sceneId: string, eventId: number): LearnerEvent {
    return { schemaVersion: 1, eventId: `scene:${eventId}`, at: eventId, kind: 'scene-completed', sceneId };
}

function mastery(conceptId: string, eventOffset: number): readonly LearnerEvent[] {
    return [0, 1, 2].map(index => evidence(conceptId, DAY * (index + 1), 'pass', eventOffset + index));
}

function masteryForActivity(activityId: string, conceptId: string, eventOffset: number): readonly LearnerEvent[] {
    return [0, 1, 2].map(index => ({
        ...evidence(conceptId, DAY * (index + 1), 'pass', eventOffset + index),
        activityId,
        modeId: 'authored-story-n3',
    }));
}

function evidence(
    conceptId: string,
    at: number,
    outcome: 'pass' | 'lapse',
    eventId: number,
): LearnerEvent {
    return {
        schemaVersion: 1,
        eventId: `evidence:${eventId}`,
        at,
        kind: 'learning-evidence-recorded',
        activityId: `activity:${eventId}`,
        modeId: 'story-replay-test',
        skill: 'vocabulary',
        action: 'recall',
        outcome,
        conceptIds: [conceptId],
        independent: true,
    };
}

function reviewScheduled(reviewItemId: string, conceptId: string, dueAt: number, eventId: number): LearnerEvent {
    return {
        schemaVersion: 1,
        eventId: `schedule:${eventId}`,
        at: eventId,
        kind: 'review-scheduled',
        reviewItemId,
        conceptId,
        dueAt,
        provenance: { source: 'story-replay-test' },
    };
}
