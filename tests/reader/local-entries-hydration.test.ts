import { describe, expect, it, vi } from 'vitest';
import { CardRenderDataLoader } from '../../src/reader/cards/render-data';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBCard } from '../../src/reader/app/types';
import type { YomitanTermEntry } from '../../src/reader/dictionaries/yomitan/types';

type CardRenderDataLoaderDependencies = ConstructorParameters<typeof CardRenderDataLoader>[0];

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(res => { resolve = res; });
    return { promise, resolve };
}

function card(): JPDBCard {
    return {
        vid: 1, sid: 0, rid: 0,
        spelling: '読む', reading: 'よむ',
        frequencyRank: 100, partOfSpeech: [], meanings: [],
        cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null,
        source: 'jpdb',
    } as unknown as JPDBCard;
}

function termEntry(): YomitanTermEntry {
    return {
        dictionary: 'Jitendex.org [2026-06-06]', expression: '読む', reading: 'よむ',
        glossary: ['to read'], rules: '', score: 0, sequence: 1, tags: '', termTags: '',
    } as unknown as YomitanTermEntry;
}

function createLoader(lookup: () => Promise<YomitanTermEntry[]>): CardRenderDataLoader {
    return new CardRenderDataLoader({
        getSettings: () => ({ ...DEFAULT_SETTINGS, localDictionariesEnabled: true, showPitchAccent: false, ankiEnabled: false, jpdbDefinitionsEnabled: false, jitenDefinitionsEnabled: false }),
        dictionaries: { lookup: vi.fn(lookup), lookupKanji: vi.fn(async () => []), lookupTermMeta: vi.fn(async () => []) } as any,
        jpdbPublicPitch: { lookup: vi.fn(async () => []) } as any,
        jpdbVocabulary: { lookup: vi.fn(async () => null) } as any,
        anki: { findExistingCards: vi.fn(), deckNames: vi.fn() } as any,
        jpdb: { listDecks: vi.fn() } as any,
        isJpdbBackedCard: () => true,
    } as unknown as CardRenderDataLoaderDependencies);
}

// A cold local-dictionary lookup that loses the 2.5s render race must render
// LATE via hydrateLocalEntries, never NEVER: the capped race alone silently
// discarded the real result and the installed dictionary vanished from the
// popover on slow IndexedDB (WebKit/iPad, large or duplicated dictionaries).
describe('local term entries render timeout hydration', () => {
    it('caps the initial render but hydrates late local results', async () => {
        vi.useFakeTimers();
        try {
            const gate = deferred<YomitanTermEntry[]>();
            const loader = createLoader(() => gate.promise);
            const load = loader.load(card());

            await vi.advanceTimersByTimeAsync(5_000);
            expect(await load.localEntries).toEqual([]);

            gate.resolve([termEntry()]);
            const hydrated = await load.hydrateLocalEntries?.();
            expect(hydrated).toHaveLength(1);
            expect(hydrated?.[0]?.dictionary).toBe('Jitendex.org [2026-06-06]');
        } finally {
            vi.useRealTimers();
        }
    });

    it('resolves fast local lookups through the capped promise unchanged', async () => {
        const loader = createLoader(async () => [termEntry()]);
        const load = loader.load(card());
        expect(await load.localEntries).toHaveLength(1);
        expect(await load.hydrateLocalEntries?.()).toHaveLength(1);
    });
});
