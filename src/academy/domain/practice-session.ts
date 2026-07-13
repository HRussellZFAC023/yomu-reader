import type { LearnerEventInput, LearningAction, LearningSkill } from './learner-record';
import type { AcademyModeId } from './mode-registry';
import { validateAnswerSupportContract, type AnswerSupportContract } from './activity-runtime';
export interface PracticeItem {
    readonly id: string;
    readonly deckId: string;
    readonly ordinal: number;
    readonly prompt: string;
    readonly acceptedAnswers: readonly string[];
    readonly conceptIds: readonly string[];
    readonly skill: LearningSkill;
    readonly action: LearningAction;
    readonly sourceId?: string;
    readonly kanji?: string;
    readonly answerSupport: AnswerSupportContract;
}

export interface PracticePrompt {
    readonly id: string;
    readonly prompt: string;
    readonly skill: LearningSkill;
    readonly action: LearningAction;
    readonly preCommitChoiceStyle: 'neutral';
    readonly answerBearingSupport: 'hidden';
    readonly earnedHintAvailable: boolean;
}

export interface PracticeCommitment {
    readonly kind: 'learner-commitment';
    readonly response: string;
}

export interface PracticeDeckSelection {
    readonly deckId: string;
    readonly weight: number;
    readonly range?: { readonly start: number; readonly end: number };
}

export interface PracticePlan {
    readonly sessionId: string;
    readonly modeId: AcademyModeId;
    readonly items: readonly PracticeItem[];
    readonly decks: readonly PracticeDeckSelection[];
    readonly answerTimeMs?: number;
}

export interface PracticeAttempt {
    readonly itemId: string;
    readonly outcome: 'pass' | 'lapse';
    readonly response: string;
    readonly at: number;
}

export interface PracticeSessionState {
    readonly schemaVersion: 1;
    readonly sessionId: string;
    readonly modeId: AcademyModeId;
    readonly status: 'active' | 'paused' | 'complete';
    readonly queue: readonly string[];
    readonly attempts: readonly PracticeAttempt[];
    readonly repairPassesRemaining: Readonly<Record<string, number>>;
    readonly timePressureEnabled: boolean;
    readonly itemRemainingMs: number | null;
}

export interface PracticeTransition {
    readonly state: PracticeSessionState;
    readonly evidence: Extract<LearnerEventInput, { kind: 'learning-evidence-recorded' }> | null;
}

export function startPracticeSession(plan: PracticePlan, random: () => number = Math.random): PracticeSessionState {
    validatePlan(plan);
    const queue = interleaveDecks(plan, random);
    return {
        schemaVersion: 1,
        sessionId: plan.sessionId,
        modeId: plan.modeId,
        status: queue.length ? 'active' : 'complete',
        queue,
        attempts: [],
        repairPassesRemaining: {},
        timePressureEnabled: plan.modeId === 'inferno-pressure',
        itemRemainingMs: plan.modeId === 'inferno-pressure' ? requireAnswerTime(plan) : null,
    };
}

export function answerPracticeItem(
    plan: PracticePlan,
    state: PracticeSessionState,
    commitment: PracticeCommitment,
    at: number,
): PracticeTransition {
    const item = currentItem(plan, state);
    if (commitment.kind !== 'learner-commitment') throw new TypeError('Practice evidence requires a learner commitment.');
    const response = commitment.response;
    const outcome = item.acceptedAnswers.some(answer => normalized(answer) === normalized(response)) ? 'pass' : 'lapse';
    return resolveAttempt(plan, state, item, response, outcome, at);
}

export function currentPracticePrompt(plan: PracticePlan, state: PracticeSessionState): PracticePrompt {
    const item = currentItem(plan, state);
    return {
        id: item.id,
        prompt: item.prompt,
        skill: item.skill,
        action: item.action,
        preCommitChoiceStyle: item.answerSupport.preCommitChoiceStyle,
        answerBearingSupport: 'hidden',
        earnedHintAvailable: state.attempts.some(attempt => attempt.itemId === item.id && attempt.outcome === 'lapse'),
    };
}

export function skipPracticeItem(plan: PracticePlan, state: PracticeSessionState, at: number): PracticeTransition {
    return resolveAttempt(plan, state, currentItem(plan, state), '', 'lapse', at);
}

export function advancePracticeTime(plan: PracticePlan, state: PracticeSessionState, elapsedMs: number, at: number): PracticeTransition {
    if (state.modeId !== 'inferno-pressure' || !state.timePressureEnabled) return { state, evidence: null };
    active(state);
    if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 0) throw new TypeError('elapsedMs must be a non-negative integer.');
    const remaining = Math.max(0, (state.itemRemainingMs ?? requireAnswerTime(plan)) - elapsedMs);
    if (remaining > 0) return { state: { ...state, itemRemainingMs: remaining }, evidence: null };
    return resolveAttempt(plan, state, currentItem(plan, state), '', 'lapse', at);
}

export function disablePracticeTimePressure(state: PracticeSessionState): PracticeSessionState {
    if (state.modeId !== 'inferno-pressure') return state;
    return { ...state, timePressureEnabled: false, itemRemainingMs: null };
}

export function pausePracticeSession(state: PracticeSessionState): PracticeSessionState {
    active(state);
    return { ...state, status: 'paused' };
}

export function resumePracticeSession(snapshot: unknown, plan: PracticePlan): PracticeSessionState {
    const state = validateSnapshot(snapshot, plan);
    return state.status === 'complete' ? state : { ...state, status: 'active' };
}

export function savePracticeSession(state: PracticeSessionState): string {
    return JSON.stringify(state);
}

export interface PracticeReport {
    readonly sessionId: string;
    readonly attempts: number;
    readonly passed: number;
    readonly lapsed: number;
    readonly repairedItemIds: readonly string[];
    readonly unresolvedItemIds: readonly string[];
}

export function buildPracticeReport(state: PracticeSessionState): PracticeReport {
    const lastForItem = new Map<string, PracticeAttempt>();
    state.attempts.forEach(attempt => lastForItem.set(attempt.itemId, attempt));
    const lapsedIds = new Set(state.attempts.filter(attempt => attempt.outcome === 'lapse').map(attempt => attempt.itemId));
    const repairedItemIds = [...lapsedIds].filter(id => lastForItem.get(id)?.outcome === 'pass').sort();
    const unresolvedItemIds = [...lapsedIds].filter(id => lastForItem.get(id)?.outcome !== 'pass').sort();
    return {
        sessionId: state.sessionId,
        attempts: state.attempts.length,
        passed: state.attempts.filter(attempt => attempt.outcome === 'pass').length,
        lapsed: state.attempts.filter(attempt => attempt.outcome === 'lapse').length,
        repairedItemIds,
        unresolvedItemIds,
    };
}

function resolveAttempt(
    plan: PracticePlan,
    state: PracticeSessionState,
    item: PracticeItem,
    response: string,
    outcome: 'pass' | 'lapse',
    at: number,
): PracticeTransition {
    const remaining = { ...state.repairPassesRemaining };
    if (outcome === 'lapse') remaining[item.id] = plan.modeId === 'mastery-conquest' ? 2 : 0;
    else if ((remaining[item.id] ?? 0) > 0) remaining[item.id] -= 1;
    const queue = state.queue.slice(1);
    if (shouldReinsert(plan.modeId, outcome, remaining[item.id] ?? 0)) {
        const distance = Math.min(queue.length, plan.modeId === 'mastery-conquest' ? 3 : 1);
        queue.splice(distance, 0, item.id);
    }
    const attempt = { itemId: item.id, outcome, response, at } as const;
    const nextState: PracticeSessionState = {
        ...state,
        status: queue.length ? 'active' : 'complete',
        queue,
        attempts: [...state.attempts, attempt],
        repairPassesRemaining: remaining,
        itemRemainingMs: queue.length && plan.modeId === 'inferno-pressure' && state.timePressureEnabled ? requireAnswerTime(plan) : null,
    };
    return {
        state: nextState,
        evidence: {
            kind: 'learning-evidence-recorded',
            at,
            activityId: item.id,
            modeId: plan.modeId,
            skill: item.skill,
            action: plan.modeId === 'repair-review' ? 'repair' : item.action,
            outcome,
            conceptIds: item.conceptIds,
            ...(item.sourceId ? { sourceId: item.sourceId } : {}),
            independent: true,
            ...(item.kanji ? { kanji: item.kanji } : {}),
        },
    };
}

function shouldReinsert(mode: AcademyModeId, outcome: 'pass' | 'lapse', passesRemaining: number): boolean {
    if (mode === 'mastery-conquest') return outcome === 'lapse' || passesRemaining > 0;
    return mode === 'repair-review' && outcome === 'lapse';
}

function interleaveDecks(plan: PracticePlan, random: () => number): string[] {
    const pools = new Map(plan.decks.map(selection => [selection.deckId, plan.items
        .filter(item => item.deckId === selection.deckId && inRange(item.ordinal, selection.range))
        .map(item => item.id)]));
    const queue: string[] = [];
    while ([...pools.values()].some(pool => pool.length)) {
        const available = plan.decks.filter(deck => (pools.get(deck.deckId)?.length ?? 0) > 0);
        const total = available.reduce((sum, deck) => sum + deck.weight, 0);
        let draw = Math.min(0.999999, Math.max(0, random())) * total;
        const selected = available.find(deck => (draw -= deck.weight) < 0) ?? available.at(-1);
        const itemId = selected ? pools.get(selected.deckId)?.shift() : undefined;
        if (itemId) queue.push(itemId);
    }
    return queue;
}

function currentItem(plan: PracticePlan, state: PracticeSessionState): PracticeItem {
    active(state);
    const id = state.queue[0];
    const item = plan.items.find(candidate => candidate.id === id);
    if (!item) throw new Error(`Practice item ${id ?? '(none)'} is missing.`);
    return item;
}

function active(state: PracticeSessionState): void {
    if (state.status !== 'active') throw new Error(`Practice session is ${state.status}.`);
}

function validatePlan(plan: PracticePlan): void {
    if (!plan.sessionId.trim() || !plan.items.length || !plan.decks.length) throw new TypeError('Practice plan needs an id, items, and decks.');
    if (new Set(plan.items.map(item => item.id)).size !== plan.items.length) throw new TypeError('Practice item ids must be unique.');
    if (new Set(plan.decks.map(deck => deck.deckId)).size !== plan.decks.length) throw new TypeError('Practice deck ids must be unique.');
    plan.decks.forEach(deck => {
        if (!(deck.weight > 0)) throw new TypeError('Deck weight must be positive.');
        if (deck.range && (deck.range.start < 1 || deck.range.end < deck.range.start)) throw new TypeError('Invalid deck range.');
    });
    plan.items.forEach(item => {
        if (!item.acceptedAnswers.length || !item.conceptIds.length || item.ordinal < 1) throw new TypeError(`Practice item ${item.id} is incomplete.`);
        const issues = validateAnswerSupportContract(item.answerSupport);
        if (issues.length) throw new TypeError(`Practice item ${item.id} has unsafe answer support: ${issues.map(issue => issue.message).join('; ')}`);
    });
    if (plan.modeId === 'inferno-pressure') requireAnswerTime(plan);
}

function validateSnapshot(snapshot: unknown, plan: PracticePlan): PracticeSessionState {
    const state = typeof snapshot === 'string' ? JSON.parse(snapshot) as PracticeSessionState : structuredClone(snapshot) as PracticeSessionState;
    if (!state || state.schemaVersion !== 1 || state.sessionId !== plan.sessionId || state.modeId !== plan.modeId) throw new TypeError('Incompatible practice snapshot.');
    if (!['active', 'paused', 'complete'].includes(state.status) || typeof state.timePressureEnabled !== 'boolean') throw new TypeError('Invalid practice snapshot state.');
    if (state.timePressureEnabled !== (state.modeId === 'inferno-pressure') && state.timePressureEnabled) throw new TypeError('Only Inferno can enable time pressure.');
    if (!state.timePressureEnabled && state.itemRemainingMs !== null) throw new TypeError('Untimed practice cannot have remaining time.');
    if (!Array.isArray(state.queue) || !Array.isArray(state.attempts) || !state.repairPassesRemaining || typeof state.repairPassesRemaining !== 'object') {
        throw new TypeError('Practice snapshot collections are invalid.');
    }
    const ids = new Set(plan.items.map(item => item.id));
    if (!state.queue.every(id => ids.has(id)) || !state.attempts.every(attempt => ids.has(attempt.itemId))) throw new TypeError('Practice snapshot references unknown items.');
    if (state.status === 'complete' && state.queue.length || state.status === 'active' && !state.queue.length) throw new TypeError('Practice snapshot status does not match its queue.');
    if (state.itemRemainingMs !== null && (!Number.isSafeInteger(state.itemRemainingMs) || state.itemRemainingMs < 0 || state.itemRemainingMs > requireAnswerTime(plan))) {
        throw new TypeError('Practice snapshot has an invalid remaining time.');
    }
    for (const [itemId, count] of Object.entries(state.repairPassesRemaining)) {
        if (!ids.has(itemId) || !Number.isSafeInteger(count) || count < 0) throw new TypeError('Practice snapshot has invalid repair state.');
    }
    state.attempts.forEach(attempt => {
        if (!['pass', 'lapse'].includes(attempt.outcome) || typeof attempt.response !== 'string' || !Number.isSafeInteger(attempt.at) || attempt.at < 0) {
            throw new TypeError('Practice snapshot has an invalid attempt.');
        }
    });
    return state;
}

function requireAnswerTime(plan: PracticePlan): number {
    if (!Number.isSafeInteger(plan.answerTimeMs) || Number(plan.answerTimeMs) < 1) throw new TypeError('Inferno needs a positive answerTimeMs.');
    return Number(plan.answerTimeMs);
}

function inRange(ordinal: number, range?: PracticeDeckSelection['range']): boolean {
    return !range || (ordinal >= range.start && ordinal <= range.end);
}

function normalized(value: string): string {
    return value.normalize('NFKC').trim().toLocaleLowerCase('ja-JP');
}
