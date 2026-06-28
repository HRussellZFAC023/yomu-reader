import { describe, expect, it } from 'vitest';

import {
    collectLeafUrls,
    recorderBootstrap,
    selectLatestContentOps,
    type MirrorOp,
    type MirrorRecord,
} from '../../src/reader/ocr/canvas-mirror';

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
