import type { ActivityEvaluation } from './activity-runtime';
import type { LearningAction, LearningSkill } from './learner-record';
import type { KanaSoundMapModel, KanaSoundMapResponse } from '../minigames/kana-sound-map';

const LESSON_ZERO_VOWEL_SESSION_ID = 'session:lesson-zero-vowel-listen' as const;
export const LESSON_ZERO_VOWEL_BINGO_ID = 'game:lesson-zero-vowel-listening-bingo' as const;

export type LessonZeroVowelMode = 'audio' | 'visual';
export type LessonZeroVowelVariant = 'lesson' | 'bingo';
export type LessonZeroVowelStage = 'learn' | 'attempt' | 'repair' | 'complete';

export interface LessonZeroVowelSelection {
    readonly roundId: string;
    readonly kanaId: string;
}

export interface LessonZeroVowelAttempt {
    readonly variant: LessonZeroVowelVariant;
    readonly mode: LessonZeroVowelMode;
    readonly outcome: 'pass' | 'lapse';
    readonly score: number;
    readonly missedItemIds: readonly string[];
    readonly at: number;
}

export interface LessonZeroVowelSessionState {
    readonly schemaVersion: 1;
    readonly sessionId: typeof LESSON_ZERO_VOWEL_SESSION_ID;
    readonly status: 'ready' | 'active' | 'paused' | 'complete';
    readonly stage: LessonZeroVowelStage;
    readonly variant: LessonZeroVowelVariant;
    readonly mode: LessonZeroVowelMode;
    readonly learnedItemIds: readonly string[];
    readonly roundOrder: readonly string[];
    readonly heardRoundIds: readonly string[];
    readonly selections: readonly LessonZeroVowelSelection[];
    readonly repairItemIds: readonly string[];
    readonly repairCursor: number;
    readonly baseCompleted: boolean;
    readonly bingoWins: number;
    readonly attempts: readonly LessonZeroVowelAttempt[];
}

export type LessonZeroVowelSessionAction =
    | { readonly kind: 'start' }
    | { readonly kind: 'choose-mode'; readonly mode: LessonZeroVowelMode }
    | { readonly kind: 'learn-item'; readonly itemId: string }
    | { readonly kind: 'begin-attempt' }
    | { readonly kind: 'mark-heard'; readonly roundId: string }
    | { readonly kind: 'select'; readonly kanaId: string }
    | { readonly kind: 'record-result'; readonly evaluation: ActivityEvaluation }
    | { readonly kind: 'complete-repair-item'; readonly itemId: string }
    | { readonly kind: 'begin-retry' }
    | { readonly kind: 'start-bingo' }
    | { readonly kind: 'pause' }
    | { readonly kind: 'resume' };

export interface LessonZeroVowelAdaptiveEvidence {
    readonly eventId: string;
    readonly at: number;
    readonly modeId: string;
    readonly skill: LearningSkill;
    readonly action: LearningAction;
    readonly sourceId: string;
    readonly independent: boolean;
}

export interface LessonZeroVowelSessionTransition {
    readonly state: LessonZeroVowelSessionState;
    readonly evaluation?: ActivityEvaluation;
    readonly adaptive?: LessonZeroVowelAdaptiveEvidence;
}

export function startLessonZeroVowelSession(
    model: KanaSoundMapModel,
    snapshot?: LessonZeroVowelSessionState,
): LessonZeroVowelSessionState {
    validateModel(model);
    if (snapshot !== undefined) {
        if (!lessonZeroVowelSessionSnapshotShapeIsValid(snapshot)) {
            throw new TypeError('Invalid Lesson Zero vowel snapshot.');
        }
        validateSnapshotAgainstModel(model, snapshot);
        return structuredClone(snapshot);
    }
    return {
        schemaVersion: 1,
        sessionId: LESSON_ZERO_VOWEL_SESSION_ID,
        status: 'ready',
        stage: 'learn',
        variant: 'lesson',
        mode: 'audio',
        learnedItemIds: [],
        roundOrder: [],
        heardRoundIds: [],
        selections: [],
        repairItemIds: [],
        repairCursor: 0,
        baseCompleted: false,
        bingoWins: 0,
        attempts: [],
    };
}

export function restartLessonZeroVowelSession(model: KanaSoundMapModel): LessonZeroVowelSessionState {
    return startLessonZeroVowelSession(model);
}

export function transitionLessonZeroVowelSession(
    model: KanaSoundMapModel,
    state: LessonZeroVowelSessionState,
    action: LessonZeroVowelSessionAction,
    at: number,
): LessonZeroVowelSessionTransition {
    validateModel(model);
    validateTime(at);
    if (!lessonZeroVowelSessionSnapshotShapeIsValid(state)) {
        throw new TypeError('Invalid Lesson Zero vowel state.');
    }
    validateSnapshotAgainstModel(model, state);
    const itemIds = model.payload.items.map(item => item.id);

    if (action.kind === 'start') {
        requireState(state.status === 'ready' && state.stage === 'learn', 'The vowel lesson has already started.');
        return { state: { ...state, status: 'active' } };
    }
    if (action.kind === 'pause') {
        requireState(state.status === 'active', 'Only an active vowel session can pause.');
        return { state: { ...state, status: 'paused' } };
    }
    if (action.kind === 'resume') {
        requireState(state.status === 'paused', 'Only a paused vowel session can resume.');
        return { state: { ...state, status: 'active' } };
    }
    if (action.kind === 'start-bingo') {
        requireState(state.baseCompleted && state.stage === 'complete', 'Finish the first five sounds before playing bingo.');
        return {
            state: beginRound(model, {
                ...state,
                status: 'active',
                variant: 'bingo',
                repairItemIds: [],
                repairCursor: 0,
            }, 'bingo'),
        };
    }

    requireState(state.status === 'active', 'Start or resume the vowel session first.');
    if (action.kind === 'choose-mode') {
        requireState(state.stage === 'learn' || state.stage === 'repair'
            || (state.stage === 'attempt' && state.selections.length === 0),
            'The access mode can change before a round, not after answers have been committed.');
        return {
            state: {
                ...state,
                mode: action.mode,
                heardRoundIds: state.stage === 'attempt' ? [] : state.heardRoundIds,
            },
        };
    }
    if (action.kind === 'learn-item') {
        requireState(state.stage === 'learn', 'The teaching pass is no longer active.');
        const nextItemId = itemIds[state.learnedItemIds.length];
        requireState(action.itemId === nextItemId, 'Learn the five vowel anchors in their canonical order.');
        return { state: { ...state, learnedItemIds: [...state.learnedItemIds, action.itemId] } };
    }
    if (action.kind === 'begin-attempt') {
        requireState(state.stage === 'learn' && state.learnedItemIds.length === itemIds.length,
            'Meet all five vowel anchors before the first listening attempt.');
        return { state: beginRound(model, state, 'lesson') };
    }
    if (action.kind === 'mark-heard') {
        requireState(state.stage === 'attempt', 'There is no active sound round.');
        requireState(action.roundId === currentRoundId(state), 'Only the current sound can be marked heard.');
        return {
            state: {
                ...state,
                heardRoundIds: unique([...state.heardRoundIds, action.roundId]),
            },
        };
    }
    if (action.kind === 'select') {
        requireState(state.stage === 'attempt', 'There is no active sound round.');
        requireState(itemIds.includes(action.kanaId), `Unknown vowel choice: ${action.kanaId}`);
        const roundId = currentRoundId(state);
        requireState(typeof roundId === 'string', 'Every sound in this round already has an answer.');
        requireState(state.mode === 'visual' || state.heardRoundIds.includes(roundId),
            'Listen to the current sound before choosing its character.');
        return {
            state: {
                ...state,
                selections: [...state.selections, { roundId, kanaId: action.kanaId }],
            },
        };
    }
    if (action.kind === 'record-result') {
        requireState(state.stage === 'attempt' && state.selections.length === state.roundOrder.length,
            'Commit one answer for every sound before grading.');
        const expectedActivityId = state.variant === 'lesson' ? model.id : LESSON_ZERO_VOWEL_BINGO_ID;
        requireState(action.evaluation.attempt.activityId === expectedActivityId,
            'The grade does not belong to this vowel round.');
        const missedItemIds = missedItems(model, action.evaluation);
        const attempt: LessonZeroVowelAttempt = {
            variant: state.variant,
            mode: state.mode,
            outcome: action.evaluation.result.outcome,
            score: action.evaluation.result.score,
            missedItemIds,
            at,
        };
        const attempts = [...state.attempts, attempt];
        const adaptive = adaptiveEvidence(state, action.evaluation, at, attempts.length);
        if (action.evaluation.result.outcome === 'pass') {
            return {
                state: {
                    ...state,
                    status: 'complete',
                    stage: 'complete',
                    baseCompleted: state.baseCompleted || state.variant === 'lesson',
                    bingoWins: state.bingoWins + (state.variant === 'bingo' ? 1 : 0),
                    repairItemIds: [],
                    repairCursor: 0,
                    attempts,
                },
                evaluation: action.evaluation,
                adaptive,
            };
        }
        requireState(missedItemIds.length > 0, 'A lapsed vowel attempt must identify at least one missed sound.');
        return {
            state: {
                ...state,
                stage: 'repair',
                roundOrder: [],
                heardRoundIds: [],
                selections: [],
                repairItemIds: missedItemIds,
                repairCursor: 0,
                attempts,
            },
            evaluation: action.evaluation,
            adaptive,
        };
    }
    if (action.kind === 'complete-repair-item') {
        requireState(state.stage === 'repair', 'There is no active vowel repair.');
        requireState(action.itemId === state.repairItemIds[state.repairCursor],
            'Repair the missed sounds in their displayed order.');
        return { state: { ...state, repairCursor: state.repairCursor + 1 } };
    }
    if (action.kind === 'begin-retry') {
        requireState(state.stage === 'repair' && state.repairCursor === state.repairItemIds.length,
            'Replay every missed sound before retrying the complete route.');
        return { state: beginRound(model, state, state.variant) };
    }
    return exhaustive(action);
}

export function lessonZeroVowelResponse(
    model: KanaSoundMapModel,
    state: LessonZeroVowelSessionState,
): KanaSoundMapResponse {
    validateModel(model);
    validateSnapshotAgainstModel(model, state);
    if (state.stage !== 'attempt' || state.selections.length !== model.payload.items.length) {
        throw new Error('The vowel route needs all five commitments before submission.');
    }
    const byRound = new Map(state.selections.map(selection => [selection.roundId, selection.kanaId]));
    return {
        selections: model.payload.items.map(item => ({
            roundId: item.id,
            kanaId: byRound.get(item.id) ?? missingSelection(item.id),
        })),
    };
}

export function lessonZeroVowelSessionSnapshotShapeIsValid(value: unknown): value is LessonZeroVowelSessionState {
    if (!value || typeof value !== 'object') return false;
    const state = value as Partial<LessonZeroVowelSessionState>;
    const statuses = ['ready', 'active', 'paused', 'complete'];
    const stages = ['learn', 'attempt', 'repair', 'complete'];
    const variants = ['lesson', 'bingo'];
    const modes = ['audio', 'visual'];
    if (state.schemaVersion !== 1 || state.sessionId !== LESSON_ZERO_VOWEL_SESSION_ID
        || !statuses.includes(state.status ?? '') || !stages.includes(state.stage ?? '')
        || !variants.includes(state.variant ?? '') || !modes.includes(state.mode ?? '')) return false;
    if (!stringArray(state.learnedItemIds) || !stringArray(state.roundOrder)
        || !stringArray(state.heardRoundIds) || !stringArray(state.repairItemIds)) return false;
    if (!Array.isArray(state.selections) || state.selections.some(selection => !selection
        || typeof selection.roundId !== 'string' || !selection.roundId
        || typeof selection.kanaId !== 'string' || !selection.kanaId)) return false;
    const repairCursor = state.repairCursor;
    if (!Number.isSafeInteger(repairCursor) || repairCursor === undefined || repairCursor < 0
        || typeof state.baseCompleted !== 'boolean'
        || !Number.isSafeInteger(state.bingoWins) || (state.bingoWins ?? -1) < 0) return false;
    if (!Array.isArray(state.attempts) || state.attempts.some(attempt => !attempt
        || !variants.includes(attempt.variant) || !modes.includes(attempt.mode)
        || !['pass', 'lapse'].includes(attempt.outcome)
        || !Number.isFinite(attempt.score) || attempt.score < 0 || attempt.score > 1
        || !stringArray(attempt.missedItemIds)
        || !Number.isSafeInteger(attempt.at) || attempt.at < 0)) return false;
    if (new Set(state.learnedItemIds).size !== state.learnedItemIds.length
        || new Set(state.roundOrder).size !== state.roundOrder.length
        || new Set(state.heardRoundIds).size !== state.heardRoundIds.length
        || new Set(state.repairItemIds).size !== state.repairItemIds.length
        || repairCursor > state.repairItemIds.length
        || state.selections.length > state.roundOrder.length) return false;
    if (state.status === 'ready' && (state.stage !== 'learn' || state.learnedItemIds.length > 0)) return false;
    if (state.status === 'complete' && (state.stage !== 'complete' || !state.baseCompleted)) return false;
    if (state.stage === 'complete' && state.status !== 'complete') return false;
    if (state.stage === 'attempt' && state.roundOrder.length === 0) return false;
    if (state.stage === 'repair' && state.repairItemIds.length === 0) return false;
    return true;
}

function beginRound(
    model: KanaSoundMapModel,
    state: LessonZeroVowelSessionState,
    variant: LessonZeroVowelVariant,
): LessonZeroVowelSessionState {
    const attemptNumber = state.attempts.filter(attempt => attempt.variant === variant).length;
    return {
        ...state,
        status: 'active',
        stage: 'attempt',
        variant,
        roundOrder: shuffledIds(model.payload.items.map(item => item.id), variant, attemptNumber),
        heardRoundIds: [],
        selections: [],
        repairItemIds: [],
        repairCursor: 0,
    };
}

function shuffledIds(ids: readonly string[], variant: LessonZeroVowelVariant, attemptNumber: number): string[] {
    const result = [...ids];
    let seed = hash(`${variant}:${attemptNumber}:${ids.join('|')}`);
    for (let index = result.length - 1; index > 0; index -= 1) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const swap = seed % (index + 1);
        [result[index], result[swap]] = [result[swap], result[index]];
    }
    if (result.every((id, index) => id === ids[index])) {
        result.push(result.shift() as string);
    }
    return result;
}

function hash(value: string): number {
    let result = 2166136261;
    for (const character of value) {
        result ^= character.codePointAt(0) ?? 0;
        result = Math.imul(result, 16777619);
    }
    return result >>> 0;
}

function currentRoundId(state: LessonZeroVowelSessionState): string | undefined {
    return state.roundOrder[state.selections.length];
}

function missedItems(model: KanaSoundMapModel, evaluation: ActivityEvaluation): string[] {
    const byError = new Map(model.payload.items.map(item => [item.errorTag, item.id]));
    return unique(evaluation.result.errorTags.flatMap(tag => byError.get(tag) ?? []));
}

function adaptiveEvidence(
    state: LessonZeroVowelSessionState,
    evaluation: ActivityEvaluation,
    at: number,
    attemptNumber: number,
): LessonZeroVowelAdaptiveEvidence {
    const repair = state.attempts.some(attempt => attempt.outcome === 'lapse');
    return {
        eventId: `adaptive:lesson-zero-vowels:${state.variant}:${attemptNumber}:${at}`,
        at,
        modeId: `lesson-zero-vowels:${state.mode}:${state.variant}`,
        skill: repair ? 'repair' : state.mode === 'audio' ? 'listening' : 'kana',
        action: repair ? 'repair' : state.mode === 'audio' ? 'listen' : 'recognise',
        sourceId: evaluation.attempt.sourceQuestionId ?? evaluation.attempt.activityId,
        independent: true,
    };
}

function validateSnapshotAgainstModel(model: KanaSoundMapModel, state: LessonZeroVowelSessionState): void {
    const itemIds = model.payload.items.map(item => item.id);
    const itemSet = new Set(itemIds);
    for (const id of [...state.learnedItemIds, ...state.roundOrder, ...state.heardRoundIds, ...state.repairItemIds]) {
        if (!itemSet.has(id)) throw new TypeError(`Lesson Zero vowel snapshot contains unknown item ${id}.`);
    }
    if (state.learnedItemIds.some((id, index) => id !== itemIds[index])) {
        throw new TypeError('Lesson Zero vowel teaching order drifted from the canonical five vowels.');
    }
    if (state.stage === 'attempt' && (state.roundOrder.length !== itemIds.length
        || state.roundOrder.some(id => !itemSet.has(id)))) {
        throw new TypeError('Lesson Zero vowel round must contain each authored vowel once.');
    }
    if (state.selections.some((selection, index) => selection.roundId !== state.roundOrder[index]
        || !itemSet.has(selection.kanaId))) {
        throw new TypeError('Lesson Zero vowel selections do not fit the active round.');
    }
    if (state.heardRoundIds.some(id => !state.roundOrder.includes(id))) {
        throw new TypeError('Lesson Zero vowel audio evidence does not fit the active round.');
    }
    if (state.bingoWins > state.attempts.filter(attempt =>
        attempt.variant === 'bingo' && attempt.outcome === 'pass').length) {
        throw new TypeError('Lesson Zero vowel bingo wins exceed recorded passing attempts.');
    }
}

function validateModel(model: KanaSoundMapModel): void {
    if (!model || model.kind !== 'kana-sound-map' || model.payload.items.length !== 5) {
        throw new TypeError('Lesson Zero vowel session requires the canonical five-sound map.');
    }
}

function validateTime(at: number): void {
    if (!Number.isSafeInteger(at) || at < 0) throw new TypeError('Vowel session transitions need a valid timestamp.');
}

function stringArray(value: unknown): value is readonly string[] {
    return Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0);
}

function unique(values: readonly string[]): string[] {
    return [...new Set(values)];
}

function requireState(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

function missingSelection(itemId: string): never {
    throw new Error(`The vowel route is missing a selection for ${itemId}.`);
}

function exhaustive(value: never): never {
    throw new TypeError(`Unknown Lesson Zero vowel action: ${JSON.stringify(value)}`);
}
