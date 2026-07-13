import {
    validateGroundedLesson,
    type BlockedProof,
    type GroundedActivityContract,
    type GroundedLessonContract,
    type GroundingPhase,
    type GroundingProofSet,
} from '../domain/grounded-lesson';
import { assertGroundedLessonDefinitionsResolve } from '../domain/grounded-definition-registry';
import type { SourceDocument } from '../domain/source-library';
import type { LessonZeroActivity, LessonZeroPackageData } from './lesson-zero-schema';
import { createLessonZeroPedagogy, type LessonZeroPedagogy } from './lesson-zero-pedagogy';
import { validateLessonZeroPackage } from './lesson-zero-validator';

const BLOCKERS = {
    prerequisites: 'blocker:lesson-zero-grounded-prerequisites',
    authoredLanguage: 'blocker:lesson-zero-grounded-authored-language-review',
    instruction: 'blocker:lesson-zero-grounded-instruction',
    answerConcealment: 'blocker:lesson-zero-answer-concealment-surface-audit',
    assessment: 'blocker:lesson-zero-grounded-assessment-definitions',
    repair: 'blocker:lesson-zero-grounded-repair',
    review: 'blocker:lesson-zero-grounded-review-seeds',
    accessibility: 'blocker:lesson-zero-grounded-accessibility',
    transferContext: 'blocker:lesson-zero-grounded-transfer-context',
    sceneActionAssessment: 'blocker:lesson-zero-scene-action-grader',
} as const;

/**
 * Audit the immutable Lesson 0 package against the release grounding contract.
 * Source validation runs first, so this audit cannot soften source hashes, loci, or coverage.
 */
export function validateLessonZeroGrounding(value: unknown): GroundedLessonContract {
    const data = validateLessonZeroPackage(value);
    const pedagogy = createLessonZeroPedagogy(data);
    const contract = validateGroundedLesson(buildContract(data, pedagogy));
    assertGroundedLessonDefinitionsResolve(contract, pedagogy.registry);
    return contract;
}

function buildContract(data: LessonZeroPackageData, pedagogy: LessonZeroPedagogy): GroundedLessonContract {
    const { lesson } = data;
    const documents = data.sourceLibrary.documents;
    const sourceQuestionIds = data.sourceLibrary.questions.map(question => question.id);
    const allConceptIds = unique(lesson.activities.flatMap(activity => activity.conceptIds));
    const allOutcomeIds = unique(lesson.sections.flatMap(section => section.outcomeIds));
    const audioBlockerIds = unique(lesson.audioAssets
        .filter(asset => asset.state === 'release-blocked')
        .map(asset => asset.blockerId)
        .filter((id): id is string => Boolean(id)));
    const sectionOutcomes = new Map(lesson.sections.map(section => [section.id, section.outcomeIds]));
    const activities = lesson.activities.map((activity, index) => activityContract(
        activity,
        index,
        lesson.contentVersion,
        sectionOutcomes.get(activity.sectionId) ?? [],
        documents,
        lesson.audioAssets,
        lesson.activities,
        pedagogy,
    ));
    const overviewProofs: GroundingProofSet = {
        input: ready(sourceInput(sourceQuestionIds, documents)),
        curriculum: ready({
            conceptIds: allConceptIds,
            outcomeIds: allOutcomeIds,
            prerequisites: { kind: 'entry', reason: 'Lesson 0 is the absolute-zero entry lesson.' },
        }),
        instruction: blocked(BLOCKERS.instruction),
        answerConcealment: blocked(BLOCKERS.answerConcealment),
        media: audioBlockerIds.length
            ? blocked(...audioBlockerIds)
            : lesson.audioAssets.length
                ? ready({
                    state: 'ready',
                    provenance: 'authored',
                    assetIds: lesson.audioAssets.map(asset => asset.id),
                    revision: lesson.contentVersion,
                    transcript: 'ready',
                })
                : ready({ state: 'not-required', reason: 'This lesson has no timed media input.' }),
        assessment: blocked(BLOCKERS.assessment),
        repair: blocked(BLOCKERS.repair),
        learnerEvidence: blocked(BLOCKERS.review),
        accessibility: blocked(BLOCKERS.accessibility),
    };
    const productionSequence = blocked(BLOCKERS.transferContext);
    const blockerIds = unique([
        ...proofBlockers(overviewProofs),
        ...productionSequence.blockerIds,
        ...activities.flatMap(activity => activity.blockerIds),
    ]);
    return {
        schemaVersion: 1,
        lessonId: lesson.id,
        contentRevision: lesson.contentVersion,
        status: blockerIds.length ? 'review-blocked' : 'playable',
        blockerIds,
        overview: { proofs: overviewProofs, productionSequence },
        activities,
    };
}

function activityContract(
    activity: LessonZeroActivity,
    index: number,
    revision: string,
    outcomeIds: readonly string[],
    documents: readonly SourceDocument[],
    audioAssets: LessonZeroPackageData['lesson']['audioAssets'],
    lessonActivities: readonly LessonZeroActivity[],
    pedagogy: LessonZeroPedagogy,
): GroundedActivityContract {
    const phase = phaseFor(activity.sectionId);
    const inputScriptId = activity.inputScriptId;
    const mediaAsset = inputScriptId
        ? audioAssets.find(asset => asset.id === `audio:${inputScriptId.replace(/^input:/u, '')}`)
        : undefined;
    const needsAudio = activity.responseMode === 'voice' || activity.responseMode === 'listen' || Boolean(mediaAsset);
    const mediaBlocker = mediaAsset?.state === 'release-blocked' ? mediaAsset.blockerId : undefined;
    const classroomBinding = pedagogy.classroomBindings.get(activity.id);
    const classroomAssessment = classroomBinding?.deterministicAssessment
        ? pedagogy.assessmentRefs(activity.id)
        : undefined;
    const classroomRepair = classroomBinding ? pedagogy.repairIds(activity.id) : undefined;
    const classroomReviewItems = classroomBinding ? pedagogy.reviewItems(activity.id) : undefined;
    const priorClassroomActivity = activity.id === 'activity:lesson-zero-reconstruct-repair'
        ? lessonActivities.find(candidate => candidate.id === 'activity:lesson-zero-follow-instructions')
        : undefined;
    const proofs: GroundingProofSet = {
        input: inputScriptId || !activity.sourceQuestionIds.length
            ? blocked(BLOCKERS.authoredLanguage)
            : ready(sourceInput(activity.sourceQuestionIds, documents)),
        curriculum: index === 0
            ? ready({
                conceptIds: activity.conceptIds,
                outcomeIds,
                prerequisites: { kind: 'entry', reason: 'This is the first activity in the absolute-zero lesson.' },
            })
            : priorClassroomActivity
                ? ready({
                    conceptIds: activity.conceptIds,
                    outcomeIds,
                    prerequisites: {
                        kind: 'resolved',
                        conceptIds: priorClassroomActivity.conceptIds,
                        resolution: pedagogy.registry.ref(
                            'prerequisite-resolution:lesson-zero:reconstruct-repair',
                            'prerequisite-resolution',
                        ),
                    },
                })
            : blocked(BLOCKERS.prerequisites),
        instruction: classroomBinding
            ? ready({
                sequence: 'before-assessment',
                conceptCoverage: pedagogy.refsForInstruction(activity),
            })
            : blocked(BLOCKERS.instruction),
        answerConcealment: blocked(BLOCKERS.answerConcealment),
        media: mediaBlocker
            ? blocked(mediaBlocker)
            : mediaAsset?.state === 'ready'
                ? ready({
                    state: 'ready',
                    provenance: 'authored',
                    assetIds: [mediaAsset.id],
                    revision,
                    transcript: 'ready',
                })
                : needsAudio
                    ? blocked('blocker:lesson-zero-verified-dialogue-audio')
                    : ready({ state: 'not-required', reason: 'This interaction does not require timed media input.' }),
        assessment: classroomAssessment
            ? ready({
                method: 'deterministic',
                grader: classroomAssessment.grader,
                answerSets: [classroomAssessment.answerSet],
            })
            : classroomBinding
                ? blocked(BLOCKERS.sceneActionAssessment)
                : blocked(BLOCKERS.assessment),
        repair: classroomRepair
            ? ready({
                ...classroomRepair,
                retry: 'same-activity',
            })
            : blocked(BLOCKERS.repair),
        learnerEvidence: classroomReviewItems
            ? ready({
                attemptEventKind: 'attempt-recorded',
                reviewRepository: 'canonical-yomu',
                reviewItems: classroomReviewItems,
            })
            : blocked(BLOCKERS.review),
        accessibility: blocked(BLOCKERS.accessibility),
    };
    const blockerIds = proofBlockers(proofs);
    return {
        id: activity.id,
        order: index + 1,
        phase,
        production: activity.production,
        status: blockerIds.length ? 'review-blocked' : 'playable',
        blockerIds,
        proofs,
    };
}

function sourceInput(
    sourceQuestionIds: readonly string[], documents: readonly SourceDocument[],
): Readonly<{
    kind: 'source';
    sourceQuestionIds: readonly string[];
    documents: readonly Readonly<{ id: string; sha256: string; extractionRevision: string }>[];
}> {
    return {
        kind: 'source',
        sourceQuestionIds,
        documents: documents.map(document => ({
            id: document.id,
            sha256: document.sha256,
            extractionRevision: document.extractionRevision,
        })),
    };
}

function phaseFor(sectionId: string): GroundingPhase {
    if (sectionId === 'transfer') return 'transfer';
    if (['arrival-greetings', 'sound-script-map', 'classroom-survival'].includes(sectionId)) return 'guided';
    return 'independent';
}

function ready<T>(evidence: T): Readonly<{ state: 'ready'; evidence: T }> {
    return { state: 'ready', evidence };
}

function blocked(...blockerIds: string[]): BlockedProof {
    return { state: 'review-blocked', blockerIds: unique(blockerIds) };
}

function proofBlockers(proofs: GroundingProofSet): string[] {
    return unique(Object.values(proofs).flatMap(proof =>
        proof.state === 'review-blocked' ? proof.blockerIds : []));
}

function unique(values: readonly string[]): string[] {
    return [...new Set(values)].sort();
}
