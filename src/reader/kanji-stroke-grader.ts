import type { DoodleStroke } from './kanji-doodle';
import type { KanjiVGStrokeShape } from './kanjivg';

export interface KanjiStrokeAssessment {
    passed: boolean;
    score: number;
    expectedStrokes: number;
    actualStrokes: number;
    shapeScore?: number;
    message: string;
}

export interface KanjiShapeCandidate {
    kanji: string;
    strokeShapes: KanjiVGStrokeShape[];
}

export interface KanjiShapeMatch {
    kanji: string;
    score: number;
    expectedStrokes: number;
    actualStrokes: number;
}

type StrokePoint = { x: number; y: number };
type StrokePattern = StrokePoint[][];

const FEATURE_INTERVAL = 20;
const NORMALIZED_SIZE = 256;
const SHAPE_PASS_SCORE = 0.56;

export function assessKanjiStrokes(strokes: DoodleStroke[], expectedStrokes: number, referenceStrokes?: KanjiVGStrokeShape[]): KanjiStrokeAssessment {
    const validStrokes = strokes.filter(stroke => stroke.length > 1);
    const actualStrokes = validStrokes.length;
    const expected = Math.max(1, Math.round(expectedStrokes || actualStrokes || 1));
    const strokeScore = Math.max(0, 1 - Math.abs(actualStrokes - expected) / Math.max(expected, 1));
    const coverageScore = Math.min(1, totalDistance(strokes) / Math.max(expected * 0.28, 0.28));
    const directionScore = averageForwardMotion(strokes);
    const shapeScore = assessStrokeShape(validStrokes, referenceStrokes, expected);
    const score = Math.round((
        shapeScore == null
            ? strokeScore * 0.62 + coverageScore * 0.24 + directionScore * 0.14
            : strokeScore * 0.18 + coverageScore * 0.06 + directionScore * 0.04 + shapeScore * 0.72
    ) * 100);
    const shapePassed = shapeScore == null || shapeScore >= SHAPE_PASS_SCORE;
    const passed = actualStrokes === expected && score >= 68 && shapePassed;
    const message = assessmentMessage(passed, actualStrokes, expected, shapeScore);
    return { passed, score, expectedStrokes: expected, actualStrokes, shapeScore: shapeScore ?? undefined, message };
}

export function rankKanjiStrokeCandidates(strokes: DoodleStroke[], candidates: KanjiShapeCandidate[], limit = 8): KanjiShapeMatch[] {
    const writtenStrokes = strokes.filter(stroke => stroke.length > 1);
    if (!writtenStrokes.length) return [];
    const written = extractFeatures(momentNormalize(toPattern(writtenStrokes)), FEATURE_INTERVAL);
    return candidates
        .map(candidate => kanjiShapeMatch(candidate, written, writtenStrokes.length))
        .filter((match): match is KanjiShapeMatch => Boolean(match))
        .sort((a, b) => b.score - a.score || a.expectedStrokes - b.expectedStrokes || a.kanji.localeCompare(b.kanji))
        .slice(0, limit);
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

function assessmentMessage(passed: boolean, actualStrokes: number, expectedStrokes: number, shapeScore: number | null): string {
    if (passed) return `Looks right: ${actualStrokes}/${expectedStrokes} strokes`;
    if (actualStrokes !== expectedStrokes) return `Check stroke count: ${actualStrokes}/${expectedStrokes} strokes`;
    if (shapeScore != null && shapeScore < SHAPE_PASS_SCORE) return `Check stroke shape/order: ${actualStrokes}/${expectedStrokes} strokes`;
    return `Check stroke count/order: ${actualStrokes}/${expectedStrokes} strokes`;
}

function assessStrokeShape(strokes: DoodleStroke[], referenceStrokes: KanjiVGStrokeShape[] | undefined, expectedStrokes: number): number | null {
    if (!referenceStrokes || strokes.length !== expectedStrokes || referenceStrokes.length !== expectedStrokes) return null;
    const written = extractFeatures(momentNormalize(toPattern(strokes)), FEATURE_INTERVAL);
    const reference = extractFeatures(momentNormalize(toPattern(referenceStrokes)), FEATURE_INTERVAL);
    if (written.length !== reference.length || written.some((stroke, index) => stroke.length < 2 || reference[index].length < 2)) return null;

    const scores = written.map((stroke, index) => strokeCorrespondenceScore(stroke, reference[index]));
    const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const worst = Math.min(...scores);
    return average * 0.72 + worst * 0.28;
}

function kanjiShapeMatch(candidate: KanjiShapeCandidate, written: StrokePattern, actualStrokes: number): KanjiShapeMatch | null {
    const referenceStrokes = candidate.strokeShapes.filter(stroke => stroke.length > 1);
    if (!referenceStrokes.length) return null;
    const expectedStrokes = referenceStrokes.length;
    const strokeDelta = Math.abs(actualStrokes - expectedStrokes);
    const allowedDelta = Math.max(2, Math.ceil(Math.min(actualStrokes, expectedStrokes) * 0.45));
    if (strokeDelta > allowedDelta) return null;

    const reference = extractFeatures(momentNormalize(toPattern(referenceStrokes)), FEATURE_INTERVAL);
    if (!reference.length) return null;
    const strokeShapeScore = unorderedStrokeShapeScore(written, reference);
    const skeletonScore = wholeSkeletonScore(written, reference);
    const occupancyScore = strokeOccupancyScore(written, reference);
    const countScore = Math.max(0, 1 - strokeDelta / Math.max(actualStrokes, expectedStrokes, 1));
    const score = skeletonScore * 0.44 + strokeShapeScore * 0.34 + occupancyScore * 0.12 + countScore * 0.10;
    if (score < 0.38) return null;
    return { kanji: candidate.kanji, score, expectedStrokes, actualStrokes };
}

function unorderedStrokeShapeScore(written: StrokePattern, reference: StrokePattern): number {
    const pairScores: Array<{ writtenIndex: number; referenceIndex: number; score: number }> = [];
    written.forEach((stroke, writtenIndex) => {
        reference.forEach((referenceStroke, referenceIndex) => {
            pairScores.push({
                writtenIndex,
                referenceIndex,
                score: reversibleStrokeCorrespondenceScore(stroke, referenceStroke),
            });
        });
    });
    pairScores.sort((a, b) => b.score - a.score);

    const usedWritten = new Set<number>();
    const usedReference = new Set<number>();
    const scores: number[] = [];
    for (const pair of pairScores) {
        if (usedWritten.has(pair.writtenIndex) || usedReference.has(pair.referenceIndex)) continue;
        usedWritten.add(pair.writtenIndex);
        usedReference.add(pair.referenceIndex);
        scores.push(pair.score);
        if (scores.length >= Math.min(written.length, reference.length)) break;
    }
    if (!scores.length) return 0;

    const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const worst = Math.min(...scores);
    const coverage = scores.length / Math.max(written.length, reference.length);
    return average * 0.64 + worst * 0.18 + coverage * 0.18;
}

function wholeSkeletonScore(written: StrokePattern, reference: StrokePattern): number {
    const writtenPoints = written.flat();
    const referencePoints = reference.flat();
    if (!writtenPoints.length || !referencePoints.length) return 0;
    const distance = (averageNearestDistance(writtenPoints, referencePoints) + averageNearestDistance(referencePoints, writtenPoints)) / 2;
    return clamp(1 - distance / 54, 0, 1);
}

function averageNearestDistance(points: StrokePoint[], targets: StrokePoint[]): number {
    return points.reduce((sum, point) => sum + nearestDistance(point, targets), 0) / points.length;
}

function nearestDistance(point: StrokePoint, targets: StrokePoint[]): number {
    let best = Number.POSITIVE_INFINITY;
    for (const target of targets) best = Math.min(best, manhattan(point, target));
    return best;
}

function strokeOccupancyScore(written: StrokePattern, reference: StrokePattern): number {
    const writtenCells = occupancyCells(written.flat(), 5);
    const referenceCells = occupancyCells(reference.flat(), 5);
    if (!writtenCells.size || !referenceCells.size) return 0;
    let overlap = 0;
    writtenCells.forEach(cell => {
        if (referenceCells.has(cell)) overlap++;
    });
    return overlap / Math.max(writtenCells.size, referenceCells.size);
}

function occupancyCells(points: StrokePoint[], cellCount: number): Set<string> {
    const cells = new Set<string>();
    points.forEach(point => {
        const x = Math.max(0, Math.min(cellCount - 1, Math.floor((point.x / NORMALIZED_SIZE) * cellCount)));
        const y = Math.max(0, Math.min(cellCount - 1, Math.floor((point.y / NORMALIZED_SIZE) * cellCount)));
        cells.add(`${x}:${y}`);
    });
    return cells;
}

function toPattern(strokes: Array<Array<{ x: number; y: number }>>): StrokePattern {
    return strokes
        .map(stroke => stroke
            .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
            .map(point => ({
                x: Math.max(0, Math.min(1, point.x)) * NORMALIZED_SIZE,
                y: Math.max(0, Math.min(1, point.y)) * NORMALIZED_SIZE,
            })))
        .filter(stroke => stroke.length > 1);
}

// Adapted from Kanji Canvas' client-side recognizer:
// https://github.com/asdfjkl/kanjicanvas
// We only compare against the one expected KanjiVG template, so no candidate
// database or stroke-count-free mapping is needed here.
function momentNormalize(pattern: StrokePattern): StrokePattern {
    const points = pattern.flat();
    if (!points.length) return pattern;
    const width = NORMALIZED_SIZE;
    const height = NORMALIZED_SIZE;
    const minX = Math.min(...points.map(point => point.x));
    const maxX = Math.max(...points.map(point => point.x));
    const minY = Math.min(...points.map(point => point.y));
    const maxY = Math.max(...points.map(point => point.y));
    const oldWidth = Math.max(maxX - minX, 0.001);
    const oldHeight = Math.max(maxY - minY, 0.001);
    const aspectScale = aspectPreservingScale(oldWidth, oldHeight);
    const targetWidth = oldHeight > oldWidth ? aspectScale * width : width;
    const targetHeight = oldHeight > oldWidth ? height : aspectScale * height;
    const offsetX = (width - targetWidth) / 2;
    const offsetY = (height - targetHeight) / 2;
    const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const varianceX = points.reduce((sum, point) => sum + (point.x - centerX) ** 2, 0) / points.length;
    const varianceY = points.reduce((sum, point) => sum + (point.y - centerY) ** 2, 0) / points.length;
    const scaleX = finiteScale(targetWidth / (4 * Math.sqrt(varianceX)));
    const scaleY = finiteScale(targetHeight / (4 * Math.sqrt(varianceY)));

    return pattern.map(stroke => stroke.map(point => ({
        x: clamp(scaleX * (point.x - centerX) + targetWidth / 2 + offsetX, 0, NORMALIZED_SIZE),
        y: clamp(scaleY * (point.y - centerY) + targetHeight / 2 + offsetY, 0, NORMALIZED_SIZE),
    })));
}

function aspectPreservingScale(width: number, height: number): number {
    const ratio = height > width ? width / height : height / width;
    return Math.sqrt(Math.sin((Math.PI / 2) * ratio));
}

function finiteScale(value: number): number {
    return Number.isFinite(value) ? value : 0;
}

function extractFeatures(pattern: StrokePattern, interval: number): StrokePattern {
    return pattern.map(stroke => {
        const extracted: StrokePoint[] = [];
        let distance = 0;
        for (let index = 0; index < stroke.length; index += 1) {
            if (index === 0) extracted.push(stroke[0]);
            if (index > 0) distance += euclid(stroke[index - 1], stroke[index]);
            if (distance >= interval && index > 1) {
                distance -= interval;
                extracted.push(stroke[index]);
            }
        }
        if (extracted.length === 1) extracted.push(stroke[stroke.length - 1]);
        else if (distance > interval * 0.75) extracted.push(stroke[stroke.length - 1]);
        return extracted;
    });
}

function strokeCorrespondenceScore(stroke: StrokePoint[], reference: StrokePoint[]): number {
    const whole = wholeWholeDistance(stroke, reference);
    const endpoints = endPointDistance(stroke, reference) / 2;
    const direction = directionDistance(stroke, reference) * 128;
    const distance = whole * 0.58 + endpoints * 0.32 + direction * 0.10;
    return clamp(1 - distance / 96, 0, 1);
}

function reversibleStrokeCorrespondenceScore(stroke: StrokePoint[], reference: StrokePoint[]): number {
    return Math.max(
        strokeCorrespondenceScore(stroke, reference),
        strokeCorrespondenceScore([...stroke].reverse(), reference),
    );
}

function wholeWholeDistance(pattern1: StrokePoint[], pattern2: StrokePoint[]): number {
    const [larger, smaller] = pattern1.length >= pattern2.length ? [pattern1, pattern2] : [pattern2, pattern1];
    if (!larger.length || !smaller.length) return NORMALIZED_SIZE;
    let distance = 0;
    for (let index = 0; index < smaller.length; index += 1) {
        const largerIndex = Math.min(larger.length - 1, Math.floor((larger.length / smaller.length) * index));
        distance += manhattan(larger[largerIndex], smaller[index]);
    }
    return distance / smaller.length;
}

function endPointDistance(pattern1: StrokePoint[], pattern2: StrokePoint[]): number {
    if (!pattern1.length || !pattern2.length) return NORMALIZED_SIZE;
    return manhattan(pattern1[0], pattern2[0])
        + manhattan(pattern1[pattern1.length - 1], pattern2[pattern2.length - 1]);
}

function directionDistance(pattern1: StrokePoint[], pattern2: StrokePoint[]): number {
    const vector1 = strokeVector(pattern1);
    const vector2 = strokeVector(pattern2);
    const length1 = Math.hypot(vector1.x, vector1.y);
    const length2 = Math.hypot(vector2.x, vector2.y);
    if (!length1 || !length2) return 1;
    const dot = (vector1.x * vector2.x + vector1.y * vector2.y) / (length1 * length2);
    return (1 - clamp(dot, -1, 1)) / 2;
}

function strokeVector(stroke: StrokePoint[]): StrokePoint {
    return {
        x: stroke[stroke.length - 1].x - stroke[0].x,
        y: stroke[stroke.length - 1].y - stroke[0].y,
    };
}

function euclid(point1: StrokePoint, point2: StrokePoint): number {
    return Math.hypot(point1.x - point2.x, point1.y - point2.y);
}

function manhattan(point1: StrokePoint, point2: StrokePoint): number {
    return Math.abs(point1.x - point2.x) + Math.abs(point1.y - point2.y);
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}
