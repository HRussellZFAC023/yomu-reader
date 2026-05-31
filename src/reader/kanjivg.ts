import { escapeHtml, parseXmlDocument } from './dom';
import { parseSvgPathPoints } from './kanjivg-path';
import { Logger } from './logger';
import { requestText as requestReaderText } from './reader-http';

const KANJIVG_RAW_BASE = 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji';
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

export function kanjiVGUrl(kanji: string): string {
    const codePoint = kanji.codePointAt(0) ?? 0;
    return `${KANJIVG_RAW_BASE}/${codePoint.toString(16).padStart(5, '0')}.svg`;
}

export function parseKanjiVGSvg(svgText: string, kanji: string): KanjiVGInfo | null {
    const doc = parseXmlDocument(svgText, 'image/svg+xml');
    const sourceSvg = doc.querySelector('svg');
    if (!sourceSvg) return null;

    const viewBox = sourceSvg.getAttribute('viewBox') || '0 0 109 109';
    const componentPositions = readKanjiVGComponentPositions(sourceSvg, kanji);
    const parsedPaths = Array.from(sourceSvg.querySelectorAll('path'))
        .map((path, index) => {
            const d = path.getAttribute('d');
            if (!d || !/^[MmZzLlHhVvCcSsQqTtAa0-9,.\-\s]+$/.test(d)) return null;
            return {
                d,
                svg: `<path d="${escapeHtml(d)}" style="--stroke-index:${index}" />`,
                shape: readKanjiVGStrokeShape(d, viewBox),
            };
        })
        .filter((path): path is { d: string; svg: string; shape: KanjiVGStrokeShape | null } => Boolean(path));
    const paths = parsedPaths.map(path => path.svg);
    if (!paths.length) return null;
    const strokeShapes = parsedPaths.map(path => path.shape);

    const numbers = Array.from(sourceSvg.querySelectorAll('text'))
        .map(text => {
            const transform = text.getAttribute('transform') ?? '';
            const label = (text.textContent ?? '').trim();
            if (!/^[\d]+$/.test(label) || !/^matrix\([0-9,.\-\s]+\)$/.test(transform)) return '';
            return `<text transform="${escapeHtml(transform)}">${escapeHtml(label)}</text>`;
        })
        .filter(Boolean);

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

function parseViewBox(viewBox: string): { x: number; y: number; width: number; height: number } {
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
    const positions = new Map<string, KanjiVGComponentPosition>();
    const add = (entry: KanjiVGComponentPosition) => {
        const key = `${entry.component}\u0000${entry.original ?? ''}\u0000${entry.parent ?? ''}\u0000${entry.position}`;
        const existing = positions.get(key);
        if (!existing || (!existing.direct && entry.direct) || (existing.variant && !entry.variant)) positions.set(key, entry);
    };

    Array.from(sourceSvg.querySelectorAll('g')).forEach(group => {
        const component = cleanComponent(group.getAttribute('kvg:element') ?? '');
        if (!component || component === kanji) return;
        const parentGroup = nearestKanjiVGComponentParent(group, root);
        const parent = cleanComponent(parentGroup?.getAttribute('kvg:element') ?? '');
        const parentOriginal = cleanComponent(parentGroup?.getAttribute('kvg:original') ?? '');
        const position = cleanComponent(group.getAttribute('kvg:position') ?? geometricKanjiVGPosition(group, parentGroup, viewBox) ?? inheritedKanjiVGPosition(group, root));
        if (!position) return;
        const bounds = normalizedKanjiVGElementBounds(group, viewBox);
        const geometryAttrs = bounds
            ? {
                bounds,
                center: {
                    x: roundKanjiVGGeometry(bounds.x + bounds.width / 2),
                    y: roundKanjiVGGeometry(bounds.y + bounds.height / 2),
                },
            }
            : {};
        const original = cleanComponent(group.getAttribute('kvg:original') ?? '');
        const direct = Boolean(root && parentGroup === root);
        const variant = group.getAttribute('kvg:variant') === 'true';
        const parentAttrs = parent ? {
            parent,
            parentOriginal: parentOriginal || undefined,
        } : {};
        const depth = kanjiVGComponentDepth(group, root);
        const variantAttr = variant ? { variant } : {};
        add({ component, original: original || undefined, ...parentAttrs, position, direct, depth, ...variantAttr, ...geometryAttrs });
        if (original && original !== component) add({ component: original, original: component, ...parentAttrs, position, direct, depth, ...variantAttr, ...geometryAttrs });
    });

    return Array.from(positions.values());
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

function geometricKanjiVGPosition(group: Element, parent: Element | undefined, viewBox: { x: number; y: number; width: number; height: number }): string {
    if (!parent) return '';
    const groupBox = kanjiVGElementBox(group, viewBox);
    const parentBox = kanjiVGElementBox(parent, viewBox);
    if (!groupBox || !parentBox || groupBox.width <= 0 || groupBox.height <= 0 || parentBox.width <= 0 || parentBox.height <= 0) return '';
    const dx = ((groupBox.x + groupBox.width / 2) - (parentBox.x + parentBox.width / 2)) / parentBox.width;
    const dy = ((groupBox.y + groupBox.height / 2) - (parentBox.y + parentBox.height / 2)) / parentBox.height;
    const threshold = 0.12;
    if (Math.abs(dx) > Math.abs(dy) * 1.12 && Math.abs(dx) > threshold) return dx < 0 ? 'left' : 'right';
    if (Math.abs(dy) > threshold) return dy < 0 ? 'top' : 'bottom';
    return 'center';
}

function kanjiVGElementBox(element: Element, viewBox: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number } | null {
    const points = Array.from(element.querySelectorAll('path'))
        .flatMap(path => parseSvgPathPoints(path.getAttribute('d') ?? ''))
        .filter(point => point.x >= viewBox.x - viewBox.width && point.y >= viewBox.y - viewBox.height);
    if (!points.length) return null;
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    return { x: left, y: top, width: right - left, height: bottom - top };
}

function normalizedKanjiVGElementBounds(element: Element, viewBox: { x: number; y: number; width: number; height: number }): KanjiVGComponentBounds | null {
    const box = kanjiVGElementBox(element, viewBox);
    if (!box || box.width <= 0 || box.height <= 0) return null;
    const left = clampUnit((box.x - viewBox.x) / viewBox.width);
    const top = clampUnit((box.y - viewBox.y) / viewBox.height);
    const right = clampUnit((box.x + box.width - viewBox.x) / viewBox.width);
    const bottom = clampUnit((box.y + box.height - viewBox.y) / viewBox.height);
    if (right <= left || bottom <= top) return null;
    return {
        x: roundKanjiVGGeometry(left),
        y: roundKanjiVGGeometry(top),
        width: roundKanjiVGGeometry(right - left),
        height: roundKanjiVGGeometry(bottom - top),
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
