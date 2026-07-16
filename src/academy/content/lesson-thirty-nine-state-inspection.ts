import lessonPackage from '../../../public/academy/content/lessons/041-l2-l14.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { LocalizedText } from '../domain/source-library';
import type {
    StateInspectionInteraction,
    StateInspectionModel,
    StateInspectionOption,
    StateInspectionRound,
    StateInspectionSourceVisual,
} from '../minigames/state-inspection';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l2-l14';
const PACKAGE_ORDER = 41;
const MODULE_ID = 8121267;
const ARCHIVE_ID = 'archive-000087';
const SOURCE_PAYLOAD_SHA256 = '3b6d33916d8db01f3aa529f0d908f32cdff051c259f7e3c53f0e90f54e685605';
const SOURCE_TITLE = 'Handouts/New_Chapter 29-1〜ている-4_intransitive verbs_States in Effect grammar exercise.pdf';
const SOURCE_PREFIX = `moodle:${MODULE_ID}:${SOURCE_PAYLOAD_SHA256}`;

const SOURCE_VISUALS: StateInspectionModel['provenance']['moodle']['sourceSheets'] = Object.freeze([
    sourceVisual(1, '2e2caf0281d4fded34bbe048ea394bbd68587c65368dcfcb24fc5aa51b3668de', {
        ja: 'Moodle 原本: Chapter 29-1 1ページ。自動詞と他動詞、結果の状態、が、六つの例。',
        en: 'Moodle original: Chapter 29-1 page 1, with transitive/intransitive contrast, resulting-state teaching, ga, and six examples.',
    }),
    sourceVisual(2, 'b96eb554de5fe31948496e2584883a77d1a0312ae8a1ba40754fb773b00d7127', {
        ja: 'Moodle 原本: Chapter 29-1 2ページ。絵の状態、状態と次の行動、会話の課題。',
        en: 'Moodle original: Chapter 29-1 page 2, with picture states, state-plus-action prompts, and conversation practice.',
    }),
    sourceVisual(3, '7e96bf07343e125e13aa037620067d968cb6ae4577b3ba575e61b0ba6481225f', {
        ja: 'Moodle 原本: Chapter 29-1 3ページ。短い会話、話題の「は」、壊れた物の返答。',
        en: 'Moodle original: Chapter 29-1 page 3, with short conversations, topic wa, and damaged-object replies.',
    }),
    sourceVisual(4, '6ece5c49c000519585b15a5d3510b8b2943f4c4832199b15642af475f0fadcd9', {
        ja: 'Moodle 原本: Chapter 29-1 4ページ。道具の会話と地震後の読み・報告課題。',
        en: 'Moodle original: Chapter 29-1 page 4, with tool conversations and the post-earthquake reading/report task.',
    }),
]);

export function createLessonThirtyNineStateInspectionBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = [
        round('light-on', 1, 1, 'state-select',
            '1）[絵: 電気がついている] →',
            '電気が ついて います。', [
                option('電気が ついて います。', '電気が ついて います。', 'The light is on.'),
                option('電気を つけて います。', '電気を つけて います。', 'Someone is switching on the light.'),
            ], [
                hint('絵では、電気の今の状態を言います。', 'Report the light’s visible state.'),
                hint('物の状態なので、助詞は「が」です。', 'Use ga for the thing whose state is visible.'),
                hint('自動詞「つきます」のて形は「ついて」です。', 'The te-form of intransitive つきます is ついて.'),
            ]),
        round('plate-broken', 1, 2, 'state-select',
            '2）[絵: お皿が割れている] →',
            'お皿が 割れて います。', [
                option('お皿が 割れて います。', 'お皿が 割れて います。', 'The plate is broken.'),
                option('お皿を 割って います。', 'お皿を 割って います。', 'Someone is breaking the plate.'),
            ], [
                hint('割れたあとに残っている状態です。', 'This is the state left after the plate broke.'),
                hint('だれが割ったかではなく、お皿を主語にします。', 'Make the plate the subject; no person who broke it is named.'),
                hint('「お皿が」＋自動詞「割れています」です。', 'Use お皿が plus the intransitive 割れています.'),
            ]),
        round('button-off', 1, 3, 'state-select',
            '3）[絵: ボタンが外れている] →',
            'ボタンが 外れて います。', [
                option('ボタンが 外れて います。', 'ボタンが 外れて います。', 'The button has come off.'),
                option('ボタンを 外して います。', 'ボタンを 外して います。', 'Someone is removing the button.'),
            ], [
                hint('ボタンは、もう服から離れています。', 'The button is already separated from the shirt.'),
                hint('今の状態なので「外れています」を使います。', 'Use 外れています for the current resulting state.'),
                hint('助詞は「が」: ボタンが外れています。', 'The particle is ga: ボタンが外れています.'),
            ]),
        round('dirty-table', 2, 1, 'action-choice',
            '1）テーブル・汚れます・ふいて ください →',
            'テーブルが 汚れて いますから、ふいて ください。', [
                option('テーブルが 汚れて いますから、ふいて ください。', 'テーブルが汚れていますから、ふいてください。', 'The table is dirty, so please wipe it.'),
                option('テーブルを 汚して いますから、ふいて ください。', 'テーブルを汚していますから、ふいてください。', 'Someone is dirtying the table, so please wipe it.'),
            ], [
                hint('最初にテーブルの状態を「が」で報告します。', 'First report the table’s state with ga.'),
                hint('「汚れます」→「汚れています」です。', 'Change 汚れます to 汚れています.'),
                hint('状態のあとに「から」、次の行動「ふいてください」を置きます。', 'Add から after the state, then the action ふいてください.'),
            ]),
        round('stopped-clock', 2, 2, 'action-choice',
            '2）時計・止まります・電池を 取り替えて ください →',
            '時計が 止まって いますから、電池を 取り替えて ください。', [
                option('時計が 止まって いますから、電池を 取り替えて ください。', '時計が止まっていますから、電池を取り替えてください。', 'The clock has stopped, so please replace the battery.'),
                option('時計を 止めて いますから、電池を 取り替えて ください。', '時計を止めていますから、電池を取り替えてください。', 'Someone is stopping the clock, so please replace the battery.'),
            ], [
                hint('時計そのものの状態を報告します。', 'Report the clock itself as the thing in a state.'),
                hint('「止まります」のて形は「止まって」です。', 'The te-form of 止まります is 止まって.'),
                hint('「時計が止まっていますから」のあとに電池の行動を置きます。', 'Follow 時計が止まっていますから with the battery action.'),
            ]),
        round('broken-washer', 2, 3, 'action-choice',
            '3）洗濯機・壊れます・手で 洗わなければ なりません →',
            '洗濯機が 壊れて いますから、手で 洗わなければ なりません。', [
                option('洗濯機が 壊れて いますから、手で 洗わなければ なりません。', '洗濯機が壊れていますから、手で洗わなければなりません。', 'The washing machine is broken, so we must wash by hand.'),
                option('洗濯機を 壊して いますから、手で 洗わなければ なりません。', '洗濯機を壊していますから、手で洗わなければなりません。', 'Someone is breaking the washing machine, so we must wash by hand.'),
            ], [
                hint('原因は、洗濯機の今の状態です。', 'The reason is the washing machine’s current state.'),
                hint('自動詞は「壊れます」、状態は「壊れています」です。', 'The intransitive verb is 壊れます; its state is 壊れています.'),
                hint('「洗濯機が壊れていますから」のあとに必要な行動を残します。', 'Keep the necessary action after 洗濯機が壊れていますから.'),
            ]),
        round('closed-supermarket', 2, 4, 'typed-report',
            '4）スーパー・閉まります・コンビニで 買いましょう →',
            'スーパーが 閉まって いますから、コンビニで 買いましょう。', [], [
                hint('スーパーの状態を「が」で始めます。', 'Begin with the supermarket as the thing in a state, marked by ga.'),
                hint('「閉まります」→「閉まっています」です。', 'Change 閉まります to 閉まっています.'),
                hint('「スーパーが閉まっていますから」のあとに「コンビニで買いましょう」です。', 'After スーパーが閉まっていますから, add コンビニで買いましょう.'),
            ]),
        round('cracked-cup', 5, 1, 'typed-report',
            '1）この コップを 使っても いいですか。 →',
            'その コップは 割れて いますよ。', [], [
                hint('質問に出たコップを、返答では話題として取り上げます。', 'In the reply, take the cup from the question as the topic.'),
                hint('先生のポイントどおり、話題には「は」を使います。', 'Following Sensei’s point, use wa for the introduced topic.'),
                hint('「そのコップは」のあとに、割れた状態「割れていますよ」を置きます。', 'After そのコップは, add the broken state 割れていますよ.'),
            ]),
    ] as const;
    const activity: StateInspectionModel = {
        id: 'activity:l2-l14-sensei-state-inspection',
        kind: 'academy-state-inspection',
        responseKind: 'moodle-chapter-29-resulting-state-inspection',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(item => item.conceptId),
        prompt: {
            ja: '先生の Chapter 29-1 の四ページを先に読み、見える結果の状態、次の行動、話題の「は」を八つの原問で報告してください。',
            en: 'Read Sensei’s four Chapter 29-1 pages first, then report visible resulting states, next actions, and topic wa across eight selected source prompts.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            packageOrder: PACKAGE_ORDER,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                archiveId: ARCHIVE_ID,
                sourceSheets: SOURCE_VISUALS,
                media: { status: 'audio-members-quarantined-unpaired', sourceAudioMembers: 4, sourceAudioTracksDelivered: 0 },
                answerKeyBasis: 'yomu-derived-completions-over-canonical-source-pages-and-prompts',
            },
            support: {
                minna: { reference: 'Minna no Nihongo II · Lesson 29', reuse: 'chronology-and-scope-only' },
                genki: { crosswalk: '≈ Genki II · Resulting states and verb pairs', reuse: 'sequence-only' },
            },
        },
        payload: {
            teaching: [
                { title: 'Basic sentence:', text: 'Verb て-form います／いません。' },
                {
                    title: 'Sensei’s resulting-state rule',
                    text: 'Another way of using V て-form います/いません is to show that the state resulting from the action indicated by the verb is still continuing (the state is still in effect).',
                },
                {
                    title: 'Sensei’s intransitive and が rule',
                    text: 'Verbs that can be used in this way include many intransitive verbs such as あきます、しまります、つきます、きえます、こわれます、われます. When describing a situation in front of one’s eyes as a whole, the subject is indicated by が.',
                },
                {
                    title: 'Sensei’s topic note',
                    text: 'When introducing the subject as the topic, the particle は is used as in examples.',
                },
                {
                    title: 'れい)',
                    text: [
                        '木の枝(えだ)が 折(お)れて います。',
                        '窓(まど)ガラスが 割(わ)れて います。',
                        'パソコンが 壊(こわ)れて います。',
                        'コップに 水(みず)が 入(はい)って います。',
                        '電気(でんき)が ついて います。',
                        'iPhone に カメラが 付(つ)いて います。',
                    ].join('\n'),
                },
            ],
            taskHeadings: [
                { sourceTask: 1, text: '1: Look at the picture below and please describe the state in effect.' },
                { sourceTask: 2, text: '2: Following the example, please create sentence to tell the state and what to do.' },
                { sourceTask: 5, text: '5: Following the example, please create sentence to tell the state and what to do.' },
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: { explanation: {
                    ja: '八つの原問が、自動詞の結果状態、次の行動、話題の「は」を保った報告になりました。',
                    en: 'All eight source prompts now preserve the intransitive resulting state, the next action, or the topic-wa reply.',
                } },
                lapse: {
                    explanation: {
                        ja: '一つ以上の報告で、自動詞・助詞・状態のあとに続く行動を見直す必要があります。',
                        en: 'At least one report needs another look at the intransitive verb, particle, or action following the state.',
                    },
                    repairPrompt: {
                        ja: '表示された問題だけを直し、必要ならヒントを一つずつ開きましょう。',
                        en: 'Repair only the visible prompts, opening one earned hint at a time if needed.',
                    },
                    nearbyExample: {
                        ja: '先生の例「エアコンがついていますから、消してください」では、が＋状態のあとに「から」と次の行動があります。',
                        en: 'Sensei’s example エアコンがついていますから、消してください uses ga plus the state, then から and the next action.',
                    },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-state-inspection',
        narrative: {
            ja: 'カフェの集まりが終わると、ロバートが先生の Chapter 29-1 の四ページをメディア室のルパーナへ届けます。部屋に残った光、壊れた物、閉まった設備を読み、次の人が安全に片づけられる引き継ぎにします。',
            en: 'When the cafe gathering ends, Robert carries Sensei’s four Chapter 29-1 pages to Ruparna in the media room. They read the light, damaged objects, and closed equipment left behind so the next person receives a safe room handover.',
        },
        activity: Object.freeze(activity),
    });
}

function round(
    id: string,
    sourceTask: 1 | 2 | 5,
    sourceItem: 1 | 2 | 3 | 4,
    interaction: StateInspectionInteraction,
    sourcePrompt: string,
    answerExpression: string,
    options: readonly StateInspectionOption[],
    hints: StateInspectionRound['hints'],
): StateInspectionRound {
    const sourceOrder = sourceOrderFor(sourceTask, sourceItem);
    const sourcePage = sourceTask === 5 ? 3 : 2;
    return Object.freeze({
        id, interaction, sourceOrder, sourcePage, sourceTask, sourceItem,
        sourceQuestionId: `${SOURCE_PREFIX}:pdf-p${sourcePage}:task-${sourceTask}:q${sourceItem}`,
        sourcePrompt, options, answerValue: answerExpression, answerExpression,
        acceptedAnswers: [answerExpression],
        conceptId: `concept:l2-l14:resulting-state:${sourceOrder}`,
        errorTag: `l2-l14-state-inspection-${sourceOrder}`,
        hints,
    });
}

function sourceOrderFor(
    sourceTask: 1 | 2 | 5,
    sourceItem: 1 | 2 | 3 | 4,
): StateInspectionRound['sourceOrder'] {
    if (sourceTask === 1 && sourceItem <= 3) return sourceItem as 1 | 2 | 3;
    if (sourceTask === 2) return (sourceItem + 3) as 4 | 5 | 6 | 7;
    if (sourceTask === 5 && sourceItem === 1) return 8;
    throw new TypeError(`Unsupported Chapter 29-1 source locus: task ${sourceTask}, item ${sourceItem}.`);
}

function option(value: string, ja: string, en: string): StateInspectionOption {
    return Object.freeze({ value, label: Object.freeze({ ja, en }) });
}

function hint(ja: string, en: string): LocalizedText { return Object.freeze({ ja, en }); }

function sourceVisual(page: 1 | 2 | 3 | 4, sha256: string, alt: LocalizedText): StateInspectionSourceVisual {
    return Object.freeze({
        sourceId: `moodle:${SOURCE_PAYLOAD_SHA256}:page:${page}`,
        payloadSha256: SOURCE_PAYLOAD_SHA256,
        title: SOURCE_TITLE,
        page,
        url: `/academy/content/lessons/l2-l14/moodle-chapter-29-1-states-page-${page}.png`,
        sha256,
        alt: Object.freeze(alt),
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l14 package');
    const identity = record(root.identity, 'l2-l14 identity');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l2-l14 package identity.');
    }
    const coverage = record(root.sourceCoverage, 'l2-l14 coverage');
    if (coverage.archiveId !== ARCHIVE_ID
        || coverage.archiveSha256 !== 'ea0cf0b1def9dc28a54b407b1cd275b84287b64edba25ef5c3066f9eb5030e96') {
        throw new TypeError('Unexpected l2-l14 source archive.');
    }
    const members = array(coverage.members, 'l2-l14 members').map(value => record(value, 'l2-l14 member'));
    const sourceMatches = members.filter(member => member.payloadSha256 === SOURCE_PAYLOAD_SHA256);
    if (sourceMatches.length !== 1 || sourceMatches[0]?.title !== SOURCE_TITLE || sourceMatches[0]?.kind !== 'document') {
        throw new TypeError(`Missing unique Lesson 39 Moodle source ${SOURCE_TITLE}.`);
    }
    if (members.filter(member => member.kind === 'audio').length !== 4) {
        throw new TypeError('Lesson 39 expects four quarantined Moodle audio members in the exact package.');
    }
    const mapping = record(root.mapping, 'l2-l14 mapping');
    if (mapping.minna !== 'Minna no Nihongo II · Lesson 29'
        || mapping.genki !== '≈ Genki II · Resulting states and verb pairs') {
        throw new TypeError('Lesson 39 must preserve its sequence-only Minna and Genki mapping.');
    }
}

function record(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`Expected ${label}.`);
    return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`Expected ${label}.`);
    return value;
}
