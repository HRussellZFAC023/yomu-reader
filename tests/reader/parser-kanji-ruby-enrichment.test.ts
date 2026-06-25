import { describe, expect, it, vi } from 'vitest';

import { ReaderParser } from '../../src/reader/lookup/parser';
import { renderTokensToHtml } from '../../src/reader/dom/index';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

function card(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 100,
        sid: 100,
        rid: 0,
        spelling: '認証する',
        reading: 'にんしょうする',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
        ...overrides,
    };
}

function token(sentence: string, overrides: Partial<JPDBToken> = {}): JPDBToken {
    return {
        card: card(),
        start: 0,
        end: sentence.length,
        length: sentence.length,
        rubies: [{ text: 'にんしょう', start: 0, end: 2, length: 2 }],
        pitchClass: '',
        sentence,
        ...overrides,
    };
}

describe('parser kanji ruby enrichment', () => {
    it('splits whole-compound ruby ranges per kanji when local readings align', async () => {
        const sentence = '認証する';
        const jpdbTokens = [token(sentence)];
        const lookupKanji = vi.fn(async (kanji: string) => {
            if (kanji === '認') return [{ onyomi: ['ニン'], kunyomi: [] }];
            if (kanji === '証') return [{ onyomi: ['ショウ'], kunyomi: [] }];
            return [];
        });
        const parser = new ReaderParser({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', localDictionariesEnabled: true }),
            jpdb: { parse: vi.fn(async () => [jpdbTokens]) } as never,
            dictionaries: { lookupKanji } as never,
        });

        const [[parsed]] = await parser.parse([sentence]);

        expect(parsed?.rubies).toEqual([
            { text: 'にん', start: 0, end: 1, length: 1 },
            { text: 'しょう', start: 1, end: 2, length: 1 },
        ]);
        expect(parsed?.card.wordWithReading).toBe('認[にん]証[しょう]する');

        document.body.innerHTML = renderTokensToHtml(sentence, [parsed!], {
            ...DEFAULT_SETTINGS,
            showFurigana: true,
            furiganaMode: 'all',
        });
        expect([...document.querySelectorAll('rt')].map(rt => rt.textContent)).toEqual(['にん', 'しょう']);
        expect([...document.querySelectorAll('.jpdb-reader-ruby-base')].map(base => base.textContent)).toEqual(['認', '証']);
    });

    it('adds split ruby to all-kanji remote tokens that only have a card reading', async () => {
        const sentence = '認証';
        const jpdbTokens = [token(sentence, {
            card: card({ spelling: sentence, reading: 'にんしょう' }),
            end: sentence.length,
            length: sentence.length,
            rubies: [],
        })];
        const lookupKanji = vi.fn(async (kanji: string) => {
            if (kanji === '認') return [{ onyomi: ['ニン'], kunyomi: [] }];
            if (kanji === '証') return [{ onyomi: ['ショウ'], kunyomi: [] }];
            return [];
        });
        const parser = new ReaderParser({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', localDictionariesEnabled: true }),
            jpdb: { parse: vi.fn(async () => [jpdbTokens]) } as never,
            dictionaries: { lookupKanji } as never,
        });

        const [[parsed]] = await parser.parse([sentence]);

        expect(parsed?.rubies).toEqual([
            { text: 'にん', start: 0, end: 1, length: 1 },
            { text: 'しょう', start: 1, end: 2, length: 1 },
        ]);
    });
});
