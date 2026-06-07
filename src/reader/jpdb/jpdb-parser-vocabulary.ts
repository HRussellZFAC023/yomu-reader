import { normalizeCardStates } from '../cards/state';
import { normalizePitchPatternsForReading } from '../lookup/pitch-accent';
import type { JPDBCard, JPDBRawVocabulary } from '../app/types';

export function jpdbVocabularyToCards(vocabulary: JPDBRawVocabulary[]): JPDBCard[] {
    const cards = vocabulary.map(([
        vid,
        sid,
        rid,
        spelling,
        reading,
        frequencyRank,
        partOfSpeech,
        meaningsChunks,
        meaningsPartOfSpeech,
        cardState,
        pitchAccent,
    ]): JPDBCard => ({
        vid,
        sid,
        rid,
        spelling,
        reading,
        frequencyRank,
        partOfSpeech,
        meanings: meaningsChunks.map((glosses, index) => ({
            glosses,
            partOfSpeech: meaningsPartOfSpeech[index] ?? [],
        })),
        cardState: normalizeCardStates(cardState),
        pitchAccent: normalizePitchPatternsForReading(pitchAccent, reading),
        wordWithReading: null,
        source: 'jpdb' as const,
    }));
    return cards;
}
