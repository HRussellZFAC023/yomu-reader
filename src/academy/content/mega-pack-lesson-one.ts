import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../domain/activity-runtime';
import type { SentenceBuilderModel, SentenceBuilderToken } from '../minigames/sentence-builder';
import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

const SOURCE = Object.freeze({
    sourceId: 'japanese-genki-interactive:b909643450ead83af08d8dd22f717f9d320b165e5accf790514a31212d155451:generateQuiz',
    relativePath: 'lessons/lesson-1/workbook-5/index.html',
    payloadSha256: 'b909643450ead83af08d8dd22f717f9d320b165e5accf790514a31212d155451',
    rights: 'permitted-mit' as const,
    reuse: 'verbatim-rendered-quiz-prompt-and-answer' as const,
});

const MAPPING = Object.freeze({
    academyWeek: 'l1-l01',
    moodleModuleId: 5777762,
    curriculum: Object.freeze(['Genki I lesson 1', 'Minna no Nihongo I lesson 1', 'UCL Level 1 lesson 1']),
    skills: Object.freeze(['grammar', 'reading', 'sentence-construction']),
    jlpt: 'N5',
});

export function createMegaPackLessonOneBeats(): readonly LessonActivityBeat[] {
    return Object.freeze([
        sentenceBeat({
            id: 'ogawa-japanese',
            prompt: 'Ms. Ogawa is Japanese.',
            sourceSentence: 'おがわさんはにほんじんです。',
            lineLocus: { start: 83, end: 84 },
            tokens: shuffledTokens('ogawa', ['にほんじん', 'です', 'おがわさん', '。', 'は']),
            correctOrder: ['ogawa-3', 'ogawa-5', 'ogawa-1', 'ogawa-2', 'ogawa-4'],
            conceptId: 'concept:l1-l01:n-wa-n-desu-nationality',
            meaning: 'Ms. Ogawa is Japanese.',
            narrative: {
                ja: 'りえ先生が最初の名札を置きます。英語の意味を読み、ことばを一回ずつ使って文を作ります。',
                en: 'Rie places the first name card. Read its meaning, then use each tile once to build the sentence.',
            },
        }),
        sentenceBeat({
            id: 'takeda-teacher',
            prompt: 'Mr. Takeda is a teacher.',
            sourceSentence: 'たけださんはせんせいです。',
            lineLocus: { start: 88, end: 89 },
            tokens: shuffledTokens('takeda', ['せんせい', '。', 'は', 'たけださん', 'です']),
            correctOrder: ['takeda-4', 'takeda-3', 'takeda-1', 'takeda-5', 'takeda-2'],
            conceptId: 'concept:l1-l01:n-wa-n-desu-occupation',
            meaning: 'Mr. Takeda is a teacher.',
            narrative: {
                ja: '二枚目の名札も同じ型です。名前と仕事の間に、話題を示す「は」を置きます。',
                en: 'The second card uses the same frame. Put topic は between the name and occupation.',
            },
        }),
    ]);
}

interface SentenceBeatInput {
    readonly id: string;
    readonly prompt: string;
    readonly sourceSentence: string;
    readonly lineLocus: Readonly<{ start: number; end: number }>;
    readonly tokens: readonly SentenceBuilderToken[];
    readonly correctOrder: readonly string[];
    readonly conceptId: string;
    readonly meaning: string;
    readonly narrative: LessonActivityBeat['narrative'];
}

function sentenceBeat(input: SentenceBeatInput): LessonActivityBeat {
    const activity: SentenceBuilderModel = {
        id: `activity:l1-l01-genki-${input.id}`,
        kind: 'academy-sentence-builder',
        sourceQuestionId: `genki-2e:l1-l01:workbook-5:${input.id}`,
        conceptIds: [input.conceptId],
        responseKind: 'tapped-token-order',
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        prompt: {
            ja: 'ことばを並べて、文を作ってください。',
            en: input.prompt,
        },
        payload: {
            tokens: input.tokens,
            correctOrder: input.correctOrder,
            sourceSentence: input.sourceSentence,
            source: { ...SOURCE, lineLocus: input.lineLocus },
            mapping: MAPPING,
            errorTag: `genki-l1-word-order-${input.id}`,
            feedback: {
                pass: {
                    explanation: { ja: `${input.sourceSentence} 正しい語順です。`, en: `${input.sourceSentence} The sentence order is correct.` },
                },
                lapse: {
                    explanation: { ja: '名詞・は・名詞・ですの順を確認しましょう。', en: 'Check the noun + は + noun + です frame.' },
                    repairPrompt: { ja: '最初に人の名前を置き、そのあとに「は」を置きます。', en: 'Start with the person’s name, then place は.' },
                    nearbyExample: { ja: input.sourceSentence, en: input.meaning },
                },
            },
            reviewTargets: [{
                id: `review:l1-l01:genki-${input.id}`,
                conceptId: input.conceptId,
                expression: input.sourceSentence,
                meanings: [input.meaning],
                sentence: input.sourceSentence,
            }],
        },
    };
    return Object.freeze({
        id: `genki-${input.id}`,
        narrative: input.narrative,
        activity: Object.freeze(activity),
    });
}

function shuffledTokens(prefix: string, labels: readonly string[]): readonly SentenceBuilderToken[] {
    return Object.freeze(labels.map((label, index) => Object.freeze({ id: `${prefix}-${index + 1}`, label })));
}
