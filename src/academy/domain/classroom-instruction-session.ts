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
    readonly voiceBindingId: string;
}

export interface ClassroomInstructionSessionDefinition {
    readonly schemaVersion: 1;
    readonly id: 'session:lesson-zero-follow-instructions';
    readonly activityId: 'activity:lesson-zero-follow-instructions';
    readonly cues: readonly ClassroomInstructionCue[];
    readonly recallActionOrder: readonly ClassroomInstructionActionId[];
}

export type ClassroomInstructionRound = 'practice' | 'recall';
export type ClassroomInstructionStage =
    | 'teach'
    | 'practice'
    | 'practice-repair'
    | 'recall'
    | 'recall-repair'
    | 'complete';

export interface ClassroomInstructionAttempt {
    readonly cueId: string;
    readonly chosenActionId: ClassroomInstructionActionId;
    readonly outcome: 'pass' | 'lapse';
    readonly at: number;
    readonly round?: ClassroomInstructionRound;
}

export interface ClassroomInstructionSessionState {
    readonly schemaVersion: 1;
    readonly sessionId: ClassroomInstructionSessionDefinition['id'];
    readonly status: 'ready' | 'active' | 'paused' | 'complete';
    readonly cursor: number;
    readonly stage?: ClassroomInstructionStage;
    readonly introducedCueIds?: readonly string[];
    readonly passedCueIds: readonly string[];
    readonly recalledCueIds?: readonly string[];
    readonly attempts: readonly ClassroomInstructionAttempt[];
}

export type ClassroomInstructionSessionAction =
    | { readonly kind: 'start' }
    | { readonly kind: 'introduce' }
    | { readonly kind: 'choose'; readonly actionId: ClassroomInstructionActionId }
    | { readonly kind: 'begin-retry' }
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
    readonly round?: ClassroomInstructionRound;
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
        const normalized = normalizeSnapshot(definition, snapshot);
        validateSnapshotAgainstDefinition(definition, normalized);
        return normalized;
    }
    return {
        schemaVersion: 1,
        sessionId: definition.id,
        status: 'ready',
        cursor: 0,
        stage: 'teach',
        introducedCueIds: [],
        passedCueIds: [],
        recalledCueIds: [],
        attempts: [],
    };
}

export function transitionClassroomInstructionSession(
    definition: ClassroomInstructionSessionDefinition,
    state: ClassroomInstructionSessionState,
    action: ClassroomInstructionSessionAction,
    at: number,
): ClassroomInstructionSessionTransition {
    const current = startClassroomInstructionSession(definition, state);
    if (!Number.isFinite(at)) throw new TypeError('Classroom-instruction transitions need a finite timestamp.');
    if (action.kind === 'start') {
        if (current.status !== 'ready') return unchanged(current);
        return unchanged({ ...current, status: 'active', stage: 'teach' });
    }
    if (action.kind === 'pause') {
        if (current.status !== 'active') return unchanged(current);
        return unchanged({ ...current, status: 'paused' });
    }
    if (action.kind === 'resume') {
        if (current.status !== 'paused') return unchanged(current);
        return unchanged({ ...current, status: 'active' });
    }
    if (current.status !== 'active') return unchanged(current);
    if (action.kind === 'introduce') {
        if (current.stage !== 'teach') return unchanged(current);
        const cue = classroomInstructionCurrentCue(definition, current);
        if (!cue) return unchanged(current);
        return unchanged({
            ...current,
            stage: 'practice',
            introducedCueIds: unique([...(current.introducedCueIds ?? []), cue.id]),
        });
    }
    if (action.kind === 'begin-retry') {
        if (current.stage !== 'practice-repair' && current.stage !== 'recall-repair') return unchanged(current);
        return unchanged({
            ...current,
            stage: current.stage === 'practice-repair' ? 'practice' : 'recall',
        });
    }
    if (action.kind !== 'choose') return unchanged(current);
    const round: ClassroomInstructionRound =
        current.stage === 'recall' ? 'recall' : 'practice';
    if (current.stage !== 'practice' && current.stage !== 'recall') return unchanged(current);
    const cue = classroomInstructionCurrentCue(definition, current);
    if (!cue) return unchanged(current);

    const outcome = action.actionId === cue.actionId ? 'pass' : 'lapse';
    const cueAttempt = current.attempts.filter(attempt => attempt.cueId === cue.id && (attempt.round ?? 'practice') === round).length + 1;
    const eventStem = `${definition.id}:${cue.id}:${round}:attempt:${cueAttempt}`;
    const attempt: ClassroomInstructionAttempt = {
        cueId: cue.id,
        chosenActionId: action.actionId,
        outcome,
        at,
        round,
    };
    const passedCueIds = round === 'practice' && outcome === 'pass'
        ? unique([...current.passedCueIds, cue.id])
        : current.passedCueIds;
    const recalledCueIds = round === 'recall' && outcome === 'pass'
        ? unique([...(current.recalledCueIds ?? []), cue.id])
        : (current.recalledCueIds ?? []);
    const practiceComplete = passedCueIds.length === definition.cues.length;
    const recallComplete = recalledCueIds.length === definition.cues.length;
    const nextStage: ClassroomInstructionStage = outcome === 'lapse'
        ? round === 'practice' ? 'practice-repair' : 'recall-repair'
        : round === 'practice'
            ? practiceComplete ? 'recall' : 'teach'
            : recallComplete ? 'complete' : 'recall';
    const nextState: ClassroomInstructionSessionState = {
        ...current,
        status: recallComplete ? 'complete' : 'active',
        stage: nextStage,
        cursor: passedCueIds.length,
        passedCueIds,
        recalledCueIds,
        attempts: [...current.attempts, attempt],
    };
    const repairing = outcome === 'lapse'
        || current.attempts.some(candidate =>
            candidate.cueId === cue.id
            && (candidate.round ?? 'practice') === round
            && candidate.outcome === 'lapse');
    const evaluation = evaluationFor(cue, outcome, repairing, round, eventStem, at);
    const supportEvents: ClassroomInstructionSessionTransition['supportEvents'] = outcome === 'lapse'
        ? [supportEvent(cue, 'transcript', eventStem, at), supportEvent(cue, 'translation', eventStem, at)]
        : [];
    return {
        state: nextState,
        cue,
        chosenActionId: action.actionId,
        round,
        evaluation,
        adaptive: {
            eventId: `${eventStem}:learning`,
            at,
            modeId: 'lesson-zero-follow-instructions',
            skill: 'listening',
            action: repairing ? 'repair' : round === 'recall' ? 'recall' : 'listen',
            sourceId: cue.sourceQuestionId,
            independent: round === 'recall' && !repairing,
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
        && (candidate.stage === undefined || [
            'teach',
            'practice',
            'practice-repair',
            'recall',
            'recall-repair',
            'complete',
        ].includes(candidate.stage))
        && (candidate.introducedCueIds === undefined || stringArray(candidate.introducedCueIds))
        && Array.isArray(candidate.passedCueIds)
        && candidate.passedCueIds.every(id => typeof id === 'string')
        && (candidate.recalledCueIds === undefined || stringArray(candidate.recalledCueIds))
        && Array.isArray(candidate.attempts)
        && candidate.attempts.every(attemptShapeIsValid);
}

function evaluationFor(
    cue: ClassroomInstructionCue,
    outcome: 'pass' | 'lapse',
    repairing: boolean,
    round: ClassroomInstructionRound,
    eventId: string,
    at: number,
): ActivityEvaluation {
    const reviewSeeds: readonly ReviewSeed[] = outcome === 'pass' && round === 'practice' ? [{
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
                ? {
                    explanation: round === 'recall'
                        ? { en: 'You caught it in a new order.', ja: '違う順番でも聞き取れました。' }
                        : { en: 'The room moved with Rie.', ja: 'りえ先生と一緒に動けました。' },
                }
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
        && (candidate.round === undefined || candidate.round === 'practice' || candidate.round === 'recall')
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
        || new Set(definition.cues.map(cue => cue.actionId)).size !== 7
        || definition.recallActionOrder.length !== 7
        || new Set(definition.recallActionOrder).size !== 7
        || definition.recallActionOrder.some(actionId => !definition.cues.some(cue => cue.actionId === actionId))) {
        throw new TypeError('Classroom-instruction session needs seven unique cues and actions.');
    }
}

export function classroomInstructionCurrentCue(
    definition: ClassroomInstructionSessionDefinition,
    state: ClassroomInstructionSessionState,
): ClassroomInstructionCue | undefined {
    if (state.stage === 'recall' || state.stage === 'recall-repair') {
        const actionId = definition.recallActionOrder[(state.recalledCueIds ?? []).length];
        return definition.cues.find(cue => cue.actionId === actionId);
    }
    return definition.cues[state.passedCueIds.length];
}

function normalizeSnapshot(
    definition: ClassroomInstructionSessionDefinition,
    snapshot: ClassroomInstructionSessionState,
): ClassroomInstructionSessionState {
    const passedCueIds = unique([...snapshot.passedCueIds]);
    const legacy = snapshot.stage === undefined;
    if (legacy && snapshot.status === 'complete') {
        return {
            ...structuredClone(snapshot),
            cursor: definition.cues.length,
            stage: 'complete',
            introducedCueIds: definition.cues.map(cue => cue.id),
            passedCueIds: definition.cues.map(cue => cue.id),
            recalledCueIds: definition.recallActionOrder.map(actionId =>
                definition.cues.find(cue => cue.actionId === actionId)!.id),
            attempts: snapshot.attempts.map(attempt => ({ ...attempt, round: 'practice' })),
        };
    }
    if (legacy) {
        return {
            ...structuredClone(snapshot),
            cursor: passedCueIds.length,
            stage: 'teach',
            introducedCueIds: passedCueIds,
            passedCueIds,
            recalledCueIds: [],
            attempts: snapshot.attempts.map(attempt => ({ ...attempt, round: 'practice' })),
        };
    }
    return {
        ...structuredClone(snapshot),
        introducedCueIds: unique([...(snapshot.introducedCueIds ?? [])]),
        recalledCueIds: unique([...(snapshot.recalledCueIds ?? [])]),
        attempts: snapshot.attempts.map(attempt => ({ ...attempt, round: attempt.round ?? 'practice' })),
    };
}

function validateSnapshotAgainstDefinition(
    definition: ClassroomInstructionSessionDefinition,
    state: ClassroomInstructionSessionState,
): void {
    const learningIds = definition.cues.map(cue => cue.id);
    const recallIds = definition.recallActionOrder.map(actionId =>
        definition.cues.find(cue => cue.actionId === actionId)!.id);
    const introduced = state.introducedCueIds ?? [];
    const recalled = state.recalledCueIds ?? [];
    const prefix = (actual: readonly string[], expected: readonly string[]) =>
        actual.every((id, index) => id === expected[index]);
    if (!prefix(state.passedCueIds, learningIds)
        || !prefix(introduced, learningIds)
        || !prefix(recalled, recallIds)
        || introduced.length < state.passedCueIds.length
        || introduced.length > state.passedCueIds.length + 1) {
        throw new TypeError('Classroom-instruction snapshot has drifted from the balanced learning order.');
    }
    const known = new Set(learningIds);
    if (state.attempts.some(attempt => !known.has(attempt.cueId))) {
        throw new TypeError('Classroom-instruction snapshot contains an unknown cue.');
    }
    if ((state.stage === 'recall' || state.stage === 'recall-repair')
        && state.passedCueIds.length !== definition.cues.length) {
        throw new TypeError('Classroom-instruction recall started before all seven cues were learned.');
    }
    if (state.status === 'complete'
        && (state.stage !== 'complete' || recalled.length !== definition.cues.length)) {
        throw new TypeError('Classroom-instruction completion needs mixed recall of all seven cues.');
    }
}

function unique<T>(values: readonly T[]): T[] {
    return [...new Set(values)];
}

function stringArray(value: unknown): value is readonly string[] {
    return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function unchanged(state: ClassroomInstructionSessionState): ClassroomInstructionSessionTransition {
    return { state, supportEvents: [] };
}
