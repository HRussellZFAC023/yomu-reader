import {
    gmPrivateStorageDelete,
    gmPrivateStorageGet,
    gmPrivateStorageSet,
} from '../app/storage';
import {
    isCloudSettingsAuthorizationState,
    type CloudSettingsAuthorization,
} from './cloud-settings-auth-state';
import {
    isCloudSettingsAction,
    type CloudSettingsAction,
    type PendingCloudSettingsAction,
} from './cloud-settings-resume';

const CLOUD_SETTINGS_PENDING_ACTION_KEY = 'yomu:private:cloud-settings-sync-pending:v1';
const CLOUD_SETTINGS_PENDING_ACTION_TTL_MS = 10 * 60 * 1000;

async function rememberPendingCloudSettingsAction(
    action: CloudSettingsAction,
    authorization: CloudSettingsAuthorization,
): Promise<void> {
    await gmPrivateStorageSet(CLOUD_SETTINGS_PENDING_ACTION_KEY, {
        action,
        startedAt: Date.now(),
        state: authorization.state,
    } satisfies PendingCloudSettingsAction);
}

export function clearPendingCloudSettingsAction(): Promise<void> {
    return gmPrivateStorageDelete(CLOUD_SETTINGS_PENDING_ACTION_KEY);
}

export async function rememberCloudSettingsRedirectHandoff(
    required: boolean,
    action: CloudSettingsAction,
    authorization: CloudSettingsAuthorization,
): Promise<void> {
    if (!required) return;
    await rememberPendingCloudSettingsAction(action, authorization);
}

export async function clearCloudSettingsRedirectHandoff(required: boolean): Promise<void> {
    if (!required) return;
    await clearPendingCloudSettingsAction();
}

export async function readPendingCloudSettingsAction(): Promise<PendingCloudSettingsAction | null> {
    const pending = await gmPrivateStorageGet<unknown>(CLOUD_SETTINGS_PENDING_ACTION_KEY, null);
    if (pending === null) return null;
    if (!isPendingCloudSettingsAction(pending)
        || Date.now() - pending.startedAt > CLOUD_SETTINGS_PENDING_ACTION_TTL_MS) {
        await clearPendingCloudSettingsAction();
        return null;
    }
    return pending;
}

function isPendingCloudSettingsAction(value: unknown): value is PendingCloudSettingsAction {
    if (!isPendingCloudSettingsRecord(value)) return false;
    const record = value as Partial<PendingCloudSettingsAction>;
    return [
        isFiniteTimestamp(record.startedAt),
        isCloudSettingsAuthorizationState(record.state),
        isCloudSettingsAction(record.action),
    ].every(Boolean);
}

function isPendingCloudSettingsRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

function isFiniteTimestamp(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}
