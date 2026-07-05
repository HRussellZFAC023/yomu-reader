import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import { kanaRunRenderedWordsForSurface } from '../../src/reader/main/rendered-word-lookup';
import type { JPDBCard } from '../../src/reader/app/types';
import { renderTokensToHtml } from '../../src/reader/dom/index';
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
        expect(word.dataset.pitchAccent).toBe('LH');
        expect(word.dataset.wordWithReading).toBeUndefined();
        expect(word.classList.contains('jpdb-not-in-deck')).toBe(false);
        expect(word.classList.contains('fallback-not-in-deck')).toBe(false);
        expect(word.classList.contains('jpdb-mature')).toBe(true);
        expect(word.classList.contains('jiten-mature')).toBe(true);
        expect(word.classList.contains('jpdb-pitch-atamadaka')).toBe(true);
    });

    it('stamps and clears rendered pitch metadata', () => {
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word';
        word.dataset.pitchAccent = 'stale';

        setRenderedWordCardIdentity(word, renderedWordCard({
            pitchAccent: ['LHHL'],
        }));

        expect(word.dataset.pitchAccent).toBe('LHHL');

        setRenderedWordCardIdentity(word, renderedWordCard({
            pitchAccent: [],
        }));

        expect(word.dataset.pitchAccent).toBeUndefined();
    });

    it('clears Bunpro fill state when the word resolves to a real card', () => {
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-learning bunpro-learning';
        word.dataset.cardState = 'learning';
        word.dataset.bunproState = 'learning';

        setRenderedWordCardIdentity(word, renderedWordCard({
            source: 'jiten',
            cardState: ['mature'],
        }));

        expect(word.classList.contains('bunpro-learning')).toBe(false);
        expect(word.classList.contains('jpdb-learning')).toBe(false);
        expect(word.classList.contains('jpdb-mature')).toBe(true);
        expect(word.dataset.bunproState).toBeUndefined();
        expect(word.dataset.cardState).toBe('mature');
    });
});

describe('rendered word deck styling parity', () => {
    const deckStylingCases: Array<{ source: NonNullable<JPDBCard['source']>; deckFields: Partial<JPDBCard> }> = [
        { source: 'jpdb', deckFields: { deckNames: ['Mining'] } },
        { source: 'jiten', deckFields: { deckNames: ['Mining'], sourceDeckName: 'Mining' } },
        { source: 'anki', deckFields: { ankiDeckNames: ['Mining'] } },
    ];

    it.each(deckStylingCases)('stamps $source deck membership on reader words', ({ source, deckFields }) => {
        document.body.innerHTML = renderTokensToHtml('読む', [{
            card: renderedWordCard({
                source,
                cardState: ['in-deck'],
                ...deckFields,
            }),
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: 'unknown',
        }], DEFAULT_SETTINGS);

        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(word.classList.contains('yomu-deck-member')).toBe(true);
        expect(word.classList.contains(`${source}-deck-member`)).toBe(true);
        expect(word.classList.contains('yomu-deck-mining')).toBe(true);
        expect(word.classList.contains(`${source}-deck-mining`)).toBe(true);
        expect(word.dataset.deckMember).toBe('true');
        expect(word.dataset.deckSource).toBe(source);
        expect(word.dataset.deckNames).toBe('Mining');
    });

    it('keeps merged Anki deck metadata on Anki deck classes', () => {
        document.body.innerHTML = renderTokensToHtml('読む', [{
            card: renderedWordCard({
                source: 'jpdb',
                cardState: ['known'],
                ankiDeckNames: ['Mining'],
            }),
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: 'unknown',
        }], DEFAULT_SETTINGS);

        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(word.classList.contains('anki-deck-member')).toBe(true);
        expect(word.classList.contains('anki-deck-mining')).toBe(true);
        expect(word.classList.contains('jpdb-deck-member')).toBe(false);
        expect(word.dataset.deckSource).toBe('anki');
        expect(word.dataset.deckNames).toBe('Mining');
    });

    it('replaces stale provider deck styling when retargeting a rendered word', () => {
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word yomu-deck-member yomu-deck-old jiten-deck-member jiten-deck-old';
        word.dataset.deckMember = 'true';
        word.dataset.deckSource = 'jiten';
        word.dataset.deckNames = 'Old';

        setRenderedWordCardIdentity(word, renderedWordCard({
            source: 'jpdb',
            cardState: ['not-in-deck'],
            deckNames: [],
        }));

        expect(word.classList.contains('yomu-deck-member')).toBe(false);
        expect(word.classList.contains('yomu-deck-old')).toBe(false);
        expect(word.classList.contains('jiten-deck-member')).toBe(false);
        expect(word.classList.contains('jiten-deck-old')).toBe(false);
        expect(word.dataset.deckMember).toBeUndefined();
        expect(word.dataset.deckSource).toBeUndefined();
        expect(word.dataset.deckNames).toBeUndefined();
    });
});

function renderedWordCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 1456360,
        sid: 3,
        rid: 0,
        source: 'jpdb',
        spelling: '読む',
        reading: 'よむ',
        frequencyRank: 20215,
        partOfSpeech: ['v5m'],
        meanings: [{ glosses: ['to read'], partOfSpeech: ['v5m'] }],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        ...overrides,
    };
}

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
