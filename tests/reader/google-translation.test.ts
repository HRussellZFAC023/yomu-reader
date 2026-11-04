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
        expect(url.searchParams.has('dj')).toBe(false);
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

    it('reads the standard Google response, preserving segment order and line breaks', async () => {
        const fetch = vi.fn(async () => new Response(JSON.stringify([
            [[' First line\n', '一行目', null, null, 3], ['Second line ', '二行目', null, null, 3]],
            [['noun', ['dictionary data is not translation text']]], 'ja', null, null, null, null, [],
        ])));
        vi.stubGlobal('fetch', fetch);

        await expect(translateText('一行目\n二行目', { sourceLanguage: 'ja', outputLanguage: 'en', includeDictionaryData: true }))
            .resolves.toBe('First line\nSecond line');
        await expect(translateText('一行目\n二行目', { sourceLanguage: 'ja', outputLanguage: 'en' }))
            .resolves.toBe('First line\nSecond line');
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it.each([
        null, [], [[]], [[[' ']]], [[[42]]], [[['partial'], null]],
        { sentences: [{ trans: 42 }] }, { sentences: [{ trans: 'partial' }, null] },
    ].map(payload => ({ payload })))('rejects empty or malformed provider data without caching it: $payload', async ({ payload }) => {
        const fetch = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify(payload)))
            .mockResolvedValueOnce(new Response(JSON.stringify([[['Recovered translation', '回復']]])));
        vi.stubGlobal('fetch', fetch);

        await expect(translateText('回復', { sourceLanguage: 'ja', outputLanguage: 'en' })).rejects.toThrow();
        await expect(translateText('回復', { sourceLanguage: 'ja', outputLanguage: 'en' }))
            .resolves.toBe('Recovered translation');
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('does not retry a rate-limited Google request automatically', async () => {
        const fetch = vi.fn(async () => new Response('Rate limited', { status: 429 }));
        vi.stubGlobal('fetch', fetch);

        await expect(translateText('猫', { sourceLanguage: 'ja', outputLanguage: 'en' })).rejects.toThrow('(429)');
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('keeps format rejection local to its subscriber while preserving shared transport', async () => {
        const fetch = vi.fn(async () => new Response(JSON.stringify({ sentences: [{ trans: 'One line' }] }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetch);
        const languages = { sourceLanguage: 'ja', outputLanguage: 'en' };
        const formatted = translateText('一行\n二行', { ...languages, acceptResult: result => result.includes('\n') });
        const ordinary = translateText('一行\n二行', languages);
        await expect(formatted).rejects.toThrow('requested format');
        await expect(ordinary).resolves.toBe('One line');
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('keeps shared translation work alive for remaining subscribers and caches only the live result', async () => {
        let resolveFetch!: (response: Response) => void;
        let requestSignal: AbortSignal | undefined;
        const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>(resolve => {
            requestSignal = init?.signal ?? undefined;
            resolveFetch = resolve;
        }));
        vi.stubGlobal('fetch', fetchMock);
        const firstController = new AbortController();
        const secondController = new AbortController();

        const first = translateText('共同翻訳', {
            sourceLanguage: 'ja',
            outputLanguage: 'en',
            signal: firstController.signal,
        });
        const second = translateText('共同翻訳', {
            sourceLanguage: 'ja',
            outputLanguage: 'en',
            signal: secondController.signal,
        });
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

        firstController.abort();
        await expect(first).rejects.toMatchObject({ name: 'AbortError' });
        expect(requestSignal?.aborted).toBe(false);

        resolveFetch(new Response(JSON.stringify({ sentences: [{ trans: 'Shared translation' }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        await expect(second).resolves.toBe('Shared translation');
        await expect(translateText('共同翻訳', { sourceLanguage: 'ja', outputLanguage: 'en' }))
            .resolves.toBe('Shared translation');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('rejects the exact final-subscriber abort and never caches a transport result that arrives later', async () => {
        let resolveLateFetch!: (response: Response) => void;
        const fetchMock = vi.fn()
            .mockImplementationOnce(() => new Promise<Response>(resolve => {
                resolveLateFetch = resolve;
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                sentences: [{ trans: 'Fresh translation' }],
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));
        vi.stubGlobal('fetch', fetchMock);
        const controller = new AbortController();
        const reason = new DOMException('Selection replaced', 'AbortError');

        const stale = translateText('遅い翻訳', {
            sourceLanguage: 'ja',
            outputLanguage: 'en',
            signal: controller.signal,
        });
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        controller.abort(reason);

        await expect(stale).rejects.toBe(reason);
        resolveLateFetch(new Response(JSON.stringify({
            sentences: [{ trans: 'Late stale translation' }],
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        await new Promise(resolve => globalThis.setTimeout(resolve, 0));

        await expect(translateText('遅い翻訳', { sourceLanguage: 'ja', outputLanguage: 'en' }))
            .resolves.toBe('Fresh translation');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not send empty or same-language text', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        await expect(translateText('  ', { sourceLanguage: 'ja', outputLanguage: 'ko' })).resolves.toBe('');
        await expect(translateText('日本語', { sourceLanguage: 'ja', outputLanguage: 'ja' })).resolves.toBe('日本語');
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
