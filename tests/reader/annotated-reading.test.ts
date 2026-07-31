import { describe, expect, it } from 'vitest';

import {
    annotatedWordRubies,
    readingFromSurfaceRubies,
} from '../../src/reader/lookup/annotated-reading';

describe('annotated Japanese readings', () => {
    it('keeps supplementary-kanji ruby ranges in UTF-16 coordinates', () => {
        const spelling = 'お𠮟り';
        const rubies = annotatedWordRubies(spelling, 'お𠮟[しか]り');

        expect(rubies).toEqual([
            { text: 'しか', start: 1, end: 3, length: 2 },
        ]);
        expect(spelling.slice(rubies[0].start, rubies[0].end)).toBe('𠮟');
        expect(readingFromSurfaceRubies(spelling, rubies)).toBe('おしかり');
    });

    it('removes unannotated supplementary kanji from pronunciation text', () => {
        expect(readingFromSurfaceRubies('𩸽です', [])).toBe('です');
    });
});
