import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { ReaderParser } from '../../src/reader/lookup/parser';
import type { ReaderParserDependencies } from '../../src/reader/lookup/parser';

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
