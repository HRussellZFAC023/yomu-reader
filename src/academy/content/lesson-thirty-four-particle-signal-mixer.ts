import lessonPackage from '../../../public/academy/content/lessons/036-l2-l09.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { LocalizedText } from '../domain/source-library';
import type {
    ParticleSignalMixerModel,
    ParticleSignalOption,
    ParticleSignalRound,
    ParticleSignalSourceVisual,
} from '../minigames/particle-signal-mixer';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l2-l09';
const PACKAGE_ORDER = 36;
const MODULE_ID = 6974657;
const SOURCE_PAYLOAD_SHA256 = 'e2e34dd1605354d4e533c936105f391125a6db82f4610365b286ad6f8286c213';
const SOURCE_TITLE = 'Handouts/Chapter 22-2 modifying clauses-2_grammar exercise.pdf';
const SOURCE_PREFIX = `moodle:${MODULE_ID}:${SOURCE_PAYLOAD_SHA256}`;

const SOURCE_VISUALS: readonly [ParticleSignalSourceVisual, ParticleSignalSourceVisual] = Object.freeze([
    sourceVisual(1, '5257d4151ac5111057e4ffe7a227e208adc5bd0b8ca4c5532687266b0a8df406'),
    sourceVisual(3, '3084a14e5136c6ee654d0d984ed11697f7bf757833f99354aa2f7f03159efea6'),
]);

export function createLessonThirtyFourParticleSignalMixerBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = [
        round('nara-photo', 1, 1, 1, '1) 〈奈良で 撮りました〉 写真を 見せて ください →', '写真を 見せて ください', [
            option('plain', '奈良で 撮った'), option('polite', '奈良で 撮りました'), option('nonpast', '奈良で 撮る'),
        ], 'plain', 'を', '奈良で 撮った 写真を 見せて ください。', [
            hint('写真を説明する節を、名詞の前で普通形にします。', 'Put the clause describing 写真 in plain form before the noun.'),
            hint('撮りました の普通形の過去は「撮った」です。', 'The plain past form of 撮りました is 撮った.'),
            hint('写真は 見せて ください の目的語なので、外側の信号は「を」です。', '写真 is the object of 見せて ください, so the outer signal is を.'),
        ]),
        round('unneeded-things', 2, 1, 2, '2) 〈要りません〉 物を 捨てます →', '物を 捨てます', [
            option('plain', '要らない'), option('polite', '要りません'), option('past', '要らなかった'),
        ], 'plain', 'を', '要らない 物を 捨てます。', [
            hint('物を説明する否定の節を普通形にします。', 'Put the negative clause describing 物 in plain form.'),
            hint('要りません の普通形の否定は「要らない」です。', 'The plain negative form of 要りません is 要らない.'),
            hint('物は 捨てます の目的語なので、外側の信号は「を」です。', '物 is the object of 捨てます, so the outer signal is を.'),
        ]),
        round('humorous-person', 3, 3, 1, '1) 〈ユーモアが あります〉 人が 好きです →', '人が 好きです', [
            option('plain', 'ユーモアが ある'), option('polite', 'ユーモアが あります'), option('past', 'ユーモアが あった'),
        ], 'plain', 'が', 'ユーモアが ある 人が 好きです。', [
            hint('人を説明する節の あります を普通形にします。', 'Put あります in plain form inside the clause describing 人.'),
            hint('あります の普通形は「ある」です。', 'The plain form of あります is ある.'),
            hint('好きです が取る名詞句なので、外側の信号は「が」です。', '好きです takes this noun phrase with the outer signal が.'),
        ]),
        round('cooking-robot', 4, 3, 2, '2) 〈料理を 作ります〉 ロボットが 欲しいです →', 'ロボットが 欲しいです', [
            option('plain', '料理を 作る'), option('polite', '料理を 作ります'), option('past', '料理を 作った'),
        ], 'plain', 'が', '料理を 作る ロボットが 欲しいです。', [
            hint('ロボットを説明する節の動詞を辞書形にします。', 'Use dictionary form for the verb in the clause describing ロボット.'),
            hint('作ります の辞書形は「作る」です。', 'The dictionary form of 作ります is 作る.'),
            hint('欲しいです が取る名詞句なので、外側の信号は「が」です。', '欲しいです takes this noun phrase with the outer signal が.'),
        ]),
    ] as const;
    const activity: ParticleSignalMixerModel = {
        id: 'activity:l2-l09-sensei-particle-signal-mixer',
        kind: 'academy-particle-signal-mixer',
        responseKind: 'moodle-chapter-22-particle-signal-mixer',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(item => item.conceptId),
        prompt: {
            ja: '先生の Chapter 22-2 の説明と例を先に読み、四つの名詞修飾節で普通形と外側の「を・が」信号を合わせましょう。',
            en: 'Read Sensei’s Chapter 22-2 rules and examples first, then tune the plain form and outer wo/ga signal for four noun-modifying clauses.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            packageOrder: PACKAGE_ORDER,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                sourceSheets: SOURCE_VISUALS,
                audio: { status: 'quarantined-unresolved-pairing', sourceAudioMembers: 1, sourceAudioTracksDelivered: 0 },
                answerKeyBasis: 'yomu-derived-transformations-over-verbatim-source-teaching-and-prompts',
            },
            support: {
                minna: { reference: 'Minna no Nihongo I · Lesson 22', reuse: 'chronology-and-scope-only' },
                genki: { crosswalk: '≈ Genki II · L15', reuse: 'sequence-only' },
            },
        },
        payload: {
            teaching: [
                {
                    title: 'Basic sentence:',
                    text: 'modifying clause (V plain-form) Noun を Verb ます。\nmodifying clause (V plain-form) Noun が ～です/ます。',
                },
                {
                    title: 'Sensei’s particle rule',
                    text: 'When noun-modifying clause + Noun is used as an object of the sentence, it’s marked by “を”.\nWhen a predicate takes such as すきな, きらいな, じょうずな, へたな, ほしい, Verb+たいです, わかります, いります and etc, noun-modifying clause + Noun is marked by “が”.',
                },
                {
                    title: 'Sensei’s time rule',
                    text: 'When talking about the time required for doing something or describing an appointment, errand, etc., the verb is put in the dictionary form and is placed in front of the noun じかん,やくそく,ようじ, etc.',
                },
                {
                    title: 'Examples:',
                    text: [
                        '日本の ともだちに あげる お土産(みやげ)を 買(か)います。',
                        'ウェイトローズで 売っていた ケーキを 食(た)べました。',
                        'わたしは このシェフが 作(つく)った ケーキが 好(す)きです。',
                        'おいしい ケーキを 作(つく)る ロボットが 欲(ほ)しいです。',
                        'わたしは ケーキを 焼(や)く 時間(じかん)が ありません。',
                        'ともだちと 映画(えいが)を 見(み)る 約束(やくそく)が あります。',
                    ].join('\n'),
                },
            ],
            taskHeadings: [
                '1: Following examples, create noun-modifying clause sentences.',
                '4: Following examples, create sentences.',
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: {
                    explanation: {
                        ja: '四つの名詞修飾節で普通形と外側の「を・が」信号を合わせられました。',
                        en: 'You tuned both the plain form and outer wo/ga signal for all four noun-modifying clauses.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '一つ以上の信号で、普通形か外側の助詞を直す必要があります。',
                        en: 'At least one signal needs a repair to its plain form or outer particle.',
                    },
                    repairPrompt: {
                        ja: '表示された信号だけを直し、必要ならヒントを一つずつ開きましょう。',
                        en: 'Repair only the visible signals, opening one earned hint at a time if needed.',
                    },
                    nearbyExample: {
                        ja: '〈彼に あげます〉 お土産を 買います → 彼に あげる お土産を 買います。',
                        en: 'In Sensei’s example, あげます becomes あげる before お土産, while the full noun phrase keeps を.',
                    },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-particle-signal-mixer',
        narrative: {
            ja: 'フェリックスが温室のことば散歩道から先生の二ページをメディア室へ渡します。ルパーナは、答えを伏せたまま、四つの名詞句を「を」と「が」の信号へ一つずつ送ります。',
            en: 'Felix passes Sensei’s two pages from the glasshouse word walk into the media room. Ruparna keeps the answers covered while mixing each full noun phrase into its wo or ga signal.',
        },
        activity: Object.freeze(activity),
    });
}

function round(
    id: string,
    sourceOrder: ParticleSignalRound['sourceOrder'],
    sourcePage: ParticleSignalRound['sourcePage'],
    sourceItem: ParticleSignalRound['sourceItem'],
    sourcePrompt: string,
    phraseTail: string,
    options: ParticleSignalRound['options'],
    correctOptionId: string,
    correctParticle: ParticleSignalRound['correctParticle'],
    answerExpression: string,
    hints: ParticleSignalRound['hints'],
): ParticleSignalRound {
    const sourceTask = sourcePage === 1 ? 1 : 4;
    return Object.freeze({
        id,
        sourceOrder,
        sourcePage,
        sourceTask,
        sourceItem,
        sourceQuestionId: `${SOURCE_PREFIX}:pdf-p${sourcePage}:task-${sourceTask}:q${sourceItem}`,
        sourcePrompt,
        phraseTail,
        options,
        correctOptionId,
        correctParticle,
        answerExpression,
        conceptId: `concept:l2-l09:particle-signal:${sourceOrder}`,
        errorTag: `l2-l09-particle-signal-${sourceOrder}`,
        hints,
    });
}

function option(id: string, label: string): ParticleSignalOption { return Object.freeze({ id, label }); }
function hint(ja: string, en: string): LocalizedText { return Object.freeze({ ja, en }); }

function sourceVisual(page: 1 | 3, sha256: string): ParticleSignalSourceVisual {
    return Object.freeze({
        sourceId: `moodle:${SOURCE_PAYLOAD_SHA256}:page:${page}`,
        payloadSha256: SOURCE_PAYLOAD_SHA256,
        title: SOURCE_TITLE,
        page,
        url: `/academy/content/lessons/l2-l09/moodle-chapter-22-2-particle-mixer-page-${page}.png`,
        sha256,
        alt: {
            ja: `Moodle 原本: ${SOURCE_TITLE} ${page}ページ`,
            en: `Moodle original: ${SOURCE_TITLE}, page ${page}`,
        },
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l09 package');
    const identity = record(root.identity, 'l2-l09 identity');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l2-l09 package identity.');
    }
    const coverage = record(root.sourceCoverage, 'l2-l09 coverage');
    if (coverage.archiveSha256 !== '09310bcbaaf7ff115e951d343296a8352284d0325a7efc9e80ae863bc45a3da6') {
        throw new TypeError('Unexpected l2-l09 source archive.');
    }
    const members = array(coverage.members, 'l2-l09 members').map(value => record(value, 'l2-l09 member'));
    const source = members.find(member => member.payloadSha256 === SOURCE_PAYLOAD_SHA256);
    if (!source || source.title !== SOURCE_TITLE) throw new TypeError(`Missing exact Lesson 34 Moodle source ${SOURCE_TITLE}.`);
    const audioMembers = members.filter(member => member.kind === 'audio');
    if (audioMembers.length !== 1 || audioMembers[0]?.payloadSha256 !== '360cef1923b1e824f22ec5ebdaf18896e87846c8c9019f25228da60675c79834') {
        throw new TypeError('Lesson 34 expects exactly one quarantined Moodle audio member.');
    }
    const mapping = record(root.mapping, 'l2-l09 mapping');
    if (mapping.minna !== 'Minna no Nihongo I · Lesson 22' || mapping.genki !== '≈ Genki II · L15') {
        throw new TypeError('Lesson 34 must preserve its sequence-only Minna and Genki mapping.');
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
