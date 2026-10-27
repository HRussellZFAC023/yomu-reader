import { describe, expect, it } from 'vitest';

import { uncoveredJapaneseRanges } from '../../src/reader/lookup/uncovered-japanese-ranges';
import { ocrFallbackCardFromText } from '../../src/reader/ocr/target-context';
import { DEFAULT_SETTINGS } from "../../src/reader/settings";
import { ReaderParser } from "../../src/reader/lookup/parser";
import type { ReaderParserDependencies } from "../../src/reader/lookup/parser";

describe('lookup scope modules', () => {
    it('reports uncovered Japanese runs in UTF-16 coordinates without splitting supplementary kanji', () => {
        const text = 'あ𠮷い';
        const covered = (start: number, end: number): boolean => start < 3 && 1 < end;

        expect([...uncoveredJapaneseRanges(text, 0, text.length, covered)]).toEqual([
            { start: 0, end: 1 },
            { start: 3, end: 4 },
        ]);
        expect([...uncoveredJapaneseRanges(text, 0, 2, () => false)]).toEqual([
            { start: 0, end: 1 },
        ]);
    });

    it('scopes OCR fallback identity and language to the Japanese target', () => {
        const japanese = ocrFallbackCardFromText('  word  ');

        expect(japanese).toMatchObject({ spelling: 'word', language: 'ja' });
        expect(ocrFallbackCardFromText('word').vid).toBe(japanese.vid);
    });
});

describe('local card target language', () => {
    it('never leaves a dangling surrogate at the fallback spelling cap', () => {
        const parser = new ReaderParser({
            getSettings: () => DEFAULT_SETTINGS,
            jpdb: {} as ReaderParserDependencies['jpdb'],
            dictionaries: {} as ReaderParserDependencies['dictionaries'],
        });
        const card = parser.fallbackCardFromText(`${'我'.repeat(79)}𡃁tail`);

        expect(card.spelling).toBe('我'.repeat(79));
        expect(card.spelling).not.toMatch(/[\uD800-\uDFFF]/u);
    });
});
