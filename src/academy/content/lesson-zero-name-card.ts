import type { LessonZeroActivity } from './lesson-zero';
import {
    LESSON_ZERO_NAME_CARD_TOKEN_IDS,
    type LessonZeroNameCardDefinition,
} from '../domain/lesson-zero-name-card-session';

export const LESSON_ZERO_NAME_CARD_ACTIVITY_ID = 'activity:lesson-zero-name-card-draft' as const;

const EXPECTED_CONCEPTS = [
    'concept:self-introduction-name',
    'concept:copula-affirmative',
] as const;

export function createLessonZeroNameCardDefinition(
    activity: LessonZeroActivity,
    learnerDisplayName: string,
): LessonZeroNameCardDefinition {
    validateActivity(activity);
    const learnerName = learnerDisplayName.normalize('NFKC').replace(/\s+/gu, ' ').trim();
    if (!learnerName || learnerName.length > 48 || /[\p{Cc}\p{Cs}]/u.test(learnerName)) {
        throw new TypeError('The name-card lesson needs the learner name chosen during arrival.');
    }
    return Object.freeze({
        schemaVersion: 1,
        id: 'session:lesson-zero-name-card-draft',
        activityId: LESSON_ZERO_NAME_CARD_ACTIVITY_ID,
        learnerName,
        conceptIds: Object.freeze([...activity.conceptIds]),
        tokens: Object.freeze([
            Object.freeze({
                id: 'learner-name',
                text: learnerName,
                reading: learnerName,
                cue: Object.freeze({ en: 'your name', ja: 'あなたの名前' }),
            }),
            Object.freeze({
                id: 'desu',
                text: 'です。',
                reading: 'です',
                cue: Object.freeze({ en: 'polite ending', ja: 'ていねいなおわり' }),
            }),
        ]),
        correctOrder: LESSON_ZERO_NAME_CARD_TOKEN_IDS,
        model: Object.freeze({
            japanese: 'りえです。',
            reading: 'りえです',
            meaning: Object.freeze({ en: "I'm Rie.", ja: 'りえです。' }),
        }),
        response: Object.freeze({
            speakerId: 'rie',
            japanese: 'はい、できました。机に置きましょう。',
            reading: 'はい、できました。つくえにおきましょう',
            meaning: Object.freeze({
                en: 'Done. Put it on the desk.',
                ja: 'はい、できました。机に置きましょう。',
            }),
        }),
    });
}

function validateActivity(activity: LessonZeroActivity): void {
    if (activity.id !== LESSON_ZERO_NAME_CARD_ACTIVITY_ID
        || activity.sectionId !== 'useful-vocabulary'
        || activity.responseMode !== 'reconstruct'
        || !activity.assessed
        || !activity.production
        || activity.expectedEvidence.kind !== 'ordered-chunks'
        || !sameList(activity.conceptIds, EXPECTED_CONCEPTS)
        || !sameList(activity.expectedEvidence.values, ['learner-name', 'です'])
        || !sameList(activity.expectedEvidence.rubricIds, ['name-first', 'copula-after-name'])) {
        throw new TypeError('Lesson Zero name-card activity no longer matches its authored contract.');
    }
}

function sameList(actual: readonly string[] | undefined, expected: readonly string[]): boolean {
    return Boolean(actual)
        && actual!.length === expected.length
        && actual!.every((value, index) => value === expected[index]);
}
