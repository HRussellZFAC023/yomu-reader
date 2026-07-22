import { describe, expect, it } from 'vitest';

import { newTabLookupMetaItems } from '../../../src/reader/newtab/lookup-dom';
import { DEFAULT_SETTINGS, newTabTestCard } from './fixtures';

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
