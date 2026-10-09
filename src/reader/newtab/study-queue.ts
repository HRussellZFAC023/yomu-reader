import { cardHighlightTargets } from '../cards/highlight';
import { activeLearningTarget } from '../languages/target-runtime';
import { canonicalLanguageTag, languageSubtag } from '../languages/locale';
import { cardPronunciationReading } from '../popup/pitch';
import { cardKey } from './index';
import type { JPDBCard } from '../app/types';
import type { LearningTargetModule } from '../languages/types';

export function normalizeNewTabCard(card: JPDBCard): JPDBCard {
    const reading = newTabCardReading(card);
    return reading === card.reading ? card : { ...card, reading };
}

export function newTabCardReading(card: JPDBCard): string {
    return newTabCardTarget(card).normalizeReading(card.spelling, cardPronunciationReading(card) || card.reading);
}

export function newTabCardOptionalReading(card: JPDBCard): string {
    const reading = newTabCardReading(card);
    return reading && reading !== card.spelling ? reading : '';
}

export function newTabCardHighlightTargets(card: JPDBCard): string[] {
    return cardHighlightTargets(card);
}

/** Every card Study shows is Japanese, so morphology and typography are Japanese. */
export function newTabCardTarget(_card: Pick<JPDBCard, 'language'>): LearningTargetModule {
    return activeLearningTarget();
}

/**
 * Study shows Japanese cards only. A card an earlier Yomu stored for another
 * language stays in storage untouched; it is simply not listed.
 */
export function newTabCardMatchesActiveTarget(card: Pick<JPDBCard, 'language'>): boolean {
    return newTabCardIdentityLanguage(card) === activeLearningTarget().language;
}

/** Missing identity language is legacy Japanese. */
export function newTabCardIdentityLanguage(card: Pick<JPDBCard, 'language'>): string {
    if (!card.language || card.language === 'ja') return 'ja';
    return languageSubtag(canonicalLanguageTag(card.language)) ?? card.language;
}

function shouldShowInStudyQueue(card: JPDBCard): boolean {
    if (card.source === 'local' || card.source === 'fallback') return true;
    if (card.reviewSource === 'jpdb-live') return true;
    const states = card.cardState ?? [];
    return states.some(state => state === 'new' || state === 'learning' || state === 'due' || state === 'failed' || state === 'locked' || state === 'not-in-deck');
}

export function selectNewTabStudyPool(cards: JPDBCard[]): JPDBCard[] {
    return cards.filter(newTabCardMatchesActiveTarget).filter(shouldShowInStudyQueue);
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
