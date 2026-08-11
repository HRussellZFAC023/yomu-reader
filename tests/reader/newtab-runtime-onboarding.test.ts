import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../src/reader/companions/register-build-companions';
import { NewTabRuntime } from '../../src/reader/newtab/runtime';
import {
    activeLearningTargetLanguage,
    resetActiveLearningTargetLanguage,
} from '../../src/reader/languages/active';
import {
    DEFAULT_SETTINGS,
    SETTINGS_STORAGE_KEY,
    endSettingsResetGuard,
} from '../../src/reader/settings';
import { installUserscriptGmStorageBridge, uninstallUserscriptGmStorageBridge } from '../../src/reader/userscript/storage-bridge';
import { rejectOnboardingTargetPersistence } from './helpers/rejected-onboarding-target';

function prepareRenderingRuntime(
    runtime: NewTabRuntime,
    renderPage: () => Promise<unknown> = vi.fn(async () => undefined),
): Record<string, unknown> {
    const internals = runtime as unknown as Record<string, unknown>;
    internals.installExternalRefreshListener = vi.fn();
    internals.factoryReset = { bind: vi.fn(), destroy: vi.fn() };
    internals.createNewTabController = vi.fn(() => ({
        renderPage,
        isCurrentPage: vi.fn(() => true),
        destroy: vi.fn(),
    }));
    internals.refreshDictionaryStyles = vi.fn(async () => undefined);
    internals.scheduleAnkiStatusWarmup = vi.fn();
    internals.installCardStateSignalSubscription = vi.fn();
    internals.installSettingsStorageSubscription = vi.fn();
    internals.settingsDialog = { resumePendingCloudSettingsSync: vi.fn(async () => undefined) };
    return internals;
}

function storeRuntimeSettings(overrides: Partial<typeof DEFAULT_SETTINGS>): void {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, ...overrides }));
}

function replaceOnboardingWithDismissal(internals: Record<string, unknown>) {
    const showIfNeeded = vi.fn(async () => true);
    internals.onboarding = {
        showIfNeeded,
        waitForCompletion: vi.fn(async () => undefined),
    };
    return showIfNeeded;
}

function prepareOrderedRuntime(calls: string[]): {
    runtime: NewTabRuntime;
    internals: Record<string, unknown>;
} {
    const runtime = new NewTabRuntime();
    return {
        runtime,
        internals: prepareRenderingRuntime(
            runtime,
            vi.fn(async () => { calls.push('render'); }),
        ),
    };
}

describe('packaged Study welcome integration', () => {
    afterEach(() => {
        uninstallUserscriptGmStorageBridge();
        endSettingsResetGuard();
        resetActiveLearningTargetLanguage();
        document.body.replaceChildren();
        document.documentElement.removeAttribute('data-yomu-newtab-runtime');
        localStorage.clear();
        window.history.replaceState({}, '', '/');
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('constructs the real welcome controller without a new-tab takeover option', async () => {
        vi.stubGlobal('chrome', { runtime: { id: 'test-extension-id' } });
        const runtime = new NewTabRuntime();
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            onboarding: { showIfNeeded(): Promise<boolean> };
        };
        internals.settings = { ...DEFAULT_SETTINGS, onboardingSeen: false };

        await expect(internals.onboarding.showIfNeeded()).resolves.toBe(true);

        expect(document.querySelector('.jpdb-reader-onboarding')).not.toBeNull();
        expect(document.querySelector('input[name="newTabEnabled"]')).toBeNull();
        expect(document.body.textContent).not.toContain('Set Study as the new tab');
    });

    it('starts standalone and embedded Study at the first configured learning step', () => {
        const standalone = new NewTabRuntime() as unknown as {
            createNewTabController(): { initialStudyStepIdPending: string | null };
        };
        const academy = new NewTabRuntime({ mountHost: document.createElement('main') }) as unknown as {
            createNewTabController(): { initialStudyStepIdPending: string | null };
        };

        expect(standalone.createNewTabController().initialStudyStepIdPending).toBeNull();
        expect(academy.createNewTabController().initialStudyStepIdPending).toBeNull();
    });

    it('waits for an explicit target before rendering the packaged Study surface', async () => {
        vi.stubGlobal('chrome', { runtime: { id: 'test-extension-id' } });
        storeRuntimeSettings({
            onboardingSeen: false,
            localDictionariesEnabled: false,
        });
        const calls: string[] = [];
        const { runtime, internals } = prepareOrderedRuntime(calls);
        internals.onboarding = {
            showIfNeeded: vi.fn(async () => { calls.push('welcome'); return true; }),
            waitForCompletion: vi.fn(async () => {
                calls.push('choose-target');
                internals.settings = {
                    ...(internals.settings as typeof DEFAULT_SETTINGS),
                    onboardingSeen: true,
                    learningTargetChosen: true,
                };
            }),
        };

        await runtime.init();

        expect(calls).toEqual(['welcome', 'choose-target', 'render']);
    });

    it('leaves fresh public Study inert when the chooser is dismissed', async () => {
        storeRuntimeSettings({
            onboardingSeen: false,
            learningTargetChosen: false,
            localDictionariesEnabled: true,
        });
        const runtime = new NewTabRuntime();
        const renderPage = vi.fn(async () => undefined);
        const prepareTermSearchIndex = vi.fn(async () => undefined);
        const internals = prepareRenderingRuntime(runtime, renderPage);
        // "Not now": resolved wait, but no settings write or promotion.
        const showIfNeeded = replaceOnboardingWithDismissal(internals);
        internals.dictionaries = { prepareTermSearchIndex };
        internals.refreshDictionaryStyles = vi.fn(async () => undefined);

        await runtime.init();

        expect(showIfNeeded).toHaveBeenCalledOnce();
        expect(internals.createNewTabController).not.toHaveBeenCalled();
        expect(renderPage).not.toHaveBeenCalled();
        expect(prepareTermSearchIndex).not.toHaveBeenCalled();
        expect((internals.settings as typeof DEFAULT_SETTINGS).learningTargetChosen).toBe(false);
    });

    it('keeps a rejected standalone Study target inert and asks again on reload', async () => {
        storeRuntimeSettings({
            onboardingSeen: false,
            learningTargetChosen: false,
            localDictionariesEnabled: false,
        });
        const runtime = new NewTabRuntime();
        let internals = prepareRenderingRuntime(runtime);
        const initializing = runtime.init();
        await vi.waitFor(() => {
            expect(document.querySelector('.jpdb-reader-onboarding')).not.toBeNull();
        });
        await rejectOnboardingTargetPersistence(internals.onboarding as {
            complete(openSettings: boolean | 'dictionaries'): Promise<void>;
        });
        document.querySelector<HTMLButtonElement>('[data-onboarding-action="close"]')?.click();
        await initializing;

        expect((internals.settings as typeof DEFAULT_SETTINGS).learningTargetChosen).toBe(false);
        expect((internals.settings as typeof DEFAULT_SETTINGS).languageProfiles[0]?.targetLanguage).toBe('ja');
        expect(activeLearningTargetLanguage()).toBe('ja');
        expect(internals.createNewTabController).not.toHaveBeenCalled();

        endSettingsResetGuard();
        runtime.destroy();
        document.body.replaceChildren();
        const reloadedRuntime = new NewTabRuntime();
        internals = prepareRenderingRuntime(reloadedRuntime);
        const reloading = reloadedRuntime.init();
        await vi.waitFor(() => {
            expect(document.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')?.value).toBe('');
        });
        document.querySelector<HTMLButtonElement>('[data-onboarding-action="close"]')?.click();
        await reloading;
        expect(internals.createNewTabController).not.toHaveBeenCalled();
        reloadedRuntime.destroy();
    });

    it('renders empty-store Academy only with its explicit non-persisted page policy', async () => {
        storeRuntimeSettings({
            localDictionariesEnabled: false,
        });
        const host = document.createElement('main');
        const runtime = new NewTabRuntime({ mountHost: host, pageOwnedLearningTarget: 'ja' });
        const renderPage = vi.fn(async () => undefined);
        const internals = prepareRenderingRuntime(runtime, renderPage);
        const showIfNeeded = replaceOnboardingWithDismissal(internals);

        await runtime.init();

        expect(renderPage).toHaveBeenCalledOnce();
        expect(showIfNeeded).not.toHaveBeenCalled();
        expect((internals.settings as typeof DEFAULT_SETTINGS).learningTargetChosen).toBe(false);
    });

    it('applies Academy Japanese as a transient runtime target over an unchosen partial profile', async () => {
        storeRuntimeSettings({
            learningTargetChosen: false,
            localDictionariesEnabled: false,
            languageProfiles: DEFAULT_SETTINGS.languageProfiles.map(profile => ({
                ...profile,
                targetLanguage: 'es',
            })),
        });
        const runtime = new NewTabRuntime({
            mountHost: document.createElement('main'),
            pageOwnedLearningTarget: 'ja',
        });
        const internals = prepareRenderingRuntime(runtime);

        await runtime.init();

        expect(activeLearningTargetLanguage()).toBe('ja');
        expect((internals.settings as typeof DEFAULT_SETTINGS).learningTargetChosen).toBe(false);
        expect((internals.settings as typeof DEFAULT_SETTINGS).languageProfiles[0]?.targetLanguage).toBe('es');
    });

    it('keeps an empty-store generic embedded Study mount inert', async () => {
        storeRuntimeSettings({
            localDictionariesEnabled: false,
        });
        const runtime = new NewTabRuntime({ mountHost: document.createElement('main') });
        const internals = runtime as unknown as Record<string, unknown>;
        internals.installExternalRefreshListener = vi.fn();
        internals.factoryReset = { bind: vi.fn(), destroy: vi.fn() };
        internals.createNewTabController = vi.fn();

        await runtime.init();

        expect(internals.createNewTabController).not.toHaveBeenCalled();
    });

    it('opens account settings from the Firefox-safe Study link after welcome', async () => {
        vi.stubGlobal('browser', { runtime: { id: 'yomu@yomureader.com' } });
        window.history.replaceState({}, '', '/newtab/index.html#settings=api');
        storeRuntimeSettings({
            onboardingSeen: true,
            learningTargetChosen: true,
            localDictionariesEnabled: false,
        });
        const calls: string[] = [];
        const { runtime, internals } = prepareOrderedRuntime(calls);
        internals.onboarding = {
            showIfNeeded: vi.fn(async () => { calls.push('welcome'); return false; }),
            waitForCompletion: vi.fn(async () => undefined),
        };
        internals.settingsDialog = {
            open: vi.fn((panel: string) => { calls.push(`settings:${panel}`); }),
            resumePendingCloudSettingsSync: vi.fn(async () => undefined),
        };

        await runtime.init();

        expect(calls).toEqual(['render', 'settings:api']);
        expect(location.hash).toBe('');
    });

    it('reloads settings when a late userscript storage bridge reaches the Study runtime', async () => {
        window.history.replaceState({}, '', '/newtab/index.html');
        const runtime = new NewTabRuntime();
        const applyRemoteSettings = vi.fn(async () => undefined);
        const internals = runtime as unknown as {
            isDestroyed: boolean;
            applyRemoteSettings: typeof applyRemoteSettings;
            installSettingsStorageSubscription(): void;
        };
        internals.isDestroyed = false;
        internals.applyRemoteSettings = applyRemoteSettings;
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            ...DEFAULT_SETTINGS,
            theme: 'dark',
            __yomuHostedPendingGmPatch: { theme: 'dark' },
        }));
        const shared = new Map<string, unknown>([[SETTINGS_STORAGE_KEY, { ...DEFAULT_SETTINGS, theme: 'light', popupMode: 'popover' }]]);
        vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => shared.has(key) ? shared.get(key) : fallback));
        vi.stubGlobal('GM_setValue', vi.fn((key: string, value: unknown) => { shared.set(key, value); }));

        internals.installSettingsStorageSubscription();
        installUserscriptGmStorageBridge();

        await vi.waitFor(
            () => expect(applyRemoteSettings).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark', popupMode: 'popover' })),
            { timeout: 10_000 },
        );
        expect(shared.get(SETTINGS_STORAGE_KEY)).toMatchObject({ theme: 'dark', popupMode: 'popover' });
        expect(shared.get(SETTINGS_STORAGE_KEY)).not.toHaveProperty('__yomuHostedPendingGmPatch');
        runtime.destroy();
    }, 15_000);
});
