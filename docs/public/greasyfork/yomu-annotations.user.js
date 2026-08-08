(function() {
"use strict";
function scopedDocument(scope = {}) {
  if (scope.document) return scope.document;
  return typeof document === "undefined" ? null : document;
}
function isPageDormant(scope = {}) {
  const owner = scopedDocument(scope);
  if (!owner?.defaultView) return false;
  return owner.visibilityState === "hidden";
}
function onPageActivityChange(listener, scope = {}) {
  const owner = scopedDocument(scope);
  if (!owner) return () => void 0;
  const handler = () => listener(owner.visibilityState === "hidden");
  owner.addEventListener("visibilitychange", handler, { signal: scope.signal });
  return () => owner.removeEventListener("visibilitychange", handler);
}
function isConnectedTarget(target) {
  return target?.isConnected === true;
}
class ParkableObserver {
  // One entry per target: every call site observes a given node exactly one
  // way, and keeping the latest init makes re-attachment deterministic.
  targets = /* @__PURE__ */ new Map();
  observer;
  reconcile;
  unsubscribe;
  parked;
  disposed = false;
  constructor(observer, options = {}) {
  this.observer = observer;
  this.reconcile = options.reconcile;
  this.parked = isPageDormant(options);
  this.unsubscribe = onPageActivityChange((dormant) => {
    if (dormant) this.park();
    else this.wake();
  }, options);
  }
  observe(target, init) {
  if (this.disposed) return;
  this.targets.set(target, { init, wasConnected: isConnectedTarget(target) });
  if (!this.parked) this.observer?.observe(target, init);
  }
  /** Native semantics: forget every target, not just detach from them. */
  disconnect() {
  this.targets.clear();
  this.drain();
  this.observer?.disconnect();
  }
  /** Detach for good — drops the visibility subscription with the targets. */
  dispose() {
  this.disposed = true;
  this.unsubscribe();
  this.disconnect();
  }
  get dormant() {
  return this.parked;
  }
  park() {
  if (this.parked) return;
  this.parked = true;
  this.forgetDiscardedTargets();
  this.drain();
  this.observer?.disconnect();
  }
  wake() {
  if (!this.parked) return;
  this.parked = false;
  this.forgetDiscardedTargets();
  this.targets.forEach((entry, target) => this.observer?.observe(target, entry.init));
  this.reconcile?.();
  }
  // A node the page threw away must not come back with us. The observers
  // answer for a detached target rather than refusing it — a ResizeObserver
  // reports one at zero width, which reads downstream as a reflow to heal —
  // and remembering it pins the whole dead subtree, an edge the native
  // observers never create. Only a target that WAS in the document counts as
  // discarded: watching a node that was offscreen from the start is a
  // deliberate thing to ask for, so it survives the park.
  forgetDiscardedTargets() {
  this.targets.forEach((entry, target) => {
    if (entry.wasConnected && !isConnectedTarget(target)) this.targets.delete(target);
  });
  }
  drain() {
  this.observer?.takeRecords?.();
  }
}
function parkableMutationObserver(callback, options = {}) {
  const owner = scopedDocument(options);
  const Observer = owner?.defaultView?.MutationObserver;
  if (!Observer) return null;
  const observer = new Observer(callback);
  return new ParkableObserver(observer, options);
}
function setImportantStyleIfChanged(element, property, value) {
  if (element.style.getPropertyValue(property) === value && element.style.getPropertyPriority(property) === "important") return;
  element.style.setProperty(property, value, "important");
}
const CSS_PIXEL_SIGNIFICANT_DIGITS = 6;
const CSS_PIXEL_MINIMUM = 1e-6;
function stableCssPixels(value) {
  if (!Number.isFinite(value) || Math.abs(value) < CSS_PIXEL_MINIMUM) return "0px";
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const decimalPlaces = Math.max(0, Math.min(12, CSS_PIXEL_SIGNIFICANT_DIGITS - magnitude - 1));
  const rounded = Number(value.toFixed(decimalPlaces));
  return `${Object.is(rounded, -0) ? 0 : rounded}px`;
}
const overlays = /* @__PURE__ */ new WeakMap();
const ownerRecords = /* @__PURE__ */ new WeakMap();
const PROJECTED_READING_ATTRIBUTE = "data-yomu-projected-reading";
const PROJECTION_GRACE_MAX_AGE_MS = 250;
const PROJECTED_READING_MIN_SCALE_X = 0.55;
function syncProjectedReadings(owner, projections) {
  const document2 = owner.ownerDocument;
  const overlay = documentOverlay(document2);
  pruneDisconnectedRecords(overlay);
  const records = ownerRecords.get(owner) ?? /* @__PURE__ */ new Map();
  const currentSources = new Set(projections.map((projection) => projection.source));
  const context = {
  overlay,
  anchorPaint: /* @__PURE__ */ new Map(),
  elementPaint: /* @__PURE__ */ new Map(),
  occludingPaint: /* @__PURE__ */ new Map(),
  projectionLayers: /* @__PURE__ */ new Map(),
  layerOrigins: /* @__PURE__ */ new Map(),
  viewportCoordinateSafety: /* @__PURE__ */ new Map(),
  styleReads: /* @__PURE__ */ new Map()
  };
  for (const [source, record] of records) {
  if (currentSources.has(source)) continue;
  removeRecord(record, overlay);
  records.delete(source);
  }
  const paints = [];
  for (const projection of projections) {
  let record = records.get(projection.source);
  if (!record) {
    record = {
      owner,
      source: projection.source,
      anchor: projection.anchor,
      clone: createProjectedReading(projection.source, overlay.layer),
      measure: projection.measure,
      footprintWidth: 0,
      footprintHeight: 0
    };
    records.set(projection.source, record);
    overlay.records.add(record);
    trackProjectionAnchor(record, overlay);
  } else if (record.anchor !== projection.anchor) {
    untrackProjectionAnchor(record, overlay);
    record.anchor = projection.anchor;
    record.scrollContextEpoch = void 0;
    record.cachedTopmost = void 0;
    record.cachedOcclusionEpoch = void 0;
    record.cachedOcclusionRect = void 0;
    trackProjectionAnchor(record, overlay);
  }
  record.measure = projection.measure;
  refreshProjectionAnchorRoot(record.anchor, overlay);
  syncProjectedReadingStyle(record);
  adoptProjectionLayer(record, context);
  paints.push(readProjectedReadingPaint(record, projection.rect, context));
  }
  applyProjectionPaints(paints, context);
  if (records.size) ownerRecords.set(owner, records);
  else ownerRecords.delete(owner);
  pruneDisconnectedRecords(overlay);
  overlay.occlusionEpoch += 1;
  scheduleProjectionRefresh(document2, overlay);
}
function clearProjectedReadings(owner) {
  const records = ownerRecords.get(owner);
  if (!records) return;
  const overlay = overlays.get(owner.ownerDocument);
  for (const record of records.values()) {
  if (overlay) removeRecord(record, overlay);
  else record.clone.remove();
  }
  ownerRecords.delete(owner);
  resetOcclusionBudgetIfEmpty(overlay);
}
function clearProjectedReadingsWithin(root) {
  const document2 = root instanceof Document ? root : root.ownerDocument;
  const overlay = document2 ? overlays.get(document2) : void 0;
  if (!overlay) return 0;
  let cleared = 0;
  for (const record of [...overlay.records]) {
  if (!projectionBelongsToRoot(record, root)) continue;
  unlinkRecord(record, overlay);
  cleared += 1;
  }
  resetOcclusionBudgetIfEmpty(overlay);
  return cleared;
}
function pruneProjectedReadings(document2) {
  const overlay = overlays.get(document2);
  if (overlay) pruneDisconnectedRecords(overlay);
}
function projectedReadingWordAtPoint(document2, x, y, accepts = () => true) {
  const overlay = overlays.get(document2);
  if (!overlay) return null;
  let best = null;
  for (const record of overlay.records) {
  const rect = projectedReadingPaintedRect(record);
  if (!rect || !pointInsideRect(rect, x, y)) continue;
  const word = projectedReadingOwnerWord(record);
  if (!word || !accepts(word)) continue;
  const distance = Math.abs(x - (rect.left + rect.width / 2));
  if (!best || distance < best.distance) best = { word, distance };
  }
  return best?.word ?? null;
}
function projectedReadingPaintedRect(record) {
  const { clone } = record;
  if (!clone.isConnected) return null;
  const rect = clone.getBoundingClientRect();
  return validRect(rect) ? rect : null;
}
function projectedReadingOwnerWord(record) {
  const word = record.source.closest(".jpdb-reader-word");
  return word?.isConnected ? word : null;
}
function pointInsideRect(rect, x, y) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}
function documentOverlay(document2) {
  const existing = overlays.get(document2);
  if (existing) {
  const host = document2.documentElement ?? document2.body;
  if (!existing.layer.isConnected) host.append(existing.layer);
  if (!existing.documentLayer.isConnected) host.append(existing.documentLayer);
  return existing;
  }
  const layer = createProjectionLayer(document2, "jpdb-reader-detached-reading-overlay");
  const documentLayer = createProjectionLayer(
  document2,
  "jpdb-reader-detached-reading-overlay jpdb-reader-detached-reading-document-layer"
  );
  const overlay = {
  layer,
  documentLayer,
  scrollLayers: /* @__PURE__ */ new Map(),
  scrolledContainers: /* @__PURE__ */ new WeakSet(),
  records: /* @__PURE__ */ new Set(),
  anchorRecords: /* @__PURE__ */ new Map(),
  anchorRoots: /* @__PURE__ */ new Map(),
  anchorContainers: /* @__PURE__ */ new Map(),
  intersectingAnchors: /* @__PURE__ */ new Set(),
  intersectionObserver: null,
  refreshScheduler: null,
  framelessRefreshPending: false,
  observer: null,
  shadowRootReferences: /* @__PURE__ */ new Map(),
  occlusionEpoch: 0,
  scrollContextEpoch: 0,
  hitTestBudgetRemaining: 12,
  refreshing: false,
  graceRefreshNeeded: false,
  occlusionRefreshNeeded: false,
  scheduleRefresh: () => scheduleProjectionRefresh(document2, overlay),
  scheduleScrollRefresh: (event) => {
    if (scrollMovedNoProjectedReading(event, overlay)) return;
    if (firstIndependentContainerScroll(event, overlay)) {
      overlay.scheduleTopologyRefresh();
      return;
    }
    scheduleProjectionRefresh(document2, overlay);
  },
  scheduleTopologyRefresh: () => {
    overlay.rootsDirty = true;
    overlay.occlusionEpoch += 1;
    overlay.scrollContextEpoch += 1;
    scheduleProjectionRefresh(document2, overlay);
  },
  rootsDirty: false
  };
  overlays.set(document2, overlay);
  overlay.intersectionObserver = observeProjectionIntersections(document2, overlay);
  document2.addEventListener("scroll", overlay.scheduleScrollRefresh, { capture: true, passive: true });
  document2.addEventListener("pointerover", overlay.scheduleRefresh, { capture: true, passive: true });
  document2.addEventListener("pointerout", overlay.scheduleRefresh, { capture: true, passive: true });
  document2.addEventListener("focusin", overlay.scheduleRefresh, { capture: true, passive: true });
  document2.addEventListener("focusout", overlay.scheduleRefresh, { capture: true, passive: true });
  const viewport = document2.defaultView;
  viewport?.addEventListener("resize", overlay.scheduleTopologyRefresh, { passive: true });
  viewport?.addEventListener("orientationchange", overlay.scheduleTopologyRefresh, { passive: true });
  viewport?.visualViewport?.addEventListener("scroll", overlay.scheduleRefresh, { passive: true });
  viewport?.visualViewport?.addEventListener("resize", overlay.scheduleRefresh, { passive: true });
  overlay.observer = observeProjectionEnvironment(document2, overlay);
  return overlay;
}
function createProjectionLayer(document2, className, parent = document2.documentElement ?? document2.body, before = null) {
  const layer = document2.createElement("div");
  layer.className = className;
  layer.setAttribute("aria-hidden", "true");
  layer.setAttribute("data-jpdb-reader-surface-ignore", "true");
  parent.insertBefore(layer, before);
  return layer;
}
function ensureScrollProjectionLayer(host, flowAnchored, overlay) {
  const existing = overlay.scrollLayers.get(host);
  if (existing) {
  if (existing.layer.parentNode !== host) {
    host.insertBefore(existing.layer, host.lastElementChild);
  } else if (existing.layer === host.lastElementChild && existing.layer.previousElementSibling) {
    host.insertBefore(existing.layer, existing.layer.previousElementSibling);
  }
  configureScrollProjectionLayer(existing.layer, flowAnchored);
  existing.flowAnchored = flowAnchored;
  return existing;
  }
  const layer = createProjectionLayer(
  host.ownerDocument,
  "jpdb-reader-detached-reading-overlay jpdb-reader-detached-reading-scroll-layer",
  host,
  host.lastElementChild
  );
  layer.style.cssText = "all:initial!important;width:0!important;height:0!important;pointer-events:none!important;z-index:2147482000!important;contain:layout style!important";
  configureScrollProjectionLayer(layer, flowAnchored);
  const created = {
  layer,
  records: /* @__PURE__ */ new Set(),
  flowAnchored
  };
  overlay.scrollLayers.set(host, created);
  return created;
}
function configureScrollProjectionLayer(layer, flowAnchored) {
  const values = {
  position: flowAnchored ? "relative" : "absolute",
  inset: "auto",
  top: flowAnchored ? "auto" : "0",
  left: flowAnchored ? "auto" : "0",
  float: flowAnchored ? "left" : "none"
  };
  for (const [property, value] of Object.entries(values)) {
  setImportantStyleIfChanged(layer, property, value);
  }
}
function releaseScrollProjectionRecord(record, overlay) {
  const host = record.layerTarget?.mode === "scroll" ? record.layerTarget.scrollLayerHost : null;
  if (!host) return;
  const scrollLayer = overlay.scrollLayers.get(host);
  scrollLayer?.records.delete(record);
  if (scrollLayer && scrollLayer.records.size === 0) {
  scrollLayer.layer.remove();
  overlay.scrollLayers.delete(host);
  }
}
function createProjectedReading(source, layer) {
  const clone = source.ownerDocument.createElement("span");
  clone.className = "jpdb-reader-furi jpdb-reader-detached-furi jpdb-reader-projected-furi";
  clone.setAttribute("aria-hidden", "true");
  clone.setAttribute(PROJECTED_READING_ATTRIBUTE, "true");
  clone.textContent = source.textContent ?? "";
  clone.style.cssText = "all:initial!important;display:block!important;width:max-content!important;line-height:1!important;white-space:nowrap!important;word-break:keep-all!important;-webkit-text-fill-color:currentColor!important;pointer-events:none!important;user-select:none!important;-webkit-user-select:none!important";
  layer.append(clone);
  return clone;
}
function syncProjectedReadingStyle(record) {
  const { clone, source } = record;
  const sourceStyle = safeComputedStyle(source);
  const base = source.closest(".jpdb-reader-word") ?? source;
  const baseStyle = safeComputedStyle(base);
  const text = source.textContent ?? "";
  if (clone.textContent !== text) clone.textContent = text;
  const expression = base.dataset.expression ?? base.dataset.surface ?? "";
  if (clone.dataset.yomuExpression !== expression) clone.dataset.yomuExpression = expression;
  setImportantStyleIfChanged(clone, "font-family", sourceStyle.fontFamily || baseStyle.fontFamily);
  setImportantStyleIfChanged(clone, "font-size", sourceStyle.fontSize || "10px");
  setImportantStyleIfChanged(clone, "font-style", sourceStyle.fontStyle || baseStyle.fontStyle);
  setImportantStyleIfChanged(clone, "font-weight", sourceStyle.fontWeight || "700");
  setImportantStyleIfChanged(clone, "letter-spacing", sourceStyle.letterSpacing || baseStyle.letterSpacing);
  setImportantStyleIfChanged(clone, "color", baseStyle.color || sourceStyle.color || "currentColor");
  setImportantStyleIfChanged(clone, "text-shadow", baseStyle.textShadow || "none");
  const key = `${clone.textContent ?? ""}\0${clone.style.getPropertyValue("font-size")}`;
  if (record.naturalReadingKey !== key) {
  record.naturalReadingKey = key;
  record.naturalReadingWidth = void 0;
  }
}
function readProjectedReadingPaint(record, rect, context) {
  const valid = rect && validRect(rect) ? rect : null;
  const anchorVisible = context ? visibleAnchor(record.anchor, context) : anchorIsPainted(record.anchor);
  const sourceAllowed = sourceAllowsProjectedReading(record);
  let effectiveRect = valid;
  let visible = false;
  if (valid && sourceAllowed && anchorVisible) {
  record.lastGoodRect = valid;
  record.lastGoodAt = Date.now();
  record.lastGoodOrigin = context ? projectionPaintOrigin(record, context) : null;
  record.graceFramesRemaining = 3;
  let topmost;
  const overlay = context?.overlay;
  const occlusionGeometryMatches = sameProjectionRect(record.cachedOcclusionRect, valid);
  if (overlay && occlusionGeometryMatches && record.cachedOcclusionEpoch === overlay.occlusionEpoch && record.cachedTopmost !== void 0) {
    topmost = record.cachedTopmost;
  } else if (overlay && overlay.hitTestBudgetRemaining <= 0) {
    topmost = record.cachedTopmost ?? false;
    overlay.occlusionRefreshNeeded = true;
  } else {
    topmost = projectionIsTopmost(record, valid, context?.occludingPaint);
    if (overlay) {
      overlay.hitTestBudgetRemaining -= 1;
      record.cachedOcclusionEpoch = overlay.occlusionEpoch;
      record.cachedTopmost = topmost;
      record.cachedOcclusionRect = rectFromEdges(valid.left, valid.top, valid.right, valid.bottom);
    }
  }
  visible = topmost;
  } else if (!valid && record.lastGoodRect && record.graceFramesRemaining && record.graceFramesRemaining > 0 && sourceAllowed && anchorVisible && Date.now() - (record.lastGoodAt ?? 0) <= PROJECTION_GRACE_MAX_AGE_MS) {
  record.graceFramesRemaining -= 1;
  effectiveRect = graceProjectionRect(record, context);
  visible = record.cachedTopmost ?? false;
  if (context) context.overlay.graceRefreshNeeded = true;
  }
  return {
  record,
  rect: effectiveRect,
  visible
  };
}
function applyProjectionPaints(paints, context) {
  resolveProjectedReadingCrowding(paints);
  paints.forEach((paint) => applyProjectedReadingPaint(paint, context));
}
function applyProjectedReadingPaint(paint, context) {
  if (!paint.visible || !paint.rect) {
  setImportantStyleIfChanged(paint.record.clone, "display", "none");
  return;
  }
  positionProjectedReading(paint.record, paint.rect, context, paint.layout);
}
function positionProjectedReading(record, rect, context, layout) {
  const { clone } = record;
  const origin = context ? projectionPaintOrigin(record, context) : { x: 0, y: 0 };
  const centre = layout?.centre ?? rect.left + rect.width / 2;
  const scaleX = layout?.scaleX ?? 1;
  record.readingScaleX = scaleX;
  setImportantStyleIfChanged(clone, "display", "block");
  setImportantStyleIfChanged(clone, "left", stableCssPixels(centre + origin.x));
  setImportantStyleIfChanged(clone, "top", stableCssPixels(rect.top + origin.y));
  setImportantStyleIfChanged(clone, "right", "auto");
  setImportantStyleIfChanged(clone, "bottom", "auto");
  setImportantStyleIfChanged(clone, "transform-origin", "center");
  setImportantStyleIfChanged(
  clone,
  "transform",
  scaleX < 1 ? `translate(-50%, -100%) scaleX(${scaleX})` : "translate(-50%, -100%)"
  );
  setDatasetIfChanged(clone, "yomuSourceLeft", String(rect.left));
  setDatasetIfChanged(clone, "yomuSourceTop", String(rect.top));
  setDatasetIfChanged(clone, "yomuSourceWidth", String(rect.width));
  setDatasetIfChanged(clone, "yomuSourceHeight", String(rect.height));
}
function setDatasetIfChanged(element, key, value) {
  if (element.dataset[key] === value) return;
  element.dataset[key] = value;
}
function resolveProjectedReadingCrowding(paints) {
  const placed = paints.filter(isPlacedProjectionPaint);
  if (placed.length < 2) return;
  for (const lane of projectedReadingLanes(placed)) fitProjectedReadingLane(lane);
}
function isPlacedProjectionPaint(paint) {
  return paint.visible && paint.rect !== null;
}
function projectedReadingLanes(paints) {
  const sorted = [...paints].sort((first, second) => first.rect.top - second.rect.top || first.rect.left - second.rect.left);
  const lanes = [];
  let lane = null;
  let laneTop = 0;
  for (const paint of sorted) {
  if (!lane || Math.abs(paint.rect.top - laneTop) > Math.max(1, paint.rect.height / 2)) {
    lane = [];
    lanes.push(lane);
    laneTop = paint.rect.top;
  }
  lane.push(paint);
  }
  return lanes;
}
function fitProjectedReadingLane(lane) {
  if (lane.length < 2) return;
  lane.sort((first, second) => readingAnchorCentre(first) - readingAnchorCentre(second));
  for (const [index, paint] of lane.entries()) {
  const previous = lane[index - 1]?.rect;
  const next = lane[index + 1]?.rect;
  paint.layout = fitReadingBetween(
    readingAnchorCentre(paint),
    naturalReadingWidth(paint.record),
    previous ? (previous.right + paint.rect.left) / 2 : Number.NEGATIVE_INFINITY,
    next ? (paint.rect.right + next.left) / 2 : Number.POSITIVE_INFINITY
  );
  }
}
function readingAnchorCentre(paint) {
  return paint.rect.left + paint.rect.width / 2;
}
function fitReadingBetween(centre, width, left, right) {
  if (!(width > 0)) return { centre, scaleX: 1 };
  const available = right - left;
  const scaleX = available >= width ? 1 : Math.max(PROJECTED_READING_MIN_SCALE_X, available / width);
  const painted = width * scaleX;
  if (painted > available) return { centre, scaleX };
  if (centre - painted / 2 < left) return { centre: left + painted / 2, scaleX };
  if (centre + painted / 2 > right) return { centre: right - painted / 2, scaleX };
  return { centre, scaleX };
}
function naturalReadingWidth(record) {
  if (record.naturalReadingWidth) return record.naturalReadingWidth;
  const measured = record.clone.getBoundingClientRect().width;
  const scale = record.readingScaleX ?? 1;
  if (measured > 0 && scale > 0) {
  record.naturalReadingWidth = measured / scale;
  return record.naturalReadingWidth;
  }
  const fontSize = Number.parseFloat(safeComputedStyle(record.clone).fontSize);
  return Number.isFinite(fontSize) ? fontSize * (record.clone.textContent ?? "").length : 0;
}
function projectionPaintOrigin(record, context) {
  const layer = record.clone.parentElement;
  if (!layer) return { x: 0, y: 0 };
  const cached = context.layerOrigins.get(layer);
  if (cached) return cached;
  const rect = layer.getBoundingClientRect();
  const origin = { x: -rect.left, y: -rect.top };
  context.layerOrigins.set(layer, origin);
  return origin;
}
function graceProjectionRect(record, context) {
  const stored = record.lastGoodRect ?? null;
  const captured = record.lastGoodOrigin;
  if (!stored || !captured || !context) return stored;
  const origin = projectionPaintOrigin(record, context);
  const shiftX = captured.x - origin.x;
  const shiftY = captured.y - origin.y;
  if (shiftX === 0 && shiftY === 0) return stored;
  return rectFromEdges(
  stored.left + shiftX,
  stored.top + shiftY,
  stored.right + shiftX,
  stored.bottom + shiftY
  );
}
function adoptProjectionLayer(record, context) {
  const { overlay } = context;
  const target = projectionLayerTargetForRecord(record, context);
  const previous = record.layerTarget;
  const sameScrollTarget = target.mode !== "scroll" || target.scrollLayerHost === previous?.scrollLayerHost && Boolean(target.flowScrollContainer) === Boolean(previous?.flowScrollContainer);
  const sameTarget = target.mode === previous?.mode && sameScrollTarget;
  record.scrollContextEpoch = overlay.scrollContextEpoch;
  if (sameTarget && projectionLayerIsIntact(record, target, overlay)) return;
  if (!sameTarget) releaseScrollProjectionRecord(record, overlay);
  let layer = overlay.layer;
  if (target.mode === "document") {
  layer = overlay.documentLayer;
  } else if (target.mode === "scroll" && target.scrollLayerHost) {
  const scrollLayer = ensureScrollProjectionLayer(
    target.scrollLayerHost,
    Boolean(target.flowScrollContainer),
    overlay
  );
  scrollLayer.records.add(record);
  layer = scrollLayer.layer;
  }
  if (record.clone.parentElement !== layer) layer.append(record.clone);
  record.layerTarget = target;
  record.clone.style.setProperty("position", target.mode === "viewport" ? "fixed" : "absolute", "important");
  record.clone.classList.toggle("jpdb-reader-projected-furi-document", target.mode === "document");
  record.clone.classList.toggle("jpdb-reader-projected-furi-scroll", target.mode === "scroll");
}
function projectionLayerIsIntact(record, target, overlay) {
  const { clone } = record;
  if (target.mode === "viewport") return clone.parentElement === overlay.layer;
  if (target.mode === "document") return clone.parentElement === overlay.documentLayer;
  const host = target.scrollLayerHost;
  const scrollLayer = host ? overlay.scrollLayers.get(host) : void 0;
  return Boolean(scrollLayer && scrollLayer.layer.parentNode === host && (scrollLayer.layer !== host?.lastElementChild || !scrollLayer.layer.previousElementSibling) && scrollLayer.flowAnchored === Boolean(target.flowScrollContainer) && clone.parentElement === scrollLayer.layer && scrollLayer.records.has(record));
}
function projectionLayerTargetForRecord(record, context) {
  const { overlay } = context;
  if (record.scrollContextEpoch === overlay.scrollContextEpoch && record.layerTarget) return record.layerTarget;
  return projectionLayerTarget(record.anchor, context);
}
function projectionLayerTarget(element, context) {
  const { projectionLayers: cache, styleReads: styles } = context;
  const cached = cache.get(element);
  if (cached) return cached;
  const document2 = element.ownerDocument;
  const view = document2.defaultView;
  if (!view) return { mode: "viewport" };
  let current = element;
  let positionedHost = null;
  let target = { mode: "viewport" };
  while (current) {
  if (current === document2.documentElement || current === document2.body) {
    target = { mode: "document" };
    break;
  }
  const style = memoizedComputedStyle(current, styles);
  const coordinateSpaceIsSafe = elementCoordinateSpacePreservesCssPixels(style);
  const clipsReading = elementClipsDetachedReading(style);
  const scrollsIndependently = elementScrollsIndependently(current, style, context.overlay);
  if (!coordinateSpaceIsSafe || clipsReading && !scrollsIndependently) positionedHost = null;
  if (scrollsIndependently) {
    if (!(current instanceof HTMLElement)) break;
    if (!scrollLayerCoordinatesPreserveCssPixels(current, context)) break;
    if (elementCanMountProjectionLayer(current, style) && elementCreatesAbsoluteContainingBlock(style)) {
      target = {
        mode: "scroll",
        scrollLayerHost: current
      };
    } else if (positionedHost) {
      target = {
        mode: "scroll",
        scrollLayerHost: positionedHost
      };
    } else if (elementCanMountProjectionLayer(current, style) && scrollContainerSupportsFlowLayer(style)) {
      target = {
        mode: "scroll",
        scrollLayerHost: current,
        flowScrollContainer: true
      };
    }
    break;
  }
  if (style.position === "fixed" || style.position === "sticky") break;
  if (coordinateSpaceIsSafe && !clipsReading && current instanceof HTMLElement && elementCanMountProjectionLayer(current, style) && elementCreatesAbsoluteContainingBlock(style)) {
    positionedHost = current;
  }
  current = composedParentElement(current);
  }
  cache.set(element, target);
  return target;
}
function elementCreatesAbsoluteContainingBlock(style) {
  return Boolean(style.position && style.position !== "static");
}
function elementCanMountProjectionLayer(element, style) {
  if (style.display === "contents" || element.localName === "slot") return false;
  return !element.shadowRoot && !element.localName.includes("-");
}
function scrollContainerSupportsFlowLayer(style) {
  if (style.display !== "block" && style.display !== "flow-root" && style.display !== "inline-block") {
  return false;
  }
  const columns = style.columnCount;
  const columnWidth = style.columnWidth;
  const singleColumn = !columns || columns === "auto" || columns === "1";
  const automaticWidth = !columnWidth || columnWidth === "auto";
  return singleColumn && automaticWidth;
}
function elementClipsDetachedReading(style) {
  return Boolean(style.overflowX && style.overflowX !== "visible" || style.overflowY && style.overflowY !== "visible" || style.clipPath && style.clipPath !== "none" || /\b(?:paint|strict|content)\b/.test(style.contain ?? ""));
}
function scrollLayerCoordinatesPreserveCssPixels(element, context) {
  const cached = context.viewportCoordinateSafety.get(element);
  if (cached !== void 0) return cached;
  const style = memoizedComputedStyle(element, context.styleReads);
  const parent = composedParentElement(element);
  const safe = elementCoordinateSpacePreservesCssPixels(style) && (!parent || scrollLayerCoordinatesPreserveCssPixels(parent, context));
  context.viewportCoordinateSafety.set(element, safe);
  return safe;
}
function elementCoordinateSpacePreservesCssPixels(style) {
  const zoom = style.getPropertyValue("zoom");
  if (zoom && zoom !== "normal" && Math.abs(Number.parseFloat(zoom) - 1) > 1e-6) return false;
  const scale = style.getPropertyValue("scale");
  if (scale && scale !== "none") {
  const factors = scale.split(/\s+/u).map(Number.parseFloat);
  if (!factors.length || factors.some((factor) => !Number.isFinite(factor) || Math.abs(factor - 1) > 1e-6)) {
    return false;
  }
  }
  const rotate = style.getPropertyValue("rotate");
  if (rotate && rotate !== "none" && !/^0(?:deg|grad|rad|turn)?$/u.test(rotate.trim())) return false;
  if (style.perspective && style.perspective !== "none") return false;
  return transformPreservesCssPixels(style.transform);
}
function transformPreservesCssPixels(transform) {
  if (!transform || transform === "none") return true;
  if (/^(?:translate(?:X|Y|Z|3d)?\([^)]*\)\s*)+$/iu.test(transform)) return true;
  const match = transform.match(/^matrix(3d)?\(([^)]+)\)$/u);
  if (!match) return false;
  const values = match[2].split(",").map((value) => Number.parseFloat(value.trim()));
  const near = (value, expected) => Number.isFinite(value) && Math.abs(value - expected) <= 1e-6;
  if (!match[1]) {
  return values.length === 6 && near(values[0], 1) && near(values[1], 0) && near(values[2], 0) && near(values[3], 1);
  }
  return values.length === 16 && values.every((value, index) => index >= 12 && index <= 14 || near(value, index % 5 === 0 ? 1 : 0));
}
function elementScrollsIndependently(element, style, overlay) {
  const advertisesScroll = (overflow) => overflow === "auto" || overflow === "scroll" || overflow === "overlay";
  const clipsContent = (overflow) => overflow === "hidden" || overflow === "clip";
  const scrolled = overlay.scrolledContainers.has(element) || element.scrollTop !== 0 || element.scrollLeft !== 0;
  const verticalRange = element.scrollHeight > element.clientHeight + 1;
  const horizontalRange = element.scrollWidth > element.clientWidth + 1;
  if (advertisesScroll(style.overflowY) && verticalRange) return true;
  if (advertisesScroll(style.overflowX) && horizontalRange) {
  const horizontalRangePx = element.scrollWidth - element.clientWidth;
  if (scrolled || horizontalRangePx > 4) return true;
  }
  if (clipsContent(style.overflowY) && scrolled && verticalRange) return true;
  return clipsContent(style.overflowX) && scrolled && horizontalRange;
}
function scheduleProjectionRefresh(document2, overlay) {
  if (!overlay.records.size || overlay.framelessRefreshPending) return;
  const view = document2.defaultView;
  const request = view?.requestAnimationFrame;
  if (typeof request !== "function") {
  scheduleFramelessProjectionRefresh(view, overlay);
  return;
  }
  if (overlay.refreshScheduler === request) return;
  const previous = overlay.refreshScheduler;
  overlay.refreshScheduler = request;
  try {
  request.call(view, () => {
    overlay.refreshScheduler = null;
    refreshProjectedReadingPositions(overlay);
  });
  } catch (error) {
  if (overlay.refreshScheduler === request) overlay.refreshScheduler = previous;
  throw error;
  }
}
function scheduleFramelessProjectionRefresh(view, overlay) {
  if (!overlay.refreshing) {
  refreshProjectedReadingPositions(overlay);
  return;
  }
  const microtask = view?.queueMicrotask;
  if (typeof microtask !== "function") return;
  overlay.framelessRefreshPending = true;
  microtask.call(view, () => {
  overlay.framelessRefreshPending = false;
  refreshProjectedReadingPositions(overlay);
  });
}
function refreshProjectedReadingPositions(overlay) {
  overlay.refreshing = true;
  try {
  runProjectionRefreshPass(overlay);
  } finally {
  overlay.refreshing = false;
  }
}
function runProjectionRefreshPass(overlay) {
  pruneDisconnectedRecords(overlay);
  overlay.hitTestBudgetRemaining = 12;
  overlay.occlusionRefreshNeeded = false;
  if (overlay.rootsDirty) {
  overlay.rootsDirty = false;
  [...overlay.anchorRecords.keys()].forEach((anchor) => refreshProjectionAnchorRoot(anchor, overlay));
  }
  const context = {
  overlay,
  anchorPaint: /* @__PURE__ */ new Map(),
  elementPaint: /* @__PURE__ */ new Map(),
  occludingPaint: /* @__PURE__ */ new Map(),
  projectionLayers: /* @__PURE__ */ new Map(),
  // A layer's viewport box moves with every scroll, so the map is rebuilt
  // per pass: only its value WITHIN one pass may be reused.
  layerOrigins: /* @__PURE__ */ new Map(),
  viewportCoordinateSafety: /* @__PURE__ */ new Map(),
  styleReads: /* @__PURE__ */ new Map()
  };
  const records = refreshableRecords(overlay);
  records.forEach((record) => adoptProjectionLayer(record, context));
  const paints = records.map((record) => {
  if (!visibleAnchor(record.anchor, context)) {
    return { record, rect: null, visible: false };
  }
  return readProjectedReadingPaint(record, safeMeasure(record), context);
  });
  applyProjectionPaints(paints, context);
  if (overlay.graceRefreshNeeded) {
  overlay.graceRefreshNeeded = false;
  overlay.scheduleRefresh();
  }
  if (overlay.occlusionRefreshNeeded) {
  overlay.occlusionRefreshNeeded = false;
  overlay.scheduleRefresh();
  }
}
function sameProjectionRect(previous, current) {
  if (!previous) return false;
  return Math.abs(previous.left - current.left) <= 0.5 && Math.abs(previous.top - current.top) <= 0.5 && Math.abs(previous.width - current.width) <= 0.5 && Math.abs(previous.height - current.height) <= 0.5;
}
function pruneDisconnectedRecords(overlay) {
  for (const record of overlay.records) {
  if (record.owner.isConnected && record.source.isConnected) continue;
  unlinkRecord(record, overlay);
  }
  resetOcclusionBudgetIfEmpty(overlay);
}
function resetOcclusionBudgetIfEmpty(overlay) {
  if (!overlay || overlay.records.size) return;
  overlay.hitTestBudgetRemaining = 12;
  overlay.occlusionRefreshNeeded = false;
}
function projectionBelongsToRoot(record, root) {
  if (root instanceof Document) return record.owner.ownerDocument === root;
  const node = root;
  return [record.owner, record.source].some((candidate) => candidate === node || node.contains(candidate));
}
function unlinkRecord(record, overlay) {
  removeRecord(record, overlay);
  const records = ownerRecords.get(record.owner);
  records?.delete(record.source);
  if (!records?.size) ownerRecords.delete(record.owner);
}
function removeRecord(record, overlay) {
  releaseScrollProjectionRecord(record, overlay);
  record.clone.remove();
  overlay.records.delete(record);
  untrackProjectionAnchor(record, overlay);
}
function observeProjectionIntersections(document2, overlay) {
  const Observer = document2.defaultView?.IntersectionObserver;
  if (!Observer) return null;
  return new Observer((entries) => {
  for (const entry of entries) {
    const anchor = entry.target;
    if (entry.isIntersecting) {
      overlay.intersectingAnchors.add(anchor);
      continue;
    }
    overlay.intersectingAnchors.delete(anchor);
    overlay.anchorRecords.get(anchor)?.forEach((record) => {
      record.clone.style.setProperty("display", "none", "important");
    });
  }
  scheduleProjectionRefresh(document2, overlay);
  }, { root: null, rootMargin: "600px 0px 600px 0px" });
}
function trackProjectionAnchor(record, overlay) {
  const records = overlay.anchorRecords.get(record.anchor) ?? /* @__PURE__ */ new Set();
  if (!records.size) {
  overlay.anchorRecords.set(record.anchor, records);
  overlay.intersectingAnchors.add(record.anchor);
  overlay.intersectionObserver?.observe(record.anchor);
  const roots = projectionShadowRoots(record.anchor);
  overlay.anchorRoots.set(record.anchor, roots);
  roots.forEach((root) => trackProjectionRoot(root, overlay));
  trackAnchorContainer(record.anchor, overlay);
  }
  records.add(record);
}
function untrackProjectionAnchor(record, overlay) {
  const records = overlay.anchorRecords.get(record.anchor);
  if (!records) return;
  records.delete(record);
  if (records.size) return;
  overlay.anchorRecords.delete(record.anchor);
  untrackAnchorContainer(record.anchor, overlay);
  overlay.intersectingAnchors.delete(record.anchor);
  overlay.intersectionObserver?.unobserve(record.anchor);
  const roots = overlay.anchorRoots.get(record.anchor) ?? [];
  overlay.anchorRoots.delete(record.anchor);
  roots.forEach((root) => untrackProjectionRoot(root, overlay));
}
function refreshProjectionAnchorRoot(anchor, overlay) {
  const tracked = overlay.anchorRoots.get(anchor) ?? [];
  const current = projectionShadowRoots(anchor);
  if (tracked.length === current.length && tracked.every((root, index) => root === current[index])) return;
  const trackedSet = new Set(tracked);
  const currentSet = new Set(current);
  tracked.filter((root) => !currentSet.has(root)).forEach((root) => untrackProjectionRoot(root, overlay));
  overlay.anchorRoots.set(anchor, current);
  current.filter((root) => !trackedSet.has(root)).forEach((root) => trackProjectionRoot(root, overlay));
}
function projectionShadowRoots(anchor) {
  const roots = [];
  const rootSet = /* @__PURE__ */ new Set();
  const addRoot = (root) => {
  if (rootSet.has(root)) return;
  rootSet.add(root);
  roots.push(root);
  };
  const visited = /* @__PURE__ */ new Set();
  let node = anchor;
  while (node && !visited.has(node)) {
  visited.add(node);
  if (node instanceof ShadowRoot) addRoot(node);
  node = composedParentNode(node);
  }
  const domVisited = /* @__PURE__ */ new Set();
  for (let domNode = anchor; domNode && !domVisited.has(domNode); ) {
  domVisited.add(domNode);
  const parent = domNode.parentNode ?? (domNode instanceof ShadowRoot ? domNode.host : null);
  if (parent instanceof Element && parent.shadowRoot) addRoot(parent.shadowRoot);
  domNode = parent;
  }
  return roots;
}
function refreshableRecords(overlay) {
  if (!overlay.intersectionObserver) return [...overlay.records];
  return [...overlay.intersectingAnchors].flatMap((anchor) => [...overlay.anchorRecords.get(anchor) ?? []]);
}
function observeProjectionEnvironment(document2, overlay) {
  const root = document2.documentElement;
  if (!root) return null;
  const observer = parkableMutationObserver((mutations) => {
  if (!overlay.records.size) return;
  let reposition = false;
  for (const mutation of mutations) {
    if (mutationAffectsProjection(mutation, overlay)) {
      overlay.scheduleTopologyRefresh();
      return;
    }
    reposition ||= mutationMovesTrackedAnchor(mutation, overlay);
  }
  if (reposition) overlay.scheduleRefresh();
  }, { document: document2, reconcile: () => overlay.scheduleTopologyRefresh() });
  if (!observer) return null;
  observeProjectionMutations(observer, root);
  return observer;
}
function observeProjectionMutations(observer, root) {
  observer.observe(root, {
  attributes: true,
  attributeFilter: ["aria-expanded", "aria-hidden", "class", "hidden", "name", "open", "slot", "style"],
  childList: true,
  subtree: true
  });
}
function trackProjectionRoot(root, overlay) {
  const references = overlay.shadowRootReferences.get(root) ?? 0;
  overlay.shadowRootReferences.set(root, references + 1);
  if (references !== 0) return;
  root.addEventListener("scroll", overlay.scheduleScrollRefresh, { capture: true, passive: true });
  root.addEventListener("slotchange", overlay.scheduleTopologyRefresh, { capture: true, passive: true });
  rebuildProjectionMutationRoots(overlay);
}
function untrackProjectionRoot(root, overlay) {
  const references = overlay.shadowRootReferences.get(root) ?? 0;
  if (references > 1) {
  overlay.shadowRootReferences.set(root, references - 1);
  return;
  }
  if (!overlay.shadowRootReferences.delete(root)) return;
  root.removeEventListener("scroll", overlay.scheduleScrollRefresh, { capture: true });
  root.removeEventListener("slotchange", overlay.scheduleTopologyRefresh, { capture: true });
  rebuildProjectionMutationRoots(overlay);
}
function rebuildProjectionMutationRoots(overlay) {
  const observer = overlay.observer;
  if (!observer) return;
  observer.disconnect();
  const documentRoot = overlay.layer.ownerDocument.documentElement;
  if (documentRoot) observeProjectionMutations(observer, documentRoot);
  for (const root of overlay.shadowRootReferences.keys()) {
  observeProjectionMutations(observer, root);
  }
}
function isYomuOwnedNode(node, overlay) {
  for (const layer of [overlay.layer, overlay.documentLayer]) {
  if (node === layer || layer.contains(node)) return true;
  }
  if (node instanceof Element) {
  if (node.hasAttribute(PROJECTED_READING_ATTRIBUTE) || node.hasAttribute("data-jpdb-reader-surface-ignore")) return true;
  const className = typeof node.className === "string" ? node.className : "";
  if (className.includes("jpdb-reader-") || className.includes("yomu-")) return true;
  }
  return false;
}
function mutationAffectsProjection(mutation, overlay) {
  const target = mutation.target;
  const registeredLayer = target instanceof HTMLElement ? overlay.scrollLayers.get(target)?.layer : null;
  if (registeredLayer && [...mutation.removedNodes].includes(registeredLayer)) return true;
  if (isYomuOwnedNode(target, overlay)) return false;
  const affectedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
  if (affectedNodes.length > 0 && affectedNodes.every((node) => isYomuOwnedNode(node, overlay))) {
  return false;
  }
  if (!overlay.records.size) return false;
  const rootNode = target.getRootNode();
  if (rootNode instanceof ShadowRoot && overlay.shadowRootReferences.has(rootNode)) {
  return true;
  }
  if (target instanceof Element && isAnchorOrAncestor(target, overlay)) {
  return true;
  }
  for (const node of affectedNodes) {
  if (node instanceof Element && (isAnchorOrAncestor(node, overlay) || containsTrackedAnchor(node, overlay))) {
    return true;
  }
  }
  return false;
}
function trackAnchorContainer(anchor, overlay) {
  const container = anchor.parentElement;
  if (!container) return;
  overlay.anchorContainers.set(container, (overlay.anchorContainers.get(container) ?? 0) + 1);
}
function untrackAnchorContainer(anchor, overlay) {
  const container = anchor.parentElement;
  if (!container) return;
  const references = overlay.anchorContainers.get(container) ?? 0;
  if (references > 1) overlay.anchorContainers.set(container, references - 1);
  else overlay.anchorContainers.delete(container);
}
const ANCHOR_CONTAINER_PROXIMITY = 3;
function mutationMovesTrackedAnchor(mutation, overlay) {
  if (isProjectionOutputNode(mutation.target, overlay)) return false;
  const start = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
  let node = start;
  for (let depth = 0; node && depth <= ANCHOR_CONTAINER_PROXIMITY; depth += 1) {
  if (overlay.anchorContainers.has(node)) return true;
  node = node.parentElement;
  }
  return false;
}
function isProjectionOutputNode(node, overlay) {
  for (const layer of [overlay.layer, overlay.documentLayer]) {
  if (node === layer || layer.contains(node)) return true;
  }
  return node instanceof Element && (node.hasAttribute(PROJECTED_READING_ATTRIBUTE) || node.hasAttribute("data-jpdb-reader-surface-ignore"));
}
function isAnchorOrAncestor(element, overlay) {
  for (const anchor of overlay.anchorRecords.keys()) {
  if (anchor === element || anchor.contains(element) || element.contains(anchor)) {
    return true;
  }
  }
  return false;
}
function containsTrackedAnchor(element, overlay) {
  for (const anchor of overlay.anchorRecords.keys()) {
  if (element.contains(anchor)) return true;
  }
  return false;
}
function safeMeasure(record) {
  try {
  const rect = record.measure();
  return rect && validRect(rect) ? rect : null;
  } catch {
  return null;
  }
}
function validRect(rect) {
  return Number.isFinite(rect.left) && Number.isFinite(rect.top) && Number.isFinite(rect.width) && Number.isFinite(rect.height) && rect.width > 0 && rect.height > 0;
}
function sourceAllowsProjectedReading(record) {
  const style = safeComputedStyle(record.source);
  if (style.visibility === "collapse" || style.opacity !== "" && Number.parseFloat(style.opacity) === 0) return false;
  if (style.visibility !== "hidden") return true;
  return Boolean(record.source.closest(".yomu-furi-hover") && anchorRevealsHoverReading(record.anchor));
}
function anchorRevealsHoverReading(anchor) {
  try {
  if (anchor.matches(":hover, :focus, :focus-within")) return true;
  } catch {
  }
  const active = anchor.ownerDocument.activeElement;
  return Boolean(active && (active === anchor || anchor.contains(active)) || anchor.matches(".jpdb-reader-keyboard-active") || anchor.querySelector(".jpdb-reader-keyboard-active"));
}
function projectionIsTopmost(record, sourceRect, occludingPaint = /* @__PURE__ */ new Map()) {
  const footprint = projectedReadingFootprint(record, sourceRect);
  const insetX = Math.min(1, footprint.width / 4);
  const insetY = Math.min(1, footprint.height / 4);
  const sourceCentre = [
  sourceRect.left + sourceRect.width / 2,
  sourceRect.top + sourceRect.height / 2
  ];
  const footprintPoints = [
  [footprint.left + footprint.width / 2, footprint.top + footprint.height / 2],
  [footprint.left + insetX, footprint.top + insetY],
  [footprint.right - insetX, footprint.top + insetY],
  [footprint.left + insetX, footprint.bottom - insetY],
  [footprint.right - insetX, footprint.bottom - insetY]
  ];
  const probe = {
  anchor: record.anchor,
  surface: projectionRenderSurface(record),
  // Resolved once per record: the control and its size decide the same
  // way at every probe point.
  chrome: ownChromeControl(record.anchor, sourceRect),
  portalControl: ownPortalControl(record, sourceRect),
  occludingPaint
  };
  if (!anchorOwnsTopmostPoint(probe, ...sourceCentre)) return false;
  return footprintPoints.every(([x, y]) => anchorOwnsTopmostPoint(probe, x, y, true));
}
function projectionRenderSurface(record) {
  return record.owner.closest(".jpdb-reader-text-mirror") ?? record.owner.parentElement ?? record.anchor;
}
function projectedReadingFootprint(record, sourceRect) {
  const cloneRect = record.clone.getBoundingClientRect();
  const sourceStyle = safeComputedStyle(record.source);
  const measuredWidth = cloneRect.width || record.footprintWidth;
  const measuredHeight = cloneRect.height || record.footprintHeight;
  const width = measuredWidth || sourceRect.width;
  const height = measuredHeight || Number.parseFloat(sourceStyle.fontSize) || Math.max(1, sourceRect.height / 2);
  record.footprintWidth = width;
  record.footprintHeight = height;
  const left = sourceRect.left + sourceRect.width / 2 - width / 2;
  const top = sourceRect.top - height;
  return rectFromEdges(left, top, left + width, sourceRect.top);
}
const OWN_CHROME_CONTROL_SELECTOR = 'button,summary,label,[role="button"],[role="tab"],[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"],[role="option"]';
const YOUTUBE_CHROME_PORTAL_SELECTOR = ".jpdb-reader-youtube-chrome-portal";
const PORTAL_CONTROL_SELECTOR = `a[href],${OWN_CHROME_CONTROL_SELECTOR}`;
const OWN_CHROME_MAX_CONTROL_LINES = 4;
const OPAQUE_SURFACE_ALPHA = 0.9;
const RENDERED_CONTENT_SELECTOR = "img,svg,video,canvas,picture,iframe,object,embed";
function ownPortalControl(record, sourceRect) {
  if (!record.owner.closest(YOUTUBE_CHROME_PORTAL_SELECTOR)) return null;
  const visited = /* @__PURE__ */ new Set();
  for (let node = record.anchor; node && !visited.has(node); node = composedParentNode(node)) {
  visited.add(node);
  if (!(node instanceof Element)) continue;
  try {
    if (!node.matches(PORTAL_CONTROL_SELECTOR)) continue;
  } catch {
    return null;
  }
  return controlIsOwnChromeSized(node, sourceRect) ? node : null;
  }
  return null;
}
function ownChromeControl(anchor, sourceRect) {
  let chrome = null;
  const visited = /* @__PURE__ */ new Set();
  for (let node = anchor; node && !visited.has(node); node = composedParentNode(node)) {
  visited.add(node);
  if (!(node instanceof Element)) continue;
  try {
    if (!node.matches(OWN_CHROME_CONTROL_SELECTOR)) continue;
  } catch {
    return chrome;
  }
  if (!controlIsOwnChromeSized(node, sourceRect)) break;
  chrome = node;
  }
  return chrome;
}
function controlIsOwnChromeSized(control, sourceRect) {
  return control.getBoundingClientRect().height <= sourceRect.height * OWN_CHROME_MAX_CONTROL_LINES;
}
function anchorOwnsTopmostPoint(probe, x, y, allowPortalControlContent = false) {
  const { anchor, surface } = probe;
  const document2 = anchor.ownerDocument;
  if (typeof document2.elementsFromPoint !== "function") return true;
  for (const hit of document2.elementsFromPoint(x, y)) {
  if (hit.closest(".jpdb-reader-detached-reading-overlay") || hit === document2.body || hit === document2.documentElement) continue;
  const deepest = deepestOpenShadowHit(hit, x, y);
  if (composedContains(anchor, deepest) || composedContains(surface, deepest)) return true;
  if (composedContains(deepest, anchor) || composedContains(deepest, surface)) return true;
  if (allowPortalControlContent && probe.portalControl && composedContains(probe.portalControl, deepest)) return true;
  for (let element = deepest; element; element = composedParentElement(element)) {
    if (composedContains(element, anchor) || composedContains(element, surface)) break;
    if (elementIsOwnControlChrome(element, probe)) continue;
    if (elementPaintsOccludingSurface(element, probe.occludingPaint)) return false;
  }
  }
  return true;
}
function elementIsOwnControlChrome(element, probe) {
  const { chrome } = probe;
  if (!chrome || !composedContains(chrome, element)) return false;
  if (elementRendersOwnContent(element)) return false;
  return elementSurfaceAlpha(safeComputedStyle(element)) < OPAQUE_SURFACE_ALPHA;
}
function elementRendersOwnContent(element) {
  if ((element.textContent ?? "").trim() !== "") return true;
  try {
  return element.matches(RENDERED_CONTENT_SELECTOR) || Boolean(element.querySelector(RENDERED_CONTENT_SELECTOR));
  } catch {
  return false;
  }
}
function deepestOpenShadowHit(element, x, y) {
  let deepest = element;
  const visited = /* @__PURE__ */ new Set();
  while (!visited.has(deepest)) {
  visited.add(deepest);
  const root = deepest.shadowRoot;
  if (!root) break;
  const hitRoot = root;
  const hits = typeof hitRoot.elementsFromPoint === "function" ? hitRoot.elementsFromPoint(x, y) : [hitRoot.elementFromPoint?.(x, y)].filter((hit) => Boolean(hit));
  const internal = hits.find((hit) => hit.getRootNode() === root);
  if (!internal) break;
  deepest = internal;
  }
  return deepest;
}
function elementPaintsOccludingSurface(element, cache) {
  const cached = cache.get(element);
  if (cached !== void 0) return cached;
  const style = safeComputedStyle(element);
  const paints = style.visibility !== "hidden" && elementSurfaceAlpha(style) > 0;
  cache.set(element, paints);
  return paints;
}
function elementSurfaceAlpha(style) {
  const background = style.backgroundImage !== "" && style.backgroundImage !== "none" ? 1 : cssColorAlpha(style.backgroundColor);
  const opacity = style.opacity === "" ? 1 : Number.parseFloat(style.opacity);
  return background * (Number.isFinite(opacity) ? opacity : 1);
}
function cssColorAlpha(color) {
  const normalized = color.trim().toLowerCase();
  if (!normalized || normalized === "transparent") return 0;
  if (!normalized.startsWith("rgb")) return 1;
  const components = normalized.slice(normalized.indexOf("(") + 1, normalized.lastIndexOf(")"));
  const slash = components.lastIndexOf("/");
  const alpha = slash >= 0 ? components.slice(slash + 1).trim() : normalized.startsWith("rgba(") ? components.slice(components.lastIndexOf(",") + 1).trim() : "";
  if (!alpha) return 1;
  const value = Number.parseFloat(alpha);
  if (!Number.isFinite(value)) return 1;
  return alpha.endsWith("%") ? value / 100 : value;
}
function visibleAnchor(anchor, context) {
  const cached = context.anchorPaint.get(anchor);
  if (cached !== void 0) return cached;
  const intersects = context.overlay.intersectionObserver ? context.overlay.intersectingAnchors.has(anchor) : anchorIntersectsViewport(anchor);
  const visible = intersects && anchorIsPainted(anchor, context.elementPaint, context.styleReads);
  context.anchorPaint.set(anchor, visible);
  return visible;
}
function anchorIsPainted(anchor, cache = /* @__PURE__ */ new Map(), styles) {
  const cached = cache.get(anchor);
  if (cached !== void 0) return cached;
  const style = memoizedComputedStyle(anchor, styles);
  const parent = composedParentElement(anchor);
  const visible = style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse" && style.contentVisibility !== "hidden" && (style.opacity === "" || Number.parseFloat(style.opacity) !== 0) && (!parent || anchorIsPainted(parent, cache, styles));
  cache.set(anchor, visible);
  return visible;
}
function anchorIntersectsViewport(anchor) {
  const viewport = anchor.ownerDocument.defaultView;
  if (!viewport) return true;
  const rect = anchor.getBoundingClientRect();
  if (!validRect(rect)) return false;
  const margin = 64;
  return rect.right >= -margin && rect.bottom >= -margin && rect.left <= viewport.innerWidth + margin && rect.top <= viewport.innerHeight + margin;
}
function composedParentElement(element) {
  let parent = composedParentNode(element);
  while (parent && !(parent instanceof Element)) parent = composedParentNode(parent);
  return parent;
}
function firstIndependentContainerScroll(event, overlay) {
  const target = event.target;
  if (!(target instanceof Element) || overlay.scrolledContainers.has(target) || target.scrollTop === 0 && target.scrollLeft === 0) {
  return false;
  }
  const style = safeComputedStyle(target);
  const canScroll = (value) => value === "auto" || value === "scroll" || value === "overlay" || value === "hidden" || value === "clip";
  const movedVertically = target.scrollTop !== 0 && canScroll(style.overflowY);
  const movedHorizontally = target.scrollLeft !== 0 && canScroll(style.overflowX);
  if (!movedVertically && !movedHorizontally) return false;
  overlay.scrolledContainers.add(target);
  return true;
}
function scrollMovedNoProjectedReading(event, overlay) {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  const document2 = target.ownerDocument;
  if (target === document2?.documentElement || target === document2?.body) return false;
  for (const record of overlay.records) {
  if (composedContains(target, record.anchor)) return false;
  if (composedContains(target, record.source)) return false;
  if (composedContains(target, record.owner)) return false;
  }
  return true;
}
function composedContains(ancestor, descendant) {
  const visited = /* @__PURE__ */ new Set();
  for (let node = descendant; node && !visited.has(node); node = composedParentNode(node)) {
  visited.add(node);
  if (node === ancestor) return true;
  }
  return false;
}
function composedParentNode(node) {
  if (node instanceof Element && node.assignedSlot) return node.assignedSlot;
  if (node.parentNode) return node.parentNode;
  return node instanceof ShadowRoot ? node.host : null;
}
function memoizedComputedStyle(element, cache) {
  if (!cache) return safeComputedStyle(element);
  const cached = cache.get(element);
  if (cached) return cached;
  const style = safeComputedStyle(element);
  cache.set(element, style);
  return style;
}
function safeComputedStyle(element) {
  try {
  return element.ownerDocument.defaultView?.getComputedStyle(element) ?? {};
  } catch {
  return {};
  }
}
function rectFromEdges(left, top, right, bottom) {
  return {
  left,
  top,
  right,
  bottom,
  x: left,
  y: top,
  width: right - left,
  height: bottom - top,
  toJSON: () => ({})
  };
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
registerYomuCompanion("annotations", {
  clearProjectedReadings,
  clearProjectedReadingsWithin,
  projectedReadingWordAtPoint,
  pruneProjectedReadings,
  syncProjectedReadings
});
})();
