import { describe, expect, it, vi } from 'vitest';
import { JitenApiClient } from '../../src/reader/dictionaries/jiten';
import {
    DEFAULT_SETTINGS, newTabBareController, newTabPromptText, newTabTestCard,
    registerNewTabReviewCleanup, resetNewTabReviewStorage, waitForExpect,
} from './new-tab-review/fixtures';

registerNewTabReviewCleanup();

describe('private membership and the existing Study queue', () => {
    it('keeps the existing unfiltered Study fallback while a strict membership read rejects incomplete evidence', async () => {
        resetNewTabReviewStorage();
        const jiten = new JitenApiClient(() => 'deterministic-key', { requestImpl: async () => null });
        const first = newTabTestCard({ spelling: '猫', reading: 'ねこ', source: 'jiten', jitenWordId: 9, jitenReadingIndex: 0 });
        const second = newTabTestCard({ spelling: '犬', reading: 'いぬ', source: 'jiten', jitenWordId: 10, jitenReadingIndex: 0 });
        vi.spyOn(jiten, 'listStudyBatchCards').mockResolvedValue([first, second]);
        vi.spyOn(jiten, 'listStudyDecks').mockResolvedValue([{ id: 7, name: 'Private list' }]);
        const keys = vi.spyOn(jiten, 'studyDeckWordKeys');
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: 'deterministic-key',
            newTabSource: 'jpdb', newTabJpdbReviewMode: 'api-vocabulary', immersionKitEnabled: false,
        }, { jiten });
        try {
            await controller.renderPage();
            const select = document.querySelector<HTMLSelectElement>('[data-newtab-deck-select]')!;
            await waitForExpect(() => expect(select.querySelector('option[value="jiten:7"]')).not.toBeNull());
            select.value = 'jiten:7';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            await waitForExpect(() => expect(keys).toHaveBeenCalledWith(7));
            expect(newTabPromptText()).toBe('猫');
            expect(await keys.mock.results[0].value).toEqual(new Set());
            await expect(jiten.isCardInStudyDeck(7, { wordId: 9, readingIndex: 0 })).rejects.toThrow('Invalid Jiten deck word keys');
        } finally { controller.destroy(); resetNewTabReviewStorage(); }
    });
});
