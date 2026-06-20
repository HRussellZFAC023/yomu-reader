import { describe, expect, it } from 'vitest';

import { supplementSettingsFallbackTokens } from '../../src/reader/lookup/settings-fallback-tokens';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

const fallbackCard = (spelling: string, reading: string): JPDBCard => ({
    vid: -1,
    sid: -1,
    rid: 0,
    spelling,
    reading,
    frequencyRank: null,
    partOfSpeech: [],
    meanings: [],
    cardState: ['not-in-deck'],
    pitchAccent: [],
    wordWithReading: null,
    source: 'fallback',
    fallbackLookupTerms: [spelling],
});

function fallbackToken(text: string, reading: string): JPDBToken {
    return {
        card: fallbackCard(text, reading),
        start: 0,
        end: text.length,
        length: text.length,
        rubies: [{ text: reading, start: 0, end: text.length, length: text.length }],
        pitchClass: '',
        sentence: text,
    };
}

describe('settings fallback token supplements', () => {
    it('replaces overbroad generated settings tokens with curated lookup words', () => {
        const text = 'ポップアップ表示';
        const [tokens] = supplementSettingsFallbackTokens(
            [{ text, parent: document.body, fragments: [] }],
            [[fallbackToken(text, 'ポップアップひょうじ')]],
        );

        expect(tokens).toHaveLength(1);
        expect(tokens?.[0]).toMatchObject({
            start: 6,
            end: 8,
            pitchClass: 'heiban',
            card: {
                spelling: '表示',
                reading: 'ひょうじ',
                source: 'fallback',
            },
        });
    });
});
