// Runtime implementation. Product code reaches this through the annotations
// companion facade in detached-reading-overlay.ts.
export interface DetachedReadingProjection {
    source: HTMLElement;
    anchor: HTMLElement;
    rect: DOMRect;
    measure: () => DOMRect | null;
}

interface ProjectionRecord {
    owner: HTMLElement;
    source: HTMLElement;
    anchor: HTMLElement;
    clone: HTMLElement;
    measure: () => DOMRect | null;
    footprintWidth: number;
    footprintHeight: number;
    cachedTopmost?: boolean;
    cachedOcclusionEpoch?: number;
    lastGoodRect?: DOMRect | null;
    graceFramesRemaining?: number;
}

interface ProjectionPaint {
    record: ProjectionRecord;
    rect: DOMRect | null;
    visible: boolean;
}

interface DocumentOverlay {
    layer: HTMLElement;
    records: Set<ProjectionRecord>;
    anchorRecords: Map<HTMLElement, Set<ProjectionRecord>>;
    anchorRoots: Map<HTMLElement, readonly ShadowRoot[]>;
    intersectingAnchors: Set<HTMLElement>;
    intersectionObserver: IntersectionObserver | null;
    refreshFrame: number;
    observer: MutationObserver | null;
    shadowRootReferences: Map<ShadowRoot, number>;
    scheduleRefresh: () => void;
    scheduleTopologyRefresh: () => void;
    rootsDirty: boolean;
    occlusionEpoch: number;
    hitTestBudgetRemaining: number;
}

interface ProjectionReadContext {
    overlay: DocumentOverlay;
    anchorPaint: Map<HTMLElement, boolean>;
    elementPaint: Map<Element, boolean>;
    occludingPaint: Map<Element, boolean>;
}

const overlays = new WeakMap<Document, DocumentOverlay>();
const ownerRecords = new WeakMap<HTMLElement, Map<HTMLElement, ProjectionRecord>>();
const PROJECTED_READING_ATTRIBUTE = 'data-yomu-projected-reading';

/**
 * Paint detached readings in a reader-owned viewport layer. The source
 * reading remains in its word as annotation data, but never participates in
 * the page's clipping, scroll width, line height, or text-overflow geometry.
 */
export function syncProjectedReadings(
    owner: HTMLElement,
    projections: readonly DetachedReadingProjection[],
): void {
    const document = owner.ownerDocument;
    const overlay = documentOverlay(document);
    const records = ownerRecords.get(owner) ?? new Map<HTMLElement, ProjectionRecord>();
    const currentSources = new Set(projections.map(projection => projection.source));
    const context: ProjectionReadContext = {
        overlay,
        anchorPaint: new Map(),
        elementPaint: new Map(),
        occludingPaint: new Map(),
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
                footprintHeight: 0,
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
    // Annotation can appear inside an already-open shadow root that the
    // document MutationObserver cannot see. One coalesced refresh after sync
    // lets the new foreground surface immediately occlude older projections.
    scheduleProjectionRefresh(document, overlay);
}

export function clearProjectedReadings(owner: HTMLElement): void {
    const records = ownerRecords.get(owner);
    if (!records) return;
    const overlay = overlays.get(owner.ownerDocument);
    for (const record of records.values()) {
        if (overlay) removeRecord(record, overlay);
        else record.clone.remove();
    }
    ownerRecords.delete(owner);
}

export function clearProjectedReadingsWithin(root: ParentNode): number {
    const document = root instanceof Document ? root : (root as Node).ownerDocument;
    const overlay = document ? overlays.get(document) : undefined;
    if (!overlay) return 0;
    let cleared = 0;
    for (const record of [...overlay.records]) {
        if (!projectionBelongsToRoot(record, root)) continue;
        unlinkRecord(record, overlay);
        cleared += 1;
    }
    return cleared;
}

export function pruneProjectedReadings(document: Document): void {
    const overlay = overlays.get(document);
    if (overlay) pruneDisconnectedRecords(overlay);
}

function documentOverlay(document: Document): DocumentOverlay {
    const existing = overlays.get(document);
    if (existing) {
        if (!existing.layer.isConnected) {
            (document.documentElement ?? document.body).append(existing.layer);
        }
        return existing;
    }

    const layer = document.createElement('div');
    layer.className = 'jpdb-reader-detached-reading-overlay';
    layer.setAttribute('aria-hidden', 'true');
    layer.setAttribute('data-jpdb-reader-surface-ignore', 'true');
    (document.documentElement ?? document.body).append(layer);

    const overlay: DocumentOverlay = {
        layer,
        records: new Set(),
        anchorRecords: new Map(),
        anchorRoots: new Map(),
        intersectingAnchors: new Set(),
        intersectionObserver: null,
        refreshFrame: 0,
        observer: null,
        shadowRootReferences: new Map(),
        occlusionEpoch: 0,
        hitTestBudgetRemaining: 12,
        scheduleRefresh: () => scheduleProjectionRefresh(document, overlay),
        scheduleTopologyRefresh: () => {
            overlay.rootsDirty = true;
            overlay.occlusionEpoch += 1;
            scheduleProjectionRefresh(document, overlay);
        },
        rootsDirty: false,
    };
    overlays.set(document, overlay);
    overlay.intersectionObserver = observeProjectionIntersections(document, overlay);
    document.addEventListener('scroll', overlay.scheduleRefresh, { capture: true, passive: true });
    document.addEventListener('pointerover', overlay.scheduleRefresh, { capture: true, passive: true });
    document.addEventListener('pointerout', overlay.scheduleRefresh, { capture: true, passive: true });
    document.addEventListener('focusin', overlay.scheduleRefresh, { capture: true, passive: true });
    document.addEventListener('focusout', overlay.scheduleRefresh, { capture: true, passive: true });
    const viewport = document.defaultView;
    viewport?.addEventListener('resize', overlay.scheduleRefresh, { passive: true });
    viewport?.addEventListener('orientationchange', overlay.scheduleRefresh, { passive: true });
    viewport?.visualViewport?.addEventListener('scroll', overlay.scheduleRefresh, { passive: true });
    viewport?.visualViewport?.addEventListener('resize', overlay.scheduleRefresh, { passive: true });
    overlay.observer = observeProjectionEnvironment(document, overlay);
    return overlay;
}

function createProjectedReading(source: HTMLElement, layer: HTMLElement): HTMLElement {
    const clone = source.ownerDocument.createElement('span');
    clone.className = 'jpdb-reader-furi jpdb-reader-detached-furi jpdb-reader-projected-furi';
    clone.setAttribute('aria-hidden', 'true');
    clone.setAttribute(PROJECTED_READING_ATTRIBUTE, 'true');
    clone.textContent = source.textContent ?? '';
    layer.append(clone);
    return clone;
}

function syncProjectedReadingStyle(record: ProjectionRecord): void {
    const { clone, source } = record;
    const sourceStyle = safeComputedStyle(source);
    const base = source.closest<HTMLElement>('.jpdb-reader-word') ?? source;
    const baseStyle = safeComputedStyle(base);
    clone.textContent = source.textContent ?? '';
    clone.dataset.yomuExpression = base.dataset.expression ?? base.dataset.surface ?? '';
    clone.style.setProperty('font-family', sourceStyle.fontFamily || baseStyle.fontFamily, 'important');
    clone.style.setProperty('font-size', sourceStyle.fontSize || '10px', 'important');
    clone.style.setProperty('font-style', sourceStyle.fontStyle || baseStyle.fontStyle, 'important');
    clone.style.setProperty('font-weight', sourceStyle.fontWeight || '700', 'important');
    clone.style.setProperty('letter-spacing', sourceStyle.letterSpacing || baseStyle.letterSpacing, 'important');
    clone.style.setProperty('color', baseStyle.color || sourceStyle.color || 'currentColor', 'important');
    clone.style.setProperty('text-shadow', baseStyle.textShadow || 'none', 'important');
}

function paintProjectedReading(
    record: ProjectionRecord,
    rect: DOMRect,
    context: ProjectionReadContext,
): void {
    applyProjectedReadingPaint(readProjectedReadingPaint(record, rect, context));
}

function readProjectedReadingPaint(
    record: ProjectionRecord,
    rect: DOMRect | null,
    context?: ProjectionReadContext,
): ProjectionPaint {
    const valid = rect && validRect(rect) ? rect : null;
    const anchorVisible = context
        ? visibleAnchor(record.anchor, context)
        : anchorIsPainted(record.anchor);
    const sourceAllowed = sourceAllowsProjectedReading(record);

    let effectiveRect: DOMRect | null = valid;
    let visible = false;

    if (valid && sourceAllowed && anchorVisible) {
        record.lastGoodRect = valid;
        record.graceFramesRemaining = 3;

        let topmost: boolean;
        const overlay = context?.overlay;
        if (overlay && record.cachedOcclusionEpoch === overlay.occlusionEpoch && record.cachedTopmost !== undefined) {
            topmost = record.cachedTopmost;
        } else if (overlay && overlay.hitTestBudgetRemaining <= 0 && record.cachedTopmost !== undefined) {
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
        visible,
    };
}

function applyProjectedReadingPaint(paint: ProjectionPaint): void {
    if (!paint.visible || !paint.rect) {
        paint.record.clone.style.setProperty('display', 'none', 'important');
        return;
    }
    positionProjectedReading(paint.record.clone, paint.rect);
}

function positionProjectedReading(clone: HTMLElement, rect: DOMRect): void {
    clone.style.setProperty('display', 'block', 'important');
    clone.style.setProperty('left', `${rect.left + rect.width / 2}px`, 'important');
    clone.style.setProperty('top', `${rect.top}px`, 'important');
    clone.style.setProperty('right', 'auto', 'important');
    clone.style.setProperty('bottom', 'auto', 'important');
    clone.style.setProperty('transform', 'translate(-50%, -100%)', 'important');
    clone.dataset.yomuSourceLeft = String(rect.left);
    clone.dataset.yomuSourceTop = String(rect.top);
    clone.dataset.yomuSourceWidth = String(rect.width);
    clone.dataset.yomuSourceHeight = String(rect.height);
}

function scheduleProjectionRefresh(document: Document, overlay: DocumentOverlay): void {
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

function refreshProjectedReadingPositions(overlay: DocumentOverlay): void {
    pruneDisconnectedRecords(overlay);
    overlay.hitTestBudgetRemaining = 12;
    // Frameworks can move an already-annotated node between shadow trees
    // without asking the reader to sync it again. After a DOM/slot mutation,
    // reconcile composed ancestry before choosing records so listeners follow
    // the source rather than remaining attached to its previous root.
    if (overlay.rootsDirty) {
        overlay.rootsDirty = false;
        [...overlay.anchorRecords.keys()].forEach(anchor => refreshProjectionAnchorRoot(anchor, overlay));
    }
    // Range geometry, computed visibility, and hit-testing can all trigger a
    // layout read. Finish every record's read phase before any clone writes so
    // a scroll frame cannot alternate forced layout and style invalidation.
    const context: ProjectionReadContext = {
        overlay,
        anchorPaint: new Map(),
        elementPaint: new Map(),
        occludingPaint: new Map(),
    };
    const paints = refreshableRecords(overlay).map(record => {
        if (!visibleAnchor(record.anchor, context)) {
            return { record, rect: null, visible: false };
        }
        return readProjectedReadingPaint(record, safeMeasure(record), context);
    });
    paints.forEach(applyProjectedReadingPaint);
}

function pruneDisconnectedRecords(overlay: DocumentOverlay): void {
    for (const record of overlay.records) {
        if (record.owner.isConnected && record.source.isConnected) continue;
        unlinkRecord(record, overlay);
    }
}

function projectionBelongsToRoot(record: ProjectionRecord, root: ParentNode): boolean {
    if (root instanceof Document) return record.owner.ownerDocument === root;
    const node = root as Node;
    return [record.owner, record.source].some(candidate => candidate === node || node.contains(candidate));
}

function unlinkRecord(record: ProjectionRecord, overlay: DocumentOverlay): void {
    removeRecord(record, overlay);
    const records = ownerRecords.get(record.owner);
    records?.delete(record.source);
    if (!records?.size) ownerRecords.delete(record.owner);
}

function removeRecord(record: ProjectionRecord, overlay: DocumentOverlay): void {
    record.clone.remove();
    overlay.records.delete(record);
    untrackProjectionAnchor(record, overlay);
}

function observeProjectionIntersections(
    document: Document,
    overlay: DocumentOverlay,
): IntersectionObserver | null {
    const Observer = document.defaultView?.IntersectionObserver;
    if (!Observer) return null;
    return new Observer(entries => {
        for (const entry of entries) {
            const anchor = entry.target as HTMLElement;
            if (entry.isIntersecting) {
                overlay.intersectingAnchors.add(anchor);
                continue;
            }
            overlay.intersectingAnchors.delete(anchor);
            overlay.anchorRecords.get(anchor)?.forEach(record => {
                record.clone.style.setProperty('display', 'none', 'important');
            });
        }
        scheduleProjectionRefresh(document, overlay);
    }, { root: null, rootMargin: '600px 0px 600px 0px' });
}

function trackProjectionAnchor(record: ProjectionRecord, overlay: DocumentOverlay): void {
    const records = overlay.anchorRecords.get(record.anchor) ?? new Set<ProjectionRecord>();
    if (!records.size) {
        overlay.anchorRecords.set(record.anchor, records);
        // Paint once immediately; IntersectionObserver corrects offscreen
        // anchors asynchronously and owns the steady-state scroll registry.
        overlay.intersectingAnchors.add(record.anchor);
        overlay.intersectionObserver?.observe(record.anchor);
        const roots = projectionShadowRoots(record.anchor);
        overlay.anchorRoots.set(record.anchor, roots);
        roots.forEach(root => trackProjectionRoot(root, overlay));
    }
    records.add(record);
}

function untrackProjectionAnchor(record: ProjectionRecord, overlay: DocumentOverlay): void {
    const records = overlay.anchorRecords.get(record.anchor);
    if (!records) return;
    records.delete(record);
    if (records.size) return;
    overlay.anchorRecords.delete(record.anchor);
    overlay.intersectingAnchors.delete(record.anchor);
    overlay.intersectionObserver?.unobserve(record.anchor);
    const roots = overlay.anchorRoots.get(record.anchor) ?? [];
    overlay.anchorRoots.delete(record.anchor);
    roots.forEach(root => untrackProjectionRoot(root, overlay));
}

function refreshProjectionAnchorRoot(anchor: HTMLElement, overlay: DocumentOverlay): void {
    const tracked = overlay.anchorRoots.get(anchor) ?? [];
    const current = projectionShadowRoots(anchor);
    if (tracked.length === current.length && tracked.every((root, index) => root === current[index])) return;
    const trackedSet = new Set(tracked);
    const currentSet = new Set(current);
    tracked.filter(root => !currentSet.has(root)).forEach(root => untrackProjectionRoot(root, overlay));
    overlay.anchorRoots.set(anchor, current);
    current.filter(root => !trackedSet.has(root)).forEach(root => trackProjectionRoot(root, overlay));
}

function projectionShadowRoots(anchor: HTMLElement): ShadowRoot[] {
    const roots: ShadowRoot[] = [];
    const rootSet = new Set<ShadowRoot>();
    const addRoot = (root: ShadowRoot): void => {
        if (rootSet.has(root)) return;
        rootSet.add(root);
        roots.push(root);
    };
    const visited = new Set<Node>();
    let node: Node | null = anchor;
    while (node && !visited.has(node)) {
        visited.add(node);
        if (node instanceof ShadowRoot) addRoot(node);
        node = composedParentNode(node);
    }
    // Also watch open distribution roots on the ordinary DOM/host ancestry.
    // An unmatched light-DOM node has no assignedSlot yet, but a later slot
    // insertion or name change can make that root part of its composed tree.
    const domVisited = new Set<Node>();
    for (let domNode: Node | null = anchor; domNode && !domVisited.has(domNode);) {
        domVisited.add(domNode);
        const parent: Node | null = domNode.parentNode
            ?? (domNode instanceof ShadowRoot ? domNode.host : null);
        if (parent instanceof Element && parent.shadowRoot) addRoot(parent.shadowRoot);
        domNode = parent;
    }
    return roots;
}

function refreshableRecords(overlay: DocumentOverlay): ProjectionRecord[] {
    if (!overlay.intersectionObserver) return [...overlay.records];
    return [...overlay.intersectingAnchors]
        .flatMap(anchor => [...(overlay.anchorRecords.get(anchor) ?? [])]);
}

function observeProjectionEnvironment(document: Document, overlay: DocumentOverlay): MutationObserver | null {
    const Observer = document.defaultView?.MutationObserver;
    const root = document.documentElement;
    if (!Observer || !root) return null;
    const observer = new Observer(mutations => {
        if (!overlay.records.size || !mutations.some(mutation => mutationAffectsProjection(mutation, overlay))) return;
        overlay.scheduleTopologyRefresh();
    });
    observeProjectionMutations(observer, root);
    return observer;
}

function observeProjectionMutations(observer: MutationObserver, root: Node): void {
    observer.observe(root, {
        attributes: true,
        attributeFilter: ['aria-expanded', 'aria-hidden', 'class', 'hidden', 'name', 'open', 'slot', 'style'],
        childList: true,
        subtree: true,
    });
}

function trackProjectionRoot(root: ShadowRoot, overlay: DocumentOverlay): void {
    const references = overlay.shadowRootReferences.get(root) ?? 0;
    overlay.shadowRootReferences.set(root, references + 1);
    if (references !== 0) return;
    // Element scroll events are not composed: a document capture listener
    // cannot observe a scroller inside a shadow tree. The viewport portal must
    // listen at every shadow boundary in the source's composed ancestry.
    root.addEventListener('scroll', overlay.scheduleRefresh, { capture: true, passive: true });
    root.addEventListener('slotchange', overlay.scheduleTopologyRefresh, { capture: true, passive: true });
    rebuildProjectionMutationRoots(overlay);
}

function untrackProjectionRoot(root: ShadowRoot, overlay: DocumentOverlay): void {
    const references = overlay.shadowRootReferences.get(root) ?? 0;
    if (references > 1) {
        overlay.shadowRootReferences.set(root, references - 1);
        return;
    }
    if (!overlay.shadowRootReferences.delete(root)) return;
    root.removeEventListener('scroll', overlay.scheduleRefresh, { capture: true });
    root.removeEventListener('slotchange', overlay.scheduleTopologyRefresh, { capture: true });
    rebuildProjectionMutationRoots(overlay);
}

function rebuildProjectionMutationRoots(overlay: DocumentOverlay): void {
    const observer = overlay.observer;
    if (!observer) return;
    observer.disconnect();
    const documentRoot = overlay.layer.ownerDocument.documentElement;
    if (documentRoot) observeProjectionMutations(observer, documentRoot);
    for (const root of overlay.shadowRootReferences.keys()) {
        observeProjectionMutations(observer, root);
    }
}

function isYomuOwnedNode(node: Node, layer: HTMLElement): boolean {
    if (node === layer || layer.contains(node)) return true;
    if (node instanceof Element) {
        if (node.hasAttribute(PROJECTED_READING_ATTRIBUTE) || node.hasAttribute('data-jpdb-reader-surface-ignore')) return true;
        const className = typeof node.className === 'string' ? node.className : '';
        if (className.includes('jpdb-reader-') || className.includes('yomu-')) return true;
    }
    return false;
}

function mutationAffectsProjection(mutation: MutationRecord, overlay: DocumentOverlay): boolean {
    const target = mutation.target;
    if (isYomuOwnedNode(target, overlay.layer)) return false;

    const affectedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
    if (affectedNodes.length > 0 && affectedNodes.every(node => isYomuOwnedNode(node, overlay.layer))) {
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

function isAnchorOrAncestor(element: Element, overlay: DocumentOverlay): boolean {
    for (const anchor of overlay.anchorRecords.keys()) {
        if (anchor === element || anchor.contains(element) || element.contains(anchor)) {
            return true;
        }
    }
    return false;
}

function containsTrackedAnchor(element: Element, overlay: DocumentOverlay): boolean {
    for (const anchor of overlay.anchorRecords.keys()) {
        if (element.contains(anchor)) return true;
    }
    return false;
}

function safeMeasure(record: ProjectionRecord): DOMRect | null {
    try {
        const rect = record.measure();
        return rect && validRect(rect) ? rect : null;
    } catch {
        return null;
    }
}

function validRect(rect: DOMRect): boolean {
    return Number.isFinite(rect.left)
        && Number.isFinite(rect.top)
        && Number.isFinite(rect.width)
        && Number.isFinite(rect.height)
        && rect.width > 0
        && rect.height > 0;
}

function sourceAllowsProjectedReading(record: ProjectionRecord): boolean {
    const style = safeComputedStyle(record.source);
    if (style.visibility === 'collapse'
        || (style.opacity !== '' && Number.parseFloat(style.opacity) === 0)) return false;
    if (style.visibility !== 'hidden') return true;
    return Boolean(record.source.closest('.yomu-furi-hover')
        && anchorRevealsHoverReading(record.anchor));
}

function anchorRevealsHoverReading(anchor: HTMLElement): boolean {
    try {
        if (anchor.matches(':hover, :focus, :focus-within')) return true;
    } catch {
        // Legacy engines without :focus-within still use activeElement below.
    }
    const active = anchor.ownerDocument.activeElement;
    return Boolean((active && (active === anchor || anchor.contains(active)))
        || anchor.matches('.jpdb-reader-keyboard-active')
        || anchor.querySelector('.jpdb-reader-keyboard-active'));
}

function projectionIsTopmost(
    record: ProjectionRecord,
    sourceRect: DOMRect,
    occludingPaint = new Map<Element, boolean>(),
): boolean {
    const footprint = projectedReadingFootprint(record, sourceRect);
    const insetX = Math.min(1, footprint.width / 4);
    const insetY = Math.min(1, footprint.height / 4);
    const points = [
        [sourceRect.left + sourceRect.width / 2, sourceRect.top + sourceRect.height / 2],
        [footprint.left + footprint.width / 2, footprint.top + footprint.height / 2],
        [footprint.left + insetX, footprint.top + insetY],
        [footprint.right - insetX, footprint.top + insetY],
        [footprint.left + insetX, footprint.bottom - insetY],
        [footprint.right - insetX, footprint.bottom - insetY],
    ];
    const surface = projectionRenderSurface(record);
    return points.every(([x, y]) => anchorOwnsTopmostPoint(
        record.anchor,
        surface,
        x,
        y,
        occludingPaint,
    ));
}

function projectionRenderSurface(record: ProjectionRecord): Element {
    return record.owner.closest('.jpdb-reader-text-mirror')
        ?? record.owner.parentElement
        ?? record.anchor;
}

function projectedReadingFootprint(record: ProjectionRecord, sourceRect: DOMRect): DOMRect {
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

function anchorOwnsTopmostPoint(
    anchor: HTMLElement,
    surface: Element,
    x: number,
    y: number,
    occludingPaint: Map<Element, boolean>,
): boolean {
    const document = anchor.ownerDocument;
    if (typeof document.elementsFromPoint !== 'function') return true;
    for (const hit of document.elementsFromPoint(x, y)) {
        if (hit.closest('.jpdb-reader-detached-reading-overlay')
            || hit === document.body
            || hit === document.documentElement) continue;
        const deepest = deepestOpenShadowHit(hit, x, y);
        if (composedContains(anchor, deepest) || composedContains(surface, deepest)) return true;
        if (composedContains(deepest, anchor) || composedContains(deepest, surface)) return true;
        for (let element: Element | null = deepest; element; element = composedParentElement(element)) {
            if (composedContains(element, anchor) || composedContains(element, surface)) break;
            if (elementPaintsOccludingSurface(element, occludingPaint)) return false;
        }
    }
    return true;
}

function deepestOpenShadowHit(element: Element, x: number, y: number): Element {
    let deepest = element;
    const visited = new Set<Element>();
    while (!visited.has(deepest)) {
        visited.add(deepest);
        const root = deepest.shadowRoot;
        if (!root) break;
        const hitRoot = root as ShadowRoot & {
            elementsFromPoint?: (clientX: number, clientY: number) => Element[];
            elementFromPoint?: (clientX: number, clientY: number) => Element | null;
        };
        const hits = typeof hitRoot.elementsFromPoint === 'function'
            ? hitRoot.elementsFromPoint(x, y)
            : [hitRoot.elementFromPoint?.(x, y)].filter((hit): hit is Element => Boolean(hit));
        const internal = hits.find(hit => hit.getRootNode() === root);
        if (!internal) break;
        deepest = internal;
    }
    return deepest;
}

function elementPaintsOccludingSurface(element: Element, cache: Map<Element, boolean>): boolean {
    const cached = cache.get(element);
    if (cached !== undefined) return cached;
    const style = safeComputedStyle(element);
    const paints = style.backgroundImage !== '' && style.backgroundImage !== 'none'
        || cssColorAlpha(style.backgroundColor) > 0;
    cache.set(element, paints);
    return paints;
}

function cssColorAlpha(color: string): number {
    const normalized = color.trim().toLowerCase();
    if (!normalized || normalized === 'transparent') return 0;
    if (!normalized.startsWith('rgb')) return 1;
    const components = normalized.slice(normalized.indexOf('(') + 1, normalized.lastIndexOf(')'));
    const slash = components.lastIndexOf('/');
    const alpha = slash >= 0
        ? components.slice(slash + 1).trim()
        : normalized.startsWith('rgba(')
            ? components.slice(components.lastIndexOf(',') + 1).trim()
            : '';
    if (!alpha) return 1;
    const value = Number.parseFloat(alpha);
    if (!Number.isFinite(value)) return 1;
    return alpha.endsWith('%') ? value / 100 : value;
}

function visibleAnchor(anchor: HTMLElement, context: ProjectionReadContext): boolean {
    const cached = context.anchorPaint.get(anchor);
    if (cached !== undefined) return cached;
    const intersects = context.overlay.intersectionObserver
        ? context.overlay.intersectingAnchors.has(anchor)
        : anchorIntersectsViewport(anchor);
    const visible = intersects && anchorIsPainted(anchor, context.elementPaint);
    context.anchorPaint.set(anchor, visible);
    return visible;
}

function anchorIsPainted(anchor: Element, cache = new Map<Element, boolean>()): boolean {
    const cached = cache.get(anchor);
    if (cached !== undefined) return cached;
    const style = safeComputedStyle(anchor);
    const parent = composedParentElement(anchor);
    const visible = style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.visibility !== 'collapse'
        && style.contentVisibility !== 'hidden'
        && (style.opacity === '' || Number.parseFloat(style.opacity) !== 0)
        && (!parent || anchorIsPainted(parent, cache));
    cache.set(anchor, visible);
    return visible;
}

function anchorIntersectsViewport(anchor: HTMLElement): boolean {
    const viewport = anchor.ownerDocument.defaultView;
    if (!viewport) return true;
    const rect = anchor.getBoundingClientRect();
    if (!validRect(rect)) return false;
    const margin = 64;
    return rect.right >= -margin
        && rect.bottom >= -margin
        && rect.left <= viewport.innerWidth + margin
        && rect.top <= viewport.innerHeight + margin;
}

function composedParentElement(element: Element): Element | null {
    let parent = composedParentNode(element);
    while (parent && !(parent instanceof Element)) parent = composedParentNode(parent);
    return parent;
}

function composedContains(ancestor: Element, descendant: Element): boolean {
    const visited = new Set<Node>();
    for (let node: Node | null = descendant; node && !visited.has(node); node = composedParentNode(node)) {
        visited.add(node);
        if (node === ancestor) return true;
    }
    return false;
}

function composedParentNode(node: Node): Node | null {
    // A light-DOM node renders beneath its assigned slot, not beneath its DOM
    // parent. Follow that edge before ordinary ancestry, then cross a shadow
    // root through its host.
    if (node instanceof Element && node.assignedSlot) return node.assignedSlot;
    if (node.parentNode) return node.parentNode;
    return node instanceof ShadowRoot ? node.host : null;
}

function safeComputedStyle(element: Element): CSSStyleDeclaration {
    try {
        return element.ownerDocument.defaultView?.getComputedStyle(element) ?? ({} as CSSStyleDeclaration);
    } catch {
        return {} as CSSStyleDeclaration;
    }
}

function rectFromEdges(left: number, top: number, right: number, bottom: number): DOMRect {
    return {
        left,
        top,
        right,
        bottom,
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
        toJSON: () => ({}),
    } as DOMRect;
}
