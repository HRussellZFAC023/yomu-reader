import { describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/main';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { ReaderSettings } from '../../src/reader/types';

interface HoverLookupInternals {
    settings: ReaderSettings;
    activePopover?: HTMLElement;
    activePopoverMode?: 'modal' | 'hover';
    activeHoverWord?: HTMLElement;
    pressLookup?: {
        pointerId: number;
        startX: number;
        startY: number;
        active: boolean;
        lastWord?: HTMLElement;
        source: 'primary' | 'middle';
    };
    suppressPenHoverUntil: number;
    canBeginPrimaryPressLookup(event: PointerEvent): boolean;
    handleHoverPointer(event: PointerEvent): void;
    handleHoverPointerOut(event: PointerEvent): void;
    scheduleHoverLookup(word: HTMLElement, event: PointerEvent): void;
    scheduleHoverClose(delay?: number, options?: { ignoreCssHover?: boolean }): void;
    handlePointerTextHover(event: PointerEvent): void;
    isCurrentRenderedWordHover(word: HTMLElement, hoverLookupKey: string, hoverLookupGeneration?: number): boolean;
    isHoverContextActive(options?: { ignoreCssHover?: boolean; ignorePointerPosition?: boolean }): boolean;
    navigateLookupWord(direction: -1 | 1): Promise<void>;
    showWord(word: HTMLElement, options?: unknown): Promise<void>;
    bindEvents(): void;
}

function makeKeyboardNavigable(word: HTMLElement): void {
    Object.defineProperties(word, {
        getClientRects: {
            configurable: true,
            value: () => [new DOMRect(0, 0, 24, 24)],
        },
        scrollIntoView: {
            configurable: true,
            value: vi.fn(),
        },
    });
}

function hoverPointerEvent(
    target: HTMLElement,
    pointerType = 'mouse',
    type = 'pointerover',
    modifiers: Partial<Pick<PointerEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>> = {},
    relatedTarget: Node | null = null,
): PointerEvent {
    const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
    Object.defineProperties(event, {
        target: { value: target },
        relatedTarget: { value: relatedTarget },
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
    it('lets middle-button scanning show a hover-style popup when click and hover lookup are off', () => {
        const app = new ReaderApp();
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word';
        word.dataset.vid = '1';
        word.dataset.sid = '2';
        word.dataset.sentence = '今日は読む';
        word.textContent = '今日';
        document.body.append(word);
        const internals = app as unknown as HoverLookupInternals;

        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnClick: false,
            lookupOnHover: false,
            lookupOnMiddleMouse: true,
        };
        internals.pressLookup = {
            pointerId: 1,
            startX: 0,
            startY: 0,
            active: true,
            lastWord: word,
            source: 'middle',
        };

        try {
            expect(internals.isCurrentRenderedWordHover(word, 'word:1:2:今日は読む')).toBe(true);
            internals.activePopoverMode = 'hover';
            internals.activeHoverWord = word;
            expect(internals.isHoverContextActive({ ignoreCssHover: true, ignorePointerPosition: true })).toBe(true);
            internals.pressLookup = undefined;
            expect(internals.isCurrentRenderedWordHover(word, 'word:1:2:今日は読む')).toBe(false);
            expect(internals.isHoverContextActive({ ignoreCssHover: true, ignorePointerPosition: true })).toBe(false);
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

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

    it('treats a hovered single-word OCR line frame as the parsed OCR word', () => {
        const app = new ReaderApp();
        const layer = document.createElement('div');
        layer.className = 'jpdb-ocr-layer';
        layer.dataset.jpdbReaderRoot = 'true';
        const line = document.createElement('div');
        line.className = 'jpdb-ocr-line';
        line.innerHTML = '<span class="jpdb-ocr-line-text"><span class="jpdb-reader-word" data-vid="1" data-sid="2" data-sentence="読む">読む</span></span>';
        layer.append(line);
        document.body.append(layer);
        const word = line.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const internals = app as unknown as HoverLookupInternals;
        const showWord = vi.fn().mockResolvedValue(undefined);
        const originalElementFromPoint = document.elementFromPoint;
        Object.defineProperty(document, 'elementFromPoint', {
            configurable: true,
            value: vi.fn(() => line),
        });

        internals.settings = {
            ...DEFAULT_SETTINGS,
            hoverOpenDelayMs: 0,
            lookupOnHover: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.showWord = showWord;

        try {
            internals.handleHoverPointer(hoverPointerEvent(line));

            expect(showWord).toHaveBeenCalledWith(word, expect.objectContaining({ trigger: 'hover' }));
        } finally {
            Object.defineProperty(document, 'elementFromPoint', {
                configurable: true,
                value: originalElementFromPoint,
            });
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('treats a clicked single-word OCR line frame as the parsed OCR word', () => {
        const app = new ReaderApp();
        const layer = document.createElement('div');
        layer.className = 'jpdb-ocr-layer';
        layer.dataset.jpdbReaderRoot = 'true';
        const line = document.createElement('div');
        line.className = 'jpdb-ocr-line';
        line.innerHTML = '<span class="jpdb-ocr-line-text"><span class="jpdb-reader-word" data-vid="1" data-sid="2" data-sentence="読む">読む</span></span>';
        layer.append(line);
        document.body.append(layer);
        const word = line.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const internals = app as unknown as HoverLookupInternals;
        const showWord = vi.fn().mockResolvedValue(undefined);

        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnClick: true,
        };
        internals.showWord = showWord;
        internals.bindEvents();

        try {
            const event = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                clientX: 40,
                clientY: 24,
            });
            line.dispatchEvent(event);

            expect(event.defaultPrevented).toBe(true);
            expect(showWord).toHaveBeenCalledWith(word, expect.objectContaining({
                trigger: 'click',
                userGesture: true,
            }));
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

    it('keeps the hover card live when moving directly between parsed words', () => {
        const app = new ReaderApp();
        const firstWord = document.createElement('span');
        firstWord.className = 'jpdb-reader-word';
        firstWord.dataset.vid = '1';
        firstWord.dataset.sid = '2';
        firstWord.dataset.sentence = '猫を見る';
        firstWord.textContent = '猫';
        const nextWord = document.createElement('span');
        nextWord.className = 'jpdb-reader-word';
        nextWord.dataset.vid = '3';
        nextWord.dataset.sid = '4';
        nextWord.dataset.sentence = '犬を見る';
        nextWord.textContent = '犬';
        document.body.append(firstWord, nextWord);

        const internals = app as unknown as HoverLookupInternals;
        const scheduleHoverClose = vi.fn();

        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnHover: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.activePopoverMode = 'hover';
        internals.activeHoverWord = firstWord;
        internals.scheduleHoverClose = scheduleHoverClose;

        try {
            internals.handleHoverPointerOut(hoverPointerEvent(firstWord, 'mouse', 'pointerout', {}, nextWord));

            expect(scheduleHoverClose).not.toHaveBeenCalled();
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('opens the next word immediately while an existing hover card is active', () => {
        const app = new ReaderApp();
        const firstWord = document.createElement('span');
        firstWord.className = 'jpdb-reader-word';
        firstWord.dataset.vid = '1';
        firstWord.dataset.sid = '2';
        firstWord.dataset.sentence = '猫を見る';
        firstWord.textContent = '猫';
        const nextWord = document.createElement('span');
        nextWord.className = 'jpdb-reader-word';
        nextWord.dataset.vid = '3';
        nextWord.dataset.sid = '4';
        nextWord.dataset.sentence = '犬を見る';
        nextWord.textContent = '犬';
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        document.body.append(firstWord, nextWord, popover);

        const internals = app as unknown as HoverLookupInternals;
        const showWord = vi.fn().mockResolvedValue(undefined);
        const originalElementFromPoint = document.elementFromPoint;
        Object.defineProperty(document, 'elementFromPoint', {
            configurable: true,
            value: vi.fn(() => nextWord),
        });

        internals.settings = {
            ...DEFAULT_SETTINGS,
            hoverOpenDelayMs: 250,
            lookupOnHover: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.activePopover = popover;
        internals.activePopoverMode = 'hover';
        internals.activeHoverWord = firstWord;
        internals.showWord = showWord;

        try {
            internals.handleHoverPointer(hoverPointerEvent(nextWord));

            expect(showWord).toHaveBeenCalledWith(nextWord, expect.objectContaining({ trigger: 'hover' }));
        } finally {
            Object.defineProperty(document, 'elementFromPoint', {
                configurable: true,
                value: originalElementFromPoint,
            });
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('moves keyboard lookup focus across parsed words without hovering', async () => {
        const app = new ReaderApp();
        document.body.innerHTML = `
            <p>
                <span class="jpdb-reader-word" data-vid="1" data-sid="1" data-sentence="猫を見る">猫</span>
                <span class="jpdb-reader-word" data-vid="2" data-sid="2" data-sentence="犬を見る">犬</span>
            </p>
        `;
        const words = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        words.forEach(makeKeyboardNavigable);
        const internals = app as unknown as HoverLookupInternals;
        const showWord = vi.fn().mockResolvedValue(undefined);

        internals.settings = {
            ...DEFAULT_SETTINGS,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts },
        };
        internals.showWord = showWord;

        try {
            await internals.navigateLookupWord(1);
            await internals.navigateLookupWord(1);
            await internals.navigateLookupWord(-1);

            expect(showWord.mock.calls.map(call => call[0])).toEqual([words[0], words[1], words[0]]);
            expect(words[0].classList.contains('jpdb-reader-keyboard-active')).toBe(true);
            expect(words[1].classList.contains('jpdb-reader-keyboard-active')).toBe(false);
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('keeps keyboard word navigation inside the selected text range', async () => {
        const app = new ReaderApp();
        document.body.innerHTML = `
            <p>
                <span class="jpdb-reader-word" data-vid="1" data-sid="1" data-sentence="猫を見る">猫</span>
                <span class="jpdb-reader-word" data-vid="2" data-sid="2" data-sentence="犬を見る">犬</span>
                <span class="jpdb-reader-word" data-vid="3" data-sid="3" data-sentence="鳥を見る">鳥</span>
            </p>
        `;
        const words = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        words.forEach(makeKeyboardNavigable);
        const range = document.createRange();
        range.setStartBefore(words[1]);
        range.setEndAfter(words[2]);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        const internals = app as unknown as HoverLookupInternals;
        const showWord = vi.fn().mockResolvedValue(undefined);

        internals.settings = {
            ...DEFAULT_SETTINGS,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts },
        };
        internals.showWord = showWord;

        try {
            await internals.navigateLookupWord(1);
            await internals.navigateLookupWord(1);

            expect(showWord.mock.calls.map(call => call[0])).toEqual([words[1], words[2]]);
            expect(words[0].classList.contains('jpdb-reader-keyboard-active')).toBe(false);
        } finally {
            selection.removeAllRanges();
            app.destroy();
            document.body.replaceChildren();
        }
    });
});
