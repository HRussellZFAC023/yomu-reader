// Rebuilds a cross-origin "tainted" DRM page canvas onto an UNTAINTED canvas so
// OCR can read it. On Firefox and iPad the BookWalker/NFBR viewer composites each
// page into a <canvas> from a scrambled cross-origin <img> (the CDN sends no
// CORS), so getImageData/toDataURL throw "The operation is insecure." and OCR gets
// nothing. Chrome happens not to taint, so it reads the canvas directly.
//
// The engine descrambles by replaying tile `drawImage(<img>, sx,sy,w,h, dx,dy,w,h)`
// copies from the scrambled image into a 2D buffer, then composites the buffers
// onto the on-screen canvas. We record those drawImage/clearRect calls at
// document-start, then REPLAY them onto a fresh canvas we own — but sourcing each
// leaf <img> from an origin-clean copy fetched via GM_xmlhttpRequest. The engine
// still computes the descramble permutation; we just feed it clean pixels. No
// crypto, no keys, and it survives engine updates because it mirrors exactly what
// the engine actually drew.
//
// A global op sequence lets each composite rebuild its source buffer as it was AT
// THAT moment, so a two-page spread sharing one reused buffer reconstructs both
// halves correctly.

export interface MirrorOp {
    seq: number;
    canvasSrc: object | null; // set only when the draw source is itself a canvas (recurse)
    url: string;              // source <img> URL ('' when source is a canvas/other)
    sx: number; sy: number; sw: number; sh: number; // source rect; sw < 0 ⇒ no source rect
    dx: number; dy: number; dw: number; dh: number; // dest rect; dw < 0 ⇒ no dest size
    clear: boolean;
}
interface MirrorRecord { ops: MirrorOp[]; }

type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

const RECORDS = new WeakMap<object, MirrorRecord>();
const MAX_OPS_PER_CANVAS = 6000;
const PRUNE_KEEP = 3000;
const MAX_REBUILD_DEPTH = 6;
let sequence = 0;
let installed = false;

function isBookwalkerHost(hostname: string): boolean {
    return hostname === 'viewer.bookwalker.jp'
        || hostname === 'viewer-trial.bookwalker.jp'
        || hostname.endsWith('.bookwalker.jp');
}

function isCanvasSource(value: unknown): value is CanvasLike {
    return Boolean(value) && (
        (typeof HTMLCanvasElement !== 'undefined' && value instanceof HTMLCanvasElement)
        || (typeof OffscreenCanvas !== 'undefined' && value instanceof OffscreenCanvas)
    );
}

function imageSourceUrl(value: unknown): string {
    const image = value as { currentSrc?: string; src?: string } | null;
    if (!image) return '';
    return (typeof image.currentSrc === 'string' && image.currentSrc)
        || (typeof image.src === 'string' && image.src)
        || '';
}

function recordFor(canvas: object): MirrorRecord {
    let record = RECORDS.get(canvas);
    if (!record) { record = { ops: [] }; RECORDS.set(canvas, record); }
    return record;
}

// Record one drawImage call. `args` is everything after the source image.
export function recordDrawImage(canvas: object, source: unknown, args: ArrayLike<number>): void {
    const record = recordFor(canvas);
    if (record.ops.length >= MAX_OPS_PER_CANVAS) record.ops.splice(0, record.ops.length - PRUNE_KEEP);
    const op: MirrorOp = {
        seq: sequence++,
        canvasSrc: isCanvasSource(source) ? source : null,
        url: isCanvasSource(source) ? '' : imageSourceUrl(source),
        sx: 0, sy: 0, sw: -1, sh: -1, dx: 0, dy: 0, dw: -1, dh: -1, clear: false,
    };
    if (args.length === 8) { op.sx = args[0]; op.sy = args[1]; op.sw = args[2]; op.sh = args[3]; op.dx = args[4]; op.dy = args[5]; op.dw = args[6]; op.dh = args[7]; }
    else if (args.length === 4) { op.dx = args[0]; op.dy = args[1]; op.dw = args[2]; op.dh = args[3]; }
    else if (args.length === 2) { op.dx = args[0]; op.dy = args[1]; }
    record.ops.push(op);
}

export function recordClear(canvas: object): void {
    const record = recordFor(canvas);
    if (record.ops.length >= MAX_OPS_PER_CANVAS) record.ops.splice(0, record.ops.length - PRUNE_KEEP);
    record.ops.push({ seq: sequence++, canvasSrc: null, url: '', sx: 0, sy: 0, sw: -1, sh: -1, dx: 0, dy: 0, dw: -1, dh: -1, clear: true });
}

const destKey = (op: MirrorOp): string => `${op.dx},${op.dy},${op.dw},${op.dh}`;

// The current content of a canvas = the latest non-clear op per destination rect
// (later opaque draws fully cover earlier ones), restricted to ops drawn before
// `beforeSeq` so a composite reconstructs its source buffer as it was at that time.
export function selectLatestContentOps(ops: readonly MirrorOp[], beforeSeq: number): MirrorOp[] {
    const byDest = new Map<string, MirrorOp>();
    for (const op of ops) {
        if (op.clear || op.seq >= beforeSeq) continue;
        byDest.set(destKey(op), op); // ops arrive in seq order, so the last write wins
    }
    return [...byDest.values()].sort((a, b) => a.seq - b.seq);
}

// Every leaf <img> URL feeding the current content of `canvas` (recursing through
// intermediate buffer canvases) — these are GM-fetched as origin-clean copies.
export function collectLeafUrls(
    canvas: object,
    beforeSeq: number,
    lookup: (canvas: object) => MirrorRecord | undefined,
    out: Set<string> = new Set(),
    seen: Set<object> = new Set(),
    depth = 0,
): Set<string> {
    if (depth > MAX_REBUILD_DEPTH || seen.has(canvas)) return out;
    const record = lookup(canvas);
    if (!record) return out;
    const nextSeen = new Set(seen).add(canvas);
    for (const op of selectLatestContentOps(record.ops, beforeSeq)) {
        if (op.canvasSrc) collectLeafUrls(op.canvasSrc, op.seq, lookup, out, nextSeen, depth + 1);
        else if (op.url) out.add(op.url);
    }
    return out;
}

function markSkip(context: CanvasRenderingContext2D | null): CanvasRenderingContext2D | null {
    if (context) (context as unknown as { __yomuMirrorSkip?: boolean }).__yomuMirrorSkip = true;
    return context;
}

function isReadable(canvas: HTMLCanvasElement): boolean {
    try {
        markSkip(canvas.getContext('2d', { willReadFrequently: true }))?.getImageData(0, 0, 1, 1);
        return true;
    } catch { return false; }
}

function rebuildCanvas(
    canvas: CanvasLike,
    beforeSeq: number,
    images: Map<string, CanvasImageSource>,
    seen: Set<object>,
    depth: number,
): HTMLCanvasElement | null {
    if (depth > MAX_REBUILD_DEPTH || seen.has(canvas)) return null;
    const record = RECORDS.get(canvas);
    if (!record) return null;
    const ops = selectLatestContentOps(record.ops, beforeSeq);
    const width = canvas.width, height = canvas.height;
    if (!ops.length || !width || !height) return null;
    const out = document.createElement('canvas');
    out.width = width; out.height = height;
    const ctx = markSkip(out.getContext('2d', { willReadFrequently: true }));
    if (!ctx) return null;
    const nextSeen = new Set(seen).add(canvas);
    for (const op of ops) {
        let source: CanvasImageSource | null = null;
        if (op.canvasSrc) source = rebuildCanvas(op.canvasSrc as CanvasLike, op.seq, images, nextSeen, depth + 1);
        else if (op.url) source = images.get(op.url) ?? null;
        if (!source) continue;
        try {
            if (op.sw >= 0) ctx.drawImage(source, op.sx, op.sy, op.sw, op.sh, op.dx, op.dy, op.dw, op.dh);
            else if (op.dw >= 0) ctx.drawImage(source, op.dx, op.dy, op.dw, op.dh);
            else ctx.drawImage(source, op.dx, op.dy);
        } catch { /* a stale/neutered source — skip this tile */ }
    }
    return out;
}

// Read-only view of a canvas's recorded ops (tests + the capture traversal).
export function recordedOpsFor(canvas: object): readonly MirrorOp[] {
    return RECORDS.get(canvas)?.ops ?? [];
}

// Rebuild `canvas` onto an untainted canvas by replaying the engine's recorded
// draw ops from origin-clean (GM-fetched) copies of the source images. Returns
// undefined when there's nothing recorded, no fetchable source, or the rebuild is
// still unreadable (so the caller can fall back to another capture path).
export async function captureCanvasMirror(
    canvas: HTMLCanvasElement,
    loadCleanImage: (url: string) => Promise<CanvasImageSource | undefined>,
): Promise<HTMLCanvasElement | undefined> {
    if (!RECORDS.has(canvas)) return undefined;
    const urls = collectLeafUrls(canvas, Number.POSITIVE_INFINITY, c => RECORDS.get(c));
    if (!urls.size) return undefined;
    const images = new Map<string, CanvasImageSource>();
    await Promise.all([...urls].map(async url => {
        try { const image = await loadCleanImage(url); if (image) images.set(url, image); } catch { /* skip */ }
    }));
    if (!images.size) return undefined;
    const rebuilt = rebuildCanvas(canvas, Number.POSITIVE_INFINITY, images, new Set(), 0);
    if (!rebuilt || !isReadable(rebuilt)) return undefined;
    return rebuilt;
}

interface Context2DPrototype {
    drawImage: (...args: unknown[]) => unknown;
    clearRect: (x: number, y: number, w: number, h: number) => unknown;
    canvas: CanvasLike;
    __yomuMirrorPatched?: boolean;
    __yomuMirrorSkip?: boolean;
}

export function patchContextPrototype(prototype: Context2DPrototype | undefined): boolean {
    if (!prototype || prototype.__yomuMirrorPatched) return false;
    prototype.__yomuMirrorPatched = true;
    const drawImage = prototype.drawImage;
    prototype.drawImage = function (this: Context2DPrototype, source: unknown, ...args: unknown[]) {
        if (!this.__yomuMirrorSkip) {
            try { recordDrawImage(this.canvas, source, args as number[]); } catch { /* never break the page */ }
        }
        return drawImage.apply(this, arguments as unknown as unknown[]);
    } as typeof prototype.drawImage;
    const clearRect = prototype.clearRect;
    prototype.clearRect = function (this: Context2DPrototype, x: number, y: number, w: number, h: number) {
        if (!this.__yomuMirrorSkip) {
            try { if (x <= 0 && y <= 0 && w >= this.canvas.width && h >= this.canvas.height) recordClear(this.canvas); } catch { /* */ }
        }
        return clearRect.apply(this, arguments as unknown as [number, number, number, number]);
    } as typeof prototype.clearRect;
    return true;
}

// Install the document-start recorder. No-op off BookWalker hosts (the hook would
// otherwise add overhead to every canvas draw on every site) and idempotent.
export function installCanvasMirrorRecorder(hostname: string = location.hostname): void {
    if (installed || !isBookwalkerHost(hostname)) return;
    const global = globalThis as unknown as {
        CanvasRenderingContext2D?: { prototype: Context2DPrototype };
        OffscreenCanvasRenderingContext2D?: { prototype: Context2DPrototype };
    };
    patchContextPrototype(global.CanvasRenderingContext2D?.prototype);
    patchContextPrototype(global.OffscreenCanvasRenderingContext2D?.prototype);
    installed = true;
}
