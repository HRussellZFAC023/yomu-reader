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
    learnerName: string,
): LessonZeroSentenceFrameSessionDefinition {
    validateActivity(activity);
    const name = learnerName.trim();
    if (!name) throw new TypeError('The sentence-frame lesson needs the learner name from arrival.');
    const frames: readonly LessonZeroSentenceFrameDefinition[] = [
        {
            id: 'identity',
            activityId: 'activity:lesson-zero-build-sentence-frames:identity',
            conceptId: EXPECTED_CONCEPTS[0],
            pattern: EXPECTED_PATTERNS[0],
            title: { en: 'Put yourself in the sentence', ja: '自分を文に入れる' },
            teaching: {
                en: '“は” tells us who this thought is about. “です” joins that person to what is true. Sophie can lend us an example before you make your own.',
                ja: '「は」で、だれについて話すかを示します。「です」で、その人と本当のことを結びます。まず、ソフィーさんの例を見ましょう。',
            },
            prompt: {
                en: 'Your turn. Tell the room your name in one sentence.',
                ja: 'では、自分の名前を一つの文で教室に伝えてください。',
            },
            nearbyExample: {
                japanese: 'ソフィーさんは学生です。',
                reading: 'そふぃーさんはがくせいです',
                meaning: { en: 'Sophie is a student.', ja: 'ソフィーさんは学生です。' },
            },
            target: target(
                `わたしは${name}です。`,
                `わたしは${name}です`,
                { en: `I am ${name}.`, ja: `わたしは${name}です。` },
                [
                    ['self', 'わたし'],
                    ['topic', 'は'],
                    ['name', name],
                    ['copula', 'です'],
                    ['stop', '。'],
                ],
                ['self', 'topic', 'name', 'copula', 'stop'],
                ['name', 'copula', 'self', 'stop', 'topic'],
            ),
            response: {
                speakerId: 'rie',
                speakerName: { en: 'Rie-sensei', ja: 'りえ先生' },
                japanese: `${name}さん。はい、届きました。`,
                reading: `${name}さん。はい、とどきました`,
                meaning: { en: `${name}. Yes, I heard you.`, ja: `${name}さん。はい、届きました。` },
            },
        },
        {
            id: 'correction',
            activityId: 'activity:lesson-zero-build-sentence-frames:correction',
            conceptId: EXPECTED_CONCEPTS[1],
            pattern: EXPECTED_PATTERNS[1],
            title: { en: 'Fix a label that is wrong', ja: 'まちがった札を直す' },
            teaching: {
                en: 'When a label does not fit, keep the topic and replace “です” with “じゃありません.” It corrects the thought without stopping the conversation.',
                ja: '札が合わないときは、話題をそのままにして、「です」を「じゃありません」に替えます。会話を止めずに直せます。',
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
                japanese: 'そうです。先生です。よかった。',
                reading: 'そうです。せんせいです。よかった',
                meaning: { en: 'That’s right. I’m the teacher. Good.', ja: 'そうです。先生です。よかった。' },
            },
        },
        {
            id: 'question',
            activityId: 'activity:lesson-zero-build-sentence-frames:question',
            conceptId: EXPECTED_CONCEPTS[2],
            pattern: EXPECTED_PATTERNS[2],
            title: { en: 'Open the sentence into a question', ja: '文を質問にする' },
            teaching: {
                en: 'A statement can invite an answer. Keep the same order and let “か” at the end open the turn to the other person.',
                ja: '同じ語順のまま、最後の「か」で相手に答えてもらう文にできます。',
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
            title: { en: 'Clip two nouns together', ja: '二つの名詞をつなぐ' },
            teaching: {
                en: '“の” clips two nouns together. The first noun tells us whose thing it is, or what kind of thing comes next.',
                ja: '「の」は二つの名詞をつなぎます。前の名詞が、だれのものか、どんなものかを教えます。',
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
                japanese: 'はい。今日から、あなたのクラスでもあります。',
                reading: 'はい。きょうから、あなたのくらすでもあります',
                meaning: { en: 'Yes. From today, it is your class too.', ja: 'はい。今日から、あなたのクラスでもあります。' },
            },
        },
        {
            id: 'parallel',
            activityId: 'activity:lesson-zero-build-sentence-frames:parallel',
            conceptId: EXPECTED_CONCEPTS[4],
            pattern: EXPECTED_PATTERNS[4],
            title: { en: 'Step into the same fact', ja: '同じことに加わる' },
            teaching: {
                en: 'When the same fact is true for someone else, “も” takes the place of “は.” It means you are joining what was just said.',
                ja: '同じことが別の人にも当てはまるとき、「は」の代わりに「も」を使います。今の話に加わることばです。',
            },
            prompt: {
                en: 'Sophie said she is a student. Add yourself to the same fact.',
                ja: 'ソフィーさんが「学生です」と言いました。自分も同じだと伝えてください。',
            },
            nearbyExample: {
                japanese: 'ソフィーさんも学生です。',
                reading: 'そふぃーさんもがくせいです',
                meaning: { en: 'Sophie is a student too.', ja: 'ソフィーさんも学生です。' },
            },
            target: target(
                'わたしも学生です。',
                'わたしもがくせいです',
                { en: 'I am a student too.', ja: 'わたしも学生です。' },
                [
                    ['self', 'わたし'],
                    ['also', 'も'],
                    ['student', '学生'],
                    ['copula', 'です'],
                    ['stop', '。'],
                ],
                ['self', 'also', 'student', 'copula', 'stop'],
                ['student', 'copula', 'self', 'stop', 'also'],
            ),
            response: {
                speakerId: 'sophie',
                speakerName: { en: 'Sophie', ja: 'ソフィー' },
                japanese: 'わたしもです。これで、同じクラスですね。',
                reading: 'わたしもです。これで、おなじくらすですね',
                meaning: { en: 'Me too. Now we are in the same class.', ja: 'わたしもです。これで、同じクラスですね。' },
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
