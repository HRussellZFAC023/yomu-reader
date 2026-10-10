import { afterEach, describe, expect, it } from 'vitest';

import { refreshReaderWordContrast } from '../../src/reader/dom/word-contrast';
import { contrastRatio } from '../../src/reader/theme/color-utils';

// Every reading on a page takes one quiet colour: the paragraph's own ink eased
// toward its backdrop, held at text contrast. A reading over a link used to be
// link-blue and bold; over plain text it was full-strength ink, so a paragraph
// showed two colours of furigana stacked over one colour of prose.

const furiganaColour = (id: string): string => document.getElementById(id)!.style.getPropertyValue('--jpdb-reader-furi-color');

function mountParagraph(ink: string, paper: string, wordClass = ''): void {
    document.body.innerHTML = `<p style="background:${paper};color:${ink}">`
        + `<span id="plain" class="jpdb-reader-word jpdb-reader-has-furi ${wordClass}"><ruby><span class="jpdb-reader-ruby-base">本</span><rt class="jpdb-reader-furi">ほん</rt></ruby></span>を`
        + `<a href="/wiki/日本" style="color:#3366cc"><span id="linked" class="jpdb-reader-word jpdb-reader-has-furi ${wordClass}"><ruby><span class="jpdb-reader-ruby-base">日本</span><rt class="jpdb-reader-furi">にほん</rt></ruby></span></a>`
        + `<span id="particle" class="jpdb-reader-word jpdb-reader-particle">の</span></p>`;
    refreshReaderWordContrast(document);
}

afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.className = '';
});

describe('furigana colour', () => {
    it.each([
        ['light', '#202122', '#ffffff'],
        ['dark', '#eaecf0', '#101418'],
    ])('is one muted, readable ink for linked and plain words on a %s page', (_theme, ink, paper) => {
        mountParagraph(ink, paper);
        const colour = furiganaColour('plain');
        expect(colour).toMatch(/^#[0-9a-f]{6}$/);
        expect(furiganaColour('linked')).toBe(colour);
        expect(contrastRatio(colour, paper)).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(colour, paper)).toBeLessThan(contrastRatio(ink, paper));
        expect(furiganaColour('particle')).toBe('');
    });

    it('holds for words whose state colours derive contrast of their own', () => {
        document.documentElement.classList.add('jpdb-reader-word-underline-status');
        mountParagraph('#202122', '#ffffff', 'jpdb-new');
        const colour = furiganaColour('plain');
        expect(colour).toMatch(/^#[0-9a-f]{6}$/);
        expect(furiganaColour('linked')).toBe(colour);
    });

    it('stays text-readable when the page ink is already faint', () => {
        mountParagraph('#8a8a8a', '#ffffff');
        expect(contrastRatio(furiganaColour('plain'), '#ffffff')).toBeGreaterThanOrEqual(7);
    });
});
