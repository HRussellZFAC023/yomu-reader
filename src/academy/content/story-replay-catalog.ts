import type { ReviewSeed } from '../domain/activity-runtime';
import type { ReplaySceneDefinition } from '../domain/story-replay-projection';
import type { StoryPractice } from './n3-story-practice';

/**
 * Replay registration is deliberately narrower than canon. Each entry names a
 * completed authored scene and the exact activities whose evidence may supply
 * its practice concepts. New plot cannot enter by adding a replay row.
 */
const OPENING_ARC_REPLAY_SCENES: readonly ReplaySceneDefinition[] = Object.freeze([
    replayScene(
        'replay:blank-atlas:arrival-greetings',
        'scene:blank-atlas:arrival-greetings',
        ['activity:lesson-zero-greet-rie'],
    ),
    replayScene(
        'replay:blank-atlas:sound-script-map',
        'scene:blank-atlas:sound-script-map',
        ['activity:lesson-zero-vowel-listen', 'activity:lesson-zero-vowel-doodle'],
    ),
    replayScene(
        'replay:blank-atlas:classroom-survival',
        'scene:blank-atlas:classroom-survival',
        [
            'activity:lesson-zero-follow-instructions',
            'activity:lesson-zero-reconstruct-repair',
            'activity:lesson-zero-desk-language',
        ],
    ),
    replayScene(
        'replay:blank-atlas:sentence-frames',
        'scene:blank-atlas:sentence-frames',
        ['activity:lesson-zero-build-sentence-frames', 'activity:lesson-zero-name-card-draft'],
    ),
    replayScene(
        'replay:blank-atlas:transfer',
        'scene:blank-atlas:transfer',
        [
            'activity:lesson-zero-sound-transfer',
            'activity:lesson-zero-text-transfer',
            'activity:lesson-zero-speaking-transfer',
            'activity:lesson-zero-written-transfer',
        ],
    ),
]);

export const N3_BATCH_REPLAY_SCENES: readonly ReplaySceneDefinition[] = Object.freeze([
    n3Replay('s3e01-after-the-applause', 'activity:story-n3:after-applause-tone'),
    n3Replay('s3e02-caption-without-owner', 'activity:story-n3:caption-provenance'),
    n3Replay('s3e03-helpful-rewrite', 'activity:story-n3:voice-preserving-edit'),
    n3Replay('s3e04-terms-of-invitation', 'activity:story-n3:invitation-scope'),
    n3Replay('s3e05-chair-not-reserved', 'activity:story-n3:opt-in-seat'),
    n3Replay('s3e06-two-schedules', 'activity:story-n3:conditional-schedule'),
]);

export const STORY_REPLAY_SCENES: readonly ReplaySceneDefinition[] = Object.freeze([
    ...OPENING_ARC_REPLAY_SCENES,
    ...N3_BATCH_REPLAY_SCENES,
]);

/**
 * A passed selected response seeds the answer the learner recognized into
 * Yomu's actual SRS queue. The replay catalog owns this
 * bridge so story practice never needs a parallel, in-memory scheduler.
 */
export function storyReplayReviewSeed(practice: StoryPractice): ReviewSeed {
    const answer = practice.options.find(option => option.id === practice.correctOptionId);
    if (!answer) throw new TypeError(`Story practice ${practice.activityId} has no correct answer.`);
    const conceptId = practice.conceptIds[0];
    if (!conceptId) throw new TypeError(`Story practice ${practice.activityId} has no review concept.`);
    return Object.freeze({
        id: `review:story-replay:${practice.activityId}`,
        conceptId,
        reason: 'new-learning',
        sourceQuestionId: practice.activityId,
        content: Object.freeze({
            expression: answer.label.ja,
            meanings: Object.freeze([answer.label.en]),
            sentence: practice.prompt.ja,
        }),
    });
}

function replayScene(
    id: string,
    completionSceneId: string,
    activityIds: readonly string[],
): ReplaySceneDefinition {
    return Object.freeze({
        id,
        chapterId: 's1e01-the-blank-atlas',
        completionSceneId,
        introducedAt: 'foundation',
        // The source package explicitly permits its N5 layer as a New Game+
        // memory after the introductory playthrough.
        availableLanguageBands: Object.freeze(['foundation', 'n5', 'ngPlus'] as const),
        conceptIds: Object.freeze([]),
        activityIds: Object.freeze([...activityIds]),
        lessonId: 'lesson:foundation-00',
    });
}

function n3Replay(chapterId: string, activityId: string): ReplaySceneDefinition {
    return Object.freeze({
        id: `replay:${chapterId}:n2`,
        chapterId,
        completionSceneId: `scene:${chapterId}`,
        introducedAt: 'n3',
        availableLanguageBands: Object.freeze(['n3', 'n2'] as const),
        conceptIds: Object.freeze([]),
        activityIds: Object.freeze([activityId]),
    });
}
