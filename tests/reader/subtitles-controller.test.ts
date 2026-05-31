import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { readPageCaptionText } from '../../src/reader/subtitle-dom-captions';
import { requestSubtitleText, SubtitlePlayerController } from '../../src/reader/subtitles';
import type { JPDBToken, ReaderSettings } from '../../src/reader/types';

const SUBTITLES_YOUTUBE_CSS = readFileSync('src/reader/styles/subtitles-youtube.css', 'utf8');

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

    it('opens and closes the transcript drawer from the rail panel toggle', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
            subtitleTranscriptVisible: false,
        };
        const onSettingsChange = vi.fn();
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            onSettingsChange,
        });

        try {
            (controller as unknown as { install: () => void }).install();
            const video = document.createElement('video');
            const cue = { start: 0, end: 1, text: '今日は読む。', transcriptEligible: true };
            const internals = controller as unknown as {
                video: HTMLVideoElement;
                cues: Array<typeof cue>;
                currentCue: typeof cue;
            };
            internals.video = video;
            internals.cues = [cue];
            internals.currentCue = cue;
            controller.refresh();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            const button = root.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="panel"]')!;

            expect(button.disabled).toBe(false);
            expect(button.getAttribute('aria-pressed')).toBe('false');

            button.click();

            expect(panel.hidden).toBe(false);
            expect(root.classList.contains('jpdb-subtitle-panel-open')).toBe(true);
            expect(button.getAttribute('aria-pressed')).toBe('true');
            expect(settings.subtitleTranscriptVisible).toBe(true);

            button.click();

            expect(panel.hidden).toBe(true);
            expect(root.classList.contains('jpdb-subtitle-panel-open')).toBe(false);
            expect(button.getAttribute('aria-pressed')).toBe('false');
            expect(settings.subtitleTranscriptVisible).toBe(false);
            expect(onSettingsChange).toHaveBeenCalled();
        } finally {
            controller.destroy();
        }
    });

    it('returns compact subtitle controls to idle after pointer activity over video', async () => {
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

        try {
            (controller as unknown as { install: () => void }).install();
            const video = document.createElement('video');
            Object.defineProperty(video, 'getBoundingClientRect', {
                configurable: true,
                value: () => new DOMRect(0, 0, 1920, 1080),
            });
            (controller as unknown as { video: HTMLVideoElement }).video = video;
            controller.refresh();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);

            (controller as unknown as { handlePointerActivity: (event: Pick<PointerEvent, 'clientX' | 'clientY'>) => void })
                .handlePointerActivity({ clientX: 100, clientY: 100 });

            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(false);

            await vi.advanceTimersByTimeAsync(2600);

            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);
        } finally {
            controller.destroy();
        }
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

    it('lets video rail controls auto-hide while the transcript panel is open', async () => {
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

        try {
            (controller as unknown as { install: () => void }).install();
            const video = document.createElement('video');
            Object.defineProperty(video, 'getBoundingClientRect', {
                configurable: true,
                value: () => new DOMRect(0, 72, 960, 540),
            });
            const internals = controller as unknown as {
                video: HTMLVideoElement;
                cues: Array<{ start: number; end: number; text: string; transcriptEligible: boolean }>;
                openLinesPanel: () => void;
            };
            internals.video = video;
            internals.cues = [
                { start: 0, end: 1, text: '一番', transcriptEligible: true },
                { start: 1, end: 2, text: '二番', transcriptEligible: true },
            ];
            controller.refresh();

            internals.openLinesPanel();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            expect(document.querySelector<HTMLElement>('.jpdb-subtitle-list')?.hidden).toBe(false);
            expect(root.classList.contains('jpdb-subtitle-panel-open')).toBe(true);
            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);

            (controller as unknown as { handlePointerActivity: (event: Pick<PointerEvent, 'clientX' | 'clientY'>) => void })
                .handlePointerActivity({ clientX: 100, clientY: 100 });

            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(false);

            await vi.advanceTimersByTimeAsync(2600);

            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);
        } finally {
            controller.destroy();
        }
    });

    it('keeps the side panel toggle visible while compact navigation idles', () => {
        expect(SUBTITLES_YOUTUBE_CSS)
            .toContain('.jpdb-subtitle-controls-auto.jpdb-subtitle-controls-idle:not(.jpdb-subtitle-menu-open):not(.jpdb-subtitle-panel-open) .jpdb-subtitle-rail:not(:hover):not(:focus-within) {\n  opacity: .88;\n}');
        expect(SUBTITLES_YOUTUBE_CSS)
            .toContain('.jpdb-subtitle-controls-auto.jpdb-subtitle-controls-idle:not(.jpdb-subtitle-menu-open):not(.jpdb-subtitle-panel-open) .jpdb-subtitle-rail:not(:hover):not(:focus-within) button[data-action="previous"],');
        expect(SUBTITLES_YOUTUBE_CSS)
            .toContain('.jpdb-subtitle-controls-auto.jpdb-subtitle-controls-idle:not(.jpdb-subtitle-menu-open):not(.jpdb-subtitle-panel-open) .jpdb-subtitle-rail:not(:hover):not(:focus-within) button[data-action="next"] {\n  opacity: 0;\n  pointer-events: none;\n}');
        expect(SUBTITLES_YOUTUBE_CSS)
            .not.toContain('.jpdb-subtitle-controls-idle:not(.jpdb-subtitle-menu-open):not(.jpdb-subtitle-panel-open) .jpdb-subtitle-rail:not(:hover):not(:focus-within) {\n  opacity: 0;\n  pointer-events: none;\n}');
    });

    it('keeps the tracks panel open after choosing a primary track so Lines is an explicit next step', async () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
            subtitleOverlayVisible: true,
            subtitleTranscriptVisible: false,
        };
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            onSettingsChange: () => undefined,
        });

        try {
            (controller as unknown as { install: () => void }).install();
            (controller as unknown as { video: HTMLVideoElement }).video = document.createElement('video');
            (controller as unknown as { tracks: unknown[] }).tracks = [{
                id: 'file-ja',
                kind: 'file',
                label: '日本語',
                cues: [{ start: 1, end: 2, text: '今日は読む。' }],
            }];

            (controller as unknown as { openTracksPanel: () => void }).openTracksPanel();
            await (controller as unknown as { selectTrack: (id: string) => Promise<void> }).selectTrack('file-ja');

            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            expect(panel.classList.contains('jpdb-subtitle-tracks-panel')).toBe(true);
            expect(panel.querySelector<HTMLButtonElement>('[data-action="panel-tracks"]')?.getAttribute('aria-pressed')).toBe('true');
            expect(panel.querySelector<HTMLButtonElement>('[data-action="panel-lines"]')?.disabled).toBe(false);
            expect(panel.querySelector('.jpdb-subtitle-list-row')).toBeNull();

            panel.querySelector<HTMLButtonElement>('[data-action="panel-lines"]')!.click();

            expect(panel.classList.contains('jpdb-subtitle-lines-panel')).toBe(true);
            expect(panel.querySelector('.jpdb-subtitle-list-row')?.textContent).toContain('今日は読む。');
        } finally {
            controller.destroy();
        }
    });

    it('ignores YouTube home hover-preview captions instead of creating a global subtitle overlay', async () => {
        vi.useFakeTimers();
        const originalLocation = window.location;
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
            subtitleOverlayVisible: true,
            subtitleAutoDetect: true,
        };
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/') as unknown as Location,
        });
        document.body.innerHTML = `
            <ytd-rich-item-renderer>
                <video></video>
                <div class="caption-window"><span class="ytp-caption-segment">みなさん、こんにちは！</span></div>
            </ytd-rich-item-renderer>
        `;
        const video = document.querySelector('video')!;
        Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
        Object.defineProperty(video, 'getBoundingClientRect', {
            configurable: true,
            value: () => new DOMRect(0, 0, 640, 360),
        });
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            onSettingsChange: () => undefined,
        });

        try {
            controller.init();
            await vi.advanceTimersByTimeAsync(800);

            expect(document.querySelector('.jpdb-subtitle-primary')).toBeNull();
            expect(document.querySelector('.jpdb-subtitle-text')?.textContent).toBe('');
            expect((controller as unknown as { video?: HTMLVideoElement }).video).toBeUndefined();
            expect(document.documentElement.classList.contains('jpdb-subtitle-yomu-captions-active')).toBe(false);
        } finally {
            controller.destroy();
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('still reads scoped YouTube watch captions from the owned movie player', () => {
        const originalLocation = window.location;
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
            subtitleOverlayVisible: true,
            subtitleAutoDetect: true,
        };
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });
        document.body.innerHTML = `
            <div id="movie_player">
                <video></video>
                <div class="caption-window"><span class="ytp-caption-segment">今日は読む。</span></div>
            </div>
        `;
        const player = document.querySelector<HTMLElement>('#movie_player') as HTMLElement & { getVideoData?: () => { video_id?: string } };
        player.getVideoData = () => ({ video_id: 'abc123' });
        const video = document.querySelector('video')!;
        Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
        Object.defineProperty(video, 'getBoundingClientRect', {
            configurable: true,
            value: () => new DOMRect(0, 0, 960, 540),
        });
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            onSettingsChange: () => undefined,
        });

        try {
            controller.init();

            expect((controller as unknown as { video?: HTMLVideoElement }).video).toBe(video);
            expect(readPageCaptionText(video, document.querySelector<HTMLElement>('.jpdb-subtitle-player') ?? undefined)).toBe('今日は読む。');
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
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
            expect(parseJapanese).toHaveBeenCalledWith('読む', { jpdbTimeoutMs: 1200, allowJpdbTimeoutFallback: true, includeLocalPitch: false });
            expect(row?.querySelector('.jpdb-reader-word.jpdb-known.jpdb-pitch-heiban')).not.toBeNull();
            expect(row?.querySelector('.jpdb-reader-furi')?.textContent).toBe('よ');
        } finally {
            window.requestAnimationFrame = originalRequestAnimationFrame;
            window.cancelAnimationFrame = originalCancelAnimationFrame;
        }
    });

    it('updates transcript rows through the parse-key index instead of scanning every row', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            subtitleTranscriptAutoScroll: false,
            apiKey: 'test-key',
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
        const cue = { start: 0, end: 2, text: '読む', transcriptEligible: true };
        const internals = controller as unknown as {
            video: HTMLVideoElement;
            selectedTrackId: string;
            cues: Array<typeof cue>;
            currentCue: typeof cue;
            openLinesPanel: () => void;
            parseCacheKey: (text: string, settings: typeof DEFAULT_SETTINGS) => string;
            updateTranscriptRowsForParseKey(key: string, html: string): void;
        };
        internals.video = video;
        internals.selectedTrackId = 'file-primary';
        internals.cues = [cue];
        internals.currentCue = cue;

        internals.openLinesPanel();
        const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
        const originalQuerySelectorAll = panel.querySelectorAll.bind(panel);
        const querySelectorAll = vi.spyOn(panel, 'querySelectorAll');
        querySelectorAll.mockImplementation(((selector: string) => {
            if (selector === '[data-transcript-text]' || selector === '[data-transcript-text][data-parse-key]') {
                throw new Error('unexpected full transcript scan');
            }
            return originalQuerySelectorAll(selector);
        }) as typeof panel.querySelectorAll);

        const key = internals.parseCacheKey('読む', settings);
        internals.updateTranscriptRowsForParseKey(key, '<span class="jpdb-reader-word jpdb-known">読む</span>');

        expect(document.querySelector('.jpdb-subtitle-row-text .jpdb-reader-word')?.textContent).toBe('読む');
        expect(querySelectorAll).not.toHaveBeenCalledWith('[data-transcript-text]');
    });

    it('uses visible word surface text for parsed subtitle karaoke timing', () => {
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
            const subtitle = document.querySelector<HTMLElement>('.jpdb-subtitle-text')!;
            subtitle.innerHTML = `
                <div class="jpdb-subtitle-primary">
                    <span class="jpdb-reader-word">読<rt>よ</rt>む</span><span class="jpdb-reader-word">今日</span>
                </div>
            `;
            const cue = {
                start: 0,
                end: 3,
                text: '読む今日',
                words: [
                    { text: '読む', start: 0, end: 1 },
                    { text: '今日', start: 1, end: 2 },
                ],
                wordTimingsExact: true,
                transcriptEligible: true,
            };

            (controller as unknown as {
                applyKaraokeStateToPrimary: (cueArg: unknown, time: number) => void;
            }).applyKaraokeStateToPrimary(cue, 1.2);

            const words = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-subtitle-primary .jpdb-reader-word'));
            expect(words[0]?.classList.contains('jpdb-subtitle-word-spoken')).toBe(true);
            expect(words[1]?.classList.contains('jpdb-subtitle-word-current')).toBe(true);
        } finally {
            controller.destroy();
        }
    });

    it('does not apply karaoke state after parsed subtitle replacement', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            subtitleKaraokeMode: true,
            apiKey: 'test-key',
            localDictionariesEnabled: false,
        };
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            onSettingsChange: () => undefined,
        });

        try {
            (controller as unknown as { install: () => void }).install();
            const video = document.createElement('video');
            Object.defineProperty(video, 'currentTime', { configurable: true, value: 1.5, writable: true });
            const cue = {
                start: 1,
                end: 4,
                text: '今日読む',
                words: [
                    { text: '今日', start: 1, end: 2 },
                    { text: '読む', start: 2, end: 4 },
                ],
                wordTimingsExact: true,
                transcriptEligible: true,
            };
            const internals = controller as unknown as {
                video: HTMLVideoElement;
                selectedTrackId: string;
                cues: Array<typeof cue>;
                currentCue: typeof cue;
                subtitleEl: HTMLElement;
                renderSerial: number;
                replacePrimaryHtml(html: string, serial: number): void;
            };
            internals.video = video;
            internals.selectedTrackId = 'youtube-0';
            internals.cues = [cue];
            internals.currentCue = cue;
            internals.renderSerial = 7;
            internals.subtitleEl.innerHTML = '<div class="jpdb-subtitle-primary">今日読む</div>';

            internals.replacePrimaryHtml('<span class="jpdb-reader-word">読む</span>', 7);

            const parsedWord = document.querySelector<HTMLElement>('.jpdb-subtitle-primary .jpdb-reader-word')!;
            expect(parsedWord.textContent).toContain('読む');
            expect(parsedWord.classList.contains('jpdb-subtitle-word-current')).toBe(false);
            expect(parsedWord.classList.contains('jpdb-subtitle-word-spoken')).toBe(false);
            expect(parsedWord.classList.contains('jpdb-subtitle-word-pending')).toBe(false);
        } finally {
            controller.destroy();
        }
    });

    it('updates the active transcript line without replacing existing rows', () => {
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
        Object.defineProperty(video, 'currentTime', { configurable: true, value: 0.5, writable: true });
        const cues = [
            { start: 0, end: 1, text: '一番', transcriptEligible: true },
            { start: 1, end: 2, text: '二番', transcriptEligible: true },
        ];
        const internals = controller as unknown as {
            video: HTMLVideoElement;
            selectedTrackId: string;
            cues: typeof cues;
            currentCue: typeof cues[number];
            openLinesPanel: () => void;
            renderTranscriptPanel(force?: boolean): void;
        };
        internals.video = video;
        internals.selectedTrackId = 'file-primary';
        internals.cues = cues;
        internals.currentCue = cues[0]!;

        internals.openLinesPanel();
        const initialRows = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-subtitle-list-row'));
        expect(initialRows[0]?.classList.contains('active')).toBe(true);

        internals.currentCue = cues[1]!;
        video.currentTime = 1.2;
        internals.renderTranscriptPanel();

        const updatedRows = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-subtitle-list-row'));
        expect(updatedRows[0]).toBe(initialRows[0]);
        expect(updatedRows[1]).toBe(initialRows[1]);
        expect(updatedRows[0]?.classList.contains('active')).toBe(false);
        expect(updatedRows[1]?.classList.contains('active')).toBe(true);
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

    it('batches active subtitle warmup instead of parsing cues one by one', async () => {
        const settings = {
            ...DEFAULT_SETTINGS,
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
        const cues = [
            { start: 0, end: 1, text: '一番', transcriptEligible: true },
            { start: 1, end: 2, text: '二番', transcriptEligible: true },
            { start: 2, end: 3, text: '三番', transcriptEligible: true },
            { start: 3, end: 4, text: '四番', transcriptEligible: true },
        ];
        const internals = controller as unknown as {
            cues: typeof cues;
            currentCue: typeof cues[number];
            warmParseAroundActiveCue: () => void;
        };
        internals.cues = cues;
        internals.currentCue = cues[1]!;

        internals.warmParseAroundActiveCue();
        await Promise.resolve();
        await Promise.resolve();

        expect(parseJapanese).not.toHaveBeenCalled();
        expect(parseJapaneseBatch).toHaveBeenCalledTimes(1);
        expect(parseJapaneseBatch.mock.calls[0]?.[0]).toEqual(['一番', '二番', '三番', '四番']);
        expect(parseJapaneseBatch.mock.calls[0]?.[1]).toEqual({ jpdbTimeoutMs: 1200, allowJpdbTimeoutFallback: true, includeLocalPitch: false });
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

            expect(parseJapanese).toHaveBeenCalledWith('字幕23', { jpdbTimeoutMs: 1200, allowJpdbTimeoutFallback: true, includeLocalPitch: false });
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
            expect(parseJapanese).toHaveBeenCalledTimes(2);
            expect(parseJapanese).toHaveBeenCalledWith('字幕0', { jpdbTimeoutMs: 1200, allowJpdbTimeoutFallback: true, includeLocalPitch: false });
            expect(parseJapanese).toHaveBeenCalledWith('字幕1', { jpdbTimeoutMs: 1200, allowJpdbTimeoutFallback: true, includeLocalPitch: false });

            await vi.advanceTimersByTimeAsync(119);
            expect(parseJapanese).toHaveBeenCalledTimes(2);

            await vi.advanceTimersByTimeAsync(1);
            await Promise.resolve();
            expect(parseJapanese).toHaveBeenCalledTimes(4);
            expect(parseJapanese).toHaveBeenCalledWith('字幕2', { jpdbTimeoutMs: 1200, allowJpdbTimeoutFallback: true, includeLocalPitch: false });
            expect(parseJapanese).toHaveBeenCalledWith('字幕3', { jpdbTimeoutMs: 1200, allowJpdbTimeoutFallback: true, includeLocalPitch: false });

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
        expect(parseJapaneseBatch.mock.calls[0]?.[1]).toEqual({ jpdbTimeoutMs: 1200, allowJpdbTimeoutFallback: true, includeLocalPitch: false });
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
        expect(parseJapaneseBatch.mock.calls[0]?.[1]).toEqual({ jpdbTimeoutMs: 1200, allowJpdbTimeoutFallback: true, includeLocalPitch: false });
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

        expect(video.currentTime).toBeCloseTo(90);

        video.currentTime = 0;
        row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

        expect(video.currentTime).toBeCloseTo(90);
    });

    it('resumes a playing video after transcript row seeking pauses it', () => {
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
        let currentTime = 0;
        let paused = false;
        Object.defineProperty(video, 'currentTime', {
            configurable: true,
            get: () => currentTime,
            set: value => {
                currentTime = Number(value);
                paused = true;
            },
        });
        Object.defineProperty(video, 'paused', { configurable: true, get: () => paused });
        Object.defineProperty(video, 'ended', { configurable: true, value: false });
        const play = vi.fn(async () => {
            paused = false;
        });
        Object.defineProperty(video, 'play', { configurable: true, value: play });

        const cues = [{ start: 12, end: 14, text: '日本語の行', transcriptEligible: true }];
        const internals = controller as unknown as {
            video: HTMLVideoElement;
            cues: typeof cues;
            currentCue: typeof cues[number];
            openLinesPanel: () => void;
        };
        internals.video = video;
        internals.cues = cues;
        internals.currentCue = cues[0];

        internals.openLinesPanel();
        document.querySelector<HTMLElement>('.jpdb-subtitle-list-row')!
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(currentTime).toBeCloseTo(12);
        expect(play).toHaveBeenCalledTimes(1);
    });
});
