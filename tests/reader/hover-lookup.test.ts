import { describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/main';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { ReaderSettings } from '../../src/reader/types';

interface HoverLookupInternals {
    settings: ReaderSettings;
    activePopover?: HTMLElement;
    activePopoverMode?: 'modal' | 'hover';
    handleHoverPointer(event: PointerEvent): void;
    scheduleHoverLookup(word: HTMLElement, event: PointerEvent): void;
    handlePointerTextHover(event: PointerEvent): void;
}

function hoverPointerEvent(target: HTMLElement): PointerEvent {
    const event = new Event('pointerover', { bubbles: true, cancelable: true }) as PointerEvent;
    Object.defineProperties(event, {
        target: { value: target },
        clientX: { value: 40 },
        clientY: { value: 24 },
        pointerType: { value: 'mouse' },
        altKey: { value: false },
        ctrlKey: { value: false },
        metaKey: { value: false },
        shiftKey: { value: false },
    });
    return event;
}

describe('hover lookup', () => {
    it('schedules hover lookup for Immersion Kit words inside the active popover', () => {
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

            expect(scheduleHoverLookup).toHaveBeenCalledWith(word, expect.any(Event));
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
});
