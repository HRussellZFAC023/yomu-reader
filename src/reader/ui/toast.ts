// Toast redesign (Jiten v1.2.x parity): toasts stack instead of overlapping,
// repeated messages refresh the existing toast's timer instead of
// duplicating, and entrance/exit animate (CSS honors prefers-reduced-motion).
const TOAST_STACK_CLASS = 'jpdb-reader-toast-stack';
const TOAST_VISIBLE_CLASS = 'is-visible';
const TOAST_EXIT_MS = 220;

const toastTimers = new WeakMap<HTMLElement, number>();

export function showReaderToast(message: string, durationMs = 3200): void {
    const stack = ensureReaderToastStack();
    const existing = Array.from(stack.children)
        .find((node): node is HTMLElement => node instanceof HTMLElement && node.textContent === message);
    if (existing) {
        scheduleToastRemoval(existing, durationMs);
        return;
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
    scheduleToastRemoval(toast, durationMs);
}

function ensureReaderToastStack(): HTMLElement {
    const existing = document.querySelector<HTMLElement>(`.${TOAST_STACK_CLASS}`);
    if (existing?.isConnected) return existing;
    const stack = document.createElement('div');
    stack.className = TOAST_STACK_CLASS;
    stack.dataset.jpdbReaderRoot = 'true';
    document.body.append(stack);
    return stack;
}

function scheduleToastRemoval(toast: HTMLElement, durationMs: number): void {
    const pending = toastTimers.get(toast);
    if (pending !== undefined) window.clearTimeout(pending);
    toastTimers.set(toast, window.setTimeout(() => {
        toast.classList.remove(TOAST_VISIBLE_CLASS);
        window.setTimeout(() => {
            toast.remove();
            const stack = document.querySelector<HTMLElement>(`.${TOAST_STACK_CLASS}`);
            if (stack && !stack.childElementCount) stack.remove();
        }, TOAST_EXIT_MS);
    }, durationMs));
}
