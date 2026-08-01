import type { TranscriptPanelLayout } from './subtitle-layout';

const PLAIN_SUBTITLE_SELECTION_SELECTOR =
    '.jpdb-subtitle-primary, .jpdb-subtitle-secondary, .jpdb-subtitle-row-text, .jpdb-subtitle-row-secondary';

export function setClassState(element: HTMLElement, className: string, enabled: boolean): void {
    if (element.classList.contains(className) !== enabled) element.classList.toggle(className, enabled);
}

export function shouldPreservePlainSubtitleSelection(eventTarget: HTMLElement, annotationsPaused: boolean): boolean {
    if (!annotationsPaused) return false;
    const surface = eventTarget.closest?.<HTMLElement>(PLAIN_SUBTITLE_SELECTION_SELECTOR);
    if (!surface) return false;
    const selection = window.getSelection?.();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !selection.toString()) return false;
    for (let index = 0; index < selection.rangeCount; index += 1) {
        try {
            if (selection.getRangeAt(index).intersectsNode(surface)) return true;
        } catch {
            // Subtitle hydration can detach a selected node between mouseup and click.
        }
    }
    return surface.contains(selection.anchorNode) || surface.contains(selection.focusNode);
}

export function shouldHonorExplicitYouTubeSideLayout(layout: TranscriptPanelLayout): boolean {
    return layout.margin > 0 && layout.viewportWidth >= 900;
}
