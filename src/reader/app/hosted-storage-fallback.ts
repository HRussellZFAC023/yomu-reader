import { isRecord } from '../core/object-utils';
import { DOCS_ORIGIN } from './constants';
import { HOSTED_LOCAL_SETTINGS_KEYS } from './hosted-demo-settings';
import { isPrivilegedYomuLocalDevelopmentOrigin } from './trusted-hosted-url';

const HOSTED_SETTINGS_BLOB_KEY = 'jpdb-popup-reader-settings';
const HOSTED_SETTINGS_INTENT_KEY = 'yomu:settings-intent:v2';
const HOSTED_SETTINGS_PENDING_GM_PATCH_FIELD = '__yomuHostedPendingGmPatch';
const HOSTED_SETTINGS_TRANSACTION_FIELD = '__yomuSettingsPersistenceTransactionV1';
const HOSTED_SETTINGS_COMMIT_FIELD = '__yomuSettingsPersistenceCommitV1';
const HOSTED_ROOT_POLICY_KEYS = new Set([
    HOSTED_SETTINGS_BLOB_KEY,
    'yomu:explicit-user-settings:v1',
]);
const HOSTED_SETTINGS_COORDINATION_FIELDS = [
    HOSTED_SETTINGS_TRANSACTION_FIELD,
    HOSTED_SETTINGS_COMMIT_FIELD,
] as const;

export function isHostedSettingsStorageKey(key: string): boolean {
    return key === HOSTED_SETTINGS_BLOB_KEY;
}

function isHostedYomuLocation(origin: string, hostname: string, pathname: string): boolean {
    if (origin === DOCS_ORIGIN) return true;
    if (isHostedGithubPagesLocation(hostname, pathname)) return true;
    return isHostedLocalDevelopmentLocation(origin, pathname);
}

export function isHostedYomuOrigin(): boolean {
    try {
        return isHostedYomuLocation(location.origin, location.hostname, location.pathname);
    } catch {
        return false;
    }
}

function isHostedGithubPagesLocation(hostname: string, pathname: string): boolean {
    return hostname === 'hrussellzfac023.github.io' && pathname.startsWith('/yomu-reader/');
}

function isHostedLocalDevelopmentLocation(origin: string, pathname: string): boolean {
    if (!isPrivilegedYomuLocalDevelopmentOrigin(origin)) return false;
    return pathname.includes('/study/') || pathname.includes('/newtab/');
}

/** Remove hosted appearance/demo policy before promoting page storage into GM. */
export function hostedStoragePromotionValue<T>(key: string, value: T, hostedOrigin: boolean): T {
    const sanitized = sanitizedHostedStorageValue(key, value, hostedOrigin);
    return isRecord(sanitized)
        ? withoutSettingsCoordination(sanitized) as T
        : sanitized;
}

/** Return only the field patch recorded by an offline hosted settings writer. */
export function pendingHostedSettingsPatch(
    key: string,
    localValue: unknown,
    hostedOrigin: boolean,
): Record<string, unknown> | undefined {
    const localSettings = rawHostedSettingsRecord(key, localValue, hostedOrigin);
    if (!localSettings) return undefined;
    const patch = localSettings[HOSTED_SETTINGS_PENDING_GM_PATCH_FIELD];
    if (!isRecord(patch)) return undefined;
    const sanitized = sanitizedHostedStorageValue(key, patch, hostedOrigin);
    return withoutSettingsCoordination(sanitized as Record<string, unknown>);
}

/**
 * Preserve a hosted page's original comparison baseline and record only fields
 * changed while the shared GM backend was unavailable.
 */
export function hostedSettingsLocalFallbackValue(
    key: string,
    value: unknown,
    hostedOrigin: boolean,
    readPrevious: () => unknown,
): unknown {
    const current = sanitizedHostedSettingsRecord(key, value, hostedOrigin);
    if (!current) return value;
    const previousValue = readPrevious();
    const previous = sanitizedHostedSettingsRecord(key, previousValue, hostedOrigin);
    if (!previous) return current;
    return {
        ...current,
        [HOSTED_SETTINGS_PENDING_GM_PATCH_FIELD]: {
            ...earlierHostedPatch(previousValue),
            ...changedRecordFields(previous, current),
        },
    };
}

function sanitizedHostedStorageValue<T>(key: string, value: T, hostedOrigin: boolean): T {
    if (!hostedOrigin || !isRecord(value)) return value;
    const record: Record<string, unknown> = { ...value };
    const policy = hostedPolicyRecord(key, record);
    if (!policy) return value;
    delete policy[HOSTED_SETTINGS_PENDING_GM_PATCH_FIELD];
    HOSTED_LOCAL_SETTINGS_KEYS.forEach(hostedKey => delete policy[hostedKey]);
    return record as T;
}

function hostedPolicyRecord(
    key: string,
    record: Record<string, unknown>,
): Record<string, unknown> | null {
    if (key === HOSTED_SETTINGS_INTENT_KEY) return hostedIntentRecords(record);
    return HOSTED_ROOT_POLICY_KEYS.has(key) ? record : null;
}

function hostedIntentRecords(record: Record<string, unknown>): Record<string, unknown> | null {
    if (!isRecord(record.records)) return null;
    return record.records = { ...record.records };
}

function rawHostedSettingsRecord(
    key: string,
    value: unknown,
    hostedOrigin: boolean,
): Record<string, unknown> | null {
    if (!hostedOrigin || !isHostedSettingsStorageKey(key)) return null;
    return isRecord(value) ? value : null;
}

function sanitizedHostedSettingsRecord(
    key: string,
    value: unknown,
    hostedOrigin: boolean,
): Record<string, unknown> | null {
    const record = rawHostedSettingsRecord(key, value, hostedOrigin);
    return record
        ? sanitizedHostedStorageValue(key, record, hostedOrigin)
        : null;
}

function earlierHostedPatch(value: unknown): Record<string, unknown> {
    if (!isRecord(value)) return {};
    const patch = value[HOSTED_SETTINGS_PENDING_GM_PATCH_FIELD];
    return isRecord(patch) ? withoutSettingsCoordination(patch) : {};
}

function changedRecordFields(
    previous: Record<string, unknown>,
    current: Record<string, unknown>,
): Record<string, unknown> {
    const changed: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(current)) {
        if (JSON.stringify(previous[field]) !== JSON.stringify(value)) changed[field] = value;
    }
    return withoutSettingsCoordination(changed);
}

function withoutSettingsCoordination(record: Record<string, unknown>): Record<string, unknown> {
    const clean = { ...record };
    HOSTED_SETTINGS_COORDINATION_FIELDS.forEach(field => delete clean[field]);
    return clean;
}
