import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { LocalizedText } from '../domain/source-library';
import type { FridgeInventoryRound, FridgeInventoryWorkbookModel } from '../minigames/fridge-inventory-workbook';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const MOODLE_ARCHIVE_SHA256 = '2412b5cffe9f22758f583ac773293f1af371ef60e3c979650d10722499c593fa';
const COUNTER_SUMMARY_SHA256 = '26c694d907c740415f1c4ea82635d7bd6ed64a3106406a4f033398f056c3f1f8';
const INFO_GAP_A_SHA256 = '425fb0138247c6a0328ca9d3006ffd0c6fa088c29945400598bda07f38f89b58';
const INFO_GAP_B_SHA256 = 'fdb6883084e6340d7e0ba3dcef7cb868b8e57c220759135f8e84051ce4192fa4';
const GENKI_SHA256 = 'b20d58f1ada0f1785367cacaaf56e04363cf20e4134b4a4ef2aa0fee8114239c';
const GENKI_SCRIPT_SHA256 = '2232e46b99640e7232015d3aebce123865b5b2abf778119063fb8b45661cfd36';

export function createLessonEighteenFridgeInventoryWorkbookModel(): FridgeInventoryWorkbookModel {
    const rounds = Object.freeze([
        choice(1, 'counter-summary-apples', 'moodle:6200250:26c694d9:p1:q1', 'Moodle - Chapter 11 Counter Suffixes summary - page 1', 'りんご が いくつ ありますか。', 'みっつ あります。', ['みっつ あります。', 'ふたつ あります。', 'さんぼん あります。'], 'quantity-choice', 'count-apple'),
        choice(2, 'fridge-b-apple-exists', 'moodle:6200250:425fb013:p1:q1', 'Moodle - Chapter 11 fridge information gap A - page 1', 'Bさんの れいぞうこ の なかに りんご が ありますか。', 'はい、ありますよ。', ['はい、ありますよ。', 'いいえ、ありません。'], 'existence-choice', 'fridge-existence'),
        choice(3, 'fridge-b-apple-count', 'moodle:6200250:425fb013:p1:q2', 'Moodle - Chapter 11 fridge information gap A - page 1', 'りんご は いくつ ありますか。', 'ふたつ ありますよ。', ['ふたつ ありますよ。', 'みっつ ありますよ。', 'ななつ ありますよ。'], 'quantity-choice', 'count-tsu'),
        choice(4, 'fridge-b-water-exists', 'moodle:6200250:425fb013:p1:q3', 'Moodle - Chapter 11 fridge information gap A - page 1', 'Bさんの れいぞうこ の なかに みず が ありますか。', 'いいえ、ありません。', ['はい、ありますよ。', 'いいえ、ありません。'], 'existence-choice', 'fridge-existence'),
        choice(5, 'fridge-b-mikan-count', 'moodle:6200250:425fb013:p1:q4', 'Moodle - Chapter 11 fridge information gap A - page 1', 'みかん は いくつ ありますか。', 'ななつ ありますよ。', ['ななつ ありますよ。', 'むっつ ありますよ。', 'ふたつ ありますよ。'], 'quantity-choice', 'count-tsu'),
        choice(6, 'fridge-a-fish-count', 'moodle:6200250:fdb68830:p1:q5', 'Moodle - Chapter 11 fridge information gap B - page 1', 'Aさんの れいぞうこ の なかに さかな は なんびき ありますか。', 'さんびき ありますよ。', ['さんびき ありますよ。', 'にひき ありますよ。', 'ごひき ありますよ。'], 'quantity-choice', 'count-hiki'),
        typed(7, 'fridge-b-beer-report', 'moodle:6200250:425fb013:p1:report-1', 'Moodle - Chapter 11 fridge information gap A - page 1', 'Bさんの れいぞうこ の ビールを、報告の文にしてください。', 'Bさんの れいぞうこ の なかに ビールは さんぼん あります。', ['Bさんのれいぞうこのなかにビールはさんぼんあります', 'Bさんのれいぞうこのなかにビールがさんぼんあります'], 'count-hon'),
        typed(8, 'fridge-a-fish-report', 'moodle:6200250:fdb68830:p1:report-2', 'Moodle - Chapter 11 fridge information gap B - page 1', 'Aさんの れいぞうこ の さかなを、報告の文にしてください。', 'Aさんの れいぞうこ の なかに さかなは さんびき います。', ['Aさんのれいぞうこのなかにさかなはさんびきいます', 'Aさんのれいぞうこのなかにさかながさんびきいます'], 'count-hiki'),
    ] satisfies readonly FridgeInventoryRound[]);

    return Object.freeze({
        id: 'activity:l1-l18-fridge-inventory-workbook',
        kind: 'academy-fridge-inventory-workbook',
        responseKind: 'moodle-fridge-information-gap',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: Object.freeze(rounds.map(round => round.conceptId)),
        prompt: { ja: 'Moodleの助数詞の型を先に確認し、冷蔵庫A・Bの元の情報差問題を順番に解きます。', en: 'Read the Moodle counter frames first, then solve the original fridge A/B information gap in order.' },
        provenance: {
            packageId: 'l1-l18', answerVisibility: 'after-attempt', sourceOrder: ['moodle', 'minna-mapping', 'genki-support'],
            moodle: {
                moduleId: 6200250, archiveSha256: MOODLE_ARCHIVE_SHA256,
                documents: [
                    { payloadSha256: COUNTER_SUMMARY_SHA256, member: 'Handouts/Chapter 11 Counter Suffixes summery.pdf', pages: '1' },
                    { payloadSha256: INFO_GAP_A_SHA256, member: 'info gap activities/Chapter 11_info gap-1_asking what is in the fridge-A.pdf', pages: '1' },
                    { payloadSha256: INFO_GAP_B_SHA256, member: 'info gap activities/Chapter 11_info gap-1_asking what is in the fridge-B.pdf', pages: '1' },
                ],
                audio: { status: 'not-present-in-archive', memberCount: 0 },
            },
            minna: { sourceId: 'japanese-minna:11-11', reference: 'Minna no Nihongo I, Lesson 11', relation: 'chronology-map-only', reason: 'The authorized crosswalk maps this class to Minna Lesson 11. No Minna wording or answer is presented in this workbook.' },
            genki: { taskId: 'genki-2e:l1-l18:lesson-3-literacy-1', payloadSha256: GENKI_SHA256, scriptSha256: GENKI_SCRIPT_SHA256, lineLocus: { start: 76, end: 92 }, relation: 'post-instruction-counter-recognition-only', reason: 'The available Genki task recognizes 一・二 after instruction. No Genki wording or answer is presented in this Moodle-first workbook.' },
        },
        payload: {
            teaching: [
                teaching('moodle:6200250:26c694d9:p1:pattern', 'Moodle - Chapter 11 Counter Suffixes summary - page 1', 'N が いくつ／なん + Counter ありますか。', 'Ask いくつ for general things; use なんぼん and なんびき when the noun needs 本 or 匹.', '普通の物は「いくつ」、本・匹を使う物は「なんぼん」「なんびき」で数を聞きます。', 'りんご が いくつ ありますか。みっつ あります。'),
                teaching('moodle:6200250:425fb013:p1:exchange', 'Moodle - Chapter 11 fridge information gap A - page 1', 'Place に N が ありますか。', 'First confirm whether the item exists. Only then ask how many there are.', '最初に物があるかを聞きます。あると分かってから、数を聞きます。', 'れいぞうこ の なかに りんご が ありますか。はい、ありますよ。'),
                teaching('moodle:6200250:425fb013:p1:report', 'Moodle - Chapter 11 fridge information gap A - page 1', 'Place に N は Number Counter あります／います。', 'The worksheet ends by reporting the partner’s inventory. Keep the place, noun, number, counter, and existence verb together.', '最後は相手の冷蔵庫を報告します。場所、名詞、数、助数詞、あります／いますを一つの文に残します。', 'Bさんの れいぞうこ の なかに りんごは ふたつ あります。'),
            ],
            rounds, passScore: 1,
            feedback: {
                pass: { explanation: { ja: 'Moodleの冷蔵庫A・Bを、あるかどうか、数、報告の順に完成できました。', en: 'You completed the Moodle fridge A/B exchange: existence, quantity, then report.' } },
                lapse: { explanation: { ja: 'ある／ない、助数詞、または報告の文を直す問題があります。', en: 'At least one existence answer, counter, or report sentence needs repair.' }, repairPrompt: { ja: '表示された元の問題だけを直し、必要ならヒントを一つずつ開きましょう。', en: 'Repair only the visible source items, opening one hint at a time if needed.' }, nearbyExample: { ja: 'みずは ありません。ビールは さんぼん あります。', en: 'There is no water. There are three bottles of beer.' } },
            },
        },
    } satisfies FridgeInventoryWorkbookModel);
}

export function createLessonEighteenFridgeInventoryWorkbookBeat(): LessonActivityBeat {
    return Object.freeze({ id: 'fridge-inventory-workbook', narrative: { ja: 'シンとピーターが、二つの冷蔵庫メモを見せずに読みます。Moodleの質問を一つずつ聞き、数を報告します。', en: 'Shin and Peter read two fridge notes without showing them. They ask the Moodle questions one at a time, then report each quantity.' }, activity: createLessonEighteenFridgeInventoryWorkbookModel() });
}

function choice(sourceOrder: number, id: string, sourceQuestionId: string, sourceLabel: string, sourcePrompt: string, answerExpression: string, options: readonly string[], mode: 'existence-choice' | 'quantity-choice', concept: string): FridgeInventoryRound {
    return Object.freeze({ id, sourceOrder, sourceQuestionId, sourceLabel, sourcePrompt, answerExpression, acceptedAnswers: [answerExpression], options, mode, conceptId: `concept:l1-l18:${concept}:${sourceOrder}`, errorTag: `l1-l18-fridge-${sourceOrder}`, hint: hints(mode, sourcePrompt) });
}

function typed(sourceOrder: number, id: string, sourceQuestionId: string, sourceLabel: string, sourcePrompt: string, answerExpression: string, acceptedAnswers: readonly string[], concept: string): FridgeInventoryRound {
    return Object.freeze({ id, sourceOrder, sourceQuestionId, sourceLabel, sourcePrompt, answerExpression, acceptedAnswers, mode: 'report-typed', conceptId: `concept:l1-l18:${concept}:${sourceOrder}`, errorTag: `l1-l18-fridge-${sourceOrder}`, hint: hints('report-typed', sourcePrompt) });
}

function teaching(sourceQuestionId: string, sourceLabel: string, pattern: string, en: string, ja: string, example: string) {
    return Object.freeze({ sourceQuestionId, sourceLabel, pattern, explanation: { en, ja }, example });
}

function hints(mode: FridgeInventoryRound['mode'], sourcePrompt: string): readonly [LocalizedText, LocalizedText, LocalizedText] {
    const fish = sourcePrompt.includes('さかな'); const beer = sourcePrompt.includes('ビール');
    return Object.freeze([
        { en: 'Read the noun and its question word before choosing the ending.', ja: '答えの前に、名詞と質問の言葉を読みます。' },
        { en: mode === 'existence-choice' ? 'Decide whether the source fridge has the item.' : fish ? 'Fish use 匹, so listen for びき here.' : beer ? 'Beer bottles use 本, so listen for ぼん here.' : 'General food and drink use the つ count in this source exchange.', ja: mode === 'existence-choice' ? '元の冷蔵庫に、その物があるかを決めます。' : fish ? 'さかなは「匹」なので、ここでは「びき」です。' : beer ? 'ビールは「本」なので、ここでは「ぼん」です。' : 'このやり取りの普通の食べ物・飲み物は「つ」で数えます。' },
        { en: mode === 'report-typed' ? 'Keep the place, item, quantity, counter, and あります／います in one sentence.' : 'Keep the counter attached to the number in the reply.', ja: mode === 'report-typed' ? '場所、物、数、助数詞、あります／いますを一文に入れます。' : '答えでは、数と助数詞を離さないようにします。' },
    ] as [LocalizedText, LocalizedText, LocalizedText]);
}
