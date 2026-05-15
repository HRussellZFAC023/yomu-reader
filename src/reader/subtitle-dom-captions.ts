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

export function readPageCaptionText(video?: HTMLVideoElement, readerRoot?: HTMLElement): string {
    const direct = collectCaptionTexts(
        [...document.querySelectorAll<HTMLElement>(CAPTION_SELECTORS)],
        video,
        readerRoot,
        false,
    );
    if (direct || !video || !isYouTubePage()) {
        if (direct || !video) return direct;
    } else {
        return readHiddenYouTubeCaptionText(readerRoot);
    }
    return collectCaptionTexts(
        [...document.querySelectorAll<HTMLElement>('span, p, div')],
        video,
        readerRoot,
        true,
    );
}

function readHiddenYouTubeCaptionText(readerRoot?: HTMLElement): string {
    const lines: string[] = [];
    const seen = new Set<string>();
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('.ytp-caption-segment, .caption-window'))) {
        const text = hiddenYouTubeCaptionLine(element, readerRoot);
        if (!text || seen.has(text)) continue;
        seen.add(text);
        lines.push(text);
        if (lines.length >= 2) break;
    }
    return lines.join(' ').replace(/\s+/g, ' ').trim();
}

function hiddenYouTubeCaptionLine(element: HTMLElement, readerRoot?: HTMLElement): string {
    if (isCaptionElementExcluded(element, readerRoot)) return '';
    const text = normalizeCaptionText(element.innerText || element.textContent || '');
    return text && /[\u3040-\u30ff\u3400-\u9fff]/.test(text) ? text : '';
}

function collectCaptionTexts(elements: HTMLElement[], video?: HTMLVideoElement, readerRoot?: HTMLElement, nearVideoOnly = false): string {
    const lines: string[] = [];
    const seen = new Set<string>();
    for (const element of elements) {
        if (!isLikelyCaptionElement(element, video, readerRoot, nearVideoOnly)) continue;
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

function isLikelyCaptionElement(element: HTMLElement, video?: HTMLVideoElement, readerRoot?: HTMLElement, nearVideoOnly = false): boolean {
    if (isCaptionElementExcluded(element, readerRoot)) return false;
    const text = normalizeCaptionText(element.innerText || element.textContent || '');
    if (!isCaptionTextShape(element, text)) return false;

    const rect = element.getBoundingClientRect();
    if (!isVisibleCaptionRect(element, rect)) return false;
    return matchesCaptionVideoScope(rect, video, nearVideoOnly);
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

function isCaptionTextShape(element: HTMLElement, text: string): boolean {
    const allowsChildText = element.matches(CAPTION_CONTAINER_SELECTORS);
    return text.length >= 2
        && text.length <= 180
        && /[\u3040-\u30ff\u3400-\u9fff]/.test(text)
        && text.split('\n').length <= 4
        && (allowsChildText || ![...element.children].some(child => /[\u3040-\u30ff\u3400-\u9fff]/.test(child.textContent ?? '')));
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
    const overlapsVideo = rect.bottom >= videoRect.top && rect.top <= videoRect.bottom && overlapRatio > 0.25;
    const belowVideo = rect.top >= videoRect.bottom && rect.top <= videoRect.bottom + 90 && overlapRatio > 0.25;
    const tooLarge = rect.width * rect.height > videoRect.width * videoRect.height * 0.45;
    return !tooLarge && (overlapsVideo || belowVideo);
}
