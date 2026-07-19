import { fallbackLookupTermsForText, segmentJapaneseText } from '../reader/lookup/japanese-segments';

const HAS_JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff々〆ヵヶ]/u;
const OCR_LOOKUP_LIMIT = 18;

export interface GamingOcrRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface GamingOcrLine {
    text: string;
    box: GamingOcrRect;
    hasGeometry: boolean;
    vertical: boolean;
}

export interface GamingOcrResult {
    width: number;
    height: number;
    lines: GamingOcrLine[];
}

interface RawOcrResult {
    text?: unknown;
    description?: unknown;
    box?: unknown;
    boundingBox?: unknown;
    bounding_box?: unknown;
    bbox?: unknown;
    rect?: unknown;
}

export function normalizeGamingOcrResponse(value: unknown, fallbackWidth: number, fallbackHeight: number): GamingOcrResult | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const width = positiveNumber(record.width) ?? positiveNumber((record.context_resolution as Record<string, unknown> | undefined)?.width) ?? fallbackWidth;
    const height = positiveNumber(record.height) ?? positiveNumber((record.context_resolution as Record<string, unknown> | undefined)?.height) ?? fallbackHeight;
    const lines = [
        ...normalizeRawLines(record.lines, width, height),
        ...normalizeRawLines(record.regions, width, height),
        ...normalizeRawLines(record.results, width, height),
        ...normalizeOcrRegions(record.ocr_regions, width, height),
        ...normalizeTextFallback(record.text ?? record.description, width, height),
    ].filter(line => HAS_JAPANESE_RE.test(line.text));
    return lines.length ? { width, height, lines: uniqueOcrLines(lines) } : null;
}

export function gamingLookupCandidates(text: string): string[] {
    const candidates = [
        normalizedJapaneseText(text),
        ...segmentJapaneseText(text).flatMap(segment => fallbackLookupTermsForText(segment.surface)),
        ...fallbackLookupTermsForText(text),
    ];
    return uniqueStrings(candidates)
        .filter(candidate => HAS_JAPANESE_RE.test(candidate))
        .slice(0, OCR_LOOKUP_LIMIT);
}

export function yomuStudySearchUrl(term: string): string {
    const url = new URL('/study/', 'https://yomureader.com');
    url.searchParams.set('mode', 'search');
    url.searchParams.set('q', term);
    return url.toString();
}

function normalizeRawLines(value: unknown, width: number, height: number): GamingOcrLine[] {
    if (!Array.isArray(value)) return [];
    return value.map(item => normalizeRawLine(item, width, height)).filter((line): line is GamingOcrLine => Boolean(line));
}

function normalizeRawLine(value: unknown, width: number, height: number): GamingOcrLine | null {
    if (typeof value === 'string') return lineFromText(value, fullImageBox(width, height), false);
    if (!value || typeof value !== 'object') return null;
    const record = value as RawOcrResult;
    const text = cleanOcrText(record.text ?? record.description);
    const explicitBox = normalizeBox(record.box ?? record.boundingBox ?? record.bounding_box ?? record.bbox ?? record.rect, width, height);
    return lineFromText(text, explicitBox ?? fullImageBox(width, height), Boolean(explicitBox));
}

function normalizeOcrRegions(value: unknown, width: number, height: number): GamingOcrLine[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap(region => {
        if (!region || typeof region !== 'object') return [];
        const record = region as Record<string, unknown>;
        const regionBox = normalizeBox(record.box ?? record.boundingBox ?? record.bounding_box ?? record.bbox ?? record.rect, width, height);
        const regionWidth = regionBox?.width ?? width;
        const regionHeight = regionBox?.height ?? height;
        return normalizeRawLines(record.results ?? record.lines, regionWidth, regionHeight)
            .map(line => regionBox ? offsetLineToRegion(line, regionBox, width, height) : line)
            .filter((line): line is GamingOcrLine => Boolean(line));
    });
}

function normalizeTextFallback(value: unknown, width: number, height: number): GamingOcrLine[] {
    const text = cleanOcrText(value);
    return text ? [lineFromText(text, fullImageBox(width, height), false)].filter((line): line is GamingOcrLine => Boolean(line)) : [];
}

function offsetLineToRegion(line: GamingOcrLine, region: GamingOcrRect, width: number, height: number): GamingOcrLine | null {
    const box = clampBox({
        left: region.left + line.box.left,
        top: region.top + line.box.top,
        width: line.box.width,
        height: line.box.height,
    }, width, height);
    return box ? { ...line, box, hasGeometry: true, vertical: isVerticalBox(box, line.text.length) } : null;
}

function lineFromText(value: string, box: GamingOcrRect, hasGeometry: boolean): GamingOcrLine | null {
    const text = cleanOcrText(value);
    return text && HAS_JAPANESE_RE.test(text) ? { text, box, hasGeometry, vertical: isVerticalBox(box, text.length) } : null;
}

function normalizeBox(value: unknown, width: number, height: number): GamingOcrRect | null {
    if (Array.isArray(value)) return normalizeArrayBox(value, width, height);
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const left = positiveNumber(record.left ?? record.x);
    const top = positiveNumber(record.top ?? record.y);
    const boxWidth = positiveNumber(record.width ?? record.w);
    const boxHeight = positiveNumber(record.height ?? record.h);
    if (left === undefined || top === undefined || boxWidth === undefined || boxHeight === undefined) return null;
    return clampBox({ left, top, width: boxWidth, height: boxHeight }, width, height);
}

function normalizeArrayBox(values: unknown[], width: number, height: number): GamingOcrRect | null {
    if (values.length >= 4 && values.every(value => Number.isFinite(Number(value)))) {
        const [left, top, boxWidth, boxHeight] = values.map(Number);
        return clampBox({ left, top, width: boxWidth, height: boxHeight }, width, height);
    }
    const points = values
        .map(value => value && typeof value === 'object' ? value as Record<string, unknown> : null)
        .filter((value): value is Record<string, unknown> => Boolean(value));
    const xs = points.map(point => positiveNumber(point.x)).filter((value): value is number => value !== undefined);
    const ys = points.map(point => positiveNumber(point.y)).filter((value): value is number => value !== undefined);
    if (!xs.length || !ys.length) return null;
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return clampBox({ left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top }, width, height);
}

function clampBox(box: GamingOcrRect, width: number, height: number): GamingOcrRect | null {
    const left = Math.max(0, Math.min(width, box.left));
    const top = Math.max(0, Math.min(height, box.top));
    const right = Math.max(left, Math.min(width, box.left + Math.max(0, box.width)));
    const bottom = Math.max(top, Math.min(height, box.top + Math.max(0, box.height)));
    if (right - left < 1 || bottom - top < 1) return null;
    return { left, top, width: right - left, height: bottom - top };
}

function fullImageBox(width: number, height: number): GamingOcrRect {
    return { left: 0, top: 0, width, height };
}

function isVerticalBox(box: GamingOcrRect, textLength: number): boolean {
    if (textLength <= 1) return false;
    const aspect = box.height / Math.max(1, box.width);
    return aspect >= (textLength >= 4 ? 1.05 : 1.2);
}

function cleanOcrText(value: unknown): string {
    const text = typeof value === 'string' ? value : String(value ?? '');
    const compacted = HAS_JAPANESE_RE.test(text) ? text.replace(/[ \t\r\n]+/g, '') : text.replace(/[ \t\r\n]+/g, ' ');
    return compacted.trim().replaceAll('．．．', '…');
}

function normalizedJapaneseText(value: string): string {
    return value.replace(/\s+/g, HAS_JAPANESE_RE.test(value) ? '' : ' ').trim();
}

function positiveNumber(value: unknown): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function uniqueStrings(values: string[]): string[] {
    return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}

function uniqueOcrLines(lines: GamingOcrLine[]): GamingOcrLine[] {
    const seen = new Set<string>();
    return lines.filter(line => {
        const key = `${line.text}\n${Math.round(line.box.left)}:${Math.round(line.box.top)}:${Math.round(line.box.width)}:${Math.round(line.box.height)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
