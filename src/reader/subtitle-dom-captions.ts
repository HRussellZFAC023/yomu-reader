import { normalizeCaptionText } from './subtitle-cues';
import { isYouTubePage } from './subtitle-youtube';

const CAPTION_SELECTOR_LIST = [
    '.caption-visual-line',
    '.captions-text',
    '[data-purpose="captions-text"]',
    '.ytp-caption-segment',
];

const CAPTION_SELECTORS = CAPTION_SELECTOR_LIST.join(',');
const CAPTION_CONTAINER_SELECTORS = '.caption-visual-line,.captions-text,[data-purpose="captions-text"],.caption-window,.ytp-caption-segment';

export interface PageCaptionReadOptions {
    allowNonJapanese?: boolean;
}

export function readPageCaptionText(video?: HTMLVideoElement, readerRoot?: HTMLElement, options: PageCaptionReadOptions = {}): string {
    const direct = readDirectPageCaptionText(video, readerRoot, options);
    if (direct || !video) return direct;
    return isYouTubePage()
        ? readHiddenYouTubeCaptionText(video, readerRoot, options)
        : readNearbyPageCaptionText(video, readerRoot, options);
}

function readDirectPageCaptionText(video?: HTMLVideoElement, readerRoot?: HTMLElement, options: PageCaptionReadOptions = {}): string {
    return collectCaptionTexts([...document.querySelectorAll<HTMLElement>(CAPTION_SELECTORS)], video, readerRoot, false, options);
}

function readNearbyPageCaptionText(video: HTMLVideoElement, readerRoot?: HTMLElement, options: PageCaptionReadOptions = {}): string {
    return collectCaptionTexts(
        [...document.querySelectorAll<HTMLElement>('span, p, div')],
        video,
        readerRoot,
        true,
        options,
    );
}

function readHiddenYouTubeCaptionText(video: HTMLVideoElement, readerRoot?: HTMLElement, options: PageCaptionReadOptions = {}): string {
    const root = youtubeCaptionSearchRoot(video);
    const lines: string[] = [];
    const seen = new Set<string>();
    for (const element of Array.from(root.querySelectorAll<HTMLElement>('.ytp-caption-segment, .caption-window'))) {
        const text = hiddenYouTubeCaptionLine(element, readerRoot, options);
        if (!text || seen.has(text)) continue;
        seen.add(text);
        lines.push(text);
        if (lines.length >= 2) break;
    }
    return lines.join(' ').replace(/\s+/g, ' ').trim();
}

function youtubeCaptionSearchRoot(video: HTMLVideoElement): ParentNode {
    return video.closest('#movie_player, .html5-video-player, ytd-player, ytd-watch-flexy, ytd-reel-video-renderer, ytd-shorts') ?? video.parentElement ?? document;
}

function hiddenYouTubeCaptionLine(element: HTMLElement, readerRoot?: HTMLElement, options: PageCaptionReadOptions = {}): string {
    if (isCaptionElementExcluded(element, readerRoot)) return '';
    const text = normalizeCaptionText(element.innerText || element.textContent || '');
    return isAllowedCaptionText(text, options) ? text : '';
}

function collectCaptionTexts(
    elements: HTMLElement[],
    video?: HTMLVideoElement,
    readerRoot?: HTMLElement,
    nearVideoOnly = false,
    options: PageCaptionReadOptions = {},
): string {
    const lines: string[] = [];
    const seen = new Set<string>();
    for (const element of elements) {
        if (!isLikelyCaptionElement(element, video, readerRoot, nearVideoOnly, options)) continue;
        const text = unseenCaptionText(element, seen);
        if (!text) continue;
        seen.add(text);
        lines.push(text);
        if (lines.length >= 2) break;
    }
    return lines.join(' ').replace(/\s+/g, ' ').trim();
}

function unseenCaptionText(element: HTMLElement, seen: Set<string>): string {
    const text = normalizeCaptionText(element.innerText || element.textContent || '');
    return text && !seen.has(text) ? text : '';
}

function isLikelyCaptionElement(
    element: HTMLElement,
    video?: HTMLVideoElement,
    readerRoot?: HTMLElement,
    nearVideoOnly = false,
    options: PageCaptionReadOptions = {},
): boolean {
    if (!isCaptionCandidateElement(element, readerRoot, options)) return false;
    const rect = element.getBoundingClientRect();
    return isVisibleCaptionRect(element, rect) && matchesCaptionVideoScope(rect, video, nearVideoOnly);
}

function isCaptionCandidateElement(element: HTMLElement, readerRoot?: HTMLElement, options: PageCaptionReadOptions = {}): boolean {
    if (isCaptionElementExcluded(element, readerRoot)) return false;
    return isCaptionTextShape(element, normalizeCaptionText(element.innerText || element.textContent || ''), options);
}

function matchesCaptionVideoScope(rect: DOMRect, video?: HTMLVideoElement, nearVideoOnly = false): boolean {
    if (!video) return !nearVideoOnly;
    const videoRect = video.getBoundingClientRect();
    if (videoRect.width < 120 || videoRect.height < 80) return !nearVideoOnly;
    return isCaptionNearVideo(rect, videoRect);
}

function isCaptionElementExcluded(element: HTMLElement, readerRoot?: HTMLElement): boolean {
    return !element.isConnected
        || Boolean(readerRoot && (element === readerRoot || readerRoot.contains(element)))
        || Boolean(element.closest([
            '[data-jpdb-reader-root]',
            '.asbplayer-offscreen',
            '.asbplayer-subtitles-container-bottom',
            '.asbplayer-subtitle',
            '.asbplayer-drag-zone',
            '.asbplayer-overlay-container',
            'script',
            'style',
            'noscript',
            'textarea',
            'input',
            'select',
            'button',
        ].join(',')));
}

function isCaptionTextShape(element: HTMLElement, text: string, options: PageCaptionReadOptions): boolean {
    const allowsChildText = element.matches(CAPTION_CONTAINER_SELECTORS);
    if (!isAllowedCaptionText(text, options)) return false;
    if (text.split('\n').length > 4) return false;
    return allowsChildText || !hasCaptionChildText(element, options);
}

function isAllowedCaptionText(text: string, options: PageCaptionReadOptions): boolean {
    return hasCaptionTextLength(text) && (options.allowNonJapanese || isJapaneseCaptionText(text));
}

function isJapaneseCaptionText(text: string): boolean {
    return Boolean(text && /[\u3040-\u30ff\u3400-\u9fff]/.test(text));
}

function hasCaptionTextLength(text: string): boolean {
    return text.length >= 2 && text.length <= 180;
}

function hasCaptionChildText(element: HTMLElement, options: PageCaptionReadOptions): boolean {
    return [...element.children].some(child => isAllowedCaptionText(normalizeCaptionText(child.textContent ?? ''), options));
}

function isVisibleCaptionRect(element: HTMLElement, rect: DOMRect): boolean {
    if (!hasVisibleCaptionRectBounds(rect)) return false;
    const style = getComputedStyle(element);
    return hasVisibleCaptionStyle(style);
}

function hasVisibleCaptionRectBounds(rect: DOMRect): boolean {
    return rect.width >= 24
        && rect.height >= 10
        && rect.bottom >= 0
        && rect.top <= window.innerHeight;
}

function hasVisibleCaptionStyle(style: CSSStyleDeclaration): boolean {
    return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || '1') > 0;
}

function isCaptionNearVideo(rect: DOMRect, videoRect: DOMRect): boolean {
    const horizontalOverlap = Math.max(0, Math.min(rect.right, videoRect.right) - Math.max(rect.left, videoRect.left));
    const overlapRatio = horizontalOverlap / Math.max(1, Math.min(rect.width, videoRect.width));
    const overlapsVideo = captionOverlapsVideo(rect, videoRect, overlapRatio);
    const belowVideo = captionSitsBelowVideo(rect, videoRect, overlapRatio);
    const tooLarge = rect.width * rect.height > videoRect.width * videoRect.height * 0.45;
    return !tooLarge && (overlapsVideo || belowVideo);
}

function captionOverlapsVideo(rect: DOMRect, videoRect: DOMRect, overlapRatio: number): boolean {
    return rect.bottom >= videoRect.top && rect.top <= videoRect.bottom && overlapRatio > 0.25;
}

function captionSitsBelowVideo(rect: DOMRect, videoRect: DOMRect, overlapRatio: number): boolean {
    return rect.top >= videoRect.bottom && rect.top <= videoRect.bottom + 90 && overlapRatio > 0.25;
}
