import { describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { ReaderSettings } from '../../src/reader/app/types';
import {
    appendActivePopoverAndPageWord,
    appendActivePopoverBody,
    appendKeyboardLookupWords,
    appendParsedWordPair,
    appendSingleWordOcrLine,
} from './helpers/hover-fixtures';

interface HoverLookupInternals {
    settings: ReaderSettings;
    activePopover?: HTMLElement;
    activePopoverMode?: 'modal' | 'hover';
    activeHoverWord?: HTMLElement;
    stackedSettingsDialog?: { form: HTMLElement; backdrop?: HTMLElement };
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
    dismissModalPopoverForOutsidePointer(event: PointerEvent): void;
    handlePointerTextHover(event: PointerEvent): void;
    isCurrentRenderedWordHover(word: HTMLElement, hoverLookupKey: string, hoverLookupGeneration?: number): boolean;
    isHoverContextActive(options?: { ignoreCssHover?: boolean; ignorePointerPosition?: boolean }): boolean;
    navigateLookupWord(direction: -1 | 1): Promise<void>;
    showWord(word: HTMLElement, options?: unknown): Promise<void>;
    bindEvents(): void;
}

interface HoverLookupSpyOptions {
    activePopover?: HTMLElement;
    activePopoverMode?: 'modal' | 'hover';
    hoverLookupShortcut?: string;
    settings?: Partial<ReaderSettings>;
}

const KEYBOARD_LOOKUP_WORDS = [
    { vid: '1', sid: '1', sentence: '猫を見る', text: '猫' },
    { vid: '2', sid: '2', sentence: '犬を見る', text: '犬' },
];
const KEYBOARD_LOOKUP_RANGE_WORDS = [
    ...KEYBOARD_LOOKUP_WORDS,
    { vid: '3', sid: '3', sentence: '鳥を見る', text: '鳥' },
];

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

function cleanupReaderApp(app: ReaderApp): void {
    app.destroy();
    document.body.replaceChildren();
}

function activePopoverWordFixture(): { popover: HTMLElement; word: HTMLElement } {
    const popover = document.createElement('div');
    popover.className = 'jpdb-reader-popover';
    popover.dataset.jpdbReaderRoot = 'true';
    popover.innerHTML = `
        <div class="jpdb-reader-example-sentence">
            <span class="jpdb-reader-word jpdb-known" data-vid="1" data-sid="2" data-sentence="今日は読む">読む</span>
        </div>
    `;
    document.body.append(popover);
    return { popover, word: popover.querySelector<HTMLElement>('.jpdb-reader-word')! };
}

function readerWordFixture(sentence: string, text = sentence): HTMLElement {
    const word = document.createElement('span');
    word.className = 'jpdb-reader-word';
    word.dataset.vid = '1';
    word.dataset.sid = '2';
    word.dataset.sentence = sentence;
    word.textContent = text;
    document.body.append(word);
    return word;
}

function stubElementFromPoint(element: Element): () => void {
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: vi.fn(() => element),
    });
    return () => {
        Object.defineProperty(document, 'elementFromPoint', {
            configurable: true,
            value: originalElementFromPoint,
        });
    };
}

function setupKeyboardLookup(wordsFixture = KEYBOARD_LOOKUP_WORDS): {
    app: ReaderApp;
    words: HTMLElement[];
    internals: HoverLookupInternals;
    showWord: ReturnType<typeof vi.fn>;
} {
    const app = new ReaderApp();
    const words = appendKeyboardLookupWords(wordsFixture);
    const internals = app as unknown as HoverLookupInternals;
    const showWord = vi.fn().mockResolvedValue(undefined);

    internals.settings = {
        ...DEFAULT_SETTINGS,
        shortcuts: { ...DEFAULT_SETTINGS.shortcuts },
    };
    internals.showWord = showWord;

    return { app, words, internals, showWord };
}

function setupHoverLookupSpies(
    app: ReaderApp,
    options: HoverLookupSpyOptions = {},
) {
    const internals = app as unknown as HoverLookupInternals;
    const scheduleHoverLookup = vi.fn();
    const handlePointerTextHover = vi.fn();
    internals.settings = hoverLookupSpySettings(options);
    applyHoverLookupSpyPopover(internals, options);
    internals.scheduleHoverLookup = scheduleHoverLookup;
    internals.handlePointerTextHover = handlePointerTextHover;

    return { internals, scheduleHoverLookup, handlePointerTextHover };
}

function hoverLookupSpySettings(options: HoverLookupSpyOptions): ReaderSettings {
    const hoverLookup = options.hoverLookupShortcut ?? options.settings?.shortcuts?.hoverLookup ?? '';
    return {
        ...DEFAULT_SETTINGS,
        ...options.settings,
        lookupOnHover: options.settings?.lookupOnHover ?? true,
        shortcuts: {
            ...DEFAULT_SETTINGS.shortcuts,
            ...options.settings?.shortcuts,
            hoverLookup,
        },
    };
}

function applyHoverLookupSpyPopover(internals: HoverLookupInternals, options: HoverLookupSpyOptions): void {
    if (options.activePopover) internals.activePopover = options.activePopover;
    const activePopoverMode = options.activePopoverMode ?? (options.activePopover ? 'modal' : undefined);
    if (activePopoverMode) internals.activePopoverMode = activePopoverMode;
}

function expectNoHoverLookup({
    scheduleHoverLookup,
    handlePointerTextHover,
}: ReturnType<typeof setupHoverLookupSpies>): void {
    expect(scheduleHoverLookup).not.toHaveBeenCalled();
    expect(handlePointerTextHover).not.toHaveBeenCalled();
}

describe('hover lookup', () => {
    it('lets middle-button scanning show a hover-style popup when click and hover lookup are off', () => {
        const app = new ReaderApp();
        const word = readerWordFixture('今日は読む', '今日');
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
            cleanupReaderApp(app);
        }
    });

    it('keeps parsed words inside the active popover click-only on hover', () => {
        const app = new ReaderApp();
        const { popover, word } = activePopoverWordFixture();
        const hoverLookup = setupHoverLookupSpies(app, { activePopover: popover });

        try {
            hoverLookup.internals.handleHoverPointer(hoverPointerEvent(word));

            expectNoHoverLookup(hoverLookup);
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('keeps modifier-hover disabled while a clicked popover is open', () => {
        const app = new ReaderApp();
        const { popover, word } = activePopoverWordFixture();
        const hoverLookup = setupHoverLookupSpies(app, {
            activePopover: popover,
            hoverLookupShortcut: 'Shift',
        });

        try {
            hoverLookup.internals.handleHoverPointer(
                hoverPointerEvent(word, 'mouse', 'pointerover', { shiftKey: true }),
            );

            expectNoHoverLookup(hoverLookup);
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('dismisses a modal popover on outside pointerdown', () => {
        const app = new ReaderApp();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        popover.textContent = '辞書';
        const outside = document.createElement('button');
        outside.textContent = 'outside';
        document.body.append(popover, outside);
        const internals = app as unknown as HoverLookupInternals;
        internals.activePopover = popover;
        internals.activePopoverMode = 'modal';

        try {
            internals.dismissModalPopoverForOutsidePointer(hoverPointerEvent(outside, 'mouse', 'pointerdown'));

            expect(popover.isConnected).toBe(false);
            expect(internals.activePopover).toBeUndefined();
            expect(internals.activePopoverMode).toBeUndefined();
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('keeps a modal popover when outside pointerdown lands in an owned reader overlay', () => {
        const app = new ReaderApp();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        popover.textContent = '辞書';
        const overlay = document.createElement('div');
        overlay.className = 'jpdb-ocr-layer';
        overlay.dataset.jpdbReaderRoot = 'true';
        overlay.textContent = 'overlay';
        document.body.append(popover, overlay);
        const internals = app as unknown as HoverLookupInternals;
        internals.activePopover = popover;
        internals.activePopoverMode = 'modal';

        try {
            internals.dismissModalPopoverForOutsidePointer(hoverPointerEvent(overlay, 'mouse', 'pointerdown'));

            expect(popover.isConnected).toBe(true);
            expect(internals.activePopover).toBe(popover);
            expect(internals.activePopoverMode).toBe('modal');
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('still dismisses a modal popover when outside pointerdown lands on its backdrop', () => {
        const app = new ReaderApp();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        const backdrop = document.createElement('div');
        backdrop.className = 'jpdb-reader-backdrop';
        backdrop.dataset.jpdbReaderRoot = 'true';
        document.body.append(popover, backdrop);
        const internals = app as unknown as HoverLookupInternals;
        internals.activePopover = popover;
        internals.activePopoverMode = 'modal';

        try {
            internals.dismissModalPopoverForOutsidePointer(hoverPointerEvent(backdrop, 'mouse', 'pointerdown'));

            expect(popover.isConnected).toBe(false);
            expect(backdrop.isConnected).toBe(false);
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('keeps a modal popover when outside pointerdown lands on a review control', () => {
        const app = new ReaderApp();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        const form = document.createElement('form');
        form.setAttribute('action', '/review');
        const review = document.createElement('button');
        review.textContent = 'Good';
        form.append(review);
        document.body.append(popover, form);
        const internals = app as unknown as HoverLookupInternals;
        internals.activePopover = popover;
        internals.activePopoverMode = 'modal';

        try {
            internals.dismissModalPopoverForOutsidePointer(hoverPointerEvent(review, 'mouse', 'pointerdown'));

            expect(popover.isConnected).toBe(true);
            expect(internals.activePopover).toBe(popover);
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('collapses a stacked lookup back to settings when the settings panel is tapped', () => {
        const app = new ReaderApp();
        const settingsForm = document.createElement('form');
        settingsForm.className = 'jpdb-reader-settings';
        settingsForm.dataset.jpdbReaderRoot = 'true';
        const settingsBackdrop = document.createElement('div');
        settingsBackdrop.className = 'jpdb-reader-backdrop';
        settingsBackdrop.dataset.jpdbReaderRoot = 'true';
        const lookup = document.createElement('div');
        lookup.className = 'jpdb-reader-popover';
        lookup.dataset.jpdbReaderRoot = 'true';
        lookup.textContent = '辞書';
        document.body.append(settingsBackdrop, settingsForm, lookup);
        const internals = app as unknown as HoverLookupInternals;
        internals.activePopover = lookup;
        internals.activePopoverMode = 'modal';
        internals.stackedSettingsDialog = { form: settingsForm, backdrop: settingsBackdrop };

        try {
            // Touch tap on the settings panel behind the stacked lookup.
            internals.dismissModalPopoverForOutsidePointer(hoverPointerEvent(settingsForm, 'touch', 'pointerdown'));

            expect(lookup.isConnected).toBe(false);
            expect(settingsForm.isConnected).toBe(true);
            expect(internals.activePopover).toBe(settingsForm);
            expect(internals.stackedSettingsDialog).toBeUndefined();
        } finally {
            cleanupReaderApp(app);
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
        const hoverLookup = setupHoverLookupSpies(app, { hoverLookupShortcut: 'Shift' });

        try {
            hoverLookup.internals.handleHoverPointer(
                hoverPointerEvent(word, 'mouse', 'pointerover', { shiftKey: true }),
            );

            expect(hoverLookup.scheduleHoverLookup).toHaveBeenCalledWith(
                word,
                expect.objectContaining({ shiftKey: true }),
            );
            expect(hoverLookup.handlePointerTextHover).not.toHaveBeenCalled();
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('treats a hovered single-word OCR line frame as the parsed OCR word', () => {
        const app = new ReaderApp();
        const { line, word } = appendSingleWordOcrLine();
        const internals = app as unknown as HoverLookupInternals;
        const showWord = vi.fn().mockResolvedValue(undefined);
        const restoreElementFromPoint = stubElementFromPoint(line);

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
            restoreElementFromPoint();
            cleanupReaderApp(app);
        }
    });

    it('treats a clicked single-word OCR line frame as the parsed OCR word', () => {
        const app = new ReaderApp();
        const { line, word } = appendSingleWordOcrLine();
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
            cleanupReaderApp(app);
        }
    });

    it('keeps plain pointer-text hover disabled inside the active popover chrome', () => {
        const app = new ReaderApp();
        const { popover, body } = appendActivePopoverBody();
        const hoverLookup = setupHoverLookupSpies(app, { activePopover: popover });

        try {
            hoverLookup.internals.handleHoverPointer(hoverPointerEvent(body));

            expectNoHoverLookup(hoverLookup);
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('disables page hover lookups while a clicked popover is open', () => {
        const app = new ReaderApp();
        const { popover, pageWord } = appendActivePopoverAndPageWord();
        const hoverLookup = setupHoverLookupSpies(app, { activePopover: popover });

        try {
            hoverLookup.internals.handleHoverPointer(hoverPointerEvent(pageWord, 'mouse'));
            hoverLookup.internals.handleHoverPointer(hoverPointerEvent(pageWord, 'pen'));

            expectNoHoverLookup(hoverLookup);
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('does not schedule hover close when the pointer leaves a clicked popover', () => {
        const app = new ReaderApp();
        const { popover, body } = appendActivePopoverBody();
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
            cleanupReaderApp(app);
        }
    });

    it('keeps Apple Pencil tap separate from hover preview', () => {
        const app = new ReaderApp();
        const word = readerWordFixture('読む');

        const hoverLookup = setupHoverLookupSpies(app, { settings: { lookupOnClick: true } });

        try {
            expect(hoverLookup.internals.canBeginPrimaryPressLookup(hoverPointerEvent(word, 'pen'))).toBe(false);

            hoverLookup.internals.suppressPenHoverUntil = 0;
            hoverLookup.internals.handleHoverPointer(hoverPointerEvent(word, 'pen'));
            expect(hoverLookup.scheduleHoverLookup).toHaveBeenCalledWith(
                word,
                expect.objectContaining({ pointerType: 'pen' }),
            );

            hoverLookup.scheduleHoverLookup.mockClear();
            hoverLookup.internals.suppressPenHoverUntil = Date.now() + 1000;
            hoverLookup.internals.handleHoverPointer(hoverPointerEvent(word, 'pen'));
            hoverLookup.internals.handleHoverPointerOut(hoverPointerEvent(word, 'pen', 'pointerout'));
            expectNoHoverLookup(hoverLookup);
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('keeps the hover card live when moving directly between parsed words', () => {
        const app = new ReaderApp();
        const { firstWord, nextWord } = appendParsedWordPair();

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
            cleanupReaderApp(app);
        }
    });

    it('opens the next word immediately while an existing hover card is active', () => {
        const app = new ReaderApp();
        const { firstWord, nextWord } = appendParsedWordPair();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        document.body.append(popover);

        const internals = app as unknown as HoverLookupInternals;
        const showWord = vi.fn().mockResolvedValue(undefined);
        const restoreElementFromPoint = stubElementFromPoint(nextWord);

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
            restoreElementFromPoint();
            cleanupReaderApp(app);
        }
    });

    it('moves keyboard lookup focus across parsed words without hovering', async () => {
        const { app, words, internals, showWord } = setupKeyboardLookup();

        try {
            await internals.navigateLookupWord(1);
            await internals.navigateLookupWord(1);
            await internals.navigateLookupWord(-1);

            expect(showWord.mock.calls.map(call => call[0])).toEqual([words[0], words[1], words[0]]);
            expect(words[0].classList.contains('jpdb-reader-keyboard-active')).toBe(true);
            expect(words[1].classList.contains('jpdb-reader-keyboard-active')).toBe(false);
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('keeps keyboard word navigation inside the selected text range', async () => {
        const { app, words, internals, showWord } = setupKeyboardLookup(KEYBOARD_LOOKUP_RANGE_WORDS);
        const range = document.createRange();
        range.setStartBefore(words[1]);
        range.setEndAfter(words[2]);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);

        try {
            await internals.navigateLookupWord(1);
            await internals.navigateLookupWord(1);

            expect(showWord.mock.calls.map(call => call[0])).toEqual([words[1], words[2]]);
            expect(words[0].classList.contains('jpdb-reader-keyboard-active')).toBe(false);
        } finally {
            selection.removeAllRanges();
            cleanupReaderApp(app);
        }
    });
});
