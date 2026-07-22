import type { ActivityEvaluation, ReviewSeed } from './activity-runtime';
import type { LearnerEventInput, LearningAction, LearningSkill } from './learner-record';
import type { LocalizedText } from './source-library';

export type ClassroomInstructionActionId =
    | 'begin'
    | 'finish'
    | 'break'
    | 'look'
    | 'say-together'
    | 'listen'
    | 'write';

export interface ClassroomInstructionCue {
    readonly id: string;
    readonly childActivityId: string;
    readonly sourceQuestionId: string;
    readonly conceptIds: readonly string[];
    readonly actionId: ClassroomInstructionActionId;
    readonly japanese: string;
    readonly reading: string;
    readonly meaning: LocalizedText;
}

export interface ClassroomInstructionSessionDefinition {
    readonly schemaVersion: 1;
    readonly id: 'session:lesson-zero-follow-instructions';
    readonly activityId: 'activity:lesson-zero-follow-instructions';
    readonly cues: readonly ClassroomInstructionCue[];
}

export interface ClassroomInstructionAttempt {
    readonly cueId: string;
    readonly chosenActionId: ClassroomInstructionActionId;
    readonly outcome: 'pass' | 'lapse';
    readonly at: number;
}

export interface ClassroomInstructionSessionState {
    readonly schemaVersion: 1;
    readonly sessionId: ClassroomInstructionSessionDefinition['id'];
    readonly status: 'ready' | 'active' | 'paused' | 'complete';
    readonly cursor: number;
    readonly passedCueIds: readonly string[];
    readonly attempts: readonly ClassroomInstructionAttempt[];
}

export type ClassroomInstructionSessionAction =
    | { readonly kind: 'start' }
    | { readonly kind: 'choose'; readonly actionId: ClassroomInstructionActionId }
    | { readonly kind: 'pause' }
    | { readonly kind: 'resume' };

export interface ClassroomInstructionAdaptiveEvidence {
    readonly eventId: string;
    readonly at: number;
    readonly modeId: string;
    readonly skill: LearningSkill;
    readonly action: LearningAction;
    readonly sourceId: string;
    readonly independent: boolean;
}

export interface ClassroomInstructionSessionTransition {
    readonly state: ClassroomInstructionSessionState;
    readonly cue?: ClassroomInstructionCue;
    readonly chosenActionId?: ClassroomInstructionActionId;
    readonly evaluation?: ActivityEvaluation;
    readonly adaptive?: ClassroomInstructionAdaptiveEvidence;
    readonly supportEvents: readonly Extract<LearnerEventInput, { kind: 'support-used' }>[];
}

export function startClassroomInstructionSession(
    definition: ClassroomInstructionSessionDefinition,
    snapshot?: ClassroomInstructionSessionState,
): ClassroomInstructionSessionState {
    validateDefinition(definition);
    if (snapshot !== undefined) {
        if (!classroomInstructionSessionSnapshotShapeIsValid(snapshot)) {
            throw new TypeError('Invalid classroom-instruction session snapshot.');
        }
        if (snapshot.sessionId !== definition.id || snapshot.cursor > definition.cues.length) {
            throw new TypeError('Classroom-instruction snapshot does not fit this definition.');
        }
        const cueIds = new Set(definition.cues.map(cue => cue.id));
        if (snapshot.passedCueIds.some(id => !cueIds.has(id))
            || snapshot.attempts.some(attempt => !cueIds.has(attempt.cueId))) {
            throw new TypeError('Classroom-instruction snapshot contains an unknown cue.');
        }
        return structuredClone(snapshot);
    }
    return {
        schemaVersion: 1,
        sessionId: definition.id,
        status: 'ready',
        cursor: 0,
        passedCueIds: [],
        attempts: [],
    };
}

export function transitionClassroomInstructionSession(
    definition: ClassroomInstructionSessionDefinition,
    state: ClassroomInstructionSessionState,
    action: ClassroomInstructionSessionAction,
    at: number,
): ClassroomInstructionSessionTransition {
    startClassroomInstructionSession(definition, state);
    if (!Number.isFinite(at)) throw new TypeError('Classroom-instruction transitions need a finite timestamp.');
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
    if (state.status !== 'active') return unchanged(state);
    const cue = definition.cues[state.cursor];
    if (!cue) return unchanged({ ...state, status: 'complete', cursor: definition.cues.length });

    const outcome = action.actionId === cue.actionId ? 'pass' : 'lapse';
    const cueAttempt = state.attempts.filter(attempt => attempt.cueId === cue.id).length + 1;
    const eventStem = `${definition.id}:${cue.id}:attempt:${cueAttempt}`;
    const attempt: ClassroomInstructionAttempt = {
        cueId: cue.id,
        chosenActionId: action.actionId,
        outcome,
        at,
    };
    const passedCueIds = outcome === 'pass'
        ? [...new Set([...state.passedCueIds, cue.id])]
        : state.passedCueIds;
    const cursor = outcome === 'pass' ? state.cursor + 1 : state.cursor;
    const nextState: ClassroomInstructionSessionState = {
        ...state,
        status: cursor >= definition.cues.length ? 'complete' : 'active',
        cursor,
        passedCueIds,
        attempts: [...state.attempts, attempt],
    };
    const repairing = outcome === 'lapse'
        || state.attempts.some(candidate => candidate.cueId === cue.id && candidate.outcome === 'lapse');
    const evaluation = evaluationFor(cue, outcome, repairing, eventStem, at);
    const supportEvents: ClassroomInstructionSessionTransition['supportEvents'] = outcome === 'lapse'
        ? [supportEvent(cue, 'transcript', eventStem, at), supportEvent(cue, 'translation', eventStem, at)]
        : [];
    return {
        state: nextState,
        cue,
        chosenActionId: action.actionId,
        evaluation,
        adaptive: {
            eventId: `${eventStem}:learning`,
            at,
            modeId: 'lesson-zero-follow-instructions',
            skill: 'listening',
            action: repairing ? 'repair' : 'listen',
            sourceId: cue.sourceQuestionId,
            independent: !repairing,
        },
        supportEvents,
    };
}

export function classroomInstructionSessionSnapshotShapeIsValid(
    value: unknown,
): value is ClassroomInstructionSessionState {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<ClassroomInstructionSessionState>;
    return candidate.schemaVersion === 1
        && candidate.sessionId === 'session:lesson-zero-follow-instructions'
        && ['ready', 'active', 'paused', 'complete'].includes(candidate.status ?? '')
        && Number.isInteger(candidate.cursor)
        && (candidate.cursor ?? -1) >= 0
        && Array.isArray(candidate.passedCueIds)
        && candidate.passedCueIds.every(id => typeof id === 'string')
        && Array.isArray(candidate.attempts)
        && candidate.attempts.every(attemptShapeIsValid);
}

function evaluationFor(
    cue: ClassroomInstructionCue,
    outcome: 'pass' | 'lapse',
    repairing: boolean,
    eventId: string,
    at: number,
): ActivityEvaluation {
    const reviewSeeds: readonly ReviewSeed[] = outcome === 'pass' ? [{
        id: `review:lesson-zero:instruction:${cue.actionId}`,
        conceptId: cue.conceptIds[0]!,
        reason: repairing ? 'repair' : 'new-learning',
        sourceQuestionId: cue.sourceQuestionId,
        content: {
            expression: cue.japanese,
            reading: cue.reading,
            meanings: [cue.meaning.en],
        },
    }] : [];
    return {
        attempt: {
            kind: 'attempt-recorded',
            eventId,
            at,
            activityId: cue.childActivityId,
            sourceQuestionId: cue.sourceQuestionId,
            conceptIds: cue.conceptIds,
            responseKind: 'scene-action',
            outcome,
            score: outcome === 'pass' ? 1 : 0,
            ...(outcome === 'lapse' ? { errorTags: ['classroom-instruction-action-mismatch'] } : {}),
        },
        result: {
            outcome,
            score: outcome === 'pass' ? 1 : 0,
            errorTags: outcome === 'pass' ? [] : ['classroom-instruction-action-mismatch'],
            feedback: outcome === 'pass'
                ? { explanation: { en: 'The room answered exactly as Rie asked.', ja: 'りえ先生の指示どおりに動けました。' } }
                : {
                    explanation: { en: 'That changed a different part of the room.', ja: '別の動作を選びました。' },
                    repairPrompt: { en: 'Hear the line again, then make the matching move.', ja: 'もう一度聞いて、合う動作を選びましょう。' },
                },
        },
        reviewSeeds,
    };
}

function supportEvent(
    cue: ClassroomInstructionCue,
    supportKind: 'transcript' | 'translation',
    eventStem: string,
    at: number,
): Extract<LearnerEventInput, { kind: 'support-used' }> {
    return {
        kind: 'support-used',
        eventId: `${eventStem}:support:${supportKind}`,
        at,
        activityId: cue.childActivityId,
        supportKind,
    };
}

function attemptShapeIsValid(value: unknown): value is ClassroomInstructionAttempt {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<ClassroomInstructionAttempt>;
    return typeof candidate.cueId === 'string'
        && isClassroomInstructionActionId(candidate.chosenActionId)
        && (candidate.outcome === 'pass' || candidate.outcome === 'lapse')
        && typeof candidate.at === 'number'
        && Number.isFinite(candidate.at);
}

function isClassroomInstructionActionId(value: unknown): value is ClassroomInstructionActionId {
    return ['begin', 'finish', 'break', 'look', 'say-together', 'listen', 'write'].includes(String(value));
}

function validateDefinition(definition: ClassroomInstructionSessionDefinition): void {
    if (definition.schemaVersion !== 1 || definition.id !== 'session:lesson-zero-follow-instructions'
        || definition.activityId !== 'activity:lesson-zero-follow-instructions') {
        throw new TypeError('Invalid classroom-instruction session definition.');
    }
    if (definition.cues.length !== 7 || new Set(definition.cues.map(cue => cue.id)).size !== 7
        || new Set(definition.cues.map(cue => cue.actionId)).size !== 7) {
        throw new TypeError('Classroom-instruction session needs seven unique cues and actions.');
    }
}

function unchanged(state: ClassroomInstructionSessionState): ClassroomInstructionSessionTransition {
    return { state, supportEvents: [] };
}
