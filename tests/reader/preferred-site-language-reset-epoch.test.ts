import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduler } from 'node:timers/promises';
import { installFreshManagedStateEpochSessionForTests } from '../../src/reader/app/managed-state-epoch';

const EPOCH_KEY = 'yomu:state-epoch';
const PREFERENCE_KEY = 'yomu:prefer-japanese-site-language:v1';
const PREFERENCE_CACHE_KEY = 'yomu:prefer-japanese-site-language';

interface EpochRecord {
    readonly version: 1;
    readonly generation: number;
    readonly resetId: string;
    readonly committedAt: number;
}

let disablePreference: (() => void) | undefined;

function settleAsyncHandlers(): Promise<void> {
    // The install API resolves after the epoch barrier while its async-only
    // preference read can still be reconciling. Yield through Node's scheduler,
    // outside the fakeable global timer APIs, so that promise chain can drain.
    return scheduler.yield();
}

afterEach(() => {
    disablePreference?.();
    disablePreference = undefined;
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
});

describe('preferred-site-language cache reset epoch', () => {
    it('does not let a pre-reset cache override the factory default on another origin after reboot', async () => {
        const values = new Map<string, unknown>([[PREFERENCE_KEY, false]]);
        installGmStore(values);
        vi.stubGlobal('browser', { runtime: { id: 'epoch-cache-proof' } });

        const oldRealm = await import('../../src/reader/app/preferred-site-language-impl');
        await oldRealm.installPreferredJapaneseSiteLanguageFromStoredSettings();
        await settleAsyncHandlers();
        expect(localStorage.getItem(PREFERENCE_CACHE_KEY)).toBe('false');

        // Reset ran on a different origin: shared GM state advanced, but this
        // origin's pre-reset local cache and an unrelated host key remain.
        values.delete(PREFERENCE_KEY);
        values.set(EPOCH_KEY, epoch(1, 'factory-reset'));
        localStorage.setItem('foreign-site-token', 'keep');

        installFreshManagedStateEpochSessionForTests();
        vi.resetModules();
        const rebootedRealm = await import('../../src/reader/app/preferred-site-language-impl');
        disablePreference = () => rebootedRealm.applyPreferredJapaneseSiteLanguage(false);
        await rebootedRealm.installPreferredJapaneseSiteLanguageFromStoredSettings();
        await settleAsyncHandlers();

        const rebootedStorage = await import('../../src/reader/app/storage');
        expect(rebootedStorage.managedLocalStorage.getItem(PREFERENCE_CACHE_KEY)).toBe('true');
        expect(JSON.parse(localStorage.getItem(EPOCH_KEY) ?? 'null')).toMatchObject({
            generation: 1,
            resetId: 'factory-reset',
        });
        expect(localStorage.getItem('foreign-site-token')).toBe('keep');
    });

    it('preserves the per-origin cached choice across reboots within one epoch', async () => {
        const currentEpoch = epoch(1, 'factory-reset');
        const values = new Map<string, unknown>([
            [EPOCH_KEY, currentEpoch],
            [PREFERENCE_KEY, {
                __yomuManagedStateEnvelope: 1,
                epoch: '1:factory-reset',
                value: false,
            }],
        ]);
        installGmStore(values);
        vi.stubGlobal('browser', { runtime: { id: 'epoch-cache-proof' } });

        const firstRealm = await import('../../src/reader/app/preferred-site-language-impl');
        await firstRealm.installPreferredJapaneseSiteLanguageFromStoredSettings();
        await settleAsyncHandlers();
        const firstStorage = await import('../../src/reader/app/storage');
        expect(firstStorage.managedLocalStorage.getItem(PREFERENCE_CACHE_KEY)).toBe('false');
        expect(JSON.parse(localStorage.getItem(EPOCH_KEY) ?? 'null')).toEqual(currentEpoch);

        values.delete(PREFERENCE_KEY);
        installFreshManagedStateEpochSessionForTests();
        vi.resetModules();
        const rebootedRealm = await import('../../src/reader/app/preferred-site-language-impl');
        disablePreference = () => rebootedRealm.applyPreferredJapaneseSiteLanguage(false);
        await rebootedRealm.installPreferredJapaneseSiteLanguageFromStoredSettings();
        await settleAsyncHandlers();

        const rebootedStorage = await import('../../src/reader/app/storage');
        expect(rebootedStorage.managedLocalStorage.getItem(PREFERENCE_CACHE_KEY)).toBe('false');
        expect(JSON.parse(localStorage.getItem(EPOCH_KEY) ?? 'null')).toEqual(currentEpoch);
    });
});

function epoch(generation: number, resetId: string): EpochRecord {
    return {
        version: 1,
        generation,
        resetId,
        committedAt: generation * 1_000,
    };
}

function installGmStore(values: Map<string, unknown>): void {
    vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => values.has(key) ? values.get(key) : fallback));
    vi.stubGlobal('GM_setValue', vi.fn((key: string, value: unknown) => { values.set(key, value); }));
    vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => { values.delete(key); }));
    vi.stubGlobal('GM_listValues', vi.fn(() => [...values.keys()]));
}
