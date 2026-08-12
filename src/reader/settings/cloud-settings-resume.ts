import type { InterfaceLanguage } from '../app/types';
import type { CloudSettingsAuthRedirectResult } from './cloud-sync';
import type { CloudSettingsAuthorization } from './cloud-settings-auth-state';

export type CloudSettingsAction = 'sync-cloud-settings' | 'restore-cloud-settings';

export function isCloudSettingsAction(action: unknown): action is CloudSettingsAction {
    return action === 'sync-cloud-settings' || action === 'restore-cloud-settings';
}

export interface PendingCloudSettingsAction extends CloudSettingsAuthorization {
    action: CloudSettingsAction;
    startedAt: number;
}

interface CloudSettingsResumeHost {
    trustedSurface: boolean;
    available: boolean;
    language: InterfaceLanguage;
    readPending: () => Promise<PendingCloudSettingsAction | null>;
    clearPending: () => Promise<void>;
    consumeAuthorization: (expectedState?: string) => CloudSettingsAuthRedirectResult | null;
    perform: (action: CloudSettingsAction, language: InterfaceLanguage) => Promise<void>;
    authorizationFailed: (error: string | undefined, language: InterfaceLanguage) => void;
    actionFailed: (error: unknown, language: InterfaceLanguage) => void;
    openBackup: () => void;
}

interface CloudSettingsResumeRequest {
    pending: PendingCloudSettingsAction;
    auth: CloudSettingsAuthRedirectResult;
}

/**
 * Resumes the redirect-based cloud action as a small protocol: validate the
 * owned surface, pair one pending action with one auth result, consume the
 * pending marker, then report either authorization or action failure through
 * the host. The dialog only supplies UI effects.
 */
export async function resumePendingCloudSettingsAction(host: CloudSettingsResumeHost): Promise<boolean> {
    const request = await readCloudSettingsResumeRequest(host);
    if (!request) return false;
    await host.clearPending();
    if (!request.auth.ok) {
        host.authorizationFailed(request.auth.error, host.language);
        host.openBackup();
        return true;
    }
    await performResumedCloudSettingsAction(host, request.pending.action);
    return true;
}

async function readCloudSettingsResumeRequest(
    host: CloudSettingsResumeHost,
): Promise<CloudSettingsResumeRequest | null> {
    if (!cloudSettingsResumeAvailable(host)) return null;
    const pending = await host.readPending();
    // Calling with no pending state deliberately consumes and quarantines a
    // forged/replayed callback instead of leaving it available for a later action.
    const auth = host.consumeAuthorization(pending?.state);
    return cloudSettingsResumeRequest(pending, auth);
}

function cloudSettingsResumeAvailable(host: CloudSettingsResumeHost): boolean {
    return host.trustedSurface && host.available;
}

function cloudSettingsResumeRequest(
    pending: PendingCloudSettingsAction | null,
    auth: CloudSettingsAuthRedirectResult | null,
): CloudSettingsResumeRequest | null {
    if (!pending) return null;
    if (!auth) return null;
    return { pending, auth };
}

async function performResumedCloudSettingsAction(
    host: CloudSettingsResumeHost,
    action: CloudSettingsAction,
): Promise<void> {
    try {
        await host.perform(action, host.language);
        if (action === 'sync-cloud-settings') host.openBackup();
    } catch (error) {
        host.actionFailed(error, host.language);
        host.openBackup();
    }
}
