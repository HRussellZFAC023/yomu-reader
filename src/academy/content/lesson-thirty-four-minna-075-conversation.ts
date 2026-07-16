import lessonPackage from '../../../public/academy/content/lessons/036-l2-l09.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { ConversationListeningCheckModel, ConversationListeningTask } from '../minigames/conversation-listening-check';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';
import { resolvePackagedListeningTask } from './listening/listening-task-bindings';

const PACKAGE_ID = 'l2-l09';
const PACKAGE_ORDER = 36;
const MODULE_ID = 6974657;
const ARCHIVE_SHA256 = '09310bcbaaf7ff115e951d343296a8352284d0325a7efc9e80ae863bc45a3da6';
const WORKSHEET_SHA256 = 'c52c08bd27d6ed7d2c29eafbecaca8b83e14a4a0d35dc9139f4003c6718bb2f0';
const WORKSHEET_IMAGE_SHA256 = 'b28a169dac64414fd20e35345e9f5f4e8f5d4261c1a78b396f35542de9c12105';
const AUDIO_SHA256 = '360cef1923b1e824f22ec5ebdaf18896e87846c8c9019f25228da60675c79834';
const AUDIO_LOCATOR = 'academy/content/minna/audio/l2-l09-minna-075.mp3';
const AUDIO_URL = '/academy/content/listening/media/academy-listening-360cef1923b1e824.mp3';
const SOURCE_PREFIX = `moodle:${MODULE_ID}:${WORKSHEET_SHA256}:pdf-p1:minna075-conversation`;

export function createLessonThirtyFourMinna075ConversationBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const tasks = [
        task('room-request', 1, 'ワンさんは どんな 部屋を 探していますか。',
            '家賃は８万円ぐらいで、駅から遠くない所です。',
            ['家賃は８万円ぐらいで、駅から遠くない所です。', '８万円ぐらいで、駅から遠くない所です。', '家賃は８万円ぐらいで、駅から遠くない所。', '８万円ぐらいで、駅から遠くない所。'],
            '家賃は８万円ぐらいで、駅から遠くない所'),
        task('rent', 2, 'この 部屋の 家賃は いくらですか。', '８万３千円です。',
            ['８万３千円です。', '８万３千円。', '８万３千円', '８３０００円です。', '８３０００円'], '家賃は８万３千円です'),
        task('station-time', 3, '駅から 何分 かかりますか。', '１０分です。',
            ['１０分です。', '１０分。', '１０分'], '駅から１０分です'),
        task('view-today', 4, '今日 この 部屋を 見る ことが できますか。', 'はい、できます。',
            ['はい、できます。', 'はい。', 'はい', 'ええ、できます。', 'ええ。', 'できます。'], '今日この部屋を見ることができます'),
    ] as const;
    const urls = tasks.map(item => resolvePackagedListeningTask(PACKAGE_ID, item.sourceQuestionId, AUDIO_LOCATOR));
    if (urls.some(url => url !== AUDIO_URL)) {
        throw new TypeError('Expected one exact packaged Minna 075 binding for all four room-search questions.');
    }
    const activity: ConversationListeningCheckModel = {
        id: 'activity:l2-l09-sensei-minna-075-conversation',
        kind: 'academy-conversation-listening-check',
        responseKind: 'minna-075-conversation-comprehension',
        curriculumPhase: 'assessed-recognition',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: tasks.map(item => item.conceptId),
        prompt: {
            ja: '先生の部屋探しページを見て Minna 075 を聞き、ワンさんの希望と紹介された部屋について四つの質問に答えましょう。',
            en: 'Use Sensei\'s room-search page, listen to Minna 075, and answer four questions about Wang\'s request and the room offered.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                worksheet: {
                    sourceId: `moodle:${WORKSHEET_SHA256}:page:1`,
                    payloadSha256: WORKSHEET_SHA256,
                    title: 'Homework/HW Chapter 22_Conversation listening.pdf',
                    page: 1,
                    url: '/academy/content/lessons/l2-l09/moodle-chapter-22-conversation-page-1.png',
                    sha256: WORKSHEET_IMAGE_SHA256,
                },
                support: {
                    sourceId: `moodle:${WORKSHEET_SHA256}:page:1+audio-review:${AUDIO_SHA256}`,
                    payloadSha256: WORKSHEET_SHA256,
                    title: 'Homework/HW Chapter 22_Conversation listening.pdf',
                    page: 1,
                    role: 'worksheet-and-audio-review',
                },
                audio: {
                    sourceId: `moodle:${AUDIO_SHA256}:audio`,
                    payloadSha256: AUDIO_SHA256,
                    locator: AUDIO_LOCATOR,
                    url: AUDIO_URL,
                    durationSeconds: 43.232667,
                    label: 'Minna no Nihongo track 075',
                },
                answerKeyBasis: 'source-worksheet-questions-and-audio-reviewed-exact-minna-075-recording',
            },
        },
        payload: {
            sourceCaption: {
                ja: '元資料: Moodle Lesson 8 の Chapter 22 会話聞き取り1ページ目と、公式版と同一バイトの Minna 075。四つの質問を元の順番で確認します。',
                en: 'Source: Moodle Lesson 8 Chapter 22 conversation listening page 1 and Minna 075, byte-identical to the official recording. Its four questions stay in source order.',
            },
            tasks,
            transcript: [
                line('音声', '第22課 会話「どんな 部屋を お探しですか」'),
                line('不動産屋', 'どんな 部屋を お探しですか。'),
                line('ワン', 'そうですね。'),
                line('ワン', '家賃は ８万円ぐらいで、駅から 遠くない 所が いいです。'),
                line('不動産屋', 'では、こちらは いかがですか。'),
                line('不動産屋', '駅から １０分で、家賃は ８万３千円です。'),
                line('ワン', 'ダイニングキッチンと 和室ですね。'),
                line('ワン', 'すみません。ここは 何ですか。'),
                line('不動産屋', '押し入れです。布団を 入れる 所ですよ。'),
                line('ワン', 'そうですか。'),
                line('ワン', 'この 部屋、きょう 見る ことが できますか。'),
                line('不動産屋', 'ええ。今から 行きましょうか。'),
                line('ワン', 'ええ、お願いします。'),
            ],
            feedback: {
                pass: {
                    explanation: {
                        ja: '四つの答えが、先生の会話ページと Minna 075 の部屋探しに合いました。',
                        en: 'All four answers match Sensei\'s conversation page and the room search in Minna 075.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '一つ以上の答えで、希望の条件か紹介された部屋の情報をもう一度確かめる必要があります。',
                        en: 'At least one answer needs another check against the requested conditions or the room offered.',
                    },
                    repairPrompt: {
                        ja: 'ページを見たまま Minna 075 をもう一度聞き、まちがえた質問だけを直しましょう。',
                        en: 'Keep the page visible, replay Minna 075, and revise only the missed questions.',
                    },
                    nearbyExample: {
                        ja: '「８万円ぐらい」は希望で、「８万３千円」は紹介された部屋の家賃です。',
                        en: 'About ¥80,000 is the request; ¥83,000 is the rent of the room offered.',
                    },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-minna-075-conversation',
        narrative: {
            ja: '信号ミキサーを閉じると、ルパーナが先生の部屋探しページと Minna 075 を並べます。四つの答えと台本は、最初の聞き取りが終わるまで伏せます。',
            en: 'After closing the signal mixer, Ruparna places Sensei\'s room-search page beside Minna 075. The four answers and transcript remain covered until the first listening attempt is complete.',
        },
        activity: Object.freeze(activity),
    });
}

function task(
    id: string,
    sourceOrder: 1 | 2 | 3 | 4,
    prompt: string,
    answer: string,
    acceptedAnswers: readonly string[],
    reviewExpression: string,
): ConversationListeningTask {
    return Object.freeze({
        id,
        sourceOrder,
        sourceQuestionId: `${SOURCE_PREFIX}:item-${sourceOrder}`,
        prompt,
        answer,
        acceptedAnswers: Object.freeze(acceptedAnswers),
        conceptId: `concept:l2-l09:minna075-${id}`,
        errorTag: `l2-l09-minna075-${id}`,
        reviewExpression,
    });
}

function line(speaker: string, text: string): Readonly<{ speaker: string; text: string }> {
    return Object.freeze({ speaker, text });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l09 package');
    const identity = record(root.identity, 'l2-l09 identity');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l2-l09 package identity.');
    }
    const coverage = record(root.sourceCoverage, 'l2-l09 coverage');
    if (coverage.archiveSha256 !== ARCHIVE_SHA256) throw new TypeError('Unexpected l2-l09 source archive.');
    const members = array(coverage.members, 'l2-l09 members').map(value => record(value, 'l2-l09 member'));
    for (const [sha256, title, kind] of [
        [WORKSHEET_SHA256, 'Homework/HW Chapter 22_Conversation listening.pdf', 'document'],
        [AUDIO_SHA256, 'Homework/minna_shokyu_1_075.mp3', 'audio'],
    ] as const) {
        if (!members.some(member => member.payloadSha256 === sha256 && member.title === title && member.kind === kind)) {
            throw new TypeError(`Missing exact Minna 075 source ${title}.`);
        }
    }
    if (members.filter(member => member.kind === 'audio').length !== 1) {
        throw new TypeError('Lesson 34 expects Minna 075 to be the package\'s only audio member.');
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
