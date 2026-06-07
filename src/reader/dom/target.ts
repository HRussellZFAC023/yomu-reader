export function eventTargetElement(target: EventTarget | null): HTMLElement | null {
    if (target instanceof HTMLElement) return target;
    if (target instanceof Element) return closestHtmlAncestor(target);
    if (target instanceof Text) return target.parentElement;
    return null;
}

function closestHtmlAncestor(element: Element): HTMLElement | null {
    let current: Element | null = element;
    while (current) {
        if (current instanceof HTMLElement) return current;
        current = current.parentElement;
    }
    return null;
}
