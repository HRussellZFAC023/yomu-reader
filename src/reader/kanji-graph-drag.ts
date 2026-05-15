import {
    formatGraphCoordinate,
    graphEdgePath,
    type GraphAnchorZone,
    type GraphNodeGeometry,
} from './kanji-graph-geometry';

interface KanjiGraphDragContext {
    graph: HTMLElement;
    nodes: HTMLElement[];
    edgeGroups: SVGGElement[];
    nodeById: Map<string, HTMLElement>;
    scheduleLineUpdate: () => void;
}

interface NodeDragState {
    pointerId: number;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    moved: boolean;
}

interface GraphPoint {
    x: number;
    y: number;
}

const GRAPH_ANCHOR_ZONES = new Set<GraphAnchorZone>(['top', 'upper', 'left', 'right', 'lower', 'bottom', 'center']);
const DEFAULT_NODE_POSITION = 50;

export function installKanjiGraphDrag(root: HTMLElement): void {
    const context = kanjiGraphDragContext(root);
    if (!context) return;

    installOutboundVisibilityToggle(context);
    context.nodes.forEach(node => installDraggableGraphNode(context, node));
    requestAnimationFrame(() => updateGraphLines(context));
}

function kanjiGraphDragContext(root: HTMLElement): KanjiGraphDragContext | null {
    const graph = root.querySelector<HTMLElement>('.jpdb-reader-origin-graph-wrap');
    if (!graph) return null;

    const nodes = Array.from(graph.querySelectorAll<HTMLElement>('[data-graph-node]'));
    const edgeGroups = Array.from(graph.querySelectorAll<SVGGElement>('.jpdb-reader-origin-edge-group[data-from][data-to]'));
    const context: KanjiGraphDragContext = {
        graph,
        nodes,
        edgeGroups,
        nodeById: new Map(nodes.map(node => [node.dataset.graphNode ?? '', node])),
        scheduleLineUpdate: () => undefined,
    };
    context.scheduleLineUpdate = createLineUpdateScheduler(context);
    return context;
}

function createLineUpdateScheduler(context: KanjiGraphDragContext): () => void {
    let updateScheduled = false;
    return () => {
        if (updateScheduled) return;
        updateScheduled = true;
        requestAnimationFrame(() => {
            updateScheduled = false;
            updateGraphLines(context);
        });
    };
}

function updateGraphLines(context: KanjiGraphDragContext): void {
    context.edgeGroups.forEach(group => updateGraphEdgeGroup(context, group));
}

function updateGraphEdgeGroup(context: KanjiGraphDragContext, group: SVGGElement): void {
    const from = graphNodeByDatasetId(context, group.dataset.from);
    const to = graphNodeByDatasetId(context, group.dataset.to);
    if (!from || !to) return;

    const path = graphEdgePath(
        readNodeGeometry(context.graph, from),
        readNodeGeometry(context.graph, to),
        graphAnchorZone(group.dataset.targetZone),
    );
    group.querySelector<SVGPathElement>('.jpdb-reader-origin-edge')?.setAttribute('d', path.d);
    updateEdgeParticles(group, path.points);
}

function graphNodeByDatasetId(context: KanjiGraphDragContext, id: string | undefined): HTMLElement | undefined {
    return id ? context.nodeById.get(id) : undefined;
}

function updateEdgeParticles(group: SVGGElement, points: GraphPoint[]): void {
    group.querySelectorAll<SVGCircleElement>('.jpdb-reader-origin-edge-particle').forEach((particle, index) => {
        const point = points[index];
        if (!point) return;
        particle.setAttribute('cx', formatGraphCoordinate(point.x));
        particle.setAttribute('cy', formatGraphCoordinate(point.y));
    });
}

function readNodeGeometry(graph: HTMLElement, node: HTMLElement): GraphNodeGeometry {
    const graphRect = graph.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    return hasUsableGraphRect(graphRect, nodeRect)
        ? measuredNodeGeometry(graphRect, nodeRect)
        : fallbackNodeGeometry(node);
}

function hasUsableGraphRect(graphRect: DOMRect, nodeRect: DOMRect): boolean {
    return Boolean(graphRect.width && graphRect.height && nodeRect.width && nodeRect.height);
}

function measuredNodeGeometry(graphRect: DOMRect, nodeRect: DOMRect): GraphNodeGeometry {
    return {
        x: ((nodeRect.left + nodeRect.width / 2 - graphRect.left) / graphRect.width) * 100,
        y: ((nodeRect.top + nodeRect.height / 2 - graphRect.top) / graphRect.height) * 100,
        rx: (nodeRect.width / graphRect.width) * 50,
        ry: (nodeRect.height / graphRect.height) * 50,
    };
}

function fallbackNodeGeometry(node: HTMLElement): GraphNodeGeometry {
    return {
        x: numericDatasetValue(node, 'x', DEFAULT_NODE_POSITION),
        y: numericDatasetValue(node, 'y', DEFAULT_NODE_POSITION),
        rx: numericDatasetValue(node, 'rx', 6),
        ry: numericDatasetValue(node, 'ry', 8),
    };
}

function numericDatasetValue(node: HTMLElement, key: string, fallback: number): number {
    return Number(node.dataset[key] ?? fallback);
}

function installOutboundVisibilityToggle(context: KanjiGraphDragContext): void {
    const toggle = context.graph.querySelector<HTMLInputElement>('[data-origin-outbound-toggle]');
    if (!toggle) return;
    const syncOutboundVisibility = () => {
        context.graph.classList.toggle('show-outbound', toggle.checked);
        context.scheduleLineUpdate();
    };
    toggle.addEventListener('change', syncOutboundVisibility);
    syncOutboundVisibility();
}

function installDraggableGraphNode(context: KanjiGraphDragContext, node: HTMLElement): void {
    const state = initialNodeDragState(node);
    node.addEventListener('pointerdown', event => beginNodeDrag(node, state, event));
    node.addEventListener('pointermove', event => moveNodeDrag(context, node, state, event));
    node.addEventListener('pointerup', event => finishNodeDrag(context, node, state, event));
    node.addEventListener('pointercancel', event => finishNodeDrag(context, node, state, event));
    node.addEventListener('click', event => suppressClickAfterDrag(node, event), true);
}

function initialNodeDragState(node: HTMLElement): NodeDragState {
    return {
        pointerId: -1,
        startX: 0,
        startY: 0,
        startLeft: numericDatasetValue(node, 'x', DEFAULT_NODE_POSITION),
        startTop: numericDatasetValue(node, 'y', DEFAULT_NODE_POSITION),
        moved: false,
    };
}

function beginNodeDrag(node: HTMLElement, state: NodeDragState, event: PointerEvent): void {
    if (event.button !== 0) return;
    state.pointerId = event.pointerId;
    state.startX = event.clientX;
    state.startY = event.clientY;
    state.startLeft = numericDatasetValue(node, 'x', DEFAULT_NODE_POSITION);
    state.startTop = numericDatasetValue(node, 'y', DEFAULT_NODE_POSITION);
    state.moved = false;
    node.classList.add('dragging');
    node.setPointerCapture?.(event.pointerId);
    event.preventDefault();
}

function moveNodeDrag(context: KanjiGraphDragContext, node: HTMLElement, state: NodeDragState, event: PointerEvent): void {
    if (event.pointerId !== state.pointerId) return;
    const rect = context.graph.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const position = nextNodeDragPosition(node, state, event, rect);
    state.moved = state.moved || pointerMovedPastClickSlop(state, event);
    applyNodePosition(node, position);
    context.scheduleLineUpdate();
    event.preventDefault();
}

function nextNodeDragPosition(node: HTMLElement, state: NodeDragState, event: PointerEvent, graphRect: DOMRect): GraphPoint {
    const padding = nodeDragPadding(node, graphRect);
    return {
        x: clampPercent(state.startLeft + ((event.clientX - state.startX) / graphRect.width) * 100, padding.x),
        y: clampPercent(state.startTop + ((event.clientY - state.startY) / graphRect.height) * 100, padding.y),
    };
}

function nodeDragPadding(node: HTMLElement, graphRect: DOMRect): GraphPoint {
    const nodeRect = node.getBoundingClientRect();
    return {
        x: Math.max(6, (nodeRect.width / graphRect.width) * 50 + 2),
        y: Math.max(9, (nodeRect.height / graphRect.height) * 50 + 2),
    };
}

function clampPercent(value: number, padding: number): number {
    return Math.max(padding, Math.min(100 - padding, value));
}

function pointerMovedPastClickSlop(state: NodeDragState, event: PointerEvent): boolean {
    return Math.abs(event.clientX - state.startX) > 3 || Math.abs(event.clientY - state.startY) > 3;
}

function applyNodePosition(node: HTMLElement, position: GraphPoint): void {
    node.dataset.x = String(position.x);
    node.dataset.y = String(position.y);
    node.style.left = `${position.x}%`;
    node.style.top = `${position.y}%`;
}

function finishNodeDrag(context: KanjiGraphDragContext, node: HTMLElement, state: NodeDragState, event: PointerEvent): void {
    if (event.pointerId !== state.pointerId) return;
    node.releasePointerCapture?.(state.pointerId);
    state.pointerId = -1;
    node.classList.remove('dragging');
    if (state.moved) node.dataset.dragged = 'true';
    updateGraphLines(context);
}

function suppressClickAfterDrag(node: HTMLElement, event: MouseEvent): void {
    if (node.dataset.dragged !== 'true') return;
    delete node.dataset.dragged;
    event.preventDefault();
    event.stopImmediatePropagation();
}

function graphAnchorZone(value: string | undefined): GraphAnchorZone {
    return GRAPH_ANCHOR_ZONES.has(value as GraphAnchorZone) ? value as GraphAnchorZone : 'auto';
}
