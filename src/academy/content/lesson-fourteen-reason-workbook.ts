import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { LocalizedText } from '../domain/source-library';
import type { ReasonWorkbookModel, ReasonWorkbookOption, ReasonWorkbookRound } from '../minigames/reason-workbook';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const MOODLE_ARCHIVE_SHA256 = 'e30252905f7a07c7651519eae7c1b306de5b85e3082aae17a4442e02087cf9cb';
const MOODLE_REASON_SHA256 = 'a31989128cc698fc13a5722326c0d23b41087168c7de7a40ad261475ae53deef';
const MOODLE_WHY_SHA256 = '30428f5f3168b44f3f2cc5901c952dd0ceca2e8cc557995e99520d334441320e';
const MOODLE_EXISTENCE_SHA256 = 'f7854a77f500534ed5a91e69354ccf76fb863c2f63caf7e67f45d17672c0ef2f';
const MINNA_SHA256 = '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229';
const GENKI_SHA256 = '9d14d05b28a80886dfdad068b30a979a6df917b2696df09fdedd6b820a9cbbc2';
const GENKI_SCRIPT_SHA256 = '93d56a81d9f5e3f233c3771259c38b98bb3070e8500d9a985104d2eeeb7aff32';
const GENKI_TASK_ID = 'genki-2e:l1-l14:lesson-6-workbook-7' as const;

export function createLessonFourteenReasonWorkbookModel(): ReasonWorkbookModel {
    const rounds = Object.freeze([
        choice(1, 'moodle-kara-subway', 'moodle:6097314:a3198912:p1:q1:1', 'Moodle - Chapter 9 〜ですから - page 1', 'ちかてつは たかいですから、＿＿。', 'じてんしゃで かいしゃに いきます', 'result-choice', ['じてんしゃで かいしゃに いきます', 'ちかてつで かいしゃに いきます', 'きょうは なにも のみません']),
        choice(2, 'moodle-kara-drink', 'moodle:6097314:a3198912:p1:q1:3', 'Moodle - Chapter 9 〜ですから - page 1', 'きのう たくさん のみましたから、＿＿。', 'きょうは なにも のみません', 'result-choice', ['きょうは なにも のみません', 'きのう たくさん のみます', 'じてんしゃで かいしゃに いきます']),
        choice(3, 'moodle-why-cooking', 'moodle:6097314:30428f5f:p1:q7:1', 'Moodle - Chapter 9 どうして - page 1', 'ゴードンさんに りょうりを ならいます（わたしは りょうりが へたです）', 'どうして ゴードンさんに りょうりを ならいますか', 'why-choice', ['どうして ゴードンさんに りょうりを ならいますか', 'ゴードンさんに どうして りょうりを ならいますか', 'ゴードンさんに りょうりを ならいますから']),
        choice(4, 'moodle-why-thai-book', 'moodle:6097314:30428f5f:p1:q7:3', 'Moodle - Chapter 9 どうして - page 1', 'タイごの ほんを かいました（らいげつ タイへ いきます）', 'どうして タイごの ほんを かいましたか', 'why-choice', ['どうして タイごの ほんを かいましたか', 'どうして タイごの ほんを かいますか', 'タイごの ほんを どうして かいましたか']),
        choice(5, 'moodle-why-pub', 'moodle:6097314:30428f5f:p1:q7:4', 'Moodle - Chapter 9 どうして - page 1', 'きのう パブへ いきませんでした（しごとが たくさん ありました）', 'どうして きのう パブへ いきませんでしたか', 'why-choice', ['どうして きのう パブへ いきませんでしたか', 'どうして きのう パブへ いきますか', 'きのう パブへ いきませんでしたから']),
        choice(6, 'moodle-have-dictionary', 'moodle:6097314:f7854a77:p2:q2:1', 'Moodle - Chapter 9 possessions and degree - page 2', 'じしょ（はい）', 'じしょが ありますか', 'availability-choice', ['じしょが ありますか', 'じしょは ありますか', 'じしょが ありませんか']),
        choice(7, 'moodle-have-change', 'moodle:6097314:f7854a77:p2:q2:4', 'Moodle - Chapter 9 possessions and degree - page 2', 'こまかい おかね（はい／たくさん）', 'はい、たくさん あります', 'availability-choice', ['はい、たくさん あります', 'いいえ、たくさん ありません', 'はい、ぜんぜん あります']),
        choice(8, 'moodle-have-money', 'moodle:6097314:f7854a77:p2:q2:5', 'Moodle - Chapter 9 possessions and degree - page 2', 'おかね（いいえ／ぜんぜん）', 'いいえ、ぜんぜん ありません', 'availability-choice', ['いいえ、ぜんぜん ありません', 'はい、ぜんぜん あります', 'いいえ、たくさん あります']),
        typed(9, 'genki-free-today', 'I am not free today. Because I have a test tomorrow.', 'きょうは ひまじゃないです。あした テストが ありますから。', ['きょうはひまじゃないです。あしたテストがありますから', '今日は暇じゃないです。明日テストがありますから']),
        typed(10, 'genki-test', 'The test was not difficult. Because I had studied a lot.', 'テストは むずかしくなかったです。たくさん べんきょうしましたから。', ['テストはむずかしくなかったです。たくさんべんきょうしましたから', 'テストは難しくなかったです。たくさん勉強しましたから']),
        typed(11, 'genki-holiday', "Let's go out tonight. Because tomorrow is a holiday.", 'こんばん でかけましょう。あしたは やすみですから。', ['こんばんでかけましょう。あしたはやすみですから', '今晩出かけましょう。明日は休みですから']),
    ] satisfies readonly ReasonWorkbookRound[]);
    return Object.freeze({
        id: 'activity:l1-l14-reason-workbook', kind: 'academy-reason-workbook', responseKind: 'mixed-source-reason-workbook', answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: Object.freeze(rounds.map(round => round.conceptId)),
        prompt: { ja: 'どうしてとからの型を先に学び、Moodle、Minnaの対応づけ、Genkiの順に取り組みます。', en: 'Learn why and because patterns first, then work through Moodle, the Minna chronology map, and Genki.' },
        provenance: {
            packageId: 'l1-l14', answerVisibility: 'after-attempt', sourceOrder: ['moodle', 'minna-mapping', 'genki'],
            moodle: { moduleId: 6097314, archiveSha256: MOODLE_ARCHIVE_SHA256, documents: [
                { payloadSha256: MOODLE_REASON_SHA256, member: 'Handouts/Chapter 9-2_Grammar Exercise_〜ですから.pdf', pages: '1' },
                { payloadSha256: MOODLE_WHY_SHA256, member: 'Handouts/Chapter 9-2_Grammar Exercise_どうして.pdf', pages: '1' },
                { payloadSha256: MOODLE_EXISTENCE_SHA256, member: 'Handouts/Chapter 9-2_Grammar Exercise_Describing possessions_things to do, etc and the degree.pdf', pages: '2' },
            ] },
            minna: { sourceId: `minna-i:${MINNA_SHA256}:lesson-9:pdf-p97`, reference: 'Minna no Nihongo I, Lesson 9', payloadSha256: MINNA_SHA256, pdfPage: 97, printedPage: 77, relation: 'chronology-map-only', reason: 'Lesson 9 is the authorized Minna chronology map; its available exercises practise preferences, skills, and understanding rather than the Moodle reason prompts, so no Minna answer is presented as a から source item.' },
            genki: { taskId: GENKI_TASK_ID, payloadSha256: GENKI_SHA256, scriptSha256: GENKI_SCRIPT_SHA256, lineLocus: { start: 76, end: 133 }, engine: 'Genki.generateQuiz', sourceSlice: [1, 2, 3] },
        },
        payload: {
            teaching: [
                teaching('moodle:6097314:a3198912:p1:q1', 'Moodle - Chapter 9 〜ですから - page 1', 'reason ですから、result', 'Put the stated reason first. から attaches directly to that reason, and the supplied result follows.', '理由を先に置き、「から」を理由に直接つけます。そのあとに与えられた結果を置きます。', 'ちかてつは たかいですから、じてんしゃで かいしゃに いきます。'),
                teaching('moodle:6097314:30428f5f:p1:q7', 'Moodle - Chapter 9 どうして - page 1', 'どうして + unchanged action + か', 'Keep the source action and its tense intact. Add どうして at the beginning and か at the end.', '元の行動と時制をそのままにします。最初に「どうして」、最後に「か」を足します。', 'どうして きのう パブへ いきませんでしたか。'),
                teaching('moodle:6097314:f7854a77:p2:q2', 'Moodle - Chapter 9 possessions and degree - page 2', 'N が ありますか。はい、たくさん あります。／いいえ、ぜんぜん ありません。', 'Use が for the available item. たくさん pairs with an affirmative answer; ぜんぜん pairs with a negative answer here.', 'ある物には「が」を使います。「たくさん」は肯定、「ぜんぜん」はここでは否定と組みにします。', 'おかねが ありますか。いいえ、ぜんぜん ありません。'),
            ], rounds, passScore: 1,
            feedback: {
                pass: { explanation: { ja: '11問の元資料を順番どおりに完成しました。', en: 'You completed all 11 source items in order.' } },
                lapse: { explanation: { ja: '理由・どうして・ありますの型を直す問題があります。', en: 'At least one reason, why-question, or availability pattern needs repair.' }, repairPrompt: { ja: '表示された問題だけを直し、必要ならヒントを開きましょう。', en: 'Repair only the visible items, using a hint when needed.' }, nearbyExample: { ja: 'いそがしいですから、いきません。', en: 'Because I am busy, I will not go.' } },
            },
        },
    } satisfies ReasonWorkbookModel);
}

export function createLessonFourteenReasonWorkbookBeat(): LessonActivityBeat {
    return Object.freeze({ id: 'reason-workbook', narrative: { ja: 'リエが理由カードを並べ、トムが「どうして」と「から」でつなげます。', en: 'Rie lays out reason cards while Tom links them with why and because.' }, activity: createLessonFourteenReasonWorkbookModel() });
}

function choice(sourceOrder: number, id: string, sourceQuestionId: string, sourceLabel: string, sourcePrompt: string, answerExpression: string, mode: 'result-choice' | 'why-choice' | 'availability-choice', labels: readonly [string, string, string]): ReasonWorkbookRound {
    return Object.freeze({ id, sourceOrder, sourceQuestionId, sourceLabel, sourcePrompt, answerExpression, mode, options: labels.map((label, index) => option(index === 0 ? 'answer' : `distractor-${index}`, label)), correctOptionId: 'answer', conceptId: `concept:l1-l14:reason:${sourceOrder}`, errorTag: `l1-l14-reason-${sourceOrder}`, hint: hints(mode) });
}

function typed(sourceOrder: number, id: string, sourcePrompt: string, answerExpression: string, acceptedAnswers: readonly string[]): ReasonWorkbookRound {
    return Object.freeze({ id, sourceOrder, sourceQuestionId: `${GENKI_TASK_ID}:slot-${sourceOrder - 8}`, sourceLabel: 'Genki I - Lesson 6 - workbook 7', sourcePrompt, answerExpression, acceptedAnswers, mode: 'typed', conceptId: `concept:l1-l14:reason:${sourceOrder}`, errorTag: `l1-l14-reason-${sourceOrder}`, hint: hints('typed') });
}

function option(id: string, label: string): ReasonWorkbookOption { return Object.freeze({ id, label }); }
function teaching(sourceQuestionId: string, sourceLabel: string, pattern: string, en: string, ja: string, example: string) { return Object.freeze({ sourceQuestionId, sourceLabel, pattern, explanation: { en, ja }, example }); }
function hints(mode: ReasonWorkbookRound['mode']): readonly [LocalizedText, LocalizedText, LocalizedText] {
    const steps = mode === 'result-choice' ? ['Read the reason before から.', 'Find the supplied result.', 'Keep cause first, then result.']
        : mode === 'why-choice' ? ['Find the action and its tense.', 'Put どうして before the action.', 'End the unchanged action with か.']
            : mode === 'availability-choice' ? ['Identify the item.', 'Mark the item with が.', 'Pair たくさん with あります or ぜんぜん with ありません.']
                : ['Read both English clauses.', 'Keep the reason after the result.', 'Put から directly after the reason.'];
    return Object.freeze(steps.map((en, index) => ({ en, ja: ['理由を読みます。', '必要な形を選びます。', '文の最後を確かめます。'][index]! })) as [LocalizedText, LocalizedText, LocalizedText]);
}
