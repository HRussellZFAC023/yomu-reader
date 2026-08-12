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
    promoteStrandedHostedSettingsToGmStorage,
    saveSettings,
    subscribeToSettingsStorageChanges,
} from '../../src/reader/settings/index';
import { SETTINGS_INTENT_LEDGER_STORAGE_KEY } from '../../src/reader/settings/intent-ledger';
import { readSettingsPersistenceView } from '../../src/reader/settings/settings-persistence-transaction';
import { gmStorageGet } from '../../src/reader/app/storage';
import {
    installUserscriptGmStorageBridge,
    uninstallUserscriptGmStorageBridge,
} from '../../src/reader/userscript/storage-bridge';

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

// Simulate a message-based userscript manager (Greasemonkey 4 / Safari
// Userscripts / FireMonkey): every GM.getValue call structured-clones both the
// stored value AND the default it hands back, and the store is shared across
// every site the script runs on (that is what GM storage is). This is the
// exact environment behind the report — turning furigana off on one site,
// then finding the onboarding popup and furigana back on the next.
function installSharedMessageBasedGm(store: Map<string, unknown>): void {
    const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
    vi.stubGlobal('GM_getValue', vi.fn(async (key: string, fallback: unknown) =>
        clone(store.has(key) ? store.get(key) : fallback)));
    vi.stubGlobal('GM_setValue', vi.fn(async (key: string, value: unknown) => {
        store.set(key, clone(value));
    }));
    vi.stubGlobal('GM_deleteValue', vi.fn(async (key: string) => {
        store.delete(key);
    }));
}

async function expectUnchosenPersistenceState(
    store: Map<string, unknown>,
    previousSettings: unknown,
): Promise<void> {
    expect(store.get(SETTINGS_STORAGE_KEY)).toEqual(previousSettings);
    expect(store.has(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toBe(false);
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toBeNull();
    await expect(loadSettings()).resolves.toMatchObject({
        learningTargetChosen: false,
        onboardingSeen: false,
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
        learningTargetChosen: true,
    }));
    return store;
}

function installRejectedTargetCommit(): {
    previousSettings: typeof DEFAULT_SETTINGS;
    store: Map<string, unknown>;
} {
    vi.stubGlobal('location', hostedLocation);
    const previousSettings = {
        ...DEFAULT_SETTINGS,
        learningTargetChosen: false,
        onboardingSeen: false,
    };
    const store = new Map<string, unknown>([[SETTINGS_STORAGE_KEY, previousSettings]]);
    installSharedMessageBasedGm(store);
    vi.stubGlobal('GM_setValue', vi.fn(async (key: string, value: unknown) => {
        if (key === SETTINGS_STORAGE_KEY
            && (value as { learningTargetChosen?: unknown }).learningTargetChosen === true) {
            throw new Error('settings blob rejected');
        }
        store.set(key, JSON.parse(JSON.stringify(value)));
    }));
    return { previousSettings, store };
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
    afterEach(() => {
        uninstallUserscriptGmStorageBridge();
        localStorage.clear();
        sessionStorage.clear();
        delete document.documentElement.dataset.yomuHosted;
        vi.unstubAllGlobals();
    });

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
            const store = new Map<string, unknown>([
                ['yomu:state-epoch', epoch],
                [settingsSlot, managedStateEnvelope({
                    ...DEFAULT_SETTINGS,
                    theme: 'light',
                    preferJapaneseSiteLanguage: preference,
                }, epoch)],
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
            onboardingSeen: true,
        }));
        const store = new Map<string, unknown>([
            [SETTINGS_STORAGE_KEY, { ...DEFAULT_SETTINGS, theme: 'light', preferJapaneseSiteLanguage: false }],
            [PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY, false],
        ]);
        enterHostedStudyPageRealm(store);

        const settings = await loadSettings();
        expect(settings).toMatchObject({
            preferJapaneseSiteLanguage: false,
            subtitleFontSize: 48,
            onboardingSeen: true,
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
        expect(ledger.records).toHaveProperty('subtitleFontSize');
        expect(store.get(EXPLICIT_USER_SETTINGS_STORAGE_KEY)).toEqual({ onboardingSeen: true });
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

    it('keeps furigana-off and onboarding-seen when navigating to the next site', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);

        // Site A: complete onboarding, turn furigana off.
        const onSiteA = await loadSettings();
        await saveSettings({ ...onSiteA, onboardingSeen: true, showFurigana: false, furiganaMode: 'off' }, {
            explicitUserChoiceKeys: ['onboardingSeen', 'showFurigana', 'furiganaMode'],
        });

        // Site B: fresh page load reads the shared GM store.
        const onSiteB = await loadSettings();
        expect(onSiteB.onboardingSeen).toBe(true);
        expect(onSiteB.showFurigana).toBe(false);
        expect(onSiteB.furiganaMode).toBe('off');
    });

    it('does not resurface onboarding for a brand-new user before they save anything', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);

        const fresh = await loadSettings();
        // Fresh user: no stored value, so onboarding SHOULD show once — but the
        // loaded record must not be polluted by the missing-sentinel clone.
        expect(fresh.onboardingSeen).toBe(false);
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

    it('rolls back an explicit site-language scalar when the paired target settings write fails', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        vi.stubGlobal('GM_setValue', vi.fn(async (key: string, value: unknown) => {
            if (key === SETTINGS_STORAGE_KEY) throw new Error('settings blob rejected');
            store.set(key, JSON.parse(JSON.stringify(value)));
        }));

        await expect(saveSettings({
            ...DEFAULT_SETTINGS,
            learningTargetChosen: true,
            onboardingSeen: true,
            preferJapaneseSiteLanguage: true,
        }, {
            persistPreferredJapaneseSiteLanguage: true,
            explicitUserChoiceKeys: [
                'learningTargetChosen',
                'onboardingSeen',
                'preferJapaneseSiteLanguage',
            ],
        })).rejects.toThrow(/GM storage write failed/);

        expect(store.has(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY)).toBe(false);
    });

    it('rolls back the intent ledger, settings blob, and local fallback when the settings write fails', async () => {
        const { previousSettings, store } = installRejectedTargetCommit();

        await expect(saveSettings({
            ...previousSettings,
            learningTargetChosen: true,
            onboardingSeen: true,
        }, {
            explicitUserChoiceKeys: ['learningTargetChosen', 'onboardingSeen'],
        })).rejects.toThrow(/GM storage write failed/);

        await expectUnchosenPersistenceState(store, previousSettings);
    });

    it('rolls back a rejected ledger write before the canonical settings commit can run', async () => {
        const previousSettings = {
            ...DEFAULT_SETTINGS,
            learningTargetChosen: false,
            onboardingSeen: false,
        };
        const store = new Map<string, unknown>([[SETTINGS_STORAGE_KEY, previousSettings]]);
        installSharedMessageBasedGm(store);
        const setValue = vi.fn(async (key: string, value: unknown) => {
            if (key === SETTINGS_INTENT_LEDGER_STORAGE_KEY) throw new Error('ledger rejected');
            store.set(key, JSON.parse(JSON.stringify(value)));
        });
        vi.stubGlobal('GM_setValue', setValue);

        await expect(saveSettings({
            ...previousSettings,
            learningTargetChosen: true,
            onboardingSeen: true,
        }, {
            explicitUserChoiceKeys: ['learningTargetChosen', 'onboardingSeen'],
        })).rejects.toThrow(/GM storage write failed/);

        const attemptedSettings = setValue.mock.calls
            .filter(([key]) => key === SETTINGS_STORAGE_KEY)
            .map(([, value]) => value as { learningTargetChosen?: unknown });
        expect(attemptedSettings.length).toBeGreaterThan(0);
        expect(attemptedSettings.every(value => value.learningTargetChosen === false)).toBe(true);
        await expectUnchosenPersistenceState(store, previousSettings);
    });

    it('keeps the safe settings marker published when ledger rollback also fails', async () => {
        const { previousSettings, store } = installRejectedTargetCommit();
        vi.stubGlobal('GM_deleteValue', vi.fn(async (key: string) => {
            if (key === SETTINGS_INTENT_LEDGER_STORAGE_KEY) throw new Error('ledger rollback rejected');
            store.delete(key);
        }));

        await expect(saveSettings({
            ...previousSettings,
            learningTargetChosen: true,
            onboardingSeen: true,
        }, {
            explicitUserChoiceKeys: ['learningTargetChosen', 'onboardingSeen'],
        })).rejects.toThrow(/rollback operation/);

        expect(store.get(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toMatchObject({
            records: { learningTargetChosen: { value: true } },
        });
        expect(store.get(SETTINGS_STORAGE_KEY)).toMatchObject({
            learningTargetChosen: false,
            onboardingSeen: false,
            __yomuSettingsPersistenceTransactionV1: { version: 1 },
        });
        expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}')).toMatchObject({
            learningTargetChosen: false,
            onboardingSeen: false,
            __yomuSettingsPersistenceTransactionV1: { version: 1 },
        });
        await expect(loadSettings()).resolves.toMatchObject({
            learningTargetChosen: false,
            onboardingSeen: false,
        });
    });

    it('keeps async loads and the same-origin raw fallback on the previous target until commit', async () => {
        vi.stubGlobal('location', hostedLocation);
        const previousSettings = {
            ...DEFAULT_SETTINGS,
            learningTargetChosen: false,
            onboardingSeen: false,
        };
        const store = new Map<string, unknown>([[SETTINGS_STORAGE_KEY, previousSettings]]);
        installSharedMessageBasedGm(store);
        let releaseCommit!: () => void;
        const commitGate = new Promise<void>(resolve => { releaseCommit = resolve; });
        let commitReached!: () => void;
        const reachedCommit = new Promise<void>(resolve => { commitReached = resolve; });
        vi.stubGlobal('GM_setValue', vi.fn(async (key: string, value: unknown) => {
            if (key === SETTINGS_STORAGE_KEY
                && (value as { learningTargetChosen?: unknown }).learningTargetChosen === true) {
                commitReached();
                await commitGate;
            }
            store.set(key, JSON.parse(JSON.stringify(value)));
        }));

        const saving = saveSettings({
            ...previousSettings,
            learningTargetChosen: true,
            onboardingSeen: true,
        }, {
            explicitUserChoiceKeys: ['learningTargetChosen', 'onboardingSeen'],
        });
        await reachedCommit;

        expect(store.get(SETTINGS_STORAGE_KEY)).toMatchObject({
            learningTargetChosen: false,
            onboardingSeen: false,
        });
        const rawFallback = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}');
        expect(rawFallback).toMatchObject({
            learningTargetChosen: false,
            onboardingSeen: false,
        });
        expect(normalizeReaderSettings(rawFallback).learningTargetChosen).toBe(false);
        await expect(loadSettings()).resolves.toMatchObject({
            learningTargetChosen: false,
            onboardingSeen: false,
        });

        releaseCommit();
        await saving;
        await expect(loadSettings()).resolves.toMatchObject({
            learningTargetChosen: true,
            onboardingSeen: true,
        });
    });

    it('retries a committed view read that crosses the final settings write', async () => {
        const previousSettings = {
            ...DEFAULT_SETTINGS,
            learningTargetChosen: false,
            onboardingSeen: false,
        };
        const committedSettings = {
            ...previousSettings,
            learningTargetChosen: true,
            onboardingSeen: true,
        };
        const nextLedger = {
            revision: 2,
            records: {
                learningTargetChosen: { seq: 1, value: true },
                onboardingSeen: { seq: 2, value: true },
            },
        };
        const reads = installSettingsReadSequence(
            read => read === 0 ? previousSettings : committedSettings,
            nextLedger,
        );

        const view = await readSettingsPersistenceView();
        expect(view.settings).toEqual(committedSettings);
        expect(view.intentLedger.records).toMatchObject({
            learningTargetChosen: { value: true },
            onboardingSeen: { value: true },
        });
        expect(reads.settings()).toBe(4);
    });

    it('accepts a matching commit witness and hides its storage metadata', async () => {
        const commitId = 'committed-target';
        const committedSettings = {
            ...DEFAULT_SETTINGS,
            learningTargetChosen: true,
            onboardingSeen: true,
            __yomuSettingsPersistenceCommitV1: commitId,
        };
        const committedLedger = {
            revision: 2,
            __yomuSettingsPersistenceCommitV1: commitId,
            records: {
                learningTargetChosen: { seq: 1, value: true },
                onboardingSeen: { seq: 2, value: true },
            },
        };
        installSettingsReadSequence(() => committedSettings, committedLedger);

        const view = await readSettingsPersistenceView();
        expect(view.settings).toMatchObject({ learningTargetChosen: true, onboardingSeen: true });
        expect(view.settings).not.toHaveProperty('__yomuSettingsPersistenceCommitV1');
        expect(view.intentLedger.records).toMatchObject({
            learningTargetChosen: { value: true },
            onboardingSeen: { value: true },
        });
    });

    it('rejects a staged ledger observed during failed-transaction ABA rollback', async () => {
        const previousSettings = {
            ...DEFAULT_SETTINGS,
            learningTargetChosen: false,
            onboardingSeen: false,
        };
        const previousLedger = { revision: 1, records: {} };
        const rejectedLedger = {
            revision: 2,
            __yomuSettingsPersistenceCommitV1: 'rejected-transaction',
            records: {
                learningTargetChosen: { seq: 1, value: true },
                onboardingSeen: { seq: 2, value: true },
            },
        };
        const reads = installSettingsReadSequence(
            () => previousSettings,
            (read: number) => read < 2 ? rejectedLedger : previousLedger,
        );

        const view = await readSettingsPersistenceView();
        expect(view.settings).toEqual(previousSettings);
        expect(view.intentLedger.records).toEqual({});
        expect(reads.settings()).toBe(4);
        expect(reads.intentLedger()).toBe(4);
        await expect(loadSettings()).resolves.toMatchObject({
            learningTargetChosen: false,
            onboardingSeen: false,
        });
    });

    it('does not promote page-local settings into learner intent on an untrusted origin', async () => {
        const store = installForgedPageSettings();

        await expect(loadSettings()).resolves.toMatchObject({
            learningTargetChosen: false,
            onboardingSeen: false,
        });
        expect(store.has(SETTINGS_STORAGE_KEY)).toBe(false);
        expect(store.has(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toBe(false);
    });

    it('does not restore a forged page-local target when the first legitimate save fails', async () => {
        const store = installForgedPageSettings();
        const previous = await loadSettings();
        vi.stubGlobal('GM_setValue', vi.fn(async (key: string, value: unknown) => {
            if (key === SETTINGS_STORAGE_KEY
                && (value as { learningTargetChosen?: unknown }).learningTargetChosen === true) {
                throw new Error('first target commit rejected');
            }
            store.set(key, JSON.parse(JSON.stringify(value)));
        }));

        await expect(saveSettings({
            ...previous,
            learningTargetChosen: true,
            onboardingSeen: true,
        }, {
            explicitUserChoiceKeys: ['learningTargetChosen', 'onboardingSeen'],
        })).rejects.toThrow('first target commit rejected');

        expect(store.has(SETTINGS_STORAGE_KEY)).toBe(false);
        expect(store.has(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toBe(false);
        await expect(loadSettings()).resolves.toMatchObject({
            learningTargetChosen: false,
            onboardingSeen: false,
        });
    });

    it('never serializes an untrusted page-local blob into the privileged transaction marker', async () => {
        const store = installForgedPageSettings();
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            learningTargetChosen: true,
            pagePayload: 'x'.repeat(500_000),
        }));
        const writes: unknown[] = [];
        vi.stubGlobal('GM_setValue', vi.fn(async (key: string, value: unknown) => {
            const serialized = JSON.stringify(value);
            if (serialized.length > 200_000) throw new Error('quota exceeded');
            writes.push(value);
            store.set(key, JSON.parse(serialized));
        }));

        const previous = await loadSettings();
        await expect(saveSettings({
            ...previous,
            learningTargetChosen: true,
            onboardingSeen: true,
        }, {
            explicitUserChoiceKeys: ['learningTargetChosen', 'onboardingSeen'],
        })).resolves.toBeUndefined();

        expect(writes.length).toBeGreaterThan(0);
        expect(JSON.stringify(writes)).not.toContain('pagePayload');
        await expect(loadSettings()).resolves.toMatchObject({
            learningTargetChosen: true,
            onboardingSeen: true,
        });
    });

    it('fails closed when a committed settings view never stabilizes', async () => {
        const previousSettings = {
            ...DEFAULT_SETTINGS,
            learningTargetChosen: false,
            onboardingSeen: false,
        };
        const nextSettings = {
            ...previousSettings,
            learningTargetChosen: true,
            onboardingSeen: true,
        };
        const reads = installSettingsReadSequence(
            read => read % 2 === 0 ? previousSettings : nextSettings,
        );

        const view = await readSettingsPersistenceView();
        expect(view.settings).toBeNull();
        expect(view.intentLedger.records).toEqual({});
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
        store.set(SETTINGS_STORAGE_KEY, { ...DEFAULT_SETTINGS, theme: 'dark' });
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
        store.set(SETTINGS_STORAGE_KEY, {
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

    it('still fills a field the current store has never stored at all', async () => {
        const store = new Map<string, unknown>();
        // The recovery has a real job: a genuinely absent key must still be adopted,
        // which is what the presence check preserves and the equality check conflated.
        store.set('yomu-reader-settings', { ankiTags: 'legacy-tag' });
        store.set(SETTINGS_STORAGE_KEY, { theme: 'dark' });
        installSharedMessageBasedGm(store);

        expect((await loadSettings()).ankiTags).toBe('legacy-tag');
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

    it('adopts the choices an older install pinned in the pre-ledger store', async () => {
        const store = new Map<string, unknown>();
        // What 1.8.22 through 1.8.78 wrote: a flat key -> value map, no ordering.
        store.set('yomu:explicit-user-settings:v1', { annotationsPaused: false });
        store.set(SETTINGS_STORAGE_KEY, { ...DEFAULT_SETTINGS, annotationsPaused: true });
        installSharedMessageBasedGm(store);

        expect((await loadSettings()).annotationsPaused).toBe(false);

        // And a fresh declaration outranks the migrated pin.
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
            [SETTINGS_STORAGE_KEY, { preferJapaneseSiteLanguage: 'true' }],
            [PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY, 'true'],
        ]);
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
        expect(store.get(PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY)).toBe(false);
    });

    it('reloads authoritative settings when either the blob or scalar changes', async () => {
        const store = new Map<string, unknown>([
            [SETTINGS_STORAGE_KEY, { preferJapaneseSiteLanguage: true, theme: 'light' }],
            [PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY, false],
        ]);
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

        const updatedBlob = { preferJapaneseSiteLanguage: true, theme: 'dark' };
        store.set(SETTINGS_STORAGE_KEY, updatedBlob);
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
        // Blob, Japanese-sites scalar, pre-ledger pin store, intent ledger.
        expect(removeListener).toHaveBeenCalledTimes(4);
    });
});

describe('settings persist in packaged-extension storage', () => {
    afterEach(() => {
        localStorage.clear();
        vi.unstubAllGlobals();
    });

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

// Settings edited on yomureader.com historically fell back to that origin's
// localStorage (no GM backend on docs pages before the storage bridge covered
// them), so the jiten key or theme chosen there never followed the user to
// other sites. Once a GM backend is reachable, loadSettings folds those
// stranded values into the shared store — except demo-player staging keys the
// docs theme force-writes, which are not user intent.
describe('stranded hosted settings recovery (yomureader.com localStorage)', () => {
    afterEach(() => {
        localStorage.clear();
        vi.unstubAllGlobals();
    });

    it('eagerly promotes a hosted-app jiten key + dark theme into the shared GM store from the userscript sandbox', async () => {
        // The userscript entry runs this at document-start on yomureader.com;
        // it must push the key + theme into GM so youtube.com (which reads GM)
        // no longer falls back to defaults (light theme, no key).
        vi.stubGlobal('location', hostedLocation);
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({ jitenApiKey: 'hosted-key', theme: 'dark' }));

        const promoted = await promoteStrandedHostedSettingsToGmStorage();
        expect(promoted).toBe(true);
        const shared = store.get('jpdb-popup-reader-settings') as Record<string, unknown>;
        expect(shared.jitenApiKey).toBe('hosted-key');
        expect(shared.theme).toBe('dark');

        // A subsequent load on another site (shared store) now sees them.
        vi.stubGlobal('location', { href: 'https://www.youtube.com/', hostname: 'www.youtube.com', pathname: '/', origin: 'https://www.youtube.com' });
        const onYouTube = await loadSettings();
        expect(onYouTube.jitenApiKey).toBe('hosted-key');
        expect(onYouTube.theme).toBe('dark');
    });

    it('is a no-op on a non-hosted origin and never clobbers an explicit GM choice', async () => {
        // Off yomureader.com: nothing to promote (cross-origin localStorage is
        // isolated), so it must not run.
        vi.stubGlobal('location', { href: 'https://www.youtube.com/', hostname: 'www.youtube.com', pathname: '/', origin: 'https://www.youtube.com' });
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({ jitenApiKey: 'should-not-promote' }));
        expect(await promoteStrandedHostedSettingsToGmStorage()).toBe(false);
        expect(store.get('jpdb-popup-reader-settings')).toBeUndefined();

        // On the hosted origin, a stale hosted default must not overwrite an
        // explicit GM key set elsewhere.
        vi.stubGlobal('location', hostedLocation);
        store.set('jpdb-popup-reader-settings', { jitenApiKey: 'real-gm-key' });
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({ jitenApiKey: 'stale-hosted-key' }));
        await promoteStrandedHostedSettingsToGmStorage();
        expect((store.get('jpdb-popup-reader-settings') as Record<string, unknown>).jitenApiKey).toBe('real-gm-key');
    });

    it('folds stranded jiten key and theme into an existing shared store, ignoring demo staging keys', async () => {
        vi.stubGlobal('location', hostedLocation);
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        store.set('jpdb-popup-reader-settings', { onboardingSeen: true });
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({
            jitenApiKey: 'stranded-key',
            theme: 'dark',
            subtitleControlsMode: 'always',
        }));

        const settings = await loadSettings();
        expect(settings.jitenApiKey).toBe('stranded-key');
        expect(settings.theme).toBe('dark');
        expect(settings.subtitleControlsMode).toBe('auto');

        const shared = store.get('jpdb-popup-reader-settings') as Record<string, unknown>;
        expect(shared.jitenApiKey).toBe('stranded-key');
        expect(shared.theme).toBe('dark');
        expect(shared.onboardingSeen).toBe(true);
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
        store.set('jpdb-popup-reader-settings', { annotationsPaused: true });

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
        expect(store.get('jpdb-popup-reader-settings')).toEqual({ annotationsPaused: true });

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
        store.set('jpdb-popup-reader-settings', { annotationsPaused: true });
        // No preceding read, so no recorded intent: just a blob at the default.
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({ annotationsPaused: false }));

        const settings = await loadSettings();
        expect(settings.annotationsPaused).toBe(true);
    });

    it('keeps the shared store authoritative for values the user set elsewhere', async () => {
        vi.stubGlobal('location', hostedLocation);
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        store.set('jpdb-popup-reader-settings', { theme: 'dark', jitenApiKey: 'real-key' });
        localStorage.setItem('jpdb-popup-reader-settings', JSON.stringify({ jitenApiKey: 'stale-old-key' }));

        const settings = await loadSettings();
        expect(settings.theme).toBe('dark');
        expect(settings.jitenApiKey).toBe('real-key');
    });

    it('strips hosted policy keys when promoting a whole stranded blob into an empty shared store', async () => {
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

        const shared = store.get('jpdb-popup-reader-settings') as Record<string, unknown>;
        expect(shared.jitenApiKey).toBe('stranded-key');
        expect(shared.subtitleControlsMode).not.toBe('always');
        expect(shared.preferJapaneseSiteLanguage).toBeUndefined();
    });

    it('promotes a hosted save made before a late GM bridge and then clears the pending marker', async () => {
        vi.stubGlobal('location', hostedLocation);
        const standalone = await loadSettings();
        await saveSettings({ ...standalone, theme: 'dark', lookupOnHover: false, jitenApiKey: 'local-choice' }, {
            explicitUserChoiceKeys: ['theme', 'lookupOnHover', 'jitenApiKey'],
        });

        const localBeforeBridge = JSON.parse(localStorage.getItem('jpdb-popup-reader-settings') ?? '{}');
        expect(localBeforeBridge.__yomuHostedPendingGmPatch).toMatchObject({
            theme: 'dark',
            lookupOnHover: false,
            jitenApiKey: 'local-choice',
        });

        const store = new Map<string, unknown>([[
            'jpdb-popup-reader-settings',
            { onboardingSeen: true, theme: 'light', popupMode: 'popover', lookupOnHover: true, jitenApiKey: 'gm-old-choice' },
        ]]);
        installSharedMessageBasedGm(store);

        const reconciled = await loadSettings();
        expect(reconciled.theme).toBe('dark');
        expect(reconciled.lookupOnHover).toBe(false);
        expect(reconciled.jitenApiKey).toBe('local-choice');
        expect(reconciled.onboardingSeen).toBe(true);
        expect(reconciled.popupMode).toBe('popover');
        expect(store.get('jpdb-popup-reader-settings')).toMatchObject({
            onboardingSeen: true,
            theme: 'dark',
            popupMode: 'popover',
            lookupOnHover: false,
            jitenApiKey: 'local-choice',
        });
        expect(store.get('jpdb-popup-reader-settings')).not.toHaveProperty('__yomuHostedPendingGmPatch');

        const localAfterBridge = JSON.parse(localStorage.getItem('jpdb-popup-reader-settings') ?? '{}');
        expect(localAfterBridge.__yomuHostedPendingGmPatch).toBeUndefined();
    });

    it('replays hosted fields without replacing the shared transaction commit witness', async () => {
        vi.stubGlobal('location', hostedLocation);
        const sharedCommit = 'shared-commit';
        const store = new Map<string, unknown>([
            [SETTINGS_STORAGE_KEY, {
                ...DEFAULT_SETTINGS,
                learningTargetChosen: true,
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

        await expect(loadSettings()).resolves.toMatchObject({ theme: 'dark' });
        expect(store.get(SETTINGS_STORAGE_KEY)).toMatchObject({
            theme: 'dark',
            __yomuSettingsPersistenceCommitV1: sharedCommit,
        });
        expect(store.get(SETTINGS_INTENT_LEDGER_STORAGE_KEY)).toMatchObject({
            __yomuSettingsPersistenceCommitV1: sharedCommit,
        });
    });

    it('merges only the pending hosted fields into newer GM changes from another site', async () => {
        vi.stubGlobal('location', hostedLocation);
        const initialStore = new Map<string, unknown>([[
            'jpdb-popup-reader-settings',
            { theme: 'light', popupMode: 'sheet', lookupOnHover: true },
        ]]);
        installSharedMessageBasedGm(initialStore);
        await loadSettings();
        vi.unstubAllGlobals();
        vi.stubGlobal('location', hostedLocation);

        const local = await loadSettings();
        await saveSettings({ ...local, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] });

        const currentStore = new Map<string, unknown>([[
            'jpdb-popup-reader-settings',
            { theme: 'light', popupMode: 'popover', lookupOnHover: false },
        ]]);
        installSharedMessageBasedGm(currentStore);
        const reconciled = await loadSettings();

        expect(reconciled.theme).toBe('dark');
        expect(reconciled.popupMode).toBe('popover');
        expect(reconciled.lookupOnHover).toBe(false);
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

// Until 1.8.39 the default theme was 'light' and every save persisted it, so a
// stored 'light' cannot be told apart from a real choice — and because the
// hosted appearance boot reads settings.theme before its 'auto' fallback, those
// installs could never follow the operating system. Measured on the live site:
// a browser that had visited before the fix still carried theme=light and stayed
// bright with prefers-color-scheme: dark.
describe('default light theme migration', () => {
    it('moves a stored light default to auto once, then honors a later choice', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        store.set('jpdb-popup-reader-settings', { theme: 'light' });

        const migrated = await loadSettings();
        expect(migrated.theme).toBe('auto');
        expect(migrated.themeAutoRestored20260730).toBe(true);

        // Choosing light AFTER the migration is a real choice and must stick.
        migrated.theme = 'light';
        await saveSettings(migrated, { explicitUserChoiceKeys: ['theme'] });
        expect((await loadSettings()).theme).toBe('light');
    });

    it('leaves a stored dark choice alone', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        store.set('jpdb-popup-reader-settings', { theme: 'dark' });
        expect((await loadSettings()).theme).toBe('dark');
    });
});

// Until 1.6.140 the YouTube filter notice's "hide" button silently persisted
// youtubeShowFilterNotice=false — the only in-page path writing that key.
// The one-time marker migration restores it; deliberate settings-dialog
// choices made afterwards stick.
describe('hidden filter notice restore migration', () => {
    it('restores a stored notice-off once, then honors later choices', async () => {
        const store = new Map<string, unknown>();
        installSharedMessageBasedGm(store);
        store.set('jpdb-popup-reader-settings', { youtubeShowFilterNotice: false });

        const migrated = await loadSettings();
        expect(migrated.youtubeShowFilterNotice).toBe(true);
        expect(migrated.youtubeFilterNoticeRestored20260711).toBe(true);

        // A post-migration deliberate opt-out sticks across loads.
        migrated.youtubeShowFilterNotice = false;
        await saveSettings(migrated, { explicitUserChoiceKeys: ['youtubeShowFilterNotice'] });
        const reloaded = await loadSettings();
        expect(reloaded.youtubeShowFilterNotice).toBe(false);
    });
});
