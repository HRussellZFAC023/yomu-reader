import { describe, expect, it } from 'vitest';

import {
    convertHiraganaToKatakana,
    convertRomajiToKana,
    normalizeJapaneseStudyAnswer,
} from '../../src/reader/newtab/japanese-input';
import { evaluateNewTabRecallAnswer } from '../../src/reader/newtab/recall-practice';
import type { JPDBCard } from '../../src/reader/app/types';

describe('Japanese study input', () => {
    it('converts common romaji, doubled consonants, and syllabic n deterministically', () => {
        expect(convertRomajiToKana('nomimono')).toBe('のみもの');
        expect(convertRomajiToKana('gakkou')).toBe('がっこう');
        expect(convertRomajiToKana('kanpai')).toBe('かんぱい');
        expect(convertRomajiToKana('matcha')).toBe('まっちゃ');
        expect(convertRomajiToKana('ho-mu')).toBe('ほーむ');
        expect(convertRomajiToKana('ko-hi-')).toBe('こーひー');
    });

    it('normalizes romaji and katakana to the same kana answer', () => {
        expect(normalizeJapaneseStudyAnswer(' NOMIMONO ')).toBe('のみもの');
        expect(normalizeJapaneseStudyAnswer('ノミモノ')).toBe('のみもの');
    });

    it('converts hiragana to katakana without changing punctuation or long vowels', () => {
        expect(convertHiraganaToKatakana('へんりー・みな')).toBe('ヘンリー・ミナ');
    });

    it('accepts romaji in the existing recall grader', () => {
        const card = {
            spelling: '飲み物',
            reading: 'のみもの',
            meanings: [],
        } as unknown as JPDBCard;
        expect(evaluateNewTabRecallAnswer(card, 'nomimono')).toMatchObject({ outcome: 'accepted' });
    });

    it('accepts a punctuated Academy sentence reading typed as spaced romaji', () => {
        const card = {
            spelling: 'まっすぐ行って、右です。',
            reading: 'まっすぐいって、みぎです。',
            meanings: [],
        } as unknown as JPDBCard;
        expect(evaluateNewTabRecallAnswer(card, 'massugu itte, migi desu')).toMatchObject({ outcome: 'accepted' });
    });
});
