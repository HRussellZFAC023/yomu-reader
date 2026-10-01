// The popup's one deliberate save, "Add to deck +" (BACKLOG-V2 decisions 3
// and 6): it stays visible beside the grades instead of inside the collapsed
// mining drawer, and it appears for every word one of the learner's enabled
// collection destinations can take, whichever dictionary supplied the word.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BunproClient } from '../../src/reader/bunpro/bunpro';
import type { ReaderHttpOptions } from '../../src/reader/network/http-options';
import { createBunproSrsAdapter } from '../../src/reader/srs/bunpro';
import { LocalYomuSrsRepository } from '../../src/reader/srs/local-yomu';
import type { YomuSrsAdapter } from '../../src/reader/srs/types';
import type { CardPopoverRenderer } from '../../src/reader/cards/popover-renderer';
import { readCardCommandCapability } from '../../src/reader/dom/private-command-capabilities';
import { setInnerHtml } from '../../src/reader/dom';
import { resetActiveLearningTargetLanguage, setActiveLearningTargetLanguage } from '../../src/reader/languages/active';
import { openDeckPickerForCardAdd } from '../../src/reader/study/mining-controls';
import {
    allowSyntheticReaderInteractionsForTests,
    dispatchAuthorizedReaderControlClick,
    installTrustedReaderRootBoundary,
} from '../../src/reader/ui/trusted-interaction';
import {
    DEFAULT_SETTINGS,
    ReaderApp,
    card,
    emptyCardRenderData,
    testAnkiLookup,
    testCardActionController,
    testCardPopoverRenderer,
} from './jpdb/fixtures';
import type { JPDBCard, ReaderSettings } from './jpdb/fixtures';

const SENTENCE = '毎日ご飯を食べる。';
const WORD: JPDBCard = { ...card, meanings: [{ glosses: ['to eat'], partOfSpeech: ['v1'] }] };
// What kanji.css hides while the actions are .jpdb-reader-actions-mining-collapsed.
const COLLAPSED_DRAWER = '.jpdb-reader-mining-panel, .jpdb-reader-mining-details';
const ORDINARY_PAGE = { accountDataSurfaceTrusted: () => false };
const KEYLESS: Partial<ReaderSettings> = { interfaceLanguage: 'en', apiKey: '', jitenApiKey: '', yomuLocalSrsEnabled: true, ankiEnabled: false, enableReviews: true };
// JPDB stays connected for lookups, but the only place this learner collects
// words is Bunpro.
const BUNPRO_ONLY: Partial<ReaderSettings> = {
    interfaceLanguage: 'en',
    apiKey: 'jpdb-lookup-key',
    jitenApiKey: '',
    jpdbMiningEnabled: false,
    yomuLocalSrsEnabled: false,
    ankiEnabled: false,
    bunproMiningEnabled: true,
    bunproFrontendApiToken: 'bunpro-token',
    enableReviews: true,
};

afterEach(() => {
    allowSyntheticReaderInteractionsForTests(true);
    resetActiveLearningTargetLanguage();
    document.body.replaceChildren();
    localStorage.clear();
});

function renderActions(settings: Partial<ReaderSettings>, overrides: Parameters<typeof testCardPopoverRenderer>[1] = {}, data = emptyCardRenderData()): HTMLElement {
    const html = testCardPopoverRenderer(settings, overrides).render(WORD, SENTENCE, 'modal', data);
    setInnerHtml(document.body, `<div class="jpdb-reader-popover">${html}</div>`);
    return document.querySelector<HTMLElement>('.jpdb-reader-actions')!;
}

/** Focusable controls a learner can reach without opening the drawer, in tab order. */
function reachableControls(actions: HTMLElement): HTMLElement[] {
    return [...actions.querySelectorAll<HTMLElement>('button, select')]
        .filter(control => !control.closest(`${COLLAPSED_DRAWER}, [hidden]`));
}

function accessibleText(element: HTMLElement): string {
    const clone = element.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[aria-hidden="true"]').forEach(node => node.remove());
    return clone.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function expectCollectActionBesideGrades(actions: HTMLElement, collect: HTMLElement): void {
    expect(collect.closest(COLLAPSED_DRAWER)).toBeNull();
    expect(collect.textContent?.replace(/\s+/g, ' ').trim()).toBe('Add to deck +');
    expect(accessibleText(collect)).toBe('Add to deck');
    const reachable = reachableControls(actions);
    const next = reachable[reachable.indexOf(collect) + 1];
    expect(next?.dataset.action).toBe('grade');
}

describe('popup collect action', () => {
    it('shows "Add to deck +" beside the grades on an ordinary page without opening the drawer', () => {
        const actions = renderActions(KEYLESS, ORDINARY_PAGE);
        const collect = actions.querySelector<HTMLButtonElement>('[data-action="add-default"]')!;

        expect(collect).not.toBeNull();
        expectCollectActionBesideGrades(actions, collect);
        // The save was the drawer's only entry here, so no drawer is left to open.
        expect(actions.querySelector('[data-action="mining-collapse"]')).toBeNull();
        expect(collect.closest('.jpdb-reader-collect')?.querySelector('[data-deck-source], [data-deck-id], [data-add-deck-select]')).toBeNull();
    });

    it('keeps the Study deck picker visible while Never forget, Blacklist and Add to Anki stay in the drawer', () => {
        const actions = renderActions({ interfaceLanguage: 'en', apiKey: 'jpdb-key', jpdbMiningEnabled: true, ankiEnabled: true, enableReviews: true }, {}, emptyCardRenderData({
            ankiLookup: testAnkiLookup({ state: 'not-in-deck', notes: [], primary: null }),
        }));
        const collect = actions.querySelector<HTMLButtonElement>('[data-action="deck-picker"]')!;

        expect(actions.classList.contains('jpdb-reader-actions-mining-collapsed')).toBe(true);
        expectCollectActionBesideGrades(actions, collect);
        expect(collect.closest('.jpdb-reader-collect')?.querySelector('[data-add-deck-select]')).not.toBeNull();
        for (const action of ['neverforget', 'blacklist', 'anki']) {
            expect(actions.querySelector(`[data-action="${action}"]`)?.closest('.jpdb-reader-mining-panel')).not.toBeNull();
        }
    });

    it('opens the Study deck picker beside the button and offers only enabled destinations', () => {
        const actions = renderActions({ interfaceLanguage: 'en', apiKey: 'jpdb-key', jpdbMiningEnabled: false, yomuLocalSrsEnabled: true, ankiEnabled: true, enableReviews: true });
        const collect = actions.querySelector<HTMLButtonElement>('.jpdb-reader-collect [data-action="deck-picker"]')!;
        const picker = actions.querySelector<HTMLSelectElement>('.jpdb-reader-collect [data-add-deck-select]')!;
        // JPDB parsed the word, but JPDB mining is off, so no JPDB deck is offered.
        expect([...picker.options].map(option => option.dataset.deckSource).filter(Boolean)).toEqual(['yomu-local', 'anki']);

        const perform = vi.fn();
        expect(openDeckPickerForCardAdd(collect, WORD, SENTENCE, perform)).toBe(true);
        expect(picker.hidden).toBe(false);
        expect(collect.getAttribute('aria-expanded')).toBe('true');
        picker.selectedIndex = [...picker.options].findIndex(option => option.dataset.deckSource === 'yomu-local');
        picker.dispatchEvent(new Event('change'));
        expect(perform).toHaveBeenCalledWith(collect, WORD, SENTENCE, { kind: 'card-action', action: 'add', deckSource: 'yomu-local', deckId: 'yomu-local' });
    });

    it('offers a Bunpro-only learner the save for a JPDB-parsed word and adds it to Bunpro as vocabulary', async () => {
        const actions = renderActions(BUNPRO_ONLY, ORDINARY_PAGE);
        const collect = actions.querySelector<HTMLButtonElement>('[data-action="add-default"]')!;
        expect(collect).not.toBeNull();
        expect(actions.outerHTML).not.toContain('Bunpro');

        const request = vi.fn(async (url: string, _options?: ReaderHttpOptions) => {
            if (url.endsWith('/search/reviewables_v1_1')) {
                return { vocabs: { data: [{ id: 42, reviewable_type: 'Vocab', word: '食べる', reading: 'たべる', meaning: 'to eat' }] } };
            }
            return { ok: true };
        });
        const jpdbAddToDeck = vi.fn();
        const toast = vi.fn();
        const controller = testCardActionController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, ...BUNPRO_ONLY }),
            jpdb: { addToDeck: jpdbAddToDeck } as never,
            srsAdapters: { bunpro: createBunproSrsAdapter(new BunproClient({ getFrontendToken: () => 'bunpro-token', requestImpl: request })) },
            toast,
        });

        await expect(controller.perform(readCardCommandCapability(collect), collect, { ...WORD }, SENTENCE)).resolves.toBe(true);

        const adds = request.mock.calls.filter(([url]) => url.endsWith('/reviews/update_via_action_type'));
        expect(adds).toHaveLength(1);
        expect(JSON.parse(String(adds[0][1]?.data))).toMatchObject({ action_type: 'add', reviewables: [['Vocab', 42]] });
        expect(jpdbAddToDeck).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalledWith('Added to Bunpro.');
    });

    it('keeps Anki ahead of the default-on Yomu deck when the grading service cannot take the word', async () => {
        // JPDB parses the word but JPDB mining is off; the learner opted into Anki
        // and never switched the Yomu deck off.
        const settings = { ...DEFAULT_SETTINGS, interfaceLanguage: 'en' as const, apiKey: 'jpdb-lookup-key', jpdbMiningEnabled: false, ankiEnabled: true, yomuLocalSrsEnabled: true, localDictionariesEnabled: false, audioEnabled: false };
        const collect = renderActions(settings, ORDINARY_PAGE).querySelector<HTMLButtonElement>('[data-action="add-default"]')!;
        const addCard = vi.fn(async () => 1001);
        const mine = vi.fn(async () => ({}));
        const controller = testCardActionController({
            getSettings: () => settings,
            anki: { findExistingCards: async () => ({ primary: null, notes: [], state: 'not-in-deck' }), addCard } as never,
            srsAdapters: { 'yomu-local': { id: 'yomu-local', hasCredential: () => true, mine } as never },
            resolveMiningContext: async (word, sentence) => ({ term: word.spelling, sentence: sentence ?? '', sourceKind: 'page', sourceTitle: 'Fixture', sourceUrl: 'https://example.test', updatedAt: 0 }),
        });

        await controller.perform(readCardCommandCapability(collect), collect, { ...WORD }, SENTENCE);

        expect(addCard).toHaveBeenCalledTimes(1);
        expect(addCard).toHaveBeenCalledWith(expect.objectContaining({ spelling: '食べる' }), SENTENCE, expect.objectContaining({ deckName: settings.ankiDeck }));
        expect(mine).not.toHaveBeenCalled();
    });

    it('offers no save when the only destination cannot take the word', () => {
        const expired = { ...BUNPRO_ONLY, bunproFrontendApiTokenExpiresAt: '2020-01-01T00:00:00Z' };
        expect(renderActions(expired, ORDINARY_PAGE).querySelector('[data-action="add-default"]')).toBeNull();
        const sentenceCard = { ...WORD, bunproReviewableType: 'sentence' as const };
        const html = testCardPopoverRenderer(BUNPRO_ONLY, ORDINARY_PAGE).render(sentenceCard, SENTENCE, 'modal', emptyCardRenderData());
        expect(html).not.toContain('data-action="add-default"');
    });

    it('saves exactly once to the local deck, without scheduling it, and only on trusted input', async () => {
        setActiveLearningTargetLanguage('ja');
        allowSyntheticReaderInteractionsForTests(false);
        const boundary = new AbortController();
        installTrustedReaderRootBoundary(document, boundary.signal);
        const app = new ReaderApp();
        const internals = app as unknown as {
            settings: ReaderSettings;
            cardPopoverRenderer: CardPopoverRenderer;
            yomuLocalSrs: YomuSrsAdapter;
            showCard: () => Promise<void>;
            toast: (message: string) => void;
            installCardPopoverHandlers(popover: HTMLElement, card: JPDBCard, sentence: string | undefined, anchor: HTMLElement | undefined, trigger: 'modal' | 'hover'): void;
        };
        internals.settings = { ...DEFAULT_SETTINGS, ...KEYLESS };
        internals.showCard = vi.fn(async () => undefined);
        const toast = vi.fn();
        internals.toast = toast;
        const mine = vi.spyOn(internals.yomuLocalSrs, 'mine');
        const review = vi.spyOn(internals.yomuLocalSrs, 'review');
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        setInnerHtml(popover, internals.cardPopoverRenderer.render(WORD, SENTENCE, 'modal', emptyCardRenderData()));
        document.body.append(popover);
        internals.installCardPopoverHandlers(popover, WORD, SENTENCE, undefined, 'modal');
        const collect = popover.querySelector<HTMLButtonElement>('.jpdb-reader-collect [data-action="add-default"]')!;
        try {
            collect.click();
            await new Promise(resolve => setTimeout(resolve, 20));
            expect(mine).not.toHaveBeenCalled();

            dispatchAuthorizedReaderControlClick(collect);
            await vi.waitFor(() => expect(toast).toHaveBeenCalledWith('Added to Academy.'));

            expect(mine).toHaveBeenCalledTimes(1);
            expect(review).not.toHaveBeenCalled();
            const saved = Object.values((await new LocalYomuSrsRepository().snapshot()).cards);
            expect(saved).toHaveLength(1);
            expect(saved[0]).toMatchObject({ expression: '食べる', reading: 'たべる', sentence: SENTENCE, reviewEnabled: false });
            expect((await new LocalYomuSrsRepository().queue()).cards).toEqual([]);
        } finally {
            boundary.abort();
            app.destroy();
        }
    });
});
