import type { LessonZeroActivity } from './lesson-zero';
import type {
    LessonZeroGreetingChunk,
    LessonZeroGreetingSessionDefinition,
} from '../domain/lesson-zero-greeting-session';

export const LESSON_ZERO_GREETING_ACTIVITY_ID = 'activity:lesson-zero-greet-rie' as const;

const EXPECTED_VALUES = ['こんばんは', 'はじめまして', 'です', 'よろしくお願いします'] as const;
const EXPECTED_RUBRICS = ['greeting-order', 'name-intelligibility'] as const;
const EXPECTED_CONCEPTS = ['concept:first-meeting-greeting', 'concept:self-introduction-name'] as const;

export function createLessonZeroGreetingDefinition(
    activity: LessonZeroActivity,
    learnerDisplayName: string,
): LessonZeroGreetingSessionDefinition {
    validateGreetingActivity(activity);
    const learnerName = normalizedLearnerName(learnerDisplayName);
    const chunks: readonly LessonZeroGreetingChunk[] = Object.freeze([
        chunk('evening', 'こんばんは。', 'こんばんは', {
            en: 'Good evening.',
            ja: '夜のあいさつです。',
        }),
        chunk('first-meeting', 'はじめまして。', 'はじめまして', {
            en: 'Nice to meet you.',
            ja: '初めて会う人へのあいさつです。',
        }),
        chunk('name', `${learnerName}です。`, `${learnerName}です`, {
            en: `I'm ${learnerName}.`,
            ja: `「${learnerName}です」で名前を伝えます。`,
        }),
        chunk('closing', 'よろしくお願いします。', 'よろしくおねがいします', {
            en: 'A warm, polite close to your introduction.',
            ja: '初対面のあいさつを丁寧に結びます。',
        }),
    ]);
    return Object.freeze({
        schemaVersion: 1,
        id: 'session:lesson-zero-greet-rie',
        activityId: LESSON_ZERO_GREETING_ACTIVITY_ID,
        learnerName,
        conceptIds: Object.freeze([...activity.conceptIds]),
        model: Object.freeze({
            speakerId: 'rie',
            japanese: 'こんばんは。はじめまして。りえです。よろしくお願いします。',
            reading: 'こんばんは。はじめまして。りえです。よろしくおねがいします。',
            meaning: Object.freeze({
                en: "Good evening. Nice to meet you. I'm Rie. It's lovely to meet you.",
                ja: 'こんばんは。はじめまして。りえです。よろしくお願いします。',
            }),
        }),
        chunks,
    });
}

function validateGreetingActivity(activity: LessonZeroActivity): void {
    if (activity.id !== LESSON_ZERO_GREETING_ACTIVITY_ID
        || activity.responseMode !== 'voice'
        || activity.assessed !== true
        || activity.production !== true
        || activity.expectedEvidence.kind !== 'spoken-chunks'
        || !sameList(activity.expectedEvidence.values, EXPECTED_VALUES)
        || !sameList(activity.expectedEvidence.rubricIds, EXPECTED_RUBRICS)
        || !sameList(activity.conceptIds, EXPECTED_CONCEPTS)) {
        throw new TypeError('Lesson Zero greeting no longer matches its authored learning contract.');
    }
}

function normalizedLearnerName(value: string): string {
    const name = value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
    if (!name || name.length > 48 || /[\p{Cc}\p{Cs}]/u.test(name)) {
        throw new TypeError('The Lesson Zero greeting needs a valid learner name.');
    }
    return name;
}

function chunk(
    id: LessonZeroGreetingChunk['id'],
    japanese: string,
    reading: string,
    meaning: LessonZeroGreetingChunk['meaning'],
): LessonZeroGreetingChunk {
    return Object.freeze({ id, japanese, reading, meaning: Object.freeze(meaning) });
}

function sameList(actual: readonly string[] | undefined, expected: readonly string[]): boolean {
    return Boolean(actual)
        && actual!.length === expected.length
        && actual!.every((value, index) => value === expected[index]);
}
