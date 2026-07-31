import { describe, expect, it } from 'vitest';
import { splitReadingAcrossKanji } from '../../src/reader/lookup/kanji-ruby-split';

function readings(map: Record<string, string[]>) {
    return (kanji: string) => map[kanji] ?? [];
}

describe('splitReadingAcrossKanji', () => {
    it('splits an unambiguous all-kanji compound per kanji', () => {
        const segments = splitReadingAcrossKanji('琉球藍', 'りゅうきゅうあい', readings({
            琉: ['リュウ', 'ル'],
            球: ['キュウ', 'たま'],
            藍: ['ラン', 'あい'],
        }));

        expect(segments).toEqual([
            { text: 'りゅう', start: 0, end: 1 },
            { text: 'きゅう', start: 1, end: 2 },
            { text: 'あい', start: 2, end: 3 },
        ]);
    });

    it('splits a kanji compound before a kana suffix without annotating the suffix', () => {
        const segments = splitReadingAcrossKanji('質問する', 'しつもんする', readings({
            質: ['シツ'],
            問: ['モン', 'と.う'],
        }));

        expect(segments).toEqual([
            { text: 'しつ', start: 0, end: 1 },
            { text: 'もん', start: 1, end: 2 },
        ]);
    });

    it('trims shared kana prefixes before splitting the kanji base', () => {
        const segments = splitReadingAcrossKanji('お手本', 'おてほん', readings({
            手: ['シュ', 'て'],
            本: ['ホン', 'もと'],
        }));

        expect(segments).toEqual([
            { text: 'て', start: 1, end: 2 },
            { text: 'ほん', start: 2, end: 3 },
        ]);
    });

    it('keeps the whole-word ruby when multiple alignments are possible', () => {
        // Both き+いと and きい+と consume the reading, so the split is ambiguous.
        const segments = splitReadingAcrossKanji('生糸', 'きいと', readings({
            生: ['き', 'きい'],
            糸: ['いと', 'と'],
        }));

        expect(segments).toBeNull();
    });

    it('keeps the whole-word ruby when no alignment exists', () => {
        const segments = splitReadingAcrossKanji('琉球', 'りゅうきゅう', readings({
            琉: ['ル'],
            球: ['たま'],
        }));

        expect(segments).toBeNull();
    });

    it('aligns rendaku readings (組 くみ → ぐみ)', () => {
        const segments = splitReadingAcrossKanji('番組', 'ばんぐみ', readings({
            番: ['バン'],
            組: ['ソ', 'く.む', 'くみ'],
        }));

        expect(segments).toEqual([
            { text: 'ばん', start: 0, end: 1 },
            { text: 'ぐみ', start: 1, end: 2 },
        ]);
    });

    it('aligns sokuon readings (学 がく → がっ)', () => {
        const segments = splitReadingAcrossKanji('学校', 'がっこう', readings({
            学: ['ガク', 'まな.ぶ'],
            校: ['コウ'],
        }));

        expect(segments).toEqual([
            { text: 'がっ', start: 0, end: 1 },
            { text: 'こう', start: 1, end: 2 },
        ]);
    });

    it('strips okurigana from kunyomi candidates before matching', () => {
        const segments = splitReadingAcrossKanji('雨水', 'あまみず', readings({
            雨: ['ウ', 'あめ', 'あま-'],
            水: ['スイ', 'みず'],
        }));

        expect(segments).toEqual([
            { text: 'あま', start: 0, end: 1 },
            { text: 'みず', start: 1, end: 2 },
        ]);
    });

    it('declines words that are not all-kanji', () => {
        expect(splitReadingAcrossKanji('読み', 'よみ', readings({ 読: ['よ.む'] }))).toBeNull();
        expect(splitReadingAcrossKanji('藍', 'あい', readings({ 藍: ['あい'] }))).toBeNull();
    });

    it('declines readings that are not pure kana', () => {
        expect(splitReadingAcrossKanji('琉球', 'りゅうQ', readings({ 琉: ['りゅう'], 球: ['きゅう'] }))).toBeNull();
        expect(splitReadingAcrossKanji('琉球', '', readings({ 琉: ['りゅう'], 球: ['きゅう'] }))).toBeNull();
    });

    it('handles the 々 repeat mark without crashing (no readings → no split)', () => {
        expect(splitReadingAcrossKanji('人々', 'ひとびと', readings({ 人: ['ひと'] }))).toBeNull();
    });

    it('accepts katakana whole-word readings by normalizing to hiragana', () => {
        const segments = splitReadingAcrossKanji('琉球', 'リュウキュウ', readings({
            琉: ['リュウ'],
            球: ['キュウ'],
        }));

        expect(segments).toEqual([
            { text: 'リュウ', start: 0, end: 1 },
            { text: 'キュウ', start: 1, end: 2 },
        ]);
    });

    it('returns UTF-16 ruby coordinates for supplementary kanji after a kana prefix', () => {
        const segments = splitReadingAcrossKanji('お𠮟咤', 'おしか', readings({
            𠮟: ['シ'],
            咤: ['カ'],
        }));

        expect(segments).toEqual([
            { text: 'し', start: 1, end: 3 },
            { text: 'か', start: 3, end: 4 },
        ]);
        expect('お𠮟咤'.slice(segments![0].start, segments![0].end)).toBe('𠮟');
        expect('お𠮟咤'.slice(segments![1].start, segments![1].end)).toBe('咤');
    });
});
