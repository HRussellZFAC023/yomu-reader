import lessonPackage from '../../../public/academy/content/lessons/013-l1-l12.json';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type {
    PreferenceWorkbookModel,
    PreferenceWorkbookRound,
} from '../minigames/preference-workbook';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const PACKAGE_ID = 'l1-l12' as const;
const MODULE_ID = 5489594;
const ARCHIVE_SHA256 = 'ddec193f603be7e277c0b0636863b129077016afe7e083cc71ffed529a53aa26';
const PREFERENCE_SHA256 = '6e0a3e02c061f7203d7c8f65db7555993f463e5fee9adf241c36255b959186e4';
const DONNA_SHA256 = 'f1757ed9b43c4fb969deb55aa81351e5c2a873d3af902ed5f5fba05df36240ed';
const MINNA_SHA256 = '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229';
const GENKI_SHA256 = '500b8acfd6c6e821a7c3399a34849741975ef6f423198ca0565174335689b71d';
const GENKI_SCRIPT_SHA256 = '938ef1d732db679ae76b6ce604f670456412ba84fa531ef1b867ace3ca5e0264';
const GENKI_TASK_ID = 'genki-2e:l1-l12:lesson-5-workbook-6';

type MoodleProblem = Readonly<{
    id: string;
    cue: string;
    answer: string;
    mode: 'sentence-choice' | 'reply-choice' | 'question-choice';
}>;

const MOODLE_PROBLEMS: readonly MoodleProblem[] = [
    problem('moodle:5489594:6e0a3e02:p1:q1:1', 'わたし／テニス／♡', 'わたしはテニスがすきです', 'sentence-choice'),
    problem('moodle:5489594:6e0a3e02:p1:q1:2', 'ミラーさん／コーヒー／×', 'ミラーさんはコーヒーがきらいです', 'sentence-choice'),
    problem('moodle:5489594:6e0a3e02:p1:q1:5', 'ワットさん／インドりょうり／×', 'ワットさんはインドりょうりがきらいです', 'sentence-choice'),
    problem('moodle:5489594:6e0a3e02:p2:q2:2', 'スポーツが すきですか。（いいえ、あまり）', 'いいえ、あまりすきじゃありません', 'reply-choice'),
    problem('moodle:5489594:6e0a3e02:p2:q2:3', 'えいがが すきですか。（はい、とても）', 'はい、とてもすきです', 'reply-choice'),
    problem('moodle:5489594:f1757ed9:p1:q1:1', 'おんがく／オペラ', 'どんなおんがくがすきですか', 'question-choice'),
    problem('moodle:5489594:f1757ed9:p1:q1:3', 'のみもの／コーヒー', 'どんなのみものがすきですか', 'question-choice'),
    problem('moodle:5489594:f1757ed9:p1:q1:5', 'スポーツ／サッカー', 'どんなスポーツがすきですか', 'question-choice'),
];

const MINNA_PROBLEMS = [
    ['1', '日本料理（はい）', 'はい、すきです'],
    ['2', 'カラオケ（いいえ、あまり）', 'いいえ、あまりすきじゃありません'],
    ['3', '旅行（はい、とても）', 'はい、とてもすきです'],
    ['4', '魚（いいえ、あまり）', 'いいえ、あまりすきじゃありません'],
] as const;

const GENKI_PROBLEMS = [
    ['japanese-class', 'Japanese class', '私は日本語のクラスが好きです', 'わたしはにほんごのクラスがすきです'],
    ['genki', 'げんき', '私はげんきが好きです', 'わたしはげんきがすきです'],
    ['cats', 'cats', '私は猫が大好きです', 'わたしはねこがだいすきです'],
    ['ocean', 'ocean', '私は海が大好きです', 'わたしはうみがだいすきです'],
    ['mondays', 'Mondays', '私は月曜日が嫌いです', 'わたしはげつようびがきらいです'],
    ['cold-mornings', 'cold mornings', '私は寒い朝が嫌いです', 'わたしはさむいあさがきらいです'],
    ['homework', 'homework', '私は宿題が大嫌いです', 'わたしはしゅくだいがだいきらいです'],
    ['frightening-movies', 'frightening movies', '私は怖い映画が大嫌いです', 'わたしはこわいえいががだいきらいです'],
    ['this-town', 'this town', '私はこの町が好きでも嫌いでもないです', 'わたしはこのまちがすきでもきらいでもないです'],
    ['fish', 'fish', '私は魚が好きでも嫌いでもないです', 'わたしはさかながすきでもきらいでもないです'],
] as const;

export function createLessonTwelvePreferenceWorkbookModel(): PreferenceWorkbookModel {
    assertExactPackageSources();
    const rounds = Object.freeze([
        ...MOODLE_PROBLEMS.map((source, index) => moodleRound(source, index + 1)),
        ...MINNA_PROBLEMS.map(([id, cue, answer], index) => replyRound({
            id: `minna-practice-b-1-${id}`,
            sourceOrder: index + 9,
            sourceQuestionId: `minna-i:${MINNA_SHA256}:lesson-9:pdf-p97:practice-b:1:${id}`,
            sourceLabel: 'Minna no Nihongo I - Lesson 9 - PDF 97 / printed 77 - Practice B 1',
            sourcePrompt: cue,
            answer,
        })),
        ...GENKI_PROBLEMS.map(([id, prompt, kanji, kana], index) => typedRound({
            id: `genki-${id}`,
            sourceOrder: index + 13,
            sourceQuestionId: `${GENKI_TASK_ID}:slot-${index + 1}`,
            sourceLabel: 'Genki I - Lesson 5 - workbook 6',
            sourcePrompt: prompt,
            acceptedAnswers: [kanji, kana],
        })),
    ] satisfies readonly PreferenceWorkbookRound[]);
    const model: PreferenceWorkbookModel = {
        id: 'activity:l1-l12-preference-workbook',
        kind: 'academy-preference-workbook',
        responseKind: 'mixed-source-preference-workbook',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        conceptIds: Object.freeze(rounds.map(round => round.conceptId)),
        prompt: {
            ja: 'すき・きらい・どんなの型を先に学び、Moodle、みんなの日本語、Genkiの順番で答えます。',
            en: 'Learn the preference patterns first, then answer Moodle, Minna, and Genki items in source order.',
        },
        provenance: {
            packageId: PACKAGE_ID,
            answerVisibility: 'after-attempt',
            sourceOrder: ['moodle', 'minna', 'genki'],
            moodle: {
                moduleId: MODULE_ID,
                archiveSha256: ARCHIVE_SHA256,
                documents: [
                    { payloadSha256: PREFERENCE_SHA256, member: 'Handout/Chapter 9-1_Grammar Exercise_Adjectives describing preference.pdf', pages: '1-2' },
                    { payloadSha256: DONNA_SHA256, member: 'Handout/Chapter 9-1_Grammar Exercise_Adjectives describing preference using どんな.pdf', pages: '1' },
                ],
            },
            minna: {
                sourceId: `minna-i:${MINNA_SHA256}:lesson-9:pdf-p97:practice-b:1`,
                reference: 'Minna no Nihongo I, Lesson 9',
                title: 'Minna no Nihongo 2nd Edition Shokyu I',
                author: '3A Network',
                payloadSha256: MINNA_SHA256,
                pageCount: 326,
                pdfPage: 97,
                printedPage: 77,
                exercise: 'Practice B, exercise 1',
            },
            genki: {
                taskId: GENKI_TASK_ID,
                sourceId: `japanese-genki-interactive:${GENKI_SHA256}:generateQuiz`,
                relativePath: 'lessons/lesson-5/workbook-6/index.html',
                payloadSha256: GENKI_SHA256,
                scriptSha256: GENKI_SCRIPT_SHA256,
                lineLocus: { start: 76, end: 138 },
                engine: 'Genki.generateQuiz',
                sourceType: 'fill',
            },
        },
        payload: {
            teaching: [
                teaching('moodle:5489594:6e0a3e02:p1:basic-sentence', 'Moodle - Chapter 9 preference - page 1',
                    'person は thing が すきです／きらいです',
                    'すき and きらい describe a preference. The thing preferred takes が.',
                    'すき・きらいは好みを表し、好きなもの・嫌いなものには「が」を使います。',
                    'わたしはワインがすきです。'),
                teaching('moodle:5489594:6e0a3e02:p2:answer-pattern', 'Moodle - Chapter 9 preference - page 2',
                    'はい、(とても) すきです。／いいえ、(あまり) すきじゃありません。',
                    'Choose the reply intensity named in the cue; あまり belongs with the negative reply.',
                    '手がかりの強さを答えに残します。「あまり」は否定の答えと組みます。',
                    'スポーツがすきですか。いいえ、あまりすきじゃありません。'),
                teaching('moodle:5489594:f1757ed9:p1:example', 'Moodle - Chapter 9 どんな preference - page 1',
                    'どんな category が すきですか',
                    'Use どんな to ask for a kind within a category, then answer with the specific example.',
                    '「どんな」で種類を聞き、あとで具体的な例を答えます。',
                    'どんなりょうりがすきですか。にほんりょうりがすきです。'),
            ],
            rounds,
            passScore: 1,
            feedback: {
                pass: { explanation: { ja: '22問の元資料を順番どおりに完成しました。', en: 'You completed all 22 source items in order.' } },
                lapse: {
                    explanation: { ja: '好きなものと答え方のつながりを直す問題があります。', en: 'At least one preference pattern needs repair.' },
                    repairPrompt: { ja: '表示された問題だけを直し、必要ならヒントを開きましょう。', en: 'Repair only the visible items, using a hint when needed.' },
                    nearbyExample: { ja: 'わたしはねこがだいすきです。', en: 'I really like cats.' },
                },
            },
        },
    };
    return Object.freeze(model);
}

export function createLessonTwelvePreferenceWorkbookBeat(): LessonActivityBeat {
    return Object.freeze({
        id: 'preference-workbook',
        narrative: {
            ja: 'カフェのメニューカードを並べながら、ミカとアーカーシュが何が好きかをたずねます。',
            en: 'Mika and Aakash sort cafe cards while asking what each person likes.',
        },
        activity: createLessonTwelvePreferenceWorkbookModel(),
    });
}

function moodleRound(source: MoodleProblem, sourceOrder: number): PreferenceWorkbookRound {
    const common = {
        id: `moodle-${sourceOrder}`,
        sourceOrder,
        sourceQuestionId: source.id,
        sourceLabel: source.id.includes(DONNA_SHA256)
            ? 'Moodle - Chapter 9 どんな preference - page 1'
            : 'Moodle - Chapter 9 preference - pages 1-2',
        sourcePrompt: source.cue,
        answerExpression: source.answer,
        conceptId: `concept:l1-l12:preference:${sourceOrder}`,
        errorTag: `l1-l12-preference-${sourceOrder}`,
        hint: hintFor(source.mode),
    };
    if (source.mode === 'sentence-choice') return Object.freeze({
        ...common,
        mode: source.mode,
        options: sentenceOptions(source.answer),
        correctOptionId: 'answer',
    });
    if (source.mode === 'reply-choice') return replyRound({ ...common, id: `moodle-${sourceOrder}`, answer: source.answer });
    return Object.freeze({
        ...common,
        mode: source.mode,
        options: questionOptions(),
        correctOptionId: 'answer',
    });
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
    hint?: ReturnType<typeof hintFor>;
}>): PreferenceWorkbookRound {
    return Object.freeze({
        id: input.id,
        sourceOrder: input.sourceOrder,
        sourceQuestionId: input.sourceQuestionId,
        sourceLabel: input.sourceLabel,
        sourcePrompt: input.sourcePrompt,
        answerExpression: input.answerExpression ?? input.answer,
        conceptId: input.conceptId ?? `concept:l1-l12:preference:${input.sourceOrder}`,
        errorTag: input.errorTag ?? `l1-l12-preference-${input.sourceOrder}`,
        hint: input.hint ?? hintFor('reply-choice'),
        mode: 'reply-choice',
        options: replyOptions(input.answer),
        correctOptionId: 'answer',
    });
}

function typedRound(input: Readonly<{
    id: string;
    sourceOrder: number;
    sourceQuestionId: string;
    sourceLabel: string;
    sourcePrompt: string;
    acceptedAnswers: readonly string[];
}>): PreferenceWorkbookRound {
    return Object.freeze({
        ...input,
        answerExpression: input.acceptedAnswers[0]!,
        conceptId: `concept:l1-l12:preference:${input.sourceOrder}`,
        errorTag: `l1-l12-preference-${input.sourceOrder}`,
        hint: hintFor('typed'),
        mode: 'typed',
    });
}

function teaching(sourceQuestionId: string, sourceLabel: string, pattern: string, en: string, ja: string, example: string) {
    return Object.freeze({ sourceQuestionId, sourceLabel, pattern, explanation: { en, ja }, example });
}

function hintFor(mode: PreferenceWorkbookRound['mode']) {
    const detail = mode === 'sentence-choice'
        ? { ja: '♡なら「すきです」、×なら「きらいです」です。', en: 'Use すきです for ♡ and きらいです for ×.' }
        : mode === 'question-choice'
            ? { ja: '「どんな」は名詞の前に置き、好きな種類を聞きます。', en: 'Put どんな before the category noun to ask what kind.' }
            : mode === 'typed'
                ? { ja: 'Genkiの英語の手がかりを、わたしは + ものが + 好み + ですの順で組みます。', en: 'Build the Genki sentence as I + thing が + preference + です.' }
                : { ja: 'はい／いいえと、とても／あまりが手がかりと合うか確かめます。', en: 'Check that はい/いいえ and とても/あまり match the cue.' };
    return Object.freeze([
        { ja: 'まず、好みか質問への答えかを見分けます。', en: 'First decide whether this is a preference statement or a reply.' },
        detail,
        { ja: '助詞「が」の後ろに、すき・きらいの形を置きます。', en: 'Place the すき or きらい form after the が phrase.' },
    ] as const);
}

function sentenceOptions(answer: string) {
    const likes = answer.includes('すきです');
    return Object.freeze([
        option('answer', likes ? 'が + すきです' : 'が + きらいです'),
        option('wa', likes ? 'は + すきです' : 'は + きらいです'),
        option('polarity', likes ? 'が + きらいです' : 'が + すきです'),
    ]);
}

function replyOptions(answer: string) {
    const correct = answer.includes('とても') ? 'yes-very'
        : answer.includes('あまり') ? 'no-not-much'
            : answer.startsWith('はい') ? 'yes-plain' : 'no-plain';
    return Object.freeze([
        option('answer', replyLabel(correct)),
        ...['yes-plain', 'no-plain', 'yes-very', 'no-not-much']
            .filter(id => id !== correct)
            .map(id => option(id, replyLabel(id))),
    ]);
}

function questionOptions() {
    return Object.freeze([
        option('answer', 'どんな + が + すきですか'),
        option('what', 'なに + が + すきですか'),
        option('topic', 'どんな + は + すきですか'),
    ]);
}

function replyLabel(id: string): string {
    switch (id) {
        case 'yes-plain': return 'はい / ふつう';
        case 'no-plain': return 'いいえ / ふつう';
        case 'yes-very': return 'はい / とても';
        case 'no-not-much': return 'いいえ / あまり';
        default: throw new TypeError(`Unknown preference reply state: ${id}`);
    }
}

function option(id: string, label: string) {
    return Object.freeze({ id, label });
}

function problem(id: string, cue: string, answer: string, mode: MoodleProblem['mode']): MoodleProblem {
    return Object.freeze({ id, cue, answer, mode });
}

function assertExactPackageSources(): void {
    const root = record(lessonPackage, 'l1-l12 package');
    const identity = record(root.identity, 'l1-l12 identity');
    if (root.id !== PACKAGE_ID || identity.moduleId !== MODULE_ID) throw new TypeError('Unexpected l1-l12 package identity.');
    const found = exactExercises(root);
    if (found.length !== MOODLE_PROBLEMS.length) throw new TypeError('Expected all eight exact l1-l12 Moodle exercises.');
    found.forEach((item, index) => {
        const expected = MOODLE_PROBLEMS[index]!;
        const answer = record(item.answer, `l1-l12 Moodle answer ${index + 1}`);
        if (item.sourceQuestionId !== expected.id || item.sourceCueExact !== expected.cue || answer.primary !== expected.answer) {
            throw new TypeError(`Unexpected l1-l12 Moodle source item at order ${index + 1}.`);
        }
    });
    const activities = array(root.genkiInteractiveActivities, 'l1-l12 Genki activities');
    const activity = record(activities[0], 'l1-l12 Genki activity');
    const source = record(activity.source, 'l1-l12 Genki source');
    const locus = record(source.lineLocus, 'l1-l12 Genki locus');
    const task = record(activity.exactTask, 'l1-l12 Genki task');
    const config = record(task.config, 'l1-l12 Genki config');
    const quizlet = requiredText(config.quizlet, 'l1-l12 Genki quizlet');
    if (activities.length !== 1 || activity.id !== GENKI_TASK_ID || source.payloadSha256 !== GENKI_SHA256
        || source.scriptSha256 !== GENKI_SCRIPT_SHA256 || locus.start !== 76 || locus.end !== 138
        || task.engine !== 'Genki.generateQuiz' || config.type !== 'fill') {
        throw new TypeError('Unexpected l1-l12 Genki task identity.');
    }
    let cursor = -1;
    GENKI_PROBLEMS.forEach(([, prompt, kanji, kana]) => {
        const position = quizlet.indexOf(prompt, cursor + 1);
        if (position <= cursor || !quizlet.includes(kanji) || !quizlet.includes(kana)) {
            throw new TypeError('The exact l1-l12 Genki prompt, answer, or order changed.');
        }
        cursor = position;
    });
}

function exactExercises(root: Record<string, unknown>): Record<string, unknown>[] {
    const found: Record<string, unknown>[] = [];
    for (const componentValue of array(root.components, 'l1-l12 components')) {
        const component = record(componentValue, 'l1-l12 component');
        for (const exerciseValue of arrayOrEmpty(component.exercises)) {
            const exercise = record(exerciseValue, 'l1-l12 exercise');
            if (typeof exercise.sourceQuestionId === 'string'
                && MOODLE_PROBLEMS.some(problem => problem.id === exercise.sourceQuestionId)) found.push(exercise);
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
