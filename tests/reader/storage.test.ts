import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    clearManagedStoredValues,
    createFactoryResetSignal,
    exportManagedStoredValues,
    gmStorageDelete,
    importStoredValues,
    publishFactoryResetSignal,
    subscribeToFactoryResetSignals,
    type FactoryResetSignal,
} from '../../src/reader/storage';

describe('storage reset', () => {
    afterEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        vi.unstubAllGlobals();
    });

    it('clears local and session mirrors when deleting a GM storage key', async () => {
        const deleteValue = vi.fn(async () => undefined);
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

    it('factory reset deletes known GM keys even when GM_listValues is unavailable', async () => {
        const gmValues = new Map<string, unknown>([
            ['jpdb-popup-reader-settings', {
                apiKey: 'secret',
                dictionaryPreferences: [{ name: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 0 }],
            }],
            ['jpdb-reader-settings', { apiKey: 'legacy-secret' }],
            ['jpdb-reader-transcript-panel-size', { sideWidth: 720, bottomHeight: 360 }],
        ]);
        vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => gmValues.has(key) ? gmValues.get(key) : fallback));
        vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => {
            gmValues.delete(key);
        }));
        vi.stubGlobal('GM_listValues', undefined);
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({ apiKey: 'local-secret' }));
        sessionStorage.setItem('jpdb-reader-transcript-panel-size', JSON.stringify({ sideWidth: 900 }));
        localStorage.setItem('unrelated-site-setting', 'keep me');

        await clearManagedStoredValues();

        expect(gmValues.size).toBe(0);
        expect(localStorage.getItem('jpdb-popup-reader-settings')).toBeNull();
        expect(sessionStorage.getItem('jpdb-reader-transcript-panel-size')).toBeNull();
        expect(localStorage.getItem('unrelated-site-setting')).toBe('keep me');
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

    it('factory reset deletes its coordination signal when GM_listValues is unavailable', async () => {
        const gmValues = new Map<string, unknown>([
            ['yomu:factory-reset-signal', createFactoryResetSignal('complete', 'reset-test')],
        ]);
        vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => gmValues.has(key) ? gmValues.get(key) : fallback));
        vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => {
            gmValues.delete(key);
        }));
        vi.stubGlobal('GM_listValues', undefined);

        await clearManagedStoredValues();

        expect(gmValues.size).toBe(0);
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
});
