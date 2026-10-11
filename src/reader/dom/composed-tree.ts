/** The rendered ancestry of a node, including slotted and shadow-root content. */
export function composedAncestorElement(element: HTMLElement): HTMLElement | null {
    if (element.assignedSlot) return element.assignedSlot;
    if (element.parentElement) return element.parentElement;
    const root = element.getRootNode();
    return typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot && root.host instanceof HTMLElement ? root.host : null;
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
