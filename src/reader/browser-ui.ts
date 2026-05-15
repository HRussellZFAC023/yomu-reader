import { Logger } from './logger';

const log = Logger.scope('BrowserUi');
type NormalizedWritingMode = 'horizontal-tb' | 'vertical-rl' | 'vertical-lr' | 'sideways-rl' | 'sideways-lr';

interface PopoverRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

interface PopoverSizeRect {
    left: number;
    top: number;
    width: number;
    height: number;
    after: boolean;
    below: boolean;
}

interface PopoverPositionOptions {
    followPoint?: { x: number; y: number };
    maxHeight?: number;
}

interface PopoverWritingLayout {
    horizontalOffset: number;
    verticalOffset: number;
    preferAfter: boolean;
}

interface PopoverRectCandidate {
    rect: PopoverRect;
    index: number;
    canOverlap: boolean;
}

const DEFAULT_POPOVER_WRITING_MODE: NormalizedWritingMode = 'horizontal-tb';
const SUPPORTED_POPOVER_WRITING_MODES = new Set<NormalizedWritingMode>([
    'horizontal-tb',
    'vertical-rl',
    'vertical-lr',
    'sideways-rl',
    'sideways-lr',
]);

export function pauseActiveVideo(): void {
    const videos = Array.from(document.querySelectorAll('video'));
    const playable = videos
        .filter(video => video.readyState > 0)
        .sort((a, b) => {
            const aArea = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
            const bArea = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
            return Number(a.paused) - Number(b.paused) || bArea - aArea;
        });
    const target = playable[0];
    target?.pause();
    log.debug('Pause active video requested', { videos: videos.length, playable: playable.length, paused: Boolean(target) });
}

export function isEditableTarget(target: EventTarget | null): boolean {
    const element = target instanceof Element ? target : null;
    return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'));
}

export async function copyText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            log.debug('Copied text with Clipboard API', { length: text.length });
            return;
        } catch (error) {
            log.debug('Clipboard API copy failed, falling back', { length: text.length, error });
            // Userscript contexts can deny clipboard even when the API exists.
        }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    log.debug('Copied text with execCommand fallback', { length: text.length });
}

export function normalizePressedKey(key: string): string {
    if (key === ' ') return 'space';
    return key.toLowerCase();
}

export function positionPopover(popover: HTMLElement, anchor?: HTMLElement, fallbackRect?: DOMRect, options: PopoverPositionOptions = {}): void {
    const scrollTop = popover.scrollTop;
    const margin = 8;
    const sourceRects = getPopoverSourceRects(anchor, fallbackRect, options);
    const viewport = getPopoverViewport();
    const viewportHeight = viewport.bottom - viewport.top;
    const viewportWidth = viewport.right - viewport.left;
    const maxFrameHeight = Math.max(0, Math.min(viewportHeight, options.maxHeight ?? viewportHeight));
    popover.style.maxWidth = `${Math.max(0, viewportWidth)}px`;
    popover.style.maxHeight = `${maxFrameHeight}px`;
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    const fallbackLeft = (viewport.left + viewport.right - width) / 2;
    const fallbackTop = viewportHeight * 0.18;
    if (!sourceRects.length) {
        popover.style.left = `${Math.max(margin, Math.min(fallbackLeft, window.innerWidth - width - margin))}px`;
        popover.style.top = `${Math.max(margin, Math.min(fallbackTop, window.innerHeight - height - margin))}px`;
        if (popover.scrollTop !== scrollTop) popover.scrollTop = scrollTop;
        log.debugThrottled('position-popover', 1000, 'Popover positioned without anchor', { width, height, viewportWidth, viewportHeight });
        return;
    }

    const writingMode = getPopoverWritingMode(anchor);
    const position = getYomitanLikePopoverPosition(sourceRects, writingMode, viewport, width, height);
    popover.style.maxWidth = `${Math.max(0, position.width)}px`;
    popover.style.maxHeight = `${Math.max(0, position.height)}px`;
    popover.dataset.jpdbReaderPlacementSide = getPlacementSide(writingMode, position);
    popover.style.left = `${position.left}px`;
    popover.style.top = `${position.top}px`;
    if (popover.scrollTop !== scrollTop) popover.scrollTop = scrollTop;
    log.debugThrottled('position-popover', 1000, 'Popover positioned', {
        left: Math.round(position.left),
        top: Math.round(position.top),
        side: popover.dataset.jpdbReaderPlacementSide,
        followsPointer: Boolean(options.followPoint),
        width: Math.round(position.width),
        height: Math.round(position.height),
        viewportWidth,
        viewportHeight,
    });
}

function getPopoverSourceRects(anchor: HTMLElement | undefined, fallbackRect: DOMRect | undefined, options: PopoverPositionOptions): PopoverRect[] {
    if (options.followPoint) return pointPopoverRects(options.followPoint);
    const anchorRects = anchorPopoverRects(anchor);
    if (anchorRects.length) return anchorRects;
    if (fallbackRect) return [domRectToPopoverRect(fallbackRect)];
    return selectionPopoverRects();
}

function pointPopoverRects(point: { x: number; y: number }): PopoverRect[] {
    return [{ left: point.x, top: point.y, right: point.x + 1, bottom: point.y + 1 }];
}

function anchorPopoverRects(anchor: HTMLElement | undefined): PopoverRect[] {
    if (!anchor) return [];
    const clientRects = rectListToPopoverRects(anchor.getClientRects());
    if (clientRects.length) return clientRects;
    const rect = domRectToPopoverRect(anchor.getBoundingClientRect());
    return hasRectArea(rect) ? [rect] : [];
}

function selectionPopoverRects(): PopoverRect[] {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range) return [];
    const clientRects = rangeClientPopoverRects(range);
    return clientRects.length ? clientRects : rangeBoundingPopoverRects(range);
}

function rangeClientPopoverRects(range: Range): PopoverRect[] {
    return typeof range.getClientRects === 'function'
        ? rectListToPopoverRects(range.getClientRects())
        : [];
}

function rangeBoundingPopoverRects(range: Range): PopoverRect[] {
    if (typeof range.getBoundingClientRect !== 'function') return [];
    const rect = domRectToPopoverRect(range.getBoundingClientRect());
    return hasRectArea(rect) ? [rect] : [];
}

function rectListToPopoverRects(rects: DOMRectList): PopoverRect[] {
    return Array.from(rects, domRectToPopoverRect).filter(hasRectArea);
}

function domRectToPopoverRect(rect: DOMRect | DOMRectReadOnly): PopoverRect {
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

function hasRectArea(rect: PopoverRect): boolean {
    return rect.right > rect.left || rect.bottom > rect.top;
}

function getPopoverViewport(): PopoverRect {
    const { visualViewport } = window;
    if (visualViewport) {
        const left = visualViewport.offsetLeft;
        const top = visualViewport.offsetTop;
        return {
            left,
            top,
            right: left + visualViewport.width,
            bottom: top + visualViewport.height,
        };
    }
    return {
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
    };
}

function getPopoverWritingMode(anchor: HTMLElement | undefined): NormalizedWritingMode {
    return anchor ? normalizePopoverWritingMode(getComputedStyle(anchor).writingMode) : DEFAULT_POPOVER_WRITING_MODE;
}

function normalizePopoverWritingMode(writingMode: string): NormalizedWritingMode {
    const normalized = writingMode as NormalizedWritingMode;
    return SUPPORTED_POPOVER_WRITING_MODES.has(normalized) ? normalized : DEFAULT_POPOVER_WRITING_MODE;
}

function getYomitanLikePopoverPosition(
    sourceRects: PopoverRect[],
    writingMode: NormalizedWritingMode,
    viewport: PopoverRect,
    frameWidth: number,
    frameHeight: number,
): PopoverSizeRect {
    const horizontal = isHorizontalPopoverMode(writingMode);
    const layout = popoverWritingLayout(writingMode, horizontal);
    return bestYomitanPopoverPosition(sourceRects, horizontal, viewport, frameWidth, frameHeight, layout)
        ?? fallbackPopoverPosition(viewport, frameWidth, frameHeight);
}

function bestYomitanPopoverPosition(
    sourceRects: PopoverRect[],
    horizontal: boolean,
    viewport: PopoverRect,
    frameWidth: number,
    frameHeight: number,
    layout: PopoverWritingLayout,
): PopoverSizeRect | null {
    let best: PopoverSizeRect | null = null;
    for (const candidate of popoverSourceRectCandidates(sourceRects)) {
        const result = getPositionForWritingMode(candidate.rect, horizontal, frameWidth, frameHeight, viewport, layout.horizontalOffset, layout.verticalOffset, layout.preferAfter);
        if (!canUsePopoverPosition(candidate, result, sourceRects)) continue;
        best = tallerPopoverPosition(best, result);
        if (result.height >= frameHeight) break;
    }
    return best;
}

function isHorizontalPopoverMode(writingMode: NormalizedWritingMode): boolean {
    return writingMode === DEFAULT_POPOVER_WRITING_MODE;
}

function fallbackPopoverPosition(viewport: PopoverRect, frameWidth: number, frameHeight: number): PopoverSizeRect {
    return { left: viewport.left, top: viewport.top, width: frameWidth, height: frameHeight, after: true, below: true };
}

function popoverWritingLayout(writingMode: NormalizedWritingMode, horizontal: boolean): PopoverWritingLayout {
    return {
        horizontalOffset: horizontal ? 0 : 10,
        verticalOffset: horizontal ? 10 : 0,
        preferAfter: horizontal ? true : isVerticalTextPopupOnRight(writingMode),
    };
}

function tallerPopoverPosition(best: PopoverSizeRect | null, next: PopoverSizeRect): PopoverSizeRect {
    return best === null || next.height > best.height ? next : best;
}

function canUsePopoverPosition(candidate: PopoverRectCandidate, position: PopoverSizeRect, sourceRects: PopoverRect[]): boolean {
    return candidate.canOverlap || !isOverlapping(position, sourceRects, candidate.index);
}

function popoverSourceRectCandidates(sourceRects: PopoverRect[]): PopoverRectCandidate[] {
    const candidates = sourceRects.map((rect, index) => ({ rect, index, canOverlap: false }));
    return sourceRects.length > 1
        ? [...candidates, { rect: getBoundingSourceRect(sourceRects), index: sourceRects.length, canOverlap: true }]
        : candidates;
}

function getPositionForWritingMode(
    sourceRect: PopoverRect,
    horizontal: boolean,
    frameWidth: number,
    frameHeight: number,
    viewport: PopoverRect,
    horizontalOffset: number,
    verticalOffset: number,
    preferAfter: boolean,
): PopoverSizeRect {
    return horizontal
        ? getPositionForHorizontalText(sourceRect, frameWidth, frameHeight, viewport, horizontalOffset, verticalOffset, preferAfter)
        : getPositionForVerticalText(sourceRect, frameWidth, frameHeight, viewport, horizontalOffset, verticalOffset, preferAfter);
}

function getPositionForHorizontalText(
    sourceRect: PopoverRect,
    frameWidth: number,
    frameHeight: number,
    viewport: PopoverRect,
    horizontalOffset: number,
    verticalOffset: number,
    preferBelow: boolean,
): PopoverSizeRect {
    const [left, width, after] = getConstrainedPosition(
        sourceRect.right - horizontalOffset,
        sourceRect.left + horizontalOffset,
        frameWidth,
        viewport.left,
        viewport.right,
        true,
    );
    const [top, height, below] = getConstrainedPositionBinary(
        sourceRect.top - verticalOffset,
        sourceRect.bottom + verticalOffset,
        frameHeight,
        viewport.top,
        viewport.bottom,
        preferBelow,
    );
    return { left, top, width, height, after, below };
}

function getPositionForVerticalText(
    sourceRect: PopoverRect,
    frameWidth: number,
    frameHeight: number,
    viewport: PopoverRect,
    horizontalOffset: number,
    verticalOffset: number,
    preferRight: boolean,
): PopoverSizeRect {
    const [left, width, after] = getConstrainedPositionBinary(
        sourceRect.left - horizontalOffset,
        sourceRect.right + horizontalOffset,
        frameWidth,
        viewport.left,
        viewport.right,
        preferRight,
    );
    const [top, height, below] = getConstrainedPosition(
        sourceRect.bottom - verticalOffset,
        sourceRect.top + verticalOffset,
        frameHeight,
        viewport.top,
        viewport.bottom,
        true,
    );
    return { left, top, width, height, after, below };
}

function isVerticalTextPopupOnRight(writingMode: NormalizedWritingMode): boolean {
    return !(writingMode === 'vertical-lr' || writingMode === 'sideways-lr');
}

function getConstrainedPosition(
    positionBefore: number,
    positionAfter: number,
    size: number,
    minLimit: number,
    maxLimit: number,
    after: boolean,
): [position: number, size: number, after: boolean] {
    size = Math.min(size, maxLimit - minLimit);

    let position: number;
    if (after) {
        position = Math.max(minLimit, positionAfter);
        position = position - Math.max(0, position + size - maxLimit);
    } else {
        position = Math.min(maxLimit, positionBefore) - size;
        position = position + Math.max(0, minLimit - position);
    }

    return [position, size, after];
}

function getConstrainedPositionBinary(
    positionBefore: number,
    positionAfter: number,
    size: number,
    minLimit: number,
    maxLimit: number,
    after: boolean,
): [position: number, size: number, after: boolean] {
    const overflowBefore = minLimit - (positionBefore - size);
    const overflowAfter = positionAfter + size - maxLimit;

    if (overflowAfter > 0 || overflowBefore > 0) {
        after = overflowAfter < overflowBefore;
    }

    let position: number;
    if (after) {
        size -= Math.max(0, overflowAfter);
        position = Math.max(minLimit, positionAfter);
    } else {
        size -= Math.max(0, overflowBefore);
        position = Math.min(maxLimit, positionBefore) - size;
    }

    return [position, size, after];
}

function getBoundingSourceRect(sourceRects: PopoverRect[]): PopoverRect {
    switch (sourceRects.length) {
        case 0: return { left: 0, top: 0, right: 0, bottom: 0 };
        case 1: return sourceRects[0];
    }
    let { left, top, right, bottom } = sourceRects[0];
    for (let i = 1, ii = sourceRects.length; i < ii; ++i) {
        const sourceRect = sourceRects[i];
        left = Math.min(left, sourceRect.left);
        top = Math.min(top, sourceRect.top);
        right = Math.max(right, sourceRect.right);
        bottom = Math.max(bottom, sourceRect.bottom);
    }
    return { left, top, right, bottom };
}

function isOverlapping(sizeRect: PopoverSizeRect, sourceRects: PopoverRect[], ignoreIndex: number): boolean {
    const { left, top } = sizeRect;
    const right = left + sizeRect.width;
    const bottom = top + sizeRect.height;
    for (let i = 0, ii = sourceRects.length; i < ii; ++i) {
        if (i === ignoreIndex) continue;
        const sourceRect = sourceRects[i];
        if (rectsOverlap({ left, top, right, bottom }, sourceRect)) return true;
    }
    return false;
}

function rectsOverlap(a: PopoverRect, b: PopoverRect): boolean {
    return a.left < b.right
        && a.right > b.left
        && a.top < b.bottom
        && a.bottom > b.top;
}

function getPlacementSide(writingMode: NormalizedWritingMode, position: PopoverSizeRect): 'above' | 'below' | 'left' | 'right' {
    if (writingMode === 'horizontal-tb') return position.below ? 'below' : 'above';
    return position.after ? 'right' : 'left';
}
