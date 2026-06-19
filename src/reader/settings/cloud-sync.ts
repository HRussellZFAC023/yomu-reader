import { Logger } from '../app/logger';
import { gmStorageDelete, gmStorageGet, gmStorageSet, exportManagedStoredValues } from '../app/storage';
import { getUserscriptHttpRequest } from '../userscript/index';
import type { ReaderSettings } from '../app/types';

export const GOOGLE_DRIVE_TOKEN_STORAGE_KEY = 'yomu:google-drive-oauth:v1';
export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

const DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const BACKUP_MIME_TYPE = 'application/json';
const BACKUP_NAME_PREFIX = 'backup-';
const TOKEN_REFRESH_SKEW_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const log = Logger.scope('CloudSync');

export interface ReaderSettingsBackupBundle {
    formatName: 'yomu-reader-settings';
    formatVersion: 3;
    exportedAt: string;
    settings: ReaderSettings;
    storage: Record<string, unknown>;
    dictionaries?: unknown;
}

export interface GoogleDriveBackupFile {
    id: string;
    name: string;
    size: number;
    createdTime: string;
    modifiedTime: string;
}

interface GoogleDriveTokenState {
    accessToken: string;
    clientId: string;
    expiresAt: number;
    refreshToken: string;
    scope: string;
    tokenType: string;
}

interface DeviceCodeResponse {
    device_code: string;
    user_code: string;
    verification_url: string;
    verification_url_complete?: string;
    expires_in: number;
    interval?: number;
}

interface TokenResponse {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
    error?: string;
    error_description?: string;
}

interface GoogleDriveFileResponse {
    id?: string;
    name?: string;
    size?: string;
    createdTime?: string;
    modifiedTime?: string;
}

interface GoogleDriveFilesListResponse {
    files?: GoogleDriveFileResponse[];
}

type CloudSyncStatus = (message: string) => void;
type Sleep = (ms: number) => Promise<void>;
type OpenUrl = (url: string) => void;
type Now = () => number;

interface GoogleDriveSyncClientOptions {
    now?: Now;
    openUrl?: OpenUrl;
    sleep?: Sleep;
}

interface GoogleRequestOptions {
    accessToken?: string;
    allowErrorStatus?: boolean;
    data?: string | Blob;
    headers?: Record<string, string>;
    method?: string;
    responseType?: 'json' | 'blob' | 'text';
    timeoutMs?: number;
}

interface GoogleResponse<T> {
    body: T;
    status: number;
}

export async function createReaderSettingsBackupBlob(settings: ReaderSettings, dictionaries?: unknown): Promise<Blob> {
    const bundle: ReaderSettingsBackupBundle = {
        formatName: 'yomu-reader-settings',
        formatVersion: 3,
        exportedAt: new Date().toISOString(),
        settings,
        storage: await exportManagedStoredValues(),
        ...(dictionaries ? { dictionaries } : {}),
    };
    return new Blob([JSON.stringify(bundle, null, 2)], { type: BACKUP_MIME_TYPE });
}

export function googleDriveBackupFileName(date = new Date(), userAgent = navigator.userAgent): string {
    return `${BACKUP_NAME_PREFIX}${browserSlug(userAgent)}-${date.toISOString().replace(/[:.]/g, '-')}.json`;
}

export class GoogleDriveSyncClient {
    private readonly now: Now;
    private readonly openUrl: OpenUrl;
    private readonly sleep: Sleep;

    constructor(private readonly clientId: string, options: GoogleDriveSyncClientOptions = {}) {
        this.now = options.now ?? (() => Date.now());
        this.openUrl = options.openUrl ?? openExternalUrl;
        this.sleep = options.sleep ?? delay;
    }

    async uploadBackup(blob: Blob, filename = googleDriveBackupFileName(), onStatus: CloudSyncStatus = noopStatus): Promise<GoogleDriveBackupFile> {
        const accessToken = await this.ensureAccessToken(onStatus);
        onStatus('Uploading backup to Google Drive...');
        const boundary = `yomu-drive-${this.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        const metadata = JSON.stringify({
            name: filename,
            mimeType: BACKUP_MIME_TYPE,
            parents: ['appDataFolder'],
            appProperties: { yomuBackup: 'settings-v3' },
        });
        const body = new Blob([
            `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
            metadata,
            `\r\n--${boundary}\r\nContent-Type: ${BACKUP_MIME_TYPE}\r\n\r\n`,
            blob,
            `\r\n--${boundary}--`,
        ], { type: `multipart/related; boundary=${boundary}` });
        const response = await authorizedGoogleJson<GoogleDriveFileResponse>(
            `${DRIVE_UPLOAD_URL}?${new URLSearchParams({
                uploadType: 'multipart',
                fields: 'id,name,size,createdTime,modifiedTime',
            })}`,
            accessToken,
            {
                method: 'POST',
                headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
                data: body,
                timeoutMs: Math.max(DEFAULT_TIMEOUT_MS, Math.min(300_000, Math.max(blob.size / 1024, 30_000))),
            },
        );
        const file = normalizeBackupFile(response.body);
        onStatus(`Uploaded ${file.name} to Google Drive.`);
        return file;
    }

    async listBackups(onStatus: CloudSyncStatus = noopStatus): Promise<GoogleDriveBackupFile[]> {
        const accessToken = await this.ensureAccessToken(onStatus);
        onStatus('Loading Google Drive backups...');
        const query = [
            'trashed = false',
            "name contains 'backup-'",
        ].join(' and ');
        const params = new URLSearchParams({
            spaces: 'appDataFolder',
            q: query,
            pageSize: '100',
            orderBy: 'modifiedTime desc',
            fields: 'files(id,name,size,createdTime,modifiedTime)',
        });
        const response = await authorizedGoogleJson<GoogleDriveFilesListResponse>(`${DRIVE_FILES_URL}?${params}`, accessToken);
        return (response.body.files ?? [])
            .map(normalizeBackupFile)
            .filter(file => file.id && isBackupFileName(file.name))
            .sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime));
    }

    async downloadBackup(fileId: string, onStatus: CloudSyncStatus = noopStatus): Promise<Blob> {
        const accessToken = await this.ensureAccessToken(onStatus);
        onStatus('Downloading backup from Google Drive...');
        const response = await googleRequest<Blob>(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?alt=media`, {
            accessToken,
            responseType: 'blob',
            timeoutMs: 120_000,
        });
        return response.body;
    }

    async deleteBackup(fileId: string, onStatus: CloudSyncStatus = noopStatus): Promise<void> {
        const accessToken = await this.ensureAccessToken(onStatus);
        onStatus('Deleting Google Drive backup...');
        await googleRequest<string>(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}`, {
            accessToken,
            method: 'DELETE',
            responseType: 'text',
        });
    }

    async revoke(onStatus: CloudSyncStatus = noopStatus): Promise<void> {
        const token = await readGoogleDriveToken(this.clientId);
        if (!token) {
            onStatus('No Google Drive token is stored.');
            return;
        }
        const revokeToken = token.refreshToken || token.accessToken;
        try {
            await googleRequest<string>(REVOKE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                data: new URLSearchParams({ token: revokeToken }).toString(),
                responseType: 'text',
            });
        } finally {
            await gmStorageDelete(GOOGLE_DRIVE_TOKEN_STORAGE_KEY);
        }
        onStatus('Google Drive access token revoked.');
    }

    async ensureAccessToken(onStatus: CloudSyncStatus = noopStatus): Promise<string> {
        if (!this.clientId.trim()) {
            throw new Error('Add a Google OAuth client ID before using Google Drive sync.');
        }
        const token = await readGoogleDriveToken(this.clientId);
        if (token?.accessToken && token.expiresAt - TOKEN_REFRESH_SKEW_MS > this.now()) return token.accessToken;
        if (token?.refreshToken) {
            try {
                return await this.refreshAccessToken(token);
            } catch (error) {
                log.warn('Google Drive token refresh failed; requesting a new device authorization', { error });
            }
        }
        return this.authorizeWithDeviceFlow(onStatus);
    }

    private async refreshAccessToken(token: GoogleDriveTokenState): Promise<string> {
        const response = await googleJson<TokenResponse>(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            data: new URLSearchParams({
                client_id: this.clientId,
                refresh_token: token.refreshToken,
                grant_type: 'refresh_token',
            }).toString(),
        });
        const state = tokenStateFromResponse(response.body, this.clientId, this.now(), token.refreshToken);
        await writeGoogleDriveToken(state);
        return state.accessToken;
    }

    private async authorizeWithDeviceFlow(onStatus: CloudSyncStatus): Promise<string> {
        const device = await googleJson<DeviceCodeResponse>(DEVICE_CODE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            data: new URLSearchParams({
                client_id: this.clientId,
                scope: GOOGLE_DRIVE_SCOPE,
            }).toString(),
        });
        const verificationUrl = device.body.verification_url_complete || device.body.verification_url;
        onStatus(`Open ${verificationUrl} and enter code ${device.body.user_code}. Waiting for Google authorization...`);
        this.openUrl(verificationUrl);
        const token = await this.pollDeviceToken(device.body, onStatus);
        await writeGoogleDriveToken(token);
        onStatus('Google Drive authorized.');
        return token.accessToken;
    }

    private async pollDeviceToken(device: DeviceCodeResponse, onStatus: CloudSyncStatus): Promise<GoogleDriveTokenState> {
        let intervalMs = Math.max(1, device.interval ?? 5) * 1000;
        const expiresAt = this.now() + Math.max(1, device.expires_in) * 1000;
        while (this.now() < expiresAt) {
            await this.sleep(intervalMs);
            const response = await googleJson<TokenResponse>(TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                data: new URLSearchParams({
                    client_id: this.clientId,
                    device_code: device.device_code,
                    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
                }).toString(),
                timeoutMs: DEFAULT_TIMEOUT_MS,
            }, { allowErrorBody: true });
            if (response.status >= 200 && response.status < 300) {
                return tokenStateFromResponse(response.body, this.clientId, this.now());
            }
            const error = response.body.error ?? '';
            if (error === 'authorization_pending') {
                onStatus(`Waiting for Google authorization code ${device.user_code}...`);
                continue;
            }
            if (error === 'slow_down') {
                intervalMs += 5000;
                continue;
            }
            throw googleError(response.body, response.status);
        }
        throw new Error('Google Drive authorization timed out.');
    }
}

async function authorizedGoogleJson<T>(url: string, accessToken: string, options: Omit<GoogleRequestOptions, 'accessToken' | 'responseType'> = {}): Promise<GoogleResponse<T>> {
    return googleJson<T>(url, { ...options, accessToken });
}

async function googleJson<T>(url: string, options: GoogleRequestOptions = {}, behavior: { allowErrorBody?: boolean } = {}): Promise<GoogleResponse<T>> {
    const response = await googleRequest<T>(url, { ...options, responseType: 'json', allowErrorStatus: behavior.allowErrorBody });
    if (behavior.allowErrorBody || response.status >= 200 && response.status < 300) return response;
    throw googleError(response.body, response.status);
}

async function googleRequest<T>(url: string, options: GoogleRequestOptions = {}): Promise<GoogleResponse<T>> {
    const headers = requestHeaders(options);
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
        return new Promise((resolve, reject) => {
            const result = userscriptRequest({
                method: options.method ?? 'GET',
                url,
                headers,
                data: options.data,
                responseType: options.responseType,
                timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
                anonymous: true,
                onload: response => {
                    try {
                        const body = normalizeResponseBody<T>(response.response, response.responseText, options.responseType);
                        if (options.allowErrorStatus || response.status >= 200 && response.status < 300) resolve({ status: response.status, body });
                        else reject(googleError(body, response.status));
                    } catch (error) {
                        reject(error);
                    }
                },
                onerror: error => reject(error instanceof Error ? error : new Error('Google Drive request failed.')),
                ontimeout: () => reject(new Error('Google Drive request timed out.')),
            });
            if (result && typeof (result as Promise<UserscriptHttpResponse>).then === 'function') {
                (result as Promise<UserscriptHttpResponse>).then(response => {
                    const body = normalizeResponseBody<T>(response.response, response.responseText, options.responseType);
                    if (options.allowErrorStatus || response.status >= 200 && response.status < 300) resolve({ status: response.status, body });
                    else reject(googleError(body, response.status));
                }, error => reject(error instanceof Error ? error : new Error('Google Drive request failed.')));
            }
        });
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            method: options.method ?? 'GET',
            headers,
            body: options.data,
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            signal: controller.signal,
        });
        const body = await readFetchBody<T>(response, options.responseType);
        if (options.allowErrorStatus || response.ok) return { status: response.status, body };
        throw googleError(body, response.status);
    } finally {
        window.clearTimeout(timeout);
    }
}

function requestHeaders(options: GoogleRequestOptions): Record<string, string> {
    return {
        ...(options.headers ?? {}),
        ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
    };
}

async function readFetchBody<T>(response: Response, responseType: GoogleRequestOptions['responseType']): Promise<T> {
    if (response.status === 204) return '' as T;
    if (responseType === 'blob') return await response.blob() as T;
    if (responseType === 'text') return await response.text() as T;
    return await response.json() as T;
}

function normalizeResponseBody<T>(response: unknown, responseText: string | undefined, responseType: GoogleRequestOptions['responseType']): T {
    if (responseType === 'blob') return response as T;
    if (responseType === 'text') return String(responseText ?? response ?? '') as T;
    if (response !== undefined && typeof response !== 'string') return response as T;
    return JSON.parse(String(responseText ?? response ?? 'null')) as T;
}

function tokenStateFromResponse(response: TokenResponse, clientId: string, now: number, fallbackRefreshToken = ''): GoogleDriveTokenState {
    if (!response.access_token) throw googleError(response, 400);
    return {
        accessToken: response.access_token,
        clientId,
        expiresAt: now + Math.max(1, response.expires_in ?? 3600) * 1000,
        refreshToken: response.refresh_token || fallbackRefreshToken,
        scope: response.scope ?? GOOGLE_DRIVE_SCOPE,
        tokenType: response.token_type ?? 'Bearer',
    };
}

async function readGoogleDriveToken(clientId: string): Promise<GoogleDriveTokenState | null> {
    const token = normalizeStoredGoogleDriveToken(await gmStorageGet<unknown>(GOOGLE_DRIVE_TOKEN_STORAGE_KEY, null));
    return token?.clientId === clientId ? token : null;
}

async function writeGoogleDriveToken(token: GoogleDriveTokenState): Promise<void> {
    await gmStorageSet(GOOGLE_DRIVE_TOKEN_STORAGE_KEY, token);
}

function normalizeStoredGoogleDriveToken(value: unknown): GoogleDriveTokenState | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Partial<GoogleDriveTokenState>;
    if (typeof record.clientId !== 'string' || typeof record.accessToken !== 'string') return null;
    return {
        accessToken: record.accessToken,
        clientId: record.clientId,
        expiresAt: typeof record.expiresAt === 'number' ? record.expiresAt : 0,
        refreshToken: typeof record.refreshToken === 'string' ? record.refreshToken : '',
        scope: typeof record.scope === 'string' ? record.scope : GOOGLE_DRIVE_SCOPE,
        tokenType: typeof record.tokenType === 'string' ? record.tokenType : 'Bearer',
    };
}

function normalizeBackupFile(file: GoogleDriveFileResponse): GoogleDriveBackupFile {
    return {
        id: file.id ?? '',
        name: file.name ?? '',
        size: Number(file.size ?? 0) || 0,
        createdTime: file.createdTime ?? '',
        modifiedTime: file.modifiedTime ?? file.createdTime ?? '',
    };
}

function isBackupFileName(name: string): boolean {
    return name.startsWith(BACKUP_NAME_PREFIX) || name.startsWith('yomu-backup-');
}

function browserSlug(userAgent: string): string {
    if (/firefox/i.test(userAgent)) return 'firefox';
    if (/edg\//i.test(userAgent)) return 'edge';
    if (/chrome|chromium|crios/i.test(userAgent)) return 'chrome';
    if (/safari/i.test(userAgent)) return 'safari';
    return 'browser';
}

function googleError(body: unknown, status: number): Error {
    const record = body && typeof body === 'object' ? body as { error?: unknown; error_description?: unknown; message?: unknown } : {};
    const nested = record.error && typeof record.error === 'object'
        ? record.error as { message?: unknown; error_description?: unknown }
        : {};
    const message = stringOrEmpty(nested.message)
        || stringOrEmpty(record.error_description)
        || stringOrEmpty(nested.error_description)
        || stringOrEmpty(record.message)
        || stringOrEmpty(record.error)
        || `Google Drive request failed (${status}).`;
    return new Error(message);
}

function stringOrEmpty(value: unknown): string {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function openExternalUrl(url: string): void {
    try {
        if (typeof GM_openInTab === 'function') {
            GM_openInTab(url, { active: true });
            return;
        }
        if (typeof GM !== 'undefined' && typeof GM?.openInTab === 'function') {
            GM.openInTab(url, { active: true });
            return;
        }
        window.open(url, '_blank', 'noopener');
    } catch {
        window.open(url, '_blank', 'noopener');
    }
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, ms));
}

function noopStatus(): void {}
