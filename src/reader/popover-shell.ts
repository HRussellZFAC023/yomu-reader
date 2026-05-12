import type { ReaderSettings } from './types';

export function createReaderPopover(appName: string, settings: ReaderSettings): HTMLElement {
    const popover = document.createElement('div');
    popover.className = 'jpdb-reader-popover';
    popover.dataset.jpdbReaderRoot = 'true';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', `${appName} lookup`);
    popover.setAttribute('aria-modal', 'true');
    popover.tabIndex = -1;
    if (shouldUseSheet(settings)) popover.classList.add('jpdb-reader-sheet');
    else popover.style.width = `${settings.popoverWidth}px`;
    return popover;
}

export function createReaderBackdrop(onDismiss: () => void): HTMLElement {
    const backdrop = document.createElement('div');
    backdrop.className = 'jpdb-reader-backdrop';
    backdrop.dataset.jpdbReaderRoot = 'true';
    backdrop.addEventListener('click', onDismiss);
    return backdrop;
}

export function popoverMaxHeightSetting(settings: ReaderSettings): number | undefined {
    return settings.popoverHeightMode === 'fixed' ? settings.popoverHeight : undefined;
}

export function placePopoverAtViewportPosition(popover: HTMLElement, rect: DOMRect, configuredMaxHeight?: number): void {
    const margin = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = popover.offsetWidth;
    const minHeight = Math.min(180, Math.max(0, viewportHeight - margin * 2));
    const maxTop = Math.max(margin, viewportHeight - minHeight - margin);
    const top = Math.max(margin, Math.min(rect.top, maxTop));
    const maxLeft = Math.max(margin, viewportWidth - width - margin);
    const left = Math.max(margin, Math.min(rect.left, maxLeft));
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    const availableHeight = Math.max(minHeight, viewportHeight - top - margin);
    popover.style.maxHeight = `${configuredMaxHeight ? Math.min(availableHeight, configuredMaxHeight) : availableHeight}px`;
}

export function installSheetHandle(popover: HTMLElement, onDismiss: () => void): void {
    const handle = popover.querySelector<HTMLElement>('.jpdb-reader-sheet-handle');
    if (!handle) return;
    handle.setAttribute('role', 'button');
    handle.setAttribute('tabindex', '0');
    handle.setAttribute('aria-label', 'Drag to close, or tap to expand');
    handle.setAttribute('aria-expanded', String(popover.classList.contains('jpdb-reader-sheet-expanded')));
    let startY = 0;
    let lastY = 0;
    let pointerId = 0;
    let dragging = false;
    let moved = false;

    const reset = () => {
        popover.style.transition = 'transform .16s ease';
        popover.style.transform = '';
        window.setTimeout(() => { popover.style.transition = ''; }, 180);
    };
    const toggleExpanded = () => {
        const expanded = !popover.classList.contains('jpdb-reader-sheet-expanded');
        popover.classList.toggle('jpdb-reader-sheet-expanded', expanded);
        handle.setAttribute('aria-expanded', String(expanded));
    };
    const finish = () => {
        handle.releasePointerCapture?.(pointerId);
        if (!dragging) return;
        const delta = Math.max(0, lastY - startY);
        dragging = false;
        if (delta > 90) onDismiss();
        else reset();
    };

    handle.addEventListener('click', event => {
        event.preventDefault();
        if (moved) {
            moved = false;
            return;
        }
        toggleExpanded();
    });
    handle.addEventListener('pointerdown', event => {
        startY = event.clientY;
        lastY = event.clientY;
        pointerId = event.pointerId;
        dragging = true;
        moved = false;
        popover.style.transition = '';
        handle.setPointerCapture?.(event.pointerId);
    });
    handle.addEventListener('pointermove', event => {
        if (!dragging) return;
        lastY = event.clientY;
        const delta = Math.max(0, lastY - startY);
        if (delta > 8) moved = true;
        popover.style.transform = `translateY(${delta}px)`;
    });
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', () => {
        dragging = false;
        moved = false;
        handle.releasePointerCapture?.(pointerId);
        reset();
    });
    handle.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleExpanded();
        }
        if (event.key === 'Escape') onDismiss();
    });
}

function shouldUseSheet(settings: ReaderSettings): boolean {
    if (settings.popupMode === 'sheet') return true;
    if (settings.popupMode === 'popover') return false;
    return window.innerWidth <= 768 || matchMedia('(pointer: coarse)').matches;
}
