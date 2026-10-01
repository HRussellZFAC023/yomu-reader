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
import { runCardActionOperation } from '../../src/reader/cards/action-operation';
import { userFacingErrorText } from '../../src/reader/app/user-facing-errors';
import { readCardCommandCapability } from '../../src/reader/dom/private-command-capabilities';
import { setInnerHtml } from '../../src/reader/dom';
import { resetActiveLearningTargetLanguage, setActiveLearningTargetLanguage } from '../../src/reader/languages/active';
import { openDeckPickerForCardAdd } from '../../src/reader/study/mining-controls';
import { reviewGradeScale } from '../../src/reader/cards/grade-scale';
import { renderNewTabLookupReviewControls } from '../../src/reader/newtab/lookup-dom';
import type { NewTabLookupReviewTarget } from '../../src/reader/newtab/review-controls';
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
import { NewTabRuntime, newTabLookupRenderData, newTabTestCard, setupNewTabLookupRuntime } from './new-tab-review/fixtures';

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

const STUDY_REVIEW_TARGETS: NewTabLookupReviewTarget[] = [
    { id: 'jpdb', kind: 'jpdb', label: 'Grades JPDB', shortLabel: 'JPDB' },
    { id: 'anki:404', kind: 'anki', label: 'Grades Anki', shortLabel: 'Anki', ankiCardId: 404 },
];

afterEach(() => {
    allowSyntheticReaderInteractionsForTests(true);
    resetActiveLearningTargetLanguage();
    document.body.replaceChildren();
    localStorage.clear();
});

function renderActions(settings: Partial<ReaderSettings>, overrides: Parameters<typeof testCardPopoverRenderer>[1] = {}, data = emptyCardRenderData(), word = WORD): HTMLElement {
    const html = testCardPopoverRenderer(settings, overrides).render(word, SENTENCE, 'modal', data);
    setInnerHtml(document.body, `<div class="jpdb-reader-popover">${html}</div>`);
    return document.querySelector<HTMLElement>('.jpdb-reader-actions')!;
}

/** Focusable controls a learner can reach without opening the drawer, in tab order. */
function reachableControls(actions: HTMLElement): HTMLElement[] {
    const collapsed = actions.classList.contains('jpdb-reader-actions-mining-collapsed');
    return [...actions.querySelectorAll<HTMLElement>('button, select')]
        .filter(control => !control.closest('[hidden]') && !(collapsed && control.closest(COLLAPSED_DRAWER)));
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
        // The page can read the toast, so it does not say where the word went.
        expect(toast).toHaveBeenCalledWith('Added to deck.');
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

    it('tells the learner why a save could not happen, in their language', async () => {
        // Through the shared card-action lifecycle, as the popup reports a failed save.
        const toasts = async (error: unknown): Promise<string[]> => {
            const toast = vi.fn();
            for (const language of ['en', 'ja'] as const) {
                await runCardActionOperation(document.createElement('button'), () => Promise.reject(error),
                    { logger: { warn: () => undefined }, warning: 'Card action failed', action: 'add-default', term: WORD.spelling, language, toast }, () => undefined);
            }
            return toast.mock.calls.map(([message]) => String(message));
        };
        const collect = renderActions(BUNPRO_ONLY, ORDINARY_PAGE).querySelector<HTMLButtonElement>('[data-action="add-default"]')!;
        // Bunpro's catalogue has no vocabulary item for this word.
        const request = vi.fn(async (url: string) => url.endsWith('/search/reviewables_v1_1') ? { vocabs: { data: [] } } : { ok: true });
        const bunproOnlyServices = {
            getSettings: () => ({ ...DEFAULT_SETTINGS, ...BUNPRO_ONLY }),
            srsAdapters: { bunpro: createBunproSrsAdapter(new BunproClient({ getFrontendToken: () => 'bunpro-token', requestImpl: request })) },
        };
        const bunproOnly = testCardActionController(bunproOnlyServices);
        const notInBunpro = await bunproOnly.perform(readCardCommandCapability(collect), collect, { ...WORD }, SENTENCE).catch((error: unknown) => error);
        // On an ordinary page the reason names no service; Study says Bunpro has no entry.
        expect(await toasts(notInBunpro)).toEqual([
            'This word was not saved. Try again, or open Study for details.',
            'この単語は保存されませんでした。もう一度お試しいただくか、Studyで詳細を確認してください。',
        ]);
        const onStudy = testCardActionController({ ...bunproOnlyServices, accountDataSurfaceTrusted: () => true });
        expect(await toasts(await onStudy.perform(readCardCommandCapability(collect), collect, { ...WORD }, SENTENCE).catch((error: unknown) => error)))
            .toEqual(['Bunpro has no entry for this word.', 'この単語はBunproに見つかりませんでした。']);
        expect(request.mock.calls.filter(([url]) => url.endsWith('/reviews/update_via_action_type'))).toHaveLength(0);

        // Bunpro was switched off after the popup offered the save.
        const switchedOff = testCardActionController({ getSettings: () => ({ ...DEFAULT_SETTINGS, ...BUNPRO_ONLY, bunproMiningEnabled: false }) });
        const noDestination = await switchedOff.perform(readCardCommandCapability(collect), collect, { ...WORD }, SENTENCE).catch((error: unknown) => error);
        expect(await toasts(noDestination)).toEqual([
            'None of your decks can take this word. Turn one on in Settings.',
            'この単語を追加できるデッキがありません。設定でデッキを有効にしてください。',
        ]);
    });

    // A default dual-key learner: JPDB parses the word, Jiten is the preferred
    // grading service. The save goes where the grade beside it goes (ADR-0016),
    // found there the way a grade finds it, and never lands on the other service.
    describe('with both JPDB and Jiten connected', () => {
        const DUAL_KEY: Partial<ReaderSettings> = { interfaceLanguage: 'en', apiKey: 'jpdb-key', jitenApiKey: 'jiten-key', jpdbMiningEnabled: true, yomuLocalSrsEnabled: true, ankiEnabled: false, enableReviews: true };
        const isJpdbBackedCard = (word: JPDBCard): boolean => word.source === 'jpdb';
        const JPDB_WORD: JPDBCard = { ...WORD, source: 'jpdb', vid: 777, sid: 1 };
        const JITEN_WORD: JPDBCard = { ...WORD, source: 'jiten', vid: 0, sid: 0, jitenWordId: 9001, jitenReadingIndex: 0, cardState: ['new'] };
        const token = (word: JPDBCard) => ({ card: word, start: 0, end: 3, length: 3, rubies: [], pitchClass: '', sentence: word.spelling });

        function dualKeyController(grading: 'jpdb' | 'jiten', found: { jpdb?: JPDBCard; jiten?: JPDBCard } = {}) {
            const services = {
                jpdb: { addToDeck: vi.fn(async () => undefined), parse: vi.fn(async (terms: string[]) => terms.map(() => found.jpdb ? [token(found.jpdb)] : [])) },
                jiten: { addToStudyDeck: vi.fn(async () => undefined), listStudyDecks: async () => [{ id: 12, name: 'Mining' }], parse: vi.fn(async (terms: string[]) => terms.map(() => found.jiten ? [token(found.jiten)] : [])) },
            };
            const settings = { ...DEFAULT_SETTINGS, ...DUAL_KEY, apiGradingProvider: grading };
            const controller = testCardActionController({ getSettings: () => settings, isJpdbBackedCard, jpdb: services.jpdb as never, jiten: services.jiten as never,
                resolveMiningContext: async (word, sentence) => ({ term: word.spelling, sentence: sentence ?? '', sourceKind: 'page', sourceTitle: 'Fixture', sourceUrl: 'https://example.test', updatedAt: 0 }) });
            return { controller, ...services, settings };
        }

        function saveFromOrdinaryPage(grading: 'jpdb' | 'jiten', word: JPDBCard): HTMLButtonElement {
            return renderActions({ ...DUAL_KEY, apiGradingProvider: grading }, { ...ORDINARY_PAGE, isJpdbBackedCard }, emptyCardRenderData(), word)
                .querySelector<HTMLButtonElement>('[data-action="add-default"]')!;
        }

        it('saves a JPDB-parsed word to Jiten, the service its grades go to', async () => {
            const collect = saveFromOrdinaryPage('jiten', JPDB_WORD);
            const f = dualKeyController('jiten', { jiten: JITEN_WORD });

            await f.controller.perform(readCardCommandCapability(collect), collect, { ...JPDB_WORD }, SENTENCE);

            expect(f.jiten.parse.mock.calls).toEqual([[['食べる']]]);
            expect(f.jiten.addToStudyDeck).toHaveBeenCalledTimes(1);
            expect(f.jiten.addToStudyDeck).toHaveBeenCalledWith('12', expect.objectContaining({ jitenWordId: 9001, spelling: '食べる', reading: 'たべる' }), SENTENCE, expect.anything());
            expect(f.jpdb.addToDeck).not.toHaveBeenCalled();
        });

        it('saves nothing anywhere when the grading service does not have the word', async () => {
            const collect = saveFromOrdinaryPage('jiten', JPDB_WORD);
            const f = dualKeyController('jiten');

            const refused = await f.controller.perform(readCardCommandCapability(collect), collect, { ...JPDB_WORD }, SENTENCE).catch((error: unknown) => error);

            expect(userFacingErrorText('en', 'actionFailed', refused)).toBe('Not saved: this word was not found in your preferred grading service.');
            expect(userFacingErrorText('ja', 'actionFailed', refused)).toBe('優先採点サービスでこの単語が見つからなかったため、保存していません。');
            expect(f.jiten.addToStudyDeck).not.toHaveBeenCalled();
            expect(f.jpdb.addToDeck).not.toHaveBeenCalled();
        });

        it('saves a Jiten-parsed word to JPDB when JPDB grades', async () => {
            const collect = saveFromOrdinaryPage('jpdb', JITEN_WORD);
            const f = dualKeyController('jpdb', { jpdb: JPDB_WORD });

            await f.controller.perform(readCardCommandCapability(collect), collect, { ...JITEN_WORD }, SENTENCE);

            expect(f.jpdb.parse.mock.calls).toEqual([[['食べる']]]);
            expect(f.jpdb.addToDeck).toHaveBeenCalledWith(DEFAULT_SETTINGS.miningDeck, expect.objectContaining({ vid: 777, source: 'jpdb' }), SENTENCE);
            expect(f.jiten.addToStudyDeck).not.toHaveBeenCalled();
        });

        it('offers the decks of the service the Study grade row names, and follows the ⇄ toggle', async () => {
            const decks = emptyCardRenderData({
                jpdbDecks: [{ id: 'forq', name: 'FORQ' }, { id: 'mining', name: 'Mining JPDB' }] as never,
                jitenDecks: [{ id: '12', name: 'Mining' }],
            });
            const offered = (word: JPDBCard): string[] => [...renderActions({ ...DUAL_KEY, apiGradingProvider: 'jiten' }, { isJpdbBackedCard }, decks, word)
                .querySelectorAll<HTMLOptionElement>('.jpdb-reader-collect option[data-deck-source]')].map(option => option.dataset.deckSource!);
            const grades = (): string[] => [...document.querySelectorAll<HTMLButtonElement>('.jpdb-reader-actions [data-action="grade"]')]
                .map(button => readCardCommandCapability(button)?.reviewTarget ?? '');

            expect(new Set(offered(JPDB_WORD))).toEqual(new Set(['jiten', 'yomu-local']));
            expect(new Set(grades())).toEqual(new Set(['jiten']));

            // ⇄ to JPDB for this word: the deck choice switches with the grades.
            expect(new Set(offered({ ...JPDB_WORD, apiGradingProviderOverride: 'jpdb' }))).toEqual(new Set(['jpdb', 'yomu-local']));
            expect(new Set(grades())).toEqual(new Set(['jpdb']));

            // The chosen Jiten deck receives the word found on Jiten.
            const picker = document.querySelector<HTMLButtonElement>('.jpdb-reader-collect [data-action="deck-picker"]');
            expect(picker).not.toBeNull();
            const f = dualKeyController('jiten', { jiten: JITEN_WORD });
            await f.controller.perform({ kind: 'card-action', action: 'add', deckSource: 'jiten', deckId: '12' }, picker!, { ...JPDB_WORD }, SENTENCE);
            expect(f.jiten.addToStudyDeck).toHaveBeenCalledWith('12', expect.objectContaining({ jitenWordId: 9001 }), SENTENCE, expect.anything());
            expect(f.jpdb.addToDeck).not.toHaveBeenCalled();
        });
    });

    it('offers no save when the only destination cannot take the word', () => {
        const expired = { ...BUNPRO_ONLY, bunproFrontendApiTokenExpiresAt: '2020-01-01T00:00:00Z' };
        expect(renderActions(expired, ORDINARY_PAGE).querySelector('[data-action="add-default"]')).toBeNull();
        const sentenceCard = { ...WORD, bunproReviewableType: 'sentence' as const };
        const html = testCardPopoverRenderer(BUNPRO_ONLY, ORDINARY_PAGE).render(sentenceCard, SENTENCE, 'modal', emptyCardRenderData());
        expect(html).not.toContain('data-action="add-default"');
    });

    it('offers no save on a trusted surface when no enabled destination can take the word', () => {
        // WaniKani grades its own due assignments but has no API to add a word.
        const wanikaniOnly: Partial<ReaderSettings> = { interfaceLanguage: 'en', apiKey: '', jitenApiKey: '', yomuLocalSrsEnabled: false, ankiEnabled: false, bunproMiningEnabled: false, wanikaniReviewEnabled: true, wanikaniApiToken: 'wanikani-token', enableReviews: true };
        const assignment: JPDBCard = { ...WORD, source: 'wanikani', wanikaniSubjectId: 1, wanikaniAssignmentId: 7 };
        expect(renderActions(wanikaniOnly, {}, emptyCardRenderData(), assignment).querySelector('.jpdb-reader-collect')).toBeNull();

        // A Jiten-only learner saves into a Jiten study deck, so the save waits until there is one.
        const jitenOnly: Partial<ReaderSettings> = { interfaceLanguage: 'en', apiKey: '', jitenApiKey: 'jiten-key', jpdbMiningEnabled: true, yomuLocalSrsEnabled: false, ankiEnabled: false, enableReviews: true };
        const jitenWord: JPDBCard = { ...WORD, source: 'jiten', jitenWordId: 9, jitenReadingIndex: 0 };
        expect(renderActions(jitenOnly, {}, emptyCardRenderData({ jitenDecks: [] }), jitenWord).querySelector('.jpdb-reader-collect')).toBeNull();
        const withDeck = renderActions(jitenOnly, {}, emptyCardRenderData({ jitenDecks: [{ id: 'study', name: 'Mining' }] }), jitenWord);
        expect(withDeck.querySelector('.jpdb-reader-collect [data-add-deck-select] [data-deck-source="jiten"]')).not.toBeNull();
    });

    it('saves straight to Bunpro or the Yomu deck only when it is the default and the only choice', () => {
        const collectRow = (settings: Partial<ReaderSettings>, word = WORD): HTMLElement => renderActions(settings, {}, emptyCardRenderData(), word).querySelector<HTMLElement>('.jpdb-reader-collect')!;
        const offered = (row: HTMLElement): Array<string | undefined> => [...row.querySelectorAll<HTMLOptionElement>('option[data-deck-source]')].map(option => option.dataset.deckSource);

        // JPDB grades this word, but the learner collects only into the Yomu deck, or only into Bunpro.
        const yomuOnly = collectRow({ interfaceLanguage: 'en', apiKey: 'jpdb-lookup-key', jpdbMiningEnabled: false, yomuLocalSrsEnabled: true, ankiEnabled: false, enableReviews: true });
        const bunproOnly = collectRow(BUNPRO_ONLY);
        expect(yomuOnly.querySelector('button')?.dataset).toMatchObject({ action: 'add', deckSource: 'yomu-local' });
        expect(bunproOnly.querySelector('button')?.dataset).toMatchObject({ action: 'add', deckSource: 'bunpro' });
        // No one-choice picker sits beside a direct save for a runtime to open instead.
        expect([yomuOnly, bunproOnly].map(row => row.querySelector('[data-add-deck-select]'))).toEqual([null, null]);

        // A sentence from the learner's Bunpro reviews: Bunpro grades it, only Anki can save it.
        const sentence: JPDBCard = { ...WORD, source: 'bunpro', bunproReviewableType: 'sentence', bunproReviewId: '5', bunproReviewSessionId: '9', bunproReviewInputMode: 'regular', bunproReviewEndpoint: 'review' };
        const ankiOnly = collectRow({ ...BUNPRO_ONLY, apiKey: '', ankiEnabled: true }, sentence);
        expect(ankiOnly.querySelector('button')?.dataset.action).toBe('deck-picker');
        expect(offered(ankiOnly)).toEqual(['anki']);

        // Jiten grades and takes this word, but its study decks have not loaded:
        // the save waits in the picker instead of going to the Yomu deck.
        const jitenWord: JPDBCard = { ...WORD, source: 'jiten', jitenWordId: 9, jitenReadingIndex: 0 };
        const jitenLoading = collectRow({ interfaceLanguage: 'en', apiKey: '', jitenApiKey: 'jiten-key', jpdbMiningEnabled: true, yomuLocalSrsEnabled: true, ankiEnabled: false, enableReviews: true }, jitenWord);
        expect(jitenLoading.querySelector('button')?.dataset.action).toBe('deck-picker');
        expect(offered(jitenLoading)).toEqual(['yomu-local']);
    });

    // Study grades its current review card from that card's lookup popover. While
    // the popover loads, Study's own grade row stands in; with two review targets
    // it carries the ⇄ target bar that sits over the action row.
    it.each([
        ['a JPDB learner', { interfaceLanguage: 'en', apiKey: 'jpdb-key', jpdbMiningEnabled: true, ankiEnabled: true, enableReviews: true }],
        ['a Yomu-deck learner', KEYLESS],
    ] as Array<[string, Partial<ReaderSettings>]>)('keeps one Study target bar over the row and the save before the grades for %s', (_learner, learner) => {
        const settings = { ...DEFAULT_SETTINGS, ...learner };
        const actions = renderActions(settings, {
            renderReviewButtonsFallback: () => renderNewTabLookupReviewControls(reviewGradeScale(settings, 'standard').grades, STUDY_REVIEW_TARGETS, { settings, card: WORD }),
        }, emptyCardRenderData({ loading: true }));

        expect(actions.querySelectorAll('.jpdb-reader-actions-gutter')).toHaveLength(1);
        expect(actions.querySelectorAll('[data-action="mining-collapse"]')).toHaveLength(1);
        // The collapsed drawer leaves room for the bar and hides the target selector.
        expect(actions.classList.contains('jpdb-reader-actions-has-mining')).toBe(true);
        expect(actions.classList.contains('jpdb-reader-actions-mining-collapsed')).toBe(true);
        expectCollectActionBesideGrades(actions, actions.querySelector<HTMLElement>('.jpdb-reader-collect .jpdb-reader-mining-title')!);
    });

    // Study's lookup popup is a trusted surface: a learner whose only deck is
    // Academy saves there with one press, as on an ordinary page.
    it('saves straight to Academy from a Study lookup popup, opening no picker', async () => {
        vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
        const runtime = new NewTabRuntime();
        const internals = setupNewTabLookupRuntime(runtime, newTabLookupRenderData(), {
            settings: { ...KEYLESS, enableReviews: true },
            isJpdbBackedCard: () => false,
        }) as ReturnType<typeof setupNewTabLookupRuntime> & { activeLookupPopover?: HTMLElement };
        try {
            await internals.showLookupCard(newTabTestCard({ spelling: '読む', reading: 'よむ', sentence: '本を読む。' }), '本を読む。');
            const save = internals.activeLookupPopover!.querySelector<HTMLButtonElement>('.jpdb-reader-collect [data-action="add"]')!;
            expect(save.dataset.deckSource).toBe('yomu-local');
            save.click();

            await vi.waitFor(async () => expect(Object.values((await new LocalYomuSrsRepository().snapshot()).cards)).toHaveLength(1));
            await vi.waitFor(() => expect([...document.querySelectorAll('.jpdb-reader-toast')].map(toast => toast.textContent)).toContain('Added to Academy.'));
            expect(document.querySelector('.jpdb-reader-add-deck-select-open, [data-add-deck-select]')).toBeNull();
        } finally {
            runtime.destroy();
            vi.unstubAllGlobals();
        }
    });

    it('saves exactly once to the local deck, without scheduling it, only on trusted input, and keeps keyboard focus on it', async () => {
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
        const toast = vi.fn();
        internals.toast = toast;
        const mine = vi.spyOn(internals.yomuLocalSrs, 'mine');
        const review = vi.spyOn(internals.yomuLocalSrs, 'review');
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.dataset.jpdbReaderRoot = 'true';
        const renderPopover = (): void => setInnerHtml(popover, internals.cardPopoverRenderer.render(WORD, SENTENCE, 'modal', emptyCardRenderData()));
        // Like the real refresh after a save, this re-renders the popup, replacing
        // the save button, and focuses the popup itself.
        popover.tabIndex = -1;
        internals.showCard = vi.fn(async () => {
            renderPopover();
            popover.focus();
        });
        renderPopover();
        document.body.append(popover);
        internals.installCardPopoverHandlers(popover, WORD, SENTENCE, undefined, 'modal');
        const collect = popover.querySelector<HTMLButtonElement>('.jpdb-reader-collect [data-action="add-default"]')!;
        try {
            collect.click();
            await new Promise(resolve => setTimeout(resolve, 20));
            expect(mine).not.toHaveBeenCalled();

            collect.focus();
            dispatchAuthorizedReaderControlClick(collect);
            await vi.waitFor(() => expect(toast).toHaveBeenCalledWith('Added to deck.'));
            // A keyboard learner keeps their place on the refreshed save.
            const refreshed = popover.querySelector('.jpdb-reader-collect [data-action="add-default"]');
            expect(refreshed).not.toBe(collect);
            await vi.waitFor(() => expect(document.activeElement).toBe(refreshed));

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
