import { readerWordSurfaceText } from '../dom/index';
import { normalizedLookupText } from '../lookup/text-helpers';
import type { JPDBCard } from '../app/types';

export function renderedWordLookupText(word: HTMLElement): string {
    return normalizedLookupText(word.dataset.expression || readerWordSurfaceText(word));
}

function renderedWordCacheMatches(word: HTMLElement, card: JPDBCard): boolean {
    const expression = normalizedLookupText(word.dataset.expression ?? '');
    const reading = normalizedLookupText(word.dataset.reading ?? '');
    if (expression && !cardMatchesRenderedLookupValue(card, expression)) return false;
    if (reading && card.reading && !cardMatchesRenderedLookupValue(card, reading)) return false;
    return true;
}

export function cardMatchesRenderedLookupValue(card: JPDBCard, value: string): boolean {
    return normalizedLookupText(card.spelling) === value || normalizedLookupText(card.reading) === value;
}

export function renderedWordCardForLookup(word: HTMLElement, cachedCard: JPDBCard | undefined): JPDBCard | undefined {
    if (cachedCard && !renderedWordCacheMatches(word, cachedCard)) return undefined;
    if (!cachedCard) return undefined;
    const reading = normalizedLookupText(word.dataset.reading ?? '');
    const pitchAccent = renderedWordPitchAccent(word.dataset.pitchAccent ?? '');
    const explicitSpelling = normalizedLookupText(word.dataset.expression || '');
    if (explicitSpelling && explicitSpelling !== cachedCard.spelling) cachedCard.spelling = explicitSpelling;
    if (reading && reading !== cachedCard.reading) cachedCard.reading = reading;
    if (pitchAccent.length && !cachedCard.pitchAccent.length) cachedCard.pitchAccent = pitchAccent;
    return cachedCard;
}

function renderedWordPitchAccent(value: string): string[] {
    return value.split('|')
        .map(pattern => pattern.trim())
        .filter(pattern => /^[HL]+$/u.test(pattern));
}

// Mass review (Jiten v1.2.x parity): the on-screen due/learning Jiten words,
// deduped by identity, viewport-visible only.
const MASS_REVIEW_STATES = new Set(['due', 'failed', 'learning', 'new']);

export function visibleJitenReviewableWords(): HTMLElement[] {
    const seen = new Set<string>();
    return Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-word[data-card-source="jiten"]'))
        .filter(word => {
            const state = word.dataset.cardState ?? '';
            if (!MASS_REVIEW_STATES.has(state)) return false;
            const key = `${word.dataset.vid}:${word.dataset.sid}`;
            if (seen.has(key) || !(Number(word.dataset.vid) > 0)) return false;
            const rect = word.getBoundingClientRect();
            const visible = rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0 && rect.height > 0;
            if (!visible) return false;
            seen.add(key);
            return true;
        });
}

export function jitenWordCardForMassReview(word: HTMLElement): JPDBCard {
    return {
        vid: Number(word.dataset.vid),
        sid: Number(word.dataset.sid),
        rid: 0,
        spelling: word.dataset.expression || readerWordSurfaceText(word),
        reading: word.dataset.reading ?? '',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: word.dataset.cardState ? [word.dataset.cardState as JPDBCard['cardState'][number]] : [],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jiten',
        jitenWordId: Number(word.dataset.vid),
        jitenReadingIndex: Number(word.dataset.sid),
    };
}
