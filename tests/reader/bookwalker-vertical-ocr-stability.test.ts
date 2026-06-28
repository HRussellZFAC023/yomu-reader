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
        expect(token).toBe('m:https://cdn/pageA.jpg');

        bumpEpoch(42);
        expect(canvasMirrorContentToken(canvas)).toBe(token);
        bumpEpoch(99);
        expect(canvasMirrorContentToken(canvas)).toBe(token);
    });

    it('falls back to the global epoch only when a canvas has no record yet', () => {
        seedMirror({});
        const canvas = clusterCanvas('m6');
        bumpEpoch(7);

        expect(canvasMirrorContentToken(canvas)).toBe('');
        // No per-canvas identity available yet → the epoch keeps the old behaviour.
        expect(canvasPageContentToken(canvas)).toBe(canvasMirrorTurnToken());
        expect(canvasPageContentToken(canvas)).toBe('7');
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
        document.body.append(clusterCanvas('m6'), clusterCanvas('m7'));
        document.body.append(clusterCanvas('m2', /* hidden */ true));
        bumpEpoch(118);

        const signature = canvasReaderPageSignature();
        expect(signature).toContain('pageA.jpg');
        expect(signature).toContain('pageB.jpg');
        // The hidden current-screen buffer is excluded from the visible signature.
        expect(signature).not.toContain('buffer.jpg');

        // The exact churn from the bug report: the epoch ticks while the same pages
        // stay on screen. Pre-fix this flipped the signature every poll and wiped OCR.
        bumpEpoch(140);
        expect(canvasReaderPageSignature()).toBe(signature);

        // A genuine page turn (new source image painted into a visible canvas) must
        // still move the signature so stale overlays are dropped and the new page OCRs.
        records.m6!.ops.push(imageOp('https://cdn/pageC.jpg', 1500));
        const afterTurn = canvasReaderPageSignature();
        expect(afterTurn).not.toBe(signature);
        expect(afterTurn).toContain('pageC.jpg');
    });
});
