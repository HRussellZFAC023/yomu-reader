import lessonPackage from '../../../public/academy/content/lessons/014-l1-l13.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type {
    ChoiceRound,
    SkillUnderstandingRound,
    SkillUnderstandingWorkbookModel,
} from '../minigames/skill-understanding-workbook';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l1-l13' as const;
const MODULE_ID = 5489595;
const ARCHIVE_SHA256 = 'e06668d27acd438d5b0e546042a4aa2dc063ba8e75595f96190d7aa4a844a839';
const SKILL_SHA256 = '189a165207404014343ed19be7bdba76e59212586273f68d9e27c5f0651d3fde';
const UNDERSTANDING_SHA256 = '5703647975dcf519399c5a911254a9a418ace4af7f8403242f1255e9e1dcfd1e';
const MINNA_SHA256 = '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229';
const GENKI_SHA256 = '3ccb538a2f9708ae43fcfd56640f7ee040a784eb790f61df0e401adb2506bff7';
const GENKI_SCRIPT_SHA256 = '02d771397a001cb17900fce9f63abc17221db0fb14f01839ddf34a102febcd21';
const GENKI_TASK_ID = 'genki-2e:l1-l13:lesson-5-workbook-8';

type MoodleSource = Readonly<{ id: string; cue: string; answer: string; mode: ChoiceRound['mode'] }>;

const MOODLE_SOURCES: readonly MoodleSource[] = [
    source('moodle:5489595:189a1652:p2:q1:1', 'わたし／スキー／bad, poor', 'わたしはスキーがへたです', 'skill-choice'),
    source('moodle:5489595:189a1652:p2:q1:2', 'マイケルさん／ダンス／good', 'マイケルさんはダンスがじょうずです', 'skill-choice'),
    source('moodle:5489595:189a1652:p2:q1:3', 'あのひと／カラオケ／not good', 'あのひとはカラオケがじょうずじゃありません', 'skill-choice'),
    source('moodle:5489595:189a1652:p2:q1:4', 'ピカソさん／え／good', 'ピカソさんはえがじょうずです', 'skill-choice'),
    source('moodle:5489595:57036479:p1:q1:1', 'かんじ', 'かんじがわかりますか', 'question-choice'),
    source('moodle:5489595:57036479:p4:q2:1', 'ワットさん／ひらがな（はい、すこし）', 'はい、すこしわかります', 'reply-choice'),
    source('moodle:5489595:57036479:p4:q2:2', 'ハントさん／にほんご（はい、だいたい）', 'はい、だいたいわかります', 'reply-choice'),
    source('moodle:5489595:57036479:p4:q2:4', 'マイケルさん／かんじ（いいえ、ぜんぜん）', 'いいえ、ぜんぜんわかりません', 'reply-choice'),
];

const MINNA_SOURCES = [
    ['1', 'シュミットさん・英語（はい、よく）', 'はい、よくわかります'],
    ['2', 'テレーザちゃん・漢字（いいえ、あまり）', 'いいえ、あまりわかりません'],
    ['3', 'サントスさん・日本語（はい、だいたい）', 'はい、だいたいわかります'],
    ['4', '山田さんの奥さん・フランス語（いいえ、ぜんぜん）', 'いいえ、ぜんぜんわかりません'],
] as const;

const GENKI_SOURCES = [
    ['food', 'どんな食べ物が好きですか。', 'アイスクリームが好きです', 'アイスクリームがすきです'],
    ['drink', 'どんな飲み物が好きですか。', 'コーヒーが好きです', 'コーヒーがすきです'],
    ['music', 'どんな音楽が好きですか。', '日本の音楽が好きです', 'にほんのおんがくがすきです'],
] as const;

export function createLessonThirteenSkillUnderstandingWorkbookModel(): SkillUnderstandingWorkbookModel {
    assertExactPackageSources();
    const rounds = Object.freeze([
        ...MOODLE_SOURCES.map((item, index) => moodleRound(item, index + 1)),
        ...MINNA_SOURCES.map(([id, cue, answer], index) => replyRound({
            id: `minna-practice-b-4-${id}`,
            sourceOrder: index + 9,
            sourceQuestionId: `minna-i:${MINNA_SHA256}:lesson-9:pdf-p97:practice-b:4:${id}`,
            sourceLabel: 'Minna no Nihongo I - Lesson 9 - PDF 97 / printed 77 - Practice B 4',
            sourcePrompt: cue,
            answer,
        })),
        ...GENKI_SOURCES.map(([id, prompt, kanji, kana], index) => Object.freeze({
            id: `genki-${id}`,
            sourceOrder: index + 13,
            sourceQuestionId: `${GENKI_TASK_ID}:slot-${index + 7}`,
            sourceLabel: 'Genki I - Lesson 5 - workbook 8',
            sourcePrompt: prompt,
            answerExpression: kanji,
            acceptedAnswers: [kanji, kana],
            conceptId: `concept:l1-l13:skill-understanding:${index + 13}`,
            errorTag: `l1-l13-skill-understanding-${index + 13}`,
            hint: hints('typed'),
            mode: 'typed' as const,
        })),
    ] satisfies readonly SkillUnderstandingRound[]);
    return Object.freeze({
        id: 'activity:l1-l13-skill-understanding-workbook',
        kind: 'academy-skill-understanding-workbook',
        responseKind: 'mixed-source-skill-understanding-workbook',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: Object.freeze(rounds.map(round => round.conceptId)),
        prompt: {
            ja: 'じょうず・へたとわかりますの型を先に学び、Moodle、みんなの日本語、Genkiの順番で答えます。',
            en: 'Learn the skill and understanding patterns first, then answer Moodle, Minna, and Genki items in source order.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            answerVisibility: 'after-attempt',
            sourceOrder: ['moodle', 'minna', 'genki'],
            moodle: {
                moduleId: MODULE_ID,
                archiveSha256: ARCHIVE_SHA256,
                documents: [
                    { payloadSha256: SKILL_SHA256, member: 'Handouts/Chapter 9-1_Grammar Exercise_describing skilles.pdf', pages: '2' },
                    { payloadSha256: UNDERSTANDING_SHA256, member: 'Handouts/Chapter 9-2_Grammar Exercise_describing abilities and the degree.pdf', pages: '1, 4' },
                ],
            },
            minna: {
                sourceId: `minna-i:${MINNA_SHA256}:lesson-9:pdf-p97:practice-b:4`,
                reference: 'Minna no Nihongo I, Lesson 9',
                payloadSha256: MINNA_SHA256,
                pdfPage: 97,
                printedPage: 77,
                exercise: 'Practice B, exercise 4',
            },
            genki: {
                taskId: GENKI_TASK_ID,
                sourceId: `japanese-genki-interactive:${GENKI_SHA256}:generateQuiz`,
                relativePath: 'lessons/lesson-5/workbook-8/index.html',
                payloadSha256: GENKI_SHA256,
                scriptSha256: GENKI_SCRIPT_SHA256,
                lineLocus: { start: 76, end: 139 },
                engine: 'Genki.generateQuiz',
                sourceSlice: [7, 8, 9],
            },
        },
        payload: {
            teaching: [
                teaching('moodle:5489595:189a1652:p2:q1', 'Moodle - Chapter 9 skills - page 2',
                    'person は activity が じょうずです／へたです',
                    'A skill is the thing evaluated, so it takes が. Use じょうずじゃありません as the tactful negative about another person.',
                    '技能を表すものには「が」を使います。人については、やわらかい否定の「じょうずじゃありません」も使えます。',
                    'マイケルさんはダンスがじょうずです。'),
                teaching('moodle:5489595:57036479:p4:q2', 'Moodle - Chapter 9 understanding and degree - page 4',
                    'N が すこし／だいたい わかります。N が あまり／ぜんぜん わかりません。',
                    'Match the degree word to the verb polarity: すこし and だいたい are affirmative; あまり and ぜんぜん are negative here.',
                    '程度のことばと肯定・否定を組みにします。「すこし・だいたい」は肯定、「あまり・ぜんぜん」は否定です。',
                    'かんじがぜんぜんわかりません。'),
                teaching(`minna-i:${MINNA_SHA256}:lesson-9:pdf-p97:practice-b:4:example`, 'Minna no Nihongo I - Lesson 9 - Practice B 4',
                    'person は language が わかりますか。はい、degree わかります。',
                    'First ask what the person understands, then preserve the supplied yes/no and degree in the reply.',
                    'まず「何がわかりますか」と聞き、手がかりの「はい／いいえ」と程度を答えに残します。',
                    'マリアさんはかたかながわかりますか。はい、すこしわかります。'),
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: { explanation: { ja: '15問の元資料を順番どおりに完成しました。', en: 'You completed all 15 source items in order.' } },
                lapse: {
                    explanation: { ja: '技能か理解の型を直す問題があります。', en: 'At least one skill or understanding pattern needs repair.' },
                    repairPrompt: { ja: '表示された問題だけを直し、必要ならヒントを開きましょう。', en: 'Repair only the visible items, using a hint when needed.' },
                    nearbyExample: { ja: 'にほんごがだいたいわかります。', en: 'I understand Japanese fairly well.' },
                },
            },
        },
    } satisfies SkillUnderstandingWorkbookModel);
}

export function createLessonThirteenSkillUnderstandingWorkbookBeat(): LessonActivityBeat {
    return Object.freeze({
        id: 'skill-understanding-workbook',
        narrative: {
            ja: 'ミカが活動カードを並べ、アーカッシュが読める文字と言える得意なことを確かめます。',
            en: 'Mika lays out activity cards while Aakash checks what people are good at and what they understand.',
        },
        activity: createLessonThirteenSkillUnderstandingWorkbookModel(),
    });
}

function moodleRound(item: MoodleSource, sourceOrder: number): SkillUnderstandingRound {
    const common = {
        id: `moodle-${sourceOrder}`,
        sourceOrder,
        sourceQuestionId: item.id,
        sourceLabel: item.id.includes(SKILL_SHA256)
            ? 'Moodle - Chapter 9 skills - page 2'
            : 'Moodle - Chapter 9 understanding and degree - pages 1, 4',
        sourcePrompt: item.cue,
        answerExpression: item.answer,
        conceptId: `concept:l1-l13:skill-understanding:${sourceOrder}`,
        errorTag: `l1-l13-skill-understanding-${sourceOrder}`,
        hint: hints(item.mode),
    };
    if (item.mode === 'skill-choice') return Object.freeze({
        ...common,
        mode: item.mode,
        options: skillOptions(item.answer),
        correctOptionId: 'answer',
    });
    if (item.mode === 'question-choice') return Object.freeze({
        ...common,
        mode: item.mode,
        options: [option('answer', 'N が わかりますか'), option('wa', 'N は わかりますか'), option('no-question', 'N が わかります')],
        correctOptionId: 'answer',
    });
    return replyRound({ ...common, answer: item.answer });
}

function replyRound(input: Readonly<{
    id: string;
    sourceOrder: number;
    sourceQuestionId: string;
    sourceLabel: string;
    sourcePrompt: string;
    answer: string;
    answerExpression?: string;
    conceptId?: string;
    errorTag?: string;
    hint?: ReturnType<typeof hints>;
}>): SkillUnderstandingRound {
    return Object.freeze({
        id: input.id,
        sourceOrder: input.sourceOrder,
        sourceQuestionId: input.sourceQuestionId,
        sourceLabel: input.sourceLabel,
        sourcePrompt: input.sourcePrompt,
        answerExpression: input.answerExpression ?? input.answer,
        conceptId: input.conceptId ?? `concept:l1-l13:skill-understanding:${input.sourceOrder}`,
        errorTag: input.errorTag ?? `l1-l13-skill-understanding-${input.sourceOrder}`,
        hint: input.hint ?? hints('reply-choice'),
        mode: 'reply-choice',
        options: replyOptions(input.answer),
        correctOptionId: 'answer',
    });
}

function skillOptions(answer: string) {
    const ending = answer.includes('へたです') ? 'へたです'
        : answer.includes('じゃありません') ? 'じょうずじゃありません' : 'じょうずです';
    const alternatives = ['じょうずです', 'へたです', 'じょうずじゃありません'].filter(value => value !== ending);
    return [option('answer', `activity が ${ending}`), ...alternatives.map((value, index) =>
        option(index === 0 ? 'particle' : 'ending', index === 0 ? `activity を ${ending}` : `activity が ${value}`))];
}

function replyOptions(answer: string) {
    const correct = answer.includes('ぜんぜん') ? 'no-none'
        : answer.includes('あまり') ? 'no-not-much'
            : answer.includes('だいたい') ? 'yes-mostly' : 'yes-little';
    const labels: Record<string, string> = {
        'yes-little': 'はい / すこし わかります',
        'yes-mostly': 'はい / だいたい わかります',
        'no-not-much': 'いいえ / あまり わかりません',
        'no-none': 'いいえ / ぜんぜん わかりません',
    };
    return [option('answer', labels[correct]!), ...Object.keys(labels).filter(id => id !== correct).map(id => option(id, labels[id]!))];
}

function hints(mode: SkillUnderstandingRound['mode']) {
    const detail = mode === 'skill-choice'
        ? { ja: '技能・得意なことの前は「が」です。', en: 'The activity being evaluated takes が.' }
        : mode === 'question-choice'
            ? { ja: '「わかります」に質問の「か」をつけ、前は「が」です。', en: 'Put が before わかります and add か for the question.' }
            : mode === 'typed'
                ? { ja: 'Genkiの英語の手がかりを、ものがすきですの順で組みます。', en: 'Build the Genki answer as thing が 好きです.' }
                : { ja: '程度のことばと、肯定・否定の「わかります」を組みにします。', en: 'Match the degree word with affirmative or negative わかります.' };
    return Object.freeze([
        { ja: 'まず、技能・理解・好みのどれかを見分けます。', en: 'First decide whether this is about skill, understanding, or preference.' },
        detail,
        { ja: '手がかりの「はい／いいえ」と程度を答えに残します。', en: 'Keep the cue’s yes/no and degree in your answer.' },
    ] as const);
}

function teaching(sourceQuestionId: string, sourceLabel: string, pattern: string, en: string, ja: string, example: string) {
    return Object.freeze({ sourceQuestionId, sourceLabel, pattern, explanation: { en, ja }, example });
}

function option(id: string, label: string) {
    return Object.freeze({ id, label });
}

function source(id: string, cue: string, answer: string, mode: MoodleSource['mode']): MoodleSource {
    return Object.freeze({ id, cue, answer, mode });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l1-l13 package');
    const identity = record(root.identity, 'l1-l13 identity');
    if (root.id !== PACKAGE_ID || identity.moduleId !== MODULE_ID) throw new TypeError('Unexpected l1-l13 package identity.');
    const exercises = exactExercises(root);
    if (exercises.length !== MOODLE_SOURCES.length) throw new TypeError('Expected all eight exact l1-l13 Moodle exercises.');
    exercises.forEach((item, index) => {
        const expected = MOODLE_SOURCES[index]!;
        const answer = record(item.answer, `l1-l13 Moodle answer ${index + 1}`);
        if (item.sourceQuestionId !== expected.id || item.sourceCueExact !== expected.cue || answer.primary !== expected.answer) {
            throw new TypeError(`Unexpected l1-l13 Moodle source item at order ${index + 1}.`);
        }
    });
    const activity = record(array(root.genkiInteractiveActivities, 'l1-l13 Genki activities')[0], 'l1-l13 Genki activity');
    const sourceRecord = record(activity.source, 'l1-l13 Genki source');
    const locus = record(sourceRecord.lineLocus, 'l1-l13 Genki locus');
    const task = record(activity.exactTask, 'l1-l13 Genki task');
    const config = record(task.config, 'l1-l13 Genki config');
    const quizlet = requiredText(config.quizlet, 'l1-l13 Genki quizlet');
    if (activity.id !== GENKI_TASK_ID || sourceRecord.payloadSha256 !== GENKI_SHA256
        || sourceRecord.scriptSha256 !== GENKI_SCRIPT_SHA256 || locus.start !== 76 || locus.end !== 139
        || task.engine !== 'Genki.generateQuiz' || config.type !== 'fill') {
        throw new TypeError('Unexpected l1-l13 Genki task identity.');
    }
    let cursor = -1;
    GENKI_SOURCES.forEach(([, prompt, kanji, kana]) => {
        const position = quizlet.indexOf(prompt, cursor + 1);
        if (position <= cursor || !quizlet.includes(kanji) || !quizlet.includes(kana)) {
            throw new TypeError('The exact l1-l13 Genki prompt, answer, or order changed.');
        }
        cursor = position;
    });
}

function exactExercises(root: Record<string, unknown>): Record<string, unknown>[] {
    const found: Record<string, unknown>[] = [];
    for (const componentValue of array(root.components, 'l1-l13 components')) {
        const component = record(componentValue, 'l1-l13 component');
        for (const exerciseValue of arrayOrEmpty(component.exercises)) {
            const exercise = record(exerciseValue, 'l1-l13 exercise');
            if (typeof exercise.sourceQuestionId === 'string'
                && MOODLE_SOURCES.some(sourceItem => sourceItem.id === exercise.sourceQuestionId)) found.push(exercise);
        }
    }
    return found;
}

function record(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
    return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    return value;
}

function arrayOrEmpty(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function requiredText(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be non-empty text.`);
    return value;
}
