import lessonPackage from '../../../public/academy/content/lessons/032-l2-l05.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { DiaryListeningClozeField, DiaryListeningClozeModel, DiaryListeningClozeTask } from '../minigames/diary-listening-cloze';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';
import { resolvePackagedListeningTask } from './listening/listening-task-bindings';

const PACKAGE_ID = 'l2-l05';
const MODULE_ID = 6974651;
const WORKSHEET_SHA256 = 'a671cfd9822df09775a5e7834f0bd70a222d9d86e4ab0134f1fba6f08ba43edd';
const WORKSHEET_IMAGE_SHA256 = 'f14322b70639277f686d7ebffec147e04fa99687e21b61795d2a3d4fb9cce975';
const AUDIO_SHA256 = '2e5d1ee1e18a31b72e826670a3f6aec1c0f513a6e2f05b654e04b199ad4939f3';
const AUDIO_LOCATOR = 'academy/content/moodle/audio/l2-l05-b25.mp3';
const SOURCE_PREFIX = `moodle:${MODULE_ID}:${WORKSHEET_SHA256}:pdf-p1:b25-diary`;

export function createLessonThirtyB25DiaryListeningBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const tasks = [
        task('ken', 1, 'けんちゃんは きょうも げんきだ。ミルクを たくさん（　　　）。いっしょに うちの 近くを（　　　）。', [
            field('milk', 'ミルクを たくさん', '。', '飲んだ'),
            field('walk', 'いっしょに うちの 近くを', '。', '散歩した'),
        ], 'ミルクをたくさん飲んだ。いっしょにうちの近くを散歩した。'),
        task('dinner', 2, 'きょうの ばんごはんは（　　　）。とても（　　　）。', [
            field('meal', 'きょうの ばんごはんは', '。', 'カレーだった'),
            field('taste', 'とても', '。', 'からかった'),
        ], 'きょうのばんごはんはカレーだった。とてもからかった。'),
        task('sunday', 3, '日曜日 ディズニーランドへ（　　　）けど、お父さんは ゴルフに 行くから、だめだ。お父さん、きらい。', [
            field('disneyland', '日曜日 ディズニーランドへ', 'けど、お父さんは ゴルフに 行くから、だめだ。', '行きたかった'),
        ], '日曜日ディズニーランドへ行きたかった。'),
    ] as const;
    const urls = tasks.map(item => resolvePackagedListeningTask(PACKAGE_ID, item.sourceQuestionId, AUDIO_LOCATOR));
    if (urls.some(url => !url) || new Set(urls).size !== 1) throw new TypeError('Expected one exact packaged B-25 binding for all three diary items.');
    const activity: DiaryListeningClozeModel = {
        id: 'activity:l2-l05-sensei-b25-diary-listening',
        kind: 'academy-diary-listening-cloze',
        responseKind: 'moodle-b25-diary-cloze',
        curriculumPhase: 'assessed-recognition',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: tasks.map(item => item.conceptId),
        prompt: {
            ja: '先生の B-25 を聞いて、なな子ちゃんの絵日記の五つの空欄を普通形で埋めましょう。',
            en: 'Listen to Sensei’s B-25 and complete the five plain-form blanks in Nanako’s picture diary.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                worksheet: {
                    sourceId: `moodle:${WORKSHEET_SHA256}:page:1`,
                    payloadSha256: WORKSHEET_SHA256,
                    title: 'Handouts/Chapter 20 listening .pdf',
                    page: 1,
                    url: '/academy/content/lessons/l2-l05/moodle-chapter-20-listening-page-1.png',
                    sha256: WORKSHEET_IMAGE_SHA256,
                },
                audio: {
                    sourceId: `moodle:${AUDIO_SHA256}:audio`,
                    payloadSha256: AUDIO_SHA256,
                    locator: AUDIO_LOCATOR,
                    url: urls[0]!,
                    durationSeconds: 89.453333,
                },
                answerKeyBasis: 'source-worksheet-blanks-and-audio-reviewed-b25-forms',
            },
        },
        payload: {
            sourceCaption: {
                ja: '元資料: Chapter 20 listening、1ページ目、CD B-25。三つの絵日記項目と五つの空欄だけを元の順番で完成させます。',
                en: 'Source: Chapter 20 listening, page 1, CD B-25. Complete only its three diary items and five blanks, in source order.',
            },
            tasks,
            transcript: [
                line('音声', '二番、なな子ちゃんは絵日記をかきました。きょうはどんな一日でしたか。'),
                line('例・なな子', 'ただいま。'),
                line('例・母', 'あ、なな子、お帰りなさい。きょうのテスト、どうだった？'),
                line('例・なな子', '難しかった。'),
                line('例・母', 'そう。'),
                line('１・なな子', 'けんちゃん、元気？ ミルク飲んだ？'),
                line('１・けん', '（赤ちゃんの声）'),
                line('１・なな子', 'たくさん飲んだ。おいしかった？'),
                line('１・けん', '（赤ちゃんの声）'),
                line('１・なな子', 'じゃ、ちょっと散歩する？'),
                line('１・けん', '（赤ちゃんの声）'),
                line('１・なな子', 'お母さん、けんちゃんと散歩に行ってもいい？'),
                line('１・母', 'いいよ。でも、遠いところはだめよ。'),
                line('１・なな子', 'はい。'),
                line('２・なな子', 'ただいま。お母さん、きょうの晩ごはん、何？'),
                line('２・母', 'きょうはね、カレーよ。'),
                line('２・なな子', 'わあ、カレーだ、カレーだ。'),
                line('２・母', '手、洗った？'),
                line('２・なな子', 'ううん、まだ。'),
                line('２・母', 'じゃ、手、洗って。'),
                line('２・なな子', 'はい。いただきます。うっ、からい。'),
                line('３・なな子', 'お父さん、日曜日ひま？'),
                line('３・父', '日曜日？'),
                line('３・なな子', 'ディズニーランドへ行きたい。けんちゃんも一緒に。'),
                line('３・父', '日曜日はゴルフだよ。'),
                line('３・なな子', 'また？ お母さん、お父さんまたゴルフだよ。'),
            ],
            feedback: {
                pass: { explanation: { ja: 'B-25の五つの普通形が、先生の絵日記と原音声に合いました。', en: 'All five plain forms match Sensei’s picture diary and original recording.' } },
                lapse: {
                    explanation: { ja: '一つ以上の絵日記の空欄が、聞こえた普通形と違います。', en: 'At least one diary blank differs from the plain form in the recording.' },
                    repairPrompt: { ja: '先生のページを見たままB-25をもう一度聞き、まちがえた絵日記だけを直しましょう。', en: 'Keep Sensei’s page visible, replay B-25, and revise only the missed diary item.' },
                    nearbyExample: { ja: '例: きょうのテストは むずかしかった。', en: 'Example: today’s test was difficult.' },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-b25-diary-listening',
        narrative: {
            ja: 'B-24のヒンジを閉じると、アレックスが同じ先生のページを絵日記の五つの空欄まで送ります。トムは、B-25を聞く前に普通形を見せません。',
            en: 'After the B-24 hinges close, Alex moves along the same Sensei page to five picture-diary blanks. Tom keeps the plain forms hidden until B-25 has been attempted.',
        },
        activity: Object.freeze(activity),
    });
}

function task(id: string, sourceOrder: 1 | 2 | 3, prompt: string, fields: readonly DiaryListeningClozeField[], reviewExpression: string): DiaryListeningClozeTask {
    return Object.freeze({ id, sourceOrder, sourceQuestionId: `${SOURCE_PREFIX}:item-${sourceOrder}`, prompt, fields, reviewExpression, conceptId: `concept:l2-l05:b25-${id}`, errorTag: `l2-l05-b25-${id}` });
}
function field(id: string, before: string, after: string, answer: string): DiaryListeningClozeField { return Object.freeze({ id, before, after, answer }); }
function line(speaker: string, text: string) { return Object.freeze({ speaker, text }); }

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l05 package');
    if (root.id !== PACKAGE_ID || record(root.identity, 'l2-l05 identity').moduleId !== MODULE_ID) throw new TypeError('Unexpected l2-l05 package identity.');
    const members = array(record(root.sourceCoverage, 'l2-l05 coverage').members, 'l2-l05 members').map(value => record(value, 'l2-l05 member'));
    for (const [sha256, title] of [[WORKSHEET_SHA256, 'Handouts/Chapter 20 listening .pdf'], [AUDIO_SHA256, 'audio materials/B-25.mp3']] as const) {
        const member = members.find(candidate => candidate.payloadSha256 === sha256 && candidate.title === title);
        if (!member) throw new TypeError(`Missing exact B-25 Moodle source ${title}.`);
    }
    const questions = array(record(root.sourceQuestionNormalization, 'l2-l05 normalization').sourceQuestions, 'l2-l05 source questions').map(value => record(value, 'l2-l05 source question'));
    const ids = new Set(questions.map(question => question.id));
    for (const order of [1, 2, 3]) if (!ids.has(`${SOURCE_PREFIX}:item-${order}`)) throw new TypeError(`Missing exact B-25 source question ${order}.`);
}
function record(value: unknown, label: string): Readonly<Record<string, unknown>> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`); return value as Readonly<Record<string, unknown>>; }
function array(value: unknown, label: string): readonly unknown[] { if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`); return value; }
