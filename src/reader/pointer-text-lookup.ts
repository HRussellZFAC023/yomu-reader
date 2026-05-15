const JAPANESE_RUN_RE = /[\u3040-\u30ff\u3400-\u9fff々〆ヵヶー]/u;
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
    '[data-jpdb-reader-root]',
].join(',');
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

export function isLowValuePointerText(text: string, parent?: HTMLElement | null): boolean {
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

function isPointerTextParentEligible(parent: HTMLElement): boolean {
    let current: HTMLElement | null = parent;
    while (current) {
        if (!isPointerTextElementEligible(current)) return false;
        current = current.parentElement;
    }
    return true;
}

function isPointerTextElementEligible(element: HTMLElement): boolean {
    const style = getComputedStyle(element);
    return elementPassesPointerTextAttributes(element)
        && stylePassesPointerTextLookup(style)
        && !isScreenReaderOnlyElement(element, style);
}

function elementPassesPointerTextAttributes(element: HTMLElement): boolean {
    return !element.matches(POINTER_TEXT_SKIP_SELECTOR)
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
