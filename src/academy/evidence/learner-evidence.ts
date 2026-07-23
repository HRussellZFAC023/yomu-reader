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
    isAdvancedLessonId,
    resolveAdvancedCurriculumEntry,
} from '../content/advanced-curriculum';
import { getAuthoredWeekRegistration, getCompleteLessonRegistration } from '../content/lesson-content-registry';
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
import type {
    ReviewQueueItem,
    ReviewQueueService,
    ReviewSyllabusItem,
    ReviewSyllabusState,
} from '../integration/yomu-bridge';
import {
    grammarKnowledgeEventsForAttempt,
    mirrorGrammarKnowledgeEvents,
    reconcileGrammarKnowledge,
} from '../integration/grammar-knowledge';
import { grammarRuleIdForConcept } from '../integration/grammar-concepts';

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
    readonly journalLine?: Readonly<{
        lineId: string;
        characterId: string;
        text: Readonly<{ ja: string; en: string }>;
        sourceQuestionId?: string;
    }>;
}

export interface GroundedCharacterEncounter {
    readonly encounterId: string;
    readonly sceneId: string;
    /** Attendees are supplied by the completed scene's authored roster. */
    readonly attendeeIds: readonly string[];
}

export interface AdaptiveActivityEvidence {
    readonly eventId?: string;
    readonly at?: number;
    readonly modeId: string;
    readonly skill: import('../domain/learner-record').LearningSkill;
    readonly action: import('../domain/learner-record').LearningAction;
    readonly sourceId?: string;
    readonly independent: boolean;
}

export interface LearnerEvidence {
    readonly projection: LearnerProjection;
    initialize(): Promise<LearnerProjection>;
    refresh(): Promise<LearnerProjection>;
    saveProfile(profile: LearnerProfileSnapshot): Promise<{ firstIntroduction: boolean }>;
    completeRieIntroduction(): Promise<{ recorded: boolean }>;
    chooseCurriculumEntry(choice: CurriculumEntryChoice): Promise<void>;
    savePlacement(result: OrientationMockResult): Promise<void>;
    recordEncounter(encounter: GroundedCharacterEncounter): Promise<void>;
    recordActivity(
        evaluation: ActivityEvaluation,
        lessonId: string,
        milestone?: ActivityMilestone,
        adaptive?: AdaptiveActivityEvidence,
    ): Promise<void>;
    /** Records a completed local world replay without representing it as a lesson completion. */
    recordWorldPractice?(evaluation: ActivityEvaluation): Promise<void>;
    /** Adds verified pre-study rows to the canonical SRS without faking an answer attempt. */
    seedVocabularyPrerequisite(lessonId: string, seeds: readonly ReviewSeed[]): Promise<void>;
    recordSupportUse(
        activityId: string,
        supportKind: SupportKind,
        choiceId?: string,
        identity?: Readonly<{ eventId?: string; at?: number }>,
    ): Promise<void>;
    /** Read-only event history for deterministic local projections. */
    history(): Promise<readonly import('../domain/learner-record').LearnerEvent[]>;
    recordAuthoredStoryPractice(practice: AuthoredStoryPracticeEvidence, outcome: 'pass' | 'lapse'): Promise<void>;
    dueReviews(limit: number): Promise<readonly ReviewQueueItem[]>;
    syllabusState?(items: readonly ReviewSyllabusItem[]): Promise<ReviewSyllabusState>;
    rateReview(itemId: string, rating: ReviewRating): Promise<void>;
}

export interface AuthoredStoryPracticeEvidence {
    readonly activityId: string;
    readonly chapterId: string;
    readonly interaction: 'choice' | 'evidence-map' | 'written-response';
    readonly skill: import('../domain/learner-record').LearningSkill;
    readonly action: import('../domain/learner-record').LearningAction;
    readonly conceptIds: readonly string[];
    readonly reviewSeed: ReviewSeed;
}

export interface LearnerEvidenceOptions {
    readonly now?: () => number;
}

export function createLearnerEvidence(
    repository: LearnerEventRepository,
    review: ReviewQueueService,
    groundedLessons: GroundedLessonResolver = createGroundedLessonResolver(),
    options: LearnerEvidenceOptions = {},
): LearnerEvidence {
    const now = options.now ?? Date.now;
    return new DefaultLearnerEvidence(createLearnerRecord({ repository, now }), review, groundedLessons, now);
}

class DefaultLearnerEvidence implements LearnerEvidence {
    private projectionValue: LearnerProjection | null = null;
    private pending = Promise.resolve();

    constructor(
        private readonly record: LearnerRecord,
        private readonly review: ReviewQueueService,
        private readonly groundedLessons: GroundedLessonResolver,
        private readonly now: () => number,
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
            this.projectionValue = await reconcileGrammarKnowledge(this.record);
            return this.projectionValue;
        });
    }

    saveProfile(profile: LearnerProfileSnapshot): Promise<{ firstIntroduction: boolean }> {
        return this.enqueue(async () => {
            const firstIntroduction = !this.projection.completedEncounterIds.includes('opening-rie-introduction');
            await this.record.record({ kind: 'profile-changed', profile });
            await this.refreshNow();
            return { firstIntroduction };
        });
    }

    completeRieIntroduction(): Promise<{ recorded: boolean }> {
        return this.enqueue(async () => {
            if (this.projection.completedEncounterIds.includes('opening-rie-introduction')) {
                return { recorded: false };
            }
            await this.record.recordMany([
                {
                    kind: 'characters-encountered',
                    eventId: 'encounter:opening-rie-introduction',
                    encounterId: 'opening-rie-introduction',
                    sceneId: 'scene:opening-rie-introduction',
                    attendeeIds: ['rie'],
                },
                { kind: 'asset-unlocked', eventId: 'milestone:rie-introduction:asset', assetId: 'character:rie' },
                { kind: 'bond-changed', eventId: 'milestone:rie-introduction:bond', characterId: 'rie', delta: 1 },
                { kind: 'relationship-chapter-unlocked', eventId: 'milestone:rie-introduction:journal', characterId: 'rie', chapter: 1, majorTurn: 'recognition' },
                { kind: 'scene-completed', eventId: 'milestone:rie-introduction:scene', sceneId: 'scene:opening-rie-introduction' },
            ]);
            await this.refreshNow();
            return { recorded: true };
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

    recordEncounter(encounter: GroundedCharacterEncounter): Promise<void> {
        return this.enqueue(async () => {
            if (this.projection.completedEncounterIds.includes(encounter.encounterId)) return;
            await this.record.recordMany([
                {
                    kind: 'characters-encountered',
                    eventId: `encounter:${encounter.encounterId}`,
                    ...encounter,
                },
                {
                    kind: 'scene-completed',
                    eventId: `encounter:${encounter.encounterId}:scene`,
                    sceneId: encounter.sceneId,
                },
            ]);
            await this.refreshNow();
        });
    }

    recordActivity(
        evaluation: ActivityEvaluation,
        lessonId: string,
        milestone?: ActivityMilestone,
        adaptive?: AdaptiveActivityEvidence,
    ): Promise<void> {
        return this.enqueue(async () => {
            if (lessonId.startsWith('authored-week:')) {
                const packageId = lessonId.slice('authored-week:'.length);
                getAuthoredWeekRegistration(packageId);
                if (!authoredWeekOwnsActivity(packageId, evaluation.attempt.activityId)) {
                    throw new TypeError(`Activity ${evaluation.attempt.activityId} does not belong to ${lessonId}.`);
                }
            } else if (isAdvancedLessonId(lessonId)) {
                assertAdvancedEvaluation(evaluation, resolveAdvancedCurriculumEntry(lessonId).activity, lessonId);
            } else {
                const lesson = await this.groundedLessons.resolve(lessonId);
                if (lesson.status === 'playable') {
                    assertGroundedEvaluation(evaluation, lesson);
                } else {
                    const registration = getCompleteLessonRegistration(lessonId);
                    if (registration.releaseChannel !== 'trusted-source') {
                        assertGroundedEvaluation(evaluation, lesson);
                    }
                    assertTrustedSourceEvaluation(evaluation, registration.trustedActivityIds);
                }
            }
            // A Reader toggle can arrive while Academy is open. Import it before
            // deriving lesson knowledge so the shared fact remains singular.
            if (evaluation.attempt.conceptIds.some(grammarRuleIdForConcept)) await this.refreshNow();
            const recorded = await this.record.recordMany([
                evaluation.attempt,
                ...(adaptive ? [{
                    kind: 'learning-evidence-recorded' as const,
                    ...(adaptive.eventId ? { eventId: adaptive.eventId } : {}),
                    ...(adaptive.at !== undefined ? { at: adaptive.at } : {}),
                    activityId: evaluation.attempt.activityId,
                    modeId: adaptive.modeId,
                    skill: adaptive.skill,
                    action: adaptive.action,
                    outcome: evaluation.result.outcome,
                    conceptIds: evaluation.attempt.conceptIds,
                    ...(adaptive.sourceId ? { sourceId: adaptive.sourceId } : {}),
                    independent: adaptive.independent,
                }] : []),
                ...grammarKnowledgeEventsForAttempt(evaluation.attempt, this.projection),
            ]);
            mirrorGrammarKnowledgeEvents(recorded);
            await this.ingestAndSchedule(evaluation.reviewSeeds, seed => ({
                activity: evaluation.attempt.activityId,
                ...(seed.sourceQuestionId ? { sourceQuestion: seed.sourceQuestionId } : {}),
            }));
            await this.refreshNow();
            if (!milestone || evaluation.result.outcome !== 'pass') return;
            if (milestone.requiredErrorTag && !evaluation.result.errorTags.includes(milestone.requiredErrorTag)) return;
            if (this.projection.completedScenes.includes(milestone.sceneId)) return;
            if (milestone.unlock) {
                await this.recordEncounterNow({
                    encounterId: milestone.id,
                    sceneId: milestone.sceneId,
                    attendeeIds: [milestone.unlock.characterId],
                });
            }
            await this.record.recordMany([
                ...(milestone.journalLine ? [{
                    kind: 'journal-line-recorded' as const,
                    eventId: `milestone:${milestone.id}:journal-line`,
                    journalLineId: milestone.journalLine.lineId,
                    characterId: milestone.journalLine.characterId,
                    text: milestone.journalLine.text,
                    activityId: evaluation.attempt.activityId,
                    ...(milestone.journalLine.sourceQuestionId
                        ? { sourceQuestionId: milestone.journalLine.sourceQuestionId }
                        : {}),
                }] : []),
                ...(milestone.unlock ? [
                    { kind: 'asset-unlocked' as const, eventId: `milestone:${milestone.id}:asset`, assetId: milestone.unlock.assetId },
                    { kind: 'bond-changed' as const, eventId: `milestone:${milestone.id}:bond`, characterId: milestone.unlock.characterId, delta: milestone.unlock.bondDelta },
                    { kind: 'relationship-chapter-unlocked' as const, eventId: `milestone:${milestone.id}:journal`, characterId: milestone.unlock.characterId, chapter: 1, majorTurn: 'recognition' as const },
                ] : [{ kind: 'scene-completed' as const, eventId: `milestone:${milestone.id}:scene`, sceneId: milestone.sceneId }]),
            ]);
            await this.refreshNow();
        });
    }

    recordWorldPractice(evaluation: ActivityEvaluation): Promise<void> {
        return this.enqueue(async () => {
            if (!evaluation.attempt.activityId.startsWith('activity:world:')) {
                throw new TypeError('World practice evidence must use a world activity id.');
            }
            await this.record.record(evaluation.attempt);
            await this.ingestAndSchedule(evaluation.reviewSeeds, seed => ({
                activity: evaluation.attempt.activityId,
                ...(seed.sourceQuestionId ? { sourceQuestion: seed.sourceQuestionId } : {}),
            }));
            await this.refreshNow();
        });
    }

    seedVocabularyPrerequisite(lessonId: string, seeds: readonly ReviewSeed[]): Promise<void> {
        return this.enqueue(async () => {
            if (!lessonId.startsWith('authored-week:')) {
                if (seeds.length) throw new TypeError('Only authored Moodle lessons can seed a vocabulary prerequisite.');
                return;
            }
            const packageId = lessonId.slice('authored-week:'.length);
            getAuthoredWeekRegistration(packageId);
            for (const seed of seeds) {
                if (!seed.conceptId.startsWith(`concept:${packageId}:source-vocabulary:`)) {
                    throw new TypeError(`Vocabulary prerequisite seed ${seed.id} is not owned by ${lessonId}.`);
                }
                if (seed.reason !== 'new-learning' || !seed.sourceQuestionId?.startsWith('moodle-vocabulary:')) {
                    throw new TypeError(`Vocabulary prerequisite seed ${seed.id} must retain its Moodle source row.`);
                }
            }
            await this.ingestAndSchedule(seeds, seed => ({
                prerequisite: lessonId,
                ...(seed.sourceQuestionId ? { sourceQuestion: seed.sourceQuestionId } : {}),
            }));
            await this.refreshNow();
        });
    }

    recordSupportUse(
        activityId: string,
        supportKind: SupportKind,
        choiceId?: string,
        identity: Readonly<{ eventId?: string; at?: number }> = {},
    ): Promise<void> {
        return this.enqueue(async () => {
            await this.record.record({
                kind: 'support-used',
                ...(identity.eventId ? { eventId: identity.eventId } : {}),
                ...(identity.at !== undefined ? { at: identity.at } : {}),
                activityId,
                supportKind,
                ...(choiceId ? { choiceId } : {}),
            });
            await this.refreshNow();
        });
    }

    history(): Promise<readonly import('../domain/learner-record').LearnerEvent[]> {
        return this.record.history();
    }

    recordAuthoredStoryPractice(practice: AuthoredStoryPracticeEvidence, outcome: 'pass' | 'lapse'): Promise<void> {
        return this.enqueue(async () => {
            await this.record.record({
                kind: 'learning-evidence-recorded',
                activityId: practice.activityId,
                modeId: 'authored-story-practice',
                skill: practice.skill,
                action: practice.action,
                outcome,
                conceptIds: practice.conceptIds,
                sourceId: `story:${practice.chapterId}`,
                independent: true,
            });
            if (outcome === 'pass') {
                await this.review.ingest([practice.reviewSeed]);
                const itemId = reviewItemId(practice.reviewSeed);
                const alreadyScheduled = this.projection.scheduledReviews[itemId]
                    || Object.values(this.projection.scheduledReviews).some(review => review.conceptId === practice.reviewSeed.conceptId);
                if (!alreadyScheduled) await this.record.record({
                    kind: 'review-scheduled' as const,
                    eventId: `review-scheduled:story:${practice.activityId}:${practice.reviewSeed.conceptId}`,
                    reviewItemId: itemId,
                    conceptId: practice.reviewSeed.conceptId,
                    dueAt: this.now(),
                    provenance: {
                        activity: practice.activityId,
                        chapter: practice.chapterId,
                        response: practice.interaction === 'choice' ? 'selected-response' : practice.interaction,
                    },
                });
            }
            await this.refreshNow();
        });
    }

    dueReviews(limit: number): Promise<readonly ReviewQueueItem[]> {
        return this.review.due(limit);
    }

    syllabusState(items: readonly ReviewSyllabusItem[]): Promise<ReviewSyllabusState> {
        return this.review.syllabusState?.(items) ?? Promise.resolve(items.length ? 'new' : 'empty');
    }

    rateReview(itemId: string, rating: ReviewRating): Promise<void> {
        return this.enqueue(async () => {
            await this.review.rate(itemId, rating);
            await this.record.record({ kind: 'review-rated', reviewItemId: itemId, rating });
            await this.refreshNow();
        });
    }

    private async refreshNow(): Promise<void> {
        this.projectionValue = await reconcileGrammarKnowledge(this.record);
    }

    private async ingestAndSchedule(
        seeds: readonly ReviewSeed[],
        provenance: (seed: ReviewSeed) => Readonly<Record<string, string>>,
    ): Promise<void> {
        if (!seeds.length) return;
        await this.review.ingest(seeds);
        const scheduledAt = this.now();
        const unscheduled = new Map<string, ReviewSeed>();
        for (const seed of seeds) {
            const itemId = reviewItemId(seed);
            const legacyItemId = `yomu-local:${seed.id}`;
            const scheduleEventId = `review-scheduled:academy:${seed.id}`;
            const existing = this.projection.scheduledReviews[itemId] ?? this.projection.scheduledReviews[legacyItemId];
            if (existing && (seed.reason !== 'delayed-review' || existing.eventId === scheduleEventId)) continue;
            unscheduled.set(itemId, unscheduled.get(itemId) ?? seed);
        }
        await this.record.recordMany([...unscheduled].map(([itemId, seed]) => ({
            kind: 'review-scheduled' as const,
            eventId: `review-scheduled:academy:${seed.id}`,
            reviewItemId: itemId,
            conceptId: seed.conceptId,
            dueAt: scheduledAt + (seed.schedule?.dueAfterMs ?? 0),
            provenance: provenance(seed),
        })));
    }

    private async recordEncounterNow(encounter: GroundedCharacterEncounter): Promise<void> {
        if (this.projection.completedEncounterIds.includes(encounter.encounterId)) return;
        await this.record.recordMany([
            { kind: 'characters-encountered', eventId: `encounter:${encounter.encounterId}`, ...encounter },
            { kind: 'scene-completed', eventId: `encounter:${encounter.encounterId}:scene`, sceneId: encounter.sceneId },
        ]);
        await this.refreshNow();
    }

    private enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.pending.then(operation);
        this.pending = result.then(() => undefined, () => undefined);
        return result;
    }
}

function authoredWeekOwnsActivity(packageId: string, activityId: string): boolean {
    return activityId.startsWith(`authored:${packageId}/`)
        || activityId.startsWith(`activity:${packageId}-`)
        || activityId.startsWith(`activity:${packageId}:`);
}

function assertTrustedSourceEvaluation(
    evaluation: ActivityEvaluation,
    trustedActivityIds: readonly string[],
): void {
    if (!trustedActivityIds.includes(evaluation.attempt.activityId)) {
        throw new Error(`Activity ${evaluation.attempt.activityId} is not in the trusted-source channel.`);
    }
    if (!evaluation.attempt.conceptIds.length) {
        throw new Error(`Trusted-source activity ${evaluation.attempt.activityId} emitted no learning concepts.`);
    }
}

function assertAdvancedEvaluation(
    evaluation: ActivityEvaluation,
    activity: Readonly<{
        id: string;
        sourceQuestionId?: string;
        conceptIds: readonly string[];
        responseKind: string;
    }>,
    lessonId: string,
): void {
    if (evaluation.attempt.activityId !== activity.id
        || evaluation.attempt.sourceQuestionId !== activity.sourceQuestionId
        || evaluation.attempt.responseKind !== activity.responseKind
        || !sameStrings(evaluation.attempt.conceptIds, activity.conceptIds)) {
        throw new TypeError(`Activity ${evaluation.attempt.activityId} does not match ${lessonId}.`);
    }
    if (evaluation.reviewSeeds.some(seed => seed.sourceQuestionId !== activity.sourceQuestionId
        || !activity.conceptIds.includes(seed.conceptId))) {
        throw new TypeError(`Activity ${evaluation.attempt.activityId} emitted review evidence outside ${lessonId}.`);
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
