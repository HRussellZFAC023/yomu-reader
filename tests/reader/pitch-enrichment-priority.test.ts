import { describe, expect, it } from 'vitest';

import {
    boundedPublicPitchLookupReservation,
    pitchEnrichmentPriority,
} from '../../src/reader/lookup/text-helpers';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

function token(source: JPDBCard['source'], reading: string): JPDBToken {
    return {
        card: {
            vid: 1,
            sid: 1,
            rid: 0,
            spelling: '語',
            reading,
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: reading ? `語[${reading}]` : null,
            source,
        },
        start: 0,
        end: 1,
        length: 1,
        rubies: [],
        pitchClass: '',
        sentence: '語',
    };
}

describe('bounded page annotation enrichment', () => {
    it('completes reading-less spans before cards that already have readable evidence', () => {
        const readableFallback = token('fallback', 'ご');
        const readableJiten = token('jiten', 'ご');
        const bareJiten = token('jiten', '');

        expect([readableJiten, readableFallback, bareJiten]
            .sort((left, right) => pitchEnrichmentPriority(left) - pitchEnrichmentPriority(right)))
            .toEqual([bareJiten, readableFallback, readableJiten]);
    });

    it('reserves only candidates present in a small scan batch', () => {
        expect(boundedPublicPitchLookupReservation(3, 24, 24)).toBe(3);
        expect(boundedPublicPitchLookupReservation(40, 24, 24)).toBe(24);
        expect(boundedPublicPitchLookupReservation(10, 4, 8)).toBe(8);
    });
});
