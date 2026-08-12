import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeMocks = vi.hoisted(() => {
    const state = {
        applyMokuroDefault: vi.fn(),
        bootReaderApp: vi.fn(),
        installMokuroNote: vi.fn(),
        installHttpBridge: vi.fn(),
        installStorageBridge: vi.fn(),
        installShadowBridge: vi.fn(),
        activateTargetOwnedCompanions: vi.fn(),
        promoteHostedSettings: vi.fn(async () => undefined),
        asyncStoredSettings: null as Record<string, unknown> | null,
        asyncStoredIntentLedger: null as Record<string, unknown> | null,
        asyncStoredSettingsGate: null as Promise<void> | null,
        syncStoredSettings: null as Record<string, unknown> | null,
        syncStoredIntentLedger: null as Record<string, unknown> | null,
        newTab: false,
        pageOwnedTarget: false,
        gmStorageGetShared: vi.fn<[string], Promise<Record<string, unknown> | null>>(),
    };
    state.gmStorageGetShared.mockImplementation(async key => {
        if (state.asyncStoredSettingsGate) await state.asyncStoredSettingsGate;
        return key === 'yomu:settings-intent:v2'
            ? state.asyncStoredIntentLedger
            : state.asyncStoredSettings;
    });
    return state;
});

vi.mock('../../src/reader/companions/register-build-target', () => ({}));
vi.mock('../../src/reader/app/register-storage-runtime', () => ({}));
vi.mock('../../src/reader/app/boot', () => ({
    bootReaderApp: runtimeMocks.bootReaderApp,
}));
vi.mock('../../src/reader/newtab/url', () => ({
    isYomuNewTabUrl: () => runtimeMocks.newTab,
}));
vi.mock('../../src/reader/app/pages', () => ({
    isYomuHostedAcademyPage: () => runtimeMocks.pageOwnedTarget,
    isYomuHostedPassivePage: () => runtimeMocks.pageOwnedTarget,
}));
vi.mock('../../src/reader/app/preferred-site-language', () => ({
    installPreferredJapaneseSiteLanguageFromStoredSettings: vi.fn(async () => undefined),
}));
vi.mock('../../src/reader/app/mokuro-integration', () => ({
    applyMokuroReaderOcrDefault: runtimeMocks.applyMokuroDefault,
    installMokuroOcrToggleNote: runtimeMocks.installMokuroNote,
}));
vi.mock('../../src/reader/app/runtime-presence', () => ({
    announceInstalledReaderRuntime: () => true,
    shouldInstallHostedReaderRuntime: () => false,
}));
vi.mock('../../src/reader/userscript/index', () => ({
    installUserscriptGmStorageBridgeWhenReady: runtimeMocks.installStorageBridge,
    installUserscriptHttpBridgeWhenReady: runtimeMocks.installHttpBridge,
}));
vi.mock('../../src/reader/dom/shadow-scan-registry', () => ({
    installPageOpenShadowRootDiscoveryBridge: runtimeMocks.installShadowBridge,
}));
vi.mock('../../src/reader/app/storage', async importOriginal => ({
    ...await importOriginal<typeof import('../../src/reader/app/storage')>(),
    gmStorageGetShared: runtimeMocks.gmStorageGetShared,
    gmStorageGetSharedSync: (key: string) => key === 'yomu:settings-intent:v2'
        ? runtimeMocks.syncStoredIntentLedger
        : runtimeMocks.syncStoredSettings,
}));
vi.mock('../../src/reader/app/target-owned-document-start', () => ({
    activateTargetOwnedDocumentStartCompanions: runtimeMocks.activateTargetOwnedCompanions,
}));
vi.mock('../../src/reader/settings/index', async importOriginal => ({
    ...await importOriginal<typeof import('../../src/reader/settings/index')>(),
    promoteStrandedHostedSettingsToGmStorage: runtimeMocks.promoteHostedSettings,
}));

import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';

const SETTINGS_CHANGE_EVENT = 'yomu-settings-change';
const STORAGE_BRIDGE_READY_EVENT = 'yomu-userscript-storage-bridge-ready';

async function importUserscriptEntry(): Promise<void> {
    await import('../../src/reader/userscript/entry');
    await Promise.resolve();
    await Promise.resolve();
}

async function dispatchSettingsChoice(learningTargetChosen: boolean): Promise<void> {
    runtimeMocks.asyncStoredSettings = { learningTargetChosen };
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT, {
        detail: { settings: { learningTargetChosen } },
    }));
    if (learningTargetChosen) {
        await vi.waitFor(() => expect(runtimeMocks.installHttpBridge).toHaveBeenCalled());
    } else {
        await Promise.resolve();
        await Promise.resolve();
    }
}

function expectTargetOwnedRuntimeActivation(): void {
    expect(runtimeMocks.applyMokuroDefault).toHaveBeenCalledOnce();
    expect(runtimeMocks.installMokuroNote).toHaveBeenCalledOnce();
    expect(runtimeMocks.installHttpBridge).toHaveBeenCalledOnce();
    expect(runtimeMocks.installShadowBridge).not.toHaveBeenCalled();
}

function expectTargetOwnedCanvasActivation(): void {
    expectTargetOwnedRuntimeActivation();
    expect(runtimeMocks.activateTargetOwnedCompanions).toHaveBeenCalledOnce();
}

function expectTargetOwnedRuntimeInert(): void {
    expect(runtimeMocks.applyMokuroDefault).not.toHaveBeenCalled();
    expect(runtimeMocks.installMokuroNote).not.toHaveBeenCalled();
    expect(runtimeMocks.installHttpBridge).not.toHaveBeenCalled();
    expect(runtimeMocks.installStorageBridge).toHaveBeenCalledOnce();
    expect(runtimeMocks.installShadowBridge).not.toHaveBeenCalled();
    expect(runtimeMocks.activateTargetOwnedCompanions).not.toHaveBeenCalled();
}

describe('target-owned document-start activation', () => {
    beforeEach(() => {
        vi.resetModules();
        runtimeMocks.applyMokuroDefault.mockReset();
        runtimeMocks.bootReaderApp.mockReset();
        runtimeMocks.installMokuroNote.mockReset();
        runtimeMocks.installHttpBridge.mockReset();
        runtimeMocks.installStorageBridge.mockReset();
        runtimeMocks.installShadowBridge.mockReset();
        runtimeMocks.activateTargetOwnedCompanions.mockReset();
        runtimeMocks.promoteHostedSettings.mockClear();
        runtimeMocks.gmStorageGetShared.mockClear();
        runtimeMocks.gmStorageGetShared.mockImplementation(async key => {
            if (runtimeMocks.asyncStoredSettingsGate) await runtimeMocks.asyncStoredSettingsGate;
            return key === 'yomu:settings-intent:v2'
                ? runtimeMocks.asyncStoredIntentLedger
                : runtimeMocks.asyncStoredSettings;
        });
        runtimeMocks.asyncStoredSettings = null;
        runtimeMocks.asyncStoredIntentLedger = null;
        runtimeMocks.asyncStoredSettingsGate = null;
        runtimeMocks.syncStoredSettings = null;
        runtimeMocks.syncStoredIntentLedger = null;
        runtimeMocks.newTab = false;
        runtimeMocks.pageOwnedTarget = false;
    });

    it('keeps a fresh host inert when the target chooser is dismissed', async () => {
        await importUserscriptEntry();
        await dispatchSettingsChoice(false);

        expectTargetOwnedRuntimeInert();

        // Complete the choice so the entry's one-shot listener cannot leak into
        // another test realm when Vitest deliberately runs without isolation.
        await dispatchSettingsChoice(true);
    });

    it('treats a page-realm settings event only as a hint and rejects forged detail', async () => {
        await importUserscriptEntry();
        window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT, {
            detail: { settings: { theme: 'dark', learningTargetChosen: true } },
        }));
        await Promise.resolve();
        await Promise.resolve();

        expect(runtimeMocks.installHttpBridge).not.toHaveBeenCalled();
        expect(runtimeMocks.applyMokuroDefault).not.toHaveBeenCalled();
        expect(runtimeMocks.activateTargetOwnedCompanions).not.toHaveBeenCalled();

        runtimeMocks.asyncStoredSettings = { learningTargetChosen: true };
        window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT));
        await vi.waitFor(expectTargetOwnedCanvasActivation);
    });

    it('coalesces hostile settings-event bursts into one active and one trailing shared read', async () => {
        let releaseRead = (): void => undefined;
        runtimeMocks.asyncStoredSettingsGate = new Promise<void>(resolve => { releaseRead = resolve; });
        await importUserscriptEntry();

        for (let index = 0; index < 100; index += 1) {
            window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT, {
                detail: { settings: { learningTargetChosen: true } },
            }));
        }
        expect(runtimeMocks.gmStorageGetShared).toHaveBeenCalledTimes(2);

        releaseRead();
        await vi.waitFor(() => expect(runtimeMocks.gmStorageGetShared).toHaveBeenCalledTimes(4));
        expect(runtimeMocks.installHttpBridge).not.toHaveBeenCalled();

        runtimeMocks.asyncStoredSettingsGate = null;
        runtimeMocks.asyncStoredSettings = { learningTargetChosen: true };
        window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT));
        await vi.waitFor(expectTargetOwnedCanvasActivation);
    });

    it('ignores forged hosted-storage bridge events on an ordinary host', async () => {
        await importUserscriptEntry();
        const initialReads = runtimeMocks.gmStorageGetShared.mock.calls.length;

        for (let index = 0; index < 100; index += 1) {
            window.dispatchEvent(new CustomEvent(STORAGE_BRIDGE_READY_EVENT));
        }
        await Promise.resolve();

        expect(runtimeMocks.gmStorageGetShared).toHaveBeenCalledTimes(initialReads);

        await dispatchSettingsChoice(true);
    });

    it('activates once when the learner explicitly chooses a target later', async () => {
        await importUserscriptEntry();
        await dispatchSettingsChoice(true);
        await dispatchSettingsChoice(true);

        expectTargetOwnedCanvasActivation();
    });

    it('preserves synchronous document-start activation for a stored explicit target', async () => {
        runtimeMocks.syncStoredSettings = { learningTargetChosen: true };

        await importUserscriptEntry();

        expectTargetOwnedCanvasActivation();
    });

    it('rejects a target whose settings and intent commit witnesses do not match', async () => {
        runtimeMocks.syncStoredSettings = {
            learningTargetChosen: true,
            __yomuSettingsPersistenceCommitV1: 'settings-c2',
        };
        runtimeMocks.syncStoredIntentLedger = {
            version: 2,
            seq: 1,
            entries: {},
            __yomuSettingsPersistenceCommitV1: 'ledger-c1',
        };

        await importUserscriptEntry();

        expect(runtimeMocks.installHttpBridge).not.toHaveBeenCalled();
        expect(runtimeMocks.activateTargetOwnedCompanions).not.toHaveBeenCalled();

        runtimeMocks.asyncStoredSettings = runtimeMocks.syncStoredSettings;
        runtimeMocks.asyncStoredIntentLedger = {
            ...runtimeMocks.syncStoredIntentLedger,
            __yomuSettingsPersistenceCommitV1: 'settings-c2',
        };
        window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT));

        await vi.waitFor(expectTargetOwnedCanvasActivation);
    });

    it('preserves synchronous document-start activation for pre-1.9 subtitle settings', async () => {
        runtimeMocks.syncStoredSettings = { subtitleFontSize: 48 };

        await importUserscriptEntry();

        expectTargetOwnedCanvasActivation();
    });

    it('keeps stored-target document-start activation safe before documentElement exists', async () => {
        runtimeMocks.syncStoredSettings = { learningTargetChosen: true };
        const root = vi.spyOn(document, 'documentElement', 'get')
            .mockReturnValue(null as unknown as HTMLElement);

        try {
            await expect(importUserscriptEntry()).resolves.toBeUndefined();
            expect(runtimeMocks.applyMokuroDefault).toHaveBeenCalledOnce();
            expect(runtimeMocks.installHttpBridge).toHaveBeenCalledOnce();
        } finally {
            root.mockRestore();
        }
    });

    it('activates pre-1.9 JPDB settings from the async shared store', async () => {
        runtimeMocks.asyncStoredSettings = {
            apiKey: 'legacy-jpdb-key',
            parserProvider: 'jpdb',
        };

        await importUserscriptEntry();

        expectTargetOwnedRuntimeActivation();
    });

    it('keeps the untouched compatibility profile neutral without substantive Reader state', async () => {
        runtimeMocks.asyncStoredSettings = {
            onboardingSeen: false,
            languageProfiles: DEFAULT_SETTINGS.languageProfiles.map(profile => ({ ...profile })),
            activeLanguageProfileId: DEFAULT_SETTINGS.activeLanguageProfileId,
        };

        await importUserscriptEntry();

        expectTargetOwnedRuntimeInert();
    });

    it('keeps fresh hosted Study transport-private until its chooser completes', async () => {
        runtimeMocks.newTab = true;

        await importUserscriptEntry();

        expect(runtimeMocks.installStorageBridge).toHaveBeenCalledOnce();
        expect(runtimeMocks.installHttpBridge).not.toHaveBeenCalled();
        expect(runtimeMocks.bootReaderApp).not.toHaveBeenCalled();

        await dispatchSettingsChoice(true);
        expect(runtimeMocks.installHttpBridge).toHaveBeenCalledOnce();
    });

    it('activates target-owned bridges for an explicit page-owned docs or Academy policy', async () => {
        runtimeMocks.pageOwnedTarget = true;

        await importUserscriptEntry();

        expect(runtimeMocks.installStorageBridge).toHaveBeenCalledOnce();
        expect(runtimeMocks.installHttpBridge).toHaveBeenCalledOnce();
        expect(runtimeMocks.applyMokuroDefault).toHaveBeenCalledOnce();
    });
});
