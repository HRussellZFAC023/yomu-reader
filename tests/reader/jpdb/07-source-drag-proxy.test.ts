import { describe, expect, it, vi } from 'vitest';
import {
    registerReaderHelpersCleanup,
    AnkiConnectClient,
    CardRenderDataLoader,
    DEFAULT_AUDIO_SOURCES,
    DEFAULT_SETTINGS,
    IMMERSION_KIT_SOURCE_ID,
    ImmersionKitClient,
    JpdbClient,
    JpdbPublicPitchClient,
    JpdbVocabularyClient,
    POPOVER_CORE_CSS,
    PublicProxyWorker,
    ReaderApp,
    STUDY_GRAMMAR_SOURCE_ID,
    STUDY_TRANSLATION_SOURCE_ID,
    SUBTITLES_YOUTUBE_CSS,
    TEST_PROXY_URL,
    YomitanDictionaryStore,
    builtInEdgeProxyUrlFor,
    builtInWorkersDevProxyUrlFor,
    card,
    cardDetailLoaderSettings,
    createSourceRowDragFixture,
    defaultDictionaryLookupLinks,
    definitionSourceRows,
    definitionSourceStateKey,
    dispatchPointerEvent,
    dragSourceRow,
    expectFetchUrls,
    fetchWithCorsFallbacks,
    immersionExample,
    immersionLazyLoadSurface,
    immersionPopoverTestController,
    isAllowedPublicProxyTarget,
    jitenTestCard,
    kanjiSourceRows,
    lazyImmersionSearchFixture,
    mockAppleMobileBrowser,
    openLazyImmersionSource,
    orderedDefinitionSourceIds,
    orderedKanjiSourceIds,
    parseJpdbSearchHtml,
    parseJpdbVocabularyHtml,
    parsedExampleSentenceInternals,
    proxyUrlCandidates,
    publicProxyUrlFor,
    readDictionaryLookupLinks,
    readFormSettings,
    readerWordSurfaceText,
    renderAudioSourceEditor,
    renderDictionaryLookupLinkEditor,
    renderDictionarySourceRows,
    renderJpdbDefinitionSource,
    renderKanjiSourceRows,
    renderModalCard,
    renderSettingsForm,
    stubHostedNewTabLocation,
    stubJpdbFetchRoutes,
    stubLocalAppLocation,
    stubNhkArticleLocation,
    stubTestLocation,
    testCardPopoverRenderer,
    testCardRenderDataLoader,
    testImmersionKitExample,
    testImmersionPopoverController,
    unproxiedFetchTarget,
    withWindowProperty,
} from './fixtures';
import type {
    ImmersionKitExample,
    JPDBToken,
    JitenApiClient,
} from './fixtures';

registerReaderHelpersCleanup();

type FetchMock = {
    mock: { calls: Array<[RequestInfo | URL, ...unknown[]]> };
};

async function expectSuccessfulCorsFallback(
    fetchMock: FetchMock,
    target: string,
    proxyUrl: string,
    expectedUrl: string,
): Promise<void> {
    const response = await fetchWithCorsFallbacks(target, proxyUrl, {
        allowDirectCrossOrigin: true,
        credentials: 'omit',
    });
    expect(await response.text()).toBe('ok');
    expectFetchUrls(fetchMock, [expectedUrl]);
}

function stubSuccessfulPublicAudioFetch() {
    const upstreamFetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => (
        Promise.resolve(new Response('audio', { status: 200 }))
    ));
    vi.stubGlobal('fetch', upstreamFetch);
    return upstreamFetch;
}

function fetchThroughPublicProxyWorker(request: Request): Promise<Response> {
    return PublicProxyWorker.fetch(request, {}, { waitUntil: vi.fn() });
}

function expectPublicAudioProxyRequest(response: Response, upstreamFetch: FetchMock): void {
    const upstreamRequest = upstreamFetch.mock.calls[0]?.[0] as unknown as Request;
    expect(response.status).toBe(200);
    expect(upstreamRequest.url).toBe('https://jpdb.io/static/v/m1/e9cac7e3d132');
    expect(upstreamRequest.headers.get('x-access')).toBe("please don't steal these files");
    expect(upstreamRequest.headers.get('x-forcecaf')).toBe('1');
}

async function withImmersionFakeTimers(testBody: () => Promise<void>): Promise<void> {
    vi.useFakeTimers();
    try {
        await testBody();
    } finally {
        document.body.replaceChildren();
        vi.useRealTimers();
    }
}

async function expectLazyImmersionSearchAfterOpening(
    container: HTMLDetailsElement,
    search: unknown,
): Promise<void> {
    await vi.advanceTimersByTimeAsync(500);
    expect(search).not.toHaveBeenCalled();
    await openLazyImmersionSource(container);
    expect(search).toHaveBeenCalledTimes(1);
}

describe('reader helpers', () => {
    it('keeps subtitle CSS from overriding settings dictionary source layouts', () => {
        expect(SUBTITLES_YOUTUBE_CSS).not.toContain('.jpdb-reader-settings');
        expect(SUBTITLES_YOUTUBE_CSS).not.toContain('.jpdb-reader-dictionary-row');
        expect(SUBTITLES_YOUTUBE_CSS).not.toContain('.jpdb-reader-audio-source-row');
    });

    it('reorders dictionary source rows with a desktop pointer drag', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            dictionaryPreferences: [{
                name: 'Jitendex',
                alias: 'Jitendex',
                enabled: true,
                priority: 4,
                type: 'terms' as const,
            }],
        };
        const { form, rows } = createSourceRowDragFixture(
            `<div class="jpdb-reader-dictionary-priorities" data-source-editor>${renderDictionarySourceRows(settings)}</div>`,
            '[data-dictionary-source-row]',
        );

        const firstId = rows[0].dataset.sourceId;
        dragSourceRow(form, rows, 999);

        const reordered = Array.from(form.querySelectorAll<HTMLElement>('[data-dictionary-source-row]'));
        expect(reordered.at(-1)?.dataset.sourceId).toBe(firstId);
        expect(reordered.at(-1)?.querySelector<HTMLInputElement>('input[name$=".priority"]')?.value).toBe(String(reordered.length - 1));
    });

    it('reorders audio source rows while keeping form indexes readable', () => {
        const { form, rows } = createSourceRowDragFixture(
            `<div class="jpdb-reader-audio-sources" data-source-editor data-audio-source-editor>${renderAudioSourceEditor(DEFAULT_AUDIO_SOURCES)}</div>`,
            '[data-audio-source-row]',
        );

        const firstType = rows[0].querySelector<HTMLSelectElement>('select[name$=".type"]')?.value;
        dragSourceRow(form, rows, 500);

        const reordered = Array.from(form.querySelectorAll<HTMLElement>('[data-audio-source-row]'));
        expect(reordered.at(-1)?.dataset.sourceId).toBe(`audio-${reordered.length - 1}`);
        expect(reordered.at(-1)?.querySelector<HTMLSelectElement>(`select[name="audioSources.${reordered.length - 1}.type"]`)?.value).toBe(firstType);
    });

    it('reorders kanji source rows with iPad-style touch drag events tracked on the document', () => {
        const { form, rows } = createSourceRowDragFixture(
            `<div class="jpdb-reader-kanji-priorities" data-source-editor>${renderKanjiSourceRows(DEFAULT_SETTINGS)}</div>`,
            '[data-dictionary-source-row]',
        );

        const firstId = rows[0].dataset.sourceId;
        dragSourceRow(form, rows, 500, 'touch', document);

        expect(Array.from(form.querySelectorAll<HTMLElement>('[data-dictionary-source-row]')).at(-1)?.dataset.sourceId).toBe(firstId);
    });

    it.each([
        ['overlay-space BCRs', 1],
        ['inverse-zoomed layout-space BCRs', 0.625],
    ])('reorders Reddit settings rows with WebKit %s', (_mode, rectScale) => {
        const restoreAppleBrowser = mockAppleMobileBrowser();
        stubTestLocation('https://www.reddit.com/r/LearnJapanese/');

        try {
            withWindowProperty('innerWidth', 475, () => withWindowProperty('outerWidth', 760, () => {
                const { form, rows } = createSourceRowDragFixture(
                    `<div class="jpdb-reader-dictionary-priorities" data-source-editor>${renderDictionarySourceRows(DEFAULT_SETTINGS)}</div>`,
                    '[data-dictionary-source-row]',
                );
                mockCompensatedRedditRoot(form, rectScale);
                rows.forEach((row, index) => {
                    row.getBoundingClientRect = () => scaledTestRect(0, index * 48, 300, 40, rectScale);
                });

                const first = rows[0];
                const handle = first.querySelector<HTMLElement>('[data-source-drag-handle]')!;
                dispatchPointerEvent(handle, 'pointerdown', 4 / 1.6);
                dispatchPointerEvent(document, 'pointermove', 90 / 1.6);
                dispatchPointerEvent(document, 'pointerup', 90 / 1.6);

                const reordered = Array.from(form.querySelectorAll<HTMLElement>('[data-dictionary-source-row]'));
                expect(reordered[1]).toBe(first);
            }));
        } finally {
            restoreAppleBrowser();
        }
    });

    it('reorders lookup pill rows through the drag handle', () => {
        const { form, rows } = createSourceRowDragFixture(
            `<div class="jpdb-reader-lookup-links" data-source-editor>${renderDictionaryLookupLinkEditor(defaultDictionaryLookupLinks('local'))}</div>`,
            '[data-lookup-link-row]',
        );
        const sourceRow = rows.find(row => row.querySelector<HTMLInputElement>('input[name$=".id"]')?.value === 'yomu-search')!;
        const sourceId = sourceRow.querySelector<HTMLInputElement>('input[name$=".id"]')?.value;
        const sourceHandle = sourceRow.querySelector<HTMLElement>('[data-source-drag-handle]')!;

        const afterLastRow = rows.length * 48 + 20;
        dispatchPointerEvent(sourceHandle, 'pointerdown', sourceRow.getBoundingClientRect().top + 4);
        dispatchPointerEvent(form, 'pointermove', afterLastRow);
        dispatchPointerEvent(form, 'pointerup', afterLastRow);

        const ids = Array.from(form.querySelectorAll<HTMLInputElement>('input[name$=".id"]')).map(input => input.value);
        expect(ids.at(-1)).toBe(sourceId);
        expect(readDictionaryLookupLinks(new FormData(form)).at(-1)?.id).toBe(sourceId);
    });

    it('builds configured proxy URLs ahead of built-in public proxies', () => {
        const target = 'https://jpdb.io/kanji/%E5%9B%B3';
        const candidates = proxyUrlCandidates(target, TEST_PROXY_URL);

        expect(candidates).toEqual([
            publicProxyUrlFor(target),
            builtInEdgeProxyUrlFor(target),
            builtInWorkersDevProxyUrlFor(target),
        ]);
        expect(candidates.some(url => url.startsWith('https://api.allorigins.win/'))).toBe(false);
        expect(proxyUrlCandidates(target, TEST_PROXY_URL, false)).toEqual([publicProxyUrlFor(target)]);
        expect(proxyUrlCandidates(target, '')).toEqual([
            builtInEdgeProxyUrlFor(target),
            builtInWorkersDevProxyUrlFor(target),
        ]);
    });

    it('falls back from configured proxy HTTP failures to the built-in public proxy', async () => {
        const target = 'https://jpdb.io/search?q=%E5%9B%B3';
        const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
            const url = String(input);
            if (url.startsWith(TEST_PROXY_URL)) {
                return Promise.resolve(new Response('blocked', { status: 403 }));
            }
            return Promise.resolve(new Response('ok', { status: 200 }));
        });
        stubNhkArticleLocation();
        vi.stubGlobal('fetch', fetchMock);

        try {
            const response = await fetchWithCorsFallbacks(target, TEST_PROXY_URL, { credentials: 'omit' });

            expect(response.status).toBe(200);
            expectFetchUrls(fetchMock, [publicProxyUrlFor(target), builtInEdgeProxyUrlFor(target)]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('serves public JPDB lookup page requests from local app pages via the built-in proxy', async () => {
        const target = 'https://jpdb.io/search?q=%E8%AA%AD';
        const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(new Response('ok', { status: 200 })));
        stubLocalAppLocation();
        vi.stubGlobal('fetch', fetchMock);

        try {
            const response = await fetchWithCorsFallbacks(target, '', { credentials: 'omit' });

            expect(response.status).toBe(200);
            expectFetchUrls(fetchMock, [builtInEdgeProxyUrlFor(target)]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('uses a configured proxy when direct local hosted Immersion Kit search is not enabled', async () => {
        const target = 'https://apiv2express.immersionkit.com/search?q=%E8%AA%AD%E3%82%80&limit=48';
        const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(new Response('ok', { status: 200 })));
        stubLocalAppLocation();
        vi.stubGlobal('fetch', fetchMock);

        try {
            const response = await fetchWithCorsFallbacks(target, TEST_PROXY_URL, { credentials: 'omit' });

            expect(await response.text()).toBe('ok');
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(String(fetchMock.mock.calls[0][0])).toBe(publicProxyUrlFor(target));
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('does not bypass public API rate limits through proxy fallbacks', async () => {
        const target = 'https://apiv2express.immersionkit.com/search?q=%E8%AA%AD%E3%82%80&limit=250';
        const fetchMock = vi.fn((_input: RequestInfo | URL) => Promise.resolve(new Response('rate limited', { status: 429 })));
        stubHostedNewTabLocation();
        vi.stubGlobal('fetch', fetchMock);

        try {
            const response = await fetchWithCorsFallbacks(target, TEST_PROXY_URL, { allowDirectCrossOrigin: true, credentials: 'omit' });

            expect(response.status).toBe(429);
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(String(fetchMock.mock.calls[0]?.[0])).toBe(target);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('uses direct fetch for CORS-friendly hosted Immersion Kit requests', async () => {
        const target = 'https://apiv2express.immersionkit.com/search?q=%E8%AA%AD%E3%82%80&limit=250';
        const fetchMock = vi.fn((_input: RequestInfo | URL) => Promise.resolve(new Response('ok', { status: 200 })));
        stubHostedNewTabLocation();
        vi.stubGlobal('fetch', fetchMock);

        try {
            const response = await fetchWithCorsFallbacks(target, TEST_PROXY_URL, { allowDirectCrossOrigin: true, credentials: 'omit' });

            expect(await response.text()).toBe('ok');
            expectFetchUrls(fetchMock, [target]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('uses direct fetch for CORS-friendly iPad Immersion Kit requests', async () => {
        const target = 'https://apiv2express.immersionkit.com/search?q=%E8%AA%AD%E3%82%80&limit=250';
        const restoreBrowser = mockAppleMobileBrowser();
        const fetchMock = vi.fn((_input: RequestInfo | URL) => Promise.resolve(new Response('ok', { status: 200 })));
        stubTestLocation('https://www3.nhk.or.jp/news/easy/');
        vi.stubGlobal('fetch', fetchMock);

        try {
            await expectSuccessfulCorsFallback(fetchMock, target, '', target);
        } finally {
            restoreBrowser();
            vi.unstubAllGlobals();
        }
    });

    it('routes known CORS-blocked public audio lookup URLs through the built-in public proxy', async () => {
        const target = 'https://jisho.org/search/%E5%A4%A7%E5%88%87';
        const jishoAudioTarget = 'https://d1vjc5dkcd3yh2.cloudfront.net/audio/7f5db2ba73cff9c5ef681c0431a12d93.mp3';
        const studyAudioTarget = 'https://d1pra95f92lrn3.cloudfront.net/audio/271184.mp3';
        const japanesePodTarget = 'https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?kanji=%E5%A4%A7%E5%88%87&kana=%E3%81%9F%E3%81%84%E3%81%9B%E3%81%A4';
        const innovativeLanguageTarget = 'https://cdn.innovativelanguage.com/japanesepod101/learningcenter/audio/vocabulary/4306.mp3';
        const languagePodPostTarget = 'https://www.japanesepod101.com/learningcenter/reference/dictionary_post';
        const responses = new Map<string, string>([
            [target, 'ok'],
            [jishoAudioTarget, 'jisho audio'],
            [studyAudioTarget, 'study audio'],
            [japanesePodTarget, 'audio'],
            [innovativeLanguageTarget, 'innovative audio'],
            [languagePodPostTarget, 'language pod html'],
        ]);
        const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
            const url = String(input);
            const response = responses.get(unproxiedFetchTarget(input));
            if (response) return Promise.resolve(new Response(response, { status: 200 }));
            return Promise.reject(new Error(`unexpected fetch: ${url}`));
        });
        stubNhkArticleLocation();
        vi.stubGlobal('fetch', fetchMock);

        try {
            await expectSuccessfulCorsFallback(fetchMock, target, '', builtInEdgeProxyUrlFor(target));

            fetchMock.mockClear();
            await expect(fetchWithCorsFallbacks(jishoAudioTarget, '', { allowDirectCrossOrigin: true, credentials: 'omit' }))
                .resolves.toBeInstanceOf(Response);
            expectFetchUrls(fetchMock, [builtInEdgeProxyUrlFor(jishoAudioTarget)]);

            fetchMock.mockClear();
            await expect(fetchWithCorsFallbacks(studyAudioTarget, '', { allowDirectCrossOrigin: true, credentials: 'omit' }))
                .resolves.toBeInstanceOf(Response);
            expectFetchUrls(fetchMock, [builtInEdgeProxyUrlFor(studyAudioTarget)]);

            fetchMock.mockClear();
            await expect(fetchWithCorsFallbacks(japanesePodTarget, '', { allowDirectCrossOrigin: true, credentials: 'omit' }))
                .resolves.toBeInstanceOf(Response);
            expectFetchUrls(fetchMock, [builtInEdgeProxyUrlFor(japanesePodTarget)]);

            fetchMock.mockClear();
            await expect(fetchWithCorsFallbacks(innovativeLanguageTarget, '', { allowDirectCrossOrigin: true, credentials: 'omit' }))
                .resolves.toBeInstanceOf(Response);
            expectFetchUrls(fetchMock, [builtInEdgeProxyUrlFor(innovativeLanguageTarget)]);

            fetchMock.mockClear();
            await expect(fetchWithCorsFallbacks(languagePodPostTarget, TEST_PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'post=dictionary_reference',
                credentials: 'omit',
            })).resolves.toBeInstanceOf(Response);
            expectFetchUrls(fetchMock, [publicProxyUrlFor(languagePodPostTarget)]);
            const [, proxiedPostInit] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
            expect(proxiedPostInit).toMatchObject({
                method: 'POST',
                body: 'post=dictionary_reference',
            });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('does not send private network targets to configured or public proxies', async () => {
        const fetchMock = vi.fn(() => Promise.reject(new Error('fetch should not run')));
        stubHostedNewTabLocation();
        vi.stubGlobal('fetch', fetchMock);

        try {
            await expect(fetchWithCorsFallbacks('http://127.0.0.1:8765', 'https://yomu-proxy.example/fetch', {
                credentials: 'omit',
            })).rejects.toThrow(/configured proxy|userscript/i);
            expect(fetchMock).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('does not route credential-bearing JPDB API requests through configured or public proxies', async () => {
        const fetchMock = vi.fn(() => Promise.reject(new Error('fetch should not run')));
        vi.stubGlobal('location', { href: 'https://www.nhk.or.jp/news/easy/', origin: 'https://www.nhk.or.jp', hostname: 'www.nhk.or.jp' });
        vi.stubGlobal('fetch', fetchMock);

        try {
            await expect(fetchWithCorsFallbacks('https://jpdb.io/api/v1/lookup-vocabulary', 'https://yomu-proxy.example/fetch', {
                method: 'POST',
                headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
                body: '{}',
            })).rejects.toThrow(/configured proxy|userscript/i);
            expect(fetchMock).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('allows public Worker proxying only for allowlisted anonymous reads', () => {
        expect(isAllowedPublicProxyTarget('GET', new URL('https://jpdb.io/kanji/%E5%9B%B3'))).toBe(true);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://jpdb.io/vocabulary/123/%E8%AA%AD%E3%82%80/%E3%82%88%E3%82%80'))).toBe(true);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://jpdb.io/static/v/m1/e9cac7e3d132'))).toBe(true);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://uchisen.com/kanji/%E5%9B%B3'))).toBe(false);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://ik.imagekit.io/uchisen/generated/saved/generated_sample.jpg'))).toBe(false);
        expect(isAllowedPublicProxyTarget('HEAD', new URL('https://api.jiten.moe/api/vocabulary/123/0/info'))).toBe(true);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMdict_english.zip'))).toBe(false);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://release-assets.githubusercontent.com/github-production-release-asset/123/asset-id?sig=github-signed'))).toBe(false);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://example.com/dict.zip'))).toBe(false);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://cdn.example.com/audio.mp3'))).toBe(false);
        expect(isAllowedPublicProxyTarget('POST', new URL('https://www.japanesepod101.com/learningcenter/reference/dictionary_post'))).toBe(false);
        expect(isAllowedPublicProxyTarget('POST', new URL('https://jpdb.io/api/v1/lookup-vocabulary'))).toBe(false);
        expect(isAllowedPublicProxyTarget('GET', new URL('https://jpdb.io/api/v1/lookup-vocabulary'))).toBe(false);
        expect(isAllowedPublicProxyTarget('POST', new URL('https://jpdb.io/prioritize'))).toBe(false);
        expect(isAllowedPublicProxyTarget('PUT', new URL('https://api.example.com/items/1'))).toBe(false);
        expect(isAllowedPublicProxyTarget('PATCH', new URL('https://api.example.com/items/1'))).toBe(false);
        expect(isAllowedPublicProxyTarget('DELETE', new URL('https://api.example.com/items/1'))).toBe(false);
        expect(isAllowedPublicProxyTarget('GET', new URL('http://127.0.0.1/audio.mp3'))).toBe(false);
        expect(isAllowedPublicProxyTarget('GET', new URL('file:///tmp/audio.mp3'))).toBe(false);
    });

    it('strips browser fetch metadata before forwarding public Worker requests', async () => {
        const upstreamFetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(new Response('ok', { status: 200 })));
        vi.stubGlobal('fetch', upstreamFetch);

        try {
            const response = await PublicProxyWorker.fetch(
                new Request(`https://proxy.test/?url=${encodeURIComponent('https://jisho.org/search/%E8%AA%AD%E3%82%80')}`, {
                    headers: {
                        'Sec-Fetch-Dest': 'empty',
                        'Sec-Fetch-Mode': 'cors',
                        'Sec-Fetch-Site': 'cross-site',
                    },
                }),
                {},
                { waitUntil: vi.fn() },
            );

            expect(response.status).toBe(200);
            const upstreamRequest = upstreamFetch.mock.calls[0]?.[0] as unknown as Request;
            const headers = upstreamRequest.headers;
            expect(upstreamRequest.url).toBe('https://jisho.org/search/%E8%AA%AD%E3%82%80');
            expect(headers.has('sec-fetch-dest')).toBe(false);
            expect(headers.has('sec-fetch-mode')).toBe(false);
            expect(headers.has('sec-fetch-site')).toBe(false);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('injects JPDB public audio access headers through the public Worker', async () => {
        const upstreamFetch = stubSuccessfulPublicAudioFetch();

        try {
            const preflight = await fetchThroughPublicProxyWorker(
                new Request(`https://proxy.test/?url=${encodeURIComponent('https://jpdb.io/static/v/m1/e9cac7e3d132')}`, {
                    method: 'OPTIONS',
                    headers: {
                        Origin: 'http://127.0.0.1:5174',
                        'Access-Control-Request-Method': 'GET',
                        'Access-Control-Request-Headers': 'x-forcecaf',
                    },
                }),
            );
            const response = await fetchThroughPublicProxyWorker(
                new Request(`https://proxy.test/?url=${encodeURIComponent('https://jpdb.io/static/v/m1/e9cac7e3d132')}`, {
                    headers: {
                        'X-Access': "please don't steal these files",
                        'X-ForceCAF': '1',
                    },
                }),
            );

            expect(preflight.headers.get('access-control-allow-headers')).not.toContain('x-access');
            expect(preflight.headers.get('access-control-allow-headers')).toContain('x-forcecaf');
            expectPublicAudioProxyRequest(response, upstreamFetch);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('adds JPDB public audio access headers in the public Worker when the browser request omits them', async () => {
        const upstreamFetch = stubSuccessfulPublicAudioFetch();

        try {
            const response = await fetchThroughPublicProxyWorker(
                new Request(`https://proxy.test/?url=${encodeURIComponent('https://jpdb.io/static/v/m1/e9cac7e3d132')}&x-forcecaf=1`),
            );

            expectPublicAudioProxyRequest(response, upstreamFetch);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('rejects arbitrary public Worker methods, bodies, and credential headers', async () => {
        const upstreamFetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(new Response('updated', {
            status: 202,
            headers: { 'X-Upstream-Trace': 'trace-1' },
        })));
        vi.stubGlobal('fetch', upstreamFetch);

        try {
            const response = await PublicProxyWorker.fetch(
                new Request(`https://proxy.test/?url=${encodeURIComponent('https://api.example.com/items/1?debug=1')}`, {
                    method: 'PATCH',
                    headers: {
                        Origin: 'https://hrussellzfac023.github.io',
                        Authorization: 'Bearer token',
                        'Content-Type': 'application/json',
                        'X-Custom-Request': 'yes',
                        'Sec-Fetch-Mode': 'cors',
                    },
                    body: JSON.stringify({ name: '読む' }),
                }),
                {},
                { waitUntil: vi.fn() },
            );

            expect(response.status).toBe(400);
            expect(response.headers.get('access-control-allow-origin')).toBe('https://hrussellzfac023.github.io');
            expect(response.headers.get('access-control-allow-credentials')).toBeNull();
            expect(upstreamFetch).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('orders translation and grammar as separate definition sources', () => {
        const orderedIds = orderedDefinitionSourceIds({
            ...DEFAULT_SETTINGS,
            studyTranslationEnabled: true,
            studyGrammarEnabled: true,
            studyTranslationPriority: 30,
            studyGrammarPriority: 10,
        }, []);
        const translationOnlyIds = orderedDefinitionSourceIds({
            ...DEFAULT_SETTINGS,
            studyTranslationEnabled: true,
            studyGrammarEnabled: false,
        }, []);

        expect(orderedIds).toContain(STUDY_TRANSLATION_SOURCE_ID);
        expect(orderedIds).toContain(STUDY_GRAMMAR_SOURCE_ID);
        expect(orderedIds.indexOf(STUDY_GRAMMAR_SOURCE_ID)).toBeLessThan(orderedIds.indexOf(STUDY_TRANSLATION_SOURCE_ID));
        expect(definitionSourceRows(DEFAULT_SETTINGS).map(row => row.id)).toEqual(expect.arrayContaining([STUDY_TRANSLATION_SOURCE_ID, STUDY_GRAMMAR_SOURCE_ID]));
        expect(translationOnlyIds).toContain(STUDY_TRANSLATION_SOURCE_ID);
        expect(translationOnlyIds).not.toContain(STUDY_GRAMMAR_SOURCE_ID);
    });

    it('adds Immersion Kit to kanji source ordering', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({
            ...DEFAULT_SETTINGS,
            kanjiImmersionKitPriority: 1,
        }, 'https://jpdb.io/settings');

        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);

        expect(saved.kanjiImmersionKitEnabled).toBe(true);
        expect(saved.kanjiImmersionKitPriority).toBe(1);
        expect(kanjiSourceRows(saved).map(row => row.id)).toContain(IMMERSION_KIT_SOURCE_ID);
        expect(orderedKanjiSourceIds(saved)[1]).toBe(IMMERSION_KIT_SOURCE_ID);
        expect(orderedKanjiSourceIds({ ...saved, kanjiImmersionKitEnabled: false })).not.toContain(IMMERSION_KIT_SOURCE_ID);
        expect(orderedKanjiSourceIds({ ...saved, immersionKitEnabled: false })).not.toContain(IMMERSION_KIT_SOURCE_ID);
    });

    it('parses public JPDB search results into word cards', () => {
        const cards = parseJpdbSearchHtml(`
            <div class="results search">
                <div class="result vocabulary">
                    <div class="subsection-headword">
                        <div class="primary-spelling">
                            <div class="spelling"><ruby>お<rt></rt>母<rt>かあ</rt>さん<rt></rt></ruby></div>
                        </div>
                    </div>
                    <div class="subsection-meanings">
                        <div class="part-of-speech"><div>Noun</div><div>Honorific</div></div>
                        <div class="description">1.  mother;  mom;  mum;  ma</div>
                        <div class="description">2.  wife</div>
                    </div>
                    <div class="tags"><div class="tag">Top 1,400</div></div>
                    <a class="view-conjugations-link" href="/vocabulary/1002650/%E3%81%8A%E6%AF%8D%E3%81%95%E3%82%93/%E3%81%8A%E3%81%8B%E3%81%82%E3%81%95%E3%82%93#a">More details...</a>
                </div>
            </div>
        `);

        expect(cards).toHaveLength(1);
        expect(cards[0]).toMatchObject({
            vid: 1002650,
            sid: 0,
            spelling: 'お母さん',
            reading: 'おかあさん',
            frequencyRank: 1400,
            partOfSpeech: ['Noun', 'Honorific'],
            cardState: ['not-in-deck'],
            source: 'jpdb',
            sentence: 'お母さん',
        });
        expect(cards[0]?.meanings.map(meaning => meaning.glosses[0])).toEqual([
            'mother; mom; mum; ma',
            'wife',
        ]);
    });

    it('does not treat public JPDB supplemental path slugs as readings', () => {
        const cards = parseJpdbSearchHtml(`
            <div class="results search">
                <div class="result vocabulary">
                    <div class="subsection-headword">
                        <div class="primary-spelling">
                            <div class="spelling"><ruby>日<rt>に</rt>本<rt>ほん</rt>語<rt>ご</rt></ruby></div>
                        </div>
                    </div>
                    <div class="subsection-meanings">
                        <div class="part-of-speech"><div>Noun</div></div>
                        <div class="description">1. Japanese language</div>
                    </div>
                    <div class="tags"><div class="tag">Top 4,800</div></div>
                    <a class="view-conjugations-link" href="/vocabulary/1464530/%E6%97%A5%E6%9C%AC%E8%AA%9E/used-in">Used in: 4800</a>
                </div>
            </div>
        `);

        expect(cards).toHaveLength(1);
        expect(cards[0]).toMatchObject({
            vid: 1464530,
            spelling: '日本語',
            reading: 'にほんご',
            frequencyRank: 4800,
        });
    });

    it('uses canonical JPDB detail readings before supplemental links when resolving public cards', () => {
        const cards = parseJpdbSearchHtml(`
            <link rel="canonical" href="https://jpdb.io/vocabulary/1407930/%E5%A4%9A%E8%AA%AD/%E3%81%9F%E3%81%A9%E3%81%8F">
            <meta name="description" content="Dictionary definition of 多読 (たどく) — wide reading; extensive reading">
            <div class="results details">
                <div class="result vocabulary">
                    <div class="subsection-headword">
                        <div class="primary-spelling">
                            <div class="spelling"><div><ruby class="v">多<rt>た</rt>読<rt>どく</rt></ruby></div></div>
                        </div>
                    </div>
                    <div class="subsection-meanings">
                        <div class="part-of-speech"><div>Noun</div><div>Verb (する)</div></div>
                        <div class="description">1. wide reading; extensive reading</div>
                    </div>
                    <a class="view-conjugations-link" href="/vocabulary/1407930/%E5%A4%9A%E8%AA%AD/used-in">Used in: 10</a>
                </div>
            </div>
        `);

        expect(cards).toHaveLength(1);
        expect(cards[0]).toMatchObject({
            vid: 1407930,
            spelling: '多読',
            reading: 'たどく',
            partOfSpeech: ['Noun', 'Verb (する)'],
        });
    });

    it('renders JPDB vocabulary page compounds and examples in the popup JPDB source', () => {
        const info = parseJpdbVocabularyHtml(`
            <div class="subsection-meanings">
                <h6 class="subsection-label">Meanings</h6>
                <div class="subsection">
                    <div class="description">1.  head of state</div>
                    <div class="description">2.  national leader</div>
                </div>
            </div>
            <div class="subsection-composed-of-vocabulary">
                <h6 class="subsection-label">Composed of</h6>
                <div class="subsection">
                    <div><div class="spelling"><a href="/vocabulary/2/%E5%9B%BD%E5%AE%B6/%E3%81%93%E3%81%A3%E3%81%8B"><ruby>国家<rt>こっか</rt></ruby></a></div><div class="description">state; country; nation</div></div>
                    <div><div class="spelling"><a href="/vocabulary/3/%E4%B8%BB%E5%B8%AD/%E3%81%97%E3%82%85%E3%81%9B%E3%81%8D"><ruby>主席<rt>しゅせき</rt></ruby></a></div><div class="description">chairman; governor</div></div>
                </div>
            </div>
            <div class="subsection-examples">
                <h6 class="subsection-label">Monolingual examples</h6>
                <div class="subsection"><div class="example"><a class="icon-link example-audio" href="#" data-audio="m1/example-audio"></a><span class="sentence"><ruby>大統領<rt>だいとうりょう</rt></ruby>は、中国の国家主席と話をする予定です。</span><span class="translation">The president plans to talk with China's national leader.</span></div></div>
            </div>
            <div class="subsection-used-in">
                <h6 class="subsection-label">Used in vocabulary</h6>
                <div class="subsection">
                    <div class="used-in">
                        <a class="icon-link vocabulary-audio" href="#" data-audio="m1/used-in-audio"></a>
                        <div class="jp"><a href="/vocabulary/4/%E5%9B%BD%E5%AE%B6%E4%B8%BB%E7%BE%A9/%E3%81%93%E3%81%A3%E3%81%8B%E3%81%97%E3%82%85%E3%81%8E#a"><ruby>国家<rt>こっか</rt></ruby>主義</a></div>
                        <div class="en">nationalism</div>
                    </div>
                </div>
            </div>
        `);

        const html = renderJpdbDefinitionSource({
            ...card,
            spelling: '国家主席',
            reading: 'こっかしゅせき',
            meanings: [{ glosses: ['head of state'], partOfSpeech: ['noun'] }],
        }, (key, initiallyExpanded) => `data-source-state-key="${key}" data-source-initial-open="${String(initiallyExpanded ?? true)}"${initiallyExpanded ? ' open' : ''}`, info);

        expect(html).toContain('head of state');
        expect(html).not.toContain('Composed of');
        expect(html).toContain('国家');
        expect(html).toContain('主席');
        expect(html).toContain('href="#jpdb-reader-dictionary-lookup"');
        expect(html).toContain('data-dictionary-lookup="国家"');
        expect(html).toContain('data-dictionary-reading="こっか"');
        expect(html).toContain('jpdb-reader-passive-word jpdb-not-in-deck jpdb-pitch-unknown jpdb-reader-jpdb-compound-term');
        expect(html).not.toContain('jpdb-reader-jpdb-compound-term jpdb-reader-parseable');
        expect(info?.usedInVocabulary).toHaveLength(1);
        expect(info?.usedInVocabulary?.[0]).toMatchObject({
            term: '国家主義',
            reading: 'こっかしゅぎ',
            meaning: 'nationalism',
            url: '/vocabulary/4/%E5%9B%BD%E5%AE%B6%E4%B8%BB%E7%BE%A9/%E3%81%93%E3%81%A3%E3%81%8B%E3%81%97%E3%82%85%E3%81%8E#a',
            audioIds: ['m1/used-in-audio'],
        });
        expect(info?.usedInVocabulary?.[0]?.termHtml).toContain('<rt class="jpdb-reader-furi">こっか</rt>');
        expect(html).toContain('jpdb-reader-jpdb-used-in-group');
        expect(html).toContain('Used in vocabulary');
        expect(html).toContain('data-source-state-key="definition-source:__jpdb__:used-in-vocabulary"');
        expect(html).toContain('data-dictionary-lookup="国家主義"');
        expect(html).toContain('jpdb-reader-jpdb-compound-term jpdb-reader-jpdb-used-in-term');
        expect(html).toContain('data-expression="国家主義"');
        expect(html).toContain('data-jpdb-reader-related-word="true"');
        expect(html).toContain('data-card-source="jpdb"');
        expect(html).toContain('data-card-state="not-in-deck"');
        expect(html).toContain('data-pitch-class="unknown"');
        expect(html).toContain('jpdb-reader-passive-word jpdb-not-in-deck jpdb-pitch-unknown');
        expect(html).not.toContain('jpdb-reader-jpdb-used-in-term jpdb-reader-parseable');
        expect(html).toContain('data-action="jpdb-example-audio"');
        expect(html).toContain('data-jpdb-audio="m1/used-in-audio"');
        expect(html).toContain('data-jpdb-example-sentence="国家主義"');
        expect(html).toContain('data-reading="こっかしゅぎ"');
        expect(html).toContain('<rt class="jpdb-reader-furi">こっか</rt>');
        expect(html).toContain('jpdb-reader-has-furi');
        expect(html).not.toContain('<span class="jpdb-reader-jpdb-compound-reading">こっかしゅぎ</span>');
        expect(html).toContain('jpdb-reader-example-count');
        expect(html).not.toContain('jpdb-reader-jpdb-compound-ruby');
        expect(html).toContain('大統領');
        expect(html).toContain('国家主席と話をする予定です。');
        expect(html).toContain('<rt class="jpdb-reader-furi">だいとうりょう</rt>');
        expect(html).not.toContain('data-source-state-key="definition-source:__jpdb_examples__"');
        expect(html).toContain('Example sentences');
        expect(html).toContain('jpdb-reader-jpdb-examples-group');
        expect(html).toContain('data-example-provider="jpdb"');
        expect(html).toContain('data-examples-availability="loaded"');
        expect(html).toContain('data-action="jpdb-example-audio"');
        expect(html).toContain('data-jpdb-audio="m1/example-audio"');
        expect(html).toContain('jpdb-reader-example-sentence jpdb-reader-parseable');
        expect(html).toContain('jpdb-reader-example-translation');
        expect(html).not.toContain('jpdb-reader-example-translation jpdb-reader-parseable');
    });

    it('keeps JPDB used-in vocabulary compounds atomic when popup examples are parsed', async () => {
        const info = parseJpdbVocabularyHtml(`
            <link rel="canonical" href="https://jpdb.io/vocabulary/1300/下/した">
            <div class="result vocabulary">
                <a href="/vocabulary/1300/下/した#a"><ruby>下<rt>した</rt></ruby></a>
                <div class="subsection-meanings"><div class="subsection"><div class="description">below; under</div></div></div>
                <div class="subsection-used-in">
                    <h6 class="subsection-label">Used in vocabulary</h6>
                    <div class="subsection">
                        <div class="used-in">
                            <div class="jp"><a class="plain" href="/vocabulary/1419500/%E5%B9%B4%E4%B8%8B/%E3%81%A8%E3%81%97%E3%81%97%E3%81%9F#a"><ruby>年<rt>とし</rt></ruby><span class="highlight"><ruby>下<rt>した</rt></ruby></span></a></div>
                            <div class="en">younger; junior</div>
                        </div>
                    </div>
                </div>
                <div class="subsection-examples">
                    <h6 class="subsection-label">Examples</h6>
                    <div class="subsection"><div class="example"><span class="sentence"><ruby>年<rt>とし</rt></ruby><ruby>下<rt>した</rt></ruby>です。</span></div></div>
                </div>
            </div>
        `, '下', 'した');
        expect(info?.usedInVocabulary?.[0]).toMatchObject({
            term: '年下',
            reading: 'としした',
            meaning: 'younger; junior',
            url: '/vocabulary/1419500/%E5%B9%B4%E4%B8%8B/%E3%81%A8%E3%81%97%E3%81%97%E3%81%9F#a',
        });

        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.innerHTML = renderJpdbDefinitionSource({
            ...card,
            spelling: '下',
            reading: 'した',
            meanings: [{ glosses: ['below; under'], partOfSpeech: ['noun'] }],
        }, key => `data-source-state-key="${key}"`, info);
        document.body.append(popover);

        const parse = vi.fn(async (texts: string[]) => texts.map(text => [
            {
                card: { ...card, vid: 101, sid: 0, spelling: '年', reading: 'ねん', cardState: ['known'], pitchAccent: [] },
                start: 0,
                end: 1,
                length: 1,
                rubies: [],
                pitchClass: '',
                sentence: text,
            },
            {
                card: { ...card, vid: 102, sid: 0, spelling: '下', reading: 'した', cardState: ['known'], pitchAccent: [] },
                start: 1,
                end: 2,
                length: 1,
                rubies: [],
                pitchClass: '',
                sentence: text,
            },
        ]));
        const showWord = vi.fn(async (_word: HTMLElement, _options: { trigger?: 'click' | 'hover'; navigation?: string; userGesture?: boolean }) => undefined);
        const lookupDictionaryReference = vi.fn(async (
            _query: string,
            _reading: string,
            _sourceDictionary: string,
            _anchor: HTMLElement | undefined,
            _trigger: 'modal' | 'hover',
            _preservePosition?: boolean,
        ) => undefined);
        const app = new ReaderApp();
        const internals = app as unknown as {
            activePopover: HTMLElement;
            settings: typeof DEFAULT_SETTINGS;
            parser: { parse: typeof parse };
            showWord: typeof showWord;
            lookupDictionaryReference: typeof lookupDictionaryReference;
            handleDictionaryLookupLink(event: MouseEvent, anchor: HTMLElement | undefined, trigger: 'modal' | 'hover'): boolean;
            parsePopoverJapanese(popover: HTMLElement): Promise<void>;
        };
        internals.activePopover = popover;
        internals.settings = {
            ...DEFAULT_SETTINGS,
            audioEnabled: false,
            ankiEnabled: false,
            localDictionariesEnabled: false,
            jpdbDefinitionsEnabled: false,
            showPitchAccent: false,
        };
        internals.parser = { parse };
        internals.showWord = showWord;
        internals.lookupDictionaryReference = lookupDictionaryReference;

        try {
            await internals.parsePopoverJapanese(popover);

            expect(parse).toHaveBeenCalledWith(['年下です。'], expect.any(Object));
            const usedInWords = Array.from(popover.querySelectorAll<HTMLElement>('.jpdb-reader-jpdb-used-in .jpdb-reader-word'));
            expect(usedInWords.map(word => readerWordSurfaceText(word))).toEqual(['年下']);
            expect(usedInWords[0]?.dataset.expression).toBe('年下');
            expect(usedInWords[0]?.dataset.reading).toBe('としした');
            expect(usedInWords[0]?.dataset.vid).toBe('1419500');
            expect(usedInWords[0]?.classList.contains('jpdb-reader-has-furi')).toBe(true);
            expect(Array.from(usedInWords[0]?.querySelectorAll('rt') ?? []).map(rt => rt.textContent)).toEqual(['とし', 'した']);
            expect(Array.from(popover.querySelectorAll<HTMLElement>('.jpdb-reader-jpdb-example .jpdb-reader-word')).map(word => readerWordSurfaceText(word))).toEqual(['年', '下']);
            expect(Array.from(popover.querySelectorAll<HTMLElement>('.jpdb-reader-jpdb-example .jpdb-reader-word')).map(word => word.closest('ruby')?.querySelector('rt')?.textContent)).toEqual(['とし', 'した']);

            let handled = false;
            popover.addEventListener('click', event => {
                handled = internals.handleDictionaryLookupLink(event as MouseEvent, popover, 'modal');
            });
            const event = new MouseEvent('click', { bubbles: true, cancelable: true });
            usedInWords[0]?.dispatchEvent(event);

            expect(handled).toBe(true);
            expect(event.defaultPrevented).toBe(true);
            expect(showWord).not.toHaveBeenCalled();
            expect(lookupDictionaryReference).toHaveBeenCalledWith('年下', 'としした', 'JPDB', popover, 'modal', true);
        } finally {
            app.destroy();
            popover.remove();
        }
    });

    it('renders plain JPDB example targets as passive ruby/pitch words', () => {
        const host = document.createElement('div');
        host.innerHTML = renderJpdbDefinitionSource({
            ...card,
            vid: 1456360,
            sid: 0,
            spelling: '読む',
            reading: 'よむ',
            meanings: [{ glosses: ['to read'], partOfSpeech: [] }],
            pitchAccent: [],
        }, key => `data-source-state-key="${key}"`, {
            meanings: ['to read'],
            compounds: [],
            usedInVocabulary: [],
            examples: [{
                sentence: '空気を読む。',
                translation: 'Read the room.',
                audioIds: ['m1/plain-example'],
            }],
        });

        const target = host.querySelector<HTMLElement>('.jpdb-reader-jpdb-example .jpdb-reader-word[data-expression="読む"]');
        expect(target).not.toBeNull();
        expect(target?.classList.contains('jpdb-reader-passive-word')).toBe(true);
        expect(target?.classList.contains('jpdb-not-in-deck')).toBe(true);
        expect(target?.classList.contains('jpdb-pitch-unknown')).toBe(true);
        expect(target?.classList.contains('jpdb-reader-has-furi')).toBe(true);
        expect(target?.dataset.jpdbReaderRelatedWord).toBe('true');
        expect(target?.dataset.vid).toBe('1456360');
        expect(target?.dataset.sid).toBe('0');
        expect(target?.dataset.reading).toBe('よむ');
        expect(target?.dataset.sentence).toBe('空気を読む。');
        expect(target?.querySelector('rt')?.textContent).toBe('よむ');
        expect(host.querySelector('.jpdb-reader-jpdb-example-audio')?.getAttribute('data-jpdb-example-sentence')).toBe('空気を読む。');
    });

    it('keeps host page section spacing out of JPDB compound extras', () => {
        const style = document.createElement('style');
        style.textContent = `
            section { margin: 96px; padding: 48px; }
            ${POPOVER_CORE_CSS}
        `;
        const host = document.createElement('div');
        host.setAttribute('data-jpdb-reader-root', '');
        host.innerHTML = renderJpdbDefinitionSource({
            ...card,
            spelling: '無料',
            reading: 'むりょう',
            meanings: [{ glosses: ['free; gratis'], partOfSpeech: [] }],
        }, key => `data-source-state-key="${key}" open`, {
            meanings: ['free; gratis'],
            compounds: [
                { term: '無', reading: 'む', meaning: 'nothing; naught; nought; un-; non-', url: '/vocabulary/1' },
                { term: '料', reading: 'りょう', meaning: 'fee; charge; rate; material', url: '/vocabulary/2' },
            ],
            usedInVocabulary: [
                { term: '無料体験', reading: 'むりょうたいけん', meaning: 'free trial', url: '/vocabulary/3' },
            ],
            examples: [],
        });
        document.head.append(style);
        document.body.append(host);

        try {
            const extra = host.querySelector<HTMLElement>('.jpdb-reader-jpdb-extra');
            expect(extra).not.toBeNull();
            const computed = getComputedStyle(extra!);
            expect(computed.marginTop).toBe('0px');
            expect(computed.marginBottom).toBe('0px');
            expect(computed.paddingTop).toBe('0px');
            expect(computed.paddingBottom).toBe('0px');
        } finally {
            host.remove();
            style.remove();
        }
    });

    it('does not suppress reader underline styling on used-in vocabulary words', () => {
        const normalizedCss = POPOVER_CORE_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss).not.toContain('.jpdb-reader-jpdb-used-in-term .jpdb-reader-word');
    });

    it('opens the top-level JPDB definition source by default', () => {
        const calls: Array<{ key: string; initiallyExpanded: boolean | undefined }> = [];
        const html = renderJpdbDefinitionSource({
            ...card,
            spelling: '前後',
            reading: 'ぜんご',
            meanings: [{ glosses: ['front and rear'], partOfSpeech: [] }],
        }, (key, initiallyExpanded) => {
            calls.push({ key, initiallyExpanded });
            return `data-source-state-key="${key}" data-source-initial-open="${String(initiallyExpanded)}"${initiallyExpanded ? ' open' : ''}`;
        });

        expect(calls[0]).toEqual({ key: definitionSourceStateKey('__jpdb__'), initiallyExpanded: true });
        expect(html).toContain('data-source="jpdb"');
        expect(html).toContain('data-source-initial-open="true" open');
    });

    it('parses live-shaped JPDB used-in rows, example audio, and keeps popup extras bounded', () => {
        const info = parseJpdbVocabularyHtml(`
            <link rel="canonical" href="https://jpdb.io/vocabulary/1549340/嵐/あらし">
            <div class="result vocabulary">
                <a href="/vocabulary/1549340/嵐/あらし#a"><ruby>嵐<rt>あらし</rt></ruby></a>
                <div class="subsection-meanings"><div class="subsection"><div class="description">1. storm; tempest</div></div></div>
                <div class="subsection-used-in">
                    <h6 class="subsection-label">Used in vocabulary (18 in total)</h6>
                    <div class="subsection">
                        <div class="used-in"><div class="jp"><a class="plain" href="/vocabulary/1291650/砂嵐/すなあらし#a"><ruby>砂<rt>すな</rt></ruby><span class="highlight"><ruby>嵐<rt>あらし</rt></ruby></span></a></div><div class="en">sandstorm</div></div>
                        <div class="used-in"><div class="jp"><a class="plain" href="/vocabulary/1381790/青嵐/あおあらし#a"><ruby>青<rt>あお</rt></ruby><span class="highlight"><ruby>嵐<rt>あらし</rt></ruby></span></a></div><div class="en">mountain air</div></div>
                        <div class="used-in"><div class="jp"><a class="plain" href="/vocabulary/1786730/大嵐/おおあらし#a"><ruby>大<rt>おお</rt></ruby><span class="highlight"><ruby>嵐<rt>あらし</rt></ruby></span></a></div><div class="en">raging storm</div></div>
                        <div class="used-in"><div class="jp"><a class="plain" href="/vocabulary/1/春嵐/はるあらし#a"><ruby>春<rt>はる</rt></ruby><span class="highlight"><ruby>嵐<rt>あらし</rt></ruby></span></a></div><div class="en">spring storm</div></div>
                    </div>
                </div>
                <div class="subsection-examples">
                    <h6 class="subsection-label">Examples (55 in total)</h6>
                    <div class="subsection">
                        <div><a class="icon-link example-audio" href="#" data-audio="m1/e9cac7e3d132"></a><div class="used-in"><div class="jp"><span class="highlight"><ruby>嵐<rt>あらし</rt></ruby></span>になりそうです。</div><div class="en">There's going to be a storm.</div></div></div>
                        <div><a class="icon-link example-audio" href="#" data-audio="m1/7ab144f810b0"></a><div class="used-in"><div class="jp">この<span class="highlight"><ruby>嵐<rt>あらし</rt></ruby></span>はいつまで続くんだろう？</div><div class="en">How long will this storm last?</div></div></div>
                        <div><a class="icon-link example-audio" href="#" data-audio="m1/cb7ee21b999b"></a><div class="used-in"><div class="jp"><span class="highlight"><ruby>嵐<rt>あらし</rt></ruby></span>が私たちの町に近づいていた。</div><div class="en">A storm was approaching our town.</div></div></div>
                        <div><a class="icon-link example-audio" href="#" data-audio="m1/extra"></a><div class="used-in"><div class="jp"><span class="highlight"><ruby>嵐<rt>あらし</rt></ruby></span>がしだいにおさまってきた。</div><div class="en">The storm has gradually abated.</div></div></div>
                    </div>
                </div>
            </div>
        `, '嵐', 'あらし');

        expect(info?.usedInVocabulary).toHaveLength(3);
        expect(info?.usedInVocabulary?.map(entry => entry.term)).toEqual(['砂嵐', '青嵐', '大嵐']);
        expect(info?.examples).toHaveLength(3);
        expect(info?.examples[0]).toMatchObject({
            sentence: '嵐になりそうです。',
            translation: "There's going to be a storm.",
            audioIds: ['m1/e9cac7e3d132'],
        });
        expect(info?.examples.map(example => example.audioIds?.[0])).not.toContain('m1/extra');
    });

    it('hydrates JPDB used-in vocabulary audio from the linked vocabulary pages', async () => {
        const requested: Array<{ target: string; credentials?: RequestCredentials }> = [];
        const mainHtml = `
            <link rel="canonical" href="https://jpdb.io/vocabulary/1456360/読む/よむ">
            <div class="result vocabulary">
                <a href="/vocabulary/1456360/読む/よむ#a"><ruby>読<rt>よ</rt></ruby>む</a>
                <div class="subsection-used-in">
                    <h6 class="subsection-label">Used in vocabulary (12 in total)</h6>
                    <div class="subsection">
                        <div class="used-in"><a class="icon-link vocabulary-audio" href="#" data-audio="m1/public-2181100"></a><div class="jp"><a class="plain" href="/vocabulary/2181100/空気を読む/くうきをよむ#a"><ruby>空<rt>くう</rt></ruby><ruby>気<rt>き</rt></ruby><ruby>を</ruby><span class="highlight"><ruby>読<rt>よ</rt></ruby><ruby>む</ruby></span></a></div><div class="en">to read the situation; to sense the mood</div></div>
                        <div class="used-in"><a class="icon-link vocabulary-audio" href="#" data-audio="m1/public-2835842"></a><div class="jp"><a class="plain" href="/vocabulary/2835842/心を読む/こころをよむ#a"><ruby>心<rt>こころ</rt></ruby><ruby>を</ruby><span class="highlight"><ruby>読<rt>よ</rt></ruby><ruby>む</ruby></span></a></div><div class="en">to read somebody's thoughts</div></div>
                        <div class="used-in"><a class="icon-link vocabulary-audio" href="#" data-audio="m1/public-2401820"></a><div class="jp"><a class="plain" href="/vocabulary/2401820/行間を読む/ぎょうかんをよむ#a"><ruby>行<rt>ぎょう</rt></ruby><ruby>間<rt>かん</rt></ruby><ruby>を</ruby><span class="highlight"><ruby>読<rt>よ</rt></ruby><ruby>む</ruby></span></a></div><div class="en">to read between the lines</div></div>
                    </div>
                </div>
            </div>
        `;
        const detailPage = (vid: number, expression: string, reading: string, audio: string) => `
            <link rel="canonical" href="https://jpdb.io/vocabulary/${vid}/${expression}/${reading}">
            <div class="result vocabulary">
                <div class="subsection-headword">
                    <a href="/vocabulary/${vid}/${expression}/${reading}#a"><ruby>${expression}<rt>${reading}</rt></ruby></a>
                    <a class="icon-link vocabulary-audio" href="#" data-audio="${audio}"></a>
                </div>
                <div class="subsection-examples">
                    <h6 class="subsection-label">Examples</h6>
                    <div class="subsection"><div><a class="icon-link example-audio" href="#" data-audio="m1/example-${vid}"></a><div class="used-in"><div class="jp">${expression}。</div></div></div></div>
                </div>
            </div>
        `;
        vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
            const target = unproxiedFetchTarget(input);
            requested.push({ target, credentials: init?.credentials });
            if (target.includes('/vocabulary/1456360/')) return Promise.resolve(new Response(mainHtml, { status: 200 }));
            if (target.includes('/vocabulary/2181100/')) return Promise.resolve(new Response(detailPage(2181100, '空気を読む', 'くうきをよむ', 'm1/e34618eb5d6d,f1/89adb0fd4757,m2/234e74346314,f2/2f2b8b0e8d55'), { status: 200 }));
            if (target.includes('/vocabulary/2835842/')) return Promise.resolve(new Response(detailPage(2835842, '心を読む', 'こころをよむ', 'm1/1c95e7653e90,f1/d2c41aaf6b5e,m2/875e29c679cd,f2/75d11c8724c7'), { status: 200 }));
            if (target.includes('/vocabulary/2401820/')) return Promise.resolve(new Response(detailPage(2401820, '行間を読む', 'ぎょうかんをよむ', 'm1/ef8217741b0e,f1/c20d2e85c6e3,m2/878b02c74a6d,f2/2ae14802a2f2'), { status: 200 }));
            return Promise.resolve(new Response('not found', { status: 404 }));
        }));

        try {
            const client = new JpdbVocabularyClient(() => TEST_PROXY_URL);
            const info = await client.lookup(1456360, '読む', 'よむ');
            const html = renderJpdbDefinitionSource({
                ...card,
                vid: 1456360,
                spelling: '読む',
                reading: 'よむ',
            }, (key, initiallyExpanded) => `data-source-state-key="${key}"${initiallyExpanded ? ' open' : ''}`, info);

            expect(info?.usedInVocabulary?.map(entry => [entry.term, entry.audioIds])).toEqual([
                ['空気を読む', ['m1/e34618eb5d6d', 'f1/89adb0fd4757', 'm2/234e74346314', 'f2/2f2b8b0e8d55']],
                ['心を読む', ['m1/1c95e7653e90', 'f1/d2c41aaf6b5e', 'm2/875e29c679cd', 'f2/75d11c8724c7']],
                ['行間を読む', ['m1/ef8217741b0e', 'f1/c20d2e85c6e3', 'm2/878b02c74a6d', 'f2/2ae14802a2f2']],
            ]);
            expect(requested.map(request => request.target)).toEqual([
                'https://jpdb.io/vocabulary/1456360/%E8%AA%AD%E3%82%80/%E3%82%88%E3%82%80',
                'https://jpdb.io/vocabulary/2181100/%E7%A9%BA%E6%B0%97%E3%82%92%E8%AA%AD%E3%82%80/%E3%81%8F%E3%81%86%E3%81%8D%E3%82%92%E3%82%88%E3%82%80#a',
                'https://jpdb.io/vocabulary/2835842/%E5%BF%83%E3%82%92%E8%AA%AD%E3%82%80/%E3%81%93%E3%81%93%E3%82%8D%E3%82%92%E3%82%88%E3%82%80#a',
                'https://jpdb.io/vocabulary/2401820/%E8%A1%8C%E9%96%93%E3%82%92%E8%AA%AD%E3%82%80/%E3%81%8E%E3%82%87%E3%81%86%E3%81%8B%E3%82%93%E3%82%92%E3%82%88%E3%82%80#a',
            ]);
            expect(requested.every(request => request.credentials === 'same-origin')).toBe(true);
            expect((html.match(/data-action="jpdb-example-audio"/g) ?? [])).toHaveLength(3);
            expect(html).toContain('data-jpdb-audio="m1/e34618eb5d6d,f1/89adb0fd4757,m2/234e74346314,f2/2f2b8b0e8d55"');
            expect(html).toContain('data-jpdb-audio="m1/1c95e7653e90,f1/d2c41aaf6b5e,m2/875e29c679cd,f2/75d11c8724c7"');
            expect(html).toContain('data-jpdb-audio="m1/ef8217741b0e,f1/c20d2e85c6e3,m2/878b02c74a6d,f2/2ae14802a2f2"');
            expect(html).not.toContain('m1/example-2181100');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('parses JPDB monolingual examples by section label', () => {
        const info = parseJpdbVocabularyHtml(`
            <link rel="canonical" href="https://jpdb.io/vocabulary/1608130/難波/なにわ">
            <div class="result vocabulary">
                <a href="/vocabulary/1608130/難波/なにわ#a"><ruby>難<rt>なに</rt>波<rt>わ</rt></ruby></a>
                <div class="subsection-meanings"><div class="subsection"><div class="description">1. Naniwa (former name for Osaka region)</div></div></div>
                <div class="jpdb-example-section">
                    <h6 class="subsection-label">Monolingual examples (44 in total)</h6>
                    <div class="subsection">
                        <div><div class="jp">じゃあちょっと<span class="highlight"><ruby>難<rt>なに</rt>波<rt>わ</rt></ruby></span>の方まで出ようか。</div></div>
                        <div><div class="jp"><span class="highlight"><ruby>難<rt>なに</rt>波<rt>わ</rt></ruby></span>先生に何か言われたの。</div></div>
                        <div><div class="jp">それで、<span class="highlight"><ruby>難<rt>なに</rt>波<rt>わ</rt></ruby></span>は負けたのだ。</div></div>
                        <div><div class="jp">もう一つの<span class="highlight"><ruby>難<rt>なに</rt>波<rt>わ</rt></ruby></span>です。</div></div>
                    </div>
                </div>
            </div>
        `, '難波', 'なにわ');

        expect(info?.examples).toHaveLength(3);
        expect(info?.examples.map(example => example.sentence)).toEqual([
            'じゃあちょっと難波の方まで出ようか。',
            '難波先生に何か言われたの。',
            'それで、難波は負けたのだ。',
        ]);
    });

    it('ignores JPDB media used-in pages in popup supplements', async () => {
        const detailUrl = 'https://jpdb.io/vocabulary/1297200/%E5%92%B2%E3%81%8D%E4%B9%B1%E3%82%8C%E3%82%8B/%E3%81%95%E3%81%8D%E3%81%BF%E3%81%A0%E3%82%8C%E3%82%8B';
        const usedInUrl = 'https://jpdb.io/vocabulary/1297200/%E5%92%B2%E3%81%8D%E4%B9%B1%E3%82%8C%E3%82%8B/used-in';
        const fetchMock = stubJpdbFetchRoutes({
            [detailUrl]: `
                <link rel="canonical" href="https://jpdb.io/vocabulary/1297200/咲き乱れる/さきみだれる">
                <div class="result vocabulary">
                    <a href="/vocabulary/1297200/咲き乱れる/さきみだれる#a"><ruby>咲<rt>さ</rt>き乱れる</ruby></a>
                    <div class="subsection-meanings"><div class="subsection"><div class="description">1. to bloom in profusion</div></div></div>
                    <a class="view-conjugations-link" href="/vocabulary/1297200/咲き乱れる/used-in">Used in: 528</a>
                </div>
            `,
        });

        try {
            const info = await new JpdbVocabularyClient().lookup(1297200, '咲き乱れる', 'さきみだれる');
            const html = renderJpdbDefinitionSource({
                ...card,
                spelling: '咲き乱れる',
                reading: 'さきみだれる',
                meanings: [{ glosses: ['to bloom in profusion'], partOfSpeech: ['verb'] }],
            }, key => `data-source-state-key="${key}"`, info);

            expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([detailUrl]);
            expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain(usedInUrl);
            expect(html).toContain('to bloom in profusion');
            expect(html).not.toContain('jpdb-reader-jpdb-used-in-sources-group');
            expect(html).not.toContain('Used in: 528');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('follows JPDB search result detail links for fallback cards before rendering extras', async () => {
        const searchUrl = 'https://jpdb.io/search?q=%E4%B8%80%E6%96%B9';
        const detailUrl = 'https://jpdb.io/vocabulary/1166510/%E4%B8%80%E6%96%B9/%E3%81%84%E3%81%A3%E3%81%BD%E3%81%86#a';
        const usedInAudioUrl = 'https://jpdb.io/vocabulary/1166560/%E4%B8%80%E6%96%B9%E7%9A%84/%E3%81%84%E3%81%A3%E3%81%BD%E3%81%86%E3%81%A6%E3%81%8D#a';
        const usedInUrl = 'https://jpdb.io/vocabulary/1166510/%E4%B8%80%E6%96%B9/used-in';
        const fetchMock = stubJpdbFetchRoutes({
            [searchUrl]: `
                    <div class="results search">
                        <div class="result vocabulary">
                            <a href="/vocabulary/1166510/一方/いっぽう#a"><ruby>一<rt>いっ</rt>方<rt>ぽう</rt></ruby></a>
                            <div class="subsection-meanings"><div class="subsection"><div class="description">1. one; the other</div></div></div>
                            <a class="view-conjugations-link" href="/vocabulary/1166510/一方/いっぽう#a">More details...</a>
                            <a class="view-conjugations-link" href="/vocabulary/1166510/一方/used-in">Used in: 4067</a>
                        </div>
                    </div>
                `,
            [detailUrl]: `
                    <link rel="canonical" href="https://jpdb.io/vocabulary/1166510/一方/いっぽう">
                    <div class="result vocabulary">
                        <a href="/vocabulary/1166510/一方/いっぽう#a"><ruby>一<rt>いっ</rt>方<rt>ぽう</rt></ruby></a>
                        <div class="subsection-meanings"><div class="subsection"><div class="description">1. one; the other</div></div></div>
                        <div class="subsection-used-in">
                            <h6 class="subsection-label">Used in vocabulary (7 in total)</h6>
                            <div class="subsection">
                                <div class="used-in"><div class="jp"><a class="plain" href="/vocabulary/1166560/一方的/いっぽうてき#a"><ruby>一方的<rt>いっぽうてき</rt></ruby></a></div><div class="en">one-sided</div></div>
                            </div>
                        </div>
                        <div class="subsection-examples">
                            <h6 class="subsection-label">Examples (14 in total)</h6>
                            <div class="subsection">
                                <div><a class="icon-link example-audio" href="#" data-audio="m1/126be5be3a94"></a><div class="used-in"><div class="jp">生活費は上がる<span class="highlight"><ruby>一<rt>いっ</rt>方<rt>ぽう</rt></ruby></span>だ。</div><div class="en">The cost of living is rising.</div></div></div>
                            </div>
                        </div>
                    </div>
                `,
            [usedInAudioUrl]: `
                    <link rel="canonical" href="https://jpdb.io/vocabulary/1166560/一方的/いっぽうてき">
                    <div class="result vocabulary">
                        <div class="subsection-headword">
                            <a href="/vocabulary/1166560/一方的/いっぽうてき#a"><ruby>一方的<rt>いっぽうてき</rt></ruby></a>
                            <a class="icon-link vocabulary-audio" href="#" data-audio="m1/ippouteki"></a>
                        </div>
                        <div class="subsection-examples">
                            <h6 class="subsection-label">Examples</h6>
                            <div class="subsection">
                                <div><a class="icon-link example-audio" href="#" data-audio="m1/not-used-in-word-audio"></a><div class="used-in"><div class="jp">一方的だ。</div></div></div>
                            </div>
                        </div>
                    </div>
                `,
        });

        try {
            const info = await new JpdbVocabularyClient().lookup(-1, '一方', 'いっぽう');
            const html = renderJpdbDefinitionSource({
                ...card,
                vid: -1,
                sid: -1,
                spelling: '一方',
                reading: 'いっぽう',
                meanings: [{ glosses: ['one; the other'], partOfSpeech: ['noun'] }],
                source: 'fallback',
            }, key => `data-source-state-key="${key}"`, info);

            const requestedUrls = fetchMock.mock.calls.map(([url]) => unproxiedFetchTarget(url));
            expect(requestedUrls).toEqual([searchUrl, detailUrl, usedInAudioUrl]);
            expect(requestedUrls).not.toContain(usedInUrl);
            expect(info?.usedInVocabulary?.[0]).toMatchObject({ term: '一方的', reading: 'いっぽうてき', meaning: 'one-sided', audioIds: ['m1/ippouteki'] });
            expect(info?.examples?.[0]).toMatchObject({
                sentence: '生活費は上がる一方だ。',
                translation: 'The cost of living is rising.',
                audioIds: ['m1/126be5be3a94'],
            });
            expect(html).toContain('Used in vocabulary');
            expect(html).toContain('Example sentences');
            expect(html).toContain('data-jpdb-audio="m1/ippouteki"');
            expect(html).toContain('data-jpdb-audio="m1/126be5be3a94"');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('renders public JPDB meanings for local cards without leaking local dictionary meanings into the JPDB source', () => {
        const info = parseJpdbVocabularyHtml(`
            <link rel="canonical" href="https://jpdb.io/vocabulary/1456360/%E8%AA%AD%E3%82%80/%E3%82%88%E3%82%80">
            <div class="result vocabulary">
                <a href="/vocabulary/1456360/%E8%AA%AD%E3%82%80/%E3%82%88%E3%82%80#a">読む</a>
                <div class="subsection-meanings">
                    <h6 class="subsection-label">Meanings</h6>
                    <div class="subsection">
                        <div class="description">1.  to read</div>
                    </div>
                </div>
            </div>
        `, '読む', 'よむ');

        const html = renderJpdbDefinitionSource({
            ...card,
            spelling: '読む',
            reading: 'よむ',
            meanings: [{ glosses: ['local-only meaning'], partOfSpeech: [] }],
            source: 'local',
        }, key => `data-source-state-key="${key}"`, info);

        expect(info?.meanings).toEqual(['to read']);
        expect(html).toContain('to read');
        expect(html).not.toContain('local-only meaning');
    });

    it('uses JPDB component terms as Immersion Kit fallback queries for compounds', async () => {
        localStorage.clear();
        window.history.replaceState(null, '', '/vocabulary/1/%E5%9B%BD%E5%AE%B6%E4%B8%BB%E5%B8%AD/%E3%81%93%E3%81%A3%E3%81%8B%E3%81%97%E3%82%85%E3%81%9B%E3%81%8D#a');
        const search = vi.fn(async (query: string) => query === '国家'
            ? [testImmersionKitExample({
                id: 'ik-1',
                sentence: '国家のために働く。',
                translation: 'Work for the country.',
                sourceTitle: 'Show',
                titleSlug: 'show',
                soundFile: 'audio.mp3',
            })]
            : []);
        const controller = testImmersionPopoverController({
            settings: {
                immersionKitEnabled: true,
                immersionKitShowImages: false,
            },
            search,
        });
        const compoundCard = { ...card, spelling: '国家主席', reading: 'こっかしゅせき' };

        const result = await controller.searchExamples(compoundCard, { relatedQueries: ['国家', '主席'] });

        expect(search).toHaveBeenNthCalledWith(1, '国家主席', expect.any(Object), expect.objectContaining({ requestLimit: 10, resultLimit: DEFAULT_SETTINGS.immersionKitLimit }));
        expect(search).toHaveBeenNthCalledWith(2, '国家', expect.any(Object), expect.objectContaining({ requestLimit: 10, resultLimit: DEFAULT_SETTINGS.immersionKitLimit }));
        expect(result.query).toBe('国家');
        expect(result.examples[0]?.sourceTitle).toBe('Show');
        expect(result.examples[0]?.sentence).toBe('国家のために働く。');
        expect(result.usedFallback).toBe(true);
    });

    it('uses exact Immersion Kit hits without waiting for parsed fallback queries', async () => {
        const search = vi.fn(async (query: string) => query === '国家主席'
            ? [{
                id: 'ik-exact',
                sentence: '国家主席と話をする。',
                sentenceWithFurigana: '',
                translation: 'Talk with the president.',
                sourceTitle: 'News',
                titleSlug: 'news',
                category: 'drama',
                soundFile: '',
                imageFile: '',
                soundUrl: '',
                imageUrl: '',
            }]
            : []);
        const parseJapanese = vi.fn(async () => {
            throw new Error('fallback parsing should not run for an exact hit');
        });
        const controller = testImmersionPopoverController({
            client: { search },
            parseJapanese,
            canParseJapanese: () => true,
        });

        const result = await controller.searchExamples({ ...card, spelling: '国家主席', reading: 'こっかしゅせき' });

        expect(result.query).toBe('国家主席');
        expect(result.usedFallback).toBe(false);
        expect(search).toHaveBeenCalledTimes(1);
        expect(parseJapanese).not.toHaveBeenCalled();
    });

    it('parses popup Immersion Kit sentences with local pitch and segmented fallback when no API key is set', async () => {
        const sentence = '｢化ける｣の文字の成り立ちに言及してる。';
        const fallbackToken: JPDBToken = {
            card: {
                ...card,
                vid: -443,
                sid: -443,
                spelling: '化ける',
                reading: '',
                source: 'fallback',
                pitchAccent: [],
            },
            start: 1,
            end: 4,
            length: 3,
            rubies: [],
            pitchClass: '',
            sentence,
        };
        const parseJapanese = vi.fn(async () => [[fallbackToken]]);
        const controller = testImmersionPopoverController({
            settings: {
                apiKey: '',
                localDictionariesEnabled: true,
                showPitchAccent: true,
            },
            parseJapanese,
            canParseJapanese: () => true,
        });
        const internals = parsedExampleSentenceInternals(controller);

        await expect(internals.parsedExampleSentenceTokens(sentence)).resolves.toEqual([fallbackToken]);

        expect(parseJapanese).toHaveBeenCalledWith([sentence], {
            allowSegmentedFallback: true,
            includeLocalPitch: true,
            requireApi: true,
            requireJpdb: true,
        });
    });

    it('retries Immersion Kit sentence parsing after an all-fallback timeout result', async () => {
        const fallbackToken: JPDBToken = {
            card: { ...card, spelling: '分', reading: '', source: 'fallback' },
            start: 4,
            end: 5,
            length: 1,
            rubies: [],
            pitchClass: '',
            sentence: '日本語は分かりません。',
        };
        const parsedToken: JPDBToken = {
            card: { ...card, spelling: '分かりません', reading: 'わかりません', source: 'jpdb' },
            start: 4,
            end: 10,
            length: 6,
            rubies: [],
            pitchClass: 'heiban',
            sentence: '日本語は分かりません。',
        };
        const parseJapanese = vi.fn()
            .mockResolvedValueOnce([[fallbackToken]])
            .mockResolvedValueOnce([[parsedToken]]);
        const controller = testImmersionPopoverController({
            parseJapanese,
            canParseJapanese: () => true,
        });
        const internals = parsedExampleSentenceInternals(controller);

        await expect(internals.parsedExampleSentenceTokens('日本語は分かりません。'))
            .resolves.toEqual([fallbackToken]);
        await expect(internals.parsedExampleSentenceTokens('日本語は分かりません。'))
            .resolves.toEqual([parsedToken]);

        expect(parseJapanese).toHaveBeenCalledTimes(2);
    });

    it('passes abort signals through Immersion Kit popup searches and caches completed results', async () => {
        const search = vi.fn(async (_query: string, _settings: typeof DEFAULT_SETTINGS, _options: { signal?: AbortSignal }) => [testImmersionKitExample({
            id: 'ik-1',
            sentence: '食べる。',
            translation: 'Eat.',
            sourceTitle: 'Show',
            titleSlug: 'show',
            soundFile: '',
        })]);
        const controller = testImmersionPopoverController({ search });
        const first = new AbortController();
        const second = new AbortController();

        await controller.searchExamples(card, { signal: first.signal });
        await controller.searchExamples(card, { signal: second.signal });

        expect(search).toHaveBeenCalledTimes(1);
        expect(search.mock.calls[0]?.[2]).toEqual(expect.objectContaining({ signal: first.signal }));
    });

    it('does not start lazy Immersion Kit popup searches until the source is opened', () => (
        withImmersionFakeTimers(async () => {
            const { search, controller, popover, container } = lazyImmersionSearchFixture(false);

            controller.installLazyLoad(popover, card);
            await expectLazyImmersionSearchAfterOpening(container, search);
        })
    ));

    it('loads the open Immersion Kit source even when it sits below the popover fold', async () => {
        vi.useFakeTimers();
        try {
            const { search, controller, popover, container } = lazyImmersionSearchFixture(true);
            // The immersion section is open but rendered below the visible
            // popover area; gating on visibility used to mean it never loaded
            // until the user scrolled (the main "not working" case).
            popover.getBoundingClientRect = () => new DOMRect(0, 0, 360, 120);
            container.getBoundingClientRect = () => new DOMRect(0, 600, 360, 200);

            controller.installLazyLoad(popover, card);
            await vi.advanceTimersByTimeAsync(300);

            expect(search).toHaveBeenCalledTimes(1);
        } finally {
            document.body.replaceChildren();
            vi.useRealTimers();
        }
    });

    it('cancels scheduled lazy Immersion Kit popup searches when the source closes', () => (
        withImmersionFakeTimers(async () => {
            const { search, controller, popover, container } = lazyImmersionSearchFixture(true);

            controller.installLazyLoad(popover, card);
            container.open = false;
            container.dispatchEvent(new Event('toggle'));
            await expectLazyImmersionSearchAfterOpening(container, search);
        })
    ));

    it('aborts in-flight lazy Immersion Kit popup searches when the source closes and can retry', async () => {
        vi.useFakeTimers();
        try {
            let firstSignal: AbortSignal | undefined;
            const search = vi.fn((_query: string, _settings: typeof DEFAULT_SETTINGS, options: { signal?: AbortSignal }) => {
                if (search.mock.calls.length === 1) {
                    firstSignal = options.signal;
                    return new Promise<ImmersionKitExample[]>((_resolve, reject) => {
                        options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
                    });
                }
                return Promise.resolve([immersionExample('食べる。')]);
            });
            const controller = immersionPopoverTestController(search);
            const { popover, container } = immersionLazyLoadSurface(true);

            controller.installLazyLoad(popover, card);
            await vi.advanceTimersByTimeAsync(200);
            await Promise.resolve();

            expect(search).toHaveBeenCalledTimes(1);

            container.open = false;
            container.dispatchEvent(new Event('toggle'));
            expect(firstSignal?.aborted).toBe(true);

            await openLazyImmersionSource(container);

            expect(search).toHaveBeenCalledTimes(2);
        } finally {
            document.body.replaceChildren();
            vi.useRealTimers();
        }
    });

    it('backs off Immersion Kit network searches after a 429 response', async () => {
        const configuredProxyUrl = 'https://proxy.example/fetch';
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Too Many Requests', {
            status: 429,
            statusText: 'Too Many Requests',
        }));
        try {
            const client = new ImmersionKitClient();
            const settings = { ...DEFAULT_SETTINGS, immersionKitEnabled: true, audioTimeoutMs: 1000, corsProxyUrl: configuredProxyUrl };

            await expect(client.search('読む', settings, { requestLimit: 1, resultLimit: 1 })).rejects.toThrow(/429|rate/i);
            await expect(client.search('書く', settings, { requestLimit: 1, resultLimit: 1 })).rejects.toThrow(/rate/i);

            expect(fetchSpy).toHaveBeenCalledTimes(1);
        } finally {
            fetchSpy.mockRestore();
        }
    });

    it('falls back from stuck card detail providers', async () => {
        vi.useFakeTimers();
        try {
            const never = new Promise<never>(() => undefined);
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: 'api-key',
                audioTimeoutMs: 1000,
                localDictionariesEnabled: true,
                localDictionaryShowKanji: true,
                showPitchAccent: true,
                ankiEnabled: true,
                jpdbMiningEnabled: true,
            };
            const loader = new CardRenderDataLoader({
                getSettings: () => settings,
                dictionaries: {
                    lookup: vi.fn(() => never),
                    lookupKanji: vi.fn(() => never),
                    lookupTermMeta: vi.fn(() => never),
                } as unknown as YomitanDictionaryStore,
                jpdbPublicPitch: { lookup: vi.fn(() => never) } as unknown as JpdbPublicPitchClient,
                jpdbVocabulary: { lookup: vi.fn(() => never) } as unknown as JpdbVocabularyClient,
                anki: {
                    findExistingCards: vi.fn(() => never),
                    deckNames: vi.fn(() => never),
                } as unknown as AnkiConnectClient,
                jpdb: { listDecks: vi.fn(() => never) } as unknown as JpdbClient,
                jiten: { listReaderStudyDecks: vi.fn(() => never) } as unknown as JitenApiClient,
                isJpdbBackedCard: () => true,
            });
            const load = loader.load({ ...card, pitchAccent: [] });
            await vi.advanceTimersByTimeAsync(9000);

            await expect(load.all).resolves.toMatchObject({
                localEntries: [],
                kanjiEntries: [],
                metaEntries: [],
                ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
                jpdbDecks: [],
                ankiDecks: [],
                jpdbVocabularyInfo: null,
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it('does not let slow shared deck lists block card details', async () => {
        vi.useFakeTimers();
        try {
            const never = new Promise<never>(() => undefined);
            const loader = testCardRenderDataLoader({
                settings: cardDetailLoaderSettings({ ankiEnabled: true }),
                anki: {
                    deckNames: vi.fn(() => never),
                },
                jpdb: { listDecks: vi.fn(() => never) },
            });
            const load = loader.load(card).all;

            await vi.advanceTimersByTimeAsync(1_500);

            await expect(load).resolves.toMatchObject({
                ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
                jpdbDecks: [],
                ankiDecks: [],
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it('caches shared deck lists across card detail loads', async () => {
        const listDecks = vi.fn(async () => [{ id: 'deck', name: 'Deck' }]);
        const deckNames = vi.fn(async () => ['Yomu']);
        const loader = testCardRenderDataLoader({
            settings: cardDetailLoaderSettings({ ankiEnabled: true }),
            anki: {
                deckNames,
            },
            jpdb: { listDecks },
        });

        const [first, second] = await Promise.all([
            loader.load(card).all,
            loader.load({ ...card, vid: 4, sid: 5, spelling: '飲む', reading: 'のむ' }).all,
        ]);

        expect(first.jpdbDecks).toEqual([{ id: 'deck', name: 'Deck' }]);
        expect(second.ankiDecks).toEqual(['Yomu']);
        expect(listDecks).toHaveBeenCalledTimes(1);
        expect(deckNames).toHaveBeenCalledTimes(1);
    });

    it('loads Jiten study decks through the shared API mining gate', async () => {
        const listReaderStudyDecks = vi.fn(async () => [{ userStudyDeckId: 12, name: 'Mining' }]);
        const enabledLoader = testCardRenderDataLoader({
            settings: cardDetailLoaderSettings({
                apiKey: '',
                jitenApiKey: 'jiten-key',
                jpdbMiningEnabled: true,
            }),
            jiten: { listReaderStudyDecks },
            isJpdbBackedCard: () => false,
        });

        await expect(enabledLoader.load(jitenTestCard()).all).resolves.toMatchObject({
            jitenDecks: [{ id: '12', name: 'Mining' }],
        });
        expect(listReaderStudyDecks).toHaveBeenCalledTimes(1);

        const disabledListReaderStudyDecks = vi.fn(async () => [{ userStudyDeckId: 13, name: 'Disabled' }]);
        const disabledLoader = testCardRenderDataLoader({
            settings: cardDetailLoaderSettings({
                apiKey: '',
                jitenApiKey: 'jiten-key',
                jpdbMiningEnabled: false,
            }),
            jiten: { listReaderStudyDecks: disabledListReaderStudyDecks },
            isJpdbBackedCard: () => false,
        });

        await expect(disabledLoader.load(jitenTestCard()).all).resolves.toMatchObject({
            jitenDecks: [],
        });
        expect(disabledListReaderStudyDecks).not.toHaveBeenCalled();
    });

    it('renders Jiten vocabulary detail pitch in the popup header graph', async () => {
        const lookupVocabularyInfoForCard = vi.fn(async () => ({
            wordId: 42,
            mainReading: { text: '読む', readingIndex: 2, frequencyRank: 500, usedInMediaAmount: null },
            alternativeReadings: [],
            partsOfSpeech: ['v5m'],
            definitions: [],
            pitchAccents: [1],
            knownStates: ['new' as const],
            composedOf: [],
            usedIn: [],
            usedInTotal: 0,
            examples: [],
        }));
        const loader = testCardRenderDataLoader({
            settings: cardDetailLoaderSettings({
                apiKey: '',
                jitenApiKey: 'jiten-key',
                jitenDefinitionsEnabled: true,
                showPitchAccent: true,
            }),
            jiten: { lookupVocabularyInfoForCard },
            isJpdbBackedCard: () => false,
        });
        const lookupCard = jitenTestCard({ pitchAccent: [] });

        const data = await loader.load(lookupCard).all;

        expect(lookupVocabularyInfoForCard).toHaveBeenCalledWith(lookupCard);
        expect(lookupCard.pitchAccent).toEqual(['HLL']);
        document.body.innerHTML = renderModalCard(testCardPopoverRenderer({
            apiKey: '',
            jitenApiKey: 'jiten-key',
            showPitchAccent: true,
        }), lookupCard, '読む。', data);
        const pitch = document.querySelector('.jpdb-reader-card-tools .jpdb-reader-pitch');
        expect(pitch).not.toBeNull();
        expect(pitch?.querySelector('polyline.atamadaka')).not.toBeNull();
        expect(pitch?.textContent).toContain('よ');
        expect(pitch?.textContent).toContain('む');
    });

    it('loads public JPDB vocabulary details for Jiten-backed cards without a JPDB key', async () => {
        const keylessLookup = vi.fn(async () => ({
            meanings: ['review'],
            compounds: [],
            usedInVocabulary: [],
            examples: [],
        }));
        const keylessLoader = testCardRenderDataLoader({
            settings: cardDetailLoaderSettings({
                apiKey: '',
                jitenApiKey: 'jiten-key',
                jpdbDefinitionsEnabled: true,
                jitenDefinitionsEnabled: true,
                jpdbMiningEnabled: false,
            }),
            jpdbVocabulary: { lookup: keylessLookup },
            isJpdbBackedCard: () => false,
        });
        const jitenCard = jitenTestCard({ spelling: '復習', reading: 'ふくしゅう' });

        await expect(keylessLoader.load(jitenCard).jpdbVocabularyInfo).resolves.toMatchObject({ meanings: ['review'] });
        expect(keylessLookup).toHaveBeenCalledWith(0, '復習', 'ふくしゅう');
    });

});

function mockCompensatedRedditRoot(root: HTMLElement, rectScale: number): void {
    Object.assign(root.dataset, {
        jpdbReaderScaleAdapter: 'apple-touch-page-scale',
        jpdbReaderScaleCompensation: '0.625',
    });
    Object.defineProperty(root, 'offsetWidth', { configurable: true, value: 400 });
    Object.defineProperty(root, 'offsetHeight', { configurable: true, value: 600 });
    root.getBoundingClientRect = () => scaledTestRect(0, 0, 400, 600, rectScale);
}

function scaledTestRect(left: number, top: number, width: number, height: number, scale: number): DOMRect {
    return new DOMRect(left * scale, top * scale, width * scale, height * scale);
}
