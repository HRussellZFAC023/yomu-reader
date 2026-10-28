import lessonPackage from '../../../public/academy/content/lessons/011-l1-l10.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type {
    DailyRoutineOption,
    DailyRoutineRound,
    DailyRoutineSentenceRound,
    DailyRoutineShortAnswerRound,
    DailyRoutineTenseRound,
    DailyRoutineTimeRound,
    DailyRoutineWorkbookModel,
} from '../minigames/daily-routine-workbook';
import type { SourceVocabularySheetModel } from '../minigames/source-vocabulary-sheet';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l1-l10';
const MODULE_ID = 5907552;
const VOCABULARY_SHA256 = '440338339cd23627dc7a3509dd60d4e44f97dd22f90e538485a88a3398cbe897';
const VERB_SUMMARY_SHA256 = 'fd4826082b3e5ec89453bce677937f10240ca5e76325b4ca7fc3806f0914dfad';
const GRAMMAR_CHECK_SHA256 = 'e1a72f416713d5ba430b8e3e97aecd39d03a2da53f0c8baf136d34c16fd3f20a';
const GENKI_SHA256 = 'cfe95821ca45cc8f5c4225bfa555f967fcf5875f6fd2cd8b41f9ce99a5e2a83f';
const GENKI_SCRIPT_SHA256 = 'de7d3beedd2565ba6db123561567c56661c3fed66b859ac6772c3edca457ac85';
const MINNA_SHA256 = '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229';

const TIME_OPTIONS = [
    option('11', '11じ'),
    option('6-30', '6じはん'),
    option('12', '12じ'),
    option('10', '10じ'),
] as const;

export function createLessonTenSourceVocabularyActivities(): readonly SourceVocabularySheetModel[] {
    assertExactPackageSources();
    const component = vocabularyComponent();
    const provenance = record(component.provenance, 'l1-l10 vocabulary provenance');
    const sourceId = exact(provenance.sourceId, 'l1-l10 vocabulary source id');
    const sourceTitle = exact(provenance.title, 'l1-l10 vocabulary title');
    const items = array(component.items, 'l1-l10 vocabulary items');
    if (digest(provenance.payloadSha256, 'l1-l10 vocabulary hash') !== VOCABULARY_SHA256 || items.length !== 13) {
        throw new TypeError('The complete 13-row l1-l10 vocabulary sheet is required.');
    }
    return Object.freeze(items.map((value, index) => {
        const item = record(value, `l1-l10 vocabulary row ${index + 1}`);
        const source = record(item.source, `l1-l10 vocabulary source ${index + 1}`);
        const locus = record(source.locus, `l1-l10 vocabulary locus ${index + 1}`);
        const exactFields = record(source.exact, `l1-l10 vocabulary exact ${index + 1}`);
        const fieldProvenance = record(source.fieldProvenance, `l1-l10 vocabulary field provenance ${index + 1}`);
        const page = integer(locus.page, `l1-l10 vocabulary page ${index + 1}`);
        const row = integer(locus.row, `l1-l10 vocabulary row ${index + 1}`);
        if (page !== 1 || row !== index + 1 || digest(source.payloadSha256, 'l1-l10 row hash') !== VOCABULARY_SHA256
            || exact(source.title, 'l1-l10 row title') !== sourceTitle || source.answerVisibility !== 'after-attempt') {
            throw new TypeError('The l1-l10 vocabulary sheet must remain in exact source order.');
        }
        return Object.freeze({
            id: `authored:${PACKAGE_ID}/chapter-4-3-vocabulary:p${page}:r${row}`,
            kind: 'academy-source-vocabulary-sheet' as const,
            sourceQuestionId: exact(source.itemId, `l1-l10 vocabulary item ${index + 1}`),
            conceptIds: [`concept:${PACKAGE_ID}:source-vocabulary:p${page}:r${row}`],
            responseKind: 'source-vocabulary-recall' as const,
            prompt: {
                ja: '先生の行を読み、意味を思い出してから確認しましょう。',
                en: 'Read the teacher row, recall its meaning, then check it.',
            },
            answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
            provenance: {
                packageId: PACKAGE_ID,
                componentId: 'chapter-4-3-vocabulary',
                sourceId,
                sourceQuestionId: exact(source.itemId, `l1-l10 vocabulary item id ${index + 1}`),
                payloadSha256: VOCABULARY_SHA256,
                sourceTitle,
                locus: { page, row },
            },
            payload: {
                exact: {
                    words: exact(exactFields.words, `l1-l10 exact words ${index + 1}`),
                    pronunciation: nullable(exactFields.pronunciation, `l1-l10 exact pronunciation ${index + 1}`),
                    meaning: nullable(exactFields.meaning, `l1-l10 exact meaning ${index + 1}`),
                },
                support: {
                    words: exact(item.ja, `l1-l10 support words ${index + 1}`),
                    reading: exact(item.reading, `l1-l10 support reading ${index + 1}`),
                    meaning: exact(item.en, `l1-l10 support meaning ${index + 1}`),
                },
                fieldProvenance: {
                    words: exact(fieldProvenance.words, `l1-l10 words provenance ${index + 1}`),
                    reading: exact(fieldProvenance.reading, `l1-l10 reading provenance ${index + 1}`),
                    meaning: exact(fieldProvenance.meaning, `l1-l10 meaning provenance ${index + 1}`),
                },
            },
        } satisfies SourceVocabularySheetModel);
    }));
}

export function createLessonTenDailyRoutineWorkbookModel(): DailyRoutineWorkbookModel {
    assertExactPackageSources();
    const rounds = Object.freeze([
        tenseRound(1, 'moodle-tense-yesterday-sleep',
            '1）きのう 10じ に（ねます、ねました）。', ['ねます', 'ねました'], 'ねました',
            'きのう 10じに ねました。', '「きのう」は過去です。どうしの終わりを見ましょう。',
            'きのう marks past time. Check the verb ending.', 'きょう 10じに ねます。', 'Today I go to bed at ten.'),
        tenseRound(2, 'moodle-tense-everyday-rest',
            '2）まいにち ひる 12じ から 1じ まで（やすみます、やすみました）。',
            ['やすみます', 'やすみました'], 'やすみます', 'まいにち ひる 12じから 1じまで やすみます。',
            '「まいにち」は習慣です。非過去の形を選びます。', 'Every day describes a habit, so use non-past.',
            'きのう 12じから 1じまで やすみました。', 'Yesterday I rested from twelve to one.'),
        tenseRound(3, 'moodle-tense-day-before-study',
            '3）おととい の ばん 9じ から 11じ まで（べんきょうします、べんきょうしました）。',
            ['べんきょうします', 'べんきょうしました'], 'べんきょうしました',
            'おととい の ばん 9じから 11じまで べんきょうしました。',
            '「おととい」は終わった日です。', 'The day before yesterday is completed past time.',
            'まいばん 9じから 11じまで べんきょうします。', 'I study from nine to eleven every night.'),
        tenseRound(4, 'moodle-tense-every-morning',
            '4）まいあさ なんじに（おきます、おきました）か。', ['おきます', 'おきました'], 'おきます',
            'まいあさ なんじに おきますか。', '「まいあさ」は繰り返す習慣です。',
            'Every morning asks about a repeated habit.', 'けさ なんじに おきましたか。',
            'What time did you get up this morning?'),
        tenseRound(5, 'moodle-tense-day-after-tomorrow',
            '5）あさって は にちようび です。（はたらきません、はたらきませんでした）。',
            ['はたらきません', 'はたらきませんでした'], 'はたらきません', 'あさっては はたらきません。',
            '「あさって」は未来なので、非過去の否定を使います。',
            'The day after tomorrow is future, so use non-past negative.', 'きのうは はたらきませんでした。',
            'I did not work yesterday.'),

        shortRound(6, 'moodle-form-rested', '1）おととい やすみましたか。はい、（　　　　）。',
            ['やすみました'], 'やすみました', '質問の「ました」を、はいの答えでも保ちます。',
            'Keep the question’s ました ending in the affirmative answer.', 'きのう はたらきましたか。はい、はたらきました。',
            'Did you work yesterday? Yes, I did.'),
        shortRound(7, 'moodle-form-sunday-work', '2）にちようび はたらきますか。いいえ、（　　　　）。',
            ['はたらきません'], 'はたらきません', '非過去の質問への「いいえ」は「ません」です。',
            'A negative answer to a non-past question ends in ません.', 'まいにち べんきょうしますか。いいえ、べんきょうしません。',
            'Do you study every day? No, I do not.'),
        shortRound(8, 'moodle-form-yesterday-study', '3）きのう べんきょうしましたか。いいえ、（　　　　）。',
            ['べんきょうしませんでした'], 'べんきょうしませんでした',
            '過去の「いいえ」は「ませんでした」です。', 'A negative past answer ends in ませんでした.',
            'きのう はたらきましたか。いいえ、はたらきませんでした。', 'Did you work yesterday? No, I did not.'),
        shortRound(9, 'moodle-form-university-finish', '4）だいがく は 3じ に おわりますか。はい、（　　　　）。',
            ['おわります'], 'おわります', 'はいの答えでは、質問のどうしをそのまま使います。',
            'In the yes answer, keep the question’s verb.', 'ぎんこうは 3じに おわりますか。はい、おわります。',
            'Does the bank close at three? Yes, it does.'),

        timeRound(10, 'minna-every-night', '1）毎晩 →', '毎晩 何時に 寝ますか。', 'に 寝ます。', '11', '11時に 寝ます。',
            '絵の時計は11時です。', 'The source clock shows eleven.', '毎朝 何時に 起きますか。7時に 起きます。',
            'What time do you get up every morning? I get up at seven.'),
        timeRound(11, 'minna-tomorrow', '2）あした →', 'あした 何時に 起きますか。', 'に 起きます。', '6-30',
            '6時半に 起きます。', '「半」は30分です。', '半 means thirty minutes past the hour.',
            '毎朝 7時に 起きます。', 'I get up at seven every morning.'),
        timeRound(12, 'minna-tonight', '3）今晩 →', '今晩 何時に 寝ますか。', 'に 寝ます。', '12', '12時に 寝ます。',
            '時計の長い針と短い針が12を指しています。', 'Both hands in the source clock point to twelve.',
            '毎晩 11時に 寝ます。', 'I go to bed at eleven every night.'),
        timeRound(13, 'minna-sunday', '4）日曜日 →', '日曜日 何時に 起きますか。', 'に 起きます。', '10', '10時に 起きます。',
            '日曜日の絵の時計は10時です。', 'The Sunday source clock shows ten.',
            'あした 6時半に 起きます。', 'I will get up at half past six tomorrow.'),

        sentenceRound(14, 'genki-every-day-six', 'every day/06:00/get up',
            ['メアリーさんはまいにちろくじにおきます', 'メアリーさんは毎日六時に起きます'],
            'メアリーさんはまいにちろくじにおきます。', '順番は「人・頻度・時刻に・どうし」です。',
            'Use person, frequency, time + に, then the verb.', 'メアリーさんはまいにちしちじにねます。',
            'Mary goes to bed at seven every day.'),
        sentenceRound(15, 'genki-every-day-college', 'every day/08:30/go to college',
            ['メアリーさんはまいにちはちじはんにだいがくにいきます', 'メアリーさんは毎日八時半に大学に行きます'],
            'メアリーさんはまいにちはちじはんにだいがくにいきます。',
            '時刻にも行き先にも「に」が付きます。', 'Use に after both the time and the destination.',
            'メアリーさんはくじにがっこうにきます。', 'Mary comes to school at nine.'),
        sentenceRound(16, 'genki-every-day-lunch', 'every day/12:00/eat lunch at school',
            ['メアリーさんはまいにちじゅうにじにがっこうでひるごはんをたべます',
                'メアリーさんは毎日十二時に学校で昼ご飯を食べます'],
            'メアリーさんはまいにちじゅうにじにがっこうでひるごはんをたべます。',
            '時刻は「に」、行動する場所は「で」です。', 'Mark time with に and the action location with で.',
            'メアリーさんはしちじにうちでばんごはんをたべます。', 'Mary eats dinner at home at seven.'),
        sentenceRound(17, 'genki-usually-return', 'usually/at about 6:00/return home',
            ['メアリーさんはたいていろくじごろいえにかえります', 'メアリーさんはたいていろくじごろうちにかえります',
                'メアリーさんはたいてい六時ごろ家に帰ります'],
            'メアリーさんはたいていろくじごろいえにかえります。',
            '「ごろ」はおおよその時刻なので、後ろに「に」を置きません。',
            'ごろ marks an approximate time and takes no following に here.', 'メアリーさんはたいていしちじごろうちにかえります。',
            'Mary usually returns home at about seven.'),
        sentenceRound(18, 'genki-usually-sleep', 'usually/at about 11:00/sleep',
            ['メアリーさんはたいていじゅういちじごろねます', 'メアリーさんはたいてい十一時ごろ寝ます'],
            'メアリーさんはたいていじゅういちじごろねます。',
            '「たいてい」の後に時刻、「ごろ」の後にどうしを置きます。',
            'Place the time after たいてい and the verb after ごろ.', 'メアリーさんはたいていろくじごろおきます。',
            'Mary usually gets up at about six.'),
        sentenceRound(19, 'genki-speak-japanese', 'I speak Japanese every day.',
            ['わたしはまいにちにほんごをはなします', '私は毎日日本語を話します'],
            'わたしはまいにちにほんごをはなします。', '「にほんご」は話すものなので「を」を使います。',
            'Japanese is what is spoken, so mark it with を.', 'わたしはまいにちえいごをべんきょうします。',
            'I study English every day.'),
        sentenceRound(20, 'genki-not-watch-tonight', 'I will not watch TV tonight.',
            ['わたしはこんばんテレビをみません', '私は今晩テレビを見ません'],
            'わたしはこんばんテレビをみません。', '「こんばん」は未来を含むので、非過去の否定「ません」です。',
            'Tonight uses non-past negative ません for a future action.', 'わたしはあしたテレビをみません。',
            'I will not watch television tomorrow.'),
        sentenceRound(21, 'genki-saturday-school', 'Mary does not come to school on Saturdays.',
            ['メアリーさんはどようびにがっこうにきません', 'メアリーさんは土曜日に学校に来ません'],
            'メアリーさんはどようびにがっこうにきません。',
            '毎週の土曜日は習慣なので、非過去の否定を使います。',
            'Saturdays describes a repeated habit, so use non-past negative.', 'メアリーさんはにちようびにがっこうにきません。',
            'Mary does not come to school on Sundays.'),
    ] satisfies readonly DailyRoutineRound[]);

    return Object.freeze({
        id: 'activity:l1-l10-source-daily-routine-workbook',
        kind: 'academy-daily-routine-workbook',
        responseKind: 'mixed-source-daily-routine-workbook',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: Object.freeze(rounds.map(round => round.conceptId)),
        prompt: {
            ja: '先生の四つのどうしの形を学び、元資料の順番で一日の習慣を完成させましょう。',
            en: 'Learn the four polite verb forms, then complete the source routines in their original order.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                verbSummary: moodleSource(VERB_SUMMARY_SHA256, 'non past_past_affirmative_negative verb ます',
                    'Handsouts/non past_past_affirmative_negative verb ます.pdf', [1, 2]),
                grammarCheck: moodleSource(GRAMMAR_CHECK_SHA256, 'HW Chapter 4 Grammar check',
                    'Homework/HW_Chapter 4_Grammar check.pdf', [1, 2]),
            },
            minna: {
                sourceId: `minna-no-nihongo:${MINNA_SHA256}:lesson-4:practice-b-5`,
                reference: 'Minna no Nihongo I, Lesson 4',
                title: 'Minna no Nihongo 2nd Edition Shokyu I',
                author: '3A Network',
                payloadSha256: MINNA_SHA256,
                pageCount: 326,
                pdfPage: 55,
                printedPage: 35,
                exercise: 'Practice B, exercise 5',
            },
            genki: {
                taskId: 'genki-2e:l1-l10:lesson-3-workbook-5',
                sourceId: `japanese-genki-interactive:${GENKI_SHA256}:generateQuiz`,
                relativePath: 'lessons/lesson-3/workbook-5/index.html',
                payloadSha256: GENKI_SHA256,
                scriptSha256: GENKI_SCRIPT_SHA256,
                lineLocus: { start: 76, end: 125 },
                engine: 'Genki.generateQuiz',
                sourceType: 'fill',
            },
        },
        payload: {
            teaching: [
                {
                    sourceQuestionId: `moodle-worksheet:${VERB_SUMMARY_SHA256}:p1:form-chart`,
                    sourceLabel: 'Moodle · non past_past_affirmative_negative verb ます · page 1',
                    pattern: 'Vます → Vません → Vました → Vませんでした',
                    explanation: {
                        ja: '非過去・過去と、肯定・否定を組み合わせる四つの丁寧な形です。',
                        en: 'These are the four polite combinations of non-past/past and affirmative/negative.',
                    },
                    example: 'はたらきます／はたらきません／はたらきました／はたらきませんでした',
                },
                {
                    sourceQuestionId: `moodle-worksheet:${GRAMMAR_CHECK_SHA256}:p1:section-2`,
                    sourceLabel: 'Moodle · HW Chapter 4 Grammar check · page 1, section 2',
                    pattern: 'time expression → tense → verb ending',
                    explanation: {
                        ja: 'まず「まいにち・きのう・あさって」の時を確認してから、どうしの形を選びます。',
                        en: 'Read the time expression first, decide habitual/future or past, then choose the ending.',
                    },
                    example: 'まいにち はたらきます。／きのう はたらきました。',
                },
                {
                    sourceQuestionId: `minna-no-nihongo:${MINNA_SHA256}:pdf-p55:printed-p35:practice-b-5:example`,
                    sourceLabel: 'Minna no Nihongo I · Lesson 4 · PDF page 55 / printed page 35 · Practice B 5',
                    pattern: '毎朝 何時に 起きますか。',
                    explanation: {
                        ja: '数字の時刻には「に」を置き、最後に行動のどうしを置きます。',
                        en: 'Put に after a numbered time and finish with the action verb.',
                    },
                    example: '7時に 起きます。',
                },
                {
                    sourceQuestionId: `japanese-genki-interactive:${GENKI_SHA256}:workbook-5:item-1`,
                    sourceLabel: 'Genki Study Resources 2e · Lesson 3 workbook 5 · lines 76-125',
                    pattern: 'person + frequency + time に + place + verb',
                    explanation: {
                        ja: '手がかりを左から読み、時刻の「に」と、場所の「に／で」を役割ごとに置きます。',
                        en: 'Read the cues left to right, then choose に or で for each time, destination, or action place.',
                    },
                    example: 'メアリーさんはまいにちろくじにおきます。',
                },
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: {
                    explanation: {
                        ja: '三つの元資料の21問を、元の順番ですべて完成できました。',
                        en: 'You completed all 21 items from the three sources in their original order.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '時の言葉・助詞・どうしの形のどこかを、もう一度直しましょう。',
                        en: 'Repair the time cue, particle, or verb ending in the missed items.',
                    },
                    repairPrompt: {
                        ja: '間違えた問題の「ヒントを見る」を選び、近い例と比べてから再回答してください。',
                        en: 'Open the earned hint on each missed item, compare the nearby example, then answer again.',
                    },
                    nearbyExample: {
                        ja: 'まいにち はたらきます。きのう はたらきました。',
                        en: 'Every day I work. Yesterday I worked.',
                    },
                },
            },
        },
    } satisfies DailyRoutineWorkbookModel);
}

export function createLessonTenDailyRoutineWorkbookBeat(): LessonActivityBeat {
    return Object.freeze({
        id: 'source-daily-routine-workbook',
        narrative: {
            ja: 'りえ先生が、朝から夜までの時間カードを並べます。四つの形を確認してから、元のワークを順番に解きます。',
            en: 'Rie lays out a day from morning to night. Learn the four forms, then work through each source in order.',
        },
        activity: createLessonTenDailyRoutineWorkbookModel(),
    });
}

function tenseRound(
    sourceOrder: number,
    id: string,
    sourcePrompt: string,
    labels: readonly [string, string],
    correctLabel: string,
    answerExpression: string,
    hintJa: string,
    hintEn: string,
    exampleJa: string,
    exampleEn: string,
): DailyRoutineTenseRound {
    const options = labels.map((label, index) => option(`option-${index + 1}`, label));
    return roundBase(sourceOrder, id, `moodle-worksheet:${GRAMMAR_CHECK_SHA256}:p1:section-2:item-${sourceOrder}`,
        'Moodle · HW Chapter 4 Grammar check · page 1, section 2', sourcePrompt, answerExpression,
        hintJa, hintEn, exampleJa, exampleEn, {
            mode: 'tense-choice', options, correctOptionId: options.find(item => item.label === correctLabel)!.id,
        });
}

function shortRound(
    sourceOrder: number,
    id: string,
    sourcePrompt: string,
    acceptedAnswers: readonly string[],
    answerExpression: string,
    hintJa: string,
    hintEn: string,
    exampleJa: string,
    exampleEn: string,
): DailyRoutineShortAnswerRound {
    return roundBase(sourceOrder, id,
        `moodle-worksheet:${GRAMMAR_CHECK_SHA256}:p2:section-3:item-${sourceOrder - 5}`,
        'Moodle · HW Chapter 4 Grammar check · page 2, section 3', sourcePrompt, answerExpression,
        hintJa, hintEn, exampleJa, exampleEn, { mode: 'short-answer', acceptedAnswers });
}

function timeRound(
    sourceOrder: number,
    id: string,
    sourcePrompt: string,
    question: string,
    answerSuffix: string,
    correctOptionId: string,
    answerExpression: string,
    hintJa: string,
    hintEn: string,
    exampleJa: string,
    exampleEn: string,
): DailyRoutineTimeRound {
    return roundBase(sourceOrder, id,
        `minna-no-nihongo:${MINNA_SHA256}:pdf-p55:printed-p35:practice-b-5:item-${sourceOrder - 9}`,
        'Minna no Nihongo I · Lesson 4 · Practice B 5', sourcePrompt, answerExpression,
        hintJa, hintEn, exampleJa, exampleEn,
        { mode: 'routine-time', question, answerSuffix, options: TIME_OPTIONS, correctOptionId });
}

function sentenceRound(
    sourceOrder: number,
    id: string,
    sourcePrompt: string,
    acceptedAnswers: readonly string[],
    answerExpression: string,
    hintJa: string,
    hintEn: string,
    exampleJa: string,
    exampleEn: string,
): DailyRoutineSentenceRound {
    return roundBase(sourceOrder, id,
        `japanese-genki-interactive:${GENKI_SHA256}:workbook-5:item-${sourceOrder - 13}`,
        'Genki Study Resources 2e · Lesson 3 workbook 5', sourcePrompt, answerExpression,
        hintJa, hintEn, exampleJa, exampleEn, { mode: 'sentence', acceptedAnswers });
}

function roundBase<T extends Pick<DailyRoutineRound, 'mode'>>(
    sourceOrder: number,
    id: string,
    sourceQuestionId: string,
    sourceLabel: string,
    sourcePrompt: string,
    answerExpression: string,
    hintJa: string,
    hintEn: string,
    exampleJa: string,
    exampleEn: string,
    modeFields: T,
): T & Omit<DailyRoutineRound, 'mode'> {
    return {
        id,
        sourceOrder,
        sourceQuestionId,
        sourceLabel,
        sourcePrompt,
        answerExpression,
        conceptId: `concept:l1-l10:daily-routine:${id}`,
        errorTag: `l1-l10-daily-routine-${id}`,
        hint: { ja: hintJa, en: hintEn },
        nearbyExample: { ja: exampleJa, en: exampleEn },
        ...modeFields,
    } as T & Omit<DailyRoutineRound, 'mode'>;
}

function option(id: string, label: string): DailyRoutineOption {
    return { id, label };
}

function moodleSource(
    payloadSha256: string,
    sourceTitle: string,
    member: string,
    pages: readonly number[],
) {
    return {
        sourceId: `moodle-payload:${payloadSha256}`,
        payloadSha256,
        sourceTitle,
        member,
        author: 'Rie Tsuruta-Barratt' as const,
        pages,
    };
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l1-l10 package');
    const identity = record(root.identity, 'l1-l10 identity');
    if (root.id !== PACKAGE_ID || identity.moduleId !== MODULE_ID) throw new TypeError('Unexpected l1-l10 package.');
    const coverage = record(root.sourceCoverage, 'l1-l10 source coverage');
    const hashes = new Set(array(coverage.members, 'l1-l10 source members').map(value =>
        digest(record(value, 'l1-l10 source member').payloadSha256, 'l1-l10 source member hash')));
    for (const required of [VOCABULARY_SHA256, VERB_SUMMARY_SHA256, GRAMMAR_CHECK_SHA256]) {
        if (!hashes.has(required)) throw new TypeError(`Missing exact l1-l10 Moodle payload ${required}.`);
    }
    const activities = array(root.genkiInteractiveActivities, 'l1-l10 Genki activities').map(value =>
        record(value, 'l1-l10 Genki activity'));
    const genki = activities.find(activity => activity.id === 'genki-2e:l1-l10:lesson-3-workbook-5');
    if (!genki) throw new TypeError('Missing exact l1-l10 Genki activity.');
    const source = record(genki.source, 'l1-l10 Genki source');
    const exactTask = record(genki.exactTask, 'l1-l10 Genki exact task');
    const config = record(exactTask.config, 'l1-l10 Genki config');
    const quizlet = exact(config.quizlet, 'l1-l10 Genki quizlet');
    if (digest(source.payloadSha256, 'l1-l10 Genki hash') !== GENKI_SHA256
        || digest(source.scriptSha256, 'l1-l10 Genki script hash') !== GENKI_SCRIPT_SHA256
        || exactTask.exerciseOrderPreserved !== true
        || !['every day/06:00/get up', 'every day/08:30/go to college', 'every day/12:00/eat lunch at school',
            'usually/at about 6:00/return home', 'usually/at about 11:00/sleep', 'I speak Japanese every day.',
            'I will not watch TV tonight.', 'Mary does not come to school on Saturdays.']
            .every((prompt, index, prompts) => quizlet.indexOf(prompt) >= 0
                && (index === 0 || quizlet.indexOf(prompt) > quizlet.indexOf(prompts[index - 1]!)))) {
        throw new TypeError('The l1-l10 Genki task changed or lost source order.');
    }
    const mappings = array(record(root.provenance, 'l1-l10 provenance').sourceMappings, 'l1-l10 source mappings')
        .map(value => record(value, 'l1-l10 source mapping'));
    if (!mappings.some(mapping => mapping.sourceId === 'source-minna-no-nihongo'
        && mapping.reference === 'Minna no Nihongo I · Lesson 4')) {
        throw new TypeError('The l1-l10 Minna scope mapping changed.');
    }
}

function vocabularyComponent(): Readonly<Record<string, unknown>> {
    const root = record(lessonPackage, 'l1-l10 package');
    const matches = array(root.components, 'l1-l10 components').map((value, index) =>
        record(value, `l1-l10 component ${index}`)).filter(component => {
        const provenance = component.provenance;
        return provenance && typeof provenance === 'object' && !Array.isArray(provenance)
            && (provenance as Record<string, unknown>).payloadSha256 === VOCABULARY_SHA256;
    });
    if (matches.length !== 1) throw new TypeError('Expected exactly one l1-l10 source vocabulary component.');
    return matches[0]!;
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
    return value as Readonly<Record<string, unknown>>;
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    return value;
}

function exact(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be nonempty text.`);
    return value;
}

function nullable(value: unknown, label: string): string | null {
    return value === null ? null : exact(value, label);
}

function integer(value: unknown, label: string): number {
    if (!Number.isInteger(value) || Number(value) < 1) throw new TypeError(`${label} must be a positive integer.`);
    return Number(value);
}

function digest(value: unknown, label: string): string {
    const result = exact(value, label);
    if (!/^[a-f0-9]{64}$/u.test(result)) throw new TypeError(`${label} must be a SHA-256 digest.`);
    return result;
}
