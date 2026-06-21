import type { ReaderSettings } from '../app/types';
import { promiseWithTimeout } from '../core/async-utils';
import type { JitenApiClient, JitenKanjiInfo } from '../dictionaries/jiten';
import type { YomitanDictionaryStore, YomitanKanjiEntry } from '../dictionaries/yomitan';
import type { JpdbKanjiClient, JpdbKanjiInfo } from '../jpdb/jpdb-kanji';
import type { KanjiVGClient, KanjiVGInfo } from '../kanji/vg';
import type { RtkClient, RtkInfo } from '../kanji/rtk';
import { hasJitenApiCredential } from '../settings/api-credential';
import { NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS } from './controller-config';

export type KanjiDetailSourceState = 'disabled' | 'ok' | 'not-found' | 'unavailable';

export interface KanjiDetailSourceStates {
    jpdb: KanjiDetailSourceState;
    jiten: KanjiDetailSourceState;
    rtk: KanjiDetailSourceState;
    vg: KanjiDetailSourceState;
    local: KanjiDetailSourceState;
}

export interface KanjiDetailBundle {
    jpdb: JpdbKanjiInfo | null;
    jiten: JitenKanjiInfo | null;
    rtk: RtkInfo | null;
    vg: KanjiVGInfo | null;
    local: YomitanKanjiEntry[];
    sourceStates: KanjiDetailSourceStates;
}

export interface KanjiDetailSourceDeps {
    getSettings: () => ReaderSettings;
    jpdbKanji: JpdbKanjiClient;
    jiten?: Pick<JitenApiClient, 'lookupKanji'>;
    rtk: RtkClient;
    kanjiVG: KanjiVGClient;
    dictionaries: YomitanDictionaryStore;
    localSearchWithTimeout: <T>(promise: Promise<T>, fallback: T) => Promise<T>;
}

interface KanjiDetailSourceResult<T> {
    value: T;
    state: KanjiDetailSourceState;
}

interface KanjiDetailCacheEntry {
    details?: Promise<KanjiDetailBundle>;
    detailsSignature?: string;
    jpdb?: Promise<KanjiDetailSourceResult<JpdbKanjiInfo | null>>;
    jiten?: Promise<KanjiDetailSourceResult<JitenKanjiInfo | null>>;
    rtk?: Promise<KanjiDetailSourceResult<RtkInfo | null>>;
    vg?: Promise<KanjiDetailSourceResult<KanjiVGInfo | null>>;
    local?: Promise<KanjiDetailSourceResult<YomitanKanjiEntry[]>>;
}

function sourceResult<T>(value: T, state: KanjiDetailSourceState): KanjiDetailSourceResult<T> {
    return { value, state };
}

// The kanji panel fans out to up to five sources (JPDB, Jiten, RTK, KanjiVG,
// local Yomitan), each settings-gated and time-boxed, then memoizes the merged
// bundle per kanji until the relevant settings change.
export class KanjiDetailSource {
    private readonly cache = new Map<string, KanjiDetailCacheEntry>();

    constructor(private readonly deps: KanjiDetailSourceDeps) {}

    load(kanji: string): Promise<KanjiDetailBundle> {
        const settings = this.deps.getSettings();
        const cache = this.cacheEntry(kanji);
        const signature = this.settingsSignature(settings);
        if (cache.details && cache.detailsSignature === signature) return cache.details;

        this.primeSources(cache, kanji, settings);
        cache.details = this.resolveBundle(cache, settings);
        cache.detailsSignature = signature;
        return cache.details;
    }

    invalidate(kanji: string): void {
        this.cache.delete(kanji);
    }

    clear(): void {
        this.cache.clear();
    }

    private primeSources(cache: KanjiDetailCacheEntry, kanji: string, settings: ReaderSettings): void {
        this.primeJpdb(cache, kanji, settings);
        this.primeJiten(cache, kanji, settings);
        this.primeRtk(cache, kanji, settings);
        this.primeKanjiVg(cache, kanji, settings);
        this.primeLocal(cache, kanji, settings);
    }

    private primeJpdb(cache: KanjiDetailCacheEntry, kanji: string, settings: ReaderSettings): void {
        const lookupJpdbKanji = this.deps.jpdbKanji.lookup;
        if (!settings.jpdbKanjiEnabled || typeof lookupJpdbKanji !== 'function' || cache.jpdb) return;
        cache.jpdb = this.remoteResult(
            promiseWithTimeout(lookupJpdbKanji.call(this.deps.jpdbKanji, kanji), NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS, 'JPDB kanji lookup timed out.'),
            null,
        );
    }

    private primeJiten(cache: KanjiDetailCacheEntry, kanji: string, settings: ReaderSettings): void {
        const lookupJitenKanji = this.deps.jiten?.lookupKanji;
        if (!settings.jpdbKanjiEnabled || !hasJitenApiCredential(settings) || typeof lookupJitenKanji !== 'function' || cache.jiten) return;
        cache.jiten = this.remoteResult(
            promiseWithTimeout(lookupJitenKanji.call(this.deps.jiten, kanji), NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS, 'Jiten kanji lookup timed out.'),
            null,
        );
    }

    private primeRtk(cache: KanjiDetailCacheEntry, kanji: string, settings: ReaderSettings): void {
        const lookupRtk = this.deps.rtk.lookup;
        if (!settings.rtkEnabled || typeof lookupRtk !== 'function' || cache.rtk) return;
        cache.rtk = this.remoteResult(
            promiseWithTimeout(lookupRtk.call(this.deps.rtk, kanji), NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS, 'RTK lookup timed out.'),
            null,
        );
    }

    private primeKanjiVg(cache: KanjiDetailCacheEntry, kanji: string, settings: ReaderSettings): void {
        const lookupKanjiVG = this.deps.kanjiVG.lookup;
        if (!this.shouldLoadKanjiVg(settings) || typeof lookupKanjiVG !== 'function' || cache.vg) return;
        cache.vg = this.remoteResult(
            promiseWithTimeout(lookupKanjiVG.call(this.deps.kanjiVG, kanji), NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS, 'KanjiVG lookup timed out.'),
            null,
        );
    }

    private primeLocal(cache: KanjiDetailCacheEntry, kanji: string, settings: ReaderSettings): void {
        if (!this.shouldLoadLocal(settings) || cache.local) return;
        cache.local = this.localResult(this.deps.localSearchWithTimeout(
            this.deps.dictionaries.lookupKanji?.(kanji, 6, settings.dictionaryPreferences) ?? Promise.resolve([]),
            [] as YomitanKanjiEntry[],
        ));
    }

    private resolveBundle(cache: KanjiDetailCacheEntry, settings: ReaderSettings): Promise<KanjiDetailBundle> {
        return Promise.all([
            settings.jpdbKanjiEnabled ? cache.jpdb ?? Promise.resolve(sourceResult(null, 'unavailable')) : Promise.resolve(sourceResult(null, 'disabled')),
            settings.jpdbKanjiEnabled && hasJitenApiCredential(settings) ? cache.jiten ?? Promise.resolve(sourceResult(null, 'unavailable')) : Promise.resolve(sourceResult(null, 'disabled')),
            settings.rtkEnabled ? cache.rtk ?? Promise.resolve(sourceResult(null, 'unavailable')) : Promise.resolve(sourceResult(null, 'disabled')),
            this.shouldLoadKanjiVg(settings) ? cache.vg ?? Promise.resolve(sourceResult(null, 'unavailable')) : Promise.resolve(sourceResult(null, 'disabled')),
            this.shouldLoadLocal(settings) ? cache.local ?? Promise.resolve(sourceResult([] as YomitanKanjiEntry[], 'unavailable')) : Promise.resolve(sourceResult([] as YomitanKanjiEntry[], 'disabled')),
        ]).then(([jpdb, jiten, rtk, vg, local]) => ({
            jpdb: jpdb.value,
            jiten: jiten.value,
            rtk: rtk.value,
            vg: vg.value,
            local: local.value,
            sourceStates: {
                jpdb: jpdb.state,
                jiten: jiten.state,
                rtk: rtk.state,
                vg: vg.state,
                local: local.state,
            },
        }));
    }

    private async remoteResult<T>(promise: Promise<T | null>, emptyValue: T | null): Promise<KanjiDetailSourceResult<T | null>> {
        try {
            const value = await promise;
            return sourceResult(value, value ? 'ok' : 'not-found');
        } catch {
            return sourceResult(emptyValue, 'unavailable');
        }
    }

    private async localResult(promise: Promise<YomitanKanjiEntry[]>): Promise<KanjiDetailSourceResult<YomitanKanjiEntry[]>> {
        const value = await promise;
        return sourceResult(value, value.length ? 'ok' : 'not-found');
    }

    private cacheEntry(kanji: string): KanjiDetailCacheEntry {
        const existing = this.cache.get(kanji);
        if (existing) return existing;
        const created: KanjiDetailCacheEntry = {};
        this.cache.set(kanji, created);
        return created;
    }

    private shouldLoadKanjiVg(settings: ReaderSettings): boolean {
        return settings.kanjivgEnabled || (settings.kanjiOriginsEnabled && settings.kanjiOriginGraphEnabled);
    }

    private settingsSignature(settings: ReaderSettings): string {
        return [
            settings.jpdbKanjiEnabled,
            hasJitenApiCredential(settings),
            settings.rtkEnabled,
            this.shouldLoadKanjiVg(settings),
            this.shouldLoadLocal(settings),
        ].map(Boolean).join(':');
    }

    private shouldLoadLocal(settings: ReaderSettings): boolean {
        return settings.localDictionariesEnabled && settings.localDictionaryShowKanji;
    }
}
