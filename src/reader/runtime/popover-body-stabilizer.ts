import {
    capturePopoverScrollFrame,
    popoverBodyActionElement,
    popoverMaxHeightSetting,
    restorePopoverScrollFrameSoon,
} from '../popup/shell';
import type { ReaderSettings } from '../app/types';
import { overlayViewportBounds, sourceRectToOverlay } from '../ui/page-scale';

function popoverScrollBody(popover: HTMLElement): HTMLElement {
    return popover.querySelector<HTMLElement>('.jpdb-reader-popover-body') ?? popover;
}

function stabilizePopoverBodyAround(popover: HTMLElement, anchor: HTMLElement): void {
    const scrollBody = popoverScrollBody(popover);
    const scrollTop = scrollBody.scrollTop;
    const anchorTop = sourceRectToOverlay(anchor.getBoundingClientRect(), anchor).top;
    requestAnimationFrame(() => {
        if (!popover.isConnected || !anchor.isConnected) return;
        const delta = sourceRectToOverlay(anchor.getBoundingClientRect(), anchor).top - anchorTop;
        if (Math.abs(delta) > 0.5) scrollBody.scrollTop = scrollTop + delta;
    });
}

export function installPopoverBodyStabilizers(popover: HTMLElement): void {
    if (popover.dataset.jpdbReaderBodyStabilizers === 'true') return;
    popover.dataset.jpdbReaderBodyStabilizers = 'true';
    popover.addEventListener('touchmove', event => {
        const target = event.target instanceof Node ? event.target : null;
        const scrollBody = popoverScrollBody(popover);
        if (target && scrollBody.contains(target)) event.stopPropagation();
    }, { capture: true, passive: true });
    popover.addEventListener('wheel', event => {
        const target = event.target instanceof Node ? event.target : null;
        const scrollBody = popoverScrollBody(popover);
        if (target && scrollBody.contains(target)) event.stopPropagation();
    }, { capture: true, passive: true });
    popover.addEventListener('click', event => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!target) return;
        const scrollBody = popoverScrollBody(popover);
        if (!scrollBody.contains(target)) return;
        const summary = target.closest<HTMLElement>('summary');
        if (summary && scrollBody.contains(summary)) {
            stabilizePopoverBodyAround(popover, summary);
            return;
        }
        if (!popoverBodyActionElement(target, scrollBody)) return;
        restorePopoverScrollFrameSoon(capturePopoverScrollFrame(scrollBody));
    }, true);
}

export function popoverMaxHeightAtTop(
    settings: ReaderSettings,
    top: number,
    viewportBottom = overlayViewportBounds().bottom,
): number {
    const margin = 8;
    const availableHeight = Math.max(0, viewportBottom - top - margin);
    const configuredMaxHeight = configuredPopoverMaxHeight(settings);
    return configuredMaxHeight ? Math.min(availableHeight, configuredMaxHeight) : availableHeight;
}

export function configuredPopoverMaxHeight(settings: ReaderSettings): number | undefined {
    return popoverMaxHeightSetting(settings);
}

export function shouldUseFixedPopoverHeight(
    popover: HTMLElement | undefined,
    settings: ReaderSettings,
    enabled = true,
): boolean {
    return Boolean(
        enabled
            && popover
            && settings.popoverHeightMode === 'fixed'
            && !popover.classList.contains('jpdb-reader-sheet')
            && popover.querySelector('.jpdb-reader-popover-body'),
    );
}

export function syncFixedPopoverHeight(popover: HTMLElement | undefined, shouldUseFixedHeight: boolean): void {
    if (!popover) return;
    if (!shouldUseFixedHeight) {
        popover.style.height = '';
        return;
    }
    const maxHeight = Number.parseFloat(popover.style.maxHeight);
    if (Number.isFinite(maxHeight) && maxHeight > 0) popover.style.height = `${maxHeight}px`;
}
