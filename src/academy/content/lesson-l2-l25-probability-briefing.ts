import lessonPackage from '../../../public/academy/content/lessons/052-l2-l25.json';
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

const PACKAGE_ID = 'l2-l25';
const PACKAGE_ORDER = 52;
const MODULE_ID = 8121279;
const ARCHIVE_ID = 'archive-000078';
const ARCHIVE_SHA256 = 'db9e3c5494bcb89e220c4d112c40c777af61b6be0e5c60b174b5e33378ec42eb';
const DESHOU_SHA256 = '4327bdf7c9734ac453b5453d6eb8997121d5f3e2e693d37e1d32772f830fad1b';
const KAMOSHIREMASEN_SHA256 = 'b2d999296ac31099b6dafcb7aa129663490c2d4048f12b02a8ac9351635ebc08';

const SOURCE_VISUALS: StateInspectionModel['provenance']['moodle']['sourceSheets'] = Object.freeze([
    visual(DESHOU_SHA256, 'New_Chapter 32-2 〜でしょう grammar_exercise', 1, 'moodle-chapter-32-2-deshou-page-1.png', 'ae496e3085da40ad4916986038a38b6510c331bb9238f2687901682aa7838718'),
    visual(DESHOU_SHA256, 'New_Chapter 32-2 〜でしょう grammar_exercise', 2, 'moodle-chapter-32-2-deshou-page-2.png', 'ea386de18237eb9bfb44f4ccf1fa4255c35b48b028d24203a81a0df736ffb514'),
    visual(DESHOU_SHA256, 'New_Chapter 32-2 〜でしょう grammar_exercise', 3, 'moodle-chapter-32-2-deshou-page-3.png', '4c41b71aec0de71f696d84ee2819e69f8ee355ae48eac83dfef4ebab22565fbb'),
    visual(KAMOSHIREMASEN_SHA256, 'Chapter 32-3 〜かもしれません grammar_exercise', 1, 'moodle-chapter-32-3-kamoshiremasen-page-1.png', 'ec0914378f28514af2d8b906658f295ced63c96f1754104fc66da1eb180f68f5'),
    visual(KAMOSHIREMASEN_SHA256, 'Chapter 32-3 〜かもしれません grammar_exercise', 2, 'moodle-chapter-32-3-kamoshiremasen-page-2.png', 'c28481aaca331815a0abcbadfe5e6ab844dfa11bb197997c5bb3295bbb865fed'),
    visual(KAMOSHIREMASEN_SHA256, 'Chapter 32-3 〜かもしれません grammar_exercise', 3, 'moodle-chapter-32-3-kamoshiremasen-page-3.png', 'aa0212a4c882d56aecc10a7c334981a7fc4510caae7b2da605944c88605b74e0'),
]);

export function createLessonL2L25ProbabilityBriefingBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = [
        round('cloudy-tomorrow', 1, 'action-choice', DESHOU_SHA256,
            '先生の例を原文どおりに完成してください: 明日は＿＿。',
            '明日(あした)は 曇(くも)りでしょう。',
            choices('明日(あした)は 曇(くも)りでしょう。', '明日(あした)は 曇(くも)りかも しれません。'),
            clue('明日と曇りの例です。', '確信に近い予想なので、でしょうです。', '原文のふりがなと句点も確認します。',
                'Use the tomorrow-and-cloudy example.', 'This near-certain forecast uses でしょう.', 'Check the source furigana and final punctuation.')),
        round('not-rain', 2, 'state-select', DESHOU_SHA256,
            '先生の否定予想を原文どおりに選んでください。',
            '明後日(あさって)は 雨(あめ)じゃないでしょう。',
            choices('明後日(あさって)は 雨(あめ)じゃないでしょう。', '明後日(あさって)は 雨(あめ)でしょう。'),
            clue('明後日と雨の例です。', '雨ではないという予想です。', 'じゃないでしょうまで残します。',
                'Use the day-after-tomorrow rain example.', 'The forecast says it probably will not rain.', 'Keep じゃないでしょう intact.')),
        round('afternoon-clear', 3, 'typed-report', DESHOU_SHA256,
            '先生の午後の予想を、ふりがなを含めて原文どおりに入力してください。',
            '午後(ごご)は すこし 晴(は)れるでしょう。', [],
            clue('午後の例を探します。', 'すこしの後は晴れるです。', '最後はでしょう。です。',
                'Find the afternoon example.', 'After すこし, the source uses 晴れる.', 'Finish with でしょう。')),
        round('rocket-success', 4, 'action-choice', DESHOU_SHA256,
            'ロケット研究について、先生の例を原文どおりに選んでください。',
            '日本の ロケットの 研究(けんきゅう)は 成功(せいこう)するでしょう。',
            choices('日本の ロケットの 研究(けんきゅう)は 成功(せいこう)するでしょう。', '日本の ロケットの 研究(けんきゅう)は 成功(せいこう)するかも しれません。'),
            clue('研究と成功の例です。', '知識や情報に基づく強い予想です。', '原文は成功するでしょうです。',
                'Use the research-and-success example.', 'It is the stronger prediction grounded in knowledge or information.', 'The source ends 成功するでしょう.')),
        round('influenza', 5, 'state-select', KAMOSHIREMASEN_SHA256,
            '風邪の後に続く可能性の例を原文どおりに選んでください。',
            '風邪(かぜ)を ひきました。インフルエンザかも しれません',
            choices('風邪(かぜ)を ひきました。インフルエンザかも しれません', '風邪(かぜ)を ひきました。インフルエンザでしょう。'),
            clue('風邪とインフルエンザの例です。', '小さい可能性を残します。', '原本には末尾の句点がありません。',
                'Use the cold-and-influenza example.', 'Keep the smaller possibility open.', 'The printed line has no final period.')),
        round('cloud-rain', 6, 'typed-report', KAMOSHIREMASEN_SHA256,
            '雲から雨を予想する先生の例を原文どおりに入力してください。',
            '雲(くも)が あります。雨(あめ)が 降(ふ)るかも しれません。', [],
            clue('雲がありますから始まります。', '雨が降る可能性です。', 'かも しれません。まで入力します。',
                'Begin with 雲があります.', 'The possibility is that rain will fall.', 'Enter through かも しれません。')),
        round('late-meeting', 7, 'action-choice', KAMOSHIREMASEN_SHA256,
            '道が混んでいる結果について、先生の例を原文どおりに選んでください。',
            '道(みち)が 混(こ)んでいますから、待ち合わせ(まちあわせ)に 間に合わない(まにあわない)かも しれません。',
            choices('道(みち)が 混(こ)んでいますから、待ち合わせ(まちあわせ)に 間に合わない(まにあわない)かも しれません。', '道(みち)が 混(こ)んでいますから、待ち合わせ(まちあわせ)に 間に合うでしょう。'),
            clue('道と待ち合わせの二行です。', '間に合わない可能性です。', '二行を一文として続けます。',
                'Join the two source lines about the road and meeting.', 'The possibility is not arriving in time.', 'Keep the two printed lines as one sentence.')),
        round('whatapp-reply', 8, 'typed-report', KAMOSHIREMASEN_SHA256,
            '原本の綴りを直さず、返事がない理由の例を全文入力してください。',
            'Whatapp に返事(へんじ)が ありません。ともだちは 仕事(しごと)で 忙(いそが)しいかも しれません。', [],
            clue('原本は Whatapp と印刷されています。', '返事がない後に、友達の仕事を理由にします。', '忙しいかも しれません。で終わります。',
                'The source prints Whatapp; do not silently correct it.', 'After no reply, it gives the friend’s work as the reason.', 'Finish with 忙しいかも しれません。')),
    ] as const;

    const activity: StateInspectionModel = {
        id: 'activity:l2-l25-probability-briefing',
        kind: 'academy-state-inspection',
        responseKind: 'moodle-chapter-32-probability-briefing',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(round => round.conceptId),
        prompt: {
            ja: '先生の Chapter 32-2「でしょう」と Chapter 32-3「かも しれません」の六枚を先に読み、八つの例を原文どおりに使い分けてください。',
            en: 'Read all six canonical Chapter 32-2 でしょう and Chapter 32-3 かも しれません pages first, then distinguish eight examples in their source wording.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            packageOrder: PACKAGE_ORDER,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                archiveId: ARCHIVE_ID,
                sourceSheets: SOURCE_VISUALS,
                media: { status: 'audio-members-quarantined-unpaired', sourceAudioMembers: 3, sourceAudioTracksDelivered: 0 },
                answerKeyBasis: 'sensei-verbatim-probability-examples-over-canonical-source-pages',
            },
            support: {
                minna: { reference: 'Minna no Nihongo II · Lesson 32', reuse: 'chronology-and-scope-only' },
                genki: { crosswalk: 'No Genki prerequisite anchor; curriculum crosswalk gap declared', reuse: 'sequence-only' },
            },
        },
        payload: {
            teaching: [
                { title: 'でしょう', text: 'The source says 〜でしょう expresses a future or uncertain opinion without being definite, while the speaker feels almost certain from knowledge, experience, data, or information.' },
                { title: 'かも しれません', text: 'The source says 〜かも しれません leaves a possibility, however small, when the speaker is unsure or avoids declaring the outcome.' },
                { title: 'Verbatim examples', text: 'All eight assessed answers reproduce Sensei’s printed examples, including parenthetical readings, spacing, punctuation, and the source spelling Whatapp.' },
                { title: 'Answers after an attempt', text: 'The source examples remain visible for study, but the activity’s match result, answer list, and missed-line repair stay concealed until submission.' },
                { title: 'Quarantine boundary', text: 'The other six documents and all three audio members remain outside this focused slice. No listening pairing, transcript, duration relation, answer relation, Genki anchor, Soya item, or other corpus payload is claimed.' },
            ],
            taskHeadings: [
                { sourceTask: 'grammar', text: 'Chapter 32-2 〜でしょう: read the rule and printed examples before choosing the stronger prediction.' },
                { sourceTask: 'review', text: 'Chapter 32-3 〜かもしれません: read the rule and printed examples before keeping the smaller possibility open.' },
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: { explanation: { ja: '先生の八つの例を原文どおりに使い、強い予想と小さい可能性を区別できました。', en: 'You used all eight of Sensei’s examples in source wording and distinguished a strong prediction from a smaller possibility.' } },
                lapse: {
                    explanation: { ja: '間違えた例だけ、でしょうとかも しれませんの確実さを原本で確認しましょう。', en: 'For only the missed examples, recheck the certainty difference between でしょう and かも しれません on the source pages.' },
                    repairPrompt: { ja: '間違えた行だけを直し、必要ならヒントを一つずつ開きます。', en: 'Repair only the missed lines, opening one earned hint at a time if needed.' },
                    nearbyExample: { ja: '先生の例: 明日(あした)は 曇(くも)りでしょう。', en: 'Sensei’s example: 明日(あした)は 曇(くも)りでしょう。' },
                },
            },
        },
    };

    return Object.freeze({
        id: 'probability-briefing',
        narrative: {
            ja: 'りえ先生が二つの確実さの欄を開き、ミカは天気の例、ヘンリーは遅刻と返事の例を原本から確認します。',
            en: 'Rie opens the two certainty columns. Mika checks the weather examples while Henry traces the late-arrival and missing-reply examples back to the source.',
        },
        activity: Object.freeze(activity),
    });
}

function round(
    id: string,
    sourceOrder: StateInspectionRound['sourceOrder'],
    interaction: StateInspectionInteraction,
    payloadSha256: string,
    sourcePrompt: string,
    answerExpression: string,
    options: readonly StateInspectionOption[],
    hints: StateInspectionRound['hints'],
): StateInspectionRound {
    const sourceTask = payloadSha256 === DESHOU_SHA256 ? 'grammar' : 'review';
    const sourceItem = sourceItemFor(sourceOrder);
    return Object.freeze({
        id, sourceOrder, interaction, sourceTask, sourceItem, sourcePage: 1,
        sourceQuestionId: `moodle:${MODULE_ID}:${payloadSha256}:pdf-p1:example-${sourceItem}`,
        sourcePrompt, options, answerValue: answerExpression, answerExpression, acceptedAnswers: [answerExpression],
        conceptId: `concept:l2-l25:probability:${sourceOrder}`,
        errorTag: `l2-l25-probability-${sourceOrder}`,
        hints,
    });
}

function sourceItemFor(sourceOrder: StateInspectionRound['sourceOrder']): StateInspectionRound['sourceItem'] {
    switch (sourceOrder) {
        case 1: case 2: case 3: case 4: return sourceOrder;
        case 5: return 1;
        case 6: return 2;
        case 7: return 3;
        case 8: return 4;
    }
}

function choices(correct: string, distractor: string): readonly StateInspectionOption[] {
    return [option(correct), option(distractor)];
}

function option(value: string): StateInspectionOption {
    return Object.freeze({ value, label: Object.freeze({ ja: value, en: value }) });
}

function clue(ja1: string, ja2: string, ja3: string, en1: string, en2: string, en3: string): StateInspectionRound['hints'] {
    return [
        Object.freeze({ ja: ja1, en: en1 }),
        Object.freeze({ ja: ja2, en: en2 }),
        Object.freeze({ ja: ja3, en: en3 }),
    ];
}

function visual(payloadSha256: string, title: string, page: StateInspectionSourceVisual['page'], filename: string, sha256: string): StateInspectionSourceVisual {
    const alt: LocalizedText = {
        ja: `Moodle 原本: ${title} ${page}ページ。`,
        en: `Moodle original: ${title}, page ${page}.`,
    };
    return Object.freeze({
        sourceId: `moodle:${payloadSha256}:page:${page}`,
        payloadSha256, title, page,
        url: `/academy/content/lessons/l2-l25/${filename}`,
        sha256,
        alt: Object.freeze(alt),
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l25 package');
    const identity = record(root.identity, 'l2-l25 identity');
    const coverage = record(root.sourceCoverage, 'l2-l25 source coverage');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID
        || coverage.archiveId !== ARCHIVE_ID || coverage.archiveSha256 !== ARCHIVE_SHA256
        || coverage.memberFileCount !== 11) throw new TypeError('Unexpected l2-l25 package identity.');
    const members = array(coverage.members, 'l2-l25 members').map(member => record(member, 'l2-l25 member'));
    for (const payload of [DESHOU_SHA256, KAMOSHIREMASEN_SHA256]) {
        if (!members.some(member => member.payloadSha256 === payload && member.kind === 'document')) {
            throw new TypeError(`Missing exact l2-l25 Moodle payload ${payload}.`);
        }
    }
    if (members.filter(member => member.kind === 'audio').length !== 3) throw new TypeError('l2-l25 expects three quarantined audio members.');
    const provenance = record(root.provenance, 'l2-l25 provenance');
    if (provenance.unresolvedAnswersPolicy !== 'quarantine' || provenance.unresolvedAudioPolicy !== 'quarantine') {
        throw new TypeError('l2-l25 unresolved answers and audio must remain quarantined.');
    }
}

function record(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`Expected ${label} record.`);
    return value as Record<string, unknown>;
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`Expected ${label} array.`);
    return value;
}
