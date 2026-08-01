import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JitenPublicVocabularyClient, resetJitenPublicVocabularyBackoffForTests } from '../../src/reader/dictionaries/jiten-public-vocabulary';
import { YomitanDictionaryStore } from '../../src/reader/dictionaries/yomitan';
import { renderTokensToHtml } from '../../src/reader/dom/index';
import { resetActiveLearningTargetLanguage, setActiveLearningTargetLanguage } from '../../src/reader/languages/active';
import { ReaderParser } from '../../src/reader/lookup/parser';
import { pointerTokenAtOffset } from '../../src/reader/lookup/text-helpers';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBToken } from '../../src/reader/app/types';

const SENTENCE = '「NHKやさしいことばニュース」は、日本に住んでいる外国人の皆さんや、子どもたちに、できるだけやさしい日本語でニュースを伝えるサイトです。';

// Captured from Jiten's public parser for the exact sentence reported in #48.
// The adapter must preserve these spans even though punctuation and the Latin
// prefix are deliberately represented by zero-id records that it filters out.
const JITEN_PARSE_RECORDS = [
    [0, 0, '「NHK'],
    [1539040, 1, 'やさしい'],
    [1264540, 3, 'ことば'],
    [1091500, 0, 'ニュース'],
    [0, 0, '」'],
    [2028920, 0, 'は'],
    [0, 0, '、'],
    [1582710, 0, '日本'],
    [2028990, 0, 'に'],
    [1334040, 0, '住んでいる'],
    [1203650, 0, '外国人'],
    [1469800, 2, 'の'],
    [1202170, 0, '皆さん'],
    [2028960, 0, 'や'],
    [0, 0, '、'],
    [1307870, 1, '子どもたち'],
    [2028990, 0, 'に'],
    [0, 0, '、'],
    [1340450, 3, 'できる'],
    [1007340, 1, 'だけ'],
    [2859811, 0, 'やさしい日本語'],
    [2028980, 0, 'で'],
    [1091500, 0, 'ニュース'],
    [2029010, 0, 'を'],
    [1441870, 0, '伝える'],
    [1055810, 0, 'サイト'],
    [1628500, 0, 'です'],
    [0, 0, '。'],
].map(([wordId, readingIndex, originalText]) => ({ wordId, readingIndex, originalText }));

function tokenAtSurface(tokens: JPDBToken[], surface: string, occurrence = 0): JPDBToken | undefined {
    let start = -1;
    for (let index = 0; index <= occurrence; index++) {
        start = SENTENCE.indexOf(surface, start + 1);
    }
    return pointerTokenAtOffset(tokens, start + surface.length - 1);
}

function tokenIdentity(tokens: JPDBToken[], surface: string, occurrence = 0) {
    const token = tokenAtSurface(tokens, surface, occurrence);
    return token && {
        surface: SENTENCE.slice(token.start, token.end),
        expression: token.card.spelling,
        range: [token.start, token.end],
    };
}

describe('NHK Easy parser regression (GitHub #48)', () => {
    beforeEach(() => {
        resetJitenPublicVocabularyBackoffForTests();
        setActiveLearningTargetLanguage('ja');
        localStorage.removeItem('yomu:jiten-public-cache:v2');
    });

    afterEach(() => {
        resetJitenPublicVocabularyBackoffForTests();
        resetActiveLearningTargetLanguage();
        localStorage.removeItem('yomu:jiten-public-cache:v2');
    });

    it('keeps the exact public Jiten spans aligned with the reported pointer positions', async () => {
        const requestJson = vi.fn(async (url: string) => {
            expect(new URL(url).searchParams.get('text')).toBe(SENTENCE);
            return JITEN_PARSE_RECORDS;
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });

        const [tokens] = await client.parse([SENTENCE], { detailLimit: 0 });

        expect(tokenIdentity(tokens, 'やさしい')).toEqual({ surface: 'やさしい', expression: 'やさしい', range: [4, 8] });
        expect(tokenIdentity(tokens, 'ことば')).toEqual({ surface: 'ことば', expression: 'ことば', range: [8, 11] });
        expect(tokenIdentity(tokens, 'ニュース', 1)).toEqual({ surface: 'ニュース', expression: 'ニュース', range: [55, 59] });
        expect(tokenIdentity(tokens, 'を')).toEqual({ surface: 'を', expression: 'を', range: [59, 60] });
        expect(tokenIdentity(tokens, 'です')).toEqual({ surface: 'です', expression: 'です', range: [66, 68] });
        expect(requestJson).toHaveBeenCalledTimes(1);
    });

    it('keeps the same words distinct in the installed-dictionary default path', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        await store.importFile(new File([JSON.stringify({
            formatName: 'yomu-yomitan-dictionaries',
            formatVersion: 2,
            terms: [
                { expression: '易しい', reading: 'やさしい', rules: 'adj-i', glossary: ['easy'], dictionary: 'JMdict fixture' },
                { expression: '言葉', reading: 'ことば', glossary: ['word'], dictionary: 'JMdict fixture' },
                { expression: 'ニュース', reading: 'ニュース', glossary: ['news'], dictionary: 'JMdict fixture' },
                { expression: 'を', reading: 'を', glossary: ['object marker'], dictionary: 'JMdict fixture' },
                { expression: 'です', reading: 'です', glossary: ['be'], dictionary: 'JMdict fixture' },
            ],
        })], 'issue-48-jmdict-fixture.json', { type: 'application/json' }));
        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: true,
                parserProvider: 'local',
                showPitchAccent: false,
            }),
            jpdb: {} as never,
            dictionaries: store,
        });

        try {
            const [tokens] = await parser.parse([SENTENCE], { allowSegmentedFallback: true });

            expect(tokenIdentity(tokens, 'やさしい')).toMatchObject({ surface: 'やさしい', expression: '易しい', range: [4, 8] });
            expect(tokenIdentity(tokens, 'ことば')).toMatchObject({ surface: 'ことば', expression: '言葉', range: [8, 11] });
            expect(tokenIdentity(tokens, 'ニュース', 1)).toMatchObject({ surface: 'ニュース', expression: 'ニュース', range: [55, 59] });
            expect(tokenIdentity(tokens, 'を')).toMatchObject({ surface: 'を', expression: 'を', range: [59, 60] });
            expect(tokenIdentity(tokens, 'です')).toMatchObject({ surface: 'です', expression: 'です', range: [66, 68] });

            const root = document.createElement('div');
            root.innerHTML = renderTokensToHtml(SENTENCE, tokens, {
                ...DEFAULT_SETTINGS,
                furiganaMode: 'off',
            });
            expect([...root.querySelectorAll<HTMLElement>('.jpdb-reader-word')]
                .filter(word => ['やさしい', 'ことば', 'ニュース', 'を', 'です'].includes(word.dataset.surface ?? ''))
                .map(word => [word.dataset.surface, word.dataset.expression, word.dataset.tokenStart, word.dataset.tokenEnd]))
                .toEqual([
                    ['やさしい', '易しい', '4', '8'],
                    ['ことば', '言葉', '8', '11'],
                    ['ニュース', 'ニュース', '11', '15'],
                    ['やさしい', '易しい', '47', '51'],
                    ['ニュース', 'ニュース', '55', '59'],
                    ['を', 'を', '59', '60'],
                    ['です', 'です', '66', '68'],
                ]);
        } finally {
            await store.clear();
        }
    });
});
