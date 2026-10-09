import { afterEach, expect, it, vi } from 'vitest';
import { LocalYomuSrsRepository, createYomuLocalSrsAdapter } from '../../src/reader/srs/local-yomu';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { newTabPromptController, newTabTestCard, renderEnabledNewTabRoot } from './new-tab-review/fixtures';
import type { JPDBCard } from '../../src/reader/app/types';
import { DEFAULT_NEW_TAB_UI_STATE } from '../../src/reader/newtab/state';
import { allowSyntheticReaderInteractionsForTests, dispatchAuthorizedReaderControlClick, installTrustedReaderRootBoundary } from '../../src/reader/ui/trusted-interaction';

afterEach(() => { vi.restoreAllMocks(); allowSyntheticReaderInteractionsForTests(true); document.body.replaceChildren(); localStorage.clear(); sessionStorage.clear(); });

it('shows a saved word in the collection without placing it in the review queue', async () => {
    await new LocalYomuSrsRepository().mine({ expression: '読む', reading: 'よむ', meaning: 'to read', sentence: '本を読む。' });
    const repository = new LocalYomuSrsRepository();
    const adapter = createYomuLocalSrsAdapter(repository);
    const controller = newTabPromptController(DEFAULT_SETTINGS, {
        srsAdapters: { 'yomu-local': adapter },
    });
    try {
        const provider = (controller as unknown as {
            srsAdapterBrowsePoolProvider(source: 'yomu-local'): { load(): Promise<JPDBCard[]> } | null;
        }).srsAdapterBrowsePoolProvider('yomu-local');
        expect(provider).not.toBeNull();
        const cards = await provider!.load();
        expect(cards).toHaveLength(1);
        expect(cards[0]).toMatchObject({ spelling: '読む', sentence: '本を読む。' });
        expect((await adapter.queue()).cards).toEqual([]);
    } finally { controller.destroy(); }
});

it.each([false, true])('enrolls only on an explicit collection action and reports failure=%s', async failure => {
    allowSyntheticReaderInteractionsForTests(false);
    const boundary = new AbortController();
    installTrustedReaderRootBoundary(document, boundary.signal);
    const repository = new LocalYomuSrsRepository();
    await repository.mine({ expression: '読む', reading: 'よむ', meaning: 'to read' });
    const adapter = createYomuLocalSrsAdapter(repository);
    const enroll = vi.spyOn(repository, 'startReview');
    if (failure) enroll.mockRejectedValueOnce(new Error('storage unavailable'));
    const toast = vi.fn();
    const controller = newTabPromptController(DEFAULT_SETTINGS, { srsAdapters: { 'yomu-local': adapter }, toast });
    const probe = controller as unknown as {
        state: typeof DEFAULT_NEW_TAB_UI_STATE;
        browsePool: JPDBCard[];
        srsAdapterBrowsePoolProvider(source: 'yomu-local'): { load(): Promise<JPDBCard[]> };
        bindRootEvents(root: HTMLElement): void;
        renderBrowseResults(root: HTMLElement): void;
    };
    try {
        probe.state = { ...DEFAULT_NEW_TAB_UI_STATE, route: 'search', source: 'yomu-local' };
        probe.browsePool = await probe.srsAdapterBrowsePoolProvider('yomu-local').load();
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        probe.bindRootEvents(root);
        probe.renderBrowseResults(root.querySelector<HTMLElement>('[data-newtab-search-results]')!);
        const button = root.querySelector<HTMLButtonElement>('[data-newtab-action="browse-start-review"]')!;
        expect(button?.textContent).toBe('Add to review');
        // Styled as Library's other row controls, not a bare text button.
        expect(button.classList.contains('jpdb-reader-newtab-browse-start-review')).toBe(true);
        expect(enroll).not.toHaveBeenCalled();
        button.click();
        expect(enroll).not.toHaveBeenCalled();
        dispatchAuthorizedReaderControlClick(button);
        dispatchAuthorizedReaderControlClick(button);
        await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(failure ? 'Could not add to review.' : 'Added to review.'));
        expect(enroll).toHaveBeenCalledOnce();
        expect((await adapter.queue()).cards).toHaveLength(failure ? 0 : 1);
        if (failure) {
            expect(button.disabled).toBe(false);
            toast.mockClear();
            dispatchAuthorizedReaderControlClick(button);
            await vi.waitFor(() => expect(toast).toHaveBeenCalledWith('Added to review.'));
            expect(enroll).toHaveBeenCalledTimes(2);
            expect((await adapter.queue()).cards).toHaveLength(1);
        }
        else await vi.waitFor(() => expect(root.querySelector('[data-newtab-action="browse-start-review"]')).toBeNull());
    } finally { controller.destroy(); boundary.abort(); }
});

it('returns to a Study queue rebuilt with the word just added to review', async () => {
    allowSyntheticReaderInteractionsForTests(false);
    const boundary = new AbortController();
    installTrustedReaderRootBoundary(document, boundary.signal);
    const repository = new LocalYomuSrsRepository();
    await repository.mine({ expression: '読む', reading: 'よむ', meaning: 'to read', sentence: '本を読む。' });
    const adapter = createYomuLocalSrsAdapter(repository);
    const toast = vi.fn();
    const controller = newTabPromptController(DEFAULT_SETTINGS, { srsAdapters: { 'yomu-local': adapter }, toast });
    const probe = controller as unknown as {
        state: typeof DEFAULT_NEW_TAB_UI_STATE;
        allWords: JPDBCard[];
        browsePool: JPDBCard[];
        srsAdapterBrowsePoolProvider(source: 'yomu-local'): { load(): Promise<JPDBCard[]> };
        bindRootEvents(root: HTMLElement): void;
        renderBrowseResults(root: HTMLElement): void;
        loadWordsInto(root: HTMLElement, preferStoredWord: boolean): Promise<void>;
    };
    try {
        // Study already built its queue (a starter word, nothing due) before the learner opened Library.
        probe.state = { ...DEFAULT_NEW_TAB_UI_STATE, route: 'search', source: 'auto' };
        probe.allWords = [newTabTestCard({ spelling: '電話', reading: 'でんわ' })];
        probe.browsePool = await probe.srsAdapterBrowsePoolProvider('yomu-local').load();
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        probe.bindRootEvents(root);
        probe.renderBrowseResults(root.querySelector<HTMLElement>('[data-newtab-search-results]')!);
        const reload = vi.spyOn(probe, 'loadWordsInto').mockResolvedValue(undefined);

        dispatchAuthorizedReaderControlClick(root.querySelector<HTMLButtonElement>('[data-newtab-action="browse-start-review"]')!);
        await vi.waitFor(() => expect(toast).toHaveBeenCalledWith('Added to review.'));
        expect((await adapter.queue()).cards.map(card => card.expression)).toEqual(['読む']);
        dispatchAuthorizedReaderControlClick(root.querySelector<HTMLButtonElement>('.jpdb-reader-newtab-mode [data-newtab-action="mode"][data-mode="word"]')!);

        // Reusing the queue built before the word was added would hide it until a reload.
        expect(probe.state.route).toBe('study');
        expect(reload).toHaveBeenCalledOnce();
    } finally { controller.destroy(); boundary.abort(); }
});

// Before any word is saved, Library once showed "All sources 0", "All 0", a sort
// menu and Select over nothing. It now says how words arrive and offers practice.
it('shows how words arrive, not empty filters, before any word is saved', async () => {
    const controller = newTabPromptController(DEFAULT_SETTINGS, {});
    const probe = controller as unknown as {
        state: typeof DEFAULT_NEW_TAB_UI_STATE;
        browsePool: JPDBCard[];
        renderBrowseResults(root: HTMLElement): void;
    };
    try {
        probe.state = { ...DEFAULT_NEW_TAB_UI_STATE, route: 'search', source: 'auto' };
        probe.browsePool = [];
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        const results = root.querySelector<HTMLElement>('[data-newtab-search-results]')!;
        probe.renderBrowseResults(results);

        expect(results.querySelector('.jpdb-reader-newtab-browse-empty p')?.textContent).toBe('Save a word while you read and it shows up here.');
        expect(results.querySelector('.jpdb-reader-newtab-browse-empty [data-newtab-action="practice-sessions"]')?.textContent).toBe('Practice');
        for (const machinery of ['.jpdb-reader-newtab-browse-chips', '.jpdb-reader-newtab-browse-controls', '[data-newtab-action="browse-select-mode"]']) {
            expect(results.querySelector(machinery), machinery).toBeNull();
        }

        // One saved word: its row, and no chip that could only say "All" again.
        probe.browsePool = [newTabTestCard({ spelling: '読む', reading: 'よむ' })];
        probe.renderBrowseResults(results);
        expect(results.querySelector('.jpdb-reader-newtab-browse-empty')).toBeNull();
        expect(results.querySelectorAll('.jpdb-reader-newtab-browse-row')).toHaveLength(1);
        expect(results.querySelector('.jpdb-reader-newtab-browse-chips')).toBeNull();
        expect(results.querySelector('.jpdb-reader-newtab-browse-controls')).toBeNull();

        // Two states: the state chips can now narrow the list.
        probe.browsePool = [newTabTestCard({ spelling: '読む', reading: 'よむ', cardState: ['known'] }), newTabTestCard({ spelling: '書く', reading: 'かく', cardState: ['due'] })];
        probe.renderBrowseResults(results);
        expect([...results.querySelectorAll('[data-newtab-action="browse-filter"]')].map(chip => chip.textContent)).toEqual(['All 2', 'Due 1', 'Known 1']);
        expect(results.querySelector('[data-newtab-action="browse-source-filter"]')).toBeNull();
    } finally { controller.destroy(); }
});
