// Toast redesign (Jiten v1.2.x parity): toasts stack instead of overlapping,
// repeated messages refresh the existing toast's timer instead of
// duplicating, and entrance/exit animate (CSS honors prefers-reduced-motion).
import { applyOverlayPageScale } from './page-scale';

const TOAST_STACK_CLASS = 'jpdb-reader-toast-stack';
const TOAST_VISIBLE_CLASS = 'is-visible';
const TOAST_EXIT_MS = 220;

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
    const existing = Array.from(stack.children)
        .find((node): node is HTMLElement => node instanceof HTMLElement && node.textContent === message);
    if (existing) {
        // Shown again while it was leaving: it stays instead.
        window.clearTimeout(toastTimers.get(existing));
        toastTimers.delete(existing);
        existing.classList.add(TOAST_VISIBLE_CLASS);
        return existing;
    }
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
    return stack;
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
