import { afterEach, expect, it, vi } from 'vitest';
import { LocalYomuSrsRepository, createYomuLocalSrsAdapter } from '../../src/reader/srs/local-yomu';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { setActiveLearningTargetLanguage, resetActiveLearningTargetLanguage } from '../../src/reader/languages/active';
import { newTabPromptController, renderEnabledNewTabRoot } from './new-tab-review/fixtures';
import type { JPDBCard } from '../../src/reader/app/types';
import { DEFAULT_NEW_TAB_UI_STATE } from '../../src/reader/newtab/state';
import { allowSyntheticReaderInteractionsForTests, dispatchAuthorizedReaderControlClick, installTrustedReaderRootBoundary } from '../../src/reader/ui/trusted-interaction';

afterEach(() => { vi.restoreAllMocks(); allowSyntheticReaderInteractionsForTests(true); document.body.replaceChildren(); localStorage.clear(); sessionStorage.clear(); resetActiveLearningTargetLanguage(); });

it('shows a saved word in the collection without placing it in the review queue', async () => {
    setActiveLearningTargetLanguage('ja');
    await new LocalYomuSrsRepository().mine({ expression: '読む', reading: 'よむ', meaning: 'to read', sentence: '本を読む。' });
    const repository = new LocalYomuSrsRepository();
    const adapter = createYomuLocalSrsAdapter(repository);
    const controller = newTabPromptController({ ...DEFAULT_SETTINGS, learningTargetChosen: true }, {
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
    setActiveLearningTargetLanguage('ja');
    allowSyntheticReaderInteractionsForTests(false);
    const boundary = new AbortController();
    installTrustedReaderRootBoundary(document, boundary.signal);
    const repository = new LocalYomuSrsRepository();
    await repository.mine({ expression: '読む', reading: 'よむ', meaning: 'to read' });
    const adapter = createYomuLocalSrsAdapter(repository);
    const enroll = vi.spyOn(repository, 'startReview');
    if (failure) enroll.mockRejectedValueOnce(new Error('storage unavailable'));
    const toast = vi.fn();
    const controller = newTabPromptController({ ...DEFAULT_SETTINGS, learningTargetChosen: true }, { srsAdapters: { 'yomu-local': adapter }, toast });
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
