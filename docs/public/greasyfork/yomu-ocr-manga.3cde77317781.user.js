(function() {
  "use strict";
  function isBookwalkerViewerHost(hostname = location.hostname) {
    return hostname === "bookwalker.jp" || hostname.endsWith(".bookwalker.jp");
  }
  const ID_ATTR = "data-yomu-mid";
  const MAX_OPS_PER_CANVAS = 6e3;
  const PRUNE_KEEP = 3e3;
  const MAX_REBUILD_DEPTH = 6;
  const RELOAD_GUARD_KEY = "yomu:bw:mirror-loadguard";
  const RELOAD_GUARD_WINDOW_MS = 8e3;
  const RELOAD_GUARD_LIMIT = 4;
  let recorderLoadGuardChecked = false;
  let recorderLoopBroken = false;
  let recorderInstallRetryTimer = 0;
  let recorderInstallRetryCount = 0;
  let recorderInstallDOMContentLoadedHooked = false;
  const RECORDER_INSTALL_RETRY_DELAYS_MS = [0, 16, 50, 150, 400, 1e3];
  const lastMirrorTargetSyncEpoch = /* @__PURE__ */ new Map();
  const mirrorContentSummaryCache = /* @__PURE__ */ new Map();
  function recorderReloadLoopDetected() {
    if (recorderLoadGuardChecked) return recorderLoopBroken;
    recorderLoadGuardChecked = true;
    try {
      const now = Date.now();
      const prev = JSON.parse(sessionStorage.getItem(RELOAD_GUARD_KEY) || "null");
      const next = prev && now - prev.at < RELOAD_GUARD_WINDOW_MS ? { n: prev.n + 1, at: prev.at } : { n: 1, at: now };
      sessionStorage.setItem(RELOAD_GUARD_KEY, JSON.stringify(next));
      recorderLoopBroken = next.n > RELOAD_GUARD_LIMIT;
      if (recorderLoopBroken) {
        try {
          console.warn("[Yomu] BookWalker reload loop detected — disabling the OCR recorder injection for this load. Reload manually to retry.");
        } catch {
        }
      }
    } catch {
      recorderLoopBroken = false;
    }
    return recorderLoopBroken;
  }
  const EPOCH_ATTR = "data-yomu-mirror-epoch";
  const MARKER_ATTR = "data-yomu-mirror-recorder";
  const METHOD_ATTR = "data-yomu-mirror-method";
  const DUMP_ATTR = "data-yomu-mirror-dump";
  const REQUEST_ATTR = "data-yomu-mirror-request";
  const SUMMARY_REQUEST_PREFIX = "summary:";
  const PULL_EVENT = "yomu-canvas-mirror-pull";
  const MIRROR_TOKEN_CONTRACT_VERSION = 3;
  function pageWindow() {
    return globalThis;
  }
  function state() {
    const win = pageWindow();
    return win.__yomuCanvasMirror ??= { seq: 0, nextId: 1, installed: false, records: /* @__PURE__ */ Object.create(null) };
  }
  function canvasId(canvas, create) {
    const el = canvas;
    if (el && typeof el.getAttribute === "function" && typeof el.setAttribute === "function") {
      let id = el.getAttribute(ID_ATTR);
      return id;
    }
    if (el && el.__yomuMid) return el.__yomuMid;
    return null;
  }
  const destKey = (op) => `${op.dx},${op.dy},${op.dw},${op.dh}`;
  function selectLatestReplayOps(ops, beforeSeq) {
    let replaySeq = beforeSeq;
    for (let index = ops.length - 1; index >= 0; index--) {
      const op = ops[index];
      if (op.seq >= replaySeq) continue;
      if (op.clear) {
        replaySeq = op.seq;
        continue;
      }
      break;
    }
    return selectLatestContentOpsBefore(ops, replaySeq);
  }
  function selectLatestContentOpsBefore(ops, beforeSeq) {
    const byDest = /* @__PURE__ */ new Map();
    for (const op of ops) {
      if (op.seq >= beforeSeq) continue;
      if (op.clear) {
        byDest.clear();
        continue;
      }
      byDest.set(destKey(op), op);
    }
    return [...byDest.values()].sort((a, b) => a.seq - b.seq);
  }
  function collectLeafUrls(id, beforeSeq, lookup, out = /* @__PURE__ */ new Set(), seen = /* @__PURE__ */ new Set(), depth = 0) {
    if (!id || depth > MAX_REBUILD_DEPTH || seen.has(id)) return out;
    const record = lookup(id);
    if (!record) return out;
    const next = new Set(seen).add(id);
    for (const op of selectLatestReplayOps(record.ops, beforeSeq)) {
      if (op.srcOps?.length) collectLeafUrlsFromSnapshot(op.srcOps, lookup, out, next, depth + 1);
      else if (op.srcId) {
        const before = out.size;
        collectLeafUrls(op.srcId, op.seq, lookup, out, next, depth + 1);
        if (out.size === before && shouldUseLatestSourceFallback(op.srcId, op.seq, lookup)) {
          collectLeafUrls(op.srcId, Number.POSITIVE_INFINITY, lookup, out, next, depth + 1);
        }
      } else if (op.url) out.add(op.url);
    }
    return out;
  }
  function collectLeafUrlsFromSnapshot(ops, lookup, out, seen, depth) {
    if (depth > MAX_REBUILD_DEPTH) return out;
    for (const op of selectLatestReplayOps(ops, Number.POSITIVE_INFINITY)) {
      if (op.srcOps?.length) collectLeafUrlsFromSnapshot(op.srcOps, lookup, out, seen, depth + 1);
      else if (op.srcId) {
        const before = out.size;
        collectLeafUrls(op.srcId, op.seq, lookup, out, seen, depth + 1);
        if (out.size === before && shouldUseLatestSourceFallback(op.srcId, op.seq, lookup)) {
          collectLeafUrls(op.srcId, Number.POSITIVE_INFINITY, lookup, out, seen, depth + 1);
        }
      } else if (op.url) out.add(op.url);
    }
    return out;
  }
  function shouldUseLatestSourceFallback(id, beforeSeq, lookup) {
    if (!Number.isFinite(beforeSeq)) return false;
    const record = lookup(id);
    if (!record?.ops.length) return false;
    return !record.ops.some((op) => !op.clear && op.seq < beforeSeq);
  }
  function collectLeafContentFingerprints(id, beforeSeq, lookup, out = /* @__PURE__ */ new Set(), seen = /* @__PURE__ */ new Set(), depth = 0) {
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
        out.add([
          canonicalBookwalkerAssetUrl(op.url),
          op.sx,
          op.sy,
          op.sw,
          op.sh
        ].join(":"));
      }
    }
    return out;
  }
  function collectLeafContentFingerprintsFromSnapshot(ops, lookup, out, seen, depth) {
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
          op.sh
        ].join(":"));
      }
    }
    return out;
  }
  function markSkip(context) {
    if (context) context.__yomuMirrorSkip = true;
    return context;
  }
  function markCanvasMirrorSkip(context) {
    if (context) context.__yomuMirrorSkip = true;
    return context;
  }
  function isReadable(canvas) {
    try {
      markSkip(canvas.getContext("2d", { willReadFrequently: true }))?.getImageData(0, 0, 1, 1);
      return true;
    } catch {
      return false;
    }
  }
  function rebuildById(id, beforeSeq, images, canvases, seen, depth, lookup) {
    if (depth > MAX_REBUILD_DEPTH || seen.has(id)) return null;
    const record = lookup(id);
    if (!record || !record.w || !record.h) return null;
    const ops = selectLatestReplayOps(record.ops, beforeSeq);
    if (!ops.length) return null;
    const out = document.createElement("canvas");
    out.width = record.w;
    out.height = record.h;
    const ctx = markSkip(out.getContext("2d", { willReadFrequently: true }));
    if (!ctx) return null;
    seen.add(id);
    let drew = 0;
    for (const op of ops) {
      let source = null;
      if (op.srcOps?.length && op.srcW && op.srcH) {
        source = rebuildSnapshotSource(op.srcOps, op.srcW, op.srcH, images, canvases, new Set(seen), depth + 1, lookup);
      } else if (op.srcId) {
        source = rebuildById(op.srcId, op.seq, images, canvases, new Set(seen), depth + 1, lookup) ?? (shouldUseLatestSourceFallback(op.srcId, op.seq, lookup) ? rebuildById(op.srcId, Number.POSITIVE_INFINITY, images, canvases, new Set(seen), depth + 1, lookup) : null) ?? canvases.get(op.srcId) ?? null;
      } else if (op.url) source = images.get(op.url) ?? null;
      if (!source) continue;
      try {
        if (op.sw >= 0) ctx.drawImage(source, op.sx, op.sy, op.sw, op.sh, op.dx, op.dy, op.dw, op.dh);
        else if (op.dw >= 0) ctx.drawImage(source, op.dx, op.dy, op.dw, op.dh);
        else ctx.drawImage(source, op.dx, op.dy);
        drew++;
      } catch {
      }
    }
    return drew ? out : null;
  }
  function rebuildSnapshotSource(ops, width, height, images, canvases, seen, depth, lookup) {
    if (depth > MAX_REBUILD_DEPTH || !width || !height) return null;
    const contentOps = selectLatestReplayOps(ops, Number.POSITIVE_INFINITY);
    if (!contentOps.length) return null;
    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    const ctx = markSkip(out.getContext("2d", { willReadFrequently: true }));
    if (!ctx) return null;
    let drew = 0;
    for (const op of contentOps) {
      let source = null;
      if (op.srcOps?.length && op.srcW && op.srcH) {
        source = rebuildSnapshotSource(op.srcOps, op.srcW, op.srcH, images, canvases, new Set(seen), depth + 1, lookup);
      } else if (op.srcId) {
        source = rebuildById(op.srcId, op.seq, images, canvases, new Set(seen), depth + 1, lookup) ?? (shouldUseLatestSourceFallback(op.srcId, op.seq, lookup) ? rebuildById(op.srcId, Number.POSITIVE_INFINITY, images, canvases, new Set(seen), depth + 1, lookup) : null) ?? canvases.get(op.srcId) ?? null;
      } else if (op.url) {
        source = images.get(op.url) ?? null;
      }
      if (!source) continue;
      try {
        if (op.sw >= 0) ctx.drawImage(source, op.sx, op.sy, op.sw, op.sh, op.dx, op.dy, op.dw, op.dh);
        else if (op.dw >= 0) ctx.drawImage(source, op.dx, op.dy, op.dw, op.dh);
        else ctx.drawImage(source, op.dx, op.dy);
        drew++;
      } catch {
      }
    }
    return drew ? out : null;
  }
  function pullPageMirrorRecords(target = state(), scope) {
    const requestedId = typeof scope === "string" ? scope : scope ? canvasId(scope) ?? "" : "";
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
  function pullPageMirrorContentSummary(id, target = state()) {
    const parsed = requestPageMirrorPayload(`${SUMMARY_REQUEST_PREFIX}${id}`);
    if (!parsed) return "";
    mergeMirrorPayloadMetadata(target, parsed);
    if (parsed.tv !== MIRROR_TOKEN_CONTRACT_VERSION) {
      summaryBridgeContractMismatch = true;
      mirrorContentSummaryCache.delete(id);
      return "";
    }
    const token = parsed.summaries?.[id] ?? "";
    const epoch = canvasMirrorTurnToken();
    if (token) mirrorContentSummaryCache.set(id, { epoch, token });
    else mirrorContentSummaryCache.delete(id);
    return token;
  }
  function requestPageMirrorPayload(request) {
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
      const text = root.querySelector("[" + DUMP_ATTR + "]")?.textContent;
      if (!text) return null;
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  function mergeMirrorPayloadMetadata(target, parsed) {
    if (typeof parsed.seq === "number") target.seq = Math.max(target.seq, parsed.seq);
    if (typeof parsed.nextId === "number") target.nextId = Math.max(target.nextId, parsed.nextId);
    if (typeof parsed.epoch === "number") target.epoch = parsed.epoch;
  }
  function canvasMirrorTurnToken() {
    try {
      return document.documentElement?.getAttribute(EPOCH_ATTR) ?? "";
    } catch {
      return "";
    }
  }
  function canvasMirrorContentToken(canvas) {
    const id = canvasId(canvas);
    if (!id) return "";
    const s = state();
    const epoch = canvasMirrorTurnToken();
    if (recorderMarkerPresent() && !summaryBridgeContractMismatch) {
      const cachedSummary = mirrorContentSummaryCache.get(id);
      if (cachedSummary && (!epoch || cachedSummary.epoch === epoch)) return cachedSummary.token;
      const summary = pullPageMirrorContentSummary(id, s);
      if (summary) return summary;
    }
    if (!s.records[id]?.ops.length || epoch && lastMirrorTargetSyncEpoch.get(id) !== epoch) {
      pullPageMirrorRecords(s, id);
    }
    return mirrorContentTokenForRecords(id, (key) => s.records[key]);
  }
  function operationContentFingerprint(id, record) {
    const ops = selectLatestReplayOps(record.ops, Number.POSITIVE_INFINITY);
    if (!ops.length) return "";
    return [
      id,
      record.w,
      record.h,
      ...ops.map((op) => [
        op.srcId ?? "",
        canonicalBookwalkerAssetUrl(op.url),
        op.sx,
        op.sy,
        op.sw,
        op.sh,
        op.dx,
        op.dy,
        op.dw,
        op.dh
      ].join(":"))
    ].join("|");
  }
  function canonicalBookwalkerAssetUrl(rawUrl) {
    if (!rawUrl) return "";
    try {
      const url = new URL(rawUrl, location.href);
      if (isBookwalkerAssetHost(url.hostname)) {
        url.hash = "";
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
  function isBookwalkerAssetHost(hostname) {
    return hostname === "bookwalker.jp" || hostname.endsWith(".bookwalker.jp");
  }
  function isVolatileSignedUrlParam(key) {
    const lower = key.toLowerCase();
    return lower === "policy" || lower === "signature" || lower === "key-pair-id" || lower === "expires" || lower.startsWith("x-amz-");
  }
  async function captureCanvasMirror(canvas, loadCleanImage) {
    installCanvasMirrorRecorder();
    const s = state();
    const id = canvasId(canvas);
    if (id && recorderMarkerPresent()) pullPageMirrorRecords(s, id);
    const records = id ? snapshotMirrorRecordGraph(id, s.records) : /* @__PURE__ */ Object.create(null);
    const lookup = (key) => records[key];
    const urls = id ? collectLeafUrls(id, Number.POSITIVE_INFINITY, lookup) : /* @__PURE__ */ new Set();
    const contentToken = id ? mirrorContentTokenForRecords(id, lookup) : "";
    const images = /* @__PURE__ */ new Map();
    if (urls.size) {
      await Promise.all([...urls].map(async (url) => {
        try {
          const image = await loadCleanImage(url);
          if (image) images.set(url, image);
        } catch {
        }
      }));
      if (images.size !== urls.size) return void 0;
    }
    const canvases = new Map(
      Array.from(document.querySelectorAll(`canvas[${ID_ATTR}]`)).map((source) => [source.getAttribute(ID_ATTR) ?? "", source]).filter(([sourceId]) => sourceId)
    );
    const rebuilt = id ? rebuildById(id, Number.POSITIVE_INFINITY, images, canvases, /* @__PURE__ */ new Set(), 0, lookup) : null;
    if (rebuilt && contentToken) rebuilt.dataset.yomuMirrorContentToken = contentToken;
    return rebuilt && isReadable(rebuilt) ? rebuilt : void 0;
  }
  function snapshotMirrorRecordGraph(rootId, source) {
    const snapshot = /* @__PURE__ */ Object.create(null);
    const visitRecord = (id, depth) => {
      if (depth > MAX_REBUILD_DEPTH || snapshot[id]) return;
      const record = source[id];
      if (!record) return;
      const ops = record.ops.map(cloneMirrorOp);
      snapshot[id] = { w: record.w, h: record.h, ops };
      visitOps(ops, depth + 1);
    };
    const visitOps = (ops, depth) => {
      if (depth > MAX_REBUILD_DEPTH) return;
      for (const op of ops) {
        if (op.srcId) visitRecord(op.srcId, depth);
        if (op.srcOps?.length) visitOps(op.srcOps, depth + 1);
      }
    };
    visitRecord(rootId, 0);
    return snapshot;
  }
  function cloneMirrorOp(op) {
    return {
      ...op,
      ...op.srcOps ? { srcOps: op.srcOps.map(cloneMirrorOp) } : {}
    };
  }
  function mirrorContentTokenForRecords(id, lookup) {
    const content = collectLeafContentFingerprints(id, Number.POSITIVE_INFINITY, lookup);
    if (content.size) return `m:${mirrorTokenHash([...content].sort().join(""))}`;
    const record = lookup(id);
    const fingerprint = record ? operationContentFingerprint(id, record) : "";
    return fingerprint ? `o:${mirrorTokenHash(fingerprint)}` : "";
  }
  function mirrorTokenHash(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }
  function recorderBootstrap(win, opts) {
    if (win.__yomuCanvasMirrorRecorder) return;
    const HC = win.HTMLCanvasElement;
    const OC = win.OffscreenCanvas;
    const w2 = win;
    if (!w2.CanvasRenderingContext2D?.prototype && !w2.OffscreenCanvasRenderingContext2D?.prototype) return;
    const ATTR = opts.a, MAX = opts.m, KEEP = opts.k;
    const S = win.__yomuCanvasMirror = win.__yomuCanvasMirror || { seq: 0, nextId: 1, installed: false, epoch: 0, records: /* @__PURE__ */ Object.create(null) };
    const doc = win.document;
    const root = doc && doc.documentElement;
    let lastDrawUrl = "";
    const bumpEpoch = (el) => {
      if (el && el.nodeType && !el.isConnected) return;
      S.epoch = (S.epoch || 0) + 1;
      if (root) {
        try {
          root.setAttribute(opts.e, String(S.epoch));
        } catch {
        }
      }
    };
    const isCanvas = (o) => Boolean(o) && (HC != null && o instanceof HC || OC != null && o instanceof OC);
    const srcUrl = (o) => {
      const m = o;
      return m ? typeof m.currentSrc === "string" && m.currentSrc || typeof m.src === "string" && m.src || "" : "";
    };
    const idOf = (c, create) => {
      const el = c;
      if (el && typeof el.getAttribute === "function" && typeof el.setAttribute === "function") {
        let i = el.getAttribute(ATTR);
        if (!i && create) {
          i = "m" + S.nextId++;
          try {
            el.setAttribute(ATTR, i);
          } catch {
            return null;
          }
        }
        return i;
      }
      if (el && el.__yomuMid) return el.__yomuMid;
      if (el && create) {
        try {
          return el.__yomuMid = "m" + S.nextId++;
        } catch {
          return null;
        }
      }
      return null;
    };
    const rec = (id, w, h) => {
      let r = S.records[id];
      if (!r) {
        r = { w, h, ops: [] };
        S.records[id] = r;
      }
      if (w) r.w = w;
      if (h) r.h = h;
      if (r.ops.length >= MAX) r.ops.splice(0, r.ops.length - KEEP);
      return r;
    };
    const dKey = (op) => op.dx + "," + op.dy + "," + op.dw + "," + op.dh;
    const latestOpsBefore = (ops, beforeSeq) => {
      const byDest = /* @__PURE__ */ new Map();
      for (const op of ops) {
        if (op.seq >= beforeSeq) continue;
        if (op.clear) {
          byDest.clear();
          continue;
        }
        byDest.set(dKey(op), op);
      }
      return Array.from(byDest.values()).sort((a, b) => a.seq - b.seq);
    };
    const latestOps = (ops, beforeSeq) => {
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
    const snapshotOps = (id, beforeSeq, depth) => {
      if (!id || depth > 4) return [];
      const sourceRecord = S.records[id];
      if (!sourceRecord) return [];
      return latestOps(sourceRecord.ops, beforeSeq).map((sourceOp) => {
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
    const addSnapshotDependencies = (ops, out, seen, depth) => {
      if (depth > 6) return;
      for (const op of ops) {
        if (op.srcOps?.length) addSnapshotDependencies(op.srcOps, out, seen, depth + 1);
        else if (op.srcId) addRecordClosure(op.srcId, out, seen, depth + 1);
      }
    };
    const addRecordClosure = (id, out, seen, depth) => {
      if (!id || seen[id] || depth > 6) return;
      const record = S.records[id];
      if (!record) return;
      seen[id] = true;
      out[id] = record;
      addSnapshotDependencies(record.ops, out, seen, depth + 1);
    };
    const requestedRecords = (id) => {
      if (!id) return S.records;
      const out = /* @__PURE__ */ Object.create(null);
      addRecordClosure(id, out, /* @__PURE__ */ Object.create(null), 0);
      return out;
    };
    const volatileSignedParam = (key) => {
      const lower = key.toLowerCase();
      return lower === "policy" || lower === "signature" || lower === "key-pair-id" || lower === "expires" || lower.startsWith("x-amz-");
    };
    const canonicalUrl = (raw) => {
      if (!raw) return "";
      try {
        const url = new URL(raw, win.location?.href || doc?.location?.href || "");
        if (url.hostname === "bookwalker.jp" || url.hostname.endsWith(".bookwalker.jp")) {
          url.hash = "";
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
    const hashText = (value) => {
      let hash = 2166136261;
      for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(36);
    };
    const leafFingerprint = (op) => [
      canonicalUrl(op.url),
      op.sx,
      op.sy,
      op.sw,
      op.sh
    ].join(":");
    const shouldUseLatestSource = (id, beforeSeq) => {
      if (!Number.isFinite(beforeSeq)) return false;
      const record = S.records[id];
      if (!record?.ops.length) return false;
      return !record.ops.some((op) => !op.clear && op.seq < beforeSeq);
    };
    const addSourceLeafFingerprints = (id, beforeSeq, out, seen, depth) => {
      const before = Object.keys(out).length;
      addLeafFingerprints(id, beforeSeq, out, seen, depth);
      if (Object.keys(out).length === before && shouldUseLatestSource(id, beforeSeq)) {
        addLeafFingerprints(id, Number.POSITIVE_INFINITY, out, seen, depth);
      }
    };
    const addLeafFingerprintsFromOps = (ops, out, seen, depth) => {
      if (depth > 6) return;
      for (const op of latestOps(ops, Number.POSITIVE_INFINITY)) {
        if (op.srcOps?.length) addLeafFingerprintsFromOps(op.srcOps, out, seen, depth + 1);
        else if (op.srcId) addSourceLeafFingerprints(op.srcId, op.seq, out, seen, depth + 1);
        else if (op.url) out[leafFingerprint(op)] = true;
      }
    };
    const addLeafFingerprints = (id, beforeSeq, out, seen, depth) => {
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
    const operationSummaryToken = (id, record) => {
      const ops = latestOps(record.ops, Number.POSITIVE_INFINITY);
      if (!ops.length) return "";
      const payload = [
        id,
        record.w,
        record.h,
        ...ops.map((op) => [
          op.srcId || "",
          canonicalUrl(op.url),
          op.sx,
          op.sy,
          op.sw,
          op.sh,
          op.dx,
          op.dy,
          op.dw,
          op.dh
        ].join(":"))
      ].join("|");
      return `o:${hashText(payload)}`;
    };
    const summaryToken = (id) => {
      const record = S.records[id];
      if (!record) return "";
      const leafs = /* @__PURE__ */ Object.create(null);
      addLeafFingerprints(id, Number.POSITIVE_INFINITY, leafs, /* @__PURE__ */ Object.create(null), 0);
      const keys = Object.keys(leafs).sort();
      if (keys.length) return `m:${hashText(keys.join(""))}`;
      return operationSummaryToken(id, record);
    };
    const requestedSummaries = (id) => {
      const out = /* @__PURE__ */ Object.create(null);
      if (!id) return out;
      const token = summaryToken(id);
      if (token) out[id] = token;
      return out;
    };
    const patch = (p) => {
      if (!p) return false;
      if (p.__yomuMirrorPatched) return true;
      p.__yomuMirrorPatched = true;
      const draw = p.drawImage;
      p.drawImage = function(src) {
        if (!this.__yomuMirrorSkip) {
          try {
            const cid = idOf(this.canvas, true);
            if (cid) {
              const r = rec(cid, this.canvas.width, this.canvas.height);
              const a = arguments;
              const sourceId = isCanvas(src) ? idOf(src, true) : null;
              const o = { seq: S.seq++, srcId: sourceId, url: sourceId ? "" : srcUrl(src), sx: 0, sy: 0, sw: -1, sh: -1, dx: 0, dy: 0, dw: -1, dh: -1, clear: false };
              if (sourceId) {
                const sourceRecord = S.records[sourceId];
                if (sourceRecord) {
                  o.srcW = sourceRecord.w;
                  o.srcH = sourceRecord.h;
                  const snapshot = snapshotOps(sourceId, o.seq, 0);
                  if (snapshot.length) o.srcOps = snapshot;
                }
              }
              if (a.length === 9) {
                o.sx = a[1];
                o.sy = a[2];
                o.sw = a[3];
                o.sh = a[4];
                o.dx = a[5];
                o.dy = a[6];
                o.dw = a[7];
                o.dh = a[8];
              } else if (a.length === 5) {
                o.dx = a[1];
                o.dy = a[2];
                o.dw = a[3];
                o.dh = a[4];
              } else if (a.length === 3) {
                o.dx = a[1];
                o.dy = a[2];
              }
              r.ops.push(o);
              if (o.srcId) bumpEpoch(this.canvas);
              else if (o.url && o.url !== lastDrawUrl) {
                lastDrawUrl = o.url;
                bumpEpoch(this.canvas);
              }
            }
          } catch {
          }
        }
        return draw.apply(this, arguments);
      };
      const clr = p.clearRect;
      p.clearRect = function(x, y, w, h) {
        if (!this.__yomuMirrorSkip) {
          try {
            if (x <= 0 && y <= 0 && w >= this.canvas.width && h >= this.canvas.height) {
              const cid = idOf(this.canvas, true);
              if (cid) {
                rec(cid, this.canvas.width, this.canvas.height).ops.push({ seq: S.seq++, srcId: null, url: "", sx: 0, sy: 0, sw: -1, sh: -1, dx: 0, dy: 0, dw: -1, dh: -1, clear: true });
                bumpEpoch(this.canvas);
              }
            }
          } catch {
          }
        }
        return clr.apply(this, arguments);
      };
      return true;
    };
    const patchedCanvas = patch(w2.CanvasRenderingContext2D?.prototype);
    const patchedOffscreen = patch(w2.OffscreenCanvasRenderingContext2D?.prototype);
    const patched = patchedCanvas || patchedOffscreen;
    if (!patched) return;
    win.__yomuCanvasMirrorRecorder = true;
    S.installed = true;
    if (doc && root) {
      try {
        root.setAttribute(opts.r, "1");
      } catch {
      }
      try {
        root.addEventListener(opts.p, () => {
          try {
            let node = root.querySelector("[" + opts.d + "]");
            if (!node) {
              const created = doc.createElement("div");
              created.setAttribute(opts.d, "1");
              created.style.display = "none";
              root.appendChild(created);
              node = created;
            }
            const requestAttr = opts.q || "data-yomu-mirror-request";
            const request = root.getAttribute(requestAttr) || "";
            if (request.indexOf("summary:") === 0) {
              node.textContent = JSON.stringify({ summaries: requestedSummaries(request.slice("summary:".length)), seq: S.seq, nextId: S.nextId, epoch: S.epoch || 0, tv: opts.v || 0 });
            } else {
              node.textContent = JSON.stringify({ records: requestedRecords(request), seq: S.seq, nextId: S.nextId, epoch: S.epoch || 0 });
            }
          } catch {
          }
        });
      } catch {
      }
    }
  }
  function recorderOpts() {
    return {
      a: ID_ATTR,
      m: MAX_OPS_PER_CANVAS,
      k: PRUNE_KEEP,
      e: EPOCH_ATTR,
      d: DUMP_ATTR,
      q: REQUEST_ATTR,
      p: PULL_EVENT,
      r: MARKER_ATTR,
      v: MIRROR_TOKEN_CONTRACT_VERSION
    };
  }
  function injectRecorderIntoPage(opts) {
    const parent = document.head || document.documentElement;
    if (!parent) return false;
    const source = `;(${recorderBootstrap.toString()})(window, ${JSON.stringify(opts)});`;
    try {
      const script = document.createElement("script");
      const nonce = [...document.querySelectorAll("script[nonce]")].map((el) => el.getAttribute("nonce")).find(Boolean);
      if (nonce) script.setAttribute("nonce", nonce);
      const trusted = createTrustedMirrorScript(source);
      if (trusted) script.textContent = trusted;
      else script.textContent = source;
      parent.append(script);
      script.remove();
    } catch {
      return false;
    }
    return recorderMarkerPresent() || Boolean(pageWindow().__yomuCanvasMirror?.installed);
  }
  function installRecorderThroughUnsafeWindow(opts) {
    const win = userscriptUnsafeWindow();
    if (!win) return false;
    try {
      recorderBootstrap(win, opts);
    } catch {
      return false;
    }
    return recorderMarkerPresent() || recorderWindowInstalled(win);
  }
  function userscriptUnsafeWindow() {
    const uw = globalThis.unsafeWindow;
    if (!uw || uw === globalThis) return null;
    return uw;
  }
  function scheduleRecorderInstallRetry(hostname) {
    if (recorderInstallRetryTimer) return;
    const delay = RECORDER_INSTALL_RETRY_DELAYS_MS[Math.min(recorderInstallRetryCount, RECORDER_INSTALL_RETRY_DELAYS_MS.length - 1)] ?? 1e3;
    recorderInstallRetryCount += 1;
    recorderInstallRetryTimer = window.setTimeout(() => {
      recorderInstallRetryTimer = 0;
      installCanvasMirrorRecorder(hostname);
    }, delay);
    if (!recorderInstallDOMContentLoadedHooked && document.readyState === "loading") {
      recorderInstallDOMContentLoadedHooked = true;
      document.addEventListener("DOMContentLoaded", () => {
        if (recorderAlreadyInstalled()) return;
        if (recorderInstallRetryTimer) window.clearTimeout(recorderInstallRetryTimer);
        recorderInstallRetryTimer = 0;
        installCanvasMirrorRecorder(hostname);
      }, { once: true });
    }
  }
  function recorderMarkerPresent() {
    try {
      return document.documentElement?.getAttribute(MARKER_ATTR) === "1";
    } catch {
      return false;
    }
  }
  function recorderAlreadyInstalled() {
    if (recorderMarkerPresent()) return true;
    const uw = userscriptUnsafeWindow();
    return (uw ? recorderWindowInstalled(uw) : false) || recorderWindowInstalled(pageWindow());
  }
  function recorderWindowInstalled(win) {
    try {
      return Boolean(win.__yomuCanvasMirror?.installed);
    } catch {
      return false;
    }
  }
  function likelyUserscriptContentSandbox() {
    const g = globalThis;
    return Boolean(g.unsafeWindow && g.unsafeWindow !== globalThis) || Boolean(g.GM_info || g.GM || g.GM_xmlhttpRequest);
  }
  function markRecorderMethod(method) {
    try {
      document.documentElement?.setAttribute(METHOD_ATTR, method);
    } catch {
    }
  }
  function createTrustedMirrorScript(code) {
    try {
      const factory = globalThis.trustedTypes;
      if (!factory?.createPolicy) return null;
      const policy = factory.createPolicy("yomu-canvas-mirror", { createScript: (s) => s });
      return policy?.createScript ? policy.createScript(code) : null;
    } catch {
      return null;
    }
  }
  function installCanvasMirrorRecorder(hostname = location.hostname) {
    if (!isBookwalkerViewerHost(hostname)) return;
    if (recorderAlreadyInstalled()) return;
    if (recorderReloadLoopDetected()) return;
    if (!document.head && !document.documentElement) {
      scheduleRecorderInstallRetry(hostname);
      return;
    }
    const opts = recorderOpts();
    if (injectRecorderIntoPage(opts)) {
      markRecorderMethod("script");
      return;
    }
    if (document.readyState === "loading") {
      scheduleRecorderInstallRetry(hostname);
      return;
    }
    if (!likelyUserscriptContentSandbox() && installRecorderThroughUnsafeWindow(opts)) {
      markRecorderMethod("unsafeWindow");
      return;
    }
    if (likelyUserscriptContentSandbox()) return;
    const s = state();
    if (s.installed) return;
    recorderBootstrap(pageWindow(), opts);
    if (recorderAlreadyInstalled()) markRecorderMethod("current");
  }
  const CARD_STATES = /* @__PURE__ */ new Set([
    "new",
    "learning",
    "young",
    "mature",
    "known",
    "mastered",
    "due",
    "failed",
    "locked",
    "never-forget",
    "blacklisted",
    "suspended",
    "in-deck",
    "not-in-deck",
    "redundant",
    "frequent",
    "unparsed"
  ]);
  const CARD_STATE_ALIASES = {
    never_forget: "never-forget",
    neverforget: "never-forget",
    "never forget": "never-forget",
    not_in_deck: "not-in-deck",
    notindeck: "not-in-deck",
    "not in deck": "not-in-deck",
    in_deck: "in-deck",
    indeck: "in-deck",
    "in deck": "in-deck",
    blacklist: "blacklisted",
    blacklisted: "blacklisted",
    ignored: "blacklisted",
    unknown: "new"
  };
  function normalizeCardState(value) {
    const keys = normalizedCardStateKeys(value);
    if (!keys) return null;
    const aliased = aliasedCardState(keys.trimmed, keys.dashed, keys.compact);
    if (aliased) return aliased;
    return knownCardState(keys.dashed);
  }
  function normalizedCardStateKeys(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return null;
    return {
      trimmed,
      dashed: trimmed.replace(/[_\s]+/g, "-"),
      compact: trimmed.replace(/[_\s-]+/g, "")
    };
  }
  function aliasedCardState(...keys) {
    return keys.map((key) => CARD_STATE_ALIASES[key]).find(Boolean);
  }
  function knownCardState(value) {
    if (CARD_STATES.has(value)) return value;
    return null;
  }
  function normalizeCardStates(value, fallback = "not-in-deck") {
    const states = uniqueNormalizedCardStates(Array.isArray(value) ? value : [value]);
    return states.length ? states : [fallback];
  }
  function uniqueNormalizedCardStates(rawStates) {
    const states = [];
    for (const rawState of rawStates) {
      appendNormalizedCardState(states, rawState);
    }
    return states;
  }
  function appendNormalizedCardState(states, rawState) {
    const state2 = normalizeCardState(rawState);
    if (!state2 || states.includes(state2)) return;
    states.push(state2);
  }
  function primaryCardState(value) {
    return normalizeCardStates(value)[0] ?? "not-in-deck";
  }
  const DECK_CLASS_NAME_LIMIT = 8;
  function cardDeckMembership(card) {
    const names = cardDeckNames(card);
    return {
      source: cardDeckMembershipSource(card),
      names,
      member: hasPrimaryDeckMembership(card) || hasAnkiDeckMembership(card)
    };
  }
  function cardDeckNames(card) {
    return uniqueDeckNames([
      ...primaryDeckNames(card),
      ...ankiDeckNames(card)
    ]);
  }
  function cardDeckMembershipClassNames(card) {
    const membership = cardDeckMembership(card);
    if (!membership.member) return [];
    const classes = /* @__PURE__ */ new Set(["yomu-deck-member"]);
    if (hasPrimaryDeckMembership(card)) addDeckSourceClasses(classes, primaryDeckMembershipSource(card), primaryDeckNames(card));
    if (hasAnkiDeckMembership(card)) addDeckSourceClasses(classes, "anki", ankiDeckNames(card));
    return [...classes];
  }
  function deckClassSlug(value) {
    const slug = value.normalize("NFKC").trim().toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 64);
    return slug || "unnamed";
  }
  function uniqueDeckNames(values) {
    const seen = /* @__PURE__ */ new Set();
    return values.map((value) => value?.trim() ?? "").filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }
  function cardDeckMembershipSource(card) {
    if (!hasPrimaryDeckMembership(card) && hasAnkiDeckMembership(card)) return "anki";
    return primaryDeckMembershipSource(card);
  }
  function primaryDeckMembershipSource(card) {
    return card.source ?? (card.reviewSource === "jiten-api" ? "jiten" : "jpdb");
  }
  function primaryDeckNames(card) {
    return uniqueDeckNames([
      ...card.deckNames ?? [],
      card.sourceDeckName ?? ""
    ]);
  }
  function ankiDeckNames(card) {
    return uniqueDeckNames(card.ankiDeckNames ?? []);
  }
  function hasPrimaryDeckMembership(card) {
    return primaryDeckNames(card).length > 0 || card.cardState.includes("in-deck") || Boolean(card.jpdbDeckMembership?.trim());
  }
  function hasAnkiDeckMembership(card) {
    return ankiDeckNames(card).length > 0;
  }
  function addDeckSourceClasses(classes, source, names) {
    classes.add(`${source}-deck-member`);
    names.slice(0, DECK_CLASS_NAME_LIMIT).forEach((name) => {
      const slug = deckClassSlug(name);
      classes.add(`yomu-deck-${slug}`);
      classes.add(`${source}-deck-${slug}`);
    });
  }
  const HAS_JAPANESE = /[\u3040-\u30ff\u3400-\u9fff々〆\uff66-\uff9f]/;
  const HAS_JAPANESE_LETTER = /[\u3041-\u3096\u309d-\u309f\u30a1-\u30fa\u30fd-\u30ff\u3400-\u9fff\uff66-\uff6f\uff71-\uff9d]/u;
  const CORE_COLOR_TOKENS = {
    white: "#ffffff"
  };
  const BRAND_COLOR_TOKENS = {
    accent: "#5ea780",
    consoleAccent: "#247a58"
  };
  const OVERLAY_COLOR_TOKENS = {
    text: CORE_COLOR_TOKENS.white
  };
  const LOGGER_COLOR_TOKENS = {
    debug: "#6b7280",
    warn: "#a15c00",
    error: "#b91c1c"
  };
  const selectorPairs = (names, attributes = ["class", "id"]) => names.split(",").flatMap((name) => attributes.map((attribute) => `[${attribute}*="${name}" i]`)).join(",");
  const roleSelectors = (names) => names.split(",").map((name) => `[role="${name}"]`).join(",");
  `a[href],button,summary,label,${roleSelectors("button,link,menuitem,option,tab,checkbox,radio,switch")},[aria-controls],[aria-expanded],[slot="more-button"],.more-button,#more,#less`;
  `[onclick],[tabindex]:not([tabindex="-1"]),${selectorPairs("audio,button,control,play,sound,speaker,toggle", ["class"])}`;
  `time,[datetime],[aria-label*="author" i],[aria-label*="username" i],${selectorPairs("author,byline,display-name,handle,header,meta,nickname,screen-name,user-name,username", ["class"])}`;
  `button,label,summary,${roleSelectors("button,tab,menuitem,option,checkbox,radio,switch")}`;
  `header,nav,footer,[role="banner"],[role="navigation"],[role="contentinfo"],[role="dialog"],[role="listbox"],[role="menu"],[role="menubar"],[role="tablist"],[role="toolbar"],[aria-modal="true"],${selectorPairs("account,chooser,dialog,dropdown,login,menu,modal,panel,picker,profile,signin,toolbar")}`;
  `[role="alert"],[role="status"],[role="region"],[aria-live],${selectorPairs("alert,banner,notice,notification,snackbar,toast", ["class"])},${selectorPairs("assistant,prompt,question", ["class", "id"])}`;
  roleSelectors("option,menuitem,menuitemcheckbox,menuitemradio");
  `button,summary,label,${roleSelectors("button,tab,menuitem,menuitemcheckbox,menuitemradio,option,switch,checkbox,radio")},[slot="more-button"],.more-button,#more,#less`;
  roleSelectors("menu,menubar,toolbar,tablist");
  let initialWindowDispatchEvent = initialWindowMethod("dispatchEvent");
  let initialWindowAddEventListener = initialWindowMethod("addEventListener");
  let initialWindowRemoveEventListener = initialWindowMethod("removeEventListener");
  function createWindowCustomEvent(type, detail, init = {}) {
    const eventInit = { ...init, detail: cloneCustomEventDetail(detail) };
    const documentEvent = createDocumentCustomEvent(type, eventInit);
    if (documentEvent) return documentEvent;
    const CustomEventConstructor = eventConstructor(window, "CustomEvent") ?? eventConstructor(globalThis, "CustomEvent");
    if (CustomEventConstructor) {
      try {
        return new CustomEventConstructor(type, eventInit);
      } catch {
      }
    }
    throw new Error(`Unable to create window custom event: ${type}`);
  }
  function cloneCustomEventDetail(detail) {
    if (detail === void 0 || typeof window === "undefined") return detail;
    const cloneInto = readMethod(globalThis, "cloneInto");
    if (!cloneInto) return detail;
    try {
      return cloneInto(detail, window, { cloneFunctions: false, wrapReflectors: true });
    } catch {
      try {
        return JSON.stringify(detail);
      } catch {
        return void 0;
      }
    }
  }
  function dispatchWindowEvent(event) {
    const target = window;
    const directDispatch = readMethod(target, "dispatchEvent");
    const directResult = callEventTargetMethod(directDispatch, target, event);
    if (directResult.called) return directResult.result;
    const initialResult = initialWindowDispatchEvent === directDispatch ? { called: false } : callEventTargetMethod(initialWindowDispatchEvent, target, event);
    if (initialResult.called) return initialResult.result;
    const prototypeResult = dispatchWithPrototypeMethod(target, directDispatch, event);
    if (prototypeResult.called) return prototypeResult.result;
    const unshadowedResult = callWithUnshadowedWindowDispatch(event);
    if (unshadowedResult.called) return unshadowedResult.result;
    return false;
  }
  function addWindowEventListener(type, listener, options) {
    const target = window;
    const directAdd = readMethod(target, "addEventListener");
    const directResult = callAddEventListener$2(directAdd, target, type, listener, options);
    if (directResult.called) return true;
    const initialResult = initialWindowAddEventListener === directAdd ? { called: false } : callAddEventListener$2(initialWindowAddEventListener, target, type, listener, options);
    if (initialResult.called) return true;
    const prototypeResult = addListenerWithPrototypeMethod(target, directAdd, type, listener, options);
    if (prototypeResult.called) return true;
    const unshadowedResult = callWithUnshadowedWindowAddEventListener(type, listener, options);
    if (unshadowedResult.called) return true;
    return false;
  }
  function removeWindowEventListener(type, listener, options) {
    const target = window;
    const directRemove = readMethod(target, "removeEventListener");
    const directResult = callRemoveEventListener$2(directRemove, target, type, listener, options);
    if (directResult.called) return true;
    const initialResult = initialWindowRemoveEventListener === directRemove ? { called: false } : callRemoveEventListener$2(initialWindowRemoveEventListener, target, type, listener, options);
    if (initialResult.called) return true;
    const prototypeResult = removeListenerWithPrototypeMethod(target, directRemove, type, listener, options);
    if (prototypeResult.called) return true;
    const unshadowedResult = callWithUnshadowedWindowRemoveEventListener(type, listener, options);
    if (unshadowedResult.called) return true;
    return false;
  }
  function initialWindowMethod(key) {
    if (typeof window === "undefined") return void 0;
    return readMethod(window, key);
  }
  function dispatchWithPrototypeMethod(target, directDispatch, event) {
    for (const prototypeDispatch of eventTargetPrototypeMethods(target, "dispatchEvent")) {
      if (prototypeDispatch === directDispatch) continue;
      const result = callEventTargetMethod(prototypeDispatch, target, event);
      if (result.called) return result;
    }
    return { called: false };
  }
  function addListenerWithPrototypeMethod(target, directAdd, type, listener, options) {
    for (const prototypeAdd of eventTargetPrototypeMethods(target, "addEventListener")) {
      if (prototypeAdd === directAdd) continue;
      const result = callAddEventListener$2(prototypeAdd, target, type, listener, options);
      if (result.called) return result;
    }
    return { called: false };
  }
  function removeListenerWithPrototypeMethod(target, directRemove, type, listener, options) {
    for (const prototypeRemove of eventTargetPrototypeMethods(target, "removeEventListener")) {
      if (prototypeRemove === directRemove) continue;
      const result = callRemoveEventListener$2(prototypeRemove, target, type, listener, options);
      if (result.called) return result;
    }
    return { called: false };
  }
  function eventConstructor(source, key) {
    const value = readProperty(source, key);
    return typeof value === "function" ? value : void 0;
  }
  function createDocumentCustomEvent(type, init) {
    if (typeof document === "undefined" || typeof document.createEvent !== "function") return void 0;
    try {
      const event = document.createEvent("CustomEvent");
      event.initCustomEvent(type, Boolean(init.bubbles), Boolean(init.cancelable), init.detail);
      return event;
    } catch {
      return void 0;
    }
  }
  function eventTargetPrototypeMethods(target, key) {
    const methods = [];
    const add = (method) => {
      if (method && !methods.includes(method)) methods.push(method);
    };
    let prototype = Object.getPrototypeOf(target);
    while (prototype) {
      add(readOwnMethod(prototype, key));
      prototype = Object.getPrototypeOf(prototype);
    }
    const WindowEventTarget = readProperty(window, "EventTarget");
    add(readMethod(WindowEventTarget?.prototype, key));
    if (typeof EventTarget !== "undefined") add(readMethod(EventTarget.prototype, key));
    return methods;
  }
  function readMethod(source, key) {
    const value = readProperty(source, key);
    return typeof value === "function" ? value : void 0;
  }
  function readOwnMethod(source, key) {
    if (!source || typeof source !== "object" && typeof source !== "function") return void 0;
    if (!Object.prototype.hasOwnProperty.call(source, key)) return void 0;
    return readMethod(source, key);
  }
  function readProperty(source, key) {
    if (!source || typeof source !== "object" && typeof source !== "function") return void 0;
    try {
      return source[key];
    } catch {
      return void 0;
    }
  }
  function callEventTargetMethod(method, target, event) {
    if (!method) return { called: false };
    try {
      return { called: true, result: method.call(target, event) };
    } catch (error) {
      return { called: false, error };
    }
  }
  function callAddEventListener$2(method, target, type, listener, options) {
    if (!method) return { called: false };
    try {
      method.call(target, type, listener, options);
      return { called: true };
    } catch (error) {
      return { called: false, error };
    }
  }
  function callRemoveEventListener$2(method, target, type, listener, options) {
    if (!method) return { called: false };
    try {
      method.call(target, type, listener, options);
      return { called: true };
    } catch (error) {
      return { called: false, error };
    }
  }
  function callWithUnshadowedWindowDispatch(event) {
    const target = window.wrappedJSObject || window;
    const descriptor = safeWindowPropertyDescriptor("dispatchEvent");
    if (!shouldTemporarilyUnshadowWindowProperty(descriptor)) return { called: false };
    try {
      if (!Reflect.deleteProperty(target, "dispatchEvent")) return { called: false };
      return callEventTargetMethod(readMethod(window, "dispatchEvent"), window, event);
    } catch (error) {
      return { called: false, error };
    } finally {
      restoreWindowProperty("dispatchEvent", descriptor);
    }
  }
  function callWithUnshadowedWindowAddEventListener(type, listener, options) {
    const target = window.wrappedJSObject || window;
    const descriptor = safeWindowPropertyDescriptor("addEventListener");
    if (!shouldTemporarilyUnshadowWindowProperty(descriptor)) return { called: false };
    try {
      if (!Reflect.deleteProperty(target, "addEventListener")) return { called: false };
      return callAddEventListener$2(readMethod(window, "addEventListener"), window, type, listener, options);
    } catch (error) {
      return { called: false, error };
    } finally {
      restoreWindowProperty("addEventListener", descriptor);
    }
  }
  function callWithUnshadowedWindowRemoveEventListener(type, listener, options) {
    const target = window.wrappedJSObject || window;
    const descriptor = safeWindowPropertyDescriptor("removeEventListener");
    if (!shouldTemporarilyUnshadowWindowProperty(descriptor)) return { called: false };
    try {
      if (!Reflect.deleteProperty(target, "removeEventListener")) return { called: false };
      return callRemoveEventListener$2(readMethod(window, "removeEventListener"), window, type, listener, options);
    } catch (error) {
      return { called: false, error };
    } finally {
      restoreWindowProperty("removeEventListener", descriptor);
    }
  }
  function restoreWindowProperty(key, descriptor) {
    try {
      const target = window.wrappedJSObject || window;
      Object.defineProperty(target, key, pageCompartmentDescriptor(normalizedPropertyDescriptor(descriptor), target));
    } catch {
    }
  }
  function pageCompartmentDescriptor(descriptor, _target) {
    return pageCompartmentValue(descriptor, { cloneFunctions: true, wrapReflectors: true });
  }
  function pageCompartmentValue(value, options = {}) {
    const cloneInto = readMethod(globalThis, "cloneInto");
    if (!cloneInto || typeof window === "undefined") return value;
    try {
      return cloneInto(value, window, options);
    } catch {
      return value;
    }
  }
  function safeWindowPropertyDescriptor(key) {
    try {
      const target = window.wrappedJSObject || window;
      return Object.getOwnPropertyDescriptor(target, key);
    } catch {
      return void 0;
    }
  }
  function shouldTemporarilyUnshadowWindowProperty(descriptor) {
    if (!descriptor) return false;
    try {
      return typeof descriptor.value !== "function";
    } catch {
      return false;
    }
  }
  function normalizedPropertyDescriptor(descriptor) {
    const hasDataShape = Object.prototype.hasOwnProperty.call(descriptor, "value") || Object.prototype.hasOwnProperty.call(descriptor, "writable");
    const hasAccessorShape = Object.prototype.hasOwnProperty.call(descriptor, "get") || Object.prototype.hasOwnProperty.call(descriptor, "set");
    if (!hasDataShape || !hasAccessorShape) return descriptor;
    try {
      return {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        value: descriptor.value,
        writable: descriptor.writable
      };
    } catch {
      return {
        configurable: true,
        value: void 0,
        writable: true
      };
    }
  }
  let trustedHtmlPolicy;
  function setInnerHtml(element, html) {
    if (!assignInnerHtml(element, html)) element.textContent = html;
  }
  function assignInnerHtml(element, html) {
    try {
      element.innerHTML = trustedHtml(html);
      return true;
    } catch {
      return false;
    }
  }
  function escapeHtml(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function trustedHtml(value) {
    try {
      const factory = trustedTypesFactory();
      if (!factory) return value;
      if (trustedHtmlPolicy === void 0) trustedHtmlPolicy = createTrustedHtmlPolicy(factory);
      return trustedHtmlPolicy && typeof trustedHtmlPolicy.createHTML === "function" ? trustedHtmlPolicy.createHTML(value) : value;
    } catch {
      trustedHtmlPolicy = null;
      return value;
    }
  }
  function trustedTypesFactory() {
    const root = globalThis;
    return [
      root.trustedTypes,
      typeof window === "undefined" ? void 0 : window.trustedTypes,
      root.unsafeWindow?.trustedTypes
    ].find((factory) => Boolean(factory));
  }
  function createTrustedHtmlPolicy(factory) {
    try {
      const existing = factory.getPolicy?.("yomu-reader");
      if (existing && typeof existing.createHTML === "function") return existing;
      const options = { createHTML: (html) => html };
      return createTrustedHtmlPolicyWithOptions(factory, pageCompartmentValue(options, { cloneFunctions: true, wrapReflectors: true })) ?? createTrustedHtmlPolicyWithOptions(factory, options);
    } catch {
      return null;
    }
  }
  function createTrustedHtmlPolicyWithOptions(factory, options) {
    try {
      return factory.createPolicy?.("yomu-reader", options) ?? null;
    } catch {
      return null;
    }
  }
  const MANAGED_STORAGE_KEY_PREFIXES = [
    "yomu-",
    "yomu:",
    "yomu.",
    // Yomu-internal redirect handoff keys use a leading double underscore.
    // Factory reset clears hosted web storage by managed prefix, so include it.
    "__yomu",
    "jpdb-reader-",
    "jpdb-popup-reader-"
  ];
  function isManagedStorageKey(key) {
    return MANAGED_STORAGE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
  }
  function isPromiseLike(value) {
    return Boolean(value && typeof value.then === "function");
  }
  function promiseWithTimeout(promise, timeoutMs, message) {
    let timeoutId = 0;
    const timeout = new Promise((_resolve, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([
      promise,
      timeout
    ]).finally(() => window.clearTimeout(timeoutId));
  }
  const APP_NAME = "よむ";
  const ACADEMY_SRS_LABEL = "Academy";
  const DOCS_ORIGIN = "https://yomureader.com";
  const DOCS_BASE_URL = `${DOCS_ORIGIN}/`;
  const YOMU_HOSTED_AUDIO_URL = "https://audio.yomureader.com/?term={term}&reading={reading}";
  const NEW_TAB_PAGE_URL = `${DOCS_BASE_URL}study/`;
  const SUPPORT_COPY = "よむ is a free userscript for popup lookup, dictionaries, OCR, subtitles, study, and Anki.";
  const SUPPORT_COPY_EXTRA = "Donations are optional and help cover development, devices, services, maintenance, and API costs.";
  function bridgeResponseEventDetail(event) {
    const detail = normalizedBridgeEventDetail$1(event);
    const id = safeReadString(detail, "id");
    const kind = safeReadString(detail, "kind");
    if (!id || kind !== "load" && kind !== "error" && kind !== "timeout") return void 0;
    return {
      id,
      kind,
      response: safeReadProperty(detail, "response"),
      message: safeReadString(detail, "message")
    };
  }
  function bridgeEventDetail(detail) {
    if (detail === void 0) return void 0;
    const json = bridgeEventJsonDetail(detail);
    return json ?? detail;
  }
  function bridgeEventJsonDetail(detail) {
    let unsupported = false;
    try {
      const json = JSON.stringify(detail, (_key, value) => {
        if (isUnsupportedBridgeJsonValue(value)) {
          unsupported = true;
          return void 0;
        }
        return value;
      });
      return unsupported || typeof json !== "string" ? void 0 : json;
    } catch {
      return void 0;
    }
  }
  function normalizedBridgeEventDetail$1(event) {
    const detail = safeEventDetail(event);
    if (typeof detail !== "string") return detail;
    try {
      return JSON.parse(detail);
    } catch {
      return detail;
    }
  }
  function isUnsupportedBridgeJsonValue(value) {
    return isUnsupportedPrimitiveBridgeJsonValue(value) || isArrayBufferBridgeJsonValue(value) || isBlobBridgeJsonValue(value) || isFormDataBridgeJsonValue(value);
  }
  function isUnsupportedPrimitiveBridgeJsonValue(value) {
    return typeof value === "function" || typeof value === "symbol";
  }
  function isArrayBufferBridgeJsonValue(value) {
    if (typeof ArrayBuffer === "undefined") return false;
    return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
  }
  function isBlobBridgeJsonValue(value) {
    return typeof Blob !== "undefined" && value instanceof Blob;
  }
  function isFormDataBridgeJsonValue(value) {
    return typeof FormData !== "undefined" && value instanceof FormData;
  }
  function safeEventDetail(event) {
    try {
      return event.detail;
    } catch {
      return void 0;
    }
  }
  function safeReadProperty(source, key) {
    if (!source || typeof source !== "object" && typeof source !== "function") return void 0;
    try {
      return source[key];
    } catch {
      return void 0;
    }
  }
  function safeReadString(source, key) {
    const value = safeReadProperty(source, key);
    return typeof value === "string" ? value : void 0;
  }
  const BRIDGE_REQUEST_EVENT$1 = "yomu-userscript-storage-request";
  const BRIDGE_RESPONSE_EVENT$1 = "yomu-userscript-storage-response";
  const BRIDGE_MARKER$1 = "yomuUserscriptStorageBridge";
  const BRIDGE_TIMEOUT_MS$1 = 1e4;
  function getUserscriptGmStorage() {
    if (typeof window === "undefined" || typeof document === "undefined") return void 0;
    if (bridgeMarkerDataset$1()?.[BRIDGE_MARKER$1] !== "true") return void 0;
    return {
      getValue: (key, fallback) => storageBridgeRequest({ op: "get", key }).then((detail) => detail.found ? detail.value : fallback),
      setValue: (key, value) => storageBridgeRequest({ op: "set", key, value }).then(() => void 0),
      deleteValue: (key) => storageBridgeRequest({ op: "delete", key }).then(() => void 0),
      listValues: () => storageBridgeRequest({ op: "list" }).then((detail) => detail.keys ?? [])
    };
  }
  function storageBridgeRequest(request) {
    return new Promise((resolve, reject) => {
      const id = `yomu-store-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Storage bridge request timed out."));
      }, BRIDGE_TIMEOUT_MS$1);
      let cleanupResponseListener = noop$1;
      const cleanup = () => {
        window.clearTimeout(timeout);
        cleanupResponseListener();
      };
      const onResponse = (event) => {
        const detail = storageBridgeResponseDetail(event);
        if (!detail || detail.id !== id) return;
        cleanup();
        if (detail.ok) resolve(detail);
        else reject(new Error(detail.message || "Storage bridge request failed."));
      };
      cleanupResponseListener = addBridgeEventListener$1(BRIDGE_RESPONSE_EVENT$1, onResponse);
      dispatchBridgeEvent$1(BRIDGE_REQUEST_EVENT$1, { id, ...request });
    });
  }
  function storageBridgeResponseDetail(event) {
    const detail = normalizedBridgeEventDetail(event);
    if (!detail || typeof detail !== "object") return void 0;
    const record = detail;
    if (typeof record.id !== "string" || typeof record.ok !== "boolean") return void 0;
    return {
      id: record.id,
      ok: record.ok,
      found: typeof record.found === "boolean" ? record.found : void 0,
      value: record.value,
      keys: Array.isArray(record.keys) ? record.keys.filter((key) => typeof key === "string") : void 0,
      message: typeof record.message === "string" ? record.message : void 0
    };
  }
  function normalizedBridgeEventDetail(event) {
    let detail;
    try {
      detail = event.detail;
    } catch {
      return void 0;
    }
    if (typeof detail !== "string") return detail;
    try {
      return JSON.parse(detail);
    } catch {
      return detail;
    }
  }
  function addBridgeEventListener$1(type, listener) {
    const cleanups = [];
    if (addWindowEventListener(type, listener)) {
      cleanups.push(() => removeWindowEventListener(type, listener));
    }
    const documentTarget = bridgeDocumentTarget$1();
    if (documentTarget && callAddEventListener$1(documentTarget, type, listener)) {
      cleanups.push(() => callRemoveEventListener$1(documentTarget, type, listener));
    }
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }
  function dispatchBridgeEvent$1(type, detail) {
    const eventDetail = bridgeEventDetail(detail);
    let dispatched = dispatchWindowEvent(createWindowCustomEvent(type, eventDetail));
    const documentTarget = bridgeDocumentTarget$1();
    if (documentTarget) {
      dispatched = callDispatchEvent$1(documentTarget, createWindowCustomEvent(type, eventDetail)) || dispatched;
    }
    return dispatched;
  }
  function bridgeDocumentTarget$1() {
    if (typeof document === "undefined") return void 0;
    return document.documentElement instanceof HTMLElement ? document.documentElement : void 0;
  }
  function bridgeMarkerDataset$1() {
    if (typeof document === "undefined") return void 0;
    const root = document.documentElement;
    return root?.dataset;
  }
  function callAddEventListener$1(target, type, listener) {
    try {
      target.addEventListener(type, listener);
      return true;
    } catch {
      return false;
    }
  }
  function callRemoveEventListener$1(target, type, listener) {
    try {
      target.removeEventListener(type, listener);
    } catch {
    }
  }
  function callDispatchEvent$1(target, event) {
    try {
      return target.dispatchEvent(event);
    } catch {
      return false;
    }
  }
  function noop$1() {
  }
  const registeredKeys = /* @__PURE__ */ new Set();
  function registerManagedState(entry) {
    const identity = managedStateIdentity(entry);
    if (registeredKeys.has(identity)) return;
    registeredKeys.add(identity);
  }
  function registerManagedStates(list) {
    for (const entry of list) registerManagedState(entry);
  }
  function managedStateIdentity(entry) {
    return `${entry.kind}:${entry.key ?? ""}:${entry.prefix ?? ""}`;
  }
  const MANAGED_STATE_MANIFEST = [
    // Settings (also legacy migration keys). The bunpro token / pill selections /
    // colours all live inside these settings objects.
    { owner: "settings", kind: "gm", key: "jpdb-popup-reader-settings" },
    { owner: "settings (legacy)", kind: "gm", key: "jpdb-reader-settings" },
    { owner: "settings (legacy)", kind: "gm", key: "yomu-reader-settings" },
    { owner: "settings (legacy)", kind: "gm", key: "yomu-settings" },
    // Cloud settings sync handoff written before an OAuth redirect.
    { owner: "settings/dialog-controller", kind: "gm", key: "__yomu_cloud_settings_sync_pending_action" },
    // App-level signals / flags / caches.
    { owner: "app/storage", kind: "gm", key: "yomu:factory-reset-signal" },
    { owner: "app/card-state-signal", kind: "gm", key: "yomu:card-state-signal" },
    { owner: "app/logger", kind: "gm", key: "yomu:enable-logs" },
    { owner: "app/main", kind: "gm", key: "yomu:jpdb-review-examples-visible:v1" },
    { owner: "app/preferred-site-language", kind: "gm", key: "yomu:prefer-japanese-site-language" },
    { owner: "app/preferred-site-language", kind: "session", key: "yomu:jps" },
    { owner: "app/preferred-site-language", kind: "session", key: "yomu:jps:hosts" },
    // Local no-account SRS deck.
    { owner: "app/storage", kind: "gm", key: "yomu:srs-local:v1" },
    // Anki status index (GM leases + IndexedDB store).
    { owner: "anki/status-index", kind: "gm", key: "yomu:anki-status-index:v1" },
    { owner: "anki/status-index", kind: "gm", key: "yomu:anki-status-index-rebuild:v1" },
    { owner: "anki/status-index", kind: "idb", key: "yomu-anki-status-index" },
    // Bunpro vocab SRS-state index for page word colouring.
    { owner: "bunpro/word-states", kind: "gm", key: "yomu:bunpro-word-states:v1" },
    // Public lookup caches.
    { owner: "jpdb/jpdb-public-cache", kind: "gm", key: "yomu:jpdb-cache:v1" },
    { owner: "dictionaries/jiten-public-cache (legacy)", kind: "gm", key: "yomu:jiten-public-cache:v1" },
    { owner: "dictionaries/jiten-public-cache", kind: "gm", key: "yomu:jiten-public-cache:v2" },
    { owner: "dictionaries/jiten-stats-cache", kind: "gm", key: "jpdb-reader-jiten-daily-stats" },
    // Dictionary database (Yomitan/Jitendex terms). Cleared by the dictionary
    // store's own deleteDatabase during reset; registered so the invariant test
    // asserts it and the reset sweep nets it as a fallback.
    { owner: "dictionaries/yomitan", kind: "idb", key: "jpdb-popup-reader-yomitan" },
    // OCR result cache.
    { owner: "ocr/ocr-cache-store", kind: "local", key: "yomu-ocr-cache-v1" },
    { owner: "ocr/ocr-cache-store", kind: "local", key: "yomu-ocr-cache-v2" },
    { owner: "ocr/canvas-mirror", kind: "session", key: "yomu:bw:mirror-loadguard" },
    // Reader CSS cache (version-suffixed → prefix family).
    { owner: "styles/index", kind: "gm", prefix: "yomu:reader-css-cache:v2:" },
    // Study / grammar / mining stores.
    { owner: "study/grammar-knowledge", kind: "gm", key: "yomu.grammarPreferences.v1" },
    { owner: "study/mining-context", kind: "gm", prefix: "yomu-mining-context:" },
    { owner: "dictionaries/uchisen-carousel", kind: "gm", prefix: "yomu-jpdb-uchisen-index:" },
    // Popup / drawer geometry.
    { owner: "popup/shell", kind: "gm", key: "jpdb-reader-sheet-height-ratio" },
    { owner: "popup/shell", kind: "gm", key: "jpdb-reader-settings-drawer-height-ratio" },
    // Sources open/closed state.
    { owner: "sources/state", kind: "gm", key: "jpdb-reader-source-open-state" },
    // Subtitle layout geometry.
    { owner: "subtitles/subtitle-layout", kind: "gm", key: "jpdb-reader-transcript-panel-size" },
    { owner: "subtitles/subtitle-layout", kind: "gm", key: "jpdb-reader-subtitle-drag-offset" },
    { owner: "subtitles/subtitle-layout", kind: "gm", key: "jpdb-reader-subtitle-control-rail-position" },
    // YouTube subscription snapshot + oembed title cache.
    { owner: "subtitles/youtube", kind: "gm", key: "yomu:youtube-all-subscribed:v1" },
    { owner: "subtitles/youtube", kind: "session", prefix: "yomu:youtube-oembed-title:v1:" },
    { owner: "subtitles/controller", kind: "session", prefix: "yomu:subtitle-parse:v3:" },
    // New Tab study surface stores.
    { owner: "newtab/state", kind: "gm", key: "jpdb-reader-newtab-ui" },
    { owner: "newtab/cache", kind: "gm", key: "jpdb-reader-newtab-card-cache" },
    { owner: "newtab/controller-config", kind: "gm", key: "jpdb-reader-newtab-grade-queue" },
    { owner: "newtab/controller-config", kind: "gm", key: "jpdb-reader-newtab-current-word" },
    { owner: "newtab/controller-config", kind: "session", key: "jpdb-reader-newtab-current-word" },
    { owner: "newtab/controller-config", kind: "gm", key: "jpdb-reader-newtab-jpdb-stats-history" },
    { owner: "newtab/controller-config", kind: "gm", key: "jpdb-reader-newtab-disabled-anki-decks" },
    { owner: "newtab/session-progress", kind: "local", key: "jpdb-reader-newtab-daily-study-time" },
    { owner: "newtab/controller", kind: "gm", key: "yomu-newtab-support-banner-dismissed" },
    // Local pitch-accent SRS (debounced writer — the canonical reset escapee).
    { owner: "newtab/pitch-srs", kind: "gm", key: "yomu-pitch-items:v1" },
    { owner: "newtab/pitch-srs", kind: "gm", key: "yomu-pitch-history:v1" }
  ];
  let manifestRegistered = false;
  function registerManagedStateManifest() {
    if (manifestRegistered) return;
    manifestRegistered = true;
    registerManagedStates(MANAGED_STATE_MANIFEST);
  }
  registerManagedStateManifest();
  const MISSING = { __yomuStorageValueMissing: true };
  function isMissingSentinel(value) {
    if (value === MISSING) return true;
    return Boolean(value && typeof value === "object" && !Array.isArray(value) && value.__yomuStorageValueMissing === true);
  }
  function gmStorageGetSync(key, fallback) {
    const getValue = typeof GM_getValue === "function" ? GM_getValue : null;
    if (getValue) {
      const read = gmStorageSyncRead(key, getValue);
      if (read.kind === "found") return read.value;
    }
    return localStorageGet(key, fallback);
  }
  function gmStorageSyncRead(key, getValue) {
    try {
      const value = getValue(key, MISSING);
      if (isPromiseLike(value)) return { kind: "fallback" };
      if (!isMissingSentinel(value)) return { kind: "found", value };
      return migratedLocalStorageSyncValue(key);
    } catch (error) {
      debugStorageError("GM storage sync read failed", key, error);
      return { kind: "fallback" };
    }
  }
  function migratedLocalStorageSyncValue(key) {
    const migrated = localStorageGet(key, MISSING);
    if (isMissingSentinel(migrated)) return { kind: "fallback" };
    void gmStorageSet(key, migrated);
    return { kind: "found", value: migrated };
  }
  async function gmStorageSet(key, value) {
    const setValue = asyncGmSetValue();
    if (setValue) {
      try {
        await setValue(key, value);
        mirrorManagedValueToHostedStorage(key, value);
        return;
      } catch (error) {
        debugStorageError("GM storage write failed", key, error);
      }
    }
    localStorageSet(key, value);
  }
  function gmStorageSetSync(key, value) {
    if (typeof GM_setValue === "function") {
      try {
        const result = GM_setValue(key, value);
        if (!isPromiseLike(result)) {
          mirrorManagedValueToHostedStorage(key, value);
          return;
        }
        result.catch((error) => debugStorageError("GM storage async write failed", key, error));
      } catch (error) {
        debugStorageError("GM storage sync write failed", key, error);
      }
    }
    localStorageSet(key, value);
  }
  function gmStorageDeleteSync(key) {
    if (typeof GM_deleteValue === "function") {
      try {
        const result = GM_deleteValue(key);
        if (isPromiseLike(result)) result.catch((error) => debugStorageError("GM storage async delete failed", key, error));
      } catch (error) {
        debugStorageError("GM storage sync delete failed", key, error);
      }
    }
    removeLocalStorageKey(key);
    removeSessionStorageKey(key);
  }
  function localStorageGet(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value == null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  function localStorageSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
    }
  }
  function removeLocalStorageKey(key) {
    try {
      localStorage.removeItem(key);
    } catch {
    }
  }
  function removeSessionStorageKey(key) {
    try {
      sessionStorage.removeItem(key);
    } catch {
    }
  }
  function mirrorManagedValueToHostedStorage(key, value) {
    if (!shouldMirrorManagedValueToHostedStorage(key)) return;
    localStorageSet(key, value);
  }
  function shouldMirrorManagedValueToHostedStorage(key) {
    return isManagedStorageKey(key) && isHostedYomuOrigin();
  }
  function isHostedYomuOrigin() {
    try {
      const host = location.hostname;
      const path = location.pathname;
      if (location.origin === DOCS_ORIGIN) return true;
      if (host === "hrussellzfac023.github.io") return path.startsWith("/yomu-reader/");
      return /^(127\.0\.0\.1|localhost|\[::1\])$/.test(host) && (path.includes("/study/") || path.includes("/newtab/"));
    } catch {
      return false;
    }
  }
  function asyncGmSetValue() {
    if (typeof GM_setValue === "function") return GM_setValue;
    const modern = globalThis.GM?.setValue;
    if (typeof modern === "function") return modern.bind(globalThis.GM);
    const bridge = getUserscriptGmStorage();
    return bridge ? (key, value) => bridge.setValue(key, value) : null;
  }
  function debugStorageError(message, key, error) {
    if (typeof console !== "undefined") console.debug("[Yomu] Storage", message, { key, error });
  }
  const JITEN_API_KEY_PREFIX = "ak_";
  function effectiveJpdbApiKey(settings) {
    const apiKey = settings.apiKey.trim();
    return isJitenApiCredential(apiKey) ? "" : apiKey;
  }
  function effectiveJitenApiKey(settings) {
    const explicit = settings.jitenApiKey.trim();
    if (explicit) return explicit;
    const apiKey = settings.apiKey.trim();
    return isJitenApiCredential(apiKey) ? apiKey : "";
  }
  function hasJpdbApiCredential(settings) {
    return Boolean(effectiveJpdbApiKey(settings));
  }
  function hasJitenApiCredential(settings) {
    return Boolean(effectiveJitenApiKey(settings));
  }
  function isJitenApiCredential(value) {
    return value.trim().startsWith(JITEN_API_KEY_PREFIX);
  }
  const __vite_import_meta_env__ = { "DEV": false };
  const LOG_PREFIX = "[Yomu]";
  const LOG_STYLE = `background: ${BRAND_COLOR_TOKENS.consoleAccent}; color: ${CORE_COLOR_TOKENS.white}; border-radius: 3px; padding: 2px 5px; font-weight: 700;`;
  const SCOPE_STYLE = `color: ${BRAND_COLOR_TOKENS.consoleAccent}; font-weight: 700;`;
  const DEBUG_STYLE = `color: ${LOGGER_COLOR_TOKENS.debug};`;
  const WARN_STYLE = `color: ${LOGGER_COLOR_TOKENS.warn}; font-weight: 700;`;
  const ERROR_STYLE = `color: ${LOGGER_COLOR_TOKENS.error}; font-weight: 700;`;
  const RUNTIME_LOG_KEY = "yomu:enable-logs";
  const REDACTED = "[redacted]";
  const OPTIONAL_CORS_BRIDGE_MESSAGE = "No configured proxy.";
  const SECRET_KEY_PATTERN = /(api[-_]?key|authorization|bearer|token|password|secret|credential|oauth|cookie)/i;
  const env = __vite_import_meta_env__;
  const BUILD_IS_DEV_MODE = Boolean(env?.DEV);
  const BUILD_LOGGING_ENABLED = BUILD_IS_DEV_MODE;
  class ScopedLogger {
    constructor(parent, scopeName) {
      this.parent = parent;
      this.scopeName = scopeName;
    }
    debug(message, ...args) {
      this.parent.write(this.scopeName, message, args, writeDebugToConsole, DEBUG_STYLE);
    }
    info(message, ...args) {
      this.parent.write(this.scopeName, message, args, console.info, "");
    }
    warn(message, ...args) {
      const optional = args.some(isOptionalCorsBridgeError);
      this.parent.write(this.scopeName, message, args, optional ? writeDebugToConsole : console.warn, optional ? DEBUG_STYLE : WARN_STYLE);
    }
    error(message, ...args) {
      this.parent.write(this.scopeName, message, args, console.error, ERROR_STYLE);
    }
    warnOnce(key, message, ...args) {
      this.parent.warnOnce(`${this.scopeName}:${key}`, this.scopeName, message, args);
    }
    time(label, ...args) {
      if (!this.parent.isEnabled()) return () => void 0;
      const start = nowMs();
      this.debug(`${label} started`, ...args);
      return () => this.debug(`${label} finished`, { durationMs: Math.round((nowMs() - start) * 10) / 10 });
    }
  }
  class LoggerImpl {
    settingsProvider;
    forceEnabled = false;
    onceKeys = /* @__PURE__ */ new Set();
    configure(options) {
      this.settingsProvider = options.settingsProvider ?? this.settingsProvider;
      this.forceEnabled = options.forceEnabled ?? this.forceEnabled;
    }
    scope(scopeName) {
      return new ScopedLogger(this, scopeName);
    }
    isEnabled() {
      if (BUILD_LOGGING_ENABLED) return true;
      if (this.forceEnabled || getRuntimeLoggingOverride()) return true;
      try {
        return this.settingsProvider?.().enableLogging === true;
      } catch {
        return false;
      }
    }
    isDevMode() {
      return isDevMode();
    }
    enable(persist = false) {
      this.forceEnabled = true;
      if (persist) setRuntimeLoggingOverride(true);
      this.scope("Logger").info("Runtime logging enabled.", { persisted: persist });
    }
    disable(persist = false) {
      this.scope("Logger").info("Runtime logging disabled.", { persisted: persist });
      this.forceEnabled = false;
      if (persist) setRuntimeLoggingOverride(false);
    }
    reset() {
      this.onceKeys.clear();
    }
    warnOnce(key, scope, message, args) {
      if (this.onceKeys.has(key)) return;
      this.onceKeys.add(key);
      this.write(scope, message, args, console.warn, WARN_STYLE);
    }
    write(scope, message, args, writer, levelStyle) {
      if (!this.isEnabled()) return;
      writer(`%c${LOG_PREFIX}%c [${scope}]%c ${message}`, LOG_STYLE, SCOPE_STYLE, levelStyle, ...args.map(sanitizeForConsole));
    }
  }
  const Logger = new LoggerImpl();
  function isDevMode() {
    return BUILD_IS_DEV_MODE;
  }
  function writeDebugToConsole(...args) {
    if (isDevMode()) console.log(...args);
    else console.debug(...args);
  }
  function isOptionalCorsBridgeError(value) {
    return value instanceof Error && value.message === OPTIONAL_CORS_BRIDGE_MESSAGE;
  }
  function getRuntimeLoggingOverride() {
    try {
      return gmStorageGetSync(RUNTIME_LOG_KEY, false) === true;
    } catch {
      return false;
    }
  }
  function setRuntimeLoggingOverride(enabled) {
    try {
      if (enabled) gmStorageSetSync(RUNTIME_LOG_KEY, true);
      else gmStorageDeleteSync(RUNTIME_LOG_KEY);
    } catch {
    }
  }
  function nowMs() {
    return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  }
  function sanitizeForConsole(value) {
    if (typeof value === "string") return redactString(value);
    if (value === null || value === void 0 || typeof value !== "object") return value;
    const sanitized = sanitizeSpecialConsoleValue(value);
    if (sanitized.handled) return sanitized.value;
    if (Array.isArray(value)) return value.map(sanitizeForConsole);
    return sanitizeRecordForConsole(value);
  }
  function sanitizeSpecialConsoleValue(value) {
    for (const sanitizer of CONSOLE_VALUE_SANITIZERS) {
      const sanitized = sanitizer(value);
      if (sanitized.handled) return sanitized;
    }
    return { handled: false };
  }
  const CONSOLE_VALUE_SANITIZERS = [
    (value) => value instanceof Error ? { handled: true, value: { name: value.name, message: value.message, stack: value.stack } } : { handled: false },
    (value) => typeof URL !== "undefined" && value instanceof URL ? { handled: true, value: value.href } : { handled: false },
    (value) => typeof Blob !== "undefined" && value instanceof Blob ? { handled: true, value: { type: value.type, size: value.size } } : { handled: false },
    (value) => typeof Event !== "undefined" && value instanceof Event ? { handled: true, value: { type: value.type } } : { handled: false }
  ];
  function sanitizeRecordForConsole(record) {
    return Object.fromEntries(Object.entries(record).map(([key, value]) => [
      key,
      shouldRedactEntry(key, value) ? REDACTED : sanitizeFlatValue(value)
    ]));
  }
  function sanitizeFlatValue(value) {
    if (typeof value === "string") return redactString(value);
    if (value instanceof Error) return { name: value.name, message: value.message };
    return value;
  }
  function shouldRedactEntry(key, value) {
    if (!SECRET_KEY_PATTERN.test(key)) return false;
    if (typeof value === "number" && /tokens?/i.test(key)) return false;
    return true;
  }
  function redactString(value) {
    return value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`).replace(/(["']?(?:api[-_]?key|token|password|secret|authorization)["']?\s*[:=]\s*["'])[^"']+(["'])/gi, `$1${REDACTED}$2`);
  }
  if (typeof window !== "undefined") {
    window.__YOMU_LOGGER__ = Logger;
    window.YomuLogger = Logger;
  }
  const JPDB_LOOKUP_LINK = {
    id: "jpdb",
    label: "JPDB",
    urlTemplate: "https://jpdb.io/search?q={query}",
    enabled: true
  };
  const JITEN_LIVE_FREQUENCY_PILL = {
    id: "jiten-frequency",
    label: "Jiten",
    urlTemplate: "",
    enabled: true,
    action: "frequency-live"
  };
  const JPDB_LIVE_FREQUENCY_PILL = {
    id: "jpdb-frequency",
    label: "JPDB",
    urlTemplate: "",
    enabled: true,
    action: "frequency-live"
  };
  const JISHO_LOOKUP_LINK = {
    id: "jisho",
    label: "Jisho",
    urlTemplate: "https://jisho.org/search/{query}",
    enabled: false
  };
  const YOMU_LOOKUP_LINK = {
    id: "yomu-search",
    label: "Yomu",
    urlTemplate: `${NEW_TAB_PAGE_URL}index.html?q={query}`,
    enabled: true
  };
  const JITEN_LOOKUP_LINK = {
    id: "jiten",
    label: "Jiten",
    urlTemplate: "https://jiten.moe/parse?text={query}",
    enabled: true
  };
  const BUNPRO_LOOKUP_LINK = {
    id: "bunpro",
    label: "Bunpro",
    urlTemplate: "https://bunpro.jp/search?query={query}",
    enabled: true
  };
  const BUNPRO_LIVE_FREQUENCY_PILL = {
    id: "bunpro-frequency",
    label: "Bunpro",
    urlTemplate: "",
    enabled: true,
    action: "frequency-live"
  };
  const WEBLIO_LOOKUP_LINK = {
    id: "weblio",
    label: "Weblio",
    urlTemplate: "https://www.weblio.jp/content/{query}",
    enabled: false
  };
  const REMOVED_GOO_LOOKUP_LINK_ID = "goo";
  const KOTOBANK_LOOKUP_LINK = {
    id: "kotobank",
    label: "Kotobank",
    urlTemplate: "https://kotobank.jp/search?q={query}",
    enabled: false
  };
  const TAKOBOTO_LOOKUP_LINK = {
    id: "takoboto",
    label: "Takoboto",
    urlTemplate: "https://takoboto.jp/?q={query}",
    enabled: false
  };
  const WIKTIONARY_LOOKUP_LINK = {
    id: "wiktionary-ja",
    label: "Wiktionary",
    urlTemplate: "https://ja.wiktionary.org/wiki/{query}",
    enabled: false
  };
  const IMMERSION_KIT_LOOKUP_LINK = {
    id: "immersion-kit",
    label: "Immersion Kit",
    urlTemplate: "https://www.immersionkit.com/dictionary?keyword={query}&sort=sentence_length:asc&page=1",
    enabled: false
  };
  const UCHISEN_LOOKUP_LINK = {
    id: "uchisen",
    label: "Uchisen",
    urlTemplate: "https://uchisen.com/kanji/{query}",
    enabled: false
  };
  const COPY_LOOKUP_LINK = {
    id: "copy",
    label: "Copy",
    urlTemplate: "",
    enabled: true,
    action: "copy"
  };
  const DEFAULT_DICTIONARY_LOOKUP_LINKS = [
    YOMU_LOOKUP_LINK,
    JITEN_LOOKUP_LINK,
    JITEN_LIVE_FREQUENCY_PILL,
    JPDB_LOOKUP_LINK,
    JPDB_LIVE_FREQUENCY_PILL,
    BUNPRO_LOOKUP_LINK,
    BUNPRO_LIVE_FREQUENCY_PILL,
    JISHO_LOOKUP_LINK,
    WEBLIO_LOOKUP_LINK,
    KOTOBANK_LOOKUP_LINK,
    TAKOBOTO_LOOKUP_LINK,
    WIKTIONARY_LOOKUP_LINK,
    IMMERSION_KIT_LOOKUP_LINK,
    UCHISEN_LOOKUP_LINK,
    COPY_LOOKUP_LINK
  ];
  [
    { ...JPDB_LOOKUP_LINK, enabled: false },
    { ...JISHO_LOOKUP_LINK, enabled: true },
    COPY_LOOKUP_LINK
  ];
  [[
    // The jiten-first default that shipped before Yomu was promoted to the front
    // of the pill row. Users who never re-ordered their pills are migrated to the
    // current Yomu-first default order instead of being pinned to the old layout.
    JITEN_LOOKUP_LINK.id,
    JITEN_LIVE_FREQUENCY_PILL.id,
    JPDB_LOOKUP_LINK.id,
    JPDB_LIVE_FREQUENCY_PILL.id,
    YOMU_LOOKUP_LINK.id,
    BUNPRO_LOOKUP_LINK.id,
    JISHO_LOOKUP_LINK.id,
    WEBLIO_LOOKUP_LINK.id,
    KOTOBANK_LOOKUP_LINK.id,
    TAKOBOTO_LOOKUP_LINK.id,
    WIKTIONARY_LOOKUP_LINK.id,
    IMMERSION_KIT_LOOKUP_LINK.id,
    UCHISEN_LOOKUP_LINK.id,
    COPY_LOOKUP_LINK.id
  ], [
    YOMU_LOOKUP_LINK.id,
    JITEN_LOOKUP_LINK.id,
    JPDB_LOOKUP_LINK.id,
    JISHO_LOOKUP_LINK.id,
    WEBLIO_LOOKUP_LINK.id,
    REMOVED_GOO_LOOKUP_LINK_ID,
    KOTOBANK_LOOKUP_LINK.id,
    TAKOBOTO_LOOKUP_LINK.id,
    WIKTIONARY_LOOKUP_LINK.id,
    IMMERSION_KIT_LOOKUP_LINK.id,
    UCHISEN_LOOKUP_LINK.id,
    COPY_LOOKUP_LINK.id
  ], [
    JITEN_LOOKUP_LINK.id,
    JPDB_LOOKUP_LINK.id,
    YOMU_LOOKUP_LINK.id,
    JISHO_LOOKUP_LINK.id,
    WEBLIO_LOOKUP_LINK.id,
    REMOVED_GOO_LOOKUP_LINK_ID,
    KOTOBANK_LOOKUP_LINK.id,
    TAKOBOTO_LOOKUP_LINK.id,
    WIKTIONARY_LOOKUP_LINK.id,
    IMMERSION_KIT_LOOKUP_LINK.id,
    UCHISEN_LOOKUP_LINK.id,
    COPY_LOOKUP_LINK.id
  ], [
    JPDB_LOOKUP_LINK.id,
    JISHO_LOOKUP_LINK.id,
    COPY_LOOKUP_LINK.id,
    YOMU_LOOKUP_LINK.id,
    JITEN_LOOKUP_LINK.id,
    WEBLIO_LOOKUP_LINK.id,
    REMOVED_GOO_LOOKUP_LINK_ID,
    KOTOBANK_LOOKUP_LINK.id,
    TAKOBOTO_LOOKUP_LINK.id,
    WIKTIONARY_LOOKUP_LINK.id,
    IMMERSION_KIT_LOOKUP_LINK.id,
    UCHISEN_LOOKUP_LINK.id
  ]];
  const FALLBACK_HEX_COLOR = "#000000";
  function normalizeHexColor(color) {
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : FALLBACK_HEX_COLOR;
  }
  function sharedContrastRatio(a, b, normalizeColor = normalizeHexColor) {
    const l1 = relativeLuminance(a, normalizeColor);
    const l2 = relativeLuminance(b, normalizeColor);
    const light = Math.max(l1, l2);
    const dark = Math.min(l1, l2);
    return (light + 0.05) / (dark + 0.05);
  }
  function relativeLuminance(color, normalizeColor = normalizeHexColor) {
    const [red, green, blue] = sharedHexToRgb(color, normalizeColor).map((value) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }
  function sharedMixHex(from, to, amount, normalizeColor = normalizeHexColor) {
    const a = sharedHexToRgb(from, normalizeColor);
    const b = sharedHexToRgb(to, normalizeColor);
    return `#${a.map((value, index) => Math.round(value + (b[index] - value) * amount).toString(16).padStart(2, "0")).join("")}`;
  }
  function sharedHexToRgb(color, normalizeColor = normalizeHexColor) {
    const safe = normalizeHexColor(normalizeColor(color));
    return [
      parseInt(safe.slice(1, 3), 16),
      parseInt(safe.slice(3, 5), 16),
      parseInt(safe.slice(5, 7), 16)
    ];
  }
  Logger.scope("Settings");
  const DEFAULT_ACCENT_COLOR = BRAND_COLOR_TOKENS.accent;
  const OCR_BACKGROUND_MIN_TEXT_CONTRAST = 4.5;
  const OCR_BACKGROUND_MIN_RENDERED_OPACITY = 0.56;
  const DEFAULT_OCR_BACKGROUND_OPACITY = 0.68;
  const DEFAULT_OCR_TEXT_COLOR = OVERLAY_COLOR_TOKENS.text;
  accessibleOcrBackgroundColor(DEFAULT_ACCENT_COLOR, DEFAULT_OCR_BACKGROUND_OPACITY);
  const AUDIO_SOURCE_TYPE_VALUES = [
    "jpod101",
    "language-pod-101",
    "jisho",
    "bunpro",
    "lingua-libre",
    "wiktionary",
    "jiten-tts",
    "jpdb-tts",
    "text-to-speech",
    "text-to-speech-reading",
    "custom",
    "custom-json"
  ];
  const DEFAULT_AUDIO_SOURCES = [
    { type: "custom-json", url: YOMU_HOSTED_AUDIO_URL, voice: "", enabled: true },
    { type: "jpod101", url: "", voice: "", enabled: false },
    { type: "language-pod-101", url: "", voice: "", enabled: false },
    { type: "jisho", url: "", voice: "", enabled: false },
    { type: "bunpro", url: "", voice: "", enabled: false },
    { type: "jiten-tts", url: "", voice: "", enabled: false },
    { type: "jpdb-tts", url: "", voice: "", enabled: false },
    { type: "text-to-speech", url: "", voice: "", enabled: false }
  ];
  new Set(AUDIO_SOURCE_TYPE_VALUES);
  new Set(
    DEFAULT_AUDIO_SOURCES.filter((source) => source.type !== "custom-json" || source.url !== YOMU_HOSTED_AUDIO_URL).map((source) => source.type)
  );
  const EXPLICIT_FURIGANA_MODES = /* @__PURE__ */ new Set(["all", "difficult-kanji", "known-status", "hover"]);
  const DEFAULT_NEW_TAB_STUDY_STEP_ORDER = [
    "kanji-doodle",
    "word",
    "type-word",
    "recall-cloze",
    "listen-pitch",
    "speaking"
  ];
  new Set(DEFAULT_NEW_TAB_STUDY_STEP_ORDER);
  ({
    dictionaryLookupLinks: DEFAULT_DICTIONARY_LOOKUP_LINKS.map((link) => ({ ...link }))
  });
  function clampNumber$1(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }
  function hasPersonalizedFuriganaSource(settings) {
    const credentials = {
      apiKey: settings.apiKey ?? "",
      jitenApiKey: settings.jitenApiKey ?? ""
    };
    return Boolean(hasJpdbApiCredential(credentials) || hasJitenApiCredential(credentials) || settings.ankiEnabled);
  }
  function effectiveFuriganaMode(settings) {
    if (!settings.showFurigana || settings.furiganaMode === "off") return "off";
    if (isExplicitFuriganaMode(settings.furiganaMode)) return settings.furiganaMode;
    return hasPersonalizedFuriganaSource(settings) ? "known-status" : "difficult-kanji";
  }
  function isExplicitFuriganaMode(value) {
    return EXPLICIT_FURIGANA_MODES.has(value);
  }
  function sanitizeAccentColor(value, fallback = DEFAULT_ACCENT_COLOR) {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
    const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed);
    if (!shortHex) return fallback;
    return `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`.toLowerCase();
  }
  function accentToRgba(color, alpha) {
    const safe = sanitizeAccentColor(color);
    const red = parseInt(safe.slice(1, 3), 16);
    const green = parseInt(safe.slice(3, 5), 16);
    const blue = parseInt(safe.slice(5, 7), 16);
    return `rgba(${red},${green},${blue},${Math.max(0, Math.min(1, alpha))})`;
  }
  function accessibleOcrBackgroundOpacity(opacity) {
    return Math.max(
      OCR_BACKGROUND_MIN_RENDERED_OPACITY,
      clampNumber$1(opacity, 0, 1, DEFAULT_OCR_BACKGROUND_OPACITY)
    );
  }
  function accessibleOcrBackgroundColor(accentColor, opacity = DEFAULT_OCR_BACKGROUND_OPACITY) {
    const accent = sanitizeAccentColor(accentColor);
    const renderedOpacity = accessibleOcrBackgroundOpacity(opacity);
    if (ocrRenderedBackgroundContrast(accent, renderedOpacity) >= OCR_BACKGROUND_MIN_TEXT_CONTRAST) {
      return accent;
    }
    for (let amount = 0.08; amount <= 1; amount += 0.04) {
      const candidate = sharedMixHex(accent, "#000000", amount, sanitizeAccentColor);
      if (ocrRenderedBackgroundContrast(candidate, renderedOpacity) >= OCR_BACKGROUND_MIN_TEXT_CONTRAST) {
        return candidate;
      }
    }
    return "#000000";
  }
  function ocrRenderedBackgroundContrast(color, opacity) {
    const renderedOnWhite = sharedMixHex("#ffffff", color, opacity, sanitizeAccentColor);
    return sharedContrastRatio(renderedOnWhite, DEFAULT_OCR_TEXT_COLOR, sanitizeAccentColor);
  }
  const PITCH_LEVELS = /* @__PURE__ */ new Set(["H", "L"]);
  const SMALL_KANA = new Set("ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ゙゚");
  const PRONUNCIATION_KANA = /^[\u3040-\u30ff\u3099\u309A]+$/u;
  const PITCH_CLASS_RULES = [
    { className: "heiban", matches: (pitchNumber) => pitchNumber === 0 },
    { className: "atamadaka", matches: (pitchNumber) => pitchNumber === 1 },
    { className: "odaka", matches: (pitchNumber, moraCount) => pitchNumber === moraCount },
    { className: "nakadaka", matches: (pitchNumber, moraCount) => pitchNumber > 1 && pitchNumber < moraCount }
  ];
  function normalizePitchPatternForReading(pattern, reading) {
    const levels = pitchLevels(pattern);
    if (!levels.length) return "";
    return normalizePitchLevelsForReading(levels, reading).join("");
  }
  function pitchLevels(pattern) {
    return Array.from(pattern).filter((level) => PITCH_LEVELS.has(level));
  }
  function splitMorae(reading) {
    if (!PRONUNCIATION_KANA.test(reading)) return [];
    const morae = [];
    for (const char of Array.from(reading)) {
      if (morae.length && SMALL_KANA.has(char)) morae[morae.length - 1] += char;
      else morae.push(char);
    }
    return morae;
  }
  function countMorae(reading) {
    return splitMorae(reading).length;
  }
  function pitchPatternFromPosition(reading, position) {
    const moraCount = countMorae(reading);
    if (!moraCount || !Number.isInteger(position) || position < 0 || position > moraCount) return "";
    if (position === 0) return `L${"H".repeat(moraCount)}`;
    if (position === 1) return `H${"L".repeat(moraCount)}`;
    const highMorae = position - 1;
    const lowTail = moraCount - position + 1;
    return `L${"H".repeat(highMorae)}${"L".repeat(lowTail)}`;
  }
  function pitchProfileForPattern(pattern, reading) {
    const normalized = normalizePitchPatternForReading(pattern, reading);
    const morae = splitMorae(reading);
    const pitchNumber = pitchNumberFromPattern(normalized, reading);
    return {
      reading,
      morae,
      pitchNumber,
      pattern: normalized,
      className: pitchClassNameFromProfile(morae.length, pitchNumber)
    };
  }
  function pitchClassNameForPattern(pattern, reading) {
    return pitchProfileForPattern(pattern, reading).className;
  }
  function contextPitchPattern(patterns, reading) {
    if (!patterns?.length) return "";
    if (!reading) return patterns[0];
    return patterns.find((pattern) => pitchClassNameForPattern(pattern, reading) !== "") ?? "";
  }
  function pitchNumberFromPattern(pattern, reading) {
    const levels = pitchLevels(normalizePitchPatternForReading(pattern, reading));
    const moraCount = countMorae(reading);
    if (!moraCount) return null;
    if (levels.length < moraCount) return looksLikeCompactHeibanPattern(levels) ? 0 : null;
    if (levels.length > moraCount + 1) return null;
    for (let position = 0; position <= moraCount; position += 1) {
      const expected = pitchLevels(pitchPatternFromPosition(reading, position));
      if (levels.every((level, index) => expected[index] === level)) return position;
    }
    return null;
  }
  function looksLikeCompactHeibanPattern(levels) {
    return levels.length >= 2 && levels[0] === "L" && levels.slice(1).every((level) => level === "H");
  }
  function pitchClassNameFromProfile(moraCount, pitchNumber) {
    if (!moraCount || pitchNumber == null) return "";
    return PITCH_CLASS_RULES.find((rule) => rule.matches(pitchNumber, moraCount))?.className ?? "";
  }
  function normalizePitchLevelsForReading(levels, reading) {
    const chars = Array.from(reading);
    if (!levels.length || !chars.some((char) => SMALL_KANA.has(char))) return levels;
    if (!looksCharacterAlignedPitch(levels, chars)) return levels;
    const normalized = [];
    for (let index = 0; index < Math.min(chars.length, levels.length); index++) {
      if (normalized.length && SMALL_KANA.has(chars[index])) continue;
      normalized.push(levels[index]);
    }
    return normalized.concat(levels.slice(chars.length));
  }
  function looksCharacterAlignedPitch(levels, chars) {
    if (levels.length > splitMorae(chars.join("")).length + 1) return true;
    if (levels.length < chars.length) return false;
    return chars.some((char, index) => index > 0 && SMALL_KANA.has(char) && levels[index] === levels[index - 1]);
  }
  function getPitchClass(pitchAccent, reading) {
    const pattern = contextPitchPattern(pitchAccent, reading);
    return pattern ? pitchClassNameForPattern(pattern, reading) : "";
  }
  const PITCH_CLASSES$1 = /* @__PURE__ */ new Set(["heiban", "atamadaka", "nakadaka", "odaka"]);
  function resolvedPitchComponents(card) {
    if (getPitchClass(card.pitchAccent, card.reading || card.spelling)) return [];
    const components = card.pitchComponents ?? [];
    if (components.length < 2) return [];
    if (compact(components.map((component) => component.spelling).join("")) !== compact(card.spelling)) return [];
    if (card.reading && compact(components.map((component) => component.reading).join("")) !== compact(card.reading)) return [];
    const resolved = components.map((component) => ({
      ...component,
      pitchClass: getPitchClass(component.pitchAccent, component.reading || component.spelling)
    }));
    return resolved.every((component) => PITCH_CLASSES$1.has(component.pitchClass)) ? resolved : [];
  }
  function pitchComponentUnderlineGradient(card) {
    const components = resolvedPitchComponents(card);
    if (!components.length) return "";
    const lengths = components.map((component) => Array.from(component.spelling).length);
    const total = lengths.reduce((sum, length) => sum + length, 0);
    if (!total) return "";
    let offset = 0;
    const stops = [];
    components.forEach((component, index) => {
      const start = offset / total * 100;
      offset += lengths[index] ?? 0;
      const end = offset / total * 100;
      const color = `var(--jpdb-reader-pitch-${component.pitchClass})`;
      stops.push(`${color} ${formatPercent(start)}`, `${color} ${formatPercent(end)}`);
    });
    return `linear-gradient(to right, ${stops.join(", ")})`;
  }
  function compact(value) {
    return value.replace(/\s+/g, "").trim();
  }
  function formatPercent(value) {
    return `${Number(value.toFixed(3))}%`;
  }
  const KANJI_RE = /[\u3400-\u9fff]/u;
  const KANA_CHAR_RE = /[\u3040-\u30ffー・]/u;
  const KANA_RE = /^[\u3040-\u30ffー・]+$/u;
  const TRAILING_DIGITS_RE = /[0-9０-９]+$/u;
  const NUMBER_BIND_CLASS = "jpdb-reader-number-bind";
  new Set("ADDRESS,ARTICLE,ASIDE,BLOCKQUOTE,DD,DETAILS,DIALOG,DIV,DL,DT,FIELDSET,FIGCAPTION,FIGURE,FOOTER,FORM,H1,H2,H3,H4,H5,H6,HEADER,HR,LI,MAIN,NAV,OL,P,PRE,SECTION,TABLE,TBODY,TD,TFOOT,TH,THEAD,TR,UL".split(","));
  const EASY_FURIGANA_KANJI = new Set(
    "一丁七万三上下不世中主久乗九予事二五井交京人今介仏仕他付代令以休会伝住何作使例供係信借元兄先光入全公六共内円写冬出分切前力加動北十千午半南原友反取口古台同名向君告周味呼命和品員問四回国土在地坂堂場声売夏夕外多夜大天太夫央女好妹姉始子字学安家宿寒寺小少山川工左市帰年広店度庭建引弟強待後心思急息悪手持教文方旅日早明春昼時曜書有朝木本村来東林校森業楽歌止正歩母毎気水池海父物犬王生田町男白百的目知石社私秋空立竹笑答米糸紙終聞肉自花英茶草行西見言話語読買赤走足車近通週道遠里野金長門間雨青音食飲駅高魚鳥黒".split("")
  );
  selectorPairs("control,toggle,player", ["class"]);
  const PITCH_CLASSES = new Set("heiban,atamadaka,nakadaka,odaka".split(","));
  const PARTICLE_SURFACE_RE = /^[のはをがにでへもとやかねよな]$/u;
  const MINING_INSIGHT_UNKNOWN_STATES = /* @__PURE__ */ new Set(["new", "not-in-deck", "in-deck"]);
  const MINING_INSIGHT_MIN_CARD_COUNT = 3;
  const FURIGANA_GROUP_STATES = {
    new: ["new", "not-in-deck", "in-deck"],
    learning: ["learning", "young"],
    known: ["known", "mature", "mastered", "never-forget", "redundant"],
    due: ["due"],
    failed: ["failed"]
  };
  function furiganaHiddenStates(settings) {
    const states = /* @__PURE__ */ new Set();
    for (const group of settings.furiganaHiddenStateGroups) {
      for (const state2 of FURIGANA_GROUP_STATES[group] ?? []) states.add(state2);
    }
    return states;
  }
  function shouldHideFuriganaForCardState(settings, state2) {
    const mode = effectiveFuriganaMode(settings);
    if (mode === "off") return true;
    return mode === "known-status" && furiganaHiddenStates(settings).has(state2);
  }
  new Set("ADDRESS,ARTICLE,ASIDE,BLOCKQUOTE,BR,DD,DETAILS,DIALOG,DIV,DL,DT,FIGCAPTION,FIGURE,H1,H2,H3,H4,H5,H6,HR,LI,MAIN,OL,P,PRE,SECTION,TABLE,TBODY,TD,TFOOT,TH,THEAD,TR,UL".split(","));
  function renderTokensToHtml(text, tokens, settings) {
    let html = "";
    let offset = 0;
    const safeTokens = nonOverlappingTokens(tokens, text);
    const miningInsightKeys = miningInsightTokenKeys(safeTokens);
    for (const token of safeTokens) {
      if (token.start > offset) html += plainTextBeforeTokenHtml(text.slice(offset, token.start));
      html += renderTokenHtml(text.slice(token.start, token.end), token, settings, miningInsightKeys);
      offset = token.end;
    }
    if (offset < text.length) html += escapeHtml(text.slice(offset));
    return html;
  }
  function plainTextBeforeTokenHtml(gap) {
    const digits = TRAILING_DIGITS_RE.exec(gap)?.[0];
    if (!digits) return escapeHtml(gap);
    const prefix = gap.slice(0, gap.length - digits.length);
    return `${escapeHtml(prefix)}<span class="${NUMBER_BIND_CLASS}">${escapeHtml(digits)}</span>`;
  }
  function nonOverlappingTokens(tokens, text) {
    const safe = [];
    let offset = 0;
    for (const token of tokens) {
      if (!isSafeTokenSpan(token, offset, text)) continue;
      safe.push(token);
      offset = token.end;
    }
    return safe;
  }
  function isSafeTokenSpan(token, offset, text) {
    if (!Number.isInteger(token.start) || !Number.isInteger(token.end) || token.start < offset || token.start < 0 || token.end <= token.start || token.end > text.length) return false;
    return HAS_JAPANESE_LETTER.test(text.slice(token.start, token.end));
  }
  function miningInsightTokenKeys(tokens) {
    const sentences = /* @__PURE__ */ new Map();
    for (const token of tokens) {
      const sentence = miningInsightSentenceKey(token);
      if (!sentence || isParticleCard(token.card)) continue;
      const cardKey = readerCardKey(token.card);
      const sentenceCards = sentences.get(sentence) ?? /* @__PURE__ */ new Map();
      if (!sentences.has(sentence)) sentences.set(sentence, sentenceCards);
      if (!sentenceCards.has(cardKey)) {
        sentenceCards.set(cardKey, { unknown: isMiningUnknownCard(token.card) });
      }
    }
    const keys = /* @__PURE__ */ new Set();
    sentences.forEach((cards, sentence) => {
      if (cards.size < MINING_INSIGHT_MIN_CARD_COUNT) return;
      const unknownCards = [...cards.entries()].filter(([, card]) => card.unknown);
      if (unknownCards.length !== 1) return;
      keys.add(miningInsightKey(sentence, unknownCards[0][0]));
    });
    return keys;
  }
  function isMiningUnknownCard(card) {
    return MINING_INSIGHT_UNKNOWN_STATES.has(primaryCardState(card.cardState));
  }
  function miningInsightTokenKey(token) {
    return miningInsightKey(miningInsightSentenceKey(token), readerCardKey(token.card));
  }
  function miningInsightKey(sentence, cardKey) {
    return `${sentence}\0${cardKey}`;
  }
  function miningInsightSentenceKey(token) {
    return (token.sentence ?? "").replace(/\s+/g, " ").trim();
  }
  function readerCardKey(card) {
    return `${readerCardSource(card)}:${readerCardId(card)}/${readerReadingIndex(card)}`;
  }
  function readerCardSource(card) {
    return card.source ?? (card.reviewSource === "jiten-api" ? "jiten" : "jpdb");
  }
  function readerCardId(card) {
    return readerCardSource(card) === "jiten" ? card.jitenWordId ?? card.vid : card.vid;
  }
  function readerReadingIndex(card) {
    return readerCardSource(card) === "jiten" ? card.jitenReadingIndex ?? card.sid : card.sid;
  }
  function renderTokenHtml(surface, token, settings, miningInsightKeys) {
    const state2 = primaryCardState(token.card.cardState);
    const hasRuby = shouldRenderRuby(surface, token, settings);
    const content = hasRuby ? renderRuby(surface, token) : escapeHtml(surface);
    const hasMiningInsight = miningInsightKeys.has(miningInsightTokenKey(token));
    const pitchClass = settings.showPitchAccent ? safePitchClass(token.pitchClass) : "";
    const classes = [
      readerWordClassName(state2, token, settings),
      hasRuby ? "jpdb-reader-has-furi" : "",
      hasMiningInsight ? "jpdb-reader-i-plus-one" : ""
    ].filter(Boolean).join(" ");
    const source = ` data-card-source="${escapeHtml(readerCardSource(token.card))}"`;
    const cardId = ` data-card-id="${readerCardId(token.card)}"`;
    const readingIndex = ` data-reading-index="${readerReadingIndex(token.card)}"`;
    const cardState = ` data-card-state="${escapeHtml(state2)}"`;
    const tokenRange = ` data-token-start="${token.start}" data-token-end="${token.end}"`;
    const surfaceAttr = ` data-surface="${escapeHtml(surface)}"`;
    const miningInsight = hasMiningInsight ? ' data-mining-insight="i-plus-one"' : "";
    const expression = token.card.spelling ? ` data-expression="${escapeHtml(token.card.spelling)}"` : "";
    const reading = token.card.reading ? ` data-reading="${escapeHtml(token.card.reading)}"` : "";
    const pitchAccent = token.card.pitchAccent.join("|");
    const pitchClassAttr = pitchClass ? ` data-pitch-class="${pitchClass}"` : "";
    const lookupMetadata = settings.showPitchAccent && pitchAccent ? ` data-pitch-accent="${escapeHtml(pitchAccent)}"` : "";
    const pitchComponentGradient = settings.showPitchAccent ? pitchComponentUnderlineGradient(token.card) : "";
    const pitchComponentMetadata = pitchComponentGradient ? ` data-pitch-components="true" style="--jpdb-reader-inline-pitch-gradient:${escapeHtml(pitchComponentGradient)}"` : "";
    const deck = renderDeckMembershipAttributes(token.card);
    return `<span class="${classes}" data-vid="${token.card.vid}" data-sid="${token.card.sid}"${source}${cardId}${readingIndex}${cardState}${tokenRange}${surfaceAttr}${pitchClassAttr}${pitchComponentMetadata} data-sentence="${escapeHtml(token.sentence ?? "")}"${miningInsight}${expression}${reading}${lookupMetadata}${deck} tabindex="-1">${content}</span>`;
  }
  function renderDeckMembershipAttributes(card) {
    const membership = cardDeckMembership(card);
    if (!membership.member) return "";
    const deckNames = membership.names.length ? ` data-deck-names="${escapeHtml(membership.names.join(", "))}"` : "";
    return ` data-deck-member="true" data-deck-source="${escapeHtml(membership.source)}"${deckNames}`;
  }
  function shouldRenderRuby(surface, token, settings, allowRuby = true, preserveTokenRubies = false) {
    if (!allowRuby) return false;
    if (!effectiveTokenRubies(surface, token, preserveTokenRubies).length) return false;
    return furiganaModeAllowsRuby(effectiveFuriganaMode(settings), surface, token, settings);
  }
  function furiganaModeAllowsRuby(mode, surface, token, settings) {
    if (mode === "off") return false;
    if (mode === "hover") return true;
    if (mode === "known-status") return !shouldHideFuriganaForCardState(settings, primaryCardState(token.card.cardState));
    return mode !== "difficult-kanji" || hasDifficultKanji(surface);
  }
  function hasDifficultKanji(surface) {
    for (const char of surface) {
      if (KANJI_RE.test(char) && !EASY_FURIGANA_KANJI.has(char)) return true;
    }
    return false;
  }
  function readerWordClassName(state2, token, settings) {
    const classes = ["jpdb-reader-word"];
    if (isParticleCard(token.card)) {
      classes.push("jpdb-reader-particle");
    }
    if (hasKnownCardState(token.card)) {
      classes.push(`jpdb-${state2}`);
      const source = readerCardSource(token.card);
      if (source !== "jpdb") classes.push(`${source}-${state2}`);
    }
    classes.push(...cardDeckMembershipClassNames(token.card));
    if (settings.showPitchAccent) classes.push(`jpdb-pitch-${safePitchClass(token.pitchClass)}`);
    return classes.join(" ");
  }
  function hasKnownCardState(card) {
    return Array.isArray(card.cardState) && card.cardState.length > 0;
  }
  function isParticleCard(card) {
    return card.partOfSpeech.includes("prt") || PARTICLE_SURFACE_RE.test(card.spelling.trim());
  }
  function safePitchClass(value) {
    return PITCH_CLASSES.has(value) ? value : "unknown";
  }
  function renderRuby(surface, token, kanjiNavigation, preserveTokenRubies = false) {
    let html = "";
    let localOffset = 0;
    for (const ruby of effectiveTokenRubies(surface, token, preserveTokenRubies)) {
      const start = ruby.start - token.start;
      const end = ruby.end - token.start;
      html += renderKanjiNavigationText(surface.slice(localOffset, start));
      html += `<ruby><span class="jpdb-reader-ruby-base">${renderKanjiNavigationText(surface.slice(start, end))}</span><rp>(</rp><rt class="jpdb-reader-furi">${escapeHtml(ruby.text)}</rt><rp>)</rp></ruby>`;
      localOffset = end;
    }
    html += renderKanjiNavigationText(surface.slice(localOffset));
    return html;
  }
  function inferredInflectedSurfaceRubies(surface, spelling, reading) {
    const visibleSurface = surface.trim();
    const baseSpelling = spelling.trim();
    const baseReading = reading.trim();
    if (!visibleSurface || !baseSpelling || visibleSurface === baseSpelling) return [];
    if (!KANJI_RE.test(visibleSurface) || !KANA_RE.test(baseReading) || baseReading === baseSpelling) return [];
    for (const spellingSuffix of trailingKanaSuffixes(baseSpelling)) {
      if (!baseReading.endsWith(spellingSuffix)) continue;
      const spellingStem = baseSpelling.slice(0, -spellingSuffix.length);
      if (!spellingStem || !visibleSurface.startsWith(spellingStem)) continue;
      const surfaceSuffix = visibleSurface.slice(spellingStem.length);
      if (surfaceSuffix && !KANA_RE.test(surfaceSuffix)) continue;
      const rubies = stemRubiesForInflectedSurface(spellingStem, baseReading.slice(0, -spellingSuffix.length));
      if (rubies.length) return rubies;
    }
    if (visibleSurface.startsWith(baseSpelling) && !KANA_CHAR_RE.test(baseSpelling)) {
      const surfaceSuffix = visibleSurface.slice(baseSpelling.length);
      if (!surfaceSuffix || KANA_RE.test(surfaceSuffix)) {
        return [{
          text: baseReading,
          start: 0,
          end: baseSpelling.length,
          length: baseSpelling.length
        }];
      }
    }
    return [];
  }
  function trailingKanaSuffixes(value) {
    const suffixes = [];
    for (let index = 0; index < value.length; index += 1) {
      const suffix = value.slice(index);
      if (suffix && KANA_RE.test(suffix)) suffixes.push(suffix);
    }
    return suffixes.sort((first, second) => second.length - first.length);
  }
  function stemRubiesForInflectedSurface(surfaceStem, readingStem) {
    const trimmed = trimSharedKanaAffixes(surfaceStem, readingStem);
    if (!trimmed.surface || !trimmed.reading) return [];
    if (!KANJI_RE.test(trimmed.surface) || !KANA_RE.test(trimmed.reading)) return [];
    return [{
      text: trimmed.reading,
      start: trimmed.offset,
      end: trimmed.offset + trimmed.surface.length,
      length: trimmed.surface.length
    }];
  }
  function trimSharedKanaAffixes(surface, reading) {
    let trimmedSurface = surface;
    let trimmedReading = reading;
    let offset = 0;
    while (trimmedSurface && trimmedReading && sameKanaCharacter(trimmedSurface[0], trimmedReading[0])) {
      trimmedSurface = trimmedSurface.slice(1);
      trimmedReading = trimmedReading.slice(1);
      offset += 1;
    }
    while (trimmedSurface && trimmedReading && sameKanaCharacter(
      trimmedSurface[trimmedSurface.length - 1],
      trimmedReading[trimmedReading.length - 1]
    )) {
      trimmedSurface = trimmedSurface.slice(0, -1);
      trimmedReading = trimmedReading.slice(0, -1);
    }
    return { surface: trimmedSurface, reading: trimmedReading, offset };
  }
  function sameKanaCharacter(first, second) {
    return Boolean(first && second && first === second && KANA_RE.test(first));
  }
  function effectiveTokenRubies(surface, token, preserveTokenRubies = false) {
    const sources = sourceTokenRubies(surface, token);
    if (preserveTokenRubies) {
      return sources.flatMap((ruby) => {
        const range = localRubyRange(surface, token, ruby);
        if (!range) return [];
        const base = surface.slice(range.start, range.end);
        if (!KANJI_RE.test(base)) return [];
        if (!KANA_CHAR_RE.test(base)) return [ruby];
        const parts = kanjiOnlyRubySegments(surface, token, ruby);
        return parts.length ? parts : [ruby];
      });
    }
    return sources.flatMap((ruby) => kanjiOnlyRubySegments(surface, token, ruby));
  }
  function sourceTokenRubies(surface, token) {
    if (token.rubies.length) return token.rubies;
    const reading = token.card.reading.trim();
    if (!surface || !KANJI_RE.test(surface) || !reading || reading === surface || !KANA_RE.test(reading)) return [];
    const inferred = inferredInflectedSurfaceRubies(surface, token.card.spelling, reading);
    if (inferred.length) {
      return inferred.map((ruby) => ({
        ...ruby,
        start: token.start + ruby.start,
        end: token.start + ruby.end
      }));
    }
    return [{ text: reading, start: token.start, end: token.end, length: token.length }];
  }
  function kanjiOnlyRubySegments(surface, token, ruby) {
    const range = localRubyRange(surface, token, ruby);
    if (!range) return [];
    return kanjiRubyParts(surface.slice(range.start, range.end), ruby.text.trim()).map((part) => ({
      text: part.text,
      start: token.start + range.start + part.start,
      end: token.start + range.start + part.end,
      length: part.end - part.start
    }));
  }
  function localRubyRange(surface, token, ruby) {
    const start = ruby.start - token.start;
    const end = ruby.end - token.start;
    if (start < 0 || end > surface.length || end <= start) return null;
    return { start, end };
  }
  function kanjiRubyParts(base, reading) {
    if (!base || !reading || !KANJI_RE.test(base)) return [];
    if (!KANA_RE.test(reading)) return [{ text: reading, start: 0, end: base.length }];
    const anchors = alignRubyKanaAnchors(base, reading);
    if (!anchors) return trimRubyPartToKanji(base, reading);
    const parts = [];
    let baseOffset = 0;
    let readingOffset = 0;
    for (const anchor of anchors) {
      appendRubyGap(parts, base, baseOffset, anchor.baseStart, reading.slice(readingOffset, anchor.readingStart));
      baseOffset = anchor.baseEnd;
      readingOffset = anchor.readingEnd;
    }
    appendRubyGap(parts, base, baseOffset, base.length, reading.slice(readingOffset));
    return parts.length ? parts : trimRubyPartToKanji(base, reading);
  }
  function appendRubyGap(parts, base, start, end, reading) {
    const part = trimRubyPartToKanji(base.slice(start, end), reading)[0];
    if (part) parts.push({ text: part.text, start: start + part.start, end: start + part.end });
  }
  function trimRubyPartToKanji(base, reading) {
    const trimmed = trimSharedKanaAffixes(base, reading);
    if (!trimmed.surface || !trimmed.reading || !KANJI_RE.test(trimmed.surface)) return [];
    const kanjiOnly = kanaTrimmedKanjiRange(trimmed.surface, trimmed.reading);
    if (kanjiOnly) {
      return [{
        text: trimmed.reading,
        start: trimmed.offset + kanjiOnly.start,
        end: trimmed.offset + kanjiOnly.end
      }];
    }
    return [{
      text: trimmed.reading,
      start: trimmed.offset,
      end: trimmed.offset + trimmed.surface.length
    }];
  }
  function kanaTrimmedKanjiRange(base, reading) {
    if (!KANA_RE.test(reading) || !KANA_CHAR_RE.test(base)) return null;
    const chars = Array.from(base);
    const first = chars.findIndex((char) => KANJI_RE.test(char));
    if (first < 0) return null;
    let last = -1;
    for (let index = chars.length - 1; index >= first; index -= 1) {
      if (KANJI_RE.test(chars[index])) {
        last = index;
        break;
      }
    }
    if (last < first || first === 0 && last === chars.length - 1) return null;
    return { start: first, end: last + 1 };
  }
  function alignRubyKanaAnchors(base, reading) {
    const runs = rubyBaseKanaRuns(base);
    if (!runs.length) return [];
    return findRubyKanaAnchorPlan(base, reading, runs, 0, 0, []);
  }
  function findRubyKanaAnchorPlan(base, reading, runs, index, readingOffset, anchors) {
    if (index >= runs.length) return rubyKanaAnchorPlanIsValid(base, reading, anchors) ? anchors : null;
    const run = runs[index];
    for (const readingStart of readingRunOccurrences(reading, run.text, readingOffset)) {
      const nextAnchors = anchors.concat({
        ...run,
        readingStart,
        readingEnd: readingStart + run.text.length
      });
      const plan = findRubyKanaAnchorPlan(base, reading, runs, index + 1, readingStart + run.text.length, nextAnchors);
      if (plan) return plan;
    }
    return null;
  }
  function readingRunOccurrences(reading, text, offset) {
    const occurrences = [];
    let index = reading.indexOf(text, offset);
    while (index >= 0) {
      occurrences.push(index);
      index = reading.indexOf(text, index + 1);
    }
    return occurrences;
  }
  function rubyKanaAnchorPlanIsValid(base, reading, anchors) {
    let baseOffset = 0;
    let readingOffset = 0;
    for (const anchor of anchors) {
      if (!rubyGapCanOwnReading(base.slice(baseOffset, anchor.baseStart), reading.slice(readingOffset, anchor.readingStart))) return false;
      baseOffset = anchor.baseEnd;
      readingOffset = anchor.readingEnd;
    }
    return rubyGapCanOwnReading(base.slice(baseOffset), reading.slice(readingOffset));
  }
  function rubyGapCanOwnReading(base, reading) {
    return KANJI_RE.test(base) ? reading.length > 0 : reading.length === 0;
  }
  function rubyBaseKanaRuns(base) {
    const runs = [];
    let start = -1;
    for (let index = 0; index <= base.length; index += 1) {
      const isKana = index < base.length && KANA_CHAR_RE.test(base[index]);
      if (isKana && start < 0) start = index;
      if ((!isKana || index === base.length) && start >= 0) {
        runs.push({ text: base.slice(start, index), baseStart: start, baseEnd: index });
        start = -1;
      }
    }
    return runs;
  }
  function renderKanjiNavigationText(value, options) {
    return escapeHtml(value);
  }
  function ocrRuntimeActive(settings) {
    return settings.ocrEnabled && !settings.annotationsPaused;
  }
  function invertedCanvas(canvas) {
    try {
      const inverted = document.createElement("canvas");
      inverted.width = canvas.width;
      inverted.height = canvas.height;
      const context = inverted.getContext("2d");
      if (!context) return canvas;
      context.filter = "invert(1)";
      context.drawImage(canvas, 0, 0);
      return inverted;
    } catch {
      return canvas;
    }
  }
  const DARK_FIELD_SIZE = 48;
  const DARK_LUMINANCE = 90;
  const DARK_REGION_TRIGGER = 0.1;
  const DARK_LINE_MEAN_LUMINANCE = 110;
  function buildLuminanceField(image) {
    try {
      if (!image.naturalWidth || !image.naturalHeight) return null;
      const size = DARK_FIELD_SIZE;
      const sample = document.createElement("canvas");
      sample.width = size;
      sample.height = size;
      const context = sample.getContext("2d", { willReadFrequently: true });
      if (!context) return null;
      context.drawImage(image, 0, 0, size, size);
      const { data } = context.getImageData(0, 0, size, size);
      const lum = new Uint8Array(size * size);
      let opaque = 0;
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        if (data[i + 3] >= 8) opaque++;
        lum[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 | 0;
      }
      if (opaque < lum.length * 0.5) return null;
      return { size, lum };
    } catch {
      return null;
    }
  }
  function luminanceFieldDarkFraction(field) {
    let dark = 0;
    for (const value of field.lum) if (value < DARK_LUMINANCE) dark++;
    return dark / field.lum.length;
  }
  function regionMeanLuminance(field, box, width, height) {
    if (width <= 0 || height <= 0) return 255;
    const x0 = Math.max(0, Math.floor(box.left / width * field.size));
    const x1 = Math.min(field.size, Math.ceil((box.left + box.width) / width * field.size));
    const y0 = Math.max(0, Math.floor(box.top / height * field.size));
    const y1 = Math.min(field.size, Math.ceil((box.top + box.height) / height * field.size));
    let sum = 0;
    let count = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        sum += field.lum[y * field.size + x];
        count++;
      }
    }
    return count ? sum / count : 255;
  }
  function darkAreaIsRead(field, normal) {
    const size = field.size;
    let darkTotal = 0;
    let darkCovered = 0;
    const lines = normal?.lines ?? [];
    const width = normal?.width || 1;
    const height = normal?.height || 1;
    const cellRects = lines.map((line) => ({
      x0: Math.floor(line.box.left / width * size),
      x1: Math.ceil((line.box.left + line.box.width) / width * size),
      y0: Math.floor(line.box.top / height * size),
      y1: Math.ceil((line.box.top + line.box.height) / height * size)
    }));
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (field.lum[y * size + x] >= DARK_LUMINANCE) continue;
        darkTotal++;
        if (cellRects.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1)) darkCovered++;
      }
    }
    if (!darkTotal) return true;
    return darkCovered / darkTotal >= 0.5;
  }
  function boxesOverlapSignificantly(a, b) {
    const ix = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
    const iy = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
    const intersection = ix * iy;
    if (intersection <= 0) return false;
    const minArea = Math.min(a.width * a.height, b.width * b.height) || 1;
    return intersection / minArea >= 0.5;
  }
  function mergeDarkPassResult(normal, inverted, field) {
    if (!inverted?.lines.length) return normal;
    if (!normal) {
      const darkOnly = field ? inverted.lines.filter((line) => regionMeanLuminance(field, line.box, inverted.width, inverted.height) < DARK_LINE_MEAN_LUMINANCE) : inverted.lines;
      return darkOnly.length ? { width: inverted.width, height: inverted.height, lines: darkOnly } : null;
    }
    const lines = [...normal.lines];
    for (const line of inverted.lines) {
      if (field && regionMeanLuminance(field, line.box, inverted.width, inverted.height) >= DARK_LINE_MEAN_LUMINANCE) continue;
      if (lines.some((existing) => boxesOverlapSignificantly(existing.box, line.box))) continue;
      lines.push(line);
    }
    return { width: normal.width, height: normal.height, lines };
  }
  function drawImageToCanvas(image, maxPixels) {
    const size = loadedImageSize(image);
    const canvas = scaledCanvas(size, maxPixels);
    markCanvasMirrorSkip(drawableCanvasContext(canvas)).drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
  async function splitImageIntoPageColumns(image) {
    const size = loadedImageSize(image);
    const mid = Math.round(size.width / 2);
    return Promise.all([
      cropOcrImageColumn(image, 0, mid, size),
      cropOcrImageColumn(image, mid, size.width - mid, size)
    ]);
  }
  async function cropOcrImageColumn(image, left, width, size) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, size.height);
    markCanvasMirrorSkip(drawableCanvasContext(canvas)).drawImage(image, left, 0, width, size.height, 0, 0, canvas.width, canvas.height);
    return {
      image: await loadImage(canvas.toDataURL("image/jpeg", 0.9)),
      left,
      totalWidth: size.width,
      totalHeight: size.height
    };
  }
  function offsetOcrResult(result, left, top, width, height) {
    return {
      width,
      height,
      lines: result.lines.map((line) => ({
        ...line,
        box: { ...line.box, left: line.box.left + left, top: line.box.top + top }
      }))
    };
  }
  function mergeOcrResults(width, height, results) {
    const lines = results.flatMap((result) => result?.lines ?? []);
    return width && height && lines.length ? { width, height, lines } : null;
  }
  function loadedImageSize(image) {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error("Image is not loaded yet.");
    return { width, height };
  }
  function scaledCanvas(size, maxPixels) {
    const scale = Math.min(1, Math.sqrt(Math.max(16e4, maxPixels) / (size.width * size.height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(size.width * scale));
    canvas.height = Math.max(1, Math.round(size.height * scale));
    return canvas;
  }
  function drawableCanvasContext(canvas) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable.");
    return context;
  }
  function assertCanvasReadable(canvas) {
    canvas.getContext("2d")?.getImageData(0, 0, 1, 1);
  }
  function loadImage(url, timeout = 0) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      let timer = 0;
      const settle = (fn) => {
        if (timer) window.clearTimeout(timer);
        fn();
      };
      image.onload = () => settle(() => resolve(image));
      image.onerror = () => settle(() => reject(new Error("Image decode failed.")));
      if (timeout) timer = window.setTimeout(() => settle(() => reject(new Error("Image decode timed out."))), timeout);
      image.src = url;
    });
  }
  function imageContentBox(image, rect, style) {
    const scaleX = rectScale(rect.width, image.offsetWidth);
    const scaleY = rectScale(rect.height, image.offsetHeight);
    const left = scaledBoxEdge(style.borderLeftWidth, scaleX) + scaledBoxEdge(style.paddingLeft, scaleX);
    const right = scaledBoxEdge(style.borderRightWidth, scaleX) + scaledBoxEdge(style.paddingRight, scaleX);
    const top = scaledBoxEdge(style.borderTopWidth, scaleY) + scaledBoxEdge(style.paddingTop, scaleY);
    const bottom = scaledBoxEdge(style.borderBottomWidth, scaleY) + scaledBoxEdge(style.paddingBottom, scaleY);
    return {
      left,
      top,
      width: Math.max(1, rect.width - left - right),
      height: Math.max(1, rect.height - top - bottom)
    };
  }
  function rectScale(rectSize, layoutSize) {
    return layoutSize > 0 ? rectSize / layoutSize : 1;
  }
  function scaledBoxEdge(value, scale) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed * scale : 0;
  }
  function fittedObjectSize(objectFit, sourceWidth, sourceHeight, contentWidth, contentHeight) {
    const safeSourceWidth = Math.max(1, sourceWidth);
    const safeSourceHeight = Math.max(1, sourceHeight);
    const safeContentWidth = Math.max(1, contentWidth);
    const safeContentHeight = Math.max(1, contentHeight);
    const contain = () => scaledObjectSize(safeSourceWidth, safeSourceHeight, Math.min(safeContentWidth / safeSourceWidth, safeContentHeight / safeSourceHeight));
    switch (objectFit) {
      case "contain":
        return contain();
      case "cover":
        return scaledObjectSize(safeSourceWidth, safeSourceHeight, Math.max(safeContentWidth / safeSourceWidth, safeContentHeight / safeSourceHeight));
      case "none":
        return { width: safeSourceWidth, height: safeSourceHeight };
      case "scale-down": {
        const contained = contain();
        return contained.width < safeSourceWidth || contained.height < safeSourceHeight ? contained : { width: safeSourceWidth, height: safeSourceHeight };
      }
      case "fill":
      default:
        return { width: safeContentWidth, height: safeContentHeight };
    }
  }
  function scaledObjectSize(width, height, scale) {
    return {
      width: Math.max(1, width * scale),
      height: Math.max(1, height * scale)
    };
  }
  function objectPositionOffset(value, freeX, freeY) {
    const tokens = cssPositionTokens(value);
    const axes = parseObjectPositionAxes(tokens);
    return {
      x: axisPositionOffset(axes.x, freeX),
      y: axisPositionOffset(axes.y, freeY)
    };
  }
  function cssPositionTokens(value) {
    return value.trim().match(/(?:calc\([^)]*\)|[^\s]+)/g) ?? [];
  }
  function parseObjectPositionAxes(tokens) {
    const paired = parseKeywordPositionAxes(tokens);
    if (paired) return paired;
    const [first = "50%", second] = tokens;
    if (isVerticalPositionKeyword(first)) return { x: positionAxis(second || "50%"), y: positionAxis(first) };
    return { x: positionAxis(first), y: positionAxis(second || "50%") };
  }
  function parseKeywordPositionAxes(tokens) {
    let x = null;
    let y = null;
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (isHorizontalPositionKeyword(token)) {
        x = { keyword: token, offset: positionOffsetToken(tokens[index + 1]) };
        continue;
      }
      if (isVerticalPositionKeyword(token)) {
        y = { keyword: token, offset: positionOffsetToken(tokens[index + 1]) };
      }
    }
    return x || y ? { x: x ?? positionAxis("50%"), y: y ?? positionAxis("50%") } : null;
  }
  function positionAxis(token) {
    return positionKeyword(token) ? { keyword: token } : { token };
  }
  function positionOffsetToken(token) {
    return token && !positionKeyword(token) ? token : void 0;
  }
  function axisPositionOffset(axis, freeSpace) {
    const base = axis.keyword ? keywordPositionOffset(axis.keyword, freeSpace) : tokenPositionOffset(axis.token, freeSpace);
    const offset = cssLengthPx(axis.offset);
    if (axis.keyword === "right" || axis.keyword === "bottom") return base - offset;
    return base + offset;
  }
  function keywordPositionOffset(keyword, freeSpace) {
    if (keyword === "right" || keyword === "bottom") return freeSpace;
    if (keyword === "center") return freeSpace / 2;
    return 0;
  }
  function tokenPositionOffset(token, freeSpace) {
    if (!token) return freeSpace / 2;
    if (token.endsWith("%")) return freeSpace * (Number.parseFloat(token) || 0) / 100;
    return cssLengthPx(token);
  }
  function cssLengthPx(value) {
    if (!value) return 0;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function positionKeyword(token) {
    return isHorizontalPositionKeyword(token) || isVerticalPositionKeyword(token) || token === "center";
  }
  function isHorizontalPositionKeyword(token) {
    return token === "left" || token === "right";
  }
  function isVerticalPositionKeyword(token) {
    return token === "top" || token === "bottom";
  }
  function isAbortError(error) {
    return (error instanceof Error || error instanceof DOMException) && error.name === "AbortError";
  }
  function readBlobAsDataUrl(blob, errorMessage = "Could not read media.") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error ?? new Error(errorMessage));
      reader.readAsDataURL(blob);
    });
  }
  function userscriptRequestCandidates() {
    const candidates = [];
    const add = (request, thisArg) => {
      candidates.push({ request, thisArg });
    };
    const direct = directUserscriptGlobals();
    add(direct.GM_xmlhttpRequest, globalThis);
    add(direct.GM?.xmlHttpRequest, direct.GM);
    add(direct.GM?.xmlhttpRequest, direct.GM);
    for (const source of userscriptRequestSources()) {
      add(readSourceProperty(source, "GM_xmlhttpRequest"), source);
      const gm = readSourceProperty(source, "GM");
      add(readSourceProperty(gm, "xmlHttpRequest"), gm);
      add(readSourceProperty(gm, "xmlhttpRequest"), gm);
    }
    return candidates;
  }
  function asUserscriptRequest(value) {
    return typeof value === "function" ? value : void 0;
  }
  function directUserscriptGlobals() {
    return {
      GM_xmlhttpRequest: typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : void 0,
      GM: typeof GM === "object" && GM ? GM : void 0
    };
  }
  function userscriptRequestSources() {
    const sources = [];
    const seen = /* @__PURE__ */ new Set();
    const add = (value) => {
      if (!isRequestSource(value) || seen.has(value)) return;
      seen.add(value);
      sources.push(value);
    };
    for (const mounted of mountedMonkeyWindows()) add(mounted);
    add(globalThis);
    if (typeof window !== "undefined") add(window);
    return sources;
  }
  function mountedMonkeyWindows() {
    if (typeof document === "undefined") return [];
    return Object.getOwnPropertyNames(document).filter((key) => key.startsWith("__monkeyWindow-")).map((key) => readSourceProperty(document, key)).filter(isRequestSource);
  }
  function isRequestSource(value) {
    return Boolean(value) && (typeof value === "object" || typeof value === "function");
  }
  function readSourceProperty(source, key) {
    if (!isRequestSource(source)) return void 0;
    try {
      return source[key];
    } catch {
      return void 0;
    }
  }
  const BRIDGE_REQUEST_EVENT = "yomu-userscript-http-request";
  const BRIDGE_RESPONSE_EVENT = "yomu-userscript-http-response";
  const BRIDGE_MARKER = "yomuUserscriptHttpBridge";
  const BRIDGE_TIMEOUT_MS = 3e4;
  function getUserscriptHttpRequest() {
    for (const candidate of userscriptRequestCandidates()) {
      const request = asUserscriptRequest(candidate.request);
      if (request) {
        return request.bind(candidate.thisArg);
      }
    }
    return userscriptHttpEventBridge();
  }
  const EVENT_BRIDGE_TAG = Symbol.for("yomu.userscriptEventBridge");
  function userscriptHttpEventBridge() {
    if (typeof window === "undefined" || typeof document === "undefined") return void 0;
    if (bridgeMarkerDataset()?.[BRIDGE_MARKER] !== "true") return void 0;
    return tagEventBridgeRequest((options) => new Promise((resolve, reject) => {
      const id = `yomu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      const timeout = window.setTimeout(() => {
        cleanup();
        options.ontimeout?.();
        reject(new Error("Request timed out."));
      }, options.timeout ?? BRIDGE_TIMEOUT_MS);
      let cleanupBridgeResponseListener = noop;
      const cleanup = () => {
        window.clearTimeout(timeout);
        cleanupBridgeResponseListener();
      };
      const onResponse = (event) => {
        handleBridgeResponseEvent(event, id, options, cleanup, resolve, reject);
      };
      cleanupBridgeResponseListener = addBridgeEventListener(BRIDGE_RESPONSE_EVENT, onResponse);
      const { onload: _onload, onerror: _onerror, ontimeout: _ontimeout, ...requestOptions } = options;
      dispatchBridgeEvent(BRIDGE_REQUEST_EVENT, { id, options: requestOptions });
    }));
  }
  function tagEventBridgeRequest(request) {
    request[EVENT_BRIDGE_TAG] = true;
    return request;
  }
  function handleBridgeResponseEvent(event, id, options, cleanup, resolve, reject) {
    const detail = bridgeResponseEventDetail(event);
    if (!detail || detail.id !== id) return;
    cleanup();
    if (detail.kind === "load" && detail.response) {
      options.onload?.(detail.response);
      resolve(detail.response);
      return;
    }
    rejectBridgeResponse(detail, options, reject);
  }
  function rejectBridgeResponse(detail, options, reject) {
    const message = detail.message || "Request failed.";
    if (detail.kind === "timeout") options.ontimeout?.();
    else options.onerror?.(new Error(message));
    reject(new Error(message));
  }
  function addBridgeEventListener(type, listener) {
    const cleanups = [];
    if (addWindowEventListener(type, listener)) {
      cleanups.push(() => removeWindowEventListener(type, listener));
    }
    const documentTarget = bridgeDocumentTarget();
    if (documentTarget && callAddEventListener(documentTarget, type, listener)) {
      cleanups.push(() => callRemoveEventListener(documentTarget, type, listener));
    }
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }
  function dispatchBridgeEvent(type, detail) {
    const eventDetail = bridgeEventDetail(detail);
    let dispatched = dispatchWindowEvent(createWindowCustomEvent(type, eventDetail));
    const documentTarget = bridgeDocumentTarget();
    if (documentTarget) {
      dispatched = callDispatchEvent(documentTarget, createWindowCustomEvent(type, eventDetail)) || dispatched;
    }
    return dispatched;
  }
  function bridgeDocumentTarget() {
    if (typeof document === "undefined") return void 0;
    return document.documentElement instanceof HTMLElement ? document.documentElement : void 0;
  }
  function bridgeMarkerDataset() {
    if (typeof document === "undefined") return void 0;
    const root = document.documentElement;
    return root?.dataset;
  }
  function callAddEventListener(target, type, listener) {
    try {
      target.addEventListener(type, listener);
      return true;
    } catch {
      return false;
    }
  }
  function callRemoveEventListener(target, type, listener) {
    try {
      target.removeEventListener(type, listener);
    } catch {
    }
  }
  function callDispatchEvent(target, event) {
    try {
      return target.dispatchEvent(event);
    } catch {
      return false;
    }
  }
  function noop() {
  }
  function pushJapaneseOcrLine(lines, text, box) {
    if (!text || !box || !HAS_JAPANESE.test(text)) return;
    lines.push({ text, box, vertical: isVerticalOcrBox(box, text.length) });
  }
  function isVerticalOcrBox(box, textLength) {
    if (textLength <= 1) return false;
    const aspect = box.height / Math.max(1, box.width);
    return aspect >= (textLength >= 4 ? 1.05 : 1.2);
  }
  function clampBox(box, width, height) {
    const left = Math.max(0, Math.min(width, box.left));
    const top = Math.max(0, Math.min(height, box.top));
    const right = Math.max(left, Math.min(width, box.left + Math.max(0, box.width)));
    const bottom = Math.max(top, Math.min(height, box.top + Math.max(0, box.height)));
    if (right - left < 2 || bottom - top < 2) return null;
    return { left, top, width: right - left, height: bottom - top };
  }
  function unionBoxes(boxes) {
    if (!boxes.length) return null;
    const left = Math.min(...boxes.map((box) => box.left));
    const top = Math.min(...boxes.map((box) => box.top));
    const right = Math.max(...boxes.map((box) => box.left + box.width));
    const bottom = Math.max(...boxes.map((box) => box.top + box.height));
    return { left, top, width: right - left, height: bottom - top };
  }
  const JAPANESE_INTERNAL_SPACE = /(?<=[、-〿぀-ヿ㐀-鿿！-｠])[ \t]+(?=[、-〿぀-ヿ㐀-鿿！-｠])/g;
  function cleanOcrText(value) {
    const text = typeof value === "string" ? value : String(value ?? "");
    const collapsed = text.replace(/[ \t\r\n]+/g, " ").trim();
    const normalized = HAS_JAPANESE.test(collapsed) ? collapsed.replace(JAPANESE_INTERNAL_SPACE, "") : collapsed;
    return normalized.replaceAll("．．．", "…");
  }
  function numberFrom(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  function normalizeCloudVisionResponse(record, fallbackWidth, fallbackHeight) {
    const state2 = { width: fallbackWidth, height: fallbackHeight, lines: [] };
    for (const response of cloudVisionResponses(record)) {
      appendCloudVisionPages(response, state2);
      appendCloudVisionTextAnnotations(response, state2);
    }
    return state2.lines.length ? { width: state2.width, height: state2.height, lines: state2.lines } : null;
  }
  function cloudVisionResponses(record) {
    if (Array.isArray(record.responses)) return record.responses;
    return "fullTextAnnotation" in record ? [record] : [];
  }
  function appendCloudVisionPages(response, state2) {
    const annotation = response?.fullTextAnnotation;
    const pages = Array.isArray(annotation?.pages) ? annotation.pages : [];
    for (const page of pages) appendCloudVisionPage(page, state2);
  }
  function appendCloudVisionPage(page, state2) {
    state2.width = numberFrom(page.width) || state2.width;
    state2.height = numberFrom(page.height) || state2.height;
    for (const block of cloudVisionPageBlocks(page)) {
      for (const paragraph of cloudVisionBlockParagraphs(block)) {
        pushCloudVisionParagraphLines(paragraph, state2.lines, state2.width, state2.height);
      }
    }
  }
  function cloudVisionPageBlocks(page) {
    return Array.isArray(page.blocks) ? page.blocks : [];
  }
  function cloudVisionBlockParagraphs(block) {
    const paragraphs = block?.paragraphs;
    return Array.isArray(paragraphs) ? paragraphs : [];
  }
  function appendCloudVisionTextAnnotations(response, state2) {
    const annotations = Array.isArray(response?.textAnnotations) ? response.textAnnotations : [];
    if (state2.lines.length || annotations.length <= 1) return;
    for (const annotationItem of annotations.slice(1)) {
      const item = annotationItem;
      const text = cleanOcrText(item.description);
      const box = normalizeCloudVisionVertices(item.boundingPoly?.vertices, state2.width, state2.height);
      pushJapaneseOcrLine(state2.lines, text, box);
    }
  }
  function pushCloudVisionParagraphLines(paragraph, lines, width, height) {
    const words = Array.isArray(paragraph.words) ? paragraph.words : [];
    const current = { text: "", boxes: [] };
    for (const word of words) {
      cloudVisionWordSymbols(word).forEach((symbol) => appendCloudVisionSymbol(symbol, current, lines, width, height));
    }
    pushCloudVisionLine(lines, current);
  }
  function cloudVisionWordSymbols(word) {
    const symbols = word?.symbols;
    return Array.isArray(symbols) ? symbols : [];
  }
  function appendCloudVisionSymbol(symbol, current, lines, width, height) {
    const symbolRecord = symbol;
    current.text += String(symbolRecord.text ?? "");
    const box = normalizeCloudVisionVertices(symbolRecord.boundingBox?.vertices, width, height);
    if (box) current.boxes.push(box);
    const breakType = cloudVisionSymbolBreakType(symbolRecord);
    if (cloudVisionBreakAddsSpace(breakType)) current.text += " ";
    if (cloudVisionBreakEndsLine(breakType)) pushCloudVisionLine(lines, current);
  }
  function cloudVisionSymbolBreakType(symbol) {
    return symbol.property?.detectedBreak?.type;
  }
  function cloudVisionBreakAddsSpace(breakType) {
    return breakType === "SPACE" || breakType === "SURE_SPACE" || breakType === "UNKNOWN";
  }
  function cloudVisionBreakEndsLine(breakType) {
    return breakType === "LINE_BREAK" || breakType === "EOL_SURE_SPACE" || breakType === "HYPHEN";
  }
  function pushCloudVisionLine(lines, current) {
    pushJapaneseOcrLine(lines, cleanOcrText(current.text), unionBoxes(current.boxes));
    current.text = "";
    current.boxes = [];
  }
  function normalizeCloudVisionVertices(value, width, height) {
    if (!Array.isArray(value) || value.length < 2) return null;
    const xs = value.map((vertex) => numberFrom(vertex?.x) ?? 0);
    const ys = value.map((vertex) => numberFrom(vertex?.y) ?? 0);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return clampBox({ left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top }, width, height);
  }
  const SIMPLE_JS_ESCAPE_SEQUENCES = /* @__PURE__ */ new Map([
    ["n", "\n"],
    ["r", "\r"],
    ["t", "	"],
    ["b", "\b"],
    ["f", "\f"],
    ["v", "\v"],
    ["0", "\0"],
    ["\n", ""]
  ]);
  function googleLensUploadCallbackLiteral(html, key) {
    const marker = "AF_initDataCallback(";
    let searchIndex = 0;
    while (searchIndex < html.length) {
      const markerIndex = html.indexOf(marker, searchIndex);
      if (markerIndex < 0) return null;
      const literalStart = markerIndex + marker.length;
      const literal = readBalancedLiteral(html, literalStart);
      if (literal && callbackLiteralHasKey(literal, key)) return literal;
      searchIndex = literalStart + Math.max(1, literal?.length ?? 1);
    }
    return null;
  }
  function callbackLiteralHasKey(literal, key) {
    return new RegExp(`\\bkey\\s*:\\s*['"]${escapeRegex(key)}['"]`).test(literal);
  }
  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function readBalancedLiteral(source, startIndex) {
    const index = balancedLiteralStart(source, startIndex);
    if (index < 0) return null;
    const end = balancedLiteralEnd(source, index);
    return end >= 0 ? source.slice(index, end + 1) : null;
  }
  function balancedLiteralStart(source, startIndex) {
    let index = startIndex;
    while (/\s/.test(source[index] ?? "")) index += 1;
    return source[index] === "{" ? index : -1;
  }
  function balancedLiteralEnd(source, startIndex) {
    let depth = 0;
    for (let current = startIndex; current < source.length; current += 1) {
      const char = source[current];
      if (isQuote(char)) {
        current = quotedLiteralEnd(source, current, char);
        if (current < 0) return -1;
        continue;
      }
      depth += balancedDepthDelta(char);
      if (depth === 0) return current;
    }
    return -1;
  }
  function quotedLiteralEnd(source, startIndex, quote) {
    for (let current = startIndex + 1; current < source.length; current += 1) {
      const char = source[current];
      if (char === "\\") {
        current += 1;
      } else if (char === quote) {
        return current;
      }
    }
    return -1;
  }
  function isQuote(char) {
    return char === '"' || char === "'";
  }
  function balancedDepthDelta(char) {
    if (char === "{" || char === "[" || char === "(") return 1;
    if (char === "}" || char === "]" || char === ")") return -1;
    return 0;
  }
  function parseJsDataLiteral(source) {
    let index = 0;
    const value = parseValue();
    skipWhitespace();
    if (index !== source.length) throw new Error("Unexpected trailing data.");
    return value;
    function parseValue() {
      skipWhitespace();
      const char = source[index];
      if (char === "{") return parseObject();
      if (char === "[") return parseArray();
      if (char === '"' || char === "'") return parseString();
      if (char === "-" || /\d/.test(char ?? "")) return parseNumber();
      return parseIdentifierValue();
    }
    function parseObject() {
      const record = {};
      index += 1;
      skipWhitespace();
      while (source[index] !== "}") {
        const key = parseObjectKey();
        skipWhitespace();
        expect(":");
        record[key] = parseValue();
        skipWhitespace();
        if (source[index] === ",") {
          index += 1;
          skipWhitespace();
          continue;
        }
        break;
      }
      expect("}");
      return record;
    }
    function parseObjectKey() {
      skipWhitespace();
      const char = source[index];
      if (char === '"' || char === "'") return parseString();
      return parseIdentifier();
    }
    function parseArray() {
      const values = [];
      index += 1;
      skipWhitespace();
      while (source[index] !== "]") {
        if (source[index] === ",") {
          values.push(null);
          index += 1;
          skipWhitespace();
          continue;
        }
        values.push(parseValue());
        skipWhitespace();
        if (source[index] === ",") {
          index += 1;
          skipWhitespace();
          continue;
        }
        break;
      }
      expect("]");
      return values;
    }
    function parseString() {
      const quote = source[index];
      let value2 = "";
      index += 1;
      while (index < source.length) {
        const char = source[index++];
        if (char === quote) return value2;
        if (char !== "\\") {
          value2 += char;
          continue;
        }
        value2 += parseEscapeSequence();
      }
      throw new Error("Unterminated string.");
    }
    function parseEscapeSequence() {
      const escaped = source[index++];
      const simpleEscape = SIMPLE_JS_ESCAPE_SEQUENCES.get(escaped ?? "");
      if (typeof simpleEscape === "string") return simpleEscape;
      if (escaped === "\r") return parseCarriageReturnEscape();
      return parseNamedEscapeSequence(escaped);
    }
    function parseCarriageReturnEscape() {
      if (source[index] === "\n") index += 1;
      return "";
    }
    function parseNamedEscapeSequence(escaped) {
      if (escaped === "x") return codePointEscape(2);
      if (escaped === "u") return parseUnicodeEscape();
      return escaped ?? "";
    }
    function parseUnicodeEscape() {
      if (source[index] === "{") {
        const end = source.indexOf("}", index + 1);
        if (end < 0) throw new Error("Invalid unicode escape.");
        const value2 = Number.parseInt(source.slice(index + 1, end), 16);
        index = end + 1;
        return Number.isFinite(value2) ? String.fromCodePoint(value2) : "";
      }
      return codePointEscape(4);
    }
    function codePointEscape(length) {
      const hex = source.slice(index, index + length);
      if (!new RegExp(`^[0-9a-fA-F]{${length}}$`).test(hex)) throw new Error("Invalid character escape.");
      index += length;
      return String.fromCharCode(Number.parseInt(hex, 16));
    }
    function parseNumber() {
      const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(index));
      if (!match) throw new Error("Invalid number.");
      index += match[0].length;
      return Number(match[0]);
    }
    function parseIdentifierValue() {
      const identifier = parseIdentifier();
      if (identifier === "null" || identifier === "undefined" || identifier === "NaN") return null;
      if (identifier === "true") return true;
      if (identifier === "false") return false;
      if (identifier === "Infinity") return Infinity;
      return identifier;
    }
    function parseIdentifier() {
      const match = /^[A-Za-z_$][\w$]*/.exec(source.slice(index));
      if (!match) throw new Error("Expected identifier.");
      index += match[0].length;
      return match[0];
    }
    function skipWhitespace() {
      while (/\s/.test(source[index] ?? "")) index += 1;
    }
    function expect(char) {
      if (source[index] !== char) throw new Error(`Expected ${char}.`);
      index += 1;
    }
  }
  const LENS_WRITING_TOP_TO_BOTTOM = 2;
  const OCR_KANA_ONLY_RE = /^[\u3040-\u30ffー・]+$/u;
  const OCR_KANJI_RE = /[\u3400-\u9fff々〆]/u;
  function normalizeOcrResult(value, fallbackWidth = 1, fallbackHeight = 1) {
    if (!value || typeof value !== "object") return null;
    const record = value;
    const cloudVision = normalizeCloudVisionResponse(record, fallbackWidth, fallbackHeight);
    if (cloudVision) return cloudVision;
    const { width, height } = ocrResultDimensions(record, fallbackWidth, fallbackHeight);
    const lines = collectGenericOcrLines(record, width, height);
    return japaneseOcrResult(width, height, lines);
  }
  function ocrResultDimensions(record, fallbackWidth, fallbackHeight) {
    const resolution = record.context_resolution;
    const width = numberFrom(record.width) || numberFrom(resolution?.width) || fallbackWidth;
    const height = numberFrom(record.height) || numberFrom(resolution?.height) || fallbackHeight;
    return { width, height };
  }
  function collectGenericOcrLines(record, width, height) {
    const lines = [];
    appendGenericOcrLines(lines, genericRawLines(record), width, height, normalizeSimpleLines);
    appendGenericOcrLines(lines, record.results, width, height, normalizeStructuredOcrResults);
    appendGenericOcrLines(lines, record.ocr_regions, width, height, normalizeOcrRegionResults);
    return lines;
  }
  function genericRawLines(record) {
    return Array.isArray(record.lines) ? record.lines : record.regions;
  }
  function appendGenericOcrLines(lines, value, width, height, normalize) {
    if (Array.isArray(value)) lines.push(...normalize(value, width, height));
  }
  function normalizeSimpleLines(values, width, height) {
    return values.map((item) => normalizeSimpleLine(item, width, height)).filter((line) => Boolean(line));
  }
  function normalizeStructuredOcrResults(values, width, height) {
    return values.flatMap((item) => normalizeStructuredOcrResult(item, width, height));
  }
  function normalizeOcrRegionResults(regions, width, height) {
    return regions.flatMap((region) => normalizeSingleOcrRegionResults(region, width, height));
  }
  function normalizeSingleOcrRegionResults(region, width, height) {
    const regionRecord = asRecord(region);
    if (!regionRecord) return [];
    const regionBox = normalizeOcrRegion(regionRecord, width, height);
    const { scaleWidth, scaleHeight } = ocrRegionScale(regionBox, width, height);
    if (!Array.isArray(regionRecord.results)) return [];
    const lines = normalizeStructuredOcrResults(regionRecord.results, scaleWidth, scaleHeight);
    return offsetRegionLines(lines, regionBox, width, height);
  }
  function ocrRegionScale(regionBox, width, height) {
    return {
      scaleWidth: regionBox?.width ?? width,
      scaleHeight: regionBox?.height ?? height
    };
  }
  function offsetRegionLines(lines, regionBox, width, height) {
    if (!regionBox) return lines;
    return lines.map((line) => offsetLineToRegion(line, regionBox, width, height)).filter((line) => Boolean(line));
  }
  function japaneseOcrResult(width, height, lines) {
    const japaneseLines = removeStandaloneFuriganaLines(lines).filter((line) => line.text.length > 0 && HAS_JAPANESE.test(line.text));
    return japaneseLines.length ? { width, height, lines: japaneseLines } : null;
  }
  function cleanOcrLookupLines(lines, parsed) {
    const cleaned = lines.map((line, index) => {
      const text = cleanOcrLookupText(line.text, parsed[index] ?? []);
      return text === line.text ? line : { ...line, text };
    });
    return removeStandaloneFuriganaLines(cleaned);
  }
  function ocrLinesChanged(original, cleaned) {
    return original.length !== cleaned.length || cleaned.some((line, index) => line.text !== original[index]?.text);
  }
  function cleanOcrLookupText(text, tokens) {
    const rubies = tokens.flatMap((token) => token.rubies.map((ruby) => ({ ruby, token }))).sort((a, b) => b.ruby.start - a.ruby.start);
    let cleaned = text;
    for (const { ruby } of rubies) {
      if (!OCR_KANJI_RE.test(cleaned.slice(ruby.start, ruby.end))) continue;
      cleaned = removeOcrReadingAroundRuby(cleaned, ruby.text, ruby.start, ruby.end);
    }
    return cleanOcrText(cleaned);
  }
  function removeOcrReadingAroundRuby(text, reading, start, end) {
    const cleanReading = cleanOcrText(reading);
    if (!cleanReading) return text;
    if (text.slice(Math.max(0, start - cleanReading.length), start) === cleanReading) {
      return text.slice(0, start - cleanReading.length) + text.slice(start);
    }
    if (text.slice(end, end + cleanReading.length) === cleanReading) {
      return text.slice(0, end) + text.slice(end + cleanReading.length);
    }
    return text;
  }
  function removeStandaloneFuriganaLines(lines) {
    const filtered = lines.filter((line, index) => !isStandaloneFuriganaLine(line, lines, index));
    return filtered.length ? filtered : lines;
  }
  function isStandaloneFuriganaLine(line, lines, index) {
    const text = cleanOcrText(line.text).replace(/\s+/g, "");
    if (!text || text.length > 10 || !OCR_KANA_ONLY_RE.test(text)) return false;
    return lines.some((other, otherIndex) => otherIndex !== index && OCR_KANJI_RE.test(other.text) && ocrLineLooksLikeFuriganaFor(line, other));
  }
  function ocrLineLooksLikeFuriganaFor(furi, base) {
    if (furi.vertical || base.vertical) return ocrLineLooksLikeVerticalFuriganaFor(furi, base);
    const overlap = horizontalOverlap(furi.box, base.box);
    const overlapRatio = overlap / Math.max(1, Math.min(furi.box.width, base.box.width));
    const smaller = furi.box.height <= base.box.height * 0.75;
    const nearTop = furi.box.top <= base.box.top + base.box.height * 0.5 && furi.box.top + furi.box.height >= base.box.top - Math.max(base.box.height * 0.45, furi.box.height * 3);
    return overlapRatio >= 0.32 && smaller && nearTop;
  }
  function horizontalOverlap(a, b) {
    return Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  }
  function ocrLineLooksLikeVerticalFuriganaFor(furi, base) {
    if (!furi.vertical || !base.vertical) return false;
    const overlap = verticalOverlap(furi.box, base.box);
    const overlapRatio = overlap / Math.max(1, Math.min(furi.box.height, base.box.height));
    const smaller = furi.box.width <= base.box.width * 0.75;
    const nearSide = horizontalGap(furi.box, base.box) <= Math.max(base.box.width * 0.75, furi.box.width * 2);
    return overlapRatio >= 0.32 && smaller && nearSide;
  }
  function verticalOverlap(a, b) {
    return Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  }
  function horizontalGap(a, b) {
    if (a.left + a.width < b.left) return b.left - (a.left + a.width);
    if (b.left + b.width < a.left) return a.left - (b.left + b.width);
    return 0;
  }
  function parseGoogleLensResponse(bytes, width, height) {
    const root = decodeProtoMessage(bytes);
    const objectsResponse = protoFirstMessage(root, 2);
    const text = objectsResponse ? protoFirstMessage(objectsResponse, 3) : null;
    const layout = text ? protoFirstMessage(text, 1) : null;
    if (!layout) return null;
    const lines = protoMessages(layout, 1).flatMap((paragraph) => googleLensParagraphLines(paragraph, width, height));
    return lines.length ? { width, height, lines } : null;
  }
  function googleLensParagraphLines(paragraph, width, height) {
    const vertical = protoNumber(paragraph, 4) === LENS_WRITING_TOP_TO_BOTTOM;
    const paragraphBox = protoBox(protoFirstMessage(paragraph, 3), width, height);
    return protoMessages(paragraph, 2).map((line) => googleLensLine(line, vertical, paragraphBox, width, height)).filter((line) => Boolean(line));
  }
  function googleLensLine(line, paragraphVertical, paragraphBox, width, height) {
    const lineBox = protoBox(protoFirstMessage(line, 2), width, height);
    const words = googleLensWords(line, width, height);
    const text = googleLensLineText(words, paragraphVertical);
    if (!text || !HAS_JAPANESE.test(text)) return null;
    const box = googleLensLineBox(lineBox, words, paragraphBox);
    if (!box) return null;
    return {
      text,
      box,
      vertical: paragraphVertical || isVerticalOcrBox(box, text.length)
    };
  }
  function googleLensWords(line, width, height) {
    return protoMessages(line, 1).map((word) => ({
      text: protoString(word, 2),
      separator: protoString(word, 3),
      box: protoBox(protoFirstMessage(word, 4), width, height)
    })).filter((word) => Boolean(word.text));
  }
  function googleLensLineText(words, paragraphVertical) {
    const orderedWords = paragraphVertical ? words : [...words].sort((a, b) => (a.box?.left ?? 0) - (b.box?.left ?? 0));
    return cleanOcrText(orderedWords.map(googleLensWordText).join(""));
  }
  function googleLensWordText(word, index, words) {
    return word.text + (word.separator || (index < words.length - 1 ? " " : ""));
  }
  function googleLensLineBox(lineBox, words, paragraphBox) {
    return lineBox ?? unionBoxes(words.map((word) => word.box).filter((item) => Boolean(item))) ?? paragraphBox;
  }
  function parseGoogleLensUploadHtml(html, width, height) {
    const literal = googleLensUploadCallbackLiteral(html, "ds:1");
    if (!literal) return null;
    try {
      const callback = parseJsDataLiteral(literal);
      const lines = [];
      for (const item of googleLensUploadLineItems(callback.data)) {
        const { text, box } = googleLensUploadLine(item, width, height);
        pushJapaneseOcrLine(lines, text, box);
      }
      return lines.length ? { width, height, lines } : null;
    } catch {
      return null;
    }
  }
  function googleLensUploadLineItems(data) {
    return googleLensUploadBlocks(data).flatMap((block) => googleLensUploadBlockLineItems(block));
  }
  function googleLensUploadBlocks(data) {
    const blocks = data?.[2]?.[3]?.[0] ?? [];
    return Array.isArray(blocks) ? blocks : [];
  }
  function googleLensUploadBlockLineItems(block) {
    const blockData = Array.isArray(block) ? block : [];
    const rawLines = blockData[2]?.[0]?.[5]?.[3];
    const lineItems = rawLines?.[0];
    return Array.isArray(lineItems) ? lineItems : [];
  }
  function googleLensUploadLine(item, width, height) {
    const lineData = Array.isArray(item) ? item : [];
    return {
      text: googleLensUploadLineText(lineData[0]),
      box: googleLensUploadLineBox(lineData[1], width, height)
    };
  }
  function googleLensUploadLineText(value) {
    const words = Array.isArray(value) ? value : [];
    return cleanOcrText(words.map(googleLensUploadWordText).join(""));
  }
  function googleLensUploadWordText(word) {
    const wordData = Array.isArray(word) ? word : [];
    return `${wordData[0] ?? ""}${wordData[3] ?? ""}`;
  }
  function googleLensUploadLineBox(value, width, height) {
    const boxData = Array.isArray(value) ? value : [];
    if (boxData.length < 4) return null;
    return clampBox({
      top: Number(boxData[0]) * height,
      left: Number(boxData[1]) * width,
      width: Number(boxData[2]) * width,
      height: Number(boxData[3]) * height
    }, width, height);
  }
  function normalizeSimpleLine(value, width, height) {
    const record = asRecord(value);
    if (!record) return null;
    const text = simpleLineText(record);
    const box = simpleLineBox(record, width, height);
    if (!text || !box) return null;
    return { text, box, vertical: simpleLineIsVertical(record) };
  }
  function simpleLineText(record) {
    return stringFrom(record.text) || stringFrom(record.content) || stringFrom(record.sentence);
  }
  function simpleLineBox(record, width, height) {
    return normalizeBox(record.box ?? record.boundingBox ?? record, width, height);
  }
  function simpleLineIsVertical(record) {
    return Boolean(record.vertical ?? record.is_vertical);
  }
  function normalizeStructuredOcrResult(value, width, height) {
    if (!value || typeof value !== "object") return [];
    const record = value;
    const textLines = structuredOcrTextLines(record);
    const vertical = structuredOcrVertical(record);
    const lines = textLines.map((item) => normalizeStructuredOcrLine(item, width, height, vertical)).filter((line) => line !== null);
    if (lines.length) return lines;
    return normalizeStructuredOcrFallback(record, textLines, width, height, vertical);
  }
  function structuredOcrTextLines(record) {
    if (Array.isArray(record.text_lines)) return record.text_lines;
    return Array.isArray(record.text) ? record.text : [];
  }
  function structuredOcrVertical(record) {
    return Boolean(record.is_vertical ?? record.box?.isVertical);
  }
  function normalizeStructuredOcrLine(item, width, height, inheritedVertical) {
    const lineRecord = asRecord(item);
    if (!lineRecord) return null;
    const text = structuredOcrLineText(lineRecord);
    const box = structuredOcrLineBox(lineRecord, width, height);
    if (!text || !box) return null;
    return { text, box, vertical: structuredOcrLineVertical(lineRecord, inheritedVertical) };
  }
  function structuredOcrLineText(record) {
    return stringFrom(record.content ?? record.text ?? record.word);
  }
  function structuredOcrLineBox(record, width, height) {
    return normalizeBox(record.box ?? record.boundingBox ?? record, width, height);
  }
  function structuredOcrLineVertical(record, inheritedVertical) {
    return Boolean(record.is_vertical ?? record.box?.isVertical ?? inheritedVertical);
  }
  function normalizeStructuredOcrFallback(record, textLines, width, height, vertical) {
    const text = textLines.map((item) => stringFrom(item?.content)).filter(Boolean).join("");
    const box = normalizeBox(record.box, width, height);
    return text && box ? [{ text, box, vertical }] : [];
  }
  function normalizeOcrRegion(record, width, height) {
    const region = readOcrRegion(record);
    if (!region) return null;
    const box = clampBox(scaleOcrRegion(region, width, height), width, height);
    return box && !isFullImageOcrRegion(box, width, height) ? box : null;
  }
  function readOcrRegion(record) {
    const position = record.position;
    const size = record.size;
    if (!position || !size) return null;
    return completeOcrRegionParts({
      left: numberFrom(position.left),
      top: numberFrom(position.top),
      width: numberFrom(size.width),
      height: numberFrom(size.height)
    });
  }
  function completeOcrRegionParts(parts) {
    if (parts.left === null) return null;
    if (parts.top === null) return null;
    if (parts.width === null) return null;
    if (parts.height === null) return null;
    return { left: parts.left, top: parts.top, width: parts.width, height: parts.height };
  }
  function scaleOcrRegion(region, width, height) {
    const divisor = Math.max(region.left, region.top, region.width, region.height) <= 1 ? 1 : 100;
    return {
      left: region.left / divisor * width,
      top: region.top / divisor * height,
      width: region.width / divisor * width,
      height: region.height / divisor * height
    };
  }
  function isFullImageOcrRegion(box, width, height) {
    return box.left <= 1 && box.top <= 1 && box.width >= width - 2 && box.height >= height - 2;
  }
  function offsetLineToRegion(line, region, width, height) {
    const box = clampBox({
      left: region.left + line.box.left,
      top: region.top + line.box.top,
      width: line.box.width,
      height: line.box.height
    }, width, height);
    return box ? { ...line, box } : null;
  }
  function normalizeBox(value, width, height) {
    if (!value || typeof value !== "object") return null;
    const record = value;
    return normalizePositionDimensionsBox(record, width, height) ?? normalizeDirectBox(record, width, height) ?? normalizePointBox(record, width, height);
  }
  function normalizePositionDimensionsBox(record, width, height) {
    const position = asRecord(record.position);
    const dimensions = asRecord(record.dimensions);
    if (!position || !dimensions) return null;
    return boxFromNumbers({
      left: numberFrom(position.left),
      top: numberFrom(position.top),
      width: numberFrom(dimensions.width),
      height: numberFrom(dimensions.height)
    }, width, height, "percent-100");
  }
  function normalizeDirectBox(record, width, height) {
    const box = directBoxNumbers(record);
    return boxFromNumbers(box, width, height, directBoxScale(box));
  }
  function directBoxNumbers(record) {
    return {
      left: numberFrom(record.left ?? record.x),
      top: numberFrom(record.top ?? record.y),
      width: numberFrom(record.width ?? record.w),
      height: numberFrom(record.height ?? record.h)
    };
  }
  function directBoxScale(box) {
    return Object.values(box).every((value) => value !== null && value <= 1) ? "fraction" : "pixels";
  }
  function normalizePointBox(record, width, height) {
    const points = ["top_left", "top_right", "bottom_right", "bottom_left"].map((key) => asRecord(record[key])).filter((point) => Boolean(point));
    if (points.length < 2) return null;
    const xs = points.map((point) => numberFrom(point?.x)).filter((item) => item !== null);
    const ys = points.map((point) => numberFrom(point?.y)).filter((item) => item !== null);
    if (!xs.length || !ys.length) return null;
    const percent = coordinatesAreFractional(xs, ys);
    const scaledXs = scaleCoordinates(xs, width, percent);
    const scaledYs = scaleCoordinates(ys, height, percent);
    const left = Math.min(...scaledXs);
    const top = Math.min(...scaledYs);
    return clampBox({ left, top, width: Math.max(...scaledXs) - left, height: Math.max(...scaledYs) - top }, width, height);
  }
  function coordinatesAreFractional(xs, ys) {
    return xs.every(isFractionalCoordinate) && ys.every(isFractionalCoordinate);
  }
  function isFractionalCoordinate(value) {
    return value >= 0 && value <= 1;
  }
  function scaleCoordinates(values, scale, enabled) {
    return enabled ? values.map((value) => value * scale) : values;
  }
  function boxFromNumbers(box, imageWidth, imageHeight, scale) {
    if (!hasCompleteBoxNumbers(box)) return null;
    const scaleInfo = boxScaleInfo(scale);
    return clampBox({
      left: scaleBoxNumber(box.left, imageWidth, scaleInfo),
      top: scaleBoxNumber(box.top, imageHeight, scaleInfo),
      width: scaleBoxNumber(box.width, imageWidth, scaleInfo),
      height: scaleBoxNumber(box.height, imageHeight, scaleInfo)
    }, imageWidth, imageHeight);
  }
  function hasCompleteBoxNumbers(box) {
    return box.left !== null && box.top !== null && box.width !== null && box.height !== null;
  }
  function boxScaleInfo(scale) {
    return {
      fractional: scale !== "pixels",
      factor: scale === "percent-100" ? 100 : 1
    };
  }
  function scaleBoxNumber(value, dimension, scale) {
    return scale.fractional ? value / scale.factor * dimension : value;
  }
  function decodeProtoMessage(bytes) {
    const fields = [];
    let offset = 0;
    while (offset < bytes.length) {
      const [tag, nextOffset] = readVarint(bytes, offset);
      offset = nextOffset;
      const field = Number(tag >> 3n);
      const wire = Number(tag & 7n);
      if (!field) break;
      if (wire === 0) {
        const [value, afterValue] = readVarint(bytes, offset);
        offset = afterValue;
        fields.push({ field, wire, value });
      } else if (wire === 1) {
        fields.push({ field, wire, value: new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getFloat64(0, true) });
        offset += 8;
      } else if (wire === 2) {
        const [length, afterLength] = readVarint(bytes, offset);
        offset = afterLength;
        const end = offset + Number(length);
        fields.push({ field, wire, value: bytes.slice(offset, end) });
        offset = end;
      } else if (wire === 5) {
        fields.push({ field, wire, value: new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getFloat32(0, true) });
        offset += 4;
      } else {
        break;
      }
    }
    return fields;
  }
  function readVarint(bytes, offset) {
    let shift = 0n;
    let result = 0n;
    while (offset < bytes.length) {
      const byte = bytes[offset++];
      result |= BigInt(byte & 127) << shift;
      if (!(byte & 128)) return [result, offset];
      shift += 7n;
    }
    return [result, offset];
  }
  function protoMessages(fields, field) {
    return fields.filter((item) => item.field === field && item.wire === 2 && item.value instanceof Uint8Array).map((item) => decodeProtoMessage(item.value));
  }
  function protoFirstMessage(fields, field) {
    return protoMessages(fields, field)[0] ?? null;
  }
  function protoString(fields, field) {
    const item = fields.find((value) => value.field === field && value.wire === 2 && value.value instanceof Uint8Array);
    return item ? new TextDecoder().decode(item.value) : "";
  }
  function protoNumber(fields, field) {
    const item = fields.find((value) => value.field === field);
    if (!item) return 0;
    return typeof item.value === "bigint" ? Number(item.value) : typeof item.value === "number" ? item.value : 0;
  }
  function protoBox(geometry, width, height) {
    const dimensions = protoBoxDimensions(geometry);
    if (!dimensions) return null;
    return clampBox(scaledProtoBox(dimensions, protoBoxIsNormalized(dimensions), width, height), width, height);
  }
  function protoBoxDimensions(geometry) {
    const box = geometry ? protoFirstMessage(geometry, 1) : null;
    if (!box) return null;
    const dimensions = {
      centerX: protoNumber(box, 1),
      centerY: protoNumber(box, 2),
      width: protoNumber(box, 3),
      height: protoNumber(box, 4)
    };
    return dimensions.width && dimensions.height ? dimensions : null;
  }
  function protoBoxIsNormalized(box) {
    return box.centerX <= 2 && box.centerY <= 2 && box.width <= 2 && box.height <= 2;
  }
  function scaledProtoBox(box, normalized, width, height) {
    const scaledWidth = scaledProtoBoxValue(box.width, width, normalized);
    const scaledHeight = scaledProtoBoxValue(box.height, height, normalized);
    return {
      left: scaledProtoBoxValue(box.centerX, width, normalized) - scaledWidth / 2,
      top: scaledProtoBoxValue(box.centerY, height, normalized) - scaledHeight / 2,
      width: scaledWidth,
      height: scaledHeight
    };
  }
  function scaledProtoBoxValue(value, scale, normalized) {
    return normalized ? value * scale : value;
  }
  function stringFrom(value) {
    return typeof value === "string" ? value.replace(/\s+/g, "").trim() : "";
  }
  function asRecord(value) {
    return value && typeof value === "object" ? value : null;
  }
  const LENS_PLATFORM_WEB = 3;
  const LENS_SURFACE_CHROMIUM = 4;
  const LENS_AUTO_FILTER = 7;
  function createGoogleLensRequest(imageBytes, width, height, locale) {
    const [language = "ja", region = "US"] = (locale || "ja-JP").split(/[-_]/);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const requestId = protoMessage(
      protoVarintField(1, BigInt(Date.now()) * 1000000n + BigInt(Math.floor(Math.random() * 1e6))),
      protoVarintField(2, 1),
      protoVarintField(3, 1),
      protoBytesField(4, randomBytes(16))
    );
    const localeContext = protoMessage(
      protoStringField(1, language || "ja"),
      protoStringField(2, region || "US"),
      protoStringField(3, timeZone)
    );
    const clientFilters = protoMessage(protoMessageField(1, protoMessage(protoVarintField(1, LENS_AUTO_FILTER))));
    const clientContext = protoMessage(
      protoVarintField(1, LENS_PLATFORM_WEB),
      protoVarintField(2, LENS_SURFACE_CHROMIUM),
      protoMessageField(4, localeContext),
      protoMessageField(17, clientFilters)
    );
    const requestContext = protoMessage(
      protoMessageField(3, requestId),
      protoMessageField(4, clientContext)
    );
    const imageData = protoMessage(
      protoMessageField(1, protoMessage(protoBytesField(1, imageBytes))),
      protoMessageField(3, protoMessage(protoVarintField(1, width), protoVarintField(2, height)))
    );
    return protoMessage(protoMessageField(1, protoMessage(
      protoMessageField(1, requestContext),
      protoMessageField(3, imageData)
    )));
  }
  function protoMessage(...parts) {
    return concatBytes(parts);
  }
  function protoMessageField(field, value) {
    return concatBytes([protoTag(field, 2), encodeVarint(value.length), value]);
  }
  function protoBytesField(field, value) {
    return protoMessageField(field, value);
  }
  function protoStringField(field, value) {
    return protoBytesField(field, new TextEncoder().encode(value));
  }
  function protoVarintField(field, value) {
    return concatBytes([protoTag(field, 0), encodeVarint(value)]);
  }
  function protoTag(field, wire) {
    return encodeVarint(field << 3 | wire);
  }
  function encodeVarint(value) {
    let item = BigInt(value);
    const bytes = [];
    do {
      let byte = Number(item & 0x7fn);
      item >>= 7n;
      if (item) byte |= 128;
      bytes.push(byte);
    } while (item);
    return new Uint8Array(bytes);
  }
  function concatBytes(parts) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }
  function randomBytes(length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }
  const OCR_MIN_ATTEMPT_TIMEOUT_MS = 3e4;
  const DEFAULT_LOCAL_OCR_ENDPOINT_URL = "http://127.0.0.1:7331/ocr";
  function ocrAttemptTimeoutMs(settings, floorMs = OCR_MIN_ATTEMPT_TIMEOUT_MS) {
    return Math.max(floorMs, settings.audioTimeoutMs);
  }
  function imageCacheKey(image) {
    const contentKey = image.dataset?.ocrContentKey;
    if (contentKey) return contentKey;
    return `${image.currentSrc || image.src}|${image.naturalWidth}x${image.naturalHeight}`;
  }
  function localOcrEndpointUrl(settings) {
    return settings.ocrEndpointUrl.trim() || DEFAULT_LOCAL_OCR_ENDPOINT_URL;
  }
  function isOcrRequestTimeout(error) {
    return error instanceof Error && /timed out|timeout/i.test(error.message);
  }
  const log$1 = Logger.scope("OCR");
  const GOOGLE_LENS_ENDPOINT = "https://lensfrontend-pa.googleapis.com/v1/crupload";
  const GOOGLE_LENS_API_KEY = "AIzaSyDr2UxVnv_U85AbhhY8XSHSIavUW0DC-sY";
  const OCR_RECOGNIZERS = {
    "google-lens": recognizeViaGoogleLens,
    "cloud-vision": recognizeViaCloudVision,
    "local-service": recognizeViaLocalService
  };
  const OCR_PROVIDER_CONFIGURED = {
    "google-lens": () => true,
    "cloud-vision": (settings) => Boolean(settings.ocrCloudVisionApiKey.trim()),
    "local-service": () => true
  };
  async function recognizeViaLocalService(image, settings, invert = false) {
    const payload = await imageToBase64Payload(image, settings.ocrMaxImagePixels, invert);
    const engine = settings.ocrEngine === "auto" ? "" : settings.ocrEngine;
    const body = JSON.stringify({
      id: imageCacheKey(image),
      language_code: settings.ocrLanguage || "ja-JP",
      language: {
        bcp47_tag: settings.ocrLanguage || "ja-JP",
        two_letter_code: (settings.ocrLanguage || "ja").slice(0, 2)
      },
      base64_image: payload.base64,
      image: payload.base64,
      image_bytes: payload.base64,
      ocr_engine: engine,
      ocr_adapter_name: engine,
      detection_only: false
    });
    const response = await requestJson(localOcrEndpointUrl(settings), body, ocrAttemptTimeoutMs(settings));
    return normalizeOcrResult(response, payload.width, payload.height);
  }
  async function recognizeViaCloudVision(image, settings, invert = false) {
    const apiKey = settings.ocrCloudVisionApiKey.trim();
    if (!apiKey) return null;
    const payload = await imageToBase64Payload(image, settings.ocrMaxImagePixels, invert);
    const body = JSON.stringify({
      requests: [{
        image: { content: payload.base64 },
        features: [{ type: "TEXT_DETECTION", maxResults: 50, model: "builtin/latest" }],
        imageContext: { languageHints: [(settings.ocrLanguage || "ja-JP").slice(0, 2)] }
      }]
    });
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`;
    const response = await requestJson(url, body, ocrAttemptTimeoutMs(settings));
    return normalizeOcrResult(response, payload.width, payload.height);
  }
  async function recognizeViaGoogleLens(image, settings, invert = false) {
    const { canvas, blob } = await imageToBlobPayload(image, settings.ocrMaxImagePixels, "image/jpeg", 0.88, invert);
    const deadline = Date.now() + ocrAttemptTimeoutMs(settings);
    let protobufFailure;
    const protobuf = await recognizeViaGoogleLensProtobuf(
      blob,
      canvas,
      settings,
      Math.max(1, remainingGoogleLensTimeout(deadline))
    ).catch((error) => {
      protobufFailure = error;
      log$1.warn("Google Lens protobuf failed", error);
      return void 0;
    });
    if (protobuf?.lines.length) return protobuf;
    const uploadTimeout = remainingGoogleLensTimeout(deadline);
    if (uploadTimeout <= 0) {
      if (protobuf === void 0) throw new Error("Google Lens OCR timed out.");
      return protobuf;
    }
    let uploadFailure;
    const upload = await recognizeViaGoogleLensUpload(blob, canvas.width, canvas.height, uploadTimeout).catch((error) => {
      uploadFailure = error;
      log$1.warn("Google Lens upload failed", error);
      return void 0;
    });
    if (upload === void 0 && isOcrRequestTimeout(uploadFailure)) {
      throw new Error("Google Lens OCR timed out.");
    }
    if (protobuf === void 0 && upload === void 0) {
      if (isOcrRequestTimeout(protobufFailure) || isOcrRequestTimeout(uploadFailure)) {
        throw new Error("Google Lens OCR timed out.");
      }
      throw new Error("Google Lens OCR failed.");
    }
    return upload?.lines.length ? upload : upload ?? protobuf ?? null;
  }
  function remainingGoogleLensTimeout(deadline) {
    return Math.max(0, deadline - Date.now());
  }
  async function recognizeViaGoogleLensProtobuf(blob, canvas, settings, timeout) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const body = createGoogleLensRequest(bytes, canvas.width, canvas.height, settings.ocrLanguage);
    const response = await requestArrayBuffer(GOOGLE_LENS_ENDPOINT, body, timeout);
    return parseGoogleLensResponse(new Uint8Array(response), canvas.width, canvas.height);
  }
  function ocrRecognizer(settings) {
    const recognizer = OCR_RECOGNIZERS[settings.ocrProvider] ?? null;
    return recognizer && isOcrProviderConfigured(settings) ? recognizer : null;
  }
  function isOcrProviderConfigured(settings) {
    return OCR_PROVIDER_CONFIGURED[settings.ocrProvider]?.(settings) ?? false;
  }
  async function imageToBase64Payload(image, maxPixels, invertDark = false) {
    const { canvas, blob } = await imageToBlobPayload(image, maxPixels, "image/jpeg", 0.86, invertDark);
    return { base64: (await readBlobAsDataUrl(blob, "Blob read failed.")).split(",")[1] ?? "", width: canvas.width, height: canvas.height };
  }
  async function imageToBlobPayload(image, maxPixels, type, quality, invertDark = false) {
    const canvas = await imageToCanvas(image, maxPixels, invertDark);
    try {
      return { canvas, blob: await canvasToBlob(canvas, type, quality) };
    } catch {
      const fallbackCanvas = await imageBlobToCanvas(image, maxPixels, invertDark);
      return { canvas: fallbackCanvas, blob: await canvasToBlob(fallbackCanvas, type, quality) };
    }
  }
  async function recognizeViaGoogleLensUpload(blob, width, height, timeout) {
    const data = new FormData();
    data.append("encoded_image", blob, "image.jpg");
    const response = await requestTextForm(`https://lens.google.com/v3/upload?stcs=${Date.now().toString().slice(0, 10)}`, data, timeout, {
      Origin: "https://lens.google.com",
      Referer: "https://lens.google.com/"
    });
    return parseGoogleLensUploadHtml(response, width, height);
  }
  async function imageToCanvas(image, maxPixels, invert = false) {
    try {
      const canvas = drawImageToCanvas(image, maxPixels);
      assertCanvasReadable(canvas);
      return invert ? invertedCanvas(canvas) : canvas;
    } catch {
      return imageBlobToCanvas(image, maxPixels, invert);
    }
  }
  async function imageBlobToCanvas(image, maxPixels, invert = false) {
    const url = image.currentSrc || image.src;
    if (!url || url.startsWith("data:")) throw new Error("Image cannot be read by OCR.");
    const blob = await requestBlob(url);
    const objectUrl = URL.createObjectURL(blob);
    try {
      const loaded = await loadImage(objectUrl);
      const canvas = drawImageToCanvas(loaded, maxPixels);
      assertCanvasReadable(canvas);
      return invert ? invertedCanvas(canvas) : canvas;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
  function requestJson(url, data, timeout) {
    const userscriptRequest = requestViaUserscript({
      method: "POST",
      url,
      headers: { "content-type": "application/json" },
      data,
      responseType: "json",
      timeout
    }, (response) => response.response ?? (response.responseText ? JSON.parse(response.responseText) : null), (status) => `OCR endpoint returned ${status}.`, "OCR timed out.");
    if (userscriptRequest) return userscriptRequest;
    return fetchJsonWithTimeout(url, data, timeout).then((response) => response.ok ? response.json() : Promise.reject(new Error(`OCR endpoint returned ${response.status}.`)));
  }
  function fetchJsonWithTimeout(url, data, timeout) {
    if (!timeout) return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: data });
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
    return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: data, signal: controller.signal }).catch((error) => {
      if (timedOut || isAbortError(error)) throw new Error("OCR timed out.");
      throw error;
    }).finally(() => window.clearTimeout(timeoutId));
  }
  function requestArrayBuffer(url, data, timeout) {
    const body = new Uint8Array(data);
    const headers = {
      "content-type": "application/x-protobuf",
      "x-goog-api-key": GOOGLE_LENS_API_KEY,
      accept: "*/*",
      "accept-language": "ja,en-US;q=0.9,en;q=0.8"
    };
    const userscriptRequest = requestViaUserscript({
      method: "POST",
      url,
      headers,
      data: body.buffer,
      responseType: "arraybuffer",
      timeout
    }, (response) => response.response, (status) => `Google Lens returned ${status}.`, "Google Lens timed out.");
    if (userscriptRequest) return userscriptRequest;
    return fetchWithTimeout(url, {
      method: "POST",
      headers,
      body: body.buffer
    }, timeout, "Google Lens timed out.").then((response) => response.ok ? response.arrayBuffer() : Promise.reject(new Error(`Google Lens returned ${response.status}.`)));
  }
  function requestTextForm(url, data, timeout, headers) {
    const userscriptRequest = requestViaUserscript({
      method: "POST",
      url,
      ...headers ? { headers } : {},
      data,
      responseType: "text",
      timeout
    }, (response) => String(response.responseText ?? response.response ?? ""), (status) => `Google Lens upload returned ${status}.`, "Google Lens upload timed out.");
    if (userscriptRequest) return userscriptRequest;
    return fetchWithTimeout(url, { method: "POST", body: data }, timeout, "Google Lens upload timed out.").then((response) => response.ok ? response.text() : Promise.reject(new Error(`Google Lens upload returned ${response.status}.`)));
  }
  function fetchWithTimeout(url, init, timeout, timeoutMessage) {
    if (!timeout) return fetch(url, init);
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
    return fetch(url, { ...init, signal: controller.signal }).catch((error) => {
      if (timedOut || isAbortError(error)) throw new Error(timeoutMessage);
      throw error;
    }).finally(() => window.clearTimeout(timeoutId));
  }
  function requestBlob(url, timeout = 0) {
    const fallbackType = imageMimeTypeFromUrl(url);
    const userscriptRequest = requestViaUserscript({
      method: "GET",
      url,
      responseType: "arraybuffer",
      timeout
    }, (response) => blobFromUserscriptResponse(response, fallbackType), (status) => `Image fetch returned ${status}.`, timeout ? "Image fetch timed out." : void 0);
    if (userscriptRequest) return userscriptRequest;
    if (!timeout) return fetch(url).then((response) => response.ok ? response.blob() : Promise.reject(new Error(`Image fetch returned ${response.status}.`)));
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);
    return fetch(url, { signal: controller.signal }).then((response) => response.ok ? response.blob() : Promise.reject(new Error(`Image fetch returned ${response.status}.`))).finally(() => window.clearTimeout(timer));
  }
  function blobFromUserscriptResponse(response, fallbackType = "image/jpeg") {
    const value = response.response;
    if (value instanceof Blob) return value.type ? value : new Blob([value], { type: fallbackType });
    if (value instanceof ArrayBuffer) {
      const head = new Uint8Array(value, 0, Math.min(16, value.byteLength));
      return new Blob([value], { type: sniffImageMimeType(head) ?? fallbackType });
    }
    if (ArrayBuffer.isView(value)) {
      const source = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      const copy = new Uint8Array(source.byteLength);
      copy.set(source);
      return new Blob([copy.buffer], { type: sniffImageMimeType(copy.subarray(0, 16)) ?? fallbackType });
    }
    return new Blob([value], { type: fallbackType });
  }
  function imageMimeTypeFromUrl(url) {
    const extension = url.split(/[?#]/, 1)[0].split(".").pop()?.toLowerCase();
    switch (extension) {
      case "png":
        return "image/png";
      case "gif":
        return "image/gif";
      case "webp":
        return "image/webp";
      case "avif":
        return "image/avif";
      case "bmp":
        return "image/bmp";
      default:
        return "image/jpeg";
    }
  }
  function sniffImageMimeType(bytes) {
    if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
    if (bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return "image/png";
    if (bytes.length >= 4 && bytes[0] === 71 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 56) return "image/gif";
    if (bytes.length >= 12 && bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) return "image/webp";
    return void 0;
  }
  function requestViaUserscript(options, readResponse, statusMessage, timeoutMessage) {
    const userscriptRequest = getUserscriptHttpRequest();
    if (!userscriptRequest) {
      log$1.warnOnce("no-userscript-http-request", "No userscript HTTP request (GM_xmlhttpRequest / GM.xmlHttpRequest) available — cross-origin OCR/image fetch is blocked. Grant GM.xmlHttpRequest in the userscript manager.");
      return null;
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      let requestHandle;
      let timeoutId = 0;
      const settle = (fn) => {
        if (settled) return;
        settled = true;
        if (timeoutId) window.clearTimeout(timeoutId);
        fn();
      };
      const onload = (response) => {
        settle(() => {
          if (isSuccessfulHttpStatus(response.status)) resolve(readResponse(response));
          else reject(new Error(statusMessage(response.status)));
        });
      };
      const fail = (error) => {
        settle(() => reject(error instanceof Error ? error : new Error(String(error || "Request failed."))));
      };
      const timeout = Math.max(0, Math.round(options.timeout || 0));
      if (timeout) {
        timeoutId = window.setTimeout(() => {
          try {
            requestHandle?.abort?.();
          } catch {
          }
          fail(new Error(timeoutMessage ?? "Request timed out."));
        }, timeout);
      }
      try {
        const result = userscriptRequest({
          ...options,
          onload,
          onerror: fail,
          ...timeoutMessage ? { ontimeout: () => fail(new Error(timeoutMessage)) } : {}
        });
        if (result && typeof result.then === "function") {
          result.then(onload, fail);
        } else if (result) {
          requestHandle = result;
        }
      } catch (error) {
        fail(error);
      }
    });
  }
  function isSuccessfulHttpStatus(status) {
    return status >= 200 && status < 300;
  }
  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Image encoding failed.")), type, quality);
    });
  }
  function normalizeOcrRenderedText(root) {
    normalizeOcrRuby(root);
    normalizeOcrPlainText(root);
  }
  function normalizeOcrRuby(root) {
    root.querySelectorAll("ruby").forEach((ruby) => {
      const replacement = document.createElement("span");
      replacement.className = "jpdb-ocr-ruby";
      const furi = document.createElement("span");
      furi.className = "jpdb-ocr-furi";
      furi.dataset.jpdbReaderSurfaceIgnore = "true";
      furi.setAttribute("aria-hidden", "true");
      const base = document.createElement("span");
      base.className = "jpdb-ocr-ruby-base";
      const baseText = document.createElement("span");
      baseText.className = "jpdb-ocr-ruby-base-text";
      for (const child of Array.from(ruby.childNodes)) {
        if (child instanceof HTMLElement && child.tagName === "RT") {
          furi.textContent += child.textContent ?? "";
        } else if (!(child instanceof HTMLElement && child.tagName === "RP")) {
          baseText.append(child.cloneNode(true));
        }
      }
      base.append(furi, baseText);
      replacement.append(base);
      ruby.replaceWith(replacement);
    });
  }
  function normalizeOcrPlainText(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
        if (parent.classList.contains("jpdb-ocr-furi") || parent.classList.contains("jpdb-ocr-ruby-base")) return NodeFilter.FILTER_REJECT;
        return parent === root || parent.classList.contains("jpdb-reader-word") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const textNodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node instanceof Text) textNodes.push(node);
    }
    for (const textNode of textNodes) {
      const replacement = document.createElement("span");
      replacement.className = "jpdb-ocr-plain";
      replacement.textContent = textNode.textContent ?? "";
      textNode.replaceWith(replacement);
    }
  }
  const STORE_KEY = "yomu-ocr-cache-v2";
  const LEGACY_STORE_KEYS = ["yomu-ocr-cache-v1"];
  const MAX_ENTRIES = 300;
  const MAX_BYTES = 15e5;
  const PERSIST_DELAY_MS = 1200;
  function storage() {
    try {
      return typeof localStorage !== "undefined" ? localStorage : null;
    } catch {
      return null;
    }
  }
  function isPersistableOcrCacheKey(key) {
    return !key.startsWith("data:") && !key.startsWith("blob:");
  }
  function isPersistableOcrCacheEntry(key, result) {
    if (!isPersistableOcrCacheKey(key)) return false;
    if (result === null && (key.startsWith("cv:") || key.startsWith("src:"))) return false;
    return true;
  }
  function loadPersistedOcrCache() {
    const map = /* @__PURE__ */ new Map();
    const store = storage();
    if (!store) return map;
    try {
      for (const key of LEGACY_STORE_KEYS) store.removeItem(key);
      const raw = store.getItem(STORE_KEY);
      if (!raw) return map;
      const parsed = JSON.parse(raw);
      for (const [key, entry] of Object.entries(parsed).sort((a, b) => (a[1]?.at ?? 0) - (b[1]?.at ?? 0))) {
        const result = entry?.r ?? null;
        if (!isPersistableOcrCacheEntry(key, result)) continue;
        map.set(key, result);
      }
    } catch {
      try {
        store.removeItem(STORE_KEY);
      } catch {
      }
    }
    return map;
  }
  let persistTimer;
  let pendingCache;
  let pendingNow = 0;
  let flushListenersInstalled = false;
  function persistOcrCacheSoon(cache, now) {
    if (!storage()) return;
    installFlushListeners();
    pendingCache = cache;
    pendingNow = now;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      flushPersistedOcrCache();
    }, PERSIST_DELAY_MS);
  }
  function flushPersistedOcrCache() {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = void 0;
    }
    const cache = pendingCache;
    if (!cache) return;
    const now = pendingNow || Date.now();
    pendingCache = void 0;
    pendingNow = 0;
    writeOcrCache(cache, now);
  }
  function installFlushListeners() {
    if (flushListenersInstalled) return;
    flushListenersInstalled = true;
    try {
      if (typeof window !== "undefined") {
        window.addEventListener("pagehide", flushPersistedOcrCache, { capture: true });
      }
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "hidden") flushPersistedOcrCache();
        }, { capture: true });
      }
    } catch {
    }
  }
  function writeOcrCache(cache, now) {
    const store = storage();
    if (!store) return;
    try {
      const keys = [...cache.keys()].filter(isPersistableOcrCacheKey).reverse().slice(0, MAX_ENTRIES);
      const out = {};
      let bytes = 0;
      for (const key of keys) {
        const result = cache.get(key) ?? null;
        if (!isPersistableOcrCacheEntry(key, result)) continue;
        const serialized = JSON.stringify(result);
        bytes += key.length + serialized.length + 24;
        if (bytes > MAX_BYTES) break;
        out[key] = { r: result, at: now };
      }
      store.setItem(STORE_KEY, JSON.stringify(out));
    } catch {
    }
  }
  const PAGE_COUNTER_SELECTOR = "#pageSliderCounter";
  const CURRENT_SCREEN_CLASS = "currentScreen";
  const CURRENT_SCREEN_SELECTOR = `.${CURRENT_SCREEN_CLASS}`;
  const VIEWPORT_CONTAINER_SELECTOR = '[id^="viewport"]';
  const BW_VERTICAL_SURFACE_SELECTOR = '.canvasRoot.verticalAxis[id], [id^="wideScreen"][id]';
  const CANVAS_READER_HOST_PATTERNS = [
    /(^|\.)bookwalker\.jp$/i,
    /(^|\.)comic-walker\.com$/i
  ];
  const BACKGROUND_IMAGE_READER_HOST_PATTERNS = [
    /(^|\.)mokuro\.app$/i
  ];
  const BACKGROUND_IMAGE_READER_SELECTOR = [
    "[data-page-index]",
    '[style*="background-image"]',
    '[style*="background:"][style*="url("]'
  ].join(",");
  const MIN_PAGE_CANVAS_DIMENSION = 600;
  const MIN_PAGE_CANVAS_ASPECT = 0.3;
  const MAX_PAGE_CANVAS_ASPECT = 3.2;
  const MIN_RENDERED_DIMENSION = 200;
  const VIEWPORT_COVERAGE_FRACTION = 0.4;
  const VIEWPORT_AREA_FRACTION = 0.18;
  const CONTENT_SAMPLE_SIZE = 20;
  const MIN_CONTENT_CONTRAST = 36;
  const MIN_CONTENT_BUCKETS = 3;
  const MIN_OPAQUE_FRACTION = 0.5;
  function isKnownCanvasReaderHost(hostname = location.hostname) {
    return CANVAS_READER_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
  }
  function isKnownBackgroundImageReaderHost(hostname = location.hostname) {
    return BACKGROUND_IMAGE_READER_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
  }
  function hasPageShape(canvas) {
    const { width, height } = canvas;
    if (width < MIN_PAGE_CANVAS_DIMENSION || height < MIN_PAGE_CANVAS_DIMENSION) return false;
    const aspect = width / height;
    return aspect >= MIN_PAGE_CANVAS_ASPECT && aspect <= MAX_PAGE_CANVAS_ASPECT;
  }
  function hasRenderedPageShape(rect) {
    if (rect.width < MIN_RENDERED_DIMENSION || rect.height < MIN_RENDERED_DIMENSION) return false;
    const aspect = rect.width / rect.height;
    return aspect >= MIN_PAGE_CANVAS_ASPECT && aspect <= MAX_PAGE_CANVAS_ASPECT;
  }
  function isViewportProminent(element) {
    const rect = element.getBoundingClientRect();
    if (rect.width < MIN_RENDERED_DIMENSION || rect.height < MIN_RENDERED_DIMENSION) return false;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
    const coversAxis = rect.width >= viewportWidth * VIEWPORT_COVERAGE_FRACTION || rect.height >= viewportHeight * VIEWPORT_COVERAGE_FRACTION;
    const coversArea = rect.width * rect.height >= viewportWidth * viewportHeight * VIEWPORT_AREA_FRACTION;
    return coversAxis && coversArea;
  }
  function sampleCanvasContent(canvas) {
    try {
      const sample = document.createElement("canvas");
      sample.width = CONTENT_SAMPLE_SIZE;
      sample.height = CONTENT_SAMPLE_SIZE;
      const context = markCanvasMirrorSkip(sample.getContext("2d", { willReadFrequently: true }));
      if (!context) return null;
      context.drawImage(
        canvas,
        0,
        0,
        canvas.width,
        canvas.height,
        0,
        0,
        CONTENT_SAMPLE_SIZE,
        CONTENT_SAMPLE_SIZE
      );
      const { data } = context.getImageData(0, 0, CONTENT_SAMPLE_SIZE, CONTENT_SAMPLE_SIZE);
      const buckets = /* @__PURE__ */ new Set();
      let min = 255;
      let max = 0;
      let hash = 2166136261;
      let opaque = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 8) continue;
        opaque++;
        const luminance = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 | 0;
        if (luminance < min) min = luminance;
        if (luminance > max) max = luminance;
        buckets.add(luminance >> 4);
        hash ^= luminance;
        hash = Math.imul(hash, 16777619) >>> 0;
      }
      return { buckets: buckets.size, contrast: max - min, hash, opaque };
    } catch {
      return null;
    }
  }
  function looksLikeRenderedCanvasImage(canvas) {
    return Boolean(canvasRenderedContentSignature(canvas));
  }
  function canvasRenderedContentSignature(canvas) {
    const sample = sampleCanvasContent(canvas);
    if (!sample) return void 0;
    if (sample.opaque < CONTENT_SAMPLE_SIZE * CONTENT_SAMPLE_SIZE * MIN_OPAQUE_FRACTION) return void 0;
    if (sample.contrast < MIN_CONTENT_CONTRAST || sample.buckets < MIN_CONTENT_BUCKETS) return void 0;
    return `${sample.hash.toString(36)}:${sample.contrast}:${sample.buckets}`;
  }
  function isLikelyPageCanvas(canvas, lenient) {
    if (shouldForceCanvasReaderSurface(canvas)) return hasForcedCanvasReaderShape(canvas);
    if (!hasPageShape(canvas)) return false;
    if (lenient) return true;
    return isViewportProminent(canvas) && looksLikeRenderedCanvasImage(canvas);
  }
  function pageCanvases(hostname = location.hostname, options = {}) {
    const lenient = isKnownCanvasReaderHost(hostname) || Boolean(document.querySelector(PAGE_COUNTER_SELECTOR));
    const canvases = Array.from(document.querySelectorAll("canvas")).filter((canvas) => !shouldSkipCanvasReaderSurface(canvas)).filter(isVisibleCanvasReaderSurface).filter((canvas) => isLikelyPageCanvas(canvas, lenient));
    if (!isBookwalkerViewerHost(hostname) || options.preferBookwalkerCurrent === false) return canvases;
    const continuousScroll = bookwalkerContinuousScrollCanvases(canvases, hostname);
    return continuousScroll.length ? continuousScroll : preferCurrentScreenCanvases(canvases);
  }
  function shouldSkipCanvasReaderSurface(canvas) {
    const mode = canvasOcrMode(canvas);
    return mode === "off" || mode === "manual";
  }
  function isVisibleCanvasReaderSurface(canvas) {
    if (canvas.hidden || canvas.getAttribute("aria-hidden") === "true") return false;
    const style = getComputedStyle(canvas);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
    if (Number(style.opacity || "1") <= 0) return false;
    return true;
  }
  function shouldForceCanvasReaderSurface(canvas) {
    return canvasOcrMode(canvas) === "on";
  }
  function isManualCanvasReaderSurface(canvas) {
    return canvasOcrMode(canvas) === "manual" && isVisibleCanvasReaderSurface(canvas) && isLikelyPageCanvas(canvas, true);
  }
  function canvasOcrMode(canvas) {
    return canvas.dataset.yomuCanvasOcr || canvas.closest("[data-yomu-canvas-ocr]")?.dataset.yomuCanvasOcr;
  }
  function hasForcedCanvasReaderShape(canvas) {
    const { width, height } = canvas;
    if (Math.max(width, height) < MIN_PAGE_CANVAS_DIMENSION || Math.min(width, height) < MIN_RENDERED_DIMENSION) return false;
    const aspect = width / height;
    return aspect >= MIN_PAGE_CANVAS_ASPECT && aspect <= MAX_PAGE_CANVAS_ASPECT;
  }
  function bookwalkerContinuousScrollCanvases(canvases, hostname = location.hostname) {
    if (!isBookwalkerViewerHost(hostname)) return [];
    const byViewport = /* @__PURE__ */ new Map();
    for (const canvas of canvases) {
      const viewport = canvas.closest(VIEWPORT_CONTAINER_SELECTOR);
      if (!viewport) continue;
      const group = byViewport.get(viewport) ?? [];
      group.push(canvas);
      byViewport.set(viewport, group);
    }
    const scrollCanvases = [];
    for (const [viewport, group] of byViewport) {
      const explicitContinuousViewport = viewport.id === "viewportW" || viewport.classList.contains("overScroll");
      if (explicitContinuousViewport || hasVerticallyStackedDocumentPageRun(group)) scrollCanvases.push(...group);
    }
    if (scrollCanvases.length < 2) return [];
    return hasVerticallyStackedDocumentPageRun(scrollCanvases) ? scrollCanvases : [];
  }
  function isBookwalkerContinuousScrollCanvas(canvas) {
    if (!isBookwalkerViewerHost()) return false;
    return bookwalkerContinuousScrollCanvases(pageCanvases(location.hostname, { preferBookwalkerCurrent: false })).includes(canvas);
  }
  function preferCurrentScreenCanvases(canvases) {
    if (canvases.length < 2) return canvases;
    const visible = visibleViewportCanvases(canvases);
    if (hasDistinctVisiblePageLayout(visible)) return visible;
    const current = canvases.filter(isOnScreenViewportCanvas);
    if (current.length && visible.length === 1 && !current.includes(visible[0])) return visible;
    if (hasVerticallyStackedDocumentPageRun(canvases)) return canvases;
    if (!current.length) return canvases;
    const renderedCurrent = current.filter(looksLikeRenderedCanvasImage);
    if (renderedCurrent.length) return renderedCurrent;
    const renderedFallback = canvases.filter((canvas) => !current.includes(canvas)).filter(looksLikeRenderedCanvasImage);
    return renderedFallback.length ? renderedFallback : current;
  }
  function visibleViewportCanvases(canvases) {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!viewportWidth || !viewportHeight) return [];
    return canvases.filter((canvas) => {
      const rect = canvas.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.right >= 0 && rect.top <= viewportHeight && rect.left <= viewportWidth;
    });
  }
  function hasDistinctVisiblePageLayout(canvases) {
    return hasDistinctPageLayout(canvases.map((canvas) => canvas.getBoundingClientRect()));
  }
  function hasVerticallyStackedDocumentPageRun(canvases) {
    const rects = canvases.map((canvas) => canvas.getBoundingClientRect()).filter((rect) => rect.width > 0 && rect.height > 0).sort((a, b) => a.top - b.top);
    if (rects.length < 2) return false;
    for (let index = 1; index < rects.length; index += 1) {
      const previous = rects[index - 1];
      const current = rects[index];
      const smallerHeight = Math.max(1, Math.min(previous.height, current.height));
      const smallerWidth = Math.max(1, Math.min(previous.width, current.width));
      const verticalOverlap2 = Math.max(0, Math.min(previous.bottom, current.bottom) - Math.max(previous.top, current.top));
      const horizontalOverlap2 = Math.max(0, Math.min(previous.right, current.right) - Math.max(previous.left, current.left));
      if (Math.abs(current.top - previous.top) > smallerHeight * 0.45 && verticalOverlap2 / smallerHeight < 0.55 && horizontalOverlap2 / smallerWidth > 0.55) return true;
    }
    return false;
  }
  function hasDistinctPageLayout(rects) {
    const usefulRects = rects.filter((rect) => rect.width > 0 && rect.height > 0);
    for (let i = 0; i < usefulRects.length; i += 1) {
      for (let j = i + 1; j < usefulRects.length; j += 1) {
        const a = usefulRects[i];
        const b = usefulRects[j];
        const smallerWidth = Math.max(1, Math.min(a.width, b.width));
        const smallerHeight = Math.max(1, Math.min(a.height, b.height));
        const largerWidth = Math.max(a.width, b.width);
        const largerHeight = Math.max(a.height, b.height);
        if (smallerWidth / largerWidth < 0.55 || smallerHeight / largerHeight < 0.55) continue;
        const horizontalOverlap2 = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) / smallerWidth;
        const verticalOverlap2 = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) / smallerHeight;
        const separatedHorizontally = Math.abs(a.left - b.left) > smallerWidth * 0.45 && horizontalOverlap2 < 0.55 && verticalOverlap2 > 0.55;
        const separatedVertically = Math.abs(a.top - b.top) > smallerHeight * 0.45 && verticalOverlap2 < 0.55 && horizontalOverlap2 > 0.55;
        if (separatedHorizontally || separatedVertically) return true;
      }
    }
    return false;
  }
  function isOnScreenViewportCanvas(canvas) {
    const viewport = canvas.closest(VIEWPORT_CONTAINER_SELECTOR);
    return viewport ? viewport.classList.contains(CURRENT_SCREEN_CLASS) : Boolean(canvas.closest(CURRENT_SCREEN_SELECTOR));
  }
  function hasBackgroundReaderSignal(element) {
    return element.hasAttribute("data-page-index") || Boolean(element.closest("[data-mokuro-reader]"));
  }
  function isLikelyBackgroundImagePage(element, hostname) {
    const knownHost = isKnownBackgroundImageReaderHost(hostname);
    if (!knownHost && !hasBackgroundReaderSignal(element)) return false;
    if (!backgroundImageReaderUrl(element)) return false;
    if (!hasRenderedPageShape(element.getBoundingClientRect())) return false;
    return knownHost || isViewportProminent(element);
  }
  function backgroundImagePages(hostname = location.hostname) {
    return Array.from(document.querySelectorAll(BACKGROUND_IMAGE_READER_SELECTOR)).filter((element) => isLikelyBackgroundImagePage(element, hostname));
  }
  function isCanvasReaderPage(hostname = location.hostname) {
    return pageCanvases(hostname).length > 0;
  }
  function collectCanvasReaderSurfaces(hostname = location.hostname) {
    return pageCanvases(hostname);
  }
  function isBackgroundImageReaderPage(hostname = location.hostname) {
    return backgroundImagePages(hostname).length > 0;
  }
  function collectBackgroundImageReaderSurfaces(hostname = location.hostname) {
    return backgroundImagePages(hostname);
  }
  function isReaderRasterPage(hostname = location.hostname) {
    return isKnownCanvasReaderHost(hostname) || isKnownBackgroundImageReaderHost(hostname) || isCanvasReaderPage(hostname) || isBackgroundImageReaderPage(hostname);
  }
  const READER_RASTER_SIGNAL_SELECTOR = "[data-page-index], [data-mokuro-reader], [data-yomu-canvas-ocr]";
  const READER_RASTER_CANDIDATE_NODE_SELECTOR = `canvas, ${PAGE_COUNTER_SELECTOR}, ${READER_RASTER_SIGNAL_SELECTOR}`;
  const READER_RASTER_CANDIDATE_ATTRIBUTES = /* @__PURE__ */ new Set([
    "width",
    "height",
    "data-page-index",
    "data-mokuro-reader",
    "data-yomu-canvas-ocr"
  ]);
  function pageHasReaderRasterCandidates(hostname = location.hostname) {
    if (isKnownCanvasReaderHost(hostname) || isKnownBackgroundImageReaderHost(hostname)) return true;
    if (document.querySelector(READER_RASTER_SIGNAL_SELECTOR)) return true;
    if (document.querySelector(PAGE_COUNTER_SELECTOR)) return true;
    for (const canvas of document.querySelectorAll("canvas")) {
      if (hasPageShape(canvas)) return true;
    }
    return false;
  }
  function mutationsMayAddReaderRasterCandidate(mutations) {
    return mutationsTouchReaderRasterCandidates(mutations, "addedNodes");
  }
  function mutationsMayRemoveReaderRasterCandidate(mutations) {
    return mutationsTouchReaderRasterCandidates(mutations, "removedNodes");
  }
  function mutationsTouchReaderRasterCandidates(mutations, nodeList) {
    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        const attribute = mutation.attributeName;
        if (!attribute || !READER_RASTER_CANDIDATE_ATTRIBUTES.has(attribute)) continue;
        if (attribute === "width" || attribute === "height") {
          if (isCanvasNode(mutation.target)) return true;
          continue;
        }
        return true;
      }
      if (mutation.type !== "childList") continue;
      for (const node of mutation[nodeList]) {
        if (nodeIsOrContainsReaderRasterCandidate(node)) return true;
      }
    }
    return false;
  }
  function isCanvasNode(node) {
    return node.nodeType === Node.ELEMENT_NODE && node.localName === "canvas";
  }
  function nodeIsOrContainsReaderRasterCandidate(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const element = node;
    if (element.localName === "canvas") return true;
    if (element.matches(READER_RASTER_CANDIDATE_NODE_SELECTOR)) return true;
    return Boolean(element.querySelector(READER_RASTER_CANDIDATE_NODE_SELECTOR));
  }
  function canvasReaderPageCounter() {
    return document.querySelector(PAGE_COUNTER_SELECTOR)?.textContent?.trim() ?? "";
  }
  function canvasReaderPageSignature() {
    const canvases = pageCanvases();
    const counter = canvasReaderSignatureCounter(canvases);
    const tokens = canvasReaderContentTokens(canvases);
    const surfaces = tokens.length;
    const content = tokens.join(",");
    const backgrounds = backgroundImagePages().map((element) => `${element.getAttribute("data-page-index") ?? ""}:${backgroundImageReaderUrl(element) ?? ""}`).join("|");
    return `${counter}||${surfaces}|${content}|${backgrounds}`;
  }
  function canvasReaderSignatureCounter(canvases) {
    const counter = canvasReaderPageCounter();
    if (isBookwalkerViewerHost() && shouldIgnoreBookwalkerCounterForCanvasSignature(canvases)) return "";
    return counter;
  }
  function shouldIgnoreBookwalkerCounterForCanvasSignature(canvases) {
    try {
      if (new URL(location.href).searchParams.get("cty") === "2") {
        return hasVerticallyStackedDocumentPageRun(canvases);
      }
    } catch {
    }
    return hasVerticallyStackedDocumentPageRun(canvases);
  }
  function canvasPageContentToken(canvas) {
    try {
      const signature = canvasRenderedContentSignature(canvas);
      if (signature) return signature;
    } catch {
    }
    return canvasMirrorContentToken(canvas) || stableSurfaceToken(canvas) || canvasMirrorTurnToken();
  }
  function canvasReaderSurfaceId(canvas) {
    return bookwalkerVerticalSurface(canvas)?.id ?? canvas.closest(VIEWPORT_CONTAINER_SELECTOR)?.id ?? "";
  }
  function canvasReaderHasStableSurface(canvas) {
    return Boolean(bookwalkerVerticalSurface(canvas));
  }
  function stableSurfaceToken(canvas) {
    const id = bookwalkerVerticalSurface(canvas)?.id;
    return id ? `s:${id}:${canvas.width}x${canvas.height}` : "";
  }
  function bookwalkerVerticalSurface(canvas) {
    if (!isBookwalkerViewerHost()) return null;
    const surface = canvas.closest(BW_VERTICAL_SURFACE_SELECTOR);
    if (!surface) return null;
    if (surface.classList.contains("verticalAxis")) return surface;
    return surface.closest("#viewportW,.overScroll") ? surface : null;
  }
  function canvasReaderContentTokens(canvases) {
    const tokens = canvases.map((canvas) => {
      try {
        return canvasPageContentToken(canvas);
      } catch {
        return "";
      }
    });
    return [...new Set(tokens)].filter(Boolean);
  }
  function captureCanvasDataUrl(canvas, maxPixels) {
    try {
      const width = canvas.width;
      const height = canvas.height;
      if (!width || !height) return void 0;
      const pixels = width * height;
      const scale = maxPixels > 0 && pixels > maxPixels ? Math.sqrt(maxPixels / pixels) : 1;
      if (scale >= 1) return canvas.toDataURL("image/jpeg", 0.86);
      const scaled = document.createElement("canvas");
      scaled.width = Math.max(1, Math.round(width * scale));
      scaled.height = Math.max(1, Math.round(height * scale));
      const context = markCanvasMirrorSkip(scaled.getContext("2d"));
      if (!context) return void 0;
      context.drawImage(canvas, 0, 0, scaled.width, scaled.height);
      return scaled.toDataURL("image/jpeg", 0.86);
    } catch {
      return void 0;
    }
  }
  function captureCanvasRegionDataUrl(canvas, surfaceRect, regionRect, maxPixels) {
    try {
      if (!canvas.width || !canvas.height || !surfaceRect.width || !surfaceRect.height) return void 0;
      const scaleX = canvas.width / surfaceRect.width;
      const scaleY = canvas.height / surfaceRect.height;
      const sx = Math.max(0, Math.round((regionRect.left - surfaceRect.left) * scaleX));
      const sy = Math.max(0, Math.round((regionRect.top - surfaceRect.top) * scaleY));
      const sw = Math.min(canvas.width - sx, Math.max(1, Math.round(regionRect.width * scaleX)));
      const sh = Math.min(canvas.height - sy, Math.max(1, Math.round(regionRect.height * scaleY)));
      if (sw <= 0 || sh <= 0) return void 0;
      const pixels = sw * sh;
      const scale = maxPixels > 0 && pixels > maxPixels ? Math.sqrt(maxPixels / pixels) : 1;
      const out = document.createElement("canvas");
      out.width = Math.max(1, Math.round(sw * scale));
      out.height = Math.max(1, Math.round(sh * scale));
      const context = markCanvasMirrorSkip(out.getContext("2d"));
      if (!context) return void 0;
      context.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
      return out.toDataURL("image/jpeg", 0.86);
    } catch {
      return void 0;
    }
  }
  function isCanvasReadable(canvas) {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return false;
    try {
      context.getImageData(0, 0, 1, 1);
      return true;
    } catch {
      return false;
    }
  }
  const READER_PAGE_IMAGE_PATTERNS = [
    /\/item\/xhtml\/.+\.(?:jpe?g|png|webp)(?:\?|$)/i,
    // SpeedBinB / NFBR page tile
    /\/(?:page|img|image|content)s?\/.+\.(?:jpe?g|png|webp)(?:\?|$)/i
  ];
  const READER_PAGE_IMAGE_EXCLUDE = /(?:icon|logo|avatar|banner|thumb(?:nail)?|sprite|favicon|cover|ad[\b_-])/i;
  function readerCanvasSourceImageUrl() {
    let entries;
    try {
      entries = performance.getEntriesByType("resource");
    } catch {
      return void 0;
    }
    const urls = entries.map((entry) => entry.name).filter((url) => typeof url === "string" && !READER_PAGE_IMAGE_EXCLUDE.test(url));
    for (const pattern of READER_PAGE_IMAGE_PATTERNS) {
      for (let index = urls.length - 1; index >= 0; index--) {
        if (pattern.test(urls[index])) return urls[index];
      }
    }
    return void 0;
  }
  function canUseReaderCanvasSourceImageFallback(hostname = location.hostname) {
    return !isBookwalkerViewerHost(hostname);
  }
  function positionCanvasFrameImage(frame, rect) {
    frame.style.left = `${rect.left}px`;
    frame.style.top = `${rect.top}px`;
    frame.style.width = `${rect.width}px`;
    frame.style.height = `${rect.height}px`;
  }
  function backgroundImageReaderUrl(element) {
    const image = getComputedStyle(element).backgroundImage;
    return firstCssBackgroundUrl(image);
  }
  function firstCssBackgroundUrl(value) {
    const match = value.match(/url\((?:"([^"]+)"|'([^']+)'|([^)]*))\)/iu);
    const raw = match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
    return raw.trim() || void 0;
  }
  const CAPTURE_VISIBLE_TAB_MESSAGE = "yomu.captureVisibleTab";
  const SCREENSHOT_HIDE_STYLE_ID = "yomu-extension-screenshot-hide-style";
  const SCREENSHOT_MESSAGE_TIMEOUT_MS = 6e3;
  const SCREENSHOT_PREFLIGHT_TIMEOUT_MS = 250;
  const SCREENSHOT_DECODE_TIMEOUT_MS = 4e3;
  let readerUiHideLeaseCount = 0;
  async function captureReaderSurfaceViaExtensionScreenshot(surface, maxPixels) {
    if (!documentIsActiveForVisibleTabCapture()) return void 0;
    const rect = surface.getBoundingClientRect();
    const clip = visibleViewportIntersection(rect);
    if (!clip || clip.width < 2 || clip.height < 2) return void 0;
    const screenshot = await withReaderUiHidden(async () => {
      if (!documentIsActiveForVisibleTabCapture()) return void 0;
      return requestVisibleTabScreenshot();
    });
    if (!screenshot || !documentIsActiveForVisibleTabCapture()) return void 0;
    const cropped = await cropVisibleTabScreenshot(screenshot, clip, maxPixels);
    return cropped && documentIsActiveForVisibleTabCapture() ? { dataUrl: cropped, rect: new DOMRect(clip.left, clip.top, clip.width, clip.height) } : void 0;
  }
  function documentIsActiveForVisibleTabCapture() {
    return document.visibilityState === "visible" && document.hasFocus();
  }
  async function requestVisibleTabScreenshot() {
    const extension = extensionRuntime();
    if (!extension?.runtime.id || typeof extension.runtime.sendMessage !== "function") return void 0;
    const response = await sendExtensionMessage(extension, { type: CAPTURE_VISIBLE_TAB_MESSAGE, format: "jpeg", quality: 88 });
    return screenshotResponseDataUrl(response);
  }
  function sendExtensionMessage(extension, message) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (response) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(response);
      };
      const timer = window.setTimeout(() => finish(void 0), SCREENSHOT_MESSAGE_TIMEOUT_MS);
      try {
        const maybePromise = extension.promiseBased ? extension.runtime.sendMessage?.(message) : extension.runtime.sendMessage?.(message, (response) => {
          if (extension.runtime.lastError) finish(void 0);
          else finish(response);
        });
        if (isPromiseLike(maybePromise)) {
          void maybePromise.then(finish, () => finish(void 0));
        }
      } catch {
        finish(void 0);
      }
    });
  }
  function extensionRuntime() {
    const global = globalThis;
    if (global.browser?.runtime) return { promiseBased: true, runtime: global.browser.runtime };
    if (global.chrome?.runtime) return { promiseBased: false, runtime: global.chrome.runtime };
    return void 0;
  }
  function screenshotResponseDataUrl(response) {
    const detail = response;
    return detail?.ok && typeof detail.dataUrl === "string" && detail.dataUrl.startsWith("data:image/") ? detail.dataUrl : void 0;
  }
  async function withReaderUiHidden(task) {
    const release = acquireReaderUiHideLease();
    try {
      await animationFrame();
      return await task();
    } finally {
      release();
    }
  }
  function acquireReaderUiHideLease() {
    if (readerUiHideLeaseCount === 0) {
      ensureScreenshotHideStyle();
      document.documentElement.dataset.yomuExtensionScreenshotCapture = "true";
    }
    readerUiHideLeaseCount += 1;
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      readerUiHideLeaseCount = Math.max(0, readerUiHideLeaseCount - 1);
      if (readerUiHideLeaseCount > 0) return;
      delete document.documentElement.dataset.yomuExtensionScreenshotCapture;
      document.getElementById(SCREENSHOT_HIDE_STYLE_ID)?.remove();
    };
  }
  function ensureScreenshotHideStyle() {
    document.getElementById(SCREENSHOT_HIDE_STYLE_ID)?.remove();
    const style = document.createElement("style");
    style.id = SCREENSHOT_HIDE_STYLE_ID;
    const selectors = [
      'html[data-yomu-extension-screenshot-capture="true"] [data-jpdb-reader-root]',
      'html[data-yomu-extension-screenshot-capture="true"] .jpdb-ocr-canvas-frame',
      'html[data-yomu-extension-screenshot-capture="true"] .jpdb-ocr-background-frame',
      'html[data-yomu-extension-screenshot-capture="true"] .jpdb-ocr-layer'
    ];
    style.textContent = `${selectors.join(",")} { visibility: hidden !important; }`;
    document.documentElement.append(style);
  }
  function animationFrame() {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve();
      };
      const timer = window.setTimeout(finish, SCREENSHOT_PREFLIGHT_TIMEOUT_MS);
      try {
        requestAnimationFrame(finish);
      } catch {
        finish();
      }
    });
  }
  function visibleViewportIntersection(rect) {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!viewportWidth || !viewportHeight) return null;
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(viewportWidth, rect.right);
    const bottom = Math.min(viewportHeight, rect.bottom);
    const width = right - left;
    const height = bottom - top;
    return width > 0 && height > 0 ? { left, top, width, height } : null;
  }
  async function cropVisibleTabScreenshot(dataUrl, rect, maxPixels) {
    try {
      const image = await loadScreenshotImage(dataUrl);
      const scaleX = image.naturalWidth / Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
      const scaleY = image.naturalHeight / Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
      const source = {
        left: Math.max(0, Math.round(rect.left * scaleX)),
        top: Math.max(0, Math.round(rect.top * scaleY)),
        width: Math.max(1, Math.round(rect.width * scaleX)),
        height: Math.max(1, Math.round(rect.height * scaleY))
      };
      source.width = Math.min(source.width, image.naturalWidth - source.left);
      source.height = Math.min(source.height, image.naturalHeight - source.top);
      if (source.width <= 0 || source.height <= 0) return void 0;
      const pixels = source.width * source.height;
      const scale = maxPixels > 0 && pixels > maxPixels ? Math.sqrt(maxPixels / pixels) : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(source.width * scale));
      canvas.height = Math.max(1, Math.round(source.height * scale));
      const context = canvas.getContext("2d");
      if (!context) return void 0;
      context.drawImage(image, source.left, source.top, source.width, source.height, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.86);
    } catch {
      return void 0;
    }
  }
  function loadScreenshotImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        image.onload = null;
        image.onerror = null;
        if (error) reject(error);
        else resolve(image);
      };
      const timer = window.setTimeout(
        () => finish(new Error("Screenshot decode timed out.")),
        SCREENSHOT_DECODE_TIMEOUT_MS
      );
      image.onload = () => finish();
      image.onerror = () => finish(new Error("Screenshot decode failed."));
      try {
        image.src = dataUrl;
      } catch {
        finish(new Error("Screenshot decode failed."));
      }
    });
  }
  const BOOKWALKER_CONTENT_SESSION_PATHS = /* @__PURE__ */ new Set([
    "/browserWebApi/c",
    "/trial-page/c"
  ]);
  const BOOKWALKER_AUTH_QUERY_KEYS = ["pfCd", "Policy", "Signature", "Key-Pair-Id"];
  const SIGNED_URL_REFRESH_MARGIN_MS = 3e4;
  const CONTENT_SESSION_TIMEOUT_MS = 6e3;
  class BookwalkerAssetResolver {
    constructor(environment = browserEnvironment()) {
      this.environment = environment;
    }
    sessionEndpoint = "";
    refreshPending;
    rememberSessionEndpoint() {
      this.findSessionEndpoint();
    }
    async resolve(url) {
      if (!isBookwalkerAssetUrl(url)) return url;
      this.rememberSessionEndpoint();
      if (!bookwalkerSignedUrlNeedsRefresh(url, this.environment.now())) return url;
      return await this.refresh(url) ?? url;
    }
    async refresh(url) {
      if (!isBookwalkerAssetUrl(url)) return void 0;
      const endpoint = this.findSessionEndpoint();
      if (!endpoint) return void 0;
      const authorization = await this.loadAuthorization(endpoint);
      if (!authorization) {
        if (this.sessionEndpoint === endpoint) this.sessionEndpoint = "";
        return void 0;
      }
      return applyAuthorization(url, authorization);
    }
    findSessionEndpoint() {
      const current = safeUrl(this.environment.currentUrl());
      if (!current) return "";
      const contentId = current.searchParams.get("cid") ?? "";
      const candidate = this.environment.resourceUrls().slice().reverse().find((url) => isMatchingSessionEndpoint(url, current, contentId));
      if (candidate) this.sessionEndpoint = candidate;
      else if (!isMatchingSessionEndpoint(this.sessionEndpoint, current, contentId)) this.sessionEndpoint = "";
      return this.sessionEndpoint;
    }
    loadAuthorization(endpoint) {
      if (this.refreshPending?.endpoint === endpoint) return this.refreshPending.promise;
      const pending = this.environment.fetchJson(endpoint).then(parseContentAuthorization).catch(() => void 0).finally(() => {
        if (this.refreshPending?.promise === pending) this.refreshPending = void 0;
      });
      this.refreshPending = { endpoint, promise: pending };
      return pending;
    }
  }
  function bookwalkerSignedUrlNeedsRefresh(url, now = Date.now()) {
    const parsed = safeUrl(url);
    if (!parsed || !isBookwalkerHost(parsed.hostname)) return false;
    const expiresAt = signedUrlExpiry(parsed);
    return expiresAt !== void 0 && expiresAt <= now + SIGNED_URL_REFRESH_MARGIN_MS;
  }
  function browserEnvironment() {
    return {
      currentUrl: () => location.href,
      resourceUrls: () => {
        try {
          return performance.getEntriesByType("resource").map((entry) => entry.name).filter(Boolean);
        } catch {
          return [];
        }
      },
      fetchJson: async (url) => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), CONTENT_SESSION_TIMEOUT_MS);
        try {
          const response = await fetch(url, {
            cache: "no-store",
            credentials: "include",
            headers: { accept: "application/json" },
            signal: controller.signal
          });
          if (!response.ok) throw new Error(`BookWalker content session returned ${response.status}.`);
          return response.json();
        } finally {
          window.clearTimeout(timer);
        }
      },
      now: () => Date.now()
    };
  }
  function isMatchingSessionEndpoint(rawUrl, current, contentId) {
    const candidate = safeUrl(rawUrl);
    if (!candidate || candidate.origin !== current.origin) return false;
    if (!BOOKWALKER_CONTENT_SESSION_PATHS.has(candidate.pathname)) return false;
    if (!candidate.searchParams.get("BID")) return false;
    return !contentId || candidate.searchParams.get("cid") === contentId;
  }
  function parseContentAuthorization(value) {
    if (!value || typeof value !== "object") return void 0;
    const response = value;
    if (String(response.status ?? "") !== "200" || typeof response.url !== "string") return void 0;
    const baseUrl = safeUrl(response.url);
    if (!baseUrl || !isBookwalkerHost(baseUrl.hostname)) return void 0;
    if (!response.auth_info || typeof response.auth_info !== "object") return void 0;
    const source = response.auth_info;
    const query = /* @__PURE__ */ new Map();
    for (const key of BOOKWALKER_AUTH_QUERY_KEYS) {
      const entry = source[key];
      if (typeof entry === "string" && entry) query.set(key, entry);
    }
    return query.has("Policy") && query.has("Signature") && query.has("Key-Pair-Id") ? { baseUrl, query } : void 0;
  }
  function applyAuthorization(rawUrl, authorization) {
    const target = safeUrl(rawUrl);
    if (!target || target.origin !== authorization.baseUrl.origin) return void 0;
    if (!target.pathname.startsWith(authorization.baseUrl.pathname)) return void 0;
    for (const key of BOOKWALKER_AUTH_QUERY_KEYS) target.searchParams.delete(key);
    for (const [key, value] of authorization.query) target.searchParams.set(key, value);
    return target.toString();
  }
  function signedUrlExpiry(url) {
    const expires = Number(url.searchParams.get("Expires"));
    if (Number.isFinite(expires) && expires > 0) return expires * 1e3;
    const policy = url.searchParams.get("Policy");
    if (!policy) return void 0;
    try {
      const normalized = policy.replace(/-/g, "+").replace(/_/g, "=").replace(/~/g, "/");
      const decoded = atob(normalized);
      const parsed = JSON.parse(decoded);
      const epoch = Number(parsed.Statement?.[0]?.Condition?.DateLessThan?.["AWS:EpochTime"]);
      return Number.isFinite(epoch) && epoch > 0 ? epoch * 1e3 : void 0;
    } catch {
      return void 0;
    }
  }
  function isBookwalkerAssetUrl(rawUrl) {
    const url = safeUrl(rawUrl);
    return Boolean(url && isBookwalkerHost(url.hostname) && /\/OPS\/images\//.test(url.pathname));
  }
  function isBookwalkerHost(hostname) {
    return hostname === "bookwalker.jp" || hostname.endsWith(".bookwalker.jp");
  }
  function safeUrl(value) {
    try {
      return new URL(value, typeof location === "undefined" ? void 0 : location.href);
    } catch {
      return void 0;
    }
  }
  function isCanvasMirrorEpochOrEmpty(content) {
    return content === "" || /^\d+(?:,\d+)*$/.test(content);
  }
  function isStableSurfaceToken(content) {
    return content.startsWith("s:");
  }
  function identityForCanvas(canvas) {
    try {
      return canvasPageContentToken(canvas);
    } catch {
      return "";
    }
  }
  function isRealContentIdentity(identity) {
    if (isCanvasMirrorEpochOrEmpty(identity)) return false;
    if (isStableSurfaceToken(identity)) return false;
    return true;
  }
  function stableContentIdentityForCanvas(canvas) {
    if (!isBookwalkerViewerHost()) return "";
    const token = canvasReaderHasStableSurface(canvas) ? identityForCanvas(canvas) : canvasMirrorContentToken(canvas);
    return isRealContentIdentity(token) ? token : "";
  }
  function hasIdentityChanged(canvas, lastIdentity) {
    if (!lastIdentity) return false;
    const current = stableContentIdentityForCanvas(canvas);
    return Boolean(current && current !== lastIdentity);
  }
  function isRealContentChange(previousContent, nextContent) {
    if (previousContent === nextContent) return false;
    return isRealContentIdentity(previousContent) && isRealContentIdentity(nextContent);
  }
  function isSameRealContent(previousContent, nextContent) {
    if (previousContent !== nextContent) return false;
    return isRealContentIdentity(previousContent);
  }
  function isGlobalEpochTransition(previousContent, nextContent) {
    if (previousContent === nextContent) return false;
    return isCanvasMirrorEpochOrEmpty(previousContent) && isCanvasMirrorEpochOrEmpty(nextContent);
  }
  function canvasSurfaceSnapshotKey(canvas) {
    const surfaceId = canvasReaderSurfaceId(canvas);
    if (isBookwalkerViewerHost()) {
      return [
        canvasReaderHasStableSurface(canvas) ? "" : canvasReaderPageCounter(),
        surfaceId
      ].join("|");
    }
    return [
      canvasReaderHasStableSurface(canvas) ? "" : canvasReaderPageCounter(),
      surfaceId,
      canvas.width,
      canvas.height,
      canvasPageContentToken(canvas)
    ].join("|");
  }
  function canvasStablePageContentToken(canvas) {
    return stableContentIdentityForCanvas(canvas);
  }
  function canvasContentReadinessKey(canvas) {
    const surfaceId = canvasReaderSurfaceId(canvas);
    return [
      canvasReaderHasStableSurface(canvas) ? "" : canvasReaderPageCounter(),
      surfaceId,
      canvas.width,
      canvas.height,
      canvasPageContentToken(canvas)
    ].join("|");
  }
  function isSameCanvasReaderPageLocation(previous, next) {
    const previousParts = splitCanvasReaderSignature(previous);
    const nextParts = splitCanvasReaderSignature(next);
    if (!previousParts || !nextParts) return false;
    return previousParts.counter === nextParts.counter && previousParts.backgrounds === nextParts.backgrounds;
  }
  function hasDifferentRecordedCanvasReaderContent(previous, next) {
    const previousParts = splitCanvasReaderSignature(previous);
    const nextParts = splitCanvasReaderSignature(next);
    if (!previousParts || !nextParts) return false;
    return isRecordedCanvasReaderContent(previousParts.content) && isRecordedCanvasReaderContent(nextParts.content) && isRealContentChange(previousParts.content, nextParts.content);
  }
  function isRecordedCanvasReaderContent(content) {
    const tokens = content.split(",").filter(Boolean);
    return tokens.length > 0 && tokens.every((token) => token.startsWith("m:") || token.startsWith("o:"));
  }
  function hasSameRealCanvasReaderContent(previous, next) {
    const previousParts = splitCanvasReaderSignature(previous);
    const nextParts = splitCanvasReaderSignature(next);
    if (!previousParts || !nextParts) return false;
    return isSameRealContent(previousParts.content, nextParts.content);
  }
  function isCanvasMirrorEpochTransition(previous, next) {
    const previousParts = splitCanvasReaderSignature(previous);
    const nextParts = splitCanvasReaderSignature(next);
    if (!previousParts || !nextParts) return false;
    return isGlobalEpochTransition(previousParts.content, nextParts.content);
  }
  function hasSameStableCanvasReaderPageCounter(previous, next) {
    const previousParts = splitCanvasReaderSignature(previous);
    const nextParts = splitCanvasReaderSignature(next);
    if (!previousParts || !nextParts) return false;
    return previousParts.counter !== "" && previousParts.counter === nextParts.counter;
  }
  function shouldTrustStableBookwalkerPageCounter() {
    if (!isBookwalkerViewerHost()) return false;
    try {
      return new URL(location.href).searchParams.get("cty") !== "2";
    } catch {
      return true;
    }
  }
  function splitCanvasReaderSignature(signature) {
    const parts = signature.split("|");
    if (parts.length < 5) return null;
    const [counter, scroll, surfaces, content, ...backgroundParts] = parts;
    return {
      backgrounds: backgroundParts.join("|"),
      content: content ?? "",
      counter: counter ?? "",
      scroll: scroll ?? "",
      surfaces: surfaces ?? ""
    };
  }
  const COPY = {
    en: {
      settingsTitle: `${APP_NAME} Settings`,
      welcomeLabel: `${APP_NAME} welcome`,
      onboardingEyebrow: "Japanese, wherever it appears",
      onboardingCopy: "Make Japanese text, subtitles, and images tappable.",
      onboardingLanguage: "Settings language",
      onboardingAccentColor: "Accent color",
      customAccentColor: "Custom color",
      onboardingImmersionOptions: "Immersion defaults",
      onboardingInstallOfflineDictionaries: "Download offline dictionaries (Jitendex + pitch accents)",
      onboardingHoverShortcut: "Lookup hover modifier",
      manualPageScanShortcut: "Manual page scan shortcut",
      onboardingAddApiKey: "Add API key",
      onboardingUseWithoutApiKey: "Use without API key",
      closeOnboarding: "Close welcome",
      featureText: "Text",
      featureTextBody: "Hover or tap scanned Japanese.",
      featureImages: "Images",
      featureImagesBody: "Read any image by tapping it.",
      featureVideo: "Video",
      featureVideoBody: "Make subtitle words tappable.",
      featureControl: "Control",
      featureControlBody: "Tune features, shortcuts, and color.",
      featureStudy: "Study",
      featureStudyBody: "Review words and kanji on the study page.",
      featureGame: "Game",
      featureGameBody: "Install the Yomu app to use in games or anywhere on the PC.",
      scanPage: "Scan page",
      noUnscannedJapaneseText: "No unscanned Japanese text found.",
      jpdbScanFailed: "Page scan failed.",
      pageCoverageSummary: "{percent}% known · {known}/{total} · {unknown} new · {iPlusOne} i+1",
      settings: "Settings",
      settingsSaved: "Settings saved.",
      settingsSaveFailed: "Settings save failed.",
      settingsSections: "Settings sections",
      settingsSearch: "Search settings",
      settingsSearchPlaceholder: "Search settings",
      settingsSearchNoResults: "No matches.",
      save: "Save",
      cancel: "Cancel",
      show: "Show",
      hide: "Hide",
      appearance: "Appearance",
      reading: "Reading",
      dictionaries: "Dictionaries",
      sources: "Sources",
      backupSync: "Backup & sync",
      backupSyncHelp: "Save or move your Yomu setup: export and import settings as plain JSON, back up dictionaries, or sync through Google Drive.",
      backupMovedHelp: "Backup, sync, and settings/dictionary import-export live in the Backup & sync section.",
      media: "Media",
      mining: "Mining",
      shortcuts: "Shortcuts",
      help: "Help",
      reader: "Reader",
      kanji: "Kanji",
      audio: "Audio",
      images: "Image text (OCR)",
      video: "Video",
      youTube: "YouTube",
      anki: "Anki",
      jpdb: "JPDB",
      api: "API",
      apiCredential: "API key",
      apiCredentialJpdb: "JPDB API key",
      apiCredentialJiten: "Jiten API key",
      apiCredentialBunpro: "Bunpro frontend API token",
      apiCredentialBunproLegacy: "Bunpro API key",
      apiKey: "API key",
      jitenApiKey: "Jiten API key",
      apiAccess: "API access",
      apiAccessHelp: "Add each service credential here. Bunpro only needs the frontend token: import it from Bunpro settings, treat it like a password, and note that it is saved before it is verified. Academy reviews work locally without an account.",
      jpdbSettings: "JPDB settings",
      jitenSettings: "Jiten settings",
      bunproSettings: "Bunpro settings",
      jpdbApiKeyConfigured: "JPDB key set.",
      jpdbAndJitenApiKeysConfigured: "Jiten and JPDB keys are set.",
      jpdbConnected: "Connected to JPDB.",
      jpdbAndJitenConnected: "Connected to Jiten and JPDB.",
      jpdbConnectionFailed: "JPDB did not accept the key (network or invalid key).",
      statusReady: "Ready",
      statusAttention: "Needs setup",
      statusError: "Error",
      disabledControlDescription: "Controlled by another setting.",
      jpdbMiningEnabled: "Allow API review/deck changes",
      bunproMiningEnabled: "Allow Bunpro review/mining",
      yomuLocalSrsEnabled: `Enable ${ACADEMY_SRS_LABEL}`,
      addToForq: "Also copy JPDB adds to forq",
      enableReviews: "Show review buttons",
      reviewRatingScale: "Review rating scale",
      gradeTargetSelector: "Grade target",
      gradeTargetBoth: "Both",
      gradeTargetJpdb: "Grades JPDB",
      gradeTargetJiten: "Grades Jiten",
      gradeTargetBunpro: "Grades Bunpro",
      gradeTargetYomuLocal: `Grades ${ACADEMY_SRS_LABEL}`,
      gradeTargetAnki: "Grades Anki card: {target}",
      gradeTargetJpdbAndAnki: "Grades JPDB + Anki card: {target}",
      gradeTargetJitenAndAnki: "Grades Jiten + Anki card: {target}",
      gradeTargetBunproAndAnki: "Grades Bunpro + Anki card: {target}",
      gradeTargetYomuLocalAndAnki: `Grades ${ACADEMY_SRS_LABEL} + Anki card: {target}`,
      missingAnkiCardId: "Missing Anki card id.",
      jpdbPageEnhancements: "Dictionary site enhancements",
      jpdbPageEnhancementsEnabled: "Enhance dictionary pages",
      jpdbPageWordEnhancementsEnabled: "Add sources to word/search pages",
      jpdbPageKanjiEnhancementsEnabled: "Add sources to kanji pages",
      fivePoint: "Five point: NOTHING to EASY",
      twoPoint: "Two point: FAIL / PASS",
      settingsLanguage: "Settings language",
      automatic: "Automatic",
      english: "English",
      japanese: "日本語",
      theme: "Theme",
      auto: "Auto",
      dark: "Dark",
      light: "Light",
      switchToDarkTheme: "Switch to dark theme",
      switchToLightTheme: "Switch to light theme",
      popupMode: "Popup mode",
      hoverPopupMode: "Hover popup mode",
      bottomSheet: "Bottom sheet",
      popover: "Popover",
      stickyBottomSheet: "Keep sheet open after lookup",
      popoverBackdropEnabled: "Dim page behind popover",
      popoverWidth: "Popover width (px)",
      popoverHeight: "Popover height (px)",
      popoverHeightMode: "Popover height behavior",
      popoverHeightAvailable: "Grow to available space",
      popoverHeightFixed: "Use height setting",
      readerFontFamily: "Reader interface font",
      popupFontFamily: "Popup Japanese font",
      fontPresetYomuDefault: "Built-in font",
      fontPresetJapaneseSans: "Japanese sans",
      fontPresetHiraginoYuGothic: "Hiragino / Yu Gothic",
      fontPresetJapaneseRounded: "Japanese rounded",
      fontPresetJapaneseSerif: "Japanese serif",
      fontPresetSystemUi: "System UI",
      fontPresetCustom: "Custom...",
      customFontFamily: "Custom font stack",
      popupFontWeight: "Popup Japanese weight",
      enableLogging: "Enable diagnostic logging",
      diagnostics: "Diagnostics",
      diagnosticsHelp: "Print diagnostics to the console.",
      accentColor: "Accent color",
      newTab: "Study",
      newTabEnabled: "Set Study as the new tab",
      newTabAnkiEnabled: "Use Anki cards in Study",
      newTabAnkiReviewDecks: "Anki review decks",
      newTabAnkiReviewDecksHelp: "Uncheck decks to skip.",
      newTabSource: "Study review source",
      newTabAuto: `Auto: ${ACADEMY_SRS_LABEL}, accounts, then study words`,
      newTabApiSrs: "API SRS (Jiten / JPDB)",
      newTabBunpro: "Bunpro",
      newTabYomuLocal: ACADEMY_SRS_LABEL,
      dictionaryFallback: "Dictionary fallback",
      newTabJpdbReviewMode: "API review mode",
      newTabJpdbReviewAuto: "Auto: live kanji + API vocabulary",
      newTabLiveReview: "Live JPDB review session",
      newTabApiVocabulary: "API vocabulary only",
      corsProxyUrl: "Cross-origin proxy URL",
      newTabKanjiKeywordSource: "Kanji keyword source",
      newTabKanjiKeywordAuto: "Auto: RTK, then {service} kanji facts, then local",
      newTabKanjiKeywordRtk: "RTK / Heisig",
      newTabKanjiKeywordApiFacts: "{service} kanji facts (Jiten / JPDB)",
      newTabKanjiKeywordLocal: "Local card meaning",
      newTabParsingEnabled: "Enable sentence parsing on Study",
      newTabFrontSentenceEnabled: "Show sentence on word fronts",
      newTabKanjiAutogradeEnabled: "Auto-grade kanji drawing",
      newTabKanjiAutoSubmit: "Auto-submit kanji grade",
      newTabOfflineEnabled: "Cache Study for offline use",
      newTabOfflineLimit: "Offline review cache limit",
      newTabDailyGoalMinutes: "Daily study goal (minutes, 0 = off)",
      newTabKanjiUnlockEnabled: "Study kanji before unlocking words",
      newTabStopAtBatchEnd: "Stop at the end of each batch",
      newTabSwipeReviews: "Swipe cards to grade (left = fail, right = pass)",
      newTabShortcutHintsEnabled: "Show Study keyboard shortcut hints",
      newTabUrl: "Study address",
      newTabOfflineHelp: "Caches due cards and queued grades.",
      newTabAddressHelp: "Use as a start page or iPad shortcut.",
      newTabJpdbDeck: "Study JPDB deck",
      newTabStudySteps: "Study steps",
      newTabStudyStepsHelp: "Drag to reorder. Turn off steps for faster reviews; Reveal and grading always stay at the end.",
      newTabStudyStepHeader: "Step",
      newTabStudyStepKanji: "Kanji drawing",
      newTabStudyStepWord: "Word meaning",
      newTabStudyStepRecall: "Write in sentence",
      newTabStudyStepListen: "Pitch listening",
      newTabStudyStepSpeaking: "Speaking",
      newTabStudyStepType: "Type the word",
      newTabStudyStepKanjiHelp: "Draw each kanji before the word answer is shown. Carries the word meaning so the blank is never ambiguous; tap Hint for the kanji keyword.",
      newTabStudyStepWordHelp: "Japanese front, meaning and reading on reveal.",
      newTabStudyStepRecallHelp: "Type the missing word in the example sentence. Tap Hint for the first kana, then length. Shown only when a card has an example sentence.",
      newTabStudyStepListenHelp: "Hear the word and choose its pitch pattern from the contour options; correctness stays hidden until the final reveal. Shown only when pitch-accent data is available.",
      newTabStudyStepSpeakingHelp: "Shadow the word aloud — your pitch contour is scored against the model on this device. Shown only when audio is available.",
      newTabStudyStepTypeHelp: "Produce the word after hearing and speaking it: type it, or write it kanji by kanji. Skippable in-session.",
      openNewTabPage: "Open Study",
      copyAddress: "Copy address",
      wordColors: "Word colors",
      wordColorNew: "New and in deck",
      wordColorLearning: "Learning",
      wordColorKnown: "Known and never forget",
      wordColorDue: "Due",
      wordColorFailed: "Failed",
      wordColorIgnored: "Ignored, suspended, and blacklisted",
      pitchAccentColors: "Pitch accent colors",
      pitchColorHeiban: "Heiban (flat)",
      pitchColorAtamadaka: "Atamadaka (head-high)",
      pitchColorNakadaka: "Nakadaka (middle-high)",
      pitchColorOdaka: "Odaka (tail-high)",
      pitchColorUnknown: "Unknown",
      noExactPitch: "Exact pitch unavailable",
      colorChannels: "Color channels",
      wordHighlightColorSource: "Word highlight color",
      wordUnderlineColorSource: "Word underline color",
      wordTextColorSource: "Word text color",
      subtitleHighlightColorSource: "Subtitle highlight color",
      subtitleUnderlineColorSource: "Subtitle underline color",
      subtitleTextColorSource: "Subtitle text color",
      colorSourceStatus: "JPDB + Anki status",
      colorSourceJpdb: "JPDB status",
      colorSourceAnki: "Anki status",
      colorSourcePitch: "Pitch accent",
      colorSourceNone: "None",
      popupLookup: "Popup lookup",
      popupLookupEnabled: "Show Yomu lookup popup",
      popupLookupHelp: "Off for another reader's popups. Yomu tools stay on.",
      lookupOnClick: "Look up on tap or click",
      lookupOnHover: "Look up on hover",
      lookupOnMiddleMouse: "Look up with middle-mouse hold",
      showFloatingButton: "Show settings puck",
      pageScanMode: "Page scanning",
      pageScanModeOff: "Off",
      pageScanModeAuto: "Auto",
      pageScanModeManual: "Manual",
      manualScanEnabled: "Manual page scanning",
      ocrInteractionMode: "Image OCR scanning",
      ocrInteractionModeAuto: "Auto",
      ocrInteractionModeManual: "Tap or hover",
      ocrInteractionModeOff: "Off",
      puckMenuLabel: `${APP_NAME} menu`,
      puckStudyPage: "Study page",
      puckPauseAnnotations: "Pause annotations",
      puckResumeAnnotations: "Resume annotations",
      puckOcrAuto: "OCR: Auto",
      puckOcrManual: "OCR: Tap/Hover",
      puckOcrOff: "OCR: Off",
      annotationsPausedToast: "Annotations paused.",
      annotationsResumedToast: "Annotations resumed.",
      puckMuteAudio: "Mute auto-play audio",
      puckUnmuteAudio: "Unmute auto-play audio",
      autoplayAudioOnToast: "Auto-play audio on.",
      autoplayAudioOffToast: "Auto-play audio muted.",
      puckHideFurigana: "Hide furigana",
      furiganaOffToast: "Furigana off. Lookups stay active.",
      showFurigana: "Enable furigana annotations",
      furiganaMode: "Furigana",
      wordColorStates: "Color words",
      appearancePresetCustom: "Keep current custom settings",
      appearancePresetBalanced: "Balanced reading",
      appearancePresetNoColors: "Plain text",
      appearancePresetNewOnly: "Focus on new words",
      appearancePresetUnderlineNew: "Minimal highlights",
      wordColorStatesAll: "Use all learning states",
      wordColorStatesNewOnly: "Only new / not-in-deck words",
      hideFuriganaFor: "Hide furigana for",
      hideColorFor: "Hide color for",
      furiganaDifficultKanji: "Hard kanji only",
      furiganaHideKnown: "Hide familiar words",
      furiganaHoverOnly: "Show on hover",
      furiganaAllParsed: "Show on every parsed word",
      clampedRowReadings: "Readings on clamped rows",
      clampedRowReadingsShow: "Show (row grows)",
      clampedRowReadingsHover: "Hover only",
      showPitchAccent: "Show pitch accent",
      showLookupPillFrequency: "Show site frequency in pills",
      suppressRedundantWordUi: "Hide JPDB-redundant styling",
      sheetCloseButtonOnLeft: "Sheet close button on left",
      hideKnownFurigana: "Hide furigana for known cards only",
      readerHelp: "Set a hover key. Blank means plain hover.",
      hoverLookupSettings: "Hover lookup",
      kanjiOriginKanjiMapEnabled: "Show kanji facts and component graph",
      kanjiOriginGraphEnabled: "Show component graph",
      kanjiOriginRadicalImagesEnabled: "Show radical images",
      similarKanjiWordLimit: "Similar word limit",
      noSimilarWords: "No additional words found.",
      audioEnabled: "Enable term audio",
      autoPlayAudio: "Auto-play term audio",
      suppressAutoAudioOnVideo: "Disable lookup audio on video pages",
      audioAutoPlayMode: "Auto-play trigger",
      audioEnableDefaultSources: "Enable built-in audio sources",
      audioFallbackChimeEnabled: "Enable fallback chime",
      audioSelectionMode: "When several sources or clips exist",
      audioPlayback: "Audio playback",
      firstAudio: "First audio",
      randomAudio: "Shuffle audio",
      audioTtsMode: "Text-to-speech handling",
      audioTtsFallback: "Fallback after recorded audio",
      audioTtsSourceOrder: "Follow source order / shuffle",
      audioTimeoutMs: "Audio timeout (ms)",
      previewAudio: "Preview audio",
      audioHelp: "URL tokens: {term}, {reading}, {language}.",
      audioSource: "Audio source",
      urlVoice: "URL / voice",
      addAudioSource: "Add audio source",
      audioAutoPlayAll: "Hover and tap/click",
      audioAutoPlayHover: "Hover only",
      audioAutoPlayTap: "Tap/click only",
      automaticBrowserVoice: "Automatic browser voice",
      savedVoiceLabel: "Saved voice: {voice}",
      audioSourceOrder: "Audio source order",
      audioSourceNumber: "Audio source {number}",
      enableAudioSourceNumber: "Enable audio source {number}",
      enableLookupPillName: "Enable lookup pill: {name}",
      enableSourceName: "Enable source: {name}",
      textToSpeechVoiceNumber: "Text-to-speech voice {number}",
      audioSourceJpod101: "JapanesePod101",
      audioSourceLanguagePod101: "LanguagePod101",
      audioSourceJisho: "Jisho.org",
      audioSourceBunpro: "Bunpro",
      audioSourceLinguaLibre: "(Commons) Lingua Libre",
      audioSourceWiktionary: "(Commons) Wiktionary",
      audioSourceJitenTts: "Jiten text-to-speech",
      audioSourceJpdbTts: "JPDB text-to-speech",
      audioSourceTextToSpeech: "Text-to-speech",
      audioSourceTextToSpeechReading: "Text-to-speech (Kana reading)",
      audioSourceCustom: "Custom direct audio file URL",
      audioSourceCustomJson: "Custom URL",
      audioCustomJsonPlaceholder: "Yomitan or Ultimate audio source URL",
      audioCustomUrlPlaceholder: "Direct audio file URL",
      audioBuiltInPlaceholder: "Built-in source, no URL needed",
      defaultVoiceSuffix: "default",
      audioGuideLinkLabel: "Yomitan audio guide",
      audioProxyGuideSummary: "Make your own Cloudflare proxy",
      audioProxyGuideIntro: "Use a Worker when you want a private proxy.",
      audioProxyGuideCloudflare: "Open Cloudflare.",
      audioProxyGuideWorkers: "Open Workers & Pages, then Create.",
      audioProxyGuideCreateWorker: "Choose Worker, name it, deploy.",
      audioProxyGuideEditCode: "Paste the Yomu Worker source.",
      audioProxyGuideDeploy: "Deploy.",
      audioProxyGuideCopyUrl: "Copy the Worker URL.",
      audioProxyGuidePasteUrl: "Paste it into Cross-origin proxy URL.",
      audioProxyGuideTest: "Save, then test lookup/import/audio.",
      audioProxyGuideNote: "Limit hosts before sharing.",
      audioProxyWorkerSource: "Worker source",
      audioProxyDeployGuide: "Deploy guide",
      immersionKit: "Immersion Kit",
      immersionKitEnabled: "Show Immersion Kit examples",
      immersionKitExampleSource: "Example provider",
      immersionKitAndNadeshiko: "Immersion Kit + Nadeshiko",
      nadeshikoApiKey: "Nadeshiko API key",
      getNadeshikoKey: "Get a key",
      immersionKitShowTranslation: "Show example translations",
      immersionKitRevealTranslationOnClick: "Blur example translations until clicked",
      immersionKitShowImages: "Show example thumbnails",
      immersionKitAutoPlayAudio: "Play example audio after reveal or next/previous",
      immersionKitPlayOnHover: "Play example audio when hovering thumbnails",
      immersionKitPlayOnImageClick: "Play example audio when clicking thumbnails",
      immersionKitCategory: "Immersion Kit category",
      immersionKitSort: "Example order",
      immersionKitLimitEnabled: "Examples per word limit",
      allExamples: "All examples",
      limitExamples: "Limit examples",
      immersionKitLimit: "Examples per word",
      immersionKitMinLength: "Minimum sentence length",
      immersionKitMaxLength: "Maximum sentence length",
      immersionKitPlaybackRate: "Example audio speed",
      immersionKitExactMatch: "Prefer exact matches",
      immersionKitHelp: "Examples appear in popups. Nadeshiko needs a key.",
      loadingExamples: "Loading examples...",
      noImmersionExamplesCompact: "No examples",
      immersionKitRateLimited: "Immersion Kit rate-limited; retrying later.",
      immersionKitRequest: "Immersion Kit request",
      immersionKitRequestFailed: "Immersion Kit request failed.",
      immersionKitRequestFailedWithStatus: "Immersion Kit request failed ({status}).",
      immersionKitRequestTimedOut: "Immersion Kit request timed out.",
      immersionKitSearchBlocked: "Immersion Kit blocked. Configure CORS.",
      immersionKitMediaRequest: "Media request",
      immersionKitMediaRequestFailed: "Media request failed.",
      immersionKitMediaRequestFailedWithStatus: "Media request failed ({status}).",
      immersionKitMediaRequestTimedOut: "Media request timed out.",
      immersionKitMediaRequestReturnedNonMedia: "Media request returned an error page.",
      immersionKitNoMediaCandidate: "No Immersion Kit media loaded.",
      nadeshikoRequest: "Nadeshiko request",
      nadeshikoRequestFailed: "Nadeshiko request failed.",
      nadeshikoRequestFailedWithStatus: "Nadeshiko request failed ({status}).",
      nadeshikoRequestTimedOut: "Nadeshiko request timed out.",
      previousExample: "Previous example",
      nextExample: "Next example",
      playExampleAudio: "Play example audio",
      allCategories: "All",
      anime: "Anime",
      drama: "Drama",
      games: "Games",
      shortestFirst: "Shortest first",
      longestFirst: "Longest first",
      ocrEnabled: "Read text in images",
      ocrAutoScanImages: "Read images automatically",
      ocrShowTextOverlay: "Show recognized text areas",
      ocrVideoPauseFrames: "Auto-read paused video frames",
      ocrInvertDarkPanels: "Read light text on dark panels",
      ocrProvider: "Image reading",
      ocrOverlayTheme: "OCR overlay theme",
      ocrOverlayThemeAuto: "Match app theme",
      ocrOverlayThemeLight: "Light overlay",
      ocrOverlayThemeDark: "Dark overlay",
      googleLens: "Google Lens (free, recommended)",
      cloudVision: "Google Cloud Vision (API key)",
      localOcr: "Local OCR server",
      off: "Off",
      ocrMaxImagesPerPage: "Images to read per page",
      ocrMinImageArea: "Smallest image to read",
      ocrMaxImagePixels: "Image detail",
      lightWork: "Light",
      normal: "Normal",
      more: "More",
      largeOnly: "Large images only",
      includeSmall: "Include small images",
      faster: "Faster",
      balanced: "Balanced",
      sharper: "Sharper",
      ocrTextColor: "Image text color",
      ocrOutlineColor: "Image text outline",
      ocrBackgroundOpacity: "Image highlight opacity",
      ocrFontScale: "Image text scale",
      ocrEndpointUrl: "Local OCR server URL",
      ocrEngine: "Local OCR engine",
      ocrEngineMangaOcr: "MangaOCR (best for manga)",
      ocrEngineAppleVision: "Apple Vision (macOS)",
      cloudVisionApiKey: "Google Cloud Vision API key",
      ocrHelp: "Reads nearby images. Google Lens needs no setup.",
      ocrCloudHelp: "Paste a Google Cloud Vision API key.",
      ocrLocalHelp: "Run MangaOCR/Apple Vision locally and enter its URL.",
      subtitlePlayerEnabled: "Enable video subtitle player",
      subtitleAutoDetect: "Auto-detect page subtitles",
      subtitleOverlayVisible: "Show subtitle overlay",
      subtitleSecondaryVisible: "Show native subtitles",
      subtitleNativeBlurred: "Blur native subtitles until hover",
      subtitleKaraokeMode: "Karaoke word timing",
      subtitleTranscriptVisible: "Open transcript panel by default",
      subtitlePausePanel: "Open side panel when paused",
      subtitleShadowAutoPause: "Auto-pause after each shadow line",
      subtitleTranscriptPlacement: "Transcript panel position",
      subtitleTranscriptAutoScroll: "Scroll transcript with playback",
      subtitleTranscriptAutoScrollResumeSeconds: "Resume auto-scroll delay (s)",
      subtitleAutoCopyLine: "Auto-copy subtitle lines",
      subtitleMiningPause: "Pause video on subtitle click",
      subtitleHoverPause: "Pause video on subtitle hover",
      subtitleControlsMode: "Subtitle controls",
      right: "Right",
      left: "Left",
      bottom: "Below",
      showWhenNeeded: "Compact controls",
      hideControls: "Hide controls",
      alwaysVisible: "Always visible",
      subtitleFontSize: "Subtitle font size (px)",
      subtitleBottomOffset: "Subtitle bottom offset (%)",
      subtitleTextColor: "Subtitle color",
      subtitleOutlineColor: "Subtitle outline",
      subtitleBackgroundColor: "Subtitle background",
      subtitleBackgroundOpacity: "Subtitle background opacity",
      subtitleFontFamily: "Subtitle font family",
      subtitleFontWeight: "Subtitle font weight",
      subtitleSeekPadding: "Subtitle seek padding (s)",
      subtitlePreview: "Live subtitle preview",
      preview: "Preview",
      youtubeImmersionEnabled: "Japanese YouTube only",
      preferJapaneseSiteLanguage: "Prefer Japanese site language and location",
      youtubeShowChannelRecommendations: "Show Japanese channel suggestions",
      youtubeShowFilterNotice: "Show hidden-video notice",
      youtubeHelp: "Prefer Japanese UI and Japan-local content.",
      youtubeShowHiddenVideos: "Show hidden videos",
      youtubeHideHiddenVideos: "Hide hidden videos",
      youtubeHideNotice: "Hide notice",
      youtubeFilterShowing: "{appName} shows {count} hidden item{plural}",
      youtubeFilterHid: "{appName} hid {count} non-Japanese item{plural}",
      youtubeFilterVisible: "{count} Japanese items stayed visible.",
      youtubeToggleToastOn: "YouTube immersion filter enabled.",
      youtubeToggleToastOff: "YouTube immersion filter disabled.",
      ankiEnabled: "Enable Anki mining",
      ankiMineWithJpdb: "Also add to Anki when adding via API",
      ankiCaptureScreenshot: "Attach context image when possible",
      ankiConnectUrl: "AnkiConnect URL",
      ankiDeck: "Anki deck",
      ankiModel: "Anki note type",
      mobileAnkiHandoff: "Mobile Anki add-note fallback",
      ankiTemplateMode: "Anki card template",
      ankiFrontReading: "Show reading on word-first front",
      ankiFrontSentence: "Show sentence on word-first front",
      ankiFrontImage: "Show image on front",
      wordFirst: "Word first",
      sentenceFirst: "Sentence first",
      ankiTags: "Tags",
      sentenceFirstPreset: "Sentence first preset",
      wordFirstPreset: "Word first preset",
      front: "Front",
      back: "Back",
      imageAbovePrompt: "Image appears above the prompt when available.",
      recallHighlightedWord: "Recall the highlighted word from context.",
      imageOnFront: "Image appears on the front when available.",
      recallMeaning: "Recall the meaning first.",
      ankiBackIncludes: "Includes dictionary, kanji, pitch, source, image.",
      exampleMeaning: "to read",
      scanAnkiFirst: "Connect Anki first",
      notMapped: "Not mapped",
      noScannedFields: "",
      mappingForNoteType: "Mapping for {model}",
      currentNoteType: "current note type",
      ankiFieldMappingSelect: "{role} field",
      ankiRoleExpression: "Expression",
      ankiRoleReading: "Reading",
      ankiRoleMeaning: "Meaning",
      ankiRoleSentence: "Sentence",
      ankiRoleAudio: "Audio",
      ankiRoleImage: "Image",
      testAnki: "Check AnkiConnect",
      prepareAnki: "Create Yomu note type",
      ankiCheckingConnection: "Checking AnkiConnect at {url}.",
      ankiMiningDisabledStatus: "Anki mining disabled.",
      ankiTesting: "Checking AnkiConnect...",
      ankiPreparing: "Creating Yomu deck/note type...",
      ankiScanning: "Reading decks, note types, fields...",
      ankiScanSummary: "Decks {decks}, types {models}. Best: {model}. {fields}",
      ankiScanNoModels: "Found {decks} decks. Note types unavailable.",
      ankiScanFieldSummary: "Fields: {fields}",
      ankiUnreachable: "Open desktop Anki and check again.",
      ankiCorsBlocked: 'Add "{origin}" to webCorsOriginList; restart Anki.',
      ankiSettingsUnreachable: "AnkiConnect not reached.",
      ankiHostedBridgeMissing: `Enable ${APP_NAME}, refresh, then check again.`,
      ankiStatusOpenDesktop: "Open desktop Anki",
      ankiStatusInstallAddon: "Install/enable AnkiConnect",
      ankiStatusMobileDocs: "Mobile setup docs",
      ankiStatusUseDesktopUrl: "Use the LAN/Tailscale URL on mobile",
      ankiStatusEnableUserscript: `Enable installed ${APP_NAME}`,
      ankiStatusRefreshAndCheck: "Refresh and check",
      ankiHostedCorsHint: "Add {origin} to webCorsOriginList.",
      ankiLibraryAdapter: "Existing library adapter",
      ankiLibraryAdapterStatus: "Scans decks/types and suggests mappings.",
      ankiLibraryChoices: "Deck and note type",
      ankiLibraryChoicesHelp: "Pick where mining saves notes.",
      ankiTemplateSettings: "Yomu card template",
      ankiTemplateSettingsHelp: "For Yomu note types. Templates stay in Anki.",
      ankiMappingConfidenceHelp: "Based on fields/samples. Edit weak mappings.",
      ankiMappingHighConfidence: "High",
      ankiMappingMediumConfidence: "Medium",
      ankiMappingLowConfidence: "Low",
      ankiHelp: "Install AnkiConnect and keep desktop Anki open. If CORS appears, add this site to webCorsOriginList. Mobile handoff creates notes only.",
      jpdbDefinitionsEnabled: "Show JPDB definitions",
      localDictionariesEnabled: "Show imported dictionary definitions",
      dictionarySourcesInitiallyExpanded: "Open sources by default",
      localDictionaryMaxResults: "Dictionary result limit",
      cloudSettingsSync: "Google Drive settings sync",
      cloudSettingsSyncHelp: "Stores your Yomu settings and local SRS progress in Google Drive app data. Dictionaries stay local.",
      importSettings: "Import settings JSON",
      exportSettings: "Export settings JSON",
      importDictionaries: "Import dictionaries",
      exportDictionaries: "Export dictionaries",
      dictionaryImportHelp: "Import a Yomitan ZIP, settings export, or backup. Term, pitch, and frequency dictionaries add definitions, accents, and badges.",
      lookupPills: "Lookup pills",
      lookupPillsHelp: "External links and frequency badges in one order. Local frequency dictionaries replace matching live Jiten/JPDB badges. Tokens: {query}, {word}, {reading}.",
      parserProvider: "Parsing source",
      parserProviderLocal: "Local dictionaries (offline)",
      parserProviderJiten: "Jiten API",
      parserProviderJpdb: "JPDB API",
      parserProviderAuto: "Automatic (Jiten/JPDB)",
      parserProviderHelp: "Local parses with imported dictionaries, offline. Jiten and JPDB always use that API when its key is set. Automatic prefers Jiten, then JPDB.",
      offlineDictionarySetupComplete: "Offline dictionaries installed.",
      offlineDictionarySetupFailed: "Offline dictionary setup failed. Retry from Settings → Sources.",
      copiesCurrentWord: "Copies the current word",
      lookupPillLabelNumber: "Lookup pill {number} label",
      lookupUrlTemplate: "Lookup URL template",
      lookupUrlTemplateNumber: "Pill {number} URL",
      lookupPillOrder: "Lookup pill order",
      builtInAction: "Built-in action",
      recommendedDownloads: "Dictionaries",
      termDictionaries: "Term dictionaries",
      kanjiDictionaries: "Kanji dictionaries",
      pitchDictionaries: "Pitch dictionaries",
      frequencyDictionaries: "Frequency dictionaries",
      install: "Install",
      installing: "Installing",
      queued: "Queued",
      dictionaryGuide: "Guide",
      saveAfterInstall: "Save after install",
      download: "Download",
      update: "Update",
      checkingDictionaries: "Checking imported dictionaries...",
      dictionaryDownloading: "Downloading",
      dictionaryReadingZip: "Reading dictionary ZIP...",
      dictionaryCheckingIndex: "Checking index...",
      dictionaryBanksFound: "{count} bank{plural} found.",
      dictionaryRemovingExisting: "removing old entries",
      dictionaryReadingBank: "Reading",
      dictionaryParsingBank: "Parsing",
      dictionarySavingBank: "Saving",
      dictionaryImporting: "Importing",
      importingBundledDictionaries: "Importing bundled dictionaries...",
      dictionaryImported: "Imported",
      dictionaryPreparingImport: "Preparing import",
      dictionaryRecords: "dictionary records",
      dictionaryEntries: "entries",
      dictionaryTotal: "total",
      dictionaryDownloadProgress: "Downloading",
      dictionaryStatusSummary: "Dicts {dictionaries}, terms {terms}, kanji {kanji}, meta {metadata}",
      dictionaryStatusUnavailable: "Unavailable.",
      noLocalDictionariesImported: "No dictionaries imported yet. Start with a term dictionary for definitions.",
      dictionaryDownloadFailed: "Dictionary download failed.",
      dictionaryDownloadTimedOut: "Dictionary download timed out.",
      dictionaryDownloadNotZip: "Download was not a ZIP.",
      dictionaryDownloadNeedsBridge: "Download needs bridge; else import ZIP.",
      dictionaryDownloadBlocked: "Download blocked. Import the ZIP.",
      dictionaryManualDownloadHint: "Enable userscript or import the ZIP.",
      dictionaryInstallQueueHelp: "Install a term dictionary first for definitions. Pitch and frequency dictionaries add accents and badges, not normal definition text.",
      dictionaryInstallQueued: "{dictionary} queued.",
      dictionaryInstallSaveBlocked: "Import running. Save unlocks when done.",
      dictionaryImportQueueStatus: "{count} install{plural} running.",
      dictionaryRemoveConfirm: 'Remove "{dictionary}"?',
      dictionaryRemoving: "Removing {dictionary}...",
      dictionaryRemoved: "Removed {dictionary}.",
      dictionaryImportComplete: "Imported {records} from {sources} source{plural}.",
      dictionaryRecordsImported: "{dictionary}: {records} records.",
      settingsImported: "Settings imported.",
      settingsImportedWithDetails: "Settings imported; {details}.",
      settingsExported: "Settings exported.",
      restoredStoredChoices: "restored {count} stored choice{plural}",
      importedDictionaryRecordCount: "imported {count} dictionary record{plural}",
      dictionaryNoSupportedBanks: "No supported banks found.",
      dictionaryUnsupportedJson: "Use Dexie, ZIP, or export.",
      dictionaryZipMissingIndex: "ZIP missing index.json.",
      yomitanSettingsInvalid: "Not a Yomitan settings export.",
      localWordSingular: "entry",
      localWordPlural: "entries",
      decksLoaded: "Decks are loaded from your JPDB account.",
      decksUnavailable: "Could not load decks; saved IDs kept.",
      addApiKeyChooseDecks: "Add your JPDB API key to choose decks.",
      miningDeck: "Mining deck",
      neverForgetDeck: "Never forget deck",
      blacklistDeck: "Blacklist deck",
      allStudyDecks: "All study decks",
      savedValue: "Saved: {value}",
      holdWhileHovering: "Hold while hovering",
      hoverOpenDelayMs: "Hover open delay (ms)",
      hoverCloseDelayMs: "Hover close delay (ms)",
      pressKeys: "Press keys",
      blankPlainHover: "Blank = hover, no key",
      openSettings: "Open settings",
      resizeSettings: "Resize settings",
      playAudio: "Play audio",
      playingAudioPreview: `Playing ${APP_NAME}...`,
      audioPreviewFailed: "Audio preview failed.",
      audioPlaybackDisabled: "Audio playback is disabled",
      audioPlaybackDisabledToast: "Audio playback is disabled.",
      audioPlaybackFailed: "Audio playback failed.",
      noSentenceToRead: "No sentence to read aloud.",
      noTextToRead: "No text to read aloud.",
      jpdbExampleAudioUnavailable: "No JPDB audio is available for this example.",
      jpdbAudioPlayableFileMissing: "JPDB audio returned no playable file.",
      jpdbAudioResponseNotPlayable: "JPDB audio was not playable.",
      audioSourceReturnedNoAudio: "Audio source did not return audio.",
      audioJsonMissingPlayableUrl: "Audio JSON had no playable URL.",
      textToSpeechUnavailable: "Text-to-speech is unavailable.",
      textToSpeechFailed: "Text-to-speech failed.",
      audioRequest: "Audio request",
      audioRequestTimedOut: "Audio request timed out.",
      audioRequestReturnedNonAudioWithType: "Audio request returned non-audio: {type}.",
      audioUnknownContentType: "an unknown content type",
      japanesePod101NoAudio: "JapanesePod101 has no audio for this term.",
      invalidJpdbAudioId: "Invalid JPDB audio id.",
      couldNotReadAudio: "Could not read audio.",
      couldNotReadAudioBlob: "Could not read audio blob.",
      closeDrawer: "Close drawer",
      closePopup: "Close popup",
      previousLookupWord: "Previous word",
      nextLookupWord: "Next word",
      previousSubtitle: "Previous subtitle",
      nextSubtitle: "Next subtitle",
      jumpToCurrentSubtitle: "Jump to current subtitle",
      pauseVideo: "Pause video",
      readVideoFrame: "Read video frame (OCR)",
      readVideoFrameStop: "Stop reading video frames (OCR)",
      copySubtitle: "Copy subtitle",
      subtitleFallbackLabel: "Subtitle",
      subtitlesTitle: "Subtitles",
      openSubtitlePanel: "Open subtitle panel",
      closeSubtitlePanel: "Close subtitle panel",
      subtitleStyle: "Subtitle style",
      subtitleResetDefaults: "Reset defaults",
      enableSubtitleAutoHide: "Auto-hide panel while playing",
      disableSubtitleAutoHide: "Keep panel open while playing",
      subtitlePanelOptions: "Panel options",
      loadJapaneseSubtitles: "Load Japanese subtitles",
      loadNativeSubtitles: "Load native subtitles",
      searchAnimeSubtitles: "Search anime subtitles",
      toggleNativeSubtitleBlur: "Toggle native subtitle blur",
      subtitleTrackDetectedSingular: "1 subtitle track detected",
      subtitleTracksDetected: "subtitle tracks detected",
      noSubtitleTracksDetected: "No subtitle tracks detected yet.",
      resizeTranscriptPanel: "Resize transcript panel",
      resizeSubtitleTracksPanel: "Resize subtitle tracks panel",
      subtitlePanelMode: "Mode",
      subtitleLines: "Lines",
      shadow: "Shadow",
      subtitleTracks: "Tracks",
      batchMiningNoDestination: "Enable JPDB/Jiten API mining or Anki mining first.",
      subtitleTrackTiming: "Subtitle timing",
      subtitleOffsetPrevious: "Align previous subtitle to current time",
      subtitleOffsetNext: "Align next subtitle to current time",
      subtitleOffsetPreviousShort: "Prev",
      subtitleOffsetNextShort: "Next",
      subtitleOffsetEarlier: "Show subtitles 100 ms earlier",
      subtitleOffsetLater: "Show subtitles 100 ms later",
      resetSubtitleOffset: "Reset subtitle timing",
      copySubtitleLine: "Copy subtitle line",
      subtitleCopyIncludeTranslation: "Copy line translation too",
      peekSubtitleTranslation: "Show translation",
      hideSubtitleTranslation: "Hide translation",
      loadingSubtitleLines: "Loading subtitle lines",
      waitingForCaptionLines: "Waiting for caption lines",
      subtitleCurrentLineWillAppear: "Current line appears when captions load.",
      seekSubtitleLine: "Seek subtitle line",
      subtitleTracksHint: "Choose a primary track. Use Lines to jump.",
      autoDetectedTracksWillAppear: "Subtitle tracks appear here.",
      autoDetectedOptionSingular: "1 subtitle option",
      autoDetectedOptions: "subtitle options",
      detected: "Detected",
      primaryOverlay: "primary overlay",
      nativeOverlay: "native overlay",
      unsetPrimarySubtitles: "Unset primary",
      primarySubtitles: "Primary",
      unsetNativeSubtitles: "Unset native",
      nativeSubtitles: "Native",
      choosePrimarySubtitles: "Choose primary subtitles",
      transcript: "Transcript",
      subtitleOptionSingular: "option",
      subtitleOptionPlural: "options",
      subtitleLineSingular: "line",
      subtitleLinePlural: "lines",
      trackKindPageTrack: "page track",
      trackKindPageFile: "page file",
      trackKindYouTubeCaptions: "YouTube captions",
      youTubeSubtitles: "YouTube subtitles",
      autoGeneratedSubtitle: "auto-generated",
      trackKindLoadedFile: "loaded file",
      trackStatusLoading: "loading",
      trackStatusWaiting: "waiting for captions",
      trackStatusFailed: "failed",
      moveSubtitles: "Move subtitles",
      moveSubtitlesAccessible: "Move subtitles. Drag, or use the arrow and Page Up/Page Down keys. Press Home or 0 to reset.",
      moveSubtitleControls: "Subtitle controls. Tap to expand or collapse. Drag, or use the arrow keys, to move. Press Home or 0 to reset.",
      toggleImageReading: "Toggle image reading",
      toggleSubtitleOverlay: "Toggle subtitle overlay",
      toggleYoutubeImmersion: "Toggle YouTube filter",
      readImagesNow: "Read images now",
      massReviewVisible: "Mass review visible words (Jiten)",
      studyReveal: "Study: reveal card",
      studyRevealAlternate: "Study: reveal card (alternate)",
      studyUndo: "Study: undo last review",
      studyPrevious: "Study: previous card",
      studyPreviousAlternate: "Study: previous card (alternate)",
      studyNext: "Study: next card",
      studyNextAlternate: "Study: next card (alternate)",
      massReviewNoWords: "No due Jiten words on screen.",
      massReviewNoKey: "Add a Jiten API key to mass review.",
      massReviewDone: "Reviewed {count} words as Good.",
      massReviewFailed: "Mass review failed.",
      adapterStateDisabled: "Off",
      adapterStateProbing: "Probing",
      adapterStateUnreachable: "Unreachable",
      adapterStateConnected: "Connected",
      adapterStateScanning: "Scanning",
      adapterStateSuggested: "Mapped",
      adapterStateStale: "Needs review",
      adapterStateReady: "Ready",
      ankiMappingConfidenceHigh: "high match",
      ankiMappingConfidenceMedium: "fuzzy match",
      ankiMappingConfidenceLow: "unmapped",
      ankiMappingStaleField: "saved field missing",
      ocrPlayVideo: "Play video",
      ocrPausedFrameScanning: "Scanning...",
      ocrPausedFrameReady: "Text ready",
      ocrPausedFrameNoText: "No text found",
      ocrPausedFrameFailed: "Could not read text",
      ocrRetryScan: "Scan again",
      ocrNoReadableImages: "No readable images nearby.",
      gradeNothing: "Grade NOTHING",
      gradeSomething: "Grade SOMETHING",
      gradeHard: "Grade HARD",
      gradeOkay: "Grade OKAY",
      gradeEasy: "Grade EASY",
      gradeFail: "Pass/fail: FAIL",
      gradePass: "Pass/fail: PASS",
      helpLinksTitle: "Useful pages",
      helpLinksCopy: "Open reader tools and docs from here.",
      versionAndUpdates: "Version",
      currentYomuVersion: "Yomu",
      updateStatusIdle: "Current {current}. Latest check pending.",
      updateStatusChecking: "Current {current}. Checking latest...",
      updateStatusCurrent: "Current {current}. Latest {latest}. Up to date.",
      updateStatusAvailable: "Current {current}. Latest {latest}. Update available.",
      updateStatusUnknown: "Current {current}. Latest check failed; reinstall if needed.",
      updateStatusIncomparable: "Current {current}. Latest {latest}. Cannot compare versions; use Update if this install is old.",
      updateHelpNotesManager: 'Keep one Yomu script enabled. Update opens your userscript manager’s install screen. If the browser shows a blocked-install banner instead, open your extensions page, open the manager’s details, and turn on "Allow user scripts" (or Developer mode), then retry.',
      updateHelpNotesManagerDashboard: "On Chrome or Edge, Update opens the Tampermonkey dashboard instructions: Utilities → Check for userscript updates. This avoids the browser’s blocked website-install banner.",
      updateHelpNotesExternalManager: "Keep one Yomu script enabled. Update opens the script source; your userscript app reads it from the open tab to update. If updates stall on iPhone/iPad, open this link in Safari and leave the tab open.",
      updateHelpNotesNoManager: "No userscript manager was detected here, and browsers block direct script installs — Update opens the install guide with per-browser steps.",
      updateUserscript: "Update",
      duplicateStatusSingle: "One Yomu runtime active ({kind}).",
      duplicateStatusUnknown: "Duplicate check unavailable. If Yomu appears twice, disable the older script.",
      ankiConnectSetupTitle: "AnkiConnect setup",
      ankiConnectSetupCopy: "Keep desktop Anki open with AnkiConnect enabled. Hosted Study needs AnkiConnect to allow the Yomu origin.",
      ankiConnectSetupConfig: "Add these origins to AnkiConnect's webCorsOriginList, keeping any existing entries:",
      ankiConnectSetupMobile: "For phone or iPad, use the desktop computer's LAN or Tailscale URL; localhost on a phone means the phone itself.",
      ankiConnectSetupBrave: "In Brave, disable Shields for the Study page if local Anki checks are blocked.",
      helpSupportTitle: "Support よむ",
      helpSupportCopy: SUPPORT_COPY,
      helpSupportCopyExtra: SUPPORT_COPY_EXTRA,
      videoPlayer: "Video Player",
      pdfReader: "PDF Reader",
      academy: "Academy",
      newTabPage: "Study",
      localAudio: "Local Audio",
      changelog: "Changelog",
      support: "Support",
      github: "GitHub",
      word: "Word",
      search: "Search",
      newTabAddressCopied: "Study address copied.",
      loading: "Loading...",
      reveal: "Reveal",
      revealTranslation: "Reveal translation",
      immersionExampleControls: "Immersion Kit example controls",
      loadingKanjiDetails: "Loading kanji details...",
      loadingMnemonicImages: "Loading mnemonic images...",
      lookupDialog: `${APP_NAME} lookup`,
      resizeLookupSheet: "Drag to resize lookup sheet, or tap to close",
      showMiningActions: "Show mining actions",
      hideMiningActions: "Hide mining actions",
      switchReviewTarget: "Switch review target",
      switchGradingProvider: "Switch grading provider",
      apiGradingProvider: "Preferred grading service",
      apiGradingProviderHelp: "Which service the popover grades when a word exists in both Jiten and JPDB. Bunpro cards grade to Bunpro; the ⇄ toggle next to the grade buttons switches per word.",
      jpdbKanjiUpdated: "JPDB kanji updated.",
      jpdbKanjiUpdateFailedRuntime: "Could not update JPDB kanji. Check kanji reviews.",
      apiSrsActionsDisabled: "API mining actions are disabled in settings.",
      addJpdbApiKeyReview: "Add a JPDB API key to review JPDB cards.",
      addJitenApiKeyReview: "Add a Jiten API key to review Jiten cards.",
      addBunproApiKeyReview: "Add a Bunpro frontend API token to review Bunpro cards.",
      actionFailed: "Action failed.",
      dictionary: "Dictionary",
      dictionariesExported: "Dictionaries exported.",
      local: "Local",
      dict: "dict",
      filterStudy: "Study",
      filterAll: "All",
      sortFrequency: "Frequency",
      stateNew: "New",
      stateLearning: "Learning",
      stateYoung: "Young",
      stateMature: "Mature",
      stateDue: "Due",
      stateFailed: "Failed",
      stateKnown: "Known",
      stateMastered: "Mastered",
      stateNeverForget: "Never forget",
      stateSuspended: "Suspended",
      stateLocked: "Locked",
      stateBlacklisted: "Blacklisted",
      stateRedundant: "Redundant",
      stateFrequent: "Frequent",
      stateUnparsed: "Unparsed",
      stateInDeck: "In deck",
      stateNotInDeck: "Not in deck",
      ankiReviewSingular: "review",
      ankiReviewPlural: "reviews",
      ankiLapseSingular: "lapse",
      ankiLapsePlural: "lapses",
      gradeNothingLabel: "Nothing",
      gradeSomethingLabel: "Something",
      gradeHardLabel: "Hard",
      bunproGradeAgainLabel: "Again",
      bunproGradeHardLabel: "Hard",
      bunproGradeGoodLabel: "Good",
      bunproGradeEasyLabel: "Easy",
      gradeOkayLabel: "Okay",
      gradeEasyLabel: "Easy",
      gradeFailLabel: "Fail",
      gradePassLabel: "Pass",
      factKeyword: "Keyword",
      factType: "Type",
      factFrequency: "Frequency",
      factMeaning: "Meaning",
      factGrade: "Grade",
      factOldForms: "Old forms",
      docs: "Docs",
      factoryReset: "Factory Reset",
      factoryResetConfirm: "Reset all {appName} data?\n\nDeletes settings, keys, cache, dicts.",
      factoryResetFailed: "Reset failed.",
      factoryResetDictionaryWarning: "Settings reset. Close other tabs.",
      factoryResetOtherTabReloading: "よむ reset elsewhere. Reloading...",
      factoryResetDeleteSettingsFailed: "Could not delete settings.",
      issues: "Issues",
      donate: "Donate",
      discord: "Discord",
      openOnJpdb: "Open on JPDB",
      openOnLookup: "Open on {label}",
      copyWord: "Copy",
      copyWordTitle: "Copy word",
      copiedWord: "Copied word.",
      backToWord: "Back to word",
      backToKanji: "Back to kanji",
      previousKanji: "Previous kanji",
      nextKanji: "Next kanji",
      openKanjiOnJpdb: "Open kanji on JPDB",
      strokePractice: "Stroke order + practice",
      practiceDrawing: "Practice drawing",
      strokes: "strokes",
      textTrace: "text trace",
      hideTrace: "Hide trace",
      showTrace: "Show trace",
      clear: "Clear",
      originStructure: "Component graph",
      originMapLabel: "2D kanji origin and component map",
      originShowSubcomponents: "Subcomponents",
      originShowOutbound: "Outbounds",
      kanjiAlive: "Kanji Alive",
      wiktionary: "Wiktionary",
      radical: "Radical",
      readingsComponents: "Readings and components",
      showKanji: "Show kanji",
      jpdbMnemonic: "JPDB mnemonic",
      rtkComponentKeywords: "RTK component keywords",
      onReading: "On",
      kunReading: "Kun",
      heisigStory: "Heisig story",
      heisigComment: "Heisig comment",
      koohiiStories: "Koohii stories",
      add: "Add",
      addToDeck: "Add to deck",
      deck: "Deck",
      deckActions: "Deck actions",
      reviewAddsToDeck: "Reviewing will add new words to",
      reviewBlockedBlacklisted: "Blacklisted. Unlist before reviewing.",
      reviewBlockedNeverForget: "Never-forget. Remove before reviewing.",
      reviewBlockedRedundant: "JPDB marks this redundant.",
      ankiCardsSuspended: "Suspended in Anki (works like a blacklist).",
      ankiCardsUnsuspended: "Unsuspended in Anki.",
      ankiNeverForgetTagAdded: "Tagged yomu-never-forget.",
      ankiNeverForgetTagRemoved: "Removed yomu-never-forget.",
      forget: "Forget",
      never: "Never forget",
      unlist: "Unlist",
      blacklist: "Blacklist",
      vocabularyStatusUpdated: "Vocabulary status updated.",
      addToAnki: "Add to Anki",
      sendToMobileAnki: "Send to {app}",
      ankiAudioFileNotFound: "Anki audio file not found.",
      ankiAudioPlaybackUnavailable: "Anki audio playback is not available here.",
      ankiAudioUnavailablePreview: "Audio not available in preview",
      ankiAudioFilenameLabel: "Anki audio {filename}",
      ankiStoredFields: "Stored fields",
      ankiCardDetailsPending: "Matched in Anki. Loading details...",
      ankiCardDetailsUnavailable: "Matched in Anki. showing cached status.",
      ankiNewCard: "New card",
      ankiMatches: "Anki matches",
      gradeAnkiCardTarget: "Grades Anki card: {target}",
      gradeJpdbCardTarget: "Grades API SRS card",
      ankiNoteNotFound: "Anki note not found.",
      mergeYomu: "Merge Yomu",
      mergeYomuTitle: "Update matching fields and add Yomu media to this note",
      editInAnki: "Edit in Anki",
      keepBothAudio: "Keep both",
      keepAnkiAudio: "Keep Anki",
      useYomuAudio: "Use Yomu",
      lastSeen: "Last seen",
      unavailable: "Unavailable",
      openedInAnki: "Opened in Anki.",
      addedToDeckAndReviewed: "Added to deck and reviewed.",
      sentToAnki: "Sent to Anki.",
      openedMobileAnkiHandoff: "Opened Anki handoff. Continue in Anki.",
      alreadyInAnki: "Already in Anki. Use Edit in Anki instead.",
      removedFromDeck: "Removed from deck.",
      addedToDeckToast: "Added to deck.",
      apiDeckMediaNotSupported: "Media stays in Yomu; no media API.",
      sentToAnkiWithContextImageAndAudio: "Sent to Anki with image and audio.",
      sentToAnkiWithContextImage: "Sent to Anki with image.",
      sentToAnkiWithAudio: "Sent to Anki with audio.",
      ankiMergeNoNewData: "Anki note already has the Yomu data.",
      ankiMergeFieldSingular: "field",
      ankiMergeFieldPlural: "fields",
      ankiMergeAudio: "audio",
      ankiMergeImage: "image",
      ankiMergeComplete: "Merged Yomu data into Anki ({parts}).",
      ankiHandoffCancelled: "Anki handoff cancelled.",
      ankiConnectActionFailed: "AnkiConnect action failed.",
      ankiConnectRequestFailed: "AnkiConnect request failed.",
      ankiConnectTimedOut: "AnkiConnect timed out.",
      mobileAnkiReady: "Anki offline. Handoff can create notes.",
      ankiConnectionReady: "Connected. AnkiConnect is reachable.",
      ankiConnectedReady: 'Connected. "{deck}" / "{model}" ready.',
      ankiPromptRecallWord: "Recall the highlighted word.",
      ankiMeaningHeading: "Meaning",
      ankiPitchHeading: "Pitch",
      ankiPartOfSpeechHeading: "Part of speech",
      ankiLinksHeading: "Links",
      ankiSourceHeading: "Source",
      ankiLocalDictionaryStatus: "local dictionary",
      composedOf: "Composed of",
      ocrModeAutoToast: "Image OCR automatic.",
      ocrModeManualToast: "Image OCR on tap or hover.",
      ocrModeOffToast: "Image OCR off.",
      subtitleOverlayEnabled: "Subtitle overlay enabled.",
      subtitleOverlayHidden: "Subtitle overlay hidden.",
      reviewFailed: "Review failed.",
      reviewActionsDisabled: "Review actions are disabled in settings.",
      jpdbLookupFailed: "JPDB lookup failed.",
      jpdbDeckStateApiKeyRequired: "Add a JPDB API key to change JPDB deck state.",
      jpdbAddApiKeyRequired: "Add a JPDB API key, or use Add to Anki.",
      addedToJpdb: "Added to JPDB.",
      jitenDeckStateApiKeyRequired: "Add a Jiten API key to change Jiten vocabulary state.",
      jitenAddApiKeyRequired: "Add a Jiten API key, or use Add to Anki.",
      bunproAddApiKeyRequired: "Add a Bunpro frontend API token, or use Add to Anki.",
      yomuLocalSrsDisabled: `Enable ${ACADEMY_SRS_LABEL} in Settings first.`,
      chooseJitenStudyDeck: "Choose a Jiten study deck first.",
      addedToJiten: "Added to Jiten.",
      addedToBunpro: "Added to Bunpro.",
      addedToYomuLocal: `Added to ${ACADEMY_SRS_LABEL}.`,
      kanjiDetailsUnavailable: "Kanji details are not available yet.",
      loadingDictionaryDetails: "Loading dictionary details...",
      jitenCompositeWords: "Composite words",
      usedInVocabulary: "Used in vocabulary",
      exampleSentences: "Example sentences",
      noExampleSentences: "No example sentences",
      exampleSentencesUnavailable: "Example sentences unavailable",
      acceptedInputs: "Accepted inputs",
      relatedWords: "Related words",
      bunproUsedInVocab: "Used in",
      relatedGrammar: "Related grammar",
      antonymWord: "Antonym",
      bunproCaution: "Caution",
      bunproStructure: "Structure",
      playJpdbExampleAudio: "Play JPDB example audio",
      contextVideo: "Video",
      contextImage: "Image",
      contextCurrentPage: "Current page",
      jpdbKanjiActionMine: "Add",
      jpdbKanjiActionKnown: "Known",
      jpdbKanjiActionNeverForget: "Never forget",
      jpdbKanjiActionForget: "Forget",
      jpdbKanjiActionBlacklist: "Blacklist",
      jpdbKanjiActionReview: "Review",
      noDefinitions: "No enabled definition source returned results.",
      enabledHeader: "On",
      labelHeader: "Label",
      detailsHeader: "Details",
      displayName: "Display name",
      orderHeader: "Order",
      removeHeader: "Remove",
      definitionSource: "Definition source",
      kanjiSection: "Kanji section",
      dragToReorder: "Drag to reorder",
      moveUp: "Move up",
      moveDown: "Move down",
      remove: "Remove",
      removeImportedDictionary: "Remove imported dictionary",
      customAdvanced: "{label} (advanced)",
      importLocalDefinitionsHelp: "Import Yomitan for local definitions.",
      frequencyMetadataHelp: "Frequency, pitch, and kanji metadata for badges.",
      sourceHelpJpdb: "JPDB meanings from the current card.",
      sourceHelpJiten: "Jiten meanings, examples, and related words.",
      sourceHelpBunpro: "Bunpro vocabulary and grammar meanings, nuance, and examples.",
      sourceHelpAnki: "Matching Anki card content and status.",
      sourceHelpTranslation: "Sentence translation.",
      sourceHelpGrammar: "Local grammar hints.",
      sourceHelpImmersionKit: "Example sentences, images, and audio.",
      sourceNameImmersionKit: "Immersion Kit",
      sourceNameAnki: "Anki",
      sourceNameTranslation: "Translation",
      sourceNameGrammar: "Grammar",
      sourceNameStrokePractice: "Stroke practice",
      sourceNameImportedKanjiDictionaries: "Imported kanji dictionaries",
      sourceNameWordsUsingKanji: "Related vocabulary",
      sourceNameJitenKanjiFacts: "Jiten kanji facts",
      sourceHelpImportedKanjiDictionary: "Imported Yomitan kanji dictionary.",
      sourceHelpStrokePractice: "Stroke order preview and drawing pad.",
      sourceHelpReadingsComponents: "JPDB readings, components, and mnemonic.",
      sourceHelpJitenKanjiFacts: "Jiten kanji facts, frequency, readings, words.",
      sourceHelpRtk: "RTK keywords, elements, and stories.",
      sourceHelpUchisen: "Uchisen mnemonic image carousel.",
      uchisenMnemonicImages: "Uchisen mnemonic images",
      uchisenMnemonicFor: "Uchisen mnemonic for {kanji}",
      noUchisenImagesYet: "No Uchisen images yet.",
      generateUchisenImage: "Generate image",
      generateUchisenImageToggle: "Generate image +",
      uchisenMnemonicStory: "Mnemonic story",
      uchisenImagePrompt: "Image prompt",
      uchisenGenerateHint: "Edit story/prompt, then publish a Uchisen image.",
      uchisenGeneratingImage: "Generating image...",
      uchisenPublishingMnemonic: "Publishing mnemonic...",
      uchisenGeneratedImage: "Uchisen image published.",
      uchisenGenerateFailed: "Could not generate Uchisen image.",
      uchisenLoginRequired: "Log in to Uchisen to generate images.",
      noStoryAvailable: "No story available",
      sourceHelpImportedKanjiDictionaries: "Imported Yomitan kanji entries.",
      sourceHelpWordsUsingKanji: "Related vocabulary.",
      sourceHelpComponentGraph: "Kanji facts, components, radical images.",
      recommendedJitendex: "Term definitions with examples.",
      recommendedJmdict: "Core term definitions.",
      recommendedJmnedict: "Proper names.",
      recommendedWtyJapaneseJapanese: "Japanese-to-Japanese term definitions.",
      recommendedPixivLight: "Pixiv terms.",
      recommendedKanjidic: "Kanji facts.",
      recommendedJpdbKanji: "JPDB kanji.",
      recommendedKanjiumPitch: "Pitch accents only; add a term dictionary for definitions.",
      recommendedJpdbv2Kana: "Recommended frequency badges from JPDB.",
      recommendedBccwj: "Frequency badges from BCCWJ.",
      recommendedJiten: "Frequency badges from Jiten.",
      lines: "Lines",
      tracks: "Tracks",
      native: "Native",
      options: "options",
      option: "option",
      line: "line",
      translation: "Translation",
      grammar: "Grammar",
      meaning: "Meaning",
      readSentenceAloud: "Read sentence aloud",
      openSectionToTranslate: "Open this section to translate.",
      translationUnavailable: "Translation unavailable.",
      translating: "Translating...",
      findingGrammar: "Finding grammar...",
      grammarKnown: "Known",
      grammarReview: "Review",
      grammarDetails: "Details",
      grammarFoundIn: "Found in",
      grammarExample: "Example",
      grammarGuide: "Guide",
      grammarHideKnown: "Hide known",
      grammarShowKnown: "Show known",
      allDetectedGrammarKnown: "All detected grammar is marked known.",
      grammarShown: "shown",
      grammarKnownHidden: "known hidden",
      grammarGenericShort: "Grammar point: {name}",
      grammarGenericDetail: "Uses {name} in 「{match}」.",
      grammarLevelCore: "Core"
    }
  };
  function parseUiCopyTable(rows) {
    const copy = {};
    rows.trim().split("\n").forEach((row) => {
      const tab = row.indexOf("	");
      if (tab < 0) {
        const key = row.trim();
        if (key) copy[key] = "";
        return;
      }
      if (tab === 0) return;
      copy[row.slice(0, tab)] = row.slice(tab + 1).replaceAll("{APP_NAME}", APP_NAME);
    });
    return copy;
  }
  const JA_COPY = parseUiCopyTable(String.raw`
settingsTitle	{APP_NAME} 設定
welcomeLabel	{APP_NAME} ようこそ
onboardingEyebrow	日本語がある場所ならどこでも
onboardingCopy	本文、字幕、画像の日本語をタップ可能にします。
onboardingLanguage	表示言語
onboardingAccentColor	アクセントカラー
customAccentColor	カスタムカラー
onboardingImmersionOptions	没入設定の初期値
onboardingInstallOfflineDictionaries	オフライン辞書をダウンロード（Jitendex＋ピッチアクセント）
offlineDictionarySetupComplete	オフライン辞書をインストールしました。
offlineDictionarySetupFailed	オフライン辞書のセットアップに失敗しました。設定→ソースから再試行してください。
onboardingHoverShortcut	ホバー検索の修飾キー
onboardingAddApiKey	APIキーを追加
onboardingUseWithoutApiKey	APIキーなしで使う
closeOnboarding	ようこそ画面を閉じる
featureText	テキスト
featureTextBody	日本語をホバー/タップできます。
featureImages	画像
featureImagesBody	画像をタップして読み取れます。
featureVideo	動画
featureVideoBody	字幕内の語もタップできます。
featureControl	調整
featureControlBody	機能、キー、色を調整できます。
featureStudy	学習
featureStudyBody	学習ページで単語と漢字を復習。
featureGame	ゲーム
featureGameBody	Yomuアプリをインストールすると、ゲームやPC上のどこでも使えます。
automatic	自動
english	英語
japanese	日本語
settings	設定
settingsSaved	設定を保存しました。
settingsSaveFailed	設定を保存できませんでした。
dictionaries	辞書
sources	ソース
localWordSingular	項目
localWordPlural	項目
kanji	漢字
audio	音声
front	表面
back	裏面
newTabPage	学習
word	単語
search	検索
switchToLightTheme	ライトテーマに切り替え
switchToDarkTheme	ダークテーマに切り替え
newTabAddressCopied	学習ページのアドレスをコピーしました。
loading	読み込み中...
reveal	表示
revealTranslation	翻訳を表示
immersionExampleControls	イマージョンキット例文の操作
loadingKanjiDetails	漢字情報を読み込み中...
loadingMnemonicImages	覚え方画像を読み込み中...
lookupDialog	{APP_NAME}検索
resizeLookupSheet	検索シートをリサイズ。タップで閉じる
showMiningActions	マイニング操作を表示
hideMiningActions	マイニング操作を隠す
switchReviewTarget	採点先を切り替える
switchGradingProvider	採点サービスを切り替える
apiGradingProvider	優先採点サービス
apiGradingProviderHelp	JitenとJPDBの両方にある単語をどちらで採点するかの設定です。BunproのカードはBunproで採点されます。採点ボタン横の⇄で単語ごとに切り替えできます。
closeDrawer	ドロワーを閉じる
copiedWord	単語をコピーしました。
jpdbKanjiUpdated	JPDB漢字を更新しました。
jpdbKanjiUpdateFailedRuntime	JPDB漢字を更新できません。
apiSrsActionsDisabled	設定でAPI採掘操作が無効です。
addJpdbApiKeyReview	JPDBレビューにはAPIキーが必要です。
addJitenApiKeyReview	JitenレビューにはAPIキーが必要です。
addBunproApiKeyReview	Bunproレビューにはfrontend_api_tokenが必要です。
actionFailed	操作に失敗しました。
noDefinitions	有効な定義ソースから結果が返りませんでした。
dictionary	辞書
dictionariesExported	辞書をエクスポートしました。
saveAfterInstall	インストール後に保存
dictionaryDownloading	ダウンロード中
dictionaryReadingZip	辞書ZIPを読み取り中...
dictionaryCheckingIndex	インデックス確認中...
dictionaryBanksFound	{count}件のバンクを検出
dictionaryRemovingExisting	既存項目を削除中
dictionaryReadingBank	読み取り中
dictionaryParsingBank	解析中
dictionarySavingBank	保存中
dictionaryImporting	インポート中
importingBundledDictionaries	同梱辞書をインポート中...
dictionaryImported	インポート済み
dictionaryPreparingImport	インポート準備中
dictionaryRecords	辞書レコード
dictionaryEntries	件
dictionaryTotal	合計
dictionaryDownloadProgress	辞書をダウンロード中
dictionaryStatusSummary	辞書{dictionaries}、語{terms}、漢字{kanji}、メタ{metadata}
dictionaryStatusUnavailable	辞書状態を取得不可。
noLocalDictionariesImported	辞書は未追加です。まず定義用の語句辞書を追加してください。
dictionaryDownloadFailed	辞書のダウンロードに失敗しました。
dictionaryDownloadTimedOut	辞書のダウンロードがタイムアウトしました。
dictionaryDownloadNotZip	ダウンロード結果がZIPではありません。
dictionaryDownloadNeedsBridge	ブリッジが必要です。失敗時はZIPを追加。
dictionaryDownloadBlocked	ダウンロード不可。ZIPを追加。
dictionaryManualDownloadHint	ユーザースクリプト有効化かZIP追加。
dictionaryInstallQueueHelp	まず定義用の語句辞書をインストールしてください。ピッチ/頻度辞書はアクセントやバッジを追加しますが、通常の定義文は追加しません。
dictionaryInstallQueued	{dictionary}待機中。
dictionaryInstallSaveBlocked	インポート中。完了後に保存できます。
dictionaryImportQueueStatus	{count}件インストール中。完了後に保存。
dictionaryRemoveConfirm	「{dictionary}」を削除？
dictionaryRemoving	{dictionary}を削除中...
dictionaryRemoved	{dictionary}を削除しました。
dictionaryImportComplete	{sources}から{records}件インポートしました。
dictionaryRecordsImported	{dictionary}: {records}件
settingsImported	設定をインポートしました。
settingsImportedWithDetails	設定をインポートしました。{details}
settingsExported	設定をエクスポートしました。
restoredStoredChoices	保存済み選択肢を{count}件復元
importedDictionaryRecordCount	辞書レコードを{count}件インポート
dictionaryNoSupportedBanks	対応辞書バンクがありません。
dictionaryUnsupportedJson	Dexie、ZIP、出力を使ってください。
dictionaryZipMissingIndex	ZIPにindex.jsonがありません。
yomitanSettingsInvalid	Yomitan設定ではありません。
local	ローカル
dict	辞書
scanPage	ページをスキャン
noUnscannedJapaneseText	未スキャンの日本語テキストはありません。
jpdbScanFailed	ページスキャンに失敗しました。
pageCoverageSummary	{percent}%・{known}/{total}・新{unknown}・i+1 {iPlusOne}
noImmersionExamplesCompact	例文なし
kanjiAlive	カンジアライブ
wiktionary	ウィクショナリー
lines	行
tracks	トラック
native	母語
options	件
option	件
line	行
filterStudy	学習
filterAll	すべて
sortFrequency	頻度
stateNew	新規
stateLearning	学習中
stateYoung	若い
stateMature	成熟
stateDue	復習予定
stateFailed	失敗
stateKnown	既知
stateMastered	習得済み
stateNeverForget	忘れない
jpdbAndJitenApiKeysConfigured	JitenとJPDBキーあり。
stateSuspended	停止中
stateLocked	ロック中
stateBlacklisted	ブラックリスト
stateRedundant	重複
stateFrequent	頻出
stateUnparsed	未解析
stateInDeck	デッキ内
stateNotInDeck	デッキ外
gradeAnkiCardTarget	Ankiカードを採点: {target}
gradeJpdbCardTarget	API SRSカードを採点
ankiReviewSingular	回復習
ankiReviewPlural	回復習
ankiLapseSingular	回失敗
ankiLapsePlural	回失敗
gradeNothingLabel	全然
gradeSomethingLabel	少し
gradeHardLabel	難しい
bunproGradeAgainLabel	もう一度
bunproGradeHardLabel	難しい
bunproGradeGoodLabel	良い
bunproGradeEasyLabel	簡単
gradeOkayLabel	OK
gradeEasyLabel	簡単
gradeFailLabel	失敗
gradePassLabel	合格
gradeNothing	採点: 全然
gradeSomething	採点: 少し
gradeHard	採点: 難しい
gradeOkay	採点: OK
gradeEasy	採点: 簡単
gradeFail	合否: 失敗
gradePass	合否: 合格
studyReveal	学習: カードを表示
studyRevealAlternate	学習: カードを表示（代替）
studyUndo	学習: 直前のレビューを取り消す
studyPrevious	学習: 前のカード
studyPreviousAlternate	学習: 前のカード（代替）
studyNext	学習: 次のカード
studyNextAlternate	学習: 次のカード（代替）
factKeyword	キーワード
factType	種類
factFrequency	頻度
factMeaning	意味
factGrade	学年
factOldForms	旧字体
noSimilarWords	追加の単語は見つかりませんでした。
loadingExamples	例文を読み込み中...
immersionKitRateLimited	Immersion Kit制限中。あとで再試行。
immersionKitRequest	Immersion Kitリクエスト
immersionKitRequestFailed	Immersion Kitリクエストに失敗しました。
immersionKitRequestFailedWithStatus	Immersion Kitリクエストに失敗しました（{status}）。
immersionKitRequestTimedOut	Immersion Kitリクエストがタイムアウトしました。
immersionKitSearchBlocked	Immersion Kit検索がブロック中です。CORSを設定してください。
immersionKitMediaRequest	メディアリクエスト
immersionKitMediaRequestFailed	メディアリクエストに失敗しました。
immersionKitMediaRequestFailedWithStatus	メディアリクエストに失敗しました（{status}）。
immersionKitMediaRequestTimedOut	メディアリクエストがタイムアウトしました。
immersionKitMediaRequestReturnedNonMedia	メディアリクエストがエラードキュメントを返しました。
immersionKitNoMediaCandidate	読み込めるメディア候補なし。
nadeshikoRequest	Nadeshikoリクエスト
nadeshikoRequestFailed	Nadeshikoリクエストに失敗しました。
nadeshikoRequestFailedWithStatus	Nadeshikoリクエストに失敗しました（{status}）。
nadeshikoRequestTimedOut	Nadeshikoリクエストがタイムアウトしました。
previousExample	前の例文
nextExample	次の例文
playExampleAudio	例文音声を再生
openOnJpdb	JPDBで開く
openOnLookup	{label}で開く
copyWord	コピー
copyWordTitle	単語をコピー
backToWord	単語に戻る
backToKanji	漢字に戻る
previousKanji	前の漢字
nextKanji	次の漢字
openKanjiOnJpdb	JPDBで漢字を開く
playAudio	音声を再生
audioPlaybackDisabled	音声再生は無効です
audioPlaybackDisabledToast	音声再生は無効です。
audioPlaybackFailed	音声の再生に失敗しました。
noSentenceToRead	読み上げる例文がありません。
noTextToRead	読み上げるテキストがありません。
jpdbExampleAudioUnavailable	この例文にJPDB音声なし。
jpdbAudioPlayableFileMissing	JPDB音声に再生ファイルなし。
jpdbAudioResponseNotPlayable	JPDB音声は再生不可。
audioSourceReturnedNoAudio	音声ソースに音声なし。
audioJsonMissingPlayableUrl	音声JSONに再生URLなし。
textToSpeechUnavailable	読み上げを利用できません。
textToSpeechFailed	読み上げに失敗しました。
audioRequest	音声リクエスト
audioRequestTimedOut	音声リクエストがタイムアウトしました。
audioRequestReturnedNonAudioWithType	音声ではない応答です: {type}。
audioUnknownContentType	不明なコンテンツ種別
japanesePod101NoAudio	JapanesePod101に音声なし。
invalidJpdbAudioId	JPDB音声IDが無効です。
couldNotReadAudio	音声を読み取れませんでした。
couldNotReadAudioBlob	音声データを読み取れませんでした。
previousSubtitle	前の字幕
nextSubtitle	次の字幕
jumpToCurrentSubtitle	現在の字幕へ移動
pauseVideo	動画を一時停止
readVideoFrame	動画フレームを読み取る（OCR）
readVideoFrameStop	動画フレームの読み取りを停止（OCR）
copySubtitle	字幕をコピー
subtitleFallbackLabel	字幕
subtitlesTitle	字幕
openSubtitlePanel	字幕パネルを開く
closeSubtitlePanel	字幕パネルを閉じる
subtitleStyle	字幕スタイル
subtitleResetDefaults	標準に戻す
enableSubtitleAutoHide	再生中はパネルを自動で隠す
disableSubtitleAutoHide	再生中もパネルを開いたままにする
subtitlePanelOptions	パネル設定
loadJapaneseSubtitles	日本語字幕を読み込む
loadNativeSubtitles	母語字幕を読み込む
searchAnimeSubtitles	アニメ字幕を検索
toggleNativeSubtitleBlur	母語字幕のぼかしを切り替え
subtitleTrackDetectedSingular	字幕トラックを1件検出
subtitleTracksDetected	件の字幕トラックを検出
noSubtitleTracksDetected	字幕トラックは未検出です。
resizeTranscriptPanel	文字起こしパネルのサイズ変更
resizeSubtitleTracksPanel	字幕トラックパネルのサイズ変更
subtitlePanelMode	表示
subtitleLines	行
shadow	シャドー
subtitleTracks	トラック
batchMiningNoDestination	JPDB/Jiten API採掘またはAnki採掘を有効にしてください。
subtitleTrackTiming	字幕タイミング
subtitleOffsetPrevious	前の字幕を現在時刻に合わせる
subtitleOffsetNext	次の字幕を現在時刻に合わせる
subtitleOffsetPreviousShort	前
subtitleOffsetNextShort	次
subtitleOffsetEarlier	字幕を100ミリ秒早く表示
subtitleOffsetLater	字幕を100ミリ秒遅く表示
resetSubtitleOffset	字幕タイミングをリセット
copySubtitleLine	字幕行をコピー
subtitleCopyIncludeTranslation	行コピー時に翻訳も含める
peekSubtitleTranslation	翻訳を表示
hideSubtitleTranslation	翻訳を隠す
loadingSubtitleLines	字幕行を読み込み中
waitingForCaptionLines	字幕行を待機中
subtitleCurrentLineWillAppear	字幕が来ると現在行を表示します。
seekSubtitleLine	字幕行へ移動
subtitleTracksHint	主字幕を選び、「行」で移動。
autoDetectedTracksWillAppear	字幕トラックはここに出ます。
autoDetectedOptionSingular	字幕オプション1件
autoDetectedOptions	件の字幕オプション
detected	検出済み
primaryOverlay	主字幕オーバーレイ
nativeOverlay	母語オーバーレイ
unsetPrimarySubtitles	主字幕を解除
primarySubtitles	主字幕
unsetNativeSubtitles	母語を解除
nativeSubtitles	母語
choosePrimarySubtitles	主字幕を選択
transcript	文字起こし
subtitleOptionSingular	件
subtitleOptionPlural	件
subtitleLineSingular	行
subtitleLinePlural	行
trackKindPageTrack	ページ内トラック
trackKindPageFile	ページ内ファイル
trackKindYouTubeCaptions	YouTube字幕
youTubeSubtitles	YouTube字幕
autoGeneratedSubtitle	自動生成
trackKindLoadedFile	読み込んだファイル
trackStatusLoading	読み込み中
trackStatusWaiting	字幕待機中
trackStatusFailed	失敗
ocrPlayVideo	動画を再生
ocrPausedFrameScanning	スキャン中...
ocrPausedFrameReady	テキスト準備完了
ocrPausedFrameNoText	テキストが見つかりません
ocrPausedFrameFailed	テキストを読み取れませんでした
ocrRetryScan	再スキャン
ocrNoReadableImages	近くに読み取れる画像がありません。
showKanji	漢字を表示
strokePractice	筆順と練習
practiceDrawing	手書き練習
strokes	画
textTrace	筆順ガイド
hideTrace	ガイドを隠す
showTrace	ガイドを表示
clear	クリア
originStructure	部品グラフ
originMapLabel	2D漢字由来・部品マップ
originShowSubcomponents	下位部品
originShowOutbound	派生先
radical	部首
readingsComponents	読みと部品
jpdbMnemonic	JPDBの覚え方
rtkComponentKeywords	RTK部品キーワード
onReading	音
kunReading	訓
heisigStory	Heisigストーリー
heisigComment	Heisigコメント
koohiiStories	Koohiiストーリー
add	追加
addToDeck	デッキに追加
deck	デッキ
deckActions	デッキ操作
reviewAddsToDeck	レビューすると新しい単語を追加します:
reviewBlockedBlacklisted	ブラックリスト入りです。解除するとレビューできます。
reviewBlockedNeverForget	「忘れない」設定です。解除するとレビューできます。
reviewBlockedRedundant	JPDBで冗長のためレビューできません。
ankiCardsSuspended	Ankiで保留にしました。
ankiCardsUnsuspended	Ankiの保留を解除しました。
ankiNeverForgetTagAdded	Ankiにyomu-never-forgetタグを付けました。
ankiNeverForgetTagRemoved	Ankiのyomu-never-forgetタグを外しました。
forget	忘れる
never	忘れない
unlist	解除
blacklist	ブラックリスト
vocabularyStatusUpdated	語彙状態を更新しました。
addToAnki	Ankiに追加
sendToMobileAnki	{app}へ送る
ankiAudioFileNotFound	Anki音声ファイルが見つかりません。
ankiAudioPlaybackUnavailable	ここではAnki音声を再生できません。
ankiAudioUnavailablePreview	プレビューで音声を利用できません
ankiAudioFilenameLabel	Anki 音声 {filename}
ankiStoredFields	保存フィールド
ankiCardDetailsPending	Ankiで一致。カード詳細を読み込み中...
ankiCardDetailsUnavailable	Ankiで一致。キャッシュ状態を表示します。
ankiNewCard	新規カード
ankiMatches	Ankiの一致
ankiNoteNotFound	Ankiノートが見つかりません。
ankiHandoffCancelled	Ankiへの受け渡しがキャンセルされました。
ankiConnectActionFailed	AnkiConnectの操作に失敗しました。
ankiConnectRequestFailed	AnkiConnectリクエストに失敗しました。
ankiConnectTimedOut	AnkiConnectがタイムアウトしました。
ankiHostedCorsHint	webCorsOriginListに{origin}を追加してください。
mobileAnkiReady	Anki未接続。受け渡しでカード作成できます。
ankiConnectionReady	接続しました。AnkiConnectに到達できます。
ankiConnectedReady	接続済み。「{deck}」/「{model}」準備完了。
ankiPromptRecallWord	ハイライトされた単語を思い出してください。
ankiMeaningHeading	意味
ankiPitchHeading	ピッチ
ankiPartOfSpeechHeading	品詞
ankiLinksHeading	リンク
ankiSourceHeading	出典
ankiLocalDictionaryStatus	ローカル辞書
mergeYomu	Yomuを統合
mergeYomuTitle	一致フィールドを更新し、Yomuメディアを追加
editInAnki	Ankiで編集
keepBothAudio	両方残す
keepAnkiAudio	Ankiを残す
useYomuAudio	Yomuを使う
lastSeen	最後に見た場所
unavailable	利用不可
openedInAnki	Ankiで開きました。
addedToDeckAndReviewed	デッキに追加してレビューしました。
sentToAnki	Ankiに送信しました。
openedMobileAnkiHandoff	モバイルAnki受け渡しを開きました。
alreadyInAnki	すでにAnkiにあります。
removedFromDeck	デッキから削除しました。
addedToDeckToast	デッキに追加しました。
apiDeckMediaNotSupported	メディアはYomuに残ります。
sentToAnkiWithContextImageAndAudio	画像と音声付きでAnkiに送信しました。
sentToAnkiWithContextImage	画像付きでAnkiに送信しました。
sentToAnkiWithAudio	音声付きでAnkiに送信しました。
ankiMergeNoNewData	Yomuデータは反映済みです。
ankiMergeFieldSingular	フィールド
ankiMergeFieldPlural	フィールド
ankiMergeAudio	音声
ankiMergeImage	画像
ankiMergeComplete	YomuデータをAnkiに統合しました ({parts})。
composedOf	構成語
ocrModeAutoToast	画像OCRを自動にしました。
ocrModeManualToast	画像OCRをタップ/ホバーにしました。
ocrModeOffToast	画像OCRをオフにしました。
subtitleOverlayEnabled	字幕オーバーレイを有効にしました。
subtitleOverlayHidden	字幕オーバーレイを非表示にしました。
reviewFailed	レビューに失敗しました。
reviewActionsDisabled	設定でレビュー操作が無効です。
jpdbLookupFailed	JPDB検索に失敗しました。
jpdbDeckStateApiKeyRequired	JPDBデッキ変更にはAPIキーが必要です。
jpdbAddApiKeyRequired	JPDB APIキーかAnki追加が必要です。
addedToJpdb	JPDBに追加しました。
jitenDeckStateApiKeyRequired	Jiten状態変更にはAPIキーが必要です。
jitenAddApiKeyRequired	Jiten APIキーかAnki追加が必要です。
bunproAddApiKeyRequired	Bunproのfrontend_api_tokenかAnki追加が必要です。
yomuLocalSrsDisabled	先に設定でAcademyを有効にしてください。
chooseJitenStudyDeck	先にJiten学習デッキを選択してください。
addedToJiten	Jitenに追加しました。
addedToBunpro	Bunproに追加しました。
addedToYomuLocal	Academyに追加しました。
kanjiDetailsUnavailable	漢字情報はまだ利用できません。
loadingDictionaryDetails	辞書詳細を読み込み中...
jitenCompositeWords	複合語
usedInVocabulary	使われる単語
exampleSentences	例文
noExampleSentences	例文はありません
exampleSentencesUnavailable	例文を読み込めません
acceptedInputs	入力として認められる表現
relatedWords	関連語
bunproUsedInVocab	使われている単語
relatedGrammar	関連文法
antonymWord	対義語
bunproCaution	注意
bunproStructure	構造
playJpdbExampleAudio	JPDB例文音声を再生
kanjiDictionaries	漢字辞書
sourceNameWordsUsingKanji	関連語彙
contextVideo	動画
contextImage	画像
contextCurrentPage	現在のページ
jpdbKanjiActionMine	追加
jpdbKanjiActionKnown	既知
jpdbKanjiActionNeverForget	忘れない
jpdbKanjiActionForget	忘れる
jpdbKanjiActionBlacklist	ブラックリスト
jpdbKanjiActionReview	レビュー
immersionKit	イマージョンキット
translation	翻訳
grammar	文法
meaning	意味
readSentenceAloud	文を読み上げ
openSectionToTranslate	開くと翻訳します。
translationUnavailable	翻訳を利用できません。
translating	翻訳中...
findingGrammar	文法を検索中...
grammarKnown	既知
grammarReview	復習
grammarDetails	詳細
grammarFoundIn	検出箇所
grammarExample	例
grammarGuide	ガイド
grammarHideKnown	既知を隠す
grammarShowKnown	既知を表示
allDetectedGrammarKnown	検出文法はすべて既知です。
grammarShown	件表示
grammarKnownHidden	件の既知を非表示
grammarGenericShort	文法項目: {name}
grammarGenericDetail	「{match}」に「{name}」。
grammarLevelCore	基本
`);
  const JA_SETTINGS_COPY = parseUiCopyTable(String.raw`
settingsTitle	{APP_NAME} 設定
settingsSections	設定セクション
settingsSearch	設定を検索
settingsSearchPlaceholder	設定を検索
settingsSearchNoResults	一致なし。
save	保存
cancel	キャンセル
show	表示
hide	隠す
appearance	外観
reading	読解
sources	ソース
backupSync	バックアップと同期
backupSyncHelp	Yomuの設定を保存・移行できます。設定をJSONでエクスポート/インポート、辞書のバックアップ、Google Drive同期に対応しています。
backupMovedHelp	バックアップ・同期・設定/辞書のインポートとエクスポートは「バックアップと同期」セクションにあります。
media	メディア
mining	採掘
shortcuts	ショートカット
help	ヘルプ
reader	リーダー
images	画像テキスト (OCR)
video	動画
youTube	YouTube
anki	Anki
jpdb	JPDB
api	API
apiCredential	APIキー
apiCredentialJpdb	JPDB APIキー
apiCredentialJiten	Jiten APIキー
apiCredentialBunpro	Bunpro frontend API token
apiCredentialBunproLegacy	Bunpro APIキー
apiKey	APIキー
jitenApiKey	Jiten APIキー
apiAccess	APIアクセス
apiAccessHelp	各サービスの認証情報を設定します。Bunproに必要なのはフロントエンドトークンだけです。Bunpro設定から取り込み、パスワードと同様に扱ってください。保存時点では未確認です。Academyの復習はアカウントなしでも使えます。
jpdbSettings	JPDB設定
jitenSettings	Jiten設定
bunproSettings	Bunpro設定
jpdbApiKeyConfigured	JPDBキーあり。
jpdbConnected	JPDBに接続しました。
jpdbAndJitenConnected	JitenとJPDBに接続しました。
jpdbConnectionFailed	JPDBキーが無効か接続不可です。
statusReady	準備完了
statusAttention	設定が必要
statusError	エラー
disabledControlDescription	別設定で制御中。
jpdbMiningEnabled	APIの復習・デッキ変更を許可
bunproMiningEnabled	Bunproの復習・採掘を許可
yomuLocalSrsEnabled	Academyを有効化
addToForq	JPDB追加時にforqにもコピー
enableReviews	復習ボタンを表示
reviewRatingScale	復習評価の段階
gradeTargetSelector	採点先
gradeTargetBoth	両方
gradeTargetJpdb	JPDBを採点
gradeTargetJiten	Jitenを採点
gradeTargetBunpro	Bunproを採点
gradeTargetYomuLocal	Academyに記録
gradeTargetAnki	Ankiカードを採点: {target}
gradeTargetJpdbAndAnki	JPDB + Ankiカードを採点: {target}
gradeTargetJitenAndAnki	Jiten + Ankiカードを採点: {target}
gradeTargetBunproAndAnki	Bunpro + Ankiカードを採点: {target}
gradeTargetYomuLocalAndAnki	Academy + Ankiカードに記録: {target}
missingAnkiCardId	AnkiカードIDがありません。
jpdbPageEnhancements	辞書サイト拡張
jpdbPageEnhancementsEnabled	辞書ページを拡張
jpdbPageWordEnhancementsEnabled	単語・検索ページにソースを追加
jpdbPageKanjiEnhancementsEnabled	漢字ページにソースを追加
fivePoint	5段階: 全然から簡単まで
twoPoint	2段階: 失敗 / 合格
settingsLanguage	設定の表示言語
theme	テーマ
auto	自動
dark	ダーク
light	ライト
popupMode	ポップアップ表示
hoverPopupMode	ホバー時の表示
bottomSheet	下部シート
popover	ポップオーバー
stickyBottomSheet	検索後も開く
popoverBackdropEnabled	背後を暗くする
popoverWidth	ポップオーバー幅 (px)
popoverHeight	ポップオーバー高さ (px)
popoverHeightMode	ポップオーバー高さの動作
popoverHeightAvailable	空き領域まで
popoverHeightFixed	高さ設定を使う
readerFontFamily	リーダーUIフォント
popupFontFamily	ポップアップの日本語フォント
fontPresetYomuDefault	内蔵フォント
fontPresetJapaneseSans	日本語サンセリフ
fontPresetHiraginoYuGothic	ヒラギノ / 游ゴシック
fontPresetJapaneseRounded	日本語丸ゴシック
fontPresetJapaneseSerif	日本語明朝
fontPresetSystemUi	システムUI
fontPresetCustom	カスタム...
customFontFamily	カスタムフォント
popupFontWeight	ポップアップの日本語の太さ
enableLogging	診断ログを有効にする
diagnostics	診断
diagnosticsHelp	診断をコンソールへ出力します。
accentColor	アクセントカラー
newTab	学習
newTabEnabled	学習を新しいタブに設定
newTabAnkiEnabled	学習でAnkiカードを使う
newTabAnkiReviewDecks	Anki復習デッキ
newTabAnkiReviewDecksHelp	不要なデッキを外します。
newTabSource	学習の復習ソース
newTabAuto	自動: Academy・アカウント後に学習語
newTabApiSrs	API SRS（Jiten / JPDB）
newTabBunpro	Bunpro
newTabYomuLocal	Academy
dictionaryFallback	辞書フォールバック
newTabJpdbReviewMode	API復習モード
newTabJpdbReviewAuto	自動: ライブ漢字+API語彙
newTabLiveReview	ライブJPDB復習セッション
newTabApiVocabulary	API語彙のみ（デッキ順）
corsProxyUrl	クロスオリジンプロキシURL
newTabKanjiKeywordSource	漢字キーワードのソース
newTabKanjiKeywordAuto	自動: RTK、{service}、ローカル
newTabKanjiKeywordRtk	RTK / Heisig
newTabKanjiKeywordApiFacts	{service}漢字情報（Jiten / JPDB）
newTabKanjiKeywordLocal	ローカルカードの意味
newTabParsingEnabled	学習の文解析を有効にする
newTabFrontSentenceEnabled	単語カード表面に文を表示
newTabKanjiAutogradeEnabled	漢字書き取りを自動採点
newTabKanjiAutoSubmit	漢字評価を自動送信
newTabOfflineEnabled	学習をオフライン用にキャッシュ
newTabOfflineLimit	オフライン復習キャッシュ上限
newTabDailyGoalMinutes	1日の学習目標（分・0で無効）
newTabKanjiUnlockEnabled	漢字後に単語を解放
newTabStopAtBatchEnd	バッチの終わりで停止
newTabSwipeReviews	スワイプ採点（左=失敗、右=合格）
newTabShortcutHintsEnabled	学習のキーボードショートカットヒントを表示
newTabUrl	学習ページのアドレス
newTabOfflineHelp	カードと未送信採点を保存。
newTabAddressHelp	新規タブやiPadホーム画面用。
newTabJpdbDeck	学習のJPDBデッキ
newTabStudySteps	学習ステップ
newTabStudyStepsHelp	ドラッグで並べ替え。速く復習したいステップはオフにできます。表示と採点は常に最後です。
newTabStudyStepHeader	ステップ
newTabStudyStepKanji	漢字書き取り
newTabStudyStepWord	単語の意味
newTabStudyStepRecall	文で書く
newTabStudyStepListen	ピッチ聞き取り
newTabStudyStepSpeaking	発音
newTabStudyStepType	単語を書く
newTabStudyStepKanjiHelp	答えが出る前に各漢字を書きます。単語の意味を表示するので空欄が曖昧になりません。ヒントで漢字キーワードを出せます。
newTabStudyStepWordHelp	表は日本語、表示後に意味と読み。
newTabStudyStepRecallHelp	例文の空欄に単語を入力します。ヒントで最初の音、次に長さを表示。例文があるカードのみ表示。
newTabStudyStepListenHelp	音声を聞き、型の候補からピッチ型を選びます。正誤は最後の答え合わせまで表示しません。ピッチアクセント情報がある時のみ表示。
newTabStudyStepSpeakingHelp	単語をシャドーイングします。ピッチの高低をこの端末でお手本と比較して採点します。音声がある時のみ表示。
newTabStudyStepTypeHelp	聞いて発音した単語を書き出します。入力または漢字ごとの手書きで解答できます。セッション中はスキップ可能。
openNewTabPage	学習を開く
copyAddress	アドレスをコピー
wordColors	単語の色
wordColorNew	新規・デッキ内
wordColorLearning	学習中
wordColorKnown	既知・忘れない
wordColorDue	期限到来
wordColorFailed	失敗
wordColorIgnored	無視・保留・ブラックリスト中
pitchAccentColors	ピッチアクセントの色
pitchColorHeiban	平板
pitchColorAtamadaka	頭高
pitchColorNakadaka	中高
pitchColorOdaka	尾高
pitchColorUnknown	不明
noExactPitch	完全一致のピッチは利用不可
colorChannels	色チャンネル
wordHighlightColorSource	単語ハイライトの色
wordUnderlineColorSource	単語下線の色
wordTextColorSource	単語テキストの色
subtitleHighlightColorSource	字幕ハイライトの色
subtitleUnderlineColorSource	字幕下線の色
subtitleTextColorSource	字幕テキストの色
colorSourceStatus	JPDB + Ankiの状態
colorSourceJpdb	JPDBの状態
colorSourceAnki	Ankiの状態
colorSourcePitch	ピッチアクセント
colorSourceNone	なし
popupLookup	ポップアップ検索
popupLookupEnabled	よむの検索ポップアップを表示
popupLookupHelp	他リーダーのポップアップ用。オフでも他機能は有効。
lookupOnClick	タップまたはクリックで検索
lookupOnHover	ホバーで検索
lookupOnMiddleMouse	中央ボタン長押しで検索
showFloatingButton	設定ボタンを表示
pageScanMode	ページスキャン
pageScanModeOff	オフ
pageScanModeAuto	自動
pageScanModeManual	手動
manualPageScanShortcut	手動ページスキャンのショートカット
manualScanEnabled	手動ページスキャン
ocrInteractionMode	画像OCRスキャン
ocrInteractionModeAuto	自動
ocrInteractionModeManual	タップ/ホバー
ocrInteractionModeOff	オフ
puckMenuLabel	よむ メニュー
puckStudyPage	学習ページ
puckPauseAnnotations	注釈を一時停止
puckResumeAnnotations	注釈を再開
puckOcrAuto	OCR: 自動
puckOcrManual	OCR: タップ/ホバー
puckOcrOff	OCR: オフ
annotationsPausedToast	注釈を一時停止しました。
annotationsResumedToast	注釈を再開しました。
puckMuteAudio	音声の自動再生をミュート
puckUnmuteAudio	音声の自動再生のミュートを解除
puckHideFurigana	ふりがなを隠す
furiganaOffToast	ふりがなを非表示にしました。単語の検索は引き続き使えます。
autoplayAudioOnToast	音声の自動再生をオンにしました。
autoplayAudioOffToast	音声の自動再生をミュートしました。
showFurigana	ふりがな注釈を有効にする
furiganaMode	ふりがな
wordColorStates	色を付ける単語
appearancePresetCustom	現在のカスタム設定を保持
appearancePresetBalanced	読みやすいバランス
appearancePresetNoColors	プレーンテキスト
appearancePresetNewOnly	新規単語に集中
appearancePresetUnderlineNew	控えめなハイライト
wordColorStatesAll	すべての学習状態
wordColorStatesNewOnly	新規・未追加のみ
hideFuriganaFor	ふりがなを隠す対象
hideColorFor	色を隠す対象
furiganaDifficultKanji	難しい漢字のみ
furiganaHideKnown	なじみのある語を非表示
furiganaHoverOnly	ホバー時に表示
furiganaAllParsed	解析済みの全単語に表示
clampedRowReadings	省略行のふりがな
clampedRowReadingsShow	表示（行が広がる）
clampedRowReadingsHover	ホバー時のみ
showPitchAccent	ピッチアクセントを表示
showLookupPillFrequency	サイトの頻度をピルに表示
suppressRedundantWordUi	JPDBの冗長語のスタイルを非表示
sheetCloseButtonOnLeft	閉じるボタンを左に
hideKnownFurigana	既知カードのふりがなを非表示
readerHelp	ホバーキーを設定。空欄なら通常ホバー。
hoverLookupSettings	ホバー検索
kanjiOriginKanjiMapEnabled	漢字情報と部品グラフを表示
kanjiOriginGraphEnabled	部品グラフを表示
kanjiOriginRadicalImagesEnabled	部首画像を表示
similarKanjiWordLimit	類似語の上限
audioEnabled	語句の音声を有効にする
autoPlayAudio	語句の音声を自動再生
suppressAutoAudioOnVideo	動画では検索音声オフ
audioAutoPlayMode	自動再生のきっかけ
audioEnableDefaultSources	内蔵音声ソースを有効
audioFallbackChimeEnabled	フォールバック音を有効
audioSelectionMode	複数音声があるとき
audioPlayback	音声再生
firstAudio	最初の音声
randomAudio	シャッフル音声
audioTtsMode	読み上げの扱い
audioTtsFallback	録音音声の後のフォールバック
audioTtsSourceOrder	ソース順/シャッフルに含める
audioTimeoutMs	音声タイムアウト (ms)
previewAudio	音声を試聴
audioHelp	URL: {term}、{reading}、{language}。
audioSource	音声ソース
urlVoice	URL / 音声
addAudioSource	音声ソースを追加
audioAutoPlayAll	ホバーとタップ/クリック
audioAutoPlayHover	ホバーのみ
audioAutoPlayTap	タップ/クリックのみ
automaticBrowserVoice	ブラウザの自動音声
savedVoiceLabel	保存済み音声: {voice}
audioSourceOrder	音声ソースの順序
audioSourceNumber	音声ソース {number}
enableAudioSourceNumber	音声ソース {number} を有効にする
enableLookupPillName	検索ピル「{name}」を有効にする
enableSourceName	ソース「{name}」を有効にする
textToSpeechVoiceNumber	読み上げ音声 {number}
audioSourceJpod101	JapanesePod101
audioSourceLanguagePod101	LanguagePod101
audioSourceJisho	Jisho.org
audioSourceBunpro	Bunpro
audioSourceLinguaLibre	(Commons) Lingua Libre
audioSourceWiktionary	(Commons) Wiktionary
audioSourceJitenTts	Jiten読み上げ
audioSourceJpdbTts	JPDB読み上げ
audioSourceTextToSpeech	ブラウザ読み上げ
audioSourceTextToSpeechReading	ブラウザ読み上げ (かな読み)
audioSourceCustom	直接音声ファイルURL
audioSourceCustomJson	カスタムURL
audioCustomJsonPlaceholder	Yomitan/Ultimate音声URL
audioCustomUrlPlaceholder	直接音声ファイルURL
audioBuiltInPlaceholder	内蔵ソースはURL不要
defaultVoiceSuffix	標準
audioGuideLinkLabel	Yomitan音声ガイド
audioProxyGuideSummary	Cloudflareプロキシ
audioProxyGuideIntro	専用プロキシにはWorkerを使います。
audioProxyGuideCloudflare	Cloudflareを開きます。
audioProxyGuideWorkers	Workers & PagesでCreateします。
audioProxyGuideCreateWorker	Workerを選び、名前を付けてDeploy。
audioProxyGuideEditCode	Yomu Workerソースを貼ります。
audioProxyGuideDeploy	Deployします。
audioProxyGuideCopyUrl	Worker URLをコピーします。
audioProxyGuidePasteUrl	Cross-origin proxy URLに貼ります。
audioProxyGuideTest	保存後、検索・インポート・音声で確認。
audioProxyGuideNote	共有前にホストを絞ります。
audioProxyWorkerSource	Workerソース
audioProxyDeployGuide	デプロイガイド
immersionKitEnabled	イマージョンキット例文を表示
immersionKitExampleSource	例文プロバイダー
immersionKitAndNadeshiko	イマージョンキット + なでしこ
nadeshikoApiKey	なでしこAPIキー
getNadeshikoKey	キーを取得
immersionKitShowTranslation	例文の翻訳を表示
immersionKitRevealTranslationOnClick	クリックまで翻訳をぼかす
immersionKitShowImages	例文サムネイルを表示
immersionKitAutoPlayAudio	表示後や移動時に音声再生
immersionKitPlayOnHover	ホバーで例文音声を再生
immersionKitPlayOnImageClick	クリックで例文音声を再生
immersionKitCategory	例文ソース
immersionKitSort	例文の並び順
immersionKitLimitEnabled	単語ごとの例文数制限
allExamples	すべての例文
limitExamples	例文数を制限
immersionKitLimit	単語ごとの例文数
immersionKitMinLength	最小文長
immersionKitMaxLength	最大文長
immersionKitPlaybackRate	例文音声速度
immersionKitExactMatch	完全一致を優先
immersionKitHelp	例文を表示。Nadeshikoはキー必須。
allCategories	すべて
anime	アニメ
drama	ドラマ
games	ゲーム
shortestFirst	短い順
longestFirst	長い順
ocrEnabled	画像内テキストを読む
ocrAutoScanImages	画像を自動で読む
ocrShowTextOverlay	認識した画像テキスト領域を表示
ocrVideoPauseFrames	一時停止した動画フレームを自動で読む
ocrInvertDarkPanels	暗いコマの白い文字を読む
ocrProvider	画像読み取り
ocrOverlayTheme	OCRオーバーレイテーマ
ocrOverlayThemeAuto	アプリのテーマに合わせる
ocrOverlayThemeLight	ライトオーバーレイ
ocrOverlayThemeDark	ダークオーバーレイ
googleLens	Google Lens — 無料・設定不要（おすすめ）
cloudVision	Google Cloud Vision — APIキーが必要
localOcr	ローカルOCRサーバー — 上級者向け
off	オフ
ocrMaxImagesPerPage	ページごとに読む画像数
ocrMinImageArea	読む画像の最小サイズ
ocrMaxImagePixels	画像の精細さ
lightWork	軽め
normal	標準
more	多め
largeOnly	大きい画像のみ
includeSmall	小さい画像も含める
faster	高速
balanced	バランス
sharper	高精細
ocrTextColor	画像テキストの色
ocrOutlineColor	画像テキストの縁取り
ocrBackgroundOpacity	画像ハイライト不透明度
ocrFontScale	画像テキスト倍率
ocrEndpointUrl	ローカルOCRサーバーURL
ocrEngine	ローカルOCRエンジン
ocrEngineMangaOcr	MangaOCR（マンガに最適）
ocrEngineAppleVision	Apple Vision（macOS）
cloudVisionApiKey	Google Cloud Vision APIキー
ocrHelp	近くの画像を読み取ります。Google Lensは設定不要です。
ocrCloudHelp	Google Cloud Vision APIキーを貼ります。
ocrLocalHelp	MangaOCR/Apple VisionのローカルURLを入力します。
subtitlePlayerEnabled	動画字幕プレイヤーを有効にする
subtitleAutoDetect	ページの字幕を自動検出
subtitleOverlayVisible	字幕オーバーレイを表示
subtitleSecondaryVisible	利用可能ならネイティブ字幕を表示
subtitleNativeBlurred	ホバーするまでネイティブ字幕をぼかす
subtitleKaraokeMode	カラオケ風の単語タイミング
subtitleTranscriptVisible	文字起こしパネルを標準で開く
subtitlePausePanel	一時停止時にサイドパネルを開く
subtitleShadowAutoPause	シャドー中は各行の後で一時停止
subtitleTranscriptPlacement	文字起こしパネル位置
subtitleTranscriptAutoScroll	再生に合わせて文字起こしをスクロール
subtitleTranscriptAutoScrollResumeSeconds	手動スクロール後の再開 (秒)
subtitleAutoCopyLine	各字幕行を再生時に自動コピー
subtitleMiningPause	字幕クリック時に動画を一時停止
subtitleHoverPause	字幕ホバー時に動画を一時停止
subtitleControlsMode	字幕コントロール
subtitleStyle	字幕スタイル
subtitleResetDefaults	標準に戻す
moveSubtitles	字幕を移動
moveSubtitlesAccessible	字幕を移動します。ドラッグするか、矢印キーまたはPage Up/Page Downキーを使います。Homeまたは0でリセットします。
moveSubtitleControls	字幕コントロール。タップで展開・折りたたみ。ドラッグまたは矢印キーで移動します。Homeまたは0でリセットします。
noScannedFields
right	右
left	左
bottom	下
showWhenNeeded	コンパクト表示
hideControls	コントロールを隠す
alwaysVisible	常に表示
subtitleFontSize	字幕フォントサイズ (px)
subtitleBottomOffset	字幕下端オフセット (%)
subtitleTextColor	字幕の色
subtitleOutlineColor	字幕の縁取り
subtitleBackgroundColor	字幕背景
subtitleBackgroundOpacity	字幕背景の不透明度
subtitleFontFamily	字幕フォントファミリー
subtitleFontWeight	字幕フォントの太さ
subtitleSeekPadding	字幕シーク余白 (s)
subtitlePreview	字幕ライブプレビュー
preview	プレビュー
youtubeImmersionEnabled	日本語YouTubeのみ
preferJapaneseSiteLanguage	サイトの言語と地域を日本優先にする
youtubeShowChannelRecommendations	日本語チャンネル候補を表示
youtubeShowFilterNotice	非表示動画の通知を表示
youtubeHelp	日本語UIと日本向け内容を優先します。
youtubeShowHiddenVideos	非表示動画を表示
youtubeHideHiddenVideos	非表示動画を隠す
youtubeHideNotice	通知を隠す
youtubeFilterShowing	{appName}は非表示のYouTube項目{count}件を表示中
youtubeFilterHid	{appName}は日本語らしくないYouTube項目{count}件を非表示
youtubeFilterVisible	日本語らしい項目{count}件は表示したままです。
youtubeToggleToastOn	YouTube没入フィルターをオンにしました。
youtubeToggleToastOff	YouTube没入フィルターをオフにしました。
ankiEnabled	Anki採掘を有効にする
ankiMineWithJpdb	API経由で追加するときAnkiにも追加
ankiCaptureScreenshot	可能なら文脈画像を添付
ankiConnectUrl	AnkiConnect URL
ankiDeck	Ankiデッキ
ankiModel	Ankiノートタイプ
mobileAnkiHandoff	モバイルAnki新規ノート作成
ankiTemplateMode	Ankiカードテンプレート
ankiFrontReading	単語優先の表面に読みを表示
ankiFrontSentence	単語優先の表面に文を表示
ankiFrontImage	表面に画像を表示
wordFirst	単語を先に表示
sentenceFirst	文を先に表示
ankiTags	タグ
sentenceFirstPreset	文を先に表示するプリセット
wordFirstPreset	単語を先に表示するプリセット
imageAbovePrompt	画像があれば問題文の上に表示します。
recallHighlightedWord	文脈からハイライト語を思い出します。
imageOnFront	利用可能な場合、画像は表面に表示されます。
recallMeaning	まず意味を思い出します。
ankiBackIncludes	辞書、漢字、ピッチ、頻度、出典、画像を含みます。
exampleMeaning	読む
scanAnkiFirst	先にAnkiConnectに接続
notMapped	対応付けなし
noScannedFields	読み取れるフィールドがありません。
mappingForNoteType	{model} の対応付け
currentNoteType	現在のノートタイプ
ankiFieldMappingSelect	{role}フィールド
ankiRoleExpression	表記
ankiRoleReading	読み
ankiRoleMeaning	意味
ankiRoleSentence	文
ankiRoleAudio	音声
ankiRoleImage	画像
testAnki	AnkiConnectを確認
prepareAnki	よむノートタイプを作成
ankiCheckingConnection	{url} のAnkiConnectを確認中。
ankiMiningDisabledStatus	Ankiマイニングは無効です。
ankiTesting	AnkiConnectを確認中...
ankiPreparing	よむデッキとノートタイプを作成または更新中...
ankiScanning	Ankiデッキ、ノートタイプ、フィールドを読み込み中...
ankiScanSummary	デッキ{decks}、ノート{models}。候補: {model}。{fields}
ankiScanNoModels	デッキ{decks}件を検出。ノートタイプは未取得です。
ankiScanFieldSummary	フィールド: {fields}
ankiUnreachable	デスクトップAnkiとAnkiConnectを確認してください。
ankiCorsBlocked	webCorsOriginListに「{origin}」を追加し再起動してください。
ankiSettingsUnreachable	AnkiConnectに接続できません。
ankiHostedBridgeMissing	よむを有効化し、更新してください。
ankiStatusOpenDesktop	デスクトップAnkiを開く
ankiStatusInstallAddon	AnkiConnectをインストール/有効化
ankiStatusMobileDocs	モバイル設定ドキュメント
ankiStatusUseDesktopUrl	モバイルではLAN/Tailscale URLを使う
ankiStatusEnableUserscript	よむを有効化
ankiStatusRefreshAndCheck	更新して再確認
ankiLibraryAdapter	既存ライブラリアダプター
ankiLibraryAdapterStatus	既存デッキから対応付けを提案します。
ankiLibraryChoices	デッキとノートタイプ
ankiLibraryChoicesHelp	作成・更新先を選びます。
ankiTemplateSettings	よむカードテンプレート
ankiTemplateSettingsHelp	よむノートタイプ用。テンプレートはAnkiに残ります。
ankiMappingConfidenceHelp	フィールド名とサンプルで判断します。
ankiMappingHighConfidence	高
ankiMappingMediumConfidence	中
ankiMappingLowConfidence	低
ankiHelp	AnkiConnectを入れてデスクトップ版Ankiを開きます。CORS表示が出る場合はこのサイトをwebCorsOriginListに追加してください。モバイル受け渡しは新規ノート作成のみです。
jpdbDefinitionsEnabled	JPDB定義を表示
localDictionariesEnabled	インポート済み辞書の定義を表示
dictionarySourcesInitiallyExpanded	ポップアップのソースを標準で開く
localDictionaryMaxResults	辞書結果の上限
cloudSettingsSync	Google Drive設定同期
cloudSettingsSyncHelp	Yomuの設定をGoogle Driveのアプリデータに保存します。辞書は端末内に残ります。
importSettings	設定JSONをインポート
exportSettings	設定JSONをエクスポート
importDictionaries	辞書をインポート
exportDictionaries	辞書をエクスポート
dictionaryImportHelp	Yomitan ZIP、設定エクスポート、バックアップを読み込みます。語句/ピッチ/頻度辞書で定義、アクセント、バッジを追加します。
lookupPills	検索ピル
parserProvider	解析ソース
parserProviderLocal	ローカル辞書（オフライン）
parserProviderJiten	Jiten API
parserProviderJpdb	JPDB API
parserProviderAuto	自動（Jiten/JPDB）
parserProviderHelp	ローカルはインポート済み辞書でオフライン解析します。JitenとJPDBはキー設定時に必ずそのAPIを使います。自動はJiten、次にJPDBを優先します。
lookupPillsHelp	外部リンクと頻度バッジを同じ順序で表示します。ローカル頻度辞書は一致するJiten/JPDBライブバッジを置き換えます。トークン: {query}、{word}、{reading}。
copiesCurrentWord	現在の単語をコピーします
lookupPillLabelNumber	検索ピル{number}のラベル
lookupUrlTemplate	検索URLテンプレート
lookupUrlTemplateNumber	ピル{number} URL
lookupPillOrder	検索ピルの順序
builtInAction	内蔵アクション
recommendedDownloads	辞書
termDictionaries	語句辞書
kanjiDictionaries	漢字辞書
pitchDictionaries	ピッチ辞書
frequencyDictionaries	頻度辞書
install	インストール
installing	インストール中
queued	待機中
dictionaryGuide	ガイド
download	ダウンロード
update	更新
checkingDictionaries	インポート済み辞書を確認中...
decksLoaded	JPDBアカウントからデッキを読み込みました。
decksUnavailable	デッキを読み込めません。保存IDは保持します。
addApiKeyChooseDecks	デッキを選ぶにはJPDB APIキーを追加してください。
miningDeck	採掘デッキ
neverForgetDeck	忘れないデッキ
blacklistDeck	ブラックリストデッキ
allStudyDecks	すべての学習デッキ
savedValue	保存済み: {value}
holdWhileHovering	ホバー中に押すキー
hoverOpenDelayMs	ホバーで開く遅延 (ms)
hoverCloseDelayMs	ホバーを閉じる遅延 (ms)
pressKeys	キーを押してください
blankPlainHover	空欄ならキーなしホバー
openSettings	設定を開く
resizeSettings	設定パネルのサイズ変更
closePopup	ポップアップを閉じる
previousLookupWord	前の単語
nextLookupWord	次の単語
playingAudioPreview	{APP_NAME}を再生中...
audioPreviewFailed	音声プレビューに失敗しました。
previousSubtitle	前の字幕
nextSubtitle	次の字幕
pauseVideo	動画を一時停止
readVideoFrame	動画フレームを読み取る（OCR）
readVideoFrameStop	動画フレームの読み取りを停止（OCR）
copySubtitle	字幕をコピー
toggleImageReading	画像読み取りを切り替え
toggleSubtitleOverlay	字幕オーバーレイを切り替え
toggleYoutubeImmersion	YouTubeフィルターを切り替え
readImagesNow	今すぐ画像を読む
massReviewVisible	画面内の単語を一括レビュー（Jiten）
massReviewNoWords	画面内に復習対象のJiten単語がありません。
massReviewNoKey	一括レビューにはJiten APIキーが必要です。
massReviewDone	{count}語を「Good」でレビューしました。
massReviewFailed	一括レビューに失敗しました。
adapterStateDisabled	オフ
adapterStateProbing	接続確認中
adapterStateUnreachable	接続不可
adapterStateConnected	接続済み
adapterStateScanning	スキャン中
adapterStateSuggested	対応付け済み
adapterStateStale	要確認
adapterStateReady	準備完了
ankiMappingConfidenceHigh	完全一致
ankiMappingConfidenceMedium	曖昧一致
ankiMappingConfidenceLow	未対応
ankiMappingStaleField	保存済みフィールドなし
helpLinksTitle	便利なページ
helpLinksCopy	リーダーツールとドキュメントをここから開けます。
versionAndUpdates	バージョン
currentYomuVersion	Yomu
updateStatusIdle	現在 {current}。確認待ち。
updateStatusChecking	現在 {current}。確認中...
updateStatusCurrent	現在 {current}。最新 {latest}。最新です。
updateStatusAvailable	現在 {current}。最新 {latest}。更新できます。
updateStatusUnknown	現在 {current}。確認できません。必要なら再インストールしてください。
updateStatusIncomparable	現在 {current}。最新 {latest}。バージョンを比較できません。古い場合は「更新」を使ってください。
updateHelpNotesManager	よむスクリプトは1つだけ有効にしてください。「更新」でユーザースクリプトマネージャーのインストール画面が開きます。ブラウザにインストールブロックの警告が出る場合は、拡張機能ページでマネージャーの詳細を開き、「ユーザースクリプトを許可」（または開発者モード）を有効にしてから再試行してください。
updateHelpNotesManagerDashboard	Chrome または Edge では、「更新」を押すと Tampermonkey の更新手順が開きます。ダッシュボードの「ユーティリティ」→「ユーザースクリプトの更新を確認」を使うため、ウェブサイトからのインストールをブロックする警告を回避できます。
updateHelpNotesExternalManager	よむスクリプトは1つだけ有効にしてください。「更新」でスクリプトのソースが開き、ユーザースクリプトアプリが開いたタブから読み取って更新します。iPhone/iPadで更新が止まる場合は、このリンクをSafariで開いてタブを開いたままにしてください。
updateHelpNotesNoManager	この環境ではユーザースクリプトマネージャーが検出されませんでした。ブラウザはスクリプトの直接インストールをブロックするため、「更新」ではブラウザ別の手順があるインストールガイドを開きます。
updateUserscript	更新
duplicateStatusSingle	有効なYomuランタイムは1つです（{kind}）。
duplicateStatusUnknown	重複確認はできません。よむが2つ表示される場合は古いスクリプトを無効にしてください。
ankiConnectSetupTitle	AnkiConnect設定
ankiConnectSetupCopy	デスクトップAnkiを開き、AnkiConnectを有効にしてください。ホスト版StudyではAnkiConnect側でYomuのオリジンを許可する必要があります。
ankiConnectSetupConfig	AnkiConnectのwebCorsOriginListに次のオリジンを追加してください。既存の項目は残します:
ankiConnectSetupMobile	スマホやiPadでは、デスクトップPCのLANまたはTailscale URLを使います。スマホ上のlocalhostはPCではなくスマホ自身を指します。
ankiConnectSetupBrave	BraveでローカルAnki確認がブロックされる場合は、StudyページのShieldsをオフにしてください。
helpSupportTitle	よむをサポート
helpSupportCopy	よむは検索、OCR、字幕、辞書、学習、Ankiをまとめた無料ユーザースクリプトです。
helpSupportCopyExtra	寄付は開発とサービス費用を支えます。
videoPlayer	動画プレイヤー
pdfReader	PDFリーダー
academy	アカデミー
newTabPage	学習
localAudio	ローカル音声
changelog	変更履歴
support	サポート
github	GitHub
docs	ドキュメント
factoryReset	初期状態に戻す
factoryResetConfirm	{appName}の全データをリセットしますか？\n\n設定、キー、キャッシュ、辞書を削除。
factoryResetFailed	リセットに失敗しました。
factoryResetDictionaryWarning	設定をリセットしました。他のタブを閉じてください。
factoryResetOtherTabReloading	別タブでリセット。再読み込み...
factoryResetDeleteSettingsFailed	設定を削除できません。他のタブを閉じてください。
issues	Issue
donate	寄付
discord	Discord
enabledHeader	有効
labelHeader	ラベル
detailsHeader	詳細
displayName	表示名
orderHeader	順序
removeHeader	削除
definitionSource	定義ソース
kanjiSection	漢字セクション
dragToReorder	ドラッグして並べ替え
moveUp	上へ移動
moveDown	下へ移動
remove	削除
removeImportedDictionary	インポート済み辞書を削除
customAdvanced	{label} (詳細)
importLocalDefinitionsHelp	ローカル定義にはYomitan辞書を使います。
frequencyMetadataHelp	頻度、ピッチ、漢字メタデータをバッジや漢字データに表示。
sourceHelpJpdb	現在のカードのJPDB定義です。
sourceHelpJiten	Jiten定義、例文、関連語です。
sourceHelpBunpro	Bunproの語彙・文法の意味、ニュアンス、例文です。
sourceHelpAnki	一致するAnkiカード内容と状態です。
sourceHelpTranslation	文の自動翻訳です。
sourceHelpGrammar	ローカル文法ヒントです。
sourceHelpImmersionKit	例文、画像、音声です。
sourceNameImmersionKit	イマージョンキット
sourceNameAnki	Anki
sourceNameTranslation	翻訳
sourceNameGrammar	文法
sourceNameStrokePractice	筆順練習
sourceNameImportedKanjiDictionaries	インポート済み漢字辞書
sourceNameWordsUsingKanji	相关词汇
sourceNameJitenKanjiFacts	Jiten漢字情報
sourceHelpImportedKanjiDictionary	インポート済みYomitan漢字辞書です。
sourceHelpStrokePractice	筆順プレビューと書き取りパッドです。
sourceHelpReadingsComponents	JPDBの読み、部品、語呂合わせです。
sourceHelpJitenKanjiFacts	Jitenの漢字情報、頻度、読み、使用語です。
sourceHelpRtk	RTKキーワード、要素、ストーリーです。
sourceHelpUchisen	Uchisen語呂合わせ画像カルーセルです。
uchisenMnemonicImages	Uchisen語呂合わせ画像
uchisenMnemonicFor	{kanji}のUchisen語呂合わせ
noUchisenImagesYet	Uchisen画像はまだありません。
generateUchisenImage	画像を生成
generateUchisenImageToggle	画像を生成 +
uchisenMnemonicStory	語呂合わせストーリー
uchisenImagePrompt	画像プロンプト
uchisenGenerateHint	ストーリーとプロンプトを編集し、Uchisen画像を公開します。
uchisenGeneratingImage	画像を生成中...
uchisenPublishingMnemonic	語呂合わせを公開中...
uchisenGeneratedImage	Uchisen画像を公開しました。
uchisenGenerateFailed	Uchisen画像を生成できませんでした。
uchisenLoginRequired	画像生成にはUchisenへのログインが必要です。
noStoryAvailable	ストーリーはありません
sourceHelpImportedKanjiDictionaries	インポート済み漢字項目です。
sourceHelpWordsUsingKanji	関連語彙です。
sourceHelpComponentGraph	漢字情報、部品、部首画像です。
recommendedJitendex	例文付きの語句定義です。
recommendedJmdict	基本語句定義です。
recommendedJmnedict	固有名詞辞書です。
recommendedWtyJapaneseJapanese	日本語で読む語句定義です。
recommendedPixivLight	Pixiv用語辞書です。
recommendedKanjidic	漢字情報です。
recommendedJpdbKanji	JPDB漢字情報です。
recommendedKanjiumPitch	ピッチアクセント専用です。定義には語句辞書も追加してください。
recommendedJpdbv2Kana	JPDB由来のおすすめ頻度バッジです。
recommendedBccwj	BCCWJ由来の頻度バッジです。
recommendedJiten	Jiten由来の頻度バッジです。
`);
  function resolveUiLanguage(language) {
    if (language === "ja" || language === "en") return language;
    return browserPrefersJapanese() ? "ja" : "en";
  }
  function browserPrefersJapanese() {
    const navigatorLanguages = typeof navigator === "undefined" ? [] : [
      ...Array.isArray(navigator.languages) ? navigator.languages : [],
      navigator.language
    ];
    return navigatorLanguages.some(isJapaneseLocale);
  }
  function isJapaneseLocale(value) {
    return typeof value === "string" && value.toLowerCase().startsWith("ja");
  }
  function uiText(language, key) {
    return resolveUiLanguage(language) === "ja" ? JA_SETTINGS_COPY[key] ?? JA_COPY[key] ?? "未翻訳" : COPY.en[key];
  }
  function waitForIdle(timeoutMs = 75, fallbackDelayMs = 0) {
    if (timeoutMs <= 0 && fallbackDelayMs <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      if (scheduleIdleCallback(() => resolve(), timeoutMs)) return;
      window.setTimeout(resolve, Math.max(0, fallbackDelayMs));
    });
  }
  function scheduleIdleCallback(callback, timeoutMs = 75) {
    const requestIdleCallback = window.requestIdleCallback;
    if (typeof requestIdleCallback !== "function") return false;
    requestIdleCallback.call(window, callback, { timeout: timeoutMs });
    return true;
  }
  const GODAN_ROWS = [
    { ending: "う", a: "わ", i: "い", e: "え", o: "お", te: "って", ta: "った", rules: ["v5u", "v5"] },
    { ending: "く", a: "か", i: "き", e: "け", o: "こ", te: "いて", ta: "いた", rules: ["v5k", "v5"] },
    { ending: "ぐ", a: "が", i: "ぎ", e: "げ", o: "ご", te: "いで", ta: "いだ", rules: ["v5g", "v5"] },
    { ending: "す", a: "さ", i: "し", e: "せ", o: "そ", te: "して", ta: "した", rules: ["v5s", "v5"] },
    { ending: "つ", a: "た", i: "ち", e: "て", o: "と", te: "って", ta: "った", rules: ["v5t", "v5"] },
    { ending: "ぬ", a: "な", i: "に", e: "ね", o: "の", te: "んで", ta: "んだ", rules: ["v5n", "v5"] },
    { ending: "ぶ", a: "ば", i: "び", e: "べ", o: "ぼ", te: "んで", ta: "んだ", rules: ["v5b", "v5"] },
    { ending: "む", a: "ま", i: "み", e: "め", o: "も", te: "んで", ta: "んだ", rules: ["v5m", "v5"] },
    { ending: "る", a: "ら", i: "り", e: "れ", o: "ろ", te: "って", ta: "った", rules: ["v5r", "v5"] }
  ];
  const ICHIDAN_RULES = [
    ["ながら", "る", "simultaneous action"],
    ["ました", "る", "polite past"],
    ["ませんでした", "る", "polite negative past"],
    ["ません", "る", "polite negative"],
    ["ましょう", "る", "polite volitional"],
    ["ます", "る", "polite"],
    ["なかった", "る", "negative past"],
    ["なくて", "る", "negative te-form"],
    ["なければ", "る", "negative conditional"],
    ["ない", "る", "negative"],
    ["たかった", "る", "desiderative past"],
    ["たくなかった", "る", "desiderative negative past"],
    ["たくない", "る", "desiderative negative"],
    ["たい", "る", "desiderative"],
    ["なさい", "る", "polite request"],
    ["すぎる", "る", "excessive"],
    ["られなかった", "る", "potential/passive negative past"],
    ["られない", "る", "potential/passive negative"],
    ["られて", "る", "potential/passive te-form"],
    ["られた", "る", "potential/passive past"],
    ["られる", "る", "potential/passive"],
    ["させられた", "る", "causative passive past"],
    ["させられる", "る", "causative passive"],
    ["させない", "る", "causative negative"],
    ["させて", "る", "causative te-form"],
    ["させた", "る", "causative past"],
    ["させる", "る", "causative"],
    ["れば", "る", "conditional"],
    ["よう", "る", "volitional"],
    ["ろ", "る", "imperative"],
    ["て", "る", "te-form"],
    ["た", "る", "past"]
  ];
  const I_ADJECTIVE_RULES = [
    ["くなかった", "い", "negative past"],
    ["くありませんでした", "い", "polite negative past"],
    ["くありません", "い", "polite negative"],
    ["かった", "い", "past"],
    ["くない", "い", "negative"],
    ["くて", "い", "te-form"],
    ["ければ", "い", "conditional"],
    ["そう", "い", "looks"],
    ["すぎる", "い", "excessive"],
    ["く", "い", "adverbial"]
  ];
  const SURU_RULES = [
    ["しながら", "する", "simultaneous action"],
    ["しませんでした", "する", "polite negative past"],
    ["しません", "する", "polite negative"],
    ["しました", "する", "polite past"],
    ["しましょう", "する", "polite volitional"],
    ["します", "する", "polite"],
    ["しなかった", "する", "negative past"],
    ["しなくて", "する", "negative te-form"],
    ["しなければ", "する", "negative conditional"],
    ["しない", "する", "negative"],
    ["しなさい", "する", "polite request"],
    ["しすぎる", "する", "excessive"],
    ["された", "する", "passive past"],
    ["されて", "する", "passive te-form"],
    ["される", "する", "passive"],
    ["させた", "する", "causative past"],
    ["させて", "する", "causative te-form"],
    ["させる", "する", "causative"],
    ["できなかった", "する", "potential negative past"],
    ["できない", "する", "potential negative"],
    ["できた", "する", "potential past"],
    ["できて", "する", "potential te-form"],
    ["できる", "する", "potential"],
    ["すれば", "する", "conditional"],
    ["しよう", "する", "volitional"],
    ["しろ", "する", "imperative"],
    ["せよ", "する", "imperative"],
    ["した", "する", "past"],
    ["して", "する", "te-form"]
  ];
  const KURU_RULES = [
    ["来ながら", "来る", "simultaneous action"],
    ["来ませんでした", "来る", "polite negative past"],
    ["来ません", "来る", "polite negative"],
    ["来ました", "来る", "polite past"],
    ["来ます", "来る", "polite"],
    ["来なかった", "来る", "negative past"],
    ["来なくて", "来る", "negative te-form"],
    ["来ない", "来る", "negative"],
    ["来なさい", "来る", "polite request"],
    ["来すぎる", "来る", "excessive"],
    ["来られた", "来る", "potential/passive past"],
    ["来られて", "来る", "potential/passive te-form"],
    ["来られる", "来る", "potential/passive"],
    ["来れば", "来る", "conditional"],
    ["来よう", "来る", "volitional"],
    ["来い", "来る", "imperative"],
    ["来た", "来る", "past"],
    ["来て", "来る", "te-form"],
    ["きながら", "くる", "simultaneous action"],
    ["きませんでした", "くる", "polite negative past"],
    ["きません", "くる", "polite negative"],
    ["きました", "くる", "polite past"],
    ["きます", "くる", "polite"],
    ["こなかった", "くる", "negative past"],
    ["こなくて", "くる", "negative te-form"],
    ["こない", "くる", "negative"],
    ["きなさい", "くる", "polite request"],
    ["きすぎる", "くる", "excessive"],
    ["こられた", "くる", "potential/passive past"],
    ["こられて", "くる", "potential/passive te-form"],
    ["こられる", "くる", "potential/passive"],
    ["くれば", "くる", "conditional"],
    ["こよう", "くる", "volitional"],
    ["こい", "くる", "imperative"],
    ["きた", "くる", "past"],
    ["きて", "くる", "te-form"]
  ];
  const TE_ASPECT_SUFFIXES = [
    ["いる", "progressive"],
    ["います", "polite progressive"],
    ["いました", "polite progressive past"],
    ["いません", "polite progressive negative"],
    ["いませんでした", "polite progressive negative past"],
    ["いた", "progressive past"],
    ["いて", "progressive te-form"],
    ["いない", "progressive negative"],
    ["いなかった", "progressive negative past"],
    ["いれば", "progressive conditional"],
    ["る", "contracted progressive"],
    ["ます", "contracted polite progressive"],
    ["ました", "contracted polite progressive past"],
    ["た", "contracted progressive past"],
    ["て", "contracted progressive te-form"],
    ["ない", "contracted progressive negative"],
    ["なかった", "contracted progressive negative past"]
  ];
  const TE_COMPLETION_SUFFIXES = [
    ["しまう", "completion"],
    ["しまった", "completion past"],
    ["しまって", "completion te-form"],
    ["しまわない", "completion negative"],
    ["しまいます", "polite completion"],
    ["しまいました", "polite completion past"]
  ];
  const CONTRACTED_COMPLETION_SUFFIXES = [
    ["う", "contracted completion"],
    ["った", "contracted completion past"],
    ["って", "contracted completion te-form"],
    ["わない", "contracted completion negative"],
    ["います", "contracted polite completion"],
    ["いました", "contracted polite completion past"]
  ];
  const RULES = [
    ...ICHIDAN_RULES.map(([from, to, reason]) => ({ from, to, reason, rules: ["v1"] })),
    ...teCompoundRules("て", "る", ["v1"]),
    ...I_ADJECTIVE_RULES.map(([from, to, reason]) => ({ from, to, reason, rules: ["adj-i", "i-adj"] })),
    ...SURU_RULES.map(([from, to, reason]) => ({ from, to, reason, rules: ["vs", "vs-s", "suru"] })),
    ...teCompoundRules("して", "する", ["vs", "vs-s", "suru"]),
    ...KURU_RULES.map(([from, to, reason]) => ({ from, to, reason, rules: ["vk", "kuru"] })),
    ...teCompoundRules("来て", "来る", ["vk", "kuru"]),
    ...teCompoundRules("きて", "くる", ["vk", "kuru"]),
    ...GODAN_ROWS.flatMap((row) => godanRules(row)),
    { from: "行って", to: "行く", reason: "te-form", rules: ["v5k", "v5"] },
    { from: "行った", to: "行く", reason: "past", rules: ["v5k", "v5"] },
    { from: "行っちゃう", to: "行く", reason: "contracted completion", rules: ["v5k", "v5"] },
    { from: "行っちゃった", to: "行く", reason: "contracted completion past", rules: ["v5k", "v5"] }
  ];
  const DEINFLECTION_CACHE_MAX = 4e3;
  const deinflectionCache = /* @__PURE__ */ new Map();
  function deinflectJapaneseTerm(source) {
    const cached = deinflectionCache.get(source);
    if (cached) return cached;
    const results = [{ term: source, rules: [], reasons: [], depth: 0 }];
    const seen = /* @__PURE__ */ new Set([candidateKey(results[0])]);
    const queue = [results[0]];
    expandDeinflectionQueue(queue, results, seen);
    const sorted = sortDeinflectedTerms(results);
    if (deinflectionCache.size >= DEINFLECTION_CACHE_MAX) {
      const oldest = deinflectionCache.keys().next().value;
      if (oldest !== void 0) deinflectionCache.delete(oldest);
    }
    deinflectionCache.set(source, sorted);
    return sorted;
  }
  function expandDeinflectionQueue(queue, results, seen) {
    for (let index = 0; index < queue.length; index++) {
      expandDeinflectedTerm(queue[index], queue, results, seen);
    }
  }
  function expandDeinflectedTerm(current, queue, results, seen) {
    if (isTerminalDeinflection(current)) return;
    for (const rule of RULES) {
      rememberExpandedDeinflection(current, rule, queue, results, seen);
    }
  }
  function isTerminalDeinflection(current) {
    return current.depth >= 2 || current.reasons.at(-1) === "simultaneous action";
  }
  function rememberExpandedDeinflection(current, rule, queue, results, seen) {
    const next = deinflectedCandidate(current, rule);
    if (!next) return;
    if (!rememberDeinflectedCandidate(next, seen)) return;
    results.push(next);
    queue.push(next);
  }
  function sortDeinflectedTerms(results) {
    return results.sort((a, b) => a.depth - b.depth || b.term.length - a.term.length || a.term.localeCompare(b.term));
  }
  function deinflectedCandidate(current, rule) {
    if (!canApplyDeinflectionRule(current.term, rule)) return null;
    const term = `${current.term.slice(0, -rule.from.length)}${rule.to}`;
    if (!term || term === current.term) return null;
    return {
      term,
      rules: rule.rules,
      reasons: [...current.reasons, rule.reason],
      depth: current.depth + 1
    };
  }
  function canApplyDeinflectionRule(term, rule) {
    return term.endsWith(rule.from) && (term.length > rule.from.length || rule.to.length > 0);
  }
  function rememberDeinflectedCandidate(candidate, seen) {
    const key = candidateKey(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }
  function godanRules(row) {
    const rules = row.rules;
    return [
      ...teCompoundRules(row.te, row.ending, rules),
      { from: `${row.i}ながら`, to: row.ending, reason: "simultaneous action", rules },
      { from: row.i, to: row.ending, reason: "continuative stem", rules },
      { from: row.te, to: row.ending, reason: "te-form", rules },
      { from: row.ta, to: row.ending, reason: "past", rules },
      { from: `${row.a}なかった`, to: row.ending, reason: "negative past", rules },
      { from: `${row.a}なくて`, to: row.ending, reason: "negative te-form", rules },
      { from: `${row.a}なければ`, to: row.ending, reason: "negative conditional", rules },
      { from: `${row.a}ない`, to: row.ending, reason: "negative", rules },
      { from: `${row.i}ませんでした`, to: row.ending, reason: "polite negative past", rules },
      { from: `${row.i}ません`, to: row.ending, reason: "polite negative", rules },
      { from: `${row.i}ました`, to: row.ending, reason: "polite past", rules },
      { from: `${row.i}ましょう`, to: row.ending, reason: "polite volitional", rules },
      { from: `${row.i}ます`, to: row.ending, reason: "polite", rules },
      { from: `${row.i}たかった`, to: row.ending, reason: "desiderative past", rules },
      { from: `${row.i}たくなかった`, to: row.ending, reason: "desiderative negative past", rules },
      { from: `${row.i}たくない`, to: row.ending, reason: "desiderative negative", rules },
      { from: `${row.i}たい`, to: row.ending, reason: "desiderative", rules },
      { from: `${row.i}なさい`, to: row.ending, reason: "polite request", rules },
      { from: `${row.i}すぎる`, to: row.ending, reason: "excessive", rules },
      { from: `${row.e}ば`, to: row.ending, reason: "conditional", rules },
      { from: `${row.o}う`, to: row.ending, reason: "volitional", rules },
      { from: `${row.e}なかった`, to: row.ending, reason: "potential negative past", rules },
      { from: `${row.e}ない`, to: row.ending, reason: "potential negative", rules },
      { from: `${row.e}た`, to: row.ending, reason: "potential past", rules },
      { from: `${row.e}て`, to: row.ending, reason: "potential te-form", rules },
      { from: `${row.e}る`, to: row.ending, reason: "potential", rules },
      { from: `${row.a}れなかった`, to: row.ending, reason: "passive negative past", rules },
      { from: `${row.a}れない`, to: row.ending, reason: "passive negative", rules },
      { from: `${row.a}れて`, to: row.ending, reason: "passive te-form", rules },
      { from: `${row.a}れた`, to: row.ending, reason: "passive past", rules },
      { from: `${row.a}れる`, to: row.ending, reason: "passive", rules },
      { from: `${row.a}せない`, to: row.ending, reason: "causative negative", rules },
      { from: `${row.a}せて`, to: row.ending, reason: "causative te-form", rules },
      { from: `${row.a}せた`, to: row.ending, reason: "causative past", rules },
      { from: `${row.a}せる`, to: row.ending, reason: "causative", rules },
      { from: row.e, to: row.ending, reason: "imperative", rules }
    ];
  }
  function teCompoundRules(te, to, rules) {
    return [
      ...TE_ASPECT_SUFFIXES.map(([suffix, reason]) => ({ from: `${te}${suffix}`, to, reason, rules })),
      ...TE_COMPLETION_SUFFIXES.map(([suffix, reason]) => ({ from: `${te}${suffix}`, to, reason, rules })),
      ...contractedCompletionRules(te, to, rules)
    ];
  }
  function contractedCompletionRules(te, to, rules) {
    const stem = contractedCompletionStem(te);
    return stem ? CONTRACTED_COMPLETION_SUFFIXES.map(([suffix, reason]) => ({ from: `${stem}${suffix}`, to, reason, rules })) : [];
  }
  function contractedCompletionStem(te) {
    if (te.endsWith("て")) return `${te.slice(0, -1)}ちゃ`;
    if (te.endsWith("で")) return `${te.slice(0, -1)}じゃ`;
    return "";
  }
  function candidateKey(candidate) {
    return `${candidate.term}
${candidate.rules.join(" ")}
${candidate.depth}`;
  }
  function uniqueStrings(values, options = {}) {
    const seen = /* @__PURE__ */ new Set();
    const result = [];
    for (const value of values) {
      const normalized = options.trim ? value?.trim() : value;
      if (normalized === void 0 || normalized === null) continue;
      if (options.dropEmpty && !normalized) continue;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(normalized);
    }
    return result;
  }
  function uniqueNonEmptyStrings(values) {
    return uniqueStrings(values, { dropEmpty: true });
  }
  const JAPANESE_SCRIPT_GROUP_RE = /[\u3400-\u9fff々〆ヵヶ]+|[\u3040-\u309fー]+|[\u30a0-\u30ffー]+|[\uff66-\uff9f]+/gu;
  const JAPANESE_TEXT_RUN_RE = /[\u3040-\u30ff\u3400-\u9fff々〆ヵヶー\uff66-\uff9f]+/gu;
  const JAPANESE_CHARACTER_RE = /[\u3040-\u30ff\u3400-\u9fff々〆ヵヶ\uff66-\uff9f]/u;
  const FALLBACK_INFLECTION_MAX_SEGMENTS = 8;
  const FALLBACK_INFLECTION_MAX_LENGTH = 18;
  const FALLBACK_LOOKUP_TERM_LIMIT = 8;
  const INFLECTION_BOUNDARY_SEGMENTS = /* @__PURE__ */ new Set(["は", "が", "を", "に", "へ", "と", "で", "の", "や", "から", "まで", "より", "だけ", "しか", "など", "ね"]);
  const PARTICLE_PREFIX_SEGMENTS = [...INFLECTION_BOUNDARY_SEGMENTS].sort((first, second) => second.length - first.length);
  const PARTICLE_PREFIX_REMAINDER_RE = /^[\u3400-\u9fff々〆ヵヶ\u30a0-\u30ffー]/u;
  const INFLECTION_CONTINUATION_SEGMENT_RE = /^(?:っ?た|っ?て|だ|で|ん|んで|ま|ない|なか|なかっ|なかった|ながら|ます|まし|ました|ませ|ません|ましょう|たい|たく|しま|した|し|する|でき|出来|できる|できます|できた|できて|できない|できなかった|いる|い|いた|いて|れる|られ|せる|させる)$/u;
  const HIRAGANA_SEGMENT_RE = /^[\u3040-\u309fー]+$/u;
  const SINGLE_KANJI_SEGMENT_RE = /^[\u3400-\u9fff]$/u;
  const SINGLE_KANJI_HIRAGANA_STEM_RE = /^[\u3400-\u9fff][\u3040-\u309fー]*$/u;
  const KANJI_KANA_KANJI_SPAN_RE = /[\u3400-\u9fff々〆ヵヶ][\u3040-\u309fー]+[\u3400-\u9fff々〆ヵヶ]/u;
  const HIRAGANA_END_RE = /[\u3040-\u309fー]$/u;
  const TRAILING_POLITE_PARTICLE_RE = /(?:ます|ません|です|でした)ね$/u;
  const SURU_STEM_SEGMENT_RE = /[\u3400-\u9fff々〆ヵヶ\u30a0-\u30ff]/u;
  const SURU_AUXILIARY_SUFFIX_RE = /^(?:し|する|した|して|します|しました|しましょう|しない|でき|出来|できる|できます|できた|できて|できない|できなかった)/u;
  const NUMERIC_COUNTER_SUFFIX_SEGMENTS = /* @__PURE__ */ new Set(["話", "巻", "回", "章", "部", "番", "号", "版", "人", "名", "匹", "頭", "羽", "枚", "本", "冊", "個", "台", "件", "分", "秒", "時", "日", "月", "年", "泊", "円"]);
  const NUMERIC_RANGE_BEFORE_RE = /(?:第\s*)?(?:[0-9０-９]+|[一二三四五六七八九十百千万億兆]+)(?:\s*[〜～~\-ー−―–]\s*(?:[0-9０-９]+|[一二三四五六七八九十百千万億兆]+))*$/u;
  const SEGMENTER_COMPOUND_OVERRIDES = /* @__PURE__ */ new Set(["巨乳"]);
  const SEGMENTER_COMPOUND_OVERRIDE_MAX_LENGTH = Array.from(SEGMENTER_COMPOUND_OVERRIDES).reduce((max, value) => Math.max(max, value.length), 0);
  const KANA_VERB_STEM_END_RE = /[うくぐすずつづぬふぶぷむゆる]$/u;
  const KANA_I_ADJECTIVE_END_RE = /い$/u;
  const SMALL_TSU_RE = /っ/u;
  const KANA_CONTENT_WORD_MIN_LENGTH = 3;
  const NON_HIRAGANA_SCRIPT_RE = /[㐀-鿿々〆ヵヶ゠-ヿ\uff66-\uff9f]/u;
  function normalizeFallbackTerm(text) {
    return text.replace(/\s+/g, " ").trim().slice(0, 80);
  }
  let cachedSegmenterConstructor;
  let cachedJapaneseWordSegmenter;
  function fallbackJapaneseSegments(text) {
    return segmentJapaneseText(text);
  }
  function segmentJapaneseText(text) {
    const segmenter = japaneseWordSegmenter();
    if (!segmenter) {
      return Array.from(text.matchAll(JAPANESE_SCRIPT_GROUP_RE)).flatMap((match) => {
        const start = match.index ?? 0;
        return finalizeJapaneseRunSegments(fallbackJapaneseRunSegment(match[0], start), text);
      });
    }
    return Array.from(text.matchAll(JAPANESE_TEXT_RUN_RE)).flatMap((match) => {
      const start = match.index ?? 0;
      return segmentJapaneseRun(match[0], start, segmenter, text);
    });
  }
  function segmentJapaneseRun(text, offset, segmenter, sourceText) {
    const segments = Array.from(segmenter.segment(text)).filter(isUsefulJapaneseSegment).map((segment) => ({
      surface: segment.segment,
      start: offset + segment.index,
      end: offset + segment.index + segment.segment.length
    }));
    if (segments.at(-1)?.end !== offset + text.length) {
      return finalizeJapaneseRunSegments(fallbackJapaneseRunSegment(text, offset), sourceText);
    }
    return finalizeJapaneseRunSegments(segments, sourceText);
  }
  function finalizeJapaneseRunSegments(segments, sourceText) {
    const normalizedSegments = splitTrailingPoliteParticleSegments(
      mergeContiguousKanaSegments(mergeSegmenterCompoundOverrides(splitNumericCounterPrefixSegments(segments, sourceText)))
    );
    return mergeInflectedFallbackSegments(
      splitLeadingParticleSegments(normalizedSegments),
      sourceText
    );
  }
  function splitTrailingPoliteParticleSegments(segments) {
    return segments.flatMap((segment, index) => {
      if (!segment.surface.endsWith("ね") || segment.surface === "ね") return [segment];
      const previous = segments[index - 1]?.surface ?? "";
      if (!TRAILING_POLITE_PARTICLE_RE.test(`${previous}${segment.surface}`)) return [segment];
      const particleStart = segment.end - 1;
      const stem = segment.surface.slice(0, -1);
      return [
        ...stem ? [{ surface: stem, start: segment.start, end: particleStart }] : [],
        { surface: "ね", start: particleStart, end: segment.end }
      ];
    });
  }
  function mergeContiguousKanaSegments(segments) {
    if (segments.some((segment) => NON_HIRAGANA_SCRIPT_RE.test(segment.surface))) return segments;
    const merged = [];
    for (let index = 0; index < segments.length; ) {
      const span = contiguousKanaMergeSpanAt(segments, index);
      if (span) {
        merged.push(span.segment);
        index = span.nextIndex;
        continue;
      }
      merged.push(segments[index]);
      index += 1;
    }
    return merged;
  }
  function contiguousKanaMergeSpanAt(segments, startIndex) {
    const first = segments[startIndex];
    if (!first || !isPureKanaSegment(first.surface)) return null;
    const previous = segments[startIndex - 1];
    const atKanaRunStart = !previous || !isPureKanaSegment(previous.surface) || previous.end !== first.start;
    if (isBoundarySegment(first.surface) && !atKanaRunStart) return null;
    const runEnd = contiguousKanaRunEnd(segments, startIndex);
    if (runEnd - startIndex < 2) return null;
    let surface = first.surface;
    let lastIndex = startIndex;
    for (let index = startIndex + 1; index < runEnd; index += 1) {
      const current = segments[index];
      const trailingSpan = sliceKanaSpanSurface(segments, index, runEnd);
      if (isBoundarySegment(current.surface) || isKanaContentWordSpan(trailingSpan)) break;
      surface += current.surface;
      lastIndex = index;
    }
    if (lastIndex === startIndex) return null;
    return {
      segment: { surface, start: first.start, end: segments[lastIndex].end },
      nextIndex: lastIndex + 1
    };
  }
  function contiguousKanaRunEnd(segments, startIndex) {
    let index = startIndex + 1;
    while (index < segments.length && isPureKanaSegment(segments[index].surface) && segments[index].start === segments[index - 1].end) {
      index += 1;
    }
    return index;
  }
  function sliceKanaSpanSurface(segments, startIndex, endIndex) {
    let surface = "";
    for (let index = startIndex; index < endIndex; index += 1) surface += segments[index].surface;
    return surface;
  }
  function isPureKanaSegment(surface) {
    return HIRAGANA_SEGMENT_RE.test(surface);
  }
  function isKanaContentWordSpan(span) {
    if (isKanaInflectableBaseShape(span)) return true;
    return deinflectJapaneseTerm(span).some((candidate) => candidate.depth > 0 && Array.from(candidate.term).length >= 2 && !SMALL_TSU_RE.test(candidate.term) && (KANA_VERB_STEM_END_RE.test(candidate.term) || KANA_I_ADJECTIVE_END_RE.test(candidate.term)));
  }
  function isKanaInflectableBaseShape(span) {
    if (Array.from(span).length < KANA_CONTENT_WORD_MIN_LENGTH || SMALL_TSU_RE.test(span)) return false;
    return KANA_VERB_STEM_END_RE.test(span) || KANA_I_ADJECTIVE_END_RE.test(span);
  }
  function splitNumericCounterPrefixSegments(segments, sourceText) {
    return segments.flatMap((segment) => splitNumericCounterPrefixSegment(segment, sourceText));
  }
  function splitNumericCounterPrefixSegment(segment, sourceText) {
    const first = Array.from(segment.surface)[0] ?? "";
    if (!first || first === segment.surface || !NUMERIC_COUNTER_SUFFIX_SEGMENTS.has(first)) return [segment];
    if (!numericRangeImmediatelyBefore(sourceText, segment.start)) return [segment];
    const second = Array.from(segment.surface)[1] ?? "";
    if (second === "間") return [segment];
    return [
      { surface: first, start: segment.start, end: segment.start + first.length },
      { surface: segment.surface.slice(first.length), start: segment.start + first.length, end: segment.end }
    ];
  }
  function splitLeadingParticleSegments(segments) {
    return segments.flatMap(splitLeadingParticleSegment);
  }
  function splitLeadingParticleSegment(segment) {
    const prefix = PARTICLE_PREFIX_SEGMENTS.find((candidate) => {
      if (!segment.surface.startsWith(candidate) || segment.surface.length <= candidate.length) return false;
      return PARTICLE_PREFIX_REMAINDER_RE.test(segment.surface.slice(candidate.length));
    });
    if (!prefix) return [segment];
    return [
      { surface: prefix, start: segment.start, end: segment.start + prefix.length },
      { surface: segment.surface.slice(prefix.length), start: segment.start + prefix.length, end: segment.end }
    ];
  }
  function mergeSegmenterCompoundOverrides(segments) {
    const merged = [];
    for (let index = 0; index < segments.length; ) {
      const span = segmenterCompoundOverrideSpanAt(segments, index);
      if (span) {
        merged.push(span.segment);
        index = span.nextIndex;
        continue;
      }
      merged.push(segments[index]);
      index += 1;
    }
    return merged;
  }
  function segmenterCompoundOverrideSpanAt(segments, startIndex) {
    const first = segments[startIndex];
    if (!first) return null;
    let surface = "";
    let best = null;
    for (let index = startIndex; index < segments.length; index += 1) {
      const current = segments[index];
      if (!current || index > startIndex && segments[index - 1]?.end !== current.start) break;
      surface += current.surface;
      if (surface.length > SEGMENTER_COMPOUND_OVERRIDE_MAX_LENGTH) break;
      if (index > startIndex && SEGMENTER_COMPOUND_OVERRIDES.has(surface)) {
        best = {
          segment: { surface, start: first.start, end: current.end },
          nextIndex: index + 1
        };
      }
    }
    return best;
  }
  function mergeInflectedFallbackSegments(segments, sourceText) {
    const merged = [];
    for (let index = 0; index < segments.length; ) {
      const span = inflectedFallbackSpanAt(segments, index, sourceText);
      if (span) {
        merged.push(span.segment);
        index = span.nextIndex;
        continue;
      }
      merged.push(segments[index]);
      index += 1;
    }
    return merged;
  }
  function inflectedFallbackSpanAt(segments, startIndex, sourceText) {
    const first = segments[startIndex];
    if (!first || isBoundarySegment(first.surface)) return null;
    let surface = "";
    let best = null;
    for (let index = startIndex; index < fallbackInflectionScanEnd(segments, startIndex); index += 1) {
      const current = nextInflectedFallbackSegment(segments, index, startIndex, first, surface, sourceText);
      if (!current) break;
      surface += current.surface;
      if (surface.length > FALLBACK_INFLECTION_MAX_LENGTH) break;
      best = inflectedFallbackCandidateAt(segments, startIndex, index, first, current, surface) ?? best;
    }
    return best;
  }
  function fallbackInflectionScanEnd(segments, startIndex) {
    return Math.min(segments.length, startIndex + FALLBACK_INFLECTION_MAX_SEGMENTS);
  }
  function nextInflectedFallbackSegment(segments, index, startIndex, first, surface, sourceText) {
    const current = segments[index];
    if (!current || !isContiguousFallbackSegment(segments, index, startIndex, first)) return null;
    if (index > startIndex && isNumericCounterFallbackStem(first, sourceText)) return null;
    const politeNegativePast = index > startIndex && isPoliteNegativePastContinuation(segments, index, surface);
    if (index > startIndex && isBoundarySegment(current.surface) && !politeNegativePast) return null;
    if (index > startIndex && !politeNegativePast && !canContinueInflectedFallbackSpan(surface, current.surface)) return null;
    return current;
  }
  function isPoliteNegativePastContinuation(segments, index, surface) {
    return surface.endsWith("ません") && segments[index]?.surface === "で" && segments[index + 1]?.surface === "した";
  }
  function isContiguousFallbackSegment(segments, index, startIndex, first) {
    const expectedStart = index === startIndex ? first.start : segments[index - 1]?.end;
    return segments[index]?.start === expectedStart;
  }
  function inflectedFallbackCandidateAt(segments, startIndex, index, first, current, surface) {
    if (index === startIndex) return null;
    const lookupTerms = fallbackLookupTermsForText(surface);
    if (lookupTerms.length <= 1) return null;
    if (shouldKeepSuruAuxiliaryBoundary(segments, startIndex, surface, lookupTerms)) return null;
    return {
      segment: { surface, start: first.start, end: current.end },
      nextIndex: index + 1
    };
  }
  function isBoundarySegment(surface) {
    return INFLECTION_BOUNDARY_SEGMENTS.has(surface);
  }
  function isInflectionContinuationSegment(surface) {
    return INFLECTION_CONTINUATION_SEGMENT_RE.test(surface);
  }
  function canContinueInflectedFallbackSpan(currentSurface, nextSurface) {
    return isInflectionContinuationSegment(nextSurface) || SINGLE_KANJI_HIRAGANA_STEM_RE.test(currentSurface) && HIRAGANA_END_RE.test(currentSurface) && SINGLE_KANJI_SEGMENT_RE.test(nextSurface) || HIRAGANA_SEGMENT_RE.test(nextSurface) && (SINGLE_KANJI_HIRAGANA_STEM_RE.test(currentSurface) || KANJI_KANA_KANJI_SPAN_RE.test(currentSurface)) && !hasUsefulFallbackDeinflection(currentSurface);
  }
  function isNumericCounterFallbackStem(segment, sourceText) {
    return NUMERIC_COUNTER_SUFFIX_SEGMENTS.has(segment.surface) && numericRangeImmediatelyBefore(sourceText, segment.start);
  }
  function numericRangeImmediatelyBefore(sourceText, start) {
    const before = sourceText.slice(Math.max(0, start - 24), start).replace(/\s+$/u, "");
    return NUMERIC_RANGE_BEFORE_RE.test(before);
  }
  function hasUsefulFallbackDeinflection(surface) {
    return fallbackLookupTermsForText(surface).length > 1;
  }
  function shouldKeepSuruAuxiliaryBoundary(segments, startIndex, surface, lookupTerms) {
    const first = segments[startIndex]?.surface ?? "";
    if (!first || !SURU_STEM_SEGMENT_RE.test(first)) return false;
    const suffix = surface.slice(first.length);
    if (!SURU_AUXILIARY_SUFFIX_RE.test(suffix)) return false;
    if (hasSingleKanjiGodanSAlternative(first, lookupTerms)) return false;
    return true;
  }
  function hasSingleKanjiGodanSAlternative(first, lookupTerms) {
    return SINGLE_KANJI_SEGMENT_RE.test(first) && lookupTerms.some((term) => term === `${first}す`);
  }
  function japaneseWordSegmenter() {
    const Segmenter = intlSegmenter();
    if (!Segmenter) {
      cachedSegmenterConstructor = null;
      cachedJapaneseWordSegmenter = null;
      return null;
    }
    if (cachedSegmenterConstructor !== Segmenter) {
      cachedSegmenterConstructor = Segmenter;
      cachedJapaneseWordSegmenter = new Segmenter("ja", { granularity: "word" });
    }
    return cachedJapaneseWordSegmenter ?? null;
  }
  function isUsefulJapaneseSegment(segment) {
    const surface = segment.segment.trim();
    return JAPANESE_CHARACTER_RE.test(surface);
  }
  function intlSegmenter() {
    const candidate = Intl.Segmenter;
    return typeof candidate === "function" ? candidate : null;
  }
  function fallbackJapaneseRunSegment(text, offset) {
    const surface = text.trim();
    if (!surface || !JAPANESE_CHARACTER_RE.test(surface)) return [];
    const start = offset + text.indexOf(surface);
    return [{ surface, start, end: start + surface.length }];
  }
  function fallbackLookupTermsForText(text) {
    const source = normalizeFallbackTerm(text);
    if (!source) return [];
    const terms = deinflectJapaneseTerm(source).filter(isUsefulFallbackLookupCandidate).sort(compareFallbackLookupCandidates).map((candidate) => normalizeFallbackTerm(candidate.term)).filter(Boolean);
    return uniqueNonEmptyStrings([source, ...terms]).slice(0, FALLBACK_LOOKUP_TERM_LIMIT);
  }
  function isUsefulFallbackLookupCandidate(candidate) {
    return candidate.depth > 0 && JAPANESE_CHARACTER_RE.test(candidate.term) && candidate.term.length > 1;
  }
  function compareFallbackLookupCandidates(a, b) {
    return a.depth - b.depth || fallbackRulePriority(a) - fallbackRulePriority(b) || b.term.length - a.term.length || a.term.localeCompare(b.term);
  }
  function fallbackRulePriority(candidate) {
    if (candidate.rules.some((rule) => rule === "vs" || rule === "vs-s" || rule === "suru" || rule === "vk" || rule === "kuru")) return 0;
    if (candidate.rules.some((rule) => rule === "v1")) return 1;
    if (candidate.rules.some((rule) => rule.startsWith("v5") || rule === "v5")) return 1;
    if (candidate.rules.some((rule) => rule === "adj-i" || rule === "i-adj")) return 2;
    return 3;
  }
  function stableHash32(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
  function stablePositiveHashId(value) {
    return stableHash32(value) || 1;
  }
  function stableHashBase36(value) {
    return stableHash32(value).toString(36);
  }
  Logger.scope("Yomitan");
  new TextDecoder();
  Logger.scope("YomitanSettingsImport");
  Logger.scope("Yomitan");
  Logger.scope("ReaderParser");
  function isTerminalOcrStatus(status) {
    return status === "empty" || status === "failed";
  }
  const MAX_CACHE_ITEMS = 36;
  const LOCAL_OCR_UNAVAILABLE_RETRY_MS = 15e3;
  const OCR_STATUS_READY_DWELL_MS = 1e3;
  const OCR_STATUS_FADE_MS = 360;
  const READER_RASTER_RETRY_BASE_MS = 140;
  const READER_RASTER_RETRY_MAX_MS = 1100;
  const READER_RASTER_MAX_CAPTURE_ATTEMPTS = 8;
  const READER_RASTER_MAX_COMMIT_MISMATCHES = 3;
  const READER_RASTER_MAX_EMPTY_SCAN_ATTEMPTS = 3;
  const READER_RASTER_EMPTY_RETRY_MS = 400;
  const READER_RASTER_MAX_PROVIDER_ATTEMPTS = 3;
  const READER_RASTER_PROVIDER_RETRY_BASE_MS = 350;
  const READER_RASTER_PENDING_CAPTURE_TIMEOUT_MS = 4e4;
  const READER_RASTER_FRAME_LOAD_TIMEOUT_MS = 8e3;
  const BOOKWALKER_RECORDER_BOOT_GRACE_MS = 15e3;
  const READER_RASTER_SAME_PAGE_SIGNATURE_HOLD_LIMIT = 40;
  const READER_RASTER_BOTTOM_CHROME_RESERVE_PX = 56;
  const READER_RASTER_FRAME_SIZE_CHANGE_PX = 2;
  const READER_RASTER_REGION_MIN_SIZE_PX = 96;
  const READER_RASTER_REGION_FULL_PAGE_FRACTION = 0.88;
  const YOUTUBE_VIDEO_FRAME_BOTTOM_CHROME_RESERVE_PX = 64;
  const MIRROR_IMAGE_FETCH_TIMEOUT_MS = 8e3;
  const MAX_CLEAN_MIRROR_IMAGE_CACHE_ITEMS = 48;
  const BOOKWALKER_SPREAD_MIN_ASPECT = 1.15;
  const bookwalkerAssetResolver = new BookwalkerAssetResolver();
  const log = Logger.scope("OCR");
  const STALE_OCR_STATE = Symbol("stale-ocr-state");
  const OCR_WORD_UNDERLINE_OFFSET_EM = 0.12;
  const OCR_WORD_UNDERLINE_THICKNESS_EM = 0.12;
  const OCR_WORD_UNDERLINE_CLEARANCE_PX = 1;
  const ocrVocabularyCache = /* @__PURE__ */ new WeakMap();
  let ocrLayerCounter = 0;
  const OCR_PROVIDER_LABELS = {
    "google-lens": () => "google-lens",
    "cloud-vision": (settings) => settings.ocrCloudVisionApiKey.trim() ? "cloud-vision" : null,
    "local-service": localServiceProviderLabel
  };
  const VIDEO_FRAME_PLAYER_SELECTOR = [
    "#movie_player",
    ".html5-video-player",
    "ytd-player",
    "#player",
    "#player-container",
    "#player-container-outer",
    "[data-yomu-video-frame]"
  ].join(",");
  const VIDEO_FRAME_FULLSCREEN_HOST_SELECTOR = [
    '[data-yomu-inline-fullscreen="true"]',
    '[data-fullscreen-active="true"]',
    "[fullscreen]",
    "#movie_player.ytp-fullscreen",
    ".html5-video-player.ytp-fullscreen",
    "ytd-watch-flexy[fullscreen]",
    "ytm-player[fullscreen]",
    "ytm-player.fullscreen",
    "ytm-player.ytp-fullscreen"
  ].join(",");
  const VIDEO_FRAME_THUMBNAIL_CONTAINER_SELECTOR = [
    "ytd-thumbnail",
    "ytd-rich-item-renderer",
    "ytd-rich-grid-media",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-reel-item-renderer",
    "ytd-playlist-thumbnail",
    "ytd-video-preview",
    "yt-thumbnail-view-model",
    "yt-lockup-view-model",
    "ytm-rich-item-renderer",
    "ytm-compact-video-renderer",
    "ytm-video-card-renderer",
    "ytm-video-with-context-renderer",
    "ytm-shorts-lockup-view-model",
    "ytm-shorts-lockup-view-model-v2"
  ].join(",");
  const VIDEO_FRAME_THUMBNAIL_LINK_SELECTOR = [
    'a[href*="/watch"]',
    'a[href*="/shorts/"]'
  ].join(",");
  const OCR_IMAGE_THUMBNAIL_CONTAINER_SELECTOR = [
    VIDEO_FRAME_THUMBNAIL_CONTAINER_SELECTOR,
    "yt-image",
    ".yt-core-image"
  ].join(",");
  function shouldSkipOcrRequest(state2, userRequested) {
    return state2.autoSkipped && !userRequested;
  }
  function updateOcrRequestFlags(state2, image, userRequested) {
    state2.overlayRequested ||= userRequested || Boolean(readFallbackOcrResult(image, false));
    state2.manualRequested ||= userRequested;
    if (userRequested) state2.autoSkipped = false;
  }
  function shouldPinOcrLineFromPointer(event) {
    return event.pointerType === "touch" || event.pointerType === "pen";
  }
  function isOcrImageStateIdle(state2) {
    return !state2.result && !state2.loading && !state2.autoSkipped;
  }
  class LocalOcrUnavailableError extends Error {
    constructor(endpointUrl) {
      super("Local OCR server is unreachable.");
      this.endpointUrl = endpointUrl;
      this.name = "LocalOcrUnavailableError";
    }
  }
  function beginOcrScan(state2, image, settings, manualRequested) {
    state2.loading = true;
    const provider = inlineProviderLabel(settings);
    return {
      provider,
      done: log.time("scanImage", { provider, image: imageSummary(image), manualRequested })
    };
  }
  function finishOcrScan(state2) {
    state2.loading = false;
    state2.manualRequested = false;
  }
  function renderNoOcrLines(state2) {
    state2.autoSkipped = true;
    state2.overlay.querySelectorAll(".jpdb-ocr-line").forEach((node) => node.remove());
  }
  function logOcrFailure(state2, provider, manualRequested, error) {
    state2.autoSkipped = !manualRequested;
    if (isLocalOcrUnavailableError(error)) {
      log.warnOnce(`local-ocr-unavailable:${error.endpointUrl}`, "Local OCR endpoint unavailable; pausing requests", { provider, endpoint: error.endpointUrl });
      return;
    }
    log.warn("OCR scan failed", { provider, manualRequested }, error);
  }
  const OCR_NAVIGATION_EVENTS = ["yt-navigate-start", "yt-navigate-finish", "popstate"];
  const OCR_FULLSCREEN_CHANGE_EVENTS = ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange"];
  const MINING_PAUSE_MARKER_TTL_MS = 1500;
  function isFreshMiningPause(video) {
    const marked = Number(video.dataset.jpdbReaderMiningPause);
    return Number.isFinite(marked) && Date.now() - marked < MINING_PAUSE_MARKER_TTL_MS;
  }
  class ImageOcrController {
    constructor(options) {
      this.options = options;
      for (const [key, result] of loadPersistedOcrCache()) this.cache.set(key, result);
    }
    states = /* @__PURE__ */ new Map();
    cache = /* @__PURE__ */ new Map();
    localOcrUnavailable;
    observer;
    observerMargin = "";
    mutationObserver;
    queue = [];
    // OCR runs as a small concurrency pool rather than one-at-a-time: manga
    // readers surface many page images/canvases at once and the serial wait was
    // the dominant source of "slow OCR". `activeScans` counts in-flight requests
    // (capped by settings.ocrConcurrency) and `inFlightJobs` deduplicates work
    // when several queued elements share the same image content (e.g. a canvas
    // frame re-snapshotted on a page poll).
    activeScans = 0;
    // A token owns each key. A stale scan may finish after a page turn/manual retry;
    // it must not delete the marker belonging to the newer job for the same content.
    inFlightJobs = /* @__PURE__ */ new Map();
    positionFrame = 0;
    refreshTimer = 0;
    destroyed = false;
    lastPointerMoveImage;
    lastPointerMoveReaderSurface;
    lastPointerMoveReaderSurfaceKey;
    videoFrames = /* @__PURE__ */ new Map();
    videoFrameVideos = /* @__PURE__ */ new Map();
    videoFrameControls = /* @__PURE__ */ new Map();
    videoFrameStatuses = /* @__PURE__ */ new Map();
    // Compact loading/ready indicators for every OCR'd image (not just
    // paused-video frames), so slow image OCR shows progress without a card.
    imageStatuses = /* @__PURE__ */ new Map();
    imageStatusTimers = /* @__PURE__ */ new Map();
    // Reader raster snapshots (BookWalker/ComicWalker canvases and Mokuro CSS
    // background pages): map each page surface to the invisible <img> we OCR in
    // its place, plus the page fingerprint and the page-turn poll.
    canvasFrames = /* @__PURE__ */ new Map();
    canvasFrameSources = /* @__PURE__ */ new Map();
    canvasFrameStaticRects = /* @__PURE__ */ new Map();
    canvasFrameRegionFractions = /* @__PURE__ */ new Map();
    canvasFrameKeys = /* @__PURE__ */ new Map();
    canvasFrameContentTokens = /* @__PURE__ */ new Map();
    canvasFrameLoadTimers = /* @__PURE__ */ new Map();
    canvasPendingStatuses = /* @__PURE__ */ new Map();
    canvasPendingStatusKeys = /* @__PURE__ */ new Map();
    // Canvases whose frame the user explicitly tapped to create. A native-text-layer
    // page (shouldAutoScan=false) strips AUTO frames on the poll, but a frame the user
    // tapped to make must survive that poll — only a real page turn drops it.
    canvasFrameUserRequested = /* @__PURE__ */ new Set();
    backgroundFrames = /* @__PURE__ */ new Map();
    backgroundFrameSources = /* @__PURE__ */ new Map();
    backgroundFrameKeys = /* @__PURE__ */ new Map();
    canvasReaderSignature;
    canvasReaderSamePageSignatureSkips = 0;
    // Memoized "this page is provably raster-reader-free" verdict. On a page
    // with zero raster candidates (e.g. a video site full of background-image
    // thumbnails) every viewport shift and mutation re-arm must be O(1) — no
    // selector sweep, no forced layout. Invalidated per navigation (href key)
    // and by mutations that could introduce a candidate.
    readerRasterFreeMemo;
    readerRasterPoll = 0;
    readerRasterRetryTimer = 0;
    // Entries are short-lived: settled in the capture's `finally`, cancelled on
    // release/rebind/teardown. Keep a real Map so pointer ownership can ask whether
    // any capture is pending and destroy can invalidate every in-flight capture.
    pendingCanvasSnapshots = /* @__PURE__ */ new Map();
    // Map (not WeakMap) so a page turn can clear ALL readiness at once. Keyed by
    // stable surface location instead of the canvas object: NFBR sometimes swaps an
    // equivalent #viewport canvas node while painting the same page, and object-keyed
    // readiness would then wait forever for "the same" sample to appear twice.
    canvasContentReadiness = /* @__PURE__ */ new Map();
    // Per-canvas failed-capture counter driving the backoff retry above.
    canvasCaptureAttempts = /* @__PURE__ */ new Map();
    canvasMirrorWaitStartedAt = /* @__PURE__ */ new Map();
    canvasCommitMismatches = /* @__PURE__ */ new Map();
    // Content identity recorded when a canvas's automatic retries were paused on a
    // terminal status. Continuous mode repaints the recycled canvas in place with
    // no release-all page turn, so a paused surface must reopen when it shows a
    // genuinely new page instead of inheriting "Could not read" forever.
    canvasFailureContentTokens = /* @__PURE__ */ new Map();
    readerRasterEmptyScans = /* @__PURE__ */ new Map();
    readerRasterFailedScans = /* @__PURE__ */ new Set();
    readerRasterProviderFailures = /* @__PURE__ */ new Map();
    readerRasterProviderRetryTimers = /* @__PURE__ */ new Map();
    // Canvas -> remaining tap-driven recapture attempts. In tap/manual mode the poll
    // never captures, so a tap whose capture wasn't ready (the tainted-canvas mirror
    // rebuild momentarily failed: the origin-clean page image was still loading, or
    // the engine repainted the page a beat late) must keep retrying AS a tap. This
    // window deliberately SURVIVES page-signature changes (a late NFBR repaint, or the
    // poll first registering the freshly-composited page, looks like a "turn") so the
    // tap isn't silently dropped — the reported "a page just has no OCR, no Scanning…/
    // Text ready pill" bug. Bounded so it can never become permanent auto-OCR in tap
    // mode; cleared on success, frame release, disconnect, or teardown.
    canvasTapRecapture = /* @__PURE__ */ new Map();
    ocrWordRenderStates = /* @__PURE__ */ new WeakMap();
    pointerActivatedOcrLines = /* @__PURE__ */ new WeakMap();
    replacementOcrLines = /* @__PURE__ */ new WeakMap();
    lookupLineLeases = /* @__PURE__ */ new Map();
    recentTouchOcrPoint;
    handleMediaPause = (event) => this.snapshotPausedVideo(event.target);
    // Manual trigger from the subtitle rail's OCR button: reads the paused
    // frame on demand even when automatic pause-frame OCR is switched off.
    handleManualFrameRequest = (event) => {
      const video = event.detail?.video;
      if (video) this.snapshotPausedVideo(video, true);
    };
    handleMediaResume = (event) => this.releaseVideoFrame(event.target);
    // Stepping subtitle lines while paused seeks the video — the snapshot
    // must follow the new frame instead of showing the stale one.
    handleMediaSeeked = (event) => this.refreshVideoFrameAfterSeek(event.target);
    handleDocumentPointerDown = (event) => {
      this.unpinOcrLinesFromDocumentEvent(event);
      this.requestOcrFromPointerEvent(event);
    };
    handleDocumentTouchStart = (event) => {
      this.unpinOcrLinesFromDocumentEvent(event);
      this.requestOcrFromTouchEvent(event);
    };
    handleDocumentPointerOver = (event) => this.requestOcrFromPointerEvent(event);
    handleDocumentPointerMove = (event) => this.requestOcrFromPointerEvent(event);
    handleDocumentClick = (event) => this.unpinOcrLinesFromDocumentEvent(event);
    handleDocumentScroll = () => this.handleOcrViewportShift(120);
    handleWindowScroll = () => this.handleOcrViewportShift(240);
    handleWindowResize = () => this.handleOcrViewportShift(300);
    handleSpaNavigation = () => this.teardownForNavigation();
    init() {
      this.destroyed = false;
      this.readerRasterFreeMemo = void 0;
      const body = document.body;
      if (!body) {
        document.addEventListener("DOMContentLoaded", () => {
          if (!this.destroyed) this.init();
        }, { once: true });
        return;
      }
      this.refresh();
      document.addEventListener("pointerdown", this.handleDocumentPointerDown, true);
      document.addEventListener("touchstart", this.handleDocumentTouchStart, { capture: true, passive: true });
      document.addEventListener("pointerover", this.handleDocumentPointerOver, true);
      document.addEventListener("pointermove", this.handleDocumentPointerMove, true);
      document.addEventListener("click", this.handleDocumentClick, true);
      document.addEventListener("pause", this.handleMediaPause, true);
      document.addEventListener("yomu-ocr-video-frame-request", this.handleManualFrameRequest, true);
      document.addEventListener("play", this.handleMediaResume, true);
      document.addEventListener("emptied", this.handleMediaResume, true);
      document.addEventListener("seeked", this.handleMediaSeeked, true);
      document.addEventListener("scroll", this.handleDocumentScroll, { capture: true, passive: true });
      window.addEventListener("scroll", this.handleWindowScroll, { passive: true });
      window.addEventListener("resize", this.handleWindowResize, { passive: true });
      window.addEventListener("orientationchange", this.handleWindowResize, { passive: true });
      for (const eventName of OCR_FULLSCREEN_CHANGE_EVENTS) {
        document.addEventListener(eventName, this.handleWindowResize, true);
      }
      window.visualViewport?.addEventListener("resize", this.handleDocumentScroll, { passive: true });
      window.visualViewport?.addEventListener("scroll", this.handleDocumentScroll, { passive: true });
      for (const eventName of OCR_NAVIGATION_EVENTS) {
        window.addEventListener(eventName, this.handleSpaNavigation);
      }
      this.mutationObserver = new MutationObserver((mutations) => this.handleRenderableMediaMutations(mutations));
      this.mutationObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        // width/height catch a canvas backing store growing to page shape
        // (a resize mutates only those attributes); the data-* reader
        // signals catch surfaces marked up after insertion. All feed the
        // raster-free memo invalidation in handleRenderableMediaMutations.
        attributeFilter: ["style", "class", "hidden", "src", "srcset", "sizes", "loading", "poster", "width", "height", "data-yomu-canvas-ocr", "data-page-index", "data-mokuro-reader"]
      });
      this.startReaderRasterPollingIfNeeded();
    }
    destroy() {
      this.destroyed = true;
      document.removeEventListener("pointerdown", this.handleDocumentPointerDown, true);
      document.removeEventListener("touchstart", this.handleDocumentTouchStart, true);
      document.removeEventListener("pointerover", this.handleDocumentPointerOver, true);
      document.removeEventListener("pointermove", this.handleDocumentPointerMove, true);
      document.removeEventListener("click", this.handleDocumentClick, true);
      document.removeEventListener("pause", this.handleMediaPause, true);
      document.removeEventListener("yomu-ocr-video-frame-request", this.handleManualFrameRequest, true);
      document.removeEventListener("play", this.handleMediaResume, true);
      document.removeEventListener("emptied", this.handleMediaResume, true);
      document.removeEventListener("seeked", this.handleMediaSeeked, true);
      document.removeEventListener("scroll", this.handleDocumentScroll, true);
      window.removeEventListener("scroll", this.handleWindowScroll);
      window.removeEventListener("resize", this.handleWindowResize);
      window.removeEventListener("orientationchange", this.handleWindowResize);
      for (const eventName of OCR_FULLSCREEN_CHANGE_EVENTS) {
        document.removeEventListener(eventName, this.handleWindowResize, true);
      }
      window.visualViewport?.removeEventListener("resize", this.handleDocumentScroll);
      window.visualViewport?.removeEventListener("scroll", this.handleDocumentScroll);
      for (const eventName of OCR_NAVIGATION_EVENTS) {
        window.removeEventListener(eventName, this.handleSpaNavigation);
      }
      this.releaseAllVideoFrames();
      this.releaseAllCanvasFrames();
      this.canvasTapRecapture.clear();
      this.releaseAllBackgroundFrames();
      for (const pending of this.pendingCanvasSnapshots.values()) pending.cancelled = true;
      this.pendingCanvasSnapshots.clear();
      if (this.readerRasterPoll) {
        window.clearInterval(this.readerRasterPoll);
        this.readerRasterPoll = 0;
      }
      if (this.readerRasterRetryTimer) {
        window.clearTimeout(this.readerRasterRetryTimer);
        this.readerRasterRetryTimer = 0;
      }
      this.mutationObserver?.disconnect();
      if (this.positionFrame) cancelAnimationFrame(this.positionFrame);
      this.clear();
    }
    refresh(options = {}) {
      if (this.destroyed) return;
      const settings = this.options.getSettings();
      if (!ocrRuntimeActive(settings)) {
        this.releaseAllVideoFrames();
        this.clear();
        return;
      }
      this.refreshCanvasReaderSurfaces(settings, options.userRequested);
      this.refreshBackgroundImageReaderSurfaces(settings, options.userRequested);
      if (!this.canScanInlineImages(Boolean(options.userRequested))) {
        this.releaseInlineImageStates();
        this.pruneDisconnectedStates();
        this.schedulePosition();
        return;
      }
      if (this.shouldSkipRefresh(settings, options)) {
        this.pruneDisconnectedStates();
        this.schedulePosition();
        return;
      }
      this.pruneDisconnectedStates();
      this.ensureObserver(settings);
      const images = this.refreshImages(settings);
      for (const image of images) {
        this.observeRefreshImage(image, settings);
      }
      this.schedulePosition();
    }
    /**
     * Re-evaluate auto-scan after something *outside* the reader's own settings
     * changes the answer at runtime — currently mokuro's own "OCR enabled"
     * (displayOCR) toggle, which the reader cannot see through its settings
     * subscription. When the page now supplies its native text layer we drop the
     * overlays the reader auto-painted before the flip, so the reader's OCR stops
     * competing with mokuro's text boxes; manually-scanned panels are kept. When
     * it no longer does, a normal refresh starts the reader's own scan.
     */
    reassessAutoScan() {
      if (this.destroyed) return;
      const settings = this.options.getSettings();
      if (!ocrRuntimeActive(settings)) return;
      if (this.options.shouldAutoScan?.() === false && !hasCanvasOcrOptInSurface()) {
        this.clearAutoScannedOverlays();
        this.schedulePosition();
        return;
      }
      this.refresh();
    }
    refreshForModeChange() {
      if (this.destroyed) return;
      const settings = this.options.getSettings();
      if (!ocrRuntimeActive(settings)) {
        this.releaseAllVideoFrames();
        this.clear();
        return;
      }
      if (!settings.ocrAutoScanImages) {
        this.clearAutoScannedOverlays();
        this.schedulePosition();
        return;
      }
      this.refresh();
    }
    shouldSkipRefresh(settings, options) {
      if (options.userRequested) return false;
      if (this.canAutoScanImage(settings)) return false;
      return !settings.ocrAutoScanImages || !this.hasVisibleInlineOcrFallback(settings);
    }
    handleRenderableMediaMutations(mutations) {
      const settings = this.options.getSettings();
      if (!ocrRuntimeActive(settings)) {
        this.readerRasterFreeMemo = void 0;
        return;
      }
      const memo = this.readerRasterFreeMemo;
      if (memo && (memo.free ? mutationsMayAddReaderRasterCandidate(mutations) : mutationsMayRemoveReaderRasterCandidate(mutations))) {
        this.readerRasterFreeMemo = void 0;
      }
      const summary = summarizeRenderableMediaMutations(mutations);
      if (!summary.touched) return;
      this.schedulePosition();
      if (!canAutoRefreshOcrAfterMutation(settings, this.options.shouldAutoScan)) return;
      this.scheduleRefresh(summary.addedImage ? 0 : 40);
    }
    handleOcrViewportShift(refreshDelay) {
      if (!ocrRuntimeActive(this.options.getSettings())) return;
      this.schedulePosition();
      if (this.hasReaderRasterSurfaces()) {
        this.scheduleReaderRasterRefresh(refreshDelay);
        return;
      }
      this.scheduleRefresh(refreshDelay);
    }
    hasReaderRasterSurfaces() {
      if (this.canvasFrames.size > 0 || this.canvasPendingStatuses.size > 0 || this.backgroundFrames.size > 0) return true;
      if (this.isProvenRasterFreePage()) return false;
      return isReaderRasterPage();
    }
    hasReaderRasterCaptureWork() {
      return this.canvasFrames.size > 0 || this.canvasPendingStatuses.size > 0 || this.backgroundFrames.size > 0 || isReaderRasterPage();
    }
    hasTrackedManualCanvasSurface() {
      for (const canvas of this.canvasFrames.keys()) {
        if (isManualCanvasReaderSurface(canvas)) return true;
      }
      for (const canvas of this.canvasPendingStatuses.keys()) {
        if (isManualCanvasReaderSurface(canvas)) return true;
      }
      return false;
    }
    // A "free" verdict is provable from layout-free facts alone and stays valid
    // until a mutation could add a candidate (observer invalidates) or the SPA
    // navigates (href key). A "not free" verdict just means the full sweeps must
    // run, exactly as before the memo existed — canvas paint can change their
    // answer without any DOM mutation, so it is never trusted beyond that.
    isProvenRasterFreePage() {
      const memo = this.readerRasterFreeMemo;
      if (memo && memo.href === location.href) return memo.free;
      const free = !pageHasReaderRasterCandidates();
      this.readerRasterFreeMemo = { href: location.href, free };
      return free;
    }
    hasVisibleInlineOcrFallback(settings) {
      if (!this.canScanInlineImages(false)) return false;
      return Array.from(document.images).some((image) => {
        if (!readFallbackOcrResult(image, false)) return false;
        return isCandidateImage(image, settings) && shouldObserveImage(image, settings);
      });
    }
    refreshImages(settings) {
      return Array.from(document.images).filter((image) => isCandidateImage(image, settings) && shouldObserveImage(image, settings)).sort((a, b) => this.compareRefreshImages(a, b)).slice(0, imageReaderMaxImages(settings));
    }
    compareRefreshImages(a, b) {
      const priorityDelta = this.observePriority(a) - this.observePriority(b);
      return priorityDelta || imageViewportDistance(a) - imageViewportDistance(b);
    }
    observeRefreshImage(image, settings) {
      const state2 = this.ensureState(image);
      this.observer?.observe(image);
      if (this.shouldAutoEnqueueImage(image, state2, settings)) this.enqueue(image);
    }
    shouldAutoEnqueueImage(image, state2, settings) {
      return (this.canAutoScanImage(settings) || settings.ocrAutoScanImages && hasInlineOcrFallback(image)) && isOcrImageStateIdle(state2) && isNearViewport(image, imagePrefetchMargin(settings));
    }
    canAutoScanImage(settings) {
      return settings.ocrAutoScanImages && this.options.shouldAutoScan?.() !== false;
    }
    canScanInlineImages(userRequested) {
      if (!userRequested && this.hasActiveReaderRasterOwnership()) return false;
      return this.options.shouldScanInlineImages?.(userRequested) !== false;
    }
    hasActiveReaderRasterOwnership() {
      return this.canvasFrames.size > 0 || this.canvasPendingStatuses.size > 0 || this.pendingCanvasSnapshots.size > 0 || this.backgroundFrames.size > 0;
    }
    async scanVisible() {
      this.readerRasterFreeMemo = void 0;
      const settings = this.options.getSettings();
      const retriedReaderFrames = this.retryVisibleReaderRasterFrames(settings);
      this.refresh({ userRequested: true });
      if (!this.canScanInlineImages(true)) {
        if (!retriedReaderFrames) this.options.onToast(uiText(this.options.getSettings().interfaceLanguage, "ocrNoReadableImages"));
        return;
      }
      const images = [...this.states.keys()].filter((image) => isCandidateImage(image, settings) && isNearViewport(image, 120));
      if (!images.length) {
        if (!retriedReaderFrames && !this.hasReaderRasterCaptureWork()) {
          this.options.onToast(uiText(this.options.getSettings().interfaceLanguage, "ocrNoReadableImages"));
        }
        return;
      }
      images.forEach((image) => this.enqueue(image, true));
      log.info("Manual OCR scan queued images", { images: images.length });
    }
    captureSourceImageForElement(element) {
      const staleLine = element?.closest?.(".jpdb-ocr-line");
      if (!staleLine) return void 0;
      const line = this.currentOcrLine(staleLine);
      const state2 = [...this.states.values()].find((candidate) => candidate.overlay.contains(line));
      if (!state2) return void 0;
      const image = captureImageElement(state2.image);
      return image;
    }
    pinLineForElement(element) {
      const staleLine = element?.closest?.(".jpdb-ocr-line");
      if (!staleLine) return;
      const line = this.currentOcrLine(staleLine);
      const state2 = [...this.states.values()].find((candidate) => candidate.overlay.contains(line));
      if (state2) this.pinLine(state2, line);
    }
    unpinLineForElement(element) {
      const staleLine = element?.closest?.(".jpdb-ocr-line");
      const line = staleLine ? this.currentOcrLine(staleLine) : void 0;
      if (line?.dataset.pinned === "true") this.unpinLine(line);
    }
    retainLineForLookup(element) {
      const staleLine = element?.closest?.(".jpdb-ocr-line");
      if (!staleLine) return void 0;
      const line = this.currentOcrLine(staleLine);
      const state2 = [...this.states.values()].find((candidate) => candidate.overlay.contains(line));
      if (!state2) return void 0;
      const lease = { line };
      const leases = this.lookupLineLeases.get(line) ?? /* @__PURE__ */ new Set();
      leases.add(lease);
      this.lookupLineLeases.set(line, leases);
      this.activateOcrLineMarkup(state2, line);
      this.syncOcrLineActiveState(line);
      this.schedulePosition();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const currentLine = lease.line;
        lease.line = void 0;
        if (!currentLine) return;
        const current = this.lookupLineLeases.get(currentLine);
        if (!current?.delete(lease)) return;
        if (current.size === 0) this.lookupLineLeases.delete(currentLine);
        this.syncOcrLineActiveState(currentLine);
        this.schedulePosition();
      };
    }
    ensureObserver(settings) {
      const rootMargin = `${imagePrefetchMargin(settings)}px 0px`;
      if (this.observer && this.observerMargin === rootMargin) return;
      this.observer?.disconnect();
      this.observerMargin = rootMargin;
      if (typeof IntersectionObserver !== "function") {
        this.observer = void 0;
        return;
      }
      this.observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const image = entry.target;
          this.positionState(image);
          const current = this.options.getSettings();
          const state2 = this.states.get(image);
          if (state2 && this.shouldAutoEnqueueImage(image, state2, current)) this.enqueue(image);
        }
      }, { rootMargin });
    }
    ensureState(image) {
      const existing = this.states.get(image);
      if (existing) return existing;
      const overlay = document.createElement("div");
      overlay.className = "jpdb-ocr-layer";
      overlay.dataset.jpdbReaderRoot = "true";
      overlay.dataset.ocrLayerId = String(++ocrLayerCounter);
      overlay.hidden = true;
      setOcrOverlayAccessibility(overlay, false);
      this.mountOcrOverlayForImage(overlay, image);
      const state2 = { image, overlay, key: imageCacheKey(image), loading: false, overlayRequested: false, manualRequested: false, autoSkipped: false };
      const loadListener = () => {
        this.resetStateIfImageChanged(state2);
        this.schedulePosition();
        this.scheduleRefresh(0);
      };
      state2.loadListener = loadListener;
      image.addEventListener("load", loadListener);
      this.states.set(image, state2);
      if (image.complete && image.naturalWidth > 0) {
        this.schedulePosition();
        const settings = this.options.getSettings();
        if (this.canAutoScanImage(settings) || settings.ocrAutoScanImages && hasInlineOcrFallback(image)) this.enqueue(image);
      }
      return state2;
    }
    mountOcrOverlayForImage(overlay, image) {
      const video = this.videoFrameVideos.get(image);
      appendOcrArtifactToRoot(overlay, video ? videoFrameArtifactRoot(video) : document.body);
    }
    enqueue(image, userRequested = false) {
      if (isYouTubeThumbnailImage(image)) return;
      const state2 = this.states.get(image) ?? this.ensureState(image);
      if (!this.shouldQueueOcrRequest(state2, image, userRequested)) return;
      this.queueOcrRequest(image);
    }
    shouldQueueOcrRequest(state2, image, userRequested) {
      if (shouldSkipOcrRequest(state2, userRequested)) return false;
      const forceExistingOverlay = userRequested && !state2.overlayRequested;
      updateOcrRequestFlags(state2, image, userRequested);
      if (this.renderExistingOcrResult(state2, forceExistingOverlay)) return false;
      return !state2.loading;
    }
    queueOcrRequest(image) {
      this.queueImageForOcr(image);
      this.drainQueue();
    }
    renderExistingOcrResult(state2, userRequested) {
      if (!state2.result) return false;
      if (userRequested) void this.renderResult(state2, state2.result, true, state2.key);
      return true;
    }
    requestOcrFromPointerEvent(event) {
      if (this.isDuplicateTouchPointerOcrEvent(event)) return false;
      const settings = this.options.getSettings();
      const image = ocrImageFromPointerEvent(event, settings);
      if (image) {
        if (!this.canScanInlineImages(true)) return false;
        if (event.type === "pointermove" && image === this.lastPointerMoveImage) return false;
        if (event.type === "pointermove") this.lastPointerMoveImage = image;
        else this.lastPointerMoveImage = void 0;
        this.lastPointerMoveReaderSurface = void 0;
        this.lastPointerMoveReaderSurfaceKey = void 0;
        this.enqueue(image, true);
        return true;
      }
      const surface = ocrReaderSurfaceFromPointerEvent(event, settings);
      if (!surface) return false;
      const autoOwnsSurface = settings.ocrAutoScanImages && this.options.shouldAutoScan?.() !== false && !(surface instanceof HTMLCanvasElement && isManualCanvasReaderSurface(surface));
      if (autoOwnsSurface) return false;
      const surfaceKey = readerRasterSurfaceSnapshotKey(surface);
      if (event.type === "pointermove" && surface === this.lastPointerMoveReaderSurface && surfaceKey === this.lastPointerMoveReaderSurfaceKey) return false;
      if (event.type === "pointermove") {
        this.lastPointerMoveReaderSurface = surface;
        this.lastPointerMoveReaderSurfaceKey = surfaceKey;
      } else {
        this.lastPointerMoveReaderSurface = void 0;
        this.lastPointerMoveReaderSurfaceKey = void 0;
      }
      void this.snapshotReaderSurface(surface, settings);
      return true;
    }
    requestOcrFromTouchEvent(event) {
      const point = touchPointFromEvent(event);
      if (!point) return;
      if (this.requestOcrFromPointerEvent(eventWithPoint(event, point))) {
        this.recentTouchOcrPoint = { ...point, at: Date.now() };
      }
    }
    isDuplicateTouchPointerOcrEvent(event) {
      if (event.type !== "pointerdown" || !isPointerLikeEvent(event) || event.pointerType !== "touch") return false;
      const recent = this.recentTouchOcrPoint;
      if (!recent) return false;
      if (Date.now() - recent.at > 700) {
        this.recentTouchOcrPoint = void 0;
        return false;
      }
      return Math.abs(event.clientX - recent.clientX) <= 6 && Math.abs(event.clientY - recent.clientY) <= 6;
    }
    async snapshotReaderSurface(surface, settings) {
      if (surface instanceof HTMLCanvasElement) {
        const existing2 = this.canvasFrames.get(surface);
        if (existing2?.complete && existing2.naturalWidth > 0) {
          this.enqueue(existing2, true);
          return;
        }
        await this.snapshotCanvasSurface(surface, settings, true);
        return;
      }
      const existing = this.backgroundFrames.get(surface);
      if (existing?.complete && existing.naturalWidth > 0) {
        this.enqueue(existing, true);
        return;
      }
      this.snapshotBackgroundImageSurface(surface, settings, true);
    }
    queueImageForOcr(image) {
      if (!this.queue.includes(image)) this.queue.push(image);
    }
    drainQueue() {
      if (this.destroyed) return;
      const limit = ocrConcurrencyLimit(this.options.getSettings());
      while (this.activeScans < limit) {
        const image = this.takeNextQueuedImage();
        if (!image) return;
        this.startScan(image);
      }
    }
    // Pull the next queued image whose content is not already being scanned, so
    // duplicate enqueues / re-snapshotted canvas frames don't fire redundant OCR
    // calls (the cache fills them in once the in-flight scan resolves).
    takeNextQueuedImage() {
      for (let index = 0; index < this.queue.length; index++) {
        const candidate = this.queue[index];
        if (this.inFlightJobs.has(imageCacheKey(candidate))) continue;
        this.queue.splice(index, 1);
        return candidate;
      }
      return void 0;
    }
    startScan(image) {
      if (this.destroyed) return;
      const key = imageCacheKey(image);
      const job = Symbol(key);
      this.activeScans++;
      this.inFlightJobs.set(key, job);
      const hasFastText = Boolean(readFallbackOcrResult(image, false));
      const isReaderRasterFrame = this.isReaderRasterFrame(image);
      const delay = this.cache.has(key) || this.states.get(image)?.overlayRequested || hasFastText || isReaderRasterFrame || this.videoFrameVideos.has(image) ? 0 : 900;
      void waitForIdle(delay, delay).then(() => this.scanImage(image)).catch((error) => {
        if (isStaleOcrState(error)) return;
        log.warn("OCR scan task failed unexpectedly", {}, error);
      }).finally(() => {
        this.activeScans = Math.max(0, this.activeScans - 1);
        if (this.inFlightJobs.get(key) === job) this.inFlightJobs.delete(key);
        if (!this.destroyed) this.drainQueue();
      });
    }
    async scanImage(image) {
      if (this.destroyed) return;
      if (!ocrRuntimeActive(this.options.getSettings())) return;
      const existingState = this.states.get(image);
      if (!image.isConnected) {
        if (existingState) this.releaseImageState(image, existingState);
        return;
      }
      const state2 = existingState ?? this.ensureState(image);
      const settings = this.options.getSettings();
      const manualRequested = state2.manualRequested;
      this.resetStateIfImageChanged(state2);
      const key = state2.key;
      if (await this.tryRenderCachedOcrResult(state2, key)) return;
      if (!this.isCurrentContentState(state2, key)) return;
      this.updateOcrStatus(image, "loading");
      const scan = beginOcrScan(state2, image, settings, manualRequested);
      try {
        await this.scanUncachedImage(state2, image, key, settings, scan.provider, manualRequested);
      } catch (error) {
        if (isStaleOcrState(error)) return;
        try {
          await this.renderOcrFailure(state2, image, key, scan.provider, manualRequested, error);
        } catch (renderError) {
          if (isStaleOcrState(renderError)) return;
          throw renderError;
        }
      } finally {
        finishOcrScan(state2);
        scan.done();
      }
    }
    async renderCachedOcrResult(state2, key) {
      if (this.isReaderRasterFrame(state2.image) && !state2.manualRequested && this.readerRasterFailedScans.has(key)) {
        this.requireCurrentContentState(state2, key);
        this.renderNoOcrLines(state2);
        this.updateOcrStatus(state2.image, "failed");
        state2.manualRequested = false;
        return true;
      }
      if (!this.cache.has(key)) return false;
      if (this.shouldSuppressAutoRenderedResult(state2, false)) {
        this.clearAutoScannedOverlays();
        return true;
      }
      const cached = this.cache.get(key);
      this.requireCurrentContentState(state2, key);
      if (!cached) {
        if (this.isReaderRasterFrame(state2.image)) {
          const emptyScanKey = this.readerRasterEmptyScanKey(state2, key);
          if ((this.readerRasterEmptyScans.get(emptyScanKey) ?? 0) >= READER_RASTER_MAX_EMPTY_SCAN_ATTEMPTS) {
            this.renderNoOcrLines(state2);
            this.updateOcrStatus(state2.image, "empty");
            state2.manualRequested = false;
            return true;
          }
          this.forget(key);
          return false;
        }
        if (this.shouldPreserveReaderRasterResult(state2)) return true;
        this.renderNoOcrLines(state2);
        this.updateOcrStatus(state2.image, "empty");
        state2.manualRequested = false;
        return true;
      }
      await this.renderResult(state2, cached, false, key);
      state2.manualRequested = false;
      return true;
    }
    async tryRenderCachedOcrResult(state2, key) {
      try {
        return await this.renderCachedOcrResult(state2, key);
      } catch (error) {
        if (isStaleOcrState(error)) return true;
        throw error;
      }
    }
    async scanUncachedImage(state2, image, key, settings, provider, manualRequested) {
      const inlineFallback = readFallbackOcrResult(image, false);
      const providerResult = inlineFallback ? null : await promiseWithTimeout(
        this.recognizeImage(image, settings),
        ocrAttemptTimeoutMs(settings, this.options.ocrAttemptTimeoutFloorMs),
        "OCR timed out."
      );
      this.requireCurrentState(state2);
      const result = inlineFallback ?? providerResult;
      if (!result?.lines.length) {
        this.readerRasterFailedScans.delete(key);
        this.clearReaderRasterProviderRetry(key);
        if (this.shouldPreserveReaderRasterResult(state2)) {
          this.updateOcrStatus(image, "ready");
          return;
        }
        const readerRasterEmptyAttempts = this.isReaderRasterFrame(image) ? this.recordReaderRasterEmptyScan(state2, key, manualRequested) : 0;
        if (this.isReaderRasterFrame(image)) {
          if (!manualRequested && readerRasterEmptyAttempts >= READER_RASTER_MAX_EMPTY_SCAN_ATTEMPTS) {
            this.remember(key, null);
          } else {
            this.forget(key);
          }
        } else {
          this.remember(key, null);
        }
        this.requireCurrentContentState(state2, key);
        this.renderNoOcrLines(state2);
        this.updateOcrStatus(
          image,
          this.isReaderRasterFrame(image) && readerRasterEmptyAttempts < READER_RASTER_MAX_EMPTY_SCAN_ATTEMPTS ? "loading" : "empty"
        );
        return;
      }
      this.remember(key, result);
      this.readerRasterEmptyScans.delete(this.readerRasterEmptyScanKey(state2, key));
      this.readerRasterFailedScans.delete(key);
      this.clearReaderRasterProviderRetry(key);
      this.requireCurrentContentState(state2, key);
      state2.key = key;
      if (this.shouldSuppressAutoRenderedResult(state2, Boolean(inlineFallback), manualRequested)) {
        this.clearAutoScannedOverlays();
        return;
      }
      await this.renderResult(state2, result, false, key);
      log.info("OCR result rendered", { provider, lines: result.lines.length, manualRequested });
    }
    shouldSuppressAutoRenderedResult(state2, inlineFallback, manualRequested = state2.manualRequested) {
      return !manualRequested && !state2.overlayRequested && !inlineFallback && !this.isReaderRasterOcrOptInFrame(state2.image) && this.options.shouldAutoScan?.() === false;
    }
    isReaderRasterOcrOptInFrame(image) {
      const canvas = this.canvasFrameSources.get(image);
      return Boolean(canvas && isCanvasOcrOptInSurface(canvas));
    }
    async renderOcrFailure(state2, image, key, provider, manualRequested, error) {
      this.requireCurrentContentState(state2, key);
      const fallback = readFallbackOcrResult(image, false);
      if (fallback?.lines.length) {
        log.warn("OCR provider failed", { provider }, error);
        this.readerRasterFailedScans.delete(key);
        this.clearReaderRasterProviderRetry(key);
        await this.renderResult(state2, fallback, false, key);
        return;
      }
      if (this.isReaderRasterFrame(image) && this.scheduleReaderRasterProviderRetry(state2, key, manualRequested, error)) {
        this.updateOcrStatus(image, "loading");
        return;
      }
      if (this.isReaderRasterFrame(image)) {
        this.clearReaderRasterProviderRetry(key);
        this.rememberReaderRasterFailure(key);
      }
      logOcrFailure(state2, provider, manualRequested, error);
      this.updateOcrStatus(image, "failed");
    }
    recognizeImage(image, settings) {
      const recognizer = ocrRecognizer(settings);
      if (!recognizer) return Promise.resolve(null);
      if (this.shouldSplitBookwalkerSpreadFrame(image)) return this.recognizeBookwalkerSpreadFrame(image, settings, recognizer);
      return this.recognizeWithDarkPass(image, settings, recognizer);
    }
    shouldSplitBookwalkerSpreadFrame(image) {
      const canvas = this.canvasFrameSources.get(image);
      if (!canvas || !isWideBookwalkerSpreadCanvas(canvas)) return false;
      try {
        const size = loadedImageSize(image);
        return size.width / Math.max(1, size.height) >= BOOKWALKER_SPREAD_MIN_ASPECT;
      } catch {
        return false;
      }
    }
    async recognizeBookwalkerSpreadFrame(image, settings, recognizer) {
      const slices = await splitImageIntoPageColumns(image);
      const results = await Promise.all(slices.map(async (slice) => {
        const result = await this.recognizeWithDarkPass(slice.image, settings, recognizer).catch(() => null);
        return result ? offsetOcrResult(result, slice.left, 0, slice.totalWidth, slice.totalHeight) : null;
      }));
      return mergeOcrResults(slices[0]?.totalWidth ?? 0, slices[0]?.totalHeight ?? 0, results);
    }
    // Normal recognition always runs. A second, inverted pass is spent only when
    // the image has a dark region (where white-on-black text could hide) AND that
    // region came back unread by the normal pass. Full-page reader canvases are
    // the latency-sensitive path: if the normal pass found text on a manga page,
    // don't double the provider round-trip just to search dark art regions. If a
    // reader page comes back empty, the inverted recovery still gets a chance.
    async recognizeWithDarkPass(image, settings, recognizer) {
      const normal = await this.runRecognizer(image, settings, recognizer, false);
      if (!settings.ocrInvertDarkPanels) return normal;
      const field = buildLuminanceField(image);
      if (!field || luminanceFieldDarkFraction(field) < DARK_REGION_TRIGGER) return normal;
      if ((this.canvasFrameSources.has(image) || this.backgroundFrameSources.has(image)) && normal?.lines.length) return normal;
      if (darkAreaIsRead(field, normal)) return normal;
      const inverted = await this.runRecognizer(image, settings, recognizer, true).catch(() => null);
      return mergeDarkPassResult(normal, inverted, field);
    }
    runRecognizer(image, settings, recognizer, invert) {
      if (settings.ocrProvider !== "local-service") return recognizer(image, settings, invert);
      return this.recognizeViaLocalServiceWithBackoff(image, settings, recognizer, invert);
    }
    async recognizeViaLocalServiceWithBackoff(image, settings, recognizer, invert) {
      const endpointUrl = localOcrEndpointUrl(settings);
      if (this.isLocalOcrUnavailable(endpointUrl)) throw new LocalOcrUnavailableError(endpointUrl);
      try {
        const result = await recognizer(image, settings, invert);
        this.clearLocalOcrUnavailable(endpointUrl);
        return result;
      } catch (error) {
        if (isLocalOcrConnectionError(error)) this.rememberLocalOcrUnavailable(endpointUrl);
        throw error;
      }
    }
    isLocalOcrUnavailable(endpointUrl) {
      const unavailable = this.localOcrUnavailable;
      if (!unavailable || unavailable.endpointUrl !== endpointUrl) return false;
      if (Date.now() < unavailable.retryAt) return true;
      this.localOcrUnavailable = void 0;
      return false;
    }
    rememberLocalOcrUnavailable(endpointUrl) {
      this.localOcrUnavailable = { endpointUrl, retryAt: Date.now() + LOCAL_OCR_UNAVAILABLE_RETRY_MS };
    }
    clearLocalOcrUnavailable(endpointUrl) {
      if (this.localOcrUnavailable?.endpointUrl === endpointUrl) this.localOcrUnavailable = void 0;
    }
    async renderResult(state2, result, forceOverlay = false, expectedKey = state2.key) {
      this.requireCurrentContentState(state2, expectedKey);
      if (this.shouldPreserveReaderRasterResult(state2) && state2.overlay.querySelector(".jpdb-ocr-line") && ocrResultTextKey(state2.result) === ocrResultTextKey(result)) {
        this.updateOcrStatus(state2.image, "ready");
        return;
      }
      state2.result = result;
      const settings = this.options.getSettings();
      const showText = this.shouldShowOcrTextOverlay(state2, settings, forceOverlay);
      const initialParsed = await this.parseOcrLines(result.lines);
      this.requireCurrentContentState(state2, expectedKey);
      const lines = cleanOcrLookupLines(result.lines, initialParsed);
      if (!lines.length) {
        if (this.shouldPreserveReaderRasterResult(state2)) {
          this.updateOcrStatus(state2.image, "ready");
          return;
        }
        this.renderNoOcrLines(state2);
        this.updateOcrStatus(state2.image, "empty");
        return;
      }
      const parsed = ocrLinesChanged(result.lines, lines) ? await this.parseOcrLines(lines) : initialParsed;
      this.requireCurrentContentState(state2, expectedKey);
      const sentence = lines.map((line) => line.text).join("\n");
      const vocabulary = ocrVocabularyCards(state2.image);
      const fallbackCardFromText = ocrFallbackCardFromImage(
        state2.image,
        this.options.fallbackCardFromText ?? ocrFallbackCardFromText
      );
      const renderedTokens = lines.map((line, index) => ocrTokensWithFallbackGaps(
        line.text,
        ocrTokensWithVocabulary(line.text, parsed[index] ?? [], vocabulary),
        fallbackCardFromText
      ));
      const flatTokens = renderedTokens.flat();
      await this.options.enrichTokensBeforeRender?.(flatTokens);
      this.requireCurrentContentState(state2, expectedKey);
      applyOcrOverlayStyle(state2.overlay, settings);
      const lineElements = lines.map((line, index) => this.renderOcrLineElement(state2, result, line, renderedTokens[index] ?? [], sentence, showText, settings));
      const staleLines = Array.from(state2.overlay.querySelectorAll(".jpdb-ocr-line"));
      state2.overlay.append(...lineElements);
      this.migrateOcrLineInteractionState(state2, staleLines, lineElements);
      staleLines.forEach((node) => node.remove());
      this.revealVideoFrameOverlay(state2.image);
      this.positionState(state2.image);
      if (this.canvasFrameSources.has(state2.image)) {
        this.canvasReaderSignature = canvasReaderPageSignature();
        this.canvasReaderSamePageSignatureSkips = 0;
      }
      this.updateOcrStatus(state2.image, "ready");
      void Promise.resolve(this.options.enrichRenderedTokens?.(flatTokens, state2.overlay)).catch((error) => {
        if (isStaleOcrState(error)) return;
        log.warn("OCR rendered token enrichment failed", {}, error);
      }).finally(() => this.schedulePosition());
    }
    shouldShowOcrTextOverlay(state2, settings, forceOverlay) {
      if (this.isScannedPdfCanvasFrame(state2.image)) return false;
      if (this.isReaderRasterFrame(state2.image)) return false;
      return false;
    }
    isScannedPdfCanvasFrame(image) {
      const canvas = this.canvasFrameSources.get(image);
      return Boolean(canvas && (canvas.dataset.pdfText === "scanned" || canvas.closest('.pdf-page[data-pdf-text="scanned"]')));
    }
    async parseOcrLines(lines) {
      const options = ocrParseOptions();
      const texts = lines.map((line) => line.text);
      if (this.options.parseJapaneseBatch) {
        return this.options.parseJapaneseBatch(texts, options).then((parsed) => texts.map((_, index) => parsed[index] ?? [])).catch(() => texts.map(() => []));
      }
      return Promise.all(lines.map((line) => this.options.parseJapanese(line.text, options).catch(() => {
        return [];
      })));
    }
    renderOcrLineElement(state2, result, line, tokens, sentence, showText, settings) {
      const element = createOcrLineElement(result, line, tokens, sentence, showText, settings);
      this.rememberOcrWordRenderStates(element, tokens);
      element.addEventListener("pointerenter", () => this.activateOcrLineMarkup(state2, element));
      element.addEventListener("focusin", () => this.activateOcrLineMarkup(state2, element));
      element.addEventListener("pointerdown", (event) => this.activateOcrLineFromPointer(state2, element, event), true);
      element.addEventListener("keydown", (event) => this.toggleOcrLinePinnedFromKeyboard(state2, element, event));
      element.addEventListener("click", (event) => this.toggleOcrLinePinned(state2, element, event));
      return element;
    }
    activateOcrLineFromPointer(state2, element, event) {
      if (event.button !== 0) return;
      if (element.dataset.pinned === "true") {
        this.activateOcrLineMarkup(state2, element);
        return;
      }
      if (shouldPinOcrLineFromPointer(event)) {
        element.focus({ preventScroll: true });
        this.pinLine(state2, element);
      } else {
        this.activateOcrLineMarkup(state2, element);
      }
      this.pointerActivatedOcrLines.set(element, Date.now());
    }
    toggleOcrLinePinnedFromKeyboard(state2, element, event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (element.dataset.pinned === "true") {
        this.unpinLine(element);
      } else {
        this.pinLine(state2, element);
      }
      event.preventDefault();
      event.stopPropagation();
    }
    toggleOcrLinePinned(state2, element, event) {
      if (this.wasRecentlyPointerActivated(element)) {
        this.activateOcrLineMarkup(state2, element);
      } else if (element.dataset.pinned === "true") {
        this.unpinLine(element);
      } else {
        this.activateOcrLineMarkup(state2, element);
      }
      event.preventDefault();
      event.stopPropagation();
    }
    wasRecentlyPointerActivated(element) {
      const activatedAt = this.pointerActivatedOcrLines.get(element);
      if (activatedAt === void 0) return false;
      const recent = Date.now() - activatedAt < 800;
      if (!recent) this.pointerActivatedOcrLines.delete(element);
      return recent;
    }
    pinLine(state2, element) {
      state2.overlay.querySelectorAll('.jpdb-ocr-line[data-pinned="true"]').forEach((line) => {
        if (line !== element) this.unpinLine(line);
      });
      this.activateOcrLineMarkup(state2, element);
      element.dataset.pinned = "true";
      element.setAttribute("aria-pressed", "true");
      this.syncOcrLineActiveState(element);
      this.schedulePosition();
    }
    unpinLine(element) {
      element.dataset.pinned = "false";
      element.setAttribute("aria-pressed", "false");
      this.syncOcrLineActiveState(element);
      this.schedulePosition();
    }
    syncOcrLineActiveState(element) {
      const retained = Boolean(this.lookupLineLeases.get(element)?.size);
      element.classList.toggle("jpdb-ocr-line-active", element.dataset.pinned === "true" || retained);
    }
    migrateOcrLineInteractionState(state2, staleLines, replacementLines) {
      const available = new Set(replacementLines);
      const replacements = /* @__PURE__ */ new Map();
      staleLines.forEach((staleLine) => {
        const identity = ocrRenderedLineIdentity(staleLine);
        const replacement = replacementLines.find((candidate) => available.has(candidate) && ocrRenderedLineIdentity(candidate) === identity);
        if (!replacement) return;
        replacements.set(staleLine, replacement);
        available.delete(replacement);
      });
      staleLines.forEach((staleLine, index) => {
        if (replacements.has(staleLine)) return;
        const replacement = replacementLines[index];
        if (!replacement || !available.has(replacement)) return;
        replacements.set(staleLine, replacement);
        available.delete(replacement);
      });
      staleLines.forEach((staleLine) => {
        const replacement = replacements.get(staleLine);
        if (replacement) {
          this.replacementOcrLines.set(staleLine, replacement);
        }
        const leases = this.lookupLineLeases.get(staleLine);
        this.lookupLineLeases.delete(staleLine);
        if (leases && replacement) {
          const replacementLeases = this.lookupLineLeases.get(replacement) ?? /* @__PURE__ */ new Set();
          leases.forEach((lease) => {
            lease.line = replacement;
            replacementLeases.add(lease);
          });
          this.lookupLineLeases.set(replacement, replacementLeases);
        } else {
          leases?.forEach((lease) => {
            lease.line = void 0;
          });
        }
        if (!replacement) return;
        if (staleLine.dataset.pinned === "true") {
          replacement.dataset.pinned = "true";
          replacement.setAttribute("aria-pressed", "true");
        }
        if (leases?.size || replacement.dataset.pinned === "true") {
          this.activateOcrLineMarkup(state2, replacement);
        }
        this.syncOcrLineActiveState(replacement);
      });
    }
    currentOcrLine(line) {
      let current = line;
      let replacement = this.replacementOcrLines.get(current);
      while (replacement && replacement !== current) {
        current = replacement;
        replacement = this.replacementOcrLines.get(current);
      }
      if (current !== line) this.replacementOcrLines.set(line, current);
      return current;
    }
    discardOcrLineInteractionState(lines) {
      for (const line of lines) {
        const leases = this.lookupLineLeases.get(line);
        leases?.forEach((lease) => {
          lease.line = void 0;
        });
        this.lookupLineLeases.delete(line);
      }
    }
    renderNoOcrLines(state2) {
      this.discardOcrLineInteractionState(state2.overlay.querySelectorAll(".jpdb-ocr-line"));
      renderNoOcrLines(state2);
    }
    unpinOcrLinesFromDocumentEvent(event) {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".jpdb-ocr-line, .jpdb-reader-popover, .jpdb-reader-settings, .jpdb-reader-onboarding, .jpdb-reader-fab")) return;
      this.unpinAllLines();
    }
    unpinAllLines() {
      for (const state2 of this.states.values()) {
        state2.overlay.querySelectorAll('.jpdb-ocr-line[data-pinned="true"]').forEach((line) => this.unpinLine(line));
      }
    }
    observePriority(image) {
      const state2 = this.states.get(image);
      if (!state2) return 0;
      if (!state2.result) return state2.autoSkipped ? 2 : 0;
      return 1;
    }
    resetStateIfImageChanged(state2) {
      const key = imageCacheKey(state2.image);
      if (key === state2.key) return;
      const preserveReaderRasterResult = this.shouldPreserveReaderRasterResult(state2);
      state2.key = key;
      if (!preserveReaderRasterResult) state2.result = void 0;
      state2.loading = false;
      state2.overlayRequested = false;
      state2.manualRequested = false;
      state2.autoSkipped = false;
      if (!preserveReaderRasterResult) {
        this.discardOcrLineInteractionState(state2.overlay.querySelectorAll(".jpdb-ocr-line"));
        state2.overlay.querySelectorAll(".jpdb-ocr-line").forEach((node) => node.remove());
        this.removeImageStatusCard(state2.image);
      }
    }
    shouldPreserveReaderRasterResult(state2) {
      return Boolean(state2.result && this.isReaderRasterFrame(state2.image));
    }
    isReaderRasterFrame(image) {
      return this.canvasFrameSources.has(image) || this.backgroundFrameSources.has(image);
    }
    recordReaderRasterEmptyScan(state2, key, userRequested) {
      if (!this.isReaderRasterFrame(state2.image)) return 0;
      const emptyScanKey = this.readerRasterEmptyScanKey(state2, key);
      const attempts = (this.readerRasterEmptyScans.get(emptyScanKey) ?? 0) + 1;
      this.readerRasterEmptyScans.set(emptyScanKey, attempts);
      if (attempts >= READER_RASTER_MAX_EMPTY_SCAN_ATTEMPTS) return attempts;
      window.setTimeout(() => {
        if (!this.isCurrentContentState(state2, key)) return;
        const canvas = this.canvasFrameSources.get(state2.image);
        if (canvas && this.canvasFrameNeedsResnapshot(canvas)) {
          this.releaseCanvasFrameForResnapshot(canvas);
          this.scheduleReaderRasterRefresh(0);
          return;
        }
        state2.autoSkipped = false;
        this.enqueue(state2.image, userRequested);
      }, READER_RASTER_EMPTY_RETRY_MS);
      return attempts;
    }
    readerRasterEmptyScanKey(state2, fallbackKey) {
      return state2.image.dataset.ocrAttemptKey || fallbackKey;
    }
    scheduleReaderRasterProviderRetry(state2, key, userRequested, error) {
      const attemptCost = isOcrRequestTimeout(error) ? 2 : 1;
      const attempts = (this.readerRasterProviderFailures.get(key) ?? 0) + attemptCost;
      this.readerRasterProviderFailures.set(key, attempts);
      if (attempts >= READER_RASTER_MAX_PROVIDER_ATTEMPTS + 1) return false;
      const delay = READER_RASTER_PROVIDER_RETRY_BASE_MS * 2 ** (attempts - 1);
      log.warn("OCR provider failed transiently; retrying reader page", { attempt: attempts, delay }, error);
      const previousTimer = this.readerRasterProviderRetryTimers.get(key);
      if (previousTimer) window.clearTimeout(previousTimer);
      const timer = window.setTimeout(() => {
        if (this.readerRasterProviderRetryTimers.get(key) !== timer) return;
        this.readerRasterProviderRetryTimers.delete(key);
        if (!this.isCurrentContentState(state2, key)) return;
        state2.autoSkipped = false;
        this.enqueue(state2.image, userRequested);
      }, delay);
      this.readerRasterProviderRetryTimers.set(key, timer);
      return true;
    }
    clearReaderRasterProviderRetry(key) {
      this.cancelReaderRasterProviderRetryTimer(key);
      this.readerRasterProviderFailures.delete(key);
    }
    cancelReaderRasterProviderRetryTimer(key) {
      const timer = this.readerRasterProviderRetryTimers.get(key);
      if (timer) window.clearTimeout(timer);
      this.readerRasterProviderRetryTimers.delete(key);
    }
    rememberReaderRasterFailure(key) {
      if (key.startsWith("data:")) return;
      this.readerRasterFailedScans.add(key);
      while (this.readerRasterFailedScans.size > MAX_CACHE_ITEMS) {
        const oldest = this.readerRasterFailedScans.values().next().value;
        if (!oldest) break;
        this.readerRasterFailedScans.delete(oldest);
      }
    }
    remember(key, result) {
      if (key.startsWith("data:")) return;
      this.cache.set(key, result);
      while (this.cache.size > MAX_CACHE_ITEMS) {
        const oldest = this.cache.keys().next().value;
        if (!oldest) break;
        this.cache.delete(oldest);
      }
      persistOcrCacheSoon(this.cache, Date.now());
    }
    forget(key) {
      if (!this.cache.delete(key)) return;
      persistOcrCacheSoon(this.cache, Date.now());
    }
    schedulePosition() {
      if (this.destroyed) return;
      if (this.positionFrame) return;
      this.positionFrame = requestAnimationFrame(() => {
        this.positionFrame = 0;
        if (this.destroyed) return;
        this.positionVideoFrames();
        this.positionCanvasFrames();
        this.positionBackgroundFrames();
        for (const image of this.states.keys()) this.positionState(image);
        this.positionImageStatusCards();
      });
    }
    positionImageStatusCards() {
      for (const [image, card] of [...this.imageStatuses]) {
        if (!image.isConnected) this.removeImageStatusCard(image);
        else this.positionImageStatusCard(image, card);
      }
    }
    // --- Paused-video frames (UT-27) ---
    snapshotPausedVideo(target, manual = false) {
      if (this.destroyed) return;
      if (!(target instanceof HTMLVideoElement) || this.videoFrames.has(target)) return;
      const settings = this.options.getSettings();
      if (!ocrRuntimeActive(settings) || settings.ocrProvider === "off") return;
      if (!manual) {
        if (!settings.ocrVideoPauseFrames) return;
        if (isFreshMiningPause(target)) return;
        if (isLikelyPausedVideoThumbnail(target)) return;
      }
      const rect = target.getBoundingClientRect();
      if (!manual && rect.width * rect.height < settings.ocrMinImageArea) return;
      if (!isNearViewport(target, 0) || isHiddenByCss(target)) return;
      const dataUrl = (this.options.captureVideoFrame ?? captureVideoFrameDataUrl)(target);
      if (!dataUrl) return;
      const frame = document.createElement("img");
      frame.className = "jpdb-ocr-video-frame";
      frame.classList.add("jpdb-ocr-video-frame-pending");
      frame.dataset.yomuVideoFrame = "true";
      frame.dataset.ocrPending = "true";
      frame.alt = "";
      frame.addEventListener("load", () => {
        if (this.videoFrames.get(target) === frame) this.enqueue(frame, true);
      }, { once: true });
      frame.src = dataUrl;
      appendOcrArtifactToRoot(frame, videoFrameArtifactRoot(target));
      this.videoFrames.set(target, frame);
      this.videoFrameVideos.set(frame, target);
      const status = this.createVideoFrameStatus("loading");
      status.classList.add("jpdb-ocr-video-frame-pending");
      this.videoFrameStatuses.set(target, status);
      positionVideoFrameStatus(status, rect, target);
      const resume = this.createVideoFrameResumeControl(target);
      this.videoFrameControls.set(target, resume);
      this.syncVideoFrameArtifactMount(target, frame);
      positionVideoFrameImage(frame, rect, target);
      positionVideoFrameStatus(status, rect, target);
      positionVideoFrameResumeControl(resume, rect, target);
      this.schedulePosition();
    }
    // Reveal the rest of the overlay once OCR has produced text: the frame image
    // and status dot un-gate (the resume/play control is already visible from the
    // moment the video paused), so the readable text appears with its status.
    revealVideoFrameOverlay(image) {
      if (!this.videoFrameVideos.has(image)) return;
      image.classList.remove("jpdb-ocr-video-frame-pending");
      delete image.dataset.ocrPending;
      this.revealVideoFrameStatusAndResume(image);
    }
    // Reveal the status dot (the resume/play control is already visible from the
    // moment of pause), leaving the captured frame image gated. Used on
    // empty/failed terminal states: the viewer gets feedback without the
    // (text-less) frame covering the player. During loading the status stays
    // gated so the native player is reachable.
    revealVideoFrameStatusAndResume(image) {
      const video = this.videoFrameVideos.get(image);
      if (!video) return;
      this.videoFrameStatuses.get(video)?.classList.remove("jpdb-ocr-video-frame-pending");
      this.videoFrameControls.get(video)?.classList.remove("jpdb-ocr-video-frame-pending");
    }
    createVideoFrameResumeControl(video) {
      const language = this.options.getSettings().interfaceLanguage;
      const label = uiText(language, "ocrPlayVideo");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "jpdb-ocr-video-frame-resume";
      setInnerHtml(button, playVideoIcon());
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.releaseVideoFrame(video);
        try {
          void video.play()?.catch(() => void 0);
        } catch {
        }
      });
      return button;
    }
    createVideoFrameStatus(status) {
      const element = document.createElement("div");
      element.className = "jpdb-ocr-video-frame-status";
      element.dataset.jpdbReaderRoot = "true";
      element.dataset.jpdbReaderSurfaceIgnore = "true";
      element.setAttribute("role", "status");
      element.setAttribute("aria-live", "polite");
      const label = document.createElement("span");
      label.className = "jpdb-ocr-video-frame-status-label";
      element.append(label);
      this.setVideoFrameStatus(element, status);
      appendOcrArtifactToRoot(element, document.body);
      return element;
    }
    setVideoFrameStatus(element, status) {
      const language = this.options.getSettings().interfaceLanguage;
      const label = uiText(language, videoFrameStatusTextKey(status));
      element.dataset.status = status;
      element.classList.remove(
        "jpdb-ocr-video-frame-status-loading",
        "jpdb-ocr-video-frame-status-ready",
        "jpdb-ocr-video-frame-status-empty",
        "jpdb-ocr-video-frame-status-failed",
        "jpdb-ocr-video-frame-status-fade-out"
      );
      element.classList.add("jpdb-ocr-video-frame-status", `jpdb-ocr-video-frame-status-${status}`);
      element.setAttribute("aria-label", label);
    }
    updateVideoFrameStatusForImage(image, status) {
      const video = this.videoFrameVideos.get(image);
      if (!video) return;
      const element = this.videoFrameStatuses.get(video);
      if (element) this.setVideoFrameStatus(element, status);
    }
    // Drive both status surfaces: paused-video frames keep their card over the
    // player; every other OCR'd image gets its own card over the image.
    updateOcrStatus(image, status) {
      if (this.videoFrameVideos.has(image)) {
        this.applyVideoFrameStatusTransition(image, status);
        return;
      }
      const canvas = this.canvasFrameSources.get(image);
      if (canvas) this.removeCanvasPendingStatus(canvas);
      this.updateImageStatusCard(image, status);
    }
    // Paused-frame overlays keep the image + status gated while OCR runs (the
    // resume/play control is visible from the moment of pause), so the native
    // player and its comment/like/scrubber controls stay reachable. On 'ready'
    // the image + status un-gate; on empty/failed only the status un-gates (the
    // text-less frame image stays hidden) so the viewer still gets feedback
    // without the frame covering the player. A lookup/mining pause never reaches
    // here — it is skipped at snapshot time via the mining marker.
    applyVideoFrameStatusTransition(image, status) {
      if (status === "ready") this.revealVideoFrameOverlay(image);
      else if (status === "empty" || status === "failed") this.revealVideoFrameStatusAndResume(image);
      this.updateVideoFrameStatusForImage(image, status);
    }
    updateImageStatusCard(image, status) {
      if (this.videoFrameVideos.has(image)) return;
      if (!ocrRuntimeActive(this.options.getSettings())) return;
      const existing = this.imageStatuses.get(image);
      const isCanvasFrame = this.canvasFrameSources.has(image);
      const isReaderRasterFrame = isCanvasFrame || this.backgroundFrameSources.has(image);
      this.clearImageStatusTimer(image);
      if (isReaderRasterFrame && isTerminalOcrStatus(status) && this.hasReadyReaderRasterSibling(image)) {
        this.releaseReaderRasterFrameForImage(image);
        return;
      }
      if (status === "empty" && !isReaderRasterFrame) {
        if (existing) removeOcrArtifact(existing);
        this.imageStatuses.delete(image);
        return;
      }
      const card = existing ?? this.createVideoFrameStatus(status);
      if (existing) this.setVideoFrameStatus(card, status);
      else this.imageStatuses.set(image, card);
      card.classList.toggle("jpdb-ocr-canvas-status", isReaderRasterFrame);
      this.configureReaderRasterStatusRetry(card, isReaderRasterFrame);
      const labelNode = card.querySelector(".jpdb-ocr-video-frame-status-label");
      if (labelNode) labelNode.textContent = isReaderRasterFrame ? this.readerRasterStatusLabel(status) : "";
      if (isReaderRasterFrame) this.updateReaderRasterRetryLabel(card, status);
      this.positionImageStatusCard(image, card);
      if (status === "ready" && isReaderRasterFrame) this.releaseTerminalReaderRasterSiblings(image);
      if (status === "ready" && !isReaderRasterFrame) this.scheduleImageStatusFade(image, card);
    }
    hasReadyReaderRasterSibling(image) {
      const groupKey = this.readerRasterFrameGroupKey(image);
      if (!groupKey) return false;
      for (const [candidate, card] of this.imageStatuses) {
        if (candidate === image || card.dataset.status !== "ready") continue;
        if (this.readerRasterFrameGroupKey(candidate) === groupKey) return true;
      }
      return false;
    }
    releaseTerminalReaderRasterSiblings(image) {
      const groupKey = this.readerRasterFrameGroupKey(image);
      if (!groupKey) return;
      for (const [candidate, card] of [...this.imageStatuses]) {
        if (candidate === image || !isTerminalOcrStatus(card.dataset.status)) continue;
        if (this.readerRasterFrameGroupKey(candidate) === groupKey) this.releaseReaderRasterFrameForImage(candidate);
      }
    }
    readerRasterFrameGroupKey(image) {
      if (!isBookwalkerViewerHost()) return "";
      const canvas = this.canvasFrameSources.get(image);
      if (canvas) return bookwalkerSurfaceGroupKey(canvas);
      const surface = this.backgroundFrameSources.get(image);
      return surface?.id ?? "";
    }
    releaseReaderRasterFrameForImage(image) {
      const canvas = this.canvasFrameSources.get(image);
      if (canvas) {
        this.releaseCanvasFrame(canvas);
        return;
      }
      const background = this.backgroundFrameSources.get(image);
      if (background) {
        this.releaseBackgroundFrame(background);
        return;
      }
      this.removeImageStatusCard(image);
    }
    scheduleImageStatusFade(image, card) {
      const dwell = window.setTimeout(() => {
        card.classList.add("jpdb-ocr-video-frame-status-fade-out");
        const remove = window.setTimeout(() => this.removeImageStatusCard(image), OCR_STATUS_FADE_MS);
        this.imageStatusTimers.set(image, remove);
      }, OCR_STATUS_READY_DWELL_MS);
      this.imageStatusTimers.set(image, dwell);
    }
    clearImageStatusTimer(image) {
      const timer = this.imageStatusTimers.get(image);
      if (timer !== void 0) window.clearTimeout(timer);
      this.imageStatusTimers.delete(image);
    }
    positionImageStatusCard(image, card) {
      const rect = this.readerRasterSourceRect(image) ?? image.getBoundingClientRect();
      if (!isImageVisibleForOcr(image, rect)) {
        card.hidden = true;
        return;
      }
      card.hidden = false;
      positionOcrImageStatus(card, rect);
    }
    removeImageStatusCard(image) {
      this.clearImageStatusTimer(image);
      const card = this.imageStatuses.get(image);
      if (!card) return;
      removeOcrArtifact(card);
      this.imageStatuses.delete(image);
    }
    configureReaderRasterStatusRetry(card, enabled) {
      if (!enabled) {
        if (card.dataset.yomuOcrRetry === "true") {
          delete card.dataset.yomuOcrRetry;
          card.removeAttribute("role");
          card.removeAttribute("tabindex");
          card.removeAttribute("title");
        }
        return;
      }
      card.dataset.yomuOcrRetry = "true";
      card.setAttribute("role", "button");
      card.tabIndex = 0;
      if (card.dataset.yomuOcrRetryListener === "true") return;
      card.dataset.yomuOcrRetryListener = "true";
      card.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.retryReaderRasterStatusCard(card);
      });
      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        this.retryReaderRasterStatusCard(card);
      });
    }
    // Empty/failed pills read as a dead end without a visible cue that a click
    // re-runs OCR (title/aria alone were invisible on touch readers like
    // BookWalker), so terminal non-ready statuses carry the retry hint inline.
    readerRasterStatusLabel(status) {
      const language = this.options.getSettings().interfaceLanguage;
      const statusLabel = uiText(language, videoFrameStatusTextKey(status));
      if (status !== "empty" && status !== "failed") return statusLabel;
      return `${statusLabel} · ${uiText(language, "ocrRetryScan")}`;
    }
    updateReaderRasterRetryLabel(card, status) {
      const language = this.options.getSettings().interfaceLanguage;
      const statusLabel = uiText(language, videoFrameStatusTextKey(status));
      const retryLabel = uiText(language, "ocrRetryScan");
      card.setAttribute("aria-label", `${statusLabel}. ${retryLabel}`);
      card.setAttribute("title", retryLabel);
    }
    retryReaderRasterStatusCard(card) {
      const image = [...this.imageStatuses].find(([, candidate]) => candidate === card)?.[0];
      if (!image) return;
      this.retryReaderRasterImage(image);
    }
    refreshVideoFrameAfterSeek(target) {
      if (!(target instanceof HTMLVideoElement) || !target.paused) return;
      if (!this.videoFrames.has(target)) return;
      this.releaseVideoFrame(target);
      this.snapshotPausedVideo(target);
    }
    releaseVideoFrame(target) {
      if (!(target instanceof HTMLVideoElement)) return;
      const frame = this.videoFrames.get(target);
      if (!frame) return;
      this.videoFrames.delete(target);
      const control = this.videoFrameControls.get(target);
      if (control) removeVideoFrameResumeControl(control);
      this.videoFrameControls.delete(target);
      const status = this.videoFrameStatuses.get(target);
      if (status) removeOcrArtifact(status);
      this.videoFrameStatuses.delete(target);
      const state2 = this.states.get(frame);
      if (state2) this.releaseImageState(frame, state2);
      else this.forgetImageWork(frame);
      this.videoFrameVideos.delete(frame);
      removeOcrArtifact(frame);
    }
    releaseAllVideoFrames() {
      for (const video of [...this.videoFrames.keys()]) this.releaseVideoFrame(video);
    }
    // --- Reader raster frames (canvas readers + CSS background-image readers) ---
    startReaderRasterPollingIfNeeded() {
      if (this.readerRasterPoll) return;
      if (this.isProvenRasterFreePage() || !isReaderRasterPage()) return;
      this.readerRasterPoll = window.setInterval(() => {
        const settings = this.options.getSettings();
        this.refreshCanvasReaderSurfaces(settings);
        this.refreshBackgroundImageReaderSurfaces(settings);
      }, 1200);
    }
    refreshCanvasReaderSurfaces(settings, userRequested = false) {
      if (!ocrRuntimeActive(settings) || settings.ocrProvider === "off") return;
      if (this.isProvenRasterFreePage()) {
        this.releaseAllCanvasFrames();
        return;
      }
      const nativeTextLayerBlocksAutoScan = this.options.shouldAutoScan?.() === false && settings.ocrAutoScanImages && !userRequested;
      const ocrOptInCanvases = nativeTextLayerBlocksAutoScan ? activeReaderRasterSurfaces(collectCanvasReaderSurfaces(), settings, userRequested) : void 0;
      if (this.handleNativeTextLayerCanvasGate(nativeTextLayerBlocksAutoScan, ocrOptInCanvases)) return;
      if (!isReaderRasterPage() && !this.hasTrackedManualCanvasSurface()) {
        this.releaseAllCanvasFrames();
        return;
      }
      this.startReaderRasterPollingIfNeeded();
      const canvases = ocrOptInCanvases ?? activeReaderRasterSurfaces(collectCanvasReaderSurfaces(), settings, userRequested);
      const signature = this.registerCanvasReaderPageSignature(canvases);
      if (signature === null) return;
      if (!settings.ocrAutoScanImages && !userRequested) {
        this.refreshManualCanvasReaderFrames(canvases, settings);
        return;
      }
      this.reconcileCanvasReaderFrames(canvases, signature, settings, userRequested);
    }
    handleNativeTextLayerCanvasGate(nativeTextLayerBlocksAutoScan, ocrOptInCanvases) {
      if (!nativeTextLayerBlocksAutoScan || ocrOptInCanvases?.length) return false;
      if (!isReaderRasterPage()) {
        this.releaseAllCanvasFrames();
        return true;
      }
      const signature = canvasReaderPageSignature();
      const turned = signature !== this.canvasReaderSignature;
      this.canvasReaderSignature = signature;
      for (const canvas of [...this.canvasFrames.keys()]) {
        if (turned || !this.canvasFrameUserRequested.has(canvas)) this.releaseCanvasFrame(canvas);
      }
      return true;
    }
    registerCanvasReaderPageSignature(canvases) {
      const signature = canvasReaderPageSignature();
      if (signature === this.canvasReaderSignature) {
        this.canvasReaderSamePageSignatureSkips = 0;
        return signature;
      }
      if (canvases.some(canvasReaderHasStableSurface)) {
        this.canvasReaderSamePageSignatureSkips = 0;
        this.canvasReaderSignature = signature;
        return signature;
      }
      if (this.shouldHoldCanvasFramesForSamePageSignature(signature)) {
        if (canvases.some((canvas) => this.canvasFrameNeedsResnapshot(canvas))) {
          this.canvasReaderSamePageSignatureSkips = 0;
          this.canvasReaderSignature = signature;
          return signature;
        }
        this.scheduleReaderRasterRefresh(80);
        return null;
      }
      this.canvasReaderSamePageSignatureSkips = 0;
      this.releaseAllCanvasFrames();
      this.canvasReaderSignature = signature;
      return signature;
    }
    refreshManualCanvasReaderFrames(canvases, settings) {
      for (const canvas of [...this.canvasFrames.keys()]) {
        if (this.reconcileUserRequestedManualCanvasFrame(canvas)) continue;
        if (!canvases.includes(canvas)) this.releaseCanvasFrame(canvas);
        else if (this.canvasFrameNeedsResnapshot(canvas)) this.releaseCanvasFrameForResnapshot(canvas);
      }
      this.retryPendingUserRequestedCaptures(settings);
    }
    reconcileCanvasReaderFrames(canvases, signature, settings, userRequested) {
      for (const canvas of [...this.canvasPendingStatuses.keys()]) {
        if (canvases.includes(canvas)) continue;
        if (isBookwalkerViewerHost()) this.cancelCanvasSnapshot(canvas);
        this.removeCanvasPendingStatus(canvas);
      }
      for (const canvas of canvases) {
        if (this.canvasFrames.has(canvas)) continue;
        this.rebindExistingCanvasFrame(canvas, canvasSurfaceSnapshotKey(canvas), userRequested);
      }
      for (const canvas of [...this.canvasFrames.keys()]) {
        if (canvases.includes(canvas)) continue;
        if (this.reconcileUserRequestedManualCanvasFrame(canvas)) continue;
        if (this.shouldKeepCanvasFrameThroughStablePageSurfaceFlicker(canvas, signature)) continue;
        if (this.canvasFrames.get(canvas)?.complete === false) continue;
        this.releaseCanvasFrame(canvas);
      }
      for (const canvas of canvases) {
        if (!this.canvasFrameNeedsResnapshot(canvas)) continue;
        this.releaseCanvasFrameForResnapshot(canvas);
      }
      for (const canvas of canvases) {
        if (this.canvasFrames.has(canvas)) continue;
        this.snapshotCanvasSurface(canvas, settings, userRequested);
      }
      if (this.canvasFrames.size || this.canvasPendingStatuses.size) this.schedulePosition();
    }
    reconcileUserRequestedManualCanvasFrame(canvas) {
      if (!this.canvasFrameUserRequested.has(canvas) || !isManualCanvasReaderSurface(canvas)) return false;
      if (this.canvasFrameNeedsResnapshot(canvas)) this.releaseCanvasFrameForResnapshot(canvas);
      return true;
    }
    async snapshotCanvasSurface(canvas, settings, userRequested = false) {
      const key = canvasSurfaceSnapshotKey(canvas);
      const startContentToken = canvasStablePageContentToken(canvas);
      if (this.canvasFrames.has(canvas)) {
        if (!userRequested || this.canvasFrameKeys.get(canvas) === key) return;
        this.releaseCanvasFrame(canvas);
      }
      if (!userRequested && (this.canvasCaptureAttempts.get(canvas) ?? 0) > READER_RASTER_MAX_CAPTURE_ATTEMPTS) {
        const liveToken = canvasStablePageContentToken(canvas);
        const failedToken = this.canvasFailureContentTokens.get(canvas);
        if (liveToken && failedToken && liveToken !== failedToken) {
          this.clearCanvasCaptureRetry(canvas);
        } else {
          this.updateCanvasPendingStatus(canvas, canvas.getBoundingClientRect(), "failed");
          return;
        }
      }
      const existingPending = this.pendingCanvasSnapshots.get(canvas);
      const pendingContentChanged = Boolean(existingPending && isRealContentChange(existingPending.contentToken ?? "", startContentToken));
      if (existingPending?.key === key && !pendingContentChanged) {
        if (Date.now() - existingPending.startedAt < READER_RASTER_PENDING_CAPTURE_TIMEOUT_MS) return;
        this.cancelCanvasSnapshot(canvas, existingPending);
        this.handleCanvasCaptureNotReady(canvas, canvas.getBoundingClientRect(), userRequested);
        return;
      }
      if (existingPending) this.cancelCanvasSnapshot(canvas, existingPending);
      const pendingSnapshot = {
        key,
        contentToken: startContentToken || void 0,
        startedAt: Date.now(),
        cancelled: false
      };
      this.pendingCanvasSnapshots.set(canvas, pendingSnapshot);
      const rect = canvas.getBoundingClientRect();
      try {
        if (rect.width * rect.height < settings.ocrMinImageArea) return;
        if (!isNearViewport(canvas, readerRasterCaptureMargin(settings, userRequested)) || isHiddenByCss(canvas)) return;
        this.updateCanvasPendingStatus(canvas, rect, "loading");
        this.armCanvasSnapshotTimeout(canvas, pendingSnapshot, rect, userRequested);
        const captured = await this.captureCanvasSnapshotSource(canvas, settings, rect, userRequested, startContentToken);
        if (captured === null) return;
        if (this.shouldDiscardCanvasSnapshot(canvas, pendingSnapshot, userRequested)) return;
        if (!captured) {
          this.handleCanvasCaptureNotReady(canvas, rect, userRequested);
          return;
        }
        const contentKey = captured.contentKey ?? (captured.frameSrc.startsWith("data:") ? `raster:${stableHashBase36(captured.frameSrc)}` : void 0);
        this.commitCanvasSnapshot(canvas, pendingSnapshot, key, rect, { ...captured, contentKey }, userRequested);
      } catch (error) {
        if (!this.wasCanvasSnapshotSuperseded(canvas, pendingSnapshot)) {
          const surface = canvasReaderSurfaceId(canvas) || canvas.dataset.yomuMid || "unidentified";
          log.warnOnce(`canvas-capture:${surface}`, "Reader raster capture failed; retrying", { surface }, error);
          this.handleCanvasCaptureNotReady(canvas, rect, userRequested);
        }
      } finally {
        this.settleCanvasSnapshot(canvas, pendingSnapshot);
      }
    }
    async captureCanvasSnapshotSource(canvas, settings, rect, userRequested, startContentToken) {
      const visibleRect = userRequested ? bookwalkerVisibleCanvasRegion(canvas, rect) : void 0;
      const frameRect = visibleRect ?? rect;
      const regionKey = visibleRect ? canvasRegionContentKey(rect, visibleRect) : "";
      if (isCanvasReadable(canvas)) {
        return this.captureReadableCanvasSnapshot(canvas, settings, rect, frameRect, visibleRect, regionKey, userRequested, startContentToken);
      }
      if (isBookwalkerViewerHost()) {
        return this.captureBookwalkerCanvasSnapshot(canvas, settings, rect, frameRect, visibleRect, regionKey, startContentToken);
      }
      if (!canUseReaderCanvasSourceImageFallback()) return void 0;
      const frameSrc = readerCanvasSourceImageUrl();
      return frameSrc ? { frameSrc, frameRect, contentKey: `src:${frameSrc}`, contentToken: startContentToken } : void 0;
    }
    captureReadableCanvasSnapshot(canvas, settings, rect, frameRect, visibleRect, regionKey, userRequested, contentToken) {
      const contentSignature = canvasRenderedContentSignature(canvas);
      if (!contentSignature) {
        this.handleCanvasCaptureNotReady(canvas, rect, userRequested);
        return null;
      }
      if (!this.canvasContentIsReadyToSnapshot(canvas, contentSignature, userRequested)) return null;
      const frameSrc = visibleRect ? captureCanvasRegionDataUrl(canvas, rect, visibleRect, settings.ocrMaxImagePixels) : captureCanvasDataUrl(canvas, settings.ocrMaxImagePixels);
      return frameSrc ? {
        frameSrc,
        frameRect,
        contentKey: bookwalkerCanvasContentKey(contentToken, regionKey) ?? `cv:${contentSignature}:${canvas.width}x${canvas.height}${regionKey}`,
        contentToken
      } : void 0;
    }
    async captureBookwalkerCanvasSnapshot(canvas, settings, rect, frameRect, visibleRect, regionKey, startContentToken) {
      const captureMirror = this.options.captureCanvasMirror ?? captureCanvasMirror;
      const mirror = await captureMirror(canvas, loadCleanMirrorImage);
      if (!mirror) {
        const captureReaderSurface = this.options.captureReaderSurface ?? captureReaderSurfaceViaExtensionScreenshot;
        const screenshot = await captureReaderSurface(canvas, settings.ocrMaxImagePixels);
        return screenshot?.dataUrl ? {
          frameSrc: screenshot.dataUrl,
          frameRect: screenshot.rect ?? rect,
          contentKey: bookwalkerCanvasContentKey(startContentToken, regionKey),
          contentToken: startContentToken
        } : void 0;
      }
      const frameSrc = visibleRect ? captureCanvasRegionDataUrl(mirror, rect, visibleRect, settings.ocrMaxImagePixels) : captureCanvasDataUrl(mirror, settings.ocrMaxImagePixels);
      if (!frameSrc) return void 0;
      const mirrorSignature = canvasRenderedContentSignature(mirror);
      const contentToken = mirror.dataset.yomuMirrorContentToken || startContentToken;
      return {
        frameSrc,
        frameRect,
        contentKey: bookwalkerCanvasContentKey(contentToken, regionKey) ?? (mirrorSignature ? `cv:${mirrorSignature}:${mirror.width}x${mirror.height}${regionKey}` : void 0),
        contentToken
      };
    }
    commitCanvasSnapshot(canvas, pendingSnapshot, key, canvasRect, captured, userRequested) {
      if (this.destroyed || !canvas.isConnected || this.canvasFrames.has(canvas)) return;
      if (!ocrRuntimeActive(this.options.getSettings())) return;
      if (this.shouldDiscardCanvasSnapshot(canvas, pendingSnapshot, userRequested)) return;
      const finishContentToken = canvasStablePageContentToken(canvas);
      if (captured.contentToken && finishContentToken && finishContentToken !== captured.contentToken) {
        this.handleCanvasCommitMismatch(canvas, canvasRect, userRequested, "content identity");
        return;
      }
      if (canvasSurfaceSnapshotKey(canvas) !== key) {
        this.handleCanvasCommitMismatch(canvas, canvasRect, userRequested, "surface identity");
        return;
      }
      const frame = document.createElement("img");
      frame.className = "jpdb-ocr-canvas-frame";
      frame.dataset.yomuCanvasFrame = "true";
      if (captured.contentKey) frame.dataset.ocrContentKey = canvasFrameContentKey(captured.contentKey, canvas);
      frame.alt = "";
      positionCanvasFrameImage(frame, captured.frameRect);
      const finishFrameLoad = (loaded) => {
        if (this.canvasFrames.get(canvas) !== frame) return;
        const timer = this.canvasFrameLoadTimers.get(frame);
        if (timer) window.clearTimeout(timer);
        this.canvasFrameLoadTimers.delete(frame);
        if (loaded) {
          this.removeCanvasPendingStatus(canvas);
          this.clearCanvasCaptureRetry(canvas);
          this.canvasCommitMismatches.delete(canvas);
          this.enqueue(frame, userRequested);
          return;
        }
        this.discardUnloadedCanvasFrame(canvas, frame);
        this.handleCanvasCaptureNotReady(canvas, canvasRect, userRequested);
      };
      frame.addEventListener("load", () => finishFrameLoad(true), { once: true });
      frame.addEventListener("error", () => finishFrameLoad(false), { once: true });
      document.body.append(frame);
      this.canvasFrames.set(canvas, frame);
      this.canvasFrameSources.set(frame, canvas);
      this.canvasFrameKeys.set(canvas, key);
      const committedContentToken = captured.contentToken || finishContentToken;
      if (committedContentToken) this.canvasFrameContentTokens.set(canvas, committedContentToken);
      else this.canvasFrameContentTokens.delete(canvas);
      frame.dataset.ocrAttemptKey = canvasFrameOcrAttemptKey(canvas, key, committedContentToken);
      this.rememberCanvasSnapshotRegion(frame, canvasRect, captured.frameRect);
      if (userRequested) this.canvasFrameUserRequested.add(canvas);
      else this.canvasFrameUserRequested.delete(canvas);
      this.canvasFrameLoadTimers.set(frame, window.setTimeout(
        () => finishFrameLoad(false),
        READER_RASTER_FRAME_LOAD_TIMEOUT_MS
      ));
      frame.src = captured.frameSrc;
      this.canvasReaderSignature = canvasReaderPageSignature();
      this.canvasReaderSamePageSignatureSkips = 0;
      this.schedulePosition();
    }
    handleCanvasCommitMismatch(canvas, rect, userRequested, reason) {
      const mismatches = (this.canvasCommitMismatches.get(canvas) ?? 0) + 1;
      this.canvasCommitMismatches.set(canvas, mismatches);
      if (mismatches < READER_RASTER_MAX_COMMIT_MISMATCHES) {
        if (userRequested) this.scheduleCanvasCaptureRetry(canvas, true);
        else this.scheduleReaderRasterRefresh(READER_RASTER_RETRY_BASE_MS * mismatches);
        return;
      }
      this.canvasCommitMismatches.delete(canvas);
      this.canvasCaptureAttempts.set(canvas, READER_RASTER_MAX_CAPTURE_ATTEMPTS + 1);
      this.canvasTapRecapture.delete(canvas);
      this.canvasFailureContentTokens.set(canvas, canvasStablePageContentToken(canvas));
      const surface = canvasReaderSurfaceId(canvas) || canvas.dataset.yomuMid || "unidentified";
      log.warnOnce(
        `canvas-commit-mismatch:${surface}:${reason}`,
        `Reader raster capture repeatedly changed ${reason}; automatic retries paused`,
        { surface, userRequested }
      );
      this.updateCanvasPendingStatus(canvas, rect, "failed");
    }
    rememberCanvasSnapshotRegion(frame, canvasRect, frameRect) {
      if (frameRect === canvasRect) return;
      this.canvasFrameStaticRects.set(frame, frameRect);
      this.canvasFrameRegionFractions.set(frame, new DOMRect(
        (frameRect.left - canvasRect.left) / canvasRect.width,
        (frameRect.top - canvasRect.top) / canvasRect.height,
        frameRect.width / canvasRect.width,
        frameRect.height / canvasRect.height
      ));
    }
    wasCanvasSnapshotSuperseded(canvas, pendingSnapshot) {
      const current = this.pendingCanvasSnapshots.get(canvas);
      return pendingSnapshot.cancelled || Boolean(current && current !== pendingSnapshot);
    }
    armCanvasSnapshotTimeout(canvas, pending, rect, userRequested) {
      pending.timeoutId = window.setTimeout(() => {
        if (this.pendingCanvasSnapshots.get(canvas) !== pending || pending.cancelled) return;
        this.cancelCanvasSnapshot(canvas, pending);
        this.handleCanvasCaptureNotReady(canvas, rect, userRequested);
      }, READER_RASTER_PENDING_CAPTURE_TIMEOUT_MS);
    }
    settleCanvasSnapshot(canvas, pending) {
      if (pending.timeoutId) window.clearTimeout(pending.timeoutId);
      pending.timeoutId = void 0;
      if (this.pendingCanvasSnapshots.get(canvas) === pending) this.pendingCanvasSnapshots.delete(canvas);
    }
    cancelCanvasSnapshot(canvas, pending = this.pendingCanvasSnapshots.get(canvas)) {
      if (!pending) return;
      pending.cancelled = true;
      if (pending.timeoutId) window.clearTimeout(pending.timeoutId);
      pending.timeoutId = void 0;
      if (this.pendingCanvasSnapshots.get(canvas) === pending) this.pendingCanvasSnapshots.delete(canvas);
    }
    discardUnloadedCanvasFrame(canvas, frame) {
      if (this.canvasFrames.get(canvas) !== frame) return;
      const timer = this.canvasFrameLoadTimers.get(frame);
      if (timer) window.clearTimeout(timer);
      this.canvasFrameLoadTimers.delete(frame);
      this.canvasFrames.delete(canvas);
      this.canvasFrameSources.delete(frame);
      this.canvasFrameStaticRects.delete(frame);
      this.canvasFrameRegionFractions.delete(frame);
      this.canvasFrameKeys.delete(canvas);
      this.canvasFrameContentTokens.delete(canvas);
      this.canvasFrameUserRequested.delete(canvas);
      this.removeImageStatusCard(frame);
      frame.remove();
    }
    shouldDiscardCanvasSnapshot(canvas, pendingSnapshot, userRequested) {
      if (!this.wasCanvasSnapshotSuperseded(canvas, pendingSnapshot)) return false;
      if (userRequested && canvas.isConnected && !this.canvasFrames.has(canvas)) {
        this.scheduleCanvasCaptureRetry(canvas, true);
      }
      return true;
    }
    shouldHoldCanvasFramesForSamePageSignature(signature) {
      if (!this.canvasReaderSignature) return false;
      if (!this.canvasFrames.size) return false;
      if (hasDifferentRecordedCanvasReaderContent(this.canvasReaderSignature, signature)) return false;
      if (shouldTrustStableBookwalkerPageCounter() && hasSameStableCanvasReaderPageCounter(this.canvasReaderSignature, signature)) return true;
      if (!isSameCanvasReaderPageLocation(this.canvasReaderSignature, signature)) return false;
      if (hasSameRealCanvasReaderContent(this.canvasReaderSignature, signature)) return true;
      if (hasSameStableCanvasReaderPageCounter(this.canvasReaderSignature, signature)) return true;
      if (isCanvasMirrorEpochTransition(this.canvasReaderSignature, signature)) return false;
      this.canvasReaderSamePageSignatureSkips += 1;
      if (this.canvasReaderSamePageSignatureSkips <= READER_RASTER_SAME_PAGE_SIGNATURE_HOLD_LIMIT) return true;
      this.canvasReaderSamePageSignatureSkips = 0;
      return false;
    }
    shouldKeepCanvasFrameThroughStablePageSurfaceFlicker(canvas, signature) {
      if (!canvas.isConnected) return false;
      if (!this.canvasReaderSignature) return false;
      if (shouldTrustStableBookwalkerPageCounter() && hasSameStableCanvasReaderPageCounter(this.canvasReaderSignature, signature)) return true;
      return isSameCanvasReaderPageLocation(this.canvasReaderSignature, signature) && hasSameStableCanvasReaderPageCounter(this.canvasReaderSignature, signature);
    }
    rebindExistingCanvasFrame(canvas, key, userRequested) {
      const existing = this.findCanvasFrameBySnapshotKey(key, canvas);
      if (!existing) return false;
      const { canvas: previousCanvas, frame } = existing;
      if (this.canvasFrameStaticRects.has(frame)) return false;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      this.removeCanvasPendingStatus(previousCanvas);
      this.removeCanvasPendingStatus(canvas);
      this.cancelCanvasSnapshot(previousCanvas);
      this.cancelCanvasSnapshot(canvas);
      this.canvasFrames.delete(previousCanvas);
      this.canvasFrames.set(canvas, frame);
      this.canvasFrameSources.set(frame, canvas);
      this.canvasFrameKeys.delete(previousCanvas);
      this.canvasFrameKeys.set(canvas, key);
      const contentToken = this.canvasFrameContentTokens.get(previousCanvas) || canvasStablePageContentToken(canvas);
      this.canvasFrameContentTokens.delete(previousCanvas);
      if (contentToken) this.canvasFrameContentTokens.set(canvas, contentToken);
      else this.canvasFrameContentTokens.delete(canvas);
      this.canvasContentReadiness.delete(canvasContentReadinessKey(previousCanvas));
      this.canvasContentReadiness.set(canvasContentReadinessKey(canvas), canvasPageContentToken(canvas));
      this.canvasCaptureAttempts.delete(previousCanvas);
      this.canvasTapRecapture.delete(previousCanvas);
      if (this.canvasFrameUserRequested.has(previousCanvas) || userRequested) this.canvasFrameUserRequested.add(canvas);
      else this.canvasFrameUserRequested.delete(canvas);
      this.canvasFrameUserRequested.delete(previousCanvas);
      positionCanvasFrameImage(frame, rect);
      this.schedulePosition();
      return true;
    }
    findCanvasFrameBySnapshotKey(key, excludeCanvas) {
      for (const [canvas, frame] of this.canvasFrames) {
        if (canvas === excludeCanvas) continue;
        if (this.canvasFrameKeys.get(canvas) !== key) continue;
        if (frame.complete === false) continue;
        if (this.canvasContentTokenChanged(excludeCanvas, this.canvasFrameContentTokens.get(canvas))) continue;
        return { canvas, frame };
      }
      return void 0;
    }
    canvasContentIsReadyToSnapshot(canvas, contentSignature, userRequested) {
      const readinessKey = canvasContentReadinessKey(canvas);
      if (userRequested) {
        this.canvasContentReadiness.set(readinessKey, contentSignature);
        return true;
      }
      const previous = this.canvasContentReadiness.get(readinessKey);
      this.canvasContentReadiness.set(readinessKey, contentSignature);
      if (previous === contentSignature) return true;
      this.scheduleReaderRasterRefresh(140);
      return false;
    }
    scheduleReaderRasterRefresh(delayMs) {
      if (this.readerRasterRetryTimer || this.destroyed) return;
      this.readerRasterRetryTimer = window.setTimeout(() => {
        this.readerRasterRetryTimer = 0;
        if (this.destroyed) return;
        const settings = this.options.getSettings();
        this.refreshCanvasReaderSurfaces(settings);
        this.refreshBackgroundImageReaderSurfaces(settings);
      }, delayMs);
    }
    // A canvas capture failed (engine hasn't painted / mirror has no ops yet).
    // Retry with exponential backoff so the page OCRs as soon as it's ready instead
    // of waiting for the next 1200ms poll. After the cap automatic retries pause on
    // a tappable status. A real turn (releaseAllCanvasFrames), success, or explicit
    // tap resets the counter and reopens capture.
    // A user-requested (tapped) capture opens a bounded recapture WINDOW so the retry
    // re-attempts AS a tap — in tap/manual mode the poll itself never captures, so
    // without this a failed tap is dropped and the page never OCRs until the user taps
    // again. The window survives page-signature changes (a late repaint, or the poll
    // first seeing the freshly-composited page, that releaseAllCanvasFrames treats as a
    // turn) and is bounded by its own attempt count, so it can never become permanent
    // auto-OCR — it expires after READER_RASTER_MAX_CAPTURE_ATTEMPTS tries.
    handleCanvasCaptureNotReady(canvas, rect, userRequested) {
      if (this.deferAutomaticCaptureForBookwalkerRecorder(canvas, rect, userRequested)) return;
      if (this.scheduleCanvasCaptureRetry(canvas, userRequested)) return;
      this.canvasFailureContentTokens.set(canvas, canvasStablePageContentToken(canvas));
      this.updateCanvasPendingStatus(canvas, rect, "failed");
    }
    deferAutomaticCaptureForBookwalkerRecorder(canvas, rect, userRequested) {
      if (userRequested || !isBookwalkerViewerHost()) return false;
      if (isCanvasReadable(canvas) && canvasRenderedContentSignature(canvas)) return false;
      if (canvasMirrorContentToken(canvas)) {
        if (this.canvasMirrorWaitStartedAt.delete(canvas)) this.canvasCaptureAttempts.delete(canvas);
        return false;
      }
      const startedAt = this.canvasMirrorWaitStartedAt.get(canvas) ?? Date.now();
      this.canvasMirrorWaitStartedAt.set(canvas, startedAt);
      if (Date.now() - startedAt >= BOOKWALKER_RECORDER_BOOT_GRACE_MS) return false;
      this.canvasCaptureAttempts.set(canvas, READER_RASTER_MAX_CAPTURE_ATTEMPTS);
      this.updateCanvasPendingStatus(canvas, rect, "loading");
      return true;
    }
    scheduleCanvasCaptureRetry(canvas, userRequested = false) {
      if (userRequested) {
        if (!this.canvasTapRecapture.has(canvas)) this.canvasTapRecapture.set(canvas, READER_RASTER_MAX_CAPTURE_ATTEMPTS);
        const remaining = this.canvasTapRecapture.get(canvas) ?? 0;
        if (remaining <= 0) {
          this.canvasTapRecapture.delete(canvas);
          return false;
        }
        const attempt = READER_RASTER_MAX_CAPTURE_ATTEMPTS - remaining;
        const delay2 = Math.min(READER_RASTER_RETRY_BASE_MS * 2 ** attempt, READER_RASTER_RETRY_MAX_MS);
        this.scheduleReaderRasterRefresh(delay2);
        return true;
      }
      const attempts = (this.canvasCaptureAttempts.get(canvas) ?? 0) + 1;
      this.canvasCaptureAttempts.set(canvas, attempts);
      if (attempts > READER_RASTER_MAX_CAPTURE_ATTEMPTS) return false;
      const delay = Math.min(READER_RASTER_RETRY_BASE_MS * 2 ** (attempts - 1), READER_RASTER_RETRY_MAX_MS);
      this.scheduleReaderRasterRefresh(delay);
      return true;
    }
    // Re-attempt captures a tap requested but that weren't ready yet. Called before the
    // tap-mode poll early-return so a tapped-but-not-ready page keeps trying without the
    // user tapping again (the "page has no OCR" / no-pill report). Each pass decrements
    // the canvas's remaining window so it bounds out even if snapshot can't schedule.
    retryPendingUserRequestedCaptures(settings) {
      if (!this.canvasTapRecapture.size) return;
      for (const [canvas, remaining] of [...this.canvasTapRecapture]) {
        if (!canvas.isConnected || this.canvasFrames.has(canvas) || remaining <= 0) {
          this.canvasTapRecapture.delete(canvas);
          continue;
        }
        this.canvasTapRecapture.set(canvas, remaining - 1);
        void this.snapshotCanvasSurface(canvas, settings, true);
      }
    }
    clearCanvasCaptureRetry(canvas) {
      this.canvasCaptureAttempts.delete(canvas);
      this.canvasMirrorWaitStartedAt.delete(canvas);
      this.canvasCommitMismatches.delete(canvas);
      this.canvasFailureContentTokens.delete(canvas);
      this.canvasTapRecapture.delete(canvas);
    }
    updateCanvasPendingStatus(canvas, rect, status) {
      const existing = this.canvasPendingStatuses.get(canvas);
      const card = existing ?? this.createVideoFrameStatus(status);
      if (existing) this.setVideoFrameStatus(card, status);
      else this.canvasPendingStatuses.set(canvas, card);
      card.classList.add("jpdb-ocr-canvas-status");
      this.configureCanvasPendingStatusRetry(card);
      this.updateReaderRasterRetryLabel(card, status);
      const labelNode = card.querySelector(".jpdb-ocr-video-frame-status-label");
      if (labelNode) labelNode.textContent = uiText(this.options.getSettings().interfaceLanguage, videoFrameStatusTextKey(status));
      card.hidden = false;
      this.canvasPendingStatusKeys.set(canvas, canvasSurfaceSnapshotKey(canvas));
      positionOcrImageStatus(card, this.visibleViewportIntersection(rect) ?? rect);
    }
    removeCanvasPendingStatus(canvas) {
      const card = this.canvasPendingStatuses.get(canvas);
      if (!card) return;
      removeOcrArtifact(card);
      this.canvasPendingStatuses.delete(canvas);
      this.canvasPendingStatusKeys.delete(canvas);
    }
    isTerminalCanvasPendingStatus(card) {
      const status = card.dataset.status;
      return status === "empty" || status === "failed";
    }
    configureCanvasPendingStatusRetry(card) {
      card.dataset.yomuOcrRetry = "true";
      card.setAttribute("role", "button");
      card.tabIndex = 0;
      if (card.dataset.yomuOcrRetryListener === "true") return;
      card.dataset.yomuOcrRetryListener = "true";
      card.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.retryCanvasPendingStatusCard(card);
      });
      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        this.retryCanvasPendingStatusCard(card);
      });
    }
    retryCanvasPendingStatusCard(card) {
      const canvas = [...this.canvasPendingStatuses].find(([, candidate]) => candidate === card)?.[0];
      if (!canvas) return;
      this.cancelCanvasSnapshot(canvas);
      this.removeCanvasPendingStatus(canvas);
      this.clearCanvasCaptureRetry(canvas);
      void this.snapshotCanvasSurface(canvas, this.options.getSettings(), true);
    }
    releaseCanvasFrame(canvas) {
      const frame = this.canvasFrames.get(canvas);
      this.cancelCanvasSnapshot(canvas);
      this.removeCanvasPendingStatus(canvas);
      if (!frame) return;
      const loadTimer = this.canvasFrameLoadTimers.get(frame);
      if (loadTimer) window.clearTimeout(loadTimer);
      this.canvasFrameLoadTimers.delete(frame);
      this.canvasFrames.delete(canvas);
      const state2 = this.states.get(frame);
      if (state2) this.releaseImageState(frame, state2);
      else this.forgetImageWork(frame);
      this.canvasFrameSources.delete(frame);
      this.canvasFrameStaticRects.delete(frame);
      this.canvasFrameRegionFractions.delete(frame);
      this.canvasFrameKeys.delete(canvas);
      this.canvasFrameContentTokens.delete(canvas);
      this.canvasContentReadiness.delete(canvasContentReadinessKey(canvas));
      this.canvasCaptureAttempts.delete(canvas);
      this.canvasMirrorWaitStartedAt.delete(canvas);
      this.canvasCommitMismatches.delete(canvas);
      this.canvasFailureContentTokens.delete(canvas);
      this.canvasTapRecapture.delete(canvas);
      this.canvasFrameUserRequested.delete(canvas);
      frame.remove();
    }
    releaseAllCanvasFrames() {
      for (const canvas of [...this.canvasFrames.keys()]) this.releaseCanvasFrame(canvas);
      for (const canvas of [...this.canvasPendingStatuses.keys()]) {
        this.cancelCanvasSnapshot(canvas);
        this.removeCanvasPendingStatus(canvas);
      }
      this.canvasContentReadiness.clear();
      this.canvasCaptureAttempts.clear();
      this.canvasMirrorWaitStartedAt.clear();
      this.canvasCommitMismatches.clear();
      this.canvasFailureContentTokens.clear();
      this.canvasReaderSignature = void 0;
      this.canvasReaderSamePageSignatureSkips = 0;
    }
    positionCanvasFrames() {
      for (const [canvas, status] of [...this.canvasPendingStatuses]) {
        if (!canvas.isConnected) {
          this.cancelCanvasSnapshot(canvas);
          this.removeCanvasPendingStatus(canvas);
          continue;
        }
        const key = this.canvasPendingStatusKeys.get(canvas);
        if (key && canvasSurfaceSnapshotKey(canvas) !== key) {
          this.cancelCanvasSnapshot(canvas);
          this.removeCanvasPendingStatus(canvas);
          continue;
        }
        const rect = this.visibleViewportIntersection(canvas.getBoundingClientRect());
        if (!rect) {
          if (this.isTerminalCanvasPendingStatus(status)) this.removeCanvasPendingStatus(canvas);
          else status.hidden = true;
          continue;
        }
        status.hidden = false;
        positionOcrImageStatus(status, rect);
      }
      for (const [canvas, frame] of [...this.canvasFrames]) {
        if (!canvas.isConnected) {
          this.releaseCanvasFrame(canvas);
          continue;
        }
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height || isHiddenByCss(canvas) || isInsideHiddenAncestor(canvas)) {
          this.releaseCanvasFrame(canvas);
          continue;
        }
        const key = this.canvasFrameKeys.get(canvas);
        if (key && key !== canvasSurfaceSnapshotKey(canvas)) {
          this.releaseCanvasFrame(canvas);
          this.scheduleReaderRasterRefresh(40);
          continue;
        }
        const staticRect = this.canvasFrameStaticRects.get(frame);
        if (staticRect) {
          const currentRegionRect = this.canvasFrameRegionRect(frame, rect);
          if (this.canvasStaticFrameGeometryChanged(frame, staticRect, currentRegionRect, rect)) {
            if (this.shouldRecaptureCroppedReaderRasterFrameForGeometryChange(frame)) {
              this.releaseCanvasFrameForResnapshot(canvas);
              this.scheduleReaderRasterRefresh(40);
              continue;
            }
          }
          positionCanvasFrameImage(frame, currentRegionRect ?? staticRect);
          continue;
        }
        positionCanvasFrameImage(frame, rect);
      }
    }
    releaseCanvasFrameForResnapshot(canvas) {
      const preserveUserRequested = this.canvasFrameUserRequested.has(canvas);
      this.releaseCanvasFrame(canvas);
      if (preserveUserRequested) this.canvasTapRecapture.set(canvas, READER_RASTER_MAX_CAPTURE_ATTEMPTS);
    }
    canvasFrameNeedsResnapshot(canvas) {
      const frame = this.canvasFrames.get(canvas);
      if (!frame || frame.complete === false) return false;
      const key = this.canvasFrameKeys.get(canvas);
      if (key && key !== canvasSurfaceSnapshotKey(canvas)) return true;
      if (this.canvasContentTokenChanged(canvas, this.canvasFrameContentTokens.get(canvas))) return true;
      const staticRect = this.canvasFrameStaticRects.get(frame);
      if (staticRect) {
        const canvasRect = canvas.getBoundingClientRect();
        const currentRegionRect = this.canvasFrameRegionRect(frame, canvasRect);
        return Boolean(this.canvasStaticFrameGeometryChanged(frame, staticRect, currentRegionRect, canvasRect) && this.shouldRecaptureCroppedReaderRasterFrameForGeometryChange(frame));
      }
      return false;
    }
    shouldRecaptureCroppedReaderRasterFrameForGeometryChange(frame) {
      if (!this.isReaderRasterFrame(frame)) return false;
      const status = this.imageStatuses.get(frame)?.dataset.status;
      return status === "ready" || Boolean(this.states.get(frame)?.result?.lines.length);
    }
    canvasFrameRectSizeChanged(captured, current) {
      return Math.abs(captured.width - current.width) > READER_RASTER_FRAME_SIZE_CHANGE_PX || Math.abs(captured.height - current.height) > READER_RASTER_FRAME_SIZE_CHANGE_PX;
    }
    canvasStaticFrameGeometryChanged(frame, staticRect, currentRegionRect, canvasRect) {
      return Boolean(currentRegionRect && (this.canvasFrameRectSizeChanged(staticRect, currentRegionRect) || this.canvasFrameSourceSizeChanged(frame, staticRect, canvasRect)));
    }
    canvasFrameSourceSizeChanged(frame, staticRect, canvasRect) {
      const fractions = this.canvasFrameRegionFractions.get(frame);
      if (!fractions?.width || !fractions.height) return false;
      const sourceWidth = staticRect.width / fractions.width;
      const sourceHeight = staticRect.height / fractions.height;
      return Math.abs(sourceWidth - canvasRect.width) > READER_RASTER_FRAME_SIZE_CHANGE_PX || Math.abs(sourceHeight - canvasRect.height) > READER_RASTER_FRAME_SIZE_CHANGE_PX;
    }
    canvasContentTokenChanged(canvas, previous) {
      return hasIdentityChanged(canvas, previous);
    }
    canvasFrameRegionRect(frame, canvasRect) {
      const fractions = this.canvasFrameRegionFractions.get(frame);
      if (!fractions || !canvasRect.width || !canvasRect.height) return void 0;
      return new DOMRect(
        canvasRect.left + fractions.x * canvasRect.width,
        canvasRect.top + fractions.y * canvasRect.height,
        fractions.width * canvasRect.width,
        fractions.height * canvasRect.height
      );
    }
    visibleViewportIntersection(rect) {
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      if (!viewportWidth || !viewportHeight) return void 0;
      const left = Math.max(0, rect.left);
      const top = Math.max(0, rect.top);
      const right = Math.min(viewportWidth, rect.right);
      const bottom = Math.min(viewportHeight, rect.bottom);
      const width = right - left;
      const height = bottom - top;
      return width > 0 && height > 0 ? new DOMRect(left, top, width, height) : void 0;
    }
    refreshBackgroundImageReaderSurfaces(settings, userRequested = false) {
      if (!ocrRuntimeActive(settings) || settings.ocrProvider === "off") return;
      if (!settings.ocrAutoScanImages && !userRequested) return;
      if (isBookwalkerViewerHost()) {
        this.releaseAllBackgroundFrames();
        return;
      }
      if (this.options.shouldAutoScan?.() === false && !userRequested) {
        this.releaseAllBackgroundFrames();
        return;
      }
      if (this.isProvenRasterFreePage() || !isReaderRasterPage()) {
        this.releaseAllBackgroundFrames();
        return;
      }
      this.startReaderRasterPollingIfNeeded();
      const canvasSurfaces = activeReaderRasterSurfaces(collectCanvasReaderSurfaces(), settings, userRequested);
      const surfaces = activeReaderRasterSurfaces(collectBackgroundImageReaderSurfaces(), settings, userRequested).filter((surface) => !canvasSurfaces.some((canvas) => readerRasterSurfacesOverlap(canvas, surface)));
      for (const surface of [...this.backgroundFrames.keys()]) {
        const key = this.backgroundFrameKeys.get(surface);
        if (!surfaces.includes(surface) || key !== backgroundSurfaceCacheKey(surface)) this.releaseBackgroundFrame(surface);
      }
      for (const surface of surfaces) {
        if (this.backgroundFrames.has(surface)) continue;
        this.snapshotBackgroundImageSurface(surface, settings, userRequested);
      }
    }
    snapshotBackgroundImageSurface(surface, settings, userRequested = false) {
      if (this.backgroundFrames.has(surface)) return;
      const url = backgroundImageReaderUrl(surface);
      if (!url) return;
      const rect = surface.getBoundingClientRect();
      if (rect.width * rect.height < settings.ocrMinImageArea) return;
      if (!isNearViewport(surface, readerRasterCaptureMargin(settings, userRequested)) || isHiddenByCss(surface) || isInsideHiddenAncestor(surface)) return;
      const frame = document.createElement("img");
      frame.className = "jpdb-ocr-background-frame";
      frame.dataset.yomuBackgroundFrame = "true";
      frame.alt = "";
      frame.decoding = "async";
      positionCanvasFrameImage(frame, rect);
      frame.addEventListener("load", () => {
        if (this.backgroundFrames.get(surface) === frame) this.enqueue(frame, userRequested);
      }, { once: true });
      frame.src = url;
      document.body.append(frame);
      this.backgroundFrames.set(surface, frame);
      this.backgroundFrameSources.set(frame, surface);
      this.backgroundFrameKeys.set(surface, backgroundSurfaceCacheKey(surface));
      this.schedulePosition();
    }
    releaseBackgroundFrame(surface) {
      const frame = this.backgroundFrames.get(surface);
      if (!frame) return;
      this.backgroundFrames.delete(surface);
      this.backgroundFrameKeys.delete(surface);
      const state2 = this.states.get(frame);
      if (state2) this.releaseImageState(frame, state2);
      else this.forgetImageWork(frame);
      this.backgroundFrameSources.delete(frame);
      frame.remove();
    }
    releaseAllBackgroundFrames() {
      for (const surface of [...this.backgroundFrames.keys()]) this.releaseBackgroundFrame(surface);
    }
    retryVisibleReaderRasterFrames(settings) {
      let retried = 0;
      for (const image of [...this.states.keys()]) {
        if (!this.isReaderRasterFrame(image)) continue;
        const rect = this.readerRasterSourceRect(image) ?? image.getBoundingClientRect();
        if (!isImageVisibleForOcr(image, rect) || !isNearViewport(image, readerRasterCaptureMargin(settings, true))) continue;
        this.retryReaderRasterImage(image);
        retried++;
      }
      return retried;
    }
    retryReaderRasterImage(image) {
      const key = imageCacheKey(image);
      const state2 = this.states.get(image);
      const emptyScanKey = state2 ? this.readerRasterEmptyScanKey(state2, state2.key) : image.dataset.ocrAttemptKey;
      if (state2) this.forget(state2.key);
      this.forget(key);
      this.readerRasterEmptyScans.delete(key);
      if (state2) this.readerRasterEmptyScans.delete(state2.key);
      if (emptyScanKey) this.readerRasterEmptyScans.delete(emptyScanKey);
      this.readerRasterFailedScans.delete(key);
      if (state2) this.readerRasterFailedScans.delete(state2.key);
      this.clearReaderRasterProviderRetry(key);
      if (state2 && state2.key !== key) this.clearReaderRasterProviderRetry(state2.key);
      this.queue = this.queue.filter((queued) => queued !== image);
      const settings = this.options.getSettings();
      const canvas = this.canvasFrameSources.get(image);
      if (canvas) {
        this.releaseCanvasFrame(canvas);
        void this.snapshotCanvasSurface(canvas, settings, true);
        return;
      }
      const background = this.backgroundFrameSources.get(image);
      if (background) {
        this.releaseBackgroundFrame(background);
        this.snapshotBackgroundImageSurface(background, settings, true);
      }
    }
    positionBackgroundFrames() {
      for (const [surface, frame] of [...this.backgroundFrames]) {
        if (!surface.isConnected) {
          this.releaseBackgroundFrame(surface);
          continue;
        }
        positionCanvasFrameImage(frame, surface.getBoundingClientRect());
      }
    }
    positionVideoFrames() {
      for (const [video, frame] of [...this.videoFrames]) {
        if (!video.isConnected || !video.paused) {
          this.releaseVideoFrame(video);
          continue;
        }
        const rect = video.getBoundingClientRect();
        this.syncVideoFrameArtifactMount(video, frame);
        positionVideoFrameImage(frame, rect, video);
        const resume = this.videoFrameControls.get(video);
        if (resume) positionVideoFrameResumeControl(resume, rect, video);
        const status = this.videoFrameStatuses.get(video);
        if (status) positionVideoFrameStatus(status, rect, video);
      }
    }
    scheduleRefresh(delay) {
      if (this.destroyed) return;
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = window.setTimeout(() => {
        if (!this.destroyed) this.refresh();
      }, delay);
    }
    positionState(image) {
      const state2 = this.states.get(image);
      if (!state2) return;
      const rect = this.readerRasterSourceRect(image) ?? image.getBoundingClientRect();
      const visible = isImageVisibleForOcr(image, rect);
      state2.overlay.hidden = !visible;
      setOcrOverlayAccessibility(state2.overlay, visible);
      if (!visible) return;
      setOcrArtifactPosition(state2.overlay, rect.left, rect.top);
      state2.overlay.style.width = `${rect.width}px`;
      state2.overlay.style.height = `${rect.height}px`;
      this.fitLineFonts(state2, this.renderedOcrImageFrameForState(image, rect, state2.result));
    }
    readerRasterSourceRect(image) {
      const canvas = this.canvasFrameSources.get(image);
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        return this.canvasFrameRegionRect(image, rect) ?? this.canvasFrameStaticRects.get(image) ?? rect;
      }
      const surface = this.backgroundFrameSources.get(image);
      return surface?.getBoundingClientRect();
    }
    renderedOcrImageFrameForState(image, rect, result) {
      const frame = this.canvasFrameSources.has(image) ? renderedCanvasReaderFrame(rect) : renderedOcrImageFrame(image, rect, result);
      let reserve = 0;
      if (image.dataset.yomuVideoFrame === "true" && isYouTubePageForOcr()) {
        reserve = Math.max(reserve, YOUTUBE_VIDEO_FRAME_BOTTOM_CHROME_RESERVE_PX);
      }
      if (this.canvasFrameSources.has(image) || this.backgroundFrameSources.has(image)) {
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        if (viewportHeight && rect.bottom >= viewportHeight - 2) {
          reserve = Math.max(reserve, READER_RASTER_BOTTOM_CHROME_RESERVE_PX);
        }
      }
      if (!reserve) return frame;
      return { ...frame, safeBottomInset: Math.max(0, Math.min(reserve, frame.imageHeight - 1)) };
    }
    fitLineFonts(state2, frame) {
      const scale = this.options.getSettings().ocrFontScale;
      state2.overlay.querySelectorAll(".jpdb-ocr-line").forEach((element) => {
        const boxLeft = frame.imageLeft + Number(element.dataset.boxLeft) * frame.imageWidth;
        const boxTop = frame.imageTop + Number(element.dataset.boxTop) * frame.imageHeight;
        const boxWidth = Number(element.dataset.boxWidth) * frame.imageWidth;
        const boxHeight = Number(element.dataset.boxHeight) * frame.imageHeight;
        if (!Number.isFinite(boxWidth) || !Number.isFinite(boxHeight) || boxWidth <= 0 || boxHeight <= 0) return;
        const text = element.dataset.ocrText ?? "";
        const vertical = element.dataset.vertical === "true";
        element.style.fontSize = `${ocrFontPx(text, boxWidth, boxHeight, vertical, scale)}px`;
        this.fitLineFrame(element, boxLeft, boxTop, boxWidth, boxHeight, frame, vertical);
      });
    }
    fitLineFrame(element, boxLeft, boxTop, boxWidth, boxHeight, frame, vertical) {
      const textElement = element.querySelector(".jpdb-ocr-line-text");
      if (!textElement) return;
      const hasFurigana = element.dataset.hasFuri === "true";
      const fontSize = Number.parseFloat(element.style.fontSize) || 16;
      const underlineBleed = ocrWordUnderlineBleedPx(fontSize);
      const padX = Math.max(4, Math.round(fontSize * 0.16));
      const padTop = hasFurigana ? Math.max(3, Math.round(fontSize * 0.1)) : Math.max(2, Math.round(fontSize * 0.08));
      const padBottom = vertical ? Math.max(3, Math.round(fontSize * 0.1)) : Math.max(3, underlineBleed);
      element.style.setProperty("--jpdb-ocr-pad-x", `${padX}px`);
      element.style.setProperty("--jpdb-ocr-pad-top", `${padTop}px`);
      element.style.setProperty("--jpdb-ocr-pad-bottom", `${padBottom}px`);
      const contentRect = textElement.getBoundingClientRect();
      const contentWidth = Math.max(1, contentRect.width);
      const contentHeight = Math.max(1, contentRect.height);
      const minHitSize = Math.max(24, Math.round(fontSize * 1.25));
      const furiGutter = vertical && hasFurigana ? Math.round(fontSize * 0.55) : 0;
      const underlineGutter = vertical ? underlineBleed : 0;
      const frameWidth = Math.min(frame.imageWidth, Math.max(boxWidth, minHitSize, contentWidth + padX * 2 + underlineGutter * 2));
      const frameHeight = Math.min(frame.imageHeight, Math.max(boxHeight, minHitSize, contentHeight + padTop + padBottom));
      const minLeft = frame.imageLeft;
      const minTop = frame.imageTop;
      const maxLeft = Math.max(minLeft, frame.imageLeft + frame.imageWidth - frameWidth - furiGutter);
      const maxTop = Math.max(minTop, frame.imageTop + frame.imageHeight - (frame.safeBottomInset ?? 0) - frameHeight);
      const left = clampNumber(boxLeft + boxWidth / 2 - frameWidth / 2, minLeft, maxLeft);
      const centeredTop = boxTop + boxHeight / 2 - frameHeight / 2;
      const baselineAlignedTop = boxTop + boxHeight - frameHeight + padBottom;
      const targetTop = vertical ? boxTop : shouldCenterOcrText(element.dataset.ocrText ?? "") ? centeredTop : baselineAlignedTop;
      const top = clampNumber(targetTop, minTop, maxTop);
      element.style.left = `${left}px`;
      element.style.top = `${top}px`;
      element.style.width = `${frameWidth}px`;
      element.style.height = `${frameHeight}px`;
    }
    clear() {
      this.observer?.disconnect();
      this.observer = void 0;
      this.observerMargin = "";
      window.clearTimeout(this.refreshTimer);
      this.releaseAllCanvasFrames();
      this.releaseAllBackgroundFrames();
      this.queue = [];
      this.inFlightJobs.clear();
      for (const timer of this.readerRasterProviderRetryTimers.values()) window.clearTimeout(timer);
      this.readerRasterProviderRetryTimers.clear();
      this.readerRasterProviderFailures.clear();
      for (const state2 of this.states.values()) {
        if (state2.loadListener) state2.image.removeEventListener("load", state2.loadListener);
        removeOcrArtifact(state2.overlay);
      }
      this.states.clear();
      this.discardOcrLineInteractionState([...this.lookupLineLeases.keys()]);
      for (const timer of this.imageStatusTimers.values()) window.clearTimeout(timer);
      this.imageStatusTimers.clear();
      for (const card of this.imageStatuses.values()) removeOcrArtifact(card);
      this.imageStatuses.clear();
    }
    // Drop only the overlays the reader auto-painted, keeping panels the user
    // scanned by hand (those carry overlayRequested/manualRequested). Used when
    // we start deferring to a page's native text layer mid-session. The cached
    // results stay in `this.cache`, so flipping back re-renders them instantly
    // without re-OCRing.
    clearAutoScannedOverlays() {
      for (const [image, state2] of [...this.states]) {
        if (state2.manualRequested || state2.overlayRequested) continue;
        const canvas = this.canvasFrameSources.get(image);
        if (canvas) {
          this.releaseCanvasFrame(canvas);
          continue;
        }
        const background = this.backgroundFrameSources.get(image);
        if (background) {
          this.releaseBackgroundFrame(background);
          continue;
        }
        this.releaseImageState(image, state2);
      }
    }
    releaseInlineImageStates() {
      for (const [image, state2] of [...this.states]) {
        if (this.isReaderRasterFrame(image) || this.videoFrameVideos.has(image)) continue;
        this.releaseImageState(image, state2);
      }
    }
    rememberOcrWordRenderStates(line, tokens) {
      const tokensByKey = new Map(tokens.map((token) => [ocrTokenRenderKey(token), token]));
      line.querySelectorAll(".jpdb-reader-word[data-vid][data-sid]").forEach((word) => {
        const token = tokensByKey.get(ocrRenderedWordKey(word));
        if (!token) return;
        this.ocrWordRenderStates.set(word, {
          surface: word.dataset.surface || line.dataset.ocrText?.slice(token.start, token.end) || word.textContent || "",
          token
        });
      });
    }
    activateOcrLineMarkup(state2, line) {
      if (this.activateOcrMarkup(line)) this.positionState(state2.image);
    }
    activateOcrMarkup(line) {
      const previousHasFurigana = line.dataset.hasFuri;
      const wasActivated = line.dataset.ocrMarkupActivated === "true";
      let hasFurigana = false;
      const settings = this.options.getSettings();
      line.querySelectorAll(".jpdb-reader-word[data-vid][data-sid]").forEach((word) => {
        const state2 = this.ocrWordRenderStates.get(word);
        if (!state2) return;
        this.applyOcrPitchClass(word, state2.token);
        if (!shouldRenderRuby(state2.surface, state2.token, settings)) {
          this.setOcrWordPlainText(word, state2.surface);
          return;
        }
        setInnerHtml(word, renderRuby(state2.surface, state2.token));
        normalizeOcrRenderedText(word);
        word.classList.add("jpdb-reader-has-furi");
        hasFurigana = true;
      });
      line.dataset.hasFuri = String(hasFurigana);
      line.dataset.ocrMarkupActivated = "true";
      return !wasActivated || previousHasFurigana !== line.dataset.hasFuri;
    }
    applyOcrPitchClass(word, token) {
      this.clearOcrPitchClass(word);
      const pitchClass = ocrSafePitchClass(token.pitchClass);
      word.dataset.pitchClass = pitchClass;
      if (pitchClass) word.classList.add(`jpdb-pitch-${pitchClass}`);
    }
    clearOcrPitchClass(word) {
      word.classList.forEach((className) => {
        if (/^jpdb-pitch-/u.test(className)) word.classList.remove(className);
      });
      word.dataset.pitchClass = "";
    }
    setOcrWordPlainText(word, surface) {
      word.classList.remove("jpdb-reader-has-furi");
      setInnerHtml(word, escapeHtml(surface));
      normalizeOcrRenderedText(word);
    }
    // Drop every paused-frame and image overlay when YouTube navigates so no
    // stale OCR artifact (rail resume button, overlay over the player) carries
    // across the SPA route change, then re-scan the destination page.
    teardownForNavigation() {
      if (this.states.size === 0 && this.videoFrames.size === 0 && this.canvasFrames.size === 0 && this.backgroundFrames.size === 0) return;
      this.releaseAllVideoFrames();
      this.clear();
      if (ocrRuntimeActive(this.options.getSettings())) this.scheduleRefresh(0);
    }
    pruneDisconnectedStates() {
      for (const [image, state2] of this.states) {
        if (image.isConnected) continue;
        this.releaseImageState(image, state2);
      }
    }
    releaseImageState(image, state2 = this.states.get(image)) {
      if (state2) {
        this.observer?.unobserve(image);
        if (state2.loadListener) image.removeEventListener("load", state2.loadListener);
        this.discardOcrLineInteractionState(state2.overlay.querySelectorAll(".jpdb-ocr-line"));
        removeOcrArtifact(state2.overlay);
        this.states.delete(image);
      }
      this.forgetImageWork(image, state2);
    }
    syncVideoFrameArtifactMount(video, frame) {
      const root = videoFrameArtifactRoot(video);
      appendOcrArtifactToRoot(frame, root);
      const state2 = this.states.get(frame);
      if (state2) appendOcrArtifactToRoot(state2.overlay, root);
      const status = this.videoFrameStatuses.get(video);
      if (status) appendOcrArtifactToRoot(status, root);
      const resume = this.videoFrameControls.get(video);
      if (resume?.classList.contains("jpdb-ocr-video-frame-resume-fallback")) appendOcrArtifactToRoot(resume, root);
    }
    forgetImageWork(image, state2) {
      this.queue = this.queue.filter((queued) => queued !== image);
      this.cancelReaderRasterProviderRetryTimer(imageCacheKey(image));
      if (state2) this.cancelReaderRasterProviderRetryTimer(state2.key);
      this.removeImageStatusCard(image);
    }
    isCurrentState(state2) {
      return !this.destroyed && this.states.get(state2.image) === state2;
    }
    requireCurrentState(state2) {
      if (!this.isCurrentState(state2)) throw STALE_OCR_STATE;
    }
    isCurrentContentState(state2, key) {
      return this.isCurrentState(state2) && state2.key === key && imageCacheKey(state2.image) === key;
    }
    requireCurrentContentState(state2, key) {
      if (!this.isCurrentContentState(state2, key)) throw STALE_OCR_STATE;
    }
  }
  function isStaleOcrState(error) {
    return error === STALE_OCR_STATE;
  }
  function applyOcrOverlayStyle(overlay, settings) {
    const theme = effectiveOcrOverlayTheme(settings);
    overlay.dataset.ocrOverlayTheme = theme;
    overlay.dataset.ocrOverlayVariant = settings.ocrOverlayTheme === "auto" ? "auto" : "custom";
    if (theme === "light") {
      overlay.style.setProperty("--jpdb-ocr-text-color", "#17202a");
      overlay.style.setProperty("--jpdb-ocr-outline-color", "rgba(255, 255, 255, 0)");
      overlay.style.setProperty("--jpdb-ocr-background-rgba", "rgba(248, 250, 252, 0.68)");
      overlay.style.setProperty("--jpdb-ocr-background-active-rgba", "rgba(248, 250, 252, 0.86)");
      return;
    }
    overlay.style.setProperty("--jpdb-ocr-text-color", settings.ocrTextColor);
    overlay.style.setProperty("--jpdb-ocr-outline-color", settings.ocrOutlineColor);
    const opacity = accessibleOcrBackgroundOpacity(settings.ocrBackgroundOpacity);
    const background = accessibleOcrBackgroundColor(settings.accentColor, opacity);
    overlay.style.setProperty("--jpdb-ocr-background-rgba", accentToRgba(background, opacity));
    overlay.style.setProperty("--jpdb-ocr-background-active-rgba", accentToRgba(background, Math.min(1, opacity + 0.12)));
  }
  function effectiveOcrOverlayTheme(settings) {
    if (settings.ocrOverlayTheme === "dark" || settings.ocrOverlayTheme === "light") return settings.ocrOverlayTheme;
    if (settings.theme === "dark" || settings.theme === "light") return settings.theme;
    try {
      return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    } catch {
      return "dark";
    }
  }
  function ocrParseOptions() {
    return {
      allowSegmentedFallback: true,
      includeLocalPitch: true
    };
  }
  function ocrTokensWithFallbackGaps(text, tokens, fallbackCardFromText) {
    const safeTokens = tokens.filter((token) => isRenderableOcrToken(token, text.length));
    const fallbackTokens = fallbackJapaneseSegments(text).filter((segment) => !safeTokens.some((token) => rangesOverlap(segment.start, segment.end, token.start, token.end))).map((segment) => ocrFallbackToken(text, segment, fallbackCardFromText));
    return fallbackTokens.length ? [...safeTokens, ...fallbackTokens].sort(compareOcrTokens) : safeTokens;
  }
  function ocrTokensWithVocabulary(text, tokens, vocabulary) {
    if (!vocabulary?.size) return tokens;
    return tokens.map((token) => ocrTokenWithVocabulary(text, token, vocabulary));
  }
  function ocrTokenWithVocabulary(text, token, vocabulary) {
    const surface = ocrTokenSurface(text, token);
    const seeded = vocabulary.get(ocrVocabularyKey(surface)) ?? vocabulary.get(ocrVocabularyKey(token.card.spelling));
    if (!seeded) return token;
    const card = cloneOcrVocabularyCard(seeded);
    return {
      ...token,
      card,
      pitchClass: getPitchClass(card.pitchAccent, card.reading || card.spelling) || token.pitchClass
    };
  }
  function ocrTokenSurface(text, token) {
    return text.slice(token.start, token.end) || token.card.spelling;
  }
  function isRenderableOcrToken(token, textLength) {
    return Number.isFinite(token.start) && Number.isFinite(token.end) && token.start >= 0 && token.end <= textLength && token.end > token.start;
  }
  function ocrFallbackToken(sentence, segment, fallbackCardFromText) {
    const card = fallbackCardFromText(segment.surface);
    return {
      card,
      start: segment.start,
      end: segment.end,
      length: segment.end - segment.start,
      rubies: [],
      pitchClass: getPitchClass(card.pitchAccent, card.reading || card.spelling),
      sentence
    };
  }
  function ocrFallbackCardFromImage(image, fallbackCardFromText) {
    const vocabulary = ocrVocabularyCards(image);
    if (!vocabulary?.size) return fallbackCardFromText;
    return (text) => {
      const seeded = vocabulary.get(ocrVocabularyKey(text));
      return seeded ? cloneOcrVocabularyCard(seeded) : fallbackCardFromText(text);
    };
  }
  function ocrVocabularyCards(image) {
    const cached = ocrVocabularyCache.get(image);
    if (cached !== void 0) return cached;
    const parsed = parseOcrVocabularyCards(image.dataset.ocrVocabulary);
    ocrVocabularyCache.set(image, parsed);
    return parsed;
  }
  function parseOcrVocabularyCards(value) {
    if (!value) return null;
    try {
      const entries = JSON.parse(value);
      if (!Array.isArray(entries)) return null;
      const cards = /* @__PURE__ */ new Map();
      entries.forEach((entry) => {
        if (!isOcrVocabularyRecord(entry)) return;
        const card = ocrVocabularyCard(entry);
        const surface = ocrVocabularySurface(entry) || card?.spelling;
        if (card && surface) cards.set(ocrVocabularyKey(surface), card);
      });
      return cards.size ? cards : null;
    } catch {
      return null;
    }
  }
  function ocrVocabularyCard(entry) {
    if (!isOcrVocabularyRecord(entry)) return null;
    const surface = ocrVocabularySurface(entry);
    const spelling = ocrVocabularyString(entry.spelling) || surface;
    if (!surface || !spelling) return null;
    const reading = ocrVocabularyString(entry.reading);
    const id = -stablePositiveHashId(`ocr-vocabulary
${spelling}
${reading}`);
    return {
      vid: id,
      sid: id,
      rid: 0,
      spelling,
      reading,
      frequencyRank: ocrVocabularyInteger(entry.frequencyRank) ?? null,
      partOfSpeech: [],
      meanings: [],
      cardState: ["not-in-deck"],
      pitchAccent: ocrVocabularyPitchPatterns(entry, reading),
      wordWithReading: null,
      source: "fallback"
    };
  }
  function cloneOcrVocabularyCard(card) {
    return {
      ...card,
      partOfSpeech: [...card.partOfSpeech],
      meanings: card.meanings.map((meaning) => ({
        ...meaning,
        glosses: [...meaning.glosses],
        partOfSpeech: [...meaning.partOfSpeech]
      })),
      cardState: [...card.cardState],
      pitchAccent: [...card.pitchAccent]
    };
  }
  function ocrVocabularySurface(entry) {
    return ocrVocabularyString(entry.surface) || ocrVocabularyString(entry.text);
  }
  function ocrVocabularyPitchPatterns(entry, reading) {
    const explicit = Array.isArray(entry.pitchAccent) ? entry.pitchAccent.filter((value) => typeof value === "string" && /^[HL]+$/u.test(value)) : [];
    const positions = ocrVocabularyPitchPositions(entry);
    return [
      ...explicit,
      ...positions.map((position) => pitchPatternFromPosition(reading, position)).filter(Boolean)
    ];
  }
  function ocrVocabularyPitchPositions(entry) {
    if (Array.isArray(entry.pitchPositions)) {
      return entry.pitchPositions.map(ocrVocabularyInteger).filter((position2) => position2 !== void 0);
    }
    const position = ocrVocabularyInteger(entry.pitchPosition);
    return position === void 0 ? [] : [position];
  }
  function ocrVocabularyKey(value) {
    return value.replace(/\s+/g, " ").trim();
  }
  function ocrVocabularyString(value) {
    return typeof value === "string" ? value.trim() : "";
  }
  function ocrVocabularyInteger(value) {
    return Number.isInteger(value) ? value : void 0;
  }
  function isOcrVocabularyRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  function rangesOverlap(start, end, otherStart, otherEnd) {
    return start < otherEnd && otherStart < end;
  }
  function compareOcrTokens(first, second) {
    return first.start - second.start || second.length - first.length;
  }
  function ocrFallbackCardFromText(text) {
    const spelling = text.replace(/\s+/g, " ").trim().slice(0, 80);
    const id = -stablePositiveHashId(`ocr-fallback
${spelling}`);
    return {
      vid: id,
      sid: id,
      rid: 0,
      spelling,
      reading: "",
      frequencyRank: null,
      partOfSpeech: [],
      meanings: [],
      cardState: ["not-in-deck"],
      pitchAccent: [],
      wordWithReading: null,
      source: "fallback"
    };
  }
  function createOcrLineElement(result, line, tokens, sentence, showText, settings) {
    const element = document.createElement("div");
    element.className = showText ? "jpdb-ocr-line jpdb-ocr-line-visible" : "jpdb-ocr-line";
    setOcrLineDataset(element, result, line, sentence);
    element.tabIndex = 0;
    element.style.writingMode = line.vertical ? "vertical-rl" : "horizontal-tb";
    element.setAttribute("role", "button");
    element.setAttribute("aria-label", line.text);
    element.setAttribute("aria-pressed", "false");
    const textElement = createOcrLineText(line, tokens, settings);
    element.append(textElement);
    element.dataset.hasFuri = String(Boolean(textElement.querySelector(".jpdb-reader-has-furi")));
    setOcrLinePosition(element, result, line);
    return element;
  }
  function ocrRenderedLineIdentity(element) {
    return JSON.stringify([
      element.dataset.ocrText ?? "",
      element.dataset.boxLeft ?? "",
      element.dataset.boxTop ?? "",
      element.dataset.boxWidth ?? "",
      element.dataset.boxHeight ?? "",
      element.dataset.vertical ?? ""
    ]);
  }
  function setOcrOverlayAccessibility(overlay, visible) {
    overlay.setAttribute("aria-hidden", String(!visible));
    if (!visible) {
      overlay.removeAttribute("role");
      overlay.removeAttribute("aria-label");
      return;
    }
    overlay.setAttribute("role", "region");
    overlay.setAttribute("aria-label", `Yomu OCR text ${overlay.dataset.ocrLayerId ?? ""}`.trim());
  }
  function setOcrLineDataset(element, result, line, sentence) {
    element.dataset.ocrText = line.text;
    element.dataset.boxLeft = String(line.box.left / result.width);
    element.dataset.boxTop = String(line.box.top / result.height);
    element.dataset.vertical = String(line.vertical);
    element.dataset.boxWidth = String(line.box.width / result.width);
    element.dataset.boxHeight = String(line.box.height / result.height);
    element.dataset.sentence = sentence;
  }
  function createOcrLineText(line, tokens, settings) {
    const textElement = document.createElement("span");
    textElement.className = "jpdb-ocr-line-text";
    setInnerHtml(textElement, tokens.length ? renderTokensToHtml(line.text, tokens, settings) : escapeHtml(line.text));
    normalizeOcrRenderedText(textElement);
    return textElement;
  }
  function ocrTokenRenderKey(token) {
    return `${token.start}:${token.end}:${token.card.vid}:${token.card.sid}`;
  }
  function ocrRenderedWordKey(word) {
    return `${word.dataset.tokenStart ?? ""}:${word.dataset.tokenEnd ?? ""}:${word.dataset.vid ?? ""}:${word.dataset.sid ?? ""}`;
  }
  function ocrSafePitchClass(pitchClass) {
    const normalized = pitchClass?.trim() ?? "";
    return /^(?:heiban|atamadaka|nakadaka|odaka)$/u.test(normalized) ? normalized : "";
  }
  function setOcrLinePosition(element, result, line) {
    element.style.left = `${100 * line.box.left / result.width}%`;
    element.style.top = `${100 * line.box.top / result.height}%`;
    element.style.width = `${100 * line.box.width / result.width}%`;
    element.style.height = `${100 * line.box.height / result.height}%`;
  }
  function renderedOcrImageFrame(image, rect, result) {
    const pausedVideoFrame = renderedPausedVideoFrame(image, rect);
    if (pausedVideoFrame) return pausedVideoFrame;
    const style = getComputedStyle(image);
    const content = imageContentBox(image, rect, style);
    const { sourceWidth, sourceHeight } = ocrSourceDimensions(image, rect, content, result);
    const object = fittedObjectSize(style.objectFit, sourceWidth, sourceHeight, content.width, content.height);
    const offset = objectPositionOffset(style.objectPosition, content.width - object.width, content.height - object.height);
    return {
      imageLeft: content.left + offset.x,
      imageTop: content.top + offset.y,
      imageWidth: Math.max(1, object.width),
      imageHeight: Math.max(1, object.height)
    };
  }
  function renderedPausedVideoFrame(image, rect) {
    if (image.dataset.yomuVideoFrame !== "true") return null;
    return {
      imageLeft: 0,
      imageTop: 0,
      imageWidth: Math.max(1, rect.width),
      imageHeight: Math.max(1, rect.height)
    };
  }
  function renderedCanvasReaderFrame(rect) {
    return {
      imageLeft: 0,
      imageTop: 0,
      imageWidth: Math.max(1, rect.width),
      imageHeight: Math.max(1, rect.height)
    };
  }
  function ocrSourceDimensions(image, rect, content, result) {
    return {
      sourceWidth: firstTruthyNumber(result?.width, image.naturalWidth, image.width, content.width, rect.width),
      sourceHeight: firstTruthyNumber(result?.height, image.naturalHeight, image.height, content.height, rect.height)
    };
  }
  function firstTruthyNumber(...values) {
    const value = values.find((candidate) => Boolean(candidate));
    return value === void 0 ? 1 : value;
  }
  function captureImageElement(image) {
    try {
      if (!image.naturalWidth || !image.naturalHeight) return void 0;
      const canvas = document.createElement("canvas");
      const maxWidth = 960;
      const scale = Math.min(1, maxWidth / image.naturalWidth);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return void 0;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.84);
    } catch {
      return void 0;
    }
  }
  function readFallbackOcrResult(image, _includeAccessibleText = false) {
    const width = image.naturalWidth || image.width || 1;
    const height = image.naturalHeight || image.height || 1;
    return parseFallbackOcrLines(image.dataset.ocrLines, width, height);
  }
  function parseFallbackOcrLines(data, width, height) {
    if (!data) return null;
    try {
      return normalizeOcrResult({ width, height, lines: JSON.parse(data) }, width, height);
    } catch {
      return null;
    }
  }
  function ocrFontPx(text, boxWidth, boxHeight, vertical, scale) {
    const safeScale = Math.max(0.7, Math.min(1.8, scale));
    const length = Math.max(1, visualTextLength(text));
    const byBoxThickness = vertical ? boxWidth * 0.72 : boxHeight * 0.58;
    const byBoxLength = vertical ? boxHeight / length * 1.12 : boxWidth / length * 1.08;
    const fitted = Math.min(byBoxThickness, byBoxLength) * safeScale;
    return Math.max(11, Math.min(38, fitted));
  }
  function ocrWordUnderlineBleedPx(fontSize) {
    return Math.ceil(fontSize * (OCR_WORD_UNDERLINE_OFFSET_EM + OCR_WORD_UNDERLINE_THICKNESS_EM)) + OCR_WORD_UNDERLINE_CLEARANCE_PX;
  }
  function visualTextLength(text) {
    return [...text.trim()].reduce((total, char) => {
      if (/\s/.test(char)) return total + 0.35;
      if (/[\u0000-\u00ff]/.test(char)) return total + 0.62;
      return total + 1;
    }, 0);
  }
  function shouldCenterOcrText(text) {
    return visualTextLength(text) <= 1.5;
  }
  function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  function isCandidateImage(image, settings) {
    if (isIgnoredOcrImage(image)) return false;
    const rect = image.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area < settings.ocrMinImageArea) return false;
    if (!isNearViewport(image, imagePrefetchMargin(settings))) return false;
    if (isImageOccludedByVideo(image, rect)) return false;
    return isVisibleOcrImage(image);
  }
  function ocrImageFromPointerEvent(event, settings) {
    if (!ocrRuntimeActive(settings) || !isPointerLikeEvent(event) || !shouldHandleOcrPointerEvent(event)) return null;
    const image = pointerEventImageTarget(event) ?? pointerEventImageAtPoint(event);
    return image && isCandidateImage(image, settings) && shouldObserveImage(image, settings) ? image : null;
  }
  function ocrReaderSurfaceFromPointerEvent(event, settings) {
    if (!ocrRuntimeActive(settings) || settings.ocrProvider === "off" || !isPointerLikeEvent(event) || !shouldHandleOcrPointerEvent(event)) return null;
    if (pointerEventOverOcrOverlay(event)) return null;
    return pointerEventReaderSurfaceTarget(event, settings) ?? pointerEventReaderSurfaceAtPoint(event, settings);
  }
  function touchPointFromEvent(event) {
    const touchEvent = event;
    const touch = touchEvent.changedTouches?.[0] ?? touchEvent.touches?.[0];
    if (!touch || typeof touch.clientX !== "number" || typeof touch.clientY !== "number") return null;
    return { clientX: touch.clientX, clientY: touch.clientY };
  }
  function eventWithPoint(event, point) {
    return {
      type: "pointerdown",
      target: event.target,
      button: 0,
      clientX: point.clientX,
      clientY: point.clientY,
      pointerType: "touch"
    };
  }
  function pointerEventOverOcrOverlay(event) {
    const target = event.target;
    if (target?.closest?.("[data-jpdb-reader-root]")) return true;
    if (typeof event.clientX !== "number" || typeof event.clientY !== "number") return false;
    return Boolean(document.elementFromPoint?.(event.clientX, event.clientY)?.closest?.("[data-jpdb-reader-root]"));
  }
  function shouldHandleOcrPointerEvent(event) {
    if (event.type === "pointerdown") return event.button === void 0 || event.button === 0;
    return (event.type === "pointerover" || event.type === "pointermove") && isHoverPointerType(event.pointerType);
  }
  function isPointerLikeEvent(event) {
    const candidate = event;
    return typeof candidate.clientX === "number" && typeof candidate.clientY === "number";
  }
  function isHoverPointerType(pointerType) {
    return !pointerType || pointerType === "mouse" || pointerType === "pen";
  }
  function pointerEventImageTarget(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest("[data-jpdb-reader-root]")) return null;
    return target instanceof HTMLImageElement ? target : target.closest("img");
  }
  function pointerEventImageAtPoint(event) {
    const element = document.elementFromPoint?.(event.clientX, event.clientY);
    if (!element || element.closest("[data-jpdb-reader-root]")) return null;
    return element instanceof HTMLImageElement ? element : element.closest("img");
  }
  function pointerEventReaderSurfaceTarget(event, settings) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest("[data-jpdb-reader-root]")) return null;
    return readerSurfaceFromElement(target, settings);
  }
  function pointerEventReaderSurfaceAtPoint(event, settings) {
    const element = document.elementFromPoint?.(event.clientX, event.clientY);
    if (element && !element.closest("[data-jpdb-reader-root]")) {
      const surface = readerSurfaceFromElement(element, settings);
      if (surface) return surface;
    }
    return readerSurfaceAtPoint(event.clientX, event.clientY, settings);
  }
  function readerSurfaceFromElement(element, settings) {
    const canvas = element instanceof HTMLCanvasElement ? element : element.closest("canvas");
    if (canvas && isManualCanvasReaderSurface(canvas) && isReaderSurfaceCandidate(canvas, settings)) return canvas;
    if (canvas && collectCanvasReaderSurfaces().includes(canvas) && isReaderSurfaceCandidate(canvas, settings)) return canvas;
    const background = collectBackgroundImageReaderSurfaces().find((surface) => (surface === element || surface.contains(element)) && isReaderSurfaceCandidate(surface, settings));
    return background ?? null;
  }
  function readerSurfaceAtPoint(clientX, clientY, settings) {
    const surfaces = [
      ...collectCanvasReaderSurfaces(),
      ...collectBackgroundImageReaderSurfaces()
    ].filter((surface) => isReaderSurfaceCandidate(surface, settings));
    return surfaces.find((surface) => rectContainsPoint(surface.getBoundingClientRect(), clientX, clientY)) ?? null;
  }
  function isReaderSurfaceCandidate(surface, settings) {
    const rect = surface.getBoundingClientRect();
    return rect.width * rect.height >= settings.ocrMinImageArea && isNearViewport(surface, settings.ocrPrefetchMargin) && !isHiddenByCss(surface) && !isInsideHiddenAncestor(surface);
  }
  function rectContainsPoint(rect, clientX, clientY) {
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }
  function isIgnoredOcrImage(image) {
    return Boolean(image.closest("[data-jpdb-reader-root]") || image.closest('[data-yomu-ocr="ignore"], [data-jpdb-reader-ocr="ignore"]') || image.closest('[aria-hidden="true"], [hidden], .slick-cloned') || isBookwalkerReaderSourceImage(image) || isBrandOrIconOcrImage(image) || isYouTubeThumbnailImage(image));
  }
  function isBookwalkerReaderSourceImage(image) {
    return isBookwalkerViewerHost() && image.classList.contains("loadingImage");
  }
  function isYouTubeThumbnailImage(image) {
    return Boolean(image.closest(OCR_IMAGE_THUMBNAIL_CONTAINER_SELECTOR));
  }
  const OCR_BRAND_IMAGE_TEXT_RE = /(^|[\s/_.?#&=-])(?:app-?icon|apple-touch-icon|avatar|badge|brand|favicon|icon|logo|site-icon|touch-icon|yomu-icon)(?=$|[\s/_.?#&=-])/iu;
  const OCR_BRAND_IMAGE_CONTAINER_SELECTOR = [
    "header",
    "nav",
    '[role="banner"]',
    '[role="navigation"]',
    '[class*="brand" i]',
    '[class*="logo" i]',
    '[id*="brand" i]',
    '[id*="logo" i]'
  ].join(",");
  function isBrandOrIconOcrImage(image) {
    if (OCR_BRAND_IMAGE_TEXT_RE.test(imageIdentityText(image))) return true;
    const rect = image.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > 0 && area <= 12e3 && isIconLikeImage(image, rect)) return true;
    if (image.closest(OCR_BRAND_IMAGE_CONTAINER_SELECTOR)) return area <= 16e4 || isIconLikeImage(image, rect);
    return false;
  }
  function imageIdentityText(image) {
    return [
      image.currentSrc,
      image.src,
      image.alt,
      image.title,
      image.id,
      image.className,
      image.getAttribute("aria-label"),
      image.getAttribute("role")
    ].filter(Boolean).join(" ");
  }
  function isIconLikeImage(image, rect = image.getBoundingClientRect()) {
    const width = image.naturalWidth || rect.width;
    const height = image.naturalHeight || rect.height;
    if (!width || !height) return false;
    const ratio = width / height;
    return ratio >= 0.72 && ratio <= 1.38 && Math.max(rect.width, rect.height, width, height) <= 256;
  }
  function isVisibleOcrImage(image) {
    return !isHiddenByCss(image) && !isInsideHiddenAncestor(image);
  }
  function isImageVisibleForOcr(image, rect) {
    return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight && !isImageOccludedByVideo(image, rect);
  }
  function isInsideHiddenAncestor(element) {
    for (let current = element.parentElement; current && current !== document.body; current = current.parentElement) {
      if (isHiddenByCss(current) || isHiddenByAttribute(current)) return true;
    }
    return false;
  }
  function isHiddenByCss(element) {
    const style = getComputedStyle(element);
    return style.visibility === "hidden" || style.display === "none" || Number(style.opacity || "1") <= 0;
  }
  function isHiddenByAttribute(element) {
    return element.getAttribute("aria-hidden") === "true" || element.hasAttribute("hidden");
  }
  function mutationTouchesRenderableMedia(mutation) {
    if (mutation.type === "childList") {
      return [...mutation.addedNodes, ...mutation.removedNodes].some(nodeContainsRenderableMedia);
    }
    return mutation.target instanceof Element && nodeContainsRenderableMedia(mutation.target);
  }
  function summarizeRenderableMediaMutations(mutations) {
    let addedImage = false;
    let touched = false;
    for (const mutation of mutations) {
      if (!mutationTouchesRenderableMedia(mutation)) continue;
      touched = true;
      if (mutation.type === "childList" && [...mutation.addedNodes].some(nodeContainsRenderableMedia)) addedImage = true;
      if (addedImage) break;
    }
    return { touched, addedImage };
  }
  function canAutoRefreshOcrAfterMutation(settings, shouldAutoScan) {
    return settings.ocrAutoScanImages && (shouldAutoScan?.() !== false || hasCanvasOcrOptInSurface());
  }
  function nodeContainsRenderableMedia(node) {
    return node instanceof HTMLImageElement || node instanceof HTMLVideoElement || node instanceof HTMLCanvasElement || node instanceof HTMLSourceElement || node instanceof HTMLElement && Boolean(backgroundImageReaderUrl(node)) || node instanceof Element && Boolean(node.querySelector('img, video, source, canvas, [data-page-index], [style*="background-image"], [style*="background:"][style*="url("]'));
  }
  function hasCanvasOcrOptInSurface() {
    return Boolean(document.querySelector('canvas[data-yomu-canvas-ocr="on"], [data-yomu-canvas-ocr="on"] canvas'));
  }
  function isCanvasOcrOptInSurface(canvas) {
    return canvas.dataset.yomuCanvasOcr === "on" || Boolean(canvas.closest('[data-yomu-canvas-ocr="on"]'));
  }
  function isImageOccludedByVideo(image, rect = image.getBoundingClientRect()) {
    if (image.dataset.yomuVideoFrame) return false;
    const imageArea = rect.width * rect.height;
    if (imageArea < 4) return false;
    const imageRoot = image.getRootNode();
    for (const video of document.querySelectorAll("video")) {
      if (!isVisiblePeerVideo(video, image, imageRoot)) continue;
      if (videoOccludesImage(video, rect, imageArea)) return true;
    }
    return false;
  }
  function isVisiblePeerVideo(video, image, imageRoot) {
    return video.isConnected && video.getRootNode() === imageRoot && !isSameMediaNode(video, image) && visibleVideoRect(video) !== null && !isHiddenByCss(video);
  }
  function visibleVideoRect(video) {
    const rect = video.getBoundingClientRect();
    return rect.width >= 2 && rect.height >= 2 ? rect : null;
  }
  function videoOccludesImage(video, imageRect, imageArea) {
    const videoRect = visibleVideoRect(video);
    return Boolean(videoRect && intersectionArea(imageRect, videoRect) / imageArea >= 0.6);
  }
  function isSameMediaNode(video, image) {
    return video === image.parentElement || image === video.parentElement;
  }
  function intersectionArea(a, b) {
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);
    return Math.max(0, right - left) * Math.max(0, bottom - top);
  }
  function shouldObserveImage(image, settings) {
    return settings.ocrProvider !== "off" && (hasInlineOcrFallback(image) || isOcrProviderConfigured(settings));
  }
  function hasInlineOcrFallback(image) {
    return Boolean(readFallbackOcrResult(image, false));
  }
  function isNearViewport(element, margin) {
    const rect = element.getBoundingClientRect();
    return rect.bottom >= -margin && rect.top <= window.innerHeight + margin && rect.right >= -margin && rect.left <= window.innerWidth + margin;
  }
  function ocrConcurrencyLimit(settings) {
    return Math.max(1, Math.min(8, Math.round(settings.ocrConcurrency || 1)));
  }
  function canvasPrefetchMargin(settings) {
    const pages = Math.max(0, settings.ocrPrefetchPages || 0);
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    return Math.max(settings.ocrPrefetchMargin, pages * viewportHeight);
  }
  let imageReaderPageCache = { at: -Infinity, value: false };
  function isLikelyImageReaderPage(settings) {
    if (isReaderRasterPage()) return true;
    const now = Date.now();
    if (now - imageReaderPageCache.at < 1e3) return imageReaderPageCache.value;
    let large = 0;
    let value = false;
    for (const image of Array.from(document.images)) {
      const rect = image.getBoundingClientRect();
      if (rect.width >= 300 && rect.width * rect.height >= settings.ocrMinImageArea && ++large >= 3) {
        value = true;
        break;
      }
    }
    imageReaderPageCache = { at: now, value };
    return value;
  }
  function imagePrefetchMargin(settings) {
    return settings.ocrPrefetchPages > 0 && isLikelyImageReaderPage(settings) ? canvasPrefetchMargin(settings) : settings.ocrPrefetchMargin;
  }
  function imageReaderMaxImages(settings) {
    return settings.ocrPrefetchPages > 0 && isLikelyImageReaderPage(settings) ? Math.max(settings.ocrMaxImagesPerPage, settings.ocrPrefetchPages * 2 + 1) : settings.ocrMaxImagesPerPage;
  }
  function activeReaderRasterSurfaces(surfaces, settings, userRequested) {
    const margin = readerRasterCaptureMargin(settings, userRequested);
    const active = surfaces.filter((surface) => isNearViewport(surface, margin)).sort((a, b) => visibleElementViewportArea(b) - visibleElementViewportArea(a) || elementViewportDistance(a) - elementViewportDistance(b));
    if (!userRequested && isBookwalkerViewerHost()) return activeBookwalkerReaderRasterSurfaces(active, settings);
    const limit = readerRasterMaxSurfaces(settings, userRequested);
    return active.slice(0, limit);
  }
  function readerRasterCaptureMargin(settings, userRequested) {
    if (userRequested) return settings.ocrPrefetchMargin;
    return Math.min(canvasPrefetchMargin(settings), settings.ocrPrefetchMargin);
  }
  function readerRasterMaxSurfaces(settings, userRequested) {
    const configured = Math.max(1, Math.round(settings.ocrMaxImagesPerPage || 1));
    if (userRequested) return configured;
    return Math.min(configured, 3);
  }
  function imageViewportDistance(image) {
    return elementViewportDistance(image);
  }
  function elementViewportDistance(element) {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return Number.POSITIVE_INFINITY;
    if (rect.bottom < 0) return -rect.bottom;
    if (rect.top > window.innerHeight) return rect.top - window.innerHeight;
    if (rect.right < 0) return -rect.right;
    if (rect.left > window.innerWidth) return rect.left - window.innerWidth;
    return 0;
  }
  function visibleElementViewportArea(element) {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!viewportWidth || !viewportHeight) return 0;
    const rect = element.getBoundingClientRect();
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(viewportWidth, rect.right);
    const bottom = Math.min(viewportHeight, rect.bottom);
    return Math.max(0, right - left) * Math.max(0, bottom - top);
  }
  function readerRasterSurfacesOverlap(first, second) {
    const a = first.getBoundingClientRect();
    const b = second.getBoundingClientRect();
    const intersection = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const smallerArea = Math.min(a.width * a.height, b.width * b.height);
    return smallerArea > 0 && intersection / smallerArea >= 0.72;
  }
  function bookwalkerVisibleCanvasRegion(canvas, rect) {
    if (!isBookwalkerViewerHost()) return void 0;
    const clip = elementVisibleViewportClip(canvas);
    if (!clip || !rect.width || !rect.height) return void 0;
    const left = Math.max(clip.left, rect.left);
    const top = Math.max(clip.top, rect.top);
    const right = Math.min(clip.right, rect.right);
    const bottom = Math.min(clip.bottom, rect.bottom);
    const width = right - left;
    const height = bottom - top;
    if (width < READER_RASTER_REGION_MIN_SIZE_PX || height < READER_RASTER_REGION_MIN_SIZE_PX) return void 0;
    const area = width * height;
    const fullArea = rect.width * rect.height;
    if (area >= fullArea * READER_RASTER_REGION_FULL_PAGE_FRACTION) return void 0;
    return new DOMRect(left, top, width, height);
  }
  function elementVisibleViewportClip(element) {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!viewportWidth || !viewportHeight) return void 0;
    let left = 0;
    let top = 0;
    let right = viewportWidth;
    let bottom = viewportHeight;
    for (let ancestor = element.parentElement; ancestor && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      const clipsX = cssOverflowClips(style.overflowX) || cssOverflowClips(style.overflow);
      const clipsY = cssOverflowClips(style.overflowY) || cssOverflowClips(style.overflow);
      if (!clipsX && !clipsY) continue;
      const rect = ancestor.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (clipsX) {
        left = Math.max(left, rect.left);
        right = Math.min(right, rect.right);
      }
      if (clipsY) {
        top = Math.max(top, rect.top);
        bottom = Math.min(bottom, rect.bottom);
      }
    }
    const width = right - left;
    const height = bottom - top;
    return width > 0 && height > 0 ? new DOMRect(left, top, width, height) : void 0;
  }
  function cssOverflowClips(value) {
    return value === "hidden" || value === "clip" || value === "auto" || value === "scroll";
  }
  function canvasRegionContentKey(surfaceRect, regionRect) {
    const parts = [
      regionRect.left - surfaceRect.left,
      regionRect.top - surfaceRect.top,
      regionRect.width,
      regionRect.height
    ].map((value) => Math.round(value));
    return `:region:${parts.join(",")}`;
  }
  function activeBookwalkerReaderRasterSurfaces(surfaces, settings) {
    const visible = surfaces.filter((surface) => visibleElementViewportArea(surface) > 1);
    if (visible.length <= 1) return visible;
    const spread = visibleBookwalkerSpreadSurfaces(visible);
    if (spread.length) return spread.slice(0, Math.min(2, readerRasterMaxSurfaces(settings, false)));
    const dominant = dominantBookwalkerSurfaceGroup(visible);
    return dominant.slice(0, 1);
  }
  function dominantBookwalkerSurfaceGroup(surfaces) {
    const groups = /* @__PURE__ */ new Map();
    for (const surface of surfaces) {
      const key = bookwalkerSurfaceGroupKey(surface);
      if (!key) continue;
      const group = groups.get(key);
      if (group) group.push(surface);
      else groups.set(key, [surface]);
    }
    let best;
    let bestArea = 0;
    for (const group of groups.values()) {
      const area = group.reduce((sum, surface) => sum + visibleElementViewportArea(surface), 0);
      if (area <= bestArea) continue;
      best = group;
      bestArea = area;
    }
    if (best?.length) {
      return best.slice().sort((a, b) => visibleElementViewportArea(b) - visibleElementViewportArea(a) || elementViewportDistance(a) - elementViewportDistance(b));
    }
    return surfaces.slice(0, 1);
  }
  function bookwalkerSurfaceGroupKey(surface) {
    if (surface instanceof HTMLCanvasElement && canvasReaderHasStableSurface(surface)) return canvasReaderSurfaceId(surface);
    const element = surface instanceof HTMLElement ? surface : surface.parentElement;
    return element?.closest('.canvasRoot.verticalAxis[id], [id^="wideScreen"][id]')?.id ?? "";
  }
  function visibleBookwalkerSpreadSurfaces(surfaces) {
    if (surfaces.length < 2) return [];
    const spread = surfaces.slice().sort((a, b) => visibleElementViewportArea(b) - visibleElementViewportArea(a)).slice(0, 2);
    const [firstSurface, secondSurface] = spread;
    if (!firstSurface || !secondSurface) return [];
    const firstKey = bookwalkerSurfaceGroupKey(firstSurface);
    const secondKey = bookwalkerSurfaceGroupKey(secondSurface);
    if (firstKey && secondKey && firstKey === secondKey) return [];
    const [first, second] = spread.map((surface) => surface.getBoundingClientRect());
    if (!first || !second) return [];
    const smallerHeight = Math.max(1, Math.min(first.height, second.height));
    const verticalOverlap2 = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
    if (verticalOverlap2 / smallerHeight < 0.55) return [];
    const centerYGap = Math.abs(first.top + first.height / 2 - (second.top + second.height / 2));
    if (centerYGap > Math.max(first.height, second.height) * 0.2) return [];
    return first.right <= second.left || second.right <= first.left ? spread : [];
  }
  function captureVideoFrameDataUrl(video) {
    try {
      if (!video.videoWidth || !video.videoHeight || video.readyState < 2) return void 0;
      const canvas = document.createElement("canvas");
      const maxWidth = 960;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return void 0;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.84);
    } catch {
      return void 0;
    }
  }
  function isTwitterHost(hostname = location.hostname) {
    return hostname === "twitter.com" || hostname === "x.com" || hostname.endsWith(".twitter.com") || hostname.endsWith(".x.com");
  }
  function isLikelyPausedVideoThumbnail(video) {
    if (isTwitterHost()) return true;
    if (video.closest(VIDEO_FRAME_THUMBNAIL_CONTAINER_SELECTOR)) return true;
    if (video.closest(VIDEO_FRAME_PLAYER_SELECTOR)) return false;
    if (!video.closest(VIDEO_FRAME_THUMBNAIL_LINK_SELECTOR)) return false;
    return !isPrimaryPlayerSizedVideo(video);
  }
  function isPrimaryPlayerSizedVideo(video) {
    const rect = video.getBoundingClientRect();
    if (rect.width < 280 || rect.height < 160) return false;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!viewportWidth || !viewportHeight) return rect.width >= 480 && rect.height >= 270;
    return rect.width >= viewportWidth * 0.6 || rect.width * rect.height >= viewportWidth * viewportHeight * 0.25;
  }
  function positionVideoFrameImage(frame, rect, video) {
    const content = videoContentBox(rect, video);
    setOcrArtifactPosition(frame, content.left, content.top);
    frame.style.width = `${content.width}px`;
    frame.style.height = `${content.height}px`;
  }
  function positionVideoFrameResumeControl(control, rect, video) {
    const root = videoFrameArtifactRoot(video);
    if (attachVideoFrameResumeControlToSubtitleRail(control, root)) return;
    attachVideoFrameResumeControlFallback(control, root);
    const content = videoContentBox(rect, video);
    setOcrArtifactPosition(control, content.left + content.width - 12, content.top + 12);
  }
  function positionVideoFrameStatus(status, rect, video) {
    const content = videoContentBox(rect, video);
    const maxWidth = Math.max(96, Math.min(Math.max(96, content.width - 24), 320));
    setOcrArtifactPosition(status, Math.max(8, content.left + 12), Math.max(8, content.top + 12));
    status.style.maxWidth = `${maxWidth}px`;
  }
  function positionOcrImageStatus(status, rect) {
    const maxWidth = Math.max(96, Math.min(Math.max(96, rect.width - 24), 320));
    setOcrArtifactPosition(status, Math.max(8, rect.left + 12), Math.max(8, rect.top + 12));
    status.style.maxWidth = `${maxWidth}px`;
  }
  function setOcrArtifactPosition(element, viewportLeft, viewportTop) {
    const offset = ocrArtifactRootOffset(element);
    element.style.left = `${viewportLeft - offset.left}px`;
    element.style.top = `${viewportTop - offset.top}px`;
  }
  function ocrArtifactRootOffset(element) {
    if (element.dataset.yomuOcrFullscreenHosted !== "true") return { left: 0, top: 0 };
    const root = element.parentElement;
    if (!root || root === document.body || root === document.documentElement) return { left: 0, top: 0 };
    const rect = root.getBoundingClientRect();
    return { left: rect.left, top: rect.top };
  }
  function appendOcrArtifactToRoot(element, root) {
    const oldRoot = element.parentElement;
    const fullscreenHosted = root !== document.body;
    if (fullscreenHosted) prepareOcrFullscreenHost(root);
    element.dataset.yomuOcrFullscreenHosted = fullscreenHosted ? "true" : "false";
    if (oldRoot !== root) root.append(element);
    clearOcrFullscreenHostMarker(oldRoot);
  }
  function removeOcrArtifact(element) {
    const oldRoot = element.parentElement;
    element.remove();
    clearOcrFullscreenHostMarker(oldRoot);
  }
  function clearOcrFullscreenHostMarker(root) {
    if (!(root instanceof HTMLElement) || root === document.body) return;
    if (root.querySelector('[data-yomu-ocr-fullscreen-hosted="true"]')) return;
    delete root.dataset.yomuOcrFullscreenHost;
    if (root.dataset.yomuOcrFullscreenHostPosition === "relative") {
      root.style.position = "";
      delete root.dataset.yomuOcrFullscreenHostPosition;
    }
  }
  function prepareOcrFullscreenHost(root) {
    root.dataset.yomuOcrFullscreenHost = "true";
    const position = getComputedStyle(root).position;
    if (position && position !== "static") return;
    root.style.position = "relative";
    root.dataset.yomuOcrFullscreenHostPosition = "relative";
  }
  function videoFrameArtifactRoot(video) {
    return activeVideoFullscreenHost(video) ?? document.body;
  }
  function activeVideoFullscreenHost(video) {
    const active = activeFullscreenElement();
    if (active && (active === document.body || active === document.documentElement)) return document.body;
    if (active instanceof HTMLVideoElement && active === video) return fullscreenVideoArtifactHost(video);
    if (active && active.contains(video)) return active;
    const host = video.closest(VIDEO_FRAME_FULLSCREEN_HOST_SELECTOR);
    if (host && host.isConnected && host !== video && host.contains(video)) return host;
    return youtubeFullscreenHostForOcrVideo(video);
  }
  function fullscreenVideoArtifactHost(video) {
    const host = video.closest(VIDEO_FRAME_FULLSCREEN_HOST_SELECTOR) ?? video.closest(VIDEO_FRAME_PLAYER_SELECTOR);
    if (host && host !== video && host.isConnected && host.contains(video)) return host;
    return youtubeFullscreenHostForOcrVideo(video);
  }
  function youtubeFullscreenHostForOcrVideo(video) {
    if (!isYouTubePageForOcr()) return null;
    const scopedHost = [
      video.closest('[data-yomu-inline-fullscreen="true"]'),
      video.closest(".html5-video-player.ytp-fullscreen"),
      video.closest("#movie_player.ytp-fullscreen"),
      video.closest("ytd-watch-flexy[fullscreen] #movie_player"),
      video.closest("ytd-watch-flexy[fullscreen] ytd-player"),
      video.closest("ytm-player[fullscreen], ytm-player.fullscreen, ytm-player.ytp-fullscreen")
    ].find((element) => Boolean(element && element !== video));
    if (scopedHost) return scopedHost;
    return [
      document.querySelector('[data-yomu-inline-fullscreen="true"]'),
      document.querySelector(".html5-video-player.ytp-fullscreen"),
      document.querySelector("#movie_player.ytp-fullscreen"),
      document.querySelector("ytd-watch-flexy[fullscreen] #movie_player"),
      document.querySelector("ytd-watch-flexy[fullscreen] ytd-player"),
      document.querySelector("ytm-player[fullscreen], ytm-player.fullscreen, ytm-player.ytp-fullscreen")
    ].find((element) => Boolean(element && element !== video && (element.contains(video) || isYouTubeMobileFullscreenHostForOcr(element)))) ?? null;
  }
  function isYouTubePageForOcr() {
    return /(^|\.)youtube\.com$/i.test(location.hostname) || /(^|\.)youtu\.be$/i.test(location.hostname);
  }
  function isYouTubeMobileFullscreenHostForOcr(element) {
    return /^m\.youtube\.com$/i.test(location.hostname) && element.matches("ytm-player[fullscreen], ytm-player.fullscreen, ytm-player.ytp-fullscreen");
  }
  function activeFullscreenElement() {
    const doc = document;
    const element = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? doc.mozFullScreenElement ?? doc.msFullscreenElement ?? null;
    return element instanceof HTMLElement ? element : null;
  }
  function videoFrameStatusTextKey(status) {
    switch (status) {
      case "ready":
        return "ocrPausedFrameReady";
      case "empty":
        return "ocrPausedFrameNoText";
      case "failed":
        return "ocrPausedFrameFailed";
      case "loading":
      default:
        return "ocrPausedFrameScanning";
    }
  }
  function attachVideoFrameResumeControlToSubtitleRail(control, root) {
    const rail = subtitleRailForOcrRoot(root);
    if (!rail?.isConnected) return false;
    const oldParent = control.parentElement;
    const oldRoot = subtitlePlayerRoot(control);
    control.classList.remove("jpdb-ocr-video-frame-resume-fallback");
    control.dataset.yomuOcrFullscreenHosted = "false";
    control.style.left = "";
    control.style.top = "";
    const panelButton = rail.querySelector(".jpdb-subtitle-panel-toggle");
    if (control.parentElement !== rail) rail.insertBefore(control, panelButton ?? null);
    clearOcrFullscreenHostMarker(oldParent);
    updateSubtitleRailResumeState(oldRoot);
    updateSubtitleRailResumeState(subtitlePlayerRoot(control));
    return true;
  }
  function attachVideoFrameResumeControlFallback(control, root) {
    const oldRoot = subtitlePlayerRoot(control);
    appendOcrArtifactToRoot(control, root);
    control.classList.add("jpdb-ocr-video-frame-resume-fallback");
    updateSubtitleRailResumeState(oldRoot);
  }
  function removeVideoFrameResumeControl(control) {
    const root = subtitlePlayerRoot(control);
    removeOcrArtifact(control);
    updateSubtitleRailResumeState(root);
  }
  function subtitleRailForOcrRoot(root) {
    const rails = Array.from(document.querySelectorAll('.jpdb-subtitle-player[data-jpdb-reader-root="true"] .jpdb-subtitle-rail'));
    if (root === document.body) return rails.find((rail) => rail.isConnected) ?? null;
    return rails.find((rail) => rail.isConnected && root.contains(rail)) ?? null;
  }
  function subtitlePlayerRoot(control) {
    return control.closest(".jpdb-subtitle-player");
  }
  function updateSubtitleRailResumeState(root) {
    if (!root) return;
    root.classList.toggle("jpdb-ocr-video-frame-resume-active", Boolean(root.querySelector(".jpdb-ocr-video-frame-resume")));
  }
  function playVideoIcon() {
    return `<svg class="jpdb-ocr-video-frame-resume-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5v14l11-7-11-7Z"></path></svg>`;
  }
  function videoContentBox(rect, video) {
    const intrinsicWidth = video.videoWidth;
    const intrinsicHeight = video.videoHeight;
    if (!intrinsicWidth || !intrinsicHeight || !rect.width || !rect.height) return rect;
    const style = getComputedStyle(video);
    const object = fittedObjectSize(videoObjectFit(style.objectFit), intrinsicWidth, intrinsicHeight, rect.width, rect.height);
    const offset = objectPositionOffset(style.objectPosition || "50% 50%", rect.width - object.width, rect.height - object.height);
    return {
      left: rect.left + offset.x,
      top: rect.top + offset.y,
      width: object.width,
      height: object.height
    };
  }
  function videoObjectFit(value) {
    switch (value) {
      case "contain":
      case "cover":
      case "none":
      case "scale-down":
        return value;
      case "fill":
      default:
        return "contain";
    }
  }
  function ocrResultTextKey(result) {
    return result?.lines.map((line) => line.text).join("\n") ?? "";
  }
  function readerRasterSurfaceSnapshotKey(surface) {
    return surface instanceof HTMLCanvasElement ? canvasSurfaceSnapshotKey(surface) : backgroundSurfaceCacheKey(surface);
  }
  function canvasFrameContentKey(contentKey, canvas) {
    return isWideBookwalkerSpreadCanvas(canvas) ? `${contentKey}:bw-spread-v2` : contentKey;
  }
  function bookwalkerCanvasContentKey(contentToken, regionKey) {
    if (!isBookwalkerViewerHost() || !contentToken) return void 0;
    return `bw:${contentToken}${regionKey}`;
  }
  function canvasFrameOcrAttemptKey(canvas, snapshotKey, contentToken) {
    return `canvas:${snapshotKey}|${contentToken || canvasStablePageContentToken(canvas)}`;
  }
  function isWideBookwalkerSpreadCanvas(canvas) {
    return isBookwalkerViewerHost() && !isBookwalkerContinuousScrollCanvas(canvas) && canvas.width / Math.max(1, canvas.height) >= BOOKWALKER_SPREAD_MIN_ASPECT;
  }
  function backgroundSurfaceCacheKey(surface) {
    const rect = surface.getBoundingClientRect();
    return [
      surface.getAttribute("data-page-index") ?? "",
      backgroundImageReaderUrl(surface) ?? "",
      Math.round(rect.width),
      Math.round(rect.height)
    ].join("|");
  }
  const cleanMirrorImageCache = /* @__PURE__ */ new Map();
  async function loadCleanMirrorImage(url) {
    if (!url || url.startsWith("data:") || url.startsWith("blob:")) return void 0;
    const cacheKey = canonicalBookwalkerAssetUrl(url);
    const cached = cleanMirrorImageCache.get(cacheKey);
    if (cached) return cached;
    const pending = fetchCleanMirrorImage(url).then((image) => {
      if (!image) {
        cleanMirrorImageCache.delete(cacheKey);
        return void 0;
      }
      cleanMirrorImageCache.set(cacheKey, image);
      trimCleanMirrorImageCache();
      return image;
    }).catch((error) => {
      cleanMirrorImageCache.delete(cacheKey);
      throw error;
    });
    cleanMirrorImageCache.set(cacheKey, pending);
    return pending;
  }
  async function fetchCleanMirrorImage(url) {
    const resource = mirrorImageResourceLabel(url);
    let blob;
    try {
      const resolvedUrl = await bookwalkerAssetResolver.resolve(url);
      try {
        blob = await requestBlob(resolvedUrl, MIRROR_IMAGE_FETCH_TIMEOUT_MS);
      } catch (error) {
        if (!isBookwalkerAuthorizationFailure(error)) throw error;
        const refreshedUrl = await bookwalkerAssetResolver.refresh(url);
        if (!refreshedUrl || refreshedUrl === resolvedUrl) throw error;
        blob = await requestBlob(refreshedUrl, MIRROR_IMAGE_FETCH_TIMEOUT_MS);
      }
    } catch (error) {
      log.warnOnce(`mirror-image-fetch:${resource}`, "BookWalker mirror image fetch failed", { resource }, error);
      throw error;
    }
    const objectUrl = URL.createObjectURL(blob);
    try {
      return await loadImage(objectUrl, MIRROR_IMAGE_FETCH_TIMEOUT_MS);
    } catch (error) {
      log.warnOnce(
        `mirror-image-decode:${resource}`,
        "BookWalker mirror image decode failed",
        { bytes: blob.size, resource, type: blob.type },
        error
      );
      throw error;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
  function isBookwalkerAuthorizationFailure(error) {
    return error instanceof Error && /Image fetch returned (401|403)\./.test(error.message);
  }
  function mirrorImageResourceLabel(url) {
    try {
      const parsed = new URL(url, location.href);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return url.split(/[?#]/, 1)[0] ?? "";
    }
  }
  function trimCleanMirrorImageCache() {
    while (cleanMirrorImageCache.size > MAX_CLEAN_MIRROR_IMAGE_CACHE_ITEMS) {
      const oldest = cleanMirrorImageCache.keys().next().value;
      if (!oldest) return;
      cleanMirrorImageCache.delete(oldest);
    }
  }
  function imageSummary(image) {
    return {
      host: safeHost(image.currentSrc || image.src),
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      altLength: image.alt?.length ?? 0,
      frame: image.dataset.yomuCanvasFrame === "true" ? "canvas" : image.dataset.yomuBackgroundFrame === "true" ? "background" : "inline",
      className: image.className,
      parentId: image.parentElement?.id || ""
    };
  }
  function inlineProviderLabel(settings) {
    return configuredOcrProviderLabel(settings) ?? settings.ocrProvider;
  }
  function configuredOcrProviderLabel(settings) {
    return OCR_PROVIDER_LABELS[settings.ocrProvider]?.(settings) ?? null;
  }
  function localServiceProviderLabel(settings) {
    return `local-service:${ocrEngineLabel(settings)}`;
  }
  function ocrEngineLabel(settings) {
    return settings.ocrEngine || "auto";
  }
  function isLocalOcrConnectionError(error) {
    if (isLocalOcrUnavailableError(error)) return true;
    if (!(error instanceof Error)) return true;
    return error.name === "TypeError" || error.name === "AbortError" || /network|failed to fetch|load failed|cors|blocked|timed out|timeout|request failed/i.test(error.message);
  }
  function isLocalOcrUnavailableError(error) {
    return error instanceof LocalOcrUnavailableError;
  }
  function safeHost(value) {
    try {
      return new URL(value, location.href).host;
    } catch {
      return "inline-or-invalid";
    }
  }
  let sandboxCompanions = {};
  function registerYomuCompanion(key, value) {
    writeYomuCompanions({
      ...yomuCompanions(),
      [key]: value
    });
  }
  function yomuCompanions() {
    return readYomuCompanions(globalThis) ?? sandboxCompanions ?? (typeof window === "undefined" ? void 0 : readYomuCompanions(window)) ?? {};
  }
  function writeYomuCompanions(value) {
    sandboxCompanions = value;
    writeYomuCompanionsTarget(globalThis, value);
    if (typeof window !== "undefined" && window !== globalThis) {
      const pageValue = pageCompartmentRegistryValue(value);
      if (pageValue) writeYomuCompanionsTarget(window, pageValue);
    }
  }
  function pageCompartmentRegistryValue(value) {
    const cloneInto = globalThis.cloneInto;
    if (typeof cloneInto !== "function") return value;
    try {
      return cloneInto(value, window, { cloneFunctions: true, wrapReflectors: true });
    } catch {
      return void 0;
    }
  }
  function writeYomuCompanionsTarget(target, value) {
    if (!target || typeof target !== "object" && typeof target !== "function") return false;
    const writable = target;
    try {
      writable.__yomuCompanions = value;
      return true;
    } catch {
    }
    try {
      Object.defineProperty(writable, "__yomuCompanions", {
        configurable: true,
        enumerable: false,
        writable: true,
        value
      });
      return true;
    } catch {
      return false;
    }
  }
  function readYomuCompanions(target) {
    if (!target || typeof target !== "object" && typeof target !== "function") return void 0;
    try {
      return target.__yomuCompanions;
    } catch {
      return void 0;
    }
  }
  installCanvasMirrorRecorder();
  registerYomuCompanion("ocr", {
    ImageOcrController,
    normalizeOcrRenderedText
  });
})();
