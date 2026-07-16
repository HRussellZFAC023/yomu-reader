import lessonPackage from '../../../public/academy/content/lessons/010-l1-l09.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type {
    WeeklyPlanChoiceRound,
    WeeklyPlanPairRound,
    WeeklyPlanTypedRound,
    WeeklyPlanWeekdayOption,
    WeeklyPlanWorkbookModel,
} from '../minigames/weekly-plan-workbook';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l1-l09';
const MODULE_ID = 5889535;
const MOODLE_SHA256 = '4c9419150055497b0771d56b98eccfadbdf10a7506293090701312eeebf3b306';
const MOODLE_TITLE = 'New Chapter 4-2 days and weekly plans desu conjugation Grammar Exercise';
const MOODLE_MEMBER = 'Handouts/New Chapter 4-2_days and weekly plans_desu conjugation_Grammar Exercise.pdf';
const GENKI_TASK_ID = 'genki-2e:l1-l09:lesson-4-workbook-3';
const GENKI_SHA256 = 'd4193e4a18bfef9dc69c58656759405b1fe013fc5d9d4599d3c74a9cd7fe7569';
const GENKI_SCRIPT_SHA256 = '8a377ce898a0067131d5b8345e88b20f229508435e1265f8b739deb6e469eb0b';
const MINNA_SHA256 = '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229';

const WEEKDAYS: readonly WeeklyPlanWeekdayOption[] = Object.freeze([
    weekday('getsu', 'げつようび', 'Monday'),
    weekday('ka', 'かようび', 'Tuesday'),
    weekday('sui', 'すいようび', 'Wednesday'),
    weekday('moku', 'もくようび', 'Thursday'),
    weekday('kin', 'きんようび', 'Friday'),
    weekday('do', 'どようび', 'Saturday'),
    weekday('nichi', 'にちようび', 'Sunday'),
]);

const GENKI_PROBLEMS = [
    genkiProblem(1, 'きのうは月曜日でしたか。', 'Yes, yesterday was Monday.', [
        'はい、きのうは月曜日でした', 'はい、きのうはげつようびでした',
        'はい、昨日は月曜日でした', 'はい、昨日はげつようびでした',
        'はい、月曜日でした', 'はい、げつようびでした',
    ]),
    genkiProblem(2, 'きのうは十五日でしたか。', 'No, yesterday was not the 15th. It was the 22nd.', [
        'いいえ、きのうは十五日じゃなかったです。二十二日でした。',
        'いいえ、きのうはじゅうごにちじゃなかったです。にじゅうににちでした。',
        'いいえ、十五日じゃなかったです。二十二日でした。',
        'いいえ、じゅうごにちじゃなかったです。にじゅうににちでした。',
    ]),
    genkiProblem(3, '今日の朝ご飯はハンバーガーでしたか。', "No, today's breakfast was not hamburger. It was bread.", [
        'いいえ、今日の朝ご飯はハンバーガーじゃなかったです。パンでした。',
        'いいえ、きょうのあさごはんはハンバーガーじゃなかったです。パンでした。',
        'いいえ、ハンバーガーじゃなかったです。パンでした。',
    ]),
    genkiProblem(4, '子供の時、いい子供でしたか。', 'No, when I was a child, I was not a very good kid.', [
        'いいえ、子供の時、あまりいい子供じゃなかったです',
        'いいえ、こどものとき、あまりいいこどもじゃなかったです',
        'いいえ、あまりいい子供じゃなかったです',
        'いいえ、あまりよい子供じゃなかったです',
    ]),
    genkiProblem(5, '高校の時、いい学生でしたか。', 'Yes, when I was in high school, I was a good student.', [
        'はい、高校の時、いい学生でした', 'はい、こうこうのとき、いいがくせいでした',
        'はい、いい学生でした', 'はい、よい学生でした',
    ]),
    genkiProblem(6, 'My bicycle was 30,000 yen.', '', [
        '私の自転車は三万円でした', 'わたしのじてんしゃはさんまんえんでした',
    ]),
    genkiProblem(7, 'Yesterday was Sunday.', '', [
        'きのうは日曜日でした', 'きのうはにちようびでした', '昨日は日曜日でした',
    ]),
    genkiProblem(8, 'Professor Yamashita was not a Nihon University student.', '', [
        '山下先生は日本大学の学生じゃなかったです',
        'やましたせんせいはにほんだいがくのがくせいじゃなかったです',
    ]),
] as const;

export function createLessonNineWeeklyPlanModel(): WeeklyPlanWorkbookModel {
    assertExactPackageSources();
    const rounds = Object.freeze([
        pairRound(1, 'monday-today', 'きょう は げつようび です。', 'ka', 'nichi'),
        pairRound(2, 'friday-today', 'きょう は きんようび です。', 'do', 'moku'),
        choiceRound(3, 'sunday-tomorrow', 'あした は にちようび です。あさって は げつようび ですか。', 'hai', 'getsu', 'です'),
        choiceRound(4, 'saturday-yesterday', 'きのう は どようび でした。おととい は きんようび でしたか。', 'hai', 'kin', 'でした'),
        choiceRound(5, 'monday-yesterday', 'きのう は げつようび でした。きょう は なんようび ですか。', 'none', 'ka', 'です'),
        choiceRound(6, 'saturday-tomorrow', 'あした は どようび です。あさって は かようび ですか。', 'iie', 'nichi', 'です'),
        choiceRound(7, 'tuesday-yesterday', 'きのう は かようび でした。おととい は きんようび でしたか。', 'iie', 'getsu', 'でした'),
        ...GENKI_PROBLEMS.map(typedRound),
    ] satisfies readonly (WeeklyPlanPairRound | WeeklyPlanChoiceRound | WeeklyPlanTypedRound)[]);

    const model: WeeklyPlanWorkbookModel = {
        id: 'activity:l1-l09-weekly-plan-workbook',
        kind: 'academy-weekly-plan-workbook',
        responseKind: 'mixed-source-weekly-plan-workbook',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: Object.freeze(rounds.map(round => round.conceptId)),
        prompt: {
            ja: '先生の曜日と過去の型を学んでから、元資料の問題を順番に完成しましょう。',
            en: 'Learn the weekday and past-tense patterns, then complete the source tasks in order.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: MODULE_ID,
                grammar: {
                    sourceId: `moodle-payload:${MOODLE_SHA256}`,
                    payloadSha256: MOODLE_SHA256,
                    sourceTitle: MOODLE_TITLE,
                    member: MOODLE_MEMBER,
                    author: 'Rie Tsuruta-Barratt',
                    pages: [1, 2],
                },
            },
            genki: {
                taskId: GENKI_TASK_ID,
                sourceId: `japanese-genki-interactive:${GENKI_SHA256}:generateQuiz`,
                relativePath: 'lessons/lesson-4/workbook-3/index.html',
                payloadSha256: GENKI_SHA256,
                scriptSha256: GENKI_SCRIPT_SHA256,
                lineLocus: { start: 76, end: 130 },
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
                relation: 'verified-sequence-and-page-55-model-only',
            },
        },
        payload: {
            teaching: [
                teaching(1, `moodle:${MOODLE_SHA256}:p1:basic-sentence`, 'Moodle · page 1',
                    'Noun 1 は Noun 2 (day) です。',
                    '曜日を聞くときは「なんようびですか」を使います。',
                    'Ask which day with なんようびですか.',
                    'あさって は きんようび です。'),
                teaching(2, `moodle:${MOODLE_SHA256}:p1:conjugation`, 'Moodle · page 1',
                    'non past: Noun です／じゃ ありません。 past: Noun でした／じゃ ありませんでした。',
                    '元資料は、現在の肯定・否定の次に、過去の肯定・否定を並べています。',
                    'The source places non-past affirmative/negative before past affirmative/negative.',
                    'きのう は かようび でした。'),
                teaching(3, `moodle:${MOODLE_SHA256}:p1:question-answer`, 'Moodle · page 1',
                    'question: Noun ですか／でしたか。',
                    '「はい」は同じ形で答え、「いいえ」は正しい曜日を言い直します。',
                    'Answer はい in the matching tense; after いいえ, supply the correct day.',
                    'おととい は なんようび でしたか。— げつようび でした。'),
                teaching(4, `moodle:${MOODLE_SHA256}:p2:section-2:model`, 'Moodle · page 2',
                    'きょう は すいようび です。あした は もくようび ですか。',
                    '元資料の例は、きょうから一日進めて答えます。',
                    'The source model moves one day forward from today.',
                    'はい、もくようび です。'),
                teaching(5, `minna-i:${MINNA_SHA256}:lesson-4:pdf-p55:exercise-4:model`,
                    'Minna no Nihongo I · Lesson 4 · PDF page 55 / printed page 35',
                    'Noun は 何時から 何時までですか。',
                    'みんなの第4課も、時と予定を質問して答える順序を確認します。新しい本文はここでは再現しません。',
                    'Minna Lesson 4 corroborates the question-to-schedule sequence; no unseen text is reproduced here.',
                    '銀行は 何時から 何時までですか。— 9時から 3時までです。'),
                teaching(6, `${GENKI_TASK_ID}:instruction`, 'Genki I · Lesson 4 · workbook page 38',
                    'Complete the following problems using past tense nouns.',
                    'Genkiでは、英語の手がかりに合わせて「でした／じゃなかったです」を使います。',
                    'Use でした or じゃなかったです to match each Genki cue.',
                    'Yesterday was Sunday. — きのうは日曜日でした。'),
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: {
                    explanation: {
                        ja: 'MoodleとGenkiの問題を元の順番どおりに完成しました。',
                        en: 'You completed the Moodle and Genki tasks in their source order.',
                    },
                },
                lapse: {
                    explanation: {
                        ja: '曜日、はい／いいえ、または過去の形が違う問題があります。',
                        en: 'At least one item has a different weekday, yes/no response, or past-tense form.',
                    },
                    repairPrompt: {
                        ja: '表示された問題だけ、元資料の曜日と時制を確認して直しましょう。',
                        en: 'Repair only the visible missed items by checking the source day and tense.',
                    },
                    nearbyExample: {
                        ja: 'きのう は かようび でした。',
                        en: 'For a past day, the source changes です to でした.',
                    },
                },
            },
        },
    };
    return Object.freeze(model);
}

export function createLessonNineWeeklyPlanBeat(): LessonActivityBeat {
    return Object.freeze({
        id: 'weekly-plan-workbook',
        narrative: {
            ja: 'ジェニーとトムが日付カードを並べ、りえ先生の曜日問題を元の順番で確認します。',
            en: 'Jenny and Tom arrange dated cards and work through Rie’s weekday problems in source order.',
        },
        activity: createLessonNineWeeklyPlanModel(),
    });
}

function weekday(id: string, ja: string, en: string): WeeklyPlanWeekdayOption {
    return Object.freeze({ id, ja, en });
}

function genkiProblem(slot: number, prompt: string, cue: string, acceptedAnswers: readonly string[]) {
    return Object.freeze({ slot, prompt, cue, acceptedAnswers: Object.freeze(acceptedAnswers) });
}

function pairRound(
    sourceOrder: number,
    id: string,
    sourcePrompt: string,
    correctTomorrowId: string,
    correctYesterdayId: string,
): WeeklyPlanPairRound {
    const tomorrow = requiredWeekday(correctTomorrowId);
    const yesterday = requiredWeekday(correctYesterdayId);
    return Object.freeze({
        mode: 'weekday-pair' as const,
        id,
        sourceOrder,
        sourceQuestionId: `moodle:${MOODLE_SHA256}:p1:section-1:item-${sourceOrder}`,
        sourcePrompt,
        options: WEEKDAYS,
        correctTomorrowId,
        correctYesterdayId,
        answerExpression: `あした は ${tomorrow.ja} です。きのう は ${yesterday.ja} でした。`,
        conceptId: `concept:l1-l09:weekly-plan:${id}`,
        errorTag: `l1-l09-weekly-plan-${id}`,
        hints: hints(
            '「あした」は一日後、「きのう」は一日前です。',
            'あした is one day later; きのう is one day earlier.',
            'げつ・か・すい・もく・きん・ど・にちの輪を使いましょう。',
            'Use the げつ・か・すい・もく・きん・ど・にち cycle.',
        ),
    });
}

function choiceRound(
    sourceOrder: number,
    id: string,
    sourcePrompt: string,
    correctPolarity: WeeklyPlanChoiceRound['correctPolarity'],
    correctDayId: string,
    copula: WeeklyPlanChoiceRound['copula'],
): WeeklyPlanChoiceRound {
    const day = requiredWeekday(correctDayId);
    const prefix = correctPolarity === 'hai' ? 'はい、' : correctPolarity === 'iie' ? 'いいえ、' : '';
    return Object.freeze({
        mode: 'day-answer' as const,
        id,
        sourceOrder,
        sourceQuestionId: `moodle:${MOODLE_SHA256}:p2:section-2:item-${sourceOrder - 2}`,
        sourcePrompt,
        correctPolarity,
        dayOptions: WEEKDAYS,
        correctDayId,
        copula,
        answerExpression: `${prefix}${day.ja} ${copula}。`,
        conceptId: `concept:l1-l09:weekly-plan:${id}`,
        errorTag: `l1-l09-weekly-plan-${id}`,
        hints: hints(
            '質問の基準の日から、おととい・きのう・きょう・あした・あさってを数えます。',
            'Count from the stated day across おととい, きのう, きょう, あした, and あさって.',
            '「なんようび」には曜日だけ、確認の質問には「はい／いいえ」も必要です。',
            'A なんようび question needs the day; a confirmation question also needs はい or いいえ.',
        ),
    });
}

function typedRound(problem: typeof GENKI_PROBLEMS[number]): WeeklyPlanTypedRound {
    const sourcePrompt = problem.cue ? `${problem.prompt}\n(${problem.cue})` : problem.prompt;
    return Object.freeze({
        mode: 'typed-past' as const,
        id: `genki-${problem.slot}`,
        sourceOrder: problem.slot + 7,
        sourceQuestionId: `${GENKI_TASK_ID}:slot-${problem.slot}`,
        sourcePrompt,
        acceptedAnswers: problem.acceptedAnswers,
        answerExpression: problem.acceptedAnswers[0],
        conceptId: `concept:l1-l09:weekly-plan:genki-${problem.slot}`,
        errorTag: `l1-l09-weekly-plan-genki-${problem.slot}`,
        hints: hints(
            '英語の手がかりが肯定か否定かを先に確認しましょう。',
            'First check whether the English cue is affirmative or negative.',
            '肯定の過去は「でした」、否定の過去は「じゃなかったです」です。',
            'Past affirmative uses でした; past negative uses じゃなかったです.',
        ),
    });
}

function hints(ja1: string, en1: string, ja2: string, en2: string) {
    return Object.freeze([{ ja: ja1, en: en1 }, { ja: ja2, en: en2 }]);
}

function requiredWeekday(id: string): WeeklyPlanWeekdayOption {
    const day = WEEKDAYS.find(candidate => candidate.id === id);
    if (!day) throw new TypeError(`Unknown weekday ${id}.`);
    return day;
}

function teaching(
    sourceOrder: number,
    sourceQuestionId: string,
    sourceLabel: string,
    pattern: string,
    ja: string,
    en: string,
    example: string,
) {
    return Object.freeze({ sourceOrder, sourceQuestionId, sourceLabel, pattern, rule: { ja, en }, example });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l1-l09 package');
    const identity = record(root.identity, 'l1-l09 identity');
    if (root.id !== PACKAGE_ID || identity.moduleId !== MODULE_ID) throw new TypeError('Unexpected l1-l09 package identity.');
    const coverage = record(root.sourceCoverage, 'l1-l09 source coverage');
    const members = array(coverage.members, 'l1-l09 source members').map((value, index) => record(value, `member ${index}`));
    if (members.filter(member => member.payloadSha256 === MOODLE_SHA256 && member.title === MOODLE_TITLE).length !== 1) {
        throw new TypeError('Expected the exact l1-l09 Moodle grammar worksheet.');
    }
    const activities = array(root.genkiInteractiveActivities, 'l1-l09 Genki activities');
    if (activities.length !== 1) throw new TypeError('Expected one exact l1-l09 Genki activity.');
    const activity = record(activities[0], 'l1-l09 Genki activity');
    const source = record(activity.source, 'l1-l09 Genki source');
    const locus = record(source.lineLocus, 'l1-l09 Genki line locus');
    const exactTask = record(activity.exactTask, 'l1-l09 Genki exact task');
    const config = record(exactTask.config, 'l1-l09 Genki config');
    const quizlet = text(config.quizlet, 'l1-l09 Genki quizlet');
    if (activity.id !== GENKI_TASK_ID || source.payloadSha256 !== GENKI_SHA256
        || source.scriptSha256 !== GENKI_SCRIPT_SHA256 || locus.start !== 76 || locus.end !== 130
        || exactTask.engine !== 'Genki.generateQuiz' || config.type !== 'fill'
        || config.info !== 'Complete the following problems using {!GRI|past tense nouns|l4-p3}.') {
        throw new TypeError('Unexpected l1-l09 Genki task identity.');
    }
    let cursor = -1;
    for (const problem of GENKI_PROBLEMS) {
        const index = quizlet.indexOf(problem.prompt, cursor + 1);
        if (index <= cursor || !problem.acceptedAnswers.slice(0, 2).every(answer => quizlet.includes(answer))) {
            throw new TypeError('The exact l1-l09 Genki prompt or answer order changed.');
        }
        cursor = index;
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

function text(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be non-empty text.`);
    return value;
}
