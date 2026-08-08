import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetActiveLearningTargetLanguage, setActiveLearningTargetLanguage } from '../../../src/reader/languages/active';
import {
    DEFAULT_SETTINGS,
    registerSubtitleControllerCleanup,
    SUBTITLES_YOUTUBE_CSS,
    mockElementRect,
    mockNetflixCaptionGeometry,
    controllerInternals,
    createInstalledSubtitleController,
    attachVideo,
    setupInstalledVideoController,
    pointerEvent,
    deferred,
    makeSubtitleToken,
    readPageCaptionText,
    withViewport,
    SubtitlePlayerController,
} from './fixtures';
import type {
    JPDBToken,
    ReaderSettings,
    SubtitleParsedHtmlCache,
} from './fixtures';

function nearbyPageCaption(text: string): HTMLVideoElement {
    document.body.innerHTML = '<video></video><div class="lesson-player"><span></span></div>';
    const video = document.querySelector('video') as HTMLVideoElement;
    const caption = document.querySelector('span') as HTMLElement;
    caption.textContent = text;
    mockElementRect(video, { left: 100, right: 740, top: 80, bottom: 440, width: 640, height: 360 } as DOMRect);
    mockElementRect(caption, { left: 180, right: 660, top: 380, bottom: 420, width: 480, height: 40 } as DOMRect);
    return video;
}

function readySubtitleCandidate(video: HTMLVideoElement, rect: DOMRect): void {
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    mockElementRect(video, rect);
}

function subtitleCandidateController(settings: ReaderSettings): SubtitlePlayerController {
    return new SubtitlePlayerController({
        getSettings: () => settings,
        parseJapanese: async () => [],
        onSettingsChange: () => undefined,
    });
}

describe('SubtitlePlayerController — page-caption detection & tracks panel', () => {
    registerSubtitleControllerCleanup();
    beforeEach(() => resetActiveLearningTargetLanguage());

    afterEach(() => {
        resetActiveLearningTargetLanguage();
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    it('does not schedule alignment animation frames repeatedly if layout inset is stable', () => {
        withViewport(1600, 900, () => {
            vi.useFakeTimers();
            const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
            const { controller } = setupInstalledVideoController(
                new DOMRect(80, 80, 1040, 585),
                { subtitleTranscriptVisible: true, subtitleTranscriptPlacement: 'right' },
            );
            const internals = controllerInternals<{
                alignToVideo: () => void;
                openLinesPanel: () => void;
                cues: unknown[];
                currentCue: unknown;
            }>(controller);

            const cue = { start: 0, end: 1, text: 'test', transcriptEligible: true };
            internals.cues = [cue];
            internals.currentCue = cue;

            try {
                internals.openLinesPanel();
                internals.alignToVideo();

                // Run any initial timers/frames
                vi.runAllTimers();
                rafSpy.mockClear();

                // Trigger a layout alignment cycle
                internals.alignToVideo();

                // Run the animation frame if any was scheduled
                vi.runAllTimers();

                // The infinite loop is broken, so requestAnimationFrame should not be scheduled repeatedly.
                // It should have been scheduled at most once (or zero times since layout didn't change).
                expect(rafSpy.mock.calls.length).toBeLessThanOrEqual(1);
            } finally {
                controller.destroy();
                rafSpy.mockRestore();
                vi.useRealTimers();
            }
        });
    });

    it('toggles native subtitle blur in place without reparsing or rebuilding the line', () => {
        const parseJapanese = vi.fn(async () => []);
        const onSettingsChange = vi.fn();
        const { settings, controller } = createInstalledSubtitleController({
            subtitleSecondaryVisible: true,
            subtitleNativeBlurred: true,
        }, { parseJapanese, onSettingsChange });
        const internals = controllerInternals<{
            render: () => void;
            secondaryCue?: { start: number; end: number; text: string; transcriptEligible: boolean };
        }>(controller);

        try {
            internals.secondaryCue = { start: 0, end: 2, text: 'English translation', transcriptEligible: true };
            internals.render();

            const button = document.querySelector<HTMLButtonElement>('.jpdb-subtitle-secondary')!;
            parseJapanese.mockClear();

            button.click();

            expect(settings.subtitleNativeBlurred).toBe(false);
            expect(onSettingsChange).toHaveBeenCalledTimes(1);
            expect(parseJapanese).not.toHaveBeenCalled();
            expect(document.querySelector('.jpdb-subtitle-secondary')).toBe(button);
            expect(button.classList.contains('jpdb-subtitle-secondary-clear')).toBe(true);
            expect(button.classList.contains('jpdb-subtitle-secondary-blurred')).toBe(false);

            internals.render();

            expect(document.querySelector('.jpdb-subtitle-secondary')).toBe(button);
        } finally {
            controller.destroy();
        }
    });

    it('toggles the mobile YouTube bottom sheet class without selector :has()', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://m.youtube.com/watch?v=abc123') as unknown as Location,
        });
        const { controller } = createInstalledSubtitleController();
        const internals = controllerInternals<{ syncYouTubeMobileBottomSheetState: () => void }>(controller);

        try {
            document.body.insertAdjacentHTML('beforeend', '<ytm-app><bottom-sheet-container aria-modal="true"></bottom-sheet-container></ytm-app>');

            internals.syncYouTubeMobileBottomSheetState();
            expect(document.documentElement.classList.contains('jpdb-subtitle-yt-sheet-open')).toBe(true);

            document.querySelector('bottom-sheet-container')?.setAttribute('hidden', '');
            internals.syncYouTubeMobileBottomSheetState();
            expect(document.documentElement.classList.contains('jpdb-subtitle-yt-sheet-open')).toBe(false);
        } finally {
            controller.destroy();
            expect(document.documentElement.classList.contains('jpdb-subtitle-yt-sheet-open')).toBe(false);
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('shifts the rail below the native mobile control row instead of covering it', () => {
        const normalizedCss = SUBTITLES_YOUTUBE_CSS.replace(/\s+/g, ' ');
        expect(normalizedCss).toContain('.jpdb-subtitle-native-top-controls .jpdb-subtitle-rail { top: max(var(--jpdb-subtitle-native-top-inset, 56px), env(safe-area-inset-top)); }');

        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://m.youtube.com/watch?v=abc123') as unknown as Location,
        });
        const { controller } = createInstalledSubtitleController();
        const internals = controllerInternals<{ syncNativeControlsInset: () => void; root?: HTMLElement }>(controller);

        try {
            document.body.insertAdjacentHTML('beforeend', '<div id="player-control-overlay"><div class="player-controls-top"></div></div>');
            const topRow = document.querySelector<HTMLElement>('.player-controls-top')!;
            Object.defineProperty(topRow, 'getBoundingClientRect', {
                value: () => ({ left: 0, right: 390, top: 0, bottom: 48, width: 390, height: 48, x: 0, y: 0, toJSON: () => ({}) }),
            });

            internals.syncNativeControlsInset();
            const root = internals.root!;
            expect(root.classList.contains('jpdb-subtitle-native-top-controls')).toBe(true);
            expect(root.style.getPropertyValue('--jpdb-subtitle-native-top-inset')).toBe('56px');

            document.getElementById('player-control-overlay')?.remove();
            internals.syncNativeControlsInset();
            expect(root.classList.contains('jpdb-subtitle-native-top-controls')).toBe(false);
            expect(root.style.getPropertyValue('--jpdb-subtitle-native-top-inset')).toBe('');
        } finally {
            controller.destroy();
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
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

    it('adjusts selected subtitle timing from the tracks panel without mutating source cues', async () => {
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true, subtitleTranscriptVisible: false });
        const video = attachVideo(controller, { currentTime: 1.2 });
        const cues = [{
            start: 1,
            end: 2,
            text: '今日は読む。',
            transcriptEligible: true,
            words: [{ text: '今日', start: 1, end: 1.2 }],
            wordTimingsExact: true,
        }];
        const track: {
            id: string;
            kind: 'file';
            label: string;
            cues: typeof cues;
            timingOffsetSeconds?: number;
        } = {
            id: 'file-ja',
            kind: 'file',
            label: '日本語',
            cues,
        };
        const internals = controllerInternals<{
            tracks: Array<typeof track>;
            cues: typeof cues;
            openTracksPanel: () => void;
            selectTrack: (id: string) => Promise<void>;
        }>(controller);

        try {
            internals.tracks = [track];
            internals.openTracksPanel();
            await internals.selectTrack('file-ja');

            let panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            expect(panel.querySelector('.jpdb-subtitle-track-offset-value')?.textContent).toBe('+0.00s');

            panel.querySelector<HTMLButtonElement>('[data-action="offset-later"]')!.click();

            panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            expect(track.timingOffsetSeconds).toBeCloseTo(0.1);
            expect(track.cues[0].start).toBe(1);
            expect(internals.cues[0].start).toBeCloseTo(1.1);
            expect(internals.cues[0].words?.[0]?.start).toBeCloseTo(1.1);
            expect(panel.querySelector('.jpdb-subtitle-track-offset-value')?.textContent).toBe('+0.10s');

            panel.querySelector<HTMLButtonElement>('[data-action="offset-earlier"]')!.click();

            expect(track.timingOffsetSeconds).toBeUndefined();
            expect(internals.cues[0].start).toBe(1);
            expect(document.querySelector('.jpdb-subtitle-track-offset-value')?.textContent).toBe('+0.00s');
            expect(video.currentTime).toBe(1.2);
        } finally {
            controller.destroy();
        }
    });

    it('virtualizes the tracks panel for videos with many auto-translated caption tracks', async () => {
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true, subtitleTranscriptVisible: false });
        attachVideo(controller, { currentTime: 1 });
        const makeTracks = (count: number) => Array.from({ length: count }, (_, index) => ({
            id: `track-${index}`,
            kind: 'youtube' as const,
            label: `日本語 (ja) auto-translated source ${index}`,
            language: 'ja',
        }));
        const internals = controllerInternals<{
            tracks: ReturnType<typeof makeTracks>;
            openTracksPanel: () => void;
        }>(controller);

        try {
            // Below the threshold every row renders; nothing is virtualized.
            internals.tracks = makeTracks(40);
            internals.openTracksPanel();
            let panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            expect(panel.querySelectorAll('.jpdb-subtitle-track-row')).toHaveLength(40);
            expect(panel.querySelector('.jpdb-subtitle-list-scroll[data-virtualized="true"]')).toBeNull();
            expect(panel.querySelectorAll('.jpdb-subtitle-list-spacer')).toHaveLength(0);

            // Above the threshold only a window of rows is in the DOM, reserved by
            // spacers, while the drawer meta still reports the full track count.
            internals.tracks = makeTracks(200);
            internals.openTracksPanel();
            panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            const rendered = panel.querySelectorAll('.jpdb-subtitle-track-row').length;
            expect(rendered).toBeGreaterThan(0);
            expect(rendered).toBeLessThan(200);
            expect(panel.querySelector('.jpdb-subtitle-list-scroll[data-virtualized="true"]')).not.toBeNull();
            expect(panel.querySelectorAll('.jpdb-subtitle-list-spacer').length).toBeGreaterThan(0);
            expect(panel.querySelector('.jpdb-subtitle-drawer-meta')?.textContent).toContain('200');
        } finally {
            controller.destroy();
        }
    });

    it('aligns previous and next subtitle starts to the playhead from the tracks panel', async () => {
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true, subtitleTranscriptVisible: false });
        attachVideo(controller, { currentTime: 5 });
        const cues = [
            { start: 2, end: 3, text: '前の字幕', transcriptEligible: true },
            { start: 8, end: 9, text: '次の字幕', transcriptEligible: true },
        ];
        const track: {
            id: string;
            kind: 'file';
            label: string;
            cues: typeof cues;
            timingOffsetSeconds?: number;
        } = {
            id: 'file-ja',
            kind: 'file',
            label: '日本語',
            cues,
        };
        const internals = controllerInternals<{
            tracks: Array<typeof track>;
            cues: typeof cues;
            openTracksPanel: () => void;
            selectTrack: (id: string) => Promise<void>;
        }>(controller);

        try {
            internals.tracks = [track];
            internals.openTracksPanel();
            await internals.selectTrack('file-ja');

            document.querySelector<HTMLButtonElement>('[data-action="offset-next"]')!.click();

            expect(track.timingOffsetSeconds).toBe(-3);
            expect(internals.cues[1].start).toBe(5);
            expect(document.querySelector('.jpdb-subtitle-track-offset-value')?.textContent).toBe('-3.00s');

            document.querySelector<HTMLButtonElement>('[data-action="offset-reset"]')!.click();
            document.querySelector<HTMLButtonElement>('[data-action="offset-previous"]')!.click();

            expect(track.timingOffsetSeconds).toBe(3);
            expect(internals.cues[0].start).toBe(5);
            expect(document.querySelector('.jpdb-subtitle-track-offset-value')?.textContent).toBe('+3.00s');
        } finally {
            controller.destroy();
        }
    });

    it('clears parsed ASBPlayer subtitle roots when the primary track is unset', () => {
        const { settings, controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        const internals = controllerInternals<{
            tracks: unknown[];
            selectedTrackId: string;
            cues: Array<{ start: number; end: number; text: string; transcriptEligible?: boolean }>;
            currentCue?: { start: number; end: number; text: string; transcriptEligible?: boolean };
            parseCacheKey: (text: string, settings: ReaderSettings) => string;
            htmlCache: SubtitleParsedHtmlCache;
            render: () => void;
            clearPrimaryTrack: () => void;
        }>(controller);
        document.body.insertAdjacentHTML('beforeend', `
            <div class="asbplayer-subtitles-container-bottom">
                <span class="jpdb-reader-word" data-vid="1" data-sid="1">日本語</span>を読む
            </div>
        `);

        try {
            internals.tracks = [{
                id: 'file-ja',
                kind: 'file',
                label: '日本語',
                cues: [{ start: 0, end: 2, text: '日本語を読む' }],
            }];
            internals.selectedTrackId = 'file-ja';
            internals.cues = [{ start: 0, end: 2, text: '日本語を読む', transcriptEligible: true }];
            internals.currentCue = internals.cues[0];
            internals.htmlCache.parsedHtmlCache.set(
                internals.parseCacheKey('日本語を読む', settings),
                '<span class="jpdb-reader-word">日本語</span>を読む',
            );
            internals.render();

            expect(document.querySelector('.jpdb-subtitle-primary')?.textContent).toContain('日本語を読む');

            internals.clearPrimaryTrack();

            const asbRoot = document.querySelector<HTMLElement>('.asbplayer-subtitles-container-bottom')!;
            expect(internals.selectedTrackId).toBe('');
            expect(document.querySelector('.jpdb-subtitle-primary')).toBeNull();
            expect(asbRoot.querySelector('.jpdb-reader-word')).toBeNull();
            expect(asbRoot.textContent?.replace(/\s+/g, '')).toBe('日本語を読む');
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
        readySubtitleCandidate(video, new DOMRect(0, 0, 640, 360));
        const controller = subtitleCandidateController(settings);

        try {
            expect(controller.hasDiscoverableVideoCandidate()).toBe(false);
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
        readySubtitleCandidate(video, new DOMRect(0, 0, 960, 540));
        const controller = subtitleCandidateController(settings);

        try {
            expect(controller.hasDiscoverableVideoCandidate()).toBe(true);
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

    it('keeps mobile YouTube fullscreen captions readable beside the Yomu overlay', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://m.youtube.com/watch?v=abc123') as unknown as Location,
        });
        document.body.innerHTML = `
            <ytm-player fullscreen>
                <video></video>
                <div class="caption-window"><span class="ytp-caption-segment">今日は読む。</span></div>
                <div class="jpdb-subtitle-player" data-jpdb-reader-root="true">
                    <div class="jpdb-subtitle-status">字幕トラックはまだ検出されていません。</div>
                </div>
            </ytm-player>
        `;
        const video = document.querySelector('video') as HTMLVideoElement;
        const caption = document.querySelector('.ytp-caption-segment') as HTMLElement;
        const readerRoot = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
        Object.defineProperty(video, 'getBoundingClientRect', {
            value: () => ({ left: 0, right: 1024, top: 0, bottom: 768, width: 1024, height: 768 }),
        });
        Object.defineProperty(caption, 'innerText', { value: caption.textContent ?? '' });
        Object.defineProperty(caption, 'getBoundingClientRect', {
            value: () => ({ left: 360, right: 664, top: 610, bottom: 648, width: 304, height: 38 }),
        });

        try {
            expect(readPageCaptionText(video, readerRoot)).toBe('今日は読む。');
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('reads mobile YouTube captions from the detached fullscreen control overlay', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://m.youtube.com/watch?v=abc123') as unknown as Location,
        });
        document.body.innerHTML = `
            <ytm-player fullscreen>
                <video></video>
            </ytm-player>
            <div id="player-control-overlay" class="fadein">
                <button type="button" aria-label="Pause">Pause</button>
                <div class="caption-window"><span class="ytp-caption-segment">先生いつもありがとうございました。</span></div>
                <button type="button" aria-label="Exit fullscreen">Exit fullscreen</button>
            </div>
            <div class="jpdb-subtitle-player" data-jpdb-reader-root="true">
                <div class="jpdb-subtitle-status">字幕トラックはまだ検出されていません。</div>
            </div>
        `;
        const video = document.querySelector('video') as HTMLVideoElement;
        const caption = document.querySelector('.ytp-caption-segment') as HTMLElement;
        const readerRoot = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
        Object.defineProperty(video, 'getBoundingClientRect', {
            value: () => ({ left: 0, right: 390, top: 0, bottom: 664, width: 390, height: 664 }),
        });
        Object.defineProperty(caption, 'innerText', { value: caption.textContent ?? '' });
        Object.defineProperty(caption, 'getBoundingClientRect', {
            value: () => ({ left: 48, right: 342, top: 548, bottom: 584, width: 294, height: 36 }),
        });

        try {
            expect(readPageCaptionText(video, readerRoot)).toBe('先生いつもありがとうございました。');
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('does not mirror fullscreen player chrome and Yomu status as captions', () => {
        document.body.innerHTML = `
            <video></video>
            <div class="captions-text">
                Pause Skip 00:00 -00:12 Mute Loop Settings AirPlay Exit fullscreen
                <span>字幕トラックはまだ検出されていません。</span>
                <div class="jpdb-subtitle-player" data-jpdb-reader-root="true">
                    <button type="button">‹</button>
                    <button type="button">›</button>
                </div>
            </div>
        `;
        const video = document.querySelector('video') as HTMLVideoElement;
        const chrome = document.querySelector('.captions-text') as HTMLElement;
        const readerRoot = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
        Object.defineProperty(video, 'getBoundingClientRect', {
            value: () => ({ left: 0, right: 1024, top: 0, bottom: 768, width: 1024, height: 768 }),
        });
        Object.defineProperty(chrome, 'innerText', { value: chrome.textContent ?? '' });
        Object.defineProperty(chrome, 'getBoundingClientRect', {
            value: () => ({ left: 40, right: 984, top: 650, bottom: 730, width: 944, height: 80 }),
        });

        expect(readPageCaptionText(video, readerRoot, { allowAnyCaptionScript: true })).toBe('');
    });

    it('does not treat text-only fullscreen control labels as non-Japanese captions', () => {
        document.body.innerHTML = `
            <video></video>
            <div class="captions-text">Pause Skip 00:00 -00:12 Mute Loop Settings AirPlay Exit fullscreen</div>
        `;
        const video = document.querySelector('video') as HTMLVideoElement;
        const chrome = document.querySelector('.captions-text') as HTMLElement;
        Object.defineProperty(video, 'getBoundingClientRect', {
            value: () => ({ left: 0, right: 1024, top: 0, bottom: 768, width: 1024, height: 768 }),
        });
        Object.defineProperty(chrome, 'innerText', { value: chrome.textContent ?? '' });
        Object.defineProperty(chrome, 'getBoundingClientRect', {
            value: () => ({ left: 40, right: 984, top: 650, bottom: 700, width: 944, height: 50 }),
        });

        expect(readPageCaptionText(video, undefined, { allowAnyCaptionScript: true })).toBe('');
    });

    it('detects Japanese page captions near a video without site-specific selectors', () => {
        const video = nearbyPageCaption('今日は花を見ます。');

        expect(readPageCaptionText(video)).toBe('今日は花を見ます。');
    });

    it('reads Netflix-shaped timed-text captions without treating player chrome as subtitles', () => {
        document.body.innerHTML = `
            <div class="watch-video">
                <video></video>
                <div class="player-timedtext-text-container">
                    <span data-uia="player-subtitle-text">今日は映画を見ます。</span>
                </div>
                <button type="button" aria-label="Pause">Pause</button>
            </div>
        `;
        const video = document.querySelector('video') as HTMLVideoElement;
        const caption = document.querySelector<HTMLElement>('[data-uia="player-subtitle-text"]')!;
        const captionContainer = document.querySelector<HTMLElement>('.player-timedtext-text-container')!;
        Object.defineProperty(video, 'getBoundingClientRect', {
            value: () => ({ left: 80, right: 1040, top: 40, bottom: 580, width: 960, height: 540 }),
        });
        Object.defineProperty(caption, 'innerText', { value: caption.textContent ?? '' });
        Object.defineProperty(caption, 'getBoundingClientRect', {
            value: () => ({ left: 320, right: 800, top: 470, bottom: 520, width: 480, height: 50 }),
        });
        Object.defineProperty(captionContainer, 'innerText', { value: caption.textContent ?? '' });
        Object.defineProperty(captionContainer, 'getBoundingClientRect', {
            value: () => ({ left: 300, right: 820, top: 452, bottom: 530, width: 520, height: 78 }),
        });

        expect(readPageCaptionText(video)).toBe('今日は映画を見ます。');
    });

    it('keeps Netflix-shaped DOM captions visible through parse settlement and transient foreground churn', async () => {
        let nowMs = 0;
        const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
        try {
            document.body.innerHTML = `
                <div class="watch-video">
                    <video controls></video>
                    <button type="button" aria-label="Captions" aria-pressed="true"></button>
                    <div class="player-timedtext-text-container">
                        <span data-uia="player-subtitle-text">今日は映画を見ます。</span>
                    </div>
                </div>
            `;
            const parsed = deferred<JPDBToken[][]>();
            const { controller } = createInstalledSubtitleController({
                subtitleOverlayVisible: true,
                subtitleTranscriptVisible: false,
            }, { parseJapaneseBatch: vi.fn(() => parsed.promise) });
            const video = document.querySelector('video') as HTMLVideoElement;
            attachVideo(controller, {
                video,
                currentTime: 12,
                rect: { left: 80, right: 1040, top: 40, bottom: 580, width: 960, height: 540 } as DOMRect,
            });
            const fixture = document.querySelector<HTMLElement>('.watch-video')!;
            const captionButton = document.querySelector<HTMLButtonElement>('[aria-label="Captions"]')!;
            const captionToggleClick = vi.fn();
            captionButton.addEventListener('click', captionToggleClick);
            const captionContainer = document.querySelector<HTMLElement>('.player-timedtext-text-container')!;
            mockNetflixCaptionGeometry(captionContainer);
            mockNetflixCaptionGeometry(document.querySelector<HTMLElement>('[data-uia="player-subtitle-text"]')!);

            const internals = controllerInternals<{
                setNativeTrackModes: () => void;
                updateFromDomCaptions: () => void;
                currentCue?: { end: number; text: string };
                lastAppliedSubtitleHtml: string;
                pendingDomCaption?: { parseSettled: boolean };
            }>(controller);
            internals.setNativeTrackModes();
            expect(captionToggleClick).not.toHaveBeenCalled();
            expect(document.documentElement.classList.contains('jpdb-subtitle-native-captions-suppressed')).toBe(false);
            internals.updateFromDomCaptions();
            nowMs += 200;
            internals.updateFromDomCaptions();

            // The stability delay is not enough to take ownership: Netflix's
            // caption remains the only painted line until the exact Yomu parse
            // that will become the first frame is ready.
            expect(internals.pendingDomCaption?.parseSettled).toBe(false);
            expect(internals.currentCue).toBeUndefined();
            expect(document.documentElement.classList.contains('jpdb-subtitle-native-captions-suppressed')).toBe(false);

            parsed.resolve([[makeSubtitleToken('今日は映画を見ます。')]]);
            await vi.waitFor(() => expect(internals.pendingDomCaption?.parseSettled).toBe(true));
            internals.updateFromDomCaptions();

            const rendered = document.querySelector<HTMLElement>('.jpdb-subtitle-lines')!;
            expect(rendered.textContent).toContain('今日は映画を見ます。');
            // The same publication turn suppresses Netflix, so there is no
            // one-tick native + Yomu overlap after parse settlement.
            expect(document.documentElement.classList.contains('jpdb-subtitle-native-captions-suppressed')).toBe(true);
            const stableHtml = internals.lastAppliedSubtitleHtml;

            captionContainer.remove();
            video.currentTime = (internals.currentCue?.end ?? 16) + 0.25;
            nowMs += 400;
            internals.updateFromDomCaptions();

            expect(internals.currentCue?.text).toBe('今日は映画を見ます。');
            expect(rendered.textContent).toContain('今日は映画を見ます。');
            expect(internals.lastAppliedSubtitleHtml).toBe(stableHtml);

            fixture.insertAdjacentHTML('beforeend', `
                <div class="player-timedtext-text-container">
                    <span data-uia="player-subtitle-text">今日は映画を見ます。</span>
                </div>
            `);
            mockNetflixCaptionGeometry(document.querySelector<HTMLElement>('.player-timedtext-text-container')!);
            mockNetflixCaptionGeometry(document.querySelector<HTMLElement>('[data-uia="player-subtitle-text"]')!);
            nowMs += 100;
            internals.setNativeTrackModes();
            internals.updateFromDomCaptions();

            expect(captionToggleClick).not.toHaveBeenCalled();
            expect(document.querySelector<HTMLElement>('.jpdb-subtitle-lines')?.textContent).toContain('今日は映画を見ます。');
            expect(internals.lastAppliedSubtitleHtml).toBe(stableHtml);
        } finally {
            nowSpy.mockRestore();
        }
    });

    it('mirrors Netflix-shaped DOM captions after parsing while the subtitle panel is open with the overlay off', async () => {
        let nowMs = 0;
        const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
        const parseJapaneseBatch = vi.fn(async (texts: string[]) => texts.map(text => [makeSubtitleToken(text)]));
        const { controller } = createInstalledSubtitleController({
            subtitleOverlayVisible: false,
            subtitleTranscriptVisible: false,
        }, { parseJapaneseBatch });

        try {
            document.body.insertAdjacentHTML('afterbegin', `
                <div class="watch-video">
                    <video controls></video>
                    <div class="player-timedtext-text-container">
                        <span data-uia="player-subtitle-text">今日は映画を見ます。</span>
                    </div>
                </div>
            `);
            const video = document.querySelector('video') as HTMLVideoElement;
            attachVideo(controller, {
                video,
                currentTime: 12,
                rect: { left: 80, right: 1040, top: 40, bottom: 580, width: 960, height: 540 } as DOMRect,
            });
            mockNetflixCaptionGeometry(document.querySelector<HTMLElement>('.player-timedtext-text-container')!);
            mockNetflixCaptionGeometry(document.querySelector<HTMLElement>('[data-uia="player-subtitle-text"]')!);

            const internals = controllerInternals<{
                currentCue?: { text: string };
                openTracksPanel: () => void;
                updateFromDomCaptions: () => void;
                pendingDomCaption?: { parseSettled: boolean };
            }>(controller);
            internals.openTracksPanel();
            internals.updateFromDomCaptions();
            nowMs += 200;
            internals.updateFromDomCaptions();

            expect(internals.currentCue).toBeUndefined();
            expect(document.documentElement.classList.contains('jpdb-subtitle-native-captions-suppressed')).toBe(false);
            await vi.waitFor(() => expect(internals.pendingDomCaption?.parseSettled).toBe(true));
            internals.updateFromDomCaptions();

            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            const linesButton = panel.querySelector<HTMLButtonElement>('[data-action="panel-lines"]')!;
            expect(internals.currentCue?.text).toBe('今日は映画を見ます。');
            expect(document.documentElement.classList.contains('jpdb-subtitle-native-captions-suppressed')).toBe(true);
            expect(panel.hidden).toBe(false);
            expect(linesButton.disabled).toBe(false);
        } finally {
            nowSpy.mockRestore();
            controller.destroy();
        }
    });

    it('collapses layout-only page caption line breaks before rendering the overlay', () => {
        document.body.innerHTML = '<video></video><div class="lesson-player"><span></span></div>';
        const video = document.querySelector('video') as HTMLVideoElement;
        const caption = document.querySelector('span') as HTMLElement;
        caption.textContent = 'エンジニア\nプログラミング\nする';
        Object.defineProperty(caption, 'innerText', { value: 'エンジニア\nプログラミング\nする' });
        Object.defineProperty(video, 'getBoundingClientRect', {
            value: () => ({ left: 100, right: 740, top: 80, bottom: 440, width: 640, height: 360 }),
        });
        Object.defineProperty(caption, 'getBoundingClientRect', {
            value: () => ({ left: 180, right: 660, top: 320, bottom: 420, width: 480, height: 100 }),
        });

        expect(readPageCaptionText(video)).toBe('エンジニア プログラミング する');
    });

    it('allows otherwise foreign page captions only when a real selected caption track asks for them', () => {
        const video = nearbyPageCaption('today we read subtitles');

        expect(readPageCaptionText(video)).toBe('');
        expect(readPageCaptionText(video, undefined, { allowAnyCaptionScript: true })).toBe('today we read subtitles');
    });

    it('accepts DOM captions recognized by the active non-Japanese target', () => {
        expect(setActiveLearningTargetLanguage('es')).not.toBeNull();
        const video = nearbyPageCaption('hoy leemos subtítulos');

        expect(readPageCaptionText(video)).toBe('hoy leemos subtítulos');
    });

    it('discovers a page subtitle track under a non-Japanese active target', () => {
        expect(setActiveLearningTargetLanguage('es')).not.toBeNull();
        document.body.innerHTML = `
            <video controls>
                <track kind="subtitles" srclang="es" label="Español" src="/captions/es.vtt">
            </video>
        `;
        const { controller } = createInstalledSubtitleController({ subtitleAutoDetect: true });
        const internals = controllerInternals<{
            discoverPageSubtitleTracks: () => void;
            tracks: Array<{ kind: string; language?: string; label: string; url?: string }>;
        }>(controller);

        try {
            internals.discoverPageSubtitleTracks();

            expect(internals.tracks).toContainEqual(expect.objectContaining({
                kind: 'remote',
                language: 'es',
                label: 'Español',
            }));
        } finally {
            controller.destroy();
        }
    });

    it('does not treat asbplayer helper DOM as page captions', () => {
        document.body.innerHTML = `
            <video></video>
            <div class="asbplayer-offscreen">新卒エンジニア仕事</div>
            <div class="asbplayer-subtitles-container-bottom"><span>新卒エンジニア仕事</span></div>
        `;
        const video = document.querySelector('video') as HTMLVideoElement;
        Object.defineProperty(video, 'getBoundingClientRect', {
            value: () => ({ left: 0, right: 840, top: 0, bottom: 480, width: 840, height: 480 }),
        });
        for (const element of Array.from(document.querySelectorAll<HTMLElement>('div, span'))) {
            Object.defineProperty(element, 'innerText', { value: element.textContent ?? '' });
            Object.defineProperty(element, 'getBoundingClientRect', {
                value: () => ({ left: 100, right: 740, top: 360, bottom: 420, width: 640, height: 60 }),
            });
        }

        expect(readPageCaptionText(video)).toBe('');
    });

    it('does not treat YouTube Shorts titles near the video as page captions', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/shorts/abc123') as unknown as Location,
        });
        document.body.innerHTML = `
            <video></video>
            <h3 class="shortsLockupViewModelHostMetadataTitle"><span>鉛筆の音1時間 目を閉じて聴いていたら</span></h3>
        `;
        const video = document.querySelector('video') as HTMLVideoElement;
        const title = document.querySelector('span') as HTMLElement;
        Object.defineProperty(video, 'getBoundingClientRect', {
            value: () => ({ left: 260, right: 860, top: 120, bottom: 720, width: 600, height: 600 }),
        });
        Object.defineProperty(title, 'innerText', { value: title.textContent ?? '' });
        Object.defineProperty(title, 'getBoundingClientRect', {
            value: () => ({ left: 300, right: 820, top: 740, bottom: 782, width: 520, height: 42 }),
        });

        try {
            expect(readPageCaptionText(video)).toBe('');
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('does not treat fullscreen-adjacent page category and title chips as captions', () => {
        document.body.innerHTML = `
            <video></video>
            <nav class="video-categories"><a href="/tags/ai"><span>AI生成</span></a></nav>
            <h1 class="video-title"><a href="/watch"><span>フルボイス</span></a></h1>
        `;
        const video = document.querySelector('video') as HTMLVideoElement;
        const category = document.querySelector('.video-categories span') as HTMLElement;
        const title = document.querySelector('.video-title span') as HTMLElement;
        Object.defineProperty(video, 'getBoundingClientRect', {
            value: () => ({ left: 0, right: 1024, top: 0, bottom: 768, width: 1024, height: 768 }),
        });
        Object.defineProperty(category, 'innerText', { value: category.textContent ?? '' });
        Object.defineProperty(category, 'getBoundingClientRect', {
            value: () => ({ left: 430, right: 500, top: 214, bottom: 242, width: 70, height: 28 }),
        });
        Object.defineProperty(title, 'innerText', { value: title.textContent ?? '' });
        Object.defineProperty(title, 'getBoundingClientRect', {
            value: () => ({ left: 450, right: 574, top: 642, bottom: 674, width: 124, height: 32 }),
        });

        expect(readPageCaptionText(video)).toBe('');
    });

    it('does not treat a centered page title just below the player as a generic caption', () => {
        document.body.innerHTML = '<video></video><div class="video-title"><span>生成 フルボイス</span></div>';
        const video = document.querySelector('video') as HTMLVideoElement;
        const title = document.querySelector('.video-title span') as HTMLElement;
        Object.defineProperty(video, 'getBoundingClientRect', {
            value: () => ({ left: 100, right: 740, top: 80, bottom: 440, width: 640, height: 360 }),
        });
        Object.defineProperty(title, 'innerText', { value: title.textContent ?? '' });
        Object.defineProperty(title, 'getBoundingClientRect', {
            value: () => ({ left: 280, right: 560, top: 452, bottom: 488, width: 280, height: 36 }),
        });

        expect(readPageCaptionText(video)).toBe('');
    });

    it('does not treat an edge-anchored chat username above a posted video as a page caption', () => {
        // Discord renders a posted clip with the author's handle (which can contain
        // Japanese, e.g. "Canna波蘭") in the message header directly above it. While
        // scrolling past the clip the handle grazes the top edge of the <video>;
        // without geometry guards it latched into the subtitle overlay.
        document.body.innerHTML = '<video></video><div class="message"><h3><span>Canna波蘭</span></h3></div>';
        const video = document.querySelector('video') as HTMLVideoElement;
        const handle = document.querySelector('span') as HTMLElement;
        Object.defineProperty(video, 'getBoundingClientRect', {
            value: () => ({ left: 160, right: 520, top: 120, bottom: 620, width: 360, height: 500 }),
        });
        Object.defineProperty(handle, 'innerText', { value: handle.textContent ?? '' });
        Object.defineProperty(handle, 'getBoundingClientRect', {
            value: () => ({ left: 160, right: 276, top: 92, bottom: 124, width: 116, height: 32 }),
        });

        expect(readPageCaptionText(video)).toBe('');
    });

    it('does not treat an edge-anchored chat username below a posted video as a page caption', () => {
        // The next message's author handle sits just below the clip (within the
        // below-video caption band) and is left-anchored, not centered on the player.
        document.body.innerHTML = '<video></video><div class="message"><h3><span>Canna波蘭</span></h3></div>';
        const video = document.querySelector('video') as HTMLVideoElement;
        const handle = document.querySelector('span') as HTMLElement;
        Object.defineProperty(video, 'getBoundingClientRect', {
            value: () => ({ left: 160, right: 520, top: 120, bottom: 620, width: 360, height: 500 }),
        });
        Object.defineProperty(handle, 'innerText', { value: handle.textContent ?? '' });
        Object.defineProperty(handle, 'getBoundingClientRect', {
            value: () => ({ left: 160, right: 276, top: 648, bottom: 680, width: 116, height: 32 }),
        });

        expect(readPageCaptionText(video)).toBe('');
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

                // The bottom drawer is no longer capped at half the viewport;
                // a full keyboard step applies (only the viewport clamps it).
                expect(panel.style.height).toBe('425px');
                expect(handle.getAttribute('aria-valuenow')).toBe('425');
            } finally {
                controller.destroy();
            }
        });
    });

    it('clears transcript resize state when the pointer drag is cancelled', () => {
        withViewport(640, 820, () => {
            const { controller } = createInstalledSubtitleController({
                subtitleTranscriptPlacement: 'bottom',
            });

            try {
                const internals = controllerInternals<{ openTracksPanel: () => void; transcriptResizeActive: boolean }>(controller);
                internals.openTracksPanel();

                const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                Object.defineProperty(panel, 'getBoundingClientRect', {
                    configurable: true,
                    value: () => new DOMRect(
                        Number.parseFloat(panel.style.left) || 0,
                        Number.parseFloat(panel.style.top) || 443,
                        Number.parseFloat(panel.style.width) || 640,
                        Number.parseFloat(panel.style.height) || 377,
                    ),
                });
                const handle = panel.querySelector<HTMLElement>('[data-resize-transcript]')!;

                handle.dispatchEvent(pointerEvent('pointerdown', { clientY: 640, pointerId: 22 }));
                window.dispatchEvent(pointerEvent('pointermove', { clientY: 520, pointerId: 22 }));

                expect(internals.transcriptResizeActive).toBe(true);
                expect(document.documentElement.classList.contains('jpdb-subtitle-transcript-resizing')).toBe(true);

                window.dispatchEvent(pointerEvent('pointercancel', { clientY: 520, pointerId: 22 }));

                expect(internals.transcriptResizeActive).toBe(false);
                expect(panel.classList.contains('jpdb-subtitle-resizing')).toBe(false);
                expect(document.documentElement.classList.contains('jpdb-subtitle-transcript-resizing')).toBe(false);
                expect(panel.hidden).toBe(false);
            } finally {
                controller.destroy();
            }
        });
    });

    it('settles transcript resize when pointer capture is lost without closing the panel', () => {
        withViewport(1440, 900, () => {
            const { controller } = createInstalledSubtitleController({
                subtitleTranscriptPlacement: 'right',
            });

            try {
                const internals = controllerInternals<{ openTracksPanel: () => void; transcriptResizeActive: boolean }>(controller);
                internals.openTracksPanel();

                const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                Object.defineProperty(panel, 'getBoundingClientRect', {
                    configurable: true,
                    value: () => new DOMRect(
                        Number.parseFloat(panel.style.left) || 970,
                        Number.parseFloat(panel.style.top) || 72,
                        Number.parseFloat(panel.style.width) || 460,
                        Number.parseFloat(panel.style.height) || 818,
                    ),
                });
                const handle = panel.querySelector<HTMLElement>('[data-resize-transcript]')!;

                handle.dispatchEvent(pointerEvent('pointerdown', { clientX: 970, pointerId: 23 }));
                window.dispatchEvent(pointerEvent('pointermove', { clientX: 790, pointerId: 23 }));
                handle.dispatchEvent(new Event('lostpointercapture', { bubbles: true }));

                expect(internals.transcriptResizeActive).toBe(false);
                expect(document.documentElement.classList.contains('jpdb-subtitle-transcript-resizing')).toBe(false);
                expect(panel.hidden).toBe(false);
            } finally {
                controller.destroy();
            }
        });
    });
});
