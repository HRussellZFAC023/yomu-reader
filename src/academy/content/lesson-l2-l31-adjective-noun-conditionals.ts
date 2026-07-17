import lessonPackage from '../../../public/academy/content/lessons/058-l2-l31.json';
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

const PACKAGE_ID = 'l2-l31';
const PACKAGE_ORDER = 58;
const MODULE_ID = 8121300;
const ARCHIVE_ID = 'archive-000048';
const ARCHIVE_SHA256 = '9ad13a036c233ed35d5f56f00c1f928db0575c3932b48322f7ac64907bea7a99';
const VOCABULARY_SHA256 = '5fafa9605db9ee5937563a442379d249854d74db219767f0fde29e7a7f421411';
const GRAMMAR_SHA256 = '67bda5b3968519440ae273cf3c59f614ffc1b41a9875e84e79e7b74ca23e1dd4';
const QUARANTINED_AUDIO_SHA256 = '5cfe1762cfec2a9e8f4e62c8c35b6b09685428b9721d373b08b2f7a6668ad7e7';

const SOURCE_VISUALS: StateInspectionModel['provenance']['moodle']['sourceSheets'] = Object.freeze([
    visual(VOCABULARY_SHA256, 'Chapter 35-2 Vocabulary Sheet', 1,
        'moodle-chapter-35-2-vocabulary-1.png', 'c1e16d0582636e864a8eb0c96ad52d267612d706d04946acdd0c2740e1c5aeaa', {
            ja: 'Moodle 原本: Chapter 35-2 語彙表 1ページ。',
            en: 'Moodle original: Chapter 35-2 vocabulary sheet, page 1.',
        }),
    visual(VOCABULARY_SHA256, 'Chapter 35-2 Vocabulary Sheet', 2,
        'moodle-chapter-35-2-vocabulary-2.png', '93bc4379a5acee6d97c62198321017855637199d36e8076c68e90666157a9d6d', {
            ja: 'Moodle 原本: Chapter 35-2 語彙表 2ページ。',
            en: 'Moodle original: Chapter 35-2 vocabulary sheet, page 2.',
        }),
    visual(GRAMMAR_SHA256, 'Chapter 35-2_adj_noun conditional form 〜ければ 〜なら_grammar exercise', 1,
        'moodle-chapter-35-2-adjective-noun-conditional-1.png', 'd2ba5d2b67f78d33ab4415bcad29c2eacf26d6fb140343031701f4c5c79a19da', {
            ja: 'Moodle 原本: 形容詞・名詞の条件形、基本文と練習 1・2。',
            en: 'Moodle original: adjective and noun conditional forms with tasks 1 and 2.',
        }),
    visual(GRAMMAR_SHA256, 'Chapter 35-2_adj_noun conditional form 〜ければ 〜なら_grammar exercise', 2,
        'moodle-chapter-35-2-adjective-noun-conditional-2.png', 'a9627efdaf339b7a397c22586108832c5795caafdb934bbcd4e84222a8ab0719', {
            ja: 'Moodle 原本: 条件形のペア練習と練習 4・5。',
            en: 'Moodle original: conditional-form pair work and tasks 4 and 5.',
        }),
]);

export function createLessonL2L31AdjectiveNounConditionalsBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = [
        round('in-that-case', 1, 2, 'vocabulary', 18, 'state-select', sourceQuestion(VOCABULARY_SHA256, 2, 'vocabulary:18'),
            'In that case', 'それなら', [
                option('それなら', 'それなら', 'それなら'),
                option('さあ', 'さあ', 'さあ'),
            ], hints(
                ['語彙表 2ページの 18番です。', '前の条件を受ける表現です。', '原文は「それなら」です。'],
                ['This is row 18 on vocabulary page 2.', 'It responds to the condition just mentioned.', 'The source wording is それなら.'],
            )),
        round('travel-agency', 2, 2, 'vocabulary', 21, 'action-choice', sourceQuestion(VOCABULARY_SHA256, 2, 'vocabulary:21'),
            'Travel agency', 'りょこうしゃ（旅行社）', [
                option('りょこうしゃ（旅行社）', 'りょこうしゃ（旅行社）', 'りょこうしゃ（旅行社）'),
                option('やこうバス（夜行バス）', 'やこうバス（夜行バス）', 'やこうバス（夜行バス）'),
            ], hints(
                ['語彙表 2ページの 21番です。', '「旅行」と「社」を含む形です。', '原文の最初の語を選びます。'],
                ['This is row 21 on vocabulary page 2.', 'The first source form contains 旅行 and 社.', 'Choose the first word printed in the row.'],
            )),
        round('good-condition', 3, 1, 1, 10, 'typed-report', sourceQuestion(GRAMMAR_SHA256, 1, 'task-1:item-10'),
            'いいです', 'よければ', [], hints(
                ['「いい」は特別な語幹を使います。', '語幹は「よ」です。', '「よ」に「ければ」を付けます。'],
                ['いい uses an irregular stem.', 'The stem is よ.', 'Attach ければ to よ.'],
            )),
        round('cheap-condition', 4, 1, 1, 11, 'action-choice', sourceQuestion(GRAMMAR_SHA256, 1, 'task-1:item-11'),
            '安いです', '安ければ', [
                option('安ければ', '安ければ', '安ければ'),
                option('安いなら', '安いなら', '安いなら'),
            ], hints(
                ['「安い」は い形容詞です。', '最後の「い」を取ります。', '「安」に「ければ」を付けます。'],
                ['安い is an i-adjective.', 'Remove the final い.', 'Attach ければ to 安.'],
            )),
        round('quiet-condition', 5, 1, 1, 12, 'state-select', sourceQuestion(GRAMMAR_SHA256, 1, 'task-1:item-12'),
            '静かです', '静かなら', [
                option('静かなら', '静かなら', '静かなら'),
                option('静かければ', '静かければ', '静かければ'),
            ], hints(
                ['「静か」は な形容詞です。', '肯定の条件では「な」を置きません。', '「静か」に「なら」を付けます。'],
                ['静か is a na-adjective.', 'Do not keep な in this positive condition.', 'Attach なら to 静か.'],
            )),
        round('illness-condition', 6, 1, 1, 13, 'typed-report', sourceQuestion(GRAMMAR_SHA256, 1, 'task-1:item-13'),
            '病気です', '病気なら', [], hints(
                ['「病気」は名詞です。', '名詞の肯定条件を使います。', '「病気」に「なら」を付けます。'],
                ['病気 is a noun.', 'Use the positive noun condition.', 'Attach なら to 病気.'],
            )),
        round('mark-correct-answer', 7, 1, 2, 1, 'action-choice', sourceQuestion(GRAMMAR_SHA256, 1, 'task-2:item-1'),
            '答えが 正しいです・丸を 付けて ください', '答えが 正しければ、丸を 付けて ください。', [
                option('答えが 正しければ、丸を 付けて ください。', '答えが 正しければ、丸を 付けて ください。', '答えが 正しければ、丸を 付けて ください。'),
                option('答えが 正しいなら、丸を 付けて ください。', '答えが 正しいなら、丸を 付けて ください。', '答えが 正しいなら、丸を 付けて ください。'),
            ], hints(
                ['前半の「正しい」を条件形にします。', '最後の「い」を取ります。', '「正しければ」の後に原文の後半を続けます。'],
                ['Turn 正しい in the first clause into a condition.', 'Remove the final い.', 'Continue the printed second clause after 正しければ.'],
            )),
        round('fuji-july', 8, 2, 4, 1, 'typed-report', sourceQuestion(GRAMMAR_SHA256, 2, 'task-4:item-1'),
            '富士山に 登れますか。（7月に なります）', '7月に なれば、富士山に 登れます。', [], hints(
                ['かっこの条件を先に置きます。', '「なります」は「なれば」です。', '質問を肯定文にして後ろへ続けます。'],
                ['Put the parenthetical condition first.', 'なります becomes なれば.', 'Turn the question into a statement for the main clause.'],
            )),
    ] as const;

    const activity: StateInspectionModel = {
        id: 'activity:l2-l31-adjective-noun-conditionals',
        kind: 'academy-state-inspection',
        responseKind: 'moodle-chapter-35-adjective-noun-conditionals',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(round => round.conceptId),
        prompt: {
            ja: '先生の Chapter 35-2 語彙と形容詞・名詞の条件形を先に学び、八つの原文を復元してください。',
            en: 'Study Sensei’s Chapter 35-2 vocabulary and adjective/noun conditional forms first, then restore eight source cues.',
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
                    status: 'audio-member-quarantined-pairing-unproven',
                    sourceAudioMembers: 1,
                    sourceAudioTracksDelivered: 0,
                    quarantinedPayloadSha256: QUARANTINED_AUDIO_SHA256,
                },
                answerKeyBasis: 'sensei-verbatim-vocabulary-and-prompts-with-yomu-derived-deterministic-adjective-noun-conditionals',
            },
            support: {
                minna: { reference: 'Minna no Nihongo II · Lesson 35', reuse: 'chronology-and-scope-only' },
                genki: { crosswalk: '≈ Genki II · parallel N4 scope', reuse: 'sequence-only' },
            },
        },
        payload: {
            teaching: [
                { title: 'Source vocabulary first', text: 'Read both Chapter 35-2 vocabulary pages before forming conditions; それなら carries a condition already established in the conversation.' },
                { title: 'Positive i-adjectives', text: 'Remove final い and add ければ. The source examples include 安い → 安ければ, while いい uses the irregular stem よ: よければ.' },
                { title: 'Negative i-adjectives', text: 'Change the adjective to its くない form, then replace ない with なければ: 高い → 高くなければ.' },
                { title: 'Na-adjectives', text: 'For a positive condition, attach なら directly to the na-adjective stem: ひま → ひまなら.' },
                { title: 'Nouns', text: 'A positive noun condition also uses なら; a negative na-adjective or noun condition uses じゃなければ.' },
                { title: 'Condition before main clause', text: 'Place the condition first and keep the following request, invitation, or result as the main clause.' },
            ],
            taskHeadings: [
                { sourceTask: 'vocabulary', text: 'Chapter 35-2 Vocabulary Sheet' },
                { sourceTask: 1, text: '1: Create conditional forms_adjectives and nouns' },
                { sourceTask: 2, text: '2: Create one sentence using conditional form.' },
                { sourceTask: 4, text: '4: Answer the questions using conditional form.' },
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: { explanation: {
                    ja: '語彙を確認し、い形容詞・な形容詞・名詞の条件形を八つの原文で作れました。',
                    en: 'You checked the vocabulary and formed i-adjective, na-adjective, and noun conditions across all eight source cues.',
                } },
                lapse: {
                    explanation: {
                        ja: '間違えた原文だけ、語の種類と「ければ／なら」の作り方を確認しましょう。',
                        en: 'For only the missed source rows, recheck the word class and whether the form needs ければ or なら.',
                    },
                    repairPrompt: {
                        ja: '間違えた行だけを直し、必要なら先生の表とヒントを一つずつ開きましょう。',
                        en: 'Repair only the missed rows, reopening Sensei’s table and one earned hint at a time.',
                    },
                    nearbyExample: {
                        ja: '先生の型: 安い → 安ければ／ひま → ひまなら／雨 → 雨なら',
                        en: 'Sensei’s forms: 安い → 安ければ; ひま → ひまなら; 雨 → 雨なら.',
                    },
                },
            },
        },
    };

    return Object.freeze({
        id: 'adjective-noun-conditionals',
        narrative: {
            ja: 'ルパーナが先生の Chapter 35-2 の四枚を開き、エンジェルが語彙、い形容詞、な形容詞、名詞の欄を作ります。原本と作り方を確認してから、八つの条件を戻します。',
            en: 'Ruparna opens Sensei’s four Chapter 35-2 pages while Onke sorts vocabulary, i-adjectives, na-adjectives, and nouns. Once the source forms are clear, the class restores eight conditions.',
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
): StateInspectionRound {
    return Object.freeze({
        id, interaction, sourceOrder, sourcePage, sourceTask,
        sourceItem, sourceQuestionId,
        sourcePrompt, options, answerValue: answerExpression, answerExpression,
        acceptedAnswers: [answerExpression],
        conceptId: `concept:l2-l31:conditional:${sourceOrder}`,
        errorTag: `l2-l31-conditional-${sourceOrder}`,
        hints: roundHints,
    });
}

function sourceQuestion(payloadSha256: string, page: number, locus: string): string {
    return `moodle:${MODULE_ID}:${payloadSha256}:pdf-p${page}:${locus}`;
}

function option(value: string, ja: string, en: string): StateInspectionOption {
    return Object.freeze({ value, label: Object.freeze({ ja, en }) });
}

function hints(ja: readonly string[], en: readonly string[]): StateInspectionRound['hints'] {
    if (ja.length !== 3 || en.length !== 3) throw new TypeError('l2-l31 rounds require exactly three bilingual hints.');
    return [
        Object.freeze({ ja: ja[0]!, en: en[0]! }),
        Object.freeze({ ja: ja[1]!, en: en[1]! }),
        Object.freeze({ ja: ja[2]!, en: en[2]! }),
    ];
}

function visual(
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
        url: `/academy/content/lessons/l2-l31/${filename}`,
        sha256,
        alt: Object.freeze(alt),
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l31 package');
    const identity = record(root.identity, 'l2-l31 identity');
    const coverage = record(root.sourceCoverage, 'l2-l31 coverage');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID
        || coverage.archiveModuleId !== MODULE_ID || coverage.archiveId !== ARCHIVE_ID
        || coverage.archiveSha256 !== ARCHIVE_SHA256) {
        throw new TypeError('Unexpected l2-l31 package identity or source archive.');
    }
    const members = array(coverage.members, 'l2-l31 members').map(value => record(value, 'l2-l31 member'));
    for (const payloadSha256 of [VOCABULARY_SHA256, GRAMMAR_SHA256]) {
        if (!members.some(member => member.payloadSha256 === payloadSha256 && member.kind === 'document')) {
            throw new TypeError(`Missing exact l2-l31 Moodle document ${payloadSha256}.`);
        }
    }
    if (!members.some(member => member.payloadSha256 === QUARANTINED_AUDIO_SHA256 && member.kind === 'audio')) {
        throw new TypeError('Missing quarantined l2-l31 Moodle audio member.');
    }
    const mapping = record(root.mapping, 'l2-l31 mapping');
    if (mapping.minna !== 'Minna no Nihongo II · Lesson 35' || mapping.genki !== '≈ Genki II · parallel N4 scope') {
        throw new TypeError('l2-l31 must preserve its sequence-only Minna and Genki mappings.');
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
