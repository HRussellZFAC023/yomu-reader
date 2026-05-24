import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { requestSubtitleText, SubtitlePlayerController } from '../../src/reader/subtitles';
import type { JPDBToken, ReaderSettings } from '../../src/reader/types';

function withViewport<T>(width: number, height: number, callback: () => T): T {
    const widthDescriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    const heightDescriptor = Object.getOwnPropertyDescriptor(window, 'innerHeight');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    try {
        return callback();
    } finally {
        if (widthDescriptor) Object.defineProperty(window, 'innerWidth', widthDescriptor);
        else delete (window as unknown as Record<string, unknown>).innerWidth;
        if (heightDescriptor) Object.defineProperty(window, 'innerHeight', heightDescriptor);
        else delete (window as unknown as Record<string, unknown>).innerHeight;
    }
}

describe('SubtitlePlayerController', () => {
    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    it('renders one rail toggle for the subtitle side panel', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
        };
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            onSettingsChange: () => undefined,
        });

        (controller as unknown as { install: () => void }).install();
        const actions = [...document.querySelectorAll<HTMLButtonElement>('.jpdb-subtitle-rail button')]
            .map(button => button.dataset.action);

        expect(actions).toEqual(['previous', 'next', 'panel']);
        expect(document.querySelectorAll('.jpdb-subtitle-rail [data-action="panel"]')).toHaveLength(1);
        expect(document.querySelector('.jpdb-subtitle-rail [data-action="toggle"]')).toBeNull();
        expect(document.querySelector('.jpdb-subtitle-rail [data-action="list"]')).toBeNull();
        expect(document.querySelector('.jpdb-subtitle-rail [data-action="tracks"]')).toBeNull();
    });

    it('keeps subtitle file loaders in the side panel instead of the over-video menu', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
        };
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            onSettingsChange: () => undefined,
        });
        (controller as unknown as { install: () => void }).install();
        (controller as unknown as { video: HTMLVideoElement }).video = document.createElement('video');

        (controller as unknown as { toggleMenu: () => void }).toggleMenu();
        const menuActions = [...document.querySelectorAll<HTMLButtonElement>('.jpdb-subtitle-menu button')]
            .map(button => button.dataset.action);
        expect(menuActions).not.toContain('load');
        expect(menuActions).not.toContain('load-secondary');

        (controller as unknown as { openTracksPanel: () => void }).openTracksPanel();
        const sidePanelActions = [...document.querySelectorAll<HTMLButtonElement>('.jpdb-subtitle-list button')]
            .map(button => button.dataset.action);
        expect(sidePanelActions).toContain('load');
        expect(sidePanelActions).toContain('load-secondary');
    });

    it('exposes the compact subtitle drawer resize handle as an accentable keyboard separator', () => {
        withViewport(640, 820, () => {
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: '',
                localDictionariesEnabled: false,
            };
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese: async () => [],
                onSettingsChange: () => undefined,
            });

            try {
                (controller as unknown as { install: () => void }).install();
                (controller as unknown as { openTracksPanel: () => void }).openTracksPanel();

                const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                Object.defineProperty(panel, 'getBoundingClientRect', {
                    configurable: true,
                    value: () => new DOMRect(0, Number.parseFloat(panel.style.top) || 443, Number.parseFloat(panel.style.width) || 640, Number.parseFloat(panel.style.height) || 377),
                });
                const handle = panel.querySelector<HTMLElement>('[data-resize-transcript]')!;

                expect(handle.tagName).toBe('DIV');
                expect(handle.getAttribute('role')).toBe('separator');
                expect(handle.getAttribute('tabindex')).toBe('0');
                expect(handle.getAttribute('aria-orientation')).toBe('horizontal');
                expect(handle.getAttribute('aria-valuemin')).toBe('220');
                expect(handle.getAttribute('aria-valuenow')).toBe('377');

                handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));

                expect(panel.style.height).toBe('425px');
                expect(handle.getAttribute('aria-valuenow')).toBe('425');
            } finally {
                controller.destroy();
            }
        });
    });

    it('requests YouTube timedtext through the userscript bridge before page fetch', async () => {
        const originalLocation = window.location;
        const originalFetch = globalThis.fetch;
        const fetchMock = vi.fn(async () => new Response('<timedtext><body><p t="1000" d="1000">今日は</p></body></timedtext>', { status: 200 }));
        const gmRequest = vi.fn((details: Parameters<UserscriptHttpRequest>[0]) => {
            details.onload?.({ status: 200, responseText: '<timedtext><body><p t="1000" d="1000">今日は</p></body></timedtext>', response: '' });
        });
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });
        Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });
        vi.stubGlobal('GM_xmlhttpRequest', gmRequest);

        try {
            const text = await requestSubtitleText('https://www.youtube.com/api/timedtext?v=abc123&lang=ja&fmt=srv3');

            expect(text).toContain('timedtext');
            expect(gmRequest).toHaveBeenCalledTimes(1);
            expect(fetchMock).not.toHaveBeenCalled();
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
            Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
            vi.unstubAllGlobals();
        }
    });

    it('destroys the mounted subtitle runtime and stops its timer', async () => {
        vi.useFakeTimers();
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
        };
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            onSettingsChange: () => undefined,
        });

        controller.init();
        expect(document.querySelector('.jpdb-subtitle-player')).not.toBeNull();

        controller.destroy();
        await vi.advanceTimersByTimeAsync(1000);

        expect(document.querySelector('.jpdb-subtitle-player')).toBeNull();
    });

    it('ignores stale secondary cues after moving the same track to Japanese', async () => {
        vi.useFakeTimers();
        const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
            configurable: true,
            value: vi.fn(),
        });

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                subtitleOverlayVisible: true,
                subtitleSecondaryVisible: true,
                apiKey: '',
                localDictionariesEnabled: false,
            };
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese: async () => [],
                onSettingsChange: () => undefined,
            });
            (controller as unknown as { install: () => void }).install();

            const video = document.createElement('video');
            Object.defineProperty(video, 'currentTime', { configurable: true, value: 0.5, writable: true });
            (controller as unknown as { video: HTMLVideoElement }).video = video;

            const trackState = {
                mode: 'disabled',
                cues: [] as Array<{ startTime: number; endTime: number; text: string }>,
            };
            const track = trackState as unknown as TextTrack;

            (controller as unknown as {
                tracks: Array<{ id: string; label: string; kind: 'native'; language: string; track: TextTrack }>;
            }).tracks = [{
                id: 'native-0',
                label: 'English captions',
                kind: 'native',
                language: 'en',
                track,
            }];

            const secondarySelection = (controller as unknown as {
                selectSecondaryTrack: (id: string) => Promise<void>;
            }).selectSecondaryTrack('native-0');
            const primarySelection = (controller as unknown as {
                selectTrack: (id: string) => Promise<void>;
            }).selectTrack('native-0');

            trackState.cues = [{ startTime: 0, endTime: 2, text: 'Hello there' }];
            await vi.advanceTimersByTimeAsync(1000);
            await Promise.all([secondarySelection, primarySelection]);

            const internals = controller as unknown as {
                selectedTrackId: string;
                secondaryTrackId: string;
                cues: Array<{ text: string }>;
                secondaryCues: Array<{ text: string }>;
                secondaryCue?: { text: string };
                updateFromLoadedCues: () => void;
            };
            internals.updateFromLoadedCues();

            expect(internals.selectedTrackId).toBe('native-0');
            expect(internals.secondaryTrackId).toBe('');
            expect(internals.cues.map(cue => cue.text)).toEqual(['Hello there']);
            expect(internals.secondaryCues).toEqual([]);
            expect(internals.secondaryCue).toBeUndefined();
            expect(document.querySelector('.jpdb-subtitle-secondary')).toBeNull();
        } finally {
            if (scrollIntoViewDescriptor) {
                Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoViewDescriptor);
            } else {
                delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
            }
        }
    });

    it('clears auto-detected subtitles when a CIJ video route changes', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://cijapanese.com/video/560') as unknown as Location,
        });

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                subtitleOverlayVisible: true,
                apiKey: '',
                localDictionariesEnabled: false,
            };
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese: async () => [],
                onSettingsChange: () => undefined,
            });
            (controller as unknown as { install: () => void }).install();
            const internals = controller as unknown as {
                syncSubtitleSourceContext: () => boolean;
                tracks: Array<{ id: string; label: string; kind: 'remote' | 'file'; language?: string; url?: string; sourceKey?: string; cues?: Array<{ text: string }> }>;
                selectedTrackId: string;
                cues: Array<{ text: string }>;
                currentCue?: { text: string };
            };
            internals.tracks = [
                {
                    id: 'remote-0',
                    label: 'Old CIJ video',
                    kind: 'remote',
                    language: 'ja',
                    url: 'https://cijapanese.com/media/old.vtt',
                    sourceKey: 'track:https://cijapanese.com/media/old.vtt',
                },
                {
                    id: 'file-primary',
                    label: 'Manual file',
                    kind: 'file',
                    cues: [{ text: '手動字幕' }],
                },
            ];
            internals.selectedTrackId = 'remote-0';
            internals.cues = [{ text: '前の動画の字幕' }];
            internals.currentCue = { text: '前の動画の字幕' };

            expect(internals.syncSubtitleSourceContext()).toBe(false);

            Object.defineProperty(window, 'location', {
                configurable: true,
                value: new URL('https://cijapanese.com/video/652') as unknown as Location,
            });

            expect(internals.syncSubtitleSourceContext()).toBe(true);
            expect(internals.tracks).toMatchObject([{ id: 'file-primary', kind: 'file' }]);
            expect(internals.selectedTrackId).toBe('');
            expect(internals.cues).toEqual([]);
            expect(internals.currentCue).toBeUndefined();
            expect(document.querySelector('.jpdb-subtitle-primary')).toBeNull();
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('hydrates transcript rows with parsed subtitle words when the lines panel renders', async () => {
        vi.useFakeTimers();
        const originalRequestAnimationFrame = window.requestAnimationFrame;
        const originalCancelAnimationFrame = window.cancelAnimationFrame;
        window.requestAnimationFrame = ((callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0)) as typeof window.requestAnimationFrame;
        window.cancelAnimationFrame = ((id: number) => window.clearTimeout(id)) as typeof window.cancelAnimationFrame;

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                subtitleTranscriptAutoScroll: false,
                apiKey: 'test-key',
                localDictionariesEnabled: false,
            };
            const token: JPDBToken = {
                card: {
                    vid: 1,
                    sid: 2,
                    rid: 3,
                    spelling: '読む',
                    reading: 'よむ',
                    frequencyRank: null,
                    partOfSpeech: [],
                    meanings: [],
                    cardState: ['known'],
                    pitchAccent: [],
                    wordWithReading: null,
                },
                start: 0,
                end: 2,
                length: 2,
                rubies: [{ start: 0, end: 1, length: 1, text: 'よ' }],
                pitchClass: 'heiban',
                sentence: '読む',
            };
            const parseJapanese = vi.fn(async () => [token]);
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese,
                onSettingsChange: () => undefined,
            });
            (controller as unknown as { install: () => void }).install();

            const video = document.createElement('video');
            Object.defineProperty(video, 'currentTime', { configurable: true, value: 0.5, writable: true });
            const cue = { start: 0, end: 2, text: '読む', transcriptEligible: true };
            const internals = controller as unknown as {
                video: HTMLVideoElement;
                selectedTrackId: string;
                cues: Array<typeof cue>;
                currentCue: typeof cue;
                openLinesPanel: () => void;
            };
            internals.video = video;
            internals.selectedTrackId = 'file-primary';
            internals.cues = [cue];
            internals.currentCue = cue;

            internals.openLinesPanel();
            expect(document.querySelector('.jpdb-subtitle-row-text')?.innerHTML).toBe('読む');

            await vi.advanceTimersByTimeAsync(1);
            await Promise.resolve();

            const row = document.querySelector<HTMLElement>('.jpdb-subtitle-row-text');
            expect(parseJapanese).toHaveBeenCalledWith('読む');
            expect(row?.querySelector('.jpdb-reader-word.jpdb-known.jpdb-pitch-heiban')).not.toBeNull();
            expect(row?.querySelector('.jpdb-reader-furi')?.textContent).toBe('よ');
        } finally {
            window.requestAnimationFrame = originalRequestAnimationFrame;
            window.cancelAnimationFrame = originalCancelAnimationFrame;
        }
    });

    it('does not cache empty subtitle parse results as parsed word HTML', async () => {
        vi.useFakeTimers();
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'test-key',
            localDictionariesEnabled: false,
        };
        const token: JPDBToken = {
            card: {
                vid: 1,
                sid: 2,
                rid: 3,
                spelling: '読む',
                reading: 'よむ',
                frequencyRank: null,
                partOfSpeech: [],
                meanings: [],
                cardState: ['known'],
                pitchAccent: [],
                wordWithReading: null,
            },
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: 'heiban',
            sentence: '読む',
        };
        const parseJapanese = vi.fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([token]);
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese,
            onSettingsChange: () => undefined,
        });
        const internals = controller as unknown as {
            parseCueHtml: (text: string, settings: ReaderSettings) => Promise<string>;
            parseCacheKey: (text: string, settings: ReaderSettings) => string;
            parsedHtmlCache: Map<string, string>;
        };
        const key = internals.parseCacheKey('読む', settings);

        await expect(internals.parseCueHtml('読む', settings)).resolves.toBe('読む');
        expect(internals.parsedHtmlCache.has(key)).toBe(false);
        await expect(internals.parseCueHtml('読む', settings)).resolves.toBe('読む');
        expect(parseJapanese).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(2501);
        const parsed = await internals.parseCueHtml('読む', settings);
        expect(parsed).toContain('jpdb-reader-word jpdb-known jpdb-pitch-heiban');
        expect(internals.parsedHtmlCache.get(key)).toContain('jpdb-reader-word');
        expect(parseJapanese).toHaveBeenCalledTimes(2);
    });

    it('invalidates subtitle parse cache keys when the parser source changes', () => {
        const controller = new SubtitlePlayerController({
            getSettings: () => DEFAULT_SETTINGS,
            parseJapanese: async () => [],
            onSettingsChange: () => undefined,
        });
        const internals = controller as unknown as {
            parseCacheKey: (text: string, settings: typeof DEFAULT_SETTINGS) => string;
        };
        const localEmpty = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: true,
            dictionaryPreferences: [],
        };
        const withApi = {
            ...localEmpty,
            apiKey: 'test-key',
        };
        const withDictionary = {
            ...localEmpty,
            dictionaryPreferences: [{
                name: 'Jitendex',
                alias: '',
                enabled: true,
                priority: 0,
            }],
        };

        expect(internals.parseCacheKey('読む', localEmpty)).not.toBe(internals.parseCacheKey('読む', withApi));
        expect(internals.parseCacheKey('読む', localEmpty)).not.toBe(internals.parseCacheKey('読む', withDictionary));
    });

    it('continues parsing transcript rows beyond the visible hydration window', async () => {
        const originalRequestAnimationFrame = window.requestAnimationFrame;
        window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
            callback(performance.now());
            return 1;
        }) as typeof window.requestAnimationFrame;

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                subtitleTranscriptAutoScroll: false,
                apiKey: 'test-key',
                localDictionariesEnabled: false,
            };
            const parseJapanese = vi.fn(async () => []);
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese,
                onSettingsChange: () => undefined,
            });
            (controller as unknown as { install: () => void }).install();

            const video = document.createElement('video');
            Object.defineProperty(video, 'currentTime', { configurable: true, value: 0.5, writable: true });
            const cues = Array.from({ length: 24 }, (_, index) => ({
                start: index,
                end: index + 0.8,
                text: `字幕${index}`,
                transcriptEligible: true,
            }));
            const internals = controller as unknown as {
                video: HTMLVideoElement;
                selectedTrackId: string;
                cues: typeof cues;
                currentCue: typeof cues[number];
                openLinesPanel: () => void;
            };
            internals.video = video;
            internals.selectedTrackId = 'youtube-0';
            internals.cues = cues;
            internals.currentCue = cues[0];

            internals.openLinesPanel();
            for (let index = 0; index < cues.length * 12; index++) await Promise.resolve();

            expect(parseJapanese).toHaveBeenCalledWith('字幕23');
        } finally {
            window.requestAnimationFrame = originalRequestAnimationFrame;
        }
    });

    it('paces YouTube transcript warmup while still parsing ahead', async () => {
        vi.useFakeTimers();
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                subtitleTranscriptAutoScroll: false,
                apiKey: 'test-key',
                localDictionariesEnabled: false,
            };
            const parseJapanese = vi.fn(async () => []);
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese,
                onSettingsChange: () => undefined,
            });
            const cues = Array.from({ length: 80 }, (_, index) => ({
                start: index,
                end: index + 0.8,
                text: `字幕${index}`,
                transcriptEligible: true,
            }));
            const rows = cues.map((cue, cueIndex) => ({ cue, cueIndex }));
            type WarmupRows = typeof rows;
            type WarmupSettings = typeof settings;
            const internals = controller as unknown as {
                transcriptCacheWarmupSerial: number;
                warmTranscriptParseCache: (
                    rows: WarmupRows,
                    preferredIndex: number,
                    settings: WarmupSettings,
                    serial: number,
                ) => Promise<void>;
            };

            internals.transcriptCacheWarmupSerial = 1;
            const warmup = internals.warmTranscriptParseCache(rows, 0, settings, 1);

            await Promise.resolve();
            expect(parseJapanese).toHaveBeenCalledTimes(1);
            expect(parseJapanese).toHaveBeenCalledWith('字幕0');

            await vi.advanceTimersByTimeAsync(119);
            expect(parseJapanese).toHaveBeenCalledTimes(1);

            await vi.advanceTimersByTimeAsync(1);
            await Promise.resolve();
            expect(parseJapanese).toHaveBeenCalledTimes(2);
            expect(parseJapanese).toHaveBeenCalledWith('字幕1');

            internals.transcriptCacheWarmupSerial = 2;
            await vi.runOnlyPendingTimersAsync();
            await warmup;
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('batches transcript cache warmup when a batch parser is available', async () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            subtitleTranscriptAutoScroll: false,
            apiKey: 'test-key',
            localDictionariesEnabled: false,
        };
        const parseJapanese = vi.fn(async () => []);
        const parseJapaneseBatch = vi.fn(async (texts: string[], _options?: unknown) => texts.map(() => [] as JPDBToken[]));
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese,
            parseJapaneseBatch,
            onSettingsChange: () => undefined,
        });
        const cues = Array.from({ length: 9 }, (_, index) => ({
            start: index,
            end: index + 0.8,
            text: `字幕${index}`,
            transcriptEligible: true,
        }));
        const rows = cues.map((cue, cueIndex) => ({ cue, cueIndex }));
        type WarmupRows = typeof rows;
        type WarmupSettings = typeof settings;
        const internals = controller as unknown as {
            transcriptCacheWarmupSerial: number;
            warmTranscriptParseCache: (
                rows: WarmupRows,
                preferredIndex: number,
                settings: WarmupSettings,
                serial: number,
            ) => Promise<void>;
        };

        internals.transcriptCacheWarmupSerial = 1;
        await internals.warmTranscriptParseCache(rows, 0, settings, 1);

        expect(parseJapanese).not.toHaveBeenCalled();
        expect(parseJapaneseBatch.mock.calls[0]?.[0]).toEqual(['字幕0', '字幕1', '字幕2', '字幕3']);
        expect(parseJapaneseBatch.mock.calls[0]?.[1]).toEqual({ jpdbTimeoutMs: 1200, includeLocalPitch: true });
        expect(parseJapaneseBatch.mock.calls[1]?.[0]).toEqual(['字幕4', '字幕5', '字幕6', '字幕7']);
    });

    it('reuses pending transcript cue parses across batch hydration requests', async () => {
        const testSettings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            subtitleTranscriptAutoScroll: false,
            apiKey: 'test-key',
            localDictionariesEnabled: false,
        };
        let resolveBatch!: (tokens: JPDBToken[][]) => void;
        const parseJapaneseBatch = vi.fn((_texts: string[], _options?: unknown) => new Promise<JPDBToken[][]>(resolve => {
            resolveBatch = resolve;
        }));
        const controller = new SubtitlePlayerController({
            getSettings: () => testSettings,
            parseJapanese: async () => [],
            parseJapaneseBatch,
            onSettingsChange: () => undefined,
        });
        const internals = controller as unknown as {
            parseCueHtmlBatch: (texts: string[], settings: ReaderSettings) => Promise<Array<{ key: string; html: string }>>;
        };

        const first = internals.parseCueHtmlBatch(['字幕0'], testSettings);
        const second = internals.parseCueHtmlBatch(['字幕0'], testSettings);

        expect(parseJapaneseBatch).toHaveBeenCalledTimes(1);
        expect(parseJapaneseBatch.mock.calls[0]?.[1]).toEqual({ jpdbTimeoutMs: 1200, includeLocalPitch: true });
        resolveBatch([[]]);

        const [firstResult, secondResult] = await Promise.all([first, second]);
        expect(firstResult[0]?.html).toContain('字幕0');
        expect(secondResult[0]?.html).toContain('字幕0');
    });

    it('seeks using the source cue index when transcript rows are filtered', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            subtitleTranscriptAutoScroll: false,
            apiKey: '',
            localDictionariesEnabled: false,
        };
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            onSettingsChange: () => undefined,
        });
        (controller as unknown as { install: () => void }).install();

        const video = document.createElement('video');
        Object.defineProperty(video, 'currentTime', { configurable: true, value: 0, writable: true });
        const cues = [
            { start: 2, end: 3, text: 'native line', transcriptEligible: false },
            { start: 90, end: 92, text: '日本語の行', transcriptEligible: true },
        ];
        const internals = controller as unknown as {
            video: HTMLVideoElement;
            selectedTrackId: string;
            cues: typeof cues;
            currentCue: typeof cues[number];
            openLinesPanel: () => void;
        };
        internals.video = video;
        internals.selectedTrackId = 'youtube-0';
        internals.cues = cues;
        internals.currentCue = cues[1];

        internals.openLinesPanel();
        const row = document.querySelector<HTMLElement>('.jpdb-subtitle-list-row')!;
        row.querySelector<HTMLElement>('.jpdb-subtitle-row-text')!.innerHTML = '<span class="jpdb-reader-word" data-vid="1" data-sid="2" tabindex="0">日本語</span>の行';
        row.querySelector<HTMLElement>('.jpdb-reader-word')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(video.currentTime).toBe(0);

        row.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(video.currentTime).toBeCloseTo(90 + settings.subtitleSeekPadding);
    });
});
