import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import {
    deleteDictionaryArchive,
    enumerateDictionaryArchiveStorageKeys,
    listDictionaryArchives,
    persistDictionaryArchive,
    readDictionaryArchiveFile,
} from '../../src/reader/dictionaries/archive-cache';
import { ReaderApp } from '../../src/reader/app/main';
import { registerYomuCompanion } from '../../src/reader/companions/registry';
import { ensureLocalDictionariesReplicated, type DictionaryReplicationOptions, type DictionaryReplicationStore } from '../../src/reader/dictionaries/replication';
import { YomitanDictionaryStore, type ImportSummary } from '../../src/reader/dictionaries/yomitan';
import { CardRenderDataLoader } from '../../src/reader/cards/render-data';
import { captureActiveLanguageProfileDictionaries } from '../../src/reader/settings/dictionary';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../../src/reader/settings/index';
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import type { YomitanTermEntry } from '../../src/reader/dictionaries/yomitan/types';
import { yomitanZipBlob } from './zip-fixture';
import { card as fixtureCard, renderModalCard, testCardPopoverRenderer } from './jpdb/fixtures';

// GM storage shim: the archive cache must round-trip through the userscript
// manager's cross-origin values, not page storage.
const gmValues = new Map<string, unknown>();

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(settle => { resolve = settle; });
    return { promise, resolve };
}

function replicationCard(): JPDBCard {
    return {
        vid: 1, sid: 0, rid: 0,
        spelling: '読む', reading: 'よむ',
        frequencyRank: 100, partOfSpeech: [], meanings: [],
        cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null,
        source: 'jpdb',
    } as unknown as JPDBCard;
}

function replicatedTermEntry(): YomitanTermEntry {
    return {
        dictionary: 'Jitendex.org [2026-06-06]', expression: '読む', reading: 'よむ',
        glossary: ['to read'], rules: '', score: 0, sequence: 1, tags: '', termTags: '',
    } as unknown as YomitanTermEntry;
}

function replicationCardLoader(lookup: () => Promise<YomitanTermEntry[]>): CardRenderDataLoader {
    return new CardRenderDataLoader({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            localDictionariesEnabled: true,
            showPitchAccent: false,
            ankiEnabled: false,
            jpdbDefinitionsEnabled: false,
            jitenDefinitionsEnabled: false,
            bunproDefinitionsEnabled: false,
        }),
        dictionaries: { lookup: vi.fn(lookup), lookupKanji: vi.fn(async () => []), lookupTermMeta: vi.fn(async () => []) } as never,
        jpdbPublicPitch: { lookup: vi.fn(async () => []) } as never,
        jpdbVocabulary: { lookup: vi.fn(async () => null) } as never,
        anki: { findExistingCards: vi.fn(), deckNames: vi.fn() } as never,
        jpdb: { listDecks: vi.fn() } as never,
        isJpdbBackedCard: () => true,
    });
}

function installGmShim(): void {
    (globalThis as Record<string, unknown>).GM_getValue = (key: string, fallback: unknown) => gmValues.has(key) ? gmValues.get(key) : fallback;
    (globalThis as Record<string, unknown>).GM_setValue = (key: string, value: unknown) => { gmValues.set(key, value); };
    (globalThis as Record<string, unknown>).GM_deleteValue = (key: string) => { gmValues.delete(key); };
}

function removeGmShim(): void {
    delete (globalThis as Record<string, unknown>).GM_getValue;
    delete (globalThis as Record<string, unknown>).GM_setValue;
    delete (globalThis as Record<string, unknown>).GM_deleteValue;
}

function settingsWith(preferences: { name: string; enabled: boolean }[]): ReaderSettings {
    return {
        localDictionariesEnabled: true,
        dictionaryPreferences: preferences.map((preference, index) => ({
            name: preference.name,
            alias: preference.name,
            enabled: preference.enabled,
            priority: index,
            type: 'terms' as const,
        })),
    } as unknown as ReaderSettings;
}

function fileBytes(file: File): Promise<Uint8Array> {
    if (typeof file.arrayBuffer === 'function') return file.arrayBuffer().then(buffer => new Uint8Array(buffer));
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

function importSummary(title: string): ImportSummary {
    return { dictionaries: [title], entries: 1, terms: 1, kanji: 0, termMeta: 0, kanjiMeta: 0 };
}

beforeEach(() => {
    gmValues.clear();
    localStorage.clear();
    installGmShim();
});

afterEach(() => {
    removeGmShim();
    registerYomuCompanion('localDictionaries', {
        YomitanDictionaryStore,
        ensureLocalDictionariesReplicated,
        enumerateDictionaryArchiveStorageKeys,
    });
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('dictionary archive cache', () => {
    it('round-trips a file archive through chunked GM storage', async () => {
        const bytes = new Uint8Array(70_000).map((_, index) => index % 251);
        await persistDictionaryArchive({ title: 'Jitendex.org [2026-06-06]', filename: 'jitendex.zip', file: new Blob([bytes]) });

        const archives = await listDictionaryArchives();
        expect(archives['jitendex.org']).toMatchObject({ title: 'Jitendex.org [2026-06-06]', size: 70_000 });

        const file = await readDictionaryArchiveFile('jitendex.org');
        expect(file).not.toBeNull();
        expect(await fileBytes(file!)).toEqual(bytes);
        expect(await enumerateDictionaryArchiveStorageKeys()).toEqual([
            'yomu-dictionary-archive:jitendex.org:0',
        ]);
    });

    it('stores only the URL for downloadable dictionaries', async () => {
        await persistDictionaryArchive({ title: 'Kanjium Pitch', filename: 'kanjium.zip', downloadUrl: 'https://example.test/kanjium.zip' });
        const archives = await listDictionaryArchives();
        expect(archives['kanjium pitch']).toMatchObject({ downloadUrl: 'https://example.test/kanjium.zip', chunkCount: 0 });
        expect(await readDictionaryArchiveFile('kanjium pitch')).toBeNull();
    });

    it('keeps catalogue integrity metadata with a URL-only archive', async () => {
        const sha256 = 'a'.repeat(64);
        await persistDictionaryArchive({
            title: 'JMdict [2026-07-23]',
            filename: 'jmdict.zip',
            downloadUrl: 'https://dictionaries.yomureader.com/objects/jmdict.zip',
            integrity: { sha256, bytes: 123_456 },
        });

        expect((await listDictionaryArchives()).jmdict).toMatchObject({
            downloadUrl: 'https://dictionaries.yomureader.com/objects/jmdict.zip',
            sha256,
            size: 123_456,
            chunkCount: 0,
        });
    });

    it('deletes archives with their chunks', async () => {
        await persistDictionaryArchive({ title: 'Jitendex.org [2026-06-06]', filename: 'jitendex.zip', file: new Blob([new Uint8Array(1000)]) });
        await deleteDictionaryArchive('Jitendex.org [2026-06-06]');
        expect(await listDictionaryArchives()).toEqual({});
        expect([...gmValues.keys()].filter(key => key.startsWith('yomu-dictionary-archive:'))).toEqual([]);
    });
});

describe('ensureLocalDictionariesReplicated', () => {
    it('marks renderer-owned card popovers for replication refreshes', () => {
        const html = renderModalCard(testCardPopoverRenderer(), fixtureCard, '本を読む');
        expect(html).toContain('data-card-popover');
    });

    it('reparses existing remote annotations after restoring a dictionary', async () => {
        const replicate = vi.fn(async (options: DictionaryReplicationOptions) => {
            options.onReplicated(['Jitendex.org [2026-06-06]']);
            return ['Jitendex.org [2026-06-06]'];
        });
        registerYomuCompanion('localDictionaries', {
            YomitanDictionaryStore,
            ensureLocalDictionariesReplicated: replicate,
            enumerateDictionaryArchiveStorageKeys,
        });
        vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
            callback({ didTimeout: false, timeRemaining: () => 50 });
            return 1;
        });

        document.body.innerHTML = '<p><span class="jpdb-reader-word" data-card-source="jiten">図書館</span>で勉強する。</p>';
        const app = new ReaderApp() as unknown as {
            pageHasJapaneseText: boolean;
            settings: ReaderSettings;
            parser: { clearLocalCache: () => void };
            scheduleDictionaryRescan: () => void;
            scheduleLocalDictionaryReplication: () => void;
            destroy: () => void;
        };
        const clearLocalCache = vi.fn();
        const scheduleDictionaryRescan = vi.fn();
        app.pageHasJapaneseText = true;
        app.settings = settingsWith([{ name: 'Jitendex.org [2026-06-06]', enabled: true }]);
        app.parser = { clearLocalCache };
        app.scheduleDictionaryRescan = scheduleDictionaryRescan;

        try {
            app.scheduleLocalDictionaryReplication();
            await vi.waitFor(() => expect(replicate).toHaveBeenCalledOnce());

            expect(clearLocalCache).toHaveBeenCalledOnce();
            expect(document.querySelectorAll('.jpdb-reader-word')).toHaveLength(0);
            expect(document.body.textContent).toContain('図書館で勉強する。');
            expect(scheduleDictionaryRescan).toHaveBeenCalledOnce();
        } finally {
            app.destroy();
        }
    });

    it('refreshes an already-open empty popover only after replication populates the store', async () => {
        const importFinished = deferred<void>();
        const events: string[] = [];
        let storePopulated = false;
        const lookup = vi.fn(async () => {
            events.push(storePopulated ? 'lookup:hit' : 'lookup:empty');
            return storePopulated ? [replicatedTermEntry()] : [];
        });
        const loader = replicationCardLoader(lookup);
        const card = replicationCard();
        const openLoad = loader.load(card);

        // The popover opens while the archive is still importing. Both its
        // initial and uncapped hydration channels settle empty at this point.
        expect(await openLoad.localEntries).toEqual([]);
        expect(await openLoad.hydrateLocalEntries!()).toEqual([]);
        expect(lookup).toHaveBeenCalledOnce();

        const replicate = vi.fn(async (options: DictionaryReplicationOptions) => {
            await importFinished.promise;
            events.push('replication:complete');
            storePopulated = true;
            options.onReplicated(['Jitendex.org [2026-06-06]']);
            return ['Jitendex.org [2026-06-06]'];
        });
        registerYomuCompanion('localDictionaries', {
            YomitanDictionaryStore,
            ensureLocalDictionariesReplicated: replicate,
            enumerateDictionaryArchiveStorageKeys,
        });
        vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
            callback({ didTimeout: false, timeRemaining: () => 50 });
            return 1;
        });

        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.innerHTML = '<div class="jpdb-reader-popover-body" data-card-popover></div>';
        document.body.append(popover);
        const showCard = vi.fn(async (nextCard: JPDBCard) => {
            events.push('popover:refresh');
            const entries = await loader.load(nextCard).localEntries;
            popover.dataset.localDictionaryCount = String(entries.length);
        });
        const clearLocalCache = vi.fn();
        const scheduleDictionaryRescan = vi.fn();
        const app = new ReaderApp() as unknown as {
            activePopover: HTMLElement;
            activePopoverMode: 'modal';
            cardRenderData: CardRenderDataLoader;
            lastCard: JPDBCard;
            lastCardSentence: string;
            pageHasJapaneseText: boolean;
            parser: { clearLocalCache: () => void };
            scheduleDictionaryRescan: () => void;
            scheduleLocalDictionaryReplication: () => void;
            settings: ReaderSettings;
            showCard: typeof showCard;
            destroy: () => void;
        };
        app.activePopover = popover;
        app.activePopoverMode = 'modal';
        app.cardRenderData = loader;
        app.lastCard = card;
        app.lastCardSentence = '本を読む';
        app.pageHasJapaneseText = true;
        app.parser = { clearLocalCache };
        app.scheduleDictionaryRescan = scheduleDictionaryRescan;
        app.settings = { ...DEFAULT_SETTINGS, ...settingsWith([{ name: 'Jitendex.org [2026-06-06]', enabled: true }]) };
        app.showCard = showCard;

        try {
            app.scheduleLocalDictionaryReplication();
            await vi.waitFor(() => expect(replicate).toHaveBeenCalledOnce());
            expect(showCard).not.toHaveBeenCalled();
            expect(popover.dataset.localDictionaryCount).toBeUndefined();

            importFinished.resolve();
            await vi.waitFor(() => expect(popover.dataset.localDictionaryCount).toBe('1'));

            expect(clearLocalCache).toHaveBeenCalledOnce();
            expect(showCard).toHaveBeenCalledOnce();
            expect(scheduleDictionaryRescan).toHaveBeenCalledOnce();
            expect(lookup).toHaveBeenCalledTimes(2);
            expect(events).toEqual([
                'lookup:empty',
                'replication:complete',
                'lookup:hit',
                'popover:refresh',
            ]);
        } finally {
            app.destroy();
        }
    });

    it('starts one replication pass when a Latin-first SPA later adds Japanese', async () => {
        const replicate = vi.fn(async () => []);
        registerYomuCompanion('localDictionaries', {
            YomitanDictionaryStore,
            ensureLocalDictionariesReplicated: replicate,
            enumerateDictionaryArchiveStorageKeys,
        });
        vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
            callback({ didTimeout: false, timeRemaining: () => 50 });
            return 1;
        });
        document.body.innerHTML = '<main>Latin content only</main>';
        const app = new ReaderApp() as unknown as {
            pageHasJapaneseText: boolean;
            settings: ReaderSettings;
            setupAutoScan: () => void;
            destroy: () => void;
        };
        app.pageHasJapaneseText = false;
        app.settings = { ...DEFAULT_SETTINGS, ...settingsWith([{ name: 'Jitendex.org [2026-06-06]', enabled: true }]) };

        try {
            app.setupAutoScan();
            document.querySelector('main')!.append(' 日本語が後から表示される。');
            await vi.waitFor(() => expect(replicate).toHaveBeenCalledOnce());

            document.querySelector('main')!.append(' 別の日本語も表示される。');
            await new Promise(resolve => window.setTimeout(resolve, 20));
            expect(replicate).toHaveBeenCalledOnce();
        } finally {
            app.destroy();
        }
    });

    it('does not refresh Settings or another non-card popover from a stale last card', async () => {
        const lookup = vi.fn(async () => [replicatedTermEntry()]);
        const loader = replicationCardLoader(lookup);
        const showCard = vi.fn(async () => undefined);
        const app = new ReaderApp() as unknown as {
            activePopover: HTMLElement;
            cardRenderData: CardRenderDataLoader;
            lastCard: JPDBCard;
            refreshActiveCardAfterLocalDictionaryReplication: () => Promise<void>;
            showCard: typeof showCard;
            destroy: () => void;
        };
        app.cardRenderData = loader;
        app.lastCard = replicationCard();
        app.showCard = showCard;

        const settings = document.createElement('form');
        settings.className = 'jpdb-reader-settings';
        document.body.append(settings);
        app.activePopover = settings;
        await app.refreshActiveCardAfterLocalDictionaryReplication();

        const tokenList = document.createElement('div');
        tokenList.className = 'jpdb-reader-popover';
        tokenList.innerHTML = '<div class="jpdb-reader-popover-body" data-token-list-selected="読む"></div>';
        document.body.append(tokenList);
        app.activePopover = tokenList;
        await app.refreshActiveCardAfterLocalDictionaryReplication();

        expect(lookup).not.toHaveBeenCalled();
        expect(showCard).not.toHaveBeenCalled();
        app.destroy();
    });

    it('passes hover identity to the refresh and aborts stale generation or popover changes', async () => {
        const card = replicationCard();
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.innerHTML = '<div class="jpdb-reader-popover-body" data-card-popover></div>';
        document.body.append(popover);
        const showCard = vi.fn(async () => undefined);
        const app = new ReaderApp() as unknown as {
            activeHoverLookupKey: string;
            activePopover: HTMLElement;
            activePopoverMode: 'hover';
            cardRenderData: CardRenderDataLoader;
            hoverLookupGeneration: number;
            lastCard: JPDBCard;
            settings: ReaderSettings;
            refreshActiveCardAfterLocalDictionaryReplication: () => Promise<void>;
            showCard: typeof showCard;
            destroy: () => void;
        };
        app.activeHoverLookupKey = 'word:1:0:本を読む';
        app.activePopover = popover;
        app.activePopoverMode = 'hover';
        app.hoverLookupGeneration = 7;
        app.lastCard = card;
        app.showCard = showCard;
        app.cardRenderData = replicationCardLoader(async () => [replicatedTermEntry()]);

        app.settings = { ...DEFAULT_SETTINGS, localDictionariesEnabled: false };
        await app.refreshActiveCardAfterLocalDictionaryReplication();
        expect(showCard).not.toHaveBeenCalled();
        app.settings = { ...DEFAULT_SETTINGS, localDictionariesEnabled: true };

        await app.refreshActiveCardAfterLocalDictionaryReplication();
        expect(showCard).toHaveBeenCalledWith(card, undefined, undefined, expect.objectContaining({
            trigger: 'hover',
            hoverLookupGeneration: 7,
            hoverLookupKey: 'word:1:0:本を読む',
        }));

        showCard.mockClear();
        const generationGate = deferred<YomitanTermEntry[]>();
        app.cardRenderData = replicationCardLoader(() => generationGate.promise);
        const staleGeneration = app.refreshActiveCardAfterLocalDictionaryReplication();
        app.hoverLookupGeneration = 8;
        generationGate.resolve([replicatedTermEntry()]);
        await staleGeneration;
        expect(showCard).not.toHaveBeenCalled();

        app.hoverLookupGeneration = 9;
        const disabledDuringRefreshGate = deferred<YomitanTermEntry[]>();
        app.cardRenderData = replicationCardLoader(() => disabledDuringRefreshGate.promise);
        const disabledDuringRefresh = app.refreshActiveCardAfterLocalDictionaryReplication();
        app.settings = { ...app.settings, localDictionariesEnabled: false };
        disabledDuringRefreshGate.resolve([replicatedTermEntry()]);
        await disabledDuringRefresh;
        expect(showCard).not.toHaveBeenCalled();
        app.settings = { ...app.settings, localDictionariesEnabled: true };

        app.hoverLookupGeneration = 10;
        const identityGate = deferred<YomitanTermEntry[]>();
        app.cardRenderData = replicationCardLoader(() => identityGate.promise);
        const staleIdentity = app.refreshActiveCardAfterLocalDictionaryReplication();
        const replacement = document.createElement('div');
        replacement.className = 'jpdb-reader-popover';
        replacement.innerHTML = '<div data-card-popover></div>';
        document.body.append(replacement);
        app.activePopover = replacement;
        identityGate.resolve([replicatedTermEntry()]);
        await staleIdentity;
        expect(showCard).not.toHaveBeenCalled();
        app.destroy();
    });

    it('imports a settings-listed dictionary the local store lacks', async () => {
        await persistDictionaryArchive({ title: 'Jitendex.org [2026-06-06]', filename: 'jitendex.zip', file: new Blob([new Uint8Array(64)]) });
        const importFile = vi.fn(async () => importSummary('Jitendex.org [2026-06-06]'));
        const store: DictionaryReplicationStore = {
            summary: async () => ({ dictionaries: [] }),
            importFile,
            importFromUrl: vi.fn(async () => importSummary('unused')),
        };
        const onReplicated = vi.fn();
        const imported = await ensureLocalDictionariesReplicated({
            dictionaries: store,
            getSettings: () => settingsWith([{ name: 'Jitendex.org [2026-06-06]', enabled: true }]),
            onReplicated,
        });
        expect(imported).toEqual(['Jitendex.org [2026-06-06]']);
        expect(importFile).toHaveBeenCalledOnce();
        expect(importFile).toHaveBeenCalledWith(expect.any(File), undefined, '', { persistArchive: false });
        expect(onReplicated).toHaveBeenCalledWith(['Jitendex.org [2026-06-06]']);
    });

    it('restores an existing local-only profile into a cold origin without requesting persistent site storage', async () => {
        const sourceOrigin = new IDBFactory();
        const coldOrigin = new IDBFactory();
        const persist = vi.fn(async () => true);
        vi.stubGlobal('navigator', { ...navigator, storage: { persist } });
        vi.stubGlobal('indexedDB', sourceOrigin);
        vi.stubGlobal('IDBKeyRange', IDBKeyRange);

        const sourceStore = new YomitanDictionaryStore();
        let coldStore: YomitanDictionaryStore | undefined;
        try {
            const imported = [
                ['Priority Local', 'preferred local definition', 'priority.zip'],
                ['Secondary Local', 'secondary local definition', 'secondary.zip'],
            ] as const;
            for (const [title, glossary, filename] of imported) {
                const file = new File([yomitanZipBlob({
                    'index.json': { title, format: 3 },
                    'term_bank_1.json': [['読む', 'よむ', '', 'v5m', 10, [glossary], 1, '']],
                })], filename, { type: 'application/zip' });
                await sourceStore.importFile(file);
            }

            const preferences = settingsWith(imported.map(([name]) => ({ name, enabled: true }))).dictionaryPreferences;
            const saved = captureActiveLanguageProfileDictionaries({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key-that-must-not-be-used',
                jitenApiKey: 'jiten-key-that-must-not-be-used',
                localDictionariesEnabled: true,
                parserProvider: 'local',
                dictionaryPreferences: preferences,
            }, preferences);
            await saveSettings(saved);
            const restored = await loadSettings();
            expect(restored).toMatchObject({
                localDictionariesEnabled: true,
                parserProvider: 'local',
                dictionaryPreferences: [
                    { name: 'Priority Local', enabled: true, priority: 0 },
                    { name: 'Secondary Local', enabled: true, priority: 1 },
                ],
            });
            expect(navigator.storage?.persist).toBe(persist);
            const persistenceRequestsBeforeReplication = persist.mock.calls.length;

            // A separate origin gets a separate IndexedDB factory and a fresh
            // module realm, while the userscript manager's archive/settings
            // values above remain shared.
            vi.stubGlobal('indexedDB', coldOrigin);
            vi.resetModules();
            const coldDictionaryModule = await import('../../src/reader/dictionaries/yomitan');
            const coldReplicationModule = await import('../../src/reader/dictionaries/replication');
            const coldParserModule = await import('../../src/reader/lookup/parser');
            coldStore = new coldDictionaryModule.YomitanDictionaryStore();
            await expect(coldStore.summary()).resolves.toMatchObject({ dictionaries: [] });

            const replicated = await coldReplicationModule.ensureLocalDictionariesReplicated({
                dictionaries: coldStore,
                getSettings: () => restored,
                onReplicated: vi.fn(),
            });
            expect(replicated).toEqual(['Priority Local', 'Secondary Local']);
            expect(persist).toHaveBeenCalledTimes(persistenceRequestsBeforeReplication);

            const entries = await coldStore.lookup('読む', 'よむ', 8, restored.dictionaryPreferences);
            expect(entries.map(entry => entry.dictionary)).toEqual(['Priority Local', 'Secondary Local']);
            await expect(coldStore.hasTermDictionaries()).resolves.toBe(true);
            await expect(coldStore.findTermMatches('本を読む', 32, restored.dictionaryPreferences)).resolves.toMatchObject([
                { surface: '読む', entry: { dictionary: 'Priority Local' } },
            ]);

            const jpdbParse = vi.fn(async () => []);
            const jitenParse = vi.fn(async () => []);
            const publicJitenParse = vi.fn(async () => []);
            const parser = new coldParserModule.ReaderParser({
                getSettings: () => restored,
                dictionaries: coldStore,
                jpdb: { parse: jpdbParse } as never,
                jiten: { parse: jitenParse } as never,
                jitenPublicVocabulary: { parse: publicJitenParse },
            });
            const [tokens] = await parser.parse(['本を読む'], { allowSegmentedFallback: true });
            expect(tokens?.find(token => token.card?.source === 'local')?.card).toMatchObject({ spelling: '読む', source: 'local' });
            expect(jpdbParse).not.toHaveBeenCalled();
            expect(jitenParse).not.toHaveBeenCalled();
            expect(publicJitenParse).not.toHaveBeenCalled();
        } finally {
            vi.stubGlobal('indexedDB', coldOrigin);
            await coldStore?.deleteDatabase({ timeoutMs: 2_000 }).catch(() => undefined);
            vi.stubGlobal('indexedDB', sourceOrigin);
            await sourceStore.deleteDatabase({ timeoutMs: 2_000 }).catch(() => undefined);
        }
    });

    it('skips dictionaries already installed on this origin', async () => {
        await persistDictionaryArchive({ title: 'Jitendex.org [2026-06-06]', filename: 'jitendex.zip', file: new Blob([new Uint8Array(64)]) });
        const importFile = vi.fn(async () => importSummary('Jitendex.org [2026-06-06]'));
        const imported = await ensureLocalDictionariesReplicated({
            dictionaries: {
                summary: async () => ({ dictionaries: [{ title: 'Jitendex.org [2026-06-06]' }] }),
                importFile,
                importFromUrl: vi.fn(async () => importSummary('unused')),
            },
            getSettings: () => settingsWith([{ name: 'Jitendex.org [2026-06-06]', enabled: true }]),
            onReplicated: vi.fn(),
        });
        expect(imported).toEqual([]);
        expect(importFile).not.toHaveBeenCalled();
    });

    it('stops before the next archive when dictionaries are disabled during an import', async () => {
        await persistDictionaryArchive({ title: 'First Local', filename: 'first.zip', file: new Blob([new Uint8Array(32)]) });
        await persistDictionaryArchive({ title: 'Second Local', filename: 'second.zip', file: new Blob([new Uint8Array(32)]) });
        const firstStarted = deferred<void>();
        const finishFirst = deferred<void>();
        let settings = settingsWith([
            { name: 'First Local', enabled: true },
            { name: 'Second Local', enabled: true },
        ]);
        const importFile = vi.fn(async () => {
            firstStarted.resolve(undefined);
            await finishFirst.promise;
            return importSummary('First Local');
        });
        const onReplicated = vi.fn();
        const replication = ensureLocalDictionariesReplicated({
            dictionaries: {
                summary: async () => ({ dictionaries: [] }),
                importFile,
                importFromUrl: vi.fn(async () => importSummary('unused')),
            },
            getSettings: () => settings,
            onReplicated,
        });

        await firstStarted.promise;
        settings = { ...settings, localDictionariesEnabled: false };
        finishFirst.resolve(undefined);

        await expect(replication).resolves.toEqual(['First Local']);
        expect(importFile).toHaveBeenCalledOnce();
        expect(onReplicated).toHaveBeenCalledWith(['First Local']);
    });

    it('treats an installed newer revision as covering the stale preference row', async () => {
        await persistDictionaryArchive({ title: 'Jitendex.org [2026-06-06]', filename: 'jitendex.zip', file: new Blob([new Uint8Array(64)]) });
        const importFile = vi.fn(async () => importSummary('Jitendex.org [2026-06-06]'));
        const imported = await ensureLocalDictionariesReplicated({
            dictionaries: {
                summary: async () => ({ dictionaries: [{ title: 'Jitendex.org [2026-07-07]' }] }),
                importFile,
                importFromUrl: vi.fn(async () => importSummary('unused')),
            },
            getSettings: () => settingsWith([{ name: 'Jitendex.org [2026-06-06]', enabled: true }]),
            onReplicated: vi.fn(),
        });
        expect(imported).toEqual([]);
        expect(importFile).not.toHaveBeenCalled();
    });

    it('ignores archives whose preference row is disabled and downloads URL-only archives', async () => {
        await persistDictionaryArchive({ title: 'Old Dict', filename: 'old.zip', file: new Blob([new Uint8Array(32)]) });
        await persistDictionaryArchive({ title: 'Kanjium Pitch', filename: 'kanjium.zip', downloadUrl: 'https://example.test/kanjium.zip' });
        const importFromUrl = vi.fn(async () => importSummary('Kanjium Pitch'));
        const imported = await ensureLocalDictionariesReplicated({
            dictionaries: {
                summary: async () => ({ dictionaries: [] }),
                importFile: vi.fn(async () => importSummary('Old Dict')),
                importFromUrl,
            },
            getSettings: () => settingsWith([{ name: 'Old Dict', enabled: false }, { name: 'Kanjium Pitch', enabled: true }]),
            onReplicated: vi.fn(),
        });
        expect(imported).toEqual(['Kanjium Pitch']);
        expect(importFromUrl).toHaveBeenCalledWith('https://example.test/kanjium.zip', 'kanjium.zip', undefined, { persistArchive: false });
    });

    it('reapplies catalogue integrity checks when a URL archive replicates to another origin', async () => {
        const sha256 = 'b'.repeat(64);
        await persistDictionaryArchive({
            title: 'JMdict [2026-07-23]',
            filename: 'jmdict.zip',
            downloadUrl: 'https://dictionaries.yomureader.com/objects/jmdict.zip',
            integrity: { sha256, bytes: 654_321 },
        });
        const importFromUrl = vi.fn(async () => importSummary('JMdict [2026-07-23]'));

        await ensureLocalDictionariesReplicated({
            dictionaries: {
                summary: async () => ({ dictionaries: [] }),
                importFile: vi.fn(async () => importSummary('unused')),
                importFromUrl,
            },
            getSettings: () => settingsWith([{ name: 'JMdict [2026-07-23]', enabled: true }]),
            onReplicated: vi.fn(),
        });

        expect(importFromUrl).toHaveBeenCalledWith(
            'https://dictionaries.yomureader.com/objects/jmdict.zip',
            'jmdict.zip',
            undefined,
            {
                persistArchive: false,
                integrity: { sha256, bytes: 654_321 },
            },
        );
    });

    it('backs off an archive that keeps failing on this origin', async () => {
        await persistDictionaryArchive({ title: 'Broken Dict', filename: 'broken.zip', file: new Blob([new Uint8Array(32)]) });
        const importFile = vi.fn(async () => { throw new Error('corrupt zip'); });
        const store: DictionaryReplicationStore = {
            summary: async () => ({ dictionaries: [] }),
            importFile,
            importFromUrl: vi.fn(async () => importSummary('unused')),
        };
        const options = {
            dictionaries: store,
            getSettings: () => settingsWith([{ name: 'Broken Dict', enabled: true }]),
            onReplicated: vi.fn(),
            now: () => 1_000_000,
        };
        expect(await ensureLocalDictionariesReplicated(options)).toEqual([]);
        expect(importFile).toHaveBeenCalledTimes(1);
        // Same origin, immediately again: inside the backoff window → skipped.
        expect(await ensureLocalDictionariesReplicated(options)).toEqual([]);
        expect(importFile).toHaveBeenCalledTimes(1);
    });

    it('retries an archive locked out by the pre-Xray-fix replication state', async () => {
        await persistDictionaryArchive({ title: 'Recovered Dict', filename: 'recovered.zip', file: new Blob([new Uint8Array(32)]) });
        localStorage.setItem('yomu-dictionary-replication-state', JSON.stringify({
            'recovered dict': { attempts: 3, lastAt: 1_000_000 },
        }));
        const importFile = vi.fn(async () => importSummary('Recovered Dict'));
        const onReplicated = vi.fn();

        const imported = await ensureLocalDictionariesReplicated({
            dictionaries: {
                summary: async () => ({ dictionaries: [] }),
                importFile,
                importFromUrl: vi.fn(async () => importSummary('unused')),
            },
            getSettings: () => settingsWith([{ name: 'Recovered Dict', enabled: true }]),
            onReplicated,
            now: () => 1_000_001,
        });

        expect(imported).toEqual(['Recovered Dict']);
        expect(importFile).toHaveBeenCalledOnce();
        expect(onReplicated).toHaveBeenCalledWith(['Recovered Dict']);
        expect(JSON.parse(localStorage.getItem('yomu-dictionary-replication-state') ?? '{}')).toEqual({
            version: 2,
            archives: {},
        });
    });
});
