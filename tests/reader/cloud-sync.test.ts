import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { gmStorageGet, gmStorageSet } from '../../src/reader/app/storage';
import {
    GOOGLE_DRIVE_SCOPE,
    GOOGLE_DRIVE_TOKEN_STORAGE_KEY,
    GoogleDriveSyncClient,
    createReaderSettingsBackupBlob,
} from '../../src/reader/settings/cloud-sync';

describe('Google Drive cloud sync', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        vi.stubGlobal('GM', undefined);
    });

    afterEach(() => {
        localStorage.clear();
        vi.unstubAllGlobals();
    });

    it('creates reader backup bundles with settings, storage, and dictionaries', async () => {
        localStorage.setItem('jpdb-reader-newtab-ui', JSON.stringify({ mode: 'kanji' }));
        localStorage.setItem(GOOGLE_DRIVE_TOKEN_STORAGE_KEY, JSON.stringify({ refreshToken: 'secret' }));

        const blob = await createReaderSettingsBackupBlob(
            { ...DEFAULT_SETTINGS, interfaceLanguage: 'en', googleDriveClientId: 'client.apps.googleusercontent.com' },
            { formatName: 'yomu-yomitan-dictionaries', dictionaries: [{ title: 'Jitendex' }] },
        );
        const json = JSON.parse(await blobText(blob)) as {
            formatName?: string;
            formatVersion?: number;
            settings?: { googleDriveClientId?: string };
            storage?: Record<string, unknown>;
            dictionaries?: { dictionaries?: Array<{ title?: string }> };
        };

        expect(json.formatName).toBe('yomu-reader-settings');
        expect(json.formatVersion).toBe(3);
        expect(json.settings?.googleDriveClientId).toBe('client.apps.googleusercontent.com');
        expect(json.storage).toEqual({ 'jpdb-reader-newtab-ui': { mode: 'kanji' } });
        expect(json.storage).not.toHaveProperty(GOOGLE_DRIVE_TOKEN_STORAGE_KEY);
        expect(json.dictionaries?.dictionaries?.[0]?.title).toBe('Jitendex');
    });

    it('uses OAuth device flow when no Google Drive token is stored', async () => {
        let now = 1_000_000;
        const openUrl = vi.fn();
        const statuses: string[] = [];
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url === 'https://oauth2.googleapis.com/device/code') {
                expect(String(init?.body)).toContain(`scope=${encodeURIComponent(GOOGLE_DRIVE_SCOPE)}`);
                return jsonResponse({
                    device_code: 'device-code',
                    user_code: 'ABCD-EFGH',
                    verification_url: 'https://google.example/device',
                    verification_url_complete: 'https://google.example/device?user_code=ABCD-EFGH',
                    expires_in: 600,
                    interval: 1,
                });
            }
            if (url === 'https://oauth2.googleapis.com/token') {
                const body = String(init?.body);
                expect(body).toContain('device_code=device-code');
                if (fetchMock.mock.calls.filter(([calledUrl]) => String(calledUrl) === url).length === 1) {
                    return jsonResponse({ error: 'authorization_pending' }, 400);
                }
                return jsonResponse({
                    access_token: 'fresh-access',
                    refresh_token: 'fresh-refresh',
                    expires_in: 3600,
                    scope: GOOGLE_DRIVE_SCOPE,
                    token_type: 'Bearer',
                });
            }
            throw new Error(`Unexpected request: ${url}`);
        });
        vi.stubGlobal('fetch', fetchMock);

        const client = new GoogleDriveSyncClient('client-id', {
            now: () => now,
            openUrl,
            sleep: async ms => { now += ms; },
        });

        await expect(client.ensureAccessToken(message => statuses.push(message))).resolves.toBe('fresh-access');

        expect(openUrl).toHaveBeenCalledWith('https://google.example/device?user_code=ABCD-EFGH');
        expect(statuses.join('\n')).toContain('ABCD-EFGH');
        await expect(gmStorageGet(GOOGLE_DRIVE_TOKEN_STORAGE_KEY, null)).resolves.toMatchObject({
            accessToken: 'fresh-access',
            clientId: 'client-id',
            refreshToken: 'fresh-refresh',
        });
    });

    it('refreshes an expired token and uploads a multipart backup into appDataFolder', async () => {
        await gmStorageSet(GOOGLE_DRIVE_TOKEN_STORAGE_KEY, {
            accessToken: 'expired-access',
            clientId: 'client-id',
            expiresAt: 0,
            refreshToken: 'stored-refresh',
            scope: GOOGLE_DRIVE_SCOPE,
            tokenType: 'Bearer',
        });
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url === 'https://oauth2.googleapis.com/token') {
                expect(String(init?.body)).toContain('refresh_token=stored-refresh');
                return jsonResponse({
                    access_token: 'fresh-access',
                    expires_in: 3600,
                    scope: GOOGLE_DRIVE_SCOPE,
                    token_type: 'Bearer',
                });
            }
            if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
                expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer fresh-access');
                const body = init?.body as Blob;
                const uploadText = await blobText(body);
                expect(uploadText).toContain('"parents":["appDataFolder"]');
                expect(uploadText).toContain('"yomuBackup":"settings-v3"');
                return jsonResponse({
                    id: 'drive-file',
                    name: 'backup-chrome-test.json',
                    size: '42',
                    createdTime: '2026-01-01T00:00:00.000Z',
                    modifiedTime: '2026-01-01T00:00:00.000Z',
                });
            }
            throw new Error(`Unexpected request: ${url}`);
        });
        vi.stubGlobal('fetch', fetchMock);

        const client = new GoogleDriveSyncClient('client-id', { now: () => 2_000_000 });
        await expect(client.uploadBackup(new Blob(['{"ok":true}']), 'backup-chrome-test.json')).resolves.toMatchObject({
            id: 'drive-file',
            name: 'backup-chrome-test.json',
            size: 42,
        });
        await expect(gmStorageGet(GOOGLE_DRIVE_TOKEN_STORAGE_KEY, null)).resolves.toMatchObject({
            accessToken: 'fresh-access',
            refreshToken: 'stored-refresh',
        });
    });

    it('lists, downloads, and deletes appDataFolder backups with bearer auth', async () => {
        await gmStorageSet(GOOGLE_DRIVE_TOKEN_STORAGE_KEY, {
            accessToken: 'valid-access',
            clientId: 'client-id',
            expiresAt: 9_999_999,
            refreshToken: 'stored-refresh',
            scope: GOOGLE_DRIVE_SCOPE,
            tokenType: 'Bearer',
        });
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer valid-access');
            if (url.startsWith('https://www.googleapis.com/drive/v3/files?')) {
                const params = new URL(url).searchParams;
                expect(params.get('spaces')).toBe('appDataFolder');
                expect(params.get('q')).toContain("name contains 'backup-'");
                return jsonResponse({
                    files: [
                        { id: 'old', name: 'backup-safari-old.json', size: '20', createdTime: '2026-01-01T00:00:00.000Z', modifiedTime: '2026-01-01T00:00:00.000Z' },
                        { id: 'ignored', name: 'notes.json', size: '10', createdTime: '2026-03-01T00:00:00.000Z', modifiedTime: '2026-03-01T00:00:00.000Z' },
                        { id: 'new', name: 'backup-chrome-new.json', size: '30', createdTime: '2026-02-01T00:00:00.000Z', modifiedTime: '2026-02-01T00:00:00.000Z' },
                    ],
                });
            }
            if (url === 'https://www.googleapis.com/drive/v3/files/new?alt=media') {
                return new Response('{"formatName":"yomu-reader-settings"}', { status: 200 });
            }
            if (url === 'https://www.googleapis.com/drive/v3/files/new' && init?.method === 'DELETE') {
                return new Response(null, { status: 204 });
            }
            throw new Error(`Unexpected request: ${url}`);
        });
        vi.stubGlobal('fetch', fetchMock);

        const client = new GoogleDriveSyncClient('client-id', { now: () => 2_000_000 });
        await expect(client.listBackups()).resolves.toEqual([
            expect.objectContaining({ id: 'new', name: 'backup-chrome-new.json', size: 30 }),
            expect.objectContaining({ id: 'old', name: 'backup-safari-old.json', size: 20 }),
        ]);
        await expect(blobText(await client.downloadBackup('new'))).resolves.toContain('yomu-reader-settings');
        await expect(client.deleteBackup('new')).resolves.toBeUndefined();
    });
});

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function blobText(blob: Blob): Promise<string> {
    const nativeText = (blob as Blob & { text?: () => Promise<string> }).text;
    if (typeof nativeText === 'function') return nativeText.call(blob);
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error ?? new Error('Could not read blob.'));
        reader.readAsText(blob);
    });
}
