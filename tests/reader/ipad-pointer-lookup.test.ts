import { describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/main';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/types';
import type { PointerTextLookup } from '../../src/reader/pointer-text-lookup';

interface PointerLookupInternals {
    settings: ReaderSettings;
    parseJapanese(paragraphs: string[]): Promise<JPDBToken[][]>;
    showFirstPointerTextCandidate(
        candidate: PointerTextLookup,
        sentence: string,
        trigger: 'modal' | 'hover',
        options: { userGesture?: boolean },
    ): Promise<void>;
    showPointerTextCard(card: JPDBCard): Promise<void>;
}

interface PublicLookupInternals {
    settings: ReaderSettings;
    jpdbVocabulary: { search: (term: string, limit: number) => Promise<JPDBCard[]> };
    publicLookupCard(term: string, exact?: boolean): Promise<JPDBCard | undefined>;
}

function testCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 1,
        sid: 2,
        rid: 3,
        spelling: 'よむ',
        reading: 'よむ',
        frequencyRank: 100,
        partOfSpeech: ['v5m'],
        meanings: [{ glosses: ['to read'], partOfSpeech: ['v5m'] }],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        ...overrides,
    };
}

function token(spelling: string, start: number, end: number): JPDBToken {
    return {
        card: testCard({
            vid: start + 1,
            spelling,
            reading: spelling,
            meanings: [{ glosses: [spelling], partOfSpeech: [] }],
        }),
        start,
        end,
        length: end - start,
        rubies: [],
        pitchClass: 'unknown',
        sentence: 'よむ',
    };
}

describe('iPad pointer lookup', () => {
    it('uses the full tapped kana run when parsing only finds single-mora fragments', async () => {
        const app = new ReaderApp();
        const anchor = document.createElement('span');
        document.body.append(anchor);
        const internals = app as unknown as PointerLookupInternals;
        const shownCards: JPDBCard[] = [];

        internals.settings = {
            ...DEFAULT_SETTINGS,
            localDictionariesEnabled: false,
        };
        internals.parseJapanese = vi.fn(async () => [[token('よ', 0, 1), token('む', 1, 2)]]);
        internals.showPointerTextCard = vi.fn(async card => {
            shownCards.push(card);
        });

        try {
            await internals.showFirstPointerTextCandidate(
                { text: 'よむ', offset: 0, start: 0, end: 2, anchor },
                'よむ',
                'modal',
                { userGesture: true },
            );

            expect(shownCards).toHaveLength(1);
            expect(shownCards[0]?.spelling).toBe('よむ');
            expect(shownCards[0]?.source).toBe('fallback');
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });

    it('accepts an exact JPDB public lookup match by reading', async () => {
        const app = new ReaderApp();
        const internals = app as unknown as PublicLookupInternals;
        const card = testCard({ spelling: '読む', reading: 'よむ', source: 'jpdb' });

        internals.settings = {
            ...DEFAULT_SETTINGS,
            jpdbDefinitionsEnabled: true,
            showPitchAccent: false,
        };
        internals.jpdbVocabulary = {
            search: vi.fn(async () => [card]),
        };

        try {
            await expect(internals.publicLookupCard('よむ', true)).resolves.toBe(card);
        } finally {
            app.destroy();
            document.body.replaceChildren();
        }
    });
});
