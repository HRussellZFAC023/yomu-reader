import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';
import { RETIRED_SETTINGS_STORAGE_KEYS } from '../../src/reader/settings/settings-authority-storage-keys';

async function importCloudSyncModule() {
    vi.resetModules();
    return await import('../../src/reader/settings/cloud-sync');
}

describe('Google Drive settings sync client', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.resetModules();
        localStorage.clear();
    });

    it.each<[string, Record<string, unknown> | undefined]>([
        ['missing snapshot', undefined],
        ['old version', { formatVersion: 0 }],
        ['missing version', { formatVersion: undefined }],
        ['future version', { formatVersion: 2 }],
        ['string version', { formatVersion: '1' }],
        ['wrong format', { formatName: 'yomu-reader-settings' }],
        ['array settings', { settings: [] }],
        ['null settings', { settings: null }],
        ['missing settings', { settings: undefined }],
        ['array storage', { storage: [] }],
        ['null storage', { storage: null }],
        ['invalid time', { syncedAt: 'secret-do-not-echo' }],
        ...RETIRED_SETTINGS_STORAGE_KEYS.map<[string, Record<string, unknown>]>(key => [key, { storage: { [key]: null } }]),
    ])('rejects %s on actual extension download before restore effects', async (_label, overrides) => {
        vi.stubGlobal('__YOMU_EXTENSION_BUILD__', true);
        vi.stubGlobal('__YOMU_GOOGLE_OAUTH_EXTENSION_CONFIGURED__', true);
        const snapshot = overrides === undefined ? undefined : {
            formatName: 'yomu-google-drive-settings-sync', formatVersion: 1,
            syncedAt: '2026-06-24T12:00:00.000Z', settings: { apiKey: 'secret-do-not-echo' },
            ...overrides,
        };
        const sendMessage = vi.fn(async () => ({ ok: true, snapshot }));
        vi.stubGlobal('browser', { runtime: { id: 'extension-id', sendMessage } });
        await importCloudSyncModule();
        const { SettingsCloudSyncCoordinator } = await import('../../src/reader/settings/settings-cloud-sync-coordinator');
        const effect = vi.fn();
        const write = vi.spyOn(Storage.prototype, 'setItem');
        const remove = vi.spyOn(Storage.prototype, 'removeItem');
        const clear = vi.spyOn(Storage.prototype, 'clear');
        const coordinator = new SettingsCloudSyncCoordinator({
            settings: () => DEFAULT_SETTINGS, stableSettings: () => DEFAULT_SETTINGS,
            currentForm: () => undefined,
            restore: { runRestore: async (_form: unknown, run: () => Promise<void>) => run() },
            setSettings: effect, saveCurrentSettings: effect, persistSettings: effect,
            adoptSettings: effect, toast: effect, runPostCommitEffect: effect, applyRestoreEffects: effect,
        } as unknown as ConstructorParameters<typeof SettingsCloudSyncCoordinator>[0]);
        await expect(coordinator.perform('restore-cloud-settings', 'en')).rejects.toThrow(/backup/);
        expect(effect).not.toHaveBeenCalled();
        expect(write).not.toHaveBeenCalled();
        expect(remove).not.toHaveBeenCalled();
        expect(clear).not.toHaveBeenCalled();
        expect(sendMessage).toHaveBeenCalledTimes(1);
        expect(sendMessage).toHaveBeenCalledWith({ type: 'yomu.googleDriveSettingsSync', command: 'download' });
    });

    it('returns null only for an explicit absent backup from the extension', async () => {
        vi.stubGlobal('__YOMU_EXTENSION_BUILD__', true);
        vi.stubGlobal('__YOMU_GOOGLE_OAUTH_EXTENSION_CONFIGURED__', true);
        vi.stubGlobal('browser', { runtime: { id: 'extension-id', sendMessage: async () => ({ ok: true, snapshot: null }) } });
        const mod = await importCloudSyncModule();
        expect(await mod.downloadCloudSettingsFromCloud()).toBeNull();
    });

    it('round-trips current cloud data through restore, durable intent and reload', async () => {
        vi.stubGlobal('__YOMU_EXTENSION_BUILD__', true);
        vi.stubGlobal('__YOMU_GOOGLE_OAUTH_EXTENSION_CONFIGURED__', true);
        let remote = '';
        const sendMessage = vi.fn(async (message: { command: string; snapshot?: unknown }) => {
            if (message.command === 'upload') {
                remote = JSON.stringify(message.snapshot);
                return { ok: true };
            }
            return { ok: true, snapshot: JSON.parse(remote) };
        });
        vi.stubGlobal('browser', { runtime: { id: 'extension-id', sendMessage } });
        const cloud = await importCloudSyncModule();
        const settings = await import('../../src/reader/settings');
        const storage = installGmStorageFixture();
        vi.stubGlobal('GM_listValues', vi.fn(async () => [...storage.values.keys()]));
        await settings.saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark', apiKey: 'fixture-key' }, {
            explicitUserChoiceKeys: ['theme', 'apiKey'],
        });
        await cloud.uploadCloudSettingsToCloud(await settings.loadSettings());
        await settings.saveSettings({ ...DEFAULT_SETTINGS, theme: 'light', apiKey: '' }, {
            explicitUserChoiceKeys: ['theme', 'apiKey'],
        });
        let current = await settings.loadSettings();
        const { SettingsCloudSyncCoordinator } = await import('../../src/reader/settings/settings-cloud-sync-coordinator');
        type Port = ConstructorParameters<typeof SettingsCloudSyncCoordinator>[0];
        const port: Port = {
            settings: () => current, stableSettings: () => current,
            currentForm: () => undefined,
            restore: { runRestore: async (_form, run) => run() } as Port['restore'],
            persistSettings: settings.saveSettings,
            setSettings: next => { current = next; },
            adoptSettings: next => { current = next; },
            saveCurrentSettings: vi.fn(), toast: vi.fn(), applyRestoreEffects: vi.fn(),
            runPostCommitEffect: (_label, effect) => { void effect(); },
        };
        await new SettingsCloudSyncCoordinator(port).perform('restore-cloud-settings', 'en');

        expect(current).toMatchObject({ theme: 'dark', apiKey: 'fixture-key' });
        expect(await settings.loadSettings()).toMatchObject({ theme: 'dark', apiKey: 'fixture-key' });
        const { readBackupSettingsPersistenceView } = await import('../../src/reader/settings/settings-persistence-transaction');
        const persisted = await readBackupSettingsPersistenceView(Object.fromEntries(storage.values));
        expect(persisted?.intentLedger.records).toMatchObject({
            theme: { value: 'dark' }, apiKey: { value: 'fixture-key' },
        });
        expect(sendMessage.mock.calls.map(([message]) => message.command)).toEqual(['upload', 'download']);
        expect(port.applyRestoreEffects).toHaveBeenCalledOnce();
    });

    it('is disabled outside extension builds', async () => {
        const cloudSync = await importCloudSyncModule();

        expect(cloudSync.CLOUD_SETTINGS_SYNC_ENABLED).toBe(false);
        expect(cloudSync.cloudSettingsSyncAvailable()).toBe(false);
        await expect(cloudSync.uploadCloudSettingsToCloud(DEFAULT_SETTINGS)).rejects.toThrow('Yomu extension');
    });

    it('uploads settings through the extension Google Drive bridge', async () => {
        const messages: unknown[] = [];
        vi.stubGlobal('__YOMU_EXTENSION_BUILD__', true);
        vi.stubGlobal('__YOMU_GOOGLE_OAUTH_EXTENSION_CONFIGURED__', true);
        localStorage.setItem('yomu:srs-local:v1', JSON.stringify({ version: 1, cards: { local: { expression: '読む' } } }));
        vi.stubGlobal('chrome', {
            runtime: {
                id: 'extension-id',
                sendMessage: (message: unknown, callback: (response: unknown) => void) => {
                    messages.push(message);
                    callback({
                        ok: true,
                        metadata: {
                            syncedAt: '2026-06-24T12:00:00.000Z',
                            fileId: 'drive-file-id',
                        },
                    });
                },
            },
        });
        const cloudSync = await importCloudSyncModule();

        const oldRuntimeSettings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'drive-api-key',
            newTabEnabled: false,
            uchisenEnabled: true,
        };
        const metadata = await cloudSync.uploadCloudSettingsToCloud(oldRuntimeSettings);

        expect(cloudSync.CLOUD_SETTINGS_SYNC_ENABLED).toBe(true);
        expect(cloudSync.cloudSettingsSyncAvailable()).toBe(true);
        expect(metadata.fileId).toBe('drive-file-id');
        expect(messages).toHaveLength(1);
        const uploaded = messages[0] as { snapshot: { settings: Record<string, unknown> } };
        expect(uploaded.snapshot.settings).not.toHaveProperty('newTabEnabled');
        expect(uploaded.snapshot.settings).not.toHaveProperty('uchisenEnabled');
        expect(messages[0]).toMatchObject({
            type: 'yomu.googleDriveSettingsSync',
            command: 'upload',
            snapshot: {
                formatName: 'yomu-google-drive-settings-sync',
                formatVersion: 1,
                settings: { apiKey: 'drive-api-key' },
                storage: { 'yomu:srs-local:v1': { version: 1, cards: { local: { expression: '読む' } } } },
            },
        });
    });

    it('renders Google Drive controls in extension builds', async () => {
        vi.stubGlobal('__YOMU_EXTENSION_BUILD__', true);
        vi.stubGlobal('__YOMU_GOOGLE_OAUTH_EXTENSION_CONFIGURED__', true);
        const { renderSettingsForm } = await import('../../src/reader/settings/form');
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({ ...DEFAULT_SETTINGS, interfaceLanguage: 'en' }, 'https://jpdb.io/settings');
        const backupPanel = form.querySelector<HTMLElement>('#jpdb-reader-settings-panel-backup')!;

        expect(backupPanel.querySelector('[data-cloud-settings-sync]')?.textContent).toContain('Google Drive settings sync');
        expect(backupPanel.querySelector('[data-action="sync-cloud-settings"]')?.textContent).toContain('Sync to Google Drive');
        expect(backupPanel.querySelector('[data-action="restore-cloud-settings"]')?.textContent).toContain('Restore from Google Drive');
    });

    it('restores settings through the extension Google Drive bridge', async () => {
        vi.stubGlobal('__YOMU_EXTENSION_BUILD__', true);
        vi.stubGlobal('__YOMU_GOOGLE_OAUTH_EXTENSION_CONFIGURED__', true);
        vi.stubGlobal('chrome', {
            runtime: {
                id: 'extension-id',
                sendMessage: (message: unknown, callback: (response: unknown) => void) => {
                    expect(message).toMatchObject({
                        type: 'yomu.googleDriveSettingsSync',
                        command: 'download',
                    });
                    callback({
                        ok: true,
                        snapshot: {
                            formatName: 'yomu-google-drive-settings-sync',
                            formatVersion: 1,
                            syncedAt: '2026-06-24T12:00:00.000Z',
                            settings: { ...DEFAULT_SETTINGS, ankiTags: 'drive-restored', apiKey: 'backup-credential' },
                            storage: { 'yomu:srs-local:v1': { version: 1, cards: { local: { expression: '読む' } } } },
                        },
                    });
                },
            },
        });
        const cloudSync = await importCloudSyncModule();

        const snapshot = await cloudSync.downloadCloudSettingsFromCloud();

        expect(snapshot?.settings.ankiTags).toBe('drive-restored');
        expect(snapshot?.settings.apiKey).toBe('backup-credential');
        expect(snapshot?.storage).toEqual({ 'yomu:srs-local:v1': { version: 1, cards: { local: { expression: '読む' } } } });
    });
});
