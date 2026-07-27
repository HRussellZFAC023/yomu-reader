import { localeDirection, localeFallbackChain } from '../languages/locale';
import type { TextDirection } from '../languages/types';
import { LEARNER_LANGUAGE_IDS } from '../locales/types';

// Every locale the interface can render in: the learner-language roster plus
// Japanese, which is the study target rather than a learner language and so is
// absent from the roster itself.
const UI_LOCALE_IDS = [...LEARNER_LANGUAGE_IDS, 'ja'] as const;

export type UiLocale = (typeof UI_LOCALE_IDS)[number];

export const UI_LOCALES: readonly UiLocale[] = Object.freeze(UI_LOCALE_IDS);

// The stored `interfaceLanguage` setting: any UI locale, or 'auto' to follow the
// browser's own language preferences.
const INTERFACE_LANGUAGE_IDS = ['auto', ...UI_LOCALE_IDS] as const;

export const INTERFACE_LANGUAGES: readonly ('auto' | UiLocale)[] = Object.freeze(INTERFACE_LANGUAGE_IDS);

// English is the only copy table guaranteed to hold every key, so it terminates
// every lookup chain and nothing else may be assumed complete.
export const BASE_UI_LOCALE: UiLocale = 'en';

const UI_LOCALE_SET: ReadonlySet<string> = new Set<string>(UI_LOCALE_IDS);

// Intl canonicalisation renames two roster ids on the way through (tl -> fil,
// sh -> sr-Latn), and the roster ships a single shared Serbo-Croatian entry, so
// map those spellings back onto the ids the catalogues are keyed by.
const UI_LOCALE_ALIASES: Readonly<Record<string, UiLocale>> = Object.freeze({
    fil: 'tl',
    sr: 'sh',
    hr: 'sh',
    bs: 'sh',
    cmn: 'zh',
});

export function isUiLocale(value: unknown): value is UiLocale {
    return typeof value === 'string' && UI_LOCALE_SET.has(value);
}

export function isInterfaceLanguage(value: unknown): value is 'auto' | UiLocale {
    return value === 'auto' || isUiLocale(value);
}

/**
 * Narrow an arbitrary language tag onto a supported UI locale, or null when
 * nothing in its fallback chain is supported. Region and script subtags are
 * dropped (`pt-BR` -> `pt`), so persisted or browser-supplied tags resolve
 * instead of silently reverting to English.
 */
export function matchUiLocale(value: unknown): UiLocale | null {
    if (isUiLocale(value)) return value;
    for (const tag of localeFallbackChain(value)) {
        const matched = uiLocaleForTag(tag);
        if (matched) return matched;
    }
    return null;
}

/**
 * Message lookup order for a stored setting: requested locale, then its base
 * language, then English. Callers walk the whole chain per key, so a locale
 * that has been only partly translated falls through key by key rather than
 * rendering an empty string or a raw message key.
 */
export function uiLocaleChain(language: unknown): readonly UiLocale[] {
    const chain: UiLocale[] = [];
    for (const requested of requestedLocales(language)) {
        const matched = matchUiLocale(requested);
        if (matched && !chain.includes(matched)) chain.push(matched);
    }
    if (!chain.includes(BASE_UI_LOCALE)) chain.push(BASE_UI_LOCALE);
    return chain;
}

/**
 * Translation tables for a message set, per locale, highest priority first. A
 * locale only lists the keys it has translated; anything it omits falls through
 * the chain, so no table other than the English one need ever be complete.
 */
export type LocaleOverlays<Key extends string> =
    Partial<Record<UiLocale, readonly Partial<Record<Key, string>>[]>>;

/**
 * Resolve one message against the locale chain, ending at the caller's complete
 * English string. Blank overlay entries count as untranslated, so a catalogue
 * that ships `""` for a key it has not finished degrades to English rather than
 * rendering nothing. The return value is never empty and is never the raw key.
 */
export function localizedMessage<Key extends string>(
    language: unknown,
    key: Key,
    overlays: LocaleOverlays<Key>,
    fallback: string,
): string {
    for (const locale of uiLocaleChain(language)) {
        for (const table of overlays[locale] ?? []) {
            const translated = table[key];
            if (translated) return translated;
        }
    }
    return fallback;
}

/** The locale the interface actually renders in, for `lang`/`Intl` consumers. */
export function resolveUiLocale(language: unknown): UiLocale {
    return uiLocaleChain(language)[0] ?? BASE_UI_LOCALE;
}

/** Writing direction of the resolved interface locale (Arabic and Persian are RTL). */
export function uiLocaleDirection(language: unknown): TextDirection {
    return localeDirection(resolveUiLocale(language));
}

function uiLocaleForTag(tag: string): UiLocale | null {
    const lower = tag.toLowerCase();
    if (UI_LOCALE_SET.has(lower)) return lower as UiLocale;
    const alias = UI_LOCALE_ALIASES[lower];
    if (alias) return alias;
    const base = lower.split('-')[0] ?? '';
    if (UI_LOCALE_SET.has(base)) return base as UiLocale;
    return UI_LOCALE_ALIASES[base] ?? null;
}

function requestedLocales(language: unknown): readonly string[] {
    if (typeof language !== 'string' || !language || language === 'auto') return browserUiLocales();
    return [language];
}

function browserUiLocales(): readonly string[] {
    if (typeof navigator === 'undefined') return [];
    const preferences = Array.isArray(navigator.languages) ? navigator.languages : [];
    return [...preferences, navigator.language].filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
    );
}
