import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { ReaderSettings } from '../../src/reader/app/types';
import type { SettingsIntentLedger } from '../../src/reader/settings/intent-ledger';

const COMPILER_STORAGE_PREFIX = 'usc_https_github_com_HRussellZFAC023_yomu_reader_';
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const INTENT_KEY = 'yomu:settings-intent:v2';
const EPOCH_KEY = 'yomu:state-epoch';
const SLOT_PREFIX = 'yomu:state-slot:v1:';
const COMMIT_KEY = '__yomuSettingsPersistenceCommitV1';

interface EpochRecord {
    readonly version: 1;
    readonly generation: number;
    readonly resetId: string;
    readonly committedAt: number;
}

interface ExtensionStoreHarness {
    readonly values: Map<string, unknown>;
    readonly rawGet: Mock<[key: string | null], Promise<Record<string, unknown>>>;
    readonly rawSet: Mock<[updates: Record<string, unknown>], Promise<void>>;
    readonly deleteValue: Mock<[key: string], void>;
    readonly rawRemove: Mock<[key: string], Promise<void>>;
}

type RecoveryResult = Awaited<ReturnType<
    typeof import('../../src/reader/settings/extension-study-settings-recovery')['recoverExtensionStudySettingsAuthority']
>>;

const chosenSettings = {
    learningTargetChosen: true,
    onboardingSeen: true,
    theme: 'dark',
    subtitleFontSize: 47,
} as const satisfies Partial<ReaderSettings>;

const chosenIntent = {
    revision: 2,
    records: {
        theme: { seq: 1, value: 'dark' },
        subtitleFontSize: { seq: 2, value: 47 },
    },
} as const satisfies SettingsIntentLedger;

describe('packaged extension Study settings-authority recovery', () => {
    beforeEach(() => {
        vi.resetModules();
        localStorage.clear();
        sessionStorage.clear();
    });

    afterEach(() => {
        delete document.documentElement.dataset.yomuUserscriptStorageBridge;
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('does nothing on a normal web page', async () => {
        const harness = installExtensionStore({
            [SETTINGS_KEY]: chosenSettings,
            [INTENT_KEY]: chosenIntent,
        }, { protocol: 'https:', installAdapter: true });
        const before = entries(harness.values);
        const { recoverExtensionStudySettingsAuthority } = await import(
            '../../src/reader/settings/extension-study-settings-recovery'
        );

        await expect(recoverExtensionStudySettingsAuthority()).resolves.toBe('not-packaged-study');
        expect(entries(harness.values)).toEqual(before);
        expect(harness.deleteValue).not.toHaveBeenCalled();
    });

    it('blocks packaged Study when its compiler adapter flag is absent without reading or writing raw storage', async () => {
        const harness = installExtensionStore({
            [SETTINGS_KEY]: chosenSettings,
            [INTENT_KEY]: chosenIntent,
        }, { protocol: 'moz-extension:', installAdapter: false });
        const before = entries(harness.values);
        const {
            ExtensionStudySettingsRecoveryFailure,
            recoverExtensionStudySettingsAuthority,
        } = await import('../../src/reader/settings/extension-study-settings-recovery');
        const { gmStorageGet, gmStorageSet } = await import('../../src/reader/app/storage');

        await expect(recoverExtensionStudySettingsAuthority()).rejects.toBeInstanceOf(
            ExtensionStudySettingsRecoveryFailure,
        );
        await expect(gmStorageGet(SETTINGS_KEY, null)).resolves.toBeNull();
        await expect(gmStorageSet(SETTINGS_KEY, { theme: 'light' }))
            .rejects.toThrow('Packaged Study storage adapter is unavailable');
        expect(entries(harness.values)).toEqual(before);
        expect(harness.rawGet).not.toHaveBeenCalled();
        expect(harness.rawSet).not.toHaveBeenCalled();
        expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
    });

    it('does not let an advertised bridge bypass a missing packaged adapter', async () => {
        const harness = installExtensionStore({
            [SETTINGS_KEY]: chosenSettings,
        }, { protocol: 'moz-extension:', installAdapter: false });
        document.documentElement.dataset.yomuUserscriptStorageBridge = 'true';
        const { gmStorageGet } = await import('../../src/reader/app/storage');

        await expect(gmStorageGet(SETTINGS_KEY, null)).resolves.toBeNull();

        expect(harness.rawGet).not.toHaveBeenCalled();
        expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
    });

    it('uses complete Chrome storage capabilities when the Browser global is partial', async () => {
        const get = vi.fn(async (key: string | null) => key === SETTINGS_KEY
            ? { [SETTINGS_KEY]: chosenSettings }
            : {});
        const changedEvent = { addListener: vi.fn(), removeListener: vi.fn() };
        vi.stubGlobal('browser', { runtime: { id: 'partial-browser-api' } });
        vi.stubGlobal('chrome', {
            runtime: { id: 'complete-chrome-api' },
            storage: {
                local: { get, set: vi.fn(), remove: vi.fn() },
                onChanged: changedEvent,
            },
        });
        const { extensionStorageChangedEvent, rawExtensionStorageGetValue } = await import(
            '../../src/reader/app/gm-storage-adapters'
        );

        const rawGet = rawExtensionStorageGetValue();

        await expect(rawGet?.(SETTINGS_KEY, null)).resolves.toEqual(chosenSettings);
        expect(get).toHaveBeenCalledWith(SETTINGS_KEY);
        expect(extensionStorageChangedEvent()).toBe(changedEvent);
    });

    it('keeps an existing chosen compiler-prefixed authority unchanged when no raw record exists', async () => {
        const harness = installExtensionStore({
            [prefixed(SETTINGS_KEY)]: chosenSettings,
            [prefixed(INTENT_KEY)]: chosenIntent,
        });
        const before = entries(harness.values);
        const { recoverExtensionStudySettingsAuthority } = await import(
            '../../src/reader/settings/extension-study-settings-recovery'
        );

        await expect(recoverExtensionStudySettingsAuthority()).resolves.toBe('no-legacy-settings');
        expect(entries(harness.values)).toEqual(before);
        expect(harness.values.has(SETTINGS_KEY)).toBe(false);
        expect(harness.values.has(INTENT_KEY)).toBe(false);
        expect(harness.deleteValue).not.toHaveBeenCalled();
    });

    it('rejects with only a secret-free chosen-data signal when a later raw read fails', async () => {
        const rawSecret = 'raw-api-secret-must-not-escape';
        const rawSettings = {
            ...chosenSettings,
            apiKey: rawSecret,
        } as const satisfies Partial<ReaderSettings>;
        const harness = installExtensionStore({
            [SETTINGS_KEY]: rawSettings,
            [INTENT_KEY]: chosenIntent,
        });
        const before = entries(harness.values);
        harness.rawGet.mockImplementation(async key => {
            if (key === INTENT_KEY) throw new Error(`adapter failure with ${rawSecret}`);
            if (key === null) return Object.fromEntries(harness.values);
            return harness.values.has(key) ? { [key]: harness.values.get(key) } : {};
        });

        await expectSecretFreeChosenRecoveryFailure(rawSecret);
        expect(entries(harness.values)).toEqual(before);
        expect(harness.deleteValue).not.toHaveBeenCalled();
        expect(harness.rawRemove).not.toHaveBeenCalled();
    });

    it('fails closed when stable chosen raw settings have a mismatched intent commit', async () => {
        const rawSecret = 'stable-torn-raw-secret-must-not-escape';
        const rawSettings = {
            ...chosenSettings,
            apiKey: rawSecret,
            [COMMIT_KEY]: 'settings-commit',
        } as const satisfies Partial<ReaderSettings> & Record<typeof COMMIT_KEY, string>;
        const rawIntent = {
            ...chosenIntent,
            [COMMIT_KEY]: 'intent-commit',
        };
        const harness = installExtensionStore({
            [SETTINGS_KEY]: rawSettings,
            [INTENT_KEY]: rawIntent,
        });
        const before = entries(harness.values);

        await expectSecretFreeChosenRecoveryFailure(rawSecret);
        expect(entries(harness.values)).toEqual(before);
        expectNoAuthorityDeletes(harness);
    });

    it('promotes a raw-only chosen settings and intent pair into the compiler namespace without deleting recovery bytes', async () => {
        const rawSettings = structuredClone(chosenSettings);
        const rawIntent = structuredClone(chosenIntent);
        const harness = installExtensionStore({
            [SETTINGS_KEY]: rawSettings,
            [INTENT_KEY]: rawIntent,
        });
        await expectRecoveryView('legacy-promoted', {
            settings: rawSettings,
            intentLedger: rawIntent,
        });
        expect(harness.values.get(SETTINGS_KEY)).toEqual(rawSettings);
        expect(harness.values.get(INTENT_KEY)).toEqual(rawIntent);
        expect(harness.values.has(prefixed(SETTINGS_KEY))).toBe(true);
        expect(harness.values.has(prefixed(INTENT_KEY))).toBe(true);
        expectNoAuthorityDeletes(harness);
    });

    it('merges a chosen raw record without clobbering newer or tied canonical intent', async () => {
        const canonicalSettings = {
            learningTargetChosen: false,
            onboardingSeen: false,
            theme: 'light',
        } as const satisfies Partial<ReaderSettings>;
        const canonicalIntent = {
            revision: 1,
            records: { theme: { seq: 1, value: 'light' } },
        } as const satisfies SettingsIntentLedger;
        const harness = installExtensionStore({
            [prefixed(SETTINGS_KEY)]: canonicalSettings,
            [prefixed(INTENT_KEY)]: canonicalIntent,
            [SETTINGS_KEY]: chosenSettings,
            [INTENT_KEY]: chosenIntent,
        });
        await expectRecoveryView('legacy-promoted', {
            settings: {
                ...chosenSettings,
                theme: 'light',
            },
            intentLedger: {
                revision: 2,
                records: {
                    theme: { seq: 1, value: 'light' },
                    subtitleFontSize: { seq: 2, value: 47 },
                },
            },
        });
        expect(harness.values.get(prefixed('yomu:extension-study-legacy-promotion:v1'))).toEqual({
            version: 1,
            rawEpoch: '0:legacy',
        });
        expectRawAuthorityRetained(harness);
    });

    it('preserves canonical theme seq9 against raw seq1 and promotes only the newer raw key once', async () => {
        const canonicalSettings = {
            learningTargetChosen: false,
            onboardingSeen: false,
            theme: 'light',
            subtitleFontSize: 31,
            accentColor: '#112233',
        } as const satisfies Partial<ReaderSettings>;
        const canonicalIntent = {
            revision: 9,
            records: {
                theme: { seq: 9, value: 'light' },
                subtitleFontSize: { seq: 3, value: 31 },
            },
        } as const satisfies SettingsIntentLedger;
        const rawSettings = {
            ...chosenSettings,
            subtitleFontSize: 52,
            subtitleBottomOffset: 26,
            accentColor: '#445566',
        } as const satisfies Partial<ReaderSettings>;
        const rawIntent = {
            revision: 10,
            records: {
                theme: { seq: 1, value: 'dark' },
                subtitleFontSize: { seq: 10, value: 52 },
            },
        } as const satisfies SettingsIntentLedger;
        const harness = installExtensionStore({
            [prefixed(SETTINGS_KEY)]: canonicalSettings,
            [prefixed(INTENT_KEY)]: canonicalIntent,
            [SETTINGS_KEY]: rawSettings,
            [INTENT_KEY]: rawIntent,
        });
        const mergedSettings = {
            learningTargetChosen: true,
            onboardingSeen: true,
            theme: 'light',
            subtitleFontSize: 52,
            subtitleBottomOffset: 26,
            accentColor: '#112233',
        } as const satisfies Partial<ReaderSettings>;
        const mergedIntent = {
            revision: 10,
            records: {
                theme: { seq: 9, value: 'light' },
                subtitleFontSize: { seq: 10, value: 52 },
            },
        } as const satisfies SettingsIntentLedger;

        await expectRecoveryView('legacy-promoted', {
            settings: mergedSettings,
            intentLedger: mergedIntent,
        });
        expect(harness.values.get(prefixed('yomu:extension-study-legacy-promotion:v1'))).toEqual({
            version: 1,
            rawEpoch: '0:legacy',
        });

        const laterCanonicalSettings = {
            ...mergedSettings,
            theme: 'auto',
        } as const satisfies Partial<ReaderSettings>;
        const laterCanonicalIntent = {
            revision: 11,
            records: {
                ...mergedIntent.records,
                theme: { seq: 11, value: 'auto' },
            },
        } as const satisfies SettingsIntentLedger;
        harness.values.set(prefixed(SETTINGS_KEY), laterCanonicalSettings);
        harness.values.set(prefixed(INTENT_KEY), laterCanonicalIntent);

        await expectRecoveryView('canonical-preserved', {
            settings: laterCanonicalSettings,
            intentLedger: laterCanonicalIntent,
        });
        expect(harness.values.get(SETTINGS_KEY)).toEqual(rawSettings);
        expect(harness.values.get(INTENT_KEY)).toEqual(rawIntent);
        expectNoAuthorityDeletes(harness);
    });

    it('preserves both sides of a divergent dual-chosen state and leaves the compiler authority canonical', async () => {
        const canonicalSettings = {
            learningTargetChosen: true,
            onboardingSeen: true,
            theme: 'light',
            subtitleFontSize: 31,
        } as const satisfies Partial<ReaderSettings>;
        const canonicalIntent = {
            revision: 4,
            records: {
                theme: { seq: 3, value: 'light' },
                subtitleFontSize: { seq: 4, value: 31 },
            },
        } as const satisfies SettingsIntentLedger;
        const harness = installExtensionStore({
            [prefixed(SETTINGS_KEY)]: canonicalSettings,
            [prefixed(INTENT_KEY)]: canonicalIntent,
            [SETTINGS_KEY]: chosenSettings,
            [INTENT_KEY]: chosenIntent,
        });
        const before = entries(harness.values);
        await expectRecoveryView('canonical-preserved', {
            settings: canonicalSettings,
            intentLedger: canonicalIntent,
        });
        expect(entries(harness.values)).toEqual(before);
        expectRawAuthorityRetained(harness);
    });

    it('reads and promotes generation-scoped managed slots in both namespaces', async () => {
        const stateEpoch = epoch(2, 'post-reset');
        const canonicalSettings = {
            learningTargetChosen: false,
            onboardingSeen: false,
            theme: 'light',
        } as const satisfies Partial<ReaderSettings>;
        const rawSettings = {
            ...chosenSettings,
            theme: 'dark',
            subtitleFontSize: 52,
        } as const satisfies Partial<ReaderSettings>;
        const rawIntent = {
            revision: 7,
            records: {
                theme: { seq: 6, value: 'dark' },
                subtitleFontSize: { seq: 7, value: 52 },
            },
        } as const satisfies SettingsIntentLedger;
        const rawSettingsSlot = slotKey(SETTINGS_KEY, stateEpoch);
        const rawIntentSlot = slotKey(INTENT_KEY, stateEpoch);
        const canonicalSettingsSlot = prefixed(rawSettingsSlot);
        const canonicalIntentSlot = prefixed(rawIntentSlot);
        const harness = installExtensionStore({
            [EPOCH_KEY]: stateEpoch,
            [rawSettingsSlot]: envelope(rawSettings, stateEpoch),
            [rawIntentSlot]: envelope(rawIntent, stateEpoch),
            [prefixed(EPOCH_KEY)]: stateEpoch,
            [canonicalSettingsSlot]: envelope(canonicalSettings, stateEpoch),
            [canonicalIntentSlot]: envelope({ revision: 0, records: {} }, stateEpoch),
        });
        const rawBefore = new Map([
            [EPOCH_KEY, harness.values.get(EPOCH_KEY)],
            [rawSettingsSlot, harness.values.get(rawSettingsSlot)],
            [rawIntentSlot, harness.values.get(rawIntentSlot)],
        ]);
        await expectRecoveryView('legacy-promoted', {
            settings: rawSettings,
            intentLedger: rawIntent,
        });
        expect(new Map([
            [EPOCH_KEY, harness.values.get(EPOCH_KEY)],
            [rawSettingsSlot, harness.values.get(rawSettingsSlot)],
            [rawIntentSlot, harness.values.get(rawIntentSlot)],
        ])).toEqual(rawBefore);
        expectCanonicalLegacySettingsAbsent(harness);
        expect(harness.values.has(canonicalSettingsSlot)).toBe(true);
        expect(harness.values.has(canonicalIntentSlot)).toBe(true);
        expectNoAuthorityDeletes(harness);
    });

    it('does not resurrect raw chosen settings after the canonical namespace was factory-reset', async () => {
        const retiredRawEpoch = epoch(1, 'retired-raw');
        const currentCanonicalEpoch = epoch(2, 'factory-reset');
        const rawSettingsSlot = slotKey(SETTINGS_KEY, retiredRawEpoch);
        const rawIntentSlot = slotKey(INTENT_KEY, retiredRawEpoch);
        const harness = installExtensionStore({
            [EPOCH_KEY]: retiredRawEpoch,
            [rawSettingsSlot]: envelope(chosenSettings, retiredRawEpoch),
            [rawIntentSlot]: envelope(chosenIntent, retiredRawEpoch),
            [prefixed(EPOCH_KEY)]: currentCanonicalEpoch,
        });
        const before = entries(harness.values);
        await expectRecoveryView('canonical-preserved', {
            settings: null,
            intentLedger: { revision: 0, records: {} },
        });
        expect(entries(harness.values)).toEqual(before);
        expect(harness.values.has(prefixed(slotKey(SETTINGS_KEY, currentCanonicalEpoch)))).toBe(false);
        expect(harness.values.has(prefixed(slotKey(INTENT_KEY, currentCanonicalEpoch)))).toBe(false);
        expectNoAuthorityDeletes(harness);
    });

    it('re-reads canonical settings only after the persistence lease so a concurrent save wins', async () => {
        const canonicalSettings = {
            learningTargetChosen: true,
            onboardingSeen: true,
            theme: 'light',
            subtitleFontSize: 33,
        } as const satisfies Partial<ReaderSettings>;
        const canonicalIntent = {
            revision: 9,
            records: {
                theme: { seq: 8, value: 'light' },
                subtitleFontSize: { seq: 9, value: 33 },
            },
        } as const satisfies SettingsIntentLedger;
        const harness = installExtensionStore({
            [SETTINGS_KEY]: chosenSettings,
            [INTENT_KEY]: chosenIntent,
        });
        const { recoverExtensionStudySettingsAuthority } = await import(
            '../../src/reader/settings/extension-study-settings-recovery'
        );
        const { withGmStorageLease } = await import('../../src/reader/app/storage');
        const {
            persistSettingsStorageTransaction,
            readSettingsPersistenceView,
            SETTINGS_PERSISTENCE_STORAGE_LEASE,
        } = await import('../../src/reader/settings/settings-persistence-transaction');
        const saveOwnsLease = deferred<void>();
        const releaseSave = deferred<void>();
        const save = withGmStorageLease(SETTINGS_PERSISTENCE_STORAGE_LEASE, async () => {
            saveOwnsLease.resolve();
            await releaseSave.promise;
            await persistSettingsStorageTransaction(canonicalIntent, canonicalSettings);
        });
        await saveOwnsLease.promise;

        const recovery = recoverExtensionStudySettingsAuthority();
        const recoveryWaitedBehindSave = await waitUntil(() => (
            [...harness.values.keys()].filter(key => (
                key.startsWith(prefixed(`yomu:lease:${SETTINGS_PERSISTENCE_STORAGE_LEASE}:`))
            )).length === 2
        ));
        releaseSave.resolve();
        await save;

        expect(recoveryWaitedBehindSave).toBe(true);
        await expect(recovery).resolves.toBe('canonical-preserved');
        await expect(readSettingsPersistenceView()).resolves.toEqual({
            settings: canonicalSettings,
            intentLedger: canonicalIntent,
        });
        expectRawAuthorityRetained(harness);
    });

    it('clears stranded raw settings and credential bytes only during explicit factory reset', async () => {
        const privateCredentialKey = 'yomu:private:cloud-settings-sync-pending:v1';
        const canonicalSettings = {
            learningTargetChosen: true,
            onboardingSeen: true,
            theme: 'light',
            apiKey: 'canonical-secret',
        } as const satisfies Partial<ReaderSettings>;
        const rawSettings = {
            ...chosenSettings,
            apiKey: 'stranded-secret',
        } as const satisfies Partial<ReaderSettings>;
        const harness = installExtensionStore({
            [prefixed(SETTINGS_KEY)]: canonicalSettings,
            [prefixed(INTENT_KEY)]: chosenIntent,
            [prefixed(privateCredentialKey)]: { credential: 'canonical-private-secret' },
            [SETTINGS_KEY]: rawSettings,
            [INTENT_KEY]: chosenIntent,
            [privateCredentialKey]: { credential: 'stranded-private-secret' },
            'unrelated-extension-key': 'keep-me',
        });
        const { recoverExtensionStudySettingsAuthority } = await import(
            '../../src/reader/settings/extension-study-settings-recovery'
        );
        const { clearManagedStoredValues } = await import('../../src/reader/app/storage');
        const { clearLegacyExtensionManagedStorage } = await import(
            '../../src/reader/app/extension-legacy-storage'
        );

        await expect(recoverExtensionStudySettingsAuthority()).resolves.toBe('canonical-preserved');
        expect(harness.values.get(prefixed(SETTINGS_KEY))).toEqual(canonicalSettings);
        expect(harness.values.get(prefixed(privateCredentialKey))).toEqual({
            credential: 'canonical-private-secret',
        });
        expect(harness.values.get(SETTINGS_KEY)).toEqual(rawSettings);
        expect(harness.values.get(privateCredentialKey)).toEqual({
            credential: 'stranded-private-secret',
        });
        expectNoAuthorityDeletes(harness);

        await expect(clearLegacyExtensionManagedStorage()).resolves.toBe(3);

        expect(harness.values.has(SETTINGS_KEY)).toBe(false);
        expect(harness.values.has(INTENT_KEY)).toBe(false);
        expect(harness.values.has(privateCredentialKey)).toBe(false);
        expect(harness.values.get(prefixed(SETTINGS_KEY))).toEqual(canonicalSettings);
        expect(harness.values.get(prefixed(INTENT_KEY))).toEqual(chosenIntent);
        expect(harness.values.get(prefixed(privateCredentialKey))).toEqual({
            credential: 'canonical-private-secret',
        });
        expect(harness.values.get('unrelated-extension-key')).toBe('keep-me');
        expect(harness.rawRemove.mock.calls.map(([key]) => key).sort()).toEqual([
            SETTINGS_KEY,
            INTENT_KEY,
            privateCredentialKey,
        ].sort());
        expect(harness.rawRemove.mock.calls.some(([key]) => key.startsWith(COMPILER_STORAGE_PREFIX)))
            .toBe(false);

        await expect(clearManagedStoredValues()).resolves.toBeGreaterThanOrEqual(3);

        expectCanonicalLegacySettingsAbsent(harness);
        expect(harness.values.has(prefixed(privateCredentialKey))).toBe(false);
        expect(harness.values.get('unrelated-extension-key')).toBe('keep-me');
        expect(harness.rawRemove.mock.calls.some(([key]) => key.startsWith(COMPILER_STORAGE_PREFIX)))
            .toBe(false);
    });
});

function installExtensionStore(
    initial: Record<string, unknown>,
    options: { protocol?: string; installAdapter?: boolean } = {},
): ExtensionStoreHarness {
    const { protocol = 'moz-extension:', installAdapter = true } = options;
    const values = new Map(Object.entries(initial));
    const get = vi.fn(async (key: string | null) => {
        if (key === null) return Object.fromEntries(values);
        return values.has(key) ? { [key]: values.get(key) } : {};
    });
    const set = vi.fn(async (updates: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(updates)) values.set(key, value);
    });
    const remove = vi.fn(async (key: string) => {
        values.delete(key);
    });
    const compilerDeleteValue = vi.fn((key: string) => {
        values.delete(prefixed(key));
    });
    vi.stubGlobal('browser', {
        runtime: { id: 'yomu@yomureader.com' },
        storage: { local: { get, set, remove, getKeys: async () => [...values.keys()] } },
    });
    vi.stubGlobal('location', extensionStudyLocation(protocol));
    if (installAdapter) installStudyStorageAdapterFacade(values, compilerDeleteValue);
    return { values, rawGet: get, rawSet: set, deleteValue: compilerDeleteValue, rawRemove: remove };
}

function extensionStudyLocation(protocol: string): Record<string, string> {
    const base = {
        protocol,
        pathname: '/newtab/index.html',
        href: `${protocol}//yomu-test/newtab/index.html`,
    };
    if (protocol !== 'https:') return { ...base, origin: 'null', hostname: 'yomu-test' };
    return { ...base, origin: 'https://example.test', hostname: 'example.test' };
}

function installStudyStorageAdapterFacade(
    values: Map<string, unknown>,
    deleteValue: (key: string) => void,
): void {
    vi.stubGlobal('__YOMU_EXTENSION_STORAGE_PREFIX__', COMPILER_STORAGE_PREFIX);
    vi.stubGlobal('__YOMU_EXTENSION_STUDY_STORAGE_RUNTIME__', true);
    vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => {
        const physicalKey = prefixed(key);
        return values.has(physicalKey) ? values.get(physicalKey) : fallback;
    }));
    vi.stubGlobal('GM_setValue', vi.fn((key: string, value: unknown) => {
        values.set(prefixed(key), value);
    }));
    vi.stubGlobal('GM_deleteValue', deleteValue);
    vi.stubGlobal('GM_listValues', vi.fn(() => [...values.keys()]
        .filter(key => key.startsWith(COMPILER_STORAGE_PREFIX))
        .map(key => key.slice(COMPILER_STORAGE_PREFIX.length))));
}

function prefixed(key: string): string {
    return `${COMPILER_STORAGE_PREFIX}${key}`;
}

function epoch(generation: number, resetId: string): EpochRecord {
    return { version: 1, generation, resetId, committedAt: generation * 1_000 };
}

function slotKey(key: string, stateEpoch: EpochRecord): string {
    return `${SLOT_PREFIX}${encodeURIComponent(`${stateEpoch.generation}:${stateEpoch.resetId}`)}:${encodeURIComponent(key)}`;
}

function envelope(value: unknown, stateEpoch: EpochRecord): unknown {
    return {
        __yomuManagedStateEnvelope: 1,
        epoch: `${stateEpoch.generation}:${stateEpoch.resetId}`,
        value,
    };
}

function entries(values: Map<string, unknown>): Array<[string, unknown]> {
    return structuredClone([...values.entries()]);
}

function expectNoAuthorityDeletes(harness: ExtensionStoreHarness): void {
    const deletedKeys = harness.deleteValue.mock.calls.map(([key]) => key);
    expect(deletedKeys.every(key => key.startsWith('yomu:lease:'))).toBe(true);
    expect(harness.rawRemove).not.toHaveBeenCalled();
}

function expectRawAuthorityRetained(harness: ExtensionStoreHarness): void {
    expect(harness.values.get(SETTINGS_KEY)).toEqual(chosenSettings);
    expect(harness.values.get(INTENT_KEY)).toEqual(chosenIntent);
    expectNoAuthorityDeletes(harness);
}

function expectCanonicalLegacySettingsAbsent(harness: ExtensionStoreHarness): void {
    expect(harness.values.has(prefixed(SETTINGS_KEY))).toBe(false);
    expect(harness.values.has(prefixed(INTENT_KEY))).toBe(false);
}

async function expectRecoveryView(
    result: RecoveryResult,
    view: { settings: Partial<ReaderSettings> | null; intentLedger: SettingsIntentLedger },
): Promise<void> {
    const { recoverExtensionStudySettingsAuthority } = await import(
        '../../src/reader/settings/extension-study-settings-recovery'
    );
    const { readSettingsPersistenceView } = await import(
        '../../src/reader/settings/settings-persistence-transaction'
    );
    await expect(recoverExtensionStudySettingsAuthority()).resolves.toBe(result);
    await expect(readSettingsPersistenceView()).resolves.toEqual(view);
}

async function expectSecretFreeChosenRecoveryFailure(secret: string): Promise<void> {
    const {
        ExtensionStudySettingsRecoveryFailure,
        recoverExtensionStudySettingsAuthority,
    } = await import('../../src/reader/settings/extension-study-settings-recovery');
    let failure: unknown;
    try {
        await recoverExtensionStudySettingsAuthority();
    } catch (error) {
        failure = error;
    }
    expect(failure).toBeInstanceOf(ExtensionStudySettingsRecoveryFailure);
    expect(failure).toMatchObject({ rawChosenSettingsDetected: true });
    expect((failure as { cause?: unknown }).cause).toBeUndefined();
    const visibleFailure = Object.fromEntries(
        Object.getOwnPropertyNames(failure).map(key => [
            key,
            (failure as Record<string, unknown>)[key],
        ]),
    );
    expect(JSON.stringify(visibleFailure)).not.toContain(secret);
}

function deferred<T>(): {
    readonly promise: Promise<T>;
    readonly resolve: (value: T | PromiseLike<T>) => void;
} {
    let resolve!: (value: T | PromiseLike<T>) => void;
    const promise = new Promise<T>(settle => {
        resolve = settle;
    });
    return { promise, resolve };
}

async function waitUntil(predicate: () => boolean, timeoutMs = 1_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    return predicate();
}
