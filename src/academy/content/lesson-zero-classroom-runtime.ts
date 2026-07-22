import type {
    ActivityEvaluation,
    ReviewSeed,
} from '../domain/activity-runtime';
import type {
    ClassroomExpressionItem,
    ClassroomExpressionProbe,
    ClassroomExpressionSessionDefinition,
    ClassroomExpressionSessionState,
    ClassroomExpressionSessionTransition,
} from '../domain/classroom-expression-session';
import type { LearnerEventInput } from '../domain/learner-record';
import type { LocalizedText } from '../domain/source-library';
import type { LearningAction, LearningSkill } from '../domain/learner-record';
import type { LessonZeroActivity } from './lesson-zero-schema';
import {
    LESSON_ZERO_CLASSROOM_ACTIVITY_BINDINGS,
    lessonZeroCanonicalReading,
    lessonZeroReviewSeedId,
    type LessonZeroClassroomActivityBinding,
} from './lesson-zero-pedagogy-definitions';

export const LESSON_ZERO_CONSTRUCTED_CLASSROOM_ACTIVITY_IDS = Object.freeze([
    'activity:lesson-zero-reconstruct-repair',
    'activity:lesson-zero-desk-language',
] as const);

export interface LessonZeroClassroomProbeRecording {
    readonly bindingActivityId: string;
    readonly evaluation: ActivityEvaluation;
    readonly adaptive: Readonly<{
        eventId?: string;
        at?: number;
        modeId: string;
        skill: LearningSkill;
        action: LearningAction;
        sourceId?: string;
        independent: boolean;
    }>;
}

const REVIEW_MEANINGS: Readonly<Record<string, LocalizedText>> = Object.freeze({
    'probe:classroom-01-start': { en: "Let's begin.", ja: '始めるときの表現です。' },
    'probe:classroom-02-finish': { en: "Let's finish.", ja: '終わるときの表現です。' },
    'probe:classroom-03-break': { en: "Let's take a break.", ja: '休憩するときの表現です。' },
    'probe:classroom-04-look': { en: 'Please look.', ja: '見るように頼む表現です。' },
    'probe:classroom-05-say': { en: 'Everyone, please say it together.', ja: 'みんなで言うように頼む表現です。' },
    'probe:classroom-06-listen': { en: 'Please listen.', ja: '聞くように頼む表現です。' },
    'probe:classroom-07-write': { en: 'Please write it.', ja: '書くように頼む表現です。' },
    'probe:classroom-08-check': { en: 'Do you understand?', ja: '理解できたか確認する表現です。' },
    'probe:classroom-08-yes': { en: 'Yes, I understand.', ja: '理解できたと答える表現です。' },
    'probe:classroom-08-no': { en: "No, I don't understand.", ja: '理解できなかったと答える表現です。' },
    'probe:classroom-09-repeat': { en: 'One more time, please.', ja: 'もう一度頼む表現です。' },
    'probe:classroom-10-good': { en: 'Good.', ja: 'よくできたと伝える表現です。' },
    'probe:classroom-11-so': { en: "That's right.", ja: '正しいと確認する表現です。' },
    'probe:classroom-11-match': { en: "That's correct.", ja: '答えが合っていると確認する表現です。' },
    'probe:classroom-12-wrong': { en: "That's not right.", ja: '違っていると伝える表現です。' },
    'probe:classroom-13-homework': { en: 'homework', ja: 'あとでする課題です。' },
    'probe:classroom-14-example': { en: 'example', ja: '参考にする見本です。' },
});

export function isLessonZeroConstructedClassroomActivity(
    activityId: string | undefined,
): activityId is typeof LESSON_ZERO_CONSTRUCTED_CLASSROOM_ACTIVITY_IDS[number] {
    return LESSON_ZERO_CONSTRUCTED_CLASSROOM_ACTIVITY_IDS.includes(activityId as never);
}

export function classroomBindingForActivity(activityId: string): LessonZeroClassroomActivityBinding {
    const binding = LESSON_ZERO_CLASSROOM_ACTIVITY_BINDINGS.find(candidate => candidate.activityId === activityId);
    if (!binding) throw new TypeError(`Unknown Lesson Zero classroom activity ${activityId}.`);
    return binding;
}

export function classroomStateForActivity(
    definition: ClassroomExpressionSessionDefinition,
    state: ClassroomExpressionSessionState,
    activityId: string,
): ClassroomExpressionSessionState {
    if (state.status === 'complete') return state;
    const binding = classroomBindingForActivity(activityId);
    const currentBelongs = binding.expressionIds.includes(state.cursor.expressionId);
    const currentPassed = state.passedProbeIds.includes(state.cursor.probeId);
    if (currentBelongs && !currentPassed) return state;
    const expressionId = binding.expressionIds.find(id => {
        const expression = expressionFor(definition, id);
        return expression.probes.some(probe => !state.passedProbeIds.includes(probe.id));
    }) ?? binding.expressionIds[0];
    if (!expressionId) return state;
    const expression = expressionFor(definition, expressionId);
    const probe = expression.probes.find(candidate => !state.passedProbeIds.includes(candidate.id))
        ?? expression.probes[0];
    if (!probe) return state;
    return {
        ...state,
        status: 'active',
        cursor: { phaseId: expression.phaseId, expressionId: expression.id, probeId: probe.id },
        visitedExpressionIds: [...new Set([...state.visitedExpressionIds, expression.id])],
    };
}

export function completedClassroomActivityIds(
    definition: ClassroomExpressionSessionDefinition,
    state: ClassroomExpressionSessionState,
): readonly string[] {
    const passed = new Set(state.passedProbeIds);
    return LESSON_ZERO_CLASSROOM_ACTIVITY_BINDINGS
        .filter(binding => binding.deterministicAssessment)
        .filter(binding => binding.expressionIds.every(expressionId =>
            expressionFor(definition, expressionId).probes.every(probe => passed.has(probe.id))))
        .map(binding => binding.activityId);
}

export function newlyCompletedClassroomActivityIds(
    definition: ClassroomExpressionSessionDefinition,
    before: ClassroomExpressionSessionState,
    after: ClassroomExpressionSessionState,
): readonly string[] {
    const prior = new Set(completedClassroomActivityIds(definition, before));
    return completedClassroomActivityIds(definition, after).filter(activityId => !prior.has(activityId));
}

export function classroomProbeRecording(
    definition: ClassroomExpressionSessionDefinition,
    transition: ClassroomExpressionSessionTransition,
): LessonZeroClassroomProbeRecording | undefined {
    const attempt = transition.evidence.find(isAttempt);
    if (!attempt) return undefined;
    const learning = transition.evidence.find(isLearning);
    if (!learning) throw new TypeError(`Classroom probe ${attempt.activityId} emitted no learning evidence.`);
    const { expression, probe } = probeFor(definition, attempt.activityId);
    const binding = bindingForExpression(expression.id);
    const teaching = definition.teachingBlocks.find(block => block.expressionIds.includes(expression.id));
    if (!teaching) throw new TypeError(`Classroom expression ${expression.id} has no teaching block.`);
    const meaning = REVIEW_MEANINGS[probe.id];
    if (!meaning) throw new TypeError(`Classroom probe ${probe.id} has no review meaning.`);
    const reviewSeeds: readonly ReviewSeed[] = attempt.outcome === 'pass' ? [{
        id: lessonZeroReviewSeedId(probe),
        conceptId: teaching.conceptId,
        reason: learning.action === 'repair' ? 'repair' : 'new-learning',
        sourceQuestionId: expression.sourceQuestionId,
        content: {
            expression: probe.modelAnswer,
            reading: lessonZeroCanonicalReading(probe),
            meanings: [meaning.en],
        },
    }] : [];
    return {
        bindingActivityId: binding.activityId,
        evaluation: {
            attempt,
            result: {
                outcome: attempt.outcome,
                score: attempt.outcome === 'pass' ? 1 : 0,
                errorTags: attempt.errorTags ?? [],
                feedback: attempt.outcome === 'pass'
                    ? { explanation: { en: 'That fits the moment.', ja: 'その場面に合っています。' } }
                    : {
                        explanation: probe.repair.contrast,
                        repairPrompt: probe.repair.retryPrompt,
                        nearbyExample: probe.repair.nearbyExample,
                    },
            },
            reviewSeeds,
        },
        adaptive: {
            ...(learning.eventId ? { eventId: learning.eventId } : {}),
            ...(learning.at !== undefined ? { at: learning.at } : {}),
            modeId: learning.modeId,
            skill: learning.skill,
            action: learning.action,
            sourceId: learning.sourceId,
            independent: learning.independent,
        },
    };
}

export function classroomActivityCompletionEvaluation(
    activity: LessonZeroActivity,
    at: number,
): ActivityEvaluation {
    if (!LESSON_ZERO_CONSTRUCTED_CLASSROOM_ACTIVITY_IDS.includes(activity.id as never)) {
        throw new TypeError(`${activity.id} is not a constructed classroom activity.`);
    }
    return {
        attempt: {
            kind: 'attempt-recorded',
            eventId: `session:lesson-zero-classroom-expressions:${activity.id}:complete`,
            at,
            activityId: activity.id,
            conceptIds: activity.conceptIds,
            responseKind: activity.expectedEvidence.kind,
            outcome: 'pass',
            score: 1,
        },
        result: {
            outcome: 'pass',
            score: 1,
            errorTags: [],
            feedback: {
                explanation: {
                    en: 'You can now use every expression in this classroom set.',
                    ja: 'この教室表現をすべて使えるようになりました。',
                },
            },
        },
        reviewSeeds: [],
    };
}

export function supportEvents(
    transition: ClassroomExpressionSessionTransition,
): readonly Extract<LearnerEventInput, { kind: 'support-used' }>[] {
    return transition.evidence.filter((event): event is Extract<LearnerEventInput, { kind: 'support-used' }> =>
        event.kind === 'support-used');
}

function bindingForExpression(expressionId: string): LessonZeroClassroomActivityBinding {
    const binding = LESSON_ZERO_CLASSROOM_ACTIVITY_BINDINGS.find(candidate =>
        candidate.expressionIds.includes(expressionId));
    if (!binding) throw new TypeError(`Classroom expression ${expressionId} has no activity binding.`);
    return binding;
}

function expressionFor(
    definition: ClassroomExpressionSessionDefinition,
    expressionId: string,
): ClassroomExpressionItem {
    const expression = definition.expressions.find(candidate => candidate.id === expressionId);
    if (!expression) throw new TypeError(`Unknown classroom expression ${expressionId}.`);
    return expression;
}

function probeFor(
    definition: ClassroomExpressionSessionDefinition,
    probeId: string,
): Readonly<{ expression: ClassroomExpressionItem; probe: ClassroomExpressionProbe }> {
    for (const expression of definition.expressions) {
        const probe = expression.probes.find(candidate => candidate.id === probeId);
        if (probe) return { expression, probe };
    }
    throw new TypeError(`Unknown classroom probe ${probeId}.`);
}

function isAttempt(
    event: LearnerEventInput,
): event is Extract<LearnerEventInput, { kind: 'attempt-recorded' }> {
    return event.kind === 'attempt-recorded';
}

function isLearning(
    event: LearnerEventInput,
): event is Extract<LearnerEventInput, { kind: 'learning-evidence-recorded' }> {
    return event.kind === 'learning-evidence-recorded';
}
