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
        async syllabusState(items) {
            if (!items.length) return 'empty';
            const progress = await repository.academySyllabusProgress(items);
            return progress.unseeded ? 'new' : 'cleared';
        },
        async ingest(seeds) {
            if (!seeds.length) return;
            await Promise.all(seeds.map(seed => repository.collectAcademyVocabulary({
                expression: seed.content.expression,
                reading: seed.content.reading,
                meanings: seed.content.meanings,
                sentence: seed.content.sentence,
                provenance: {
                    id: reviewSeedProvenanceId(seed),
                    kind: 'review-seed',
                    conceptId: seed.conceptId,
                    sourceId: seed.sourceQuestionId,
                    reason: seed.reason,
                },
            })));
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

function reviewSeedProvenanceId(seed: ReviewSeed): string {
    return `academy:review-seed:${seed.id}`;
}

function toQueueItem(card: YomuSrsReviewable): ReviewQueueItem {
    const provenance = academyProvenance(card.raw);
    return {
        id: card.providerCardId,
        expression: card.expression,
        ...(card.reading ? { reading: card.reading } : {}),
        ...(card.meanings[0]?.glosses[0] ? { meaning: card.meanings[0].glosses[0] } : {}),
        dueAt: card.dueAt ?? 0,
        provenance: { provider: card.providerId, ...provenance },
    };
}

function academyProvenance(raw: unknown): Record<string, string> {
    if (!raw || typeof raw !== 'object') return {};
    const records = (raw as { academyProvenance?: unknown }).academyProvenance;
    if (!records || typeof records !== 'object') return {};
    const first = Object.values(records as Record<string, unknown>)
        .find(value => value && typeof value === 'object') as Record<string, unknown> | undefined;
    if (!first) return {};
    const sourceId = text(first.sourceId);
    const activityId = text(first.activityId);
    return {
        ...(sourceId ? { sourceId } : {}),
        ...(activityId ? { lesson: activityId } : {}),
    };
}

function text(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function grade(rating: ReviewRating): 'again' | 'hard' | 'good' | 'easy' {
    return rating;
}
