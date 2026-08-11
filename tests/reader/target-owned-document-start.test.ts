import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeMocks = vi.hoisted(() => ({
    applyMokuroDefault: vi.fn(),
    bootReaderApp: vi.fn(),
    installMokuroNote: vi.fn(),
    installHttpBridge: vi.fn(),
    installStorageBridge: vi.fn(),
    installShadowBridge: vi.fn(),
    promoteHostedSettings: vi.fn(async () => undefined),
    asyncStoredSettings: null as Record<string, unknown> | null,
    syncStoredSettings: null as Record<string, unknown> | null,
    newTab: false,
    pageOwnedTarget: false,
}));

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
    gmStorageGet: async () => runtimeMocks.asyncStoredSettings,
    gmStorageGetSync: () => runtimeMocks.syncStoredSettings,
}));
vi.mock('../../src/reader/settings/index', async importOriginal => ({
    ...await importOriginal<typeof import('../../src/reader/settings/index')>(),
    promoteStrandedHostedSettingsToGmStorage: runtimeMocks.promoteHostedSettings,
}));

import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';

const TARGET_OWNED_DOCUMENT_START_EVENT = 'yomu:target-owned-document-start';
const SETTINGS_CHANGE_EVENT = 'yomu-settings-change';

async function importUserscriptEntry(): Promise<void> {
    await import('../../src/reader/userscript/entry');
    await Promise.resolve();
    await Promise.resolve();
}

function dispatchSettingsChoice(learningTargetChosen: boolean): void {
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT, {
        detail: { settings: { learningTargetChosen } },
    }));
}

function expectTargetOwnedRuntimeActivation(): void {
    expect(runtimeMocks.applyMokuroDefault).toHaveBeenCalledOnce();
    expect(runtimeMocks.installMokuroNote).toHaveBeenCalledOnce();
    expect(runtimeMocks.installHttpBridge).toHaveBeenCalledOnce();
    expect(runtimeMocks.installShadowBridge).not.toHaveBeenCalled();
}

function expectTargetOwnedCanvasActivation(canvasActivation: () => void): void {
    expectTargetOwnedRuntimeActivation();
    expect(canvasActivation).toHaveBeenCalledOnce();
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
        runtimeMocks.promoteHostedSettings.mockClear();
        runtimeMocks.asyncStoredSettings = null;
        runtimeMocks.syncStoredSettings = null;
        runtimeMocks.newTab = false;
        runtimeMocks.pageOwnedTarget = false;
    });

    it('keeps a fresh host inert when the target chooser is dismissed', async () => {
        const canvasActivation = vi.fn();
        window.addEventListener(TARGET_OWNED_DOCUMENT_START_EVENT, canvasActivation, { once: true });

        await importUserscriptEntry();
        dispatchSettingsChoice(false);

        expect(runtimeMocks.applyMokuroDefault).not.toHaveBeenCalled();
        expect(runtimeMocks.installMokuroNote).not.toHaveBeenCalled();
        expect(runtimeMocks.installHttpBridge).not.toHaveBeenCalled();
        expect(runtimeMocks.installStorageBridge).toHaveBeenCalledOnce();
        expect(runtimeMocks.installShadowBridge).not.toHaveBeenCalled();
        expect(canvasActivation).not.toHaveBeenCalled();

        // Complete the choice so the entry's one-shot listener cannot leak into
        // another test realm when Vitest deliberately runs without isolation.
        dispatchSettingsChoice(true);
        window.removeEventListener(TARGET_OWNED_DOCUMENT_START_EVENT, canvasActivation);
    });

    it('activates once when the learner explicitly chooses a target later', async () => {
        const canvasActivation = vi.fn();
        window.addEventListener(TARGET_OWNED_DOCUMENT_START_EVENT, canvasActivation);

        await importUserscriptEntry();
        dispatchSettingsChoice(true);
        dispatchSettingsChoice(true);

        expectTargetOwnedCanvasActivation(canvasActivation);
        window.removeEventListener(TARGET_OWNED_DOCUMENT_START_EVENT, canvasActivation);
    });

    it('preserves synchronous document-start activation for a stored explicit target', async () => {
        runtimeMocks.syncStoredSettings = { learningTargetChosen: true };
        const canvasActivation = vi.fn();
        window.addEventListener(TARGET_OWNED_DOCUMENT_START_EVENT, canvasActivation);

        await importUserscriptEntry();

        expectTargetOwnedCanvasActivation(canvasActivation);
        window.removeEventListener(TARGET_OWNED_DOCUMENT_START_EVENT, canvasActivation);
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

    it('activates positive legacy onboarding evidence from the async shared store', async () => {
        runtimeMocks.asyncStoredSettings = { onboardingSeen: true };

        await importUserscriptEntry();

        expectTargetOwnedRuntimeActivation();
    });

    it('does not treat the untouched compatibility profile as an explicit target', async () => {
        runtimeMocks.asyncStoredSettings = {
            onboardingSeen: false,
            languageProfiles: DEFAULT_SETTINGS.languageProfiles.map(profile => ({ ...profile })),
            activeLanguageProfileId: DEFAULT_SETTINGS.activeLanguageProfileId,
        };

        await importUserscriptEntry();

        expect(runtimeMocks.installHttpBridge).not.toHaveBeenCalled();
        expect(runtimeMocks.applyMokuroDefault).not.toHaveBeenCalled();
        dispatchSettingsChoice(true);
    });

    it('keeps fresh hosted Study transport-private until its chooser completes', async () => {
        runtimeMocks.newTab = true;

        await importUserscriptEntry();

        expect(runtimeMocks.installStorageBridge).toHaveBeenCalledOnce();
        expect(runtimeMocks.installHttpBridge).not.toHaveBeenCalled();
        expect(runtimeMocks.bootReaderApp).not.toHaveBeenCalled();

        dispatchSettingsChoice(true);
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
