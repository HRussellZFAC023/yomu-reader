import { describe, expect, it, vi } from 'vitest';

import { stripRubyInClampedRows } from '../../src/reader/dom';

function annotatedWord(furi = 'しんそつ', base = '新卒'): string {
    return `<span class="jpdb-reader-word jpdb-known"><ruby><span class="jpdb-reader-ruby-base">${base}</span><rp>(</rp><rt class="jpdb-reader-furi">${furi}</rt><rp>)</rp></ruby></span>`;
}

// UT-70: hosts can apply line-clamp AFTER we annotated (custom-element
// hydration on iPad Safari) — the sweep strips ruby from rows that became
// layout-sensitive so the base text is never cropped away.
describe('stripRubyInClampedRows', () => {
    it('strips ruby but keeps the word span inside a late-clamped title', () => {
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            width: 320, height: 40, top: 0, left: 0, right: 320, bottom: 40, x: 0, y: 0, toJSON: () => ({}),
        } as DOMRect);
        document.body.innerHTML = `
            <div id="title" style="display:-webkit-box;-webkit-line-clamp:2;overflow:hidden;max-height:40px;line-height:20px">
                ${annotatedWord()}エンジニアの勉強
            </div>
            <p id="prose">${annotatedWord('べんきょう', '勉強')}は楽しい。</p>
        `;
        const stripped = stripRubyInClampedRows(document);
        rectSpy.mockRestore();

        expect(stripped).toBe(1);
        const title = document.querySelector('#title .jpdb-reader-word')!;
        expect(title.querySelector('rt')).toBeNull();
        expect(title.textContent).toBe('新卒');
        expect(title.classList.contains('jpdb-known')).toBe(true);
        // untouched prose keeps its furigana
        expect(document.querySelector('#prose rt')?.textContent).toBe('べんきょう');
        document.body.innerHTML = '';
    });

    it('strips ruby in single-line ellipsis rows (channel bylines)', () => {
        document.body.innerHTML = `
            <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${annotatedWord()}チャンネル</div>
        `;
        expect(stripRubyInClampedRows(document)).toBe(1);
        expect(document.querySelector('rt')).toBeNull();
        document.body.innerHTML = '';
    });
});
