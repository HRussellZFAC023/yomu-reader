import { describe, expect, it } from 'vitest';

import type { JPDBCard } from '../../src/reader/app/types';
import { conciseDrawMeaning, kanjiDrawHints, recallHints } from '../../src/reader/newtab/study-hints';

function hintCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 10,
        sid: 20,
        rid: 0,
        spelling: '飲み物',
        reading: 'のみもの',
        frequencyRank: 1200,
        partOfSpeech: ['n'],
        meanings: [{ glosses: ['drink', 'beverage'], partOfSpeech: ['n'] }],
        cardState: ['due'],
        pitchAccent: ['LHHHL'],
        wordWithReading: null,
        source: 'jpdb',
        reviewSource: 'jpdb-api',
        sentence: '飲み物を買う。',
        ...overrides,
    };
}

describe('study-hints: kanji-draw progressive hints', () => {
    it('never repeats the meaning already on the prompt, and stops short of the reading', () => {
        const hints = kanjiDrawHints(hintCard(), {
            meaningAlreadyShown: true,
            kanjiKeyword: 'drink',
            firstKanaHint: 'の',
        });
        // Meaning is on the prompt already, so it is not re-offered; keyword and a
        // single first-kana sound cue remain — never the full reading.
        expect(hints.map(hint => hint.labelKey)).toEqual(['studyHintKanjiKeyword', 'studyHintFirstKana']);
        expect(hints.every(hint => hint.text !== 'のみもの')).toBe(true);
        expect(hints.map(hint => hint.text)).toEqual(['drink', 'の']);
    });

    it('surfaces the meaning first when the prompt does not already show it', () => {
        const hints = kanjiDrawHints(hintCard(), {
            meaningAlreadyShown: false,
            kanjiKeyword: 'read',
            firstKanaHint: 'の',
        });
        expect(hints[0]).toMatchObject({ labelKey: 'studyHintMeaning', text: 'drink; beverage' });
        expect(hints.map(hint => hint.labelKey)).toEqual(['studyHintMeaning', 'studyHintKanjiKeyword', 'studyHintFirstKana']);
    });

    it('drops a keyword hint that just echoes the word meaning', () => {
        const hints = kanjiDrawHints(hintCard({ meanings: [{ glosses: ['drink'], partOfSpeech: ['n'] }] }), {
            meaningAlreadyShown: false,
            kanjiKeyword: 'Drink',
            firstKanaHint: '',
        });
        expect(hints.map(hint => hint.labelKey)).toEqual(['studyHintMeaning']);
    });
});

describe('study-hints: recall progressive hints', () => {
    it('reveals the first kana then the kana length for longer words', () => {
        const hints = recallHints('のみもの');
        expect(hints.map(hint => hint.labelKey)).toEqual(['studyHintFirstKana', 'studyHintLength']);
        expect(hints[0]).toMatchObject({ text: 'の', kind: 'text' });
        expect(hints[1]).toMatchObject({ text: '4', kind: 'count' });
    });

    it('stops at the first kana for two-kana words so the answer is never spelled out', () => {
        const hints = recallHints('はし');
        expect(hints.map(hint => hint.labelKey)).toEqual(['studyHintFirstKana']);
    });

    it('returns nothing for an empty answer', () => {
        expect(recallHints('   ')).toEqual([]);
    });
});

describe('study-hints: conciseDrawMeaning', () => {
    it('keeps a short clean gloss verbatim', () => {
        expect(conciseDrawMeaning('drink; beverage')).toBe('drink');
    });

    it('peels leading grammar tags off a messy dictionary dump', () => {
        expect(conciseDrawMeaning('5-dan transitive kana to sow to plant to seed to sow')).toBe('to sow to plant to seed to sow');
    });

    it('caps an over-long sense with an ellipsis at a clause boundary', () => {
        const long = conciseDrawMeaning('a very long gloss that keeps going and going well past forty characters, second clause');
        expect(Array.from(long).length).toBeLessThanOrEqual(41);
        expect(long.endsWith('…') || long === 'a very long gloss that keeps going and going well past forty characters').toBe(true);
    });
});
