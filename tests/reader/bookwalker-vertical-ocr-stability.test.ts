// Regression for the real signed-in BookWalker vertical/continuous (cty=2) failure:
// the OCR layers stayed empty because the page-turn signature (and the per-canvas
// snapshot key it fed) keyed on the GLOBAL mirror epoch. That epoch bumps for every
// page composite across the whole stacked #canvasCluster and again on any repaint
// (the "data-yomu-mirror-epoch flashing" the user saw when opening devtools), so an
// async mirror capture never landed and a landed overlay was wiped on the next poll.
// The fix gives each tainted canvas its own source-image identity; these tests pin
// that a same-page repaint (epoch bump) no longer perturbs identity while a real page
// change still does.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    canvasPageContentToken,
    canvasReaderPageSignature,
} from '../../src/reader/ocr/canvas-readers';
import { canvasMirrorContentToken, canvasMirrorTurnToken } from '../../src/reader/ocr/canvas-mirror';
import type { MirrorGlobalState, MirrorRecord } from '../../src/reader/ocr/canvas-mirror';

const EPOCH_ATTR = 'data-yomu-mirror-epoch';
const originalGetContext = HTMLCanvasElement.prototype.getContext;

function stubTaintedCanvas(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (HTMLCanvasElement.prototype as any).getContext = () => ({
        drawImage() {},
        getImageData() { throw new Error('The operation is insecure.'); },
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

function clusterCanvas(mid: string, hidden = false): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 2202;
    canvas.height = 3132;
    canvas.setAttribute('data-yomu-mid', mid);
    if (hidden) canvas.style.visibility = 'hidden';
    return canvas;
}

function verticalClusterCanvas(mid: string, id: string, top: number): HTMLCanvasElement {
    const root = document.createElement('div');
    root.id = id;
    root.className = 'canvasRoot verticalAxis';
    const canvas = clusterCanvas(mid);
    canvas.getBoundingClientRect = () => new DOMRect(120, top, 760, 1074);
    root.append(canvas);
    document.body.append(root);
    return canvas;
}

function bumpEpoch(value: number): void {
    document.documentElement.setAttribute(EPOCH_ATTR, String(value));
}

beforeEach(() => {
    vi.stubGlobal('location', {
        hostname: 'viewer.bookwalker.jp',
        href: 'https://viewer.bookwalker.jp/03/30/viewer.html?cid=abc&cty=2',
        origin: 'https://viewer.bookwalker.jp',
        protocol: 'https:',
    });
    stubTaintedCanvas();
});

afterEach(() => {
    document.body.replaceChildren();
    document.documentElement.removeAttribute(EPOCH_ATTR);
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).__yomuCanvasMirror;
    vi.unstubAllGlobals();
});

describe('BookWalker vertical-mode OCR identity stability', () => {
    it('derives a per-canvas source fingerprint that ignores the global epoch', () => {
        seedMirror({
            m6: { w: 2202, h: 3132, ops: [imageOp('https://cdn/pageA.jpg', 1)] },
        });
        const canvas = clusterCanvas('m6');

        const token = canvasMirrorContentToken(canvas);
        expect(token).toMatch(/^m:[a-z0-9]+$/);
        expect(token).not.toContain('pageA.jpg');

        bumpEpoch(42);
        expect(canvasMirrorContentToken(canvas)).toBe(token);
        bumpEpoch(99);
        expect(canvasMirrorContentToken(canvas)).toBe(token);
    });

    it('falls back to the global epoch only when a non-vertical canvas has no record yet', () => {
        seedMirror({});
        const canvas = clusterCanvas('m6');
        bumpEpoch(7);

        expect(canvasMirrorContentToken(canvas)).toBe('');
        // No per-canvas identity available yet → the epoch keeps the old behaviour.
        expect(canvasPageContentToken(canvas)).toBe(canvasMirrorTurnToken());
        expect(canvasPageContentToken(canvas)).toBe('7');
    });

    it('uses stable wideScreen identity while a vertical canvas waits for mirror records', () => {
        seedMirror({});
        const canvas = verticalClusterCanvas('m6', 'wideScreen26', 64);
        bumpEpoch(7);

        expect(canvasMirrorContentToken(canvas)).toBe('');
        expect(canvasPageContentToken(canvas)).toBe('s:wideScreen26:2202x3132');

        bumpEpoch(8);
        expect(canvasPageContentToken(canvas)).toBe('s:wideScreen26:2202x3132');
    });

    it('keeps a vertical stack signature stable when the reader counter advances during scroll', () => {
        seedMirror({});
        const counter = Object.assign(document.createElement('span'), { id: 'pageSliderCounter', textContent: '22/195' });
        document.body.append(counter);
        verticalClusterCanvas('m22', 'wideScreen22', -180);
        verticalClusterCanvas('m23', 'wideScreen23', 980);
        bumpEpoch(187);

        const signature = canvasReaderPageSignature();
        expect(signature).toContain('s:wideScreen22');
        expect(signature).toContain('s:wideScreen23');

        counter.textContent = '23/195';
        bumpEpoch(188);
        expect(canvasReaderPageSignature()).toBe(signature);
    });

    it('keeps the page-turn signature stable across an epoch flash but changes on a real turn', () => {
        const records: Record<string, MirrorRecord> = {
            m6: { w: 2202, h: 3132, ops: [imageOp('https://cdn/pageA.jpg', 1)] },
            m7: { w: 2202, h: 3132, ops: [imageOp('https://cdn/pageB.jpg', 2)] },
            // The hidden #viewport1.currentScreen buffer from the real DOM — a different
            // page that must NOT leak into the visible cluster's signature.
            m2: { w: 2202, h: 1998, ops: [imageOp('https://cdn/buffer.jpg', 3)] },
        };
        seedMirror(records);

        const counter = Object.assign(document.createElement('span'), { id: 'pageSliderCounter', textContent: '25/195' });
        document.body.append(counter);
        const pageA = clusterCanvas('m6');
        const pageB = clusterCanvas('m7');
        const hidden = clusterCanvas('m2', /* hidden */ true);
        document.body.append(pageA, pageB, hidden);
        bumpEpoch(118);

        const pageAToken = canvasMirrorContentToken(pageA);
        const pageBToken = canvasMirrorContentToken(pageB);
        const hiddenToken = canvasMirrorContentToken(hidden);
        const signature = canvasReaderPageSignature();
        expect(signature).toContain(pageAToken);
        expect(signature).toContain(pageBToken);
        // The hidden current-screen buffer is excluded from the visible signature.
        expect(signature).not.toContain(hiddenToken);

        // The exact churn from the bug report: the epoch ticks while the same pages
        // stay on screen. Pre-fix this flipped the signature every poll and wiped OCR.
        bumpEpoch(140);
        expect(canvasReaderPageSignature()).toBe(signature);

        // A genuine page turn (new source image painted into a visible canvas) must
        // still move the signature so stale overlays are dropped and the new page OCRs.
        records.m6!.ops.push(imageOp('https://cdn/pageC.jpg', 1500));
        const pageCToken = canvasMirrorContentToken(pageA);
        const afterTurn = canvasReaderPageSignature();
        expect(pageCToken).not.toBe(pageAToken);
        expect(afterTurn).not.toBe(signature);
        expect(afterTurn).toContain(pageCToken);
    });
});
