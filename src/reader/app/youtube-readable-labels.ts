import { isYouTubeAppHostname } from './youtube-host';

/** Visible navigation/filter labels, verified against the desktop/tablet DOM.
 * Player actions, inputs, icons and hidden tooltip copies are not label roots. */
export const YOUTUBE_READABLE_LABEL_ROOTS = [
    '.ytChipShapeButtonReset[role="tab"]',
    'yt-chip-cloud-chip-renderer',
    'ytd-guide-entry-renderer',
    'ytd-guide-collapsible-section-entry-renderer',
    'ytd-mini-guide-entry-renderer',
    'ytd-masthead #buttons .ytSpecButtonShapeNextButtonTextContent',
];

const LABEL_SELECTOR = YOUTUBE_READABLE_LABEL_ROOTS.join(',');

export function isYouTubeReadableLabel(element: Element): boolean {
    return isYouTubeAppHostname() && Boolean(element.closest(LABEL_SELECTOR));
}
