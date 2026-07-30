import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    attachVideo,
    controllerInternals,
    createInstalledSubtitleController,
    mockElementRect,
    registerSubtitleControllerCleanup,
    stubFullscreenElement,
} from './fixtures';
import type {
    ReaderSettings,
    SubtitleParsedHtmlCache,
} from './fixtures';

type Cue = {
    start: number;
    end: number;
    text: string;
    transcriptEligible: boolean;
};

type Track = {
    id: string;
    label: string;
    kind: 'native' | 'remote';
    language?: string;
    track?: TextTrack;
    url?: string;
};

type LifecycleInternals = {
    cues: Cue[];
    currentCue: Cue | undefined;
    htmlCache: SubtitleParsedHtmlCache;
    parseCacheKey: (text: string, settings: ReaderSettings) => string;
    render: () => void;
    selectedTrackId: string;
    subtitleEl: HTMLElement;
    tracks: Track[];
};

const CUE: Cue = {
    start: 0,
    end: 4,
    text: '申し訳ありません',
    transcriptEligible: true,
};

const ANNOTATED_HTML = [
    '<span class="jpdb-reader-word jpdb-pitch-heiban jpdb-reader-has-furi" data-pitch-components="true">',
    '<ruby><span class="jpdb-reader-ruby-base">申</span><rt class="jpdb-reader-furi">もう</rt></ruby>',
    'し',
    '<ruby><span class="jpdb-reader-ruby-base">訳</span><rt class="jpdb-reader-furi">わけ</rt></ruby>',
    'ありません',
    '</span>',
].join('');

function seedAnnotatedCue(
    settings: ReaderSettings,
    internals: LifecycleInternals,
    track: Track = {
        id: 'remote-0',
        label: 'Japanese',
        kind: 'remote',
        url: 'https://media.example.test/subtitles-ja.vtt',
    },
): HTMLElement {
    internals.selectedTrackId = track.id;
    internals.tracks = [track];
    internals.cues = [CUE];
    internals.currentCue = CUE;
    internals.htmlCache.parsedHtmlCache.set(
        internals.parseCacheKey(CUE.text, settings),
        ANNOTATED_HTML,
    );
    internals.render();

    const primary = internals.subtitleEl.querySelector<HTMLElement>('.jpdb-subtitle-primary');
    expect(primary).not.toBeNull();
    expect(primary!.querySelector('.jpdb-reader-word')).not.toBeNull();
    expect(primary!.querySelector('.jpdb-reader-furi')?.textContent).toBe('もう');
    expect(primary!.querySelector('.jpdb-subtitle-primary-loading')).toBeNull();
    return primary!;
}

function createNativeTextTrack(): TextTrack {
    const cue = {
        startTime: CUE.start,
        endTime: CUE.end,
        text: CUE.text,
    };
    return {
        activeCues: [cue],
        addEventListener: vi.fn(),
        cues: [cue],
        id: 'japanese-subtitles',
        kind: 'subtitles',
        label: 'Japanese',
        language: 'ja',
        mode: 'hidden',
    } as unknown as TextTrack;
}

function installTextTracks(video: HTMLVideoElement, tracks: TextTrack[]): void {
    const textTracks = Object.assign([...tracks], {
        addEventListener: vi.fn(),
    }) as unknown as TextTrackList;
    Object.defineProperty(video, 'textTracks', {
        configurable: true,
        value: textTracks,
    });
}

function installEmptyTextTracks(video: HTMLVideoElement): void {
    installTextTracks(video, []);
}

describe('SubtitlePlayerController — fullscreen annotation lifecycle', () => {
    registerSubtitleControllerCleanup();

    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.innerHTML = '';
    });

    it('reparents the existing annotated primary through fullscreen entry and exit without rebuilding it', () => {
        document.body.innerHTML = `
            <section data-yomu-video-frame>
                <video controls></video>
            </section>
        `;
        const { controller, settings } = createInstalledSubtitleController({
            subtitleOverlayVisible: true,
            subtitleKaraokeMode: false,
            apiKey: 'test-key',
        });
        const fullscreen = stubFullscreenElement(null);
        try {
            const frame = document.querySelector<HTMLElement>('[data-yomu-video-frame]')!;
            const video = document.querySelector<HTMLVideoElement>('video')!;
            Object.defineProperty(video, 'currentTime', {
                configurable: true,
                value: 1,
                writable: true,
            });
            mockElementRect(frame, new DOMRect(0, 0, 1280, 720));
            mockElementRect(video, new DOMRect(140, 60, 1000, 562));
            attachVideo(controller, { video });

            const internals = controllerInternals<LifecycleInternals & {
                handleFullscreenLayoutChange: () => void;
            }>(controller);
            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const primary = seedAnnotatedCue(settings, internals);

            fullscreen.set(frame);
            internals.handleFullscreenLayoutChange();

            expect(root.parentElement).toBe(frame);
            expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary')).toBe(primary);
            expect(primary.innerHTML).toBe(ANNOTATED_HTML);
            expect(primary.querySelector('.jpdb-subtitle-primary-loading')).toBeNull();

            fullscreen.set(null);
            internals.handleFullscreenLayoutChange();

            expect(root.parentElement).toBe(document.body);
            expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary')).toBe(primary);
            expect(primary.innerHTML).toBe(ANNOTATED_HTML);
            expect(primary.querySelector('.jpdb-subtitle-primary-loading')).toBeNull();
        } finally {
            fullscreen.restore();
            controller.destroy();
        }
    });

    it('keeps an annotated cue painted while rebinding a same-source replacement video', () => {
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });
        document.body.innerHTML = `
            <section id="old-player">
                <video controls src="https://media.example.test/episode.mp4">
                    <track kind="subtitles" srclang="ja" src="https://media.example.test/subtitles-ja.vtt">
                </video>
            </section>
            <section id="replacement-player"><video controls src="https://media.example.test/episode.mp4"></video></section>
        `;
        const videos = document.querySelectorAll<HTMLVideoElement>('video');
        const oldVideo = videos[0]!;
        const replacementVideo = videos[1]!;
        for (const video of videos) {
            Object.defineProperty(video, 'currentTime', {
                configurable: true,
                value: 1,
                writable: true,
            });
            installEmptyTextTracks(video);
            mockElementRect(video, new DOMRect(0, 0, 960, 540));
        }

        const { controller, settings } = createInstalledSubtitleController({
            subtitleOverlayVisible: true,
            subtitleKaraokeMode: false,
            apiKey: 'test-key',
        });
        try {
            attachVideo(controller, { video: oldVideo });
            const internals = controllerInternals<LifecycleInternals & {
                syncSubtitleSourceContext: (video: HTMLVideoElement) => boolean;
                updateFromLoadedCues: () => void;
                useDiscoveredVideoCandidate: (
                    video: HTMLVideoElement,
                    options?: { preserveTransientSubtitleState?: boolean },
                ) => void;
            }>(controller);
            const primary = seedAnnotatedCue(settings, internals);
            const paintedText = primary.textContent ?? '';
            const sample = (stage: string) => {
                const livePrimary = internals.subtitleEl.querySelector<HTMLElement>('.jpdb-subtitle-primary');
                return {
                    stage,
                    annotated: Boolean(livePrimary?.querySelector('.jpdb-reader-word')),
                    loading: Boolean(livePrimary?.querySelector('.jpdb-subtitle-primary-loading')),
                    primaryNodePreserved: livePrimary === primary,
                    text: livePrimary?.textContent ?? '',
                };
            };

            // The source-context key is deliberately identical: this models a
            // player/fullscreen implementation replacing only its media
            // element, not navigating to a different video.
            expect(internals.syncSubtitleSourceContext(oldVideo)).toBe(false);
            const lifecycle = [sample('before replacement')];

            // discoverEnabledVideo resolves source identity before rebinding:
            // an element replacement for the same media keeps the painted cue.
            const sourceChanged = internals.syncSubtitleSourceContext(replacementVideo);
            expect(sourceChanged).toBe(false);
            internals.useDiscoveredVideoCandidate(replacementVideo, {
                preserveTransientSubtitleState: !sourceChanged,
            });
            lifecycle.push(sample('after rebind'));
            controller.refresh();
            lifecycle.push(sample('after discovery refresh'));

            // The next playback sample finds the same cue again. Recording it
            // proves a missing middle sample is a transient lifecycle flash,
            // not a legitimate cue boundary.
            internals.updateFromLoadedCues();
            lifecycle.push(sample('after next playback sample'));

            expect(lifecycle).toEqual([
                {
                    stage: 'before replacement',
                    annotated: true,
                    loading: false,
                    primaryNodePreserved: true,
                    text: paintedText,
                },
                {
                    stage: 'after rebind',
                    annotated: true,
                    loading: false,
                    primaryNodePreserved: true,
                    text: paintedText,
                },
                {
                    stage: 'after discovery refresh',
                    annotated: true,
                    loading: false,
                    primaryNodePreserved: true,
                    text: paintedText,
                },
                {
                    stage: 'after next playback sample',
                    annotated: true,
                    loading: false,
                    primaryNodePreserved: true,
                    text: paintedText,
                },
            ]);
        } finally {
            controller.destroy();
        }
    });

    it('reconciles a same-source native TextTrack replacement without dropping the selected annotation', () => {
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });
        document.body.innerHTML = `
            <section><video controls src="https://media.example.test/episode.mp4"></video></section>
            <section><video controls src="https://media.example.test/episode.mp4"></video></section>
        `;
        const videos = document.querySelectorAll<HTMLVideoElement>('video');
        const oldVideo = videos[0]!;
        const replacementVideo = videos[1]!;
        const oldTextTrack = createNativeTextTrack();
        const replacementTextTrack = createNativeTextTrack();
        expect(replacementTextTrack).not.toBe(oldTextTrack);
        installTextTracks(oldVideo, [oldTextTrack]);
        installTextTracks(replacementVideo, [replacementTextTrack]);
        for (const video of videos) {
            Object.defineProperty(video, 'currentTime', {
                configurable: true,
                value: 1,
                writable: true,
            });
            mockElementRect(video, new DOMRect(0, 0, 960, 540));
        }

        const { controller, settings } = createInstalledSubtitleController({
            subtitleOverlayVisible: true,
            subtitleKaraokeMode: false,
            apiKey: 'test-key',
        });
        try {
            attachVideo(controller, { video: oldVideo });
            const internals = controllerInternals<LifecycleInternals & {
                syncSubtitleSourceContext: (video: HTMLVideoElement) => boolean;
                useDiscoveredVideoCandidate: (
                    video: HTMLVideoElement,
                    options?: { preserveTransientSubtitleState?: boolean },
                ) => void;
            }>(controller);
            const nativeOption: Track = {
                id: 'native-selected',
                label: oldTextTrack.label,
                kind: 'native',
                language: oldTextTrack.language,
                track: oldTextTrack,
            };
            const primary = seedAnnotatedCue(settings, internals, nativeOption);
            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            root.hidden = false;

            expect(internals.syncSubtitleSourceContext(oldVideo)).toBe(false);
            const sourceChanged = internals.syncSubtitleSourceContext(replacementVideo);
            expect(sourceChanged).toBe(false);
            internals.useDiscoveredVideoCandidate(replacementVideo, {
                preserveTransientSubtitleState: !sourceChanged,
            });
            controller.refresh();

            expect(internals.tracks).toHaveLength(1);
            expect(internals.tracks[0]).toBe(nativeOption);
            expect(nativeOption.track).toBe(replacementTextTrack);
            expect(internals.selectedTrackId).toBe('native-selected');
            expect(internals.currentCue).toBe(CUE);
            expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary')).toBe(primary);
            expect(primary.querySelector('.jpdb-reader-word')).not.toBeNull();
            expect(primary.querySelector('.jpdb-subtitle-primary-loading')).toBeNull();
            expect(primary.isConnected).toBe(true);
            expect(root.hidden).toBe(false);
        } finally {
            controller.destroy();
        }
    });

    it('keeps an annotated cue across a transient replacement gap but clears confirmed video loss', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });
        document.body.innerHTML = `
            <section id="old-player"><video controls src="https://media.example.test/episode.mp4"></video></section>
        `;
        const oldVideo = document.querySelector<HTMLVideoElement>('video')!;
        Object.defineProperty(oldVideo, 'currentTime', {
            configurable: true,
            value: 1,
            writable: true,
        });
        installEmptyTextTracks(oldVideo);
        mockElementRect(oldVideo, new DOMRect(0, 0, 960, 540));

        const { controller, settings } = createInstalledSubtitleController({
            subtitleOverlayVisible: true,
            subtitleKaraokeMode: false,
            apiKey: 'test-key',
        });
        try {
            attachVideo(controller, { video: oldVideo });
            const internals = controllerInternals<LifecycleInternals & {
                alignToVideo: () => void;
                discoverEnabledVideo: () => void;
                realignIfVideoMoved: () => void;
                syncSubtitleSourceContext: (video: HTMLVideoElement) => boolean;
                video?: HTMLVideoElement;
            }>(controller);
            expect(internals.syncSubtitleSourceContext(oldVideo)).toBe(false);
            const primary = seedAnnotatedCue(settings, internals);
            internals.alignToVideo();
            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            // jsdom has no media readyState, so establish the already-painted
            // starting state that the browser lifecycle test exercises.
            root.hidden = false;
            expect(root.hidden).toBe(false);
            expect(root.classList.contains('jpdb-subtitle-video-out-of-view')).toBe(false);

            oldVideo.remove();
            mockElementRect(oldVideo, new DOMRect());
            internals.discoverEnabledVideo();

            expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary')).toBe(primary);
            expect(primary.querySelector('.jpdb-reader-word')).not.toBeNull();
            expect(root.hidden).toBe(false);
            expect(root.classList.contains('jpdb-subtitle-video-out-of-view')).toBe(false);
            expect(root.classList.contains('jpdb-subtitle-has-video-frame')).toBe(true);

            // Exercise both direct geometry callbacks and more than one active
            // tick interval while discovery is holding the detached element.
            internals.alignToVideo();
            internals.realignIfVideoMoved();
            await vi.advanceTimersByTimeAsync(1000);
            expect(root.hidden).toBe(false);
            expect(root.classList.contains('jpdb-subtitle-video-out-of-view')).toBe(false);
            expect(root.classList.contains('jpdb-subtitle-has-video-frame')).toBe(true);

            const replacementHost = document.createElement('section');
            replacementHost.innerHTML = `
                <video controls src="https://media.example.test/episode.mp4">
                    <track kind="subtitles" srclang="ja" src="https://media.example.test/subtitles-ja.vtt">
                </video>
            `;
            document.body.append(replacementHost);
            const replacement = replacementHost.querySelector<HTMLVideoElement>('video')!;
            Object.defineProperty(replacement, 'currentTime', {
                configurable: true,
                value: 1,
                writable: true,
            });
            installEmptyTextTracks(replacement);
            mockElementRect(replacement, new DOMRect(0, 0, 960, 540));
            internals.discoverEnabledVideo();
            await vi.advanceTimersByTimeAsync(1000);

            expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary')).toBe(primary);
            expect(primary.querySelector('.jpdb-reader-word')).not.toBeNull();
            expect(primary.querySelector('.jpdb-subtitle-primary-loading')).toBeNull();
            expect(root.hidden).toBe(false);
            expect(root.classList.contains('jpdb-subtitle-video-out-of-view')).toBe(false);
            expect(root.classList.contains('jpdb-subtitle-has-video-frame')).toBe(true);

            replacement.remove();
            mockElementRect(replacement, new DOMRect());
            internals.discoverEnabledVideo();
            await vi.advanceTimersByTimeAsync(1801);

            expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary')).toBeNull();
            expect(internals.video).toBeUndefined();
        } finally {
            vi.useRealTimers();
            controller.destroy();
        }
    });

    it('does not hold an old annotation when the bound source changes during candidate loss', () => {
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });
        document.body.innerHTML = `
            <section><video controls src="https://media.example.test/episode-1.mp4"></video></section>
        `;
        const video = document.querySelector<HTMLVideoElement>('video')!;
        Object.defineProperty(video, 'currentTime', {
            configurable: true,
            value: 1,
            writable: true,
        });
        installEmptyTextTracks(video);
        mockElementRect(video, new DOMRect(0, 0, 960, 540));

        const { controller, settings } = createInstalledSubtitleController({
            subtitleOverlayVisible: true,
            subtitleKaraokeMode: false,
            apiKey: 'test-key',
        });
        try {
            attachVideo(controller, { video });
            const internals = controllerInternals<LifecycleInternals & {
                discoverEnabledVideo: () => void;
                syncSubtitleSourceContext: (candidate: HTMLVideoElement) => boolean;
            }>(controller);
            expect(internals.syncSubtitleSourceContext(video)).toBe(false);
            const primary = seedAnnotatedCue(settings, internals);

            video.remove();
            video.src = 'https://media.example.test/episode-2.mp4';
            mockElementRect(video, new DOMRect());
            internals.discoverEnabledVideo();

            expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary')).toBeNull();
            expect(primary.isConnected).toBe(false);
            expect(internals.currentCue).toBeUndefined();
        } finally {
            controller.destroy();
        }
    });
});
