// Runtime implementation. Product code reaches this through the annotations
// companion facade in detached-reading-overlay.ts.
import { ParkableObserver, parkableMutationObserver } from '../platform/page-activity';

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
    lastGoodAt?: number;
    lastGoodOrigin?: { x: number; y: number } | null;
    graceFramesRemaining?: number;
    documentSpace?: boolean;
    scrollContextEpoch?: number;
    // Painted width of the reading is natural width * readingScaleX, so the
    // natural width can always be recovered from a live measurement.
    readingScaleX?: number;
    naturalReadingWidth?: number;
    naturalReadingKey?: string;
}

/** Where a reading lands after crowding is resolved: viewport-space centre and
 * the horizontal condense factor needed to keep it off its neighbours. */
interface ProjectionLayout {
    centre: number;
    scaleX: number;
}

interface ProjectionPaint {
    record: ProjectionRecord;
    rect: DOMRect | null;
    visible: boolean;
    layout?: ProjectionLayout;
}

/** A paint that will actually reach the page, so it competes for lane space. */
type PlacedProjectionPaint = ProjectionPaint & { rect: DOMRect };

type ProjectionEnvironmentObserver = ParkableObserver<Node, MutationObserverInit>;

interface DocumentOverlay {
    layer: HTMLElement;
    documentLayer: HTMLElement;
    documentLayerOrigin: { x: number; y: number } | null;
    records: Set<ProjectionRecord>;
    anchorRecords: Map<HTMLElement, Set<ProjectionRecord>>;
    anchorRoots: Map<HTMLElement, readonly ShadowRoot[]>;
    // Reference-counted parents of tracked anchors. A mutation landing in one
    // of these can move an anchor without touching it, which is the cheap
    // proximity test the reposition tier runs per mutation.
    anchorContainers: Map<Element, number>;
    intersectingAnchors: Set<HTMLElement>;
    intersectionObserver: IntersectionObserver | null;
    refreshFrame: number;
    observer: ProjectionEnvironmentObserver | null;
    shadowRootReferences: Map<ShadowRoot, number>;
    scheduleRefresh: () => void;
    scheduleScrollRefresh: (event: Event) => void;
    scheduleTopologyRefresh: () => void;
    rootsDirty: boolean;
    occlusionEpoch: number;
    scrollContextEpoch: number;
    hitTestBudgetRemaining: number;
    // True for the duration of a pass. A realm without animation frames runs
    // scheduled passes inline, and the grace follow-up would then re-enter the
    // pass that asked for it.
    refreshing: boolean;
    // Set when a pass painted any clone from its grace allowance. The refresh
    // pump is event-driven, so without a self-scheduled follow-up the pass
    // that would retire an expired grace never arrives and the stale clone
    // stays painted indefinitely — the "stray furigana with no word under it"
    // report.
    graceRefreshNeeded: boolean;
}

interface ProjectionReadContext {
    overlay: DocumentOverlay;
    anchorPaint: Map<HTMLElement, boolean>;
    elementPaint: Map<Element, boolean>;
    occludingPaint: Map<Element, boolean>;
    documentScroll: Map<Element, boolean>;
    // Paint visibility and scroll context both walk the composed ancestry and
    // both want the same computed style. Reading it once per element per pass
    // keeps a dense page from paying for the same style resolution twice.
    styleReads: Map<Element, CSSStyleDeclaration>;
}

const overlays = new WeakMap<Document, DocumentOverlay>();
const ownerRecords = new WeakMap<HTMLElement, Map<HTMLElement, ProjectionRecord>>();
const PROJECTED_READING_ATTRIBUTE = 'data-yomu-projected-reading';
// Grace may bridge a measurement gap for a few frames, never longer: past this
// age a missing rect means the word is gone, not mid-relayout.
const PROJECTION_GRACE_MAX_AGE_MS = 250;
// How far a reading may be condensed to stay off its neighbour. Past this the
// kana stop being readable, so an extremely tight lane keeps a little overlap
// rather than trading one unreadable rendering for another.
const PROJECTED_READING_MIN_SCALE_X = 0.55;
// Stands in for an animation-frame handle while a pass waits on a microtask, so
// further events coalesce into it exactly as they would into a frame.
const FRAMELESS_REFRESH_PENDING = -1;

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
        documentScroll: new Map(),
        styleReads: new Map(),
    };
    overlay.documentLayerOrigin = null;

    for (const [source, record] of records) {
        if (currentSources.has(source)) continue;
        removeRecord(record, overlay);
        records.delete(source);
    }

    const paints: ProjectionPaint[] = [];
    for (const projection of projections) {
        let record = records.get(projection.source);
        if (!record) {
            // Decide the scroll context before the clone exists so a new
            // reading is born in its final layer instead of being appended
            // once and moved again on its first paint.
            const documentSpace = elementScrollsWithDocument(
                projection.anchor,
                context.documentScroll,
                context.styleReads,
            );
            record = {
                owner,
                source: projection.source,
                anchor: projection.anchor,
                clone: createProjectedReading(
                    projection.source,
                    documentSpace ? overlay.documentLayer : overlay.layer,
                    documentSpace,
                ),
                measure: projection.measure,
                footprintWidth: 0,
                footprintHeight: 0,
                documentSpace,
                scrollContextEpoch: overlay.scrollContextEpoch,
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
        paints.push(readProjectedReadingPaint(record, projection.rect, context));
    }
    // Crowding is a property of the WHOLE batch, so no clone may be written
    // before every rect in it has been read.
    applyProjectionPaints(paints, context);

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
        const host = document.documentElement ?? document.body;
        if (!existing.layer.isConnected) host.append(existing.layer);
        if (!existing.documentLayer.isConnected) host.append(existing.documentLayer);
        return existing;
    }

    const layer = createProjectionLayer(document, 'jpdb-reader-detached-reading-overlay');
    // Readings whose word scrolls with the document are stamped in document
    // space inside this second layer, so the compositor carries clone and word
    // together and a dropped refresh frame cannot pull them apart.
    const documentLayer = createProjectionLayer(
        document,
        'jpdb-reader-detached-reading-overlay jpdb-reader-detached-reading-document-layer',
    );

    const overlay: DocumentOverlay = {
        layer,
        documentLayer,
        documentLayerOrigin: null,
        records: new Set(),
        anchorRecords: new Map(),
        anchorRoots: new Map(),
        anchorContainers: new Map(),
        intersectingAnchors: new Set(),
        intersectionObserver: null,
        refreshFrame: 0,
        observer: null,
        shadowRootReferences: new Map(),
        occlusionEpoch: 0,
        scrollContextEpoch: 0,
        hitTestBudgetRemaining: 12,
        refreshing: false,
        graceRefreshNeeded: false,
        scheduleRefresh: () => scheduleProjectionRefresh(document, overlay),
        scheduleScrollRefresh: (event: Event) => {
            if (scrollMovedNoProjectedReading(event, overlay)) return;
            scheduleProjectionRefresh(document, overlay);
        },
        scheduleTopologyRefresh: () => {
            overlay.rootsDirty = true;
            overlay.occlusionEpoch += 1;
            // A word's scroll container can only change when the page's
            // structure or styling does, so recompute modes here and never on
            // an ordinary scroll frame.
            overlay.scrollContextEpoch += 1;
            scheduleProjectionRefresh(document, overlay);
        },
        rootsDirty: false,
    };
    overlays.set(document, overlay);
    overlay.intersectionObserver = observeProjectionIntersections(document, overlay);
    document.addEventListener('scroll', overlay.scheduleScrollRefresh, { capture: true, passive: true });
    document.addEventListener('pointerover', overlay.scheduleRefresh, { capture: true, passive: true });
    document.addEventListener('pointerout', overlay.scheduleRefresh, { capture: true, passive: true });
    document.addEventListener('focusin', overlay.scheduleRefresh, { capture: true, passive: true });
    document.addEventListener('focusout', overlay.scheduleRefresh, { capture: true, passive: true });
    const viewport = document.defaultView;
    // A resize can make an inner box start or stop scrolling, so it has to
    // re-decide scroll contexts rather than just re-measure.
    viewport?.addEventListener('resize', overlay.scheduleTopologyRefresh, { passive: true });
    viewport?.addEventListener('orientationchange', overlay.scheduleTopologyRefresh, { passive: true });
    viewport?.visualViewport?.addEventListener('scroll', overlay.scheduleRefresh, { passive: true });
    viewport?.visualViewport?.addEventListener('resize', overlay.scheduleRefresh, { passive: true });
    overlay.observer = observeProjectionEnvironment(document, overlay);
    return overlay;
}

function createProjectionLayer(document: Document, className: string): HTMLElement {
    const layer = document.createElement('div');
    layer.className = className;
    layer.setAttribute('aria-hidden', 'true');
    layer.setAttribute('data-jpdb-reader-surface-ignore', 'true');
    (document.documentElement ?? document.body).append(layer);
    return layer;
}

function createProjectedReading(
    source: HTMLElement,
    layer: HTMLElement,
    documentSpace = false,
): HTMLElement {
    const clone = source.ownerDocument.createElement('span');
    clone.className = 'jpdb-reader-furi jpdb-reader-detached-furi jpdb-reader-projected-furi';
    if (documentSpace) clone.classList.add('jpdb-reader-projected-furi-document');
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
    // Only the kana and their size decide how wide the reading wants to be, so
    // the measured natural width survives every other repaint.
    const key = `${clone.textContent ?? ''} ${clone.style.getPropertyValue('font-size')}`;
    if (record.naturalReadingKey !== key) {
        record.naturalReadingKey = key;
        record.naturalReadingWidth = undefined;
    }
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
        record.lastGoodAt = Date.now();
        record.lastGoodOrigin = context ? projectionPaintOrigin(record, context) : null;
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
    } else if (!valid && record.lastGoodRect && record.graceFramesRemaining && record.graceFramesRemaining > 0 && sourceAllowed && anchorVisible
        // Grace bridges a transient measurement gap of a few FRAMES. Passes
        // arrive on events, not on a clock, so the counter alone let three
        // sparse passes stretch the bridge across minutes — a recycled word's
        // clone floated at its stale position the whole time. Age caps it.
        && Date.now() - (record.lastGoodAt ?? 0) <= PROJECTION_GRACE_MAX_AGE_MS) {
        record.graceFramesRemaining -= 1;
        effectiveRect = graceProjectionRect(record, context);
        visible = record.cachedTopmost ?? true;
        // A grace paint is a promise to look again; the pump does not promise
        // that on its own.
        if (context) context.overlay.graceRefreshNeeded = true;
    }

    return {
        record,
        rect: effectiveRect,
        visible,
    };
}

/**
 * Write a whole batch of clones, never one. Every rect in the batch has to be
 * read before the first write anyway (see runProjectionRefreshPass), and the
 * crowding pass needs the batch as a unit: where a reading lands depends on
 * where its lane neighbours land. A sync batch is one owner's readings, which is
 * where neighbours on a line almost always live; the refresh pass that always
 * follows a sync sees the page's whole record set and settles the rest.
 */
function applyProjectionPaints(paints: readonly ProjectionPaint[], context?: ProjectionReadContext): void {
    resolveProjectedReadingCrowding(paints);
    paints.forEach(paint => applyProjectedReadingPaint(paint, context));
}

function applyProjectedReadingPaint(paint: ProjectionPaint, context?: ProjectionReadContext): void {
    if (!paint.visible || !paint.rect) {
        paint.record.clone.style.setProperty('display', 'none', 'important');
        return;
    }
    positionProjectedReading(paint.record, paint.rect, context, paint.layout);
}

function positionProjectedReading(
    record: ProjectionRecord,
    rect: DOMRect,
    context?: ProjectionReadContext,
    layout?: ProjectionLayout,
): void {
    const { clone } = record;
    const documentSpace = context ? adoptProjectionLayer(record, context) : false;
    const origin = documentSpace && context
        ? documentLayerOrigin(context.overlay)
        : { x: 0, y: 0 };
    const centre = layout?.centre ?? rect.left + rect.width / 2;
    const scaleX = layout?.scaleX ?? 1;
    record.readingScaleX = scaleX;
    clone.style.setProperty('display', 'block', 'important');
    clone.style.setProperty('left', `${centre + origin.x}px`, 'important');
    clone.style.setProperty('top', `${rect.top + origin.y}px`, 'important');
    clone.style.setProperty('right', 'auto', 'important');
    clone.style.setProperty('bottom', 'auto', 'important');
    // translate is origin-independent, but the condense is not: pin the origin
    // so `left` stays the painted CENTRE of the reading at every scale.
    clone.style.setProperty('transform-origin', 'center', 'important');
    clone.style.setProperty(
        'transform',
        scaleX < 1 ? `translate(-50%, -100%) scaleX(${scaleX})` : 'translate(-50%, -100%)',
        'important',
    );
    // Stamps stay in viewport space in both modes so alignment guards and the
    // settle sweep keep reading one coordinate system.
    clone.dataset.yomuSourceLeft = String(rect.left);
    clone.dataset.yomuSourceTop = String(rect.top);
    clone.dataset.yomuSourceWidth = String(rect.width);
    clone.dataset.yomuSourceHeight = String(rect.height);
}

/**
 * A detached reading is painted at its natural width over page-owned glyphs the
 * reader is not allowed to widen. Native ruby makes room by stretching the base;
 * an overlay cannot, so a reading longer than its base overhangs — and where the
 * next word is annotated too, the two readings print on top of each other and
 * both become unreadable (asmr-200's title paints かいらく over 快楽 and
 * ちょうきょう over 調教 as a single smeared かいらちょうきょう; 繁體中文 loses
 * three readings the same way).
 *
 * Ruby typography already has the rule: an annotation may overhang adjacent
 * text, but never another annotation. Give each reading the space up to the
 * midpoint between its own word and the next annotated word on the same line —
 * so an isolated reading still overhangs freely — then condense only the part
 * that still does not fit.
 */
function resolveProjectedReadingCrowding(paints: readonly ProjectionPaint[]): void {
    const placed = paints.filter(isPlacedProjectionPaint);
    if (placed.length < 2) return;
    for (const lane of projectedReadingLanes(placed)) fitProjectedReadingLane(lane);
}

function isPlacedProjectionPaint(paint: ProjectionPaint): paint is PlacedProjectionPaint {
    return paint.visible && paint.rect !== null;
}

/** Readings only crowd each other along one line of text. */
function projectedReadingLanes(paints: readonly PlacedProjectionPaint[]): PlacedProjectionPaint[][] {
    const sorted = [...paints].sort((first, second) =>
        first.rect.top - second.rect.top || first.rect.left - second.rect.left);
    const lanes: PlacedProjectionPaint[][] = [];
    let lane: PlacedProjectionPaint[] | null = null;
    let laneTop = 0;
    for (const paint of sorted) {
        // Half the word's height: a shared line varies by sub-pixel rounding and
        // by mixed font sizes, never by a whole line.
        if (!lane || Math.abs(paint.rect.top - laneTop) > Math.max(1, paint.rect.height / 2)) {
            lane = [];
            lanes.push(lane);
            laneTop = paint.rect.top;
        }
        lane.push(paint);
    }
    return lanes;
}

function fitProjectedReadingLane(lane: PlacedProjectionPaint[]): void {
    if (lane.length < 2) return;
    lane.sort((first, second) => readingAnchorCentre(first) - readingAnchorCentre(second));
    for (const [index, paint] of lane.entries()) {
        const previous = lane[index - 1]?.rect;
        const next = lane[index + 1]?.rect;
        paint.layout = fitReadingBetween(
            readingAnchorCentre(paint),
            naturalReadingWidth(paint.record),
            previous ? (previous.right + paint.rect.left) / 2 : Number.NEGATIVE_INFINITY,
            next ? (paint.rect.right + next.left) / 2 : Number.POSITIVE_INFINITY,
        );
    }
}

function readingAnchorCentre(paint: PlacedProjectionPaint): number {
    return paint.rect.left + paint.rect.width / 2;
}

function fitReadingBetween(centre: number, width: number, left: number, right: number): ProjectionLayout {
    if (!(width > 0)) return { centre, scaleX: 1 };
    const available = right - left;
    const scaleX = available >= width ? 1 : Math.max(PROJECTED_READING_MIN_SCALE_X, available / width);
    const painted = width * scaleX;
    // A lane too tight even for the condense floor keeps every reading centred
    // on its own word: sharing the remaining overlap evenly beats sliding one
    // reading off the word it belongs to.
    if (painted > available) return { centre, scaleX };
    if (centre - painted / 2 < left) return { centre: left + painted / 2, scaleX };
    if (centre + painted / 2 > right) return { centre: right - painted / 2, scaleX };
    return { centre, scaleX };
}

/**
 * Width the reading would take at scale 1. The painted box is that width times
 * the condense already applied, so one live measurement recovers it; it is
 * cached until the kana or their size change (see syncProjectedReadingStyle) so
 * a dense page pays for it once per reading, not once per scroll frame.
 */
function naturalReadingWidth(record: ProjectionRecord): number {
    if (record.naturalReadingWidth) return record.naturalReadingWidth;
    const measured = record.clone.getBoundingClientRect().width;
    const scale = record.readingScaleX ?? 1;
    if (measured > 0 && scale > 0) {
        record.naturalReadingWidth = measured / scale;
        return record.naturalReadingWidth;
    }
    // A hidden clone (or a realm with no layout) still has to be placed. Kana
    // are full-width, so the font size times the kana count is the right
    // estimate and never caches over a real measurement.
    const fontSize = Number.parseFloat(safeComputedStyle(record.clone).fontSize);
    return Number.isFinite(fontSize) ? fontSize * (record.clone.textContent ?? '').length : 0;
}

/**
 * The offset the pass that paints this record adds to a measured rect: a
 * document-space clone is stamped through the document layer's current viewport
 * box, a viewport clone straight off the rect.
 */
function projectionPaintOrigin(
    record: ProjectionRecord,
    context: ProjectionReadContext,
): { x: number; y: number } {
    return projectionUsesDocumentSpace(record, context)
        ? documentLayerOrigin(context.overlay)
        : { x: 0, y: 0 };
}

/**
 * A stored rect is viewport-space, but a document-space clone is stamped
 * through the layer origin of the pass that paints it. Replaying the rect
 * verbatim after the page has scrolled therefore adds the whole scroll delta
 * and parks the reading over unrelated text — the "stray furigana in an odd
 * corner" report. Re-derive where the word must be now from the origin the good
 * paint was measured against, so a bridged frame holds the reading against its
 * word instead of sliding it down the page.
 */
function graceProjectionRect(
    record: ProjectionRecord,
    context?: ProjectionReadContext,
): DOMRect | null {
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
        stored.bottom + shiftY,
    );
}

/**
 * Move a clone into the layer its word's scroll context calls for, and report
 * whether that layer is document-space. Words that ride the document scroller
 * are stamped once in page coordinates and then need no per-frame work at all;
 * words inside an inner scroller, or under a fixed or sticky ancestor, keep the
 * viewport layer and its refresh-frame follow.
 */
function adoptProjectionLayer(record: ProjectionRecord, context: ProjectionReadContext): boolean {
    const { overlay } = context;
    const documentSpace = projectionUsesDocumentSpace(record, context);
    const layer = documentSpace ? overlay.documentLayer : overlay.layer;
    if (record.clone.parentElement !== layer) layer.append(record.clone);
    record.clone.classList.toggle('jpdb-reader-projected-furi-document', documentSpace);
    return documentSpace;
}

function projectionUsesDocumentSpace(record: ProjectionRecord, context: ProjectionReadContext): boolean {
    const { overlay } = context;
    if (record.scrollContextEpoch === overlay.scrollContextEpoch && record.documentSpace !== undefined) {
        return record.documentSpace;
    }
    const documentSpace = elementScrollsWithDocument(
        record.anchor,
        context.documentScroll,
        context.styleReads,
    );
    record.scrollContextEpoch = overlay.scrollContextEpoch;
    record.documentSpace = documentSpace;
    return documentSpace;
}

/**
 * Layout containment makes the document layer the containing block for the
 * clones inside it, so document-space offsets are stamped relative to that
 * layer's own box rather than to the page origin. Both that box and the word
 * are measured in viewport coordinates in the same pass, so the scroll offset
 * cancels and the stamped value holds still while the page scrolls. It is read
 * once per pass rather than once per reading.
 */
function documentLayerOrigin(overlay: DocumentOverlay): { x: number; y: number } {
    if (overlay.documentLayerOrigin) return overlay.documentLayerOrigin;
    const rect = overlay.documentLayer.getBoundingClientRect();
    const origin = { x: -rect.left, y: -rect.top };
    overlay.documentLayerOrigin = origin;
    return origin;
}

function elementScrollsWithDocument(
    element: Element,
    cache: Map<Element, boolean>,
    styles?: Map<Element, CSSStyleDeclaration>,
): boolean {
    const cached = cache.get(element);
    if (cached !== undefined) return cached;
    const document = element.ownerDocument;
    const view = document.defaultView;
    let scrolls: boolean;
    if (!view) {
        scrolls = false;
    } else if (element === document.documentElement || element === document.body) {
        scrolls = true;
    } else {
        const style = memoizedComputedStyle(element, styles);
        const parent = composedParentElement(element);
        scrolls = style.position !== 'fixed'
            && style.position !== 'sticky'
            && !elementScrollsIndependently(element, style)
            && Boolean(parent)
            && elementScrollsWithDocument(parent as Element, cache, styles);
    }
    cache.set(element, scrolls);
    return scrolls;
}

/**
 * Anything that can hold its own scroll offset disqualifies a word from
 * document space, including overflow:hidden boxes — those still scroll when
 * script sets scrollTop, and guessing wrong here detaches the reading, while
 * guessing conservatively only keeps today's follow behaviour.
 */
function elementScrollsIndependently(element: Element, style: CSSStyleDeclaration): boolean {
    // auto/scroll/overlay advertise a scroll offset, so overflowing content in
    // one is enough to disqualify document space.
    const advertisesScroll = (overflow: string): boolean => overflow === 'auto'
        || overflow === 'scroll'
        || overflow === 'overlay';
    // A clipping box is different: line-clamped titles and ellipsised bylines
    // are `overflow: hidden` with content that overflows by design, and they
    // are the most common annotated shape on a feed. Treating "clips" as "holds
    // a scroll offset" pushed every one of them back onto the per-frame follow
    // path, where the reading still drifts for the whole scrolled frame. A
    // clipping box only matters once something has actually scrolled it, which
    // only script can do, and that shows up as a non-zero offset.
    const clipsContent = (overflow: string): boolean => overflow === 'hidden' || overflow === 'clip';
    const scrolled = element.scrollTop !== 0 || element.scrollLeft !== 0;
    const holdsScroll = (overflow: string): boolean => advertisesScroll(overflow)
        || (clipsContent(overflow) && scrolled);
    if (holdsScroll(style.overflowY) && element.scrollHeight > element.clientHeight + 1) return true;
    return holdsScroll(style.overflowX) && element.scrollWidth > element.clientWidth + 1;
}

function scheduleProjectionRefresh(document: Document, overlay: DocumentOverlay): void {
    if (!overlay.records.size || overlay.refreshFrame) return;
    // Call rAF as a METHOD on its window. Detaching it into a local and invoking it
    // as a free function reaches Gecko's WebIDL binding with no Window receiver, which
    // throws "'requestAnimationFrame' called on an object that does not implement
    // interface Window" inside a Firefox userscript-manager sandbox (it only works in
    // the page world, where the free call still finds a Window global). The throw
    // escapes before refreshFrame is assigned, so the guard above stays 0 and every
    // scroll/pointer/focus event re-enters and re-throws — which silently freezes
    // projected-reading repositioning for the whole page.
    const view = document.defaultView;
    if (typeof view?.requestAnimationFrame !== 'function') {
        scheduleFramelessProjectionRefresh(view, overlay);
        return;
    }
    overlay.refreshFrame = view.requestAnimationFrame(() => {
        overlay.refreshFrame = 0;
        refreshProjectedReadingPositions(overlay);
    });
}

/**
 * A realm without animation frames — an embedded webview, a sandboxed frame —
 * has nothing to wait for, so a scheduled pass runs inline. The grace follow-up
 * asks for its pass from inside the pass that owes it, and running that inline
 * re-enters the read/write cycle on the same stack: one event then burns the
 * whole grace allowance in nested passes. Hand the follow-up to a microtask so
 * the retirement still happens promptly, one pass at a time.
 */
function scheduleFramelessProjectionRefresh(view: Window | null | undefined, overlay: DocumentOverlay): void {
    if (!overlay.refreshing) {
        refreshProjectedReadingPositions(overlay);
        return;
    }
    const microtask = view?.queueMicrotask;
    if (typeof microtask !== 'function') return;
    overlay.refreshFrame = FRAMELESS_REFRESH_PENDING;
    microtask.call(view, () => {
        overlay.refreshFrame = 0;
        refreshProjectedReadingPositions(overlay);
    });
}

function refreshProjectedReadingPositions(overlay: DocumentOverlay): void {
    overlay.refreshing = true;
    try {
        runProjectionRefreshPass(overlay);
    } finally {
        overlay.refreshing = false;
    }
}

function runProjectionRefreshPass(overlay: DocumentOverlay): void {
    pruneDisconnectedRecords(overlay);
    overlay.hitTestBudgetRemaining = 12;
    // The layer's viewport box moves with every scroll; only its value within
    // a single pass may be reused.
    overlay.documentLayerOrigin = null;
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
        documentScroll: new Map(),
        styleReads: new Map(),
    };
    const paints = refreshableRecords(overlay).map(record => {
        if (!visibleAnchor(record.anchor, context)) {
            return { record, rect: null, visible: false };
        }
        return readProjectedReadingPaint(record, safeMeasure(record), context);
    });
    applyProjectionPaints(paints, context);
    // A pass that consumed grace owes the follow-up pass that retires it; the
    // coalesced scheduler makes this one extra frame, not a loop.
    if (overlay.graceRefreshNeeded) {
        overlay.graceRefreshNeeded = false;
        overlay.scheduleRefresh();
    }
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
        trackAnchorContainer(record.anchor, overlay);
    }
    records.add(record);
}

function untrackProjectionAnchor(record: ProjectionRecord, overlay: DocumentOverlay): void {
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

function observeProjectionEnvironment(document: Document, overlay: DocumentOverlay): ProjectionEnvironmentObserver | null {
    const root = document.documentElement;
    if (!root) return null;
    // Subtree + attributes over the whole document is the single busiest
    // watcher the reader owns, and a hidden tab cannot paint a reprojection —
    // park it, and stand the entire missed batch up as one topology refresh
    // when the tab comes back (roots, occlusion and scroll contexts all get
    // recomputed there, which is exactly what the records would have caused).
    const observer = parkableMutationObserver(mutations => {
        if (!overlay.records.size) return;
        let reposition = false;
        for (const mutation of mutations) {
            if (mutationAffectsProjection(mutation, overlay)) {
                overlay.scheduleTopologyRefresh();
                return;
            }
            reposition ||= mutationMovesTrackedAnchor(mutation, overlay);
        }
        // Nothing structural about the projection changed, but something in a
        // container that holds an annotated word did. Re-measure what is on
        // screen; that is one scroll frame's work, not a topology pass.
        if (reposition) overlay.scheduleRefresh();
    }, { document, reconcile: () => overlay.scheduleTopologyRefresh() });
    if (!observer) return null;
    observeProjectionMutations(observer, root);
    return observer;
}

function observeProjectionMutations(observer: ProjectionEnvironmentObserver, root: Node): void {
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
    root.addEventListener('scroll', overlay.scheduleScrollRefresh, { capture: true, passive: true });
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
    root.removeEventListener('scroll', overlay.scheduleScrollRefresh, { capture: true });
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

function isYomuOwnedNode(node: Node, overlay: DocumentOverlay): boolean {
    for (const layer of [overlay.layer, overlay.documentLayer]) {
        if (node === layer || layer.contains(node)) return true;
    }
    if (node instanceof Element) {
        if (node.hasAttribute(PROJECTED_READING_ATTRIBUTE) || node.hasAttribute('data-jpdb-reader-surface-ignore')) return true;
        const className = typeof node.className === 'string' ? node.className : '';
        if (className.includes('jpdb-reader-') || className.includes('yomu-')) return true;
    }
    return false;
}

function mutationAffectsProjection(mutation: MutationRecord, overlay: DocumentOverlay): boolean {
    const target = mutation.target;
    if (isYomuOwnedNode(target, overlay)) return false;

    const affectedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
    if (affectedNodes.length > 0 && affectedNodes.every(node => isYomuOwnedNode(node, overlay))) {
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

function trackAnchorContainer(anchor: HTMLElement, overlay: DocumentOverlay): void {
    const container = anchor.parentElement;
    if (!container) return;
    overlay.anchorContainers.set(container, (overlay.anchorContainers.get(container) ?? 0) + 1);
}

function untrackAnchorContainer(anchor: HTMLElement, overlay: DocumentOverlay): void {
    const container = anchor.parentElement;
    if (!container) return;
    const references = overlay.anchorContainers.get(container) ?? 0;
    if (references > 1) overlay.anchorContainers.set(container, references - 1);
    else overlay.anchorContainers.delete(container);
}

/**
 * A mutation that touches no tracked anchor can still MOVE one: an inline gloss
 * appended next to an annotated word reflows the rest of the line, and the
 * projected readings keep the coordinates they were measured at. Answering
 * "could this have moved an anchor?" exactly would cost a document-wide
 * measure, so ask the cheap structural question instead — did it land in a
 * container that holds a tracked anchor? A bounded walk keeps this O(1) per
 * mutation, and distant subtrees stay rejected.
 */
const ANCHOR_CONTAINER_PROXIMITY = 3;

function mutationMovesTrackedAnchor(mutation: MutationRecord, overlay: DocumentOverlay): boolean {
    // Our own clones live in the overlay layers and are repositioned by the very
    // pass this would schedule. Accepting them would spin a refresh loop.
    if (isProjectionOutputNode(mutation.target, overlay)) return false;
    const start = mutation.target instanceof Element
        ? mutation.target
        : mutation.target.parentElement;
    let node: Element | null = start;
    for (let depth = 0; node && depth <= ANCHOR_CONTAINER_PROXIMITY; depth += 1) {
        if (overlay.anchorContainers.has(node)) return true;
        node = node.parentElement;
    }
    return false;
}

function isProjectionOutputNode(node: Node, overlay: DocumentOverlay): boolean {
    for (const layer of [overlay.layer, overlay.documentLayer]) {
        if (node === layer || layer.contains(node)) return true;
    }
    return node instanceof Element
        && (node.hasAttribute(PROJECTED_READING_ATTRIBUTE)
            || node.hasAttribute('data-jpdb-reader-surface-ignore'));
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
    const probe: OcclusionProbe = {
        anchor: record.anchor,
        surface: projectionRenderSurface(record),
        // Resolved once per record: the control and its size decide the same
        // way at every probe point.
        chrome: ownChromeControl(record.anchor, sourceRect),
        occludingPaint,
    };
    return points.every(([x, y]) => anchorOwnsTopmostPoint(probe, x, y));
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

// Control shapes whose interior is their own chrome. Deliberately narrow: a
// bare `a` is excluded because a link can wrap a whole card, and treating that
// much of the page as one control would let a genuine overlay inside it hide
// nothing.
const OWN_CHROME_CONTROL_SELECTOR = 'button,summary,label,'
    + '[role="button"],[role="tab"],[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"],[role="option"]';
// Past this many of the word's own line boxes a control has room to stack
// content above its label — a media tile, a radio card, a label wrapped around
// a whole row — and its interior stops being chrome.
const OWN_CHROME_MAX_CONTROL_LINES = 4;
// A hover wash lets its control's label read through. At this alpha the layer
// is a surface, and whatever is behind it — the word, or the space the reading
// is about to land in — is gone.
const OPAQUE_SURFACE_ALPHA = 0.9;
// Chrome is an empty box. Anything drawing its own pixels is content.
const RENDERED_CONTENT_SELECTOR = 'img,svg,video,canvas,picture,iframe,object,embed';

interface OcclusionProbe {
    anchor: HTMLElement;
    surface: Element;
    chrome: Element | null;
    occludingPaint: Map<Element, boolean>;
}

/**
 * The control whose interior counts as this word's own chrome, or null when the
 * word's control is too big for that to be true.
 */
function ownChromeControl(anchor: HTMLElement, sourceRect: DOMRect): Element | null {
    // closest() stops dead at a shadow boundary, and framework chrome puts the
    // label inside a shadow tree whose control is the host outside it — Reddit
    // renders well over a hundred shadow hosts per page that way. Using
    // closest() here meant the exemption never applied on exactly the pages
    // that need it, and every reading inside that chrome stayed blanked by the
    // control's own hover wash. Walk the COMPOSED ancestry so the control is
    // found on either side of the boundary.
    let chrome: Element | null = null;
    const visited = new Set<Node>();
    for (let node: Node | null = anchor; node && !visited.has(node); node = composedParentNode(node)) {
        visited.add(node);
        if (!(node instanceof Element)) continue;
        try {
            if (!node.matches(OWN_CHROME_CONTROL_SELECTOR)) continue;
        } catch {
            return chrome;
        }
        // A word can sit in a button nested in a menu row, and the row's own
        // hover wash is chrome too — so keep climbing while each candidate is
        // still small enough to be one, and stop at the first that is not.
        if (!controlIsOwnChromeSized(node, sourceRect)) break;
        chrome = node;
    }
    return chrome;
}

function controlIsOwnChromeSized(control: Element, sourceRect: DOMRect): boolean {
    return control.getBoundingClientRect().height
        <= sourceRect.height * OWN_CHROME_MAX_CONTROL_LINES;
}

function anchorOwnsTopmostPoint(probe: OcclusionProbe, x: number, y: number): boolean {
    const { anchor, surface } = probe;
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
            if (elementIsOwnControlChrome(element, probe)) continue;
            if (elementPaintsOccludingSurface(element, probe.occludingPaint)) return false;
        }
    }
    return true;
}

/**
 * A control's own decorative layers — the ripple, hover wash and focus ring
 * frameworks stack inside a button — are siblings of the word, not ancestors of
 * it, so the walk would score them as a surface covering the reading and blank
 * it. They are the control's own chrome: the reading is painted above them
 * either way, and rejecting on them means a button never shows furigana at all,
 * because the in-word source is display:none and the clone is the only visible
 * copy. Chrome is an empty box that its control's label reads through, so a
 * layer carrying content of its own, or opaque enough to take the word with it,
 * is the occluder it looks like — a dropdown that opens over its trigger and a
 * loading veil across a control both still hide the reading.
 */
function elementIsOwnControlChrome(element: Element, probe: OcclusionProbe): boolean {
    const { chrome } = probe;
    // Framework chrome routinely renders inside a component's own shadow tree,
    // which node-tree containment cannot see.
    if (!chrome || !composedContains(chrome, element)) return false;
    if (elementRendersOwnContent(element)) return false;
    // The layer was hit at this point, so an opaque one covers it: the word
    // under a loading veil is gone, and a reading painted onto an opaque badge
    // is unreadable. Only what the label reads through counts as decoration.
    return elementSurfaceAlpha(safeComputedStyle(element)) < OPAQUE_SURFACE_ALPHA;
}

function elementRendersOwnContent(element: Element): boolean {
    if ((element.textContent ?? '').trim() !== '') return true;
    try {
        return element.matches(RENDERED_CONTENT_SELECTOR)
            || Boolean(element.querySelector(RENDERED_CONTENT_SELECTOR));
    } catch {
        return false;
    }
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
    // A layer the compositor draws nothing for cannot hide anything. Framework
    // ripples and press fills sit in the hit list at opacity 0 waiting for a
    // press, and scoring those as a covering surface blanked the reading on
    // every control that stacks one over its label.
    const paints = style.visibility !== 'hidden' && elementSurfaceAlpha(style) > 0;
    cache.set(element, paints);
    return paints;
}

/** How much of what is behind an element its own background hides. */
function elementSurfaceAlpha(style: CSSStyleDeclaration): number {
    const background = style.backgroundImage !== '' && style.backgroundImage !== 'none'
        ? 1
        : cssColorAlpha(style.backgroundColor);
    const opacity = style.opacity === '' ? 1 : Number.parseFloat(style.opacity);
    return background * (Number.isFinite(opacity) ? opacity : 1);
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
    const visible = intersects && anchorIsPainted(anchor, context.elementPaint, context.styleReads);
    context.anchorPaint.set(anchor, visible);
    return visible;
}

function anchorIsPainted(
    anchor: Element,
    cache = new Map<Element, boolean>(),
    styles?: Map<Element, CSSStyleDeclaration>,
): boolean {
    const cached = cache.get(anchor);
    if (cached !== undefined) return cached;
    const style = memoizedComputedStyle(anchor, styles);
    const parent = composedParentElement(anchor);
    const visible = style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.visibility !== 'collapse'
        && style.contentVisibility !== 'hidden'
        && (style.opacity === '' || Number.parseFloat(style.opacity) !== 0)
        && (!parent || anchorIsPainted(parent, cache, styles));
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

/**
 * True when this scroll cannot have moved a single projected reading, so the
 * refresh (a layout read per record) can be skipped entirely.
 *
 * Scrolling an element translates its composed descendants and nothing else, so
 * a scroller holding no record moved no reading. Yomu's own settings dialog is
 * the case that matters: on a page like BookWalker it sits over hundreds of
 * projected readings, and without this every wheel tick inside it re-measured
 * all of them.
 *
 * Skipping is only ever safe when it is provable, so anything that is not
 * plainly an element scroller — the document, the viewport, a shadow root, a
 * non-element target — refreshes as before. On a page scroller the readings ARE
 * descendants, so this answers false and the behaviour is unchanged.
 */
function scrollMovedNoProjectedReading(event: Event, overlay: DocumentOverlay): boolean {
    const target = event.target;
    if (!(target instanceof Element)) return false;
    const document = target.ownerDocument;
    // A scroll reported by the page itself moves every record on it.
    if (target === document?.documentElement || target === document?.body) return false;
    for (const record of overlay.records) {
        if (composedContains(target, record.anchor)) return false;
        if (composedContains(target, record.source)) return false;
        if (composedContains(target, record.owner)) return false;
    }
    return true;
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

function memoizedComputedStyle(
    element: Element,
    cache?: Map<Element, CSSStyleDeclaration>,
): CSSStyleDeclaration {
    if (!cache) return safeComputedStyle(element);
    const cached = cache.get(element);
    if (cached) return cached;
    const style = safeComputedStyle(element);
    cache.set(element, style);
    return style;
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
