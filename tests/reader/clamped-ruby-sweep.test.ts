import { describe, expect, it, vi } from 'vitest';

import { makeRoomForRubyInCroppedRows } from '../../src/reader/dom';

function annotatedWord(furi = 'しんそつ', base = '新卒'): string {
    return `<span class="jpdb-reader-word jpdb-known"><ruby><span class="jpdb-reader-ruby-base">${base}</span><rp>(</rp><rt class="jpdb-reader-furi">${furi}</rt><rp>)</rp></ruby></span>`;
}

function mockOverflow(el: HTMLElement, scrollHeight: number, clientHeight: number): void {
    Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
}

// UT-70/79 (user direction): ruby that makes a clamped row overflow KEEPS its
// furigana — the box gets room instead (line-clamp boxes lose their
// plain-text max-height; other clipped boxes grow to their content height).
describe('makeRoomForRubyInCroppedRows', () => {
    it('lifts the max-height of a cropping line-clamp box and keeps the ruby', () => {
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            width: 320, height: 40, top: 0, left: 0, right: 320, bottom: 40, x: 0, y: 0, toJSON: () => ({}),
        } as DOMRect);
        document.body.innerHTML = `
            <div id="title" style="display:-webkit-box;-webkit-line-clamp:2;overflow:hidden;max-height:40px;line-height:20px">
                ${annotatedWord()}エンジニアの勉強
            </div>
            <p id="prose">${annotatedWord('べんきょう', '勉強')}は楽しい。</p>
        `;
        const titleBox = document.querySelector<HTMLElement>('#title')!;
        mockOverflow(titleBox, 56, 40);
        const adjusted = makeRoomForRubyInCroppedRows(document);
        rectSpy.mockRestore();

        expect(adjusted).toBe(1);
        expect(titleBox.style.maxHeight).toBe('none');
        expect(titleBox.dataset.yomuRubyRoom).toBe('true');
        // furigana survives everywhere
        expect(document.querySelectorAll('#title rt')).toHaveLength(1);
        expect(document.querySelector('#prose rt')?.textContent).toBe('べんきょう');
        document.body.innerHTML = '';
    });

    it('raises non-clamp clipped boxes to their content height once', () => {
        document.body.innerHTML = `
            <div id="byline" style="overflow:hidden;max-height:22px">${annotatedWord()}チャンネル</div>
        `;
        const byline = document.querySelector<HTMLElement>('#byline')!;
        mockOverflow(byline, 34, 22);
        expect(makeRoomForRubyInCroppedRows(document)).toBe(1);
        expect(byline.style.maxHeight).toBe('34px');
        expect(document.querySelector('#byline rt')).not.toBeNull();
        // repeated sweeps do not re-adjust
        expect(makeRoomForRubyInCroppedRows(document)).toBe(0);
        document.body.innerHTML = '';
    });

    it('leaves boxes alone when the ruby already fits', () => {
        document.body.innerHTML = `
            <div id="fits" style="display:-webkit-box;-webkit-line-clamp:4;overflow:hidden">${annotatedWord('べんきょう', '勉強')}します</div>
        `;
        const fits = document.querySelector<HTMLElement>('#fits')!;
        mockOverflow(fits, 80, 80);
        expect(makeRoomForRubyInCroppedRows(document)).toBe(0);
        expect(fits.style.maxHeight).toBe('');
        expect(document.querySelector('#fits rt')).not.toBeNull();
        document.body.innerHTML = '';
    });
});
