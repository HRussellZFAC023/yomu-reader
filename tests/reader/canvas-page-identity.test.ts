// The cross-mode OCR identity invariant matrix Cycle 1 demands:
//   same content  → exactly ONE scan
//   changed content → exactly ONE rescan
// exercised across every canvas-viewer mode representable in jsdom:
//   1. paged        — the viewer swaps `.currentScreen` between page buffers.
//   2. cty=2 vertical — content changes while scroll stays 0 and the same DOM
//                       surface (node) is reused (the historical churn source).
//   3. node-reuse   — the SAME canvas object is repainted with a new page.
//
// Half the matrix is asserted directly against the identity primitive
// (canvas-page-identity) — the single content-derived source of truth — so a
// regression in "epoch flash must not read as a change" fails here loudly and
// cheaply. The other half drives the real ImageOcrController and counts
// captureCanvasMirror calls (the OCR scan trigger for a tainted DRM canvas) to pin
// the scan/rescan counts end-to-end.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ImageOcrController } from '../../src/reader/ocr/controller';
import {
    hasIdentityChanged,
    identityForCanvas,
    isGlobalEpochTransition,
    isRealContentChange,
    isRealContentIdentity,
    isSameRealContent,
    stableContentIdentityForCanvas,
} from '../../src/reader/ocr/canvas-page-identity';
import type { MirrorGlobalState, MirrorRecord } from '../../src/reader/ocr/canvas-mirror';
import { canvasMirrorTurnToken } from '../../src/reader/ocr/canvas-mirror';
import { testEnSettings } from './helpers/settings-fixture';
import type { ReaderSettings } from '../../src/reader/app/types';
import { waitForExpect } from './test-utils';
import { privateRasterImageForHost } from '../../src/reader/ocr/private-raster-presenter';

const EPOCH_ATTR = 'data-yomu-mirror-epoch';

function privateCanvasFrames(): HTMLImageElement[] {
    return [...document.querySelectorAll('.jpdb-ocr-canvas-frame')]
        .map(privateRasterImageForHost)
        .filter((image): image is HTMLImageElement => Boolean(image));
}

function privateCanvasFrame(): HTMLImageElement | null {
    return privateCanvasFrames()[0] ?? null;
}
const originalGetContext = HTMLCanvasElement.prototype.getContext;

function stubTaintedCanvas(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (HTMLCanvasElement.prototype as any).getContext = () => ({
        drawImage() {},
        getImageData() { throw new Error('The operation is insecure.'); },
    });
}

function stubReadableCanvasHash(hash: number): void {
    // A distinct opaque, high-contrast pattern per `hash` so canvasRenderedContentSignature
    // returns a different real token for a different page and the same one for a repaint.
    const data = new Uint8ClampedArray(20 * 20 * 4);
    for (let pixel = 0; pixel < 400; pixel++) {
        const value = (pixel * hash + 7) % 256;
        data[pixel * 4] = value;
        data[pixel * 4 + 1] = value;
        data[pixel * 4 + 2] = value;
        data[pixel * 4 + 3] = 255;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (HTMLCanvasElement.prototype as any).getContext = () => ({
        drawImage() {},
        getImageData: () => ({ data }),
    });
}

function imageOp(url: string, seq: number) {
    return { seq, srcId: null, url, sx: 0, sy: 0, sw: -1, sh: -1, dx: 0, dy: 0, dw: -1, dh: -1, clear: false };
}

function seedMirror(records: Record<string, MirrorRecord>): MirrorGlobalState {
    const state: MirrorGlobalState = { seq: 1000, nextId: 100, installed: true, epoch: 5, records };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__yomuCanvasMirror = state;
    return state;
}

function bumpEpoch(value: number): void {
    document.documentElement.setAttribute(EPOCH_ATTR, String(value));
}

function taintedCanvas(mid: string): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 2202;
    canvas.height = 3132;
    canvas.setAttribute('data-yomu-mid', mid);
    return canvas;
}

// A vertical (cty=2) stacked surface: `.canvasRoot.verticalAxis` under #viewportW,
// which canvasReaderHasStableSurface recognises as the stable BookWalker surface.
function verticalSurfaceCanvas(mid: string, id: string, top: number): HTMLCanvasElement {
    let root = document.getElementById('viewportW');
    if (!root) {
        root = Object.assign(document.createElement('div'), { id: 'viewportW' });
        document.body.append(root);
    }
    const surface = Object.assign(document.createElement('div'), { id });
    surface.className = 'canvasRoot verticalAxis';
    const canvas = taintedCanvas(mid);
    canvas.getBoundingClientRect = () => new DOMRect(120, top, 760, 1074);
    canvas.toDataURL = () => { throw new Error('The operation is insecure.'); };
    surface.append(canvas);
    root.append(surface);
    return canvas;
}

function pageCounter(text: string): HTMLElement {
    const counter = Object.assign(document.createElement('span'), { id: 'pageSliderCounter', textContent: text });
    document.body.append(counter);
    return counter;
}

function mirrorCanvas(label: string): HTMLCanvasElement {
    const mirror = document.createElement('canvas');
    mirror.width = 1200;
    mirror.height = 1600;
    mirror.toDataURL = () => `data:image/jpeg;base64,${label}`;
    return mirror;
}

function stubLocation(hostname: string, search = ''): void {
    vi.stubGlobal('location', {
        hostname,
        href: `https://${hostname}/reader${search}`,
        origin: `https://${hostname}`,
        protocol: 'https:',
    });
}

function createController(
    captureCanvasMirror: (canvas: HTMLCanvasElement, load: (url: string) => Promise<CanvasImageSource | undefined>) => Promise<HTMLCanvasElement | undefined>,
    overrides: Partial<ReaderSettings> = {},
): ImageOcrController {
    const controller = new ImageOcrController({
        getSettings: () => ({
            ...testEnSettings(),
            ocrEnabled: true,
            ocrAutoScanImages: true,
            ocrMinImageArea: 1,
            ocrMaxImagePixels: 10_000_000,
            ocrPrefetchMargin: 0,
            ...overrides,
        }),
        parseJapanese: vi.fn(async () => []),
        onToast: vi.fn(),
        shouldAutoScan: () => true,
        captureCanvasMirror,
    });
    controller.init();
    return controller;
}

beforeEach(() => {
    stubLocation('viewer.bookwalker.jp', '?cid=abc&cty=2');
});

afterEach(() => {
    document.body.replaceChildren();
    document.documentElement.removeAttribute(EPOCH_ATTR);
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).__yomuCanvasMirror;
    vi.unstubAllGlobals();
});

// ─────────────────────────────────────────────────────────────────────────────
// Primitive-level invariants: the content-derived token is stable per page and
// moves exactly once per real content change, regardless of epoch churn.
// ─────────────────────────────────────────────────────────────────────────────
describe('canvas-page-identity primitive', () => {
    it('classifies bare-epoch / empty / surface tokens as NOT real content', () => {
        expect(isRealContentIdentity('')).toBe(false);
        expect(isRealContentIdentity('42')).toBe(false);
        expect(isRealContentIdentity('42,43')).toBe(false);
        expect(isRealContentIdentity('s:wideScreen26:2202x3132')).toBe(false);
        expect(isRealContentIdentity('m:https://cdn/pageA.jpg:0:0')).toBe(true);
        expect(isRealContentIdentity('cv:abc:1200x1600')).toBe(true);
    });

    it('reports a real content change only when both sides are real and differ', () => {
        expect(isRealContentChange('m:a', 'm:b')).toBe(true);
        expect(isRealContentChange('m:a', 'm:a')).toBe(false); // same page
        expect(isRealContentChange('m:a', '')).toBe(false);    // to unknown = not a change
        expect(isRealContentChange('', 'm:a')).toBe(false);    // from unknown = not a change
        expect(isRealContentChange('7', '8')).toBe(false);     // bare epoch churn = not a change
        expect(isSameRealContent('m:a', 'm:a')).toBe(true);
        expect(isSameRealContent('7', '7')).toBe(false);       // same epoch is not proof of same page
    });

    it('reports an epoch transition only when neither side is real content', () => {
        expect(isGlobalEpochTransition('7', '8')).toBe(true);
        expect(isGlobalEpochTransition('', '8')).toBe(true);
        expect(isGlobalEpochTransition('m:a', 'm:b')).toBe(false); // real content wins
        expect(isGlobalEpochTransition('7', '7')).toBe(false);     // no move
    });
});

describe('OCR identity invariants — cty=2 vertical (scroll 0, node reused)', () => {
    it('SAME content across an epoch flash → identity is unchanged (no rescan trigger)', () => {
        seedMirror({ m6: { w: 2202, h: 3132, ops: [imageOp('https://cdn/pageA.jpg', 1)] } });
        const canvas = verticalSurfaceCanvas('m6', 'wideScreen6', 64);

        const first = stableContentIdentityForCanvas(canvas);
        expect(isRealContentIdentity(first)).toBe(true);

        // The exact churn from the bug report: the global epoch ticks while the SAME
        // page stays painted (another surface composites, a repaint, devtools open).
        bumpEpoch(101);
        expect(stableContentIdentityForCanvas(canvas)).toBe(first);
        expect(hasIdentityChanged(canvas, first)).toBe(false);
        bumpEpoch(102);
        expect(hasIdentityChanged(canvas, first)).toBe(false);
    });

    it('CHANGED content (same node, scroll unchanged) → identity moves exactly once', () => {
        const records: Record<string, MirrorRecord> = {
            m6: { w: 2202, h: 3132, ops: [imageOp('https://cdn/pageA.jpg', 1)] },
        };
        seedMirror(records);
        const canvas = verticalSurfaceCanvas('m6', 'wideScreen6', 64);
        const before = stableContentIdentityForCanvas(canvas);

        // The engine repaints the SAME canvas node with a NEW page image. Scroll offset
        // never entered identity, so this is the only thing that can move it.
        records.m6!.ops.push(imageOp('https://cdn/pageB.jpg', 1500));

        const after = stableContentIdentityForCanvas(canvas);
        expect(hasIdentityChanged(canvas, before)).toBe(true);
        expect(after).not.toBe(before);
        expect(isRealContentIdentity(after)).toBe(true);

        // Idempotent: comparing the NEW identity to itself is not another change,
        // so a settled page does not rescan on every poll.
        expect(hasIdentityChanged(canvas, after)).toBe(false);
    });

    it('scroll alone (rect changes, content identical) does NOT change identity', () => {
        seedMirror({ m6: { w: 2202, h: 3132, ops: [imageOp('https://cdn/pageA.jpg', 1)] } });
        const canvas = verticalSurfaceCanvas('m6', 'wideScreen6', 64);
        const before = stableContentIdentityForCanvas(canvas);

        // Simulate a vertical scroll: the same canvas moves up the viewport. Its
        // rendered content is unchanged, so identity must hold.
        canvas.getBoundingClientRect = () => new DOMRect(120, -320, 760, 1074);
        expect(hasIdentityChanged(canvas, before)).toBe(false);
    });
});

describe('OCR identity invariants — paged (currentScreen swap, readable canvas)', () => {
    it('same rendered page → same identity; different page → different identity', () => {
        stubLocation('viewer.bookwalker.jp'); // paged (no cty=2), readable
        stubReadableCanvasHash(11);
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 1600;
        const pageA = identityForCanvas(canvas);
        expect(isRealContentIdentity(pageA)).toBe(true);

        // Repaint with the SAME pattern → same pixel hash → same identity.
        stubReadableCanvasHash(11);
        expect(identityForCanvas(canvas)).toBe(pageA);

        // A real page turn paints different pixels → different identity, exactly once.
        stubReadableCanvasHash(29);
        const pageB = identityForCanvas(canvas);
        expect(pageB).not.toBe(pageA);
        expect(isRealContentIdentity(pageB)).toBe(true);
        stubReadableCanvasHash(29);
        expect(identityForCanvas(canvas)).toBe(pageB);
    });

    it('retains a tainted paged canvas mirror token after the counter advances before paint', () => {
        stubLocation('viewer.bookwalker.jp');
        stubTaintedCanvas();
        seedMirror({ m2: { w: 2202, h: 3132, ops: [imageOp('https://cdn/pageA.jpg', 1)] } });
        const canvas = taintedCanvas('m2');

        const beforePaint = stableContentIdentityForCanvas(canvas);
        expect(isRealContentIdentity(beforePaint)).toBe(true);

        const records = (globalThis as typeof globalThis & { __yomuCanvasMirror: MirrorGlobalState }).__yomuCanvasMirror.records;
        records.m2!.ops.push({
            seq: 2,
            srcId: null,
            url: '',
            sx: 0,
            sy: 0,
            sw: -1,
            sh: -1,
            dx: 0,
            dy: 0,
            dw: -1,
            dh: -1,
            clear: true,
        });
        records.m2!.ops.push(imageOp('https://cdn/pageB.jpg', 3));

        expect(hasIdentityChanged(canvas, beforePaint)).toBe(true);
    });
});

describe('OCR identity invariants — end-to-end scan counts (controller)', () => {
    it('paged readable BookWalker: repairs the pre-paint race through its recorder token', async () => {
        stubLocation('viewer.bookwalker.jp');
        pageCounter('3/12');
        let readablePage = 11;
        const dataForPage = () => {
            const data = new Uint8ClampedArray(20 * 20 * 4);
            for (let pixel = 0; pixel < 400; pixel++) {
                const value = (pixel * readablePage + 7) % 256;
                data[pixel * 4] = value;
                data[pixel * 4 + 1] = value;
                data[pixel * 4 + 2] = value;
                data[pixel * 4 + 3] = 255;
            }
            return data;
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (HTMLCanvasElement.prototype as any).getContext = () => ({
            drawImage() {},
            getImageData: () => ({ data: dataForPage() }),
        });
        const records: Record<string, MirrorRecord> = {
            m2: { w: 1200, h: 1600, ops: [imageOp('https://cdn/page1.jpg', 1)] },
        };
        seedMirror(records);
        const canvas = taintedCanvas('m2');
        canvas.width = 1200;
        canvas.height = 1600;
        canvas.getBoundingClientRect = () => new DOMRect(32, 40, 400, 520);
        canvas.toDataURL = () => `data:image/jpeg;base64,PAGE${readablePage}`;
        document.body.append(canvas);

        const controller = createController(async () => undefined);
        try {
            await waitForExpect(() => {
                expect(privateCanvasFrame()?.getAttribute('src')).toBe('data:image/jpeg;base64,PAGE11');
            });
            const staleFrame = privateCanvasFrame()!;
            Object.defineProperty(staleFrame, 'complete', { value: true, configurable: true });

            records.m2!.ops.push({
                seq: 2,
                srcId: null,
                url: '',
                sx: 0,
                sy: 0,
                sw: -1,
                sh: -1,
                dx: 0,
                dy: 0,
                dw: -1,
                dh: -1,
                clear: true,
            });
            records.m2!.ops.push(imageOp('https://cdn/page3.jpg', 3));
            readablePage = 29;
            bumpEpoch(6);
            controller.refresh();

            await waitForExpect(() => {
                const frame = privateCanvasFrame();
                expect(frame).not.toBe(staleFrame);
                expect(frame?.getAttribute('src')).toBe('data:image/jpeg;base64,PAGE29');
            });
        } finally {
            controller.destroy();
        }
    });

    it('paged BookWalker: repairs a stale capture made after the counter moves but before new pixels land', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubTaintedCanvas();
        pageCounter('3/12');
        const records: Record<string, MirrorRecord> = {
            m2: { w: 2202, h: 3132, ops: [imageOp('https://cdn/page1.jpg', 1)] },
        };
        seedMirror(records);
        const canvas = taintedCanvas('m2');
        canvas.getBoundingClientRect = () => new DOMRect(32, 40, 400, 520);
        canvas.toDataURL = () => { throw new Error('The operation is insecure.'); };
        document.body.append(canvas);

        let page = 'PAGE1';
        const captureCanvasMirror = vi.fn(async () => mirrorCanvas(page));
        const controller = createController(captureCanvasMirror);
        try {
            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(1);
                expect(privateCanvasFrame()?.getAttribute('src')).toBe('data:image/jpeg;base64,PAGE1');
            });
            const staleFrame = privateCanvasFrame()!;
            Object.defineProperty(staleFrame, 'complete', { value: true, configurable: true });
            const internals = controller as unknown as {
                canvasFrameContentTokens: Map<HTMLCanvasElement, string>;
                canvasFrameNeedsResnapshot: (canvas: HTMLCanvasElement) => boolean;
            };
            const staleContentToken = internals.canvasFrameContentTokens.get(canvas);
            expect(isRealContentIdentity(staleContentToken ?? '')).toBe(true);

            records.m2!.ops.push({
                seq: 2,
                srcId: null,
                url: '',
                sx: 0,
                sy: 0,
                sw: -1,
                sh: -1,
                dx: 0,
                dy: 0,
                dw: -1,
                dh: -1,
                clear: true,
            });
            records.m2!.ops.push(imageOp('https://cdn/page3.jpg', 3));
            page = 'PAGE3';
            bumpEpoch(6);
            expect(hasIdentityChanged(canvas, staleContentToken)).toBe(true);
            expect(internals.canvasFrameNeedsResnapshot(canvas)).toBe(true);
            controller.refresh();

            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(2);
                const frames = privateCanvasFrames();
                expect(frames).toHaveLength(1);
                expect(frames[0]?.getAttribute('src')).toBe('data:image/jpeg;base64,PAGE3');
            });
        } finally {
            controller.destroy();
        }
    });

    it('cty=2 vertical: SAME content across epoch flashes → exactly ONE scan', async () => {
        stubTaintedCanvas();
        pageCounter('8/195');
        seedMirror({ m6: { w: 2202, h: 3132, ops: [imageOp('https://cdn/pageA.jpg', 1)] } });
        const canvas = verticalSurfaceCanvas('m6', 'wideScreen6', 64);
        bumpEpoch(10);

        const captureCanvasMirror = vi.fn(async () => mirrorCanvas('PAGE_A'));
        const controller = createController(captureCanvasMirror);
        try {
            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(1);
                expect(captureCanvasMirror).toHaveBeenCalledWith(canvas, expect.any(Function));
            });

            // Flash the global epoch repeatedly while the SAME page stays painted, and
            // scroll the canvas — neither is a real content change, so no rescan.
            for (let tick = 11; tick <= 16; tick++) {
                bumpEpoch(tick);
                canvas.getBoundingClientRect = () => new DOMRect(120, 64 - tick * 40, 760, 1074);
                controller.refresh();
            }
            await new Promise(resolve => setTimeout(resolve, 300));
            expect(captureCanvasMirror).toHaveBeenCalledTimes(1);
        } finally {
            controller.destroy();
        }
    });

    it('cty=2 vertical: CHANGED content (same node) → exactly ONE rescan', async () => {
        stubTaintedCanvas();
        pageCounter('8/195');
        const records: Record<string, MirrorRecord> = {
            m6: { w: 2202, h: 3132, ops: [imageOp('https://cdn/pageA.jpg', 1)] },
        };
        seedMirror(records);
        verticalSurfaceCanvas('m6', 'wideScreen6', 64);
        bumpEpoch(10);

        let page = 'PAGE_A';
        const captureCanvasMirror = vi.fn(async () => mirrorCanvas(page));
        const controller = createController(captureCanvasMirror);
        try {
            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(1);
            });

            // A genuine page turn: the SAME canvas node is repainted with a new page
            // image (scroll unchanged). Identity moves once → exactly one rescan.
            records.m6!.ops.push(imageOp('https://cdn/pageB.jpg', 1500));
            page = 'PAGE_B';
            bumpEpoch(11);
            controller.refresh();

            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(2);
            });

            // The new page is now settled: further epoch flashes do NOT rescan again.
            for (let tick = 12; tick <= 15; tick++) { bumpEpoch(tick); controller.refresh(); }
            await new Promise(resolve => setTimeout(resolve, 300));
            expect(captureCanvasMirror).toHaveBeenCalledTimes(2);
        } finally {
            controller.destroy();
        }
    });

    it('node-reuse: swapping in an equivalent canvas for the SAME page does not rescan', async () => {
        // NFBR reuses one on-screen canvas across turns; a new canvas node showing the
        // SAME page (same mirror leaf URL) must be recognised as the same content and
        // reuse the existing frame rather than spend a second OCR call.
        stubTaintedCanvas();
        pageCounter('8/195');
        seedMirror({
            m6: { w: 2202, h: 3132, ops: [imageOp('https://cdn/pageA.jpg', 1)] },
            m7: { w: 2202, h: 3132, ops: [imageOp('https://cdn/pageA.jpg', 1)] },
        });
        const first = verticalSurfaceCanvas('m6', 'wideScreen6', 64);
        bumpEpoch(10);

        const captureCanvasMirror = vi.fn(async () => mirrorCanvas('PAGE_A'));
        const controller = createController(captureCanvasMirror);
        try {
            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(1);
            });
            const firstIdentity = stableContentIdentityForCanvas(first);

            // Swap the DOM node under the same surface for a fresh canvas painted with
            // the SAME page image (m7 → pageA.jpg). Its content identity matches.
            const surface = document.getElementById('wideScreen6')!;
            const replacement = taintedCanvas('m7');
            replacement.getBoundingClientRect = () => new DOMRect(120, 64, 760, 1074);
            replacement.toDataURL = () => { throw new Error('The operation is insecure.'); };
            surface.replaceChildren(replacement);
            expect(stableContentIdentityForCanvas(replacement)).toBe(firstIdentity);
        } finally {
            controller.destroy();
        }
    });
});

// Guard the last-resort fallback: when nothing is recorded yet, identity is empty and
// the caller falls back to the global epoch (never treated as real content).
describe('canvas-page-identity fallback', () => {
    it('is empty until a record exists, then defers to the epoch as the last-resort signal', () => {
        seedMirror({});
        const canvas = verticalSurfaceCanvas('m6', 'wideScreen6', 64);
        bumpEpoch(7);
        // No mirror record → no stable per-canvas content identity (surface token is
        // filtered out), so a landed frame is never invalidated by global churn.
        expect(stableContentIdentityForCanvas(canvas)).toBe('');
        // identityForCanvas still surfaces the surface token for the signature path.
        expect(isRealContentIdentity(identityForCanvas(canvas))).toBe(false);
        // The global epoch is available as the counter-less last-resort turn signal.
        expect(canvasMirrorTurnToken()).toBe('7');
    });
});
