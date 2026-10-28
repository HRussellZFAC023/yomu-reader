import { afterEach, describe, expect, it } from 'vitest';

import { refreshReaderWordContrast } from '../../src/reader/dom/word-contrast';
import { contrastRatio, mixHex } from '../../src/reader/theme/color-utils';

const KNOWN_STATE_COLOR = '#7bd88f';
// reader-words-ocr.css mixes every status wash as
// `color-mix(in srgb, <state colour> 36%, var(--jpdb-reader-highlight-backdrop))`,
// so the backdrop alone decides whether the user sees a pastel tint or a dark
// saturated block. Reproduce that mix to assert what actually gets painted.
function paintedHighlightHex(word: HTMLElement): string {
    const backdrop = word.style.getPropertyValue('--jpdb-reader-highlight-backdrop');
    expect(backdrop).not.toBe('');
    return mixHex(KNOWN_STATE_COLOR, backdropHex(backdrop), 0.64);
}

function backdropHex(css: string): string {
    const [red, green, blue] = (css.match(/-?\d+/g) ?? []).map(Number);
    return `#${[red, green, blue].map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

function expectLightHighlight(word: HTMLElement): void {
    const painted = paintedHighlightHex(word);
    expect(contrastRatio(painted, '#ffffff')).toBeLessThan(contrastRatio(painted, '#000000'));
}

function expectDarkHighlight(word: HTMLElement): void {
    const painted = paintedHighlightHex(word);
    expect(contrastRatio(painted, '#000000')).toBeLessThan(contrastRatio(painted, '#ffffff'));
}

function annotate(html: string): HTMLElement[] {
    document.body.innerHTML = html;
    refreshReaderWordContrast(document);
    return [...document.querySelectorAll<HTMLElement>('.jpdb-reader-word')];
}

afterEach(() => {
    document.body.innerHTML = '';
    document.body.style.cssText = '';
    document.documentElement.style.cssText = '';
});

// iPad Safari, store-jp.nintendo.com error page: every annotated word rendered
// as a dark navy/green/purple block on a plainly WHITE page, while the same
// words on the store's other pages rendered as light pastels. The error page
// paints no background colour at all, so the probe fell through to a guess
// from text luminance — and that guess accepted any grey lighter than about
// #767676 as "light text, therefore a dark page".
describe('page background probe: minimally styled light pages', () => {
    it('keeps a light backdrop when nothing paints a background and the copy is muted grey', () => {
        const [word] = annotate(`
            <p style="color: rgb(153, 153, 153);">
                <span class="jpdb-reader-word jpdb-known">読む</span>
            </p>
        `);

        expect(word.style.getPropertyValue('--jpdb-reader-highlight-backdrop')).toBe('rgb(255, 255, 255)');
        expectLightHighlight(word);
    });

    it('keeps a light backdrop when only the document body carries muted grey copy', () => {
        document.body.style.color = 'rgb(136, 136, 136)';
        const [word] = annotate('<p><span class="jpdb-reader-word jpdb-known">読む</span></p>');

        expect(word.style.getPropertyValue('--jpdb-reader-highlight-backdrop')).toBe('rgb(255, 255, 255)');
        expectLightHighlight(word);
    });

    // `color-scheme: light dark` is the recommended opt-in and says "either is
    // fine, UA decides". Treating the mere presence of the `dark` token as a
    // dark canvas painted every such page's highlights dark in light mode.
    it('treats a light-dark color-scheme page as light while the UA prefers light', () => {
        document.documentElement.style.colorScheme = 'light dark';
        const [word] = annotate('<p><span class="jpdb-reader-word jpdb-known">読む</span></p>');

        expect(word.style.getPropertyValue('--jpdb-reader-highlight-backdrop')).toBe('rgb(255, 255, 255)');
        expectLightHighlight(word);
    });

    // Over an unresolvable image backdrop the derived text colours are guesses,
    // so those stay cleared and the shadow does the work — but the wash still
    // mixes against the backdrop var. Leaving it unset handed the mix to the
    // stylesheet default, which `prefers-color-scheme` picks: dark blocks on a
    // light page for every reader whose device was in dark mode.
    it('still resolves a backdrop for words over an unparseable image backdrop', () => {
        const [word] = annotate(`
            <div style="background-image: linear-gradient(rgb(255, 255, 255), rgb(250, 250, 250));">
                <span class="jpdb-reader-word jpdb-known">読む</span>
            </div>
        `);

        expect(word.style.getPropertyValue('--jpdb-reader-word-contrast-shadow')).not.toBe('');
        expect(word.style.getPropertyValue('--jpdb-reader-highlight-backdrop')).toBe('rgb(255, 255, 255)');
        expectLightHighlight(word);
    });
});

// The decision stays per-word: the probe walks up from the annotated element,
// so a dark panel on an otherwise transparent page colours only the words
// inside it. Nothing is cached across pages — the resolved background is part
// of the per-word applied-state key, so a differing background always recomputes.
describe('page background probe: explicit paint still wins', () => {
    it('gives dark backdrops to words inside a dark panel and light ones to their neighbours', () => {
        const [inPanel, outsidePanel] = annotate(`
            <div style="background-color: rgb(20, 22, 28); color: rgb(242, 244, 248);">
                <span class="jpdb-reader-word jpdb-known">読む</span>
            </div>
            <p style="color: rgb(153, 153, 153);">
                <span class="jpdb-reader-word jpdb-known">書く</span>
            </p>
        `);

        expect(inPanel.style.getPropertyValue('--jpdb-reader-highlight-backdrop')).toBe('rgb(20, 22, 28)');
        expectDarkHighlight(inPanel);
        expect(outsidePanel.style.getPropertyValue('--jpdb-reader-highlight-backdrop')).toBe('rgb(255, 255, 255)');
        expectLightHighlight(outsidePanel);
    });

    it('still reads an explicitly dark page as dark', () => {
        document.body.style.backgroundColor = 'rgb(24, 27, 32)';
        const [word] = annotate('<p style="color: rgb(242, 244, 248);"><span class="jpdb-reader-word jpdb-known">読む</span></p>');

        expect(word.style.getPropertyValue('--jpdb-reader-highlight-backdrop')).toBe('rgb(24, 27, 32)');
        expectDarkHighlight(word);
    });

    it('still reads a declared dark color-scheme canvas as dark', () => {
        document.documentElement.style.colorScheme = 'dark';
        const [word] = annotate('<p><span class="jpdb-reader-word jpdb-known">読む</span></p>');

        expect(word.style.getPropertyValue('--jpdb-reader-highlight-backdrop')).toBe('rgb(24, 27, 32)');
        expectDarkHighlight(word);
    });

    // The ancestor-walk memo exists only to keep a paragraph of N words at one
    // walk instead of N. Hoisting it out of the pass (or keying it by anything
    // page-wide) would let one page's answer stand for the next one's, which is
    // the other half of the reported symptom: a decision made on a dark surface
    // outliving the surface. Assert a changed backdrop is always re-resolved.
    it('re-resolves the backdrop when the ancestor paint changes between passes', () => {
        const [word] = annotate('<div id="panel"><span class="jpdb-reader-word jpdb-known">読む</span></div>');
        expect(word.style.getPropertyValue('--jpdb-reader-highlight-backdrop')).toBe('rgb(255, 255, 255)');

        document.querySelector<HTMLElement>('#panel')!.style.backgroundColor = 'rgb(20, 22, 28)';
        refreshReaderWordContrast(document);

        expect(word.style.getPropertyValue('--jpdb-reader-highlight-backdrop')).toBe('rgb(20, 22, 28)');
        expectDarkHighlight(word);
    });
});
