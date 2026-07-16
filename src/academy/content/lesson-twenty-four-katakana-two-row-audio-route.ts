import lessonPackage from '../../../public/academy/content/lessons/025-l1-l24.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { KatakanaTwoRowAudioRouteModel } from '../minigames/katakana-two-row-audio-route';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l1-l24';
const MODULE_ID = 5489605;
const WORKSHEETS_SHA256 = '4e80396249d5c18b73b28e9c0f4340ba53e529d848697bd83fb615fb1963f21d';
const WRITING_SHA256 = 'edbbbb0c570512ddafcecb513c3bb534e4b609f7c56c0d875c2aa5170aaeadd5';
const WORKSHEETS_PAGE_SHA256 = 'cba30d8842877f8687ac5d28ac7b0d7ab6f156c990e71c44b5e9113b79981e2f';
const WRITING_SA_PAGE_SHA256 = '325523de6a17787b0725b62cf682d4257e264fbcbf70078d7b56ef2fb6fbd2fe';
const WRITING_TA_PAGE_SHA256 = '7429b8e7831314f34a89e59475be2c56c4c9840d4e9ec05770e12c04908542b2';
const GENKI_SHA256 = 'e31d06ae1090da9d4cab825393c380b3be516bd2d3dcdabf4e38e06a964715d0';

const ROUNDS = [
    ['ta-u', 'ツ', 'ta', 'u'], ['sa-e', 'セ', 'sa', 'e'], ['ta-a', 'タ', 'ta', 'a'], ['sa-i', 'シ', 'sa', 'i'], ['ta-o', 'ト', 'ta', 'o'],
    ['sa-a', 'サ', 'sa', 'a'], ['ta-e', 'テ', 'ta', 'e'], ['sa-o', 'ソ', 'sa', 'o'], ['ta-i', 'チ', 'ta', 'i'], ['sa-u', 'ス', 'sa', 'u'],
] as const;

export function createLessonTwentyFourKatakanaTwoRowAudioRouteBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = ROUNDS.map(([id, kana, rowId, vowelColumnId]) => Object.freeze({
        id: `sensei-katakana-${id}`,
        sourceCellId: `moodle:5489605:katakana-worksheets:p1:${rowId}-row:cell-${vowelColumnId}`,
        kana,
        rowId,
        vowelColumnId,
        conceptId: `concept:l1-l24:katakana-${rowId}:${vowelColumnId}`,
        reviewSeedId: `review:l1-l24:katakana-${rowId}:${vowelColumnId}`,
        errorTag: `l1-l24-katakana-${rowId}-${vowelColumnId}`,
    }));
    const activity: KatakanaTwoRowAudioRouteModel = {
        id: 'activity:l1-l24-sensei-katakana-two-row-audio-route',
        kind: 'academy-katakana-two-row-audio-route',
        responseKind: 'katakana-two-row-audio-route',
        curriculumPhase: 'assessed-recognition',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(round => round.conceptId),
        prompt: {
            ja: '先生のサ行とタ行を見てから、聞こえたカタカナを二行の道順で見つけましょう。',
            en: 'Study Sensei’s sa and ta rows first, then locate each heard katakana on the two-row route.',
        },
        payload: {
            teaching: [
                {
                    sourceLabel: 'Moodle - Katakana worksheets サ、ザ、タ、ダ, page 1',
                    pattern: 'サ　シ　ス　セ　ソ　／　タ　チ　ツ　テ　ト',
                    explanation: {
                        ja: '先生の表では、サ行とタ行の両方が、ア・イ・ウ・エ・オの母音の順番を使います。ザ行とダ行は見本にありますが、この課の答えにはしません。',
                        en: 'Sensei’s chart gives both the sa and ta rows the a, i, u, e, o vowel order. The za and da rows are visible examples, but are not answers in this lesson.',
                    },
                },
                {
                    sourceLabel: 'Moodle - Katakana writing practice サ、タ, pages 1-2',
                    pattern: 'サ　シ　ス　セ　ソ　／　タ　チ　ツ　テ　ト',
                    explanation: {
                        ja: '先生の書く練習は、サ行とタ行を別々のページで確かめます。音を聞く前に、二つの行の形と小さい線の向きを見ます。',
                        en: 'Sensei’s writing practice checks the sa and ta rows on separate pages. Before listening, notice each row’s shapes and the direction of its small strokes.',
                    },
                },
            ],
            sourceVisuals: [
                { url: '/academy/content/lessons/l1-l24/moodle-katakana-worksheets-sa-za-ta-da-page-1.png', sha256: WORKSHEETS_PAGE_SHA256, label: { ja: 'Moodle原本: Katakana worksheets サ、ザ、タ、ダ - 1ページ', en: 'Moodle original: Katakana worksheets サ, ザ, タ, ダ - page 1' } },
                { url: '/academy/content/lessons/l1-l24/moodle-katakana-writing-sa-page-1.png', sha256: WRITING_SA_PAGE_SHA256, label: { ja: 'Moodle原本: Katakana writing practice サ、タ - サ行 1ページ', en: 'Moodle original: Katakana writing practice サ, タ - sa row page 1' } },
                { url: '/academy/content/lessons/l1-l24/moodle-katakana-writing-ta-page-2.png', sha256: WRITING_TA_PAGE_SHA256, label: { ja: 'Moodle原本: Katakana writing practice サ、タ - タ行 2ページ', en: 'Moodle original: Katakana writing practice サ, タ - ta row page 2' } },
            ],
            audioSupport: { provider: 'canonical-yomu-pronunciation-service', sourceAudioStatus: 'not-present-in-moodle-archive', role: 'post-instruction-runtime-pronunciation-support' },
            supportReferences: {
                minna: { reference: 'Minna no Nihongo I, Katakana strand', role: 'chronology-map-only' },
                genki: { taskId: 'genki-2e:l1-l24:lesson-2-literacy-wb-3', payloadSha256: GENKI_SHA256, lineLocus: [76, 93], role: 'post-instruction-writing-support-only' },
            },
            rows: [{ id: 'sa', label: { ja: 'サ行', en: 'sa row' } }, { id: 'ta', label: { ja: 'タ行', en: 'ta row' } }],
            columns: [{ id: 'a', label: 'a' }, { id: 'i', label: 'i' }, { id: 'u', label: 'u' }, { id: 'e', label: 'e' }, { id: 'o', label: 'o' }],
            rounds,
            passScore: 1,
            routeLabel: { ja: '番号の音を聞き、サ行かタ行か、どの母音の位置かを選びましょう。', en: 'Listen to each numbered signal, then choose its sa/ta row and vowel position.' },
            feedback: {
                pass: { explanation: { ja: '十の音を、先生のサ行とタ行の正しい位置へ戻せました。', en: 'You returned all ten sounds to their correct positions in Sensei’s sa and ta rows.' } },
                lapse: {
                    explanation: { ja: '一つ以上の音が、まだ別の行か母音の位置にあります。', en: 'At least one sound is still in a different row or vowel position.' },
                    repairPrompt: { ja: 'まちがえた音をもう一度聞き、先生の表でサ行とタ行だけを左から右へ見て、道順を選び直しましょう。', en: 'Listen to the missed signal again, scan only Sensei’s sa and ta rows from left to right, then choose the route coordinate again.' },
                    nearbyExample: { ja: 'サ　シ　ス　セ　ソ　／　タ　チ　ツ　テ　ト', en: 'サ　シ　ス　セ　ソ　／　タ　チ　ツ　テ　ト' },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-katakana-two-row-audio-route',
        narrative: {
            ja: 'ミカが先生のサ行とタ行を二本の道に分け、エンジェルは聞こえた音がどちらの道の、どの母音の位置に帰るかを確かめます。ザ行とダ行は見本のままにします。',
            en: 'Mika lays Sensei’s sa and ta rows as two routes. Angel checks which route and vowel position each heard sound returns to, while leaving the za and da examples as examples.',
        },
        activity: Object.freeze(activity),
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l1-l24 package');
    if (root.id !== PACKAGE_ID || record(root.identity, 'l1-l24 identity').moduleId !== MODULE_ID) throw new TypeError('Unexpected l1-l24 package identity.');
    const members = array(record(root.sourceCoverage, 'l1-l24 coverage').members, 'l1-l24 members').map((value, index) => record(value, `l1-l24 member ${index}`));
    for (const [payloadSha256, title] of [[WORKSHEETS_SHA256, 'Katakana worksheets サ、ザ、タ、ダ'], [WRITING_SHA256, 'Katakana writing practice サ、タ']] as const) {
        const member = members.find(candidate => candidate.payloadSha256 === payloadSha256);
        if (!member || typeof member.title !== 'string' || member.title.normalize('NFC') !== title.normalize('NFC')) throw new TypeError(`Missing exact l1-l24 Moodle source ${title}.`);
    }
    const activities = array(root.genkiInteractiveActivities, 'l1-l24 Genki activities').map((value, index) => record(value, `l1-l24 Genki activity ${index}`));
    const genki = activities.find(activity => activity.id === 'genki-2e:l1-l24:lesson-2-literacy-wb-3');
    if (!genki || record(genki.source, 'l1-l24 Genki source').payloadSha256 !== GENKI_SHA256) throw new TypeError('Lesson 24 requires its exact Genki サ-through-ト writing support.');
    const mappings = array(record(root.provenance, 'l1-l24 provenance').sourceMappings, 'l1-l24 mappings').map((value, index) => record(value, `l1-l24 mapping ${index}`));
    const minna = mappings.find(mapping => mapping.sourceId === 'source-minna-no-nihongo');
    if (!minna || minna.reference !== 'Minna no Nihongo I · Katakana strand' || minna.reuse !== 'sequence-only') throw new TypeError('Lesson 24 needs Minna katakana sequence support only.');
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
    return value as Readonly<Record<string, unknown>>;
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    return value;
}
