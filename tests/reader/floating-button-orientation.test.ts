import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import {
    FloatingButtonController,
    type FloatingButtonActions,
} from '../../src/reader/ui/floating-button';
import { isAppleTouchBrowser } from '../../src/reader/platform/browser';
import { overlayPageScale } from '../../src/reader/ui/page-scale';
import { stubFloatingButtonActions } from "./jpdb/fixtures";
import { DEFAULT_SETTINGS as DEFAULT_SETTINGS2, FloatingButtonController as FloatingButtonController2, mockFloatingButtonRects, registerReaderHelpersCleanup, withImmediateAnimationFrame, withViewport } from "./jpdb/fixtures";
import type { ReaderSettings } from "./jpdb/fixtures";

interface ViewportMetrics {
    innerWidth: number;
    innerHeight: number;
    outerWidth: number;
    screenWidth: number;
    screenHeight: number;
}

interface SavedDescriptor {
    key: PropertyKey;
    descriptor?: PropertyDescriptor;
    target: object;
}

const savedDescriptors: SavedDescriptor[] = [];
let pendingFrames: FrameRequestCallback[] = [];
let rafSpy: MockInstance<[FrameRequestCallback], number>;
let rectSpy: MockInstance<[], DOMRect>;

beforeEach(() => {
    vi.useFakeTimers();
    pendingFrames = [];
    rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
        pendingFrames.push(callback);
        return pendingFrames.length;
    });
    rectSpy = vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockImplementation(function rect(this: HTMLButtonElement) {
        const styleLeft = Number.parseFloat(this.style.left);
        const styleTop = Number.parseFloat(this.style.top);
        return new DOMRect(
            Number.isFinite(styleLeft) ? styleLeft : 200,
            Number.isFinite(styleTop) ? styleTop : 300,
            52,
            52,
        );
    });
    setMetric(navigator, 'platform', 'MacIntel');
    setMetric(navigator, 'userAgent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit Safari');
    setMetric(navigator, 'maxTouchPoints', 5);
});

afterEach(() => {
    rectSpy.mockRestore();
    rafSpy.mockRestore();
    while (savedDescriptors.length) {
        const saved = savedDescriptors.pop()!;
        if (saved.descriptor) Object.defineProperty(saved.target, saved.key, saved.descriptor);
        else delete (saved.target as Record<PropertyKey, unknown>)[saved.key];
    }
    document.body.replaceChildren();
    vi.useRealTimers();
});

describe('floating button iPad orientation scale', () => {
    it('clears a transient half-scale after portrait → landscape → portrait metrics settle', () => {
        const controller = installPuck({
            innerWidth: 820,
            innerHeight: 1090,
            outerWidth: 820,
            screenWidth: 820,
            screenHeight: 1180,
        });

        try {
            const button = puck();
            expect(button.parentElement!.dataset.jpdbReaderScaleAdapter).toBeUndefined();

            setViewportMetrics({
                innerWidth: 1180,
                innerHeight: 730,
                outerWidth: 1180,
                screenWidth: 820,
                screenHeight: 1180,
            });
            window.dispatchEvent(new Event('resize'));
            flushFrames();
            expect(button.parentElement!.dataset.jpdbReaderScaleAdapter).toBeUndefined();

            // During the return to portrait, iPadOS can briefly expose a layout
            // width that looks exactly like 200% Safari page zoom.
            setViewportMetrics({
                innerWidth: 410,
                innerHeight: 545,
                outerWidth: 410,
                screenWidth: 820,
                screenHeight: 1180,
            });
            expect(currentPageScale()).toBe(2);
            window.dispatchEvent(new Event('resize'));
            expect(pendingFrames).toHaveLength(1);
            flushFrames();
            expect(button.parentElement!.dataset.jpdbReaderScaleCompensation).toBe('0.5');

            // The metrics settle without another reliable window resize.
            setViewportMetrics({
                innerWidth: 820,
                innerHeight: 1090,
                outerWidth: 820,
                screenWidth: 820,
                screenHeight: 1180,
            });
            vi.advanceTimersByTime(240);
            flushFrames();

            expect(button.parentElement!.style.getPropertyValue('zoom')).toBe('');
            expect(button.parentElement!.dataset.jpdbReaderScaleAdapter).toBeUndefined();
            expect(button.parentElement!.dataset.jpdbReaderPageScale).toBeUndefined();
        } finally {
            controller.destroy();
        }
    });

    it('updates its visible-screen plane within a frame of pinch resize and pan', () => {
        const visual = Object.assign(new EventTarget(), { width: 390, height: 700, scale: 1, offsetLeft: 0, offsetTop: 0 });
        setMetric(window, 'visualViewport', visual);
        const controller = installPuck({ innerWidth: 390, innerHeight: 700, outerWidth: 390, screenWidth: 390, screenHeight: 844 });
        try {
            const root = puck().parentElement!;
            Object.assign(visual, { width: 195, height: 350, scale: 2, offsetLeft: 40, offsetTop: 80 });
            visual.dispatchEvent(new Event('resize'));
            expect(pendingFrames).toHaveLength(1);
            flushFrames();
            expect(root.dataset.jpdbReaderScaleCompensation).toBe('0.5');
            expect(root.style.width).toBe('390px');
            expect(root.style.height).toBe('700px');
            expect(root.style.left).toBe('80px');
            expect(root.style.top).toBe('160px');
            Object.assign(visual, { offsetLeft: 75, offsetTop: 130 });
            visual.dispatchEvent(new Event('scroll'));
            flushFrames();
            expect(root.style.left).toBe('150px');
            expect(root.style.top).toBe('260px');
            Object.assign(visual, { width: 390, height: 700, scale: 1, offsetLeft: 0, offsetTop: 0 });
            visual.dispatchEvent(new Event('resize'));
            flushFrames();
            expect(root.style.getPropertyValue('zoom')).toBe('');
            controller.destroy();
            expect(root.isConnected).toBe(false);
            visual.dispatchEvent(new Event('scroll'));
            expect(pendingFrames).toHaveLength(0);
        } finally { controller.destroy(); }
    });

    it('does not treat a classic desktop scrollbar as pinch zoom', () => {
        // A 15px always-visible scrollbar (desktop Linux/Windows, or macOS set to
        // always show them): innerWidth includes it; the visual viewport and the
        // root's client width do not. The pinch arithmetic is platform-neutral.
        setMetric(document.documentElement, 'clientWidth', 1009);
        const visual = Object.assign(new EventTarget(), { width: 1009, height: 768, scale: 1, offsetLeft: 0, offsetTop: 0 });
        setMetric(window, 'visualViewport', visual);
        const controller = installPuck({ innerWidth: 1024, innerHeight: 768, outerWidth: 1024, screenWidth: 1024, screenHeight: 768 });
        try {
            const root = puck().parentElement!;
            expect(root.dataset.jpdbReaderScaleCompensation).toBeUndefined();
            expect(root.style.getPropertyValue('zoom')).toBe('');
            expect(root.style.width).toBe('1009px');
            // A real pinch on the same page is still compensated.
            Object.assign(visual, { width: 504.5, height: 384, scale: 2 });
            visual.dispatchEvent(new Event('resize'));
            flushFrames();
            expect(root.dataset.jpdbReaderScaleCompensation).toBe('0.5');
        } finally { controller.destroy(); }
    });

    it('reconciles rendered scale before deriving drag coordinates after rotation', () => {
        const controller = installPuck({
            innerWidth: 410,
            innerHeight: 545,
            outerWidth: 410,
            screenWidth: 820,
            screenHeight: 1180,
        });

        try {
            const button = puck();
            expect(button.parentElement!.dataset.jpdbReaderScaleCompensation).toBe('0.5');

            // Reproduce the stale adapter window: layout metrics are back to
            // normal, but the earlier inverse zoom is still stamped on the puck.
            setViewportMetrics({
                innerWidth: 820,
                innerHeight: 1090,
                outerWidth: 820,
                screenWidth: 820,
                screenHeight: 1180,
            });
            button.dispatchEvent(pointerEvent('pointerdown', 210, 310, 41));

            expect(button.parentElement!.dataset.jpdbReaderScaleAdapter).toBeUndefined();
            expect(button.parentElement!.dataset.jpdbReaderScaleCompensation).toBeUndefined();

            button.dispatchEvent(pointerEvent('pointermove', 310, 410, 41));
            flushFrames();
            expect(button.style.getPropertyValue('transform')).toBe('translate3d(100px, 100px, 0)');

            button.dispatchEvent(pointerEvent('pointerup', 310, 410, 41));
            expect(button.style.left).toBe('300px');
            expect(button.style.top).toBe('400px');
        } finally {
            controller.destroy();
        }
    });
});

function installPuck(metrics: ViewportMetrics): FloatingButtonController {
    setViewportMetrics(metrics);
    expect(isAppleTouchBrowser()).toBe(true);
    const controller = new FloatingButtonController();
    controller.install(
        { ...DEFAULT_SETTINGS, showFloatingButton: true },
        vi.fn(),
        floatingButtonActions(),
    );
    flushFrames();
    return controller;
}

function puck(): HTMLButtonElement {
    const button = document.querySelector<HTMLButtonElement>('.jpdb-reader-fab');
    if (!button) throw new Error('Expected the settings puck to be installed');
    return button;
}

function setViewportMetrics(metrics: ViewportMetrics): void {
    setMetric(window, 'innerWidth', metrics.innerWidth);
    setMetric(window, 'innerHeight', metrics.innerHeight);
    setMetric(window, 'outerWidth', metrics.outerWidth);
    setMetric(window.screen, 'width', metrics.screenWidth);
    setMetric(window.screen, 'height', metrics.screenHeight);
}

function currentPageScale(): number {
    return overlayPageScale({
        appleTouch: isAppleTouchBrowser(),
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
    });
}

function setMetric(target: object, key: PropertyKey, value: unknown): void {
    if (!savedDescriptors.some(saved => saved.target === target && saved.key === key)) {
        savedDescriptors.push({
            target,
            key,
            descriptor: Object.getOwnPropertyDescriptor(target, key),
        });
    }
    Object.defineProperty(target, key, {
        configurable: true,
        value,
    });
}

function flushFrames(): void {
    const frames = pendingFrames;
    pendingFrames = [];
    frames.forEach(frame => frame(0));
}

function pointerEvent(type: string, clientX: number, clientY: number, pointerId: number): PointerEvent {
    const event = new MouseEvent(type, {
        bubbles: true,
        button: type === 'pointerdown' ? 0 : undefined,
        cancelable: true,
        clientX,
        clientY,
    }) as PointerEvent;
    Object.defineProperties(event, {
        pointerId: { configurable: true, value: pointerId },
        pointerType: { configurable: true, value: 'touch' },
    });
    return event;
}

function floatingButtonActions(): FloatingButtonActions {
    return {
        dismissLookup: vi.fn(),
        openSettings: vi.fn(),
        openStudyPage: vi.fn(),
        cyclePowerState: vi.fn(async () => undefined),
        powerState: () => 'on',
        toggleFurigana: vi.fn(async () => undefined),
        isPaused: () => false,
        toggleOcrMode: vi.fn(),
        ocrMode: () => 'off',
        toggleAutoPlayAudio: vi.fn(),
        isAutoPlayAudioEnabled: () => true,
        toggleJapaneseSiteLanguage: vi.fn(),
        isYouTube: () => false,
        toggleYoutubeFilter: vi.fn(),
        isYoutubeFilterEnabled: () => false,
        toggleAutoSubtitles: vi.fn(),
        isAutoSubtitlesEnabled: () => false,
        hasSubtitleVideo: () => false,
    };
}

describe('where the puck rests', () => {
    // A bottom transcript sheet hides the puck only while the puck rests where the
    // sheet goes. A learner who moved it up out of the way keeps the puck, and with
    // it power, OCR and Settings, while the transcript is open.
    function puckRest(position: { puckPositionX?: number; puckPositionY?: number }): string | undefined {
        const controller = new FloatingButtonController();
        controller.install({ ...DEFAULT_SETTINGS, showFloatingButton: true, ...position }, vi.fn(), stubFloatingButtonActions());
        try {
            return document.querySelector<HTMLElement>('.jpdb-reader-fab')?.dataset.puckRest;
        } finally {
            controller.destroy();
        }
    }


    afterEach(() => { document.body.innerHTML = ''; });

    it('rests at the bottom until the learner places it', () => {
        expect(puckRest({})).toBe('bottom');
    });

    it('follows a placed puck into the top or bottom half of the window', () => {
        expect(window.innerHeight).toBeGreaterThan(200);
        expect(puckRest({ puckPositionX: 20, puckPositionY: 24 })).toBe('top');
        expect(puckRest({ puckPositionX: 20, puckPositionY: window.innerHeight - 80 })).toBe('bottom');
    });
});

describe("floating button target actions", () => {
    registerReaderHelpersCleanup();

    type FloatingButtonActionOverrides = Parameters<typeof stubFloatingButtonActions>[0];

    function openFloatingButton(options: {
        actions?: FloatingButtonActionOverrides;
        settings?: Partial<ReaderSettings>;
    } = {}): { controller: FloatingButtonController2; dispose: () => void } {
        const controller = new FloatingButtonController2();
        const restoreRects = mockFloatingButtonRects(760, 520);
        withViewport(1200, 900, () => withImmediateAnimationFrame(() => {
            controller.install(
                { ...DEFAULT_SETTINGS2, showFloatingButton: true, ...options.settings },
                vi.fn(),
                stubFloatingButtonActions(options.actions),
            );
            document.querySelector<HTMLButtonElement>('.jpdb-reader-fab')?.click();
        }));
        return {
            controller,
            dispose: () => {
                controller.destroy();
                restoreRects();
                document.body.innerHTML = '';
            },
        };
    }

    describe('floating button actions', () => {
        it('forwards the original Settings click so Study can open within that gesture', () => {
            const openSettings = vi.fn();
            const mounted = openFloatingButton({ actions: { openSettings } });
            try {
                const event = new MouseEvent('click', { bubbles: true, cancelable: true });
                document.querySelector('[data-radial-id="settings"]')!.dispatchEvent(event);
                expect(openSettings).toHaveBeenCalledWith(event);
            } finally { mounted.dispose(); }
        });
        // Toasts step aside from the open menu through an <html> class, not body:has().
        it('mirrors the open radial menu onto <html> until it closes', () => {
            const pageClass = () => document.documentElement.classList.contains('jpdb-reader-fab-radial-open');
            const mounted = openFloatingButton();
            try {
                expect(document.querySelector('.jpdb-reader-fab-radial.is-open')).not.toBeNull();
                expect(pageClass()).toBe(true);
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                expect(document.querySelector('.jpdb-reader-fab-radial.is-open')).toBeNull();
                expect(pageClass()).toBe(false);
                withImmediateAnimationFrame(() => document.querySelector<HTMLButtonElement>('.jpdb-reader-fab')?.click());
                expect(pageClass()).toBe(true);
            } finally { mounted.dispose(); }
            expect(pageClass()).toBe(false);
        });
        it('names its actions without restating the language', () => {
            const mounted = openFloatingButton({ actions: { hasSubtitleVideo: () => true, isYouTube: () => true } });
            try {
                const puck = document.querySelector<HTMLButtonElement>('.jpdb-reader-fab');
                expect(puck?.getAttribute('aria-label')).toBe('よむ on');
                expect(puck?.dataset.targetLanguage).toBeUndefined();
                expect(document.querySelector('[data-radial-id="study"]')?.getAttribute('aria-label')).toBe('Study');
                expect(document.querySelector('[data-radial-id="power"]')?.getAttribute('aria-label')).toBe('よむ on');
                expect(document.querySelector('[data-radial-id="subtitles"]')?.getAttribute('aria-label')).toBe('Auto-detect subtitles');
                expect(document.querySelector('[data-radial-id="subtitles"] svg')).not.toBeNull();
                expect(document.querySelector('[data-radial-id="youtube"]')?.getAttribute('aria-label')).toBe('Japanese YouTube only');
                expect(document.querySelector('[data-radial-id="japanese-site"]')?.getAttribute('aria-label')).toBe('Request Japanese sites');
            } finally {
                mounted.dispose();
            }
        });

        it('names the same actions in the Japanese interface', () => {
            const mounted = openFloatingButton({
                actions: { hasSubtitleVideo: () => true, isYouTube: () => true },
                settings: { interfaceLanguage: 'ja' },
            });
            try {
                expect(document.querySelector('[data-radial-id="study"]')?.getAttribute('aria-label')).toBe('学習');
                expect(document.querySelector('[data-radial-id="subtitles"]')?.getAttribute('aria-label')).toBe('字幕を自動検出');
                expect(document.querySelector('[data-radial-id="youtube"]')?.getAttribute('aria-label')).toBe('日本語のYouTubeのみ');
                expect(document.querySelector('[data-radial-id="japanese-site"]')?.getAttribute('aria-label')).toBe('日本語版サイトをリクエスト');
                expect(document.querySelector('[data-radial-id="power"]')?.getAttribute('aria-label')).toBe('よむ オン');
                expect(document.querySelector('.jpdb-reader-fab')?.getAttribute('aria-label')).toBe('よむ オン');
            } finally {
                mounted.dispose();
            }
        });
    });

    describe('the open puck menu after a settings echo', () => {
        // A saved toggle comes back through install(), sometimes after a later
        // write has already landed. The open menu must follow the settings, not
        // keep the label it had when the item was pressed.
        it('relabels the power item when the reader state changes underneath it', () => {
            let state: 'on' | 'paused' = 'on';
            const actions = { powerState: () => state, isPaused: () => state === 'paused' };
            const mounted = openFloatingButton({ actions });
            state = 'paused';
            mounted.controller.install({ ...DEFAULT_SETTINGS2, showFloatingButton: true }, vi.fn(), stubFloatingButtonActions(actions));
            try {
                const power = () => document.querySelector('[data-radial-id="power"]')?.getAttribute('aria-label');
                expect(power()).toBe('よむ off');
                state = 'on';
                mounted.controller.install({ ...DEFAULT_SETTINGS2, showFloatingButton: true }, vi.fn(), stubFloatingButtonActions(actions));
                expect(power()).toBe('よむ on');
                expect(document.querySelector('.jpdb-reader-fab')?.getAttribute('aria-label')).toBe('よむ on');
            } finally {
                mounted.dispose();
            }
        });

        it('shows the state a press lands in once its save settles, not the state before it', async () => {
            // Resuming from off lands only after its save: the state changes when the
            // press's promise resolves, not when the item is pressed.
            let state: 'on' | 'paused' = 'on';
            let finishSave!: () => void;
            const cyclePowerState = vi.fn(() => new Promise<void>(resolve => { finishSave = resolve; }).then(() => { state = 'on'; }));
            const mounted = openFloatingButton({ actions: { cyclePowerState, powerState: () => state, isPaused: () => state === 'paused' } });
            state = 'paused';
            mounted.controller.install({ ...DEFAULT_SETTINGS2, showFloatingButton: true }, vi.fn(), stubFloatingButtonActions({ cyclePowerState, powerState: () => state }));
            try {
                const power = () => document.querySelector<HTMLButtonElement>('[data-radial-id="power"]')!;
                power().click();
                expect(cyclePowerState).toHaveBeenCalledOnce();
                expect(power().getAttribute('aria-label')).toBe('よむ off');

                finishSave();
                await vi.waitFor(() => expect(power().getAttribute('aria-label')).toBe('よむ on'));
                expect(power().classList.contains('is-on')).toBe(true);
                expect(document.querySelector('.jpdb-reader-fab-radial.is-open')).not.toBeNull();
            } finally {
                mounted.dispose();
            }
        });
    });
});
