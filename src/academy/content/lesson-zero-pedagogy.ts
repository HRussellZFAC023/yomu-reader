import classroomExpressionJson from '../../../public/academy/content/lessons/lesson-zero-classroom-expressions.v1.json';
import type { ClassroomExpressionSessionDefinition } from '../domain/classroom-expression-session';
import {
    createGroundedDefinitionRegistry,
    type GroundedDefinitionRegistry,
} from '../domain/grounded-definition-registry';
import type { GroundedDefinitionRef } from '../domain/grounded-lesson';
import type { LessonZeroActivity, LessonZeroPackageData } from './lesson-zero-schema';
import { validateLessonZeroClassroomExpressions } from './lesson-zero-classroom-expressions';
import {
    createLessonZeroDefinitionRecords,
    LESSON_ZERO_CLASSROOM_ACTIVITY_BINDINGS,
    lessonZeroCanonicalReading,
    lessonZeroErrorId,
    lessonZeroFeedbackId,
    lessonZeroNearbyExampleId,
    lessonZeroProbesForBinding,
    lessonZeroReviewSeedId,
    type LessonZeroClassroomActivityBinding,
} from './lesson-zero-pedagogy-definitions';

export {
    LESSON_ZERO_CLASSROOM_ACTIVITY_BINDINGS,
    LESSON_ZERO_CLASSROOM_EXPRESSIONS_SHA256,
    LESSON_ZERO_CONTENT_SHA256,
} from './lesson-zero-pedagogy-definitions';

export interface LessonZeroPedagogy {
    readonly classroom: ClassroomExpressionSessionDefinition;
    readonly registry: GroundedDefinitionRegistry;
    readonly classroomBindings: ReadonlyMap<string, LessonZeroClassroomActivityBinding>;
    refsForInstruction(activity: LessonZeroActivity): readonly Readonly<{
        conceptId: string;
        explanationRefs: readonly GroundedDefinitionRef[];
        workedExampleRefs: readonly GroundedDefinitionRef[];
    }>[];
    assessmentRefs(activityId: string): Readonly<{
        grader: GroundedDefinitionRef;
        answerSet: GroundedDefinitionRef;
    }>;
    repairIds(activityId: string): Readonly<{
        errorTagIds: readonly string[];
        feedbackIds: readonly string[];
        nearbyExampleIds: readonly string[];
    }>;
    reviewItems(activityId: string): readonly Readonly<{
        seedId: string;
        conceptId: string;
        expressionKey: string;
        readingKey: string;
    }>[];
}

export function createLessonZeroPedagogy(data: LessonZeroPackageData): LessonZeroPedagogy {
    const classroom = validateLessonZeroClassroomExpressions(classroomExpressionJson);
    const records = createLessonZeroDefinitionRecords(data, classroom);
    const registry = createGroundedDefinitionRegistry(records);
    const classroomBindings = new Map(LESSON_ZERO_CLASSROOM_ACTIVITY_BINDINGS.map(binding => [
        binding.activityId,
        binding,
    ]));
    const expressionById = new Map(classroom.expressions.map(expression => [expression.id, expression]));
    const teachingByExpression = new Map(classroom.teachingBlocks.flatMap(block =>
        block.expressionIds.map(expressionId => [expressionId, block] as const)));

    return Object.freeze({
        classroom,
        registry,
        classroomBindings,
        refsForInstruction(activity: LessonZeroActivity) {
            const binding = requireBinding(classroomBindings, activity.id);
            const blocks = unique(binding.expressionIds.map(expressionId =>
                requireValue(teachingByExpression, expressionId, 'teaching block')));
            const byConcept = new Map(blocks.map(block => [block.conceptId, block]));
            return activity.conceptIds.map(conceptId => {
                const block = requireValue(byConcept, conceptId, 'teaching concept');
                const suffix = suffixOf(block.id);
                return {
                    conceptId,
                    explanationRefs: [registry.ref(`explanation:lesson-zero:${suffix}`, 'explanation')],
                    workedExampleRefs: [registry.ref(`worked-example:lesson-zero:${suffix}`, 'worked-example')],
                };
            });
        },
        assessmentRefs(activityId: string) {
            const binding = requireBinding(classroomBindings, activityId);
            if (!binding.deterministicAssessment) {
                throw new TypeError(`${activityId} still needs a construct-matched scene-action grader.`);
            }
            return {
                grader: registry.ref('grader:lesson-zero:normalized-constructed-japanese', 'deterministic-grader'),
                answerSet: registry.ref(`answer-set:lesson-zero:${suffixOf(activityId)}`, 'answer-set'),
            };
        },
        repairIds(activityId: string) {
            const probes = lessonZeroProbesForBinding(requireBinding(classroomBindings, activityId), expressionById);
            return {
                errorTagIds: probes.map(probe => lessonZeroErrorId(probe)),
                feedbackIds: probes.map(probe => lessonZeroFeedbackId(probe)),
                nearbyExampleIds: probes.map(probe => lessonZeroNearbyExampleId(probe)),
            };
        },
        reviewItems(activityId: string) {
            const binding = requireBinding(classroomBindings, activityId);
            return binding.expressionIds.flatMap(expressionId => {
                const expression = requireValue(expressionById, expressionId, 'classroom expression');
                const block = requireValue(teachingByExpression, expressionId, 'teaching block');
                return expression.probes.map(probe => ({
                    seedId: lessonZeroReviewSeedId(probe),
                    conceptId: block.conceptId,
                    expressionKey: probe.modelAnswer,
                    readingKey: lessonZeroCanonicalReading(probe),
                }));
            });
        },
    });
}

function requireBinding(
    bindings: ReadonlyMap<string, LessonZeroClassroomActivityBinding>,
    activityId: string,
): LessonZeroClassroomActivityBinding {
    return requireValue(bindings, activityId, 'classroom activity binding');
}

function requireValue<T>(values: ReadonlyMap<string, T>, id: string, label: string): T {
    const value = values.get(id);
    if (!value) throw new TypeError(`Missing ${label} ${id}.`);
    return value;
}

function suffixOf(id: string): string {
    return id.split(':').at(-1)!;
}

function unique<T>(values: readonly T[]): T[] {
    return [...new Set(values)];
}
