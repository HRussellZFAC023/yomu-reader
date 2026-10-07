// Jiten takes a single saved word only into a word list (StudyDeckType 2,
// StaticWordList); its media, frequency and smart study decks answer 400
// "Words can only be added in static word list decks." "Add to deck…" and
// subtitle "Add selected" save to the learner's first word list in their Jiten
// deck order, and Study's deck picker offers only word lists. A learner with no
// word list cannot save to Jiten, so the save goes to the next destination
// (ADR-0016), and Study tells them to make one.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JitenApiClient } from '../../src/reader/dictionaries/jiten';
import { readCardUiCommandCapability, type CardCommandCapability } from '../../src/reader/dom/private-command-capabilities';
import { setInnerHtml } from '../../src/reader/dom';
import { DEFAULT_SETTINGS, card, emptyCardRenderData, testCardActionController, testCardPopoverRenderer, testCardRenderDataLoader } from './jpdb/fixtures';
import type { JPDBCard, ReaderSettings } from './jpdb/fixtures';
import type { CardRenderData, CardRenderDataLoaderDependencies } from '../../src/reader/cards/render-data';
import { NewTabRuntime } from '../../src/reader/newtab/runtime';

const SENTENCE = '毎日ご飯を食べる。';
const WORD: JPDBCard = { ...card, meanings: [{ glosses: ['to eat'], partOfSpeech: ['v1'] }] };
const JITEN_WORD: JPDBCard = { ...WORD, source: 'jiten', vid: 0, sid: 0, jitenWordId: 9001, jitenReadingIndex: 0, cardState: ['new'] };
const JPDB_WORD: JPDBCard = { ...WORD, source: 'jpdb', vid: 777, sid: 1 };
const isJpdbBackedCard = (word: JPDBCard): boolean => word.source === 'jpdb';
// srs/reader-study-decks, in the learner's Jiten order.
const DECKS = [
    { userStudyDeckId: 3, name: 'Frieren', deckType: 0 },
    { userStudyDeckId: 5, name: 'Top 5k', deckType: 1 },
    { userStudyDeckId: 7, name: 'Smart', deckType: 3 },
    { userStudyDeckId: 9, name: 'Mined words', deckType: 2 },
    { userStudyDeckId: 11, name: 'Core list', deckType: 2 },
];
const NO_WORD_LIST = DECKS.filter(deck => deck.deckType !== 2);
const JITEN_ONLY: ReaderSettings = { ...DEFAULT_SETTINGS, interfaceLanguage: 'en', apiKey: '', jitenApiKey: 'jiten-key', jpdbMiningEnabled: true, ankiEnabled: false, yomuLocalSrsEnabled: false, enableReviews: true };
const WITH_YOMU_DECK: ReaderSettings = { ...JITEN_ONLY, yomuLocalSrsEnabled: true };
const DUAL_KEY: ReaderSettings = { ...WITH_YOMU_DECK, apiKey: 'jpdb-key', apiGradingProvider: 'jiten' };

afterEach(() => document.body.replaceChildren());

function renderPopup(settings: ReaderSettings, word: JPDBCard, data: CardRenderData & { loading: boolean }, trusted: boolean): HTMLElement {
    const html = testCardPopoverRenderer(settings, { accountDataSurfaceTrusted: () => trusted, isJpdbBackedCard }).render(word, SENTENCE, 'modal', data);
    setInnerHtml(document.body, `<div class="jpdb-reader-popover">${html}</div>`);
    return document.querySelector<HTMLElement>('.jpdb-reader-actions')!;
}

function ordinaryPageSave(settings: ReaderSettings, word: JPDBCard, decks = DECKS): HTMLButtonElement {
    const jitenDecks = decks.filter(deck => deck.deckType === 2).map(deck => ({ id: String(deck.userStudyDeckId), name: deck.name }));
    return renderPopup(settings, word, emptyCardRenderData({ jitenDecks }), false).querySelector<HTMLButtonElement>('.jpdb-reader-deck-select')!;
}
function choices(actions: HTMLElement) {
    const button = actions.querySelector('.jpdb-reader-deck-select');
    return button ? readCardUiCommandCapability(button)?.choices ?? [] : [];
}
function selectedCommand(button: Element): CardCommandCapability {
    const choice = readCardUiCommandCapability(button)!.choices![0]!;
    return { kind: 'card-action', action: 'add', deckSource: choice.source, deckId: choice.id };
}

// An Error stands for srs/reader-study-decks failing.
function jitenController(settings: ReaderSettings, decks: typeof DECKS | Error) {
    const addToStudyDeck = vi.fn(async (_deck: string, _word: JPDBCard) => undefined);
    const listReaderStudyDecks = vi.fn(async () => {
        if (decks instanceof Error) throw decks;
        return decks;
    });
    const mine = vi.fn(async (_request: { expression: string }) => ({}));
    const jpdbAdd = vi.fn(async () => undefined);
    const toast = vi.fn();
    const controller = testCardActionController({
        getSettings: () => settings, isJpdbBackedCard, accountDataSurfaceTrusted: () => false, toast,
        jiten: { addToStudyDeck, listReaderStudyDecks } as never,
        jpdb: { addToDeck: jpdbAdd } as never,
        srsAdapters: { 'yomu-local': { id: 'yomu-local', hasCredential: () => true, mine } as never },
        resolveMiningContext: async () => null as never,
    });
    return { controller, addToStudyDeck, listReaderStudyDecks, mine, jpdbAdd, toast };
}

describe('saving to Jiten', () => {
    it('reads each study deck\'s type from Jiten', async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify([DECKS[0], DECKS[3], { userStudyDeckId: 12, name: 'Untyped' }])));
        const client = new JitenApiClient(() => 'jiten-key', { fetchImpl: fetchImpl as never });

        await expect(client.listReaderStudyDecks()).resolves.toEqual([
            { userStudyDeckId: 3, name: 'Frieren', deckType: 0 },
            { userStudyDeckId: 9, name: 'Mined words', deckType: 2 },
            { userStudyDeckId: 12, name: 'Untyped' },
        ]);
    });

    it('"Add to deck…" on a page saves to the first word list, past media, frequency and smart decks', async () => {
        const collect = ordinaryPageSave(JITEN_ONLY, JITEN_WORD);
        const f = jitenController(JITEN_ONLY, DECKS);

        await f.controller.perform(selectedCommand(collect), collect, { ...JITEN_WORD }, SENTENCE);

        expect(f.addToStudyDeck).toHaveBeenCalledTimes(1);
        expect(f.addToStudyDeck).toHaveBeenCalledWith('9', expect.objectContaining({ jitenWordId: 9001 }), SENTENCE, expect.anything());
        expect(f.toast).toHaveBeenCalledWith('Added to deck.');
    });

    it('with no word list, a page save goes to the next destination, the Yomu deck', async () => {
        const collect = ordinaryPageSave(WITH_YOMU_DECK, JITEN_WORD, NO_WORD_LIST);
        const f = jitenController(WITH_YOMU_DECK, NO_WORD_LIST);

        await f.controller.perform(selectedCommand(collect), collect, { ...JITEN_WORD }, SENTENCE);

        expect(f.addToStudyDeck).not.toHaveBeenCalled();
        expect(f.mine.mock.calls.map(([request]) => request.expression)).toEqual(['食べる']);
        expect(f.toast).toHaveBeenCalledWith('Added to deck.');
    });

    it('with no word list, JPDB does not stand in for Jiten when Jiten grades', async () => {
        const f = jitenController(DUAL_KEY, NO_WORD_LIST);
        const collect = ordinaryPageSave(DUAL_KEY, JPDB_WORD, NO_WORD_LIST);

        await f.controller.perform(selectedCommand(collect), collect, { ...JPDB_WORD }, SENTENCE);

        expect(f.jpdbAdd).not.toHaveBeenCalled();
        expect(f.mine).toHaveBeenCalledTimes(1);
    });

    it('with no word list and nowhere else to go, offers no save', () => {
        expect(ordinaryPageSave(JITEN_ONLY, JITEN_WORD, NO_WORD_LIST)).toBeNull();
    });

    it('when Jiten decks are unknown, offers no Jiten destination but retains an explicit local choice', () => {
        const actions = renderPopup(WITH_YOMU_DECK, JITEN_WORD, emptyCardRenderData(), false);
        expect(choices(actions).map(choice => choice.source)).toEqual(['yomu-local']);
    });

    describe('subtitle "Add selected"', () => {
        async function addSelected(settings: ReaderSettings, decks: typeof DECKS | Error) {
            const f = jitenController(settings, decks);
            const words = [JITEN_WORD, { ...JITEN_WORD, spelling: '飲む', reading: 'のむ', jitenWordId: 9002 }].map(word => ({ card: { ...word }, sentence: SENTENCE }));
            const plans = f.controller.batchMining.prepare(words);
            const result = await f.controller.batchMining.execute(plans.map(plan => plan.token), 'collect');
            return { ...f, states: result.items.map(item => item.state) };
        }

        it('saves each word to the first word list, finding it once', async () => {
            const f = await addSelected(JITEN_ONLY, DECKS);
            expect(f.states).toEqual(['completed', 'completed']);
            expect(f.addToStudyDeck.mock.calls.map(([deck, word]) => [deck, word.jitenWordId])).toEqual([['9', 9001], ['9', 9002]]);
            expect(f.listReaderStudyDecks).toHaveBeenCalledTimes(1);
        });

        it('with no word list, saves the words to the next destination instead', async () => {
            const f = await addSelected(WITH_YOMU_DECK, NO_WORD_LIST);
            expect(f.states).toEqual(['completed', 'completed']);
            expect(f.addToStudyDeck).not.toHaveBeenCalled();
            expect(f.mine.mock.calls.map(([request]) => request.expression)).toEqual(['食べる', '飲む']);
        });

        it('with no word list and nowhere else to go, names the words no deck could take', async () => {
            const f = await addSelected(JITEN_ONLY, NO_WORD_LIST);
            expect(f.states).toEqual(['no-destination', 'no-destination']);
            expect(f.addToStudyDeck).not.toHaveBeenCalled();
        });

        it('when Jiten cannot list its decks, fails instead of saving the words elsewhere', async () => {
            const f = await addSelected(WITH_YOMU_DECK, new Error('offline'));
            expect(f.states).toEqual(['failed', 'unattempted']);
            expect(f.addToStudyDeck).not.toHaveBeenCalled();
            expect(f.mine).not.toHaveBeenCalled();
        });
    });

    // Study's "Add to deck…" opens a picker built from this render data.
    describe('Study deck picker', () => {
        function loader(settings: ReaderSettings, decks: typeof DECKS | Error = DECKS) {
            const listReaderStudyDecks = vi.fn(async () => {
                if (decks instanceof Error) throw decks;
                return decks;
            });
            return testCardRenderDataLoader({ settings: { ...settings, localDictionariesEnabled: false, showPitchAccent: false }, jiten: { listReaderStudyDecks } as never, isJpdbBackedCard });
        }
        const jitenOptions = (actions: HTMLElement): string[] => choices(actions).filter(choice => choice.source === 'jiten').map(choice => choice.label);
        const offered = (actions: HTMLElement): string[] => choices(actions).map(choice => choice.source);
        const note = (actions: HTMLElement): string | undefined => actions.querySelector('.jpdb-reader-help')?.textContent ?? undefined;

        it('offers only Jiten word lists', async () => {
            const data = await loader(JITEN_ONLY).load({ ...JITEN_WORD }).all;
            const actions = renderPopup(JITEN_ONLY, JITEN_WORD, { ...data, loading: false }, true);
            expect(jitenOptions(actions)).toEqual(['Jiten: Mined words', 'Jiten: Core list']);
            expect(note(actions)).toBeUndefined();
        });

        it('offers them for a JPDB-parsed word when Jiten is the preferred grading service', async () => {
            const data = await loader(DUAL_KEY).load({ ...JPDB_WORD }).all;
            expect(jitenOptions(renderPopup(DUAL_KEY, JPDB_WORD, { ...data, loading: false }, true))).toEqual(['Jiten: Mined words', 'Jiten: Core list']);
        });

        it('with no word list, offers the next destination and says how to save to Jiten', async () => {
            const data = await loader(WITH_YOMU_DECK, NO_WORD_LIST).load({ ...JITEN_WORD }).all;
            const actions = renderPopup(WITH_YOMU_DECK, JITEN_WORD, { ...data, loading: false }, true);

            // The Yomu deck is now the only explicit picker choice.
            expect(offered(actions)).toEqual(['yomu-local']);
            expect(note(actions)).toBe('To save words to Jiten, create a word list on jiten.moe.');

            const ja = renderPopup({ ...WITH_YOMU_DECK, interfaceLanguage: 'ja' }, JITEN_WORD, { ...data, loading: false }, true);
            expect(note(ja)).toBe('Jitenに単語を保存するには、jiten.moeで単語リストを作成してください。');
        });

        it('with no word list, never offers JPDB in Jiten\'s place', async () => {
            const data = await loader(DUAL_KEY, NO_WORD_LIST).load({ ...JPDB_WORD }).all;
            const actions = renderPopup({ ...DUAL_KEY, ankiEnabled: true }, JPDB_WORD, { ...data, ankiDecks: ['Mining'], loading: false }, true);
            expect(new Set(offered(actions))).toEqual(new Set(['yomu-local', 'anki']));
            expect(note(actions)).toBe('To save words to Jiten, create a word list on jiten.moe.');
        });

        it('says nothing about word lists when JPDB is the grading service', async () => {
            const jpdbGrades: ReaderSettings = { ...DUAL_KEY, apiGradingProvider: 'jpdb' };
            const data = await loader(jpdbGrades, NO_WORD_LIST).load({ ...JITEN_WORD }).all;
            const actions = renderPopup(jpdbGrades, JITEN_WORD, { ...data, loading: false }, true);
            expect(data.jitenDecks).toEqual([]);
            expect(offered(actions)).toEqual(['jpdb', 'yomu-local']);
            expect(note(actions)).toBeUndefined();
        });

        it('with no word list and nowhere else to go, shows only the note', async () => {
            const data = await loader(JITEN_ONLY, NO_WORD_LIST).load({ ...JITEN_WORD }).all;
            const actions = renderPopup(JITEN_ONLY, JITEN_WORD, { ...data, loading: false }, true);
            expect(actions.querySelector('.jpdb-reader-deck-select')).toBeNull();
            expect(note(actions)).toBe('To save words to Jiten, create a word list on jiten.moe.');
        });

        // The learner follows the note: the next popup soon offers the new word list.
        it('looks again soon for a word list the learner has just created', async () => {
            vi.useFakeTimers({ toFake: ['Date'] });
            try {
                const listReaderStudyDecks = vi.fn(async () => NO_WORD_LIST);
                const settings = { ...JITEN_ONLY, localDictionariesEnabled: false, showPitchAccent: false };
                const data = testCardRenderDataLoader({ settings, jiten: { listReaderStudyDecks } as never, isJpdbBackedCard, asksForJitenWordList: true });
                const decksFor = async (spelling: string, jitenWordId: number) => (await data.load({ ...JITEN_WORD, spelling, jitenWordId }).all).jitenDecks;
                await expect(decksFor('食べる', 9001)).resolves.toEqual([]);

                listReaderStudyDecks.mockResolvedValue(DECKS);
                vi.advanceTimersByTime(31_000);
                await expect(decksFor('飲む', 9002)).resolves.toEqual([{ id: '9', name: 'Mined words' }, { id: '11', name: 'Core list' }]);
                // A word list, once found, is kept as long as any deck list.
                vi.advanceTimersByTime(31_000);
                await decksFor('見る', 9003);
                expect(listReaderStudyDecks).toHaveBeenCalledTimes(2);
            } finally {
                vi.useRealTimers();
            }
        });

        it('is what Study\'s popups load with', () => {
            vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
            try {
                const study = new NewTabRuntime() as unknown as { cardRenderData: { dependencies: CardRenderDataLoaderDependencies } };
                expect(study.cardRenderData.dependencies.asksForJitenWordList).toBe(true);
            } finally {
                vi.unstubAllGlobals();
            }
        });

        // Only Study shows the note, so an ordinary page asks Jiten no more often
        // than for any other deck list.
        it('keeps an empty word-list result for the shared five minutes off Study', async () => {
            vi.useFakeTimers({ toFake: ['Date'] });
            try {
                const listReaderStudyDecks = vi.fn(async () => NO_WORD_LIST);
                const settings = { ...WITH_YOMU_DECK, localDictionariesEnabled: false, showPitchAccent: false };
                const data = testCardRenderDataLoader({ settings, jiten: { listReaderStudyDecks } as never, isJpdbBackedCard });
                const decksFor = async (spelling: string, jitenWordId: number) => (await data.load({ ...JITEN_WORD, spelling, jitenWordId }).all).jitenDecks;
                await expect(decksFor('食べる', 9001)).resolves.toEqual([]);

                vi.advanceTimersByTime(31_000);
                await expect(decksFor('飲む', 9002)).resolves.toEqual([]);
                vi.advanceTimersByTime(4 * 60_000);
                await decksFor('見る', 9003);
                expect(listReaderStudyDecks).toHaveBeenCalledTimes(1);

                vi.advanceTimersByTime(31_000);
                await decksFor('書く', 9004);
                expect(listReaderStudyDecks).toHaveBeenCalledTimes(2);
            } finally {
                vi.useRealTimers();
            }
        });

        it('says nothing about word lists while Jiten\'s decks are unknown', async () => {
            const data = await loader(JITEN_ONLY, new Error('offline')).load({ ...JITEN_WORD }).all;
            expect(data.jitenDecks).toBeUndefined();
            expect(note(renderPopup(JITEN_ONLY, JITEN_WORD, { ...data, loading: false }, true))).toBeUndefined();
        });

        it('an ordinary page offers the next destination but never mentions Jiten', async () => {
            const withYomuDeck = await loader(WITH_YOMU_DECK, NO_WORD_LIST).load({ ...JITEN_WORD }).all;
            const page = renderPopup(WITH_YOMU_DECK, JITEN_WORD, { ...withYomuDeck, loading: false }, false);
            expect(page.querySelector('.jpdb-reader-deck-select')).not.toBeNull();
            expect(page.textContent).not.toMatch(/jiten/i);

            const jitenOnly = await loader(JITEN_ONLY, NO_WORD_LIST).load({ ...JITEN_WORD }).all;
            const nowhere = renderPopup(JITEN_ONLY, JITEN_WORD, { ...jitenOnly, loading: false }, false);
            expect(nowhere.querySelector('.jpdb-reader-deck-select')).toBeNull();
        });
    });
});
