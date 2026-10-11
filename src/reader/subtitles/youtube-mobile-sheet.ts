import { composedAncestorElement } from '../dom/composed-tree';

/** Native mobile sheets own the foreground, including inline-fullscreen Shorts.
 * YouTube can portal them beside ytm-app or retain them beneath hidden wrappers. */
export function hasOpenYouTubeMobileBottomSheet(): boolean {
    return Array.from(document.querySelectorAll<HTMLElement>(
        'bottom-sheet-container[aria-modal="true"],ytm-bottom-sheet-renderer[aria-modal="true"],yt-sheet-view-model[aria-modal="true"]',
    )).some(sheet => {
        for (let element: HTMLElement | null = sheet; element; element = composedAncestorElement(element)) {
            if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
            const style = getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
        }
        return true;
    });
}
