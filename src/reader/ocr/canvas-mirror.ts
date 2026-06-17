// Rebuilds a cross-origin "tainted" DRM page canvas onto an UNTAINTED canvas so
// OCR can read it. On Firefox and iPad/Safari the BookWalker/NFBR viewer composites
// each page into a <canvas> from a scrambled cross-origin <img> (the CDN sends no
// CORS), so getImageData/toDataURL throw "The operation is insecure." and OCR gets
// nothing. Chrome happens not to taint, so it reads the canvas directly.
//
// The engine descrambles by replaying tile `drawImage(<img>, sx,sy,w,h, dx,dy,w,h)`
// copies from the scrambled image into a 2D buffer, then composites the buffers
// onto the on-screen canvas. We record those drawImage/clearRect calls, then REPLAY
// them onto a fresh canvas we own — sourcing each leaf <img> from an origin-clean
// copy fetched via GM_xmlhttpRequest, and never drawing a tainted original. The
// engine still computes the descramble permutation; we just feed it clean pixels.
//
// CROSS-WORLD: the recorder is installed from the Tampermonkey content sandbox
// (document-start) while the OCR reader runs in the page MAIN WORLD. Those are
// different JS realms with different `globalThis`, so the shared state is anchored
// on the PAGE window (`unsafeWindow`/`window` resolve to the same object from both
// realms) and records are keyed by a DOM attribute id (the DOM is shared across
// realms) — no per-realm object reference ever crosses the boundary.
//
// A global op sequence lets each composite rebuild its source buffer as it was AT
// THAT moment, so a two-page spread sharing one reused buffer reconstructs both
// halves correctly.

export interface MirrorOp {
    seq: number;
    srcId: string | null; // id of the source canvas when the draw source is a canvas (recurse)
    url: string;          // source <img> URL ('' when source is a canvas/other)
    sx: number; sy: number; sw: number; sh: number; // source rect; sw < 0 ⇒ no source rect
    dx: number; dy: number; dw: number; dh: number; // dest rect; dw < 0 ⇒ no dest size
    clear: boolean;
}
export interface MirrorRecord { w: number; h: number; ops: MirrorOp[]; }
type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

const ID_ATTR = 'data-yomu-mid';
const MAX_OPS_PER_CANVAS = 6000;
const PRUNE_KEEP = 3000;
const MAX_REBUILD_DEPTH = 6;

interface MirrorGlobalState {
    seq: number; nextId: number; installed: boolean; debug: boolean;
    records: Record<string, MirrorRecord>;
}
// Anchor on the page window so the sandbox recorder and the main-world reader share
// ONE state object. From the sandbox `unsafeWindow` is the page window; from the
// main world it's undefined and `window` is the page window — both the same object.
function pageWindow(): typeof globalThis & { __yomuCanvasMirror?: MirrorGlobalState } {
    const uw = (globalThis as unknown as { unsafeWindow?: typeof globalThis }).unsafeWindow;
    return (uw || globalThis) as typeof globalThis & { __yomuCanvasMirror?: MirrorGlobalState };
}
function state(): MirrorGlobalState {
    const win = pageWindow();
    return (win.__yomuCanvasMirror ??= { seq: 0, nextId: 1, installed: false, debug: false, records: Object.create(null) });
}

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

// A stable id for a canvas that survives crossing the sandbox↔main-world boundary:
// a DOM attribute for real elements (shared DOM), falling back to an own-property
// for OffscreenCanvas / test stubs (same-realm only, which is fine for those).
function canvasId(canvas: unknown, create: boolean): string | null {
    const el = canvas as { getAttribute?: (n: string) => string | null; setAttribute?: (n: string, v: string) => void; __yomuMid?: string };
    if (el && typeof el.getAttribute === 'function' && typeof el.setAttribute === 'function') {
        let id = el.getAttribute(ID_ATTR);
        if (!id && create) { id = `m${state().nextId++}`; try { el.setAttribute(ID_ATTR, id); } catch { return null; } }
        return id;
    }
    if (el && el.__yomuMid) return el.__yomuMid;
    if (el && create) { const id = `m${state().nextId++}`; try { el.__yomuMid = id; return id; } catch { return null; } }
    return null;
}

function recordFor(id: string, w: number, h: number): MirrorRecord {
    const s = state();
    let record = s.records[id];
    if (!record) { record = { w, h, ops: [] }; s.records[id] = record; }
    if (w) record.w = w;
    if (h) record.h = h;
    if (record.ops.length >= MAX_OPS_PER_CANVAS) record.ops.splice(0, record.ops.length - PRUNE_KEEP);
    return record;
}

// Record one drawImage call. `args` is everything after the source image.
export function recordDrawImage(canvas: { width: number; height: number }, source: unknown, args: ArrayLike<number>): void {
    const id = canvasId(canvas, true);
    if (!id) return;
    const record = recordFor(id, canvas.width, canvas.height);
    const op: MirrorOp = {
        seq: state().seq++,
        srcId: isCanvasSource(source) ? canvasId(source, true) : null,
        url: isCanvasSource(source) ? '' : imageSourceUrl(source),
        sx: 0, sy: 0, sw: -1, sh: -1, dx: 0, dy: 0, dw: -1, dh: -1, clear: false,
    };
    if (args.length === 8) { op.sx = args[0]; op.sy = args[1]; op.sw = args[2]; op.sh = args[3]; op.dx = args[4]; op.dy = args[5]; op.dw = args[6]; op.dh = args[7]; }
    else if (args.length === 4) { op.dx = args[0]; op.dy = args[1]; op.dw = args[2]; op.dh = args[3]; }
    else if (args.length === 2) { op.dx = args[0]; op.dy = args[1]; }
    record.ops.push(op);
}

export function recordClear(canvas: { width: number; height: number }): void {
    const id = canvasId(canvas, true);
    if (!id) return;
    const record = recordFor(id, canvas.width, canvas.height);
    record.ops.push({ seq: state().seq++, srcId: null, url: '', sx: 0, sy: 0, sw: -1, sh: -1, dx: 0, dy: 0, dw: -1, dh: -1, clear: true });
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

// Every leaf <img> URL feeding the current content of record `id` (recursing through
// intermediate buffer canvases) — these are GM-fetched as origin-clean copies.
export function collectLeafUrls(
    id: string | null,
    beforeSeq: number,
    lookup: (id: string) => MirrorRecord | undefined,
    out: Set<string> = new Set(),
    seen: Set<string> = new Set(),
    depth = 0,
): Set<string> {
    if (!id || depth > MAX_REBUILD_DEPTH || seen.has(id)) return out;
    const record = lookup(id);
    if (!record) return out;
    // Per-path `seen` copy (NOT shared): a spread reuses ONE buffer for both pages,
    // visiting it twice at different seq bounds. A shared set would skip the second
    // visit, so the left page's source image is never fetched and renders blank.
    const next = new Set(seen).add(id);
    for (const op of selectLatestContentOps(record.ops, beforeSeq)) {
        if (op.srcId) collectLeafUrls(op.srcId, op.seq, lookup, out, next, depth + 1);
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

// Rebuild record `id` onto a fresh canvas, drawing ONLY origin-clean sources (fetched
// images or recursively-rebuilt buffers) — never a tainted original — so the result
// is always untainted.
function rebuildById(
    id: string,
    beforeSeq: number,
    images: Map<string, CanvasImageSource>,
    seen: Set<string>,
    depth: number,
): HTMLCanvasElement | null {
    if (depth > MAX_REBUILD_DEPTH || seen.has(id)) return null;
    const record = state().records[id];
    if (!record || !record.w || !record.h) return null;
    const ops = selectLatestContentOps(record.ops, beforeSeq);
    if (!ops.length) return null;
    const out = document.createElement('canvas');
    out.width = record.w; out.height = record.h;
    const ctx = markSkip(out.getContext('2d', { willReadFrequently: true }));
    if (!ctx) return null;
    seen.add(id);
    let drew = 0;
    for (const op of ops) {
        let source: CanvasImageSource | null = null;
        if (op.srcId) source = rebuildById(op.srcId, op.seq, images, new Set(seen), depth + 1);
        else if (op.url) source = images.get(op.url) ?? null;
        if (!source) continue;
        try {
            if (op.sw >= 0) ctx.drawImage(source, op.sx, op.sy, op.sw, op.sh, op.dx, op.dy, op.dw, op.dh);
            else if (op.dw >= 0) ctx.drawImage(source, op.dx, op.dy, op.dw, op.dh);
            else ctx.drawImage(source, op.dx, op.dy);
            drew++;
        } catch { /* a stale source — skip this tile */ }
    }
    return drew ? out : null;
}

export function canvasMirrorHasOps(canvas: object): boolean {
    const id = canvasId(canvas, false);
    return !!id && (state().records[id]?.ops.length ?? 0) > 0;
}

// Read-only view of a canvas's recorded ops (tests + diagnostics).
export function recordedOpsFor(canvas: object): readonly MirrorOp[] {
    const id = canvasId(canvas, false);
    return (id && state().records[id]?.ops) || [];
}

// Rebuild `canvas` onto an untainted canvas by replaying the engine's recorded draw
// ops from origin-clean (GM-fetched) copies of the source images. Returns undefined
// when there's nothing recorded, no fetchable source, or the rebuild is still
// unreadable (so the caller can fall back to another capture path).
export async function captureCanvasMirror(
    canvas: HTMLCanvasElement,
    loadCleanImage: (url: string) => Promise<CanvasImageSource | undefined>,
): Promise<HTMLCanvasElement | undefined> {
    // Safety net: if the document-start recorder ran in a realm we don't share,
    // installing here patches the (shared) page prototype too, so the next render
    // is recorded into the page-window state both realms read.
    installCanvasMirrorRecorder();
    const s = state();
    const id = canvasId(canvas, false);
    const urls = id ? collectLeafUrls(id, Number.POSITIVE_INFINITY, key => s.records[key]) : new Set<string>();
    const images = new Map<string, CanvasImageSource>();
    if (urls.size) {
        await Promise.all([...urls].map(async url => {
            try { const image = await loadCleanImage(url); if (image) images.set(url, image); } catch { /* skip */ }
        }));
    }
    const rebuilt = (id && images.size) ? rebuildById(id, Number.POSITIVE_INFINITY, images, new Set(), 0) : null;
    const ok = !!rebuilt && isReadable(rebuilt);
    if (s.debug) {
        // eslint-disable-next-line no-console
        console.log('[Yomu][canvas-mirror]', { id, records: Object.keys(s.records).length, leafUrls: urls.size, fetched: images.size, rebuilt: !!rebuilt, readable: ok });
    }
    return ok ? rebuilt! : undefined;
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

// Install the recorder. No-op off BookWalker hosts (the hook would otherwise add
// overhead to every canvas draw on every site) and idempotent via the shared
// page-window state. Patches whichever realm calls it — the page's 2D context
// prototype is shared across realms, so a single install in either realm captures.
export function installCanvasMirrorRecorder(hostname: string = location.hostname): void {
    const s = state();
    if (s.installed || !isBookwalkerHost(hostname)) return;
    try { s.debug = localStorage.getItem('yomu.canvasMirrorDebug') === '1'; } catch { /* */ }
    const global = globalThis as unknown as {
        CanvasRenderingContext2D?: { prototype: Context2DPrototype };
        OffscreenCanvasRenderingContext2D?: { prototype: Context2DPrototype };
    };
    patchContextPrototype(global.CanvasRenderingContext2D?.prototype);
    patchContextPrototype(global.OffscreenCanvasRenderingContext2D?.prototype);
    s.installed = true;
}
