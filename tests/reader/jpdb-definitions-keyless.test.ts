import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardRenderDataLoader } from '../../src/reader/cards/render-data';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import type { JpdbVocabularyInfo, JpdbVocabularyLookupResult } from '../../src/reader/jpdb/jpdb-vocabulary';
import { setInnerHtml } from "../../src/reader/dom";
import { renderJpdbDefinitionSource } from "../../src/reader/jpdb/jpdb-definition-source-render";
import { renderedJpdbRelatedWords } from "../../src/reader/jpdb/jpdb-related-words";

type LoaderDependencies = ConstructorParameters<typeof CardRenderDataLoader>[0];

function card(): JPDBCard {
    return {
        vid: 1579110,
        sid: 0,
        rid: 0,
        spelling: '今日',
        reading: 'きょう',
        frequencyRank: 95,
        partOfSpeech: ['n'],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jiten',
        sentence: '今日',
    } as unknown as JPDBCard;
}

const JPDB_INFO: JpdbVocabularyInfo = { meanings: ['today'], compounds: [], usedInVocabulary: [], examples: [] };
afterEach(() => { vi.restoreAllMocks(); });

function loader(settings: Partial<ReaderSettings>, lookup: () => Promise<JpdbVocabularyLookupResult>): CardRenderDataLoader {
    return new CardRenderDataLoader({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            localDictionariesEnabled: false,
            showPitchAccent: false,
            ankiEnabled: false,
            jitenDefinitionsEnabled: false,
            bunproDefinitionsEnabled: false,
            jpdbMiningEnabled: false,
            ...settings,
        }),
        dictionaries: { lookup: vi.fn(async () => []), lookupKanji: vi.fn(async () => []), lookupTermMeta: vi.fn(async () => []) },
        jpdbPublicPitch: { lookup: vi.fn(async () => []) },
        jpdbVocabulary: { lookup, search: vi.fn(async () => ({ cards: [], status: 'complete' as const })) },
        anki: { findExistingCards: vi.fn(), deckNames: vi.fn() },
        jpdb: { listDecks: vi.fn() },
        isJpdbBackedCard: () => false,
    } as unknown as LoaderDependencies);
}

describe('keyless JPDB definitions', () => {
    it.each(['card', 'sources'] as const)('keeps usable partial JPDB data for the normal %s render-cache lifetime', async mode => {
        let now = 100_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const lookup = vi.fn(async (): Promise<JpdbVocabularyLookupResult> => ({ info: JPDB_INFO, status: 'partial' }));
        const instance = loader({ jpdbDefinitionsEnabled: true }, lookup);
        const target = card();
        const load = () => mode === 'card' ? instance.load(target) : instance.loadDefinitionSources(target);
        const first = load();
        expect(await first.jpdbVocabularyInfo).toEqual(JPDB_INFO);
        now += 2_000;
        expect(load()).toBe(first);
        now += 27_999;
        expect(load()).toBe(first);
        expect(lookup).toHaveBeenCalledTimes(1);
        const completeInfo = { ...JPDB_INFO, examples: [{ sentence: '今日は晴れです。', translation: 'It is sunny today.' }] };
        lookup.mockResolvedValue({ info: completeInfo, status: 'complete' });
        now += 2;
        const next = load();
        expect(next).not.toBe(first);
        expect(await next.jpdbVocabularyInfo).toEqual(completeInfo);
        expect(lookup).toHaveBeenCalledTimes(2);
    });

    it.each(['card', 'sources'] as const)('still retries a failed JPDB lookup through the %s render cache after a second', async mode => {
        let now = 100_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const lookup = vi.fn(async (): Promise<JpdbVocabularyLookupResult> => { throw new Error('JPDB request failed (503)'); });
        const instance = loader({ jpdbDefinitionsEnabled: true }, lookup);
        const target = card();
        const load = () => mode === 'card' ? instance.load(target) : instance.loadDefinitionSources(target);
        const first = load();
        expect(await first.jpdbVocabularyInfo).toBeNull();
        now += 999;
        expect(load()).toBe(first);
        lookup.mockResolvedValue({ info: JPDB_INFO, status: 'complete' });
        now += 2;
        const next = load();
        expect(next).not.toBe(first);
        expect(await next.jpdbVocabularyInfo).toEqual(JPDB_INFO);
        expect(lookup).toHaveBeenCalledTimes(2);
    });

    it('loads JPDB vocabulary details without a JPDB API credential', async () => {
        // The lookup scrapes public jpdb.io pages; gating it on an API key left
        // "JPDB definitions" enabled-but-dead for no-key users, so the popover
        // showed only the Jiten source with both providers turned on.
        const lookup = vi.fn(async () => ({ info: JPDB_INFO, status: 'complete' as const }));
        const data = await loader({ jpdbDefinitionsEnabled: true }, lookup).load(card()).all;

        // The source card is Jiten-backed, so its id must not be mistaken for a
        // JPDB vid; public JPDB search resolves the matching identity instead.
        expect(lookup).toHaveBeenCalledWith(0, '今日', 'きょう');
        expect((data as { jpdbVocabularyInfo: JpdbVocabularyInfo | null }).jpdbVocabularyInfo).toEqual(JPDB_INFO);
    });

    it('stays off when JPDB definitions are disabled', async () => {
        const lookup = vi.fn(async () => ({ info: JPDB_INFO, status: 'complete' as const }));
        const data = await loader({ jpdbDefinitionsEnabled: false }, lookup).load(card()).all;

        expect(lookup).not.toHaveBeenCalled();
        expect((data as { jpdbVocabularyInfo: JpdbVocabularyInfo | null }).jpdbVocabularyInfo).toBeNull();
    });
});

describe('JPDB definition source rendering', () => {
    function card(overrides: Partial<JPDBCard> = {}): JPDBCard {
        return {
            vid: 1,
            sid: 1,
            rid: 0,
            spelling: '大学',
            reading: 'だいがく',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [{ glosses: ['university'], partOfSpeech: [] }],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'jpdb',
            ...overrides,
        };
    }


    it('uses the configured source title', () => {
        const mount = document.createElement('div');
        setInnerHtml(mount, renderJpdbDefinitionSource(card(), key => `data-source-state-key="${key}"`, null, 'en', 'Cards API'));

        expect(mount.querySelector('summary')?.textContent?.trim()).toBe('Cards API');
    });

    it('renders used-in words for enrichment and examples for nested parsing', () => {
        const info: JpdbVocabularyInfo = {
            meanings: ['university'],
            compounds: [],
            usedInVocabulary: [{
                term: '大学院',
                reading: 'だいがくいん',
                meaning: 'graduate school',
                url: '/vocabulary/123/%E5%A4%A7%E5%AD%A6%E9%99%A2/%E3%81%A0%E3%81%84%E3%81%8C%E3%81%8F%E3%81%84%E3%82%93#a',
                termHtml: '<ruby><span class="jpdb-reader-ruby-base">大学</span><rp>(</rp><rt class="jpdb-reader-furi">だいがく</rt><rp>)</rp></ruby>院',
            }],
            examples: [{
                sentence: '大学で日本語を勉強します。',
                sentenceHtml: '',
                translation: 'I study Japanese at university.',
                audioIds: [],
            }],
        };
        const mount = document.createElement('div');
        setInnerHtml(mount, renderJpdbDefinitionSource(card(), key => `data-source-state-key="${key}"`, info, 'en'));

        const related = renderedJpdbRelatedWords(mount);
        expect(related).toHaveLength(1);
        expect(related[0]?.token.card).toMatchObject({
            vid: 123,
            sid: 0,
            spelling: '大学院',
            reading: 'だいがくいん',
            source: 'jpdb',
        });
        expect(related[0]?.word.classList.contains('jpdb-reader-has-furi')).toBe(true);
        expect(related[0]?.word.dataset.pitchClass).toBe('unknown');

        const example = mount.querySelector<HTMLElement>('.jpdb-reader-example-sentence');
        expect(example?.classList.contains('jpdb-reader-parseable')).toBe(true);
        // The headword occurrence is rendered as a rich passive JPDB word (with
        // ruby), but it is scoped out of renderedJpdbRelatedWords above.
        const exampleWord = example?.querySelector<HTMLElement>('.jpdb-reader-word[data-expression="大学"]');
        expect(exampleWord).not.toBeNull();
        expect(example?.textContent?.startsWith('大学')).toBe(true);
        expect(example?.textContent).toContain('で日本語を勉強します。');
        expect(mount.querySelector<HTMLElement>('[data-provider-example-translation]')?.dataset.providerTranslationBlurred).toBe('true');
    });

    // YQ-08: an example follows the meaning, and the related-word lists that
    // come after it stay collapsed without a count.
    it('puts the example before compounds and used-in words, with no used-in count', () => {
        const info: JpdbVocabularyInfo = {
            meanings: ['university'],
            compounds: [{
                term: '大学生',
                reading: 'だいがくせい',
                meaning: 'university student',
                url: '/vocabulary/124/%E5%A4%A7%E5%AD%A6%E7%94%9F/%E3%81%A0%E3%81%84%E3%81%8C%E3%81%8F%E3%81%9B%E3%81%84#a',
            }],
            usedInVocabulary: [{
                term: '大学院',
                reading: 'だいがくいん',
                meaning: 'graduate school',
                url: '/vocabulary/123/%E5%A4%A7%E5%AD%A6%E9%99%A2/%E3%81%A0%E3%81%84%E3%81%8C%E3%81%8F%E3%81%84%E3%82%93#a',
            }],
            examples: [{
                sentence: '大学で日本語を勉強します。',
                sentenceHtml: '',
                translation: 'I study Japanese at university.',
                audioIds: [],
            }],
        };
        const mount = document.createElement('div');
        setInnerHtml(mount, renderJpdbDefinitionSource(card(), key => `data-source-state-key="${key}"`, info, 'en'));

        const example = mount.querySelector('.jpdb-reader-example-sentence')!;
        const compounds = mount.querySelector('.jpdb-reader-jpdb-compounds')!;
        const usedIn = mount.querySelector<HTMLDetailsElement>('.jpdb-reader-jpdb-used-in-group')!;
        const follows = (first: Node, second: Node) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
        expect(follows(example, compounds)).toBe(true);
        expect(follows(example, usedIn)).toBe(true);
        expect(usedIn.open).toBe(false);
        expect(usedIn.querySelector('summary')?.textContent?.trim()).toBe('Used in vocabulary');
        expect(usedIn.querySelector('.jpdb-reader-example-count')).toBeNull();
    });
});
