import { graphEdgePath, type GraphAnchorZone } from '../kanji/graph-geometry';
import { layoutPointToOverlay, sourceRectToOverlay } from '../ui/page-scale';

const ORIGIN_GRAPH_DRAG_THRESHOLD_PX = 6;
const ORIGIN_GRAPH_EDGE_PADDING_PERCENT = 1.8;

interface ActiveOriginGraphDrag {
    node: HTMLElement;
    pointerId: number;
    startX: number;
    startY: number;
    grabOffsetX: number;
    grabOffsetY: number;
    moved: boolean;
}

export function installOriginGraphInteractions(root: ParentNode): void {
    root.querySelectorAll<HTMLElement>('.jpdb-reader-origin-graph-wrap').forEach(wrap => {
        if (wrap.dataset.graphDragInstalled === 'true') {
            refreshOriginGraphEdgesAfterLayout(wrap);
            return;
        }
        wrap.dataset.graphDragInstalled = 'true';
        installOriginGraphDrag(wrap);
        installOriginGraphRefreshHooks(wrap);
        refreshOriginGraphEdgesAfterLayout(wrap);
    });
}

function installOriginGraphDrag(wrap: HTMLElement): void {
    let active: ActiveOriginGraphDrag | null = null;
    let suppressClick = false;
    wrap.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const target = event.target instanceof Element ? event.target : null;
        const node = target?.closest<HTMLElement>('.jpdb-reader-origin-graph-node');
        if (!node || !wrap.contains(node)) return;
        const pointer = originGraphPointerPercent(wrap, event);
        const center = originGraphNodeCenter(node);
        active = {
            node,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            grabOffsetX: center.x - pointer.x,
            grabOffsetY: center.y - pointer.y,
            moved: false,
        };
        node.classList.add('dragging');
        node.setPointerCapture?.(event.pointerId);
    });
    wrap.addEventListener('pointermove', event => {
        if (!active || active.pointerId !== event.pointerId) return;
        if (!active.moved && pointerDistance(active, event) < ORIGIN_GRAPH_DRAG_THRESHOLD_PX) return;
        event.preventDefault();
        active.moved = true;
        const pointer = originGraphPointerPercent(wrap, event);
        const next = clampOriginGraphNodePosition(wrap, active.node, pointer.x + active.grabOffsetX, pointer.y + active.grabOffsetY);
        moveOriginGraphNode(active.node, next.x, next.y);
        refreshOriginGraphEdges(wrap);
    });
    const finish = (event: PointerEvent) => {
        if (!active || active.pointerId !== event.pointerId) return;
        active.node.classList.remove('dragging');
        active.node.releasePointerCapture?.(event.pointerId);
        if (active.moved) {
            suppressClick = true;
            event.preventDefault();
            event.stopPropagation();
        }
        active = null;
    };
    wrap.addEventListener('pointerup', finish);
    wrap.addEventListener('pointercancel', finish);
    wrap.addEventListener('click', event => {
        if (!suppressClick) return;
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
    }, true);
}

function installOriginGraphRefreshHooks(wrap: HTMLElement): void {
    wrap.closest('details')?.addEventListener('toggle', () => refreshOriginGraphEdgesAfterLayout(wrap));
    wrap.querySelectorAll<HTMLInputElement>('.jpdb-reader-origin-graph-toggle input').forEach(input => {
        input.addEventListener('change', () => refreshOriginGraphEdgesAfterLayout(wrap));
    });
    if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => refreshOriginGraphEdgesAfterLayout(wrap));
        observer.observe(wrap);
        wrap.querySelectorAll<HTMLElement>('.jpdb-reader-origin-graph-node').forEach(node => observer.observe(node));
    }
}

function pointerDistance(active: { startX: number; startY: number }, event: PointerEvent): number {
    const distance = layoutPointToOverlay({
        x: event.clientX - active.startX,
        y: event.clientY - active.startY,
    });
    return Math.hypot(distance.x, distance.y);
}

function refreshOriginGraphEdgesAfterLayout(wrap: HTMLElement): void {
    setOriginGraphReady(wrap, refreshOriginGraphEdges(wrap));
    requestOriginGraphFrame(() => {
        setOriginGraphReady(wrap, refreshOriginGraphEdges(wrap));
    });
}

function requestOriginGraphFrame(callback: FrameRequestCallback): void {
    const requestFrame = typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (frameCallback: FrameRequestCallback) => window.setTimeout(() => frameCallback(performance.now()), 0);
    requestFrame(callback);
}

function setOriginGraphReady(wrap: HTMLElement, ready: boolean): void {
    if (ready) {
        wrap.dataset.graphReady = 'true';
    } else {
        delete wrap.dataset.graphReady;
    }
}

function originGraphPointerPercent(wrap: HTMLElement, event: PointerEvent): { x: number; y: number } {
    const rect = originGraphOverlayRect(wrap);
    if (!rect.width || !rect.height) return { x: 50, y: 50 };
    const pointer = layoutPointToOverlay({ x: event.clientX, y: event.clientY });
    return {
        x: ((pointer.x - rect.left) / rect.width) * 100,
        y: ((pointer.y - rect.top) / rect.height) * 100,
    };
}

function clampOriginGraphNodePosition(wrap: HTMLElement, node: HTMLElement, x: number, y: number): { x: number; y: number } {
    const measured = measuredOriginGraphNodeRadii(wrap, node);
    const fallbackRx = Number(node.dataset.rx || 5);
    const fallbackRy = Number(node.dataset.ry || 5);
    const rx = measured.rx || fallbackRx;
    const ry = measured.ry || fallbackRy;
    return {
        x: clampGraphPercent(x, rx + ORIGIN_GRAPH_EDGE_PADDING_PERCENT, 100 - rx - ORIGIN_GRAPH_EDGE_PADDING_PERCENT),
        y: clampGraphPercent(y, ry + ORIGIN_GRAPH_EDGE_PADDING_PERCENT, 100 - ry - ORIGIN_GRAPH_EDGE_PADDING_PERCENT),
    };
}

function moveOriginGraphNode(node: HTMLElement, x: number, y: number): void {
    node.dataset.x = String(x);
    node.dataset.y = String(y);
    node.style.left = `${x}%`;
    node.style.top = `${y}%`;
}

function refreshOriginGraphEdges(wrap: HTMLElement): boolean {
    const wrapRect = originGraphOverlayRect(wrap);
    if (!wrapRect.width || !wrapRect.height) return false;
    wrap.querySelectorAll<SVGGElement>('.jpdb-reader-origin-edge-group').forEach(group => {
        const from = originGraphNodeGeometry(wrap, group.dataset.from);
        const to = originGraphNodeGeometry(wrap, group.dataset.to);
        if (!from || !to) return;
        const edgePath = graphEdgePath(from, to, originGraphTargetZone(group.dataset.targetZone));
        const path = group.querySelector<SVGPathElement>('.jpdb-reader-origin-edge');
        path?.setAttribute('d', edgePath.d);
    });
    return true;
}

function originGraphNodeGeometry(wrap: HTMLElement, id: string | undefined): { x: number; y: number; rx: number; ry: number } | null {
    if (!id) return null;
    const node = Array.from(wrap.querySelectorAll<HTMLElement>('.jpdb-reader-origin-graph-node'))
        .find(candidate => candidate.dataset.graphNode === id);
    if (!node) return null;
    const measured = measuredOriginGraphNodeRadii(wrap, node);
    return {
        ...originGraphNodeCenter(node),
        rx: measured.rx || Number(node.dataset.rx || 5),
        ry: measured.ry || Number(node.dataset.ry || 5),
    };
}

function originGraphNodeCenter(node: HTMLElement): { x: number; y: number } {
    return {
        x: Number(node.dataset.x || 0),
        y: Number(node.dataset.y || 0),
    };
}

function measuredOriginGraphNodeRadii(wrap: HTMLElement, node: HTMLElement): { rx: number; ry: number } {
    const wrapRect = originGraphOverlayRect(wrap);
    if (!wrapRect.width || !wrapRect.height) return { rx: 0, ry: 0 };
    const nodeRect = !node.offsetWidth || !node.offsetHeight
        ? originGraphOverlayRect(node)
        : undefined;
    const width = node.offsetWidth || nodeRect?.width || 0;
    const height = node.offsetHeight || nodeRect?.height || 0;
    return {
        rx: width > 0 ? (width / 2 / wrapRect.width) * 100 : 0,
        ry: height > 0 ? (height / 2 / wrapRect.height) * 100 : 0,
    };
}

function originGraphOverlayRect(element: HTMLElement): DOMRect {
    return sourceRectToOverlay(element.getBoundingClientRect(), element);
}

function originGraphTargetZone(value: string | undefined): GraphAnchorZone {
    return value === 'top' || value === 'upper' || value === 'left' || value === 'right' || value === 'lower' || value === 'bottom' || value === 'center'
        ? value
        : 'auto';
}

function clampGraphPercent(value: number, min = 0, max = 100): number {
    return Math.max(min, Math.min(max, Number(value.toFixed(2))));
}
