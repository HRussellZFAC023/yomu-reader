/** The rendered ancestry of a node, including slotted and shadow-root content. */
export function composedAncestorElement(element: HTMLElement): HTMLElement | null {
    if (element.assignedSlot) return element.assignedSlot;
    if (element.parentElement) return element.parentElement;
    const root = element.getRootNode();
    return typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot && root.host instanceof HTMLElement ? root.host : null;
}

type PointHitRoot = { elementsFromPoint?: (x: number, y: number) => Element[] };

/** The document hit stack, with each open shadow root's own hits placed before
 * its host. A document-level stack stops at the host, so text inside a web
 * component is otherwise never under the pointer. */
export function composedElementsFromPoint(document: Document, x: number, y: number): Element[] {
    const hits: Element[] = [];
    const visit = (root: Document | ShadowRoot, seen: Set<Node>): void => {
        if (seen.has(root)) return;
        seen.add(root);
        const stack = (root as PointHitRoot).elementsFromPoint?.(x, y) ?? [];
        for (const hit of stack) {
            if (root !== document && hit.getRootNode() !== root) continue;
            if (hit.shadowRoot) visit(hit.shadowRoot, seen);
            hits.push(hit);
        }
    };
    visit(document, new Set());
    return hits;
}

export function composedClosestElement<T extends HTMLElement = HTMLElement>(element: Element, selector: string): T | null {
    let current: Element | null = element;
    while (current) {
        if (current.matches(selector)) return current as T;
        current = current instanceof HTMLElement ? composedAncestorElement(current) : current.parentElement;
    }
    return null;
}

/** Page-owned paint can ride the document compositor unless an ancestor pins or
 * independently scrolls it, or the document root changes absolute coordinates. */
export function sourceSharesDocumentScroll(source: HTMLElement): boolean {
    const document = source.ownerDocument;
    for (let element: HTMLElement | null = source; element; element = composedAncestorElement(element)) {
        const style = getComputedStyle(element);
        if (element === document.body || element === document.documentElement) {
            if (style.position && style.position !== 'static') return false;
            if (['transform', 'filter', 'backdrop-filter', 'perspective'].some(property => {
                const value = style.getPropertyValue(property);
                return value && value !== 'none';
            })) return false;
            if (/transform|filter|perspective/.test(style.willChange) || /layout|paint|strict|content/.test(style.contain)) return false;
        } else if (['fixed', 'sticky'].includes(style.position)
            || [style.overflowX, style.overflowY].some(value => /^(auto|scroll|overlay)$/.test(value))) return false;
    }
    return true;
}
