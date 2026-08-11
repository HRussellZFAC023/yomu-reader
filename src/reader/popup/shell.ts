import { setInnerHtml } from '../dom';
import { uiText } from '../app/i18n';
import { gmStorageGetSync, gmStorageSetSync } from '../app/storage';
import type { ReaderSettings } from '../app/types';
import { createHandleDragController, getContainedClosest, firstChangedTouch, addViewportChangeListeners } from './handle-drag';
import {
    applyOverlayPageScale,
    overlayViewport,
    overlayViewportBottomInset,
    overlayViewportBounds,
} from '../ui/page-scale';

const SHEET_HEIGHT_STORAGE_KEY = 'jpdb-reader-sheet-height-ratio';
const SETTINGS_DRAWER_HEIGHT_STORAGE_KEY = 'jpdb-reader-settings-drawer-height-ratio';
const DEFAULT_SHEET_HEIGHT_RATIO = 0.7;
const DEFAULT_SETTINGS_DRAWER_HEIGHT_RATIO = 0.88;
const MIN_SHEET_HEIGHT_PX = 180;
/**
 * A sheet never restores smaller than this share of the viewport. It is both the
 * drag floor (see `sheetMinHeight`) and the validity floor for the persisted ratio:
 * because a drag is clamped to the floor, a STORED ratio below it cannot have come
 * from a real drag on that viewport, so it is corrupt and is discarded on read.
 * That matters because the ratio is remembered across sessions — one transient
 * bad measurement (a mid-rotation viewport, a keyboard animation frame) would
 * otherwise leave a reader with a permanently tiny sheet and no way back except
 * clearing storage. Discarding it on read self-heals an already-poisoned install.
 */
const SHEET_MIN_HEIGHT_RATIO = 0.32;
const MIN_SETTINGS_DRAWER_HEIGHT_PX = 280;
const SHEET_DISMISS_OVERSHOOT_PX = 72;
const SHEET_DISMISS_CLICK_SUPPRESSION_MS = 700;
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
export const MINING_DRAWER_HANDLE_SELECTOR = '.jpdb-reader-mining-drawer-handle';
export const MINING_DRAWER_POINTER_TARGET_SELECTOR = '.jpdb-reader-mining-drawer-handle, .jpdb-reader-actions-gutter';
const POPOVER_BODY_ACTION_SELECTOR = [
    'button',
    '[role="button"]',
    'input',
    'select',
    'textarea',
    '[data-action]',
    '[data-immersion-action]',
    '[data-yomu-immersion-action]',
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

export interface PopoverScrollOffset {
    popover: HTMLElement;
    scrollTop: number;
}

/**
 * The read position across a re-render that REPLACES the scroll body.
 *
 * `capturePopoverScrollFrame` pins the body NODE, which is what you want when a
 * re-render only swaps the body's children. A card popover is rebuilt with
 * `setInnerHtml(popover, ...)` instead, so the pinned `.jpdb-reader-popover-body`
 * is detached by the time the restore runs: the guard sees `isConnected === false`,
 * gives up, and the fresh body keeps its default scrollTop of 0. That is the whole
 * mechanism behind "the popup sent me back to the top" — a card hydrates from six
 * independent late promises (Anki, local dictionary, Jiten, pitch, frequency,
 * Bunpro) that settle seconds apart, and each one rebuilt the popover under a
 * learner who had scrolled down to the examples.
 *
 * So capture the OFFSET against the popover and re-resolve the body by selector
 * after the swap. Capture BEFORE the swap: capturing after reads the new body's
 * zero and restores it faithfully.
 */
export function capturePopoverScrollOffset(popover: HTMLElement): PopoverScrollOffset {
    return { popover, scrollTop: popoverScrollBody(popover).scrollTop };
}

function restorePopoverScrollOffset(offset: PopoverScrollOffset): void {
    if (!offset.scrollTop || !offset.popover.isConnected) return;
    const scrollBody = popoverScrollBody(offset.popover);
    if (scrollBody.scrollTop !== offset.scrollTop) scrollBody.scrollTop = offset.scrollTop;
}

/**
 * Restore twice: once now, once on the next frame. The immediate pass keeps the
 * offset through the synchronous reposition that follows every card render, and
 * the frame pass catches the case where the rebuilt body is still shorter than the
 * old one at swap time (lazy sections, deferred immersion mounts) and clamped the
 * assignment down.
 */
export function restorePopoverScrollOffsetSoon(offset: PopoverScrollOffset): void {
    restorePopoverScrollOffset(offset);
    requestAnimationFrame(() => restorePopoverScrollOffset(offset));
}

export function popoverBodyActionElement(target: HTMLElement, scrollBody: HTMLElement): HTMLElement | null {
    const action = target.closest<HTMLElement>(POPOVER_BODY_ACTION_SELECTOR);
    return action && scrollBody.contains(action) ? action : null;
}

export type LookupPopupTrigger = 'modal' | 'hover';

export function createReaderPopover(appName: string, settings: ReaderSettings, trigger: LookupPopupTrigger = 'modal'): HTMLElement {
    const popover = document.createElement('div');
    popover.className = 'jpdb-reader-popover';
    popover.dataset.jpdbReaderRoot = 'true';
    popover.setAttribute('aria-label', uiText(settings.interfaceLanguage, 'lookupDialog') || `${appName} lookup`);
    popover.tabIndex = -1;
    if (shouldUseSheet(settings, trigger)) popover.classList.add('jpdb-reader-sheet');
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
    // Preserve the user's text selection when they click away to dismiss:
    // a mousedown on the overlay would otherwise collapse the page selection.
    // preventDefault on mousedown keeps the highlight while still firing click.
    backdrop.addEventListener('mousedown', event => event.preventDefault());
    backdrop.addEventListener('click', onDismiss);
    return backdrop;
}

export function popoverMaxHeightSetting(settings: ReaderSettings): number | undefined {
    return settings.popoverHeightMode === 'fixed' ? settings.popoverHeight : undefined;
}

// A sheet handle dismisses on pointer/touch-up (the drag controller's tap and
// drag-down-to-close paths), which removes the popover BEFORE the browser fires
// the trailing synthetic `click`. That orphaned click then lands on the page or
// article text the sheet was covering and opens a fresh lookup — so closing the
// drawer pops a new word for whatever was under it. Swallow the one trailing
// click at the window-capture layer, which runs ahead of both the userscript's
// document-capture lookup handler and the hosted reader's root-bubble handler,
// so it can never pierce through.
function suppressTrailingClickAfterSheetGestureDismiss(): void {
    if (typeof window === 'undefined') return;
    let timer = 0;
    const cleanup = (): void => {
        if (timer) window.clearTimeout(timer);
        window.removeEventListener('click', consume, true);
    };
    const consume = (event: MouseEvent): void => {
        cleanup();
        event.preventDefault();
        event.stopImmediatePropagation();
    };
    window.addEventListener('click', consume, { capture: true });
    timer = window.setTimeout(cleanup, SHEET_DISMISS_CLICK_SUPPRESSION_MS);
}

export function installSheetHandle(popover: HTMLElement, onDismiss: () => void, label = 'Drag to resize lookup sheet, or tap to close'): void {
    if (popover.dataset.jpdbReaderSheetHandleInstalled === 'true') return;
    popover.dataset.jpdbReaderSheetHandleInstalled = 'true';

    let viewportHeight = 0;
    let sheetHeight = 0;
    let startHeight = 0;
    let rawDragHeight = 0;
    let dragPageScale = 1;
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
        applyOverlayPageScale(popover);
        const previousViewportHeight = viewportHeight;
        const scaledViewport = overlayViewport();
        viewportHeight = fixedChromeViewportHeight();
        const bottomInset = scaledViewport.pageScale > 1
            ? Math.round(overlayViewportBottomInset())
            : 0;
        popover.style.setProperty('--jpdb-reader-sheet-bottom', `${bottomInset}px`);
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
    // The drag controller closes the sheet on pointer/touch-up, so the popover is
    // already gone when the trailing synthetic click fires — guard against that
    // click reopening a lookup on the text the sheet covered.
    const dismissFromGesture = (): void => {
        suppressTrailingClickAfterSheetGestureDismiss();
        onDismiss();
    };
    const sheetDrag = createHandleDragController<HTMLElement>({
        tapMovementPx: SHEET_TAP_MOVEMENT_PX,
        movementDistance: state => Math.abs(state.deltaY * dragPageScale),
        onBegin: () => {
            dragPageScale = overlayViewport().pageScale;
            startHeight = sheetHeight || restoredSheetHeight(viewportHeight);
            rawDragHeight = startHeight;
            popover.style.transition = '';
            popover.classList.add('jpdb-reader-sheet-resizing');
        },
        onUpdate: state => {
            rawDragHeight = startHeight - state.deltaY * dragPageScale;
            applySheetHeight(rawDragHeight);
        },
        onFinish: (_state, wasMoved) => {
            const finishHeight = rawDragHeight;
            popover.classList.remove('jpdb-reader-sheet-resizing');
            if (!wasMoved) {
                suppressNextHandleClick = true;
                dismissFromGesture();
                return;
            }
            suppressNextHandleClick = true;
            if (finishHeight < sheetMinHeight(viewportHeight) - SHEET_DISMISS_OVERSHOOT_PX) {
                dismissFromGesture();
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

export function installSettingsDrawerHandle(drawer: HTMLElement, label = 'Resize settings', onTap?: () => void): void {
    if (drawer.dataset.jpdbReaderSettingsDrawerHandleInstalled === 'true') return;
    drawer.dataset.jpdbReaderSettingsDrawerHandleInstalled = 'true';

    let viewportHeight = 0;
    let drawerHeight = 0;
    let startHeight = 0;
    let rawDragHeight = 0;
    let dragPageScale = 1;
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
        applyOverlayPageScale(drawer);
        const previousViewportHeight = viewportHeight;
        const { pageScale } = overlayViewport();
        const bottomInset = settingsDrawerBottomInset() * pageScale;
        viewportHeight = fixedChromeViewportHeight();
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
        movementDistance: state => Math.abs(state.deltaY * dragPageScale),
        onBegin: () => {
            dragPageScale = overlayViewport().pageScale;
            startHeight = drawerHeight || restoredSettingsDrawerHeight(viewportHeight);
            rawDragHeight = startHeight;
            drawer.style.transition = '';
            drawer.classList.add('jpdb-reader-settings-drawer-resizing');
        },
        onUpdate: state => {
            rawDragHeight = startHeight - state.deltaY * dragPageScale;
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
        if (suppressNextHandleClick) {
            suppressNextHandleClick = false;
            return;
        }
        onTap?.();
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
    let cleanedUp = false;

    const getHandleFromElement = (event: Element): HTMLButtonElement | null => {
        const target = event.closest<HTMLElement>(MINING_DRAWER_POINTER_TARGET_SELECTOR);
        if (!target || !root.contains(target)) return null;
        const handle = target.matches(MINING_DRAWER_HANDLE_SELECTOR)
            ? target as HTMLButtonElement
            : target.querySelector<HTMLButtonElement>(MINING_DRAWER_HANDLE_SELECTOR);
        if (!handle) return null;
        return handle;
    };
    const getHandleFromEventTarget = (event: EventTarget | null): HTMLButtonElement | null => {
        return event instanceof Element ? getHandleFromElement(event) : null;
    };
    const getHandleFromPoint = (x: number, y: number): HTMLButtonElement | null => {
        if (typeof document.elementsFromPoint !== 'function') return null;
        for (const element of document.elementsFromPoint(x, y)) {
            const handle = getHandleFromElement(element);
            if (handle) return handle;
        }
        return null;
    };
    const getHandleFromPointerEvent = (event: PointerEvent | MouseEvent): HTMLButtonElement | null => {
        return getHandleFromEventTarget(event.target)
            ?? (eventHasPointTarget(event) ? getHandleFromPoint(event.clientX, event.clientY) : null);
    };
    const getHandleFromTouchEvent = (event: TouchEvent): HTMLButtonElement | null => {
        const direct = getHandleFromEventTarget(event.target);
        if (direct) return direct;
        const touch = firstChangedTouch(event);
        return touch ? getHandleFromPoint(touch.clientX, touch.clientY) : null;
    };
    const isInteractiveGutterChild = (eventTarget: EventTarget | null): boolean => {
        if (!(eventTarget instanceof Element)) return false;
        const action = eventTarget.closest<HTMLElement>(POPOVER_BODY_ACTION_SELECTOR);
        return Boolean(
            action
            && root.contains(action)
            && !action.matches(MINING_DRAWER_HANDLE_SELECTOR)
            && action.closest(MINING_DRAWER_POINTER_TARGET_SELECTOR),
        );
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

    const cleanup = (): void => {
        if (cleanedUp) return;
        cleanedUp = true;
        document.removeEventListener('click', handleClick, true);
        document.removeEventListener('pointerdown', handlePointerDown, true);
        document.removeEventListener('touchstart', handleTouchStart, true);
        miningDrag.cleanupListeners();
    };
    const rootIsConnected = (): boolean => {
        if (root.isConnected) return true;
        cleanup();
        return false;
    };
    const toggleHandle = (handle: HTMLButtonElement): void => {
        setExpanded(handle, handle.getAttribute('aria-expanded') !== 'true');
    };
    function handleClick(event: MouseEvent): void {
        if (!rootIsConnected()) return;
        if (isInteractiveGutterChild(event.target)) return;
        const handle = getHandleFromPointerEvent(event);
        if (!handle) return;
        event.preventDefault();
        event.stopPropagation();
        if (suppressNextHandleClick) {
            suppressNextHandleClick = false;
            return;
        }
        toggleHandle(handle);
    }
    function handlePointerDown(event: PointerEvent): void {
        if (!rootIsConnected()) return;
        if (isInteractiveGutterChild(event.target)) return;
        const handle = getHandleFromPointerEvent(event);
        if (!handle) return;
        miningDrag.pointerDown(handle, event);
    }
    function handleTouchStart(event: TouchEvent): void {
        if (!rootIsConnected()) return;
        if (isInteractiveGutterChild(event.target)) return;
        const handle = getHandleFromTouchEvent(event);
        if (!handle) return;
        miningDrag.touchStart(handle, event);
    }

    document.addEventListener('click', handleClick, true);
    document.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: false });
    document.addEventListener('touchstart', handleTouchStart, { capture: true, passive: false });
}

function eventHasPointTarget(event: MouseEvent | PointerEvent): boolean {
    return event.type !== 'click' || event.detail > 0 || event.clientX !== 0 || event.clientY !== 0;
}

export function shouldUseSheet(
    settings: ReaderSettings,
    trigger: LookupPopupTrigger = 'modal',
    viewport = lookupViewportSize(),
): boolean {
    const mode = trigger === 'hover' ? settings.hoverPopupMode : settings.popupMode;
    if (mode === 'sheet') return true;
    if (mode === 'popover') return false;
    const { width, height } = viewport;
    const popoverWidth = Math.max(0, settings.popoverWidth || 0);
    const requiredPopoverWidth = popoverWidth + AUTO_POPOVER_VIEWPORT_MARGIN_PX;
    if (width <= AUTO_SHEET_COMPACT_WIDTH_PX || width < requiredPopoverWidth) return true;
    if (height > 0 && height < AUTO_POPOVER_MIN_HEIGHT_PX) return true;
    return height > width && width <= AUTO_SHEET_PORTRAIT_MAX_WIDTH_PX;
}

function lookupViewportSize(): { width: number; height: number; pageScale: number } {
    const scaledViewport = overlayViewport();
    if (scaledViewport.pageScale > 1) {
        const bounds = overlayViewportBounds();
        return {
            width: Math.max(0, Math.round(bounds.width)),
            height: Math.max(0, Math.round(bounds.height)),
            pageScale: scaledViewport.pageScale,
        };
    }
    const visual = window.visualViewport;
    const width = Math.round(visual?.width ?? window.innerWidth ?? document.documentElement.clientWidth ?? 0);
    const height = Math.round(visual?.height ?? window.innerHeight ?? document.documentElement.clientHeight ?? 0);
    return { width: Math.max(0, width), height: Math.max(0, height), pageScale: 1 };
}

function fixedChromeViewportHeight(): number {
    const scaledViewport = overlayViewport();
    return scaledViewport.pageScale > 1
        ? Math.max(0, Math.round(overlayViewportBounds().height))
        : visualViewportHeight();
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

/**
 * The smallest a lookup sheet may be, as a share of the viewport.
 *
 * This read `Math.min(viewportHeight, MIN_SHEET_HEIGHT_PX, Math.max(140, 32%))`,
 * and the `MIN_SHEET_HEIGHT_PX` term in a `Math.min` capped the floor at 180px on
 * every screen — which silently deleted the whole 32% term it sits next to.
 * Measured on real viewport heights: iPad 1024 gave a 180px floor where 32% is
 * 328px, iPad Pro 1180 gave 180px against 378px. 180px is about the height of the
 * drag handle plus the grade buttons, so the sheet's grid
 * (`auto minmax(0, 1fr) auto`) crushed the card body to nothing and the reader saw
 * a strip of buttons with the sentence cut off — Canna's iPad report, 2026-07-31.
 *
 * 180px stays as the fallback for a viewport we cannot measure, which is the only
 * case it was ever right for.
 */
function sheetMinHeight(viewportHeight: number): number {
    if (viewportHeight <= 0) return MIN_SHEET_HEIGHT_PX;
    return Math.min(viewportHeight, Math.max(140, Math.round(viewportHeight * SHEET_MIN_HEIGHT_RATIO)));
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
    const stored = readHeightRatio(SHEET_HEIGHT_STORAGE_KEY, DEFAULT_SHEET_HEIGHT_RATIO);
    // Below the drag floor the value cannot have been produced by a real drag, so
    // it is a remembered bad measurement rather than a preference. Fall back
    // instead of honouring it, which repairs an install that already stored one.
    return stored < SHEET_MIN_HEIGHT_RATIO ? DEFAULT_SHEET_HEIGHT_RATIO : stored;
}

function storeSheetHeightRatio(height: number, viewportHeight: number): void {
    // Do not remember a ratio the drag floor would refuse. Writing one is how a
    // single bad viewport measurement became permanent.
    if (viewportHeight > 0 && height / viewportHeight < SHEET_MIN_HEIGHT_RATIO) return;
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

/**
 * Drop a DOCUMENT selection — page or article text the reader highlighted.
 *
 * A lookup opened from selected text leaves that text highlighted, which is right
 * while the popup is up (it is the popup's subject) and wrong the moment the popup
 * is dismissed: on touch the highlight comes with native selection handles and a
 * system callout, so "tapped away, popup gone, sentence still blue with grab handles
 * on it" reads as the dismissal having half-failed.
 *
 * A focused input/textarea keeps its OWN selection, which removeAllRanges does not
 * touch — and this deliberately does not reach for it. That selection is the
 * reader's editing state in a field they are working in (a compose box, Yomu's own
 * search input); the popup was a side trip, and collapsing their range would move
 * their caret and lose their place. See tests/reader/selection-preservation.test.ts.
 */
export function clearDocumentSelection(): void {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) selection.removeAllRanges();
}
