import type { ReaderSettings } from './types';
import { gmStorageGetSync, gmStorageSetSync } from './storage';

export const SHEET_HEIGHT_STORAGE_KEY = 'jpdb-reader-sheet-height-ratio';

const DEFAULT_SHEET_HEIGHT_RATIO = 0.7;
const MIN_SHEET_HEIGHT_PX = 180;
const SHEET_DISMISS_OVERSHOOT_PX = 72;
const SHEET_FULL_HEIGHT_THRESHOLD_PX = 12;
const SHEET_TAP_MOVEMENT_PX = 8;
const SHEET_KEYBOARD_STEP_PX = 48;

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
    if (popover.dataset.jpdbReaderSheetHandleInstalled === 'true') return;
    popover.dataset.jpdbReaderSheetHandleInstalled = 'true';

    let viewportHeight = 0;
    let sheetHeight = 0;
    let startHeight = 0;
    let rawDragHeight = 0;
    const isFullHeight = (): boolean => viewportHeight > 0 && sheetHeight >= viewportHeight - SHEET_FULL_HEIGHT_THRESHOLD_PX;
    const syncHandle = (handle: HTMLElement): void => {
        handle.setAttribute('role', 'button');
        handle.setAttribute('tabindex', '0');
        handle.setAttribute('aria-label', 'Drag to resize lookup sheet, or tap to close');
        handle.setAttribute('aria-expanded', String(isFullHeight()));
        handle.setAttribute('aria-valuemin', String(sheetMinHeight(viewportHeight)));
        handle.setAttribute('aria-valuemax', String(viewportHeight));
        handle.setAttribute('aria-valuenow', String(Math.round(sheetHeight)));
    };
    const syncHandleState = (): void => {
        popover.querySelectorAll<HTMLElement>('.jpdb-reader-sheet-handle').forEach(syncHandle);
    };

    const applySheetHeight = (height: number, persist = false): void => {
        const nextHeight = clampSheetHeight(height, viewportHeight);
        sheetHeight = nextHeight;
        popover.style.setProperty('--jpdb-reader-sheet-height', `${Math.round(nextHeight)}px`);
        popover.classList.toggle('jpdb-reader-sheet-expanded', isFullHeight());
        syncHandleState();
        if (persist) storeSheetHeightRatio(nextHeight, viewportHeight);
    };
    const applyViewportSize = (): void => {
        const previousViewportHeight = viewportHeight;
        viewportHeight = Math.max(0, Math.round(window.visualViewport?.height ?? window.innerHeight));
        popover.style.setProperty('--jpdb-reader-sheet-viewport-height', `${viewportHeight}px`);
        popover.style.setProperty('--jpdb-reader-sheet-collapsed-height', `${Math.round(viewportHeight * DEFAULT_SHEET_HEIGHT_RATIO)}px`);
        popover.style.setProperty('--jpdb-reader-sheet-min-height', `${sheetMinHeight(viewportHeight)}px`);
        const ratio = previousViewportHeight > 0 && sheetHeight > 0
            ? sheetHeight / previousViewportHeight
            : readSheetHeightRatio();
        applySheetHeight(viewportHeight * ratio);
    };
    const clearSheetPositionStyles = (): void => {
        popover.style.removeProperty('left');
        popover.style.removeProperty('right');
        popover.style.removeProperty('top');
        popover.style.removeProperty('bottom');
        popover.style.removeProperty('width');
        popover.style.removeProperty('height');
        popover.style.removeProperty('max-width');
        popover.style.removeProperty('max-height');
    };
    const clearDragStyles = (): void => {
        popover.style.transform = '';
        popover.style.removeProperty('--jpdb-reader-sheet-drag-up');
        popover.classList.remove('jpdb-reader-sheet-resizing');
    };
    const resetSheetLayout = (): void => {
        clearSheetPositionStyles();
        applyViewportSize();
        clearDragStyles();
    };
    resetSheetLayout();
    syncHandleState();
    let handleObserver: MutationObserver | undefined;
    if (typeof MutationObserver !== 'undefined') {
        handleObserver = new MutationObserver(syncHandleState);
        handleObserver.observe(popover, { childList: true, subtree: true });
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
    let activeInput: 'pointer' | 'touch' | null = null;
    let touchId = 0;
    let suppressNextHandleClick = false;
    let activeHandle: HTMLElement | null = null;

    const reset = () => {
        popover.style.transition = 'height .16s ease, max-height .16s ease, border-radius .16s ease, transform .16s ease';
        clearDragStyles();
        window.setTimeout(() => { popover.style.transition = ''; }, 180);
    };
    const cleanupPointerListeners = () => {
        document.removeEventListener('pointermove', handlePointerMove, true);
        document.removeEventListener('pointerup', handlePointerUp, true);
        document.removeEventListener('pointercancel', handlePointerCancel, true);
    };
    const cleanupTouchListeners = () => {
        document.removeEventListener('touchmove', handleTouchMove, true);
        document.removeEventListener('touchend', handleTouchEnd, true);
        document.removeEventListener('touchcancel', handleTouchCancel, true);
    };
    const releasePointerCapture = (handle: HTMLElement | null, id: number): void => {
        try {
            handle?.releasePointerCapture?.(id);
        } catch {
            // Some iOS WebKit contexts expose pointer events without reliable capture.
        }
    };
    const setPointerCapture = (handle: HTMLElement, id: number): void => {
        try {
            handle.setPointerCapture?.(id);
        } catch {
            // Document-level listeners keep the drag alive when capture is unavailable.
        }
    };
    const finish = (closeOnTap = false) => {
        if (!dragging) return;
        const wasMoved = moved;
        const handle = activeHandle;
        const finishHeight = rawDragHeight;
        dragging = false;
        moved = false;
        activeInput = null;
        activeHandle = null;
        popover.classList.remove('jpdb-reader-sheet-resizing');
        cleanupPointerListeners();
        cleanupTouchListeners();
        releasePointerCapture(handle, pointerId);

        if (!wasMoved && closeOnTap) {
            suppressNextHandleClick = true;
            onDismiss();
            return;
        }
        if (wasMoved) suppressNextHandleClick = true;
        if (wasMoved && finishHeight < sheetMinHeight(viewportHeight) - SHEET_DISMISS_OVERSHOOT_PX) {
            onDismiss();
            return;
        }
        if (wasMoved) applySheetHeight(finishHeight, true);
        reset();
    };
    const cancelDrag = () => {
        if (!dragging) return;
        dragging = false;
        moved = false;
        activeInput = null;
        cleanupPointerListeners();
        cleanupTouchListeners();
        releasePointerCapture(activeHandle, pointerId);
        activeHandle = null;
        reset();
    };
    const updateDrag = (clientY: number): void => {
        lastY = clientY;
        const delta = startY - lastY;
        rawDragHeight = startHeight + delta;
        if (Math.abs(lastY - startY) > SHEET_TAP_MOVEMENT_PX) moved = true;
        applySheetHeight(rawDragHeight);
    };
    const beginDrag = (handle: HTMLElement, clientY: number, input: 'pointer' | 'touch'): boolean => {
        if (dragging || activeInput) return false;
        startY = clientY;
        lastY = clientY;
        startHeight = sheetHeight || restoredSheetHeight(viewportHeight);
        rawDragHeight = startHeight;
        dragging = true;
        moved = false;
        activeInput = input;
        activeHandle = handle;
        popover.style.transition = '';
        popover.classList.add('jpdb-reader-sheet-resizing');
        return true;
    };
    const handlePointerMove = (event: PointerEvent) => {
        if (!dragging || activeInput !== 'pointer' || event.pointerId !== pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        updateDrag(event.clientY);
    };
    const handlePointerUp = (event: PointerEvent) => {
        if (!dragging || activeInput !== 'pointer' || event.pointerId !== pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        lastY = event.clientY;
        finish(true);
    };
    const handlePointerCancel = (event: PointerEvent) => {
        if (activeInput !== 'pointer' || event.pointerId !== pointerId) return;
        cancelDrag();
    };
    const changedTouch = (event: TouchEvent): Touch | null => {
        for (const touch of Array.from(event.changedTouches)) {
            if (touch.identifier === touchId) return touch;
        }
        return null;
    };
    const firstChangedTouch = (event: TouchEvent): Touch | null => event.changedTouches.item(0);
    const handleTouchMove = (event: TouchEvent) => {
        if (!dragging || activeInput !== 'touch') return;
        const touch = changedTouch(event);
        if (!touch) return;
        event.preventDefault();
        event.stopPropagation();
        updateDrag(touch.clientY);
    };
    const handleTouchEnd = (event: TouchEvent) => {
        if (!dragging || activeInput !== 'touch') return;
        const touch = changedTouch(event);
        if (!touch) return;
        event.preventDefault();
        event.stopPropagation();
        lastY = touch.clientY;
        finish(true);
    };
    const handleTouchCancel = (event: TouchEvent) => {
        if (activeInput !== 'touch' || !changedTouch(event)) return;
        cancelDrag();
    };
    const handleViewportChange = () => {
        if (dragging) cancelDrag();
        popover.style.transition = '';
        resetSheetLayout();
        syncHandleState();
    };
    const viewportController = new AbortController();
    let disposed = false;
    let disposeObserver: MutationObserver | undefined;
    const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        cleanupPointerListeners();
        cleanupTouchListeners();
        viewportController.abort();
        handleObserver?.disconnect();
        disposeObserver?.disconnect();
    };
    disposeObserver = new MutationObserver(() => {
        if (!popover.isConnected) dispose();
    });
    if (document.documentElement) {
        disposeObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    popover.addEventListener('click', event => {
        const handle = getHandleFromEvent(event.target);
        if (!handle) return;
        event.preventDefault();
        event.stopPropagation();
        if (suppressNextHandleClick) {
            suppressNextHandleClick = false;
            return;
        }
        onDismiss();
    });
    popover.addEventListener('pointerdown', event => {
        const handle = getHandleFromEvent(event.target);
        if (!handle) return;
        if (activeInput) return;
        if (event.button !== undefined && event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        if (!beginDrag(handle, event.clientY, 'pointer')) return;
        pointerId = event.pointerId;
        setPointerCapture(handle, event.pointerId);
        document.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false });
        document.addEventListener('pointerup', handlePointerUp, true);
        document.addEventListener('pointercancel', handlePointerCancel, true);
    });
    popover.addEventListener('touchstart', event => {
        const handle = getHandleFromEvent(event.target);
        if (!handle || activeInput) return;
        const touch = firstChangedTouch(event);
        if (!touch) return;
        event.preventDefault();
        event.stopPropagation();
        if (!beginDrag(handle, touch.clientY, 'touch')) return;
        touchId = touch.identifier;
        document.addEventListener('touchmove', handleTouchMove, { capture: true, passive: false });
        document.addEventListener('touchend', handleTouchEnd, true);
        document.addEventListener('touchcancel', handleTouchCancel, true);
    }, { capture: true, passive: false });
    popover.addEventListener('keydown', event => {
        const handle = getHandleFromEvent(event.target);
        if (!handle) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onDismiss();
        }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            event.stopPropagation();
            applySheetHeight(sheetHeight + (event.key === 'ArrowUp' ? SHEET_KEYBOARD_STEP_PX : -SHEET_KEYBOARD_STEP_PX), true);
            reset();
        }
        if (event.key === 'Escape') onDismiss();
    });

    const viewportListenerOptions: AddEventListenerOptions = { passive: true, signal: viewportController.signal };
    window.addEventListener('resize', handleViewportChange, viewportListenerOptions);
    window.addEventListener('orientationchange', handleViewportChange, viewportListenerOptions);
    window.visualViewport?.addEventListener?.('resize', handleViewportChange, viewportListenerOptions);
    window.visualViewport?.addEventListener?.('scroll', handleViewportChange, viewportListenerOptions);
}

function shouldUseSheet(settings: ReaderSettings): boolean {
    if (settings.popupMode === 'sheet') return true;
    if (settings.popupMode === 'popover') return false;
    return window.innerWidth <= 768 || matchMedia('(pointer: coarse)').matches;
}

function sheetMinHeight(viewportHeight: number): number {
    if (viewportHeight <= 0) return MIN_SHEET_HEIGHT_PX;
    return Math.min(viewportHeight, MIN_SHEET_HEIGHT_PX, Math.max(140, Math.round(viewportHeight * 0.32)));
}

function restoredSheetHeight(viewportHeight: number): number {
    return clampSheetHeight(viewportHeight * readSheetHeightRatio(), viewportHeight);
}

function clampSheetHeight(height: number, viewportHeight: number): number {
    if (viewportHeight <= 0) return Math.max(MIN_SHEET_HEIGHT_PX, Math.round(height));
    const minHeight = sheetMinHeight(viewportHeight);
    return Math.max(minHeight, Math.min(viewportHeight, Math.round(height)));
}

function readSheetHeightRatio(): number {
    const value = gmStorageGetSync<number>(SHEET_HEIGHT_STORAGE_KEY, DEFAULT_SHEET_HEIGHT_RATIO);
    return Number.isFinite(value) && value > 0 && value <= 1 ? value : DEFAULT_SHEET_HEIGHT_RATIO;
}

function storeSheetHeightRatio(height: number, viewportHeight: number): void {
    if (viewportHeight <= 0) return;
    const ratio = Math.max(0, Math.min(1, height / viewportHeight));
    gmStorageSetSync(SHEET_HEIGHT_STORAGE_KEY, Number(ratio.toFixed(4)));
}
