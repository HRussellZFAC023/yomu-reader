import { normalizeCardStates } from '../cards/state';
import { normalizePitchPatternsForReading } from '../lookup/pitch-accent';
import type { JPDBCard, JPDBRawVocabulary } from '../app/types';

export function jpdbVocabularyToCards(vocabulary: JPDBRawVocabulary[]): JPDBCard[] {
    if (!Array.isArray(vocabulary)) return [];
    const cards: JPDBCard[] = [];
    for (const item of vocabulary) {
        if (!Array.isArray(item)) continue;
        const [
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
            dueAt,
            sentence,
        ] = item;
        cards.push({
            vid,
            sid,
            rid,
            spelling,
            reading,
            frequencyRank,
            partOfSpeech,
            meanings: (meaningsChunks ?? []).map((glosses, index) => ({
                glosses,
                partOfSpeech: meaningsPartOfSpeech?.[index] ?? [],
            })),
            cardState: normalizeCardStates(cardState),
            pitchAccent: normalizePitchPatternsForReading(pitchAccent, reading),
            dueAt: typeof dueAt === 'number' && Number.isFinite(dueAt) ? dueAt : null,
            wordWithReading: null,
            sentence: typeof sentence === 'string' && sentence.trim() ? sentence : undefined,
            source: 'jpdb' as const,
        });
    }
    return cards;
}
