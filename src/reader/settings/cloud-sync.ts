import { exportManagedStoredValues } from '../app/storage';
import { isPromiseLike } from '../core/async-utils';
import type { ReaderSettings } from '../app/types';
import type { CloudSettingsAuthorization } from './cloud-settings-auth-state';

type ExtensionRuntimeApi = {
    id?: string;
    lastError?: { message?: string };
    sendMessage?: (message: unknown, callback?: (response: unknown) => void) => unknown;
};
type ExtensionApi = { runtime?: ExtensionRuntimeApi };
type ExtensionRuntime = { promiseBased: boolean; runtime: ExtensionRuntimeApi };

export interface CloudSettingsSyncSnapshot {
    formatName: 'yomu-google-drive-settings-sync';
    formatVersion: 1;
    syncedAt: string;
    settings: ReaderSettings;
    storage?: Record<string, unknown>;
}

export interface CloudSettingsSyncMetadata {
    syncedAt: string;
    fileId?: string;
    modifiedTime?: string;
}

export interface CloudSettingsAuthRedirectResult {
    ok: boolean;
    state: string;
    error?: string;
}

interface CloudSettingsSyncResponse {
    ok?: boolean;
    error?: string;
    metadata?: CloudSettingsSyncMetadata;
    snapshot?: CloudSettingsSyncSnapshot;
}

const EXTENSION_BUILD_FLAG = typeof __YOMU_EXTENSION_BUILD__ === 'boolean' ? __YOMU_EXTENSION_BUILD__ : false;
const EXTENSION_OAUTH_CONFIGURED = typeof __YOMU_GOOGLE_OAUTH_EXTENSION_CONFIGURED__ === 'boolean'
    ? __YOMU_GOOGLE_OAUTH_EXTENSION_CONFIGURED__
    : false;
export const CLOUD_SETTINGS_SYNC_ENABLED = EXTENSION_BUILD_FLAG && EXTENSION_OAUTH_CONFIGURED;
const GOOGLE_DRIVE_SYNC_MESSAGE = 'yomu.googleDriveSettingsSync';
const GOOGLE_DRIVE_SYNC_TIMEOUT_MS = 20_000;

export function cloudSettingsSyncAvailable(): boolean {
    const extension = extensionRuntime();
    return CLOUD_SETTINGS_SYNC_ENABLED && Boolean(extension?.runtime.id && extension.runtime.sendMessage);
}

export function cloudSettingsAuthRedirectResult(_expectedState?: string): CloudSettingsAuthRedirectResult | null {
    return null;
}

export async function uploadCloudSettingsToCloud(
    settings: ReaderSettings,
    _authorization?: CloudSettingsAuthorization,
): Promise<CloudSettingsSyncMetadata> {
    const snapshot: CloudSettingsSyncSnapshot = {
        formatName: 'yomu-google-drive-settings-sync',
        formatVersion: 1,
        syncedAt: new Date().toISOString(),
        settings,
        storage: await exportManagedStoredValues(),
    };
    const response = await sendCloudSettingsSyncMessage({ command: 'upload', snapshot });
    return response.metadata ?? { syncedAt: snapshot.syncedAt };
}

export async function downloadCloudSettingsFromCloud(
    _authorization?: CloudSettingsAuthorization,
): Promise<CloudSettingsSyncSnapshot | null> {
    const response = await sendCloudSettingsSyncMessage({ command: 'download' });
    return response.snapshot ?? null;
}

async function sendCloudSettingsSyncMessage(message: Record<string, unknown>): Promise<CloudSettingsSyncResponse> {
    const extension = extensionRuntime();
    if (!CLOUD_SETTINGS_SYNC_ENABLED || !extension?.runtime.id || typeof extension.runtime.sendMessage !== 'function') {
        throw new Error('Google Drive settings sync is available only in the Yomu extension.');
    }

    const response = cloudSettingsSyncResponse(await sendExtensionMessage(extension, {
        type: GOOGLE_DRIVE_SYNC_MESSAGE,
        ...message,
    }));
    if (!response?.ok) {
        throw new Error(response?.error || 'Google Drive settings sync is unavailable in this extension build.');
    }
    return response;
}

function sendExtensionMessage(extension: ExtensionRuntime, message: unknown): Promise<unknown> {
    if (extension.promiseBased) {
        try {
            return withTimeout(Promise.resolve(extension.runtime.sendMessage?.(message)), GOOGLE_DRIVE_SYNC_TIMEOUT_MS);
        } catch (error) {
            return Promise.reject(error);
        }
    }
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (response: unknown) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            const lastError = extension.runtime.lastError;
            if (lastError) reject(new Error(lastError.message || 'Google Drive settings sync failed.'));
            else resolve(response);
        };
        const fail = (error: unknown) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            reject(error);
        };
        const timer = window.setTimeout(() => fail(new Error('Google Drive settings sync timed out.')), GOOGLE_DRIVE_SYNC_TIMEOUT_MS);
        try {
            const maybePromise = extension.runtime.sendMessage?.(message, finish);
            if (isPromiseLike(maybePromise)) void maybePromise.then(finish, fail);
        } catch (error) {
            fail(error);
        }
    });
}

function extensionRuntime(): ExtensionRuntime | undefined {
    const global = globalThis as typeof globalThis & { browser?: ExtensionApi; chrome?: ExtensionApi };
    if (global.browser?.runtime) return { promiseBased: true, runtime: global.browser.runtime };
    if (global.chrome?.runtime) return { promiseBased: false, runtime: global.chrome.runtime };
    return undefined;
}

function cloudSettingsSyncResponse(value: unknown): CloudSettingsSyncResponse | null {
    return value && typeof value === 'object' ? value as CloudSettingsSyncResponse : null;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('Google Drive settings sync timed out.')), timeoutMs);
        promise.then(
            value => {
                window.clearTimeout(timer);
                resolve(value);
            },
            error => {
                window.clearTimeout(timer);
                reject(error);
            },
        );
    });
}
