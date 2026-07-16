import lessonPackage from '../../../public/academy/content/lessons/033-l2-l06.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { ConversationListeningCheckModel, ConversationListeningTask } from '../minigames/conversation-listening-check';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';
import { resolvePackagedListeningTask } from './listening/listening-task-bindings';

const PACKAGE_ID = 'l2-l06';
const MODULE_ID = 6974652;
const WORKSHEET_SHA256 = 'bb2cea0ce9563e15e78f64cc0e8bf6cbdcfde589e458cdced63ddd11cea005a0';
const WORKSHEET_IMAGE_SHA256 = '7ea8c8ebe329839341b3fbcea6f374bdde694295e44e19fca698db5dc04207ad';
const SUPPORT_SHA256 = 'b49f9fb9498eebf9f709262116b64c2488a6d11f7aaf866e798ca5e0d95e548f';
const AUDIO_SHA256 = '71cd9a20f51a1c49a53f02fc6080914e6cf229662710f55bd8f9f2dac269d98c';
const AUDIO_LOCATOR = 'academy/content/minna/audio/l2-l06-minna-072.mp3';
const SOURCE_PREFIX = `moodle:${MODULE_ID}:${WORKSHEET_SHA256}:pdf-p1:minna072-conversation`;

export function createLessonThirtyOneMinna072ConversationBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const tasks = [
        task('drink', 1, 'サントスさんと 松本さんは 何を 飲みますか。', 'ビールです。', ['ビールです。', 'ビール。', 'ビール'], 'ビールでも飲みませんか'),
        task('match', 2, '今晩 何時から、どこと どこの サッカーの 試合が ありますか。', '今晩10時から、日本とブラジルです。', [
            '今晩10時から、日本とブラジルです。', '10時から、日本とブラジルです。',
            '今晩10時から日本とブラジルのサッカーの試合があります。',
        ], '今晩10時から日本とブラジルのサッカーの試合があります'),
        task('winner', 3, 'サントスさんは、どちらの 国が 勝つと 思っていますか。', 'ブラジルです。', ['ブラジルです。', 'ブラジル。', 'ブラジル'], 'ブラジルが勝つと思います'),
        task('japan', 4, '松本さんは、最近 日本の サッカーは どうなったと 思っていますか。', '最近、日本のサッカーも強くなりました。', [
            '最近、日本のサッカーも強くなりました。', '最近日本も強くなりました。', '強くなりました。',
        ], '最近日本のサッカーも強くなりました'),
    ] as const;
    const urls = tasks.map(item => resolvePackagedListeningTask(PACKAGE_ID, item.sourceQuestionId, AUDIO_LOCATOR));
    if (urls.some(url => !url) || new Set(urls).size !== 1) {
        throw new TypeError('Expected one exact packaged Minna 072 binding for all four conversation questions.');
    }
    const activity: ConversationListeningCheckModel = {
        id: 'activity:l2-l06-sensei-minna-072-conversation',
        kind: 'academy-conversation-listening-check',
        responseKind: 'minna-072-conversation-comprehension',
        curriculumPhase: 'assessed-recognition',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: tasks.map(item => item.conceptId),
        prompt: {
            ja: '先生の会話ページを見て Minna 072 を聞き、サントスさんと松本さんについて四つの質問に日本語で答えましょう。',
            en: 'Use Sensei’s conversation page, listen to Minna 072, and type four Japanese answers about Santos and Matsumoto.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                worksheet: {
                    sourceId: `moodle:${WORKSHEET_SHA256}:page:1`, payloadSha256: WORKSHEET_SHA256,
                    title: 'Handouts/Chapter 21_Conversation listening.pdf', page: 1,
                    url: '/academy/content/lessons/l2-l06/moodle-chapter-21-conversation-page-1.png',
                    sha256: WORKSHEET_IMAGE_SHA256,
                },
                support: {
                    sourceId: `moodle:${SUPPORT_SHA256}:page:1`, payloadSha256: SUPPORT_SHA256,
                    title: 'Handouts/Chapter 21 grammar point_Conversation listening Script.pdf', page: 1,
                    role: 'vocabulary-and-grammar-support',
                },
                audio: {
                    sourceId: `moodle:${AUDIO_SHA256}:audio`, payloadSha256: AUDIO_SHA256,
                    locator: AUDIO_LOCATOR, url: urls[0]!, durationSeconds: 50.18125,
                    label: 'Minna no Nihongo track 072',
                },
                answerKeyBasis: 'source-worksheet-questions-and-audio-reviewed-exact-minna-072-recording',
            },
        },
        payload: {
            sourceCaption: {
                ja: '元資料: Chapter 21 会話聞き取り、1ページ目、Minna 072。四つの記述式質問だけを元の順番で確認します。補助PDFは語彙と文型の資料で、台本や答えの根拠にはしていません。',
                en: 'Source: Chapter 21 conversation listening page 1 and Minna 072. Only its four written questions are checked, in source order. The support PDF supplies vocabulary and grammar, not a transcript or answer key.',
            },
            tasks,
            transcript: [
                line('音声', '第21課 会話「私もそう思います」'),
                line('松本', 'あっ、サントスさん、久しぶりですね。'),
                line('サントス', 'あっ、松本さん、お元気ですか。'),
                line('松本', 'ええ。ちょっとビールでも飲みませんか。'),
                line('サントス', 'いいですね。'),
                line('松本', '今晩10時から日本とブラジルのサッカーの試合がありますね。'),
                line('サントス', 'ああ、そうですね。'),
                line('松本', 'サントスさんはどちらが勝つと思いますか。'),
                line('サントス', 'もちろんブラジルですよ。'),
                line('松本', 'そうですね。でも最近日本も強くなりましたよ。'),
                line('サントス', 'ええ、私もそう思いますが……。'),
                line('サントス', 'あっ、もう帰らないと……。'),
                line('松本', 'ええ、帰りましょう。'),
            ],
            feedback: {
                pass: { explanation: { ja: '四つの答えが、先生の会話ページと Minna 072 の原音声に合いました。', en: 'All four answers match Sensei’s conversation page and the original Minna 072 recording.' } },
                lapse: {
                    explanation: { ja: '一つ以上の答えが、会話で聞こえた内容と違います。', en: 'At least one answer differs from the conversation.' },
                    repairPrompt: { ja: 'ページを見たまま Minna 072 をもう一度聞き、まちがえた質問だけを直しましょう。', en: 'Keep the page visible, replay Minna 072, and revise only the missed questions.' },
                    nearbyExample: { ja: '「日本」と「ブラジル」、そして「10時」を別々に聞き取ります。', en: 'Listen separately for Japan, Brazil, and ten o’clock.' },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-minna-072-conversation',
        narrative: {
            ja: '変換ノートの次に、シンが先生の四つの会話質問を開きます。ソフィーは、最初の聞き取りが終わるまで台本と答えを伏せます。',
            en: 'After the transformation notebook, Shin opens Sensei’s four conversation questions. Sophie keeps the reviewed transcript and answers hidden until the first listening attempt is complete.',
        },
        activity: Object.freeze(activity),
    });
}

function task(
    id: string,
    sourceOrder: number,
    prompt: string,
    answer: string,
    acceptedAnswers: readonly string[],
    reviewExpression: string,
): ConversationListeningTask {
    return Object.freeze({
        id, sourceOrder, sourceQuestionId: `${SOURCE_PREFIX}:item-${sourceOrder}`, prompt,
        answer, acceptedAnswers: Object.freeze(acceptedAnswers),
        conceptId: `concept:l2-l06:minna072-${id}`, errorTag: `l2-l06-minna072-${id}`, reviewExpression,
    });
}

function line(speaker: string, text: string) { return Object.freeze({ speaker, text }); }

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l06 package');
    if (root.id !== PACKAGE_ID || record(root.identity, 'l2-l06 identity').moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l2-l06 package identity.');
    }
    const members = array(record(root.sourceCoverage, 'l2-l06 coverage').members, 'l2-l06 members')
        .map(value => record(value, 'l2-l06 member'));
    for (const [sha256, title] of [
        [WORKSHEET_SHA256, 'Handouts/Chapter 21_Conversation listening.pdf'],
        [SUPPORT_SHA256, 'Handouts/Chapter 21 grammar point_Conversation listening Script.pdf'],
        [AUDIO_SHA256, 'Audio materials/minna_shokyu_1_072.mp3'],
    ] as const) {
        if (!members.some(candidate => candidate.payloadSha256 === sha256 && candidate.title === title)) {
            throw new TypeError(`Missing exact Minna 072 source ${title}.`);
        }
    }
    const questions = array(record(root.sourceQuestionNormalization, 'l2-l06 normalization').sourceQuestions, 'l2-l06 source questions')
        .map(value => record(value, 'l2-l06 source question'));
    const ids = new Set(questions.map(question => question.id));
    for (const order of [1, 2, 3, 4]) {
        if (!ids.has(`${SOURCE_PREFIX}:item-${order}`)) throw new TypeError(`Missing exact Minna 072 source question ${order}.`);
    }
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
    return value as Readonly<Record<string, unknown>>;
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    return value;
}
