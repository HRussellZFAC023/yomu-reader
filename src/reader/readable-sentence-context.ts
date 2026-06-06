const HAS_JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/;
const READER_ROOT_SELECTOR = '[data-jpdb-reader-root]';
const READABLE_IGNORED_TAGS = new Set(['RT', 'RP', 'SCRIPT', 'STYLE']);
const MAX_CONTEXT_SENTENCE_LENGTH = 180;

export function readerWordSurfaceText(element: Element): string {
    let text = '';
    element.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent ?? '';
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const child = node as Element;
        if (isSurfaceIgnoredElement(child)) return;
        text += readerWordSurfaceText(child);
    });
    return text;
}

export function nearestReadableSentenceForElement(element: HTMLElement, fallback = ''): string {
    const surface = readerWordSurfaceText(element).trim() || element.textContent?.trim() || '';
    const cleanFallback = cleanReadableSentence(fallback);
    const ocrLine = element.closest<HTMLElement>('.jpdb-ocr-line');
    if (ocrLine) return ocrLineSentenceForElement(ocrLine, surface, cleanFallback);
    const nearest = nearestReadableAncestorSentence(element, surface, cleanFallback);
    return nearest || fallbackReadableSentence(cleanFallback, surface);
}

function ocrLineSentenceForElement(ocrLine: HTMLElement, surface: string, cleanFallback: string): string {
    const line = cleanReadableSentence(ocrLine.dataset.ocrText || ocrLine.getAttribute('aria-label') || '');
    if (shouldUseOcrLineText(line, surface)) return line;
    const multi = ocrLineMultiSentence(ocrLine, line, cleanFallback);
    const local = ocrLineLocalSentence(multi, surface, cleanFallback);
    if (local) return local;
    return cleanReadableSentence(line || multi || surface || cleanFallback);
}

function shouldUseOcrLineText(line: string, surface: string): boolean {
    return Boolean(line && (!surface || textIncludesSearch(line, surface)));
}

function ocrLineMultiSentence(ocrLine: HTMLElement, line: string, cleanFallback: string): string {
    return cleanReadableSentence(ocrLine.dataset.sentence || line || cleanFallback);
}

function ocrLineLocalSentence(multi: string, surface: string, cleanFallback: string): string {
    return surface ? sentenceAroundSurface(multi, surface, cleanFallback) : '';
}

function nearestReadableAncestorSentence(element: HTMLElement, surface: string, cleanFallback: string): string {
    let current: HTMLElement | null = element.parentElement;

    while (isReadableAncestorCandidate(current)) {
        const sentence = readableAncestorSentence(current, element, surface, cleanFallback);
        if (sentence) return sentence;
        current = current.parentElement;
    }
    return '';
}

function isReadableAncestorCandidate(element: HTMLElement | null): element is HTMLElement {
    if (!element) return false;
    return element !== document.body && element !== document.documentElement;
}

function readableAncestorSentence(element: HTMLElement, target: HTMLElement, surface: string, cleanFallback: string): string {
    if (!canReadSentenceContextFrom(element)) return '';
    const text = readableSurfaceText(element);
    const range = readableSurfaceRange(element, target);
    const sentence = range
        ? sentenceAroundRange(text, range.start, range.end, cleanFallback)
        : sentenceAroundSurface(text, surface, cleanFallback);
    return isUsefulContextSentence(sentence, cleanFallback, surface) ? sentence : '';
}

function fallbackReadableSentence(cleanFallback: string, surface: string): string {
    return sentenceAroundSurface(cleanFallback, surface) || cleanFallback;
}

function canReadSentenceContextFrom(element: HTMLElement): boolean {
    return !element.closest(READER_ROOT_SELECTOR)
        || Boolean(element.closest('.jpdb-reader-popover, .jpdb-subtitle-player, .jpdb-subtitle-list, .jpdb-ocr-layer'));
}

export function sentenceAroundSurface(value: string, surface = '', fallback = ''): string {
    const text = cleanReadableSentence(value);
    if (!isJapaneseSentenceContext(text)) return '';

    const search = sentenceSearchText(text, surface, fallback);
    const index = sentenceSearchIndex(text, search);
    if (index < 0) return clampContextText(text);

    const hardBounded = hardBoundedSentence(text, index, search.length);
    const hardClean = trimSoftSentenceBoundary(hardBounded, search);
    if (hardClean.length <= MAX_CONTEXT_SENTENCE_LENGTH) return hardClean;

    return clampLongSentence(hardClean, search);
}

export function sentenceAroundRange(value: string, start: number, end: number, fallback = ''): string {
    if (!isJapaneseSentenceContext(cleanReadableSentence(value))) return '';
    const range = normalizedSentenceRange(value.length, start, end);
    if (!range) return sentenceAroundSurface(value, fallback, fallback);

    const hardBounded = hardBoundedSentenceRange(value, range.start, range.end);
    const localStart = range.start - hardBounded.start;
    const localEnd = range.end - hardBounded.start;
    const hardText = cleanReadableSentence(hardBounded.text);
    const surface = cleanReadableSentence(hardBounded.text.slice(localStart, localEnd)) || fallback;
    const cleanStart = cleanReadableSentence(hardBounded.text.slice(0, localStart)).length;
    const cleanEnd = cleanStart + surface.length;
    const hardClean = trimSoftSentenceBoundaryAroundRange(hardText, cleanStart, cleanEnd);
    if (!hardClean) return sentenceAroundSurface(value, fallback, fallback);
    if (hardClean.length <= MAX_CONTEXT_SENTENCE_LENGTH) return hardClean;

    return clampLongSentence(hardClean, surface);
}

function normalizedSentenceRange(length: number, start: number, end: number): { start: number; end: number } | null {
    if (!Number.isFinite(start) || !Number.isFinite(end) || length <= 0) return null;
    const safeStart = Math.max(0, Math.min(length - 1, Math.floor(start)));
    const safeEnd = Math.max(safeStart + 1, Math.min(length, Math.ceil(end)));
    return { start: safeStart, end: safeEnd };
}

function sentenceSearchIndex(text: string, search: string): number {
    if (!search) return 0;
    return text.indexOf(search);
}

function isJapaneseSentenceContext(text: string): boolean {
    return Boolean(text && HAS_JAPANESE.test(text));
}

function sentenceSearchText(text: string, surface: string, fallback: string): string {
    const cleanSurface = cleanReadableSentence(surface);
    const cleanFallback = cleanReadableSentence(fallback);
    if (textIncludesSearch(text, cleanSurface)) return cleanSurface;
    if (textIncludesSearch(text, cleanFallback)) return cleanFallback;
    return '';
}

function textIncludesSearch(text: string, search: string): boolean {
    if (!search) return false;
    return text.includes(search);
}

function clampContextText(text: string): string {
    return text.length <= MAX_CONTEXT_SENTENCE_LENGTH ? text : text.slice(0, MAX_CONTEXT_SENTENCE_LENGTH).trim();
}

function isUsefulContextSentence(sentence: string, fallback: string, surface: string): boolean {
    if (!isJapaneseContextSentence(sentence)) return false;
    if (!containsSurfaceContext(sentence, surface)) return false;
    return fallback ? isRicherThanFallback(sentence, fallback) : true;
}

function isJapaneseContextSentence(sentence: string): boolean {
    return Boolean(sentence && HAS_JAPANESE.test(sentence));
}

function containsSurfaceContext(sentence: string, surface: string): boolean {
    return !surface || sentence.includes(surface);
}

function isRicherThanFallback(sentence: string, fallback: string): boolean {
    if (sentence === fallback) return false;
    if (sentence.length <= fallback.length + 2) return false;
    return sentence.length >= 8 || /[。！？]/u.test(sentence);
}

function readableSurfaceText(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return nodeTextContent(node);
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    return readableElementSurfaceText(node as Element);
}

function readableElementSurfaceText(element: Element): string {
    if (isIgnoredReadableElement(element)) return '';

    let text = '';
    element.childNodes.forEach(child => { text += readableSurfaceText(child); });
    return text;
}

function readableSurfaceRange(root: Element, target: HTMLElement): { start: number; end: number } | null {
    let offset = 0;
    let range: { start: number; end: number } | null = null;

    const visit = (node: Node): void => {
        if (range) return;
        if (node === target) {
            const text = readableSurfaceText(node);
            range = { start: offset, end: offset + text.length };
            offset += text.length;
            return;
        }
        if (node.nodeType === Node.TEXT_NODE) {
            offset += nodeTextContent(node).length;
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const element = node as Element;
        if (isIgnoredReadableElement(element)) return;
        element.childNodes.forEach(visit);
    };

    visit(root);
    return range;
}

function isIgnoredReadableElement(element: Element): boolean {
    return isSurfaceIgnoredElement(element)
        || element.matches('button,svg,use,[aria-hidden="true"],[role="button"]');
}

function isSurfaceIgnoredElement(element: Element): boolean {
    return READABLE_IGNORED_TAGS.has(element.tagName)
        || element.matches('[data-jpdb-reader-surface-ignore="true"],.jpdb-reader-furi,.jpdb-ocr-furi');
}

function cleanReadableSentence(value: string): string {
    return value
        .replace(/\s+/g, ' ')
        .replace(/([\u3040-\u30ff\u3400-\u9fff々〆ヵヶ])\s+([、。！？・])/gu, '$1$2')
        .replace(/([、。！？・])\s+([\u3040-\u30ff\u3400-\u9fff々〆ヵヶ])/gu, '$1$2')
        .trim();
}

function hardBoundedSentence(text: string, index: number, length: number): string {
    const start = sentenceStartIndex(text, index);
    const end = sentenceEndIndex(text, index + length);
    return text.slice(start, end).trim();
}

function hardBoundedSentenceRange(text: string, start: number, end: number): { text: string; start: number } {
    const sentenceStart = sentenceStartIndex(text, start);
    const sentenceEnd = sentenceEndIndex(text, end);
    return {
        text: text.slice(sentenceStart, sentenceEnd),
        start: sentenceStart,
    };
}

function sentenceStartIndex(text: string, index: number): number {
    for (let i = index - 1; i >= 0; i--) {
        if (/[。！？!?]/u.test(text[i] ?? '')) return i + 1;
    }
    return 0;
}

function sentenceEndIndex(text: string, index: number): number {
    for (let i = index; i < text.length; i++) {
        if (/[。！？!?]/u.test(text[i] ?? '')) return i + 1;
    }
    return text.length;
}

function trimSoftSentenceBoundary(sentence: string, surface: string): string {
    const clean = sentence.trim();
    if (!surface) return clean;
    const index = clean.indexOf(surface);
    if (index < 0) return clean;
    const start = softBoundaryStart(clean, index);
    const end = softBoundaryEnd(clean, index + surface.length);
    const trimmed = clean.slice(start, end).trim();
    const omitted = `${clean.slice(0, start)}${clean.slice(end)}`;
    return shouldUseSoftSentenceTrim(clean, trimmed, omitted) ? trimmed : clean;
}

function trimSoftSentenceBoundaryAroundRange(sentence: string, start: number, end: number): string {
    const leadingTrim = sentence.length - sentence.trimStart().length;
    const clean = sentence.trim();
    if (!clean) return clean;
    const cleanStart = Math.max(0, Math.min(clean.length, start - leadingTrim));
    const cleanEnd = Math.max(cleanStart, Math.min(clean.length, end - leadingTrim));
    const trimStart = softBoundaryStart(clean, cleanStart);
    const trimEnd = softBoundaryEnd(clean, cleanEnd);
    const trimmed = clean.slice(trimStart, trimEnd).trim();
    const omitted = `${clean.slice(0, trimStart)}${clean.slice(trimEnd)}`;
    return shouldUseSoftSentenceTrim(clean, trimmed, omitted) ? trimmed : clean;
}

function shouldUseSoftSentenceTrim(clean: string, trimmed: string, omitted: string): boolean {
    if (!trimmed || trimmed === clean) return false;
    return clean.length > 48 || /[。！？!?]/u.test(omitted);
}

function softBoundaryStart(text: string, index: number): number {
    for (let i = index - 1; i >= 0; i--) {
        if (isStrongWhitespaceBoundary(text, i)) return i + 1;
    }
    return 0;
}

function softBoundaryEnd(text: string, index: number): number {
    for (let i = index; i < text.length; i++) {
        if (isStrongWhitespaceBoundary(text, i)) return i;
    }
    return text.length;
}

function isStrongWhitespaceBoundary(text: string, index: number): boolean {
    const char = text[index] ?? '';
    if (!/\s/u.test(char)) return false;
    const before = text.slice(Math.max(0, index - 24), index);
    const after = text.slice(index + 1, Math.min(text.length, index + 25));
    return HAS_JAPANESE.test(before) && HAS_JAPANESE.test(after);
}

function clampLongSentence(sentence: string, surface: string): string {
    if (sentence.length <= MAX_CONTEXT_SENTENCE_LENGTH) return sentence;
    const index = surface ? sentence.indexOf(surface) : -1;
    if (index < 0) return sentence.slice(0, MAX_CONTEXT_SENTENCE_LENGTH).trim();
    const halfWindow = Math.floor((MAX_CONTEXT_SENTENCE_LENGTH - surface.length) / 2);
    const start = Math.max(0, index - Math.max(0, halfWindow));
    const end = Math.min(sentence.length, start + MAX_CONTEXT_SENTENCE_LENGTH);
    return sentence.slice(start, end).trim();
}

function nodeTextContent(node: Node): string {
    return node.textContent ?? '';
}
