import type {
    GroundedDefinitionRef,
    GroundedLessonContract,
    GroundingProofSet,
} from './grounded-lesson';

export type GroundedDefinitionKind =
    | 'concept'
    | 'outcome'
    | 'prerequisite-resolution'
    | 'explanation'
    | 'worked-example'
    | 'surface-audit'
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
    assertProofSet(lesson.overview.proofs, registry, 'overview');
    for (const activity of lesson.activities) {
        assertProofSet(activity.proofs, registry, `activity ${activity.id}`);
    }
}

function assertProofSet(
    proofs: GroundingProofSet,
    registry: GroundedDefinitionRegistry,
    label: string,
): void {
    if (proofs.curriculum.state === 'ready') {
        for (const conceptId of proofs.curriculum.evidence.conceptIds) registry.resolveId(conceptId, 'concept');
        for (const outcomeId of proofs.curriculum.evidence.outcomeIds) registry.resolveId(outcomeId, 'outcome');
        const prerequisites = proofs.curriculum.evidence.prerequisites;
        if (prerequisites.kind === 'resolved') {
            for (const conceptId of prerequisites.conceptIds) registry.resolveId(conceptId, 'concept');
            registry.resolve(prerequisites.resolution, 'prerequisite-resolution');
        }
    }
    if (proofs.instruction.state === 'ready') {
        for (const coverage of proofs.instruction.evidence.conceptCoverage) {
            coverage.explanationRefs.forEach(ref => registry.resolve(ref, 'explanation'));
            coverage.workedExampleRefs.forEach(ref => registry.resolve(ref, 'worked-example'));
        }
    }
    if (proofs.answerConcealment.state === 'ready') {
        const claim = proofs.answerConcealment.evidence;
        const audit = registry.resolve(claim.surfaceAudit, 'surface-audit');
        const value = audit.value as Readonly<Record<string, unknown>>;
        if (JSON.stringify(value.learnerFacingPreCommit) !== JSON.stringify(claim.learnerFacingPreCommit)
            || value.revealPolicy !== claim.revealPolicy) {
            throw new TypeError(`${label} surface audit does not match its answer-concealment claim.`);
        }
    }
    if (proofs.assessment.state === 'ready') {
        const assessment = proofs.assessment.evidence;
        registry.resolve(assessment.grader, assessment.method === 'deterministic'
            ? 'deterministic-grader'
            : 'rubric-grader');
        if (assessment.method === 'deterministic') {
            assessment.answerSets.forEach(ref => registry.resolve(ref, 'answer-set'));
        } else {
            assessment.rubrics.forEach(ref => registry.resolve(ref, 'rubric'));
        }
    }
    if (proofs.repair.state === 'ready') {
        proofs.repair.evidence.errorTagIds.forEach(id => registry.resolveId(id, 'error-tag'));
        proofs.repair.evidence.feedbackIds.forEach(id => registry.resolveId(id, 'feedback'));
        proofs.repair.evidence.nearbyExampleIds.forEach(id => registry.resolveId(id, 'nearby-example'));
    }
    if (proofs.learnerEvidence.state === 'ready') {
        for (const item of proofs.learnerEvidence.evidence.reviewItems) {
            const seed = registry.resolveId(item.seedId, 'review-seed');
            const value = seed.value as Readonly<Record<string, unknown>>;
            if (value.conceptId !== item.conceptId
                || value.expressionKey !== item.expressionKey
                || value.readingKey !== item.readingKey) {
                throw new TypeError(`${label} review seed ${item.seedId} does not match its canonical Yomu key.`);
            }
        }
    }
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
    if (!/^[a-z][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*)+$/u.test(definition.ref.id)) {
        throw new TypeError('Grounded definition needs a stable namespaced id.');
    }
    if (definition.ref.registry !== 'academy-content' && definition.ref.registry !== 'activity-plugin') {
        throw new TypeError(`Grounded definition ${definition.ref.id} has an invalid registry.`);
    }
    if (!definition.ref.revision.trim()) throw new TypeError(`Grounded definition ${definition.ref.id} needs a revision.`);
    if (!/^[a-f0-9]{64}$/u.test(definition.ref.sha256)) {
        throw new TypeError(`Grounded definition ${definition.ref.id} needs a SHA-256.`);
    }
    if (!definition.source.contentId.trim() || !definition.source.locator.trim()) {
        throw new TypeError(`Grounded definition ${definition.ref.id} needs a source locator.`);
    }
}
