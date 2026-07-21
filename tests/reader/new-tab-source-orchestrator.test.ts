import { describe, expect, it } from 'vitest';

import type { JPDBCard } from '../../src/reader/app/types';
import { autoReviewSourceResults } from '../../src/reader/newtab/source-orchestrator';
import { newTabSourceLoadPlan } from '../../src/reader/newtab/source';

function card(overrides: Partial<JPDBCard>): JPDBCard {
    return {
        vid: 1,
        sid: 1,
        rid: 1,
        spelling: '読む',
        reading: 'よむ',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['due'],
        pitchAccent: [],
        wordWithReading: null,
        ...overrides,
    };
}

describe('new-tab source orchestration', () => {
    it('keeps auto local-first before optional account sources', () => {
        expect(newTabSourceLoadPlan('auto', 12).primarySources).toEqual(['yomu-local', 'jpdb', 'bunpro', 'wanikani', 'anki']);
    });

    it('dedupes JPDB and Anki without dropping Bunpro or local source results', () => {
        const results = autoReviewSourceResults(
            { sourceLabel: 'Academy', reviewCountMode: true, cards: [card({ source: 'yomu-local', reviewSource: 'yomu-local', spelling: '図鑑', reading: 'ずかん' })] },
            { sourceLabel: 'JPDB', reviewCountMode: true, cards: [card({ source: 'jpdb', reviewSource: 'jpdb-api', spelling: '読む', reading: 'よむ' })] },
            { sourceLabel: 'Bunpro', reviewCountMode: true, cards: [card({ source: 'bunpro', reviewSource: 'bunpro-api', spelling: '〜ている', reading: 'ている' })] },
            { sourceLabel: 'Anki', reviewCountMode: true, cards: [card({ source: 'anki', reviewSource: 'anki', spelling: '読む', reading: 'よむ', ankiCardId: 42 })] },
        );

        expect(results.map(result => result.sourceLabel)).toEqual(['Academy', 'JPDB', 'Bunpro', 'Anki']);
        expect(results[1]?.cards[0]?.ankiCardId).toBe(42);
        expect(results[3]?.cards).toEqual([]);
        expect(results[0]?.cards[0]?.spelling).toBe('図鑑');
        expect(results[2]?.cards[0]?.spelling).toBe('〜ている');
    });
});
