import { describe, expect, it } from 'vitest';

import { renderedTokenFuriganaRepair } from '../../src/reader/app/late-card-reconciliation';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

// The reading a parsed token knows but its rendered word may lack. The app
// repaints each card's rendered words once per parse batch from these repairs
// (main.ts reconcileRenderedTokenFurigana), not once per occurrence.

const card = (spelling: string, reading: string): JPDBCard => ({
    vid: 7, sid: 1, rid: 0, spelling, reading, frequencyRank: null,
    partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'jiten',
});

const token = (surface: string, reading: string, overrides: Partial<JPDBToken> = {}): JPDBToken => ({
    card: card(surface, reading), start: 0, end: surface.length, length: surface.length,
    rubies: [], pitchClass: '', sentence: surface, ...overrides,
});

describe('rendered token furigana repair', () => {
    it('repairs a kanji token that arrived without ruby spans', () => {
        expect(renderedTokenFuriganaRepair(token('読んだ', 'よんだ'))).toEqual({ card: card('読んだ', 'よんだ'), pitchClass: 'unknown' });
    });

    it.each([
        ['a token whose ruby already arrived', token('本', 'ほん', { rubies: [{ text: 'ほん', start: 0, end: 1, length: 1 }] })],
        ['a card with no reading', token('本', '')],
        ['a reading that is its own spelling', token('ほん', 'ほん')],
        ['a kana surface', token('よむ', 'よむ', { card: card('読む', 'よむ') })],
    ])('leaves %s alone', (_case, input) => {
        expect(renderedTokenFuriganaRepair(input)).toBeNull();
    });

    it('keeps a pitch class the token already carries', () => {
        expect(renderedTokenFuriganaRepair(token('橋', 'はし', { pitchClass: 'jpdb-pitch-odaka' }))?.pitchClass).toBe('jpdb-pitch-odaka');
    });
});
