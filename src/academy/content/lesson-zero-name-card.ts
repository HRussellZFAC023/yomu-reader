import type { LessonZeroActivity } from './lesson-zero';
import { createKatakanaNameDraft } from './learner-name';
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
    const nameDraft = createKatakanaNameDraft(learnerName);
    return Object.freeze({
        schemaVersion: 2,
        id: 'session:lesson-zero-name-card-draft',
        activityId: LESSON_ZERO_NAME_CARD_ACTIVITY_ID,
        usualName: nameDraft.usualName,
        katakanaName: nameDraft.katakana,
        defaultNameVariant: nameDraft.katakana ? 'katakana' : 'usual',
        conceptIds: Object.freeze([...activity.conceptIds]),
        tokens: Object.freeze([
            Object.freeze({
                id: 'learner-name',
                text: nameDraft.katakana ?? nameDraft.usualName,
                reading: nameDraft.katakana ?? nameDraft.usualName,
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
            japanese: 'こんばんは。はじめまして。りえです。よろしくお願いします。',
            reading: 'こんばんは。はじめまして。りえです。よろしくおねがいします',
            focusJapanese: 'りえです。',
            meaning: Object.freeze({ en: "Good evening. Nice to meet you. I'm Rie.", ja: 'こんばんは。はじめまして。りえです。よろしくお願いします。' }),
            bindingId: 'lesson-zero:greeting-rie-model',
        }),
        response: Object.freeze({
            speakerId: 'rie',
            japanese: 'はい。今日から、あなたのクラスです。',
            reading: 'はい。きょうから、あなたのクラスです',
            meaning: Object.freeze({
                en: 'Yes. From today, this is your class.',
                ja: 'はい。今日から、あなたのクラスです。',
            }),
            bindingId: 'lesson-zero:sentence-frame:noun-link:response',
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
