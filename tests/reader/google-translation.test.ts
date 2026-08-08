import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    googleTranslationLanguageCapability,
    googleTranslationUrl,
    normalizeTranslationLanguage,
    resetGoogleTranslationCacheForTests,
    translateText,
} from '../../src/reader/translation/google';
import { LEARNER_LANGUAGES } from '../../src/reader/locales';

describe('generic Google translation transport', () => {
    beforeEach(() => {
        resetGoogleTranslationCacheForTests();
        vi.stubGlobal('GM_xmlhttpRequest', undefined);
    });

    it('canonicalizes BCP-47 input and preserves automatic source detection', () => {
        expect(normalizeTranslationLanguage('KO')).toBe('ko');
        expect(normalizeTranslationLanguage('zh-hans')).toBe('zh-Hans');
        expect(normalizeTranslationLanguage('auto', { allowAuto: true })).toBe('auto');
        expect(() => normalizeTranslationLanguage('not_a_locale')).toThrow(/Invalid translation language/);
    });

    it('builds a Unicode-safe language-pair request', () => {
        const url = new URL(googleTranslationUrl('「読む」', {
            sourceLanguage: 'ja',
            outputLanguage: 'ko',
            includeDictionaryData: true,
        }));
        expect(url.hostname).toBe('translate.googleapis.com');
        expect(url.searchParams.get('sl')).toBe('ja');
        expect(url.searchParams.get('tl')).toBe('ko');
        expect(url.searchParams.get('q')).toBe('「読む」');
        expect(url.searchParams.getAll('dt')).toEqual(['t', 'bd']);
    });

    it('keeps logical language tags separate from provider-specific transport codes', () => {
        expect(googleTranslationLanguageCapability('sr-Latn')).toEqual({
            logicalLanguage: 'sr-Latn',
            providerLanguage: 'bs',
            supported: true,
        });
        expect(googleTranslationLanguageCapability('grc')).toEqual({
            logicalLanguage: 'grc',
            providerLanguage: null,
            supported: false,
        });
        expect(googleTranslationLanguageCapability('fil')).toEqual({
            logicalLanguage: 'fil',
            providerLanguage: 'tl',
            supported: true,
        });
        expect(googleTranslationLanguageCapability('zz')).toEqual({
            logicalLanguage: 'zz',
            providerLanguage: null,
            supported: false,
        });
        const serboCroatian = new URL(googleTranslationUrl('読む', {
            sourceLanguage: 'ja',
            outputLanguage: 'sr-Latn',
        }));
        expect(serboCroatian.searchParams.get('tl')).toBe('bs');
        expect(() => googleTranslationUrl('読む', {
            sourceLanguage: 'ja',
            outputLanguage: 'grc',
        })).toThrow(/not available for grc/);
    });

    it('declares an explicit provider capability for every Slice 1 language', () => {
        const capabilities = LEARNER_LANGUAGES.map(language => ({
            id: language.id,
            ...googleTranslationLanguageCapability(language.runtimeLocale),
        }));
        expect(capabilities).toHaveLength(32);
        expect(capabilities.filter(capability => !capability.supported).map(capability => capability.id))
            .toEqual(['grc']);
        expect(capabilities.find(capability => capability.id === 'sh')?.providerLanguage).toBe('bs');
        expect(capabilities.find(capability => capability.id === 'tl')?.providerLanguage).toBe('tl');
        expect(capabilities.filter(capability => capability.supported).every(capability => (
            Boolean(capability.providerLanguage)
        ))).toBe(true);
    });

    it('deduplicates concurrent requests by full language pair and text', async () => {
        const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
            sentences: [{ trans: '읽다' }],
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })));
        vi.stubGlobal('fetch', fetchMock);

        const requests = [
            translateText('読む', { sourceLanguage: 'ja', outputLanguage: 'ko' }),
            translateText('読む', { sourceLanguage: 'ja', outputLanguage: 'ko' }),
        ];
        await expect(Promise.all(requests)).resolves.toEqual(['읽다', '읽다']);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not send empty or same-language text', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        await expect(translateText('  ', { sourceLanguage: 'ja', outputLanguage: 'ko' })).resolves.toBe('');
        await expect(translateText('日本語', { sourceLanguage: 'ja', outputLanguage: 'ja' })).resolves.toBe('日本語');
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
