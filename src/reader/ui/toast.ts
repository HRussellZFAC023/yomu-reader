// Toast redesign (Jiten v1.2.x parity): toasts stack instead of overlapping,
// repeated messages refresh the existing toast's timer instead of
// duplicating, and entrance/exit animate (CSS honors prefers-reduced-motion).
import { applyOverlayPageScale } from './page-scale';

const TOAST_STACK_CLASS = 'jpdb-reader-toast-stack';
const TOAST_VISIBLE_CLASS = 'is-visible';
const TOAST_EXIT_MS = 220;
// Yomu's own bottom rows whose controls a toast must never cover: the Settings
// footer (Cancel, Save), Study's tab bar, and a lookup popup's or sheet's action
// footer, which on Desktop is often low over the capture. A toast that would
// cover one of a row's controls rises above the whole row; one that sits in a
// row's empty middle stays where it is.
const TOAST_CLEARANCE_ROWS = '.jpdb-reader-settings > .footer, .jpdb-reader-newtab-app-nav, .jpdb-reader-popover .jpdb-reader-actions';
const TOAST_CLEARANCE_CONTROLS = 'button, a[href], select, input, [role="button"]';
const TOAST_CLEARANCE_GAP_PX = 8;
// The centred stack is at most this wide and sits this far above the bottom
// edge (settings.css .jpdb-reader-toast-stack); a toast is about this tall.
const TOAST_MAX_WIDTH_PX = 520;
const TOAST_EDGE_OFFSET_PX = 18;
const TOAST_NOMINAL_HEIGHT_PX = 40;

// A toast's pending timer, whether it is still showing or already leaving.
const toastTimers = new WeakMap<HTMLElement, number>();
const toastHolds = new WeakMap<HTMLElement, number>();

export function showReaderToast(message: string, durationMs = 3200): void {
    const toast = readerToast(message);
    if (!toastHolds.has(toast)) scheduleToastRemoval(toast, durationMs);
}

/**
 * A status that stays until every holder has called its release, then leaves
 * like any toast. Holders of one message share its toast.
 */
export function holdReaderToast(message: string): () => void {
    const toast = readerToast(message);
    toastHolds.set(toast, (toastHolds.get(toast) ?? 0) + 1);
    let held = true;
    return () => {
        if (!held) return;
        held = false;
        const holds = (toastHolds.get(toast) ?? 1) - 1;
        if (holds > 0) {
            toastHolds.set(toast, holds);
            return;
        }
        toastHolds.delete(toast);
        scheduleToastRemoval(toast, 0);
    };
}

function readerToast(message: string): HTMLElement {
    const stack = ensureReaderToastStack();
    const toast = refreshedToast(stack, message) ?? appendedToast(stack, message);
    clearBottomControls(stack);
    return toast;
}

function refreshedToast(stack: HTMLElement, message: string): HTMLElement | undefined {
    const existing = Array.from(stack.children)
        .find((node): node is HTMLElement => node instanceof HTMLElement && node.textContent === message);
    if (!existing) return undefined;
    // Shown again while it was leaving: it stays instead.
    window.clearTimeout(toastTimers.get(existing));
    toastTimers.delete(existing);
    existing.classList.add(TOAST_VISIBLE_CLASS);
    return existing;
}

function appendedToast(stack: HTMLElement, message: string): HTMLElement {
    const toast = document.createElement('div');
    toast.className = 'jpdb-reader-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = message;
    stack.append(toast);
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => toast.classList.add(TOAST_VISIBLE_CLASS));
    } else {
        toast.classList.add(TOAST_VISIBLE_CLASS);
    }
    return toast;
}

function ensureReaderToastStack(): HTMLElement {
    const existing = document.querySelector<HTMLElement>(`.${TOAST_STACK_CLASS}`);
    if (existing?.isConnected) {
        applyOverlayPageScale(existing);
        return existing;
    }
    const stack = document.createElement('div');
    stack.className = TOAST_STACK_CLASS;
    stack.dataset.jpdbReaderRoot = 'true';
    applyOverlayPageScale(stack);
    document.body.append(stack);
    followClearanceRows(stack);
    return stack;
}

// A row the stack rose above can leave while its toast still shows: the popup
// closes on Escape, Settings closes under a held status. The stack then settles
// back to the edge, and rises again if a row arrives under it. It watches only
// while it exists, and only rows coming and going.
function followClearanceRows(stack: HTMLElement): void {
    if (typeof MutationObserver !== 'function') return;
    const observer = new MutationObserver(records => {
        if (!stack.isConnected) {
            observer.disconnect();
            return;
        }
        if (records.some(movesClearanceRow)) clearBottomControls(stack);
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

function movesClearanceRow(record: MutationRecord): boolean {
    return [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element
        && (node.matches(TOAST_CLEARANCE_ROWS) || Boolean(node.querySelector(TOAST_CLEARANCE_ROWS))));
}

/** Lifts the stack above any of those rows whose controls reach the place it shows at the bottom edge. */
function clearBottomControls(stack: HTMLElement): void {
    const band = toastBand(stack);
    let clearance = 0;
    for (const row of document.querySelectorAll<HTMLElement>(TOAST_CLEARANCE_ROWS)) {
        const controls = Array.from(row.querySelectorAll<HTMLElement>(TOAST_CLEARANCE_CONTROLS));
        if (!controls.some(control => coversToastBand(control.getBoundingClientRect(), band))) continue;
        clearance = Math.max(clearance, window.innerHeight - row.getBoundingClientRect().top + TOAST_CLEARANCE_GAP_PX);
    }
    // A page-scale adapter zooms the stack; its offsets are in zoomed pixels.
    const zoom = Number(stack.dataset.jpdbReaderScaleCompensation) || 1;
    if (clearance) stack.style.setProperty('--jpdb-reader-toast-clearance', `${Math.ceil(clearance / zoom)}px`);
    else stack.style.removeProperty('--jpdb-reader-toast-clearance');
}

function coversToastBand(rect: DOMRect, band: ToastBand): boolean {
    return rect.width > 0 && rect.height > 0 && rect.bottom > band.top && rect.top < window.innerHeight
        && rect.right > band.left && rect.left < band.right;
}

interface ToastBand { readonly left: number; readonly right: number; readonly top: number }

// Where the stack shows at the bottom edge with the toasts it now holds; before
// layout, the widest a toast can be. A popup footer beside a short toast, or
// one that ends above it, stays clear and the toast stays at the edge.
function toastBand(stack: HTMLElement): ToastBand {
    const rect = stack.getBoundingClientRect();
    const height = rect.height > 0 ? rect.height : TOAST_NOMINAL_HEIGHT_PX;
    const top = window.innerHeight - TOAST_EDGE_OFFSET_PX - height - TOAST_CLEARANCE_GAP_PX;
    if (rect.width > 0) return { left: rect.left - TOAST_CLEARANCE_GAP_PX, right: rect.right + TOAST_CLEARANCE_GAP_PX, top };
    const left = (window.innerWidth - Math.min(TOAST_MAX_WIDTH_PX, window.innerWidth)) / 2;
    return { left, right: window.innerWidth - left, top };
}

function scheduleToastRemoval(toast: HTMLElement, durationMs: number): void {
    window.clearTimeout(toastTimers.get(toast));
    toastTimers.set(toast, window.setTimeout(() => {
        toast.classList.remove(TOAST_VISIBLE_CLASS);
        toastTimers.set(toast, window.setTimeout(() => {
            toastTimers.delete(toast);
            toast.remove();
            // The toast can outlive its document (page teardown, test env teardown),
            // so guard the DOM access to avoid an unhandled "document is not defined".
            if (typeof document === 'undefined') return;
            const stack = document.querySelector<HTMLElement>(`.${TOAST_STACK_CLASS}`);
            if (stack && !stack.childElementCount) stack.remove();
        }, TOAST_EXIT_MS));
    }, durationMs));
}
