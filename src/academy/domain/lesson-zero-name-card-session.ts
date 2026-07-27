import type { ActivityEvaluation, ReviewSeed } from './activity-runtime';
import type { LearnerEventInput, LearningAction, LearningSkill } from './learner-record';
import type { LocalizedText } from './source-library';

export const LESSON_ZERO_NAME_CARD_TOKEN_IDS = Object.freeze([
    'learner-name',
    'desu',
] as const);

export const LESSON_ZERO_NAME_CARD_VARIANTS = Object.freeze([
    'katakana',
    'usual',
] as const);

export const LESSON_ZERO_NAME_CARD_TRANSFER_IDS = Object.freeze([
    'rie',
    'learner',
    'reversed',
] as const);

export type LessonZeroNameCardTokenId = typeof LESSON_ZERO_NAME_CARD_TOKEN_IDS[number];
export type LessonZeroNameCardVariant = typeof LESSON_ZERO_NAME_CARD_VARIANTS[number];
export type LessonZeroNameCardTransferId = typeof LESSON_ZERO_NAME_CARD_TRANSFER_IDS[number];
export type LessonZeroNameCardStage =
    | 'build'
    | 'build-result'
    | 'transfer'
    | 'transfer-result'
    | 'complete';

export interface LessonZeroNameCardToken {
    readonly id: LessonZeroNameCardTokenId;
    readonly text: string;
    readonly reading: string;
    readonly cue: LocalizedText;
}

export interface LessonZeroNameCardDefinition {
    readonly schemaVersion: 2;
    readonly id: 'session:lesson-zero-name-card-draft';
    readonly activityId: 'activity:lesson-zero-name-card-draft';
    readonly usualName: string;
    readonly katakanaName: string | null;
    readonly defaultNameVariant: LessonZeroNameCardVariant;
    readonly conceptIds: readonly string[];
    readonly tokens: readonly LessonZeroNameCardToken[];
    readonly correctOrder: readonly LessonZeroNameCardTokenId[];
    readonly model: Readonly<{
        japanese: string;
        reading: string;
        focusJapanese: 'りえです。';
        meaning: LocalizedText;
        bindingId: 'lesson-zero:greeting-rie-model';
    }>;
    readonly response: Readonly<{
        speakerId: 'rie';
        japanese: string;
        reading: string;
        meaning: LocalizedText;
        bindingId: 'lesson-zero:sentence-frame:noun-link:response';
    }>;
}

export interface LessonZeroNameCardBuildAttempt {
    readonly phase: 'build';
    readonly order: readonly LessonZeroNameCardTokenId[];
    readonly outcome: 'pass' | 'lapse';
    readonly score: number;
    readonly at: number;
}

export interface LessonZeroNameCardTransferAttempt {
    readonly phase: 'transfer';
    readonly selectedId: LessonZeroNameCardTransferId;
    readonly outcome: 'pass' | 'lapse';
    readonly score: number;
    readonly at: number;
}

export type LessonZeroNameCardAttempt =
    | LessonZeroNameCardBuildAttempt
    | LessonZeroNameCardTransferAttempt;

export interface LessonZeroNameCardSessionState {
    readonly schemaVersion: 2;
    readonly sessionId: LessonZeroNameCardDefinition['id'];
    readonly status: 'active' | 'paused' | 'complete';
    readonly stage: LessonZeroNameCardStage;
    readonly nameVariant: LessonZeroNameCardVariant;
    readonly selectedTokenIds: readonly LessonZeroNameCardTokenId[];
    readonly selectedTransferId: LessonZeroNameCardTransferId | null;
    readonly attempts: readonly LessonZeroNameCardAttempt[];
    readonly modelRevealed: boolean;
}

export type LessonZeroNameCardSessionAction =
    | { readonly kind: 'choose-name-variant'; readonly variant: LessonZeroNameCardVariant }
    | { readonly kind: 'select-token'; readonly tokenId: LessonZeroNameCardTokenId }
    | { readonly kind: 'remove-token'; readonly tokenId: LessonZeroNameCardTokenId }
    | { readonly kind: 'clear-tokens' }
    | { readonly kind: 'select-transfer'; readonly transferId: LessonZeroNameCardTransferId }
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
        schemaVersion: 2,
        sessionId: definition.id,
        status: 'active',
        stage: 'build',
        nameVariant: definition.defaultNameVariant,
        selectedTokenIds: [],
        selectedTransferId: null,
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
    if (action.kind === 'choose-name-variant') {
        if (state.stage !== 'build'
            || action.variant === state.nameVariant
            || (action.variant === 'katakana' && !definition.katakanaName)) return unchanged(state);
        return unchanged({
            ...state,
            nameVariant: action.variant,
            selectedTokenIds: [],
        });
    }
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
    if (action.kind === 'select-transfer') {
        if (state.stage !== 'transfer' || !LESSON_ZERO_NAME_CARD_TRANSFER_IDS.includes(action.transferId)) {
            return unchanged(state);
        }
        return unchanged({ ...state, selectedTransferId: action.transferId });
    }
    if (action.kind === 'retry') return retry(state);
    if (action.kind === 'reveal-model') return revealModel(definition, state, at);
    if (action.kind === 'check') {
        if (state.stage === 'build') return checkBuild(definition, state, at);
        if (state.stage === 'transfer') return checkTransfer(definition, state, at);
    }
    return unchanged(state);
}

export function lessonZeroNameCardSessionSnapshotShapeIsValid(
    value: unknown,
): value is LessonZeroNameCardSessionState {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<LessonZeroNameCardSessionState>;
    const selected = candidate.selectedTokenIds;
    const attempts = candidate.attempts;
    if (candidate.schemaVersion !== 2
        || candidate.sessionId !== 'session:lesson-zero-name-card-draft'
        || !['active', 'paused', 'complete'].includes(candidate.status ?? '')
        || !['build', 'build-result', 'transfer', 'transfer-result', 'complete'].includes(candidate.stage ?? '')
        || !LESSON_ZERO_NAME_CARD_VARIANTS.includes(candidate.nameVariant as LessonZeroNameCardVariant)
        || !tokenSetIsValid(selected)
        || (candidate.selectedTransferId !== null
            && !LESSON_ZERO_NAME_CARD_TRANSFER_IDS.includes(candidate.selectedTransferId as LessonZeroNameCardTransferId))
        || typeof candidate.modelRevealed !== 'boolean'
        || !Array.isArray(attempts)
        || !attempts.every(attemptShapeIsValid)) return false;
    if (candidate.status === 'complete') {
        return candidate.stage === 'complete'
            && attempts.at(-1)?.phase === 'transfer'
            && attempts.at(-1)?.outcome === 'pass';
    }
    if (candidate.stage === 'complete') return false;
    if (candidate.stage === 'build-result') {
        return attempts.at(-1)?.phase === 'build' && attempts.at(-1)?.outcome === 'lapse';
    }
    if (candidate.stage === 'transfer') {
        return attempts.some(attempt => attempt.phase === 'build' && attempt.outcome === 'pass');
    }
    if (candidate.stage === 'transfer-result') {
        return attempts.at(-1)?.phase === 'transfer' && attempts.at(-1)?.outcome === 'lapse';
    }
    return true;
}

export function lessonZeroNameCardDisplayName(
    definition: LessonZeroNameCardDefinition,
    variant: LessonZeroNameCardVariant = definition.defaultNameVariant,
): string {
    return variant === 'katakana' && definition.katakanaName
        ? definition.katakanaName
        : definition.usualName;
}

export function lessonZeroNameCardLine(
    definition: LessonZeroNameCardDefinition,
    variant: LessonZeroNameCardVariant = definition.defaultNameVariant,
): string {
    return `${lessonZeroNameCardDisplayName(definition, variant)}です。`;
}

export function lessonZeroNameCardToken(
    definition: LessonZeroNameCardDefinition,
    variant: LessonZeroNameCardVariant,
    tokenId: LessonZeroNameCardTokenId,
): LessonZeroNameCardToken {
    const token = definition.tokens.find(candidate => candidate.id === tokenId);
    if (!token) throw new TypeError(`Unknown name-card piece: ${tokenId}.`);
    if (tokenId !== 'learner-name') return token;
    const text = lessonZeroNameCardDisplayName(definition, variant);
    return { ...token, text, reading: text };
}

export function lessonZeroNameCardTransferLine(
    definition: LessonZeroNameCardDefinition,
    state: Pick<LessonZeroNameCardSessionState, 'nameVariant'>,
    transferId: LessonZeroNameCardTransferId,
): string {
    if (transferId === 'rie') return 'りえです。';
    if (transferId === 'learner') return lessonZeroNameCardLine(definition, state.nameVariant);
    return 'です。りえ';
}

function checkBuild(
    definition: LessonZeroNameCardDefinition,
    state: LessonZeroNameCardSessionState,
    at: number,
): LessonZeroNameCardSessionTransition {
    if (state.selectedTokenIds.length !== definition.correctOrder.length) return unchanged(state);
    const correctPositions = state.selectedTokenIds.filter(
        (id, index) => definition.correctOrder[index] === id,
    ).length;
    const attempt: LessonZeroNameCardBuildAttempt = {
        phase: 'build',
        order: [...state.selectedTokenIds],
        outcome: correctPositions === definition.correctOrder.length ? 'pass' : 'lapse',
        score: correctPositions / definition.correctOrder.length,
        at,
    };
    const eventId = `${definition.id}:build:${state.attempts.length + 1}:${at}`;
    const repairing = attempt.outcome === 'lapse'
        || state.attempts.some(candidate => candidate.outcome === 'lapse');
    const nextState: LessonZeroNameCardSessionState = {
        ...state,
        stage: attempt.outcome === 'pass' ? 'transfer' : 'build-result',
        selectedTokenIds: [],
        selectedTransferId: null,
        attempts: [...state.attempts, attempt],
        modelRevealed: false,
    };
    return {
        state: nextState,
        evaluation: evaluationFor(definition, attempt, repairing, eventId),
        adaptive: adaptiveFor(definition, attempt, repairing, eventId),
        supportEvents: [],
    };
}

function checkTransfer(
    definition: LessonZeroNameCardDefinition,
    state: LessonZeroNameCardSessionState,
    at: number,
): LessonZeroNameCardSessionTransition {
    if (!state.selectedTransferId) return unchanged(state);
    const attempt: LessonZeroNameCardTransferAttempt = {
        phase: 'transfer',
        selectedId: state.selectedTransferId,
        outcome: state.selectedTransferId === 'rie' ? 'pass' : 'lapse',
        score: state.selectedTransferId === 'rie' ? 1 : 0,
        at,
    };
    const eventId = `${definition.id}:transfer:${state.attempts.length + 1}:${at}`;
    const repairing = attempt.outcome === 'lapse'
        || state.attempts.some(candidate => candidate.outcome === 'lapse');
    const nextState: LessonZeroNameCardSessionState = {
        ...state,
        status: attempt.outcome === 'pass' ? 'complete' : 'active',
        stage: attempt.outcome === 'pass' ? 'complete' : 'transfer-result',
        selectedTransferId: null,
        attempts: [...state.attempts, attempt],
        modelRevealed: false,
    };
    return {
        state: nextState,
        evaluation: evaluationFor(definition, attempt, repairing, eventId),
        adaptive: adaptiveFor(definition, attempt, repairing, eventId),
        supportEvents: [],
    };
}

function retry(state: LessonZeroNameCardSessionState): LessonZeroNameCardSessionTransition {
    if (state.stage === 'build-result' && state.attempts.at(-1)?.outcome === 'lapse') {
        return unchanged({
            ...state,
            stage: 'build',
            selectedTokenIds: [],
            modelRevealed: false,
        });
    }
    if (state.stage === 'transfer-result' && state.attempts.at(-1)?.outcome === 'lapse') {
        return unchanged({
            ...state,
            stage: 'transfer',
            selectedTransferId: null,
            modelRevealed: false,
        });
    }
    return unchanged(state);
}

function revealModel(
    definition: LessonZeroNameCardDefinition,
    state: LessonZeroNameCardSessionState,
    at: number,
): LessonZeroNameCardSessionTransition {
    if (!['build-result', 'transfer-result'].includes(state.stage)
        || state.attempts.at(-1)?.outcome !== 'lapse'
        || state.modelRevealed) return unchanged(state);
    const phase = state.stage === 'build-result' ? 'build' : 'transfer';
    const stem = `${definition.id}:${phase}:support:${at}`;
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
    const errorTags = attempt.outcome === 'pass'
        ? []
        : [attempt.phase === 'build' ? 'name-card:word-order' : 'name-card:changed-person'];
    const reviewSeeds: readonly ReviewSeed[] = attempt.phase === 'transfer' && attempt.outcome === 'pass' ? [{
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
            responseKind: attempt.phase === 'build'
                ? 'tapped-name-card-frame'
                : 'selected-changed-person-name-card',
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
                        en: attempt.phase === 'build'
                            ? 'Your name comes first. です finishes the introduction.'
                            : 'That is Rie’s card.',
                        ja: attempt.phase === 'build'
                            ? '名前が先です。「です」で自己紹介を終えます。'
                            : 'りえ先生の名札です。',
                    },
                }
                : {
                    explanation: {
                        en: attempt.phase === 'build'
                            ? 'Keep your name first, just as Rie did.'
                            : 'Look for Rie’s name before です.',
                        ja: attempt.phase === 'build'
                            ? 'りえ先生と同じように、名前を先に置きましょう。'
                            : '「です」の前に、りえ先生の名前を探しましょう。',
                    },
                    repairPrompt: {
                        en: 'Try once more.',
                        ja: 'もう一度やってみましょう。',
                    },
                },
        },
        reviewSeeds,
    };
}

function adaptiveFor(
    definition: LessonZeroNameCardDefinition,
    attempt: LessonZeroNameCardAttempt,
    repairing: boolean,
    eventId: string,
): LessonZeroNameCardAdaptiveEvidence {
    return {
        eventId: `${eventId}:learning`,
        at: attempt.at,
        modeId: 'lesson-zero-name-card',
        skill: 'grammar',
        action: repairing ? 'repair' : attempt.phase === 'transfer' ? 'transfer' : 'produce',
        sourceId: definition.activityId,
        independent: !repairing,
    };
}

function validateDefinition(definition: LessonZeroNameCardDefinition): void {
    if (definition.schemaVersion !== 2
        || definition.id !== 'session:lesson-zero-name-card-draft'
        || definition.activityId !== 'activity:lesson-zero-name-card-draft'
        || !definition.usualName.trim()
        || (definition.katakanaName !== null && !definition.katakanaName.trim())
        || (definition.defaultNameVariant === 'katakana' && !definition.katakanaName)
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
    if ((snapshot.nameVariant === 'katakana' && !definition.katakanaName)
        || snapshot.selectedTokenIds.some(id => !validIds.has(id))
        || snapshot.attempts.some(attempt =>
            attempt.phase === 'build' && attempt.order.some(id => !validIds.has(id)))) {
        throw new TypeError('Invalid Lesson Zero name-card snapshot for this learner.');
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
    if ((attempt.outcome !== 'pass' && attempt.outcome !== 'lapse')
        || typeof attempt.score !== 'number'
        || !Number.isFinite(attempt.score)
        || attempt.score < 0
        || attempt.score > 1
        || typeof attempt.at !== 'number'
        || !Number.isFinite(attempt.at)) return false;
    if (attempt.phase === 'build') {
        return tokenSetIsValid(attempt.order)
            && attempt.order.length === LESSON_ZERO_NAME_CARD_TOKEN_IDS.length;
    }
    return attempt.phase === 'transfer'
        && LESSON_ZERO_NAME_CARD_TRANSFER_IDS.includes(attempt.selectedId as LessonZeroNameCardTransferId);
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
