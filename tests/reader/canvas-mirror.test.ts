import { describe, expect, it } from 'vitest';

import {
    collectLeafUrls,
    patchContextPrototype,
    recordClear,
    recordDrawImage,
    recordedOpsFor,
    selectLatestContentOps,
    type MirrorOp,
} from '../../src/reader/ocr/canvas-mirror';

function op(partial: Partial<MirrorOp> & { seq: number }): MirrorOp {
    return { canvasSrc: null, url: '', sx: 0, sy: 0, sw: -1, sh: -1, dx: 0, dy: 0, dw: -1, dh: -1, clear: false, ...partial };
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
        const bufferR = {} as object;
        const bufferL = {} as object;
        const spread = {} as object;
        const records = new Map<object, { ops: MirrorOp[] }>([
            [bufferR, { ops: [op({ seq: 1, url: 'urlR', dx: 0, dy: 0, dw: 1024, dh: 1024 })] }],
            [bufferL, { ops: [op({ seq: 2, url: 'urlL', dx: 0, dy: 0, dw: 1024, dh: 1024 })] }],
            [spread, { ops: [
                op({ seq: 3, canvasSrc: bufferR, dx: 1024, dy: 0, dw: 1024, dh: 1024 }),
                op({ seq: 4, canvasSrc: bufferL, dx: 0, dy: 0, dw: 1024, dh: 1024 }),
            ] }],
        ]);
        const urls = collectLeafUrls(spread, Number.POSITIVE_INFINITY, c => records.get(c));
        expect([...urls].sort()).toEqual(['urlL', 'urlR']);
    });

    it('does not loop on cyclic canvas references', () => {
        const a = {} as object;
        const records = new Map<object, { ops: MirrorOp[] }>([
            [a, { ops: [op({ seq: 1, canvasSrc: a, dx: 0, dy: 0, dw: 8, dh: 8 }), op({ seq: 2, url: 'leaf', dx: 8, dy: 0, dw: 8, dh: 8 })] }],
        ]);
        expect([...collectLeafUrls(a, Number.POSITIVE_INFINITY, c => records.get(c))]).toEqual(['leaf']);
    });
});

describe('recorder hook', () => {
    class FakeContext {
        canvas: { width: number; height: number };
        constructor(canvas: { width: number; height: number }) { this.canvas = canvas; }
        drawImage(..._args: unknown[]): void { /* original */ }
        clearRect(..._args: unknown[]): void { /* original */ }
    }

    it('records drawImage source rect, dest rect, and image url', () => {
        patchContextPrototype(FakeContext.prototype as never);
        const canvas = { width: 1024, height: 1024 };
        const ctx = new FakeContext(canvas);
        ctx.drawImage({ src: 'https://cdn/p1.jpeg' } as never, 0, 0, 64, 64, 128, 192, 64, 64);

        const ops = recordedOpsFor(canvas);
        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({ url: 'https://cdn/p1.jpeg', sx: 0, sy: 0, sw: 64, sh: 64, dx: 128, dy: 192, dw: 64, dh: 64, clear: false });
    });

    it('tags a canvas source for recursion and records only full-canvas clears', () => {
        const canvas = { width: 800, height: 600 };
        const ctx = new FakeContext(canvas) as FakeContext & { __yomuMirrorSkip?: boolean };
        const sourceCanvas = document.createElement('canvas');
        ctx.drawImage(sourceCanvas as never, 10, 20); // 3-arg form
        ctx.clearRect(0, 0, 800, 600); // full clear → recorded
        ctx.clearRect(5, 5, 10, 10);   // partial clear → ignored

        const ops = recordedOpsFor(canvas);
        expect(ops[0]).toMatchObject({ canvasSrc: sourceCanvas, url: '', dx: 10, dy: 20, dw: -1 });
        expect(ops.filter(o => o.clear)).toHaveLength(1);
    });

    it('skips recording when the context is flagged (our own rebuild canvases)', () => {
        const canvas = { width: 32, height: 32 };
        const ctx = new FakeContext(canvas) as FakeContext & { __yomuMirrorSkip?: boolean };
        ctx.__yomuMirrorSkip = true;
        ctx.drawImage({ src: 'https://cdn/skip.jpeg' } as never, 0, 0);
        expect(recordedOpsFor(canvas)).toHaveLength(0);
    });
});

describe('recordDrawImage arity', () => {
    it('captures the 5-arg dest-only form', () => {
        const canvas = {} as object;
        recordDrawImage(canvas, { src: 'x' }, [4, 8, 100, 200]);
        const last = recordedOpsFor(canvas).at(-1)!;
        expect(last).toMatchObject({ dx: 4, dy: 8, dw: 100, dh: 200, sw: -1 });
    });

    it('records a clear marker', () => {
        const canvas = {} as object;
        recordClear(canvas);
        expect(recordedOpsFor(canvas).at(-1)!.clear).toBe(true);
    });
});
