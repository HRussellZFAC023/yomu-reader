import { readerWordSurfaceText } from '../dom/index';
import { normalizedLookupText } from '../lookup/text-helpers';
import type { JPDBCard } from '../app/types';
import { renderedWordsInRoot } from '../dom/rendered-word-state';
import { renderedWordPrivateValue } from '../dom/rendered-word-private-state';

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
    return renderedWordsInRoot(document)
        .filter(word => {
            const key = visibleJitenReviewIdentity(word);
            if (!key || seen.has(key)) return false;
            if (!elementIsInViewport(word)) return false;
            seen.add(key);
            return true;
        });
}

function visibleJitenReviewIdentity(word: HTMLElement): string | null {
    if (renderedWordPrivateValue(word, 'cardSource') !== 'jiten') return null;
    if (!MASS_REVIEW_STATES.has(String(renderedWordPrivateValue(word, 'cardState')))) return null;
    const vid = Number(renderedWordPrivateValue(word, 'vid'));
    if (!(vid > 0)) return null;
    return `${vid}:${Number(renderedWordPrivateValue(word, 'sid'))}`;
}

function elementIsInViewport(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0
        && rect.top < window.innerHeight
        && rect.width > 0
        && rect.height > 0;
}

export function jitenWordCardForMassReview(word: HTMLElement): JPDBCard {
    const vid = Number(renderedWordPrivateValue(word, 'vid'));
    const sid = Number(renderedWordPrivateValue(word, 'sid'));
    const cardState = renderedWordPrivateValue(word, 'cardState');
    return {
        vid,
        sid,
        rid: 0,
        spelling: word.dataset.expression || readerWordSurfaceText(word),
        reading: word.dataset.reading ?? '',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: cardState ? [cardState as JPDBCard['cardState'][number]] : [],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jiten',
        jitenWordId: vid,
        jitenReadingIndex: sid,
    };
}

export interface UnconfirmedRenderedWordSpan {
    sentence: string;
    start: number;
    end: number;
}

/**
 * The token range a rendered word still holds from an UNCONFIRMED parse, or
 * null when the word's card was confirmed by a dictionary or provider. The
 * span authority re-resolves only these: a fallback card means segmentation
 * guessed the boundary, and the guess may cover a fragment of the real word.
 */
export function unconfirmedRenderedWordSpan(
    word: HTMLElement,
    card: JPDBCard | undefined,
    context: { sentence?: string },
): UnconfirmedRenderedWordSpan | null {
    // A card a dictionary or provider confirmed needs no re-resolution; a
    // fallback card or a cache miss (no card at all) is a span nothing ever
    // vouched for, and interaction is the moment to resolve it properly.
    if (card?.source && card.source !== 'fallback') return null;
    const sentence = context.sentence || word.dataset.sentence || '';
    if (!sentence) return null;
    const start = Number(word.dataset.tokenStart);
    const end = Number(word.dataset.tokenEnd);
    if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
    if (start < 0 || end <= start || end > sentence.length) return null;
    return { sentence, start, end };
}
