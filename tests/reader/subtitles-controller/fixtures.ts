import { readFileSync } from 'node:fs';
import { afterEach, expect, vi } from 'vitest';
import { LOAD_SUBTITLE_FILES_EVENT, OPEN_SUBTITLE_TRACKS_EVENT } from '../../../src/reader/app/constants';
import { DEFAULT_SETTINGS as BASE_DEFAULT_SETTINGS } from '../../../src/reader/settings/index';
import { testEnSettings } from '../helpers/settings-fixture';

// These tests assert English UI copy; pin the interface language for
// deterministic string assertions regardless of the runtime default.
export const DEFAULT_SETTINGS = testEnSettings();
import { readPageCaptionText } from '../../../src/reader/subtitles/subtitle-dom-captions';
import { requestSubtitleText, SubtitlePlayerController } from '../../../src/reader/subtitles/controller';
import type { SubtitleParsedHtmlCache } from '../../../src/reader/subtitles/parsed-html-cache';
import type { SubtitleFullscreenHost } from '../../../src/reader/subtitles/fullscreen-host';
import { subtitleCueSignature } from '../../../src/reader/subtitles/subtitle-cues';
import { renderDrawerHead } from '../../../src/reader/subtitles/subtitle-surface';
import { subtitleDrawerMetaText } from '../../../src/reader/subtitles/subtitle-track-panel';
import { SUBTITLE_DRAG_OFFSET_KEY } from '../../../src/reader/subtitles/subtitle-layout';
import { createSubtitleVideoInsetAdapter, subtitleVideoLayoutTarget } from '../../../src/reader/subtitles/subtitle-video-inset';

const installedSubtitleControllers = new Set<SubtitlePlayerController>();

import type { JPDBToken, ReaderSettings } from '../../../src/reader/app/types';
import { withViewport } from '../helpers/browser-fixtures';

export const SUBTITLES_YOUTUBE_CSS = readFileSync('src/reader/styles/subtitles-youtube.css', 'utf8');
export const AUTHORITATIVE_SUBTITLE_PARSE_OPTIONS = {
    requireJpdb: true,
    allowSegmentedFallback: true,
    includeLocalPitch: true,
};

export async function withMatchMedia<T>(matches: (query: string) => boolean, callback: () => T | Promise<T>): Promise<T> {
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

export async function withSubtitleRequestStubs<T>(
    pageUrl: string,
    fetchMock: unknown,
    gmRequest: unknown,
    callback: () => T | Promise<T>,
): Promise<T> {
    const originalLocation = window.location;
    const originalFetch = globalThis.fetch;
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: new URL(pageUrl) as unknown as Location,
    });
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });
    vi.stubGlobal('GM_xmlhttpRequest', gmRequest);
    try {
        return await callback();
    } finally {
        Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
        Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
        vi.unstubAllGlobals();
    }
}

export function stubFullscreenElement(initial: Element | null): { set: (value: Element | null) => void; restore: () => void } {
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

export function mockElementRect(element: Element, rect: DOMRect): void {
    Object.defineProperty(element, 'getBoundingClientRect', {
        configurable: true,
        value: () => rect,
    });
}

export function expectSubtitlePanelActionsAbsent(panel: ParentNode, actions: readonly string[]): void {
    actions.forEach(action => expect(panel.querySelector(`[data-action="panel-${action}"]`)).toBeNull());
}

export function mockNetflixCaptionGeometry(element: HTMLElement): void {
    Object.defineProperty(element, 'innerText', {
        configurable: true,
        get: () => element.textContent ?? '',
    });
    mockElementRect(element, { left: 300, right: 820, top: 452, bottom: 530, width: 520, height: 78 } as DOMRect);
}

export type SubtitleControllerOptions = ConstructorParameters<typeof SubtitlePlayerController>[0];
export type SubtitleControllerHooks = Partial<Omit<SubtitleControllerOptions, 'getSettings'>>;

export function makeSubtitleSettings<TOverrides extends Partial<ReaderSettings> = Record<string, never>>(
    overrides?: TOverrides,
): ReaderSettings & TOverrides {
    return {
        ...DEFAULT_SETTINGS,
        apiKey: '',
        localDictionariesEnabled: false,
        ...overrides,
    } as ReaderSettings & TOverrides;
}

export function controllerInternals<TInternals>(controller: SubtitlePlayerController): TInternals {
    return controller as unknown as TInternals;
}

export function createSubtitleController<TSettings extends ReaderSettings>(
    settings: TSettings,
    hooks: SubtitleControllerHooks = {},
): { settings: TSettings; controller: SubtitlePlayerController } {
    const controller = new SubtitlePlayerController({
        getSettings: () => settings,
        parseJapanese: hooks.parseJapanese ?? (async () => []),
        ...(hooks.parseJapaneseBatch ? { parseJapaneseBatch: hooks.parseJapaneseBatch } : {}),
        ...(hooks.beforeRenderTokens ? { beforeRenderTokens: hooks.beforeRenderTokens } : {}),
        ...(hooks.afterParseTokens ? { afterParseTokens: hooks.afterParseTokens } : {}),
        ...(hooks.onTranscriptPanelClosed ? { onTranscriptPanelClosed: hooks.onTranscriptPanelClosed } : {}),
        onSettingsChange: hooks.onSettingsChange ?? (() => undefined),
    });
    return { settings, controller };
}

export function installController(controller: SubtitlePlayerController): void {
    controllerInternals<{ install: () => void }>(controller).install();
}

export function createInstalledSubtitleController<TOverrides extends Partial<ReaderSettings> = Record<string, never>>(
    overrides?: TOverrides,
    hooks: SubtitleControllerHooks = {},
): { settings: ReaderSettings & TOverrides; controller: SubtitlePlayerController } {
    const settings = makeSubtitleSettings(overrides);
    const setup = createSubtitleController(settings, hooks);
    installController(setup.controller);
    installedSubtitleControllers.add(setup.controller);
    return setup;
}

export function attachVideo(
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
    const internals = controllerInternals<{
        video: HTMLVideoElement;
        runtimeSignalsInitialized: boolean;
        syncRuntimeSignals: () => void;
    }>(controller);
    internals.video = video;
    // Production binds a video through useDiscoveredVideoCandidate, which
    // re-syncs the runtime observer (childList-only 'discovery' -> full
    // attribute observer) and wakes the tick. Mirror that here so a test that
    // ran init() before attaching a video gets the full observer, exactly as
    // the live controller would. install()-only tests leave the flag false, so
    // this stays a no-op for them.
    if (internals.runtimeSignalsInitialized) internals.syncRuntimeSignals();
    return video;
}

export function setupInstalledVideoController(
    rect: DOMRect,
    overrides?: Partial<ReaderSettings>,
): { controller: SubtitlePlayerController; root: HTMLElement; video: HTMLVideoElement } {
    const { controller } = createInstalledSubtitleController(overrides);
    const video = attachVideo(controller, { rect });
    controller.refresh();
    const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
    return { controller, root, video };
}

export type TestSubtitleCue = { start: number; end: number; text: string; transcriptEligible: boolean };

interface YouTubeStageInternals {
    cues: TestSubtitleCue[];
    currentCue: TestSubtitleCue;
    secondaryCue?: TestSubtitleCue;
    alignToVideo: () => void;
    hideControlsImmediately: () => void;
    render: () => void;
    syncPlayerChromeIdleState: () => void;
}

const YOUTUBE_PLAYER_STAGE_HTML = '<div id="movie_player" class="html5-video-player ytp-autohide" tabindex="-1"><video></video></div>';

// The stage every "what does a press on the subtitle rectangle do" test needs:
// a YouTube-shaped player whose chrome has faded, a 640x360 video rect, one
// active cue, and the painted subtitle frame resolved. Assembling it by hand
// per test drifted, so the geometry two tests reason about is defined once.
export function mountYouTubePlayerSubtitleController<TInternals extends object = Record<string, never>>(
    options: {
        cue?: TestSubtitleCue;
        extraBodyHtml?: string;
        hooks?: SubtitleControllerHooks;
        settings?: Partial<ReaderSettings>;
    } = {},
): {
    controller: SubtitlePlayerController;
    cue: TestSubtitleCue;
    internals: TInternals & YouTubeStageInternals;
    root: HTMLElement;
    settings: ReaderSettings;
    subtitleFrame: HTMLElement;
    video: HTMLVideoElement;
} {
    document.body.innerHTML = `${YOUTUBE_PLAYER_STAGE_HTML}${options.extraBodyHtml ?? ''}`;
    const cue = options.cue ?? { start: 0, end: 2, text: '今日は読む。', transcriptEligible: true };
    const { controller, settings } = createSubtitleController(
        makeSubtitleSettings({ subtitleOverlayVisible: true, ...options.settings }),
        options.hooks ?? {},
    );
    controller.init();
    const video = document.querySelector<HTMLVideoElement>('video')!;
    mockElementRect(video, new DOMRect(0, 0, 640, 360));
    mockElementRect(document.querySelector<HTMLElement>('#movie_player')!, new DOMRect(0, 0, 640, 360));
    attachVideo(controller, { video });
    const internals = controllerInternals<TInternals & YouTubeStageInternals>(controller);
    internals.cues = [cue];
    internals.currentCue = cue;
    controller.refresh();
    internals.alignToVideo();
    const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
    // Production stamps this from the render tick once a cue paints; set it
    // directly so the geometric subtitle-surface gate is live immediately.
    root.classList.add('jpdb-subtitle-has-lines');
    const subtitleFrame = root.querySelector<HTMLElement>('.jpdb-subtitle-text')!;
    return { controller, cue, internals, root, settings, subtitleFrame, video };
}

export function setupTranscriptCueController<
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

export function openSingleCueTranscript(controller: SubtitlePlayerController, text = '全画面の字幕。'): void {
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

export function expectFullscreenPanelDisplayOverride(panel: HTMLElement): void {
    expect(panel.hidden).toBe(false);
    expect(panel.classList.contains('jpdb-subtitle-fullscreen')).toBe(true);
    expect(panel.style.getPropertyValue('display')).toBe('grid');
    expect(panel.style.getPropertyPriority('display')).toBe('important');
}

export function setSingleJapaneseSubtitleTrack(controller: SubtitlePlayerController): void {
    controllerInternals<{ tracks: unknown[] }>(controller).tracks = [{
        id: 'youtube-ja',
        kind: 'youtube',
        label: 'Japanese',
        language: 'ja',
        cues: [],
    }];
}

export function subtitlePanelToggleElements(): { root: HTMLElement; panel: HTMLElement; button: HTMLButtonElement } {
    const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
    const panel = document.querySelector<HTMLElement>('.jpdb-subtitle-list')!;
    const button = root.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="panel"]')!;
    return { root, panel, button };
}

export function setSubtitleStyleControlValue(popover: HTMLElement, name: string, value: string): void {
    const input = popover.querySelector<HTMLInputElement>(`[data-subtitle-style-setting="${name}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

export function setSubtitleStyleSelectValue(popover: HTMLElement): void {
    const select = popover.querySelector<HTMLSelectElement>('[data-subtitle-style-setting="subtitleFontFamily"]')!;
    const serifOption = [...select.options].find(option => option.value.includes('Noto Serif JP'))!;
    select.value = serifOption.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
}

export function expectJapaneseTracksPanelOpen(panel: HTMLElement): void {
    expect(panel.hidden).toBe(false);
    expect(panel.classList.contains('jpdb-subtitle-tracks-panel')).toBe(true);
    expect(panel.querySelector('.jpdb-subtitle-track-row')?.textContent).toContain('Japanese');
}

export function handlePointerActivity(
    controller: SubtitlePlayerController,
    point: Pick<PointerEvent, 'clientX' | 'clientY'> = { clientX: 100, clientY: 100 },
): void {
    controllerInternals<{ handlePointerActivity: (event: Pick<PointerEvent, 'clientX' | 'clientY'>) => void }>(controller)
        .handlePointerActivity(point);
}

export function pointerEvent(
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

export async function expectSubtitleControlsReturnToIdle(
    controller: SubtitlePlayerController,
    root: HTMLElement,
): Promise<void> {
    expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);

    handlePointerActivity(controller);

    expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(false);

    await vi.advanceTimersByTimeAsync(2600);

    expect(root.classList.contains('jpdb-subtitle-controls-idle')).toBe(true);
}

export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void } {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });
    return { promise, resolve, reject };
}

export function makeSubtitleToken(
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

export function registerSubtitleControllerCleanup(): void {
    // UT-48 session parse cache: clear between tests so persisted cue html from
    // one test cannot satisfy another test's parse expectations.
    afterEach(() => {
        for (const controller of installedSubtitleControllers) controller.destroy();
        installedSubtitleControllers.clear();
        for (const key of Object.keys(sessionStorage)) {
            if (key.startsWith('yomu:subtitle-parse:')) sessionStorage.removeItem(key);
        }
        // The remembered manual subtitle position persists via gmStorage (localStorage
        // in tests); clear it so a drag in one test cannot leak into the next.
        localStorage.removeItem(SUBTITLE_DRAG_OFFSET_KEY);
        localStorage.removeItem('jpdb-reader-transcript-panel-size');
    });
}

export {
    BASE_DEFAULT_SETTINGS,
    LOAD_SUBTITLE_FILES_EVENT,
    OPEN_SUBTITLE_TRACKS_EVENT,
    readPageCaptionText,
    requestSubtitleText,
    subtitleCueSignature,
    renderDrawerHead,
    subtitleDrawerMetaText,
    createSubtitleVideoInsetAdapter,
    subtitleVideoLayoutTarget,
    withViewport,
    SubtitlePlayerController,
};
export type {
    JPDBToken,
    ReaderSettings,
    SubtitleParsedHtmlCache,
    SubtitleFullscreenHost,
};
