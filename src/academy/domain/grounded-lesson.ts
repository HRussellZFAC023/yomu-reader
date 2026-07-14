export type GroundingStatus = 'playable' | 'review-blocked';
export type GroundingPhase = 'guided' | 'independent' | 'transfer';

export interface ReadyProof<T> { readonly state: 'ready'; readonly evidence: T }
export interface BlockedProof { readonly state: 'review-blocked'; readonly blockerIds: readonly string[] }
export type GroundingProof<T> = ReadyProof<T> | BlockedProof;

export interface GroundedDefinitionRef {
    readonly id: string;
    readonly registry: 'academy-content' | 'activity-plugin';
    readonly revision: string;
    readonly sha256: string;
}

export type GroundedInputEvidence =
    | Readonly<{
        kind: 'source';
        sourceQuestionIds: readonly string[];
        documents: readonly Readonly<{ id: string; sha256: string; extractionRevision: string }>[];
    }>
    | Readonly<{
        kind: 'authored';
        authoredInputIds: readonly string[];
        revision: string;
        authorId: string;
        rationale: string;
        languageReview: Readonly<{
            reviewerId: string;
            revision: string;
            register: 'reviewed';
            naturalness: 'reviewed';
        }>;
    }>;

export interface GroundedCurriculumEvidence {
    readonly conceptIds: readonly string[];
    readonly outcomeIds: readonly string[];
    readonly prerequisites:
        | Readonly<{ kind: 'entry'; reason: string }>
        | Readonly<{
            kind: 'resolved';
            conceptIds: readonly string[];
            resolution: GroundedDefinitionRef;
        }>;
}

export interface GroundedInstructionEvidence {
    readonly sequence: 'before-assessment';
    readonly conceptCoverage: readonly Readonly<{
        conceptId: string;
        explanationRefs: readonly GroundedDefinitionRef[];
        workedExampleRefs: readonly GroundedDefinitionRef[];
    }>[];
}

export interface GroundedAnswerConcealmentEvidence {
    readonly surfaceAudit: GroundedDefinitionRef;
    /** Content-derived answer-bearing values the DOM audit must search for. */
    readonly answerBearingContent: GroundedDefinitionRef;
    /** Exact rendered surface whose pre-commit DOM was audited. */
    readonly auditBinding: Readonly<{
        surfaceId: string;
        renderer: GroundedDefinitionRef;
        contentRevision: string;
    }>;
    readonly learnerFacingPreCommit: Readonly<{
        translations: 'absent';
        transcripts: 'absent';
        modelAnswers: 'absent';
        acceptedAnswers: 'absent';
    }>;
    readonly revealPolicy: 'after-commit' | 'after-first-attempt';
}

export type GroundedMediaEvidence = Readonly<{ state: 'not-required'; reason: string }> | Readonly<{
    state: 'ready'; provenance: 'source' | 'authored'; assetIds: readonly string[];
    revision: string; transcript: 'ready' | 'not-applicable';
}>;

export type GroundedAssessmentEvidence =
    | Readonly<{
        method: 'deterministic'; grader: GroundedDefinitionRef; answerSets: readonly GroundedDefinitionRef[];
    }>
    | Readonly<{
        method: 'rubric'; grader: GroundedDefinitionRef; rubrics: readonly GroundedDefinitionRef[];
    }>;

export interface GroundedRepairEvidence {
    readonly errorTagIds: readonly string[];
    readonly feedbackIds: readonly string[];
    readonly nearbyExampleIds: readonly string[];
    readonly retry: 'same-activity' | 'smaller-step';
}

export interface GroundedLearnerEvidence {
    readonly attemptEventKind: 'attempt-recorded';
    readonly reviewRepository: 'canonical-yomu';
    readonly reviewItems: readonly Readonly<{
        seedId: string;
        conceptId: string;
        expressionKey: string;
        readingKey: string;
    }>[];
}

export type GroundedEvidenceModality = 'selection' | 'constructed-text' | 'handwriting'
    | 'speech' | 'listening' | 'physical-action';

export interface GroundedAccessibilityEvidence {
    readonly keyboardNavigation: 'equivalent';
    readonly touchNavigation: 'equivalent';
    readonly screenReader: 'equivalent';
    readonly reducedMotion: 'equivalent';
    readonly mediaAlternative: 'not-required' | 'transcript' | 'captions';
    readonly primaryEvidenceModality: GroundedEvidenceModality;
    readonly inputAlternative: Readonly<{ kind: 'not-required'; reason: string }> | Readonly<{
        kind: 'construct-preserving'; modality: GroundedEvidenceModality;
        preservesLearningConstruct: true; rationale: string;
    }>;
}

export interface GroundingProofSet {
    readonly input: GroundingProof<GroundedInputEvidence>;
    readonly curriculum: GroundingProof<GroundedCurriculumEvidence>;
    readonly instruction: GroundingProof<GroundedInstructionEvidence>;
    readonly answerConcealment: GroundingProof<GroundedAnswerConcealmentEvidence>;
    readonly media: GroundingProof<GroundedMediaEvidence>;
    readonly assessment: GroundingProof<GroundedAssessmentEvidence>;
    readonly repair: GroundingProof<GroundedRepairEvidence>;
    readonly learnerEvidence: GroundingProof<GroundedLearnerEvidence>;
    readonly accessibility: GroundingProof<GroundedAccessibilityEvidence>;
}

export interface GroundedProductionSequenceEvidence {
    readonly guidedActivityIds: readonly string[];
    readonly independentActivityIds: readonly string[];
    readonly changedContextTransfers: readonly Readonly<{
        activityId: string;
        fromContextId: string;
        toContextId: string;
    }>[];
}

export interface GroundedActivityContract {
    readonly id: string;
    readonly order: number;
    readonly phase: GroundingPhase;
    readonly production: boolean;
    readonly status: GroundingStatus;
    readonly blockerIds: readonly string[];
    readonly proofs: GroundingProofSet;
}

export interface GroundedLessonContract {
    readonly schemaVersion: 1;
    readonly lessonId: string;
    readonly contentRevision: string;
    readonly status: GroundingStatus;
    readonly blockerIds: readonly string[];
    readonly overview: Readonly<{
        proofs: GroundingProofSet;
        productionSequence: GroundingProof<GroundedProductionSequenceEvidence>;
    }>;
    readonly activities: readonly GroundedActivityContract[];
}

export { validateGroundedLesson } from './grounded-lesson-validation';
