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

const CSS_PIXEL_SIGNIFICANT_DIGITS = 6;
const CSS_PIXEL_MINIMUM = 0.000001;

/**
 * Serialize live geometry once, at the precision browsers preserve in CSSOM.
 *
 * Client rect arithmetic commonly produces values such as
 * `16.666666666666668`. Blink/WebKit store those as `16.6667px` /
 * `16.666667px`; comparing the next raw string with the stored declaration
 * therefore calls `setProperty` again even though the visual value is
 * unchanged. Six significant digits is sub-pixel accurate by several orders
 * of magnitude while remaining stable in both engines. Invalid and sub-micro
 * geometry is layout noise, never a useful CSS coordinate.
 */
export function stableCssPixels(value: number): string {
    if (!Number.isFinite(value) || Math.abs(value) < CSS_PIXEL_MINIMUM) return '0px';
    const magnitude = Math.floor(Math.log10(Math.abs(value)));
    const decimalPlaces = Math.max(0, Math.min(12, CSS_PIXEL_SIGNIFICANT_DIGITS - magnitude - 1));
    const rounded = Number(value.toFixed(decimalPlaces));
    return `${Object.is(rounded, -0) ? 0 : rounded}px`;
}
