import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import '../../src/reader/companions/register-build-companions';
import { NewTabRuntime, startNewTabRuntime } from '../../src/reader/newtab/runtime';

import {
    DEFAULT_SETTINGS,
    SETTINGS_STORAGE_KEY,
    endSettingsResetGuard,
    saveSettings,
} from '../../src/reader/settings';
import { installUserscriptGmStorageBridge, uninstallUserscriptGmStorageBridge } from '../../src/reader/userscript/storage-bridge';
import { v193UserscriptStore } from './helpers/upgrade-v193-corpus';

const COMPILER_STORAGE_PREFIX = 'usc_https_github_com_HRussellZFAC023_yomu_reader_';
const SETTINGS_INTENT_KEY = 'yomu:settings-intent:v2';
const SETTINGS_COMMIT_KEY = '__yomuSettingsPersistenceCommitV1';

function prepareRenderingRuntime(
    runtime: NewTabRuntime,
    renderPage: () => Promise<unknown> = vi.fn(async () => undefined),
    options: { realSettingsStorageSubscription?: boolean } = {},
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
    if (!options.realSettingsStorageSubscription) {
        internals.installSettingsStorageSubscription = vi.fn();
    }
    internals.settingsDialog = { resumePendingCloudSettingsSync: vi.fn(async () => undefined) };
    return internals;
}

function stubClonedGmValueReader(values: ReadonlyMap<string, unknown>): void {
    vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => (
        values.has(key) ? structuredClone(values.get(key)) : fallback
    )));
}

function installPackagedSettings(overrides: Partial<typeof DEFAULT_SETTINGS>): void {
    const values = new Map<string, unknown>([[
        SETTINGS_STORAGE_KEY,
        { ...DEFAULT_SETTINGS, ...overrides },
    ]]);
    const clone = <T>(value: T): T => structuredClone(value);
    vi.stubGlobal('browser', {
        runtime: { id: 'yomu@yomureader.com' },
        storage: { local: {
            get: vi.fn(async (key: string | null) => key === null
                ? Object.fromEntries([...values].map(([name, value]) => [name, clone(value)]))
                : values.has(key) ? { [key]: clone(values.get(key)) } : {}),
            set: vi.fn(async (items: Record<string, unknown>) => {
                for (const [key, value] of Object.entries(items)) values.set(key, clone(value));
            }),
            remove: vi.fn(async (key: string) => { values.delete(key); }),
        } },
    });
}

interface SettingsStartupHarness {
    readonly values: Map<string, unknown>;
    readonly rawGet: Mock<[key: string | null], Promise<Record<string, unknown>>>;
    readonly rawSet: Mock<[updates: Record<string, unknown>], Promise<void>>;
    readonly rawRemove: Mock<[key: string], Promise<void>>;
    readonly gmSet: Mock<[key: string, value: unknown], void>;
    readonly gmDelete: Mock<[key: string], void>;
    readonly allowReads: () => void;
}

function installSettingsStartupHarness(
    readable: boolean,
    options: { readonly stableTornPair?: boolean } = {},
): SettingsStartupHarness {
    const torn = options.stableTornPair === true;
    let available = readable || torn;
    const values = new Map<string, unknown>([
        [SETTINGS_STORAGE_KEY, { apiKey: 'raw-startup-secret' }],
        [SETTINGS_INTENT_KEY, { revision: 1, records: {} }],
        [`${COMPILER_STORAGE_PREFIX}${SETTINGS_STORAGE_KEY}`, {
            ...DEFAULT_SETTINGS, [SETTINGS_COMMIT_KEY]: 'current-settings',
        }],
        [`${COMPILER_STORAGE_PREFIX}${SETTINGS_INTENT_KEY}`, {
            revision: 1, records: {}, [SETTINGS_COMMIT_KEY]: torn ? 'different-current-intent' : 'current-settings',
        }],
    ]);
    const rawGet = vi.fn(async (_key: string | null): Promise<Record<string, unknown>> => {
        throw new Error('Raw settings must not be inspected');
    });
    const rawSet = vi.fn(async (updates: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(updates)) values.set(key, value);
    });
    const rawRemove = vi.fn(async (key: string) => { values.delete(key); });
    const gmSet = vi.fn((key: string, value: unknown) => {
        values.set(`${COMPILER_STORAGE_PREFIX}${key}`, value);
    });
    const gmDelete = vi.fn((key: string) => { values.delete(`${COMPILER_STORAGE_PREFIX}${key}`); });
    vi.stubGlobal('location', {
        protocol: 'moz-extension:', origin: 'null', hostname: 'yomu-test',
        pathname: '/newtab/index.html', href: 'moz-extension://yomu-test/newtab/index.html', reload: vi.fn(),
    });
    vi.stubGlobal('browser', {
        runtime: { id: 'yomu@yomureader.com' },
        storage: { local: { get: rawGet, set: rawSet, remove: rawRemove } },
    });
    vi.stubGlobal('__YOMU_EXTENSION_STUDY_STORAGE_RUNTIME__', true);
    vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => {
        if (!available) throw new Error('current backend unavailable');
        const physicalKey = `${COMPILER_STORAGE_PREFIX}${key}`;
        return values.has(physicalKey) ? values.get(physicalKey) : fallback;
    }));
    vi.stubGlobal('GM_setValue', gmSet);
    vi.stubGlobal('GM_deleteValue', gmDelete);
    vi.stubGlobal('GM_listValues', vi.fn(() => []));
    return { values, rawGet, rawSet, rawRemove, gmSet, gmDelete, allowReads: () => { available = true; } };
}

function expectNoCanonicalSettingsMutation(
    harness: Pick<SettingsStartupHarness, 'gmSet' | 'gmDelete'>,
): void {
    const settingsKeys = new Set([SETTINGS_STORAGE_KEY, SETTINGS_INTENT_KEY]);
    expect(harness.gmSet.mock.calls.some(([key]) => (
        typeof key === 'string' && settingsKeys.has(key)
    ))).toBe(false);
    expect(harness.gmDelete.mock.calls.some(([key]) => (
        typeof key === 'string' && settingsKeys.has(key)
    ))).toBe(false);
}

function expectRawSettingsUntouched(harness: SettingsStartupHarness, rawBefore: unknown): void {
    expect(harness.values.get(SETTINGS_STORAGE_KEY)).toEqual(rawBefore);
    expect(harness.rawGet).not.toHaveBeenCalled();
    expect(harness.rawSet).not.toHaveBeenCalled();
    expect(harness.rawRemove).not.toHaveBeenCalled();
    expectNoCanonicalSettingsMutation(harness);
}

function expectRecoveryStartupReady(createRuntime: unknown, init: unknown): void {
    expect(document.querySelector('[data-extension-settings-recovery="blocked"]')).toBeNull();
    expect(createRuntime).toHaveBeenCalledOnce();
    expect(init).toHaveBeenCalledOnce();
}

function startRecoveryTestRuntime() {
    const init = vi.fn(async () => undefined);
    const createRuntime = vi.fn(() => ({ init, destroy: vi.fn() }));
    const starting = startNewTabRuntime({
        ensureStorageCurrent: vi.fn(async () => undefined),
        createRuntime,
        registerPagehide: vi.fn(),
    });
    return { init, createRuntime, starting };
}

async function waitForRecoveryAlert(): Promise<HTMLElement> {
    await vi.waitFor(() => {
        expect(document.querySelector('[data-extension-settings-recovery="blocked"]'))
            .not.toBeNull();
    });
    return document.querySelector<HTMLElement>('[data-extension-settings-recovery="blocked"]')!;
}

async function unblockRecoveryWithChosenCanonical(
    harness: Pick<SettingsStartupHarness, 'values' | 'allowReads'>,
    alert: HTMLElement,
    starting: Promise<void>,
): Promise<void> {
    harness.values.set(`${COMPILER_STORAGE_PREFIX}${SETTINGS_STORAGE_KEY}`, {
        ...DEFAULT_SETTINGS,
        [SETTINGS_COMMIT_KEY]: 'ready-current',
    });
    harness.values.set(`${COMPILER_STORAGE_PREFIX}${SETTINGS_INTENT_KEY}`, {
        revision: 1,
        records: {},
        [SETTINGS_COMMIT_KEY]: 'ready-current',
    });
    harness.allowReads();
    alert.querySelector<HTMLButtonElement>('[data-recovery-action="retry"]')!.click();
    await starting;
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

function recordOpenedSettings(internals: Record<string, unknown>, calls: string[]): void {
    internals.settingsDialog = {
        open: vi.fn((panel: string) => { calls.push(`settings:${panel}`); }),
        resumePendingCloudSettingsSync: vi.fn(async () => undefined),
    };
}

describe('packaged Study startup and settings recovery', () => {
    afterEach(() => {
        uninstallUserscriptGmStorageBridge();
        endSettingsResetGuard();

        document.body.replaceChildren();
        document.documentElement.removeAttribute('data-yomu-newtab-runtime');
        localStorage.clear();
        window.history.replaceState({}, '', '/');
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it.each([false, true])('renders fresh Study immediately with embedded=%s and no setup gate', async embedded => {
        const renderPage = vi.fn(async () => undefined);
        const runtime = new NewTabRuntime(embedded ? { mountHost: document.createElement('main') } : {});
        prepareRenderingRuntime(runtime, renderPage);
        try {
            await runtime.init();
            expect(renderPage).toHaveBeenCalledOnce();
            expect(document.querySelector('.jpdb-reader-onboarding')).toBeNull();
            expect(document.querySelector('select[name="targetLanguage"]')).toBeNull();
        } finally {
            runtime.destroy();
        }
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

    it('blocks full Study startup when current settings cannot be read', async () => {
        const harness = installSettingsStartupHarness(false);
        const rawBefore = structuredClone(harness.values.get(SETTINGS_STORAGE_KEY));
        const backgroundButton = document.createElement('button');
        backgroundButton.textContent = 'existing Study control';
        document.body.append(backgroundButton);
        const { init, createRuntime, starting } = startRecoveryTestRuntime();
        const alert = await waitForRecoveryAlert();
        expect(alert.matches('[role="alert"]')).toBe(true);
        expect(alert.textContent).toContain('Could not load settings');
        expect(alert.textContent).toContain('Your saved settings have not been changed.');
        expect(alert.textContent).not.toContain('backup');
        expect(alert.textContent).not.toContain('downgrade');
        expect(alert.querySelector('[data-recovery-action="retry"]')).not.toBeNull();
        expect(alert.querySelector('[data-recovery-action="reload"]')).not.toBeNull();
        expect(backgroundButton.inert).toBe(true);
        expect(document.activeElement).toBe(alert.querySelector('[data-recovery-action="retry"]'));
        expect(document.querySelector('.jpdb-reader-onboarding')).toBeNull();
        expect(createRuntime).not.toHaveBeenCalled();
        expect(init).not.toHaveBeenCalled();
        expectRawSettingsUntouched(harness, rawBefore);

        alert.querySelector<HTMLButtonElement>('[data-recovery-action="reload"]')!.click();
        expect(location.reload).toHaveBeenCalledOnce();

        alert.querySelector<HTMLButtonElement>('[data-recovery-action="retry"]')!.click();
        await vi.waitFor(() => {
            expect(alert.querySelector('[data-recovery-status]')?.textContent)
                .toContain('still unavailable');
        });
        expect(document.querySelectorAll('[data-extension-settings-recovery="blocked"]')).toHaveLength(1);
        expect(createRuntime).not.toHaveBeenCalled();

        await unblockRecoveryWithChosenCanonical(harness, alert, starting);

        expectRecoveryStartupReady(createRuntime, init);
        expectRawSettingsUntouched(harness, rawBefore);
        expect(backgroundButton.inert).toBe(false);
    });

    it('blocks before runtime and onboarding when current settings and intent commits are torn', async () => {
        const harness = installSettingsStartupHarness(false, { stableTornPair: true });
        const rawSettingsBefore = structuredClone(harness.values.get(SETTINGS_STORAGE_KEY));
        const rawIntentBefore = structuredClone(harness.values.get(SETTINGS_INTENT_KEY));
        const { init, createRuntime, starting } = startRecoveryTestRuntime();
        const alert = await waitForRecoveryAlert();
        expect(alert.textContent).toContain('Could not load settings');
        expect(alert.textContent).not.toContain('raw-startup-secret');
        expect(document.body.textContent).not.toContain('raw-startup-secret');
        expect(document.querySelector('.jpdb-reader-onboarding')).toBeNull();
        expect(createRuntime).not.toHaveBeenCalled();
        expect(init).not.toHaveBeenCalled();
        expect(harness.values.get(SETTINGS_STORAGE_KEY)).toEqual(rawSettingsBefore);
        expect(harness.values.get(SETTINGS_INTENT_KEY)).toEqual(rawIntentBefore);
        expect(harness.values.get(`${COMPILER_STORAGE_PREFIX}${SETTINGS_STORAGE_KEY}`)).toHaveProperty(SETTINGS_COMMIT_KEY, 'current-settings');
        expect(harness.values.get(`${COMPILER_STORAGE_PREFIX}${SETTINGS_INTENT_KEY}`)).toHaveProperty(SETTINGS_COMMIT_KEY, 'different-current-intent');
        expectRawSettingsUntouched(harness, rawSettingsBefore);

        await unblockRecoveryWithChosenCanonical(harness, alert, starting);

        expectRecoveryStartupReady(createRuntime, init);
        expect(harness.values.get(SETTINGS_STORAGE_KEY)).toEqual(rawSettingsBefore);
        expect(harness.values.get(SETTINGS_INTENT_KEY)).toEqual(rawIntentBefore);
        expect(harness.rawSet).not.toHaveBeenCalled();
        expect(harness.rawRemove).not.toHaveBeenCalled();
    });

    it('continues full Study startup without probing the raw namespace', async () => {
        const harness = installSettingsStartupHarness(true);
        const rawBefore = structuredClone(harness.values.get(SETTINGS_STORAGE_KEY));
        const { init, createRuntime, starting } = startRecoveryTestRuntime();

        await starting;

        expectRecoveryStartupReady(createRuntime, init);
        expectRawSettingsUntouched(harness, rawBefore);
    });

    it('starts straight into Study on the unmarked store v1.9.3 left', async () => {
        vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
        const store = v193UserscriptStore('b-userscript-machine-only-unmarked');
        const before = structuredClone(Object.fromEntries(store));
        stubClonedGmValueReader(store);
        const renderPage = vi.fn(async () => undefined);
        const runtime = new NewTabRuntime();
        const internals = prepareRenderingRuntime(runtime, renderPage);

        await runtime.init();

        expect(document.querySelector('.jpdb-reader-onboarding')).toBeNull();
        expect(renderPage).toHaveBeenCalledOnce();
        expect(internals.settings).toMatchObject({
            apiKey: 'corpus0000000000000000000000jpdb',
            theme: 'dark',
            });
        expect(Object.fromEntries(store)).toEqual(before);
        runtime.destroy();
    });

    it('renders the packaged Study recovery block in Japanese for a Japanese interface locale', async () => {
        vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ja-JP']);
        const harness = installSettingsStartupHarness(false);
        const { starting } = startRecoveryTestRuntime();
        const alert = await waitForRecoveryAlert();
        expect(alert.textContent).toContain('設定を読み込めませんでした');
        expect(alert.textContent).toContain('保存済みの設定は変更されていません。');
        expect(alert.textContent).not.toContain('バックアップ');

        await unblockRecoveryWithChosenCanonical(harness, alert, starting);
    });

    it('keeps the Academy interface language page-owned across storage reconciliation', async () => {
        vi.stubGlobal('location', new URL('https://yomureader.com/academy/'));
        const storedSettings = {
            ...DEFAULT_SETTINGS,
            localDictionariesEnabled: false,
            interfaceLanguage: 'ja' as const,
        };
        const shared = new Map<string, unknown>([[SETTINGS_STORAGE_KEY, storedSettings]]);
        const listeners = new Map<string, (...args: unknown[]) => void>();
        stubClonedGmValueReader(shared);
        vi.stubGlobal('GM_addValueChangeListener', vi.fn((
            key: string,
            listener: (...args: unknown[]) => void,
        ) => {
            listeners.set(key, listener);
            return key;
        }));
        vi.stubGlobal('GM_removeValueChangeListener', vi.fn());

        const host = document.createElement('main');
        const runtime = new NewTabRuntime({
            mountHost: host,
            interfaceLanguage: 'en',
        });
        const renderPage = vi.fn(async () => undefined);
        const internals = prepareRenderingRuntime(runtime, renderPage, {
            realSettingsStorageSubscription: true,
        });

        await runtime.init();
        await vi.waitFor(() => expect(renderPage).toHaveBeenCalled());
        expect((internals.settings as typeof DEFAULT_SETTINGS).interfaceLanguage).toBe('en');
        expect(host.lang).toBe('en');

        const updatedSettings = { ...storedSettings, theme: 'dark' as const };
        shared.set(SETTINGS_STORAGE_KEY, updatedSettings);
        listeners.get(SETTINGS_STORAGE_KEY)?.(
            SETTINGS_STORAGE_KEY,
            storedSettings,
            updatedSettings,
            true,
        );

        await vi.waitFor(() => {
            expect((internals.settings as typeof DEFAULT_SETTINGS).theme).toBe('dark');
        });
        expect((internals.settings as typeof DEFAULT_SETTINGS).interfaceLanguage).toBe('en');
        expect(host.lang).toBe('en');
        runtime.destroy();
    });

    it('opens account settings from the Firefox-safe Study link after welcome', async () => {
        window.history.replaceState({}, '', '/newtab/index.html#settings=api');
        installPackagedSettings({
            localDictionariesEnabled: false,
        });
        const calls: string[] = [];
        const { runtime, internals } = prepareOrderedRuntime(calls);
        internals.onboarding = {
            showIfNeeded: vi.fn(async () => { calls.push('welcome'); return false; }),
            waitForCompletion: vi.fn(async () => undefined),
        };
        recordOpenedSettings(internals, calls);

        await runtime.init();

        expect(calls).toEqual(['render', 'settings:api']);
        expect(location.hash).toBe('');
    });

    it('captures packaged Appearance settings before render replaces the requested hash', async () => {
        window.history.replaceState({}, '', '/newtab/index.html#settings=appearance');
        installPackagedSettings({
            localDictionariesEnabled: false,
        });
        const calls: string[] = [];
        const runtime = new NewTabRuntime();
        const renderPage = vi.fn(async () => {
            calls.push('render');
            expect(location.hash).toBe('');
            window.history.replaceState(
                window.history.state,
                '',
                '/newtab/index.html#review=study-card-1',
            );
        });
        const internals = prepareRenderingRuntime(runtime, renderPage);
        recordOpenedSettings(internals, calls);

        await runtime.init();

        expect(calls).toEqual(['render', 'settings:appearance']);
        expect(location.hash).toBe('#review=study-card-1');
    });

    it('reloads settings when a late userscript storage bridge reaches the Study runtime', async () => {
        vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
        const runtime = new NewTabRuntime();
        const applyRemoteSettings = vi.fn(async () => undefined);
        const internals = runtime as unknown as {
            isDestroyed: boolean;
            applyRemoteSettings: typeof applyRemoteSettings;
            installSettingsStorageSubscription(): void;
        };
        internals.isDestroyed = false;
        internals.applyRemoteSettings = applyRemoteSettings;
        await saveSettings({
            ...DEFAULT_SETTINGS,
            theme: 'dark',
            popupMode: 'sheet',
        }, { explicitUserChoiceKeys: ['theme'] });
        expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}')).toMatchObject({ theme: 'dark' });
        const sharedSettings = { ...DEFAULT_SETTINGS, theme: 'light', popupMode: 'popover' };
        const shared = new Map<string, unknown>([[SETTINGS_STORAGE_KEY, structuredClone(sharedSettings)]]);
        vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => shared.has(key) ? shared.get(key) : fallback));
        vi.stubGlobal('GM_setValue', vi.fn((key: string, value: unknown) => { shared.set(key, value); }));

        internals.installSettingsStorageSubscription();
        installUserscriptGmStorageBridge();

        // The installed store is the one authority (ADR-0012): page-local hosted
        // storage is not merged into it when the bridge arrives.
        await vi.waitFor(
            () => expect(applyRemoteSettings).toHaveBeenCalledWith(expect.objectContaining({ theme: 'light', popupMode: 'popover' })),
            { timeout: 10_000 },
        );
        expect(shared.get(SETTINGS_STORAGE_KEY)).toEqual(sharedSettings);
        runtime.destroy();
    }, 15_000);

    it('does not show or commit onboarding when the hosted settings authority rejects startup', async () => {
        vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
        const runtime = new NewTabRuntime();
        prepareRenderingRuntime(runtime);
        const getValue = vi.fn(() => {
            throw new Error('hosted settings authority unavailable');
        });
        vi.stubGlobal('GM_getValue', getValue);
        const setValue = vi.fn();
        vi.stubGlobal('GM_setValue', setValue);

        await expect(runtime.init()).rejects.toThrow('hosted settings authority unavailable');

        expect(getValue).toHaveBeenCalled();
        expect(setValue).not.toHaveBeenCalled();
        expect(document.querySelector('.jpdb-reader-onboarding')).toBeNull();
        expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
        runtime.destroy();
    });
});
