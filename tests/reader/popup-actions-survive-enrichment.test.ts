import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_SETTINGS,
    ReaderApp,
    deferred,
    registerReaderHelpersCleanup,
    installSheetHandle,
    testAozoraCard,
} from './jpdb/fixtures';
import type { AnkiLookupResult, CardRenderData, JPDBCard, YomitanTermEntry } from './jpdb/fixtures';
import type { CardCommandCapability } from '../../src/reader/dom/private-command-capabilities';
import { dispatchAuthorizedReaderControlEvent } from '../../src/reader/ui/trusted-interaction';
import { NewTabRuntime, newTabLookupRenderData, newTabTestCard, setupNewTabLookupRuntime } from './new-tab-review/fixtures';

/**
 * "A first Add click detached during enrichment": the learner opens the ⋯ overflow
 * and the "Add to deck…" dropdown while the popup is still loading, then a provider
 * lands and the popup re-renders its HTML. The open dropdown must not be rebuilt
 * under the learner, and the overflow and focus must survive the renders that do run.
 */

registerReaderHelpersCleanup();

const SENTENCE = '青空です。';
const NOT_IN_DECK: AnkiLookupResult = { state: 'not-in-deck', notes: [], primary: null };
const SETTINGS = {
    ...DEFAULT_SETTINGS,
    interfaceLanguage: 'en' as const,
    apiKey: 'jpdb-key',
    jpdbMiningEnabled: false,
    jitenApiKey: '',
    yomuLocalSrsEnabled: true,
    ankiEnabled: false,
    enableReviews: true,
};

type Internals = {
    activePopover: HTMLElement;
    settings: typeof SETTINGS;
    parsePopoverJapanese: () => Promise<void>;
    handleCardAction: (control: HTMLSelectElement, card: JPDBCard, sentence: string | undefined, command: CardCommandCapability) => Promise<void>;
    toggleMiningControls(button: HTMLButtonElement): void;
    renderDeferredCardLocalEntries(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        trigger: 'modal' | 'hover',
        renderData: { localEntries: Promise<YomitanTermEntry[]>; jpdbVocabularyInfo?: Promise<null>; all: Promise<CardRenderData> },
        fallbackAnkiLookup: AnkiLookupResult,
        mounted: { instantLocalEntries: null; requestId: number },
        renderState: { fullRenderCompleted: boolean },
        isCurrentHoverCard: () => boolean,
    ): void;
    renderCompletedCardPopover(popover: HTMLElement, card: JPDBCard, sentence: string | undefined, trigger: 'modal' | 'hover', data: CardRenderData): void;
    cardRenderData: { load(card: JPDBCard): unknown; clear(): void };
    hoverLookupGeneration: number;
    activePopoverMode?: 'modal' | 'hover';
    showCard(card: JPDBCard, sentence?: string, anchor?: HTMLElement, options?: Record<string, unknown>): Promise<void>;
    cancelPendingHoverLookup(): void;
    pinActiveHoverPopoverForPendingModalLookup(): void;
};

let pickerRoot: ShadowRoot | undefined;
let frames: FrameRequestCallback[] = [];
beforeEach(() => {
    const attach = Element.prototype.attachShadow;
    vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (this: Element, init) {
        const root = attach.call(this, init);
        if (this.classList.contains('jpdb-reader-deck-select')) pickerRoot = root;
        return root;
    });
});

function holdFrames(): void {
    frames = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => frames.push(callback));
}
afterEach(() => {
    vi.restoreAllMocks();
    pickerRoot = undefined;
});

function flushFrames(): void {
    while (frames.length) frames.shift()!(0);
}

async function settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

// A render waiting on the dropdown lands a task after focus leaves it.
async function nextTask(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve));
}

// A popup as the reader mounts one: focusable itself, so focus can always stay inside it.
// Where account data may show (Study's origin) and with a JPDB key, "Add to deck…" shares
// the ⋯ overflow with Never forget and Blacklist. An ordinary page's popup has only
// "Add to deck…", so it sits alone in the row with no ⋯ (a lone action needs no drawer).
function mountPopup(surface: 'study' | 'ordinary page' = 'study'): { app: InstanceType<typeof ReaderApp>; internals: Internals; popover: HTMLElement } {
    if (surface === 'study') vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
    const app = new ReaderApp();
    const internals = app as unknown as Internals;
    const popover = document.createElement('div');
    popover.className = 'jpdb-reader-popover';
    popover.dataset.jpdbReaderRoot = 'true';
    popover.tabIndex = -1;
    document.body.append(popover);
    internals.activePopover = popover;
    internals.settings = SETTINGS;
    internals.parsePopoverJapanese = vi.fn(async () => undefined);
    return { app, internals, popover };
}

function completedData(): CardRenderData {
    return {
        localEntries: [],
        kanjiEntries: [],
        metaEntries: [],
        ankiLookup: NOT_IN_DECK,
        jpdbDecks: [],
        ankiDecks: [],
        jpdbVocabularyInfo: null,
    } as unknown as CardRenderData;
}

// Where the learner leaves the dropdown for: Shift+Tab reaches ⋯; Tab, the popup's last
// control behind it, wraps (a modal's focus trap) to its first, such as ← back or the
// heading's kanji.
const LEAVE_DROPDOWN_FOR = [
    ['⋯ (Shift+Tab)', (popover: HTMLElement) => popover.querySelector<HTMLElement>('[data-action="mining-collapse"]')!],
    ['first control (Tab)', (popover: HTMLElement) => [...popover.querySelectorAll<HTMLElement>('button, a[href]')].find(node => !node.closest('.jpdb-reader-actions'))!],
] as const;

// The popup still loading, ⋯ open and the learner in "Add to deck…": the completed
// render waits for them to leave it.
async function enterDropdownWithCompletedRenderWaiting(internals: Internals, popover: HTMLElement, trigger: 'modal' | 'hover'): Promise<void> {
    const card = testAozoraCard();
    const localEntries = deferred<YomitanTermEntry[]>();
    holdFrames();
    internals.renderDeferredCardLocalEntries(
        popover, card, SENTENCE, trigger,
        { localEntries: localEntries.promise, all: deferred<CardRenderData>().promise },
        NOT_IN_DECK, { instantLocalEntries: null, requestId: 1 }, { fullRenderCompleted: false }, () => true,
    );
    localEntries.resolve([]);
    await settle();
    flushFrames();
    internals.toggleMiningControls(popover.querySelector<HTMLButtonElement>('[data-action="mining-collapse"]')!);
    pickerRoot!.querySelector('select')!.focus();
    internals.renderCompletedCardPopover(popover, card, SENTENCE, trigger, completedData());
    flushFrames();
    expect(popover.querySelector('[data-card-details-loading]')).not.toBeNull();
}

describe.each(['modal', 'hover'] as const)('%s popup actions while enrichment re-renders the card', trigger => {
    it('does not rebuild under the open "Add to deck…" dropdown, saves the chosen deck, then catches up', async () => {
        const { app, internals, popover } = mountPopup();
        const card = testAozoraCard();
        const handleCardAction = vi.fn(async () => undefined);
        internals.handleCardAction = handleCardAction;
        const localEntries = deferred<YomitanTermEntry[]>();
        const jpdbVocabularyInfo = deferred<null>();
        holdFrames();
        const host = () => popover.querySelector<HTMLElement>('.jpdb-reader-deck-select');
        const overflow = () => popover.querySelector<HTMLButtonElement>('[data-action="mining-collapse"]');
        const loading = () => popover.querySelector('[data-card-details-loading]');

        try {
            internals.renderDeferredCardLocalEntries(
                popover, card, SENTENCE, trigger,
                { localEntries: localEntries.promise, jpdbVocabularyInfo: jpdbVocabularyInfo.promise, all: deferred<CardRenderData>().promise },
                NOT_IN_DECK, { instantLocalEntries: null, requestId: 1 }, { fullRenderCompleted: false }, () => true,
            );
            localEntries.resolve([]);
            await settle();
            flushFrames();
            expect(loading()).not.toBeNull();

            // The learner, still during loading: ⋯, then into the dropdown.
            internals.toggleMiningControls(overflow()!);
            const opened = host()!;
            const dropdown = pickerRoot!.querySelector('select')!;
            dropdown.focus();
            expect(document.activeElement).toBe(opened);

            // Providers land, then enrichment completes: nothing rebuilds under the choice.
            jpdbVocabularyInfo.resolve(null);
            await settle();
            flushFrames();
            internals.renderCompletedCardPopover(popover, card, SENTENCE, trigger, completedData());
            flushFrames();
            expect(host()).toBe(opened);
            expect(opened.isConnected).toBe(true);
            expect(pickerRoot!.activeElement).toBe(dropdown);
            expect(loading()).not.toBeNull();

            // Choosing a deck saves the word there, through the dropdown on screen.
            dropdown.selectedIndex = 1;
            dispatchAuthorizedReaderControlEvent(dropdown, new Event('change'));
            expect(handleCardAction).toHaveBeenCalledTimes(1);
            expect(handleCardAction).toHaveBeenCalledWith(dropdown, card, SENTENCE, { kind: 'card-action', action: 'add', deckSource: 'yomu-local', deckId: 'yomu-local' });
            // The learner keeps their place in the dropdown after the save.
            await settle();
            expect(pickerRoot!.activeElement).toBe(dropdown);

            // Leaving the dropdown lets the newest render in, with the overflow still open.
            dropdown.blur();
            await nextTask();
            flushFrames();
            expect(loading()).toBeNull();
            expect(host()).not.toBe(opened);
            expect(overflow()!.getAttribute('aria-expanded')).toBe('true');
            expect(host()!.closest('.jpdb-reader-actions-mining-collapsed')).toBeNull();
            expect(pickerRoot!.querySelector('select')!.options).toHaveLength(dropdown.options.length);
        } finally {
            popover.remove();
            app.destroy();
        }
    });

    it('keeps a lone "Add to deck…" in the row through enrichment on an ordinary page, saves the chosen deck, then catches up', async () => {
        const { app, internals, popover } = mountPopup('ordinary page');
        internals.settings = { ...SETTINGS, apiKey: '' };
        const card = testAozoraCard();
        const handleCardAction = vi.fn(async () => undefined);
        internals.handleCardAction = handleCardAction;
        const localEntries = deferred<YomitanTermEntry[]>();
        holdFrames();
        const host = () => popover.querySelector<HTMLElement>('.jpdb-reader-deck-select');
        const isLoneInRow = (node: HTMLElement) => node.parentElement!.matches('.jpdb-reader-actions.jpdb-reader-actions-quiet');
        const loading = () => popover.querySelector('[data-card-details-loading]');

        try {
            internals.renderDeferredCardLocalEntries(
                popover, card, SENTENCE, trigger,
                { localEntries: localEntries.promise, all: deferred<CardRenderData>().promise },
                NOT_IN_DECK, { instantLocalEntries: null, requestId: 1 }, { fullRenderCompleted: false }, () => true,
            );
            localEntries.resolve([]);
            await settle();
            flushFrames();
            expect(loading()).not.toBeNull();
            expect(popover.querySelector('[data-action="mining-collapse"]')).toBeNull();
            const opened = host()!;
            expect(isLoneInRow(opened)).toBe(true);
            const dropdown = pickerRoot!.querySelector('select')!;
            dropdown.focus();

            internals.renderCompletedCardPopover(popover, card, SENTENCE, trigger, completedData());
            flushFrames();
            expect(host()).toBe(opened);
            expect(pickerRoot!.activeElement).toBe(dropdown);
            expect(loading()).not.toBeNull();

            dropdown.selectedIndex = 1;
            dispatchAuthorizedReaderControlEvent(dropdown, new Event('change'));
            expect(handleCardAction).toHaveBeenCalledWith(dropdown, card, SENTENCE, { kind: 'card-action', action: 'add', deckSource: 'yomu-local', deckId: 'yomu-local' });
            await settle();
            expect(pickerRoot!.activeElement).toBe(dropdown);

            dropdown.blur();
            await nextTask();
            flushFrames();
            expect(loading()).toBeNull();
            expect(host()).not.toBe(opened);
            expect(isLoneInRow(host()!)).toBe(true);
            expect(popover.querySelector('[data-action="mining-collapse"]')).toBeNull();
        } finally {
            popover.remove();
            app.destroy();
        }
    });

    // Focus reaches the control the learner moves to only after the dropdown's focusout, and
    // the waiting render runs a task later. Run inside focusout, it rebuilt ⋯ before focus
    // got there; giving focus back only to the action row, it lost Tab's to the page.
    it.each(LEAVE_DROPDOWN_FOR)('lands focus on the rebuilt %s when the learner leaves the dropdown for it while a render waits', async (_, control) => {
        const { app, internals, popover } = mountPopup();

        try {
            await enterDropdownWithCompletedRenderWaiting(internals, popover, trigger);
            const reached = control(popover);
            reached.focus();
            await nextTask();
            flushFrames();

            expect(popover.querySelector('[data-card-details-loading]')).toBeNull();
            expect(control(popover)).not.toBe(reached);
            expect(document.activeElement).toBe(control(popover));
            expect(popover.querySelector('[data-action="mining-collapse"]')!.getAttribute('aria-expanded')).toBe('true');
        } finally {
            popover.remove();
            app.destroy();
        }
    });

    // On a phone the popup is a sheet, and Tab from the dropdown reaches its handle. A
    // rebuilt handle takes focus only once the sheet's observer has made it a control.
    it('lands focus on the rebuilt sheet handle when the learner leaves the dropdown for it while a render waits', async () => {
        const { app, internals, popover } = mountPopup();
        installSheetHandle(popover, () => undefined);
        const handle = () => popover.querySelector<HTMLElement>('.jpdb-reader-sheet-handle')!;

        try {
            await enterDropdownWithCompletedRenderWaiting(internals, popover, trigger);
            const reached = handle();
            reached.focus();
            expect(document.activeElement).toBe(reached);
            await nextTask();
            flushFrames();

            expect(popover.querySelector('[data-card-details-loading]')).toBeNull();
            expect(handle()).not.toBe(reached);
            expect(document.activeElement).toBe(handle());
        } finally {
            popover.remove();
            app.destroy();
        }
    });

    it('keeps focus in the popup when the control the learner moved to is not rebuilt', async () => {
        const { app, internals, popover } = mountPopup();

        try {
            await enterDropdownWithCompletedRenderWaiting(internals, popover, trigger);
            const passing = document.createElement('button');
            popover.append(passing);
            passing.focus();
            await nextTask();
            flushFrames();

            expect(popover.querySelector('[data-card-details-loading]')).toBeNull();
            expect(passing.isConnected).toBe(false);
            expect(document.activeElement).toBe(popover);
        } finally {
            popover.remove();
            app.destroy();
        }
    });

    // The last provider asks for a loading frame and enrichment completes a microtask
    // later, before that frame. The frame came due with the completed render waiting on the
    // dropdown, took its place as the newest, then rendered nothing: the popup stayed loading.
    it('shows the completed card once the learner leaves, when a loading frame came due after completion', async () => {
        const { app, internals, popover } = mountPopup();
        const card = testAozoraCard();
        const localEntries = deferred<YomitanTermEntry[]>();
        const jpdbVocabularyInfo = deferred<null>();
        const renderState = { fullRenderCompleted: false };
        const loading = () => popover.querySelector('[data-card-details-loading]');
        holdFrames();

        try {
            internals.renderDeferredCardLocalEntries(
                popover, card, SENTENCE, trigger,
                { localEntries: localEntries.promise, jpdbVocabularyInfo: jpdbVocabularyInfo.promise, all: deferred<CardRenderData>().promise },
                NOT_IN_DECK, { instantLocalEntries: null, requestId: 1 }, renderState, () => true,
            );
            localEntries.resolve([]);
            await settle();
            flushFrames();
            internals.toggleMiningControls(popover.querySelector<HTMLButtonElement>('[data-action="mining-collapse"]')!);
            const dropdown = pickerRoot!.querySelector('select')!;
            dropdown.focus();

            jpdbVocabularyInfo.resolve(null);
            await settle();
            renderState.fullRenderCompleted = true;
            internals.renderCompletedCardPopover(popover, card, SENTENCE, trigger, completedData());
            flushFrames();
            expect(loading()).not.toBeNull();

            dropdown.blur();
            await nextTask();
            flushFrames();
            expect(loading()).toBeNull();
        } finally {
            popover.remove();
            app.destroy();
        }
    });

    it('keeps an open overflow across a re-render while the learner is not in the dropdown', async () => {
        const { app, internals, popover } = mountPopup();
        const card = testAozoraCard();

        try {
            internals.renderCompletedCardPopover(popover, card, SENTENCE, trigger, completedData());
            const before = popover.querySelector('.jpdb-reader-deck-select');
            internals.toggleMiningControls(popover.querySelector<HTMLButtonElement>('[data-action="mining-collapse"]')!);

            internals.renderCompletedCardPopover(popover, card, SENTENCE, trigger, completedData());

            const after = popover.querySelector<HTMLElement>('.jpdb-reader-deck-select')!;
            expect(after).not.toBe(before);
            expect(after.closest('.jpdb-reader-actions-mining-collapsed')).toBeNull();
            expect(pickerRoot!.querySelector('select')).not.toBeNull();
        } finally {
            popover.remove();
            app.destroy();
        }
    });

    it('keeps keyboard focus on the overflow toggle across a re-render', async () => {
        const { app, internals, popover } = mountPopup();
        const card = testAozoraCard();

        try {
            internals.renderCompletedCardPopover(popover, card, SENTENCE, trigger, completedData());
            const toggle = popover.querySelector<HTMLButtonElement>('[data-action="mining-collapse"]')!;
            toggle.focus();
            internals.toggleMiningControls(toggle);

            internals.renderCompletedCardPopover(popover, card, SENTENCE, trigger, completedData());

            const rebuilt = popover.querySelector<HTMLButtonElement>('[data-action="mining-collapse"]')!;
            expect(rebuilt).not.toBe(toggle);
            expect(document.activeElement).toBe(rebuilt);
            expect(rebuilt.getAttribute('aria-expanded')).toBe('true');
        } finally {
            popover.remove();
            app.destroy();
        }
    });
});

// A press on a control inside a loading hover popup pins it (it must stop behaving as a
// transient hover). That press also retired the hover lookup the popup's own render was
// checked against, so the pinned popup stayed on "Loading dictionary details…" for good.
describe('a hover popup pinned by a press while it is still loading', () => {
    it('still receives its enrichment', async () => {
        const app = new ReaderApp();
        const internals = app as unknown as Internals;
        const card = testAozoraCard();
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word';
        word.textContent = card.spelling;
        document.body.append(word);
        internals.settings = SETTINGS;
        internals.parsePopoverJapanese = vi.fn(async () => undefined);
        const all = deferred<CardRenderData>();
        internals.cardRenderData = { load: () => ({ localEntries: new Promise(() => undefined), all: all.promise }), clear: () => undefined };
        internals.hoverLookupGeneration = 4;

        try {
            const shown = internals.showCard(card, SENTENCE, word, {
                trigger: 'hover', hoverLookupGeneration: 4, hoverLookupKey: 'word:1', autoPlay: false, skipInitialCardResolution: true,
            });
            await vi.waitFor(() => expect(internals.activePopover?.querySelector('[data-card-details-loading]')).not.toBeNull());
            const popover = internals.activePopover;

            // What a press on "Add to deck…" or any other control in the popup does.
            internals.cancelPendingHoverLookup();
            internals.pinActiveHoverPopoverForPendingModalLookup();
            expect(internals.activePopoverMode).toBe('modal');

            all.resolve(completedData());
            await shown;

            expect(internals.activePopover).toBe(popover);
            expect(popover.querySelector('[data-card-details-loading]')).toBeNull();
            expect(popover.querySelector('.jpdb-reader-deck-select')).not.toBeNull();
        } finally {
            word.remove();
            app.destroy();
        }
    });
});

// Study's lookup popup (the extension's Study page and the hosted and packaged Study app)
// re-rendered on every provider with no regard for the learner: the open dropdown was
// destroyed under them, focus fell to the page and the ⋯ overflow closed.
describe("Study's lookup popup while enrichment re-renders the card", () => {
    it.each(LEAVE_DROPDOWN_FOR)('keeps the learner in the dropdown through the completed and hydrated renders, then lands the newest with focus on its rebuilt %s', async (_, control) => {
        vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
        const runtime = new NewTabRuntime();
        const pendingMiss: AnkiLookupResult = { ...NOT_IN_DECK, trusted: false };
        const hydratedMiss: AnkiLookupResult = { ...NOT_IN_DECK };
        const all = deferred<ReturnType<typeof newTabLookupRenderData>>();
        const hydrated = deferred<AnkiLookupResult>();
        const internals = setupNewTabLookupRuntime(runtime, newTabLookupRenderData(), {
            settings: { ...SETTINGS, ankiEnabled: true },
            isJpdbBackedCard: () => false,
        }) as unknown as {
            cardRenderData: { load(): unknown; clear(): void };
            activeLookupPopover?: HTMLElement;
            toggleMiningControls(button: HTMLButtonElement): void;
            renderLookupPopoverContent(popover: HTMLElement, card: JPDBCard, sentence: string | undefined, data: CardRenderData & { loading: boolean }): void;
            showLookupCard(card: JPDBCard, sentence?: string): Promise<void>;
        };
        internals.cardRenderData = {
            load: () => ({ localEntries: Promise.resolve([]), all: all.promise, hydrateAnkiLookup: () => hydrated.promise }),
            clear: () => undefined,
        };
        const popover = () => internals.activeLookupPopover!;
        const host = () => popover().querySelector<HTMLElement>('.jpdb-reader-deck-select');
        const overflow = () => popover().querySelector<HTMLButtonElement>('[data-action="mining-collapse"]');
        const loading = () => popover().querySelector('[data-card-details-loading]');

        try {
            await internals.showLookupCard(newTabTestCard({ spelling: '読む', reading: 'よむ', sentence: '本を読む。' }), '本を読む。');
            await settle();
            expect(loading()).not.toBeNull();
            internals.toggleMiningControls(overflow()!);
            const opened = host()!;
            const dropdown = pickerRoot!.querySelector('select')!;
            dropdown.focus();
            expect(document.activeElement).toBe(opened);
            const renders = vi.spyOn(internals, 'renderLookupPopoverContent');

            // Enrichment completes, then the Anki detail lands: nothing rebuilds under the choice.
            all.resolve(newTabLookupRenderData({ ankiLookup: pendingMiss }));
            await settle();
            hydrated.resolve(hydratedMiss);
            await settle();
            await settle();
            expect(renders).not.toHaveBeenCalled();
            expect(host()).toBe(opened);
            expect(pickerRoot!.activeElement).toBe(dropdown);
            expect(overflow()!.getAttribute('aria-expanded')).toBe('true');
            expect(loading()).not.toBeNull();

            // Leaving: only the newest render lands, and focus stays on the rebuilt control.
            const reached = control(popover());
            reached.focus();
            await nextTask();
            expect(renders).toHaveBeenCalledTimes(1);
            expect(renders.mock.calls[0]![3]).toMatchObject({ loading: false, ankiLookup: hydratedMiss });
            expect(loading()).toBeNull();
            expect(control(popover())).not.toBe(reached);
            expect(document.activeElement).toBe(control(popover()));
            expect(overflow()!.getAttribute('aria-expanded')).toBe('true');
        } finally {
            runtime.destroy();
            vi.unstubAllGlobals();
        }
    });
});
