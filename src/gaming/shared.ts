import { targetOcrLanguageTag } from '../reader/languages/resolve';
import {
    isTargetLanguageText,
    normalizeTargetLanguageText,
    segmentTargetLanguageText,
    targetLookupTermsForText,
} from '../reader/lookup/target-text';
import { cleanOcrText, clampBox, isVerticalOcrBox, type OcrRect } from '../reader/ocr/response-shared';
import type { YomuGamingOcrProvider, YomuGamingOcrRequest } from './ipc';

const OCR_LOOKUP_LIMIT = 18;

/** Same rectangle the reader's OCR pipeline uses; kept as an alias for callers. */
export type GamingOcrRect = OcrRect;

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

/** The slice of settings a capture request is built from. */
export interface GamingCaptureSettings {
    ocrProvider: string;
    ocrEndpointUrl: string;
    ocrCloudVisionApiKey?: string;
    ocrEngine: string;
    ocrLanguage: string;
}

export interface GamingCaptureImage {
    dataUrl: string;
    width: number;
    height: number;
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

/**
 * The OCR request for one capture. The renderer is the only process that knows
 * which language is being studied, so it resolves the request language here —
 * the configured tag when the player set one, otherwise the active learning
 * target's own OCR language — and the Electron side just forwards it.
 */
export function gamingOcrRequest(settings: GamingCaptureSettings, image: GamingCaptureImage): YomuGamingOcrRequest {
    return {
        provider: gamingCaptureOcrProvider(settings.ocrProvider),
        endpointUrl: settings.ocrEndpointUrl,
        cloudVisionApiKey: settings.ocrCloudVisionApiKey,
        imageDataUrl: image.dataUrl,
        width: image.width,
        height: image.height,
        engine: settings.ocrEngine,
        language: targetOcrLanguageTag(settings.ocrLanguage),
    };
}

export function gamingCaptureOcrProvider(provider: string): YomuGamingOcrProvider | undefined {
    if (provider === 'google-lens' || provider === 'cloud-vision' || provider === 'local-service' || provider === 'off') return provider;
    return undefined;
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
    ].filter(line => isTargetLanguageText(line.text));
    return lines.length ? { width, height, lines: uniqueOcrLines(lines) } : null;
}

/**
 * Terms to offer for one recognized line. The whole line leads, then each
 * segment's dictionary forms, then the line's own — the order the overlay
 * shows them in, so the thing the player actually pointed at comes first.
 */
export function gamingLookupCandidates(text: string): string[] {
    const candidates = [
        normalizeTargetLanguageText(text),
        ...segmentTargetLanguageText(text).flatMap(segment => targetLookupTermsForText(segment.text)),
        ...targetLookupTermsForText(text),
    ];
    return uniqueStrings(candidates)
        .filter(candidate => isTargetLanguageText(candidate))
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
    return box ? { ...line, box, hasGeometry: true, vertical: isVerticalOcrBox(box, line.text.length) } : null;
}

function lineFromText(value: string, box: GamingOcrRect, hasGeometry: boolean): GamingOcrLine | null {
    const text = cleanOcrText(value);
    return isTargetLanguageText(text) ? { text, box, hasGeometry, vertical: isVerticalOcrBox(box, text.length) } : null;
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

function fullImageBox(width: number, height: number): GamingOcrRect {
    return { left: 0, top: 0, width, height };
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
