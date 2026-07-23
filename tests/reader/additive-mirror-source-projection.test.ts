import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { projectAdditiveTextMirror } from '../../src/reader/dom';

function rect(left: number, top = 50, width = 40, height = 16): DOMRect {
    return {
        left, top, width, height,
        right: left + width, bottom: top + height,
        x: left, y: top,
        toJSON: () => ({}),
    } as DOMRect;
}

let sourceRects: DOMRect[] = [];
let sourceRectsForRange: (range: Range) => DOMRect[] = () => sourceRects;
const rangeProto = Range.prototype as unknown as { getClientRects?: () => DOMRect[] };
const hadNativeRangeRects = 'getClientRects' in rangeProto;

function scene(): { host: HTMLElement; mirror: HTMLElement; word: HTMLElement } {
    const host = document.createElement('div');
    host.append(document.createTextNode('投票'));
    Object.defineProperty(host, 'getBoundingClientRect', { configurable: true, value: () => rect(100, 50, 100, 20) });
    document.body.append(host);

    const mirror = document.createElement('div');
    mirror.className = 'jpdb-reader-text-mirror jpdb-reader-additive-text-mirror';
    mirror.dataset.sourceText = '投票';
    Object.defineProperty(mirror, 'getBoundingClientRect', { configurable: true, value: () => rect(100, 50, 100, 20) });
    Object.defineProperty(mirror, 'offsetWidth', { configurable: true, value: 100 });
    Object.defineProperty(mirror, 'offsetHeight', { configurable: true, value: 20 });

    const word = document.createElement('span');
    word.className = 'jpdb-reader-word jpdb-reader-scan-word';
    word.dataset.yomuSourceStart = '0';
    word.dataset.yomuSourceEnd = '2';
    word.textContent = '投票';
    mirror.append(word);
    host.append(mirror);
    return { host, mirror, word };
}

beforeEach(() => {
    sourceRects = [];
    sourceRectsForRange = () => sourceRects;
    Object.defineProperty(rangeProto, 'getClientRects', {
        configurable: true,
        value(this: Range) { return sourceRectsForRange(this); },
    });
});

afterEach(() => {
    if (!hadNativeRangeRects) delete rangeProto.getClientRects;
    document.body.innerHTML = '';
});

describe('additive text-mirror source projection', () => {
    it('sizes the projection shell to a bordered host padding box', () => {
        const { host, mirror } = scene();
        Object.defineProperties(host, {
            clientWidth: { configurable: true, value: 98 },
            clientHeight: { configurable: true, value: 18 },
            offsetWidth: { configurable: true, value: 100 },
            offsetHeight: { configurable: true, value: 20 },
        });
        sourceRects = [rect(130, 54, 32, 16)];

        projectAdditiveTextMirror(mirror, host);

        expect(mirror.style.width).toBe('98px');
        expect(mirror.style.height).toBe('18px');
    });

    it('projects a decoration box onto the source range', () => {
        const { host, mirror, word } = scene();
        sourceRects = [rect(130, 54, 32, 16)];

        projectAdditiveTextMirror(mirror, host);

        const fragment = word.querySelector<HTMLElement>('.jpdb-reader-source-fragment');
        expect(fragment?.style.left).toBe('30px');
        expect(fragment?.style.top).toBe('4px');
        expect(fragment?.style.width).toBe('32px');
        expect(mirror.dataset.yomuSourceProjected).toBe('true');
        expect(mirror.style.transform).toBe('none');
    });

    it('creates one decoration box for every wrapped source fragment', () => {
        const { host, mirror, word } = scene();
        sourceRects = [rect(180, 50, 20, 16), rect(100, 70, 24, 16)];

        projectAdditiveTextMirror(mirror, host);

        const fragments = word.querySelectorAll<HTMLElement>('.jpdb-reader-source-fragment');
        expect(fragments).toHaveLength(2);
        expect([...fragments].map(fragment => fragment.style.left)).toEqual(['80px', '0px']);
        expect([...fragments].map(fragment => fragment.style.top)).toEqual(['0px', '20px']);
    });

    it('keeps a late component-pitch gradient continuous across wrapped 登録者数 fragments', () => {
        const { host, mirror, word } = scene();
        host.firstChild!.textContent = '登録者数';
        mirror.dataset.sourceText = '登録者数';
        word.textContent = '登録者数';
        word.dataset.yomuSourceStart = '0';
        word.dataset.yomuSourceEnd = '4';
        sourceRects = [rect(180, 50, 20, 16), rect(100, 70, 44, 16)];

        projectAdditiveTextMirror(mirror, host);
        // Pitch enrichment can arrive after projection. The fragments already
        // carry the complete-word coordinate system it needs.
        word.dataset.pitchComponents = 'true';
        word.style.setProperty('--jpdb-reader-inline-pitch-gradient', 'linear-gradient(to right, red, blue)');

        const fragments = [...word.querySelectorAll<HTMLElement>('.jpdb-reader-source-fragment')];
        expect(fragments).toHaveLength(2);
        expect(fragments.map(fragment => fragment.style.getPropertyValue('--jpdb-reader-source-gradient-width')))
            .toEqual(['64px', '64px']);
        expect(fragments.map(fragment => fragment.style.getPropertyValue('--jpdb-reader-source-gradient-offset')))
            .toEqual(['0px', '-20px']);
    });

    it('merges duplicate and nested source rects on the same line', () => {
        const { host, mirror, word } = scene();
        sourceRects = [rect(130, 54, 32, 16), rect(130, 54, 16, 16), rect(146, 54, 16, 16)];

        projectAdditiveTextMirror(mirror, host);

        const fragments = word.querySelectorAll<HTMLElement>('.jpdb-reader-source-fragment');
        expect(fragments).toHaveLength(1);
        expect(fragments[0].style.left).toBe('30px');
        expect(fragments[0].style.width).toBe('32px');
    });

    it('keeps the wrapped 可愛すぎる title token on both YouTube source lines', () => {
        const { host, mirror, word } = scene();
        const title = '外国人彼女の注文が可愛すぎる🥰';
        host.firstChild!.textContent = title;
        mirror.dataset.sourceText = title;
        word.textContent = '可愛すぎる';
        word.dataset.yomuSourceStart = '9';
        word.dataset.yomuSourceEnd = '15';
        sourceRects = [rect(180, 50, 20, 16), rect(100, 70, 52, 16)];

        projectAdditiveTextMirror(mirror, host);

        const fragments = word.querySelectorAll<HTMLElement>('.jpdb-reader-source-fragment');
        expect([...fragments].map(fragment => [fragment.style.left, fragment.style.top, fragment.style.width]))
            .toEqual([['80px', '0px', '20px'], ['0px', '20px', '52px']]);
    });

    it('replaces stale fragment boxes on reflow', () => {
        const { host, mirror, word } = scene();
        sourceRects = [rect(120)];
        projectAdditiveTextMirror(mirror, host);
        sourceRects = [rect(140)];

        projectAdditiveTextMirror(mirror, host);

        const fragments = word.querySelectorAll<HTMLElement>('.jpdb-reader-source-fragment');
        expect(fragments).toHaveLength(1);
        expect(fragments[0].style.left).toBe('40px');
    });

    it('anchors a detached reading to its own source characters', () => {
        const { host, mirror, word } = scene();
        word.innerHTML = '<span class="jpdb-reader-detached-ruby" data-yomu-source-start="1" data-yomu-source-end="2"><span class="jpdb-reader-ruby-base">票</span><span class="jpdb-reader-detached-furi">ひょう</span></span>';
        sourceRectsForRange = range => range.startOffset === 1
            ? [rect(150, 54, 16, 16)]
            : [rect(130, 54, 32, 16)];

        projectAdditiveTextMirror(mirror, host);

        const ruby = word.querySelector<HTMLElement>('.jpdb-reader-detached-ruby');
        expect(ruby?.style.left).toBe('50px');
        expect(ruby?.style.top).toBe('4px');
        expect(ruby?.style.width).toBe('16px');
        expect(ruby?.style.height).toBe('16px');
        expect(ruby?.querySelector<HTMLElement>('.jpdb-reader-detached-furi')?.style.display).toBe('');
        const projected = document.querySelector<HTMLElement>('[data-yomu-projected-reading="true"]');
        expect(projected?.textContent).toBe('ひょう');
        expect(projected?.style.left).toBe('158px');
        expect(projected?.style.top).toBe('54px');
        expect(projected?.style.transform).toBe('translate(-50%, -100%)');
    });

    it('hides an unmeasurable reading instead of retaining stale coordinates', () => {
        const { host, mirror, word } = scene();
        word.innerHTML = '<span class="jpdb-reader-detached-ruby" data-yomu-source-start="1" data-yomu-source-end="2"><span class="jpdb-reader-ruby-base">票</span><span class="jpdb-reader-detached-furi">ひょう</span></span>';
        sourceRectsForRange = range => range.startOffset === 1
            ? [rect(150, 54, 16, 16)]
            : [rect(130, 54, 32, 16)];
        projectAdditiveTextMirror(mirror, host);
        expect(document.querySelector('[data-yomu-projected-reading="true"]')).toBeTruthy();

        sourceRectsForRange = range => range.startOffset === 1
            ? []
            : [rect(130, 54, 32, 16)];
        projectAdditiveTextMirror(mirror, host);

        expect(document.querySelector('[data-yomu-projected-reading="true"]')).toBeNull();
    });

    it('centres ばい over the 倍 range rather than the complete 1.00 倍 label', () => {
        const { host, mirror, word } = scene();
        host.firstChild!.textContent = '1.00 倍';
        mirror.dataset.sourceText = '1.00 倍';
        word.dataset.yomuSourceStart = '0';
        word.dataset.yomuSourceEnd = '6';
        word.innerHTML = '<span class="jpdb-reader-detached-ruby" data-yomu-source-start="5" data-yomu-source-end="6"><span class="jpdb-reader-ruby-base">倍</span><span class="jpdb-reader-detached-furi">ばい</span></span>';
        const measuredRanges: Array<[number, number]> = [];
        sourceRectsForRange = range => {
            measuredRanges.push([range.startOffset, range.endOffset]);
            return range.startOffset === 5 && range.endOffset === 6
                ? [rect(168, 54, 16, 16)]
                : [rect(112, 54, 72, 16)];
        };

        projectAdditiveTextMirror(mirror, host);

        const projected = document.querySelector<HTMLElement>('[data-yomu-projected-reading="true"]');
        expect(measuredRanges).toEqual(expect.arrayContaining([[0, 6], [5, 6]]));
        expect(projected?.textContent).toBe('ばい');
        expect(projected?.style.left).toBe('176px');
        expect(host.style.overflow).toBe('');
    });

    it('remeasures the live source range when the page scrolls', async () => {
        const { host, mirror, word } = scene();
        word.innerHTML = '<span class="jpdb-reader-detached-ruby" data-yomu-source-start="1" data-yomu-source-end="2"><span class="jpdb-reader-ruby-base">票</span><span class="jpdb-reader-detached-furi">ひょう</span></span>';
        sourceRectsForRange = range => range.startOffset === 1
            ? [rect(150, 54, 16, 16)]
            : [rect(130, 54, 32, 16)];
        projectAdditiveTextMirror(mirror, host);

        sourceRectsForRange = range => range.startOffset === 1
            ? [rect(150, 94, 16, 16)]
            : [rect(130, 94, 32, 16)];
        document.dispatchEvent(new Event('scroll'));
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

        const projected = document.querySelector<HTMLElement>('[data-yomu-projected-reading="true"]');
        expect(projected?.style.left).toBe('158px');
        expect(projected?.style.top).toBe('94px');
    });
});
