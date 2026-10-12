import { isYouTubeAppHostname } from './youtube-host';

/** Visible label text; controls, inputs, icons and hidden tooltip copies stay native. */
export const YOUTUBE_READABLE_LABEL_ROOTS = [
    '.ytChipShapeButtonReset[role="tab"]',
    'yt-chip-cloud-chip-renderer',
    'ytd-guide-entry-renderer',
    'ytd-guide-collapsible-section-entry-renderer',
    'ytd-mini-guide-entry-renderer',
    'ytd-masthead #buttons .ytSpecButtonShapeNextButtonTextContent',
    'ytd-watch-metadata .ytSpecButtonShapeNextButtonTextContent',
    'ytd-watch-metadata .yt-spec-button-shape-next__button-text-content',
    '.ytp-settings-menu .ytp-menuitem-label',
    '.ytp-settings-menu .ytp-menuitem-content:not(:has(input))',
];

const LABEL_SELECTOR = YOUTUBE_READABLE_LABEL_ROOTS.join(',');

export function isYouTubeReadableLabel(element: Element): boolean {
    return isYouTubeAppHostname() && Boolean(element.closest(LABEL_SELECTOR));
}
