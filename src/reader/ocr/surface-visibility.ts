export function isVisibleOcrImage(image: HTMLImageElement): boolean {
    return !isHiddenByCss(image) && !isInsideHiddenAncestor(image);
}

export function isImageVisibleForOcr(image: HTMLImageElement, rect: DOMRect): boolean {
    return rectIntersectsViewport(rect) && !isImageOccludedByVideo(image, rect);
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
    return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight;
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
