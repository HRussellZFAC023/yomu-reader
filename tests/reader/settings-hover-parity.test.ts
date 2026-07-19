import { afterEach, describe, expect, it } from 'vitest';

import { canHoverLookupReaderWordElement } from '../../src/reader/app/dom-helpers';

function settingsWord(html: string): HTMLElement {
    document.body.innerHTML = `<div data-jpdb-reader-root class="jpdb-reader-settings">${html}</div>`;
    const word = document.querySelector<HTMLElement>('.jpdb-reader-word');
    if (!word) throw new Error('word not rendered');
    return word;
}

afterEach(() => {
    document.body.innerHTML = '';
});

// Settings words already click-look-up; hover parity was silently gated behind
// a hover-shortcut that is empty by default. Hover must now behave exactly like
// page surfaces, except on interactive controls which keep native behaviour.
describe('settings dialog hover lookup parity', () => {
    it('hover-looks-up plain annotated words without any shortcut held', () => {
        const word = settingsWord('<p><span class="jpdb-reader-word">設定</span></p>');
        expect(canHoverLookupReaderWordElement(word, false)).toBe(true);
    });

    it('hover-looks-up words inside labels (labels are prose carriers, not controls)', () => {
        const word = settingsWord('<label><span class="jpdb-reader-word">字幕</span><input type="checkbox"></label>');
        expect(canHoverLookupReaderWordElement(word, false)).toBe(true);
    });

    it('keeps buttons and links on their native pointer behaviour', () => {
        for (const wrapper of ['<button><span class="jpdb-reader-word">保存</span></button>', '<a href="#"><span class="jpdb-reader-word">寄付</span></a>']) {
            const word = settingsWord(wrapper);
            expect(canHoverLookupReaderWordElement(word, false)).toBe(false);
        }
    });
});
