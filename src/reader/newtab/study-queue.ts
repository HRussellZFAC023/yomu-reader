import { cardHighlightTargets, normalizedJapaneseCardReading } from '../cards/highlight';
import { cardPronunciationReading } from '../popup/pitch';
import { cardKey } from './index';
import type { JPDBCard } from '../app/types';

export function normalizeNewTabCard(card: JPDBCard): JPDBCard {
    const reading = newTabCardReading(card);
    return reading === card.reading ? card : { ...card, reading };
}

export function newTabCardReading(card: JPDBCard): string {
    return normalizedJapaneseCardReading(card.spelling, cardPronunciationReading(card) || card.reading);
}

export function newTabCardOptionalReading(card: JPDBCard): string {
    const reading = newTabCardReading(card);
    return reading && reading !== card.spelling ? reading : '';
}

export function newTabCardHighlightTargets(card: JPDBCard): string[] {
    return cardHighlightTargets(card);
}

function shouldShowInStudyQueue(card: JPDBCard): boolean {
    if (card.source === 'local' || card.source === 'fallback') return true;
    if (card.reviewSource === 'jpdb-live') return true;
    const states = card.cardState ?? [];
    return states.some(state => state === 'new' || state === 'learning' || state === 'due' || state === 'failed' || state === 'locked' || state === 'not-in-deck');
}

export function selectNewTabStudyPool(cards: JPDBCard[]): JPDBCard[] {
    return cards.filter(shouldShowInStudyQueue);
}

export function sentenceForCard(card: JPDBCard): string {
    const sentence = card.sentence?.replace(/\s+/g, ' ').trim();
    if (sentence) return sentence;
    const withReading = card.wordWithReading?.replace(/\s+/g, ' ').trim();
    if (withReading && withReading.includes(card.spelling)) return withReading;
    return card.spelling;
}

export function promoteCardByKey(cards: JPDBCard[], key: string): JPDBCard[] {
    if (!key) return cards;
    const index = cards.findIndex(card => cardKey(card) === key);
    if (index <= 0) return cards;
    const promoted = [...cards];
    const [card] = promoted.splice(index, 1);
    if (card) promoted.unshift(card);
    return promoted;
}
