import { describe, expect, it, vi } from 'vitest';
import { CardRenderDataLoader } from '../../src/reader/cards/render-data';
import { CardPopoverRenderer } from '../../src/reader/cards/popover-renderer';
import { alignedExpressionComponentPitches, renderExpressionComponentPitches } from '../../src/reader/popup/render';
import { pitchPatternFromPosition } from '../../src/reader/lookup/pitch-accent';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import type { AnkiConnectClient } from '../../src/reader/anki/index';
import type { JpdbClient } from '../../src/reader/jpdb/jpdb';
import type { JpdbPublicPitchClient } from '../../src/reader/jpdb/jpdb-public-pitch';
import type { JpdbVocabularyClient } from '../../src/reader/jpdb/jpdb-vocabulary';
import type { JitenApiClient, JitenVocabularyInfo } from '../../src/reader/dictionaries/jiten';
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
    jitenInfo?: JitenVocabularyInfo | null;
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
        jiten: {
            lookupVocabularyInfoForCard: vi.fn(async () => options.jitenInfo ?? null),
            listReaderStudyDecks: vi.fn(async () => []),
        } as unknown as JitenApiClient,
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

        expect(data.expressionComponents?.map(component => component.text)).toEqual(['気合い', '入れる']);
        expect(data.componentPitches?.map(component => component.text)).toEqual(['気合い', '入れる']);
        expect(data.componentPitches?.map(component => component.reading)).toEqual(['きあい', 'いれる']);
        expect(data.componentPitches?.every(component => component.pitch.length > 0)).toBe(true);
    });

    it('segments compound idioms into lookup components instead of keeping only the full entry', async () => {
        const loader = createLoader({
            entriesByTerm: {
                跳梁跋扈: [termEntry('跳梁跋扈', 'ちょうりょうばっこ')],
                跳梁: [termEntry('跳梁', 'ちょうりょう')],
                跋扈: [termEntry('跋扈', 'ばっこ')],
            },
            metaByTerm: {
                跳梁: [pitchMeta('跳梁', 'ちょうりょう', 0)],
                跋扈: [pitchMeta('跋扈', 'ばっこ', 1)],
            },
        });

        const data = await loader.load(expressionCard('跳梁跋扈', 'ちょうりょうばっこ')).all;

        expect(data.expressionComponents?.map(component => component.text)).toEqual(['跳梁', '跋扈']);
        expect(data.expressionComponents?.map(component => component.reading)).toEqual(['ちょうりょう', 'ばっこ']);
        expect(data.componentPitches?.map(component => component.text)).toEqual(['跳梁', '跋扈']);
        expect(data.componentPitches?.every(component => component.pitch.length > 0)).toBe(true);
    });

    it('surfaces Jiten decomposition as generic navigable components without local dictionaries', async () => {
        const loader = createLoader({
            entriesByTerm: {},
            metaByTerm: {},
            settings: { localDictionariesEnabled: false, jitenDefinitionsEnabled: true },
            jitenInfo: {
                wordId: 32022,
                mainReading: { text: '高評価', readingIndex: 0, frequencyRank: null, usedInMediaAmount: null },
                alternativeReadings: [],
                partsOfSpeech: ['noun'],
                definitions: [],
                pitchAccents: [0],
                knownStates: [],
                composedOf: [
                    { wordId: 6424, readingIndex: 0, reading: 'こう', readingFurigana: 'こう', mainDefinition: 'high', frequencyRank: null, matchSurface: '高', pitchAccents: [1] },
                    { wordId: 2321, readingIndex: 0, reading: 'ひょうか', readingFurigana: 'ひょうか', mainDefinition: 'evaluation', frequencyRank: null, matchSurface: '評価', pitchAccents: [0] },
                ],
                usedIn: [],
                usedInTotal: 0,
                examples: [],
            },
        });

        const data = await loader.load(expressionCard('高評価', 'こうひょうか')).all;

        expect(data.expressionComponents).toEqual([
            { text: '高', reading: 'こう' },
            { text: '評価', reading: 'ひょうか' },
        ]);
        expect(data.componentPitches?.map(component => component.text)).toEqual(['高', '評価']);
        expect(data.componentPitches?.every(component => component.pitch.length > 0)).toBe(true);
    });

    it('keeps 間違い pitch 3 as the primary graph despite the 間 + 違い decomposition', async () => {
        const loader = createLoader({
            entriesByTerm: {},
            metaByTerm: {},
            settings: { localDictionariesEnabled: false, jitenDefinitionsEnabled: true },
            jitenInfo: {
                wordId: 1215320,
                mainReading: { text: '間違い', readingIndex: 0, frequencyRank: 1114, usedInMediaAmount: null },
                alternativeReadings: [],
                partsOfSpeech: ['noun'],
                definitions: [],
                pitchAccents: [3],
                knownStates: [],
                composedOf: [
                    { wordId: 1215240, readingIndex: 0, reading: 'ま', readingFurigana: '間[ま]', mainDefinition: 'time', frequencyRank: 2979, matchSurface: '間' },
                    { wordId: 1158870, readingIndex: 0, reading: 'ちがい', readingFurigana: '違[ちが]い', mainDefinition: 'difference', frequencyRank: 1561, matchSurface: '違い' },
                ],
                usedIn: [],
                usedInTotal: 0,
                examples: [],
            },
        });
        const card = expressionCard('間違い', 'まちがい');
        card.pitchAccent = [pitchPatternFromPosition(card.reading, 3)];
        const data = await loader.load(card).all;
        const renderer = new CardPopoverRenderer({
            getSettings: () => ({ ...DEFAULT_SETTINGS, showPitchAccent: true }),
            isJpdbBackedCard: () => false,
            renderWordHistory: () => '',
            renderWordPills: () => '',
            renderDefinitionSources: () => '',
            dictionarySourceAttributes: () => '',
            dictionaryLabel: name => name,
        });

        document.body.innerHTML = renderer.render(card, card.spelling, 'modal', { ...data, loading: false });

        expect(document.querySelectorAll('.jpdb-reader-card-tools .jpdb-reader-pitch svg')).toHaveLength(1);
        expect(document.querySelector('.jpdb-reader-pitch-components')).toBeNull();
        expect(document.querySelector('.jpdb-reader-expression-component-list')?.textContent).toContain('間');
        expect(document.querySelector('.jpdb-reader-expression-component-list')?.textContent).toContain('違');
    });

    it('segments kanji-only compound components even when the full compound is missing locally', async () => {
        const loader = createLoader({
            entriesByTerm: {
                跳梁: [termEntry('跳梁', 'ちょうりょう')],
                跋扈: [termEntry('跋扈', 'ばっこ')],
            },
            metaByTerm: {
                跳梁: [pitchMeta('跳梁', 'ちょうりょう', 0)],
                跋扈: [pitchMeta('跋扈', 'ばっこ', 1)],
            },
        });

        const data = await loader.load(expressionCard('跳梁跋扈', 'ちょうりょうばっこ')).all;

        expect(data.expressionComponents?.map(component => component.text)).toEqual(['跳梁', '跋扈']);
        expect(data.componentPitches?.map(component => component.text)).toEqual(['跳梁', '跋扈']);
    });

    it('segments kanji-stem + okurigana compounds like 国内向け (mixed kanji/kana)', async () => {
        // 国内向け is neither all-kanji nor particle-bearing, so the old gate
        // rejected it before segmentation; it is also not a standalone headword.
        // The kanji-led heuristic now lets the whole 〜向け family decompose.
        const loader = createLoader({
            entriesByTerm: {
                国内: [termEntry('国内', 'こくない')],
                向け: [termEntry('向け', 'むけ')],
            },
            metaByTerm: {
                国内: [pitchMeta('国内', 'こくない', 0)],
                向け: [pitchMeta('向け', 'むけ', 0)],
            },
        });

        const data = await loader.load(expressionCard('国内向け', 'こくないむけ')).all;

        expect(data.expressionComponents?.map(component => component.text)).toEqual(['国内', '向け']);
        expect(data.componentPitches?.map(component => component.text)).toEqual(['国内', '向け']);
    });

    it('does not decompose a bare component or a short verb', async () => {
        const loader = createLoader({ entriesByTerm: {}, metaByTerm: {} });
        expect((await loader.load(expressionCard('向け', 'むけ')).all).expressionComponents ?? []).toEqual([]);
        expect((await loader.load(expressionCard('食べる', 'たべる')).all).expressionComponents ?? []).toEqual([]);
    });

    it('keeps whole-card pitch unknown while retaining component pitch rows', async () => {
        const loader = createLoader({
            entriesByTerm: {
                登録: [termEntry('登録', 'とうろく')],
                者: [termEntry('者', 'しゃ')],
                数: [termEntry('数', 'すう')],
            },
            metaByTerm: {
                登録: [pitchMeta('登録', 'とうろく', 0)],
                者: [pitchMeta('者', 'しゃ', 1)],
                数: [pitchMeta('数', 'すう', 1)],
            },
        });
        const card = expressionCard('登録者数', 'とうろくしゃすう');

        const data = await loader.load(card).all;

        expect(card.pitchAccent).toEqual([]);
        expect(data.expressionComponents?.map(component => component.text)).toEqual(['登録', '者', '数']);
        expect(data.componentPitches?.map(component => component.text)).toEqual(['登録', '者', '数']);
    });

    it('keeps component pitch data when the card already has a whole pitch', async () => {
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
        const card = expressionCard('気合いを入れる', 'きあいをいれる');
        card.pitchAccent = ['LHHHHHHH'];

        const data = await loader.load(card).all;

        expect(card.pitchAccent).toEqual(['LHHHHHHH']);
        expect(data.componentPitches?.map(component => component.text)).toEqual(['気合い', '入れる']);
    });

    it('keeps exact whole-word pitch primary while labelling component evidence separately', async () => {
        const loader = createLoader({
            entriesByTerm: {
                双子座流星群: [termEntry('双子座流星群', 'ふたござりゅうせいぐん')],
                双子座: [termEntry('双子座', 'ふたござ')],
                流星群: [termEntry('流星群', 'りゅうせいぐん')],
            },
            metaByTerm: {
                双子座流星群: [pitchMeta('双子座流星群', 'ふたござりゅうせいぐん', 0)],
                双子座: [pitchMeta('双子座', 'ふたござ', 0)],
                流星群: [pitchMeta('流星群', 'りゅうせいぐん', 3)],
            },
        });
        const card = expressionCard('双子座流星群', 'ふたござりゅうせいぐん');
        card.pitchAccent = ['LHHHHHHHHHH'];

        const data = await loader.load(card).all;

        expect(data.expressionComponents).toEqual([
            { text: '双子座', reading: 'ふたござ' },
            { text: '流星群', reading: 'りゅうせいぐん' },
        ]);
        expect(data.componentPitches?.map(component => component.text)).toEqual(['双子座', '流星群']);

        const renderer = new CardPopoverRenderer({
            getSettings: () => ({ ...DEFAULT_SETTINGS, showPitchAccent: true }),
            isJpdbBackedCard: () => false,
            renderWordHistory: () => '',
            renderWordPills: () => '',
            renderDefinitionSources: () => '',
            dictionarySourceAttributes: () => '',
            dictionaryLabel: name => name,
        });
        document.body.innerHTML = renderer.render(card, card.spelling, 'modal', { ...data, loading: false });

        expect(document.querySelector('.jpdb-reader-pitch-components')).toBeNull();
        expect(document.querySelectorAll('.jpdb-reader-card-tools .jpdb-reader-pitch svg')).toHaveLength(1);
        expect(document.querySelector('.jpdb-reader-pitch-variants')).toBeNull();
        expect(document.querySelector('.jpdb-reader-expression-component-list')?.textContent).toContain('双子座');
        expect(document.querySelector('.jpdb-reader-expression-component-list')?.textContent).toContain('流星群');
    });

    it('keeps componentPitches empty when only one component is found', async () => {
        const loader = createLoader({
            entriesByTerm: { 気合い: [termEntry('気合い', 'きあい')] },
            metaByTerm: { 気合い: [pitchMeta('気合い', 'きあい', 0)] },
        });

        const data = await loader.load(expressionCard('気合いを', 'きあいを')).all;

        expect(data.expressionComponents ?? []).toEqual([]);
        expect(data.componentPitches ?? []).toEqual([]);
    });

    it('does not treat a partial decomposition that skipped connective text as the whole compound', () => {
        const card = expressionCard('気合いを入れる', 'きあいをいれる');
        const components = [
            { text: '気合い', reading: 'きあい' },
            { text: '入れる', reading: 'いれる' },
        ];
        const pitches = components.map(component => ({ ...component, pitch: 'LHHH' }));

        expect(alignedExpressionComponentPitches(card, components, pitches)).toEqual([]);
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
