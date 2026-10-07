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
 * and "Add to deck…" while the popup is still loading, then a provider lands and the
 * popup re-renders its HTML. The overflow, the private picker and focus must still be
 * where the learner left them, on the controls the re-render put in place.
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
    handleCardAction: (button: HTMLButtonElement, card: JPDBCard, sentence: string | undefined, command: CardCommandCapability) => Promise<void>;
    toggleMiningControls(button: HTMLButtonElement): void;
    openDeckPickerForAdd(button: HTMLButtonElement, card: JPDBCard, sentence: string | undefined): boolean;
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
};

let pickerRoot: ShadowRoot | undefined;
let frames: FrameRequestCallback[] = [];
beforeEach(() => {
    const attach = Element.prototype.attachShadow;
    vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (this: Element, init) {
        const root = attach.call(this, init);
        if (this.classList.contains('jpdb-reader-deck-picker')) pickerRoot = root;
        return root;
    });
    frames = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => frames.push(callback));
});
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
    it('keeps the open overflow, the open deck picker and its focus, and saves through the live button', async () => {
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
        const add = () => popover.querySelector<HTMLButtonElement>('[data-action="deck-picker"]');
        const overflow = () => popover.querySelector<HTMLButtonElement>('[data-action="mining-collapse"]');

        try {
            internals.renderDeferredCardLocalEntries(
                popover, card, SENTENCE, trigger,
                { localEntries: localEntries.promise, jpdbVocabularyInfo: jpdbVocabularyInfo.promise, all: deferred<CardRenderData>().promise },
                NOT_IN_DECK, { instantLocalEntries: null, requestId: 1 }, { fullRenderCompleted: false }, () => true,
            );
            localEntries.resolve([]);
            await settle();
            flushFrames();
            expect(popover.querySelector('[data-card-details-loading]')).not.toBeNull();

            // The learner, still during loading: ⋯, then "Add to deck…".
            internals.toggleMiningControls(overflow()!);
            expect(internals.openDeckPickerForAdd(add()!, card, SENTENCE)).toBe(true);
            const host = add()!.nextElementSibling as HTMLElement;
            expect(host.matches('.jpdb-reader-deck-picker')).toBe(true);
            const picker = pickerRoot!.querySelector('select')!;
            const expectStillOpen = (label: string) => {
                const button = add()!;
                expect(button.closest('.jpdb-reader-actions')!.classList.contains('jpdb-reader-actions-mining-collapsed'), label).toBe(false);
                expect(overflow()!.getAttribute('aria-expanded'), label).toBe('true');
                expect(button.getAttribute('aria-expanded'), label).toBe('true');
                expect(button.nextElementSibling, label).toBe(host);
                expect(popover.querySelectorAll('.jpdb-reader-deck-picker'), label).toHaveLength(1);
                expect(document.activeElement, label).toBe(host);
                expect(pickerRoot!.activeElement, label).toBe(picker);
            };
            expectStillOpen('picker opened');

            // A provider lands: the loading card re-renders.
            const loadingAdd = add();
            jpdbVocabularyInfo.resolve(null);
            await settle();
            flushFrames();
            expect(add(), 'the loading re-render replaced the row').not.toBe(loadingAdd);
            expectStillOpen('after a loading re-render');

            // Enrichment completes.
            internals.renderCompletedCardPopover(popover, card, SENTENCE, trigger, completedData());
            flushFrames();
            expect(popover.querySelector('[data-card-details-loading]')).toBeNull();
            expectStillOpen('after the completed render');

            // The picker the learner kept open still saves, through the button now on screen.
            await new Promise(resolve => setTimeout(resolve, 250));
            expect(add()!.nextElementSibling, 'the carried picker survived its blur check').toBe(host);
            picker.selectedIndex = 1;
            dispatchAuthorizedReaderControlEvent(picker, new Event('change'));
            expect(handleCardAction).toHaveBeenCalledTimes(1);
            const [savedFrom, , , command] = handleCardAction.mock.calls[0] as unknown as Parameters<Internals['handleCardAction']>;
            expect(savedFrom).toBe(add());
            expect(savedFrom.isConnected).toBe(true);
            expect(command).toMatchObject({ kind: 'card-action', action: 'add', deckSource: 'yomu-local' });
            expect(add()!.getAttribute('aria-expanded')).toBe('false');
            expect(popover.querySelector('.jpdb-reader-deck-picker')).toBeNull();
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
