import { describe, expect, it, vi } from 'vitest';
import { CardRenderDataLoader } from '../../src/reader/cards/render-data';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import { renderWordPills } from '../../src/reader/sources/word-pills';
import type { JitenVocabularyInfo } from '../../src/reader/dictionaries/jiten';
import type { JPDBCard } from '../../src/reader/app/types';

type CardRenderDataLoaderDependencies = ConstructorParameters<typeof CardRenderDataLoader>[0];

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(res => { resolve = res; });
    return { promise, resolve };
}

function nonJitenCard(): JPDBCard {
    return {
        vid: 1000, sid: 0, rid: 0,
        spelling: '今日', reading: 'きょう',
        frequencyRank: 200, partOfSpeech: [], meanings: [],
        cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null,
        source: 'jpdb',
    } as unknown as JPDBCard;
}

function jitenInfo(): JitenVocabularyInfo {
    return {
        wordId: 1579110,
        mainReading: { text: '今日', readingIndex: 0, frequencyRank: 95, usedInMediaAmount: 1 },
        alternativeReadings: [], partsOfSpeech: ['n'], definitions: [{ index: 0, meanings: ['today'], partsOfSpeech: [], field: [], dial: [], misc: [], restrictedToReadingIndices: [] }],
        pitchAccents: [], knownStates: [], composedOf: [], usedIn: [], usedInTotal: 0, examples: [],
    } as unknown as JitenVocabularyInfo;
}

function createLoader(lookupVocabularyInfoForCard: () => Promise<JitenVocabularyInfo | null>): CardRenderDataLoader {
    return new CardRenderDataLoader({
        getSettings: () => ({ ...DEFAULT_SETTINGS, localDictionariesEnabled: false, showPitchAccent: false, ankiEnabled: false, jpdbDefinitionsEnabled: false, jitenDefinitionsEnabled: true }),
        dictionaries: { lookup: vi.fn(async () => []), lookupKanji: vi.fn(async () => []), lookupTermMeta: vi.fn(async () => []) } as any,
        jpdbPublicPitch: { lookup: vi.fn(async () => []) } as any,
        jpdbVocabulary: { lookup: vi.fn(async () => null) } as any,
        anki: { findExistingCards: vi.fn(), deckNames: vi.fn() } as any,
        jpdb: { listDecks: vi.fn() } as any,
        jiten: { lookupVocabularyInfoForCard } as any,
        isJpdbBackedCard: () => true,
    } as unknown as CardRenderDataLoaderDependencies);
}

describe('Jiten vocabulary render timeout hydration', () => {
    it('caps the aggregate at the render timeout but still hydrates late results', async () => {
        vi.useFakeTimers();
        try {
            const gate = deferred<JitenVocabularyInfo | null>();
            const loader = createLoader(() => gate.promise);
            const load = loader.load(nonJitenCard());

            // The capped promise falls back to null once the render timeout elapses,
            // so the initial full render is never blocked on a slow Jiten link.
            await vi.advanceTimersByTimeAsync(5_000);
            expect(await load.jitenVocabularyInfo).toBeNull();

            // The uncapped hydration promise still surfaces the real result when it
            // arrives late — the fix that stops the frequency pill and Jiten source
            // from being dropped on a slow connection.
            gate.resolve(jitenInfo());
            const hydrated = await load.hydrateJitenVocabularyInfo?.();
            expect(hydrated?.mainReading?.frequencyRank).toBe(95);
        } finally {
            vi.useRealTimers();
        }
    });

    it('shares one lookup between the capped and hydration promises (no double request)', async () => {
        const lookup = vi.fn(async () => jitenInfo());
        const loader = createLoader(lookup);
        const load = loader.load(nonJitenCard());
        expect(await load.jitenVocabularyInfo).not.toBeNull();
        expect(await load.hydrateJitenVocabularyInfo?.()).not.toBeNull();
        expect(lookup).toHaveBeenCalledTimes(1);
    });

    // The reported symptom: a non-Jiten card shows the JPDB rank but the Jiten
    // pill stays blank. Once the (late) Jiten info is available, the pill must
    // carry the Jiten frequency rank — this is what the hydration re-render feeds
    // into renderWordPills.
    it('merges the Jiten frequency rank into the pill for a non-Jiten card', () => {
        const withInfo = renderWordPills({
            card: nonJitenCard(),
            jpdbUrl: 'https://jpdb.io/search?q=%E4%BB%8A%E6%97%A5',
            settings: DEFAULT_SETTINGS,
            jitenVocabularyInfo: jitenInfo(),
            isJpdbBackedCard: () => false,
            dictionaryLabel: name => name,
        });
        expect(withInfo).toContain('Jiten #95');

        const withoutInfo = renderWordPills({
            card: nonJitenCard(),
            jpdbUrl: 'https://jpdb.io/search?q=%E4%BB%8A%E6%97%A5',
            settings: DEFAULT_SETTINGS,
            jitenVocabularyInfo: null,
            isJpdbBackedCard: () => false,
            dictionaryLabel: name => name,
        });
        expect(withoutInfo).not.toContain('Jiten #');
    });
});
