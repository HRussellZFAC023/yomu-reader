import type { ReaderSettings } from '../app/types';
import type { CloudSettingsSyncMetadata, CloudSettingsSyncSnapshot } from './cloud-sync';
import { requestJson, requestText } from '../network/http';

// Serverless Google Drive settings sync for the userscript and hosted reader.
//
// Unlike the extension build (which uses chrome.identity + a background worker),
// this path needs no backend: it authorises through Google Identity Services and
// stores a single yomu-settings.json in the Drive appDataFolder (a per-app
// sandbox the drive.appdata scope grants — it cannot read the rest of Drive).
//
// Public OAuth client id for browser-only Drive appData sync. There is no
// secret in the SPA/userscript flow; builds may still override this for forks
// or local OAuth projects.
const DEFAULT_WEB_OAUTH_CLIENT_ID = '697885991868-bj7l5ja9vgbgk5i2ojcf5jfnkdg5h47g.apps.googleusercontent.com';
const WEB_OAUTH_CLIENT_ID = typeof __YOMU_GOOGLE_OAUTH_WEB_CLIENT_ID__ === 'string' && __YOMU_GOOGLE_OAUTH_WEB_CLIENT_ID__
    ? __YOMU_GOOGLE_OAUTH_WEB_CLIENT_ID__
    : DEFAULT_WEB_OAUTH_CLIENT_ID;

export const CLOUD_SETTINGS_SYNC_ENABLED = Boolean(WEB_OAUTH_CLIENT_ID);

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const SETTINGS_FILE_NAME = 'yomu-settings.json';
const SETTINGS_MIME_TYPE = 'application/json';
const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
// Static broker page on the hosted origin. The userscript runs on third-party
// origins Google will not authorise, so it cannot run GIS directly; it opens
// this page (served from the authorised yomureader.com origin) which performs
// the consent popup and posts the access token back.
const OAUTH_BROKER_URL = 'https://yomureader.com/oauth/google-drive.html';
const OAUTH_BROKER_ORIGIN = 'https://yomureader.com';
const TOKEN_EARLY_REFRESH_MS = 60_000;
const DRIVE_TIMEOUT_MS = 20_000;
const POPUP_TIMEOUT_MS = 120_000;

interface DriveFile {
    id: string;
    name?: string;
    modifiedTime?: string;
    size?: string;
}

interface CachedAccessToken {
    token: string;
    expiresAt: number;
}

let cachedToken: CachedAccessToken | null = null;

export function cloudSettingsSyncAvailable(): boolean {
    return CLOUD_SETTINGS_SYNC_ENABLED;
}

// fallow-ignore-next-line unused-export
export async function uploadCloudSettingsToCloud(settings: ReaderSettings): Promise<CloudSettingsSyncMetadata> {
    requireConfigured();
    const snapshot: CloudSettingsSyncSnapshot = {
        formatName: 'yomu-google-drive-settings-sync',
        formatVersion: 1,
        syncedAt: new Date().toISOString(),
        settings,
    };
    const serialized = JSON.stringify(snapshot);
    const existing = await findSettingsFile();
    const file = existing
        ? await updateSettingsFile(existing.id, serialized)
        : await createSettingsFile(serialized);
    return { syncedAt: snapshot.syncedAt, fileId: file.id, modifiedTime: file.modifiedTime };
}

// fallow-ignore-next-line unused-export
export async function downloadCloudSettingsFromCloud(): Promise<CloudSettingsSyncSnapshot | null> {
    requireConfigured();
    const existing = await findSettingsFile();
    if (!existing?.id) return null;
    const body = await driveRequestText(`/drive/v3/files/${encodeURIComponent(existing.id)}?alt=media`);
    return parseSettingsSnapshot(body);
}

function requireConfigured(): void {
    if (!CLOUD_SETTINGS_SYNC_ENABLED) {
        throw new Error('Google Drive settings sync is not configured for this build.');
    }
}

async function findSettingsFile(): Promise<DriveFile | null> {
    const params = new URLSearchParams({
        spaces: 'appDataFolder',
        pageSize: '1',
        fields: 'files(id,name,modifiedTime,size)',
        q: `name = '${SETTINGS_FILE_NAME.replace(/'/g, "\\'")}'`,
    });
    const body = await driveRequestJson(`/drive/v3/files?${params.toString()}`);
    const files = isRecord(body) && Array.isArray(body.files) ? body.files : [];
    const first = files[0];
    return isRecord(first) && typeof first.id === 'string' ? (first as unknown as DriveFile) : null;
}

async function createSettingsFile(serialized: string): Promise<DriveFile> {
    const boundary = `yomu_drive_sync_${randomBoundary()}`;
    const metadata = { name: SETTINGS_FILE_NAME, mimeType: SETTINGS_MIME_TYPE, parents: ['appDataFolder'] };
    const body = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify(metadata),
        `--${boundary}`,
        `Content-Type: ${SETTINGS_MIME_TYPE}`,
        '',
        serialized,
        `--${boundary}--`,
        '',
    ].join('\r\n');
    const result = await driveRequestJson('/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size', {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        data: body,
    });
    return driveFileFromResponse(result);
}

async function updateSettingsFile(fileId: string, serialized: string): Promise<DriveFile> {
    const result = await driveRequestJson(
        `/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,modifiedTime,size`,
        { method: 'PATCH', headers: { 'Content-Type': SETTINGS_MIME_TYPE }, data: serialized },
    );
    return driveFileFromResponse(result);
}

interface DriveRequestOptions {
    method?: string;
    headers?: Record<string, string>;
    data?: string;
}

async function driveRequestJson(path: string, options: DriveRequestOptions = {}): Promise<unknown> {
    return driveRequest(options, body => requestJson(driveUrl(path), body));
}

async function driveRequestText(path: string, options: DriveRequestOptions = {}): Promise<string> {
    return driveRequest(options, body => requestText(driveUrl(path), body));
}

// Adds the bearer token, retries once on 401 with a fresh token (a cached token
// may have expired or been revoked), and surfaces Drive's error message.
async function driveRequest<T>(
    options: DriveRequestOptions,
    run: (httpOptions: Parameters<typeof requestJson>[1]) => Promise<T>,
): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const token = await acquireAccessToken(attempt === 0);
        try {
            return await run({
                method: options.method ?? 'GET',
                headers: { ...(options.headers ?? {}), Authorization: `Bearer ${token}` },
                data: options.data,
                responseType: 'json',
                timeoutMs: DRIVE_TIMEOUT_MS,
                allowDirectCrossOrigin: true,
                preferFetch: true,
                failureLabel: 'Google Drive settings sync',
            });
        } catch (error) {
            if (attempt === 0 && isUnauthorized(error)) {
                cachedToken = null;
                continue;
            }
            throw error;
        }
    }
    throw new Error('Google Drive settings sync failed to authorise.');
}

function driveUrl(path: string): string {
    return `https://www.googleapis.com${path}`;
}

async function acquireAccessToken(allowCached: boolean): Promise<string> {
    if (allowCached && cachedToken && Date.now() < cachedToken.expiresAt - TOKEN_EARLY_REFRESH_MS) {
        return cachedToken.token;
    }
    const token = isUserscriptContext() ? await tokenViaBroker() : await tokenViaIdentityServices();
    cachedToken = { token: token.accessToken, expiresAt: Date.now() + token.expiresInSeconds * 1000 };
    return cachedToken.token;
}

interface AcquiredToken {
    accessToken: string;
    expiresInSeconds: number;
}

// Hosted reader: GIS runs on the authorised yomureader.com / localhost origin.
async function tokenViaIdentityServices(): Promise<AcquiredToken> {
    const gis = await loadIdentityServices();
    return new Promise<AcquiredToken>((resolve, reject) => {
        try {
            const client = gis.accounts.oauth2.initTokenClient({
                client_id: WEB_OAUTH_CLIENT_ID,
                scope: DRIVE_SCOPE,
                callback: response => {
                    if (response.error || !response.access_token) {
                        reject(new Error(googleTokenError(response)));
                        return;
                    }
                    resolve({ accessToken: response.access_token, expiresInSeconds: Number(response.expires_in) || 3600 });
                },
                error_callback: error => reject(new Error(error?.message || 'Google authorization was cancelled.')),
            });
            client.requestAccessToken({ prompt: '' });
        } catch (error) {
            reject(error instanceof Error ? error : new Error('Google authorization failed to start.'));
        }
    });
}

// Userscript on a third-party page: open the hosted broker which runs GIS on the
// authorised origin and posts the token back. We validate the message origin and
// that it came from the window we opened.
function tokenViaBroker(): Promise<AcquiredToken> {
    return new Promise<AcquiredToken>((resolve, reject) => {
        const opener = typeof window !== 'undefined' ? window : undefined;
        if (!opener?.open) {
            reject(new Error('Google Drive settings sync needs a browser window.'));
            return;
        }
        if (typeof MessageChannel !== 'function') {
            reject(new Error('Google Drive settings sync needs a browser with secure channel support.'));
            return;
        }
        const state = randomBoundary();
        const channel = new MessageChannel();
        const brokerUrl = `${OAUTH_BROKER_URL}?origin=${encodeURIComponent(opener.location.origin)}`
            + `&client_id=${encodeURIComponent(WEB_OAUTH_CLIENT_ID)}`
            + `&state=${encodeURIComponent(state)}`;
        const popup = opener.open(brokerUrl, 'yomu-drive-oauth', 'width=480,height=640,menubar=no,toolbar=no');
        if (!popup) {
            reject(new Error('Allow pop-ups for this site to sign in to Google Drive.'));
            return;
        }
        let settled = false;
        let channelTransferred = false;
        const finish = (run: () => void) => {
            if (settled) return;
            settled = true;
            opener.removeEventListener('message', onReadyMessage);
            try { channel.port1.close(); } catch { /* ignore */ }
            if (!channelTransferred) {
                try { channel.port2.close(); } catch { /* ignore */ }
            }
            opener.clearTimeout(timer);
            opener.clearInterval(closedPoll);
            run();
        };
        const onReadyMessage = (event: MessageEvent) => {
            if (event.origin !== OAUTH_BROKER_ORIGIN || event.source !== popup) return;
            const data = event.data;
            if (!isRecord(data) || data.type !== 'yomu-drive-oauth-ready' || data.state !== state) return;
            if (channelTransferred) return;
            try {
                popup.postMessage({ type: 'yomu-drive-oauth-init', state }, OAUTH_BROKER_ORIGIN, [channel.port2]);
                channelTransferred = true;
            } catch {
                finish(() => reject(new Error('Google authorization failed to establish a secure channel.')));
            }
        };
        channel.port1.onmessage = event => {
            const data = event.data;
            if (!isRecord(data) || data.type !== 'yomu-drive-oauth-token' || data.state !== state) return;
            if (typeof data.accessToken === 'string' && data.accessToken) {
                const expiresInSeconds = Number(data.expiresIn) || 3600;
                finish(() => { try { popup.close(); } catch { /* ignore */ } resolve({ accessToken: data.accessToken as string, expiresInSeconds }); });
            } else {
                finish(() => { try { popup.close(); } catch { /* ignore */ } reject(new Error(typeof data.error === 'string' ? data.error : 'Google authorization failed.')); });
            }
        };
        channel.port1.start();
        opener.addEventListener('message', onReadyMessage);
        const timer = opener.setTimeout(() => finish(() => { try { popup.close(); } catch { /* ignore */ } reject(new Error('Google authorization timed out.')); }), POPUP_TIMEOUT_MS);
        const closedPoll = opener.setInterval(() => {
            if (popup.closed) finish(() => reject(new Error('Google authorization was cancelled.')));
        }, 500);
    });
}

let identityServicesPromise: Promise<GoogleIdentityServices> | null = null;

function loadIdentityServices(): Promise<GoogleIdentityServices> {
    const existing = googleIdentityServices();
    if (existing) return Promise.resolve(existing);
    if (identityServicesPromise) return identityServicesPromise;
    identityServicesPromise = new Promise<GoogleIdentityServices>((resolve, reject) => {
        if (typeof document === 'undefined') {
            reject(new Error('Google Identity Services is unavailable in this context.'));
            return;
        }
        const script = document.createElement('script');
        script.src = GIS_SCRIPT_URL;
        script.async = true;
        script.onload = () => {
            const gis = googleIdentityServices();
            if (gis) resolve(gis);
            else reject(new Error('Google Identity Services failed to initialise.'));
        };
        script.onerror = () => {
            identityServicesPromise = null;
            reject(new Error('Failed to load Google Identity Services.'));
        };
        document.head.appendChild(script);
    });
    return identityServicesPromise;
}

function googleIdentityServices(): GoogleIdentityServices | null {
    const candidate = (globalThis as { google?: GoogleIdentityServices }).google;
    return candidate?.accounts?.oauth2 ? candidate : null;
}

function isUserscriptContext(): boolean {
    const global = globalThis as typeof globalThis & {
        GM?: { xmlHttpRequest?: unknown; xmlhttpRequest?: unknown };
        GM_info?: unknown;
    };
    return typeof GM_xmlhttpRequest === 'function'
        || typeof global.GM?.xmlHttpRequest === 'function'
        || typeof global.GM?.xmlhttpRequest === 'function'
        || Boolean(global.GM_info);
}

function parseSettingsSnapshot(body: string): CloudSettingsSyncSnapshot | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        return null;
    }
    if (!isRecord(parsed) || parsed.formatName !== 'yomu-google-drive-settings-sync') return null;
    if (!isRecord(parsed.settings)) return null;
    return parsed as unknown as CloudSettingsSyncSnapshot;
}

function driveFileFromResponse(value: unknown): DriveFile {
    if (isRecord(value) && typeof value.id === 'string') return value as unknown as DriveFile;
    throw new Error('Google Drive did not return the saved file.');
}

function isUnauthorized(error: unknown): boolean {
    return error instanceof Error && /\(401\)|unauthor/i.test(error.message);
}

function googleTokenError(response: { error?: string; error_description?: string }): string {
    return response.error_description || response.error || 'Google authorization failed.';
}

function randomBoundary(): string {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

interface GoogleTokenResponse {
    access_token?: string;
    expires_in?: number | string;
    error?: string;
    error_description?: string;
}

interface GoogleTokenClient {
    requestAccessToken: (overrides?: { prompt?: string }) => void;
}

interface GoogleIdentityServices {
    accounts: {
        oauth2: {
            initTokenClient: (config: {
                client_id: string;
                scope: string;
                callback: (response: GoogleTokenResponse) => void;
                error_callback?: (error: { type?: string; message?: string }) => void;
            }) => GoogleTokenClient;
        };
    };
}
