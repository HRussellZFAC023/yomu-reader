import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReaderApp } from '../../src/reader/app/main';
import type { ReaderSettings } from '../../src/reader/app/types';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import { createPointerEvent } from './helpers/browser-fixtures';

interface TapLookupInternals {
    settings: ReaderSettings;
    beginTapLookup(event: PointerEvent): void;
    updateTapLookup(event: PointerEvent): void;
    finishTapLookup(event: PointerEvent): void;
    cancelTapLookup(event: PointerEvent): void;
    handleDocumentClick(event: MouseEvent): void;
    showLookupCandidate: (...args: unknown[]) => Promise<void>;
}

const cleanups: Array<() => void> = [];
type FixturePointer = ReturnType<typeof fixture>['pointer'];
const nativeGestureReleases: Array<[string, (pointer: FixturePointer) => PointerEvent]> = [
    ['move', pointer => { pointer('pointermove', { clientY: 60 }); return pointer('pointerup'); }],
    ['release-moved', pointer => pointer('pointerup', { clientY: 60 })],
    ['cancel', pointer => { pointer('pointercancel'); return pointer('pointerup'); }],
    ['hold', pointer => { vi.advanceTimersByTime(700); return pointer('pointerup'); }],
];

function fixture(markup = '<p id="text">辞書を使用します。</p>') {
    document.body.innerHTML = `<main>${markup}<a id="source" href="#source">出典</a></main>`;
    const target = document.getElementById('text')!;
    const text = target.firstChild;
    const caretDescriptor = Object.getOwnPropertyDescriptor(document, 'caretPositionFromPoint');
    const rectDescriptor = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
    Object.defineProperty(document, 'caretPositionFromPoint', { configurable: true, value: () => ({ offsetNode: text, offset: 0 }) });
    Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [new DOMRect(20, 20, 24, 24)] });
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(target);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const app = new ReaderApp();
    const internals = app as unknown as TapLookupInternals;
    internals.settings = { ...DEFAULT_SETTINGS, lookupOnClick: true, popupActivationMode: 'click' };
    const shown = vi.fn().mockResolvedValue(undefined);
    internals.showLookupCandidate = shown;
    const abort = new AbortController();
    const options = { capture: true, signal: abort.signal };
    document.addEventListener('pointerdown', event => internals.beginTapLookup(event), options);
    document.addEventListener('pointermove', event => internals.updateTapLookup(event), options);
    document.addEventListener('pointerup', event => internals.finishTapLookup(event), options);
    document.addEventListener('pointercancel', event => internals.cancelTapLookup(event), options);
    document.addEventListener('click', event => internals.handleDocumentClick(event), options);
    cleanups.push(() => {
        abort.abort();
        app.destroy();
        if (caretDescriptor) Object.defineProperty(document, 'caretPositionFromPoint', caretDescriptor);
        else Reflect.deleteProperty(document, 'caretPositionFromPoint');
        if (rectDescriptor) Object.defineProperty(Range.prototype, 'getClientRects', rectDescriptor);
        else Reflect.deleteProperty(Range.prototype, 'getClientRects');
    });
    const pointer = (type: string, overrides = {}) => {
        const event = createPointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: 30, clientY: 30, ...overrides });
        target.dispatchEvent(event);
        return event;
    };
    const click = (clickTarget = target, overrides = {}) => {
        const event = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, clientX: 30, clientY: 30, ...overrides });
        clickTarget.dispatchEvent(event);
        return event;
    };
    return { target, pointer, click, shown, internals };
}

function subtitleFixture(text = '<div id="text" class="jpdb-subtitle-primary">字幕です</div>', initiallyPaused = false) {
    const tap = fixture(`<div class="jpdb-subtitle-player" data-jpdb-reader-root><div class="jpdb-subtitle-text">${text}</div></div>`);
    tap.internals.settings.subtitleMiningPause = true;
    const video = document.createElement('video');
    let paused = initiallyPaused;
    const pause = vi.fn(() => { paused = true; video.dispatchEvent(new Event('pause')); });
    Object.defineProperties(video, {
        readyState: { value: 4 }, paused: { get: () => paused }, ended: { value: false },
        pause: { value: pause },
        getBoundingClientRect: { value: () => new DOMRect(0, 0, 960, 540) },
    });
    document.body.prepend(video);
    return { ...tap, pause, video };
}

afterEach(() => {
    cleanups.splice(0).reverse().forEach(cleanup => cleanup());
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.replaceChildren();
});

describe('unannotated text touch lookup', () => {
    it('leaves events with no active touch alone', () => {
        const { pointer, shown } = fixture();
        pointer('pointermove');
        pointer('pointercancel');
        expect(pointer('pointerup').defaultPrevented).toBe(false);
        expect(shown).not.toHaveBeenCalled();
    });

    it('opens on release even when the host never dispatches a compatibility click', () => {
        const { pointer, shown, target } = fixture();
        pointer('pointerdown');
        pointer('pointermove', { clientX: 35 });
        expect(pointer('pointerup').defaultPrevented).toBe(true);
        expect(shown).toHaveBeenCalledTimes(1);
        expect(shown).toHaveBeenCalledWith(
            expect.objectContaining({ text: '辞書を使用します。', offset: 0, anchor: target }),
            'modal', expect.objectContaining({ userGesture: true }),
        );
    });

    it('consumes only the trailing click from the completed touch', () => {
        const { pointer, click, shown } = fixture();
        pointer('pointerdown');
        pointer('pointerup');
        const source = document.getElementById('source')!;
        expect(click(source).defaultPrevented).toBe(false);
        expect(click().defaultPrevented).toBe(true);
        expect(shown).toHaveBeenCalledTimes(1);
        click();
        expect(shown).toHaveBeenCalledTimes(2);
    });

    it('keeps coordinate-free activations usable', () => {
        const { pointer, click, shown } = fixture();
        pointer('pointerdown');
        pointer('pointerup');
        click(undefined, { detail: 0 });
        expect(shown).toHaveBeenCalledTimes(2);
    });

    it('leaves a later click outside the touch position alone', () => {
        const { pointer, click, shown } = fixture();
        pointer('pointerdown');
        pointer('pointerup');
        expect(click(undefined, { clientX: 90 }).defaultPrevented).toBe(false);
        expect(shown).toHaveBeenCalledTimes(1);
    });

    it('expires compatibility suppression after the browser click window', () => {
        vi.useFakeTimers();
        const { pointer, click, shown } = fixture();
        pointer('pointerdown');
        pointer('pointerup');
        vi.advanceTimersByTime(701);
        click();
        expect(shown).toHaveBeenCalledTimes(2);
    });

    it('keeps a fresh mouse gesture on the same text usable', () => {
        const { pointer, click, shown } = fixture();
        pointer('pointerdown');
        pointer('pointerup');
        pointer('pointerdown', { pointerType: 'mouse' });
        click();
        expect(shown).toHaveBeenCalledTimes(2);
    });

    it.each(nativeGestureReleases)('preserves the native %s gesture', (_name, releaseGesture) => {
        vi.useFakeTimers();
        const { pointer, shown } = fixture();
        pointer('pointerdown');
        const release = releaseGesture(pointer);
        expect(release.defaultPrevented).toBe(false);
        expect(shown).not.toHaveBeenCalled();
    });

    it('ignores a different pointer without losing the original touch', () => {
        const { pointer, shown } = fixture();
        pointer('pointerdown');
        pointer('pointermove', { pointerId: 8, clientY: 80 });
        pointer('pointercancel', { pointerId: 8 });
        pointer('pointerup', { pointerId: 8 });
        expect(shown).not.toHaveBeenCalled();
        pointer('pointerup');
        expect(shown).toHaveBeenCalledTimes(1);
    });

    it.each([
        '<a id="text" href="#native">辞書</a>',
        '<button id="text">辞書</button>',
        '<div id="text" role="button">辞書</div>',
        '<div id="text" contenteditable="true">辞書</div>',
    ])('preserves native controls: %s', markup => {
        const { pointer, shown } = fixture(markup);
        pointer('pointerdown');
        expect(pointer('pointerup').defaultPrevented).toBe(false);
        expect(shown).not.toHaveBeenCalled();
    });

    it.each([{ popupActivationMode: 'off' }, { lookupOnClick: false }] as const)('respects disabled lookup: %j', settings => {
        const { pointer, shown, internals } = fixture();
        Object.assign(internals.settings, settings);
        pointer('pointerdown');
        expect(pointer('pointerup').defaultPrevented).toBe(false);
        expect(shown).not.toHaveBeenCalled();
    });
});

describe('unannotated subtitle touch', () => {
    it('pauses immediately before starting a lookup and consumes the trailing click', () => {
        const { pointer, click, shown, pause, video } = subtitleFixture();
        pointer('pointerdown');
        expect(pointer('pointerup').defaultPrevented).toBe(true);
        expect(pause).toHaveBeenCalledTimes(1);
        expect(video.paused).toBe(true);
        expect(shown).not.toHaveBeenCalled();
        expect(click().defaultPrevented).toBe(true);
        expect(pause).toHaveBeenCalledTimes(1);
        expect(shown).not.toHaveBeenCalled();
    });

    it.each([
        ['disabled popup', undefined, { popupActivationMode: 'off' }],
        ['disabled click lookup', undefined, { lookupOnClick: false }],
        ['caption punctuation', '<div id="text" class="jpdb-subtitle-primary">。</div>', {}],
    ] as const)('pauses without starting lookup for %s', (_name, markup, settings) => {
        const { pointer, shown, pause, internals } = subtitleFixture(markup);
        Object.assign(internals.settings, settings);
        pointer('pointerdown');
        expect(pointer('pointerup').defaultPrevented).toBe(true);
        expect(pause).toHaveBeenCalledTimes(1);
        expect(shown).not.toHaveBeenCalled();
    });

    it('keeps raw lookup available when subtitle pause is disabled', () => {
        const { pointer, shown, pause, internals } = subtitleFixture();
        internals.settings.subtitleMiningPause = false;
        pointer('pointerdown');
        pointer('pointerup');
        expect(pause).not.toHaveBeenCalled();
        expect(shown).toHaveBeenCalledTimes(1);
    });

    it('keeps raw lookup available when playback is already paused', () => {
        const { pointer, shown, pause } = subtitleFixture(undefined, true);
        pointer('pointerdown');
        pointer('pointerup');
        expect(pause).not.toHaveBeenCalled();
        expect(shown).toHaveBeenCalledTimes(1);
    });

    it('leaves subtitle buttons to their control handler', () => {
        const { pointer, shown, pause } = subtitleFixture('<button id="text" data-action="playback">字幕</button>');
        pointer('pointerdown');
        expect(pointer('pointerup').defaultPrevented).toBe(false);
        expect(pause).not.toHaveBeenCalled();
        expect(shown).not.toHaveBeenCalled();
    });
});
