import { escapeHtml } from '../dom/index';
import { uiText } from '../app/i18n';
import type { GraphAnchorZone } from '../kanji/graph-geometry';
import type { KanjiOriginGraph } from '../kanji/origin';
import { forceLayoutOriginGraph, groupOriginEdges, clippedOriginEdgePath, formatGraphNumber, hashOriginGraphId, isOriginSubcomponentEdge, inferInboundComponentZone, inferOutboundComponentZone } from './origin-graph-layout';
import type { InterfaceLanguage } from '../app/types';
import { privateCommandAttributes } from '../dom/private-command-capabilities';

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

export type OriginGraphNode = KanjiOriginGraph['nodes'][number];
export type OriginGraphEdge = KanjiOriginGraph['edges'][number];

const SIMPLIFIED_ONLY_COMPONENTS = new Set(['讠', '钅', '饣', '纟', '门', '车', '贝', '见', '长', '马', '鸟', '鱼']);

export interface OriginEdgeGroup {
    from: string;
    to: string;
    labels: string[];
}

export interface PositionedOriginNode {
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
    return `<button class="jpdb-reader-origin-graph-node ${node.kind}" type="button" data-action="kanji" data-kanji="${escapeHtml(node.id)}"${privateCommandAttributes({ kind: 'kanji-lookup', kanji: node.id })} ${attrs} title="${escapeHtml(title)}">${escapeHtml(node.label)}</button>`;
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
