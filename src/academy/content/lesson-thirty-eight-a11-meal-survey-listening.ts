import lessonPackage from '../../../public/academy/content/lessons/040-l2-l13.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { MealSurveyListeningModel, MealSurveyListeningTask } from '../minigames/meal-survey-listening';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';
import { resolvePackagedListeningTask } from './listening/listening-task-bindings';

const PACKAGE_ID = 'l2-l13';
const PACKAGE_ORDER = 40;
const MODULE_ID = 8121266;
const ARCHIVE_ID = 'archive-000092';
const ARCHIVE_SHA256 = 'f1ce9163abbe23a99c1e0fbe29973c8f3f68630cc6cbcd872a6e91ea75fe4217';
const WORKSHEET_SHA256 = '3023ab51a23ae6744380db3cf909754a77fa8decac47de70a5c46224bc6daed9';
const WORKSHEET_IMAGE_SHA256 = '18b086df7e2a30592a4a07d60f5fcb575cc2415e02f1b18c6dcfce415f7bb868';
const AUDIO_SHA256 = '596a4499996bd9599a169a8ae9171a0e78fe22a7f9d92bce7045203b794baf25';
const AUDIO_LOCATOR = 'academy/content/moodle/audio/l2-l13-a11.mp3';
const SOURCE_PREFIX = `moodle:${MODULE_ID}:${WORKSHEET_SHA256}:pdf-p1:a11-meal-survey`;

export function createLessonThirtyEightA11MealSurveyListeningBeat(): LessonActivityBeat {
    assertExactPackageSources();
    const tasks = Object.freeze([
        choice('lunch-frequency', 1, '昼ごはんを食べますか。', ['毎日', '時々', '全然'], '毎日'),
        typed('lunch-place', 2, 'どこで食べますか。', '大学の食堂', ['大学の食堂', '大学食堂', '食堂']),
        typed('lunch-food', 3, 'ラーメンや（　　　）', 'カレー'),
        choice('dinner-frequency', 4, '晩ごはんを食べますか。', ['毎日', '時々', '全然'], '毎日'),
        typed('dinner-place', 5, 'どこで食べますか。', 'うち', ['うち', '家', '家で']),
        choice('cook-frequency', 6, '自分で料理しますか。', ['毎日', '時々', '全然'], '時々'),
        choice('shopping-place', 7, '買い物はどこでしますか。', ['スーパー', 'コンビニ', 'その他'], 'コンビニ'),
    ] satisfies readonly MealSurveyListeningTask[]);
    const activity: MealSurveyListeningModel = {
        id: 'activity:l2-l13-a11-meal-survey-listening',
        kind: 'academy-meal-survey-listening',
        responseKind: 'moodle-a11-meal-survey',
        curriculumPhase: 'assessed-recognition',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: tasks.map(task => task.conceptId),
        prompt: {
            ja: '食事アンケートの表現を確認してから A-11 を聞き、学生の答えを原本どおり書いてください。',
            en: 'Review the meal-survey language, then listen to A-11 and record the student’s answers in the source worksheet order.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            packageOrder: PACKAGE_ORDER,
            answerVisibility: 'after-attempt',
            repairScope: 'missed-source-items-only',
            moodle: {
                moduleId: MODULE_ID,
                archiveId: ARCHIVE_ID,
                archiveSha256: ARCHIVE_SHA256,
                worksheet: {
                    sourceId: `moodle:${MODULE_ID}:${WORKSHEET_SHA256}:pdf-p1:a11`,
                    payloadSha256: WORKSHEET_SHA256,
                    title: 'Handouts/Chapter 28 listening-2.pdf',
                    page: 1,
                    url: '/academy/content/lessons/l2-l13/moodle-a11-meal-survey-page-1.png',
                    sha256: WORKSHEET_IMAGE_SHA256,
                },
                audio: {
                    sourceId: `moodle:${MODULE_ID}:${AUDIO_SHA256}:audio:a11`,
                    payloadSha256: AUDIO_SHA256,
                    locator: AUDIO_LOCATOR,
                    url: requirePackagedAudio(tasks[0].sourceQuestionId),
                    durationSeconds: 83.12,
                },
                answerKeyBasis: 'worksheet-a11-loci-and-original-audio-reviewed',
                excludedWorksheetSection: 'a12-lower-section-not-paired-with-a11',
            },
        },
        payload: {
            sourceCaption: {
                ja: 'Moodle 原本 A-11「学生の食事についてアンケートをします」。上段の食事アンケート七項目だけを扱い、下段 A-12 は含めません。',
                en: 'Moodle A-11, “Survey students about their meals.” Only the seven responses in the upper meal survey are assessed; lower section A-12 is excluded.',
            },
            prerequisiteContext: [
                context('毎日・時々・全然', '頻度を高い順に聞き分けます。「いつも」はこの選択肢では「毎日」です。', 'Listen for frequency from always to never. In these choices, いつも maps to 毎日.'),
                context('場所で 食べます', '動作をする場所には「で」を使います。例：カフェで食べます。', 'Use で for the place where an action happens: カフェで食べます.'),
                context('パンや おにぎり', '「や」は例を並べます。後ろにも食べ物が続く合図です。', 'や lists examples and signals that another food follows.'),
                context('〜から・〜し', '「安いから」は一つの理由、「便利だし、いろいろあるし」は理由を重ねます。', 'から gives one reason; し can layer several reasons.'),
            ],
            instruction: '学生の食事についてアンケートをします。学生の答えを書いてください。',
            tasks,
            transcript: reviewedTranscript(),
            feedback: {
                pass: { explanation: { ja: '七つの答えが A-11 の学生の食事と買い物の話に一致しました。', en: 'All seven answers match the student’s meal and shopping survey in A-11.' } },
                lapse: {
                    explanation: { ja: '一つ以上の答えを、試行後の台本と原本の質問に照らして聞き直します。', en: 'Re-listen to one or more answers using the post-attempt transcript and source prompts.' },
                    repairPrompt: { ja: '間違えた原本項目だけが残ります。', en: 'Only missed source items remain for repair.' },
                    nearbyExample: { ja: '例では「毎日は食べていません」のあとに、パンとコーヒーという具体的な答えが続きます。質問の種類を先に確認しましょう。', en: 'In the example, 毎日は食べていません is followed by the specific answer パンとコーヒー. Identify the question type first.' },
                },
            },
        },
    };
    return Object.freeze({
        id: 'a11-meal-survey-listening',
        narrative: {
            ja: '「し」で理由をつないだあと、ロバートは先生の同じ Chapter 28 パックから A-11 を再生します。食堂、家、コンビニへ移る学生の一日を、アンケート用紙にそのまま記録します。',
            en: 'After linking reasons with shi, Robert plays A-11 from Sensei’s same Chapter 28 pack. The learner records a student’s day across the cafeteria, home, and convenience store directly onto the survey.',
        },
        activity: Object.freeze(activity),
    });
}

function choice(id: string, sourceOrder: MealSurveyListeningTask['sourceOrder'], prompt: string, options: readonly string[], answer: string): MealSurveyListeningTask {
    return task(id, sourceOrder, prompt, 'choice', answer, [answer], options);
}

function typed(id: string, sourceOrder: MealSurveyListeningTask['sourceOrder'], prompt: string, answer: string, acceptedAnswers: readonly string[] = [answer]): MealSurveyListeningTask {
    return task(id, sourceOrder, prompt, 'text', answer, acceptedAnswers);
}

function task(
    id: string,
    sourceOrder: MealSurveyListeningTask['sourceOrder'],
    prompt: string,
    kind: MealSurveyListeningTask['kind'],
    answer: string,
    acceptedAnswers: readonly string[],
    options?: readonly string[],
): MealSurveyListeningTask {
    return Object.freeze({
        id,
        sourceOrder,
        sourceQuestionId: `${SOURCE_PREFIX}:item-${sourceOrder}`,
        prompt,
        kind,
        ...(options ? { options: Object.freeze([...options]) } : {}),
        answer,
        acceptedAnswers: Object.freeze([...acceptedAnswers]),
        conceptId: `concept:l2-l13:a11-meal-survey-${sourceOrder}`,
        errorTag: `l2-l13-a11-item-${sourceOrder}`,
    });
}

function context(pattern: string, ja: string, en: string) { return Object.freeze({ pattern, explanation: Object.freeze({ ja, en }) }); }

function reviewedTranscript(): MealSurveyListeningModel['payload']['transcript'] {
    return Object.freeze([
        line('音声', '3番、学生の食事についてアンケートをします。学生の答えを書いてください。'),
        line('例・聞き手', 'すみません、毎日の食事についてちょっと教えていただけませんか。'),
        line('例・学生', '毎日の食事？ いいですよ。'),
        line('例・聞き手', '毎日朝ごはんを食べていますか。'),
        line('例・学生', 'うーん、毎日は食べていません。'),
        line('例・学生', '食べるときはだいたいパンとコーヒーですね。コンビニで買っています。'),
        line('1・聞き手', '昼ごはんは？'),
        line('1・学生', '毎日大学の食堂で食べています。'),
        line('1・聞き手', 'どんなものを食べていますか。'),
        line('1・学生', 'ラーメンやカレーですね。'),
        line('1・学生', '安いから。'),
        line('1・聞き手', 'そうですか。'),
        line('2・聞き手', '晩ごはんはどうしていますか。'),
        line('2・学生', '晩ごはんですか？'),
        line('2・学生', 'いつもうちで食べています。'),
        line('2・聞き手', '自分で料理しますか。'),
        line('2・学生', '時々自分で料理を作りますよ。'),
        line('2・学生', 'でも、大抵コンビニで買ったものを食べていますね。'),
        line('2・学生', '便利だし、いろいろあるしね。'),
        line('3・聞き手', '買い物はいつもどこでしていますか。'),
        line('3・聞き手', 'スーパーですか。'),
        line('3・学生', 'コンビニですね。'),
        line('3・学生', 'コンビニがなかったら生活できませんよ。'),
        line('聞き手', 'そうですか。どうもありがとうございました。'),
        line('学生', 'いいえ。'),
    ]);
}

function line(speaker: string, text: string) { return Object.freeze({ speaker, text }); }

function requirePackagedAudio(sourceQuestionId: string): string {
    const url = resolvePackagedListeningTask(PACKAGE_ID, sourceQuestionId, AUDIO_LOCATOR);
    if (!url) throw new TypeError('A-11 must have a packaged exact-task binding.');
    return url;
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l2-l13 package');
    const identity = record(root.identity, 'l2-l13 identity');
    const coverage = record(root.sourceCoverage, 'l2-l13 coverage');
    if (root.id !== PACKAGE_ID || root.order !== PACKAGE_ORDER || identity.moduleId !== MODULE_ID
        || coverage.archiveId !== ARCHIVE_ID || coverage.archiveSha256 !== ARCHIVE_SHA256) {
        throw new TypeError('Unexpected l2-l13 package identity.');
    }
    const members = array(coverage.members, 'l2-l13 members').map(value => record(value, 'l2-l13 member'));
    const worksheet = members.find(member => member.payloadSha256 === WORKSHEET_SHA256);
    const audio = members.find(member => member.payloadSha256 === AUDIO_SHA256);
    if (worksheet?.title !== 'Handouts/Chapter 28 listening-2.pdf' || worksheet.kind !== 'document'
        || audio?.title !== 'Audio materials/11 A-11.mp3' || audio.kind !== 'audio') {
        throw new TypeError('Lesson 38 requires the exact A-11 worksheet/audio pair.');
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
