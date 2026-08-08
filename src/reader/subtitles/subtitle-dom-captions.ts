import { isTargetLanguageText } from '../lookup/target-text';
import { normalizeCaptionText } from './subtitle-cues';
import { isYouTubePage } from './subtitle-youtube';

const CAPTION_SELECTOR_LIST = [
    '.caption-visual-line',
    '.captions-text',
    '[data-purpose="captions-text"]',
    '[data-uia="player-subtitle-text"]',
    '[data-uia="player-captions-text"]',
    '.player-timedtext-text-container',
    '.player-timedtext-text-container span',
    '.ytp-caption-segment',
];

const CAPTION_SELECTORS = CAPTION_SELECTOR_LIST.join(',');
const CAPTION_CONTAINER_SELECTORS = '.caption-visual-line,.captions-text,[data-purpose="captions-text"],[data-uia="player-subtitle-text"],[data-uia="player-captions-text"],.player-timedtext-text-container,.caption-window,.ytp-caption-segment';
const PLAYER_CHROME_CONTAINER_SELECTOR = [
    '#player-control-overlay',
    '.ytp-chrome-bottom',
    '.ytp-chrome-controls',
    '.ytp-gradient-bottom',
    '.vjs-control-bar',
    '.video-js .vjs-control',
    '.plyr__controls',
    '.jw-controls',
    '.jw-controlbar',
    '.mejs__controls',
    '[class*="control-bar" i]',
    '[class*="controls" i]',
    '[data-jpdb-reader-surface-ignore]',
].join(',');
const PLAYER_CHROME_INTERACTIVE_SELECTOR = [
    'button',
    '[role="button"]',
    'input',
    'select',
    'textarea',
    '[aria-label*="play" i]',
    '[aria-label*="pause" i]',
    '[aria-label*="mute" i]',
    '[aria-label*="fullscreen" i]',
    '[aria-label*="full screen" i]',
    '[aria-label*="settings" i]',
    '[title*="play" i]',
    '[title*="pause" i]',
    '[title*="mute" i]',
    '[title*="fullscreen" i]',
    '[title*="full screen" i]',
    '[title*="settings" i]',
].join(',');
const PLAYER_CHROME_TEXT_PATTERNS = [
    /\bplay\b/iu,
    /\bpause\b/iu,
    /\bskip\b/iu,
    /\bmute\b/iu,
    /\bunmute\b/iu,
    /\bloop\b/iu,
    /\bsettings\b/iu,
    /\bairplay\b/iu,
    /\bexit fullscreen\b/iu,
    /\benter fullscreen\b/iu,
    /\bfull ?screen\b/iu,
    /\bpicture in picture\b/iu,
];
const READER_STATUS_TEXT_PATTERNS = [
    /\b(?:subtitle track|subtitle tracks).*\b(?:detected|not detected)\b/iu,
    /字幕トラック.*検出/iu,
];
const PAGE_METADATA_TEXT_SELECTOR = [
    'a',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'header',
    'nav',
    'aside',
    'footer',
    '[role="navigation"]',
    '[role="menu"]',
    '[role="menubar"]',
    '[aria-current]',
].join(',');
const PAGE_METADATA_TEXT_NAME_PATTERN = /(^|[-_\s])(?:title|metadata|meta|tag|tags|category|categories|breadcrumb|nav|navbar|menu|channel|author|username|user-name|description)([-_\s]|$)/iu;

export interface PageCaptionReadOptions {
    /** Metadata already chose the track, so script compatibility is unnecessary. */
    allowAnyCaptionScript?: boolean;
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
    // The generic span/div scan (nearVideoOnly) has no recognized caption class to
    // trust, so it gets the stricter overlay geometry check; elements found via a
    // known caption selector are already trusted and keep the looser proximity test.
    return isCaptionNearVideo(rect, videoRect, nearVideoOnly);
}

function isCaptionElementExcluded(element: HTMLElement, readerRoot?: HTMLElement): boolean {
    return !element.isConnected
        || Boolean(readerRoot && (element === readerRoot || readerRoot.contains(element) || element.contains(readerRoot)))
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
    if (isLikelyPlayerChromeText(text) || isLikelyReaderStatusText(text)) return false;
    if (containsReaderRootOrPlayerChrome(element)) return false;
    if (!allowsChildText && isLikelyPageMetadataText(element)) return false;
    if (text.split('\n').length > 4) return false;
    return allowsChildText || !hasCaptionChildText(element, options);
}

function containsReaderRootOrPlayerChrome(element: HTMLElement): boolean {
    const knownCaptionInPlayerChrome = element.matches('.ytp-caption-segment, .caption-window');
    return Boolean(element.querySelector('[data-jpdb-reader-root]'))
        || Boolean(element.matches(PLAYER_CHROME_CONTAINER_SELECTOR))
        || Boolean(element.querySelector(PLAYER_CHROME_INTERACTIVE_SELECTOR))
        || Boolean(element.closest(PLAYER_CHROME_CONTAINER_SELECTOR) && !knownCaptionInPlayerChrome);
}

function isLikelyPlayerChromeText(text: string): boolean {
    const hits = PLAYER_CHROME_TEXT_PATTERNS.filter(pattern => pattern.test(text)).length;
    return hits >= 3;
}

function isLikelyReaderStatusText(text: string): boolean {
    return READER_STATUS_TEXT_PATTERNS.some(pattern => pattern.test(text));
}

function isLikelyPageMetadataText(element: HTMLElement): boolean {
    if (element.closest(PAGE_METADATA_TEXT_SELECTOR)) return true;
    for (let current: HTMLElement | null = element; current && current !== document.body; current = current.parentElement) {
        if (PAGE_METADATA_TEXT_NAME_PATTERN.test(elementNameForMetadataCheck(current))) return true;
    }
    return false;
}

function elementNameForMetadataCheck(element: HTMLElement): string {
    return [
        element.id,
        String(element.className),
        element.getAttribute('role') ?? '',
        element.getAttribute('aria-label') ?? '',
    ].join(' ');
}

function isAllowedCaptionText(text: string, options: PageCaptionReadOptions): boolean {
    // This is only a script-compatible false-positive guard for unlabelled DOM
    // text. Same-script languages cannot be identified semantically from one
    // caption cue; track metadata and the explicit selection own that decision.
    return hasCaptionTextLength(text) && (options.allowAnyCaptionScript || isTargetLanguageText(text));
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

function isCaptionNearVideo(rect: DOMRect, videoRect: DOMRect, strict = false): boolean {
    const horizontalOverlap = Math.max(0, Math.min(rect.right, videoRect.right) - Math.max(rect.left, videoRect.left));
    const overlapRatio = horizontalOverlap / Math.max(1, Math.min(rect.width, videoRect.width));
    const overlapsVideo = captionOverlapsVideo(rect, videoRect, overlapRatio);
    const belowVideo = captionSitsBelowVideo(rect, videoRect, overlapRatio);
    const tooLarge = rect.width * rect.height > videoRect.width * videoRect.height * 0.45;
    if (tooLarge || !(overlapsVideo || belowVideo)) return false;
    // Generic page text only counts as a caption when it actually looks like a
    // subtitle overlay: centered on the player and starting inside the frame
    // (captions render bottom-up). Page chrome posted next to a clip — a chat or
    // forum author handle such as Discord's "Canna波蘭" — is left/right-anchored
    // and often above the video, so it fails both and no longer latches into the
    // overlay while scrolling past the clip.
    return !strict || (isCaptionOverlaidOnVideo(rect, videoRect) && isCaptionCenteredOnVideo(rect, videoRect));
}

function isCaptionOverlaidOnVideo(rect: DOMRect, videoRect: DOMRect): boolean {
    const bottomSlack = Math.min(24, Math.max(4, videoRect.height * 0.04));
    return rect.top >= videoRect.top
        && rect.bottom <= videoRect.bottom + bottomSlack;
}

function isCaptionCenteredOnVideo(rect: DOMRect, videoRect: DOMRect): boolean {
    const captionCenter = (rect.left + rect.right) / 2;
    const videoCenter = (videoRect.left + videoRect.right) / 2;
    return Math.abs(captionCenter - videoCenter) <= videoRect.width * 0.3;
}

function captionOverlapsVideo(rect: DOMRect, videoRect: DOMRect, overlapRatio: number): boolean {
    return rect.bottom >= videoRect.top && rect.top <= videoRect.bottom && overlapRatio > 0.25;
}

function captionSitsBelowVideo(rect: DOMRect, videoRect: DOMRect, overlapRatio: number): boolean {
    return rect.top >= videoRect.bottom && rect.top <= videoRect.bottom + 90 && overlapRatio > 0.25;
}
