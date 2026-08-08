import { describe, expect, it, vi } from 'vitest';
import {
    registerReaderHelpersCleanup,
    DEFAULT_SETTINGS,
    ReaderApp,
    card,
    compareSubtitleTrackOptions,
    computeSubtitleDrawerLayout,
    configurePointerParseTest,
    createSubtitleVideoInsetAdapter,
    expectDefaultPointerParse,
    installVisualViewportFixture,
    isEnglishSubtitleTrack,
    isTargetLanguageSubtitleTrack,
    isUnavailableJapanesePod101Audio,
    jitenTestCard,
    lookupCandidateFromPoint,
    matchesShortcut,
    pointerTextCandidate,
    positionPopover,
    shouldReplaceWaitingNativeTrack,
    sizedPopover,
    splitJapaneseSentences,
    stubLocalPointerTextInternals,
    testImmersionKitExample,
    testImmersionPopoverInternals,
    testImmersionPopoverSurface,
    testPublicCard,
    testTokenForCard,
    waitForExpect,
    withBrowserViewport,
    withPointerTextLookupMock,
    withViewport,
} from './fixtures';
import type {
    JPDBCard,
    JPDBToken,
    TestImmersionPopoverInternals,
    YomitanTermEntry,
} from './fixtures';

registerReaderHelpersCleanup();

describe('reader helpers', () => {
    it('opens exact JPDB dictionary references before falling back to composite token selection', async () => {
        const app = new ReaderApp();
        const anchor = document.createElement('button');
        document.body.append(anchor);
        const exactCard: JPDBCard = {
            ...card,
            vid: 17000,
            sid: 0,
            spelling: '修繕積立金',
            reading: 'しゅうぜんつみたてきん',
            meanings: [{ glosses: ['maintenance fee; reserve fund for building repairs'], partOfSpeech: ['noun'] }],
            source: 'jpdb',
        };
        const componentTokens: JPDBToken[] = ['修繕', '積立', '金'].map((spelling, index) => ({
            card: {
                ...card,
                vid: 200 + index,
                sid: 0,
                spelling,
                reading: spelling,
                source: 'jpdb',
            },
            start: index,
            end: index + spelling.length,
            length: spelling.length,
            rubies: [],
            pitchClass: '',
            sentence: '修繕積立金',
        }));
        const search = vi.fn(async () => [exactCard]);
        const cacheCards = vi.fn();
        const showCard = vi.fn(async () => undefined);
        const parseJapanese = vi.fn(async () => [componentTokens]);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            jpdbVocabulary: { search: typeof search };
            parser: { cacheCards: typeof cacheCards };
            showCard: typeof showCard;
            parseJapanese: typeof parseJapanese;
            lookupDictionaryReference(
                query: string,
                reading: string,
                sourceDictionary: string,
                anchor: HTMLElement | undefined,
                trigger: 'modal' | 'hover',
                preservePosition?: boolean,
            ): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            jpdbDefinitionsEnabled: true,
            showPitchAccent: false,
            localDictionariesEnabled: false,
        };
        internals.jpdbVocabulary = { search };
        internals.parser = { cacheCards };
        internals.showCard = showCard;
        internals.parseJapanese = parseJapanese;

        try {
            await internals.lookupDictionaryReference('修繕積立金', 'しゅうぜんつみたてきん', 'JPDB', anchor, 'modal', true);

            expect(search).toHaveBeenCalledWith('修繕積立金', 12);
            expect(cacheCards).toHaveBeenCalledWith([exactCard]);
            expect(showCard).toHaveBeenCalledWith(exactCard, '修繕積立金', anchor, expect.objectContaining({
                autoPlay: false,
                trigger: 'modal',
                navigation: 'push-current',
                preservePosition: true,
            }));
            expect(parseJapanese).not.toHaveBeenCalled();
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('toggles Immersion Kit translation blur without losing the ReaderApp callback binding', async () => {
        const { app, container, popover } = testImmersionPopoverSurface();
        const example = testImmersionKitExample({
            sentence: '翻訳を確認しました。',
            translation: 'I checked the translation.',
            soundFile: '',
        });
        const internals = testImmersionPopoverInternals(app);
        internals.settings = {
            ...DEFAULT_SETTINGS,
            immersionKitShowImages: false,
            immersionKitShowTranslation: true,
            immersionKitRevealTranslationOnClick: true,
        };
        internals.immersionPopover.searchExamples = vi.fn(async () => ({
            examples: [example],
            query: '翻訳',
            usedFallback: false,
            triedQueries: ['翻訳'],
        }));
        internals.parseJapanese = vi.fn(async () => []);
        internals.immersionPopover.playExampleAudio = vi.fn(async () => undefined);
        internals.immersionPopover.mediaUrls = vi.fn(() => []);

        await internals.immersionPopover.loadExamples(popover, card);

        const searchLinks = Array.from(container.querySelectorAll<HTMLAnchorElement>('.jpdb-reader-immersion-search-link'));
        expect(searchLinks.map(link => link.textContent?.trim())).toEqual([
            expect.stringContaining('View on Immersion Kit'),
            expect.stringContaining('View on Nadeshiko'),
        ]);
        expect(searchLinks.map(link => link.getAttribute('href'))).toEqual([
            'https://www.immersionkit.com/dictionary?keyword=%E9%A3%9F%E3%81%B9%E3%82%8B&sort=sentence_length:asc&page=1',
            'https://nadeshiko.co/search/%E9%A3%9F%E3%81%B9%E3%82%8B',
        ]);

        const translation = container.querySelector<HTMLElement>('.jpdb-reader-example-translation');
        expect(translation?.dataset.immersionTranslationBlurred).toBe('true');

        translation?.click();

        expect(internals.settings.immersionKitRevealTranslationOnClick).toBe(false);
        expect(translation?.dataset.immersionTranslationBlurred).toBeUndefined();

        translation?.click();

        expect(internals.settings.immersionKitRevealTranslationOnClick).toBe(true);
        expect(translation?.dataset.immersionTranslationBlurred).toBe('true');
    });

    it('shows both external example searches on Jiten-backed Immersion cards', async () => {
        const { app, container, popover } = testImmersionPopoverSurface();
        const internals = testImmersionPopoverInternals(app);
        internals.settings = { ...DEFAULT_SETTINGS, immersionKitShowImages: false };
        internals.immersionPopover.searchExamples = vi.fn(async () => ({
            examples: [testImmersionKitExample({ sentence: '本を読む。', soundFile: '' })],
            query: '読む',
            usedFallback: false,
            triedQueries: ['読む'],
        }));
        internals.parseJapanese = vi.fn(async () => []);
        internals.immersionPopover.playExampleAudio = vi.fn(async () => undefined);
        internals.immersionPopover.mediaUrls = vi.fn(() => []);

        await internals.immersionPopover.loadExamples(popover, jitenTestCard());

        expect(Array.from(container.querySelectorAll<HTMLAnchorElement>('.jpdb-reader-immersion-search-link')).map(link => link.getAttribute('href'))).toEqual([
            'https://www.immersionkit.com/dictionary?keyword=%E8%AA%AD%E3%82%80&sort=sentence_length:asc&page=1',
            'https://nadeshiko.co/search/%E8%AA%AD%E3%82%80',
        ]);
    });

    it('keeps the current Immersion Kit image in place until the next one preloads', async () => {
        const pendingImages: Array<{ src: string; onload: ((event: Event) => void) | null; onerror: ((event: Event) => void) | null; decoding: string }> = [];
        class FakeImage {
            onload: ((event: Event) => void) | null = null;
            onerror: ((event: Event) => void) | null = null;
            decoding = 'auto';
            source = '';

            get src(): string {
                return this.source;
            }

            set src(value: string) {
                this.source = value;
                pendingImages.push(this);
            }
        }
        vi.stubGlobal('Image', FakeImage);

        try {
            const { app, container, popover } = testImmersionPopoverSurface();
            const firstExample = testImmersionKitExample({
                sentence: '最初の発音です',
                sourceTitle: 'First Source',
                titleSlug: 'first_source',
                soundFile: 'first.mp3',
                imageFile: 'first.jpg',
            });
            const secondExample = {
                ...firstExample,
                id: 'anime_test_000002',
                sentence: '次の発音です',
                sourceTitle: 'Second Source',
                imageFile: 'second.jpg',
            };
            const internals = testImmersionPopoverInternals(app) as TestImmersionPopoverInternals & {
                immersionKit: {
                    fetchBlobUrl(url: string | string[], timeoutMs: number): Promise<string>;
                };
            };
        internals.settings = { ...DEFAULT_SETTINGS, immersionKitShowImages: true };
        internals.immersionPopover.searchExamples = vi.fn(async () => ({
            examples: [firstExample, secondExample],
            query: '発音',
                usedFallback: false,
                triedQueries: ['発音'],
            }));
            internals.parseJapanese = vi.fn(async () => []);
            internals.immersionPopover.playExampleAudio = vi.fn(async () => undefined);
        internals.immersionPopover.mediaUrls = vi.fn((example, kind) => kind === 'image'
            ? [`https://media.test/${(example as { imageFile: string }).imageFile}`]
            : ['https://media.test/line.mp3']);
        internals.immersionKit.fetchBlobUrl = vi.fn(async url => `blob:http://localhost/${String(Array.isArray(url) ? url[0] : url).split('/').pop()}`);

        await internals.immersionPopover.loadExamples(popover, card);
        await waitForExpect(() => expect(container.querySelector<HTMLImageElement>('[data-immersion-image]')?.src).toBe('blob:http://localhost/first.jpg'));

        container.querySelector<HTMLButtonElement>('[data-immersion-action="next"]')?.click();

        const imageAfterNavigation = container.querySelector<HTMLImageElement>('[data-immersion-image]');
        expect(imageAfterNavigation?.src).toBe('blob:http://localhost/first.jpg');
        await waitForExpect(() => expect(pendingImages.at(-1)?.src).toBe('blob:http://localhost/second.jpg'));

        pendingImages.at(-1)?.onload?.(new Event('load'));

        expect(imageAfterNavigation?.src).toBe('blob:http://localhost/second.jpg');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('starts Immersion Kit navigation audio before JPDB parsing work', async () => {
        const { app, container, popover } = testImmersionPopoverSurface();
        const example = testImmersionKitExample({
            sentence: '発音も確かめました。',
        });
        const nextExample = {
            ...example,
            id: 'anime_test_000002',
            sentence: '文法も確かめました。',
        };
        const calls: string[] = [];
        const internals = testImmersionPopoverInternals(app);
        internals.settings = { ...DEFAULT_SETTINGS, immersionKitShowImages: false };
        internals.immersionPopover.searchExamples = vi.fn(async () => ({
            examples: [example, nextExample],
            query: '発音',
            usedFallback: false,
            triedQueries: ['発音'],
        }));
        internals.parseJapanese = vi.fn(async () => {
            calls.push('parse');
            return [];
        });
        internals.immersionPopover.playExampleAudio = vi.fn(async () => {
            calls.push('audio');
        });
        internals.immersionPopover.mediaUrls = vi.fn((_, kind) => kind === 'image' ? [] : ['https://media.test/line.mp3']);

        await internals.immersionPopover.loadExamples(popover, card);
        calls.length = 0;

        container.querySelector<HTMLButtonElement>('[data-immersion-action="next"]')?.click();

        expect(calls.slice(0, 2)).toEqual(['audio', 'parse']);
    });

    it('keeps Immersion Kit audio idle until the audio control is used', async () => {
        const { app, container, popover } = testImmersionPopoverSurface();
        const example = testImmersionKitExample();
        const playSpy = vi.fn(async () => undefined);
        const scheduledFrames: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            scheduledFrames.push(callback);
            return scheduledFrames.length;
        });
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            parseJapanese(texts: string[]): Promise<JPDBToken[][]>;
            immersionPopover: {
                loadExamples(popover: HTMLElement, card: JPDBCard): Promise<void>;
                searchExamples(card: JPDBCard): Promise<unknown>;
                playExampleAudio(example: unknown, quiet?: boolean, isCurrent?: () => boolean): Promise<void>;
            };
            immersionKit: {
                mediaUrls(example: unknown, kind: 'image' | 'sound'): string[];
            };
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            immersionKitAutoPlayAudio: true,
            immersionKitPlayOnHover: true,
            immersionKitPlayOnImageClick: true,
            immersionKitShowImages: true,
        };
        internals.immersionPopover.searchExamples = vi.fn(async () => ({
            examples: [example],
            query: '発音',
            usedFallback: false,
            triedQueries: ['発音'],
        }));
        internals.parseJapanese = vi.fn(async () => []);
        internals.immersionPopover.playExampleAudio = playSpy;

        await internals.immersionPopover.loadExamples(popover, card);

        expect(playSpy).not.toHaveBeenCalled();
        scheduledFrames.splice(0).forEach(callback => callback(performance.now()));
        await Promise.resolve();
        expect(playSpy).not.toHaveBeenCalled();

        container.querySelector<HTMLButtonElement>('[data-immersion-action="audio"]')?.click();

        expect(playSpy).toHaveBeenCalledWith(example);
    });

    it('does not treat normal-sized JapanesePod101 audio as unavailable', async () => {
        await expect(isUnavailableJapanesePod101Audio(new Blob([new Uint8Array(1512)]))).resolves.toBe(false);
    });

    it('keeps quoted Japanese sentences together', () => {
        expect(splitJapaneseSentences('これは犬です。「本当ですか？」はい。')).toEqual([
            'これは犬です。',
            '「本当ですか？」',
            'はい。',
        ]);
    });

    it('matches configurable shortcuts', () => {
        const event = new KeyboardEvent('keydown', { key: 'J', altKey: true, shiftKey: true });
        expect(matchesShortcut(event, 'Alt+Shift+J')).toBe(true);
        expect(matchesShortcut(event, 'Alt+J')).toBe(false);
    });

    it('defaults hover lookup to immediate open with a short close grace', () => {
        expect(DEFAULT_SETTINGS.hoverOpenDelayMs).toBe(0);
        expect(DEFAULT_SETTINGS.hoverCloseDelayMs).toBeLessThanOrEqual(100);
    });


    it('ranks and classifies subtitle tracks by learner usefulness', () => {
        const tracks = [
            { kind: 'youtube' as const, label: 'English', language: 'en' },
            { kind: 'youtube' as const, label: 'Japanese auto', language: 'ja', autoGenerated: true },
            { kind: 'remote' as const, label: '日本語', language: 'ja' },
            { kind: 'file' as const, label: 'Manual load' },
        ].sort(compareSubtitleTrackOptions);

        expect(tracks.map(track => track.label)).toEqual(['Manual load', '日本語', 'Japanese auto', 'English']);
        expect(isTargetLanguageSubtitleTrack(tracks[1])).toBe(true);
        expect(isEnglishSubtitleTrack(tracks[3])).toBe(true);
    });

    it('does not classify YouTube translation source-language labels as the target subtitle language', () => {
        const englishFromJapanese = {
            kind: 'youtube' as const,
            label: 'English (en) · auto-translated from 日本語 (自動生成)',
            language: 'en',
            sourceLanguage: 'ja',
            targetLanguage: 'en',
            autoGenerated: true,
        };
        const japaneseFromEnglish = {
            kind: 'youtube' as const,
            label: '日本語 (ja) · auto-translated from English',
            language: 'ja',
            sourceLanguage: 'en',
            targetLanguage: 'ja',
            autoGenerated: true,
        };

        expect(isTargetLanguageSubtitleTrack(englishFromJapanese)).toBe(false);
        expect(isEnglishSubtitleTrack(englishFromJapanese)).toBe(true);
        expect(isTargetLanguageSubtitleTrack(japaneseFromEnglish)).toBe(true);
        expect(isEnglishSubtitleTrack(japaneseFromEnglish)).toBe(false);
    });

    it('replaces waiting native subtitle tracks with matching remote files', () => {
        const nativeJapanese = { kind: 'native' as const, label: 'Japanese', language: 'ja' };
        const remoteJapanese = { kind: 'remote' as const, label: '日本語 subtitles', language: 'ja' };
        const remoteEnglish = { kind: 'remote' as const, label: 'English subtitles', language: 'en' };

        expect(shouldReplaceWaitingNativeTrack(nativeJapanese, remoteJapanese, [])).toBe(true);
        expect(shouldReplaceWaitingNativeTrack(nativeJapanese, remoteEnglish, [])).toBe(false);
        expect(shouldReplaceWaitingNativeTrack(nativeJapanese, remoteJapanese, [{ start: 0, end: 1, text: 'もうあります' }])).toBe(false);
    });

    it('uses a fixed right drawer layout on wide viewports', () => {
        const layout = computeSubtitleDrawerLayout({
            viewportWidth: 1600,
            viewportHeight: 940,
            anchorTop: 96,
            compactPanel: false,
            size: { sideWidth: 520 },
        });

        expect(layout.placement).toBe('right');
        expect(layout.width).toBe(520);
        expect(layout.left + layout.width).toBe(1590);
        expect(layout.top).toBe(96);
    });

    it('honors left drawer placement on wide viewports', () => {
        const layout = computeSubtitleDrawerLayout({
            viewportWidth: 1366,
            viewportHeight: 900,
            anchorTop: 84,
            compactPanel: false,
            preferredPlacement: 'left',
            size: { sideWidth: 420 },
        });

        expect(layout.placement).toBe('left');
        expect(layout.left).toBe(10);
        expect(layout.width).toBe(420);
    });

    it('uses a bottom-sheet drawer layout on compact viewports', () => {
        const layout = computeSubtitleDrawerLayout({
            viewportWidth: 720,
            viewportHeight: 900,
            anchorTop: 96,
            compactPanel: true,
            size: { bottomHeight: 360 },
        });

        expect(layout.placement).toBe('bottom');
        expect(layout.left).toBe(0);
        expect(layout.width).toBe(720);
        expect(layout.height).toBe(360);
        expect(layout.top + layout.height).toBe(900);
    });

    it('keeps explicit bottom transcript placement flush with the viewport edge on tablet layouts', () => {
        const layout = computeSubtitleDrawerLayout({
            viewportWidth: 1024,
            viewportHeight: 1366,
            anchorTop: 96,
            compactPanel: false,
            preferredPlacement: 'bottom',
            size: { bottomHeight: 420 },
        });

        expect(layout.placement).toBe('bottom');
        expect(layout.left).toBe(0);
        expect(layout.width).toBe(1024);
        expect(layout.top + layout.height).toBe(1366);
        expect(layout.margin).toBe(0);
    });

    it('keeps explicit side transcript placement on tablet layouts', () => {
        const left = computeSubtitleDrawerLayout({
            viewportWidth: 1024,
            viewportHeight: 1366,
            anchorTop: 84,
            compactPanel: false,
            preferredPlacement: 'left',
            size: { sideWidth: 420 },
        });
        const right = computeSubtitleDrawerLayout({
            viewportWidth: 1024,
            viewportHeight: 1366,
            anchorTop: 84,
            compactPanel: false,
            preferredPlacement: 'right',
            size: { sideWidth: 420 },
        });

        expect(left.placement).toBe('left');
        expect(left.left).toBe(10);
        expect(left.width).toBe(420);
        expect(left.top).toBe(84);
        expect(left.top + left.height).toBe(1356);
        expect(right.placement).toBe('right');
        expect(right.left).toBe(594);
        expect(right.width).toBe(420);
        expect(right.top).toBe(84);
        expect(right.top + right.height).toBe(1356);
    });

    it('applies generic video inset through a reversible adapter', () => {
        withViewport(1600, 900, () => {
            document.body.innerHTML = '<main id="player" style="width:1200px;max-width:1200px"><video></video><button class="player-control" type="button">Play</button></main>';
            const container = document.querySelector<HTMLElement>('#player')!;
            const video = document.querySelector('video') as HTMLVideoElement;
            Object.defineProperty(container, 'getBoundingClientRect', {
                configurable: true,
                value: () => new DOMRect(20, 30, 1200, 700),
            });
            Object.defineProperty(video, 'getBoundingClientRect', {
                configurable: true,
                value: () => new DOMRect(20, 30, 1200, 675),
            });
            Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1600 });
            Object.defineProperty(video, 'videoHeight', { configurable: true, value: 900 });

            const adapter = createSubtitleVideoInsetAdapter();
            try {
                adapter.apply({
                    video,
                    side: 'right',
                    playerSize: 1100,
                    panelSize: 460,
                    videoRect: new DOMRect(20, 30, 1200, 675),
                    margin: 10,
                });

                expect(document.documentElement.classList.contains('jpdb-subtitle-video-inset-right')).toBe(true);
                expect(document.documentElement.style.getPropertyValue('--jpdb-subtitle-video-inset')).toBe('470px');
                expect(container.style.width).toBe('1100px');
                expect(container.style.maxWidth).toBe('1100px');
                expect(container.style.height).toBe('700px');
                expect(container.style.maxHeight).toBe('700px');
                expect(container.style.minWidth).toBe('0px');
                expect(container.style.minHeight).toBe('0px');
                expect(container.style.marginRight).toBe('90px');
                expect(video.style.height).toBe('675px');
                expect(video.style.maxHeight).toBe('675px');
                expect(video.style.objectFit).toBe('contain');
            } finally {
                adapter.clear(video);
            }

            expect(document.documentElement.classList.contains('jpdb-subtitle-video-inset-right')).toBe(false);
            expect(document.documentElement.style.getPropertyValue('--jpdb-subtitle-video-inset')).toBe('');
            expect(container.style.width).toBe('1200px');
            expect(container.style.maxWidth).toBe('1200px');
            expect(container.style.height).toBe('');
            expect(container.style.maxHeight).toBe('');
            expect(container.style.minWidth).toBe('');
            expect(container.style.minHeight).toBe('');
            expect(container.style.marginRight).toBe('');
            expect(video.style.height).toBe('');
            expect(video.style.maxHeight).toBe('');
            expect(video.style.objectFit).toBe('');
        });
    });

    it('clears video insets during early navigation teardown before document.documentElement exists', () => {
        let originalRoot: HTMLElement | null = null;
        const rootSpy = vi.spyOn(document, 'documentElement', 'get');
        withViewport(1600, 900, () => {
            document.body.innerHTML = '<main id="player"><video></video></main>';
            const container = document.querySelector<HTMLElement>('#player')!;
            const video = document.querySelector('video') as HTMLVideoElement;
            Object.defineProperty(container, 'getBoundingClientRect', {
                configurable: true,
                value: () => new DOMRect(20, 30, 1200, 700),
            });
            Object.defineProperty(video, 'getBoundingClientRect', {
                configurable: true,
                value: () => new DOMRect(20, 30, 1200, 675),
            });
            Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1600 });
            Object.defineProperty(video, 'videoHeight', { configurable: true, value: 900 });

            const adapter = createSubtitleVideoInsetAdapter();
            try {
                adapter.apply({
                    video,
                    side: 'right',
                    playerSize: 1100,
                    panelSize: 460,
                    videoRect: new DOMRect(20, 30, 1200, 675),
                    margin: 10,
                });
                originalRoot = document.documentElement;
                rootSpy.mockReturnValue(null as unknown as HTMLElement);

                expect(adapter.hasActiveInset()).toBe(true);
                expect(adapter.clear(video)).toBe(true);
                expect(adapter.hasActiveInset()).toBe(false);
            } finally {
                rootSpy.mockRestore();
                originalRoot?.classList.remove('jpdb-subtitle-video-inset-left', 'jpdb-subtitle-video-inset-right', 'jpdb-subtitle-video-inset-bottom');
                originalRoot?.style.removeProperty('--jpdb-subtitle-video-inset');
                adapter.clear(video);
            }
        });
    });

    it('applies YouTube right drawer insets to the current watch player columns', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });

        withViewport(1600, 900, () => {
            document.body.innerHTML = `
                <ytd-watch-flexy>
                    <div id="columns"><div id="primary"><div id="primary-inner"><div id="movie_player"></div></div></div></div>
                </ytd-watch-flexy>
            `;
            const columns = document.querySelector<HTMLElement>('#columns')!;
            const primary = document.querySelector<HTMLElement>('#primary')!;
            const primaryInner = document.querySelector<HTMLElement>('#primary-inner')!;
            const moviePlayer = document.querySelector<HTMLElement>('#movie_player') as HTMLElement & { setSize?: (width: number, height: number) => void };
            const setSize = vi.fn();
            moviePlayer.setSize = setSize;
            let primaryRectCalls = 0;
            let primaryInnerRectCalls = 0;
            Object.defineProperty(primary, 'getBoundingClientRect', {
                configurable: true,
                value: () => {
                    primaryRectCalls += 1;
                    return new DOMRect(0, 0, 1200, 675);
                },
            });
            Object.defineProperty(primaryInner, 'getBoundingClientRect', {
                configurable: true,
                value: () => {
                    primaryInnerRectCalls += 1;
                    return new DOMRect(0, 0, 1200, 675);
                },
            });

            const adapter = createSubtitleVideoInsetAdapter();
            try {
                adapter.apply({
                    side: 'right',
                    playerSize: 1080,
                    panelSize: 420,
                    videoRect: new DOMRect(0, 0, 1200, 675),
                    margin: 12,
                });

                expect(document.documentElement.classList.contains('jpdb-subtitle-video-inset-right')).toBe(true);
                expect(document.documentElement.style.getPropertyValue('--jpdb-subtitle-video-inset')).toBe('432px');
                expect(primary.style.width).toBe('1080px');
                expect(primary.style.maxWidth).toBe('1080px');
                expect(primary.style.minWidth).toBe('0px');
                expect(primary.style.marginRight).toBe('32px');
                expect(columns.style.marginLeft).toBe('');
                expect(primaryInner.style.width).toBe('1080px');
                expect(primaryInner.style.maxWidth).toBe('1080px');
                expect(setSize).toHaveBeenCalledWith(1080, 608);
                expect(primaryRectCalls).toBe(1);
                expect(primaryInnerRectCalls).toBe(1);

                adapter.apply({
                    side: 'right',
                    playerSize: 1040,
                    panelSize: 460,
                    videoRect: new DOMRect(0, 0, 1200, 675),
                    margin: 12,
                });

                expect(primary.style.width).toBe('1040px');
                expect(primary.style.marginRight).toBe('72px');
                expect(primaryInner.style.width).toBe('1040px');
                expect(setSize).toHaveBeenLastCalledWith(1040, 585);
                expect(primaryRectCalls).toBe(1);
                expect(primaryInnerRectCalls).toBe(1);
            } finally {
                adapter.clear();
                Object.defineProperty(window, 'location', {
                    configurable: true,
                    value: originalLocation,
                });
                document.body.innerHTML = '';
            }

            expect(document.documentElement.classList.contains('jpdb-subtitle-video-inset-right')).toBe(false);
            expect(document.documentElement.style.getPropertyValue('--jpdb-subtitle-video-inset')).toBe('');
            expect(columns.style.marginLeft).toBe('');
            expect(primary.style.width).toBe('');
            expect(primaryInner.style.width).toBe('');
        });
    });

    it('fits and restores YouTube video element sizing during side drawer insets', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });

        withViewport(1600, 900, () => {
            document.body.innerHTML = `
                <ytd-watch-flexy>
                    <div id="columns"><div id="primary"><div id="primary-inner"><div id="movie_player"><video style="width:1200px;height:675px;left:-80px;top:12px;object-fit:cover"></video></div></div></div></div>
                </ytd-watch-flexy>
            `;
            const primary = document.querySelector<HTMLElement>('#primary')!;
            const primaryInner = document.querySelector<HTMLElement>('#primary-inner')!;
            const moviePlayer = document.querySelector<HTMLElement>('#movie_player') as HTMLElement & { setSize?: (width: number, height: number) => void };
            const video = document.querySelector('video') as HTMLVideoElement;
            moviePlayer.setSize = vi.fn((width: number, height: number) => {
                moviePlayer.style.width = `${width}px`;
                moviePlayer.style.height = `${height}px`;
                video.style.width = '640px';
                video.style.height = '360px';
                video.style.left = '220px';
            });
            Object.defineProperty(primary, 'getBoundingClientRect', {
                configurable: true,
                value: () => new DOMRect(0, 0, 1200, 675),
            });
            Object.defineProperty(primaryInner, 'getBoundingClientRect', {
                configurable: true,
                value: () => new DOMRect(0, 0, 1200, 675),
            });

            const adapter = createSubtitleVideoInsetAdapter();
            try {
                const options = {
                    video,
                    side: 'right' as const,
                    playerSize: 1080,
                    panelSize: 420,
                    videoRect: new DOMRect(0, 0, 1200, 675),
                    margin: 12,
                };
                adapter.apply(options);

                expect(moviePlayer.style.width).toBe('1080px');
                expect(moviePlayer.style.height).toBe('608px');
                expect(video.style.width).toBe('1080px');
                expect(video.style.height).toBe('608px');
                expect(video.style.left).toBe('0px');
                expect(video.style.top).toBe('0px');
                expect(video.style.objectFit).toBe('contain');

                video.style.width = '640px';
                video.style.height = '360px';
                video.style.left = '220px';
                adapter.apply(options);

                expect(video.style.width).toBe('1080px');
                expect(video.style.height).toBe('608px');
                expect(video.style.left).toBe('0px');
            } finally {
                adapter.clear(video);
                Object.defineProperty(window, 'location', {
                    configurable: true,
                    value: originalLocation,
                });
                document.body.innerHTML = '';
            }

            expect(moviePlayer.style.width).toBe('');
            expect(moviePlayer.style.height).toBe('');
            expect(video.style.width).toBe('1200px');
            expect(video.style.height).toBe('675px');
            expect(video.style.left).toBe('-80px');
            expect(video.style.top).toBe('12px');
            expect(video.style.objectFit).toBe('cover');
        });
    });

    it('applies non-overlap side insets on tablet mobile YouTube when side placement is explicit', () => {
        const originalLocation = location;
        vi.stubGlobal('location', new URL('https://m.youtube.com/watch?v=abc123'));

        try {
            for (const side of ['left', 'right'] as const) {
                withViewport(1024, 1366, () => {
                    document.body.innerHTML = `
                        <div id="player-container-id" class="player-container sticky-player">
                            <div id="player" class="player-api player-size"><div id="movie_player"></div></div>
                        </div>
                        <div class="watch-below-the-player">
                            <h2 class="slim-video-information-title">PTO Call</h2>
                            <div class="slim-video-information-subtitle-container">232,790回視聴 · 4日前</div>
                        </div>
                    `;
                    const playerContainer = document.querySelector<HTMLElement>('#player-container-id')!;
                    const belowPlayer = document.querySelector<HTMLElement>('.watch-below-the-player')!;
                    const moviePlayer = document.querySelector<HTMLElement>('#movie_player') as HTMLElement & { setSize?: (width: number, height: number) => void };
                    const setSize = vi.fn();
                    moviePlayer.setSize = setSize;
                    Object.defineProperty(playerContainer, 'getBoundingClientRect', {
                        configurable: true,
                        value: () => new DOMRect(0, 72, 866, 487),
                    });
                    Object.defineProperty(belowPlayer, 'getBoundingClientRect', {
                        configurable: true,
                        value: () => new DOMRect(0, 559, 866, 304),
                    });

                    const adapter = createSubtitleVideoInsetAdapter();
                    try {
                        adapter.apply({
                            side,
                            playerSize: 552,
                            panelSize: 420,
                            videoRect: new DOMRect(0, 72, 866, 487),
                            margin: 12,
                        });

                        expect(document.documentElement.classList.contains(`jpdb-subtitle-video-inset-${side}`)).toBe(true);
                        expect(document.documentElement.style.getPropertyValue('--jpdb-subtitle-video-inset')).toBe(side === 'left' ? '444px' : '432px');
                        expect(playerContainer.style.width).toBe('552px');
                        expect(playerContainer.style.maxWidth).toBe('552px');
                        expect(belowPlayer.style.width).toBe('552px');
                        expect(belowPlayer.style.maxWidth).toBe('552px');
                        expect(playerContainer.style.getPropertyValue(side === 'left' ? 'margin-left' : 'margin-right')).toBe(side === 'left' ? '444px' : '274px');
                        expect(belowPlayer.style.getPropertyValue(side === 'left' ? 'margin-left' : 'margin-right')).toBe(side === 'left' ? '444px' : '274px');
                        expect(playerContainer.style.getPropertyValue(side === 'left' ? 'margin-right' : 'margin-left')).toBe('0px');
                        expect(belowPlayer.style.getPropertyValue(side === 'left' ? 'margin-right' : 'margin-left')).toBe('0px');
                        expect(setSize).toHaveBeenCalledWith(552, 311);
                    } finally {
                        adapter.clear();
                        document.body.innerHTML = '';
                    }
                });
            }
        } finally {
            vi.stubGlobal('location', originalLocation);
        }
    });

    it('shifts the YouTube primary watch column right for a left transcript drawer without covering metadata', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });

        withViewport(1024, 1366, () => {
            document.body.innerHTML = `
                <ytd-watch-flexy>
                    <div id="columns">
                        <div id="primary"><div id="primary-inner"><div id="movie_player"></div><h1 id="title">日本語の動画</h1></div></div>
                        <div id="secondary"></div>
                    </div>
                </ytd-watch-flexy>
            `;
            const columns = document.querySelector<HTMLElement>('#columns')!;
            const primary = document.querySelector<HTMLElement>('#primary')!;
            const primaryInner = document.querySelector<HTMLElement>('#primary-inner')!;
            const moviePlayer = document.querySelector<HTMLElement>('#movie_player') as HTMLElement & { setSize?: (width: number, height: number) => void };
            const setSize = vi.fn();
            moviePlayer.setSize = setSize;
            Object.defineProperty(primary, 'getBoundingClientRect', {
                configurable: true,
                value: () => new DOMRect(0, 0, 920, 518),
            });
            Object.defineProperty(primaryInner, 'getBoundingClientRect', {
                configurable: true,
                value: () => new DOMRect(0, 0, 920, 518),
            });

            const adapter = createSubtitleVideoInsetAdapter();
            try {
                adapter.apply({
                    side: 'left',
                    playerSize: 552,
                    panelSize: 420,
                    videoRect: new DOMRect(0, 84, 920, 518),
                    margin: 12,
                });

                expect(document.documentElement.classList.contains('jpdb-subtitle-video-inset-left')).toBe(true);
                expect(document.documentElement.style.getPropertyValue('--jpdb-subtitle-video-inset')).toBe('444px');
                expect(columns.style.marginLeft).toBe('');
                expect(primary.style.width).toBe('552px');
                expect(primary.style.marginLeft).toBe('444px');
                expect(primaryInner.style.width).toBe('552px');
                expect(primaryInner.style.marginLeft).toBe('0px');
                expect(setSize).toHaveBeenCalledWith(552, 311);
            } finally {
                adapter.clear();
                Object.defineProperty(window, 'location', {
                    configurable: true,
                    value: originalLocation,
                });
                document.body.innerHTML = '';
            }

            expect(columns.style.marginLeft).toBe('');
            expect(primary.style.marginLeft).toBe('');
            expect(primary.style.width).toBe('');
            expect(primaryInner.style.width).toBe('');
            expect(primaryInner.style.marginLeft).toBe('');
        });
    });

    it('uses the full left inset for flex-centered YouTube watch columns', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });

        withViewport(1024, 1366, () => {
            document.body.innerHTML = `
                <ytd-watch-flexy>
                    <div id="columns" style="display: flex; justify-content: center;">
                        <div id="primary"><div id="primary-inner"><div id="movie_player"></div></div></div>
                    </div>
                </ytd-watch-flexy>
            `;
            const primary = document.querySelector<HTMLElement>('#primary')!;
            const primaryInner = document.querySelector<HTMLElement>('#primary-inner')!;
            const moviePlayer = document.querySelector<HTMLElement>('#movie_player') as HTMLElement & { setSize?: (width: number, height: number) => void };
            moviePlayer.setSize = vi.fn();
            Object.defineProperty(primary, 'getBoundingClientRect', {
                configurable: true,
                value: () => new DOMRect(185, 0, 654, 518),
            });
            Object.defineProperty(primaryInner, 'getBoundingClientRect', {
                configurable: true,
                value: () => new DOMRect(185, 0, 654, 518),
            });

            const adapter = createSubtitleVideoInsetAdapter();
            try {
                adapter.apply({
                    side: 'left',
                    playerSize: 552,
                    panelSize: 420,
                    videoRect: new DOMRect(185, 84, 920, 518),
                    margin: 12,
                });

                expect(primary.style.marginLeft).toBe('444px');
                expect(primaryInner.style.marginLeft).toBe('0px');
            } finally {
                adapter.clear();
                Object.defineProperty(window, 'location', {
                    configurable: true,
                    value: originalLocation,
                });
                document.body.innerHTML = '';
            }
        });
    });

    it('uses the visual viewport when iPad YouTube exposes an oversized layout viewport', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });

        withBrowserViewport(3099, 2324, () => {
            const { restore } = installVisualViewportFixture({ width: 1366, height: 1024 });
            try {
                document.body.innerHTML = `
                    <ytd-watch-flexy>
                        <div id="columns" style="display: flex; justify-content: flex-start;">
                            <div id="primary"><div id="primary-inner"><div id="movie_player"></div></div></div>
                        </div>
                    </ytd-watch-flexy>
                `;
                const primary = document.querySelector<HTMLElement>('#primary')!;
                const primaryInner = document.querySelector<HTMLElement>('#primary-inner')!;
                const moviePlayer = document.querySelector<HTMLElement>('#movie_player') as HTMLElement & { setSize?: (width: number, height: number) => void };
                moviePlayer.setSize = vi.fn();
                Object.defineProperty(primary, 'getBoundingClientRect', {
                    configurable: true,
                    value: () => new DOMRect(480, 68, 2095, 1178),
                });
                Object.defineProperty(primaryInner, 'getBoundingClientRect', {
                    configurable: true,
                    value: () => new DOMRect(480, 68, 2095, 1178),
                });

                const adapter = createSubtitleVideoInsetAdapter();
                try {
                    adapter.apply({
                        side: 'right',
                        playerSize: 886,
                        panelSize: 460,
                        videoRect: new DOMRect(480, 68, 2095, 1178),
                        margin: 10,
                    });

                    expect(primary.style.width).toBe('886px');
                    expect(primary.style.marginRight).toBe('470px');
                    expect(primaryInner.style.width).toBe('886px');
                    expect(primaryInner.style.marginRight).toBe('470px');
                } finally {
                    adapter.clear();
                }
            } finally {
                restore();
                Object.defineProperty(window, 'location', {
                    configurable: true,
                    value: originalLocation,
                });
                document.body.innerHTML = '';
            }
        });
    });

    it('does not resize or shift the YouTube player when the bottom transcript drawer is resized', () => {
        const originalLocation = location;
        vi.stubGlobal('location', new URL('https://www.youtube.com/watch?v=abc123'));

        withViewport(1024, 1366, () => {
            document.body.innerHTML = `
                <ytd-watch-flexy>
                    <div id="columns">
                        <div id="primary">
                            <div id="primary-inner">
                                <div id="player"><div id="player-container-outer"><div id="player-container-inner"><ytd-player><div id="movie_player"></div></ytd-player></div></div></div>
                                <h1 id="title">日本語の動画</h1>
                                <div id="actions">Like Share Save</div>
                            </div>
                        </div>
                    </div>
                </ytd-watch-flexy>
            `;
            const primary = document.querySelector<HTMLElement>('#primary')!;
            const primaryInner = document.querySelector<HTMLElement>('#primary-inner')!;
            const player = document.querySelector<HTMLElement>('#player')!;
            const playerOuter = document.querySelector<HTMLElement>('#player-container-outer')!;
            const playerInner = document.querySelector<HTMLElement>('#player-container-inner')!;
            const ytdPlayer = document.querySelector<HTMLElement>('ytd-player')!;
            const moviePlayer = document.querySelector<HTMLElement>('#movie_player') as HTMLElement & { setSize?: (width: number, height: number) => void };
            const setSize = vi.fn((width: number, height: number) => {
                moviePlayer.style.width = `${width}px`;
                moviePlayer.style.height = `${height}px`;
            });
            moviePlayer.setSize = setSize;

            const adapter = createSubtitleVideoInsetAdapter();
            try {
                adapter.apply({
                    side: 'bottom',
                    playerSize: 900,
                    panelSize: 420,
                    videoRect: new DOMRect(0, 84, 1024, 576),
                    margin: 0,
                });
                adapter.apply({
                    side: 'bottom',
                    playerSize: 760,
                    panelSize: 560,
                    videoRect: new DOMRect(0, 84, 1024, 576),
                    margin: 0,
                });

                expect(document.documentElement.classList.contains('jpdb-subtitle-video-inset-bottom')).toBe(true);
                expect(setSize).not.toHaveBeenCalled();
                expect(primary.style.height).toBe('');
                expect(primary.style.width).toBe('');
                expect(primaryInner.style.height).toBe('');
                expect(primaryInner.style.width).toBe('');
                for (const element of [player, playerOuter, playerInner, ytdPlayer, moviePlayer]) {
                    expect(element.style.width).toBe('');
                    expect(element.style.maxWidth).toBe('');
                    expect(element.style.height).toBe('');
                    expect(element.style.maxHeight).toBe('');
                    expect(element.style.minHeight).toBe('');
                    expect(element.style.marginLeft).toBe('');
                    expect(element.style.marginRight).toBe('');
                }
            } finally {
                adapter.clear();
                vi.stubGlobal('location', originalLocation);
                document.body.innerHTML = '';
            }
        });
    });

    it('preserves native YouTube Shorts sizing when side transcripts are open on desktop', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=short123') as unknown as Location,
        });

        withViewport(1600, 900, () => {
            document.body.innerHTML = `
                <ytd-watch-flexy>
                    <div id="primary"><div id="primary-inner"><div id="movie_player"><video></video></div></div></div>
                </ytd-watch-flexy>
            `;
            const primary = document.querySelector<HTMLElement>('#primary')!;
            const primaryInner = document.querySelector<HTMLElement>('#primary-inner')!;
            const moviePlayer = document.querySelector<HTMLElement>('#movie_player') as HTMLElement & { setSize?: (width: number, height: number) => void };
            const video = document.querySelector('video') as HTMLVideoElement;
            const setSize = vi.fn();
            moviePlayer.setSize = setSize;
            Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1080 });
            Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1920 });

            const adapter = createSubtitleVideoInsetAdapter();
            try {
                const changed = adapter.apply({
                    video,
                    side: 'right',
                    playerSize: 1080,
                    panelSize: 420,
                    videoRect: new DOMRect(440, 80, 360, 640),
                    margin: 12,
                });

                expect(changed).toBe(false);
                expect(document.documentElement.classList.contains('jpdb-subtitle-video-inset-right')).toBe(false);
                expect(document.documentElement.style.getPropertyValue('--jpdb-subtitle-video-inset')).toBe('');
                expect(primary.style.width).toBe('');
                expect(primaryInner.style.width).toBe('');
                expect(moviePlayer.style.width).toBe('');
                expect(setSize).not.toHaveBeenCalled();
            } finally {
                adapter.clear(video);
                Object.defineProperty(window, 'location', {
                    configurable: true,
                    value: originalLocation,
                });
                document.body.innerHTML = '';
            }
        });
    });

    it('clears a previous YouTube side inset after navigating to a desktop Short', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });

        withViewport(1600, 900, () => {
            document.body.innerHTML = `
                <ytd-watch-flexy>
                    <div id="primary"><div id="primary-inner"><div id="movie_player"><video></video></div></div></div>
                </ytd-watch-flexy>
            `;
            const primary = document.querySelector<HTMLElement>('#primary')!;
            const primaryInner = document.querySelector<HTMLElement>('#primary-inner')!;
            const moviePlayer = document.querySelector<HTMLElement>('#movie_player') as HTMLElement & { setSize?: (width: number, height: number) => void };
            const video = document.querySelector('video') as HTMLVideoElement;
            const setSize = vi.fn();
            moviePlayer.setSize = setSize;
            Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1920 });
            Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 });

            const adapter = createSubtitleVideoInsetAdapter();
            try {
                adapter.apply({
                    video,
                    side: 'right',
                    playerSize: 1080,
                    panelSize: 420,
                    videoRect: new DOMRect(0, 0, 1200, 675),
                    margin: 12,
                });

                expect(document.documentElement.classList.contains('jpdb-subtitle-video-inset-right')).toBe(true);
                expect(primary.style.width).toBe('1080px');
                expect(setSize).toHaveBeenCalledWith(1080, 608);

                Object.defineProperty(window, 'location', {
                    configurable: true,
                    value: new URL('https://www.youtube.com/shorts/short123') as unknown as Location,
                });
                Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1080 });
                Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1920 });

                expect(adapter.apply({
                    video,
                    side: 'right',
                    playerSize: 1080,
                    panelSize: 420,
                    videoRect: new DOMRect(440, 80, 360, 640),
                    margin: 12,
                })).toBe(true);

                expect(document.documentElement.classList.contains('jpdb-subtitle-video-inset-right')).toBe(false);
                expect(primary.style.width).toBe('');
                expect(primaryInner.style.width).toBe('');
                expect(moviePlayer.style.width).toBe('');
                expect(setSize).toHaveBeenCalledTimes(1);
            } finally {
                adapter.clear(video);
                Object.defineProperty(window, 'location', {
                    configurable: true,
                    value: originalLocation,
                });
                document.body.innerHTML = '';
            }
        });
    });

    it('can defer video layout resize events and YouTube setSize while inset updates are still changing', async () => {
        vi.useFakeTimers();
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });
        const onResize = vi.fn();
        window.addEventListener('resize', onResize);
        document.body.innerHTML = '<ytd-watch-flexy><div id="primary"><div id="primary-inner"><div id="movie_player"></div></div></div></ytd-watch-flexy>';
        const moviePlayer = document.querySelector<HTMLElement>('#movie_player') as HTMLElement & { setSize?: (width: number, height: number) => void };
        const setSize = vi.fn();
        moviePlayer.setSize = setSize;
        const adapter = createSubtitleVideoInsetAdapter();
        try {
            adapter.apply({
                side: 'right',
                playerSize: 1080,
                panelSize: 420,
                videoRect: new DOMRect(0, 0, 1200, 675),
                margin: 12,
                resizeEventMode: 'settled',
            });
            expect(onResize).not.toHaveBeenCalled();
            expect(setSize).not.toHaveBeenCalled();

            adapter.apply({
                side: 'right',
                playerSize: 1040,
                panelSize: 460,
                videoRect: new DOMRect(0, 0, 1200, 675),
                margin: 12,
                resizeEventMode: 'settled',
            });
            await vi.advanceTimersByTimeAsync(79);
            expect(onResize).not.toHaveBeenCalled();
            expect(setSize).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(1);
            // On YouTube the synthetic global window 'resize' is suppressed (it
            // reads as user activity and keeps the player controls awake); the
            // player still refits through its own setSize, which stays deferred.
            expect(onResize).not.toHaveBeenCalled();
            expect(setSize).toHaveBeenCalledTimes(1);
            expect(setSize).toHaveBeenCalledWith(1040, 585);
        } finally {
            window.removeEventListener('resize', onResize);
            adapter.clear();
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
            document.body.innerHTML = '';
            await vi.runOnlyPendingTimersAsync();
            vi.useRealTimers();
        }
    });

    it('keeps the hosted empty video frame at normal aspect ratio with a bottom drawer', () => {
        withViewport(390, 844, () => {
            document.body.innerHTML = '<section data-yomu-video-frame><video></video></section>';
            const container = document.querySelector<HTMLElement>('[data-yomu-video-frame]')!;
            const video = document.querySelector('video') as HTMLVideoElement;
            Object.defineProperty(container, 'getBoundingClientRect', {
                configurable: true,
                value: () => new DOMRect(9, 116, 372, 209.25),
            });
            Object.defineProperty(video, 'getBoundingClientRect', {
                configurable: true,
                value: () => new DOMRect(10, 117, 370, 207.25),
            });

            const adapter = createSubtitleVideoInsetAdapter();
            try {
                adapter.apply({
                    video,
                    side: 'bottom',
                    playerSize: 319,
                    panelSize: 388,
                    videoRect: new DOMRect(9, 116, 372, 209.25),
                    margin: 10,
                });

                expect(container.style.height).toBe('209px');
                expect(container.style.maxHeight).toBe('209px');
            } finally {
                adapter.clear(video);
            }

            expect(container.style.height).toBe('');
            expect(container.style.maxHeight).toBe('');
        });
    });

    it('applies a bottom drawer inset to plain video boxes instead of cropping through a parent frame', () => {
        withViewport(1280, 820, () => {
            document.body.innerHTML = '<section class="player"><video style="object-fit:cover"></video></section>';
            const container = document.querySelector<HTMLElement>('.player')!;
            const video = document.querySelector('video') as HTMLVideoElement;
            Object.defineProperty(container, 'getBoundingClientRect', {
                configurable: true,
                value: () => new DOMRect(24, 40, 960, 620),
            });
            Object.defineProperty(video, 'getBoundingClientRect', {
                configurable: true,
                value: () => new DOMRect(24, 40, 960, 540),
            });

            const adapter = createSubtitleVideoInsetAdapter();
            try {
                adapter.apply({
                    video,
                    side: 'bottom',
                    playerSize: 420,
                    panelSize: 360,
                    videoRect: new DOMRect(24, 40, 960, 540),
                    margin: 10,
                });

                expect(container.style.height).toBe('');
                expect(video.style.height).toBe('420px');
                expect(video.style.maxHeight).toBe('420px');
                expect(video.style.objectFit).toBe('contain');
            } finally {
                adapter.clear(video);
            }

            expect(video.style.height).toBe('');
            expect(video.style.maxHeight).toBe('');
            expect(video.style.objectFit).toBe('cover');
        });
    });

    it('positions hover popovers near the cursor without covering it', () => {
        withViewport(600, 420, () => {
            const popover = sizedPopover(220, 120);

            positionPopover(popover, undefined, undefined, { followPoint: { x: 300, y: 180 } });

            const left = Number.parseFloat(popover.style.left);
            const top = Number.parseFloat(popover.style.top);
            expect(left).toBeGreaterThanOrEqual(0);
            expect(left + 220).toBeLessThanOrEqual(600);
            expect(top).toBeGreaterThanOrEqual(0);
            expect(top + 120).toBeLessThanOrEqual(420);
            expect(top >= 190 || top + 120 <= 170).toBe(true);
        });
    });

    it('keeps cursor-following hover popovers out of the next-word path when there is room above', () => {
        withViewport(600, 500, () => {
            const popover = sizedPopover(220, 120);

            positionPopover(popover, undefined, undefined, {
                followPoint: { x: 300, y: 400 },
                preferBefore: true,
            });

            const top = Number.parseFloat(popover.style.top);
            expect(top + 120).toBeLessThanOrEqual(390);
            expect(popover.dataset.jpdbReaderPlacementSide).toBe('above');
        });
    });

    it('plans hover placement for a loaded entry so a preferred side without room is never used', () => {
        withViewport(600, 420, () => {
            // The cursor sits high enough that a loading skeleton (120px) fits
            // above, but a hydrated dictionary entry would not — the popover
            // must start below instead of flipping there after hydration.
            const popover = sizedPopover(220, 120);

            positionPopover(popover, undefined, undefined, {
                followPoint: { x: 300, y: 180 },
                preferBefore: true,
            });

            expect(popover.dataset.jpdbReaderPlacementSide).toBe('below');
        });
    });

    it('keeps cursor-following popovers inside the viewport near edges', () => {
        withViewport(360, 260, () => {
            const popover = sizedPopover(220, 120);

            positionPopover(popover, undefined, undefined, { followPoint: { x: 354, y: 248 } });

            const left = Number.parseFloat(popover.style.left);
            const top = Number.parseFloat(popover.style.top);
            expect(left).toBeGreaterThanOrEqual(0);
            expect(left + 220).toBeLessThanOrEqual(360);
            expect(top).toBeGreaterThanOrEqual(0);
            expect(top + 120).toBeLessThanOrEqual(260);
            expect(top + 120).toBeLessThanOrEqual(238);
        });
    });

    it('aligns anchored dictionary popovers to the scanned text like Yomitan', () => {
        withViewport(600, 420, () => {
            const popover = sizedPopover(220, 120);
            const anchor = document.createElement('span');
            anchor.getBoundingClientRect = () => new DOMRect(80, 70, 60, 32);
            document.body.append(anchor);

            positionPopover(popover, anchor);

            expect(Number.parseFloat(popover.style.left)).toBe(80);
            expect(Number.parseFloat(popover.style.top)).toBe(112);
            expect(popover.dataset.jpdbReaderPlacementSide).toBe('below');
        });
    });

    it('places anchored dictionary popovers above when there is more room there', () => {
        withViewport(600, 260, () => {
            const popover = sizedPopover(220, 120);
            const anchor = document.createElement('span');
            anchor.getBoundingClientRect = () => new DOMRect(80, 220, 60, 28);
            document.body.append(anchor);

            positionPopover(popover, anchor);

            expect(Number.parseFloat(popover.style.left)).toBe(80);
            expect(Number.parseFloat(popover.style.top)).toBe(90);
            expect(popover.dataset.jpdbReaderPlacementSide).toBe('above');
        });
    });

    it('positions fixed-height modal popovers from their final height before locking', () => {
        withViewport(760, 980, () => {
            const app = new ReaderApp();
            const anchor = document.createElement('span');
            anchor.getBoundingClientRect = () => new DOMRect(688, 828, 41, 21);
            const popover = document.createElement('section');
            popover.className = 'jpdb-reader-popover';
            popover.innerHTML = '<div class="jpdb-reader-popover-body"></div>';
            Object.defineProperties(popover, {
                offsetWidth: { configurable: true, value: 520 },
                offsetHeight: {
                    configurable: true,
                    get: () => Number.parseFloat(popover.style.height) || 455,
                },
            });
            document.body.append(anchor, popover);
            const internals = app as unknown as {
                settings: typeof DEFAULT_SETTINGS;
                activePopover: HTMLElement;
                activePopoverMode: 'modal';
                activePopoverAnchor: HTMLElement;
                activePopoverAnchorRect: DOMRect;
                activePopoverPositionLocked: boolean;
                repositionActivePopover(): void;
            };
            internals.settings = {
                ...DEFAULT_SETTINGS,
                popoverHeight: 540,
                popoverHeightMode: 'fixed',
            };
            internals.activePopover = popover;
            internals.activePopoverMode = 'modal';
            internals.activePopoverAnchor = anchor;
            internals.activePopoverAnchorRect = anchor.getBoundingClientRect();
            internals.activePopoverPositionLocked = false;

            try {
                internals.repositionActivePopover();

                expect(popover.style.height).toBe('540px');
                expect(popover.style.maxHeight).toBe('540px');
                expect(Number.parseFloat(popover.style.top)).toBe(278);
                expect(Number.parseFloat(popover.style.top) + popover.offsetHeight).toBeLessThan(anchor.getBoundingClientRect().top);
                expect(popover.dataset.jpdbReaderPlacementSide).toBe('above');
            } finally {
                app.destroy();
                document.body.replaceChildren();
            }
        });
    });

    it('keeps the placement side stable when the popover grows after content loads', () => {
        withViewport(600, 420, () => {
            const popover = sizedPopover(220, 120);
            const anchor = document.createElement('span');
            anchor.getBoundingClientRect = () => new DOMRect(80, 70, 60, 32);
            document.body.append(anchor);

            positionPopover(popover, anchor);
            expect(popover.dataset.jpdbReaderPlacementSide).toBe('below');

            // Hydration grows the entry past the space below; a reposition with
            // keepPlacementSide must clamp on the same side, not jump above.
            Object.defineProperty(popover, 'offsetHeight', { configurable: true, value: 400 });
            positionPopover(popover, anchor, undefined, { keepPlacementSide: true });

            expect(popover.dataset.jpdbReaderPlacementSide).toBe('below');
            expect(Number.parseFloat(popover.style.top)).toBe(112);
        });
    });

    it('honors a kept placement side even when a free decision would flip it', () => {
        withViewport(600, 600, () => {
            const popover = sizedPopover(220, 300);
            const anchor = document.createElement('span');
            anchor.getBoundingClientRect = () => new DOMRect(80, 180, 60, 28);
            document.body.append(anchor);

            positionPopover(popover, anchor);
            expect(popover.dataset.jpdbReaderPlacementSide).toBe('below');

            // A mounted popover that had settled above must stay above on a
            // keepPlacementSide reposition, clamped to the space there, even
            // though a free decision prefers the roomier side below.
            popover.dataset.jpdbReaderPlacementSide = 'above';
            positionPopover(popover, anchor, undefined, { keepPlacementSide: true });

            expect(popover.dataset.jpdbReaderPlacementSide).toBe('above');
            expect(Number.parseFloat(popover.style.top)).toBe(0);
            expect(popover.style.maxHeight).toBe('170px');
        });
    });

    it('releases a kept placement side when its space collapses below usability', () => {
        withViewport(600, 240, () => {
            // After a viewport shrink the locked side below retains only 2px;
            // the lock must yield instead of wedging the panel offscreen.
            const popover = sizedPopover(220, 300);
            const anchor = document.createElement('span');
            anchor.getBoundingClientRect = () => new DOMRect(80, 200, 60, 28);
            document.body.append(anchor);
            popover.dataset.jpdbReaderPlacementSide = 'below';

            positionPopover(popover, anchor, undefined, { keepPlacementSide: true });

            expect(popover.dataset.jpdbReaderPlacementSide).toBe('above');
            expect(Number.parseFloat(popover.style.top)).toBe(0);
            expect(popover.style.maxHeight).toBe('190px');
        });
    });

    it('only uses fallback pointer lookup when the pointer is on real text', () => {
        document.body.innerHTML = '<p>やさしいことば</p>';
        const paragraph = document.querySelector('p')!;
        const node = paragraph.firstChild as Text;
        const app = new ReaderApp();

        withPointerTextLookupMock(node, 2, [{ left: 20, top: 20, width: 120, height: 28 }], () => {
            expect(lookupCandidateFromPoint(app, 64, 30, paragraph)).toMatchObject({
                text: 'やさしいことば',
                offset: 2,
                start: 0,
                end: 7,
                anchor: paragraph,
            });
            expect(lookupCandidateFromPoint(app, 220, 30, paragraph)).toBeNull();
        });
    });

    it('does not let local pointer lookup steal a longer surface outside the pointer segment', async () => {
        const app = new ReaderApp();
        const anchor = document.createElement('span');
        const sentence = '好きなものを読んで日本語を学ぶ';
        document.body.append(anchor);
        const lookup = vi.fn(async (surface: string) => surface === 'きなものを'
            ? [{
                expression: 'きなものを',
                reading: 'きなものを',
                glossary: ['not a real pointer target'],
                dictionary: 'Test',
            } satisfies YomitanTermEntry]
            : []);
        const candidate = pointerTextCandidate(sentence, anchor, 5);
        const { internals, showPointerTextCard } = stubLocalPointerTextInternals(app, lookup);

        try {
            await internals.showFirstPointerTextCandidate(candidate, sentence, 'modal', { userGesture: true });

            expect(lookup).not.toHaveBeenCalledWith('きなものを', 'きなものを', expect.any(Number), expect.anything());
            expect(showPointerTextCard).not.toHaveBeenCalled();
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('keeps pointer lookup on the real segment when the pointer is inside the word', async () => {
        const app = new ReaderApp();
        const anchor = document.createElement('span');
        const sentence = '好きなものを読む';
        document.body.append(anchor);
        const entry: YomitanTermEntry = {
            expression: '好き',
            reading: 'すき',
            glossary: ['liked'],
            dictionary: 'Test',
        };
        const lookup = vi.fn(async (surface: string) => surface === '好き' ? [entry] : []);
        const candidate = pointerTextCandidate(sentence, anchor, 1);
        const { internals, showPointerTextCard } = stubLocalPointerTextInternals(app, lookup);

        try {
            await internals.showFirstPointerTextCandidate(candidate, sentence, 'modal', { userGesture: true });

            expect(showPointerTextCard).toHaveBeenCalledWith(
                expect.objectContaining({ spelling: '好き', reading: 'すき' }),
                sentence,
                candidate,
                expect.objectContaining({ start: 0, end: 2 }),
                'modal',
                { userGesture: true },
            );
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('uses the clicked word instead of the whole Japanese comment run for local pointer lookup', async () => {
        const app = new ReaderApp();
        const anchor = document.createElement('span');
        const sentence = '先生いつもありがとうございました';
        document.body.append(anchor);
        const entry: YomitanTermEntry = {
            expression: '先生',
            reading: 'せんせい',
            glossary: ['teacher'],
            dictionary: 'Test',
        };
        const lookup = vi.fn(async (surface: string) => surface === '先生' ? [entry] : []);
        const candidate = pointerTextCandidate(sentence, anchor, 1);
        const { internals, showPointerTextCard } = stubLocalPointerTextInternals(app, lookup, {
            jpdbDefinitionsEnabled: DEFAULT_SETTINGS.jpdbDefinitionsEnabled,
            showPitchAccent: DEFAULT_SETTINGS.showPitchAccent,
        });

        try {
            await internals.showFirstPointerTextCandidate(candidate, sentence, 'modal', { userGesture: true });

            // The span authority may ask the store about wider candidates than
            // the old funnel did (they are batched on real stores); what must
            // hold is that the clicked word's own surface is queried and the
            // whole comment run never becomes the shown word.
            expect(lookup).toHaveBeenCalledWith('先生', '先生', expect.any(Number), internals.settings.dictionaryPreferences);
            expect(showPointerTextCard).toHaveBeenCalledWith(
                expect.objectContaining({ spelling: '先生', reading: 'せんせい', source: 'local' }),
                sentence,
                candidate,
                expect.objectContaining({ start: 0, end: 2 }),
                'modal',
                { userGesture: true },
            );
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    }, 15_000);

    it('uses JPDB parsed pointer tokens so inflected text clicks keep reading and pitch', async () => {
        const app = new ReaderApp();
        document.body.innerHTML = '<p>好きなものを読んで日本語を学ぶ</p>';
        const paragraph = document.querySelector<HTMLElement>('p')!;
        const sentence = paragraph.textContent!;
        const lookupCard: JPDBCard = {
            ...card,
            vid: 1554390,
            sid: 0,
            spelling: '読む',
            reading: 'よむ',
            source: 'jpdb',
            pitchAccent: ['HLL'],
        };
        const token = testTokenForCard(lookupCard, sentence, {
            start: 6,
            end: 9,
            rubies: [{ text: 'よむ', start: 6, end: 9, length: 3 }],
            pitchClass: 'atamadaka',
        });
        const parse = vi.fn(async () => [[token]]);
        const candidate = pointerTextCandidate(sentence, paragraph, 6);
        const { internals, showPointerTextCard } = configurePointerParseTest(app, { parse });

        try {
            await internals.showFirstPointerTextCandidate(candidate, sentence, 'modal', { userGesture: true });

            expectDefaultPointerParse(parse, sentence);
            expect(showPointerTextCard).toHaveBeenCalledWith(
                lookupCard,
                sentence,
                candidate,
                expect.objectContaining({ start: 6, end: 9 }),
                'modal',
                { userGesture: true },
            );
        } finally {
            app.destroy();
        }
    });

    it('uses Jiten parsed pointer tokens so kana clicks keep the full word', async () => {
        const app = new ReaderApp();
        document.body.innerHTML = '<p>にほんごのじかん</p>';
        const paragraph = document.querySelector<HTMLElement>('p')!;
        const sentence = paragraph.textContent!;
        const lookupCard = jitenTestCard({
            spelling: '日本語',
            reading: 'にほんご',
            meanings: [{ glosses: ['Japanese language'], partOfSpeech: ['n'] }],
        });
        const token = testTokenForCard(lookupCard, sentence, {
            end: 4,
            rubies: [{ text: 'にほんご', start: 0, end: 4, length: 4 }],
            pitchClass: 'heiban',
        });
        const parse = vi.fn(async () => [[token]]);
        const candidate = pointerTextCandidate(sentence, paragraph, 1);
        const { internals, showLocalPointerTextCandidate, showPointerTextCard } = configurePointerParseTest(app, {
            parse,
            settings: {
                apiKey: '',
                jitenApiKey: 'jiten-key',
            },
        });

        try {
            await internals.showFirstPointerTextCandidate(candidate, sentence, 'modal', { userGesture: true });

            expect(showPointerTextCard).toHaveBeenCalledWith(
                lookupCard,
                sentence,
                candidate,
                expect.objectContaining({ start: 0, end: 4 }),
                'modal',
                { userGesture: true },
            );
            expect(showLocalPointerTextCandidate).not.toHaveBeenCalled();
        } finally {
            app.destroy();
        }
    });

    it('uses JPDB parsed kana pointer tokens from any character in a same-run word', async () => {
        const app = new ReaderApp();
        document.body.innerHTML = '<p>にほんごのじかん</p>';
        const paragraph = document.querySelector<HTMLElement>('p')!;
        const sentence = paragraph.textContent!;
        const japaneseCard = testPublicCard({
            vid: 1464530,
            spelling: 'にほんご',
            reading: 'にほんご',
        });
        const timeCard = testPublicCard({
            vid: 2600,
            spelling: 'じかん',
            reading: 'じかん',
        });
        const tokens: JPDBToken[] = [
            testTokenForCard(japaneseCard, sentence, {
            start: 0,
            end: 4,
            pitchClass: 'heiban',
            }),
            testTokenForCard(timeCard, sentence, {
            start: 5,
            end: 8,
            pitchClass: 'heiban',
            }),
        ];
        const parse = vi.fn(async () => [tokens]);
        const { internals, showLocalPointerTextCandidate, showPointerTextCard } = configurePointerParseTest(app, { parse });

        try {
            const cases: Array<[number, JPDBCard, { start: number; end: number }]> = [
                [0, japaneseCard, { start: 0, end: 4 }],
                [1, japaneseCard, { start: 0, end: 4 }],
                [2, japaneseCard, { start: 0, end: 4 }],
                [3, japaneseCard, { start: 0, end: 4 }],
                [5, timeCard, { start: 5, end: 8 }],
                [6, timeCard, { start: 5, end: 8 }],
                [7, timeCard, { start: 5, end: 8 }],
            ];

            for (const [offset, expectedCard, range] of cases) {
                const candidate = pointerTextCandidate(sentence, paragraph, offset);

                await internals.showFirstPointerTextCandidate(candidate, sentence, 'modal', { userGesture: true });

                expect(showPointerTextCard).toHaveBeenLastCalledWith(
                    expectedCard,
                    sentence,
                    candidate,
                    expect.objectContaining(range),
                    'modal',
                    { userGesture: true },
                );
            }
            expect(showLocalPointerTextCandidate).not.toHaveBeenCalled();
        } finally {
            app.destroy();
        }
    });

    it('does not accept fallback pointer parse chunks as JPDB results', async () => {
        const app = new ReaderApp();
        document.body.innerHTML = '<p>好きなものを読んで日本語を学ぶ</p>';
        const paragraph = document.querySelector<HTMLElement>('p')!;
        const sentence = paragraph.textContent!;
        const fallbackToken = testTokenForCard({
            ...card,
                vid: -91,
                sid: -91,
                spelling: '読',
                reading: '',
                source: 'fallback',
                pitchAccent: [],
        }, sentence, {
            start: 6,
            end: 7,
            pitchClass: '',
        });
        const parse = vi.fn(async () => [[fallbackToken]]);
        const candidate = pointerTextCandidate(sentence, paragraph, 6);
        const { internals, showPointerTextCard } = configurePointerParseTest(app, {
            parse,
            settings: { showPitchAccent: DEFAULT_SETTINGS.showPitchAccent },
        });

        try {
            await internals.showFirstPointerTextCandidate(candidate, sentence, 'modal', { userGesture: true });

            expectDefaultPointerParse(parse, sentence);
            // A reading-less single-kanji fallback fragment is a character,
            // not a word — the pointer stays silent so the kanji-card
            // surfaces own that tap, instead of the old cascade that
            // re-adjudicated parser output at the pointer layer.
            expect(showPointerTextCard).not.toHaveBeenCalled();
        } finally {
            app.destroy();
        }
    });

});
