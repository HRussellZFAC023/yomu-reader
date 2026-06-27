import type { ReaderSettings } from '../app/types';
import type { CloudSettingsAuthRedirectResult, CloudSettingsSyncMetadata, CloudSettingsSyncSnapshot } from './cloud-sync';
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
// origins Google will not authorise, so it cannot run OAuth directly. Instead
// it navigates the current tab through this authorised page, which performs a
// redirect-based Google flow and returns to the original page without popups.
const OAUTH_BROKER_URL = 'https://yomureader.com/oauth/google-drive.html';
const OAUTH_RETURN_HASH_KEY = 'yomu-drive-oauth-return';
const OAUTH_WINDOW_NAME_TYPE = 'yomu-drive-oauth-token';
const TOKEN_EARLY_REFRESH_MS = 60_000;
const DRIVE_TIMEOUT_MS = 20_000;

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
let lastAuthRedirectResult: CloudSettingsAuthRedirectResult | null = consumeAuthRedirectResult();

export function cloudSettingsSyncAvailable(): boolean {
    return CLOUD_SETTINGS_SYNC_ENABLED;
}

export function cloudSettingsAuthRedirectResult(): CloudSettingsAuthRedirectResult | null {
    return lastAuthRedirectResult;
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
    const token = isUserscriptContext() ? await tokenViaPageRedirect() : await tokenViaIdentityServices();
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

// Userscript on a third-party page: navigate the current tab to the hosted
// broker. The current JS context will unload; the settings controller resumes
// the pending sync/restore once the broker returns to the original page.
function tokenViaPageRedirect(): Promise<AcquiredToken> {
    return new Promise<AcquiredToken>((resolve, reject) => {
        void resolve;
        const browserWindow = typeof window !== 'undefined' ? window : undefined;
        if (!browserWindow?.location?.href) {
            reject(new Error('Google Drive settings sync needs a browser page.'));
            return;
        }
        const state = randomBoundary();
        const brokerUrl = new URL(OAUTH_BROKER_URL);
        brokerUrl.searchParams.set('return_url', browserWindow.location.href);
        brokerUrl.searchParams.set('client_id', WEB_OAUTH_CLIENT_ID);
        brokerUrl.searchParams.set('state', state);
        try {
            navigateToOAuthBroker(browserWindow, brokerUrl.href);
        } catch (error) {
            reject(error instanceof Error ? error : new Error('Google authorization failed to start.'));
        }
    });
}

function navigateToOAuthBroker(browserWindow: Window, url: string): void {
    const testNavigate = (globalThis as { __YOMU_TEST_NAVIGATE_TO_OAUTH__?: (url: string) => void }).__YOMU_TEST_NAVIGATE_TO_OAUTH__;
    if (testNavigate) {
        testNavigate(url);
        return;
    }
    browserWindow.location.assign(url);
}

interface OAuthWindowNamePayload {
    type?: string;
    state?: string;
    accessToken?: string;
    expiresIn?: number | string;
    error?: string;
}

function consumeAuthRedirectResult(): CloudSettingsAuthRedirectResult | null {
    const browserWindow = typeof window !== 'undefined' ? window : undefined;
    if (!browserWindow?.location?.href) return null;
    const state = oauthReturnState(browserWindow.location.href);
    if (!state) return null;

    const payload = parseOAuthWindowName(browserWindow.name);
    clearOAuthReturnHash(browserWindow);
    if (!payload || payload.type !== OAUTH_WINDOW_NAME_TYPE || payload.state !== state) {
        return { ok: false, state, error: 'Google authorization returned without a Yomu token.' };
    }

    browserWindow.name = '';
    if (typeof payload.accessToken === 'string' && payload.accessToken) {
        const expiresInSeconds = Number(payload.expiresIn) || 3600;
        cachedToken = { token: payload.accessToken, expiresAt: Date.now() + expiresInSeconds * 1000 };
        return { ok: true, state };
    }
    return { ok: false, state, error: payload.error || 'Google authorization failed.' };
}

function parseOAuthWindowName(value: string): OAuthWindowNamePayload | null {
    try {
        const parsed = JSON.parse(value);
        return isRecord(parsed) ? parsed as OAuthWindowNamePayload : null;
    } catch {
        return null;
    }
}

function oauthReturnState(href: string): string {
    let hash = '';
    try {
        hash = new URL(href).hash.slice(1);
    } catch {
        return '';
    }
    const prefix = `${OAUTH_RETURN_HASH_KEY}=`;
    const entry = hash.split('&').find(part => part.startsWith(prefix));
    return entry ? decodeURIComponent(entry.slice(prefix.length)) : '';
}

function clearOAuthReturnHash(browserWindow: Window): void {
    if (!browserWindow.history?.replaceState) return;
    try {
        const url = new URL(browserWindow.location.href);
        const prefix = `${OAUTH_RETURN_HASH_KEY}=`;
        const remainingHash = url.hash.slice(1).split('&').filter(part => part && !part.startsWith(prefix)).join('&');
        url.hash = remainingHash ? `#${remainingHash}` : '';
        browserWindow.history.replaceState(browserWindow.history.state, document.title, url.toString());
    } catch {
        // Best effort only; the token has already been consumed from window.name.
    }
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
