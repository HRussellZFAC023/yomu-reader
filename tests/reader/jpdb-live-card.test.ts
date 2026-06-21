import { describe, expect, it } from 'vitest';
import { liveJpdbCardFromBridgeCard, liveJpdbCardIdentity } from '../../src/reader/newtab/jpdb-live-card';
import type { JpdbReviewBridgeCard } from '../../src/reader/jpdb/jpdb-review-bridge';
import { cardKey } from '../../src/reader/cards/utils';

function bridgeCard(overrides: Partial<JpdbReviewBridgeCard> = {}): JpdbReviewBridgeCard {
    return {
        id: 'vf,123,456',
        kind: 'vocabulary',
        phase: 'front',
        prompt: '何ですか',
        answer: 'なんですか',
        spelling: '何',
        reading: 'なに',
        sentence: 'これは何ですか',
        kanji: '',
        keyword: '',
        itemsLeft: 4,
        href: 'https://jpdb.io/review',
        ...overrides,
    };
}

describe('liveJpdbCardFromBridgeCard', () => {
    it('maps a vocabulary bridge card onto the live-review JPDBCard shape', () => {
        const card = liveJpdbCardFromBridgeCard(bridgeCard({ deckMembership: 'deck-7' }), '何');
        expect(card).toMatchObject({
            vid: 123,
            sid: 456,
            rid: 0,
            spelling: '何',
            reading: 'なに',
            frequencyRank: null,
            partOfSpeech: [],
            cardState: ['due'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'jpdb',
            reviewSource: 'jpdb-live',
            jpdbReviewId: 'vf,123,456',
            jpdbDeckMembership: 'deck-7',
        });
        expect(card.meanings).toEqual([{ glosses: [], partOfSpeech: [] }]);
    });

    it.each([
        ['vf,123,456', 123, 456],
        ['v,1,2', 1, 2],
        ['vd,10,20', 10, 20],
        ['vf,007,008', 7, 8],
    ])('parses numeric vid/sid out of bridge id %s', (id, vid, sid) => {
        const card = liveJpdbCardFromBridgeCard(bridgeCard({ id }), '何');
        expect({ vid: card.vid, sid: card.sid }).toEqual({ vid, sid });
        expect(typeof card.vid).toBe('number');
    });

    it.each([
        'x,1,2',
        '',
        'vf,abc,def',
        'garbage',
        'vf,123,456 ',
        ' vf,1,2',
        'vf,123,456,789',
        'V,1,2',
        '出来事:できごと',
    ])('falls back to vid/sid 0 for unparseable id %j', (id) => {
        const card = liveJpdbCardFromBridgeCard(bridgeCard({ id }), '何');
        expect({ vid: card.vid, sid: card.sid }).toEqual({ vid: 0, sid: 0 });
    });

    it('exposes only kanji keyword glosses for a kanji card and reads back its spelling', () => {
        const card = liveJpdbCardFromBridgeCard(bridgeCard({ kind: 'kanji', kanji: '何', reading: '', keyword: 'what' }), '何');
        expect(card.meanings).toEqual([{ glosses: ['what'], partOfSpeech: [] }]);
        expect(card.kanjiKeyword).toBe('what');
        expect(card.reading).toBe('何');
    });

    it('drops empty kanji glosses rather than emitting a blank entry', () => {
        const card = liveJpdbCardFromBridgeCard(bridgeCard({ kind: 'kanji', keyword: '', prompt: '' }), '何');
        expect(card.meanings).toEqual([{ glosses: [], partOfSpeech: [] }]);
    });

    it('keeps a Japanese reading and ignores a non-Japanese one', () => {
        expect(liveJpdbCardFromBridgeCard(bridgeCard({ reading: 'なに' }), '何').reading).toBe('なに');
        expect(liveJpdbCardFromBridgeCard(bridgeCard({ reading: 'nani' }), '何').reading).toBe('何');
    });

    it('falls back to the spelling when the reading is blank', () => {
        expect(liveJpdbCardFromBridgeCard(bridgeCard({ reading: '' }), '何').reading).toBe('何');
    });

    it('falls back from sentence to prompt and from keyword to prompt', () => {
        const card = liveJpdbCardFromBridgeCard(
            bridgeCard({ kind: 'kanji', sentence: '', keyword: '', prompt: 'fallback' }),
            '何',
        );
        expect(card.sentence).toBe('fallback');
        expect(card.kanjiKeyword).toBe('fallback');
    });
});

describe('liveJpdbCardIdentity', () => {
    it('prefers the jpdb review id', () => {
        const card = liveJpdbCardFromBridgeCard(bridgeCard({ id: 'vf,9,9' }), '何');
        expect(liveJpdbCardIdentity(card)).toBe('vf,9,9');
    });

    it('falls back to the concrete card key when there is no review id', () => {
        const card = { ...liveJpdbCardFromBridgeCard(bridgeCard(), '何'), jpdbReviewId: '' };
        expect(liveJpdbCardIdentity(card)).toBe('123:456:何:なに');
        expect(liveJpdbCardIdentity(card)).toBe(cardKey(card));
    });
});
