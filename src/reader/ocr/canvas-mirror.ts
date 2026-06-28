// Rebuild tainted BookWalker/NFBR page canvases onto an origin-clean canvas so OCR
// can read them. The page records drawImage/clearRect calls in the page realm; the
// reader replays them with GM-fetched clean image sources.

import { isBookwalkerViewerHost } from './canvas-hosts';

export interface MirrorOp {
    seq: number;
    srcId: string | null; // id of the source canvas when the draw source is a canvas (recurse)
    url: string;          // source <img> URL ('' when source is a canvas/other)
    sx: number; sy: number; sw: number; sh: number; // source rect; sw < 0 ⇒ no source rect
    dx: number; dy: number; dw: number; dh: number; // dest rect; dw < 0 ⇒ no dest size
    clear: boolean;
}
export interface MirrorRecord { w: number; h: number; ops: MirrorOp[]; }
const ID_ATTR = 'data-yomu-mid';
const MAX_OPS_PER_CANVAS = 6000;
const PRUNE_KEEP = 3000;
const MAX_REBUILD_DEPTH = 6;
// Circuit breaker: if the page reloads in a rapid loop, stop installing the
// recorder so the loop breaks and the page stays usable (some BookWalker / manager
// combinations — e.g. the Safari "Userscripts" extension — reload when the
// page-world recorder <script> is injected or the canvas prototype is patched).
const RELOAD_GUARD_KEY = 'yomu:bw:mirror-loadguard';
const RELOAD_GUARD_WINDOW_MS = 8000;
const RELOAD_GUARD_LIMIT = 4;
let recorderLoadGuardChecked = false;
let recorderLoopBroken = false;

// Counts page loads within a short window using sessionStorage (shared with the
// page realm, survives reloads in the same tab). Counts ONCE per load. Returns true
// once a reload loop is detected so installCanvasMirrorRecorder bails out.
function recorderReloadLoopDetected(): boolean {
    if (recorderLoadGuardChecked) return recorderLoopBroken;
    recorderLoadGuardChecked = true;
    try {
        const now = Date.now();
        const prev = JSON.parse(sessionStorage.getItem(RELOAD_GUARD_KEY) || 'null') as { n: number; at: number } | null;
        const next = prev && now - prev.at < RELOAD_GUARD_WINDOW_MS ? { n: prev.n + 1, at: prev.at } : { n: 1, at: now };
        sessionStorage.setItem(RELOAD_GUARD_KEY, JSON.stringify(next));
        recorderLoopBroken = next.n > RELOAD_GUARD_LIMIT;
        if (recorderLoopBroken) { try { console.warn('[Yomu] BookWalker reload loop detected — disabling the OCR recorder injection for this load. Reload manually to retry.'); } catch { /* */ } }
    } catch {
        recorderLoopBroken = false;
    }
    return recorderLoopBroken;
}

// Shared-DOM channel so an isolated content-world reader with no `unsafeWindow`
// (the Safari "Userscripts" extension) can both detect page turns and pull the
// page-world recorder's records. The DOM is shared across realms; the page window
// is not. EPOCH_ATTR is a cheap turn token bumped on each page composite/clear;
// MARKER_ATTR proves the page-world recorder installed; PULL_EVENT/DUMP_ATTR are a
// synchronous request/response to copy records into the reader's realm.
const EPOCH_ATTR = 'data-yomu-mirror-epoch';
const MARKER_ATTR = 'data-yomu-mirror-recorder';
const DUMP_ATTR = 'data-yomu-mirror-dump';
const PULL_EVENT = 'yomu-canvas-mirror-pull';

interface RecorderOpts { a: string; m: number; k: number; e: string; d: string; p: string; r: string; }

export interface MirrorGlobalState {
    seq: number; nextId: number; installed: boolean; epoch?: number;
    records: Record<string, MirrorRecord>;
}
// Share state between the userscript sandbox and page main world.
function pageWindow(): typeof globalThis & { __yomuCanvasMirror?: MirrorGlobalState } {
    const uw = (globalThis as unknown as { unsafeWindow?: typeof globalThis }).unsafeWindow;
    return (uw || globalThis) as typeof globalThis & { __yomuCanvasMirror?: MirrorGlobalState };
}
function state(): MirrorGlobalState {
    const win = pageWindow();
    return (win.__yomuCanvasMirror ??= { seq: 0, nextId: 1, installed: false, records: Object.create(null) });
}

// Stable id across sandbox/main-world boundaries.
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

const destKey = (op: MirrorOp): string => `${op.dx},${op.dy},${op.dw},${op.dh}`;

// Current content = latest non-clear op per destination before `beforeSeq`.
export function selectLatestContentOps(ops: readonly MirrorOp[], beforeSeq: number): MirrorOp[] {
    const byDest = new Map<string, MirrorOp>();
    for (const op of ops) {
        if (op.clear || op.seq >= beforeSeq) continue;
        byDest.set(destKey(op), op); // ops arrive in seq order, so the last write wins
    }
    return [...byDest.values()].sort((a, b) => a.seq - b.seq);
}

// Leaf image URLs feeding this record; fetched as clean copies.
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
    // Keep `seen` per path; spreads can revisit a shared buffer at different seqs.
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

// Mark a 2D context Yomu created so the recorder ignores draws into it. Yomu draws
// the page canvas into its OWN transient canvases (content-hash sampling, JPEG
// downscaling, mirror rebuild). Without this the recorder logs those Yomu-internal
// canvas→canvas draws as page composites and bumps the shared-DOM turn epoch — and
// since canvasReaderPageSignature samples content on every poll, the epoch (and so
// the signature) would drift on every tick, releasing fresh frames and re-OCRing
// the page in a loop. Callers outside this module reach the recorder's skip flag
// only through here.
export function markCanvasMirrorSkip<T extends CanvasRenderingContext2D | null>(context: T): T {
    if (context) (context as unknown as { __yomuMirrorSkip?: boolean }).__yomuMirrorSkip = true;
    return context;
}

function isReadable(canvas: HTMLCanvasElement): boolean {
    try {
        markSkip(canvas.getContext('2d', { willReadFrequently: true }))?.getImageData(0, 0, 1, 1);
        return true;
    } catch { return false; }
}

// Rebuild onto a fresh canvas using only clean fetched/rebuilt sources.
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

// fallow-ignore-next-line unused-export
export function canvasMirrorHasOps(canvas: object): boolean {
    const id = canvasId(canvas, false);
    return !!id && (state().records[id]?.ops.length ?? 0) > 0;
}

// Copy the page-world recorder's records into this (content-world) realm's state
// over the shared DOM. dispatchEvent is synchronous, so the page-world responder
// has written the JSON dump by the time dispatch returns. No-op (returns false)
// when the page recorder isn't present or the reader already shares its realm.
export function pullPageMirrorRecords(target: MirrorGlobalState = state()): boolean {
    try {
        const root = document.documentElement;
        if (!root || !recorderMarkerPresent()) return false;
        root.dispatchEvent(new CustomEvent(PULL_EVENT));
        const text = root.querySelector('[' + DUMP_ATTR + ']')?.textContent;
        if (!text) return false;
        const parsed = JSON.parse(text) as { records?: Record<string, MirrorRecord>; seq?: number; nextId?: number; epoch?: number };
        if (!parsed?.records) return false;
        target.records = parsed.records;
        if (typeof parsed.seq === 'number') target.seq = Math.max(target.seq, parsed.seq);
        if (typeof parsed.nextId === 'number') target.nextId = Math.max(target.nextId, parsed.nextId);
        if (typeof parsed.epoch === 'number') target.epoch = parsed.epoch;
        return true;
    } catch { return false; }
}

// Realm-agnostic page-turn token for tainted DRM canvases the pixel sampler can't
// read. The page-world recorder bumps a shared-DOM epoch on every page composite /
// full clear, so a turn changes this value even with no unsafeWindow and an
// unchanged/absent page counter. '' when no recorder has run yet.
export function canvasMirrorTurnToken(): string {
    try { return document.documentElement?.getAttribute(EPOCH_ATTR) ?? ''; } catch { return ''; }
}

// Per-canvas page identity for a tainted DRM canvas: a fingerprint of the source
// image(s) the engine composited into THIS canvas. Unlike the global epoch
// (canvasMirrorTurnToken), it moves only when this canvas is repainted with a
// DIFFERENT page — a same-page repaint (refocus, zoom, scroll-driven re-raster)
// replays the same leaf URLs so the token is unchanged, and another canvas painting
// never perturbs it. That stability is what lets an async mirror capture land and a
// landed overlay survive the constant epoch churn of vertical/continuous mode. '' when
// nothing is recorded for the canvas yet, so the caller can fall back to the epoch.
export function canvasMirrorContentToken(canvas: object): string {
    const id = canvasId(canvas, false);
    if (!id) return '';
    const s = state();
    if (!(s.records[id]?.ops.length)) pullPageMirrorRecords(s);
    const urls = collectLeafUrls(id, Number.POSITIVE_INFINITY, key => s.records[key]);
    return urls.size ? `m:${[...urls].sort().join('')}` : '';
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
    // Isolated content world with no unsafeWindow (Safari "Userscripts"): the engine
    // recorded into the PAGE-world __yomuCanvasMirror this realm can't see, so its own
    // records map is empty. Pull the page-world records over the shared-DOM bridge.
    if (id && !(s.records[id]?.ops.length)) pullPageMirrorRecords(s);
    const urls = id ? collectLeafUrls(id, Number.POSITIVE_INFINITY, key => s.records[key]) : new Set<string>();
    const images = new Map<string, CanvasImageSource>();
    if (urls.size) {
        await Promise.all([...urls].map(async url => {
            try { const image = await loadCleanImage(url); if (image) images.set(url, image); } catch { /* skip */ }
        }));
    }
    const rebuilt = (id && images.size) ? rebuildById(id, Number.POSITIVE_INFINITY, images, new Set(), 0) : null;
    return rebuilt && isReadable(rebuilt) ? rebuilt : undefined;
}

interface Context2DPrototype {
    drawImage: (...args: unknown[]) => unknown;
    clearRect: (x: number, y: number, w: number, h: number) => unknown;
    canvas: { width: number; height: number; nodeType?: number; isConnected?: boolean };
    __yomuMirrorPatched?: boolean;
    __yomuMirrorSkip?: boolean;
}

// Self-contained recorder, serialized and injected into the PAGE main world on
// Firefox (where the sandbox and the OCR reader are different realms and a
// sandbox-created state object can't be defined on / read from the page window).
// Running in the page realm makes the state + ops page-compartment objects the
// main-world reader can read directly. Must reference ONLY its parameters.
export function recorderBootstrap(win: PageWindowLike, opts: RecorderOpts): void {
    if (win.__yomuCanvasMirrorRecorder) return;
    win.__yomuCanvasMirrorRecorder = true;
    const ATTR = opts.a, MAX = opts.m, KEEP = opts.k;
    const S = (win.__yomuCanvasMirror = win.__yomuCanvasMirror || { seq: 0, nextId: 1, installed: true, epoch: 0, records: Object.create(null) }) as MirrorGlobalState;
    S.installed = true;
    // Shared-DOM channel for an isolated content-world reader (no unsafeWindow):
    // a turn token (epoch), an install marker, and a synchronous record dump.
    const doc = win.document;
    const root = doc && doc.documentElement;
    // Bump the page-turn epoch ONLY for composites into an on-DOM canvas (a real
    // viewer surface). Yomu's own transient canvases (content sampling, JPEG
    // downscale, mirror rebuild) are created detached via createElement and never
    // appended, so they're skipped here — otherwise capturing the page would itself
    // tick the epoch the page signature depends on, releasing the fresh frame in a
    // loop. OffscreenCanvas has no nodeType/isConnected, so it still counts.
    let lastDrawUrl = '';
    const bumpEpoch = (el: { nodeType?: number; isConnected?: boolean }): void => {
        if (el && el.nodeType && !el.isConnected) return;
        S.epoch = (S.epoch || 0) + 1;
        if (root) { try { root.setAttribute(opts.e, String(S.epoch)); } catch { /* */ } }
    };
    if (doc && root) {
        try { root.setAttribute(opts.r, '1'); } catch { /* */ }
        try {
            root.addEventListener(opts.p, () => {
                try {
                    let node = root.querySelector('[' + opts.d + ']');
                    if (!node) { const created = doc.createElement('div'); created.setAttribute(opts.d, '1'); created.style.display = 'none'; root.appendChild(created); node = created; }
                    node.textContent = JSON.stringify({ records: S.records, seq: S.seq, nextId: S.nextId, epoch: S.epoch || 0 });
                } catch { /* */ }
            });
        } catch { /* */ }
    }
    const HC = (win as { HTMLCanvasElement?: unknown }).HTMLCanvasElement as (new () => unknown) | undefined;
    const OC = (win as { OffscreenCanvas?: unknown }).OffscreenCanvas as (new () => unknown) | undefined;
    const isCanvas = (o: unknown): boolean => Boolean(o) && ((HC != null && o instanceof HC) || (OC != null && o instanceof OC));
    const srcUrl = (o: unknown): string => { const m = o as { currentSrc?: string; src?: string } | null; return m ? ((typeof m.currentSrc === 'string' && m.currentSrc) || (typeof m.src === 'string' && m.src) || '') : ''; };
    const idOf = (c: unknown, create: boolean): string | null => {
        const el = c as { getAttribute?: (n: string) => string | null; setAttribute?: (n: string, v: string) => void; __yomuMid?: string };
        if (el && typeof el.getAttribute === 'function' && typeof el.setAttribute === 'function') { let i = el.getAttribute(ATTR); if (!i && create) { i = 'm' + (S.nextId++); try { el.setAttribute(ATTR, i); } catch { return null; } } return i; }
        if (el && el.__yomuMid) return el.__yomuMid; if (el && create) { try { return (el.__yomuMid = 'm' + (S.nextId++)); } catch { return null; } } return null;
    };
    const rec = (id: string, w: number, h: number): MirrorRecord => { let r = S.records[id]; if (!r) { r = { w, h, ops: [] }; S.records[id] = r; } if (w) r.w = w; if (h) r.h = h; if (r.ops.length >= MAX) r.ops.splice(0, r.ops.length - KEEP); return r; };
    const patch = (p: Context2DPrototype | undefined): void => {
        if (!p || p.__yomuMirrorPatched) return; p.__yomuMirrorPatched = true;
        const draw = p.drawImage;
        p.drawImage = function (this: Context2DPrototype, src: unknown) {
            if (!this.__yomuMirrorSkip) { try {
                const cid = idOf(this.canvas, true);
                if (cid) {
                    const r = rec(cid, this.canvas.width, this.canvas.height); const a = arguments as unknown as ArrayLike<number>;
                    const o: MirrorOp = { seq: S.seq++, srcId: isCanvas(src) ? idOf(src, true) : null, url: isCanvas(src) ? '' : srcUrl(src), sx: 0, sy: 0, sw: -1, sh: -1, dx: 0, dy: 0, dw: -1, dh: -1, clear: false };
                    // `arguments` includes the source image at [0], so coordinates start at a[1].
                    if (a.length === 9) { o.sx = a[1]; o.sy = a[2]; o.sw = a[3]; o.sh = a[4]; o.dx = a[5]; o.dy = a[6]; o.dw = a[7]; o.dh = a[8]; }
                    else if (a.length === 5) { o.dx = a[1]; o.dy = a[2]; o.dw = a[3]; o.dh = a[4]; }
                    else if (a.length === 3) { o.dx = a[1]; o.dy = a[2]; }
                    r.ops.push(o);
                    // Advance the page-turn epoch on a composite (buffer→on-screen) OR
                    // when a NEW source image is drawn. Some NFBR modes paint a new page
                    // as direct image tiles with no canvas→canvas composite or full
                    // clear, so a composite-only signal misses the turn and the previous
                    // page's overlay sticks. Keying off the source URL bumps exactly once
                    // per new page (all ~2048 tiles share one page image) and stays
                    // stable if the viewer repaints the SAME page (animation/zoom) — a
                    // per-op stride would churn there and could flicker in a loop.
                    if (o.srcId) bumpEpoch(this.canvas);
                    else if (o.url && o.url !== lastDrawUrl) { lastDrawUrl = o.url; bumpEpoch(this.canvas); }
                }
            } catch { /* */ } }
            return draw.apply(this, arguments as unknown as unknown[]);
        } as typeof p.drawImage;
        const clr = p.clearRect;
        p.clearRect = function (this: Context2DPrototype, x: number, y: number, w: number, h: number) {
            if (!this.__yomuMirrorSkip) { try { if (x <= 0 && y <= 0 && w >= this.canvas.width && h >= this.canvas.height) { const cid = idOf(this.canvas, true); if (cid) { rec(cid, this.canvas.width, this.canvas.height).ops.push({ seq: S.seq++, srcId: null, url: '', sx: 0, sy: 0, sw: -1, sh: -1, dx: 0, dy: 0, dw: -1, dh: -1, clear: true }); bumpEpoch(this.canvas); } } } catch { /* */ } }
            return clr.apply(this, arguments as unknown as [number, number, number, number]);
        } as typeof p.clearRect;
    };
    const w2 = win as { CanvasRenderingContext2D?: { prototype: Context2DPrototype }; OffscreenCanvasRenderingContext2D?: { prototype: Context2DPrototype } };
    patch(w2.CanvasRenderingContext2D?.prototype);
    patch(w2.OffscreenCanvasRenderingContext2D?.prototype);
}

interface PageWindowLike {
    __yomuCanvasMirror?: MirrorGlobalState;
    __yomuCanvasMirrorRecorder?: boolean;
    document?: Document;
    CanvasRenderingContext2D?: { prototype: Context2DPrototype };
    OffscreenCanvasRenderingContext2D?: { prototype: Context2DPrototype };
    HTMLCanvasElement?: unknown;
    OffscreenCanvas?: unknown;
}

function recorderOpts(): RecorderOpts {
    return { a: ID_ATTR, m: MAX_OPS_PER_CANVAS, k: PRUNE_KEEP, e: EPOCH_ATTR, d: DUMP_ATTR, p: PULL_EVENT, r: MARKER_ATTR };
}

// Inject the recorder into the page main world. A <script> appended to the DOM
// runs in the PAGE realm even from an isolated content world with no unsafeWindow
// (the Safari "Userscripts" extension) or a sandboxed manager (Firefox), so it
// observes the engine's own page-world canvas draws. Returns true when the
// page-world recorder confirms install via the shared-DOM marker (readable from
// any realm) — the page window itself is NOT readable without unsafeWindow.
function injectRecorderIntoPage(opts: RecorderOpts): boolean {
    const parent = document.head || document.documentElement;
    if (!parent) return false;
    const source = `;(${recorderBootstrap.toString()})(window, ${JSON.stringify(opts)});`;
    try {
        const script = document.createElement('script');
        const nonce = [...document.querySelectorAll('script[nonce]')].map(el => el.getAttribute('nonce')).find(Boolean);
        if (nonce) script.setAttribute('nonce', nonce);
        const trusted = createTrustedMirrorScript(source);
        if (trusted) (script as unknown as { textContent: unknown }).textContent = trusted;
        else script.textContent = source;
        parent.append(script);
        script.remove();
    } catch { return false; }
    return recorderMarkerPresent() || Boolean((pageWindow() as PageWindowLike).__yomuCanvasMirror);
}

// The page-world recorder sets MARKER_ATTR on documentElement; the DOM is shared
// across realms so the content-world reader can see it without unsafeWindow.
function recorderMarkerPresent(): boolean {
    try { return document.documentElement?.getAttribute(MARKER_ATTR) === '1'; } catch { return false; }
}

function recorderAlreadyInstalled(): boolean {
    if (recorderMarkerPresent()) return true;
    const uw = (globalThis as unknown as { unsafeWindow?: PageWindowLike }).unsafeWindow;
    return Boolean(uw?.__yomuCanvasMirror?.installed)
        || Boolean((pageWindow() as PageWindowLike).__yomuCanvasMirror?.installed);
}

function createTrustedMirrorScript(code: string): unknown {
    try {
        const factory = (globalThis as { trustedTypes?: { createPolicy?: (n: string, o: { createScript: (s: string) => string }) => { createScript?: (s: string) => unknown } } }).trustedTypes;
        if (!factory?.createPolicy) return null;
        const policy = factory.createPolicy('yomu-canvas-mirror', { createScript: (s: string) => s });
        return policy?.createScript ? policy.createScript(code) : null;
    } catch { return null; }
}

// Install the recorder. No-op off BookWalker hosts. The engine paints in the PAGE
// main world, so we inject the recorder there via a <script> tag FIRST — this is
// the only realm-agnostic path: it works on the sandboxed managers (Firefox) AND
// on the Safari "Userscripts" extension, which runs the script in an isolated
// content world with NO unsafeWindow (the previous `differentRealm` gate left
// those harnesses patching the content realm's prototype, recording zero of the
// engine's draws — so BookWalker OCR was dead there). The content-world reader
// then pulls the records over the shared-DOM bridge (pullPageMirrorRecords).
// Idempotent via the shared-DOM marker so retries never re-append <script> nodes.
export function installCanvasMirrorRecorder(hostname: string = location.hostname): void {
    if (!isBookwalkerViewerHost(hostname)) return;
    if (recorderAlreadyInstalled()) return;
    if (recorderReloadLoopDetected()) return;
    // Inject into the page world first (do NOT touch state() before injecting on a
    // sandboxed manager, or `??=` would create a sandbox-compartment state the page
    // recorder then reuses and the reader can't read).
    if (injectRecorderIntoPage(recorderOpts())) return;
    // Injection blocked (CSP / Trusted Types with no usable nonce): patch this realm
    // directly. This still captures draws when the script already runs in the page
    // world (globalThis === page window).
    const s = state();
    if (s.installed) return;
    recorderBootstrap(pageWindow() as PageWindowLike, recorderOpts());
}
