import { assessKanjiStrokes } from '../../src/reader/kanji/stroke-grader';

describe('kanji stroke grading sample density', () => {
    it('grades the same careful path equally when pointer events are dense', () => {
        const reference = [
            [{ x: 0.18, y: 0.28 }, { x: 0.42, y: 0.25 }, { x: 0.70, y: 0.24 }],
            [{ x: 0.49, y: 0.10 }, { x: 0.48, y: 0.35 }, { x: 0.46, y: 0.61 }, { x: 0.35, y: 0.82 }],
            [
                { x: 0.69, y: 0.36 }, { x: 0.82, y: 0.52 }, { x: 0.76, y: 0.72 },
                { x: 0.56, y: 0.87 }, { x: 0.31, y: 0.84 }, { x: 0.20, y: 0.66 },
                { x: 0.28, y: 0.48 }, { x: 0.53, y: 0.38 }, { x: 0.68, y: 0.53 },
            ],
        ];
        const sparse = reference.map(stroke => stroke.map(point => ({ ...point, pressure: 0.55 })));
        const dense = reference.map(stroke => densify(stroke, 8));

        const sparseAssessment = assessKanjiStrokes(sparse, 3, reference);
        const denseAssessment = assessKanjiStrokes(dense, 3, reference);

        expect(sparseAssessment.passed).toBe(true);
        expect(denseAssessment.passed).toBe(true);
        expect(denseAssessment.shapeScore).toBeGreaterThanOrEqual(0.9);
        expect(Math.abs(denseAssessment.score - sparseAssessment.score)).toBeLessThanOrEqual(3);
    });
});

function densify(stroke: Array<{ x: number; y: number }>, steps: number) {
    const points = [{ ...stroke[0], pressure: 0.55 }];
    for (let index = 1; index < stroke.length; index += 1) {
        const from = stroke[index - 1];
        const to = stroke[index];
        for (let step = 1; step <= steps; step += 1) {
            points.push({
                x: from.x + (to.x - from.x) * step / steps,
                y: from.y + (to.y - from.y) * step / steps,
                pressure: 0.55,
            });
        }
    }
    return points;
}
