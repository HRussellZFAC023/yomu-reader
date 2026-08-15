import { vi } from 'vitest';

import type { ReaderSettings } from '../../../src/reader/app/types';
import type { SettingsDialogController as SettingsDialogControllerInstance } from '../../../src/reader/settings/dialog-controller';
import { saveSettings } from '../../../src/reader/settings';
import { testEnSettings } from './settings-fixture';

export {
    catalogBrowseLanguageSectionsForLearnerLanguage,
    recommendedDictionariesForLearnerLanguage,
} from '../../../src/reader/dictionaries/recommended';

// These tests assert English UI copy; pin the interface language since the
// shipped default is now 'ja'.
export const DEFAULT_SETTINGS = testEnSettings();

const settingsDialogTestState = vi.hoisted(() => ({
    cloudSettingsAuthResult: null as null | { ok: boolean; state: string; error?: string },
    cloudSettingsAvailable: false,
    pendingCloudSettingsAction: null as null | {
        action: 'restore-cloud-settings' | 'sync-cloud-settings';
        startedAt: number;
        state: string;
    },
    useRealLocalization: false,
}));

export function getSettingsDialogTestState(): typeof settingsDialogTestState {
    return settingsDialogTestState;
}

vi.mock('../../../src/reader/anki/transport', async importOriginal => {
    const actual = await importOriginal<typeof import('../../../src/reader/anki/transport')>();
    return {
        ...actual,
        diagnoseAnkiConnectFailure: vi.fn(async () => 'unreachable' as const),
    };
});

vi.mock('../../../src/reader/dictionaries/recommended', async importOriginal => {
    const actual = await importOriginal<typeof import('../../../src/reader/dictionaries/recommended')>();
    return {
        ...actual,
        // The catalogue browse suites cover the full 1,600-card shelf. Rebuilding
        // that shelf in every controller case retains gigabytes of jsdom nodes,
        // while these tests only exercise the compact recommendation shelf.
        catalogBrowseLanguageSectionsForLearnerLanguage: vi.fn(() => []),
    };
});

vi.mock('../../../src/reader/settings/cloud-sync', async importOriginal => {
    const actual = await importOriginal<typeof import('../../../src/reader/settings/cloud-sync')>();
    return {
        ...actual,
        CLOUD_SETTINGS_SYNC_ENABLED: true,
        cloudSettingsSyncAvailable: vi.fn(() => settingsDialogTestState.cloudSettingsAvailable),
        cloudSettingsAuthRedirectResult: vi.fn(() => {
            const result = settingsDialogTestState.cloudSettingsAuthResult;
            settingsDialogTestState.cloudSettingsAuthResult = null;
            return result;
        }),
    };
});

vi.mock('../../../src/reader/settings/cloud-settings-pending-action', async importOriginal => {
    const actual = await importOriginal<typeof import('../../../src/reader/settings/cloud-settings-pending-action')>();
    return {
        ...actual,
        readPendingCloudSettingsAction: vi.fn(async () => settingsDialogTestState.pendingCloudSettingsAction),
        clearPendingCloudSettingsAction: vi.fn(async () => {
            settingsDialogTestState.pendingCloudSettingsAction = null;
        }),
    };
});

vi.mock('../../../src/reader/settings/form', async importOriginal => {
    const actual = await importOriginal<typeof import('../../../src/reader/settings/form')>();
    return {
        ...actual,
        // Controller tests exercise settings dialog behavior; full localization and
        // parsed-settings ruby coverage lives in settings-form/nested-text tests.
        localizeSettingsForm: vi.fn((form: HTMLFormElement, language: ReaderSettings['interfaceLanguage']) => {
            if (settingsDialogTestState.useRealLocalization) {
                actual.localizeSettingsForm(form, language);
                return;
            }
            form.lang = language === 'ja' ? 'ja' : 'en';
        }),
    };
});

// tests/reader/setup imports build companions, which pulls in the controller
// before this file's mocks. Reload it here so the form seams above are active.
vi.resetModules();
const { SettingsDialogController } = await import('../../../src/reader/settings/dialog-controller');
// Same module instance the controller above resolved: opening a dialog probes
// each aggregator audio URL once and memoizes it, so every test must start
// without another test's cached (or still in-flight) probe.
const { getAudioCandidates, resetAudioSubSourceDiscoveryForTests } =
    await import('../../../src/reader/audio/candidates');

type SettingsDialogControllerConstructor = new (
    dependencies: Record<string, unknown>,
) => SettingsDialogControllerInstance;

type RefreshableSettingsDialogController = {
    refreshDeckControls: (form: HTMLFormElement) => Promise<void>;
    refreshDictionaryStatus: (form: HTMLFormElement) => Promise<void>;
};

export function createSettingsDialog(overrides: Record<string, unknown> = {}, panel?: string): {
    dependencies: Record<string, any>;
    controller: SettingsDialogControllerInstance;
    dismiss: ReturnType<typeof vi.fn>;
    form: HTMLFormElement;
    refreshDictionaryStatus: (form: HTMLFormElement) => Promise<void>;
} {
    let settings: ReaderSettings = { ...DEFAULT_SETTINGS, apiKey: '' };
    const dismiss = vi.fn();
    const dependencies = {
        getSettings: () => settings,
        setSettings: (next: ReaderSettings) => { settings = next; },
        saveSettings,
        jpdb: {
            clear: vi.fn(),
            listDecks: vi.fn().mockResolvedValue([]),
        },
        dictionaries: {
            summary: vi.fn().mockResolvedValue({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0 }),
        },
        anki: {
            isConnected: vi.fn().mockResolvedValue(false),
        },
        audio: { play: vi.fn(), stop: vi.fn() },
        subtitles: { refresh: vi.fn() },
        ocr: { refresh: vi.fn() },
        youtube: { refresh: vi.fn() },
        createBackdrop: () => document.createElement('div'),
        mountDialog: (backdrop: HTMLElement, surface: HTMLElement) => document.body.append(backdrop, surface),
        sensitiveSettingsSurface: () => ({
            trusted: true,
            launcherUrl: 'https://yomureader.com/study/#settings=api',
        }),
        dismiss,
        toast: vi.fn(),
        applyTheme: vi.fn(),
        applyAccentColor: vi.fn(),
        applyWordColors: vi.fn(),
        installFab: vi.fn(),
        refreshDictionaryStyles: vi.fn().mockResolvedValue(undefined),
        scheduleDictionaryRescan: vi.fn(),
        refreshNewTabIfCurrent: vi.fn(),
        clearDictionarySourceOpenOverrides: vi.fn(),
        resetAllData: vi.fn(),
        beginSettingsPreview: vi.fn(),
        clearSettingsPreview: vi.fn(),
        publishedDictionaryLanguages: vi.fn().mockResolvedValue(new Set(['ja'])),
        ...overrides,
    };
    const controller = new (SettingsDialogController as unknown as SettingsDialogControllerConstructor)(dependencies);
    const refreshable = controller as unknown as RefreshableSettingsDialogController;
    const refreshDictionaryStatus = refreshable.refreshDictionaryStatus.bind(controller);
    refreshable.refreshDeckControls = vi.fn().mockResolvedValue(undefined);
    if (typeof (dependencies.dictionaries as Record<string, unknown>).importFromUrl === 'function') {
        let refreshCalls = 0;
        refreshable.refreshDictionaryStatus = vi.fn((form: HTMLFormElement) => {
            refreshCalls++;
            return refreshCalls === 1 ? Promise.resolve() : refreshDictionaryStatus(form);
        });
    } else {
        refreshable.refreshDictionaryStatus = vi.fn().mockResolvedValue(undefined);
    }

    controller.open(panel);

    return {
        controller,
        dependencies,
        dismiss,
        form: document.querySelector<HTMLFormElement>('.jpdb-reader-settings')!,
        refreshDictionaryStatus,
    };
}

export function resetSettingsDialogTestState(): void {
    settingsDialogTestState.cloudSettingsAuthResult = null;
    settingsDialogTestState.cloudSettingsAvailable = false;
    settingsDialogTestState.pendingCloudSettingsAction = null;
    settingsDialogTestState.useRealLocalization = false;
}

export function resetSettingsDialogTestEnvironment(): void {
    resetSettingsDialogTestState();
    document.body.replaceChildren();
    localStorage.clear();
    resetAudioSubSourceDiscoveryForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
}

export function settingsElement<T extends Element>(form: HTMLFormElement, selector: string): T {
    const element = form.querySelector<T>(selector);
    if (!element) throw new Error(`Missing settings element: ${selector}`);
    return element;
}

export function deferred<T>(): {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
} {
    const callbacks = {} as {
        resolve: (value: T) => void;
        reject: (reason?: unknown) => void;
    };
    const promise = new Promise<T>((resolve, reject) => Object.assign(callbacks, { resolve, reject }));
    return { promise, ...callbacks };
}

export function flushPromises(): Promise<void> {
    return Promise.resolve();
}

async function conditionPassesWithinTurn(predicate: () => boolean): Promise<boolean> {
    if (predicate()) return true;
    await flushPromises();
    if (predicate()) return true;
    await new Promise(resolve => window.setTimeout(resolve, 0));
    return predicate();
}

export async function waitForCondition(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 30; attempt++) {
        if (await conditionPassesWithinTurn(predicate)) return;
    }
    throw new Error('Condition was not met.');
}

export type CallTracker = { mock: { calls: unknown[][] } };

export function importSummary(dictionary: string) {
    return {
        dictionaries: [dictionary],
        dictionaryTypes: { [dictionary]: 'terms' as const },
        entries: 1,
        terms: 1,
        kanji: 0,
        termMeta: 0,
        kanjiMeta: 0,
    };
}

export { getAudioCandidates };
