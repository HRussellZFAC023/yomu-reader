import { afterEach, describe, expect, it, vi } from 'vitest';
import { FactoryResetCoordinator } from '../../src/reader/app/factory-reset-coordinator';
import { DEFAULT_SETTINGS, endSettingsResetGuard, saveSettings } from '../../src/reader/settings/index';

describe('FactoryResetCoordinator', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        endSettingsResetGuard();
        localStorage.clear();
        sessionStorage.clear();
    });

    it('removes the reset coordination signal before reloading', async () => {
        const caches = new Set(['yomu-newtab-old', 'foreign-cache']);
        const deleteCache = vi.fn(async (key: string) => caches.delete(key));
        vi.stubGlobal('caches', {
            keys: vi.fn(async () => [...caches]),
            delete: deleteCache,
        });
        const resetDictionaryDatabase = vi.fn(async () => ({ cleared: true, deleted: true }));
        const { coordinator, gmValues, reload } = setupFactoryResetHarness({
            resetDictionaryDatabase,
        });

        const reset = coordinator.resetAllData();
        await vi.runAllTimersAsync();
        await reset;

        expect(gmValues.has('yomu:factory-reset-signal')).toBe(false);
        expect(gmValues.get('yomu:state-epoch')).toMatchObject({
            version: 1,
            generation: 1,
            resetId: expect.any(String),
        });
        expect(deleteCache).toHaveBeenCalledWith('yomu-newtab-old');
        expect(caches.has('foreign-cache')).toBe(true);
        expect(resetDictionaryDatabase).toHaveBeenCalledTimes(2);
        expect(reload).toHaveBeenCalledOnce();
    });

    it('stops without reloading when dictionary reset fails', async () => {
        const { coordinator, gmValues, reload, toast } = setupFactoryResetHarness({
            gmValues: new Map<string, unknown>([
                ['jpdb-popup-reader-settings', { apiKey: 'still-here' }],
            ]),
            resetDictionaryDatabase: vi.fn(async () => {
                await saveSettings({ ...DEFAULT_SETTINGS, apiKey: 'rewritten-during-reset' });
                throw new Error('indexedDB blocked');
            }),
        });

        const reset = coordinator.resetAllData();
        await vi.runAllTimersAsync();
        await reset;

        expect(gmValues.has('jpdb-popup-reader-settings')).toBe(false);
        expect(gmValues.has('yomu:factory-reset-signal')).toBe(false);
        expect(gmValues.has('yomu:state-epoch')).toBe(false);
        expect(toast).toHaveBeenCalledWith('Reset failed.');
        expect(reload).not.toHaveBeenCalled();
    });

    it('reloads after epoch commit even when reset-signal cleanup fails', async () => {
        const { coordinator, gmValues, reload, toast } = setupFactoryResetHarness({
            failSignalCleanupAfterEpoch: true,
            resetDictionaryDatabase: vi.fn(async () => ({ cleared: true, deleted: true })),
        });

        const reset = coordinator.resetAllData();
        await vi.runAllTimersAsync();
        await reset;

        expect(gmValues.get('yomu:state-epoch')).toMatchObject({ generation: 1 });
        expect(gmValues.get('yomu:factory-reset-signal')).toMatchObject({ phase: 'complete' });
        expect(reload).toHaveBeenCalledOnce();
        expect(toast).not.toHaveBeenCalledWith('Reset failed.');
    });

    it('accepts an authoritative epoch commit when the hosted local cache cannot be written', async () => {
        const originalSetItem = Storage.prototype.setItem;
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string): void {
            if (key === 'yomu:state-epoch') throw new DOMException('Quota exceeded', 'QuotaExceededError');
            originalSetItem.call(this, key, value);
        });
        const { coordinator, gmValues, reload, toast } = setupFactoryResetHarness({
            resetDictionaryDatabase: vi.fn(async () => ({ cleared: true, deleted: true })),
        });

        const reset = coordinator.resetAllData();
        await vi.runAllTimersAsync();
        await reset;

        expect(gmValues.get('yomu:state-epoch')).toMatchObject({ generation: 1 });
        expect(reload).toHaveBeenCalledOnce();
        expect(toast).not.toHaveBeenCalledWith('Reset failed.');
    });

    it('reloads when authoritative verification fails after the epoch write may have landed', async () => {
        const { coordinator, gmValues, reload, toast } = setupFactoryResetHarness({
            failEpochReadAfterWrite: true,
            resetDictionaryDatabase: vi.fn(async () => ({ cleared: true, deleted: true })),
        });

        const reset = coordinator.resetAllData();
        await vi.runAllTimersAsync();
        await reset;

        expect(gmValues.get('yomu:state-epoch')).toMatchObject({ generation: 1 });
        expect(reload).toHaveBeenCalledOnce();
        expect(toast).not.toHaveBeenCalledWith('Reset failed.');
    });

    it('fails closed before deleting or reloading when GM inventory is incomplete', async () => {
        const resetDictionaryDatabase = vi.fn(async () => ({ cleared: true, deleted: true }));
        const { coordinator, gmValues, reload, toast } = setupFactoryResetHarness({
            gmValues: new Map<string, unknown>([
                ['jpdb-popup-reader-settings', { apiKey: 'still-here' }],
                ['yomu:srs-local:v2:index', { version: 2, revision: 1, cardIds: ['sentinel'], tombstoneIds: [] }],
                ['yomu:srs-local:v2:card:sentinel', { spelling: '読む' }],
            ]),
            listValues: false,
            resetDictionaryDatabase,
        });

        const reset = coordinator.resetAllData();
        await vi.runAllTimersAsync();
        await reset;

        expect(gmValues.get('jpdb-popup-reader-settings')).toEqual({ apiKey: 'still-here' });
        expect(gmValues.has('yomu:srs-local:v2:card:sentinel')).toBe(true);
        expect(gmValues.has('yomu:factory-reset-signal')).toBe(false);
        expect(gmValues.has('yomu:state-epoch')).toBe(false);
        expect(resetDictionaryDatabase).not.toHaveBeenCalled();
        expect(reload).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalledWith(expect.stringContaining('not every saved item'));
    });
});

function setupFactoryResetHarness(options: {
    gmValues?: Map<string, unknown>;
    listValues?: boolean;
    failSignalCleanupAfterEpoch?: boolean;
    failEpochReadAfterWrite?: boolean;
    resetDictionaryDatabase: () => Promise<unknown>;
}): {
    coordinator: FactoryResetCoordinator;
    gmValues: Map<string, unknown>;
    reload: ReturnType<typeof vi.fn>;
    toast: ReturnType<typeof vi.fn>;
} {
    vi.useFakeTimers();
    const gmValues = options.gmValues ?? new Map<string, unknown>();
    let epochWritten = false;
    vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => {
        if (options.failEpochReadAfterWrite && epochWritten && key === 'yomu:state-epoch') {
            throw new Error('epoch verification unavailable');
        }
        return gmValues.has(key) ? gmValues.get(key) : fallback;
    }));
    vi.stubGlobal('GM_setValue', vi.fn((key: string, value: unknown) => {
        gmValues.set(key, value);
        if (key === 'yomu:state-epoch') epochWritten = true;
    }));
    vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => {
        if (options.failSignalCleanupAfterEpoch
            && key === 'yomu:factory-reset-signal'
            && gmValues.has('yomu:state-epoch')) {
            throw new Error('signal cleanup failed');
        }
        gmValues.delete(key);
    }));
    vi.stubGlobal('GM_listValues', options.listValues === false ? undefined : vi.fn(() => [...gmValues.keys()]));
    vi.stubGlobal('BroadcastChannel', undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const reload = vi.fn();
    const toast = vi.fn();
    const coordinator = new FactoryResetCoordinator({
        isDestroyed: () => false,
        getLanguage: () => 'en',
        invalidateRuntimeStores: vi.fn(async () => undefined),
        resetDictionaryDatabase: options.resetDictionaryDatabase,
        toast,
        reload,
    });
    return { coordinator, gmValues, reload, toast };
}
