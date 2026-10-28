import lessonPackage from '../../../public/academy/content/lessons/050-l2-l23.json';
import { createKanjiWritingActivity, type KanjiWritingActivityModel } from '../activities/kanji-writing';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { KanjiWritingModel } from '../integration/yomu-bridge';
import type { DragSortModel, TypedResponseModel } from '../minigames/activity-kit';
import type { SourceVocabularySheetModel } from '../minigames/source-vocabulary-sheet';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l2-l23';
const PACKAGE_ORDER = 50;
const MODULE_ID = 8121282;
const ARCHIVE_ID = 'archive-000093';
const ARCHIVE_SHA256 = 'f5645afdd801a647519a815d08453ca6891b283eb895d49faab72d5528abed26';
const HOMEWORK_ONE_SHA256 = '6342c59291f35db3d62afa139b1aecdebc994cb57ab048fe439bbf5045ce7b78';
const HOMEWORK_TWO_SHA256 = 'c1fb869d36a5bade7cdbed46d145c7f47f23fe88152fbb8a17a4ea635177cbc2';
const WORKSHEET_DOCX_SHA256 = '5d1e52068c0cb6a6b905ffeb7e4b2496b530cd2a5c47f25d7eb4972c1578d61b';
const WORKSHEET_PDF_SHA256 = 'b6446cd4695a506e9ff357f64b6f471496fb30690c42836f2480b13857c4b7aa';

export const L2_L23_SOURCE_PAGES = Object.freeze([
    sourcePage(HOMEWORK_ONE_SHA256, 'Homework kanji 6 exerise-1', 1, 'moodle-kanji-6-homework-1-page-1.png', '35adaabcad66d2390f888bc09c2b18bc5c60365bac45b31d3ee67579f3d5af5d'),
    sourcePage(HOMEWORK_ONE_SHA256, 'Homework kanji 6 exerise-1', 2, 'moodle-kanji-6-homework-1-page-2.png', '14d73e83b687bde84dabf5748a00272aa0bdc433fe048051759f6d464916fcf5'),
    sourcePage(HOMEWORK_TWO_SHA256, 'Homework kanji 6 exerise-2', 1, 'moodle-kanji-6-homework-2-page-1.png', '0543f2583d52708ef026a9183e497fe2589c6be5ecdd341d24298e707a09be84'),
    sourcePage(HOMEWORK_TWO_SHA256, 'Homework kanji 6 exerise-2', 2, 'moodle-kanji-6-homework-2-page-2.png', '7efc261f6cf0d067d1861b8d3ab0e71f9f2d7e55979b5aa114863de661bd247c'),
    sourcePage(WORKSHEET_PDF_SHA256, 'Kanji 6-今、来、帰、会、社、聞、読、書、話 worksheets', 1, 'moodle-kanji-6-worksheet-page-1.png', '4e9b1710492f1efebc86d604d2661efe511e115ab137468a8ba54aa4545b35b6'),
    sourcePage(WORKSHEET_PDF_SHA256, 'Kanji 6-今、来、帰、会、社、聞、読、書、話 worksheets', 2, 'moodle-kanji-6-worksheet-page-2.png', '9d57a93778b5d3093cea5aa74a6043d41a23b8cda3e05b46c21c139d1ae63171'),
    sourcePage(WORKSHEET_PDF_SHA256, 'Kanji 6-今、来、帰、会、社、聞、読、書、話 worksheets', 3, 'moodle-kanji-6-worksheet-page-3.png', '6db9feb865d40fb763243e9128c36c415bf1211accd7063dedaf2368fb4a7da7'),
]);

export function createLessonL2L23SourceVocabularyBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const activity: SourceVocabularySheetModel = {
        id: 'activity:l2-l23-source-newspaper-row',
        kind: 'academy-source-vocabulary-sheet',
        responseKind: 'source-vocabulary-recall',
        curriculumPhase: 'guided-practice',
        sourceQuestionId: sourceId(WORKSHEET_PDF_SHA256, 3, 'reading-panel-1'),
        conceptIds: ['concept:l2-l23:newspaper-reading'],
        prompt: {
            ja: '先生の3ページ目の「新聞」を、意味を見る前に思い出しましょう。',
            en: 'Recall the meaning of the teacher-sheet word 新聞 before revealing support.',
        },
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        provenance: {
            packageId: PACKAGE_ID,
            componentId: 'kanji-6-reading-panels',
            sourceId: `moodle:${WORKSHEET_PDF_SHA256}`,
            sourceQuestionId: sourceId(WORKSHEET_PDF_SHA256, 3, 'reading-panel-1'),
            payloadSha256: WORKSHEET_PDF_SHA256,
            sourceTitle: 'Kanji 6-今、来、帰、会、社、聞、読、書、話 worksheets',
            locus: { page: 3, row: 1 },
        },
        payload: {
            exact: { words: '新聞', pronunciation: 'しんぶん', meaning: null },
            support: { words: '新聞', reading: 'しんぶん', meaning: 'newspaper' },
            fieldProvenance: { words: 'source-provided', reading: 'source-provided', meaning: 'yomu-support' },
        },
    };
    return beat('source-newspaper-row', {
        ja: 'シンが先生の漢字6ワークシートを開きます。意味はまだ隠したまま、新聞の読みだけを確認します。',
        en: 'Shin opens Sensei’s Kanji 6 worksheet. Keep the meaning covered for now and check only the reading of 新聞.',
    }, activity);
}

export function createLessonL2L23KanjiColumnSortBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const activity: DragSortModel = {
        id: 'activity:l2-l23-source-kanji-sheet-columns',
        kind: 'academy-drag-sort',
        responseKind: 'drag-or-keyboard-sort',
        curriculumPhase: 'assessed-recognition',
        sourceQuestionId: sourceId(WORKSHEET_PDF_SHA256, 2, 'kanji-practice-columns'),
        conceptIds: ['concept:l2-l23:movement-time', 'concept:l2-l23:communication'],
        prompt: {
            ja: '先生の2ページの二つの漢字群に、九つの札を戻しましょう。',
            en: 'Return the nine tiles to the two kanji groups shown across Sensei’s worksheet pages.',
        },
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        teachingSupport: {
            kind: 'pattern',
            title: { ja: '先生の二つの欄', en: 'Sensei’s two columns' },
            entries: [
                { japanese: '今　来　帰　会　社', translation: 'page 1: time, movement, meeting, and company' },
                { japanese: '聞　読　書　話', translation: 'page 2: hearing, reading, writing, and speaking' },
            ],
        },
        payload: {
            sourceLabel: { ja: '先生のKanji 6ワークシート', en: 'Sensei’s Kanji 6 worksheet' },
            items: [
                item('now', '今', 'movement'), item('come', '来', 'movement'), item('return', '帰', 'movement'),
                item('meet', '会', 'movement'), item('company', '社', 'movement'), item('hear', '聞', 'communication'),
                item('read', '読', 'communication'), item('write', '書', 'communication'), item('speak', '話', 'communication'),
            ],
            zones: [
                { id: 'movement', label: { ja: '1ページ: 今・来・帰・会・社', en: 'Page 1: 今, 来, 帰, 会, 社' }, appearance: 'tray' },
                { id: 'communication', label: { ja: '2ページ: 聞・読・書・話', en: 'Page 2: 聞, 読, 書, 話' }, appearance: 'tray' },
            ],
            passScore: 1,
            errorTag: 'l2-l23-kanji-sheet-columns',
            feedback: {
                pass: { explanation: { ja: '先生の一ページ目と二ページ目の漢字群を、そのまま分けられました。', en: 'You restored the kanji to the same page-one and page-two groups shown by Sensei.' } },
                lapse: {
                    explanation: { ja: '一つ以上の漢字が、先生の別のページの群にあります。', en: 'At least one kanji is in the group shown on a different Sensei page.' },
                    repairPrompt: { ja: '先生の一ページ目を上から下へ見てから、二ページ目の聞・読・書・話を確認しましょう。', en: 'Scan Sensei’s first worksheet page top to bottom, then check 聞, 読, 書, 話 on page two.' },
                    nearbyExample: { ja: '今　来　帰　会　社　／　聞　読　書　話', en: 'The source worksheet splits these five and four characters across its two practice pages.' },
                },
            },
            reviewTargets: [
                { id: 'review:l2-l23:movement-time', conceptId: 'concept:l2-l23:movement-time', expression: '今　来　帰　会　社', meanings: ['Sensei’s page-one Kanji 6 group'] },
                { id: 'review:l2-l23:communication', conceptId: 'concept:l2-l23:communication', expression: '聞　読　書　話', meanings: ['Sensei’s page-two Kanji 6 group'] },
            ],
        },
    };
    return beat('source-kanji-sheet-columns', {
        ja: 'ソフィーがワークシートの二ページを並べます。新しい文章を作らず、先生が分けた二つの群へ札を戻します。',
        en: 'Sophie places the two worksheet pages side by side. Without making a new sentence, return each tile to the group Sensei already made.',
    }, activity);
}

export function createLessonL2L23LibraryReadingBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const activity: TypedResponseModel = {
        id: 'activity:l2-l23-source-library-reading',
        kind: 'academy-typed-response',
        responseKind: 'kana-input',
        curriculumPhase: 'assessed-recognition',
        sourceQuestionId: sourceId(WORKSHEET_PDF_SHA256, 3, 'reading-panel-2'),
        conceptIds: ['concept:l2-l23:library-reading'],
        prompt: {
            ja: '先生の3ページ目で「図書館」を読んでから、ひらがなで入力しましょう。',
            en: 'Read 図書館 on Sensei’s third worksheet page, then type its reading in hiragana.',
        },
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        teachingSupport: {
            kind: 'vocabulary',
            title: { ja: '先生の読む欄', en: 'Sensei’s reading panel' },
            entries: [{ japanese: '図書館', reading: 'としょかん', translation: 'library' }],
        },
        payload: {
            inputLabel: { ja: '「図書館」の読み方', en: 'Reading of 図書館' },
            acceptedAnswers: ['としょかん'],
            errorTag: 'l2-l23-library-reading',
            feedback: {
                pass: { explanation: { ja: '先生の読む欄どおり、「図書館」をとしょかんと読めました。', en: 'You read 図書館 as としょかん, matching Sensei’s reading panel.' } },
                lapse: {
                    explanation: { ja: '先生の3ページ目のふりがなと、まだ合っていません。', en: 'That does not yet match the furigana on Sensei’s third page.' },
                    repairPrompt: { ja: '図・書・館の下の三つのひらがなを、左から声に出して確認しましょう。', en: 'Say the three hiragana beneath 図, 書, and 館 from left to right.' },
                    nearbyExample: { ja: '図書館　としょかん', en: 'The source panel prints 図書館 with としょかん beneath it.' },
                },
            },
            reviewTargets: [{ id: 'review:l2-l23:library-reading', conceptId: 'concept:l2-l23:library-reading', expression: '図書館', reading: 'としょかん', meanings: ['library'] }],
        },
    };
    return beat('source-library-reading', {
        ja: 'シンが図書館の札を持ち、ページにある読みだけを使います。英語の意味は、入力したあとで確認できます。',
        en: 'Shin holds the library card and uses only the reading printed on the page. The English support can wait until after the attempt.',
    }, activity);
}

export function createLessonL2L23ReturnWritingBeat(trace: KanjiWritingModel): LessonActivityBeat {
    assertExactPackageSources();
    const activity: KanjiWritingActivityModel = createKanjiWritingActivity(trace, {
        id: 'activity:l2-l23-source-return-writing',
        conceptId: 'concept:l2-l23:return-writing',
        prompt: { ja: '先生の「帰」の練習欄を見てから、帰を書き、読み方を入力しましょう。', en: 'Study Sensei’s 帰 practice panel, then write 帰 and enter its reading.' },
        reading: 'かえる',
        meaning: { ja: '帰る: return home', en: 'return home' },
        strokeInstruction: { ja: '先生の帰の練習欄を見て、画数と形を確認してから書きます。', en: 'Use Sensei’s 帰 practice panel to check stroke count and shape before writing.' },
        readingPrompt: { ja: '「帰る」はどう読みますか。', en: 'How do you read 帰る?' },
        writingFeedback: {
            pass: { ja: '帰の形と画数を確認して書けました。', en: 'You completed 帰 with its checked shape and stroke count.' },
            lapse: { ja: '先生の薄い見本と書き順をもう一度確認しましょう。', en: 'Check Sensei’s faint model and stroke-order row once more.' },
            repair: { ja: '練習欄の帰を見て、左の部分から一画ずつ書き直しましょう。', en: 'Look at 帰 in the practice panel and redraw it one stroke at a time from the left component.' },
            example: { ja: '帰ります　日帰り　帰国', en: 'Sensei’s panel pairs 帰 with 帰ります, 日帰り, and 帰国.' },
        },
        readingFeedback: {
            pass: { ja: 'はい。「帰る」はかえるです。', en: 'Yes: 帰る is かえる.' },
            lapse: { ja: '先生の帰るの読みと、まだ合っていません。', en: 'That does not yet match Sensei’s reading for 帰る.' },
            repair: { ja: '「かえる」を声に出してから、ひらがなで入力しましょう。', en: 'Say かえる aloud, then enter it in hiragana.' },
            example: { ja: '帰ります', en: 'The source worksheet gives 帰ります as the polite form.' },
        },
        review: { id: 'review:l2-l23:return-writing', expression: '帰', reading: 'かえる', meanings: ['return home'] },
    });
    return beat('source-return-writing', {
        ja: '最後に、シンが帰の練習欄を指します。書く前に先生の薄い見本と書き順を見て、読みはあとで思い出します。',
        en: 'Finally, Shin points to the 帰 practice panel. Check Sensei’s faint model and stroke row before writing, then recall the reading afterward.',
    }, activity);
}

function sourcePage(payloadSha256: string, title: string, page: number, filename: string, sha256: string) {
    return Object.freeze({
        sourceId: `moodle:${payloadSha256}`,
        payloadSha256,
        title,
        page,
        url: `/academy/content/lessons/${PACKAGE_ID}/${filename}`,
        sha256,
    });
}

function sourceId(payloadSha256: string, page: number, region: string): string {
    return `moodle:${payloadSha256}:page:${page}:${region}`;
}

function item(id: string, label: string, correctZoneId: string) {
    return Object.freeze({ id, label, correctZoneId });
}

function beat(id: string, narrative: LessonActivityBeat['narrative'], activity: LessonActivityBeat['activity']): LessonActivityBeat {
    return Object.freeze({ id, narrative, activity: Object.freeze(activity) });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l23 package');
    const identity = record(root.identity, 'l2-l23 identity');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID) {
        throw new TypeError('Unexpected l2-l23 package identity.');
    }
    const coverage = record(root.sourceCoverage, 'l2-l23 source coverage');
    if (coverage.archiveId !== ARCHIVE_ID || coverage.archiveSha256 !== ARCHIVE_SHA256 || coverage.memberFileCount !== 4) {
        throw new TypeError('Unexpected l2-l23 Moodle archive identity.');
    }
    const members = array(coverage.members, 'l2-l23 members').map((value, index) => record(value, `l2-l23 member ${index + 1}`));
    const expected = [
        [HOMEWORK_ONE_SHA256, 'Homework kanji 6 exerise-1', '.pdf'],
        [HOMEWORK_TWO_SHA256, 'Homework kanji 6 exerise-2', '.pdf'],
        [WORKSHEET_DOCX_SHA256, 'Kanji 6-今、来、帰、会、社、聞、読、書、話 worksheets', '.docx'],
        [WORKSHEET_PDF_SHA256, 'Kanji 6-今、来、帰、会、社、聞、読、書、話 worksheets', '.pdf'],
    ] as const;
    for (const [payloadSha256, title, extension] of expected) {
        const member = members.find(candidate => candidate.payloadSha256 === payloadSha256);
        if (!member || member.title !== title || member.extension !== extension) {
            throw new TypeError(`Missing exact l2-l23 Moodle source ${title}.`);
        }
    }
    if (members.some(member => member.kind === 'audio') || root.genkiInteractiveActivities !== undefined) {
        throw new TypeError('l2-l23 must not invent Moodle or Genki audio support.');
    }
    const mappings = array(record(root.provenance, 'l2-l23 provenance').sourceMappings, 'l2-l23 source mappings')
        .map((value, index) => record(value, `l2-l23 source mapping ${index + 1}`));
    const minna = mappings.find(mapping => mapping.sourceId === 'source-minna-no-nihongo');
    if (!minna || minna.reference !== 'Minna no Nihongo II · Kanji strand 6' || minna.reuse !== 'sequence-only') {
        throw new TypeError('l2-l23 Minna use must remain sequence-only.');
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
