import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { refreshReaderWordContrast } from '../../src/reader/dom/word-contrast';

// Browser computed-colour equality is covered by
// smoke:subtitle-stability. Contrast refresh must no longer invent reading ink.
afterEach(() => { document.body.innerHTML = ''; document.documentElement.className = ''; });
describe('furigana colour', () => {
    it.each(['#202122', '#eaecf0', '#3366cc'])('leaves readings in their base word colour (%s)', ink => {
        document.body.innerHTML = `<p style="background:white;color:${ink}"><span class="jpdb-reader-word jpdb-reader-has-furi"><ruby>本<rt class="jpdb-reader-furi">ほん</rt></ruby></span></p>`;
        refreshReaderWordContrast(document);
        expect(document.querySelector('.jpdb-reader-word')!.getAttribute('style') ?? '').not.toContain('furi-color');
        const css = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');
        expect(css).not.toContain('--jpdb-reader-furi-color');
    });
});
