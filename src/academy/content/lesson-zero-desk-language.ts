import type { ActivityEvaluation } from '../domain/activity-runtime';
import type { ClassroomExpressionSessionDefinition } from '../domain/classroom-expression-session';
import type { LessonZeroDeskLanguageDefinition } from '../domain/lesson-zero-desk-language-session';
import type { LessonZeroActivity } from './lesson-zero-schema';
import { lessonZeroCanonicalReading } from './lesson-zero-pedagogy-definitions';

export const LESSON_ZERO_DESK_LANGUAGE_ACTIVITY_ID =
    'activity:lesson-zero-desk-language' as const;

export const LESSON_ZERO_DESK_LANGUAGE_CHILD_ACTIVITY_IDS = Object.freeze([
    `${LESSON_ZERO_DESK_LANGUAGE_ACTIVITY_ID}:practice:homework`,
    `${LESSON_ZERO_DESK_LANGUAGE_ACTIVITY_ID}:practice:example`,
    `${LESSON_ZERO_DESK_LANGUAGE_ACTIVITY_ID}:transfer:example`,
    `${LESSON_ZERO_DESK_LANGUAGE_ACTIVITY_ID}:transfer:homework`,
] as const);

export function createLessonZeroDeskLanguageDefinition(
    classroom: ClassroomExpressionSessionDefinition,
    activity: LessonZeroActivity,
): LessonZeroDeskLanguageDefinition {
    if (activity.id !== LESSON_ZERO_DESK_LANGUAGE_ACTIVITY_ID
        || activity.responseMode !== 'act'
        || activity.expectedEvidence.kind !== 'object-labels'
        || !sameSet(activity.expectedEvidence.values ?? [], ['しゅくだい', 'れい'])
        || !sameSet(activity.sourceQuestionIds, [
            'source-question:classroom-phrase-13',
            'source-question:classroom-phrase-14',
        ])) {
        throw new TypeError('Lesson Zero desk-language activity has the wrong contract.');
    }
    const homework = sourceWord(
        classroom,
        'expression:classroom-13',
        'probe:classroom-13-homework',
        'しゅくだい',
    );
    const example = sourceWord(
        classroom,
        'expression:classroom-14',
        'probe:classroom-14-example',
        'れい',
    );
    return Object.freeze({
        schemaVersion: 1,
        id: 'session:lesson-zero-desk-language',
        activityId: LESSON_ZERO_DESK_LANGUAGE_ACTIVITY_ID,
        conceptIds: Object.freeze([homework.conceptId, example.conceptId]),
        words: Object.freeze([
            Object.freeze({
                id: 'homework',
                japanese: 'しゅくだい',
                reading: homework.reading,
                soundCue: 'shu-ku-dai',
                meaning: Object.freeze({ en: 'homework', ja: 'あとでする課題' }),
                sourceQuestionId: homework.sourceQuestionId,
                conceptId: homework.conceptId,
                voiceBindingId: 'lesson-zero:desk-language:homework',
                voiceJapanese: 'しゅくだい。しゅくだいです。',
                propId: 'take-home-sheet',
            }),
            Object.freeze({
                id: 'example',
                japanese: 'れい',
                reading: example.reading,
                soundCue: 'rei',
                meaning: Object.freeze({ en: 'example', ja: 'まねをする見本' }),
                sourceQuestionId: example.sourceQuestionId,
                conceptId: example.conceptId,
                voiceBindingId: 'lesson-zero:desk-language:example',
                voiceJapanese: 'これは、れいです。れい。',
                propId: 'worked-example',
            }),
        ] as const),
        practiceOrder: Object.freeze(['homework', 'example'] as const),
        transferOrder: Object.freeze(['example', 'homework'] as const),
    });
}

export function lessonZeroDeskLanguageCompletionEvaluation(
    activity: LessonZeroActivity,
    definition: LessonZeroDeskLanguageDefinition,
    at: number,
): ActivityEvaluation {
    if (activity.id !== LESSON_ZERO_DESK_LANGUAGE_ACTIVITY_ID) {
        throw new TypeError(`${activity.id} is not the Lesson Zero desk-language activity.`);
    }
    return {
        attempt: {
            kind: 'attempt-recorded',
            eventId: `${LESSON_ZERO_DESK_LANGUAGE_ACTIVITY_ID}:complete`,
            at,
            activityId: activity.id,
            conceptIds: definition.conceptIds,
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
                    en: 'You identified both labels after the papers changed places.',
                    ja: 'プリントの場所が変わっても、二つの見出しを見分けられました。',
                },
            },
        },
        reviewSeeds: [],
    };
}

function sourceWord(
    classroom: ClassroomExpressionSessionDefinition,
    expressionId: string,
    probeId: string,
    expectedJapanese: string,
): Readonly<{
    sourceQuestionId: string;
    conceptId: string;
    reading: string;
}> {
    const expression = classroom.expressions.find(candidate => candidate.id === expressionId);
    const probe = expression?.probes.find(candidate => candidate.id === probeId);
    if (!expression || !probe
        || probe.modelAnswer !== expectedJapanese
        || expression.conceptIds.length !== 1) {
        throw new TypeError(`Lesson Zero desk-language source ${probeId} has drifted.`);
    }
    return {
        sourceQuestionId: expression.sourceQuestionId,
        conceptId: expression.conceptIds[0]!,
        reading: lessonZeroCanonicalReading(probe),
    };
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length
        && left.every(value => right.includes(value));
}
