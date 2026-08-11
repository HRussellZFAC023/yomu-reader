import { cardHighlightTargets } from '../cards/highlight';
import {
    activeLearningTarget,
    defaultLearningTargetModule,
    learningTargetModuleFor,
} from '../languages/target-runtime';
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

/** Resolve morphology and typography from the card identity, not ambient UI state. */
export function newTabCardTarget(card: Pick<JPDBCard, 'language'>): LearningTargetModule {
    return learningTargetModuleFor(newTabCardIdentityLanguage(card)) ?? defaultLearningTargetModule();
}

export function newTabCardMatchesActiveTarget(card: Pick<JPDBCard, 'language'>): boolean {
    return newTabCardIdentityLanguage(card) === activeLearningTarget().language;
}

/** Missing identity language is legacy Japanese, even while another target is active. */
export function newTabCardIdentityLanguage(card: Pick<JPDBCard, 'language'>): string {
    return learningTargetModuleFor(card.language ?? defaultLearningTargetModule().language)?.language
        ?? defaultLearningTargetModule().language;
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
