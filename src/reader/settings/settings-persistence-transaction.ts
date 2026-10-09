import { committedSettingsStoragePair, withCommit, transactionMarker, type SerializedSnapshot, type TransactionMarker } from "./settings-persistence-format";
export { committedSettingsStoragePair } from "./settings-persistence-format";
import type { ReaderSettings } from '../app/types';
import {
    createManagedWriteJournal,
    gmStorageGetStrict,
    gmStorageGetSharedStrict,
    isHostedYomuOrigin,
    type ManagedStoredValueState,
    type ManagedWriteJournal,
    type ManagedWriteReceipt,
} from '../app/storage';
import {
    SETTINGS_INTENT_LEDGER_STORAGE_KEY,
    parseSettingsIntentLedger,
    type SettingsIntentLedger,
} from './intent-ledger';
import { createStorageCoordinationId, STORAGE_WORK_LEASE_MS, type GmStorageLeaseOptions } from '../app/gm-storage-lease';
import { reportSaveWaitingForAnotherTab } from '../app/save-wait';
import {
    EXPLICIT_USER_SETTINGS_STORAGE_KEY,
    isSettingsAuthorityStorageKey,
    SETTINGS_STORAGE_KEY,
} from './settings-authority-storage-keys';

export { EXPLICIT_USER_SETTINGS_STORAGE_KEY, SETTINGS_STORAGE_KEY };
export const SETTINGS_PERSISTENCE_STORAGE_LEASE = 'reader-settings-persistence';
/** A settings save is storage work only: a tab that dies mid-save blocks the others briefly. */
export const SETTINGS_PERSISTENCE_LEASE_OPTIONS: GmStorageLeaseOptions = {
    leaseMs: STORAGE_WORK_LEASE_MS,
    guards: isSettingsAuthorityStorageKey,
    onWait: reportSaveWaitingForAnotherTab,
};

const TRANSACTION_FIELD = '__yomuSettingsPersistenceTransactionV1';

interface StorageSnapshot extends SerializedSnapshot {
    readonly receipt: ManagedWriteReceipt;
}

interface StorageSnapshots {
    readonly settings: StorageSnapshot;
    readonly intentLedger: StorageSnapshot;
}

export interface SettingsPersistenceView {
    readonly settings: unknown;
    readonly intentLedger: SettingsIntentLedger;
}

class InvalidSettingsBackupAuthorityError extends Error {
    override readonly name = 'InvalidSettingsBackupAuthorityError';
    readonly yomuUiCopyKey = 'settingsImportIncomplete' as const;
}

export type SettingsStorageRead = <T>(key: string, fallback: T) => Promise<T>;

export function readSettingsPersistenceViewStrict(): Promise<SettingsPersistenceView> {
    return readSettingsPersistenceViewStrictFrom(readSettingsStorageValueStrict);
}

/**
 * The ledger a Save builds on. A Save, import or onboarding is a full
 * replacement, so it does not need to witness the pair it replaces: a pair
 * that stays torn under the persistence lease is written over with a fresh
 * committed one, as v1.9.3 did, instead of wedging every later Save. A failing
 * backend, or a pair that is not torn but still unreadable (unstable samples,
 * a malformed ledger), rejects the Save exactly as it rejects the loader.
 */
export async function readSettingsIntentLedgerForWrite(): Promise<SettingsIntentLedger> {
    const read = readSettingsStorageValueStrict;
    const view = await stableSettingsPersistenceView(read);
    if (view) return view.intentLedger;
    if (committedSettingsStoragePair(await read(SETTINGS_STORAGE_KEY, null), await read(SETTINGS_INTENT_LEDGER_STORAGE_KEY, null))) {
        throw new Error('Settings storage did not provide a stable committed snapshot.');
    }
    return { revision: 0, records: {} };
}

export function serializeSettingsPersistencePair(
    settings: ReaderSettings,
    intentLedger: SettingsIntentLedger,
): Record<string, unknown> {
    const commit = createStorageCoordinationId();
    return {
        [SETTINGS_STORAGE_KEY]: withCommit(settings, commit),
        [SETTINGS_INTENT_LEDGER_STORAGE_KEY]: withCommit(intentLedger, commit),
    };
}

/** A startup/subscription read must witness one stable committed pair. */
export async function readSettingsPersistenceViewStrictFrom(
    read: SettingsStorageRead,
): Promise<SettingsPersistenceView> {
    const view = await stableSettingsPersistenceView(read);
    if (view) return view;
    throw new Error('Settings storage did not provide a stable committed snapshot.');
}

async function stableSettingsPersistenceView(
    read: SettingsStorageRead,
): Promise<SettingsPersistenceView | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
        const view = await sampledSettingsView(read);
        if (view) return view;
    }
    return null;
}

async function sampledSettingsView(read: SettingsStorageRead): Promise<SettingsPersistenceView | null> {
    const beforeSettings = await read<unknown>(SETTINGS_STORAGE_KEY, null);
    const beforeLedger = await read<unknown>(SETTINGS_INTENT_LEDGER_STORAGE_KEY, null);
    const afterLedger = await read<unknown>(SETTINGS_INTENT_LEDGER_STORAGE_KEY, null);
    const afterSettings = await read<unknown>(SETTINGS_STORAGE_KEY, null);
    if (!sampleIsStable(beforeSettings, beforeLedger, afterSettings, afterLedger)) return null;
    const committed = committedSettingsStoragePair(afterSettings, afterLedger);
    if (!committed) return null;
    const intentLedger = committed.intentLedger == null
        ? { revision: 0, records: {} }
        : parseSettingsIntentLedger(committed.intentLedger);
    if (!intentLedger) return null;
    return {
        settings: committed.settings,
        intentLedger,
    };
}

function sampleIsStable(
    beforeSettings: unknown,
    beforeLedger: unknown,
    afterSettings: unknown,
    afterLedger: unknown,
): boolean {
    return valuesMatch(beforeSettings, afterSettings) && valuesMatch(beforeLedger, afterLedger);
}

/** Validates the privileged pair in a backup before any imported value is staged. */
export async function readBackupSettingsPersistenceView(
    values: unknown,
): Promise<SettingsPersistenceView | null> {
    const authority = backupAuthority(values);
    if (!authority) return null;
    return readSettingsPersistenceViewStrictFrom(async <T>(key: string, fallback: T) => (
        Object.hasOwn(authority, key) ? authority[key] as T : fallback
    ));
}

function backupAuthority(values: unknown): Record<string, unknown> | null {
    const record = objectRecord(values);
    if (!record) return null;
    const hasSettings = Object.hasOwn(record, SETTINGS_STORAGE_KEY);
    const hasIntentLedger = Object.hasOwn(record, SETTINGS_INTENT_LEDGER_STORAGE_KEY);
    if (!hasSettings && !hasIntentLedger) return null;
    validateBackupAuthority(record);
    return record;
}

/** A backup pair is read by the same v1.9.3 rule as stored settings (ADR-0012). */
function validateBackupAuthority(record: Record<string, unknown>): void {
    const committed = committedSettingsStoragePair(
        record[SETTINGS_STORAGE_KEY] ?? null,
        record[SETTINGS_INTENT_LEDGER_STORAGE_KEY] ?? null,
    );
    if (!committed) {
        throw new InvalidSettingsBackupAuthorityError(
            'Settings backup contains an incomplete settings persistence transaction.',
        );
    }
    if (!objectRecord(committed.settings)) {
        throw new InvalidSettingsBackupAuthorityError(
            'Settings backup contains a malformed canonical settings value.',
        );
    }
    if (committed.intentLedger != null && !parseSettingsIntentLedger(committed.intentLedger)) {
        throw new InvalidSettingsBackupAuthorityError(
            'Settings backup contains a malformed settings intent ledger.',
        );
    }
}

/** The canonical settings write is the sole publication event. */
export async function persistSettingsStorageTransaction(
    nextIntentLedger: SettingsIntentLedger,
    settings: Partial<ReaderSettings>,
): Promise<void> {
    const journal = createManagedWriteJournal(true);
    const snapshots = await storageSnapshots(journal);
    try {
        const id = createStorageCoordinationId();
        await journal.write(snapshots.settings.receipt, transactionRecord(snapshots.settings, snapshots.intentLedger));
        await journal.write(snapshots.intentLedger.receipt, withCommit(nextIntentLedger, id));
        await journal.write(snapshots.settings.receipt, withCommit(settings, id));
        journal.commit();
    } catch (error) {
        await journal.reject(error, 'Settings persistence failed', true);
    }
}

async function storageSnapshots(journal: ManagedWriteJournal): Promise<StorageSnapshots> {
    const settingsReceipt = await journal.capture(SETTINGS_STORAGE_KEY);
    const rawSettings = storageSnapshot(settingsReceipt);
    const marker = transactionMarker(rawSettings.previousValue);
    if (!marker) {
        return {
            settings: rawSettings,
            intentLedger: storageSnapshot(await journal.capture(SETTINGS_INTENT_LEDGER_STORAGE_KEY)),
        };
    }
    const intentReceipt = await journal.capture(SETTINGS_INTENT_LEDGER_STORAGE_KEY);
    const settings = markerSnapshot(settingsReceipt, marker.settings);
    const intentLedger = markerSnapshot(intentReceipt, marker.intentLedger);
    journal.adoptInterrupted(
        settingsReceipt,
        authorityState(settings),
        localState(settings),
    );
    journal.adoptInterrupted(
        intentReceipt,
        authorityState(intentLedger),
        localState(intentLedger),
    );
    return { settings, intentLedger };
}

function storageSnapshot(receipt: ManagedWriteReceipt): StorageSnapshot {
    const { existed, value } = receipt.previous;
    return {
        receipt,
        existed,
        previousValue: value,
        // Raw page storage never enters the privileged crash marker.
        localFallbackExisted: existed,
        localFallbackValue: value,
    };
}

function authorityState(snapshot: SerializedSnapshot): ManagedStoredValueState {
    return { existed: snapshot.existed, value: snapshot.previousValue };
}

function localState(snapshot: SerializedSnapshot): ManagedStoredValueState {
    return { existed: snapshot.localFallbackExisted, value: snapshot.localFallbackValue };
}

function transactionRecord(settings: StorageSnapshot, intentLedger: StorageSnapshot): Record<string, unknown> {
    const previous = objectRecord(settings.previousValue) ?? {};
    return {
        ...previous,
        [TRANSACTION_FIELD]: {
            version: 1,
            settings: serializeSnapshot(settings),
            intentLedger: serializeSnapshot(intentLedger),
        } satisfies TransactionMarker,
    };
}

function serializeSnapshot(snapshot: StorageSnapshot): SerializedSnapshot {
    // Never promote raw hosted-page storage into the privileged marker.
    return {
        existed: snapshot.existed,
        previousValue: snapshot.previousValue,
        localFallbackExisted: snapshot.existed,
        localFallbackValue: snapshot.previousValue,
    };
}

function markerSnapshot(receipt: ManagedWriteReceipt, snapshot: SerializedSnapshot): StorageSnapshot {
    return { receipt, ...snapshot };
}

function readSettingsStorageValueStrict<T>(key: string, fallback: T): Promise<T> {
    return isHostedYomuOrigin() ? gmStorageGetStrict(key, fallback) : gmStorageGetSharedStrict(key, fallback);
}

function valuesMatch(left: unknown, right: unknown): boolean {
    try {
        return JSON.stringify(left) === JSON.stringify(right);
    } catch {
        return false;
    }
}

function objectRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}
