import { safeComputedStyle } from './decoration-policy';
import { setImportantStyleIfChanged as setImportantStyle } from './inline-style';

export const DOCUMENT_ANNOTATION_PORTAL_MIRROR_CLASS = 'jpdb-reader-document-annotation-portal';
const DOCUMENT_ANNOTATION_PORTAL_PAINT_CLASS = 'jpdb-reader-document-annotation-paint';

export interface DocumentAnnotationPortalClipBounds {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

interface PortalPoint {
    x: number;
    y: number;
}

interface PortalAlignmentSnapshot {
    source: PortalPoint;
    root: PortalPoint;
}

interface PortalClipAncestor {
    element: HTMLElement;
    clipsX: boolean;
    clipsY: boolean;
}

interface DocumentAnnotationPortalEntry {
    source: HTMLElement;
    mirror: HTMLElement;
    paint: HTMLElement;
    sourceAnchor: Range | null;
    settled: PortalAlignmentSnapshot;
    applied: PortalPoint;
    preparedClip: DocumentAnnotationPortalClipBounds | null;
    clipChain: PortalClipAncestor[];
    clipTopologyEpoch: number;
    scheduleProjection: () => void;
    projectImmediately: () => void;
    retire: () => void;
}

interface DocumentAnnotationPortalWatch {
    entries: Map<HTMLElement, DocumentAnnotationPortalEntry>;
    lifecycle: AbortController;
    topologyEpoch: number;
    scrollSettleEntries: Set<DocumentAnnotationPortalEntry>;
    scrollSettleTimer: number | null;
}

interface PendingAlignment {
    entry: DocumentAnnotationPortalEntry;
    source: PortalPoint;
    root: PortalPoint;
    clip: DocumentAnnotationPortalClipBounds | null;
    x: number;
    y: number;
}

const portalWatches = new WeakMap<Document, DocumentAnnotationPortalWatch>();
const structurallyStyledPortalMirrors = new WeakSet<HTMLElement>();
const CLIPPED_PORTAL_SCROLL_SETTLE_MS = 96;
let portalClipTopologyStyleReadCount = 0;
let portalClipRectReadCount = 0;

/** Focused real-browser counters for the clip topology/geometry budget. */
// Loaded by source-preserving-prose-portal-smoke.mjs through a generated data URL.
// fallow-ignore-next-line unused-export
export function documentPortalClipMeasurementCountsForTest(): { styles: number; rects: number } {
    return { styles: portalClipTopologyStyleReadCount, rects: portalClipRectReadCount };
}

/**
 * Keep annotation paint outside the page-owned source tree. The root remains
 * a layout-neutral fixed shell; its child paint plane is the only part moved
 * by the immediate scroll lane. Keeping the plane separate lets a clipped
 * nested panel retain a stationary clip while its prose moves underneath it.
 */
export function styleDocumentAnnotationPortalMirror(mirror: HTMLElement, host: HTMLElement): void {
    const style = safeComputedStyle(host);
    // The structural reset is a mount-time operation. Re-running `cssText =`
    // after a native host class/style mutation used to erase the additive
    // layer's transparent text-fill and the live paint-plane transform. Bare
    // punctuation/Latin runs could then flash at the portal origin before the
    // post-paint projection restored them. Refresh only copied typography and
    // stacking on later calls so the complete paint contract stays atomic.
    if (!structurallyStyledPortalMirrors.has(mirror)) {
        mirror.style.cssText = [
            'all:initial!important',
            'position:fixed!important',
            'inset:auto!important',
            'top:0!important',
            'left:0!important',
            'width:0!important',
            'height:0!important',
            'overflow:visible!important',
            'pointer-events:none!important',
            'user-select:none!important',
            '-webkit-user-select:none!important',
            'z-index:auto!important',
            'contain:layout style!important',
        ].join(';');
        const paint = documentAnnotationPortalPaint(mirror);
        paint.style.cssText = [
            'display:block!important',
            'position:absolute!important',
            'inset:0 auto auto 0!important',
            'width:0!important',
            'height:0!important',
            'overflow:visible!important',
            'pointer-events:none!important',
            'contain:layout style!important',
            'transform:none!important',
            'transform-origin:0 0!important',
        ].join(';');
        structurallyStyledPortalMirrors.add(mirror);
    }
    mirror.style.setProperty('font', style.font, 'important');
    mirror.style.setProperty('font-size', style.fontSize, 'important');
    mirror.style.setProperty('font-weight', style.fontWeight, 'important');
    mirror.style.setProperty('line-height', style.lineHeight, 'important');
    mirror.style.setProperty('letter-spacing', style.letterSpacing, 'important');
    mirror.style.setProperty('direction', style.direction, 'important');
    mirror.style.setProperty('writing-mode', style.writingMode, 'important');
    mirror.style.setProperty('color', style.color, 'important');
    setImportantStyle(mirror, 'z-index', documentPortalStackingLevel(host));
}

/** The stable paint plane all portal words live under. */
export function documentAnnotationPortalPaint(mirror: HTMLElement): HTMLElement {
    const existing = Array.from(mirror.children).find(
        (child): child is HTMLElement => child instanceof HTMLElement
            && child.classList.contains(DOCUMENT_ANNOTATION_PORTAL_PAINT_CLASS),
    );
    if (existing) return existing;
    const paint = mirror.ownerDocument.createElement('span');
    paint.className = DOCUMENT_ANNOTATION_PORTAL_PAINT_CLASS;
    mirror.append(paint);
    return paint;
}

/**
 * One coalesced event lane per document. Scroll alignment is measured, never
 * inferred from window/ancestor offsets: fixed and stuck-sticky sources report
 * no movement, ordinary document and nested-scroll sources report their exact
 * client-coordinate movement, and VisualViewport engine differences cancel
 * against the measured fixed portal root.
 */
export function registerDocumentAnnotationPortalMirror(
    host: HTMLElement,
    mirror: HTMLElement,
    scheduleProjection: () => void,
    projectImmediately: () => void,
    retire: () => void,
): void {
    const document = host.ownerDocument;
    let watch = portalWatches.get(document);
    if (!watch) {
        watch = createPortalWatch(document);
        portalWatches.set(document, watch);
    }
    const paint = documentAnnotationPortalPaint(mirror);
    const entry: DocumentAnnotationPortalEntry = {
        source: host,
        mirror,
        paint,
        sourceAnchor: sourceAnchorRange(host),
        settled: { source: { x: 0, y: 0 }, root: { x: 0, y: 0 } },
        applied: { x: 0, y: 0 },
        preparedClip: null,
        clipChain: [],
        clipTopologyEpoch: -1,
        scheduleProjection,
        projectImmediately,
        retire,
    };
    watch.entries.set(mirror, entry);
    prepareDocumentAnnotationPortalMirrors([mirror]);
    settleDocumentAnnotationPortalMirrors([mirror]);
}

function createPortalWatch(document: Document): DocumentAnnotationPortalWatch {
    const lifecycle = new AbortController();
    const entries = new Map<HTMLElement, DocumentAnnotationPortalEntry>();
    const watch: DocumentAnnotationPortalWatch = {
        entries,
        lifecycle,
        topologyEpoch: 0,
        scrollSettleEntries: new Set(),
        scrollSettleTimer: null,
    };
    const view = document.defaultView;
    const visibleEntries = (): DocumentAnnotationPortalEntry[] => {
        if (document.hidden) return [];
        return pruneAndCollectEntries(document, watch);
    };
    const alignForScroll = (): void => {
        const live = visibleEntries();
        if (!live.length) return;
        const alignments = alignPortalEntries(live);
        scheduleClippedPortalScrollSettle(document, watch, alignments);
    };
    const alignThenScheduleAll = (): void => {
        const live = visibleEntries();
        if (!live.length) return;
        cancelClippedPortalScrollSettle(document, watch);
        alignPortalEntries(live);
        live.forEach(entry => entry.scheduleProjection());
    };
    const scheduleVisibleProjection = (): void => {
        cancelClippedPortalScrollSettle(document, watch);
        const live = visibleEntries();
        live.forEach(entry => entry.scheduleProjection());
    };
    const projectForTopLayerChange = (): void => {
        cancelClippedPortalScrollSettle(document, watch);
        const live = visibleEntries();
        if (!live.length) return;
        live.forEach(entry => entry.scheduleProjection());
    };
    const projectAffectedTransition = (event: Event): void => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        const affected = visibleEntries().filter(entry => transitionCanMoveSource(target, entry.source));
        if (!affected.length) return;
        affected.forEach(entry => watch.scrollSettleEntries.delete(entry));
        if (!watch.scrollSettleEntries.size) cancelClippedPortalScrollSettle(document, watch);
        affected.forEach(entry => { entry.clipTopologyEpoch = -1; });
        alignPortalEntries(affected);
        // transitionend is already the settled boundary. Reproject only the
        // affected portals rather than scheduling a whole-document Range pass.
        affected.forEach(entry => entry.projectImmediately());
    };

    view?.addEventListener('scroll', alignForScroll, {
        capture: true,
        passive: true,
        signal: lifecycle.signal,
    });
    view?.addEventListener('resize', () => {
        watch.topologyEpoch += 1;
        alignThenScheduleAll();
    }, {
        passive: true,
        signal: lifecycle.signal,
    });
    view?.visualViewport?.addEventListener('scroll', alignForScroll, {
        passive: true,
        signal: lifecycle.signal,
    });
    view?.visualViewport?.addEventListener('resize', alignThenScheduleAll, {
        passive: true,
        signal: lifecycle.signal,
    });
    document.addEventListener('visibilitychange', scheduleVisibleProjection, {
        signal: lifecycle.signal,
    });
    document.addEventListener('fullscreenchange', projectForTopLayerChange, {
        signal: lifecycle.signal,
    });
    document.addEventListener('toggle', projectForTopLayerChange, {
        capture: true,
        signal: lifecycle.signal,
    });
    // One delegated listener, not one bubbling listener on every ancestor of
    // every portal. Unrelated player/theme transitions therefore do no work.
    document.addEventListener('transitionend', projectAffectedTransition, {
        capture: true,
        passive: true,
        signal: lifecycle.signal,
    });
    return watch;
}

/**
 * A document scroll is an affine translation of a portal's already-projected
 * paint plane. Rebuilding every source fragment after each momentum tick is
 * both redundant and catastrophically expensive for long descriptions. A
 * nested authored clip is the exception: scrolling can reveal ranges that had
 * no fragment at the previous clip position, so settle only those affected
 * portals once the scroll burst goes quiet.
 */
function scheduleClippedPortalScrollSettle(
    document: Document,
    watch: DocumentAnnotationPortalWatch,
    alignments: readonly PendingAlignment[],
): void {
    for (const alignment of alignments) {
        // Intersecting an offscreen clip chain can yield an empty bounds object.
        // Reprojecting it would both waste Range work and clear every projected
        // source fragment until a later visible refresh rebuilds the portal.
        const visibleClip = alignment.clip
            && alignment.clip.right - alignment.clip.left > 0.5
            && alignment.clip.bottom - alignment.clip.top > 0.5;
        const movedInsideClip = Boolean(visibleClip)
            && (Math.abs(alignment.x) > 0.01 || Math.abs(alignment.y) > 0.01);
        if (movedInsideClip) watch.scrollSettleEntries.add(alignment.entry);
        else watch.scrollSettleEntries.delete(alignment.entry);
    }
    if (!watch.scrollSettleEntries.size) {
        cancelClippedPortalScrollSettle(document, watch);
        return;
    }

    if (watch.scrollSettleTimer !== null) document.defaultView?.clearTimeout(watch.scrollSettleTimer);
    const view = document.defaultView;
    if (!view) {
        const pending = [...watch.scrollSettleEntries];
        watch.scrollSettleEntries.clear();
        pending.forEach(entry => entry.scheduleProjection());
        return;
    }
    watch.scrollSettleTimer = view.setTimeout(() => {
        watch.scrollSettleTimer = null;
        if (portalWatches.get(document) !== watch) {
            watch.scrollSettleEntries.clear();
            return;
        }
        const live = new Set(pruneAndCollectEntries(document, watch));
        const pending = [...watch.scrollSettleEntries];
        watch.scrollSettleEntries.clear();
        pending.filter(entry => live.has(entry)).forEach(entry => entry.scheduleProjection());
    }, CLIPPED_PORTAL_SCROLL_SETTLE_MS);
}

function cancelClippedPortalScrollSettle(document: Document, watch: DocumentAnnotationPortalWatch): void {
    if (watch.scrollSettleTimer !== null) document.defaultView?.clearTimeout(watch.scrollSettleTimer);
    watch.scrollSettleTimer = null;
    watch.scrollSettleEntries.clear();
}

function disposePortalWatch(document: Document, watch: DocumentAnnotationPortalWatch): void {
    cancelClippedPortalScrollSettle(document, watch);
    watch.lifecycle.abort();
    if (portalWatches.get(document) === watch) portalWatches.delete(document);
}

/**
 * Read every live source/root before writing any portal style. This avoids the
 * read-write-read-write forced-layout train the old per-entry loop created.
 */
function alignPortalEntries(entries: readonly DocumentAnnotationPortalEntry[]): PendingAlignment[] {
    const pending = readPortalAlignments(entries);
    for (const alignment of pending) writePortalAlignment(alignment);
    return pending;
}

function readPortalAlignments(entries: readonly DocumentAnnotationPortalEntry[]): PendingAlignment[] {
    const clips = measurePortalClipBounds(entries);
    return entries.map((entry, index) => {
        const source = portalSourcePoint(entry);
        const rootRect = entry.mirror.getBoundingClientRect();
        // The current root rect includes no paint-plane transform; the transform
        // lives on the child precisely so root/clip measurement stays stable.
        const clip = clips[index] ?? null;
        entry.preparedClip = clip;
        const root = clip
            ? { x: clip.left, y: clip.top }
            : { x: rootRect.left, y: rootRect.top };
        return {
            entry,
            source,
            root,
            clip,
            x: source.x - entry.settled.source.x - (root.x - entry.settled.root.x),
            y: source.y - entry.settled.source.y - (root.y - entry.settled.root.y),
        };
    });
}

function writePortalAlignment(alignment: PendingAlignment): void {
    const { entry, clip, x, y } = alignment;
    applyPortalClipGeometry(entry.mirror, clip);
    entry.applied = { x, y };
    if (Math.abs(x) <= 0.01 && Math.abs(y) <= 0.01) {
        entry.paint.style.setProperty('transform', 'none', 'important');
    } else {
        entry.paint.style.setProperty('transform', `translate3d(${x}px, ${y}px, 0)`, 'important');
    }
}

/**
 * Write phase before an exact Range projection. Callers pass the whole batch,
 * so every transform/clip write lands before any source geometry is read.
 */
export function prepareDocumentAnnotationPortalMirrors(mirrors: readonly HTMLElement[]): void {
    const entries = portalEntriesForMirrors(mirrors);
    const clips = measurePortalClipBounds(entries);
    for (const [index, entry] of entries.entries()) {
        const clip = clips[index] ?? null;
        entry.preparedClip = clip;
        applyPortalClipGeometry(entry.mirror, clip);
        entry.paint.style.setProperty('transform', 'none', 'important');
        entry.applied = { x: 0, y: 0 };
    }
}

/** Clip already measured in the current prepare/alignment read batch. */
export function preparedDocumentAnnotationPortalClipBounds(
    mirror: HTMLElement,
): DocumentAnnotationPortalClipBounds | null {
    return portalWatches.get(mirror.ownerDocument)?.entries.get(mirror)?.preparedClip ?? null;
}

/** Host/ancestor style changes can alter which composed ancestors clip paint. */
export function invalidateDocumentAnnotationPortalClipTopology(mirror: HTMLElement): void {
    const entry = portalWatches.get(mirror.ownerDocument)?.entries.get(mirror);
    if (entry) entry.clipTopologyEpoch = -1;
}

/**
 * Read phase after exact projection. Refresh the Range anchor after framework
 * child replacement, then snapshot source and portal root together.
 */
export function settleDocumentAnnotationPortalMirrors(mirrors: readonly HTMLElement[]): void {
    const entries = portalEntriesForMirrors(mirrors);
    const snapshots = entries.map(entry => {
        entry.sourceAnchor = sourceAnchorRange(entry.source);
        return {
            entry,
            source: portalSourcePoint(entry),
            rootRect: entry.mirror.getBoundingClientRect(),
        };
    });
    for (const { entry, source, rootRect } of snapshots) {
        entry.settled = {
            source,
            root: { x: rootRect.left, y: rootRect.top },
        };
        entry.applied = { x: 0, y: 0 };
    }
}

/** Live registered portals whose page-owned source belongs to root. */
export function documentAnnotationPortalMirrorsWithin(root: ParentNode = document): HTMLElement[] {
    const document = root instanceof Document ? root : (root as Node).ownerDocument;
    if (!document) return [];
    const watch = portalWatches.get(document);
    if (!watch) return [];
    return pruneAndCollectEntries(document, watch)
        .filter(entry => root instanceof Document || rootContains(root, entry.source))
        .map(entry => entry.mirror);
}

/**
 * Resolve all clip chains with one computed-style cache and all current boxes
 * with one rect cache. The chain itself is topology, so ordinary scroll frames
 * only re-read the handful of actual clipping ancestors, not every ancestor of
 * every portal.
 */
function measurePortalClipBounds(
    entries: readonly DocumentAnnotationPortalEntry[],
): Array<DocumentAnnotationPortalClipBounds | null> {
    const styles = new Map<HTMLElement, CSSStyleDeclaration>();
    const rects = new Map<HTMLElement, DOMRect>();
    return entries.map(entry => {
        const watch = portalWatches.get(entry.source.ownerDocument);
        const epoch = watch?.topologyEpoch ?? 0;
        if (entry.clipTopologyEpoch !== epoch) {
            entry.clipChain = portalClipChain(entry.source, styles);
            entry.clipTopologyEpoch = epoch;
        }
        return clipBoundsFromChain(entry.source, entry.clipChain, rects);
    });
}

function portalClipChain(
    source: HTMLElement,
    styles: Map<HTMLElement, CSSStyleDeclaration>,
): PortalClipAncestor[] {
    const chain: PortalClipAncestor[] = [];
    for (const element of composedAncestors(source)) {
        if (element === source.ownerDocument.body || element === source.ownerDocument.documentElement) break;
        let style = styles.get(element);
        if (!style) {
            style = safeComputedStyle(element);
            portalClipTopologyStyleReadCount += 1;
            styles.set(element, style);
        }
        const clipsX = overflowClips(style.overflowX) || paintContainmentClips(style);
        const clipsY = overflowClips(style.overflowY) || paintContainmentClips(style);
        if (clipsX || clipsY) chain.push({ element, clipsX, clipsY });
    }
    return chain;
}

function clipBoundsFromChain(
    source: HTMLElement,
    chain: readonly PortalClipAncestor[],
    rects: Map<HTMLElement, DOMRect>,
): DocumentAnnotationPortalClipBounds | null {
    if (!chain.length) return null;
    const view = source.ownerDocument.defaultView;
    let bounds: DocumentAnnotationPortalClipBounds = {
        left: 0,
        top: 0,
        right: view?.innerWidth ?? source.ownerDocument.documentElement.clientWidth,
        bottom: view?.innerHeight ?? source.ownerDocument.documentElement.clientHeight,
    };
    for (const { element, clipsX, clipsY } of chain) {
        let rect = rects.get(element);
        if (!rect) {
            rect = element.getBoundingClientRect();
            portalClipRectReadCount += 1;
            rects.set(element, rect);
        }
        if (clipsX) {
            bounds.left = Math.max(bounds.left, rect.left);
            bounds.right = Math.min(bounds.right, rect.right);
        }
        if (clipsY) {
            bounds.top = Math.max(bounds.top, rect.top);
            bounds.bottom = Math.min(bounds.bottom, rect.bottom);
        }
    }
    return bounds;
}

/**
 * General prose uses an in-host mirror under scaling/rotation. Exact empty
 * source fragments could be sized in viewport pixels, but projected reading
 * typography would otherwise retain the untransformed font metrics. YouTube's
 * narrowly page-owned chrome still uses the portal; this guard only narrows the
 * broad framework-prose promotion.
 */
export function documentAnnotationPortalHasNonTranslationTransform(source: HTMLElement): boolean {
    for (const element of composedAncestors(source)) {
        const transform = safeComputedStyle(element).transform;
        if (transform && transform !== 'none' && !transformIsTranslationOnly(transform)) return true;
        if (element === source.ownerDocument.body || element === source.ownerDocument.documentElement) break;
    }
    return false;
}

export function unregisterDocumentAnnotationPortalMirror(mirror: HTMLElement): void {
    const document = mirror.ownerDocument;
    const watch = portalWatches.get(document);
    if (!watch) return;
    const entry = watch.entries.get(mirror);
    watch.entries.delete(mirror);
    if (entry) watch.scrollSettleEntries.delete(entry);
    if (!watch.scrollSettleEntries.size && watch.scrollSettleTimer !== null) {
        cancelClippedPortalScrollSettle(document, watch);
    }
    if (watch.entries.size) return;
    disposePortalWatch(document, watch);
}

function portalEntriesForMirrors(mirrors: readonly HTMLElement[]): DocumentAnnotationPortalEntry[] {
    const entries: DocumentAnnotationPortalEntry[] = [];
    for (const mirror of mirrors) {
        const entry = portalWatches.get(mirror.ownerDocument)?.entries.get(mirror);
        if (entry && mirror.isConnected && entry.source.isConnected) entries.push(entry);
    }
    return entries;
}

function pruneAndCollectEntries(
    document: Document,
    watch: DocumentAnnotationPortalWatch,
): DocumentAnnotationPortalEntry[] {
    const live: DocumentAnnotationPortalEntry[] = [];
    const retired: DocumentAnnotationPortalEntry[] = [];
    for (const entry of watch.entries.values()) {
        if (!entry.mirror.isConnected || !entry.source.isConnected) retired.push(entry);
        else live.push(entry);
    }
    // Never call back into mirror teardown while iterating the registry: it
    // unregisters the same entry. Delete first, then retire the host state.
    retired.forEach(entry => watch.entries.delete(entry.mirror));
    retired.forEach(entry => watch.scrollSettleEntries.delete(entry));
    retired.forEach(entry => entry.retire());
    if (!watch.scrollSettleEntries.size && watch.scrollSettleTimer !== null) {
        cancelClippedPortalScrollSettle(document, watch);
    }
    if (!watch.entries.size) {
        disposePortalWatch(document, watch);
    }
    return live;
}

function portalSourcePoint(entry: DocumentAnnotationPortalEntry): PortalPoint {
    const rect = validAnchorRect(entry.sourceAnchor) ?? entry.source.getBoundingClientRect();
    return { x: rect.left, y: rect.top };
}

function validAnchorRect(range: Range | null): DOMRect | null {
    if (!range) return null;
    const container = range.startContainer;
    if (!container.isConnected) return null;
    const rect = range.getBoundingClientRect();
    return Number.isFinite(rect.left) && Number.isFinite(rect.top) && rect.width > 0 && rect.height > 0
        ? rect
        : null;
}

function sourceAnchorRange(source: HTMLElement): Range | null {
    if (typeof Range !== 'function' || typeof Range.prototype.getBoundingClientRect !== 'function') return null;
    const walker = source.ownerDocument.createTreeWalker(source, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const text = node.textContent ?? '';
            return /\S/u.test(text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        },
    });
    const node = walker.nextNode();
    if (!(node instanceof Text)) return null;
    const first = node.data.search(/\S/u);
    if (first < 0) return null;
    const range = source.ownerDocument.createRange();
    range.setStart(node, first);
    range.setEnd(node, Math.min(node.length, first + 1));
    return range;
}

function applyPortalClipGeometry(
    mirror: HTMLElement,
    clip: DocumentAnnotationPortalClipBounds | null,
): void {
    if (!clip) {
        setImportantStyle(mirror, 'left', '0px');
        setImportantStyle(mirror, 'top', '0px');
        setImportantStyle(mirror, 'width', '0px');
        setImportantStyle(mirror, 'height', '0px');
        setImportantStyle(mirror, 'overflow', 'visible');
        return;
    }
    setImportantStyle(mirror, 'left', `${clip.left}px`);
    setImportantStyle(mirror, 'top', `${clip.top}px`);
    setImportantStyle(mirror, 'width', `${Math.max(0, clip.right - clip.left)}px`);
    setImportantStyle(mirror, 'height', `${Math.max(0, clip.bottom - clip.top)}px`);
    setImportantStyle(mirror, 'overflow', 'hidden');
}

function transitionCanMoveSource(target: Node, source: HTMLElement): boolean {
    if (target === source) return true;
    if (!(target instanceof Element)) return false;
    return target.contains(source) || source.contains(target);
}

function rootContains(root: ParentNode, source: HTMLElement): boolean {
    if (root === source) return true;
    return root instanceof Node && root.contains(source);
}

function overflowClips(value: string): boolean {
    return /^(?:auto|clip|hidden|overlay|scroll)$/u.test(value);
}

/**
 * Re-enter the source's outer page stacking level instead of sitting at a
 * global maximum. Appending the portal after that context keeps its annotation
 * above the native glyphs at the same level, while ordinary authored dialogs,
 * menus, and scrims with a higher z-index continue to occlude it naturally.
 */
function documentPortalStackingLevel(source: HTMLElement): string {
    const ancestors = composedAncestors(source).reverse();
    for (const element of ancestors) {
        if (element === source.ownerDocument.body || element === source.ownerDocument.documentElement) continue;
        const style = safeComputedStyle(element);
        if (!elementCreatesStackingContext(element, style)) continue;
        return /^-?\d+$/u.test(style.zIndex) ? style.zIndex : 'auto';
    }
    return 'auto';
}

function elementCreatesStackingContext(element: HTMLElement, style: CSSStyleDeclaration): boolean {
    if (style.position === 'fixed' || style.position === 'sticky') return true;
    if (style.zIndex && style.zIndex !== 'auto') {
        const parentDisplay = element.parentElement ? safeComputedStyle(element.parentElement).display : '';
        if (style.position !== 'static' || parentDisplay.includes('flex') || parentDisplay.includes('grid')) return true;
    }
    return (style.opacity !== '' && Number.parseFloat(style.opacity) < 1)
        || (style.transform !== '' && style.transform !== 'none')
        || (style.filter !== '' && style.filter !== 'none')
        || (style.backdropFilter !== '' && style.backdropFilter !== 'none')
        || (style.perspective !== '' && style.perspective !== 'none')
        || style.isolation === 'isolate'
        || (style.mixBlendMode !== '' && style.mixBlendMode !== 'normal')
        || /(?:^|\s)(?:layout|paint|strict|content)(?:\s|$)/u.test(style.contain)
        || /(?:^|,\s*)(?:transform|opacity|filter|perspective)(?:\s*,|$)/u.test(style.willChange);
}

function paintContainmentClips(style: CSSStyleDeclaration): boolean {
    return /(?:^|\s)paint(?:\s|$)/u.test(style.contain)
        || (style.clipPath !== '' && style.clipPath !== 'none');
}

function transformIsTranslationOnly(transform: string): boolean {
    if (/^(?:translate(?:X|Y|Z|3d)?\([^)]*\)\s*)+$/iu.test(transform)) return true;
    const matrix = transform.match(/^matrix\(([^)]+)\)$/u);
    if (matrix) {
        const values = matrix[1].split(',').map(Number);
        return values.length === 6
            && values.every(Number.isFinite)
            && Math.abs(values[0] - 1) < 0.0001
            && Math.abs(values[1]) < 0.0001
            && Math.abs(values[2]) < 0.0001
            && Math.abs(values[3] - 1) < 0.0001;
    }
    const matrix3d = transform.match(/^matrix3d\(([^)]+)\)$/u);
    if (!matrix3d) return false;
    const values = matrix3d[1].split(',').map(Number);
    if (values.length !== 16 || !values.every(Number.isFinite)) return false;
    const identityIndexes = new Set([0, 5, 10, 15]);
    const translationIndexes = new Set([12, 13, 14]);
    return values.every((value, index) => translationIndexes.has(index)
        || (identityIndexes.has(index) ? Math.abs(value - 1) < 0.0001 : Math.abs(value) < 0.0001));
}

function composedAncestors(source: HTMLElement): HTMLElement[] {
    const ancestors: HTMLElement[] = [];
    const visited = new Set<HTMLElement>();
    let current: HTMLElement | null = source;
    while (current && !visited.has(current)) {
        ancestors.push(current);
        visited.add(current);
        if (current.assignedSlot) current = current.assignedSlot;
        else if (current.parentElement) current = current.parentElement;
        else {
            const root = current.getRootNode();
            current = typeof ShadowRoot !== 'undefined'
                && root instanceof ShadowRoot
                && root.host instanceof HTMLElement
                ? root.host
                : null;
        }
    }
    return ancestors;
}
