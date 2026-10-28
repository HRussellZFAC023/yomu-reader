import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduler } from 'node:timers/promises';
import { installFreshManagedStateEpochSessionForTests } from '../../src/reader/app/managed-state-epoch';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { SETTINGS_INTENT_LEDGER_STORAGE_KEY } from '../../src/reader/settings/intent-ledger';
import { serializeSettingsPersistencePair } from '../../src/reader/settings/settings-persistence-transaction';

const EPOCH_KEY = 'yomu:state-epoch';
const PREFERENCE_KEY = 'yomu:prefer-japanese-site-language:v1';
const PREFERENCE_CACHE_KEY = 'yomu:prefer-japanese-site-language';
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
// An installed Reader keeps its per-origin records under its own owner prefix.
const OWNER_PREFERENCE_CACHE_KEY = `yomu:web-owner:v2:extension:${PREFERENCE_CACHE_KEY}`;

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
        const values = new Map<string, unknown>([
            [PREFERENCE_KEY, true],
            ...Object.entries(serializeSettingsPersistencePair({
                ...DEFAULT_SETTINGS, preferJapaneseSiteLanguage: true,
            }, { revision: 0, records: {} })),
        ]);
        installGmStore(values);
        vi.stubGlobal('browser', { runtime: { id: 'epoch-cache-proof' } });

        const oldRealm = await import('../../src/reader/app/preferred-site-language-impl');
        await oldRealm.installPreferredJapaneseSiteLanguageFromStoredSettings();
        await settleAsyncHandlers();
        const oldStorage = await import('../../src/reader/app/storage');
        expect(oldStorage.managedLocalStorage.getItem(PREFERENCE_CACHE_KEY)).toBe('true');
        expect(localStorage.getItem(OWNER_PREFERENCE_CACHE_KEY)).toBe('true');

        // Reset ran on a different origin: shared GM state advanced, but this
        // origin's pre-reset local cache and an unrelated host key remain.
        values.delete(PREFERENCE_KEY);
        values.delete(SETTINGS_KEY);
        values.delete(SETTINGS_INTENT_LEDGER_STORAGE_KEY);
        values.set(EPOCH_KEY, epoch(1, 'factory-reset'));
        localStorage.setItem('foreign-site-token', 'keep');

        expect(await rebootPreferenceCache()).toBeNull();
        // The reboot purged the physical pre-reset record, not merely its view.
        expect(localStorage.getItem(OWNER_PREFERENCE_CACHE_KEY)).toBeNull();
        // Shared reset state stays in installed storage; publishing it into
        // page storage would overwrite a standalone Reader's own counter.
        expect(localStorage.getItem(EPOCH_KEY)).toBeNull();
        expect(localStorage.getItem('foreign-site-token')).toBe('keep');
    });

    it('keeps an authoritative opt-out shared-only across reboots within one epoch', async () => {
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
        // v1.9.3 left an enabled record on this origin before the reset. It
        // is not provenance in the new epoch, so the opt-out stays shared-only.
        localStorage.setItem('yomu:web-storage-epoch:v1:local', '0:legacy');
        localStorage.setItem(PREFERENCE_CACHE_KEY, 'true');

        const firstRealm = await import('../../src/reader/app/preferred-site-language-impl');
        await firstRealm.installPreferredJapaneseSiteLanguageFromStoredSettings();
        await settleAsyncHandlers();
        const firstStorage = await import('../../src/reader/app/storage');
        expect(firstStorage.managedLocalStorage.getItem(PREFERENCE_CACHE_KEY)).toBeNull();
        expect(localStorage.getItem(OWNER_PREFERENCE_CACHE_KEY)).toBeNull();
        expect(localStorage.getItem(EPOCH_KEY)).toBeNull();

        values.delete(PREFERENCE_KEY);
        expect(await rebootPreferenceCache()).toBeNull();
        expect(localStorage.getItem(OWNER_PREFERENCE_CACHE_KEY)).toBeNull();
        expect(localStorage.getItem(EPOCH_KEY)).toBeNull();
    });
});

async function rebootPreferenceCache(): Promise<string | null> {
    installFreshManagedStateEpochSessionForTests();
    vi.resetModules();
    const preference = await import('../../src/reader/app/preferred-site-language-impl');
    disablePreference = () => preference.applyPreferredJapaneseSiteLanguage(false);
    await preference.installPreferredJapaneseSiteLanguageFromStoredSettings();
    await settleAsyncHandlers();
    const storage = await import('../../src/reader/app/storage');
    return storage.managedLocalStorage.getItem(PREFERENCE_CACHE_KEY);
}

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
