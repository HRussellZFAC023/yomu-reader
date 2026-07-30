const FOCUSABLE_SELECTOR = 'button,input,select,textarea,a[href],summary,audio[controls],video[controls],[contenteditable],[tabindex]:not([tabindex^="-"])';

export class LookupModalAccessibility {
    private dialog?: HTMLElement;
    private returnTo?: HTMLElement;
    private hidden: Array<[HTMLElement, string | null]> = [];

    activate(root: HTMLElement, trigger?: HTMLElement): void {
        const active = document.activeElement;
        const restoreTarget = this.returnTo?.isConnected
            ? this.returnTo
            : trigger?.isConnected
                ? trigger
                : active instanceof HTMLElement && !root.contains(active) ? active : undefined;
        this.release(true);
        this.dialog = root;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        this.returnTo = restoreTarget;
        this.hidden = hideBackground(root);
        root.addEventListener('keydown', this.handleKeydown);
    }

    release(preserveRestoreTarget = false): boolean {
        this.dialog?.removeEventListener('keydown', this.handleKeydown);
        this.dialog = undefined;
        for (const [element, ariaHidden] of this.hidden) {
            if (ariaHidden === null) element.removeAttribute('aria-hidden');
            else element.setAttribute('aria-hidden', ariaHidden);
        }
        this.hidden = [];
        if (preserveRestoreTarget) return false;
        const restoreTarget = this.returnTo?.isConnected ? this.returnTo : undefined;
        this.returnTo = undefined;
        restoreTarget?.focus({ preventScroll: true });
        return Boolean(restoreTarget);
    }

    private readonly handleKeydown = (event: KeyboardEvent): void => {
        if (event.key !== 'Tab' || event.isComposing || !this.dialog) return;
        const focusable = Array.from(this.dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
            .filter(element => (
            !element.closest('[hidden]')
            && !element.closest('[aria-hidden="true"]')
            && element.tabIndex >= 0
        ))
            .sort((left, right) => (left.tabIndex || Infinity) - (right.tabIndex || Infinity));
        const destination = event.shiftKey ? focusable.at(-1) : focusable[0];
        const edge = event.shiftKey ? focusable[0] : focusable.at(-1);
        if (document.activeElement !== edge
            && document.activeElement !== this.dialog
            && this.dialog.contains(document.activeElement)) return;
        event.preventDefault();
        (destination ?? this.dialog).focus();
    };
}

function hideBackground(root: HTMLElement): Array<[HTMLElement, string | null]> {
    const hidden: Array<[HTMLElement, string | null]> = [];
    let branch: HTMLElement = root;
    while (branch.parentElement) {
        const parent = branch.parentElement;
        for (const sibling of Array.from(parent.children)) {
            if (!(sibling instanceof HTMLElement) || sibling === branch) continue;
            hidden.push([sibling, sibling.getAttribute('aria-hidden')]);
            sibling.setAttribute('aria-hidden', 'true');
        }
        if (parent === document.body) break;
        branch = parent;
    }
    return hidden;
}
