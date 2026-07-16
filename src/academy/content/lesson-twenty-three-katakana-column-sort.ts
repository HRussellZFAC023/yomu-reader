import lessonPackage from '../../../public/academy/content/lessons/024-l1-l23.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { KatakanaColumnSortModel } from '../minigames/katakana-column-sort';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l1-l23';
const MODULE_ID = 5489604;
const WORKSHEETS_SHA256 = '3d91645a697548f64c9d7e6d5b95d3ec6b70341fab204954114fd897727d603b';
const WRITING_SHA256 = 'fc0dc182111d5827edcd6b8d0e950dd2c325d13f57f9c78ed527820f2ba10731';
const WORKSHEETS_PAGE_SHA256 = '6cbfa4c81eddce26f264bf7f7ec2bf940db3bed1a98390d5404eb36ee9d0df30';
const WRITING_PAGE_SHA256 = '79eb8e8d59c8031511e04d36b440567d022138b1c8aee7dfae021e5277793930';
const GENKI_SHA256 = 'e7ef3284e24bce73828754813a3ef9eeb32ca01b1585481221dc4e1d3df110f0';

const ROUNDS = [
    ['ku', 'ク', 'u'],
    ['ka', 'カ', 'a'],
    ['ko', 'コ', 'o'],
    ['ki', 'キ', 'i'],
    ['ke', 'ケ', 'e'],
] as const;

export function createLessonTwentyThreeKatakanaColumnSortBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = ROUNDS.map(([id, kana, vowelColumnId]) => Object.freeze({
        id: `sensei-katakana-ka-${id}`,
        sourceCellId: `moodle:5489604:katakana-worksheets:p1:ka-row:cell-${vowelColumnId}`,
        kana,
        vowelColumnId,
        conceptId: `concept:l1-l23:katakana-ka:${id}`,
        reviewSeedId: `review:l1-l23:katakana-ka:${id}`,
        errorTag: `l1-l23-katakana-ka-${id}`,
    }));
    const activity: KatakanaColumnSortModel = {
        id: 'activity:l1-l23-sensei-katakana-column-sort',
        kind: 'academy-katakana-column-sort',
        responseKind: 'katakana-audio-column-sort',
        curriculumPhase: 'assessed-recognition',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map(round => round.conceptId),
        prompt: {
            ja: '先生のカ行を見てから、聞こえたカタカナ札を母音の列に分けましょう。',
            en: 'Study Sensei’s ka row first, then sort each heard katakana tile into its vowel column.',
        },
        payload: {
            teaching: [
                {
                    sourceLabel: 'Moodle - Katakana worksheets ア、カ、ガ, page 1',
                    pattern: 'カ　キ　ク　ケ　コ',
                    explanation: {
                        ja: 'カ行は、ア行と同じ母音の順番で、カ・キ・ク・ケ・コと進みます。まず形と母音の列を結びます。',
                        en: 'The ka row follows the same vowel order as the a row: カ, キ, ク, ケ, コ. First connect each shape to its vowel column.',
                    },
                },
                {
                    sourceLabel: 'Moodle - Katakana writing practice ア、カ, page 2',
                    pattern: 'カ　キ　ク　ケ　コ',
                    explanation: {
                        ja: '先生の書く練習では、カ行だけを一行として確認します。ガ行は見本にありますが、この課ではまだ答えにしません。',
                        en: 'Sensei’s writing practice checks the ka row as one line. The ga row is visible on the worksheet, but is not an answer in this lesson yet.',
                    },
                },
            ],
            sourceVisuals: [
                {
                    url: '/academy/content/lessons/l1-l23/moodle-katakana-worksheets-a-ka-ga-page-1.png',
                    sha256: WORKSHEETS_PAGE_SHA256,
                    label: { ja: 'Moodle原本: Katakana worksheets ア、カ、ガ - 1ページ', en: 'Moodle original: Katakana worksheets ア, カ, ガ - page 1' },
                },
                {
                    url: '/academy/content/lessons/l1-l23/moodle-katakana-writing-ka-page-2.png',
                    sha256: WRITING_PAGE_SHA256,
                    label: { ja: 'Moodle原本: Katakana writing practice ア、カ - 2ページ', en: 'Moodle original: Katakana writing practice ア, カ - page 2' },
                },
            ],
            audioSupport: {
                provider: 'canonical-yomu-pronunciation-service',
                sourceAudioStatus: 'not-present-in-moodle-archive',
                role: 'post-instruction-runtime-pronunciation-support',
            },
            columns: [
                { id: 'a', label: 'a' }, { id: 'i', label: 'i' }, { id: 'u', label: 'u' }, { id: 'e', label: 'e' }, { id: 'o', label: 'o' },
            ],
            rounds,
            passScore: 1,
            signalLabel: { ja: '番号を押して、よむの発音サポートで音を確かめましょう。', en: 'Press a numbered signal to check its sound with Yomu pronunciation support.' },
            tileLabel: { ja: '札を選んで、対応する母音の列に置きましょう。', en: 'Select a tile, then place it in the matching vowel column.' },
            feedback: {
                pass: {
                    explanation: { ja: 'カ行の五つの形を、先生の表と同じ母音の列に置けました。', en: 'You placed all five ka-row shapes in the same vowel columns as Sensei’s chart.' },
                },
                lapse: {
                    explanation: { ja: '一つ以上のカ行の形が、まだ別の母音の列にあります。', en: 'At least one ka-row shape is still in a different vowel column.' },
                    repairPrompt: { ja: 'まちがえた音をもう一度聞き、先生のカ行だけを左から右へ見て、その札を置き直しましょう。', en: 'Listen to the missed signal again, look only across Sensei’s ka row from left to right, and replace that tile.' },
                    nearbyExample: { ja: 'カ　キ　ク　ケ　コ', en: 'カ　キ　ク　ケ　コ' },
                },
            },
        },
    };
    return Object.freeze({
        id: 'sensei-katakana-column-sort',
        narrative: {
            ja: 'エンジェルが先生のカ行の札を、五つの母音の列の前に置きます。ソフィーは、聞こえた音を英語のつづりに急がず、表のどの列へ戻るかを確かめます。',
            en: 'Angel places Sensei’s ka-row tiles before five vowel columns. Sophie asks the learner not to rush to English spelling, but to check which chart column each heard sound returns to.',
        },
        activity: Object.freeze(activity),
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l1-l23 package');
    if (root.id !== PACKAGE_ID || record(root.identity, 'l1-l23 identity').moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l1-l23 package identity.');
    }
    const members = array(record(root.sourceCoverage, 'l1-l23 coverage').members, 'l1-l23 members')
        .map((value, index) => record(value, `l1-l23 member ${index}`));
    for (const [payloadSha256, title] of [
        [WORKSHEETS_SHA256, 'Katakana worksheets ア、カ、ガ'],
        [WRITING_SHA256, 'Katakana writing practice ア、カ'],
    ] as const) {
        const member = members.find(candidate => candidate.payloadSha256 === payloadSha256);
        if (!member || typeof member.title !== 'string' || member.title.normalize('NFC') !== title.normalize('NFC')) {
            throw new TypeError(`Missing exact l1-l23 Moodle source ${title}.`);
        }
    }
    const activities = array(root.genkiInteractiveActivities, 'l1-l23 Genki activities')
        .map((value, index) => record(value, `l1-l23 Genki activity ${index}`));
    const genki = activities.find(activity => activity.id === 'genki-2e:l1-l23:lesson-2-literacy-wb-2');
    if (!genki || record(genki.source, 'l1-l23 Genki source').payloadSha256 !== GENKI_SHA256) {
        throw new TypeError('Lesson 23 requires its exact Genki ア-コ spelling support.');
    }
    const mappings = array(record(root.provenance, 'l1-l23 provenance').sourceMappings, 'l1-l23 mappings')
        .map((value, index) => record(value, `l1-l23 mapping ${index}`));
    const minna = mappings.find(mapping => mapping.sourceId === 'source-minna-no-nihongo');
    if (!minna || minna.reference !== 'Minna no Nihongo I · Katakana strand' || minna.reuse !== 'sequence-only') {
        throw new TypeError('Lesson 23 needs Minna katakana sequence support only.');
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
