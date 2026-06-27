import { describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import {
    appendActivePopoverAndPageWord,
    appendActivePopoverBody,
    appendKeyboardLookupWords,
    appendParsedWordPair,
    appendSingleWordOcrLine,
} from './helpers/hover-fixtures';

type VitestMock = ReturnType<typeof vi.fn>;

interface HoverLookupInternals {
    settings: ReaderSettings;
    activePopover?: HTMLElement;
    activePopoverMode?: 'modal' | 'hover';
    activeHoverWord?: HTMLElement;
    activeHoverLookupKey: string;
    hoverLookupGeneration: number;
    activePopoverAnchor?: HTMLElement;
    activePointerTextLookup?: { text: string; start: number; end: number; anchor: HTMLElement };
    lastPointerPosition?: { x: number; y: number };
    parser: { cacheCards(cards: JPDBCard[]): void };
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
    handleDocumentClick(event: MouseEvent): void;
    pauseForSubtitleSurfaceTap(event: MouseEvent): boolean;
    scheduleHoverLookup(word: HTMLElement, event: PointerEvent): void;
    scheduleHoverClose(delay?: number, options?: { ignoreCssHover?: boolean }): void;
    dismissModalPopoverForOutsidePointer(event: PointerEvent): void;
    handlePointerTextHover(event: PointerEvent): void;
    lookupCandidateFromPoint(x: number, y: number, eventTarget: EventTarget | null, options?: unknown): { text: string; offset: number; start: number; end: number; anchor: HTMLElement } | null;
    lookupRenderedSelection(selected: string): Promise<boolean>;
    lookupSelection(): Promise<void>;
    readerWordFromRenderedGeometry(target: Element | null, x: number, y: number): HTMLElement | null;
    isCurrentRenderedWordHover(word: HTMLElement, hoverLookupKey: string, hoverLookupGeneration?: number): boolean;
    isHoverContextActive(options?: { ignoreCssHover?: boolean; ignorePointerPosition?: boolean }): boolean;
    navigateLookupWord(direction: -1 | 1): Promise<void>;
    showWord(word: HTMLElement, options?: unknown): Promise<void>;
    cardForRenderedWord(word: HTMLElement): JPDBCard | undefined;
    rememberRenderedWordMiningContext(word: HTMLElement, card: JPDBCard, insideReaderPopup: boolean): void;
    renderedWordDisplayContext(word: HTMLElement, options?: unknown, insideReaderPopup?: boolean): {
        trigger: 'modal' | 'hover';
        navigation: 'reset' | 'push' | 'replace';
        anchor: HTMLElement;
        sentence?: string;
        hoverLookupKey?: string;
        insideReaderPopup: boolean;
        previousNavigationEntry?: unknown;
    };
    refreshActiveRenderedWordHover(word: HTMLElement, context: unknown): boolean;
    isStaleRenderedWordHover(word: HTMLElement, context: unknown, hoverLookupGeneration?: number): boolean;
    preloadHoverWordAudio(word: HTMLElement): void;
    preloadParsedTokens(tokens: JPDBToken[]): void;
    preloadTermAudioForTokens(tokens: JPDBToken[]): void;
    audio: { primeUserGesture(): boolean };
    audioActions: { playTermAudio(card: JPDBCard, options?: Record<string, unknown>): Promise<void> | void };
    shouldAutoPlay(card: JPDBCard, trigger: 'modal' | 'hover', userGesture?: boolean, anchor?: HTMLElement, hoverLookupGeneration?: number): boolean;
    resolveLookupCard(card: JPDBCard): Promise<JPDBCard>;
    maybeAutoPlayInitialCard(card: JPDBCard, context: {
        trigger: 'modal' | 'hover';
        options: Record<string, unknown>;
        anchor?: HTMLElement;
        isCurrentHoverCard(): boolean;
        hoverLookupGeneration?: number;
    }): void;
    showAlternativeRenderedWordCandidate(word: HTMLElement, card: JPDBCard, context: unknown, options: unknown, stackOverSettings: boolean): Promise<boolean>;
    showCard(card: JPDBCard, sentence?: string, anchor?: HTMLElement, options?: Record<string, unknown>): Promise<void>;
    mountPopover(popover: HTMLElement, anchor?: HTMLElement, options?: { mode?: 'modal' | 'hover'; focusOnMount?: boolean }): void;
    dismiss(options?: { suppressHoverTarget?: boolean }): void;
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
const HOVER_LOOKUP_CARD: JPDBCard = {
    vid: 1,
    sid: 2,
    rid: 3,
    spelling: '読む',
    reading: 'よむ',
    frequencyRank: 100,
    partOfSpeech: ['v5m'],
    meanings: [],
    cardState: ['known'],
    pitchAccent: ['HL'],
    wordWithReading: null,
};

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
        button: { value: 0 },
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

function passiveButtonWordFixture(): { button: HTMLButtonElement; overlay: HTMLElement; word: HTMLElement } {
    const button = document.createElement('button');
    button.innerHTML = `
        <span class="ytAttributedStringHost">
            <span class="jpdb-reader-word jpdb-reader-passive-word" data-vid="1" data-sid="2" data-sentence="もっと見る" data-jpdb-reader-passive="true">もっと</span>
        </span>
        <span class="ytSpecTouchFeedbackShapeFill"></span>
    `;
    const word = button.querySelector<HTMLElement>('.jpdb-reader-word')!;
    const overlay = button.querySelector<HTMLElement>('.ytSpecTouchFeedbackShapeFill')!;
    Object.defineProperties(word, {
        getClientRects: {
            configurable: true,
            value: () => [new DOMRect(20, 10, 56, 28)],
        },
        getBoundingClientRect: {
            configurable: true,
            value: () => new DOMRect(20, 10, 56, 28),
        },
    });
    document.body.append(button);
    return { button, overlay, word };
}

function passiveJpdbLinkWordFixture(): { link: HTMLAnchorElement; word: HTMLElement } {
    const link = document.createElement('a');
    link.className = 'plain';
    link.href = '/kanji/一#a';
    link.innerHTML = `
        <span class="jpdb-reader-word jpdb-reader-passive-word" data-vid="1" data-sid="2" data-expression="一" data-reading="いち" data-sentence="一" data-jpdb-reader-passive="true">一</span>
    `;
    const word = link.querySelector<HTMLElement>('.jpdb-reader-word')!;
    Object.defineProperties(word, {
        getClientRects: {
            configurable: true,
            value: () => [new DOMRect(20, 10, 32, 28)],
        },
        getBoundingClientRect: {
            configurable: true,
            value: () => new DOMRect(20, 10, 32, 28),
        },
    });
    document.body.append(link);
    return { link, word };
}

function subtitleRowHitStackFixture(): { row: HTMLElement; surface: HTMLElement; word: HTMLElement } {
    const list = document.createElement('div');
    list.className = 'jpdb-subtitle-list';
    list.dataset.jpdbReaderRoot = 'true';
    const row = document.createElement('div');
    row.className = 'jpdb-subtitle-list-row';
    const word = document.createElement('span');
    word.className = 'jpdb-reader-word';
    word.dataset.vid = '1';
    word.dataset.sid = '2';
    word.dataset.sentence = '今日は読む';
    const surface = document.createElement('span');
    surface.textContent = '読む';
    word.append(surface);
    row.append(word);
    list.append(row);
    document.body.append(list);
    return { row, surface, word };
}

function appendPlayingVideo() {
    const video = document.createElement('video');
    let paused = false;
    const pause = vi.fn(() => {
        paused = true;
        video.dispatchEvent(new Event('pause'));
    });
    const play = vi.fn(async () => {
        paused = false;
        video.dispatchEvent(new Event('play'));
    });
    Object.defineProperties(video, {
        readyState: { configurable: true, value: 4 },
        paused: { configurable: true, get: () => paused },
        ended: { configurable: true, value: false },
        pause: { configurable: true, value: pause },
        play: { configurable: true, value: play },
        getBoundingClientRect: {
            configurable: true,
            value: () => new DOMRect(0, 0, 960, 540),
        },
    });
    document.body.append(video);
    return { video, pause: pause as VitestMock, play: play as VitestMock };
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

function stubElementsFromPoint(elements: Element[]): () => void {
    const originalElementsFromPoint = document.elementsFromPoint;
    Object.defineProperty(document, 'elementsFromPoint', {
        configurable: true,
        value: vi.fn(() => elements),
    });
    return () => {
        Object.defineProperty(document, 'elementsFromPoint', {
            configurable: true,
            value: originalElementsFromPoint,
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
    it('pauses a playing video for modal lookups opened from ASB subtitle words', () => {
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        internals.settings = {
            ...DEFAULT_SETTINGS,
            subtitleMiningPause: true,
        };
        const { pause, play } = appendPlayingVideo();
        const asbRoot = document.createElement('div');
        asbRoot.className = 'asbplayer-subtitles-container-bottom';
        asbRoot.innerHTML = '<span class="jpdb-reader-word" data-vid="1" data-sid="2" data-sentence="今日は読む">読む</span>';
        document.body.append(asbRoot);
        const word = asbRoot.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.tabIndex = -1;

        try {
            internals.mountPopover(popover, word, { mode: 'modal', focusOnMount: false });

            expect(pause).toHaveBeenCalledTimes(1);

            internals.dismiss();

            expect(play).toHaveBeenCalledTimes(1);
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('pauses a playing video for HOVER previews opened over a subtitle word', () => {
        // The shipped default activation mode is hover, so a hover preview is how
        // most users look up a caption word. Hovering a caption must pause too —
        // otherwise the line scrolls out from under the cursor before it can be
        // read (the "hovering a caption doesn't pause / mis-press" report).
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        internals.settings = { ...DEFAULT_SETTINGS, subtitleMiningPause: true };
        const { pause, play } = appendPlayingVideo();
        const asbRoot = document.createElement('div');
        asbRoot.className = 'asbplayer-subtitles-container-bottom';
        asbRoot.innerHTML = '<span class="jpdb-reader-word" data-vid="1" data-sid="2" data-sentence="今日は読む">読む</span>';
        document.body.append(asbRoot);
        const word = asbRoot.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.tabIndex = -1;

        try {
            internals.mountPopover(popover, word, { mode: 'hover', focusOnMount: false });
            expect(pause).toHaveBeenCalledTimes(1);

            internals.dismiss();
            expect(play).toHaveBeenCalledTimes(1);
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('does not pause for subtitle hover previews when hover pause is disabled', () => {
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        internals.settings = { ...DEFAULT_SETTINGS, subtitleMiningPause: true, subtitleHoverPause: false };
        const { pause, play } = appendPlayingVideo();
        const asbRoot = document.createElement('div');
        asbRoot.className = 'asbplayer-subtitles-container-bottom';
        asbRoot.innerHTML = '<span class="jpdb-reader-word" data-vid="1" data-sid="2" data-sentence="今日は読む">読む</span>';
        document.body.append(asbRoot);
        const word = asbRoot.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.tabIndex = -1;

        try {
            internals.mountPopover(popover, word, { mode: 'hover', focusOnMount: false });
            expect(pause).not.toHaveBeenCalled();

            internals.dismiss();
            expect(play).not.toHaveBeenCalled();
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('still pauses clicked subtitle lookups when hover pause is disabled', () => {
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        internals.settings = { ...DEFAULT_SETTINGS, subtitleMiningPause: true, subtitleHoverPause: false };
        const { pause, play } = appendPlayingVideo();
        const asbRoot = document.createElement('div');
        asbRoot.className = 'asbplayer-subtitles-container-bottom';
        asbRoot.innerHTML = '<span class="jpdb-reader-word" data-vid="1" data-sid="2" data-sentence="今日は読む">読む</span>';
        document.body.append(asbRoot);
        const word = asbRoot.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.tabIndex = -1;

        try {
            internals.mountPopover(popover, word, { mode: 'modal', focusOnMount: false });
            expect(pause).toHaveBeenCalledTimes(1);

            internals.dismiss();
            expect(play).toHaveBeenCalledTimes(1);
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('does NOT pause for a hover preview over ordinary page text while a video plays', () => {
        // Hover previews over general page text keep playing — only real caption
        // surfaces opt into hover-pause, so a background video is left alone.
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        internals.settings = { ...DEFAULT_SETTINGS, subtitleMiningPause: true };
        const { pause } = appendPlayingVideo();
        const article = document.createElement('p');
        article.innerHTML = '<span class="jpdb-reader-word" data-vid="3" data-sid="4" data-sentence="記事の文章">文章</span>';
        document.body.append(article);
        const word = article.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.tabIndex = -1;

        try {
            internals.mountPopover(popover, word, { mode: 'hover', focusOnMount: false });
            expect(pause).not.toHaveBeenCalled();
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('pauses a playing video when a tap lands on the caption text but misses a word', () => {
        // Japanese captions tile with no gaps, so on a phone the line padding,
        // furigana band, or a wrapped line's inter-line gap is easy to hit instead
        // of an exact word. Such a near-miss must still pause so the line freezes.
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        internals.settings = { ...DEFAULT_SETTINGS, subtitleMiningPause: true };
        const { pause } = appendPlayingVideo();
        const overlay = document.createElement('div');
        overlay.className = 'jpdb-subtitle-player';
        overlay.innerHTML = '<div class="jpdb-subtitle-text"><div class="jpdb-subtitle-lines"><div class="jpdb-subtitle-primary">字幕</div></div></div>';
        document.body.append(overlay);
        const textBox = overlay.querySelector<HTMLElement>('.jpdb-subtitle-text')!;
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'target', { value: textBox });

        try {
            expect(internals.pauseForSubtitleSurfaceTap(event)).toBe(true);
            expect(pause).toHaveBeenCalledTimes(1);
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('does not claim a caption-surface tap that landed on a word or a control', () => {
        // A word tap is handled by the lookup path (which pauses); a control tap
        // must not be stolen. Either way pauseForSubtitleSurfaceTap stands down.
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        internals.settings = { ...DEFAULT_SETTINGS, subtitleMiningPause: true };
        const { pause } = appendPlayingVideo();
        const overlay = document.createElement('div');
        overlay.className = 'jpdb-subtitle-player';
        overlay.innerHTML = '<div class="jpdb-subtitle-text"><div class="jpdb-subtitle-lines"><span class="jpdb-reader-word" data-vid="1" data-sid="2">字幕</span><button data-action="playback">▶</button></div></div>';
        document.body.append(overlay);
        const wordEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
        Object.defineProperty(wordEvent, 'target', { value: overlay.querySelector('.jpdb-reader-word') });
        const controlEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
        Object.defineProperty(controlEvent, 'target', { value: overlay.querySelector('[data-action]') });

        try {
            expect(internals.pauseForSubtitleSurfaceTap(wordEvent)).toBe(false);
            expect(internals.pauseForSubtitleSurfaceTap(controlEvent)).toBe(false);
            expect(pause).not.toHaveBeenCalled();
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('uses fast initial render for clicked subtitle words on desktop', () => {
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        const overlay = document.createElement('div');
        overlay.className = 'jpdb-subtitle-player';
        overlay.innerHTML = '<div class="jpdb-subtitle-text"><span class="jpdb-reader-word" data-vid="1" data-sid="2" data-sentence="今日は読む">読む</span></div>';
        document.body.append(overlay);
        const word = overlay.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const showWord = vi.fn().mockResolvedValue(undefined);
        const controller = new AbortController();
        internals.settings = { ...DEFAULT_SETTINGS, subtitleMiningPause: true };
        internals.showWord = showWord;
        document.addEventListener('click', event => internals.handleDocumentClick(event), { capture: true, signal: controller.signal });

        try {
            word.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                clientX: 24,
                clientY: 24,
            }));

            expect(showWord).toHaveBeenCalledWith(word, expect.objectContaining({
                trigger: 'click',
                userGesture: true,
                fastInitialRender: true,
            }));
        } finally {
            controller.abort();
            cleanupReaderApp(app);
        }
    });

    it('re-asserts the mining pause when the page re-plays the video, then stops once the popover closes', () => {
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        internals.settings = { ...DEFAULT_SETTINGS, subtitleMiningPause: true };
        const { video, pause, play } = appendPlayingVideo();
        const asbRoot = document.createElement('div');
        asbRoot.className = 'asbplayer-subtitles-container-bottom';
        asbRoot.innerHTML = '<span class="jpdb-reader-word" data-vid="1" data-sid="2" data-sentence="今日は読む">読む</span>';
        document.body.append(asbRoot);
        const word = asbRoot.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.tabIndex = -1;

        try {
            internals.mountPopover(popover, word, { mode: 'modal', focusOnMount: false });
            expect(pause).toHaveBeenCalledTimes(1);

            // A competing extension / player quirk re-plays the video right after
            // our pause: play() flips paused=false and fires 'play'.
            void video.play();
            expect(pause).toHaveBeenCalledTimes(2); // re-asserted
            expect(video.paused).toBe(true);

            // Closing the popover resumes once and is NOT re-paused by our guard.
            internals.dismiss();
            expect(play).toHaveBeenCalledTimes(2); // the antagonist play + the resume
            expect(pause).toHaveBeenCalledTimes(2);
            expect(video.paused).toBe(false);

            // The guard is gone: a later re-play is left alone.
            void video.play();
            expect(pause).toHaveBeenCalledTimes(2);
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('tears down the mining-pause re-assert on destroy so a later re-play is not fought', () => {
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        internals.settings = { ...DEFAULT_SETTINGS, subtitleMiningPause: true };
        const { video, pause } = appendPlayingVideo();
        const asbRoot = document.createElement('div');
        asbRoot.className = 'asbplayer-subtitles-container-bottom';
        asbRoot.innerHTML = '<span class="jpdb-reader-word" data-vid="1" data-sid="2" data-sentence="今日は読む">読む</span>';
        document.body.append(asbRoot);
        const word = asbRoot.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.tabIndex = -1;

        try {
            internals.mountPopover(popover, word, { mode: 'modal', focusOnMount: false });
            expect(pause).toHaveBeenCalledTimes(1);

            app.destroy();

            // A dead app instance must not keep re-pausing the live video.
            void video.play();
            expect(pause).toHaveBeenCalledTimes(1);
        } finally {
            document.body.replaceChildren();
        }
    });

    it('does not suppress autoplay for a fresh hover of the same card', () => {
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        internals.settings = {
            ...DEFAULT_SETTINGS,
            audioEnabled: true,
            autoPlayAudio: true,
            audioAutoPlayMode: 'hover',
            suppressAutoAudioOnVideo: false,
        };

        try {
            expect(internals.shouldAutoPlay(HOVER_LOOKUP_CARD, 'hover', false, undefined, 1)).toBe(true);
            expect(internals.shouldAutoPlay(HOVER_LOOKUP_CARD, 'hover', false, undefined, 1)).toBe(false);
            expect(internals.shouldAutoPlay(HOVER_LOOKUP_CARD, 'hover', false, undefined, 2)).toBe(true);
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('resolves fallback hover cards before initial autoplay so recorded audio can win', async () => {
        const app = new ReaderApp();
        const word = readerWordFixture('青空を見る', '青空');
        const internals = app as unknown as HoverLookupInternals;
        const fallbackCard: JPDBCard = {
            ...HOVER_LOOKUP_CARD,
            vid: -1,
            sid: -1,
            rid: -1,
            spelling: '青空',
            reading: '青空',
            source: 'fallback',
            pitchAccent: [],
        };
        const publicCard: JPDBCard = {
            ...HOVER_LOOKUP_CARD,
            vid: 10,
            sid: 20,
            rid: 30,
            spelling: '青空',
            reading: 'あおぞら',
            source: 'jpdb',
        };
        const playTermAudio = vi.fn();
        const resolveLookupCard = vi.fn(async () => publicCard);

        internals.settings = {
            ...DEFAULT_SETTINGS,
            audioEnabled: true,
            autoPlayAudio: true,
            audioAutoPlayMode: 'hover',
            suppressAutoAudioOnVideo: false,
        };
        internals.audioActions = { playTermAudio };
        internals.resolveLookupCard = resolveLookupCard;

        try {
            internals.maybeAutoPlayInitialCard(fallbackCard, {
                trigger: 'hover',
                options: { trigger: 'hover', skipInitialCardResolution: true },
                anchor: word,
                isCurrentHoverCard: () => true,
                hoverLookupGeneration: 7,
            });

            await vi.waitFor(() => expect(playTermAudio).toHaveBeenCalledTimes(1));
            expect(resolveLookupCard).toHaveBeenCalledWith(fallbackCard);
            expect(playTermAudio).toHaveBeenCalledWith(
                publicCard,
                expect.objectContaining({
                    autoPlay: true,
                    hoverLookupGeneration: 7,
                    isCurrent: expect.any(Function),
                }),
            );
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('primes gesture audio on pointerdown when autoplay is hover-only', () => {
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        const primeUserGesture = vi.fn(() => true);
        const word = readerWordFixture('今日は読む', '読む');
        internals.settings = {
            ...DEFAULT_SETTINGS,
            audioEnabled: true,
            autoPlayAudio: true,
            audioAutoPlayMode: 'hover',
            lookupOnHover: true,
        };
        internals.audio = { primeUserGesture };
        internals.bindEvents();

        try {
            word.dispatchEvent(hoverPointerEvent(word, 'mouse', 'pointerdown'));

            expect(primeUserGesture).toHaveBeenCalledTimes(1);
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('retries audio when the pointer returns to the same active hover card', () => {
        const app = new ReaderApp();
        const word = readerWordFixture('今日は読む', '読む');
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        document.body.append(popover);
        const internals = app as unknown as HoverLookupInternals;
        const playTermAudio = vi.fn();
        const restoreElementFromPoint = stubElementFromPoint(word);
        internals.settings = {
            ...DEFAULT_SETTINGS,
            audioEnabled: true,
            autoPlayAudio: true,
            audioAutoPlayMode: 'hover',
            suppressAutoAudioOnVideo: false,
            lookupOnHover: true,
        };
        internals.activePopover = popover;
        internals.activePopoverMode = 'hover';
        internals.activeHoverWord = word;
        internals.activePopoverAnchor = word;
        internals.activeHoverLookupKey = 'word:1:2:今日は読む';
        internals.hoverLookupGeneration = 9;
        internals.cardForRenderedWord = vi.fn(() => HOVER_LOOKUP_CARD);
        internals.audioActions = { playTermAudio };

        try {
            internals.handleHoverPointer(hoverPointerEvent(word, 'mouse', 'pointerover', {}, document.body));

            expect(playTermAudio).toHaveBeenCalledTimes(1);
            expect(playTermAudio).toHaveBeenCalledWith(
                HOVER_LOOKUP_CARD,
                expect.objectContaining({
                    autoPlay: true,
                    hoverLookupGeneration: 9,
                    isCurrent: expect.any(Function),
                }),
            );
            expect((playTermAudio.mock.calls[0]?.[1] as { isCurrent: () => boolean }).isCurrent()).toBe(true);

            internals.handleHoverPointer(hoverPointerEvent(word, 'mouse', 'pointerover', {}, word));
            expect(playTermAudio).toHaveBeenCalledTimes(1);
        } finally {
            restoreElementFromPoint();
            cleanupReaderApp(app);
        }
    });

    it('lets another popup reader own page click, hover, and selection when Yomu popup lookup is off', async () => {
        const app = new ReaderApp();
        const word = readerWordFixture('今日は読む', '読む');
        const internals = app as unknown as HoverLookupInternals;
        const showWord = vi.fn().mockResolvedValue(undefined);
        const lookupRenderedSelection = vi.fn(async () => true);

        internals.settings = {
            ...DEFAULT_SETTINGS,
            popupActivationMode: 'off',
            lookupOnClick: true,
            lookupOnHover: true,
            parseSelection: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.showWord = showWord;
        internals.lookupRenderedSelection = lookupRenderedSelection;
        internals.bindEvents();

        try {
            const click = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 40, clientY: 24 });
            word.dispatchEvent(click);

            expect(click.defaultPrevented).toBe(false);
            expect(showWord).not.toHaveBeenCalled();

            const hoverLookup = setupHoverLookupSpies(app, { settings: internals.settings });
            hoverLookup.internals.handleHoverPointer(hoverPointerEvent(word));
            expectNoHoverLookup(hoverLookup);
            expect(hoverLookup.internals.canBeginPrimaryPressLookup(hoverPointerEvent(word, 'mouse'))).toBe(false);

            const range = document.createRange();
            range.selectNode(word);
            const selection = window.getSelection()!;
            selection.removeAllRanges();
            selection.addRange(range);
            await internals.lookupSelection();

            expect(lookupRenderedSelection).not.toHaveBeenCalled();
        } finally {
            window.getSelection()?.removeAllRanges();
            cleanupReaderApp(app);
        }
    });

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

    it('dismisses a modal popover on outside pointerdown while preserving page selection', () => {
        const app = new ReaderApp();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        popover.textContent = '辞書';
        const outside = document.createElement('button');
        outside.textContent = '外';
        const selected = document.createElement('p');
        selected.textContent = 'ママがサンタにキッスした';
        document.body.append(popover, outside, selected);
        const range = document.createRange();
        range.selectNodeContents(selected);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
        const internals = app as unknown as HoverLookupInternals;
        internals.activePopover = popover;
        internals.activePopoverMode = 'modal';

        try {
            const event = hoverPointerEvent(outside, 'mouse', 'pointerdown');
            internals.dismissModalPopoverForOutsidePointer(event);

            expect(event.defaultPrevented).toBe(true);
            expect(window.getSelection()?.toString()).toBe('ママがサンタにキッスした');
            expect(popover.isConnected).toBe(false);
            expect(internals.activePopover).toBeUndefined();
            expect(internals.activePopoverMode).toBeUndefined();
        } finally {
            window.getSelection()?.removeAllRanges();
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
        word.getBoundingClientRect = () => ({ left: 30, top: 20, right: 50, bottom: 30, width: 20, height: 10 } as DOMRect);
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

    it('auto-plays hover audio for OCR image words resolved from line geometry', async () => {
        const app = new ReaderApp();
        const { line, word } = appendSingleWordOcrLine();
        word.getBoundingClientRect = () => ({ left: 30, top: 20, right: 50, bottom: 30, width: 20, height: 10 } as DOMRect);
        const internals = app as unknown as HoverLookupInternals;
        const parser = internals.parser as typeof internals.parser & {
            getCachedCard(vid: number, sid: number): JPDBCard | undefined;
        };
        const getCachedCard = vi.spyOn(parser, 'getCachedCard').mockReturnValue(HOVER_LOOKUP_CARD);
        const playTermAudio = vi.fn();
        const showCard = vi.fn(async (
            card: JPDBCard,
            sentence?: string,
            anchor?: HTMLElement,
            options: Record<string, unknown> = {},
        ) => {
            const trigger = options.trigger === 'hover' ? 'hover' : 'modal';
            if (!internals.shouldAutoPlay(
                card,
                trigger,
                Boolean(options.userGesture),
                anchor,
                typeof options.hoverLookupGeneration === 'number' ? options.hoverLookupGeneration : undefined,
            )) return;
            await internals.audioActions.playTermAudio(card, {
                autoPlay: true,
                hoverLookupGeneration: options.hoverLookupGeneration,
                isCurrent: trigger === 'hover' ? () => true : undefined,
            });
            void sentence;
        });
        const restoreElementFromPoint = stubElementFromPoint(line);

        internals.settings = {
            ...DEFAULT_SETTINGS,
            audioEnabled: true,
            autoPlayAudio: true,
            audioAutoPlayMode: 'hover',
            hoverOpenDelayMs: 0,
            lookupOnHover: true,
            suppressAutoAudioOnVideo: false,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.audioActions = { playTermAudio };
        internals.preloadHoverWordAudio = vi.fn();
        internals.showCard = showCard;

        try {
            internals.handleHoverPointer(hoverPointerEvent(line));
            await Promise.resolve();

            expect(getCachedCard).toHaveBeenCalledWith(1, 2);
            expect(showCard).toHaveBeenCalledWith(
                HOVER_LOOKUP_CARD,
                '読む',
                word,
                expect.objectContaining({
                    trigger: 'hover',
                    hoverLookupKey: 'word:1:2:読む',
                }),
            );
            expect(playTermAudio).toHaveBeenCalledWith(
                HOVER_LOOKUP_CARD,
                expect.objectContaining({
                    autoPlay: true,
                    hoverLookupGeneration: expect.any(Number),
                }),
            );
        } finally {
            restoreElementFromPoint();
            cleanupReaderApp(app);
        }
    });

    it('keeps an OCR hover card alive while moving over non-Japanese text in the same OCR line', () => {
        const app = new ReaderApp();
        const line = document.createElement('div');
        line.className = 'jpdb-ocr-line jpdb-ocr-line-active';
        line.dataset.ocrText = '黒猫 VS 白猫';
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word';
        word.dataset.vid = '1';
        word.dataset.sid = '2';
        word.dataset.sentence = '黒猫 VS 白猫';
        word.textContent = '黒猫';
        const latin = document.createElement('span');
        latin.textContent = ' VS ';
        line.append(word, latin);
        document.body.append(line);
        const { popover } = appendActivePopoverBody();
        const internals = app as unknown as HoverLookupInternals;
        const restoreElementFromPoint = stubElementFromPoint(latin);

        internals.settings = { ...DEFAULT_SETTINGS, lookupOnHover: true };
        internals.activePopover = popover;
        internals.activePopoverMode = 'hover';
        internals.activeHoverWord = word;
        internals.lastPointerPosition = { x: 40, y: 24 };

        try {
            expect(internals.isHoverContextActive({ ignoreCssHover: true })).toBe(true);
        } finally {
            restoreElementFromPoint();
            cleanupReaderApp(app);
        }
    });

    it('hovers passive words inside button feedback overlays without stealing button clicks', () => {
        vi.stubGlobal('location', {
            href: 'https://example.com/',
            origin: 'https://example.com',
            hostname: 'example.com',
        });
        const app = new ReaderApp();
        const { overlay, word } = passiveButtonWordFixture();
        const internals = app as unknown as HoverLookupInternals;
        const showWord = vi.fn().mockResolvedValue(undefined);
        const restoreElementFromPoint = stubElementFromPoint(overlay);
        const restoreElementsFromPoint = stubElementsFromPoint([overlay, word]);

        internals.settings = {
            ...DEFAULT_SETTINGS,
            hoverOpenDelayMs: 0,
            lookupOnHover: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.showWord = showWord;

        try {
            internals.handleHoverPointer(hoverPointerEvent(overlay));

            expect(showWord).toHaveBeenCalledWith(word, expect.objectContaining({ trigger: 'hover' }));
        } finally {
            restoreElementFromPoint();
            restoreElementsFromPoint();
            cleanupReaderApp(app);
            vi.unstubAllGlobals();
        }
    });

    it('hovers passive JPDB link words when hit testing only returns the host link', () => {
        vi.stubGlobal('location', {
            href: 'https://jpdb.io/kanji/%E4%B8%80#a',
            origin: 'https://jpdb.io',
            hostname: 'jpdb.io',
        });
        const app = new ReaderApp();
        const { link, word } = passiveJpdbLinkWordFixture();
        const internals = app as unknown as HoverLookupInternals;
        const showWord = vi.fn().mockResolvedValue(undefined);
        const restoreElementFromPoint = stubElementFromPoint(link);
        const restoreElementsFromPoint = stubElementsFromPoint([link]);

        internals.settings = {
            ...DEFAULT_SETTINGS,
            hoverOpenDelayMs: 0,
            lookupOnHover: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.showWord = showWord;

        try {
            internals.handleHoverPointer(hoverPointerEvent(link));

            expect(showWord).toHaveBeenCalledWith(word, expect.objectContaining({ trigger: 'hover' }));
        } finally {
            restoreElementFromPoint();
            restoreElementsFromPoint();
            cleanupReaderApp(app);
            vi.unstubAllGlobals();
        }
    });

    it('opens passive text-mirror words inside title links on click lookup', () => {
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
        });
        document.body.innerHTML = `
            <a class="video-title" href="/watch?v=abc123">
                <span class="title-host">
                    <span class="jpdb-reader-text-mirror" data-jpdb-reader-text-mirror="true" data-source-text="【初見】">
                        【<span class="jpdb-reader-word jpdb-reader-scan-word jpdb-reader-passive-word" data-vid="1798820" data-sid="0" data-card-source="jiten" data-card-id="1798820" data-reading-index="0" data-token-start="1" data-token-end="3" data-sentence="【初見】" data-expression="初見" data-jpdb-reader-passive="true">初見</span>】
                    </span>
                </span>
            </a>
        `;
        const app = new ReaderApp();
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const linkClick = vi.fn();
        const showWord = vi.fn().mockResolvedValue(undefined);
        const internals = app as unknown as HoverLookupInternals;
        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnClick: true,
        };
        internals.showWord = showWord;
        internals.bindEvents();
        document.querySelector<HTMLAnchorElement>('a.video-title')?.addEventListener('click', linkClick);

        try {
            const click = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 40, clientY: 24 });
            word.dispatchEvent(click);

            expect(click.defaultPrevented).toBe(true);
            expect(linkClick).not.toHaveBeenCalled();
            expect(showWord).toHaveBeenCalledWith(word, expect.objectContaining({
                trigger: 'click',
                userGesture: true,
            }));
        } finally {
            cleanupReaderApp(app);
            vi.unstubAllGlobals();
        }
    });

    it('opens chatbot text-mirror words when the click target is the message host', () => {
        document.body.innerHTML = `
            <section>
                <div data-message-author-role="assistant">
                    <div class="markdown message-content">
                        <span class="jpdb-reader-text-mirror" data-jpdb-reader-text-mirror="true" data-source-text="今日は日本語を勉強しました">
                            今日は<span class="jpdb-reader-word jpdb-reader-scan-word jpdb-reader-passive-word" data-vid="501" data-sid="502" data-card-source="jiten" data-card-id="501" data-reading-index="0" data-token-start="3" data-token-end="6" data-sentence="今日は日本語を勉強しました" data-expression="日本語" data-jpdb-reader-passive="true">日本語</span>を勉強しました
                        </span>
                    </div>
                </div>
            </section>
        `;
        const app = new ReaderApp();
        const host = document.querySelector<HTMLElement>('[data-message-author-role]')!;
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        Object.defineProperties(word, {
            getClientRects: {
                configurable: true,
                value: () => [new DOMRect(36, 12, 48, 20)],
            },
            getBoundingClientRect: {
                configurable: true,
                value: () => new DOMRect(36, 12, 48, 20),
            },
        });
        const showWord = vi.fn().mockResolvedValue(undefined);
        const restoreElementsFromPoint = stubElementsFromPoint([host]);
        const internals = app as unknown as HoverLookupInternals;
        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnClick: true,
        };
        internals.showWord = showWord;
        internals.bindEvents();

        try {
            const click = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 48, clientY: 16 });
            host.dispatchEvent(click);

            expect(click.defaultPrevented).toBe(true);
            expect(showWord).toHaveBeenCalledWith(word, expect.objectContaining({
                trigger: 'click',
                userGesture: true,
            }));
        } finally {
            restoreElementsFromPoint();
            cleanupReaderApp(app);
        }
    });

    it('opens passive scan words on click when no native control owns them', () => {
        document.body.innerHTML = `
            <div class="message-content">
                <span class="jpdb-reader-word jpdb-reader-scan-word jpdb-reader-passive-word" data-vid="501" data-sid="502" data-token-start="0" data-token-end="2" data-sentence="日本語" data-expression="日本語" data-jpdb-reader-passive="true">日本語</span>
            </div>
        `;
        const app = new ReaderApp();
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const showWord = vi.fn().mockResolvedValue(undefined);
        const internals = app as unknown as HoverLookupInternals;
        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnClick: true,
        };
        internals.showWord = showWord;
        internals.bindEvents();

        try {
            const click = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 24, clientY: 24 });
            word.dispatchEvent(click);

            expect(click.defaultPrevented).toBe(true);
            expect(showWord).toHaveBeenCalledWith(word, expect.objectContaining({
                trigger: 'click',
                userGesture: true,
            }));
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('keeps passive text-mirror words inside native buttons click-through', () => {
        document.body.innerHTML = `
            <button type="button">
                <span class="label-host">
                    <span class="jpdb-reader-text-mirror" data-jpdb-reader-text-mirror="true" data-source-text="設定">
                        <span class="jpdb-reader-word jpdb-reader-scan-word jpdb-reader-passive-word" data-vid="501" data-sid="501" data-token-start="0" data-token-end="2" data-sentence="設定" data-expression="設定" data-jpdb-reader-passive="true">設定</span>
                    </span>
                </span>
            </button>
        `;
        const app = new ReaderApp();
        const button = document.querySelector<HTMLButtonElement>('button')!;
        const word = button.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const buttonClick = vi.fn();
        const showWord = vi.fn().mockResolvedValue(undefined);
        const internals = app as unknown as HoverLookupInternals;
        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnClick: true,
        };
        internals.showWord = showWord;
        internals.bindEvents();
        button.addEventListener('click', buttonClick);

        try {
            const click = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 24, clientY: 24 });
            word.dispatchEvent(click);

            expect(click.defaultPrevented).toBe(false);
            expect(buttonClick).toHaveBeenCalledTimes(1);
            expect(showWord).not.toHaveBeenCalled();
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('lets native JPDB data-audio links receive clicks beside passive parsed text', () => {
        vi.stubGlobal('location', {
            href: 'https://jpdb.io/review?c=v%2C1%2C2&r=1#a',
            origin: 'https://jpdb.io',
            hostname: 'jpdb.io',
            pathname: '/review',
        });
        document.body.innerHTML = `
            <div class="example">
                <a class="icon-link example-audio" href="#" data-audio="m1/example-audio"><i class="ti ti-volume"></i></a>
                <span class="sentence"><span class="jpdb-reader-word jpdb-reader-passive-word" data-jpdb-reader-passive="true">一</span></span>
            </div>
        `;
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        const icon = document.querySelector<HTMLElement>('.example-audio i')!;
        const link = document.querySelector<HTMLAnchorElement>('.example-audio')!;
        const nativeClick = vi.fn((event: MouseEvent) => event.preventDefault());
        const showWord = vi.fn().mockResolvedValue(undefined);
        const controller = new AbortController();
        internals.showWord = showWord;
        document.addEventListener('click', event => internals.handleDocumentClick(event), { capture: true, signal: controller.signal });
        link.addEventListener('click', nativeClick);

        try {
            icon.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                clientX: 24,
                clientY: 24,
            }));

            expect(nativeClick).toHaveBeenCalledTimes(1);
            expect(showWord).not.toHaveBeenCalled();
        } finally {
            controller.abort();
            cleanupReaderApp(app);
            vi.unstubAllGlobals();
        }
    });

    it('uses browser hit testing before transcript geometry scans on hover', () => {
        const app = new ReaderApp();
        const { row, surface, word } = subtitleRowHitStackFixture();
        const hoverLookup = setupHoverLookupSpies(app);
        const readerWordFromRenderedGeometry = vi.fn(() => {
            throw new Error('geometry fallback should not run');
        });
        const restoreElementsFromPoint = stubElementsFromPoint([surface, row]);

        hoverLookup.internals.readerWordFromRenderedGeometry = readerWordFromRenderedGeometry;

        try {
            hoverLookup.internals.handleHoverPointer(hoverPointerEvent(row));

            expect(hoverLookup.scheduleHoverLookup).toHaveBeenCalledWith(word, expect.any(Event));
            expect(readerWordFromRenderedGeometry).not.toHaveBeenCalled();
            expect(hoverLookup.handlePointerTextHover).not.toHaveBeenCalled();
        } finally {
            restoreElementsFromPoint();
            cleanupReaderApp(app);
        }
    });

    it('ignores page hover lookup while text selection is active', () => {
        const app = new ReaderApp();
        const word = readerWordFixture('今日は読む', '読む');
        const hoverLookup = setupHoverLookupSpies(app);
        const range = document.createRange();
        range.selectNodeContents(word);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);

        try {
            hoverLookup.internals.handleHoverPointer(hoverPointerEvent(word));

            expectNoHoverLookup(hoverLookup);
        } finally {
            selection.removeAllRanges();
            cleanupReaderApp(app);
        }
    });

    it('dismisses an active hover popover when page selection takes ownership', () => {
        const app = new ReaderApp();
        const word = readerWordFixture('今日は読む', '読む');
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        document.body.append(popover);
        const hoverLookup = setupHoverLookupSpies(app, { activePopover: popover, activePopoverMode: 'hover' });
        const dismiss = vi.fn();
        const range = document.createRange();
        range.selectNodeContents(word);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        hoverLookup.internals.dismiss = dismiss;

        try {
            hoverLookup.internals.handleHoverPointer(hoverPointerEvent(word));

            expectNoHoverLookup(hoverLookup);
            expect(dismiss).toHaveBeenCalledWith({ suppressHoverTarget: false });
        } finally {
            selection.removeAllRanges();
            cleanupReaderApp(app);
        }
    });

    it('treats a clicked single-word OCR line frame as the parsed OCR word', () => {
        const app = new ReaderApp();
        const { line, word } = appendSingleWordOcrLine();
        word.getBoundingClientRect = () => ({ left: 30, top: 20, right: 50, bottom: 30, width: 20, height: 10 } as DOMRect);
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

    it('keeps the hover popover open when the pointer moves onto a button feedback overlay within the same control', () => {
        const app = new ReaderApp();
        const { overlay, word } = passiveButtonWordFixture();
        const internals = app as unknown as HoverLookupInternals;
        const scheduleHoverClose = vi.fn();

        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnHover: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.activeHoverWord = word;
        internals.activePopoverMode = 'hover';
        internals.scheduleHoverClose = scheduleHoverClose;

        try {
            // The button's own ripple/feedback overlay churns pointerout/over on
            // hover; moving onto it is not a real exit, so the popover must not
            // close (else it thrashes open/closed).
            internals.handleHoverPointerOut(hoverPointerEvent(word, 'mouse', 'pointerout', {}, overlay));
            expect(scheduleHoverClose).not.toHaveBeenCalled();

            // Genuinely leaving the control still closes the popover.
            internals.handleHoverPointerOut(hoverPointerEvent(word, 'mouse', 'pointerout', {}, document.body));
            expect(scheduleHoverClose).toHaveBeenCalled();
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('allows Apple Pencil hover lookup without treating pen contact as tap lookup', () => {
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
            expect(hoverLookup.handlePointerTextHover).not.toHaveBeenCalled();

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

    it('paints rendered hover cards without waiting for alternate candidate enrichment', async () => {
        const app = new ReaderApp();
        const word = readerWordFixture('今日は読む', '読む');
        const internals = app as unknown as HoverLookupInternals;
        const showCard = vi.fn().mockResolvedValue(undefined);
        const showAlternativeRenderedWordCandidate = vi.fn().mockResolvedValue(true);
        const context = {
            trigger: 'hover' as const,
            navigation: 'reset' as const,
            anchor: word,
            sentence: '今日は読む',
            hoverLookupKey: 'word:1',
            insideReaderPopup: false,
        };

        internals.cardForRenderedWord = vi.fn(() => HOVER_LOOKUP_CARD);
        internals.rememberRenderedWordMiningContext = vi.fn();
        internals.renderedWordDisplayContext = vi.fn(() => context);
        internals.refreshActiveRenderedWordHover = vi.fn(() => false);
        internals.isStaleRenderedWordHover = vi.fn(() => false);
        internals.preloadHoverWordAudio = vi.fn();
        internals.showAlternativeRenderedWordCandidate = showAlternativeRenderedWordCandidate;
        internals.showCard = showCard;

        try {
            await internals.showWord(word, { trigger: 'hover', hoverLookupGeneration: 42 });

            expect(showAlternativeRenderedWordCandidate).not.toHaveBeenCalled();
            expect(showCard).toHaveBeenCalledWith(
                HOVER_LOOKUP_CARD,
                '今日は読む',
                word,
                expect.objectContaining({
                    trigger: 'hover',
                    hoverLookupGeneration: 42,
                    hoverLookupKey: 'word:1',
                    skipInitialCardResolution: true,
                }),
            );
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('paints rendered click cards without waiting for alternate candidate enrichment after a fast touch tap', async () => {
        const app = new ReaderApp();
        const word = readerWordFixture('今日は読む', '読む');
        const internals = app as unknown as HoverLookupInternals;
        const showCard = vi.fn().mockResolvedValue(undefined);
        const showAlternativeRenderedWordCandidate = vi.fn().mockResolvedValue(true);
        const context = {
            trigger: 'modal' as const,
            navigation: 'reset' as const,
            anchor: word,
            sentence: '今日は読む',
            insideReaderPopup: false,
        };

        internals.cardForRenderedWord = vi.fn(() => HOVER_LOOKUP_CARD);
        internals.rememberRenderedWordMiningContext = vi.fn();
        internals.renderedWordDisplayContext = vi.fn(() => context);
        internals.refreshActiveRenderedWordHover = vi.fn(() => false);
        internals.isStaleRenderedWordHover = vi.fn(() => false);
        internals.preloadHoverWordAudio = vi.fn();
        internals.showAlternativeRenderedWordCandidate = showAlternativeRenderedWordCandidate;
        internals.showCard = showCard;

        try {
            await internals.showWord(word, { trigger: 'click', userGesture: true, fastInitialRender: true });

            expect(showAlternativeRenderedWordCandidate).not.toHaveBeenCalled();
            expect(showCard).toHaveBeenCalledWith(
                HOVER_LOOKUP_CARD,
                '今日は読む',
                word,
                expect.objectContaining({
                    trigger: 'modal',
                    skipInitialCardResolution: true,
                    userGesture: true,
                }),
            );
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('caches scanned token cards so rendered-word hover can stay on the fast path', () => {
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        const cacheCards = vi.fn();
        const token: JPDBToken = {
            card: HOVER_LOOKUP_CARD,
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: '',
            sentence: '読む',
        };
        const originalParser = internals.parser;
        internals.parser = { cacheCards };
        internals.preloadTermAudioForTokens = vi.fn();

        try {
            internals.preloadParsedTokens([token]);

            expect(cacheCards).toHaveBeenCalledWith([HOVER_LOOKUP_CARD]);
            expect(internals.preloadTermAudioForTokens).toHaveBeenCalledWith([token]);
        } finally {
            internals.parser = originalParser;
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

    describe('reactive node replacement re-anchor', () => {
        function setupHoverWordContext(word: HTMLElement): { app: ReaderApp; internals: HoverLookupInternals } {
            const app = new ReaderApp();
            const internals = app as unknown as HoverLookupInternals;
            const popover = appendActivePopoverBody().popover;
            internals.settings = { ...DEFAULT_SETTINGS, lookupOnHover: true };
            internals.activePopover = popover;
            internals.activePopoverMode = 'hover';
            internals.activeHoverWord = word;
            internals.activePopoverAnchor = word;
            internals.lastPointerPosition = { x: 40, y: 24 };
            return { app, internals };
        }

        function replacementWord(vid: string, sid: string): HTMLElement {
            const replacement = readerWordFixture('今日は読む', '読む');
            replacement.dataset.vid = vid;
            replacement.dataset.sid = sid;
            return replacement;
        }

        it('re-anchors when the hovered word node is replaced with the same vid:sid', () => {
            const word = readerWordFixture('今日は読む', '読む');
            const { app, internals } = setupHoverWordContext(word);
            const replacement = replacementWord('1', '2');
            word.remove(); // YouTube reconcile detaches the original node under a stationary cursor
            const restoreStack = stubElementsFromPoint([replacement]);
            const restorePoint = stubElementFromPoint(replacement);

            try {
                expect(word.isConnected).toBe(false);
                expect(internals.isHoverContextActive({ ignorePointerPosition: true })).toBe(true);
                expect(internals.activeHoverWord).toBe(replacement);
                expect(internals.activePopoverAnchor).toBe(replacement);
            } finally {
                restorePoint();
                restoreStack();
                cleanupReaderApp(app);
            }
        });

        it('keeps an in-flight hover result current when the hovered word is rerendered', () => {
            const word = readerWordFixture('今日は読む', '読む');
            const { app, internals } = setupHoverWordContext(word);
            const replacement = replacementWord('1', '2');
            word.remove();
            const restoreStack = stubElementsFromPoint([replacement]);
            const restorePoint = stubElementFromPoint(replacement);

            try {
                expect(word.isConnected).toBe(false);
                expect(internals.isCurrentRenderedWordHover(word, 'word:1:2:今日は読む')).toBe(true);
                expect(internals.activeHoverWord).toBe(replacement);
                expect(internals.activePopoverAnchor).toBe(replacement);
            } finally {
                restorePoint();
                restoreStack();
                cleanupReaderApp(app);
            }
        });

        it('closes when the replacement node has a different vid:sid', () => {
            const word = readerWordFixture('今日は読む', '読む');
            const { app, internals } = setupHoverWordContext(word);
            const replacement = replacementWord('9', '9');
            word.remove();
            const restoreStack = stubElementsFromPoint([replacement]);
            const restorePoint = stubElementFromPoint(replacement);

            try {
                expect(internals.isHoverContextActive({ ignorePointerPosition: true })).toBe(false);
                expect(internals.activeHoverWord).toBe(word);
            } finally {
                restorePoint();
                restoreStack();
                cleanupReaderApp(app);
            }
        });

        it('closes when no rendered word sits under the pointer after replacement', () => {
            const word = readerWordFixture('今日は読む', '読む');
            const { app, internals } = setupHoverWordContext(word);
            word.remove();
            const plain = document.createElement('div');
            document.body.append(plain);
            const restoreStack = stubElementsFromPoint([plain]);
            const restorePoint = stubElementFromPoint(plain);

            try {
                expect(internals.isHoverContextActive({ ignorePointerPosition: true })).toBe(false);
            } finally {
                restorePoint();
                restoreStack();
                cleanupReaderApp(app);
            }
        });

        it('keeps the connected-node path unchanged (still hovering true, moved-away false)', () => {
            // The connected path resolves the live word via geometry (jsdom has no layout, so
            // `:hover` is always false and ignorePointerPosition short-circuits — that pre-existing
            // behavior must be preserved). Exercise it without ignorePointerPosition so the
            // geometry resolver runs, proving the connected branch is unchanged.
            const word = readerWordFixture('今日は読む', '読む');
            const { app, internals } = setupHoverWordContext(word);
            const restoreStack = stubElementsFromPoint([word]);
            const restorePoint = stubElementFromPoint(word);

            try {
                expect(word.isConnected).toBe(true);
                expect(internals.isHoverContextActive({})).toBe(true);
                expect(internals.activeHoverWord).toBe(word);
            } finally {
                restorePoint();
                restoreStack();
            }

            // Pointer moved away: nothing under the point, connected node not hovered.
            const elsewhere = document.createElement('div');
            document.body.append(elsewhere);
            const restoreStackAway = stubElementsFromPoint([elsewhere]);
            const restorePointAway = stubElementFromPoint(elsewhere);

            try {
                expect(internals.isHoverContextActive({})).toBe(false);
                expect(internals.activeHoverWord).toBe(word);
            } finally {
                restorePointAway();
                restoreStackAway();
                cleanupReaderApp(app);
            }
        });
    });

    describe('reactive mirror text-lookup re-anchor', () => {
        function setupPointerTextContext(anchor: HTMLElement): { app: ReaderApp; internals: HoverLookupInternals } {
            const app = new ReaderApp();
            const internals = app as unknown as HoverLookupInternals;
            const popover = appendActivePopoverBody().popover;
            internals.settings = { ...DEFAULT_SETTINGS, lookupOnHover: true };
            internals.activePopover = popover;
            internals.activePopoverMode = 'hover';
            internals.activePopoverAnchor = anchor;
            internals.activePointerTextLookup = { text: '今日は読む', start: 3, end: 5, anchor };
            internals.lastPointerPosition = { x: 40, y: 24 };
            return { app, internals };
        }

        function mirrorAnchor(): HTMLElement {
            const anchor = document.createElement('span');
            anchor.className = 'jpdb-reader-text-mirror';
            anchor.textContent = '今日は読む';
            document.body.append(anchor);
            return anchor;
        }

        it('re-anchors the pointer-text lookup when the mirror anchor is rebuilt', () => {
            const oldAnchor = mirrorAnchor();
            const { app, internals } = setupPointerTextContext(oldAnchor);
            const freshAnchor = mirrorAnchor();
            oldAnchor.remove(); // mirror rebuild: identity gone, same surface text under the cursor
            internals.lookupCandidateFromPoint = vi.fn(() => ({ text: '今日は読む', offset: 4, start: 3, end: 5, anchor: freshAnchor }));
            const restorePoint = stubElementFromPoint(freshAnchor);

            try {
                expect(oldAnchor.isConnected).toBe(false);
                expect(internals.isHoverContextActive({ ignorePointerPosition: true })).toBe(true);
                expect(internals.activePointerTextLookup?.anchor).toBe(freshAnchor);
                expect(internals.activePopoverAnchor).toBe(freshAnchor);
            } finally {
                restorePoint();
                cleanupReaderApp(app);
            }
        });

        it('closes when the rebuilt mirror exposes different surface text', () => {
            const oldAnchor = mirrorAnchor();
            const { app, internals } = setupPointerTextContext(oldAnchor);
            const freshAnchor = mirrorAnchor();
            freshAnchor.textContent = '別の文';
            oldAnchor.remove();
            internals.lookupCandidateFromPoint = vi.fn(() => ({ text: '別の文', offset: 1, start: 0, end: 3, anchor: freshAnchor }));
            const restorePoint = stubElementFromPoint(freshAnchor);

            try {
                expect(internals.isHoverContextActive({ ignorePointerPosition: true })).toBe(false);
                expect(internals.activePointerTextLookup?.anchor).toBe(oldAnchor);
            } finally {
                restorePoint();
                cleanupReaderApp(app);
            }
        });
    });
});
