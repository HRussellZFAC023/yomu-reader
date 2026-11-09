import { afterEach, describe, expect, it, vi } from 'vitest';
import { refreshSubtitleWordUnderlines } from '../../src/reader/subtitles/subtitle-word-geometry';
import { reconcileSubtitlePrimaryRow } from '../../src/reader/subtitles/subtitle-rendering';

const originalRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
afterEach(() => {
    vi.restoreAllMocks();
    if (originalRects) Object.defineProperty(Range.prototype, 'getClientRects', originalRects);
    else Reflect.deleteProperty(Range.prototype, 'getClientRects');
});

function fixture() {
    const document = window.document.implementation.createHTMLDocument();
    const fonts = new EventTarget();
    Object.defineProperty(document, 'fonts', { value: fonts });
    const root = document.createElement('div');
    root.className = 'jpdb-subtitle-player';
    const primary = document.createElement('div');
    primary.className = 'jpdb-subtitle-primary';
    primary.style.font = '20px / 44px sans-serif';
    const word = document.createElement('span');
    word.className = 'jpdb-reader-word';
    word.style.cssText = 'display:inline-block;font-size:20px;line-height:44px;width:100px;height:88px';
    word.textContent = 'かなかなかなかな';
    primary.append(word);
    root.append(primary);
    document.body.append(root);
    let width = 100;
    let height = 88;
    let scale = 1;
    let textRects = [new DOMRect(0, 9, 100, 26), new DOMRect(0, 53, 60, 26)];
    Object.defineProperties(primary, {
        clientWidth: { get: () => width }, clientHeight: { get: () => height },
    });
    Object.defineProperty(word, 'offsetHeight', { get: () => height });
    word.getBoundingClientRect = () => new DOMRect(0, 0, width * scale, height * scale);
    const reads = vi.fn(function(this: Range) {
        if (this.startContainer.parentElement?.tagName === 'RT') throw new Error('reading entered base geometry');
        return textRects;
    });
    Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: reads });
    return {
        root, primary, word, fonts, reads,
        fragments: () => Array.from(word.querySelectorAll<HTMLElement>('[data-yomu-subtitle-fragment]')),
        resize(nextWidth: number, nextHeight: number) {
            width = nextWidth;
            height = nextHeight;
            word.style.width = `${width}px`;
            word.style.height = `${height}px`;
        },
        rects(next: DOMRect[]) { textRects = next; },
        scale(next: number) { scale = next; },
    };
}

describe('subtitle base-word underline geometry', () => {
    it('reserves the same reading lane before parsing and keeps unchanged cue ticks read-only', () => {
        const host = document.createElement('div');
        const input = { host, sourceText: '日本語です。', html: '日本語です。', appliedHtml: '', content: { lang: 'ja', dir: 'ltr' as const } };
        const plain = reconcileSubtitlePrimaryRow(input);
        const row = host.querySelector('.jpdb-subtitle-primary-row');
        expect(row?.classList.contains('jpdb-subtitle-has-kanji')).toBe(true);
        const html = '<span class="jpdb-reader-word"><ruby>日本語<rt>にほんご</rt></ruby></span>です。';
        reconcileSubtitlePrimaryRow({ ...input, html, appliedHtml: plain.appliedHtml });
        expect(host.querySelector('.jpdb-subtitle-primary-row')).toBe(row);
        const observer = new MutationObserver(() => {});
        observer.observe(host, { subtree: true, attributes: true, childList: true });
        reconcileSubtitlePrimaryRow({ ...input, html, appliedHtml: html });
        expect(observer.takeRecords()).toEqual([]);
        observer.disconnect();
        reconcileSubtitlePrimaryRow({ ...input, sourceText: 'かなです。', html: 'かなです。', appliedHtml: html });
        expect(row?.classList.contains('jpdb-subtitle-has-kanji')).toBe(false);
    });

    it('paints every internal line with a continuous compound-pitch lane and leaves source text intact', () => {
        const scene = fixture();
        refreshSubtitleWordUnderlines(scene.root);
        const fragments = scene.fragments();
        expect(fragments.map(fragment => [fragment.style.top, fragment.style.width])).toEqual([
            ['32px', '100px'], ['76px', '60px'],
        ]);
        expect(fragments.map(fragment => fragment.style.getPropertyValue('--jpdb-reader-source-gradient-width'))).toEqual(['160px', '160px']);
        expect(fragments.map(fragment => fragment.style.getPropertyValue('--jpdb-reader-source-gradient-offset'))).toEqual(['0px', '-100px']);
        expect(fragments.every(fragment => fragment.getAttribute('aria-hidden') === 'true' && fragment.textContent === '')).toBe(true);
        expect(scene.word.textContent).toBe('かなかなかなかな');
        expect(scene.word.hasAttribute('data-yomu-subtitle-wrapped')).toBe(true);
    });

    it('keeps unchanged ticks read-only, removes fragments when widened, and restores them when narrowed', () => {
        const scene = fixture();
        refreshSubtitleWordUnderlines(scene.root);
        const first = scene.fragments();
        const observer = new MutationObserver(() => {});
        observer.observe(scene.primary, { subtree: true, childList: true, attributes: true });
        for (let i = 0; i < 10; i += 1) refreshSubtitleWordUnderlines(scene.root);
        expect(scene.reads).toHaveBeenCalledTimes(1);
        expect(observer.takeRecords()).toEqual([]);
        expect(scene.fragments()).toEqual(first);
        observer.disconnect();
        scene.resize(200, 44);
        refreshSubtitleWordUnderlines(scene.root);
        expect(scene.fragments()).toEqual([]);
        expect(scene.word.hasAttribute('data-yomu-subtitle-wrapped')).toBe(false);
        scene.resize(100, 88);
        refreshSubtitleWordUnderlines(scene.root);
        expect(scene.fragments()).toHaveLength(2);
        scene.primary.style.letterSpacing = '1px';
        refreshSubtitleWordUnderlines(scene.root);
        expect(scene.reads).toHaveBeenCalledTimes(3);
        // With nondefault features a browser may serialize font shorthand as
        // empty. Fixed outer dimensions must still detect a family change.
        const computed = window.getComputedStyle.bind(window);
        vi.spyOn(window, 'getComputedStyle').mockImplementation(element => {
            const style = computed(element);
            Object.defineProperty(style, 'font', { value: '' });
            return style;
        });
        scene.primary.style.fontFeatureSettings = '"palt"';
        refreshSubtitleWordUnderlines(scene.root);
        scene.primary.style.font = '20px / 44px serif';
        scene.primary.style.fontFeatureSettings = '"palt"';
        refreshSubtitleWordUnderlines(scene.root);
        expect(scene.reads).toHaveBeenCalledTimes(5);
    });

    it('updates a loaded font at fixed dimensions and reuses fragments without retaining departed players', () => {
        const scene = fixture();
        refreshSubtitleWordUnderlines(scene.root);
        const first = scene.fragments();
        scene.rects([new DOMRect(0, 12, 100, 30), new DOMRect(0, 56, 60, 30)]);
        scene.fonts.dispatchEvent(new Event('loadingdone'));
        expect(scene.fragments()).toEqual(first);
        expect(scene.fragments().map(fragment => fragment.style.top)).toEqual(['37px', '81px']);
        expect(scene.reads).toHaveBeenCalledTimes(2);
        scene.root.remove();
        scene.fonts.dispatchEvent(new Event('loadingdone'));
        expect(scene.reads).toHaveBeenCalledTimes(2);
    });

    it('normalizes transformed Range coordinates and merges base runs while excluding readings', () => {
        const scene = fixture();
        scene.scale(1.25);
        scene.word.innerHTML = '<ruby><span>日本</span><rt>にほん</rt></ruby>かな';
        const rangeRects = vi.fn(function(this: Range) {
            if (this.startContainer.parentElement?.tagName === 'RT') throw new Error('reading entered base geometry');
            return this.startContainer.textContent === '日本'
                ? [new DOMRect(0, 11.25, 50, 32.5)]
                : [new DOMRect(50, 11.25, 75, 32.5), new DOMRect(0, 66.25, 75, 32.5)];
        });
        Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: rangeRects });
        refreshSubtitleWordUnderlines(scene.root);
        expect(scene.fragments().map(fragment => [fragment.style.top, fragment.style.width])).toEqual([
            ['32px', '100px'], ['76px', '60px'],
        ]);
        expect(rangeRects).toHaveBeenCalledTimes(2);
    });

    it('ignores empty caption roots, empty internal lines and unavailable layout boxes', () => {
        const scene = fixture();
        expect(() => refreshSubtitleWordUnderlines(document.createElement('div'))).not.toThrow();
        scene.rects([new DOMRect(0, 53, 60, 26)]);
        refreshSubtitleWordUnderlines(scene.root);
        expect(scene.fragments()).toEqual([]);
        scene.primary.replaceChildren(scene.word.cloneNode(true));
        refreshSubtitleWordUnderlines(scene.root);
        expect(scene.primary.querySelector('[data-yomu-subtitle-fragment]')).toBeNull();
        scene.primary.replaceChildren(scene.word);
        scene.resize(0, 0);
        scene.word.style.width = 'auto';
        scene.word.style.height = 'auto';
        refreshSubtitleWordUnderlines(scene.root);
        expect(scene.fragments()).toEqual([]);
    });
});
