import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KanjiDetailSource, type KanjiDetailSourceDeps } from '../../src/reader/newtab/kanji-detail-source';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { ReaderSettings } from '../../src/reader/app/types';
import type { JpdbKanjiClient } from '../../src/reader/jpdb/jpdb-kanji';
import type { JitenApiClient } from '../../src/reader/dictionaries/jiten';
import type { KanjiVGClient } from '../../src/reader/kanji/vg';
import type { RtkClient } from '../../src/reader/kanji/rtk';
import type { YomitanDictionaryStore } from '../../src/reader/dictionaries/yomitan';

const ALL_ON: Partial<ReaderSettings> = {
    jpdbKanjiEnabled: true,
    jitenApiKey: 'jiten-key',
    rtkEnabled: true,
    kanjivgEnabled: true,
    localDictionariesEnabled: true,
    localDictionaryShowKanji: true,
};

function settings(overrides: Partial<ReaderSettings> = {}): ReaderSettings {
    return { ...DEFAULT_SETTINGS, ...ALL_ON, ...overrides };
}

function makeSource(settingsRef: { current: ReaderSettings }) {
    const jpdb = vi.fn(async (_kanji: string): Promise<unknown> => ({ kanji: '何' }));
    const jiten = vi.fn(async (_kanji: string): Promise<unknown> => ({ kanji: '何' }));
    const rtk = vi.fn(async (_kanji: string): Promise<unknown> => ({ keyword: 'what' }));
    const vg = vi.fn(async (_kanji: string): Promise<unknown> => ({ paths: ['m0,0'] }));
    const local = vi.fn(async (_kanji: string): Promise<unknown[]> => [{ entry: 1 }]);
    const origin = vi.fn(async (_kanji: string): Promise<unknown> => ({ kanjiAliveKeyword: 'what' }));
    const deps: KanjiDetailSourceDeps = {
        getSettings: () => settingsRef.current,
        jpdbKanji: { lookup: jpdb } as unknown as JpdbKanjiClient,
        jiten: { lookupKanji: jiten } as unknown as Pick<JitenApiClient, 'lookupKanji'>,
        rtk: { lookup: rtk } as unknown as RtkClient,
        kanjiVG: { lookup: vg } as unknown as KanjiVGClient,
        dictionaries: { lookupKanji: local } as unknown as YomitanDictionaryStore,
        kanjiOrigin: { lookup: origin } as unknown as NonNullable<KanjiDetailSourceDeps['kanjiOrigin']>,
        localSearchWithTimeout: <T>(promise: Promise<T>, fallback: T) => promise.catch(() => fallback),
    };
    return { source: new KanjiDetailSource(deps), spies: { jpdb, jiten, rtk, vg, local, origin } };
}

describe('KanjiDetailSource.load', () => {
    let ref: { current: ReaderSettings };
    beforeEach(() => { ref = { current: settings() }; });

    it('fans out to every enabled source and reports ok states', async () => {
        const { source, spies } = makeSource(ref);
        const bundle = await source.load('何');
        expect(bundle.sourceStates).toEqual({ jpdb: 'ok', jiten: 'ok', rtk: 'ok', vg: 'ok', local: 'ok', origin: 'ok' });
        expect(bundle.jpdb).toEqual({ kanji: '何' });
        expect(bundle.local).toEqual([{ entry: 1 }]);
        expect(bundle.sourceInfo).toEqual({ kanjiAliveKeyword: 'what' });
        for (const spy of [spies.jpdb, spies.jiten, spies.rtk, spies.vg]) expect(spy).toHaveBeenCalledWith('何');
        expect(spies.local).toHaveBeenCalledWith('何', 6, expect.anything());
        expect(spies.origin).toHaveBeenCalledWith('何', ref.current);
    });

    it('marks a disabled source disabled and never calls its lookup', async () => {
        ref.current = settings({ rtkEnabled: false });
        const { source, spies } = makeSource(ref);
        const bundle = await source.load('何');
        expect(bundle.sourceStates.rtk).toBe('disabled');
        expect(bundle.rtk).toBeNull();
        expect(spies.rtk).not.toHaveBeenCalled();
    });

    it('loads kanjivg via the origin-graph branch when kanjivgEnabled is off', async () => {
        ref.current = settings({ kanjivgEnabled: false, kanjiOriginsEnabled: true, kanjiOriginGraphEnabled: true });
        const { source, spies } = makeSource(ref);
        const bundle = await source.load('何');
        expect(spies.vg).toHaveBeenCalledTimes(1);
        expect(bundle.sourceStates.vg).toBe('ok');
    });

    it('does not load origin keyword data when the origin source is disabled', async () => {
        ref.current = settings({ kanjiOriginsEnabled: false });
        const { source, spies } = makeSource(ref);
        const bundle = await source.load('何');
        expect(bundle.sourceStates.origin).toBe('disabled');
        expect(bundle.sourceInfo).toBeNull();
        expect(spies.origin).not.toHaveBeenCalled();
    });

    it('treats jiten as disabled without a jiten credential', async () => {
        ref.current = settings({ jitenApiKey: '' });
        const { source, spies } = makeSource(ref);
        const bundle = await source.load('何');
        expect(bundle.sourceStates.jiten).toBe('disabled');
        expect(spies.jiten).not.toHaveBeenCalled();
    });

    it('reports not-found when a remote lookup resolves empty', async () => {
        const { source, spies } = makeSource(ref);
        spies.jpdb.mockResolvedValueOnce(null);
        spies.local.mockResolvedValueOnce([]);
        const bundle = await source.load('何');
        expect(bundle.sourceStates.jpdb).toBe('not-found');
        expect(bundle.sourceStates.local).toBe('not-found');
    });

    it('reports unavailable when a remote lookup rejects', async () => {
        const { source, spies } = makeSource(ref);
        spies.vg.mockRejectedValueOnce(new Error('boom'));
        const bundle = await source.load('何');
        expect(bundle.sourceStates.vg).toBe('unavailable');
        expect(bundle.vg).toBeNull();
    });

    it('memoizes per kanji while the settings signature is unchanged', async () => {
        const { source, spies } = makeSource(ref);
        const first = source.load('何');
        const second = source.load('何');
        expect(second).toBe(first);
        await first;
        expect(spies.jpdb).toHaveBeenCalledTimes(1);
    });

    it('recomputes the bundle on a signature change without re-fetching cached sources', async () => {
        const { source, spies } = makeSource(ref);
        const firstBundle = await source.load('何');
        expect(firstBundle.sourceStates.rtk).toBe('ok');
        ref.current = settings({ rtkEnabled: false });
        const secondBundle = await source.load('何');
        // The signature change re-resolves the bundle (rtk now disabled)...
        expect(secondBundle).not.toBe(firstBundle);
        expect(secondBundle.sourceStates.rtk).toBe('disabled');
        // ...but already-fetched per-source promises survive on the cache entry.
        expect(spies.jpdb).toHaveBeenCalledTimes(1);
    });

    it('fetches a newly-enabled source on the next load', async () => {
        ref.current = settings({ rtkEnabled: false });
        const { source, spies } = makeSource(ref);
        await source.load('何');
        expect(spies.rtk).not.toHaveBeenCalled();
        ref.current = settings({ rtkEnabled: true });
        const bundle = await source.load('何');
        expect(spies.rtk).toHaveBeenCalledTimes(1);
        expect(bundle.sourceStates.rtk).toBe('ok');
    });

    it('refetches a single kanji after invalidate and all after clear', async () => {
        const { source, spies } = makeSource(ref);
        await source.load('何');
        source.invalidate('何');
        await source.load('何');
        expect(spies.jpdb).toHaveBeenCalledTimes(2);
        source.clear();
        await source.load('何');
        expect(spies.jpdb).toHaveBeenCalledTimes(3);
    });
});
