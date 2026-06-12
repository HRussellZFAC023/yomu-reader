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
        // jsdom has no layout — simulate the ruby-grown content overflowing
        // the clamped box (the sweep strips on MEASURED crops only).
        const titleBox = document.querySelector<HTMLElement>('#title')!;
        Object.defineProperty(titleBox, 'scrollHeight', { value: 56, configurable: true });
        Object.defineProperty(titleBox, 'clientHeight', { value: 40, configurable: true });
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
            <div id="byline" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${annotatedWord()}チャンネル</div>
        `;
        const byline = document.querySelector<HTMLElement>('#byline')!;
        Object.defineProperty(byline, 'scrollHeight', { value: 34, configurable: true });
        Object.defineProperty(byline, 'clientHeight', { value: 22, configurable: true });
        expect(stripRubyInClampedRows(document)).toBe(1);
        expect(document.querySelector('rt')).toBeNull();
        document.body.innerHTML = '';
    });

    it('keeps furigana in mobile YouTube watch metadata and description rows', () => {
        document.body.innerHTML = `
            <ytm-slim-video-metadata-section-renderer>
                <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                    ${annotatedWord('しちょう', '視聴')} 2026/06/12
                </div>
            </ytm-slim-video-metadata-section-renderer>
            <ytm-video-description-transcript-section-renderer>
                <div style="display:-webkit-box;-webkit-line-clamp:1;overflow:hidden;max-height:24px">
                    ${annotatedWord('もじ', '文字')}起こしを表示
                </div>
            </ytm-video-description-transcript-section-renderer>
        `;

        expect(stripRubyInClampedRows(document)).toBe(0);
        expect(document.querySelector('ytm-slim-video-metadata-section-renderer rt')?.textContent).toBe('しちょう');
        expect(document.querySelector('ytm-video-description-transcript-section-renderer rt')?.textContent).toBe('もじ');
        document.body.innerHTML = '';
    });
});


// UT-79: the sweep is measurement-driven — ruby that FITS stays, even inside
// clamp-capable boxes (deleting the need for per-site force-ruby whitelists).
describe('evidence-based sweep keeps fitting ruby', () => {
    it('does not strip when the clamped box is not actually overflowing', () => {
        document.body.innerHTML = `
            <div id="fits" style="display:-webkit-box;-webkit-line-clamp:4;overflow:hidden">${'<span class="jpdb-reader-word"><ruby><span class="jpdb-reader-ruby-base">勉強</span><rt class="jpdb-reader-furi">べんきょう</rt></ruby></span>'}します</div>
        `;
        const fits = document.querySelector<HTMLElement>('#fits')!;
        Object.defineProperty(fits, 'scrollHeight', { value: 80, configurable: true });
        Object.defineProperty(fits, 'clientHeight', { value: 80, configurable: true });
        expect(stripRubyInClampedRows(document)).toBe(0);
        expect(document.querySelector('#fits rt')).not.toBeNull();
        document.body.innerHTML = '';
    });
});
