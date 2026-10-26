interface MenuPoint { x: number; y: number }

interface MenuLayout {
    points: MenuPoint[];
    fanX: 'left' | 'right';
    fanY: 'up' | 'down';
    /** A common label slot keeps labels clear of a compact menu's buttons. */
    label?: MenuPoint;
}

const GAP = 62;
const EDGE = 32;
const MAX_RADIUS = 360;

/** Keep the fan where it fits; use spaced rows when the screen constrains it. */
export function radialMenuLayout(cx: number, cy: number, width: number, height: number, count: number): MenuLayout {
    const fanX = cx >= width / 2 ? 'left' : 'right';
    const fanY = cy >= height / 2 ? 'up' : 'down';
    const vertical = fanY === 'up' ? -Math.PI / 2 : Math.PI / 2;
    let horizontal = fanX === 'left' ? Math.PI : 0;
    while (horizontal - vertical > Math.PI) horizontal -= 2 * Math.PI;
    while (horizontal - vertical < -Math.PI) horizontal += 2 * Math.PI;
    const pad = count >= 7 ? 0.01 : count >= 5 ? 0.08 : 0.12;
    const step = Math.abs(horizontal - vertical) * (1 - 2 * pad) / Math.max(1, count - 1);
    let radius = Math.min(MAX_RADIUS, Math.max(116 + count * 11, GAP / (2 * Math.sin(step / 2))));
    const angles = Array.from({ length: count }, (_, index) => vertical + (horizontal - vertical)
        * (count > 1 ? pad + (1 - 2 * pad) * index / (count - 1) : 0.5));
    for (const angle of angles) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        radius = Math.min(radius,
            cos > 0 ? (width - EDGE - cx) / cos : cos < 0 ? (cx - EDGE) / -cos : Infinity,
            sin > 0 ? (height - EDGE - cy) / sin : sin < 0 ? (cy - EDGE) / -sin : Infinity);
    }
    if (count <= 1 || 2 * radius * Math.sin(step / 2) >= GAP - 0.01) {
        return { fanX, fanY, points: angles.map(angle => ({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius })) };
    }

    // Three columns keep the nine-action video menu touch-spaced even at 320px.
    // Choose the corner farthest from the puck; the label occupies its own row.
    const columns = Math.min(3, count);
    const rows = Math.ceil(count / columns);
    const left = fanX === 'left' ? EDGE : width - EDGE - (columns - 1) * GAP;
    const top = fanY === 'up' ? EDGE : height - EDGE - (rows - 1) * GAP - 80;
    const points = angles.map((_, index) => ({ x: left + index % columns * GAP, y: top + Math.floor(index / columns) * GAP }));
    return { fanX, fanY, points, label: { x: width / 2, y: top + (rows - 1) * GAP + 38 } };
}
