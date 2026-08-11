import { isJitenSrsCard } from './review-targets';
import type { JPDBCard } from '../app/types';

const CONSUMED_REVIEW_SOURCES = new Set<JPDBCard['reviewSource']>(['bunpro-api', 'wanikani-api']);
const CONSUMED_CARD_SOURCES = new Set<JPDBCard['source']>(['bunpro', 'wanikani']);

export interface NewTabUndoableReview {
    readonly card: JPDBCard;
    readonly at: number;
    readonly serverUndo: boolean;
    readonly counted: boolean;
}

/** Bunpro cards are scoped to one live review session and cannot be retried. */
export function isSessionBunproCard(card: JPDBCard): boolean {
    return card.source === 'bunpro' || card.reviewSource === 'bunpro-api';
}

/** Records undo only when replaying the card cannot duplicate a consumed review. */
export function newTabUndoableReview(
    card: JPDBCard,
    isCorrection: boolean,
    canUndoJiten: boolean,
    at = Date.now(),
): NewTabUndoableReview | undefined {
    if (reviewConsumesProviderObligation(card)) return undefined;
    return {
        card,
        at,
        serverUndo: isJitenSrsCard(card) && canUndoJiten,
        counted: !isCorrection,
    };
}

function reviewConsumesProviderObligation(card: JPDBCard): boolean {
    return CONSUMED_REVIEW_SOURCES.has(card.reviewSource)
        || CONSUMED_CARD_SOURCES.has(card.source);
}
