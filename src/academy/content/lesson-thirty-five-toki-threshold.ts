import lessonPackage from '../../../public/academy/content/lessons/037-l2-l10.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { LocalizedText } from '../domain/source-library';
import type { TokiThresholdModel, TokiThresholdRound, TokiThresholdSourceVisual, TokiTiming } from '../minigames/toki-threshold';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l2-l10';
const PACKAGE_ORDER = 37;
const MODULE_ID = 6974659;
const SOURCE_PAYLOAD_SHA256 = '7f88544f889d1c316fb911a2b67d5fe78893f6f2344e29aee25689994646c381';
const SOURCE_TITLE = 'Handouts/Chapter 23-1 〜とき_time and occasion.pdf';
const SOURCE_PREFIX = `moodle:${MODULE_ID}:${SOURCE_PAYLOAD_SHA256}`;

const SOURCE_VISUALS: readonly [TokiThresholdSourceVisual, TokiThresholdSourceVisual] = Object.freeze([
    sourceVisual(4, '948b81d988e549e8b51c5fcc94934eb1607fbe86097b6f4d154b63d4b07c36d6'),
    sourceVisual(5, '646ada214d1e57addc244e105a51957749edcecc897f654dedebb96ff698c187'),
]);

export function createLessonThirtyFiveTokiThresholdBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = [
        round('good-night', 1, '1) 「お休みなさい」 →', '寝る とき', '寝た とき', 'before', '寝るとき、「お休みなさい」と 言います。', [
            hint('「お休みなさい」は、寝る動作が終わる前に言います。', 'You say good night before the act of going to sleep is complete.'),
            hint('完了する前の場面は、辞書形を使います。', 'A before-completion occasion uses dictionary form.'),
            hint('この境目では「寝る とき」を選びます。', 'At this threshold, choose 寝る とき.'),
        ]),
        round('good-morning', 2, '2) 「おはよう ございます」 →', '友達に 会う とき', '友達に 会った とき', 'after', '朝、友達に 会ったとき、「おはよう ございます」と 言います。', [
            hint('あいさつは、朝に友達と会った場面で出ます。', 'The greeting occurs once you have met your friend in the morning.'),
            hint('会う動作を完了した場面は、た形を使います。', 'An occasion after meeting is complete uses the ta-form.'),
            hint('この境目では「友達に 会った とき」を選びます。', 'At this threshold, choose 友達に 会った とき.'),
        ]),
        round('thank-you', 3, '3) 「ありがとう ございます」 →', 'プレゼントを もらう とき', 'プレゼントを もらった とき', 'after', 'プレゼントを もらったとき、「ありがとう ございます」と 言います。', [
            hint('ありがとうは、プレゼントを受け取ったことへの返事です。', 'The thanks responds to receiving the present.'),
            hint('受け取る動作が終わった場面は、た形を使います。', 'An occasion after receiving is complete uses the ta-form.'),
            hint('この境目では「プレゼントを もらった とき」を選びます。', 'At this threshold, choose プレゼントを もらった とき.'),
        ]),
        round('excuse-me', 4, '4) 「失礼します」 →', '部屋に 入る とき', '部屋に 入った とき', 'before', '部屋に 入るとき、「失礼します」と 言います。', [
            hint('「失礼します」は、部屋へ入る前の声かけです。', 'You say excuse me before entering the room.'),
            hint('入る動作が終わる前の場面は、辞書形を使います。', 'An occasion before entering is complete uses dictionary form.'),
            hint('この境目では「部屋に 入る とき」を選びます。', 'At this threshold, choose 部屋に 入る とき.'),
        ]),
    ] as const;
    const activity: TokiThresholdModel = {
        id: 'activity:l2-l10-sensei-toki-threshold',
        kind: 'academy-toki-threshold',
        responseKind: 'moodle-chapter-23-toki-threshold',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(item => item.conceptId),
        prompt: {
            ja: '先生の Chapter 23-1 の説明と例を先に読み、四つのことばを動作の完了前・完了後の境目へ送ってください。',
            en: 'Read Sensei’s Chapter 23-1 rule and examples first, then route four speech bubbles to before or after the action completes.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            packageOrder: PACKAGE_ORDER,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                sourceSheets: SOURCE_VISUALS,
                audio: { status: 'quarantined-unresolved-pairing', sourceAudioMembers: 4, sourceAudioTracksDelivered: 0 },
                answerKeyBasis: 'yomu-derived-timing-completions-over-verbatim-source-teaching-and-prompts',
            },
            support: {
                minna: { reference: 'Minna no Nihongo I · Lessons 22–23', reuse: 'chronology-and-scope-only' },
                genki: { crosswalk: '≈ Genki II · L16', reuse: 'sequence-only' },
            },
        },
        payload: {
            teaching: [
                {
                    title: 'Basic sentence:',
                    text: 'Verb dictionary- form とき、〜。\nVerb た- form とき、〜。',
                },
                {
                    title: 'Sensei’s timing rule',
                    text: 'When the verb in front of とき is the dictionary form, whatever is described in the main clause happened before whatever is described in the 〜とき clause. When the verb in front of とき is in the た-form, whatever is described in the main clause happened after whatever is described in the 〜とき clause.',
                },
                {
                    title: 'Examples:',
                    text: [
                        '日本へ 帰(かえ)ったとき、友達(ともだち)に お土産(みやげ)を あげます。',
                        '会社(かいしゃ)へ 行ったとき、社長(しゃちょう)に 会(あ)いました。',
                        'ごはんを 食(た)べるとき、「いただきます」と 言(い)います。',
                        'ごはんを 食(た)べたとき、「ごちそうさま」と 言(い)います。',
                        '電車(でんしゃ)を 降(お)りたとき、傘(かさ)を 忘(わす)れました。',
                    ].join('\n'),
                },
                {
                    title: 'For example：',
                    text: '① means that the bag was bought before arriving in Paris, i.e. it was bought on the way there,\nwhile ② means that the bag was bought after arriving in Paris, i.e. it was bought in Paris.\n①パリへ 行くとき、 新(あたら)しい かばんを 買(か)いました。\nI bought a bag when going to Paris.\n②パリへ 行ったとき、 新しい かばんを 買いました。\nI bought a bag when I went to Paris.',
                },
            ],
            taskHeading: '7: Look at the picture below and create sentences.',
            rounds,
            passScore: 1,
            feedback: {
                pass: {
                    explanation: {
                        ja: '四つのことばを、動作が完了する前と完了した後の正しい境目へ送れました。',
                        en: 'You routed all four speech bubbles to the correct side of action completion.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '一つ以上のことばで、動作の完了前・完了後を見直す必要があります。',
                        en: 'At least one speech bubble needs a second look at before versus after completion.',
                    },
                    repairPrompt: {
                        ja: '表示された境目だけを直し、必要ならヒントを一つずつ開きましょう。',
                        en: 'Repair only the visible thresholds, opening one earned hint at a time if needed.',
                    },
                    nearbyExample: {
                        ja: '先生の例では、食べるときに「いただきます」、食べたときに「ごちそうさま」と言います。',
                        en: 'In Sensei’s examples, いただきます comes with 食べるとき and ごちそうさま with 食べたとき.',
                    },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-toki-threshold',
        narrative: {
            ja: 'ルパーナがメディア室から先生の二ページを送ると、エンジェルはアトラス管理デスクの駅ルートに「完了する前／完了した後」の境目を引きます。答えを伏せたまま、四つのことばを一つずつ通します。',
            en: 'Ruparna sends Sensei’s two pages from the media room. At the Atlas control desk, Onke draws a before/after threshold across the station route and keeps every completion covered while the four speech bubbles cross one by one.',
        },
        activity: Object.freeze(activity),
    });
}

function round(
    id: string,
    sourceOrder: TokiThresholdRound['sourceOrder'],
    sourcePrompt: string,
    beforeForm: string,
    afterForm: string,
    correctTiming: TokiTiming,
    answerExpression: string,
    hints: TokiThresholdRound['hints'],
): TokiThresholdRound {
    return Object.freeze({
        id,
        sourceOrder,
        sourcePage: 5,
        sourceTask: 7,
        sourceItem: sourceOrder,
        sourceQuestionId: `${SOURCE_PREFIX}:pdf-p5:task-7:q${sourceOrder}`,
        sourcePrompt,
        beforeForm,
        afterForm,
        correctTiming,
        answerExpression,
        conceptId: `concept:l2-l10:toki-threshold:${sourceOrder}`,
        errorTag: `l2-l10-toki-threshold-${sourceOrder}`,
        hints,
    });
}

function hint(ja: string, en: string): LocalizedText { return Object.freeze({ ja, en }); }

function sourceVisual(page: 4 | 5, sha256: string): TokiThresholdSourceVisual {
    return Object.freeze({
        sourceId: `moodle:${SOURCE_PAYLOAD_SHA256}:page:${page}`,
        payloadSha256: SOURCE_PAYLOAD_SHA256,
        title: SOURCE_TITLE,
        page,
        url: `/academy/content/lessons/l2-l10/moodle-chapter-23-1-toki-threshold-page-${page}.png`,
        sha256,
        alt: {
            ja: `Moodle 原本: ${SOURCE_TITLE} ${page}ページ`,
            en: `Moodle original: ${SOURCE_TITLE}, page ${page}`,
        },
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l10 package');
    const identity = record(root.identity, 'l2-l10 identity');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l2-l10 package identity.');
    }
    const coverage = record(root.sourceCoverage, 'l2-l10 coverage');
    if (coverage.archiveSha256 !== '717787bb3eb1af1b75d149b26cef1e1386950430020c3c583b790523d6f0404c') {
        throw new TypeError('Unexpected l2-l10 source archive.');
    }
    const members = array(coverage.members, 'l2-l10 members').map(value => record(value, 'l2-l10 member'));
    const sourceMatches = members.filter(member => member.payloadSha256 === SOURCE_PAYLOAD_SHA256);
    if (sourceMatches.length !== 1 || sourceMatches[0]?.title !== SOURCE_TITLE) {
        throw new TypeError(`Missing unique Lesson 35 Moodle source ${SOURCE_TITLE}.`);
    }
    const audioMembers = members.filter(member => member.kind === 'audio');
    if (audioMembers.length !== 4) throw new TypeError('Lesson 35 expects exactly four quarantined Moodle audio members.');
    const mapping = record(root.mapping, 'l2-l10 mapping');
    if (mapping.minna !== 'Minna no Nihongo I · Lessons 22–23' || mapping.genki !== '≈ Genki II · L16') {
        throw new TypeError('Lesson 35 must preserve its sequence-only Minna and Genki mapping.');
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
