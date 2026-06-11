import { describe, expect, it } from 'vitest';

import { shouldReplaceKanjiStudyCard } from '../../src/reader/newtab/card-selection';
import type { CardState, JPDBCard } from '../../src/reader/app/types';

function kanjiCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 100,
        sid: 0,
        rid: 0,
        spelling: '語',
        reading: 'ご',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'] as CardState[],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
        ...overrides,
    };
}

describe('shouldReplaceKanjiStudyCard', () => {
    it('still prefers higher-priority sources outright', () => {
        const liveReview = kanjiCard({ reviewSource: 'jpdb-live' });
        const plainJpdb = kanjiCard();
        expect(shouldReplaceKanjiStudyCard(liveReview, plainJpdb)).toBe(true);
        expect(shouldReplaceKanjiStudyCard(plainJpdb, liveReview)).toBe(false);
    });

    it('keeps the JPDB locked kanji card when same-priority candidates collide on one kanji', () => {
        // JPDB locked kanji are scheduled SRS items; a word-derived duplicate
        // must not erase the real locked state from the kanji study queue.
        const locked = kanjiCard({ cardState: ['locked'] as CardState[] });
        const derived = kanjiCard({ vid: -42 });
        expect(shouldReplaceKanjiStudyCard(locked, derived)).toBe(true);
        expect(shouldReplaceKanjiStudyCard(derived, locked)).toBe(false);
    });
});
