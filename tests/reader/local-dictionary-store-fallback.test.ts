import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';

import { createLocalDictionaryStore } from '../../src/reader/dictionaries/local-store';
import { YomitanDictionaryStore } from '../../src/reader/dictionaries/yomitan';

// The local-dictionary store ships in a companion (ADR-0003). When it is
// missing, core must degrade to empty results rather than to a TypeError on
// whichever method core happened to call -- a TypeError there kills the whole
// parse, so the page loses network lookups too.
type StoreHost = typeof globalThis & { __yomuCompanions?: Record<string, unknown> };

// Deleting the registry is NOT enough: the resolver falls back to a
// module-level sandbox copy, so a deleted global still resolves the real
// companion and the fallback path is never taken. An EMPTY registry object is
// what a core-only build actually presents -- present, with nothing in it.
function withoutCompanion<T>(read: () => T): T {
    const host = globalThis as StoreHost;
    const previous = Object.getOwnPropertyDescriptor(host, '__yomuCompanions');
    host.__yomuCompanions = {};
    try {
        return read();
    } finally {
        if (previous) Object.defineProperty(host, '__yomuCompanions', previous);
        else delete host.__yomuCompanions;
    }
}

const COMPANION_MISSING = /Yomu Settings Surface companion did not load/;

afterEach(() => {
    delete (globalThis as StoreHost).__yomuCompanions;
});

describe('local dictionary store without its companion', () => {
    it('answers every read with an empty result instead of throwing', async () => {
        const store = withoutCompanion(() => createLocalDictionaryStore(() => '', () => 'en'));

        await expect(store.lookup('猫', 'ねこ', 5)).resolves.toEqual([]);
        await expect(store.searchTerms('cat', 5)).resolves.toEqual([]);
        await expect(store.lookupKanji('猫', 5)).resolves.toEqual([]);
        await expect(store.listKanjiCharacters(5)).resolves.toEqual([]);
        await expect(store.lookupTermMeta('猫', 5)).resolves.toEqual([]);
        await expect(store.lookupSimilarTermsByKanji('猫', 5)).resolves.toEqual([]);
        await expect(store.findTermMatches('猫が好き', 5)).resolves.toEqual([]);
        await expect(store.lookupExactTermCandidates([])).resolves.toEqual([]);
        await expect(store.listRandomTerms(5)).resolves.toEqual([]);
        await expect(store.listRandomTopTerms(5, 10_000)).resolves.toEqual([]);
        await expect(store.dictionaryStyleCss()).resolves.toBe('');
        await expect(store.summary()).resolves.toEqual({
            dictionaries: [], terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0,
        });
    });

    it('reports no dictionaries rather than claiming capabilities it cannot serve', async () => {
        const store = withoutCompanion(() => createLocalDictionaryStore(() => '', () => 'en'));

        await expect(store.hasDictionaries()).resolves.toBe(false);
        await expect(store.hasTermDictionaries()).resolves.toBe(false);
        await expect(store.hasPitchMetaDictionaries()).resolves.toBe(false);
    });

    it('fails imports and exports loudly and stays quiet on teardown', async () => {
        const store = withoutCompanion(() => createLocalDictionaryStore(() => '', () => 'en'));
        const file = new File(['{}'], 'dictionary.json', { type: 'application/json' });

        await expect(store.importFile(file)).rejects.toThrow(COMPANION_MISSING);
        await expect(store.importFromUrl('https://example.invalid/d.zip')).rejects.toThrow(COMPANION_MISSING);
        await expect(store.importZip(file)).rejects.toThrow(COMPANION_MISSING);
        await expect(store.importJson(file)).rejects.toThrow(COMPANION_MISSING);
        await expect(store.importDexieJson(file)).rejects.toThrow(COMPANION_MISSING);
        await expect(store.exportJson()).rejects.toThrow(COMPANION_MISSING);

        // Teardown paths run during factory reset, where throwing would strand
        // the reset half-done.
        await expect(store.prepareTermSearchIndex()).resolves.toBeUndefined();
        await expect(store.clear()).resolves.toBeUndefined();
        await expect(store.deleteDictionary('anything')).resolves.toBeUndefined();
        await expect(store.deleteDatabase()).resolves.toBeUndefined();
        await expect(store.invalidateForFactoryReset()).resolves.toBeUndefined();
        expect(store.invalidateCaches()).toBeUndefined();
    });

    it('names only methods the real store still has', () => {
        // The typecheck side of this contract (Pick over keyof) fails when the
        // fallback is MISSING a store method. This is the other direction: a
        // fallback entry for a method that was renamed or removed would sit
        // there forever, passing typecheck as an excess property and quietly
        // answering a call that should no longer exist.
        const fallback = withoutCompanion(() => createLocalDictionaryStore(() => '', () => 'en'));
        const stale = Object.keys(fallback).filter(name => (
            typeof (YomitanDictionaryStore.prototype as unknown as Record<string, unknown>)[name] !== 'function'
        ));

        expect(stale).toEqual([]);
        expect(Object.keys(fallback).length).toBeGreaterThan(20);
    });
});
