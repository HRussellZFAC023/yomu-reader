import { describe, expect, it, vi } from 'vitest';

import { resetActiveLearningTargetLanguage, setActiveLearningTargetLanguage } from '../../../src/reader/languages/active';
import { newTabLookupMetaItems } from '../../../src/reader/newtab/lookup-dom';
import { newTabCardFromSrsReviewable } from '../../../src/reader/newtab/srs-card-adapter';
import { LocalYomuSrsRepository } from '../../../src/reader/srs/local-yomu';
import { DEFAULT_SETTINGS, NewTabRuntime, newTabLookupRenderData, newTabTestCard, setupNewTabLookupRuntime } from './fixtures';

describe('new tab review — lookup header contract', () => {
    it('shows Academy SRS state with the shared swatch and omits the duplicate frequency rank', () => {
        const items = newTabLookupMetaItems({
            card: newTabTestCard({ source: 'yomu-local', reviewSource: 'yomu-local', frequencyRank: 400, cardState: ['due'] }),
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
            provider: {
                id: 'yomu-local',
                label: 'Academy',
                deckSource: 'yomu-local',
                hasApiKey: true,
            },
            providerState: 'due',
            settings: { ...DEFAULT_SETTINGS, ankiEnabled: false, yomuLocalSrsEnabled: true },
        });

        expect(items.map(item => item.textContent)).toEqual(['Academy Due']);
        expect(items[0]?.querySelector('.jpdb-reader-state-dot.jpdb-due')).not.toBeNull();
        expect(items.some(item => item.textContent?.includes('#400'))).toBe(false);
    });

    // Library and Stats call an Academy word saved but not in review "Saved";
    // its Study lookup popup names it the same way, keeping the in-deck swatch.
    it.each([['en', 'Academy Saved'], ['ja', 'Academy 保存済み']] as const)('names a saved Academy word as Library does (%s)', async (interfaceLanguage, label) => {
        setActiveLearningTargetLanguage('ja');
        const repository = new LocalYomuSrsRepository();
        await repository.mine({ expression: '読む', reading: 'よむ', meaning: 'to read' });
        const [saved] = await repository.collection();
        const runtime = new NewTabRuntime();
        const internals = setupNewTabLookupRuntime(runtime, newTabLookupRenderData(), {
            settings: { interfaceLanguage, apiKey: '', jitenApiKey: '', ankiEnabled: false, yomuLocalSrsEnabled: true },
            isJpdbBackedCard: () => false,
        });
        try {
            await internals.showLookupCard(newTabCardFromSrsReviewable(saved!)!, '本を読む。');
            await vi.waitFor(() => expect([...document.querySelectorAll('.jpdb-reader-meta > span')].map(item => item.textContent)).toEqual([label]));
            expect(document.querySelector('.jpdb-reader-meta .jpdb-reader-state-dot.jpdb-in-deck')).not.toBeNull();
            expect(document.body.textContent).not.toContain('未翻訳');
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
            localStorage.clear();
            resetActiveLearningTargetLanguage();
        }
    });

    it('does not claim an unavailable provider status', () => {
        const items = newTabLookupMetaItems({
            card: newTabTestCard({ frequencyRank: 400, cardState: ['new'] }),
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
            provider: {
                id: 'jpdb',
                label: 'JPDB',
                deckSource: 'jpdb',
                hasApiKey: false,
            },
            providerState: 'new',
            settings: { ...DEFAULT_SETTINGS, apiKey: '', ankiEnabled: false },
        });

        expect(items).toEqual([]);
    });
});
