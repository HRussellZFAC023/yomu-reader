import type { LanguageTag, TextDirection } from './types';

const RTL_SCRIPTS = new Set([
    'Adlm',
    'Arab',
    'Hebr',
    'Nkoo',
    'Rohg',
    'Syrc',
    'Thaa',
]);

const RTL_LANGUAGES = new Set([
    'ar',
    'dv',
    'fa',
    'he',
    'ku',
    'ps',
    'ur',
    'yi',
]);

/**
 * Accepts browser-friendly underscore aliases at the input seam, but always
 * returns the canonical BCP-47 spelling used by profiles, manifests and caches.
 */
export function canonicalLanguageTag(value: unknown): LanguageTag | null {
    if (typeof value !== 'string') return null;
    const candidate = value.trim().replace(/_/g, '-');
    if (!candidate || candidate.length > 255) return null;
    try {
        return Intl.getCanonicalLocales(candidate)[0] ?? null;
    } catch {
        return null;
    }
}

export function languageSubtag(value: unknown): string | null {
    const canonical = canonicalLanguageTag(value);
    if (!canonical) return null;
    try {
        return new Intl.Locale(canonical).language;
    } catch {
        return canonical.split('-')[0]?.toLowerCase() ?? null;
    }
}

/**
 * A language's name, written in `locale`. The one implementation: the
 * dictionary shelves and the catalogue browser each carried their own private
 * copy of this try/catch, and a third caller would have made three.
 *
 * `Intl.DisplayNames` throws on an unusable tag and returns undefined for one
 * it has no name for, so both degrade to the tag itself — a label that is still
 * readable rather than an empty string in the middle of a sentence.
 */
export function languageDisplayName(language: string, locale = 'en'): string {
    try {
        return new Intl.DisplayNames([locale], { type: 'language' }).of(language) ?? language;
    } catch {
        return language;
    }
}

export function localeDirection(value: unknown): TextDirection {
    const canonical = canonicalLanguageTag(value);
    if (!canonical) return 'ltr';
    try {
        const locale = new Intl.Locale(canonical);
        const script = locale.script || locale.maximize().script;
        if (script && RTL_SCRIPTS.has(script)) return 'rtl';
        return RTL_LANGUAGES.has(locale.language) ? 'rtl' : 'ltr';
    } catch {
        return RTL_LANGUAGES.has(canonical.split('-')[0]?.toLowerCase() ?? '') ? 'rtl' : 'ltr';
    }
}

/**
 * Most-specific to least-specific locale lookup chain. Unicode/private
 * extensions are deliberately excluded from catalogue and message lookup.
 */
export function localeFallbackChain(value: unknown): LanguageTag[] {
    const canonical = canonicalLanguageTag(value);
    if (!canonical) return [];
    try {
        const locale = new Intl.Locale(canonical);
        const chain = [locale.baseName];
        if (locale.script) chain.push(`${locale.language}-${locale.script}`);
        chain.push(locale.language);
        return uniqueCanonicalTags(chain);
    } catch {
        return [canonical];
    }
}

export function resolveSupportedLocale(
    requested: unknown,
    supported: readonly string[],
    fallback: string,
): LanguageTag {
    const supportedByCanonical = new Map(
        supported
            .map(tag => [canonicalLanguageTag(tag), tag] as const)
            .filter((entry): entry is readonly [string, string] => Boolean(entry[0])),
    );
    for (const candidate of localeFallbackChain(requested)) {
        const match = supportedByCanonical.get(candidate);
        if (match) return canonicalLanguageTag(match) ?? candidate;
    }
    const canonicalFallback = canonicalLanguageTag(fallback);
    if (canonicalFallback && supportedByCanonical.has(canonicalFallback)) return canonicalFallback;
    const firstSupported = supportedByCanonical.keys().next().value;
    if (typeof firstSupported === 'string') return firstSupported;
    return canonicalFallback ?? 'en';
}

function uniqueCanonicalTags(values: readonly string[]): LanguageTag[] {
    const seen = new Set<string>();
    const tags: LanguageTag[] = [];
    for (const value of values) {
        const canonical = canonicalLanguageTag(value);
        if (!canonical || seen.has(canonical)) continue;
        seen.add(canonical);
        tags.push(canonical);
    }
    return tags;
}
