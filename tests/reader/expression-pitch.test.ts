import { describe, expect, it, vi } from 'vitest';
import { CardRenderDataLoader } from '../../src/reader/cards/render-data';
import { renderExpressionComponentPitches } from '../../src/reader/popup/render';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import type { AnkiConnectClient } from '../../src/reader/anki/index';
import type { JpdbClient } from '../../src/reader/jpdb/jpdb';
import type { JpdbPublicPitchClient } from '../../src/reader/jpdb/jpdb-public-pitch';
import type { JpdbVocabularyClient } from '../../src/reader/jpdb/jpdb-vocabulary';
import type { YomitanDictionaryStore, YomitanMetaEntry, YomitanTermEntry } from '../../src/reader/dictionaries/yomitan';

function expressionCard(spelling: string, reading: string): JPDBCard {
    return {
        vid: 9,
        sid: 9,
        rid: 9,
        spelling,
        reading,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
    } as JPDBCard;
}

function pitchMeta(expression: string, reading: string, position: number): YomitanMetaEntry {
    return { expression, mode: 'pitch', data: { reading, pitches: [{ position }] }, dictionary: 'Pitch' };
}

function termEntry(expression: string, reading: string): YomitanTermEntry {
    return { expression, reading, glossary: ['gloss'], dictionary: 'JMdict' };
}

function createLoader(options: {
    entriesByTerm: Record<string, YomitanTermEntry[]>;
    metaByTerm: Record<string, YomitanMetaEntry[]>;
    settings?: Partial<ReaderSettings>;
}): CardRenderDataLoader {
    return new CardRenderDataLoader({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            localDictionariesEnabled: true,
            localDictionaryShowKanji: false,
            showPitchAccent: true,
            ankiEnabled: false,
            jpdbDefinitionsEnabled: false,
            jpdbMiningEnabled: false,
            ...options.settings,
        }),
        dictionaries: {
            lookup: vi.fn(async (term: string) => options.entriesByTerm[term] ?? []),
            lookupKanji: vi.fn(async () => []),
            lookupTermMeta: vi.fn(async (term: string) => options.metaByTerm[term] ?? []),
        } as unknown as YomitanDictionaryStore,
        jpdbPublicPitch: { lookup: vi.fn(async () => []) } as unknown as JpdbPublicPitchClient,
        jpdbVocabulary: { lookup: vi.fn(async () => null) } as unknown as JpdbVocabularyClient,
        anki: { findExistingCards: vi.fn(), deckNames: vi.fn() } as unknown as AnkiConnectClient,
        jpdb: { listDecks: vi.fn() } as unknown as JpdbClient,
        isJpdbBackedCard: () => false,
    });
}

describe('expression component pitch', () => {
    it('collects per-component pitches for expressions with no pitch of their own', async () => {
        const loader = createLoader({
            entriesByTerm: {
                気合い: [termEntry('気合い', 'きあい')],
                入れる: [termEntry('入れる', 'いれる')],
            },
            metaByTerm: {
                気合い: [pitchMeta('気合い', 'きあい', 0)],
                入れる: [pitchMeta('入れる', 'いれる', 0)],
            },
        });

        const data = await loader.load(expressionCard('気合いを入れる', 'きあいをいれる')).all;

        expect(data.componentPitches?.map(component => component.text)).toEqual(['気合い', '入れる']);
        expect(data.componentPitches?.map(component => component.reading)).toEqual(['きあい', 'いれる']);
        expect(data.componentPitches?.every(component => component.pitch.length > 0)).toBe(true);
    });

    it('keeps componentPitches empty when the card has its own pitch', async () => {
        const loader = createLoader({
            entriesByTerm: { 読む: [termEntry('読む', 'よむ')] },
            metaByTerm: { 読む: [pitchMeta('読む', 'よむ', 1)] },
        });
        const card = expressionCard('読む', 'よむ');
        card.pitchAccent = ['HLL'];

        const data = await loader.load(card).all;

        expect(data.componentPitches ?? []).toEqual([]);
    });

    it('keeps componentPitches empty when only one component is found', async () => {
        const loader = createLoader({
            entriesByTerm: { 気合い: [termEntry('気合い', 'きあい')] },
            metaByTerm: { 気合い: [pitchMeta('気合い', 'きあい', 0)] },
        });

        const data = await loader.load(expressionCard('気合いを', 'きあいを')).all;

        expect(data.componentPitches ?? []).toEqual([]);
    });

    it('renders one labelled mini graph per component', () => {
        const html = renderExpressionComponentPitches([
            { text: '気合い', reading: 'きあい', pitch: 'LHH' },
            { text: '入れる', reading: 'いれる', pitch: 'LHH' },
        ]);

        expect(html).toContain('jpdb-reader-pitch-components');
        expect((html.match(/<svg/g) ?? [])).toHaveLength(2);
        expect(html).toContain('気合い');
        expect(html).toContain('入れる');
        expect((html.match(/jpdb-reader-pitch-component-label/g) ?? [])).toHaveLength(2);
    });

    it('renders nothing for an empty component list', () => {
        expect(renderExpressionComponentPitches([])).toBe('');
    });
});
