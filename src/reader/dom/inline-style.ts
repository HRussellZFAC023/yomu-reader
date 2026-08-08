/**
 * Apply an important inline style without emitting a redundant style mutation.
 * Projection layers call this in animation-frame hot paths, where an unchanged
 * write would otherwise wake the reader's document observers again.
 */
export function setImportantStyleIfChanged(
    element: HTMLElement,
    property: string,
    value: string,
): void {
    if (element.style.getPropertyValue(property) === value
        && element.style.getPropertyPriority(property) === 'important') return;
    element.style.setProperty(property, value, 'important');
}
