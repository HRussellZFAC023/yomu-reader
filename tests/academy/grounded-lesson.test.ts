import {
    validateGroundedLesson,
    type GroundedDefinitionRef,
    type GroundedLessonContract,
    type GroundingPhase,
    type GroundingProofSet,
} from '../../src/academy/domain/grounded-lesson';

function definition(id: string): GroundedDefinitionRef {
    return { id, registry: 'academy-content', revision: 'test.v1', sha256: 'a'.repeat(64) };
}

function readyProofs(entry = true): GroundingProofSet {
    return {
        input: {
            state: 'ready',
            evidence: {
                kind: 'authored',
                authoredInputIds: ['input:test'],
                revision: 'test.v1',
                authorId: 'author:test',
                rationale: 'A deliberately authored test input.',
                languageReview: {
                    reviewerId: 'reviewer:test',
                    revision: 'review.v1',
                    register: 'reviewed',
                    naturalness: 'reviewed',
                },
            },
        },
        curriculum: {
            state: 'ready',
            evidence: {
                conceptIds: ['concept:test'],
                outcomeIds: ['outcome:test'],
                prerequisites: entry
                    ? { kind: 'entry', reason: 'This fixture starts at entry.' }
                    : {
                        kind: 'resolved',
                        conceptIds: ['concept:prior'],
                        resolution: definition('curriculum-resolution:test'),
                    },
            },
        },
        instruction: {
            state: 'ready',
            evidence: {
                sequence: 'before-assessment',
                conceptCoverage: [{
                    conceptId: 'concept:test',
                    explanationRefs: [definition('explanation:test')],
                    workedExampleRefs: [definition('example:test')],
                }],
            },
        },
        answerConcealment: {
            state: 'ready',
            evidence: {
                surfaceAudit: definition('surface-audit:test'),
                answerBearingContent: definition('answer-bearing-content:test'),
                auditBinding: {
                    surfaceId: 'surface:test',
                    renderer: definition('surface-renderer:test'),
                    contentRevision: 'test.v1',
                },
                learnerFacingPreCommit: {
                    translations: 'absent',
                    transcripts: 'absent',
                    modelAnswers: 'absent',
                    acceptedAnswers: 'absent',
                },
                revealPolicy: 'after-first-attempt',
            },
        },
        media: { state: 'ready', evidence: { state: 'not-required', reason: 'Text-only fixture.' } },
        assessment: {
            state: 'ready',
            evidence: {
                method: 'deterministic',
                grader: definition('grader:test'),
                answerSets: [definition('answer-set:test')],
            },
        },
        repair: {
            state: 'ready',
            evidence: {
                errorTagIds: ['error:test'],
                feedbackIds: ['feedback:test'],
                nearbyExampleIds: ['example:nearby-test'],
                retry: 'smaller-step',
            },
        },
        learnerEvidence: {
            state: 'ready',
            evidence: {
                attemptEventKind: 'attempt-recorded',
                reviewRepository: 'canonical-yomu',
                reviewItems: [{
                    seedId: 'review:test',
                    conceptId: 'concept:test',
                    expressionKey: '日本語',
                    readingKey: 'にほんご',
                }],
            },
        },
        accessibility: {
            state: 'ready',
            evidence: {
                keyboardNavigation: 'equivalent',
                touchNavigation: 'equivalent',
                screenReader: 'equivalent',
                reducedMotion: 'equivalent',
                mediaAlternative: 'not-required',
                primaryEvidenceModality: 'constructed-text',
                inputAlternative: { kind: 'not-required', reason: 'IME input already supports equivalent entry.' },
            },
        },
    };
}

function readyLesson(): GroundedLessonContract {
    const phases: readonly GroundingPhase[] = ['guided', 'independent', 'transfer'];
    const activities = phases.map((phase, index) => ({
        id: `activity:${phase}`,
        order: index + 1,
        phase,
        production: true,
        status: 'playable' as const,
        blockerIds: [],
        proofs: readyProofs(index === 0),
    }));
    return {
        schemaVersion: 1,
        lessonId: 'lesson:test',
        contentRevision: 'test.v1',
        status: 'playable',
        blockerIds: [],
        overview: {
            proofs: readyProofs(),
            productionSequence: {
                state: 'ready',
                evidence: {
                    guidedActivityIds: ['activity:guided'],
                    independentActivityIds: ['activity:independent'],
                    changedContextTransfers: [{
                        activityId: 'activity:transfer',
                        fromContextId: 'context:lesson',
                        toContextId: 'context:new-situation',
                    }],
                },
            },
        },
        activities,
    };
}

describe('grounded lesson contract', () => {
    it('accepts a lesson only when instruction, practice, repair, review, and access are all evidenced', () => {
        expect(validateGroundedLesson(readyLesson())).toEqual(readyLesson());
    });

    it('rejects story and art metadata when learning proofs are absent', () => {
        expect(() => validateGroundedLesson({
            schemaVersion: 1,
            lessonId: 'lesson:pretty-scene',
            contentRevision: 'v1',
            status: 'playable',
            blockerIds: [],
            overview: { storyId: 'scene:opening', artIds: ['art:rie'] },
            activities: [{ id: 'activity:dialogue', storyId: 'scene:opening' }],
        })).toThrow(/proofs/i);
    });

    it('requires a worked example before assessment', () => {
        const lesson = readyLesson();
        const proof = lesson.activities[0]!.proofs.instruction;
        if (proof.state !== 'ready') throw new Error('Fixture instruction proof is not ready.');
        (proof.evidence.conceptCoverage[0]!.workedExampleRefs as GroundedDefinitionRef[]).splice(0);
        expect(() => validateGroundedLesson(lesson)).toThrow(/workedExampleRefs/i);
    });

    it('maps every assessed concept to its own explanation and worked example', () => {
        const lesson = readyLesson();
        const proof = lesson.activities[0]!.proofs.instruction;
        if (proof.state !== 'ready') throw new Error('Fixture instruction proof is not ready.');
        (proof.evidence.conceptCoverage[0] as unknown as { conceptId: string }).conceptId = 'concept:unrelated';
        expect(() => validateGroundedLesson(lesson)).toThrow(/does not cover every assessed concept/i);
    });

    it('keeps all answer-bearing learner state absent before commitment', () => {
        const lesson = readyLesson();
        const proof = lesson.activities[0]!.proofs.answerConcealment;
        if (proof.state !== 'ready') throw new Error('Fixture concealment proof is not ready.');
        (proof.evidence.learnerFacingPreCommit as unknown as { translations: string }).translations = 'visible';
        expect(() => validateGroundedLesson(lesson)).toThrow(/translations must be absent/i);
    });

    it('requires authored register and naturalness review', () => {
        const lesson = readyLesson();
        const proof = lesson.activities[0]!.proofs.input;
        if (proof.state !== 'ready' || proof.evidence.kind !== 'authored') {
            throw new Error('Fixture authored-input proof is not ready.');
        }
        delete (proof.evidence as unknown as { languageReview?: unknown }).languageReview;
        expect(() => validateGroundedLesson(lesson)).toThrow(/languageReview/i);

        const missingRevision = readyLesson();
        const reviewed = missingRevision.activities[0]!.proofs.input;
        if (reviewed.state !== 'ready' || reviewed.evidence.kind !== 'authored') {
            throw new Error('Fixture authored-input proof is not ready.');
        }
        (reviewed.evidence.languageReview as unknown as { revision: string }).revision = '';
        expect(() => validateGroundedLesson(missingRevision)).toThrow(/languageReview\.revision/i);
    });

    it('requires canonical expression and reading keys, not opaque review ids', () => {
        const lesson = readyLesson();
        const learnerProof = lesson.activities[1]!.proofs.learnerEvidence;
        if (learnerProof.state !== 'ready') throw new Error('Fixture learner proof is not ready.');
        (learnerProof.evidence.reviewItems[0] as unknown as {
            expressionKey: string; readingKey: string;
        }).expressionKey = 'review:opaque';
        expect(() => validateGroundedLesson(lesson)).toThrow(/canonical expression and reading keys/i);

        const onlySeedIds = readyLesson();
        const opaqueProof = onlySeedIds.activities[1]!.proofs.learnerEvidence;
        if (opaqueProof.state !== 'ready') throw new Error('Fixture learner proof is not ready.');
        delete (opaqueProof.evidence as unknown as { reviewItems?: unknown }).reviewItems;
        expect(() => validateGroundedLesson(onlySeedIds)).toThrow(/reviewItems must be an array/i);
    });

    it('normalizes canonical review identity before detecting duplicates', () => {
        const lesson = readyLesson();
        const proof = lesson.activities[0]!.proofs.learnerEvidence;
        if (proof.state !== 'ready') throw new Error('Fixture learner proof is not ready.');
        (proof.evidence.reviewItems as unknown as Array<Record<string, string>>).push({
            seedId: 'review:test-fullwidth',
            conceptId: 'concept:test',
            expressionKey: 'Ｎ１',
            readingKey: 'エヌワン',
        }, {
            seedId: 'review:test-ascii',
            conceptId: 'concept:test',
            expressionKey: 'N1',
            readingKey: 'エヌワン',
        });
        expect(() => validateGroundedLesson(lesson)).toThrow(/repeats a canonical review key/i);
    });

    it('rejects one canonical Study card assigned to different concepts across activities', () => {
        const lesson = readyLesson();
        const activity = lesson.activities[1]!;
        const curriculum = activity.proofs.curriculum;
        const instruction = activity.proofs.instruction;
        const learner = activity.proofs.learnerEvidence;
        if (curriculum.state !== 'ready' || instruction.state !== 'ready' || learner.state !== 'ready') {
            throw new Error('Fixture proofs are not ready.');
        }
        (curriculum.evidence.conceptIds as string[]).splice(0, 1, 'concept:other');
        (instruction.evidence.conceptCoverage[0] as unknown as { conceptId: string }).conceptId = 'concept:other';
        (learner.evidence.reviewItems[0] as unknown as { conceptId: string }).conceptId = 'concept:other';
        expect(() => validateGroundedLesson(lesson)).toThrow(/assigned to more than one concept/i);
    });

    it('requires resolvable assessment definitions', () => {
        const lesson = readyLesson();
        const proof = lesson.activities[0]!.proofs.assessment;
        if (proof.state !== 'ready') throw new Error('Fixture assessment proof is not ready.');
        (proof.evidence.grader as unknown as { sha256: string }).sha256 = 'opaque-grader-id';
        expect(() => validateGroundedLesson(lesson)).toThrow(/grader\.sha256 must be a SHA-256/i);
    });

    it('requires curriculum resolution after the entry activity', () => {
        const lesson = readyLesson();
        const proof = lesson.activities[1]!.proofs.curriculum;
        if (proof.state !== 'ready') throw new Error('Fixture curriculum proof is not ready.');
        (proof.evidence as unknown as { prerequisites: unknown }).prerequisites = {
            kind: 'entry', reason: 'Pretend this is another entry.',
        };
        expect(() => validateGroundedLesson(lesson)).toThrow(/not an entry activity/i);
    });

    it('requires equivalent navigation and evidence access', () => {
        const inaccessible = readyLesson();
        const accessProof = inaccessible.activities[1]!.proofs.accessibility;
        if (accessProof.state !== 'ready') throw new Error('Fixture accessibility proof is not ready.');
        (accessProof.evidence as unknown as { keyboardNavigation: string }).keyboardNavigation = 'mouse-only';
        expect(() => validateGroundedLesson(inaccessible)).toThrow(/keyboardNavigation/i);
    });

    it.each(['handwriting', 'speech'] as const)(
        'does not substitute keyboard text for %s evidence',
        modality => {
            const lesson = readyLesson();
            const proof = lesson.activities[0]!.proofs.accessibility;
            if (proof.state !== 'ready') throw new Error('Fixture accessibility proof is not ready.');
            const evidence = proof.evidence as unknown as {
                primaryEvidenceModality: string;
                inputAlternative: unknown;
            };
            evidence.primaryEvidenceModality = modality;
            evidence.inputAlternative = {
                kind: 'construct-preserving',
                modality: 'constructed-text',
                preservesLearningConstruct: true,
                rationale: 'Keyboard entry is available.',
            };
            expect(() => validateGroundedLesson(lesson)).toThrow(/same learning construct/i);
        },
    );

    it('requires guided, independent, and transfer production without omissions', () => {
        const lesson = readyLesson();
        const sequence = lesson.overview.productionSequence;
        if (sequence.state !== 'ready') throw new Error('Fixture production sequence is not ready.');
        (sequence.evidence.changedContextTransfers as unknown[]).splice(0);
        expect(() => validateGroundedLesson(lesson)).toThrow(/changedContextTransfers must not be empty/i);

        for (const field of ['guidedActivityIds', 'independentActivityIds'] as const) {
            const missingPhase = readyLesson();
            const proof = missingPhase.overview.productionSequence;
            if (proof.state !== 'ready') throw new Error('Fixture production sequence is not ready.');
            (proof.evidence[field] as string[]).splice(0);
            expect(() => validateGroundedLesson(missingPhase)).toThrow(new RegExp(`${field} must not be empty`, 'i'));
        }
    });

    it('permits a named production-sequence blocker instead of invented transfer evidence', () => {
        const lesson = readyLesson();
        (lesson.overview as unknown as { productionSequence: unknown }).productionSequence = {
            state: 'review-blocked', blockerIds: ['blocker:test-transfer-context'],
        };
        const mutable = lesson as unknown as { status: string; blockerIds: string[] };
        mutable.status = 'review-blocked';
        mutable.blockerIds = ['blocker:test-transfer-context'];
        expect(validateGroundedLesson(lesson).status).toBe('review-blocked');
    });

    it('requires transfer into a changed context', () => {
        const lesson = readyLesson();
        const sequence = lesson.overview.productionSequence;
        if (sequence.state !== 'ready') throw new Error('Fixture production sequence is not ready.');
        const transfer = sequence.evidence.changedContextTransfers[0] as unknown as { toContextId: string };
        transfer.toContextId = 'context:lesson';
        expect(() => validateGroundedLesson(lesson)).toThrow(/changed context/i);
    });

    it('rejects assigning one production activity to more than one phase', () => {
        const lesson = readyLesson();
        const sequence = lesson.overview.productionSequence;
        if (sequence.state !== 'ready') throw new Error('Fixture production sequence is not ready.');
        (sequence.evidence.independentActivityIds as string[]).push('activity:guided');
        expect(() => validateGroundedLesson(lesson)).toThrow(/assigned to production more than once/i);
    });

    it('allows an explicit review blocker but rejects a playable label over it', () => {
        const lesson = readyLesson();
        const activity = lesson.activities[0] as unknown as {
            proofs: { instruction: GroundingProofSet['instruction'] };
            status: GroundedLessonContract['status'];
            blockerIds: string[];
        };
        activity.proofs.instruction = {
            state: 'review-blocked',
            blockerIds: ['blocker:test-instruction'],
        };
        expect(() => validateGroundedLesson(lesson)).toThrow(/blockerIds|dishonest status/i);

        activity.status = 'review-blocked';
        activity.blockerIds = ['blocker:test-instruction'];
        const mutableLesson = lesson as unknown as {
            status: GroundedLessonContract['status']; blockerIds: string[];
        };
        mutableLesson.status = 'review-blocked';
        mutableLesson.blockerIds = ['blocker:test-instruction'];
        expect(validateGroundedLesson(lesson).status).toBe('review-blocked');
    });

    it('rejects a blocked proof without a named blocker', () => {
        const lesson = readyLesson();
        const activity = lesson.activities[0] as unknown as {
            proofs: { instruction: GroundingProofSet['instruction'] };
        };
        activity.proofs.instruction = { state: 'review-blocked', blockerIds: [] };
        expect(() => validateGroundedLesson(lesson)).toThrow(/blockerIds must not be empty/i);
    });
});
