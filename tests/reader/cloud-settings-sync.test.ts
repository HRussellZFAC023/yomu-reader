import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';

async function importCloudSyncModule() {
    vi.resetModules();
    return await import('../../src/reader/settings/cloud-sync');
}

describe('Google Drive settings sync client', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
        localStorage.clear();
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

        const metadata = await cloudSync.uploadCloudSettingsToCloud({
            ...DEFAULT_SETTINGS,
            interfaceLanguage: 'en',
            apiKey: 'drive-api-key',
        });

        expect(cloudSync.CLOUD_SETTINGS_SYNC_ENABLED).toBe(true);
        expect(cloudSync.cloudSettingsSyncAvailable()).toBe(true);
        expect(metadata.fileId).toBe('drive-file-id');
        expect(messages).toHaveLength(1);
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
        const { renderSettingsForm } = await import('../../src/reader/settings/form');
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({ ...DEFAULT_SETTINGS, interfaceLanguage: 'en' }, 'https://jpdb.io/settings');
        const sourcesPanel = form.querySelector<HTMLElement>('#jpdb-reader-settings-panel-dictionaries')!;

        expect(sourcesPanel.querySelector('[data-cloud-settings-sync]')?.textContent).toContain('Google Drive settings sync');
        expect(sourcesPanel.querySelector('[data-action="sync-cloud-settings"]')?.textContent).toContain('Sync to Google Drive');
        expect(sourcesPanel.querySelector('[data-action="restore-cloud-settings"]')?.textContent).toContain('Restore from Google Drive');
    });

    it('restores settings through the extension Google Drive bridge', async () => {
        vi.stubGlobal('__YOMU_EXTENSION_BUILD__', true);
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
                            settings: { ...DEFAULT_SETTINGS, ankiTags: 'drive-restored' },
                        },
                    });
                },
            },
        });
        const cloudSync = await importCloudSyncModule();

        const snapshot = await cloudSync.downloadCloudSettingsFromCloud();

        expect(snapshot?.settings.ankiTags).toBe('drive-restored');
    });
});
