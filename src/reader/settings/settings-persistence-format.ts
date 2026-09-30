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

/**
 * The v1.9.3 contract (ADR-0012): a matching commit id is one committed pair,
 * and so are two values with no id at all. Before 1.9.1 no writer stamped ids,
 * and a 1.9.x machine write over an unmarked ledger kept both sides unmarked,
 * so an absent id on both sides is a committed pair, not a torn one. The next
 * Save stamps both sides; nothing is rewritten on read. One side marked, two
 * different ids or an empty id is a torn pair and never matches.
 */
function matchingCommittedPair(settings: unknown, intentLedger: unknown): CommittedSettingsStoragePair | null {
    const settingsId = commitId(settings);
    return settingsId !== null && settingsId === commitId(intentLedger)
        ? { settings: withoutCommit(settings), intentLedger: withoutCommit(intentLedger) }
        : null;
}

function commitId(value: unknown): string | null | undefined {
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
