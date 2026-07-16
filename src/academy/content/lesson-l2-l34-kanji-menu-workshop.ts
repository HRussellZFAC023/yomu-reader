import lessonPackage from '../../../public/academy/content/lessons/061-l2-l34.json';
import { createKanjiWritingActivity, type KanjiWritingActivityModel } from '../activities/kanji-writing';
import { createPicturelessMenuReaderActivity } from '../activities/pictureless-menu-reader';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { LocalizedText } from '../domain/source-library';
import type { KanjiWritingModel } from '../integration/yomu-bridge';
import type {
    StateInspectionInteraction,
    StateInspectionModel,
    StateInspectionOption,
    StateInspectionRound,
    StateInspectionSourceVisual,
} from '../minigames/state-inspection';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l2-l34';
const PACKAGE_ORDER = 61;
const MODULE_ID = 8121293;
const ARCHIVE_ID = 'archive-000096';
const ARCHIVE_SHA256 = 'fef6a7e4dab4bfc85a5f02e7713837f771ab4a32b316522c5640896d94063c02';
const WORKSHEET_SHA256 = '0139b9a8eac967df4d2f159a9a64077b23e3225a04159eff6f601751d8ff9fbd';
const SOURCE_TITLE = 'Kanji 7-肉、料、理、野、半、大、小_worksheets';

export const L2_L34_SOURCE_PAGES: StateInspectionModel['provenance']['moodle']['sourceSheets'] = Object.freeze([
    visual(
        1,
        'moodle-kanji-7-worksheet-page-1.png',
        'c4f0432c78ee351c4d1b1361289078dc511301788b0f43abe7acd1b025798c89',
        {
            ja: 'Moodle 原本: 肉、料、理、野、半の読み方、ことば、例文、書き順。',
            en: 'Moodle original: readings, words, examples, and stroke rows for 肉, 料, 理, 野, and 半.',
        },
    ),
    visual(
        2,
        'moodle-kanji-7-worksheet-page-2.png',
        '799c46dd724fc02f14711be447fbfbf032a6d9b7da65b43744e78df3406e26c6',
        {
            ja: 'Moodle 原本: 大、小の表と、漢字練習・読み練習・定食メニュー。',
            en: 'Moodle original: 大 and 小 tables, kanji practice, reading practice, and the set-meal menu.',
        },
    ),
]);

export function createLessonL2L34PicturelessMenuStoryBeat(): LessonActivityBeat {
    return Object.freeze({
        id: 'pictureless-menu-story',
        narrative: {
            ja: '先生の漢字7ワークシートを開く前に、シンさんと写真のないメニューの手がかりを追います。',
            en: 'Before opening Sensei’s Kanji 7 worksheet, follow the pictureless menu clues with Shin.',
        },
        activity: createPicturelessMenuReaderActivity(),
    });
}

export function createLessonL2L34KanjiMenuReadingBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const rounds = [
        round('meat-reading', 1, 1, 'word-table', 1, 'state-select', 'word-table:肉', '肉', 'にく', [
            option('にく'),
            option('りょうり'),
        ]),
        round('cooking-reading', 2, 1, 'word-table', 2, 'action-choice', 'word-table:料理', '料理', 'りょうり', [
            option('りょうり'),
            option('りょうきん'),
        ]),
        round('vegetable-reading', 3, 1, 'word-table', 3, 'typed-report', 'word-table:野菜', '野菜', 'やさい'),
        round('half-price-reading', 4, 1, 'word-table', 4, 'action-choice', 'word-table:半額', '半額', 'はんがく', [
            option('はんがく'),
            option('はんぶん'),
        ]),
        round('adult-reading', 5, 2, 'word-table', 5, 'typed-report', 'word-table:大人', '<大人>', 'おとな'),
        round('small-bird-reading', 6, 2, 'word-table', 6, 'state-select', 'word-table:小鳥', '小鳥', 'ことり', [
            option('ことり'),
            option('しょうがっこう'),
        ]),
        round('fish-card-reading', 7, 2, 2, 1, 'typed-report', 'task-2:魚', '魚', 'さかな'),
        round('sake-card-reading', 8, 2, 2, 4, 'action-choice', 'task-2:酒', '酒', 'さけ', [
            option('さけ'),
            option('さかな'),
        ]),
    ] as const;

    const activity: StateInspectionModel = {
        id: 'activity:l2-l34-kanji-menu-reading',
        kind: 'academy-state-inspection',
        responseKind: 'moodle-kanji-7-menu-reading',
        curriculumPhase: 'assessed-production',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: rounds.map((item) => item.conceptId),
        prompt: {
            ja: '先生の漢字7ワークシートを先に学び、印刷された八つの読みを復元してください。',
            en: 'Study Sensei’s Kanji 7 worksheet first, then restore eight readings printed on it.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            packageOrder: PACKAGE_ORDER,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                archiveId: ARCHIVE_ID,
                sourceSheets: L2_L34_SOURCE_PAGES,
                media: {
                    status: 'no-audio-members-in-package',
                    sourceAudioMembers: 0,
                    sourceAudioTracksDelivered: 0,
                },
                answerKeyBasis: 'source-provided-readings-with-yomu-derived-deterministic-reading-pairing',
            },
            support: {
                minna: {
                    reference: 'Minna no Nihongo II · food and quantity vocabulary',
                    reuse: 'chronology-and-scope-only',
                },
                genki: {
                    crosswalk: '≈ Genki II · parallel N4 kanji scope',
                    reuse: 'sequence-only',
                },
            },
        },
        payload: {
            teaching: [
                {
                    title: SOURCE_TITLE,
                    text: 'Read the two canonical Moodle pages before attempting retrieval. The printed readings and words are the teaching source; Yomu does not replace them.',
                },
                {
                    title: '1: 漢字の 練習をしましょう。',
                    text: 'Please practice those Kanji above.',
                },
                {
                    title: '2: 漢字を 読んでみましょう。',
                    text: 'Please read those Kanji below.',
                },
                {
                    title: 'Whole-word readings',
                    text: 'Keep printed words together: 料理 is りょうり, 野菜 is やさい, 半額 is はんがく, and <大人> is おとな.',
                },
                {
                    title: 'Source and support boundary',
                    text: 'The reading labels are printed on Sensei’s worksheet. Pairing them to retrieval controls and all English guidance are Yomu support, not a source answer key.',
                },
            ],
            taskHeadings: [
                { sourceTask: 'word-table', text: '読み方・ことば' },
                { sourceTask: 1, text: '1: 漢字の 練習をしましょう。' },
                { sourceTask: 2, text: '2: 漢字を 読んでみましょう。' },
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: {
                    explanation: {
                        ja: '先生が印刷した八つの読みを、語全体の形で確認できました。',
                        en: 'You restored all eight printed readings as whole words.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '間違えた語だけ、先生の「読み方」「ことば」「読める」の欄を確認しましょう。',
                        en: 'For only the missed words, recheck Sensei’s 読み方, ことば, and 読める panels.',
                    },
                    repairPrompt: {
                        ja: '間違えた語だけを直し、必要なら原本とヒントを一つずつ開きましょう。',
                        en: 'Repair only the missed words, reopening the source and one earned hint at a time.',
                    },
                    nearbyExample: {
                        ja: '先生の表: 料理 りょうり／野菜 やさい／半額 はんがく',
                        en: 'Sensei’s table: 料理 りょうり; 野菜 やさい; 半額 はんがく.',
                    },
                },
            },
        },
    };

    return Object.freeze({
        id: 'kanji-menu-reading',
        narrative: {
            ja: 'シンが先生の漢字7の二枚を開きます。原本の表と読み練習を先に見てから、肉、料理、野菜、半額、大人、小鳥、魚、酒を読みます。',
            en: 'Shin opens Sensei’s two Kanji 7 pages. After studying the source tables and reading task, the class reads 肉, 料理, 野菜, 半額, 大人, 小鳥, 魚, and 酒.',
        },
        activity: Object.freeze(activity),
    });
}

export function createLessonL2L34RiWritingBeat(trace: KanjiWritingModel): LessonActivityBeat {
    assertExactPackageSources();
    if (trace.character !== '理') throw new TypeError('l2-l34 requires the pinned 理 KanjiVG trace.');
    const activity: KanjiWritingActivityModel = {
        ...createKanjiWritingActivity(trace, {
            id: 'activity:l2-l34-source-ri-writing',
            conceptId: 'concept:l2-l34:ri-writing',
            prompt: {
                ja: '先生の「理」の練習欄を見てから、理を書き、印刷された読み方を入力しましょう。',
                en: 'Study Sensei’s 理 practice panel, then write 理 and enter the printed reading.',
            },
            reading: 'り',
            meaning: { ja: '料理の「理」', en: '理 as printed in 料理' },
            strokeInstruction: {
                ja: '先生の薄い見本と書き順を確認し、KanjiVGのガイドで一画ずつ書きます。',
                en: 'Check Sensei’s faint model and stroke row, then use the separately attributed KanjiVG guide one stroke at a time.',
            },
            readingPrompt: {
                ja: '先生の表で「理」の読み方は何ですか。',
                en: 'What reading does Sensei’s table print for 理?',
            },
            writingFeedback: {
                pass: {
                    ja: '理の形と画数を確認して書けました。',
                    en: 'You completed 理 with its checked shape and stroke count.',
                },
                lapse: {
                    ja: '先生の薄い見本とKanjiVGのガイドをもう一度確認しましょう。',
                    en: 'Check Sensei’s faint model and the attributed KanjiVG guide once more.',
                },
                repair: {
                    ja: '一画ずつ見本と比べ、ずれた部分だけを書き直しましょう。',
                    en: 'Compare one stroke at a time and redraw only the part that drifted.',
                },
                example: { ja: '先生のことば欄: 料理', en: 'Sensei’s word row: 料理.' },
            },
            readingFeedback: {
                pass: {
                    ja: 'はい。先生の表では「理」は「リ」です。',
                    en: 'Yes. Sensei’s table prints リ for 理.',
                },
                lapse: {
                    ja: '先生の「読み方」のカタカナと、まだ合っていません。',
                    en: 'That does not yet match the katakana in Sensei’s 読み方 row.',
                },
                repair: {
                    ja: '「リ」を声に出してから、ひらがなで入力しましょう。',
                    en: 'Say リ aloud, then enter it in hiragana.',
                },
                example: {
                    ja: '料理　りょうり',
                    en: 'The source word is 料理, read りょうり.',
                },
            },
            review: {
                id: 'review:l2-l34:ri-writing',
                expression: '理',
                reading: 'り',
                meanings: ['理 as printed in 料理'],
            },
        }),
        sourceQuestionId: sourceQuestion(1, 'practice-panel:理'),
    };
    return Object.freeze({
        id: 'source-ri-writing',
        narrative: {
            ja: '読みを戻したあと、シンが理の練習欄を指します。先生の原本を確認し、別に出典を示したKanjiVGのガイドで書いてから「リ」を思い出します。',
            en: 'After restoring the readings, Shin points to the 理 practice panel. Check Sensei’s original, write with the separately attributed KanjiVG guide, then recall リ.',
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
    locus: string,
    sourcePrompt: string,
    answerExpression: string,
    options: readonly StateInspectionOption[] = [],
): StateInspectionRound {
    return Object.freeze({
        id,
        interaction,
        sourceOrder,
        sourcePage,
        sourceTask,
        sourceItem,
        sourceQuestionId: sourceQuestion(sourcePage, locus),
        sourcePrompt,
        options,
        answerValue: answerExpression,
        answerExpression,
        acceptedAnswers: [answerExpression],
        conceptId: `concept:l2-l34:reading:${sourceOrder}`,
        errorTag: `l2-l34-reading-${sourceOrder}`,
        hints: readingHints(sourcePrompt, answerExpression),
    });
}

function sourceQuestion(page: number, locus: string): string {
    return `moodle:${MODULE_ID}:${WORKSHEET_SHA256}:pdf-p${page}:${locus}`;
}

function option(value: string): StateInspectionOption {
    return Object.freeze({
        value,
        label: Object.freeze({ ja: value, en: value }),
    });
}

function readingHints(sourcePrompt: string, answer: string): StateInspectionRound['hints'] {
    return [
        Object.freeze({
            ja: `先生の原本で「${sourcePrompt}」を探します。`,
            en: `Find ${sourcePrompt} on Sensei’s original page.`,
        }),
        Object.freeze({
            ja: '「読み方」か「読める」の欄を見ます。',
            en: 'Check the 読み方 or 読める row.',
        }),
        Object.freeze({
            ja: `原本に印刷された読みは「${answer}」です。`,
            en: `The reading printed on the source is ${answer}.`,
        }),
    ];
}

function visual(
    page: StateInspectionSourceVisual['page'],
    filename: string,
    sha256: string,
    alt: LocalizedText,
): StateInspectionSourceVisual {
    return Object.freeze({
        sourceId: `moodle:${WORKSHEET_SHA256}:page:${page}`,
        payloadSha256: WORKSHEET_SHA256,
        title: SOURCE_TITLE,
        page,
        url: `/academy/content/lessons/l2-l34/${filename}`,
        sha256,
        alt: Object.freeze(alt),
    });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l34 package');
    const identity = record(root.identity, 'l2-l34 identity');
    const coverage = record(root.sourceCoverage, 'l2-l34 coverage');
    if (
        root.id !== PACKAGE_ID ||
        root.order !== PACKAGE_ORDER ||
        identity.moduleId !== MODULE_ID ||
        coverage.archiveModuleId !== MODULE_ID ||
        coverage.archiveId !== ARCHIVE_ID ||
        coverage.archiveSha256 !== ARCHIVE_SHA256 ||
        coverage.memberFileCount !== 1
    ) {
        throw new TypeError('Unexpected l2-l34 package identity or source archive.');
    }
    const members = array(coverage.members, 'l2-l34 members').map((value) => record(value, 'l2-l34 member'));
    if (
        !members.some(
            (member) =>
                member.payloadSha256 === WORKSHEET_SHA256 &&
                member.kind === 'document' &&
                member.title === SOURCE_TITLE &&
                member.extension === '.pdf',
        )
    ) {
        throw new TypeError('Missing exact l2-l34 Kanji 7 Moodle worksheet.');
    }
    if (members.some((member) => member.kind === 'audio'))
        throw new TypeError('l2-l34 must not invent Moodle audio support.');
    const mapping = record(root.mapping, 'l2-l34 mapping');
    if (
        mapping.minna !== 'Minna no Nihongo II · food and quantity vocabulary' ||
        mapping.genki !== '≈ Genki II · parallel N4 kanji scope'
    ) {
        throw new TypeError('l2-l34 must preserve sequence-only Minna and Genki mappings.');
    }
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`Expected ${label}.`);
    return value as Readonly<Record<string, unknown>>;
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`Expected ${label}.`);
    return value;
}
