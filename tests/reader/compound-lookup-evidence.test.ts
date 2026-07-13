import { describe, expect, it, vi } from 'vitest';
import { ReaderParser } from '../../src/reader/lookup/parser';
import { CardRenderDataLoader } from '../../src/reader/cards/render-data';
import { CardPopoverRenderer } from '../../src/reader/cards/popover-renderer';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard } from '../../src/reader/app/types';
import type { JitenVocabularyInfo } from '../../src/reader/dictionaries/jiten';

describe('exact compound evidence', () => {
    it('keeps もう一度 as one useful dictionary-backed token with exact reading and pitch', async () => {
        const findTermMatches = vi.fn(async () => [{
            entry: {
                expression: 'もう一度',
                reading: 'もういちど',
                glossary: ['once more', 'again'],
                dictionary: 'Jitendex',
            },
            start: 0,
            end: 4,
            surface: 'もう一度',
            deinflected: false,
        }]);
        const lookupTermMeta = vi.fn(async () => [{
            expression: 'もう一度',
            mode: 'pitch',
            data: { reading: 'もういちど', pitches: [{ position: 0 }] },
            dictionary: 'Kanjium pitch accents',
        }]);
        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                parserProvider: 'local',
                localDictionariesEnabled: true,
                showPitchAccent: true,
            }),
            jpdb: {} as never,
            dictionaries: {
                hasTermDictionaries: vi.fn(async () => true),
                findTermMatches,
                lookupTermMeta,
                lookupKanji: vi.fn(async () => []),
            } as never,
        });

        const [tokens] = await parser.parse(['もう一度お願いします。'], {
            allowSegmentedFallback: true,
            includeLocalPitch: true,
        });

        expect(tokens[0]?.card).toMatchObject({
            spelling: 'もう一度',
            reading: 'もういちど',
            source: 'local',
        });
        expect(tokens[0]?.card.meanings[0]?.glosses).toEqual(['once more', 'again']);
        expect(tokens[0]?.card.pitchAccent).toEqual(['LHHHHH']);
        expect(tokens[0]?.rubies).toEqual([{ text: 'もういちど', start: 0, end: 4, length: 4 }]);
    });

    it('uses Jiten exact compound metadata for clickable component readings and their own pitch', async () => {
        const publicPitch = vi.fn(async (term: string) => ({
            'もう一度': [],
            'もう': ['HLL'],
            '一度': ['LHHL'],
        }[term] ?? []));
        const loader = new CardRenderDataLoader({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                localDictionariesEnabled: false,
                localDictionaryShowKanji: false,
                showPitchAccent: true,
                ankiEnabled: false,
                jpdbDefinitionsEnabled: false,
                jpdbMiningEnabled: false,
                jitenDefinitionsEnabled: true,
            }),
            dictionaries: {
                lookup: vi.fn(async () => []),
                lookupKanji: vi.fn(async () => []),
                lookupTermMeta: vi.fn(async () => []),
            } as never,
            jpdbPublicPitch: { lookup: publicPitch } as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null) } as never,
            anki: { findExistingCards: vi.fn(), deckNames: vi.fn() } as never,
            jpdb: { listDecks: vi.fn() } as never,
            jiten: { lookupVocabularyInfoForCard: vi.fn(async () => jitenCompoundInfo()) } as never,
            isJpdbBackedCard: () => false,
        });

        const data = await loader.load(compoundCard()).all;

        expect(data.expressionComponents).toEqual([
            { text: 'もう', reading: 'もう' },
            { text: '一度', reading: 'いちど' },
        ]);
        expect(data.componentPitches).toEqual([
            { text: 'もう', reading: 'もう', pitch: 'HLL' },
            { text: '一度', reading: 'いちど', pitch: 'LHHL' },
        ]);
        expect(publicPitch).toHaveBeenCalledWith('もう', 'もう');
        expect(publicPitch).toHaveBeenCalledWith('一度', 'いちど');

        const renderer = new CardPopoverRenderer({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                localDictionariesEnabled: false,
                showFurigana: true,
                furiganaMode: 'all',
                showPitchAccent: true,
            }),
            isJpdbBackedCard: () => false,
            renderWordHistory: () => '',
            renderWordPills: () => '',
            renderDefinitionSources: () => '',
            dictionarySourceAttributes: () => '',
            dictionaryLabel: name => name,
        });
        document.body.innerHTML = renderer.render(compoundCard(), 'もう一度お願いします。', 'modal', {
            ...data,
            loading: false,
        });

        const headword = document.querySelector<HTMLElement>('.jpdb-reader-spelling');
        const components = [...document.querySelectorAll<HTMLAnchorElement>('.jpdb-reader-expression-component-link')];
        expect(headword?.dataset.pitchClass).toBe('heiban');
        expect([...headword!.querySelectorAll('rt')].map(reading => reading.textContent)).toEqual(['いち', 'ど']);
        expect(headword?.textContent?.replace('(いち)', '').replace('(ど)', '')).toBe('もう一度');
        expect(components.map(link => link.dataset.dictionaryLookup)).toEqual(['もう', '一度']);
        expect(components.map(link => link.dataset.dictionaryReading)).toEqual(['もう', 'いちど']);
    });
});

function compoundCard(): JPDBCard {
    return {
        vid: 2_005_860,
        sid: 0,
        rid: 0,
        spelling: 'もう一度',
        reading: 'もういちど',
        frequencyRank: 542,
        partOfSpeech: ['exp', 'adv'],
        meanings: [{ glosses: ['once more', 'again'], partOfSpeech: ['exp', 'adv'] }],
        cardState: ['not-in-deck'],
        pitchAccent: ['LHHHHH'],
        wordWithReading: 'もう一[いち]度[ど]',
        source: 'jiten',
        jitenWordId: 2_005_860,
        jitenReadingIndex: 0,
    };
}

function jitenCompoundInfo(): JitenVocabularyInfo {
    return {
        wordId: 2_005_860,
        mainReading: { text: 'もう一[いち]度[ど]', readingIndex: 0, frequencyRank: 542, usedInMediaAmount: 11_333 },
        alternativeReadings: [],
        partsOfSpeech: ['exp', 'adv'],
        definitions: [{ index: 1, meanings: ['once more', 'again'], partsOfSpeech: ['expressions', 'adverb'], misc: [], field: [], dial: [], restrictedToReadingIndices: [] }],
        pitchAccents: [],
        knownStates: [],
        composedOf: [
            { wordId: 1_012_480, readingIndex: 0, reading: 'もう', readingFurigana: 'もう', mainDefinition: 'already', frequencyRank: 42, matchSurface: '' },
            { wordId: 1_576_250, readingIndex: 0, reading: '一度', readingFurigana: '一[いち]度[ど]', mainDefinition: 'once', frequencyRank: 361, matchSurface: '' },
        ],
        usedIn: [],
        usedInTotal: 0,
        examples: [],
    };
}
