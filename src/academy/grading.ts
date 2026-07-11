/**
 * Deterministic grading for Academy exercises. Call this only with a settled
 * value from the UI: IME composition and input events intentionally stay out
 * of this pure module.
 */

export type WhitespacePolicy = 'collapse' | 'ignore';
export type PunctuationPolicy = 'canonicalize' | 'ignore';

export interface AnswerNormalizationOptions {
    /** Collapse runs and trim the answer, or remove whitespace entirely. */
    readonly whitespace?: WhitespacePolicy;
    /** Canonicalize common Japanese/Western punctuation, or remove it. */
    readonly punctuation?: PunctuationPolicy;
}

/**
 * A primary accepted form plus forms explicitly authored as equivalents.
 * Kana/kanji and other script alternatives are never inferred by the grader.
 */
export interface DeclaredTextAnswer {
    readonly primary: string;
    readonly alternatives?: readonly string[];
}

export interface ExactExercise {
    readonly kind: 'exact';
    readonly answer: DeclaredTextAnswer;
    readonly normalization?: AnswerNormalizationOptions;
}

export interface ChoiceExercise {
    readonly kind: 'choice';
    readonly correctOptionId: string;
}

export interface MultiChoiceExercise {
    readonly kind: 'multi-choice';
    readonly correctOptionIds: readonly string[];
}

export interface OrderExercise {
    readonly kind: 'order';
    readonly correctOrder: readonly string[];
}

export interface ClozeBlank {
    readonly id: string;
    readonly answer: DeclaredTextAnswer;
}

export interface ClozeExercise {
    readonly kind: 'cloze';
    readonly blanks: readonly ClozeBlank[];
    readonly normalization?: AnswerNormalizationOptions;
}

export type TargetPatternMode = 'includes' | 'exact' | 'regex';

/**
 * A deterministic signal to surface during writing review. It is deliberately
 * not an answer key: its result never changes an open-writing auto grade.
 */
export interface TargetPattern {
    readonly id: string;
    readonly pattern: string;
    readonly mode?: TargetPatternMode;
    readonly flags?: string;
}

/** A criterion that needs learner or teacher review rather than auto-scoring. */
export interface WritingRubric {
    readonly id: string;
    readonly criterion: string;
}

export interface OpenWritingExercise {
    readonly kind: 'open-writing';
    readonly targetPatterns?: readonly TargetPattern[];
    readonly rubrics?: readonly WritingRubric[];
    readonly normalization?: AnswerNormalizationOptions;
}

export type GradingExercise =
    | ExactExercise
    | ChoiceExercise
    | MultiChoiceExercise
    | OrderExercise
    | ClozeExercise
    | OpenWritingExercise;

export type ChoiceLearnerInput = string | null;
export type MultiChoiceLearnerInput = readonly string[];
export type OrderLearnerInput = readonly string[];
export type ClozeLearnerInput = Readonly<Record<string, string>>;
export type LearnerInput = string | ChoiceLearnerInput | MultiChoiceLearnerInput | OrderLearnerInput | ClozeLearnerInput;

export type AutoGradeExplanation =
    | 'accepted-answer'
    | 'answer-not-accepted'
    | 'missing-answer'
    | 'correct-choice'
    | 'incorrect-choice'
    | 'no-choice-selected'
    | 'correct-multiple-choice'
    | 'multiple-choice-mismatch'
    | 'correct-order'
    | 'order-mismatch'
    | 'all-cloze-answers-accepted'
    | 'cloze-answer-mismatch';

export interface TextMismatch {
    readonly code: 'answer-not-accepted' | 'missing-answer';
    readonly accepted: readonly string[];
}

export interface ChoiceMismatch {
    readonly code: 'incorrect-choice' | 'no-choice-selected';
    readonly expected: string;
    readonly received: ChoiceLearnerInput;
}

export interface MultiChoiceMismatch {
    readonly code: 'multiple-choice-mismatch';
    readonly missing: readonly string[];
    readonly unexpected: readonly string[];
    readonly duplicateSelections: readonly string[];
}

export interface OrderMismatch {
    readonly code: 'order-mismatch';
    readonly firstDifferentIndex: number;
    readonly expected: string | undefined;
    readonly received: string | undefined;
    readonly missing: readonly string[];
    readonly unexpected: readonly string[];
}

export interface ClozeMismatch {
    readonly code: 'cloze-answer-mismatch';
    readonly blankIds: readonly string[];
}

export type GradingMismatch = TextMismatch | ChoiceMismatch | MultiChoiceMismatch | OrderMismatch | ClozeMismatch;

export interface AutoGradedResult {
    readonly status: 'graded';
    readonly correct: boolean;
    readonly explanation: AutoGradeExplanation;
    readonly mismatch?: GradingMismatch;
}

export interface ManualReviewResult {
    readonly status: 'not-graded';
    readonly explanation: 'open-writing-requires-review';
}

export type AutoGradeResult = AutoGradedResult | ManualReviewResult;

export interface ExactGradingResult {
    readonly kind: 'exact';
    readonly learnerInput: string;
    readonly normalizedInput: string;
    readonly autoGrade: AutoGradedResult;
}

export interface ChoiceGradingResult {
    readonly kind: 'choice';
    readonly learnerInput: ChoiceLearnerInput;
    readonly autoGrade: AutoGradedResult;
}

export interface MultiChoiceGradingResult {
    readonly kind: 'multi-choice';
    readonly learnerInput: readonly string[];
    readonly autoGrade: AutoGradedResult;
}

export interface OrderGradingResult {
    readonly kind: 'order';
    readonly learnerInput: readonly string[];
    readonly autoGrade: AutoGradedResult;
}

export interface ClozeBlankGradingResult {
    readonly id: string;
    readonly learnerInput: string | undefined;
    readonly normalizedInput: string | undefined;
    readonly autoGrade: AutoGradedResult;
}

export interface ClozeGradingResult {
    readonly kind: 'cloze';
    readonly learnerInput: ClozeLearnerInput;
    readonly blanks: readonly ClozeBlankGradingResult[];
    readonly autoGrade: AutoGradedResult;
}

export interface MatchedTargetPatternResult {
    readonly id: string;
    readonly mode: TargetPatternMode;
    readonly status: 'matched' | 'not-matched';
    readonly explanation: 'target-pattern-matched' | 'target-pattern-not-matched';
}

export interface InvalidTargetPatternResult {
    readonly id: string;
    readonly mode: 'regex';
    readonly status: 'invalid';
    readonly explanation: 'invalid-target-pattern';
}

export type TargetPatternCheckResult = MatchedTargetPatternResult | InvalidTargetPatternResult;

export interface RubricCheckResult {
    readonly id: string;
    readonly criterion: string;
    readonly status: 'review-required';
}

export interface WritingChecks {
    readonly targetPatterns: readonly TargetPatternCheckResult[];
    readonly rubrics: readonly RubricCheckResult[];
}

export interface OpenWritingGradingResult {
    readonly kind: 'open-writing';
    readonly learnerInput: string;
    readonly normalizedInput: string;
    readonly autoGrade: ManualReviewResult;
    readonly writingChecks: WritingChecks;
}

export type GradingResult =
    | ExactGradingResult
    | ChoiceGradingResult
    | MultiChoiceGradingResult
    | OrderGradingResult
    | ClozeGradingResult
    | OpenWritingGradingResult;

const PUNCTUATION_EQUIVALENTS: Readonly<Record<string, string>> = {
    '、': ',',
    '，': ',',
    '､': ',',
    '﹐': ',',
    '。': '.',
    '．': '.',
    '｡': '.',
    '！': '!',
    '？': '?',
    '：': ':',
    '；': ';',
    '・': '·',
    '･': '·',
    '…': '...',
    '“': '"',
    '”': '"',
    '„': '"',
    '‟': '"',
    '「': '"',
    '」': '"',
    '『': '"',
    '』': '"',
    '‘': "'",
    '’': "'",
    '‚': "'",
    '‛': "'",
    '‐': '-',
    '‑': '-',
    '‒': '-',
    '–': '-',
    '—': '-',
    '―': '-',
};

const PUNCTUATION_RE = /[、，､﹐。．｡！？：；・･…“”„‟「」『』‘’‚‛‐‑‒–—―]/g;
const NORMALIZED_PUNCTUATION_RE = /[,.;:!?"'·-]/g;
const PUNCTUATION_SPACING_RE = /\s*([,.;:!?"'·-])\s*/g;
const WHITESPACE_RE = /\s+/g;

/**
 * Produces the comparison form used for text answers and writing signals.
 * NFKC handles width and compatibility forms; kana/kanji equivalence remains
 * an explicit content-author decision through `DeclaredTextAnswer`.
 */
export function normalizeAnswer(input: string, options: AnswerNormalizationOptions = {}): string {
    const punctuation = options.punctuation ?? 'canonicalize';
    const whitespace = options.whitespace ?? 'collapse';
    let normalized = input.normalize('NFKC').replace(PUNCTUATION_RE, character => PUNCTUATION_EQUIVALENTS[character] ?? character);

    if (punctuation === 'ignore') normalized = normalized.replace(NORMALIZED_PUNCTUATION_RE, '');

    normalized = whitespace === 'ignore'
        ? normalized.replace(WHITESPACE_RE, '')
        : normalized.trim().replace(WHITESPACE_RE, ' ');

    return punctuation === 'canonicalize'
        ? normalized.replace(PUNCTUATION_SPACING_RE, '$1')
        : normalized;
}

export function gradeAnswer(exercise: ExactExercise, learnerInput: string): ExactGradingResult;
export function gradeAnswer(exercise: ChoiceExercise, learnerInput: ChoiceLearnerInput): ChoiceGradingResult;
export function gradeAnswer(exercise: MultiChoiceExercise, learnerInput: MultiChoiceLearnerInput): MultiChoiceGradingResult;
export function gradeAnswer(exercise: OrderExercise, learnerInput: OrderLearnerInput): OrderGradingResult;
export function gradeAnswer(exercise: ClozeExercise, learnerInput: ClozeLearnerInput): ClozeGradingResult;
export function gradeAnswer(exercise: OpenWritingExercise, learnerInput: string): OpenWritingGradingResult;
export function gradeAnswer(exercise: GradingExercise, learnerInput: LearnerInput): GradingResult;
export function gradeAnswer(exercise: GradingExercise, learnerInput: LearnerInput): GradingResult {
    switch (exercise.kind) {
        case 'exact':
            return gradeExact(exercise, learnerInput as string);
        case 'choice':
            return gradeChoice(exercise, learnerInput as ChoiceLearnerInput);
        case 'multi-choice':
            return gradeMultiChoice(exercise, learnerInput as MultiChoiceLearnerInput);
        case 'order':
            return gradeOrder(exercise, learnerInput as OrderLearnerInput);
        case 'cloze':
            return gradeCloze(exercise, learnerInput as ClozeLearnerInput);
        case 'open-writing':
            return gradeOpenWriting(exercise, learnerInput as string);
    }
}

function gradeExact(exercise: ExactExercise, learnerInput: string): ExactGradingResult {
    const normalizedInput = normalizeAnswer(learnerInput, exercise.normalization);
    return {
        kind: 'exact',
        learnerInput,
        normalizedInput,
        autoGrade: gradeTextAnswer(exercise.answer, learnerInput, exercise.normalization),
    };
}

function gradeChoice(exercise: ChoiceExercise, learnerInput: ChoiceLearnerInput): ChoiceGradingResult {
    const correct = learnerInput === exercise.correctOptionId;
    const mismatch: ChoiceMismatch | undefined = correct
        ? undefined
        : learnerInput === null
            ? {
                code: 'no-choice-selected',
                expected: exercise.correctOptionId,
                received: learnerInput,
            }
            : {
                code: 'incorrect-choice',
                expected: exercise.correctOptionId,
                received: learnerInput,
            };

    return {
        kind: 'choice',
        learnerInput,
        autoGrade: correct
            ? graded(true, 'correct-choice')
            : graded(false, learnerInput === null ? 'no-choice-selected' : 'incorrect-choice', mismatch),
    };
}

function gradeMultiChoice(exercise: MultiChoiceExercise, learnerInput: MultiChoiceLearnerInput): MultiChoiceGradingResult {
    const expected = uniqueValues(exercise.correctOptionIds);
    const selected = uniqueValues(learnerInput);
    const missing = expected.filter(optionId => !selected.includes(optionId));
    const unexpected = selected.filter(optionId => !expected.includes(optionId));
    const duplicateSelections = duplicateValues(learnerInput);
    const correct = missing.length === 0 && unexpected.length === 0 && duplicateSelections.length === 0;

    return {
        kind: 'multi-choice',
        learnerInput: [...learnerInput],
        autoGrade: correct
            ? graded(true, 'correct-multiple-choice')
            : graded(false, 'multiple-choice-mismatch', {
                code: 'multiple-choice-mismatch',
                missing,
                unexpected,
                duplicateSelections,
            }),
    };
}

function gradeOrder(exercise: OrderExercise, learnerInput: OrderLearnerInput): OrderGradingResult {
    const expected = [...exercise.correctOrder];
    const received = [...learnerInput];
    const correct = sameOrder(expected, received);

    return {
        kind: 'order',
        learnerInput: received,
        autoGrade: correct
            ? graded(true, 'correct-order')
            : graded(false, 'order-mismatch', orderMismatch(expected, received)),
    };
}

function gradeCloze(exercise: ClozeExercise, learnerInput: ClozeLearnerInput): ClozeGradingResult {
    const blanks = exercise.blanks.map(blank => {
        const input = ownValue(learnerInput, blank.id);
        return {
            id: blank.id,
            learnerInput: input,
            normalizedInput: input === undefined ? undefined : normalizeAnswer(input, exercise.normalization),
            autoGrade: gradeTextAnswer(blank.answer, input, exercise.normalization),
        };
    });
    const incorrectBlankIds = blanks
        .filter(blank => !blank.autoGrade.correct)
        .map(blank => blank.id);
    const correct = incorrectBlankIds.length === 0;

    return {
        kind: 'cloze',
        learnerInput: { ...learnerInput },
        blanks,
        autoGrade: correct
            ? graded(true, 'all-cloze-answers-accepted')
            : graded(false, 'cloze-answer-mismatch', {
                code: 'cloze-answer-mismatch',
                blankIds: incorrectBlankIds,
            }),
    };
}

function gradeOpenWriting(exercise: OpenWritingExercise, learnerInput: string): OpenWritingGradingResult {
    const normalizedInput = normalizeAnswer(learnerInput, exercise.normalization);
    return {
        kind: 'open-writing',
        learnerInput,
        normalizedInput,
        autoGrade: {
            status: 'not-graded',
            explanation: 'open-writing-requires-review',
        },
        writingChecks: {
            targetPatterns: (exercise.targetPatterns ?? []).map(pattern => checkTargetPattern(pattern, normalizedInput, exercise.normalization)),
            rubrics: (exercise.rubrics ?? []).map(rubric => ({
                id: rubric.id,
                criterion: rubric.criterion,
                status: 'review-required',
            })),
        },
    };
}

function gradeTextAnswer(
    answer: DeclaredTextAnswer,
    learnerInput: string | undefined,
    normalization: AnswerNormalizationOptions | undefined,
): AutoGradedResult {
    const accepted = declaredAnswers(answer);
    if (learnerInput === undefined) {
        return graded(false, 'missing-answer', {
            code: 'missing-answer',
            accepted,
        });
    }

    const normalizedInput = normalizeAnswer(learnerInput, normalization);
    const matches = accepted.some(candidate => normalizeAnswer(candidate, normalization) === normalizedInput);
    return matches
        ? graded(true, 'accepted-answer')
        : graded(false, 'answer-not-accepted', {
            code: 'answer-not-accepted',
            accepted,
        });
}

function declaredAnswers(answer: DeclaredTextAnswer): readonly string[] {
    return [answer.primary, ...(answer.alternatives ?? [])];
}

function checkTargetPattern(
    pattern: TargetPattern,
    normalizedInput: string,
    normalization: AnswerNormalizationOptions | undefined,
): TargetPatternCheckResult {
    const mode = pattern.mode ?? 'includes';

    if (mode === 'regex') {
        try {
            const matches = new RegExp(pattern.pattern, pattern.flags).test(normalizedInput);
            return targetPatternResult(pattern.id, mode, matches);
        } catch {
            return {
                id: pattern.id,
                mode,
                status: 'invalid',
                explanation: 'invalid-target-pattern',
            };
        }
    }

    const normalizedPattern = normalizeAnswer(pattern.pattern, normalization);
    const matches = mode === 'exact'
        ? normalizedInput === normalizedPattern
        : normalizedInput.includes(normalizedPattern);
    return targetPatternResult(pattern.id, mode, matches);
}

function targetPatternResult(
    id: string,
    mode: TargetPatternMode,
    matches: boolean,
): MatchedTargetPatternResult {
    return {
        id,
        mode,
        status: matches ? 'matched' : 'not-matched',
        explanation: matches ? 'target-pattern-matched' : 'target-pattern-not-matched',
    };
}

function graded(
    correct: boolean,
    explanation: AutoGradeExplanation,
    mismatch?: GradingMismatch,
): AutoGradedResult {
    return mismatch === undefined
        ? { status: 'graded', correct, explanation }
        : { status: 'graded', correct, explanation, mismatch };
}

function uniqueValues(values: readonly string[]): string[] {
    return [...new Set(values)];
}

function duplicateValues(values: readonly string[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const value of values) {
        if (seen.has(value)) duplicates.add(value);
        seen.add(value);
    }
    return [...duplicates];
}

function sameOrder(expected: readonly string[], received: readonly string[]): boolean {
    return expected.length === received.length && expected.every((value, index) => value === received[index]);
}

function orderMismatch(expected: readonly string[], received: readonly string[]): OrderMismatch {
    const firstDifferentIndex = firstDifference(expected, received);
    const { missing, unexpected } = multisetDifference(expected, received);
    return {
        code: 'order-mismatch',
        firstDifferentIndex,
        expected: expected[firstDifferentIndex],
        received: received[firstDifferentIndex],
        missing,
        unexpected,
    };
}

function firstDifference(expected: readonly string[], received: readonly string[]): number {
    const length = Math.max(expected.length, received.length);
    for (let index = 0; index < length; index += 1) {
        if (expected[index] !== received[index]) return index;
    }
    return 0;
}

function multisetDifference(expected: readonly string[], received: readonly string[]): Pick<OrderMismatch, 'missing' | 'unexpected'> {
    const remainingReceived = countValues(received);
    const missing: string[] = [];
    for (const value of expected) {
        const count = remainingReceived.get(value) ?? 0;
        if (count === 0) missing.push(value);
        else remainingReceived.set(value, count - 1);
    }

    const remainingExpected = countValues(expected);
    const unexpected: string[] = [];
    for (const value of received) {
        const count = remainingExpected.get(value) ?? 0;
        if (count === 0) unexpected.push(value);
        else remainingExpected.set(value, count - 1);
    }

    return { missing, unexpected };
}

function countValues(values: readonly string[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return counts;
}

function ownValue(input: ClozeLearnerInput, key: string): string | undefined {
    return Object.prototype.hasOwnProperty.call(input, key) ? input[key] : undefined;
}
