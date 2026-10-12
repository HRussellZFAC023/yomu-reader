import { setImportantStyleIfChanged } from './inline-style';

/** Copy the page's reading typography and return the complete width-cache key. */
export function syncProjectedReadingTypography(source: HTMLElement, clone: HTMLElement, readStyle: (element: HTMLElement) => CSSStyleDeclaration): string {
    const sourceStyle = readStyle(source);
    const base = source.closest<HTMLElement>('.jpdb-reader-word') ?? source;
    const baseStyle = readStyle(base);
    const text = source.textContent ?? '';
    if (clone.textContent !== text) clone.textContent = text;
    const expression = base.dataset.expression ?? base.dataset.surface ?? '';
    if (clone.dataset.yomuExpression !== expression) clone.dataset.yomuExpression = expression;
    const typography = {
        'font-family':sourceStyle.fontFamily || baseStyle.fontFamily,
        'font-size':sourceStyle.fontSize || '10px',
        'font-style':sourceStyle.fontStyle || baseStyle.fontStyle,
        'font-weight':sourceStyle.fontWeight || '400',
        // Page tracking belongs to the base glyphs, not the compact reading.
        'letter-spacing':'normal',
    };
    for (const [property, value] of Object.entries(typography)) setImportantStyleIfChanged(clone, property, value);
    setImportantStyleIfChanged(clone, 'color', sourceStyle.color || baseStyle.color || 'currentColor');
    setImportantStyleIfChanged(clone, 'text-shadow', baseStyle.textShadow || 'none');
    return [text, ...Object.values(typography)].join('\u0000');
}
