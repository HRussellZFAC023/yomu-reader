import { describe, expect, it } from 'vitest';
import { autoReviewSourceResults, emptyNewTabLoadAccumulator, newTabLoadResult } from '../../src/reader/newtab/source-orchestrator';
import type { JPDBCard } from '../../src/reader/app/types';
import type { NewTabLoadResult } from '../../src/reader/newtab/source-orchestrator';

function orchestratorCard(spelling: string, reading: string, extras: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 1,
        sid: 1,
        rid: 1,
        spelling,
        reading,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['new'],
        pitchAccent: [],
        wordWithReading: null,
        ...extras,
    } as JPDBCard;
}

function loadResult(cards: JPDBCard[], sourceLabel: string): NewTabLoadResult {
    return { cards, sourceLabel, reviewCountMode: true };
}

describe('new tab source orchestrator', () => {
    it('dedupes the same card across providers when readings differ only by kana script', () => {
        const jpdb = loadResult([orchestratorCard('ベッド', 'ベッド')], 'JPDB');
        const anki = loadResult([
            orchestratorCard('ベッド', 'べっど', { ankiNoteId: 42 }),
            orchestratorCard('猫', 'ねこ', { ankiNoteId: 43 }),
        ], 'Anki');

        const [mergedJpdb, remainingAnki] = autoReviewSourceResults(jpdb, anki);

        expect(mergedJpdb.cards).toHaveLength(1);
        expect(mergedJpdb.cards[0]?.ankiNoteId).toBe(42);
        expect(remainingAnki.cards.map(card => card.spelling)).toEqual(['猫']);
    });

    it('carries the practice-word fallback notice through to the load result', () => {
        const accumulator = emptyNewTabLoadAccumulator();
        accumulator.fallbackNotice = true;
        accumulator.labels.push('Study words');

        const result = newTabLoadResult(accumulator, 'en');

        expect(result.fallbackNotice).toBe(true);
        expect(result.sourceLabel).toBe('Study words');
    });

    it('does not flag results that came from the requested review sources', () => {
        const result = newTabLoadResult(emptyNewTabLoadAccumulator(), 'en');
        expect(result.fallbackNotice).toBeUndefined();
    });
});
