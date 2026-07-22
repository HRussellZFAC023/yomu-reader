import type {
    ClassroomExpressionCursor,
    ClassroomExpressionItem,
    ClassroomExpressionProbe,
    ClassroomExpressionSessionDefinition,
    ClassroomExpressionSessionReport,
    ClassroomExpressionSessionState,
} from './classroom-expression-session-model';

export interface OrderedClassroomExpressionProbe {
    readonly expression: ClassroomExpressionItem;
    readonly probe: ClassroomExpressionProbe;
}

export function buildClassroomExpressionSessionReport(
    definition: ClassroomExpressionSessionDefinition,
    state: ClassroomExpressionSessionState,
): ClassroomExpressionSessionReport {
    const passed = new Set(state.passedProbeIds);
    const attemptedProbes = new Set(state.attempts.map(attempt => attempt.probeId));
    const completedIds = definition.expressions
        .filter(expression => expression.probes.every(probe => passed.has(probe.id)))
        .map(expression => expression.sourceQuestionId);
    const attemptedIds = new Set(definition.expressions
        .filter(expression => expression.probes.some(probe => attemptedProbes.has(probe.id)))
        .map(expression => expression.sourceQuestionId));
    const lapsed = new Set(state.attempts
        .filter(attempt => attempt.outcome === 'lapse')
        .map(attempt => attempt.probeId));
    const allProbeIds = definition.expressions.flatMap(expression => expression.probes.map(probe => probe.id));
    return {
        sourceQuestions: {
            total: 14,
            attempted: attemptedIds.size,
            completed: completedIds.length,
            completedIds,
            unresolvedIds: definition.expressions
                .map(expression => expression.sourceQuestionId)
                .filter(id => !completedIds.includes(id)),
        },
        probes: {
            total: allProbeIds.length,
            completed: allProbeIds.filter(id => passed.has(id)).length,
            repaired: allProbeIds.filter(id => passed.has(id) && lapsed.has(id)).length,
        },
        phases: definition.phases.map(phase => {
            const expressions = phase.expressionIds.map(id => expressionById(definition, id));
            return {
                id: phase.id,
                completedExpressions: expressions.filter(expression =>
                    expression.probes.every(probe => passed.has(probe.id))).length,
                totalExpressions: expressions.length,
            };
        }),
    };
}

export function orderedProbes(
    definition: ClassroomExpressionSessionDefinition,
): readonly OrderedClassroomExpressionProbe[] {
    return definition.phases.flatMap(phase => phase.expressionIds.flatMap(expressionId => {
        const expression = expressionById(definition, expressionId);
        return expression.probes.map(probe => ({ expression, probe }));
    }));
}

export function locate(
    definition: ClassroomExpressionSessionDefinition,
    cursor: ClassroomExpressionCursor,
): OrderedClassroomExpressionProbe {
    const expression = expressionById(definition, cursor.expressionId);
    const probe = expression.probes.find(candidate => candidate.id === cursor.probeId);
    if (!probe || expression.phaseId !== cursor.phaseId) throw new TypeError('Invalid classroom-expression cursor.');
    return { expression, probe };
}

function expressionById(
    definition: ClassroomExpressionSessionDefinition,
    id: string,
): ClassroomExpressionItem {
    const expression = definition.expressions.find(candidate => candidate.id === id);
    if (!expression) throw new Error(`Unknown classroom expression: ${id}`);
    return expression;
}

export function cursorFor(
    expression: ClassroomExpressionItem,
    probe: ClassroomExpressionProbe,
): ClassroomExpressionCursor {
    return { phaseId: expression.phaseId, expressionId: expression.id, probeId: probe.id };
}

export function visit(
    state: ClassroomExpressionSessionState,
    expression: ClassroomExpressionItem,
    probe: ClassroomExpressionProbe,
): ClassroomExpressionSessionState {
    return {
        ...state,
        cursor: cursorFor(expression, probe),
        visitedExpressionIds: unique([...state.visitedExpressionIds, expression.id]),
    };
}

export function validateClassroomExpressionSessionState(
    definition: ClassroomExpressionSessionDefinition,
    snapshot: unknown,
): ClassroomExpressionSessionState {
    const state = structuredClone(snapshot) as ClassroomExpressionSessionState;
    if (!state || state.schemaVersion !== 1 || state.sessionId !== definition.id) throw new TypeError('Incompatible classroom-expression snapshot.');
    if (!['active', 'paused', 'complete'].includes(state.status)) throw new TypeError('Invalid classroom-expression status.');
    const current = locate(definition, state.cursor);
    const ordered = orderedProbes(definition);
    const probeById = new Map(ordered.map(item => [item.probe.id, item]));
    const expressionIds = new Set(definition.expressions.map(expression => expression.id));
    for (const values of [state.passedProbeIds, state.revealedModelProbeIds]) {
        if (!Array.isArray(values) || values.some(id => !probeById.has(id)) || unique(values).length !== values.length) {
            throw new TypeError('Classroom-expression snapshot references unknown probes.');
        }
    }
    if (!Array.isArray(state.visitedExpressionIds)
        || state.visitedExpressionIds.some(id => !expressionIds.has(id))
        || unique(state.visitedExpressionIds).length !== state.visitedExpressionIds.length
        || !state.visitedExpressionIds.includes(current.expression.id)) {
        throw new TypeError('Classroom-expression snapshot references unknown expressions.');
    }
    if (!Array.isArray(state.attempts) || state.attempts.some(attempt => {
        const item = probeById.get(attempt.probeId);
        return !item
            || attempt.sourceQuestionId !== item.expression.sourceQuestionId
            || !['pass', 'lapse'].includes(attempt.outcome)
            || typeof attempt.independent !== 'boolean'
            || !Number.isSafeInteger(attempt.at)
            || attempt.at < 0;
    })) {
        throw new TypeError('Classroom-expression snapshot has invalid attempts.');
    }
    const passedFromAttempts = new Set(state.attempts
        .filter(attempt => attempt.outcome === 'pass')
        .map(attempt => attempt.probeId));
    if (state.passedProbeIds.some(id => !passedFromAttempts.has(id))) {
        throw new TypeError('Classroom-expression snapshot claims progress without pass evidence.');
    }
    const lapsedFromAttempts = new Set(state.attempts
        .filter(attempt => attempt.outcome === 'lapse')
        .map(attempt => attempt.probeId));
    if (state.revealedModelProbeIds.some(id => !lapsedFromAttempts.has(id))) {
        throw new TypeError('Classroom-expression snapshot reveals support without a lapse.');
    }
    const allPassed = state.passedProbeIds.length === probeById.size;
    if ((state.status === 'complete') !== allPassed) {
        throw new TypeError('Classroom-expression completion must match full pass evidence.');
    }
    return state;
}

/**
 * Cheap persistence-boundary check. The content-aware validator above remains
 * authoritative when a session is restored; this only keeps malformed values
 * out of the durable checkpoint before the lesson package has loaded.
 */
export function classroomExpressionSessionSnapshotShapeIsValid(
    snapshot: unknown,
): snapshot is ClassroomExpressionSessionState {
    if (!snapshot || typeof snapshot !== 'object') return false;
    const state = snapshot as Partial<ClassroomExpressionSessionState>;
    if (state.schemaVersion !== 1
        || state.sessionId !== 'session:lesson-zero-classroom-expressions'
        || !state.status
        || !['active', 'paused', 'complete'].includes(state.status)) return false;
    if (!state.cursor
        || typeof state.cursor.phaseId !== 'string'
        || typeof state.cursor.expressionId !== 'string'
        || typeof state.cursor.probeId !== 'string') return false;
    if (!Array.isArray(state.attempts)
        || !Array.isArray(state.passedProbeIds)
        || !Array.isArray(state.revealedModelProbeIds)
        || !Array.isArray(state.visitedExpressionIds)) return false;
    if ([state.passedProbeIds, state.revealedModelProbeIds, state.visitedExpressionIds]
        .some(values => values.some(value => typeof value !== 'string' || !value))) return false;
    return state.attempts.every(attempt => Boolean(attempt)
        && typeof attempt.probeId === 'string'
        && typeof attempt.sourceQuestionId === 'string'
        && (attempt.outcome === 'pass' || attempt.outcome === 'lapse')
        && typeof attempt.independent === 'boolean'
        && Number.isSafeInteger(attempt.at)
        && attempt.at >= 0);
}

export function unique<T>(values: readonly T[]): T[] {
    return [...new Set(values)];
}
