import type { DoodleStroke } from './kanji-doodle';

export interface KanjiStrokeAssessment {
    passed: boolean;
    score: number;
    expectedStrokes: number;
    actualStrokes: number;
    message: string;
}

export function assessKanjiStrokes(strokes: DoodleStroke[], expectedStrokes: number): KanjiStrokeAssessment {
    const actualStrokes = strokes.filter(stroke => stroke.length > 1).length;
    const expected = Math.max(1, Math.round(expectedStrokes || actualStrokes || 1));
    const strokeScore = Math.max(0, 1 - Math.abs(actualStrokes - expected) / Math.max(expected, 1));
    const coverageScore = Math.min(1, totalDistance(strokes) / Math.max(expected * 0.28, 0.28));
    const directionScore = averageForwardMotion(strokes);
    const score = Math.round((strokeScore * 0.62 + coverageScore * 0.24 + directionScore * 0.14) * 100);
    const passed = actualStrokes === expected && score >= 68;
    const message = passed
        ? `Looks right: ${actualStrokes}/${expected} strokes`
        : `Check stroke count/order: ${actualStrokes}/${expected} strokes`;
    return { passed, score, expectedStrokes: expected, actualStrokes, message };
}

function totalDistance(strokes: DoodleStroke[]): number {
    return strokes.reduce((sum, stroke) => {
        let distance = 0;
        for (let index = 1; index < stroke.length; index += 1) {
            const previous = stroke[index - 1];
            const current = stroke[index];
            distance += Math.hypot(current.x - previous.x, current.y - previous.y);
        }
        return sum + distance;
    }, 0);
}

function averageForwardMotion(strokes: DoodleStroke[]): number {
    const scored = strokes
        .filter(stroke => stroke.length > 1)
        .map(stroke => {
            const first = stroke[0];
            const last = stroke[stroke.length - 1];
            const horizontal = Math.abs(last.x - first.x);
            const vertical = Math.abs(last.y - first.y);
            if (horizontal >= vertical) return last.x >= first.x ? 1 : 0.45;
            return last.y >= first.y ? 1 : 0.45;
        });
    return scored.length ? scored.reduce((sum, value) => sum + value, 0) / scored.length : 0;
}
