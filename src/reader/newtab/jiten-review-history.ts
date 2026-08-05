import type { JPDBCard } from '../app/types';
import type { JitenRecentReview } from '../dictionaries/jiten';

/** Latest review time per Jiten word identity from a recent-reviews page. */
export function jitenLatestReviewTimes(reviews: JitenRecentReview[]): Map<string, number> {
    const latest = new Map<string, number>();
    for (const review of reviews) {
        if (!Number.isFinite(review.reviewedAt)) continue;
        const key = jitenReviewKey(review.wordId, review.readingIndex);
        const existing = latest.get(key);
        if (existing === undefined || review.reviewedAt > existing) latest.set(key, review.reviewedAt);
    }
    return latest;
}

export function jitenHistoryCardKey(card: JPDBCard): string {
    const wordId = typeof card.jitenWordId === 'number' ? card.jitenWordId : card.source === 'jiten' ? card.vid : Number.NaN;
    const readingIndex = typeof card.jitenReadingIndex === 'number' ? card.jitenReadingIndex : card.source === 'jiten' ? card.sid : Number.NaN;
    return jitenReviewKey(wordId, readingIndex);
}

function jitenReviewKey(wordId: number, readingIndex: number): string {
    return Number.isFinite(wordId) && Number.isFinite(readingIndex) ? `${wordId}:${readingIndex}` : '';
}
