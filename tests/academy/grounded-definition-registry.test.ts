import {
    assertGroundedLessonDefinitionsResolve,
    createGroundedDefinitionRegistry,
    type GroundedDefinitionRecord,
} from '../../src/academy/domain/grounded-definition-registry';
import type {
    GroundedAnswerConcealmentEvidence,
    GroundedLessonContract,
    GroundingProofSet,
} from '../../src/academy/domain/grounded-lesson';

const claim: GroundedAnswerConcealmentEvidence = {
    surfaceAudit: {
        id: 'surface-audit:test',
        registry: 'academy-content',
        revision: 'test.v1',
        sha256: 'c'.repeat(64),
    },
    learnerFacingPreCommit: {
        translations: 'absent',
        transcripts: 'absent',
        modelAnswers: 'absent',
        acceptedAnswers: 'absent',
    },
    revealPolicy: 'after-first-attempt',
};

describe('grounded definition registry', () => {
    it('resolves and cross-checks the pre-commit surface audit', () => {
        const registry = createGroundedDefinitionRegistry([surfaceRecord(claim)]);
        expect(() => assertGroundedLessonDefinitionsResolve(lessonWithClaim(claim), registry)).not.toThrow();

        const mismatched = surfaceRecord(claim);
        (mismatched as unknown as { value: unknown }).value = {
            learnerFacingPreCommit: { ...claim.learnerFacingPreCommit, translations: 'visible' },
            revealPolicy: claim.revealPolicy,
        };
        const mismatchedRegistry = createGroundedDefinitionRegistry([mismatched]);
        expect(() => assertGroundedLessonDefinitionsResolve(lessonWithClaim(claim), mismatchedRegistry))
            .toThrow(/surface audit does not match/i);
    });
});

function surfaceRecord(value: GroundedAnswerConcealmentEvidence): GroundedDefinitionRecord {
    return {
        ref: value.surfaceAudit,
        kind: 'surface-audit',
        source: { contentId: 'content:test', locator: 'preCommitSurface' },
        value: {
            learnerFacingPreCommit: value.learnerFacingPreCommit,
            revealPolicy: value.revealPolicy,
        },
    };
}

function lessonWithClaim(value: GroundedAnswerConcealmentEvidence): GroundedLessonContract {
    const blocked = { state: 'review-blocked' as const, blockerIds: ['blocker:test'] };
    const proofs: GroundingProofSet = {
        input: blocked,
        curriculum: blocked,
        instruction: blocked,
        answerConcealment: { state: 'ready', evidence: value },
        media: blocked,
        assessment: blocked,
        repair: blocked,
        learnerEvidence: blocked,
        accessibility: blocked,
    };
    return {
        schemaVersion: 1,
        lessonId: 'lesson:test',
        contentRevision: 'test.v1',
        status: 'review-blocked',
        blockerIds: ['blocker:test'],
        overview: { proofs, productionSequence: blocked },
        activities: [],
    };
}
