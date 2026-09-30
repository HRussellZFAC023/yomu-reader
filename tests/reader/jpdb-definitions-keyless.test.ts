import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardRenderDataLoader } from '../../src/reader/cards/render-data';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import type { JpdbVocabularyInfo, JpdbVocabularyLookupResult } from '../../src/reader/jpdb/jpdb-vocabulary';

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
