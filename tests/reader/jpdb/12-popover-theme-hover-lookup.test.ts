import { describe, expect, it, vi } from 'vitest';
import {
    registerReaderHelpersCleanup,
    CardActionController,
    DEFAULT_SETTINGS,
    Logger,
    RECOMMENDED_JAPANESE_DICTIONARIES,
    ReaderApp,
    SETTINGS_CHANGE_EVENT,
    USERSCRIPT_HTTP_BRIDGE_READY_EVENT,
    YOMU_MODEL_FIELDS,
    YomitanDictionaryStore,
    applyUrlBootstrapSettings,
    buildYomuAnkiFields,
    card,
    detectGrammarHints,
    findRecommendedDictionary,
    getUserscriptHttpRequest,
    glossaryToHtml,
    glossaryToText,
    glossaryValueToSearchText,
    installFirefoxXrayUserscriptBridge,
    installUserscriptHttpBridge,
    installUserscriptHttpBridgeWhenReady,
    lookupCandidateFromPoint,
    mockReaderWordRect,
    normalizeAudioSources,
    normalizeOcrProvider,
    parseYomitanSettingsExport,
    pointerEventLike,
    renderDictionaryScopedStyles,
    renderGrammarHints,
    sanitizeAccentColor,
    stubTestAnkiConnectResults,
    testAnkiClient,
    translateJapaneseSentence,
    waitForExpect,
    withElementsFromPointMock,
    withPointerTextLookupMock,
    withWindowProperty,
    yomitanZipBlob,
} from './fixtures';
import type {
    JPDBCard,
} from './fixtures';

registerReaderHelpersCleanup();

describe('reader helpers', () => {
    it('keeps popover dictionary word hit testing inside the popover surface', () => {
        const app = new ReaderApp();
        const pageWord = document.createElement('span');
        pageWord.className = 'jpdb-reader-word';
        pageWord.dataset.vid = '501';
        pageWord.dataset.sid = '501';
        pageWord.dataset.sentence = '下の言葉';
        pageWord.textContent = '下';
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        popover.innerHTML = `
            <div class="jpdb-reader-popover-body">
                <span class="jpdb-reader-word" data-vid="502" data-sid="502" data-sentence="上の言葉">上</span>
            </div>
        `;
        document.body.append(pageWord, popover);
        const body = popover.querySelector<HTMLElement>('.jpdb-reader-popover-body')!;
        const popoverWord = popover.querySelector<HTMLElement>('.jpdb-reader-word')!;
        mockReaderWordRect(popoverWord, new DOMRect(20, 20, 40, 24));
        const showWord = vi.fn().mockResolvedValue(undefined);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            activePopover: HTMLElement;
            activePopoverMode: 'modal';
            showWord: typeof showWord;
            bindEvents(): void;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnClick: true,
        };
        internals.activePopover = popover;
        internals.activePopoverMode = 'modal';
        internals.showWord = showWord;
        internals.bindEvents();

        try {
            withElementsFromPointMock([body, popover, pageWord], () => {
                const event = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 32, clientY: 30 });
                body.dispatchEvent(event);

                expect(event.defaultPrevented).toBe(true);
                expect(showWord).toHaveBeenCalledWith(popoverWord, expect.objectContaining({
                    trigger: 'click',
                    navigation: 'push-current',
                    userGesture: true,
                }));
            });
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('applies shared theme changes from hosted docs and settings toggles', () => {
        vi.stubGlobal('location', new URL('https://yomureader.com/docs/'));
        const app = new ReaderApp();
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            bindEvents(): void;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            theme: 'dark',
        };
        internals.bindEvents();

        try {
            window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT, { detail: { settings: { theme: 'light' } } }));

            expect(internals.settings.theme).toBe('light');
            expect(document.documentElement.classList.contains('jpdb-reader-theme-light')).toBe(true);
            expect(document.documentElement.classList.contains('jpdb-reader-theme-dark')).toBe(false);
        } finally {
            app.destroy();
            document.documentElement.classList.remove('jpdb-reader-theme-light', 'jpdb-reader-theme-dark');
        }
    });

    it('applies stored Yomu theme to hosted docs when the page class is stale', () => {
        vi.stubGlobal('location', {
            href: 'https://hrussellzfac023.github.io/yomu-reader/',
            origin: 'https://hrussellzfac023.github.io',
            hostname: 'hrussellzfac023.github.io',
            pathname: '/yomu-reader/',
        });
        document.documentElement.classList.remove('dark');
        const app = new ReaderApp();
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            applyTheme(): void;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            theme: 'dark',
        };

        try {
            internals.applyTheme();

            expect(internals.settings.theme).toBe('dark');
            expect(document.documentElement.classList.contains('dark')).toBe(true);
            expect(document.documentElement.classList.contains('jpdb-reader-theme-dark')).toBe(true);
            expect(document.documentElement.classList.contains('jpdb-reader-theme-light')).toBe(false);
        } finally {
            app.destroy();
            vi.unstubAllGlobals();
            document.documentElement.classList.remove('dark', 'jpdb-reader-theme-light', 'jpdb-reader-theme-dark');
        }
    });

    it('does not mirror passive hosted docs class drift back into saved theme settings', () => {
        vi.stubGlobal('location', {
            href: 'https://hrussellzfac023.github.io/yomu-reader/',
            origin: 'https://hrussellzfac023.github.io',
            hostname: 'hrussellzfac023.github.io',
            pathname: '/yomu-reader/',
        });
        document.documentElement.classList.remove('dark');
        const app = new ReaderApp();
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            handleHostThemeChange(theme: 'dark' | 'light'): void;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            theme: 'dark',
        };

        try {
            internals.handleHostThemeChange('light');

            expect(internals.settings.theme).toBe('dark');
            expect(document.documentElement.classList.contains('dark')).toBe(true);
            expect(document.documentElement.classList.contains('jpdb-reader-theme-dark')).toBe(true);
            expect(document.documentElement.classList.contains('jpdb-reader-theme-light')).toBe(false);
        } finally {
            app.destroy();
            vi.unstubAllGlobals();
            document.documentElement.classList.remove('dark', 'jpdb-reader-theme-light', 'jpdb-reader-theme-dark');
        }
    });

    it('segments modal popover Japanese without a JPDB API key', async () => {
        const app = new ReaderApp();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.innerHTML = '<div class="jpdb-reader-parseable">青空を見ます。</div>';
        document.body.append(popover);
        const internals = app as unknown as {
            activePopover: HTMLElement;
            settings: typeof DEFAULT_SETTINGS;
            parsePopoverJapanese(popover: HTMLElement): Promise<void>;
        };
        internals.activePopover = popover;
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            audioEnabled: false,
            ankiEnabled: false,
            jpdbDefinitionsEnabled: false,
            localDictionariesEnabled: false,
            showPitchAccent: false,
        };

        try {
            await internals.parsePopoverJapanese(popover);

            expect([...popover.querySelectorAll<HTMLElement>('.jpdb-reader-word')].map(word => word.textContent)).toEqual(['青空', 'を', '見ます']);
        } finally {
            popover.remove();
            app.destroy();
        }
    });

    it('allows hover pointer lookup on link-card text without enabling click lookup on links', () => {
        document.body.innerHTML = `
            <main>
                <a class="yomu-link-card" href="getting-started">
                    <strong>よむをセットアップ</strong>
                    <span>ユーザースクリプト管理拡張を入れ、よむを追加して、最初の検索を試します。</span>
                </a>
            </main>
        `;
        const title = document.querySelector<HTMLElement>('.yomu-link-card strong')!;
        const app = new ReaderApp();

        try {
            withPointerTextLookupMock(title.firstChild as Text, 1, [{ left: 20, top: 20, width: 152, height: 28 }], () => {
                expect(lookupCandidateFromPoint(app, 52, 30, title)).toBeNull();
                expect(lookupCandidateFromPoint(app, 52, 30, title, { allowPassiveInteractionText: true })).toMatchObject({
                    text: 'よむをセットアップ',
                    offset: 1,
                    start: 0,
                    end: 9,
                    anchor: title,
                });
            });
        } finally {
            app.destroy();
        }
    });

    it('does not use fallback pointer lookup on JPDB native Immersion Kit controls', () => {
        vi.stubGlobal('location', {
            href: 'https://jpdb.io/vocabulary/1/%E4%BB%8A%E6%97%A5/%E3%81%8D%E3%82%87%E3%81%86',
            hostname: 'jpdb.io',
            pathname: '/vocabulary/1/%E4%BB%8A%E6%97%A5/%E3%81%8D%E3%82%87%E3%81%86',
            search: '',
        });
        document.body.innerHTML = `
            <div class="subsection-immersion-kit">
                <div class="immersion-audio-control">今日</div>
            </div>
        `;
        const control = document.querySelector<HTMLElement>('.immersion-audio-control')!;
        const node = control.firstChild as Text;
        const app = new ReaderApp();

        try {
            withPointerTextLookupMock(node, 1, [{ left: 20, top: 20, width: 120, height: 28 }], () => {
                expect(lookupCandidateFromPoint(app, 64, 30, control)).toBeNull();
            });
        } finally {
            app.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('does not use fallback pointer lookup on raw Immersion Kit example sentence text', () => {
        document.body.innerHTML = `
            <div data-jpdb-reader-root="true">
                <details data-immersion-kit open>
                    <div class="jpdb-reader-example-sentence"><span>うでが痛むんで？</span></div>
                </details>
            </div>
        `;
        const text = document.querySelector<HTMLElement>('.jpdb-reader-example-sentence span')!;
        const node = text.firstChild as Text;
        const app = new ReaderApp();

        try {
            withPointerTextLookupMock(node, 6, [{ left: 20, top: 20, width: 160, height: 28 }], () => {
                expect(lookupCandidateFromPoint(app, 118, 30, text)).toBeNull();
            });
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('does not turn touch movement over a word into transient hover lookup', () => {
        const app = new ReaderApp();
        const canBeginPrimaryPressLookup = (app as unknown as {
            canBeginPrimaryPressLookup: (event: PointerEvent) => boolean;
        }).canBeginPrimaryPressLookup.bind(app);

        expect(canBeginPrimaryPressLookup(pointerEventLike('touch'))).toBe(false);
        expect(canBeginPrimaryPressLookup(pointerEventLike('mouse'))).toBe(true);
    });

    it('keeps pointer-text hover current only while the pointer remains on that text range', () => {
        document.body.innerHTML = '<p>青空</p><div>outside</div>';
        const paragraph = document.querySelector('p')!;
        const outside = document.querySelector('div')!;
        const node = paragraph.firstChild as Text;
        const app = new ReaderApp();
        const internals = app as unknown as {
            lastPointerPosition?: { x: number; y: number };
            isCurrentPointerTextHoverCandidate: (candidate: {
                text: string;
                offset: number;
                start: number;
                end: number;
                anchor: HTMLElement;
            }) => boolean;
        };
        const elementFromPointDescriptor = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
        let elementAtPoint: Element = paragraph;
        const candidate = { text: '青空', offset: 0, start: 0, end: 2, anchor: paragraph };

        try {
            Object.defineProperty(document, 'elementFromPoint', {
                configurable: true,
                value: () => elementAtPoint,
            });
            withPointerTextLookupMock(node, 0, [{ left: 20, top: 20, width: 40, height: 28 }], () => {
                internals.lastPointerPosition = { x: 28, y: 30 };
                expect(internals.isCurrentPointerTextHoverCandidate(candidate)).toBe(true);

                elementAtPoint = outside;
                internals.lastPointerPosition = { x: 220, y: 30 };
                expect(internals.isCurrentPointerTextHoverCandidate(candidate)).toBe(false);
            });
        } finally {
            if (elementFromPointDescriptor) Object.defineProperty(document, 'elementFromPoint', elementFromPointDescriptor);
            else delete (document as Partial<Document>).elementFromPoint;
        }
    });

    it('does not keep pointer-text hover alive because the whole parent text block is hovered', () => {
        document.body.innerHTML = '<p>好きなものを読んで日本語を学ぶ</p>';
        const paragraph = document.querySelector<HTMLElement>('p')!;
        const node = paragraph.firstChild as Text;
        const sentence = node.data;
        const app = new ReaderApp();
        const internals = app as unknown as {
            activePopover?: HTMLElement;
            activePopoverMode?: 'hover';
            activeHoverWord?: HTMLElement;
            activePointerTextLookup?: { text: string; start: number; end: number; anchor: HTMLElement };
            lastPointerPosition?: { x: number; y: number };
            isHoverContextActive: (options?: { ignoreCssHover?: boolean; ignorePointerPosition?: boolean }) => boolean;
            isCurrentPointerTextHoverCandidate: (candidate: {
                text: string;
                offset: number;
                start: number;
                end: number;
                anchor: HTMLElement;
            }) => boolean;
        };
        const elementFromPointDescriptor = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
        const matches = vi.spyOn(paragraph, 'matches').mockImplementation(selector => selector === ':hover'
            || Element.prototype.matches.call(paragraph, selector));

        try {
            Object.defineProperty(document, 'elementFromPoint', {
                configurable: true,
                value: () => paragraph,
            });
            internals.activePopover = document.createElement('div');
            internals.activePopoverMode = 'hover';
            internals.activeHoverWord = paragraph;
            internals.activePointerTextLookup = { text: sentence, start: 6, end: 9, anchor: paragraph };

            withPointerTextLookupMock(node, 7, [{ left: 20, top: 20, width: 180, height: 28 }], () => {
                internals.lastPointerPosition = { x: 88, y: 30 };
                expect(internals.isHoverContextActive({ ignoreCssHover: true })).toBe(true);
                expect(internals.isCurrentPointerTextHoverCandidate({
                    text: sentence,
                    offset: 7,
                    start: 6,
                    end: 9,
                    anchor: paragraph,
                })).toBe(true);
            });
            withPointerTextLookupMock(node, 9, [{ left: 20, top: 20, width: 180, height: 28 }], () => {
                internals.lastPointerPosition = { x: 116, y: 30 };
                expect(internals.isHoverContextActive({ ignoreCssHover: true })).toBe(false);
                expect(internals.isCurrentPointerTextHoverCandidate({
                    text: sentence,
                    offset: 7,
                    start: 6,
                    end: 9,
                    anchor: paragraph,
                })).toBe(false);
            });
        } finally {
            matches.mockRestore();
            if (elementFromPointDescriptor) Object.defineProperty(document, 'elementFromPoint', elementFromPointDescriptor);
            else delete (document as Partial<Document>).elementFromPoint;
            app.destroy();
        }
    });

    it('targets the glyph under the pointer when browser caret affinity lands after it', () => {
        document.body.innerHTML = '<p>青空</p>';
        const paragraph = document.querySelector('p')!;
        const node = paragraph.firstChild as Text;
        const app = new ReaderApp();

        withPointerTextLookupMock(node, 1, start => start === 0
            ? [{ left: 20, top: 20, width: 18, height: 28 }]
            : [{ left: 42, top: 20, width: 18, height: 28 }],
        () => {
            expect(lookupCandidateFromPoint(app, 28, 30, paragraph)).toMatchObject({
                text: '青空',
                offset: 0,
                start: 0,
                end: 2,
                anchor: paragraph,
            });
        });
    });

    it('does not use hidden accessibility text for fallback pointer lookup', () => {
        document.body.innerHTML = '<p aria-hidden="true">やさしいことば</p><p class="sr-only">言葉</p>';
        const [ariaHidden, srOnly] = Array.from(document.querySelectorAll('p'));
        const app = new ReaderApp();

        withPointerTextLookupMock(ariaHidden.firstChild as Text, 2, [{ left: 20, top: 20, width: 120, height: 28 }], () => {
            expect(lookupCandidateFromPoint(app, 64, 30, ariaHidden)).toBeNull();
        });
        withPointerTextLookupMock(srOnly.firstChild as Text, 0, [{ left: 20, top: 60, width: 40, height: 28 }], () => {
            expect(lookupCandidateFromPoint(app, 32, 70, srOnly)).toBeNull();
        });
    });

    it('does not use YouTube video metadata counters for fallback pointer lookup', () => {
        document.body.innerHTML = '<ytd-video-meta-block><span id="metadata-line">66万回視聴</span></ytd-video-meta-block>';
        const metadata = document.querySelector('span')!;
        const node = metadata.firstChild as Text;
        const app = new ReaderApp();

        withPointerTextLookupMock(node, 1, [{ left: 20, top: 20, width: 90, height: 24 }], () => {
            expect(lookupCandidateFromPoint(app, 48, 30, metadata)).toBeNull();
        });
    });

    it('does not use standalone metadata words for fallback pointer lookup', () => {
        document.body.innerHTML = '<p>新着</p><p>新卒エンジニア</p>';
        const [metadata, title] = Array.from(document.querySelectorAll('p'));
        const app = new ReaderApp();

        withPointerTextLookupMock(metadata.firstChild as Text, 0, [{ left: 20, top: 20, width: 36, height: 24 }], () => {
            expect(lookupCandidateFromPoint(app, 28, 30, metadata)).toBeNull();
        });
        withPointerTextLookupMock(title.firstChild as Text, 0, [{ left: 20, top: 60, width: 120, height: 24 }], () => {
            expect(lookupCandidateFromPoint(app, 28, 70, title)).toMatchObject({
                text: '新卒エンジニア',
                start: 0,
                end: 7,
                anchor: title,
            });
        });
    });

    it('preserves an intentionally empty Yomitan-style audio source list', () => {
        expect(normalizeAudioSources([])).toEqual([]);
        expect(normalizeAudioSources(undefined, 'http://localhost:9090/?term={term}')).toMatchObject([
            { type: 'custom-json', url: 'https://audio.yomureader.com/?term={term}&reading={reading}', enabled: true },
            { type: 'custom-json', url: 'http://localhost:9090/?term={term}', enabled: true },
        ]);
    });

    it('applies test-page URL bootstrap settings without mutating defaults', () => {
        const settings = applyUrlBootstrapSettings(DEFAULT_SETTINGS, '?apiKey=test-key&audio=http%3A%2F%2Faudio.test%2F%3Fterm%3D%7Bterm%7D&ocr=http%3A%2F%2Focr.test');

        expect(settings.apiKey).toBe('test-key');
        expect(settings.ocrEndpointUrl).toBe('http://ocr.test');
        expect(settings.audioSources[0]).toMatchObject({
            type: 'custom-json',
            url: 'http://audio.test/?term={term}',
            enabled: true,
        });
        expect(DEFAULT_SETTINGS.apiKey).toBe('');
    });

    it('normalizes OCR providers to the current readable options', () => {
        expect(normalizeOcrProvider('google-lens')).toBe('google-lens');
        expect(normalizeOcrProvider('cloud-vision')).toBe('cloud-vision');
        expect(normalizeOcrProvider('local-service')).toBe('local-service');
        expect(normalizeOcrProvider('off')).toBe('off');
        expect(normalizeOcrProvider('auto')).toBe('google-lens');
        expect(normalizeOcrProvider('page-text')).toBe('google-lens');
        expect(normalizeOcrProvider('custom-json')).toBe('local-service');
        expect(normalizeOcrProvider('old-provider')).toBe('google-lens');
        expect(normalizeOcrProvider('local-service', { ocrEndpointUrl: '' })).toBe('google-lens');
        expect(normalizeOcrProvider('local-service', { ocrEndpointUrl: '', ocrCloudVisionApiKey: '' })).toBe('local-service');
    });

    it('keeps numeric token counts visible while redacting real secrets in logs', () => {
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

        try {
            Logger.reset();
            Logger.configure({ forceEnabled: true });
            Logger.scope('Test').info('scan summary', {
                tokens: 4,
                token: 'secret-token',
                apiKey: 'secret-key',
            });

            expect(infoSpy).toHaveBeenCalledTimes(1);
            expect(infoSpy.mock.calls[0][4]).toMatchObject({
                tokens: 4,
                token: '[redacted]',
                apiKey: '[redacted]',
            });
        } finally {
            Logger.configure({ forceEnabled: false });
            Logger.reset();
            infoSpy.mockRestore();
        }
    });

    it('ships recommended dictionary downloads for every install card', () => {
        const dictionary = findRecommendedDictionary('jmdict');
        expect(dictionary?.downloadUrl).toContain('JMdict_english.zip');
        expect(findRecommendedDictionary('wty-ja-ja')?.downloadUrl).toContain('wty-ja-ja.zip');
        expect(findRecommendedDictionary('pixiv-light')?.downloadUrl).toContain('PixivLight.zip');
        expect(findRecommendedDictionary('jpdb-kanji')?.downloadUrl).toContain('JPDB%20Kanji.zip');
        expect(findRecommendedDictionary('kanjium-pitch')?.downloadUrl).toContain('kanjium_pitch_accents.zip');
        expect(findRecommendedDictionary('jpdbv2-kana')?.downloadUrl).toContain('JPDB_v2.2_Frequency_Kana.zip');
        expect(RECOMMENDED_JAPANESE_DICTIONARIES.every(item => Boolean(item.downloadUrl || item.helpUrl))).toBe(true);
        expect(RECOMMENDED_JAPANESE_DICTIONARIES.map(item => item.name)).toEqual([
            'Jitendex',
            'JMdict',
            'JMnedict',
            'WTY JA-JA',
            'Pixiv Light',
            'KANJIDIC',
            'JPDB Kanji',
            'Kanjium pitch accents',
            'JPDBv2㋕',
            'Jiten',
            'BCCWJ',
        ]);
    });

    it('does not trust a stale hosted bridge marker without a current request listener', async () => {
        const request = vi.fn((options: Parameters<UserscriptHttpRequest>[0]) => {
            options.onload?.({
                status: 200,
                response: { result: 6, error: null },
                responseText: '{"result":6,"error":null}',
                finalUrl: options.url,
            });
        });

        vi.stubGlobal('location', { href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/index.html' });
        vi.stubGlobal('GM_xmlhttpRequest', request);
        document.documentElement.dataset.yomuUserscriptHttpBridge = 'true';

        try {
            installUserscriptHttpBridge();
            vi.stubGlobal('GM_xmlhttpRequest', undefined);

            const bridgeRequest = getUserscriptHttpRequest();
            expect(bridgeRequest).toBeDefined();

            const response = await bridgeRequest?.({
                url: 'http://127.0.0.1:8765',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                data: '{"action":"version","version":6}',
                responseType: 'json',
                timeout: 100,
            }) as UserscriptHttpResponse | undefined;

            expect(request).toHaveBeenCalledTimes(1);
            expect(request.mock.calls[0][0].url).toBe('http://127.0.0.1:8765');
            expect(response?.response).toEqual({ result: 6, error: null });
        } finally {
            delete document.documentElement.dataset.yomuUserscriptHttpBridge;
            vi.unstubAllGlobals();
        }
    });

    it('announces the userscript bridge when a page shadows window.dispatchEvent', () => {
        const request = vi.fn();

        vi.stubGlobal('location', { href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/index.html' });
        vi.stubGlobal('GM_xmlhttpRequest', request);
        document.documentElement.dataset.yomuUserscriptHttpBridge = 'true';

        try {
            withWindowProperty('dispatchEvent', undefined, () => {
                expect(() => installUserscriptHttpBridge()).not.toThrow();
            });

            expect(document.documentElement.dataset.yomuUserscriptHttpBridge).toBe('true');
        } finally {
            delete document.documentElement.dataset.yomuUserscriptHttpBridge;
            vi.unstubAllGlobals();
        }
    });

    it('routes userscript bridge requests through the document target when window dispatch is shadowed', async () => {
        const request = vi.fn((options: Parameters<UserscriptHttpRequest>[0]) => {
            options.onload?.({
                status: 200,
                response: 'raw-ok',
                responseText: 'raw-ok',
                finalUrl: options.url,
            });
        });

        vi.stubGlobal('location', { href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/index.html' });
        vi.stubGlobal('GM_xmlhttpRequest', request);
        delete document.documentElement.dataset.yomuUserscriptHttpBridge;

        try {
            installUserscriptHttpBridge();
            vi.unstubAllGlobals();

            const bridgeRequest = getUserscriptHttpRequest();
            expect(bridgeRequest).toBeDefined();

            const response = await withWindowProperty('dispatchEvent', undefined, () => bridgeRequest?.({
                url: 'https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.user.js',
                method: 'GET',
            }) as Promise<UserscriptHttpResponse> | undefined);

            expect(request).toHaveBeenCalledTimes(1);
            expect(response?.responseText).toBe('raw-ok');
        } finally {
            delete document.documentElement.dataset.yomuUserscriptHttpBridge;
            vi.unstubAllGlobals();
        }
    });

    it('retries hosted bridge installation when the userscript request API appears after document-start', async () => {
        vi.useFakeTimers();
        const request = vi.fn((options: Parameters<UserscriptHttpRequest>[0]) => {
            options.onload?.({
                status: 200,
                response: 'late-ok',
                responseText: 'late-ok',
                finalUrl: options.url,
            });
        });

        vi.stubGlobal('location', { href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/index.html' });
        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        delete document.documentElement.dataset.yomuUserscriptHttpBridge;

        try {
            installUserscriptHttpBridgeWhenReady();
            expect(document.documentElement.dataset.yomuUserscriptHttpBridge).toBeUndefined();

            vi.stubGlobal('GM_xmlhttpRequest', request);
            await vi.runAllTimersAsync();

            expect(document.documentElement.dataset.yomuUserscriptHttpBridge).toBe('true');
            vi.stubGlobal('GM_xmlhttpRequest', undefined);
            const bridgeRequest = getUserscriptHttpRequest();
            expect(bridgeRequest).toBeDefined();

            await bridgeRequest?.({
                url: 'http://127.0.0.1:8765',
                method: 'POST',
            }) as Promise<UserscriptHttpResponse> | undefined;

            expect(request).toHaveBeenCalledTimes(1);
            expect(request.mock.calls[0][0].url).toBe('http://127.0.0.1:8765');
            expect(request.mock.calls[0][0].method).toBe('POST');
        } finally {
            delete document.documentElement.dataset.yomuUserscriptHttpBridge;
            vi.useRealTimers();
            vi.unstubAllGlobals();
        }
    });

    it('retries hosted bridge installation when a stale marker exists before the request API appears', async () => {
        vi.useFakeTimers();
        const request = vi.fn((options: Parameters<UserscriptHttpRequest>[0]) => {
            options.onload?.({
                status: 200,
                response: 'late-stale-ok',
                responseText: 'late-stale-ok',
                finalUrl: options.url,
            });
        });

        vi.stubGlobal('location', { href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/index.html' });
        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        document.documentElement.dataset.yomuUserscriptHttpBridge = 'true';

        try {
            installUserscriptHttpBridgeWhenReady();

            vi.stubGlobal('GM_xmlhttpRequest', request);
            await vi.runAllTimersAsync();

            const bridgeRequest = getUserscriptHttpRequest();
            expect(bridgeRequest).toBeDefined();

            await bridgeRequest?.({
                url: 'http://127.0.0.1:8765',
                method: 'POST',
            }) as Promise<UserscriptHttpResponse> | undefined;

            expect(request).toHaveBeenCalledTimes(1);
            expect(request.mock.calls[0][0].url).toBe('http://127.0.0.1:8765');
        } finally {
            delete document.documentElement.dataset.yomuUserscriptHttpBridge;
            vi.useRealTimers();
            vi.unstubAllGlobals();
        }
    });

    it('does not repeat the bridge-ready event after a successful immediate install', async () => {
        vi.useFakeTimers();
        const request = vi.fn();
        const ready = vi.fn();

        vi.stubGlobal('location', { href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/index.html' });
        vi.stubGlobal('GM_xmlhttpRequest', request);
        delete document.documentElement.dataset.yomuUserscriptHttpBridge;
        window.addEventListener(USERSCRIPT_HTTP_BRIDGE_READY_EVENT, ready);

        try {
            installUserscriptHttpBridgeWhenReady();
            await vi.runAllTimersAsync();

            expect(document.documentElement.dataset.yomuUserscriptHttpBridge).toBe('true');
            expect(ready).toHaveBeenCalledTimes(1);
        } finally {
            window.removeEventListener(USERSCRIPT_HTTP_BRIDGE_READY_EVENT, ready);
            delete document.documentElement.dataset.yomuUserscriptHttpBridge;
            vi.useRealTimers();
            vi.unstubAllGlobals();
        }
    });

    it('accepts string-detail hosted bridge requests for Firefox userscript boundaries', async () => {
        const request = vi.fn((options: Parameters<UserscriptHttpRequest>[0]) => {
            options.onload?.({
                status: 200,
                response: { result: 6, error: null },
                responseText: '{"result":6,"error":null}',
                finalUrl: options.url,
            });
        });
        const responses: unknown[] = [];
        const onResponse = (event: Event) => {
            responses.push((event as CustomEvent).detail);
        };

        vi.stubGlobal('location', { href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/index.html' });
        vi.stubGlobal('GM_xmlhttpRequest', request);
        delete document.documentElement.dataset.yomuUserscriptHttpBridge;
        window.addEventListener('yomu-userscript-http-response', onResponse);

        try {
            installUserscriptHttpBridge();
            const detail = JSON.stringify({
                id: 'firefox-request',
                options: {
                    url: 'http://127.0.0.1:8765',
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    data: '{"action":"version","version":6}',
                    responseType: 'json',
                },
            });
            window.dispatchEvent(new CustomEvent('yomu-userscript-http-request', { detail }));

            expect(request).toHaveBeenCalledTimes(1);
            expect(request.mock.calls[0][0].url).toBe('http://127.0.0.1:8765');
            expect(responses).toHaveLength(1);
            expect(typeof responses[0]).toBe('string');
            expect(JSON.parse(responses[0] as string)).toMatchObject({
                id: 'firefox-request',
                kind: 'load',
                response: { status: 200, response: { result: 6, error: null } },
            });
        } finally {
            window.removeEventListener('yomu-userscript-http-response', onResponse);
            delete document.documentElement.dataset.yomuUserscriptHttpBridge;
            vi.unstubAllGlobals();
        }
    });

    it('clones userscript bridge request and response details for Firefox Xray boundaries', async () => {
        const inputHeaders = { accept: 'text/plain' };
        let rawResponse: UserscriptHttpResponse | undefined;
        const request = vi.fn((options: Parameters<UserscriptHttpRequest>[0]) => {
            rawResponse = {
                status: 200,
                response: 'raw-ok',
                responseText: 'raw-ok',
                finalUrl: options.url,
            };
            options.onload?.(rawResponse);
        });

        try {
            const { bridgeRequest, cloneInto } = installFirefoxXrayUserscriptBridge(request);
            expect(bridgeRequest).toBeDefined();

            const response = await bridgeRequest?.({
                url: 'https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.user.js',
                method: 'GET',
                headers: inputHeaders,
            }) as UserscriptHttpResponse | undefined;

            expect(request).toHaveBeenCalledTimes(1);
            expect(request.mock.calls[0][0].headers).toEqual(inputHeaders);
            expect(request.mock.calls[0][0].headers).not.toBe(inputHeaders);
            expect(response).toEqual(rawResponse);
            expect(response).not.toBe(rawResponse);
            expect(cloneInto).toHaveBeenCalledWith(expect.any(String), window, { cloneFunctions: false, wrapReflectors: true });
        } finally {
            delete document.documentElement.dataset.yomuUserscriptHttpBridge;
            vi.unstubAllGlobals();
        }
    });

    it('normalizes userscript bridge responses before dispatching across Firefox Xray boundaries', async () => {
        const requestBody = new Uint8Array([1, 2, 3, 4]).buffer;
        const responseBody = new Uint8Array([5, 6, 7, 8]).buffer;
        const request = vi.fn((options: Parameters<UserscriptHttpRequest>[0]) => {
            const rawResponse = {
                status: 200,
                response: responseBody,
                responseText: 'raw-ok',
                finalUrl: options.url,
            };
            Object.defineProperty(rawResponse, 'wrappedRealmProperty', {
                enumerable: true,
                get: () => {
                    throw new Error('Permission denied to access property "wrappedRealmProperty"');
                },
            });
            options.onload?.(rawResponse);
        });

        try {
            const { bridgeRequest } = installFirefoxXrayUserscriptBridge(request);
            const response = await bridgeRequest?.({
                url: 'https://lensfrontend-pa.googleapis.com/v1/crupload',
                method: 'POST',
                data: requestBody,
                responseType: 'arraybuffer',
            }) as UserscriptHttpResponse | undefined;

            expect(request).toHaveBeenCalledTimes(1);
            const sentBody = request.mock.calls[0][0].data as ArrayBuffer;
            expect(new Uint8Array(sentBody)).toEqual(new Uint8Array(requestBody));
            expect(sentBody).not.toBe(requestBody);
            expect(response?.status).toBe(200);
            expect(response?.response).not.toBe(responseBody);
            expect(response).not.toHaveProperty('wrappedRealmProperty');
        } finally {
            delete document.documentElement.dataset.yomuUserscriptHttpBridge;
            vi.unstubAllGlobals();
        }
    });

    it('does not expose the userscript bridge on arbitrary matched pages', () => {
        const request = vi.fn();

        vi.stubGlobal('location', { href: 'https://example.com/article' });
        vi.stubGlobal('GM_xmlhttpRequest', request);
        delete document.documentElement.dataset.yomuUserscriptHttpBridge;

        try {
            installUserscriptHttpBridge();
            expect(document.documentElement.dataset.yomuUserscriptHttpBridge).toBeUndefined();
            expect(getUserscriptHttpRequest()).toBeDefined();
        } finally {
            delete document.documentElement.dataset.yomuUserscriptHttpBridge;
            vi.unstubAllGlobals();
        }
    });

    it('downloads dictionaries through lowercase GM.xmlhttpRequest when that is the exposed userscript API', async () => {
        const blob = yomitanZipBlob({
            'index.json': { title: 'Alias Dict', format: 3 },
            'term_bank_1.json': [
            ['読む', 'よむ', '', 'v5m', 10, ['to read'], 1, ''],
            ],
        });
        const request = vi.fn((options: Parameters<UserscriptHttpRequest>[0]) => {
            if (options.url !== 'https://dict.test/alias.zip') {
                options.onerror?.(new Error(`Unexpected request: ${options.url}`));
                return;
            }
            options.onprogress?.({ lengthComputable: true, loaded: blob.size, total: blob.size });
            options.onload?.({ status: 200, response: blob });
        });

        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        vi.stubGlobal('GM', { xmlhttpRequest: request });
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('fetch should not run'))));

        try {
            const store = new YomitanDictionaryStore();
            await store.clear();
            const progress: string[] = [];
            const summary = await store.importFromUrl('https://dict.test/alias.zip', 'alias.zip', message => progress.push(message));

            expect(request).toHaveBeenCalled();
            const dictionaryRequest = request.mock.calls
                .map(call => call[0])
                .find(options => options.url === 'https://dict.test/alias.zip');
            expect(dictionaryRequest).toMatchObject({
                method: 'GET',
                url: 'https://dict.test/alias.zip',
                responseType: 'blob',
            });
            expect(summary).toMatchObject({ dictionaries: ['Alias Dict'], terms: 1, entries: 1 });
            expect(progress).toContain('Downloading: alias.zip...');
            expect(progress).toContain('Downloading 100%...');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('keeps GM dictionary downloads working when a mounted userscript window is unreadable', async () => {
        const blob = yomitanZipBlob({
            'index.json': { title: 'Firefox GM Dict', format: 3 },
            'term_bank_1.json': [
            ['読む', 'よむ', '', 'v5m', 10, ['to read'], 1, ''],
            ],
        });
        const request = vi.fn((options: Parameters<UserscriptHttpRequest>[0]) => {
            options.onload?.({ status: 200, response: blob });
        });
        const monkeyWindowKey = '__monkeyWindow-firefox-xray';

        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        vi.stubGlobal('GM', { xmlHttpRequest: request });
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('fetch should not run'))));
        Object.defineProperty(document, monkeyWindowKey, {
            configurable: true,
            get: () => {
                throw new Error('Not allowed to access cross-origin object');
            },
        });

        try {
            const store = new YomitanDictionaryStore();
            await store.clear();
            const summary = await store.importFromUrl('https://dict.test/firefox-gm.zip', 'firefox-gm.zip');

            expect(request).toHaveBeenCalled();
            const dictionaryRequests = request.mock.calls
                .map(call => call[0])
                .filter(options => options.url === 'https://dict.test/firefox-gm.zip');
            expect(dictionaryRequests).toHaveLength(1);
            expect(summary).toMatchObject({ dictionaries: ['Firefox GM Dict'], terms: 1, entries: 1 });
        } finally {
            delete (document as unknown as Record<string, unknown>)[monkeyWindowKey];
            vi.unstubAllGlobals();
        }
    });

    it('downloads dictionaries through vite-plugin-monkey mounted userscript APIs', async () => {
        const blob = yomitanZipBlob({
            'index.json': { title: 'Mounted Dict', format: 3 },
            'term_bank_1.json': [
            ['見る', 'みる', '', 'v1', 10, ['to see'], 1, ''],
            ],
        });
        const sourceUrl = 'https://dict.test/mounted.zip';
        const request = vi.fn((options: Parameters<UserscriptHttpRequest>[0]) => {
            if (options.url !== sourceUrl) return;
            options.onload?.({ status: 200, response: blob });
        });
        const monkeyWindowKey = '__monkeyWindow-http://127.0.0.1:5174';

        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        vi.stubGlobal('GM', {});
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('fetch should not run'))));
        Object.defineProperty(document, monkeyWindowKey, {
            configurable: true,
            value: { GM_xmlhttpRequest: request },
        });

        try {
            const store = new YomitanDictionaryStore();
            await store.clear();
            const summary = await store.importFromUrl(sourceUrl, 'mounted.zip');

            expect(request).toHaveBeenCalled();
            const mountedRequests = request.mock.calls
                .map(call => call[0])
                .filter(options => options.url === sourceUrl);
            expect(mountedRequests).toHaveLength(1);
            expect(mountedRequests.length).toBeGreaterThanOrEqual(1);
            expect(summary).toMatchObject({ dictionaries: ['Mounted Dict'], terms: 1, entries: 1 });
        } finally {
            delete (document as unknown as Record<string, unknown>)[monkeyWindowKey];
            vi.unstubAllGlobals();
        }
    });

    it('imports same-origin dictionary ZIPs via fetch without the userscript bridge', async () => {
        const blob = yomitanZipBlob({
            'index.json': { title: 'Proxy Dict', format: 3 },
            'term_bank_1.json': [
            ['青空', 'あおぞら', '', '', 10, ['blue sky'], 1, ''],
            ],
        });
        const fetchMock = vi.fn((input: RequestInfo | URL) => {
            expect(String(input)).toBe(`${location.origin}/proxy.zip`);
            return Promise.resolve({
                ok: true,
                status: 200,
                blob: () => Promise.resolve(blob),
            } as Response);
        });

        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        vi.stubGlobal('GM', {});
        vi.stubGlobal('fetch', fetchMock);

        try {
            const store = new YomitanDictionaryStore();
            await store.clear();
            const summary = await store.importFromUrl(`${location.origin}/proxy.zip`, 'proxy.zip');

            expect(fetchMock).toHaveBeenCalled();
            expect(String(fetchMock.mock.calls[0][0])).toBe(`${location.origin}/proxy.zip`);
            expect(summary).toMatchObject({ dictionaries: ['Proxy Dict'], terms: 1, entries: 1 });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('imports remote dictionary ZIPs through a configured proxy when no userscript bridge is available', async () => {
        const blob = yomitanZipBlob({
            'index.json': { title: 'Hosted Proxy Dict', format: 3 },
            'term_bank_1.json': [
            ['読書', 'どくしょ', '', '', 10, ['reading books'], 1, ''],
            ],
        });
        const sourceUrl = 'https://github.com/example/dictionaries/releases/latest/download/hosted.zip';
        const proxyUrl = 'https://yomu-proxy.example/fetch';
        const expectedProxyUrl = `${proxyUrl}?url=${encodeURIComponent(sourceUrl)}`;
        const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
            if (String(input) !== expectedProxyUrl) {
                return Promise.resolve({
                    ok: false,
                    status: 404,
                    blob: () => Promise.resolve(new Blob()),
                } as Response);
            }
            return Promise.resolve({
                ok: true,
                status: 200,
                blob: () => Promise.resolve(blob),
            } as Response);
        });

        vi.stubGlobal('location', { href: 'https://hrussellzfac023.github.io/yomu-reader/newtab.html', origin: 'https://hrussellzfac023.github.io', hostname: 'hrussellzfac023.github.io' });
        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        vi.stubGlobal('GM', {});
        vi.stubGlobal('fetch', fetchMock);

        try {
            const store = new YomitanDictionaryStore(() => proxyUrl);
            await store.clear();
            fetchMock.mockClear();
            const summary = await store.importFromUrl(sourceUrl, 'hosted.zip');

            const proxyRequests = fetchMock.mock.calls.filter(([input]) => String(input) === expectedProxyUrl);
            expect(proxyRequests).toHaveLength(1);
            expect(proxyRequests[0]?.[1]).toMatchObject({ credentials: 'omit' });
            expect(summary).toMatchObject({ dictionaries: ['Hosted Proxy Dict'], terms: 1, entries: 1 });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('imports deflated Yomitan ZIPs without browser DecompressionStream', async () => {
        const blob = yomitanZipBlob({
            'index.json': { title: 'Deflated Dict', format: 3 },
            'term_bank_1.json': [
            ['読む', 'よむ', '', 'v5m', 10, ['to read'], 1, ''],
            ],
        }, { compression: 'deflate' });
        vi.stubGlobal('DecompressionStream', undefined);

        try {
            const store = new YomitanDictionaryStore();
            await store.clear();
            const summary = await store.importFile(new File([blob], 'deflated.zip', { type: 'application/zip' }));

            expect(summary).toMatchObject({ dictionaries: ['Deflated Dict'], terms: 1, entries: 1 });
            expect(await store.lookup('読む', 'よむ', 5)).toMatchObject([{ dictionary: 'Deflated Dict' }]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('reports browser-blocked remote dictionary ZIP fetches without the userscript bridge', async () => {
        vi.stubGlobal('location', { href: 'https://www.nhk.or.jp/news/easy/', origin: 'https://www.nhk.or.jp', hostname: 'www.nhk.or.jp' });
        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        vi.stubGlobal('GM', {});
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));

        try {
            const store = new YomitanDictionaryStore();
            await store.clear();

            await expect(store.importFromUrl('https://github.com/example/dict.zip', 'dict.zip'))
                .rejects.toThrow(/configured proxy/i);
            const urls = (fetch as unknown as { mock: { calls: Array<[RequestInfo | URL, RequestInit]> } }).mock.calls
                .map(([url]) => String(url))
                .filter(url => url.includes('dict.zip'));
            expect(urls).toEqual([]);
            expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('dict.zip'), expect.objectContaining({ credentials: 'omit' }));
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('sanitizes configurable accent colors', () => {
        expect(sanitizeAccentColor('#7c3aed')).toBe('#7c3aed');
        expect(sanitizeAccentColor('#abc')).toBe('#aabbcc');
        expect(sanitizeAccentColor('lime')).toBe(DEFAULT_SETTINGS.accentColor);
    });

    it('imports useful settings from a Yomitan backup', () => {
        const imported = parseYomitanSettingsExport({
            options: {
                profiles: [{
                    options: {
                        audio: {
                            autoPlay: true,
                            sources: [{ type: 'custom-json', url: 'http://localhost:9090/?term={term}&reading={reading}' }],
                        },
                        general: { popupTheme: 'dark', maxResults: 20 },
                        scanning: { selectText: true, scanWithoutMousemove: true },
                        dictionaries: [{ name: 'Jitendex', enabled: true }],
                    },
                }],
            },
        });
        expect(imported.settings.audioSources?.[0]).toMatchObject({
            type: 'custom-json',
            url: 'http://localhost:9090/?term={term}&reading={reading}',
        });
        expect(imported.settings.audioEnableDefaultSources).toBeUndefined();
        expect(imported.settings.autoPlayAudio).toBe(true);
        expect(imported.settings.localDictionaryMaxResults).toBe(20);
        expect(imported.dictionaryNames).toEqual(['Jitendex']);
        expect(imported.settings.dictionaryPreferences?.[0]).toMatchObject({ name: 'Jitendex', enabled: true, priority: 0 });
    });

    it('imports active-profile Yomitan settings beyond the minimal backup fields', () => {
        const imported = parseYomitanSettingsExport({
            options: {
                profileCurrent: 1,
                profiles: [
                    { options: { general: { popupTheme: 'light' }, dictionaries: [{ name: 'Ignored', enabled: true }] } },
                    {
                        options: {
                            general: {
                                language: 'ja',
                                popupTheme: 'dark',
                                popupWidth: 640,
                                popupHeight: 480,
                                popupVerticalOffset: 16,
                                showPitchAccentGraph: false,
                                showPitchAccentDownstepNotation: false,
                            },
                            audio: { fallbackSoundType: 'none' },
                            scanning: {
                                delay: 125,
                                hideDelay: 250,
                                inputs: [{ include: 'alt', options: {} }],
                            },
                            dictionaries: [
                                { name: 'Primary', alias: 'Main', enabled: true, allowSecondarySearches: true },
                                { name: 'Disabled', alias: 'Off', enabled: false },
                            ],
                            anki: {
                                enable: true,
                                server: 'http://127.0.0.1:8765',
                                tags: ['yomitan', 'imported'],
                                cardFormats: [{ type: 'term', deck: 'Mining', model: 'Japanese' }],
                                screenshot: { format: 'png', quality: 92 },
                            },
                            inputs: {
                                hotkeys: [
                                    { action: 'playAudio', key: 'KeyP', modifiers: ['alt'], enabled: true },
                                    { action: 'close', key: 'Escape', modifiers: [], enabled: true },
                                ],
                            },
                        },
                    },
                ],
            },
        });

        expect(imported.dictionaryNames).toEqual(['Primary']);
        expect(imported.settings).toMatchObject({
            interfaceLanguage: 'ja',
            theme: 'dark',
            popoverWidth: 640,
            popoverHeight: 480,
            subtitleBottomOffset: 16,
            showPitchAccent: false,
            hoverOpenDelayMs: 125,
            hoverCloseDelayMs: 250,
            audioFallbackChimeEnabled: false,
            popupActivationMode: 'modifier',
            scanModifierKey: 'alt',
            ankiEnabled: true,
            ankiDeck: 'Mining',
            ankiModel: 'Japanese',
            ankiTags: 'yomitan imported',
        });
        expect(imported.settings.shortcuts).toMatchObject({ hoverLookup: 'Alt', playAudio: 'Alt+P', closePopup: 'Escape' });
        expect(imported.settings.dictionaryPreferences).toEqual([
            expect.objectContaining({ name: 'Primary', alias: 'Main', enabled: true, priority: 0, allowSecondarySearches: true }),
            expect.objectContaining({ name: 'Disabled', alias: 'Off', enabled: false, priority: 1 }),
        ]);
    });

    it('keeps sentence translation targeting English when the UI is Japanese', async () => {
        const originalFetch = globalThis.fetch;
        const fetchMock = vi.fn<[RequestInfo | URL, RequestInit?], Promise<Response>>(async (_input, _init) => new Response(JSON.stringify({
            sentences: [{ trans: 'Sophie, move forward.' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        Object.defineProperty(globalThis, 'fetch', {
            configurable: true,
            value: fetchMock,
        });

        try {
            await expect(translateJapaneseSentence('ソフィー、前へ移れ。', 'ja')).resolves.toBe('Sophie, move forward.');

            const requestedUrl = String(fetchMock.mock.calls[0]?.[0] ?? '');
            const targetUrl = new URL(requestedUrl).searchParams.get('url') ?? requestedUrl;
            const translateUrl = new URL(targetUrl);
            expect(translateUrl.hostname).toBe('translate.googleapis.com');
            expect(translateUrl.searchParams.get('sl')).toBe('ja');
            expect(translateUrl.searchParams.get('tl')).toBe('en');
        } finally {
            Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
        }
    });

    it('normalizes Japanese quote punctuation before requesting sentence translation', async () => {
        const originalFetch = globalThis.fetch;
        const fetchMock = vi.fn<[RequestInfo | URL, RequestInit?], Promise<Response>>(async (_input, _init) => new Response(JSON.stringify({
            sentences: [{ trans: 'NPO Multilingual Extensive Reading proposes and supports "extensive reading".' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        Object.defineProperty(globalThis, 'fetch', {
            configurable: true,
            value: fetchMock,
        });

        try {
            await expect(translateJapaneseSentence('NPO多言語多読は「多読」を提案します。', 'en'))
                .resolves.toBe('NPO Multilingual Extensive Reading proposes and supports "extensive reading".');

            const requestedUrl = String(fetchMock.mock.calls[0]?.[0] ?? '');
            const targetUrl = new URL(requestedUrl).searchParams.get('url') ?? requestedUrl;
            const translateUrl = new URL(targetUrl);
            expect(translateUrl.searchParams.get('q')).toBe('NPO多言語多読は"多読"を提案します。');
        } finally {
            Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
        }
    });

    it('detects grammar hints with stable guide links', () => {
        const hints = detectGrammarHints('この日本語の本を読みきりたいので、毎日読んでいる。');
        expect(hints.map(hint => hint.name)).toEqual(expect.arrayContaining(['ている', 'たい', 'ので']));
        expect(hints.find(hint => hint.name === 'ている')?.url).toBe('https://www.tofugu.com/japanese-grammar/verb-continuous-form-teiru/');
        expect(hints.find(hint => hint.name === 'たい')?.confidence).toBe('high');
    });

    it('detects richer grammar before basic particles crowd out the hint list', () => {
        const hints = detectGrammarHints('日本語が上手になるために、毎日練習しなくてはいけないと思うけど、明日は友達に手伝ってもらうことができるかもしれない。');
        const names = hints.map(hint => hint.name);

        expect(names).toEqual(expect.arrayContaining([
            'ために',
            'なければならない',
            'と思う',
            'てくれる / てもらう',
            'ことができる',
            'かもしれない',
        ]));
        expect(names.indexOf('ために')).toBeLessThan(names.indexOf('に'));
    });

    it('detects higher-level grammar and keeps rule metadata stable', () => {
        const hints = detectGrammarHints('先生に本を読まされるにもかかわらず、その本について発表するはずです。');
        const names = hints.map(hint => hint.name);

        expect(names).toEqual(expect.arrayContaining(['させられる', 'にもかかわらず', 'について', 'はず']));
        expect(hints.find(hint => hint.name === 'にもかかわらず')).toMatchObject({
            ruleId: 'concession-ni-mo-kakawarazu',
            level: 'N2',
        });
    });

    it('detects the と particle in NHK-style talk sentences', () => {
        const hints = detectGrammarHints('トランプ大統領 14日に中国の習近平国家主席と話をする');
        const names = hints.map(hint => hint.name);

        expect(names).toEqual(expect.arrayContaining(['に', 'の', 'と', 'を']));
        expect(hints.find(hint => hint.name === 'と')).toMatchObject({
            ruleId: 'particle-to',
            level: 'N5',
        });
    });

    it('detects plain past tense in NHK-style talk sentences', () => {
        const hints = detectGrammarHints('トランプ大統領と習近平国家主席が会って話をした');

        // Rule copy (kind/short/detail) now loads from the hosted
        // grammar-rule data; the synchronous hint carries a placeholder kind.
        expect(hints.find(hint => hint.name === 'た')).toMatchObject({
            ruleId: 'plain-past-ta',
            level: 'N5',
            kind: 'Grammar',
            match: 'した',
        });
    });

    it('detects たち as a group suffix grammar hint', () => {
        const hints = detectGrammarHints('私たちは子供たちと公園で遊びます。');

        expect(hints.filter(hint => hint.name === 'たち / 達')).toHaveLength(2);
        expect(hints.find(hint => hint.name === 'たち / 達')).toMatchObject({
            ruleId: 'suffix-tachi',
            level: 'N5',
        });
    });

    it('keeps common word endings from looking like grammar points', () => {
        const politeHints = detectGrammarHints('私たちは子供たちと公園で遊びます。');
        const desireHints = detectGrammarHints('毎日読んでいるので、もっと読みたい。');
        const potentialHints = detectGrammarHints('日本語を読むことができる。');

        expect(politeHints.map(hint => hint.name)).not.toContain('させる');
        expect(desireHints.map(hint => hint.name)).not.toContain('らしい / みたい');
        expect(desireHints.filter(hint => hint.name === 'で')).toHaveLength(0);
        expect(desireHints.filter(hint => hint.name === 'と')).toHaveLength(0);
        expect(potentialHints.filter(hint => hint.name === 'と')).toHaveLength(0);
    });

    it('hides known grammar rules while keeping a review toggle available', async () => {
        const hints = detectGrammarHints('毎日読んでいるので、もっと読みたい。');
        const html = await renderGrammarHints(hints, '毎日読んでいるので、もっと読みたい。', {
            knownRuleIds: ['aspect-te-iru'],
            showKnown: false,
        });

        expect(html).toContain('Show known');
        expect(html).toContain('known hidden');
        expect(html).not.toContain('>ている<');
    });

    it('re-parses popup Japanese after rendering grammar study panels', async () => {
        const sentence = '毎日読んでいるので、もっと読みたい。';
        document.body.innerHTML = `
            <div class="jpdb-reader-popover" data-jpdb-reader-root="true" data-jpdb-reader-parse-key="${sentence}">
                <div class="jpdb-reader-study-tools">
                    <button type="button" data-action="study-grammar">Grammar</button>
                    <div class="jpdb-reader-study-panel" data-study-panel hidden></div>
                </div>
            </div>
        `;
        const popover = document.querySelector<HTMLElement>('.jpdb-reader-popover')!;
        const button = document.querySelector<HTMLButtonElement>('[data-action="study-grammar"]')!;
        const parsePopoverJapanese = vi.fn(async (target: HTMLElement) => {
            expect(target).toBe(popover);
            expect(target.dataset.jpdbReaderParseKey).toBeUndefined();
        });
        const controller = new CardActionController({
            getSettings: () => DEFAULT_SETTINGS,
            detectGrammarHints: async (value: string) => detectGrammarHints(value),
            parsePopoverJapanese,
            playAudio: vi.fn(),
            playSentenceAudio: vi.fn(),
            showSettings: vi.fn(),
            toast: vi.fn(),
        } as unknown as ConstructorParameters<typeof CardActionController>[0]);

        await controller.perform({ kind: 'card-action', action: 'study-grammar' }, button, card, sentence);

        expect(parsePopoverJapanese).toHaveBeenCalledTimes(1);
        expect(document.querySelector('.jpdb-reader-study-original')?.textContent).toBe(sentence);
        expect(document.querySelector<HTMLElement>('[data-study-panel]')?.hidden).toBe(false);
    });

    it('keeps popover body scroll stable after grammar known rerenders', async () => {
        const sentence = '毎日読んでいるので、もっと読みたい。';
        localStorage.removeItem('yomu.grammarPreferences.v1');
        const html = await renderGrammarHints(detectGrammarHints(sentence), sentence);
        document.body.innerHTML = `
            <div class="jpdb-reader-popover" data-jpdb-reader-root="true">
                <div class="jpdb-reader-popover-body">
                    <div style="height: 900px"></div>
                    <div class="jpdb-reader-study-tools">
                        <div class="jpdb-reader-study-panel" data-study-panel>${html}</div>
                    </div>
                </div>
            </div>
        `;
        const popover = document.querySelector<HTMLElement>('.jpdb-reader-popover')!;
        const body = document.querySelector<HTMLElement>('.jpdb-reader-popover-body')!;
        const panel = document.querySelector<HTMLElement>('[data-study-panel]')!;
        const button = panel.querySelector<HTMLButtonElement>('[data-action="study-grammar-toggle-known"][data-grammar-rule-id="aspect-te-iru"]')!;
        const nativeInnerHtml = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')
            ?? Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerHTML');
        Object.defineProperty(panel, 'innerHTML', {
            configurable: true,
            get(this: HTMLElement) {
                return nativeInnerHtml?.get?.call(this) ?? '';
            },
            set(this: HTMLElement, value: string) {
                nativeInnerHtml?.set?.call(this, value);
                body.scrollTop = 0;
            },
        });
        const parsePopoverJapanese = vi.fn(async (target: HTMLElement) => {
            expect(target).toBe(popover);
        });
        const controller = new CardActionController({
            getSettings: () => DEFAULT_SETTINGS,
            detectGrammarHints: async (value: string) => detectGrammarHints(value),
            parsePopoverJapanese,
            playAudio: vi.fn(),
            playSentenceAudio: vi.fn(),
            showSettings: vi.fn(),
            toast: vi.fn(),
        } as unknown as ConstructorParameters<typeof CardActionController>[0]);

        try {
            body.scrollTop = 280;

            await controller.perform({ kind: 'card-action', action: 'study-grammar-toggle-known', grammarRuleId: 'aspect-te-iru', grammarKnown: false }, button, card, sentence);

            await waitForExpect(() => {
                expect(panel.querySelector('[data-grammar-rule-id="aspect-te-iru"]')).toBeNull();
            });
            expect(body.scrollTop).toBe(280);
        } finally {
            localStorage.removeItem('yomu.grammarPreferences.v1');
            document.body.replaceChildren();
        }
    });

    it('flattens Yomitan structured glossary content for the compact popup', () => {
        expect(glossaryToText({ type: 'structured-content', content: ['to read ', { tag: 'ruby', content: ['読', { tag: 'rt', content: 'よ' }] }] }))
            .toContain('to read');
        const html = glossaryToHtml({
            type: 'structured-content',
            content: {
                tag: 'ul',
                data: { content: 'glossary' },
                content: [{ tag: 'li', data: { class: 'tag' }, content: 'definition' }],
            },
        }, 'Jitendex');
        expect(html).toContain('class="structured-content"');
        expect(html).toContain('data-dictionary="Jitendex"');
        expect(html).toContain('class="gloss-sc-ul"');
        expect(html).toContain('data-sc-content="glossary"');
        expect(html).toContain('data-sc-class="tag"');
        expect(html).toContain('definition');
        expect(glossaryToHtml(['読', { tag: 'ruby', content: ['む', { tag: 'rt', content: 'む' }] }]))
            .toContain('読<ruby');
        expect(glossaryToText({ text: 123, description: 'display fallback' })).toBe('123 display fallback');
        expect(glossaryValueToSearchText({ text: 123, description: 'search fallback' })).toBe('search fallback');
        expect(glossaryValueToSearchText({ tag: 'span', 'data-content': 'xref-only' })).toBe('');
    });

    it('preserves dictionary-provided form table symbols', () => {
        const html = glossaryToHtml({
            tag: 'td',
            data: { class: 'form-valid' },
            content: { tag: 'span', title: 'valid form/reading combination', content: '○' },
        }, 'Jitendex');

        expect(html).toContain('data-sc-class="form-valid"');
        expect(html).toContain('title="valid form/reading combination"');
        expect(html).toContain('>○</span>');
    });

    it('renders Yomitan structured image metadata', () => {
        const html = glossaryToHtml({
            type: 'image',
            path: 'scan.png',
            width: 40,
            height: 20,
            preferredHeight: 5,
            pixelated: true,
            collapsed: true,
            collapsible: false,
            verticalAlign: 'middle',
            title: 'source scan',
            alt: 'scan description',
        }, 'Daijisen');

        expect(html).toContain('class="gloss-image-link"');
        expect(html).toContain('data-dictionary="Daijisen"');
        expect(html).toContain('data-image-load-state="error"');
        expect(html).toContain('title="source scan"');
        expect(html).toContain('scan description');
    });

    it('renders Yomitan search cross-references as in-reader lookup links when requested', () => {
        const html = glossaryToHtml({
            tag: 'a',
            href: '?query=%E7%88%B6%E3%81%95%E3%82%93&wildcards=off&primary_reading=%E3%81%A8%E3%81%86%E3%81%95%E3%82%93',
            content: '父さん',
        }, 'Jitendex', { internalSearchLinks: true });

        expect(html).toContain('href="#jpdb-reader-dictionary-lookup"');
        expect(html).toContain('data-dictionary-lookup="父さん"');
        expect(html).toContain('data-dictionary-reading="とうさん"');
        expect(html).toContain('data-external="false"');
        expect(html).not.toContain('jpdb.io/search');
        expect(html).not.toContain('target="_blank"');
    });

    it('renders Yomitan JPDB kanji links as in-reader kanji actions', () => {
        const html = glossaryToHtml({
            tag: 'a',
            href: '/kanji/%E8%AA%AD',
            content: '読',
        }, 'Jitendex', { internalSearchLinks: true });

        expect(html).toContain('href="#jpdb-reader-kanji-lookup"');
        expect(html).toContain('data-action="kanji"');
        expect(html).toContain('data-kanji="読"');
        expect(html).toContain('data-external="false"');
        expect(html).not.toContain('target="_blank"');
    });

    it('renders supplementary-plane Yomitan kanji links as in-reader kanji actions', () => {
        const html = glossaryToHtml({
            tag: 'a',
            href: '/kanji/𠮟',
            content: '𠮟',
        }, 'Jitendex', { internalSearchLinks: true });

        expect(html).toContain('href="#jpdb-reader-kanji-lookup"');
        expect(html).toContain('data-action="kanji"');
        expect(html).toContain('data-kanji="𠮟"');
        expect(html).toContain('data-external="false"');
        expect(html).not.toContain('target="_blank"');
    });

    it('scopes imported Yomitan dictionary CSS to dictionary content', () => {
        const css = renderDictionaryScopedStyles([
            { title: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 0, styles: 'ul[data-sc-content="glossary"] { padding-left: 1em; }' },
            { title: 'Disabled', alias: 'Disabled', enabled: false, priority: 1, styles: '.x { color: red; }' },
        ], [
            { name: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 0 },
            { name: 'Disabled', alias: 'Disabled', enabled: false, priority: 1 },
        ]);
        expect(css).toContain('[data-dictionary="Jitendex"]');
        expect(css).toContain('data-sc-content');
        expect(css).not.toContain('[data-dictionary="Disabled"]');
    });

    it('preserves nested dictionary CSS for Jitendex forms table symbols', () => {
        const css = renderDictionaryScopedStyles([
            {
                title: 'Jitendex',
                alias: 'Jitendex',
                enabled: true,
                priority: 0,
                styles: `
                    td[data-sc-class="form-valid"] > span {
                        color: var(--background-color);
                        &::before {
                            content: "◇";
                        }
                    }
                    div[data-sc-content="xref"], div[data-sc-content="antonym"] {
                        & span[data-sc-content="reference-label"] {
                            color: brown;
                        }
                    }
                `,
            },
        ]);

        expect(css).toContain('[data-dictionary="Jitendex"] td[data-sc-class="form-valid"] > span');
        expect(css).toContain('&::before');
        expect(css).toContain('content: "◇";');
        expect(css).toContain('[data-dictionary="Jitendex"] div[data-sc-content="xref"], [data-dictionary="Jitendex"] div[data-sc-content="antonym"]');
    });

    it('builds rich Anki fields from JPDB and imported dictionary context', () => {
        const fields = buildYomuAnkiFields({
            ...card,
            vid: 1456360,
            spelling: '読む',
            reading: 'よむ',
            frequencyRank: 400,
            meanings: [{ glosses: ['to read'], partOfSpeech: ['vt', 'v5', 'v5m'] }],
            pitchAccent: ['LHH'],
            cardState: ['known'],
        }, '今日は本を読む。', {
            sourceUrl: 'https://example.test/article',
            sourceTitle: 'Example article',
            dictionaryPreferences: [{ name: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 0 }],
            localEntries: [{
                expression: '読む',
                reading: 'よむ',
                glossary: [{ tag: 'ul', content: [{ tag: 'li', content: 'to read aloud' }] }],
                dictionary: 'Jitendex',
                definitionTags: 'common',
            }],
            kanjiEntries: [{
                character: '読',
                onyomi: ['ドク'],
                kunyomi: ['よ.む'],
                tags: ['grade 2'],
                meanings: ['read'],
                dictionary: 'KANJIDIC',
            }],
            metaEntries: [
                { expression: '読む', mode: 'freq', data: { displayValue: 123 }, dictionary: 'JPDBv2' },
                { expression: '読む', mode: 'pitch', data: { pitches: [1] }, dictionary: 'Pitch' },
            ],
        });

        expect(YOMU_MODEL_FIELDS).toContain('DictionaryDefinitions');
        expect(fields.Meaning).toContain('to read');
        expect(fields.Meaning).toContain('transitive verb');
        expect(fields.Sentence).toContain('yomu-highlight');
        expect(fields.DictionaryDefinitions).toContain('Jitendex');
        expect(fields.DictionaryDefinitions).toContain('to read aloud');
        expect(fields.Kanji).toContain('読');
        expect(fields.Kanji).toContain('read');
        expect(fields.Frequency).toContain('JPDB #400');
        expect(fields.Frequency).toContain('JPDBv2 #123');
        expect(fields.Pitch).toContain('LHH');
        expect(fields.Source).toContain('Example article');
    });

    it('highlights the mined surface form in Anki sentences when it differs from the headword', () => {
        const fields = buildYomuAnkiFields({
            ...card,
            spelling: '読む',
            reading: 'よむ',
        }, '今日は本を読みました。', {
            sentenceTarget: '読みました',
        });

        expect(fields.Sentence).toContain('<span class="yomu-highlight">読みました</span>');
        expect(fields.Sentence).not.toContain('<span class="yomu-highlight">読む</span>');
    });

    it('builds Anki fields for local dictionary cards without requiring JPDB links', () => {
        const localCard: JPDBCard = {
            vid: -1,
            sid: -1,
            rid: 0,
            spelling: '青空',
            reading: 'あおぞら',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [{ glosses: ['blue sky'], partOfSpeech: [] }],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'local',
        };

        const fields = buildYomuAnkiFields(localCard, '青空を見る。');

        expect(fields.Meaning).toContain('blue sky');
        expect(fields.JPDB).toBe('');
        expect(fields.Status).toContain('local dictionary');
    });

    it('uses Anki front-field settings when updating the Yomu model', async () => {
        const requests = stubTestAnkiConnectResults(request => request.action === 'modelNames'
            ? ['よむ Japanese']
            : request.action === 'modelFieldNames'
                ? YOMU_MODEL_FIELDS
                : null);

        try {
            const client = testAnkiClient({
                interfaceLanguage: 'ja',
                ankiFrontReading: false,
                ankiFrontSentence: false,
                ankiFrontImage: false,
            });

            await client.ensureDeckAndModel();

            const templateRequest = requests.find(request => request.action === 'updateModelTemplates');
            const templates = (templateRequest?.params.model as { templates: Record<string, { Front: string; Back: string }> }).templates;
            expect(templates.Recognition.Front).not.toContain('{{Reading}}');
            expect(templates.Recognition.Front).not.toContain('{{Sentence}}');
            expect(templates.Recognition.Front).not.toContain('{{Image}}');
            expect(templates.Recognition.Back).toContain('{{#Audio}}');
            expect(templates.Recognition.Back).not.toContain('{{#Status}}');
        } finally {
            vi.unstubAllGlobals();
        }
    });

});
