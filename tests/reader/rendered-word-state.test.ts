import { describe, expect, it } from 'vitest';
import type { JPDBCard } from '../../src/reader/app/types';
import { setRenderedWordCardIdentity } from '../../src/reader/dom/rendered-word-state';

describe('rendered word card identity', () => {
    it('replaces stale fallback metadata when a word resolves to a Jiten card', () => {
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-not-in-deck fallback-not-in-deck jpdb-pitch-atamadaka';
        word.dataset.vid = '-1805781283';
        word.dataset.sid = '-1805781283';
        word.dataset.cardSource = 'fallback';
        word.dataset.cardId = '-1805781283';
        word.dataset.readingIndex = '-1805781283';
        word.dataset.cardState = 'not-in-deck';
        word.dataset.expression = 'よむ';
        word.dataset.reading = 'よむ';

        const card: JPDBCard = {
            vid: 1456360,
            sid: 3,
            rid: 0,
            jitenWordId: 1456360,
            jitenReadingIndex: 3,
            source: 'jiten',
            reviewSource: 'jiten-api',
            spelling: 'よむ',
            reading: 'よむ',
            frequencyRank: 20215,
            partOfSpeech: ['v5m'],
            meanings: [{ glosses: ['to read'], partOfSpeech: ['v5m'] }],
            cardState: ['mature'],
            pitchAccent: ['LH'],
            wordWithReading: null,
        };

        setRenderedWordCardIdentity(word, card);

        expect(word.dataset.vid).toBe('1456360');
        expect(word.dataset.sid).toBe('3');
        expect(word.dataset.cardSource).toBe('jiten');
        expect(word.dataset.cardId).toBe('1456360');
        expect(word.dataset.readingIndex).toBe('3');
        expect(word.dataset.cardState).toBe('mature');
        expect(word.classList.contains('jpdb-not-in-deck')).toBe(false);
        expect(word.classList.contains('fallback-not-in-deck')).toBe(false);
        expect(word.classList.contains('jpdb-mature')).toBe(true);
        expect(word.classList.contains('jiten-mature')).toBe(true);
        expect(word.classList.contains('jpdb-pitch-atamadaka')).toBe(true);
    });
});
