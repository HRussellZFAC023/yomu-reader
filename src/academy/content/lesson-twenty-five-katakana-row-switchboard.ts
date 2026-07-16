import lessonPackage from '../../../public/academy/content/lessons/026-l1-l25.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { KatakanaRowSwitchboardModel } from '../minigames/katakana-row-switchboard';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l1-l25';
const MODULE_ID = 5489606;
const WORKSHEETS_SHA256 = '64f6bf40afa9e3c1e89752df662400f6ae3031ecb9c3af467ed6ddc884d7ce73';
const WRITING_SHA256 = '3d81532f1f522b416c2c66b33fc2d5a7280639ae887b7a09e8ee00d997fc814b';
const WORKSHEETS_PAGE_SHA256 = '15f434e6c76102b2956f0634e9a1aebc01fd67ca75a63a2a386c66834e20814e';
const WRITING_NA_PAGE_SHA256 = '07c75b5e11d0bc9484dcf07dcd6610278853bd250a7b4dfe30bf2687d217fcb2';
const WRITING_HA_PAGE_SHA256 = '38b51b4390d9f7890e85064c217080a5fcb1c5e274e45bad1e0d947af71220fd';
const GENKI_SHA256 = 'de78c11601b08f6c675cb6fd3d04b3117dd7847fc720deec41e7c5fa463f64f8';

const ROUNDS = [
    ['ha-u', 'フ', 'ha', 'u'], ['na-e', 'ネ', 'na', 'e'], ['ha-a', 'ハ', 'ha', 'a'], ['na-i', 'ニ', 'na', 'i'], ['ha-o', 'ホ', 'ha', 'o'],
    ['na-a', 'ナ', 'na', 'a'], ['ha-e', 'ヘ', 'ha', 'e'], ['na-o', 'ノ', 'na', 'o'], ['ha-i', 'ヒ', 'ha', 'i'], ['na-u', 'ヌ', 'na', 'u'],
] as const;

export function createLessonTwentyFiveKatakanaRowSwitchboardBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = ROUNDS.map(([id, kana, rowId, vowelColumnId]) => Object.freeze({
        id: `sensei-katakana-${id}`,
        sourceCellId: `moodle:5489606:katakana-worksheets:p1:${rowId}-row:cell-${vowelColumnId}`,
        kana,
        rowId,
        vowelColumnId,
        conceptId: `concept:l1-l25:katakana-${rowId}:${vowelColumnId}`,
        reviewSeedId: `review:l1-l25:katakana-${rowId}:${vowelColumnId}`,
        errorTag: `l1-l25-katakana-${rowId}-${vowelColumnId}`,
    }));
    const activity: KatakanaRowSwitchboardModel = {
        id: 'activity:l1-l25-sensei-katakana-row-switchboard',
        kind: 'academy-katakana-row-switchboard',
        responseKind: 'katakana-audio-row-switchboard',
        curriculumPhase: 'assessed-recognition',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(round => round.conceptId),
        prompt: {
            ja: '先生のナ行とハ行を見てから、聞こえたカタカナを行のスイッチと母音のダイヤルで設定しましょう。',
            en: 'Study Sensei’s na and ha rows first, then set each heard katakana with a row switch and vowel dial.',
        },
        payload: {
            teaching: [
                {
                    sourceLabel: 'Moodle - Katakana worksheets ナ、ハ、パ、バ, page 1',
                    pattern: 'ナ　ニ　ヌ　ネ　ノ　／　ハ　ヒ　フ　ヘ　ホ',
                    explanation: {
                        ja: '先生の表では、ナ行とハ行の両方がア・イ・ウ・エ・オの母音順を使います。パ行とバ行は見本にありますが、この課の答えにはしません。',
                        en: 'Sensei’s chart gives both the na and ha rows the a, i, u, e, o vowel order. The pa and ba rows are visible examples, but are not answers in this lesson.',
                    },
                },
                {
                    sourceLabel: 'Moodle - Katakana writing practice ナ、ハ, pages 1-2',
                    pattern: 'ナ　ニ　ヌ　ネ　ノ　／　ハ　ヒ　フ　ヘ　ホ',
                    explanation: {
                        ja: '先生の書く練習では、ナ行とハ行を別々のページで確かめます。音を聞く前に、二つの行の形と小さい線の向きを見ます。',
                        en: 'Sensei’s writing practice checks the na and ha rows on separate pages. Before listening, notice each row’s shapes and the direction of its small strokes.',
                    },
                },
            ],
            sourceVisuals: [
                { url: '/academy/content/lessons/l1-l25/moodle-katakana-worksheets-na-ha-pa-ba-page-1.png', sha256: WORKSHEETS_PAGE_SHA256, label: { ja: 'Moodle原本: Katakana worksheets ナ、ハ、パ、バ - 1ページ', en: 'Moodle original: Katakana worksheets ナ, ハ, パ, バ - page 1' } },
                { url: '/academy/content/lessons/l1-l25/moodle-katakana-writing-na-page-1.png', sha256: WRITING_NA_PAGE_SHA256, label: { ja: 'Moodle原本: Katakana writing practice ナ、ハ - ナ行 1ページ', en: 'Moodle original: Katakana writing practice ナ, ハ - na row page 1' } },
                { url: '/academy/content/lessons/l1-l25/moodle-katakana-writing-ha-page-2.png', sha256: WRITING_HA_PAGE_SHA256, label: { ja: 'Moodle原本: Katakana writing practice ナ、ハ - ハ行 2ページ', en: 'Moodle original: Katakana writing practice ナ, ハ - ha row page 2' } },
            ],
            audioSupport: { provider: 'canonical-yomu-pronunciation-service', sourceAudioStatus: 'not-present-in-moodle-archive', role: 'post-instruction-runtime-pronunciation-support' },
            supportReferences: {
                minna: { reference: 'Minna no Nihongo I, Katakana strand', role: 'chronology-map-only' },
                genki: { taskId: 'genki-2e:l1-l25:lesson-2-literacy-wb-5', payloadSha256: GENKI_SHA256, lineLocus: [76, 93], role: 'post-instruction-writing-support-only' },
            },
            rows: [{ id: 'na', label: { ja: 'ナ行', en: 'na row' } }, { id: 'ha', label: { ja: 'ハ行', en: 'ha row' } }],
            columns: [{ id: 'a', label: 'a' }, { id: 'i', label: 'i' }, { id: 'u', label: 'u' }, { id: 'e', label: 'e' }, { id: 'o', label: 'o' }],
            rounds,
            passScore: 1,
            switchboardLabel: { ja: '番号の音を聞き、行のスイッチを選んでから母音のダイヤルを合わせましょう。', en: 'Listen to each numbered signal, choose its row switch, then set its vowel dial.' },
            feedback: {
                pass: { explanation: { ja: '十の音を、先生のナ行とハ行の正しい設定へ戻せました。', en: 'You returned all ten sounds to their correct na/ha row and vowel settings in Sensei’s chart.' } },
                lapse: {
                    explanation: { ja: '一つ以上の音が、まだ別の行か母音の設定にあります。', en: 'At least one sound is still set to a different row or vowel.' },
                    repairPrompt: { ja: 'まちがえた音をもう一度聞き、先生の表でナ行とハ行だけを左から右へ見て、行のスイッチと母音のダイヤルを合わせ直しましょう。', en: 'Listen to the missed signal again, scan only Sensei’s na and ha rows from left to right, then reset its row switch and vowel dial.' },
                    nearbyExample: { ja: 'ナ　ニ　ヌ　ネ　ノ　／　ハ　ヒ　フ　ヘ　ホ', en: 'ナ　ニ　ヌ　ネ　ノ　／　ハ　ヒ　フ　ヘ　ホ' },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-katakana-row-switchboard',
        narrative: {
            ja: 'エンジェルが先生のナ行とハ行をスイッチボードに写し、ミカは聞こえた音ごとに行と母音を別々に合わせます。パ行とバ行は見本のままにします。',
            en: 'Angel copies Sensei’s na and ha rows onto a switchboard, while Mika sets the row and vowel separately for each heard sound. The pa and ba rows remain examples.',
        },
        activity: Object.freeze(activity),
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l1-l25 package');
    if (root.id !== PACKAGE_ID || record(root.identity, 'l1-l25 identity').moduleId !== MODULE_ID) throw new TypeError('Unexpected l1-l25 package identity.');
    const members = array(record(root.sourceCoverage, 'l1-l25 coverage').members, 'l1-l25 members').map((value, index) => record(value, `l1-l25 member ${index}`));
    for (const [payloadSha256, title] of [[WORKSHEETS_SHA256, 'Katakana worksheets ナ、ハ、パ、バ'], [WRITING_SHA256, 'Katakana writing practice ナ、ハ']] as const) {
        const member = members.find(candidate => candidate.payloadSha256 === payloadSha256);
        if (!member || typeof member.title !== 'string' || member.title.normalize('NFC') !== title.normalize('NFC')) throw new TypeError(`Missing exact l1-l25 Moodle source ${title}.`);
    }
    const activities = array(root.genkiInteractiveActivities, 'l1-l25 Genki activities').map((value, index) => record(value, `l1-l25 Genki activity ${index}`));
    const genki = activities.find(activity => activity.id === 'genki-2e:l1-l25:lesson-2-literacy-wb-5');
    if (!genki || record(genki.source, 'l1-l25 Genki source').payloadSha256 !== GENKI_SHA256) throw new TypeError('Lesson 25 requires its exact Genki ナ-through-ホ writing support.');
    const mappings = array(record(root.provenance, 'l1-l25 provenance').sourceMappings, 'l1-l25 mappings').map((value, index) => record(value, `l1-l25 mapping ${index}`));
    const minna = mappings.find(mapping => mapping.sourceId === 'source-minna-no-nihongo');
    if (!minna || minna.reference !== 'Minna no Nihongo I · Katakana strand' || minna.reuse !== 'sequence-only') throw new TypeError('Lesson 25 needs Minna katakana sequence support only.');
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
    return value as Readonly<Record<string, unknown>>;
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    return value;
}
