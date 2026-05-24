const STORED_TITLE_ATTRIBUTE = 'data-jpdb-reader-native-title';

export class NativeTitleGuard {
    private readonly suppressed = new Map<HTMLElement, string>();
    private observer?: MutationObserver;

    suppressForPopover(popover: HTMLElement, anchor?: HTMLElement): void {
        this.restore();
        this.suppressRelatedTitles(popover, anchor);
        this.observePopover(popover, anchor);
    }

    refresh(popover: HTMLElement, anchor?: HTMLElement): void {
        this.suppressRelatedTitles(popover, anchor);
    }

    restore(): void {
        this.observer?.disconnect();
        this.observer = undefined;
        for (const [element, title] of this.suppressed) {
            if (element.isConnected || element.hasAttribute(STORED_TITLE_ATTRIBUTE)) {
                element.setAttribute('title', title);
                element.removeAttribute(STORED_TITLE_ATTRIBUTE);
            }
        }
        this.suppressed.clear();
    }

    private suppressRelatedTitles(popover: HTMLElement, anchor?: HTMLElement): void {
        this.suppressElementAndDescendants(popover);
        this.suppressElementAncestors(anchor);
        this.suppressHoveredTitles(popover);
    }

    private observePopover(popover: HTMLElement, anchor?: HTMLElement): void {
        if (typeof MutationObserver === 'undefined') return;
        this.observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement) {
                    this.suppressElement(mutation.target);
                }
                mutation.addedNodes.forEach(node => this.suppressNodeTitles(node));
            }
            this.suppressElementAncestors(anchor);
        });
        this.observer.observe(popover, {
            attributes: true,
            attributeFilter: ['title'],
            childList: true,
            subtree: true,
        });
    }

    private suppressNodeTitles(node: Node): void {
        if (node instanceof HTMLElement) this.suppressElementAndDescendants(node);
    }

    private suppressElementAndDescendants(element: HTMLElement): void {
        this.suppressElement(element);
        element.querySelectorAll<HTMLElement>('[title]').forEach(item => this.suppressElement(item));
    }

    private suppressElementAncestors(element: HTMLElement | undefined): void {
        let current: HTMLElement | null | undefined = element;
        while (current && current !== document.body && current !== document.documentElement) {
            this.suppressElement(current);
            current = current.parentElement;
        }
    }

    private suppressHoveredTitles(popover: HTMLElement): void {
        try {
            document.querySelectorAll<HTMLElement>(':hover[title]').forEach(element => {
                if (!popover.contains(element)) this.suppressElement(element);
            });
        } catch {
            // Some userscript host pages have selector shims that reject dynamic pseudo-classes.
        }
    }

    private suppressElement(element: HTMLElement): void {
        if (element.closest('.jpdb-reader-modal-nav')) return;
        if (!element.hasAttribute('title')) return;
        const title = element.getAttribute('title') ?? '';
        this.suppressed.set(element, title);
        element.setAttribute(STORED_TITLE_ATTRIBUTE, title);
        element.removeAttribute('title');
    }
}
