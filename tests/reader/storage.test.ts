import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    clearManagedStoredValues,
    clearFactoryResetSignal,
    createFactoryResetSignal,
    exportManagedStoredValues,
    gmStorageDelete,
    gmStorageGet,
    gmStorageSet,
    gmPrivateStorageDelete,
    gmPrivateStorageGet,
    gmPrivateStorageSet,
    importStoredValues,
    publishFactoryResetSignal,
    subscribeToFactoryResetSignals,
    subscribeToStoredValueChanges,
    withGmStorageLease,
    type FactoryResetSignal,
} from '../../src/reader/app/storage';

function stubGmStorage(values: Map<string, unknown>, options: { listValues?: boolean; deleteValue?: boolean } = {}): void {
    vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => values.has(key) ? values.get(key) : fallback));
    vi.stubGlobal('GM_deleteValue', options.deleteValue === false ? undefined : vi.fn((key: string) => {
        values.delete(key);
    }));
    vi.stubGlobal('GM_listValues', options.listValues ? vi.fn(() => [...values.keys()]) : undefined);
}

function exhaustRealLocalStorage(): void {
    let index = 0;
    for (const size of [100_000, 10_000, 1_000, 100, 10, 1]) {
        const chunk = 'x'.repeat(size);
        while (true) {
            try {
                localStorage.setItem(`quota-${index++}`, chunk);
            } catch {
                break;
            }
        }
    }
    expect(() => localStorage.setItem('quota-proof', 'x')).toThrow();
}

describe('storage reset', () => {
    afterEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        vi.unstubAllGlobals();
    });

    it('clears local and session mirrors when deleting a GM storage key', async () => {
        const values = new Map<string, unknown>([['jpdb-popup-reader-settings', { apiKey: 'secret' }]]);
        const deleteValue = vi.fn(async (key: string) => { values.delete(key); });
        vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => values.has(key) ? values.get(key) : fallback));
        vi.stubGlobal('GM_deleteValue', deleteValue);
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({
            apiKey: 'secret',
            dictionaryPreferences: [{ name: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 0 }],
        }));
        sessionStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({ apiKey: 'session-secret' }));

        await gmStorageDelete('jpdb-popup-reader-settings');

        expect(deleteValue).toHaveBeenCalledWith('jpdb-popup-reader-settings');
        expect(localStorage.getItem('jpdb-popup-reader-settings')).toBeNull();
        expect(sessionStorage.getItem('jpdb-popup-reader-settings')).toBeNull();
    });

    it('keeps private device credentials out of page storage and DOM bridges', async () => {
        const key = 'yomu:private:academy-device:v1';
        const secret = { credential: 'top-secret', key: 'profile-key' };
        localStorage.setItem(key, JSON.stringify({ credential: 'legacy-leak' }));
        sessionStorage.setItem(key, JSON.stringify({ credential: 'legacy-session-leak' }));
        const bridgeSet = vi.fn();
        document.documentElement.dataset.yomuUserscriptStorageBridge = 'true';
        window.addEventListener('yomu-userscript-storage-request', bridgeSet);

        await expect(gmPrivateStorageSet(key, secret)).rejects.toThrow('Secure extension storage is unavailable');
        expect(await gmPrivateStorageGet(key, null)).toBeNull();
        expect(localStorage.getItem(key)).toBeNull();
        expect(sessionStorage.getItem(key)).toBeNull();
        expect(bridgeSet).not.toHaveBeenCalled();

        const values = new Map<string, unknown>();
        vi.stubGlobal('GM_getValue', vi.fn((name: string, fallback: unknown) => values.get(name) ?? fallback));
        vi.stubGlobal('GM_setValue', vi.fn((name: string, value: unknown) => { values.set(name, value); }));
        vi.stubGlobal('GM_deleteValue', vi.fn((name: string) => { values.delete(name); }));
        await gmPrivateStorageSet(key, secret);
        expect(await gmPrivateStorageGet(key, null)).toEqual(secret);
        await gmPrivateStorageDelete(key);
        expect(values.has(key)).toBe(false);
        window.removeEventListener('yomu-userscript-storage-request', bridgeSet);
        delete document.documentElement.dataset.yomuUserscriptStorageBridge;
    });

    it('shares normal and private state through packaged-extension storage', async () => {
        const values = new Map<string, unknown>();
        vi.stubGlobal('chrome', {
            runtime: { id: 'reader-extension-id' },
            storage: { local: {
                get: vi.fn(async (key: string | null) => key === null
                    ? Object.fromEntries(values)
                    : values.has(key) ? { [key]: values.get(key) } : {}),
                set: vi.fn(async (items: Record<string, unknown>) => {
                    Object.entries(items).forEach(([key, value]) => values.set(key, value));
                }),
                remove: vi.fn(async (key: string) => { values.delete(key); }),
            } },
        });
        const deck = { version: 1, cards: { word: { expression: '読む' } } };
        await gmStorageSet('yomu:srs-local:v1', deck);
        await gmPrivateStorageSet('yomu:private:academy-device:v1', { credential: 'secret' });

        expect(await gmStorageGet('yomu:srs-local:v1', null)).toEqual(deck);
        expect(await gmPrivateStorageGet('yomu:private:academy-device:v1', null)).toEqual({ credential: 'secret' });
        expect(localStorage.getItem('yomu:srs-local:v1')).toBeNull();
        expect(localStorage.getItem('yomu:private:academy-device:v1')).toBeNull();
    });

    it('serializes simultaneous GM-backed transactions without a shared-value CAS', async () => {
        const values = new Map<string, unknown>();
        stubGmStorage(values, { listValues: true });
        vi.stubGlobal('GM_setValue', vi.fn((key: string, value: unknown) => { values.set(key, value); }));

        let active = 0;
        let maximumActive = 0;
        const order: string[] = [];
        const transaction = (id: string): Promise<void> => withGmStorageLease('cross-tab-test', async () => {
            active++;
            maximumActive = Math.max(maximumActive, active);
            order.push(`${id}:start`);
            await new Promise(resolve => setTimeout(resolve, 10));
            order.push(`${id}:end`);
            active--;
        }, { leaseMs: 1_000, pollMs: 1, timeoutMs: 2_000 });

        await Promise.all([transaction('a'), transaction('b')]);

        expect(maximumActive).toBe(1);
        expect(order.join(',')).toMatch(/^(?:a:start,a:end,b:start,b:end|b:start,b:end,a:start,a:end)$/u);
        expect([...values.keys()].filter(key => key.startsWith('yomu:lease:'))).toEqual([]);
    });

    it('mirrors hosted GM settings writes to localStorage for the docs app', async () => {
        const setValue = vi.fn(async () => undefined);
        vi.stubGlobal('location', {
            href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/index.html',
            hostname: 'hrussellzfac023.github.io',
            pathname: '/yomu-reader/newtab/index.html',
        });
        vi.stubGlobal('GM_getValue', vi.fn((_key: string, fallback: unknown) => fallback));
        vi.stubGlobal('GM_setValue', setValue);

        await gmStorageSet('jpdb-popup-reader-settings', {
            localDictionariesEnabled: true,
            dictionaryPreferences: [{ name: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 0 }],
        });

        expect(setValue).toHaveBeenCalledWith('jpdb-popup-reader-settings', expect.any(Object));
        expect(JSON.parse(localStorage.getItem('jpdb-popup-reader-settings') ?? 'null')).toMatchObject({
            localDictionariesEnabled: true,
            dictionaryPreferences: [{ name: 'Jitendex' }],
        });
    });

    it('factory reset fails closed before deleting when GM_listValues is genuinely unavailable', async () => {
        const gmValues = new Map<string, unknown>([
            ['jpdb-popup-reader-settings', {
                apiKey: 'secret',
                dictionaryPreferences: [{ name: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 0 }],
            }],
            ['jpdb-reader-settings', { apiKey: 'legacy-secret' }],
            ['jpdb-reader-transcript-panel-size', { sideWidth: 720, bottomHeight: 360 }],
            ['jpdb-reader-newtab-jpdb-stats-history', { importedAt: 123 }],
            ['jpdb-reader-newtab-disabled-anki-decks', ['Archive']],
            ['yomu:anki-status-index:v1', { version: 1, entries: {} }],
            ['yomu:prefer-japanese-site-language', true],
        ]);
        stubGmStorage(gmValues);
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({ apiKey: 'local-secret' }));
        sessionStorage.setItem('jpdb-reader-transcript-panel-size', JSON.stringify({ sideWidth: 900 }));
        localStorage.setItem('unrelated-site-setting', 'keep me');

        await expect(clearManagedStoredValues()).rejects.toMatchObject({
            name: 'ManagedStateResetError',
            yomuUiCopyKey: 'factoryResetStorageIncomplete',
        });

        expect(gmValues.get('jpdb-popup-reader-settings')).toMatchObject({ apiKey: 'secret' });
        expect(localStorage.getItem('jpdb-popup-reader-settings')).not.toBeNull();
        expect(sessionStorage.getItem('jpdb-reader-transcript-panel-size')).not.toBeNull();
        expect(localStorage.getItem('unrelated-site-setting')).toBe('keep me');
    });

    it('factory reset deletes the Anki status IndexedDB cache', async () => {
        const deleteDatabase = vi.fn((_name: string) => {
            const request: {
                onsuccess: ((event: Event) => void) | null;
                onerror: ((event: Event) => void) | null;
                onblocked: ((event: Event) => void) | null;
            } = {
                onsuccess: null,
                onerror: null,
                onblocked: null,
            };
            queueMicrotask(() => request.onsuccess?.(new Event('success')));
            return request as unknown as IDBOpenDBRequest;
        });
        vi.stubGlobal('indexedDB', { deleteDatabase });

        await clearManagedStoredValues();

        expect(deleteDatabase).toHaveBeenCalledWith('yomu-anki-status-index');
    });

    it('factory reset deletes modern GM storage values', async () => {
        const gmValues = new Map<string, unknown>([
            ['jpdb-popup-reader-settings', { apiKey: 'secret' }],
            ['yomu-custom-cache', { cached: true }],
        ]);
        vi.stubGlobal('GM_getValue', undefined);
        vi.stubGlobal('GM_deleteValue', undefined);
        vi.stubGlobal('GM_listValues', undefined);
        vi.stubGlobal('GM', {
            getValue: vi.fn((key: string, fallback: unknown) => gmValues.has(key) ? gmValues.get(key) : fallback),
            deleteValue: vi.fn((key: string) => {
                gmValues.delete(key);
            }),
            listValues: vi.fn(() => [...gmValues.keys()]),
        });

        await clearManagedStoredValues();

        expect(gmValues.size).toBe(0);
    });

    it('publishes factory reset signals through GM storage listeners', async () => {
        let listener: ((key: string, oldValue: unknown, newValue: unknown, remote: boolean) => void) | undefined;
        const addValueChangeListener = vi.fn((
            _key: string,
            callback: (key: string, oldValue: unknown, newValue: unknown, remote: boolean) => void,
        ) => {
            listener = callback;
            return 17;
        });
        const removeValueChangeListener = vi.fn();
        const setValue = vi.fn(async (key: string, value: unknown) => {
            listener?.(key, null, value, true);
        });
        vi.stubGlobal('BroadcastChannel', undefined);
        vi.stubGlobal('GM_addValueChangeListener', addValueChangeListener);
        vi.stubGlobal('GM_removeValueChangeListener', removeValueChangeListener);
        vi.stubGlobal('GM_setValue', setValue);

        const received: Array<{ signal: FactoryResetSignal; remote: boolean; transport: string }> = [];
        const unsubscribe = subscribeToFactoryResetSignals((signal, source) => {
            received.push({ signal, remote: source.remote, transport: source.transport });
        });
        const signal = createFactoryResetSignal('prepare', 'reset-test');

        await publishFactoryResetSignal(signal);
        unsubscribe();

        expect(addValueChangeListener).toHaveBeenCalledWith('yomu:factory-reset-signal', expect.any(Function));
        expect(setValue).toHaveBeenCalledWith('yomu:factory-reset-signal', signal);
        expect(received).toEqual([{
            signal,
            remote: true,
            transport: 'gm-storage',
        }]);
        expect(removeValueChangeListener).toHaveBeenCalledWith(17);
    });

    it('publishes stored value changes through GM storage listeners', async () => {
        let listener: ((key: string, oldValue: unknown, newValue: unknown, remote: boolean) => void) | undefined;
        const values = new Map<string, unknown>([['jpdb-popup-reader-settings', { theme: 'light' }]]);
        const addValueChangeListener = vi.fn((
            _key: string,
            callback: (key: string, oldValue: unknown, newValue: unknown, remote: boolean) => void,
        ) => {
            listener = callback;
            return 21;
        });
        const removeValueChangeListener = vi.fn();
        vi.stubGlobal('BroadcastChannel', undefined);
        vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => values.has(key) ? values.get(key) : fallback));
        vi.stubGlobal('GM_setValue', vi.fn(async (key: string, value: unknown) => {
            const oldValue = values.get(key);
            values.set(key, value);
            listener?.(key, oldValue, value, true);
        }));
        vi.stubGlobal('GM_addValueChangeListener', addValueChangeListener);
        vi.stubGlobal('GM_removeValueChangeListener', removeValueChangeListener);

        const changes: unknown[] = [];
        const unsubscribe = subscribeToStoredValueChanges('jpdb-popup-reader-settings', value => {
            changes.push(value);
        });

        await gmStorageSet('jpdb-popup-reader-settings', { theme: 'dark' });
        await vi.waitFor(() => expect(changes).toEqual([{ theme: 'dark' }]));
        unsubscribe();

        expect(addValueChangeListener).toHaveBeenCalledWith('jpdb-popup-reader-settings', expect.any(Function));
        expect(removeValueChangeListener).toHaveBeenCalledWith(21);
    });

    it('can delete its coordination signal without GM_listValues', async () => {
        const gmValues = new Map<string, unknown>([
            ['yomu:factory-reset-signal', createFactoryResetSignal('complete', 'reset-test')],
        ]);
        stubGmStorage(gmValues);

        await clearFactoryResetSignal();

        expect(gmValues.size).toBe(0);
    });
});

describe('storage resilience', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        vi.unstubAllGlobals();
    });

    afterEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        vi.unstubAllGlobals();
    });

    it('treats a structured-clone of the missing sentinel as "not stored"', async () => {
        // Message-based GM implementations (Safari Userscripts, FireMonkey)
        // round-trip the default value, so identity checks fail.
        vi.stubGlobal('GM_getValue', vi.fn(async (_key: string, fallback: unknown) =>
            JSON.parse(JSON.stringify(fallback))));

        await expect(gmStorageGet('jpdb-popup-reader-settings', null)).resolves.toBeNull();
    });

    it('still returns stored values when GM_getValue round-trips data', async () => {
        const gmValues = new Map<string, unknown>([['jpdb-popup-reader-settings', { onboardingSeen: true }]]);
        vi.stubGlobal('GM_getValue', vi.fn(async (key: string, fallback: unknown) =>
            JSON.parse(JSON.stringify(gmValues.has(key) ? gmValues.get(key) : fallback))));

        await expect(gmStorageGet('jpdb-popup-reader-settings', null)).resolves.toEqual({ onboardingSeen: true });
    });

    it('falls back to localStorage when a present GM_setValue rejects', async () => {
        vi.stubGlobal('GM_getValue', vi.fn((_key: string, fallback: unknown) => fallback));
        vi.stubGlobal('GM_setValue', vi.fn(async () => {
            throw new Error('dead bridge');
        }));

        await expect(gmStorageSet('jpdb-popup-reader-settings', { onboardingSeen: true }))
            .rejects.toThrow('GM storage write failed');

        expect(JSON.parse(localStorage.getItem('jpdb-popup-reader-settings') ?? 'null'))
            .toEqual({ onboardingSeen: true });
    });

    it('surfaces a userscript write failure even when the real localStorage fallback is also full', async () => {
        vi.stubGlobal('GM_getValue', vi.fn((_key: string, fallback: unknown) => fallback));
        vi.stubGlobal('GM_setValue', vi.fn(async () => {
            throw new Error('dead bridge');
        }));
        exhaustRealLocalStorage();

        await expect(gmStorageSet('jpdb-popup-reader-settings', { showFurigana: false }))
            .rejects.toThrow(/storage write failed/i);
    });

    it('surfaces a packaged-extension write failure when the real localStorage fallback is also full', async () => {
        vi.stubGlobal('chrome', {
            runtime: { id: 'reader-extension-id' },
            storage: { local: {
                get: vi.fn(async () => ({})),
                set: vi.fn(async () => {
                    throw new Error('extension storage unavailable');
                }),
                remove: vi.fn(async () => undefined),
            } },
        });
        exhaustRealLocalStorage();

        await expect(gmStorageSet('jpdb-popup-reader-settings', { showFurigana: false }))
            .rejects.toThrow(/storage write failed/i);
    });
});

describe('managed storage backup', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        vi.unstubAllGlobals();
    });

    it('exports all Yomu-managed storage keys and excludes transient reset signals', async () => {
        localStorage.setItem('yomu-mining-context:test', JSON.stringify({ term: 'test' }));
        localStorage.setItem('jpdb-reader-newtab-ui', JSON.stringify({ mode: 'kanji' }));
        localStorage.setItem('unrelated-key', JSON.stringify({ keep: false }));
        localStorage.setItem('yomu:factory-reset-signal', JSON.stringify({ phase: 'prepare' }));

        await expect(exportManagedStoredValues()).resolves.toEqual({
            'jpdb-reader-newtab-ui': { mode: 'kanji' },
            'yomu-mining-context:test': { term: 'test' },
        });
    });

    it('exports known GM-only data when storage keys cannot be listed', async () => {
        const gmValues = new Map<string, unknown>([
            ['jpdb-reader-newtab-jpdb-stats-history', { importedAt: 123 }],
            ['jpdb-reader-newtab-disabled-anki-decks', ['Archive']],
            ['yomu:anki-status-index:v1', { version: 1, entries: {} }],
            ['yomu:jiten-public-cache:v1', { 'card\n青空': { t: 1, v: { spelling: '青空' } } }],
            ['yomu:prefer-japanese-site-language', true],
            ['unrelated-key', 'ignore'],
        ]);
        stubGmStorage(gmValues, { deleteValue: false });

        await expect(exportManagedStoredValues()).resolves.toEqual({
            'jpdb-reader-newtab-disabled-anki-decks': ['Archive'],
            'jpdb-reader-newtab-jpdb-stats-history': { importedAt: 123 },
            'yomu:anki-status-index:v1': { version: 1, entries: {} },
            'yomu:jiten-public-cache:v1': { 'card\n青空': { t: 1, v: { spelling: '青空' } } },
            'yomu:prefer-japanese-site-language': true,
        });
    });

    it('imports only managed backup keys', async () => {
        const count = await importStoredValues({
            'jpdb-reader-transcript-panel-size': { width: 320 },
            'yomu:factory-reset-signal': { phase: 'prepare' },
            'unrelated-key': true,
        });

        expect(count).toBe(1);
        expect(JSON.parse(localStorage.getItem('jpdb-reader-transcript-panel-size') ?? 'null')).toEqual({ width: 320 });
        expect(localStorage.getItem('yomu:factory-reset-signal')).toBeNull();
        expect(localStorage.getItem('unrelated-key')).toBeNull();
    });

    it('merges imported local Yomu SRS decks instead of clobbering current progress', async () => {
        localStorage.setItem('yomu:srs-local:v1', JSON.stringify({
            version: 1,
            cards: {
                '読む\u0000よむ': {
                    id: '読む\u0000よむ',
                    expression: '読む',
                    reading: 'よむ',
                    meanings: ['read'],
                    tags: ['local'],
                    dueAt: 2000,
                    lastReviewAt: 1500,
                    createdAt: 1000,
                    updatedAt: 2000,
                    reviews: 3,
                    lapses: 0,
                    intervalDays: 7,
                    ease: 2.6,
                },
            },
        }));

        const count = await importStoredValues({
            'yomu:srs-local:v1': {
                version: 1,
                cards: {
                    '読む\u0000よむ': {
                        id: '読む\u0000よむ',
                        expression: '読む',
                        reading: 'よむ',
                        meanings: ['to read'],
                        tags: ['backup'],
                        dueAt: 500,
                        lastReviewAt: null,
                        createdAt: 500,
                        updatedAt: 1200,
                        reviews: 0,
                        lapses: 0,
                        intervalDays: 0,
                        ease: 2.5,
                    },
                    '図鑑\u0000ずかん': {
                        id: '図鑑\u0000ずかん',
                        expression: '図鑑',
                        reading: 'ずかん',
                        meanings: ['illustrated reference book'],
                        tags: ['backup'],
                        dueAt: 500,
                        lastReviewAt: null,
                        createdAt: 500,
                        updatedAt: 500,
                        reviews: 0,
                        lapses: 0,
                        intervalDays: 0,
                        ease: 2.5,
                    },
                },
            },
        });

        const deck = JSON.parse(localStorage.getItem('yomu:srs-local:v1') ?? 'null');

        expect(count).toBe(1);
        expect(Object.keys(deck.cards).sort()).toEqual(['図鑑\u0000ずかん', '読む\u0000よむ']);
        expect(deck.cards['読む\u0000よむ']).toMatchObject({
            dueAt: 2000,
            reviews: 3,
            intervalDays: 7,
            meanings: ['to read', 'read'],
            tags: ['backup', 'local'],
            createdAt: 500,
            updatedAt: 2000,
        });
    });

    it('merges per-card Yomu SRS backups and commits their index last', async () => {
        const readId = '読む\u0000よむ';
        const bookId = '図鑑\u0000ずかん';
        const readKey = `yomu:srs-local:v2:card:${encodeURIComponent(readId)}`;
        const bookKey = `yomu:srs-local:v2:card:${encodeURIComponent(bookId)}`;
        const indexKey = 'yomu:srs-local:v2:index';
        const card = (id: string, updatedAt: number, meanings: string[]) => ({
            id,
            expression: id.split('\u0000')[0],
            reading: id.split('\u0000')[1],
            meanings,
            tags: [],
            dueAt: updatedAt,
            lastReviewAt: null,
            createdAt: 500,
            updatedAt,
            reviews: updatedAt === 2_000 ? 3 : 0,
            lapses: 0,
            intervalDays: updatedAt === 2_000 ? 7 : 0,
            ease: 2.5,
        });
        localStorage.setItem(readKey, JSON.stringify(card(readId, 2_000, ['read'])));
        localStorage.setItem(indexKey, JSON.stringify({
            version: 2,
            revision: 4,
            cardIds: [readId],
            tombstoneIds: [],
        }));

        const count = await importStoredValues({
            [indexKey]: { version: 2, revision: 2, cardIds: [readId, bookId], tombstoneIds: [] },
            [readKey]: card(readId, 1_200, ['to read']),
            [bookKey]: card(bookId, 500, ['illustrated reference book']),
        });
        const index = JSON.parse(localStorage.getItem(indexKey) ?? '{}') as {
            revision?: number;
            cardIds?: string[];
        };
        const read = JSON.parse(localStorage.getItem(readKey) ?? '{}');

        expect(count).toBe(3);
        expect(index).toMatchObject({ revision: 5, cardIds: [bookId, readId].sort() });
        expect(read).toMatchObject({
            updatedAt: 2_000,
            reviews: 3,
            intervalDays: 7,
            meanings: ['to read', 'read'],
        });
        expect(JSON.parse(localStorage.getItem(bookKey) ?? '{}')).toMatchObject({
            id: bookId,
            meanings: ['illustrated reference book'],
        });
    });
});
