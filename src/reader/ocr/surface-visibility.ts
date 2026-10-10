export function isVisibleOcrImage(image: HTMLImageElement): boolean {
    return !isHiddenByCss(image) && !isInsideHiddenAncestor(image);
}

export function isImageVisibleForOcr(image: HTMLImageElement, rect: DOMRect): boolean {
    return rectIntersectsViewport(rect) && isVisibleOcrImage(image)
        && !isImageOccludedByVideo(image, rect) && !isImageOccludedByPeerImage(image, rect);
}

// Image viewers keep thumbnail and full-resolution copies in the same place.
// Only the painted foreground copy should own a lookup layer and corner mark.
function isImageOccludedByPeerImage(image: HTMLImageElement, rect: DOMRect): boolean {
    if (image.getRootNode() !== document || typeof document.elementsFromPoint !== 'function') return false;
    const visible = visibleViewportIntersection(rect);
    if (!visible) return false;
    const front = document.elementsFromPoint(visible.left + visible.width / 2, visible.top + visible.height / 2)
        .find((element): element is HTMLImageElement => element instanceof HTMLImageElement && isVisibleOcrImage(element));
    return Boolean(front && front !== image
        && intersectionArea(rect, front.getBoundingClientRect()) >= rect.width * rect.height * 0.8);
}

export function isInsideHiddenAncestor(element: Element, includeAriaHidden = true): boolean {
    for (let current: Element | null = element.parentElement; current && current !== document.body; current = current.parentElement) {
        if (hiddenAncestor(current, includeAriaHidden)) return true;
    }
    return false;
}

function hiddenAncestor(element: Element, includeAriaHidden: boolean): boolean {
    return isHiddenByCss(element) || element.hasAttribute('hidden') || ariaHidden(element, includeAriaHidden);
}

function ariaHidden(element: Element, included: boolean): boolean {
    return included && element.getAttribute('aria-hidden') === 'true';
}

function rectIntersectsViewport(rect: DOMRect): boolean {
    return rect.width > 0 && rect.height > 0
        && rect.bottom > 0 && rect.top < window.innerHeight
        && rect.right > 0 && rect.left < window.innerWidth;
}

export function isHiddenByCss(element: Element): boolean {
    const style = getComputedStyle(element);
    return style.visibility === 'hidden'
        || style.display === 'none'
        || Number(style.opacity || '1') <= 0;
}

export function isNearViewport(element: Element, margin: number): boolean {
    const rect = element.getBoundingClientRect();
    return rect.bottom >= -margin
        && rect.top <= window.innerHeight + margin
        && rect.right >= -margin
        && rect.left <= window.innerWidth + margin;
}

/** The part of `rect` inside the viewport, or undefined when none of it is. */
export function visibleViewportIntersection(rect: DOMRect): DOMRect | undefined {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!viewportWidth || !viewportHeight) return undefined;
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(viewportWidth, rect.right);
    const bottom = Math.min(viewportHeight, rect.bottom);
    const width = right - left;
    const height = bottom - top;
    return width > 0 && height > 0 ? new DOMRect(left, top, width, height) : undefined;
}

export function isImageOccludedByVideo(image: HTMLImageElement, rect: DOMRect): boolean {
    // Paused-video snapshots intentionally sit on their video.
    if (image.dataset.yomuVideoFrame) return false;
    const imageArea = rect.width * rect.height;
    if (imageArea < 4) return false;
    const imageRoot = image.getRootNode();
    return [...document.querySelectorAll('video')].some(video => (
        isVisiblePeerVideo(video, image, imageRoot) && videoOccludesImage(video, rect, imageArea)
    ));
}

function isVisiblePeerVideo(video: HTMLVideoElement, image: HTMLImageElement, imageRoot: Node): boolean {
    return [
        video.isConnected,
        video.getRootNode() === imageRoot,
        !isSameMediaNode(video, image),
        visibleVideoRect(video) !== null,
        !isHiddenByCss(video),
    ].every(Boolean);
}

function visibleVideoRect(video: HTMLVideoElement): DOMRect | null {
    const rect = video.getBoundingClientRect();
    return rect.width >= 2 && rect.height >= 2 ? rect : null;
}

function videoOccludesImage(video: HTMLVideoElement, imageRect: DOMRect, imageArea: number): boolean {
    const videoRect = visibleVideoRect(video);
    return Boolean(videoRect && intersectionArea(imageRect, videoRect) / imageArea >= 0.6);
}

function isSameMediaNode(video: HTMLVideoElement, image: HTMLImageElement): boolean {
    return video === image.parentElement || image === video.parentElement;
}

function intersectionArea(a: DOMRect, b: DOMRect): number {
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);
    return Math.max(0, right - left) * Math.max(0, bottom - top);
}
