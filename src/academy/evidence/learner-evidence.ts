import type { OrientationMockResult } from '../placement/orientation';
import type { ActivityEvaluation, ReviewSeed } from '../domain/activity-runtime';
import type { GroundedLessonContract } from '../domain/grounded-lesson';
import {
    canonicalGroundedConceptReviewKey,
    canonicalGroundedReviewKey,
} from '../domain/review-identity';
import {
    createGroundedLessonResolver,
    type GroundedLessonResolver,
} from '../content/grounded-lesson-resolver';
import {
    createLearnerRecord,
    type JlptBand,
    type LearnerEventRepository,
    type LearnerProfileSnapshot,
    type LearnerProjection,
    type LearnerRecord,
    type ReviewRating,
    type SupportKind,
} from '../domain/learner-record';
import type { ReviewQueueItem, ReviewQueueService } from '../integration/yomu-bridge';

export type CurriculumEntryChoice =
    | { readonly route: 'lesson-zero' }
    | {
        readonly route: 'manual-band' | 'placement-mock';
        readonly band: JlptBand;
        readonly recommendationAccepted?: boolean;
    };

export interface ActivityMilestone {
    readonly id: string;
    readonly sceneId: string;
    readonly requiredErrorTag?: string;
    readonly unlock?: {
        readonly assetId: string;
        readonly characterId: string;
        readonly bondDelta: number;
    };
}

export interface LearnerEvidence {
    readonly projection: LearnerProjection;
    initialize(): Promise<LearnerProjection>;
    refresh(): Promise<LearnerProjection>;
    saveProfile(profile: LearnerProfileSnapshot): Promise<{ firstIntroduction: boolean }>;
    chooseCurriculumEntry(choice: CurriculumEntryChoice): Promise<void>;
    savePlacement(result: OrientationMockResult): Promise<void>;
    recordActivity(
        evaluation: ActivityEvaluation,
        lessonId: string,
        milestone?: ActivityMilestone,
    ): Promise<void>;
    recordSupportUse(activityId: string, supportKind: SupportKind, choiceId?: string): Promise<void>;
    dueReviews(limit: number): Promise<readonly ReviewQueueItem[]>;
    rateReview(itemId: string, rating: ReviewRating): Promise<void>;
}

export function createLearnerEvidence(
    repository: LearnerEventRepository,
    review: ReviewQueueService,
    groundedLessons: GroundedLessonResolver = createGroundedLessonResolver(),
): LearnerEvidence {
    return new DefaultLearnerEvidence(createLearnerRecord({ repository }), review, groundedLessons);
}

class DefaultLearnerEvidence implements LearnerEvidence {
    private projectionValue: LearnerProjection | null = null;
    private pending = Promise.resolve();

    constructor(
        private readonly record: LearnerRecord,
        private readonly review: ReviewQueueService,
        private readonly groundedLessons: GroundedLessonResolver,
    ) {}

    get projection(): LearnerProjection {
        if (!this.projectionValue) throw new Error('Learner evidence has not been initialized.');
        return this.projectionValue;
    }

    initialize(): Promise<LearnerProjection> {
        return this.refresh();
    }

    refresh(): Promise<LearnerProjection> {
        return this.enqueue(async () => {
            this.projectionValue = await this.record.snapshot();
            return this.projectionValue;
        });
    }

    saveProfile(profile: LearnerProfileSnapshot): Promise<{ firstIntroduction: boolean }> {
        return this.enqueue(async () => {
            const firstIntroduction = !this.projection.unlockedAssets.includes('character:rie');
            await this.record.recordMany([
                { kind: 'profile-changed', profile },
                ...(firstIntroduction ? [
                    { kind: 'asset-unlocked' as const, eventId: 'milestone:rie-introduction:asset', assetId: 'character:rie' },
                    { kind: 'bond-changed' as const, eventId: 'milestone:rie-introduction:bond', characterId: 'rie', delta: 1 },
                    { kind: 'relationship-chapter-unlocked' as const, eventId: 'milestone:rie-introduction:journal', characterId: 'rie', chapter: 1, majorTurn: 'recognition' as const },
                    { kind: 'scene-completed' as const, eventId: 'milestone:rie-introduction:scene', sceneId: 'scene:opening-rie-introduction' },
                ] : []),
            ]);
            await this.refreshNow();
            return { firstIntroduction };
        });
    }

    chooseCurriculumEntry(choice: CurriculumEntryChoice): Promise<void> {
        return this.enqueue(async () => {
            await this.record.record({ kind: 'curriculum-entry-chosen', ...choice });
            await this.refreshNow();
        });
    }

    savePlacement(result: OrientationMockResult): Promise<void> {
        return this.enqueue(async () => {
            await this.record.record({ kind: 'placement-assessed', ...result });
            await this.refreshNow();
        });
    }

    recordActivity(
        evaluation: ActivityEvaluation,
        lessonId: string,
        milestone?: ActivityMilestone,
    ): Promise<void> {
        return this.enqueue(async () => {
            const lesson = await this.groundedLessons.resolve(lessonId);
            assertGroundedEvaluation(evaluation, lesson);
            await this.record.record(evaluation.attempt);
            await this.review.ingest(evaluation.reviewSeeds);
            const unscheduled = new Map<string, ReviewSeed>();
            for (const seed of evaluation.reviewSeeds) {
                const itemId = reviewItemId(seed);
                const legacyItemId = `yomu-local:${seed.id}`;
                if (this.projection.scheduledReviews[itemId] || this.projection.scheduledReviews[legacyItemId]) continue;
                unscheduled.set(itemId, unscheduled.get(itemId) ?? seed);
            }
            await this.record.recordMany([...unscheduled].map(([itemId, seed]) => ({
                kind: 'review-scheduled' as const,
                eventId: `review-scheduled:yomu-local:${seed.id}`,
                reviewItemId: itemId,
                conceptId: seed.conceptId,
                dueAt: Date.now(),
                provenance: {
                    activity: evaluation.attempt.activityId,
                    ...(seed.sourceQuestionId ? { sourceQuestion: seed.sourceQuestionId } : {}),
                },
            })));
            await this.refreshNow();
            if (!milestone || evaluation.result.outcome !== 'pass') return;
            if (milestone.requiredErrorTag && !evaluation.result.errorTags.includes(milestone.requiredErrorTag)) return;
            if (this.projection.completedScenes.includes(milestone.sceneId)) return;
            await this.record.recordMany([
                ...(milestone.unlock ? [
                    { kind: 'asset-unlocked' as const, eventId: `milestone:${milestone.id}:asset`, assetId: milestone.unlock.assetId },
                    { kind: 'bond-changed' as const, eventId: `milestone:${milestone.id}:bond`, characterId: milestone.unlock.characterId, delta: milestone.unlock.bondDelta },
                    { kind: 'relationship-chapter-unlocked' as const, eventId: `milestone:${milestone.id}:journal`, characterId: milestone.unlock.characterId, chapter: 1, majorTurn: 'recognition' as const },
                ] : []),
                { kind: 'scene-completed', eventId: `milestone:${milestone.id}:scene`, sceneId: milestone.sceneId },
            ]);
            await this.refreshNow();
        });
    }

    recordSupportUse(activityId: string, supportKind: SupportKind, choiceId?: string): Promise<void> {
        return this.enqueue(async () => {
            await this.record.record({
                kind: 'support-used',
                activityId,
                supportKind,
                ...(choiceId ? { choiceId } : {}),
            });
            await this.refreshNow();
        });
    }

    dueReviews(limit: number): Promise<readonly ReviewQueueItem[]> {
        return this.review.due(limit);
    }

    rateReview(itemId: string, rating: ReviewRating): Promise<void> {
        return this.enqueue(async () => {
            await this.review.rate(itemId, rating);
            await this.record.record({ kind: 'review-rated', reviewItemId: itemId, rating });
            await this.refreshNow();
        });
    }

    private async refreshNow(): Promise<void> {
        this.projectionValue = await this.record.snapshot();
    }

    private enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.pending.then(operation);
        this.pending = result.then(() => undefined, () => undefined);
        return result;
    }
}

function reviewItemId(seed: ReviewSeed): string {
    return canonicalGroundedReviewKey(seed.content.expression, seed.content.reading);
}

function assertGroundedEvaluation(
    evaluation: ActivityEvaluation,
    lesson: GroundedLessonContract,
): void {
    if (lesson.status !== 'playable') {
        throw new Error(`Lesson ${lesson.lessonId} is not grounded-playable.`);
    }
    const activity = lesson.activities.find(item => item.id === evaluation.attempt.activityId);
    if (!activity || activity.status !== 'playable') {
        throw new Error(`Activity ${evaluation.attempt.activityId} is not grounded-playable.`);
    }

    const curriculum = activity.proofs.curriculum;
    if (curriculum.state !== 'ready') throw new Error('Grounded activity has no curriculum proof.');
    if (!sameStrings(curriculum.evidence.conceptIds, evaluation.attempt.conceptIds)) {
        throw new Error(`Activity ${activity.id} emitted concepts outside its grounding contract.`);
    }

    const input = activity.proofs.input;
    if (input.state !== 'ready') throw new Error('Grounded activity has no input proof.');
    if (input.evidence.kind === 'source') {
        const sourceQuestionId = evaluation.attempt.sourceQuestionId;
        if (!sourceQuestionId || !input.evidence.sourceQuestionIds.includes(sourceQuestionId)) {
            throw new Error(`Activity ${activity.id} emitted an ungrounded Source Question.`);
        }
    }

    const learner = activity.proofs.learnerEvidence;
    if (learner.state !== 'ready') throw new Error('Grounded activity has no learner-evidence proof.');
    const allowed = new Set(learner.evidence.reviewItems.map(item => canonicalGroundedConceptReviewKey(
        item.expressionKey,
        item.readingKey,
        item.conceptId,
    )));
    for (const seed of evaluation.reviewSeeds) {
        const key = canonicalGroundedConceptReviewKey(
            seed.content.expression,
            seed.content.reading,
            seed.conceptId,
        );
        if (!allowed.has(key)) {
            throw new Error(`Activity ${activity.id} emitted an ungrounded review item.`);
        }
    }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
    return JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
}
