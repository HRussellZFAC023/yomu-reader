import lessonPackage from '../../../public/academy/content/lessons/009-l1-l08.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { SourceVocabularySheetModel } from '../minigames/source-vocabulary-sheet';
import type {
    TimeWorkbookModel,
    TimeWorkbookOpeningRound,
    TimeWorkbookRangeRound,
    TimeWorkbookTypedRound,
} from '../minigames/time-workbook';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l1-l08';
const MODULE_ID = 5866381;
const TIME_GRAMMAR_SHA256 = 'a38a8e1f686876ba1b6bc109ce0e5e0f9ddc70f4b18b520d43241f54256406e0';
const RANGE_GRAMMAR_SHA256 = '26f0f7c3397e7a4903e8c62fc79bdd3ecceca09bb7302826c5e7497dbd83ccd7';
const CHAPTER_VOCABULARY_SHA256 = '036a057edcccc409c987027b0a4d3fef00dc8134fd0e4bb0bc5341c2cdc2dadd';
const DAY_VOCABULARY_SHA256 = 'c69d083fd61bcc6d179c70b9da81a68eb759d483ab9c66614ffa3c63ec0780ab';
const GENKI_SHA256 = '6e6c804c56797542057ad96a56ed65dc0de3c90e066e67586e8cf85ce65a09e4';
const GENKI_SCRIPT_SHA256 = 'ecbac7a25b6cefdd604afda0ee11c0ac3ff177440487aadb7ebdae650def7c0b';
const MINNA_SHA256 = '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229';

export function createLessonEightSourceVocabularyActivities(): readonly SourceVocabularySheetModel[] {
    assertExactPackageSources();
    return Object.freeze([
        ...sourceVocabularyRows(CHAPTER_VOCABULARY_SHA256, 'chapter-4-1-vocabulary', 24),
        ...sourceVocabularyRows(DAY_VOCABULARY_SHA256, 'time-expression-days', 12),
    ]);
}

export function createLessonEightTimeWorkbookModel(): TimeWorkbookModel {
    assertExactPackageSources();
    const rangeOptions = [
        option('gogo-1', 'ごご1じ', '1 p.m.'),
        option('3-han', '3じはん', '3:30 p.m.'),
        option('gozen-10', 'ごぜん10じ', '10 a.m.'),
        option('gogo-12-45', 'ごご12じ45ふん', '12:45 p.m.'),
        option('gogo-12-han', 'ごご12じはん', '12:30 p.m.'),
        option('1', '1じ', '1 p.m.'),
    ] as const;
    const openingOptions = [
        option('9-5', '9じから 5じまでです。', '9:00-5:00'),
        option('10-8-30', '10じから 8じはんまでです。', '10:00-8:30'),
        option('9-6-30', '9じから 6じはんまでです。', '9:00-6:30'),
        option('9-15-5-45', '9じ15ふんから 5じ45ふんまでです。', '9:15-5:45'),
    ] as const;
    const rounds = Object.freeze([
        rangeRound(1, 'meeting', 'かいぎ', '1 p.m. - 3:30 p.m.', rangeOptions, 'gogo-1', '3-han',
            'かいぎは ごご1じから 3じはんまでです。'),
        rangeRound(2, 'exam', 'しけん', '10 a.m. - 12:45 p.m.', rangeOptions, 'gozen-10', 'gogo-12-45',
            'しけんは ごぜん10じから ごご12じ45ふんまでです。'),
        rangeRound(3, 'lunch-break', 'ひるやすみ', '12:30 p.m. - 1 p.m.', rangeOptions, 'gogo-12-han', '1',
            'ひるやすみは ごご12じはんから 1じまでです。'),
        typedRound(4, 'genki-5pm', 'いまなんじですか。（Current Time: 05:00pm）', [
            'ごごごじです', '午後五時です', '午後ごじです', 'ごご五時です',
        ], 'ごごごじです'),
        typedRound(5, 'genki-9am', 'いまなんじですか。（Current Time: 09:00am）', [
            'ごぜんくじです', '午前九時です', '午前くじです', 'ごぜん九時です',
        ], 'ごぜんくじです'),
        typedRound(6, 'genki-12-30pm', 'いまなんじですか。（Current Time: 12:30pm）', primaryFirst('ごごじゅうにじはんです', combinations('午後', 'ごご', '十二時', 'じゅうにじ', '半', 'はん')), 'ごごじゅうにじはんです'),
        typedRound(7, 'genki-4-30am', 'いまなんじですか。（Current Time: 04:30am）', primaryFirst('ごぜんよじはんです', combinations('午前', 'ごぜん', '四時', 'よじ', '半', 'はん')), 'ごぜんよじはんです'),
        typedRound(8, 'genki-7-30pm', 'いまなんじですか。（Current Time: 07:30pm）', primaryFirst('ごごしちじはんです', combinations('午後', 'ごご', '七時', 'しちじ', '半', 'はん')), 'ごごしちじはんです'),
        openingRound(9, 'post-office', 'ゆうびんきょく', '9:00-5:00', openingOptions, '9-5'),
        openingRound(10, 'department-store', 'デパート', '10:00-8:30', openingOptions, '10-8-30'),
        openingRound(11, 'library', 'としょかん', '9:00-6:30', openingOptions, '9-6-30'),
        openingRound(12, 'company', 'かいしゃ', '9:15-5:45', openingOptions, '9-15-5-45'),
    ] satisfies readonly (TimeWorkbookRangeRound | TimeWorkbookTypedRound | TimeWorkbookOpeningRound)[]);

    const model: TimeWorkbookModel = {
        id: 'activity:l1-l08-source-time-workbook',
        kind: 'academy-time-workbook',
        responseKind: 'mixed-source-time-workbook',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: Object.freeze(rounds.map(round => round.conceptId)),
        prompt: {
            ja: '先生の時間の型を確認してから、三つの元資料の問題に答えましょう。',
            en: 'Learn the time patterns first, then complete the three source activities.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                timeGrammar: source(TIME_GRAMMAR_SHA256, 'Chapter 4-1_time_Grammar Exercise', 'Handouts/Chapter 4-1_time_Grammar Exercise.pdf', [1, 2]),
                rangeGrammar: source(RANGE_GRAMMAR_SHA256, 'New Chapter 4-1 from time to time Grammar Exercise', 'Handouts/New_Chapter 4-1_from time to time_Grammar Exercise.pdf', [1, 2]),
            },
            genki: {
                taskId: 'genki-2e:l1-l08:lesson-1-workbook-2',
                sourceId: `japanese-genki-interactive:${GENKI_SHA256}:generateQuiz`,
                relativePath: 'lessons/lesson-1/workbook-2/index.html',
                payloadSha256: GENKI_SHA256,
                scriptSha256: GENKI_SCRIPT_SHA256,
                lineLocus: { start: 76, end: 108 },
                engine: 'Genki.generateQuiz',
                sourceType: 'fill',
            },
            minna: {
                sourceId: `minna-i:${MINNA_SHA256}:lesson-4`,
                reference: 'Minna no Nihongo I, Lesson 4',
                title: 'Minna no Nihongo 2nd Edition Shokyu I',
                author: '3A Network',
                payloadSha256: MINNA_SHA256,
                pageCount: 326,
                pdfPages: [55, 56, 57],
                printedPages: [35, 36, 37],
            },
        },
        payload: {
            teaching: [
                {
                    sourceQuestionId: `moodle:${TIME_GRAMMAR_SHA256}:p1:time-counters`,
                    sourceLabel: 'Moodle · Chapter 4-1 time Grammar Exercise · page 1',
                    pattern: 'いまは なんじですか。— time です。',
                    rule: {
                        ja: '時は「じ」、分は「ふん／ぷん」です。1・6・8・10分は、いっぷん・ろっぷん・はっぷん・じゅっぷんです。',
                        en: 'Hours take じ. Minutes take ふん or ぷん; 1, 6, 8, and 10 use the source sheet’s irregular readings.',
                    },
                    example: 'いまは なんじですか。— 3じです。',
                },
                {
                    sourceQuestionId: `moodle:${RANGE_GRAMMAR_SHA256}:p1:kara-made-pattern`,
                    sourceLabel: 'Moodle · New Chapter 4-1 from time to time Grammar Exercise · page 1',
                    pattern: 'Noun は time1 から time2 まで です。',
                    rule: {
                        ja: '「から」は始まる時、「まで」は終わる時を示します。二つはいつも一緒とは限りません。',
                        en: 'から marks the starting time and まで the finishing time. The source notes that they are not always used together.',
                    },
                    example: 'パーティは ごご6じから 10じまでです。',
                },
                {
                    sourceQuestionId: `minna-i:${MINNA_SHA256}:lesson-4:pdf-p55:exercise-4:model`,
                    sourceLabel: 'Minna no Nihongo I · Lesson 4 · PDF page 55 / printed page 35',
                    pattern: 'Noun は 何時から 何時までですか。',
                    rule: {
                        ja: '開いている時間を聞くときも、同じ「何時から何時まで」を使います。',
                        en: 'Minna Lesson 4 uses the same 何時から何時まで frame to ask opening hours.',
                    },
                    example: '銀行は 何時から 何時までですか。— 9時から 3時までです。',
                },
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: {
                    explanation: {
                        ja: 'Moodle、Genki、みんなの時間問題を、元の時刻と順番どおりに完成しました。',
                        en: 'You completed the Moodle, Genki, and Minna time tasks in their source order.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '時刻、午前・午後、または「から／まで」が違う問題があります。',
                        en: 'At least one source item has a different time, a.m./p.m. marker, or range boundary.',
                    },
                    repairPrompt: {
                        ja: '違った問題だけ、元資料の時刻と型を見て直しましょう。',
                        en: 'Repair only the missed items by checking the source time and pattern.',
                    },
                    nearbyExample: {
                        ja: 'パーティは ごご6じから 10じまでです。',
                        en: 'The source model places から after the start and まで after the finish.',
                    },
                },
            },
        },
    };
    return Object.freeze(model);
}

export function createLessonEightTimeWorkbookBeat(): LessonActivityBeat {
    return {
        id: 'source-time-workbook',
        narrative: {
            ja: 'ミカが三冊の時間ワークを元の順番で机に並べ、最初の型を一緒に確認します。',
            en: 'Mika lays the three time workbooks on the desk in source order and reviews the first pattern with you.',
        },
        activity: createLessonEightTimeWorkbookModel(),
    };
}

function rangeRound(
    sourceOrder: number,
    id: string,
    subject: string,
    displayedHours: string,
    options: TimeWorkbookRangeRound['options'],
    correctStartId: string,
    correctEndId: string,
    answerExpression: string,
): TimeWorkbookRangeRound {
    return {
        mode: 'range-build', id, sourceOrder,
        sourceQuestionId: `moodle:${RANGE_GRAMMAR_SHA256}:p1:exercise-1:item-${sourceOrder}`,
        sourcePrompt: `${subject} ${displayedHours}`,
        subject, displayedHours, options, correctStartId, correctEndId, answerExpression,
        conceptId: `concept:l1-l08:source-time:${id}`,
        errorTag: `l1-l08-source-time-${id}`,
    };
}

function typedRound(
    sourceOrder: number,
    id: string,
    sourcePrompt: string,
    acceptedAnswers: readonly string[],
    answerExpression: string,
): TimeWorkbookTypedRound {
    const slot = sourceOrder - 3;
    return {
        mode: 'typed-clock', id, sourceOrder,
        sourceQuestionId: `genki-2e:l1-l08:lesson-1-workbook-2:slot-${slot}`,
        sourcePrompt, acceptedAnswers, answerExpression,
        conceptId: `concept:l1-l08:source-time:${id}`,
        errorTag: `l1-l08-source-time-${id}`,
    };
}

function openingRound(
    sourceOrder: number,
    id: string,
    subject: string,
    displayedHours: string,
    options: TimeWorkbookOpeningRound['options'],
    correctOptionId: string,
): TimeWorkbookOpeningRound {
    const item = sourceOrder - 8;
    const correct = options.find(candidate => candidate.id === correctOptionId);
    if (!correct) throw new TypeError(`Missing Minna opening option ${correctOptionId}.`);
    return {
        mode: 'opening-hours-choice', id, sourceOrder,
        sourceQuestionId: `minna-i:${MINNA_SHA256}:lesson-4:pdf-p55:exercise-4:item-${item}`,
        sourcePrompt: `${subject} (${displayedHours})`, subject, displayedHours,
        options, correctOptionId,
        answerExpression: `${subject}は ${correct.ja}`,
        conceptId: `concept:l1-l08:source-time:${id}`,
        errorTag: `l1-l08-source-time-${id}`,
    };
}

function option(id: string, ja: string, en: string) {
    return Object.freeze({ id, ja, en });
}

function combinations(
    formalPeriod: string,
    kanaPeriod: string,
    formalHour: string,
    kanaHour: string,
    formalHalf: string,
    kanaHalf: string,
): readonly string[] {
    return Object.freeze([formalPeriod, kanaPeriod].flatMap(period =>
        [formalHour, kanaHour].flatMap(hour =>
            [formalHalf, kanaHalf].map(half => `${period}${hour}${half}です`))));
}

function primaryFirst(primary: string, accepted: readonly string[]): readonly string[] {
    return Object.freeze([primary, ...accepted.filter(answer => answer !== primary)]);
}

function source(payloadSha256: string, sourceTitle: string, member: string, pages: readonly number[]) {
    return Object.freeze({
        sourceId: `moodle-payload:${payloadSha256}`,
        payloadSha256,
        sourceTitle,
        member,
        author: 'Rie Tsuruta-Barratt',
        pages,
    });
}

function sourceVocabularyRows(
    payloadSha256: string,
    componentId: string,
    expectedCount: number,
): readonly SourceVocabularySheetModel[] {
    const components = array(record(lessonPackage, 'l1-l08 package').components, 'l1-l08 components');
    const component = components.map((value, index) => record(value, `component ${index}`)).find(value => {
        const provenance = value.provenance && typeof value.provenance === 'object'
            ? value.provenance as Record<string, unknown>
            : null;
        return provenance?.payloadSha256 === payloadSha256;
    });
    if (!component) throw new TypeError(`Missing l1-l08 vocabulary source ${payloadSha256}.`);
    const provenance = record(component.provenance, `${componentId} provenance`);
    const sourceId = exactText(provenance.sourceId, `${componentId} sourceId`);
    const sourceTitle = exactText(provenance.title, `${componentId} title`);
    const items = array(component.items, `${componentId} items`);
    if (items.length !== expectedCount || provenance.answerVisibility !== 'after-attempt') {
        throw new TypeError(`Unexpected ${componentId} source row count or answer policy.`);
    }
    return Object.freeze(items.map((value, index) => {
        const item = record(value, `${componentId} item ${index}`);
        const itemSource = record(item.source, `${componentId} item ${index} source`);
        const locus = record(itemSource.locus, `${componentId} item ${index} locus`);
        const exact = record(itemSource.exact, `${componentId} item ${index} exact`);
        const fieldProvenance = record(itemSource.fieldProvenance, `${componentId} item ${index} field provenance`);
        const page = positiveInteger(locus.page, `${componentId} page`);
        const row = positiveInteger(locus.row, `${componentId} row`);
        const sourceQuestionId = exactText(itemSource.itemId, `${componentId} item id`);
        const words = exactText(exact.words, `${componentId} source words`);
        const supportWords = exactText(item.normalizedStudySurface ?? item.ja, `${componentId} study words`);
        const reading = exactText(item.reading, `${componentId} reading`);
        const meaning = exactText(item.en, `${componentId} meaning`);
        if (itemSource.payloadSha256 !== payloadSha256 || itemSource.title !== sourceTitle
            || itemSource.answerVisibility !== 'after-attempt') {
            throw new TypeError(`Unexpected ${componentId} item source identity at row ${row}.`);
        }
        if (index > 0) {
            const previous = record(record(items[index - 1], `${componentId} previous item`).source, `${componentId} previous source`);
            const previousLocus = record(previous.locus, `${componentId} previous locus`);
            const previousPage = positiveInteger(previousLocus.page, `${componentId} previous page`);
            const previousRow = positiveInteger(previousLocus.row, `${componentId} previous row`);
            if (page < previousPage || (page === previousPage && row <= previousRow)) {
                throw new TypeError(`${componentId} rows must retain exact increasing source order.`);
            }
        }
        return Object.freeze({
            id: `authored:${PACKAGE_ID}/${componentId}:p${page}:r${row}`,
            kind: 'academy-source-vocabulary-sheet' as const,
            sourceQuestionId,
            conceptIds: [`concept:${PACKAGE_ID}:${componentId}:p${page}:r${row}`],
            responseKind: 'source-vocabulary-recall' as const,
            prompt: {
                ja: '先生の語彙表の行を、意味を見る前に思い出しましょう。',
                en: 'Recall the teacher-sheet row before revealing its support.',
            },
            answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
            provenance: {
                packageId: PACKAGE_ID, componentId, sourceId, sourceQuestionId,
                payloadSha256, sourceTitle, locus: { page, row },
            },
            payload: {
                exact: {
                    words,
                    pronunciation: nullableText(exact.pronunciation, `${componentId} pronunciation`),
                    meaning: nullableText(exact.meaning, `${componentId} source meaning`),
                },
                support: { words: supportWords, reading, meaning },
                fieldProvenance: {
                    words: exactText(fieldProvenance.words, `${componentId} words provenance`),
                    reading: exactText(fieldProvenance.reading, `${componentId} reading provenance`),
                    meaning: exactText(fieldProvenance.meaning, `${componentId} meaning provenance`),
                },
            },
        });
    }));
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l1-l08 package');
    const identity = record(root.identity, 'l1-l08 identity');
    if (root.id !== PACKAGE_ID || identity.moduleId !== MODULE_ID) throw new TypeError('Unexpected l1-l08 package identity.');
    const coverage = record(root.sourceCoverage, 'l1-l08 source coverage');
    const members = array(coverage.members, 'l1-l08 members').map((value, index) => record(value, `member ${index}`));
    for (const [digest, title] of [
        [TIME_GRAMMAR_SHA256, 'Chapter 4-1 time Grammar Exercise'],
        [RANGE_GRAMMAR_SHA256, 'New Chapter 4-1 from time to time Grammar Exercise'],
        [CHAPTER_VOCABULARY_SHA256, 'New Chapter 4-1 Vocabulary Sheet'],
        [DAY_VOCABULARY_SHA256, 'HW Vocabulary time expression1+ days'],
    ] as const) {
        if (members.filter(member => member.payloadSha256 === digest && member.title === title).length !== 1) {
            throw new TypeError(`Expected one exact l1-l08 source member for ${digest}.`);
        }
    }
    const activities = array(root.genkiInteractiveActivities, 'l1-l08 Genki activities');
    if (activities.length !== 1) throw new TypeError('Expected one exact l1-l08 Genki activity.');
    const activity = record(activities[0], 'l1-l08 Genki activity');
    const sourceRecord = record(activity.source, 'l1-l08 Genki source');
    const locus = record(sourceRecord.lineLocus, 'l1-l08 Genki locus');
    const exactTask = record(activity.exactTask, 'l1-l08 Genki task');
    const config = record(exactTask.config, 'l1-l08 Genki config');
    const quizlet = exactText(config.quizlet, 'l1-l08 Genki quizlet');
    if (activity.id !== 'genki-2e:l1-l08:lesson-1-workbook-2'
        || sourceRecord.payloadSha256 !== GENKI_SHA256 || sourceRecord.scriptSha256 !== GENKI_SCRIPT_SHA256
        || locus.start !== 76 || locus.end !== 108 || exactTask.engine !== 'Genki.generateQuiz'
        || !['05:00pm', '09:00am', '12:30pm', '04:30am', '07:30pm'].every(time => quizlet.includes(time))) {
        throw new TypeError('Unexpected l1-l08 Genki task identity or exact prompt order.');
    }
}

function record(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
    return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    return value;
}

function exactText(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be non-empty text.`);
    return value;
}

function nullableText(value: unknown, label: string): string | null {
    if (value === null) return null;
    return exactText(value, label);
}

function positiveInteger(value: unknown, label: string): number {
    if (!Number.isInteger(value) || Number(value) <= 0) throw new TypeError(`${label} must be a positive integer.`);
    return Number(value);
}
