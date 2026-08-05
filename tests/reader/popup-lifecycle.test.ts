import { describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import { keepsModalPopoverForOwnedSurface } from '../../src/reader/app/main-runtime-support';
import { clearDocumentSelection } from '../../src/reader/popup/shell';
import {
    capturePopoverScrollOffset,
    capturePopoverScrollFrame,
    restorePopoverScrollFrameSoon,
    restorePopoverScrollOffsetSoon,
} from '../../src/reader/popup/shell';
import { HOVER_WATCH_PERIOD_MS, HoverCloseController, type HoverCloseTimers } from '../../src/reader/popup/hover-close';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { CardRenderData } from '../../src/reader/cards/render-data';
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';

/**
 * The reported symptoms, one describe each:
 *   "the popup refreshing and sending you back to the top"
 *   "the hover ... close by scrolling up and down inside the hover popup for ~20s"
 *   "Tapping outside of the popup doesn't close it, the popup remains and the text
 *    stays selected"
 *   "the hover popup stays open too long after hovering away"
 *
 * What jsdom can honestly answer is kept here: whether the wiring exists, which
 * branch a selector takes, whether a flag defers and then flushes. Everything that
 * depends on real geometry — a re-render actually moving an edge out from under a
 * parked cursor, 20 seconds of wheel events against a live watchdog — lives in
 * scripts/popup-lifecycle-smoke.mjs, because jsdom stubs exactly the hit-testing
 * that decides those cases.
 */

const POPOVER_SCROLL_TOP = 240;
// Deliberately under HOVER_WATCH_PERIOD_MS. That is what makes the latency
// assertions discriminate: while the departure delay is shorter than the watchdog
// period, a close that is actually owned by the configured delay lands before the
// poll could have produced it, and a close that is re-armed per pointer frame cannot.
const HOVER_CLOSE_DELAY_MS = 40;
// One coalesced pointer frame. The hand keeps moving at this cadence throughout.
const FRAME_MS = 16;

interface PopupLifecycleInternals {
    settings: ReaderSettings;
    activePopover?: HTMLElement;
    activePopoverMode?: 'modal' | 'hover';
    activePopoverAnchor?: HTMLElement;
    activeHoverWord?: HTMLElement;
    activePopoverPositionLocked: boolean;
    activePopoverLockedPosition?: { left: number; top: number };
    hoverPopoverPointerLatched: boolean;
    dictionaryRescanPending: boolean;
    lastPointerPosition?: { x: number; y: number };
    parsePopoverJapanese(popover: HTMLElement): Promise<void>;
    renderCompletedCardPopover(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        trigger: 'modal' | 'hover',
        data: CardRenderData,
        anchor?: HTMLElement,
    ): void;
    scheduleDictionaryRescan(): void;
    scheduleVisiblePageReparse(delay?: number): void;
    mountPopover(popover: HTMLElement, anchor?: HTMLElement, options?: { mode?: 'modal' | 'hover'; focusOnMount?: boolean }): void;
    dismiss(options?: { suppressHoverTarget?: boolean; preserveNavigation?: boolean }): void;
    isHoverContextActive(options?: { ignoreCssHover?: boolean; ignorePointerPosition?: boolean }): boolean;
    bindEvents(): void;
    handleHoverPointer(event: Event): void;
    handleHoverPointerOut(event: Event): void;
    hoverClose: { readonly pending: boolean; readonly remainingMs?: number };
}

// jsdom ships no PointerEvent constructor, so synthesize one the way the other
// reader pointer tests do: a real Event with the fields the handlers read.
function pointerEvent(type: string, target: Node, relatedTarget: Node | null = null): Event {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
        target: { value: target },
        relatedTarget: { value: relatedTarget },
        clientX: { value: 40 },
        clientY: { value: 24 },
        button: { value: 0 },
        buttons: { value: 0 },
        pointerType: { value: 'mouse' },
    });
    return event;
}

const LOOKUP_CARD: JPDBCard = {
    vid: 1,
    sid: 2,
    rid: 3,
    spelling: '読む',
    reading: 'よむ',
    frequencyRank: 100,
    partOfSpeech: ['v5m'],
    meanings: [{ dictionary: 'JMdict', glosses: ['to read'], partOfSpeech: ['v5m'] }],
    cardState: ['known'],
    pitchAccent: ['HL'],
    wordWithReading: null,
} as unknown as JPDBCard;

function completedCardRenderData(): CardRenderData {
    return {
        localEntries: [],
        kanjiEntries: [],
        metaEntries: [],
        ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
        jpdbDecks: [],
        ankiDecks: [],
        jpdbVocabularyInfo: null,
    } as unknown as CardRenderData;
}

function scrolledPopoverFixture(): { popover: HTMLElement; body: HTMLElement } {
    const popover = document.createElement('div');
    popover.className = 'jpdb-reader-popover';
    popover.dataset.jpdbReaderRoot = 'true';
    popover.innerHTML = '<div class="jpdb-reader-popover-body">例文</div>';
    document.body.append(popover);
    const body = popover.querySelector<HTMLElement>('.jpdb-reader-popover-body')!;
    body.scrollTop = POPOVER_SCROLL_TOP;
    return { popover, body };
}

function ownedSurfaceFixture(className: string): { surface: HTMLElement; inert: HTMLElement; control: HTMLElement } {
    const surface = document.createElement('div');
    surface.className = className;
    surface.dataset.jpdbReaderRoot = 'true';
    const inert = document.createElement('span');
    inert.textContent = 'paint';
    const control = document.createElement('button');
    control.textContent = 'control';
    surface.append(inert, control);
    document.body.append(surface);
    return { surface, inert, control };
}

function cleanupReaderApp(app: ReaderApp): void {
    app.destroy();
    document.body.replaceChildren();
}

function wordFixture(): HTMLElement {
    const word = document.createElement('span');
    word.className = 'jpdb-reader-word';
    word.textContent = '読む';
    document.body.append(word);
    return word;
}

/**
 * A hover popover open on a word, with the pointer already off both of them: jsdom's
 * hit-test answers document.body, so every geometry route through
 * isHoverContextActive honestly reports "not hovering" and the only question left is
 * WHEN the close lands.
 */
function hoverClosingFixture(): {
    internals: PopupLifecycleInternals;
    popover: HTMLElement;
    word: HTMLElement;
    runMovingHand(): number | undefined;
    cleanup(): void;
} {
    vi.useFakeTimers();
    const app = new ReaderApp();
    const internals = app as unknown as PopupLifecycleInternals;
    const { popover } = scrolledPopoverFixture();
    const word = wordFixture();
    popover.getBoundingClientRect = () => new DOMRect(64, 120, 420, 300);
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => document.body });
    internals.settings = {
        ...DEFAULT_SETTINGS,
        lookupOnHover: true,
        hoverCloseDelayMs: HOVER_CLOSE_DELAY_MS,
        shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
    };
    internals.mountPopover(popover, word, { mode: 'hover', focusOnMount: false });
    internals.activeHoverWord = word;
    internals.lastPointerPosition = { x: 40, y: 24 };

    return {
        internals,
        popover,
        word,
        // The hand keeps moving over the page, one coalesced frame at a time, for long
        // enough that a per-frame re-arm would be unmistakable. Returns how many ms
        // after the departure the panel was unmounted, or undefined if it never was.
        runMovingHand(): number | undefined {
            const budgetMs = Math.max(HOVER_CLOSE_DELAY_MS, HOVER_WATCH_PERIOD_MS) * 8;
            for (let elapsed = FRAME_MS; elapsed <= budgetMs; elapsed += FRAME_MS) {
                vi.advanceTimersByTime(FRAME_MS);
                if (!popover.isConnected) return elapsed;
                internals.handleHoverPointer(pointerEvent('pointermove', document.body));
            }
            return undefined;
        },
        cleanup(): void {
            Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: undefined });
            cleanupReaderApp(app);
            vi.useRealTimers();
        },
    };
}

/** A hand-cranked clock, so the scheduler's deadline algebra is asserted exactly. */
function fakeHoverCloseClock(): {
    timers: HoverCloseTimers;
    host: { isHoverPopoverActive(): boolean; closeDelayMs(): number; isHoverContextActive(): boolean; close(): void };
    tick(ms: number): void;
    closes: number;
    contextActive: boolean;
} {
    let now = 1_000;
    const scheduled = new Map<number, { at: number; handler: () => void }>();
    let nextHandle = 1;
    const state = {
        timers: {
            now: () => now,
            setTimeout: (handler: () => void, delayMs: number) => {
                const handle = nextHandle++;
                scheduled.set(handle, { at: now + delayMs, handler });
                return handle;
            },
            clearTimeout: (handle: number | undefined) => {
                if (handle !== undefined) scheduled.delete(handle);
            },
        } satisfies HoverCloseTimers,
        host: {
            isHoverPopoverActive: () => true,
            closeDelayMs: () => HOVER_CLOSE_DELAY_MS,
            isHoverContextActive: () => state.contextActive,
            close: () => { state.closes += 1; },
        },
        tick(ms: number): void {
            now += ms;
            for (const [handle, entry] of [...scheduled]) {
                if (entry.at > now) continue;
                scheduled.delete(handle);
                entry.handler();
            }
        },
        closes: 0,
        contextActive: false,
    };
    return state;
}

describe('popup lifecycle: scroll position across a card re-render', () => {
    // The reason capturePopoverScrollFrame could not be reused for the card path,
    // pinned as a test so nobody "simplifies" the new helper back into the old one.
    it('loses the offset when the captured scroll body is the node that gets replaced', () => {
        const { popover, body } = scrolledPopoverFixture();

        try {
            const frame = capturePopoverScrollFrame(body);
            popover.innerHTML = '<div class="jpdb-reader-popover-body">例文</div>';
            restorePopoverScrollFrameSoon(frame);

            expect(body.isConnected).toBe(false);
            expect(popover.querySelector<HTMLElement>('.jpdb-reader-popover-body')!.scrollTop).toBe(0);
        } finally {
            popover.remove();
        }
    });

    it('carries the offset onto the rebuilt scroll body', () => {
        const { popover } = scrolledPopoverFixture();

        try {
            const offset = capturePopoverScrollOffset(popover);
            popover.innerHTML = '<div class="jpdb-reader-popover-body">例文</div>';
            restorePopoverScrollOffsetSoon(offset);

            expect(popover.querySelector<HTMLElement>('.jpdb-reader-popover-body')!.scrollTop).toBe(POPOVER_SCROLL_TOP);
        } finally {
            popover.remove();
        }
    });

    // Capturing after the swap is the trap the reposition path already falls into:
    // it reads the fresh body's zero and restores it faithfully, which looks like
    // working code and is exactly the bug.
    it('captures nothing useful when taken after the swap', () => {
        const { popover } = scrolledPopoverFixture();

        try {
            popover.innerHTML = '<div class="jpdb-reader-popover-body">例文</div>';
            const offset = capturePopoverScrollOffset(popover);
            restorePopoverScrollOffsetSoon(offset);

            expect(offset.scrollTop).toBe(0);
        } finally {
            popover.remove();
        }
    });

    it('keeps the read position when a late provider re-renders the completed card', () => {
        const app = new ReaderApp();
        const internals = app as unknown as PopupLifecycleInternals;
        const { popover } = scrolledPopoverFixture();
        internals.settings = { ...DEFAULT_SETTINGS };
        internals.activePopover = popover;
        internals.activePopoverMode = 'modal';
        internals.parsePopoverJapanese = vi.fn(async () => undefined);

        try {
            internals.renderCompletedCardPopover(popover, LOOKUP_CARD, '本を読む', 'modal', completedCardRenderData());

            const body = popover.querySelector<HTMLElement>('.jpdb-reader-popover-body');
            expect(body).not.toBeNull();
            expect(body!.scrollTop).toBe(POPOVER_SCROLL_TOP);
        } finally {
            cleanupReaderApp(app);
        }
    });
});

describe('popup lifecycle: hover pointer latch', () => {
    it('latches the pointer inside and locks the frame on first hover', () => {
        const app = new ReaderApp();
        const internals = app as unknown as PopupLifecycleInternals;
        const { popover } = scrolledPopoverFixture();
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word';
        document.body.append(word);
        popover.getBoundingClientRect = () => new DOMRect(64, 120, 420, 300);
        internals.settings = { ...DEFAULT_SETTINGS };

        try {
            internals.mountPopover(popover, word, { mode: 'hover', focusOnMount: false });
            expect(internals.hoverPopoverPointerLatched).toBe(false);
            expect(internals.activePopoverPositionLocked).toBe(false);

            popover.dispatchEvent(new Event('pointerenter'));

            expect(internals.hoverPopoverPointerLatched).toBe(true);
            expect(internals.activePopoverPositionLocked).toBe(true);
            expect(internals.activePopoverLockedPosition).toEqual({ left: 64, top: 120 });
        } finally {
            cleanupReaderApp(app);
        }
    });

    // The whole point: once latched, hover survival stops being re-derived from
    // hit-testing a stale pointer point 11 times a second.
    it('reports the hover context active without consulting geometry', () => {
        const app = new ReaderApp();
        const internals = app as unknown as PopupLifecycleInternals;
        const { popover } = scrolledPopoverFixture();
        const elementFromPoint = vi.fn(() => document.body);
        Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: elementFromPoint });
        internals.settings = { ...DEFAULT_SETTINGS };
        internals.activePopover = popover;
        internals.activePopoverMode = 'hover';
        internals.hoverPopoverPointerLatched = true;
        internals.lastPointerPosition = { x: 900, y: 900 };

        try {
            expect(internals.isHoverContextActive({ ignorePointerPosition: true })).toBe(true);
            expect(elementFromPoint).not.toHaveBeenCalled();
        } finally {
            Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: undefined });
            cleanupReaderApp(app);
        }
    });

    it('survives a pointerleave whose relatedTarget is still inside the popover', () => {
        const app = new ReaderApp();
        const internals = app as unknown as PopupLifecycleInternals;
        const { popover, body } = scrolledPopoverFixture();
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word';
        document.body.append(word);
        internals.settings = { ...DEFAULT_SETTINGS };

        try {
            internals.mountPopover(popover, word, { mode: 'hover', focusOnMount: false });
            popover.dispatchEvent(new Event('pointerenter'));

            const insideLeave = new Event('pointerleave');
            Object.defineProperty(insideLeave, 'relatedTarget', { value: body });
            popover.dispatchEvent(insideLeave);
            expect(internals.hoverPopoverPointerLatched).toBe(true);

            const realLeave = new Event('pointerleave');
            Object.defineProperty(realLeave, 'relatedTarget', { value: document.body });
            popover.dispatchEvent(realLeave);
            expect(internals.hoverPopoverPointerLatched).toBe(false);
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('releases the latch when a pointer event lands outside the popover', () => {
        const app = new ReaderApp();
        const internals = app as unknown as PopupLifecycleInternals;
        const { popover, body } = scrolledPopoverFixture();
        const outside = document.createElement('div');
        document.body.append(outside);
        internals.settings = { ...DEFAULT_SETTINGS };
        internals.activePopover = popover;
        internals.activePopoverMode = 'hover';
        internals.bindEvents();

        try {
            internals.hoverPopoverPointerLatched = true;
            body.dispatchEvent(pointerEvent('pointermove', body));
            expect(internals.hoverPopoverPointerLatched).toBe(true);

            outside.dispatchEvent(pointerEvent('pointermove', outside));
            expect(internals.hoverPopoverPointerLatched).toBe(false);
        } finally {
            cleanupReaderApp(app);
        }
    });
});

/**
 * "The hover popup stays open too long after hovering away."
 *
 * The close delay was owned by nobody. `scheduleHoverClose` cleared the pending timer
 * and armed a fresh one, and one of its callers runs once per coalesced pointer frame
 * while the pointer is off the hover surfaces — so with a hand still in motion the
 * delay was reset every ~16ms and the close timer never elapsed. The panel was closed
 * instead by the hover watchdog, a poll phased from mount time, which is why measured
 * latency on 1.8.85 tracked the poll and not the setting (with the delay at 600ms:
 * 178/221/407/441ms, all four dismissed from the watchdog tick).
 *
 * These drive the real handlers with a hand that keeps moving, and assert the close
 * lands within one configured delay plus a frame. Each fails on 1.8.85 by closing at
 * the watchdog's 90ms+ instead. The rAF coalescing in front of handleHoverPointer is
 * left to the real-engine smoke; here the handler it coalesces INTO is called
 * directly, once per simulated frame.
 */
describe('popup lifecycle: hover close latency', () => {
    it('closes one configured delay after the pointer leaves the word, however long the hand keeps moving', () => {
        const closing = hoverClosingFixture();

        try {
            closing.internals.handleHoverPointerOut(pointerEvent('pointerout', closing.word, document.body));
            expect(closing.internals.hoverClose.pending).toBe(true);

            expect(closing.runMovingHand()).toBeLessThanOrEqual(HOVER_CLOSE_DELAY_MS + FRAME_MS);
        } finally {
            closing.cleanup();
        }
    });

    it('closes one configured delay after the pointer leaves the panel it had entered', () => {
        const closing = hoverClosingFixture();

        try {
            // pointerenter latches the pointer inside and locks the frame (v1.8.80);
            // the matching pointerleave is the only thing that may release it.
            closing.popover.dispatchEvent(new Event('pointerenter'));
            expect(closing.internals.hoverPopoverPointerLatched).toBe(true);

            const leave = new Event('pointerleave');
            Object.defineProperty(leave, 'relatedTarget', { value: document.body });
            closing.popover.dispatchEvent(leave);
            expect(closing.internals.hoverPopoverPointerLatched).toBe(false);
            expect(closing.internals.hoverClose.pending).toBe(true);

            expect(closing.runMovingHand()).toBeLessThanOrEqual(HOVER_CLOSE_DELAY_MS + FRAME_MS);
        } finally {
            closing.cleanup();
        }
    });

    // Moving to the next word is a RETARGET, not a departure: the pending close is
    // released so the incoming lookup owns the panel. What must not happen is a close
    // surviving with a deadline stacked from the word the pointer merely passed over.
    it('releases the close when the pointer moves to another word instead of stacking a delay', () => {
        const closing = hoverClosingFixture();
        const next = wordFixture();

        try {
            closing.internals.handleHoverPointerOut(pointerEvent('pointerout', closing.word, next));

            expect(closing.internals.hoverClose.pending).toBe(false);
            expect(closing.popover.isConnected).toBe(true);
        } finally {
            next.remove();
            closing.cleanup();
        }
    });

    // The v1.8.80 backstop, kept: when the DOM never dispatches the exit event (a
    // re-render detached the node the pointer was over), the watchdog still has to
    // notice. It now arms the close rather than dismissing on the spot, so the panel
    // goes away one configured delay after the poll spots the departure.
    it('still closes a hover popover whose exit event never arrived', () => {
        const closing = hoverClosingFixture();

        try {
            vi.advanceTimersByTime(HOVER_WATCH_PERIOD_MS);
            expect(closing.popover.isConnected).toBe(true);
            expect(closing.internals.hoverClose.pending).toBe(true);

            vi.advanceTimersByTime(HOVER_CLOSE_DELAY_MS + FRAME_MS);
            expect(closing.popover.isConnected).toBe(false);
        } finally {
            closing.cleanup();
        }
    });
});

describe('hover close scheduler: the deadline is monotonic', () => {
    it('ignores a re-arm that would push an armed close further out', () => {
        const clock = fakeHoverCloseClock();
        const controller = new HoverCloseController(clock.timers, clock.host);

        controller.arm(80);
        clock.tick(40);
        controller.arm(80);

        expect(controller.remainingMs).toBe(40);
        clock.tick(40);
        expect(clock.closes).toBe(1);
    });

    it('accepts a re-arm that brings the close earlier', () => {
        const clock = fakeHoverCloseClock();
        const controller = new HoverCloseController(clock.timers, clock.host);

        controller.arm(3000);
        controller.arm(0);

        expect(controller.remainingMs).toBe(0);
        clock.tick(0);
        expect(clock.closes).toBe(1);
    });

    it('drops a due close while the pointer is back in the hover context, and re-arms from scratch after', () => {
        const clock = fakeHoverCloseClock();
        clock.host.isHoverContextActive = () => clock.contextActive;
        const controller = new HoverCloseController(clock.timers, clock.host);

        clock.contextActive = true;
        controller.arm(40);
        clock.tick(40);
        expect(clock.closes).toBe(0);
        expect(controller.pending).toBe(false);

        clock.contextActive = false;
        controller.arm(40);
        clock.tick(40);
        expect(clock.closes).toBe(1);
    });
});

describe('popup lifecycle: re-annotation deferred under an open popover', () => {
    it('defers a dictionary rescan while any popover is open, not just settings', () => {
        const app = new ReaderApp();
        const internals = app as unknown as PopupLifecycleInternals;
        const { popover } = scrolledPopoverFixture();
        const scheduleVisiblePageReparse = vi.fn();
        internals.settings = { ...DEFAULT_SETTINGS };
        internals.scheduleVisiblePageReparse = scheduleVisiblePageReparse;
        internals.activePopover = popover;
        internals.activePopoverMode = 'hover';

        try {
            internals.scheduleDictionaryRescan();

            expect(scheduleVisiblePageReparse).not.toHaveBeenCalled();
            expect(internals.dictionaryRescanPending).toBe(true);
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('runs the rescan immediately when no popover is anchored to the page', () => {
        const app = new ReaderApp();
        const internals = app as unknown as PopupLifecycleInternals;
        const scheduleVisiblePageReparse = vi.fn();
        internals.settings = { ...DEFAULT_SETTINGS };
        internals.scheduleVisiblePageReparse = scheduleVisiblePageReparse;

        try {
            internals.scheduleDictionaryRescan();

            expect(scheduleVisiblePageReparse).toHaveBeenCalled();
            expect(internals.dictionaryRescanPending).toBe(false);
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('flushes the deferred rescan when the popover really closes', () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const internals = app as unknown as PopupLifecycleInternals;
        const { popover } = scrolledPopoverFixture();
        const scheduleVisiblePageReparse = vi.fn();
        internals.settings = { ...DEFAULT_SETTINGS };
        internals.scheduleVisiblePageReparse = scheduleVisiblePageReparse;
        internals.activePopover = popover;
        internals.activePopoverMode = 'modal';

        try {
            internals.scheduleDictionaryRescan();
            expect(internals.dictionaryRescanPending).toBe(true);

            internals.dismiss({ suppressHoverTarget: false });
            vi.advanceTimersByTime(200);

            expect(scheduleVisiblePageReparse).toHaveBeenCalled();
            expect(internals.dictionaryRescanPending).toBe(false);
        } finally {
            cleanupReaderApp(app);
            vi.useRealTimers();
        }
    });

    // A re-mount (nested navigation, mountPopover's own teardown) is not a close:
    // flushing there would reparse the page out from under the incoming panel and
    // reintroduce the bug one popover later.
    it('holds the deferred rescan across a navigation re-mount', () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const internals = app as unknown as PopupLifecycleInternals;
        const { popover } = scrolledPopoverFixture();
        const scheduleVisiblePageReparse = vi.fn();
        internals.settings = { ...DEFAULT_SETTINGS };
        internals.scheduleVisiblePageReparse = scheduleVisiblePageReparse;
        internals.activePopover = popover;
        internals.activePopoverMode = 'modal';

        try {
            internals.scheduleDictionaryRescan();
            internals.dismiss({ suppressHoverTarget: false, preserveNavigation: true });
            vi.advanceTimersByTime(200);

            expect(scheduleVisiblePageReparse).not.toHaveBeenCalled();
            expect(internals.dictionaryRescanPending).toBe(true);
        } finally {
            cleanupReaderApp(app);
            vi.useRealTimers();
        }
    });
});

describe('popup lifecycle: tapping an inert Yomu surface', () => {
    // Each of these paints over content the learner is trying to read, and on a
    // phone there is no backdrop, so this allowlist is the only dismissal route.
    // The OCR layer is the one that got a bespoke carve-out; the rest never did.
    const contentOverlays = [
        ['OCR layer', 'jpdb-ocr-layer'],
        ['subtitle overlay root', 'jpdb-subtitle-player'],
        ['transcript list', 'jpdb-subtitle-list'],
        ['injected page add-on', 'yomu-jpdb-page-addon'],
        ['toast stack', 'jpdb-reader-toast'],
    ] as const;

    for (const [label, className] of contentOverlays) {
        it(`dismisses when the press lands on inert ${label} paint`, () => {
            const { inert, surface } = ownedSurfaceFixture(className);

            try {
                expect(keepsModalPopoverForOwnedSurface(inert)).toBe(false);
            } finally {
                surface.remove();
            }
        });

        it(`keeps the popover when the press lands on a control inside the ${label}`, () => {
            const { control, surface } = ownedSurfaceFixture(className);

            try {
                expect(keepsModalPopoverForOwnedSurface(control)).toBe(true);
            } finally {
                surface.remove();
            }
        });
    }

    // A press that resolved to a parsed word is a lookup gesture; its own handler
    // opens the next entry. Only OCR words return before the dismissal chain, so
    // subtitle and page-addon words have to be recognised here.
    it('treats a parsed word inside a content overlay as a lookup, not a dismissal', () => {
        const { surface } = ownedSurfaceFixture('jpdb-subtitle-player');
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word';
        word.textContent = '読む';
        surface.append(word);

        try {
            expect(keepsModalPopoverForOwnedSurface(word)).toBe(true);
        } finally {
            surface.remove();
        }
    });

    // Yomu's own chrome is deliberately outside the inert test: a press on a
    // panel's padding is a press on the panel.
    it('keeps the popover for a press on the bare padding of a chrome panel', () => {
        const { inert, surface } = ownedSurfaceFixture('jpdb-reader-settings');

        try {
            expect(keepsModalPopoverForOwnedSurface(inert)).toBe(true);
        } finally {
            surface.remove();
        }
    });

    it('clears a document selection so the highlight does not outlive the popup', () => {
        const selected = document.createElement('p');
        selected.textContent = 'ママがサンタにキッスした';
        document.body.append(selected);
        const range = document.createRange();
        range.selectNodeContents(selected);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);

        try {
            expect(window.getSelection()?.toString()).toBe('ママがサンタにキッスした');

            clearDocumentSelection();

            expect(window.getSelection()?.toString()).toBe('');
        } finally {
            window.getSelection()?.removeAllRanges();
            selected.remove();
        }
    });

    // The boundary, kept explicit: a focused field's own selection is the reader's
    // editing state, not the popup's subject. Collapsing it would move their caret in
    // a compose box they were working in. tests/reader/selection-preservation.ts owns
    // the same guarantee through the dismissal path.
    it('leaves a focused control selection alone', () => {
        const input = document.createElement('textarea');
        input.value = '本を読む';
        document.body.append(input);
        input.focus();
        input.setSelectionRange(0, 4);

        try {
            clearDocumentSelection();

            expect(input.selectionEnd - input.selectionStart).toBe(4);
        } finally {
            input.remove();
        }
    });
});
