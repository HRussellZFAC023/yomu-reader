import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginDictionaryImport, configureExtensionDictionaryBackgroundStorage, requestPersistentDictionaryStorage } from '../../src/reader/dictionaries/extension-background-adapters';
import { StaleManagedStateEpochError } from '../../src/reader/app/managed-state-epoch';
import { compiledDictionaryBackgroundSource } from './helpers/compiled-dictionary-background';

const PREFIX = 'dictionary-owner-test_';
function storageFixture(values: Record<string, unknown> = {}) {
    const get = vi.fn(async (key: string) => Object.hasOwn(values, key) ? { [key]: values[key] } : {});
    configureExtensionDictionaryBackgroundStorage({ browser: { storage: { local: { get } } } } as unknown as typeof globalThis, PREFIX);
    return { get, values };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('compiled dictionary background', () => {
    it('admits a canonical import without page-replica reads or persistence prompts', async () => {
        const { get } = storageFixture();
        const gm = vi.fn(() => { throw new Error('Content GM storage must not run in its host'); });
        const persist = vi.fn(async () => true);
        vi.stubGlobal('GM_getValue', gm);
        vi.stubGlobal('navigator', { storage: { persist } });
        try {
            const importing = await beginDictionaryImport();
            const mutate = vi.fn();
            importing({} as IDBTransaction, mutate);
            requestPersistentDictionaryStorage();
            expect(mutate).toHaveBeenCalledOnce();
            expect(gm).not.toHaveBeenCalled();
            expect(persist).not.toHaveBeenCalled();
            expect(get.mock.calls.map(([key]) => key)).not.toContain(`${PREFIX}yomu:dictionary-replica-purge:v1`);
            expect(get.mock.calls.map(([key]) => key)).toContain(`${PREFIX}yomu:factory-reset-signal`);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('rejects canonical imports during factory reset', async () => {
        storageFixture({ [`${PREFIX}yomu:factory-reset-signal`]: { phase: 'prepare' } });
        await expect(beginDictionaryImport()).rejects.toThrow('suppressed during factory reset');
    });

    it('rejects admission from a stale epoch until the host adopts the new reset session', async () => {
        const { values } = storageFixture();
        await beginDictionaryImport();
        values[`${PREFIX}yomu:state-epoch`] = { version: 1, generation: 1, resetId: 'next-reset', committedAt: 100 };
        await expect(beginDictionaryImport()).rejects.toBeInstanceOf(StaleManagedStateEpochError);
    });

    it('builds the canonical owner without page storage or replica-purge machinery', () => {
        const source = compiledDictionaryBackgroundSource();
        expect(source).toContain('yomu-extension-dictionary-background-service');
        expect(source).not.toMatch(/\bgmStorage(?:Get|Set|Delete)\b|\bmanagedLocalStorage\b/);
        expect(source).not.toContain('dictionaryReplicaPurgeRequest');
    }, 30_000);
});
