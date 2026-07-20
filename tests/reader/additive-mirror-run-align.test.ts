import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { alignAdditiveTextMirrorRun } from '../../src/reader/dom';

function rect(left: number, top = 0, width = 40, height = 16): DOMRect {
    return {
        left, top, width, height,
        right: left + width, bottom: top + height,
        x: left, y: top,
        toJSON: () => ({}),
    } as DOMRect;
}

// jsdom's Range has no layout, so getClientRects is absent. The source guards
// on its presence (real browsers always have it); install a stub the source's
// Range measurement reads from so hostSourceRunLeft returns a real edge.
let stubbedSourceRects: DOMRect[] = [];
const rangeProto = Range.prototype as unknown as { getClientRects?: () => DOMRect[] };
const hadNativeRangeRects = 'getClientRects' in rangeProto;

// Build a host whose page-owned text run reports `sourceLeft` and a mirror
// whose transparent word reports `mirrorLeft`. hostSourceRunLeft measures the
// source through a Range (stubbed globally); the mirror word reports its own
// client rects directly.
function scene(sourceLeft: number, mirrorLeft: number): { host: HTMLElement; mirror: HTMLElement; word: HTMLElement } {
    const host = document.createElement('div');
    host.textContent = '投票';
    document.body.append(host);

    const mirror = document.createElement('div');
    mirror.className = 'jpdb-reader-text-mirror jpdb-reader-additive-text-mirror';
    const word = document.createElement('span');
    word.className = 'jpdb-reader-word jpdb-reader-scan-word';
    word.textContent = '投票';
    word.dataset.yomuSourceStart = '0';
    word.dataset.yomuSourceEnd = '2';
    Object.defineProperty(word, 'getClientRects', { configurable: true, value: () => [rect(mirrorLeft)] });
    mirror.append(word);
    host.append(mirror);

    stubbedSourceRects = [rect(sourceLeft)];
    return { host, mirror, word };
}

beforeEach(() => {
    stubbedSourceRects = [];
    Object.defineProperty(rangeProto, 'getClientRects', {
        configurable: true,
        value: () => stubbedSourceRects,
    });
});

afterEach(() => {
    // jsdom ships no native Range.getClientRects, so removing the stub restores
    // the original (absent) shape rather than clobbering an engine method.
    if (!hadNativeRangeRects) delete rangeProto.getClientRects;
    document.body.innerHTML = '';
});

describe('additive text-mirror run alignment', () => {
    it('translates the mirror by the residual when the source run starts inside the box', () => {
        // A leading icon sibling pushes the real glyphs 30px right of the
        // padding-box origin the mirror is pinned to.
        const { mirror, host } = scene(130, 100);
        alignAdditiveTextMirrorRun(mirror, host);
        expect(mirror.style.transform).toBe('translateX(30px)');
    });

    it('leaves an already-aligned run untransformed (no churn on ordinary prose)', () => {
        const { mirror, host } = scene(100, 100);
        alignAdditiveTextMirrorRun(mirror, host);
        expect(mirror.style.transform).toBe('');
    });

    it('preserves the vertical-centring correction when adding the horizontal shift', () => {
        const { mirror, host } = scene(130, 100);
        // styleTextMirror centres a vertically-centred control before alignment.
        mirror.style.setProperty('transform', 'translateY(-50%)');
        alignAdditiveTextMirrorRun(mirror, host);
        expect(mirror.style.transform).toBe('translateX(30px) translateY(-50%)');
    });

    it('folds a re-align onto the existing translateX (idempotent under settle)', () => {
        const { mirror, host, word } = scene(130, 100);
        alignAdditiveTextMirrorRun(mirror, host);
        expect(mirror.style.transform).toBe('translateX(30px)');
        // After the shift the mirror word now paints at 130 — a settle re-align
        // measures zero residual and leaves the transform exactly where it was.
        Object.defineProperty(word, 'getClientRects', { configurable: true, value: () => [rect(130)] });
        alignAdditiveTextMirrorRun(mirror, host);
        expect(mirror.style.transform).toBe('translateX(30px)');
    });

    it('does nothing without a stamped source word', () => {
        const host = document.createElement('div');
        host.textContent = '投票';
        document.body.append(host);
        const mirror = document.createElement('div');
        mirror.className = 'jpdb-reader-text-mirror jpdb-reader-additive-text-mirror';
        host.append(mirror);
        alignAdditiveTextMirrorRun(mirror, host);
        expect(mirror.style.transform).toBe('');
    });
});
