import { languageDisplayName } from './locale';

/**
 * Endonyms for language tags whose useful names are not consistently supplied
 * by Intl.DisplayNames across the browsers Yomu supports.
 */
const LANGUAGE_ENDONYMS: Readonly<Record<string, string>> = Object.freeze({
    ja: '日本語',
    zh: '中文',
    yue: '粵語',
    lzh: '文言',
});

export function headwordLanguageEndonym(language: string): string {
    return LANGUAGE_ENDONYMS[language] ?? language;
}

/** A language name in the interface locale, with an endonym fallback. */
export function headwordLanguageName(language: string, locale = 'en'): string {
    const display = languageDisplayName(language, locale);
    return display === language ? headwordLanguageEndonym(language) : display;
}
