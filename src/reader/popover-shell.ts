import type { ReaderSettings } from './types';
import { gmStorageGetSync, gmStorageSetSync } from './storage';
import { setInnerHtml } from './dom';
import { uiText } from './i18n';

const SHEET_HEIGHT_STORAGE_KEY = 'jpdb-reader-sheet-height-ratio';
const SETTINGS_DRAWER_HEIGHT_STORAGE_KEY = 'jpdb-reader-settings-drawer-height-ratio';
const DEFAULT_SHEET_HEIGHT_RATIO = 0.7;
const DEFAULT_SETTINGS_DRAWER_HEIGHT_RATIO = 0.88;
const MIN_SHEET_HEIGHT_PX = 180;
const MIN_SETTINGS_DRAWER_HEIGHT_PX = 280;
const SHEET_DISMISS_OVERSHOOT_PX = 72;
const SHEET_FULL_HEIGHT_THRESHOLD_PX = 12;
const SETTINGS_DRAWER_FULL_HEIGHT_THRESHOLD_PX = 12;
const SHEET_TAP_MOVEMENT_PX = 8;
const SHEET_KEYBOARD_STEP_PX = 48;
const SETTINGS_DRAWER_TAP_MOVEMENT_PX = 8;
const SETTINGS_DRAWER_KEYBOARD_STEP_PX = 56;
const MINING_DRAWER_DRAG_THRESHOLD_PX = 22;
const MINING_DRAWER_TAP_MOVEMENT_PX = 8;
const FORCED_POPOVER_SURFACE_DATA_KEY = 'jpdbReaderForcedPopoverSurface';

export function createReaderPopover(appName: string, settings: ReaderSettings): HTMLElement {
    const popover = document.createElement('div');
    popover.className = 'jpdb-reader-popover';
    popover.dataset.jpdbReaderRoot = 'true';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', uiText(settings.interfaceLanguage, 'lookupDialog') || `${appName} lookup`);
    popover.setAttribute('aria-modal', 'true');
    popover.tabIndex = -1;
    if (shouldUseSheet(settings)) popover.classList.add('jpdb-reader-sheet');
    else popover.style.width = `${settings.popoverWidth}px`;
    return popover;
}

export function forceReaderPopoverSurface(popover: HTMLElement, settings: ReaderSettings): void {
    popover.dataset[FORCED_POPOVER_SURFACE_DATA_KEY] = 'true';
    refreshForcedReaderPopoverSurface(popover, settings);
}

export function refreshForcedReaderPopoverSurface(popover: HTMLElement, settings: ReaderSettings): void {
    if (popover.dataset[FORCED_POPOVER_SURFACE_DATA_KEY] !== 'true') return;
    popover.classList.remove('jpdb-reader-sheet', 'jpdb-reader-sheet-sticky', 'jpdb-reader-sheet-expanded', 'jpdb-reader-sheet-resizing');
    popover.style.width = `${settings.popoverWidth}px`;
    popover.style.height = '';
    popover.style.minHeight = '';
    popover.querySelectorAll('.jpdb-reader-sheet-handle, .jpdb-reader-sheet-close').forEach(element => element.remove());
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

export function installSheetHandle(popover: HTMLElement, onDismiss: () => void, label = 'Drag to resize lookup sheet, or tap to close'): void {
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
        handle.setAttribute('aria-label', label);
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
        if (typeof document === 'undefined') return;
        document.removeEventListener('pointermove', handlePointerMove, true);
        document.removeEventListener('pointerup', handlePointerUp, true);
        document.removeEventListener('pointercancel', handlePointerCancel, true);
    };
    const cleanupTouchListeners = () => {
        if (typeof document === 'undefined') return;
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

export function installSheetCloseButton(popover: HTMLElement, onDismiss: () => void, label = 'Close drawer'): void {
    if (popover.dataset.jpdbReaderSheetCloseInstalled === 'true') return;
    popover.dataset.jpdbReaderSheetCloseInstalled = 'true';

    const close = (event: Event): void => {
        event.preventDefault();
        event.stopPropagation();
        onDismiss();
    };
    const createButton = (): HTMLButtonElement => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'jpdb-reader-sheet-close';
        button.dataset.jpdbReaderSheetClose = 'true';
        button.setAttribute('aria-label', label);
        button.title = label;
        setInnerHtml(button, '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"></path></svg>');
        button.addEventListener('click', close);
        return button;
    };
    const ensureButton = (): void => {
        if (!popover.isConnected) return;
        if (popover.querySelector('[data-jpdb-reader-sheet-close="true"]')) return;
        popover.append(createButton());
    };

    ensureButton();
    let disposed = false;
    let contentObserver: MutationObserver | undefined;
    let disposeObserver: MutationObserver | undefined;
    const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        contentObserver?.disconnect();
        disposeObserver?.disconnect();
    };
    contentObserver = new MutationObserver(ensureButton);
    contentObserver.observe(popover, { childList: true });
    disposeObserver = new MutationObserver(() => {
        if (!popover.isConnected) dispose();
    });
    if (document.documentElement) {
        disposeObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
}

export function installSettingsDrawerHandle(drawer: HTMLElement, label = 'Resize settings'): void {
    if (drawer.dataset.jpdbReaderSettingsDrawerHandleInstalled === 'true') return;
    drawer.dataset.jpdbReaderSettingsDrawerHandleInstalled = 'true';

    let viewportHeight = 0;
    let drawerHeight = 0;
    let startHeight = 0;
    let rawDragHeight = 0;
    let startY = 0;
    let lastY = 0;
    let pointerId = 0;
    let dragging = false;
    let moved = false;
    let activeInput: 'pointer' | 'touch' | null = null;
    let touchId = 0;
    let activeHandle: HTMLElement | null = null;
    let suppressNextHandleClick = false;
    const isFullHeight = (): boolean => viewportHeight > 0 && drawerHeight >= viewportHeight - SETTINGS_DRAWER_FULL_HEIGHT_THRESHOLD_PX;

    const syncHandle = (handle: HTMLElement): void => {
        handle.setAttribute('role', 'separator');
        handle.setAttribute('tabindex', '0');
        handle.setAttribute('aria-label', label);
        handle.setAttribute('aria-orientation', 'horizontal');
        handle.setAttribute('aria-valuemin', String(settingsDrawerMinHeight(viewportHeight)));
        handle.setAttribute('aria-valuemax', String(viewportHeight));
        handle.setAttribute('aria-valuenow', String(Math.round(drawerHeight)));
    };
    const syncHandleState = (): void => {
        drawer.querySelectorAll<HTMLElement>('.jpdb-reader-settings-drag-handle').forEach(syncHandle);
    };
    const applyDrawerHeight = (height: number, persist = false): void => {
        const nextHeight = clampDrawerHeight(height, viewportHeight, settingsDrawerMinHeight(viewportHeight));
        drawerHeight = nextHeight;
        drawer.style.setProperty('--jpdb-reader-settings-drawer-height', `${Math.round(nextHeight)}px`);
        drawer.classList.toggle('jpdb-reader-settings-drawer-expanded', isFullHeight());
        syncHandleState();
        if (persist) storeHeightRatio(SETTINGS_DRAWER_HEIGHT_STORAGE_KEY, nextHeight, viewportHeight);
    };
    const applyViewportSize = (): void => {
        const previousViewportHeight = viewportHeight;
        viewportHeight = Math.max(0, Math.round(window.visualViewport?.height ?? window.innerHeight));
        drawer.style.setProperty('--jpdb-reader-settings-drawer-viewport-height', `${viewportHeight}px`);
        drawer.style.setProperty('--jpdb-reader-settings-drawer-min-height', `${settingsDrawerMinHeight(viewportHeight)}px`);
        const ratio = previousViewportHeight > 0 && drawerHeight > 0
            ? drawerHeight / previousViewportHeight
            : readHeightRatio(SETTINGS_DRAWER_HEIGHT_STORAGE_KEY, DEFAULT_SETTINGS_DRAWER_HEIGHT_RATIO);
        applyDrawerHeight(viewportHeight * ratio);
    };
    const clearDragStyles = (): void => {
        drawer.classList.remove('jpdb-reader-settings-drawer-resizing');
    };
    const reset = () => {
        drawer.style.transition = 'height .16s ease, max-height .16s ease, border-radius .16s ease';
        clearDragStyles();
        window.setTimeout(() => { drawer.style.transition = ''; }, 180);
    };
    const getHandleFromEvent = (event: EventTarget | null): HTMLElement | null => {
        if (!(event instanceof Element)) return null;
        const handle = event.closest('.jpdb-reader-settings-drag-handle');
        if (!handle || !drawer.contains(handle)) return null;
        syncHandle(handle as HTMLElement);
        return handle as HTMLElement;
    };
    const cleanupPointerListeners = () => {
        if (typeof document === 'undefined') return;
        document.removeEventListener('pointermove', handlePointerMove, true);
        document.removeEventListener('pointerup', handlePointerUp, true);
        document.removeEventListener('pointercancel', handlePointerCancel, true);
    };
    const cleanupTouchListeners = () => {
        if (typeof document === 'undefined') return;
        document.removeEventListener('touchmove', handleTouchMove, true);
        document.removeEventListener('touchend', handleTouchEnd, true);
        document.removeEventListener('touchcancel', handleTouchCancel, true);
    };
    const releasePointerCapture = (handle: HTMLElement | null, id: number): void => {
        try {
            handle?.releasePointerCapture?.(id);
        } catch {
        }
    };
    const setPointerCapture = (handle: HTMLElement, id: number): void => {
        try {
            handle.setPointerCapture?.(id);
        } catch {
        }
    };
    const updateDrag = (clientY: number): void => {
        lastY = clientY;
        const delta = startY - lastY;
        rawDragHeight = startHeight + delta;
        if (Math.abs(lastY - startY) > SETTINGS_DRAWER_TAP_MOVEMENT_PX) moved = true;
        applyDrawerHeight(rawDragHeight);
    };
    const beginDrag = (handle: HTMLElement, clientY: number, input: 'pointer' | 'touch'): boolean => {
        if (dragging || activeInput) return false;
        startY = clientY;
        lastY = clientY;
        startHeight = drawerHeight || restoredSettingsDrawerHeight(viewportHeight);
        rawDragHeight = startHeight;
        dragging = true;
        moved = false;
        activeInput = input;
        activeHandle = handle;
        drawer.style.transition = '';
        drawer.classList.add('jpdb-reader-settings-drawer-resizing');
        return true;
    };
    const finish = () => {
        if (!dragging) return;
        const wasMoved = moved;
        const handle = activeHandle;
        const finishHeight = rawDragHeight;
        dragging = false;
        moved = false;
        activeInput = null;
        activeHandle = null;
        cleanupPointerListeners();
        cleanupTouchListeners();
        releasePointerCapture(handle, pointerId);
        if (wasMoved) {
            suppressNextHandleClick = true;
            applyDrawerHeight(finishHeight, true);
        }
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
        finish();
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
        finish();
    };
    const handleTouchCancel = (event: TouchEvent) => {
        if (activeInput !== 'touch' || !changedTouch(event)) return;
        cancelDrag();
    };
    const handleViewportChange = () => {
        if (dragging) cancelDrag();
        drawer.style.transition = '';
        applyViewportSize();
        clearDragStyles();
        syncHandleState();
    };

    applyViewportSize();
    syncHandleState();

    const viewportController = new AbortController();
    let disposed = false;
    let disposeObserver: MutationObserver | undefined;
    const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        cleanupPointerListeners();
        cleanupTouchListeners();
        viewportController.abort();
        disposeObserver?.disconnect();
    };
    disposeObserver = new MutationObserver(() => {
        if (!drawer.isConnected) dispose();
    });
    if (document.documentElement) {
        disposeObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    drawer.addEventListener('click', event => {
        const handle = getHandleFromEvent(event.target);
        if (!handle) return;
        event.preventDefault();
        event.stopPropagation();
        if (suppressNextHandleClick) suppressNextHandleClick = false;
    });
    drawer.addEventListener('pointerdown', event => {
        const handle = getHandleFromEvent(event.target);
        if (!handle || activeInput) return;
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
    drawer.addEventListener('touchstart', event => {
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
    drawer.addEventListener('keydown', event => {
        const handle = getHandleFromEvent(event.target);
        if (!handle) return;
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            event.stopPropagation();
            applyDrawerHeight(drawerHeight + (event.key === 'ArrowUp' ? SETTINGS_DRAWER_KEYBOARD_STEP_PX : -SETTINGS_DRAWER_KEYBOARD_STEP_PX), true);
            reset();
        }
    });

    const viewportListenerOptions: AddEventListenerOptions = { passive: true, signal: viewportController.signal };
    window.addEventListener('resize', handleViewportChange, viewportListenerOptions);
    window.addEventListener('orientationchange', handleViewportChange, viewportListenerOptions);
    window.visualViewport?.addEventListener?.('resize', handleViewportChange, viewportListenerOptions);
    window.visualViewport?.addEventListener?.('scroll', handleViewportChange, viewportListenerOptions);
}

export function installMiningDrawerHandle(
    root: HTMLElement,
    setExpanded: (button: HTMLButtonElement, expanded: boolean) => void,
): void {
    if (root.dataset.jpdbReaderMiningDrawerHandleInstalled === 'true') return;
    root.dataset.jpdbReaderMiningDrawerHandleInstalled = 'true';

    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let pointerId = 0;
    let touchId = 0;
    let dragging = false;
    let moved = false;
    let activeInput: 'pointer' | 'touch' | null = null;
    let activeHandle: HTMLButtonElement | null = null;
    let suppressNextHandleClick = false;

    const getHandleFromEvent = (event: EventTarget | null): HTMLButtonElement | null => {
        if (!(event instanceof Element)) return null;
        const target = event.closest<HTMLElement>('.jpdb-reader-mining-drawer-handle, .jpdb-reader-actions-gutter');
        if (!target || !root.contains(target)) return null;
        const handle = target.matches('.jpdb-reader-mining-drawer-handle')
            ? target as HTMLButtonElement
            : target.querySelector<HTMLButtonElement>('.jpdb-reader-mining-drawer-handle');
        if (!handle) return null;
        return handle;
    };
    const cleanupPointerListeners = (): void => {
        document.removeEventListener('pointermove', handlePointerMove, true);
        document.removeEventListener('pointerup', handlePointerUp, true);
        document.removeEventListener('pointercancel', handlePointerCancel, true);
    };
    const cleanupTouchListeners = (): void => {
        document.removeEventListener('touchmove', handleTouchMove, true);
        document.removeEventListener('touchend', handleTouchEnd, true);
        document.removeEventListener('touchcancel', handleTouchCancel, true);
    };
    const setPointerCapture = (handle: HTMLElement, id: number): void => {
        try {
            handle.setPointerCapture?.(id);
        } catch {
        }
    };
    const releasePointerCapture = (handle: HTMLElement | null, id: number): void => {
        try {
            handle?.releasePointerCapture?.(id);
        } catch {
        }
    };
    const beginDrag = (handle: HTMLButtonElement, clientX: number, clientY: number, input: 'pointer' | 'touch'): boolean => {
        if (dragging || activeInput) return false;
        startX = clientX;
        startY = clientY;
        lastX = clientX;
        lastY = clientY;
        dragging = true;
        moved = false;
        activeInput = input;
        activeHandle = handle;
        handle.closest<HTMLElement>('.jpdb-reader-actions')?.classList.add('jpdb-reader-mining-drawer-dragging');
        return true;
    };
    const updateDrag = (clientX: number, clientY: number): void => {
        lastX = clientX;
        lastY = clientY;
        if (Math.hypot(lastX - startX, lastY - startY) > MINING_DRAWER_TAP_MOVEMENT_PX) moved = true;
    };
    const finish = (): void => {
        if (!dragging) return;
        const wasMoved = moved;
        const handle = activeHandle;
        dragging = false;
        moved = false;
        activeInput = null;
        activeHandle = null;
        cleanupPointerListeners();
        cleanupTouchListeners();
        releasePointerCapture(handle, pointerId);
        handle?.closest<HTMLElement>('.jpdb-reader-actions')?.classList.remove('jpdb-reader-mining-drawer-dragging');
        if (!wasMoved || !handle) return;
        suppressNextHandleClick = true;
        const expanded = miningDrawerDragExpandedState(handle, lastX - startX, lastY - startY);
        if (expanded !== undefined) setExpanded(handle, expanded);
    };
    const cancelDrag = (): void => {
        if (!dragging) return;
        const handle = activeHandle;
        dragging = false;
        moved = false;
        activeInput = null;
        activeHandle = null;
        cleanupPointerListeners();
        cleanupTouchListeners();
        releasePointerCapture(handle, pointerId);
        handle?.closest<HTMLElement>('.jpdb-reader-actions')?.classList.remove('jpdb-reader-mining-drawer-dragging');
    };
    const handlePointerMove = (event: PointerEvent): void => {
        if (!dragging || activeInput !== 'pointer' || event.pointerId !== pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        updateDrag(event.clientX, event.clientY);
    };
    const handlePointerUp = (event: PointerEvent): void => {
        if (!dragging || activeInput !== 'pointer' || event.pointerId !== pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        updateDrag(event.clientX, event.clientY);
        finish();
    };
    const handlePointerCancel = (event: PointerEvent): void => {
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
    const handleTouchMove = (event: TouchEvent): void => {
        if (!dragging || activeInput !== 'touch') return;
        const touch = changedTouch(event);
        if (!touch) return;
        event.preventDefault();
        event.stopPropagation();
        updateDrag(touch.clientX, touch.clientY);
    };
    const handleTouchEnd = (event: TouchEvent): void => {
        if (!dragging || activeInput !== 'touch') return;
        const touch = changedTouch(event);
        if (!touch) return;
        event.preventDefault();
        event.stopPropagation();
        updateDrag(touch.clientX, touch.clientY);
        finish();
    };
    const handleTouchCancel = (event: TouchEvent): void => {
        if (activeInput !== 'touch' || !changedTouch(event)) return;
        cancelDrag();
    };

    root.addEventListener('click', event => {
        if (!suppressNextHandleClick) return;
        const handle = getHandleFromEvent(event.target);
        if (!handle) return;
        suppressNextHandleClick = false;
        event.preventDefault();
        event.stopPropagation();
    }, true);
    root.addEventListener('pointerdown', event => {
        const handle = getHandleFromEvent(event.target);
        if (!handle || activeInput) return;
        if (event.button !== undefined && event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        if (!beginDrag(handle, event.clientX, event.clientY, 'pointer')) return;
        pointerId = event.pointerId;
        setPointerCapture(handle, event.pointerId);
        document.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false });
        document.addEventListener('pointerup', handlePointerUp, true);
        document.addEventListener('pointercancel', handlePointerCancel, true);
    });
    root.addEventListener('touchstart', event => {
        const handle = getHandleFromEvent(event.target);
        if (!handle || activeInput) return;
        const touch = firstChangedTouch(event);
        if (!touch) return;
        event.preventDefault();
        event.stopPropagation();
        if (!beginDrag(handle, touch.clientX, touch.clientY, 'touch')) return;
        touchId = touch.identifier;
        document.addEventListener('touchmove', handleTouchMove, { capture: true, passive: false });
        document.addEventListener('touchend', handleTouchEnd, true);
        document.addEventListener('touchcancel', handleTouchCancel, true);
    }, { capture: true, passive: false });
}

export function shouldUseSheet(settings: ReaderSettings): boolean {
    if (settings.popupMode === 'sheet') return true;
    if (settings.popupMode === 'popover') return false;
    return window.innerWidth <= 768 || matchMedia('(pointer: coarse)').matches;
}

function sheetMinHeight(viewportHeight: number): number {
    if (viewportHeight <= 0) return MIN_SHEET_HEIGHT_PX;
    return Math.min(viewportHeight, MIN_SHEET_HEIGHT_PX, Math.max(140, Math.round(viewportHeight * 0.32)));
}

function settingsDrawerMinHeight(viewportHeight: number): number {
    if (viewportHeight <= 0) return MIN_SETTINGS_DRAWER_HEIGHT_PX;
    return Math.min(viewportHeight, MIN_SETTINGS_DRAWER_HEIGHT_PX, Math.max(220, Math.round(viewportHeight * 0.38)));
}

function restoredSheetHeight(viewportHeight: number): number {
    return clampSheetHeight(viewportHeight * readSheetHeightRatio(), viewportHeight);
}

function restoredSettingsDrawerHeight(viewportHeight: number): number {
    return clampDrawerHeight(
        viewportHeight * readHeightRatio(SETTINGS_DRAWER_HEIGHT_STORAGE_KEY, DEFAULT_SETTINGS_DRAWER_HEIGHT_RATIO),
        viewportHeight,
        settingsDrawerMinHeight(viewportHeight),
    );
}

function clampSheetHeight(height: number, viewportHeight: number): number {
    return clampDrawerHeight(height, viewportHeight, sheetMinHeight(viewportHeight));
}

function clampDrawerHeight(height: number, viewportHeight: number, minHeight: number): number {
    if (viewportHeight <= 0) return Math.max(minHeight, Math.round(height));
    return Math.max(minHeight, Math.min(viewportHeight, Math.round(height)));
}

function miningDrawerDragExpandedState(handle: HTMLElement, deltaX: number, deltaY: number): boolean | undefined {
    const axis = miningDrawerDragAxis(handle);
    if (axis === 'horizontal') {
        if (Math.abs(deltaX) < MINING_DRAWER_DRAG_THRESHOLD_PX) return undefined;
        return miningDrawerHorizontalOpenDirection(handle) === 'right' ? deltaX > 0 : deltaX < 0;
    }
    if (Math.abs(deltaY) < MINING_DRAWER_DRAG_THRESHOLD_PX) return undefined;
    return deltaY < 0;
}

function miningDrawerDragAxis(handle: HTMLElement): 'vertical' | 'horizontal' {
    const rect = handle.getBoundingClientRect();
    if (rect.height > rect.width * 1.2) return 'horizontal';
    const actions = handle.closest<HTMLElement>('.jpdb-reader-actions');
    if (!actions) return 'vertical';
    const actionsRect = actions.getBoundingClientRect();
    return actionsRect.height > actionsRect.width * 1.2 ? 'horizontal' : 'vertical';
}

function miningDrawerHorizontalOpenDirection(handle: HTMLElement): 'left' | 'right' {
    const actions = handle.closest<HTMLElement>('.jpdb-reader-actions');
    if (!actions) return 'left';
    const handleRect = handle.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    const handleCenter = handleRect.left + handleRect.width / 2;
    const actionsCenter = actionsRect.left + actionsRect.width / 2;
    return handleCenter < actionsCenter ? 'right' : 'left';
}

function readSheetHeightRatio(): number {
    return readHeightRatio(SHEET_HEIGHT_STORAGE_KEY, DEFAULT_SHEET_HEIGHT_RATIO);
}

function storeSheetHeightRatio(height: number, viewportHeight: number): void {
    storeHeightRatio(SHEET_HEIGHT_STORAGE_KEY, height, viewportHeight);
}

function readHeightRatio(storageKey: string, fallback: number): number {
    const value = gmStorageGetSync<number>(storageKey, fallback);
    return Number.isFinite(value) && value > 0 && value <= 1 ? value : fallback;
}

function storeHeightRatio(storageKey: string, height: number, viewportHeight: number): void {
    if (viewportHeight <= 0) return;
    const ratio = Math.max(0, Math.min(1, height / viewportHeight));
    gmStorageSetSync(storageKey, Number(ratio.toFixed(4)));
}
