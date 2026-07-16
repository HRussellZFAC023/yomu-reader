import type { JPDBCard } from '../../src/reader/app/types';
import { NewTabController } from '../../src/reader/newtab/controller';

interface ImmersionFallbackInternals {
    cheapNewTabImmersionFallbackQueries(card: JPDBCard, exactQuery: string): string[];
}

describe('Academy vocabulary Immersion fallback', () => {
    it('tries the authored dictionary lemma after the verbatim source surface', () => {
        const internals = Object.create(NewTabController.prototype) as ImmersionFallbackInternals;
        const card: JPDBCard = {
            vid: -1,
            sid: -1,
            rid: 0,
            spelling: 'おきます',
            reading: 'おきる',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'fallback',
            fallbackLookupTerms: ['起きる'],
        };

        expect(internals.cheapNewTabImmersionFallbackQueries(card, card.spelling)).toEqual(
            expect.arrayContaining(['おきる', '起きる']),
        );
    });

    it('tries the l1-l15 canonical lemma after its verbatim review-marked surface', () => {
        const internals = Object.create(NewTabController.prototype) as ImmersionFallbackInternals;
        const card: JPDBCard = {
            vid: -1,
            sid: -1,
            rid: 0,
            spelling: '*review こうえん',
            reading: 'こうえん',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'fallback',
            fallbackLookupTerms: ['公園'],
        };

        expect(internals.cheapNewTabImmersionFallbackQueries(card, card.spelling)).toContain('公園');
    });
});
