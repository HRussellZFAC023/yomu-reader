import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import {
    LOCAL_PITCH_DICTIONARY_PRESENCE_TIMEOUT_MS,
    type PitchEnrichmentOptions,
} from '../../src/reader/app/main-helpers';
import { setRenderedWordCardIdentity } from '../../src/reader/dom/rendered-word-state';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';

interface AppInternals {
    settings: ReaderSettings;
    dictionaries: {
        hasPitchMetaDictionaries?: () => Promise<boolean>;
        lookupTermMeta: (...args: unknown[]) => Promise<never[]>;
    };
    enrichPitchWords(tokens: JPDBToken[], options?: PitchEnrichmentOptions): Promise<void>;
    hasLocalPitchDictionary(): Promise<boolean>;
    jitenPublicVocabulary: {
        lookupMany: (terms: string[]) => Promise<Map<string, JPDBCard>>;
    };
    jpdbVocabulary: {
        search: (term: string, limit?: number) => Promise<JPDBCard[]>;
    };
    jpdbPublicPitch: { lookup: (spelling: string, reading: string) => Promise<string[]> };
    toast(message: string): void;
    destroy(): void;
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(next => { resolve = next; });
    return { promise, resolve };
}

function pitchCard(vid: number, spelling = '言葉', reading = 'ことば'): JPDBCard {
    return {
        vid,
        sid: 0,
        rid: 0,
        spelling,
        reading,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
    };
}

function pitchToken(card: JPDBCard): JPDBToken {
    return {
        card,
        start: 0,
        end: card.spelling.length,
        length: card.spelling.length,
        rubies: [],
        pitchClass: '',
        sentence: card.spelling,
    };
}

function renderedPitchWord(card: JPDBCard): HTMLElement {
    const word = document.createElement('span');
    word.className = 'jpdb-reader-word jpdb-pitch-unknown';
    word.dataset.pitchClass = 'unknown';
    word.textContent = card.spelling;
    setRenderedWordCardIdentity(word, card);
    document.body.append(word);
    return word;
}

function makeApp(overrides: Partial<ReaderSettings> = {}): AppInternals {
    const app = new ReaderApp() as unknown as AppInternals;
    app.settings = {
        ...DEFAULT_SETTINGS,
        localDictionariesEnabled: true,
        showPitchAccent: true,
        showFurigana: true,
        furiganaMode: 'all',
        hideKnownFurigana: false,
        ...overrides,
    };
    app.toast = vi.fn();
    return app;
}

afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
});

describe('visible pitch hydration', () => {
    it('hydrates visible pitch and furigana when the local dictionary presence probe stalls', async () => {
        vi.useFakeTimers();
        const app = makeApp();
        const presence = vi.fn(() => new Promise<boolean>(() => undefined));
        const fallback = pitchCard(-7001, '言葉', '言葉');
        fallback.source = 'fallback';
        const resolved = pitchCard(7001);
        resolved.source = 'jiten';
        resolved.pitchAccent = ['LHH'];
        const publicVocabulary = vi.fn(async () => new Map([['言葉', resolved]]));
        app.dictionaries = {
            hasPitchMetaDictionaries: presence,
            lookupTermMeta: vi.fn(async () => []),
        };
        app.jitenPublicVocabulary = { lookupMany: publicVocabulary };
        app.jpdbPublicPitch = { lookup: vi.fn(async () => []) };
        const word = renderedPitchWord(fallback);

        let completed = false;
        const enrichment = app.enrichPitchWords([pitchToken(fallback)], {
            publicLookupLimit: 1,
            publicLookupTotalLimit: 1,
            publicLookupPageBudget: 1,
            deferPublicLookup: false,
        }).then(() => { completed = true; });

        try {
            await vi.advanceTimersByTimeAsync(LOCAL_PITCH_DICTIONARY_PRESENCE_TIMEOUT_MS + 1);
            await Promise.resolve();

            expect(completed).toBe(true);
            await enrichment;
            expect(presence).toHaveBeenCalledTimes(1);
            expect(publicVocabulary).toHaveBeenCalled();
            expect(word.dataset.pitchClass).toBe('heiban');
            expect(word.classList.contains('jpdb-pitch-heiban')).toBe(true);
            expect(word.classList.contains('jpdb-pitch-unknown')).toBe(false);
            expect(word.querySelector('rt')?.textContent).toBe('ことば');
            expect(word.classList.contains('jpdb-reader-has-furi')).toBe(true);
        } finally {
            app.destroy();
        }
    });

    it('decorates the compound もう一度 when fallback vocabulary hydration misses', async () => {
        vi.useFakeTimers();
        const app = makeApp();
        const fallback = pitchCard(-7002, 'もう一度', 'もういちど');
        fallback.source = 'fallback';
        const word = renderedPitchWord(fallback);
        const publicPitch = vi.fn(async () => ['LHHHHH']);
        app.dictionaries = {
            hasPitchMetaDictionaries: vi.fn(() => new Promise<boolean>(() => undefined)),
            lookupTermMeta: vi.fn(async () => []),
        };
        app.jitenPublicVocabulary = { lookupMany: vi.fn(async () => new Map()) };
        app.jpdbVocabulary = { search: vi.fn(async () => []) };
        app.jpdbPublicPitch = { lookup: publicPitch };

        const enrichment = app.enrichPitchWords([pitchToken(fallback)], {
            publicLookupLimit: 1,
            publicLookupTotalLimit: 1,
            publicLookupPageBudget: 1,
            deferPublicLookup: false,
        });

        try {
            await vi.advanceTimersByTimeAsync(LOCAL_PITCH_DICTIONARY_PRESENCE_TIMEOUT_MS + 1);
            await enrichment;

            expect(publicPitch).toHaveBeenCalledWith('もう一度', 'もういちど');
            expect(word.dataset.pitchClass).toBe('heiban');
            expect(word.classList.contains('jpdb-pitch-heiban')).toBe(true);
            expect(word.classList.contains('jpdb-pitch-unknown')).toBe(false);
        } finally {
            app.destroy();
        }
    });

    it('respects an explicit no-JPDB fallback when vocabulary hydration misses', async () => {
        const app = makeApp();
        const fallback = pitchCard(-7003, 'こんばんは', 'こんばんは');
        fallback.source = 'fallback';
        const word = renderedPitchWord(fallback);
        const publicPitch = vi.fn(async () => ['LHHHHH']);
        app.dictionaries = {
            hasPitchMetaDictionaries: vi.fn(async () => false),
            lookupTermMeta: vi.fn(async () => []),
        };
        app.jitenPublicVocabulary = { lookupMany: vi.fn(async () => new Map()) };
        app.jpdbVocabulary = { search: vi.fn(async () => []) };
        app.jpdbPublicPitch = { lookup: publicPitch };

        try {
            await app.enrichPitchWords([pitchToken(fallback)], {
                publicLookupLimit: 1,
                publicLookupTotalLimit: 1,
                publicLookupPageBudget: 1,
                jpdbPublicLookup: false,
                deferPublicLookup: false,
            });

            expect(publicPitch).not.toHaveBeenCalled();
            expect(word.dataset.pitchClass).toBe('unknown');
            expect(word.classList.contains('jpdb-pitch-unknown')).toBe(true);
        } finally {
            app.destroy();
        }
    });

    it('does not run direct pitch for a furigana-only vocabulary miss', async () => {
        const app = makeApp({ showPitchAccent: false });
        const fallback = pitchCard(-7004, '言葉', '言葉');
        fallback.source = 'fallback';
        const publicPitch = vi.fn(async () => ['LHH']);
        app.dictionaries = {
            hasPitchMetaDictionaries: vi.fn(async () => false),
            lookupTermMeta: vi.fn(async () => []),
        };
        app.jitenPublicVocabulary = { lookupMany: vi.fn(async () => new Map()) };
        app.jpdbVocabulary = { search: vi.fn(async () => []) };
        app.jpdbPublicPitch = { lookup: publicPitch };

        try {
            await app.enrichPitchWords([pitchToken(fallback)], {
                publicLookupLimit: 1,
                publicLookupTotalLimit: 1,
                publicLookupPageBudget: 1,
                deferPublicLookup: false,
            });

            expect(app.jitenPublicVocabulary.lookupMany).toHaveBeenCalled();
            expect(publicPitch).not.toHaveBeenCalled();
        } finally {
            app.destroy();
        }
    });

    it('keeps a late successful presence result instead of caching the timeout as false', async () => {
        vi.useFakeTimers();
        const app = makeApp();
        const presence = deferred<boolean>();
        app.dictionaries = {
            hasPitchMetaDictionaries: vi.fn(() => presence.promise),
            lookupTermMeta: vi.fn(async () => []),
        };

        let firstResult: boolean | undefined;
        void app.hasLocalPitchDictionary().then(result => { firstResult = result; });

        try {
            await vi.advanceTimersByTimeAsync(LOCAL_PITCH_DICTIONARY_PRESENCE_TIMEOUT_MS + 1);
            expect(firstResult).toBe(false);

            presence.resolve(true);
            await Promise.resolve();
            await expect(app.hasLocalPitchDictionary()).resolves.toBe(true);
            expect(app.dictionaries.hasPitchMetaDictionaries).toHaveBeenCalledTimes(1);
        } finally {
            app.destroy();
        }
    });

    it('does not probe or fetch pitch when both pitch and furigana enrichment are disabled', async () => {
        const app = makeApp({
            showPitchAccent: false,
            showFurigana: false,
            furiganaMode: 'off',
        });
        const presence = vi.fn(async () => true);
        const publicPitch = vi.fn(async () => ['LHH']);
        app.dictionaries = {
            hasPitchMetaDictionaries: presence,
            lookupTermMeta: vi.fn(async () => []),
        };
        app.jpdbPublicPitch = { lookup: publicPitch };

        try {
            await app.enrichPitchWords([pitchToken(pitchCard(7002))], { publicLookupLimit: 1 });
            expect(presence).not.toHaveBeenCalled();
            expect(publicPitch).not.toHaveBeenCalled();
        } finally {
            app.destroy();
        }
    });
});
