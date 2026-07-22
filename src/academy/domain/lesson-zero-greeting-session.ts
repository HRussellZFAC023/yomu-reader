import type { ActivityEvaluation, ReviewSeed } from './activity-runtime';
import type { LearnerEventInput, LearningAction, LearningSkill } from './learner-record';
import type { LocalizedText } from './source-library';

export type LessonZeroGreetingMode = 'recorded' | 'unrecorded' | 'typed';

export interface LessonZeroGreetingChunk {
    readonly id: 'evening' | 'first-meeting' | 'name' | 'closing';
    readonly japanese: string;
    readonly reading: string;
    readonly meaning: LocalizedText;
}

export interface LessonZeroGreetingSessionDefinition {
    readonly schemaVersion: 1;
    readonly id: 'session:lesson-zero-greet-rie';
    readonly activityId: 'activity:lesson-zero-greet-rie';
    readonly learnerName: string;
    readonly conceptIds: readonly string[];
    readonly model: Readonly<{
        speakerId: 'rie';
        japanese: string;
        reading: string;
        meaning: LocalizedText;
    }>;
    readonly chunks: readonly LessonZeroGreetingChunk[];
}

export interface LessonZeroGreetingAttempt {
    readonly mode: LessonZeroGreetingMode;
    readonly outcome: 'pass' | 'lapse';
    readonly greetingOrder: boolean;
    readonly nameIntelligible: boolean;
    readonly at: number;
}

export interface LessonZeroGreetingSessionState {
    readonly schemaVersion: 1;
    readonly sessionId: LessonZeroGreetingSessionDefinition['id'];
    readonly status: 'ready' | 'active' | 'paused' | 'complete';
    readonly stage: 'arrange' | 'rehearse' | 'complete';
    readonly selectedChunkIds: readonly LessonZeroGreetingChunk['id'][];
    readonly arrangementAttempts: number;
    readonly mode?: LessonZeroGreetingMode;
    readonly attempts: readonly LessonZeroGreetingAttempt[];
}

export type LessonZeroGreetingSessionAction =
    | { readonly kind: 'start' }
    | { readonly kind: 'select-chunk'; readonly chunkId: LessonZeroGreetingChunk['id'] }
    | { readonly kind: 'remove-chunk'; readonly chunkId: LessonZeroGreetingChunk['id'] }
    | { readonly kind: 'check-arrangement' }
    | { readonly kind: 'choose-mode'; readonly mode: LessonZeroGreetingMode }
    | { readonly kind: 'clear-mode' }
    | { readonly kind: 'submit-self-check'; readonly greetingOrder: boolean; readonly nameIntelligible: boolean }
    | { readonly kind: 'submit-typed'; readonly response: string }
    | { readonly kind: 'pause' }
    | { readonly kind: 'resume' };

export interface LessonZeroGreetingAdaptiveEvidence {
    readonly eventId: string;
    readonly at: number;
    readonly modeId: string;
    readonly skill: LearningSkill;
    readonly action: LearningAction;
    readonly sourceId: string;
    readonly independent: boolean;
}

export interface LessonZeroGreetingSessionTransition {
    readonly state: LessonZeroGreetingSessionState;
    readonly arrangementCorrect?: boolean;
    readonly evaluation?: ActivityEvaluation;
    readonly adaptive?: LessonZeroGreetingAdaptiveEvidence;
    readonly supportEvents: readonly Extract<LearnerEventInput, { kind: 'support-used' }>[];
}

const TARGET_ORDER: readonly LessonZeroGreetingChunk['id'][] = Object.freeze([
    'evening',
    'first-meeting',
    'name',
    'closing',
]);

export function startLessonZeroGreetingSession(
    definition: LessonZeroGreetingSessionDefinition,
    snapshot?: LessonZeroGreetingSessionState,
): LessonZeroGreetingSessionState {
    validateDefinition(definition);
    if (snapshot !== undefined) {
        if (!lessonZeroGreetingSessionSnapshotShapeIsValid(snapshot)) {
            throw new TypeError('Invalid Lesson Zero greeting snapshot.');
        }
        const chunkIds = new Set(definition.chunks.map(chunk => chunk.id));
        if (snapshot.sessionId !== definition.id
            || snapshot.selectedChunkIds.some(id => !chunkIds.has(id))) {
            throw new TypeError('Lesson Zero greeting snapshot does not fit this definition.');
        }
        return structuredClone(snapshot);
    }
    return {
        schemaVersion: 1,
        sessionId: definition.id,
        status: 'ready',
        stage: 'arrange',
        selectedChunkIds: [],
        arrangementAttempts: 0,
        attempts: [],
    };
}

export function transitionLessonZeroGreetingSession(
    definition: LessonZeroGreetingSessionDefinition,
    state: LessonZeroGreetingSessionState,
    action: LessonZeroGreetingSessionAction,
    at: number,
): LessonZeroGreetingSessionTransition {
    startLessonZeroGreetingSession(definition, state);
    if (!Number.isFinite(at)) throw new TypeError('Lesson Zero greeting transitions need a finite timestamp.');
    if (action.kind === 'start') {
        if (state.status !== 'ready') return unchanged(state);
        return unchanged({ ...state, status: 'active' });
    }
    if (action.kind === 'pause') {
        if (state.status !== 'active') return unchanged(state);
        return unchanged({ ...state, status: 'paused' });
    }
    if (action.kind === 'resume') {
        if (state.status !== 'paused') return unchanged(state);
        return unchanged({ ...state, status: 'active' });
    }
    if (state.status !== 'active' || state.stage === 'complete') return unchanged(state);
    if (action.kind === 'select-chunk') {
        if (state.stage !== 'arrange' || state.selectedChunkIds.includes(action.chunkId)) return unchanged(state);
        if (!definition.chunks.some(chunk => chunk.id === action.chunkId)) return unchanged(state);
        return unchanged({ ...state, selectedChunkIds: [...state.selectedChunkIds, action.chunkId] });
    }
    if (action.kind === 'remove-chunk') {
        if (state.stage !== 'arrange') return unchanged(state);
        return unchanged({
            ...state,
            selectedChunkIds: state.selectedChunkIds.filter(id => id !== action.chunkId),
        });
    }
    if (action.kind === 'check-arrangement') {
        if (state.stage !== 'arrange' || state.selectedChunkIds.length !== TARGET_ORDER.length) {
            return { ...unchanged(state), arrangementCorrect: false };
        }
        const arrangementCorrect = sameList(state.selectedChunkIds, TARGET_ORDER);
        return {
            ...unchanged({
                ...state,
                stage: arrangementCorrect ? 'rehearse' : 'arrange',
                arrangementAttempts: state.arrangementAttempts + 1,
            }),
            arrangementCorrect,
        };
    }
    if (action.kind === 'choose-mode') {
        if (state.stage !== 'rehearse') return unchanged(state);
        return unchanged({ ...state, mode: action.mode });
    }
    if (action.kind === 'clear-mode') {
        if (state.stage !== 'rehearse') return unchanged(state);
        return unchanged({ ...state, mode: undefined });
    }
    if (state.stage !== 'rehearse') return unchanged(state);
    if (action.kind === 'submit-typed') {
        if (state.mode !== 'typed') return unchanged(state);
        const checks = typedGreetingChecks(definition, action.response);
        return assessedTransition(definition, state, 'typed', checks, at);
    }
    if (action.kind === 'submit-self-check') {
        if (state.mode !== 'recorded' && state.mode !== 'unrecorded') return unchanged(state);
        const mode = state.mode;
        return assessedTransition(definition, state, mode, {
            greetingOrder: action.greetingOrder,
            nameIntelligible: action.nameIntelligible,
        }, at);
    }
    return unchanged(state);
}

export function lessonZeroGreetingSessionSnapshotShapeIsValid(
    value: unknown,
): value is LessonZeroGreetingSessionState {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<LessonZeroGreetingSessionState>;
    return candidate.schemaVersion === 1
        && candidate.sessionId === 'session:lesson-zero-greet-rie'
        && ['ready', 'active', 'paused', 'complete'].includes(candidate.status ?? '')
        && ['arrange', 'rehearse', 'complete'].includes(candidate.stage ?? '')
        && Array.isArray(candidate.selectedChunkIds)
        && candidate.selectedChunkIds.every(isGreetingChunkId)
        && new Set(candidate.selectedChunkIds).size === candidate.selectedChunkIds.length
        && Number.isInteger(candidate.arrangementAttempts)
        && (candidate.arrangementAttempts ?? -1) >= 0
        && (candidate.mode === undefined || isGreetingMode(candidate.mode))
        && Array.isArray(candidate.attempts)
        && candidate.attempts.every(attemptShapeIsValid)
        && sessionStatusFitsStage(candidate);
}

function assessedTransition(
    definition: LessonZeroGreetingSessionDefinition,
    state: LessonZeroGreetingSessionState,
    mode: LessonZeroGreetingMode,
    checks: Readonly<{ greetingOrder: boolean; nameIntelligible: boolean }>,
    at: number,
): LessonZeroGreetingSessionTransition {
    const outcome = checks.greetingOrder && checks.nameIntelligible ? 'pass' : 'lapse';
    const attemptNumber = state.attempts.length + 1;
    const eventStem = `${definition.id}:attempt:${attemptNumber}`;
    const attempt: LessonZeroGreetingAttempt = { mode, outcome, ...checks, at };
    const repairing = outcome === 'lapse' || state.attempts.some(candidate => candidate.outcome === 'lapse');
    return {
        state: {
            ...state,
            status: outcome === 'pass' ? 'complete' : 'active',
            stage: outcome === 'pass' ? 'complete' : 'rehearse',
            mode,
            attempts: [...state.attempts, attempt],
        },
        evaluation: evaluationFor(definition, attempt, repairing, eventStem),
        adaptive: {
            eventId: `${eventStem}:learning`,
            at,
            modeId: `lesson-zero-greeting:${mode}`,
            skill: mode === 'typed' ? 'writing' : 'speaking',
            action: repairing ? 'repair' : mode === 'typed' ? 'produce' : 'speak',
            sourceId: definition.activityId,
            independent: !repairing,
        },
        supportEvents: outcome === 'lapse'
            ? [
                supportEvent(definition.activityId, 'transcript', `${eventStem}:transcript`, at),
                supportEvent(definition.activityId, 'translation', `${eventStem}:translation`, at),
                supportEvent(definition.activityId, 'model-answer', `${eventStem}:model`, at),
            ]
            : [],
    };
}

function typedGreetingChecks(
    definition: LessonZeroGreetingSessionDefinition,
    response: string,
): Readonly<{ greetingOrder: boolean; nameIntelligible: boolean }> {
    const normalized = normalizeJapanese(response);
    const pieces = definition.chunks.map(chunk => normalizeJapanese(chunk.japanese));
    let cursor = 0;
    const ordered = pieces.every(piece => {
        const index = normalized.indexOf(piece, cursor);
        if (index < 0) return false;
        cursor = index + piece.length;
        return true;
    });
    const name = normalizeJapanese(definition.learnerName);
    return {
        greetingOrder: ordered,
        nameIntelligible: Boolean(name) && normalized.includes(`${name}です`),
    };
}

function evaluationFor(
    definition: LessonZeroGreetingSessionDefinition,
    attempt: LessonZeroGreetingAttempt,
    repairing: boolean,
    eventId: string,
): ActivityEvaluation {
    const errorTags = [
        ...(attempt.greetingOrder ? [] : ['greeting-order']),
        ...(attempt.nameIntelligible ? [] : ['name-intelligibility']),
    ];
    const reviewSeeds: readonly ReviewSeed[] = attempt.outcome === 'pass'
        ? greetingReviewSeeds(definition, repairing)
        : [];
    return {
        attempt: {
            kind: 'attempt-recorded',
            eventId,
            at: attempt.at,
            activityId: definition.activityId,
            conceptIds: definition.conceptIds,
            responseKind: attempt.mode === 'typed' ? 'typed-accessible-speaking-alternative' : 'spoken-self-check',
            outcome: attempt.outcome,
            score: (Number(attempt.greetingOrder) + Number(attempt.nameIntelligible)) / 2,
            ...(errorTags.length ? { errorTags } : {}),
        },
        result: {
            outcome: attempt.outcome,
            score: (Number(attempt.greetingOrder) + Number(attempt.nameIntelligible)) / 2,
            errorTags,
            feedback: attempt.outcome === 'pass'
                ? {
                    explanation: {
                        en: 'Your greeting reached Rie in the right order, with your name attached.',
                        ja: 'あいさつを順番どおりに、名前と一緒にりえ先生へ伝えられました。',
                    },
                }
                : {
                    explanation: {
                        en: 'One part of the greeting needs another pass.',
                        ja: 'あいさつの一部を、もう一度確かめましょう。',
                    },
                    repairPrompt: {
                        en: 'Use the four-part paper strip, then try the whole turn again.',
                        ja: '四つのことばの紙を見てから、もう一度通して言いましょう。',
                    },
                },
        },
        reviewSeeds,
    };
}

function greetingReviewSeeds(
    definition: LessonZeroGreetingSessionDefinition,
    repairing: boolean,
): readonly ReviewSeed[] {
    const reason = repairing ? 'repair' : 'new-learning';
    return definition.chunks.map((chunk, index) => ({
        id: `review:lesson-zero:greeting:${chunk.id}`,
        conceptId: definition.conceptIds[index === 2 ? 1 : 0]!,
        reason,
        content: {
            expression: chunk.japanese,
            reading: chunk.reading,
            meanings: [chunk.meaning.en],
            sentence: definition.chunks.map(item => item.japanese).join(''),
        },
    }));
}

function supportEvent(
    activityId: string,
    supportKind: 'transcript' | 'translation' | 'model-answer',
    eventId: string,
    at: number,
): Extract<LearnerEventInput, { kind: 'support-used' }> {
    return { kind: 'support-used', eventId, at, activityId, supportKind };
}

function attemptShapeIsValid(value: unknown): value is LessonZeroGreetingAttempt {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<LessonZeroGreetingAttempt>;
    return isGreetingMode(candidate.mode)
        && (candidate.outcome === 'pass' || candidate.outcome === 'lapse')
        && typeof candidate.greetingOrder === 'boolean'
        && typeof candidate.nameIntelligible === 'boolean'
        && typeof candidate.at === 'number'
        && Number.isFinite(candidate.at);
}

function sessionStatusFitsStage(candidate: Partial<LessonZeroGreetingSessionState>): boolean {
    if (candidate.status === 'complete') return candidate.stage === 'complete';
    if (candidate.stage === 'complete') return false;
    if (candidate.status === 'ready') {
        return candidate.stage === 'arrange'
            && candidate.selectedChunkIds?.length === 0
            && candidate.attempts?.length === 0;
    }
    return true;
}

function validateDefinition(definition: LessonZeroGreetingSessionDefinition): void {
    if (definition.schemaVersion !== 1
        || definition.id !== 'session:lesson-zero-greet-rie'
        || definition.activityId !== 'activity:lesson-zero-greet-rie'
        || !definition.learnerName.trim()
        || definition.conceptIds.length !== 2
        || !definition.model.japanese.trim()
        || definition.chunks.length !== TARGET_ORDER.length
        || !sameList(definition.chunks.map(chunk => chunk.id), TARGET_ORDER)) {
        throw new TypeError('Invalid Lesson Zero greeting definition.');
    }
}

function normalizeJapanese(value: string): string {
    return value.normalize('NFKC').toLocaleLowerCase('en').replace(/[\s。、，,.!?！？・]/gu, '');
}

function isGreetingMode(value: unknown): value is LessonZeroGreetingMode {
    return value === 'recorded' || value === 'unrecorded' || value === 'typed';
}

function isGreetingChunkId(value: unknown): value is LessonZeroGreetingChunk['id'] {
    return typeof value === 'string' && TARGET_ORDER.includes(value as LessonZeroGreetingChunk['id']);
}

function sameList(actual: readonly string[], expected: readonly string[]): boolean {
    return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function unchanged(state: LessonZeroGreetingSessionState): LessonZeroGreetingSessionTransition {
    return { state, supportEvents: [] };
}
