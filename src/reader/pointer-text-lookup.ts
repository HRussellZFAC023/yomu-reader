const JAPANESE_RUN_RE = /[\u3040-\u30ff\u3400-\u9fff々〆ヵヶー]/u;
const JPDB_POINTER_CANDIDATE_MAX_LENGTH = 18;
const JPDB_POINTER_CANDIDATE_START_WINDOW = 8;
const JPDB_POINTER_CANDIDATE_LIMIT = 24;
export const JPDB_POINTER_BOUNDARY_SEGMENTS = [
    'から',
    'まで',
    'より',
    'だけ',
    'しか',
    'など',
    'には',
    'では',
    'とは',
    'は',
    'が',
    'を',
    'に',
    'へ',
    'と',
    'で',
    'の',
    'や',
];
const READER_ROOT_SELECTOR = '[data-jpdb-reader-root]';
const POINTER_TEXT_SKIP_SELECTOR = [
    'script',
    'style',
    'noscript',
    'textarea',
    'input',
    'select',
    'button',
    'option',
    'summary',
    'svg',
    'use',
    'rt',
    'rp',
    '[contenteditable="true"]',
    '[role="button"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="tab"]',
    '[onclick]',
    READER_ROOT_SELECTOR,
].join(',');
const READER_ROOT_POINTER_TEXT_LINK_SELECTOR = `${READER_ROOT_SELECTOR} .jpdb-reader-local-glossary a[href]`;
const SCREEN_READER_ONLY_CLASS_RE = /(^|[-_\s])(sr-only|screen-reader-text|visually-hidden|visuallyhidden)([-_\s]|$)/i;
const YOUTUBE_METADATA_SELECTOR = [
    '#metadata',
    '#metadata-line',
    '#metadata-text',
    '#video-info',
    '#stats',
    'ytd-video-meta-block',
    'yt-content-metadata-view-model',
    '.inline-metadata-item',
    '.badge-style-type-simple',
].join(',');
const METADATA_TOKEN_RE = /^(?:[\d０-９][\d０-９,.，]*\s*)?(?:万|億)?(?:回視聴|視聴|再生|回再生|件|コメント|高評価|日前|時間前|分前|秒前|か月前|ヶ月前|週間前|年前|ライブ配信中|新着)$/u;
const POINTER_TEXT_CONTEXT_ROOT_SELECTOR = [
    'p',
    'li',
    'figcaption',
    'blockquote',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'a',
    'yt-formatted-string',
    'yt-attributed-string',
    '[id="content-text"]',
    '[id="video-title"]',
    '[data-jpdb-reader-context]',
].join(',');
const POINTER_TEXT_CONTEXT_SKIP_SELECTOR = [
    'script',
    'style',
    'noscript',
    'textarea',
    'input',
    'select',
    'button',
    'option',
    'summary',
    'svg',
    'use',
    'rt',
    'rp',
    '[aria-hidden="true"]',
    '[hidden]',
].join(',');
const POINTER_TEXT_CONTEXT_MAX_LENGTH = 220;

export interface PointerTextLookup {
    text: string;
    offset: number;
    start: number;
    end: number;
    anchor: HTMLElement;
}

export interface ActivePointerTextLookup {
    text: string;
    start: number;
    end: number;
    anchor: HTMLElement;
}

export interface PointerTextSpanCandidate {
    term: string;
    start: number;
    end: number;
}

export function caretTextPositionFromPoint(x: number, y: number): { node: Text; offset: number } | null {
    const doc = document as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const position = doc.caretPositionFromPoint?.(x, y);
    if (position?.offsetNode.nodeType === Node.TEXT_NODE) {
        return { node: position.offsetNode as Text, offset: position.offset };
    }

    const range = doc.caretRangeFromPoint?.(x, y);
    if (range?.startContainer.nodeType === Node.TEXT_NODE) {
        return { node: range.startContainer as Text, offset: range.startOffset };
    }
    return null;
}

export function japaneseRunAt(text: string, offset: number): { start: number; end: number; offset: number } | null {
    const index = japaneseRunIndexAt(text, offset);
    if (index === null) return null;

    return {
        start: japaneseRunStart(text, index),
        end: japaneseRunEnd(text, index),
        offset: index,
    };
}

export function jpdbPointerLookupCandidates(text: string, offset: number): PointerTextSpanCandidate[] {
    const run = japaneseRunAt(text, offset);
    if (!run) return [];
    const candidates: PointerTextSpanCandidate[] = [];
    pushPointerCandidate(candidates, pointerBoundaryCandidate(text, run));
    const minStart = Math.max(run.start, run.offset - JPDB_POINTER_CANDIDATE_START_WINDOW);
    const maxEnd = Math.min(run.end, run.offset + JPDB_POINTER_CANDIDATE_MAX_LENGTH);
    const maxLength = Math.min(JPDB_POINTER_CANDIDATE_MAX_LENGTH, maxEnd - minStart);
    for (let length = maxLength; length >= 2; length--) {
        const firstStart = Math.max(minStart, run.offset - length + 1);
        const lastStart = Math.min(run.offset, maxEnd - length);
        for (let start = firstStart; start <= lastStart; start++) {
            pushPointerCandidate(candidates, pointerCandidate(text, start, start + length));
            if (candidates.length >= JPDB_POINTER_CANDIDATE_LIMIT) return candidates;
        }
    }
    return candidates;
}

function pointerBoundaryCandidate(text: string, run: NonNullable<ReturnType<typeof japaneseRunAt>>): PointerTextSpanCandidate | null {
    const relativeOffset = run.offset - run.start;
    const runText = text.slice(run.start, run.end);
    const boundaries = pointerBoundarySegments(runText);
    let start = 0;
    let end = runText.length;
    for (const boundary of boundaries) {
        if (relativeOffset >= boundary.start && relativeOffset < boundary.end) {
            return pointerCandidate(text, run.start + boundary.start, run.start + boundary.end);
        }
        if (boundary.end <= relativeOffset) start = boundary.end;
        if (boundary.start > relativeOffset) {
            end = boundary.start;
            break;
        }
    }
    return pointerCandidate(text, run.start + start, run.start + end);
}

function pointerBoundarySegments(text: string): Array<{ start: number; end: number }> {
    const boundaries: Array<{ start: number; end: number }> = [];
    for (let index = 0; index < text.length;) {
        const boundary = boundarySegmentAt(text, index);
        if (!boundary) {
            index++;
            continue;
        }
        if (index > 0 && index + boundary.length < text.length) {
            boundaries.push({ start: index, end: index + boundary.length });
        }
        index += boundary.length;
    }
    return boundaries;
}

function boundarySegmentAt(text: string, index: number): string {
    return JPDB_POINTER_BOUNDARY_SEGMENTS.find(segment => text.startsWith(segment, index)) ?? '';
}

function pointerCandidate(text: string, start: number, end: number): PointerTextSpanCandidate | null {
    if (end <= start) return null;
    const term = text.slice(start, end).trim();
    if (!isUsefulPointerCandidateTerm(term)) return null;
    return { term, start, end };
}

function isUsefulPointerCandidateTerm(term: string): boolean {
    return term.length > 1 && [...term].some(character => JAPANESE_RUN_RE.test(character));
}

function pushPointerCandidate(candidates: PointerTextSpanCandidate[], candidate: PointerTextSpanCandidate | null): void {
    if (!candidate) return;
    if (candidates.some(existing => existing.term === candidate.term && existing.start === candidate.start && existing.end === candidate.end)) return;
    candidates.push(candidate);
}

function japaneseRunIndexAt(text: string, offset: number): number | null {
    let index = Math.min(Math.max(offset, 0), text.length - 1);
    if (!isJapaneseCharacterAt(text, index) && index > 0 && isJapaneseCharacterAt(text, index - 1)) index--;
    return isJapaneseCharacterAt(text, index) ? index : null;
}

function japaneseRunStart(text: string, index: number): number {
    let start = index;
    while (start > 0 && isJapaneseCharacterAt(text, start - 1)) start--;
    return start;
}

function japaneseRunEnd(text: string, index: number): number {
    let end = index + 1;
    while (end < text.length && isJapaneseCharacterAt(text, end)) end++;
    return end;
}

function isJapaneseCharacterAt(text: string, index: number): boolean {
    return JAPANESE_RUN_RE.test(text[index] ?? '');
}

export function pointerTextCharacterOffset(node: Text, caretOffset: number, x: number, y: number): number | null {
    const parent = node.parentElement;
    if (!parent || !isPointerTextParentEligible(parent)) return null;
    const clamped = Math.min(Math.max(caretOffset, 0), node.data.length - 1);
    const candidates = [clamped, clamped - 1, clamped + 1]
        .filter((offset, index, offsets) => offset >= 0 && offset < node.data.length && offsets.indexOf(offset) === index);
    return candidates.find(offset => textCharacterContainsPoint(node, offset, x, y)) ?? null;
}

export function pointerTextLookupFromTextNode(node: Text, characterOffset: number): PointerTextLookup | null {
    const parent = node.parentElement;
    if (!parent || !isPointerTextParentEligible(parent)) return null;
    const local = pointerTextLookupForText(parent, node.data, characterOffset);
    const contextual = pointerTextLookupContext(node, characterOffset, parent);
    return contextual ?? local;
}

function isLowValuePointerText(text: string, parent?: HTMLElement | null): boolean {
    const compact = text.replace(/\s+/g, '');
    if (!compact) return true;
    if (parent?.closest(YOUTUBE_METADATA_SELECTOR)) return true;

    const parts = compact
        .split(/[・•|｜/／()[\]【】「」『』<>〈〉《》]+/u)
        .map(part => part.trim())
        .filter(Boolean);
    if (!parts.length) return false;
    return parts.every(part => METADATA_TOKEN_RE.test(part));
}

function pointerTextLookupContext(node: Text, characterOffset: number, anchor: HTMLElement): PointerTextLookup | null {
    const root = pointerTextContextRoot(anchor);
    if (!root || root === anchor) return null;
    const context = readablePointerTextContext(root, node);
    if (!context || context.text.length > POINTER_TEXT_CONTEXT_MAX_LENGTH) return null;
    const offset = context.start + Math.min(Math.max(characterOffset, 0), node.data.length - 1);
    const lookup = pointerTextLookupForText(anchor, context.text, offset);
    if (!lookup || lookup.end - lookup.start <= localJapaneseRunLength(node.data, characterOffset)) return null;
    return isLowValuePointerText(lookup.text, root) ? null : lookup;
}

function pointerTextLookupForText(anchor: HTMLElement, text: string, offset: number): PointerTextLookup | null {
    const run = japaneseRunAt(text, offset);
    if (!run || isLowValuePointerText(text, anchor)) return null;
    return {
        text,
        offset: run.offset,
        start: run.start,
        end: run.end,
        anchor,
    };
}

function localJapaneseRunLength(text: string, offset: number): number {
    const run = japaneseRunAt(text, offset);
    return run ? run.end - run.start : 0;
}

function pointerTextContextRoot(anchor: HTMLElement): HTMLElement | null {
    const root = anchor.closest<HTMLElement>(POINTER_TEXT_CONTEXT_ROOT_SELECTOR);
    if (!root || !isPointerTextParentEligible(root)) return null;
    return root;
}

function readablePointerTextContext(root: HTMLElement, target: Text): { text: string; start: number; end: number } | null {
    let text = '';
    let rangeStart = -1;
    let rangeEnd = -1;

    const visit = (node: Node): void => {
        if (node.nodeType === Node.TEXT_NODE) {
            const value = node.textContent ?? '';
            if (node === target) {
                rangeStart = text.length;
                rangeEnd = text.length + value.length;
            }
            text += value;
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const element = node as Element;
        if (element.matches(POINTER_TEXT_CONTEXT_SKIP_SELECTOR)) return;
        element.childNodes.forEach(visit);
    };

    visit(root);
    if (rangeStart < 0 || rangeEnd <= rangeStart || !text || !JAPANESE_RUN_RE.test(text)) return null;
    return { text, start: rangeStart, end: rangeEnd };
}

function isPointerTextParentEligible(parent: HTMLElement): boolean {
    const allowReaderRoot = Boolean(parent.closest(READER_ROOT_POINTER_TEXT_LINK_SELECTOR));
    let current: HTMLElement | null = parent;
    while (current) {
        if (!isPointerTextElementEligible(current, allowReaderRoot)) return false;
        current = current.parentElement;
    }
    return true;
}

function isPointerTextElementEligible(element: HTMLElement, allowReaderRoot = false): boolean {
    const style = getComputedStyle(element);
    return elementPassesPointerTextAttributes(element, allowReaderRoot)
        && stylePassesPointerTextLookup(style)
        && !isScreenReaderOnlyElement(element, style);
}

function elementPassesPointerTextAttributes(element: HTMLElement, allowReaderRoot: boolean): boolean {
    return (!element.matches(POINTER_TEXT_SKIP_SELECTOR) || (allowReaderRoot && element.matches(READER_ROOT_SELECTOR)))
        && !element.hasAttribute('hidden')
        && !element.hasAttribute('inert')
        && element.getAttribute('aria-hidden')?.toLowerCase() !== 'true';
}

function stylePassesPointerTextLookup(style: CSSStyleDeclaration): boolean {
    return style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.visibility !== 'collapse'
        && Number(style.opacity || '1') > 0;
}

function isScreenReaderOnlyElement(element: HTMLElement, style: CSSStyleDeclaration): boolean {
    if (hasScreenReaderOnlyClass(element)) return true;
    const rect = element.getBoundingClientRect();
    return isTinyClippedElement(rect, style) || isTinyHiddenAbsoluteElement(rect, style);
}

function hasScreenReaderOnlyClass(element: HTMLElement): boolean {
    return SCREEN_READER_ONLY_CLASS_RE.test(element.className || '');
}

function isTinyClippedElement(rect: DOMRect, style: CSSStyleDeclaration): boolean {
    const clipped = Boolean((style.clip && style.clip !== 'auto') || (style.clipPath && style.clipPath !== 'none'));
    return clipped && isTinyRect(rect);
}

function isTinyHiddenAbsoluteElement(rect: DOMRect, style: CSSStyleDeclaration): boolean {
    return style.position === 'absolute' && style.overflow === 'hidden' && isTinyRect(rect);
}

function isTinyRect(rect: DOMRect): boolean {
    return rect.width <= 2 && rect.height <= 2;
}

function textCharacterContainsPoint(node: Text, offset: number, x: number, y: number): boolean {
    if (!node.data.length) return false;
    const start = Math.min(Math.max(offset, 0), node.data.length - 1);
    const range = document.createRange();
    try {
        range.setStart(node, start);
        range.setEnd(node, start + 1);
        return Array.from(range.getClientRects()).some(rect => rectContainsPoint(rect, x, y));
    } finally {
        range.detach?.();
    }
}

function rectContainsPoint(rect: DOMRect, x: number, y: number): boolean {
    const right = rect.right || rect.left + rect.width;
    const bottom = rect.bottom || rect.top + rect.height;
    const slack = 1;
    return hasPositiveRectArea(rect, right, bottom)
        && coordinateInRange(x, rect.left, right, slack)
        && coordinateInRange(y, rect.top, bottom, slack);
}

function hasPositiveRectArea(rect: DOMRect, right: number, bottom: number): boolean {
    return right > rect.left && bottom > rect.top;
}

function coordinateInRange(value: number, start: number, end: number, slack: number): boolean {
    return value >= start - slack && value <= end + slack;
}
