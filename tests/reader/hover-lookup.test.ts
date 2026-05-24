import { describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/main';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { ReaderSettings } from '../../src/reader/types';

interface HoverLookupInternals {
    settings: ReaderSettings;
    activePopover?: HTMLElement;
    activePopoverMode?: 'modal' | 'hover';
    pressLookup?: unknown;
    suppressPenHoverUntil: number;
    canBeginPrimaryPressLookup(event: PointerEvent): boolean;
    handleHoverPointer(event: PointerEvent): void;
    handleHoverPointerOut(event: PointerEvent): void;
    scheduleHoverLookup(word: HTMLElement, event: PointerEvent): void;
    scheduleHoverClose(delay?: number, options?: { ignoreCssHover?: boolean }): void;
    handlePointerTextHover(event: PointerEvent): void;
}

function hoverPointerEvent(
    target: HTMLElement,
    pointerType = 'mouse',
    type = 'pointerover',
    modifiers: Partial<Pick<PointerEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>> = {},
): PointerEvent {
    const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
    Object.defineProperties(event, {
        target: { value: target },
        relatedTarget: { value: null },
        clientX: { value: 40 },
        clientY: { value: 24 },
        pointerType: { value: pointerType },
        altKey: { value: modifiers.altKey ?? false },
        ctrlKey: { value: modifiers.ctrlKey ?? false },
        metaKey: { value: modifiers.metaKey ?? false },
        shiftKey: { value: modifiers.shiftKey ?? false },
    });
    return event;
}

describe('hover lookup', () => {
    it('keeps parsed words inside the active popover click-only on hover', () => {
        const app = new ReaderApp();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        popover.innerHTML = `
            <div class="jpdb-reader-example-sentence">
                <span class="jpdb-reader-word jpdb-known" data-vid="1" data-sid="2" data-sentence="今日は読む">読む</span>
            </div>
        `;
        document.body.append(popover);
        const word = popover.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const internals = app as unknown as HoverLookupInternals;
        const scheduleHoverLookup = vi.fn();
        const handlePointerTextHover = vi.fn();

        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnHover: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.activePopover = popover;
        internals.activePopoverMode = 'modal';
        internals.scheduleHoverLookup = scheduleHoverLookup;
        internals.handlePointerTextHover = handlePointerTextHover;

        try {
            internals.handleHoverPointer(hoverPointerEvent(word));

            expect(scheduleHoverLookup).not.toHaveBeenCalled();
            expect(handlePointerTextHover).not.toHaveBeenCalled();
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('keeps modifier-hover disabled while a clicked popover is open', () => {
        const app = new ReaderApp();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        popover.innerHTML = `
            <div class="jpdb-reader-example-sentence">
                <span class="jpdb-reader-word jpdb-known" data-vid="1" data-sid="2" data-sentence="今日は読む">読む</span>
            </div>
        `;
        document.body.append(popover);
        const word = popover.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const internals = app as unknown as HoverLookupInternals;
        const scheduleHoverLookup = vi.fn();
        const handlePointerTextHover = vi.fn();

        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnHover: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: 'Shift' },
        };
        internals.activePopover = popover;
        internals.activePopoverMode = 'modal';
        internals.scheduleHoverLookup = scheduleHoverLookup;
        internals.handlePointerTextHover = handlePointerTextHover;

        try {
            internals.handleHoverPointer(hoverPointerEvent(word, 'mouse', 'pointerover', { shiftKey: true }));

            expect(scheduleHoverLookup).not.toHaveBeenCalled();
            expect(handlePointerTextHover).not.toHaveBeenCalled();
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('allows modifier-hover on parsed new-tab words owned by the reader UI', () => {
        const app = new ReaderApp();
        const root = document.createElement('div');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.innerHTML = '<span class="jpdb-reader-word" data-vid="1" data-sid="2" data-sentence="今日は読む">読む</span>';
        document.body.append(root);
        const word = root.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const internals = app as unknown as HoverLookupInternals;
        const scheduleHoverLookup = vi.fn();
        const handlePointerTextHover = vi.fn();

        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnHover: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: 'Shift' },
        };
        internals.scheduleHoverLookup = scheduleHoverLookup;
        internals.handlePointerTextHover = handlePointerTextHover;

        try {
            internals.handleHoverPointer(hoverPointerEvent(word, 'mouse', 'pointerover', { shiftKey: true }));

            expect(scheduleHoverLookup).toHaveBeenCalledWith(word, expect.objectContaining({ shiftKey: true }));
            expect(handlePointerTextHover).not.toHaveBeenCalled();
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('keeps plain pointer-text hover disabled inside the active popover chrome', () => {
        const app = new ReaderApp();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        popover.innerHTML = '<div class="jpdb-reader-popover-body">説明</div>';
        document.body.append(popover);
        const body = popover.querySelector<HTMLElement>('.jpdb-reader-popover-body')!;
        const internals = app as unknown as HoverLookupInternals;
        const scheduleHoverLookup = vi.fn();
        const handlePointerTextHover = vi.fn();

        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnHover: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.activePopover = popover;
        internals.activePopoverMode = 'modal';
        internals.scheduleHoverLookup = scheduleHoverLookup;
        internals.handlePointerTextHover = handlePointerTextHover;

        try {
            internals.handleHoverPointer(hoverPointerEvent(body));

            expect(scheduleHoverLookup).not.toHaveBeenCalled();
            expect(handlePointerTextHover).not.toHaveBeenCalled();
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('disables page hover lookups while a clicked popover is open', () => {
        const app = new ReaderApp();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        popover.textContent = '読む';
        const pageWord = document.createElement('span');
        pageWord.className = 'jpdb-reader-word';
        pageWord.dataset.vid = '3';
        pageWord.dataset.sid = '4';
        pageWord.dataset.sentence = '本を読む';
        pageWord.textContent = '読む';
        document.body.append(popover, pageWord);

        const internals = app as unknown as HoverLookupInternals;
        const scheduleHoverLookup = vi.fn();
        const handlePointerTextHover = vi.fn();

        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnHover: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.activePopover = popover;
        internals.activePopoverMode = 'modal';
        internals.scheduleHoverLookup = scheduleHoverLookup;
        internals.handlePointerTextHover = handlePointerTextHover;

        try {
            internals.handleHoverPointer(hoverPointerEvent(pageWord, 'mouse'));
            internals.handleHoverPointer(hoverPointerEvent(pageWord, 'pen'));

            expect(scheduleHoverLookup).not.toHaveBeenCalled();
            expect(handlePointerTextHover).not.toHaveBeenCalled();
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('does not schedule hover close when the pointer leaves a clicked popover', () => {
        const app = new ReaderApp();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        popover.innerHTML = '<div class="jpdb-reader-popover-body">説明</div>';
        document.body.append(popover);
        const body = popover.querySelector<HTMLElement>('.jpdb-reader-popover-body')!;
        const internals = app as unknown as HoverLookupInternals;
        const scheduleHoverClose = vi.fn();

        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnHover: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.activePopover = popover;
        internals.activePopoverMode = 'modal';
        internals.scheduleHoverClose = scheduleHoverClose;

        try {
            internals.handleHoverPointerOut(hoverPointerEvent(body, 'mouse', 'pointerout'));
            internals.handleHoverPointerOut(hoverPointerEvent(body, 'pen', 'pointerout'));

            expect(scheduleHoverClose).not.toHaveBeenCalled();
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('keeps Apple Pencil tap separate from hover preview', () => {
        const app = new ReaderApp();
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word';
        word.dataset.vid = '1';
        word.dataset.sid = '2';
        word.dataset.sentence = '読む';
        word.textContent = '読む';
        document.body.append(word);

        const internals = app as unknown as HoverLookupInternals;
        const scheduleHoverLookup = vi.fn();
        const handlePointerTextHover = vi.fn();

        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnHover: true,
            lookupOnClick: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.scheduleHoverLookup = scheduleHoverLookup;
        internals.handlePointerTextHover = handlePointerTextHover;

        try {
            expect(internals.canBeginPrimaryPressLookup(hoverPointerEvent(word, 'pen'))).toBe(false);

            internals.suppressPenHoverUntil = 0;
            internals.handleHoverPointer(hoverPointerEvent(word, 'pen'));
            expect(scheduleHoverLookup).toHaveBeenCalledWith(word, expect.objectContaining({ pointerType: 'pen' }));

            scheduleHoverLookup.mockClear();
            internals.suppressPenHoverUntil = Date.now() + 1000;
            internals.handleHoverPointer(hoverPointerEvent(word, 'pen'));
            internals.handleHoverPointerOut(hoverPointerEvent(word, 'pen', 'pointerout'));
            expect(scheduleHoverLookup).not.toHaveBeenCalled();
            expect(handlePointerTextHover).not.toHaveBeenCalled();
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });
});
