import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import {
    FloatingButtonController,
    type FloatingButtonActions,
} from '../../src/reader/ui/floating-button';
import { isAppleTouchBrowser } from '../../src/reader/platform/browser';
import { overlayPageScale } from '../../src/reader/ui/page-scale';

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
            expect(button.dataset.jpdbReaderScaleAdapter).toBeUndefined();

            setViewportMetrics({
                innerWidth: 1180,
                innerHeight: 730,
                outerWidth: 1180,
                screenWidth: 820,
                screenHeight: 1180,
            });
            window.dispatchEvent(new Event('resize'));
            flushFrames();
            expect(button.dataset.jpdbReaderScaleAdapter).toBeUndefined();

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
            expect(button.dataset.jpdbReaderScaleCompensation).toBe('0.5');

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

            expect(button.style.getPropertyValue('zoom')).toBe('');
            expect(button.dataset.jpdbReaderScaleAdapter).toBeUndefined();
            expect(button.dataset.jpdbReaderPageScale).toBeUndefined();
        } finally {
            controller.destroy();
        }
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
            expect(button.dataset.jpdbReaderScaleCompensation).toBe('0.5');

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

            expect(button.dataset.jpdbReaderScaleAdapter).toBeUndefined();
            expect(button.dataset.jpdbReaderScaleCompensation).toBeUndefined();

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
        openSettings: vi.fn(),
        openStudyPage: vi.fn(),
        cyclePowerState: vi.fn(),
        powerState: () => 'on',
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
