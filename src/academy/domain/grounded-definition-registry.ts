import type {
    GroundedDefinitionRef,
    GroundedLessonContract,
    GroundingProofSet,
} from './grounded-lesson';
import { assertGroundedAnswerConcealmentAudit } from './grounded-answer-concealment-audit';

export type GroundedDefinitionKind =
    | 'concept'
    | 'outcome'
    | 'prerequisite-resolution'
    | 'explanation'
    | 'worked-example'
    | 'surface-audit'
    | 'surface-renderer'
    | 'answer-bearing-content'
    | 'deterministic-grader'
    | 'rubric-grader'
    | 'answer-set'
    | 'rubric'
    | 'error-tag'
    | 'feedback'
    | 'nearby-example'
    | 'review-seed';

export interface GroundedDefinitionRecord {
    readonly ref: GroundedDefinitionRef;
    readonly kind: GroundedDefinitionKind;
    readonly source: Readonly<{
        contentId: string;
        locator: string;
    }>;
    readonly value: unknown;
}

export interface GroundedDefinitionRegistry {
    readonly size: number;
    ref(id: string, kind: GroundedDefinitionKind): GroundedDefinitionRef;
    resolve(ref: GroundedDefinitionRef, kind: GroundedDefinitionKind): GroundedDefinitionRecord;
    resolveId(id: string, kind: GroundedDefinitionKind): GroundedDefinitionRecord;
}

/**
 * Exact registry matching turns SHA-shaped evidence into a resolvable content pointer.
 * The build separately verifies each source digest against its canonical content file.
 */
export function createGroundedDefinitionRegistry(
    definitions: readonly GroundedDefinitionRecord[],
): GroundedDefinitionRegistry {
    const byId = new Map<string, GroundedDefinitionRecord>();
    for (const definition of definitions) {
        validateRecord(definition);
        if (byId.has(definition.ref.id)) throw new TypeError(`Duplicate grounded definition ${definition.ref.id}.`);
        byId.set(definition.ref.id, structuredClone(definition));
    }
    return Object.freeze({
        size: byId.size,
        ref(id: string, kind: GroundedDefinitionKind): GroundedDefinitionRef {
            return structuredClone(resolveId(byId, id, kind).ref);
        },
        resolve(ref: GroundedDefinitionRef, kind: GroundedDefinitionKind): GroundedDefinitionRecord {
            const definition = resolveId(byId, ref.id, kind);
            if (definition.ref.registry !== ref.registry
                || definition.ref.revision !== ref.revision
                || definition.ref.sha256 !== ref.sha256) {
                throw new TypeError(`Grounded definition ${ref.id} does not match its registered revision and digest.`);
            }
            return structuredClone(definition);
        },
        resolveId(id: string, kind: GroundedDefinitionKind): GroundedDefinitionRecord {
            return structuredClone(resolveId(byId, id, kind));
        },
    });
}

/** Verify every ready proof against the registry, including non-ref repair and review ids. */
export function assertGroundedLessonDefinitionsResolve(
    lesson: GroundedLessonContract,
    registry: GroundedDefinitionRegistry,
): void {
    assertProofSet(lesson.overview.proofs, registry, 'overview', {
        lessonId: lesson.lessonId,
        contentRevision: lesson.contentRevision,
        subjectId: lesson.lessonId,
    });
    for (const activity of lesson.activities) {
        assertProofSet(activity.proofs, registry, `activity ${activity.id}`, {
            lessonId: lesson.lessonId,
            contentRevision: lesson.contentRevision,
            subjectId: activity.id,
        });
    }
}

function assertProofSet(
    proofs: GroundingProofSet,
    registry: GroundedDefinitionRegistry,
    label: string,
    context: Readonly<{ lessonId: string; contentRevision: string; subjectId: string }>,
): void {
    assertCurriculumProof(proofs, registry);
    assertInstructionProof(proofs, registry);
    const registeredAnswers = resolveAssessmentDefinitions(proofs, registry);
    assertAnswerConcealmentProof(proofs, registry, label, context, registeredAnswers);
    assertRepairProof(proofs, registry);
    assertLearnerEvidenceProof(proofs, registry, label);
}

function assertCurriculumProof(
    proofs: GroundingProofSet,
    registry: GroundedDefinitionRegistry,
): void {
    if (proofs.curriculum.state === 'ready') {
        for (const conceptId of proofs.curriculum.evidence.conceptIds) registry.resolveId(conceptId, 'concept');
        for (const outcomeId of proofs.curriculum.evidence.outcomeIds) registry.resolveId(outcomeId, 'outcome');
        assertPrerequisiteProof(proofs.curriculum.evidence.prerequisites, registry);
    }
}

function assertPrerequisiteProof(
    prerequisites: Extract<GroundingProofSet['curriculum'], { state: 'ready' }>['evidence']['prerequisites'],
    registry: GroundedDefinitionRegistry,
): void {
    if (prerequisites.kind !== 'resolved') return;
    for (const conceptId of prerequisites.conceptIds) registry.resolveId(conceptId, 'concept');
    registry.resolve(prerequisites.resolution, 'prerequisite-resolution');
}

function assertInstructionProof(
    proofs: GroundingProofSet,
    registry: GroundedDefinitionRegistry,
): void {
    if (proofs.instruction.state === 'ready') {
        for (const coverage of proofs.instruction.evidence.conceptCoverage) {
            coverage.explanationRefs.forEach(ref => registry.resolve(ref, 'explanation'));
            coverage.workedExampleRefs.forEach(ref => registry.resolve(ref, 'worked-example'));
        }
    }
}

function assertAnswerConcealmentProof(
    proofs: GroundingProofSet,
    registry: GroundedDefinitionRegistry,
    label: string,
    context: Readonly<{ lessonId: string; contentRevision: string; subjectId: string }>,
    registeredAnswers: Readonly<{ acceptedAnswers: readonly string[]; modelAnswers: readonly string[] }> | undefined,
): void {
    if (proofs.answerConcealment.state !== 'ready') return;
    const claim = proofs.answerConcealment.evidence;
    const audit = registry.resolve(claim.surfaceAudit, 'surface-audit');
    const renderer = registry.resolve(claim.auditBinding.renderer, 'surface-renderer');
    const answerBearingContent = registry.resolve(claim.answerBearingContent, 'answer-bearing-content');
    assertAnswerConcealmentRevisions(label, claim, context.contentRevision);
    const answers = requireRegisteredAnswers(label, registeredAnswers);
    assertRendererOwnsSurface(label, renderer.value, claim.auditBinding.surfaceId);
    assertGroundedAnswerConcealmentAudit(audit.value, {
        lessonId: context.lessonId,
        subjectId: context.subjectId,
        binding: claim.auditBinding,
        forbiddenValues: answerBearingValues(answerBearingContent.value),
    }, answers);
}

function assertAnswerConcealmentRevisions(
    label: string,
    claim: Extract<GroundingProofSet['answerConcealment'], { state: 'ready' }>['evidence'],
    contentRevision: string,
): void {
    if (claim.auditBinding.contentRevision !== contentRevision) {
        throw new TypeError(`${label} surface audit is stale for the current lesson content or renderer revision.`);
    }
    if (claim.answerBearingContent.revision !== contentRevision) {
        throw new TypeError(`${label} answer-bearing content is stale for the current lesson revision.`);
    }
}

function requireRegisteredAnswers(
    label: string,
    registeredAnswers: Readonly<{ acceptedAnswers: readonly string[]; modelAnswers: readonly string[] }> | undefined,
): Readonly<{ acceptedAnswers: readonly string[]; modelAnswers: readonly string[] }> {
    if (!registeredAnswers) {
        throw new TypeError(`${label} cannot prove answer concealment before its assessment definitions resolve.`);
    }
    return registeredAnswers;
}

function assertRendererOwnsSurface(label: string, value: unknown, surfaceId: string): void {
    const renderer = value as Readonly<Record<string, unknown>>;
    if (!renderer || typeof renderer !== 'object' || renderer.surfaceId !== surfaceId) {
        throw new TypeError(`${label} surface renderer definition does not own the audited surface.`);
    }
}

function assertRepairProof(
    proofs: GroundingProofSet,
    registry: GroundedDefinitionRegistry,
): void {
    if (proofs.repair.state === 'ready') {
        proofs.repair.evidence.errorTagIds.forEach(id => registry.resolveId(id, 'error-tag'));
        proofs.repair.evidence.feedbackIds.forEach(id => registry.resolveId(id, 'feedback'));
        proofs.repair.evidence.nearbyExampleIds.forEach(id => registry.resolveId(id, 'nearby-example'));
    }
}

function assertLearnerEvidenceProof(
    proofs: GroundingProofSet,
    registry: GroundedDefinitionRegistry,
    label: string,
): void {
    if (proofs.learnerEvidence.state === 'ready') {
        for (const item of proofs.learnerEvidence.evidence.reviewItems) {
            const seed = registry.resolveId(item.seedId, 'review-seed');
            const value = seed.value as Readonly<Record<string, unknown>>;
            if (!reviewSeedMatches(value, item)) {
                throw new TypeError(`${label} review seed ${item.seedId} does not match its canonical Yomu key.`);
            }
        }
    }
}

function reviewSeedMatches(
    value: Readonly<Record<string, unknown>>,
    item: Extract<GroundingProofSet['learnerEvidence'], { state: 'ready' }>['evidence']['reviewItems'][number],
): boolean {
    return value.conceptId === item.conceptId
        && value.expressionKey === item.expressionKey
        && value.readingKey === item.readingKey;
}

function resolveAssessmentDefinitions(
    proofs: GroundingProofSet,
    registry: GroundedDefinitionRegistry,
): Readonly<{ acceptedAnswers: readonly string[]; modelAnswers: readonly string[] }> | undefined {
    if (proofs.assessment.state !== 'ready') return undefined;
    const assessment = proofs.assessment.evidence;
    registry.resolve(assessment.grader, assessment.method === 'deterministic'
        ? 'deterministic-grader'
        : 'rubric-grader');
    const definitions = assessment.method === 'deterministic'
        ? assessment.answerSets.map(ref => registry.resolve(ref, 'answer-set'))
        : assessment.rubrics.map(ref => registry.resolve(ref, 'rubric'));
    const acceptedAnswers = uniqueText(definitions.flatMap(definition =>
        namedTextValues(definition.value, ['acceptedAnswer', 'acceptedAnswers'])));
    const modelAnswers = uniqueText(definitions.flatMap(definition =>
        namedTextValues(definition.value, ['modelAnswer', 'modelAnswers'])));
    if (assessment.method === 'deterministic' && !acceptedAnswers.length) {
        throw new TypeError('Deterministic answer definitions expose no auditable accepted answers.');
    }
    return { acceptedAnswers, modelAnswers };
}

function namedTextValues(value: unknown, names: readonly string[]): string[] {
    if (Array.isArray(value)) return value.flatMap(item => namedTextValues(item, names));
    if (!value || typeof value !== 'object') return [];
    return Object.entries(value).flatMap(([key, child]) => names.includes(key)
        ? allTextValues(child)
        : namedTextValues(child, names));
}

function allTextValues(value: unknown): string[] {
    if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
    if (Array.isArray(value)) return value.flatMap(allTextValues);
    if (!value || typeof value !== 'object') return [];
    return Object.values(value).flatMap(allTextValues);
}

function uniqueText(values: readonly string[]): string[] {
    return [...new Set(values)].sort();
}

function answerBearingValues(value: unknown): Readonly<{
    translations: readonly string[];
    transcripts: readonly string[];
    modelAnswers: readonly string[];
    acceptedAnswers: readonly string[];
}> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('Answer-bearing content must be a content-derived corpus.');
    }
    const record = value as Readonly<Record<string, unknown>>;
    return {
        translations: textArray(record.translations, 'translations'),
        transcripts: textArray(record.transcripts, 'transcripts'),
        modelAnswers: textArray(record.modelAnswers, 'modelAnswers'),
        acceptedAnswers: textArray(record.acceptedAnswers, 'acceptedAnswers'),
    };
}

function textArray(value: unknown, label: string): string[] {
    if (!Array.isArray(value)) throw new TypeError(`Answer-bearing content needs ${label}.`);
    return uniqueText(value.map(item => {
        if (typeof item !== 'string' || !item.trim()) {
            throw new TypeError(`Answer-bearing content ${label} must contain text.`);
        }
        return item.trim();
    }));
}

function resolveId(
    byId: ReadonlyMap<string, GroundedDefinitionRecord>,
    id: string,
    kind: GroundedDefinitionKind,
): GroundedDefinitionRecord {
    const definition = byId.get(id);
    if (!definition) throw new TypeError(`Dangling grounded definition ${id}.`);
    if (definition.kind !== kind) {
        throw new TypeError(`Grounded definition ${id} is ${definition.kind}, not ${kind}.`);
    }
    return definition;
}

function validateRecord(definition: GroundedDefinitionRecord): void {
    if (!definition || typeof definition !== 'object') throw new TypeError('Grounded definition must be an object.');
    validateDefinitionId(definition);
    validateDefinitionRegistry(definition);
    validateDefinitionRevision(definition);
    validateDefinitionDigest(definition);
    validateDefinitionSource(definition);
}

function validateDefinitionId(definition: GroundedDefinitionRecord): void {
    if (!/^[a-z][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*)+$/u.test(definition.ref.id)) {
        throw new TypeError('Grounded definition needs a stable namespaced id.');
    }
}

function validateDefinitionRegistry(definition: GroundedDefinitionRecord): void {
    if (definition.ref.registry !== 'academy-content' && definition.ref.registry !== 'activity-plugin') {
        throw new TypeError(`Grounded definition ${definition.ref.id} has an invalid registry.`);
    }
}

function validateDefinitionRevision(definition: GroundedDefinitionRecord): void {
    if (!definition.ref.revision.trim()) throw new TypeError(`Grounded definition ${definition.ref.id} needs a revision.`);
}

function validateDefinitionDigest(definition: GroundedDefinitionRecord): void {
    if (!/^[a-f0-9]{64}$/u.test(definition.ref.sha256)) {
        throw new TypeError(`Grounded definition ${definition.ref.id} needs a SHA-256.`);
    }
}

function validateDefinitionSource(definition: GroundedDefinitionRecord): void {
    if (!definition.source.contentId.trim() || !definition.source.locator.trim()) {
        throw new TypeError(`Grounded definition ${definition.ref.id} needs a source locator.`);
    }
}
