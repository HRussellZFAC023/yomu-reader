// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    activateWordWithPointer,
    GamepadOverlayController,
    gamingOcrWordTargets,
    type GamepadOverlayHandlers,
} from '../../src/gaming/renderer/gamepad-overlay';

function makeWord(id: string, rect: { left: number; top: number; width: number; height: number }): HTMLElement {
    const word = document.createElement('span');
    word.className = 'jpdb-reader-word';
    word.dataset.yomuWord = 'true';
    word.textContent = id;
    // jsdom does not lay out, so pin the geometry the controller reads.
    word.getBoundingClientRect = () => ({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
        x: rect.left,
        y: rect.top,
        toJSON: () => ({}),
    }) as DOMRect;
    document.body.appendChild(word);
    return word;
}

function stubButton(pressed: boolean): GamepadButton {
    return { pressed, touched: pressed, value: pressed ? 1 : 0 } as GamepadButton;
}

// Standard-mapping pad with the requested pressed buttons and axes.
function stubPad(pressedIndexes: number[], axes: number[] = [0, 0]): Gamepad {
    const buttons = Array.from({ length: 17 }, (_, index) => stubButton(pressedIndexes.includes(index)));
    return { connected: true, buttons, axes, mapping: 'standard', id: 'stub', index: 0, timestamp: 0 } as unknown as Gamepad;
}

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('activateWordWithPointer', () => {
    it('dispatches a real pointer gesture with non-zero coordinates the reader guard accepts', () => {
        const word = makeWord('冒険', { left: 100, top: 200, width: 40, height: 20 });
        const seen: { type: string; clientX: number; clientY: number; detail: number }[] = [];
        for (const type of ['pointerdown', 'pointerup', 'click']) {
            word.addEventListener(type, event => {
                const mouse = event as MouseEvent;
                seen.push({ type, clientX: mouse.clientX, clientY: mouse.clientY, detail: mouse.detail });
            });
        }

        activateWordWithPointer(word);

        expect(seen.map(entry => entry.type)).toEqual(['pointerdown', 'pointerup', 'click']);
        // Centre of the pinned rect: (120, 210). The reader's synthetic-click guard
        // rejects click events at (0,0) with detail 0, so these must be non-zero.
        const click = seen.find(entry => entry.type === 'click');
        expect(click?.clientX).toBe(120);
        expect(click?.clientY).toBe(210);
        expect(click?.detail).toBe(1);
    });
});

describe('gamingOcrWordTargets', () => {
    it('finds private reader-owned OCR words without exposing card IDs', () => {
        const root = document.createElement('div');
        root.innerHTML = `
            <div data-ocr-line>
                <span class="jpdb-reader-word" data-yomu-word="true">冒険</span>
                <span class="jpdb-reader-word">unowned</span>
            </div>
            <div><span class="jpdb-reader-word" data-yomu-word="true">outside OCR</span></div>
        `;
        const privateOcrWord = root.querySelector<HTMLElement>('[data-ocr-line] [data-yomu-word="true"]')!;

        expect(privateOcrWord.getAttributeNames().filter(name => name.startsWith('data-'))).toEqual(['data-yomu-word']);
        expect(gamingOcrWordTargets(root)).toEqual([privateOcrWord]);
    });
});

describe('GamepadOverlayController', () => {
    function pollOnce(controller: GamepadOverlayController): void {
        // start() schedules via requestAnimationFrame; jsdom's rAF is async, so drive
        // one poll directly through the private tick for a deterministic test.
        (controller as unknown as { pollPad(pad: Gamepad): void }).pollPad(getGamepads()[0]);
    }

    let currentPad: Gamepad = stubPad([]);
    function getGamepads(): Gamepad[] {
        return [currentPad];
    }

    function build(overrides: Partial<GamepadOverlayHandlers> = {}) {
        const activated: HTMLElement[] = [];
        const events = { back: 0, recapture: 0, settings: 0 };
        const words = [
            makeWord('一', { left: 0, top: 0, width: 30, height: 20 }),
            makeWord('二', { left: 60, top: 0, width: 30, height: 20 }),
            makeWord('三', { left: 0, top: 60, width: 30, height: 20 }),
        ];
        const controller = new GamepadOverlayController({
            words: () => words,
            activate: word => activated.push(word),
            back: () => { events.back += 1; },
            recapture: () => { events.recapture += 1; },
            settings: () => { events.settings += 1; },
            ...overrides,
        });
        return { controller, activated, events, words };
    }

    it('moves the focus ring right with the D-pad and activates on A', () => {
        vi.stubGlobal('navigator', { getGamepads } as unknown as Navigator);
        const { controller, activated, words } = build();

        // First D-pad-right press focuses the first word (no focus yet).
        currentPad = stubPad([15]);
        pollOnce(controller);
        expect(words[0].dataset.gamepadFocus).toBe('true');

        // Release, then press right again -> nearest word to the right (二).
        currentPad = stubPad([]);
        pollOnce(controller);
        currentPad = stubPad([15]);
        pollOnce(controller);
        expect(words[1].dataset.gamepadFocus).toBe('true');
        expect(words[0].dataset.gamepadFocus).toBeUndefined();

        // A activates the focused word via the handler.
        currentPad = stubPad([]);
        pollOnce(controller);
        currentPad = stubPad([0]);
        pollOnce(controller);
        expect(activated.at(-1)).toBe(words[1]);
    });

    it('routes B/Y/Start to back, recapture, and settings', () => {
        vi.stubGlobal('navigator', { getGamepads } as unknown as Navigator);
        const { controller, events } = build();

        currentPad = stubPad([1]); // B
        pollOnce(controller);
        currentPad = stubPad([]);
        pollOnce(controller);
        currentPad = stubPad([3]); // Y
        pollOnce(controller);
        currentPad = stubPad([]);
        pollOnce(controller);
        currentPad = stubPad([9]); // Start
        pollOnce(controller);

        expect(events.back).toBe(1);
        expect(events.recapture).toBe(1);
        expect(events.settings).toBe(1);
    });

    it('stop cancels polling and clears the focus ring', () => {
        const handlers = { openWord: vi.fn(), back: vi.fn(), recapture: vi.fn(), settings: vi.fn() };
        const controller = new GamepadOverlayController(handlers as never);
        controller.start();
        const focused = document.createElement('span');
        document.body.append(focused);
        (controller as unknown as { focused: HTMLElement | null }).focused = focused;
        focused.dataset.gamepadFocus = 'true';
        controller.stop();
        expect((controller as unknown as { running: boolean }).running).toBe(false);
        expect((controller as unknown as { raf: number }).raf).toBe(0);
        expect(document.querySelector('[data-gamepad-focus]')).toBeNull();
    });
});
