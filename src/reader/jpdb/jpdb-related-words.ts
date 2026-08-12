import { readerWordSurfaceText } from '../dom';
import type { JPDBCard, JPDBToken } from '../app/types';
import { renderedWordNumericIdentity } from '../dom/rendered-word-policy';

const JPDB_RELATED_WORD_SELECTOR = '.jpdb-reader-word[data-jpdb-reader-related-word="true"]';
export const JPDB_RELATED_WORD_STATE = 'not-in-deck';
export const JPDB_RELATED_WORD_PITCH_CLASS = 'unknown';

export interface RenderedJpdbRelatedWord {
    word: HTMLElement;
    token: JPDBToken;
}

export function renderedJpdbRelatedWords(root: ParentNode): RenderedJpdbRelatedWord[] {
    const words = root instanceof HTMLElement && root.matches(JPDB_RELATED_WORD_SELECTOR)
        ? [root, ...Array.from(root.querySelectorAll<HTMLElement>(JPDB_RELATED_WORD_SELECTOR))]
        : Array.from(root.querySelectorAll<HTMLElement>(JPDB_RELATED_WORD_SELECTOR));
    return words
        // Headword occurrences highlighted inside example sentences reuse the
        // passive-word markup but are not used-in vocabulary, so they must not
        // be enriched/counted as related words.
        .filter(word => !word.closest('.jpdb-reader-jpdb-example, .jpdb-reader-jpdb-examples-group'))
        .map(word => renderedJpdbRelatedWord(word))
        .filter((entry): entry is RenderedJpdbRelatedWord => entry !== null);
}

function renderedJpdbRelatedWord(word: HTMLElement): RenderedJpdbRelatedWord | null {
    const card = renderedJpdbRelatedWordCard(word);
    if (!card) return null;
    const surface = readerWordSurfaceText(word).trim() || card.spelling;
    return {
        word,
        token: {
            card,
            start: 0,
            end: surface.length,
            length: surface.length,
            rubies: [],
            pitchClass: word.dataset.pitchClass ?? '',
            sentence: word.dataset.sentence || surface,
        },
    };
}

function renderedJpdbRelatedWordCard(word: HTMLElement): JPDBCard | null {
    const { vid, sid } = renderedWordNumericIdentity(word);
    const spelling = firstRenderedWordText(word.dataset.expression, readerWordSurfaceText(word));
    const valid = [Number.isFinite(vid), vid > 0, Number.isFinite(sid), sid >= 0, Boolean(spelling)].every(Boolean);
    if (!valid) return null;
    return {
        vid,
        sid,
        rid: 0,
        spelling,
        reading: renderedWordTextOrFallback(word.dataset.reading, spelling),
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: [JPDB_RELATED_WORD_STATE],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
        sentence: renderedWordTextOrFallback(word.dataset.sentence, spelling),
    };
}

function firstRenderedWordText(...values: Array<string | undefined>): string {
    return values.map(value => value?.trim() ?? '').find(Boolean) ?? '';
}

function renderedWordTextOrFallback(value: string | undefined, fallback: string): string {
    return firstRenderedWordText(value, fallback);
}
