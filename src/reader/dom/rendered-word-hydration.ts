import type { JPDBCard } from '../app/types';
import { getPitchClass } from '../jpdb/jpdb-parser';
import { renderedFallbackVocabularyCacheKey } from './rendered-word-state';

export interface CachedRenderedWordHydration {
    card: JPDBCard;
    pitchClass: string;
}

/** Resolves cached public detail without consulting hostile identity attributes. */
export function cachedRenderedWordHydration(
    word: HTMLElement,
    cache: ReadonlyMap<string, JPDBCard>,
): CachedRenderedWordHydration | null {
    const card = cache.get(renderedFallbackVocabularyCacheKey(word));
    if (![Boolean(word.dataset.expression), Boolean(card)].every(Boolean)) return null;
    return { card: card!, pitchClass: publicVocabularyPitchClass(card!) };
}

function publicVocabularyPitchClass(card: JPDBCard): string {
    const reading = [card.reading, card.spelling].find(Boolean) ?? '';
    return getPitchClass(card.pitchAccent, reading) || 'unknown';
}
