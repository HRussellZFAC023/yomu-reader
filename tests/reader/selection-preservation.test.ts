import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import { getSelectionControlElement, getSelectionSentence, getSelectionText } from '../../src/reader/dom/index';

afterEach(() => {
    window.getSelection()?.removeAllRanges();
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

describe('selection preservation', () => {
    it('reads selected Japanese text from the active textarea control', () => {
        const textarea = document.createElement('textarea');
        textarea.value = [
            'っていう',
            '動く',
            '楽しむ',
            'ひくひく',
        ].join('\n');
        document.body.append(textarea);

        textarea.focus();
        textarea.setSelectionRange(0, textarea.value.length);

        expect(getSelectionText()).toBe('っていう 動く 楽しむ ひくひく');
        expect(getSelectionSentence()).toBe('っていう 動く 楽しむ ひくひく');
        expect(getSelectionControlElement()).toBe(textarea);
    });

    it('prevents outside pointer default while dismissing a modal over a textarea selection', () => {
        const textarea = document.createElement('textarea');
        textarea.value = [
            'っていう',
            '動く',
            '楽しむ',
        ].join('\n');
        document.body.append(textarea);
        textarea.focus();
        textarea.setSelectionRange(0, textarea.value.length);

        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        const backdrop = document.createElement('div');
        backdrop.className = 'jpdb-reader-backdrop';
        backdrop.dataset.jpdbReaderRoot = 'true';
        document.body.append(backdrop, popover);

        const app = new ReaderApp() as any;
        app.activePopover = popover;
        app.activePopoverMode = 'modal';
        app.dismiss = vi.fn();

        let pointerEvent: Event | undefined;
        backdrop.addEventListener('pointerdown', event => {
            pointerEvent = event;
            app.dismissModalPopoverForOutsidePointer(event as PointerEvent);
        });

        backdrop.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));

        expect(pointerEvent?.defaultPrevented).toBe(true);
        expect(app.dismissedSelectionText).toBe('っていう 動く 楽しむ');
        expect(app.dismiss).toHaveBeenCalledWith({ suppressHoverTarget: true });
        expect(textarea.selectionStart).toBe(0);
        expect(textarea.selectionEnd).toBe(textarea.value.length);
    });
});
