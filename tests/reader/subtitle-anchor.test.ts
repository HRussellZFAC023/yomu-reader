import { afterEach, describe, expect, it, vi } from 'vitest';
import { measureSubtitleAnchorHeight, reachableSubtitleBottomPercent } from '../../src/reader/subtitles/subtitle-layout';

afterEach(() => { document.body.innerHTML = ''; });

describe('caption viewport anchor', () => {
    it('keeps the baseline projection when a cue grows from one to two lines', () => {
        document.body.innerHTML = '<div id="root"><div class="jpdb-subtitle-text" style="padding-bottom:40px"><div class="jpdb-subtitle-primary-row" style="line-height:60px;padding-top:5px">日本語</div></div></div>';
        const root = document.querySelector<HTMLElement>('#root')!;
        const text = root.firstElementChild!;
        const rect = vi.spyOn(text, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 250, 500, 105));
        const position = () => reachableSubtitleBottomPercent({preferredBottomPercent:16, positionRect:new DOMRect(16, 68, 640, 360), viewportTop:250, viewportHeight:1194, subtitleHeight:measureSubtitleAnchorHeight(root)});
        const oneLine = position();
        text.firstElementChild!.textContent = '日本語の長い字幕です。';
        rect.mockReturnValue(new DOMRect(20, 190, 500, 165));
        expect(position()).toBe(oneLine);
    });

    it('converts its fixed clearance into a transformed player\'s viewport scale', () => {
        document.body.innerHTML = '<div id="root"><div class="jpdb-subtitle-text" style="padding-bottom:40px"><div class="jpdb-subtitle-primary-row" style="line-height:60px;padding-top:5px"></div></div></div>';
        const root = document.querySelector<HTMLElement>('#root')!;
        const unscaled = measureSubtitleAnchorHeight(root);
        Object.defineProperty(root, 'offsetHeight', {value:360});
        vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 320, 180));
        expect(measureSubtitleAnchorHeight(root)).toBe(unscaled / 2);
    });
});
