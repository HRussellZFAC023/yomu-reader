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
    let index = Math.min(Math.max(offset, 0), text.length - 1);
    if (!JAPANESE_RUN_RE.test(text[index] ?? '') && index > 0 && JAPANESE_RUN_RE.test(text[index - 1] ?? '')) index--;
    if (!JAPANESE_RUN_RE.test(text[index] ?? '')) return null;

    let start = index;
    let end = index + 1;
    while (start > 0 && JAPANESE_RUN_RE.test(text[start - 1])) start--;
    while (end < text.length && JAPANESE_RUN_RE.test(text[end])) end++;
    return { start, end, offset: index };
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
        if (current.matches(POINTER_TEXT_SKIP_SELECTOR)) return false;
        if (current.hasAttribute('hidden') || current.hasAttribute('inert')) return false;
        if (current.getAttribute('aria-hidden')?.toLowerCase() === 'true') return false;

        const style = getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
        if (Number(style.opacity || '1') <= 0) return false;
        if (isScreenReaderOnlyElement(current, style)) return false;
        current = current.parentElement;
    }
    return true;
}

function isScreenReaderOnlyElement(element: HTMLElement, style: CSSStyleDeclaration): boolean {
    if (SCREEN_READER_ONLY_CLASS_RE.test(element.className || '')) return true;
    const rect = element.getBoundingClientRect();
    const clipped = (style.clip && style.clip !== 'auto') || (style.clipPath && style.clipPath !== 'none');
    if (clipped && rect.width <= 2 && rect.height <= 2) return true;
    return style.position === 'absolute' && style.overflow === 'hidden' && rect.width <= 2 && rect.height <= 2;
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
    return right > rect.left
        && bottom > rect.top
        && x >= rect.left - slack
        && x <= right + slack
        && y >= rect.top - slack
        && y <= bottom + slack;
}
