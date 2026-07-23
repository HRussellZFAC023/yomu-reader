(function() {
  "use strict";
  const overlays = /* @__PURE__ */ new WeakMap();
  const ownerRecords = /* @__PURE__ */ new WeakMap();
  const PROJECTED_READING_ATTRIBUTE = "data-yomu-projected-reading";
  function syncProjectedReadings(owner, projections) {
    const document = owner.ownerDocument;
    const overlay = documentOverlay(document);
    const records = ownerRecords.get(owner) ?? /* @__PURE__ */ new Map();
    const currentSources = new Set(projections.map((projection) => projection.source));
    const context = {
      overlay,
      anchorPaint: /* @__PURE__ */ new Map(),
      elementPaint: /* @__PURE__ */ new Map(),
      occludingPaint: /* @__PURE__ */ new Map()
    };
    for (const [source, record] of records) {
      if (currentSources.has(source)) continue;
      removeRecord(record, overlay);
      records.delete(source);
    }
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
        trackProjectionAnchor(record, overlay);
      }
      record.measure = projection.measure;
      refreshProjectionAnchorRoot(record.anchor, overlay);
      syncProjectedReadingStyle(record);
      paintProjectedReading(record, projection.rect, context);
    }
    if (records.size) ownerRecords.set(owner, records);
    else ownerRecords.delete(owner);
    pruneDisconnectedRecords(overlay);
    scheduleProjectionRefresh(document, overlay);
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
  }
  function clearProjectedReadingsWithin(root) {
    const document = root instanceof Document ? root : root.ownerDocument;
    const overlay = document ? overlays.get(document) : void 0;
    if (!overlay) return 0;
    let cleared = 0;
    for (const record of [...overlay.records]) {
      if (!projectionBelongsToRoot(record, root)) continue;
      unlinkRecord(record, overlay);
      cleared += 1;
    }
    return cleared;
  }
  function pruneProjectedReadings(document) {
    const overlay = overlays.get(document);
    if (overlay) pruneDisconnectedRecords(overlay);
  }
  function documentOverlay(document) {
    const existing = overlays.get(document);
    if (existing) {
      if (!existing.layer.isConnected) {
        (document.documentElement ?? document.body).append(existing.layer);
      }
      return existing;
    }
    const layer = document.createElement("div");
    layer.className = "jpdb-reader-detached-reading-overlay";
    layer.setAttribute("aria-hidden", "true");
    layer.setAttribute("data-jpdb-reader-surface-ignore", "true");
    (document.documentElement ?? document.body).append(layer);
    const overlay = {
      layer,
      records: /* @__PURE__ */ new Set(),
      anchorRecords: /* @__PURE__ */ new Map(),
      anchorRoots: /* @__PURE__ */ new Map(),
      intersectingAnchors: /* @__PURE__ */ new Set(),
      intersectionObserver: null,
      refreshFrame: 0,
      observer: null,
      shadowRootReferences: /* @__PURE__ */ new Map()
    };
    overlays.set(document, overlay);
    overlay.intersectionObserver = observeProjectionIntersections(document, overlay);
    const schedule = () => scheduleProjectionRefresh(document, overlay);
    document.addEventListener("scroll", schedule, { capture: true, passive: true });
    document.addEventListener("pointerover", schedule, { capture: true, passive: true });
    document.addEventListener("pointerout", schedule, { capture: true, passive: true });
    document.addEventListener("focusin", schedule, { capture: true, passive: true });
    document.addEventListener("focusout", schedule, { capture: true, passive: true });
    const viewport = document.defaultView;
    viewport?.addEventListener("resize", schedule, { passive: true });
    viewport?.addEventListener("orientationchange", schedule, { passive: true });
    viewport?.visualViewport?.addEventListener("scroll", schedule, { passive: true });
    viewport?.visualViewport?.addEventListener("resize", schedule, { passive: true });
    overlay.observer = observeProjectionEnvironment(document, overlay);
    return overlay;
  }
  function createProjectedReading(source, layer) {
    const clone = source.ownerDocument.createElement("span");
    clone.className = "jpdb-reader-furi jpdb-reader-detached-furi jpdb-reader-projected-furi";
    clone.setAttribute("aria-hidden", "true");
    clone.setAttribute(PROJECTED_READING_ATTRIBUTE, "true");
    clone.textContent = source.textContent ?? "";
    layer.append(clone);
    return clone;
  }
  function syncProjectedReadingStyle(record) {
    const { clone, source } = record;
    const sourceStyle = safeComputedStyle(source);
    const base = source.closest(".jpdb-reader-word") ?? source;
    const baseStyle = safeComputedStyle(base);
    clone.textContent = source.textContent ?? "";
    clone.dataset.yomuExpression = base.dataset.expression ?? base.dataset.surface ?? "";
    clone.style.setProperty("font-family", sourceStyle.fontFamily || baseStyle.fontFamily, "important");
    clone.style.setProperty("font-size", sourceStyle.fontSize || "10px", "important");
    clone.style.setProperty("font-style", sourceStyle.fontStyle || baseStyle.fontStyle, "important");
    clone.style.setProperty("font-weight", sourceStyle.fontWeight || "700", "important");
    clone.style.setProperty("letter-spacing", sourceStyle.letterSpacing || baseStyle.letterSpacing, "important");
    clone.style.setProperty("color", baseStyle.color || sourceStyle.color || "currentColor", "important");
    clone.style.setProperty("text-shadow", baseStyle.textShadow || "none", "important");
  }
  function paintProjectedReading(record, rect, context) {
    applyProjectedReadingPaint(readProjectedReadingPaint(record, rect, context));
  }
  function readProjectedReadingPaint(record, rect, context) {
    const valid = rect && validRect(rect) ? rect : null;
    const anchorVisible = context ? visibleAnchor(record.anchor, context) : anchorIsPainted(record.anchor);
    return {
      record,
      rect: valid,
      visible: Boolean(valid && sourceAllowsProjectedReading(record) && anchorVisible && projectionIsTopmost(record, valid, context?.occludingPaint))
    };
  }
  function applyProjectedReadingPaint(paint) {
    if (!paint.visible || !paint.rect) {
      paint.record.clone.style.setProperty("display", "none", "important");
      return;
    }
    positionProjectedReading(paint.record.clone, paint.rect);
  }
  function positionProjectedReading(clone, rect) {
    clone.style.setProperty("display", "block", "important");
    clone.style.setProperty("left", `${rect.left + rect.width / 2}px`, "important");
    clone.style.setProperty("top", `${rect.top}px`, "important");
    clone.style.setProperty("right", "auto", "important");
    clone.style.setProperty("bottom", "auto", "important");
    clone.style.setProperty("transform", "translate(-50%, -100%)", "important");
    clone.dataset.yomuSourceLeft = String(rect.left);
    clone.dataset.yomuSourceTop = String(rect.top);
    clone.dataset.yomuSourceWidth = String(rect.width);
    clone.dataset.yomuSourceHeight = String(rect.height);
  }
  function scheduleProjectionRefresh(document, overlay) {
    if (!overlay.records.size || overlay.refreshFrame) return;
    const frame = document.defaultView?.requestAnimationFrame;
    if (!frame) {
      refreshProjectedReadingPositions(overlay);
      return;
    }
    overlay.refreshFrame = frame(() => {
      overlay.refreshFrame = 0;
      refreshProjectedReadingPositions(overlay);
    });
  }
  function refreshProjectedReadingPositions(overlay) {
    pruneDisconnectedRecords(overlay);
    const context = {
      overlay,
      anchorPaint: /* @__PURE__ */ new Map(),
      elementPaint: /* @__PURE__ */ new Map(),
      occludingPaint: /* @__PURE__ */ new Map()
    };
    const paints = refreshableRecords(overlay).map((record) => {
      if (!visibleAnchor(record.anchor, context)) {
        return { record, rect: null, visible: false };
      }
      return readProjectedReadingPaint(record, safeMeasure(record), context);
    });
    paints.forEach(applyProjectedReadingPaint);
  }
  function pruneDisconnectedRecords(overlay) {
    for (const record of overlay.records) {
      if (record.owner.isConnected && record.source.isConnected) continue;
      unlinkRecord(record, overlay);
    }
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
    record.clone.remove();
    overlay.records.delete(record);
    untrackProjectionAnchor(record, overlay);
  }
  function observeProjectionIntersections(document, overlay) {
    const Observer = document.defaultView?.IntersectionObserver;
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
      scheduleProjectionRefresh(document, overlay);
    }, { root: null, rootMargin: "64px" });
  }
  function trackProjectionAnchor(record, overlay) {
    const records = overlay.anchorRecords.get(record.anchor) ?? /* @__PURE__ */ new Set();
    if (!records.size) {
      overlay.anchorRecords.set(record.anchor, records);
      overlay.intersectingAnchors.add(record.anchor);
      overlay.intersectionObserver?.observe(record.anchor);
      const root = record.anchor.getRootNode();
      overlay.anchorRoots.set(record.anchor, root);
      trackProjectionRoot(root, overlay);
    }
    records.add(record);
  }
  function untrackProjectionAnchor(record, overlay) {
    const records = overlay.anchorRecords.get(record.anchor);
    if (!records) return;
    records.delete(record);
    if (records.size) return;
    overlay.anchorRecords.delete(record.anchor);
    overlay.intersectingAnchors.delete(record.anchor);
    overlay.intersectionObserver?.unobserve(record.anchor);
    const root = overlay.anchorRoots.get(record.anchor);
    overlay.anchorRoots.delete(record.anchor);
    if (root) untrackProjectionRoot(root, overlay);
  }
  function refreshProjectionAnchorRoot(anchor, overlay) {
    const tracked = overlay.anchorRoots.get(anchor);
    const current = anchor.getRootNode();
    if (tracked === current) return;
    if (tracked) untrackProjectionRoot(tracked, overlay);
    overlay.anchorRoots.set(anchor, current);
    trackProjectionRoot(current, overlay);
  }
  function refreshableRecords(overlay) {
    if (!overlay.intersectionObserver) return [...overlay.records];
    return [...overlay.intersectingAnchors].flatMap((anchor) => [...overlay.anchorRecords.get(anchor) ?? []]);
  }
  function observeProjectionEnvironment(document, overlay) {
    const Observer = document.defaultView?.MutationObserver;
    const root = document.documentElement;
    if (!Observer || !root) return null;
    const observer = new Observer((mutations) => {
      if (!overlay.records.size || !mutations.some((mutation) => mutationAffectsProjection(mutation, overlay.layer))) return;
      scheduleProjectionRefresh(document, overlay);
    });
    observeProjectionMutations(observer, root);
    return observer;
  }
  function observeProjectionMutations(observer, root) {
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["aria-expanded", "aria-hidden", "class", "hidden", "open", "style"],
      childList: true,
      subtree: true
    });
  }
  function trackProjectionRoot(root, overlay) {
    if (!(root instanceof ShadowRoot)) return;
    const references = overlay.shadowRootReferences.get(root) ?? 0;
    overlay.shadowRootReferences.set(root, references + 1);
    if (references === 0) rebuildProjectionMutationRoots(overlay);
  }
  function untrackProjectionRoot(root, overlay) {
    if (!(root instanceof ShadowRoot)) return;
    const references = overlay.shadowRootReferences.get(root) ?? 0;
    if (references > 1) {
      overlay.shadowRootReferences.set(root, references - 1);
      return;
    }
    if (!overlay.shadowRootReferences.delete(root)) return;
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
  function mutationAffectsProjection(mutation, layer) {
    if (mutation.target instanceof Node && layer.contains(mutation.target)) return false;
    return [...mutation.addedNodes, ...mutation.removedNodes].every((node) => node !== layer && !layer.contains(node));
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
    const points = [
      [sourceRect.left + sourceRect.width / 2, sourceRect.top + sourceRect.height / 2],
      [footprint.left + footprint.width / 2, footprint.top + footprint.height / 2],
      [footprint.left + insetX, footprint.top + insetY],
      [footprint.right - insetX, footprint.top + insetY],
      [footprint.left + insetX, footprint.bottom - insetY],
      [footprint.right - insetX, footprint.bottom - insetY]
    ];
    const surface = projectionRenderSurface(record);
    return points.every(([x, y]) => anchorOwnsTopmostPoint(
      record.anchor,
      surface,
      x,
      y,
      occludingPaint
    ));
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
  function anchorOwnsTopmostPoint(anchor, surface, x, y, occludingPaint) {
    const document = anchor.ownerDocument;
    if (typeof document.elementsFromPoint !== "function") return true;
    for (const hit of document.elementsFromPoint(x, y)) {
      if (hit.closest(".jpdb-reader-detached-reading-overlay") || hit === document.body || hit === document.documentElement) continue;
      const deepest = deepestOpenShadowHit(hit, x, y);
      if (composedContains(anchor, deepest) || composedContains(surface, deepest)) return true;
      if (composedContains(deepest, anchor) || composedContains(deepest, surface)) return true;
      for (let element = deepest; element; element = composedParentElement(element)) {
        if (composedContains(element, anchor) || composedContains(element, surface)) break;
        if (elementPaintsOccludingSurface(element, occludingPaint)) return false;
      }
    }
    return true;
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
    const paints = style.backgroundImage !== "" && style.backgroundImage !== "none" || cssColorAlpha(style.backgroundColor) > 0;
    cache.set(element, paints);
    return paints;
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
    const visible = intersects && anchorIsPainted(anchor, context.elementPaint);
    context.anchorPaint.set(anchor, visible);
    return visible;
  }
  function anchorIsPainted(anchor, cache = /* @__PURE__ */ new Map()) {
    const cached = cache.get(anchor);
    if (cached !== void 0) return cached;
    const style = safeComputedStyle(anchor);
    const parent = composedParentElement(anchor);
    const visible = style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse" && style.contentVisibility !== "hidden" && (style.opacity === "" || Number.parseFloat(style.opacity) !== 0) && (!parent || anchorIsPainted(parent, cache));
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
    if (element.parentElement) return element.parentElement;
    const root = element.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  }
  function composedContains(ancestor, descendant) {
    for (let node = descendant; node; ) {
      if (node === ancestor) return true;
      const root = node.getRootNode();
      node = node.parentNode ?? (root instanceof ShadowRoot ? root.host : null);
    }
    return false;
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
    pruneProjectedReadings,
    syncProjectedReadings
  });
})();
