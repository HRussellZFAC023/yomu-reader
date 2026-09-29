import { objectRecord } from "./values";

const TRANSACTION_FIELD = "__yomuSettingsPersistenceTransactionV1";
const COMMIT_FIELD = "__yomuSettingsPersistenceCommitV1";
export interface SerializedSnapshot {
    readonly existed: boolean;
    readonly previousValue: unknown;
    readonly localFallbackExisted: boolean;
    readonly localFallbackValue: unknown;
}

export interface TransactionMarker {
    readonly version: 1;
    readonly settings: SerializedSnapshot;
    readonly intentLedger: SerializedSnapshot;
}

export interface CommittedSettingsStoragePair {
    readonly settings: unknown;
    readonly intentLedger: unknown;
}

export function committedSettingsStoragePair(
    storedSettings: unknown,
    storedIntentLedger: unknown,
): CommittedSettingsStoragePair | null {
    const marker = transactionMarker(storedSettings);
    const { settings, intentLedger } = marker
        ? { settings: snapshotValue(marker.settings), intentLedger: snapshotValue(marker.intentLedger) }
        : { settings: storedSettings, intentLedger: storedIntentLedger };
    return matchingCommittedPair(settings, intentLedger);
}

function matchingCommittedPair(settings: unknown, intentLedger: unknown): CommittedSettingsStoragePair | null {
    if (settings == null && intentLedger == null) return { settings: null, intentLedger: null };
    const settingsId = commitId(settings);
    const ledgerId = commitId(intentLedger);
    return typeof settingsId === 'string' && settingsId === ledgerId
        ? { settings: withoutCommit(settings), intentLedger: withoutCommit(intentLedger) }
        : null;
}

export function commitId(value: unknown): string | null | undefined {
    const record = objectRecord(value);
    if (!record) return undefined;
    return recordCommitId(record);
}

function recordCommitId(record: Record<string, unknown>): string | null | undefined {
    if (!Object.hasOwn(record, COMMIT_FIELD)) return undefined;
    const id = record[COMMIT_FIELD];
    return typeof id === 'string' && id ? id : null;
}

export function withCommit(value: object, id: string): object {
    return { ...value, [COMMIT_FIELD]: id };
}

function withoutCommit(value: unknown): unknown {
    const record = objectRecord(value);
    if (!record || !Object.hasOwn(record, COMMIT_FIELD)) return value;
    const clean = { ...record };
    delete clean[COMMIT_FIELD];
    return clean;
}

export function transactionMarker(value: unknown): TransactionMarker | null {
    const owner = objectRecord(value);
    const marker = owner && objectRecord(owner[TRANSACTION_FIELD]);
    if (!marker) return null;
    return validatedTransactionMarker(marker);
}

function validatedTransactionMarker(marker: Record<string, unknown>): TransactionMarker | null {
    if (marker.version !== 1) return null;
    const settings = serializedSnapshot(marker.settings);
    const intentLedger = serializedSnapshot(marker.intentLedger);
    return settings && intentLedger ? { version: 1, settings, intentLedger } : null;
}

function serializedSnapshot(value: unknown): SerializedSnapshot | null {
    const record = objectRecord(value);
    return record
        && typeof record.existed === 'boolean'
        && typeof record.localFallbackExisted === 'boolean'
        ? {
            existed: record.existed,
            previousValue: record.previousValue,
            localFallbackExisted: record.localFallbackExisted,
            localFallbackValue: record.localFallbackValue,
        }
        : null;
}

export function snapshotValue(snapshot: SerializedSnapshot): unknown {
    return snapshot.existed ? snapshot.previousValue : null;
}
