import type { ActivityEvaluation, ReviewSeed } from './activity-runtime';
import type { LearnerEventInput, LearningAction, LearningSkill } from './learner-record';
import type { LocalizedText } from './source-library';

export const LESSON_ZERO_NAME_CARD_TOKEN_IDS = Object.freeze([
    'learner-name',
    'desu',
] as const);

export type LessonZeroNameCardTokenId = typeof LESSON_ZERO_NAME_CARD_TOKEN_IDS[number];

export interface LessonZeroNameCardToken {
    readonly id: LessonZeroNameCardTokenId;
    readonly text: string;
    readonly reading: string;
    readonly cue: LocalizedText;
}

export interface LessonZeroNameCardDefinition {
    readonly schemaVersion: 1;
    readonly id: 'session:lesson-zero-name-card-draft';
    readonly activityId: 'activity:lesson-zero-name-card-draft';
    readonly learnerName: string;
    readonly conceptIds: readonly string[];
    readonly tokens: readonly LessonZeroNameCardToken[];
    readonly correctOrder: readonly LessonZeroNameCardTokenId[];
    readonly model: Readonly<{
        japanese: string;
        reading: string;
        meaning: LocalizedText;
    }>;
    readonly response: Readonly<{
        speakerId: 'rie';
        japanese: string;
        reading: string;
        meaning: LocalizedText;
    }>;
}

export interface LessonZeroNameCardAttempt {
    readonly order: readonly LessonZeroNameCardTokenId[];
    readonly outcome: 'pass' | 'lapse';
    readonly score: number;
    readonly at: number;
}

export interface LessonZeroNameCardSessionState {
    readonly schemaVersion: 1;
    readonly sessionId: LessonZeroNameCardDefinition['id'];
    readonly status: 'active' | 'paused' | 'complete';
    readonly stage: 'build' | 'result' | 'complete';
    readonly selectedTokenIds: readonly LessonZeroNameCardTokenId[];
    readonly attempts: readonly LessonZeroNameCardAttempt[];
    readonly modelRevealed: boolean;
}

export type LessonZeroNameCardSessionAction =
    | { readonly kind: 'select-token'; readonly tokenId: LessonZeroNameCardTokenId }
    | { readonly kind: 'remove-token'; readonly tokenId: LessonZeroNameCardTokenId }
    | { readonly kind: 'clear-tokens' }
    | { readonly kind: 'check' }
    | { readonly kind: 'reveal-model' }
    | { readonly kind: 'retry' }
    | { readonly kind: 'pause' }
    | { readonly kind: 'resume' };

export interface LessonZeroNameCardAdaptiveEvidence {
    readonly eventId: string;
    readonly at: number;
    readonly modeId: 'lesson-zero-name-card';
    readonly skill: LearningSkill;
    readonly action: LearningAction;
    readonly sourceId: LessonZeroNameCardDefinition['activityId'];
    readonly independent: boolean;
}

export interface LessonZeroNameCardSessionTransition {
    readonly state: LessonZeroNameCardSessionState;
    readonly evaluation?: ActivityEvaluation;
    readonly adaptive?: LessonZeroNameCardAdaptiveEvidence;
    readonly supportEvents: readonly Extract<LearnerEventInput, { kind: 'support-used' }>[];
}

export function startLessonZeroNameCardSession(
    definition: LessonZeroNameCardDefinition,
    snapshot?: LessonZeroNameCardSessionState,
): LessonZeroNameCardSessionState {
    validateDefinition(definition);
    if (snapshot !== undefined) {
        if (!lessonZeroNameCardSessionSnapshotShapeIsValid(snapshot)) {
            throw new TypeError('Invalid Lesson Zero name-card snapshot.');
        }
        validateSnapshotAgainstDefinition(definition, snapshot);
        return structuredClone(snapshot);
    }
    return {
        schemaVersion: 1,
        sessionId: definition.id,
        status: 'active',
        stage: 'build',
        selectedTokenIds: [],
        attempts: [],
        modelRevealed: false,
    };
}

export function transitionLessonZeroNameCardSession(
    definition: LessonZeroNameCardDefinition,
    state: LessonZeroNameCardSessionState,
    action: LessonZeroNameCardSessionAction,
    at: number,
): LessonZeroNameCardSessionTransition {
    startLessonZeroNameCardSession(definition, state);
    if (!Number.isFinite(at)) throw new TypeError('Name-card transitions need a finite timestamp.');
    if (action.kind === 'pause') {
        if (state.status !== 'active') return unchanged(state);
        return unchanged({ ...state, status: 'paused' });
    }
    if (action.kind === 'resume') {
        if (state.status !== 'paused') return unchanged(state);
        return unchanged({ ...state, status: 'active' });
    }
    if (state.status !== 'active' || state.stage === 'complete') return unchanged(state);
    if (action.kind === 'select-token') {
        if (state.stage !== 'build'
            || state.selectedTokenIds.includes(action.tokenId)
            || !definition.correctOrder.includes(action.tokenId)) return unchanged(state);
        return unchanged({ ...state, selectedTokenIds: [...state.selectedTokenIds, action.tokenId] });
    }
    if (action.kind === 'remove-token') {
        if (state.stage !== 'build') return unchanged(state);
        return unchanged({
            ...state,
            selectedTokenIds: state.selectedTokenIds.filter(id => id !== action.tokenId),
        });
    }
    if (action.kind === 'clear-tokens') {
        if (state.stage !== 'build' || state.selectedTokenIds.length === 0) return unchanged(state);
        return unchanged({ ...state, selectedTokenIds: [] });
    }
    if (action.kind === 'retry') {
        if (state.stage !== 'result' || state.attempts.at(-1)?.outcome !== 'lapse') return unchanged(state);
        return unchanged({ ...state, stage: 'build', selectedTokenIds: [] });
    }
    if (action.kind === 'reveal-model') return revealModel(definition, state, at);
    if (action.kind === 'check') return check(definition, state, at);
    return unchanged(state);
}

export function lessonZeroNameCardSessionSnapshotShapeIsValid(
    value: unknown,
): value is LessonZeroNameCardSessionState {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<LessonZeroNameCardSessionState>;
    const selected = candidate.selectedTokenIds;
    const attempts = candidate.attempts;
    if (candidate.schemaVersion !== 1
        || candidate.sessionId !== 'session:lesson-zero-name-card-draft'
        || !['active', 'paused', 'complete'].includes(candidate.status ?? '')
        || !['build', 'result', 'complete'].includes(candidate.stage ?? '')
        || !tokenSetIsValid(selected)
        || typeof candidate.modelRevealed !== 'boolean'
        || !Array.isArray(attempts)
        || !attempts.every(attemptShapeIsValid)) return false;
    if (candidate.status === 'complete') {
        return candidate.stage === 'complete' && attempts.at(-1)?.outcome === 'pass';
    }
    if (candidate.stage === 'complete') return false;
    if (candidate.stage === 'result') return attempts.at(-1)?.outcome === 'lapse';
    return true;
}

export function lessonZeroNameCardLine(definition: LessonZeroNameCardDefinition): string {
    return `${definition.learnerName}です。`;
}

function check(
    definition: LessonZeroNameCardDefinition,
    state: LessonZeroNameCardSessionState,
    at: number,
): LessonZeroNameCardSessionTransition {
    if (state.stage !== 'build' || state.selectedTokenIds.length !== definition.correctOrder.length) {
        return unchanged(state);
    }
    const correctPositions = state.selectedTokenIds.filter((id, index) => definition.correctOrder[index] === id).length;
    const score = correctPositions / definition.correctOrder.length;
    const outcome = score === 1 ? 'pass' : 'lapse';
    const attempt: LessonZeroNameCardAttempt = {
        order: [...state.selectedTokenIds],
        outcome,
        score,
        at,
    };
    const repairing = outcome === 'lapse' || state.attempts.some(candidate => candidate.outcome === 'lapse');
    const eventId = `${definition.id}:attempt:${state.attempts.length + 1}:${at}`;
    const nextState: LessonZeroNameCardSessionState = {
        ...state,
        status: outcome === 'pass' ? 'complete' : 'active',
        stage: outcome === 'pass' ? 'complete' : 'result',
        attempts: [...state.attempts, attempt],
    };
    return {
        state: nextState,
        evaluation: evaluationFor(definition, attempt, repairing, eventId),
        adaptive: {
            eventId: `${eventId}:learning`,
            at,
            modeId: 'lesson-zero-name-card',
            skill: 'grammar',
            action: repairing ? 'repair' : 'produce',
            sourceId: definition.activityId,
            independent: !repairing,
        },
        supportEvents: [],
    };
}

function revealModel(
    definition: LessonZeroNameCardDefinition,
    state: LessonZeroNameCardSessionState,
    at: number,
): LessonZeroNameCardSessionTransition {
    if (state.stage !== 'result' || state.attempts.at(-1)?.outcome !== 'lapse' || state.modelRevealed) {
        return unchanged(state);
    }
    const stem = `${definition.id}:support:${at}`;
    return {
        state: { ...state, modelRevealed: true },
        supportEvents: [
            supportEvent(definition.activityId, 'transcript', `${stem}:transcript`, at),
            supportEvent(definition.activityId, 'translation', `${stem}:translation`, at),
            supportEvent(definition.activityId, 'model-answer', `${stem}:model`, at),
        ],
    };
}

function evaluationFor(
    definition: LessonZeroNameCardDefinition,
    attempt: LessonZeroNameCardAttempt,
    repairing: boolean,
    eventId: string,
): ActivityEvaluation {
    const errorTags = attempt.outcome === 'pass' ? [] : ['name-card:word-order'];
    const reviewSeeds: readonly ReviewSeed[] = attempt.outcome === 'pass' ? [{
        id: 'review:lesson-zero:name-card:desu',
        conceptId: 'concept:copula-affirmative',
        reason: repairing ? 'repair' : 'new-learning',
        content: {
            expression: 'りえです。',
            reading: 'りえです',
            meanings: ["I'm Rie."],
            sentence: 'りえです。',
        },
    }] : [];
    return {
        attempt: {
            kind: 'attempt-recorded',
            eventId,
            at: attempt.at,
            activityId: definition.activityId,
            conceptIds: definition.conceptIds,
            responseKind: 'tapped-name-card-frame',
            outcome: attempt.outcome,
            score: attempt.score,
            ...(errorTags.length ? { errorTags } : {}),
        },
        result: {
            outcome: attempt.outcome,
            score: attempt.score,
            errorTags,
            feedback: attempt.outcome === 'pass'
                ? {
                    explanation: {
                        en: 'Your name comes first. です finishes the introduction.',
                        ja: '名前が先です。「です」で自己紹介を終えます。',
                    },
                }
                : {
                    explanation: {
                        en: 'Keep your name first, just as Rie did in her example.',
                        ja: 'りえ先生の例と同じように、名前を先に置きましょう。',
                    },
                    repairPrompt: {
                        en: 'Try the two pieces again.',
                        ja: '二つをもう一度並べましょう。',
                    },
                },
        },
        reviewSeeds,
    };
}

function validateDefinition(definition: LessonZeroNameCardDefinition): void {
    if (definition.schemaVersion !== 1
        || definition.id !== 'session:lesson-zero-name-card-draft'
        || definition.activityId !== 'activity:lesson-zero-name-card-draft'
        || !definition.learnerName.trim()
        || definition.conceptIds.length !== 2
        || !sameList(definition.correctOrder, LESSON_ZERO_NAME_CARD_TOKEN_IDS)
        || !sameList(definition.tokens.map(token => token.id), LESSON_ZERO_NAME_CARD_TOKEN_IDS)
        || definition.tokens.some(token => !token.text.trim() || !token.reading.trim())) {
        throw new TypeError('Invalid Lesson Zero name-card definition.');
    }
}

function validateSnapshotAgainstDefinition(
    definition: LessonZeroNameCardDefinition,
    snapshot: LessonZeroNameCardSessionState,
): void {
    const validIds = new Set(definition.correctOrder);
    if (snapshot.selectedTokenIds.some(id => !validIds.has(id))
        || snapshot.attempts.some(attempt => attempt.order.some(id => !validIds.has(id)))) {
        throw new TypeError('Lesson Zero name-card snapshot contains an unknown piece.');
    }
}

function tokenSetIsValid(value: unknown): value is readonly LessonZeroNameCardTokenId[] {
    return Array.isArray(value)
        && value.length <= LESSON_ZERO_NAME_CARD_TOKEN_IDS.length
        && new Set(value).size === value.length
        && value.every(id => LESSON_ZERO_NAME_CARD_TOKEN_IDS.includes(id));
}

function attemptShapeIsValid(value: unknown): value is LessonZeroNameCardAttempt {
    if (!value || typeof value !== 'object') return false;
    const attempt = value as Partial<LessonZeroNameCardAttempt>;
    return tokenSetIsValid(attempt.order)
        && attempt.order.length === LESSON_ZERO_NAME_CARD_TOKEN_IDS.length
        && (attempt.outcome === 'pass' || attempt.outcome === 'lapse')
        && typeof attempt.score === 'number'
        && Number.isFinite(attempt.score)
        && attempt.score >= 0
        && attempt.score <= 1
        && typeof attempt.at === 'number'
        && Number.isFinite(attempt.at);
}

function supportEvent(
    activityId: LessonZeroNameCardDefinition['activityId'],
    supportKind: 'transcript' | 'translation' | 'model-answer',
    eventId: string,
    at: number,
): Extract<LearnerEventInput, { kind: 'support-used' }> {
    return { kind: 'support-used', eventId, at, activityId, supportKind };
}

function sameList<T>(actual: readonly T[], expected: readonly T[]): boolean {
    return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function unchanged(state: LessonZeroNameCardSessionState): LessonZeroNameCardSessionTransition {
    return { state, supportEvents: [] };
}
