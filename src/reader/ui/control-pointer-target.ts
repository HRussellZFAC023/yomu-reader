const CONTROL_POINTER_ACTIVATION_SELECTOR = [
    'button',
    'a[href]',
    'summary',
    '[role="button"]',
    '[role="checkbox"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[role="radio"]',
    '[role="switch"]',
    '[role="tab"]',
    '[data-action]',
    '[data-token-choice]',
].join(',');

/**
 * Find the nearest actionable HTML owner without treating page-authored SVG
 * attributes as control authority. `Element.closest<HTMLElement>()` is only a
 * TypeScript assertion: it can still return an SVG element at runtime.
 */
export function closestReaderControlElement(target: EventTarget | null): HTMLElement | null {
    return closestHtmlElementMatching(target, CONTROL_POINTER_ACTIVATION_SELECTOR);
}

export function closestHtmlElementMatching(target: EventTarget | null, selector: string): HTMLElement | null {
    let element = target instanceof Element ? target : null;
    while (element) {
        if (element instanceof HTMLElement && element.matches(selector)) return element;
        element = element.parentElement;
    }
    return null;
}

export function readerControlIsDisabled(control: HTMLElement): boolean {
    if (control.closest('[aria-disabled="true"]')) return true;
    return control.matches(':disabled, fieldset[disabled] *');
}
