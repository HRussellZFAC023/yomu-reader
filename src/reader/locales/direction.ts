import { ENGLISH_INTERFACE_LOCALE, interfaceLocaleByTag, type InterfaceLocale } from './manifest';
import type { TextDirection } from './types';

/**
 * D43 — the RTL platform.
 *
 * Before this, Yomu set `dir` in exactly four places, all of them about the
 * OUTPUT language of a definition. The interface itself had no direction at all,
 * which is why Arabic and Farsi are shipped DISABLED: the chrome would have
 * rendered left-to-right with Arabic words in it.
 *
 * ### Two deliberate deviations from the plan's wording
 *
 * The plan says "set `lang` and `dir` on the document". Yomu is injected into
 * pages it does not own, so stamping `document.documentElement` would flip the
 * direction of the article a learner is reading. `applyInterfaceLocaleToRoot` is
 * therefore applied to reader-owned roots only — popover, settings dialog, bottom
 * sheet, backdrop, HUD, FAB — including reader roots the app finds inside a
 * page's shadow tree, whose *host* is deliberately left alone even though
 * direction would inherit from it. `applyInterfaceLocaleToDocument` covers the
 * surfaces Yomu *does* own: the new tab, the study app and the hosted docs.
 *
 * Physical coordinates are kept on purpose in the geometry and anchor algorithm.
 * A popover is placed against a viewport in screen pixels; that maths is not
 * direction-dependent and rewriting it in logical terms would break anchoring
 * for both directions. Logical properties belong in the *layout* of shared
 * chrome, which is what the CSS sweep converts.
 */

export const READER_INTERFACE_DIR_ATTRIBUTE = 'data-yomu-interface-dir';
export const READER_INTERFACE_LOCALE_ATTRIBUTE = 'data-yomu-interface-locale';

/** Unicode isolate controls, for plain-text contexts that cannot hold markup. */
const FIRST_STRONG_ISOLATE = '⁨';
const POP_DIRECTIONAL_ISOLATE = '⁩';

function interfaceDirectionOf(tag: string): TextDirection {
    return (interfaceLocaleByTag(tag) ?? ENGLISH_INTERFACE_LOCALE).direction;
}

export function isRtlInterface(tag: string): boolean {
    return interfaceDirectionOf(tag) === 'rtl';
}

interface DirectionTargetElement {
    setAttribute(name: string, value: string): void;
    style?: { setProperty(property: string, value: string): void };
}

/**
 * Stamp one reader-owned element with the interface locale.
 *
 * Four things, all needed: `lang` so the correct font and hyphenation apply and
 * assistive technology announces in the right voice; `dir` so inline layout
 * flips; a data attribute so CSS can select on the interface direction without
 * fighting the page's own `dir`; and the per-script interface font stack as a
 * custom property, so chrome typography follows the locale while reader and
 * subtitle fonts stay under the learner's own settings.
 */
export function applyInterfaceLocaleToRoot(
    root: DirectionTargetElement | null | undefined,
    locale: InterfaceLocale,
): void {
    if (!root) return;
    root.setAttribute('lang', locale.tag);
    root.setAttribute('dir', locale.direction);
    root.setAttribute(READER_INTERFACE_DIR_ATTRIBUTE, locale.direction);
    root.setAttribute(READER_INTERFACE_LOCALE_ATTRIBUTE, locale.tag);
    root.style?.setProperty('--jpdb-reader-interface-font', locale.fontStack);
}

/** For documents Yomu owns outright: the new tab, the study app, hosted docs. */
export function applyInterfaceLocaleToDocument(
    doc: Document | null | undefined,
    locale: InterfaceLocale,
): void {
    const root = doc?.documentElement;
    if (!root) return;
    applyInterfaceLocaleToRoot(root, locale);
}

/**
 * Wrap a substituted value for a plain-text message — an `aria-label`, a
 * `title`, a toast built by string concatenation, a `<select>` option label.
 * FSI/PDI is the only isolation available where markup is not, and it is what
 * the 32 machine-draft catalogues already use around `{language}` and `{size}`.
 */
export function isolate(value: string): string {
    if (!value) return value;
    return `${FIRST_STRONG_ISOLATE}${value}${POP_DIRECTIONAL_ISOLATE}`;
}

/**
 * Substitute placeholders into a message with every value bidi-isolated.
 *
 * This is the only substitution path shared chrome should use once a locale can
 * be RTL: `formatUiText`-style raw `replaceAll` is safe in English and Japanese
 * and silently wrong in Arabic.
 */
export function formatIsolated(
    message: string,
    values: Readonly<Record<string, string | number>>,
): string {
    return Object.entries(values).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, isolate(String(value))),
        message,
    );
}
