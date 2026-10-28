import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RETIRED_SETTINGS_STORAGE_KEYS } from '../../src/reader/settings/settings-authority-storage-keys';
import { v193CloudSnapshot } from './helpers/upgrade-v193-corpus';

const { requestJson, requestText } = vi.hoisted(() => ({
    requestJson: vi.fn(),
    requestText: vi.fn(),
}));

vi.mock('../../src/reader/network/http', () => ({ requestJson, requestText }));

const CLIENT_ID = '697885991868-bj7l5ja9vgbgk5i2ojcf5jfnkdg5h47g.apps.googleusercontent.com';
const RETURN_STATE = 'a'.repeat(48);
const OTHER_STATE = 'b'.repeat(48);

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

function installOAuthReturnToken(accessToken: string, existingHash = ''): void {
    const tokenPayload = JSON.stringify({
        type: 'yomu-drive-oauth-token',
        state: RETURN_STATE,
        accessToken,
        expiresIn: 1200,
    });
    const prefix = existingHash ? `${existingHash}&` : '';
    history.replaceState(null, '', `/reader/#${prefix}yomu-drive-oauth-return=${RETURN_STATE}&yomu-drive-oauth-token=${encodeURIComponent(tokenPayload)}`);
}

function mockEmptyDriveUpload(id: string, modifiedTime?: string): void {
    requestJson.mockImplementation(async (url: string) => {
        if (url.includes('uploadType=multipart')) return { id, modifiedTime };
        if (url.includes('spaces=appDataFolder')) return { files: [] };
        throw new Error(`unexpected ${url}`);
    });
}

interface RecordedDriveRequest {
    method?: string;
    headers?: Record<string, string>;
    allowDirectCrossOrigin?: boolean;
    data?: unknown;
}

function createdUploadRequest(): RecordedDriveRequest {
    const create = requestJson.mock.calls.find(([url]) => String(url).includes('uploadType=multipart'));
    if (!create) throw new Error('Expected a Drive multipart upload request.');
    return create[1] as RecordedDriveRequest;
}

function expectUploadAuthorization(token: string): void {
    expect(createdUploadRequest().headers?.Authorization).toBe(`Bearer ${token}`);
}

describe('cloud-sync-web (serverless Google Drive settings sync)', () => {
    beforeEach(() => {
        requestJson.mockReset();
        requestText.mockReset();
        stubGoogleToken();
        localStorage.clear();
        const globals = globalThis as Record<string, unknown>;
        delete globals.GM;
        delete globals.GM_info;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        localStorage.clear();
        window.name = '';
        history.replaceState(null, '', '/');
        delete (globalThis as Record<string, unknown>).__YOMU_GOOGLE_OAUTH_WEB_CLIENT_ID__;
        delete (globalThis as Record<string, unknown>).__YOMU_TEST_NAVIGATE_TO_OAUTH__;
    });

    it('is enabled when a web OAuth client id is configured', async () => {
        const enabled = await loadModule(CLIENT_ID);
        expect(enabled.CLOUD_SETTINGS_SYNC_ENABLED).toBe(true);
        expect(enabled.cloudSettingsSyncAvailable()).toBe(true);
    });

    it('creates a new appData file on first upload, authorised with a GIS bearer token', async () => {
        localStorage.setItem('yomu:srs-local:v1', JSON.stringify({ version: 1, cards: { local: { expression: '読む' } } }));
        mockEmptyDriveUpload('file-1', '2026-06-25T00:00:00Z');
        const mod = await loadModule();
        const meta = await mod.uploadCloudSettingsToCloud({ theme: 'dark', apiKey: 'backup-credential', newTabEnabled: false, uchisenEnabled: true } as never);

        expect(meta.fileId).toBe('file-1');
        const create = createdUploadRequest();
        expect(create.method).toBe('POST');
        expect(create.headers?.Authorization).toBe('Bearer tok-123');
        expect(create.allowDirectCrossOrigin).toBe(true);
        expect(String(create.data)).toContain('appDataFolder');
        expect(String(create.data)).toContain('"theme":"dark"');
        expect(String(create.data)).toContain('"apiKey":"backup-credential"');
        expect(String(create.data)).toContain('"yomu:srs-local:v1"');
        expect(String(create.data)).not.toContain('"newTabEnabled"');
        expect(String(create.data)).not.toContain('"uchisenEnabled"');
    });

    it('navigates the current tab to the hosted OAuth broker from userscript contexts', async () => {
        const navigate = vi.fn();
        const open = vi.spyOn(window, 'open');
        vi.stubGlobal('__YOMU_TEST_NAVIGATE_TO_OAUTH__', navigate);
        vi.stubGlobal('GM_info', { script: { name: 'Yomu' } });
        const mod = await loadModule();

        void mod.uploadCloudSettingsToCloud({ theme: 'dark' } as never, { state: RETURN_STATE });
        await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
        const brokerUrl = new URL(String(navigate.mock.calls[0]?.[0]));
        expect(brokerUrl.origin + brokerUrl.pathname).toBe('https://yomureader.com/oauth/google-drive.html');
        expect(brokerUrl.searchParams.get('client_id')).toBe(CLIENT_ID);
        expect(brokerUrl.searchParams.get('return_url')).toBe(window.location.href);
        expect(brokerUrl.searchParams.get('state')).toBe(RETURN_STATE);
        expect(open).not.toHaveBeenCalled();
        expect(requestJson).not.toHaveBeenCalled();
    });

    it('refuses a userscript redirect that has no precommitted private state', async () => {
        const navigate = vi.fn();
        vi.stubGlobal('__YOMU_TEST_NAVIGATE_TO_OAUTH__', navigate);
        vi.stubGlobal('GM_info', { script: { name: 'Yomu' } });
        const mod = await loadModule();

        await expect(mod.uploadCloudSettingsToCloud({ theme: 'dark' } as never))
            .rejects.toThrow('private pending Yomu action');
        expect(navigate).not.toHaveBeenCalled();
        expect(requestJson).not.toHaveBeenCalled();
    });

    it('consumes a same-tab OAuth return token from the URL fragment and resumes Drive requests without a popup', async () => {
        installOAuthReturnToken('returned-token', 'chapter=1');
        mockEmptyDriveUpload('file-return', '2026-06-25T00:00:00Z');
        const mod = await loadModule();

        expect(mod.cloudSettingsAuthRedirectResult(RETURN_STATE)).toEqual({ ok: true, state: RETURN_STATE, error: undefined });
        expect(mod.cloudSettingsAuthRedirectResult(RETURN_STATE)).toBeNull();
        expect(window.name).toBe('');
        expect(location.hash).toBe('#chapter=1');

        const meta = await mod.uploadCloudSettingsToCloud({ theme: 'dark' } as never);
        expect(meta.fileId).toBe('file-return');
        expectUploadAuthorization('returned-token');
    });

    it('scrubs and rejects the legacy window.name token fallback', async () => {
        window.name = JSON.stringify({
            type: 'yomu-drive-oauth-token',
            state: RETURN_STATE,
            accessToken: 'window-name-token',
            expiresIn: 1200,
        });
        history.replaceState(null, '', `/reader/#yomu-drive-oauth-return=${RETURN_STATE}`);
        mockEmptyDriveUpload('file-window-name', '2026-06-25T00:00:00Z');
        const mod = await loadModule();

        expect(mod.cloudSettingsAuthRedirectResult(RETURN_STATE)).toEqual({
            ok: false,
            state: RETURN_STATE,
            error: 'Google authorization returned without a Yomu token.',
        });
        expect(window.name).toBe('');
        expect(location.hash).toBe('');

        await mod.uploadCloudSettingsToCloud({ theme: 'dark' } as never);
        expectUploadAuthorization('tok-123');
    });

    it('quarantines a forged hash token when its state does not match the private pending action', async () => {
        installOAuthReturnToken('forged-token');
        mockEmptyDriveUpload('file-safe');
        const mod = await loadModule();

        expect(mod.cloudSettingsAuthRedirectResult(OTHER_STATE)).toEqual({
            ok: false,
            state: RETURN_STATE,
            error: 'Google authorization did not match the pending Yomu action.',
        });
        expect(mod.cloudSettingsAuthRedirectResult(RETURN_STATE)).toBeNull();
        await mod.uploadCloudSettingsToCloud({ theme: 'dark' } as never);

        expectUploadAuthorization('tok-123');
        expect(location.hash).toBe('');
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
            syncedAt: '2026-06-25T00:00:00.000Z',
            settings: { theme: 'dark', apiKey: 'backup-credential' },
            storage: { 'yomu:srs-local:v1': { version: 1, cards: {} } },
        }));
        const mod = await loadModule();
        const snapshot = await mod.downloadCloudSettingsFromCloud();
        expect(snapshot?.settings).toEqual({ theme: 'dark', apiKey: 'backup-credential' });
        expect(snapshot?.storage).toEqual({ 'yomu:srs-local:v1': { version: 1, cards: {} } });
    });

    it('accepts the Drive snapshot v1.9.3 uploaded, retired storage keys included', async () => {
        const uploaded = v193CloudSnapshot();
        requestJson.mockResolvedValue({ files: [{ id: 'file-1' }] });
        requestText.mockResolvedValue(JSON.stringify(uploaded));
        const mod = await loadModule();
        const snapshot = await mod.downloadCloudSettingsFromCloud();
        expect(snapshot?.settings).toEqual(uploaded.settings);
        expect(Object.keys(snapshot?.storage ?? {})).toEqual(expect.arrayContaining([...RETIRED_SETTINGS_STORAGE_KEYS].filter(key => Object.hasOwn(uploaded.storage as object, key))));
    });

    it('returns null when no settings file exists', async () => {
        requestJson.mockResolvedValue({ files: [] });
        const mod = await loadModule();
        expect(await mod.downloadCloudSettingsFromCloud()).toBeNull();
        expect(requestText).not.toHaveBeenCalled();
    });

    it.each<[string, Record<string, unknown>]>([
        ['wrong format', { formatName: 'not-yomu' }],
        ['old version', { formatVersion: 0 }],
        ['missing version', { formatVersion: undefined }],
        ['future version', { formatVersion: 2 }],
        ['string version', { formatVersion: '1' }],
        ['array settings', { settings: [] }],
        ['null settings', { settings: null }],
        ['missing settings', { settings: undefined }],
        ['array storage', { storage: [] }],
        ['null storage', { storage: null }],
        ['invalid time', { syncedAt: 'secret-do-not-echo' }],
    ])('rejects %s from the Drive media response without writing', async (_label, overrides) => {
        requestJson.mockResolvedValue({ files: [{ id: 'file-1' }] });
        requestText.mockResolvedValue(JSON.stringify({
            formatName: 'yomu-google-drive-settings-sync', formatVersion: 1,
            syncedAt: '2026-06-25T00:00:00.000Z', settings: { apiKey: 'secret-do-not-echo' }, ...overrides,
        }));
        const mod = await loadModule();
        const write = vi.spyOn(Storage.prototype, 'setItem');
        const remove = vi.spyOn(Storage.prototype, 'removeItem');
        const clear = vi.spyOn(Storage.prototype, 'clear');
        const error = await mod.downloadCloudSettingsFromCloud().catch(error => error);
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toMatch(/backup/);
        expect(error.message).not.toContain('secret-do-not-echo');
        expect(error.yomuUiCopyKey).toMatch(/^settingsImport(UnsupportedFormat|Incomplete)$/);
        expect(requestJson).toHaveBeenCalledTimes(1);
        expect(requestText).toHaveBeenCalledTimes(1);
        for (const [, options] of [...requestJson.mock.calls, ...requestText.mock.calls]) expect(options.method).toBe('GET');
        expect(write).not.toHaveBeenCalled();
        expect(remove).not.toHaveBeenCalled();
        expect(clear).not.toHaveBeenCalled();
    });

    it.each(['{ "apiKey": "secret-do-not-echo"', 'null', '[]'])('rejects malformed media %s with a secret-free error', async body => {
        requestJson.mockResolvedValue({ files: [{ id: 'file-1' }] });
        requestText.mockResolvedValue(body);
        const mod = await loadModule();
        await expect(mod.downloadCloudSettingsFromCloud()).rejects.toThrow('This settings backup format is not supported.');
    });
});
