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
    const syncHandle = (handle: HTMLElement): void => {
        handle.setAttribute('role', 'button');
        handle.setAttribute('tabindex', '0');
        handle.setAttribute('aria-label', 'Drag up to expand, drag down to collapse, or tap to expand');
        handle.setAttribute('aria-expanded', String(popover.classList.contains('jpdb-reader-sheet-expanded')));
    };
    const syncHandleState = (): void => {
        popover.querySelectorAll<HTMLElement>('.jpdb-reader-sheet-handle').forEach(syncHandle);
    };
    syncHandleState();
    if (typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver(syncHandleState);
        observer.observe(popover, { childList: true, subtree: true });
    }

    const getHandleFromEvent = (event: EventTarget | null): HTMLElement | null => {
        if (!(event instanceof Element)) return null;
        const handle = event.closest('.jpdb-reader-sheet-handle');
        if (!handle) return null;
        if (!popover.contains(handle)) return null;
        syncHandle(handle as HTMLElement);
        return handle as HTMLElement;
    };
    let startY = 0;
    let lastY = 0;
    let pointerId = 0;
    let dragging = false;
    let moved = false;
    let activeHandle: HTMLElement | null = null;

    const reset = () => {
        popover.style.transition = 'transform .16s ease';
        popover.style.transform = '';
        popover.style.removeProperty('--jpdb-reader-sheet-drag-up');
        window.setTimeout(() => { popover.style.transition = ''; }, 180);
    };
    const setExpanded = (expanded: boolean) => {
        popover.classList.toggle('jpdb-reader-sheet-expanded', expanded);
        syncHandleState();
    };
    const toggleExpanded = () => {
        setExpanded(!popover.classList.contains('jpdb-reader-sheet-expanded'));
    };
    const cleanupPointerListeners = () => {
        document.removeEventListener('pointermove', handlePointerMove, true);
        document.removeEventListener('pointerup', handlePointerUp, true);
        document.removeEventListener('pointercancel', handlePointerCancel, true);
    };
    const finish = () => {
        if (!dragging) return;
        const delta = lastY - startY;
        const wasExpanded = popover.classList.contains('jpdb-reader-sheet-expanded');
        const handle = activeHandle;
        dragging = false;
        activeHandle = null;
        cleanupPointerListeners();
        handle?.releasePointerCapture?.(pointerId);

        if (delta >= 110) {
            onDismiss();
            return;
        }
        if (delta <= -56) {
            setExpanded(true);
            reset();
            return;
        }
        if (wasExpanded && delta >= 56) {
            setExpanded(false);
            reset();
            return;
        }
        reset();
    };
    const cancelDrag = () => {
        if (!dragging) return;
        dragging = false;
        moved = false;
        cleanupPointerListeners();
        activeHandle?.releasePointerCapture?.(pointerId);
        activeHandle = null;
        reset();
    };
    const handlePointerMove = (event: PointerEvent) => {
        if (!dragging || event.pointerId !== pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        lastY = event.clientY;
        const delta = lastY - startY;
        if (Math.abs(delta) > 8) moved = true;
        if (delta < 0 && !popover.classList.contains('jpdb-reader-sheet-expanded')) {
            popover.style.transform = '';
            popover.style.setProperty('--jpdb-reader-sheet-drag-up', `${Math.abs(delta)}px`);
            return;
        }
        popover.style.removeProperty('--jpdb-reader-sheet-drag-up');
        popover.style.transform = `translateY(${Math.max(0, delta)}px)`;
    };
    const handlePointerUp = (event: PointerEvent) => {
        if (!dragging || event.pointerId !== pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        lastY = event.clientY;
        finish();
    };
    const handlePointerCancel = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) return;
        cancelDrag();
    };

    popover.addEventListener('click', event => {
        const handle = getHandleFromEvent(event.target);
        if (!handle) return;
        event.preventDefault();
        event.stopPropagation();
        if (moved) {
            moved = false;
            return;
        }
        toggleExpanded();
    });
    popover.addEventListener('pointerdown', event => {
        const handle = getHandleFromEvent(event.target);
        if (!handle) return;
        if (event.button !== undefined && event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        startY = event.clientY;
        lastY = event.clientY;
        pointerId = event.pointerId;
        dragging = true;
        moved = false;
        activeHandle = handle;
        popover.style.transition = '';
        handle.setPointerCapture?.(event.pointerId);
        document.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false });
        document.addEventListener('pointerup', handlePointerUp, true);
        document.addEventListener('pointercancel', handlePointerCancel, true);
    });
    popover.addEventListener('keydown', event => {
        const handle = getHandleFromEvent(event.target);
        if (!handle) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
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
