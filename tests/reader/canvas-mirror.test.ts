import { describe, expect, it } from 'vitest';

import {
    canonicalBookwalkerAssetUrl,
    collectLeafUrls,
    recorderBootstrap,
    selectLatestContentOps,
    type MirrorOp,
    type MirrorRecord,
} from '../../src/reader/ocr/canvas-mirror';
import { afterEach } from "vitest";
import { canvasMirrorTurnToken, markCanvasMirrorSkip, pullPageMirrorRecords, type MirrorGlobalState } from "../../src/reader/ocr/canvas-mirror";
import { canvasMirrorContentToken, mirrorContentTokenForRecords, resetMirrorSummaryBridgeForTests } from "../../src/reader/ocr/canvas-mirror";

describe('canonicalBookwalkerAssetUrl', () => {
    it('drops only expiring signature fields and preserves content-bearing query identity', () => {
        const first = canonicalBookwalkerAssetUrl(
            'https://bw-bv-epubs.bookwalker.jp/page.jpeg?uuid=page-a&bid=book-a&hti=tile-a&pfCd=03&Policy=old&Signature=one&Key-Pair-Id=key',
        );
        const refreshed = canonicalBookwalkerAssetUrl(
            'https://bw-bv-epubs.bookwalker.jp/page.jpeg?uuid=page-a&bid=book-a&hti=tile-a&pfCd=03&Policy=new&Signature=two&Key-Pair-Id=key',
        );
        const otherContent = canonicalBookwalkerAssetUrl(
            'https://bw-bv-epubs.bookwalker.jp/page.jpeg?uuid=page-b&bid=book-a&hti=tile-b&pfCd=04&Policy=new&Signature=two&Key-Pair-Id=key',
        );

        expect(refreshed).toBe(first);
        expect(otherContent).not.toBe(first);
        expect(first).toContain('uuid=page-a');
        expect(first).toContain('hti=tile-a');
        expect(first).not.toContain('Policy=');
        expect(first).not.toContain('Signature=');
    });
});

function op(partial: Partial<MirrorOp> & { seq: number }): MirrorOp {
    return { srcId: null, url: '', sx: 0, sy: 0, sw: -1, sh: -1, dx: 0, dy: 0, dw: -1, dh: -1, clear: false, ...partial };
}

describe('selectLatestContentOps', () => {
    it('keeps the latest op per destination rect and drops clears', () => {
        const ops: MirrorOp[] = [
            op({ seq: 1, url: 'a', dx: 0, dy: 0, dw: 64, dh: 64 }),
            op({ seq: 2, clear: true }),
            op({ seq: 3, url: 'b', dx: 0, dy: 0, dw: 64, dh: 64 }), // same dest as seq 1 → wins
            op({ seq: 4, url: 'c', dx: 64, dy: 0, dw: 64, dh: 64 }),
        ];
        const latest = selectLatestContentOps(ops, Number.POSITIVE_INFINITY);
        expect(latest.map(o => o.url)).toEqual(['b', 'c']);
        expect(latest.map(o => o.seq)).toEqual([3, 4]); // returned in seq order
    });

    it('honours the beforeSeq bound so a composite sees the buffer as it was then', () => {
        const ops: MirrorOp[] = [
            op({ seq: 10, url: 'pageR', dx: 0, dy: 0, dw: 1024, dh: 1024 }),
            op({ seq: 20, url: 'pageL', dx: 0, dy: 0, dw: 1024, dh: 1024 }), // overwrites later
        ];
        expect(selectLatestContentOps(ops, 15).map(o => o.url)).toEqual(['pageR']);
        expect(selectLatestContentOps(ops, 25).map(o => o.url)).toEqual(['pageL']);
    });

    it('drops pre-clear content so stale page URLs do not survive buffer reuse', () => {
        const ops: MirrorOp[] = [
            op({ seq: 10, url: 'oldPage', dx: 0, dy: 0, dw: 1024, dh: 1024 }),
            op({ seq: 11, clear: true }),
            op({ seq: 12, url: 'newPage', dx: 64, dy: 0, dw: 1024, dh: 1024 }),
        ];

        expect(selectLatestContentOps(ops, 20).map(o => o.url)).toEqual(['newPage']);
    });
});

describe('collectLeafUrls', () => {
    it('recurses through intermediate canvas sources, bounded by each op seq', () => {
        const records: Record<string, MirrorRecord> = {
            bufferR: { w: 1024, h: 1024, ops: [op({ seq: 1, url: 'urlR', dx: 0, dy: 0, dw: 1024, dh: 1024 })] },
            bufferL: { w: 1024, h: 1024, ops: [op({ seq: 2, url: 'urlL', dx: 0, dy: 0, dw: 1024, dh: 1024 })] },
            spread: { w: 2048, h: 1024, ops: [
                op({ seq: 3, srcId: 'bufferR', dx: 1024, dy: 0, dw: 1024, dh: 1024 }),
                op({ seq: 4, srcId: 'bufferL', dx: 0, dy: 0, dw: 1024, dh: 1024 }),
            ] },
        };
        const urls = collectLeafUrls('spread', Number.POSITIVE_INFINITY, id => records[id]);
        expect([...urls].sort()).toEqual(['urlL', 'urlR']);
    });

    it('collects BOTH page URLs when a spread reuses one buffer (interleaved render/composite)', () => {
        // The engine renders page R into the buffer, composites it right, then renders
        // page L into the SAME buffer and composites it left. Each composite must
        // recurse the buffer at its own seq bound, so both source URLs are fetched.
        const records: Record<string, MirrorRecord> = {
            buf: { w: 1024, h: 1024, ops: [
                op({ seq: 1, url: 'urlR', dx: 0, dy: 0, dw: 1024, dh: 1024 }),
                op({ seq: 4, url: 'urlL', dx: 0, dy: 0, dw: 1024, dh: 1024 }), // same dest, later
            ] },
            spread: { w: 2048, h: 1024, ops: [
                op({ seq: 2, srcId: 'buf', dx: 1024, dy: 0, dw: 1024, dh: 1024 }), // composite R → right
                op({ seq: 5, srcId: 'buf', dx: 0, dy: 0, dw: 1024, dh: 1024 }),    // composite L → left
            ] },
        };
        const urls = collectLeafUrls('spread', Number.POSITIVE_INFINITY, id => records[id]);
        expect([...urls].sort()).toEqual(['urlL', 'urlR']); // both halves, not just the right
    });

    it('falls back to the latest source-canvas URL when the historical source draw was missed', () => {
        // Live Firefox/BookWalker can install after the source buffer was initially
        // painted: the visible page records canvas->canvas composites first, then
        // the source buffer records a later image URL. Without this fallback the
        // vertical reader finds no leaf URLs and leaves the page stuck on Scanning.
        const records: Record<string, MirrorRecord> = {
            source: { w: 764, h: 1200, ops: [
                op({ seq: 15017, url: 'https://bw-bv-epubs.bookwalker.jp/page-003.jpeg', dx: 0, dy: 0, dw: 764, dh: 1200 }),
            ] },
            visible: { w: 2202, h: 1200, ops: [
                op({ seq: 10967, srcId: 'source', sx: 0, sy: 0, sw: 764, sh: 1200, dx: 719, dy: 0, dw: 764, dh: 1200 }),
            ] },
        };

        expect([...collectLeafUrls('visible', Number.POSITIVE_INFINITY, id => records[id])]).toEqual([
            'https://bw-bv-epubs.bookwalker.jp/page-003.jpeg',
        ]);
    });

    it('does not loop on cyclic canvas references', () => {
        const records: Record<string, MirrorRecord> = {
            a: { w: 8, h: 8, ops: [op({ seq: 1, srcId: 'a', dx: 0, dy: 0, dw: 8, dh: 8 }), op({ seq: 2, url: 'leaf', dx: 8, dy: 0, dw: 8, dh: 8 })] },
        };
        expect([...collectLeafUrls('a', Number.POSITIVE_INFINITY, id => records[id])]).toEqual(['leaf']);
    });
});

describe('recorderBootstrap (injected page-world recorder)', () => {
    // The Firefox path serializes recorderBootstrap and runs it in the page realm.
    // Exercise it against a mock window to confirm it patches and records correctly.
    function mockWin() {
        class CRC2D { canvas: unknown = null; drawImage(): void { /* */ } clearRect(): void { /* */ } }
        return { HTMLCanvasElement: class HImg {}, CanvasRenderingContext2D: CRC2D } as unknown as Parameters<typeof recorderBootstrap>[0] & { CanvasRenderingContext2D: { prototype: { drawImage: (...a: unknown[]) => void; clearRect: (...a: unknown[]) => void } }; HTMLCanvasElement: new () => unknown; __yomuCanvasMirror?: { records: Record<string, MirrorRecord> } };
    }
    function fakeCanvas(w = 1024, h = 1024) {
        const attrs: Record<string, string> = {};
        return { width: w, height: h, getAttribute: (n: string) => attrs[n] ?? null, setAttribute: (n: string, v: string) => { attrs[n] = v; } };
    }

    it('patches the page CanvasRenderingContext2D prototype and records ops into page state', () => {
        const win = mockWin();
        recorderBootstrap(win, { a: 'data-yomu-mid', m: 6000, k: 3000, e: 'data-yomu-mirror-epoch', d: 'data-yomu-mirror-dump', p: 'yomu-canvas-mirror-pull', r: 'data-yomu-mirror-recorder' });
        const canvas = fakeCanvas();
        const ctx = Object.create(win.CanvasRenderingContext2D.prototype) as { drawImage: (...a: unknown[]) => void; canvas: ReturnType<typeof fakeCanvas> };
        ctx.canvas = canvas;
        ctx.drawImage({ src: 'https://cdn/page.jpeg' }, 0, 0, 64, 64, 10, 20, 64, 64);

        const id = canvas.getAttribute('data-yomu-mid')!;
        expect(id).toBeTruthy();
        const ops = win.__yomuCanvasMirror!.records[id].ops;
        expect(ops[0]).toMatchObject({ url: 'https://cdn/page.jpeg', sw: 64, sh: 64, dx: 10, dy: 20, dw: 64, dh: 64 });
    });

    it('records source canvases, clears, skipped contexts, and dest-only arity', () => {
        const win = mockWin();
        recorderBootstrap(win, { a: 'data-yomu-mid', m: 6000, k: 3000, e: 'data-yomu-mirror-epoch', d: 'data-yomu-mirror-dump', p: 'yomu-canvas-mirror-pull', r: 'data-yomu-mirror-recorder' });
        const canvas = fakeCanvas(800, 600);
        const source = fakeCanvas(400, 400);
        const ctx = Object.create(win.CanvasRenderingContext2D.prototype) as { drawImage: (...a: unknown[]) => void; clearRect: (...a: unknown[]) => void; canvas: ReturnType<typeof fakeCanvas>; __yomuMirrorSkip?: boolean };
        ctx.canvas = canvas;
        ctx.drawImage(source, 10, 20);
        ctx.drawImage({ src: 'x' }, 4, 8, 100, 200);
        ctx.clearRect(0, 0, 800, 600);
        ctx.clearRect(5, 5, 10, 10);
        ctx.__yomuMirrorSkip = true;
        ctx.drawImage({ src: 'skip' }, 0, 0);

        const ops = win.__yomuCanvasMirror!.records[canvas.getAttribute('data-yomu-mid')!].ops;
        expect(ops[0]).toMatchObject({ url: '', dx: 10, dy: 20, dw: -1 });
        expect(ops[0].srcId).toBe(source.getAttribute('data-yomu-mid'));
        expect(ops[1]).toMatchObject({ url: 'x', dx: 4, dy: 8, dw: 100, dh: 200, sw: -1 });
        expect(ops.filter(o => o.clear)).toHaveLength(1);
        expect(ops.some(o => o.url === 'skip')).toBe(false);
    });

    it('is idempotent (does not double-patch)', () => {
        const win = mockWin();
        recorderBootstrap(win, { a: 'data-yomu-mid', m: 6000, k: 3000, e: 'data-yomu-mirror-epoch', d: 'data-yomu-mirror-dump', p: 'yomu-canvas-mirror-pull', r: 'data-yomu-mirror-recorder' });
        const first = win.CanvasRenderingContext2D.prototype.drawImage;
        recorderBootstrap(win, { a: 'data-yomu-mid', m: 6000, k: 3000, e: 'data-yomu-mirror-epoch', d: 'data-yomu-mirror-dump', p: 'yomu-canvas-mirror-pull', r: 'data-yomu-mirror-recorder' });
        expect(win.CanvasRenderingContext2D.prototype.drawImage).toBe(first);
    });
});

describe('canvas-mirror realm bridge (Safari "Userscripts" / no unsafeWindow)', () => {
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
        expect(canvasMirrorTurnToken()).toBe(''); // no draw yet

        const buffer = canvasSource(pageWin as unknown as { HTMLCanvasElement: new () => object });
        const screen = fakeCanvas(2048, 1024);
        const ctx = Object.create(pageWin.CanvasRenderingContext2D.prototype) as { drawImage: (...a: unknown[]) => void; canvas: ReturnType<typeof fakeCanvas> };
        ctx.canvas = screen;
        // A second tile from the SAME source image must NOT churn the token (a page
        // repaint, not a turn).
        ctx.drawImage({ src: 'https://cdn/tile.jpeg' }, 0, 0, 64, 64, 0, 0, 64, 64);
        const afterTile = canvasMirrorTurnToken();
        ctx.drawImage({ src: 'https://cdn/tile.jpeg' }, 64, 0, 64, 64, 64, 0, 64, 64);
        expect(canvasMirrorTurnToken()).toBe(afterTile);
        // A buffer→screen composite (canvas source) IS a page turn.
        ctx.drawImage(buffer, 0, 0, 1024, 1024, 0, 0, 1024, 1024);
        const afterFirst = canvasMirrorTurnToken();
        expect(afterFirst).not.toBe(afterTile);
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

    // Regression for the "previous page's overlay sticks on the next page" report:
    // some NFBR modes paint a new page as direct image tiles with no canvas→canvas
    // composite, so the turn token must also advance when a NEW source image is
    // drawn — while staying stable if the SAME page is repainted (else it would
    // churn the page signature and flicker).
    it('bumps the turn token on a new source image but stays stable when the same page is repainted', () => {
        const pageWin = pageWorldWindow();
        recorderBootstrap(pageWin, OPTS);
        const screen = Object.assign(canvasSource(pageWin as unknown as { HTMLCanvasElement: new () => object }, 1024, 1024), { nodeType: 1, isConnected: true });
        const ctx = Object.create(pageWin.CanvasRenderingContext2D.prototype) as { drawImage: (...a: unknown[]) => void; canvas: unknown };
        ctx.canvas = screen;
        ctx.drawImage({ src: 'https://cdn/page-1.jpeg' }, 0, 0, 64, 64, 0, 0, 64, 64); // page 1, first tile
        const afterPage1 = canvasMirrorTurnToken();
        expect(afterPage1).not.toBe('');
        ctx.drawImage({ src: 'https://cdn/page-1.jpeg' }, 64, 0, 64, 64, 64, 0, 64, 64); // same page, another tile
        expect(canvasMirrorTurnToken()).toBe(afterPage1); // no churn on same-page repaint
        ctx.drawImage({ src: 'https://cdn/page-2.jpeg' }, 0, 0, 64, 64, 0, 0, 64, 64); // turned to page 2
        expect(canvasMirrorTurnToken()).not.toBe(afterPage1);
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

describe('canvas mirror identity contract', () => {
    const ID_ATTR = 'data-yomu-mid';
    const MARKER_ATTR = 'data-yomu-mirror-recorder';
    const DUMP_ATTR = 'data-yomu-mirror-dump';
    const REQUEST_ATTR = 'data-yomu-mirror-request';
    const PULL_EVENT = 'yomu-canvas-mirror-pull';

    function imageOp(url: string, seq: number): MirrorOp {
        return {
            seq,
            srcId: null,
            url,
            sx: 0,
            sy: 0,
            sw: -1,
            sh: -1,
            dx: 0,
            dy: 0,
            dw: -1,
            dh: -1,
            clear: false,
        };
    }

    function clearOp(seq: number): MirrorOp {
        return { ...imageOp('', seq), clear: true };
    }

    function compositeOp(srcId: string, seq: number): MirrorOp {
        return { ...imageOp('', seq), srcId };
    }

    function liveRecordShape(): Record<string, MirrorRecord> {
        return {
            m10: {
                w: 1570,
                h: 2233,
                ops: [
                    imageOp('https://viewer-epubs-trial.bookwalker.jp/book/4/OPS/images/old.jpg/0.jpeg?Policy=old&Signature=old&Key-Pair-Id=old', 9),
                    clearOp(10),
                    imageOp('https://viewer-epubs-trial.bookwalker.jp/book/4/OPS/images/current.jpg/0.jpeg?page=6&Policy=fresh&Signature=fresh&Key-Pair-Id=fresh', 20),
                ],
            },
        };
    }

    function seedReaderState(records: Record<string, MirrorRecord>): void {
        const state: MirrorGlobalState = { seq: 30, nextId: 20, installed: true, epoch: 7, records };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).__yomuCanvasMirror = state;
    }

    function readerCanvas(id: string): HTMLCanvasElement {
        const canvas = document.createElement('canvas');
        canvas.setAttribute(ID_ATTR, id);
        return canvas;
    }

    function recorderSummary(records: Record<string, MirrorRecord>, id: string): { token: string; version: number } {
        const pageDocument = document.implementation.createHTMLDocument('mirror-contract');
        class CanvasContext { canvas: unknown = null; drawImage(): void { /* recorder hook */ } clearRect(): void { /* recorder hook */ } }
        const state: MirrorGlobalState = { seq: 30, nextId: 20, installed: false, epoch: 7, records };
        const pageWindow = {
            document: pageDocument,
            location: { href: 'https://viewer-trial.bookwalker.jp/03/21/viewer.html?cid=book&cty=1' },
            HTMLCanvasElement: class {},
            CanvasRenderingContext2D: CanvasContext,
            __yomuCanvasMirror: state,
        } as unknown as Parameters<typeof recorderBootstrap>[0];

        recorderBootstrap(pageWindow, {
            a: ID_ATTR,
            m: 6000,
            k: 3000,
            e: 'data-yomu-mirror-epoch',
            d: DUMP_ATTR,
            q: REQUEST_ATTR,
            p: PULL_EVENT,
            r: MARKER_ATTR,
            v: 3,
        });
        const root = pageDocument.documentElement;
        root.setAttribute(REQUEST_ATTR, `summary:${id}`);
        root.dispatchEvent(new CustomEvent(PULL_EVENT));
        const payload = JSON.parse(root.querySelector(`[${DUMP_ATTR}]`)?.textContent ?? '{}') as {
            summaries?: Record<string, string>;
            tv?: number;
        };
        return { token: payload.summaries?.[id] ?? '', version: payload.tv ?? 0 };
    }

    afterEach(() => {
        document.documentElement.removeAttribute(MARKER_ATTR);
        document.documentElement.removeAttribute(REQUEST_ATTR);
        document.querySelector(`[${DUMP_ATTR}]`)?.remove();
        resetMirrorSummaryBridgeForTests();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (globalThis as any).__yomuCanvasMirror;
    });


    it('uses one hashed identity for the local fallback and frozen capture records', () => {
        const records = liveRecordShape();
        const capturedToken = mirrorContentTokenForRecords('m10', id => records[id]);
        seedReaderState(records);

        const liveToken = canvasMirrorContentToken(readerCanvas('m10'));

        expect(liveToken).toBe(capturedToken);
        expect(liveToken).toMatch(/^m:[a-z0-9]+$/);
        expect(liveToken).not.toContain('viewer-epubs');
        expect(liveToken).not.toContain('Policy');
    });

    it('keeps page-world summaries byte-identical to the reader token', () => {
        const records = liveRecordShape();
        const readerToken = mirrorContentTokenForRecords('m10', id => records[id]);
        const summary = recorderSummary(records, 'm10');

        expect(summary.version).toBe(3);
        expect(summary.token).toBe(readerToken);
    });

    it('keeps page identity stable when BookWalker only rescales the same source', () => {
        const original = imageOp('https://viewer-epubs-trial.bookwalker.jp/book/OPS/images/page.jpg/0.jpeg', 1);
        Object.assign(original, { dx: 0, dy: 0, dw: 900, dh: 1100 });
        const zoomed = { ...original, seq: 2, dx: -45, dw: 990, dh: 1210 };
        const recordsAt100: Record<string, MirrorRecord> = {
            m10: { w: 900, h: 1100, ops: [original] },
        };
        const recordsAt110: Record<string, MirrorRecord> = {
            m10: { w: 990, h: 1210, ops: [zoomed] },
        };

        expect(mirrorContentTokenForRecords('m10', id => recordsAt110[id]))
            .toBe(mirrorContentTokenForRecords('m10', id => recordsAt100[id]));
        expect(recorderSummary(recordsAt110, 'm10').token)
            .toBe(recorderSummary(recordsAt100, 'm10').token);
    });

    it('uses the same latest-source fallback in page and reader realms', () => {
        const records: Record<string, MirrorRecord> = {
            source: {
                w: 760,
                h: 1200,
                ops: [imageOp('https://viewer-epubs-trial.bookwalker.jp/book/OPS/images/late.jpg/0.jpeg', 50)],
            },
            visible: {
                w: 1570,
                h: 2233,
                ops: [compositeOp('source', 20)],
            },
        };

        expect(recorderSummary(records, 'visible').token)
            .toBe(mirrorContentTokenForRecords('visible', id => records[id]));
    });

    it('ignores an unversioned summary from a foreign recorder and derives locally', () => {
        const records = liveRecordShape();
        const expected = mirrorContentTokenForRecords('m10', id => records[id]);
        seedReaderState(records);
        const root = document.documentElement;
        root.setAttribute(MARKER_ATTR, '1');
        const responder = (): void => {
            let node = root.querySelector<HTMLElement>(`[${DUMP_ATTR}]`);
            if (!node) {
                node = document.createElement('div');
                node.setAttribute(DUMP_ATTR, '1');
                root.append(node);
            }
            node.textContent = JSON.stringify({ summaries: { m10: 'm:foreign' }, epoch: 7 });
        };
        root.addEventListener(PULL_EVENT, responder);
        try {
            expect(canvasMirrorContentToken(readerCanvas('m10'))).toBe(expected);
            expect(canvasMirrorContentToken(readerCanvas('m10'))).toBe(expected);
        } finally {
            root.removeEventListener(PULL_EVENT, responder);
        }
    });
});
