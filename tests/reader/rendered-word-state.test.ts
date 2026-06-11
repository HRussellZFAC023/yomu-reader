import { describe, expect, it } from 'vitest';
import { kanaRunRenderedWordsForSurface } from '../../src/reader/main/rendered-word-lookup';
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

describe('kana-run rendered-word identity (P0 parity)', () => {
    function renderRun(parts: string[]): HTMLElement[] {
        document.body.innerHTML = '';
        return parts.map(text => {
            const span = document.createElement('span');
            span.className = 'jpdb-reader-word';
            span.textContent = text;
            document.body.append(span);
            return span;
        });
    }

    it('finds the contiguous fragment run covering the resolved surface around the anchor', () => {
        const [ni, hon, go] = renderRun(['に', 'ほん', 'ご']);
        expect(kanaRunRenderedWordsForSurface(hon!, 'にほんご')).toEqual([ni, hon, go]);
        expect(kanaRunRenderedWordsForSurface(go!, 'ほんご')).toEqual([hon, go]);
    });

    it('fails closed when the surface does not match or excludes the anchor', () => {
        const [ni, , go] = renderRun(['に', 'ほん', 'ご']);
        expect(kanaRunRenderedWordsForSurface(ni!, 'ほんご')).toEqual([]);
        expect(kanaRunRenderedWordsForSurface(go!, 'にほmost')).toEqual([]);
    });

    it('stops at non-word siblings and strips ruby annotations', () => {
        document.body.innerHTML = '';
        const plain = document.createElement('b');
        plain.textContent = 'x';
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word';
        word.innerHTML = '<ruby>ほん<rt>ホン</rt></ruby>';
        const tail = document.createElement('span');
        tail.className = 'jpdb-reader-word';
        tail.textContent = 'ご';
        document.body.append(plain, word, tail);
        expect(kanaRunRenderedWordsForSurface(word, 'ほんご')).toEqual([word, tail]);
    });
});
