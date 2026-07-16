import lessonPackage from '../../../public/academy/content/lessons/056-l2-l29.json';
import sharedListeningPackage from '../../../public/academy/content/lessons/055-l2-l28.json';
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

const PACKAGE_ID = 'l2-l29';
const PACKAGE_ORDER = 56;
const MODULE_ID = 8121295;
const ARCHIVE_ID = 'archive-000001';
const ARCHIVE_SHA256 = '0041e877721858174b1398ef81155294cd1e1c1d43dc8c893be0a762acd8c73e';
const VOCABULARY_SHA256 = 'ba7cab72fb58a1573c5c721fef0d7bd11c5258a11a395c4a27f6a37c8503bd9f';
const GRAMMAR_SHA256 = 'c1f433123a9cc856eb0445443eb8c76f673601c9ca66a61e0292870962a53fe0';
const ALTERNATIVE_SHA256 = '4ef611211a772b2aa164e4906260b3a719e79abd084dd6a3d81cf96b10521b5a';
const SPEAKING_SHA256 = '8633da381ade835b0c1f47a36fbcc5359bb604e9d3733db1f7b8f590d309c62e';
const AUDIO_SHA256 = '06b35860230b1320c7d68fd0e863363f59f2619a79eef3460368c588a770bd96';
const SCRIPT_SHA256 = 'd79b17c0a31646378f02d7a8ee4ab75a553d0997cfe636a2342f1eb57cba2927';
const WORKSHEET_SHA256 = '65aaa460558043b069f759c31a3c0e1663080fbd2f795eb175a8037ad5da2f21';

const SOURCE_VISUALS: StateInspectionModel['provenance']['moodle']['sourceSheets'] = Object.freeze([
    sourceVisual(VOCABULARY_SHA256, 'Chapter 34-2 Vocabulary Sheet', 1, 'moodle-chapter-34-2-vocabulary-1.png', '426ba2deb53196efe99959a04d0b90ac40bf49edb5eea6cecf815f94c1a33314', {
        ja: 'Moodle 原本: Chapter 34-2 語彙表1ページ。調理法と調味料の語彙。',
        en: 'Moodle original: Chapter 34-2 vocabulary page 1, covering cooking methods and seasonings.',
    }),
    sourceVisual(VOCABULARY_SHA256, 'Chapter 34-2 Vocabulary Sheet', 2, 'moodle-chapter-34-2-vocabulary-2.png', '61e07b85aaaefa3b2a7c7ab4af592322fbf79609128cc25f7f6bf24d46d1a6f2', {
        ja: 'Moodle 原本: Chapter 34-2 語彙表2ページ。旅行、健康診断、目標、参加の語彙。',
        en: 'Moodle original: Chapter 34-2 vocabulary page 2, covering travel, health checks, goals, and participation.',
    }),
    sourceVisual(GRAMMAR_SHA256, 'Chapter 34-2_〜て_で_ないで-1_grammar exercise', 1, 'moodle-chapter-34-2-te-de-naide-1.png', 'c7331af374d28490073b676762e904cb072b8c7c24e30ff20c05f831830ae8fc', {
        ja: 'Moodle 原本: 「〜て／〜ないで」の基本文と先生の説明。',
        en: 'Moodle original: basic sentences and Sensei explanation for 〜て and 〜ないで.',
    }),
    sourceVisual(GRAMMAR_SHA256, 'Chapter 34-2_〜て_で_ないで-1_grammar exercise', 2, 'moodle-chapter-34-2-te-de-naide-2.png', 'da47a3e00aac1957d084b4aa9bfbfe8c5878bcdf35e4dbae5457a31cbf09dc98', {
        ja: 'Moodle 原本: 括弧から適切な形を選ぶ Chapter 34-2 練習。',
        en: 'Moodle original: Chapter 34-2 exercise choosing the appropriate form in brackets.',
    }),
    sourceVisual(GRAMMAR_SHA256, 'Chapter 34-2_〜て_で_ないで-1_grammar exercise', 3, 'moodle-chapter-34-2-te-de-naide-3.png', '92c9f661b1eda4b2039c9eafaa6d639f6b80668cf63741a104b952ff0a482ec6', {
        ja: 'Moodle 原本: 二つの動作を「〜て／〜ないで」でつなぐ追加練習。',
        en: 'Moodle original: further practice linking two actions with 〜て or 〜ないで.',
    }),
    sourceVisual(ALTERNATIVE_SHA256, 'Chapter 34-2_〜て_で_ないで-2_grammar exercise', 1, 'moodle-chapter-34-2-alternative-naide-1.png', '28e3ecb2843b18af686bbfdf9b1ac90a498d62575179ef4af3681c894bc55e9f', {
        ja: 'Moodle 原本: 「〜ないで」で別の行動を選ぶ Chapter 34-2 練習。',
        en: 'Moodle original: Chapter 34-2 practice using 〜ないで to choose an alternative action.',
    }),
    sourceVisual(SPEAKING_SHA256, 'Chapter 34-2_〜て_で_ないで-1 speaking practice-1', 1, 'moodle-chapter-34-2-speaking-1.png', '401544677da0df0fe5c045681fb90db20661d5b9922657ee7bb4653ed3348296', {
        ja: 'Moodle 原本: Chapter 34-2 の会話練習。',
        en: 'Moodle original: Chapter 34-2 speaking practice.',
    }),
    sourceVisual(WORKSHEET_SHA256, 'HW Chapter 34_Conversation listening', 1, 'moodle-chapter-34-tea-listening-1.png', 'a8f7115154c2ce9258462900513461534b0853bba77da4e588dfde1bf2b4cd8b', {
        ja: 'Moodle 原本: Track 27 の茶道会話に関する五つの質問。隣接する l2-l28 所有資料。',
        en: 'Moodle original: five questions for the Track 27 tea-ceremony conversation; owned by adjacent package l2-l28.',
    }),
    sourceVisual(SCRIPT_SHA256, 'Chapter 34_Conversation listening script', 1, 'moodle-chapter-34-tea-script-1.png', '89fd7e24c44499e1eeb769088dbd10d0dad4666bca7c1df319532c10d9924bea', {
        ja: 'Moodle 原本: Track 27 の茶道会話全文。',
        en: 'Moodle original: full tea-ceremony conversation script for Track 27.',
    }),
]);

export function createLessonL2L29TeaCeremonyBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = [
        round('wallet', 1, 2, 1, 1, 'action-choice', grammarQuestion(1),
            'お財布を (持って、持ったら、持たないで) テスコへ 行って、なにも 買えませんでした。', '持たないで', [
                option('持たないで', '持たないで', 'without taking it'),
                option('持ったら', '持ったら', 'if/when I took it'),
            ], hints(
                ['何も買えなかった理由を選びます。', '財布を持って行きませんでした。', '二つ目の動作を、しなかった状態で行う形です。'],
                ['Choose the circumstance that explains why nothing could be bought.', 'The speaker did not take a wallet.', 'Use the form for doing the second action without doing the first.'],
            )),
        round('beer', 2, 2, 1, 2, 'action-choice', grammarQuestion(2),
            'パブで ビールを (飲んだら、飲みながら、飲むと)、食事を しました。', '飲みながら', [
                option('飲みながら', '飲みながら', 'while drinking'),
                option('飲んだら', '飲んだら', 'when/if I drank'),
            ], hints(
                ['二つの動作が同時です。', 'ビールを飲む間に食事をしました。', '同時進行は「ます」を取って「ながら」です。'],
                ['The two actions happen at the same time.', 'The meal happens during the beer drinking.', 'For simultaneous actions, remove ます and add ながら.'],
            )),
        round('suit', 3, 2, 1, 3, 'action-choice', grammarQuestion(3),
            '毎日 スーツを (着ると、着ながら、着ないで) 会社へ 行きます。', '着ないで', [
                option('着ないで', '着ないで', 'without wearing it'),
                option('着ながら', '着ながら', 'while putting it on'),
            ], hints(
                ['会社へ行く時の服装を表します。', 'スーツを着ません。', 'しない動作を先に置く「ないで」を選びます。'],
                ['This describes what is not worn when going to work.', 'The speaker does not wear a suit.', 'Choose ないで after the action not done.'],
            )),
        round('tea-maker', 4, 1, 'listening', 1, 'action-choice', listeningQuestion(1),
            '誰がお茶をたてましたか。', '渡辺さんです。', [
                option('渡辺さんです。', '渡辺さんです。', 'Watanabe did.'),
                option('クララさんです。', 'クララさんです。', 'Clara did.'),
            ], hints(
                ['先生が誰に頼んだか聞きます。', '先生は「お茶をたててください」と言います。', 'その直前の呼びかけは「渡辺さん」です。'],
                ['Listen for whom Sensei asks.', 'Sensei says お茶をたててください.', 'The name immediately before that request is Watanabe.'],
            )),
        round('sweet-first', 5, 1, 'listening', 2, 'typed-report', listeningQuestion(2),
            'どうして先に甘いお菓子を食べるんですか。', '甘いお菓子を食べたあとで、お茶を飲むと、おいしいからです。', [], hints(
                ['先生の「〜あとで」の説明を聞きます。', '甘い物の後に飲む物はお茶です。', '理由の最後を「おいしいからです」にします。'],
                ['Listen for Sensei’s explanation with 〜あとで.', 'The drink after the sweet is tea.', 'End the reason with おいしいからです.'],
            ), ['甘いお菓子を食べた後でお茶を飲むとおいしいからです。']),
        round('first-step', 6, 1, 'listening', 3, 'typed-report', listeningQuestion(3),
            'お茶を飲みます。まず何をしますか。', 'まず右手でおちゃわんを取って、左手に載せます。', [], hints(
                ['先生の「まず」の後を聞きます。', '右手で取ります。', 'その後、左手に載せます。'],
                ['Listen immediately after まず.', 'Take the bowl with the right hand.', 'Then place it on the left hand.'],
            ), ['右手でおちゃわんを取って左手に載せます。']),
        round('turn-bowl', 7, 1, 'listening', 4, 'action-choice', listeningQuestion(4),
            'お茶を飲む前に、おちゃわんをどうしますか。', 'おちゃわんを2回回します。', [
                option('おちゃわんを2回回します。', 'おちゃわんを2回回します。', 'Turn the bowl twice.'),
                option('おちゃわんを右手に2回載せます。', 'おちゃわんを右手に2回載せます。', 'Put the bowl on the right hand twice.'),
            ], hints(
                ['「それから飲みます」の直前を聞きます。', '動詞は「回します」です。', '回数は二回です。'],
                ['Listen just before それから飲みます.', 'The verb is 回します.', 'The count is two.'],
            )),
        round('taste', 8, 1, 'listening', 5, 'typed-report', listeningQuestion(5),
            'クララさんはお茶についてどう思いましたか。', '少し苦いですが、おいしいです。', [], hints(
                ['クララさんの最後の感想です。', '最初の感想は「少し苦い」です。', '「ですが」で「おいしい」につなぎます。'],
                ['This is Clara’s final reaction.', 'Her first reaction is 少し苦い.', 'She links it with ですが to おいしい.'],
            ), ['少し苦いですがおいしいと思いました。']),
    ] as const;

    const activity: StateInspectionModel = {
        id: 'activity:l2-l29-sensei-tea-ceremony',
        kind: 'academy-state-inspection',
        responseKind: 'moodle-chapter-34-means-and-tea-listening',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(item => item.conceptId),
        prompt: {
            ja: '先生の Chapter 34-2 原本と Track 27 を先に学び、八つの原問に答えてください。',
            en: 'Study Sensei’s Chapter 34-2 originals and Track 27 first, then answer eight source-grounded prompts.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            packageOrder: PACKAGE_ORDER,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                archiveId: ARCHIVE_ID,
                sourceSheets: SOURCE_VISUALS,
                media: {
                    status: 'audio-member-verified-by-archive-task-script-identity',
                    sourceAudioMembers: 3,
                    sourceAudioTracksDelivered: 1,
                    durationSeconds: 111.44,
                    audio: {
                        url: '/academy/content/lessons/l2-l29/moodle-track-27.mp3',
                        payloadSha256: AUDIO_SHA256,
                        durationSeconds: 111.44,
                        transcriptPayloadSha256: SCRIPT_SHA256,
                        worksheetPayloadSha256: WORKSHEET_SHA256,
                        verification: 'same-archive-adjacency-and-exact-task-script-identity',
                    },
                },
                answerKeyBasis: 'sensei-verbatim-grammar-choices-and-script-grounded-listening-answers',
            },
            support: {
                minna: { reference: 'Minna no Nihongo II · Lesson 34', reuse: 'chronology-and-scope-only' },
                genki: { crosswalk: '≈ Genki II · Means, attendant circumstances, and following instructions', reuse: 'sequence-only' },
                references: {
                    shinKanzen: { reference: 'Shin Kanzen Master N3 private library', reuse: 'scope-and-contrast-only', learnerFacingMaterial: false },
                    tobira: { reference: 'Tobira private library', reuse: 'scope-and-contrast-only', learnerFacingMaterial: false },
                    soya: { reference: 'Soya N3 research corpus', reuse: 'format-and-audio-research-only', rightsState: 'item-review-required', learnerFacingMaterial: false },
                },
            },
        },
        payload: {
            teaching: [
                { title: 'Source vocabulary first', text: 'Read both Chapter 34-2 vocabulary pages before the grammar and listening tasks.' },
                { title: 'Means and attendant circumstances', text: 'Use the source pages to contrast doing one action by means of another, doing it while another action continues, and doing it without another action.' },
                { title: 'The source pattern', text: 'Vて／Vないで、V2.' },
                { title: 'Track 27', text: 'Play Track 27 before opening the exact script. The pairing is established by archive order and the Chapter 34 task identity; no independent transcript-match claim is made.' },
                { title: 'Tea sequence', text: 'Listen for the ordered instructions marked by まず, 次に, and それから.' },
                { title: 'Answer from the conversation', text: 'Keep each response to what the speakers establish about the sweet, the bowl, and Clara’s reaction.' },
            ],
            taskHeadings: [
                { sourceTask: 'vocabulary', text: 'Chapter 34-2 vocabulary: read the exact source rows before the grammar and listening tasks.' },
                { sourceTask: 1, text: '2: Choose correct one in the brackets.' },
                { sourceTask: 'listening', text: 'Chapter 34 conversation listening: replay Track 27, then answer the five source questions.' },
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: { explanation: {
                    ja: '三つの文法選択と、Track 27 の茶道会話五問を原本に沿って完了できました。',
                    en: 'You completed the three grammar choices and all five Track 27 tea-ceremony questions from the source.',
                } },
                lapse: {
                    explanation: {
                        ja: '間違えた原問で、形または聞き取りの順序をもう一度確認しましょう。',
                        en: 'Recheck the form or listening sequence in each missed source prompt.',
                    },
                    repairPrompt: {
                        ja: '間違えた原問だけを直し、必要なら原本とヒントを一つずつ開きましょう。',
                        en: 'Repair only the missed source prompts, reopening the original and one earned hint at a time.',
                    },
                    nearbyExample: {
                        ja: '原文: まず 右手で おちゃわんを 取って、左手に 載せます。',
                        en: 'Source line: まず 右手で おちゃわんを 取って、左手に 載せます。',
                    },
                },
            },
        },
    };

    return Object.freeze({
        id: 'sensei-tea-ceremony',
        narrative: {
            ja: 'ルパーナが Chapter 34 の原本を開きます。クララの茶道体験を聞きながら、順序と「しないで行う」動作を確かめます。',
            en: 'Ruparna opens Sensei’s Chapter 34 originals. The class follows Clara’s tea-ceremony visit while tracking sequence and actions done without another action.',
        },
        activity: Object.freeze(activity),
    });
}

function round(
    id: string,
    sourceOrder: StateInspectionRound['sourceOrder'],
    sourcePage: StateInspectionRound['sourcePage'],
    sourceTask: StateInspectionRound['sourceTask'],
    sourceItem: StateInspectionRound['sourceItem'],
    interaction: StateInspectionInteraction,
    sourceQuestionId: string,
    sourcePrompt: string,
    answerExpression: string,
    options: readonly StateInspectionOption[],
    roundHints: StateInspectionRound['hints'],
    alternatives: readonly string[] = [],
): StateInspectionRound {
    return Object.freeze({
        id, interaction, sourceOrder, sourcePage, sourceTask, sourceItem, sourceQuestionId,
        sourcePrompt, options, answerValue: answerExpression, answerExpression,
        acceptedAnswers: [answerExpression, ...alternatives],
        conceptId: `concept:l2-l29:means-tea:${sourceOrder}`,
        errorTag: `l2-l29-means-tea-${sourceOrder}`,
        hints: roundHints,
    });
}

function grammarQuestion(item: 1 | 2 | 3): string {
    return `moodle:${MODULE_ID}:${GRAMMAR_SHA256}:pdf-p2:task-2:q${item}`;
}

function listeningQuestion(item: 1 | 2 | 3 | 4 | 5): string {
    return `moodle:8121293:${WORKSHEET_SHA256}:pdf-p1:track-27:q${item}`;
}

function option(value: string, ja: string, en: string): StateInspectionOption {
    return Object.freeze({ value, label: Object.freeze({ ja, en }) });
}

function hints(ja: readonly string[], en: readonly string[]): StateInspectionRound['hints'] {
    if (ja.length !== 3 || en.length !== 3) throw new TypeError('l2-l29 rounds require exactly three bilingual hints.');
    return [
        Object.freeze({ ja: ja[0]!, en: en[0]! }),
        Object.freeze({ ja: ja[1]!, en: en[1]! }),
        Object.freeze({ ja: ja[2]!, en: en[2]! }),
    ];
}

function sourceVisual(
    payloadSha256: string,
    title: string,
    page: StateInspectionSourceVisual['page'],
    filename: string,
    sha256: string,
    alt: LocalizedText,
): StateInspectionSourceVisual {
    return Object.freeze({
        sourceId: `moodle:${payloadSha256}:page:${page}`,
        payloadSha256,
        title,
        page,
        url: `/academy/content/lessons/l2-l29/${filename}`,
        sha256,
        alt: Object.freeze(alt),
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l29 package');
    const identity = record(root.identity, 'l2-l29 identity');
    const coverage = record(root.sourceCoverage, 'l2-l29 coverage');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID
        || coverage.archiveId !== ARCHIVE_ID || coverage.archiveSha256 !== ARCHIVE_SHA256) {
        throw new TypeError('Unexpected l2-l29 package identity or source archive.');
    }
    const members = array(coverage.members, 'l2-l29 members').map(value => record(value, 'l2-l29 member'));
    for (const payloadSha256 of [VOCABULARY_SHA256, GRAMMAR_SHA256, ALTERNATIVE_SHA256, SPEAKING_SHA256, SCRIPT_SHA256]) {
        if (!members.some(member => member.payloadSha256 === payloadSha256 && member.kind === 'document')) {
            throw new TypeError(`Missing exact l2-l29 Moodle document ${payloadSha256}.`);
        }
    }
    const audio = members.filter(member => member.kind === 'audio');
    if (audio.length !== 3 || !audio.some(member => member.payloadSha256 === AUDIO_SHA256)) {
        throw new TypeError('l2-l29 expects three Moodle audio members and verified Track 27.');
    }
    const sharedRoot = record(sharedListeningPackage, 'l2-l28 package');
    const sharedCoverage = record(sharedRoot.sourceCoverage, 'l2-l28 coverage');
    const sharedMembers = array(sharedCoverage.members, 'l2-l28 members').map(value => record(value, 'l2-l28 member'));
    if (sharedRoot.id !== 'l2-l28' || !sharedMembers.some(member => member.payloadSha256 === WORKSHEET_SHA256 && member.kind === 'document')) {
        throw new TypeError('l2-l29 requires the declared adjacent Chapter 34 listening worksheet.');
    }
    const mapping = record(root.mapping, 'l2-l29 mapping');
    if (mapping.minna !== 'Minna no Nihongo II · Lesson 34') {
        throw new TypeError('l2-l29 must preserve its sequence-only Minna mapping.');
    }
}

function record(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`Expected ${label}.`);
    return value as Record<string, unknown>;
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`Expected ${label}.`);
    return value;
}
