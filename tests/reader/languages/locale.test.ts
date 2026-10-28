import { describe, expect, it } from 'vitest';

import {
    canonicalLanguageTag,
    languageSubtag,
    localeDirection,
    localeFallbackChain,
    resolveSupportedLocale,
} from '../../../src/reader/languages/locale';

describe('BCP-47 locale normalization', () => {
    it('canonicalizes casing, underscore input, and deprecated aliases', () => {
        expect(canonicalLanguageTag(' zh_hant_tw ')).toBe('zh-Hant-TW');
        expect(canonicalLanguageTag('sh')).toBe('sr-Latn');
        expect(canonicalLanguageTag('tl')).toBe('fil');
        expect(languageSubtag('pt-BR')).toBe('pt');
    });

    it('rejects malformed and non-string language tags', () => {
        expect(canonicalLanguageTag('not a locale')).toBeNull();
        expect(canonicalLanguageTag('')).toBeNull();
        expect(canonicalLanguageTag(null)).toBeNull();
    });

    it('resolves writing direction from language and script', () => {
        expect(localeDirection('ar')).toBe('rtl');
        expect(localeDirection('fa-AF')).toBe('rtl');
        expect(localeDirection('az-Arab')).toBe('rtl');
        expect(localeDirection('az-Latn')).toBe('ltr');
        expect(localeDirection('ko')).toBe('ltr');
    });

    it('builds a deterministic most-specific fallback chain', () => {
        expect(localeFallbackChain('zh-Hant-TW-u-nu-hanidec')).toEqual([
            'zh-Hant-TW',
            'zh-Hant',
            'zh',
        ]);
        expect(localeFallbackChain('pt_BR')).toEqual(['pt-BR', 'pt']);
    });

    it('selects an exact, script, language, then explicit fallback locale', () => {
        const supported = ['en', 'zh-Hant', 'pt'];
        expect(resolveSupportedLocale('zh-Hant-TW', supported, 'en')).toBe('zh-Hant');
        expect(resolveSupportedLocale('pt-BR', supported, 'en')).toBe('pt');
        expect(resolveSupportedLocale('ko', supported, 'en')).toBe('en');
    });
});
