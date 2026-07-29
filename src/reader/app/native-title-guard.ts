const STORED_TITLE_ATTRIBUTE = 'data-jpdb-reader-native-title';

export class NativeTitleGuard {
    private readonly suppressed = new Map<HTMLElement, string>();
    private observer?: MutationObserver;

    suppressForPopover(popover: HTMLElement, anchor?: HTMLElement): void {
        this.restore();
        this.suppressRelatedTitles(popover, anchor);
        this.observePopover(popover, anchor);
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
        this.suppressAnchorTitlePath(anchor);
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
            this.suppressAnchorTitlePath(anchor);
        });
        this.observer.observe(popover, {
            attributes: true,
            attributeFilter: ['title'],
            childList: true,
            subtree: true,
        });
        this.observeAnchorTitlePath(anchor);
    }

    private suppressNodeTitles(node: Node): void {
        if (node instanceof HTMLElement) this.suppressElementAndDescendants(node);
    }

    private suppressElementAndDescendants(element: HTMLElement): void {
        this.suppressElement(element);
        element.querySelectorAll<HTMLElement>('[title]').forEach(item => this.suppressElement(item));
    }

    private suppressAnchorTitlePath(anchor: HTMLElement | undefined): void {
        if (!anchor) return;
        for (const element of this.anchorTitlePath(anchor)) this.suppressElement(element);
    }

    private observeAnchorTitlePath(anchor: HTMLElement | undefined): void {
        if (!this.observer || !anchor) return;
        for (const element of this.anchorTitlePath(anchor)) {
            this.observer.observe(element, {
                attributes: true,
                attributeFilter: ['title'],
            });
        }
    }

    private anchorTitlePath(anchor: HTMLElement): HTMLElement[] {
        const path: HTMLElement[] = [];
        let current: HTMLElement | null = anchor;
        while (current) {
            path.push(current);
            if (current === document.body || current === document.documentElement) break;
            current = this.nextTitleAncestor(current);
        }
        return path;
    }

    private nextTitleAncestor(element: HTMLElement): HTMLElement | null {
        if (element.parentElement) return element.parentElement;
        const root = element.getRootNode();
        return typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot && root.host instanceof HTMLElement
            ? root.host
            : null;
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
