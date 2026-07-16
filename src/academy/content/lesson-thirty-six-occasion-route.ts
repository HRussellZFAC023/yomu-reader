import lessonPackage from '../../../public/academy/content/lessons/038-l2-l11.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { LocalizedText } from '../domain/source-library';
import type {
    OccasionRouteModel,
    OccasionRouteMode,
    OccasionRouteRound,
    OccasionRouteSourceVisual,
} from '../minigames/occasion-route';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l2-l11';
const PACKAGE_ORDER = 38;
const MODULE_ID = 6974661;
const SOURCE_PAYLOAD_SHA256 = 'f3c29a4d4a9ffd140494c10a8908de1f09aa6387f2172ab8edd65749fd1b3533';
const SOURCE_TITLE = 'Handouts/New_Chapter 23-1 〜とき_time and occasion.pdf';
const SOURCE_PREFIX = `moodle:${MODULE_ID}:${SOURCE_PAYLOAD_SHA256}`;

const SOURCE_VISUAL: OccasionRouteSourceVisual = Object.freeze({
    sourceId: `moodle:${SOURCE_PAYLOAD_SHA256}:page:1`,
    payloadSha256: SOURCE_PAYLOAD_SHA256,
    title: SOURCE_TITLE,
    page: 1,
    url: '/academy/content/lessons/l2-l11/moodle-new-chapter-23-1-toki-page-1.png',
    sha256: 'ad277c6188de6603a9cd2fcb3ba33263dd12ddf88340f9c3b79c71bc585fd890',
    alt: {
        ja: `Moodle 原本: ${SOURCE_TITLE} 1ページ。先生の「とき」の説明、例、1-1の四問。`,
        en: `Moodle original: ${SOURCE_TITLE}, page 1, with Sensei's toki teaching, examples, and four task 1-1 prompts.`,
    },
});

export function createLessonThirtySixOccasionRouteBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = [
        round('hospital-card', 1, '1) 病院へ 行きます・保険証を 忘れないで ください →',
            '病院へ 行くとき', '病院へ 行かないとき', '保険証を 忘れないで ください。', 'affirmative',
            '病院へ 行くとき、保険証を 忘れないで ください。', [
                hint('最初の文では、病院へ行く行動が実際にあります。', 'The first source sentence says the trip to hospital does happen.'),
                hint('行きますを名詞の前の形にすると、辞書形の「行く」です。', 'Before a noun-like とき, 行きます changes to dictionary-form 行く.'),
                hint('このカードは「病院へ 行くとき」のルートです。', 'Route this card through 病院へ 行くとき.'),
            ]),
        round('umbrella-card', 2, '2) 出かけます・いつも 傘を 持って 行きます →',
            '出かけるとき', '出かけないとき', 'いつも 傘を 持って 行きます。', 'affirmative',
            '出かけるとき、いつも 傘を 持って 行きます。', [
                hint('傘を持つのは、出かける場面についての習慣です。', 'Taking an umbrella is a habit for occasions when you go out.'),
                hint('出かけますの辞書形は「出かける」です。', 'The dictionary form of 出かけます is 出かける.'),
                hint('このカードは「出かけるとき」のルートです。', 'Route this card through 出かけるとき.'),
            ]),
        round('kanji-card', 3, '3) 漢字が わかりません・この 辞書を 使います →',
            '漢字が わかるとき', '漢字が わからないとき', 'この 辞書を 使います。', 'negative',
            '漢字が わからないとき、この 辞書を 使います。', [
                hint('辞書が必要なのは、漢字がわからない場面です。', 'The dictionary is needed on occasions when the kanji is not understood.'),
                hint('わかりませんを「とき」の前に置くと、ない形の「わからない」です。', 'Before とき, わかりません becomes the nai-form わからない.'),
                hint('このカードは「漢字が わからないとき」のルートです。', 'Route this card through 漢字が わからないとき.'),
            ]),
        round('breakfast-card', 4, '4) 時間が ありません・朝ごはんを 食べません →',
            '時間が あるとき', '時間が ないとき', '朝ごはんを 食べません。', 'negative',
            '時間が ないとき、朝ごはんを 食べません。', [
                hint('朝ごはんを食べない理由は、時間がない状態です。', 'Breakfast is skipped on occasions when there is no time.'),
                hint('ありませんを「とき」の前に置く形は「ない」です。', 'The form of ありません used before とき is ない.'),
                hint('このカードは「時間が ないとき」のルートです。', 'Route this card through 時間が ないとき.'),
            ]),
    ] as const;
    const activity: OccasionRouteModel = {
        id: 'activity:l2-l11-sensei-occasion-route',
        kind: 'academy-occasion-route',
        responseKind: 'moodle-chapter-23-occasion-route',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(item => item.conceptId),
        prompt: {
            ja: '先生の Chapter 23-1 の説明と例を先に読み、元の二文を肯定・否定の正しい「とき」ルートで一文にしてください。',
            en: 'Read Sensei’s Chapter 23-1 teaching and examples first, then join each exact source pair through the correct affirmative or negative toki route.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            packageOrder: PACKAGE_ORDER,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                sourceSheets: [SOURCE_VISUAL],
                media: { status: 'no-audio-members-in-package', sourceAudioMembers: 0, sourceAudioTracksDelivered: 0 },
                answerKeyBasis: 'yomu-derived-completions-over-verbatim-source-teaching-and-prompts',
            },
            support: {
                minna: { reference: 'Minna no Nihongo I · Lessons 20, 23 and 25', reuse: 'chronology-and-scope-only' },
                genki: { crosswalk: '≈ Genki II · L17', reuse: 'sequence-only' },
            },
        },
        payload: {
            teaching: [
                {
                    title: 'Basic sentence:',
                    text: [
                        'Verb dictionary- form とき、〜。',
                        'Verb ない- form とき、〜。',
                        'い adjective 〜い とき、〜。',
                        'な adjective 〜な とき、〜。',
                        'Noun の とき、〜。',
                        '(when…/at that occasion)',
                        '↑ after とき is main clause',
                    ].join('\n'),
                },
                {
                    title: 'Sensei’s rule',
                    text: 'とき is used to connect two sentences while expressing a time or occasion when the state or action described in the main sentence exists or occurs. The form of the word preceding とき is the same as the form that modifies a noun.\n*The tense of the clause modifying とき is NOT affected by the tense of the main clause.',
                },
                {
                    title: 'れい)',
                    text: [
                        '日本(にほん)へ 帰(かえ)るとき、スーパーで お土産(みやげ)を 買(か)います。',
                        'わたしは 仕事(しごと)を するとき、 めがねが 要(い)ります。',
                        '信号(しんごう)を 渡(わた)るとき、車(くるま)に 気(き)を つけましょう。',
                        'むかし、お金(かね)が ないとき、 親(おや)に お金を かりていました。',
                        '休み(やすみ)のとき、洗濯(せんたく)をします。',
                        'こどものとき、8 時(じ)に 寝(ね)ていました。',
                        '18 歳(さい)のとき、大学(だいがく)に 入(はい)りました。',
                        '寂(さび)しいとき、 家族(かぞく)に 散歩(でんわ)します。',
                        '眠(ねむ)いとき、コーヒーを 飲(の)みます。',
                        'ひまなとき、ゲームをします。',
                        '仕事(しごと)が 大変(たいへん)なとき、サプリメントを 飲(の)みます。',
                    ].join('\n'),
                },
            ],
            taskHeading: '1-1: Using 〜とき, change the sentences to one sentence.',
            rounds,
            passScore: 1,
            feedback: {
                pass: {
                    explanation: {
                        ja: '四つの元の文が、辞書形とない形を保った一つの「とき」文になりました。',
                        en: 'All four source pairs now travel through the correct dictionary-form or nai-form occasion route.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '一つ以上のカードで、「とき」の前の肯定・否定の形を見直す必要があります。',
                        en: 'At least one card needs another look at the affirmative or negative form before toki.',
                    },
                    repairPrompt: {
                        ja: '表示されたルートだけを直し、必要ならヒントを一つずつ開きましょう。',
                        en: 'Repair only the visible routes, opening one earned hint at a time if needed.',
                    },
                    nearbyExample: {
                        ja: '先生の例では、行動がある「帰るとき」と、状態がない「お金が ないとき」の両方があります。',
                        en: 'Sensei’s examples include both an action that occurs in 帰るとき and an absent state in お金が ないとき.',
                    },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-occasion-route',
        narrative: {
            ja: 'アトラス管理デスクの境目を通し終えると、エンジェルは先生の新しい Chapter 23-1 のページを駅コンコースのりえ先生へ渡します。りえ先生は四つの案内カードを、行動や状態が「ある／ない」の二つの路線に並べます。',
            en: 'After the last threshold clears the Atlas control desk, Angel carries Sensei’s new Chapter 23-1 page to Rie at the station concourse. Rie lays four notice cards across two routes: an action or state that is present, and one that is absent.',
        },
        activity: Object.freeze(activity),
    });
}

function round(
    id: string,
    sourceOrder: OccasionRouteRound['sourceOrder'],
    sourcePrompt: string,
    affirmativeClause: string,
    negativeClause: string,
    mainClause: string,
    correctMode: OccasionRouteMode,
    answerExpression: string,
    hints: OccasionRouteRound['hints'],
): OccasionRouteRound {
    return Object.freeze({
        id,
        sourceOrder,
        sourcePage: 1,
        sourceTask: '1-1',
        sourceItem: sourceOrder,
        sourceQuestionId: `${SOURCE_PREFIX}:pdf-p1:task-1-1:q${sourceOrder}`,
        sourcePrompt,
        affirmativeClause,
        negativeClause,
        mainClause,
        correctMode,
        answerExpression,
        conceptId: `concept:l2-l11:occasion-route:${sourceOrder}`,
        errorTag: `l2-l11-occasion-route-${sourceOrder}`,
        hints,
    });
}

function hint(ja: string, en: string): LocalizedText { return Object.freeze({ ja, en }); }

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l11 package');
    const identity = record(root.identity, 'l2-l11 identity');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l2-l11 package identity.');
    }
    const coverage = record(root.sourceCoverage, 'l2-l11 coverage');
    if (coverage.archiveSha256 !== '0f2f02e0a287a1e34c11347ca3eed5f8cdfe00b4aae8a6cae13c5c5a434ba5c2') {
        throw new TypeError('Unexpected l2-l11 source archive.');
    }
    const members = array(coverage.members, 'l2-l11 members').map(value => record(value, 'l2-l11 member'));
    const sourceMatches = members.filter(member => member.payloadSha256 === SOURCE_PAYLOAD_SHA256);
    if (sourceMatches.length !== 1 || sourceMatches[0]?.title !== SOURCE_TITLE || sourceMatches[0]?.kind !== 'document') {
        throw new TypeError(`Missing unique Lesson 36 Moodle source ${SOURCE_TITLE}.`);
    }
    if (members.some(member => member.kind === 'audio')) {
        throw new TypeError('Lesson 36 expects no Moodle audio members in the exact package.');
    }
    const mapping = record(root.mapping, 'l2-l11 mapping');
    if (mapping.minna !== 'Minna no Nihongo I · Lessons 20, 23 and 25' || mapping.genki !== '≈ Genki II · L17') {
        throw new TypeError('Lesson 36 must preserve its sequence-only Minna and Genki mapping.');
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
