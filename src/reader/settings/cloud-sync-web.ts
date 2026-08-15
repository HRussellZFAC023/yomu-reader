import { isRecord } from '../core/object-utils';
import type { ReaderSettings } from '../app/types';
import type { CloudSettingsAuthRedirectResult, CloudSettingsSyncMetadata, CloudSettingsSyncSnapshot } from './cloud-sync';
import { requestJson, requestText } from '../network/http';
import { exportSettingsBackupSnapshot } from './settings-persistence-transaction';
import {
    cloudSettingsRedirectHandoffRequired,
    isCloudSettingsAuthorizationState,
    type CloudSettingsAuthorization,
} from './cloud-settings-auth-state';

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
// Static broker page on the hosted origin. The userscript sandbox cannot consume
// the hosted page's GIS object directly, so it uses a same-tab redirect whose
// destination and one-use state are independently constrained.
const OAUTH_BROKER_URL = 'https://yomureader.com/oauth/google-drive.html';
const OAUTH_RETURN_HASH_KEY = 'yomu-drive-oauth-return';
const OAUTH_TOKEN_HASH_KEY = 'yomu-drive-oauth-token';
const OAUTH_TOKEN_PAYLOAD_TYPE = 'yomu-drive-oauth-token';
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

interface OAuthRedirectCandidate extends CloudSettingsAuthRedirectResult {
    accessToken?: string;
    expiresInSeconds?: number;
}

let cachedToken: CachedAccessToken | null = null;
let pendingAuthRedirectResult: OAuthRedirectCandidate | null = readAuthRedirectCandidate();

export function cloudSettingsSyncAvailable(): boolean {
    return CLOUD_SETTINGS_SYNC_ENABLED;
}

export function cloudSettingsAuthRedirectResult(expectedState?: string): CloudSettingsAuthRedirectResult | null {
    const candidate = takeAuthRedirectCandidate();
    if (!candidate) return null;
    if (!authRedirectStateMatches(candidate, expectedState)) {
        return {
            ok: false,
            state: candidate.state,
            error: 'Google authorization did not match the pending Yomu action.',
        };
    }
    cacheAuthRedirectToken(candidate);
    return { ok: candidate.ok, state: candidate.state, error: candidate.error };
}

function takeAuthRedirectCandidate(): OAuthRedirectCandidate | null {
    const candidate = pendingAuthRedirectResult;
    pendingAuthRedirectResult = null;
    return candidate;
}

function authRedirectStateMatches(candidate: OAuthRedirectCandidate, expectedState?: string): boolean {
    if (!isCloudSettingsAuthorizationState(expectedState)) return false;
    return candidate.state === expectedState;
}

function cacheAuthRedirectToken(candidate: OAuthRedirectCandidate): void {
    if (!candidate.ok) return;
    if (!candidate.accessToken) return;
    cachedToken = {
        token: candidate.accessToken,
        expiresAt: Date.now() + (candidate.expiresInSeconds ?? 3600) * 1000,
    };
}

// fallow-ignore-next-line unused-export
export async function uploadCloudSettingsToCloud(
    settings: ReaderSettings,
    authorization?: CloudSettingsAuthorization,
): Promise<CloudSettingsSyncMetadata> {
    requireConfigured();
    const backup = await exportSettingsBackupSnapshot(settings);
    const snapshot: CloudSettingsSyncSnapshot = {
        formatName: 'yomu-google-drive-settings-sync',
        formatVersion: 1,
        syncedAt: new Date().toISOString(),
        settings: backup.settings,
        storage: backup.storage,
    };
    const serialized = JSON.stringify(snapshot);
    const existing = await findSettingsFile(authorization);
    const file = existing
        ? await updateSettingsFile(existing.id, serialized, authorization)
        : await createSettingsFile(serialized, authorization);
    return { syncedAt: snapshot.syncedAt, fileId: file.id, modifiedTime: file.modifiedTime };
}

// fallow-ignore-next-line unused-export
export async function downloadCloudSettingsFromCloud(
    authorization?: CloudSettingsAuthorization,
): Promise<CloudSettingsSyncSnapshot | null> {
    requireConfigured();
    const existing = await findSettingsFile(authorization);
    if (!existing?.id) return null;
    const body = await driveRequestText(`/drive/v3/files/${encodeURIComponent(existing.id)}?alt=media`, { authorization });
    return parseSettingsSnapshot(body);
}

function requireConfigured(): void {
    if (!CLOUD_SETTINGS_SYNC_ENABLED) {
        throw new Error('Google Drive settings sync is not configured for this build.');
    }
}

async function findSettingsFile(authorization?: CloudSettingsAuthorization): Promise<DriveFile | null> {
    const params = new URLSearchParams({
        spaces: 'appDataFolder',
        pageSize: '1',
        fields: 'files(id,name,modifiedTime,size)',
        q: `name = '${SETTINGS_FILE_NAME.replace(/'/g, "\\'")}'`,
    });
    const body = await driveRequestJson(`/drive/v3/files?${params.toString()}`, { authorization });
    return driveFileOrNull(driveFiles(body)[0]);
}

function driveFiles(body: unknown): unknown[] {
    if (!isRecord(body)) return [];
    return Array.isArray(body.files) ? body.files : [];
}

function driveFileOrNull(value: unknown): DriveFile | null {
    if (!isRecord(value)) return null;
    if (typeof value.id !== 'string') return null;
    return value as unknown as DriveFile;
}

async function createSettingsFile(serialized: string, authorization?: CloudSettingsAuthorization): Promise<DriveFile> {
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
        authorization,
    });
    return driveFileFromResponse(result);
}

async function updateSettingsFile(fileId: string, serialized: string, authorization?: CloudSettingsAuthorization): Promise<DriveFile> {
    const result = await driveRequestJson(
        `/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,modifiedTime,size`,
        { method: 'PATCH', headers: { 'Content-Type': SETTINGS_MIME_TYPE }, data: serialized, authorization },
    );
    return driveFileFromResponse(result);
}

interface DriveRequestOptions {
    method?: string;
    headers?: Record<string, string>;
    data?: string;
    authorization?: CloudSettingsAuthorization;
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
    const firstToken = await acquireAccessToken(true, options.authorization);
    try {
        return await run(driveHttpOptions(options, firstToken));
    } catch (error) {
        if (!isUnauthorized(error)) throw error;
        cachedToken = null;
    }
    const freshToken = await acquireAccessToken(false, options.authorization);
    return run(driveHttpOptions(options, freshToken));
}

function driveHttpOptions(
    options: DriveRequestOptions,
    token: string,
): Parameters<typeof requestJson>[1] {
    return {
        method: options.method ?? 'GET',
        headers: { ...(options.headers ?? {}), Authorization: `Bearer ${token}` },
        data: options.data,
        responseType: 'json',
        timeoutMs: DRIVE_TIMEOUT_MS,
        allowDirectCrossOrigin: true,
        preferFetch: true,
        failureLabel: 'Google Drive settings sync',
    };
}

function driveUrl(path: string): string {
    return `https://www.googleapis.com${path}`;
}

async function acquireAccessToken(
    allowCached: boolean,
    authorization?: CloudSettingsAuthorization,
): Promise<string> {
    const cached = reusableAccessToken(allowCached);
    if (cached) return cached;
    const token = await freshAccessToken(authorization);
    cachedToken = { token: token.accessToken, expiresAt: Date.now() + token.expiresInSeconds * 1000 };
    return cachedToken.token;
}

function reusableAccessToken(allowCached: boolean): string | null {
    if (!allowCached) return null;
    if (!cachedToken) return null;
    return Date.now() < cachedToken.expiresAt - TOKEN_EARLY_REFRESH_MS ? cachedToken.token : null;
}

function freshAccessToken(authorization?: CloudSettingsAuthorization): Promise<AcquiredToken> {
    if (cloudSettingsRedirectHandoffRequired()) return tokenViaPageRedirect(authorization);
    return tokenViaIdentityServices();
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

// A userscript running on an owned Study page cannot use the page's GIS object
// directly, so it navigates through the hosted broker. The state was generated
// before the private pending action was committed; never mint one here, where
// the callback would no longer be bound to that action.
function tokenViaPageRedirect(authorization?: CloudSettingsAuthorization): Promise<AcquiredToken> {
    return new Promise<AcquiredToken>((_resolve, reject) => startPageRedirect(authorization, reject));
}

function startPageRedirect(
    authorization: CloudSettingsAuthorization | undefined,
    reject: (reason: Error) => void,
): void {
    try {
        const target = pageRedirectTarget(authorization);
        navigateToOAuthBroker(target.browserWindow, target.url);
    } catch (error) {
        reject(googleAuthorizationStartError(error));
    }
}

function pageRedirectTarget(authorization?: CloudSettingsAuthorization): { browserWindow: Window; url: string } {
    const browserWindow = currentBrowserWindow();
    if (!browserWindow) throw new Error('Google Drive settings sync needs a browser page.');
    if (!authorization) throw new Error('Google authorization requires a private pending Yomu action.');
    if (!isCloudSettingsAuthorizationState(authorization.state)) {
        throw new Error('Google authorization requires a private pending Yomu action.');
    }
    return { browserWindow, url: oauthBrokerUrl(browserWindow.location.href, authorization.state) };
}

function googleAuthorizationStartError(error: unknown): Error {
    return error instanceof Error ? error : new Error('Google authorization failed to start.');
}

function oauthBrokerUrl(returnUrl: string, state: string): string {
    const brokerUrl = new URL(OAUTH_BROKER_URL);
    brokerUrl.searchParams.set('return_url', returnUrl);
    brokerUrl.searchParams.set('client_id', WEB_OAUTH_CLIENT_ID);
    brokerUrl.searchParams.set('state', state);
    return brokerUrl.href;
}

function navigateToOAuthBroker(browserWindow: Window, url: string): void {
    const testNavigate = (globalThis as { __YOMU_TEST_NAVIGATE_TO_OAUTH__?: (url: string) => void }).__YOMU_TEST_NAVIGATE_TO_OAUTH__;
    if (testNavigate) {
        testNavigate(url);
        return;
    }
    browserWindow.location.assign(url);
}

interface OAuthTokenPayload {
    type?: string;
    state?: string;
    accessToken?: string;
    expiresIn?: number | string;
    error?: string;
}

function readAuthRedirectCandidate(): OAuthRedirectCandidate | null {
    const browserWindow = currentBrowserWindow();
    if (!browserWindow) return null;
    scrubLegacyOAuthWindowName(browserWindow);
    const envelope = readOAuthReturnEnvelope(browserWindow.location.href);
    if (!envelope) return null;
    clearOAuthReturnHash(browserWindow);
    return oauthRedirectCandidate(envelope.state, envelope.payload);
}

function currentBrowserWindow(): Window | null {
    if (typeof window === 'undefined') return null;
    return window;
}

function readOAuthReturnEnvelope(href: string): { state: string; payload: OAuthTokenPayload | null } | null {
    const state = oauthReturnState(href);
    if (!state) return null;
    return { state, payload: parseOAuthReturnPayload(href) };
}

function oauthRedirectCandidate(state: string, payload: OAuthTokenPayload | null): OAuthRedirectCandidate {
    if (!isValidOAuthReturnPayload(state, payload)) {
        return { ok: false, state, error: 'Google authorization returned without a Yomu token.' };
    }
    if (hasOAuthAccessToken(payload)) {
        return {
            ok: true,
            state,
            accessToken: payload.accessToken,
            expiresInSeconds: oauthTokenLifetime(payload.expiresIn),
        };
    }
    return { ok: false, state, error: payload.error || 'Google authorization failed.' };
}

function isValidOAuthReturnPayload(state: string, payload: OAuthTokenPayload | null): payload is OAuthTokenPayload {
    if (!isCloudSettingsAuthorizationState(state)) return false;
    if (!payload) return false;
    if (payload.type !== OAUTH_TOKEN_PAYLOAD_TYPE) return false;
    return payload.state === state;
}

function hasOAuthAccessToken(payload: OAuthTokenPayload): payload is OAuthTokenPayload & { accessToken: string } {
    return typeof payload.accessToken === 'string' && Boolean(payload.accessToken);
}

function oauthTokenLifetime(value: OAuthTokenPayload['expiresIn']): number {
    const seconds = Number(value);
    return seconds > 0 ? seconds : 3600;
}

function scrubLegacyOAuthWindowName(browserWindow: Window): void {
    try {
        const parsed = JSON.parse(browserWindow.name);
        if (isRecord(parsed) && parsed.type === OAUTH_TOKEN_PAYLOAD_TYPE) browserWindow.name = '';
    } catch {
        // Unrelated window names belong to the current page.
    }
}

function parseOAuthReturnPayload(href: string): OAuthTokenPayload | null {
    const encoded = oauthHashParam(href, OAUTH_TOKEN_HASH_KEY);
    if (!encoded) return null;
    try {
        const parsed = JSON.parse(encoded);
        return isRecord(parsed) ? parsed as OAuthTokenPayload : null;
    } catch {
        return null;
    }
}

function oauthReturnState(href: string): string {
    return oauthHashParam(href, OAUTH_RETURN_HASH_KEY);
}

function oauthHashParam(href: string, key: string): string {
    let hash = '';
    try {
        hash = new URL(href).hash.slice(1);
    } catch {
        return '';
    }
    const prefix = `${key}=`;
    const entry = hash.split('&').find(part => part.startsWith(prefix));
    if (!entry) return '';
    try {
        return decodeURIComponent(entry.slice(prefix.length));
    } catch {
        return '';
    }
}

function clearOAuthReturnHash(browserWindow: Window): void {
    if (!browserWindow.history?.replaceState) return;
    try {
        const url = new URL(browserWindow.location.href);
        url.hash = hashWithoutOAuthReturn(url.hash);
        browserWindow.history.replaceState(browserWindow.history.state, document.title, url.toString());
    } catch {
        // Best effort only; the candidate remains quarantined until its state is
        // matched against the private one-use pending action.
    }
}

function hashWithoutOAuthReturn(hash: string): string {
    const remaining = hash.slice(1).split('&').filter(retainsOAuthHashPart).join('&');
    return remaining ? `#${remaining}` : '';
}

function retainsOAuthHashPart(part: string): boolean {
    if (!part) return false;
    const separator = part.indexOf('=');
    const key = separator < 0 ? part : part.slice(0, separator);
    return key !== OAUTH_RETURN_HASH_KEY && key !== OAUTH_TOKEN_HASH_KEY;
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
