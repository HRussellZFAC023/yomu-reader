import { escapeHtml, parseXmlDocument } from '../dom';
import { parseSvgPathPoints } from './vg-path';
import { Logger } from '../logger';
import { requestText as requestReaderText } from '../reader-http';

const KANJIVG_RAW_BASE = 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji';
const KANJIVG_POSITION_THRESHOLD = 0.12;
const KANJIVG_HORIZONTAL_DOMINANCE = 1.12;
const KANJIVG_SAFE_PATH_DATA = /^[MmZzLlHhVvCcSsQqTtAa0-9,.\-\s]+$/;
const KANJIVG_STROKE_LABEL = /^[\d]+$/;
const KANJIVG_TEXT_TRANSFORM = /^matrix\([0-9,.\-\s]+\)$/;
const log = Logger.scope('KanjiVG');

export interface KanjiVGInfo {
    kanji: string;
    svg: string;
    strokeCount: number;
    strokeShapes?: KanjiVGStrokeShape[];
    componentPositions?: KanjiVGComponentPosition[];
}

export type KanjiVGStrokeShape = KanjiVGPoint[];

export interface KanjiVGPoint {
    x: number;
    y: number;
}

export interface KanjiVGComponentPosition {
    component: string;
    original?: string;
    parent?: string;
    parentOriginal?: string;
    position: string;
    direct: boolean;
    depth: number;
    variant?: boolean;
    center?: KanjiVGComponentCenter;
    bounds?: KanjiVGComponentBounds;
}

export interface KanjiVGComponentCenter {
    x: number;
    y: number;
}

export interface KanjiVGComponentBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

type KanjiVGViewBox = KanjiVGComponentBounds;
type KanjiVGElementBox = KanjiVGComponentBounds;
type KanjiVGComponentGeometry = Pick<KanjiVGComponentPosition, 'bounds' | 'center'>;
type KanjiVGComponentParent = Pick<KanjiVGComponentPosition, 'parent' | 'parentOriginal'>;
type KanjiVGComponentVariant = Pick<KanjiVGComponentPosition, 'variant'>;
type KanjiVGComponentPositionMap = Map<string, KanjiVGComponentPosition>;
type KanjiVGPositionName = '' | 'left' | 'right' | 'top' | 'bottom' | 'center';
type KanjiVGDirectionalAxis = 'x' | 'y';
type KanjiVGOffsetAxis = KanjiVGDirectionalAxis | 'center';
type KanjiVGOffsetDirection = 'negative' | 'positive';

interface KanjiVGComponentReadContext {
    kanji: string;
    root: Element | undefined;
    viewBox: KanjiVGViewBox;
}

interface KanjiVGCenterOffset {
    x: number;
    y: number;
}

interface ParsedKanjiVGPath {
    svg: string;
    shape: KanjiVGStrokeShape | null;
}

interface KanjiVGAxisPositions {
    negative: KanjiVGPositionName;
    positive: KanjiVGPositionName;
}

interface KanjiVGNormalizedEdges {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

const KANJIVG_AXIS_POSITIONS: Record<KanjiVGDirectionalAxis, KanjiVGAxisPositions> = {
    x: { negative: 'left', positive: 'right' },
    y: { negative: 'top', positive: 'bottom' },
};

export class KanjiVGClient {
    private cache = new Map<string, Promise<KanjiVGInfo | null>>();

    lookup(kanji: string): Promise<KanjiVGInfo | null> {
        const character = Array.from(kanji)[0] ?? '';
        if (!character) return Promise.resolve(null);
        let promise = this.cache.get(character);
        if (!promise) {
            promise = this.fetchSvg(character);
            this.cache.set(character, promise);
        }
        return promise;
    }

    private async fetchSvg(kanji: string): Promise<KanjiVGInfo | null> {
        const url = kanjiVGUrl(kanji);
        const svgText = await requestText(url).catch(error => {
            log.warn('Stroke-order request failed', { kanji }, error);
            return '';
        });
        if (!svgText) return null;
        const info = parseKanjiVGSvg(svgText, kanji);
        return info;
    }
}

function kanjiVGUrl(kanji: string): string {
    const codePoint = kanji.codePointAt(0) ?? 0;
    return `${KANJIVG_RAW_BASE}/${codePoint.toString(16).padStart(5, '0')}.svg`;
}

export function parseKanjiVGSvg(svgText: string, kanji: string): KanjiVGInfo | null {
    const doc = parseXmlDocument(svgText, 'image/svg+xml');
    const sourceSvg = doc.querySelector('svg');
    if (!sourceSvg) return null;

    const viewBox = sourceSvg.getAttribute('viewBox') || '0 0 109 109';
    const componentPositions = readKanjiVGComponentPositions(sourceSvg, kanji);
    const parsedPaths = readKanjiVGPaths(sourceSvg, viewBox);
    const paths = parsedPaths.map(path => path.svg);
    if (!paths.length) return null;
    const strokeShapes = parsedPaths.map(path => path.shape);

    const numbers = readKanjiVGStrokeNumbers(sourceSvg);

    const svg = `<svg class="jpdb-reader-kanjivg-svg" viewBox="${escapeHtml(viewBox)}" role="img" aria-label="Stroke order for ${escapeHtml(kanji)}">
        <g class="jpdb-reader-kanjivg-strokes">${paths.join('')}</g>
        <g class="jpdb-reader-kanjivg-numbers">${numbers.join('')}</g>
    </svg>`;

    return {
        kanji,
        svg,
        strokeCount: paths.length,
        strokeShapes: strokeShapes.every(Boolean) ? strokeShapes as KanjiVGStrokeShape[] : undefined,
        componentPositions,
    };
}

function readKanjiVGPaths(sourceSvg: SVGSVGElement, viewBox: string): ParsedKanjiVGPath[] {
    return Array.from(sourceSvg.querySelectorAll('path'))
        .map((path, index) => readKanjiVGPath(path, index, viewBox))
        .filter((path): path is ParsedKanjiVGPath => Boolean(path));
}

function readKanjiVGPath(path: SVGPathElement, index: number, viewBox: string): ParsedKanjiVGPath | null {
    const d = path.getAttribute('d');
    if (!isSafeKanjiVGPathData(d)) return null;

    return {
        svg: renderKanjiVGPath(d, index),
        shape: readKanjiVGStrokeShape(d, viewBox),
    };
}

function isSafeKanjiVGPathData(pathData: string | null): pathData is string {
    return Boolean(pathData && KANJIVG_SAFE_PATH_DATA.test(pathData));
}

function renderKanjiVGPath(pathData: string, index: number): string {
    return `<path d="${escapeHtml(pathData)}" style="--stroke-index:${index}" />`;
}

function readKanjiVGStrokeNumbers(sourceSvg: SVGSVGElement): string[] {
    return Array.from(sourceSvg.querySelectorAll('text'))
        .map(readKanjiVGStrokeNumber)
        .filter(Boolean);
}

function readKanjiVGStrokeNumber(text: SVGTextElement): string {
    const transform = text.getAttribute('transform') ?? '';
    const label = (text.textContent ?? '').trim();
    if (!isSafeKanjiVGStrokeNumber(label, transform)) return '';
    return renderKanjiVGStrokeNumber(transform, label);
}

function isSafeKanjiVGStrokeNumber(label: string, transform: string): boolean {
    return KANJIVG_STROKE_LABEL.test(label) && KANJIVG_TEXT_TRANSFORM.test(transform);
}

function renderKanjiVGStrokeNumber(transform: string, label: string): string {
    return `<text transform="${escapeHtml(transform)}">${escapeHtml(label)}</text>`;
}

function readKanjiVGStrokeShape(pathData: string, viewBox: string): KanjiVGStrokeShape | null {
    const box = parseViewBox(viewBox);
    const points = parseSvgPathPoints(pathData)
        .map(point => ({
            x: (point.x - box.x) / box.width,
            y: (point.y - box.y) / box.height,
        }))
        .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
    return points.length > 1 ? points : null;
}

function parseViewBox(viewBox: string): KanjiVGViewBox {
    const values = viewBox.trim().split(/[\s,]+/).map(Number);
    const [x, y, width, height] = values;
    if (values.length === 4 && values.every(Number.isFinite) && width > 0 && height > 0) {
        return { x, y, width, height };
    }
    return { x: 0, y: 0, width: 109, height: 109 };
}

function readKanjiVGComponentPositions(sourceSvg: SVGSVGElement, kanji: string): KanjiVGComponentPosition[] {
    const root = Array.from(sourceSvg.querySelectorAll('g'))
        .find(group => group.getAttribute('kvg:element') === kanji);
    const viewBox = parseViewBox(sourceSvg.getAttribute('viewBox') || '0 0 109 109');
    const context: KanjiVGComponentReadContext = { kanji, root, viewBox };
    const positions: KanjiVGComponentPositionMap = new Map();

    for (const group of sourceSvg.querySelectorAll('g')) {
        for (const entry of readKanjiVGComponentPositionEntries(group, context)) {
            addKanjiVGComponentPosition(positions, entry);
        }
    }

    return Array.from(positions.values());
}

function readKanjiVGComponentPositionEntries(group: Element, context: KanjiVGComponentReadContext): KanjiVGComponentPosition[] {
    const component = cleanComponent(group.getAttribute('kvg:element') ?? '');
    if (!isNestedKanjiVGComponent(component, context.kanji)) return [];

    const entry = readKanjiVGComponentPositionEntry(group, component, context);
    return entry ? expandKanjiVGOriginalComponent(entry) : [];
}

function isNestedKanjiVGComponent(component: string, kanji: string): boolean {
    return Boolean(component && component !== kanji);
}

function readKanjiVGComponentPositionEntry(group: Element, component: string, context: KanjiVGComponentReadContext): KanjiVGComponentPosition | null {
    const parentGroup = nearestKanjiVGComponentParent(group, context.root);
    const position = readKanjiVGPosition(group, parentGroup, context);
    if (!position) return null;

    const original = cleanComponent(group.getAttribute('kvg:original') ?? '');
    const direct = Boolean(context.root && parentGroup === context.root);
    return {
        component,
        original: original || undefined,
        ...readKanjiVGParent(parentGroup),
        position,
        direct,
        depth: kanjiVGComponentDepth(group, context.root),
        ...readKanjiVGVariant(group),
        ...readKanjiVGComponentGeometry(group, context.viewBox),
    };
}

function readKanjiVGPosition(group: Element, parentGroup: Element | undefined, context: KanjiVGComponentReadContext): string {
    return cleanComponent(group.getAttribute('kvg:position') ?? geometricKanjiVGPosition(group, parentGroup, context.viewBox) ?? inheritedKanjiVGPosition(group, context.root));
}

function readKanjiVGParent(parentGroup: Element | undefined): KanjiVGComponentParent {
    const parent = cleanComponent(parentGroup?.getAttribute('kvg:element') ?? '');
    if (!parent) return {};

    return {
        parent,
        parentOriginal: cleanComponent(parentGroup?.getAttribute('kvg:original') ?? '') || undefined,
    };
}

function readKanjiVGVariant(group: Element): KanjiVGComponentVariant {
    return group.getAttribute('kvg:variant') === 'true' ? { variant: true } : {};
}

function readKanjiVGComponentGeometry(group: Element, viewBox: KanjiVGViewBox): KanjiVGComponentGeometry {
    const bounds = normalizedKanjiVGElementBounds(group, viewBox);
    if (!bounds) return {};

    return {
        bounds,
        center: {
            x: roundKanjiVGGeometry(bounds.x + bounds.width / 2),
            y: roundKanjiVGGeometry(bounds.y + bounds.height / 2),
        },
    };
}

function expandKanjiVGOriginalComponent(entry: KanjiVGComponentPosition): KanjiVGComponentPosition[] {
    if (!entry.original || entry.original === entry.component) return [entry];
    return [
        entry,
        {
            ...entry,
            component: entry.original,
            original: entry.component,
        },
    ];
}

function addKanjiVGComponentPosition(positions: KanjiVGComponentPositionMap, entry: KanjiVGComponentPosition): void {
    const key = kanjiVGComponentPositionKey(entry);
    const existing = positions.get(key);
    if (shouldReplaceKanjiVGComponentPosition(existing, entry)) positions.set(key, entry);
}

function kanjiVGComponentPositionKey(entry: KanjiVGComponentPosition): string {
    return `${entry.component}\u0000${entry.original ?? ''}\u0000${entry.parent ?? ''}\u0000${entry.position}`;
}

function shouldReplaceKanjiVGComponentPosition(existing: KanjiVGComponentPosition | undefined, entry: KanjiVGComponentPosition): boolean {
    if (!existing) return true;
    if (!existing.direct && entry.direct) return true;
    return Boolean(existing.variant && !entry.variant);
}

function nearestKanjiVGComponentParent(group: Element, root: Element | undefined): Element | undefined {
    let parent = group.parentElement;
    while (parent) {
        if (parent === root || cleanComponent(parent.getAttribute('kvg:element') ?? '')) return parent;
        parent = parent.parentElement;
    }
    return undefined;
}

function kanjiVGComponentDepth(group: Element, root: Element | undefined): number {
    let depth = 0;
    let parent = group.parentElement;
    while (parent && parent !== root) {
        if (cleanComponent(parent.getAttribute('kvg:element') ?? '')) depth += 1;
        parent = parent.parentElement;
    }
    return depth + 1;
}

function geometricKanjiVGPosition(group: Element, parent: Element | undefined, viewBox: KanjiVGViewBox): KanjiVGPositionName {
    const offset = relativeKanjiVGCenterOffset(group, parent, viewBox);
    return offset ? kanjiVGOffsetPosition(offset) : '';
}

function relativeKanjiVGCenterOffset(group: Element, parent: Element | undefined, viewBox: KanjiVGViewBox): KanjiVGCenterOffset | null {
    if (!parent) return null;
    const groupBox = positiveKanjiVGElementBox(group, viewBox);
    const parentBox = positiveKanjiVGElementBox(parent, viewBox);
    if (!groupBox || !parentBox) return null;

    return {
        x: (boxCenterX(groupBox) - boxCenterX(parentBox)) / parentBox.width,
        y: (boxCenterY(groupBox) - boxCenterY(parentBox)) / parentBox.height,
    };
}

function positiveKanjiVGElementBox(element: Element, viewBox: KanjiVGViewBox): KanjiVGElementBox | null {
    const box = kanjiVGElementBox(element, viewBox);
    return box && hasPositiveArea(box) ? box : null;
}

function hasPositiveArea(box: KanjiVGElementBox): boolean {
    return box.width > 0 && box.height > 0;
}

function boxCenterX(box: KanjiVGElementBox): number {
    return box.x + box.width / 2;
}

function boxCenterY(box: KanjiVGElementBox): number {
    return box.y + box.height / 2;
}

function kanjiVGOffsetPosition(offset: KanjiVGCenterOffset): KanjiVGPositionName {
    const axis = dominantKanjiVGOffsetAxis(offset);
    if (axis === 'center') return axis;
    return KANJIVG_AXIS_POSITIONS[axis][kanjiVGOffsetDirection(offset[axis])];
}

function kanjiVGOffsetDirection(value: number): KanjiVGOffsetDirection {
    return value < 0 ? 'negative' : 'positive';
}

function dominantKanjiVGOffsetAxis(offset: KanjiVGCenterOffset): KanjiVGOffsetAxis {
    const absX = Math.abs(offset.x);
    const absY = Math.abs(offset.y);
    if (absX > absY * KANJIVG_HORIZONTAL_DOMINANCE && absX > KANJIVG_POSITION_THRESHOLD) return 'x';
    if (absY > KANJIVG_POSITION_THRESHOLD) return 'y';
    return 'center';
}

function kanjiVGElementBox(element: Element, viewBox: KanjiVGViewBox): KanjiVGElementBox | null {
    const points = readKanjiVGElementPoints(element, viewBox);
    if (!points.length) return null;
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    return { x: left, y: top, width: right - left, height: bottom - top };
}

function readKanjiVGElementPoints(element: Element, viewBox: KanjiVGViewBox): KanjiVGPoint[] {
    return Array.from(element.querySelectorAll('path'))
        .flatMap(path => readKanjiVGElementPathPoints(path, viewBox));
}

function readKanjiVGElementPathPoints(path: SVGPathElement, viewBox: KanjiVGViewBox): KanjiVGPoint[] {
    return parseSvgPathPoints(path.getAttribute('d') ?? '')
        .filter(point => isKanjiVGGeometryPoint(point, viewBox));
}

function isKanjiVGGeometryPoint(point: KanjiVGPoint, viewBox: KanjiVGViewBox): boolean {
    return point.x >= viewBox.x - viewBox.width && point.y >= viewBox.y - viewBox.height;
}

function normalizedKanjiVGElementBounds(element: Element, viewBox: KanjiVGViewBox): KanjiVGComponentBounds | null {
    const box = positiveKanjiVGElementBox(element, viewBox);
    if (!box) return null;
    const edges = normalizedKanjiVGBoxEdges(box, viewBox);
    return edges ? roundedKanjiVGBounds(edges) : null;
}

function normalizedKanjiVGBoxEdges(box: KanjiVGElementBox, viewBox: KanjiVGViewBox): KanjiVGNormalizedEdges | null {
    const left = clampUnit((box.x - viewBox.x) / viewBox.width);
    const top = clampUnit((box.y - viewBox.y) / viewBox.height);
    const right = clampUnit((box.x + box.width - viewBox.x) / viewBox.width);
    const bottom = clampUnit((box.y + box.height - viewBox.y) / viewBox.height);
    if (right <= left || bottom <= top) return null;
    return { left, top, right, bottom };
}

function roundedKanjiVGBounds(edges: KanjiVGNormalizedEdges): KanjiVGComponentBounds {
    return {
        x: roundKanjiVGGeometry(edges.left),
        y: roundKanjiVGGeometry(edges.top),
        width: roundKanjiVGGeometry(edges.right - edges.left),
        height: roundKanjiVGGeometry(edges.bottom - edges.top),
    };
}

function clampUnit(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function roundKanjiVGGeometry(value: number): number {
    return Number(value.toFixed(4));
}

function inheritedKanjiVGPosition(group: Element, root: Element | undefined): string {
    let parent = group.parentElement;
    while (parent && parent !== root) {
        const position = parent.getAttribute('kvg:position');
        if (position) return position;
        parent = parent.parentElement;
    }
    return '';
}

function cleanComponent(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function requestText(url: string): Promise<string> {
    return requestReaderText(url, {
        timeoutMs: 8000,
        failureLabel: 'Stroke-order request',
        timeoutLabel: 'Stroke-order request timed out.',
    });
}
