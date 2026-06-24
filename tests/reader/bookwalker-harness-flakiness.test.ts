import { afterEach, describe, expect, it } from 'vitest';

import {
    canvasMirrorTurnToken,
    markCanvasMirrorSkip,
    pullPageMirrorRecords,
    recorderBootstrap,
    type MirrorGlobalState,
    type MirrorRecord,
} from '../../src/reader/ocr/canvas-mirror';

const OPTS = {
    a: 'data-yomu-mid',
    m: 6000,
    k: 3000,
    e: 'data-yomu-mirror-epoch',
    d: 'data-yomu-mirror-dump',
    p: 'yomu-canvas-mirror-pull',
    r: 'data-yomu-mirror-recorder',
} as const;

// A page-world window that SHARES the real jsdom document (the DOM is the only
// thing both realms see when there is no unsafeWindow — the Safari "Userscripts"
// extension). recorderBootstrap patches THIS object's CRC2D prototype + registers
// its pull responder on the shared document.documentElement.
function pageWorldWindow() {
    class CRC2D { canvas: unknown = null; drawImage(): void { /* */ } clearRect(): void { /* */ } }
    return {
        document,
        HTMLCanvasElement: class {},
        CanvasRenderingContext2D: CRC2D,
    } as unknown as Parameters<typeof recorderBootstrap>[0] & {
        CanvasRenderingContext2D: { prototype: { drawImage: (...a: unknown[]) => void; clearRect: (...a: unknown[]) => void } };
        __yomuCanvasMirror?: MirrorGlobalState;
    };
}

function fakeCanvas(w = 1024, h = 1024) {
    const attrs: Record<string, string> = {};
    return {
        width: w, height: h,
        getAttribute: (n: string) => attrs[n] ?? null,
        setAttribute: (n: string, v: string) => { attrs[n] = v; },
    };
}

// A canvas the recorder recognises as a canvas SOURCE (instanceof the page
// window's HTMLCanvasElement), so a draw from it is recorded as a composite.
function canvasSource(pageWin: { HTMLCanvasElement: new () => object }, w = 1024, h = 1024): ReturnType<typeof fakeCanvas> {
    return Object.assign(new pageWin.HTMLCanvasElement(), fakeCanvas(w, h)) as ReturnType<typeof fakeCanvas>;
}

function emptyState(): MirrorGlobalState {
    return { seq: 0, nextId: 1, installed: false, epoch: 0, records: Object.create(null) };
}

afterEach(() => {
    document.documentElement.removeAttribute(OPTS.r);
    document.documentElement.removeAttribute(OPTS.e);
    document.querySelector(`[${OPTS.d}]`)?.remove();
});

describe('canvas-mirror realm bridge (Safari "Userscripts" / no unsafeWindow)', () => {
    it('a content-world reader pulls the page-world recorder records over the shared DOM', () => {
        // Page world records the engine's draws into its OWN window state.
        const pageWin = pageWorldWindow();
        recorderBootstrap(pageWin, OPTS);
        const canvas = fakeCanvas();
        const ctx = Object.create(pageWin.CanvasRenderingContext2D.prototype) as { drawImage: (...a: unknown[]) => void; canvas: ReturnType<typeof fakeCanvas> };
        ctx.canvas = canvas;
        ctx.drawImage({ src: 'https://cdn/p1.jpeg' }, 0, 0, 64, 64, 10, 20, 64, 64);

        // The page-world recorder published the shared-DOM install marker.
        expect(document.documentElement.getAttribute(OPTS.r)).toBe('1');

        // The content-world reader has its OWN (empty) realm state and pulls.
        const target = emptyState();
        expect(target.records).toEqual({});
        expect(pullPageMirrorRecords(target)).toBe(true);

        const id = canvas.getAttribute(OPTS.a)!;
        expect(id).toBeTruthy();
        expect(target.records[id].ops[0]).toMatchObject({ url: 'https://cdn/p1.jpeg', sw: 64, sh: 64, dx: 10, dy: 20 });
    });

    it('returns false when no page-world recorder has published a marker', () => {
        expect(document.documentElement.getAttribute(OPTS.r)).toBeNull();
        expect(pullPageMirrorRecords(emptyState())).toBe(false);
    });

    it('bumps a shared-DOM turn token on a page composite (a canvas→canvas draw)', () => {
        const pageWin = pageWorldWindow();
        recorderBootstrap(pageWin, OPTS);
        expect(canvasMirrorTurnToken()).toBe(''); // no composite yet

        const buffer = canvasSource(pageWin as unknown as { HTMLCanvasElement: new () => object });
        const screen = fakeCanvas(2048, 1024);
        const ctx = Object.create(pageWin.CanvasRenderingContext2D.prototype) as { drawImage: (...a: unknown[]) => void; canvas: ReturnType<typeof fakeCanvas> };
        ctx.canvas = screen;
        // Tile draws (image source, no srcId) must NOT bump the turn token...
        ctx.drawImage({ src: 'https://cdn/tile.jpeg' }, 0, 0, 64, 64, 0, 0, 64, 64);
        expect(canvasMirrorTurnToken()).toBe('');
        // ...but a buffer→screen composite (canvas source) IS a page turn.
        ctx.drawImage(buffer, 0, 0, 1024, 1024, 0, 0, 1024, 1024);
        const afterFirst = canvasMirrorTurnToken();
        expect(afterFirst).not.toBe('');
        // A second composite (next turn) advances the token again.
        ctx.drawImage(buffer, 0, 0, 1024, 1024, 1024, 0, 1024, 1024);
        expect(canvasMirrorTurnToken()).not.toBe(afterFirst);
    });

    it('bumps the turn token on a full-canvas clear (engine repaint)', () => {
        const pageWin = pageWorldWindow();
        recorderBootstrap(pageWin, OPTS);
        const screen = fakeCanvas(1024, 1024);
        const ctx = Object.create(pageWin.CanvasRenderingContext2D.prototype) as { clearRect: (...a: unknown[]) => void; canvas: ReturnType<typeof fakeCanvas> };
        ctx.canvas = screen;
        ctx.clearRect(0, 0, 1024, 1024);
        expect(canvasMirrorTurnToken()).not.toBe('');
    });

    // Regression: capturing the page must not itself tick the turn epoch. The OCR
    // pipeline draws the page canvas into Yomu's OWN detached canvases (content
    // sampling, downscale, mirror rebuild). If those bumped the epoch, the page
    // signature would drift on every poll and the fresh OCR frame would be released
    // in a loop (the smoke caught this; jsdom can't, it has no real canvas).
    it('does NOT bump the turn token for a composite into an off-DOM (Yomu transient) canvas', () => {
        const pageWin = pageWorldWindow();
        recorderBootstrap(pageWin, OPTS);
        const src = canvasSource(pageWin as unknown as { HTMLCanvasElement: new () => object }, 100, 100);
        const offDom = Object.assign(canvasSource(pageWin as unknown as { HTMLCanvasElement: new () => object }, 100, 100), { nodeType: 1, isConnected: false });
        const ctx = Object.create(pageWin.CanvasRenderingContext2D.prototype) as { drawImage: (...a: unknown[]) => void; canvas: unknown };
        ctx.canvas = offDom;
        ctx.drawImage(src, 0, 0, 64, 64, 0, 0, 64, 64); // canvas→canvas composite into a detached canvas
        expect(canvasMirrorTurnToken()).toBe('');
    });

    it('DOES bump the turn token for a composite into an on-DOM canvas (a real viewer surface)', () => {
        const pageWin = pageWorldWindow();
        recorderBootstrap(pageWin, OPTS);
        const src = canvasSource(pageWin as unknown as { HTMLCanvasElement: new () => object }, 100, 100);
        const onDom = Object.assign(canvasSource(pageWin as unknown as { HTMLCanvasElement: new () => object }, 100, 100), { nodeType: 1, isConnected: true });
        const ctx = Object.create(pageWin.CanvasRenderingContext2D.prototype) as { drawImage: (...a: unknown[]) => void; canvas: unknown };
        ctx.canvas = onDom;
        ctx.drawImage(src, 0, 0, 64, 64, 0, 0, 64, 64);
        expect(canvasMirrorTurnToken()).not.toBe('');
    });

    it('does NOT bump or record when the context is mark-skipped (Yomi-internal draw)', () => {
        const pageWin = pageWorldWindow();
        recorderBootstrap(pageWin, OPTS);
        const src = canvasSource(pageWin as unknown as { HTMLCanvasElement: new () => object }, 100, 100);
        const onDom = Object.assign(canvasSource(pageWin as unknown as { HTMLCanvasElement: new () => object }, 100, 100), { nodeType: 1, isConnected: true });
        const ctx = Object.create(pageWin.CanvasRenderingContext2D.prototype) as { drawImage: (...a: unknown[]) => void; canvas: { getAttribute(n: string): string | null } };
        ctx.canvas = onDom;
        markCanvasMirrorSkip(ctx as unknown as CanvasRenderingContext2D);
        ctx.drawImage(src, 0, 0, 64, 64, 0, 0, 64, 64);
        expect(canvasMirrorTurnToken()).toBe(''); // skip-marked → ignored by the recorder
        expect(onDom.getAttribute(OPTS.a)).toBeNull(); // and never even assigned a mirror id
    });

    it('the pulled records reconstruct the leaf URLs for rebuild', () => {
        const pageWin = pageWorldWindow();
        recorderBootstrap(pageWin, OPTS);
        const screen = fakeCanvas();
        const ctx = Object.create(pageWin.CanvasRenderingContext2D.prototype) as { drawImage: (...a: unknown[]) => void; canvas: ReturnType<typeof fakeCanvas> };
        ctx.canvas = screen;
        ctx.drawImage({ src: 'https://cdn/page-a.jpeg' }, 0, 0, 64, 64, 0, 0, 64, 64);

        const target = emptyState();
        pullPageMirrorRecords(target);
        const id = screen.getAttribute(OPTS.a)!;
        const record: MirrorRecord = target.records[id];
        expect(record.ops.some(op => op.url === 'https://cdn/page-a.jpeg')).toBe(true);
        expect(record.w).toBeGreaterThan(0);
    });
});
