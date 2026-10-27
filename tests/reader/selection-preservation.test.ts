import '../../src/reader/companions/register-build-companions';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import { getSelectionControlElement, getSelectionSentence, getSelectionText } from '../../src/reader/dom/index';
import { isProseDominantSelection } from "../../src/reader/lookup/text-helpers";

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

    it('prevents outside pointer default and preserves textarea selection while dismissing a modal', () => {
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
        expect(app.dismiss).toHaveBeenCalledWith({ suppressHoverTarget: true });
        expect(textarea.selectionStart).toBe(0);
        expect(textarea.selectionEnd).toBe(textarea.value.length);
    });
});

describe('isProseDominantSelection', () => {
    it('treats a paragraph that merely embeds a Japanese word as prose', () => {
        // The reported regression: dragging across this paragraph collapsed the
        // selection back onto よむ when the auto popup opened.
        expect(isProseDominantSelection(
            'Follow along with your favourite shows using よむ, looking up any words you dont understand while the video is paused.',
        )).toBe(true);
    });

    it('keeps Japanese-only selections lookupable', () => {
        expect(isProseDominantSelection('静かな喫茶店で新しい本を読みました。')).toBe(false);
        expect(isProseDominantSelection('よむ')).toBe(false);
    });

    it('counts supplementary-plane kanji as Japanese characters', () => {
        expect(isProseDominantSelection(`${'𠮟'.repeat(25)} abcdefghijklmnopqrstuvwx`)).toBe(false);
    });

    it('keeps short mixed lookups lookupable', () => {
        expect(isProseDominantSelection('iPhoneを買う')).toBe(false);
        expect(isProseDominantSelection('これはペンです This is a pen')).toBe(false);
    });

    it('only trips once Latin prose dwarfs the Japanese', () => {
        // Latin clearly dominant -> prose.
        expect(isProseDominantSelection('The quick brown fox jumped over 犬 lazily today.')).toBe(true);
        // A Japanese sentence with a few embedded loan words stays under the
        // Latin floor -> lookupable.
        expect(isProseDominantSelection('彼はNew Yorkに行ってMcDonaldで食べた')).toBe(false);
    });
});
