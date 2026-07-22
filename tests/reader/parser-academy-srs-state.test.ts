import { describe, expect, it, vi } from 'vitest';

import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';
import { ReaderParser } from '../../src/reader/lookup/parser';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { YomuSrsAdapter, YomuSrsLookupItem, YomuSrsReviewable } from '../../src/reader/srs/types';

function parsedCard(): JPDBCard {
    return {
        vid: 101,
        sid: 202,
        rid: 0,
        spelling: '読む',
        reading: 'よむ',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        provisionalState: true,
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
    };
}

function parsedToken(): JPDBToken {
    return { card: parsedCard(), start: 0, end: 2, length: 2, rubies: [], pitchClass: '', sentence: '読む' };
}

function academyDueCard(): YomuSrsReviewable {
    return {
        providerId: 'yomu-local',
        providerCardId: '読む\u0000よむ',
        kind: 'vocabulary',
        expression: '読む',
        reading: 'よむ',
        meanings: [],
        state: ['due'],
        dueAt: 2_000_000,
        lastReviewAt: 1_000_000,
    };
}

function parser(yomuLocalSrsEnabled: boolean, lookupCards: NonNullable<YomuSrsAdapter['lookupCards']>) {
    return new ReaderParser({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            localDictionariesEnabled: false,
            yomuLocalSrsEnabled,
        }),
        jpdb: { parse: vi.fn(async () => [[parsedToken()]]) } as never,
        dictionaries: {} as never,
        yomuLocalSrs: { lookupCards },
    });
}

describe('ReaderParser Academy SRS state integration', () => {
    it('hydrates the final provider parse before rendering when Academy is enabled', async () => {
        const lookupCards = vi.fn(async (_items: readonly YomuSrsLookupItem[]) => [academyDueCard()]);

        const [tokens] = await parser(true, lookupCards).parse(['読む']);

        expect(lookupCards).toHaveBeenCalledOnce();
        expect(tokens[0]?.card).toMatchObject({
            source: 'jpdb',
            reviewSource: 'yomu-local',
            cardState: ['due'],
            dueAt: 2_000_000,
        });
    });

    it('does not read or paint the local deck while Academy is disabled', async () => {
        const lookupCards = vi.fn(async (_items: readonly YomuSrsLookupItem[]) => [academyDueCard()]);

        const [tokens] = await parser(false, lookupCards).parse(['読む']);

        expect(lookupCards).not.toHaveBeenCalled();
        expect(tokens[0]?.card).toMatchObject({ cardState: ['not-in-deck'], provisionalState: true });
    });
});
