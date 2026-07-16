import lessonPackage from '../../../public/academy/content/lessons/035-l2-l08.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { LocalizedText } from '../domain/source-library';
import type { ClauseRailModel, ClauseRailOption, ClauseRailRound } from '../minigames/clause-rail';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l2-l08';
const PACKAGE_ORDER = 35;
const MODULE_ID = 6974656;
const SOURCE_PAYLOAD_SHA256 = '262f9da24884b3868c4d87d84fccdffc8be353856f6603072139ef1cec182685';
const SOURCE_IMAGE_SHA256 = '36a073904a47724326460931351b7a5e9c66c60a502e085fd26fb2f64e29c642';
const SOURCE_TITLE = 'Handouts/Chapter 22-1 modifying clauses_grammar exercise 1-1.pdf';
const SOURCE_PREFIX = `moodle:${MODULE_ID}:${SOURCE_PAYLOAD_SHA256}:pdf-p1:clause-rail`;

export function createLessonThirtyThreeClauseRailBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = [
        round('mother-coat', 1, '〈母に もらいました〉 コート →', 'コート', [
            option('plain', '母に もらった'), option('polite', '母に もらいました'), option('no', '母の もらった'),
        ], 'plain', 'これは 母に もらった コートです。', [
            hint('コートを説明する節は、名詞のすぐ前に置きます。', 'The clause describing the coat goes directly before the noun.'),
            hint('もらいましたを普通形の過去にします。', 'Change もらいました to its plain past form.'),
            hint('母に もらった + コート の順につなぎます。', 'Attach 母に もらった + コート in that order.'),
        ]),
        round('kyoto-photo', 2, '〈京都で 撮りました〉 写真 →', '写真', [
            option('plain', '京都で 撮った'), option('polite', '京都で 撮りました'), option('no', '京都の 撮った'),
        ], 'plain', 'これは 京都で 撮った 写真です。', [
            hint('写真を説明する節は、写真のすぐ前に置きます。', 'The clause describing the photo goes directly before 写真.'),
            hint('撮りましたを普通形の過去「撮った」にします。', 'Change 撮りました to the plain past 撮った.'),
            hint('京都で 撮った + 写真 の順につなぎます。', 'Attach 京都で 撮った + 写真 in that order.'),
        ]),
        round('maria-cake', 3, '〈マリアさんが 作りました〉 ケーキ →', 'ケーキ', [
            option('plain', 'マリアさんが 作った'), option('wa', 'マリアさんは 作った'), option('polite', 'マリアさんが 作りました'),
        ], 'plain', 'これは マリアさんが 作った ケーキです。', [
            hint('節の中で、作った人には が を使います。', 'Inside the clause, mark the person who made it with が.'),
            hint('作りましたを普通形の過去「作った」にします。', 'Change 作りました to the plain past 作った.'),
            hint('マリアさんが 作った + ケーキ の順につなぎます。', 'Attach マリアさんが 作った + ケーキ in that order.'),
        ]),
        round('karina-picture', 4, '〈カリナさんが かきました〉 絵 →', '絵', [
            option('plain', 'カリナさんが かいた'), option('wa', 'カリナさんは かいた'), option('polite', 'カリナさんが かきました'),
        ], 'plain', 'これは カリナさんが かいた 絵です。', [
            hint('節の中で、絵をかいた人には が を使います。', 'Inside the clause, mark the person who drew the picture with が.'),
            hint('かきましたを普通形の過去「かいた」にします。', 'Change かきました to the plain past かいた.'),
            hint('カリナさんが かいた + 絵 の順につなぎます。', 'Attach カリナさんが かいた + 絵 in that order.'),
        ]),
    ] as const;
    const activity: ClauseRailModel = {
        id: 'activity:l2-l08-sensei-clause-rail',
        kind: 'academy-clause-rail',
        responseKind: 'moodle-chapter-22-clause-rail',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(item => item.conceptId),
        prompt: {
            ja: '先生の Chapter 22-1 の基本文と例を読んでから、四つの節を普通形にして名詞の直前につなぎましょう。',
            en: 'Read Sensei’s Chapter 22-1 basic sentence and examples, then put each clause in plain form and attach it directly before its noun.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            packageOrder: PACKAGE_ORDER,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                sourceSheet: {
                    sourceId: `moodle:${SOURCE_PAYLOAD_SHA256}:page:1`,
                    payloadSha256: SOURCE_PAYLOAD_SHA256,
                    title: SOURCE_TITLE,
                    page: 1,
                    url: '/academy/content/lessons/l2-l08/moodle-chapter-22-1-clause-rail-page-1.png',
                    sha256: SOURCE_IMAGE_SHA256,
                    alt: { ja: `Moodle 原本: ${SOURCE_TITLE} 1ページ`, en: `Moodle original: ${SOURCE_TITLE}, page 1` },
                },
                audio: { status: 'quarantined-unresolved-pairing', sourceAudioMembers: 2, sourceAudioTracksDelivered: 0 },
                answerKeyBasis: 'yomu-derived-clause-transformations-over-verbatim-source-teaching-and-prompts',
            },
            support: {
                minna: { reference: 'Minna no Nihongo I · Chapter 22 (source inventory label)', reuse: 'chronology-and-scope-only' },
                genki: { crosswalk: 'none-verified', reuse: 'none' },
            },
        },
        payload: {
            teaching: [
                {
                    title: 'Basic sentence:',
                    text: 'Noun 1 は modifying clause (V plain-form) Noun 2 です。',
                },
                {
                    title: 'Examples:',
                    text: [
                        'これは みなさんが 使(つか)う 教科書(きょうかしょ)です。',
                        'これは 去年(きょねん) かったシャツです。',
                        'このワインは フランスで 作(つく)った ワインです。',
                        'ここは 自転車(じてんしゃ)を おく ところです。',
                        'えきは 電車(でんしゃ)に のる ところです。',
                        '小林(こばやし)さんは ふじさんに 登(のぼ)ったことがある ひとです。',
                        'タワポンさんは ふじさんに 登ったことがない ひとです。',
                    ].join('\n'),
                },
                {
                    title: 'Sensei’s task',
                    text: '1: Change the sentences and explain what the object is.',
                },
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: { explanation: { ja: '四つの節を普通形にして、それぞれの名詞の直前につなげられました。', en: 'You put all four clauses in plain form and attached each directly before its noun.' } },
                lapse: {
                    explanation: { ja: '一つ以上のレールで、普通形か名詞との境界を直す必要があります。', en: 'At least one rail needs a repair to the plain form or its boundary with the noun.' },
                    repairPrompt: { ja: '表示されたレールだけを直し、必要ならヒントを一つずつ開きましょう。', en: 'Repair only the visible rails, opening one earned hint at a time if needed.' },
                    nearbyExample: { ja: '〈パリで 買いました〉 帽子 → パリで 買った 帽子', en: 'For the source example, 買いました becomes 買った directly before 帽子.' },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-clause-rail',
        narrative: {
            ja: 'フェリックスが温室のことば散歩道に、先生の四つの物の札を並べます。シンから届いた掲示を先に読み、答えを見せずに節の札を名詞の直前まで動かします。',
            en: 'Felix lays out Sensei’s four object cards along the glasshouse word walk. He reads the display sent on from Shin first, then keeps the answers covered while the learner moves each clause ticket directly before its noun.',
        },
        activity: Object.freeze(activity),
    });
}

function round(
    id: string,
    sourceOrder: ClauseRailRound['sourceOrder'],
    sourcePrompt: string,
    noun: string,
    options: ClauseRailRound['options'],
    correctOptionId: string,
    answerExpression: string,
    hints: ClauseRailRound['hints'],
): ClauseRailRound {
    return Object.freeze({
        id,
        sourceOrder,
        sourceQuestionId: `${SOURCE_PREFIX}:q${sourceOrder}`,
        sourcePrompt,
        noun,
        options,
        correctOptionId,
        answerExpression,
        conceptId: `concept:l2-l08:noun-modifying-clause:${sourceOrder}`,
        errorTag: `l2-l08-clause-rail-${sourceOrder}`,
        hints,
    });
}

function option(id: string, label: string): ClauseRailOption { return Object.freeze({ id, label }); }
function hint(ja: string, en: string): LocalizedText { return Object.freeze({ ja, en }); }

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l08 package');
    const identity = record(root.identity, 'l2-l08 identity');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l2-l08 package identity.');
    }
    const coverage = record(root.sourceCoverage, 'l2-l08 coverage');
    if (coverage.archiveSha256 !== 'c43954869cb523aa2aff9052780bc14d31f06731d8c4e1fe8132914e0d33fe5d') {
        throw new TypeError('Unexpected l2-l08 source archive.');
    }
    const members = array(coverage.members, 'l2-l08 members').map(value => record(value, 'l2-l08 member'));
    const source = members.find(member => member.payloadSha256 === SOURCE_PAYLOAD_SHA256);
    if (!source || source.title !== SOURCE_TITLE) throw new TypeError(`Missing exact Lesson 33 Moodle source ${SOURCE_TITLE}.`);
    const audioMembers = members.filter(member => member.kind === 'audio');
    if (audioMembers.length !== 2) throw new TypeError('Lesson 33 expects exactly two quarantined Moodle audio members.');
    const mapping = record(root.mapping, 'l2-l08 mapping');
    if (mapping.minna !== 'Minna no Nihongo I · Chapter 22 (source inventory label)'
        || mapping.genki !== 'No verified Genki crosswalk asserted.') {
        throw new TypeError('Lesson 33 must preserve the package mapping without inventing a Genki crosswalk.');
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
