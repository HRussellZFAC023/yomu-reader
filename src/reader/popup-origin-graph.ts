import { escapeHtml } from './dom';
import { uiText } from './i18n';
import { graphEdgePath, type GraphAnchorZone } from './kanji-graph-geometry';
import type { KanjiOriginGraph } from './kanji-origin';
import type { InterfaceLanguage } from './types';

export function renderKanjiOriginGraph(graph: KanjiOriginGraph | null, language: InterfaceLanguage): string {
    const model = buildKanjiOriginGraphRenderModel(graph);
    if (!model) return '';
    const { hasSubcomponentEdges, markerId, outboundMarkerId, subcomponentMarkerId } = model;
    const lines = renderOriginGraphLines(model);
    const nodeButtons = renderOriginGraphNodeButtons(model);
    return `
        <div class="jpdb-reader-origin-graph-wrap"${hasSubcomponentEdges ? ' data-origin-has-subcomponents="true"' : ''} aria-label="${uiText(language, 'originMapLabel')}">
            <svg class="jpdb-reader-origin-graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                    <marker id="${markerId}" viewBox="0 0 6 6" markerWidth="3" markerHeight="3" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
                        <path class="jpdb-reader-origin-edge-arrow" d="M0,0 L6,3 L0,6 L1.8,3 Z"></path>
                    </marker>
                    <marker id="${outboundMarkerId}" class="jpdb-reader-origin-edge-arrow-outbound" viewBox="0 0 6 6" markerWidth="3" markerHeight="3" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
                        <path class="jpdb-reader-origin-edge-arrow" d="M0,0 L6,3 L0,6 L1.8,3 Z"></path>
                    </marker>
                    <marker id="${subcomponentMarkerId}" class="jpdb-reader-origin-edge-arrow-subcomponent" viewBox="0 0 6 6" markerWidth="3" markerHeight="3" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
                        <path class="jpdb-reader-origin-edge-arrow" d="M0,0 L6,3 L0,6 L1.8,3 Z"></path>
                    </marker>
                </defs>
                ${lines}
            </svg>
            ${renderOriginGraphToggles(model, language)}
            ${nodeButtons}
        </div>
    `;
}

function renderOriginGraphToggles(model: OriginGraphRenderModel, language: InterfaceLanguage): string {
    const toggles = [
        model.hasSubcomponentEdges ? renderOriginGraphToggle(uiText(language, 'originShowSubcomponents'), 'data-origin-subcomponent-toggle') : '',
        model.hasOutboundEdges ? renderOriginGraphToggle(uiText(language, 'originShowOutbound'), 'data-origin-outbound-toggle') : '',
    ].filter(Boolean);
    return toggles.length ? `<div class="jpdb-reader-origin-graph-toggles">${toggles.join('')}</div>` : '';
}

function renderOriginGraphToggle(label: string, attribute: string): string {
    return `<label class="jpdb-reader-origin-graph-toggle" title="${escapeHtml(label)}">
        <input type="checkbox" ${attribute} checked>
        <span>${escapeHtml(label)}</span>
    </label>`;
}

type OriginGraphNode = KanjiOriginGraph['nodes'][number];
type OriginGraphEdge = KanjiOriginGraph['edges'][number];

const SIMPLIFIED_ONLY_COMPONENTS = new Set(['讠', '钅', '饣', '纟', '门', '车', '贝', '见', '长', '马', '鸟', '鱼']);
const TOP_COMPONENTS = new Set(['亠', '宀', '冖', '艹', '⺾', '竹', '⺮', '雨', '穴', '覀', '西', '爫', '𠂉']);
const BOTTOM_COMPONENTS = new Set(['心', '忄', '灬', '儿', '皿', '貝', '贝', '日', '寸', '廾']);
const LEFT_COMPONENTS = new Set(['亻', '人', '彳', '氵', '忄', '扌', '木', '言', '訁', '口', '女', '糸', '纟', '土', '王', '犭', '礻', '衤', '月', '火', '禾', '虫', '足', '車', '车']);
const RIGHT_COMPONENTS = new Set(['阝', '刂', '卩', '頁', '页', '隹', '攵', '殳', '欠', '鳥', '鸟']);
const WHOLE_COMPONENTS = new Set(['大', '夫', '天', '失', '央', '本', '末', '未']);
const KNOWN_COMPONENT_ZONES: Array<[OriginComponentZone, Set<string>]> = [
    ['top', TOP_COMPONENTS],
    ['bottom', BOTTOM_COMPONENTS],
    ['center', WHOLE_COMPONENTS],
    ['left', LEFT_COMPONENTS],
    ['right', RIGHT_COMPONENTS],
];

type OriginComponentZone = 'top' | 'upper' | 'left' | 'center' | 'right' | 'lower' | 'bottom';
const COMPONENT_POSITION_ZONES: Array<[RegExp, OriginComponentZone]> = [
    [/へん|left/, 'left'],
    [/つくり|right/, 'right'],
    [/かんむり|top|upper/, 'top'],
    [/あし|した|bottom|lower/, 'bottom'],
    [/かまえ|enclosure|surround/, 'center'],
];

const OUTBOUND_COMPONENT_PLACEMENT_OVERRIDES = new Map<string, OriginComponentZone>([
    ['夫\u0000失', 'upper'],
    ['夫\u0000替', 'top'],
    ['夫\u0000難', 'left'],
    ['夫\u0000僕', 'lower'],
]);

const INBOUND_COMPONENT_PLACEMENT_OVERRIDES = new Map<string, { zone: OriginComponentZone; x: number; y: number }>([
    ['友\u0000ナ', { zone: 'upper', x: 33, y: 39 }],
    ['友\u0000又', { zone: 'bottom', x: 58, y: 72 }],
]);

interface OriginEdgeGroup {
    from: string;
    to: string;
    labels: string[];
}

interface PositionedOriginNode {
    node: OriginGraphNode;
    x: number;
    y: number;
    rx: number;
    ry: number;
}

interface OriginGraphBase {
    nodes: OriginGraphNode[];
    nodeById: Map<string, OriginGraphNode>;
    edges: OriginGraphEdge[];
    current: OriginGraphNode;
}

interface OriginGraphRenderModel {
    current: OriginGraphNode;
    nodeById: Map<string, OriginGraphNode>;
    edgeGroups: OriginEdgeGroup[];
    positioned: PositionedOriginNode[];
    primaryIds: Set<string>;
    outboundIds: Set<string>;
    subcomponentIds: Set<string>;
    markerId: string;
    outboundMarkerId: string;
    subcomponentMarkerId: string;
    hasOutboundEdges: boolean;
    hasSubcomponentEdges: boolean;
}

interface OriginNodeState extends PositionedOriginNode {
    vx: number;
    vy: number;
    anchorX: number;
    anchorY: number;
    anchorPinned: boolean;
    collision: number;
}

interface OriginGeometryReference {
    x: number;
    y: number;
    rx: number;
    ry: number;
}

function buildKanjiOriginGraphRenderModel(graph: KanjiOriginGraph | null): OriginGraphRenderModel | null {
    const base = originGraphBase(graph);
    if (!base) return null;
    const selectedEdges = selectedOriginGraphEdges(base);
    const visible = visibleOriginGraph(base, selectedEdges);
    if (!visible) return null;

    const roles = originGraphNodeRoles(visible.edgeGroups, base.current.id);
    const positioned = forceLayoutOriginGraph(visible.nodes, visible.edgeGroups, base.current.id);
    const markerId = originGraphMarkerId(positioned);
    return {
        current: base.current,
        nodeById: base.nodeById,
        edgeGroups: visible.edgeGroups,
        positioned,
        ...roles,
        markerId,
        outboundMarkerId: `${markerId}-outbound`,
        subcomponentMarkerId: `${markerId}-subcomponent`,
        hasOutboundEdges: visible.edgeGroups.some(edge => isOriginOutboundEdge(edge, base.current.id)),
        hasSubcomponentEdges: visible.edgeGroups.some(isOriginSubcomponentEdge),
    };
}

function originGraphBase(graph: KanjiOriginGraph | null): OriginGraphBase | null {
    const nodes = originGraphRenderableNodes(graph);
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const edges = originGraphRenderableEdges(graph, nodeById);
    if (shouldSkipOriginGraph(nodes, edges)) return null;
    return {
        nodes,
        nodeById,
        edges,
        current: originGraphCurrentNode(nodes),
    };
}

function originGraphRenderableNodes(graph: KanjiOriginGraph | null): OriginGraphNode[] {
    return graph?.nodes.filter(node => !node.id.startsWith('rtk:')) ?? [];
}

function originGraphRenderableEdges(graph: KanjiOriginGraph | null, nodeById: Map<string, OriginGraphNode>): OriginGraphEdge[] {
    const nodeIds = new Set(nodeById.keys());
    return graph?.edges.filter(edge => nodeIds.has(edge.from) && nodeIds.has(edge.to)) ?? [];
}

function shouldSkipOriginGraph(nodes: OriginGraphNode[], edges: OriginGraphEdge[]): boolean {
    return nodes.length <= 1 || !edges.length;
}

function originGraphCurrentNode(nodes: OriginGraphNode[]): OriginGraphNode {
    return nodes.find(node => node.kind === 'current') ?? nodes[0];
}

function selectedOriginGraphEdges(base: OriginGraphBase): OriginEdgeGroup[] {
    const groupedEdges = groupOriginEdges(base.edges);
    const primaryEdges = selectOriginEdgeGroups(
        groupedEdges.filter(edge => !isOriginOutboundEdge(edge, base.current.id) && !isOriginSubcomponentEdge(edge)),
        base.nodeById,
    );
    return [
        ...primaryEdges,
        ...selectOriginSubcomponentEdgeGroups(groupedEdges, base.nodeById),
        ...selectOriginOutboundEdgeGroups(groupedEdges, base.nodeById, base.current.id),
    ];
}

function visibleOriginGraph(
    base: OriginGraphBase,
    selectedEdges: OriginEdgeGroup[],
): { nodes: OriginGraphNode[]; edgeGroups: OriginEdgeGroup[] } | null {
    if (!selectedEdges.length) {
        return null;
    }

    const connectedIds = connectedOriginNodeIds(base.current.id, selectedEdges);
    const graphNodes = base.nodes.filter(node => connectedIds.has(node.id) && !isNoisyOriginNode(node));
    const visibleNodes = chooseOriginGraphNodes(graphNodes, selectedEdges, base.current.id);
    const visibleIds = new Set(visibleNodes.map(node => node.id));
    const edgeGroups = selectedEdges.filter(edge => visibleIds.has(edge.from) && visibleIds.has(edge.to));
    if (visibleNodes.length <= 1 || !edgeGroups.length) {
        return null;
    }
    return { nodes: visibleNodes, edgeGroups };
}

function connectedOriginNodeIds(currentId: string, edges: OriginEdgeGroup[]): Set<string> {
    const ids = new Set([currentId]);
    edges.forEach(edge => {
        ids.add(edge.from);
        ids.add(edge.to);
    });
    return ids;
}

function originGraphNodeRoles(edgeGroups: OriginEdgeGroup[], currentId: string): Pick<OriginGraphRenderModel, 'primaryIds' | 'outboundIds' | 'subcomponentIds'> {
    const primaryIds = new Set([currentId]);
    const outboundIds = new Set<string>();
    const subcomponentIds = new Set<string>();
    edgeGroups.forEach(edge => addOriginGraphNodeRole(edge, currentId, primaryIds, outboundIds, subcomponentIds));
    return { primaryIds, outboundIds, subcomponentIds };
}

function addOriginGraphNodeRole(
    edge: OriginEdgeGroup,
    currentId: string,
    primaryIds: Set<string>,
    outboundIds: Set<string>,
    subcomponentIds: Set<string>,
): void {
    if (isOriginOutboundEdge(edge, currentId)) {
        outboundIds.add(edge.to);
        return;
    }
    if (isOriginSubcomponentEdge(edge)) {
        subcomponentIds.add(edge.from);
        if (edge.to !== currentId) subcomponentIds.add(edge.to);
        return;
    }
    primaryIds.add(edge.from);
    primaryIds.add(edge.to);
}

function originGraphMarkerId(positioned: PositionedOriginNode[]): string {
    return `jpdb-reader-origin-target-${hashOriginGraphId(positioned.map(item => item.node.id).join('|'))}`;
}

function renderOriginGraphLines(model: OriginGraphRenderModel): string {
    const coords = new Map(model.positioned.map(item => [item.node.id, item]));
    return model.edgeGroups
        .map(edge => renderOriginGraphEdgeGroup(edge, coords, model))
        .join('');
}

function renderOriginGraphEdgeGroup(
    edge: OriginEdgeGroup,
    coords: Map<string, PositionedOriginNode>,
    model: OriginGraphRenderModel,
): string {
    const from = coords.get(edge.from);
    const to = coords.get(edge.to);
    if (!from || !to) return '';
    const targetZone = originEdgeTargetZone(edge, model.current.id, model.nodeById);
    const edgePath = clippedOriginEdgePath(from, to, targetZone);
    const label = edge.labels.join(' / ');
    const outbound = isOriginOutboundEdge(edge, model.current.id);
    const subcomponent = isOriginSubcomponentEdge(edge);
    const outboundAttrs = outbound ? ' data-origin-outbound="true"' : '';
    const subcomponentAttrs = subcomponent ? ' data-origin-subcomponent="true"' : '';
    const markerId = outbound ? model.outboundMarkerId : subcomponent ? model.subcomponentMarkerId : model.markerId;
    return `<g class="jpdb-reader-origin-edge-group${outbound ? ' outbound' : ''}${subcomponent ? ' subcomponent' : ''}" data-from="${escapeHtml(edge.from)}" data-to="${escapeHtml(edge.to)}" data-label="${escapeHtml(label)}" data-target-zone="${targetZone}"${outboundAttrs}${subcomponentAttrs}>
        <path class="jpdb-reader-origin-edge" d="${edgePath.d}" marker-end="url(#${markerId})"><title>${escapeHtml(label)}</title></path>
    </g>`;
}

function renderOriginGraphNodeButtons(model: OriginGraphRenderModel): string {
    return model.positioned.map(node => renderOriginGraphNodeButton(node, model)).join('');
}

function renderOriginGraphNodeButton(positioned: PositionedOriginNode, model: OriginGraphRenderModel): string {
    const { node, x, y, rx, ry } = positioned;
    const style = `left:${formatGraphNumber(x)}%;top:${formatGraphNumber(y)}%`;
    const outboundOnly = node.id !== model.current.id && model.outboundIds.has(node.id) && !model.primaryIds.has(node.id);
    const subcomponentOnly = node.id !== model.current.id && model.subcomponentIds.has(node.id) && !model.primaryIds.has(node.id) && !model.outboundIds.has(node.id);
    const attrs = `data-graph-node="${escapeHtml(node.id)}" data-label-length="${originGraphLabelLengthAttribute(node.label)}" data-x="${formatGraphNumber(x)}" data-y="${formatGraphNumber(y)}" data-rx="${formatGraphNumber(rx)}" data-ry="${formatGraphNumber(ry)}"${outboundOnly ? ' data-origin-outbound="true"' : ''}${subcomponentOnly ? ' data-origin-subcomponent="true"' : ''} style="${style}"`;
    if (node.kind === 'related') return renderRelatedOriginGraphNode(node, attrs);
    return renderKanjiOriginGraphNode(node, attrs);
}

function originGraphLabelLengthAttribute(label: string): string {
    const length = Array.from(label).length;
    return length > 2 ? 'many' : String(length || 1);
}

function renderRelatedOriginGraphNode(node: OriginGraphNode, attrs: string): string {
    return `<span class="jpdb-reader-origin-graph-node ${node.kind}" ${attrs} title="${escapeHtml(node.detail)}">${escapeHtml(node.label)}</span>`;
}

function renderKanjiOriginGraphNode(node: OriginGraphNode, attrs: string): string {
    const title = [node.detail, node.source].filter(Boolean).join(' · ');
    return `<button class="jpdb-reader-origin-graph-node ${node.kind}" type="button" data-action="kanji" data-kanji="${escapeHtml(node.id)}" ${attrs} title="${escapeHtml(title)}">${escapeHtml(node.label)}</button>`;
}

function chooseOriginGraphNodes(nodes: OriginGraphNode[], edges: OriginEdgeGroup[], currentId: string): OriginGraphNode[] {
    const current = nodes.find(node => node.id === currentId) ?? nodes[0];
    const degree = new Map<string, number>();
    edges.forEach(edge => {
        degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
        degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    });
    const ranked = nodes
        .filter(node => node.id !== current.id)
        .sort((a, b) => {
            const priority = originNodePriority(a.id, edges, current.id) - originNodePriority(b.id, edges, current.id);
            if (priority) return priority;
            const degreeDelta = (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0);
            if (degreeDelta) return degreeDelta;
            return a.label.localeCompare(b.label, 'ja');
        });
    return [current, ...ranked.slice(0, 18)];
}

function originNodePriority(id: string, edges: OriginEdgeGroup[], currentId: string): number {
    if (edges.some(edge => edge.from === id && edge.to === currentId)) return 0;
    if (edges.some(edge => edge.from === currentId && edge.to === id)) return 1;
    if (edges.some(edge => edge.from === id || edge.to === id)) return 2;
    return 3;
}

function selectOriginEdgeGroups(groups: OriginEdgeGroup[], nodeById: Map<string, OriginGraphNode>): OriginEdgeGroup[] {
    const useful = groups.filter(edge => {
        const from = nodeById.get(edge.from);
        const to = nodeById.get(edge.to);
        return from && to && !isNoisyOriginNode(from) && !isNoisyOriginNode(to);
    });
    const structural = useful.filter(edge => edge.labels.some(label => label === 'radical' || label === 'structural part'));
    if (structural.length) return structural;
    const jpdb = useful.filter(edge => edge.labels.includes('JPDB component'));
    if (jpdb.length) return jpdb;
    return useful.filter(edge => !edge.labels.includes('memory cue'));
}

function selectOriginOutboundEdgeGroups(groups: OriginEdgeGroup[], nodeById: Map<string, OriginGraphNode>, currentId: string): OriginEdgeGroup[] {
    return groups.filter(edge => {
        if (!isOriginOutboundEdge(edge, currentId)) return false;
        const to = nodeById.get(edge.to);
        return to && !isNoisyOriginNode(to);
    });
}

function selectOriginSubcomponentEdgeGroups(groups: OriginEdgeGroup[], nodeById: Map<string, OriginGraphNode>): OriginEdgeGroup[] {
    return groups.filter(edge => {
        if (!isOriginSubcomponentEdge(edge)) return false;
        const from = nodeById.get(edge.from);
        const to = nodeById.get(edge.to);
        return from && to && !isNoisyOriginNode(from) && !isNoisyOriginNode(to);
    });
}

function isOriginOutboundEdge(edge: OriginEdgeGroup, currentId: string): boolean {
    return edge.from === currentId && edge.to !== currentId;
}

function isOriginSubcomponentEdge(edge: OriginEdgeGroup): boolean {
    return edge.labels.includes('subcomponent');
}

function originEdgeTargetZone(edge: OriginEdgeGroup, currentId: string, nodeById: Map<string, OriginGraphNode>): GraphAnchorZone {
    if (edge.to === currentId) {
        const source = nodeById.get(edge.from);
        return source ? inferInboundComponentZone(source, currentId) : 'auto';
    }
    if (edge.from === currentId) {
        const target = nodeById.get(edge.to);
        return target ? inferOutboundComponentZone(currentId, target) : 'auto';
    }
    if (isOriginSubcomponentEdge(edge)) {
        const source = nodeById.get(edge.from);
        return source ? inferInboundComponentZone(source, edge.to) : 'auto';
    }
    return 'auto';
}

function isNoisyOriginNode(node: OriginGraphNode): boolean {
    return SIMPLIFIED_ONLY_COMPONENTS.has(node.id) || SIMPLIFIED_ONLY_COMPONENTS.has(node.label);
}

function groupOriginEdges(edges: OriginGraphEdge[]): OriginEdgeGroup[] {
    const groups = new Map<string, OriginEdgeGroup>();
    for (const edge of edges) {
        const key = `${edge.from}\u0000${edge.to}`;
        const group = groups.get(key) ?? { from: edge.from, to: edge.to, labels: [] };
        if (edge.label && !group.labels.includes(edge.label)) group.labels.push(edge.label);
        groups.set(key, group);
    }
    return Array.from(groups.values());
}

function forceLayoutOriginGraph(nodes: OriginGraphNode[], edges: OriginEdgeGroup[], currentId: string): PositionedOriginNode[] {
    const anchors = originGraphAnchors(nodes, edges, currentId);
    const states = createOriginNodeStates(nodes, anchors);
    const byId = new Map(states.map(state => [state.node.id, state]));

    for (let iteration = 0; iteration < 240; iteration++) {
        const alpha = Math.pow(1 - iteration / 240, 1.45);
        applyOriginNodeRepulsion(states, alpha);
        applyOriginEdgePulls(byId, edges, currentId, alpha);
        applyOriginEdgeNodeAvoidance(states, byId, edges, alpha);
        applyOriginAnchorPulls(states, currentId, alpha);
        integrateOriginNodeStates(states, currentId);
    }

    return positionOriginNodes(states);
}

function createOriginNodeStates(nodes: OriginGraphNode[], anchors: Map<string, { x: number; y: number; pinned?: boolean }>): OriginNodeState[] {
    return nodes.map((node, index) => {
        const { rx, ry } = originNodeRadii(node);
        const anchor = anchors.get(node.id) ?? { x: 50, y: 50 };
        const jitter = index === 0 ? 0 : (index % 2 === 0 ? 1 : -1) * (1.2 + (index % 3) * 0.45);
        return {
            node,
            x: anchor.x + jitter,
            y: anchor.y - jitter * 0.6,
            rx,
            ry,
            vx: 0,
            vy: 0,
            anchorX: anchor.x,
            anchorY: anchor.y,
            anchorPinned: anchor.pinned === true,
            collision: Math.max(rx * 1.35, ry) + 5.2,
        };
    });
}

function applyOriginNodeRepulsion(states: OriginNodeState[], alpha: number): void {
    for (let aIndex = 0; aIndex < states.length; aIndex++) {
        for (let bIndex = aIndex + 1; bIndex < states.length; bIndex++) {
            repelOriginNodePair(states[aIndex], states[bIndex], aIndex, bIndex, alpha);
        }
    }
}

function repelOriginNodePair(a: OriginNodeState, b: OriginNodeState, aIndex: number, bIndex: number, alpha: number): void {
    const delta = originNodeDelta(a, b, aIndex, bIndex);
    const distanceSquared = Math.max(8, delta.dx * delta.dx + delta.dy * delta.dy);
    const distance = Math.sqrt(distanceSquared);
    const repel = Math.min(0.68, (17 * alpha) / distanceSquared);
    a.vx -= delta.dx * repel;
    a.vy -= delta.dy * repel;
    b.vx += delta.dx * repel;
    b.vy += delta.dy * repel;

    const minimumDistance = a.collision + b.collision;
    if (distance >= minimumDistance) return;
    const push = ((minimumDistance - distance) / distance) * 0.14 * alpha;
    a.vx -= delta.dx * push;
    a.vy -= delta.dy * push;
    b.vx += delta.dx * push;
    b.vy += delta.dy * push;
}

function originNodeDelta(a: OriginNodeState, b: OriginNodeState, aIndex: number, bIndex: number): { dx: number; dy: number } {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.abs(dx) + Math.abs(dy) < 0.01
        ? { dx: (bIndex - aIndex) * 0.13, dy: (aIndex + bIndex) * 0.11 }
        : { dx, dy };
}

function applyOriginEdgePulls(byId: Map<string, OriginNodeState>, edges: OriginEdgeGroup[], currentId: string, alpha: number): void {
    for (const edge of edges) {
        const source = byId.get(edge.from);
        const target = byId.get(edge.to);
        if (source && target) pullOriginEdge(source, target, edge, currentId, alpha);
    }
}

function pullOriginEdge(source: OriginNodeState, target: OriginNodeState, edge: OriginEdgeGroup, currentId: string, alpha: number): void {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const targetDistance = isOriginSubcomponentEdge(edge) ? 21 : source.node.id === currentId || target.node.id === currentId ? 36 : 24;
    const pull = ((distance - targetDistance) / distance) * 0.06 * alpha;
    source.vx += dx * pull;
    source.vy += dy * pull;
    target.vx -= dx * pull;
    target.vy -= dy * pull;
}

function applyOriginEdgeNodeAvoidance(states: OriginNodeState[], byId: Map<string, OriginNodeState>, edges: OriginEdgeGroup[], alpha: number): void {
    for (const edge of edges) {
        const source = byId.get(edge.from);
        const target = byId.get(edge.to);
        if (!source || !target) continue;
        for (const state of states) {
            if (state === source || state === target) continue;
            pushOriginNodeAwayFromEdge(state, source, target, alpha);
        }
    }
}

function pushOriginNodeAwayFromEdge(node: OriginNodeState, source: OriginNodeState, target: OriginNodeState, alpha: number): void {
    const closest = closestOriginEdgePoint(node.x, node.y, source.x, source.y, target.x, target.y);
    const dx = node.x - closest.x;
    const dy = node.y - closest.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 0.001;
    const clearance = Math.max(node.rx, node.ry) * 0.72 + 2.2;
    if (distance >= clearance) return;
    const fallback = originEdgeNormal(source, target);
    const ux = distance > 0.01 ? dx / distance : fallback.x;
    const uy = distance > 0.01 ? dy / distance : fallback.y;
    const push = (clearance - distance) * 0.045 * alpha;
    node.vx += ux * push;
    node.vy += uy * push;
}

function closestOriginEdgePoint(px: number, py: number, x1: number, y1: number, x2: number, y2: number): { x: number; y: number } {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= 0.001) return { x: x1, y: y1 };
    const t = clampGraphValue(((px - x1) * dx + (py - y1) * dy) / lengthSquared, 0, 1);
    return { x: x1 + dx * t, y: y1 + dy * t };
}

function originEdgeNormal(source: OriginNodeState, target: OriginNodeState): { x: number; y: number } {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: -dy / length, y: dx / length };
}

function applyOriginAnchorPulls(states: OriginNodeState[], currentId: string, alpha: number): void {
    for (const state of states) {
        const anchorStrength = state.node.id === currentId ? 0.32 : state.anchorPinned ? 0.38 : 0.16;
        state.vx += (state.anchorX - state.x) * anchorStrength * alpha;
        state.vy += (state.anchorY - state.y) * anchorStrength * alpha;
    }
}

function integrateOriginNodeStates(states: OriginNodeState[], currentId: string): void {
    for (const state of states) {
        integrateOriginNodeState(state, currentId);
        state.x = clampGraphValue(state.x, 9 + state.rx, 91 - state.rx);
        state.y = clampGraphValue(state.y, 7 + state.ry, 93 - state.ry);
    }
}

function integrateOriginNodeState(state: OriginNodeState, currentId: string): void {
    if (state.node.id === currentId) {
        state.x += (state.anchorX - state.x) * 0.4;
        state.y += (state.anchorY - state.y) * 0.4;
        state.vx = 0;
        state.vy = 0;
        return;
    }
    state.x += state.vx;
    state.y += state.vy;
    state.vx *= 0.58;
    state.vy *= 0.58;
}

function positionOriginNodes(states: OriginNodeState[]): PositionedOriginNode[] {
    return states.map(({ node, x, y, rx, ry }) => ({
        node,
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
        rx,
        ry,
    }));
}

function originGraphAnchors(nodes: OriginGraphNode[], edges: OriginEdgeGroup[], currentId: string): Map<string, { x: number; y: number; pinned?: boolean }> {
    const anchors = new Map<string, { x: number; y: number; pinned?: boolean }>();
    const current = nodes.find(node => node.id === currentId);
    if (current) anchors.set(current.id, { x: 50, y: 50 });
    const currentReference = current ? originNodeGeometryReference(current, { x: 50, y: 50 }) : undefined;
    const incoming = nodes.filter(node => node.id !== currentId && edges.some(edge => edge.from === node.id && edge.to === currentId));
    const outgoing = nodes.filter(node => node.id !== currentId && edges.some(edge => edge.from === currentId && edge.to === node.id));
    const attached = new Set([...incoming, ...outgoing].map(node => node.id));
    const others = nodes.filter(node => node.id !== currentId && !attached.has(node.id));

    if (outgoing.length) {
        spreadInboundComponents(incoming, currentId, currentReference).forEach(({ node, x, y, pinned }) => anchors.set(node.id, { x, y, pinned }));
        spreadOutboundComponents(outgoing, currentId).forEach(({ node, x, y }) => anchors.set(node.id, { x, y }));
    } else {
        spreadInboundComponents(incoming, currentId, currentReference).forEach(({ node, x, y, pinned }) => anchors.set(node.id, { x, y, pinned }));
    }
    spreadNestedComponents(nodes, edges, anchors);
    const anchored = new Set(anchors.keys());
    const remainingOthers = others.filter(node => !anchored.has(node.id));
    remainingOthers.forEach((node, index) => {
        const t = (index + 1) / (remainingOthers.length + 1);
        anchors.set(node.id, { x: 26 + t * 48, y: 78 + (index % 2) * 3 });
    });
    return anchors;
}

function spreadNestedComponents(
    nodes: OriginGraphNode[],
    edges: OriginEdgeGroup[],
    anchors: Map<string, { x: number; y: number; pinned?: boolean }>,
): void {
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const nestedByParent = nestedEdgesByParent(edges, nodeById);
    for (let pass = 0; pass < nodes.length; pass++) {
        let placed = false;
        nestedByParent.forEach((parentEdges, parentId) => {
            const parentAnchor = anchors.get(parentId);
            if (!parentAnchor) return;
            const sorted = [...parentEdges].sort((a, b) => {
                const aNode = nodeById.get(a.from);
                const bNode = nodeById.get(b.from);
                return componentZoneSort(aNode ? inferInboundComponentZone(aNode, parentId) : 'center') - componentZoneSort(bNode ? inferInboundComponentZone(bNode, parentId) : 'center')
                    || (aNode?.label ?? a.from).localeCompare(bNode?.label ?? b.from, 'ja');
            });
            sorted.forEach((edge, index) => {
                if (anchors.has(edge.from)) return;
                const node = nodeById.get(edge.from);
                if (!node) return;
                const parentNode = nodeById.get(parentId);
                const geometryAnchor = originNodeGeometryAnchor(node, parentNode ? originNodeGeometryReference(parentNode, parentAnchor) : undefined);
                if (geometryAnchor) {
                    anchors.set(edge.from, { ...geometryAnchor, pinned: true });
                    placed = true;
                    return;
                }
                const zone = inferInboundComponentZone(node, parentId);
                anchors.set(edge.from, { ...nestedZoneAnchor(parentAnchor, zone, index, sorted.length), pinned: true });
                placed = true;
            });
        });
        if (!placed) return;
    }
}

function nestedEdgesByParent(edges: OriginEdgeGroup[], nodeById: Map<string, OriginGraphNode>): Map<string, OriginEdgeGroup[]> {
    const result = new Map<string, OriginEdgeGroup[]>();
    edges.filter(isOriginSubcomponentEdge).forEach(edge => {
        if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) return;
        const list = result.get(edge.to) ?? [];
        list.push(edge);
        result.set(edge.to, list);
    });
    return result;
}

function nestedZoneAnchor(parent: { x: number; y: number }, zone: OriginComponentZone, index: number, total: number): { x: number; y: number } {
    const xStep = 18;
    const yStep = 20;
    const side = nestedExpansionSide(parent.x);
    const offset = (index - (total - 1) / 2) * 14;
    const base = nestedZoneAnchorBase(parent, zone, side, xStep, yStep);
    const withOffset = zone === 'top' || zone === 'upper' || zone === 'bottom' || zone === 'lower'
        ? { x: base.x + offset, y: base.y }
        : { x: base.x, y: base.y + offset };
    return {
        x: clampGraphValue(withOffset.x, 11, 89),
        y: clampGraphValue(withOffset.y, 12, 88),
    };
}

function nestedExpansionSide(parentX: number): -1 | 1 {
    if (parentX <= 34) return 1;
    if (parentX >= 66) return -1;
    return parentX < 50 ? -1 : 1;
}

function nestedZoneAnchorBase(parent: { x: number; y: number }, zone: OriginComponentZone, side: number, xStep: number, yStep: number): { x: number; y: number } {
    switch (zone) {
        case 'top':
            return { x: parent.x, y: parent.y - yStep };
        case 'upper':
            return { x: parent.x + side * (xStep * 0.45), y: parent.y - yStep * 0.72 };
        case 'left':
            return { x: parent.x - xStep, y: parent.y };
        case 'right':
            return { x: parent.x + xStep, y: parent.y };
        case 'lower':
            return { x: parent.x + side * (xStep * 0.45), y: parent.y + yStep * 0.72 };
        case 'bottom':
            return { x: parent.x, y: parent.y + yStep };
        case 'center':
            return { x: parent.x + side * xStep, y: parent.y };
    }
}

function spreadInboundComponents(
    nodes: OriginGraphNode[],
    currentId = '',
    currentReference?: OriginGeometryReference,
): Array<{ node: OriginGraphNode; x: number; y: number; pinned?: boolean }> {
    if (!nodes.length) return [];
    const ordered = [...nodes].sort((a, b) => componentZoneSort(inferInboundComponentZone(a, currentId)) - componentZoneSort(inferInboundComponentZone(b, currentId)) || a.label.localeCompare(b.label, 'ja'));
    const usedByZone = new Map<OriginComponentZone, number>();
    return ordered.map((node, index) => {
        const geometryAnchor = originNodeGeometryAnchor(node, currentReference);
        if (geometryAnchor) return { node, ...geometryAnchor, pinned: true };
        const override = inboundPlacementOverride(currentId, node);
        if (override) return { node, x: override.x, y: override.y, pinned: true };
        const zone = inferInboundComponentZone(node, currentId);
        const used = usedByZone.get(zone) ?? 0;
        usedByZone.set(zone, used + 1);
        const anchor = inboundZoneAnchor(zone, used, ordered.filter(item => inferInboundComponentZone(item, currentId) === zone).length);
        const fallback = spreadConstellation(ordered)[index] ?? { x: 30, y: 50 };
        return { node, x: anchor?.x ?? fallback.x, y: anchor?.y ?? fallback.y, pinned: zone !== 'center' };
    });
}

function spreadOutboundComponents(nodes: OriginGraphNode[], currentId: string): Array<{ node: OriginGraphNode; x: number; y: number }> {
    if (!nodes.length) return [];
    const ordered = [...nodes].sort((a, b) => componentZoneSort(inferOutboundComponentZone(currentId, a)) - componentZoneSort(inferOutboundComponentZone(currentId, b)) || a.label.localeCompare(b.label, 'ja'));
    const usedByZone = new Map<OriginComponentZone, number>();
    return ordered.map(node => {
        const zone = inferOutboundComponentZone(currentId, node);
        const used = usedByZone.get(zone) ?? 0;
        usedByZone.set(zone, used + 1);
        const anchor = outboundZoneAnchor(zone, used, ordered.filter(item => inferOutboundComponentZone(currentId, item) === zone).length);
        return { node, x: anchor.x, y: anchor.y };
    });
}

function originNodeGeometryAnchor(node: OriginGraphNode, reference?: OriginGeometryReference): { x: number; y: number } | undefined {
    const geometry = node.geometry;
    if (!geometry || !Number.isFinite(geometry.x) || !Number.isFinite(geometry.y)) return undefined;
    const x = 10 + clampGraphValue(geometry.x, 0, 1) * 80;
    const y = 10 + clampGraphValue(geometry.y, 0, 1) * 80;
    const anchor = {
        x: clampGraphValue(x, 10, 90),
        y: clampGraphValue(y, 10, 90),
    };
    return reference ? separateOriginGeometryAnchor(node, anchor, reference) : anchor;
}

function separateOriginGeometryAnchor(
    node: OriginGraphNode,
    anchor: { x: number; y: number },
    reference: OriginGeometryReference,
): { x: number; y: number } {
    const radii = originNodeRadii(node);
    const dx = anchor.x - reference.x;
    const dy = anchor.y - reference.y;
    const distance = Math.hypot(dx, dy);
    const direction = distance > 0.01
        ? { x: dx / distance, y: dy / distance }
        : originComponentZoneDirection(inferInboundComponentZone(node));
    const requiredDistance = originEllipseRadius(reference.rx, reference.ry, direction)
        + originEllipseRadius(radii.rx, radii.ry, direction)
        + 4.5;
    if (distance >= requiredDistance) return anchor;
    return {
        x: clampGraphValue(reference.x + direction.x * requiredDistance, 9 + radii.rx, 91 - radii.rx),
        y: clampGraphValue(reference.y + direction.y * requiredDistance, 7 + radii.ry, 93 - radii.ry),
    };
}

function originNodeGeometryReference(node: OriginGraphNode, point: { x: number; y: number }): OriginGeometryReference {
    const radii = originNodeRadii(node);
    return { ...point, rx: radii.rx, ry: radii.ry };
}

function originEllipseRadius(rx: number, ry: number, direction: { x: number; y: number }): number {
    const denominator = Math.sqrt((direction.x * direction.x) / (rx * rx) + (direction.y * direction.y) / (ry * ry));
    return denominator > 0 ? 1 / denominator : Math.max(rx, ry);
}

function originComponentZoneDirection(zone: OriginComponentZone): { x: number; y: number } {
    switch (zone) {
        case 'top':
            return { x: 0, y: -1 };
        case 'upper':
            return { x: 0.447, y: -0.894 };
        case 'left':
            return { x: -1, y: 0 };
        case 'right':
            return { x: 1, y: 0 };
        case 'lower':
            return { x: 0.447, y: 0.894 };
        case 'bottom':
            return { x: 0, y: 1 };
        case 'center':
            return { x: -1, y: 0 };
    }
}

function inferInboundComponentZone(node: OriginGraphNode, currentId = ''): OriginComponentZone {
    const override = inboundPlacementOverride(currentId, node);
    if (override) return override.zone;
    const position = (node.position ?? '').toLowerCase();
    return zoneFromComponentPosition(position)
        ?? zoneFromKnownComponent(node)
        ?? 'center';
}

function inboundPlacementOverride(currentId: string, node: OriginGraphNode): { zone: OriginComponentZone; x: number; y: number } | undefined {
    return INBOUND_COMPONENT_PLACEMENT_OVERRIDES.get(`${currentId}\u0000${node.id}`)
        ?? INBOUND_COMPONENT_PLACEMENT_OVERRIDES.get(`${currentId}\u0000${node.label}`);
}

function zoneFromComponentPosition(position: string): OriginComponentZone | null {
    return COMPONENT_POSITION_ZONES.find(([pattern]) => pattern.test(position))?.[1] ?? null;
}

function zoneFromKnownComponent(node: OriginGraphNode): OriginComponentZone | null {
    return KNOWN_COMPONENT_ZONES.find(([, components]) => components.has(node.id) || components.has(node.label))?.[0] ?? null;
}

function inferOutboundComponentZone(currentId: string, node: OriginGraphNode): OriginComponentZone {
    return OUTBOUND_COMPONENT_PLACEMENT_OVERRIDES.get(`${currentId}\u0000${node.id}`) ?? 'center';
}

function componentZoneSort(zone: OriginComponentZone): number {
    return { top: 0, upper: 1, left: 2, center: 3, right: 4, lower: 5, bottom: 6 }[zone];
}

function inboundZoneAnchor(zone: OriginComponentZone, index: number, total: number): { x: number; y: number } {
    return zoneAnchor(INBOUND_ZONE_ANCHORS, zone, index, total, 10);
}

function outboundZoneAnchor(zone: OriginComponentZone, index: number, total: number): { x: number; y: number } {
    if (zone === 'center' && total > 2) {
        const offset = (index - (total - 1) / 2) * 19;
        return {
            x: index % 2 === 0 ? 72 : 86,
            y: 50 + offset,
        };
    }
    return zoneAnchor(OUTBOUND_ZONE_ANCHORS, zone, index, total, total > 2 ? 20 : 14);
}

type ZoneAnchorSpec = { x: number; y: number; offsetAxis: 'x' | 'y' };

const INBOUND_ZONE_ANCHORS: Record<OriginComponentZone, ZoneAnchorSpec> = {
    top: { x: 50, y: 16, offsetAxis: 'x' },
    upper: { x: 58, y: 35, offsetAxis: 'x' },
    left: { x: 17, y: 50, offsetAxis: 'y' },
    right: { x: 83, y: 50, offsetAxis: 'y' },
    lower: { x: 58, y: 65, offsetAxis: 'x' },
    bottom: { x: 50, y: 84, offsetAxis: 'x' },
    center: { x: 24, y: 50, offsetAxis: 'y' },
};

const OUTBOUND_ZONE_ANCHORS: Record<OriginComponentZone, ZoneAnchorSpec> = {
    top: { x: 72, y: 23, offsetAxis: 'x' },
    upper: { x: 79, y: 34, offsetAxis: 'x' },
    left: { x: 84, y: 47, offsetAxis: 'y' },
    right: { x: 72, y: 47, offsetAxis: 'y' },
    lower: { x: 79, y: 66, offsetAxis: 'x' },
    bottom: { x: 72, y: 77, offsetAxis: 'x' },
    center: { x: 82, y: 50, offsetAxis: 'y' },
};

function zoneAnchor(
    anchors: Record<OriginComponentZone, ZoneAnchorSpec>,
    zone: OriginComponentZone,
    index: number,
    total: number,
    step: number,
): { x: number; y: number } {
    const spec = anchors[zone] ?? anchors.center;
    const offset = (index - (total - 1) / 2) * step;
    return spec.offsetAxis === 'x'
        ? { x: spec.x + offset, y: spec.y }
        : { x: spec.x, y: spec.y + offset };
}

function spreadConstellation(nodes: OriginGraphNode[]): Array<{ node: OriginGraphNode; x: number; y: number }> {
    const presets: Array<Array<{ x: number; y: number }>> = [
        [],
        [{ x: 26, y: 50 }],
        [{ x: 28, y: 50 }, { x: 72, y: 50 }],
        [{ x: 50, y: 24 }, { x: 27, y: 65 }, { x: 73, y: 65 }],
        [{ x: 28, y: 34 }, { x: 72, y: 34 }, { x: 28, y: 66 }, { x: 72, y: 66 }],
        [{ x: 50, y: 22 }, { x: 25, y: 40 }, { x: 75, y: 40 }, { x: 32, y: 74 }, { x: 68, y: 74 }],
    ];
    const preset = presets[nodes.length];
    if (preset) return nodes.map((node, index) => ({ node, ...preset[index] }));
    return nodes.map((node, index) => {
        const angle = (-90 + index * (360 / nodes.length)) * Math.PI / 180;
        return {
            node,
            x: 50 + Math.cos(angle) * 30,
            y: 50 + Math.sin(angle) * 28,
        };
    });
}

function originNodeRadii(node: OriginGraphNode): { rx: number; ry: number } {
    const length = Array.from(node.label).length;
    if (node.kind === 'current') return { rx: 7.6, ry: 12.9 };
    if (node.kind === 'related') return { rx: Math.min(13.6, 8.3 + length * 1.2), ry: 14.2 };
    return { rx: Math.min(11.5, 8.4 + Math.max(0, length - 1) * 1.15), ry: 14.2 };
}

function clippedOriginEdgePath(from: PositionedOriginNode, to: PositionedOriginNode, targetZone: GraphAnchorZone): ReturnType<typeof graphEdgePath> {
    return graphEdgePath(from, to, targetZone);
}

function clampGraphValue(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function formatGraphNumber(value: number): string {
    return Number(value.toFixed(2)).toString();
}

function hashOriginGraphId(value: string): string {
    let hash = 0;
    for (const character of value) {
        hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
    }
    return Math.abs(hash).toString(36);
}
