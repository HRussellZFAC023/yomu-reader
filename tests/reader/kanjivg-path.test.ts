import { describe, expect, it } from 'vitest';
import { parseSvgPathPoints } from '../../src/reader/kanjivg-path';

describe('KanjiVG SVG path sampling', () => {
    it('samples move, line, horizontal, vertical, relative, and close commands', () => {
        expect(parseSvgPathPoints('M0 0 h10 v10 l-5 5 H0 Z')).toEqual([
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 5, y: 15 },
            { x: 0, y: 15 },
            { x: 0, y: 0 },
        ]);
    });

    it('samples smooth cubic and quadratic commands through their final points', () => {
        const points = parseSvgPathPoints('M0 0 C10 0 10 10 20 10 S30 20 40 10 Q45 5 50 10 T60 10');

        expect(points[0]).toEqual({ x: 0, y: 0 });
        expect(points.length).toBeGreaterThan(35);
        expect(points.at(-1)?.x).toBeCloseTo(60);
        expect(points.at(-1)?.y).toBeCloseTo(10);
    });

    it('treats unsupported arc geometry as a line to the arc endpoint', () => {
        expect(parseSvgPathPoints('M1 2 a3 4 0 0 1 10 20').at(-1)).toEqual({ x: 11, y: 22 });
    });

    it('returns the points parsed before malformed command parameters stop progress', () => {
        expect(parseSvgPathPoints('M0 0 L10')).toEqual([{ x: 0, y: 0 }]);
    });
});
