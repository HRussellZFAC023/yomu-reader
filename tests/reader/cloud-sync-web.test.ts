import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { requestJson, requestText } = vi.hoisted(() => ({
    requestJson: vi.fn(),
    requestText: vi.fn(),
}));

vi.mock('../../src/reader/network/http', () => ({ requestJson, requestText }));

const CLIENT_ID = 'abc123.apps.googleusercontent.com';

function stubGoogleToken(token = 'tok-123', expiresIn = 3600): void {
    vi.stubGlobal('google', {
        accounts: {
            oauth2: {
                initTokenClient: (config: { callback: (r: { access_token: string; expires_in: number }) => void }) => ({
                    requestAccessToken: () => config.callback({ access_token: token, expires_in: expiresIn }),
                }),
            },
        },
    });
}

async function loadModule(clientId: string | undefined = CLIENT_ID) {
    const globals = globalThis as Record<string, unknown>;
    if (clientId === undefined) delete globals.__YOMU_GOOGLE_OAUTH_WEB_CLIENT_ID__;
    else globals.__YOMU_GOOGLE_OAUTH_WEB_CLIENT_ID__ = clientId;
    vi.resetModules();
    return import('../../src/reader/settings/cloud-sync-web');
}

describe('cloud-sync-web (serverless Google Drive settings sync)', () => {
    beforeEach(() => {
        requestJson.mockReset();
        requestText.mockReset();
        stubGoogleToken();
        const globals = globalThis as Record<string, unknown>;
        delete globals.GM;
        delete globals.GM_info;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        delete (globalThis as Record<string, unknown>).__YOMU_GOOGLE_OAUTH_WEB_CLIENT_ID__;
    });

    it('is enabled when a web OAuth client id is configured', async () => {
        const enabled = await loadModule(CLIENT_ID);
        expect(enabled.CLOUD_SETTINGS_SYNC_ENABLED).toBe(true);
        expect(enabled.cloudSettingsSyncAvailable()).toBe(true);
    });

    it('creates a new appData file on first upload, authorised with a GIS bearer token', async () => {
        requestJson.mockImplementation(async (url: string) => {
            if (url.includes('uploadType=multipart')) return { id: 'file-1', modifiedTime: '2026-06-25T00:00:00Z' };
            if (url.includes('spaces=appDataFolder')) return { files: [] };
            throw new Error(`unexpected ${url}`);
        });
        const mod = await loadModule();
        const meta = await mod.uploadCloudSettingsToCloud({ theme: 'dark' } as never);

        expect(meta.fileId).toBe('file-1');
        const create = requestJson.mock.calls.find(([u]) => String(u).includes('uploadType=multipart'));
        expect(create?.[1]?.method).toBe('POST');
        expect(create?.[1]?.headers?.Authorization).toBe('Bearer tok-123');
        expect(create?.[1]?.allowDirectCrossOrigin).toBe(true);
        expect(String(create?.[1]?.data)).toContain('appDataFolder');
        expect(String(create?.[1]?.data)).toContain('"theme":"dark"');
    });

    it('updates the existing appData file when one is already present', async () => {
        requestJson.mockImplementation(async (url: string) => {
            if (url.includes('/files/file-9?uploadType=media')) return { id: 'file-9', modifiedTime: 'm' };
            if (url.includes('spaces=appDataFolder')) return { files: [{ id: 'file-9' }] };
            throw new Error(`unexpected ${url}`);
        });
        const mod = await loadModule();
        const meta = await mod.uploadCloudSettingsToCloud({ a: 1 } as never);

        expect(meta.fileId).toBe('file-9');
        const patch = requestJson.mock.calls.find(([u]) => String(u).includes('/files/file-9'));
        expect(patch?.[1]?.method).toBe('PATCH');
    });

    it('downloads and validates the stored snapshot', async () => {
        requestJson.mockResolvedValue({ files: [{ id: 'file-1' }] });
        requestText.mockResolvedValue(JSON.stringify({
            formatName: 'yomu-google-drive-settings-sync',
            formatVersion: 1,
            syncedAt: 's',
            settings: { theme: 'dark' },
        }));
        const mod = await loadModule();
        const snapshot = await mod.downloadCloudSettingsFromCloud();
        expect(snapshot?.settings).toEqual({ theme: 'dark' });
    });

    it('returns null when no settings file exists', async () => {
        requestJson.mockResolvedValue({ files: [] });
        const mod = await loadModule();
        expect(await mod.downloadCloudSettingsFromCloud()).toBeNull();
    });

    it('rejects a snapshot with the wrong format marker', async () => {
        requestJson.mockResolvedValue({ files: [{ id: 'file-1' }] });
        requestText.mockResolvedValue(JSON.stringify({ formatName: 'not-yomu', settings: {} }));
        const mod = await loadModule();
        expect(await mod.downloadCloudSettingsFromCloud()).toBeNull();
    });
});
