import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_SETTINGS,
    registerSubtitleControllerCleanup,
    SUBTITLES_YOUTUBE_CSS,
    stubFullscreenElement,
    mockElementRect,
    controllerInternals,
    createInstalledSubtitleController,
    attachVideo,
    openSingleCueTranscript,
    expectFullscreenPanelDisplayOverride,
    handlePointerActivity,
    createSubtitleVideoInsetAdapter,
    subtitleVideoLayoutTarget,
    withViewport,
    SubtitlePlayerController,
} from './fixtures';

describe('SubtitlePlayerController — player layout & video inset', () => {
    registerSubtitleControllerCleanup();

    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    it('anchors the CIJ transcript drawer to the stable player frame instead of the centered video', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://cijapanese.com/video/560') as unknown as Location,
        });

        try {
            withViewport(1600, 900, () => {
                const settings = {
                    ...DEFAULT_SETTINGS,
                    apiKey: '',
                    localDictionariesEnabled: false,
                    subtitleTranscriptVisible: false,
                    subtitleTranscriptPlacement: 'right' as const,
                };
                const controller = new SubtitlePlayerController({
                    getSettings: () => settings,
                    parseJapanese: async () => [],
                    onSettingsChange: () => undefined,
                });

                try {
                    document.body.innerHTML = '<section class="lesson-player"><video></video></section>';
                    const frame = document.querySelector<HTMLElement>('.lesson-player')!;
                    const video = document.querySelector<HTMLVideoElement>('video')!;
                    mockElementRect(frame, new DOMRect(70, 120, 1080, 700));
                    mockElementRect(video, new DOMRect(90, 210, 960, 540));
                    const cue = { start: 0, end: 1, text: '今日は読む。', transcriptEligible: true };
                    const internals = controller as unknown as {
                        install: () => void;
                        video: HTMLVideoElement;
                        cues: Array<typeof cue>;
                        currentCue: typeof cue;
                        openLinesPanel: () => void;
                    };
                    internals.install();
                    internals.video = video;
                    internals.cues = [cue];
                    internals.currentCue = cue;

                    internals.openLinesPanel();

                    const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                    expect(panel.hidden).toBe(false);
                    expect(panel.dataset.transcriptPlacement).toBe('right');
                    expect(panel.style.top).toBe('120px');
                    expect(panel.style.top).not.toBe('210px');
                    expect(frame.style.height).toBe('700px');
                } finally {
                    vi.useRealTimers();
                    controller.destroy();
                }
            });
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('keeps a stable side-panel top when the anchored video scrolls out of view', () => {
        withViewport(1600, 900, () => {
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: '',
                localDictionariesEnabled: false,
                subtitleTranscriptVisible: false,
                subtitleTranscriptPlacement: 'right' as const,
            };
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese: async () => [],
                onSettingsChange: () => undefined,
            });

            try {
                document.body.innerHTML = '<section class="lesson-player"><video controls></video></section>';
                const frame = document.querySelector<HTMLElement>('.lesson-player')!;
                const video = document.querySelector<HTMLVideoElement>('video')!;
                const internals = controller as unknown as {
                    install: () => void;
                    video: HTMLVideoElement;
                    cues: Array<{ start: number; end: number; text: string; transcriptEligible: boolean }>;
                    currentCue: { start: number; end: number; text: string; transcriptEligible: boolean };
                    openLinesPanel: () => void;
                    alignToVideo: () => void;
                };
                internals.install();
                internals.video = video;
                const cue = { start: 0, end: 1, text: '今日は読む。', transcriptEligible: true };
                internals.cues = [cue];
                internals.currentCue = cue;

                // Video visible on-screen: the panel hangs from the video's top.
                mockElementRect(frame, new DOMRect(70, 120, 1080, 600));
                mockElementRect(video, new DOMRect(90, 140, 960, 540));
                internals.openLinesPanel();
                internals.alignToVideo();
                const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                expect(panel.style.top).toBe('120px');

                // Scroll the video far below the fold (out of view). The panel must
                // NOT collapse toward the bottom by chasing the off-screen anchor —
                // it holds a stable on-screen top instead.
                mockElementRect(frame, new DOMRect(70, 1500, 1080, 600));
                mockElementRect(video, new DOMRect(90, 1520, 960, 540));
                internals.alignToVideo();

                expect(document.querySelector<HTMLElement>('.jpdb-subtitle-player')!.classList.contains('jpdb-subtitle-video-out-of-view')).toBe(true);
                expect(panel.hidden).toBe(false);
                // Stable top = the panel margin (10), NOT the collapsed bottom-pinned
                // value (viewportHeight - 280 = 620) the off-screen anchor would force.
                expect(panel.style.top).toBe('10px');
                expect(panel.style.top).not.toBe('620px');
            } finally {
                controller.destroy();
            }
        });
    });

    it('shrinks hosted Yomu video frames when a side transcript panel reserves space', () => {
        withViewport(1180, 760, () => {
            document.body.innerHTML = '<section data-yomu-video-frame><video controls></video></section>';
            const { controller } = createInstalledSubtitleController({
                subtitleTranscriptVisible: false,
                subtitleTranscriptPlacement: 'right',
            });
            try {
                const frame = document.querySelector<HTMLElement>('[data-yomu-video-frame]')!;
                const video = document.querySelector<HTMLVideoElement>('video')!;
                mockElementRect(frame, new DOMRect(70, 86, 1040, 585));
                mockElementRect(video, new DOMRect(70, 86, 1040, 585));
                attachVideo(controller, { video });
                const cue = { start: 0, end: 1, text: '今日は読む。', transcriptEligible: true };
                const internals = controllerInternals<{
                    cues: Array<typeof cue>;
                    currentCue: typeof cue;
                    openLinesPanel: () => void;
                }>(controller);
                internals.cues = [cue];
                internals.currentCue = cue;

                internals.openLinesPanel();

                const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                expect(panel.hidden).toBe(false);
                expect(panel.dataset.transcriptPlacement).toBe('right');
                expect(panel.style.left).toBe('792px');
                expect(panel.style.width).toBe('378px');
                expect(document.documentElement.style.getPropertyValue('--jpdb-subtitle-video-inset')).toBe('388px');
                expect(frame.style.width).toBe('712px');
                expect(frame.style.maxWidth).toBe('712px');
                expect(frame.style.height).toBe('585px');
                expect(frame.style.marginRight).toBe('318px');
                expect(video.style.width).toBe('');
                expect(video.style.height).toBe('585px');
                expect(document.documentElement.classList.contains('jpdb-subtitle-video-inset-right')).toBe(true);
                expect(document.documentElement.classList.contains('jpdb-subtitle-youtube-stable-side')).toBe(false);
            } finally {
                controller.destroy();
            }
        });
    });

    it('never stretches a bounded hosted video frame past its natural width when docking left', () => {
        // Repro of the homepage demo bug: the video card is a bounded embed
        // (max-width, right-aligned in a grid column). Docking the panel LEFT used
        // to set the frame width to the whole leftover viewport width, blowing up
        // the 16/9 player height so the card's overflow:hidden cropped it.
        withViewport(1600, 900, () => {
            document.body.innerHTML = '<section data-yomu-video-frame><video controls></video></section>';
            const { controller } = createInstalledSubtitleController({
                subtitleTranscriptVisible: false,
                subtitleTranscriptPlacement: 'left',
            });
            try {
                const frame = document.querySelector<HTMLElement>('[data-yomu-video-frame]')!;
                const video = document.querySelector<HTMLVideoElement>('video')!;
                // A ~600px card pinned to the right of a wide viewport.
                const cardRect = new DOMRect(940, 120, 600, 338);
                mockElementRect(frame, cardRect);
                mockElementRect(video, cardRect);
                attachVideo(controller, { video });
                const cue = { start: 0, end: 1, text: '今日は読む。', transcriptEligible: true };
                const internals = controllerInternals<{
                    cues: Array<typeof cue>;
                    currentCue: typeof cue;
                    openLinesPanel: () => void;
                }>(controller);
                internals.cues = [cue];
                internals.currentCue = cue;

                internals.openLinesPanel();

                const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                expect(panel.hidden).toBe(false);
                expect(panel.dataset.transcriptPlacement).toBe('left');
                // The frame width is clamped to its natural (base) width — never
                // grown to the leftover column width — so the aspect-ratio'd player
                // keeps its height and is not cropped.
                const frameWidth = Number.parseFloat(frame.style.width);
                expect(frameWidth).toBeGreaterThan(0);
                expect(frameWidth).toBeLessThanOrEqual(600);
                expect(frame.style.maxWidth).toBe(frame.style.width);
                // Base height preserved (not exploded by an oversized width).
                expect(frame.style.height).toBe('338px');
                expect(document.documentElement.classList.contains('jpdb-subtitle-video-inset-left')).toBe(true);
            } finally {
                controller.destroy();
            }
        });
    });

    it('keeps the native YouTube Shorts player size when a side transcript panel opens', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/shorts/pmwJS6wU8Co') as unknown as Location,
        });
        try {
            withViewport(1440, 900, () => {
                document.body.innerHTML = `
                    <ytd-shorts>
                        <ytd-reel-video-renderer>
                            <div id="movie_player" class="html5-video-player"><video class="html5-main-video" controls></video></div>
                        </ytd-reel-video-renderer>
                    </ytd-shorts>
                `;
                const { controller } = createInstalledSubtitleController({
                    subtitleTranscriptVisible: false,
                    subtitleTranscriptPlacement: 'left',
                });
                try {
                    const movie = document.querySelector<HTMLElement>('#movie_player')!;
                    const reel = document.querySelector<HTMLElement>('ytd-reel-video-renderer')!;
                    const video = document.querySelector<HTMLVideoElement>('video')!;
                    mockElementRect(movie, new DOMRect(540, 60, 440, 780));
                    mockElementRect(reel, new DOMRect(540, 60, 440, 780));
                    mockElementRect(video, new DOMRect(540, 60, 440, 780));
                    attachVideo(controller, { video });
                    const cue = { start: 0, end: 1, text: '今日は読む。', transcriptEligible: true };
                    const internals = controllerInternals<{
                        cues: Array<typeof cue>;
                        currentCue: typeof cue;
                        openLinesPanel: () => void;
                    }>(controller);
                    internals.cues = [cue];
                    internals.currentCue = cue;

                    internals.openLinesPanel();

                    const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                    expect(panel.hidden).toBe(false);
                    expect(document.documentElement.classList.contains('jpdb-subtitle-youtube-stable-side')).toBe(false);
                    expect(document.documentElement.style.getPropertyValue('--jpdb-subtitle-youtube-stable-player-width')).toBe('');
                    expect(movie.style.width).toBe('');
                    expect(movie.style.height).toBe('');
                    expect(video.style.width).toBe('');
                    expect(video.style.height).toBe('');
                } finally {
                    controller.destroy();
                }
            });
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('uses free YouTube side space initially while allowing the panel to resize wider', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=stable123') as unknown as Location,
        });
        try {
            withViewport(1440, 900, () => {
                document.body.innerHTML = `
                    <ytd-watch-flexy>
                        <div id="columns">
                            <div id="primary">
                                <div id="movie_player" class="html5-video-player"><video class="html5-main-video" controls></video></div>
                            </div>
                            <div id="secondary"></div>
                        </div>
                    </ytd-watch-flexy>
                `;
                const { controller } = createInstalledSubtitleController({
                    subtitleTranscriptVisible: false,
                    subtitleTranscriptPlacement: 'right',
                });
                try {
                    const movie = document.querySelector<HTMLElement>('#movie_player')!;
                    const primary = document.querySelector<HTMLElement>('#primary')!;
                    const video = document.querySelector<HTMLVideoElement>('video')!;
                    mockElementRect(movie, new DOMRect(24, 72, 970, 546));
                    mockElementRect(primary, new DOMRect(24, 72, 970, 820));
                    mockElementRect(video, new DOMRect(24, 72, 970, 546));
                    attachVideo(controller, { video });
                    const cue = { start: 0, end: 1, text: '今日は読む。', transcriptEligible: true };
                    const internals = controllerInternals<{
                        cues: Array<typeof cue>;
                        currentCue: typeof cue;
                        openLinesPanel: () => void;
                    }>(controller);
                    internals.cues = [cue];
                    internals.currentCue = cue;

                    internals.openLinesPanel();

                    const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                    expect(panel.dataset.transcriptPlacement).toBe('right');
                    expect(Number.parseInt(panel.style.left, 10)).toBeGreaterThanOrEqual(1004);
                    expect(Number.parseInt(panel.style.left, 10) + Number.parseInt(panel.style.width, 10)).toBe(1440);
                    expect(Number.parseInt(panel.style.width, 10)).toBeLessThanOrEqual(436);
                    expect(Number.parseInt(panel.style.left, 10) - Math.round(movie.getBoundingClientRect().right)).toBe(10);
                    const resizeHandle = panel.querySelector<HTMLElement>('[data-resize-transcript]')!;
                    expect(resizeHandle.getAttribute('aria-valuemax')).toBe('891');
                    expect(resizeHandle.getAttribute('aria-valuenow')).toBe(String(Number.parseInt(panel.style.width, 10)));
                    expect(document.documentElement.classList.contains('jpdb-subtitle-youtube-stable-right')).toBe(true);
                    expect(document.documentElement.style.getPropertyValue('--jpdb-subtitle-youtube-stable-player-width')).toBe('970px');
                    expect(document.documentElement.style.getPropertyValue('--jpdb-subtitle-youtube-stable-player-height')).toBe('546px');
                    expect(movie.style.width).toBe('970px');
                    expect(movie.style.height).toBe('546px');
                    expect(movie.style.getPropertyPriority('width')).toBe('important');
                    expect(video.style.width).toBe('970px');
                    expect(video.style.height).toBe('546px');
                    expect(movie.style.maxWidth).toBe('970px');
                    expect(primary.style.width).toBe('');
                    expect(primary.style.marginLeft).toBe('');
                    expect(document.documentElement.className).not.toContain('jpdb-subtitle-video-inset');
                } finally {
                    controller.destroy();
                }
            });
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('grows a YouTube side transcript past current free space by shrinking the stable player width', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=stable-resize') as unknown as Location,
        });
        try {
            withViewport(1440, 900, () => {
                document.body.innerHTML = `
                    <ytd-watch-flexy>
                        <div id="columns">
                            <div id="primary">
                                <div id="movie_player" class="html5-video-player"><video class="html5-main-video" controls></video></div>
                            </div>
                            <div id="secondary"></div>
                        </div>
                    </ytd-watch-flexy>
                `;
                const { controller } = createInstalledSubtitleController({
                    subtitleTranscriptVisible: false,
                    subtitleTranscriptPlacement: 'right',
                });
                try {
                    const movie = document.querySelector<HTMLElement>('#movie_player') as HTMLElement & { setSize?: ReturnType<typeof vi.fn> };
                    const primary = document.querySelector<HTMLElement>('#primary')!;
                    const video = document.querySelector<HTMLVideoElement>('video')!;
                    movie.setSize = vi.fn();
                    mockElementRect(movie, new DOMRect(24, 72, 970, 546));
                    mockElementRect(primary, new DOMRect(24, 72, 970, 820));
                    mockElementRect(video, new DOMRect(24, 72, 970, 546));
                    attachVideo(controller, { video });
                    const cue = { start: 0, end: 1, text: '今日は読む。', transcriptEligible: true };
                    const internals = controllerInternals<{
                        cues: Array<typeof cue>;
                        currentCue: typeof cue;
                        openLinesPanel: () => void;
                    }>(controller);
                    internals.cues = [cue];
                    internals.currentCue = cue;
                    vi.useFakeTimers();

                    internals.openLinesPanel();
                    vi.advanceTimersByTime(90);

                    const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                    const handle = panel.querySelector<HTMLElement>('[data-resize-transcript]')!;
                    mockElementRect(panel, new DOMRect(
                        Number.parseInt(panel.style.left, 10),
                        Number.parseInt(panel.style.top, 10),
                        Number.parseInt(panel.style.width, 10),
                        Number.parseInt(panel.style.height, 10),
                    ));
                    expect(movie.setSize).toHaveBeenCalledWith(970, 546);
                    expect(video.style.width).toBe('970px');
                    expect(video.style.height).toBe('546px');
                    const callsBeforeResizeSettled = movie.setSize.mock.calls.length;

                    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

                    expect(panel.dataset.transcriptPlacement).toBe('right');
                    expect(panel.style.width).toBe('484px');
                    expect(panel.style.left).toBe('956px');
                    expect(handle.getAttribute('aria-valuenow')).toBe('484');
                    expect(handle.getAttribute('aria-valuemax')).toBe('891');
                    expect(video.style.width).toBe('922px');
                    expect(video.style.height).toBe('519px');
                    vi.advanceTimersByTime(90);

                    expect(document.documentElement.classList.contains('jpdb-subtitle-youtube-stable-right')).toBe(true);
                    expect(document.documentElement.style.getPropertyValue('--jpdb-subtitle-youtube-stable-player-width')).toBe('922px');
                    expect(document.documentElement.style.getPropertyValue('--jpdb-subtitle-youtube-stable-player-height')).toBe('519px');
                    expect(document.documentElement.className).not.toContain('jpdb-subtitle-video-inset');
                    expect(movie.setSize).toHaveBeenCalledTimes(callsBeforeResizeSettled + 1);
                    expect(movie.setSize).toHaveBeenLastCalledWith(922, 519);
                    vi.useRealTimers();
                } finally {
                    vi.useRealTimers();
                    controller.destroy();
                }
            });
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('resizes the YouTube video element immediately when the private player API is unavailable', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=stable-resize-no-api') as unknown as Location,
        });
        try {
            withViewport(1440, 900, () => {
                document.body.innerHTML = `
                    <ytd-watch-flexy>
                        <div id="columns">
                            <div id="primary">
                                <div id="movie_player" class="html5-video-player">
                                    <div class="html5-video-container">
                                        <video class="html5-main-video" controls style="width:970px;height:546px;object-fit:cover"></video>
                                    </div>
                                </div>
                            </div>
                            <div id="secondary"></div>
                        </div>
                    </ytd-watch-flexy>
                `;
                const { controller } = createInstalledSubtitleController({
                    subtitleTranscriptVisible: false,
                    subtitleTranscriptPlacement: 'right',
                });
                try {
                    const movie = document.querySelector<HTMLElement>('#movie_player')!;
                    const videoContainer = document.querySelector<HTMLElement>('.html5-video-container')!;
                    const video = document.querySelector<HTMLVideoElement>('video')!;
                    mockElementRect(movie, new DOMRect(24, 72, 970, 546));
                    mockElementRect(document.querySelector<HTMLElement>('#primary')!, new DOMRect(24, 72, 970, 820));
                    mockElementRect(video, new DOMRect(24, 72, 970, 546));
                    attachVideo(controller, { video });
                    const cue = { start: 0, end: 1, text: '今日は読む。', transcriptEligible: true };
                    const internals = controllerInternals<{
                        cues: Array<typeof cue>;
                        currentCue: typeof cue;
                        openLinesPanel: () => void;
                    }>(controller);
                    internals.cues = [cue];
                    internals.currentCue = cue;

                    internals.openLinesPanel();

                    const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                    const handle = panel.querySelector<HTMLElement>('[data-resize-transcript]')!;
                    mockElementRect(panel, new DOMRect(
                        Number.parseInt(panel.style.left, 10),
                        Number.parseInt(panel.style.top, 10),
                        Number.parseInt(panel.style.width, 10),
                        Number.parseInt(panel.style.height, 10),
                    ));

                    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

                    expect(document.documentElement.style.getPropertyValue('--jpdb-subtitle-youtube-stable-player-width')).toBe('922px');
                    expect(document.documentElement.style.getPropertyValue('--jpdb-subtitle-youtube-stable-player-height')).toBe('519px');
                    expect(movie.style.width).toBe('922px');
                    expect(movie.style.height).toBe('519px');
                    expect(videoContainer.style.width).toBe('922px');
                    expect(videoContainer.style.height).toBe('519px');
                    expect(video.style.width).toBe('922px');
                    expect(video.style.height).toBe('519px');
                    expect(video.style.objectFit).toBe('contain');
                } finally {
                    controller.destroy();
                }
            });
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('keeps YouTube left transcript placement on the left by reserving stable page space', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=stable-left') as unknown as Location,
        });
        try {
            withViewport(1440, 900, () => {
                document.body.innerHTML = `
                    <ytd-watch-flexy>
                        <div id="columns">
                            <div id="primary">
                                <div id="movie_player" class="html5-video-player"><video class="html5-main-video" controls></video></div>
                            </div>
                            <div id="secondary"></div>
                        </div>
                    </ytd-watch-flexy>
                `;
                const { controller } = createInstalledSubtitleController({
                    subtitleTranscriptVisible: false,
                    subtitleTranscriptPlacement: 'left',
                });
                try {
                    const movie = document.querySelector<HTMLElement>('#movie_player') as HTMLElement & { setSize?: ReturnType<typeof vi.fn> };
                    const primary = document.querySelector<HTMLElement>('#primary')!;
                    const video = document.querySelector<HTMLVideoElement>('video')!;
                    movie.setSize = vi.fn();
                    mockElementRect(movie, new DOMRect(16, 68, 996, 560));
                    mockElementRect(primary, new DOMRect(16, 68, 996, 820));
                    mockElementRect(video, new DOMRect(16, 68, 996, 560));
                    attachVideo(controller, { video });
                    const cue = { start: 0, end: 1, text: '左側でも読む。', transcriptEligible: true };
                    const internals = controllerInternals<{
                        cues: Array<typeof cue>;
                        currentCue: typeof cue;
                        openLinesPanel: () => void;
                    }>(controller);
                    internals.cues = [cue];
                    internals.currentCue = cue;
                    vi.useFakeTimers();

                    internals.openLinesPanel();
                    vi.advanceTimersByTime(90);

                    const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                    expect(panel.dataset.transcriptPlacement).toBe('left');
                    expect(Number.parseInt(panel.style.left, 10)).toBe(0);
                    expect(Number.parseInt(panel.style.width, 10)).toBeGreaterThanOrEqual(300);
                    expect(Number.parseInt(panel.style.width, 10)).toBe(460);
                    expect(document.documentElement.classList.contains('jpdb-subtitle-youtube-stable-left')).toBe(true);
                    expect(document.documentElement.style.getPropertyValue('--jpdb-subtitle-youtube-stable-offset')).toBe('470px');
                    expect(document.documentElement.style.getPropertyValue('--jpdb-subtitle-youtube-stable-player-width')).toBe('960px');
                    expect(document.documentElement.style.getPropertyValue('--jpdb-subtitle-youtube-stable-player-height')).toBe('540px');
                    expect(movie.setSize).toHaveBeenCalledWith(960, 540);
                    expect(video.style.width).toBe('960px');
                    expect(video.style.height).toBe('540px');
                    expect(movie.style.width).toBe('960px');
                    expect(primary.style.width).toBe('');
                    expect(primary.style.marginLeft).toBe('');
                    expect(document.documentElement.className).not.toContain('jpdb-subtitle-video-inset');
                } finally {
                    controller.destroy();
                }
            });
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('keeps live YouTube left stable layout aligned when the real player is narrower than the reserved primary column', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=stable-left-live') as unknown as Location,
        });
        try {
            withViewport(1440, 900, () => {
                document.body.innerHTML = `
                    <ytd-watch-flexy>
                        <div id="columns">
                            <div id="primary">
                                <div id="movie_player" class="html5-video-player"><video class="html5-main-video" controls></video></div>
                            </div>
                            <div id="secondary"></div>
                        </div>
                    </ytd-watch-flexy>
                `;
                const { controller } = createInstalledSubtitleController({
                    subtitleTranscriptVisible: false,
                    subtitleTranscriptPlacement: 'left',
                });
                try {
                    const movie = document.querySelector<HTMLElement>('#movie_player') as HTMLElement & { setSize?: ReturnType<typeof vi.fn> };
                    const primary = document.querySelector<HTMLElement>('#primary')!;
                    const video = document.querySelector<HTMLVideoElement>('video')!;
                    const baseRect = new DOMRect(16, 68, 996, 560);
                    Object.defineProperty(movie, 'getBoundingClientRect', {
                        configurable: true,
                        value: () => {
                            const root = document.documentElement;
                            if (!root.classList.contains('jpdb-subtitle-youtube-stable-left')) return baseRect;
                            const offset = Number.parseFloat(root.style.getPropertyValue('--jpdb-subtitle-youtube-stable-offset')) || 0;
                            const width = Number.parseFloat(root.style.getPropertyValue('--jpdb-subtitle-youtube-stable-player-width')) || 960;
                            return new DOMRect(offset, 68, width, Math.round(width * baseRect.height / baseRect.width));
                        },
                    });
                    movie.setSize = vi.fn();
                    mockElementRect(primary, new DOMRect(16, 68, 996, 820));
                    mockElementRect(video, baseRect);
                    attachVideo(controller, { video });
                    const cue = { start: 0, end: 1, text: '左側でも読む。', transcriptEligible: true };
                    const internals = controllerInternals<{
                        cues: Array<typeof cue>;
                        currentCue: typeof cue;
                        openLinesPanel: () => void;
                    }>(controller);
                    internals.cues = [cue];
                    internals.currentCue = cue;
                    vi.useFakeTimers();

                    internals.openLinesPanel();
                    vi.advanceTimersByTime(90);

                    const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                    expect(panel.dataset.transcriptPlacement).toBe('left');
                    expect(panel.style.width).toBe('460px');
                    expect(document.documentElement.style.getPropertyValue('--jpdb-subtitle-youtube-stable-offset')).toBe('470px');
                    expect(document.documentElement.style.getPropertyValue('--jpdb-subtitle-youtube-stable-player-width')).toBe('960px');
                    expect(document.documentElement.style.getPropertyValue('--jpdb-subtitle-youtube-stable-player-height')).toBe('540px');
                    expect(movie.getBoundingClientRect().left - (Number.parseInt(panel.style.left, 10) + Number.parseInt(panel.style.width, 10))).toBe(10);
                    expect(movie.setSize).not.toHaveBeenCalled();
                    expect(movie.style.width).toBe('960px');
                    expect(movie.style.height).toBe('540px');
                    expect(video.style.width).toBe('960px');
                    expect(video.style.height).toBe('540px');
                    vi.useRealTimers();
                } finally {
                    vi.useRealTimers();
                    controller.destroy();
                }
            });
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('moves the early YouTube player directly when the watch primary column is not mounted yet', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=stable-left-player-fallback') as unknown as Location,
        });
        try {
            withViewport(1440, 900, () => {
                document.body.innerHTML = `
                    <ytd-watch-flexy>
                        <div id="player">
                            <div id="movie_player" class="html5-video-player"><video class="html5-main-video" controls></video></div>
                        </div>
                    </ytd-watch-flexy>
                `;
                const { controller } = createInstalledSubtitleController({
                    subtitleTranscriptVisible: false,
                    subtitleTranscriptPlacement: 'left',
                });
                try {
                    const movie = document.querySelector<HTMLElement>('#movie_player')!;
                    const video = document.querySelector<HTMLVideoElement>('video')!;
                    mockElementRect(movie, new DOMRect(24, 80, 996, 560));
                    mockElementRect(video, new DOMRect(24, 80, 996, 560));
                    attachVideo(controller, { video });
                    const cue = { start: 0, end: 1, text: '左側でも読む。', transcriptEligible: true };
                    const internals = controllerInternals<{
                        cues: Array<typeof cue>;
                        currentCue: typeof cue;
                        openLinesPanel: () => void;
                    }>(controller);
                    internals.cues = [cue];
                    internals.currentCue = cue;
                    vi.useFakeTimers();

                    internals.openLinesPanel();
                    vi.advanceTimersByTime(90);

                    expect(document.documentElement.classList.contains('jpdb-subtitle-youtube-stable-left')).toBe(true);
                    expect(document.documentElement.classList.contains('jpdb-subtitle-youtube-stable-player-fallback')).toBe(true);
                    expect(document.documentElement.style.getPropertyValue('--jpdb-subtitle-youtube-stable-offset')).toBe('470px');
                    expect(SUBTITLES_YOUTUBE_CSS.replace(/\s+/g, ' '))
                        .toContain('html.jpdb-subtitle-youtube-stable-left.jpdb-subtitle-youtube-stable-player-fallback #movie_player, html.jpdb-subtitle-youtube-stable-left.jpdb-subtitle-youtube-stable-player-fallback .html5-video-player { margin-left: var(--jpdb-subtitle-youtube-stable-offset, 0px) !important; }');
                } finally {
                    vi.useRealTimers();
                    controller.destroy();
                }
            });
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('hides YouTube subtitles when scrolling leaves the player out of meaningful view', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=scroll-anchor') as unknown as Location,
        });
        try {
            withViewport(1440, 900, () => {
                document.body.innerHTML = `
                    <ytd-watch-flexy>
                        <div id="columns">
                            <div id="primary">
                                <div id="movie_player" class="html5-video-player"><video class="html5-main-video" controls></video></div>
                            </div>
                        </div>
                    </ytd-watch-flexy>
                `;
                const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
                try {
                    let playerRect = new DOMRect(24, 72, 970, 546);
                    const movie = document.querySelector<HTMLElement>('#movie_player')!;
                    const video = document.querySelector<HTMLVideoElement>('video')!;
                    Object.defineProperty(movie, 'getBoundingClientRect', { configurable: true, value: () => playerRect });
                    Object.defineProperty(video, 'getBoundingClientRect', { configurable: true, value: () => playerRect });
                    attachVideo(controller, { video });
                    const internals = controllerInternals<{ alignToVideo: () => void }>(controller);
                    const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;

                    internals.alignToVideo();
                    expect(root.classList.contains('jpdb-subtitle-video-out-of-view')).toBe(false);

                    playerRect = new DOMRect(24, -500, 970, 546);
                    internals.alignToVideo();

                    expect(root.classList.contains('jpdb-subtitle-video-out-of-view')).toBe(true);
                } finally {
                    controller.destroy();
                }
            });
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('anchors the subtitle overlay and pointer activity to the player frame instead of the centered video', () => {
        withViewport(1400, 900, () => {
            const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
            try {
                document.body.insertAdjacentHTML('beforeend', `
                    <section class="video-card">
                        <video></video>
                        <button class="player-control" type="button">Play</button>
                    </section>
                `);
                const frame = document.querySelector<HTMLElement>('.video-card')!;
                const video = document.querySelector<HTMLVideoElement>('.video-card video')!;
                video.controls = false;
                mockElementRect(frame, new DOMRect(168, 140, 980, 620));
                mockElementRect(video, new DOMRect(318, 210, 680, 382));
                attachVideo(controller, { video });
                const internals = controllerInternals<{ alignToVideo: () => void }>(controller);

                controller.refresh();
                internals.alignToVideo();

                const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
                expect(root.classList.contains('jpdb-subtitle-video-out-of-view')).toBe(false);
                expect(root.style.left).toBe('168px');
                expect(root.style.top).toBe('140px');
                expect(root.style.width).toBe('980px');
                expect(root.style.height).toBe('620px');

                controllerInternals<{ hideControlsImmediately: () => void }>(controller).hideControlsImmediately();
                expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);

                handlePointerActivity(controller, { clientX: 188, clientY: 160 });
                expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(false);

                controllerInternals<{ hideControlsImmediately: () => void }>(controller).hideControlsImmediately();
                handlePointerActivity(controller, { clientX: 40, clientY: 40 });
                expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);
            } finally {
                controller.destroy();
            }
        });
    });

    it('does not climb past an explicit video frame when positioning homepage subtitles', () => {
        withViewport(1180, 900, () => {
            const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
            try {
                document.body.insertAdjacentHTML('beforeend', `
                    <section class="homepage-demo-row">
                        <div class="homepage-demo-copy">Video copy</div>
                        <div class="homepage-demo-player" data-yomu-video-frame>
                            <video controls></video>
                        </div>
                    </section>
                `);
                const row = document.querySelector<HTMLElement>('.homepage-demo-row')!;
                const frame = document.querySelector<HTMLElement>('[data-yomu-video-frame]')!;
                const video = document.querySelector<HTMLVideoElement>('[data-yomu-video-frame] video')!;
                mockElementRect(row, new DOMRect(64, 284, 1052, 330));
                mockElementRect(frame, new DOMRect(542, 284, 574, 330));
                mockElementRect(video, new DOMRect(551, 293, 556, 312));
                attachVideo(controller, { video });
                const internals = controllerInternals<{ alignToVideo: () => void }>(controller);

                controller.refresh();
                internals.alignToVideo();

                const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
                expect(subtitleVideoLayoutTarget(video)).toBe(frame);
                expect(root.style.left).toBe('542px');
                expect(root.style.top).toBe('284px');
                expect(root.style.width).toBe('574px');
                expect(root.style.height).toBe('330px');
                expect(root.style.left).not.toBe('64px');
                expect(row.getBoundingClientRect().width).toBeGreaterThan(frame.getBoundingClientRect().width);
            } finally {
                controller.destroy();
            }
        });
    });

    it('mounts the subtitle overlay inside the active fullscreen player frame', () => {
        withViewport(1280, 720, () => {
            const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
            const fullscreen = stubFullscreenElement(null);
            try {
                document.body.insertAdjacentHTML('beforeend', `
                    <section class="video-card">
                        <video></video>
                        <button class="player-control" type="button">Play</button>
                    </section>
                `);
                const frame = document.querySelector<HTMLElement>('.video-card')!;
                const video = document.querySelector<HTMLVideoElement>('.video-card video')!;
                video.controls = false;
                mockElementRect(frame, new DOMRect(0, 0, 1280, 720));
                mockElementRect(video, new DOMRect(140, 60, 1000, 562));
                attachVideo(controller, { video });
                const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
                const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                const internals = controllerInternals<{
                    alignToVideo: () => void;
                    syncFullscreenState: () => void;
                }>(controller);

                fullscreen.set(frame);
                internals.syncFullscreenState();
                openSingleCueTranscript(controller);
                internals.alignToVideo();

                expect(root.parentElement).toBe(frame);
                expect(panel.parentElement).toBe(frame);
                expectFullscreenPanelDisplayOverride(panel);
                expect(document.documentElement.classList.contains('jpdb-subtitle-fullscreen')).toBe(true);
                expect(root.classList.contains('jpdb-subtitle-fullscreen')).toBe(true);
                expect(root.classList.contains('jpdb-subtitle-video-out-of-view')).toBe(false);
                expect(root.style.left).toBe('0px');
                expect(root.style.top).toBe('0px');
                expect(root.style.width).toBe('1280px');
                expect(root.style.height).toBe('720px');
                expect(panel.style.top).toBe('10px');
                expect(frame.style.width).toBe('');

                fullscreen.set(null);
                internals.syncFullscreenState();

                expect(root.parentElement).toBe(document.body);
                expect(panel.parentElement).toBe(document.body);
                expect(panel.classList.contains('jpdb-subtitle-fullscreen')).toBe(false);
                expect(panel.style.getPropertyPriority('display')).toBe('');
                expect(document.documentElement.classList.contains('jpdb-subtitle-fullscreen')).toBe(false);
                expect(root.classList.contains('jpdb-subtitle-fullscreen')).toBe(false);
            } finally {
                fullscreen.restore();
                controller.destroy();
            }
        });
    });

    it('uses a visible YouTube fullscreen host for geometry without entering its focus subtree before video binding', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=fullscreen-race') as unknown as Location,
        });
        try {
            withViewport(1280, 720, () => {
                const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
                try {
                    document.body.insertAdjacentHTML('beforeend', `
                        <div id="movie_player" class="html5-video-player ytp-fullscreen fullscreen">
                            <div class="html5-video-container"><video class="html5-main-video"></video></div>
                            <button class="ytp-play-button" type="button">Play</button>
                        </div>
                    `);
                    const player = document.getElementById('movie_player')!;
                    const video = player.querySelector<HTMLVideoElement>('video')!;
                    mockElementRect(player, new DOMRect(0, 0, 1280, 720));
                    mockElementRect(video, new DOMRect(0, 0, 1280, 720));
                    const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
                    const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                    const internals = controllerInternals<{ syncFullscreenState: () => void }>(controller);

                    internals.syncFullscreenState();

                    expect(root.parentElement).toBe(document.body);
                    expect(panel.parentElement).toBe(document.body);
                    expect(player.contains(root)).toBe(false);
                    expect(player.contains(panel)).toBe(false);
                    expect(document.documentElement.classList.contains('jpdb-subtitle-fullscreen')).toBe(true);
                    expect(root.classList.contains('jpdb-subtitle-fullscreen')).toBe(true);

                    player.classList.remove('ytp-fullscreen', 'fullscreen');
                    internals.syncFullscreenState();

                    expect(root.parentElement).toBe(document.body);
                    expect(panel.parentElement).toBe(document.body);
                } finally {
                    controller.destroy();
                }
            });
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('keeps the overlay visible when the document root is the fullscreen element', () => {
        // YouTube's desktop fullscreen promotes <html> to the top layer. Its
        // layout box collapses to a zero-size rect, which previously made the
        // visibility check read the video as off-screen and hide the overlay.
        withViewport(1280, 720, () => {
            const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
            const fullscreen = stubFullscreenElement(null);
            try {
                document.body.insertAdjacentHTML('beforeend', `
                    <section class="video-card">
                        <video></video>
                        <button class="player-control" type="button">Play</button>
                    </section>
                `);
                const video = document.querySelector<HTMLVideoElement>('.video-card video')!;
                video.controls = false;
                mockElementRect(video, new DOMRect(140, 60, 1000, 562));
                // jsdom's default getBoundingClientRect() already reports a 0x0
                // box for <html>, matching the real fullscreen top-layer collapse.
                attachVideo(controller, { video });
                const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
                const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                const internals = controllerInternals<{
                    alignToVideo: () => void;
                    syncFullscreenState: () => void;
                }>(controller);

                fullscreen.set(document.documentElement);
                internals.syncFullscreenState();
                openSingleCueTranscript(controller);
                internals.alignToVideo();

                // The overlay already renders inside the fullscreen <html> via
                // <body>, so it stays in <body> rather than being appended to <html>.
                expect(root.parentElement).toBe(document.body);
                expect(panel.parentElement).toBe(document.body);
                expectFullscreenPanelDisplayOverride(panel);
                expect(root.classList.contains('jpdb-subtitle-fullscreen')).toBe(true);
                expect(root.classList.contains('jpdb-subtitle-video-out-of-view')).toBe(false);
                expect(root.style.left).toBe('0px');
                expect(root.style.top).toBe('0px');
                expect(root.style.width).toBe('1280px');
                expect(root.style.height).toBe('720px');
            } finally {
                fullscreen.restore();
                controller.destroy();
            }
        });
    });

    it('hides YouTube subtitles and controls when the player has scrolled into comments', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=scrolled-comments') as unknown as Location,
        });
        try {
            withViewport(1280, 720, () => {
                const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
                try {
                    document.body.insertAdjacentHTML('beforeend', `
                        <div id="movie_player" class="html5-video-player">
                            <video class="html5-main-video" controls></video>
                        </div>
                    `);
                    const player = document.getElementById('movie_player')!;
                    const video = player.querySelector<HTMLVideoElement>('video')!;
                    mockElementRect(player, new DOMRect(0, 820, 1280, 720));
                    mockElementRect(video, new DOMRect(0, 820, 1280, 720));
                    attachVideo(controller, { video });
                    const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
                    const internals = controllerInternals<{ alignToVideo: () => void }>(controller);

                    internals.alignToVideo();

                    expect(root.classList.contains('jpdb-subtitle-video-out-of-view')).toBe(true);
                    expect(root.classList.contains('jpdb-subtitle-has-video-frame')).toBe(false);

                    mockElementRect(player, new DOMRect(0, 0, 1280, 720));
                    mockElementRect(video, new DOMRect(0, 0, 1280, 720));
                    internals.alignToVideo();

                    expect(root.classList.contains('jpdb-subtitle-video-out-of-view')).toBe(false);
                    expect(root.classList.contains('jpdb-subtitle-has-video-frame')).toBe(true);
                } finally {
                    controller.destroy();
                }
            });
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('does not throw if fullscreen state sync runs before document.body exists', () => {
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        const fullscreen = stubFullscreenElement(null);
        const body = document.body;
        const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
        const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
        const internals = controllerInternals<{ syncFullscreenState: () => void }>(controller);

        try {
            document.documentElement.removeChild(body);
            fullscreen.set(document.documentElement);

            expect(() => internals.syncFullscreenState()).not.toThrow();
            expect(root.parentElement).toBe(document.documentElement);
            expect(panel.parentElement).toBe(document.documentElement);
        } finally {
            if (!document.body) document.documentElement.appendChild(body);
            fullscreen.restore();
            controller.destroy();
        }
    });

    it('does not throw when clearing YouTube stable layout before document.documentElement exists', () => {
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        const rootSpy = vi.spyOn(document, 'documentElement', 'get').mockReturnValue(null as unknown as HTMLElement);
        const internals = controllerInternals<{ clearStableYouTubeTranscriptLayout: () => boolean }>(controller);

        try {
            expect(internals.clearStableYouTubeTranscriptLayout()).toBe(false);
        } finally {
            rootSpy.mockRestore();
            controller.destroy();
        }
    });

    it('does not mount the subtitle overlay inside a fullscreen video element', () => {
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        const fullscreen = stubFullscreenElement(null);
        try {
            const video = document.createElement('video');
            document.body.append(video);
            attachVideo(controller, { video, rect: new DOMRect(0, 0, 640, 360) });
            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            const internals = controllerInternals<{ syncFullscreenState: () => void }>(controller);

            fullscreen.set(video);
            internals.syncFullscreenState();
            openSingleCueTranscript(controller, '動画要素の字幕。');

            expect(root.parentElement).toBe(document.body);
            expect(panel.parentElement).toBe(document.body);
            expectFullscreenPanelDisplayOverride(panel);
            expect(document.documentElement.classList.contains('jpdb-subtitle-fullscreen')).toBe(true);
            expect(root.classList.contains('jpdb-subtitle-fullscreen')).toBe(true);
        } finally {
            fullscreen.restore();
            controller.destroy();
        }
    });

    it('keeps the subtitle overlay body-owned in YouTube CSS fullscreen on iPad-sized viewports', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=fullscreen123') as unknown as Location,
        });

        try {
            withViewport(1024, 768, () => {
                const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
                const fullscreen = stubFullscreenElement(null);
                try {
                    document.body.insertAdjacentHTML('beforeend', `
                        <ytd-watch-flexy fullscreen>
                            <ytd-player>
                                <div id="movie_player" class="html5-video-player ytp-fullscreen">
                                    <video></video>
                                    <button class="ytp-play-button" type="button">Play</button>
                                </div>
                            </ytd-player>
                        </ytd-watch-flexy>
                    `);
                    const player = document.querySelector<HTMLElement>('#movie_player')!;
                    const video = document.querySelector<HTMLVideoElement>('#movie_player video')!;
                    mockElementRect(player, new DOMRect(0, 0, 1024, 768));
                    mockElementRect(video, new DOMRect(0, 96, 1024, 576));
                    attachVideo(controller, { video });
                    const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
                    const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                    const internals = controllerInternals<{
                        alignToVideo: () => void;
                        syncFullscreenState: () => void;
                    }>(controller);

                    fullscreen.set(null);
                    internals.syncFullscreenState();
                    openSingleCueTranscript(controller, 'YouTube全画面の字幕。');
                    internals.alignToVideo();

                    expect(root.parentElement).toBe(document.body);
                    expect(panel.parentElement).toBe(document.body);
                    expect(player.contains(root)).toBe(false);
                    expect(player.contains(panel)).toBe(false);
                    expectFullscreenPanelDisplayOverride(panel);
                    expect(document.documentElement.classList.contains('jpdb-subtitle-fullscreen')).toBe(true);
                    expect(root.classList.contains('jpdb-subtitle-fullscreen')).toBe(true);
                    expect(root.classList.contains('jpdb-subtitle-video-out-of-view')).toBe(false);
                    expect(root.style.left).toBe('0px');
                    expect(root.style.top).toBe('0px');
                    expect(root.style.width).toBe('1024px');
                    expect(root.style.height).toBe('768px');
                    expect(panel.style.left).not.toBe('');
                    expect(player.style.width).toBe('');
                } finally {
                    fullscreen.restore();
                    controller.destroy();
                }
            });
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('keeps the subtitle overlay body-owned in mobile YouTube fullscreen when the video is mounted separately', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://m.youtube.com/watch?v=fullscreen123') as unknown as Location,
        });

        try {
            withViewport(390, 844, () => {
                const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
                const fullscreen = stubFullscreenElement(null);
                try {
                    document.body.insertAdjacentHTML('beforeend', `
                        <ytm-player fullscreen></ytm-player>
                        <div class="mobile-video-slot"><video></video></div>
                    `);
                    const player = document.querySelector<HTMLElement>('ytm-player')!;
                    const video = document.querySelector<HTMLVideoElement>('.mobile-video-slot video')!;
                    mockElementRect(player, new DOMRect(0, 0, 390, 844));
                    mockElementRect(video, new DOMRect(0, 0, 390, 844));
                    attachVideo(controller, { video });
                    const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
                    const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                    const internals = controllerInternals<{
                        alignToVideo: () => void;
                        syncFullscreenState: () => void;
                    }>(controller);

                    fullscreen.set(null);
                    internals.syncFullscreenState();
                    openSingleCueTranscript(controller, 'モバイル全画面の字幕。');
                    internals.alignToVideo();

                    expect(root.parentElement).toBe(document.body);
                    expect(panel.parentElement).toBe(document.body);
                    expect(player.contains(root)).toBe(false);
                    expect(player.contains(panel)).toBe(false);
                    expectFullscreenPanelDisplayOverride(panel);
                    expect(root.classList.contains('jpdb-subtitle-fullscreen')).toBe(true);
                    expect(root.classList.contains('jpdb-subtitle-video-out-of-view')).toBe(false);
                    expect(root.style.width).toBe('390px');
                    expect(root.style.height).toBe('844px');
                    expect(panel.dataset.transcriptPlacement).toBe('bottom');
                } finally {
                    fullscreen.restore();
                    controller.destroy();
                }
            });
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('keeps the subtitle overlay body-owned for the iPhone inline fullscreen fallback host', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://m.youtube.com/watch?v=iphonefullscreen123') as unknown as Location,
        });

        try {
            withViewport(390, 844, () => {
                const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
                const fullscreen = stubFullscreenElement(null);
                try {
                    document.body.insertAdjacentHTML('beforeend', `
                        <ytm-player data-yomu-inline-fullscreen="true" class="ytp-fullscreen">
                            <video></video>
                        </ytm-player>
                    `);
                    const player = document.querySelector<HTMLElement>('ytm-player')!;
                    const video = document.querySelector<HTMLVideoElement>('ytm-player video')!;
                    mockElementRect(player, new DOMRect(0, 0, 390, 844));
                    mockElementRect(video, new DOMRect(0, 0, 390, 844));
                    attachVideo(controller, { video });
                    const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
                    const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                    const internals = controllerInternals<{
                        alignToVideo: () => void;
                        syncFullscreenState: () => void;
                    }>(controller);

                    fullscreen.set(null);
                    internals.syncFullscreenState();
                    openSingleCueTranscript(controller, 'iPhone全画面の字幕。');
                    internals.alignToVideo();

                    expect(root.parentElement).toBe(document.body);
                    expect(panel.parentElement).toBe(document.body);
                    expect(player.contains(root)).toBe(false);
                    expect(player.contains(panel)).toBe(false);
                    expectFullscreenPanelDisplayOverride(panel);
                    expect(root.classList.contains('jpdb-subtitle-fullscreen')).toBe(true);
                    expect(root.classList.contains('jpdb-subtitle-video-out-of-view')).toBe(false);
                    expect(root.style.width).toBe('390px');
                    expect(root.style.height).toBe('844px');
                } finally {
                    fullscreen.restore();
                    controller.destroy();
                }
            });
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('does not move the subtitle overlay into unrelated fullscreen elements', () => {
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        const fullscreen = stubFullscreenElement(null);
        try {
            document.body.insertAdjacentHTML('beforeend', '<section class="video-card"><video></video><button class="player-control" type="button">Play</button></section><div class="modal"></div>');
            const video = document.querySelector<HTMLVideoElement>('.video-card video')!;
            const modal = document.querySelector<HTMLElement>('.modal')!;
            video.controls = false;
            attachVideo(controller, { video, rect: new DOMRect(0, 0, 640, 360) });
            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            const internals = controllerInternals<{ syncFullscreenState: () => void }>(controller);

            fullscreen.set(modal);
            internals.syncFullscreenState();

            expect(root.parentElement).toBe(document.body);
            expect(panel.parentElement).toBe(document.body);
            expect(document.documentElement.classList.contains('jpdb-subtitle-fullscreen')).toBe(true);
            expect(root.classList.contains('jpdb-subtitle-fullscreen')).toBe(true);
        } finally {
            fullscreen.restore();
            controller.destroy();
        }
    });

    it('dispatches resize events after generic player insets on non-CIJ sites so embedded players refit themselves', async () => {
        const originalLocation = window.location;
        vi.useFakeTimers();
        const resizeSpy = vi.fn();
        window.addEventListener('resize', resizeSpy);
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://video.example/watch') as unknown as Location,
        });

        try {
            let adapter: ReturnType<typeof createSubtitleVideoInsetAdapter> | undefined;
            let video: HTMLVideoElement | undefined;
            withViewport(1600, 900, () => {
                document.body.innerHTML = '<section class="video-card"><video></video></section>';
                const frame = document.querySelector<HTMLElement>('.video-card')!;
                video = document.querySelector<HTMLVideoElement>('video')!;
                mockElementRect(frame, new DOMRect(80, 120, 960, 620));
                mockElementRect(video, new DOMRect(100, 160, 920, 518));

                adapter = createSubtitleVideoInsetAdapter();
                adapter.apply({
                    video,
                    side: 'right',
                    playerSize: 820,
                    panelSize: 420,
                    videoRect: new DOMRect(80, 120, 960, 620),
                    margin: 10,
                });

                expect(frame.style.width).toBe('820px');
                expect(frame.style.height).toBe('620px');
                expect(video.style.height).toBe('518px');
            });

            expect(resizeSpy).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(0);
            expect(resizeSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
            await vi.advanceTimersByTimeAsync(80);
            expect(resizeSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
            adapter?.clear(video);
        } finally {
            window.removeEventListener('resize', resizeSpy);
            vi.useRealTimers();
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('defers synthetic layout resize events so side-panel layout cannot recurse through resize handlers', async () => {
        const originalLocation = window.location;
        vi.useFakeTimers();
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://video.example/watch') as unknown as Location,
        });
        let frame: HTMLElement | undefined;
        let video: HTMLVideoElement | undefined;
        let adapter: ReturnType<typeof createSubtitleVideoInsetAdapter> | undefined;
        let resizeEvents = 0;
        let resizeDepth = 0;
        let maxResizeDepth = 0;
        const onResize = vi.fn(() => {
            if (!adapter || !video) return;
            resizeEvents += 1;
            resizeDepth += 1;
            maxResizeDepth = Math.max(maxResizeDepth, resizeDepth);
            if (resizeEvents === 1) {
                adapter.apply({
                    video,
                    side: 'right',
                    playerSize: 800,
                    panelSize: 440,
                    videoRect: new DOMRect(80, 120, 960, 620),
                    margin: 10,
                });
            }
            resizeDepth -= 1;
        });
        window.addEventListener('resize', onResize);

        try {
            withViewport(1600, 900, () => {
                document.body.innerHTML = '<section class="video-card"><video></video></section>';
                frame = document.querySelector<HTMLElement>('.video-card')!;
                video = document.querySelector<HTMLVideoElement>('video')!;
                mockElementRect(frame, new DOMRect(80, 120, 960, 620));
                mockElementRect(video, new DOMRect(100, 160, 920, 518));
                adapter = createSubtitleVideoInsetAdapter();
                adapter.apply({
                    video,
                    side: 'right',
                    playerSize: 820,
                    panelSize: 420,
                    videoRect: new DOMRect(80, 120, 960, 620),
                    margin: 10,
                });
            });

            expect(onResize).not.toHaveBeenCalled();
            expect(frame?.style.width).toBe('820px');
            await vi.advanceTimersByTimeAsync(0);
            expect(onResize).toHaveBeenCalledTimes(1);
            expect(frame?.style.width).toBe('800px');
            await vi.advanceTimersByTimeAsync(1);
            expect(onResize).toHaveBeenCalledTimes(2);
            expect(maxResizeDepth).toBe(1);
        } finally {
            window.removeEventListener('resize', onResize);
            vi.useRealTimers();
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
            document.body.innerHTML = '';
        }
    });

    it('shifts the single-column full-bleed YouTube player so a left-docked panel does not cover it', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=single123') as unknown as Location,
        });
        try {
            withViewport(970, 1300, () => {
                // Single-column watch layout hoists the player out of #primary into
                // an absolutely-positioned full-bleed container at the viewport's
                // left edge, so shifting #primary alone leaves the player covering
                // a left-docked panel.
                document.body.innerHTML = `
                    <ytd-watch-flexy is-single-column>
                        <div id="full-bleed-container">
                            <div id="player-full-bleed-container">
                                <div id="player-container" style="position:absolute;left:0;top:0;">
                                    <div id="movie_player"><video></video></div>
                                </div>
                            </div>
                        </div>
                        <div id="columns">
                            <div id="primary"><div id="primary-inner"></div></div>
                        </div>
                    </ytd-watch-flexy>
                `;
                const fullBleed = document.querySelector<HTMLElement>('#full-bleed-container #player-container')!;
                const video = document.querySelector<HTMLVideoElement>('video')!;
                mockElementRect(fullBleed, new DOMRect(0, 56, 955, 537));
                mockElementRect(video, new DOMRect(0, 56, 955, 537));

                const adapter = createSubtitleVideoInsetAdapter();
                const changed = adapter.apply({
                    video,
                    side: 'left',
                    playerSize: 585,
                    panelSize: 340,
                    videoRect: new DOMRect(0, 56, 955, 537),
                    margin: 10,
                });

                expect(changed).toBe(true);
                // panelSize (340) + left gap (margin * 2) → inset of 360px.
                expect(fullBleed.style.marginLeft).toBe('360px');
                expect(fullBleed.style.width).toBe('585px');
                expect(fullBleed.style.maxWidth).toBe('585px');

                adapter.clear(video);
                expect(fullBleed.style.marginLeft).toBe('');
                expect(fullBleed.style.width).toBe('');
            });
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('resizes a same-size custom player wrapper so controls stay linked to the video frame', () => {
        withViewport(1400, 900, () => {
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: '',
                localDictionariesEnabled: false,
                subtitleTranscriptVisible: false,
                subtitleTranscriptPlacement: 'right' as const,
            };
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese: async () => [],
                onSettingsChange: () => undefined,
            });

            try {
                document.body.innerHTML = `
                    <section class="video-js">
                        <video></video>
                        <button class="vjs-play-control" type="button">Play</button>
                    </section>
                `;
                const frame = document.querySelector<HTMLElement>('.video-js')!;
                const video = document.querySelector<HTMLVideoElement>('video')!;
                video.controls = false;
                mockElementRect(frame, new DOMRect(80, 120, 900, 506));
                mockElementRect(video, new DOMRect(80, 120, 900, 506));
                const cue = { start: 0, end: 1, text: '今日は読む。', transcriptEligible: true };
                const internals = controller as unknown as {
                    install: () => void;
                    video: HTMLVideoElement;
                    cues: Array<typeof cue>;
                    currentCue: typeof cue;
                    openLinesPanel: () => void;
                };
                internals.install();
                internals.video = video;
                internals.cues = [cue];
                internals.currentCue = cue;

                internals.openLinesPanel();

                expect(frame.style.width).not.toBe('');
                expect(frame.style.width).not.toBe(video.style.width);
                expect(video.style.height).not.toBe('');
            } finally {
                controller.destroy();
            }
        });
    });

    it('does not resize a generic player when the transcript drawer is below the video', () => {
        withViewport(390, 844, () => {
            document.body.innerHTML = `
                <section class="video-js">
                    <video></video>
                    <button class="vjs-play-control" type="button">Play</button>
                </section>
            `;
            const frame = document.querySelector<HTMLElement>('.video-js')!;
            const video = document.querySelector<HTMLVideoElement>('video')!;
            video.controls = false;
            mockElementRect(frame, new DOMRect(36, 238, 318, 179));
            const { controller } = createInstalledSubtitleController({
                subtitleTranscriptVisible: false,
                subtitleTranscriptPlacement: 'bottom',
            });

            try {
                attachVideo(controller, { video, rect: new DOMRect(36, 238, 318, 179) });
                openSingleCueTranscript(controller, '今日は読む。');

                const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                expect(panel.dataset.transcriptPlacement).toBe('bottom');
                expect(frame.style.width).toBe('');
                expect(frame.style.height).toBe('');
                expect(video.style.width).toBe('');
                expect(video.style.height).toBe('');
                expect(document.documentElement.style.getPropertyValue('--jpdb-subtitle-video-inset')).toBe('');
            } finally {
                controller.destroy();
            }
        });
    });

    it('anchors article-embedded custom players to the player frame instead of the article body', () => {
        withViewport(1680, 960, () => {
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: '',
                localDictionariesEnabled: false,
                subtitleTranscriptVisible: false,
                subtitleTranscriptPlacement: 'right' as const,
            };
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese: async () => [],
                onSettingsChange: () => undefined,
            });

            try {
                document.body.innerHTML = `
                    <article class="story">
                        <h1>Story headline</h1>
                        <section class="bbc-media-player">
                            <video></video>
                            <button class="bbc-player-controls" type="button">Play</button>
                        </section>
                        <p>Article text below the player should not become the subtitle anchor.</p>
                    </article>
                `;
                const article = document.querySelector<HTMLElement>('.story')!;
                const frame = document.querySelector<HTMLElement>('.bbc-media-player')!;
                const video = document.querySelector<HTMLVideoElement>('video')!;
                mockElementRect(article, new DOMRect(44, 44, 1042, 820));
                mockElementRect(frame, new DOMRect(44, 128, 1042, 587));
                mockElementRect(video, new DOMRect(326, 129, 478, 585));
                const cue = { start: 0, end: 1, text: '今日は読む。', transcriptEligible: true };
                const internals = controller as unknown as {
                    install: () => void;
                    video: HTMLVideoElement;
                    cues: Array<typeof cue>;
                    currentCue: typeof cue;
                    openLinesPanel: () => void;
                };
                internals.install();
                internals.video = video;
                internals.cues = [cue];
                internals.currentCue = cue;

                internals.openLinesPanel();

                const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                expect(panel.style.top).toBe('128px');
                expect(panel.style.top).not.toBe('44px');
                expect(frame.style.width).not.toBe('');
                expect(article.style.width).toBe('');
            } finally {
                controller.destroy();
            }
        });
    });

    // Regression: on an iPad in portrait, a tall portrait player legitimately
    // fills most of the viewport height. The frame resolver used to reject any
    // viewport-sized parent as a page container, so the player frame collapsed
    // to the bare <video>, videoHasPlayerAffordances() failed, and the control
    // rail was hidden (display:none) — landscape players were unaffected.
    it('resolves a tall portrait player that fills the viewport height to its player frame', () => {
        withViewport(834, 1194, () => {
            document.body.innerHTML = `
                <div class="media-reel">
                    <video></video>
                    <button class="play-control" type="button" aria-label="Play">Play</button>
                </div>
            `;
            const frame = document.querySelector<HTMLElement>('.media-reel')!;
            const video = document.querySelector<HTMLVideoElement>('video')!;
            video.controls = false;
            // The wrapper hugs the video (no inset space) and is 1140px tall —
            // above 90% of the 1194px viewport, so it trips isViewportSizedVideoRect.
            mockElementRect(frame, new DOMRect(81, 27, 672, 1140));
            mockElementRect(video, new DOMRect(81, 27, 672, 1140));

            expect(subtitleVideoLayoutTarget(video)).toBe(frame);
        });
    });

    it('resolves modern streaming player wrappers to their player frame', () => {
        withViewport(1365, 768, () => {
            document.body.innerHTML = `
                <main>
                    <section class="watch-shell">
                        <media-player class="artplayer xgplayer stream-container">
                            <video></video>
                            <media-control-bar part="controls">
                                <button type="button" aria-label="Play">Play</button>
                            </media-control-bar>
                        </media-player>
                    </section>
                </main>
            `;
            const frame = document.querySelector<HTMLElement>('media-player')!;
            const video = document.querySelector<HTMLVideoElement>('video')!;
            video.controls = false;
            mockElementRect(frame, new DOMRect(42, 64, 960, 540));
            mockElementRect(video, new DOMRect(42, 64, 960, 540));

            expect(subtitleVideoLayoutTarget(video)).toBe(frame);
        });
    });

    it('still ignores an oversized page container that merely wraps a small video', () => {
        withViewport(834, 1194, () => {
            document.body.innerHTML = `
                <div class="media-page">
                    <video></video>
                    <button class="play-control" type="button" aria-label="Play">Play</button>
                    <p>Lots of other page content sits beside the small player.</p>
                </div>
            `;
            const page = document.querySelector<HTMLElement>('.media-page')!;
            const video = document.querySelector<HTMLVideoElement>('video')!;
            video.controls = false;
            // Viewport-sized container that leaves room for other content — a
            // page wrapper, not the player frame; the guard must keep rejecting it.
            mockElementRect(page, new DOMRect(0, 0, 834, 1194));
            mockElementRect(video, new DOMRect(40, 40, 420, 240));

            expect(subtitleVideoLayoutTarget(video)).toBe(video);
        });
    });

    it('clamps an oversized side drawer instead of falling back below on wide CIJ layouts', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://cijapanese.com/video/560') as unknown as Location,
        });

        try {
            withViewport(1600, 900, () => {
                const settings = {
                    ...DEFAULT_SETTINGS,
                    apiKey: '',
                    localDictionariesEnabled: false,
                    subtitleTranscriptVisible: false,
                    subtitleTranscriptPlacement: 'right' as const,
                };
                const controller = new SubtitlePlayerController({
                    getSettings: () => settings,
                    parseJapanese: async () => [],
                    onSettingsChange: () => undefined,
                });

                try {
                    document.body.innerHTML = '<section class="lesson-player"><video></video></section>';
                    const frame = document.querySelector<HTMLElement>('.lesson-player')!;
                    const video = document.querySelector<HTMLVideoElement>('video')!;
                    mockElementRect(frame, new DOMRect(70, 120, 1080, 700));
                    mockElementRect(video, new DOMRect(90, 210, 960, 540));
                    const cue = { start: 0, end: 1, text: '今日は読む。', transcriptEligible: true };
                    const internals = controller as unknown as {
                        install: () => void;
                        video: HTMLVideoElement;
                        cues: Array<typeof cue>;
                        currentCue: typeof cue;
                        openLinesPanel: () => void;
                        transcriptPanelSize: { sideWidth?: number };
                    };
                    internals.install();
                    internals.video = video;
                    internals.cues = [cue];
                    internals.currentCue = cue;
                    internals.transcriptPanelSize.sideWidth = 1200;

                    internals.openLinesPanel();

                    const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                    expect(panel.dataset.transcriptPlacement).toBe('right');
                    expect(panel.style.width).toBe('948px');
                    expect(panel.style.top).toBe('120px');
                    expect(internals.transcriptPanelSize.sideWidth).toBe(1200);
                } finally {
                    controller.destroy();
                }
            });
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });
});
