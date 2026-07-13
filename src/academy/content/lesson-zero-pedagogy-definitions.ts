import type {
    ClassroomExpressionItem,
    ClassroomExpressionProbe,
    ClassroomExpressionSessionDefinition,
} from '../domain/classroom-expression-session';
import type {
    GroundedDefinitionKind,
    GroundedDefinitionRecord,
} from '../domain/grounded-definition-registry';
import type { LessonZeroPackageData } from './lesson-zero-schema';

export const LESSON_ZERO_CONTENT_SHA256 =
    '239c59fe41aae1d2343b0abd3765f9f889c4b24428b2d21ed01e17b60f82d48b';
export const LESSON_ZERO_CLASSROOM_EXPRESSIONS_SHA256 =
    'a1ac9cb34de4eb585d0ea4ba68e2e3d70ed666bdc0c75be62111798d69d5a4eb';

const LESSON_CONTENT_ID = 'content:lesson-zero-v1';
const CLASSROOM_CONTENT_ID = 'content:lesson-zero-classroom-expressions-v1';

export interface LessonZeroClassroomActivityBinding {
    readonly activityId: string;
    readonly expressionIds: readonly string[];
    readonly deterministicAssessment: boolean;
}

export const LESSON_ZERO_CLASSROOM_ACTIVITY_BINDINGS: readonly LessonZeroClassroomActivityBinding[] = Object.freeze([
    { activityId: 'activity:lesson-zero-follow-instructions', expressionIds: range(1, 7), deterministicAssessment: false },
    { activityId: 'activity:lesson-zero-reconstruct-repair', expressionIds: range(8, 12), deterministicAssessment: true },
    { activityId: 'activity:lesson-zero-desk-language', expressionIds: range(13, 14), deterministicAssessment: true },
]);

export function createLessonZeroDefinitionRecords(
    data: LessonZeroPackageData,
    classroom: ClassroomExpressionSessionDefinition,
): GroundedDefinitionRecord[] {
    return [
        ...curriculumRecords(data),
        ...teachingRecords(classroom),
        ...classroomRuntimeRecords(classroom),
    ];
}

export function lessonZeroProbesForBinding(
    binding: LessonZeroClassroomActivityBinding,
    expressions: ReadonlyMap<string, ClassroomExpressionItem>,
): readonly ClassroomExpressionProbe[] {
    return binding.expressionIds.flatMap(expressionId => {
        const expression = expressions.get(expressionId);
        if (!expression) throw new TypeError(`Missing classroom expression ${expressionId}.`);
        return expression.probes;
    });
}

export function lessonZeroCanonicalReading(probe: ClassroomExpressionProbe): string {
    const reading = probe.acceptedAnswers.find(answer => !/[\p{Script=Han}]/u.test(answer));
    if (!reading) throw new TypeError(`Probe ${probe.id} needs an explicit kana reading for Yomu review.`);
    return reading;
}

export function lessonZeroErrorId(probe: ClassroomExpressionProbe): string {
    return `error:${probe.repair.errorTag}`;
}

export function lessonZeroFeedbackId(probe: ClassroomExpressionProbe): string {
    return `feedback:lesson-zero:${suffixOf(probe.id)}`;
}

export function lessonZeroNearbyExampleId(probe: ClassroomExpressionProbe): string {
    return `nearby-example:lesson-zero:${suffixOf(probe.id)}`;
}

export function lessonZeroReviewSeedId(probe: ClassroomExpressionProbe): string {
    return `review:lesson-zero:${suffixOf(probe.id)}`;
}

function curriculumRecords(data: LessonZeroPackageData): GroundedDefinitionRecord[] {
    const conceptActivities = new Map<string, string[]>();
    for (const activity of data.lesson.activities) {
        for (const conceptId of activity.conceptIds) {
            conceptActivities.set(conceptId, [...(conceptActivities.get(conceptId) ?? []), activity.id]);
        }
    }
    const concepts = [...conceptActivities].map(([id, activityIds]) => record(
        id, 'concept', LESSON_CONTENT_ID, `lesson.activities[conceptId=${id}]`,
        { lessonId: data.lesson.id, activityIds }, data.lesson.contentVersion, LESSON_ZERO_CONTENT_SHA256,
    ));
    const outcomes = data.lesson.sections.flatMap(section => section.outcomeIds.map(id => record(
        id, 'outcome', LESSON_CONTENT_ID, `lesson.sections[id=${section.id}].outcomeIds[id=${id}]`,
        { lessonId: data.lesson.id, sectionId: section.id }, data.lesson.contentVersion, LESSON_ZERO_CONTENT_SHA256,
    )));
    const repair = data.lesson.activities.find(activity =>
        activity.id === 'activity:lesson-zero-reconstruct-repair');
    const prior = data.lesson.activities.find(activity =>
        activity.id === 'activity:lesson-zero-follow-instructions');
    const prerequisites = repair && prior ? [record(
        'prerequisite-resolution:lesson-zero:reconstruct-repair',
        'prerequisite-resolution',
        LESSON_CONTENT_ID,
        'lesson.activities[id=activity:lesson-zero-reconstruct-repair]',
        { activityId: repair.id, prerequisiteActivityId: prior.id, conceptIds: prior.conceptIds },
        data.lesson.contentVersion,
        LESSON_ZERO_CONTENT_SHA256,
    )] : [];
    return [...concepts, ...outcomes, ...prerequisites];
}

function teachingRecords(classroom: ClassroomExpressionSessionDefinition): GroundedDefinitionRecord[] {
    return classroom.teachingBlocks.flatMap(block => {
        const suffix = suffixOf(block.id);
        return [
            record(
                `explanation:lesson-zero:${suffix}`, 'explanation', CLASSROOM_CONTENT_ID,
                `teachingBlocks[id=${block.id}].explanation`, block.explanation,
                classroom.contentVersion, LESSON_ZERO_CLASSROOM_EXPRESSIONS_SHA256,
            ),
            record(
                `worked-example:lesson-zero:${suffix}`, 'worked-example', CLASSROOM_CONTENT_ID,
                `teachingBlocks[id=${block.id}].workedExample`, block.workedExample,
                classroom.contentVersion, LESSON_ZERO_CLASSROOM_EXPRESSIONS_SHA256,
            ),
        ];
    });
}

function classroomRuntimeRecords(classroom: ClassroomExpressionSessionDefinition): GroundedDefinitionRecord[] {
    const records: GroundedDefinitionRecord[] = [record(
        'grader:lesson-zero:normalized-constructed-japanese',
        'deterministic-grader',
        CLASSROOM_CONTENT_ID,
        'responseKind=constructed-japanese',
        {
            sessionId: classroom.id,
            normalization: ['NFKC', 'remove-space-and-punctuation', 'lowercase-ja-JP'],
            completionPolicy: classroom.completionPolicy,
        },
        classroom.contentVersion,
        LESSON_ZERO_CLASSROOM_EXPRESSIONS_SHA256,
    )];
    const expressionById = new Map(classroom.expressions.map(expression => [expression.id, expression]));
    for (const binding of LESSON_ZERO_CLASSROOM_ACTIVITY_BINDINGS.filter(candidate => candidate.deterministicAssessment)) {
        const probes = lessonZeroProbesForBinding(binding, expressionById);
        records.push(record(
            `answer-set:lesson-zero:${suffixOf(binding.activityId)}`,
            'answer-set',
            CLASSROOM_CONTENT_ID,
            `expressions[activityId=${binding.activityId}].probes.acceptedAnswers`,
            probes.map(probe => ({ id: probe.id, acceptedAnswers: probe.acceptedAnswers })),
            classroom.contentVersion,
            LESSON_ZERO_CLASSROOM_EXPRESSIONS_SHA256,
        ));
    }
    const teachingByExpression = new Map(classroom.teachingBlocks.flatMap(block =>
        block.expressionIds.map(expressionId => [expressionId, block] as const)));
    for (const expression of classroom.expressions) {
        const block = teachingByExpression.get(expression.id);
        if (!block) throw new TypeError(`Missing teaching block for ${expression.id}.`);
        for (const probe of expression.probes) {
            records.push(
                record(lessonZeroErrorId(probe), 'error-tag', CLASSROOM_CONTENT_ID,
                    `expressions[id=${expression.id}].probes[id=${probe.id}].repair.errorTag`,
                    probe.repair.errorTag, classroom.contentVersion, LESSON_ZERO_CLASSROOM_EXPRESSIONS_SHA256),
                record(lessonZeroFeedbackId(probe), 'feedback', CLASSROOM_CONTENT_ID,
                    `expressions[id=${expression.id}].probes[id=${probe.id}].repair`,
                    { contrast: probe.repair.contrast, retryPrompt: probe.repair.retryPrompt },
                    classroom.contentVersion, LESSON_ZERO_CLASSROOM_EXPRESSIONS_SHA256),
                record(lessonZeroNearbyExampleId(probe), 'nearby-example', CLASSROOM_CONTENT_ID,
                    `expressions[id=${expression.id}].probes[id=${probe.id}].repair.nearbyExample`,
                    probe.repair.nearbyExample, classroom.contentVersion, LESSON_ZERO_CLASSROOM_EXPRESSIONS_SHA256),
                record(lessonZeroReviewSeedId(probe), 'review-seed', CLASSROOM_CONTENT_ID,
                    `expressions[id=${expression.id}].probes[id=${probe.id}]`, {
                        conceptId: block.conceptId,
                        expressionKey: probe.modelAnswer,
                        readingKey: lessonZeroCanonicalReading(probe),
                    }, classroom.contentVersion, LESSON_ZERO_CLASSROOM_EXPRESSIONS_SHA256),
            );
        }
    }
    return records;
}

function record(
    id: string,
    kind: GroundedDefinitionKind,
    contentId: string,
    locator: string,
    value: unknown,
    revision: string,
    sha256: string,
): GroundedDefinitionRecord {
    return { ref: { id, registry: 'academy-content', revision, sha256 }, kind, source: { contentId, locator }, value };
}

function suffixOf(id: string): string {
    return id.split(':').at(-1)!;
}

function range(from: number, to: number): string[] {
    return Array.from({ length: to - from + 1 }, (_, index) =>
        `expression:classroom-${String(from + index).padStart(2, '0')}`);
}
