import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_SETTINGS,
    EXPLICIT_USER_SETTINGS_STORAGE_KEY,
    PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY,
    SETTINGS_STORAGE_KEY,
    changedSettingsKeys,
    loadSettings,
    NO_EXPLICIT_USER_CHOICE,
    normalizeReaderSettings,
    saveSettings,
    subscribeToSettingsStorageChanges,
} from '../../src/reader/settings/index';
import { SETTINGS_INTENT_LEDGER_STORAGE_KEY } from '../../src/reader/settings/intent-ledger';
import { readSettingsPersistenceViewStrict, serializeSettingsPersistencePair } from '../../src/reader/settings/settings-persistence-transaction';
import { gmStorageGet } from '../../src/reader/app/storage';
import {
    installUserscriptGmStorageBridge,
    uninstallUserscriptGmStorageBridge,
} from '../../src/reader/userscript/storage-bridge';
import {
    installGmStorageFixture,
    installRejectedOptionsCommit,
    installSizeLimitedGmStorage,
    jsonClone,
    saveExplicitOptions,
} from './helpers/settings-persistence-fixture';

const hostedLocation = {
    href: 'https://yomureader.com/',
    hostname: 'yomureader.com',
    pathname: '/',
    origin: 'https://yomureader.com',
};
const hostedStudyLocation = {
    ...hostedLocation,
    href: 'https://yomureader.com/study/',
    pathname: '/study/',
};

afterEach(() => {
    uninstallUserscriptGmStorageBridge();
    localStorage.clear();
    sessionStorage.clear();
    delete document.documentElement.dataset.yomuHosted;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

// Simulate a message-based userscript manager (Greasemonkey 4 / Safari
// Userscripts / FireMonkey): every GM.getValue call structured-clones both the
// stored value AND the default it hands back, and the store is shared across
// every site the script runs on (that is what GM storage is). This is the
// exact environment behind the report — turning furigana off on one site,
// then finding the onboarding popup and furigana back on the next.
function installSharedMessageBasedGm(store: Map<string, unknown>): void {
    installGmStorageFixture(store, { clone: jsonClone });
}

function seedSettingsPair(store: Map<string, unknown>, settings: Partial<typeof DEFAULT_SETTINGS>) {
    const pair = serializeSettingsPersistencePair({ ...DEFAULT_SETTINGS, ...settings }, { revision: 0, records: {} });
    for (const [key, value] of Object.entries(pair)) store.set(key, value);
    return pair;
}

async function expectPreviousOptionsPersisted(
    store: Map<string, unknown>,
    previousPair: Record<string, unknown>,
): Promise<void> {
    expect(store.get(SETTINGS_STORAGE_KEY)).toEqual(previousPair[SETTINGS_STORAGE_KEY]);
    expect(store.get(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toEqual(previousPair[SETTINGS_INTENT_LEDGER_STORAGE_KEY]);
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toBeNull();
    await expect(loadSettings()).resolves.toMatchObject({
        enableLogging: false,
        manualScanEnabled: false,
    });
}

function installSettingsReadSequence(
    settingsAt: (read: number) => unknown,
    intentLedgerAt?: unknown | ((read: number) => unknown),
): { settings: () => number; intentLedger: () => number } {
    let settingsReads = 0;
    let intentLedgerReads = 0;
    const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
    const storedReads = new Map<string, () => unknown>([
        [SETTINGS_STORAGE_KEY, () => settingsAt(settingsReads++)],
    ]);
    if (intentLedgerAt !== undefined) storedReads.set(SETTINGS_INTENT_LEDGER_STORAGE_KEY, () => {
        const value = typeof intentLedgerAt === 'function'
            ? intentLedgerAt(intentLedgerReads)
            : intentLedgerAt;
        intentLedgerReads += 1;
        return value;
    });
    vi.stubGlobal('GM_getValue', vi.fn(async (key: string, fallback: unknown) => {
        const readStoredValue = storedReads.get(key);
        return clone(readStoredValue ? readStoredValue() : fallback);
    }));
    return {
        settings: () => settingsReads,
        intentLedger: () => intentLedgerReads,
    };
}

function installForgedPageSettings(): Map<string, unknown> {
    vi.stubGlobal('location', {
        href: 'https://evil.example/article',
        hostname: 'evil.example',
        pathname: '/article',
        origin: 'https://evil.example',
    });
    const store = new Map<string, unknown>();
    installSharedMessageBasedGm(store);
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
        subtitleFontSize: 48,
        enableLogging: true,
    }));
    return store;
}

function managedStatePhysicalSlot(key: string, epoch: { generation: number; resetId: string }): string {
    return `yomu:state-slot:v1:${encodeURIComponent(`${epoch.generation}:${epoch.resetId}`)}:${encodeURIComponent(key)}`;
}

function managedStateEnvelope(value: unknown, epoch: { generation: number; resetId: string }): unknown {
    return { __yomuManagedStateEnvelope: 1, epoch: `${epoch.generation}:${epoch.resetId}`, value };
}

function enterHostedStudyPageRealm(store: Map<string, unknown>): void {
    installSharedMessageBasedGm(store);
    vi.stubGlobal('GM_listValues', vi.fn(async () => [...store.keys()]));
    installUserscriptGmStorageBridge();
    vi.unstubAllGlobals();
    vi.stubGlobal('location', hostedStudyLocation);
    document.documentElement.dataset.yomuHosted = '';
}

function installPackagedExtensionStorage(store: Map<string, unknown>): void {
    const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
    vi.stubGlobal('chrome', {
        runtime: { id: 'reader-extension-id' },
        storage: { local: {
            get: vi.fn(async (key: string | null) => {
                if (key === null) return Object.fromEntries([...store].map(([name, value]) => [name, clone(value)]));
                return store.has(key) ? { [key]: clone(store.get(key)) } : {};
            }),
            set: vi.fn(async (items: Record<string, unknown>) => {
                for (const [key, value] of Object.entries(items)) store.set(key, clone(value));
            }),
            remove: vi.fn(async (key: string) => {
                store.delete(key);
            }),
        } },
    });
}

describe('settings persist across sites (message-based GM store)', () => {
    it.each([true, false])(
        'keeps installed locale intent %s intact while Study owns page-local behavior',
        async preference => {
            vi.stubGlobal('location', hostedStudyLocation);
            const epoch = { version: 1, generation: 1, resetId: 'study-bridge', committedAt: 1_000 } as const;
            const settingsSlot = managedStatePhysicalSlot(SETTINGS_STORAGE_KEY, epoch);
            const preferenceSlot = managedStatePhysicalSlot(
                PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY,
                epoch,
            );
            const pair = serializeSettingsPersistencePair({
                ...DEFAULT_SETTINGS,
                theme: 'light',
                preferJapaneseSiteLanguage: preference,
            }, { revision: 0, records: {} });
            const store = new Map<string, unknown>([
                ['yomu:state-epoch', epoch],
                ...Object.entries(pair).map(([key, value]): [string, unknown] => [
                    managedStatePhysicalSlot(key, epoch), managedStateEnvelope(value, epoch),
                ]),
                [preferenceSlot, managedStateEnvelope(preference, epoch)],
            ]);
            // The Study application is a separate page realm: it has no direct
            // GM capability, but reaches the installed runtime through the DOM bridge.
            enterHostedStudyPageRealm(store);

            const settings = await loadSettings();
            expect(settings.preferJapaneseSiteLanguage).toBe(preference);
            await saveSettings(
                { ...settings, theme: 'dark' },
                { explicitUserChoiceKeys: ['theme'] },
            );

            expect(store.get(preferenceSlot)).toEqual(managedStateEnvelope(preference, epoch));
            expect(store.get(settingsSlot)).toMatchObject({
                __yomuManagedStateEnvelope: 1,
                epoch: '1:study-bridge',
                value: {
                    theme: 'dark',
                    preferJapaneseSiteLanguage: preference,
                },
            });
            expect(store.has(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY)).toBe(false);
            expect(store.has(SETTINGS_STORAGE_KEY)).toBe(false);
        },
    );

    it('does not promote prior hosted locale intent through an installed Study bridge', async () => {
        vi.stubGlobal('location', hostedStudyLocation);
        localStorage.setItem(SETTINGS_INTENT_LEDGER_STORAGE_KEY, JSON.stringify({
            revision: 2,
            records: {
                preferJapaneseSiteLanguage: { seq: 1, value: true },
                subtitleFontSize: { seq: 2, value: 48 },
            },
        }));
        localStorage.setItem(EXPLICIT_USER_SETTINGS_STORAGE_KEY, JSON.stringify({
            preferJapaneseSiteLanguage: true,
            manualScanEnabled: true,
        }));
        const store = new Map<string, unknown>([
            ...Object.entries(serializeSettingsPersistencePair(
                { ...DEFAULT_SETTINGS, theme: 'light', preferJapaneseSiteLanguage: false },
                { revision: 0, records: {} },
            )),
            [PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY, false],
        ]);
        enterHostedStudyPageRealm(store);

        const settings = await loadSettings();
        expect(settings).toMatchObject({
            preferJapaneseSiteLanguage: false,
            subtitleFontSize: DEFAULT_SETTINGS.subtitleFontSize,
            manualScanEnabled: false,
        });
        await saveSettings({ ...settings, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] });

        expect(store.get(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY)).toBe(false);
        expect(store.get(SETTINGS_STORAGE_KEY)).toMatchObject({
            theme: 'dark',
            preferJapaneseSiteLanguage: false,
        });
        const ledger = store.get(SETTINGS_INTENT_LEDGER_STORAGE_KEY) as {
            records: Record<string, unknown>;
        };
        expect(ledger.records).not.toHaveProperty('preferJapaneseSiteLanguage');
        expect(ledger.records).not.toHaveProperty('subtitleFontSize');
        expect(store.get(EXPLICIT_USER_SETTINGS_STORAGE_KEY)).toBeUndefined();
    });

    it('does not recover or promote the dedicated scalar after a shared read failure', async () => {
        vi.stubGlobal('location', hostedLocation);
        localStorage.setItem(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY, 'true');
        const setValue = vi.fn();
        vi.stubGlobal('GM_getValue', vi.fn(async () => {
            throw new Error('shared store unavailable');
        }));
        vi.stubGlobal('GM_setValue', setValue);

        expect(await gmStorageGet(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY, undefined)).toBeUndefined();
        expect(setValue).not.toHaveBeenCalled();
    });

    it('keeps furigana-off and explicit review preferences when navigating to the next site', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);

        // Site A: enable automatic mining and turn furigana off.
        const onSiteA = await loadSettings();
        await saveSettings({ ...onSiteA, manualScanEnabled: true, showFurigana: false, furiganaMode: 'off' }, {
            explicitUserChoiceKeys: ['manualScanEnabled', 'showFurigana', 'furiganaMode'],
        });

        // Site B: fresh page load reads the shared GM store.
        const onSiteB = await loadSettings();
        expect(onSiteB.manualScanEnabled).toBe(true);
        expect(onSiteB.showFurigana).toBe(false);
        expect(onSiteB.furiganaMode).toBe('off');
    });

    it('keeps fresh defaults free of missing-value sentinels', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);

        const fresh = await loadSettings();
        // Reading an empty store must not enable an opt-in or persist its missing sentinel.
        expect(fresh.manualScanEnabled).toBe(false);
        expect(JSON.stringify(fresh)).not.toContain('__yomuStorageValueMissing');
        expect(await loadSettings()).toBeTruthy();
    });

    it('does not let a stale whole-settings save resurrect an explicit Japanese-sites opt-out', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);

        const staleSettings = await loadSettings();
        await saveSettings(
            { ...staleSettings, preferJapaneseSiteLanguage: false },
            {
                persistPreferredJapaneseSiteLanguage: true,
                explicitUserChoiceKeys: ['preferJapaneseSiteLanguage'],
            },
        );

        // A second context still holds the pre-opt-out settings object and
        // saves an unrelated field. Its stale true must never overwrite the
        // explicit user intent -- and now that the intent ledger records the
        // opt-out for the blob as well, the blob no longer disagrees with the
        // authoritative scalar while the reader is running.
        await saveSettings({ ...staleSettings, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] });

        expect(store.get(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY)).toBe(false);
        expect(store.get(SETTINGS_STORAGE_KEY)).toMatchObject({
            preferJapaneseSiteLanguage: false,
            theme: 'dark',
        });
        expect((await loadSettings()).preferJapaneseSiteLanguage).toBe(false);
    });

    it('rolls back an explicit site-language scalar when the paired explicit settings write fails', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        vi.stubGlobal('GM_setValue', vi.fn(async (key: string, value: unknown) => {
            if (key === SETTINGS_STORAGE_KEY) throw new Error('settings blob rejected');
            store.set(key, JSON.parse(JSON.stringify(value)));
        }));

        await expect(saveSettings({
            ...DEFAULT_SETTINGS,
            enableLogging: true,
            manualScanEnabled: true,
            preferJapaneseSiteLanguage: true,
        }, {
            persistPreferredJapaneseSiteLanguage: true,
            explicitUserChoiceKeys: [
                'enableLogging',
                'manualScanEnabled',
                'preferJapaneseSiteLanguage',
            ],
        })).rejects.toThrow(/GM storage write failed/);

        expect(store.has(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY)).toBe(false);
    });

    it('rolls back the intent ledger, settings blob, and local fallback when the settings write fails', async () => {
        const { previousSettings, previousPair, store } = installRejectedOptionsCommit(jsonClone);
        vi.stubGlobal('location', hostedLocation);

        await expect(saveExplicitOptions(previousSettings)).rejects.toThrow(/GM storage write failed/);

        await expectPreviousOptionsPersisted(store, previousPair);
    });

    it('rolls back a rejected ledger write before the canonical settings commit can run', async () => {
        const previousSettings = {
            ...DEFAULT_SETTINGS,
            enableLogging: false,
            manualScanEnabled: false,
        };
        const previousPair = serializeSettingsPersistencePair(previousSettings, { revision: 0, records: {} });
        const store = new Map<string, unknown>(Object.entries(previousPair));
        installSharedMessageBasedGm(store);
        const setValue = vi.fn(async (key: string, value: unknown) => {
            if (key === SETTINGS_INTENT_LEDGER_STORAGE_KEY
                && JSON.stringify(value) !== JSON.stringify(previousPair[key])) throw new Error('ledger rejected');
            store.set(key, JSON.parse(JSON.stringify(value)));
        });
        vi.stubGlobal('GM_setValue', setValue);

        await expect(saveSettings({
            ...previousSettings,
            enableLogging: true,
            manualScanEnabled: true,
        }, {
            explicitUserChoiceKeys: ['enableLogging', 'manualScanEnabled'],
        })).rejects.toThrow(/GM storage write failed/);

        const attemptedSettings = setValue.mock.calls
            .filter(([key]) => key === SETTINGS_STORAGE_KEY)
            .map(([, value]) => value as { enableLogging?: unknown });
        expect(attemptedSettings.length).toBeGreaterThan(0);
        expect(attemptedSettings.every(value => value.enableLogging === false)).toBe(true);
        await expectPreviousOptionsPersisted(store, previousPair);
    });

    it('keeps the shared recovery marker but restores absent local state when ledger rollback also fails', async () => {
        const { previousSettings, previousPair, store } = installRejectedOptionsCommit(jsonClone);
        vi.stubGlobal('location', hostedLocation);
        vi.stubGlobal('GM_setValue', vi.fn(async (key: string, value: unknown) => {
            if (key === SETTINGS_STORAGE_KEY
                && (value as { enableLogging?: unknown }).enableLogging === true) throw new Error('settings blob rejected');
            if (key === SETTINGS_INTENT_LEDGER_STORAGE_KEY
                && JSON.stringify(value) === JSON.stringify(previousPair[key])) throw new Error('ledger rollback rejected');
            store.set(key, jsonClone(value));
        }));

        await expect(saveExplicitOptions(previousSettings)).rejects.toThrow(/rollback operation/);

        expect(store.get(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toMatchObject({
            records: { enableLogging: { value: true } },
        });
        expect(store.get(SETTINGS_STORAGE_KEY)).toMatchObject({
            enableLogging: false,
            manualScanEnabled: false,
            __yomuSettingsPersistenceTransactionV1: { version: 1 },
        });
        expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
        await expect(loadSettings()).resolves.toMatchObject({
            enableLogging: false,
            manualScanEnabled: false,
        });
    });

    it('keeps async loads on the previous target until commit without creating a local copy', async () => {
        vi.stubGlobal('location', hostedLocation);
        const previousSettings = {
            ...DEFAULT_SETTINGS,
            enableLogging: false,
            manualScanEnabled: false,
        };
        const store = new Map<string, unknown>(Object.entries(
            serializeSettingsPersistencePair(previousSettings, { revision: 0, records: {} }),
        ));
        installSharedMessageBasedGm(store);
        let releaseCommit!: () => void;
        const commitGate = new Promise<void>(resolve => { releaseCommit = resolve; });
        let commitReached!: () => void;
        const reachedCommit = new Promise<void>(resolve => { commitReached = resolve; });
        vi.stubGlobal('GM_setValue', vi.fn(async (key: string, value: unknown) => {
            if (key === SETTINGS_STORAGE_KEY
                && (value as { enableLogging?: unknown }).enableLogging === true) {
                commitReached();
                await commitGate;
            }
            store.set(key, JSON.parse(JSON.stringify(value)));
        }));

        const saving = saveSettings({
            ...previousSettings,
            enableLogging: true,
            manualScanEnabled: true,
        }, {
            explicitUserChoiceKeys: ['enableLogging', 'manualScanEnabled'],
        });
        await Promise.race([
            reachedCommit,
            saving.then(() => { throw new Error('Save completed without reaching its publication gate'); }),
        ]);

        expect(store.get(SETTINGS_STORAGE_KEY)).toMatchObject({
            enableLogging: false,
            manualScanEnabled: false,
        });
        expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
        await expect(loadSettings()).resolves.toMatchObject({
            enableLogging: false,
            manualScanEnabled: false,
        });

        releaseCommit();
        await saving;
        await expect(loadSettings()).resolves.toMatchObject({
            enableLogging: true,
            manualScanEnabled: true,
        });
    });

    it('retries a committed view read that crosses the final settings write', async () => {
        const previousSettings = {
            ...DEFAULT_SETTINGS,
            enableLogging: false,
            manualScanEnabled: false,
        };
        const committedSettings = {
            ...previousSettings,
            enableLogging: true,
            manualScanEnabled: true,
        };
        const nextLedger = {
            revision: 2,
            records: {
                enableLogging: { seq: 1, value: true },
                manualScanEnabled: { seq: 2, value: true },
            },
        };
        const previousPair = serializeSettingsPersistencePair(previousSettings, { revision: 0, records: {} });
        const committedPair = serializeSettingsPersistencePair(committedSettings, nextLedger);
        const reads = installSettingsReadSequence(
            read => (read === 0 ? previousPair : committedPair)[SETTINGS_STORAGE_KEY],
            committedPair[SETTINGS_INTENT_LEDGER_STORAGE_KEY],
        );

        const view = await readSettingsPersistenceViewStrict();
        expect(view.settings).toEqual(committedSettings);
        expect(view.intentLedger.records).toMatchObject({
            enableLogging: { value: true },
            manualScanEnabled: { value: true },
        });
        expect(reads.settings()).toBe(4);
    });

    it('accepts a matching commit witness and hides its storage metadata', async () => {
        const commitId = 'committed-target';
        const committedSettings = {
            ...DEFAULT_SETTINGS,
            enableLogging: true,
            manualScanEnabled: true,
            __yomuSettingsPersistenceCommitV1: commitId,
        };
        const committedLedger = {
            revision: 2,
            __yomuSettingsPersistenceCommitV1: commitId,
            records: {
                enableLogging: { seq: 1, value: true },
                manualScanEnabled: { seq: 2, value: true },
            },
        };
        installSettingsReadSequence(() => committedSettings, committedLedger);

        const view = await readSettingsPersistenceViewStrict();
        expect(view.settings).toMatchObject({ enableLogging: true, manualScanEnabled: true });
        expect(view.settings).not.toHaveProperty('__yomuSettingsPersistenceCommitV1');
        expect(view.intentLedger.records).toMatchObject({
            enableLogging: { value: true },
            manualScanEnabled: { value: true },
        });
    });

    it('rejects a staged ledger observed during failed-transaction ABA rollback', async () => {
        const previousSettings = {
            ...DEFAULT_SETTINGS,
            enableLogging: false,
            manualScanEnabled: false,
        };
        const previousLedger = { revision: 1, records: {} };
        const previousPair = serializeSettingsPersistencePair(previousSettings, previousLedger);
        const rejectedLedger = {
            revision: 2,
            __yomuSettingsPersistenceCommitV1: 'rejected-transaction',
            records: {
                enableLogging: { seq: 1, value: true },
                manualScanEnabled: { seq: 2, value: true },
            },
        };
        const reads = installSettingsReadSequence(
            () => previousPair[SETTINGS_STORAGE_KEY],
            (read: number) => read < 2 ? rejectedLedger : previousPair[SETTINGS_INTENT_LEDGER_STORAGE_KEY],
        );

        const view = await readSettingsPersistenceViewStrict();
        expect(view.settings).toEqual(previousSettings);
        expect(view.intentLedger.records).toEqual({});
        expect(reads.settings()).toBe(4);
        expect(reads.intentLedger()).toBe(4);
        await expect(loadSettings()).resolves.toMatchObject({
            enableLogging: false,
            manualScanEnabled: false,
        });
    });

    it('does not promote page-local settings into learner intent on an untrusted origin', async () => {
        const store = installForgedPageSettings();

        await expect(loadSettings()).resolves.toMatchObject({
            enableLogging: false,
            manualScanEnabled: false,
        });
        expect(store.has(SETTINGS_STORAGE_KEY)).toBe(false);
        expect(store.has(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toBe(false);
    });

    it('does not restore a forged page-local target when the first legitimate save fails', async () => {
        const store = installForgedPageSettings();
        const previous = await loadSettings();
        vi.stubGlobal('GM_setValue', vi.fn(async (key: string, value: unknown) => {
            if (key === SETTINGS_STORAGE_KEY
                && (value as { enableLogging?: unknown }).enableLogging === true) {
                throw new Error('first target commit rejected');
            }
            store.set(key, JSON.parse(JSON.stringify(value)));
        }));

        await expect(saveSettings({
            ...previous,
            enableLogging: true,
            manualScanEnabled: true,
        }, {
            explicitUserChoiceKeys: ['enableLogging', 'manualScanEnabled'],
        })).rejects.toThrow('first target commit rejected');

        expect(store.has(SETTINGS_STORAGE_KEY)).toBe(false);
        expect(store.has(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toBe(false);
        expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
        await expect(loadSettings()).resolves.toMatchObject({
            enableLogging: false,
            manualScanEnabled: false,
        });
    });

    it('never serializes an untrusted page-local blob into the privileged transaction marker', async () => {
        const store = installForgedPageSettings();
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            enableLogging: true,
            pagePayload: 'x'.repeat(500_000),
        }));
        const { writes } = installSizeLimitedGmStorage(store, 200_000);

        const previous = await loadSettings();
        await expect(saveSettings({
            ...previous,
            enableLogging: true,
            manualScanEnabled: true,
        }, {
            explicitUserChoiceKeys: ['enableLogging', 'manualScanEnabled'],
        })).resolves.toBeUndefined();

        expect(writes.length).toBeGreaterThan(0);
        expect(JSON.stringify(writes)).not.toContain('pagePayload');
        await expect(loadSettings()).resolves.toMatchObject({
            enableLogging: true,
            manualScanEnabled: true,
        });
    });

    it('fails closed when a committed settings view never stabilizes', async () => {
        const previousSettings = {
            ...DEFAULT_SETTINGS,
            enableLogging: false,
            manualScanEnabled: false,
        };
        const nextSettings = {
            ...previousSettings,
            enableLogging: true,
            manualScanEnabled: true,
        };
        const previousPair = serializeSettingsPersistencePair(previousSettings, { revision: 0, records: {} });
        const nextPair = serializeSettingsPersistencePair(nextSettings, { revision: 0, records: {} });
        const reads = installSettingsReadSequence(
            read => (read % 2 === 0 ? previousPair : nextPair)[SETTINGS_STORAGE_KEY],
            nextPair[SETTINGS_INTENT_LEDGER_STORAGE_KEY],
        );

        await expect(readSettingsPersistenceViewStrict()).rejects.toThrow('stable committed snapshot');
        expect(reads.settings()).toBe(6);
    });

    // GitHub #36 (mirrormc), the half with the broad blast radius. Recovery from an
    // older storage key inferred "the learner never set this" from "the value equals
    // the default", so ANY field reset to its default could be replayed from a legacy
    // key and re-persisted -- a cleared API key, a toggle turned back off, a colour
    // put back, any cleared shortcut. Only 15 allowlisted keys were protected.
    it('does not let a legacy settings key resurrect a field the learner reset to its default', async () => {
        const store = new Map<string, unknown>();
        // A legacy install that had a dark theme.
        store.set('yomu-reader-settings', { theme: 'dark' });
        seedSettingsPair(store, { theme: 'dark' });
        installSharedMessageBasedGm(store);

        // The learner puts the theme BACK to its default and saves. The settings
        // dialog declares what the edit changed, which is the only trustworthy signal
        // -- a difference measured against storage could just mean another context
        // saved since.
        const settings = await loadSettings();
        await saveSettings({ ...settings, theme: DEFAULT_SETTINGS.theme }, {
            explicitUserChoiceKeys: ['theme'],
        });

        // Recovery spots gaps by comparing against the default -- it has to, because
        // Yomu stores the whole settings object -- so without the recorded choice the
        // legacy 'dark' is treated as filling a gap and comes back, re-persisted, on
        // every load. That is what the reporter saw seconds after saving and again
        // after a version update.
        expect((await loadSettings()).theme).toBe(DEFAULT_SETTINGS.theme);
        expect(await loadSettings().then(value => value.theme)).toBe(DEFAULT_SETTINGS.theme);
        expect(store.get(SETTINGS_STORAGE_KEY)).toMatchObject({ theme: DEFAULT_SETTINGS.theme });
    });

    // GitHub #36 residual: shortcuts.hoverLookup. The dialog declares the whole
    // `shortcuts` object when any hotkey changes, and a declared key is never a
    // gap, so a legacy store can no longer replay the hotkey the learner cleared.
    it('does not let a legacy settings key replay a cleared hover-lookup hotkey', async () => {
        const store = new Map<string, unknown>();
        store.set('yomu-reader-settings', {
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: 'Shift' },
        });
        seedSettingsPair(store, {
            ...DEFAULT_SETTINGS,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: 'Shift' },
        });
        installSharedMessageBasedGm(store);

        const settings = await loadSettings();
        await saveSettings({
            ...settings,
            shortcuts: { ...settings.shortcuts, hoverLookup: '' },
        }, { explicitUserChoiceKeys: ['shortcuts'] });

        expect((await loadSettings()).shortcuts.hoverLookup).toBe('');
        expect((await loadSettings()).shortcuts.hoverLookup).toBe('');
    });

    it('uses the current default for an absent field, ignoring old donors', async () => {
        const store = new Map<string, unknown>();
        store.set('yomu-reader-settings', { ankiTags: 'legacy-tag' });
        seedSettingsPair(store, { theme: 'dark' });
        delete (store.get(SETTINGS_STORAGE_KEY) as Record<string, unknown>).ankiTags;
        installSharedMessageBasedGm(store);

        expect((await loadSettings()).ankiTags).toBe(DEFAULT_SETTINGS.ankiTags);
        expect(store.get('yomu-reader-settings')).toEqual({ ankiTags: 'legacy-tag' });
    });

    it('does not let a stale whole-settings save overwrite an explicit annotations choice', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);

        const staleSettings = await loadSettings();
        await saveSettings(
            { ...staleSettings, annotationsPaused: false },
            {
                // Cast keeps this regression executable against the pre-fix
                // implementation, where the option does not exist yet.
                explicitUserChoiceKeys: ['annotationsPaused'],
            } as Parameters<typeof saveSettings>[1],
        );

        // The stale tab carries annotationsPaused along; it declares only the
        // field it actually changed.
        await saveSettings({ ...staleSettings, annotationsPaused: true, theme: 'dark' }, {
            explicitUserChoiceKeys: ['theme'],
        });

        expect((await loadSettings()).annotationsPaused).toBe(false);
    });

    it('does not let a stale tab overwrite an explicit native-translation mode or blur strength', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);

        const staleSettings = await loadSettings();
        await saveSettings({
            ...staleSettings,
            subtitleSecondaryVisible: true,
            subtitleSecondaryVisibleChosen: true,
            subtitleNativeBlurred: false,
            subtitleNativeBlurStrength: 18,
        }, {
            explicitUserChoiceKeys: [
                'subtitleSecondaryVisible',
                'subtitleSecondaryVisibleChosen',
                'subtitleNativeBlurred',
                'subtitleNativeBlurStrength',
            ],
        });

        await saveSettings({ ...staleSettings, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] });

        expect(await loadSettings()).toMatchObject({
            subtitleSecondaryVisible: true,
            subtitleSecondaryVisibleChosen: true,
            subtitleNativeBlurred: false,
            subtitleNativeBlurStrength: 18,
            theme: 'dark',
        });
    });

    it('keeps a YouTube opt-in value coupled to its explicit-choice flag', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);

        const staleSettings = await loadSettings();
        const optedIn = { ...staleSettings, youtubeImmersionEnabledChosen: true };
        // Only the flag is declared. The ledger couples it to the value it
        // qualifies from the key NAME, so no allowlist of pairs is needed.
        await saveSettings(optedIn, {
            explicitUserChoiceKeys: changedSettingsKeys(staleSettings, optedIn),
        });

        // Another page still holds an older raw value. The chosen flag without
        // its paired value would turn this stale OFF into the new authority.
        await saveSettings({
            ...staleSettings,
            youtubeImmersionEnabled: false,
            theme: 'dark',
        }, { explicitUserChoiceKeys: ['theme'] });

        expect(await loadSettings()).toMatchObject({
            youtubeImmersionEnabled: true,
            youtubeImmersionEnabledChosen: true,
        });
    });

    // blurvy, v1.8.77: "the subtitle size slider reverts". subtitleFontSize was
    // declared by the style popover and WRITTEN to the pin store, but the pin was
    // only ever read back for 17 allowlisted keys, so the next stale
    // whole-settings save replaced the slider value in storage and the popover
    // showed the old size again after a reload. The ledger has no allowlist:
    // whatever a surface declares is what comes back.
    it('keeps a declared non-allowlisted choice through a stale whole-settings save', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);

        const staleSettings = await loadSettings();
        await saveSettings({ ...staleSettings, subtitleFontSize: 48 }, {
            explicitUserChoiceKeys: ['subtitleFontSize'],
        });

        await saveSettings({ ...staleSettings, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] });

        expect(await loadSettings()).toMatchObject({ subtitleFontSize: 48, theme: 'dark' });
        expect(store.get(SETTINGS_STORAGE_KEY)).toMatchObject({ subtitleFontSize: 48 });
    });

    // The reason the fix is a ledger and not a wider allowlist: protecting every
    // key freezes all 265 fields against the very save carrying the next edit.
    it('leaves a key nobody declared free to change', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);

        const staleSettings = await loadSettings();
        await saveSettings({ ...staleSettings, subtitleFontSize: 48 }, {
            explicitUserChoiceKeys: ['subtitleFontSize'],
        });

        // Same neighbourhood, never declared: a later save still owns it.
        await saveSettings({ ...staleSettings, subtitleFontSize: 48, subtitleFontWeight: 700 }, {
            explicitUserChoiceKeys: NO_EXPLICIT_USER_CHOICE,
        });

        expect(await loadSettings()).toMatchObject({ subtitleFontSize: 48, subtitleFontWeight: 700 });
    });

    it('lets a later declared write supersede an earlier one, but not a machine write', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);

        const staleSettings = await loadSettings();
        await saveSettings({ ...staleSettings, subtitleFontSize: 48 }, {
            explicitUserChoiceKeys: ['subtitleFontSize'],
        });
        await saveSettings({ ...staleSettings, subtitleFontSize: 24 }, {
            explicitUserChoiceKeys: ['subtitleFontSize'],
        });
        expect((await loadSettings()).subtitleFontSize).toBe(24);

        await saveSettings({ ...staleSettings, subtitleFontSize: 64 }, {
            explicitUserChoiceKeys: NO_EXPLICIT_USER_CHOICE,
        });
        expect((await loadSettings()).subtitleFontSize).toBe(24);
    });

    it('withdraws intent when a Reset control puts the defaults back', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);

        const staleSettings = await loadSettings();
        await saveSettings({ ...staleSettings, subtitleFontSize: 48 }, {
            explicitUserChoiceKeys: ['subtitleFontSize'],
        });

        // Reset writes the default and WITHDRAWS the choice: declaring the
        // default instead would pin it, which is how the style panel's Reset
        // pinned native subtitles ON as a user choice.
        await saveSettings({ ...staleSettings, subtitleFontSize: DEFAULT_SETTINGS.subtitleFontSize }, {
            explicitUserChoiceKeys: NO_EXPLICIT_USER_CHOICE,
            clearExplicitUserChoiceKeys: ['subtitleFontSize'],
        });
        expect((await loadSettings()).subtitleFontSize).toBe(DEFAULT_SETTINGS.subtitleFontSize);

        // Nothing is pinned any more, so an ordinary save owns the field again.
        await saveSettings({ ...staleSettings, subtitleFontSize: 32 }, {
            explicitUserChoiceKeys: NO_EXPLICIT_USER_CHOICE,
        });
        expect((await loadSettings()).subtitleFontSize).toBe(32);
    });

    it('ignores retired pins while honoring current declarations', async () => {
        const store = new Map<string, unknown>();
        // What 1.8.22 through 1.8.78 wrote: a flat key -> value map, no ordering.
        store.set('yomu:explicit-user-settings:v1', { annotationsPaused: false });
        seedSettingsPair(store, { annotationsPaused: true });
        installSharedMessageBasedGm(store);

        expect((await loadSettings()).annotationsPaused).toBe(true);

        // A current declaration records intent independently of retired pins.
        await saveSettings({ ...DEFAULT_SETTINGS, annotationsPaused: true }, {
            explicitUserChoiceKeys: ['annotationsPaused'],
        });
        expect((await loadSettings()).annotationsPaused).toBe(true);
    });

    // A container is reconciled by its editor, never substituted: recording the
    // whole array would drop a dictionary a later import legitimately added.
    it('records a declared dictionary order without freezing later imports out', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);

        const settings = await loadSettings();
        await saveSettings({
            ...settings,
            dictionaryPreferences: [
                { name: 'BCCWJ', alias: 'BCCWJ', enabled: true, priority: 0, type: 'frequency' },
                { name: 'JMdict', alias: 'JMdict', enabled: true, priority: 1, type: 'terms' },
            ],
        }, { explicitUserChoiceKeys: ['dictionaryPreferences'] });

        await saveSettings({
            ...settings,
            dictionaryPreferences: [
                { name: 'BCCWJ', alias: 'BCCWJ', enabled: true, priority: 0, type: 'frequency' },
                { name: 'JMdict', alias: 'JMdict', enabled: true, priority: 1, type: 'terms' },
                { name: 'KANJIDIC', alias: 'KANJIDIC', enabled: true, priority: 2, type: 'kanji' },
            ],
        }, { explicitUserChoiceKeys: NO_EXPLICIT_USER_CHOICE });

        expect((await loadSettings()).dictionaryPreferences.map(item => item.name))
            .toEqual(['BCCWJ', 'JMdict', 'KANJIDIC']);
    });

    it('normalizes malformed Japanese-sites preferences without truthy coercion', async () => {
        const store = new Map<string, unknown>([
            [PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY, 'true'],
        ]);
        seedSettingsPair(store, { preferJapaneseSiteLanguage: 'true' as unknown as boolean });
        installSharedMessageBasedGm(store);

        const normalized = normalizeReaderSettings({
            preferJapaneseSiteLanguage: 'false' as unknown as boolean,
        });
        expect(normalized.preferJapaneseSiteLanguage).toBe(false);
        expect(typeof normalized.preferJapaneseSiteLanguage).toBe('boolean');
        expect(normalizeReaderSettings({}).preferJapaneseSiteLanguage).toBe(
            DEFAULT_SETTINGS.preferJapaneseSiteLanguage,
        );

        const loaded = await loadSettings();
        expect(loaded.preferJapaneseSiteLanguage).toBe(false);
        expect(typeof loaded.preferJapaneseSiteLanguage).toBe('boolean');
        expect(store.get(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY)).toBe('true');
    });

    it('reloads authoritative settings when either the blob or scalar changes', async () => {
        const store = new Map<string, unknown>([
            [PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY, false],
        ]);
        seedSettingsPair(store, { preferJapaneseSiteLanguage: true, theme: 'light' });
        installSharedMessageBasedGm(store);
        type StoredValueListener = (
            key: string,
            oldValue: unknown,
            newValue: unknown,
            remote: boolean,
        ) => void;
        const listeners = new Map<string, StoredValueListener>();
        vi.stubGlobal('GM_addValueChangeListener', vi.fn((
            key: string,
            listener: StoredValueListener,
        ) => {
            listeners.set(key, listener);
            return listeners.size;
        }));
        const removeListener = vi.fn();
        vi.stubGlobal('GM_removeValueChangeListener', removeListener);
        const onSettings = vi.fn();
        const unsubscribe = subscribeToSettingsStorageChanges(onSettings);

        const updatedBlob = seedSettingsPair(store, { preferJapaneseSiteLanguage: true, theme: 'dark' })[SETTINGS_STORAGE_KEY];
        listeners.get(SETTINGS_STORAGE_KEY)?.(
            SETTINGS_STORAGE_KEY,
            null,
            updatedBlob,
            true,
        );
        await vi.waitFor(() => expect(onSettings).toHaveBeenCalledTimes(1));
        expect(onSettings.mock.calls[0]?.[0]).toMatchObject({
            preferJapaneseSiteLanguage: false,
            theme: 'dark',
        });

        store.set(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY, true);
        listeners.get(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY)?.(
            PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY,
            false,
            true,
            true,
        );
        await vi.waitFor(() => expect(onSettings).toHaveBeenCalledTimes(2));
        expect(onSettings.mock.calls[1]?.[0].preferJapaneseSiteLanguage).toBe(true);

        unsubscribe();
        // Canonical blob, Japanese-sites scalar, current intent ledger.
        expect(removeListener).toHaveBeenCalledTimes(3);
    });
});

describe('settings persist in packaged-extension storage', () => {
    it('keeps explicit annotations intent authoritative over a stale extension save', async () => {
        const store = new Map<string, unknown>();
        installPackagedExtensionStorage(store);

        const staleSettings = await loadSettings();
        await saveSettings(
            { ...staleSettings, annotationsPaused: false },
            { explicitUserChoiceKeys: ['annotationsPaused'] },
        );
        await saveSettings({ ...staleSettings, annotationsPaused: true, theme: 'dark' }, {
            explicitUserChoiceKeys: ['theme'],
        });

        expect((await loadSettings()).annotationsPaused).toBe(false);
    });
});

// v1.9.3 carried a website-only visitor's settings into a freshly installed
// Reader (ADR-0017). Only an empty installed store adopts them; an existing
// canonical store is never merged with the website's copy.
describe('hosted settings donors', () => {
    it('adopts a website-only key and theme into an empty installed store', async () => {
        vi.stubGlobal('location', hostedLocation);
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        const donor = JSON.stringify({ jitenApiKey: 'hosted-key', theme: 'dark' });
        localStorage.setItem(SETTINGS_STORAGE_KEY, donor);
        await expect(loadSettings()).resolves.toMatchObject({ jitenApiKey: 'hosted-key', theme: 'dark' });
        expect(store.get(SETTINGS_STORAGE_KEY)).toMatchObject({ jitenApiKey: 'hosted-key', theme: 'dark' });
        expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBe(donor);
    });

    it('is a no-op on a non-hosted origin and never clobbers an explicit GM choice', async () => {
        // Off yomureader.com: nothing to promote (cross-origin localStorage is
        // isolated), so it must not run.
        vi.stubGlobal('location', { href: 'https://www.youtube.com/', hostname: 'www.youtube.com', pathname: '/', origin: 'https://www.youtube.com' });
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({ jitenApiKey: 'should-not-promote' }));
        await loadSettings();
        expect(store.get('jpdb-popup-reader-settings')).toBeUndefined();

        // On the hosted origin, a stale hosted default must not overwrite an
        // explicit GM key set elsewhere.
        vi.stubGlobal('location', hostedLocation);
        seedSettingsPair(store, { jitenApiKey: 'real-gm-key' });
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({ jitenApiKey: 'stale-hosted-key' }));
        await loadSettings();
        expect((store.get('jpdb-popup-reader-settings') as Record<string, unknown>).jitenApiKey).toBe('real-gm-key');
    });

    it('ignores stranded settings alongside an existing canonical store', async () => {
        vi.stubGlobal('location', hostedLocation);
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        const before = seedSettingsPair(store, { manualScanEnabled: true });
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({
            jitenApiKey: 'stranded-key',
            theme: 'dark',
            subtitleControlsMode: 'always',
        }));

        const settings = await loadSettings();
        expect(settings.jitenApiKey).toBe('');
        expect(settings.theme).toBe(DEFAULT_SETTINGS.theme);
        expect(settings.subtitleControlsMode).toBe('auto');

        const shared = store.get('jpdb-popup-reader-settings') as Record<string, unknown>;
        expect(shared).toEqual(before[SETTINGS_STORAGE_KEY]);
        expect(shared.manualScanEnabled).toBe(true);
    });

    // A rejected hosted save used to leave its new intent ledger in the local
    // fallback. A later healthy bridge promoted that orphan and made a setting
    // the UI reported as failed become active after reload. Rejection now means
    // the prior shared and origin-local state both remain authoritative.
    it('does not replay a rejected hosted choice from the local fallback', async () => {
        vi.stubGlobal('location', hostedLocation);
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        // Annotations are OFF in the shared store, i.e. a non-default value.
        const beforePair = seedSettingsPair(store, { annotationsPaused: true });

        // The hosted page reads, giving the next write a baseline to diff.
        const beforeToggle = await loadSettings();
        expect(beforeToggle.annotationsPaused).toBe(true);

        // The learner toggles annotations ON inside the hosted app, which has
        // no GM store of its own, so the write strands in this origin's
        // localStorage. A present-but-dead GM_setValue is that same path.
        vi.stubGlobal('GM_setValue', vi.fn(async () => {
            throw new Error('hosted app has no GM bridge');
        }));
        // A rejected shared write is reported and its attempted local recovery
        // copy is rolled back with the ledger transaction.
        await expect(saveSettings({ ...beforeToggle, annotationsPaused: false }, {
            explicitUserChoiceKeys: ['annotationsPaused'],
        })).rejects.toThrow(/Settings persistence failed/);
        expect(store.get(SETTINGS_STORAGE_KEY)).toEqual(beforePair[SETTINGS_STORAGE_KEY]);
        expect(store.get(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toEqual(beforePair[SETTINGS_INTENT_LEDGER_STORAGE_KEY]);

        // Reload with the shared store readable again: the rejected choice must
        // not become active merely because the bridge recovered.
        installSharedMessageBasedGm(store);
        const afterRefresh = await loadSettings();
        expect(afterRefresh.annotationsPaused).toBe(true);
    });

    it('still ignores a stale hosted default nobody chose', async () => {
        // The guard the fix must not remove: an untouched hosted copy sitting
        // at a default cannot overwrite a real choice made on another site.
        vi.stubGlobal('location', hostedLocation);
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        seedSettingsPair(store, { annotationsPaused: true });
        // No preceding read, so no recorded intent: just a blob at the default.
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({ annotationsPaused: false }));

        const settings = await loadSettings();
        expect(settings.annotationsPaused).toBe(true);
    });

    it('keeps the shared store authoritative for values the user set elsewhere', async () => {
        vi.stubGlobal('location', hostedLocation);
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        seedSettingsPair(store, { theme: 'dark', jitenApiKey: 'real-key' });
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({ jitenApiKey: 'stale-old-key' }));

        const settings = await loadSettings();
        expect(settings.theme).toBe('dark');
        expect(settings.jitenApiKey).toBe('real-key');
    });

    it('strips the website demo policy when adopting a whole blob into an empty installed store', async () => {
        vi.stubGlobal('location', hostedLocation);
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({
            jitenApiKey: 'stranded-key',
            subtitleControlsMode: 'always',
            preferJapaneseSiteLanguage: true,
        }));

        const settings = await loadSettings();
        expect(settings.jitenApiKey).toBe('stranded-key');
        expect(settings.subtitleControlsMode).toBe('auto');
        expect(settings.preferJapaneseSiteLanguage).toBe(false);

        const shared = store.get(SETTINGS_STORAGE_KEY) as Record<string, unknown>;
        expect(shared.jitenApiKey).toBe('stranded-key');
        expect(shared).not.toHaveProperty('subtitleControlsMode');
        expect(shared).not.toHaveProperty('preferJapaneseSiteLanguage');
    });

    it('keeps earlier standalone choices separate from a late installed store', async () => {
        vi.stubGlobal('location', hostedLocation);
        const standalone = await loadSettings();
        await saveSettings({ ...standalone, theme: 'dark', lookupOnHover: false, jitenApiKey: 'local-choice' }, {
            explicitUserChoiceKeys: ['theme', 'lookupOnHover', 'jitenApiKey'],
        });

        const localBeforeBridge = JSON.parse(localStorage.getItem('jpdb-popup-reader-settings') ?? '{}');
        expect(localBeforeBridge).toMatchObject({
            theme: 'dark',
            lookupOnHover: false,
            jitenApiKey: 'local-choice',
        });

        const store = new Map<string, unknown>();
        seedSettingsPair(store, { manualScanEnabled: true, theme: 'light', popupMode: 'popover', lookupOnHover: true, jitenApiKey: 'gm-old-choice' });
        installSharedMessageBasedGm(store);

        const reconciled = await loadSettings();
        expect(reconciled.theme).toBe('light');
        expect(reconciled.lookupOnHover).toBe(true);
        expect(reconciled.jitenApiKey).toBe('gm-old-choice');
        expect(reconciled.manualScanEnabled).toBe(true);
        expect(reconciled.popupMode).toBe('popover');
        expect(store.get('jpdb-popup-reader-settings')).toMatchObject({
            manualScanEnabled: true,
            theme: 'light',
            popupMode: 'popover',
            lookupOnHover: true,
            jitenApiKey: 'gm-old-choice',
        });
        expect(store.get('jpdb-popup-reader-settings')).not.toHaveProperty('__yomuHostedPendingGmPatch');

        const localAfterBridge = JSON.parse(localStorage.getItem('jpdb-popup-reader-settings') ?? '{}');
        expect(localAfterBridge).toEqual(localBeforeBridge);
    });

    it('does not promote an injected pending object without its local intent witness', async () => {
        vi.stubGlobal('location', hostedLocation);
        const sharedCommit = 'shared-commit';
        const store = new Map<string, unknown>([
            [SETTINGS_STORAGE_KEY, {
                ...DEFAULT_SETTINGS,
                enableLogging: true,
                theme: 'light',
                __yomuSettingsPersistenceCommitV1: sharedCommit,
            }],
            [SETTINGS_INTENT_LEDGER_STORAGE_KEY, {
                revision: 1,
                records: {},
                __yomuSettingsPersistenceCommitV1: sharedCommit,
            }],
        ]);
        installSharedMessageBasedGm(store);
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            theme: 'dark',
            __yomuSettingsPersistenceCommitV1: 'offline-commit',
            __yomuHostedPendingGmPatch: {
                theme: 'dark',
                __yomuSettingsPersistenceCommitV1: 'offline-commit',
                __yomuSettingsPersistenceTransactionV1: { version: 1 },
            },
        }));

        await expect(loadSettings()).resolves.toMatchObject({ theme: 'light' });
        expect(store.get(SETTINGS_STORAGE_KEY)).toMatchObject({ theme: 'light', __yomuSettingsPersistenceCommitV1: sharedCommit });
        expect(store.get(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toMatchObject({
            __yomuSettingsPersistenceCommitV1: sharedCommit,
        });
    });

    it('does not merge standalone edits into newer installed settings', async () => {
        vi.stubGlobal('location', hostedLocation);
        await saveSettings({ ...DEFAULT_SETTINGS, theme: 'light', popupMode: 'sheet', lookupOnHover: true }, {
            explicitUserChoiceKeys: NO_EXPLICIT_USER_CHOICE,
        });
        const local = await loadSettings();
        await saveSettings({ ...local, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] });

        const currentStore = new Map<string, unknown>();
        seedSettingsPair(currentStore, { theme: 'light', popupMode: 'popover', lookupOnHover: false });
        installSharedMessageBasedGm(currentStore);
        const reconciled = await loadSettings();

        expect(reconciled.theme).toBe('light');
        expect(reconciled.popupMode).toBe('popover');
        expect(reconciled.lookupOnHover).toBe(false);
        expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!)).toMatchObject({ theme: 'dark', popupMode: 'sheet' });
    });

    it('keeps GM settings after the hosted localStorage mirror is cleared', async () => {
        vi.stubGlobal('location', hostedLocation);
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        const settings = await loadSettings();
        await saveSettings({ ...settings, theme: 'dark', lookupOnHover: false, jitenApiKey: 'durable-key' }, {
            explicitUserChoiceKeys: ['theme', 'lookupOnHover', 'jitenApiKey'],
        });

        localStorage.clear();
        const reloaded = await loadSettings();
        expect(reloaded.theme).toBe('dark');
        expect(reloaded.lookupOnHover).toBe(false);
        expect(reloaded.jitenApiKey).toBe('durable-key');
    });
});

describe('current theme preservation', () => {
    it('preserves a current light choice through reload and an unchanged save', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        await saveSettings({ ...DEFAULT_SETTINGS, theme: 'light' }, { explicitUserChoiceKeys: ['theme'] });

        const migrated = await loadSettings();
        expect(migrated.theme).toBe('light');
        expect(migrated).not.toHaveProperty('themeAutoRestored20260730');

        // Saving the same current choice must also preserve it.
        migrated.theme = 'light';
        await saveSettings(migrated, { explicitUserChoiceKeys: ['theme'] });
        expect((await loadSettings()).theme).toBe('light');
    });

    it('leaves a stored dark choice alone', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] });
        expect((await loadSettings()).theme).toBe('dark');
    });
});

describe('current filter notice preservation', () => {
    it('preserves a current disabled notice through reload and an unchanged save', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        await saveSettings({ ...DEFAULT_SETTINGS, youtubeShowFilterNotice: false }, {
            explicitUserChoiceKeys: ['youtubeShowFilterNotice'],
        });

        const migrated = await loadSettings();
        expect(migrated.youtubeShowFilterNotice).toBe(false);
        expect(migrated).not.toHaveProperty('youtubeFilterNoticeRestored20260711');

        // The opt-out also survives a current save.
        migrated.youtubeShowFilterNotice = false;
        await saveSettings(migrated, { explicitUserChoiceKeys: ['youtubeShowFilterNotice'] });
        const reloaded = await loadSettings();
        expect(reloaded.youtubeShowFilterNotice).toBe(false);
    });
});
