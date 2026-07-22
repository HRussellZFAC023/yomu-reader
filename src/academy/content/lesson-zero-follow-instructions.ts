import type { ActivityEvaluation } from '../domain/activity-runtime';
import type {
    ClassroomInstructionActionId,
    ClassroomInstructionCue,
    ClassroomInstructionSessionDefinition,
} from '../domain/classroom-instruction-session';
import type { ClassroomExpressionSessionDefinition } from '../domain/classroom-expression-session';
import type { LocalizedText } from '../domain/source-library';
import type { LessonZeroActivity } from './lesson-zero-schema';
import { lessonZeroCanonicalReading } from './lesson-zero-pedagogy-definitions';

export const LESSON_ZERO_FOLLOW_INSTRUCTION_ACTIVITY_ID =
    'activity:lesson-zero-follow-instructions' as const;

const SOURCE_ACTION_ORDER = Object.freeze([
    'begin',
    'finish',
    'break',
    'look',
    'say-together',
    'listen',
    'write',
] as const);

const CHALLENGE_ACTION_ORDER = Object.freeze([
    'look',
    'begin',
    'write',
    'break',
    'listen',
    'finish',
    'say-together',
] as const);

export const LESSON_ZERO_FOLLOW_INSTRUCTION_CHILD_ACTIVITY_IDS = Object.freeze(
    SOURCE_ACTION_ORDER.map(actionId => `${LESSON_ZERO_FOLLOW_INSTRUCTION_ACTIVITY_ID}:${actionId}`),
);

export interface ClassroomInstructionActionPresentation {
    readonly actionId: ClassroomInstructionActionId;
    readonly glyph: string;
    readonly label: LocalizedText;
    readonly roomReaction: LocalizedText;
}

export const CLASSROOM_INSTRUCTION_ACTION_PRESENTATIONS:
readonly ClassroomInstructionActionPresentation[] = Object.freeze([
    presentation('begin', '始', 'Begin', '始める', 'Class begins.', '授業が始まります。'),
    presentation('finish', '終', 'Finish', '終わる', 'Class is finished.', '授業が終わります。'),
    presentation('break', '休', 'Take a break', '休む', 'Everyone takes a break.', 'みんなで休みます。'),
    presentation('look', '見', 'Look at the board', '見る', 'Everyone looks at the board.', 'みんなが黒板を見ます。'),
    presentation('say-together', '声', 'Say it together', '一緒に言う', 'Everyone answers together.', 'みんなで一緒に言います。'),
    presentation('listen', '耳', 'Listen', '聞く', 'Everyone listens.', 'みんなで聞きます。'),
    presentation('write', '書', 'Write it down', '書く', 'Everyone writes it down.', 'みんなでノートに書きます。'),
]);

const EXPRESSION_BY_ACTION: Readonly<Record<ClassroomInstructionActionId, string>> = Object.freeze({
    begin: 'expression:classroom-01',
    finish: 'expression:classroom-02',
    break: 'expression:classroom-03',
    look: 'expression:classroom-04',
    'say-together': 'expression:classroom-05',
    listen: 'expression:classroom-06',
    write: 'expression:classroom-07',
});

const MEANING_BY_ACTION: Readonly<Record<ClassroomInstructionActionId, LocalizedText>> = Object.freeze({
    begin: { en: "Let's begin.", ja: '始めましょう。' },
    finish: { en: "Let's finish.", ja: '終わりましょう。' },
    break: { en: "Let's take a break.", ja: '休みましょう。' },
    look: { en: 'Please look.', ja: '見てください。' },
    'say-together': { en: 'Everyone, please say it together.', ja: 'みなさんで言ってください。' },
    listen: { en: 'Please listen.', ja: '聞いてください。' },
    write: { en: 'Please write it.', ja: '書いてください。' },
});

export function createLessonZeroFollowInstructionDefinition(
    classroom: ClassroomExpressionSessionDefinition,
    activity: LessonZeroActivity,
): ClassroomInstructionSessionDefinition {
    if (activity.id !== LESSON_ZERO_FOLLOW_INSTRUCTION_ACTIVITY_ID
        || activity.responseMode !== 'act'
        || activity.expectedEvidence.kind !== 'scene-actions') {
        throw new TypeError('Lesson Zero follow-instructions activity has the wrong contract.');
    }
    if (!sameList(activity.expectedEvidence.values ?? [], SOURCE_ACTION_ORDER)) {
        throw new TypeError('Lesson Zero follow-instructions action evidence has drifted.');
    }
    const expressionById = new Map(classroom.expressions.map(expression => [expression.id, expression]));
    const cues: ClassroomInstructionCue[] = CHALLENGE_ACTION_ORDER.map(actionId => {
        const expression = expressionById.get(EXPRESSION_BY_ACTION[actionId]);
        const probe = expression?.probes[0];
        if (!expression || !probe) throw new TypeError(`Missing classroom instruction for ${actionId}.`);
        return {
            id: `cue:lesson-zero-instruction:${actionId}`,
            childActivityId: `${LESSON_ZERO_FOLLOW_INSTRUCTION_ACTIVITY_ID}:${actionId}`,
            sourceQuestionId: expression.sourceQuestionId,
            conceptIds: expression.conceptIds,
            actionId,
            japanese: probe.modelAnswer,
            reading: lessonZeroCanonicalReading(probe),
            meaning: MEANING_BY_ACTION[actionId],
        };
    });
    return Object.freeze({
        schemaVersion: 1,
        id: 'session:lesson-zero-follow-instructions',
        activityId: LESSON_ZERO_FOLLOW_INSTRUCTION_ACTIVITY_ID,
        cues: Object.freeze(cues),
    });
}

export function lessonZeroFollowInstructionCompletionEvaluation(
    activity: LessonZeroActivity,
    at: number,
): ActivityEvaluation {
    if (activity.id !== LESSON_ZERO_FOLLOW_INSTRUCTION_ACTIVITY_ID) {
        throw new TypeError(`${activity.id} is not the Lesson Zero follow-instructions activity.`);
    }
    return {
        attempt: {
            kind: 'attempt-recorded',
            eventId: `${LESSON_ZERO_FOLLOW_INSTRUCTION_ACTIVITY_ID}:complete`,
            at,
            activityId: activity.id,
            conceptIds: activity.conceptIds,
            responseKind: activity.expectedEvidence.kind,
            outcome: 'pass',
            score: 1,
        },
        result: {
            outcome: 'pass',
            score: 1,
            errorTags: [],
            feedback: {
                explanation: {
                    en: 'You followed all seven classroom instructions by ear.',
                    ja: '七つの教室の指示を聞いて、すべて動けました。',
                },
            },
        },
        reviewSeeds: [],
    };
}

function presentation(
    actionId: ClassroomInstructionActionId,
    glyph: string,
    en: string,
    ja: string,
    reactionEn: string,
    reactionJa: string,
): ClassroomInstructionActionPresentation {
    return {
        actionId,
        glyph,
        label: { en, ja },
        roomReaction: { en: reactionEn, ja: reactionJa },
    };
}

function sameList(actual: readonly string[], expected: readonly string[]): boolean {
    return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}
