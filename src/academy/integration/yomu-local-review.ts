import { LocalYomuSrsRepository } from '../../reader/srs/local-yomu';
import type { YomuSrsReviewable } from '../../reader/srs/types';
import type { ReviewSeed } from '../domain/activity-runtime';
import type { ReviewRating } from '../domain/learner-record';
import type { ReviewQueueItem, ReviewQueueService } from './yomu-bridge';

/** Mounts Academy review evidence into Yomu's canonical local SRS repository. */
export function createYomuLocalReviewService(
    repository = new LocalYomuSrsRepository(),
    now: () => number = Date.now,
): ReviewQueueService {
    const cards = new Map<string, YomuSrsReviewable>();

    return {
        async due(limit) {
            const snapshot = await repository.queue(Math.max(50, Math.floor(limit)));
            const due = snapshot.cards
                .filter(card => (card.dueAt ?? 0) <= now())
                .slice(0, Math.max(0, Math.floor(limit)));
            due.forEach(card => cards.set(card.providerCardId, card));
            return due.map(toQueueItem);
        },
        async ingest(seeds) {
            if (!seeds.length) return;
            await repository.importBatch({
                source: 'academy-activity-runtime:v1',
                importedAt: now(),
                items: seeds.map(toImportItem),
            });
        },
        async rate(itemId, rating) {
            let card = cards.get(itemId);
            if (!card) {
                const queue = await repository.queue(500);
                card = queue.cards.find(candidate => candidate.providerCardId === itemId);
            }
            if (!card) throw new Error(`Unknown Yomu review item: ${itemId}`);
            await repository.review({ card, grade: grade(rating) });
        },
    };
}

function toImportItem(seed: ReviewSeed) {
    return {
        expression: seed.content.expression,
        reading: seed.content.reading,
        meanings: [...seed.content.meanings],
        sentence: seed.content.sentence,
        sourceProviderId: 'yomu-local' as const,
        sourceCardId: seed.id,
        tags: [
            'academy',
            `academy:concept:${seed.conceptId}`,
            `academy:reason:${seed.reason}`,
            ...(seed.sourceQuestionId ? [`academy:source-question:${seed.sourceQuestionId}`] : []),
        ],
    };
}

function toQueueItem(card: YomuSrsReviewable): ReviewQueueItem {
    return {
        id: card.providerCardId,
        expression: card.expression,
        ...(card.reading ? { reading: card.reading } : {}),
        ...(card.meanings[0]?.glosses[0] ? { meaning: card.meanings[0].glosses[0] } : {}),
        dueAt: card.dueAt ?? 0,
        provenance: { provider: card.providerId },
    };
}

function grade(rating: ReviewRating): 'again' | 'hard' | 'good' | 'easy' {
    return rating;
}
