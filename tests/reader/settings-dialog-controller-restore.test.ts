import {
    DEFAULT_SETTINGS,
    createSettingsDialog,
    deferred,
    flushPromises,
    getSettingsDialogTestState,
    importSummary,
    resetSettingsDialogTestEnvironment,
    settingsElement,
    waitForCondition,
    type CallTracker,
} from './helpers/settings-dialog-controller-fixture';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReaderSettings } from '../../src/reader/app/types';
import type { ImportSummary } from '../../src/reader/dictionaries/yomitan';

const settingsDialogTestState = getSettingsDialogTestState();

type SettingsRestoreSaveOptions = {
    persistPreferredJapaneseSiteLanguage?: boolean;
    explicitUserChoiceKeys: Array<keyof ReaderSettings>;
    clearExplicitUserChoiceKeys?: Array<keyof ReaderSettings>;
};

const SETTINGS_ACTION_OPERATION_POLICY = [
    ['anki-tag-add', 'local'],
    ['anki-tag-remove', 'local'],
    ['audio-source-add', 'local'],
    ['audio-source-down', 'local'],
    ['audio-source-remove', 'local'],
    ['audio-source-up', 'local'],
    ['cancel', 'local'],
    ['clear-local-dictionary-site-storage', 'durable'],
    ['connect-academy-account', 'durable'],
    ['copy-newtab-url', 'local'],
    ['create-academy-recovery-code', 'durable'],
    ['delete-yomitan-dictionary', 'durable'],
    ['dictionary-source-down', 'local'],
    ['dictionary-source-up', 'local'],
    ['disconnect-academy-account', 'durable'],
    ['download-recommended-dictionary', 'durable'],
    ['export-reader-settings', 'durable'],
    ['export-yomitan-dictionary', 'durable'],
    ['factory-reset', 'durable'],
    ['import-yomitan-dictionary', 'durable'],
    ['import-yomitan-settings', 'restore'],
    ['lookup-link-add', 'local'],
    ['lookup-link-down', 'local'],
    ['lookup-link-remove', 'local'],
    ['lookup-link-up', 'local'],
    ['open-yomu-update', 'local'],
    ['prepare-anki', 'durable'],
    ['preview-audio', 'durable'],
    ['restore-cloud-settings', 'restore'],
    ['settings-panel', 'local'],
    ['sync-academy-account', 'durable'],
    ['sync-cloud-settings', 'durable'],
    ['test-anki', 'durable'],
    ['toggle-catalog-browse', 'local'],
    ['update-anki-model', 'durable'],
] as const;

async function beginSettingsFileImport(
    form: HTMLFormElement,
    importedSettings: ReaderSettings,
    additions: { readonly storage?: unknown; readonly dictionaries?: unknown } = {},
): Promise<{ importButton: HTMLButtonElement; saveButton: HTMLButtonElement }> {
    const input = form.querySelector<HTMLInputElement>('input[data-file="settings"]')!;
    const file = new File(['settings'], 'yomu-settings.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', {
        configurable: true,
        value: vi.fn().mockResolvedValue(JSON.stringify({
            formatName: 'yomu-reader-settings',
            formatVersion: 3,
            settings: importedSettings,
            ...additions,
        })),
    });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    const importButton = form.querySelector<HTMLButtonElement>('[data-action="import-yomitan-settings"]')!;
    const saveButton = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    importButton.click();
    await waitForCondition(() => typeof input.onchange === 'function');
    input.dispatchEvent(new Event('change'));
    return { importButton, saveButton };
}

async function rejectSettingsPersistence(
    persistence: ReturnType<typeof deferred<void>>,
    toast: CallTracker,
): Promise<void> {
    persistence.reject(new Error('storage unavailable'));
    await waitForCondition(() => toast.mock.calls.some(call => call[0] === 'Action failed.'));
}

function createSettingsRestoreFixture(
    initialSettings: ReaderSettings,
    saveSettings = vi.fn().mockResolvedValue(undefined),
    overrides: Record<string, unknown> = {},
): ReturnType<typeof createSettingsDialog> & {
    saveSettings: typeof saveSettings;
    state: { settings: ReaderSettings };
} {
    const state = { settings: initialSettings };
    return {
        ...createSettingsDialog({
            getSettings: () => state.settings,
            setSettings: (next: ReaderSettings) => { state.settings = next; },
            saveSettings,
            ...overrides,
        }, 'backup'),
        saveSettings,
        state,
    };
}

async function expectSettingsImportSucceeded(toast: CallTracker): Promise<void> {
    await waitForCondition(() => toast.mock.calls.length > 0);
    expect(toast.mock.calls.map(call => String(call[0])))
        .toContainEqual(expect.stringMatching(/^Settings imported/));
}

function settingsAncestorIsHidden(control: HTMLElement, selector: string): boolean {
    return control.closest<HTMLElement>(selector)!.hidden;
}

async function submitCredentialSaveAndWaitForPermission(
    form: HTMLFormElement,
    requestPermission: CallTracker,
    expectedCallCount = 1,
): Promise<void> {
    settingsElement<HTMLInputElement>(form, 'input[name="apiCredentialJpdb"]').value = 'jpdb-stale-save';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitForCondition(() => requestPermission.mock.calls.length === expectedCallCount);
}

async function rejectNormalSettingsSave(
    persistence: ReturnType<typeof deferred<void>>,
    toast: CallTracker,
): Promise<void> {
    persistence.reject(new Error('storage unavailable'));
    await waitForCondition(() => toast.mock.calls.some(call => call[0] === 'Settings save failed.'));
}

async function submitSettingsSaveAndExpect(
    form: HTMLFormElement,
    saveSettings: CallTracker,
    expectedCallCount: number,
    expectedSettings: Partial<ReaderSettings>,
): Promise<void> {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitForCondition(() => saveSettings.mock.calls.length === expectedCallCount);
    expect(saveSettings.mock.calls[expectedCallCount - 1]?.[0]).toMatchObject(expectedSettings);
}

function restoreSaveOptions(saveSettings: CallTracker): SettingsRestoreSaveOptions {
    return saveSettings.mock.calls[0]![1] as SettingsRestoreSaveOptions;
}

function importedDictionarySettingsBackup(): { dictionaries: Record<string, unknown> } {
    return {
        dictionaries: {
            formatName: 'yomu-yomitan-dictionaries',
            formatVersion: 2,
            dictionaries: [{ title: 'Imported Dictionary' }],
            terms: [{ dictionary: 'Imported Dictionary', expression: '見る' }],
        },
    };
}

function dictionaryRestoreDependencies(
    previousDictionaryBlob: Blob,
    importFile: ReturnType<typeof vi.fn>,
): {
    exportJson: ReturnType<typeof vi.fn>;
    importFile: ReturnType<typeof vi.fn>;
    summary: ReturnType<typeof vi.fn>;
} {
    return {
        exportJson: vi.fn().mockResolvedValue(previousDictionaryBlob),
        importFile,
        summary: vi.fn().mockResolvedValue({
            dictionaries: [{ title: 'Imported Dictionary', type: 'terms' }],
            terms: 1,
            kanji: 0,
            termMeta: 0,
        }),
    };
}

describe('settings dialog restore and save interlocks', () => {
    afterEach(() => {
        resetSettingsDialogTestEnvironment();
    });

    it('reports a durable normal Save as successful when a post-commit host effect throws', async () => {
        const saveSettings = vi.fn().mockResolvedValue(undefined);
        const { dependencies, dismiss, form } = createSettingsDialog({
            saveSettings,
            applyTheme: vi.fn(() => { throw new Error('theme host failed'); }),
        });
        const saveButton = settingsElement<HTMLButtonElement>(form, 'button[type="submit"]');

        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitForCondition(() => dismiss.mock.calls.length === 1);
        await waitForCondition(() => !saveButton.disabled);

        expect(saveSettings).toHaveBeenCalledOnce();
        expect(dependencies.toast).toHaveBeenCalledWith('Settings saved.');
        expect(dependencies.toast).not.toHaveBeenCalledWith('Settings save failed.');
        expect(dismiss).toHaveBeenCalledOnce();
    });

    it('locks Save and repeat import until the imported settings are persisted and reopened', async () => {
        const importedAccent = '#123456';
        const persistence = deferred<void>();
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, accentColor: '#654321' };
        const saveSettings = vi.fn((_settings: ReaderSettings) => persistence.promise);
        const { dependencies, dismiss, form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            saveSettings,
        }, 'backup');
        const factoryReset = settingsElement<HTMLButtonElement>(form, '[data-action="factory-reset"]');
        factoryReset.disabled = true;
        const { importButton, saveButton } = await beginSettingsFileImport(
            form,
            { ...DEFAULT_SETTINGS, accentColor: importedAccent },
        );
        await waitForCondition(() => saveSettings.mock.calls.length === 1);

        expect(saveButton.disabled).toBe(true);
        expect(saveButton.dataset.saveBlocked).toBe('settings-import');
        expect(saveButton.textContent).toBe('Save after import');
        expect(importButton.matches(':disabled')).toBe(true);
        expect(importButton.disabled).toBe(false);
        expect(factoryReset.disabled).toBe(true);
        const cancel = settingsElement<HTMLButtonElement>(form, '[data-action="cancel"]');
        expect(cancel.matches(':disabled')).toBe(false);
        cancel.click();
        expect(dismiss).toHaveBeenCalledOnce();
        expect(settingsElement<HTMLElement>(form, '[data-settings-save-status]').textContent)
            .toBe('Settings import is running. Save unlocks when it finishes.');

        form.querySelector<HTMLInputElement>('input[name="accentColor"]')!.value = '#abcdef';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        importButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await flushPromises();

        expect(saveSettings).toHaveBeenCalledOnce();
        expect(saveSettings).toHaveBeenCalledWith(
            expect.objectContaining({ accentColor: importedAccent }),
            expect.any(Object),
        );
        expect(dependencies.toast).toHaveBeenCalledWith(
            'Settings import is running. Save unlocks when it finishes.',
        );

        persistence.resolve();
        await waitForCondition(() => document.querySelectorAll('.jpdb-reader-settings').length === 2);

        expect(settings.accentColor).toBe(importedAccent);
        const reopened = Array.from(document.querySelectorAll<HTMLFormElement>('.jpdb-reader-settings')).at(-1)!;
        expect(settingsElement<HTMLInputElement>(reopened, 'input[name="accentColor"]').value).toBe(importedAccent);
        expect(settingsElement<HTMLButtonElement>(reopened, 'button[type="submit"]').disabled).toBe(false);
        expect(settingsElement<HTMLButtonElement>(reopened, '[data-action="import-yomitan-settings"]').disabled).toBe(false);
        expect(factoryReset.disabled).toBe(true);
    });

    it('keeps the localized success result visible when production mount replaces the imported form', async () => {
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, accentColor: '#654321' };
        const mountDialog = (backdrop: HTMLElement, surface: HTMLElement) => {
            document.querySelectorAll('.jpdb-reader-settings').forEach(form => form.remove());
            document.body.append(backdrop, surface);
        };
        const { dependencies, form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            saveSettings: vi.fn().mockResolvedValue(undefined),
            mountDialog,
        }, 'backup');

        await beginSettingsFileImport(form, { ...DEFAULT_SETTINGS, accentColor: '#123456' });
        await expectSettingsImportSucceeded(dependencies.toast);

        expect(form.isConnected).toBe(false);
        expect(document.querySelectorAll('.jpdb-reader-settings')).toHaveLength(1);
        expect(dependencies.toast).toHaveBeenCalledWith('Settings imported.');
        expect(dependencies.toast).not.toHaveBeenCalledWith('Action failed.');
    });

    it('blocks settings import while an earlier Save is awaiting Firefox permission', async () => {
        const savePermission = deferred<boolean>();
        const requestPermission = vi.fn()
            .mockImplementationOnce(() => savePermission.promise)
            .mockResolvedValueOnce(true);
        vi.stubGlobal('browser', {
            runtime: { id: 'yomu@yomureader.com', getURL: (path: string) => `moz-extension://yomu/${path}` },
            permissions: { request: requestPermission },
        });
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, accentColor: '#654321' };
        const saveSettings = vi.fn().mockResolvedValue(undefined);
        const { dependencies, form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            saveSettings,
        }, 'backup');
        await submitCredentialSaveAndWaitForPermission(form, requestPermission);

        const importButton = settingsElement<HTMLButtonElement>(form, '[data-action="import-yomitan-settings"]');
        expect(importButton.disabled).toBe(true);
        importButton.click();
        await flushPromises();
        expect(requestPermission).toHaveBeenCalledOnce();
        expect(saveSettings).not.toHaveBeenCalled();

        savePermission.resolve(true);
        await waitForCondition(() => saveSettings.mock.calls.length === 1);
        await waitForCondition(() => !importButton.disabled);

        expect(requestPermission).toHaveBeenCalledOnce();
        expect(saveSettings).toHaveBeenCalledOnce();
        expect(settings.accentColor).toBe('#654321');
        expect(dependencies.toast).toHaveBeenCalledWith('Settings saved.');
    });

    it('discards permission-delayed Save and action tickets after cloud restore publication', async () => {
        const actionPermission = deferred<boolean>();
        const savePermission = deferred<boolean>();
        let trustedClickActive = false;
        const requestPermission = vi.fn()
            .mockImplementationOnce(() => {
                expect(trustedClickActive).toBe(true);
                return actionPermission.promise;
            })
            .mockImplementationOnce(() => savePermission.promise);
        vi.stubGlobal('browser', {
            runtime: { id: 'yomu@yomureader.com', getURL: (path: string) => `moz-extension://yomu/${path}` },
            permissions: { request: requestPermission },
        });
        const privateRequest = vi.fn();
        vi.stubGlobal('GM_xmlhttpRequest', privateRequest);
        const authorizationState = 'a'.repeat(48);
        settingsDialogTestState.cloudSettingsAvailable = true;
        settingsDialogTestState.cloudSettingsAuthResult = { ok: true, state: authorizationState };
        settingsDialogTestState.pendingCloudSettingsAction = {
            action: 'restore-cloud-settings',
            startedAt: Date.now(),
            state: authorizationState,
        };
        const importedAccent = '#123456';
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, accentColor: '#654321' };
        const saveSettings = vi.fn().mockResolvedValue(undefined);
        const cloudSync = await import('../../src/reader/settings/cloud-sync');
        vi.spyOn(cloudSync, 'downloadCloudSettingsFromCloud').mockResolvedValue({
            formatName: 'yomu-google-drive-settings-sync',
            formatVersion: 1,
            syncedAt: '2026-08-15T08:00:00.000Z',
            settings: { ...DEFAULT_SETTINGS, accentColor: importedAccent },
            storage: {},
        });
        const { controller, dependencies, form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            saveSettings,
        }, 'backup');
        const connect = settingsElement<HTMLButtonElement>(form, '[data-action="connect-academy-account"]');
        settingsElement<HTMLInputElement>(form, '[data-academy-pairing-code]').value = '0234-5678-ABCD-EFGH-JKMN';
        await waitForCondition(() => !connect.disabled);
        trustedClickActive = true;
        connect.click();
        trustedClickActive = false;
        expect(requestPermission).toHaveBeenCalledOnce();
        await submitCredentialSaveAndWaitForPermission(form, requestPermission, 2);

        const restore = controller.resumePendingCloudSettingsSync();
        await waitForCondition(() => saveSettings.mock.calls.length === 1);
        expect(await restore).toBe(true);
        actionPermission.resolve(true);
        savePermission.resolve(true);
        await waitForCondition(() => dependencies.toast.mock.calls.some(
            (call: unknown[]) => call[0] === 'Settings import replaced the earlier pending Save.',
        ));
        await waitForCondition(() => dependencies.toast.mock.calls.some(
            (call: unknown[]) => call[0] === 'Settings import is running. Save unlocks when it finishes.',
        ));

        expect(saveSettings).toHaveBeenCalledOnce();
        expect(settings.accentColor).toBe(importedAccent);
        expect(privateRequest).not.toHaveBeenCalled();
        expect(dependencies.toast).toHaveBeenCalledWith(expect.stringContaining('Google Drive settings restored'));
    });

    it('restores in-memory settings and unlocks controls when imported settings fail to persist', async () => {
        const previousAccent = '#654321';
        const importedAccent = '#123456';
        const persistence = deferred<void>();
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, accentColor: previousAccent };
        const onSettingsPersistenceFailed = vi.fn();
        const saveSettings = vi.fn(() => persistence.promise);
        const { dependencies, form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            saveSettings,
            onSettingsPersistenceFailed,
        }, 'backup');
        const { importButton, saveButton } = await beginSettingsFileImport(
            form,
            { ...DEFAULT_SETTINGS, accentColor: importedAccent },
        );
        await waitForCondition(() => saveSettings.mock.calls.length === 1);
        expect(settings.accentColor).toBe(previousAccent);
        expect(saveButton.disabled).toBe(true);

        await rejectSettingsPersistence(persistence, dependencies.toast);

        expect(settings.accentColor).toBe(previousAccent);
        expect(onSettingsPersistenceFailed).toHaveBeenCalledOnce();
        expect(onSettingsPersistenceFailed).toHaveBeenCalledWith(expect.objectContaining({ accentColor: previousAccent }));
        expect(saveButton.disabled).toBe(false);
        expect(importButton.disabled).toBe(false);
        expect(settingsElement<HTMLElement>(form, '#jpdb-reader-settings-panel-backup [data-import-status]').textContent)
            .toBe('Action failed.');
    });

    it('does not let a rejected normal Save contaminate a later partial restore', async () => {
        const previousAccent = '#654321';
        const rejectedAccent = '#abcdef';
        const persistence = deferred<void>();
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, accentColor: previousAccent };
        const saveSettings = vi.fn()
            .mockImplementationOnce(() => persistence.promise)
            .mockResolvedValue(undefined);
        const onSettingsPersistenceFailed = vi.fn();
        const { dependencies, form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            saveSettings,
            onSettingsPersistenceFailed,
        }, 'backup');
        settingsElement<HTMLInputElement>(form, 'input[name="accentColor"]').value = rejectedAccent;
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitForCondition(() => saveSettings.mock.calls.length === 1);
        expect(settings.accentColor).toBe(rejectedAccent);

        await rejectNormalSettingsSave(persistence, dependencies.toast);
        expect(settings.accentColor).toBe(previousAccent);
        expect(onSettingsPersistenceFailed).toHaveBeenCalledOnce();

        await beginSettingsFileImport(form, { showFurigana: false } as ReaderSettings);
        await waitForCondition(() => saveSettings.mock.calls.length === 2);
        expect(saveSettings.mock.calls[1]?.[0]).toMatchObject({
            accentColor: previousAccent,
            showFurigana: false,
        });
        expect(settings).toMatchObject({ accentColor: previousAccent, showFurigana: false });
    });

    it('blocks a second form Save while the first Save is unresolved and safely unlocks after failure', async () => {
        const previousAccent = '#654321';
        const firstAccent = '#abcdef';
        const retryAccent = '#123456';
        const persistence = deferred<void>();
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, accentColor: previousAccent };
        const saveSettings = vi.fn()
            .mockImplementationOnce(() => persistence.promise)
            .mockResolvedValue(undefined);
        const { dependencies, form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            saveSettings,
        }, 'backup');
        const saveButton = settingsElement<HTMLButtonElement>(form, 'button[type="submit"]');
        const accentInput = settingsElement<HTMLInputElement>(form, 'input[name="accentColor"]');
        accentInput.value = firstAccent;
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitForCondition(() => saveSettings.mock.calls.length === 1);
        expect(saveButton.disabled).toBe(true);
        expect(saveButton.dataset.saveBlocked).toBe('settings-save');

        accentInput.value = retryAccent;
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flushPromises();
        expect(saveSettings).toHaveBeenCalledOnce();

        await rejectNormalSettingsSave(persistence, dependencies.toast);
        await waitForCondition(() => !saveButton.disabled);
        expect(settings.accentColor).toBe(previousAccent);

        accentInput.value = retryAccent;
        await submitSettingsSaveAndExpect(form, saveSettings, 2, { accentColor: retryAccent });
    });

    it('blocks Factory Reset while a permission-delayed form Save is pending', async () => {
        const permission = deferred<boolean>();
        const requestPermission = vi.fn(() => permission.promise);
        vi.stubGlobal('browser', {
            runtime: { id: 'yomu@yomureader.com', getURL: (path: string) => `moz-extension://yomu/${path}` },
            permissions: { request: requestPermission },
        });
        const saveSettings = vi.fn().mockResolvedValue(undefined);
        const resetAllData = vi.fn().mockResolvedValue(undefined);
        const { dependencies, form } = createSettingsDialog({ saveSettings, resetAllData }, 'backup');
        const probes = SETTINGS_ACTION_OPERATION_POLICY.map(([action, mode]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.action = action;
            form.append(button);
            return { action, button, mode };
        });
        const unknown = document.createElement('button');
        unknown.type = 'button';
        unknown.dataset.action = 'audio-source-future-durable-action';
        form.append(unknown);
        settingsElement<HTMLInputElement>(form, 'input[name="apiCredentialJpdb"]').value = 'pending-secret';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await waitForCondition(() => requestPermission.mock.calls.length === 1);

        const factoryReset = settingsElement<HTMLButtonElement>(form, '[data-action="factory-reset"]');
        expect(factoryReset.disabled).toBe(true);
        expect(factoryReset.dataset.disabledForSettingsSave).toBeUndefined();
        for (const { action, button, mode } of probes) {
            expect(button.disabled, action).toBe(mode !== 'local');
        }
        expect(unknown.disabled).toBe(true);
        factoryReset.click();
        await flushPromises();
        expect(resetAllData).not.toHaveBeenCalled();
        expect(saveSettings).not.toHaveBeenCalled();

        permission.resolve(true);
        await waitForCondition(() => saveSettings.mock.calls.length === 1);
        await waitForCondition(() => !factoryReset.disabled);
        expect(probes.every(({ button }) => !button.disabled)).toBe(true);
        expect(unknown.disabled).toBe(false);
        expect(resetAllData).not.toHaveBeenCalled();
        expect(dependencies.toast).toHaveBeenCalledWith('Settings saved.');
        expect(dependencies.toast).not.toHaveBeenCalledWith('Settings save failed.');
    });

    it('blocks form Save while Factory Reset is unresolved and unlocks for retry', async () => {
        const resetCompletion = deferred<void>();
        const previousAccent = '#654321';
        const retryAccent = '#123456';
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, accentColor: previousAccent };
        const saveSettings = vi.fn().mockResolvedValue(undefined);
        const resetAllData = vi.fn(() => resetCompletion.promise);
        const { form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            saveSettings,
            resetAllData,
        }, 'backup');
        const factoryReset = settingsElement<HTMLButtonElement>(form, '[data-action="factory-reset"]');
        factoryReset.click();
        await waitForCondition(() => resetAllData.mock.calls.length === 1);

        const saveButton = settingsElement<HTMLButtonElement>(form, 'button[type="submit"]');
        expect(saveButton.disabled).toBe(true);
        expect(saveButton.dataset.saveBlocked).toBe('settings-action');
        settingsElement<HTMLInputElement>(form, 'input[name="accentColor"]').value = retryAccent;
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flushPromises();
        expect(saveSettings).not.toHaveBeenCalled();
        expect(settings.accentColor).toBe(previousAccent);

        resetCompletion.resolve();
        await waitForCondition(() => !saveButton.disabled);
        expect(resetAllData).toHaveBeenCalledOnce();

        await submitSettingsSaveAndExpect(form, saveSettings, 1, { accentColor: retryAccent });
    });

    it('publishes imported intent only through the final settings save', async () => {
        const importedAccent = '#123456';
        const commit = 'imported-settings-commit';
        const setValue = vi.fn();
        vi.stubGlobal('GM_setValue', setValue);
        const { form, saveSettings } = createSettingsRestoreFixture({
            ...DEFAULT_SETTINGS,
            accentColor: '#654321',
            preferJapaneseSiteLanguage: false,
        });
        await beginSettingsFileImport(
            form,
            {
                ...DEFAULT_SETTINGS,
                accentColor: importedAccent,
                preferJapaneseSiteLanguage: true,
            },
            {
                storage: {
                    'jpdb-popup-reader-settings': {
                        ...DEFAULT_SETTINGS,
                        accentColor: importedAccent,
                        preferJapaneseSiteLanguage: true,
                        __yomuSettingsPersistenceCommitV1: commit,
                    },
                    'yomu:settings-intent:v2': {
                        revision: 3,
                        records: { accentColor: { seq: 3, value: importedAccent } },
                        __yomuSettingsPersistenceCommitV1: commit,
                    },
                    'yomu:explicit-user-settings:v1': {},
                    'yomu:prefer-japanese-site-language:v1': true,
                },
            },
        );
        await waitForCondition(() => saveSettings.mock.calls.length === 1);

        const [savedSettings, options] = saveSettings.mock.calls[0] as [ReaderSettings, {
            persistPreferredJapaneseSiteLanguage?: boolean;
            explicitUserChoiceKeys: Array<keyof ReaderSettings>;
            clearExplicitUserChoiceKeys?: Array<keyof ReaderSettings>;
        }];
        expect(savedSettings).toMatchObject({
            accentColor: importedAccent,
            preferJapaneseSiteLanguage: true,
        });
        expect(options).toMatchObject({
            persistPreferredJapaneseSiteLanguage: true,
            explicitUserChoiceKeys: ['accentColor'],
        });
        expect(new Set(options.clearExplicitUserChoiceKeys)).toEqual(new Set(Object.keys(savedSettings)));
        expect(setValue).not.toHaveBeenCalled();
    });

    it('uses the witnessed canonical settings paired with imported intent instead of a torn outer snapshot', async () => {
        const outerAccent = '#123456';
        const witnessedAccent = '#abcdef';
        const commit = 'witnessed-backup-commit';
        const fixture = createSettingsRestoreFixture({ ...DEFAULT_SETTINGS, accentColor: '#654321' });
        const { form, saveSettings } = fixture;

        await beginSettingsFileImport(
            form,
            { ...DEFAULT_SETTINGS, accentColor: outerAccent },
            { storage: {
                'jpdb-popup-reader-settings': {
                    accentColor: witnessedAccent,
                    __yomuSettingsPersistenceCommitV1: commit,
                },
                'yomu:settings-intent:v2': {
                    revision: 2,
                    records: { accentColor: { seq: 2, value: witnessedAccent } },
                    __yomuSettingsPersistenceCommitV1: commit,
                },
            } },
        );
        await waitForCondition(() => saveSettings.mock.calls.length === 1);

        expect(saveSettings.mock.calls[0]?.[0]).toMatchObject({ accentColor: witnessedAccent });
        expect(fixture.state.settings.accentColor).toBe(witnessedAccent);
    });

    it('falls back to the valid top-level settings when an older export captured a torn persistence pair', async () => {
        const importedAccent = '#123456';
        const fixture = createSettingsRestoreFixture({ ...DEFAULT_SETTINGS, accentColor: '#654321' });

        await beginSettingsFileImport(
            fixture.form,
            { ...DEFAULT_SETTINGS, accentColor: importedAccent },
            { storage: {
                'jpdb-popup-reader-settings': {
                    accentColor: '#abcdef',
                    __yomuSettingsPersistenceCommitV1: 'settings-commit',
                },
                'yomu:settings-intent:v2': {
                    revision: 2,
                    records: { accentColor: { seq: 2, value: '#abcdef' } },
                    __yomuSettingsPersistenceCommitV1: 'different-intent-commit',
                },
                'jpdb-reader-transcript-panel-size': { width: 420 },
            } },
        );
        await waitForCondition(() => fixture.saveSettings.mock.calls.length === 1);

        expect(fixture.saveSettings.mock.calls[0]?.[0]).toMatchObject({ accentColor: importedAccent });
        expect(fixture.state.settings.accentColor).toBe(importedAccent);
        expect(JSON.parse(localStorage.getItem('jpdb-reader-transcript-panel-size') ?? 'null'))
            .toEqual({ width: 420 });
    });

    it('preserves current intent and derives changed keys for a 1.8.85-1.8.89 backup with no stored ledger', async () => {
        const previousAccent = '#654321';
        const importedAccent = '#123456';
        const { form, saveSettings } = createSettingsRestoreFixture({
            ...DEFAULT_SETTINGS,
            accentColor: previousAccent,
        });
        await beginSettingsFileImport(
            form,
            { ...DEFAULT_SETTINGS, accentColor: importedAccent },
            {
                storage: {
                    // v1.8.85/86/89 exported this canonical value, but only
                    // created yomu:settings-intent:v2 after a declared choice.
                    'jpdb-popup-reader-settings': { accentColor: importedAccent },
                    'yomu:prefer-japanese-site-language:v1': false,
                },
            },
        );
        await waitForCondition(() => saveSettings.mock.calls.length === 1);

        const options = restoreSaveOptions(saveSettings);
        expect(options.explicitUserChoiceKeys).toContain('accentColor');
        expect(options.clearExplicitUserChoiceKeys).toBeUndefined();
    });

    it('restores a same-valued legacy flat pin from a 1.8.85-1.8.89 backup with no v2 ledger', async () => {
        const { form, saveSettings } = createSettingsRestoreFixture({
            ...DEFAULT_SETTINGS,
            annotationsPaused: false,
        });
        await beginSettingsFileImport(
            form,
            { ...DEFAULT_SETTINGS, annotationsPaused: false },
            {
                storage: {
                    'jpdb-popup-reader-settings': { annotationsPaused: false },
                    'yomu:explicit-user-settings:v1': { annotationsPaused: false },
                },
            },
        );
        await waitForCondition(() => saveSettings.mock.calls.length === 1);

        const options = restoreSaveOptions(saveSettings);
        expect(options.explicitUserChoiceKeys).toContain('annotationsPaused');
        expect(options.clearExplicitUserChoiceKeys).toBeDefined();
    });

    it('does not roll back durable restore stages when the post-persistence host notification throws', async () => {
        const storedKey = 'jpdb-reader-transcript-panel-size';
        localStorage.setItem(storedKey, JSON.stringify({ width: 240 }));
        const onSettingsPersistenceFailed = vi.fn();
        const { dependencies, form } = createSettingsRestoreFixture(
            { ...DEFAULT_SETTINGS, accentColor: '#654321' },
            vi.fn().mockResolvedValue(undefined),
            {
            onSettingsPersisted: vi.fn(() => { throw new Error('host notification failed'); }),
            onSettingsPersistenceFailed,
            },
        );

        await beginSettingsFileImport(
            form,
            { ...DEFAULT_SETTINGS, accentColor: '#123456' },
            { storage: { [storedKey]: { width: 420 } } },
        );
        await expectSettingsImportSucceeded(dependencies.toast);

        expect(JSON.parse(localStorage.getItem(storedKey) ?? 'null')).toEqual({ width: 420 });
        expect(onSettingsPersistenceFailed).not.toHaveBeenCalled();
        expect(dependencies.toast).not.toHaveBeenCalledWith('Action failed.');
    });

    it('keeps committed import success visible when a post-commit UI refresh throws', async () => {
        const onSettingsPersistenceFailed = vi.fn();
        const fixture = createSettingsRestoreFixture(
            { ...DEFAULT_SETTINGS, accentColor: '#654321' },
            vi.fn().mockResolvedValue(undefined),
            {
            applyTheme: vi.fn(() => { throw new Error('theme host failed'); }),
            onSettingsPersistenceFailed,
            },
        );
        const { dependencies, form } = fixture;

        await beginSettingsFileImport(form, { ...DEFAULT_SETTINGS, accentColor: '#123456' });
        await expectSettingsImportSucceeded(dependencies.toast);

        expect(fixture.state.settings.accentColor).toBe('#123456');
        expect(dependencies.toast).not.toHaveBeenCalledWith('Action failed.');
        expect(onSettingsPersistenceFailed).not.toHaveBeenCalled();
    });

    it('waits behind an active dictionary import and disables dictionary mutations before a bundled restore starts', async () => {
        const queuedDictionary = deferred<ImportSummary>();
        const previousDictionaryBlob = new Blob([JSON.stringify({
            formatName: 'yomu-yomitan-dictionaries',
            formatVersion: 2,
            dictionaries: [],
            terms: [],
        })], { type: 'application/json' });
        const importFile = vi.fn()
            .mockImplementationOnce(() => queuedDictionary.promise)
            .mockResolvedValueOnce(importSummary('Imported Dictionary'));
        const dictionaries = dictionaryRestoreDependencies(previousDictionaryBlob, importFile);
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, accentColor: '#654321' };
        const saveSettings = vi.fn().mockResolvedValue(undefined);
        const { form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            saveSettings,
            dictionaries,
        }, 'backup');
        const dictionaryInput = settingsElement<HTMLInputElement>(form, 'input[data-file="dictionary"]');
        Object.defineProperty(dictionaryInput, 'files', {
            configurable: true,
            value: [new File(['earlier dictionary'], 'earlier-dictionary.zip', { type: 'application/zip' })],
        });
        settingsElement<HTMLButtonElement>(form, '[data-action="import-yomitan-dictionary"]').click();
        await waitForCondition(() => typeof dictionaryInput.onchange === 'function');
        dictionaryInput.dispatchEvent(new Event('change'));
        await waitForCondition(() => importFile.mock.calls.length === 1);

        await beginSettingsFileImport(
            form,
            { ...DEFAULT_SETTINGS, accentColor: '#123456' },
            importedDictionarySettingsBackup(),
        );
        await waitForCondition(() => settingsElement<HTMLButtonElement>(
            form,
            '[data-action="import-yomitan-dictionary"]',
        ).matches(':disabled'));

        expect(dictionaries.exportJson).not.toHaveBeenCalled();
        expect(importFile).toHaveBeenCalledOnce();
        expect(saveSettings).not.toHaveBeenCalled();
        expect(settingsElement<HTMLButtonElement>(form, '[data-action="clear-local-dictionary-site-storage"]').matches(':disabled'))
            .toBe(true);

        queuedDictionary.reject(new Error('earlier dictionary import failed'));
        await waitForCondition(() => saveSettings.mock.calls.length === 1);

        expect(dictionaries.exportJson).toHaveBeenCalledOnce();
        expect(importFile).toHaveBeenCalledTimes(2);
    });

    it('invalidates a delayed dictionary summary before it can mutate or save over restored settings', async () => {
        const staleSummary = deferred<{
            dictionaries: Array<{ title: string; type: 'terms' }>;
            terms: number;
            kanji: number;
            termMeta: number;
        }>();
        const summary = vi.fn()
            .mockImplementationOnce(() => staleSummary.promise)
            .mockResolvedValue({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0 });
        const persistence = deferred<void>();
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, accentColor: '#654321' };
        const saveSettings = vi.fn(() => persistence.promise);
        const dialog = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            saveSettings,
            dictionaries: { summary },
        }, 'backup');

        const refresh = dialog.refreshDictionaryStatus(dialog.form);
        await waitForCondition(() => summary.mock.calls.length === 1);
        await beginSettingsFileImport(dialog.form, { ...DEFAULT_SETTINGS, accentColor: '#123456' });
        await waitForCondition(() => saveSettings.mock.calls.length === 1);
        staleSummary.resolve({
            dictionaries: [{ title: 'Stale Summary Dictionary', type: 'terms' }],
            terms: 1,
            kanji: 0,
            termMeta: 0,
        });
        await refresh;

        expect(saveSettings).toHaveBeenCalledOnce();
        expect(settings.dictionaryPreferences).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'Stale Summary Dictionary' }),
        ]));

        persistence.resolve();
        await waitForCondition(() => settings.accentColor === '#123456');
        expect(saveSettings).toHaveBeenCalledOnce();
    });

    it('does not let a pre-existing transient Anki probe contaminate or clobber the imported candidate', async () => {
        const ankiProbe = deferred<boolean>();
        let settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            accentColor: '#654321',
            ankiEnabled: true,
        };
        const { dependencies, form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            saveSettings: vi.fn().mockResolvedValue(undefined),
            anki: { isConnected: vi.fn(() => ankiProbe.promise) },
        }, 'backup');
        await waitForCondition(() => dependencies.anki.isConnected.mock.calls.length === 1);

        await beginSettingsFileImport(form, { ...DEFAULT_SETTINGS, accentColor: '#123456', ankiEnabled: true });
        await waitForCondition(() => dependencies.toast.mock.calls.some(
            (call: unknown[]) => String(call[0]).startsWith('Settings imported'),
        ));
        expect(settings.accentColor).toBe('#123456');

        ankiProbe.resolve(true);
        await flushPromises();
        await flushPromises();

        expect(settings.accentColor).toBe('#123456');
    });

    it('freezes durable actions while a bundled restore is staged', async () => {
        const dictionaryImport = deferred<ImportSummary>();
        const previousDictionaryBlob = new Blob([JSON.stringify({
            formatName: 'yomu-yomitan-dictionaries',
            formatVersion: 2,
            dictionaries: [],
            terms: [],
        })], { type: 'application/json' });
        const exportJson = vi.fn().mockResolvedValue(previousDictionaryBlob);
        const importFile = vi.fn(() => dictionaryImport.promise);
        const resetAllData = vi.fn().mockResolvedValue(undefined);
        const saveSettings = vi.fn().mockResolvedValue(undefined);
        const { form } = createSettingsDialog({
            saveSettings,
            resetAllData,
            dictionaries: {
                exportJson,
                importFile,
                summary: vi.fn().mockResolvedValue({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0 }),
            },
        }, 'backup');

        await beginSettingsFileImport(
            form,
            { ...DEFAULT_SETTINGS, accentColor: '#123456' },
            importedDictionarySettingsBackup(),
        );
        await waitForCondition(() => importFile.mock.calls.length === 1);

        const blockedActions = [
            'sync-cloud-settings',
            'export-reader-settings',
            'export-yomitan-dictionary',
            'factory-reset',
            'connect-academy-account',
            'sync-academy-account',
            'create-academy-recovery-code',
            'disconnect-academy-account',
            'test-anki',
            'prepare-anki',
            'update-anki-model',
            'preview-audio',
        ];
        for (const action of blockedActions) {
            const button = settingsElement<HTMLButtonElement>(form, `[data-action="${action}"]`);
            expect(button.matches(':disabled'), action).toBe(true);
            button.click();
        }
        await flushPromises();

        expect(exportJson).toHaveBeenCalledOnce();
        expect(resetAllData).not.toHaveBeenCalled();
        expect(saveSettings).not.toHaveBeenCalled();

        dictionaryImport.resolve(importSummary('Imported Dictionary'));
        await waitForCondition(() => saveSettings.mock.calls.length === 1);
    });

    it('restores the exact prior dictionary snapshot when final settings publication fails', async () => {
        const persistence = deferred<void>();
        const previousDictionaryJson = JSON.stringify({
            formatName: 'yomu-yomitan-dictionaries',
            formatVersion: 2,
            dictionaries: [{ title: 'Previous Dictionary' }],
            terms: [{ dictionary: 'Previous Dictionary', expression: '読む' }],
        });
        const previousDictionaryBlob = new Blob([previousDictionaryJson], { type: 'application/json' });
        const importFile = vi.fn()
            .mockResolvedValueOnce(importSummary('Imported Dictionary'))
            .mockResolvedValueOnce(importSummary('Previous Dictionary'));
        const dictionaries = dictionaryRestoreDependencies(previousDictionaryBlob, importFile);
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, accentColor: '#654321' };
        const { dependencies, form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            saveSettings: vi.fn(() => persistence.promise),
            dictionaries,
        }, 'backup');
        const { saveButton } = await beginSettingsFileImport(
            form,
            { ...DEFAULT_SETTINGS, accentColor: '#123456' },
            importedDictionarySettingsBackup(),
        );
        await waitForCondition(() => importFile.mock.calls.length === 1);
        await waitForCondition(() => saveButton.disabled);

        await rejectSettingsPersistence(persistence, dependencies.toast);

        expect(dictionaries.exportJson).toHaveBeenCalledOnce();
        expect(importFile).toHaveBeenCalledTimes(2);
        const rollbackFile = importFile.mock.calls[1]![0] as File;
        expect(rollbackFile.name).toBe('yomu-dictionaries-before-settings-restore.json');
        expect(rollbackFile.type).toBe('application/json');
        expect(rollbackFile.size).toBe(previousDictionaryBlob.size);
        expect(settings.accentColor).toBe('#654321');
        expect(saveButton.disabled).toBe(false);
    });

    it('unlocks the current form when Settings is reopened before an older import fails', async () => {
        const persistence = deferred<void>();
        let settings: ReaderSettings = { ...DEFAULT_SETTINGS, accentColor: '#654321' };
        const saveSettings = vi.fn(() => persistence.promise);
        const { controller, dependencies, form } = createSettingsDialog({
            getSettings: () => settings,
            setSettings: (next: ReaderSettings) => { settings = next; },
            saveSettings,
        }, 'backup');
        await beginSettingsFileImport(form, { ...DEFAULT_SETTINGS, accentColor: '#123456' });
        await waitForCondition(() => saveSettings.mock.calls.length === 1);
        expect(settings.accentColor).toBe('#654321');

        form.remove();
        controller.open('backup');
        const reopened = Array.from(document.querySelectorAll<HTMLFormElement>('.jpdb-reader-settings')).at(-1)!;
        const reopenedSave = reopened.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        const reopenedImport = reopened.querySelector<HTMLButtonElement>('[data-action="import-yomitan-settings"]')!;
        expect(reopenedSave.disabled).toBe(true);
        expect(reopenedImport.matches(':disabled')).toBe(true);

        await rejectSettingsPersistence(persistence, dependencies.toast);

        expect(reopenedSave.disabled).toBe(false);
        expect(reopenedSave.textContent).toBe('Save');
        expect(reopenedImport.disabled).toBe(false);
    });

    it('reveals and focuses an invalid hidden imported setting instead of making Save look inert', async () => {
        const invalidEndpoint = 'not a URL';
        const fixture = createSettingsRestoreFixture(DEFAULT_SETTINGS);
        await beginSettingsFileImport(fixture.form, {
            ...DEFAULT_SETTINGS,
            ocrProvider: 'google-lens',
            ocrEndpointUrl: invalidEndpoint,
        });
        await expectSettingsImportSucceeded(fixture.dependencies.toast);

        const reopened = Array.from(document.querySelectorAll<HTMLFormElement>('.jpdb-reader-settings')).at(-1)!;
        const endpoint = settingsElement<HTMLInputElement>(reopened, 'input[name="ocrEndpointUrl"]');
        const mediaPanel = settingsElement<HTMLButtonElement>(reopened, '[data-action="settings-panel"][data-panel="media"]');
        const save = settingsElement<HTMLButtonElement>(reopened, 'button[type="submit"]');
        expect(endpoint.value).toBe(invalidEndpoint);
        expect(settingsAncestorIsHidden(endpoint, '[data-settings-panel]')).toBe(true);
        expect(settingsAncestorIsHidden(endpoint, '[data-local-ocr]')).toBe(true);
        fixture.dependencies.toast.mockClear();

        save.click();
        await flushPromises();

        expect(fixture.saveSettings).toHaveBeenCalledOnce();
        expect(mediaPanel.getAttribute('aria-selected')).toBe('true');
        expect(settingsAncestorIsHidden(endpoint, '[data-settings-panel]')).toBe(false);
        expect(settingsAncestorIsHidden(endpoint, '[data-local-ocr]')).toBe(false);
        expect(document.activeElement).toBe(endpoint);
        const status = settingsElement<HTMLElement>(reopened, '[data-settings-save-status]');
        expect(status.hidden).toBe(false);
        expect(status.textContent).toBe(endpoint.validationMessage);
        expect(fixture.dependencies.toast).toHaveBeenCalledWith(endpoint.validationMessage);
    });
});
