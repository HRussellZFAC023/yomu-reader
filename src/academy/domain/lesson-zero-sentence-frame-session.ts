import type { ActivityEvaluation, ReviewSeed } from './activity-runtime';
import type { LearnerEventInput, LearningAction, LearningSkill } from './learner-record';
import type { LocalizedText } from './source-library';

const LESSON_ZERO_SENTENCE_FRAME_IDS = Object.freeze([
    'identity',
    'correction',
    'question',
    'noun-link',
    'parallel',
] as const);

export type LessonZeroSentenceFrameId = typeof LESSON_ZERO_SENTENCE_FRAME_IDS[number];

export interface LessonZeroSentenceFrameToken {
    readonly id: string;
    readonly japanese: string;
}

export interface LessonZeroSentenceFrameDefinition {
    readonly id: LessonZeroSentenceFrameId;
    readonly activityId: `activity:lesson-zero-build-sentence-frames:${LessonZeroSentenceFrameId}`;
    readonly conceptId: string;
    readonly pattern: string;
    readonly title: LocalizedText;
    readonly teaching: LocalizedText;
    readonly prompt: LocalizedText;
    readonly nearbyExample: Readonly<{
        japanese: string;
        reading: string;
        meaning: LocalizedText;
    }>;
    readonly target: Readonly<{
        japanese: string;
        reading: string;
        meaning: LocalizedText;
        tokens: readonly LessonZeroSentenceFrameToken[];
        correctOrder: readonly string[];
        bankOrder: readonly string[];
    }>;
    readonly response: Readonly<{
        speakerId: 'rie' | 'sophie';
        speakerName: LocalizedText;
        japanese: string;
        reading: string;
        meaning: LocalizedText;
    }>;
}

export interface LessonZeroSentenceFrameSessionDefinition {
    readonly schemaVersion: 1;
    readonly id: 'session:lesson-zero-sentence-frames';
    readonly activityId: 'activity:lesson-zero-build-sentence-frames';
    readonly conceptIds: readonly string[];
    readonly frames: readonly LessonZeroSentenceFrameDefinition[];
}

export interface LessonZeroSentenceFrameAttempt {
    readonly frameId: LessonZeroSentenceFrameId;
    readonly order: readonly string[];
    readonly outcome: 'pass' | 'lapse';
    readonly score: number;
    readonly at: number;
}

export interface LessonZeroSentenceFrameSessionState {
    readonly schemaVersion: 1;
    readonly sessionId: LessonZeroSentenceFrameSessionDefinition['id'];
    readonly status: 'ready' | 'active' | 'paused' | 'complete';
    readonly stage: 'teach' | 'build' | 'result' | 'complete';
    readonly cursor: number;
    readonly selectedTokenIds: readonly string[];
    readonly attempts: readonly LessonZeroSentenceFrameAttempt[];
    readonly passedFrameIds: readonly LessonZeroSentenceFrameId[];
    readonly revealedModelFrameIds: readonly LessonZeroSentenceFrameId[];
}

export type LessonZeroSentenceFrameSessionAction =
    | { readonly kind: 'start' }
    | { readonly kind: 'open-build' }
    | { readonly kind: 'select-token'; readonly tokenId: string }
    | { readonly kind: 'remove-token'; readonly tokenId: string }
    | { readonly kind: 'clear-tokens' }
    | { readonly kind: 'check' }
    | { readonly kind: 'reveal-model' }
    | { readonly kind: 'retry' }
    | { readonly kind: 'next-frame' }
    | { readonly kind: 'pause' }
    | { readonly kind: 'resume' };

export interface LessonZeroSentenceFrameAdaptiveEvidence {
    readonly eventId: string;
    readonly at: number;
    readonly modeId: 'lesson-zero-sentence-frames';
    readonly skill: LearningSkill;
    readonly action: LearningAction;
    readonly sourceId: LessonZeroSentenceFrameSessionDefinition['activityId'];
    readonly independent: boolean;
}

export interface LessonZeroSentenceFrameSessionTransition {
    readonly state: LessonZeroSentenceFrameSessionState;
    readonly evaluation?: ActivityEvaluation;
    readonly completionEvaluation?: ActivityEvaluation;
    readonly adaptive?: LessonZeroSentenceFrameAdaptiveEvidence;
    readonly supportEvents: readonly Extract<LearnerEventInput, { kind: 'support-used' }>[];
}

export function startLessonZeroSentenceFrameSession(
    definition: LessonZeroSentenceFrameSessionDefinition,
    snapshot?: LessonZeroSentenceFrameSessionState,
): LessonZeroSentenceFrameSessionState {
    validateDefinition(definition);
    if (snapshot !== undefined) {
        if (frameIdSetIsValid(snapshot.passedFrameIds)) {
            const expectedPrefix = definition.frames
                .slice(0, snapshot.passedFrameIds.length)
                .map(frame => frame.id);
            if (!sameList(snapshot.passedFrameIds, expectedPrefix)) {
                throw new TypeError('Sentence-frame snapshot completion is not chronological.');
            }
        }
        if (!lessonZeroSentenceFrameSessionSnapshotShapeIsValid(snapshot)) {
            throw new TypeError('Invalid Lesson Zero sentence-frame snapshot.');
        }
        validateSnapshotAgainstDefinition(definition, snapshot);
        return structuredClone(snapshot);
    }
    return {
        schemaVersion: 1,
        sessionId: definition.id,
        status: 'ready',
        stage: 'teach',
        cursor: 0,
        selectedTokenIds: [],
        attempts: [],
        passedFrameIds: [],
        revealedModelFrameIds: [],
    };
}

export function transitionLessonZeroSentenceFrameSession(
    definition: LessonZeroSentenceFrameSessionDefinition,
    state: LessonZeroSentenceFrameSessionState,
    action: LessonZeroSentenceFrameSessionAction,
    at: number,
): LessonZeroSentenceFrameSessionTransition {
    startLessonZeroSentenceFrameSession(definition, state);
    if (!Number.isFinite(at)) throw new TypeError('Sentence-frame transitions need a finite timestamp.');
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
    const frame = definition.frames[state.cursor]!;
    if (action.kind === 'open-build') {
        if (state.stage !== 'teach') return unchanged(state);
        return unchanged({ ...state, stage: 'build', selectedTokenIds: [] });
    }
    if (action.kind === 'select-token') {
        if (state.stage !== 'build'
            || state.selectedTokenIds.includes(action.tokenId)
            || !frame.target.tokens.some(token => token.id === action.tokenId)) return unchanged(state);
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
    if (action.kind === 'check') return checkFrame(definition, state, frame, at);
    if (action.kind === 'reveal-model') return revealModel(definition, state, frame, at);
    if (action.kind === 'retry') {
        const last = lastFrameAttempt(state, frame.id);
        if (state.stage !== 'result' || last?.outcome !== 'lapse') return unchanged(state);
        return unchanged({ ...state, stage: 'build', selectedTokenIds: [] });
    }
    if (action.kind === 'next-frame') {
        const last = lastFrameAttempt(state, frame.id);
        if (state.stage !== 'result' || last?.outcome !== 'pass' || state.cursor >= definition.frames.length - 1) {
            return unchanged(state);
        }
        return unchanged({
            ...state,
            stage: 'teach',
            cursor: state.cursor + 1,
            selectedTokenIds: [],
        });
    }
    return unchanged(state);
}

export function lessonZeroSentenceFrameSessionSnapshotShapeIsValid(
    value: unknown,
): value is LessonZeroSentenceFrameSessionState {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<LessonZeroSentenceFrameSessionState>;
    const selected = candidate.selectedTokenIds;
    const passed = candidate.passedFrameIds;
    const revealed = candidate.revealedModelFrameIds;
    const attempts = candidate.attempts;
    if (candidate.schemaVersion !== 1
        || candidate.sessionId !== 'session:lesson-zero-sentence-frames'
        || !['ready', 'active', 'paused', 'complete'].includes(candidate.status ?? '')
        || !['teach', 'build', 'result', 'complete'].includes(candidate.stage ?? '')
        || !Number.isInteger(candidate.cursor)
        || (candidate.cursor ?? -1) < 0
        || (candidate.cursor ?? Number.MAX_SAFE_INTEGER) >= LESSON_ZERO_SENTENCE_FRAME_IDS.length
        || !stringSetIsValid(selected)
        || !frameIdSetIsValid(passed)
        || !frameIdSetIsValid(revealed)
        || !Array.isArray(attempts)
        || !attempts.every(attemptShapeIsValid)) return false;
    const passedPrefix = LESSON_ZERO_SENTENCE_FRAME_IDS.slice(0, passed?.length);
    if (!passed?.every((frameId, index) => passedPrefix[index] === frameId)) return false;
    if (attempts.some(attempt => LESSON_ZERO_SENTENCE_FRAME_IDS.indexOf(attempt.frameId) > candidate.cursor!)) {
        return false;
    }
    if (passed.some(frameId => !attempts.some(attempt => attempt.frameId === frameId && attempt.outcome === 'pass'))) {
        return false;
    }
    if (candidate.status === 'complete') {
        return candidate.stage === 'complete'
            && candidate.cursor === LESSON_ZERO_SENTENCE_FRAME_IDS.length - 1
            && passed.length === LESSON_ZERO_SENTENCE_FRAME_IDS.length;
    }
    if (candidate.stage === 'complete') return false;
    if (candidate.status === 'ready') {
        return candidate.stage === 'teach'
            && candidate.cursor === 0
            && selected?.length === 0
            && attempts.length === 0
            && passed?.length === 0
            && revealed?.length === 0;
    }
    if (passed.length < candidate.cursor! || passed.length > candidate.cursor! + 1) return false;
    if (candidate.stage === 'teach' || candidate.stage === 'build') {
        return passed.length === candidate.cursor;
    }
    const currentFrameId = LESSON_ZERO_SENTENCE_FRAME_IDS[candidate.cursor!];
    if (candidate.stage === 'result'
        && !attempts.some(attempt => attempt.frameId === currentFrameId)) return false;
    return true;
}

function checkFrame(
    definition: LessonZeroSentenceFrameSessionDefinition,
    state: LessonZeroSentenceFrameSessionState,
    frame: LessonZeroSentenceFrameDefinition,
    at: number,
): LessonZeroSentenceFrameSessionTransition {
    if (state.stage !== 'build' || state.selectedTokenIds.length !== frame.target.tokens.length) {
        return unchanged(state);
    }
    const correctPositions = state.selectedTokenIds.filter((id, index) => frame.target.correctOrder[index] === id).length;
    const score = correctPositions / frame.target.correctOrder.length;
    const outcome = score === 1 ? 'pass' : 'lapse';
    const attempt: LessonZeroSentenceFrameAttempt = {
        frameId: frame.id,
        order: [...state.selectedTokenIds],
        outcome,
        score,
        at,
    };
    const repairing = outcome === 'lapse'
        || state.attempts.some(candidate => candidate.frameId === frame.id && candidate.outcome === 'lapse');
    const passedFrameIds = outcome === 'pass'
        ? unique([...state.passedFrameIds, frame.id])
        : state.passedFrameIds;
    const finalPass = outcome === 'pass' && passedFrameIds.length === definition.frames.length;
    const attemptNumber = state.attempts.filter(candidate => candidate.frameId === frame.id).length + 1;
    const eventStem = `${definition.id}:${frame.id}:attempt:${attemptNumber}:${at}`;
    const nextState: LessonZeroSentenceFrameSessionState = {
        ...state,
        status: finalPass ? 'complete' : 'active',
        stage: finalPass ? 'complete' : 'result',
        attempts: [...state.attempts, attempt],
        passedFrameIds,
    };
    return {
        state: nextState,
        evaluation: evaluationFor(frame, attempt, repairing, eventStem),
        ...(finalPass ? { completionEvaluation: completionEvaluation(definition, at) } : {}),
        adaptive: {
            eventId: `${eventStem}:learning`,
            at,
            modeId: 'lesson-zero-sentence-frames',
            skill: 'writing',
            action: repairing ? 'repair' : 'produce',
            sourceId: definition.activityId,
            independent: !repairing,
        },
        supportEvents: [],
    };
}

function revealModel(
    definition: LessonZeroSentenceFrameSessionDefinition,
    state: LessonZeroSentenceFrameSessionState,
    frame: LessonZeroSentenceFrameDefinition,
    at: number,
): LessonZeroSentenceFrameSessionTransition {
    const last = lastFrameAttempt(state, frame.id);
    if (state.stage !== 'result' || last?.outcome !== 'lapse'
        || state.revealedModelFrameIds.includes(frame.id)) return unchanged(state);
    const eventStem = `${definition.id}:${frame.id}:support:${at}`;
    return {
        state: {
            ...state,
            revealedModelFrameIds: [...state.revealedModelFrameIds, frame.id],
        },
        supportEvents: [
            supportEvent(frame.activityId, 'transcript', `${eventStem}:transcript`, at),
            supportEvent(frame.activityId, 'translation', `${eventStem}:translation`, at),
            supportEvent(frame.activityId, 'model-answer', `${eventStem}:model`, at),
        ],
    };
}

function evaluationFor(
    frame: LessonZeroSentenceFrameDefinition,
    attempt: LessonZeroSentenceFrameAttempt,
    repairing: boolean,
    eventId: string,
): ActivityEvaluation {
    const errorTags = attempt.outcome === 'pass' ? [] : [`sentence-frame-order:${frame.id}`];
    const reviewSeeds: readonly ReviewSeed[] = attempt.outcome === 'pass' ? [{
        id: `review:lesson-zero:sentence-frame:${frame.id}`,
        conceptId: frame.conceptId,
        reason: repairing ? 'repair' : 'new-learning',
        content: {
            expression: frame.target.japanese,
            reading: frame.target.reading,
            meanings: [frame.target.meaning.en],
            sentence: frame.target.japanese,
        },
    }] : [];
    return {
        attempt: {
            kind: 'attempt-recorded',
            eventId,
            at: attempt.at,
            activityId: frame.activityId,
            conceptIds: [frame.conceptId],
            responseKind: 'tapped-token-order',
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
                        en: 'The words are carrying the meaning you chose.',
                        ja: '選んだ意味が、その語順で伝わっています。',
                    },
                }
                : {
                    explanation: {
                        en: 'The right words are here, but their jobs have changed places.',
                        ja: '必要なことばはそろっていますが、役割の順番が入れ替わっています。',
                    },
                    repairPrompt: {
                        en: `Look at the ${frame.pattern} rail and rebuild the same thought.`,
                        ja: `「${frame.pattern}」の形を見て、同じ意味をもう一度作りましょう。`,
                    },
                    nearbyExample: frame.nearbyExample.meaning,
                },
        },
        reviewSeeds,
    };
}

function completionEvaluation(
    definition: LessonZeroSentenceFrameSessionDefinition,
    at: number,
): ActivityEvaluation {
    return {
        attempt: {
            kind: 'attempt-recorded',
            eventId: `${definition.id}:complete:${at}`,
            at,
            activityId: definition.activityId,
            conceptIds: definition.conceptIds,
            responseKind: 'sentence-constructions',
            outcome: 'pass',
            score: 1,
        },
        result: {
            outcome: 'pass',
            score: 1,
            errorTags: [],
            feedback: {
                explanation: {
                    en: 'Five sentence shapes are ready for the rest of the day.',
                    ja: '今日これから使う五つの文の形がそろいました。',
                },
            },
        },
        reviewSeeds: [],
    };
}

function validateDefinition(definition: LessonZeroSentenceFrameSessionDefinition): void {
    if (definition.schemaVersion !== 1
        || definition.id !== 'session:lesson-zero-sentence-frames'
        || definition.activityId !== 'activity:lesson-zero-build-sentence-frames'
        || definition.frames.length !== LESSON_ZERO_SENTENCE_FRAME_IDS.length
        || !sameList(definition.frames.map(frame => frame.id), LESSON_ZERO_SENTENCE_FRAME_IDS)
        || !sameList(definition.frames.map(frame => frame.conceptId), definition.conceptIds)) {
        throw new TypeError('Invalid Lesson Zero sentence-frame definition.');
    }
    definition.frames.forEach(frame => {
        const tokenIds = frame.target.tokens.map(token => token.id);
        if (frame.activityId !== `${definition.activityId}:${frame.id}`
            || !frame.pattern.trim()
            || tokenIds.length < 3
            || new Set(tokenIds).size !== tokenIds.length
            || frame.target.tokens.some(token => !token.id.trim() || !token.japanese.trim())
            || !sameSet(frame.target.correctOrder, tokenIds)
            || !sameSet(frame.target.bankOrder, tokenIds)
            || assembled(frame, frame.target.correctOrder) !== frame.target.japanese
            || frame.nearbyExample.japanese === frame.target.japanese) {
            throw new TypeError(`Invalid Lesson Zero sentence frame ${frame.id}.`);
        }
    });
}

function validateSnapshotAgainstDefinition(
    definition: LessonZeroSentenceFrameSessionDefinition,
    snapshot: LessonZeroSentenceFrameSessionState,
): void {
    const frame = definition.frames[snapshot.cursor]!;
    const tokenIds = new Set(frame.target.tokens.map(token => token.id));
    if (snapshot.selectedTokenIds.some(id => !tokenIds.has(id))) {
        throw new TypeError('Sentence-frame snapshot contains a token from another turn.');
    }
    for (const attempt of snapshot.attempts) {
        const attemptedFrame = definition.frames.find(candidate => candidate.id === attempt.frameId);
        if (!attemptedFrame || !sameSet(attempt.order, attemptedFrame.target.tokens.map(token => token.id))) {
            throw new TypeError('Sentence-frame snapshot contains an impossible attempt.');
        }
    }
    const expectedPrefix = definition.frames.slice(0, snapshot.passedFrameIds.length).map(candidate => candidate.id);
    if (!sameList(snapshot.passedFrameIds, expectedPrefix)) {
        throw new TypeError('Sentence-frame snapshot completion is not chronological.');
    }
}

function assembled(frame: LessonZeroSentenceFrameDefinition, order: readonly string[]): string {
    return order.map(id => frame.target.tokens.find(token => token.id === id)?.japanese ?? '').join('');
}

function lastFrameAttempt(
    state: LessonZeroSentenceFrameSessionState,
    frameId: LessonZeroSentenceFrameId,
): LessonZeroSentenceFrameAttempt | undefined {
    return [...state.attempts].reverse().find(attempt => attempt.frameId === frameId);
}

function attemptShapeIsValid(value: unknown): value is LessonZeroSentenceFrameAttempt {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<LessonZeroSentenceFrameAttempt>;
    return isFrameId(candidate.frameId)
        && Array.isArray(candidate.order)
        && candidate.order.every(item => typeof item === 'string' && Boolean(item))
        && new Set(candidate.order).size === candidate.order.length
        && (candidate.outcome === 'pass' || candidate.outcome === 'lapse')
        && typeof candidate.score === 'number'
        && Number.isFinite(candidate.score)
        && candidate.score >= 0
        && candidate.score <= 1
        && typeof candidate.at === 'number'
        && Number.isFinite(candidate.at);
}

function supportEvent(
    activityId: string,
    supportKind: 'transcript' | 'translation' | 'model-answer',
    eventId: string,
    at: number,
): Extract<LearnerEventInput, { kind: 'support-used' }> {
    return { kind: 'support-used', eventId, at, activityId, supportKind };
}

function stringSetIsValid(value: unknown): value is readonly string[] {
    return Array.isArray(value)
        && value.every(item => typeof item === 'string' && Boolean(item))
        && new Set(value).size === value.length;
}

function frameIdSetIsValid(value: unknown): value is readonly LessonZeroSentenceFrameId[] {
    return Array.isArray(value)
        && value.every(isFrameId)
        && new Set(value).size === value.length;
}

function isFrameId(value: unknown): value is LessonZeroSentenceFrameId {
    return typeof value === 'string'
        && LESSON_ZERO_SENTENCE_FRAME_IDS.includes(value as LessonZeroSentenceFrameId);
}

function sameList(actual: readonly string[], expected: readonly string[]): boolean {
    return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function sameSet(actual: readonly string[], expected: readonly string[]): boolean {
    return actual.length === expected.length && actual.every(value => expected.includes(value));
}

function unique<T>(values: readonly T[]): T[] {
    return [...new Set(values)];
}

function unchanged(state: LessonZeroSentenceFrameSessionState): LessonZeroSentenceFrameSessionTransition {
    return { state, supportEvents: [] };
}
