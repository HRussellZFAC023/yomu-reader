import { describe, expect, it } from 'vitest';
import { radialMenuLayout } from '../../src/reader/ui/radial-menu-layout';

const viewports = [[320, 568], [360, 640], [390, 844], [844, 390], [320, 1180], [590, 820], [500, 700], [1280, 600], [640, 300]];

describe('puck action layout', () => {
    it.each(viewports)('keeps nine video actions spaced and on screen at %i × %i', (width, height) => {
        for (const cx of [44, width / 2, width - 44]) {
            for (const cy of [44, height / 2, height - 44]) {
                const { points, label } = radialMenuLayout(cx, cy, width, height, 9);
                expect(points).toHaveLength(9);
                points.forEach((point, index) => {
                    const radius = index === 0 ? 26 : 23;
                    expect(point.x - radius).toBeGreaterThanOrEqual(0);
                    expect(point.y - radius).toBeGreaterThanOrEqual(0);
                    expect(point.x + radius).toBeLessThanOrEqual(width);
                    expect(point.y + radius).toBeLessThanOrEqual(height);
                    expect(Math.hypot(point.x - cx, point.y - cy)).toBeGreaterThanOrEqual(radius + 26);
                    for (const other of points.slice(index + 1)) {
                        expect(Math.hypot(other.x - point.x, other.y - point.y)).toBeGreaterThanOrEqual(61.9);
                    }
                });
                if (label) {
                    expect(label.y).toBeGreaterThan(Math.max(...points.map(point => point.y)) + 26);
                    expect(label.y + 40).toBeLessThanOrEqual(height);
                }
            }
        }
    });

    it('keeps the existing fan when there is room', () => {
        const layout = radialMenuLayout(1200, 800, 1280, 900, 7);
        expect(layout.label).toBeUndefined();
        expect(layout.fanX).toBe('left');
        expect(layout.fanY).toBe('up');
    });
});
