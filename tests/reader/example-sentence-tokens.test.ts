import { describe, expect, it } from 'vitest';
import { exampleSentenceLookupTokens } from '../../src/reader/example-sentence-tokens';
import type { JPDBCard, JPDBToken } from '../../src/reader/types';

describe('exampleSentenceLookupTokens', () => {
    it('removes short particle tokens from example sentence lookup targets', () => {
        const sentence = 'うでが痛むんで？';
        const target = testCard({ vid: 10, sid: 10, spelling: '痛む', reading: 'いたむ' });
        const tokens = [
            testToken(sentence, testCard({ vid: 1, sid: 1, spelling: 'で', partOfSpeech: ['Particle', 'Conjunction'] }), 6, 7),
            testToken(sentence, target, 3, 5),
        ];

        expect(exampleSentenceLookupTokens(tokens, target).map(token => token.card.spelling)).toEqual(['痛む']);
    });

    it('keeps a short particle when it is the target card', () => {
        const sentence = 'ここで読む。';
        const particle = testCard({ vid: 2, sid: 2, spelling: 'で', partOfSpeech: ['Particle'] });

        expect(exampleSentenceLookupTokens([testToken(sentence, particle, 2, 3)], particle)).toHaveLength(1);
    });
});

function testCard(overrides: Partial<JPDBCard>): JPDBCard {
    return {
        vid: overrides.vid ?? 1,
        sid: overrides.sid ?? 1,
        rid: overrides.rid ?? 0,
        spelling: overrides.spelling ?? '読む',
        reading: overrides.reading ?? '',
        frequencyRank: null,
        partOfSpeech: overrides.partOfSpeech ?? [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
    };
}

function testToken(sentence: string, card: JPDBCard, start: number, end: number): JPDBToken {
    return {
        card,
        start,
        end,
        length: end - start,
        rubies: [],
        pitchClass: '',
        sentence,
    };
}
