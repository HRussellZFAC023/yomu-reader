import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_SETTINGS,
    ReaderApp,
    deferred,
    registerReaderHelpersCleanup,
    testAozoraCard,
} from './jpdb/fixtures';
import type { AnkiLookupResult, CardRenderData, JPDBCard, YomitanTermEntry } from './jpdb/fixtures';
import type { CardCommandCapability } from '../../src/reader/dom/private-command-capabilities';
import { dispatchAuthorizedReaderControlEvent } from '../../src/reader/ui/trusted-interaction';

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
    apiKey: '',
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

describe.each(['modal', 'hover'] as const)('%s popup actions while enrichment re-renders the card', trigger => {
    it('does not rebuild under the open "Add to deck…" dropdown, saves the chosen deck, then catches up', async () => {
        const app = new ReaderApp();
        const internals = app as unknown as Internals;
        const card = testAozoraCard();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        document.body.append(popover);
        internals.activePopover = popover;
        internals.settings = SETTINGS;
        internals.parsePopoverJapanese = vi.fn(async () => undefined);
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

            // Leaving the dropdown lets the newest render in, with the overflow still open.
            dropdown.blur();
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

    it('keeps an open overflow across a re-render while the learner is not in the dropdown', async () => {
        const app = new ReaderApp();
        const internals = app as unknown as Internals;
        const card = testAozoraCard();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        document.body.append(popover);
        internals.activePopover = popover;
        internals.settings = SETTINGS;
        internals.parsePopoverJapanese = vi.fn(async () => undefined);

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
        const app = new ReaderApp();
        const internals = app as unknown as Internals;
        const card = testAozoraCard();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        document.body.append(popover);
        internals.activePopover = popover;
        internals.settings = SETTINGS;
        internals.parsePopoverJapanese = vi.fn(async () => undefined);

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
