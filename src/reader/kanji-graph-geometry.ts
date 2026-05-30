export type GraphAnchorZone = 'auto' | 'center' | 'top' | 'upper' | 'left' | 'right' | 'lower' | 'bottom';
type NormalizedGraphAnchorZone = Exclude<GraphAnchorZone, 'upper' | 'lower'>;

export interface GraphNodeGeometry {
    x: number;
    y: number;
    rx: number;
    ry: number;
}

export interface GraphEdgePath {
    d: string;
    points: Array<{ x: number; y: number }>;
}

export function graphEllipseOffset(dx: number, dy: number, rx: number, ry: number): number {
    const denominator = Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
    return denominator > 0 ? Math.min(0.48, 1 / denominator) : 0;
}

export function formatGraphCoordinate(value: number): string {
    return Number(value.toFixed(2)).toString();
}

export function graphEdgePath(from: GraphNodeGeometry, to: GraphNodeGeometry, targetZone: GraphAnchorZone = 'auto'): GraphEdgePath {
    const normalizedTargetZone = normalizeGraphAnchorZone(targetZone);
    if (normalizedTargetZone === 'auto' || normalizedTargetZone === 'center') {
        return graphAutoEdgePath(from, to);
    }

    const target = graphFixedAnchorPoint(to, normalizedTargetZone);
    const source = graphAutoBoundaryPoint(from, target);
    return {
        d: `M${formatGraphCoordinate(source.x)} ${formatGraphCoordinate(source.y)} L${formatGraphCoordinate(target.x)} ${formatGraphCoordinate(target.y)}`,
        points: [
            graphLinePoint(source.x, source.y, target.x, target.y, 0.38),
            graphLinePoint(source.x, source.y, target.x, target.y, 0.66),
        ],
    };
}

function graphAutoEdgePath(from: GraphNodeGeometry, to: GraphNodeGeometry): GraphEdgePath {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const sourceOffset = graphEllipseOffset(dx, dy, from.rx, from.ry);
    const targetOffset = graphEllipseOffset(dx, dy, to.rx, to.ry);
    const x1 = from.x + dx * sourceOffset;
    const y1 = from.y + dy * sourceOffset;
    const x2 = to.x - dx * targetOffset;
    const y2 = to.y - dy * targetOffset;
    return {
        d: `M${formatGraphCoordinate(x1)} ${formatGraphCoordinate(y1)} L${formatGraphCoordinate(x2)} ${formatGraphCoordinate(y2)}`,
        points: [
            graphLinePoint(x1, y1, x2, y2, 0.38),
            graphLinePoint(x1, y1, x2, y2, 0.66),
        ],
    };
}

function graphAutoBoundaryPoint(from: GraphNodeGeometry, to: { x: number; y: number }): { x: number; y: number } {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const offset = graphEllipseOffset(dx, dy, from.rx, from.ry);
    return {
        x: from.x + dx * offset,
        y: from.y + dy * offset,
    };
}

function graphFixedAnchorPoint(node: GraphNodeGeometry, zone: Exclude<NormalizedGraphAnchorZone, 'auto' | 'center'>): { x: number; y: number } {
    switch (zone) {
        case 'top':
            return { x: node.x, y: node.y - node.ry };
        case 'left':
            return { x: node.x - node.rx, y: node.y };
        case 'right':
            return { x: node.x + node.rx, y: node.y };
        case 'bottom':
            return { x: node.x, y: node.y + node.ry };
    }
    return { x: node.x, y: node.y };
}

function normalizeGraphAnchorZone(zone: GraphAnchorZone): NormalizedGraphAnchorZone {
    if (zone === 'upper') return 'top';
    if (zone === 'lower') return 'bottom';
    return zone;
}

function graphLinePoint(x1: number, y1: number, x2: number, y2: number, t: number): { x: number; y: number } {
    return {
        x: x1 + (x2 - x1) * t,
        y: y1 + (y2 - y1) * t,
    };
}
