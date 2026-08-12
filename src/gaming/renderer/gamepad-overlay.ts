// Controller navigation for the Yomu Gaming overlay.
//
// On a Steam Deck in Game Mode the player has no keyboard or mouse: only the
// gamepad. Without this driver the overlay is a dead end — you can open it with
// the global shortcut (mapped to a Deck button via Steam Input) but you cannot
// move between the OCR'd words, open a lookup, or close the overlay. This module
// polls the Gamepad API and drives the same DOM the mouse/keyboard path uses:
//
//   - D-pad / left stick  -> move focus between recognized words (spatially)
//   - A (south) / R2       -> open the real Yomu popover on the focused word
//   - B (east)             -> close the popover, or close the overlay if none
//   - Y (north)            -> re-capture the screen
//   - Start / L2           -> open Settings
//
// It never reaches into reader internals: activation synthesizes a real pointer
// gesture at the word's centre (with proper detail/clientX-Y so the reader's
// synthetic-click guard accepts it), so the word lights up exactly as if the
// user had clicked it.

import { renderedWordsInRoot } from '../../reader/dom/index';

const AXIS_DEADZONE = 0.55;
const REPEAT_INITIAL_MS = 360;
const REPEAT_INTERVAL_MS = 140;

// Standard-mapping button indices (https://w3c.github.io/gamepad/#remapping).
const BUTTON = {
    a: 0,
    b: 1,
    y: 3,
    l2: 6,
    r2: 7,
    start: 9,
    dpadUp: 12,
    dpadDown: 13,
    dpadLeft: 14,
    dpadRight: 15,
} as const;

type Direction = 'up' | 'down' | 'left' | 'right';

export interface GamepadOverlayHandlers {
    // The set of currently focusable OCR word elements, in DOM order.
    words(): HTMLElement[];
    activate(word: HTMLElement): void;
    back(): void;
    recapture(): void;
    settings(): void;
}

/** Reader-owned words inside Gaming OCR surfaces, independent of public card IDs. */
export function gamingOcrWordTargets(root: ParentNode): HTMLElement[] {
    return renderedWordsInRoot(root).filter(word => Boolean(word.closest('[data-ocr-line]')));
}

interface HeldButton {
    firedAt: number;
    nextRepeatAt: number;
}

export class GamepadOverlayController {
    private raf = 0;
    private running = false;
    private focused: HTMLElement | null = null;
    private held = new Map<number, HeldButton>();
    private readonly hasGamepadApi = typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function';

    constructor(private readonly handlers: GamepadOverlayHandlers) {}

    start(): void {
        if (this.running || !this.hasGamepadApi) return;
        this.running = true;
        // Poll immediately and every frame: connect/disconnect events are not
        // reliable across every Chromium build the Deck ships.
        this.raf = requestAnimationFrame(() => this.tick());
    }

    stop(): void {
        this.running = false;
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.held.clear();
        this.clearFocus();
    }

    // Called by the overlay when it re-renders (new capture / new words), so the
    // focus ring never points at a detached node.
    reconcileFocus(): void {
        if (!this.focused?.isConnected) this.clearFocus();
    }

    private tick(): void {
        if (!this.running) return;
        const pad = this.firstConnectedPad();
        if (pad) this.pollPad(pad);
        this.raf = requestAnimationFrame(() => this.tick());
    }

    private firstConnectedPad(): Gamepad | null {
        for (const pad of navigator.getGamepads()) {
            if (pad?.connected) return pad;
        }
        return null;
    }

    private pollPad(pad: Gamepad): void {
        const now = performance.now();
        this.handleDirection(pad, now);
        this.handleButton(pad, BUTTON.a, now, () => this.activateFocused(), true);
        this.handleButton(pad, BUTTON.r2, now, () => this.activateFocused(), true);
        this.handleButton(pad, BUTTON.b, now, () => this.handlers.back(), false);
        this.handleButton(pad, BUTTON.y, now, () => this.handlers.recapture(), false);
        this.handleButton(pad, BUTTON.start, now, () => this.handlers.settings(), false);
        this.handleButton(pad, BUTTON.l2, now, () => this.handlers.settings(), false);
    }

    private handleDirection(pad: Gamepad, now: number): void {
        const direction = this.readDirection(pad);
        if (!direction) {
            this.releaseDirectionButtons();
            return;
        }
        const key = directionButtonKey(direction);
        const held = this.held.get(key);
        if (!held) {
            this.held.set(key, { firedAt: now, nextRepeatAt: now + REPEAT_INITIAL_MS });
            this.moveFocus(direction);
            return;
        }
        if (now >= held.nextRepeatAt) {
            held.nextRepeatAt = now + REPEAT_INTERVAL_MS;
            this.moveFocus(direction);
        }
    }

    private readDirection(pad: Gamepad): Direction | null {
        const [axisX = 0, axisY = 0] = pad.axes;
        if (this.pressed(pad, BUTTON.dpadUp) || axisY < -AXIS_DEADZONE) return 'up';
        if (this.pressed(pad, BUTTON.dpadDown) || axisY > AXIS_DEADZONE) return 'down';
        if (this.pressed(pad, BUTTON.dpadLeft) || axisX < -AXIS_DEADZONE) return 'left';
        if (this.pressed(pad, BUTTON.dpadRight) || axisX > AXIS_DEADZONE) return 'right';
        return null;
    }

    private handleButton(pad: Gamepad, index: number, now: number, run: () => void, repeat: boolean): void {
        if (!this.pressed(pad, index)) {
            this.held.delete(index);
            return;
        }
        const held = this.held.get(index);
        if (!held) {
            this.held.set(index, { firedAt: now, nextRepeatAt: now + REPEAT_INITIAL_MS });
            run();
            return;
        }
        if (repeat && now >= held.nextRepeatAt) {
            held.nextRepeatAt = now + REPEAT_INTERVAL_MS;
            run();
        }
    }

    private pressed(pad: Gamepad, index: number): boolean {
        const button = pad.buttons[index];
        return Boolean(button && (button.pressed || button.value > 0.5));
    }

    private releaseDirectionButtons(): void {
        for (const key of [BUTTON.dpadUp, BUTTON.dpadDown, BUTTON.dpadLeft, BUTTON.dpadRight]) {
            this.held.delete(key);
        }
    }

    private moveFocus(direction: Direction): void {
        const words = this.handlers.words().filter(word => word.isConnected);
        if (!words.length) {
            this.clearFocus();
            return;
        }
        if (!this.focused || !this.focused.isConnected || !words.includes(this.focused)) {
            this.setFocus(words[0]);
            return;
        }
        const next = nearestInDirection(this.focused, words, direction);
        if (next) this.setFocus(next);
    }

    private activateFocused(): void {
        const words = this.handlers.words().filter(word => word.isConnected);
        if (!words.length) return;
        const target = this.focused && words.includes(this.focused) ? this.focused : words[0];
        this.setFocus(target);
        this.handlers.activate(target);
    }

    private setFocus(word: HTMLElement): void {
        if (this.focused === word) return;
        this.clearFocus();
        this.focused = word;
        word.dataset.gamepadFocus = 'true';
        if (typeof word.scrollIntoView === 'function') word.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    private clearFocus(): void {
        if (this.focused) delete this.focused.dataset.gamepadFocus;
        this.focused = null;
    }
}

function directionButtonKey(direction: Direction): number {
    if (direction === 'up') return BUTTON.dpadUp;
    if (direction === 'down') return BUTTON.dpadDown;
    if (direction === 'left') return BUTTON.dpadLeft;
    return BUTTON.dpadRight;
}

// Pick the nearest word in the requested direction using centre-to-centre
// geometry: the candidate must lie predominantly on that side, and among those
// the one with the smallest weighted distance wins (cross-axis drift is penalised
// so up/down does not jump across columns).
function nearestInDirection(current: HTMLElement, words: HTMLElement[], direction: Direction): HTMLElement | null {
    const origin = centre(current);
    let best: HTMLElement | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const word of words) {
        if (word === current) continue;
        const point = centre(word);
        const dx = point.x - origin.x;
        const dy = point.y - origin.y;
        if (!isInDirection(dx, dy, direction)) continue;
        const along = direction === 'left' || direction === 'right' ? Math.abs(dx) : Math.abs(dy);
        const across = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
        const score = along + across * 2.5;
        if (score < bestScore) {
            bestScore = score;
            best = word;
        }
    }
    return best;
}

function isInDirection(dx: number, dy: number, direction: Direction): boolean {
    if (direction === 'up') return dy < -1 && Math.abs(dy) >= Math.abs(dx);
    if (direction === 'down') return dy > 1 && Math.abs(dy) >= Math.abs(dx);
    if (direction === 'left') return dx < -1 && Math.abs(dx) >= Math.abs(dy);
    return dx > 1 && Math.abs(dx) >= Math.abs(dy);
}

function centre(element: HTMLElement): { x: number; y: number } {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// Synthesize a real pointer gesture at the element centre. The reader's tap-lookup
// path (pointerdown -> pointerup -> click) and its synthetic-click guard both need
// non-zero coordinates and a positive `detail`, so a bare element.click() would be
// silently dropped.
export function activateWordWithPointer(word: HTMLElement): void {
    const rect = word.getBoundingClientRect();
    const clientX = Math.round(rect.left + rect.width / 2);
    const clientY = Math.round(rect.top + rect.height / 2);
    const pointerInit: PointerEventInit = {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX,
        clientY,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        buttons: 1,
    };
    word.dispatchEvent(pointerEvent('pointerdown', pointerInit));
    word.dispatchEvent(pointerEvent('pointerup', { ...pointerInit, buttons: 0 }));
    word.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, clientX, clientY, button: 0, detail: 1 }));
}

// PointerEvent exists in every Chromium the app ships, but fall back to MouseEvent
// so the gesture still fires in a stripped-down webview (and in jsdom under test).
function pointerEvent(type: string, init: PointerEventInit): Event {
    if (typeof PointerEvent === 'function') return new PointerEvent(type, init);
    return new MouseEvent(type, init);
}
