import { describe, expect, it } from 'vitest';

import {
    collectLeafUrls,
    patchContextPrototype,
    recorderBootstrap,
    recordClear,
    recordDrawImage,
    recordedOpsFor,
    selectLatestContentOps,
    type MirrorOp,
    type MirrorRecord,
} from '../../src/reader/ocr/canvas-mirror';

function op(partial: Partial<MirrorOp> & { seq: number }): MirrorOp {
    return { srcId: null, url: '', sx: 0, sy: 0, sw: -1, sh: -1, dx: 0, dy: 0, dw: -1, dh: -1, clear: false, ...partial };
}
function canvasEl(width = 1024, height = 1024): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    return c;
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

    it('does not loop on cyclic canvas references', () => {
        const records: Record<string, MirrorRecord> = {
            a: { w: 8, h: 8, ops: [op({ seq: 1, srcId: 'a', dx: 0, dy: 0, dw: 8, dh: 8 }), op({ seq: 2, url: 'leaf', dx: 8, dy: 0, dw: 8, dh: 8 })] },
        };
        expect([...collectLeafUrls('a', Number.POSITIVE_INFINITY, id => records[id])]).toEqual(['leaf']);
    });
});

describe('recorder hook (cross-realm-safe ids)', () => {
    class FakeContext {
        canvas: HTMLCanvasElement;
        constructor(canvas: HTMLCanvasElement) { this.canvas = canvas; }
        drawImage(..._args: unknown[]): void { /* original */ }
        clearRect(..._args: unknown[]): void { /* original */ }
    }

    it('records drawImage source rect, dest rect, image url, and a stable id', () => {
        patchContextPrototype(FakeContext.prototype as never);
        const canvas = canvasEl();
        const ctx = new FakeContext(canvas);
        ctx.drawImage({ src: 'https://cdn/p1.jpeg' } as never, 0, 0, 64, 64, 128, 192, 64, 64);

        expect(canvas.getAttribute('data-yomu-mid')).toBeTruthy(); // tagged for cross-realm lookup
        const ops = recordedOpsFor(canvas);
        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({ url: 'https://cdn/p1.jpeg', sx: 0, sy: 0, sw: 64, sh: 64, dx: 128, dy: 192, dw: 64, dh: 64, clear: false });
    });

    it('tags a canvas source with its own id for recursion and records only full-canvas clears', () => {
        const canvas = canvasEl(800, 600);
        const ctx = new FakeContext(canvas);
        const sourceCanvas = canvasEl(400, 400);
        ctx.drawImage(sourceCanvas as never, 10, 20); // 3-arg form
        ctx.clearRect(0, 0, 800, 600); // full clear → recorded
        ctx.clearRect(5, 5, 10, 10);   // partial clear → ignored

        const ops = recordedOpsFor(canvas);
        expect(ops[0]).toMatchObject({ url: '', dx: 10, dy: 20, dw: -1 });
        expect(ops[0].srcId).toBe(sourceCanvas.getAttribute('data-yomu-mid'));
        expect(ops.filter(o => o.clear)).toHaveLength(1);
    });

    it('skips recording when the context is flagged (our own rebuild canvases)', () => {
        const canvas = canvasEl(32, 32);
        const ctx = new FakeContext(canvas) as FakeContext & { __yomuMirrorSkip?: boolean };
        ctx.__yomuMirrorSkip = true;
        ctx.drawImage({ src: 'https://cdn/skip.jpeg' } as never, 0, 0);
        expect(recordedOpsFor(canvas)).toHaveLength(0);
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
        recorderBootstrap(win, { idAttr: 'data-yomu-mid', maxOps: 6000, keep: 3000, debug: false });
        const canvas = fakeCanvas();
        const ctx = Object.create(win.CanvasRenderingContext2D.prototype) as { drawImage: (...a: unknown[]) => void; canvas: ReturnType<typeof fakeCanvas> };
        ctx.canvas = canvas;
        ctx.drawImage({ src: 'https://cdn/page.jpeg' }, 0, 0, 64, 64, 10, 20, 64, 64);

        const id = canvas.getAttribute('data-yomu-mid')!;
        expect(id).toBeTruthy();
        const ops = win.__yomuCanvasMirror!.records[id].ops;
        expect(ops[0]).toMatchObject({ url: 'https://cdn/page.jpeg', sw: 64, sh: 64, dx: 10, dy: 20, dw: 64, dh: 64 });
    });

    it('is idempotent (does not double-patch)', () => {
        const win = mockWin();
        recorderBootstrap(win, { idAttr: 'data-yomu-mid', maxOps: 6000, keep: 3000, debug: false });
        const first = win.CanvasRenderingContext2D.prototype.drawImage;
        recorderBootstrap(win, { idAttr: 'data-yomu-mid', maxOps: 6000, keep: 3000, debug: false });
        expect(win.CanvasRenderingContext2D.prototype.drawImage).toBe(first);
    });
});

describe('recordDrawImage arity', () => {
    it('captures the 5-arg dest-only form', () => {
        const canvas = canvasEl();
        recordDrawImage(canvas, { src: 'x' }, [4, 8, 100, 200]);
        const last = recordedOpsFor(canvas).at(-1)!;
        expect(last).toMatchObject({ dx: 4, dy: 8, dw: 100, dh: 200, sw: -1 });
    });

    it('records a clear marker', () => {
        const canvas = canvasEl();
        recordClear(canvas);
        expect(recordedOpsFor(canvas).at(-1)!.clear).toBe(true);
    });
});
