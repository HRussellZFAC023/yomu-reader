// Rebuild tainted BookWalker/NFBR page canvases onto an origin-clean canvas so OCR
// can read them. The page records drawImage/clearRect calls in the page realm; the
// reader replays them with GM-fetched clean image sources.

import { isBookwalkerViewerHost } from './canvas-hosts';
import { managedSessionStorage } from '../app/storage';

export interface MirrorOp {
    seq: number;
    srcId: string | null; // id of the source canvas when the draw source is a canvas (recurse)
    url: string;          // source <img> URL ('' when source is a canvas/other)
    srcW?: number;        // source canvas dimensions when srcOps snapshots a reused buffer
    srcH?: number;
    srcOps?: MirrorOp[];  // source canvas content at composite time, before later reuse/pruning
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
let recorderInstallRetryTimer = 0;
let recorderInstallRetryCount = 0;
let recorderInstallDOMContentLoadedHooked = false;

const RECORDER_INSTALL_RETRY_DELAYS_MS = [0, 16, 50, 150, 400, 1000];
const MIRROR_SYNC_EMPTY_THROTTLE_MS = 250;
let lastMirrorSyncEpoch = '';
let lastMirrorSyncAt = 0;
let lastMirrorSyncResult = false;
const lastMirrorTargetSyncEpoch = new Map<string, string>();
const mirrorContentSummaryCache = new Map<string, { epoch: string; token: string }>();

// Counts page loads within a short window using sessionStorage (shared with the
// page realm, survives reloads in the same tab). Counts ONCE per load. Returns true
// once a reload loop is detected so installCanvasMirrorRecorder bails out.
function recorderReloadLoopDetected(): boolean {
    if (recorderLoadGuardChecked) return recorderLoopBroken;
    recorderLoadGuardChecked = true;
    try {
        const now = Date.now();
        const prev = JSON.parse(managedSessionStorage.getItem(RELOAD_GUARD_KEY) || 'null') as { n: number; at: number } | null;
        const next = prev && now - prev.at < RELOAD_GUARD_WINDOW_MS ? { n: prev.n + 1, at: prev.at } : { n: 1, at: now };
        managedSessionStorage.setItem(RELOAD_GUARD_KEY, JSON.stringify(next));
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
const METHOD_ATTR = 'data-yomu-mirror-method';
const DUMP_ATTR = 'data-yomu-mirror-dump';
const REQUEST_ATTR = 'data-yomu-mirror-request';
const SUMMARY_REQUEST_PREFIX = 'summary:';
const PULL_EVENT = 'yomu-canvas-mirror-pull';
// The page-world recorder can be installed by another Yomu version before this
// reader starts. Only trust its compact summaries when both sides use the same
// canonical identity representation; records remain backward-compatible.
const MIRROR_TOKEN_CONTRACT_VERSION = 3;

interface RecorderOpts { a: string; m: number; k: number; e: string; d: string; q?: string; p: string; r: string; v?: number; }

export interface MirrorGlobalState {
    seq: number; nextId: number; installed: boolean; epoch?: number;
    records: Record<string, MirrorRecord>;
}
interface MirrorBridgePayload {
    records?: Record<string, MirrorRecord>;
    summaries?: Record<string, string>;
    seq?: number;
    nextId?: number;
    epoch?: number;
    tv?: number;
}
// Content-world reader state. Page-world recorder state is copied here through
// the shared-DOM bridge; do not store page-world objects in this realm.
function pageWindow(): typeof globalThis & { __yomuCanvasMirror?: MirrorGlobalState } {
    return globalThis as typeof globalThis & { __yomuCanvasMirror?: MirrorGlobalState };
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
    return selectLatestContentOpsBefore(ops, beforeSeq);
}

function selectLatestReplayOps(ops: readonly MirrorOp[], beforeSeq: number): MirrorOp[] {
    let replaySeq = beforeSeq;
    for (let index = ops.length - 1; index >= 0; index--) {
        const op = ops[index]!;
        if (op.seq >= replaySeq) continue;
        if (op.clear) {
            replaySeq = op.seq;
            continue;
        }
        break;
    }
    return selectLatestContentOpsBefore(ops, replaySeq);
}

function selectLatestContentOpsBefore(ops: readonly MirrorOp[], beforeSeq: number): MirrorOp[] {
    const byDest = new Map<string, MirrorOp>();
    for (const op of ops) {
        if (op.seq >= beforeSeq) continue;
        if (op.clear) {
            byDest.clear();
            continue;
        }
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
    for (const op of selectLatestReplayOps(record.ops, beforeSeq)) {
        if (op.srcOps?.length) collectLeafUrlsFromSnapshot(op.srcOps, lookup, out, next, depth + 1);
        else if (op.srcId) {
            const before = out.size;
            collectLeafUrls(op.srcId, op.seq, lookup, out, next, depth + 1);
            if (out.size === before && shouldUseLatestSourceFallback(op.srcId, op.seq, lookup)) {
                collectLeafUrls(op.srcId, Number.POSITIVE_INFINITY, lookup, out, next, depth + 1);
            }
        }
        else if (op.url) out.add(op.url);
    }
    return out;
}

function collectLeafUrlsFromSnapshot(
    ops: readonly MirrorOp[],
    lookup: (id: string) => MirrorRecord | undefined,
    out: Set<string>,
    seen: Set<string>,
    depth: number,
): Set<string> {
    if (depth > MAX_REBUILD_DEPTH) return out;
    for (const op of selectLatestReplayOps(ops, Number.POSITIVE_INFINITY)) {
        if (op.srcOps?.length) collectLeafUrlsFromSnapshot(op.srcOps, lookup, out, seen, depth + 1);
        else if (op.srcId) {
            const before = out.size;
            collectLeafUrls(op.srcId, op.seq, lookup, out, seen, depth + 1);
            if (out.size === before && shouldUseLatestSourceFallback(op.srcId, op.seq, lookup)) {
                collectLeafUrls(op.srcId, Number.POSITIVE_INFINITY, lookup, out, seen, depth + 1);
            }
        }
        else if (op.url) out.add(op.url);
    }
    return out;
}

function shouldUseLatestSourceFallback(
    id: string,
    beforeSeq: number,
    lookup: (id: string) => MirrorRecord | undefined,
): boolean {
    if (!Number.isFinite(beforeSeq)) return false;
    const record = lookup(id);
    if (!record?.ops.length) return false;
    return !record.ops.some(op => !op.clear && op.seq < beforeSeq);
}

function collectLeafContentFingerprints(
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
    const next = new Set(seen).add(id);
    for (const op of selectLatestReplayOps(record.ops, beforeSeq)) {
        if (op.srcOps?.length) {
            collectLeafContentFingerprintsFromSnapshot(op.srcOps, lookup, out, next, depth + 1);
        } else if (op.srcId) {
            const before = out.size;
            collectLeafContentFingerprints(op.srcId, op.seq, lookup, out, next, depth + 1);
            if (out.size === before && shouldUseLatestSourceFallback(op.srcId, op.seq, lookup)) {
                collectLeafContentFingerprints(op.srcId, Number.POSITIVE_INFINITY, lookup, out, next, depth + 1);
            }
        } else if (op.url) {
            // Destination geometry is presentation, not page identity: real
            // BookWalker zoom rewrites dx/dy/dw/dh for the same source page.
            out.add([
                canonicalBookwalkerAssetUrl(op.url),
                op.sx,
                op.sy,
                op.sw,
                op.sh,
            ].join(':'));
        }
    }
    return out;
}

function collectLeafContentFingerprintsFromSnapshot(
    ops: readonly MirrorOp[],
    lookup: (id: string) => MirrorRecord | undefined,
    out: Set<string>,
    seen: Set<string>,
    depth: number,
): Set<string> {
    if (depth > MAX_REBUILD_DEPTH) return out;
    for (const op of selectLatestReplayOps(ops, Number.POSITIVE_INFINITY)) {
        if (op.srcOps?.length) {
            collectLeafContentFingerprintsFromSnapshot(op.srcOps, lookup, out, seen, depth + 1);
        } else if (op.srcId) {
            const before = out.size;
            collectLeafContentFingerprints(op.srcId, op.seq, lookup, out, seen, depth + 1);
            if (out.size === before && shouldUseLatestSourceFallback(op.srcId, op.seq, lookup)) {
                collectLeafContentFingerprints(op.srcId, Number.POSITIVE_INFINITY, lookup, out, seen, depth + 1);
            }
        } else if (op.url) {
            out.add([
                canonicalBookwalkerAssetUrl(op.url),
                op.sx,
                op.sy,
                op.sw,
                op.sh,
            ].join(':'));
        }
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
    canvases: Map<string, HTMLCanvasElement>,
    seen: Set<string>,
    depth: number,
    lookup: (id: string) => MirrorRecord | undefined,
): HTMLCanvasElement | null {
    if (depth > MAX_REBUILD_DEPTH || seen.has(id)) return null;
    const record = lookup(id);
    if (!record || !record.w || !record.h) return null;
    const ops = selectLatestReplayOps(record.ops, beforeSeq);
    if (!ops.length) return null;
    const out = document.createElement('canvas');
    out.width = record.w; out.height = record.h;
    const ctx = markSkip(out.getContext('2d', { willReadFrequently: true }));
    if (!ctx) return null;
    seen.add(id);
    let drew = 0;
    for (const op of ops) {
        let source: CanvasImageSource | null = null;
        if (op.srcOps?.length && op.srcW && op.srcH) {
            source = rebuildSnapshotSource(op.srcOps, op.srcW, op.srcH, images, canvases, new Set(seen), depth + 1, lookup);
        } else if (op.srcId) {
            source = rebuildById(op.srcId, op.seq, images, canvases, new Set(seen), depth + 1, lookup)
                ?? (shouldUseLatestSourceFallback(op.srcId, op.seq, lookup)
                    ? rebuildById(op.srcId, Number.POSITIVE_INFINITY, images, canvases, new Set(seen), depth + 1, lookup)
                    : null)
                ?? canvases.get(op.srcId)
                ?? null;
        }
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

function rebuildSnapshotSource(
    ops: readonly MirrorOp[],
    width: number,
    height: number,
    images: Map<string, CanvasImageSource>,
    canvases: Map<string, HTMLCanvasElement>,
    seen: Set<string>,
    depth: number,
    lookup: (id: string) => MirrorRecord | undefined,
): HTMLCanvasElement | null {
    if (depth > MAX_REBUILD_DEPTH || !width || !height) return null;
    const contentOps = selectLatestReplayOps(ops, Number.POSITIVE_INFINITY);
    if (!contentOps.length) return null;
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = markSkip(out.getContext('2d', { willReadFrequently: true }));
    if (!ctx) return null;
    let drew = 0;
    for (const op of contentOps) {
        let source: CanvasImageSource | null = null;
        if (op.srcOps?.length && op.srcW && op.srcH) {
            source = rebuildSnapshotSource(op.srcOps, op.srcW, op.srcH, images, canvases, new Set(seen), depth + 1, lookup);
        } else if (op.srcId) {
            source = rebuildById(op.srcId, op.seq, images, canvases, new Set(seen), depth + 1, lookup)
                ?? (shouldUseLatestSourceFallback(op.srcId, op.seq, lookup)
                    ? rebuildById(op.srcId, Number.POSITIVE_INFINITY, images, canvases, new Set(seen), depth + 1, lookup)
                    : null)
                ?? canvases.get(op.srcId)
                ?? null;
        } else if (op.url) {
            source = images.get(op.url) ?? null;
        }
        if (!source) continue;
        try {
            if (op.sw >= 0) ctx.drawImage(source, op.sx, op.sy, op.sw, op.sh, op.dx, op.dy, op.dw, op.dh);
            else if (op.dw >= 0) ctx.drawImage(source, op.dx, op.dy, op.dw, op.dh);
            else ctx.drawImage(source, op.dx, op.dy);
            drew++;
        } catch { /* a stale or clipped source — skip this tile */ }
    }
    return drew ? out : null;
}

// fallow-ignore-next-line unused-export
export function canvasMirrorHasOps(canvas: object): boolean {
    const id = canvasId(canvas, false);
    if (!id) return false;
    const s = state();
    if (!(s.records[id]?.ops.length)) pullPageMirrorRecords(s, id);
    return (s.records[id]?.ops.length ?? 0) > 0;
}

// Copy the page-world recorder's records into this (content-world) realm's state
// over the shared DOM. dispatchEvent is synchronous, so the page-world responder
// has written the JSON dump by the time dispatch returns. No-op (returns false)
// when the page recorder isn't present or the reader already shares its realm.
export function pullPageMirrorRecords(target: MirrorGlobalState = state(), scope?: object | string | null): boolean {
    const requestedId = typeof scope === 'string' ? scope : scope ? (canvasId(scope, false) ?? '') : '';
    const parsed = requestPageMirrorPayload(requestedId);
    if (!parsed?.records) return false;
    mergeMirrorPayloadMetadata(target, parsed);
    if (requestedId) {
        let copied = false;
        for (const [id, record] of Object.entries(parsed.records)) {
            target.records[id] = record;
            copied = true;
        }
        if (!copied) delete target.records[requestedId];
        lastMirrorTargetSyncEpoch.set(requestedId, canvasMirrorTurnToken());
    } else {
        target.records = parsed.records;
        lastMirrorTargetSyncEpoch.clear();
    }
    return true;
}

let summaryBridgeContractMismatch = false;

export function resetMirrorSummaryBridgeForTests(): void {
    summaryBridgeContractMismatch = false;
    mirrorContentSummaryCache.clear();
}

function pullPageMirrorContentSummary(id: string, target: MirrorGlobalState = state()): string {
    const parsed = requestPageMirrorPayload(`${SUMMARY_REQUEST_PREFIX}${id}`);
    if (!parsed) return '';
    mergeMirrorPayloadMetadata(target, parsed);
    if (parsed.tv !== MIRROR_TOKEN_CONTRACT_VERSION) {
        summaryBridgeContractMismatch = true;
        mirrorContentSummaryCache.delete(id);
        return '';
    }
    const token = parsed.summaries?.[id] ?? '';
    const epoch = canvasMirrorTurnToken();
    if (token) mirrorContentSummaryCache.set(id, { epoch, token });
    else mirrorContentSummaryCache.delete(id);
    return token;
}

function requestPageMirrorPayload(request: string): MirrorBridgePayload | null {
    try {
        const root = document.documentElement;
        if (!root || !recorderMarkerPresent()) return null;
        if (request) root.setAttribute(REQUEST_ATTR, request);
        else root.removeAttribute(REQUEST_ATTR);
        try {
            root.dispatchEvent(new CustomEvent(PULL_EVENT));
        } finally {
            if (request) root.removeAttribute(REQUEST_ATTR);
        }
        const text = root.querySelector('[' + DUMP_ATTR + ']')?.textContent;
        if (!text) return null;
        return JSON.parse(text) as MirrorBridgePayload;
    } catch { return null; }
}

function mergeMirrorPayloadMetadata(target: MirrorGlobalState, parsed: MirrorBridgePayload): void {
    if (typeof parsed.seq === 'number') target.seq = Math.max(target.seq, parsed.seq);
    if (typeof parsed.nextId === 'number') target.nextId = Math.max(target.nextId, parsed.nextId);
    if (typeof parsed.epoch === 'number') target.epoch = parsed.epoch;
}

// fallow-ignore-next-line unused-export
export function syncCanvasMirrorRecords(): boolean {
    const target = state();
    const epoch = canvasMirrorTurnToken();
    const now = Date.now();
    if (epoch) {
        if (epoch === lastMirrorSyncEpoch) return lastMirrorSyncResult || hasMirrorRecords(target);
    } else if (now - lastMirrorSyncAt < MIRROR_SYNC_EMPTY_THROTTLE_MS) {
        return lastMirrorSyncResult || hasMirrorRecords(target);
    }
    lastMirrorSyncEpoch = epoch;
    lastMirrorSyncAt = now;
    lastMirrorSyncResult = pullPageMirrorRecords(target);
    return lastMirrorSyncResult || hasMirrorRecords(target);
}

function hasMirrorRecords(target: MirrorGlobalState): boolean {
    for (const key in target.records) {
        if (target.records[key]?.ops.length) return true;
    }
    return false;
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
    const epoch = canvasMirrorTurnToken();
    if (recorderMarkerPresent() && !summaryBridgeContractMismatch) {
        const cachedSummary = mirrorContentSummaryCache.get(id);
        if (cachedSummary && (!epoch || cachedSummary.epoch === epoch)) return cachedSummary.token;
        const summary = pullPageMirrorContentSummary(id, s);
        if (summary) return summary;
    }
    if (!(s.records[id]?.ops.length) || (epoch && lastMirrorTargetSyncEpoch.get(id) !== epoch)) {
        pullPageMirrorRecords(s, id);
    }
    // captureCanvasMirror stamps this exact representation on the rebuilt frame.
    // Returning a raw fingerprint here made a successful capture compare unequal
    // to the same live record whenever an older recorder lacked summary support.
    return mirrorContentTokenForRecords(id, key => s.records[key]);
}

function operationContentFingerprint(id: string, record: MirrorRecord): string {
    const ops = selectLatestReplayOps(record.ops, Number.POSITIVE_INFINITY);
    if (!ops.length) return '';
    return [
        id,
        record.w,
        record.h,
        ...ops.map(op => [
            op.srcId ?? '',
            canonicalBookwalkerAssetUrl(op.url),
            op.sx,
            op.sy,
            op.sw,
            op.sh,
            op.dx,
            op.dy,
            op.dw,
            op.dh,
        ].join(':')),
    ].join('|');
}

export function canonicalBookwalkerAssetUrl(rawUrl: string): string {
    if (!rawUrl) return '';
    try {
        const url = new URL(rawUrl, location.href);
        if (isBookwalkerAssetHost(url.hostname)) {
            url.hash = '';
            for (const key of [...url.searchParams.keys()]) {
                if (isVolatileSignedUrlParam(key)) url.searchParams.delete(key);
            }
            url.searchParams.sort();
        }
        return url.toString();
    } catch {
        return rawUrl;
    }
}

function isBookwalkerAssetHost(hostname: string): boolean {
    return hostname === 'bookwalker.jp'
        || hostname.endsWith('.bookwalker.jp');
}

function isVolatileSignedUrlParam(key: string): boolean {
    const lower = key.toLowerCase();
    return lower === 'policy'
        || lower === 'signature'
        || lower === 'key-pair-id'
        || lower === 'expires'
        || lower.startsWith('x-amz-');
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
    if (id && recorderMarkerPresent()) pullPageMirrorRecords(s, id);
    // BookWalker reuses and mutates its canvas records while source images are being
    // fetched. Freeze the reachable operation graph before the first await so page A
    // cannot be rebuilt from page B's later operations.
    const records = id ? snapshotMirrorRecordGraph(id, s.records) : Object.create(null) as Record<string, MirrorRecord>;
    const lookup = (key: string): MirrorRecord | undefined => records[key];
    const urls = id ? collectLeafUrls(id, Number.POSITIVE_INFINITY, lookup) : new Set<string>();
    const contentToken = id ? mirrorContentTokenForRecords(id, lookup) : '';
    const images = new Map<string, CanvasImageSource>();
    if (urls.size) {
        await Promise.all([...urls].map(async url => {
            try { const image = await loadCleanImage(url); if (image) images.set(url, image); } catch { /* skip */ }
        }));
        // A one-tile rebuild is not a successful page capture. Giving a partial
        // bitmap the complete page token would poison the OCR cache and make the
        // missing text permanent, so fall back/retry until every selected leaf is
        // available.
        if (images.size !== urls.size) return undefined;
    }
    const canvases = new Map(
        Array.from(document.querySelectorAll<HTMLCanvasElement>(`canvas[${ID_ATTR}]`))
            .map(source => [source.getAttribute(ID_ATTR) ?? '', source] as const)
            .filter(([sourceId]) => sourceId),
    );
    const rebuilt = id ? rebuildById(id, Number.POSITIVE_INFINITY, images, canvases, new Set(), 0, lookup) : null;
    if (rebuilt && contentToken) rebuilt.dataset.yomuMirrorContentToken = contentToken;
    return rebuilt && isReadable(rebuilt) ? rebuilt : undefined;
}

function snapshotMirrorRecordGraph(rootId: string, source: Record<string, MirrorRecord>): Record<string, MirrorRecord> {
    const snapshot: Record<string, MirrorRecord> = Object.create(null);
    const visitRecord = (id: string, depth: number): void => {
        if (depth > MAX_REBUILD_DEPTH || snapshot[id]) return;
        const record = source[id];
        if (!record) return;
        const ops = record.ops.map(cloneMirrorOp);
        snapshot[id] = { w: record.w, h: record.h, ops };
        visitOps(ops, depth + 1);
    };
    const visitOps = (ops: readonly MirrorOp[], depth: number): void => {
        if (depth > MAX_REBUILD_DEPTH) return;
        for (const op of ops) {
            if (op.srcId) visitRecord(op.srcId, depth);
            if (op.srcOps?.length) visitOps(op.srcOps, depth + 1);
        }
    };
    visitRecord(rootId, 0);
    return snapshot;
}

function cloneMirrorOp(op: MirrorOp): MirrorOp {
    return {
        ...op,
        ...(op.srcOps ? { srcOps: op.srcOps.map(cloneMirrorOp) } : {}),
    };
}

export function mirrorContentTokenForRecords(id: string, lookup: (id: string) => MirrorRecord | undefined): string {
    const content = collectLeafContentFingerprints(id, Number.POSITIVE_INFINITY, lookup);
    if (content.size) return `m:${mirrorTokenHash([...content].sort().join('\u0001'))}`;
    const record = lookup(id);
    const fingerprint = record ? operationContentFingerprint(id, record) : '';
    return fingerprint ? `o:${mirrorTokenHash(fingerprint)}` : '';
}

function mirrorTokenHash(value: string): string {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
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
    const HC = (win as { HTMLCanvasElement?: unknown }).HTMLCanvasElement as (new () => unknown) | undefined;
    const OC = (win as { OffscreenCanvas?: unknown }).OffscreenCanvas as (new () => unknown) | undefined;
    const w2 = win as { CanvasRenderingContext2D?: { prototype: Context2DPrototype }; OffscreenCanvasRenderingContext2D?: { prototype: Context2DPrototype } };
    if (!w2.CanvasRenderingContext2D?.prototype && !w2.OffscreenCanvasRenderingContext2D?.prototype) return;
    const ATTR = opts.a, MAX = opts.m, KEEP = opts.k;
    const S = (win.__yomuCanvasMirror = win.__yomuCanvasMirror || { seq: 0, nextId: 1, installed: false, epoch: 0, records: Object.create(null) }) as MirrorGlobalState;
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
    const isCanvas = (o: unknown): boolean => Boolean(o) && ((HC != null && o instanceof HC) || (OC != null && o instanceof OC));
    const srcUrl = (o: unknown): string => { const m = o as { currentSrc?: string; src?: string } | null; return m ? ((typeof m.currentSrc === 'string' && m.currentSrc) || (typeof m.src === 'string' && m.src) || '') : ''; };
    const idOf = (c: unknown, create: boolean): string | null => {
        const el = c as { getAttribute?: (n: string) => string | null; setAttribute?: (n: string, v: string) => void; __yomuMid?: string };
        if (el && typeof el.getAttribute === 'function' && typeof el.setAttribute === 'function') { let i = el.getAttribute(ATTR); if (!i && create) { i = 'm' + (S.nextId++); try { el.setAttribute(ATTR, i); } catch { return null; } } return i; }
        if (el && el.__yomuMid) return el.__yomuMid; if (el && create) { try { return (el.__yomuMid = 'm' + (S.nextId++)); } catch { return null; } } return null;
    };
    const rec = (id: string, w: number, h: number): MirrorRecord => { let r = S.records[id]; if (!r) { r = { w, h, ops: [] }; S.records[id] = r; } if (w) r.w = w; if (h) r.h = h; if (r.ops.length >= MAX) r.ops.splice(0, r.ops.length - KEEP); return r; };
    const dKey = (op: MirrorOp): string => op.dx + ',' + op.dy + ',' + op.dw + ',' + op.dh;
    const latestOpsBefore = (ops: MirrorOp[], beforeSeq: number): MirrorOp[] => {
        const byDest = new Map<string, MirrorOp>();
        for (const op of ops) {
            if (op.seq >= beforeSeq) continue;
            if (op.clear) { byDest.clear(); continue; }
            byDest.set(dKey(op), op);
        }
        return Array.from(byDest.values()).sort((a, b) => a.seq - b.seq);
    };
    const latestOps = (ops: MirrorOp[], beforeSeq: number): MirrorOp[] => {
        let replaySeq = beforeSeq;
        for (let index = ops.length - 1; index >= 0; index--) {
            const op = ops[index];
            if (!op || op.seq >= replaySeq) continue;
            if (op.clear) {
                replaySeq = op.seq;
                continue;
            }
            break;
        }
        return latestOpsBefore(ops, replaySeq);
    };
    const snapshotOps = (id: string | null, beforeSeq: number, depth: number): MirrorOp[] => {
        if (!id || depth > 4) return [];
        const sourceRecord = S.records[id];
        if (!sourceRecord) return [];
        return latestOps(sourceRecord.ops, beforeSeq).map(sourceOp => {
            const copy = { ...sourceOp };
            if (sourceOp.srcId) {
                const nestedRecord = S.records[sourceOp.srcId];
                if (nestedRecord) {
                    copy.srcW = nestedRecord.w;
                    copy.srcH = nestedRecord.h;
                    const nested = snapshotOps(sourceOp.srcId, sourceOp.seq, depth + 1);
                    if (nested.length) copy.srcOps = nested;
                }
            }
            return copy;
        });
    };
    const addSnapshotDependencies = (ops: MirrorOp[], out: Record<string, MirrorRecord>, seen: Record<string, true>, depth: number): void => {
        if (depth > 6) return;
        for (const op of ops) {
            if (op.srcOps?.length) addSnapshotDependencies(op.srcOps, out, seen, depth + 1);
            else if (op.srcId) addRecordClosure(op.srcId, out, seen, depth + 1);
        }
    };
    const addRecordClosure = (id: string, out: Record<string, MirrorRecord>, seen: Record<string, true>, depth: number): void => {
        if (!id || seen[id] || depth > 6) return;
        const record = S.records[id];
        if (!record) return;
        seen[id] = true;
        out[id] = record;
        addSnapshotDependencies(record.ops, out, seen, depth + 1);
    };
    const requestedRecords = (id: string): Record<string, MirrorRecord> => {
        if (!id) return S.records;
        const out = Object.create(null) as Record<string, MirrorRecord>;
        addRecordClosure(id, out, Object.create(null) as Record<string, true>, 0);
        return out;
    };
    const volatileSignedParam = (key: string): boolean => {
        const lower = key.toLowerCase();
        return lower === 'policy'
            || lower === 'signature'
            || lower === 'key-pair-id'
            || lower === 'expires'
            || lower.startsWith('x-amz-');
    };
    const canonicalUrl = (raw: string): string => {
        if (!raw) return '';
        try {
            const url = new URL(raw, win.location?.href || doc?.location?.href || '');
            if (url.hostname === 'bookwalker.jp' || url.hostname.endsWith('.bookwalker.jp')) {
                url.hash = '';
                for (const key of Array.from(url.searchParams.keys())) {
                    if (volatileSignedParam(key)) url.searchParams.delete(key);
                }
                url.searchParams.sort();
            }
            return url.toString();
        } catch {
            return raw;
        }
    };
    const hashText = (value: string): string => {
        let hash = 2166136261;
        for (let index = 0; index < value.length; index++) {
            hash ^= value.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    };
    // Keep the page-world summary byte-identical to the reader contract above.
    // Zoom destination coordinates are deliberately excluded.
    const leafFingerprint = (op: MirrorOp): string => [
        canonicalUrl(op.url),
        op.sx,
        op.sy,
        op.sw,
        op.sh,
    ].join(':');
    const shouldUseLatestSource = (id: string, beforeSeq: number): boolean => {
        if (!Number.isFinite(beforeSeq)) return false;
        const record = S.records[id];
        if (!record?.ops.length) return false;
        return !record.ops.some(op => !op.clear && op.seq < beforeSeq);
    };
    const addSourceLeafFingerprints = (
        id: string,
        beforeSeq: number,
        out: Record<string, boolean>,
        seen: Record<string, boolean>,
        depth: number,
    ): void => {
        const before = Object.keys(out).length;
        addLeafFingerprints(id, beforeSeq, out, seen, depth);
        if (Object.keys(out).length === before && shouldUseLatestSource(id, beforeSeq)) {
            addLeafFingerprints(id, Number.POSITIVE_INFINITY, out, seen, depth);
        }
    };
    const addLeafFingerprintsFromOps = (ops: MirrorOp[], out: Record<string, boolean>, seen: Record<string, boolean>, depth: number): void => {
        if (depth > 6) return;
        for (const op of latestOps(ops, Number.POSITIVE_INFINITY)) {
            if (op.srcOps?.length) addLeafFingerprintsFromOps(op.srcOps, out, seen, depth + 1);
            else if (op.srcId) addSourceLeafFingerprints(op.srcId, op.seq, out, seen, depth + 1);
            else if (op.url) out[leafFingerprint(op)] = true;
        }
    };
    const addLeafFingerprints = (id: string, beforeSeq: number, out: Record<string, boolean>, seen: Record<string, boolean>, depth: number): void => {
        if (!id || seen[id] || depth > 6) return;
        const record = S.records[id];
        if (!record) return;
        const nextSeen = { ...seen, [id]: true };
        for (const op of latestOps(record.ops, beforeSeq)) {
            if (op.srcOps?.length) addLeafFingerprintsFromOps(op.srcOps, out, nextSeen, depth + 1);
            else if (op.srcId) addSourceLeafFingerprints(op.srcId, op.seq, out, nextSeen, depth + 1);
            else if (op.url) out[leafFingerprint(op)] = true;
        }
    };
    const operationSummaryToken = (id: string, record: MirrorRecord): string => {
        const ops = latestOps(record.ops, Number.POSITIVE_INFINITY);
        if (!ops.length) return '';
        const payload = [
            id,
            record.w,
            record.h,
            ...ops.map(op => [
                op.srcId || '',
                canonicalUrl(op.url),
                op.sx,
                op.sy,
                op.sw,
                op.sh,
                op.dx,
                op.dy,
                op.dw,
                op.dh,
            ].join(':')),
        ].join('|');
        return `o:${hashText(payload)}`;
    };
    // Memoize on the record's OWN op state, not on the global turn epoch. The
    // reader-side cache is epoch-keyed and the recorder bumps the epoch on every
    // composite, so one repaint anywhere invalidated the token for EVERY page
    // canvas and forced a full leaf-fingerprint rescan of each one's whole op
    // graph (measured ~48 ms per canvas, ~627 ms across 13 canvases, 2-3x per
    // page turn — the bulk of the multi-second scroll stalls). A record whose ops
    // have not changed cannot have a different token, whatever the epoch does.
    const summaryToken = (id: string): string => {
        const record = S.records[id] as (MirrorRecord & { tok?: string; tokStamp?: string }) | undefined;
        if (!record) return '';
        const ops = record.ops;
        const stamp = ops.length + ':' + (ops.length ? ops[ops.length - 1].seq : -1);
        if (record.tokStamp === stamp && typeof record.tok === 'string') return record.tok;
        const leafs = Object.create(null) as Record<string, boolean>;
        addLeafFingerprints(id, Number.POSITIVE_INFINITY, leafs, Object.create(null) as Record<string, boolean>, 0);
        const keys = Object.keys(leafs).sort();
        const token = keys.length
            ? `m:${hashText(keys.join('\u0001'))}`
            : operationSummaryToken(id, record);
        record.tok = token;
        record.tokStamp = stamp;
        return token;
    };
    const requestedSummaries = (id: string): Record<string, string> => {
        const out = Object.create(null) as Record<string, string>;
        if (!id) return out;
        const token = summaryToken(id);
        if (token) out[id] = token;
        return out;
    };
    const patch = (p: Context2DPrototype | undefined): boolean => {
        if (!p) return false;
        if (p.__yomuMirrorPatched) return true;
        p.__yomuMirrorPatched = true;
        const draw = p.drawImage;
        p.drawImage = function (this: Context2DPrototype, src: unknown) {
            if (!this.__yomuMirrorSkip) { try {
                const cid = idOf(this.canvas, true);
                if (cid) {
                    const r = rec(cid, this.canvas.width, this.canvas.height); const a = arguments as unknown as ArrayLike<number>;
                    const sourceId = isCanvas(src) ? idOf(src, true) : null;
                    const o: MirrorOp = { seq: S.seq++, srcId: sourceId, url: sourceId ? '' : srcUrl(src), sx: 0, sy: 0, sw: -1, sh: -1, dx: 0, dy: 0, dw: -1, dh: -1, clear: false };
                    if (sourceId) {
                        const sourceRecord = S.records[sourceId];
                        if (sourceRecord) {
                            o.srcW = sourceRecord.w;
                            o.srcH = sourceRecord.h;
                            const snapshot = snapshotOps(sourceId, o.seq, 0);
                            if (snapshot.length) o.srcOps = snapshot;
                        }
                    }
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
        return true;
    };
    const patchedCanvas = patch(w2.CanvasRenderingContext2D?.prototype);
    const patchedOffscreen = patch(w2.OffscreenCanvasRenderingContext2D?.prototype);
    const patched = patchedCanvas || patchedOffscreen;
    if (!patched) return;
    win.__yomuCanvasMirrorRecorder = true;
    S.installed = true;
    if (doc && root) {
        try { root.setAttribute(opts.r, '1'); } catch { /* */ }
        try {
            root.addEventListener(opts.p, () => {
                try {
                    let node = root.querySelector('[' + opts.d + ']');
                    if (!node) { const created = doc.createElement('div'); created.setAttribute(opts.d, '1'); created.style.display = 'none'; root.appendChild(created); node = created; }
                    const requestAttr = opts.q || 'data-yomu-mirror-request';
                    const request = root.getAttribute(requestAttr) || '';
                    if (request.indexOf('summary:') === 0) {
                        node.textContent = JSON.stringify({ summaries: requestedSummaries(request.slice('summary:'.length)), seq: S.seq, nextId: S.nextId, epoch: S.epoch || 0, tv: opts.v || 0 });
                    } else {
                        node.textContent = JSON.stringify({ records: requestedRecords(request), seq: S.seq, nextId: S.nextId, epoch: S.epoch || 0 });
                    }
                } catch { /* */ }
            });
        } catch { /* */ }
    }
}

interface PageWindowLike {
    __yomuCanvasMirror?: MirrorGlobalState;
    __yomuCanvasMirrorRecorder?: boolean;
    document?: Document;
    location?: { href?: string };
    CanvasRenderingContext2D?: { prototype: Context2DPrototype };
    OffscreenCanvasRenderingContext2D?: { prototype: Context2DPrototype };
    HTMLCanvasElement?: unknown;
    OffscreenCanvas?: unknown;
}

interface UserscriptGlobal {
    unsafeWindow?: PageWindowLike;
    GM_info?: unknown;
    GM?: unknown;
    GM_xmlhttpRequest?: unknown;
}

function recorderOpts(): RecorderOpts {
    return {
        a: ID_ATTR,
        m: MAX_OPS_PER_CANVAS,
        k: PRUNE_KEEP,
        e: EPOCH_ATTR,
        d: DUMP_ATTR,
        q: REQUEST_ATTR,
        p: PULL_EVENT,
        r: MARKER_ATTR,
        v: MIRROR_TOKEN_CONTRACT_VERSION,
    };
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
    return recorderMarkerPresent() || Boolean((pageWindow() as PageWindowLike).__yomuCanvasMirror?.installed);
}

function installRecorderThroughUnsafeWindow(opts: RecorderOpts): boolean {
    const win = userscriptUnsafeWindow();
    if (!win) return false;
    try {
        recorderBootstrap(win, opts);
    } catch { return false; }
    return recorderMarkerPresent() || recorderWindowInstalled(win);
}

function userscriptUnsafeWindow(): PageWindowLike | null {
    const uw = (globalThis as unknown as UserscriptGlobal).unsafeWindow;
    if (!uw || uw === (globalThis as unknown as PageWindowLike)) return null;
    return uw;
}

function scheduleRecorderInstallRetry(hostname: string): void {
    if (recorderInstallRetryTimer) return;
    const delay = RECORDER_INSTALL_RETRY_DELAYS_MS[Math.min(recorderInstallRetryCount, RECORDER_INSTALL_RETRY_DELAYS_MS.length - 1)] ?? 1000;
    recorderInstallRetryCount += 1;
    recorderInstallRetryTimer = window.setTimeout(() => {
        recorderInstallRetryTimer = 0;
        installCanvasMirrorRecorder(hostname);
    }, delay);
    if (!recorderInstallDOMContentLoadedHooked && document.readyState === 'loading') {
        recorderInstallDOMContentLoadedHooked = true;
        document.addEventListener('DOMContentLoaded', () => {
            if (recorderAlreadyInstalled()) return;
            if (recorderInstallRetryTimer) window.clearTimeout(recorderInstallRetryTimer);
            recorderInstallRetryTimer = 0;
            installCanvasMirrorRecorder(hostname);
        }, { once: true });
    }
}

// The page-world recorder sets MARKER_ATTR on documentElement; the DOM is shared
// across realms so the content-world reader can see it without unsafeWindow.
function recorderMarkerPresent(): boolean {
    try { return document.documentElement?.getAttribute(MARKER_ATTR) === '1'; } catch { return false; }
}

function recorderAlreadyInstalled(): boolean {
    if (recorderMarkerPresent()) return true;
    const uw = userscriptUnsafeWindow();
    return (uw ? recorderWindowInstalled(uw) : false)
        || recorderWindowInstalled(pageWindow() as PageWindowLike);
}

function recorderWindowInstalled(win: PageWindowLike): boolean {
    try { return Boolean(win.__yomuCanvasMirror?.installed); } catch { return false; }
}

function likelyUserscriptContentSandbox(): boolean {
    const g = globalThis as unknown as UserscriptGlobal;
    return Boolean(g.unsafeWindow && g.unsafeWindow !== (globalThis as unknown as PageWindowLike))
        || Boolean(g.GM_info || g.GM || g.GM_xmlhttpRequest);
}

function markRecorderMethod(method: string): void {
    try { document.documentElement?.setAttribute(METHOD_ATTR, method); } catch { /* */ }
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
    if (!document.head && !document.documentElement) { scheduleRecorderInstallRetry(hostname); return; }
    const opts = recorderOpts();
    // Inject into the page world first (do NOT touch state() before injecting on a
    // sandboxed manager, or `??=` would create a sandbox-compartment state the page
    // recorder then reuses and the reader can't read).
    if (injectRecorderIntoPage(opts)) { markRecorderMethod('script'); return; }
    if (document.readyState === 'loading') { scheduleRecorderInstallRetry(hostname); return; }
    if (!likelyUserscriptContentSandbox() && installRecorderThroughUnsafeWindow(opts)) {
        markRecorderMethod('unsafeWindow');
        return;
    }
    if (likelyUserscriptContentSandbox()) return;
    // Injection blocked (CSP / Trusted Types with no usable nonce): patch this realm
    // directly. This still captures draws when the script already runs in the page
    // world (globalThis === page window).
    const s = state();
    if (s.installed) return;
    recorderBootstrap(pageWindow() as PageWindowLike, opts);
    if (recorderAlreadyInstalled()) markRecorderMethod('current');
}
