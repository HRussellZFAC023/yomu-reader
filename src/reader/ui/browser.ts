import {
    layoutPointToOverlay,
    overlayViewport,
    overlayViewportBounds,
    sourceRectToOverlay,
} from './page-scale';

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
    preferBefore?: boolean;
    // Keep the side already recorded on the popover (dataset placement side)
    // instead of re-deciding it, so content-driven repositions never make the
    // panel jump from above the word to below it (or vice versa).
    keepPlacementSide?: boolean;
}

interface PopoverWritingLayout {
    horizontalOffset: number;
    verticalOffset: number;
    preferAfter: boolean;
    lockAfter: boolean;
}

interface PopoverRectCandidate {
    rect: PopoverRect;
    index: number;
    canOverlap: boolean;
}

interface PopoverPositionFrame {
    scrollTop: number;
    sourceRects: PopoverRect[];
    viewport: PopoverRect;
    viewportWidth: number;
    viewportHeight: number;
    width: number;
    height: number;
    planningHeight: number;
    preferBefore: boolean;
    keepPlacementSide: boolean;
}

const DEFAULT_POPOVER_WRITING_MODE: NormalizedWritingMode = 'horizontal-tb';
const SUPPORTED_POPOVER_WRITING_MODES = new Set<NormalizedWritingMode>([
    'horizontal-tb',
    'vertical-rl',
    'vertical-lr',
    'sideways-rl',
    'sideways-lr',
]);

// Pauses the most likely active video and returns it ONLY when it was actually
// playing, so callers can resume exactly the video they interrupted (and never
// resume one the user had already paused themselves).
export function pauseActiveVideo(): HTMLVideoElement | undefined {
    const videos = Array.from(document.querySelectorAll('video'));
    const playable = videos
        .filter(video => video.readyState > 0)
        .sort((a, b) => {
            const aArea = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
            const bArea = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
            return Number(a.paused) - Number(b.paused) || bArea - aArea;
        });
    const target = playable[0];
    if (!target || target.paused) return undefined;
    target.pause();
    return target;
}

export function hasVisiblePageVideo(): boolean {
    return Array.from(document.querySelectorAll('video')).some(isVisiblePageVideo);
}

function isVisiblePageVideo(video: HTMLVideoElement): boolean {
    if (video.closest('[data-jpdb-reader-root]')) return false;
    if (!hasRenderableVideoRect(video)) return false;
    if (isVideoHidden(video)) return false;
    return isAudiblyPlayingVideo(video);
}

function hasRenderableVideoRect(video: HTMLVideoElement): boolean {
    const rect = video.getBoundingClientRect();
    return rect.width >= 120 && rect.height >= 90;
}

function isVideoHidden(video: HTMLVideoElement): boolean {
    const style = getComputedStyle(video);
    return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
}

// Auto-audio suppression exists to avoid term audio clashing with a video the
// user is listening to — so only a video that is actually producing sound
// counts. A merely present, paused, ended, or muted video (an embedded clip on
// an article, an autoplay-muted social embed) must not silence hover playback,
// which previously fired on the bare presence of a source.
function isAudiblyPlayingVideo(video: HTMLVideoElement): boolean {
    return !video.paused
        && !video.ended
        && !video.muted
        && video.volume > 0;
}

export function isEditableTarget(target: EventTarget | null): boolean {
    const element = target instanceof Element ? target : null;
    if (!element) return false;
    if (element.closest('input, textarea, select')) return true;
    const editable = element.closest('[contenteditable]');
    return Boolean(editable && editable.getAttribute('contenteditable')?.toLowerCase() !== 'false');
}

function isEditableElement(element: Element): boolean {
    if (element.matches?.('input, textarea, select')) return true;
    const editable = element.closest?.('[contenteditable]');
    return Boolean(editable && editable.getAttribute('contenteditable')?.toLowerCase() !== 'false');
}

// Keyboard-shortcut gate. The event's target is retargeted to the shadow HOST
// when typing in an input inside an (open) shadow root — YouTube's search box and
// many web-component sites — so isEditableTarget(target) misses it and the
// userscript's shortcuts swallow normal typing (e.g. Shift+H). The composed path
// includes the real focused input, so check that too.
export function isEditableEventContext(event: Event): boolean {
    if (isEditableTarget(event.target)) return true;
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    return path.some(node => node instanceof Element && isEditableElement(node));
}

export async function copyText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch {
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
}

export function openUrlInNewTab(url: string): boolean {
    if (!isOpenableExternalUrl(url)) return false;

    const userscriptOpen = userscriptOpenInTab();
    if (userscriptOpen) {
        try {
            userscriptOpen(url, { active: true, insert: true, setParent: false });
            return true;
        } catch {
        }
    }

    const opened = window.open(url, '_blank', 'noopener');
    if (opened) {
        try {
            opened.opener = null;
        } catch {
        }
        return true;
    }
    return false;
}

function userscriptOpenInTab(): typeof GM_openInTab | undefined {
    if (typeof GM_openInTab === 'function') return GM_openInTab;
    if (typeof GM !== 'undefined' && typeof GM?.openInTab === 'function') return GM.openInTab;
    return undefined;
}

function isOpenableExternalUrl(value: string): boolean {
    try {
        const url = new URL(value, location.href);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

export function normalizePressedKey(key: string): string {
    if (typeof key !== 'string' || !key) return '';
    if (key === ' ') return 'space';
    return key.toLowerCase();
}

export function positionPopover(popover: HTMLElement, anchor?: HTMLElement, fallbackRect?: DOMRect, options: PopoverPositionOptions = {}): void {
    const frame = preparePopoverPositionFrame(popover, anchor, fallbackRect, options);
    if (!frame.sourceRects.length) {
        positionPopoverWithoutAnchor(popover, frame);
        return;
    }

    positionAnchoredPopover(popover, anchor, frame);
}

// The popover is measured while it may still be a small loading skeleton, so
// deciding above-vs-below from that transient height makes the panel flip
// sides once the dictionary entry hydrates. Plan the side as if the popover
// were already at its configured max height (or this fallback, the default
// popoverHeight, when no max is configured) so the first decision already
// fits the loaded entry.
const POPOVER_PLANNING_HEIGHT = 540;

// A locked side is only honored while it can still show a usable slice of the
// popover; below this the lock yields (e.g. after a viewport resize) so the
// panel is never wedged into a sliver or pushed offscreen.
const MIN_LOCKED_SIDE_SPACE = 160;

function preparePopoverPositionFrame(
    popover: HTMLElement,
    anchor: HTMLElement | undefined,
    fallbackRect: DOMRect | undefined,
    options: PopoverPositionOptions,
): PopoverPositionFrame {
    const viewport = getPopoverViewport();
    const viewportHeight = viewport.bottom - viewport.top;
    const viewportWidth = viewport.right - viewport.left;
    popover.style.maxWidth = `${Math.max(0, viewportWidth)}px`;
    const maxFrameHeight = popoverMaxFrameHeight(viewportHeight, options);
    popover.style.maxHeight = `${maxFrameHeight}px`;
    const height = popover.offsetHeight;
    return {
        scrollTop: popover.scrollTop,
        sourceRects: getPopoverSourceRects(anchor, fallbackRect, options),
        viewport,
        viewportWidth,
        viewportHeight,
        width: popover.offsetWidth,
        height,
        planningHeight: Math.max(height, Math.min(maxFrameHeight, options.maxHeight ?? POPOVER_PLANNING_HEIGHT)),
        preferBefore: Boolean(options.preferBefore),
        keepPlacementSide: Boolean(options.keepPlacementSide),
    };
}

function popoverMaxFrameHeight(viewportHeight: number, options: PopoverPositionOptions): number {
    return Math.max(0, Math.min(viewportHeight, options.maxHeight ?? viewportHeight));
}

function positionPopoverWithoutAnchor(popover: HTMLElement, frame: PopoverPositionFrame): void {
    const margin = 8;
    const fallbackLeft = (frame.viewport.left + frame.viewport.right - frame.width) / 2;
    const fallbackTop = frame.viewport.top + frame.viewportHeight * 0.18;
    popover.style.left = `${Math.max(frame.viewport.left + margin, Math.min(fallbackLeft, frame.viewport.right - frame.width - margin))}px`;
    popover.style.top = `${Math.max(frame.viewport.top + margin, Math.min(fallbackTop, frame.viewport.bottom - frame.height - margin))}px`;
    restorePopoverScrollTop(popover, frame.scrollTop);
}

function positionAnchoredPopover(popover: HTMLElement, anchor: HTMLElement | undefined, frame: PopoverPositionFrame): void {
    const writingMode = getPopoverWritingMode(anchor);
    const forcedAfter = frame.keepPlacementSide
        ? forcedAfterForPlacementSide(writingMode, popover.dataset.jpdbReaderPlacementSide)
        : undefined;
    const position = getYomitanLikePopoverPosition(frame.sourceRects, writingMode, frame.viewport, frame.width, frame.height, frame.planningHeight, frame.preferBefore, forcedAfter);
    popover.style.maxWidth = `${Math.max(0, position.width)}px`;
    popover.style.maxHeight = `${Math.max(0, position.height)}px`;
    popover.dataset.jpdbReaderPlacementSide = getPlacementSide(writingMode, position);
    popover.style.left = `${position.left}px`;
    popover.style.top = `${position.top}px`;
    restorePopoverScrollTop(popover, frame.scrollTop);
}

function restorePopoverScrollTop(popover: HTMLElement, scrollTop: number): void {
    if (popover.scrollTop !== scrollTop) popover.scrollTop = scrollTop;
}

function getPopoverSourceRects(anchor: HTMLElement | undefined, fallbackRect: DOMRect | undefined, options: PopoverPositionOptions): PopoverRect[] {
    if (options.followPoint) return pointPopoverRects(options.followPoint);
    const anchorRects = anchorPopoverRects(anchor);
    if (anchorRects.length) return anchorRects;
    if (fallbackRect) return [domRectToPopoverRect(fallbackRect)];
    return selectionPopoverRects();
}

function pointPopoverRects(point: { x: number; y: number }): PopoverRect[] {
    const radius = 14;
    const overlayPoint = layoutPointToOverlay(point);
    return [{
        left: overlayPoint.x - radius,
        top: overlayPoint.y - radius,
        right: overlayPoint.x + radius,
        bottom: overlayPoint.y + radius,
    }];
}

function anchorPopoverRects(anchor: HTMLElement | undefined): PopoverRect[] {
    if (!anchor) return [];
    const clientRects = rectListToPopoverRects(anchor.getClientRects(), anchor);
    if (clientRects.length) return clientRects;
    const rect = domRectToPopoverRect(anchor.getBoundingClientRect(), anchor);
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
        ? rectListToPopoverRects(range.getClientRects(), range.commonAncestorContainer)
        : [];
}

function rangeBoundingPopoverRects(range: Range): PopoverRect[] {
    if (typeof range.getBoundingClientRect !== 'function') return [];
    const rect = domRectToPopoverRect(range.getBoundingClientRect(), range.commonAncestorContainer);
    return hasRectArea(rect) ? [rect] : [];
}

function rectListToPopoverRects(rects: DOMRectList, source?: Node | null): PopoverRect[] {
    return Array.from(rects, rect => domRectToPopoverRect(rect, source)).filter(hasRectArea);
}

function domRectToPopoverRect(rect: DOMRect | DOMRectReadOnly, source?: Node | null): PopoverRect {
    const overlayRect = sourceRectToOverlay(rect, source);
    return {
        left: overlayRect.left,
        top: overlayRect.top,
        right: overlayRect.right,
        bottom: overlayRect.bottom,
    };
}

function hasRectArea(rect: PopoverRect): boolean {
    return rect.right > rect.left || rect.bottom > rect.top;
}

function getPopoverViewport(): PopoverRect {
    const scaledViewport = overlayViewport();
    if (scaledViewport.pageScale > 1) {
        const bounds = overlayViewportBounds();
        return { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom };
    }
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
    planningHeight: number,
    preferBefore: boolean,
    forcedAfter?: boolean,
): PopoverSizeRect {
    const horizontal = isHorizontalPopoverMode(writingMode);
    const layout = popoverWritingLayout(writingMode, horizontal, preferBefore, forcedAfter);
    return bestYomitanPopoverPosition(sourceRects, horizontal, viewport, frameWidth, frameHeight, planningHeight, layout)
        ?? fallbackPopoverPosition(viewport, frameWidth, frameHeight);
}

function forcedAfterForPlacementSide(writingMode: NormalizedWritingMode, side: string | undefined): boolean | undefined {
    if (writingMode === 'horizontal-tb') {
        if (side === 'below') return true;
        if (side === 'above') return false;
        return undefined;
    }
    if (side === 'right') return true;
    if (side === 'left') return false;
    return undefined;
}

function bestYomitanPopoverPosition(
    sourceRects: PopoverRect[],
    horizontal: boolean,
    viewport: PopoverRect,
    frameWidth: number,
    frameHeight: number,
    planningHeight: number,
    layout: PopoverWritingLayout,
): PopoverSizeRect | null {
    let best: PopoverSizeRect | null = null;
    for (const candidate of popoverSourceRectCandidates(sourceRects)) {
        const result = getPositionForWritingMode(candidate.rect, horizontal, frameWidth, frameHeight, planningHeight, viewport, layout);
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

function popoverWritingLayout(writingMode: NormalizedWritingMode, horizontal: boolean, preferBefore: boolean, forcedAfter?: boolean): PopoverWritingLayout {
    const preferAfter = horizontal
        ? !preferBefore
        : verticalTextPrefersAfter(writingMode, preferBefore);
    return {
        horizontalOffset: horizontal ? 0 : 10,
        verticalOffset: horizontal ? 10 : 0,
        preferAfter: forcedAfter ?? preferAfter,
        lockAfter: forcedAfter !== undefined,
    };
}

function verticalTextPrefersAfter(writingMode: NormalizedWritingMode, preferBefore: boolean): boolean {
    const defaultAfter = isVerticalTextPopupOnRight(writingMode);
    return preferBefore ? !defaultAfter : defaultAfter;
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
    planningHeight: number,
    viewport: PopoverRect,
    layout: PopoverWritingLayout,
): PopoverSizeRect {
    return horizontal
        ? getPositionForHorizontalText(sourceRect, frameWidth, frameHeight, planningHeight, viewport, layout)
        : getPositionForVerticalText(sourceRect, frameWidth, frameHeight, viewport, layout);
}

function getPositionForHorizontalText(
    sourceRect: PopoverRect,
    frameWidth: number,
    frameHeight: number,
    planningHeight: number,
    viewport: PopoverRect,
    layout: PopoverWritingLayout,
): PopoverSizeRect {
    const [left, width, after] = getConstrainedPosition(
        sourceRect.right - layout.horizontalOffset,
        sourceRect.left + layout.horizontalOffset,
        frameWidth,
        viewport.left,
        viewport.right,
        true,
    );
    const [top, height, below] = getConstrainedPositionBinary(
        sourceRect.top - layout.verticalOffset,
        sourceRect.bottom + layout.verticalOffset,
        frameHeight,
        viewport.top,
        viewport.bottom,
        layout.preferAfter,
        planningHeight,
        layout.lockAfter,
    );
    return { left, top, width, height, after, below };
}

function getPositionForVerticalText(
    sourceRect: PopoverRect,
    frameWidth: number,
    frameHeight: number,
    viewport: PopoverRect,
    layout: PopoverWritingLayout,
): PopoverSizeRect {
    const [left, width, after] = getConstrainedPositionBinary(
        sourceRect.left - layout.horizontalOffset,
        sourceRect.right + layout.horizontalOffset,
        frameWidth,
        viewport.left,
        viewport.right,
        layout.preferAfter,
        frameWidth,
        layout.lockAfter,
    );
    const [top, height, below] = getConstrainedPosition(
        sourceRect.bottom - layout.verticalOffset,
        sourceRect.top + layout.verticalOffset,
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
    planningSize: number = size,
    lockSide = false,
): [position: number, size: number, after: boolean] {
    const spaceBefore = positionBefore - minLimit;
    const spaceAfter = maxLimit - positionAfter;

    // Pick the side with the planning size (what the popover is expected to
    // grow to), but clamp geometry with the real size so the frame still hugs
    // the anchor while smaller. lockSide pins the side a mounted popover
    // already uses so later content growth cannot flip it — but the lock
    // yields when its side no longer has usable space (viewport resize or
    // scroll), so the popover is never crushed to a sliver or pushed out.
    const lockedSpace = after ? spaceAfter : spaceBefore;
    const keepLockedSide = lockSide && lockedSpace >= Math.min(MIN_LOCKED_SIDE_SPACE, size);
    if (!keepLockedSide && (planningSize > spaceAfter || planningSize > spaceBefore)) {
        after = spaceAfter > spaceBefore;
    }

    let position: number;
    if (after) {
        size = Math.max(0, Math.min(size, spaceAfter));
        position = Math.max(minLimit, positionAfter);
    } else {
        size = Math.max(0, Math.min(size, spaceBefore));
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
