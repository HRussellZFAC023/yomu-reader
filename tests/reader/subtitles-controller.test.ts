import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPEN_SUBTITLE_TRACKS_EVENT } from '../../src/reader/app/constants';
import { DEFAULT_SETTINGS as BASE_DEFAULT_SETTINGS } from '../../src/reader/settings/index';

// These tests assert English UI copy; pin the interface language since the
// shipped default is now 'ja'.
const DEFAULT_SETTINGS: typeof BASE_DEFAULT_SETTINGS = { ...BASE_DEFAULT_SETTINGS, interfaceLanguage: 'en' };
import { readPageCaptionText } from '../../src/reader/subtitles/subtitle-dom-captions';
import { requestSubtitleText, SubtitlePlayerController } from '../../src/reader/subtitles/controller';
import { createSubtitleVideoInsetAdapter, subtitleVideoLayoutTarget } from '../../src/reader/subtitles/subtitle-video-inset';

// UT-48 session parse cache: clear between tests so persisted cue html from
// one test cannot satisfy another test's parse expectations.
afterEach(() => {
    for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith('yomu:subtitle-parse:')) sessionStorage.removeItem(key);
    }
});
import type { JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { withViewport } from './helpers/browser-fixtures';

const SUBTITLES_YOUTUBE_CSS = readFileSync('src/reader/styles/subtitles-youtube.css', 'utf8');
const SUBTITLE_PARSE_OPTIONS = {
    jpdbTimeoutMs: 1200,
    allowJpdbTimeoutFallback: true,
    allowSegmentedFallback: true,
    // Pitch is baked in at parse time so cue underline colors show during
    // playback instead of arriving via late enrichment.
    includeLocalPitch: true,
};

async function withMatchMedia<T>(matches: (query: string) => boolean, callback: () => T | Promise<T>): Promise<T> {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: (query: string) => ({
            matches: matches(query),
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }),
    });
    try {
        return await callback();
    } finally {
        if (descriptor) Object.defineProperty(window, 'matchMedia', descriptor);
        else delete (window as unknown as Record<string, unknown>).matchMedia;
    }
}

function stubFullscreenElement(initial: Element | null): { set: (value: Element | null) => void; restore: () => void } {
    let value = initial;
    const descriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
    Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        get: () => value,
    });
    return {
        set: next => { value = next; },
        restore: () => {
            if (descriptor) Object.defineProperty(document, 'fullscreenElement', descriptor);
            else delete (document as unknown as { fullscreenElement?: unknown }).fullscreenElement;
        },
    };
}

function mockElementRect(element: Element, rect: DOMRect): void {
    Object.defineProperty(element, 'getBoundingClientRect', {
        configurable: true,
        value: () => rect,
    });
}

type SubtitleControllerOptions = ConstructorParameters<typeof SubtitlePlayerController>[0];
type SubtitleControllerHooks = Partial<Omit<SubtitleControllerOptions, 'getSettings'>>;

function makeSubtitleSettings<TOverrides extends Partial<ReaderSettings> = Record<string, never>>(
    overrides?: TOverrides,
): ReaderSettings & TOverrides {
    return {
        ...DEFAULT_SETTINGS,
        apiKey: '',
        localDictionariesEnabled: false,
        ...overrides,
    } as ReaderSettings & TOverrides;
}

function controllerInternals<TInternals>(controller: SubtitlePlayerController): TInternals {
    return controller as unknown as TInternals;
}

function createSubtitleController<TSettings extends ReaderSettings>(
    settings: TSettings,
    hooks: SubtitleControllerHooks = {},
): { settings: TSettings; controller: SubtitlePlayerController } {
    const controller = new SubtitlePlayerController({
        getSettings: () => settings,
        parseJapanese: hooks.parseJapanese ?? (async () => []),
        ...(hooks.parseJapaneseBatch ? { parseJapaneseBatch: hooks.parseJapaneseBatch } : {}),
        ...(hooks.beforeRenderTokens ? { beforeRenderTokens: hooks.beforeRenderTokens } : {}),
        ...(hooks.afterParseTokens ? { afterParseTokens: hooks.afterParseTokens } : {}),
        onSettingsChange: hooks.onSettingsChange ?? (() => undefined),
    });
    return { settings, controller };
}

function installController(controller: SubtitlePlayerController): void {
    controllerInternals<{ install: () => void }>(controller).install();
}

function createInstalledSubtitleController<TOverrides extends Partial<ReaderSettings> = Record<string, never>>(
    overrides?: TOverrides,
    hooks: SubtitleControllerHooks = {},
): { settings: ReaderSettings & TOverrides; controller: SubtitlePlayerController } {
    const settings = makeSubtitleSettings(overrides);
    const setup = createSubtitleController(settings, hooks);
    installController(setup.controller);
    return setup;
}

function attachVideo(
    controller: SubtitlePlayerController,
    options: { currentTime?: number; rect?: DOMRect; video?: HTMLVideoElement } = {},
): HTMLVideoElement {
    const video = options.video ?? document.createElement('video');
    // The fixtures represent a real player; the rail only follows videos
    // that offer playback controls (or have subtitle data).
    if (!options.video) video.controls = true;
    if (options.currentTime !== undefined) {
        Object.defineProperty(video, 'currentTime', {
            configurable: true,
            value: options.currentTime,
            writable: true,
        });
    }
    if (options.rect) mockElementRect(video, options.rect);
    controllerInternals<{ video: HTMLVideoElement }>(controller).video = video;
    return video;
}

function setupInstalledVideoController(
    rect: DOMRect,
    overrides?: Partial<ReaderSettings>,
): { controller: SubtitlePlayerController; root: HTMLElement; video: HTMLVideoElement } {
    const { controller } = createInstalledSubtitleController(overrides);
    const video = attachVideo(controller, { rect });
    controller.refresh();
    const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
    return { controller, root, video };
}

type TestSubtitleCue = { start: number; end: number; text: string; transcriptEligible: boolean };

function setupTranscriptCueController<
    TCue extends TestSubtitleCue,
    TInternals extends object = Record<string, never>,
>(
    cues: TCue[],
    options: {
        currentCue?: TCue;
        currentTime?: number;
        hooks?: SubtitleControllerHooks;
        selectedTrackId?: string;
        settings?: Partial<ReaderSettings>;
    } = {},
): {
    controller: SubtitlePlayerController;
    internals: TInternals & {
        cues: TCue[];
        currentCue: TCue;
        openLinesPanel: () => void;
        selectedTrackId: string;
    };
    settings: ReaderSettings;
    video: HTMLVideoElement;
} {
    const { controller, settings } = createInstalledSubtitleController(options.settings, options.hooks);
    const video = attachVideo(controller, { currentTime: options.currentTime ?? 0.5 });
    const internals = controllerInternals<TInternals & {
        cues: TCue[];
        currentCue: TCue;
        openLinesPanel: () => void;
        selectedTrackId: string;
    }>(controller);
    if (options.selectedTrackId !== undefined) internals.selectedTrackId = options.selectedTrackId;
    internals.cues = cues;
    internals.currentCue = options.currentCue ?? cues[0]!;
    return { controller, internals, settings, video };
}

function openSingleCueTranscript(controller: SubtitlePlayerController, text = '全画面の字幕。'): void {
    const cue = { start: 0, end: 2, text, transcriptEligible: true };
    const internals = controllerInternals<{
        cues: Array<typeof cue>;
        currentCue: typeof cue;
        openLinesPanel: () => void;
    }>(controller);
    internals.cues = [cue];
    internals.currentCue = cue;
    internals.openLinesPanel();
}

function expectFullscreenPanelDisplayOverride(panel: HTMLElement): void {
    expect(panel.hidden).toBe(false);
    expect(panel.classList.contains('jpdb-subtitle-fullscreen')).toBe(true);
    expect(panel.style.getPropertyValue('display')).toBe('grid');
    expect(panel.style.getPropertyPriority('display')).toBe('important');
}

function setSingleJapaneseSubtitleTrack(controller: SubtitlePlayerController): void {
    controllerInternals<{ tracks: unknown[] }>(controller).tracks = [{
        id: 'youtube-ja',
        kind: 'youtube',
        label: 'Japanese',
        language: 'ja',
        cues: [],
    }];
}

function subtitlePanelToggleElements(): { root: HTMLElement; panel: HTMLElement; button: HTMLButtonElement } {
    const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
    const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
    const button = root.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="panel"]')!;
    return { root, panel, button };
}

function expectJapaneseTracksPanelOpen(panel: HTMLElement): void {
    expect(panel.hidden).toBe(false);
    expect(panel.classList.contains('jpdb-subtitle-tracks-panel')).toBe(true);
    expect(panel.querySelector('.jpdb-subtitle-track-row')?.textContent).toContain('Japanese');
}

function handlePointerActivity(
    controller: SubtitlePlayerController,
    point: Pick<PointerEvent, 'clientX' | 'clientY'> = { clientX: 100, clientY: 100 },
): void {
    controllerInternals<{ handlePointerActivity: (event: Pick<PointerEvent, 'clientX' | 'clientY'>) => void }>(controller)
        .handlePointerActivity(point);
}

function pointerEvent(
    type: string,
    options: Partial<Pick<PointerEvent, 'button' | 'clientX' | 'clientY' | 'pointerId' | 'pointerType'>> = {},
): PointerEvent {
    const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
    Object.defineProperties(event, {
        button: { value: options.button ?? 0 },
        clientX: { value: options.clientX ?? 120 },
        clientY: { value: options.clientY ?? 120 },
        pointerId: { value: options.pointerId ?? 1 },
        pointerType: { value: options.pointerType ?? 'mouse' },
    });
    return event;
}

async function expectSubtitleControlsReturnToIdle(
    controller: SubtitlePlayerController,
    root: HTMLElement,
): Promise<void> {
    expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);

    handlePointerActivity(controller);

    expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(false);

    await vi.advanceTimersByTimeAsync(2600);

    expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void } {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });
    return { promise, resolve, reject };
}

function makeSubtitleToken(
    spelling: string,
    options: {
        cardState?: JPDBToken['card']['cardState'];
        pitchClass?: string;
        reading?: string;
        rubies?: JPDBToken['rubies'];
        vid?: number;
    } = {},
): JPDBToken {
    const reading = options.reading ?? '';
    return {
        card: {
            vid: options.vid ?? 1,
            sid: options.vid ?? 1,
            rid: options.vid ?? 1,
            spelling,
            reading,
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [],
            cardState: options.cardState ?? ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
        },
        start: 0,
        end: spelling.length,
        length: spelling.length,
        rubies: options.rubies ?? [],
        pitchClass: options.pitchClass ?? '',
        sentence: spelling,
    };
}

describe('SubtitlePlayerController', () => {
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

    it('keeps the video rail hidden when tracks exist but no video frame is present', () => {
        const { controller } = createInstalledSubtitleController();
        const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
        controllerInternals<{ tracks: unknown[] }>(controller).tracks = [{ id: 'stale-track' }];

        try {
            controller.refresh();

            expect(root.hidden).toBe(false);
            expect(root.classList.contains('jpdb-subtitle-video-out-of-view')).toBe(true);
            expect(root.classList.contains('jpdb-subtitle-has-video-frame')).toBe(false);
            expect(root.querySelector('.jpdb-subtitle-rail')).not.toBeNull();
            expect(SUBTITLES_YOUTUBE_CSS).toContain('.jpdb-subtitle-player:not(.jpdb-subtitle-has-video-frame) .jpdb-subtitle-rail');
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
        }
    });

    it('shows the remembered transcript placement on the closed rail toggle', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
            subtitleTranscriptPlacement: 'left' as const,
        };
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            onSettingsChange: () => undefined,
        });

        try {
            (controller as unknown as { install: () => void }).install();
            const button = document.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="panel"]')!;
            expect(button.getAttribute('aria-pressed')).toBe('false');
            expect(button.innerHTML).toContain('M10 5v14');
        } finally {
            controller.destroy();
        }
    });

    it('does not mount native subtitle file inputs inside the floating player', () => {
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
        const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);

        try {
            (controller as unknown as { install: () => void; openTracksPanel: () => void }).install();
            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;

            expect(root.querySelector('input[type="file"]')).toBeNull();

            (controller as unknown as { openTracksPanel: () => void }).openTracksPanel();
            document.querySelector<HTMLButtonElement>('.jpdb-subtitle-list [data-action="load"]')!.click();

            const picker = document.querySelector<HTMLInputElement>('input[type="file"]')!;
            expect(root.querySelector('input[type="file"]')).toBeNull();
            expect(picker.style.getPropertyValue('display')).toBe('none');
            expect(picker.style.getPropertyPriority('display')).toBe('important');
            expect(clickSpy).toHaveBeenCalledTimes(1);

            picker.dispatchEvent(new Event('cancel'));
            expect(document.querySelector('input[type="file"]')).toBeNull();
        } finally {
            clickSpy.mockRestore();
            controller.destroy();
        }
    });

    it('opens and closes the transcript drawer from the rail panel toggle', async () => {
        vi.useFakeTimers();
        const onSettingsChange = vi.fn();
        const { settings, controller } = createInstalledSubtitleController({ subtitleTranscriptVisible: false }, { onSettingsChange });

        try {
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

            expect(panel.hidden).toBe(false);
            expect(panel.classList.contains('jpdb-subtitle-panel-closing')).toBe(true);
            expect(root.classList.contains('jpdb-subtitle-panel-open')).toBe(false);
            expect(button.getAttribute('aria-pressed')).toBe('false');
            expect(settings.subtitleTranscriptVisible).toBe(false);
            expect(onSettingsChange).toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(181);

            expect(panel.hidden).toBe(true);
            expect(panel.classList.contains('jpdb-subtitle-panel-closing')).toBe(false);
        } finally {
            controller.destroy();
        }
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

    it('mounts the subtitle overlay in the YouTube CSS fullscreen player on iPad-sized viewports', () => {
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

                    expect(root.parentElement).toBe(player);
                    expect(panel.parentElement).toBe(player);
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

    it('mounts the subtitle overlay in the mobile YouTube fullscreen shell when the video is mounted separately', () => {
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

                    expect(root.parentElement).toBe(player);
                    expect(panel.parentElement).toBe(player);
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

            expect(resizeSpy).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(80);
            expect(resizeSpy).toHaveBeenCalledTimes(2);
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

    it('changes transcript docking from the drawer controls while the rail remains the close control', () => {
        withViewport(1600, 900, () => {
            const onSettingsChange = vi.fn();
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
                onSettingsChange,
            });

            try {
                const video = document.createElement('video');
                document.body.appendChild(video);
                mockElementRect(video, new DOMRect(80, 80, 1040, 585));
                const cue = { start: 0, end: 1, text: '今日は読む。', transcriptEligible: true };
                const internals = controller as unknown as {
                    install: () => void;
                    video: HTMLVideoElement;
                    cues: Array<typeof cue>;
                    currentCue: typeof cue;
                    openLinesPanel: () => void;
                    openTracksPanel: () => void;
                };
                internals.install();
                internals.video = video;
                internals.cues = [cue];
                internals.currentCue = cue;

                internals.openLinesPanel();

                let panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                expect(panel.querySelector('[data-action="close-panel"]')).toBeNull();
                expect(panel.querySelectorAll('[data-action="transcript-placement"][data-placement]')).toHaveLength(3);

                panel.querySelector<HTMLButtonElement>('[data-action="transcript-placement"][data-placement="bottom"]')!.click();

                panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                expect(settings.subtitleTranscriptPlacement).toBe('bottom');
                expect(panel.dataset.transcriptPlacement).toBe('bottom');
                expect(panel.querySelector<HTMLButtonElement>('[data-placement="bottom"]')?.getAttribute('aria-pressed')).toBe('true');

                panel.querySelector<HTMLButtonElement>('[data-action="transcript-placement"][data-placement="right"]')!.click();

                panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                expect(settings.subtitleTranscriptPlacement).toBe('right');
                expect(panel.dataset.transcriptPlacement).toBe('right');
                expect(panel.querySelector<HTMLButtonElement>('[data-placement="right"]')?.getAttribute('aria-pressed')).toBe('true');

                internals.openTracksPanel();
                panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                expect(panel.classList.contains('jpdb-subtitle-tracks-panel')).toBe(true);
                expect(panel.querySelector('[data-action="close-panel"]')).toBeNull();
                expect(panel.querySelectorAll('[data-action="transcript-placement"][data-placement]')).toHaveLength(3);
                expect(onSettingsChange).toHaveBeenCalled();
            } finally {
                controller.destroy();
            }
        });
    });

    it('opens the tracks drawer from the rail panel toggle when lines are unavailable', () => {
        const onSettingsChange = vi.fn();
        const { settings, controller } = createInstalledSubtitleController({ subtitleTranscriptVisible: false }, { onSettingsChange });

        try {
            const video = attachVideo(controller);
            video.dataset.yomuAnimeSearch = 'Sousou.no.Frieren.S01E01.mkv';
            setSingleJapaneseSubtitleTrack(controller);
            controller.refresh();

            const { root, panel, button } = subtitlePanelToggleElements();

            button.click();

            expectJapaneseTracksPanelOpen(panel);
            const jimakuSearch = panel.querySelector<HTMLAnchorElement>('[data-jimaku-anime-search]')!;
            expect(jimakuSearch.textContent).toBe('Search anime subtitles');
            expect(jimakuSearch.href).toBe('https://jimaku.cc/opensearch/redirect?anime=true&query=Sousou%20no%20Frieren%20S01E01');
            expect(jimakuSearch.target).toBe('_blank');
            expect(jimakuSearch.rel).toContain('noopener');
            expect(panel.querySelector<HTMLButtonElement>('[data-action="panel-tracks"]')?.getAttribute('aria-pressed')).toBe('true');
            expect(panel.querySelector<HTMLButtonElement>('[data-action="panel-lines"]')?.disabled).toBe(true);
            expect(root.classList.contains('jpdb-subtitle-panel-open')).toBe(true);
            expect(settings.subtitleTranscriptVisible).toBe(false);
            expect(onSettingsChange).toHaveBeenCalled();
        } finally {
            controller.destroy();
        }
    });

    it('opens the transcript while paused without changing the saved default', async () => {
        vi.useFakeTimers();
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
            subtitlePausePanel: true,
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
            Object.defineProperties(video, {
                paused: { configurable: true, value: true },
                ended: { configurable: true, value: false },
            });
            const cue = { start: 0, end: 2, text: '一時停止した行。', transcriptEligible: true };
            const internals = controller as unknown as {
                video: HTMLVideoElement;
                cues: Array<typeof cue>;
                currentCue: typeof cue;
            };
            internals.video = video;
            internals.cues = [cue];
            internals.currentCue = cue;

            controller.refresh();

            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            expect(panel.hidden).toBe(false);
            expect(panel.classList.contains('jpdb-subtitle-tracks-panel')).toBe(false);
            expect(panel.textContent).toContain('一時停止した行');
            expect(settings.subtitleTranscriptVisible).toBe(false);
            expect(onSettingsChange).not.toHaveBeenCalled();

            Object.defineProperty(video, 'paused', { configurable: true, value: false });
            controller.refresh();

            expect(panel.hidden).toBe(false);
            expect(panel.classList.contains('jpdb-subtitle-panel-closing')).toBe(true);
            await vi.advanceTimersByTimeAsync(181);
            expect(panel.hidden).toBe(true);
            expect(settings.subtitleTranscriptVisible).toBe(false);
            expect(onSettingsChange).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
        }
    });

    it('shows the pause-opened transcript immediately and defers the full row render', async () => {
        vi.useFakeTimers();
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
            subtitlePausePanel: true,
            subtitleTranscriptVisible: false,
        };
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            onSettingsChange: vi.fn(),
        });

        try {
            (controller as unknown as { install: () => void }).install();
            vi.stubGlobal('ResizeObserver', class {
                observe(): void {}
                disconnect(): void {}
            });
            const video = document.createElement('video');
            let paused = false;
            Object.defineProperties(video, {
                paused: { configurable: true, get: () => paused },
                ended: { configurable: true, value: false },
            });
            const cues = Array.from({ length: 5 }, (_, index) => ({
                start: index,
                end: index + 0.8,
                text: `一時停止した行${index}`,
                transcriptEligible: true,
            }));
            const internals = controller as unknown as {
                video: HTMLVideoElement;
                cues: typeof cues;
                currentCue: typeof cues[number];
                observeVideoLayout: (video: HTMLVideoElement) => void;
            };
            internals.video = video;
            internals.cues = cues;
            internals.currentCue = cues[2];
            internals.observeVideoLayout(video);

            paused = true;
            video.dispatchEvent(new Event('pause'));

            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            expect(panel.hidden).toBe(false);
            expect(panel.querySelectorAll('.jpdb-subtitle-list-row')).toHaveLength(3);
            expect(panel.textContent).toContain('一時停止した行2');

            await vi.advanceTimersByTimeAsync(20);
            expect(panel.querySelectorAll('.jpdb-subtitle-list-row')).toHaveLength(3);

            await vi.advanceTimersByTimeAsync(500);
            await vi.advanceTimersByTimeAsync(0);

            expect(panel.querySelectorAll('.jpdb-subtitle-list-row')).toHaveLength(5);
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
        }
    });

    it('virtualizes long transcript drawers instead of mounting every row', () => {
        const cues = Array.from({ length: 300 }, (_, index) => ({
            start: index,
            end: index + 0.8,
            text: `長い字幕${index}`,
            transcriptEligible: true,
        }));
        const { controller, internals } = setupTranscriptCueController(cues);

        try {
            internals.openLinesPanel();

            const scroller = document.querySelector<HTMLElement>('.jpdb-subtitle-list-scroll')!;
            const rows = Array.from(scroller.querySelectorAll<HTMLElement>('.jpdb-subtitle-list-row'));
            expect(scroller.dataset.virtualized).toBe('true');
            expect(scroller.dataset.totalRows).toBe('300');
            expect(rows).toHaveLength(48);
            expect(rows[0]?.dataset.rowIndex).toBe('0');
            expect(rows.at(-1)?.dataset.rowIndex).toBe('47');
            expect(scroller.querySelector<HTMLElement>('.jpdb-subtitle-list-spacer')?.style.height).toBe('20160px');
        } finally {
            controller.destroy();
        }
    });

    it('keeps an explicitly closed pause panel closed until the video plays again', async () => {
        vi.useFakeTimers();
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
            subtitlePausePanel: true,
            subtitleTranscriptVisible: false,
        };
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            onSettingsChange: vi.fn(),
        });

        try {
            (controller as unknown as { install: () => void }).install();
            const video = document.createElement('video');
            let paused = true;
            Object.defineProperties(video, {
                paused: { configurable: true, get: () => paused },
                ended: { configurable: true, value: false },
            });
            const cue = { start: 0, end: 2, text: '一時停止した行。', transcriptEligible: true };
            const internals = controller as unknown as { video: HTMLVideoElement; cues: Array<typeof cue>; currentCue: typeof cue };
            internals.video = video;
            internals.cues = [cue];
            internals.currentCue = cue;

            controller.refresh();
            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            expect(panel.hidden).toBe(false);

            // User explicitly closes while still paused.
            document.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="panel"]')!.click();
            await vi.advanceTimersByTimeAsync(181);
            expect(panel.hidden).toBe(true);

            // A pause-driven sync must not reopen what the user just closed.
            controller.refresh();
            expect(panel.hidden).toBe(true);
            (controller as unknown as { syncPauseTranscriptPanel: () => void }).syncPauseTranscriptPanel();
            expect(panel.hidden).toBe(true);
        } finally {
            controller.destroy();
        }
    });

    it('exposes auto-hide in the drawer header and uses it as the close-on-play mode', async () => {
        vi.useFakeTimers();
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
            subtitlePausePanel: false,
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
            Object.defineProperties(video, {
                paused: { configurable: true, value: false },
                ended: { configurable: true, value: false },
            });
            const cue = { start: 0, end: 2, text: '自動で隠す。', transcriptEligible: true };
            const internals = controller as unknown as {
                video: HTMLVideoElement;
                cues: Array<typeof cue>;
                currentCue: typeof cue;
                openLinesPanel: () => void;
                observeVideoLayout: (video: HTMLVideoElement) => void;
            };
            internals.video = video;
            internals.cues = [cue];
            internals.currentCue = cue;
            vi.stubGlobal('ResizeObserver', class {
                observe(): void {}
                disconnect(): void {}
            });
            internals.observeVideoLayout(video);

            internals.openLinesPanel();

            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            const autoButton = panel.querySelector<HTMLButtonElement>('[data-action="toggle-pause-panel"]')!;
            expect(autoButton).toBeTruthy();
            expect(autoButton.textContent).toContain('Auto');
            expect(autoButton.getAttribute('aria-pressed')).toBe('false');
            expect(autoButton.getAttribute('aria-label')).toBe('Auto-hide panel while playing');
            expect(panel.querySelector('[data-action="close-panel"]')).toBeNull();
            expect(panel.querySelectorAll('[data-action="transcript-placement"][data-placement]')).toHaveLength(3);

            autoButton.click();

            expect(settings.subtitlePausePanel).toBe(true);
            expect(settings.subtitleTranscriptVisible).toBe(false);
            expect(panel.hidden).toBe(false);
            expect(panel.classList.contains('jpdb-subtitle-panel-closing')).toBe(true);
            await vi.advanceTimersByTimeAsync(181);
            expect(panel.hidden).toBe(true);
            expect(onSettingsChange).toHaveBeenCalled();

            Object.defineProperty(video, 'paused', { configurable: true, value: true });
            controller.refresh();

            const reopenedButton = panel.querySelector<HTMLButtonElement>('[data-action="toggle-pause-panel"]')!;
            expect(panel.hidden).toBe(false);
            expect(panel.classList.contains('jpdb-subtitle-lines-panel')).toBe(true);
            expect(panel.textContent).toContain('自動で隠す');
            expect(reopenedButton.getAttribute('aria-pressed')).toBe('true');
            expect(reopenedButton.getAttribute('aria-label')).toBe('Keep panel open while playing');

            Object.defineProperty(video, 'paused', { configurable: true, value: false });
            video.dispatchEvent(new Event('playing'));
            await vi.advanceTimersByTimeAsync(16);
            await vi.advanceTimersByTimeAsync(0);
            await vi.advanceTimersByTimeAsync(181);
            expect(panel.hidden).toBe(true);
        } finally {
            controller.destroy();
        }
    });

    it('keeps auto-hide active after switching the pause-opened drawer to tracks', async () => {
        vi.useFakeTimers();
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
            subtitlePausePanel: true,
            subtitleTranscriptVisible: false,
        };
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            onSettingsChange: () => undefined,
        });

        try {
            (controller as unknown as { install: () => void }).install();
            vi.stubGlobal('ResizeObserver', class {
                observe(): void {}
                disconnect(): void {}
            });
            const video = document.createElement('video');
            let paused = true;
            Object.defineProperties(video, {
                paused: { configurable: true, get: () => paused },
                ended: { configurable: true, value: false },
            });
            const cue = { start: 0, end: 2, text: '一時停止中。', transcriptEligible: true };
            const internals = controller as unknown as {
                video: HTMLVideoElement;
                cues: Array<typeof cue>;
                currentCue: typeof cue;
                observeVideoLayout: (video: HTMLVideoElement) => void;
                openTracksPanel: () => void;
            };
            internals.video = video;
            internals.cues = [cue];
            internals.currentCue = cue;
            internals.observeVideoLayout(video);

            controller.refresh();

            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            expect(panel.hidden).toBe(false);
            expect(panel.classList.contains('jpdb-subtitle-lines-panel')).toBe(true);

            internals.openTracksPanel();

            expect(panel.hidden).toBe(false);
            expect(panel.classList.contains('jpdb-subtitle-tracks-panel')).toBe(true);

            paused = false;
            video.dispatchEvent(new Event('play'));

            // The pause-panel sync is deferred past the next paint so play/pause
            // stays responsive; flush the rAF + timeout before asserting.
            await vi.advanceTimersByTimeAsync(20);
            expect(panel.classList.contains('jpdb-subtitle-panel-closing')).toBe(true);
            await vi.advanceTimersByTimeAsync(181);
            expect(panel.hidden).toBe(true);
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
        }
    });

    it('opens the tracks drawer from the hosted video page subtitle button event', () => {
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
            controller.init();
            (controller as unknown as { tracks: unknown[] }).tracks = [{
                id: 'file-ja',
                kind: 'file',
                label: 'Japanese file',
                language: 'ja',
                cues: [],
            }];

            window.dispatchEvent(new CustomEvent(OPEN_SUBTITLE_TRACKS_EVENT));

            const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
            expect(panel.hidden).toBe(false);
            expect(panel.classList.contains('jpdb-subtitle-tracks-panel')).toBe(true);
            expect(panel.querySelector('.jpdb-subtitle-track-row')?.textContent).toContain('Japanese file');
            expect(settings.subtitleTranscriptVisible).toBe(false);
            expect(onSettingsChange).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
        }
    });

    it('keeps the YouTube side panel toggle available when tracks arrive before the video wrapper settles', () => {
        const originalLocation = window.location;
        const onSettingsChange = vi.fn();
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });
        const { controller } = createInstalledSubtitleController({ subtitleTranscriptVisible: false }, { onSettingsChange });

        try {
            setSingleJapaneseSubtitleTrack(controller);
            controller.refresh();

            const { root, panel, button } = subtitlePanelToggleElements();

            expect(root.hidden).toBe(false);
            expect(button.disabled).toBe(false);

            button.click();

            expectJapaneseTracksPanelOpen(panel);
            expect(onSettingsChange).toHaveBeenCalled();
        } finally {
            controller.destroy();
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('returns compact subtitle controls to idle after pointer activity over video', async () => {
        vi.useFakeTimers();
        const { controller, root } = setupInstalledVideoController(new DOMRect(0, 0, 1920, 1080));

        try {
            await expectSubtitleControlsReturnToIdle(controller, root);
        } finally {
            controller.destroy();
        }
    });

    it('returns subtitle controls to idle on coarse pointer devices', async () => {
        vi.useFakeTimers();
        await withMatchMedia(query => query === '(pointer: coarse)', async () => {
            const { controller, root } = setupInstalledVideoController(new DOMRect(0, 0, 390, 240));

            try {
                await expectSubtitleControlsReturnToIdle(controller, root);
            } finally {
                controller.destroy();
            }
        });
    });

    it('temporarily moves subtitle overlay only while dragging the move handle', () => {
        const cue = { start: 0, end: 2, text: '今日は読む。', transcriptEligible: true };
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        try {
            attachVideo(controller, { rect: new DOMRect(0, 0, 640, 360) });
            const internals = controllerInternals<{
                clearTransientSubtitleState(): void;
                cues: Array<typeof cue>;
                currentCue: typeof cue;
            }>(controller);
            internals.cues = [cue];
            internals.currentCue = cue;
            controller.refresh();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const subtitleFrame = document.querySelector<HTMLElement>('.jpdb-subtitle-text')!;
            const handle = document.querySelector<HTMLButtonElement>('[data-subtitle-drag-handle]')!;
            mockElementRect(subtitleFrame, new DOMRect(16, 220, 608, 72));

            handle.dispatchEvent(pointerEvent('pointerdown', { clientY: 300, pointerId: 7 }));
            window.dispatchEvent(pointerEvent('pointermove', { clientY: 260, pointerId: 7 }));

            expect(root.style.getPropertyValue('--subtitle-drag-offset-y')).toBe('-40px');
            expect(root.classList.contains('jpdb-subtitle-dragging')).toBe(true);

            window.dispatchEvent(pointerEvent('pointerup', { clientY: 260, pointerId: 7 }));
            expect(root.classList.contains('jpdb-subtitle-dragging')).toBe(false);

            internals.clearTransientSubtitleState();
            expect(root.style.getPropertyValue('--subtitle-drag-offset-y')).toBe('0px');
        } finally {
            controller.destroy();
        }
    });

    it('does not move subtitle overlay from ordinary subtitle text pointer activity', () => {
        const cue = { start: 0, end: 2, text: '今日は読む。', transcriptEligible: true };
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        try {
            attachVideo(controller, { rect: new DOMRect(0, 0, 640, 360) });
            const internals = controllerInternals<{
                cues: Array<typeof cue>;
                currentCue: typeof cue;
            }>(controller);
            internals.cues = [cue];
            internals.currentCue = cue;
            controller.refresh();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const subtitleFrame = document.querySelector<HTMLElement>('.jpdb-subtitle-text')!;
            mockElementRect(subtitleFrame, new DOMRect(16, 220, 608, 72));

            subtitleFrame.dispatchEvent(pointerEvent('pointerdown', { clientY: 300, pointerId: 3 }));
            window.dispatchEvent(pointerEvent('pointermove', { clientY: 260, pointerId: 3 }));
            window.dispatchEvent(pointerEvent('pointerup', { clientY: 260, pointerId: 3 }));

            expect(root.style.getPropertyValue('--subtitle-drag-offset-y')).toBe('0px');
            expect(root.classList.contains('jpdb-subtitle-dragging')).toBe(false);
        } finally {
            controller.destroy();
        }
    });

    it('temporarily moves subtitle overlay from mouse drag when pointer events are not delivered', () => {
        const cue = { start: 0, end: 2, text: '今日は読む。', transcriptEligible: true };
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        try {
            attachVideo(controller, { rect: new DOMRect(0, 0, 640, 360) });
            const internals = controllerInternals<{
                cues: Array<typeof cue>;
                currentCue: typeof cue;
            }>(controller);
            internals.cues = [cue];
            internals.currentCue = cue;
            controller.refresh();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const subtitleFrame = document.querySelector<HTMLElement>('.jpdb-subtitle-text')!;
            const handle = document.querySelector<HTMLButtonElement>('[data-subtitle-drag-handle]')!;
            mockElementRect(subtitleFrame, new DOMRect(16, 220, 608, 72));

            handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientY: 300 }));
            window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientY: 260 }));

            expect(root.style.getPropertyValue('--subtitle-drag-offset-y')).toBe('-40px');
            expect(root.classList.contains('jpdb-subtitle-dragging')).toBe(true);

            window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientY: 260 }));
            expect(root.classList.contains('jpdb-subtitle-dragging')).toBe(false);
        } finally {
            controller.destroy();
        }
    });

    it('temporarily moves ASBPlayer subtitle overlays only from the inserted move handle', () => {
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        try {
            attachVideo(controller, { rect: new DOMRect(0, 0, 640, 360) });
            document.body.insertAdjacentHTML('beforeend', `
                <div class="asbplayer-subtitles-container-bottom" style="transform: translateX(-50%)">
                    <span class="jpdb-reader-word">今日は読む。</span>
                </div>
            `);
            const internals = controllerInternals<{ clearTransientSubtitleState(): void }>(controller);
            const asbRoot = document.querySelector<HTMLElement>('.asbplayer-subtitles-container-bottom')!;
            mockElementRect(asbRoot, new DOMRect(80, 260, 480, 64));

            controller.refresh();

            const handle = asbRoot.querySelector<HTMLButtonElement>('[data-yomu-asb-subtitle-drag-handle="true"]')!;
            expect(handle).not.toBeNull();
            expect(asbRoot.classList.contains('jpdb-subtitle-asb-movable')).toBe(true);
            expect(asbRoot.style.getPropertyValue('--jpdb-subtitle-asb-base-transform')).not.toBe('');

            handle.dispatchEvent(pointerEvent('pointerdown', { clientY: 300, pointerId: 11 }));
            window.dispatchEvent(pointerEvent('pointermove', { clientY: 260, pointerId: 11 }));

            expect(asbRoot.style.getPropertyValue('--jpdb-subtitle-asb-drag-offset-y')).toBe('-40px');
            expect(asbRoot.classList.contains('jpdb-subtitle-dragging')).toBe(true);

            window.dispatchEvent(pointerEvent('pointerup', { clientY: 260, pointerId: 11 }));
            expect(asbRoot.classList.contains('jpdb-subtitle-dragging')).toBe(false);

            internals.clearTransientSubtitleState();
            expect(asbRoot.style.getPropertyValue('--jpdb-subtitle-asb-drag-offset-y')).toBe('0px');
        } finally {
            controller.destroy();
        }
    });

    it('skips the document-wide drag-handle scan each tick when no asbplayer overlay exists', () => {
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        try {
            const internals = controllerInternals<{ syncAsbPlayerSubtitleMoveHandles: () => void }>(controller);
            const querySpy = vi.spyOn(document, 'querySelectorAll');

            // No .asbplayer-subtitles-container-bottom in the DOM: the per-tick
            // sync must do at most the single roots probe, never the extra
            // document-wide handle-cleanup scan (regression v0.6.176 ran both
            // every ~250ms on every video on every site).
            internals.syncAsbPlayerSubtitleMoveHandles();

            const handleScans = querySpy.mock.calls
                .filter(call => String(call[0]).includes('yomu-asb-subtitle-drag-handle'));
            expect(handleScans).toHaveLength(0);
            querySpy.mockRestore();
        } finally {
            controller.destroy();
        }
    });

    it('does not move ASBPlayer subtitle overlays from ordinary subtitle text pointer activity', () => {
        const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
        try {
            attachVideo(controller, { rect: new DOMRect(0, 0, 640, 360) });
            document.body.insertAdjacentHTML('beforeend', `
                <div class="asbplayer-subtitles-container-bottom">
                    <span>今日は読む。</span>
                </div>
            `);
            const asbRoot = document.querySelector<HTMLElement>('.asbplayer-subtitles-container-bottom')!;
            const asbText = asbRoot.querySelector<HTMLElement>('span')!;
            mockElementRect(asbRoot, new DOMRect(80, 260, 480, 64));

            controller.refresh();
            asbText.dispatchEvent(pointerEvent('pointerdown', { clientY: 300, pointerId: 12 }));
            window.dispatchEvent(pointerEvent('pointermove', { clientY: 260, pointerId: 12 }));
            window.dispatchEvent(pointerEvent('pointerup', { clientY: 260, pointerId: 12 }));

            expect(asbRoot.style.getPropertyValue('--jpdb-subtitle-asb-drag-offset-y')).toBe('0px');
            expect(asbRoot.classList.contains('jpdb-subtitle-dragging')).toBe(false);
        } finally {
            controller.destroy();
        }
    });

    it('keeps subtitle controls idle when YouTube player chrome is autohidden', () => {
        let controller: SubtitlePlayerController | undefined;
        try {
            document.body.innerHTML = '<div id="movie_player" class="html5-video-player ytp-autohide"><video></video></div>';
            controller = createInstalledSubtitleController().controller;
            const player = document.querySelector<HTMLElement>('#movie_player')!;
            const video = document.querySelector<HTMLVideoElement>('video')!;
            attachVideo(controller, { video, rect: new DOMRect(0, 0, 640, 360) });
            controller.refresh();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);

            handlePointerActivity(controller);

            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);

            player.classList.remove('ytp-autohide');
            handlePointerActivity(controller);

            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(false);
        } finally {
            controller?.destroy();
        }
    });

    it('keeps the rail in lockstep with the mobile player chrome, blurring sticky tapped buttons', () => {
        let controller: SubtitlePlayerController | undefined;
        try {
            document.body.innerHTML = '<div id="player-control-overlay" class="fadein"><video></video></div>';
            controller = createInstalledSubtitleController().controller;
            const overlay = document.querySelector<HTMLElement>('#player-control-overlay')!;
            const video = document.querySelector<HTMLVideoElement>('video')!;
            attachVideo(controller, { video, rect: new DOMRect(0, 0, 390, 220) });
            controller.refresh();

            const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
            const internals = controllerInternals<{ syncPlayerChromeIdleState: () => void }>(controller);

            // A mobile tap leaves the rail button focused; without the blur
            // the sticky :focus-within would block idling forever.
            const railButton = root.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail button')!;
            railButton.focus();

            overlay.classList.remove('fadein');
            internals.syncPlayerChromeIdleState();
            expect(document.activeElement).not.toBe(railButton);
            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);

            // Chrome fades back in (viewer tapped the video): the rail returns
            // alongside the player's own controls.
            overlay.classList.add('fadein');
            internals.syncPlayerChromeIdleState();
            expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(false);
        } finally {
            controller?.destroy();
        }
    });

    it('lets video rail controls auto-hide while the transcript panel is open', async () => {
        vi.useFakeTimers();
        const { controller, root } = setupInstalledVideoController(new DOMRect(0, 72, 960, 540));

        try {
            const internals = controllerInternals<{
                cues: Array<{ start: number; end: number; text: string; transcriptEligible: boolean }>;
                openLinesPanel: () => void;
            }>(controller);
            internals.cues = [
                { start: 0, end: 1, text: '一番', transcriptEligible: true },
                { start: 1, end: 2, text: '二番', transcriptEligible: true },
            ];

            internals.openLinesPanel();

            expect(document.querySelector<HTMLElement>('.jpdb-subtitle-list')?.hidden).toBe(false);
            expect(root.classList.contains('jpdb-subtitle-panel-open')).toBe(true);

            await expectSubtitleControlsReturnToIdle(controller, root);
        } finally {
            controller.destroy();
        }
    });

    it('selects the most visible video in scroll feeds instead of an offscreen earlier video', () => {
        withViewport(1000, 800, () => {
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: '',
                localDictionariesEnabled: false,
            };
            document.body.innerHTML = '<video id="old-short"></video><video id="current-short"></video>';
            const oldShort = document.querySelector<HTMLVideoElement>('#old-short')!;
            const currentShort = document.querySelector<HTMLVideoElement>('#current-short')!;
            for (const video of [oldShort, currentShort]) {
                Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
            }
            mockElementRect(oldShort, new DOMRect(200, -700, 600, 600));
            mockElementRect(currentShort, new DOMRect(200, 80, 600, 600));
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese: async () => [],
                onSettingsChange: () => undefined,
            });

            try {
                const candidate = (controller as unknown as { discoverVideoCandidate: () => HTMLVideoElement | undefined }).discoverVideoCandidate();

                expect(candidate).toBe(currentShort);
            } finally {
                controller.destroy();
            }
        });
    });

    it('hides the rail and subtitles while the selected video is mostly out of view', () => {
        withViewport(1000, 800, () => {
            const { controller, root, video } = setupInstalledVideoController(
                new DOMRect(140, -520, 720, 600),
                { subtitleOverlayVisible: true },
            );
            const internals = controllerInternals<{ alignToVideo: () => void }>(controller);

            try {
                internals.alignToVideo();

                expect(root.classList.contains('jpdb-subtitle-video-out-of-view')).toBe(true);

                mockElementRect(video, new DOMRect(140, 80, 720, 600));
                internals.alignToVideo();

                expect(root.classList.contains('jpdb-subtitle-video-out-of-view')).toBe(false);
            } finally {
                controller.destroy();
            }
        });
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

    it('hides the whole subtitle rail while compact navigation idles', () => {
        expect(SUBTITLES_YOUTUBE_CSS)
            .toContain('.jpdb-subtitle-controls-auto.jpdb-subtitle-controls-idle:not(.jpdb-subtitle-panel-open) .jpdb-subtitle-rail:not(:hover):not(:focus-within) {\n  opacity: 0;\n  pointer-events: none;\n  transform: translateY(-4px);\n}');
        expect(SUBTITLES_YOUTUBE_CSS)
            .not.toContain('.jpdb-subtitle-controls-auto.jpdb-subtitle-controls-idle:not(.jpdb-subtitle-panel-open) .jpdb-subtitle-rail:not(:hover):not(:focus-within) button[data-action="previous"],');
    });

    it('keeps the secondary subtitle line on the primary subtitle font', () => {
        const normalizedCss = SUBTITLES_YOUTUBE_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss)
            .toContain('.jpdb-subtitle-secondary { --jpdb-subtitle-secondary-color: var(--jpdb-reader-video-text-muted); display: block; width: fit-content; max-width: 100%;');
        expect(normalizedCss)
            .toContain('font: var(--subtitle-weight) .62em/1.25 var(--subtitle-family);');
    });

    it('reveals blurred secondary subtitles without the mobile-expensive CSS filter', () => {
        const normalizedCss = SUBTITLES_YOUTUBE_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss).toContain('.jpdb-subtitle-secondary-blurred { color: transparent !important; -webkit-text-fill-color: transparent; text-shadow: 0 0 6px var(--jpdb-subtitle-secondary-color), 0 0 9px var(--jpdb-reader-video-shadow-heavy); opacity: .82; }');
        expect(normalizedCss).toContain('.jpdb-subtitle-secondary-blurred:hover, .jpdb-subtitle-secondary-blurred:focus-visible { color: var(--jpdb-subtitle-secondary-color) !important; -webkit-text-fill-color: var(--jpdb-subtitle-secondary-color);');
        expect(normalizedCss).not.toContain('filter: blur(5px);');
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

    it('hides idle subtitle rails on touch screens instead of keeping them pinned at 72% opacity', () => {
        const normalizedCss = SUBTITLES_YOUTUBE_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss).toContain('@media (max-width: 768px), (pointer: coarse) {');
        expect(normalizedCss).toContain('.jpdb-subtitle-rail button::after { content: ""; position: absolute; inset: -5px; border-radius: 9px; }');
        expect(normalizedCss).toContain('.jpdb-subtitle-rail button { padding: 0; font-size: 11px; touch-action: manipulation; }');
        // The old coarse-pointer/compact "always discoverable" overrides kept
        // the rail visible during playback even while the player chrome was
        // hidden; the rail now follows the player chrome (lockstep tick) and
        // idles to hidden everywhere.
        expect(normalizedCss).not.toContain('opacity: 0.72; pointer-events: auto; transform: none;');
        expect(normalizedCss).not.toContain('opacity: .72; pointer-events: auto; transform: none;');
    });

    it('ignores sticky tap hover/focus when hiding the idle rail on hoverless devices', () => {
        const normalizedCss = SUBTITLES_YOUTUBE_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss).toContain('@media (hover: none) {');
        expect(normalizedCss).toContain('.jpdb-subtitle-controls-auto.jpdb-subtitle-controls-idle:not(.jpdb-subtitle-panel-open) .jpdb-subtitle-rail { opacity: 0; pointer-events: none; transform: translateY(-4px); }');
    });

    it('hides the whole subtitle rail when subtitle controls are hidden', () => {
        expect(SUBTITLES_YOUTUBE_CSS)
            .toContain('.jpdb-subtitle-controls-hidden .jpdb-subtitle-rail {\n  opacity: 0;\n  pointer-events: none;\n  transform: translateY(-4px);\n}');
        expect(SUBTITLES_YOUTUBE_CSS)
            .not.toContain('.jpdb-subtitle-controls-hidden .jpdb-subtitle-rail button[data-action="previous"],');
    });

    it('keeps the subtitle move handle draggable on touch without painting a default shadow', () => {
        const normalizedCss = SUBTITLES_YOUTUBE_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss).toContain('.jpdb-subtitle-drag-handle { position: absolute;');
        expect(normalizedCss).toContain('max-height: min(45%, calc(100% - 24px)); overflow: visible; pointer-events: none;');
        expect(normalizedCss).toContain('.jpdb-subtitle-lines { min-height: 1.36em; max-height: inherit; overflow: visible; pointer-events: none; }');
        expect(normalizedCss).toContain('.jpdb-subtitle-player.jpdb-subtitle-has-lines:not(.jpdb-subtitle-hidden):not(.jpdb-subtitle-controls-idle) .jpdb-subtitle-drag-handle,');
        expect(normalizedCss).toContain('opacity: .7; pointer-events: auto;');
        expect(normalizedCss).toContain('box-shadow: none;');
        expect(normalizedCss).toContain('touch-action: none;');
        expect(normalizedCss).toContain('transform: translateY(var(--jpdb-subtitle-asb-drag-offset-y)) var(--jpdb-subtitle-asb-base-transform, translateZ(0));');
        expect(normalizedCss).toContain('.jpdb-subtitle-player.jpdb-subtitle-has-lines:not(.jpdb-subtitle-hidden) .jpdb-subtitle-drag-handle:is(:hover, :focus-visible, .jpdb-subtitle-dragging)');
        expect(normalizedCss).toContain('box-shadow: 0 8px 20px var(--jpdb-reader-video-shadow);');
    });

    it('keeps parsed transcript rows wrapable when long Shorts cues contain ruby markup', () => {
        const normalizedCss = SUBTITLES_YOUTUBE_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss).toContain('.jpdb-subtitle-row-text { display: block; min-width: 0; width: 100%; max-width: 100%;');
        expect(normalizedCss).toContain('.jpdb-subtitle-list-row { display: grid;');
        expect(normalizedCss).toContain('transition: background-color 160ms ease, box-shadow 160ms ease, border-color 160ms ease;');
        expect(normalizedCss).toContain('.jpdb-subtitle-row-text .jpdb-reader-word { --jpdb-reader-subtitle-fallback: var(--jpdb-reader-text);');
        expect(normalizedCss).toContain('display: inline !important;');
        expect(normalizedCss).toContain('.jpdb-subtitle-row-text .jpdb-reader-word::after { content: none; }');
        expect(normalizedCss).toContain('.jpdb-subtitle-row-text :is(ruby, rt, .jpdb-reader-furi, .jpdb-reader-ruby-base) { max-width: 100%; white-space: normal !important; overflow-wrap: anywhere; word-break: break-word; }');
    });

    it('keeps the transcript panel available in fullscreen', () => {
        const normalizedCss = SUBTITLES_YOUTUBE_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss).not.toContain('html.jpdb-subtitle-fullscreen .jpdb-subtitle-list');
        expect(normalizedCss).toContain('html.jpdb-subtitle-fullscreen .jpdb-reader-fab { display: none !important; }');
    });

    it('does not default live subtitle status colors to blue without a real status source', () => {
        const normalizedCss = SUBTITLES_YOUTUBE_CSS.replace(/\s+/g, ' ');

        expect(SUBTITLES_YOUTUBE_CSS)
            .toContain('--jpdb-reader-subtitle-status-color: var(--jpdb-reader-status-color, transparent);');
        expect(SUBTITLES_YOUTUBE_CSS)
            .toContain('--jpdb-reader-subtitle-jpdb-color: var(--jpdb-reader-jpdb-color, transparent);');
        expect(SUBTITLES_YOUTUBE_CSS)
            .toContain('--jpdb-reader-subtitle-anki-color: var(--jpdb-reader-anki-color, transparent);');
        expect(SUBTITLES_YOUTUBE_CSS)
            .not.toContain('--jpdb-reader-subtitle-anki-color: var(--jpdb-reader-anki-color, var(--jpdb-reader-state-new));');
        expect(normalizedCss)
            .toContain('.jpdb-reader-subtitle-highlight-pitch :is(.jpdb-subtitle-primary, .jpdb-subtitle-row-text, .jpdb-reader-subtitle-surface, .asbplayer-subtitles-container-bottom) .jpdb-reader-word:is(.jpdb-pitch-heiban, .jpdb-pitch-atamadaka, .jpdb-pitch-nakadaka, .jpdb-pitch-odaka, .jpdb-pitch-kifuku)');
        expect(normalizedCss)
            .not.toContain('.jpdb-reader-subtitle-highlight-pitch :is(.jpdb-subtitle-primary, .jpdb-subtitle-row-text, .jpdb-reader-subtitle-surface, .asbplayer-subtitles-container-bottom) .jpdb-reader-word { --jpdb-reader-subtitle-highlight');
        expect(normalizedCss)
            .toContain('--jpdb-reader-word-highlight-paint: var(--jpdb-reader-subtitle-highlight, transparent);');
        expect(normalizedCss)
            .toContain('background-image: linear-gradient(var(--jpdb-reader-word-highlight-paint), var(--jpdb-reader-word-highlight-paint)) !important;');
        expect(normalizedCss)
            .toContain('background-size: var(--jpdb-reader-word-highlight-size) 100% !important;');
        expect(normalizedCss)
            .not.toContain('background: var(--jpdb-reader-subtitle-highlight, var(--jpdb-reader-subtitle-highlight-default)) !important;');
    });

    it('keeps ASBPlayer subtitle words out of Yomu underline color channels', () => {
        const normalizedCss = SUBTITLES_YOUTUBE_CSS.replace(/\s+/g, ' ');
        const yomuSurfaces = ':is(.jpdb-subtitle-primary, .jpdb-subtitle-row-text, .jpdb-reader-subtitle-surface)';
        const asbSurfaces = ':is(.jpdb-subtitle-primary, .jpdb-subtitle-row-text, .jpdb-reader-subtitle-surface, .asbplayer-subtitles-container-bottom)';

        expect(normalizedCss)
            .toContain(`.jpdb-reader-subtitle-underline-jpdb ${yomuSurfaces} .jpdb-reader-word { --jpdb-reader-word-underline: var(--jpdb-reader-subtitle-jpdb-decoration); }`);
        expect(normalizedCss)
            .toContain(`:is(.jpdb-reader-subtitle-underline-status, .jpdb-reader-subtitle-underline-jpdb, .jpdb-reader-subtitle-underline-anki, .jpdb-reader-subtitle-underline-pitch) ${yomuSurfaces} .jpdb-reader-word { text-decoration-line: none !important; }`);
        for (const source of ['status', 'jpdb', 'anki', 'pitch']) {
            expect(normalizedCss)
                .not.toContain(`.jpdb-reader-subtitle-underline-${source} ${asbSurfaces}`);
        }
        expect(normalizedCss)
            .not.toContain(`:is(.jpdb-reader-subtitle-underline-status, .jpdb-reader-subtitle-underline-jpdb, .jpdb-reader-subtitle-underline-anki, .jpdb-reader-subtitle-underline-pitch) ${asbSurfaces}`);
        expect(normalizedCss)
            .toContain(`.jpdb-reader-subtitle-text-jpdb ${asbSurfaces} .jpdb-reader-word { --jpdb-reader-subtitle-text: var(--jpdb-reader-subtitle-jpdb-text); }`);
        expect(normalizedCss)
            .toContain(`.jpdb-reader-subtitle-highlight-jpdb ${asbSurfaces} .jpdb-reader-word { --jpdb-reader-subtitle-highlight: var(--jpdb-reader-subtitle-source-jpdb-soft, var(--jpdb-reader-source-jpdb-soft, var(--jpdb-reader-subtitle-highlight-default))); }`);
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
            parsedHtmlCache: Map<string, string>;
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
            internals.parsedHtmlCache.set(
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

        expect(readPageCaptionText(video, readerRoot, { allowNonJapanese: true })).toBe('');
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

        expect(readPageCaptionText(video, undefined, { allowNonJapanese: true })).toBe('');
    });

    it('detects Japanese page captions near a video without site-specific selectors', () => {
        document.body.innerHTML = '<video></video><div class="lesson-player"><span>今日は花を見ます。</span></div>';
        const video = document.querySelector('video') as HTMLVideoElement;
        const caption = document.querySelector('span') as HTMLElement;
        Object.defineProperty(video, 'getBoundingClientRect', {
            value: () => ({ left: 100, right: 740, top: 80, bottom: 440, width: 640, height: 360 }),
        });
        Object.defineProperty(caption, 'getBoundingClientRect', {
            value: () => ({ left: 180, right: 660, top: 380, bottom: 420, width: 480, height: 40 }),
        });

        expect(readPageCaptionText(video)).toBe('今日は花を見ます。');
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

    it('allows non-Japanese page captions only when a real selected caption track asks for them', () => {
        document.body.innerHTML = '<video></video><div class="lesson-player"><span>today we read subtitles</span></div>';
        const video = document.querySelector('video') as HTMLVideoElement;
        const caption = document.querySelector('span') as HTMLElement;
        Object.defineProperty(video, 'getBoundingClientRect', {
            value: () => ({ left: 100, right: 740, top: 80, bottom: 440, width: 640, height: 360 }),
        });
        Object.defineProperty(caption, 'getBoundingClientRect', {
            value: () => ({ left: 180, right: 660, top: 380, bottom: 420, width: 480, height: 40 }),
        });

        expect(readPageCaptionText(video)).toBe('');
        expect(readPageCaptionText(video, undefined, { allowNonJapanese: true })).toBe('today we read subtitles');
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

    it('reuses the latched reference rect during a resize drag instead of re-measuring without inset', () => {
        withViewport(1600, 900, () => {
            const { controller } = createInstalledSubtitleController({ subtitleOverlayVisible: true });
            try {
                const video = attachVideo(controller, { rect: new DOMRect(0, 0, 960, 540) });
                const cue = { start: 0, end: 2, text: '今日は読む。', transcriptEligible: true };
                const internals = controllerInternals<{
                    video: HTMLVideoElement;
                    cues: Array<typeof cue>;
                    currentCue: typeof cue;
                    openLinesPanel: () => void;
                    positionTranscriptPanel: (options?: { skipInset?: boolean }) => void;
                    transcriptLayoutReferenceVideoRect: (w: number, h: number) => DOMRect;
                    transcriptLayoutReferenceRect?: DOMRect;
                    transcriptPanelSize: { sideWidth?: number };
                    applyVideoInsetForTranscriptLayout: (
                        layout: { width: number },
                        rect: DOMRect,
                        options?: { resizeEventMode?: 'immediate' | 'settled' },
                    ) => boolean;
                }>(controller);
                internals.video = video;
                internals.cues = [cue];
                internals.currentCue = cue;
                internals.openLinesPanel();

                // Count the expensive measure-without-inset reference computation.
                const realReference = internals.transcriptLayoutReferenceVideoRect.bind(internals);
                let referenceMeasures = 0;
                internals.transcriptLayoutReferenceVideoRect = (w: number, h: number) => {
                    referenceMeasures += 1;
                    return realReference(w, h);
                };
                const realInset = internals.applyVideoInsetForTranscriptLayout.bind(internals);
                const dragInsetWidths: number[] = [];
                const dragResizeEventModes: Array<'immediate' | 'settled' | undefined> = [];
                internals.applyVideoInsetForTranscriptLayout = (layout, rect, options) => {
                    dragInsetWidths.push(Math.round(layout.width));
                    dragResizeEventModes.push(options?.resizeEventMode);
                    return realInset(layout, rect, options);
                };

                // Prime the latched reference rect (as a real first layout would).
                internals.positionTranscriptPanel();
                expect(referenceMeasures).toBeGreaterThan(0);
                expect(internals.transcriptLayoutReferenceRect).toBeTruthy();

                // Resize-drag frames (skipInset) must NOT re-measure: they reuse the
                // latched reference, avoiding the inset style-toggle + double layout.
                // They still need to re-apply the video inset, otherwise the YouTube
                // video frame stays fixed while the side panel grows and only snaps
                // after pointer-up. Drag frames also defer the synthetic resize
                // event nudge so YouTube/mobile listeners are not spammed.
                dragInsetWidths.length = 0;
                dragResizeEventModes.length = 0;
                const beforeDrag = referenceMeasures;
                internals.transcriptPanelSize.sideWidth = 520;
                internals.positionTranscriptPanel({ skipInset: true });
                internals.transcriptPanelSize.sideWidth = 580;
                internals.positionTranscriptPanel({ skipInset: true });
                internals.transcriptPanelSize.sideWidth = 640;
                internals.positionTranscriptPanel({ skipInset: true });
                expect(referenceMeasures).toBe(beforeDrag);
                expect(dragInsetWidths).toEqual([520, 580, 640]);
                expect(dragResizeEventModes).toEqual(['settled', 'settled', 'settled']);

                // A normal (non-drag) reposition still re-measures.
                dragResizeEventModes.length = 0;
                internals.positionTranscriptPanel();
                expect(referenceMeasures).toBe(beforeDrag + 1);
                expect(dragResizeEventModes).toEqual(['immediate']);
            } finally {
                controller.destroy();
            }
        });
    });

    it('pauses transcript auto-follow after a manual scroll and resumes after the window', () => {
        const nowDescriptor = Object.getOwnPropertyDescriptor(performance, 'now');
        const rafDescriptor = Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame');
        const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
        let now = 10_000;
        const scrollSpy = vi.fn();
        Object.defineProperty(performance, 'now', { configurable: true, value: () => now });
        Object.defineProperty(window, 'requestAnimationFrame', {
            configurable: true,
            value: (cb: FrameRequestCallback) => { cb(now); return 1; },
        });
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollSpy });

        try {
            // The resume window is the configurable setting (seconds); the
            // controller reads it live from the same settings object each call.
            const { controller, settings } = createSubtitleController(
                makeSubtitleSettings({
                    subtitleOverlayVisible: true,
                    subtitleTranscriptAutoScroll: true,
                    subtitleTranscriptAutoScrollResumeSeconds: 4,
                }),
            );
            installController(controller);
            const internals = controllerInternals<{
                transcriptPanel: HTMLElement;
                panelMode: 'lines' | 'tracks';
                noteTranscriptScroll: () => void;
                scrollTranscriptToActive: () => void;
            }>(controller);
            internals.panelMode = 'lines';
            internals.transcriptPanel.hidden = false;
            internals.transcriptPanel.innerHTML = '<div class="jpdb-subtitle-list-scroll"><div class="jpdb-subtitle-list-row active" data-row-index="5"></div></div>';

            // Baseline: advancing the active cue snaps the list to it.
            internals.scrollTranscriptToActive();
            expect(scrollSpy).toHaveBeenCalledTimes(1);

            // The auto-scroll's own scroll event (inside the programmatic
            // window) must NOT be counted as a manual scroll.
            internals.noteTranscriptScroll();
            now += 100;
            internals.scrollTranscriptToActive();
            expect(scrollSpy).toHaveBeenCalledTimes(2);

            // A real manual scroll (past the programmatic window) pauses follow:
            // the next cue advance must NOT yank the list back.
            now += 400;
            internals.noteTranscriptScroll();
            now += 100;
            internals.scrollTranscriptToActive();
            expect(scrollSpy).toHaveBeenCalledTimes(2);

            // Still paused just before the 4s window elapses.
            now += 3700;
            internals.scrollTranscriptToActive();
            expect(scrollSpy).toHaveBeenCalledTimes(2);

            // After the configured resume window, follow resumes.
            now += 400;
            internals.scrollTranscriptToActive();
            expect(scrollSpy).toHaveBeenCalledTimes(3);

            // A larger configured window keeps follow paused longer: a manual
            // scroll then a 4s gap no longer resumes when the window is 10s.
            settings.subtitleTranscriptAutoScrollResumeSeconds = 10;
            now += 1000;
            internals.noteTranscriptScroll();
            now += 4000;
            internals.scrollTranscriptToActive();
            expect(scrollSpy).toHaveBeenCalledTimes(3);
            now += 6500;
            internals.scrollTranscriptToActive();
            expect(scrollSpy).toHaveBeenCalledTimes(4);
        } finally {
            if (nowDescriptor) Object.defineProperty(performance, 'now', nowDescriptor);
            if (rafDescriptor) Object.defineProperty(window, 'requestAnimationFrame', rafDescriptor);
            if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollDescriptor);
            else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
        }
    });

    it('ignores stale secondary cues after moving the same track to Japanese', async () => {
        vi.useFakeTimers();
        const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
            configurable: true,
            value: vi.fn(),
        });

        try {
            const { controller } = createInstalledSubtitleController({
                subtitleOverlayVisible: true,
                subtitleSecondaryVisible: true,
            });
            attachVideo(controller, { currentTime: 0.5 });

            const internals = controllerInternals<{
                tracks: Array<{ id: string; label: string; kind: 'native'; language: string; track: TextTrack }>;
                selectSecondaryTrack: (id: string) => Promise<void>;
                selectTrack: (id: string) => Promise<void>;
                selectedTrackId: string;
                secondaryTrackId: string;
                cues: Array<{ text: string }>;
                secondaryCues: Array<{ text: string }>;
                secondaryCue?: { text: string };
                updateFromLoadedCues: () => void;
            }>(controller);

            const trackState = {
                mode: 'disabled',
                cues: [] as Array<{ startTime: number; endTime: number; text: string }>,
            };
            const track = trackState as unknown as TextTrack;

            internals.tracks = [{
                id: 'native-0',
                label: 'English captions',
                kind: 'native',
                language: 'en',
                track,
            }];

            const secondarySelection = internals.selectSecondaryTrack('native-0');
            const primarySelection = internals.selectTrack('native-0');

            trackState.cues = [{ startTime: 0, endTime: 2, text: 'Hello there' }];
            await vi.advanceTimersByTimeAsync(1000);
            await Promise.all([secondarySelection, primarySelection]);

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

    it('auto-pairs Japanese YouTube captions as primary with English captions as the native overlay', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            subtitleOverlayVisible: false,
            subtitleSecondaryVisible: false,
            apiKey: '',
            localDictionariesEnabled: false,
        };
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            onSettingsChange: () => undefined,
        });
        const internals = controller as unknown as {
            tracks: Array<{
                id: string;
                label: string;
                kind: 'youtube';
                language: string;
                autoGenerated?: boolean;
                sourceType?: 'asr' | 'translation';
                sourceLanguage?: string;
                targetLanguage?: string;
                url?: string;
            }>;
            selectedTrackId: string;
            secondaryTrackId: string;
            finishYouTubeTrackDiscovery: (added: number, updatedSelectedTrack: boolean) => void;
            selectTrack: (id: string) => Promise<void>;
            selectSecondaryTrack: (id: string) => Promise<void>;
        };
        internals.tracks = [
            {
                id: 'youtube-en',
                label: 'English (en) · auto-translated from 日本語 (自動生成)',
                kind: 'youtube',
                language: 'en',
                autoGenerated: true,
                sourceType: 'translation',
                sourceLanguage: 'ja',
                targetLanguage: 'en',
            },
            {
                id: 'youtube-ja',
                label: '日本語 (自動生成) (ja)',
                kind: 'youtube',
                language: 'ja',
                autoGenerated: true,
                sourceType: 'asr',
            },
        ];
        internals.selectTrack = async id => {
            internals.selectedTrackId = id;
        };
        internals.selectSecondaryTrack = async id => {
            internals.secondaryTrackId = id;
        };

        internals.finishYouTubeTrackDiscovery(2, false);

        expect(internals.selectedTrackId).toBe('youtube-ja');
        expect(internals.secondaryTrackId).toBe('youtube-en');
    });

    it('recovers a secondary YouTube translation track when translated timedtext is empty', async () => {
        const originalLocation = window.location;
        const originalFetch = globalThis.fetch;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=native-overlay') as unknown as Location,
        });
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const href = input instanceof Request ? input.url : String(input);
            const url = new URL(href);
            if (url.hostname === 'translate.googleapis.com') {
                expect(url.searchParams.get('sl')).toBe('ja');
                expect(url.searchParams.get('tl')).toBe('en');
                return new Response(JSON.stringify({ sentences: [{ trans: 'I read today.' }] }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                });
            }
            if (url.pathname === '/api/timedtext') {
                return new Response(
                    url.searchParams.has('tlang') ? '' : '<transcript><text start="1" dur="2">今日は読む。</text></transcript>',
                    { status: 200, headers: { 'content-type': 'text/xml' } },
                );
            }
            return new Response('', { status: 404 });
        });
        Object.defineProperty(globalThis, 'fetch', {
            configurable: true,
            value: fetchMock,
        });
        const { controller } = createInstalledSubtitleController({
            subtitleOverlayVisible: true,
            subtitleSecondaryVisible: true,
        });
        const internals = controllerInternals<{
            tracks: Array<{
                id: string;
                label: string;
                kind: 'youtube';
                language: string;
                sourceType: 'asr' | 'translation';
                sourceLanguage?: string;
                targetLanguage?: string;
                url: string;
                loadingState?: string;
            }>;
            secondaryTrackId: string;
            secondaryCues: Array<{ start: number; end: number; text: string }>;
            selectSecondaryTrack: (id: string) => Promise<void>;
        }>(controller);
        internals.tracks = [
            {
                id: 'youtube-ja',
                label: '日本語 (ja) · auto-generated',
                kind: 'youtube',
                language: 'ja',
                sourceType: 'asr',
                sourceLanguage: 'ja',
                url: 'https://www.youtube.com/api/timedtext?v=native-overlay&lang=ja',
            },
            {
                id: 'youtube-en',
                label: 'English (en) · auto-translated from 日本語',
                kind: 'youtube',
                language: 'en',
                sourceType: 'translation',
                sourceLanguage: 'ja',
                targetLanguage: 'en',
                url: 'https://www.youtube.com/api/timedtext?v=native-overlay&lang=ja&tlang=en',
            },
        ];

        try {
            await internals.selectSecondaryTrack('youtube-en');

            expect(internals.secondaryTrackId).toBe('youtube-en');
            expect(internals.secondaryCues).toMatchObject([{ start: 1, end: 3, text: 'I read today.' }]);
            expect(internals.tracks[1]?.loadingState).toBe('ready');
            expect(fetchMock.mock.calls.some(([input]) => (input instanceof Request ? input.url : String(input)).includes('translate.googleapis.com'))).toBe(true);
        } finally {
            controller.destroy();
            Object.defineProperty(globalThis, 'fetch', {
                configurable: true,
                value: originalFetch,
            });
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('synthesizes and auto-selects a translated Japanese track when YouTube only offers English captions', () => {
        const { controller } = createSubtitleController(makeSubtitleSettings({ interfaceLanguage: 'en' as const }));
        const internals = controllerInternals<{
            tracks: Array<{ id: string; label: string; kind: string; language?: string; autoGenerated?: boolean; translatedFromTrackId?: string }>;
            selectedTrackId: string;
            secondaryTrackId: string;
            finishYouTubeTrackDiscovery: (added: number, updatedSelectedTrack: boolean) => void;
            selectTrack: (id: string) => Promise<void>;
            selectSecondaryTrack: (id: string) => Promise<void>;
        }>(controller);
        internals.tracks = [
            { id: 'youtube-en', label: 'English (auto-generated)', kind: 'youtube', language: 'en', autoGenerated: true },
        ];
        internals.selectTrack = async id => {
            internals.selectedTrackId = id;
        };
        internals.selectSecondaryTrack = async id => {
            internals.secondaryTrackId = id;
        };

        internals.finishYouTubeTrackDiscovery(1, false);

        const synthetic = internals.tracks.find(track => track.translatedFromTrackId === 'youtube-en');
        expect(synthetic).toBeTruthy();
        expect(synthetic?.language).toBe('ja');
        expect(internals.selectedTrackId).toBe(synthetic?.id);
        expect(internals.secondaryTrackId).toBe('youtube-en');
    });

    it('replaces a selected synthetic translation when a real Japanese YouTube track appears later', () => {
        const { controller } = createSubtitleController(makeSubtitleSettings({ interfaceLanguage: 'en' as const }));
        const internals = controllerInternals<{
            tracks: Array<{ id: string; label: string; kind: string; language?: string; autoGenerated?: boolean; translatedFromTrackId?: string }>;
            selectedTrackId: string;
            secondaryTrackId: string;
            finishYouTubeTrackDiscovery: (added: number, updatedSelectedTrack: boolean) => void;
            selectTrack: (id: string) => Promise<void>;
            selectSecondaryTrack: (id: string) => Promise<void>;
        }>(controller);
        internals.tracks = [
            { id: 'youtube-en', label: 'English (auto-generated)', kind: 'youtube', language: 'en', autoGenerated: true },
        ];
        internals.selectTrack = async id => {
            internals.selectedTrackId = id;
        };
        internals.selectSecondaryTrack = async id => {
            internals.secondaryTrackId = id;
        };
        internals.finishYouTubeTrackDiscovery(1, false);
        expect(internals.selectedTrackId).toBe('translated-youtube-en');

        internals.tracks.push({ id: 'youtube-ja', label: '日本語', kind: 'youtube', language: 'ja' });
        internals.finishYouTubeTrackDiscovery(1, false);

        expect(internals.selectedTrackId).toBe('youtube-ja');
    });

    it('surfaces a translated Japanese option for English-only native tracks and keeps it across rescans', () => {
        const { controller } = createInstalledSubtitleController({ interfaceLanguage: 'en' as const });
        const internals = controllerInternals<{
            tracks: Array<{ id: string; label: string; kind: string; language?: string; track?: TextTrack; translatedFromTrackId?: string }>;
            selectedTrackId: string;
            secondaryTrackId: string;
            addNativeTrack: (track: TextTrack) => void;
            removeStaleNativeTracks: (video: HTMLVideoElement) => void;
            selectTrack: (id: string) => Promise<void>;
        }>(controller);
        internals.selectTrack = async id => {
            internals.selectedTrackId = id;
        };
        const nativeTrack = {
            label: 'English',
            language: 'en',
            kind: 'subtitles',
            mode: 'disabled',
            cues: [],
            addEventListener: () => undefined,
        } as unknown as TextTrack;

        internals.addNativeTrack(nativeTrack);

        const synthetic = internals.tracks.find(track => track.translatedFromTrackId);
        expect(synthetic).toBeTruthy();
        expect(synthetic?.language).toBe('ja');
        expect(internals.selectedTrackId).toBe(synthetic?.id);
        expect(internals.secondaryTrackId).toBe(internals.tracks[0]?.id);

        // A rescan of the same video must not cull the synthetic (it has no
        // TextTrack of its own) while its source is still alive.
        const video = document.createElement('video');
        Object.defineProperty(video, 'textTracks', { value: [nativeTrack], configurable: true });
        internals.removeStaleNativeTracks(video);
        expect(internals.tracks.some(track => track.translatedFromTrackId)).toBe(true);

        // Once the source disappears, the synthetic goes with it.
        const emptyVideo = document.createElement('video');
        Object.defineProperty(emptyVideo, 'textTracks', { value: [], configurable: true });
        internals.removeStaleNativeTracks(emptyVideo);
        expect(internals.tracks.some(track => track.translatedFromTrackId)).toBe(false);
    });

    it('lets a real Japanese native track take primary over an auto-selected synthetic translation', () => {
        const { controller } = createInstalledSubtitleController({ interfaceLanguage: 'en' as const });
        const internals = controllerInternals<{
            tracks: Array<{ id: string; translatedFromTrackId?: string }>;
            selectedTrackId: string;
            addNativeTrack: (track: TextTrack) => void;
            selectTrack: (id: string) => Promise<void>;
        }>(controller);
        internals.selectTrack = async id => {
            internals.selectedTrackId = id;
        };
        const makeTrack = (label: string, language: string) => ({
            label,
            language,
            kind: 'subtitles',
            mode: 'disabled',
            cues: [],
            addEventListener: () => undefined,
        }) as unknown as TextTrack;

        internals.addNativeTrack(makeTrack('English', 'en'));
        expect(internals.tracks.find(track => track.id === internals.selectedTrackId)?.translatedFromTrackId).toBeTruthy();

        internals.addNativeTrack(makeTrack('日本語', 'ja'));
        expect(internals.tracks.find(track => track.id === internals.selectedTrackId)?.translatedFromTrackId).toBeUndefined();
        expect(internals.selectedTrackId).not.toBe('');
    });

    it('keeps the synthetic translated option when the page subtitle listing is rediscovered', () => {
        const { controller } = createInstalledSubtitleController({ interfaceLanguage: 'en' as const });
        const internals = controllerInternals<{
            tracks: Array<{ id: string; label: string; kind: string; language?: string; url?: string; sourceKey?: string; translatedFromTrackId?: string }>;
            selectedTrackId: string;
            finishPageSubtitleTrackDiscovery: (changes: { added: number; updated: number; removed: number }) => void;
            removeStalePageSubtitleTracks: (sources: Array<{ url: string; label: string; language?: string; sourceKey: string }>) => number;
            selectTrack: (id: string) => Promise<void>;
        }>(controller);
        internals.selectTrack = async id => {
            internals.selectedTrackId = id;
        };
        const source = { url: 'https://news.example.com/captions/en.vtt', label: 'English', language: 'en', sourceKey: 'track:en' };
        internals.tracks = [
            { id: 'remote-0', label: source.label, kind: 'remote', language: source.language, url: source.url, sourceKey: source.sourceKey },
        ];

        internals.finishPageSubtitleTrackDiscovery({ added: 1, updated: 0, removed: 0 });

        const synthetic = internals.tracks.find(track => track.translatedFromTrackId === 'remote-0');
        expect(synthetic).toBeTruthy();
        expect(internals.selectedTrackId).toBe(synthetic?.id);

        // The next discovery pass lists the same page source; the synthetic has
        // no sourceKey/url of its own and must not be culled as stale.
        const removed = internals.removeStalePageSubtitleTracks([source]);
        expect(removed).toBe(0);
        expect(internals.tracks.some(track => track.translatedFromTrackId)).toBe(true);

        // When the page source disappears, the synthetic cascades away with it.
        internals.removeStalePageSubtitleTracks([]);
        expect(internals.tracks.some(track => track.translatedFromTrackId)).toBe(false);
    });

    it('clears auto-detected subtitles when a CIJ video route changes', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://cijapanese.com/video/560') as unknown as Location,
        });

        try {
            const { controller } = createInstalledSubtitleController({
                subtitleOverlayVisible: true,
            });
            const internals = controllerInternals<{
                syncSubtitleSourceContext: () => boolean;
                tracks: Array<{ id: string; label: string; kind: 'remote' | 'file'; language?: string; url?: string; sourceKey?: string; cues?: Array<{ text: string }> }>;
                selectedTrackId: string;
                cues: Array<{ text: string }>;
                currentCue?: { text: string };
            }>(controller);
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
            const cue = { start: 0, end: 2, text: '読む', transcriptEligible: true };
            const { internals } = setupTranscriptCueController([cue], {
                hooks: { parseJapanese },
                selectedTrackId: 'file-primary',
                settings: {
                    subtitleTranscriptAutoScroll: false,
                    apiKey: 'test-key',
                    furiganaMode: 'all',
                },
            });

            internals.openLinesPanel();
            expect(document.querySelector('.jpdb-subtitle-row-text')?.innerHTML).toBe('読む');

            await vi.advanceTimersByTimeAsync(1);
            await Promise.resolve();

            const row = document.querySelector<HTMLElement>('.jpdb-subtitle-row-text');
            expect(parseJapanese).toHaveBeenCalledWith('読む', SUBTITLE_PARSE_OPTIONS);
            expect(row?.querySelector('.jpdb-reader-word.jpdb-known.jpdb-pitch-heiban')).not.toBeNull();
            expect(row?.querySelector('.jpdb-reader-furi')?.textContent).toBe('よ');
        } finally {
            window.requestAnimationFrame = originalRequestAnimationFrame;
            window.cancelAnimationFrame = originalCancelAnimationFrame;
        }
    });

    it('refreshes cheap provisional transcript rows with enriched furigana when they become visible', async () => {
        vi.useFakeTimers();
        const originalLocation = window.location;
        const originalRequestAnimationFrame = window.requestAnimationFrame;
        const originalCancelAnimationFrame = window.cancelAnimationFrame;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=provisional') as unknown as Location,
        });
        window.requestAnimationFrame = ((callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0)) as typeof window.requestAnimationFrame;
        window.cancelAnimationFrame = ((id: number) => window.clearTimeout(id)) as typeof window.cancelAnimationFrame;

        try {
            const cue = { start: 0, end: 2, text: '日本語', transcriptEligible: true };
            const parseJapaneseBatch = vi.fn(async (texts: string[]) => texts.map(text => [makeSubtitleToken(text)]));
            const beforeRenderTokens = vi.fn(async (tokens: JPDBToken[]) => {
                tokens[0].card.reading = 'にほんご';
                tokens[0].card.pitchAccent = ['LHHH'];
                tokens[0].rubies = [{ start: 0, end: 3, length: 3, text: 'にほんご' }];
                tokens[0].pitchClass = 'heiban';
            });
            const { settings, internals } = setupTranscriptCueController<typeof cue, {
                parseCueHtmlBatch: (
                    texts: string[],
                    settings: ReaderSettings,
                    options?: { enrichBeforeRender?: boolean },
                ) => Promise<Array<{ html: string; provisional?: boolean }>>;
                provisionalParsedHtmlCache: Map<string, string>;
                parseCacheKey: (text: string, settings: ReaderSettings) => string;
            }>([cue], {
                hooks: { parseJapaneseBatch, beforeRenderTokens },
                selectedTrackId: 'youtube-0',
                settings: {
                    subtitleTranscriptAutoScroll: false,
                    apiKey: '',
                    jitenApiKey: '',
                    localDictionariesEnabled: false,
                    furiganaMode: 'all',
                },
            });
            const key = internals.parseCacheKey('日本語', settings);

            await internals.parseCueHtmlBatch(['日本語'], settings, { enrichBeforeRender: false });
            expect(internals.provisionalParsedHtmlCache.get(key)).toContain('jpdb-reader-word');
            expect(internals.provisionalParsedHtmlCache.get(key)).not.toContain('jpdb-reader-furi');

            internals.openLinesPanel();
            expect(document.querySelector('.jpdb-subtitle-row-text')?.innerHTML).not.toContain('jpdb-reader-furi');

            await vi.advanceTimersByTimeAsync(1);
            await Promise.resolve();

            expect(parseJapaneseBatch).toHaveBeenCalledTimes(2);
            expect(beforeRenderTokens).toHaveBeenCalledTimes(1);
            await vi.waitFor(() => {
                expect(document.querySelector('.jpdb-subtitle-row-text .jpdb-reader-word.jpdb-pitch-heiban')).not.toBeNull();
            });
            const row = document.querySelector<HTMLElement>('.jpdb-subtitle-row-text');
            expect(row?.querySelector('.jpdb-reader-word.jpdb-pitch-heiban')).not.toBeNull();
            expect(row?.querySelector('.jpdb-reader-furi')?.textContent).toBe('にほんご');
            expect(internals.provisionalParsedHtmlCache.get(key)).toContain('jpdb-reader-furi');
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
            window.requestAnimationFrame = originalRequestAnimationFrame;
            window.cancelAnimationFrame = originalCancelAnimationFrame;
        }
    });

    it('leaves a keyless cue re-hydratable while a fallback kanji word still lacks furigana, then marks it enriched once the reading resolves', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=enrich-gate') as unknown as Location,
        });
        try {
            const cue = { start: 0, end: 2, text: '戦う', transcriptEligible: true };
            // The local tokenizer returns 戦う as an unresolved fallback word
            // (no reading): furigana depends on the public lookup resolving it.
            const parseJapaneseBatch = vi.fn(async (texts: string[]) => texts.map(text => {
                const token = makeSubtitleToken(text);
                token.card.source = 'fallback';
                return [token];
            }));
            let resolveReading = false;
            const beforeRenderTokens = vi.fn(async (tokens: JPDBToken[]) => {
                if (!resolveReading) return; // first pass: public lookup misses 戦う
                tokens[0].card.reading = 'たたかう';
                tokens[0].rubies = [{ start: 0, end: 2, length: 2, text: 'たたかう' }];
            });
            const { settings, internals } = setupTranscriptCueController<typeof cue, {
                parseCueHtmlBatch: (
                    texts: string[],
                    settings: ReaderSettings,
                    options?: { enrichBeforeRender?: boolean; refreshProvisional?: boolean },
                ) => Promise<Array<{ html: string; provisional?: boolean }>>;
                enrichedProvisionalParsedHtmlKeys: Set<string>;
                parseCacheKey: (text: string, settings: ReaderSettings) => string;
            }>([cue], {
                hooks: { parseJapaneseBatch, beforeRenderTokens },
                selectedTrackId: 'youtube-0',
                settings: { subtitleTranscriptAutoScroll: false, apiKey: '', jitenApiKey: '', localDictionariesEnabled: false, furiganaMode: 'all' },
            });
            const key = internals.parseCacheKey('戦う', settings);

            // First enrichment leaves 戦う without furigana — the cue must NOT be
            // marked enriched, so a later hydration pass (e.g. after orientation)
            // can retry instead of freezing the missing ruby forever.
            await internals.parseCueHtmlBatch(['戦う'], settings, { enrichBeforeRender: true, refreshProvisional: true });
            expect(internals.enrichedProvisionalParsedHtmlKeys.has(key)).toBe(false);

            // The retry resolves the reading: now the cue is fully enriched and
            // becomes sticky.
            resolveReading = true;
            await internals.parseCueHtmlBatch(['戦う'], settings, { enrichBeforeRender: true, refreshProvisional: true });
            expect(internals.enrichedProvisionalParsedHtmlKeys.has(key)).toBe(true);
        } finally {
            Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
        }
    });

    it('stops re-hydrating a permanently-unresolvable fallback word after the retry cap so it settles instead of re-requesting forever', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=enrich-cap') as unknown as Location,
        });
        try {
            const cue = { start: 0, end: 2, text: '戦う', transcriptEligible: true };
            const parseJapaneseBatch = vi.fn(async (texts: string[]) => texts.map(text => {
                const token = makeSubtitleToken(text);
                token.card.source = 'fallback';
                return [token];
            }));
            // Public lookup never resolves 戦う (genuinely absent from Jiten).
            const beforeRenderTokens = vi.fn(async () => undefined);
            const { settings, internals } = setupTranscriptCueController<typeof cue, {
                parseCueHtmlBatch: (
                    texts: string[],
                    settings: ReaderSettings,
                    options?: { enrichBeforeRender?: boolean; refreshProvisional?: boolean },
                ) => Promise<unknown>;
                enrichedProvisionalParsedHtmlKeys: Set<string>;
                parseCacheKey: (text: string, settings: ReaderSettings) => string;
            }>([cue], {
                hooks: { parseJapaneseBatch, beforeRenderTokens },
                selectedTrackId: 'youtube-0',
                settings: { subtitleTranscriptAutoScroll: false, apiKey: '', jitenApiKey: '', localDictionariesEnabled: false, furiganaMode: 'all' },
            });
            const key = internals.parseCacheKey('戦う', settings);

            // Each hydration pass re-attempts; the cue stays re-hydratable for a
            // bounded number of attempts, then settles to enriched (bare) so it
            // is no longer re-parsed/re-looked-up on every tick.
            for (let attempt = 0; attempt < 5; attempt++) {
                await internals.parseCueHtmlBatch(['戦う'], settings, { enrichBeforeRender: true, refreshProvisional: true });
                expect(internals.enrichedProvisionalParsedHtmlKeys.has(key)).toBe(false);
            }
            await internals.parseCueHtmlBatch(['戦う'], settings, { enrichBeforeRender: true, refreshProvisional: true });
            expect(internals.enrichedProvisionalParsedHtmlKeys.has(key)).toBe(true);
        } finally {
            Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
        }
    });

    it('updates transcript rows through the parse-key index instead of scanning every row', () => {
        const cue = { start: 0, end: 2, text: '読む', transcriptEligible: true };
        const { settings, internals } = setupTranscriptCueController<typeof cue, {
            parseCacheKey: (text: string, settings: typeof DEFAULT_SETTINGS) => string;
            updateTranscriptRowsForParseKey(key: string, html: string): void;
        }>([cue], {
            selectedTrackId: 'file-primary',
            settings: {
                subtitleTranscriptAutoScroll: false,
                apiKey: 'test-key',
            },
        });

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
        const { controller } = createInstalledSubtitleController();
        try {
            const subtitle = document.querySelector<HTMLElement>('.jpdb-subtitle-lines')!;
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

            controllerInternals<{
                applyKaraokeStateToPrimary: (cueArg: unknown, time: number) => void;
            }>(controller).applyKaraokeStateToPrimary(cue, 1.2);

            const words = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-subtitle-primary .jpdb-reader-word'));
            expect(words[0]?.classList.contains('jpdb-subtitle-word-spoken')).toBe(true);
            expect(words[1]?.classList.contains('jpdb-subtitle-word-current')).toBe(true);
        } finally {
            controller.destroy();
        }
    });

    it('applies karaoke state after parsed subtitle replacement', () => {
        let controller: SubtitlePlayerController | undefined;
        try {
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
            const setup = setupTranscriptCueController<typeof cue, {
                subtitleEl: HTMLElement;
                renderSerial: number;
                replacePrimaryHtml(html: string, serial: number): void;
            }>([cue], {
                currentTime: 1.5,
                selectedTrackId: 'youtube-0',
                settings: {
                    subtitleKaraokeMode: true,
                    apiKey: 'test-key',
                },
            });
            controller = setup.controller;
            const { internals } = setup;
            internals.renderSerial = 7;
            internals.subtitleEl.innerHTML = '<div class="jpdb-subtitle-primary">今日読む</div>';

            internals.replacePrimaryHtml(
                '<span class="jpdb-reader-word jpdb-pitch-heiban">今日</span><span class="jpdb-reader-word jpdb-pitch-odaka">読む</span>',
                7,
            );

            const words = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-subtitle-primary .jpdb-reader-word'));
            expect(words[0]?.textContent).toContain('今日');
            expect(words[1]?.textContent).toContain('読む');
            expect(words[0]?.classList.contains('jpdb-subtitle-word-current')).toBe(true);
            expect(words[1]?.classList.contains('jpdb-subtitle-word-pending')).toBe(true);
        } finally {
            controller?.destroy();
        }
    });

    it('keeps cached provisional subtitle hidden until ruby and pitch are enriched for the first primary paint', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });

        try {
            const parseJapanese = vi.fn(async () => []);
            const cue = { start: 0, end: 2, text: '読む', transcriptEligible: true };
            const { settings, internals } = setupTranscriptCueController<typeof cue, {
                parseCacheKey: (text: string, settings: ReaderSettings) => string;
                enrichedProvisionalParsedHtmlKeys: Set<string>;
                provisionalParsedHtmlCache: Map<string, string>;
                render: () => void;
            }>([cue], {
                hooks: { parseJapanese },
                selectedTrackId: 'youtube-0',
                settings: {
                    apiKey: '',
                    jitenApiKey: '',
                    subtitleKaraokeMode: false,
                },
            });
            const key = internals.parseCacheKey('読む', settings);
            internals.provisionalParsedHtmlCache.set(
                key,
                '<span class="jpdb-reader-word jpdb-known jpdb-pitch-heiban jpdb-reader-has-furi"><ruby><span class="jpdb-reader-ruby-base">読</span><rt class="jpdb-reader-furi">よ</rt></ruby>む</span>',
            );

            internals.render();
            expect(document.querySelector('.jpdb-subtitle-primary .jpdb-reader-word')).toBeNull();

            internals.enrichedProvisionalParsedHtmlKeys.add(key);
            internals.render();

            const word = document.querySelector<HTMLElement>('.jpdb-subtitle-primary .jpdb-reader-word')!;
            expect(word).not.toBeNull();
            expect(word.classList.contains('jpdb-pitch-heiban')).toBe(true);
            expect(word.querySelector('.jpdb-reader-furi')?.textContent).toBe('よ');
            expect(parseJapanese).toHaveBeenCalledTimes(1);
            expect(parseJapanese).toHaveBeenCalledWith('読む', {
                allowSegmentedFallback: true,
                includeLocalPitch: true,
                skipJpdb: true,
            });
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('does not rebuild the subtitle DOM when a render tick produces identical html', () => {
        const cue = { start: 0, end: 2, text: '読む', transcriptEligible: true };
        const { internals } = setupTranscriptCueController<typeof cue, {
            parseCacheKey: (text: string, settings: ReaderSettings) => string;
            provisionalParsedHtmlCache: Map<string, string>;
            render: () => void;
        }>([cue], {
            selectedTrackId: 'youtube-0',
            settings: { apiKey: 'test-key', subtitleKaraokeMode: false },
        });

        internals.render();
        const firstPrimary = document.querySelector<HTMLElement>('.jpdb-subtitle-primary');
        expect(firstPrimary).not.toBeNull();
        // Time-driven ticks re-render the same cue: the DOM nodes must be
        // reused, otherwise async word-state/pitch coloring is wiped each
        // tick (user-reported flicker).
        internals.render();
        const secondPrimary = document.querySelector<HTMLElement>('.jpdb-subtitle-primary');
        expect(secondPrimary).toBe(firstPrimary);
    });

    it('updates the active transcript line without replacing existing rows', () => {
        const cues = [
            { start: 0, end: 1, text: '一番', transcriptEligible: true },
            { start: 1, end: 2, text: '二番', transcriptEligible: true },
        ];
        const { internals, video } = setupTranscriptCueController<typeof cues[number], {
            renderTranscriptPanel(force?: boolean): void;
        }>(cues, {
            selectedTrackId: 'file-primary',
            settings: { subtitleTranscriptAutoScroll: false },
        });

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

    it('does not re-scroll the transcript when the active line is unchanged', () => {
        const rafDescriptor = Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame');
        const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
        const scrollSpy = vi.fn();
        Object.defineProperty(window, 'requestAnimationFrame', {
            configurable: true,
            value: (cb: FrameRequestCallback) => { cb(0); return 1; },
        });
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollSpy });

        try {
            const cue = { start: 0, end: 2, text: '同じ行', transcriptEligible: true };
            const { internals } = setupTranscriptCueController<typeof cue, {
                openLinesPanel(): void;
                renderTranscriptPanel(force?: boolean): void;
            }>([cue], {
                selectedTrackId: 'file-primary',
                settings: { subtitleTranscriptAutoScroll: true },
            });

            internals.openLinesPanel();
            scrollSpy.mockClear();
            const active = document.querySelector<HTMLElement>('.jpdb-subtitle-list-row.active')!;

            internals.renderTranscriptPanel();

            const activeRows = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-subtitle-list-row.active'));
            expect(activeRows).toEqual([active]);
            expect(scrollSpy).not.toHaveBeenCalled();
        } finally {
            if (rafDescriptor) Object.defineProperty(window, 'requestAnimationFrame', rafDescriptor);
            if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollDescriptor);
            else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
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

    it('renders provisional YouTube subtitle words immediately while authoritative JPDB parsing finishes', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: 'test-key',
                // This test pins hydration, not furigana policy (UT-47 made
                // auto hide known-state ruby by default).
                furiganaMode: 'all' as const,
                localDictionariesEnabled: false,
                subtitleTranscriptAutoScroll: false,
            };
            const authoritative = deferred<JPDBToken[]>();
            const provisionalToken = makeSubtitleToken('読む', {
                cardState: ['not-in-deck'],
                vid: 1,
            });
            const finalToken = makeSubtitleToken('読む', {
                cardState: ['known'],
                pitchClass: 'heiban',
                reading: 'よむ',
                rubies: [{ start: 0, end: 1, length: 1, text: 'よ' }],
                vid: 2,
            });
            const parseJapanese = vi.fn((_text: string, options?: { requireJpdb?: boolean; skipJpdb?: boolean }) => {
                if (options?.requireJpdb) return authoritative.promise;
                if (options?.skipJpdb) return Promise.resolve([provisionalToken]);
                return Promise.resolve([]);
            });
            const controller = new SubtitlePlayerController({
                getSettings: () => settings,
                parseJapanese,
                onSettingsChange: () => undefined,
            });
            (controller as unknown as { install: () => void }).install();

            const cue = { start: 0, end: 2, text: '読む', transcriptEligible: true };
            const internals = controller as unknown as {
                cues: Array<typeof cue>;
                currentCue: typeof cue;
                panelMode: 'lines' | 'tracks';
                parseCacheKey: (text: string, settings: ReaderSettings) => string;
                parseCueHtml: (text: string, settings: ReaderSettings) => Promise<string>;
                parsedHtmlCache: Map<string, string>;
                pendingParsedHtml: Map<string, Promise<string>>;
                provisionalParsedHtmlCache: Map<string, string>;
                selectedTrackId: string;
                subtitleEl: HTMLElement;
                transcriptPanel: HTMLElement;
                video: HTMLVideoElement;
            };
            const key = internals.parseCacheKey('読む', settings);
            internals.video = document.createElement('video');
            internals.selectedTrackId = 'youtube-0';
            internals.cues = [cue];
            internals.currentCue = cue;
            internals.panelMode = 'lines';
            internals.transcriptPanel.hidden = false;
            internals.subtitleEl.innerHTML = '<div class="jpdb-subtitle-primary">読む</div>';

            const rowText = document.createElement('strong');
            rowText.className = 'jpdb-subtitle-row-text';
            rowText.setAttribute('data-transcript-text', '');
            rowText.dataset.parseKey = key;
            rowText.textContent = '読む';
            internals.transcriptPanel.replaceChildren(rowText);

            const provisionalHtml = await internals.parseCueHtml('読む', settings);
            const pendingAuthoritativeHtml = internals.pendingParsedHtml.get(key);

            expect(parseJapanese).toHaveBeenNthCalledWith(1, '読む', { requireJpdb: true, includeLocalPitch: true });
            expect(parseJapanese).toHaveBeenNthCalledWith(2, '読む', { skipJpdb: true, allowSegmentedFallback: true, includeLocalPitch: true });
            expect(provisionalHtml).toContain('jpdb-not-in-deck');
            expect(internals.provisionalParsedHtmlCache.get(key)).toContain('jpdb-not-in-deck');
            expect(pendingAuthoritativeHtml).toBeDefined();

            authoritative.resolve([finalToken]);
            await expect(pendingAuthoritativeHtml).resolves.toContain('jpdb-known jpdb-pitch-heiban');

            expect(internals.parsedHtmlCache.get(key)).toContain('jpdb-known jpdb-pitch-heiban');
            expect(internals.provisionalParsedHtmlCache.has(key)).toBe(false);
            expect(rowText.dataset.parsedProvisional).toBeUndefined();
            expect(rowText.querySelector('.jpdb-reader-word.jpdb-known.jpdb-pitch-heiban')).not.toBeNull();
            expect(rowText.querySelector('.jpdb-reader-furi')?.textContent).toBe('よ');
            expect(document.querySelector('.jpdb-subtitle-primary .jpdb-reader-word.jpdb-known.jpdb-pitch-heiban')).not.toBeNull();
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('notifies parsed subtitle tokens with the updated transcript row root', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'test-key',
            localDictionariesEnabled: false,
        };
        const token = makeSubtitleToken('読む', { cardState: ['known'] });
        const afterParseTokens = vi.fn();
        const controller = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: async () => [],
            afterParseTokens,
            onSettingsChange: () => undefined,
        });
        const internals = controller as unknown as {
            panelMode: 'lines' | 'tracks';
            parseCacheKey: (text: string, settings: ReaderSettings) => string;
            parsedTokenCache: Map<string, JPDBToken[]>;
            transcriptPanel: HTMLElement;
            transcriptPanelClosing: boolean;
            updateTranscriptRowsForParseKey(key: string, html: string): void;
        };
        const key = internals.parseCacheKey('読む', settings);
        const rowText = document.createElement('strong');
        rowText.className = 'jpdb-subtitle-row-text';
        rowText.setAttribute('data-transcript-text', '');
        rowText.dataset.parseKey = key;
        rowText.textContent = '読む';
        const panel = document.createElement('div');
        panel.className = 'jpdb-subtitle-list';
        panel.append(rowText);
        document.body.append(panel);
        internals.panelMode = 'lines';
        internals.transcriptPanel = panel;
        internals.transcriptPanelClosing = false;
        internals.parsedTokenCache.set(key, [token]);

        try {
            internals.updateTranscriptRowsForParseKey(
                key,
                '<span class="jpdb-reader-word jpdb-known" data-vid="1" data-sid="1">読む</span>',
            );

            expect(afterParseTokens).toHaveBeenCalledWith([token], [rowText]);
        } finally {
            panel.remove();
        }
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

    it('keeps parsed transcript cache entries for long tracks instead of evicting after 180 rows', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'test-key',
            localDictionariesEnabled: false,
        };
        const { controller } = createSubtitleController(settings);
        const cues = Array.from({ length: 260 }, (_, index) => ({
            start: index,
            end: index + 0.8,
            text: `字幕${index}`,
            transcriptEligible: true,
        }));
        const internals = controllerInternals<{
            cues: typeof cues;
            parsedHtmlCache: Map<string, string>;
            parseCacheKey: (text: string, settings: ReaderSettings) => string;
            pruneParsedSubtitleCaches: () => void;
        }>(controller);
        internals.cues = cues;

        for (let index = 0; index < 240; index++) {
            internals.parsedHtmlCache.set(
                internals.parseCacheKey(`字幕${index}`, settings),
                `<span class="jpdb-reader-word">字幕${index}</span>`,
            );
        }

        internals.pruneParsedSubtitleCaches();

        expect(internals.parsedHtmlCache.size).toBe(240);
        expect(internals.parsedHtmlCache.has(internals.parseCacheKey('字幕0', settings))).toBe(true);
        expect(internals.parsedHtmlCache.has(internals.parseCacheKey('字幕239', settings))).toBe(true);
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
        expect(parseJapaneseBatch.mock.calls[0]?.[1]).toEqual(SUBTITLE_PARSE_OPTIONS);
    });

    it('enriches priority YouTube subtitle batches before rendering cached html', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=priority') as unknown as Location,
        });

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                furiganaMode: 'all' as const,
                localDictionariesEnabled: false,
            };
            const token = makeSubtitleToken('本', { cardState: ['known'] });
            const parseJapaneseBatch = vi.fn(async () => [[token]]);
            const beforeRenderTokens = vi.fn(async (tokens: JPDBToken[]) => {
                tokens[0].card.reading = 'ほん';
                tokens[0].card.pitchAccent = ['HL'];
                tokens[0].pitchClass = 'atamadaka';
            });
            const { controller } = createSubtitleController(settings, { parseJapaneseBatch, beforeRenderTokens });
            const internals = controller as unknown as {
                parseCueHtmlBatch: (texts: string[], settings: ReaderSettings, options?: { enrichBeforeRender?: boolean }) => Promise<Array<{ html: string }>>;
            };

            const parsed = await internals.parseCueHtmlBatch(['本'], settings, { enrichBeforeRender: true });

            expect(beforeRenderTokens).toHaveBeenCalledWith([token]);
            expect(parsed[0]?.html).toContain('jpdb-pitch-atamadaka');
            expect(parsed[0]?.html).toContain('<rt class="jpdb-reader-furi">ほん</rt>');
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
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

            expect(parseJapanese).toHaveBeenCalledWith('字幕23', SUBTITLE_PARSE_OPTIONS);
        } finally {
            window.requestAnimationFrame = originalRequestAnimationFrame;
        }
    });

    it('parses the transcript warmup head immediately and paces only the background tail', async () => {
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

            // The priority head (visible + lookahead rows) parses immediately
            // without pacing so playback colorises instantly; only the
            // background tail is paced.
            await vi.advanceTimersByTimeAsync(0);
            expect(parseJapanese.mock.calls.length).toBeGreaterThanOrEqual(49);
            expect(parseJapanese).toHaveBeenCalledWith('字幕0', SUBTITLE_PARSE_OPTIONS);
            expect(parseJapanese).toHaveBeenCalledWith('字幕48', SUBTITLE_PARSE_OPTIONS);
            const afterPriorityHead = parseJapanese.mock.calls.length;

            await vi.advanceTimersByTimeAsync(119);
            expect(parseJapanese.mock.calls.length).toBe(afterPriorityHead);

            await vi.advanceTimersByTimeAsync(1);
            await Promise.resolve();
            expect(parseJapanese.mock.calls.length).toBeGreaterThan(afterPriorityHead);

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

    it('keeps every cue pre-parsed ahead of playback so display never waits on a parse', async () => {
        vi.useFakeTimers();
        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                subtitleTranscriptAutoScroll: false,
                apiKey: 'test-key',
                localDictionariesEnabled: false,
            };
            // Realistic parse latency: each batch takes 30ms, far less than one
            // cue duration but enough to catch display-time parsing.
            const parseJapaneseBatch = vi.fn(async (texts: string[]) => {
                await new Promise(resolve => setTimeout(resolve, 30));
                return texts.map(text => [makeSubtitleToken(text)]);
            });
            const { controller } = createSubtitleController(settings, { parseJapaneseBatch });
            installController(controller);
            const video = attachVideo(controller, { currentTime: 0.5 });
            const cues = Array.from({ length: 40 }, (_, index) => ({
                start: index * 2,
                end: index * 2 + 1.8,
                text: `再生中の字幕${index}`,
                transcriptEligible: true,
            }));
            const internals = controllerInternals<{
                cues: typeof cues;
                selectedTrackId: string;
                updateFromLoadedCues: () => void;
                subtitleWarmupTexts: (start: number, end: number, settings: ReaderSettings) => string[];
            }>(controller);
            internals.selectedTrackId = 'file-0';
            internals.cues = cues;

            // Track selection warms the initial window.
            internals.updateFromLoadedCues();
            await vi.advanceTimersByTimeAsync(50);

            // Continuous playback: every cue must already be warmed (parsed or
            // known-empty) by the moment it becomes the active cue.
            const misses: number[] = [];
            for (let index = 1; index < cues.length; index++) {
                (video as { currentTime: number }).currentTime = cues[index].start + 0.1;
                if (internals.subtitleWarmupTexts(index, index + 1, settings).length) misses.push(index);
                internals.updateFromLoadedCues();
                // One active tick (250ms) of background time between cues.
                await vi.advanceTimersByTimeAsync(250);
            }

            expect(misses).toEqual([]);
        } finally {
            vi.useRealTimers();
        }
    });

    it('pre-parses pending DOM captions during the stability window', async () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            subtitleTranscriptAutoScroll: false,
            apiKey: 'test-key',
            localDictionariesEnabled: false,
        };
        const parseJapaneseBatch = vi.fn(async (texts: string[]) => texts.map(text => [makeSubtitleToken(text)]));
        const { controller } = createSubtitleController(settings, { parseJapaneseBatch });
        const internals = controllerInternals<{
            isDomCaptionStable: (text: string, nowMs: number) => boolean;
        }>(controller);

        // First sighting starts the stability clock AND the parse.
        expect(internals.isDomCaptionStable('新しい字幕です', 1000)).toBe(false);
        expect(parseJapaneseBatch).toHaveBeenCalledTimes(1);
        expect(parseJapaneseBatch.mock.calls[0]?.[0]).toEqual(['新しい字幕です']);

        // Stability passing renders from the already-warmed cache; the same
        // text does not restart the parse.
        expect(internals.isDomCaptionStable('新しい字幕です', 1300)).toBe(true);
        expect(parseJapaneseBatch).toHaveBeenCalledTimes(1);
    });

    it('recovers the parse window within one warmup turn after a long seek', async () => {
        vi.useFakeTimers();
        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                subtitleTranscriptAutoScroll: false,
                apiKey: 'test-key',
                localDictionariesEnabled: false,
            };
            const parseJapaneseBatch = vi.fn(async (texts: string[]) => {
                await new Promise(resolve => setTimeout(resolve, 30));
                return texts.map(text => [makeSubtitleToken(text)]);
            });
            const { controller } = createSubtitleController(settings, { parseJapaneseBatch });
            installController(controller);
            const video = attachVideo(controller, { currentTime: 0.5 });
            const cues = Array.from({ length: 60 }, (_, index) => ({
                start: index * 2,
                end: index * 2 + 1.8,
                text: `シーク字幕${index}`,
                transcriptEligible: true,
            }));
            const internals = controllerInternals<{
                cues: typeof cues;
                selectedTrackId: string;
                updateFromLoadedCues: () => void;
                subtitleWarmupTexts: (start: number, end: number, settings: ReaderSettings) => string[];
            }>(controller);
            internals.selectedTrackId = 'file-0';
            internals.cues = cues;
            internals.updateFromLoadedCues();
            await vi.advanceTimersByTimeAsync(50);

            // Seek far outside the warmed window.
            (video as { currentTime: number }).currentTime = cues[45].start + 0.1;
            internals.updateFromLoadedCues();
            await vi.advanceTimersByTimeAsync(50);

            // One warmup turn later the active cue and its lookahead are warm.
            expect(internals.subtitleWarmupTexts(45, 46, settings)).toEqual([]);
            expect(internals.subtitleWarmupTexts(46, 52, settings)).toEqual([]);
        } finally {
            vi.useRealTimers();
        }
    });

    it('keeps every cue pre-parsed ahead of keyless playback through the provisional tier', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=keyless') as unknown as Location,
        });
        vi.useFakeTimers();
        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                subtitleTranscriptAutoScroll: false,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: true,
            };
            const parseJapaneseBatch = vi.fn(async (texts: string[], _options?: { skipJpdb?: boolean }) => {
                await new Promise(resolve => setTimeout(resolve, 30));
                return texts.map(text => [makeSubtitleToken(text)]);
            });
            const { controller } = createSubtitleController(settings, { parseJapaneseBatch });
            installController(controller);
            const video = attachVideo(controller, { currentTime: 0.5 });
            const cues = Array.from({ length: 40 }, (_, index) => ({
                start: index * 2,
                end: index * 2 + 1.8,
                text: `無鍵再生の字幕${index}`,
                transcriptEligible: true,
            }));
            const internals = controllerInternals<{
                cues: typeof cues;
                selectedTrackId: string;
                updateFromLoadedCues: () => void;
                subtitleWarmupTexts: (start: number, end: number, settings: ReaderSettings) => string[];
                parsedHtmlCache: Map<string, string>;
                provisionalParsedHtmlCache: Map<string, string>;
            }>(controller);
            internals.selectedTrackId = 'file-0';
            internals.cues = cues;

            internals.updateFromLoadedCues();
            await vi.advanceTimersByTimeAsync(50);

            const misses: number[] = [];
            for (let index = 1; index < cues.length; index++) {
                (video as { currentTime: number }).currentTime = cues[index].start + 0.1;
                if (internals.subtitleWarmupTexts(index, index + 1, settings).length) misses.push(index);
                internals.updateFromLoadedCues();
                await vi.advanceTimersByTimeAsync(250);
            }

            expect(misses).toEqual([]);
            // Keyless results live in the provisional tier (it IS the final
            // tier without a key); nothing may dangle waiting on an upgrade.
            expect(internals.provisionalParsedHtmlCache.size).toBeGreaterThan(0);
            // No call may demand the JPDB API keyless...
            expect(parseJapaneseBatch.mock.calls.some(call => (call[1] as { requireJpdb?: boolean })?.requireJpdb === true)).toBe(false);
            // ...and no cue text is tokenized twice: the provisional result is
            // final, so the transcript-tail warmup must reuse it instead of
            // re-parsing every cue through its non-provisional path.
            const parsedTexts = parseJapaneseBatch.mock.calls.flatMap(call => call[0] as string[]);
            expect(new Set(parsedTexts).size).toBe(parsedTexts.length);
        } finally {
            vi.useRealTimers();
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('re-anchors the warmup window at the playhead when seeks land between cues', async () => {
        vi.useFakeTimers();
        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                subtitleTranscriptAutoScroll: false,
                apiKey: 'test-key',
                localDictionariesEnabled: false,
            };
            const parseJapaneseBatch = vi.fn(async (texts: string[], _options?: { skipJpdb?: boolean }) => {
                await new Promise(resolve => setTimeout(resolve, 30));
                return texts.map(text => [makeSubtitleToken(text)]);
            });
            const { controller } = createSubtitleController(settings, { parseJapaneseBatch });
            installController(controller);
            const video = attachVideo(controller, { currentTime: 0.5 });
            // 2s cues with real 2s gaps between them, so a seek can land
            // clear of the boundary grace/tolerance windows.
            const cues = Array.from({ length: 60 }, (_, index) => ({
                start: index * 4,
                end: index * 4 + 2,
                text: `間隙シーク字幕${index}`,
                transcriptEligible: true,
            }));
            const internals = controllerInternals<{
                cues: typeof cues;
                currentCue: typeof cues[number] | undefined;
                selectedTrackId: string;
                updateFromLoadedCues: () => void;
                subtitleWarmupTexts: (start: number, end: number, settings: ReaderSettings) => string[];
            }>(controller);
            internals.selectedTrackId = 'file-0';
            internals.cues = cues;
            internals.updateFromLoadedCues();
            await vi.advanceTimersByTimeAsync(50);

            // Forward seek into the middle of the gap AFTER cue 45 (no active
            // cue there): the stale cue clears and the upcoming cue 46 plus
            // its lookahead warm within one turn.
            (video as { currentTime: number }).currentTime = cues[45].end + 1;
            internals.updateFromLoadedCues();
            await vi.advanceTimersByTimeAsync(50);
            expect(internals.currentCue).toBeUndefined();
            expect(internals.subtitleWarmupTexts(46, 57, settings)).toEqual([]);

            // A second gap-landing seek (no cue-state change at all) must
            // still re-anchor: backward into the gap after cue 20.
            (video as { currentTime: number }).currentTime = cues[20].end + 1;
            internals.updateFromLoadedCues();
            await vi.advanceTimersByTimeAsync(50);
            expect(internals.subtitleWarmupTexts(21, 32, settings)).toEqual([]);
        } finally {
            vi.useRealTimers();
        }
    });

    it('clears a stale cue when seeking backward to before it started', () => {
        const settings = makeSubtitleSettings();
        const { controller } = createSubtitleController(settings);
        installController(controller);
        const video = attachVideo(controller, { currentTime: 100.5 });
        const cues = [
            { start: 10, end: 12, text: '前の字幕', transcriptEligible: true },
            { start: 100, end: 102, text: '後の字幕', transcriptEligible: true },
        ];
        const internals = controllerInternals<{
            cues: typeof cues;
            currentCue: typeof cues[number] | undefined;
            selectedTrackId: string;
            updateFromLoadedCues: () => void;
            lastDomCaption: string;
        }>(controller);
        internals.selectedTrackId = 'file-0';
        internals.cues = cues;
        internals.updateFromLoadedCues();
        expect(internals.currentCue?.text).toBe('後の字幕');

        // Backward seek into the gap between the cues: the later cue must not
        // keep rendering (it used to persist because time < its end).
        (video as { currentTime: number }).currentTime = 50;
        internals.updateFromLoadedCues();
        expect(internals.currentCue).toBeUndefined();
        // The clear also resets the DOM-caption dedupe so an identical
        // caption can re-apply after the seek.
        expect(internals.lastDomCaption).toBe('');
    });

    it('keeps the primary line on screen while its auto-translated secondary cue still shows', () => {
        // Auto-generated YouTube captions and their `&tlang=` translation are
        // normalized independently, so the Japanese cue ends a beat before its
        // English translation. The Japanese line used to vanish while the
        // English one kept showing alone (user-reported).
        const settings = makeSubtitleSettings({ subtitleSecondaryVisible: true });
        const { controller } = createSubtitleController(settings);
        installController(controller);
        const video = attachVideo(controller, { currentTime: 0.5 });
        const cues = [
            { start: 0, end: 1, text: 'おはよう', transcriptEligible: true },
            { start: 3, end: 4, text: 'こんにちは', transcriptEligible: true },
        ];
        const secondaryCues = [
            { start: 0, end: 2.5, text: 'Good morning', transcriptEligible: true },
            { start: 3, end: 4, text: 'Hello', transcriptEligible: true },
        ];
        const internals = controllerInternals<{
            cues: typeof cues;
            secondaryCues: typeof secondaryCues;
            currentCue: typeof cues[number] | undefined;
            selectedTrackId: string;
            secondaryTrackId: string;
            updateFromLoadedCues: () => void;
        }>(controller);
        internals.selectedTrackId = 'yt-ja';
        internals.secondaryTrackId = 'yt-en';
        internals.cues = cues;
        internals.secondaryCues = secondaryCues;

        // Both lines active.
        internals.updateFromLoadedCues();
        expect(internals.currentCue?.text).toBe('おはよう');
        expect(document.querySelector('.jpdb-subtitle-primary')?.textContent).toContain('おはよう');
        expect(document.querySelector('.jpdb-subtitle-secondary')?.textContent).toContain('Good morning');

        // The Japanese cue has ended, but its translation still spans this
        // moment: the Japanese line must stay rather than leave English alone.
        (video as { currentTime: number }).currentTime = 2;
        internals.updateFromLoadedCues();
        expect(internals.currentCue?.text).toBe('おはよう');
        expect(document.querySelector('.jpdb-subtitle-primary')?.textContent).toContain('おはよう');
        expect(document.querySelector('.jpdb-subtitle-secondary')?.textContent).toContain('Good morning');

        // Once the translation also ends, both lines clear together.
        (video as { currentTime: number }).currentTime = 2.8;
        internals.updateFromLoadedCues();
        expect(internals.currentCue).toBeUndefined();
        expect(document.querySelector('.jpdb-subtitle-primary')).toBeNull();
        expect(document.querySelector('.jpdb-subtitle-secondary')).toBeNull();

        // The next pair takes over cleanly.
        (video as { currentTime: number }).currentTime = 3.5;
        internals.updateFromLoadedCues();
        expect(internals.currentCue?.text).toBe('こんにちは');
        expect(document.querySelector('.jpdb-subtitle-secondary')?.textContent).toContain('Hello');

        controller.destroy();
    });

    it('surfaces the aligned primary line when its auto-translated native cue starts first', () => {
        // Mirror of the hold case for the not-yet-shown direction: independent
        // normalization can make the Japanese cue START a beat after its English
        // translation, so the playhead sits inside the English cue while the
        // Japanese cue's own start is still ahead. The English line used to
        // appear alone until the Japanese cue began (user-reported); surface the
        // aligned Japanese cue so the pair shows together from the first frame.
        const settings = makeSubtitleSettings({ subtitleSecondaryVisible: true });
        const { controller } = createSubtitleController(settings);
        installController(controller);
        const video = attachVideo(controller, { currentTime: 0.5 });
        const cues = [
            { start: 0, end: 1, text: 'おはよう', transcriptEligible: true },
            { start: 3.3, end: 4.2, text: 'こんにちは', transcriptEligible: true },
        ];
        const secondaryCues = [
            { start: 0, end: 1, text: 'Good morning', transcriptEligible: true },
            { start: 3.0, end: 4.2, text: 'Hello', transcriptEligible: true },
        ];
        const internals = controllerInternals<{
            cues: typeof cues;
            secondaryCues: typeof secondaryCues;
            currentCue: typeof cues[number] | undefined;
            selectedTrackId: string;
            secondaryTrackId: string;
            updateFromLoadedCues: () => void;
        }>(controller);
        internals.selectedTrackId = 'yt-ja';
        internals.secondaryTrackId = 'yt-en';
        internals.cues = cues;
        internals.secondaryCues = secondaryCues;

        // English cue [3.0,4.2] is active; the Japanese cue starts later (3.3)
        // and is in a gap relative to the playhead, yet the pair must show.
        (video as { currentTime: number }).currentTime = 3.1;
        internals.updateFromLoadedCues();
        expect(internals.currentCue?.text).toBe('こんにちは');
        expect(document.querySelector('.jpdb-subtitle-primary')?.textContent).toContain('こんにちは');
        expect(document.querySelector('.jpdb-subtitle-secondary')?.textContent).toContain('Hello');

        controller.destroy();
    });

    it('caches keyless empty parses in the retry TTL instead of re-parsing every tick', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=empty') as unknown as Location,
        });
        vi.useFakeTimers();
        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                subtitleTranscriptAutoScroll: false,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: true,
            };
            // A cue with no annotatable words: every parse returns no tokens.
            const parseJapaneseBatch = vi.fn(async (texts: string[]) => texts.map(() => []));
            const parseJapanese = vi.fn(async () => []);
            const totalParseCalls = () => parseJapaneseBatch.mock.calls.length + parseJapanese.mock.calls.length;
            const { controller } = createSubtitleController(settings, { parseJapanese, parseJapaneseBatch });
            installController(controller);
            attachVideo(controller, { currentTime: 0.5 });
            const cues = [{ start: 0, end: 4, text: '12345', transcriptEligible: true }];
            const internals = controllerInternals<{
                cues: typeof cues;
                selectedTrackId: string;
                updateFromLoadedCues: () => void;
                subtitleEl: HTMLElement;
                render: () => void;
                emptyParsedHtmlCache: Map<string, unknown>;
            }>(controller);
            internals.selectedTrackId = 'file-0';
            internals.cues = cues;

            internals.updateFromLoadedCues();
            await vi.advanceTimersByTimeAsync(10);
            const initialParseCalls = totalParseCalls();
            expect(initialParseCalls).toBeGreaterThan(0);
            expect(internals.emptyParsedHtmlCache.size).toBe(1);

            // Within the TTL the cue is known-empty: ticks neither re-parse
            // nor render the loading shimmer.
            for (let tick = 0; tick < 6; tick++) {
                internals.updateFromLoadedCues();
                internals.render();
                await vi.advanceTimersByTimeAsync(250);
            }
            expect(totalParseCalls()).toBe(initialParseCalls);
            expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary-loading')).toBeNull();
            expect(internals.subtitleEl.textContent).toContain('12345');

            // After the TTL lapses the cue re-parses (periodic retry).
            await vi.advanceTimersByTimeAsync(2600);
            internals.updateFromLoadedCues();
            internals.render();
            await vi.advanceTimersByTimeAsync(10);
            expect(totalParseCalls()).toBeGreaterThan(initialParseCalls);
        } finally {
            vi.useRealTimers();
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('warms the normalized cue parts of a pending DOM caption so the split render hits the cache', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=split') as unknown as Location,
        });
        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                subtitleTranscriptAutoScroll: false,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: true,
            };
            const parseJapaneseBatch = vi.fn(async (texts: string[]) => texts.map(text => [makeSubtitleToken(text)]));
            const { controller } = createSubtitleController(settings, { parseJapaneseBatch });
            installController(controller);
            attachVideo(controller, { currentTime: 30 });
            const internals = controllerInternals<{
                isDomCaptionStable: (text: string, nowMs: number) => boolean;
                applyDomCaptionFallback: (text: string, selected: undefined) => void;
                subtitleEl: HTMLElement;
                currentCue: { start: number; end: number; text: string } | undefined;
                keepDomCaptionCueAlive: (text: string) => void;
                parseCacheKey: (text: string, settings: ReaderSettings) => string;
                provisionalParsedHtmlCache: Map<string, string>;
            }>(controller);

            // First sighting starts the parse DURING the stability window —
            // for the texts that will render (normalized sentence parts),
            // not the raw caption string.
            const caption = 'こんにちは先生。元気ですか。';
            expect(internals.isDomCaptionStable(caption, 1000)).toBe(false);
            expect(parseJapaneseBatch).toHaveBeenCalledTimes(1);
            expect(parseJapaneseBatch.mock.calls[0]?.[0]).toEqual(['こんにちは先生。', '元気ですか。']);
            const firstPartKey = internals.parseCacheKey('こんにちは先生。', settings);
            await vi.waitFor(() => expect(internals.provisionalParsedHtmlCache.has(firstPartKey)).toBe(true));

            // Stability passing renders the first part pre-parsed: no loading
            // shimmer, reader words present immediately.
            expect(internals.isDomCaptionStable(caption, 1300)).toBe(true);
            internals.applyDomCaptionFallback(caption, undefined);
            expect(internals.currentCue?.text).toBe('こんにちは先生。');
            expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary .jpdb-reader-word')).not.toBeNull();
            expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary-loading')).toBeNull();
            expect(parseJapaneseBatch).toHaveBeenCalledTimes(1);

            // While the page keeps showing the same caption, the synthetic
            // cue is renewed instead of expiring at its 4s guess.
            const cue = internals.currentCue!;
            const initialEnd = cue.end;
            (controllerInternals<{ video: { currentTime: number } }>(controller)).video.currentTime = initialEnd - 0.5;
            internals.keepDomCaptionCueAlive(caption);
            expect(internals.currentCue!.end).toBeGreaterThan(initialEnd);
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('re-bakes cached cue html after late enrichment so stepping back keeps pitch', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=rebake') as unknown as Location,
        });
        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                subtitleTranscriptAutoScroll: false,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: true,
                furiganaMode: 'all' as const,
            };
            // The parse returns a token with no pitch yet (local dictionaries
            // did not know it) — pitch arrives later via public enrichment.
            const parseJapaneseBatch = vi.fn(async (texts: string[]) => texts.map(text => [makeSubtitleToken(text)]));
            const { controller } = createSubtitleController(settings, { parseJapaneseBatch });
            installController(controller);
            attachVideo(controller, { currentTime: 0.5 });
            const cue = { start: 0, end: 2, text: '読む', transcriptEligible: true };
            const internals = controllerInternals<{
                cues: Array<typeof cue>;
                currentCue: typeof cue;
                selectedTrackId: string;
                parseCacheKey: (text: string, settings: ReaderSettings) => string;
                parseCueHtmlBatch: (texts: string[]) => Promise<unknown>;
                parsedTokenCache: Map<string, JPDBToken[]>;
                provisionalParsedHtmlCache: Map<string, string>;
                render: () => void;
                subtitleEl: HTMLElement;
                transcriptPanel: HTMLElement;
            }>(controller);
            internals.selectedTrackId = 'file-0';
            internals.cues = [cue];
            internals.currentCue = cue;
            const key = internals.parseCacheKey('読む', settings);

            await internals.parseCueHtmlBatch(['読む']);
            expect(internals.provisionalParsedHtmlCache.get(key)).toContain('jpdb-reader-word');
            expect(internals.provisionalParsedHtmlCache.get(key)).not.toContain('jpdb-pitch-heiban');
            // The cue is on screen with the pre-enrichment html.
            internals.render();
            expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary .jpdb-reader-word')).not.toBeNull();

            // A transcript row already hydrated with the pre-enrichment html.
            const rowText = document.createElement('strong');
            rowText.className = 'jpdb-subtitle-row-text';
            rowText.setAttribute('data-transcript-text', '');
            rowText.dataset.parseKey = key;
            rowText.dataset.parsedKey = key;
            rowText.dataset.parsedProvisional = 'true';
            rowText.innerHTML = internals.provisionalParsedHtmlCache.get(key) ?? '';
            internals.transcriptPanel.hidden = false;
            internals.transcriptPanel.replaceChildren(rowText);

            // Late enrichment mutates the cached tokens (public jpdb pitch).
            const tokens = internals.parsedTokenCache.get(key)!;
            tokens[0].pitchClass = 'heiban';
            tokens[0].card.pitchAccent = ['LHL'];
            controller.refreshParsedCueTexts(['読む']);

            // The cache, the live primary, and the hydrated transcript row all
            // carry the enriched pitch now — stepping back re-renders from
            // this html, so pitch survives Previous/Next.
            expect(internals.provisionalParsedHtmlCache.get(key)).toContain('jpdb-pitch-heiban');
            expect(internals.subtitleEl.querySelector('.jpdb-subtitle-primary .jpdb-pitch-heiban')).not.toBeNull();
            expect(rowText.querySelector('.jpdb-pitch-heiban')).not.toBeNull();
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
        expect(parseJapaneseBatch.mock.calls[0]?.[0]).toEqual(['字幕0', '字幕1', '字幕2', '字幕3', '字幕4', '字幕5', '字幕6', '字幕7']);
        expect(parseJapaneseBatch.mock.calls[0]?.[1]).toEqual(SUBTITLE_PARSE_OPTIONS);
        expect(parseJapaneseBatch.mock.calls[1]?.[0]).toEqual(['字幕8']);
    });

    it('keeps long YouTube transcript background warmup provisional and keyless', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=long-transcript') as unknown as Location,
        });
        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                subtitleTranscriptAutoScroll: false,
                apiKey: 'test-key',
                localDictionariesEnabled: false,
            };
            const parseJapaneseBatch = vi.fn(async (texts: string[], _options?: { skipJpdb?: boolean; requireJpdb?: boolean }) => texts.map(text => [makeSubtitleToken(text)]));
            const beforeRenderTokens = vi.fn(async () => undefined);
            const { controller } = createSubtitleController(settings, {
                parseJapanese: async () => [],
                parseJapaneseBatch,
                beforeRenderTokens,
            });
            const cues = Array.from({ length: 300 }, (_, index) => ({
                start: index,
                end: index + 0.8,
                text: `長い字幕${index}`,
                transcriptEligible: true,
            }));
            const rows = cues.slice(0, 48).map((cue, cueIndex) => ({ cue, cueIndex }));
            type WarmupRows = typeof rows;
            type WarmupSettings = typeof settings;
            const internals = controller as unknown as {
                cues: typeof cues;
                transcriptCacheWarmupSerial: number;
                warmTranscriptParseCache: (
                    rows: WarmupRows,
                    preferredIndex: number,
                    settings: WarmupSettings,
                    serial: number,
                ) => Promise<void>;
                parseCacheKey: (text: string, settings: ReaderSettings) => string;
                parsedHtmlCache: Map<string, string>;
                provisionalParsedHtmlCache: Map<string, string>;
            };

            internals.cues = cues;
            internals.transcriptCacheWarmupSerial = 1;
            await internals.warmTranscriptParseCache(rows, 0, settings, 1);

            expect(parseJapaneseBatch).toHaveBeenCalled();
            expect(parseJapaneseBatch.mock.calls.every(call => (call[1] as { skipJpdb?: boolean })?.skipJpdb === true)).toBe(true);
            expect(parseJapaneseBatch.mock.calls.some(call => (call[1] as { requireJpdb?: boolean })?.requireJpdb === true)).toBe(false);
            expect(beforeRenderTokens).not.toHaveBeenCalled();
            const key = internals.parseCacheKey('長い字幕0', settings);
            expect(internals.provisionalParsedHtmlCache.get(key)).toContain('jpdb-reader-word');
            expect(internals.parsedHtmlCache.has(key)).toBe(false);
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('enriches transcript background warmup html before caching future subtitle lines', async () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            subtitleTranscriptAutoScroll: false,
            apiKey: '',
            jitenApiKey: '',
            localDictionariesEnabled: false,
            furiganaMode: 'all' as const,
        };
        const token = makeSubtitleToken('本', { cardState: ['known'] });
        const parseJapaneseBatch = vi.fn(async () => [[token]]);
        const beforeRenderTokens = vi.fn(async (tokens: JPDBToken[]) => {
            tokens[0].card.reading = 'ほん';
            tokens[0].card.pitchAccent = ['HL'];
            tokens[0].pitchClass = 'atamadaka';
        });
        const { controller } = createSubtitleController(settings, {
            parseJapanese: async () => [],
            parseJapaneseBatch,
            beforeRenderTokens,
        });
        const rows = [{ cue: { start: 0, end: 1, text: '本', transcriptEligible: true }, cueIndex: 0 }];
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
            parseCacheKey: (text: string, settings: ReaderSettings) => string;
            parsedHtmlCache: Map<string, string>;
        };

        internals.transcriptCacheWarmupSerial = 1;
        await internals.warmTranscriptParseCache(rows, 0, settings, 1);

        const html = internals.parsedHtmlCache.get(internals.parseCacheKey('本', settings)) ?? '';
        expect(beforeRenderTokens).toHaveBeenCalledWith([token]);
        expect(html).toContain('jpdb-pitch-atamadaka');
        expect(html).toContain('<rt class="jpdb-reader-furi">ほん</rt>');
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
        expect(parseJapaneseBatch.mock.calls[0]?.[1]).toEqual(SUBTITLE_PARSE_OPTIONS);
        resolveBatch([[]]);

        const [firstResult, secondResult] = await Promise.all([first, second]);
        expect(firstResult[0]?.html).toContain('字幕0');
        expect(secondResult[0]?.html).toContain('字幕0');
    });

    it('seeks using the source cue index when transcript rows are filtered', () => {
        const cues = [
            { start: 2, end: 3, text: 'native line', transcriptEligible: false },
            { start: 90, end: 92, text: '日本語の行', transcriptEligible: true },
        ];
        const { internals, video } = setupTranscriptCueController(cues, {
            currentCue: cues[1],
            currentTime: 0,
            selectedTrackId: 'youtube-0',
            settings: { subtitleTranscriptAutoScroll: false },
        });

        internals.openLinesPanel();
        const row = document.querySelector<HTMLElement>('.jpdb-subtitle-list-row')!;
        row.querySelector<HTMLElement>('.jpdb-subtitle-row-text')!.innerHTML = '<span class="jpdb-reader-word" data-vid="1" data-sid="2" tabindex="-1">日本語</span>の行';
        row.querySelector<HTMLElement>('.jpdb-reader-word')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(video.currentTime).toBe(0);

        row.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(video.currentTime).toBeCloseTo(90);

        video.currentTime = 0;
        row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

        expect(video.currentTime).toBeCloseTo(90);
    });

    it('keeps fullscreen transcript pointer and click events out of the player host', () => {
        withViewport(1280, 720, () => {
            const { controller } = createInstalledSubtitleController({ subtitleTranscriptAutoScroll: false });
            const fullscreen = stubFullscreenElement(null);
            try {
                document.body.insertAdjacentHTML('beforeend', `
                    <section class="video-card">
                        <video></video>
                    </section>
                `);
                const frame = document.querySelector<HTMLElement>('.video-card')!;
                const video = document.querySelector<HTMLVideoElement>('.video-card video')!;
                mockElementRect(frame, new DOMRect(0, 0, 1280, 720));
                mockElementRect(video, new DOMRect(0, 0, 1280, 720));
                attachVideo(controller, { currentTime: 0, video });
                const cue = { start: 12, end: 14, text: '日本語の行', transcriptEligible: true };
                const internals = controllerInternals<{
                    cues: Array<typeof cue>;
                    currentCue: typeof cue;
                    openLinesPanel: () => void;
                    syncFullscreenState: () => void;
                }>(controller);
                internals.cues = [cue];
                internals.currentCue = cue;

                fullscreen.set(frame);
                internals.syncFullscreenState();
                internals.openLinesPanel();

                const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
                const row = panel.querySelector<HTMLElement>('.jpdb-subtitle-list-row')!;
                const hostClick = vi.fn();
                const hostPointerDown = vi.fn();
                frame.addEventListener('click', hostClick);
                frame.addEventListener('pointerdown', hostPointerDown);

                row.dispatchEvent(pointerEvent('pointerdown'));
                expect(hostPointerDown).not.toHaveBeenCalled();

                row.querySelector<HTMLElement>('.jpdb-subtitle-row-text')!.innerHTML = '<span class="jpdb-reader-word" data-vid="1" data-sid="2" tabindex="-1">日本語</span>の行';
                row.querySelector<HTMLElement>('.jpdb-reader-word')!
                    .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                expect(hostClick).not.toHaveBeenCalled();
                expect(video.currentTime).toBe(0);

                const rowClick = new MouseEvent('click', { bubbles: true, cancelable: true });
                row.dispatchEvent(rowClick);
                expect(rowClick.defaultPrevented).toBe(true);
                expect(hostClick).not.toHaveBeenCalled();
                expect(video.currentTime).toBeCloseTo(12);

                const link = document.createElement('a');
                link.href = 'https://www.youtube.com/watch?v=native-link';
                link.target = '_blank';
                link.textContent = 'native link';
                panel.append(link);
                const linkClick = new MouseEvent('click', { bubbles: true, cancelable: true });
                link.dispatchEvent(linkClick);
                expect(linkClick.defaultPrevented).toBe(false);
                expect(hostClick).not.toHaveBeenCalled();
            } finally {
                fullscreen.restore();
                controller.destroy();
            }
        });
    });

    it('resumes a playing video after transcript row seeking pauses it', () => {
        const { controller } = createInstalledSubtitleController({ subtitleTranscriptAutoScroll: false });

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
        const internals = controllerInternals<{
            cues: typeof cues;
            currentCue: typeof cues[number];
            openLinesPanel: () => void;
        }>(controller);
        attachVideo(controller, { video });
        internals.cues = cues;
        internals.currentCue = cues[0];

        internals.openLinesPanel();
        document.querySelector<HTMLElement>('.jpdb-subtitle-list-row')!
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(currentTime).toBeCloseTo(12);
        expect(play).toHaveBeenCalledTimes(1);
    });
});

describe('subtitle parse session persistence (UT-48)', () => {
    it('restores parsed cue html after a reload without re-parsing', async () => {
        sessionStorage.clear();
        const settings = { ...BASE_DEFAULT_SETTINGS, apiKey: 'test-key', furiganaMode: 'all' as const };
        const token = {
            card: {
                vid: 9, sid: 1, rid: 0, spelling: '読む', reading: 'よむ', frequencyRank: null,
                partOfSpeech: [], meanings: [], cardState: ['known' as const], pitchAccent: [],
                wordWithReading: null, source: 'jpdb' as const,
            },
            start: 0, end: 2, length: 2,
            rubies: [{ start: 0, end: 1, length: 1, text: 'よ' }],
            pitchClass: 'heiban', sentence: '読む',
        };
        const firstParse = vi.fn(async () => [token]);
        const first = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: firstParse,
            onSettingsChange: () => undefined,
        });
        const firstInternals = first as unknown as {
            parseCueHtml(text: string, settings?: unknown, options?: { allowProvisional?: boolean }): Promise<string>;
        };
        const html = await firstInternals.parseCueHtml('読む', settings, { allowProvisional: false });
        expect(html).toContain('jpdb-reader-word');
        expect(Object.keys(sessionStorage).some(key => key.startsWith('yomu:subtitle-parse:'))).toBe(true);

        const secondParse = vi.fn(async () => [token]);
        const second = new SubtitlePlayerController({
            getSettings: () => settings,
            parseJapanese: secondParse,
            onSettingsChange: () => undefined,
        });
        const secondInternals = second as unknown as {
            parseCueHtml(text: string, settings?: unknown, options?: { allowProvisional?: boolean }): Promise<string>;
        };
        const restored = await secondInternals.parseCueHtml('読む', settings, { allowProvisional: false });
        expect(restored).toBe(html);
        expect(secondParse).not.toHaveBeenCalled();
        sessionStorage.clear();
    });
});
