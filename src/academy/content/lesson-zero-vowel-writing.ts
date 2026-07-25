import type { KanjiStrokeAssessment } from '../../reader/kanji/stroke-grader';
import type { KanjiVGStrokeShape } from '../../reader/kanji/vg';
import type { ActivityEvaluation, ReviewSeed } from '../domain/activity-runtime';
import {
    LESSON_ZERO_KANA_SEQUENCE,
    LESSON_ZERO_SOURCE_MEDIA,
    LESSON_ZERO_SOURCE_PROVENANCE,
} from './lesson-zero-source-material';

export const LESSON_ZERO_VOWEL_WRITING_ID = 'activity:lesson-zero-vowel-doodle' as const;
const LESSON_ZERO_VOWEL_WRITING_SOURCE_QUESTION_ID = 'source-question:classroom-phrase-07' as const;

export type LessonZeroVowelWritingItemId = typeof LESSON_ZERO_KANA_SEQUENCE[number]['id'];

type Localized = Readonly<{ en: string; ja: string }>;

export interface LessonZeroVowelWritingPlan {
    readonly id: string;
    readonly label: Localized;
}

export interface LessonZeroVowelWritingItem {
    readonly id: LessonZeroVowelWritingItemId;
    readonly kana: string;
    readonly romaji: string;
    readonly strokeCount: number;
    readonly strokeShapes: readonly KanjiVGStrokeShape[];
    readonly memoryCue: Localized;
    readonly directionCue: Localized;
    readonly plans: readonly LessonZeroVowelWritingPlan[];
    readonly correctPlanId: string;
}

export interface LessonZeroVowelWritingDefinition {
    readonly id: typeof LESSON_ZERO_VOWEL_WRITING_ID;
    readonly sourceQuestionId: typeof LESSON_ZERO_VOWEL_WRITING_SOURCE_QUESTION_ID;
    readonly conceptIds: readonly ['concept:hiragana-vowel-row', 'concept:hiragana-katakana-kanji-roles'];
    readonly items: readonly LessonZeroVowelWritingItem[];
    readonly source: Readonly<{
        runtimeUrl: string;
        sha256: string;
        answerGate: 'after-first-attempt';
        storySceneId: 'scene:blank-atlas:sound-script-map';
    }>;
}

export type LessonZeroVowelWritingResponse =
    | Readonly<{ mode: 'draw'; assessment: KanjiStrokeAssessment }>
    | Readonly<{ mode: 'plan'; selectedPlanId: string }>;

const STROKE_SHAPES: Readonly<Record<LessonZeroVowelWritingItemId, readonly KanjiVGStrokeShape[]>> = {
    'hira-a': [
        [{ x: 0.18, y: 0.28 }, { x: 0.42, y: 0.25 }, { x: 0.70, y: 0.24 }],
        [{ x: 0.49, y: 0.10 }, { x: 0.48, y: 0.35 }, { x: 0.46, y: 0.61 }, { x: 0.35, y: 0.82 }],
        [{ x: 0.69, y: 0.36 }, { x: 0.82, y: 0.52 }, { x: 0.76, y: 0.72 }, { x: 0.56, y: 0.87 }, { x: 0.31, y: 0.84 }, { x: 0.20, y: 0.66 }, { x: 0.28, y: 0.48 }, { x: 0.53, y: 0.38 }, { x: 0.68, y: 0.53 }],
    ],
    'hira-i': [
        [{ x: 0.35, y: 0.16 }, { x: 0.31, y: 0.37 }, { x: 0.28, y: 0.61 }, { x: 0.35, y: 0.76 }, { x: 0.43, y: 0.67 }],
        [{ x: 0.66, y: 0.23 }, { x: 0.70, y: 0.39 }, { x: 0.74, y: 0.61 }],
    ],
    'hira-u': [
        [{ x: 0.39, y: 0.17 }, { x: 0.50, y: 0.19 }, { x: 0.61, y: 0.23 }],
        [{ x: 0.27, y: 0.41 }, { x: 0.48, y: 0.36 }, { x: 0.67, y: 0.38 }, { x: 0.78, y: 0.50 }, { x: 0.73, y: 0.67 }, { x: 0.60, y: 0.80 }, { x: 0.42, y: 0.87 }],
    ],
    'hira-e': [
        [{ x: 0.37, y: 0.17 }, { x: 0.48, y: 0.20 }, { x: 0.60, y: 0.24 }],
        [{ x: 0.21, y: 0.44 }, { x: 0.42, y: 0.41 }, { x: 0.65, y: 0.41 }, { x: 0.51, y: 0.55 }, { x: 0.37, y: 0.72 }, { x: 0.34, y: 0.84 }, { x: 0.45, y: 0.78 }, { x: 0.56, y: 0.71 }, { x: 0.64, y: 0.78 }, { x: 0.77, y: 0.84 }],
    ],
    'hira-o': [
        [{ x: 0.16, y: 0.34 }, { x: 0.39, y: 0.32 }, { x: 0.64, y: 0.31 }],
        [{ x: 0.43, y: 0.12 }, { x: 0.42, y: 0.35 }, { x: 0.41, y: 0.61 }, { x: 0.37, y: 0.77 }, { x: 0.27, y: 0.82 }, { x: 0.21, y: 0.72 }],
        [{ x: 0.72, y: 0.28 }, { x: 0.79, y: 0.34 }, { x: 0.84, y: 0.42 }],
    ],
};

const ITEM_COPY: Readonly<Record<LessonZeroVowelWritingItemId, Readonly<{
    memoryCue: Localized;
    directionCue: Localized;
    correct: Localized;
    reverse: Localized;
    joined: Localized;
}>>> = {
    'hira-a': {
        memoryCue: { en: 'A crossbar, a spine, then a curve that comes back to meet them.', ja: '横線、たての線、最後に戻ってくる曲線です。' },
        directionCue: { en: 'Across, down, then around.', ja: '横、下、そして回ります。' },
        correct: { en: '3 strokes · across, down, around', ja: '3画・横、下、回る' },
        reverse: { en: '3 strokes · around, up, across', ja: '3画・回る、上、横' },
        joined: { en: '1 stroke · one continuous loop', ja: '1画・一つの輪で続ける' },
    },
    'hira-i': {
        memoryCue: { en: 'Two separate marks lean down. The left one bends first.', ja: '二本を離して下へ。左の線が先に曲がります。' },
        directionCue: { en: 'Left down, then right down.', ja: '左を下へ、次に右を下へ。' },
        correct: { en: '2 strokes · left down, right down', ja: '2画・左を下、右を下' },
        reverse: { en: '2 strokes · right up, left up', ja: '2画・右を上、左を上' },
        joined: { en: '1 stroke · join both sides', ja: '1画・左右をつなぐ' },
    },
    'hira-u': {
        memoryCue: { en: 'A small cap sits above one long curve.', ja: '小さな線の下に、長い曲線があります。' },
        directionCue: { en: 'Small mark first, long curve second.', ja: '小さな線が先、長い曲線が次です。' },
        correct: { en: '2 strokes · small mark, long curve', ja: '2画・小さな線、長い曲線' },
        reverse: { en: '2 strokes · long curve, small mark', ja: '2画・長い曲線、小さな線' },
        joined: { en: '3 strokes · split the curve in two', ja: '3画・曲線を二つに分ける' },
    },
    'hira-e': {
        memoryCue: { en: 'A small cap, then one line that changes direction without lifting.', ja: '小さな線のあと、方向を変えながら一筆で進みます。' },
        directionCue: { en: 'Small mark first, turning line second.', ja: '小さな線が先、曲がる線が次です。' },
        correct: { en: '2 strokes · small mark, turning line', ja: '2画・小さな線、曲がる線' },
        reverse: { en: '2 strokes · turning line, small mark', ja: '2画・曲がる線、小さな線' },
        joined: { en: '4 strokes · lift at every turn', ja: '4画・曲がるたびに離す' },
    },
    'hira-o': {
        memoryCue: { en: 'A crossbar and hooked spine, then the small mark on the right.', ja: '横線と曲がるたて線、最後に右の小さな線です。' },
        directionCue: { en: 'Across, down and hook, then the right mark.', ja: '横、下へ曲がる、右の小さな線。' },
        correct: { en: '3 strokes · across, down and hook, right mark', ja: '3画・横、下へ曲がる、右の線' },
        reverse: { en: '3 strokes · right mark, up, across', ja: '3画・右の線、上、横' },
        joined: { en: '2 strokes · join the crossbar and spine', ja: '2画・横線とたて線をつなぐ' },
    },
};

export function createLessonZeroVowelWritingDefinition(): LessonZeroVowelWritingDefinition {
    const items = LESSON_ZERO_KANA_SEQUENCE.map(source => {
        const copy = ITEM_COPY[source.id];
        const correctPlanId = `plan:${source.id}:correct`;
        return Object.freeze({
            ...source,
            strokeShapes: STROKE_SHAPES[source.id],
            memoryCue: copy.memoryCue,
            directionCue: copy.directionCue,
            correctPlanId,
            plans: Object.freeze([
                Object.freeze({ id: correctPlanId, label: copy.correct }),
                Object.freeze({ id: `plan:${source.id}:reverse`, label: copy.reverse }),
                Object.freeze({ id: `plan:${source.id}:joined`, label: copy.joined }),
            ]),
        });
    });
    return Object.freeze({
        id: LESSON_ZERO_VOWEL_WRITING_ID,
        sourceQuestionId: LESSON_ZERO_VOWEL_WRITING_SOURCE_QUESTION_ID,
        conceptIds: Object.freeze(['concept:hiragana-vowel-row', 'concept:hiragana-katakana-kanji-roles']) as LessonZeroVowelWritingDefinition['conceptIds'],
        items: Object.freeze(items),
        source: Object.freeze({
            runtimeUrl: LESSON_ZERO_SOURCE_MEDIA.hiraganaARow,
            sha256: LESSON_ZERO_SOURCE_PROVENANCE.hiraganaARowSha256,
            answerGate: 'after-first-attempt',
            storySceneId: 'scene:blank-atlas:sound-script-map',
        }),
    });
}

export function lessonZeroVowelWritingChildActivityId(itemId: LessonZeroVowelWritingItemId): string {
    return `${LESSON_ZERO_VOWEL_WRITING_ID}:${itemId}`;
}

export const LESSON_ZERO_VOWEL_WRITING_CHILD_ACTIVITY_IDS = Object.freeze(
    LESSON_ZERO_KANA_SEQUENCE.map(item => lessonZeroVowelWritingChildActivityId(item.id)),
);

export function evaluateLessonZeroVowelWriting(
    definition: LessonZeroVowelWritingDefinition,
    item: LessonZeroVowelWritingItem,
    response: LessonZeroVowelWritingResponse,
): ActivityEvaluation {
    const draw = response.mode === 'draw';
    const passed = draw ? response.assessment.passed : response.selectedPlanId === item.correctPlanId;
    const score = draw ? clamp(response.assessment.score / 100) : passed ? 1 : 0;
    const responseKind = draw ? 'kana-doodle' : 'kana-stroke-plan';
    const resultErrorTags = passed
        ? [`vowel-writing-${item.romaji}`, draw ? 'vowel-writing-draw' : 'vowel-writing-plan']
        : [
            `vowel-writing-${item.romaji}`,
            draw && response.assessment.actualStrokes !== response.assessment.expectedStrokes
                ? 'vowel-writing-stroke-count'
                : 'vowel-writing-order-or-direction',
        ];
    return {
        result: passed ? {
            outcome: 'pass',
            score,
            errorTags: resultErrorTags,
            feedback: {
                explanation: {
                    en: `${item.kana} is holding together. Keep that stroke plan for the next time you meet it.`,
                    ja: `${item.kana}の形がまとまりました。次に会うときも、この書き順を残しましょう。`,
                },
            },
        } : {
            outcome: 'lapse',
            score,
            errorTags: resultErrorTags,
            feedback: {
                explanation: {
                    en: `Keep ${item.kana}; only its stroke plan needs another look.`,
                    ja: `${item.kana}はそのまま。書き順だけ、もう一度見ましょう。`,
                },
                repairPrompt: item.directionCue,
                nearbyExample: item.memoryCue,
            },
        },
        attempt: {
            kind: 'attempt-recorded',
            activityId: lessonZeroVowelWritingChildActivityId(item.id),
            sourceQuestionId: definition.sourceQuestionId,
            conceptIds: ['concept:hiragana-vowel-row'],
            responseKind,
            outcome: passed ? 'pass' : 'lapse',
            score,
            errorTags: resultErrorTags,
        },
        reviewSeeds: [reviewSeed(definition, item, passed ? 'new-learning' : 'repair')],
    };
}

export function lessonZeroVowelWritingCompletionEvaluation(
    definition: LessonZeroVowelWritingDefinition,
    score: number,
): ActivityEvaluation {
    return {
        result: {
            outcome: 'pass',
            score: clamp(score),
            errorTags: ['vowel-writing-complete', 'vowel-writing-five-kana'],
            feedback: {
                explanation: {
                    en: 'All five vowel kana now have a sound, a shape, and a stroke plan.',
                    ja: '五つの母音に、音・形・書き順がそろいました。',
                },
            },
        },
        attempt: {
            kind: 'attempt-recorded',
            activityId: definition.id,
            sourceQuestionId: definition.sourceQuestionId,
            conceptIds: definition.conceptIds,
            responseKind: 'stroke-attempts',
            outcome: 'pass',
            score: clamp(score),
            errorTags: ['vowel-writing-complete', 'vowel-writing-five-kana'],
        },
        reviewSeeds: [],
    };
}

function reviewSeed(
    definition: LessonZeroVowelWritingDefinition,
    item: LessonZeroVowelWritingItem,
    reason: ReviewSeed['reason'],
): ReviewSeed {
    return {
        id: `review:lesson-zero:vowel-writing:${item.id}`,
        conceptId: 'concept:hiragana-vowel-row',
        reason,
        sourceQuestionId: definition.sourceQuestionId,
        content: {
            expression: item.kana,
            reading: item.kana,
            meanings: [`hiragana vowel ${item.romaji}`],
        },
    };
}

function clamp(value: number): number {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
