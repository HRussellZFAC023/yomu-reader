import lessonPackage from '../../../public/academy/content/lessons/027-l1-l26.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { KatakanaFinalRowShelfModel } from '../minigames/katakana-final-row-shelf';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l1-l26';
const MODULE_ID = 5489607;
const WORKSHEETS_SHA256 = 'fc87ef4717a9260618cc1c1be8db9e9e37ad472bf5cd1f403d6c840075cd90f8';
const WRITING_MA_YA_SHA256 = 'bd66bf86f9aed1ed25aa6f102248d027f15c4730bd8d2ce875ce90f561ece210';
const WRITING_RA_WA_SHA256 = '9a9536daffb37ea2fe14f0d183acbbfcf0da16f5c653decad5f75a55f53f8406';
const WORKSHEETS_PAGE_SHA256 = '19ce34abaf39b5798d13f352db7462d27e3ed326e51d0973d67c1b3b5de6044c';
const WRITING_MA_YA_PAGE_SHA256 = '489e36ae8a9fe64dcc8a7df53338aa49173b4b3cd7d14ab2b71cd329e4fcc488';
const WRITING_RA_WA_PAGE_SHA256 = '3c8399ccb89c07cfb76e08fcee0d7ac8dd6fcd5c07858e61f516a68dbf9ced4e';
const GENKI_MA_YA_SHA256 = '9acd39a783634219f77b6c466855596bf57e367433118f13557f9a39dfba4a9c';
const GENKI_RA_WA_SHA256 = '719818bc6d046caace39545ff549ee8e4fbc99dc5f0870e943e35804c4c31c5e';

const ROUNDS = [
    ['ra-o', 'ロ', 'ra:o'], ['ya-u', 'ユ', 'ya:u'], ['ma-e', 'メ', 'ma:e'], ['wa-n', 'ン', 'wa:n'],
    ['ra-i', 'リ', 'ra:i'], ['ma-a', 'マ', 'ma:a'], ['ya-o', 'ヨ', 'ya:o'], ['ra-u', 'ル', 'ra:u'],
    ['wa-a', 'ワ', 'wa:a'], ['ma-i', 'ミ', 'ma:i'], ['ra-a', 'ラ', 'ra:a'], ['ma-o', 'モ', 'ma:o'],
    ['ya-a', 'ヤ', 'ya:a'], ['ra-e', 'レ', 'ra:e'], ['wa-o', 'ヲ', 'wa:o'], ['ma-u', 'ム', 'ma:u'],
] as const;

export function createLessonTwentySixKatakanaFinalRowShelfBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = ROUNDS.map(([id, kana, slotId]) => {
        const [rowId, cellId] = slotId.split(':');
        return Object.freeze({
            id: `sensei-katakana-${id}`,
            sourceCellId: `moodle:5489607:katakana-worksheets:p1:${rowId}-row:cell-${cellId}`,
            kana,
            slotId,
            conceptId: `concept:l1-l26:katakana-${rowId}:${cellId}`,
            reviewSeedId: `review:l1-l26:katakana-${rowId}:${cellId}`,
            errorTag: `l1-l26-katakana-${rowId}-${cellId}`,
        });
    });
    const activity: KatakanaFinalRowShelfModel = {
        id: 'activity:l1-l26-sensei-katakana-final-row-shelf',
        kind: 'academy-katakana-final-row-shelf',
        responseKind: 'katakana-audio-final-row-shelf',
        curriculumPhase: 'assessed-recognition',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(round => round.conceptId),
        prompt: {
            ja: '先生のマ行・ヤ行・ラ行・ワ行を見てから、聞こえたカタカナを最後の棚の正しい置き場へ戻しましょう。',
            en: 'Study Sensei’s ma, ya, ra, and wa rows first, then return each heard katakana to its correct final shelf slot.',
        },
        payload: {
            teaching: [
                {
                    sourceLabel: 'Moodle - Katakana worksheets マ、ヤ、ラ、ワ, page 1',
                    pattern: 'マ　ミ　ム　メ　モ　／　ヤ　ユ　ヨ　／　ラ　リ　ル　レ　ロ　／　ワ　ヲ　ン',
                    explanation: {
                        ja: '先生の表は、マ行とラ行を五つの母音の順に置き、ヤ行とワ行は表にある三つの位置だけを使います。空いている位置を作らず、見えている十六の形だけを確かめます。',
                        en: 'Sensei’s chart gives the ma and ra rows five vowel positions, while the ya and wa rows use only the three visible positions. Do not invent empty positions: check only the sixteen shapes on the source chart.',
                    },
                },
                {
                    sourceLabel: 'Moodle - Katakana writing practice マ、ヤ / ラ、ワ, pages 1-2',
                    pattern: 'マ　ミ　ム　メ　モ　／　ヤ　ユ　ヨ　／　ラ　リ　ル　レ　ロ　／　ワ　ヲ　ン',
                    explanation: {
                        ja: '先生の書く練習は、まずマからヨ、次にラからンを確かめます。聞く前に、短いヤ行とワ行を五つの行のように広げず、見本どおりに読みます。',
                        en: 'Sensei’s writing practice checks マ through ヨ first, then ラ through ン. Before listening, read the shorter ya and wa rows as shown, without stretching them into five-cell rows.',
                    },
                },
            ],
            sourceVisuals: [
                { url: '/academy/content/lessons/l1-l26/moodle-katakana-worksheets-ma-ya-ra-wa-page-1.png', sha256: WORKSHEETS_PAGE_SHA256, label: { ja: 'Moodle原本: Katakana worksheets マ、ヤ、ラ、ワ - 1ページ', en: 'Moodle original: Katakana worksheets マ, ヤ, ラ, ワ - page 1' } },
                { url: '/academy/content/lessons/l1-l26/moodle-katakana-writing-ma-ya-page-1.png', sha256: WRITING_MA_YA_PAGE_SHA256, label: { ja: 'Moodle原本: Katakana writing practice マ、ヤ - 1ページ', en: 'Moodle original: Katakana writing practice マ, ヤ - page 1' } },
                { url: '/academy/content/lessons/l1-l26/moodle-katakana-writing-ra-wa-page-2.png', sha256: WRITING_RA_WA_PAGE_SHA256, label: { ja: 'Moodle原本: Katakana writing practice ラ、ワ - 2ページ', en: 'Moodle original: Katakana writing practice ラ, ワ - page 2' } },
            ],
            audioSupport: { provider: 'canonical-yomu-pronunciation-service', sourceAudioStatus: 'not-present-in-moodle-archive', role: 'post-instruction-runtime-pronunciation-support' },
            supportReferences: {
                minna: { reference: 'Minna no Nihongo I, Katakana strand', role: 'chronology-map-only' },
                genki: [
                    { taskId: 'genki-2e:l1-l26:lesson-2-literacy-wb-7', payloadSha256: GENKI_MA_YA_SHA256, lineLocus: [76, 91], role: 'post-instruction-writing-support-only' },
                    { taskId: 'genki-2e:l1-l26:lesson-2-literacy-wb-9:2', payloadSha256: GENKI_RA_WA_SHA256, lineLocus: [76, 91], role: 'post-instruction-writing-support-only' },
                ],
            },
            shelves: [
                { id: 'ma', label: { ja: 'マ行', en: 'ma row' }, slots: [{ id: 'ma:a', label: 'a' }, { id: 'ma:i', label: 'i' }, { id: 'ma:u', label: 'u' }, { id: 'ma:e', label: 'e' }, { id: 'ma:o', label: 'o' }] },
                { id: 'ya', label: { ja: 'ヤ行', en: 'ya row' }, slots: [{ id: 'ya:a', label: 'a' }, { id: 'ya:u', label: 'u' }, { id: 'ya:o', label: 'o' }] },
                { id: 'ra', label: { ja: 'ラ行', en: 'ra row' }, slots: [{ id: 'ra:a', label: 'a' }, { id: 'ra:i', label: 'i' }, { id: 'ra:u', label: 'u' }, { id: 'ra:e', label: 'e' }, { id: 'ra:o', label: 'o' }] },
                { id: 'wa', label: { ja: 'ワ行', en: 'wa row' }, slots: [{ id: 'wa:a', label: 'a' }, { id: 'wa:o', label: 'o' }, { id: 'wa:n', label: 'n' }] },
            ],
            rounds,
            passScore: 1,
            shelfMapLabel: { ja: '番号の音を聞き、先生の表と同じ行・位置の棚を一つ選びましょう。', en: 'Listen to each numbered signal, then choose one shelf matching Sensei’s chart row and visible position.' },
            feedback: {
                pass: { explanation: { ja: '十六の音を、先生の最後の四行にある正しい置き場へ戻せました。', en: 'You returned all sixteen sounds to their correct shelf slots in Sensei’s final four rows.' } },
                lapse: {
                    explanation: { ja: '一つ以上の音が、まだ別の行か位置にあります。', en: 'At least one sound is still on a different row or visible position.' },
                    repairPrompt: { ja: 'まちがえた音をもう一度聞き、先生の表でその行だけを左から右へ見て、空いている位置を作らずに選び直しましょう。', en: 'Listen to the missed signal again, scan only its row on Sensei’s chart from left to right, and choose again without inventing an empty position.' },
                    nearbyExample: { ja: 'ヤ　ユ　ヨ　／　ワ　ヲ　ン', en: 'ヤ　ユ　ヨ　／　ワ　ヲ　ン' },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-katakana-final-row-shelf',
        narrative: {
            ja: 'ミカが先生の最後の四行を、形の数が変わる棚に写します。エンジェルは、聞こえた音を急いで五つの位置にそろえず、表にある棚だけへ戻します。',
            en: 'Mika copies Sensei’s final four rows onto shelves whose lengths change. Angel returns each heard sound only to a shelf on the chart, without forcing every row into five positions.',
        },
        activity: Object.freeze(activity),
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l1-l26 package');
    if (root.id !== PACKAGE_ID || record(root.identity, 'l1-l26 identity').moduleId !== MODULE_ID) throw new TypeError('Unexpected l1-l26 package identity.');
    const members = array(record(root.sourceCoverage, 'l1-l26 coverage').members, 'l1-l26 members').map((value, index) => record(value, `l1-l26 member ${index}`));
    for (const [payloadSha256, title] of [
        [WORKSHEETS_SHA256, 'Katakana worksheets マ、ヤ、ラ、ワ'],
        [WRITING_MA_YA_SHA256, 'Katakana writing practice マ、ヤ'],
        [WRITING_RA_WA_SHA256, 'Katakana writing practice ラ、ワ'],
    ] as const) {
        const member = members.find(candidate => candidate.payloadSha256 === payloadSha256);
        if (!member || typeof member.title !== 'string' || member.title.normalize('NFC') !== title.normalize('NFC')) throw new TypeError(`Missing exact l1-l26 Moodle source ${title}.`);
    }
    const activities = array(root.genkiInteractiveActivities, 'l1-l26 Genki activities').map((value, index) => record(value, `l1-l26 Genki activity ${index}`));
    for (const [id, sha256] of [
        ['genki-2e:l1-l26:lesson-2-literacy-wb-7', GENKI_MA_YA_SHA256],
        ['genki-2e:l1-l26:lesson-2-literacy-wb-9:2', GENKI_RA_WA_SHA256],
    ] as const) {
        const activity = activities.find(candidate => candidate.id === id);
        if (!activity || record(activity.source, `${id} source`).payloadSha256 !== sha256) throw new TypeError(`Lesson 26 requires exact Genki writing support ${id}.`);
    }
    const mappings = array(record(root.provenance, 'l1-l26 provenance').sourceMappings, 'l1-l26 mappings').map((value, index) => record(value, `l1-l26 mapping ${index}`));
    const minna = mappings.find(mapping => mapping.sourceId === 'source-minna-no-nihongo');
    if (!minna || minna.reference !== 'Minna no Nihongo I · Katakana strand' || minna.reuse !== 'sequence-only') throw new TypeError('Lesson 26 needs Minna katakana sequence support only.');
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
    return value as Readonly<Record<string, unknown>>;
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    return value;
}
