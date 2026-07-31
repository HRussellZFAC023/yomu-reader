import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { cardKey } from '../../src/reader/cards/utils';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../src/reader/languages/target-runtime';
import { NewTabRuntime } from '../../src/reader/newtab/runtime';
import { NewTabTargetLookupResolver } from '../../src/reader/newtab/target-lookup-resolver';
import { NewTabLookupTargetScope } from '../../src/reader/newtab/target-scope';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
}

function card(vid: number, spelling: string, reading: string, source: JPDBCard['source']): JPDBCard {
    return {
        vid,
        sid: 1,
        rid: 0,
        spelling,
        reading,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source,
    };
}

function token(wordCard: JPDBCard): JPDBToken {
    return {
        card: wordCard,
        start: 0,
        end: wordCard.spelling.length,
        length: wordCard.spelling.length,
        rubies: [],
        pitchClass: 'unknown',
        sentence: wordCard.spelling,
    };
}

function switchAwayAndBack(): void {
    setActiveLearningTargetLanguage('ko');
    setActiveLearningTargetLanguage('ja');
}

beforeEach(() => resetActiveLearningTargetLanguage());

afterEach(() => {
    resetActiveLearningTargetLanguage();
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

describe('New Tab background target generations', () => {
    it('does not mutate pitch data or repaint after an away-and-back target switch', async () => {
        const pending = deferred<string[]>();
        const wordCard = card(41, '猫', 'ねこ', 'jpdb');
        const wordToken = token(wordCard);
        const popover = document.createElement('section');
        popover.innerHTML = '<span class="jpdb-reader-word jpdb-pitch-unknown" data-vid="41" data-sid="1">猫</span>';
        document.body.append(popover);
        const runtime = new NewTabRuntime() as unknown as {
            settings: ReaderSettings;
            activeLookupPopover?: HTMLElement;
            jpdbPublicPitch: { lookup(): Promise<string[]> };
            enrichPitchWords(tokens: JPDBToken[]): Promise<void>;
            destroy(): void;
        };
        runtime.settings = { ...DEFAULT_SETTINGS, showPitchAccent: true };
        runtime.activeLookupPopover = popover;
        runtime.jpdbPublicPitch = { lookup: vi.fn(() => pending.promise) };

        const enrichment = runtime.enrichPitchWords([wordToken]);
        switchAwayAndBack();
        pending.resolve(['HLL']);
        await enrichment;

        expect(wordCard.pitchAccent).toEqual([]);
        expect(popover.querySelector('.jpdb-reader-word')?.classList).toContain('jpdb-pitch-unknown');
        runtime.destroy();
    });

    it('does not cache, repaint, or unwrap public vocabulary after an away-and-back switch', async () => {
        const pending = deferred<Map<string, JPDBCard>>();
        const resolvedFallback = card(51, '猫', 'ねこ', 'fallback');
        const missingFallback = card(52, '犬', 'いぬ', 'fallback');
        const resolved = { ...card(151, '猫', 'ねこ', 'jiten'), pitchAccent: ['HLL'] };
        document.body.innerHTML = `
            <span class="jpdb-reader-word jpdb-pitch-unknown" data-vid="51" data-sid="1">猫</span>
            <span class="jpdb-reader-word jpdb-pitch-unknown" data-vid="52" data-sid="1">犬</span>
        `;
        const cacheCards = vi.fn();
        const runtime = new NewTabRuntime() as unknown as {
            settings: ReaderSettings;
            parser: { cacheCards(cards: JPDBCard[]): void };
            publicLookupFallbackCards(): Promise<Map<string, JPDBCard>>;
            enrichPublicVocabularyWords(tokens: JPDBToken[]): Promise<void>;
            destroy(): void;
        };
        runtime.settings = { ...DEFAULT_SETTINGS, jpdbDefinitionsEnabled: true };
        runtime.parser = { cacheCards };
        runtime.publicLookupFallbackCards = vi.fn(() => pending.promise);

        const enrichment = runtime.enrichPublicVocabularyWords([
            token(resolvedFallback),
            token(missingFallback),
        ]);
        switchAwayAndBack();
        pending.resolve(new Map([[cardKey(resolvedFallback), resolved]]));
        await enrichment;

        expect(cacheCards).not.toHaveBeenCalled();
        expect(document.querySelector<HTMLElement>('[data-vid="51"]')?.dataset.pitchClass).toBeUndefined();
        expect(document.querySelector('[data-vid="52"]')?.textContent).toBe('犬');
        runtime.destroy();
    });

    it('does not mutate or cache settings fallback tokens after an away-and-back switch', async () => {
        const pending = deferred<Map<string, JPDBCard>>();
        const fallback = card(61, '食べた', 'たべた', 'fallback');
        const resolved = { ...card(161, '食べる', 'たべる', 'jiten'), pitchAccent: ['LHH'] };
        const fallbackToken = token(fallback);
        const cacheCards = vi.fn();
        const runtime = new NewTabRuntime() as unknown as {
            parser: { cacheCards(cards: JPDBCard[]): void };
            publicLookupFallbackCards(): Promise<Map<string, JPDBCard>>;
            hydrateSettingsFallbackTokens(parsed: JPDBToken[][]): Promise<void>;
            destroy(): void;
        };
        runtime.parser = { cacheCards };
        runtime.publicLookupFallbackCards = vi.fn(() => pending.promise);

        const hydration = runtime.hydrateSettingsFallbackTokens([[fallbackToken]]);
        switchAwayAndBack();
        pending.resolve(new Map([[cardKey(fallback), resolved]]));
        await hydration;

        expect(fallbackToken.card).toBe(fallback);
        expect(fallbackToken.rubies).toEqual([]);
        expect(fallbackToken.pitchClass).toBe('unknown');
        expect(cacheCards).not.toHaveBeenCalled();
        runtime.destroy();
    });

    it('drops public fallback cards resolved in an obsolete target generation', async () => {
        const pending = deferred<Map<string, JPDBCard>>();
        const fallback = card(71, '猫', 'ねこ', 'fallback');
        const unresolved = card(72, '犬', 'いぬ', 'fallback');
        const resolved = card(171, '猫', 'ねこ', 'jiten');
        const scope = new NewTabLookupTargetScope();
        const search = vi.fn(async () => []);
        const resolver = new NewTabTargetLookupResolver({
            getSettings: () => ({ ...DEFAULT_SETTINGS, jpdbDefinitionsEnabled: true }),
            getDictionaries: () => ({ lookup: vi.fn(async () => []) }),
            getParser: () => ({
                fallbackCardFromText: vi.fn(),
                localCardFromEntry: vi.fn(),
                parse: vi.fn(async () => []),
            }),
            getJpdbVocabulary: () => ({ search }),
            getJiten: () => ({ parse: vi.fn(async () => []) }),
            getJitenPublicVocabulary: () => ({ lookupMany: vi.fn(() => pending.promise) }),
            isJitenApiActive: () => false,
            publicFallbackConcurrency: 2,
            warnPublicSearch: vi.fn(),
            targetScope: scope,
        });

        const lookup = resolver.publicFallbackCards([fallback, unresolved]);
        switchAwayAndBack();
        pending.resolve(new Map([['猫', resolved]]));

        await expect(lookup).resolves.toEqual(new Map());
        expect(search).not.toHaveBeenCalled();
    });
});
