import lessonPackage from '../../../public/academy/content/lessons/032-l2-l05.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { ConversationListeningCheckModel, ConversationListeningTask } from '../minigames/conversation-listening-check';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';
import { resolvePackagedListeningTask } from './listening/listening-task-bindings';

const PACKAGE_ID = 'l2-l05';
const MODULE_ID = 6974651;
const WORKSHEET_SHA256 = '01d6d86ad59a1a4fc30891dcd14f2916387552c35802a025a289e622a5478280';
const WORKSHEET_IMAGE_SHA256 = 'ad13d146b8e82ad147870d90a1e47c0f8a43b96ac306e6bc869410dc616f2cb1';
const SCRIPT_SHA256 = '359fa7af358cf5bfbe429806569cc3d885369d23d03546809a65eec2dbdb63e8';
const AUDIO_SHA256 = 'f423d074fd31d9efaf34b359c71fde870abc71b850379af3a526758cee9b5d30';
const AUDIO_LOCATOR = 'academy/content/minna/audio/l2-l05-minna-069.mp3';
const SOURCE_PREFIX = `moodle:${MODULE_ID}:${WORKSHEET_SHA256}:pdf-p1:minna069-conversation`;

export function createLessonThirtyMinna069ConversationBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const tasks = [
        task('return-home', 1, 'タワポン君は、夏休みに国へ帰りますか。', 'いいえ。帰りたいけど、帰りません。', ['いいえ。帰りたいけど、帰りません。', 'いいえ、帰りません。', '帰りません。'], '帰りたいけど、帰りません'),
        task('fuji-experience', 2, 'タワポン君は富士山に登ったことがありますか。', 'いいえ、ありません。', ['いいえ、ありません。', 'ありません。', 'ううん、ない。', 'ない。'], '富士山に登ったことがありません'),
        task('climb-together', 3, 'タワポン君は小林君と富士山に登りたいですか。', 'はい、一緒に登りたいです。', ['はい、一緒に登りたいです。', '一緒に登りたいです。', 'はい、登りたいです。', 'うん。'], '一緒に富士山に登りたいです'),
        task('when', 4, 'いつごろ富士山へ行きますか。', '８月の初めごろです。', ['８月の初めごろです。', '８月の初めごろ。', '８月の初めごろ'], '８月の初めごろ'),
        task('kobayashi-plan', 5, '小林君は何をしますか。', 'いろいろ調べて、また電話します。', ['いろいろ調べて、また電話します。', 'いろいろ調べて、また電話する。', 'いろいろ調べて電話します。'], 'いろいろ調べて、また電話します'),
    ] as const;
    const urls = tasks.map(item => resolvePackagedListeningTask(PACKAGE_ID, item.sourceQuestionId, AUDIO_LOCATOR));
    if (urls.some(url => !url) || new Set(urls).size !== 1) throw new TypeError('Expected one exact packaged Minna 069 binding for all five conversation questions.');
    const activity: ConversationListeningCheckModel = {
        id: 'activity:l2-l05-sensei-minna-069-conversation',
        kind: 'academy-conversation-listening-check',
        responseKind: 'minna-069-conversation-comprehension',
        curriculumPhase: 'assessed-recognition',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: tasks.map(item => item.conceptId),
        prompt: {
            ja: '先生の会話ページを見て Minna 069 を聞き、タワポン君と小林君について五つの質問に答えましょう。',
            en: 'Use Sensei’s conversation page, listen to Minna 069, and answer five questions about Tawapon and Kobayashi.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                worksheet: {
                    sourceId: `moodle:${WORKSHEET_SHA256}:page:1`, payloadSha256: WORKSHEET_SHA256,
                    title: 'Handouts/New_Chapter 20_Conversation listening.pdf', page: 1,
                    url: '/academy/content/lessons/l2-l05/moodle-chapter-20-conversation-page-1.png', sha256: WORKSHEET_IMAGE_SHA256,
                },
                support: {
                    sourceId: `moodle:${SCRIPT_SHA256}:page:1`, payloadSha256: SCRIPT_SHA256,
                    title: 'Homework/Please review_Chapter 20_Conversation listening Script.pdf', page: 1,
                    role: 'reviewed-transcript',
                },
                audio: {
                    sourceId: `moodle:${AUDIO_SHA256}:audio`, payloadSha256: AUDIO_SHA256,
                    locator: AUDIO_LOCATOR, url: urls[0]!, durationSeconds: 32.1045,
                    label: 'Minna no Nihongo track 069',
                },
                answerKeyBasis: 'source-worksheet-questions-script-and-exact-minna-069-recording',
            },
        },
        payload: {
            sourceCaption: {
                ja: '元資料: Chapter 20 会話聞き取り、1ページ目、Minna 069、先生の復習用台本。五つの質問だけを元の順番で確認します。',
                en: 'Source: Chapter 20 conversation listening page 1, Minna 069, and Sensei’s review script. Only its five questions are checked, in source order.',
            },
            tasks,
            transcript: [
                line('小林', '夏休みは 国へ 帰る？'),
                line('タワポン', 'ううん。帰りたいけど、……。'),
                line('小林', 'そう。'),
                line('小林', 'タワポン君、富士山に 登った こと ある？'),
                line('タワポン', 'ううん、ない。'),
                line('小林', 'じゃ、よかったら、いっしょに 行かない？'),
                line('タワポン', 'うん。いつごろ？'),
                line('小林', '８月の 初めごろは どう？'),
                line('タワポン', 'いいよ。'),
                line('小林', 'じゃ、いろいろ 調べて、また 電話するよ。'),
                line('タワポン', 'ありがとう。待ってるよ。'),
            ],
            feedback: {
                pass: { explanation: { ja: '五つの答えが、先生の会話ページ、台本、Minna 069 に合いました。', en: 'All five answers match Sensei’s conversation page, script, and Minna 069.' } },
                lapse: {
                    explanation: { ja: '一つ以上の答えが、会話で聞こえた内容と違います。', en: 'At least one answer differs from the conversation.' },
                    repairPrompt: { ja: 'ページを見たまま Minna 069 をもう一度聞き、まちがえた質問だけを直しましょう。', en: 'Keep the page visible, replay Minna 069, and revise only the missed questions.' },
                    nearbyExample: { ja: '「帰りたい」と「帰る」は同じ答えではありません。', en: 'Wanting to return and actually returning are not the same answer.' },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-minna-069-conversation',
        narrative: {
            ja: '絵日記を閉じると、アレックスが先生の「いっしょに行かない？」を開きます。トムは五つの答えと台本を、最初の聞き取りが終わるまで伏せます。',
            en: 'After the diary closes, Alex opens Sensei’s “Want to go together?” page. Tom keeps all five answers and the script hidden until the first listening attempt is complete.',
        },
        activity: Object.freeze(activity),
    });
}

function task(id: string, sourceOrder: 1 | 2 | 3 | 4 | 5, prompt: string, answer: string, acceptedAnswers: readonly string[], reviewExpression: string): ConversationListeningTask {
    return Object.freeze({
        id, sourceOrder, sourceQuestionId: `${SOURCE_PREFIX}:item-${sourceOrder}`, prompt,
        answer, acceptedAnswers: Object.freeze(acceptedAnswers),
        conceptId: `concept:l2-l05:minna069-${id}`, errorTag: `l2-l05-minna069-${id}`, reviewExpression,
    });
}
function line(speaker: string, text: string) { return Object.freeze({ speaker, text }); }

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l05 package');
    if (root.id !== PACKAGE_ID || record(root.identity, 'l2-l05 identity').moduleId !== MODULE_ID) throw new TypeError('Unexpected l2-l05 package identity.');
    const members = array(record(root.sourceCoverage, 'l2-l05 coverage').members, 'l2-l05 members').map(value => record(value, 'l2-l05 member'));
    for (const [sha256, title] of [
        [WORKSHEET_SHA256, 'Handouts/New_Chapter 20_Conversation listening.pdf'],
        [SCRIPT_SHA256, 'Homework/Please review_Chapter 20_Conversation listening Script.pdf'],
        [AUDIO_SHA256, 'audio materials/minna_shokyu_1_069.mp3'],
    ] as const) {
        if (!members.some(candidate => candidate.payloadSha256 === sha256 && candidate.title === title)) throw new TypeError(`Missing exact Minna 069 source ${title}.`);
    }
    const questions = array(record(root.sourceQuestionNormalization, 'l2-l05 normalization').sourceQuestions, 'l2-l05 source questions').map(value => record(value, 'l2-l05 source question'));
    const ids = new Set(questions.map(question => question.id));
    for (const order of [1, 2, 3, 4, 5]) if (!ids.has(`${SOURCE_PREFIX}:item-${order}`)) throw new TypeError(`Missing exact Minna 069 source question ${order}.`);
}
function record(value: unknown, label: string): Readonly<Record<string, unknown>> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`); return value as Readonly<Record<string, unknown>>; }
function array(value: unknown, label: string): readonly unknown[] { if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`); return value; }
