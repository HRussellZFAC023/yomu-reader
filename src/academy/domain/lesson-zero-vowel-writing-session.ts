import type { ActivityEvaluation } from './activity-runtime';
import type { LearningAction, LearningSkill } from './learner-record';
import {
    lessonZeroVowelWritingChildActivityId,
    type LessonZeroVowelWritingDefinition,
    type LessonZeroVowelWritingItemId,
} from '../content/lesson-zero-vowel-writing';

const LESSON_ZERO_VOWEL_WRITING_SESSION_ID = 'session:lesson-zero-vowel-doodle' as const;

export type LessonZeroVowelWritingMode = 'draw' | 'plan';
export type LessonZeroVowelWritingAttemptMode = LessonZeroVowelWritingMode | 'recall';
export type LessonZeroVowelWritingStage = 'learn' | 'attempt' | 'repair' | 'recall' | 'recall-repair' | 'complete';

export interface LessonZeroVowelWritingAttempt {
    readonly itemId: LessonZeroVowelWritingItemId;
    readonly mode: LessonZeroVowelWritingAttemptMode;
    readonly outcome: 'pass' | 'lapse';
    readonly score: number;
    readonly errorTags: readonly string[];
    readonly at: number;
}

export interface LessonZeroVowelWritingSessionState {
    readonly schemaVersion: 1;
    readonly sessionId: typeof LESSON_ZERO_VOWEL_WRITING_SESSION_ID;
    readonly status: 'ready' | 'active' | 'paused' | 'complete';
    readonly stage: LessonZeroVowelWritingStage;
    readonly mode: LessonZeroVowelWritingMode;
    readonly learnedItemIds: readonly LessonZeroVowelWritingItemId[];
    readonly completedItemIds: readonly LessonZeroVowelWritingItemId[];
    readonly guideItemIds: readonly LessonZeroVowelWritingItemId[];
    /**
     * Optional only so snapshots written before delayed recall shipped remain
     * resumable. Every newly written snapshot includes this field.
     */
    readonly recalledItemIds?: readonly LessonZeroVowelWritingItemId[];
    readonly attempts: readonly LessonZeroVowelWritingAttempt[];
}

export type LessonZeroVowelWritingAction =
    | { readonly kind: 'start' }
    | { readonly kind: 'choose-mode'; readonly mode: LessonZeroVowelWritingMode }
    | { readonly kind: 'learn-item'; readonly itemId: LessonZeroVowelWritingItemId }
    | { readonly kind: 'record-result'; readonly evaluation: ActivityEvaluation }
    | { readonly kind: 'record-recall-result'; readonly evaluation: ActivityEvaluation }
    | { readonly kind: 'begin-retry' }
    | { readonly kind: 'pause' }
    | { readonly kind: 'resume' };

export interface LessonZeroVowelWritingAdaptiveEvidence {
    readonly eventId: string;
    readonly at: number;
    readonly modeId: string;
    readonly skill: LearningSkill;
    readonly action: LearningAction;
    readonly sourceId: string;
    readonly independent: boolean;
}

export interface LessonZeroVowelWritingTransition {
    readonly state: LessonZeroVowelWritingSessionState;
    readonly evaluation?: ActivityEvaluation;
    readonly adaptive?: LessonZeroVowelWritingAdaptiveEvidence;
}

export function startLessonZeroVowelWritingSession(
    definition: LessonZeroVowelWritingDefinition,
    snapshot?: LessonZeroVowelWritingSessionState,
): LessonZeroVowelWritingSessionState {
    validateDefinition(definition);
    if (snapshot !== undefined) {
        if (!lessonZeroVowelWritingSessionSnapshotShapeIsValid(snapshot)) {
            throw new TypeError('Invalid Lesson Zero vowel-writing snapshot.');
        }
        validateSnapshotAgainstDefinition(definition, snapshot);
        return structuredClone(snapshot);
    }
    return {
        schemaVersion: 1,
        sessionId: LESSON_ZERO_VOWEL_WRITING_SESSION_ID,
        status: 'ready',
        stage: 'learn',
        mode: 'draw',
        learnedItemIds: [],
        completedItemIds: [],
        guideItemIds: [],
        recalledItemIds: [],
        attempts: [],
    };
}

export function restartLessonZeroVowelWritingSession(
    definition: LessonZeroVowelWritingDefinition,
): LessonZeroVowelWritingSessionState {
    return startLessonZeroVowelWritingSession(definition);
}

export function transitionLessonZeroVowelWritingSession(
    definition: LessonZeroVowelWritingDefinition,
    state: LessonZeroVowelWritingSessionState,
    action: LessonZeroVowelWritingAction,
    at: number,
): LessonZeroVowelWritingTransition {
    validateDefinition(definition);
    validateTime(at);
    if (!lessonZeroVowelWritingSessionSnapshotShapeIsValid(state)) {
        throw new TypeError('Invalid Lesson Zero vowel-writing state.');
    }
    validateSnapshotAgainstDefinition(definition, state);

    if (action.kind === 'start') {
        requireState(state.status === 'ready' && state.stage === 'learn', 'The writing desk has already started.');
        return { state: { ...state, status: 'active' } };
    }
    if (action.kind === 'pause') {
        requireState(state.status === 'active', 'Only an active writing session can pause.');
        return { state: { ...state, status: 'paused' } };
    }
    if (action.kind === 'resume') {
        requireState(state.status === 'paused', 'Only a paused writing session can resume.');
        return { state: { ...state, status: 'active' } };
    }

    requireState(state.status === 'active', 'Start or resume the writing desk first.');
    if (action.kind === 'choose-mode') {
        requireState(state.stage !== 'complete', 'The completed writing route no longer changes mode.');
        return { state: { ...state, mode: action.mode } };
    }
    if (action.kind === 'learn-item') {
        requireState(state.stage === 'learn', 'The current kana is already in its attempt.');
        const item = currentItem(definition, state);
        requireState(item?.id === action.itemId, 'Meet the five vowel kana in their canonical order.');
        return {
            state: {
                ...state,
                stage: 'attempt',
                learnedItemIds: state.learnedItemIds.includes(action.itemId)
                    ? state.learnedItemIds
                    : [...state.learnedItemIds, action.itemId],
            },
        };
    }
    if (action.kind === 'begin-retry') {
        requireState(state.stage === 'repair' || state.stage === 'recall-repair', 'There is no vowel-writing repair to retry.');
        return { state: { ...state, stage: state.stage === 'repair' ? 'attempt' : 'recall' } };
    }
    if (action.kind === 'record-result') {
        requireState(state.stage === 'attempt', 'There is no active vowel-writing attempt.');
        const item = currentItem(definition, state);
        requireState(Boolean(item), 'All five vowel kana are already complete.');
        requireState(action.evaluation.attempt.activityId === lessonZeroVowelWritingChildActivityId(item!.id),
            'The writing grade does not belong to the current kana.');
        requireState(action.evaluation.attempt.responseKind === (state.mode === 'draw' ? 'kana-doodle' : 'kana-stroke-plan'),
            'The writing grade does not match the selected access route.');
        const attempt: LessonZeroVowelWritingAttempt = {
            itemId: item!.id,
            mode: state.mode,
            outcome: action.evaluation.result.outcome,
            score: action.evaluation.result.score,
            errorTags: [...action.evaluation.result.errorTags],
            at,
        };
        const attempts = [...state.attempts, attempt];
        const adaptive = adaptiveEvidence(state, item!.id, action.evaluation, at, attempts.length);
        if (action.evaluation.result.outcome === 'lapse') {
            return {
                state: {
                    ...state,
                    stage: 'repair',
                    guideItemIds: unique([...state.guideItemIds, item!.id]),
                    attempts,
                },
                evaluation: action.evaluation,
                adaptive,
            };
        }
        const completedItemIds = [...state.completedItemIds, item!.id];
        const readyForRecall = completedItemIds.length === definition.items.length;
        return {
            state: {
                ...state,
                status: 'active',
                stage: readyForRecall ? 'recall' : 'learn',
                completedItemIds,
                attempts,
            },
            evaluation: action.evaluation,
            adaptive,
        };
    }
    if (action.kind === 'record-recall-result') {
        requireState(state.stage === 'recall', 'There is no active delayed-recall attempt.');
        const item = currentItem(definition, state);
        requireState(Boolean(item), 'All five vowel kana are already recalled.');
        requireState(action.evaluation.attempt.activityId === lessonZeroVowelWritingChildActivityId(item!.id),
            'The recall grade does not belong to the current kana.');
        requireState(action.evaluation.attempt.responseKind === 'kana-choice',
            'The delayed-recall grade must use a kana choice.');
        const attempt: LessonZeroVowelWritingAttempt = {
            itemId: item!.id,
            mode: 'recall',
            outcome: action.evaluation.result.outcome,
            score: action.evaluation.result.score,
            errorTags: [...action.evaluation.result.errorTags],
            at,
        };
        const attempts = [...state.attempts, attempt];
        const adaptive = adaptiveEvidence(state, item!.id, action.evaluation, at, attempts.length, true);
        if (action.evaluation.result.outcome === 'lapse') {
            return {
                state: { ...state, stage: 'recall-repair', attempts },
                evaluation: action.evaluation,
                adaptive,
            };
        }
        const recalledItemIds = [...(state.recalledItemIds ?? []), item!.id];
        const finished = recalledItemIds.length === definition.items.length;
        return {
            state: {
                ...state,
                status: finished ? 'complete' : 'active',
                stage: finished ? 'complete' : 'recall',
                recalledItemIds,
                attempts,
            },
            evaluation: action.evaluation,
            adaptive,
        };
    }
    return exhaustive(action);
}

export function lessonZeroVowelWritingSessionSnapshotShapeIsValid(
    value: unknown,
): value is LessonZeroVowelWritingSessionState {
    if (!value || typeof value !== 'object') return false;
    const state = value as Partial<LessonZeroVowelWritingSessionState>;
    if (state.schemaVersion !== 1 || state.sessionId !== LESSON_ZERO_VOWEL_WRITING_SESSION_ID
        || !['ready', 'active', 'paused', 'complete'].includes(state.status ?? '')
        || !['learn', 'attempt', 'repair', 'recall', 'recall-repair', 'complete'].includes(state.stage ?? '')
        || !['draw', 'plan'].includes(state.mode ?? '')) return false;
    if (!itemIdArray(state.learnedItemIds) || !itemIdArray(state.completedItemIds) || !itemIdArray(state.guideItemIds)) return false;
    if (state.recalledItemIds !== undefined && !itemIdArray(state.recalledItemIds)) return false;
    if (!Array.isArray(state.attempts) || state.attempts.some(attempt => !attempt
        || !isItemId(attempt.itemId) || !['draw', 'plan', 'recall'].includes(attempt.mode)
        || !['pass', 'lapse'].includes(attempt.outcome)
        || !Number.isFinite(attempt.score) || attempt.score < 0 || attempt.score > 1
        || !stringArray(attempt.errorTags)
        || !Number.isSafeInteger(attempt.at) || attempt.at < 0)) return false;
    if (new Set(state.learnedItemIds).size !== state.learnedItemIds.length
        || new Set(state.completedItemIds).size !== state.completedItemIds.length
        || new Set(state.guideItemIds).size !== state.guideItemIds.length
        || new Set(state.recalledItemIds ?? []).size !== (state.recalledItemIds ?? []).length
        || state.completedItemIds.length > state.learnedItemIds.length) return false;
    if (state.status === 'ready' && (state.stage !== 'learn' || state.learnedItemIds.length > 0
        || state.completedItemIds.length > 0 || (state.recalledItemIds ?? []).length > 0)) return false;
    if (state.status === 'complete' && (state.stage !== 'complete' || state.completedItemIds.length !== 5
        || (state.recalledItemIds !== undefined && state.recalledItemIds.length !== 5))) return false;
    if (state.stage === 'complete' && state.status !== 'complete') return false;
    if ((state.stage === 'recall' || state.stage === 'recall-repair')
        && (state.completedItemIds.length !== 5 || state.status === 'ready' || state.status === 'complete'
            || (state.recalledItemIds ?? []).length >= 5)) return false;
    if (state.stage === 'repair') {
        const currentId = ITEM_IDS[state.completedItemIds.length];
        if (!currentId || !state.guideItemIds.includes(currentId)) return false;
    }
    return true;
}

export function lessonZeroVowelWritingAveragePassScore(state: LessonZeroVowelWritingSessionState): number {
    const latestPasses = ITEM_IDS.map(itemId => [...state.attempts].reverse().find(attempt =>
        attempt.itemId === itemId && attempt.mode !== 'recall' && attempt.outcome === 'pass'));
    if (latestPasses.some(attempt => !attempt)) throw new Error('All five kana need a passing attempt before completion.');
    return latestPasses.reduce((sum, attempt) => sum + (attempt?.score ?? 0), 0) / latestPasses.length;
}

const ITEM_IDS = ['hira-a', 'hira-i', 'hira-u', 'hira-e', 'hira-o'] as const;
export const LESSON_ZERO_VOWEL_WRITING_RECALL_ORDER = ['hira-u', 'hira-a', 'hira-o', 'hira-i', 'hira-e'] as const;

export function lessonZeroVowelWritingCurrentItem(
    definition: LessonZeroVowelWritingDefinition,
    state: LessonZeroVowelWritingSessionState,
) {
    if (state.stage === 'recall' || state.stage === 'recall-repair') {
        const id = LESSON_ZERO_VOWEL_WRITING_RECALL_ORDER[(state.recalledItemIds ?? []).length];
        return definition.items.find(item => item.id === id);
    }
    return definition.items[state.completedItemIds.length];
}

function currentItem(definition: LessonZeroVowelWritingDefinition, state: LessonZeroVowelWritingSessionState) {
    return lessonZeroVowelWritingCurrentItem(definition, state);
}

function adaptiveEvidence(
    state: LessonZeroVowelWritingSessionState,
    itemId: LessonZeroVowelWritingItemId,
    evaluation: ActivityEvaluation,
    at: number,
    attemptNumber: number,
    recall = false,
): LessonZeroVowelWritingAdaptiveEvidence {
    const lastRecall = [...state.attempts].reverse().find(attempt =>
        attempt.itemId === itemId && attempt.mode === 'recall');
    const repairing = recall
        ? lastRecall?.outcome === 'lapse'
        : state.guideItemIds.includes(itemId);
    return {
        eventId: `adaptive:lesson-zero-vowel-writing:${itemId}:${attemptNumber}:${at}`,
        at,
        modeId: `lesson-zero-vowel-writing:${recall ? 'recall' : state.mode}`,
        skill: repairing ? 'repair' : recall ? 'kana' : state.mode === 'draw' ? 'writing' : 'kana',
        action: repairing ? 'repair' : recall ? 'recall' : state.mode === 'draw' ? 'write' : 'recall',
        sourceId: evaluation.attempt.sourceQuestionId ?? evaluation.attempt.activityId,
        independent: true,
    };
}

function validateSnapshotAgainstDefinition(
    definition: LessonZeroVowelWritingDefinition,
    state: LessonZeroVowelWritingSessionState,
): void {
    const ids = definition.items.map(item => item.id);
    const prefix = (values: readonly LessonZeroVowelWritingItemId[]) => values.every((id, index) => id === ids[index]);
    if (!prefix(state.learnedItemIds) || !prefix(state.completedItemIds)) {
        throw new TypeError('Lesson Zero vowel-writing order drifted from the canonical five vowels.');
    }
    const recalled = state.recalledItemIds ?? [];
    if (!recalled.every((id, index) => id === LESSON_ZERO_VOWEL_WRITING_RECALL_ORDER[index])) {
        throw new TypeError('Lesson Zero vowel-writing recall order drifted from the balanced retrieval sequence.');
    }
    const known = new Set(ids);
    for (const id of state.guideItemIds) {
        if (!known.has(id)) throw new TypeError(`Lesson Zero vowel-writing snapshot contains unknown item ${id}.`);
    }
    for (const attempt of state.attempts) {
        if (!known.has(attempt.itemId)) throw new TypeError(`Lesson Zero vowel-writing attempt contains unknown item ${attempt.itemId}.`);
    }
}

function validateDefinition(definition: LessonZeroVowelWritingDefinition): void {
    if (!definition || definition.items.length !== 5
        || definition.items.some((item, index) => item.id !== ITEM_IDS[index])) {
        throw new TypeError('Lesson Zero vowel writing requires the canonical five-kana definition.');
    }
}

function itemIdArray(value: unknown): value is readonly LessonZeroVowelWritingItemId[] {
    return Array.isArray(value) && value.every(isItemId);
}

function isItemId(value: unknown): value is LessonZeroVowelWritingItemId {
    return typeof value === 'string' && ITEM_IDS.includes(value as LessonZeroVowelWritingItemId);
}

function stringArray(value: unknown): value is readonly string[] {
    return Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0);
}

function unique<T>(values: readonly T[]): T[] {
    return [...new Set(values)];
}

function validateTime(at: number): void {
    if (!Number.isSafeInteger(at) || at < 0) throw new TypeError('Vowel-writing transitions need a valid timestamp.');
}

function requireState(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

function exhaustive(value: never): never {
    throw new TypeError(`Unknown Lesson Zero vowel-writing action: ${JSON.stringify(value)}`);
}
