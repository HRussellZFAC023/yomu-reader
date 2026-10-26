import { reachableSubtitleBottomPercent } from './subtitle-layout';
import { setStylePropertyIfChanged } from './subtitle-surface';
import { subtitleVisibleViewportSize } from './subtitle-video-inset';
import { isYouTubePage } from './subtitle-youtube';

/** Keep the saved size as a scale relative to YouTube's native caption size. */
export function youtubeCaptionFontSize(target: number, nativeSize: number, playerWidth: number): number {
    const native = Number.isFinite(nativeSize) && nativeSize > 0
        ? nativeSize : Math.min(28, Math.max(16, Math.round(playerWidth * .034)));
    return Math.max(16, Math.min(64, native * target / 28));
}

const CAPTION_PARTS = '.jpdb-subtitle-primary-row,.jpdb-subtitle-lines > .jpdb-subtitle-secondary,[data-subtitle-drag-handle]';

/** Caption paint and its move handle are exclusion zones for the control rail. */
export function subtitleCaptionRects(root: HTMLElement | undefined): DOMRect[] {
    if (!root || root.hidden || root.classList.contains('jpdb-subtitle-hidden')) return [];
    return Array.from(root.querySelectorAll<HTMLElement>(CAPTION_PARTS))
        .filter(element => getComputedStyle(element).display !== 'none')
        .map(element => element.getBoundingClientRect())
        .filter(rect => rect.width > 0 && rect.height > 0);
}

/** Measure all wrapped lines and translation overflow around the fixed anchor. */
function subtitleCaptionExtents(root: HTMLElement): { above: number; below: number } {
    const text = root.querySelector<HTMLElement>('.jpdb-subtitle-text');
    if (!text) return { above: 0, below: 0 };
    const rect = text.getBoundingClientRect();
    const parts = subtitleCaptionRects(root);
    return {
        above: rect.bottom - Math.min(rect.top, ...parts.map(part => part.top)),
        below: Math.max(rect.bottom, ...parts.map(part => part.bottom)) - rect.bottom,
    };
}

export function subtitleCaptionBottomPercent(root: HTMLElement, preferred: number): number {
    const viewport = subtitleVisibleViewportSize();
    const visualViewport = window.visualViewport;
    const viewportTop = visualViewport
        && Math.round(visualViewport.width) === viewport.width
        && Math.round(visualViewport.height) === viewport.height
        ? visualViewport.offsetTop : 0;
    const extents = subtitleCaptionExtents(root);
    return reachableSubtitleBottomPercent({
        preferredBottomPercent: preferred,
        positionRect: root.getBoundingClientRect(),
        viewportTop,
        viewportHeight: viewport.height,
        subtitleHeight: extents.above,
        belowAnchor: extents.below,
    });
}

/** Native caption nodes disappear under Yomu ownership. Freeze their size for
 * each player geometry so cue changes cannot switch to a different fallback. */
export class SubtitleCaptionSizing {
    private video?: HTMLVideoElement;
    private width = 0;
    private height = 0;
    private reference = 28;

    apply(root: HTMLElement, video: HTMLVideoElement | undefined, savedSize: number, frame: DOMRect): void {
        const saved = Math.max(16, Math.min(64, savedSize));
        const target = video && isYouTubePage() ? this.size(video, saved, frame.width, frame.height) : saved;
        setStylePropertyIfChanged(root, '--subtitle-font-size-target', `${target}px`);
        setStylePropertyIfChanged(root, '--subtitle-font-size', `${target}px`);
        setStylePropertyIfChanged(root, '--subtitle-secondary-font-size', `${Math.max(16, Math.round(target * 0.8))}px`);
    }

    private size(video: HTMLVideoElement, target: number, width: number, height: number): number {
        if (video !== this.video || Math.abs(width - this.width) > 1 || Math.abs(height - this.height) > 1) {
            const player = video.closest('#movie_player,.html5-video-player,ytm-player');
            const native = player?.querySelector<HTMLElement>('.ytp-caption-segment')
                ?? player?.querySelector<HTMLElement>('.caption-visual-line')
                ?? player?.querySelector<HTMLElement>('.captions-text');
            this.reference = youtubeCaptionFontSize(28, native ? Number.parseFloat(getComputedStyle(native).fontSize) : NaN, width);
            this.video = video;
            this.width = width;
            this.height = height;
        }
        return youtubeCaptionFontSize(target, this.reference, width);
    }
}
