import type { LessonZeroActivity } from './lesson-zero';
import type {
    LessonZeroSentenceFrameDefinition,
    LessonZeroSentenceFrameSessionDefinition,
} from '../domain/lesson-zero-sentence-frame-session';

export const LESSON_ZERO_SENTENCE_FRAMES_ACTIVITY_ID = 'activity:lesson-zero-build-sentence-frames' as const;

export const LESSON_ZERO_SENTENCE_FRAME_CHILD_ACTIVITY_IDS = Object.freeze([
    'activity:lesson-zero-build-sentence-frames:identity',
    'activity:lesson-zero-build-sentence-frames:correction',
    'activity:lesson-zero-build-sentence-frames:question',
    'activity:lesson-zero-build-sentence-frames:noun-link',
    'activity:lesson-zero-build-sentence-frames:parallel',
] as const);

const EXPECTED_CONCEPTS = [
    'concept:copula-affirmative',
    'concept:copula-negative',
    'concept:copula-question',
    'concept:noun-link-no',
    'concept:parallel-mo',
] as const;

const EXPECTED_PATTERNS = [
    'N は N です',
    'N は N じゃありません',
    'N は N ですか',
    'N の N',
    'N も N です',
] as const;

export function createLessonZeroSentenceFrameDefinition(
    activity: LessonZeroActivity,
): LessonZeroSentenceFrameSessionDefinition {
    validateActivity(activity);
    const frames: readonly LessonZeroSentenceFrameDefinition[] = [
        {
            id: 'identity',
            activityId: 'activity:lesson-zero-build-sentence-frames:identity',
            conceptId: EXPECTED_CONCEPTS[0],
            pattern: EXPECTED_PATTERNS[0],
            title: { en: 'Say who you are', ja: '自分のことを言う' },
            teaching: {
                en: '“は” marks who we are talking about. “です” tells us what is true about them.',
                ja: '「は」で、だれの話かを示します。「です」で、その人について言います。',
            },
            prompt: {
                en: 'Build: “I am a student.”',
                ja: '「わたしは学生です」を作ってください。',
            },
            nearbyExample: {
                japanese: 'ソフィーさんは学生です。',
                reading: 'そふぃーさんはがくせいです',
                meaning: { en: 'Sophie is a student.', ja: 'ソフィーさんは学生です。' },
            },
            target: target(
                'わたしは学生です。',
                'わたしはがくせいです',
                { en: 'I am a student.', ja: 'わたしは学生です。' },
                [
                    ['self', 'わたし'],
                    ['topic', 'は'],
                    ['student', '学生'],
                    ['copula', 'です'],
                    ['stop', '。'],
                ],
                ['self', 'topic', 'student', 'copula', 'stop'],
                ['student', 'copula', 'self', 'stop', 'topic'],
            ),
            response: {
                speakerId: 'rie',
                speakerName: { en: 'Rie-sensei', ja: 'りえ先生' },
                japanese: 'はい。学生ですね。よろしくお願いします。',
                reading: 'はい。がくせいですね。よろしくおねがいします',
                meaning: { en: 'Yes, you’re a student. Nice to meet you.', ja: 'はい。学生ですね。よろしくお願いします。' },
            },
        },
        {
            id: 'correction',
            activityId: 'activity:lesson-zero-build-sentence-frames:correction',
            conceptId: EXPECTED_CONCEPTS[1],
            pattern: EXPECTED_PATTERNS[1],
            title: { en: 'Say what isn’t true', ja: 'ちがうことを言う' },
            teaching: {
                en: 'Use “じゃありません” when a label is wrong.',
                ja: 'ちがうときは、「じゃありません」を使います。',
            },
            prompt: {
                en: 'This card calls Rie a student. Correct it for her.',
                ja: 'この札では、りえ先生が学生になっています。直してください。',
            },
            nearbyExample: {
                japanese: 'ソフィーさんは先生じゃありません。',
                reading: 'そふぃーさんはせんせいじゃありません',
                meaning: { en: 'Sophie is not a teacher.', ja: 'ソフィーさんは先生ではありません。' },
            },
            target: target(
                'りえ先生は学生じゃありません。',
                'りえせんせいはがくせいじゃありません',
                { en: 'Rie-sensei is not a student.', ja: 'りえ先生は学生じゃありません。' },
                [
                    ['rie', 'りえ先生'],
                    ['topic', 'は'],
                    ['student', '学生'],
                    ['negative', 'じゃありません'],
                    ['stop', '。'],
                ],
                ['rie', 'topic', 'student', 'negative', 'stop'],
                ['negative', 'rie', 'student', 'stop', 'topic'],
            ),
            response: {
                speakerId: 'rie',
                speakerName: { en: 'Rie-sensei', ja: 'りえ先生' },
                japanese: 'そうです。わたしは先生です。',
                reading: 'そうです。わたしはせんせいです',
                meaning: { en: 'That’s right. I’m the teacher.', ja: 'そうです。わたしは先生です。' },
            },
        },
        {
            id: 'question',
            activityId: 'activity:lesson-zero-build-sentence-frames:question',
            conceptId: EXPECTED_CONCEPTS[2],
            pattern: EXPECTED_PATTERNS[2],
            title: { en: 'Ask a yes-or-no question', ja: 'はい・いいえの質問をする' },
            teaching: {
                en: 'Add “か” after “です.” The word order stays the same.',
                ja: '「です」のあとに「か」をつけます。語順は同じです。',
            },
            prompt: {
                en: 'Sophie has joined the desk. Ask whether she is a student.',
                ja: 'ソフィーさんが机に来ました。学生かどうか聞いてください。',
            },
            nearbyExample: {
                japanese: 'りえ先生は先生ですか。',
                reading: 'りえせんせいはせんせいですか',
                meaning: { en: 'Is Rie-sensei a teacher?', ja: 'りえ先生は先生ですか。' },
            },
            target: target(
                'ソフィーさんは学生ですか。',
                'そふぃーさんはがくせいですか',
                { en: 'Is Sophie a student?', ja: 'ソフィーさんは学生ですか。' },
                [
                    ['sophie', 'ソフィーさん'],
                    ['topic', 'は'],
                    ['student', '学生'],
                    ['question', 'ですか'],
                    ['stop', '。'],
                ],
                ['sophie', 'topic', 'student', 'question', 'stop'],
                ['student', 'question', 'sophie', 'topic', 'stop'],
            ),
            response: {
                speakerId: 'sophie',
                speakerName: { en: 'Sophie', ja: 'ソフィー' },
                japanese: 'はい、学生です。よろしく。',
                reading: 'はい、がくせいです。よろしく',
                meaning: { en: 'Yes, I am. Nice to meet you.', ja: 'はい、学生です。よろしく。' },
            },
        },
        {
            id: 'noun-link',
            activityId: 'activity:lesson-zero-build-sentence-frames:noun-link',
            conceptId: EXPECTED_CONCEPTS[3],
            pattern: EXPECTED_PATTERNS[3],
            title: { en: 'Join two nouns', ja: '二つの名詞をつなぐ' },
            teaching: {
                en: 'Put “の” between two nouns. The first noun describes the second.',
                ja: '二つの名詞の間に「の」を入れます。前の名詞が、あとの名詞を説明します。',
            },
            prompt: {
                en: 'Name the room you have just entered: Rie’s class.',
                ja: '今入った教室を「りえ先生のクラス」と言ってください。',
            },
            nearbyExample: {
                japanese: '日本語のクラスです。',
                reading: 'にほんごのくらすです',
                meaning: { en: 'It is a Japanese class.', ja: '日本語のクラスです。' },
            },
            target: target(
                'りえ先生のクラスです。',
                'りえせんせいのくらすです',
                { en: 'It is Rie-sensei’s class.', ja: 'りえ先生のクラスです。' },
                [
                    ['rie', 'りえ先生'],
                    ['link', 'の'],
                    ['class', 'クラス'],
                    ['copula', 'です'],
                    ['stop', '。'],
                ],
                ['rie', 'link', 'class', 'copula', 'stop'],
                ['class', 'rie', 'copula', 'link', 'stop'],
            ),
            response: {
                speakerId: 'rie',
                speakerName: { en: 'Rie-sensei', ja: 'りえ先生' },
                japanese: 'はい。今日から、あなたのクラスです。',
                reading: 'はい。きょうから、あなたのくらすです',
                meaning: { en: 'Yes. From today, this is your class.', ja: 'はい。今日から、あなたのクラスです。' },
            },
        },
        {
            id: 'parallel',
            activityId: 'activity:lesson-zero-build-sentence-frames:parallel',
            conceptId: EXPECTED_CONCEPTS[4],
            pattern: EXPECTED_PATTERNS[4],
            title: { en: 'Say “too”', ja: '「も」を使う' },
            teaching: {
                en: 'Use “も” instead of “は” when the same thing is true for someone else.',
                ja: 'ほかの人も同じときは、「は」の代わりに「も」を使います。',
            },
            prompt: {
                en: 'You are a student. Say that Sophie is a student too.',
                ja: 'あなたは学生です。ソフィーさんも学生だと言ってください。',
            },
            nearbyExample: {
                japanese: 'わたしは学生です。',
                reading: 'わたしはがくせいです',
                meaning: { en: 'I am a student.', ja: 'わたしは学生です。' },
            },
            target: target(
                'ソフィーさんも学生です。',
                'そふぃーさんもがくせいです',
                { en: 'Sophie is a student too.', ja: 'ソフィーさんも学生です。' },
                [
                    ['sophie', 'ソフィーさん'],
                    ['also', 'も'],
                    ['student', '学生'],
                    ['copula', 'です'],
                    ['stop', '。'],
                ],
                ['sophie', 'also', 'student', 'copula', 'stop'],
                ['student', 'copula', 'sophie', 'stop', 'also'],
            ),
            response: {
                speakerId: 'sophie',
                speakerName: { en: 'Sophie', ja: 'ソフィー' },
                japanese: 'はい。わたしたちは同じクラスですね。',
                reading: 'はい。わたしたちはおなじくらすですね',
                meaning: { en: 'Yes. We’re in the same class.', ja: 'はい。わたしたちは同じクラスですね。' },
            },
        },
    ];
    return Object.freeze({
        schemaVersion: 1,
        id: 'session:lesson-zero-sentence-frames',
        activityId: LESSON_ZERO_SENTENCE_FRAMES_ACTIVITY_ID,
        conceptIds: EXPECTED_CONCEPTS,
        frames,
    });
}

function target(
    japanese: string,
    reading: string,
    meaning: Readonly<{ en: string; ja: string }>,
    tokenPairs: readonly (readonly [string, string])[],
    correctOrder: readonly string[],
    bankOrder: readonly string[],
): LessonZeroSentenceFrameDefinition['target'] {
    return {
        japanese,
        reading,
        meaning,
        tokens: tokenPairs.map(([id, tokenJapanese]) => ({ id, japanese: tokenJapanese })),
        correctOrder,
        bankOrder,
    };
}

function validateActivity(activity: LessonZeroActivity): void {
    if (activity.id !== LESSON_ZERO_SENTENCE_FRAMES_ACTIVITY_ID
        || activity.sectionId !== 'sentence-frames'
        || activity.responseMode !== 'reconstruct'
        || !activity.assessed
        || !activity.production
        || !sameList(activity.conceptIds, EXPECTED_CONCEPTS)
        || !sameList(activity.expectedEvidence.values ?? [], EXPECTED_PATTERNS)
        || !sameList(activity.expectedEvidence.rubricIds ?? [], ['meaning', 'target-form'])) {
        throw new TypeError('Lesson Zero sentence-frame activity no longer matches its runtime definition.');
    }
}

function sameList(actual: readonly string[], expected: readonly string[]): boolean {
    return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}
