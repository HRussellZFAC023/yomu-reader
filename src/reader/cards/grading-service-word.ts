import type { JPDBCard, JPDBToken } from '../app/types';

/**
 * Finding a word on a grading service that has not identified it (ADR-0019).
 * Only an exact spelling AND reading match counts: a homograph's other reading
 * is another word, and a word whose reading is unknown cannot be matched safely.
 */
function sameWordOnService(word: JPDBCard, tokens: readonly JPDBToken[], identifies: (card: JPDBCard) => boolean): JPDBCard | null {
    const spelling = word.spelling.trim();
    const reading = word.reading.trim();
    if (!spelling || !reading) return null;
    return tokens.find(({ card }) => card.spelling.trim() === spelling && card.reading.trim() === reading && identifies(card))?.card ?? null;
}

/** One parse request for every matchable word; null where the service has no exact match. */
export async function findWordsOnService(
    words: readonly JPDBCard[],
    parse: (terms: string[]) => Promise<JPDBToken[][]>,
    identifies: (card: JPDBCard) => boolean,
): Promise<Array<JPDBCard | null>> {
    const matchable = words.filter(word => word.spelling.trim() && word.reading.trim());
    const parsed = matchable.length ? await parse(matchable.map(word => word.spelling.trim())) : [];
    return words.map(word => sameWordOnService(word, parsed[matchable.indexOf(word)] ?? [], identifies));
}
