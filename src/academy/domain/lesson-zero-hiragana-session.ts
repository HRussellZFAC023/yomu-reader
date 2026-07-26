import type { ActivityEvaluation, ReviewSeed } from './activity-runtime';
import type { LearningAction, LearningSkill } from './learner-record';
import {
    LESSON_ZERO_BASIC_HIRAGANA_COUNT,
    LESSON_ZERO_HIRAGANA_BOOTCAMP_ID,
    LESSON_ZERO_HIRAGANA_SESSION_ID,
    type LessonZeroHiraganaDefinition,
    type LessonZeroHiraganaItem,
} from '../content/lesson-zero-hiragana';

export type LessonZeroHiraganaRoute = 'guided' | 'placement';
export type LessonZeroHiraganaStage =
    | 'intro'
    | 'row-preview'
    | 'row-drill'
    | 'row-result'
    | 'mastery-ready'
    | 'mastery'
    | 'complete';

export interface LessonZeroHiraganaAttempt {
    readonly itemId: string;
    readonly phase: 'row' | 'mastery';
    readonly response: string;
    readonly outcome: 'pass' | 'lapse';
    readonly at: number;
}

export interface LessonZeroHiraganaSessionState {
    readonly schemaVersion: 1;
    readonly sessionId: typeof LESSON_ZERO_HIRAGANA_SESSION_ID;
    readonly status: 'ready' | 'active' | 'paused' | 'complete';
    readonly stage: LessonZeroHiraganaStage;
    readonly route: LessonZeroHiraganaRoute;
    readonly rowIndex: number;
    readonly queue: readonly string[];
    readonly guidedPassedItemIds: readonly string[];
    readonly masteryPassedItemIds: readonly string[];
    readonly repairedItemIds: readonly string[];
    readonly attempts: readonly LessonZeroHiraganaAttempt[];
}

export type LessonZeroHiraganaSessionAction =
    | { readonly kind: 'start-guided' }
    | { readonly kind: 'start-placement' }
    | { readonly kind: 'begin-row' }
    | { readonly kind: 'answer'; readonly response: string }
    | { readonly kind: 'next-row' }
    | { readonly kind: 'begin-mastery' }
    | { readonly kind: 'pause' }
    | { readonly kind: 'resume' };

export interface LessonZeroHiraganaAdaptiveEvidence {
    readonly eventId: string;
    readonly at: number;
    readonly modeId: 'lesson-zero-hiragana:row' | 'lesson-zero-hiragana:mastery';
    readonly skill: LearningSkill;
    readonly action: LearningAction;
    readonly sourceId: typeof LESSON_ZERO_HIRAGANA_BOOTCAMP_ID;
    readonly independent: boolean;
}

export interface LessonZeroHiraganaSessionTransition {
    readonly state: LessonZeroHiraganaSessionState;
    readonly evaluation?: ActivityEvaluation;
    readonly completionEvaluation?: ActivityEvaluation;
    readonly adaptive?: LessonZeroHiraganaAdaptiveEvidence;
}

export function startLessonZeroHiraganaSession(
    definition: LessonZeroHiraganaDefinition,
    snapshot?: LessonZeroHiraganaSessionState,
): LessonZeroHiraganaSessionState {
    validateDefinition(definition);
    if (snapshot !== undefined) {
        if (!lessonZeroHiraganaSessionSnapshotShapeIsValid(snapshot)) {
            throw new TypeError('Invalid Lesson Zero hiragana snapshot.');
        }
        validateSnapshotAgainstDefinition(definition, snapshot);
        return structuredClone(snapshot);
    }
    return {
        schemaVersion: 1,
        sessionId: LESSON_ZERO_HIRAGANA_SESSION_ID,
        status: 'ready',
        stage: 'intro',
        route: 'guided',
        rowIndex: 0,
        queue: [],
        guidedPassedItemIds: [],
        masteryPassedItemIds: [],
        repairedItemIds: [],
        attempts: [],
    };
}

export function restartLessonZeroHiraganaSession(
    definition: LessonZeroHiraganaDefinition,
): LessonZeroHiraganaSessionState {
    return startLessonZeroHiraganaSession(definition);
}

export function transitionLessonZeroHiraganaSession(
    definition: LessonZeroHiraganaDefinition,
    state: LessonZeroHiraganaSessionState,
    action: LessonZeroHiraganaSessionAction,
    at: number,
): LessonZeroHiraganaSessionTransition {
    validateDefinition(definition);
    validateSnapshotAgainstDefinition(definition, state);
    if (!Number.isSafeInteger(at) || at < 0) throw new TypeError('Hiragana transitions need a valid timestamp.');
    if (action.kind === 'start-guided') {
        requireState(state.status === 'ready', 'This hiragana route has already started.');
        return unchanged({ ...state, status: 'active', stage: 'row-preview', route: 'guided' });
    }
    if (action.kind === 'start-placement') {
        requireState(state.status === 'ready', 'This hiragana route has already started.');
        return unchanged({
            ...state,
            status: 'active',
            stage: 'mastery-ready',
            route: 'placement',
        });
    }
    if (action.kind === 'pause') {
        requireState(state.status === 'active', 'Only an active hiragana route can pause.');
        return unchanged({ ...state, status: 'paused' });
    }
    if (action.kind === 'resume') {
        requireState(state.status === 'paused', 'Only a paused hiragana route can resume.');
        return unchanged({ ...state, status: 'active' });
    }
    requireState(state.status === 'active', 'Start or resume the hiragana route first.');
    if (action.kind === 'begin-row') {
        requireState(state.stage === 'row-preview' && state.route === 'guided', 'Open a row before drilling it.');
        return unchanged({
            ...state,
            stage: 'row-drill',
            queue: [...definition.rows[state.rowIndex]!.itemIds],
        });
    }
    if (action.kind === 'answer') return answer(definition, state, action.response, at);
    if (action.kind === 'next-row') {
        requireState(state.stage === 'row-result' && state.route === 'guided', 'Clear the current row first.');
        if (state.rowIndex === definition.rows.length - 1) {
            return unchanged({ ...state, stage: 'mastery-ready', queue: [] });
        }
        return unchanged({
            ...state,
            stage: 'row-preview',
            rowIndex: state.rowIndex + 1,
            queue: [],
        });
    }
    if (action.kind === 'begin-mastery') {
        requireState(state.stage === 'mastery-ready', 'Finish the row route or choose the placement check first.');
        return unchanged({
            ...state,
            stage: 'mastery',
            queue: [...definition.masteryOrder],
            masteryPassedItemIds: [],
        });
    }
    return exhaustive(action);
}

export function lessonZeroHiraganaCurrentItem(
    definition: LessonZeroHiraganaDefinition,
    state: LessonZeroHiraganaSessionState,
): LessonZeroHiraganaItem | undefined {
    const id = state.queue[0];
    return id ? definition.items.find(item => item.id === id) : undefined;
}

export function lessonZeroHiraganaChoices(
    definition: LessonZeroHiraganaDefinition,
    itemId: string,
): readonly string[] {
    const item = requiredItem(definition, itemId);
    const index = definition.items.findIndex(candidate => candidate.id === itemId);
    const candidates = [
        item.romaji,
        definition.items[(index + 1) % definition.items.length]!.romaji,
        definition.items[(index + 5) % definition.items.length]!.romaji,
        definition.items[(index + 17) % definition.items.length]!.romaji,
    ];
    return deterministicUniqueOrder(candidates, itemId);
}

export function lessonZeroHiraganaSessionSnapshotShapeIsValid(
    value: unknown,
): value is LessonZeroHiraganaSessionState {
    if (!value || typeof value !== 'object') return false;
    const state = value as Partial<LessonZeroHiraganaSessionState>;
    if (state.schemaVersion !== 1
        || state.sessionId !== LESSON_ZERO_HIRAGANA_SESSION_ID
        || !['ready', 'active', 'paused', 'complete'].includes(state.status ?? '')
        || !['intro', 'row-preview', 'row-drill', 'row-result', 'mastery-ready', 'mastery', 'complete']
            .includes(state.stage ?? '')
        || !['guided', 'placement'].includes(state.route ?? '')
        || !Number.isSafeInteger(state.rowIndex)
        || (state.rowIndex ?? -1) < 0
        || (state.rowIndex ?? 10) > 9
        || !uniqueStringArray(state.queue)
        || !uniqueStringArray(state.guidedPassedItemIds)
        || !uniqueStringArray(state.masteryPassedItemIds)
        || !uniqueStringArray(state.repairedItemIds)
        || !Array.isArray(state.attempts)
        || !state.attempts.every(attemptShapeIsValid)) return false;
    if (state.status === 'ready') {
        return state.stage === 'intro'
            && state.route === 'guided'
            && state.queue.length === 0
            && state.attempts.length === 0;
    }
    if (state.status === 'complete') {
        return state.stage === 'complete'
            && state.queue.length === 0
            && state.masteryPassedItemIds.length === LESSON_ZERO_BASIC_HIRAGANA_COUNT;
    }
    if (state.stage === 'complete') return false;
    if (state.route === 'placement'
        && ['intro', 'row-preview', 'row-drill', 'row-result'].includes(state.stage ?? '')) return false;
    if (state.stage === 'row-drill' && state.queue.length === 0) return false;
    if (state.stage === 'mastery' && state.queue.length === 0) return false;
    return true;
}

function answer(
    definition: LessonZeroHiraganaDefinition,
    state: LessonZeroHiraganaSessionState,
    response: string,
    at: number,
): LessonZeroHiraganaSessionTransition {
    requireState(state.stage === 'row-drill' || state.stage === 'mastery', 'There is no hiragana prompt to answer.');
    const item = lessonZeroHiraganaCurrentItem(definition, state);
    requireState(Boolean(item), 'The hiragana queue is empty.');
    const phase = state.stage === 'mastery' ? 'mastery' : 'row';
    const normalized = normalizeRomaji(response);
    const outcome = item!.acceptedRomaji.some(answer => normalizeRomaji(answer) === normalized)
        ? 'pass'
        : 'lapse';
    const repairedBefore = state.repairedItemIds.includes(item!.id);
    const repairedItemIds = outcome === 'lapse'
        ? unique([...state.repairedItemIds, item!.id])
        : state.repairedItemIds;
    const queue = state.queue.slice(1);
    if (outcome === 'lapse') queue.push(item!.id);
    const guidedPassedItemIds = phase === 'row' && outcome === 'pass'
        ? unique([...state.guidedPassedItemIds, item!.id])
        : state.guidedPassedItemIds;
    const masteryPassedItemIds = phase === 'mastery' && outcome === 'pass'
        ? unique([...state.masteryPassedItemIds, item!.id])
        : state.masteryPassedItemIds;
    const attempt: LessonZeroHiraganaAttempt = {
        itemId: item!.id,
        phase,
        response,
        outcome,
        at,
    };
    const finalPass = phase === 'mastery'
        && outcome === 'pass'
        && queue.length === 0
        && masteryPassedItemIds.length === definition.items.length;
    const stage: LessonZeroHiraganaStage = finalPass
        ? 'complete'
        : queue.length === 0
            ? 'row-result'
            : state.stage;
    const nextState: LessonZeroHiraganaSessionState = {
        ...state,
        status: finalPass ? 'complete' : 'active',
        stage,
        queue,
        guidedPassedItemIds,
        masteryPassedItemIds,
        repairedItemIds,
        attempts: [...state.attempts, attempt],
    };
    const attemptNumber = state.attempts.filter(candidate =>
        candidate.itemId === item!.id && candidate.phase === phase).length + 1;
    const eventStem = `${LESSON_ZERO_HIRAGANA_SESSION_ID}:${phase}:${item!.id}:${attemptNumber}:${at}`;
    return {
        state: nextState,
        evaluation: itemEvaluation(item!, phase, outcome, response, eventStem),
        ...(finalPass ? {
            completionEvaluation: completionEvaluation(definition, nextState),
        } : {}),
        adaptive: {
            eventId: `${eventStem}:learning`,
            at,
            modeId: phase === 'row' ? 'lesson-zero-hiragana:row' : 'lesson-zero-hiragana:mastery',
            skill: 'kana',
            action: outcome === 'lapse' || repairedBefore ? 'repair' : phase === 'mastery' ? 'recall' : 'recognise',
            sourceId: LESSON_ZERO_HIRAGANA_BOOTCAMP_ID,
            independent: outcome === 'pass' && !repairedBefore,
        },
    };
}

function itemEvaluation(
    item: LessonZeroHiraganaItem,
    phase: 'row' | 'mastery',
    outcome: 'pass' | 'lapse',
    response: string,
    eventId: string,
): ActivityEvaluation {
    return {
        result: {
            outcome,
            score: outcome === 'pass' ? 1 : 0,
            errorTags: outcome === 'pass' ? [] : [`hiragana-reading:${item.id}`],
            feedback: outcome === 'pass'
                ? {
                    explanation: {
                        en: `${item.kana} = ${item.romaji}`,
                        ja: `${item.kana} は ${item.romaji} です。`,
                    },
                }
                : {
                    explanation: {
                        en: `${item.kana} = ${item.romaji}`,
                        ja: `${item.kana} は ${item.romaji} です。`,
                    },
                    repairPrompt: {
                        en: `Try ${item.kana} again soon.`,
                        ja: `${item.kana} は、あとでもう一度。`,
                    },
                    nearbyExample: {
                        en: `${item.kana} reads ${item.romaji}.`,
                        ja: `${item.kana} は ${item.romaji} と読みます。`,
                    },
                },
        },
        attempt: {
            kind: 'attempt-recorded',
            activityId: LESSON_ZERO_HIRAGANA_BOOTCAMP_ID,
            conceptIds: [item.conceptId],
            responseKind: phase === 'row' ? 'selected-romaji' : 'typed-romaji',
            outcome,
            score: outcome === 'pass' ? 1 : 0,
            errorTags: outcome === 'pass' ? [] : [`hiragana-reading:${item.id}`, `response:${normalizeRomaji(response) || 'blank'}`],
            eventId,
        },
        reviewSeeds: [],
    };
}

function completionEvaluation(
    definition: LessonZeroHiraganaDefinition,
    state: LessonZeroHiraganaSessionState,
): ActivityEvaluation {
    const reviewSeeds: readonly ReviewSeed[] = definition.items.map(item => ({
        id: `review:lesson-zero:hiragana:${item.id}`,
        conceptId: item.conceptId,
        reason: state.repairedItemIds.includes(item.id) ? 'repair' : 'new-learning',
        schedule: { dueAfterMs: 24 * 60 * 60 * 1_000 },
        content: {
            expression: item.kana,
            reading: item.kana,
            meanings: [item.romaji],
        },
    }));
    return {
        result: {
            outcome: 'pass',
            score: 1,
            errorTags: [],
            feedback: {
                explanation: {
                    en: 'All 46 basic hiragana are ready for review.',
                    ja: '基本のひらがな46字が復習に入りました。',
                },
            },
        },
        attempt: {
            kind: 'attempt-recorded',
            activityId: LESSON_ZERO_HIRAGANA_BOOTCAMP_ID,
            conceptIds: definition.items.map(item => item.conceptId),
            responseKind: 'complete-hiragana-recall',
            outcome: 'pass',
            score: 1,
            errorTags: [],
        },
        reviewSeeds,
    };
}

function validateDefinition(definition: LessonZeroHiraganaDefinition): void {
    if (definition.schemaVersion !== 1
        || definition.id !== LESSON_ZERO_HIRAGANA_SESSION_ID
        || definition.activityId !== LESSON_ZERO_HIRAGANA_BOOTCAMP_ID
        || definition.items.length !== LESSON_ZERO_BASIC_HIRAGANA_COUNT
        || definition.rows.length !== 10
        || definition.masteryOrder.length !== definition.items.length) {
        throw new TypeError('Invalid Lesson Zero hiragana definition.');
    }
    const itemIds = new Set(definition.items.map(item => item.id));
    if (itemIds.size !== definition.items.length
        || new Set(definition.items.map(item => item.kana)).size !== definition.items.length
        || new Set(definition.masteryOrder).size !== definition.items.length
        || definition.masteryOrder.some(id => !itemIds.has(id))
        || definition.rows.flatMap(row => row.itemIds).some(id => !itemIds.has(id))
        || new Set(definition.rows.flatMap(row => row.itemIds)).size !== definition.items.length) {
        throw new TypeError('Lesson Zero hiragana definition has duplicate or missing items.');
    }
}

function validateSnapshotAgainstDefinition(
    definition: LessonZeroHiraganaDefinition,
    state: LessonZeroHiraganaSessionState,
): void {
    if (!lessonZeroHiraganaSessionSnapshotShapeIsValid(state)) {
        throw new TypeError('Invalid Lesson Zero hiragana snapshot.');
    }
    const ids = new Set(definition.items.map(item => item.id));
    const allStateIds = [
        ...state.queue,
        ...state.guidedPassedItemIds,
        ...state.masteryPassedItemIds,
        ...state.repairedItemIds,
        ...state.attempts.map(attempt => attempt.itemId),
    ];
    if (allStateIds.some(id => !ids.has(id))) {
        throw new TypeError('Hiragana snapshot references an unknown item.');
    }
    if (state.stage === 'row-result') {
        const row = definition.rows[state.rowIndex]!;
        if (!row.itemIds.every(id => state.guidedPassedItemIds.includes(id))) {
            throw new TypeError('Hiragana row result is missing a clean item.');
        }
    }
    if (state.route === 'guided'
        && (state.stage === 'mastery-ready' || state.stage === 'mastery' || state.stage === 'complete')
        && state.guidedPassedItemIds.length !== definition.items.length) {
        throw new TypeError('Guided hiragana mastery opened before all rows were cleared.');
    }
}

function requiredItem(
    definition: LessonZeroHiraganaDefinition,
    itemId: string,
): LessonZeroHiraganaItem {
    const item = definition.items.find(candidate => candidate.id === itemId);
    if (!item) throw new TypeError(`Unknown hiragana item: ${itemId}`);
    return item;
}

function deterministicUniqueOrder(values: readonly string[], seed: string): string[] {
    const uniqueValues = unique(values);
    let value = hash(seed);
    for (let index = uniqueValues.length - 1; index > 0; index -= 1) {
        value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
        const swap = value % (index + 1);
        [uniqueValues[index], uniqueValues[swap]] = [uniqueValues[swap]!, uniqueValues[index]!];
    }
    return uniqueValues;
}

function hash(value: string): number {
    let result = 2166136261;
    for (const character of value) {
        result ^= character.codePointAt(0) ?? 0;
        result = Math.imul(result, 16777619);
    }
    return result >>> 0;
}

function normalizeRomaji(value: string): string {
    return value.normalize('NFKC').trim().toLocaleLowerCase('en').replace(/[\s._-]+/gu, '');
}

function unique(values: readonly string[]): string[] {
    return [...new Set(values)];
}

function uniqueStringArray(value: unknown): value is readonly string[] {
    return Array.isArray(value)
        && value.every(item => typeof item === 'string' && item.length > 0)
        && new Set(value).size === value.length;
}

function attemptShapeIsValid(value: unknown): value is LessonZeroHiraganaAttempt {
    if (!value || typeof value !== 'object') return false;
    const attempt = value as Partial<LessonZeroHiraganaAttempt>;
    return typeof attempt.itemId === 'string'
        && attempt.itemId.length > 0
        && ['row', 'mastery'].includes(attempt.phase ?? '')
        && typeof attempt.response === 'string'
        && ['pass', 'lapse'].includes(attempt.outcome ?? '')
        && Number.isSafeInteger(attempt.at)
        && (attempt.at ?? -1) >= 0;
}

function unchanged(state: LessonZeroHiraganaSessionState): LessonZeroHiraganaSessionTransition {
    return { state, };
}

function requireState(condition: boolean, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

function exhaustive(value: never): never {
    throw new TypeError(`Unsupported hiragana action: ${JSON.stringify(value)}`);
}
