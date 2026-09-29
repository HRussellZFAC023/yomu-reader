import type { ActivityEvaluation } from '../domain/activity-runtime';
import type { ClassroomExpressionSessionDefinition } from '../domain/classroom-expression-session';
import type { LessonZeroActivity } from './lesson-zero-schema';
import { lessonZeroCanonicalReading } from './lesson-zero-pedagogy-definitions';
import { repeatRequestCoverageProbes, REPEAT_REQUEST_COVERAGE_ACTIVITY_IDS,
    type RepeatRequestCoverageDefinition } from './lesson-zero-repeat-request-coverage';

export const LESSON_ZERO_REPEAT_REQUEST_ACTIVITY_ID =
    'activity:lesson-zero-reconstruct-repair' as const;

export const LESSON_ZERO_REPEAT_REQUEST_CHILD_ACTIVITY_IDS = Object.freeze([
    `${LESSON_ZERO_REPEAT_REQUEST_ACTIVITY_ID}:practice`,
    `${LESSON_ZERO_REPEAT_REQUEST_ACTIVITY_ID}:transfer`,
    ...REPEAT_REQUEST_COVERAGE_ACTIVITY_IDS,
] as const);

export function createLessonZeroRepeatRequestDefinition(
    classroom: ClassroomExpressionSessionDefinition,
    activity: LessonZeroActivity,
): RepeatRequestCoverageDefinition {
    if (activity.id !== LESSON_ZERO_REPEAT_REQUEST_ACTIVITY_ID
        || activity.responseMode !== 'reconstruct'
        || activity.expectedEvidence.kind !== 'constructed-japanese'
        || !activity.sourceQuestionIds.includes('source-question:classroom-phrase-09')) {
        throw new TypeError('Lesson Zero repeat-request activity has the wrong contract.');
    }
    for (const number of ['08', '09', '10', '11', '12']) {
        if (!activity.sourceQuestionIds.includes(`source-question:classroom-phrase-${number}`)) {
            throw new TypeError(`Repeat-request activity is missing source phrase ${number}.`);
        }
    }
    const expression = classroom.expressions.find(candidate =>
        candidate.id === 'expression:classroom-09');
    const probe = expression?.probes.find(candidate => candidate.id === 'probe:classroom-09-repeat');
    if (!expression || !probe
        || probe.modelAnswer !== 'もう一度お願いします'
        || lessonZeroCanonicalReading(probe) !== 'もういちどおねがいします') {
        throw new TypeError('Lesson Zero repeat-request source expression has drifted.');
    }
    const accepted = new Set(activity.expectedEvidence.values ?? []);
    if (!accepted.has(probe.modelAnswer) || !accepted.has(lessonZeroCanonicalReading(probe))) {
        throw new TypeError('Lesson Zero repeat-request evidence no longer accepts its source phrase.');
    }
    return Object.freeze({
        schemaVersion: 1,
        id: 'session:lesson-zero-repeat-request',
        activityId: LESSON_ZERO_REPEAT_REQUEST_ACTIVITY_ID,
        sourceQuestionId: 'source-question:classroom-phrase-09',
        conceptIds: Object.freeze([...expression.conceptIds]),
        target: Object.freeze({
            japanese: 'もう一度お願いします。',
            reading: 'もういちどおねがいします',
            meaning: Object.freeze({
                en: 'One more time, please.',
                ja: 'もう一度言ってもらう丁寧な頼み方です。',
            }),
            voiceBindingId: 'world-practice:lab-classroom-repeat',
        }),
        chunks: Object.freeze([
            Object.freeze({
                id: 'once-more',
                japanese: 'もう一度',
                reading: 'もういちど',
                soundCue: 'mou ichido',
                meaning: Object.freeze({ en: 'one more time', ja: 'もう一回' }),
            }),
            Object.freeze({
                id: 'please',
                japanese: 'お願いします',
                reading: 'おねがいします',
                soundCue: 'onegaishimasu',
                meaning: Object.freeze({ en: 'please', ja: '丁寧な頼み方' }),
            }),
            Object.freeze({
                id: 'desu',
                japanese: 'です',
                reading: 'です',
                soundCue: 'desu',
                meaning: Object.freeze({ en: 'finishes a statement', ja: '文を丁寧に結ぶ' }),
            }),
        ]),
        practiceChunkIds: Object.freeze(['once-more', 'please'] as const),
        transferChunkIds: Object.freeze(['once-more', 'please'] as const),
        transferChoiceIds: Object.freeze(['desu', 'please', 'once-more'] as const),
        coverageProbes: repeatRequestCoverageProbes(classroom),
    });
}

export function lessonZeroRepeatRequestCompletionEvaluation(
    activity: LessonZeroActivity,
    definition: RepeatRequestCoverageDefinition,
    at: number,
): ActivityEvaluation {
    if (activity.id !== LESSON_ZERO_REPEAT_REQUEST_ACTIVITY_ID) {
        throw new TypeError(`${activity.id} is not the Lesson Zero repeat-request activity.`);
    }
    return {
        attempt: {
            kind: 'attempt-recorded',
            eventId: `${LESSON_ZERO_REPEAT_REQUEST_ACTIVITY_ID}:complete`,
            at,
            activityId: activity.id,
            conceptIds: [...new Set([...definition.conceptIds, ...definition.coverageProbes.flatMap(probe => probe.conceptIds)])],
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
                    en: 'You practised checking understanding, asking again, praising, confirming and correcting.',
                    ja: '理解の確認、聞き返し、褒め方、正誤の伝え方を練習しました。',
                },
            },
        },
        reviewSeeds: [],
    };
}
