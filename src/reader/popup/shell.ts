import { setInnerHtml } from '../dom';
import { uiText } from '../app/i18n';
import { gmStorageGetSync, gmStorageSetSync } from '../app/storage';
import type { ReaderSettings } from '../app/types';

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
const AUTO_SHEET_COMPACT_WIDTH_PX = 768;
const AUTO_SHEET_PORTRAIT_MAX_WIDTH_PX = 1100;
const AUTO_POPOVER_VIEWPORT_MARGIN_PX = 48;
const AUTO_POPOVER_MIN_HEIGHT_PX = 520;
const FORCED_POPOVER_SURFACE_DATA_KEY = 'jpdbReaderForcedPopoverSurface';
const POPOVER_BODY_ACTION_SELECTOR = [
    'button',
    '[role="button"]',
    'input',
    'select',
    'textarea',
    '[data-action]',
    '[data-immersion-action]',
    '[data-yomu-immersion-action]',
    '[data-uchisen-action]',
].join(',');

export interface PopoverScrollFrame {
    scrollBody: HTMLElement;
    scrollTop: number;
}

function popoverScrollBody(popover: HTMLElement): HTMLElement {
    return popover.querySelector<HTMLElement>('.jpdb-reader-popover-body') ?? popover;
}

export function capturePopoverScrollFrame(target: HTMLElement): PopoverScrollFrame {
    const popover = target.closest<HTMLElement>('.jpdb-reader-popover') ?? target;
    const scrollBody = target.closest<HTMLElement>('.jpdb-reader-popover-body') ?? popoverScrollBody(popover);
    return { scrollBody, scrollTop: scrollBody.scrollTop };
}

function restorePopoverScrollFrame(frame: PopoverScrollFrame): void {
    if (!frame.scrollBody.isConnected) return;
    if (frame.scrollBody.scrollTop !== frame.scrollTop) frame.scrollBody.scrollTop = frame.scrollTop;
}

export function restorePopoverScrollFrameSoon(frame: PopoverScrollFrame): void {
    restorePopoverScrollFrame(frame);
    requestAnimationFrame(() => restorePopoverScrollFrame(frame));
}

export function popoverBodyActionElement(target: HTMLElement, scrollBody: HTMLElement): HTMLElement | null {
    const action = target.closest<HTMLElement>(POPOVER_BODY_ACTION_SELECTOR);
    return action && scrollBody.contains(action) ? action : null;
}

type DragInput = 'pointer' | 'touch';

interface HandleDragState {
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    deltaX: number;
    deltaY: number;
}

interface HandleDragOptions<THandle extends HTMLElement> {
    tapMovementPx: number;
    updateOnEnd?: boolean;
    movementDistance?: (state: HandleDragState) => number;
    onBegin?: (handle: THandle, state: HandleDragState, input: DragInput) => void;
    onUpdate?: (state: HandleDragState, handle: THandle) => void;
    onFinish: (state: HandleDragState, wasMoved: boolean, handle: THandle | null) => void;
    onCancel?: (state: HandleDragState, handle: THandle | null) => void;
}

interface HandleDragController<THandle extends HTMLElement> {
    isDragging(): boolean;
    pointerDown(handle: THandle, event: PointerEvent): void;
    touchStart(handle: THandle, event: TouchEvent): void;
    cancel(): void;
    cleanupListeners(): void;
}

function createHandleDragController<THandle extends HTMLElement>(options: HandleDragOptions<THandle>): HandleDragController<THandle> {
    let state = initialDragState();
    let pointerId = 0;
    let touchId = 0;
    let dragging = false;
    let moved = false;
    let activeInput: DragInput | null = null;
    let activeHandle: THandle | null = null;
    let activeCaptureTarget: Element | null = null;

    const movementDistance = options.movementDistance ?? (dragState => Math.hypot(dragState.deltaX, dragState.deltaY));
    const setLastPoint = (point: { x: number; y: number }): void => {
        state = {
            ...state,
            lastX: point.x,
            lastY: point.y,
            deltaX: point.x - state.startX,
            deltaY: point.y - state.startY,
        };
    };
    const updateDrag = (point: { x: number; y: number }): void => {
        if (!activeHandle) return;
        setLastPoint(point);
        if (movementDistance(state) > options.tapMovementPx) moved = true;
        options.onUpdate?.(state, activeHandle);
    };
    const beginDrag = (handle: THandle, point: { x: number; y: number }, input: DragInput): boolean => {
        if (dragging || activeInput) return false;
        state = {
            startX: point.x,
            startY: point.y,
            lastX: point.x,
            lastY: point.y,
            deltaX: 0,
            deltaY: 0,
        };
        dragging = true;
        moved = false;
        activeInput = input;
        activeHandle = handle;
        options.onBegin?.(handle, state, input);
        return true;
    };
    const finishDrag = (): void => {
        if (!dragging) return;
        const wasMoved = moved;
        const handle = activeHandle;
        const captureTarget = activeCaptureTarget;
        dragging = false;
        moved = false;
        activeInput = null;
        activeHandle = null;
        activeCaptureTarget = null;
        cleanupListeners();
        releasePointerCapture(captureTarget, pointerId);
        options.onFinish(state, wasMoved, handle);
    };

    function cleanupListeners(): void {
        if (typeof document === 'undefined') return;
        document.removeEventListener('pointermove', handlePointerMove, true);
        document.removeEventListener('pointerup', handlePointerUp, true);
        document.removeEventListener('pointercancel', handlePointerCancel, true);
        document.removeEventListener('touchmove', handleTouchMove, true);
        document.removeEventListener('touchend', handleTouchEnd, true);
        document.removeEventListener('touchcancel', handleTouchCancel, true);
    }
    function cancel(): void {
        if (!dragging) return;
        const handle = activeHandle;
        const captureTarget = activeCaptureTarget;
        dragging = false;
        moved = false;
        activeInput = null;
        activeHandle = null;
        activeCaptureTarget = null;
        cleanupListeners();
        releasePointerCapture(captureTarget, pointerId);
        options.onCancel?.(state, handle);
    }
    function handlePointerMove(event: PointerEvent): void {
        if (!dragging || activeInput !== 'pointer' || event.pointerId !== pointerId) return;
        consumeDragEvent(event);
        updateDrag({ x: event.clientX, y: event.clientY });
    }
    function handlePointerUp(event: PointerEvent): void {
        if (!dragging || activeInput !== 'pointer' || event.pointerId !== pointerId) return;
        consumeDragEvent(event);
        if (options.updateOnEnd) updateDrag({ x: event.clientX, y: event.clientY });
        else setLastPoint({ x: event.clientX, y: event.clientY });
        finishDrag();
    }
    function handlePointerCancel(event: PointerEvent): void {
        if (activeInput !== 'pointer' || event.pointerId !== pointerId) return;
        cancel();
    }
    function handleTouchMove(event: TouchEvent): void {
        if (!dragging || activeInput !== 'touch') return;
        const touch = changedTouch(event, touchId);
        if (!touch) return;
        consumeDragEvent(event);
        updateDrag({ x: touch.clientX, y: touch.clientY });
    }
    function handleTouchEnd(event: TouchEvent): void {
        if (!dragging || activeInput !== 'touch') return;
        const touch = changedTouch(event, touchId);
        if (!touch) return;
        consumeDragEvent(event);
        if (options.updateOnEnd) updateDrag({ x: touch.clientX, y: touch.clientY });
        else setLastPoint({ x: touch.clientX, y: touch.clientY });
        finishDrag();
    }
    function handleTouchCancel(event: TouchEvent): void {
        if (activeInput !== 'touch' || !changedTouch(event, touchId)) return;
        cancel();
    }

    return {
        isDragging: () => dragging,
        pointerDown(handle: THandle, event: PointerEvent): void {
            if (activeInput) return;
            if (event.button !== undefined && event.button !== 0) return;
            consumeDragEvent(event);
            if (!beginDrag(handle, { x: event.clientX, y: event.clientY }, 'pointer')) return;
            pointerId = event.pointerId;
            activeCaptureTarget = event.target instanceof Element ? event.target : handle;
            setPointerCapture(activeCaptureTarget, event.pointerId);
            document.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false });
            document.addEventListener('pointerup', handlePointerUp, true);
            document.addEventListener('pointercancel', handlePointerCancel, true);
        },
        touchStart(handle: THandle, event: TouchEvent): void {
            if (activeInput) return;
            const touch = firstChangedTouch(event);
            if (!touch) return;
            consumeDragEvent(event);
            if (!beginDrag(handle, { x: touch.clientX, y: touch.clientY }, 'touch')) return;
            touchId = touch.identifier;
            document.addEventListener('touchmove', handleTouchMove, { capture: true, passive: false });
            document.addEventListener('touchend', handleTouchEnd, true);
            document.addEventListener('touchcancel', handleTouchCancel, true);
        },
        cancel,
        cleanupListeners,
    };
}

function initialDragState(): HandleDragState {
    return {
        startX: 0,
        startY: 0,
        lastX: 0,
        lastY: 0,
        deltaX: 0,
        deltaY: 0,
    };
}

function getContainedClosest<TElement extends HTMLElement>(
    target: EventTarget | null,
    root: HTMLElement,
    selector: string,
    onFound?: (element: TElement) => void,
): TElement | null {
    if (!(target instanceof Element)) return null;
    const element = target.closest<TElement>(selector);
    if (!element || !root.contains(element)) return null;
    onFound?.(element);
    return element;
}

function consumeDragEvent(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
}

function changedTouch(event: TouchEvent, touchId: number): Touch | null {
    for (const touch of Array.from(event.changedTouches)) {
        if (touch.identifier === touchId) return touch;
    }
    return null;
}

function firstChangedTouch(event: TouchEvent): Touch | null {
    return event.changedTouches.item(0);
}

function releasePointerCapture(handle: Element | null, id: number): void {
    try {
        handle?.releasePointerCapture?.(id);
    } catch {
        // Some iOS WebKit contexts expose pointer events without reliable capture.
    }
}

function setPointerCapture(handle: Element, id: number): void {
    try {
        handle.setPointerCapture?.(id);
    } catch {
        // Document-level listeners keep the drag alive when capture is unavailable.
    }
}

function addViewportChangeListeners(listener: EventListener, signal: AbortSignal): void {
    const options: AddEventListenerOptions = { passive: true, signal };
    window.addEventListener('resize', listener, options);
    window.addEventListener('orientationchange', listener, options);
    window.visualViewport?.addEventListener?.('resize', listener, options);
    window.visualViewport?.addEventListener?.('scroll', listener, options);
}

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

    let suppressNextHandleClick = false;
    const getHandleFromEvent = (event: EventTarget | null): HTMLElement | null => (
        getContainedClosest<HTMLElement>(event, popover, '.jpdb-reader-sheet-handle', syncHandle)
    );
    const reset = () => {
        popover.style.transition = 'height .16s ease, max-height .16s ease, border-radius .16s ease, transform .16s ease';
        clearDragStyles();
        window.setTimeout(() => { popover.style.transition = ''; }, 180);
    };
    const sheetDrag = createHandleDragController<HTMLElement>({
        tapMovementPx: SHEET_TAP_MOVEMENT_PX,
        movementDistance: state => Math.abs(state.deltaY),
        onBegin: () => {
            startHeight = sheetHeight || restoredSheetHeight(viewportHeight);
            rawDragHeight = startHeight;
            popover.style.transition = '';
            popover.classList.add('jpdb-reader-sheet-resizing');
        },
        onUpdate: state => {
            rawDragHeight = startHeight - state.deltaY;
            applySheetHeight(rawDragHeight);
        },
        onFinish: (_state, wasMoved) => {
            const finishHeight = rawDragHeight;
            popover.classList.remove('jpdb-reader-sheet-resizing');
            if (!wasMoved) {
                suppressNextHandleClick = true;
                onDismiss();
                return;
            }
            suppressNextHandleClick = true;
            if (finishHeight < sheetMinHeight(viewportHeight) - SHEET_DISMISS_OVERSHOOT_PX) {
                onDismiss();
                return;
            }
            applySheetHeight(finishHeight, true);
            reset();
        },
        onCancel: reset,
    });
    const handleViewportChange = () => {
        if (sheetDrag.isDragging()) sheetDrag.cancel();
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
        sheetDrag.cleanupListeners();
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
        sheetDrag.pointerDown(handle, event);
    });
    popover.addEventListener('touchstart', event => {
        const handle = getHandleFromEvent(event.target);
        if (!handle) return;
        sheetDrag.touchStart(handle, event);
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

    addViewportChangeListeners(handleViewportChange, viewportController.signal);
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
        const bottomInset = settingsDrawerBottomInset();
        viewportHeight = visualViewportHeight();
        drawer.style.setProperty('--jpdb-reader-settings-drawer-bottom', `${bottomInset}px`);
        drawer.style.setProperty('--jpdb-reader-settings-drawer-viewport-height', `${viewportHeight}px`);
        drawer.style.setProperty('--jpdb-reader-settings-drawer-min-height', `${settingsDrawerMinHeight(viewportHeight)}px`);
        drawer.classList.toggle('jpdb-reader-settings-keyboard-open', bottomInset > 0);
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
    const getHandleFromEvent = (event: EventTarget | null): HTMLElement | null => (
        getContainedClosest<HTMLElement>(event, drawer, '.jpdb-reader-settings-drag-handle', syncHandle)
    );
    const drawerDrag = createHandleDragController<HTMLElement>({
        tapMovementPx: SETTINGS_DRAWER_TAP_MOVEMENT_PX,
        movementDistance: state => Math.abs(state.deltaY),
        onBegin: () => {
            startHeight = drawerHeight || restoredSettingsDrawerHeight(viewportHeight);
            rawDragHeight = startHeight;
            drawer.style.transition = '';
            drawer.classList.add('jpdb-reader-settings-drawer-resizing');
        },
        onUpdate: state => {
            rawDragHeight = startHeight - state.deltaY;
            applyDrawerHeight(rawDragHeight);
        },
        onFinish: (_state, wasMoved) => {
            const finishHeight = rawDragHeight;
            if (wasMoved) {
                suppressNextHandleClick = true;
                applyDrawerHeight(finishHeight, true);
            }
            reset();
        },
        onCancel: reset,
    });
    const handleViewportChange = () => {
        if (drawerDrag.isDragging()) drawerDrag.cancel();
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
        drawerDrag.cleanupListeners();
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
        if (!handle) return;
        drawerDrag.pointerDown(handle, event);
    });
    drawer.addEventListener('touchstart', event => {
        const handle = getHandleFromEvent(event.target);
        if (!handle) return;
        drawerDrag.touchStart(handle, event);
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

    addViewportChangeListeners(handleViewportChange, viewportController.signal);
}

export function installMiningDrawerHandle(
    root: HTMLElement,
    setExpanded: (button: HTMLButtonElement, expanded: boolean) => void,
): void {
    if (root.dataset.jpdbReaderMiningDrawerHandleInstalled === 'true') return;
    root.dataset.jpdbReaderMiningDrawerHandleInstalled = 'true';

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
    const miningDrag = createHandleDragController<HTMLButtonElement>({
        tapMovementPx: MINING_DRAWER_TAP_MOVEMENT_PX,
        updateOnEnd: true,
        onBegin: handle => {
            handle.closest<HTMLElement>('.jpdb-reader-actions')?.classList.add('jpdb-reader-mining-drawer-dragging');
        },
        onFinish: (state, wasMoved, handle) => {
            handle?.closest<HTMLElement>('.jpdb-reader-actions')?.classList.remove('jpdb-reader-mining-drawer-dragging');
            if (!wasMoved || !handle) return;
            suppressNextHandleClick = true;
            const expanded = miningDrawerDragExpandedState(handle, state.deltaX, state.deltaY);
            if (expanded !== undefined) setExpanded(handle, expanded);
        },
        onCancel: (_state, handle) => {
            handle?.closest<HTMLElement>('.jpdb-reader-actions')?.classList.remove('jpdb-reader-mining-drawer-dragging');
        },
    });

    root.addEventListener('click', event => {
        const handle = getHandleFromEvent(event.target);
        if (!handle) return;
        if (suppressNextHandleClick) {
            suppressNextHandleClick = false;
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        const target = event.target;
        if (target instanceof Element && target.closest('.jpdb-reader-mining-drawer-handle') === handle) return;
        event.preventDefault();
        event.stopPropagation();
        handle.click();
    }, true);
    root.addEventListener('pointerdown', event => {
        const handle = getHandleFromEvent(event.target);
        if (!handle) return;
        miningDrag.pointerDown(handle, event);
    });
    root.addEventListener('touchstart', event => {
        const handle = getHandleFromEvent(event.target);
        if (!handle) return;
        miningDrag.touchStart(handle, event);
    }, { capture: true, passive: false });
}

export function shouldUseSheet(settings: ReaderSettings): boolean {
    if (settings.popupMode === 'sheet') return true;
    if (settings.popupMode === 'popover') return false;
    const { width, height } = lookupViewportSize();
    const popoverWidth = Math.max(0, settings.popoverWidth || 0);
    const requiredPopoverWidth = popoverWidth + AUTO_POPOVER_VIEWPORT_MARGIN_PX;
    if (width <= AUTO_SHEET_COMPACT_WIDTH_PX || width < requiredPopoverWidth) return true;
    if (height > 0 && height < AUTO_POPOVER_MIN_HEIGHT_PX) return true;
    return height > width && width <= AUTO_SHEET_PORTRAIT_MAX_WIDTH_PX;
}

function lookupViewportSize(): { width: number; height: number } {
    const visual = window.visualViewport;
    const width = Math.round(visual?.width ?? window.innerWidth ?? document.documentElement.clientWidth ?? 0);
    const height = Math.round(visual?.height ?? window.innerHeight ?? document.documentElement.clientHeight ?? 0);
    return { width: Math.max(0, width), height: Math.max(0, height) };
}

function visualViewportHeight(): number {
    return Math.max(0, Math.round(window.visualViewport?.height ?? layoutViewportHeight()));
}

function settingsDrawerBottomInset(): number {
    const visual = window.visualViewport;
    if (!visual) return 0;
    const layoutHeight = layoutViewportHeight();
    if (layoutHeight <= 0) return 0;
    return Math.max(0, Math.round(layoutHeight - visual.offsetTop - visual.height));
}

function layoutViewportHeight(): number {
    return Math.max(0, Math.round(window.innerHeight || document.documentElement.clientHeight || 0));
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
