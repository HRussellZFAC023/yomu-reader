import lessonPackage from '../../../public/academy/content/lessons/020-l1-l19.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import { resolvePackagedListeningTask } from './listening/listening-task-bindings';
import type { MoodleListeningGridModel, MoodleListeningGridTask, MoodleListeningGridTrack } from '../minigames/moodle-listening-grid';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l1-l19';
const MODULE_ID = 6223185;
const HANDOUT_SHA256 = '797c858bc8070541ec31bae8e631ac03d7c3a28a3409602f331020e1192002e8';
const TRACK_43_SHA256 = '75b031947b395f44f614a544897b2c4f8d5cca0885b8b1a525360dd07cdf0372';
const TRACK_44_SHA256 = 'b076fb0e90d9e1b2cdfe7caab6687b22b0eb354c3ee1b0b2b498154c084979bd';

const A43_LOCATOR = 'academy/content/moodle/audio/l1-l19-a43.mp3';
const A44_LOCATOR = 'academy/content/moodle/audio/l1-l19-a44.mp3';

export function createLessonNineteenListeningGridBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const activity: MoodleListeningGridModel = {
        id: 'activity:l1-l19-moodle-listening-grid',
        kind: 'academy-moodle-listening-grid',
        sourceQuestionId: 'moodle:6223185:797c858b:pdf-p1:tasks-1-2:audio-a43-a44',
        conceptIds: [
            'concept:l1-l19:listening-order-1',
            'concept:l1-l19:listening-order-2',
            'concept:l1-l19:listening-total-family',
            'concept:l1-l19:listening-total-trips',
            'concept:l1-l19:listening-total-cars',
        ],
        responseKind: 'moodle-audio-grid',
        curriculumPhase: 'assessed-recognition',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        prompt: {
            ja: '元の音声を聞いて、ワークシートの空欄を埋めましょう。',
            en: 'Listen to the original audio and complete the worksheet blanks.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                handout: {
                    sourceId: `moodle-payload:${HANDOUT_SHA256}`,
                    payloadSha256: HANDOUT_SHA256,
                    title: 'Chapter 11 listening',
                    locus: { page: 1, sections: [1, 2] },
                },
                answerKeyBasis: 'source-audio-reviewed-grid-values',
            },
        },
        payload: {
            sourceCaption: {
                ja: '元資料: Chapter 11 listening、1ページ目。CD A-43とCD A-44に対応する空欄だけを、元の順番で埋めます。',
                en: 'Source: Chapter 11 listening, page 1. Complete only the blanks corresponding to CD A-43 and CD A-44, in source order.',
            },
            tracks: [
                track('a43', 'CD A-43', TRACK_43_SHA256, A43_LOCATOR, 73.533333, [
                    task('a43-order-1', 'ex-l19-a43-order-1', '何を いくつ 注文しましたか。', [
                        field('coffee', 'コーヒー', ''),
                        field('tea', '紅茶', '1'),
                        field('juice', 'ジュース', ''),
                        field('milk', 'ミルク', ''),
                        field('beer', 'ビール', '1'),
                        field('sandwich', 'サンドイッチ', '2'),
                        field('curry-rice', 'カレーライス', ''),
                    ], 'concept:l1-l19:listening-order-1', 'l1-l19-listening-order-1', '紅茶一つ、ビール一つ、サンドイッチ二つ'),
                    task('a43-order-2', 'ex-l19-a43-order-2', '何を いくつ 注文しましたか。', [
                        field('coffee', 'コーヒー', ''),
                        field('tea', '紅茶', ''),
                        field('juice', 'ジュース', '2'),
                        field('milk', 'ミルク', ''),
                        field('beer', 'ビール', ''),
                        field('sandwich', 'サンドイッチ', '1'),
                        field('curry-rice', 'カレーライス', '2'),
                    ], 'concept:l1-l19:listening-order-2', 'l1-l19-listening-order-2', 'カレーライス二つ、サンドイッチ一つ、ジュース二つ'),
                ], [
                    line('音声', '一番、何をいくつ注文しましたか。'),
                    line('例', 'いらっしゃいませ。えーっと、コーヒー一つとミルク一つ。はい、かしこまりました。'),
                    line('１', 'いらっしゃいませ、こちらへどうぞ。えーっと、私は紅茶とサンドイッチ。私は、うーん、ビールありますか。はい、あります。じゃあ、ビール。あ、それから私もサンドイッチください。はい、紅茶一つ、ビール一つ、サンドイッチ二つですね。かしこまりました。'),
                    line('２', 'いらっしゃいませ。えーっと、私はカレーライス。私も。私はサンドイッチ。はい。それからジュース。私も。はい、カレーライス二つとサンドイッチ一つ、ジュース三つですね。いいえ、ジュースは二つです。かしこまりました。'),
                ]),
                track('a44', 'CD A-44', TRACK_44_SHA256, A44_LOCATOR, 109.133333, [
                    task('a44-family', 'ex-l19-a44-family-total', '全部で 何枚、何人、何回、何台ですか。', [
                        field('children', '子ども', '5'),
                        field('total', '全部で', '11'),
                    ], 'concept:l1-l19:listening-total-family', 'l1-l19-listening-total-family', '子ども五人、全部で十一人'),
                    task('a44-trips', 'ex-l19-a44-trip-total', '全部で 何枚、何人、何回、何台ですか。', [
                        field('america', 'アメリカ', '3'),
                        field('india', 'インド', '1'),
                        field('europe', 'ヨーロッパ', '4'),
                        field('total', '全部で', '10'),
                    ], 'concept:l1-l19:listening-total-trips', 'l1-l19-listening-total-trips', 'アメリカ三回、インド一回、ヨーロッパ四回、全部で十回'),
                    task('a44-cars', 'ex-l19-a44-car-total', '全部で 何枚、何人、何回、何台ですか。', [
                        field('self', 'わたしの 車', '2'),
                        field('wife', '妻の 車', '1'),
                        field('oldest-child', 'いちばん上の 子どもの 車', '1'),
                        field('total', '全部で', '4'),
                    ], 'concept:l1-l19:listening-total-cars', 'l1-l19-listening-total-cars', 'わたしの車二台、妻の車一台、いちばん上の子どもの車一台、全部で四台'),
                ], [
                    line('音声', '二番、全部で何枚、何人、何回、何台ですか。'),
                    line('例', 'わあ、豊田さん、たくさんCDがありますね。何枚ありますか。日本の歌が百枚、クラシックが二百枚、ジャズが三百枚です。妻は音楽の教師ですから。'),
                    line('１', 'これは家族の写真ですか。はい。今年の一月一日に撮りました。たくさんいますね。ええ。左から私、妻、私の両親、妻の両親、そして後ろに子どもが五人います。男の子が三人と女の子が二人ですね。いいですね。ええ。一番上は十八歳、一番下は六歳です。賑やかですよ。'),
                    line('２', '豊田さんは旅行が好きですね。去年は何回外国へ行きましたか。そうですね。去年はアメリカへ三回、インドへ一回、ヨーロッパへ四回行きました。あ、韓国も二回行きました。'),
                    line('３', 'ああ素敵。これは豊田さんの車ですか。ええ。この黒い車と白い車は私のです。あの赤い車は。あれは妻のです。あちらの小さい車は一番上の子どものです。たくさんありますね。ええ。家族はみんな車が好きですから。'),
                ]),
            ],
            feedback: {
                pass: {
                    explanation: {
                        ja: '元の二つの音声と、ワークシートのすべての空欄が合いました。',
                        en: 'Every worksheet blank matches the two original recordings.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '聞き取れなかった空欄があります。元の音声をもう一度聞いて、数と品物を一つずつ確かめましょう。',
                        en: 'Some blanks do not match the recording. Listen again and check one quantity or item at a time.',
                    },
                    repairPrompt: {
                        ja: '間違えた行だけをもう一度聞いて、空欄を埋め直しましょう。',
                        en: 'Replay only the missed row and fill its blanks again.',
                    },
                    nearbyExample: {
                        ja: '例: コーヒー一つとミルク一つ。',
                        en: 'Example: one coffee and one milk.',
                    },
                },
            },
        },
    };
    return Object.freeze({
        id: 'moodle-listening-grid',
        narrative: {
            ja: 'シンが元の聞き取りシートを広げます。リエは、音声の前に空欄と品物だけを見て、答えと台本は試したあとに確かめるように言います。',
            en: 'Shin opens the original listening sheet. Before playing the recordings, Rie asks the learner to look only at the blanks and items; the answers and transcript come after an attempt.',
        },
        activity: Object.freeze(activity),
    });
}

function track(
    id: string,
    label: string,
    payloadSha256: string,
    locator: string,
    durationSeconds: number,
    tasks: readonly MoodleListeningGridTask[],
    transcript: MoodleListeningGridTrack['transcript'],
): MoodleListeningGridTrack {
    const url = tasks.map(task => {
        const sourceQuestionId = task.sourceQuestionId.replace(`${PACKAGE_ID}/`, '');
        return resolvePackagedListeningTask(PACKAGE_ID, sourceQuestionId, locator);
    });
    if (url.some(candidate => !candidate) || new Set(url).size !== 1) throw new TypeError(`Missing exact packaged binding for ${label}.`);
    return Object.freeze({
        id,
        title: { ja: `${label} を聞く`, en: `Listen: ${label}` },
        audio: {
            sourceId: `moodle-payload:${payloadSha256}`,
            payloadSha256,
            url: url[0]!,
            durationSeconds,
        },
        transcript,
        tasks,
    });
}

function task(
    id: string,
    sourceQuestionId: string,
    prompt: string,
    fields: readonly MoodleListeningGridTask['fields'][number][],
    conceptId: string,
    errorTag: string,
    reviewExpression: string,
): MoodleListeningGridTask {
    return Object.freeze({ id, sourceQuestionId: `${PACKAGE_ID}/${sourceQuestionId}`, prompt, fields, conceptId, errorTag, reviewExpression });
}

function field(id: string, label: string, answer: string) {
    return Object.freeze({ id, label, answer });
}

function line(speaker: string, text: string) {
    return Object.freeze({ speaker, text });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l1-l19 package');
    if (root.id !== PACKAGE_ID || record(root.identity, 'l1-l19 identity').moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l1-l19 package identity.');
    }
    const members = array(record(root.sourceCoverage, 'l1-l19 coverage').members, 'l1-l19 members')
        .map((value, index) => record(value, `l1-l19 member ${index}`));
    for (const [payloadSha256, title] of [
        [HANDOUT_SHA256, 'Chapter 11 listening'],
        [TRACK_43_SHA256, '43 A-43'],
        [TRACK_44_SHA256, '44 A-44'],
    ] as const) {
        const match = members.find(member => member.payloadSha256 === payloadSha256);
        if (!match || match.title !== title) throw new TypeError(`Missing exact l1-l19 Moodle source ${title}.`);
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
