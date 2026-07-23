import type {
    ClassroomExpressionItem,
    ClassroomExpressionProbe,
    ClassroomExpressionSessionDefinition,
} from '../domain/classroom-expression-session';
import type {
    GroundedDefinitionKind,
    GroundedDefinitionRecord,
} from '../domain/grounded-definition-registry';
import type { GroundedAnswerConcealmentAuditArtifact } from '../domain/grounded-answer-concealment-audit';
import {
    LESSON_ZERO_SOUND_SURFACE_ID,
    lessonZeroSoundAuditBinding,
    lessonZeroSoundRendererRef,
} from '../domain/lesson-zero-sound-grounding';
import type { LessonZeroPackageData } from './lesson-zero-schema';

export const LESSON_ZERO_CONTENT_SHA256 =
    '93a7ca8acb02cef615d18072de9f555db2abdadaa67fe90993867d2aed648b85';
export const LESSON_ZERO_CLASSROOM_EXPRESSIONS_SHA256 =
    'a809477602243d8b4833a5534e1315fafb8c5fc4f9ebc770569e413e509f90ff';

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
        ...soundRuntimeRecords(data),
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
    const sound = data.lesson.activities.find(activity =>
        activity.id === 'activity:lesson-zero-sound-input');
    const nameCard = data.lesson.activities.find(activity =>
        activity.id === 'activity:lesson-zero-name-card-draft');
    const soundPrerequisite = sound && nameCard ? [record(
        'prerequisite-resolution:lesson-zero:sound-input',
        'prerequisite-resolution',
        LESSON_CONTENT_ID,
        'lesson.activities[id=activity:lesson-zero-sound-input]',
        {
            activityId: sound.id,
            prerequisiteActivityId: nameCard.id,
            conceptIds: nameCard.conceptIds,
            rationale: 'The name-card example establishes that a name sits immediately before です.',
        },
        data.lesson.contentVersion,
        LESSON_ZERO_CONTENT_SHA256,
    )] : [];
    return [...concepts, ...outcomes, ...prerequisites, ...soundPrerequisite];
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

function soundRuntimeRecords(data: LessonZeroPackageData): GroundedDefinitionRecord[] {
    const activity = data.lesson.activities.find(candidate =>
        candidate.id === 'activity:lesson-zero-sound-input');
    const script = data.lesson.inputScripts.find(candidate =>
        candidate.id === 'input:lesson-zero-sound-hosts');
    if (!activity || !script || script.kind !== 'dialogue' || script.lines.length !== 2) {
        throw new TypeError('Lesson Zero sound grounding needs its two-line canonical input.');
    }
    const revision = data.lesson.contentVersion;
    const acceptedAnswers = script.lines.map(line => `${line.id}=>${line.speakerId}`);
    const answerBearing = {
        translations: script.lines.map(line => line.english),
        transcripts: unique(script.lines.flatMap(line => [line.japanese, line.reading])),
        modelAnswers: acceptedAnswers,
        acceptedAnswers,
    };
    const binding = lessonZeroSoundAuditBinding(revision);
    const audit: GroundedAnswerConcealmentAuditArtifact = {
        schemaVersion: 1,
        kind: 'grounded-answer-concealment-dom-audit',
        auditRevision: 'academy-pre-commit-dom.v1',
        binding: {
            lessonId: data.lesson.id,
            subjectId: activity.id,
            surfaceId: binding.surfaceId,
            rendererId: binding.renderer.id,
            rendererRevision: binding.renderer.revision,
            rendererSha256: binding.renderer.sha256,
            contentRevision: revision,
        },
        phase: 'pre-commit',
        snapshot: soundPreCommitSnapshot(revision),
        forbiddenValues: answerBearing,
        findings: [],
        result: 'pass',
    };
    const records: GroundedDefinitionRecord[] = [
        record(
            'explanation:lesson-zero:sound-listening-gist', 'explanation', LESSON_CONTENT_ID,
            'lesson.activities[id=activity:lesson-zero-sound-input].prompt',
            {
                conceptId: 'concept:introduction-listening-gist',
                instruction: 'Play each voice once. You only need to catch the name, not every word.',
            }, revision, LESSON_ZERO_CONTENT_SHA256,
        ),
        record(
            'worked-example:lesson-zero:sound-listening-gist', 'worked-example', LESSON_CONTENT_ID,
            'lesson.activities[id=activity:lesson-zero-name-card-draft]',
            {
                conceptId: 'concept:introduction-listening-gist',
                priorActivityId: 'activity:lesson-zero-name-card-draft',
                spokenExample: 'りえです。',
                nameHeard: 'りえ',
            }, revision, LESSON_ZERO_CONTENT_SHA256,
        ),
        record(
            'explanation:lesson-zero:sound-listening-detail', 'explanation', LESSON_CONTENT_ID,
            'lesson.activities[id=activity:lesson-zero-sound-input].prompt',
            {
                conceptId: 'concept:introduction-listening-detail',
                instruction: 'Use です as the sound landmark. The name comes immediately before it.',
            }, revision, LESSON_ZERO_CONTENT_SHA256,
        ),
        record(
            'worked-example:lesson-zero:sound-listening-detail', 'worked-example', LESSON_CONTENT_ID,
            'lesson.activities[id=activity:lesson-zero-name-card-draft]',
            {
                conceptId: 'concept:introduction-listening-detail',
                priorActivityId: 'activity:lesson-zero-name-card-draft',
                spokenExample: 'りえです。',
                landmark: 'りえ | です',
            }, revision, LESSON_ZERO_CONTENT_SHA256,
        ),
        record(
            'grader:lesson-zero:audio-speaker-match', 'deterministic-grader', LESSON_CONTENT_ID,
            'lesson.activities[id=activity:lesson-zero-sound-input].expectedEvidence',
            {
                responseKind: 'audio-speaker-match',
                heardBeforeSelection: true,
                completionRequiresEveryLine: true,
                acceptedAnswers,
            }, revision, LESSON_ZERO_CONTENT_SHA256,
        ),
        record(
            'answer-set:lesson-zero:sound-input', 'answer-set', LESSON_CONTENT_ID,
            'lesson.inputScripts[id=input:lesson-zero-sound-hosts].lines',
            { acceptedAnswers, modelAnswers: acceptedAnswers }, revision, LESSON_ZERO_CONTENT_SHA256,
        ),
        record(
            'answer-bearing-content:lesson-zero:sound-input', 'answer-bearing-content', LESSON_CONTENT_ID,
            'lesson.inputScripts[id=input:lesson-zero-sound-hosts].lines',
            answerBearing, revision, LESSON_ZERO_CONTENT_SHA256,
        ),
        record(
            'surface-audit:lesson-zero:sound-input', 'surface-audit', LESSON_CONTENT_ID,
            'lesson-zero-sound-screen.preCommitSurface', audit, revision, LESSON_ZERO_CONTENT_SHA256,
        ),
        {
            ref: lessonZeroSoundRendererRef(),
            kind: 'surface-renderer',
            source: {
                contentId: 'renderer:lesson-zero-sound-screen',
                locator: 'createLessonZeroSoundScreen.renderAttempt',
            },
            value: { surfaceId: LESSON_ZERO_SOUND_SURFACE_ID },
        },
    ];
    for (const line of script.lines) {
        const suffix = line.speakerId;
        records.push(
            record(`error:listening:speaker:${suffix}`, 'error-tag', LESSON_CONTENT_ID,
                `lesson.inputScripts[id=${script.id}].lines[id=${line.id}].speakerId`,
                `listening:speaker:${suffix}`, revision, LESSON_ZERO_CONTENT_SHA256),
            record(`feedback:lesson-zero:sound-${suffix}`, 'feedback', LESSON_CONTENT_ID,
                `lesson.inputScripts[id=${script.id}].lines[id=${line.id}]`, {
                    explanation: 'Listen again for the name immediately before です.',
                    retryPrompt: 'Replay only this voice, then match both voices again.',
                }, revision, LESSON_ZERO_CONTENT_SHA256),
            record(`nearby-example:lesson-zero:sound-${suffix}`, 'nearby-example', LESSON_CONTENT_ID,
                'lesson.activities[id=activity:lesson-zero-name-card-draft]', {
                    japanese: 'りえです。',
                    landmark: 'りえ | です',
                }, revision, LESSON_ZERO_CONTENT_SHA256),
        );
    }
    records.push(
        record('review:lesson-zero:sound:hajimemashite', 'review-seed', LESSON_CONTENT_ID,
            'lesson.inputScripts[id=input:lesson-zero-sound-hosts].lines[id=line:lesson-zero-sound-xingyu]', {
                conceptId: 'concept:introduction-listening-gist',
                expressionKey: 'はじめまして',
                readingKey: 'はじめまして',
            }, revision, LESSON_ZERO_CONTENT_SHA256),
        record('review:lesson-zero:sound:yoroshiku', 'review-seed', LESSON_CONTENT_ID,
            'lesson.inputScripts[id=input:lesson-zero-sound-hosts].lines[id=line:lesson-zero-sound-mika]', {
                conceptId: 'concept:introduction-listening-detail',
                expressionKey: 'よろしくお願いします',
                readingKey: 'よろしくおねがいします',
            }, revision, LESSON_ZERO_CONTENT_SHA256),
    );
    return records;
}

function soundPreCommitSnapshot(contentRevision: string): string {
    const renderer = lessonZeroSoundRendererRef();
    return `<section class="academy-sound-paper academy-sound-mission" data-grounded-lesson-id="lesson:foundation-00" data-grounded-subject-id="activity:lesson-zero-sound-input" data-grounded-surface-id="${LESSON_ZERO_SOUND_SURFACE_ID}" data-grounded-renderer-id="${renderer.id}" data-grounded-renderer-revision="${renderer.revision}" data-grounded-renderer-sha256="${renderer.sha256}" data-grounded-content-revision="${contentRevision}" data-grounded-commit-state="pre-commit"><p>Play each voice to the end. Listen for the name immediately before です.</p><p>No reading needed yet.</p><button aria-label="Listen: Voice 1">Listen</button><button type="button">Xingyu シンユ</button><button type="button">Mika ミカ</button><button aria-label="Listen: Voice 2">Listen</button><button type="button">Xingyu シンユ</button><button type="button">Mika ミカ</button><button disabled>Check both voices</button></section>`;
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

function unique<T>(values: readonly T[]): T[] {
    return [...new Set(values)];
}
