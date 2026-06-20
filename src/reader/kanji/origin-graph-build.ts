import type { JpdbKanjiInfo } from '../jpdb/jpdb-kanji';
import type { KanjiVGInfo } from './vg';
import { uniqueNonEmptyStrings as uniqueStrings } from '../core/string-utils';
import type { RtkInfo } from './rtk';
import type { YomitanKanjiEntry } from '../dictionaries/yomitan';
import type {
    KanjiOriginEdge,
    KanjiOriginGraph,
    KanjiOriginNode,
    KanjiOriginNodeGeometry,
    KanjiSourceInfo,
} from './origin';

export function buildKanjiOriginGraph(
    kanji: string,
    jpdbInfo: JpdbKanjiInfo | null,
    rtkInfo: RtkInfo | null,
    entries: YomitanKanjiEntry[],
    sourceInfo: KanjiSourceInfo | null = null,
    kanjiVGInfo: KanjiVGInfo | null = null,
): KanjiOriginGraph {
    const nodes = new Map<string, KanjiOriginNode>();
    const edges: KanjiOriginEdge[] = [];
    const meanings = entries.flatMap(entry => entry.meanings).filter(Boolean);
    const kanjiVGPositions = kanjiVGComponentPositionMap(kanjiVGInfo);
    const builder: KanjiOriginGraphBuilder = { kanji, nodes, edges, kanjiVGPositions };
    nodes.set(kanji, {
        id: kanji,
        label: kanji,
        kind: 'current',
        detail: first([jpdbInfo?.keyword, rtkInfo?.keyword, sourceInfo?.kanjiMap?.meaning, meanings[0]]) ?? 'current kanji',
        source: 'current lookup',
    });

    sourceInfo?.kanjiMap?.radical?.symbol && addKanjiOriginComponent(
        builder,
        sourceInfo.kanjiMap.radical.symbol,
        first([sourceInfo.kanjiMap.radical.meaning, sourceInfo.kanjiMap.radical.name]) ?? 'radical',
        'radical',
        'Kanji Alive / Jisho',
        sourceInfo.kanjiMap.radical.position,
    );
    sourceInfo?.kanjiMap?.parts.forEach(part => addKanjiOriginComponent(builder, part, 'structural part', 'structural part', 'Kanji structure'));
    jpdbInfo?.components.forEach(component => addKanjiOriginComponent(builder, component.kanji, component.keyword, 'JPDB component', 'JPDB'));
    jpdbInfo?.usedInKanji?.forEach(component => addUsedInKanji(builder, component.kanji, component.keyword, 'JPDB'));
    rtkInfo?.componentKanji.forEach(component => addKanjiOriginComponent(builder, component, 'RTK element', 'RTK element', 'RTK'));
    kanjiVGInfo?.componentPositions
        ?.filter(component => component.direct)
        .forEach(component => addDirectKanjiVGComponent(builder, component));
    kanjiVGInfo?.componentPositions
        ?.filter(component => !component.direct)
        .sort((a, b) => a.depth - b.depth)
        .forEach(component => addKanjiVGSubcomponent(builder, component));

    splitRtkElements(rtkInfo?.elements ?? '')
        .filter(element => !Array.from(element).some(character => character === kanji))
        .slice(0, 6)
        .forEach((element, index) => addRtkMemoryCue(builder, element, index));

    const graph = { nodes: Array.from(nodes.values()).slice(0, 24), edges: edges.slice(0, 36) };
    return graph;
}

type KanjiVGComponentPosition = NonNullable<KanjiVGInfo['componentPositions']>[number];
type KanjiVGPositionInfo = { position: string; direct: boolean; geometry?: KanjiOriginNodeGeometry };

interface KanjiOriginGraphBuilder {
    kanji: string;
    nodes: Map<string, KanjiOriginNode>;
    edges: KanjiOriginEdge[];
    kanjiVGPositions: Map<string, KanjiVGPositionInfo>;
}

function addKanjiOriginEdge(builder: KanjiOriginGraphBuilder, from: string | undefined, to: string | undefined, label: string): void {
    if (!from || !to || !canAddKanjiOriginEdge(builder.edges, from, to, label)) return;
    builder.edges.push({ from, to, label });
}

function canAddKanjiOriginEdge(edges: KanjiOriginEdge[], from: string, to: string, label: string): boolean {
    if (from === to) return false;
    return !edges.some(edge => edge.from === from && edge.to === to && edge.label === label);
}

function addKanjiOriginComponentNode(
    builder: KanjiOriginGraphBuilder,
    id: string,
    detail: string,
    source: string,
    position?: string,
    geometry?: KanjiOriginNodeGeometry,
): string | null {
    if (!id || id === builder.kanji) return null;
    const existing = builder.nodes.get(id);
    if (existing) updateKanjiOriginComponentNode(existing, detail, position, geometry);
    else builder.nodes.set(id, { id, label: id, kind: 'component', detail, source, position, geometry });
    return id;
}

function updateKanjiOriginComponentNode(node: KanjiOriginNode, detail: string, position?: string, geometry?: KanjiOriginNodeGeometry): void {
    if (!node.detail && detail) node.detail = detail;
    if (!node.position && position) node.position = position;
    if (!node.geometry && geometry) node.geometry = geometry;
}

function addKanjiOriginComponent(
    builder: KanjiOriginGraphBuilder,
    id: string,
    detail: string,
    label: string,
    source: string,
    position?: string,
    geometry?: KanjiOriginNodeGeometry,
): void {
    const kanjiVGPosition = builder.kanjiVGPositions.get(id);
    const resolvedPosition = position || kanjiVGPosition?.position;
    const resolvedGeometry = geometry ?? kanjiVGPosition?.geometry;
    const nodeId = addKanjiOriginComponentNode(builder, id, detail, source, resolvedPosition, resolvedGeometry);
    addKanjiOriginEdge(builder, nodeId ?? undefined, builder.kanji, label);
}

function addUsedInKanji(builder: KanjiOriginGraphBuilder, id: string, detail: string, source: string): void {
    const nodeId = addUsedInKanjiNode(builder, id, detail, source);
    addKanjiOriginEdge(builder, builder.kanji, nodeId ?? undefined, 'used in kanji');
}

function addUsedInKanjiNode(builder: KanjiOriginGraphBuilder, id: string, detail: string, source: string): string | null {
    if (!id || id === builder.kanji) return null;
    const existing = builder.nodes.get(id);
    if (existing) updateUsedInKanjiNode(existing, detail);
    else builder.nodes.set(id, { id, label: id, kind: 'component', detail, source });
    return id;
}

function updateUsedInKanjiNode(node: KanjiOriginNode, detail: string): void {
    if (!node.detail && detail) node.detail = detail;
}

function addDirectKanjiVGComponent(builder: KanjiOriginGraphBuilder, component: KanjiVGComponentPosition): void {
    const id = resolveKanjiVGComponentId(builder.nodes, component.component, component.original);
    addKanjiOriginComponent(builder, id, 'visual component', 'KanjiVG component', 'KanjiVG', component.position, kanjiVGComponentGeometry(component));
}

function addKanjiVGSubcomponent(builder: KanjiOriginGraphBuilder, component: KanjiVGComponentPosition): void {
    if (!isNestedKanjiVGSubcomponent(component, builder.kanji)) return;
    const parent = nestedKanjiVGParent(component, builder);
    if (!parent) return;
    const child = resolveKanjiVGComponentId(builder.nodes, component.component, component.original);
    if (hasCompetingDirectComponentEdge(builder, component, child)) return;
    addKanjiVGSubcomponentEdge(builder, component, parent, child);
}

function addKanjiVGSubcomponentEdge(
    builder: KanjiOriginGraphBuilder,
    component: KanjiVGComponentPosition,
    parent: string,
    child: string,
): void {
    const parentPosition = builder.kanjiVGPositions.get(parent);
    const parentId = addKanjiOriginComponentNode(builder, parent, 'visual component', 'KanjiVG', parentPosition?.position, parentPosition?.geometry) ?? parent;
    const childId = addKanjiOriginComponentNode(builder, child, 'visual subcomponent', 'KanjiVG', component.position, kanjiVGComponentGeometry(component)) ?? child;
    addKanjiOriginEdge(builder, childId, parentId, 'subcomponent');
}

function addRtkMemoryCue(builder: KanjiOriginGraphBuilder, element: string, index: number): void {
    const id = `rtk:${index}:${element}`;
    builder.nodes.set(id, { id, label: element, kind: 'related', detail: 'RTK keyword', source: 'RTK' });
    builder.edges.push({ from: id, to: builder.kanji, label: 'memory cue' });
}

function isNestedKanjiVGSubcomponent(component: KanjiVGComponentPosition, currentKanji: string): boolean {
    return Boolean(component.component && component.component !== currentKanji && !component.variant);
}

function nestedKanjiVGParent(
    component: KanjiVGComponentPosition,
    builder: KanjiOriginGraphBuilder,
): string {
    if (!component.parent || component.parent === builder.kanji) return '';
    const parent = resolveKanjiVGComponentId(builder.nodes, component.parent, component.parentOriginal);
    return parent === builder.kanji ? '' : parent;
}

function hasCompetingDirectComponentEdge(
    builder: KanjiOriginGraphBuilder,
    component: KanjiVGComponentPosition,
    child: string,
): boolean {
    return [child, component.component, component.original].some(id => hasDirectComponentEdge(builder, id));
}

function hasDirectComponentEdge(builder: KanjiOriginGraphBuilder, id: string | undefined): boolean {
    return Boolean(id && builder.edges.some(edge => isDirectKanjiComponentEdge(edge, id, builder.kanji)));
}

function isDirectKanjiComponentEdge(edge: KanjiOriginEdge, id: string, kanji: string): boolean {
    return edge.from === id && edge.to === kanji && edge.label !== 'subcomponent';
}

function resolveKanjiVGComponentId(nodes: Map<string, KanjiOriginNode>, component: string, original?: string): string {
    if (nodes.has(component)) return component;
    return original && nodes.has(original) ? original : component;
}

function kanjiVGComponentPositionMap(info: KanjiVGInfo | null): Map<string, KanjiVGPositionInfo> {
    const positions = new Map<string, KanjiVGPositionInfo>();
    info?.componentPositions?.forEach(component => {
        const position = normalizeKanjiVGPosition(component.position);
        if (!position) return;
        const geometry = kanjiVGComponentGeometry(component);
        kanjiVGPositionKeys(component).forEach(key => {
            const existing = positions.get(key);
            if (!existing || (!existing.direct && component.direct)) {
                positions.set(key, { position, direct: component.direct, geometry });
            } else if (!existing.geometry && geometry) {
                positions.set(key, { ...existing, geometry });
            }
        });
    });
    return positions;
}

function kanjiVGComponentGeometry(component: NonNullable<KanjiVGInfo['componentPositions']>[number]): KanjiOriginNodeGeometry | undefined {
    return component.center
        ? {
            x: component.center.x,
            y: component.center.y,
            width: component.bounds?.width,
            height: component.bounds?.height,
        }
        : undefined;
}

function kanjiVGPositionKeys(component: NonNullable<KanjiVGInfo['componentPositions']>[number]): string[] {
    const componentAliases = KANJIVG_COMPONENT_ALIASES.get(component.component) ?? [];
    const originalAliases = component.original ? KANJIVG_COMPONENT_ALIASES.get(component.original) ?? [] : [];
    return uniqueStrings([
        component.component,
        component.original,
        ...componentAliases,
        ...originalAliases,
    ]);
}

function normalizeKanjiVGPosition(value: string): string {
    const normalized = value.toLowerCase().trim();
    return KANJIVG_POSITION_ALIASES.get(normalized) ?? normalized;
}

const KANJIVG_COMPONENT_ALIASES = new Map<string, string[]>([
    ['⻖', ['阝', '阜']],
    ['阜', ['⻖', '阝']],
]);

const KANJIVG_POSITION_ALIASES = new Map<string, string>([
    ['top', 'top'],
    ['tare', 'top'],
    ['bottom', 'bottom'],
    ['nyo', 'bottom'],
    ['left', 'left'],
    ['right', 'right'],
    ['inside', 'center'],
    ['kamae', 'center'],
    ['middle', 'center'],
]);

function splitRtkElements(value: string): string[] {
    return [...new Set(value
        .split(/[、,;＋+]/)
        .map(item => item.trim())
        .filter(Boolean))]
        .slice(0, 16);
}

function first(values: Array<string | undefined>): string | undefined {
    return values.find(value => value?.trim())?.trim();
}
