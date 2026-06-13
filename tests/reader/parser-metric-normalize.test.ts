import { describe, expect, it, vi } from 'vitest';

import { ReaderParser } from '../../src/reader/lookup/parser';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

const badMetricCard: JPDBCard = {
    vid: 2838063,
    sid: 2312700631,
    rid: 0,
    spelling: '回視',
    reading: 'かいし',
    frequencyRank: null,
    partOfSpeech: [],
    meanings: [],
    cardState: ['not-in-deck'],
    pitchAccent: [],
    wordWithReading: null,
    source: 'jpdb',
};

function badMetricToken(sentence: string): JPDBToken {
    const start = sentence.indexOf('回視聴');
    return {
        card: badMetricCard,
        start,
        end: start + 2,
        length: 2,
        rubies: [{ text: 'かいし', start, end: start + 2, length: 2 }],
        pitchClass: '',
        sentence,
    };
}

describe('ReaderParser metric normalization', () => {
    it('replaces broken YouTube 回視 tokens with ruby-safe 回 and 視聴 tokens', async () => {
        const sentence = '12,082回視聴 6時間前にライブ配信';
        const jpdb = {
            parse: vi.fn(async () => [[badMetricToken(sentence)]]),
            getCard: vi.fn(),
        };
        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                localDictionariesEnabled: false,
            }),
            jpdb: jpdb as never,
            dictionaries: {} as never,
        });

        const [tokens] = await parser.parse([sentence]);

        expect(tokens.map(token => sentence.slice(token.start, token.end))).toEqual(['回', '視聴']);
        expect(tokens.map(token => token.card.reading)).toEqual(['かい', 'しちょう']);
        expect(tokens.map(token => token.rubies[0]?.text)).toEqual(['かい', 'しちょう']);
        expect(tokens.every(token => token.card.source === 'fallback')).toBe(true);
    });
});
