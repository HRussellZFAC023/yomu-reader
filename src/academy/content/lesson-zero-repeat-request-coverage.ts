import type { ClassroomExpressionSessionDefinition } from '../domain/classroom-expression-session';
import { startLessonZeroRepeatRequestSession, transitionLessonZeroRepeatRequestSession,
    type LessonZeroRepeatRequestDefinition, type LessonZeroRepeatRequestSessionState,
    type LessonZeroRepeatRequestSessionAction, type LessonZeroRepeatRequestSessionTransition,
} from '../domain/lesson-zero-repeat-request-session';

// Phrase 09 keeps its existing sound-chunk practice and cafe transfer. The
// remaining source probes need their own taught response, not a shared pass.
const SOURCE_PIECES = [
    ['08-check', ['わかります', 'か'], ['wakarimasu', 'ka']],
    ['08-yes', ['はい、', 'わかります'], ['hai', 'wakarimasu']],
    ['08-no', ['いいえ、', 'わかりません'], ['iie', 'wakarimasen']],
    ['10-good', ['いい', 'です'], ['ii', 'desu']],
    ['11-so', ['そう', 'です'], ['sou', 'desu']],
    ['11-match', ['あって', 'ます'], ['atte', 'masu']],
    ['12-wrong', ['ちがい', 'ます'], ['chigai', 'masu']],
] as const;

export const REPEAT_REQUEST_COVERAGE_ACTIVITY_IDS = SOURCE_PIECES.map(([id]) =>
    `activity:lesson-zero-reconstruct-repair:classroom-${id}`);

export function repeatRequestCoverageProbes(classroom: ClassroomExpressionSessionDefinition) {
    return SOURCE_PIECES.map(([id, pieces, sounds]) => {
        const expression = classroom.expressions.find(item => item.id === `expression:classroom-${id.slice(0, 2)}`);
        const probe = expression?.probes.find(item => item.id === `probe:classroom-${id}`);
        if (!expression || !probe || probe.modelAnswer !== pieces.join('')) {
            throw new TypeError(`Repeat-request source probe ${id} has drifted.`);
        }
        return { id: probe.id, sourceQuestionId: expression.sourceQuestionId,
            conceptIds: expression.conceptIds, prompt: probe.prompt, modelAnswer: probe.modelAnswer,
            repair: probe.repair, pieces: [...pieces], sounds: [...sounds] };
    });
}

export type RepeatRequestCoverageDefinition = LessonZeroRepeatRequestDefinition & {
    readonly coverageProbes: ReturnType<typeof repeatRequestCoverageProbes>;
};
export interface RepeatRequestCoverageProgress {
    readonly index: number;
    readonly stage: 'teach' | 'response' | 'feedback';
    readonly selected: readonly number[];
    readonly passedProbeIds: readonly string[];
    readonly attempts: number;
    readonly outcome?: 'pass' | 'lapse';
}
export type RepeatRequestCoverageState = LessonZeroRepeatRequestSessionState & {
    readonly repairCoverage?: RepeatRequestCoverageProgress;
};
export type RepeatRequestCoverageAction = LessonZeroRepeatRequestSessionAction
    | { kind: 'coverage-begin' | 'coverage-submit' | 'coverage-next' }
    | { kind: 'coverage-select'; index: number };
export type RepeatRequestCoverageTransition = Omit<LessonZeroRepeatRequestSessionTransition, 'state'> & {
    state: RepeatRequestCoverageState;
};

function freshCoverage(): RepeatRequestCoverageProgress {
    return { index: 0, stage: 'teach', selected: [], passedProbeIds: [], attempts: 0 };
}

export function startRepeatRequestCoverageSession(
    definition: RepeatRequestCoverageDefinition, snapshot?: RepeatRequestCoverageState,
): RepeatRequestCoverageState {
    const state = startLessonZeroRepeatRequestSession(definition, snapshot) as RepeatRequestCoverageState;
    const progress = state.repairCoverage ?? freshCoverage();
    const ids = definition.coverageProbes.map(probe => probe.id);
    if (!Number.isInteger(progress.index) || progress.index < 0 || progress.index >= ids.length
        || !['teach', 'response', 'feedback'].includes(progress.stage)
        || !Number.isInteger(progress.attempts) || progress.attempts < 0
        || !Array.isArray(progress.selected) || progress.selected.length > 2
        || new Set(progress.selected).size !== progress.selected.length
        || progress.selected.some(index => index !== 0 && index !== 1)
        || !Array.isArray(progress.passedProbeIds)
        || progress.passedProbeIds.some((id, index) => id !== ids[index])
        || progress.passedProbeIds.length !== progress.index + (progress.outcome === 'pass' ? 1 : 0)
        || (progress.outcome !== undefined && progress.outcome !== 'pass' && progress.outcome !== 'lapse')
        || (progress.stage === 'feedback') !== (progress.outcome !== undefined)) {
        throw new TypeError('Invalid repeat-request source coverage progress.');
    }
    // Old phrase-09-only completions resume at the missing teaching, not at
    // an all-source completion screen. Historical attempts are retained.
    return { ...state, repairCoverage: progress,
        status: state.status === 'complete' && progress.passedProbeIds.length !== ids.length ? 'active' : state.status };
}

export function transitionRepeatRequestCoverageSession(
    definition: RepeatRequestCoverageDefinition, state: RepeatRequestCoverageState,
    action: RepeatRequestCoverageAction, at: number,
): RepeatRequestCoverageTransition {
    const current = startRepeatRequestCoverageSession(definition, state);
    if (!Number.isFinite(at)) throw new TypeError('Repeat-request transitions need a finite timestamp.');
    if (!action.kind.startsWith('coverage-')) {
        const next = transitionLessonZeroRepeatRequestSession(definition, current, action as LessonZeroRepeatRequestSessionAction, at);
        return { ...next, state: startRepeatRequestCoverageSession(definition, next.state) };
    }
    const unchanged = (): RepeatRequestCoverageTransition => ({ state: current, supportEvents: [] });
    if (current.status !== 'active' || current.stage !== 'complete' || !current.transferPassed) return unchanged();
    const progress = current.repairCoverage!;
    const probe = definition.coverageProbes[progress.index]!;
    const update = (repairCoverage: RepeatRequestCoverageProgress): RepeatRequestCoverageTransition => ({
        state: { ...current, repairCoverage }, supportEvents: [],
    });
    if (action.kind === 'coverage-begin' && progress.stage === 'teach') {
        return update({ ...progress, stage: 'response' });
    }
    if (action.kind === 'coverage-select' && progress.stage === 'response') {
        if (action.index !== 0 && action.index !== 1) return unchanged();
        const selected = progress.selected.includes(action.index)
            ? progress.selected.filter(index => index !== action.index) : [...progress.selected, action.index];
        return update({ ...progress, selected });
    }
    if (action.kind === 'coverage-next' && progress.stage === 'feedback') {
        if (progress.outcome === 'pass' && progress.index === definition.coverageProbes.length - 1) {
            return { state: { ...current, status: 'complete' }, supportEvents: [] };
        }
        return update({ ...progress, index: progress.index + (progress.outcome === 'pass' ? 1 : 0),
            stage: 'teach', selected: [], outcome: undefined });
    }
    if (action.kind !== 'coverage-submit' || progress.stage !== 'response') return unchanged();
    const outcome = progress.selected.join(',') === '0,1' ? 'pass' : 'lapse';
    const attempts = progress.attempts + 1;
    const result = update({ ...progress, stage: 'feedback', outcome, attempts,
        passedProbeIds: outcome === 'pass' ? [...progress.passedProbeIds, probe.id] : progress.passedProbeIds });
    const activityId = `activity:lesson-zero-reconstruct-repair:${probe.id.replace('probe:', '')}`;
    return { ...result, evaluation: {
        attempt: { kind: 'attempt-recorded', eventId: `${activityId}:attempt:${attempts}`, at,
            activityId, sourceQuestionId: probe.sourceQuestionId, conceptIds: probe.conceptIds,
            responseKind: 'ordered-sound-chunks', outcome, score: outcome === 'pass' ? 1 : 0 },
        result: { outcome, score: outcome === 'pass' ? 1 : 0,
            errorTags: outcome === 'pass' ? [] : [probe.repair.errorTag],
            feedback: { explanation: probe.repair.contrast } }, reviewSeeds: [],
    } };
}
