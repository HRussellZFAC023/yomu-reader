export function graphEllipseOffset(dx: number, dy: number, rx: number, ry: number): number {
    const denominator = Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
    return denominator > 0 ? Math.min(0.48, 1 / denominator) : 0;
}

export function formatGraphCoordinate(value: number): string {
    return Number(value.toFixed(2)).toString();
}

export function graphEdgeCurveControl(x1: number, y1: number, x2: number, y2: number): { x: number; y: number } {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const bend = Math.min(4.6, Math.max(1.8, distance * 0.08));
    const sign = y1 <= y2 ? 1 : -1;
    return {
        x: (x1 + x2) / 2 - (dy / distance) * bend * sign,
        y: (y1 + y2) / 2 + (dx / distance) * bend * sign,
    };
}

export function graphQuadraticPoint(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, t: number): { x: number; y: number } {
    const mt = 1 - t;
    return {
        x: mt * mt * x1 + 2 * mt * t * cx + t * t * x2,
        y: mt * mt * y1 + 2 * mt * t * cy + t * t * y2,
    };
}
