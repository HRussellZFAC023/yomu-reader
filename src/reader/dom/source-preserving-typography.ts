import { setInlineStyleIfChanged } from './inline-style';

const FONT_PROPERTIES = ['font-family', 'font-size', 'font-style', 'font-weight', 'font-stretch', 'font-variant',
    'font-feature-settings', 'font-kerning', 'letter-spacing', 'word-spacing'];
const INLINE_PRESENTATION_PROPERTIES = [...FONT_PROPERTIES, 'line-height', 'color', 'direction', 'writing-mode'];

/** Splitting a proportional Japanese shaping run into inline word/ruby boxes
 * changes WebKit's glyph advances even when every font property is inherited.
 * Keep that text intact and project annotations from its native Ranges. */
export function typographyRequiresSourceProjection(style: Pick<CSSStyleDeclaration, 'fontFeatureSettings'>): boolean {
    let enabled = false;
    for (const match of (style.fontFeatureSettings || 'normal').matchAll(/["']palt["'](?:\s+(on|off|\d+))?/gu)) {
        const value = match[1];
        enabled = value === undefined || value === 'on' || Number(value) > 0;
    }
    return enabled;
}

/** Uniform inline markup can share one shaping source. A different font or
 * ink owner needs its own mirror so readings retain that source presentation. */
export function sameSourcePresentation(first: CSSStyleDeclaration, second: CSSStyleDeclaration): boolean {
    return INLINE_PRESENTATION_PROPERTIES.every(property => first.getPropertyValue(property) === second.getPropertyValue(property));
}

/** Font shorthands serialize empty with nondefault features. Copy the source
 * longhands so host span rules cannot substitute a font in a mirror. */
export function copySourceTypography(element: HTMLElement, style: CSSStyleDeclaration, priority = ''): void {
    FONT_PROPERTIES.forEach(property => setInlineStyleIfChanged(element, property, style.getPropertyValue(property), priority));
}
