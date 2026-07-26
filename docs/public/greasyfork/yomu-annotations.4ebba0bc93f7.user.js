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
      occludingPaint: /* @__PURE__ */ new Map(),
      documentScroll: /* @__PURE__ */ new Map(),
      styleReads: /* @__PURE__ */ new Map()
    };
    overlay.documentLayerOrigin = null;
    for (const [source, record] of records) {
      if (currentSources.has(source)) continue;
      removeRecord(record, overlay);
      records.delete(source);
    }
    for (const projection of projections) {
      let record = records.get(projection.source);
      if (!record) {
        const documentSpace = elementScrollsWithDocument(
          projection.anchor,
          context.documentScroll,
          context.styleReads
        );
        record = {
          owner,
          source: projection.source,
          anchor: projection.anchor,
          clone: createProjectedReading(
            projection.source,
            documentSpace ? overlay.documentLayer : overlay.layer,
            documentSpace
          ),
          measure: projection.measure,
          footprintWidth: 0,
          footprintHeight: 0,
          documentSpace,
          scrollContextEpoch: overlay.scrollContextEpoch
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
    overlay.occlusionEpoch += 1;
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
      const host = document.documentElement ?? document.body;
      if (!existing.layer.isConnected) host.append(existing.layer);
      if (!existing.documentLayer.isConnected) host.append(existing.documentLayer);
      return existing;
    }
    const layer = createProjectionLayer(document, "jpdb-reader-detached-reading-overlay");
    const documentLayer = createProjectionLayer(
      document,
      "jpdb-reader-detached-reading-overlay jpdb-reader-detached-reading-document-layer"
    );
    const overlay = {
      layer,
      documentLayer,
      documentLayerOrigin: null,
      records: /* @__PURE__ */ new Set(),
      anchorRecords: /* @__PURE__ */ new Map(),
      anchorRoots: /* @__PURE__ */ new Map(),
      intersectingAnchors: /* @__PURE__ */ new Set(),
      intersectionObserver: null,
      refreshFrame: 0,
      observer: null,
      shadowRootReferences: /* @__PURE__ */ new Map(),
      occlusionEpoch: 0,
      scrollContextEpoch: 0,
      hitTestBudgetRemaining: 12,
      scheduleRefresh: () => scheduleProjectionRefresh(document, overlay),
      scheduleScrollRefresh: (event) => {
        if (scrollMovedNoProjectedReading(event, overlay)) return;
        scheduleProjectionRefresh(document, overlay);
      },
      scheduleTopologyRefresh: () => {
        overlay.rootsDirty = true;
        overlay.occlusionEpoch += 1;
        overlay.scrollContextEpoch += 1;
        scheduleProjectionRefresh(document, overlay);
      },
      rootsDirty: false
    };
    overlays.set(document, overlay);
    overlay.intersectionObserver = observeProjectionIntersections(document, overlay);
    document.addEventListener("scroll", overlay.scheduleScrollRefresh, { capture: true, passive: true });
    document.addEventListener("pointerover", overlay.scheduleRefresh, { capture: true, passive: true });
    document.addEventListener("pointerout", overlay.scheduleRefresh, { capture: true, passive: true });
    document.addEventListener("focusin", overlay.scheduleRefresh, { capture: true, passive: true });
    document.addEventListener("focusout", overlay.scheduleRefresh, { capture: true, passive: true });
    const viewport = document.defaultView;
    viewport?.addEventListener("resize", overlay.scheduleTopologyRefresh, { passive: true });
    viewport?.addEventListener("orientationchange", overlay.scheduleTopologyRefresh, { passive: true });
    viewport?.visualViewport?.addEventListener("scroll", overlay.scheduleRefresh, { passive: true });
    viewport?.visualViewport?.addEventListener("resize", overlay.scheduleRefresh, { passive: true });
    overlay.observer = observeProjectionEnvironment(document, overlay);
    return overlay;
  }
  function createProjectionLayer(document, className) {
    const layer = document.createElement("div");
    layer.className = className;
    layer.setAttribute("aria-hidden", "true");
    layer.setAttribute("data-jpdb-reader-surface-ignore", "true");
    (document.documentElement ?? document.body).append(layer);
    return layer;
  }
  function createProjectedReading(source, layer, documentSpace = false) {
    const clone = source.ownerDocument.createElement("span");
    clone.className = "jpdb-reader-furi jpdb-reader-detached-furi jpdb-reader-projected-furi";
    if (documentSpace) clone.classList.add("jpdb-reader-projected-furi-document");
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
    applyProjectedReadingPaint(readProjectedReadingPaint(record, rect, context), context);
  }
  function readProjectedReadingPaint(record, rect, context) {
    const valid = rect && validRect(rect) ? rect : null;
    const anchorVisible = context ? visibleAnchor(record.anchor, context) : anchorIsPainted(record.anchor);
    const sourceAllowed = sourceAllowsProjectedReading(record);
    let effectiveRect = valid;
    let visible = false;
    if (valid && sourceAllowed && anchorVisible) {
      record.lastGoodRect = valid;
      record.graceFramesRemaining = 3;
      let topmost;
      const overlay = context?.overlay;
      if (overlay && record.cachedOcclusionEpoch === overlay.occlusionEpoch && record.cachedTopmost !== void 0) {
        topmost = record.cachedTopmost;
      } else if (overlay && overlay.hitTestBudgetRemaining <= 0 && record.cachedTopmost !== void 0) {
        topmost = record.cachedTopmost;
      } else {
        topmost = projectionIsTopmost(record, valid, context?.occludingPaint);
        if (overlay) {
          overlay.hitTestBudgetRemaining -= 1;
          record.cachedOcclusionEpoch = overlay.occlusionEpoch;
          record.cachedTopmost = topmost;
        }
      }
      visible = topmost;
    } else if (!valid && record.lastGoodRect && record.graceFramesRemaining && record.graceFramesRemaining > 0 && sourceAllowed && anchorVisible) {
      record.graceFramesRemaining -= 1;
      effectiveRect = record.lastGoodRect;
      visible = record.cachedTopmost ?? true;
    }
    return {
      record,
      rect: effectiveRect,
      visible
    };
  }
  function applyProjectedReadingPaint(paint, context) {
    if (!paint.visible || !paint.rect) {
      paint.record.clone.style.setProperty("display", "none", "important");
      return;
    }
    positionProjectedReading(paint.record, paint.rect, context);
  }
  function positionProjectedReading(record, rect, context) {
    const { clone } = record;
    const documentSpace = context ? adoptProjectionLayer(record, context) : false;
    const origin = documentSpace && context ? documentLayerOrigin(context.overlay) : { x: 0, y: 0 };
    clone.style.setProperty("display", "block", "important");
    clone.style.setProperty("left", `${rect.left + rect.width / 2 + origin.x}px`, "important");
    clone.style.setProperty("top", `${rect.top + origin.y}px`, "important");
    clone.style.setProperty("right", "auto", "important");
    clone.style.setProperty("bottom", "auto", "important");
    clone.style.setProperty("transform", "translate(-50%, -100%)", "important");
    clone.dataset.yomuSourceLeft = String(rect.left);
    clone.dataset.yomuSourceTop = String(rect.top);
    clone.dataset.yomuSourceWidth = String(rect.width);
    clone.dataset.yomuSourceHeight = String(rect.height);
  }
  function adoptProjectionLayer(record, context) {
    const { overlay } = context;
    const documentSpace = projectionUsesDocumentSpace(record, context);
    const layer = documentSpace ? overlay.documentLayer : overlay.layer;
    if (record.clone.parentElement !== layer) layer.append(record.clone);
    record.clone.classList.toggle("jpdb-reader-projected-furi-document", documentSpace);
    return documentSpace;
  }
  function projectionUsesDocumentSpace(record, context) {
    const { overlay } = context;
    if (record.scrollContextEpoch === overlay.scrollContextEpoch && record.documentSpace !== void 0) {
      return record.documentSpace;
    }
    const documentSpace = elementScrollsWithDocument(
      record.anchor,
      context.documentScroll,
      context.styleReads
    );
    record.scrollContextEpoch = overlay.scrollContextEpoch;
    record.documentSpace = documentSpace;
    return documentSpace;
  }
  function documentLayerOrigin(overlay) {
    if (overlay.documentLayerOrigin) return overlay.documentLayerOrigin;
    const rect = overlay.documentLayer.getBoundingClientRect();
    const origin = { x: -rect.left, y: -rect.top };
    overlay.documentLayerOrigin = origin;
    return origin;
  }
  function elementScrollsWithDocument(element, cache, styles) {
    const cached = cache.get(element);
    if (cached !== void 0) return cached;
    const document = element.ownerDocument;
    const view = document.defaultView;
    let scrolls;
    if (!view) {
      scrolls = false;
    } else if (element === document.documentElement || element === document.body) {
      scrolls = true;
    } else {
      const style = memoizedComputedStyle(element, styles);
      const parent = composedParentElement(element);
      scrolls = style.position !== "fixed" && style.position !== "sticky" && !elementScrollsIndependently(element, style) && Boolean(parent) && elementScrollsWithDocument(parent, cache, styles);
    }
    cache.set(element, scrolls);
    return scrolls;
  }
  function elementScrollsIndependently(element, style) {
    const holdsScroll = (overflow) => overflow === "auto" || overflow === "scroll" || overflow === "overlay" || overflow === "hidden";
    if (holdsScroll(style.overflowY) && element.scrollHeight > element.clientHeight + 1) return true;
    return holdsScroll(style.overflowX) && element.scrollWidth > element.clientWidth + 1;
  }
  function scheduleProjectionRefresh(document, overlay) {
    if (!overlay.records.size || overlay.refreshFrame) return;
    const view = document.defaultView;
    if (typeof view?.requestAnimationFrame !== "function") {
      refreshProjectedReadingPositions(overlay);
      return;
    }
    overlay.refreshFrame = view.requestAnimationFrame(() => {
      overlay.refreshFrame = 0;
      refreshProjectedReadingPositions(overlay);
    });
  }
  function refreshProjectedReadingPositions(overlay) {
    pruneDisconnectedRecords(overlay);
    overlay.hitTestBudgetRemaining = 12;
    overlay.documentLayerOrigin = null;
    if (overlay.rootsDirty) {
      overlay.rootsDirty = false;
      [...overlay.anchorRecords.keys()].forEach((anchor) => refreshProjectionAnchorRoot(anchor, overlay));
    }
    const context = {
      overlay,
      anchorPaint: /* @__PURE__ */ new Map(),
      elementPaint: /* @__PURE__ */ new Map(),
      occludingPaint: /* @__PURE__ */ new Map(),
      documentScroll: /* @__PURE__ */ new Map(),
      styleReads: /* @__PURE__ */ new Map()
    };
    const paints = refreshableRecords(overlay).map((record) => {
      if (!visibleAnchor(record.anchor, context)) {
        return { record, rect: null, visible: false };
      }
      return readProjectedReadingPaint(record, safeMeasure(record), context);
    });
    paints.forEach((paint) => applyProjectedReadingPaint(paint, context));
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
  function observeProjectionEnvironment(document, overlay) {
    const Observer = document.defaultView?.MutationObserver;
    const root = document.documentElement;
    if (!Observer || !root) return null;
    const observer = new Observer((mutations) => {
      if (!overlay.records.size || !mutations.some((mutation) => mutationAffectsProjection(mutation, overlay))) return;
      overlay.scheduleTopologyRefresh();
    });
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
  function scrollMovedNoProjectedReading(event, overlay) {
    const target = event.target;
    if (!(target instanceof Element)) return false;
    const document = target.ownerDocument;
    if (target === document?.documentElement || target === document?.body) return false;
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
    pruneProjectedReadings,
    syncProjectedReadings
  });
})();
