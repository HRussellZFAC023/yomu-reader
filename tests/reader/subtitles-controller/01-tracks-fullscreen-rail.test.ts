import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_SETTINGS,
    registerSubtitleControllerCleanup,
    stubFullscreenElement,
    mockElementRect,
    makeSubtitleSettings,
    controllerInternals,
    createSubtitleController,
    createInstalledSubtitleController,
    attachVideo,
    setupTranscriptCueController,
    renderDrawerHead,
    subtitleDrawerMetaText,
    withViewport,
    SubtitlePlayerController,
} from './fixtures';
import type {
    ReaderSettings,
    SubtitleFullscreenHost,
} from './fixtures';

describe('SubtitlePlayerController — tracks, native fullscreen & rail controls', () => {
    registerSubtitleControllerCleanup();

    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    it('uses A and D for subtitle line shortcuts without hijacking editable targets', () => {
        const { controller } = createSubtitleController(makeSubtitleSettings());
        const internals = controllerInternals<{
            handleKeydown: (event: KeyboardEvent) => void;
            seekSubtitle: (direction: -1 | 1) => void;
            video?: HTMLVideoElement;
        }>(controller);
        const seekSubtitle = vi.fn();
        internals.seekSubtitle = seekSubtitle;

        const idleEvent = new KeyboardEvent('keydown', { key: 'd', bubbles: true, cancelable: true });
        internals.handleKeydown(idleEvent);

        expect(seekSubtitle).not.toHaveBeenCalled();
        expect(idleEvent.defaultPrevented).toBe(false);

        internals.video = attachVideo(controller);
        const nextEvent = new KeyboardEvent('keydown', { key: 'd', bubbles: true, cancelable: true });
        internals.handleKeydown(nextEvent);

        expect(seekSubtitle).toHaveBeenCalledWith(1);
        expect(nextEvent.defaultPrevented).toBe(true);

        seekSubtitle.mockClear();
        const comment = document.createElement('div');
        comment.setAttribute('contenteditable', 'true');
        const commentEvent = new KeyboardEvent('keydown', { key: 'd', bubbles: true, cancelable: true });
        Object.defineProperty(commentEvent, 'target', { value: comment });
        internals.handleKeydown(commentEvent);

        expect(seekSubtitle).not.toHaveBeenCalled();
        expect(commentEvent.defaultPrevented).toBe(false);
    });

    it('yields A to the reader popover shortcuts while a lookup is open', () => {
        // Play audio and Previous subtitle both default to "A": with a lookup
        // on screen the reader wins (audio replays); with none the timeline
        // seeks. The subtitle handler must yield WITHOUT preventDefault so the
        // bubble-phase reader shortcut still receives the event.
        const { controller } = createSubtitleController(makeSubtitleSettings());
        const internals = controllerInternals<{
            handleKeydown: (event: KeyboardEvent) => void;
            seekSubtitle: (direction: -1 | 1) => void;
        }>(controller);
        const seekSubtitle = vi.fn();
        internals.seekSubtitle = seekSubtitle;
        attachVideo(controller);

        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        document.body.append(popover);
        const withPopover = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
        internals.handleKeydown(withPopover);
        expect(seekSubtitle).not.toHaveBeenCalled();
        expect(withPopover.defaultPrevented).toBe(false);

        popover.remove();
        const withoutPopover = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
        internals.handleKeydown(withoutPopover);
        expect(seekSubtitle).toHaveBeenCalledWith(-1);
        expect(withoutPopover.defaultPrevented).toBe(true);
    });

    it('keeps drawer line navigation in the actions row so the title row gets the full head width', () => {
        const host = document.createElement('div');
        host.innerHTML = renderDrawerHead({
            mode: 'lines',
            title: 'Subtitles',
            meta: '13 lines',
            canShowLines: true,
            options: { placement: 'right', pausePanelEnabled: false, menuOpen: false, language: 'en' },
        });

        const playback = host.querySelector('.jpdb-subtitle-drawer-playback');
        expect(playback).not.toBeNull();
        // The ‹ › cluster shares the actions row with the mode tabs; putting
        // it in the title row squeezed the track label into an ellipsis.
        expect(playback!.closest('.jpdb-subtitle-drawer-actions')).not.toBeNull();
        expect(host.querySelector('.jpdb-subtitle-drawer-top-actions .jpdb-subtitle-drawer-playback')).toBeNull();
        expect([...playback!.querySelectorAll('button')].map(b => b.dataset.action)).toEqual(['previous', 'next']);
    });

    it('keeps translated track labels concise in the drawer while preserving the full tooltip', () => {
        const track = {
            id: 'youtube-ja-translated',
            label: '日本語 (ja) · auto-translated from English (en) · auto-generated',
            kind: 'youtube' as const,
            language: 'ja',
        };
        const compact = subtitleDrawerMetaText({
            mode: 'lines',
            count: 17,
            tracks: [track],
            selectedTrackId: track.id,
            secondaryTrackId: '',
            language: 'en',
        });
        const full = subtitleDrawerMetaText({
            mode: 'lines',
            count: 17,
            tracks: [track],
            selectedTrackId: track.id,
            secondaryTrackId: '',
            language: 'en',
            compact: false,
        });
        const host = document.createElement('div');
        host.innerHTML = renderDrawerHead({
            mode: 'lines',
            title: 'Subtitles',
            meta: compact,
            metaTitle: full,
            canShowLines: true,
            options: { placement: 'right', pausePanelEnabled: false, menuOpen: false, language: 'en' },
        });

        expect(compact).toContain('日本語 (ja) <- English (en)');
        expect(compact).not.toContain('auto-translated');
        expect(full).toContain('auto-translated from English (en)');
        const meta = host.querySelector<HTMLElement>('.jpdb-subtitle-drawer-meta')!;
        expect(meta.textContent).toBe(compact);
        expect(meta.title).toBe(full);
    });

    it('keeps the movable rail to expansion, prev/next, OCR, visibility, panel, and style controls', () => {
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
        const rail = document.querySelector<HTMLElement>('.jpdb-subtitle-rail')!;
        const actions = [...rail.children]
            .filter((element): element is HTMLButtonElement => element instanceof HTMLButtonElement)
            .map(button => button.dataset.action);

        expect(actions).toEqual(['rail-expand', 'previous', 'next', 'ocr', 'visibility', 'panel', 'style']);
        // The pin is gone: the grip itself toggles the persisted expansion.
        expect(document.querySelector('.jpdb-subtitle-rail [data-action="rail-pin"]')).toBeNull();
        expect(document.querySelectorAll('.jpdb-subtitle-rail [data-action="previous"]')).toHaveLength(1);
        expect(document.querySelectorAll('.jpdb-subtitle-rail [data-action="next"]')).toHaveLength(1);
        expect(document.querySelectorAll('.jpdb-subtitle-rail [data-action="visibility"]')).toHaveLength(1);
        expect(document.querySelectorAll('.jpdb-subtitle-rail [data-action="panel"]')).toHaveLength(1);
        expect(document.querySelectorAll('.jpdb-subtitle-rail [data-action="style"]')).toHaveLength(1);
        // Playback/fullscreen belong to the player's native chrome.
        expect(document.querySelector('.jpdb-subtitle-rail [data-action="playback"]')).toBeNull();
        expect(document.querySelector('.jpdb-subtitle-rail [data-action="fullscreen"]')).toBeNull();
        expect(document.querySelector('.jpdb-subtitle-rail [data-action="panel-tracks"]')).toBeNull();
        expect(document.querySelector('.jpdb-subtitle-rail [data-action="toggle"]')).toBeNull();
        expect(document.querySelector('.jpdb-subtitle-rail [data-action="list"]')).toBeNull();
        expect(document.querySelector('.jpdb-subtitle-rail [data-action="tracks"]')).toBeNull();
    });

    it('expands and collapses the rail through the grip via the persisted controls mode', () => {
        const onSettingsChange = vi.fn();
        const { controller, settings } = createInstalledSubtitleController({ subtitleControlsMode: 'auto' }, { onSettingsChange });
        try {
            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const grip = root.querySelector<HTMLButtonElement>('[data-action="rail-expand"]')!;

            grip.click();
            expect(settings.subtitleControlsMode).toBe('always');
            expect(root.classList.contains('jpdb-subtitle-controls-always')).toBe(true);
            expect(grip.getAttribute('aria-expanded')).toBe('true');

            grip.click();
            expect(settings.subtitleControlsMode).toBe('auto');
            expect(root.classList.contains('jpdb-subtitle-controls-auto')).toBe(true);
            expect(onSettingsChange).toHaveBeenCalledTimes(2);
        } finally {
            controller.destroy();
        }
    });

    it('toggles paused-frame OCR while preserving the immediate manual OCR request', () => {
        const onSettingsChange = vi.fn();
        const { controller, settings } = createInstalledSubtitleController({ ocrVideoPauseFrames: false }, { onSettingsChange });
        const video = attachVideo(controller);
        let paused = false;
        Object.defineProperty(video, 'paused', { configurable: true, get: () => paused });
        const pause = vi.spyOn(video, 'pause').mockImplementation(() => { paused = true; });
        const requests: HTMLVideoElement[] = [];
        document.addEventListener('yomu-ocr-video-frame-request', event => {
            requests.push((event as CustomEvent<{ video: HTMLVideoElement }>).detail.video);
        }, { once: true });

        const button = document.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="ocr"]')!;
        expect(button.getAttribute('aria-pressed')).toBe('false');
        expect(button.title).toBe('Read video frame (OCR)');

        button.click();

        expect(pause).toHaveBeenCalledTimes(1);
        expect(requests).toEqual([video]);
        expect(settings.ocrVideoPauseFrames).toBe(true);
        expect(onSettingsChange).toHaveBeenCalledTimes(1);
        expect(button.getAttribute('aria-pressed')).toBe('true');
        expect(button.classList.contains('jpdb-subtitle-ocr-active')).toBe(true);
        expect(button.title).toBe('Stop reading video frames (OCR)');

        button.click();

        expect(pause).toHaveBeenCalledTimes(1);
        expect(requests).toEqual([video]);
        expect(settings.ocrVideoPauseFrames).toBe(false);
        expect(onSettingsChange).toHaveBeenCalledTimes(2);
        expect(button.getAttribute('aria-pressed')).toBe('false');
        expect(button.classList.contains('jpdb-subtitle-ocr-active')).toBe(false);
        expect(button.title).toBe('Read video frame (OCR)');
    });

    it('syncs the rail OCR toggle after the setting changes elsewhere', () => {
        const { controller, settings } = createInstalledSubtitleController({ ocrVideoPauseFrames: false });
        const button = document.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="ocr"]')!;

        (settings as ReaderSettings).ocrVideoPauseFrames = true;
        controller.refresh();

        expect(button.getAttribute('aria-pressed')).toBe('true');
        expect(button.classList.contains('jpdb-subtitle-ocr-active')).toBe(true);
        expect(button.getAttribute('aria-label')).toBe('Stop reading video frames (OCR)');
    });

    it('mirrors cues into a native text track when the video enters native fullscreen by itself', () => {
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        vi.stubGlobal('VTTCue', class {
            constructor(public startTime: number, public endTime: number, public text: string) {}
        });
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });
        try {
            const video = document.createElement('video');
            const addCue = vi.fn();
            const track = { mode: 'hidden', cues: [], addCue, removeCue: vi.fn() } as unknown as TextTrack;
            Object.defineProperty(video, 'addTextTrack', { configurable: true, value: vi.fn(() => track) });
            mockElementRect(video, new DOMRect(20, 40, 960, 540));
            attachVideo(controller, { video });
            const internals = controllerInternals<{
                cues: { start: number; end: number; text: string }[];
                observeVideoLayout: (video: HTMLVideoElement) => void;
            }>(controller);
            internals.cues = [{ start: 1, end: 2, text: 'こんにちは' }];
            internals.observeVideoLayout(video);

            // The site's own fullscreen button is the only entry point now, so
            // the mirror must key off the presentation-mode event, not a Yomu
            // toggle.
            Object.defineProperty(video, 'webkitDisplayingFullscreen', { configurable: true, value: true });
            video.dispatchEvent(new Event('webkitbeginfullscreen'));

            expect(video.addTextTrack).toHaveBeenCalledWith('subtitles', 'Yomu', 'ja');
            expect(addCue).toHaveBeenCalledTimes(1);
            expect(track.mode).toBe('showing');

            Object.defineProperty(video, 'webkitDisplayingFullscreen', { configurable: true, value: false });
            video.dispatchEvent(new Event('webkitendfullscreen'));

            expect(track.mode).toBe('disabled');
        } finally {
            vi.unstubAllGlobals();
            controller.destroy();
        }
    });

    it('freezes loaded subtitle timing while the bound video buffers and resumes only on playing', () => {
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });
        const cues = [
            { start: 0, end: 1, text: '止まる字幕', transcriptEligible: true },
            { start: 1, end: 2, text: '再開した字幕', transcriptEligible: true },
        ];
        const { controller, internals, video } = setupTranscriptCueController<typeof cues[number], {
            currentCue: typeof cues[number] | undefined;
            observeVideoLayout: (video: HTMLVideoElement) => void;
            updateFromLoadedCues: () => void;
        }>(cues, {
            currentCue: cues[0],
            currentTime: 0.5,
            selectedTrackId: 'file-primary',
        });
        let paused = false;
        let ended = false;
        let readyState: number = HTMLMediaElement.HAVE_CURRENT_DATA;
        Object.defineProperties(video, {
            paused: { configurable: true, get: () => paused },
            ended: { configurable: true, get: () => ended },
            readyState: { configurable: true, get: () => readyState },
        });

        try {
            internals.observeVideoLayout(video);
            video.dispatchEvent(new Event('waiting'));
            video.currentTime = 1.5;
            video.dispatchEvent(new Event('timeupdate'));
            internals.updateFromLoadedCues();

            expect(internals.currentCue).toBe(cues[0]);

            video.dispatchEvent(new Event('playing'));
            internals.updateFromLoadedCues();

            expect(internals.currentCue).toBe(cues[1]);

            video.currentTime = 0.5;
            internals.updateFromLoadedCues();
            video.dispatchEvent(new Event('stalled'));
            video.currentTime = 1.5;
            internals.updateFromLoadedCues();
            expect(internals.currentCue).toBe(cues[0]);

            video.dispatchEvent(new Event('seeking'));
            internals.updateFromLoadedCues();
            expect(internals.currentCue).toBe(cues[1]);

            video.dispatchEvent(new Event('playing'));
            internals.updateFromLoadedCues();
            expect(internals.currentCue).toBe(cues[1]);

            readyState = HTMLMediaElement.HAVE_FUTURE_DATA;
            video.currentTime = 0.5;
            internals.updateFromLoadedCues();
            video.dispatchEvent(new Event('stalled'));
            video.currentTime = 1.5;
            internals.updateFromLoadedCues();
            expect(internals.currentCue).toBe(cues[1]);

            paused = true;
            video.currentTime = 0.5;
            video.dispatchEvent(new Event('pause'));
            internals.updateFromLoadedCues();
            expect(internals.currentCue).toBe(cues[0]);

            paused = false;
            ended = true;
            video.dispatchEvent(new Event('waiting'));
            video.currentTime = 1.5;
            internals.updateFromLoadedCues();
            expect(internals.currentCue).toBe(cues[1]);
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
        }
    });

    it('mirrors the synthesized DOM-caption cue stream into the native track during native fullscreen', () => {
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        vi.stubGlobal('VTTCue', class {
            constructor(public startTime: number, public endTime: number, public text: string) {}
        });
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });
        try {
            const video = document.createElement('video');
            const addCue = vi.fn();
            const track = { mode: 'hidden', cues: [], addCue, removeCue: vi.fn() } as unknown as TextTrack;
            Object.defineProperty(video, 'addTextTrack', { configurable: true, value: vi.fn(() => track) });
            mockElementRect(video, new DOMRect(20, 40, 960, 540));
            attachVideo(controller, { video, currentTime: 5 });
            const internals = controllerInternals<{
                cues: { start: number; end: number; text: string }[];
                currentCue?: { start: number; end: number; text: string; transcriptEligible?: boolean };
                observeVideoLayout: (video: HTMLVideoElement) => void;
                applyDomCaptionFallback: (text: string, selected: undefined) => void;
            }>(controller);
            // The reachable m.youtube state: NO host TextTracks (YouTube never
            // populates this.tracks — addNativeTrack early-returns there),
            // this.cues EMPTY, and no synthesized cue yet at fullscreen entry —
            // the DOM-caption fallback synthesizes its first cue only after the
            // system player is already up.
            internals.cues = [];
            internals.currentCue = undefined;
            internals.observeVideoLayout(video);

            Object.defineProperty(video, 'webkitDisplayingFullscreen', { configurable: true, value: true });
            video.dispatchEvent(new Event('webkitbeginfullscreen'));

            // The mirror must be ARMED at entry (created and showing, still
            // empty) so the system player registers the track before the first
            // cue exists.
            expect(video.addTextTrack).toHaveBeenCalledWith('subtitles', 'Yomu', 'ja');
            expect(track.mode).toBe('showing');
            expect(addCue).not.toHaveBeenCalled();

            // The fallback synthesizes the first caption mid-fullscreen: the
            // mirror receives it.
            internals.applyDomCaptionFallback('こんにちは', undefined);

            expect(addCue).toHaveBeenCalledTimes(1);
            expect((addCue.mock.calls[0]![0] as { text: string }).text).toBe('こんにちは');
            expect(track.mode).toBe('showing');

            // And follows the NEXT caption while still fullscreen.
            internals.applyDomCaptionFallback('次の字幕です。', undefined);

            expect(addCue.mock.calls.length).toBeGreaterThan(1);
            const lastCue = addCue.mock.calls.at(-1)![0] as { text: string };
            expect(lastCue.text).toBe('次の字幕です。');
            expect(track.mode).toBe('showing');

            Object.defineProperty(video, 'webkitDisplayingFullscreen', { configurable: true, value: false });
            video.dispatchEvent(new Event('webkitendfullscreen'));
            expect(track.mode).toBe('disabled');
        } finally {
            vi.unstubAllGlobals();
            controller.destroy();
        }
    });

    it('leaves the host text track visible when Yomu has no cue visual commit', () => {
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });
        try {
            const video = document.createElement('video');
            mockElementRect(video, new DOMRect(20, 40, 960, 540));
            attachVideo(controller, { video });
            const hostTrack = { mode: 'hidden', label: 'Japanese', language: 'ja', cues: [], addEventListener: vi.fn() } as unknown as TextTrack;
            const internals = controllerInternals<{
                cues: unknown[];
                currentCue?: unknown;
                tracks: Array<{ id: string; label: string; kind: string; track?: TextTrack }>;
                selectedTrackId: string;
                observeVideoLayout: (video: HTMLVideoElement) => void;
            }>(controller);
            internals.cues = [];
            internals.currentCue = undefined;
            internals.tracks = [{ id: 'native-0', label: 'Japanese', kind: 'native', track: hostTrack }];
            internals.selectedTrackId = 'native-0';
            internals.observeVideoLayout(video);

            Object.defineProperty(video, 'webkitDisplayingFullscreen', { configurable: true, value: true });
            video.dispatchEvent(new Event('webkitbeginfullscreen'));

            // Yomu suppressed the host's captions but has nothing of its own to
            // show in the system player — give the host track back.
            expect(hostTrack.mode).toBe('showing');

            Object.defineProperty(video, 'webkitDisplayingFullscreen', { configurable: true, value: false });
            video.dispatchEvent(new Event('webkitendfullscreen'));

            // Back out of the system player with no cue to paint: ownership
            // stays with the host instead of suppressing the only captions.
            expect(hostTrack.mode).toBe('showing');
        } finally {
            vi.unstubAllGlobals();
            controller.destroy();
        }
    });

    it('does not hide restored host tracks when the controller is destroyed without a cue commit', () => {
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });
        try {
            const video = document.createElement('video');
            mockElementRect(video, new DOMRect(20, 40, 960, 540));
            attachVideo(controller, { video });
            const hostTrack = { mode: 'hidden', label: 'Japanese', language: 'ja', cues: [], addEventListener: vi.fn() } as unknown as TextTrack;
            const internals = controllerInternals<{
                cues: unknown[];
                currentCue?: unknown;
                tracks: Array<{ id: string; label: string; kind: string; track?: TextTrack }>;
                selectedTrackId: string;
                observeVideoLayout: (video: HTMLVideoElement) => void;
            }>(controller);
            internals.cues = [];
            internals.currentCue = undefined;
            internals.tracks = [{ id: 'native-0', label: 'Japanese', kind: 'native', track: hostTrack }];
            internals.selectedTrackId = 'native-0';
            internals.observeVideoLayout(video);

            Object.defineProperty(video, 'webkitDisplayingFullscreen', { configurable: true, value: true });
            video.dispatchEvent(new Event('webkitbeginfullscreen'));
            expect(hostTrack.mode).toBe('showing');

            // Teardown removes Yomu's overlay; the host remains the only
            // caption owner and must not be hidden.
            controller.destroy();

            expect(hostTrack.mode).toBe('showing');
        } finally {
            vi.unstubAllGlobals();
            controller.destroy();
        }
    });

    it('caches the fullscreen host query between geometry samples and refreshes it on fullscreen signals', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });
        const { controller } = createSubtitleController(makeSubtitleSettings({ subtitleOverlayVisible: true }));
        try {
            document.body.insertAdjacentHTML('beforeend', '<div id="movie_player" class="html5-video-player"><video></video></div>');
            const player = document.getElementById('movie_player')!;
            const video = player.querySelector('video') as HTMLVideoElement;
            // init (not bare install): the fullscreenchange listeners and the
            // fullscreen-attribute observer under test are registered there.
            controller.init();
            attachVideo(controller, { video, rect: new DOMRect(0, 0, 960, 540) });
            const internals = controllerInternals<{ fullscreenHost: SubtitleFullscreenHost }>(controller);
            expect(internals.fullscreenHost.subtitleFullscreenHost()).toBeNull();

            // The 120ms geometry sampler reads this on every sample while NOT
            // fullscreen; the 10-selector document.querySelectorAll walk was
            // ~1.4% of a core (profiled). Steady-state reads must be O(1).
            const querySpy = vi.spyOn(document, 'querySelectorAll');
            const singleQuerySpy = vi.spyOn(document, 'querySelector');
            expect(internals.fullscreenHost.subtitleFullscreenHost()).toBeNull();
            expect(internals.fullscreenHost.subtitleFullscreenHost()).toBeNull();
            expect(querySpy).not.toHaveBeenCalled();
            expect(singleQuerySpy.mock.calls.filter(call => String(call[0]).includes('data-yomu-inline-fullscreen'))).toHaveLength(0);
            querySpy.mockRestore();
            singleQuerySpy.mockRestore();

            // CSS-class fullscreen (YouTube's fake/inline flavor) + the
            // fullscreenchange signal the redirect and browsers both emit.
            player.classList.add('ytp-fullscreen');
            document.dispatchEvent(new Event('fullscreenchange'));
            expect(internals.fullscreenHost.subtitleFullscreenHost()).toBe(player);
            internals.fullscreenHost.syncSubtitleRootParent();
            expect(document.querySelector('.jpdb-subtitle-player')?.parentElement).toBe(document.body);

            player.classList.remove('ytp-fullscreen');
            document.dispatchEvent(new Event('fullscreenchange'));
            expect(internals.fullscreenHost.subtitleFullscreenHost()).toBeNull();

            // Real element fullscreen on a NON-video container bypasses the
            // cache (the fullscreenElement-contains-video branch), so a stale
            // cache can never shadow it. Bare <video> fullscreen is a
            // different path entirely (native-fullscreen handling), not this.
            const fullscreenStub = stubFullscreenElement(player);
            try {
                expect(internals.fullscreenHost.subtitleFullscreenHost()).toBe(player);
                internals.fullscreenHost.syncSubtitleRootParent();
                expect(document.querySelector('.jpdb-subtitle-player')?.parentElement).toBe(player);
            } finally {
                fullscreenStub.restore();
                internals.fullscreenHost.syncSubtitleRootParent();
            }
            expect(document.querySelector('.jpdb-subtitle-player')?.parentElement).toBe(document.body);
        } finally {
            Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
            controller.destroy();
        }
    });

    it('refreshes the cached fullscreen host from the fullscreen-affecting attribute observer', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });
        const { controller } = createSubtitleController(makeSubtitleSettings({ subtitleOverlayVisible: true }));
        try {
            document.body.insertAdjacentHTML('beforeend', '<div id="movie_player" class="html5-video-player"><video></video></div>');
            const player = document.getElementById('movie_player')!;
            const video = player.querySelector('video') as HTMLVideoElement;
            controller.init();
            attachVideo(controller, { video, rect: new DOMRect(0, 0, 960, 540) });
            const internals = controllerInternals<{ fullscreenHost: SubtitleFullscreenHost }>(controller);
            expect(internals.fullscreenHost.subtitleFullscreenHost()).toBeNull();

            // No fullscreenchange this time: the body attribute observer
            // (class/fullscreen/data-yomu-inline-fullscreen filter) is the
            // invalidation signal for YouTube's class-driven fullscreen.
            player.classList.add('ytp-fullscreen');
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(internals.fullscreenHost.subtitleFullscreenHost()).toBe(player);
        } finally {
            Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
            controller.destroy();
        }
    });

    it('refreshes the cached fullscreen host when a marked mobile shell is inserted without the video', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://m.youtube.com/watch?v=abc123') as unknown as Location,
        });
        const { controller } = createSubtitleController(makeSubtitleSettings({ subtitleOverlayVisible: true }));
        try {
            // m.youtube can keep the bound video OUTSIDE the fullscreen shell
            // and swap in an ALREADY-MARKED <ytm-player fullscreen> — a
            // childList-only mutation: no attribute changes, and video
            // discovery ignores the videoless shell (sol P1).
            document.body.insertAdjacentHTML('beforeend', '<div id="player-container"><video></video></div>');
            const video = document.querySelector('#player-container video') as HTMLVideoElement;
            controller.init();
            attachVideo(controller, { video, rect: new DOMRect(0, 0, 390, 220) });
            const internals = controllerInternals<{ fullscreenHost: SubtitleFullscreenHost }>(controller);
            expect(internals.fullscreenHost.subtitleFullscreenHost()).toBeNull();

            const shell = document.createElement('ytm-player');
            shell.setAttribute('fullscreen', '');
            document.body.append(shell);
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(internals.fullscreenHost.subtitleFullscreenHost()).toBe(shell);

            shell.remove();
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(internals.fullscreenHost.subtitleFullscreenHost()).toBeNull();
        } finally {
            Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
            controller.destroy();
        }
    });

    it('drops a cached host that no longer passes the semantic selection condition', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        try {
            document.body.insertAdjacentHTML('beforeend', `
                <div id="movie_player" class="html5-video-player ytp-fullscreen"><video></video></div>
                <div id="other_player" class="html5-video-player ytp-fullscreen"></div>
            `);
            const player = document.getElementById('movie_player')!;
            const other = document.getElementById('other_player')!;
            const video = player.querySelector('video') as HTMLVideoElement;
            mockElementRect(other, new DOMRect(0, 0, 0, 0));
            attachVideo(controller, { video, rect: new DOMRect(0, 0, 960, 540) });
            const internals = controllerInternals<{ fullscreenHost: SubtitleFullscreenHost }>(controller);
            // Start from a fresh (post-signal) cache: install() cached null
            // before this fixture existed, and this install-only harness has
            // no observer to invalidate it — the subject here is how a cached
            // NON-null host is revalidated on read.
            internals.fullscreenHost.hostQuery = undefined;

            expect(internals.fullscreenHost.subtitleFullscreenHost()).toBe(player);

            // Simulate a visibility handoff: the cached host keeps matching the
            // selector but stops containing the video and is not visible — a
            // fresh query would reject it, so revalidation must too (sol P1b:
            // selector membership alone retained the wrong host).
            internals.fullscreenHost.hostQuery = { host: other, at: performance.now() };
            expect(internals.fullscreenHost.subtitleFullscreenHost()).toBe(player);
        } finally {
            Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
            controller.destroy();
        }
    });

    it('re-reads native cue lists only when dirty or stale, observed through the cue state', () => {
        const { settings, controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        try {
            const internals = controllerInternals<{
                tickSubtitlePlayer: (settings: ReaderSettings) => void;
                markNativeCueListsDirty: () => void;
                lastForcedNativeCueRefreshAt: number;
                tracks: Array<{ id: string; label: string; kind: string; track?: TextTrack }>;
                selectedTrackId: string;
                cues: Array<{ text: string }>;
            }>(controller);
            const trackCues: Array<{ startTime: number; endTime: number; text: string }> = [
                { startTime: 0, endTime: 2, text: '一行目です。' },
            ];
            const track = { mode: 'hidden', label: 'Japanese', language: 'ja', cues: trackCues, addEventListener: vi.fn() } as unknown as TextTrack;
            internals.tracks = [{ id: 'native-0', label: 'Japanese', kind: 'native', track }];
            internals.selectedTrackId = 'native-0';

            internals.tickSubtitlePlayer(settings);
            expect(internals.cues.map(cue => cue.text)).toEqual(['一行目です。']);

            // A silent append (no TextTrack event exists for cue additions)
            // is NOT picked up by steady-state ticks within the bound…
            trackCues.push({ startTime: 2, endTime: 4, text: '二行目です。' });
            internals.tickSubtitlePlayer(settings);
            internals.tickSubtitlePlayer(settings);
            expect(internals.cues.map(cue => cue.text)).toEqual(['一行目です。']);

            // …but a dirty mark (track/selection signal) refreshes same-tick…
            internals.markNativeCueListsDirty();
            internals.tickSubtitlePlayer(settings);
            expect(internals.cues.map(cue => cue.text)).toEqual(['一行目です。', '二行目です。']);

            // …and staleness is bounded: past the forced-refresh window the
            // tick re-reads without any signal. (Offset from the live clock so
            // the assertion cannot depend on how long the suite has run.)
            trackCues.push({ startTime: 4, endTime: 6, text: '三行目です。' });
            internals.lastForcedNativeCueRefreshAt = performance.now() - 5001;
            internals.tickSubtitlePlayer(settings);
            expect(internals.cues.map(cue => cue.text)).toEqual(['一行目です。', '二行目です。', '三行目です。']);
        } finally {
            controller.destroy();
        }
    });

    it('marks cue lists dirty on track add, and cuechange refreshes directly without re-marking', () => {
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        try {
            const internals = controllerInternals<{
                addNativeTrack: (track: TextTrack) => void;
                nativeCueListsDirty: boolean;
                updateFromNativeTrack: (track: TextTrack) => void;
            }>(controller);
            internals.nativeCueListsDirty = false;
            const listeners: Record<string, () => void> = {};
            const track = {
                label: 'Japanese',
                language: 'ja',
                mode: 'hidden',
                cues: [],
                addEventListener: (name: string, handler: () => void) => { listeners[name] = handler; },
            } as unknown as TextTrack;

            internals.addNativeTrack(track);
            expect(internals.nativeCueListsDirty).toBe(true);

            // cuechange re-reads the selected track's list inside
            // updateFromNativeTrack; ALSO marking the global flag made the
            // next tick normalize the same list a second time (sol P3).
            internals.nativeCueListsDirty = false;
            const updateSpy = vi.spyOn(internals, 'updateFromNativeTrack');
            listeners.cuechange?.();
            expect(updateSpy).toHaveBeenCalledWith(track);
            expect(internals.nativeCueListsDirty).toBe(false);
        } finally {
            controller.destroy();
        }
    });

    it('forces a native cue refresh when a transcript panel opens so silent appends are never missing', () => {
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        try {
            const internals = controllerInternals<{
                openLinesPanel: () => void;
                tracks: Array<{ id: string; label: string; kind: string; track?: TextTrack }>;
                selectedTrackId: string;
                cues: Array<{ text: string }>;
            }>(controller);
            const trackCues: Array<{ startTime: number; endTime: number; text: string }> = [
                { startTime: 0, endTime: 2, text: '一行目です。' },
                // Appended silently since the last refresh (within the 5s
                // bound): the drawer render — and a mining scan, which
                // snapshots transcriptRows() and can never regain rows later —
                // must see the full list the moment it opens.
                { startTime: 2, endTime: 4, text: '二行目です。' },
            ];
            const track = { mode: 'hidden', label: 'Japanese', language: 'ja', cues: trackCues, addEventListener: vi.fn() } as unknown as TextTrack;
            internals.tracks = [{ id: 'native-0', label: 'Japanese', kind: 'native', track }];
            internals.selectedTrackId = 'native-0';

            internals.openLinesPanel();

            expect(internals.cues.map(cue => cue.text)).toEqual(['一行目です。', '二行目です。']);
        } finally {
            controller.destroy();
        }
    });

    it('skips the m.youtube controls-inset query on pages that cannot have it', () => {
        const { settings, controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        try {
            const internals = controllerInternals<{ tickSubtitlePlayer: (settings: ReaderSettings) => void }>(controller);
            const querySpy = vi.spyOn(document, 'querySelector');
            internals.tickSubtitlePlayer(settings);
            expect(querySpy.mock.calls.filter(call => call[0] === '#player-control-overlay')).toHaveLength(0);
            querySpy.mockRestore();
        } finally {
            controller.destroy();
        }
    });

    it('still measures the m.youtube top control row on m.youtube', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://m.youtube.com/watch?v=abc123') as unknown as Location,
        });
        const { settings, controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        try {
            const internals = controllerInternals<{ tickSubtitlePlayer: (settings: ReaderSettings) => void }>(controller);
            const querySpy = vi.spyOn(document, 'querySelector');
            internals.tickSubtitlePlayer(settings);
            expect(querySpy.mock.calls.filter(call => call[0] === '#player-control-overlay').length).toBeGreaterThan(0);
            querySpy.mockRestore();
        } finally {
            Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
            controller.destroy();
        }
    });

    it('realigns subtitles immediately when fullscreen starts while the video is playing', () => {
        withViewport(1280, 720, () => {
            document.body.innerHTML = '<section data-yomu-video-frame><video controls></video></section>';
            const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
            const fullscreenStub = stubFullscreenElement(null);
            try {
                const frame = document.querySelector<HTMLElement>('[data-yomu-video-frame]')!;
                const video = document.querySelector<HTMLVideoElement>('video')!;
                Object.defineProperty(video, 'paused', { configurable: true, value: false });
                mockElementRect(frame, new DOMRect(20, 40, 640, 360));
                mockElementRect(video, new DOMRect(20, 40, 640, 360));
                attachVideo(controller, { video });
                const internals = controllerInternals<{ alignToVideo: () => void }>(controller);
                internals.alignToVideo();
                const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
                expect(root.style.width).toBe('640px');

                fullscreenStub.set(frame);
                mockElementRect(frame, new DOMRect(0, 0, 1280, 720));
                mockElementRect(video, new DOMRect(0, 0, 1280, 720));
                controllerInternals<{ handleFullscreenLayoutChange: () => void }>(controller).handleFullscreenLayoutChange();

                expect(root.style.left).toBe('0px');
                expect(root.style.top).toBe('0px');
                expect(root.style.width).toBe('1280px');
                expect(root.style.height).toBe('720px');
                expect(root.classList.contains('jpdb-subtitle-fullscreen')).toBe(true);
            } finally {
                fullscreenStub.restore();
                controller.destroy();
            }
        });
    });
});
