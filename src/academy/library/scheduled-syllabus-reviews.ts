import {
    libraryVocabularyReviewSeeds,
    type LibraryVocabularySheet,
} from '../content/library-vocabulary-sheet';
import type { ReviewSeed } from '../domain/activity-runtime';
import type { ReviewQueueItem } from '../integration/yomu-bridge';

export const DEFAULT_LIBRARY_REVIEW_LIMIT = 50;

export interface LibrarySyllabusReviewScheduler {
    seedVocabularyPrerequisite(lessonId: string, seeds: readonly ReviewSeed[]): Promise<void>;
    dueReviews(limit: number): Promise<readonly ReviewQueueItem[]>;
}

/** Seeds a verified Library syllabus before reading Yomu's scheduler-owned queue. */
export async function scheduleLibrarySyllabusReviews(
    scheduler: LibrarySyllabusReviewScheduler,
    sheet: LibraryVocabularySheet,
    limit = DEFAULT_LIBRARY_REVIEW_LIMIT,
): Promise<readonly ReviewQueueItem[]> {
    const queueLimit = reviewLimit(limit);
    await scheduler.seedVocabularyPrerequisite(
        `authored-week:${sheet.lessonId}`,
        libraryVocabularyReviewSeeds(sheet),
    );
    return scheduler.dueReviews(queueLimit);
}

function reviewLimit(value: number): number {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new RangeError('Library review limit must be a positive integer.');
    }
    return value;
}
