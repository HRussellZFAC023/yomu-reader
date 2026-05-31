import { HAS_JAPANESE } from './dom';
import type { JPDBToken } from './types';

export interface OcrRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

type NullableOcrRect = { left: number | null; top: number | null; width: number | null; height: number | null };

export interface OcrLine {
    text: string;
    box: OcrRect;
    vertical: boolean;
}

export interface OcrResult {
    width: number;
    height: number;
    lines: OcrLine[];
}

interface ProtoField {
    field: number;
    wire: number;
    value: bigint | number | string | Uint8Array;
}

const LENS_WRITING_TOP_TO_BOTTOM = 2;
const OCR_KANA_ONLY_RE = /^[\u3040-\u30ffー・]+$/u;
const OCR_KANJI_RE = /[\u3400-\u9fff々〆]/u;

export function normalizeOcrResult(value: unknown, fallbackWidth = 1, fallbackHeight = 1): OcrResult | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const cloudVision = normalizeCloudVisionResponse(record, fallbackWidth, fallbackHeight);
    if (cloudVision) return cloudVision;
    const { width, height } = ocrResultDimensions(record, fallbackWidth, fallbackHeight);
    const lines = collectGenericOcrLines(record, width, height);
    return japaneseOcrResult(width, height, lines);
}

function ocrResultDimensions(record: Record<string, unknown>, fallbackWidth: number, fallbackHeight: number): Pick<OcrResult, 'width' | 'height'> {
    const resolution = record.context_resolution as Record<string, unknown> | undefined;
    const width = numberFrom(record.width) || numberFrom(resolution?.width) || fallbackWidth;
    const height = numberFrom(record.height) || numberFrom(resolution?.height) || fallbackHeight;
    return { width, height };
}

function collectGenericOcrLines(record: Record<string, unknown>, width: number, height: number): OcrLine[] {
    const lines: OcrLine[] = [];
    appendGenericOcrLines(lines, genericRawLines(record), width, height, normalizeSimpleLines);
    appendGenericOcrLines(lines, record.results, width, height, normalizeStructuredOcrResults);
    appendGenericOcrLines(lines, record.ocr_regions, width, height, normalizeOcrRegionResults);
    return lines;
}

function genericRawLines(record: Record<string, unknown>): unknown {
    return Array.isArray(record.lines) ? record.lines : record.regions;
}

function appendGenericOcrLines(
    lines: OcrLine[],
    value: unknown,
    width: number,
    height: number,
    normalize: (values: unknown[], width: number, height: number) => OcrLine[],
): void {
    if (Array.isArray(value)) lines.push(...normalize(value, width, height));
}

function normalizeSimpleLines(values: unknown[], width: number, height: number): OcrLine[] {
    return values
        .map(item => normalizeSimpleLine(item, width, height))
        .filter((line): line is OcrLine => Boolean(line));
}

function normalizeStructuredOcrResults(values: unknown[], width: number, height: number): OcrLine[] {
    return values.flatMap(item => normalizeStructuredOcrResult(item, width, height));
}

function normalizeOcrRegionResults(regions: unknown[], width: number, height: number): OcrLine[] {
    return regions.flatMap(region => normalizeSingleOcrRegionResults(region, width, height));
}

function normalizeSingleOcrRegionResults(region: unknown, width: number, height: number): OcrLine[] {
    const regionRecord = asRecord(region);
    if (!regionRecord) return [];
    const regionBox = normalizeOcrRegion(regionRecord, width, height);
    const { scaleWidth, scaleHeight } = ocrRegionScale(regionBox, width, height);
    if (!Array.isArray(regionRecord.results)) return [];
    const lines = normalizeStructuredOcrResults(regionRecord.results, scaleWidth, scaleHeight);
    return offsetRegionLines(lines, regionBox, width, height);
}

function ocrRegionScale(regionBox: OcrRect | null, width: number, height: number): { scaleWidth: number; scaleHeight: number } {
    return {
        scaleWidth: regionBox?.width ?? width,
        scaleHeight: regionBox?.height ?? height,
    };
}

function offsetRegionLines(lines: OcrLine[], regionBox: OcrRect | null, width: number, height: number): OcrLine[] {
    if (!regionBox) return lines;
    return lines.map(line => offsetLineToRegion(line, regionBox, width, height)).filter((line): line is OcrLine => Boolean(line));
}

function japaneseOcrResult(width: number, height: number, lines: OcrLine[]): OcrResult | null {
    const japaneseLines = removeStandaloneFuriganaLines(lines)
        .filter(line => line.text.length > 0 && HAS_JAPANESE.test(line.text));
    return japaneseLines.length ? { width, height, lines: japaneseLines } : null;
}

export function cleanOcrLookupLines(lines: OcrLine[], parsed: JPDBToken[][]): OcrLine[] {
    const cleaned = lines.map((line, index) => {
        const text = cleanOcrLookupText(line.text, parsed[index] ?? []);
        return text === line.text ? line : { ...line, text };
    });
    return removeStandaloneFuriganaLines(cleaned);
}

export function ocrLinesChanged(original: OcrLine[], cleaned: OcrLine[]): boolean {
    return original.length !== cleaned.length
        || cleaned.some((line, index) => line.text !== original[index]?.text);
}

function cleanOcrLookupText(text: string, tokens: JPDBToken[]): string {
    const rubies = tokens
        .flatMap(token => token.rubies.map(ruby => ({ ruby, token })))
        .sort((a, b) => b.ruby.start - a.ruby.start);
    let cleaned = text;
    for (const { ruby } of rubies) {
        if (!OCR_KANJI_RE.test(cleaned.slice(ruby.start, ruby.end))) continue;
        cleaned = removeOcrReadingAroundRuby(cleaned, ruby.text, ruby.start, ruby.end);
    }
    return cleanOcrText(cleaned);
}

function removeOcrReadingAroundRuby(text: string, reading: string, start: number, end: number): string {
    const cleanReading = cleanOcrText(reading);
    if (!cleanReading) return text;
    if (text.slice(Math.max(0, start - cleanReading.length), start) === cleanReading) {
        return text.slice(0, start - cleanReading.length) + text.slice(start);
    }
    if (text.slice(end, end + cleanReading.length) === cleanReading) {
        return text.slice(0, end) + text.slice(end + cleanReading.length);
    }
    return text;
}

function removeStandaloneFuriganaLines(lines: OcrLine[]): OcrLine[] {
    const filtered = lines.filter((line, index) => !isStandaloneFuriganaLine(line, lines, index));
    return filtered.length ? filtered : lines;
}

function isStandaloneFuriganaLine(line: OcrLine, lines: OcrLine[], index: number): boolean {
    const text = cleanOcrText(line.text).replace(/\s+/g, '');
    if (!text || text.length > 10 || !OCR_KANA_ONLY_RE.test(text)) return false;
    return lines.some((other, otherIndex) => otherIndex !== index
        && OCR_KANJI_RE.test(other.text)
        && ocrLineLooksLikeFuriganaFor(line, other));
}

function ocrLineLooksLikeFuriganaFor(furi: OcrLine, base: OcrLine): boolean {
    if (furi.vertical || base.vertical) return ocrLineLooksLikeVerticalFuriganaFor(furi, base);
    const overlap = horizontalOverlap(furi.box, base.box);
    const overlapRatio = overlap / Math.max(1, Math.min(furi.box.width, base.box.width));
    const smaller = furi.box.height <= base.box.height * 0.75 || furi.box.width <= base.box.width * 0.65;
    const nearTop = furi.box.top <= base.box.top + base.box.height * 0.5
        && furi.box.top + furi.box.height >= base.box.top - Math.max(base.box.height * 0.45, furi.box.height * 3);
    return overlapRatio >= 0.32 && smaller && nearTop;
}

function horizontalOverlap(a: OcrRect, b: OcrRect): number {
    return Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
}

function ocrLineLooksLikeVerticalFuriganaFor(furi: OcrLine, base: OcrLine): boolean {
    if (!furi.vertical || !base.vertical) return false;
    const overlap = verticalOverlap(furi.box, base.box);
    const overlapRatio = overlap / Math.max(1, Math.min(furi.box.height, base.box.height));
    const smaller = furi.box.width <= base.box.width * 0.75 || furi.box.height <= base.box.height * 0.65;
    const nearSide = horizontalGap(furi.box, base.box) <= Math.max(base.box.width * 0.75, furi.box.width * 2);
    return overlapRatio >= 0.32 && smaller && nearSide;
}

function verticalOverlap(a: OcrRect, b: OcrRect): number {
    return Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
}

function horizontalGap(a: OcrRect, b: OcrRect): number {
    if (a.left + a.width < b.left) return b.left - (a.left + a.width);
    if (b.left + b.width < a.left) return a.left - (b.left + b.width);
    return 0;
}

export function parseGoogleLensResponse(bytes: Uint8Array, width: number, height: number): OcrResult | null {
    const root = decodeProtoMessage(bytes);
    const objectsResponse = protoFirstMessage(root, 2);
    const text = objectsResponse ? protoFirstMessage(objectsResponse, 3) : null;
    const layout = text ? protoFirstMessage(text, 1) : null;
    if (!layout) return null;

    const lines: OcrLine[] = [];
    for (const paragraph of protoMessages(layout, 1)) {
        const paragraphVertical = protoNumber(paragraph, 4) === LENS_WRITING_TOP_TO_BOTTOM;
        const paragraphBox = protoBox(protoFirstMessage(paragraph, 3), width, height);
        for (const line of protoMessages(paragraph, 2)) {
            const lineBox = protoBox(protoFirstMessage(line, 2), width, height);
            const words = protoMessages(line, 1).map(word => ({
                text: protoString(word, 2),
                separator: protoString(word, 3),
                box: protoBox(protoFirstMessage(word, 4), width, height),
            })).filter(word => word.text);
            const orderedWords = paragraphVertical ? words : [...words].sort((a, b) => (a.box?.left ?? 0) - (b.box?.left ?? 0));
            const rawText = orderedWords
                .map((word, index) => word.text + (word.separator || (index < orderedWords.length - 1 ? ' ' : '')))
                .join('');
            const textValue = cleanOcrText(rawText);
            if (!textValue || !HAS_JAPANESE.test(textValue)) continue;

            const box = lineBox ?? unionBoxes(words.map(word => word.box).filter((item): item is OcrRect => Boolean(item))) ?? paragraphBox;
            if (!box) continue;
            lines.push({
                text: textValue,
                box,
                vertical: paragraphVertical || (box.height > box.width * 1.25 && textValue.length > 1),
            });
        }
    }
    return lines.length ? { width, height, lines } : null;
}

export function parseGoogleLensUploadHtml(html: string, width: number, height: number): OcrResult | null {
    const literal = googleLensUploadCallbackLiteral(html, 'ds:1');
    if (!literal) return null;
    try {
        const callback = parseJsDataLiteral(literal) as { data?: unknown[] };
        const blocks = (((callback.data?.[2] as unknown[])?.[3] as unknown[])?.[0] as unknown[]) ?? [];
        const lines: OcrLine[] = [];
        for (const block of blocks) {
            const blockData = block as unknown[];
            const rawLines = (((blockData[2] as unknown[])?.[0] as unknown[])?.[5] as unknown[])?.[3] as unknown[] | undefined;
            const lineItems = rawLines?.[0] as unknown[] | undefined;
            if (!Array.isArray(lineItems)) continue;
            for (const item of lineItems) {
                const lineData = item as unknown[];
                const words = Array.isArray(lineData[0]) ? lineData[0] as unknown[] : [];
                const boxData = Array.isArray(lineData[1]) ? lineData[1] as number[] : [];
                const text = cleanOcrText(words.map(word => {
                    const wordData = word as unknown[];
                    return `${wordData[0] ?? ''}${wordData[3] ?? ''}`;
                }).join(''));
                const box = boxData.length >= 4 ? clampBox({
                    top: Number(boxData[0]) * height,
                    left: Number(boxData[1]) * width,
                    width: Number(boxData[2]) * width,
                    height: Number(boxData[3]) * height,
                }, width, height) : null;
                pushJapaneseOcrLine(lines, text, box);
            }
        }
        return lines.length ? { width, height, lines } : null;
    } catch {
        return null;
    }
}

function googleLensUploadCallbackLiteral(html: string, key: string): string | null {
    const marker = 'AF_initDataCallback(';
    let searchIndex = 0;
    while (searchIndex < html.length) {
        const markerIndex = html.indexOf(marker, searchIndex);
        if (markerIndex < 0) return null;
        const literalStart = markerIndex + marker.length;
        const literal = readBalancedLiteral(html, literalStart);
        if (literal && callbackLiteralHasKey(literal, key)) return literal;
        searchIndex = literalStart + Math.max(1, literal?.length ?? 1);
    }
    return null;
}

function callbackLiteralHasKey(literal: string, key: string): boolean {
    return new RegExp(`\\bkey\\s*:\\s*['"]${escapeRegex(key)}['"]`).test(literal);
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readBalancedLiteral(source: string, startIndex: number): string | null {
    let index = startIndex;
    while (/\s/.test(source[index] ?? '')) index += 1;
    if (source[index] !== '{') return null;
    let depth = 0;
    let quote = '';
    for (let current = index; current < source.length; current += 1) {
        const char = source[current];
        if (quote) {
            if (char === '\\') {
                current += 1;
            } else if (char === quote) {
                quote = '';
            }
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (char === '{' || char === '[' || char === '(') depth += 1;
        if (char === '}' || char === ']' || char === ')') depth -= 1;
        if (depth === 0) return source.slice(index, current + 1);
    }
    return null;
}

function parseJsDataLiteral(source: string): unknown {
    let index = 0;
    const value = parseValue();
    skipWhitespace();
    if (index !== source.length) throw new Error('Unexpected trailing data.');
    return value;

    function parseValue(): unknown {
        skipWhitespace();
        const char = source[index];
        if (char === '{') return parseObject();
        if (char === '[') return parseArray();
        if (char === '"' || char === "'") return parseString();
        if (char === '-' || /\d/.test(char ?? '')) return parseNumber();
        return parseIdentifierValue();
    }

    function parseObject(): Record<string, unknown> {
        const record: Record<string, unknown> = {};
        index += 1;
        skipWhitespace();
        while (source[index] !== '}') {
            const key = parseObjectKey();
            skipWhitespace();
            expect(':');
            record[key] = parseValue();
            skipWhitespace();
            if (source[index] === ',') {
                index += 1;
                skipWhitespace();
                continue;
            }
            break;
        }
        expect('}');
        return record;
    }

    function parseObjectKey(): string {
        skipWhitespace();
        const char = source[index];
        if (char === '"' || char === "'") return parseString();
        return parseIdentifier();
    }

    function parseArray(): unknown[] {
        const values: unknown[] = [];
        index += 1;
        skipWhitespace();
        while (source[index] !== ']') {
            if (source[index] === ',') {
                values.push(null);
                index += 1;
                skipWhitespace();
                continue;
            }
            values.push(parseValue());
            skipWhitespace();
            if (source[index] === ',') {
                index += 1;
                skipWhitespace();
                continue;
            }
            break;
        }
        expect(']');
        return values;
    }

    function parseString(): string {
        const quote = source[index];
        let value = '';
        index += 1;
        while (index < source.length) {
            const char = source[index++];
            if (char === quote) return value;
            if (char !== '\\') {
                value += char;
                continue;
            }
            value += parseEscapeSequence();
        }
        throw new Error('Unterminated string.');
    }

    function parseEscapeSequence(): string {
        const escaped = source[index++];
        if (escaped === 'n') return '\n';
        if (escaped === 'r') return '\r';
        if (escaped === 't') return '\t';
        if (escaped === 'b') return '\b';
        if (escaped === 'f') return '\f';
        if (escaped === 'v') return '\v';
        if (escaped === '0') return '\0';
        if (escaped === '\n') return '';
        if (escaped === '\r') {
            if (source[index] === '\n') index += 1;
            return '';
        }
        if (escaped === 'x') return codePointEscape(2);
        if (escaped === 'u') return parseUnicodeEscape();
        return escaped ?? '';
    }

    function parseUnicodeEscape(): string {
        if (source[index] === '{') {
            const end = source.indexOf('}', index + 1);
            if (end < 0) throw new Error('Invalid unicode escape.');
            const value = Number.parseInt(source.slice(index + 1, end), 16);
            index = end + 1;
            return Number.isFinite(value) ? String.fromCodePoint(value) : '';
        }
        return codePointEscape(4);
    }

    function codePointEscape(length: number): string {
        const hex = source.slice(index, index + length);
        if (!new RegExp(`^[0-9a-fA-F]{${length}}$`).test(hex)) throw new Error('Invalid character escape.');
        index += length;
        return String.fromCharCode(Number.parseInt(hex, 16));
    }

    function parseNumber(): number {
        const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(index));
        if (!match) throw new Error('Invalid number.');
        index += match[0].length;
        return Number(match[0]);
    }

    function parseIdentifierValue(): unknown {
        const identifier = parseIdentifier();
        if (identifier === 'null' || identifier === 'undefined' || identifier === 'NaN') return null;
        if (identifier === 'true') return true;
        if (identifier === 'false') return false;
        if (identifier === 'Infinity') return Infinity;
        return identifier;
    }

    function parseIdentifier(): string {
        const match = /^[A-Za-z_$][\w$]*/.exec(source.slice(index));
        if (!match) throw new Error('Expected identifier.');
        index += match[0].length;
        return match[0];
    }

    function skipWhitespace(): void {
        while (/\s/.test(source[index] ?? '')) index += 1;
    }

    function expect(char: string): void {
        if (source[index] !== char) throw new Error(`Expected ${char}.`);
        index += 1;
    }
}

function normalizeCloudVisionResponse(record: Record<string, unknown>, fallbackWidth: number, fallbackHeight: number): OcrResult | null {
    const responses = Array.isArray(record.responses) ? record.responses : ('fullTextAnnotation' in record ? [record] : []);
    const lines: OcrLine[] = [];
    let width = fallbackWidth;
    let height = fallbackHeight;
    for (const response of responses) {
        const annotation = (response as Record<string, unknown>)?.fullTextAnnotation as Record<string, unknown> | undefined;
        const pages = Array.isArray(annotation?.pages) ? annotation.pages : [];
        for (const page of pages) {
            const pageRecord = page as Record<string, unknown>;
            width = numberFrom(pageRecord.width) || width;
            height = numberFrom(pageRecord.height) || height;
            const blocks = Array.isArray(pageRecord.blocks) ? pageRecord.blocks : [];
            for (const block of blocks) {
                const paragraphs = Array.isArray((block as Record<string, unknown>).paragraphs) ? (block as Record<string, unknown>).paragraphs as unknown[] : [];
                for (const paragraph of paragraphs) {
                    pushCloudVisionParagraphLines(paragraph as Record<string, unknown>, lines, width, height);
                }
            }
        }
        const annotations = Array.isArray((response as Record<string, unknown>)?.textAnnotations) ? (response as Record<string, unknown>).textAnnotations as unknown[] : [];
        if (!lines.length && annotations.length > 1) {
            for (const annotationItem of annotations.slice(1)) {
                const item = annotationItem as Record<string, unknown>;
                const text = cleanOcrText(item.description);
                const box = normalizeCloudVisionVertices((item.boundingPoly as Record<string, unknown> | undefined)?.vertices, width, height);
                pushJapaneseOcrLine(lines, text, box);
            }
        }
    }
    return lines.length ? { width, height, lines } : null;
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

function pushJapaneseOcrLine(lines: OcrLine[], text: string, box: OcrRect | null): void {
    if (!text || !box || !HAS_JAPANESE.test(text)) return;
    lines.push({ text, box, vertical: box.height > box.width * 1.25 && text.length > 1 });
}

function normalizeCloudVisionVertices(value: unknown, width: number, height: number): OcrRect | null {
    if (!Array.isArray(value) || value.length < 2) return null;
    const xs = value.map(vertex => numberFrom((vertex as Record<string, unknown>)?.x) ?? 0);
    const ys = value.map(vertex => numberFrom((vertex as Record<string, unknown>)?.y) ?? 0);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return clampBox({ left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top }, width, height);
}

function normalizeSimpleLine(value: unknown, width: number, height: number): OcrLine | null {
    const record = asRecord(value);
    if (!record) return null;
    const text = simpleLineText(record);
    const box = simpleLineBox(record, width, height);
    if (!text || !box) return null;
    return { text, box, vertical: simpleLineIsVertical(record) };
}

function simpleLineText(record: Record<string, unknown>): string {
    return stringFrom(record.text) || stringFrom(record.content) || stringFrom(record.sentence);
}

function simpleLineBox(record: Record<string, unknown>, width: number, height: number): OcrRect | null {
    return normalizeBox(record.box ?? record.boundingBox ?? record, width, height);
}

function simpleLineIsVertical(record: Record<string, unknown>): boolean {
    return Boolean(record.vertical ?? record.is_vertical);
}

function normalizeStructuredOcrResult(value: unknown, width: number, height: number): OcrLine[] {
    if (!value || typeof value !== 'object') return [];
    const record = value as Record<string, unknown>;
    const textLines = structuredOcrTextLines(record);
    const vertical = structuredOcrVertical(record);
    const lines = textLines
        .map(item => normalizeStructuredOcrLine(item, width, height, vertical))
        .filter((line): line is OcrLine => line !== null);
    if (lines.length) return lines;

    return normalizeStructuredOcrFallback(record, textLines, width, height, vertical);
}

function structuredOcrTextLines(record: Record<string, unknown>): unknown[] {
    if (Array.isArray(record.text_lines)) return record.text_lines;
    return Array.isArray(record.text) ? record.text : [];
}

function structuredOcrVertical(record: Record<string, unknown>): boolean {
    return Boolean(record.is_vertical ?? (record.box as Record<string, unknown> | undefined)?.isVertical);
}

function normalizeStructuredOcrLine(item: unknown, width: number, height: number, inheritedVertical: boolean): OcrLine | null {
    const lineRecord = asRecord(item);
    if (!lineRecord) return null;
    const text = structuredOcrLineText(lineRecord);
    const box = structuredOcrLineBox(lineRecord, width, height);
    if (!text || !box) return null;
    return { text, box, vertical: structuredOcrLineVertical(lineRecord, inheritedVertical) };
}

function structuredOcrLineText(record: Record<string, unknown>): string {
    return stringFrom(record.content ?? record.text ?? record.word);
}

function structuredOcrLineBox(record: Record<string, unknown>, width: number, height: number): OcrRect | null {
    return normalizeBox(record.box ?? record.boundingBox ?? record, width, height);
}

function structuredOcrLineVertical(record: Record<string, unknown>, inheritedVertical: boolean): boolean {
    return Boolean(record.is_vertical ?? (record.box as Record<string, unknown> | undefined)?.isVertical ?? inheritedVertical);
}

function normalizeStructuredOcrFallback(record: Record<string, unknown>, textLines: unknown[], width: number, height: number, vertical: boolean): OcrLine[] {
    const text = textLines.map(item => stringFrom((item as Record<string, unknown>)?.content)).filter(Boolean).join('');
    const box = normalizeBox(record.box, width, height);
    return text && box ? [{ text, box, vertical }] : [];
}

function normalizeOcrRegion(record: Record<string, unknown>, width: number, height: number): OcrRect | null {
    const region = readOcrRegion(record);
    if (!region) return null;
    const box = clampBox(scaleOcrRegion(region, width, height), width, height);
    return box && !isFullImageOcrRegion(box, width, height) ? box : null;
}

interface OcrRegionParts {
    left: number;
    top: number;
    width: number;
    height: number;
}

function readOcrRegion(record: Record<string, unknown>): OcrRegionParts | null {
    const position = record.position as Record<string, unknown> | undefined;
    const size = record.size as Record<string, unknown> | undefined;
    if (!position || !size) return null;
    return completeOcrRegionParts({
        left: numberFrom(position.left),
        top: numberFrom(position.top),
        width: numberFrom(size.width),
        height: numberFrom(size.height),
    });
}

function completeOcrRegionParts(parts: { left: number | null; top: number | null; width: number | null; height: number | null }): OcrRegionParts | null {
    if (parts.left === null) return null;
    if (parts.top === null) return null;
    if (parts.width === null) return null;
    if (parts.height === null) return null;
    return { left: parts.left, top: parts.top, width: parts.width, height: parts.height };
}

function scaleOcrRegion(region: OcrRegionParts, width: number, height: number): OcrRect {
    const divisor = Math.max(region.left, region.top, region.width, region.height) <= 1 ? 1 : 100;
    return {
        left: (region.left / divisor) * width,
        top: (region.top / divisor) * height,
        width: (region.width / divisor) * width,
        height: (region.height / divisor) * height,
    };
}

function isFullImageOcrRegion(box: OcrRect, width: number, height: number): boolean {
    return box.left <= 1 && box.top <= 1 && box.width >= width - 2 && box.height >= height - 2;
}

function offsetLineToRegion(line: OcrLine, region: OcrRect, width: number, height: number): OcrLine | null {
    const box = clampBox({
        left: region.left + line.box.left,
        top: region.top + line.box.top,
        width: line.box.width,
        height: line.box.height,
    }, width, height);
    return box ? { ...line, box } : null;
}

function normalizeBox(value: unknown, width: number, height: number): OcrRect | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    return normalizePositionDimensionsBox(record, width, height)
        ?? normalizeDirectBox(record, width, height)
        ?? normalizePointBox(record, width, height);
}

function normalizePositionDimensionsBox(record: Record<string, unknown>, width: number, height: number): OcrRect | null {
    const position = asRecord(record.position);
    const dimensions = asRecord(record.dimensions);
    if (!position || !dimensions) return null;

    return boxFromNumbers({
        left: numberFrom(position.left),
        top: numberFrom(position.top),
        width: numberFrom(dimensions.width),
        height: numberFrom(dimensions.height),
    }, width, height, 'percent-100');
}

function normalizeDirectBox(record: Record<string, unknown>, width: number, height: number): OcrRect | null {
    const box = directBoxNumbers(record);
    return boxFromNumbers(box, width, height, directBoxScale(box));
}

function directBoxNumbers(record: Record<string, unknown>): NullableOcrRect {
    return {
        left: numberFrom(record.left ?? record.x),
        top: numberFrom(record.top ?? record.y),
        width: numberFrom(record.width ?? record.w),
        height: numberFrom(record.height ?? record.h),
    };
}

function directBoxScale(box: NullableOcrRect): 'fraction' | 'pixels' {
    return Object.values(box).every(value => value !== null && value <= 1) ? 'fraction' : 'pixels';
}

function normalizePointBox(record: Record<string, unknown>, width: number, height: number): OcrRect | null {
    const points = ['top_left', 'top_right', 'bottom_right', 'bottom_left']
        .map(key => asRecord(record[key]))
        .filter((point): point is Record<string, unknown> => Boolean(point));
    if (points.length < 2) return null;
    const xs = points.map(point => numberFrom(point?.x)).filter((item): item is number => item !== null);
    const ys = points.map(point => numberFrom(point?.y)).filter((item): item is number => item !== null);
    if (!xs.length || !ys.length) return null;
    const percent = coordinatesAreFractional(xs, ys);
    const scaledXs = scaleCoordinates(xs, width, percent);
    const scaledYs = scaleCoordinates(ys, height, percent);
    const left = Math.min(...scaledXs);
    const top = Math.min(...scaledYs);
    return clampBox({ left, top, width: Math.max(...scaledXs) - left, height: Math.max(...scaledYs) - top }, width, height);
}

function coordinatesAreFractional(xs: number[], ys: number[]): boolean {
    return xs.every(isFractionalCoordinate) && ys.every(isFractionalCoordinate);
}

function isFractionalCoordinate(value: number): boolean {
    return value >= 0 && value <= 1;
}

function scaleCoordinates(values: number[], scale: number, enabled: boolean): number[] {
    return enabled ? values.map(value => value * scale) : values;
}

function boxFromNumbers(
    box: { left: number | null; top: number | null; width: number | null; height: number | null },
    imageWidth: number,
    imageHeight: number,
    scale: 'pixels' | 'fraction' | 'percent-100',
): OcrRect | null {
    if (!hasCompleteBoxNumbers(box)) return null;
    const scaleInfo = boxScaleInfo(scale);
    return clampBox({
        left: scaleBoxNumber(box.left, imageWidth, scaleInfo),
        top: scaleBoxNumber(box.top, imageHeight, scaleInfo),
        width: scaleBoxNumber(box.width, imageWidth, scaleInfo),
        height: scaleBoxNumber(box.height, imageHeight, scaleInfo),
    }, imageWidth, imageHeight);
}

function hasCompleteBoxNumbers(
    box: { left: number | null; top: number | null; width: number | null; height: number | null },
): box is { left: number; top: number; width: number; height: number } {
    return box.left !== null && box.top !== null && box.width !== null && box.height !== null;
}

function boxScaleInfo(scale: 'pixels' | 'fraction' | 'percent-100'): { fractional: boolean; factor: number } {
    return {
        fractional: scale !== 'pixels',
        factor: scale === 'percent-100' ? 100 : 1,
    };
}

function scaleBoxNumber(value: number, dimension: number, scale: { fractional: boolean; factor: number }): number {
    return scale.fractional ? value / scale.factor * dimension : value;
}

function clampBox(box: OcrRect, width: number, height: number): OcrRect | null {
    const left = Math.max(0, Math.min(width, box.left));
    const top = Math.max(0, Math.min(height, box.top));
    const right = Math.max(left, Math.min(width, box.left + Math.max(0, box.width)));
    const bottom = Math.max(top, Math.min(height, box.top + Math.max(0, box.height)));
    if (right - left < 2 || bottom - top < 2) return null;
    return { left, top, width: right - left, height: bottom - top };
}

function unionBoxes(boxes: OcrRect[]): OcrRect | null {
    if (!boxes.length) return null;
    const left = Math.min(...boxes.map(box => box.left));
    const top = Math.min(...boxes.map(box => box.top));
    const right = Math.max(...boxes.map(box => box.left + box.width));
    const bottom = Math.max(...boxes.map(box => box.top + box.height));
    return { left, top, width: right - left, height: bottom - top };
}

function cleanOcrText(value: unknown): string {
    const text = typeof value === 'string' ? value : String(value ?? '');
    const normalized = text.replace(/[ \t\r\n]+/g, HAS_JAPANESE.test(text) ? '' : ' ').trim();
    return normalized.replaceAll('．．．', '…');
}
function decodeProtoMessage(bytes: Uint8Array): ProtoField[] {
    const fields: ProtoField[] = [];
    let offset = 0;
    while (offset < bytes.length) {
        const [tag, nextOffset] = readVarint(bytes, offset);
        offset = nextOffset;
        const field = Number(tag >> 3n);
        const wire = Number(tag & 7n);
        if (!field) break;
        if (wire === 0) {
            const [value, afterValue] = readVarint(bytes, offset);
            offset = afterValue;
            fields.push({ field, wire, value });
        } else if (wire === 1) {
            fields.push({ field, wire, value: new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getFloat64(0, true) });
            offset += 8;
        } else if (wire === 2) {
            const [length, afterLength] = readVarint(bytes, offset);
            offset = afterLength;
            const end = offset + Number(length);
            fields.push({ field, wire, value: bytes.slice(offset, end) });
            offset = end;
        } else if (wire === 5) {
            fields.push({ field, wire, value: new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getFloat32(0, true) });
            offset += 4;
        } else {
            break;
        }
    }
    return fields;
}

function readVarint(bytes: Uint8Array, offset: number): [bigint, number] {
    let shift = 0n;
    let result = 0n;
    while (offset < bytes.length) {
        const byte = bytes[offset++];
        result |= BigInt(byte & 0x7f) << shift;
        if (!(byte & 0x80)) return [result, offset];
        shift += 7n;
    }
    return [result, offset];
}

function protoMessages(fields: ProtoField[], field: number): ProtoField[][] {
    return fields
        .filter(item => item.field === field && item.wire === 2 && item.value instanceof Uint8Array)
        .map(item => decodeProtoMessage(item.value as Uint8Array));
}

function protoFirstMessage(fields: ProtoField[], field: number): ProtoField[] | null {
    return protoMessages(fields, field)[0] ?? null;
}

function protoString(fields: ProtoField[], field: number): string {
    const item = fields.find(value => value.field === field && value.wire === 2 && value.value instanceof Uint8Array);
    return item ? new TextDecoder().decode(item.value as Uint8Array) : '';
}

function protoNumber(fields: ProtoField[], field: number): number {
    const item = fields.find(value => value.field === field);
    if (!item) return 0;
    return typeof item.value === 'bigint' ? Number(item.value) : typeof item.value === 'number' ? item.value : 0;
}

function protoBox(geometry: ProtoField[] | null, width: number, height: number): OcrRect | null {
    const box = geometry ? protoFirstMessage(geometry, 1) : null;
    if (!box) return null;
    const centerX = protoNumber(box, 1);
    const centerY = protoNumber(box, 2);
    const boxWidth = protoNumber(box, 3);
    const boxHeight = protoNumber(box, 4);
    if (!boxWidth || !boxHeight) return null;
    const normalized = centerX <= 2 && centerY <= 2 && boxWidth <= 2 && boxHeight <= 2;
    return clampBox({
        left: (normalized ? centerX * width : centerX) - (normalized ? boxWidth * width : boxWidth) / 2,
        top: (normalized ? centerY * height : centerY) - (normalized ? boxHeight * height : boxHeight) / 2,
        width: normalized ? boxWidth * width : boxWidth,
        height: normalized ? boxHeight * height : boxHeight,
    }, width, height);
}
function stringFrom(value: unknown): string {
    return typeof value === 'string' ? value.replace(/\s+/g, '').trim() : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function numberFrom(value: unknown): number | null {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}
