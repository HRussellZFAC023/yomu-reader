const CARDS = 'ytd-reel-item-renderer,ytm-shorts-lockup-view-model,yt-shorts-lockup-view-model,ytm-video-with-context-renderer,ytd-rich-item-renderer,ytd-video-renderer,ytd-compact-video-renderer';
const MEDIA = '.short-thumb,.media-item-thumbnail-container,ytd-thumbnail,#thumbnail';

export interface MediaReadingBoundary { media: Element; bounds: DOMRect; allowance: number }

/** A label below its own thumbnail may put a few pixels of reading over the
 * media edge. This never makes a popup or a control part of the label. */
export function ownMediaReadingBoundary(anchor: HTMLElement, source: DOMRect): MediaReadingBoundary | undefined {
    const card = anchor.closest(CARDS);
    if (!card) return undefined;
    for (const media of card.querySelectorAll(MEDIA)) {
        const bounds = media.getBoundingClientRect();
        if (bounds.width <= 0 || bounds.height <= 0 || source.top < bounds.bottom) continue;
        return { media, bounds, allowance: Math.min(3, source.height / 8) };
    }
    return undefined;
}

export function pointTouchesOwnMediaBoundary(boundary: MediaReadingBoundary | undefined, hit: Element, x: number, y: number): boolean {
    if (!boundary) return false;
    if (!(hit === boundary.media || hit.matches('img,video,canvas,picture'))) return false;
    if (!boundary.media.contains(hit)) return false;
    const control = hit.closest('button,[role=button],[role=dialog]');
    if (control && control !== boundary.media && boundary.media.contains(control)) return false;
    const { bounds, allowance } = boundary;
    return y >= bounds.bottom - allowance && y <= bounds.bottom && x >= bounds.left && x <= bounds.right;
}
