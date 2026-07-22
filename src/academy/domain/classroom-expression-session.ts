import type { LearnerEventInput } from './learner-record';
import type {
    ClassroomExpressionItem,
    ClassroomExpressionProbe,
    ClassroomExpressionSessionAction,
    ClassroomExpressionSessionDefinition,
    ClassroomExpressionSessionState,
    ClassroomExpressionSessionTransition,
    ClassroomExpressionSessionView,
} from './classroom-expression-session-model';
import {
    buildClassroomExpressionSessionReport,
    cursorFor,
    locate,
    orderedProbes,
    unique,
    validateClassroomExpressionSessionState,
    visit,
} from './classroom-expression-session-state';

export type {
    ClassroomExpressionAttempt,
    ClassroomExpressionCursor,
    ClassroomExpressionItem,
    ClassroomExpressionPhase,
    ClassroomExpressionPhaseId,
    ClassroomExpressionProbe,
    ClassroomExpressionRepair,
    ClassroomExpressionTeachingBlock,
    ClassroomExpressionSessionAction,
    ClassroomExpressionSessionDefinition,
    ClassroomExpressionSessionReport,
    ClassroomExpressionSessionState,
    ClassroomExpressionSessionTransition,
    ClassroomExpressionSessionView,
} from './classroom-expression-session-model';
export { buildClassroomExpressionSessionReport } from './classroom-expression-session-state';
export { classroomExpressionSessionSnapshotShapeIsValid } from './classroom-expression-session-state';

/** Start a fresh session, or defensively restore an existing serialisable snapshot. */
export function startClassroomExpressionSession(
    definition: ClassroomExpressionSessionDefinition,
    snapshot?: unknown,
): ClassroomExpressionSessionState {
    const ordered = orderedProbes(definition);
    if (!ordered.length) throw new TypeError('Classroom-expression session has no probes.');
    if (snapshot !== undefined) return validateClassroomExpressionSessionState(definition, snapshot);
    const first = ordered[0]!;
    return {
        schemaVersion: 1,
        sessionId: definition.id,
        status: 'active',
        cursor: cursorFor(first.expression, first.probe),
        attempts: [],
        passedProbeIds: [],
        revealedModelProbeIds: [],
        visitedExpressionIds: [first.expression.id],
    };
}

/** Project only learner-safe prompt data; answer keys stay behind this interface. */
export function readClassroomExpressionSession(
    definition: ClassroomExpressionSessionDefinition,
    state: ClassroomExpressionSessionState,
): ClassroomExpressionSessionView {
    validateClassroomExpressionSessionState(definition, state);
    const { expression, probe } = locate(definition, state.cursor);
    const lapsed = state.attempts.some(attempt => attempt.probeId === probe.id && attempt.outcome === 'lapse');
    const passed = state.passedProbeIds.includes(probe.id);
    const modelRevealed = state.revealedModelProbeIds.includes(probe.id);
    const phase = definition.phases.find(candidate => candidate.id === expression.phaseId)!;
    const teaching = definition.teachingBlocks.find(candidate =>
        candidate.expressionIds.includes(expression.id));
    if (!teaching) throw new TypeError(`Missing teaching for ${expression.id}.`);
    return {
        sessionId: definition.id,
        status: state.status,
        cursor: { ...state.cursor },
        phaseTitle: { ...phase.title },
        prompt: { ...probe.prompt },
        responseKind: expression.responseKind,
        inputMode: expression.inputMode,
        sourceQuestionId: expression.sourceQuestionId,
        preAssessmentTeaching: {
            explanation: { ...teaching.explanation },
            workedExample: {
                ...teaching.workedExample,
                context: { ...teaching.workedExample.context },
                meaning: { ...teaching.workedExample.meaning },
            },
        },
        ...(!passed && lapsed ? {
            earnedRepair: {
                contrast: { ...probe.repair.contrast },
                retryPrompt: { ...probe.repair.retryPrompt },
                nearbyExample: { ...probe.repair.nearbyExample },
                modelAnswerAvailable: true as const,
                ...(modelRevealed ? { modelAnswer: probe.modelAnswer } : {}),
            },
        } : {}),
        progress: buildClassroomExpressionSessionReport(definition, state),
    };
}

/** Apply navigation, pause/resume, earned support, or one committed response. */
export function transitionClassroomExpressionSession(
    definition: ClassroomExpressionSessionDefinition,
    state: ClassroomExpressionSessionState,
    action: ClassroomExpressionSessionAction,
    at: number,
): ClassroomExpressionSessionTransition {
    requireTimestamp(at);
    validateClassroomExpressionSessionState(definition, state);
    if (action.kind === 'resume') {
        if (state.status !== 'paused') throw new Error(`Classroom-expression session is ${state.status}.`);
        return result(definition, { ...state, status: 'active' }, []);
    }
    if (state.status !== 'active') throw new Error(`Classroom-expression session is ${state.status}.`);
    if (action.kind === 'pause') return result(definition, { ...state, status: 'paused' }, []);
    if (action.kind === 'navigate') return result(definition, navigate(definition, state, action.target), []);
    if (action.kind === 'reveal-model') return revealModel(definition, state, at);
    return submit(definition, state, action.response, at);
}

function submit(
    definition: ClassroomExpressionSessionDefinition,
    state: ClassroomExpressionSessionState,
    response: string,
    at: number,
): ClassroomExpressionSessionTransition {
    if (!response.trim()) throw new TypeError('Classroom-expression evidence requires a learner commitment.');
    const { expression, probe } = locate(definition, state.cursor);
    const outcome = probe.acceptedAnswers.some(answer => normalized(answer) === normalized(response)) ? 'pass' : 'lapse';
    const independent = !state.revealedModelProbeIds.includes(probe.id);
    const hadLapse = state.attempts.some(attempt => attempt.probeId === probe.id && attempt.outcome === 'lapse');
    const passedProbeIds = outcome === 'pass' ? unique([...state.passedProbeIds, probe.id]) : state.passedProbeIds;
    const attempt = { probeId: probe.id, sourceQuestionId: expression.sourceQuestionId, outcome, independent, at } as const;
    let nextState: ClassroomExpressionSessionState = {
        ...state,
        attempts: [...state.attempts, attempt],
        passedProbeIds,
    };
    if (outcome === 'pass') {
        const allPassed = orderedProbes(definition).every(item => passedProbeIds.includes(item.probe.id));
        nextState = allPassed
            ? { ...nextState, status: 'complete' }
            : moveToNextUnpassed(definition, nextState);
    }
    return result(definition, nextState, evidenceFor(
        definition,
        expression,
        probe,
        outcome,
        independent,
        hadLapse,
        state.attempts.length + 1,
        at,
    ));
}

function revealModel(
    definition: ClassroomExpressionSessionDefinition,
    state: ClassroomExpressionSessionState,
    at: number,
): ClassroomExpressionSessionTransition {
    const { probe } = locate(definition, state.cursor);
    const hasLapse = state.attempts.some(attempt => attempt.probeId === probe.id && attempt.outcome === 'lapse');
    if (!hasLapse || state.passedProbeIds.includes(probe.id)) {
        throw new Error('A model answer is earned only after a committed lapse.');
    }
    const alreadyRevealed = state.revealedModelProbeIds.includes(probe.id);
    const nextState = {
        ...state,
        revealedModelProbeIds: unique([...state.revealedModelProbeIds, probe.id]),
    };
    const evidence: LearnerEventInput[] = alreadyRevealed ? [] : [{
        kind: 'support-used',
        eventId: `${definition.id}:${probe.id}:support:model-answer`,
        at,
        activityId: probe.id,
        supportKind: 'model-answer',
        choiceId: `reveal:${probe.id}`,
    }];
    return result(definition, nextState, evidence);
}

function evidenceFor(
    definition: ClassroomExpressionSessionDefinition,
    expression: ClassroomExpressionItem,
    probe: ClassroomExpressionProbe,
    outcome: 'pass' | 'lapse',
    independent: boolean,
    hadLapse: boolean,
    attemptNumber: number,
    at: number,
): readonly LearnerEventInput[] {
    const repairing = hadLapse || outcome === 'lapse';
    const eventStem = `${definition.id}:${probe.id}:attempt:${attemptNumber}`;
    return [{
        kind: 'attempt-recorded',
        eventId: eventStem,
        at,
        activityId: probe.id,
        sourceQuestionId: expression.sourceQuestionId,
        conceptIds: expression.conceptIds,
        responseKind: expression.responseKind,
        outcome,
        score: outcome === 'pass' ? 1 : 0,
        ...(outcome === 'lapse' ? { errorTags: [probe.repair.errorTag] } : {}),
    }, {
        kind: 'learning-evidence-recorded',
        eventId: `${eventStem}:learning`,
        at,
        activityId: probe.id,
        modeId: 'lesson-zero-classroom-expressions',
        skill: repairing ? 'repair' : expression.skill,
        action: repairing ? 'repair' : 'produce',
        outcome,
        conceptIds: expression.conceptIds,
        sourceId: expression.sourceQuestionId,
        independent,
    }];
}

function navigate(
    definition: ClassroomExpressionSessionDefinition,
    state: ClassroomExpressionSessionState,
    target: Extract<ClassroomExpressionSessionAction, { kind: 'navigate' }>['target'],
): ClassroomExpressionSessionState {
    const ordered = orderedProbes(definition);
    const current = ordered.findIndex(item => item.probe.id === state.cursor.probeId);
    let destination: (typeof ordered)[number] | undefined;
    switch (target.kind) {
        case 'next':
        case 'previous': {
            const offset = target.kind === 'next' ? 1 : -1;
            destination = ordered[(current + offset + ordered.length) % ordered.length];
            break;
        }
        case 'phase': {
            const phase = definition.phases.find(candidate => candidate.id === target.id);
            destination = phase ? firstUnpassedIn(definition, state, phase.expressionIds) : undefined;
            break;
        }
        case 'expression':
            destination = firstUnpassedIn(definition, state, [target.id]);
            break;
    }
    if (!destination) throw new Error(`Unknown classroom-expression navigation target.`);
    return visit(state, destination.expression, destination.probe);
}

function moveToNextUnpassed(
    definition: ClassroomExpressionSessionDefinition,
    state: ClassroomExpressionSessionState,
): ClassroomExpressionSessionState {
    const ordered = orderedProbes(definition);
    const current = ordered.findIndex(item => item.probe.id === state.cursor.probeId);
    const rotated = [...ordered.slice(current + 1), ...ordered.slice(0, current + 1)];
    const destination = rotated.find(item => !state.passedProbeIds.includes(item.probe.id));
    return destination ? visit(state, destination.expression, destination.probe) : state;
}

function firstUnpassedIn(
    definition: ClassroomExpressionSessionDefinition,
    state: ClassroomExpressionSessionState,
    expressionIds: readonly string[],
): ReturnType<typeof orderedProbes>[number] | undefined {
    const candidates = orderedProbes(definition).filter(item => expressionIds.includes(item.expression.id));
    return candidates.find(item => !state.passedProbeIds.includes(item.probe.id)) ?? candidates[0];
}

function result(
    definition: ClassroomExpressionSessionDefinition,
    state: ClassroomExpressionSessionState,
    evidence: readonly LearnerEventInput[],
): ClassroomExpressionSessionTransition {
    return { state, view: readClassroomExpressionSession(definition, state), evidence };
}

function normalized(value: string): string {
    return value.normalize('NFKC').replace(/[\s。！？!?.,、]/gu, '').toLocaleLowerCase('ja-JP');
}

function requireTimestamp(at: number): void {
    if (!Number.isSafeInteger(at) || at < 0) throw new TypeError('Session timestamp must be a non-negative integer.');
}
