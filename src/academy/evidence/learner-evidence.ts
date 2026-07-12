import type { OrientationMockResult } from '../placement/orientation';
import type { ActivityEvaluation } from '../domain/activity-runtime';
import {
    createLearnerRecord,
    type JlptBand,
    type LearnerEventRepository,
    type LearnerProfileSnapshot,
    type LearnerProjection,
    type LearnerRecord,
    type ReviewRating,
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
    recordActivity(evaluation: ActivityEvaluation, milestone?: ActivityMilestone): Promise<void>;
    recordShadowing(): Promise<void>;
    dueReviews(limit: number): Promise<readonly ReviewQueueItem[]>;
    rateReview(itemId: string, rating: ReviewRating): Promise<void>;
}

export function createLearnerEvidence(
    repository: LearnerEventRepository,
    review: ReviewQueueService,
): LearnerEvidence {
    return new DefaultLearnerEvidence(createLearnerRecord({ repository }), review);
}

class DefaultLearnerEvidence implements LearnerEvidence {
    private projectionValue: LearnerProjection | null = null;
    private pending = Promise.resolve();

    constructor(
        private readonly record: LearnerRecord,
        private readonly review: ReviewQueueService,
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

    recordActivity(evaluation: ActivityEvaluation, milestone?: ActivityMilestone): Promise<void> {
        return this.enqueue(async () => {
            await this.record.record(evaluation.attempt);
            await this.review.ingest(evaluation.reviewSeeds);
            const unscheduled = evaluation.reviewSeeds.filter(seed => !this.projection.scheduledReviews[`yomu-local:${seed.id}`]);
            await this.record.recordMany(unscheduled.map(seed => ({
                kind: 'review-scheduled' as const,
                eventId: `review-scheduled:yomu-local:${seed.id}`,
                reviewItemId: `yomu-local:${seed.id}`,
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
                ] : []),
                { kind: 'scene-completed', eventId: `milestone:${milestone.id}:scene`, sceneId: milestone.sceneId },
            ]);
            await this.refreshNow();
        });
    }

    recordShadowing(): Promise<void> {
        return this.enqueue(async () => {
            const existing = this.projection.activities['activity:language-lab-repeat-shadowing'];
            if (existing?.lastOutcome === 'pass') return;
            await this.record.record({
                kind: 'attempt-recorded',
                eventId: 'milestone:language-lab-repeat-shadowing:attempt',
                activityId: 'activity:language-lab-repeat-shadowing',
                sourceQuestionId: 'source-question:classroom-phrase-09',
                conceptIds: ['concept:classroom-repair-repeat'],
                responseKind: 'speaking-self-assessment',
                outcome: 'pass',
                score: 1,
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
