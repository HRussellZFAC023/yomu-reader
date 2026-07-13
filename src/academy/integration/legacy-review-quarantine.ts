import { LocalYomuSrsRepository } from '../../reader/srs/local-yomu';
import {
    createLearnerRecord,
    type LearnerEvent,
    type LearnerEventRepository,
} from '../domain/learner-record';

/** Stage-1 activities that wrote Study cards before complete-lesson grounding existed. */
export const LEGACY_UNGROUNDED_REVIEW_SEED_IDS = Object.freeze([
    'review:aakash-rainy-directions',
    'review:lesson-zero-repeat',
    'review:classroom-repair-repeat:concept:classroom-repair-repeat',
    'review:language-lab-repeat:concept:classroom-repair-repeat',
    'review:band-entry:n5:concept:n5-time-reading',
    'review:band-entry:n4:concept:n4-conditional-plan',
    'review:band-entry:n3:concept:n3-hearsay-inference',
    'review:band-entry:n2:concept:n2-qualified-stance',
    'review:band-entry:n1:concept:n1-implicit-motive',
]);

export interface LegacyReviewQuarantineResult {
    readonly provenanceRemoved: number;
    readonly cardsDeleted: number;
    readonly cardsRetained: number;
    readonly schedulesNeutralized: number;
}

export interface LegacyReviewQuarantineOptions {
    readonly reviewRepository?: LocalYomuSrsRepository;
    readonly learnerEvents?: LearnerEventRepository;
}

/**
 * Remove only known pre-grounding provenance. Independent or reviewed cards
 * remain in Study; untouched legacy cards without provenance are never guessed.
 */
export async function quarantineLegacyUngroundedReviews(
    options: LegacyReviewQuarantineOptions = {},
): Promise<LegacyReviewQuarantineResult> {
    const repository = options.reviewRepository ?? new LocalYomuSrsRepository();
    let provenanceRemoved = 0;
    let cardsDeleted = 0;
    let cardsRetained = 0;
    for (const seedId of LEGACY_UNGROUNDED_REVIEW_SEED_IDS) {
        const result = await repository.removeAcademyVocabularyProvenance(
            '',
            `academy:review-seed:${seedId}`,
        );
        if (!result.provenanceRemoved) continue;
        provenanceRemoved += 1;
        if (result.cardDeleted) cardsDeleted += 1;
        else cardsRetained += 1;
    }
    const schedulesNeutralized = options.learnerEvents
        ? await neutralizeLegacyReviewSchedules(options.learnerEvents)
        : 0;
    return { provenanceRemoved, cardsDeleted, cardsRetained, schedulesNeutralized };
}

function legacyScheduleEventId(seedId: string): string {
    return `review-scheduled:yomu-local:${seedId}`;
}

function neutralizationEventId(scheduledEventId: string): string {
    return `review-schedule-neutralized:${scheduledEventId}`;
}

async function neutralizeLegacyReviewSchedules(repository: LearnerEventRepository): Promise<number> {
    const history = await repository.readAll();
    const legacyScheduleIds = new Set(LEGACY_UNGROUNDED_REVIEW_SEED_IDS.map(legacyScheduleEventId));
    const existingNeutralizations = new Set(history.flatMap(event =>
        event.kind === 'review-schedule-neutralized' ? [event.scheduledEventId] : []));
    const schedules = history.filter((event): event is Extract<LearnerEvent, { kind: 'review-scheduled' }> =>
        event.kind === 'review-scheduled'
        && legacyScheduleIds.has(event.eventId)
        && !existingNeutralizations.has(event.eventId));
    if (!schedules.length) return 0;

    const record = createLearnerRecord({ repository });
    await record.recordMany(schedules.map(schedule => ({
        kind: 'review-schedule-neutralized' as const,
        eventId: neutralizationEventId(schedule.eventId),
        scheduledEventId: schedule.eventId,
        reason: 'legacy-ungrounded-academy' as const,
    })));
    return schedules.length;
}
