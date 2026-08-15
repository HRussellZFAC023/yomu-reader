import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import '../../src/reader/companions/register-build-companions';
import { NewTabRuntime, startNewTabRuntime } from '../../src/reader/newtab/runtime';
import {
    activeLearningTargetLanguage,
    resetActiveLearningTargetLanguage,
} from '../../src/reader/languages/active';
import {
    DEFAULT_SETTINGS,
    SETTINGS_STORAGE_KEY,
    endSettingsResetGuard,
} from '../../src/reader/settings';
import { gmStorageSet } from '../../src/reader/app/storage';
import { installUserscriptGmStorageBridge, uninstallUserscriptGmStorageBridge } from '../../src/reader/userscript/storage-bridge';
import { rejectOnboardingTargetPersistence } from './helpers/rejected-onboarding-target';

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

function storeRuntimeSettings(overrides: Partial<typeof DEFAULT_SETTINGS>): void {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, ...overrides }));
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

interface FailedRawRecoveryHarness {
    readonly values: Map<string, unknown>;
    readonly rawSet: Mock<[updates: Record<string, unknown>], Promise<void>>;
    readonly rawRemove: Mock<[key: string], Promise<void>>;
    readonly gmSet: Mock<[key: string, value: unknown], void>;
    readonly gmDelete: Mock<[key: string], void>;
}

function installFailedRawRecoveryHarness(
    canonicalChosen: boolean,
    options: { readonly stableTornPair?: boolean } = {},
): FailedRawRecoveryHarness {
    const stableTornPair = options.stableTornPair === true;
    const rawSettings = {
        ...DEFAULT_SETTINGS,
        learningTargetChosen: true,
        onboardingSeen: true,
        apiKey: 'raw-startup-secret',
        ...(stableTornPair ? { [SETTINGS_COMMIT_KEY]: 'raw-settings-commit' } : {}),
    };
    const intent = {
        revision: 1,
        records: {},
        ...(stableTornPair ? { [SETTINGS_COMMIT_KEY]: 'raw-intent-commit' } : {}),
    };
    const values = new Map<string, unknown>([
        [SETTINGS_STORAGE_KEY, rawSettings],
        [SETTINGS_INTENT_KEY, intent],
    ]);
    if (canonicalChosen) {
        values.set(`${COMPILER_STORAGE_PREFIX}${SETTINGS_STORAGE_KEY}`, {
            ...DEFAULT_SETTINGS,
            learningTargetChosen: true,
            onboardingSeen: true,
        });
        values.set(`${COMPILER_STORAGE_PREFIX}${SETTINGS_INTENT_KEY}`, intent);
    }
    const rawGet = vi.fn(async (key: string | null) => {
        if (!stableTornPair && key === SETTINGS_INTENT_KEY) throw new Error('raw adapter unavailable');
        return rawExtensionStorageSelection(values, key);
    });
    const rawSet = vi.fn(async (updates: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(updates)) values.set(key, value);
    });
    const rawRemove = vi.fn(async (key: string) => { values.delete(key); });
    const gmSet = vi.fn((key: string, value: unknown) => {
        values.set(`${COMPILER_STORAGE_PREFIX}${key}`, value);
    });
    const gmDelete = vi.fn((key: string) => {
        values.delete(`${COMPILER_STORAGE_PREFIX}${key}`);
    });
    vi.stubGlobal('location', {
        protocol: 'moz-extension:',
        origin: 'null',
        hostname: 'yomu-test',
        pathname: '/newtab/index.html',
        href: 'moz-extension://yomu-test/newtab/index.html',
        reload: vi.fn(),
    });
    vi.stubGlobal('browser', {
        runtime: { id: 'yomu@yomureader.com' },
        storage: { local: { get: rawGet, set: rawSet, remove: rawRemove } },
    });
    vi.stubGlobal('__YOMU_EXTENSION_STUDY_STORAGE_RUNTIME__', true);
    vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => {
        const physicalKey = `${COMPILER_STORAGE_PREFIX}${key}`;
        return values.has(physicalKey) ? values.get(physicalKey) : fallback;
    }));
    vi.stubGlobal('GM_setValue', gmSet);
    vi.stubGlobal('GM_deleteValue', gmDelete);
    vi.stubGlobal('GM_listValues', vi.fn(() => []));
    return { values, rawSet, rawRemove, gmSet, gmDelete };
}

function rawExtensionStorageSelection(
    values: ReadonlyMap<string, unknown>,
    key: string | null,
): Record<string, unknown> {
    if (key === null) return Object.fromEntries(values);
    if (!values.has(key)) return {};
    return { [key]: values.get(key) };
}

function expectNoCanonicalSettingsMutation(
    harness: Pick<FailedRawRecoveryHarness, 'gmSet' | 'gmDelete'>,
): void {
    const settingsKeys = new Set([SETTINGS_STORAGE_KEY, SETTINGS_INTENT_KEY]);
    expect(harness.gmSet.mock.calls.some(([key]) => (
        typeof key === 'string' && settingsKeys.has(key)
    ))).toBe(false);
    expect(harness.gmDelete.mock.calls.some(([key]) => (
        typeof key === 'string' && settingsKeys.has(key)
    ))).toBe(false);
}

function expectRawSettingsUntouched(harness: FailedRawRecoveryHarness, rawBefore: unknown): void {
    expect(harness.values.get(SETTINGS_STORAGE_KEY)).toEqual(rawBefore);
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
    harness: Pick<FailedRawRecoveryHarness, 'values'>,
    alert: HTMLElement,
    starting: Promise<void>,
): Promise<void> {
    harness.values.set(`${COMPILER_STORAGE_PREFIX}${SETTINGS_STORAGE_KEY}`, {
        ...DEFAULT_SETTINGS,
        learningTargetChosen: true,
        onboardingSeen: true,
    });
    harness.values.set(`${COMPILER_STORAGE_PREFIX}${SETTINGS_INTENT_KEY}`, {
        revision: 1,
        records: {},
    });
    alert.querySelector<HTMLButtonElement>('[data-recovery-action="retry"]')!.click();
    await starting;
}

const RAW_ACADEMY_READER_DEFAULTS = {
    learningTargetChosen: false,
    showFurigana: true,
    furiganaMode: 'all',
    showPitchAccent: true,
} as const;

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

function recordOpenedSettings(internals: Record<string, unknown>, calls: string[]): void {
    internals.settingsDialog = {
        open: vi.fn((panel: string) => { calls.push(`settings:${panel}`); }),
        resumePendingCloudSettingsSync: vi.fn(async () => undefined),
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
        vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
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

    it('blocks full Study startup before onboarding when raw chosen settings cannot be recovered', async () => {
        const harness = installFailedRawRecoveryHarness(false);
        const rawBefore = structuredClone(harness.values.get(SETTINGS_STORAGE_KEY));
        const backgroundButton = document.createElement('button');
        backgroundButton.textContent = 'existing Study control';
        document.body.append(backgroundButton);
        const { init, createRuntime, starting } = startRecoveryTestRuntime();
        const alert = await waitForRecoveryAlert();
        expect(alert.matches('[role="alert"]')).toBe(true);
        expect(alert.textContent).toContain('Study paused to protect your settings');
        expect(alert.textContent).toContain('existing data was retained unchanged');
        expect(alert.textContent).toContain('latest settings backup');
        expect(alert.textContent).toContain('Do not use Factory Reset or downgrade Yomu');
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

    it('blocks before runtime and onboarding when stable raw settings and intent commits are torn', async () => {
        const harness = installFailedRawRecoveryHarness(false, { stableTornPair: true });
        const rawSettingsBefore = structuredClone(harness.values.get(SETTINGS_STORAGE_KEY));
        const rawIntentBefore = structuredClone(harness.values.get(SETTINGS_INTENT_KEY));
        const { init, createRuntime, starting } = startRecoveryTestRuntime();
        const alert = await waitForRecoveryAlert();
        expect(alert.textContent).toContain('Study paused to protect your settings');
        expect(alert.textContent).not.toContain('raw-startup-secret');
        expect(document.body.textContent).not.toContain('raw-startup-secret');
        expect(document.querySelector('.jpdb-reader-onboarding')).toBeNull();
        expect(createRuntime).not.toHaveBeenCalled();
        expect(init).not.toHaveBeenCalled();
        expect(harness.values.get(SETTINGS_STORAGE_KEY)).toEqual(rawSettingsBefore);
        expect(harness.values.get(SETTINGS_INTENT_KEY)).toEqual(rawIntentBefore);
        expect(harness.values.has(`${COMPILER_STORAGE_PREFIX}${SETTINGS_STORAGE_KEY}`)).toBe(false);
        expect(harness.values.has(`${COMPILER_STORAGE_PREFIX}${SETTINGS_INTENT_KEY}`)).toBe(false);
        expectRawSettingsUntouched(harness, rawSettingsBefore);

        await unblockRecoveryWithChosenCanonical(harness, alert, starting);

        expectRecoveryStartupReady(createRuntime, init);
        expect(harness.values.get(SETTINGS_STORAGE_KEY)).toEqual(rawSettingsBefore);
        expect(harness.values.get(SETTINGS_INTENT_KEY)).toEqual(rawIntentBefore);
        expect(harness.rawSet).not.toHaveBeenCalled();
        expect(harness.rawRemove).not.toHaveBeenCalled();
    });

    it('continues full Study startup when canonical chosen settings survive a raw probe failure', async () => {
        const harness = installFailedRawRecoveryHarness(true);
        const rawBefore = structuredClone(harness.values.get(SETTINGS_STORAGE_KEY));
        const { init, createRuntime, starting } = startRecoveryTestRuntime();

        await starting;

        expectRecoveryStartupReady(createRuntime, init);
        expectRawSettingsUntouched(harness, rawBefore);
    });

    it('renders the packaged Study recovery block in Japanese for a Japanese interface locale', async () => {
        vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ja-JP']);
        const harness = installFailedRawRecoveryHarness(false);
        const { starting } = startRecoveryTestRuntime();
        const alert = await waitForRecoveryAlert();
        expect(alert.textContent).toContain('設定を保護するためStudyを一時停止しました');
        expect(alert.textContent).toContain('既存データは変更せず保持');
        expect(alert.textContent).toContain('最新の設定バックアップ');
        expect(alert.textContent).toContain('初期状態へのリセット');
        expect(alert.textContent).toContain('ダウングレード');

        await unblockRecoveryWithChosenCanonical(harness, alert, starting);
    });

    it('opens post-onboarding dictionary settings only after the first Study render', async () => {
        vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
        storeRuntimeSettings({
            onboardingSeen: false,
            learningTargetChosen: false,
            localDictionariesEnabled: false,
        });
        const calls: string[] = [];
        const { runtime, internals } = prepareOrderedRuntime(calls);
        internals.settingsDialog = {
            open: vi.fn((panel: string) => { calls.push(`settings:${panel}`); }),
            resumePendingCloudSettingsSync: vi.fn(async () => undefined),
        };

        const initializing = runtime.init();
        await vi.waitFor(() => {
            expect(document.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')).not.toBeNull();
        });
        const targetLanguage = document.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')!;
        targetLanguage.value = 'ja';
        targetLanguage.dispatchEvent(new Event('change', { bubbles: true }));
        document.querySelector<HTMLInputElement>('input[name="onboardingInstallOfflineDictionaries"]')!.checked = false;
        document.querySelector<HTMLButtonElement>('[data-onboarding-action="without-api"]')!.click();

        await initializing;

        expect(calls).toEqual(['render', 'settings:dictionaries']);
        expect(internals.settings).toMatchObject({ learningTargetChosen: true });
        expect((internals.settings as typeof DEFAULT_SETTINGS).languageProfiles[0]?.targetLanguage).toBe('ja');
        const storedSettings = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}');
        expect(storedSettings.learningTargetChosen).toBe(true);
        expect(storedSettings.languageProfiles[0]?.targetLanguage).toBe('ja');
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
        vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
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

    it('keeps the Academy interface language page-owned across storage reconciliation', async () => {
        vi.stubGlobal('location', new URL('https://yomureader.com/academy/'));
        const storedSettings = {
            ...DEFAULT_SETTINGS,
            learningTargetChosen: true,
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
            pageOwnedLearningTarget: 'ja',
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

    it('keeps the current Academy bootstrap transient and asks again on same-origin Study', async () => {
        window.history.replaceState({}, '', '/academy/');
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(RAW_ACADEMY_READER_DEFAULTS));
        const academyRuntime = new NewTabRuntime({
            mountHost: document.createElement('main'),
            pageOwnedLearningTarget: 'ja',
        });
        const academyRender = vi.fn(async () => undefined);
        const academyInternals = prepareRenderingRuntime(academyRuntime, academyRender);
        const academyWelcome = replaceOnboardingWithDismissal(academyInternals);

        await academyRuntime.init();

        expect(academyRender).toHaveBeenCalledOnce();
        expect(academyWelcome).not.toHaveBeenCalled();
        expect(activeLearningTargetLanguage()).toBe('ja');
        expect((academyInternals.settings as typeof DEFAULT_SETTINGS).learningTargetChosen).toBe(false);
        expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}')).toEqual(RAW_ACADEMY_READER_DEFAULTS);
        academyRuntime.destroy();
        resetActiveLearningTargetLanguage();

        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            ...RAW_ACADEMY_READER_DEFAULTS,
            interfaceLanguage: 'ja',
        }));
        window.history.replaceState({}, '', '/newtab/');
        const studyRuntime = new NewTabRuntime();
        const studyRender = vi.fn(async () => undefined);
        const studyInternals = prepareRenderingRuntime(studyRuntime, studyRender);
        const studyWelcome = replaceOnboardingWithDismissal(studyInternals);

        await studyRuntime.init();

        expect(studyWelcome).toHaveBeenCalledOnce();
        expect(studyInternals.createNewTabController).not.toHaveBeenCalled();
        expect(studyRender).not.toHaveBeenCalled();
        expect((studyInternals.settings as typeof DEFAULT_SETTINGS).learningTargetChosen).toBe(false);
        studyRuntime.destroy();
    });

    it('keeps the raw docs interface-language handoff unchosen on Study', async () => {
        window.history.replaceState({}, '', '/newtab/');
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
            learningTargetChosen: false,
            interfaceLanguage: 'en',
        }));
        const runtime = new NewTabRuntime();
        const renderPage = vi.fn(async () => undefined);
        const internals = prepareRenderingRuntime(runtime, renderPage);
        const showIfNeeded = replaceOnboardingWithDismissal(internals);

        await runtime.init();

        expect(showIfNeeded).toHaveBeenCalledOnce();
        expect(internals.createNewTabController).not.toHaveBeenCalled();
        expect(renderPage).not.toHaveBeenCalled();
        expect((internals.settings as typeof DEFAULT_SETTINGS).interfaceLanguage).toBe('en');
        expect((internals.settings as typeof DEFAULT_SETTINGS).learningTargetChosen).toBe(false);
        runtime.destroy();
    });

    it('applies Academy Japanese as a transient runtime target over an unchosen partial profile', async () => {
        vi.stubGlobal('location', new URL('https://yomureader.com/academy/'));
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
        window.history.replaceState({}, '', '/newtab/index.html#settings=api');
        installPackagedSettings({
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
        recordOpenedSettings(internals, calls);

        await runtime.init();

        expect(calls).toEqual(['render', 'settings:api']);
        expect(location.hash).toBe('');
    });

    it('captures packaged Appearance settings before render replaces the requested hash', async () => {
        window.history.replaceState({}, '', '/newtab/index.html#settings=appearance');
        installPackagedSettings({
            onboardingSeen: true,
            learningTargetChosen: true,
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
        await gmStorageSet(SETTINGS_STORAGE_KEY, {
            ...DEFAULT_SETTINGS,
            theme: 'light',
            popupMode: 'modal',
        });
        await gmStorageSet(SETTINGS_STORAGE_KEY, {
            ...DEFAULT_SETTINGS,
            theme: 'dark',
            popupMode: 'modal',
        });
        expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}')).toMatchObject({
            theme: 'dark',
            __yomuHostedPendingGmPatch: { theme: 'dark' },
        });
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

    it('retires provisional hosted onboarding when a late bridge reveals the chosen shared target', async () => {
        vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
        expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();

        const authoritativeSettings = {
            ...DEFAULT_SETTINGS,
            onboardingSeen: true,
            learningTargetChosen: true,
            theme: 'dark' as const,
            popupMode: 'popover' as const,
            languageProfiles: [{
                ...DEFAULT_SETTINGS.languageProfiles[0]!,
                schemaVersion: 2 as const,
                id: 'default-ja',
                targetLanguage: 'ja',
                outputLanguage: 'en',
                learnerLanguage: 'en',
                uiLocale: 'en',
            }],
            activeLanguageProfileId: 'default-ja',
        };
        const shared = new Map<string, unknown>([[
            SETTINGS_STORAGE_KEY,
            structuredClone(authoritativeSettings),
        ]]);
        const authoritativeBeforeBridge = structuredClone(authoritativeSettings);
        const renderPage = vi.fn(async () => undefined);
        const runtime = new NewTabRuntime();
        const internals = prepareRenderingRuntime(runtime, renderPage, {
            realSettingsStorageSubscription: true,
        });

        const initializing = runtime.init();
        await vi.waitFor(() => {
            expect(document.querySelector('.jpdb-reader-onboarding')).not.toBeNull();
        });
        const chooserClick = vi.fn();
        document.querySelectorAll<HTMLElement>('[data-onboarding-action]')
            .forEach(action => action.addEventListener('click', chooserClick));

        const gmSetValue = vi.fn((key: string, value: unknown) => {
            shared.set(key, structuredClone(value));
        });
        stubClonedGmValueReader(shared);
        vi.stubGlobal('GM_setValue', gmSetValue);
        vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => { shared.delete(key); }));
        vi.stubGlobal('GM_listValues', vi.fn(() => [...shared.keys()]));
        installUserscriptGmStorageBridge();

        await expect(initializing).resolves.toBeUndefined();

        expect(chooserClick).not.toHaveBeenCalled();
        expect(document.querySelector('.jpdb-reader-onboarding')).toBeNull();
        expect(renderPage).toHaveBeenCalledOnce();
        expect(internals.settings).toMatchObject({
            onboardingSeen: true,
            learningTargetChosen: true,
            theme: 'dark',
            popupMode: 'popover',
            activeLanguageProfileId: 'default-ja',
            languageProfiles: [expect.objectContaining({
                schemaVersion: 2,
                id: 'default-ja',
                targetLanguage: 'ja',
            })],
        });
        expect(shared.get(SETTINGS_STORAGE_KEY)).toEqual(authoritativeBeforeBridge);
        expect(gmSetValue).not.toHaveBeenCalledWith(SETTINGS_STORAGE_KEY, expect.anything());
        runtime.destroy();
    }, 15_000);

    it('does not show or commit onboarding when the hosted settings authority rejects startup', async () => {
        vi.stubGlobal('location', new URL('https://yomureader.com/study/'));
        const runtime = new NewTabRuntime();
        const internals = prepareRenderingRuntime(runtime);
        const showIfNeeded = replaceOnboardingWithDismissal(internals);
        const getValue = vi.fn(() => {
            throw new Error('hosted settings authority unavailable');
        });
        vi.stubGlobal('GM_getValue', getValue);
        const setValue = vi.fn();
        vi.stubGlobal('GM_setValue', setValue);

        await expect(runtime.init()).rejects.toThrow('hosted settings authority unavailable');

        expect(getValue).toHaveBeenCalled();
        expect(showIfNeeded).not.toHaveBeenCalled();
        expect(setValue).not.toHaveBeenCalled();
        expect(document.querySelector('.jpdb-reader-onboarding')).toBeNull();
        expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
        runtime.destroy();
    });
});
