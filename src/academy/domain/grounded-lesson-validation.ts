import type {
    GroundedAccessibilityEvidence, GroundedActivityContract, GroundedAnswerConcealmentEvidence,
    GroundedAssessmentEvidence, GroundedCurriculumEvidence, GroundedDefinitionRef,
    GroundedEvidenceModality, GroundedInputEvidence, GroundedInstructionEvidence,
    GroundedLearnerEvidence, GroundedLessonContract, GroundedMediaEvidence,
    GroundedProductionSequenceEvidence, GroundedRepairEvidence, GroundingProof,
    GroundingProofSet, GroundingStatus,
} from './grounded-lesson';
import {
    canonicalGroundedConceptReviewKey,
    canonicalGroundedReviewKey,
} from './review-identity';

const MODALITIES: readonly GroundedEvidenceModality[] = [
    'selection', 'constructed-text', 'handwriting', 'speech', 'listening', 'physical-action'];

/** Validate learning substance only. Story, art, rewards, and layout cannot satisfy this interface. */
export function validateGroundedLesson(value: unknown): GroundedLessonContract {
    const lesson = object(value, 'grounded lesson') as unknown as GroundedLessonContract;
    if (lesson.schemaVersion !== 1) fail('Grounded lesson must use schemaVersion 1.');
    id(lesson.lessonId, 'lessonId');
    text(lesson.contentRevision, 'contentRevision');
    const overview = object(lesson.overview, 'overview') as unknown as GroundedLessonContract['overview'];
    const allBlockers = validateProofSet(overview.proofs, 'overview', true);
    const activities = list<GroundedActivityContract>(lesson.activities, 'activities');
    if (!activities.length) fail('A grounded lesson needs activities.');
    const activityIds = new Set<string>();
    activities.forEach((activity, index) => {
        id(activity.id, `activities.${index}.id`);
        if (activityIds.has(activity.id)) fail(`Duplicate grounded activity ${activity.id}.`);
        activityIds.add(activity.id);
        if (activity.order !== index + 1) fail(`Grounded activity ${activity.id} has the wrong order.`);
        if (!['guided', 'independent', 'transfer'].includes(activity.phase)) fail(`${activity.id} has an invalid phase.`);
        if (typeof activity.production !== 'boolean') fail(`${activity.id} must declare production.`);
        const blockers = validateProofSet(activity.proofs, `activity ${activity.id}`, index === 0);
        validateNodeStatus(activity.status, activity.blockerIds, blockers, `activity ${activity.id}`);
        allBlockers.push(...blockers);
    });
    validateLessonReviewIdentities(activities);
    validateProof(
        overview.productionSequence,
        'overview.productionSequence',
        (sequence, label) => validateProductionSequence(sequence, activities, label),
        allBlockers,
    );
    validateNodeStatus(lesson.status, lesson.blockerIds, allBlockers, `lesson ${lesson.lessonId}`);
    return structuredClone(lesson);
}

function validateProofSet(proofs: GroundingProofSet, label: string, entryAllowed: boolean): string[] {
    const value = object(proofs, `${label}.proofs`) as unknown as GroundingProofSet;
    const blockers: string[] = [];
    validateProof(value.input, `${label}.input`, validateInput, blockers);
    const curriculum = validateProof(value.curriculum, `${label}.curriculum`, validateCurriculum, blockers);
    const instruction = validateProof(value.instruction, `${label}.instruction`, validateInstruction, blockers);
    validateProof(value.answerConcealment, `${label}.answerConcealment`, validateAnswerConcealment, blockers);
    validateProof(value.media, `${label}.media`, validateMedia, blockers);
    validateProof(value.assessment, `${label}.assessment`, validateAssessment, blockers);
    validateProof(value.repair, `${label}.repair`, validateRepair, blockers);
    const learnerEvidence = validateProof(
        value.learnerEvidence,
        `${label}.learnerEvidence`,
        validateLearnerEvidence,
        blockers,
    );
    validateProof(value.accessibility, `${label}.accessibility`, validateAccessibility, blockers);
    if (curriculum?.prerequisites.kind === 'entry' && !entryAllowed) {
        fail(`${label} is not an entry activity and needs resolved prerequisites or a blocker.`);
    }
    if (curriculum && instruction) validateInstructionCoverage(curriculum, instruction, label);
    if (curriculum && learnerEvidence) validateReviewConceptCoverage(curriculum, learnerEvidence, label);
    return blockers;
}

function validateReviewConceptCoverage(
    curriculum: GroundedCurriculumEvidence,
    learnerEvidence: GroundedLearnerEvidence,
    label: string,
): void {
    const concepts = new Set(curriculum.conceptIds);
    for (const item of learnerEvidence.reviewItems) {
        if (!concepts.has(item.conceptId)) {
            fail(`${label} review item ${item.seedId} is outside the assessed concepts.`);
        }
    }
}

function validateProof<T>(proof: GroundingProof<T>, label: string,
    validate: (evidence: T, label: string) => void, blockers: string[]): T | undefined {
    const value = object(proof, `${label} proof`) as unknown as GroundingProof<T>;
    if (value.state === 'ready') {
        const evidence = object(value.evidence, `${label}.evidence`) as T;
        validate(evidence, label);
        return evidence;
    }
    if (value.state === 'review-blocked') {
        blockers.push(...ids(value.blockerIds, `${label}.blockerIds`));
        return undefined;
    }
    fail(`${label} must be ready or review-blocked.`);
}

function validateInput(value: GroundedInputEvidence, label: string): void {
    if (value.kind === 'source') {
        ids(value.sourceQuestionIds, `${label}.sourceQuestionIds`);
        validateDocuments(value.documents, label);
        return;
    }
    if (value.kind !== 'authored') fail(`${label} must use source or authored input.`);
    ids(value.authoredInputIds, `${label}.authoredInputIds`);
    text(value.revision, `${label}.revision`);
    id(value.authorId, `${label}.authorId`);
    text(value.rationale, `${label}.rationale`);
    const review = object(value.languageReview, `${label}.languageReview`) as unknown as NonNullable<typeof value.languageReview>;
    id(review.reviewerId, `${label}.languageReview.reviewerId`);
    text(review.revision, `${label}.languageReview.revision`);
    if (review.register !== 'reviewed' || review.naturalness !== 'reviewed') {
        fail(`${label} needs reviewed register and naturalness.`);
    }
}
function validateDocuments(value: unknown, label: string): void {
    const documents = list<unknown>(value, `${label}.documents`);
    if (!documents.length) fail(`${label} needs a source document.`);
    for (const document of documents) {
        const item = object(document, `${label}.document`) as unknown as GroundedDefinitionRef;
        id(item.id, `${label}.document.id`);
        sha(item.sha256, `${label}.document.sha256`);
        text((item as unknown as { extractionRevision: string }).extractionRevision, `${label}.document.extractionRevision`);
    }
}
function validateCurriculum(value: GroundedCurriculumEvidence, label: string): void {
    ids(value.conceptIds, `${label}.conceptIds`);
    ids(value.outcomeIds, `${label}.outcomeIds`);
    const prerequisites = object(value.prerequisites, `${label}.prerequisites`) as unknown as GroundedCurriculumEvidence['prerequisites'];
    if (prerequisites.kind === 'entry') text(prerequisites.reason, `${label}.prerequisites.reason`);
    else if (prerequisites.kind === 'resolved') {
        ids(prerequisites.conceptIds, `${label}.prerequisites.conceptIds`);
        validateDefinitionRef(prerequisites.resolution, `${label}.prerequisites.resolution`);
    } else fail(`${label} needs entry or resolved prerequisites.`);
}
function validateInstruction(value: GroundedInstructionEvidence, label: string): void {
    if (value.sequence !== 'before-assessment') fail(`${label} must teach before assessed practice.`);
    const coverage = list<GroundedInstructionEvidence['conceptCoverage'][number]>(
        value.conceptCoverage, `${label}.conceptCoverage`,
    );
    if (!coverage.length) fail(`${label}.conceptCoverage must not be empty.`);
    const concepts = new Set<string>();
    for (const item of coverage) {
        const conceptId = id(item.conceptId, `${label}.conceptCoverage.conceptId`);
        if (concepts.has(conceptId)) fail(`${label} repeats instruction for ${conceptId}.`);
        concepts.add(conceptId);
        validateDefinitionRefs(item.explanationRefs, `${label}.${conceptId}.explanationRefs`);
        validateDefinitionRefs(item.workedExampleRefs, `${label}.${conceptId}.workedExampleRefs`);
    }
}
function validateInstructionCoverage(
    curriculum: GroundedCurriculumEvidence, instruction: GroundedInstructionEvidence, label: string,
): void {
    const taught = instruction.conceptCoverage.map(item => item.conceptId).sort();
    if (JSON.stringify(taught) !== JSON.stringify([...curriculum.conceptIds].sort())) {
        fail(`${label} instruction does not cover every assessed concept.`);
    }
}
function validateAnswerConcealment(value: GroundedAnswerConcealmentEvidence, label: string): void {
    validateDefinitionRef(value.surfaceAudit, `${label}.surfaceAudit`);
    const preCommit = object(value.learnerFacingPreCommit, `${label}.learnerFacingPreCommit`) as unknown as GroundedAnswerConcealmentEvidence['learnerFacingPreCommit'];
    for (const key of ['translations', 'transcripts', 'modelAnswers', 'acceptedAnswers'] as const) {
        if (preCommit[key] !== 'absent') fail(`${label}.${key} must be absent before commitment.`);
    }
    if (!['after-commit', 'after-first-attempt'].includes(value.revealPolicy)) fail(`${label} has an unsafe reveal policy.`);
}
function validateMedia(value: GroundedMediaEvidence, label: string): void {
    if (value.state === 'not-required') text(value.reason, `${label}.reason`);
    else if (value.state === 'ready') {
        if (!['source', 'authored'].includes(value.provenance)) fail(`${label} has invalid media provenance.`);
        ids(value.assetIds, `${label}.assetIds`);
        text(value.revision, `${label}.revision`);
        if (!['ready', 'not-applicable'].includes(value.transcript)) fail(`${label} needs a transcript status.`);
    } else fail(`${label} needs an explicit media status.`);
}
function validateAssessment(value: GroundedAssessmentEvidence, label: string): void {
    validateDefinitionRef(value.grader, `${label}.grader`);
    if (value.method === 'deterministic') validateDefinitionRefs(value.answerSets, `${label}.answerSets`);
    else if (value.method === 'rubric') validateDefinitionRefs(value.rubrics, `${label}.rubrics`);
    else fail(`${label} needs deterministic grading or a rubric.`);
}
function validateRepair(value: GroundedRepairEvidence, label: string): void {
    ids(value.errorTagIds, `${label}.errorTagIds`);
    ids(value.feedbackIds, `${label}.feedbackIds`);
    ids(value.nearbyExampleIds, `${label}.nearbyExampleIds`);
    if (!['same-activity', 'smaller-step'].includes(value.retry)) fail(`${label} needs a retry path.`);
}
function validateLearnerEvidence(value: GroundedLearnerEvidence, label: string): void {
    if (value.attemptEventKind !== 'attempt-recorded') fail(`${label} must emit an attempt event.`);
    if (value.reviewRepository !== 'canonical-yomu') fail(`${label} must use canonical Yomu review.`);
    const items = list<GroundedLearnerEvidence['reviewItems'][number]>(value.reviewItems, `${label}.reviewItems`);
    if (!items.length) fail(`${label}.reviewItems must not be empty.`);
    const keys = new Set<string>();
    for (const item of items) {
        id(item.seedId, `${label}.reviewItem.seedId`);
        id(item.conceptId, `${label}.reviewItem.conceptId`);
        const expression = text(item.expressionKey, `${label}.expressionKey`);
        const reading = text(item.readingKey, `${label}.readingKey`);
        if (/^[a-z][a-z0-9-]*:/u.test(expression) || /^[a-z][a-z0-9-]*:/u.test(reading)) {
            fail(`${label} needs canonical expression and reading keys, not opaque ids.`);
        }
        const key = canonicalGroundedReviewKey(expression, reading);
        if (keys.has(key)) fail(`${label} repeats a canonical review key.`);
        keys.add(key);
    }
}

function validateLessonReviewIdentities(activities: readonly GroundedActivityContract[]): void {
    const conceptsByCard = new Map<string, string>();
    for (const activity of activities) {
        const proof = activity.proofs.learnerEvidence;
        if (proof.state !== 'ready') continue;
        for (const item of proof.evidence.reviewItems) {
            const cardKey = canonicalGroundedReviewKey(item.expressionKey, item.readingKey);
            const conceptKey = canonicalGroundedConceptReviewKey(
                item.expressionKey,
                item.readingKey,
                item.conceptId,
            );
            const previousConcept = conceptsByCard.get(cardKey);
            if (previousConcept && previousConcept !== conceptKey) {
                fail(`Canonical review card ${cardKey} is assigned to more than one concept.`);
            }
            conceptsByCard.set(cardKey, conceptKey);
        }
    }
}
function validateAccessibility(value: GroundedAccessibilityEvidence, label: string): void {
    for (const key of ['keyboardNavigation', 'touchNavigation', 'screenReader', 'reducedMotion'] as const) {
        if (value[key] !== 'equivalent') fail(`${label}.${key} needs equivalent access.`);
    }
    if (!['not-required', 'transcript', 'captions'].includes(value.mediaAlternative)) fail(`${label} needs a media alternative.`);
    if (!MODALITIES.includes(value.primaryEvidenceModality)) fail(`${label} needs a primary evidence modality.`);
    const alternative = object(value.inputAlternative, `${label}.inputAlternative`) as unknown as GroundedAccessibilityEvidence['inputAlternative'];
    if (alternative.kind === 'not-required') {
        text(alternative.reason, `${label}.inputAlternative.reason`);
        if (['handwriting', 'speech'].includes(value.primaryEvidenceModality)) {
            fail(`${label} needs a construct-preserving ${value.primaryEvidenceModality} alternative.`);
        }
    } else if (alternative.kind === 'construct-preserving') {
        if (!MODALITIES.includes(alternative.modality)) fail(`${label} has an invalid alternative modality.`);
        if (alternative.modality !== value.primaryEvidenceModality || alternative.preservesLearningConstruct !== true) {
            fail(`${label} input alternative must preserve the same learning construct.`);
        }
        text(alternative.rationale, `${label}.inputAlternative.rationale`);
    } else fail(`${label} needs an input alternative status.`);
}
function validateProductionSequence(
    sequence: GroundedProductionSequenceEvidence, activities: readonly GroundedActivityContract[], label: string,
): void {
    const byId = new Map(activities.map(activity => [activity.id, activity]));
    const assigned = new Set<string>();
    assignProduction(ids(sequence.guidedActivityIds, `${label}.guidedActivityIds`), 'guided', byId, assigned);
    assignProduction(ids(sequence.independentActivityIds, `${label}.independentActivityIds`), 'independent', byId, assigned);
    const transfers = list<GroundedProductionSequenceEvidence['changedContextTransfers'][number]>(
        sequence.changedContextTransfers, `${label}.changedContextTransfers`,
    );
    if (!transfers.length) fail(`${label}.changedContextTransfers must not be empty.`);
    for (const transfer of transfers) {
        const activityId = id(transfer.activityId, `${label}.transfer.activityId`);
        const from = id(transfer.fromContextId, `${label}.transfer.fromContextId`);
        const to = id(transfer.toContextId, `${label}.transfer.toContextId`);
        if (from === to) fail(`${activityId} must transfer into a changed context.`);
        assignProduction([activityId], 'transfer', byId, assigned);
    }
    const productionIds = activities.filter(activity => activity.production).map(activity => activity.id).sort();
    if (JSON.stringify([...assigned].sort()) !== JSON.stringify(productionIds)) {
        fail('Production sequence must cover every production activity exactly once.');
    }
}
function assignProduction(
    activityIds: readonly string[], phase: GroundedActivityContract['phase'],
    activities: ReadonlyMap<string, GroundedActivityContract>, assigned: Set<string>,
): void {
    for (const activityId of activityIds) {
        if (assigned.has(activityId)) fail(`${activityId} is assigned to production more than once.`);
        const activity = activities.get(activityId);
        if (!activity || !activity.production || activity.phase !== phase) fail(`${activityId} is not ${phase} production.`);
        assigned.add(activityId);
    }
}

function validateDefinitionRefs(value: unknown, label: string): void {
    const refs = list<GroundedDefinitionRef>(value, label);
    if (!refs.length) fail(`${label} must not be empty.`);
    refs.forEach((ref, index) => validateDefinitionRef(ref, `${label}.${index}`));
}

function validateDefinitionRef(value: unknown, label: string): void {
    const ref = object(value, label) as unknown as GroundedDefinitionRef;
    id(ref.id, `${label}.id`);
    if (!['academy-content', 'activity-plugin'].includes(ref.registry)) fail(`${label} needs a resolvable registry.`);
    text(ref.revision, `${label}.revision`);
    sha(ref.sha256, `${label}.sha256`);
}

function validateNodeStatus(status: GroundingStatus, declared: readonly string[], found: readonly string[], label: string): void {
    const expected = [...new Set(found)].sort();
    const actual = [...new Set(Array.isArray(declared) ? declared : [])].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} blockerIds do not match its proofs.`);
    if ((expected.length ? 'review-blocked' : 'playable') !== status) fail(`${label} has a dishonest status.`);
}

function ids(value: unknown, label: string): string[] {
    const values = list<string>(value, label).map((item, index) => id(item, `${label}.${index}`));
    if (!values.length) fail(`${label} must not be empty.`);
    if (new Set(values).size !== values.length) fail(`${label} contains duplicates.`);
    return values;
}

function list<T>(value: unknown, label: string): readonly T[] {
    if (!Array.isArray(value)) fail(`${label} must be an array.`);
    return value as readonly T[];
}

function object(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
    return value as Readonly<Record<string, unknown>>;
}

function id(value: unknown, label: string): string {
    const result = text(value, label);
    if (!/^[a-z][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*)+$/u.test(result)) fail(`${label} must be a stable namespaced id.`);
    return result;
}

function sha(value: unknown, label: string): string {
    const result = text(value, label);
    if (!/^[a-f0-9]{64}$/u.test(result)) fail(`${label} must be a SHA-256.`);
    return result;
}

function text(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) fail(`${label} must be non-empty.`);
    return value.trim();
}

function fail(message: string): never {
    throw new TypeError(message);
}
