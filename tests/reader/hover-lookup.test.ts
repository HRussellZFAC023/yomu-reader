import { describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import { HOVER_POPOVER_TRANSIT_SETTLE_DELAY_MS } from '../../src/reader/popup/hover-transit';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { noteScannedShadowRoot } from '../../src/reader/dom/shadow-scan-registry';
import { resetCssColorProbeForTests } from '../../src/reader/theme/color-rgba';
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
    ocr: {
        pinLineForElement(element: Element | null): void;
        unpinLineForElement(element: Element | null): void;
        retainLineForLookup(element: Element | null): (() => void) | undefined;
        destroy(): void;
    };
    lastPointerPosition?: { x: number; y: number };
    hoverPopoverPointerPosition?: { x: number; y: number };
    parser: {
        cacheCards(cards: JPDBCard[]): void;
        lookupTokenAt?(
            text: string,
            offset: number,
            range: { start: number; end: number },
            options?: unknown,
        ): Promise<JPDBToken | undefined>;
    };
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
    pressLookupRequest(event: PointerEvent): { isMiddleScan: boolean } | null;
    handleHoverPointer(event: PointerEvent): void;
    queueHoverPointerMove(event: PointerEvent): void;
    handleHoverPointerOut(event: PointerEvent): void;
    handleDocumentClick(event: MouseEvent): void;
    pauseForSubtitleSurfaceTap(event: MouseEvent): boolean;
    scheduleHoverLookup(word: HTMLElement, event: PointerEvent, options?: { minimumDelayMs?: number }): void;
    schedulePointerTextLookup(candidate: { text: string; offset: number; start: number; end: number; anchor: HTMLElement }, event: PointerEvent, options?: { minimumDelayMs?: number }): void;
    showPointerTextCard(
        card: JPDBCard,
        sentence: string,
        candidate: { text: string; offset: number; start: number; end: number; anchor: HTMLElement },
        range: { start: number; end: number },
        trigger: 'modal' | 'hover',
        options: Record<string, unknown>,
    ): Promise<void>;
    showLookupCandidate(
        candidate: { text: string; offset: number; start: number; end: number; anchor: HTMLElement },
        trigger: 'modal' | 'hover',
        options?: Record<string, unknown>,
    ): Promise<void>;
    scheduleHoverClose(delay?: number, options?: { ignoreCssHover?: boolean }): void;
    dismissModalPopoverForOutsidePointer(event: PointerEvent): void;
    pinHoverPopoverForInsidePointer(event: PointerEvent): void;
    handlePointerTextHover(event: PointerEvent): void;
    lookupCandidateFromPoint(x: number, y: number, eventTarget: EventTarget | null, options?: unknown): { text: string; offset: number; start: number; end: number; anchor: HTMLElement } | null;
    readerWordFromRenderedGeometry(target: Element | null, x: number, y: number): HTMLElement | null;
    isCurrentRenderedWordHover(word: HTMLElement, hoverLookupKey: string, hoverLookupGeneration?: number): boolean;
    isCurrentPointerTextHoverCandidate(candidate: { text: string; offset: number; start: number; end: number; anchor: HTMLElement }): boolean;
    liveReaderWordAtPointer(x: number, y: number): HTMLElement | null;
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
    audio: { primeUserGesture(): boolean; primeUserGestureIfUnprimed(): boolean };
    audioActions: { playTermAudio(card: JPDBCard, options?: Record<string, unknown>): Promise<void> | void };
    shouldAutoPlay(card: JPDBCard, trigger: 'modal' | 'hover', userGesture?: boolean, anchor?: HTMLElement, hoverLookupGeneration?: number): boolean;
    resolveLookupCard(card: JPDBCard): Promise<JPDBCard>;
    refreshSkippedInitialCardResolution(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        anchor: HTMLElement | undefined,
        options: Record<string, unknown>,
        requestId: number,
        isCurrentHoverCard: () => boolean,
    ): Promise<void>;
    applyPublicVocabularyToRenderedWords(fallback: JPDBCard, card: JPDBCard, pitchClass?: string): ParentNode[];
    queueResolvedWordEffects(tokens: JPDBToken[], roots: ParentNode[]): void;
    clearRenderedAnkiWordStates(root?: ParentNode): void;
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
    pinActiveHoverPopoverForPendingModalLookup(): void;
    pinOcrLineForModalLookup(anchor: Element): void;
    releaseOrphanedModalOcrPin(): void;
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
const NHK_ISSUE_48_SENTENCE = '「NHKやさしいことばニュース」は、日本に住んでいる外国人の皆さんや、子どもたちに、できるだけやさしい日本語でニュースを伝えるサイトです。';

function hoverPointerEvent(
    target: HTMLElement,
    pointerType = 'mouse',
    type = 'pointerover',
    modifiers: Partial<Pick<PointerEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'buttons'>> = {},
    relatedTarget: Node | null = null,
    point: { x: number; y: number } = { x: 40, y: 24 },
): PointerEvent {
    const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
    Object.defineProperties(event, {
        target: { value: target },
        relatedTarget: { value: relatedTarget },
        clientX: { value: point.x },
        clientY: { value: point.y },
        button: { value: 0 },
        buttons: { value: modifiers.buttons ?? 0 },
        pointerType: { value: pointerType },
        altKey: { value: modifiers.altKey ?? false },
        ctrlKey: { value: modifiers.ctrlKey ?? false },
        metaKey: { value: modifiers.metaKey ?? false },
        shiftKey: { value: modifiers.shiftKey ?? false },
    });
    return event;
}

function linkTitleMirrorFixture(): string {
    return `
        <a class="video-title" href="/watch?v=abc123">
            <span class="title-host">
                <span class="jpdb-reader-text-mirror" data-jpdb-reader-text-mirror="true" data-source-text="【初見】">
                    【<span class="jpdb-reader-word jpdb-reader-scan-word jpdb-reader-passive-word" data-vid="1798820" data-sid="0" data-card-source="jiten" data-card-id="1798820" data-reading-index="0" data-token-start="1" data-token-end="3" data-sentence="【初見】" data-expression="初見" data-jpdb-reader-passive="true">初見</span>】
                </span>
            </span>
        </a>
    `;
}

function cleanupReaderApp(app: ReaderApp): void {
    app.destroy();
    document.body.replaceChildren();
}

function installOcrLookupLifecycleFixture(internals: HoverLookupInternals) {
    const leases = new Map<HTMLElement, Set<symbol>>();
    const lineFor = (element: Element | null): HTMLElement | null => element?.closest<HTMLElement>('.jpdb-ocr-line') ?? null;
    const syncLine = (line: HTMLElement): void => {
        line.classList.toggle('jpdb-ocr-line-active', line.dataset.pinned === 'true' || Boolean(leases.get(line)?.size));
    };
    const pinLineForElement = vi.fn((element: Element | null) => {
        const line = lineFor(element);
        if (!line) return;
        line.dataset.pinned = 'true';
        line.setAttribute('aria-pressed', 'true');
        syncLine(line);
    });
    const unpinLineForElement = vi.fn((element: Element | null) => {
        const line = lineFor(element);
        if (!line || line.dataset.pinned !== 'true') return;
        line.dataset.pinned = 'false';
        line.setAttribute('aria-pressed', 'false');
        syncLine(line);
    });
    const retainLineForLookup = vi.fn((element: Element | null): (() => void) | undefined => {
        const line = lineFor(element);
        if (!line) return undefined;
        const token = Symbol('test-ocr-lookup-line');
        const lineLeases = leases.get(line) ?? new Set<symbol>();
        lineLeases.add(token);
        leases.set(line, lineLeases);
        syncLine(line);
        let released = false;
        return () => {
            if (released) return;
            released = true;
            lineLeases.delete(token);
            if (lineLeases.size === 0) leases.delete(line);
            syncLine(line);
        };
    });
    internals.ocr = {
        pinLineForElement,
        unpinLineForElement,
        retainLineForLookup,
        destroy: vi.fn(),
    };
    return {
        leaseCount: (line: HTMLElement) => leases.get(line)?.size ?? 0,
        unpinLineForElement,
    };
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

function linkWrappedWordFixture(): { link: HTMLAnchorElement; label: HTMLElement; word: HTMLElement } {
    const link = document.createElement('a');
    link.href = '#next';
    link.innerHTML = `
        <span class="jpdb-reader-word" data-vid="1" data-sid="2" data-sentence="よむをセットアップ">よむ</span>
        <span class="label">をセットアップ</span>
    `;
    document.body.append(link);
    return {
        link,
        label: link.querySelector<HTMLElement>('.label')!,
        word: link.querySelector<HTMLElement>('.jpdb-reader-word')!,
    };
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

function stubCaretPositionFromPoint(node: Text, offset: number): () => void {
    const documentWithCaret = document as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    const original = documentWithCaret.caretPositionFromPoint;
    Object.defineProperty(document, 'caretPositionFromPoint', {
        configurable: true,
        value: vi.fn(() => ({ offsetNode: node, offset })),
    });
    return () => {
        if (original) {
            Object.defineProperty(document, 'caretPositionFromPoint', { configurable: true, value: original });
        } else {
            Reflect.deleteProperty(document, 'caretPositionFromPoint');
        }
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
    it('does not schedule hover work while the pointer is dragging', () => {
        const app = new ReaderApp();
        const hoverLookup = setupHoverLookupSpies(app);
        const word = readerWordFixture('読む');
        const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
        try {
            hoverLookup.internals.queueHoverPointerMove(
                hoverPointerEvent(word, 'mouse', 'pointermove', { buttons: 1 }),
            );

            expect(rafSpy).not.toHaveBeenCalled();
            expectNoHoverLookup(hoverLookup);
        } finally {
            rafSpy.mockRestore();
            cleanupReaderApp(app);
        }
    });

    it('invalidates an in-flight OCR word before a same-line pointer move is coalesced', () => {
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        const line = document.createElement('div');
        line.className = 'jpdb-ocr-line';
        line.dataset.ocrText = 'でも先生';
        line.innerHTML = `
            <span class="jpdb-reader-word" data-vid="1" data-sid="2" data-sentence="でも先生">でも</span>
            <span class="jpdb-reader-word" data-vid="3" data-sid="4" data-sentence="でも先生">先生</span>
        `;
        document.body.append(line);
        const [staleWord, currentWord] = Array.from(line.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        staleWord!.getBoundingClientRect = () => new DOMRect(20, 16, 48, 20);
        currentWord!.getBoundingClientRect = () => new DOMRect(120, 16, 48, 20);
        internals.settings = { ...DEFAULT_SETTINGS, lookupOnHover: true };
        internals.hoverLookupGeneration = 7;
        internals.lastPointerPosition = { x: 40, y: 24 };

        const originalElementFromPoint = document.elementFromPoint;
        const originalElementsFromPoint = document.elementsFromPoint;
        Object.defineProperties(document, {
            elementFromPoint: {
                configurable: true,
                value: vi.fn(() => line),
            },
            elementsFromPoint: {
                configurable: true,
                value: vi.fn(() => [line]),
            },
        });
        const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(91);

        try {
            expect(internals.isCurrentRenderedWordHover(staleWord!, 'word:1:2:でも先生', 7)).toBe(true);

            internals.queueHoverPointerMove(hoverPointerEvent(
                line,
                'mouse',
                'pointermove',
                {},
                null,
                { x: 140, y: 24 },
            ));

            expect(rafSpy).toHaveBeenCalledTimes(1);
            expect(internals.lastPointerPosition).toEqual({ x: 140, y: 24 });
            expect(internals.isCurrentRenderedWordHover(staleWord!, 'word:1:2:でも先生', 7)).toBe(false);
        } finally {
            cleanupReaderApp(app);
            rafSpy.mockRestore();
            Object.defineProperties(document, {
                elementFromPoint: { configurable: true, value: originalElementFromPoint },
                elementsFromPoint: { configurable: true, value: originalElementsFromPoint },
            });
        }
    });

    it('prefers the current portal target over an overlapping stale OCR word', () => {
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        const staleWord = readerWordFixture('でも');
        staleWord.dataset.tokenStart = '0';
        staleWord.dataset.tokenEnd = '2';
        const currentWord = readerWordFixture('先生');
        currentWord.dataset.vid = '3';
        currentWord.dataset.sid = '4';
        currentWord.dataset.tokenStart = '0';
        currentWord.dataset.tokenEnd = '2';
        const source = document.createElement('yt-attributed-string');
        document.body.append(source);
        internals.settings = { ...DEFAULT_SETTINGS, lookupOnHover: true };
        internals.lastPointerPosition = { x: 32, y: 150 };
        internals.liveReaderWordAtPointer = vi.fn(() => staleWord);
        internals.readerWordFromRenderedGeometry = vi.fn(target => target === source ? currentWord : null);
        const restorePoint = stubElementFromPoint(source);

        try {
            expect(internals.isCurrentPointerTextHoverCandidate({
                text: 'でも',
                offset: 1,
                start: 0,
                end: 2,
                anchor: staleWord,
            })).toBe(false);
            expect(internals.readerWordFromRenderedGeometry).toHaveBeenCalledWith(
                source,
                32,
                150,
                expect.any(Function),
            );
        } finally {
            restorePoint();
            cleanupReaderApp(app);
        }
    });

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

    it('keeps the OCR lookup lease through hover promotion with no replacement mount', () => {
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        const ocr = installOcrLookupLifecycleFixture(internals);
        const { line, word } = appendSingleWordOcrLine();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover jpdb-reader-sheet';

        try {
            internals.mountPopover(popover, word, { mode: 'hover', focusOnMount: false });
            expect(ocr.leaseCount(line)).toBe(1);
            expect(line.classList.contains('jpdb-ocr-line-active')).toBe(true);

            // A slow or rejected modal lookup leaves the promoted sheet in place
            // without mounting a replacement. Promotion itself must not drop the lease.
            internals.pinActiveHoverPopoverForPendingModalLookup();
            expect(internals.activePopoverMode).toBe('modal');
            expect(ocr.leaseCount(line)).toBe(1);
            expect(line.classList.contains('jpdb-ocr-line-active')).toBe(true);

            internals.dismiss({ suppressHoverTarget: false });
            expect(ocr.leaseCount(line)).toBe(0);
            expect(line.classList.contains('jpdb-ocr-line-active')).toBe(false);
            expect(ocr.unpinLineForElement).not.toHaveBeenCalled();
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('retains the original OCR line across nested text remounts until another OCR anchor takes ownership', () => {
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        const ocr = installOcrLookupLifecycleFixture(internals);
        const first = appendSingleWordOcrLine();
        const second = appendSingleWordOcrLine();
        const hover = document.createElement('div');
        hover.className = 'jpdb-reader-popover jpdb-reader-sheet';
        hover.innerHTML = '<span class="jpdb-reader-parseable">青空です。</span>';
        const nestedAnchor = hover.querySelector<HTMLElement>('.jpdb-reader-parseable')!;
        const nested = document.createElement('div');
        nested.className = 'jpdb-reader-popover jpdb-reader-sheet';
        const ordinaryWord = document.createElement('span');
        ordinaryWord.className = 'jpdb-reader-word';
        ordinaryWord.dataset.vid = '3';
        ordinaryWord.dataset.sid = '4';
        ordinaryWord.dataset.sentence = '普通の本文';
        ordinaryWord.textContent = '本文';
        document.body.append(ordinaryWord);
        const ordinary = document.createElement('div');
        ordinary.className = 'jpdb-reader-popover jpdb-reader-sheet';
        const replacement = document.createElement('div');
        replacement.className = 'jpdb-reader-popover jpdb-reader-sheet';

        try {
            internals.mountPopover(hover, first.word, { mode: 'hover', focusOnMount: false });
            expect(ocr.leaseCount(first.line)).toBe(1);

            internals.pinActiveHoverPopoverForPendingModalLookup();
            internals.mountPopover(nested, nestedAnchor, { mode: 'modal', focusOnMount: false });
            expect(nestedAnchor.isConnected).toBe(false);
            expect(ocr.leaseCount(first.line)).toBe(1);
            expect(ocr.leaseCount(second.line)).toBe(0);

            internals.mountPopover(ordinary, ordinaryWord, { mode: 'modal', focusOnMount: false });
            expect(ocr.leaseCount(first.line)).toBe(0);

            internals.mountPopover(replacement, second.word, { mode: 'modal', focusOnMount: false });
            expect(ocr.leaseCount(second.line)).toBe(1);

            internals.dismiss();
            expect(ocr.leaseCount(second.line)).toBe(0);
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('preserves a pre-existing manual OCR pin through hover remount and dismissal', () => {
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        const ocr = installOcrLookupLifecycleFixture(internals);
        const { line, word } = appendSingleWordOcrLine();
        internals.ocr.pinLineForElement(word);
        const hover = document.createElement('div');
        hover.className = 'jpdb-reader-popover jpdb-reader-sheet';
        hover.innerHTML = '<span class="jpdb-reader-parseable">青空です。</span>';
        const nestedAnchor = hover.querySelector<HTMLElement>('.jpdb-reader-parseable')!;
        const nested = document.createElement('div');
        nested.className = 'jpdb-reader-popover jpdb-reader-sheet';

        try {
            internals.mountPopover(hover, word, { mode: 'hover', focusOnMount: false });
            internals.pinActiveHoverPopoverForPendingModalLookup();
            internals.pinOcrLineForModalLookup(word);
            internals.mountPopover(nested, nestedAnchor, { mode: 'modal', focusOnMount: false });
            internals.dismiss();

            expect(ocr.leaseCount(line)).toBe(0);
            expect(line.dataset.pinned).toBe('true');
            expect(line.getAttribute('aria-pressed')).toBe('true');
            expect(line.classList.contains('jpdb-ocr-line-active')).toBe(true);
            expect(ocr.unpinLineForElement).not.toHaveBeenCalled();
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('clears only a modal OCR pin that the app created', () => {
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        const ocr = installOcrLookupLifecycleFixture(internals);
        const { line, word } = appendSingleWordOcrLine();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover jpdb-reader-sheet';

        try {
            internals.mountPopover(popover, word, { mode: 'modal', focusOnMount: false });
            internals.pinOcrLineForModalLookup(word);
            expect(line.dataset.pinned).toBe('true');

            internals.dismiss();
            expect(line.dataset.pinned).toBe('false');
            expect(ocr.unpinLineForElement).toHaveBeenCalledTimes(1);
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('releases an app-owned OCR pin when a modal lookup never mounts', () => {
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        const ocr = installOcrLookupLifecycleFixture(internals);
        const { line, word } = appendSingleWordOcrLine();

        try {
            internals.pinOcrLineForModalLookup(word);
            expect(line.dataset.pinned).toBe('true');

            internals.releaseOrphanedModalOcrPin();
            expect(line.dataset.pinned).toBe('false');
            expect(ocr.unpinLineForElement).toHaveBeenCalledTimes(1);
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('keeps a subtitle hover mining pause alive while moving to the next caption word', () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        internals.settings = { ...DEFAULT_SETTINGS, subtitleMiningPause: true, hoverCloseDelayMs: 0 };
        const { pause, play } = appendPlayingVideo();
        const asbRoot = document.createElement('div');
        asbRoot.className = 'asbplayer-subtitles-container-bottom';
        asbRoot.innerHTML = `
            <span class="jpdb-reader-word" data-vid="1" data-sid="2" data-sentence="今日は読む">今日</span>
            <span class="jpdb-reader-word" data-vid="3" data-sid="4" data-sentence="今日は読む">読む</span>
        `;
        document.body.append(asbRoot);
        const words = Array.from(asbRoot.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        const firstWord = words[0]!;
        const nextWord = words[1]!;
        const firstPopover = document.createElement('div');
        firstPopover.className = 'jpdb-reader-popover';
        const nextPopover = document.createElement('div');
        nextPopover.className = 'jpdb-reader-popover';

        try {
            internals.mountPopover(firstPopover, firstWord, { mode: 'hover', focusOnMount: false });
            expect(pause).toHaveBeenCalledTimes(1);

            internals.scheduleHoverClose(0, { ignoreCssHover: true });
            vi.advanceTimersByTime(0);
            expect(play).not.toHaveBeenCalled();

            vi.advanceTimersByTime(480);
            expect(play).not.toHaveBeenCalled();

            const scheduleHoverLookup = vi.fn();
            internals.scheduleHoverLookup = scheduleHoverLookup;
            internals.handleHoverPointer(hoverPointerEvent(nextWord));
            expect(scheduleHoverLookup).toHaveBeenCalledWith(nextWord, expect.any(Event));
            vi.advanceTimersByTime(520);
            expect(play).not.toHaveBeenCalled();

            internals.mountPopover(nextPopover, nextWord, { mode: 'hover', focusOnMount: false });
            vi.advanceTimersByTime(520);
            expect(play).not.toHaveBeenCalled();

            internals.dismiss();
            expect(play).toHaveBeenCalledTimes(1);
        } finally {
            cleanupReaderApp(app);
            vi.useRealTimers();
        }
    });

    it('defers subtitle hover resume when the old caption word detaches under the pointer', () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        internals.settings = { ...DEFAULT_SETTINGS, subtitleMiningPause: true, hoverCloseDelayMs: 0 };
        const { pause, play } = appendPlayingVideo();
        const asbRoot = document.createElement('div');
        asbRoot.className = 'asbplayer-subtitles-container-bottom';
        asbRoot.innerHTML = `
            <span class="jpdb-reader-word" data-vid="1" data-sid="2" data-sentence="今日は読む">今日</span>
            <span class="jpdb-reader-word" data-vid="3" data-sid="4" data-sentence="今日は読む">読む</span>
        `;
        document.body.append(asbRoot);
        const words = Array.from(asbRoot.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        const firstWord = words[0]!;
        const nextWord = words[1]!;
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        const restorePoint = stubElementFromPoint(nextWord);
        const restoreStack = stubElementsFromPoint([nextWord]);

        try {
            internals.mountPopover(popover, firstWord, { mode: 'hover', focusOnMount: false });
            expect(pause).toHaveBeenCalledTimes(1);
            internals.lastPointerPosition = { x: 40, y: 24 };
            firstWord.remove();

            internals.scheduleHoverClose(0, { ignoreCssHover: true });
            vi.advanceTimersByTime(0);
            expect(play).not.toHaveBeenCalled();

            vi.advanceTimersByTime(519);
            expect(play).not.toHaveBeenCalled();

            vi.advanceTimersByTime(1);
            expect(play).toHaveBeenCalledTimes(1);
        } finally {
            restoreStack();
            restorePoint();
            cleanupReaderApp(app);
            vi.useRealTimers();
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

    it('pauses on plain subtitle text while annotations are off and resumes after leaving it', () => {
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        internals.settings = {
            ...DEFAULT_SETTINGS,
            annotationsPaused: true,
            lookupOnHover: false,
            subtitleMiningPause: true,
            subtitleHoverPause: true,
            hoverCloseDelayMs: 0,
        };
        const { pause, play } = appendPlayingVideo();
        const overlay = document.createElement('div');
        overlay.className = 'jpdb-subtitle-player jpdb-subtitle-annotations-paused';
        overlay.innerHTML = `
            <div class="jpdb-subtitle-primary">読む</div>
            <button class="jpdb-subtitle-secondary">読みます</button>
        `;
        document.body.append(overlay);
        const primary = overlay.querySelector<HTMLElement>('.jpdb-subtitle-primary')!;
        const secondary = overlay.querySelector<HTMLElement>('.jpdb-subtitle-secondary')!;

        try {
            internals.handleHoverPointer(hoverPointerEvent(primary));
            expect(pause).toHaveBeenCalledTimes(1);

            internals.handleHoverPointerOut(hoverPointerEvent(primary, 'mouse', 'pointerout', {}, secondary));
            internals.handleHoverPointer(hoverPointerEvent(secondary));
            expect(play).not.toHaveBeenCalled();

            internals.handleHoverPointerOut(hoverPointerEvent(secondary, 'mouse', 'pointerout', {}, document.body));
            expect(play).toHaveBeenCalledTimes(1);
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('does not force-play a user-paused video after plain subtitle hover', () => {
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        internals.settings = {
            ...DEFAULT_SETTINGS,
            annotationsPaused: true,
            lookupOnHover: false,
            subtitleMiningPause: true,
            subtitleHoverPause: true,
            hoverCloseDelayMs: 0,
        };
        const { video, pause, play } = appendPlayingVideo();
        video.pause();
        pause.mockClear();
        const overlay = document.createElement('div');
        overlay.className = 'jpdb-subtitle-player jpdb-subtitle-annotations-paused';
        overlay.innerHTML = '<div class="jpdb-subtitle-primary">読む</div>';
        document.body.append(overlay);
        const primary = overlay.querySelector<HTMLElement>('.jpdb-subtitle-primary')!;

        try {
            internals.handleHoverPointer(hoverPointerEvent(primary));
            internals.handleHoverPointerOut(hoverPointerEvent(primary, 'mouse', 'pointerout', {}, document.body));
            expect(pause).not.toHaveBeenCalled();
            expect(play).not.toHaveBeenCalled();
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('leaves plain annotations-off captions playing when hover pause is disabled', () => {
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        internals.settings = {
            ...DEFAULT_SETTINGS,
            annotationsPaused: true,
            lookupOnHover: false,
            subtitleMiningPause: true,
            subtitleHoverPause: false,
            hoverCloseDelayMs: 0,
        };
        const { pause, play } = appendPlayingVideo();
        const overlay = document.createElement('div');
        overlay.className = 'jpdb-subtitle-player jpdb-subtitle-annotations-paused';
        overlay.innerHTML = '<div class="jpdb-subtitle-primary">読む</div>';
        document.body.append(overlay);
        const primary = overlay.querySelector<HTMLElement>('.jpdb-subtitle-primary')!;

        try {
            internals.handleHoverPointer(hoverPointerEvent(primary));
            internals.handleHoverPointerOut(hoverPointerEvent(primary, 'mouse', 'pointerout', {}, document.body));
            expect(pause).not.toHaveBeenCalled();
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

    it('routes the clicked subtitle glyph through parser-owned pointer geometry', () => {
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        const overlay = document.createElement('div');
        overlay.className = 'jpdb-subtitle-player';
        overlay.innerHTML = '<div class="jpdb-subtitle-text"><span class="jpdb-reader-word" data-vid="1" data-sid="2" data-sentence="今日は読む">読む</span></div>';
        document.body.append(overlay);
        const word = overlay.querySelector<HTMLElement>('.jpdb-reader-word')!;
        word.dataset.tokenStart = '3';
        word.dataset.tokenEnd = '5';
        word.getBoundingClientRect = () => new DOMRect(0, 0, 48, 48);
        const showLookupCandidate = vi.fn().mockResolvedValue(undefined);
        const controller = new AbortController();
        internals.settings = { ...DEFAULT_SETTINGS, subtitleMiningPause: true };
        internals.showLookupCandidate = showLookupCandidate;
        document.addEventListener('click', event => internals.handleDocumentClick(event), { capture: true, signal: controller.signal });

        try {
            word.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                clientX: 24,
                clientY: 24,
            }));

            expect(showLookupCandidate).toHaveBeenCalledWith(
                expect.objectContaining({
                    text: '今日は読む',
                    offset: 4,
                    start: 0,
                    end: 5,
                    anchor: word,
                }),
                'modal',
                expect.objectContaining({ userGesture: true }),
            );
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

    it('starts hover autoplay from the already-painted card instead of waiting for fallback resolution', async () => {
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
            expect(resolveLookupCard).not.toHaveBeenCalled();
            expect(playTermAudio).toHaveBeenCalledWith(
                fallbackCard,
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

    it('refreshes a fast fallback hover popup when the API-backed card resolves', async () => {
        const app = new ReaderApp();
        const word = readerWordFixture('よむ', 'よむ');
        const popover = document.createElement('div');
        document.body.append(popover);
        const internals = app as unknown as HoverLookupInternals;
        const fallbackCard: JPDBCard = {
            ...HOVER_LOOKUP_CARD,
            vid: -10,
            sid: -10,
            rid: 0,
            spelling: 'よむ',
            reading: '',
            cardState: ['not-in-deck'],
            pitchAccent: [],
            source: 'fallback',
        };
        const resolvedCard: JPDBCard = {
            ...HOVER_LOOKUP_CARD,
            vid: 10,
            sid: 1,
            rid: 1,
            spelling: 'よむ',
            reading: 'よむ',
            cardState: ['mastered'],
            pitchAccent: ['HL'],
            source: 'jiten',
            jitenWordId: 10,
            jitenReadingIndex: 1,
        };
        const resolveLookupCard = vi.fn(async () => resolvedCard);
        const applyPublicVocabularyToRenderedWords = vi.fn(() => [word] as ParentNode[]);
        const queueResolvedWordEffects = vi.fn();
        const showCard = vi.fn(async () => undefined);

        internals.activePopover = popover;
        internals.activePopoverMode = 'hover';
        internals.settings = {
            ...DEFAULT_SETTINGS,
            showPitchAccent: true,
        };
        internals.resolveLookupCard = resolveLookupCard;
        internals.applyPublicVocabularyToRenderedWords = applyPublicVocabularyToRenderedWords;
        internals.queueResolvedWordEffects = queueResolvedWordEffects;
        internals.showCard = showCard;

        try {
            await internals.refreshSkippedInitialCardResolution(
                popover,
                fallbackCard,
                'よむ',
                word,
                {
                    trigger: 'hover',
                    hoverLookupKey: 'word:-10:-10:よむ',
                    hoverLookupGeneration: 3,
                    skipInitialCardResolution: true,
                },
                1,
                () => true,
            );

            expect(resolveLookupCard).toHaveBeenCalledWith(fallbackCard, expect.objectContaining({
                target: expect.any(Object),
                isCurrent: expect.any(Function),
            }));
            expect(applyPublicVocabularyToRenderedWords).toHaveBeenCalledWith(fallbackCard, resolvedCard);
            expect(queueResolvedWordEffects).toHaveBeenCalledWith(
                [expect.objectContaining({ card: resolvedCard })],
                [word],
            );
            expect(showCard).toHaveBeenCalledWith(
                resolvedCard,
                'よむ',
                word,
                expect.objectContaining({
                    trigger: 'hover',
                    autoPlay: false,
                    navigation: 'preserve',
                    preservePosition: true,
                    previousNavigationEntry: undefined,
                    skipInitialCardResolution: false,
                }),
            );
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('hydrates fallback furigana and pitch inside registered open shadow roots', () => {
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        const previousBackground = document.body.style.backgroundColor;
        document.body.style.backgroundColor = 'rgb(255, 255, 255)';
        const canvasContext = {
            fillStyle: '#010203',
            clearRect: vi.fn(),
            fillRect: vi.fn(),
            getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) })),
        };
        const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
            .mockReturnValue(canvasContext as never);
        resetCssColorProbeForTests();
        const host = document.createElement('reddit-control');
        document.body.append(host);
        const root = host.attachShadow({ mode: 'open' });
        noteScannedShadowRoot(root);
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-reader-scan-word';
        word.dataset.vid = '-10';
        word.dataset.sid = '-10';
        word.dataset.expression = '参加';
        word.dataset.surface = '参加';
        word.textContent = '参加';
        root.append(word);
        const fallback: JPDBCard = {
            ...HOVER_LOOKUP_CARD,
            vid: -10,
            sid: -10,
            spelling: '参加',
            reading: '',
            source: 'fallback',
            cardState: ['not-in-deck'],
            pitchAccent: [],
        };
        const resolved: JPDBCard = {
            ...HOVER_LOOKUP_CARD,
            vid: 10,
            sid: 1,
            spelling: '参加',
            reading: 'さんか',
            source: 'jiten',
            jitenWordId: 10,
            jitenReadingIndex: 1,
            cardState: ['known'],
            pitchAccent: ['LHH'],
        };
        internals.settings = { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all', showPitchAccent: true };

        try {
            internals.applyPublicVocabularyToRenderedWords(fallback, resolved);

            expect(word.dataset.vid).toBe('10');
            expect(word.dataset.pitchClass).not.toBe('unknown');
            expect(word.querySelector('.jpdb-reader-furi')?.textContent).toBe('さんか');
        } finally {
            getContext.mockRestore();
            resetCssColorProbeForTests();
            document.body.style.backgroundColor = previousBackground;
            cleanupReaderApp(app);
        }
    });

    it('clears rendered Anki status inside registered open shadow roots', () => {
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        const previousBackground = document.body.style.backgroundColor;
        document.body.style.backgroundColor = 'rgb(255, 255, 255)';
        const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
            fillStyle: '#010203',
            clearRect: vi.fn(),
            fillRect: vi.fn(),
            getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) })),
        } as never);
        resetCssColorProbeForTests();
        const host = document.createElement('anki-shadow-host');
        document.body.append(host);
        const root = host.attachShadow({ mode: 'open' });
        noteScannedShadowRoot(root);
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word anki-known';
        word.dataset.vid = '10';
        word.dataset.sid = '1';
        word.dataset.ankiState = 'known';
        root.append(word);

        try {
            internals.clearRenderedAnkiWordStates();

            expect(word.classList.contains('anki-known')).toBe(false);
            expect(word.dataset.ankiState).toBeUndefined();
        } finally {
            getContext.mockRestore();
            resetCssColorProbeForTests();
            document.body.style.backgroundColor = previousBackground;
            cleanupReaderApp(app);
        }
    });

    it('primes gesture audio on pointerdown when autoplay is hover-only', () => {
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        const primeUserGesture = vi.fn(() => true);
        const primeUserGestureIfUnprimed = vi.fn(() => true);
        const word = readerWordFixture('今日は読む', '読む');
        internals.settings = {
            ...DEFAULT_SETTINGS,
            audioEnabled: true,
            autoPlayAudio: true,
            audioAutoPlayMode: 'hover',
            lookupOnHover: true,
        };
        internals.audio = { primeUserGesture, primeUserGestureIfUnprimed };
        internals.bindEvents();

        try {
            word.dispatchEvent(hoverPointerEvent(word, 'mouse', 'pointerdown'));

            expect(primeUserGesture).toHaveBeenCalledTimes(1);
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('primes gesture audio on the first pointerdown anywhere, not just on words', () => {
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        const primeUserGesture = vi.fn(() => true);
        const primeUserGestureIfUnprimed = vi.fn(() => true);
        internals.settings = {
            ...DEFAULT_SETTINGS,
            audioEnabled: true,
            autoPlayAudio: true,
            audioAutoPlayMode: 'hover',
            lookupOnHover: true,
        };
        internals.audio = { primeUserGesture, primeUserGestureIfUnprimed };
        internals.bindEvents();

        try {
            document.body.dispatchEvent(hoverPointerEvent(document.body, 'touch', 'pointerdown'));

            expect(primeUserGestureIfUnprimed).toHaveBeenCalledTimes(1);
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

    it('lets another popup reader own page click and hover when Yomu popup lookup is off', () => {
        const app = new ReaderApp();
        const word = readerWordFixture('今日は読む', '読む');
        const internals = app as unknown as HoverLookupInternals;
        const showWord = vi.fn().mockResolvedValue(undefined);

        internals.settings = {
            ...DEFAULT_SETTINGS,
            popupActivationMode: 'off',
            lookupOnClick: true,
            lookupOnHover: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.showWord = showWord;
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
        } finally {
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

    // The selection used to be preserved here on purpose (matching the backdrop's
    // mousedown preventDefault). On touch that leaves the sentence highlighted with
    // native selection handles and a system callout after the popup is gone, which
    // reads as a half-failed dismissal — reported as "the popup remains and the text
    // stays selected". preventDefault stays (it stops the press starting a fresh
    // native selection on whatever it landed on); the highlight now goes with the popup.
    it('dismisses a modal popover on outside pointerdown and clears the page selection', () => {
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
            expect(window.getSelection()?.toString()).toBe('');
            expect(popover.isConnected).toBe(false);
            expect(internals.activePopover).toBeUndefined();
            expect(internals.activePopoverMode).toBeUndefined();
        } finally {
            window.getSelection()?.removeAllRanges();
            cleanupReaderApp(app);
        }
    });

    it('pins a hover popover sticky when a pointerdown lands inside it', () => {
        const app = new ReaderApp();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        const titleRow = document.createElement('div');
        titleRow.textContent = '辞書';
        popover.append(titleRow);
        document.body.append(popover);
        const internals = app as unknown as HoverLookupInternals;
        internals.activePopover = popover;
        internals.activePopoverMode = 'hover';

        try {
            internals.pinHoverPopoverForInsidePointer(hoverPointerEvent(titleRow, 'pen', 'pointerdown'));

            expect(internals.activePopoverMode).toBe('modal');
            expect(popover.isConnected).toBe(true);
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('leaves a hover popover transient when pointerdown lands outside it', () => {
        const app = new ReaderApp();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        const outside = document.createElement('button');
        outside.textContent = '外';
        document.body.append(popover, outside);
        const internals = app as unknown as HoverLookupInternals;
        internals.activePopover = popover;
        internals.activePopoverMode = 'hover';

        try {
            internals.pinHoverPopoverForInsidePointer(hoverPointerEvent(outside, 'pen', 'pointerdown'));

            expect(internals.activePopoverMode).toBe('hover');
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
        // The subtitle list, not the OCR overlay: this asserts that Yomu's own
        // INTERACTIVE panels hold the popover open while you use them. The OCR
        // overlay used to be the fixture here, which quietly made a manga page's
        // inert paint behave like a control — see the case below.
        //
        // The press must land on an actual CONTROL for that claim to mean anything.
        // It used to land on the panel's bare text, so the test passed on the mere
        // presence of a Yomu surface — the same confusion that made the popup
        // untappable-away over every content overlay.
        const overlay = document.createElement('div');
        overlay.className = 'jpdb-subtitle-list';
        overlay.dataset.jpdbReaderRoot = 'true';
        const control = document.createElement('button');
        control.textContent = 'overlay';
        overlay.append(control);
        document.body.append(popover, overlay);
        const internals = app as unknown as HoverLookupInternals;
        internals.activePopover = popover;
        internals.activePopoverMode = 'modal';

        try {
            internals.dismissModalPopoverForOutsidePointer(hoverPointerEvent(control, 'mouse', 'pointerdown'));

            expect(popover.isConnected).toBe(true);
            expect(internals.activePopover).toBe(popover);
            expect(internals.activePopoverMode).toBe('modal');
        } finally {
            cleanupReaderApp(app);
        }
    });

    // Reported by blurvy on MangaFire: the popup could not be closed by tapping
    // away from it. The OCR overlay's line boxes tile a manga page's speech
    // bubbles and are pointer-events:auto, so a tap on the empty part of a bubble
    // is "outside the popup" to the reader but matched the owned-surface
    // keep-open allowlist. On a phone shouldUseSheet suppresses the backdrop, so
    // that allowlist is the ONLY way to dismiss and the popup became stuck.
    it('dismisses a modal popover when a press lands on inert OCR overlay paint', () => {
        const app = new ReaderApp();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        const overlay = document.createElement('div');
        overlay.className = 'jpdb-ocr-layer';
        overlay.dataset.jpdbReaderRoot = 'true';
        const line = document.createElement('div');
        line.className = 'jpdb-ocr-line';
        overlay.append(line);
        document.body.append(popover, overlay);
        const internals = app as unknown as HoverLookupInternals;
        internals.activePopover = popover;
        internals.activePopoverMode = 'modal';

        try {
            // A press that hit an OCR WORD never reaches here: handleOcrReaderWordPointerDown
            // returns first and opens the new lookup. So a press arriving over the
            // overlay resolved nothing, and is exactly the press that must dismiss.
            internals.dismissModalPopoverForOutsidePointer(hoverPointerEvent(line, 'touch', 'pointerdown'));

            expect(internals.activePopover).toBeFalsy();
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('still keeps the popover for a real control painted inside the OCR overlay', () => {
        const app = new ReaderApp();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        const overlay = document.createElement('div');
        overlay.className = 'jpdb-ocr-layer';
        overlay.dataset.jpdbReaderRoot = 'true';
        const button = document.createElement('button');
        button.type = 'button';
        overlay.append(button);
        document.body.append(popover, overlay);
        const internals = app as unknown as HoverLookupInternals;
        internals.activePopover = popover;
        internals.activePopoverMode = 'modal';

        try {
            internals.dismissModalPopoverForOutsidePointer(hoverPointerEvent(button, 'touch', 'pointerdown'));

            expect(internals.activePopover).toBe(popover);
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

    it('keeps the hover delay running while the pointer moves to another parsed word', async () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const firstWord = readerWordFixture('今日は読む', '今日');
        const secondWord = readerWordFixture('静かな喫茶店', '静か');
        secondWord.dataset.vid = '3';
        secondWord.dataset.sid = '4';
        secondWord.dataset.tokenStart = '0';
        secondWord.dataset.tokenEnd = '2';
        secondWord.getBoundingClientRect = () => new DOMRect(0, 0, 80, 48);
        const internals = app as unknown as HoverLookupInternals;
        const showLookupCandidate = vi.fn().mockResolvedValue(undefined);
        const restorePoint = stubElementFromPoint(secondWord);
        const restoreStack = stubElementsFromPoint([secondWord]);

        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnHover: true,
            hoverOpenDelayMs: 80,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.showLookupCandidate = showLookupCandidate;
        internals.lastPointerPosition = { x: 40, y: 24 };

        try {
            internals.scheduleHoverLookup(firstWord, hoverPointerEvent(firstWord));
            await vi.advanceTimersByTimeAsync(30);
            internals.handleHoverPointerOut(hoverPointerEvent(firstWord, 'mouse', 'pointerout', {}, secondWord));
            internals.scheduleHoverLookup(secondWord, hoverPointerEvent(secondWord, 'mouse', 'pointermove'));
            await vi.advanceTimersByTimeAsync(49);
            expect(showLookupCandidate).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(1);

            expect(showLookupCandidate).toHaveBeenCalledTimes(1);
            expect(showLookupCandidate).toHaveBeenCalledWith(
                expect.objectContaining({
                    text: '静かな喫茶店',
                    offset: 1,
                    start: 0,
                    end: 6,
                    anchor: secondWord,
                }),
                'hover',
                expect.objectContaining({ hoverLookupGeneration: 1 }),
            );
        } finally {
            restorePoint();
            restoreStack();
            vi.useRealTimers();
            cleanupReaderApp(app);
        }
    });

    it.each([
        { staleSurface: 'を', liveSurface: 'です' },
        { staleSurface: 'ば', liveSurface: 'ニュース' },
    ])('re-resolves normal mirrored NHK text at execution so $liveSurface never shows the stale $staleSurface card', async ({ staleSurface, liveSurface }) => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const source = document.createElement('p');
        source.textContent = NHK_ISSUE_48_SENTENCE;
        const staleWord = readerWordFixture(NHK_ISSUE_48_SENTENCE, staleSurface);
        const liveWord = readerWordFixture(NHK_ISSUE_48_SENTENCE, liveSurface);
        liveWord.dataset.vid = '9';
        liveWord.dataset.sid = '9';
        const liveStart = NHK_ISSUE_48_SENTENCE.indexOf(liveSurface);
        liveWord.getBoundingClientRect = () => new DOMRect(0, 0, 220, 48);
        document.body.append(source);
        const internals = app as unknown as HoverLookupInternals;
        const showLookupCandidate = vi.fn().mockResolvedValue(undefined);
        let wordAtPoint = staleWord;
        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnHover: true,
            hoverOpenDelayMs: 80,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.showLookupCandidate = showLookupCandidate;
        internals.readerWordFromRenderedGeometry = vi.fn(() => wordAtPoint);
        const restorePoint = stubElementFromPoint(source);
        const restoreStack = stubElementsFromPoint([source]);

        try {
            internals.handleHoverPointer(hoverPointerEvent(source, 'mouse', 'pointermove', {}, null, { x: 20, y: 24 }));
            await vi.advanceTimersByTimeAsync(30);
            wordAtPoint = liveWord;
            internals.handleHoverPointer(hoverPointerEvent(source, 'mouse', 'pointermove', {}, null, { x: 180, y: 24 }));
            // The scheduled hover owns timing; lexical geometry is recovered from
            // the word that is actually under the pointer when that timer fires.
            liveWord.dataset.tokenStart = String(liveStart);
            liveWord.dataset.tokenEnd = String(liveStart + liveSurface.length);
            await vi.advanceTimersByTimeAsync(50);

            expect(showLookupCandidate).toHaveBeenCalledTimes(1);
            expect(showLookupCandidate).toHaveBeenCalledWith(
                expect.objectContaining({ anchor: liveWord }),
                'hover',
                expect.any(Object),
            );
            expect(showLookupCandidate.mock.calls.some(([candidate]) => candidate.anchor === staleWord)).toBe(false);
        } finally {
            restoreStack();
            restorePoint();
            vi.useRealTimers();
            cleanupReaderApp(app);
        }
    });

    it('passes each exact glyph and the full geometry run for an unstamped OCR token', () => {
        const app = new ReaderApp();
        const layer = document.createElement('div');
        layer.className = 'jpdb-ocr-layer';
        layer.dataset.jpdbReaderRoot = 'true';
        const line = document.createElement('div');
        line.className = 'jpdb-ocr-line jpdb-ocr-line-visible';
        line.dataset.ocrText = 'やさしいことばニュース';
        const lineText = document.createElement('span');
        lineText.className = 'jpdb-ocr-line-text';
        const broadWord = document.createElement('span');
        broadWord.className = 'jpdb-reader-word';
        broadWord.dataset.vid = '1';
        broadWord.dataset.sid = '2';
        broadWord.dataset.sentence = NHK_ISSUE_48_SENTENCE;
        broadWord.dataset.tokenStart = '4';
        broadWord.dataset.tokenEnd = '15';
        broadWord.dataset.expression = 'やさしいことばニュース';
        broadWord.dataset.reading = 'やさしいことばニュース';
        broadWord.dataset.surface = 'やさしいことばニュース';
        broadWord.textContent = 'やさしいことばニュース';
        broadWord.getBoundingClientRect = () => new DOMRect(20, 20, 220, 24);
        lineText.append(broadWord);
        line.append(lineText);
        layer.append(line);
        document.body.append(layer);
        const internals = app as unknown as HoverLookupInternals;
        const scheduleHoverLookup = vi.fn();
        const schedulePointerTextLookup = vi.fn();
        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnHover: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.scheduleHoverLookup = scheduleHoverLookup;
        internals.schedulePointerTextLookup = schedulePointerTextLookup;
        const restorePoint = stubElementFromPoint(broadWord);
        const restoreStack = stubElementsFromPoint([broadWord, line]);
        const broadText = broadWord.firstChild as Text;
        let restoreCaret = (): void => undefined;

        try {
            expect(line.querySelectorAll('.jpdb-reader-word')).toHaveLength(1);
            expect(broadWord.dataset.cardSource).toBeUndefined();
            for (const target of [
                { characterOffset: 1 },
                { characterOffset: 5 },
                { characterOffset: 6 },
                { characterOffset: 9 },
            ]) {
                restoreCaret();
                restoreCaret = stubCaretPositionFromPoint(broadText, target.characterOffset);
                internals.handleHoverPointer(hoverPointerEvent(
                    broadWord,
                    'mouse',
                    'pointermove',
                    {},
                    null,
                    { x: 40 + target.characterOffset * 18, y: 32 },
                ));
                expect(schedulePointerTextLookup).toHaveBeenLastCalledWith(
                    expect.objectContaining({
                        text: NHK_ISSUE_48_SENTENCE,
                        offset: 4 + target.characterOffset,
                        start: 4,
                        end: 15,
                        anchor: broadWord,
                    }),
                    expect.any(Event),
                    expect.any(Object),
                );
            }
            expect(schedulePointerTextLookup).toHaveBeenCalledTimes(4);
            expect(scheduleHoverLookup).not.toHaveBeenCalled();
        } finally {
            restoreCaret();
            restoreStack();
            restorePoint();
            cleanupReaderApp(app);
        }
    });

    it.each([
        { name: 'やさしい', characterOffset: 1 },
        { name: 'ことば middle', characterOffset: 5 },
        { name: 'ことば final ば', characterOffset: 6 },
        { name: 'ニュース', characterOffset: 9 },
    ])('passes the exact subtitle glyph and full rendered run for $name', ({ characterOffset }) => {
        const app = new ReaderApp();
        const subtitleRoot = document.createElement('div');
        subtitleRoot.className = 'jpdb-subtitle-player';
        subtitleRoot.dataset.jpdbReaderRoot = 'true';
        const line = document.createElement('div');
        line.className = 'jpdb-subtitle-primary';
        const broadWord = document.createElement('span');
        broadWord.className = 'jpdb-reader-word';
        broadWord.dataset.vid = '48001';
        broadWord.dataset.sid = '48002';
        broadWord.dataset.sentence = NHK_ISSUE_48_SENTENCE;
        broadWord.dataset.tokenStart = '4';
        broadWord.dataset.tokenEnd = '15';
        broadWord.dataset.cardSource = 'jiten';
        broadWord.dataset.expression = 'やさしい';
        broadWord.dataset.reading = 'やさしい';
        broadWord.textContent = 'やさしいことばニュース';
        broadWord.getBoundingClientRect = () => new DOMRect(20, 20, 220, 32);
        line.append(broadWord);
        subtitleRoot.append(line);
        document.body.append(subtitleRoot);
        const internals = app as unknown as HoverLookupInternals;
        const schedulePointerTextLookup = vi.fn();
        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnHover: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.schedulePointerTextLookup = schedulePointerTextLookup;
        const restorePoint = stubElementFromPoint(broadWord);
        const restoreStack = stubElementsFromPoint([broadWord]);
        const restoreCaret = stubCaretPositionFromPoint(broadWord.firstChild as Text, characterOffset);

        try {
            internals.handleHoverPointer(hoverPointerEvent(
                broadWord,
                'mouse',
                'pointermove',
                {},
                null,
                { x: 40 + characterOffset * 18, y: 32 },
            ));

            expect(schedulePointerTextLookup).toHaveBeenCalledWith(
                expect.objectContaining({
                    text: NHK_ISSUE_48_SENTENCE,
                    offset: 4 + characterOffset,
                    start: 4,
                    end: 15,
                    anchor: broadWord,
                }),
                expect.any(Event),
                expect.any(Object),
            );
        } finally {
            restoreCaret();
            restoreStack();
            restorePoint();
            cleanupReaderApp(app);
        }
    });

    it('passes the exact normal-text point without narrowing the geometry run', () => {
        const app = new ReaderApp();
        const source = document.createElement('p');
        source.textContent = NHK_ISSUE_48_SENTENCE;
        const broadWord = readerWordFixture(NHK_ISSUE_48_SENTENCE, 'やさしいことば');
        broadWord.dataset.tokenStart = '4';
        broadWord.dataset.tokenEnd = '11';
        broadWord.dataset.cardSource = 'jiten';
        broadWord.dataset.expression = 'やさしい';
        broadWord.dataset.reading = 'やさしい';
        document.body.append(source);
        const internals = app as unknown as HoverLookupInternals;
        const scheduleHoverLookup = vi.fn();
        const schedulePointerTextLookup = vi.fn();
        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnHover: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.readerWordFromRenderedGeometry = vi.fn(() => broadWord);
        internals.lookupCandidateFromPoint = vi.fn(() => ({
            text: NHK_ISSUE_48_SENTENCE,
            offset: 10,
            start: 4,
            end: 15,
            anchor: source,
        }));
        internals.scheduleHoverLookup = scheduleHoverLookup;
        internals.schedulePointerTextLookup = schedulePointerTextLookup;
        const restorePoint = stubElementFromPoint(source);
        const restoreStack = stubElementsFromPoint([source]);

        try {
            internals.handleHoverPointer(hoverPointerEvent(source, 'mouse', 'pointermove', {}, null, { x: 160, y: 24 }));

            expect(schedulePointerTextLookup).toHaveBeenCalledWith(
                expect.objectContaining({
                    text: NHK_ISSUE_48_SENTENCE,
                    offset: 10,
                    start: 4,
                    end: 15,
                    anchor: source,
                }),
                expect.any(Event),
                expect.any(Object),
            );
            expect(scheduleHoverLookup).not.toHaveBeenCalled();
        } finally {
            restoreStack();
            restorePoint();
            cleanupReaderApp(app);
        }
    });

    it('passes a trusted compound card through the same parser-owned pointer path', () => {
        const app = new ReaderApp();
        const compound = readerWordFixture('東京都立大学');
        compound.dataset.tokenStart = '0';
        compound.dataset.tokenEnd = '6';
        compound.dataset.cardSource = 'local';
        compound.dataset.expression = '東京都立大学';
        compound.dataset.reading = 'とうきょうとりつだいがく';
        compound.getBoundingClientRect = () => new DOMRect(20, 20, 120, 24);
        const internals = app as unknown as HoverLookupInternals;
        const scheduleHoverLookup = vi.fn();
        const schedulePointerTextLookup = vi.fn();
        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnHover: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.scheduleHoverLookup = scheduleHoverLookup;
        internals.schedulePointerTextLookup = schedulePointerTextLookup;
        const restorePoint = stubElementFromPoint(compound);
        const restoreStack = stubElementsFromPoint([compound]);
        const restoreCaret = stubCaretPositionFromPoint(compound.firstChild as Text, 4);

        try {
            internals.handleHoverPointer(hoverPointerEvent(
                compound,
                'mouse',
                'pointermove',
                {},
                null,
                { x: 110, y: 32 },
            ));

            expect(schedulePointerTextLookup).toHaveBeenCalledWith(
                expect.objectContaining({
                    text: '東京都立大学',
                    offset: 4,
                    start: 0,
                    end: 6,
                    anchor: compound,
                }),
                expect.any(Event),
                expect.any(Object),
            );
            expect(scheduleHoverLookup).not.toHaveBeenCalled();
        } finally {
            restoreCaret();
            restoreStack();
            restorePoint();
            cleanupReaderApp(app);
        }
    });

    it('routes a hovered single-word OCR line through parser-owned geometry', () => {
        const app = new ReaderApp();
        const { line, word } = appendSingleWordOcrLine();
        word.dataset.tokenStart = '0';
        word.dataset.tokenEnd = '2';
        word.getBoundingClientRect = () => ({ left: 30, top: 20, right: 50, bottom: 30, width: 20, height: 10 } as DOMRect);
        const internals = app as unknown as HoverLookupInternals;
        const showLookupCandidate = vi.fn().mockResolvedValue(undefined);
        const restoreElementFromPoint = stubElementFromPoint(line);

        internals.settings = {
            ...DEFAULT_SETTINGS,
            hoverOpenDelayMs: 0,
            lookupOnHover: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.showLookupCandidate = showLookupCandidate;

        try {
            internals.handleHoverPointer(hoverPointerEvent(line));

            expect(showLookupCandidate).toHaveBeenCalledWith(
                expect.objectContaining({ text: '読む', offset: 1, start: 0, end: 2, anchor: word }),
                'hover',
                expect.any(Object),
            );
        } finally {
            restoreElementFromPoint();
            cleanupReaderApp(app);
        }
    });

    it('auto-plays hover audio for OCR image words resolved from line geometry', async () => {
        const app = new ReaderApp();
        const { line, word } = appendSingleWordOcrLine();
        word.dataset.tokenStart = '0';
        word.dataset.tokenEnd = '2';
        word.getBoundingClientRect = () => ({ left: 30, top: 20, right: 50, bottom: 30, width: 20, height: 10 } as DOMRect);
        const internals = app as unknown as HoverLookupInternals;
        const token: JPDBToken = {
            card: HOVER_LOOKUP_CARD,
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: '',
            sentence: '読む',
        };
        const lookupTokenAt = vi.fn(async () => token);
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
        internals.parser = { cacheCards: vi.fn(), lookupTokenAt };
        internals.showCard = showCard;

        try {
            internals.handleHoverPointer(hoverPointerEvent(line));
            await vi.waitFor(() => expect(lookupTokenAt).toHaveBeenCalledWith(
                '読む',
                1,
                { start: 0, end: 2 },
                expect.any(Object),
            ));

            await vi.waitFor(() => expect(showCard).toHaveBeenCalledWith(
                HOVER_LOOKUP_CARD,
                '読む',
                word,
                expect.objectContaining({
                    trigger: 'hover',
                    pointerTextLookup: expect.objectContaining({ text: '読む', start: 0, end: 2 }),
                }),
            ));
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
        word.dataset.tokenStart = '0';
        word.dataset.tokenEnd = '3';
        const internals = app as unknown as HoverLookupInternals;
        const showLookupCandidate = vi.fn().mockResolvedValue(undefined);
        const restoreElementFromPoint = stubElementFromPoint(overlay);
        const restoreElementsFromPoint = stubElementsFromPoint([overlay, word]);

        internals.settings = {
            ...DEFAULT_SETTINGS,
            hoverOpenDelayMs: 0,
            lookupOnHover: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.showLookupCandidate = showLookupCandidate;

        try {
            internals.handleHoverPointer(hoverPointerEvent(overlay));

            expect(showLookupCandidate).toHaveBeenCalledWith(
                expect.objectContaining({ text: 'もっと見る', offset: 1, start: 0, end: 5, anchor: word }),
                'hover',
                expect.any(Object),
            );
        } finally {
            restoreElementFromPoint();
            restoreElementsFromPoint();
            cleanupReaderApp(app);
            vi.unstubAllGlobals();
        }
    });

    it('does not open hover lookup over a host surface marked as interaction-free', () => {
        const app = new ReaderApp();
        const internals = app as unknown as HoverLookupInternals;
        const button = document.createElement('button');
        button.dataset.jpdbReaderInteractionIgnore = '';
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word';
        word.dataset.vid = '1';
        word.dataset.sid = '2';
        word.textContent = '聞く';
        button.append(word);
        document.body.append(button);
        const showWord = vi.fn().mockResolvedValue(undefined);

        internals.settings = {
            ...DEFAULT_SETTINGS,
            hoverOpenDelayMs: 0,
            lookupOnHover: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.showWord = showWord;

        try {
            internals.handleHoverPointer(hoverPointerEvent(word));

            expect(showWord).not.toHaveBeenCalled();
            expect(internals.pressLookupRequest(hoverPointerEvent(word, 'mouse', 'pointerdown'))).toBeNull();
        } finally {
            cleanupReaderApp(app);
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
        word.dataset.tokenStart = '0';
        word.dataset.tokenEnd = '1';
        const internals = app as unknown as HoverLookupInternals;
        const showLookupCandidate = vi.fn().mockResolvedValue(undefined);
        const restoreElementFromPoint = stubElementFromPoint(link);
        const restoreElementsFromPoint = stubElementsFromPoint([link]);

        internals.settings = {
            ...DEFAULT_SETTINGS,
            hoverOpenDelayMs: 0,
            lookupOnHover: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.showLookupCandidate = showLookupCandidate;

        try {
            internals.handleHoverPointer(hoverPointerEvent(link));

            expect(showLookupCandidate).toHaveBeenCalledWith(
                expect.objectContaining({ text: '一', offset: 0, start: 0, end: 1, anchor: word }),
                'hover',
                expect.any(Object),
            );
        } finally {
            restoreElementFromPoint();
            restoreElementsFromPoint();
            cleanupReaderApp(app);
            vi.unstubAllGlobals();
        }
    });

    it('keeps passive text-mirror words inside title links click-through (link is passive; hover owns the popover)', () => {
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
        });
        document.body.innerHTML = linkTitleMirrorFixture();
        const app = new ReaderApp();
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const linkClick = vi.fn();
        const showLookupCandidate = vi.fn().mockResolvedValue(undefined);
        const restoreCaret = stubCaretPositionFromPoint(word.firstChild as Text, 0);
        const internals = app as unknown as HoverLookupInternals;
        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnClick: true,
        };
        internals.showLookupCandidate = showLookupCandidate;
        internals.bindEvents();
        document.querySelector<HTMLAnchorElement>('a.video-title')?.addEventListener('click', linkClick);

        try {
            const click = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 40, clientY: 24 });
            word.dispatchEvent(click);

            expect(click.defaultPrevented).toBe(false);
            expect(linkClick).toHaveBeenCalledTimes(1);
            expect(showLookupCandidate).not.toHaveBeenCalled();
        } finally {
            restoreCaret();
            cleanupReaderApp(app);
            vi.unstubAllGlobals();
        }
    });

    it('opens link words from a stationary touch long-press and suppresses the navigation click', () => {
        vi.useFakeTimers();
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
        });
        document.body.innerHTML = linkTitleMirrorFixture();
        const app = new ReaderApp();
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const linkClick = vi.fn();
        const showLookupCandidate = vi.fn().mockResolvedValue(undefined);
        const restoreCaret = stubCaretPositionFromPoint(word.firstChild as Text, 0);
        const internals = app as unknown as HoverLookupInternals;
        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnClick: true,
        };
        internals.showLookupCandidate = showLookupCandidate;
        internals.bindEvents();
        document.querySelector<HTMLAnchorElement>('a.video-title')?.addEventListener('click', linkClick);

        try {
            word.dispatchEvent(hoverPointerEvent(word, 'touch', 'pointerdown'));
            vi.advanceTimersByTime(460);

            expect(showLookupCandidate).toHaveBeenCalledWith(
                expect.objectContaining({ text: '【初見】', offset: 1, start: 1, end: 3, anchor: word }),
                'modal',
                expect.objectContaining({ userGesture: true }),
            );

            word.dispatchEvent(hoverPointerEvent(word, 'touch', 'pointerup'));
            const click = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 40, clientY: 24 });
            word.dispatchEvent(click);

            expect(click.defaultPrevented).toBe(true);
            expect(linkClick).not.toHaveBeenCalled();
        } finally {
            restoreCaret();
            vi.useRealTimers();
            cleanupReaderApp(app);
            vi.unstubAllGlobals();
        }
    });

    it('lets a quick tap on a link word navigate without opening the popover', () => {
        vi.useFakeTimers();
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
        });
        document.body.innerHTML = linkTitleMirrorFixture();
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
            word.dispatchEvent(hoverPointerEvent(word, 'touch', 'pointerdown'));
            vi.advanceTimersByTime(120);
            word.dispatchEvent(hoverPointerEvent(word, 'touch', 'pointerup'));
            vi.advanceTimersByTime(600);
            const click = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 40, clientY: 24 });
            word.dispatchEvent(click);

            expect(showWord).not.toHaveBeenCalled();
            expect(click.defaultPrevented).toBe(false);
            expect(linkClick).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
            cleanupReaderApp(app);
            vi.unstubAllGlobals();
        }
    });

    it('resolves chatbot text-mirror clicks through parser-owned pointer geometry', async () => {
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
        const sentence = '今日は日本語を勉強しました';
        const lookupCard: JPDBCard = {
            ...HOVER_LOOKUP_CARD,
            spelling: '日本語',
            reading: 'にほんご',
        };
        const token: JPDBToken = {
            card: lookupCard,
            start: 3,
            end: 6,
            length: 3,
            rubies: [],
            pitchClass: '',
            sentence,
        };
        const lookupTokenAt = vi.fn(async () => token);
        const showPointerTextCard = vi.fn(async () => undefined);
        const restoreElementsFromPoint = stubElementsFromPoint([host]);
        const internals = app as unknown as HoverLookupInternals;
        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnClick: true,
        };
        internals.parser = { cacheCards: vi.fn(), lookupTokenAt };
        internals.showPointerTextCard = showPointerTextCard;
        internals.bindEvents();

        try {
            const click = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 48, clientY: 16 });
            host.dispatchEvent(click);

            expect(click.defaultPrevented).toBe(true);
            await vi.waitFor(() => expect(lookupTokenAt).toHaveBeenCalledWith(
                sentence,
                3,
                { start: 0, end: sentence.length },
                expect.any(Object),
            ));
            await vi.waitFor(() => expect(showPointerTextCard).toHaveBeenCalledWith(
                lookupCard,
                sentence,
                expect.objectContaining({
                    text: sentence,
                    offset: 3,
                    start: 0,
                    end: sentence.length,
                    anchor: word,
                }),
                token,
                'modal',
                expect.objectContaining({ userGesture: true }),
            ));
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
        word.dataset.tokenEnd = '3';
        const showLookupCandidate = vi.fn().mockResolvedValue(undefined);
        const restoreCaret = stubCaretPositionFromPoint(word.firstChild as Text, 1);
        const internals = app as unknown as HoverLookupInternals;
        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnClick: true,
        };
        internals.showLookupCandidate = showLookupCandidate;
        internals.bindEvents();

        try {
            const click = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 24, clientY: 24 });
            word.dispatchEvent(click);

            expect(click.defaultPrevented).toBe(true);
            expect(showLookupCandidate).toHaveBeenCalledWith(
                expect.objectContaining({ text: '日本語', offset: 1, start: 0, end: 3, anchor: word }),
                'modal',
                expect.objectContaining({ userGesture: true }),
            );
        } finally {
            restoreCaret();
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

    it('keeps passive text-mirror words inside ARIA menu items click-through', () => {
        document.body.innerHTML = `
            <div role="menu">
                <div id="quality" role="menuitem" tabindex="0">
                    <span class="jpdb-reader-text-mirror" data-jpdb-reader-text-mirror="true" data-source-text="画質">
                        <span class="jpdb-reader-word jpdb-reader-scan-word jpdb-reader-passive-word" data-vid="501" data-sid="501" data-token-start="0" data-token-end="2" data-sentence="画質" data-expression="画質" data-jpdb-reader-passive="true">画質</span>
                    </span>
                </div>
            </div>
        `;
        const app = new ReaderApp();
        const menuItem = document.querySelector<HTMLElement>('#quality')!;
        const word = menuItem.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const menuClick = vi.fn();
        const showWord = vi.fn().mockResolvedValue(undefined);
        const internals = app as unknown as HoverLookupInternals;
        internals.settings = { ...DEFAULT_SETTINGS, lookupOnClick: true };
        internals.showWord = showWord;
        internals.bindEvents();
        menuItem.addEventListener('click', menuClick);

        try {
            const click = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 24, clientY: 24 });
            word.dispatchEvent(click);

            expect(click.defaultPrevented).toBe(false);
            expect(menuClick).toHaveBeenCalledTimes(1);
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
        word.dataset.tokenStart = '0';
        word.dataset.tokenEnd = '2';
        word.getBoundingClientRect = () => ({ left: 30, top: 20, right: 50, bottom: 30, width: 20, height: 10 } as DOMRect);
        const internals = app as unknown as HoverLookupInternals;
        const showLookupCandidate = vi.fn().mockResolvedValue(undefined);

        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnClick: true,
        };
        internals.showLookupCandidate = showLookupCandidate;
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
            expect(showLookupCandidate).toHaveBeenCalledWith(
                expect.objectContaining({ text: '読む', offset: 1, start: 0, end: 2, anchor: word }),
                'modal',
                expect.objectContaining({ userGesture: true }),
            );
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

    it('keeps the hover popover open while the pointer remains inside the same hyperlink', () => {
        const app = new ReaderApp();
        const { label, link, word } = linkWrappedWordFixture();
        const { popover } = appendActivePopoverBody();
        const internals = app as unknown as HoverLookupInternals;
        const restorePoint = stubElementFromPoint(label);
        const restoreStack = stubElementsFromPoint([label]);
        const linkMatches = vi.spyOn(link, 'matches').mockImplementation(selector => (
            selector === ':hover' || Element.prototype.matches.call(link, selector)
        ));

        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnHover: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.activePopover = popover;
        internals.activePopoverMode = 'hover';
        internals.activeHoverWord = word;
        internals.activePopoverAnchor = word;
        internals.lastPointerPosition = { x: 40, y: 24 };

        try {
            expect(internals.isHoverContextActive({ ignoreCssHover: true })).toBe(true);
            expect(internals.isHoverContextActive({ ignorePointerPosition: true })).toBe(true);
            internals.activeHoverWord = undefined;
            expect(internals.isHoverContextActive({ ignoreCssHover: true })).toBe(true);
        } finally {
            linkMatches.mockRestore();
            restoreStack();
            restorePoint();
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

    it('routes the next parser-owned span while an existing hover card is active', () => {
        const app = new ReaderApp();
        const { firstWord, nextWord } = appendParsedWordPair();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        document.body.append(popover);

        const internals = app as unknown as HoverLookupInternals;
        nextWord.dataset.tokenStart = '0';
        nextWord.dataset.tokenEnd = '1';
        const schedulePointerTextLookup = vi.fn();
        const restoreCaret = stubCaretPositionFromPoint(nextWord.firstChild as Text, 0);
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
        internals.schedulePointerTextLookup = schedulePointerTextLookup;

        try {
            internals.handleHoverPointer(hoverPointerEvent(nextWord));

            expect(schedulePointerTextLookup).toHaveBeenCalledWith(
                expect.objectContaining({ text: '犬を見る', offset: 0, start: 0, end: 4, anchor: nextWord }),
                expect.any(Event),
                expect.any(Object),
            );
        } finally {
            restoreCaret();
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

    it('keeps the opening point fixed while an active hover hydrates', () => {
        const app = new ReaderApp();
        const word = readerWordFixture('今日は読む', '読む');
        const popover = appendActivePopoverBody().popover;
        const internals = app as unknown as HoverLookupInternals;
        const restorePoint = stubElementFromPoint(word);
        const restoreStack = stubElementsFromPoint([word]);

        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnHover: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.activePopover = popover;
        internals.activePopoverMode = 'hover';
        internals.activeHoverWord = word;
        internals.activePopoverAnchor = word;
        internals.activeHoverLookupKey = 'word:1:2:今日は読む';
        internals.hoverPopoverPointerPosition = { x: 40, y: 24 };

        try {
            internals.handleHoverPointer(hoverPointerEvent(
                word,
                'mouse',
                'pointermove',
                {},
                null,
                { x: 72, y: 30 },
            ));

            expect(internals.lastPointerPosition).toEqual({ x: 72, y: 30 });
            expect(internals.hoverPopoverPointerPosition).toEqual({ x: 40, y: 24 });
        } finally {
            restoreStack();
            restorePoint();
            cleanupReaderApp(app);
        }
    });

    it('keeps a scrolled hover popover open when Firefox transiently drops CSS hover', () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const word = readerWordFixture('今日は読む', '読む');
        const { popover, body } = appendActivePopoverBody();
        const outside = document.createElement('div');
        document.body.append(outside);
        const internals = app as unknown as HoverLookupInternals;
        popover.getBoundingClientRect = () => new DOMRect(20, 20, 520, 300);
        internals.settings = { ...DEFAULT_SETTINGS, hoverCloseDelayMs: 0 };
        internals.lastPointerPosition = { x: 120, y: 360 };
        internals.mountPopover(popover, word, { mode: 'hover', focusOnMount: false });
        popover.dispatchEvent(hoverPointerEvent(
            popover,
            'mouse',
            'pointerenter',
            {},
            null,
            { x: 120, y: 120 },
        ));
        let restorePoint = stubElementFromPoint(body);
        let restoreStack = stubElementsFromPoint([body]);

        try {
            body.dispatchEvent(new Event('scroll'));
            vi.advanceTimersByTime(300);

            expect(internals.activePopover).toBe(popover);
            expect(internals.isHoverContextActive({ ignorePointerPosition: true })).toBe(true);

            restoreStack();
            restorePoint();
            restorePoint = stubElementFromPoint(outside);
            restoreStack = stubElementsFromPoint([outside]);
            internals.lastPointerPosition = { x: 700, y: 500 };
            // The negative control has to reproduce a real exit, not just move the
            // stored point: the browser fires pointerleave on the popover when the
            // cursor crosses out of it, and that event — not a geometry re-sample —
            // is what releases the pointer latch.
            popover.dispatchEvent(hoverPointerEvent(
                popover,
                'mouse',
                'pointerleave',
                {},
                outside,
                { x: 700, y: 500 },
            ));
            vi.advanceTimersByTime(100);
            expect(internals.activePopover).toBeUndefined();
        } finally {
            restoreStack();
            restorePoint();
            cleanupReaderApp(app);
            vi.useRealTimers();
        }
    });

    it('treats only the cursor-to-popover gap as hover-owned transit', () => {
        const app = new ReaderApp();
        const activeWord = readerWordFixture('今日は読む', '読む');
        const nextWord = readerWordFixture('別の語', '別');
        nextWord.dataset.vid = '9';
        nextWord.dataset.sid = '9';
        const popover = appendActivePopoverBody().popover;
        popover.getBoundingClientRect = () => new DOMRect(50, 50, 200, 126);
        const hoverLookup = setupHoverLookupSpies(app, {
            activePopover: popover,
            activePopoverMode: 'hover',
        });
        const { internals } = hoverLookup;
        internals.activeHoverWord = activeWord;
        internals.activePopoverAnchor = activeWord;
        internals.hoverPopoverPointerPosition = { x: 100, y: 200 };

        try {
            // The 24px layout gap is backed by another parsed word. Crossing the
            // direct path to the popup keeps the current card and gives the
            // pointer a deliberate settle delay before retargeting that word.
            internals.handleHoverPointer(hoverPointerEvent(
                nextWord,
                'mouse',
                'pointermove',
                {},
                null,
                { x: 100, y: 188 },
            ));
            expect(hoverLookup.scheduleHoverLookup).toHaveBeenCalledWith(
                nextWord,
                expect.objectContaining({ clientX: 100, clientY: 188 }),
                { minimumDelayMs: HOVER_POPOVER_TRANSIT_SETTLE_DELAY_MS },
            );
            expect(hoverLookup.handlePointerTextHover).not.toHaveBeenCalled();
            internals.activePointerTextLookup = { text: '今日は読む', start: 3, end: 5, anchor: activeWord };
            expect(internals.isHoverContextActive({ ignoreCssHover: true, ignorePointerPosition: true })).toBe(true);
            internals.activePointerTextLookup = undefined;

            // The bridge is a narrow route, not the whole bounding box between
            // word and popup; moving sideways still permits a genuine next lookup.
            internals.handleHoverPointer(hoverPointerEvent(
                nextWord,
                'mouse',
                'pointermove',
                {},
                null,
                { x: 140, y: 188 },
            ));
            expect(hoverLookup.scheduleHoverLookup).toHaveBeenCalledWith(
                nextWord,
                expect.objectContaining({ clientX: 140, clientY: 188 }),
            );
        } finally {
            cleanupReaderApp(app);
        }
    });

    it('cancels a gap-backed word switch when the pointer reaches the popover before settling', async () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const activeWord = readerWordFixture('今日は読む', '読む');
        const nextWord = readerWordFixture('別の語', '別');
        nextWord.dataset.vid = '9';
        nextWord.dataset.sid = '9';
        const { popover, body } = appendActivePopoverBody();
        popover.getBoundingClientRect = () => new DOMRect(50, 50, 200, 126);
        const internals = app as unknown as HoverLookupInternals;
        const showWord = vi.fn().mockResolvedValue(undefined);
        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnHover: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.activePopover = popover;
        internals.activePopoverMode = 'hover';
        internals.activeHoverWord = activeWord;
        internals.activePopoverAnchor = activeWord;
        internals.hoverPopoverPointerPosition = { x: 100, y: 200 };
        internals.showWord = showWord;
        let restorePoint = stubElementFromPoint(nextWord);
        let restoreStack = stubElementsFromPoint([nextWord]);

        try {
            internals.handleHoverPointer(hoverPointerEvent(nextWord, 'mouse', 'pointermove', {}, null, { x: 100, y: 188 }));
            await vi.advanceTimersByTimeAsync(HOVER_POPOVER_TRANSIT_SETTLE_DELAY_MS - 1);
            expect(showWord).not.toHaveBeenCalled();

            restoreStack();
            restorePoint();
            restorePoint = stubElementFromPoint(body);
            restoreStack = stubElementsFromPoint([body]);
            internals.handleHoverPointer(hoverPointerEvent(body, 'mouse', 'pointermove', {}, null, { x: 100, y: 170 }));
            await vi.advanceTimersByTimeAsync(1);
            expect(showWord).not.toHaveBeenCalled();
        } finally {
            restoreStack();
            restorePoint();
            vi.useRealTimers();
            cleanupReaderApp(app);
        }
    });

    it('retargets a genuine word when the pointer settles on it inside the popover gap', async () => {
        vi.useFakeTimers();
        const app = new ReaderApp();
        const activeWord = readerWordFixture('今日は読む', '読む');
        const nextWord = readerWordFixture(NHK_ISSUE_48_SENTENCE, 'ニュース');
        nextWord.dataset.vid = '9';
        nextWord.dataset.sid = '9';
        nextWord.dataset.tokenStart = '11';
        nextWord.dataset.tokenEnd = '15';
        const popover = appendActivePopoverBody().popover;
        popover.getBoundingClientRect = () => new DOMRect(50, 50, 200, 126);
        const internals = app as unknown as HoverLookupInternals;
        const showLookupCandidate = vi.fn().mockResolvedValue(undefined);
        const restoreCaret = stubCaretPositionFromPoint(nextWord.firstChild as Text, 1);
        internals.settings = {
            ...DEFAULT_SETTINGS,
            lookupOnHover: true,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: '' },
        };
        internals.activePopover = popover;
        internals.activePopoverMode = 'hover';
        internals.activeHoverWord = activeWord;
        internals.activePopoverAnchor = activeWord;
        internals.hoverPopoverPointerPosition = { x: 100, y: 200 };
        internals.showLookupCandidate = showLookupCandidate;
        const restorePoint = stubElementFromPoint(nextWord);
        const restoreStack = stubElementsFromPoint([nextWord]);

        try {
            internals.handleHoverPointer(hoverPointerEvent(nextWord, 'mouse', 'pointermove', {}, null, { x: 100, y: 188 }));
            await vi.advanceTimersByTimeAsync(HOVER_POPOVER_TRANSIT_SETTLE_DELAY_MS - 1);
            expect(showLookupCandidate).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(1);
            expect(showLookupCandidate).toHaveBeenCalledWith(
                expect.objectContaining({
                    text: NHK_ISSUE_48_SENTENCE,
                    offset: 12,
                    start: 4,
                    end: 15,
                    anchor: nextWord,
                }),
                'hover',
                expect.any(Object),
            );
        } finally {
            restoreCaret();
            restoreStack();
            restorePoint();
            vi.useRealTimers();
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

        it('lets the watchdog trust an exact connected-word hit but not a moved-away pointer', () => {
            // jsdom never reports `:hover`, so these checks exercise geometry. The strict
            // watchdog may trust an exact word hit, but not the loose containment fallback.
            const word = readerWordFixture('今日は読む', '読む');
            const { app, internals } = setupHoverWordContext(word);
            const restoreStack = stubElementsFromPoint([word]);
            const restorePoint = stubElementFromPoint(word);

            try {
                expect(word.isConnected).toBe(true);
                expect(internals.isHoverContextActive({})).toBe(true);
                expect(internals.isHoverContextActive({ ignorePointerPosition: true })).toBe(true);
                expect(internals.activeHoverWord).toBe(word);
            } finally {
                restorePoint();
                restoreStack();
            }

            // A generic descendant hit is only loose DOM containment, not semantic word
            // geometry. Normal close checks may use it; the watchdog must not.
            const child = document.createElement('span');
            word.append(child);
            const nonWordStackTarget = document.createElement('div');
            document.body.append(nonWordStackTarget);
            const restoreContainedStack = stubElementsFromPoint([nonWordStackTarget]);
            const restoreContainedPoint = stubElementFromPoint(child);

            try {
                expect(internals.isHoverContextActive({})).toBe(true);
                expect(internals.isHoverContextActive({ ignorePointerPosition: true })).toBe(false);
            } finally {
                restoreContainedPoint();
                restoreContainedStack();
            }

            // Pointer moved away: nothing under the point, connected node not hovered.
            const elsewhere = document.createElement('div');
            document.body.append(elsewhere);
            const restoreStackAway = stubElementsFromPoint([elsewhere]);
            const restorePointAway = stubElementFromPoint(elsewhere);

            try {
                expect(internals.isHoverContextActive({})).toBe(false);
                expect(internals.isHoverContextActive({ ignorePointerPosition: true })).toBe(false);
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

    describe('hover popover section collapse', () => {
        function mountHoverPopoverWithSection(internals: HoverLookupInternals): {
            popover: HTMLElement;
            details: HTMLDetailsElement;
            word: HTMLElement;
            pageBelow: HTMLElement;
        } {
            const word = readerWordFixture('本を読む', '読む');
            const popover = document.createElement('div');
            popover.className = 'jpdb-reader-popover';
            popover.dataset.jpdbReaderRoot = 'true';
            popover.innerHTML = `
                <div class="jpdb-reader-popover-body">
                    <details class="jpdb-reader-source-card" open>
                        <summary class="jpdb-reader-local-title">JPDB</summary>
                        <div class="jpdb-reader-source-body">意味</div>
                    </details>
                </div>
            `;
            // Page content that ends up under the (unmoved) pointer once the section
            // collapses and the popover shrinks upward past it.
            const pageBelow = document.createElement('div');
            pageBelow.textContent = 'page';
            document.body.append(popover, pageBelow);
            const details = popover.querySelector<HTMLDetailsElement>('details')!;
            internals.mountPopover(popover, word, { mode: 'hover', focusOnMount: false });
            return { popover, details, word, pageBelow };
        }

        it('keeps the hover popover open when a section collapses under a stationary pointer', () => {
            vi.useFakeTimers();
            const app = new ReaderApp();
            const internals = app as unknown as HoverLookupInternals;
            internals.settings = { ...DEFAULT_SETTINGS, hoverCloseDelayMs: 0 };
            const { popover, details, pageBelow } = mountHoverPopoverWithSection(internals);
            // The pointer sits over the open section; the SAME coordinate resolves to
            // page content once the collapse shrinks the popover out from under it.
            internals.lastPointerPosition = { x: 40, y: 24 };
            const restorePoint = stubElementFromPoint(pageBelow);
            const restoreStack = stubElementsFromPoint([pageBelow]);

            try {
                // Baseline: an unmoved pointer resolving outside the popover would
                // normally end the hover context, so the popover would close.
                expect(internals.isHoverContextActive({ ignoreCssHover: true })).toBe(false);

                // Collapse the section — the reported gesture. The browser then fires
                // a spurious pointerleave at the unchanged pointer position.
                details.open = false;
                details.dispatchEvent(new Event('toggle'));
                popover.dispatchEvent(hoverPointerEvent(popover, 'mouse', 'pointerleave'));
                vi.advanceTimersByTime(300);

                // The popover survives its own resize instead of vanishing.
                expect(internals.activePopover).toBe(popover);
                expect(internals.isHoverContextActive({ ignoreCssHover: true })).toBe(true);
            } finally {
                restoreStack();
                restorePoint();
                cleanupReaderApp(app);
                vi.useRealTimers();
            }
        });

        it('still closes after a collapse once the pointer genuinely moves away', () => {
            const app = new ReaderApp();
            const internals = app as unknown as HoverLookupInternals;
            internals.settings = { ...DEFAULT_SETTINGS, hoverCloseDelayMs: 0 };
            const { details, pageBelow } = mountHoverPopoverWithSection(internals);
            internals.lastPointerPosition = { x: 40, y: 24 };
            const restorePoint = stubElementFromPoint(pageBelow);
            const restoreStack = stubElementsFromPoint([pageBelow]);

            try {
                details.open = false;
                details.dispatchEvent(new Event('toggle'));
                expect(internals.isHoverContextActive({ ignoreCssHover: true })).toBe(true);

                // A real pointer move to empty space ends the grace, so a wedged-open
                // popover can still close normally.
                internals.lastPointerPosition = { x: 600, y: 500 };
                expect(internals.isHoverContextActive({ ignoreCssHover: true })).toBe(false);
            } finally {
                restoreStack();
                restorePoint();
                cleanupReaderApp(app);
            }
        });

        it('reaps a collapse-stuck hover popover after the sticky backstop elapses', () => {
            vi.useFakeTimers();
            const app = new ReaderApp();
            const internals = app as unknown as HoverLookupInternals;
            internals.settings = { ...DEFAULT_SETTINGS, hoverCloseDelayMs: 0 };
            const { popover, details } = mountHoverPopoverWithSection(internals);
            internals.lastPointerPosition = { x: 40, y: 24 };

            try {
                details.open = false;
                details.dispatchEvent(new Event('toggle'));
                popover.dispatchEvent(hoverPointerEvent(popover, 'mouse', 'pointerleave'));

                vi.advanceTimersByTime(3_000);
                expect(internals.activePopover).toBe(popover);

                // Backstop: even a perfectly stationary pointer eventually releases
                // the popover so it cannot hang open forever.
                vi.advanceTimersByTime(1_500);
                expect(internals.activePopover).toBeUndefined();
            } finally {
                cleanupReaderApp(app);
                vi.useRealTimers();
            }
        });
    });
});
