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
