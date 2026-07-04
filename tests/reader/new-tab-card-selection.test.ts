import { describe, expect, it } from 'vitest';

import { newTabDueSummary, shouldReplaceKanjiStudyCard } from '../../src/reader/newtab/card-selection';
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

describe('newTabDueSummary', () => {
    it('splits the scheduled pile into due/new words and kanji (JPDB Learn parity)', () => {
        const cards = [
            kanjiCard({ spelling: '日本語', reading: 'にほんご', cardState: ['due'] as CardState[] }),
            kanjiCard({ spelling: '読む', reading: 'よむ', cardState: ['learning'] as CardState[] }),
            kanjiCard({ spelling: '記', reading: 'き', cardState: ['locked'] as CardState[] }),
            kanjiCard({ spelling: '語', reading: 'ご', cardState: ['new'] as CardState[] }),
            kanjiCard({ spelling: '見る', reading: 'みる', cardState: ['new'] as CardState[] }),
            // known cards are not part of the available pile
            kanjiCard({ spelling: '食べる', reading: 'たべる', cardState: ['known'] as CardState[] }),
        ];
        expect(newTabDueSummary(cards)).toEqual({ dueWords: 2, dueKanji: 1, newWords: 1, newKanji: 1 });
    });
});

describe('dedupeWords dual-provider merge (UT-60)', () => {
    it('keeps the Jiten identity when a jpdb-primary card absorbs its Jiten twin', async () => {
        const { dedupeWords } = await import('../../src/reader/newtab/card-selection');
        const jpdbCard = kanjiCard({ vid: 1234, sid: 5, spelling: '日本語', reading: 'にほんご', cardState: ['due'] as CardState[], reviewSource: 'jpdb-api' });
        const jitenCard = kanjiCard({
            vid: 42, sid: 2, spelling: '日本語', reading: 'にほんご',
            source: 'jiten', reviewSource: 'jiten-api', jitenWordId: 42, jitenReadingIndex: 2,
        });
        const merged = dedupeWords([jpdbCard, jitenCard]);
        expect(merged).toHaveLength(1);
        // jpdb wins primary (ids stay jpdb's) but the Jiten identity survives
        expect(merged[0]).toMatchObject({ vid: 1234, sid: 5, source: 'jpdb', jitenWordId: 42, jitenReadingIndex: 2 });
    });
});

describe('reviewTargetsForNewTabCard dual API targets (UT-60)', () => {
    it('offers Jiten before JPDB for a merged card with both credentials', async () => {
        const { reviewTargetsForNewTabCard } = await import('../../src/reader/newtab/review-targets');
        const { DEFAULT_SETTINGS } = await import('../../src/reader/settings');
        const settings = { ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jitenApiKey: 'ak_jiten', jpdbMiningEnabled: true, enableReviews: true };
        const merged = kanjiCard({ vid: 1234, sid: 5, reviewSource: 'jpdb-api', jitenWordId: 42, jitenReadingIndex: 2 });
        expect(reviewTargetsForNewTabCard(merged, settings, null)).toEqual(['jiten-api', 'jpdb-api']);
        // single-identity cards are unchanged
        const jpdbOnly = kanjiCard({ vid: 1234, sid: 5, reviewSource: 'jpdb-api' });
        expect(reviewTargetsForNewTabCard(jpdbOnly, settings, null)).toEqual(['jpdb-api']);
        const jitenOnly = kanjiCard({ vid: 42, sid: 2, source: 'jiten', reviewSource: 'jiten-api', jitenWordId: 42, jitenReadingIndex: 2 });
        expect(reviewTargetsForNewTabCard(jitenOnly, settings, null)).toEqual(['jiten-api']);
    });
});

describe('reviewTargetsForNewTabCard keyless starter cards', () => {
    it('grades "Yomu"-labeled starter cards into the local SRS without any provider credential', async () => {
        const { reviewTargetsForNewTabCard, newTabCardSourceLabel } = await import('../../src/reader/newtab/review-targets');
        const { DEFAULT_SETTINGS } = await import('../../src/reader/settings');
        const keyless = { ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: '', enableReviews: true, yomuLocalSrsEnabled: true };
        const starter = kanjiCard({ vid: -1, sid: -1, source: 'fallback', reviewSource: undefined });
        // Label and gradability must agree: the card says "Yomu", so it
        // grades into the Yomu local SRS (create-on-first-review).
        expect(newTabCardSourceLabel(starter, 'en')).toBe('Yomu');
        expect(reviewTargetsForNewTabCard(starter, keyless, null)).toEqual(['yomu-local']);
        // Disabling the local SRS removes the target again.
        expect(reviewTargetsForNewTabCard(starter, { ...keyless, yomuLocalSrsEnabled: false }, null)).toEqual([]);
        // A starter card explicitly re-homed to the local review source keeps
        // a single target (no duplicate).
        const rehomed = kanjiCard({ source: 'fallback', reviewSource: 'yomu-local' });
        expect(reviewTargetsForNewTabCard(rehomed, keyless, null)).toEqual(['yomu-local']);
    });
});
