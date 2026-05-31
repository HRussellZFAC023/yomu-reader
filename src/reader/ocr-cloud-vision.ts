import { cleanOcrText, clampBox, numberFrom, pushJapaneseOcrLine, unionBoxes } from './ocr-response-shared';
import type { OcrLine, OcrRect, OcrResult } from './ocr-response-shared';

interface CloudVisionState {
    width: number;
    height: number;
    lines: OcrLine[];
}

export function normalizeCloudVisionResponse(record: Record<string, unknown>, fallbackWidth: number, fallbackHeight: number): OcrResult | null {
    const state: CloudVisionState = { width: fallbackWidth, height: fallbackHeight, lines: [] };
    for (const response of cloudVisionResponses(record)) {
        appendCloudVisionPages(response, state);
        appendCloudVisionTextAnnotations(response, state);
    }
    return state.lines.length ? { width: state.width, height: state.height, lines: state.lines } : null;
}

function cloudVisionResponses(record: Record<string, unknown>): unknown[] {
    if (Array.isArray(record.responses)) return record.responses;
    return 'fullTextAnnotation' in record ? [record] : [];
}

function appendCloudVisionPages(response: unknown, state: CloudVisionState): void {
    const annotation = (response as Record<string, unknown>)?.fullTextAnnotation as Record<string, unknown> | undefined;
    const pages = Array.isArray(annotation?.pages) ? annotation.pages : [];
    for (const page of pages) appendCloudVisionPage(page as Record<string, unknown>, state);
}

function appendCloudVisionPage(page: Record<string, unknown>, state: CloudVisionState): void {
    state.width = numberFrom(page.width) || state.width;
    state.height = numberFrom(page.height) || state.height;
    for (const block of cloudVisionPageBlocks(page)) {
        for (const paragraph of cloudVisionBlockParagraphs(block)) {
            pushCloudVisionParagraphLines(paragraph as Record<string, unknown>, state.lines, state.width, state.height);
        }
    }
}

function cloudVisionPageBlocks(page: Record<string, unknown>): unknown[] {
    return Array.isArray(page.blocks) ? page.blocks : [];
}

function cloudVisionBlockParagraphs(block: unknown): unknown[] {
    const paragraphs = (block as Record<string, unknown>)?.paragraphs;
    return Array.isArray(paragraphs) ? paragraphs : [];
}

function appendCloudVisionTextAnnotations(response: unknown, state: CloudVisionState): void {
    const annotations = Array.isArray((response as Record<string, unknown>)?.textAnnotations)
        ? (response as Record<string, unknown>).textAnnotations as unknown[]
        : [];
    if (state.lines.length || annotations.length <= 1) return;
    for (const annotationItem of annotations.slice(1)) {
        const item = annotationItem as Record<string, unknown>;
        const text = cleanOcrText(item.description);
        const box = normalizeCloudVisionVertices((item.boundingPoly as Record<string, unknown> | undefined)?.vertices, state.width, state.height);
        pushJapaneseOcrLine(state.lines, text, box);
    }
}

function pushCloudVisionParagraphLines(paragraph: Record<string, unknown>, lines: OcrLine[], width: number, height: number): void {
    const words = Array.isArray(paragraph.words) ? paragraph.words : [];
    let text = '';
    let boxes: OcrRect[] = [];
    const pushLine = () => {
        const value = cleanOcrText(text);
        const box = unionBoxes(boxes);
        pushJapaneseOcrLine(lines, value, box);
        text = '';
        boxes = [];
    };

    for (const word of words) {
        const symbols = Array.isArray((word as Record<string, unknown>).symbols) ? (word as Record<string, unknown>).symbols as unknown[] : [];
        for (const symbol of symbols) {
            const symbolRecord = symbol as Record<string, unknown>;
            text += String(symbolRecord.text ?? '');
            const box = normalizeCloudVisionVertices((symbolRecord.boundingBox as Record<string, unknown> | undefined)?.vertices, width, height);
            if (box) boxes.push(box);
            const breakType = ((symbolRecord.property as Record<string, unknown> | undefined)?.detectedBreak as Record<string, unknown> | undefined)?.type;
            if (breakType === 'SPACE' || breakType === 'SURE_SPACE' || breakType === 'UNKNOWN') text += ' ';
            if (breakType === 'LINE_BREAK' || breakType === 'EOL_SURE_SPACE' || breakType === 'HYPHEN') pushLine();
        }
    }
    pushLine();
}

function normalizeCloudVisionVertices(value: unknown, width: number, height: number): OcrRect | null {
    if (!Array.isArray(value) || value.length < 2) return null;
    const xs = value.map(vertex => numberFrom((vertex as Record<string, unknown>)?.x) ?? 0);
    const ys = value.map(vertex => numberFrom((vertex as Record<string, unknown>)?.y) ?? 0);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return clampBox({ left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top }, width, height);
}
