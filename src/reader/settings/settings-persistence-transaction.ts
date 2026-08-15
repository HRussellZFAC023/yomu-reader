import type { ReaderSettings } from '../app/types';
import {
    createManagedWriteJournal,
    exportManagedStoredValues,
    gmStorageGet,
    gmStorageGetStrict,
    gmStorageGetShared,
    gmStorageGetSharedStrict,
    isHostedYomuOrigin,
    type ManagedStoredValueState,
    type ManagedWriteJournal,
    type ManagedWriteReceipt,
} from '../app/storage';
import {
    SETTINGS_INTENT_LEDGER_STORAGE_KEY,
    settingsIntentKeys,
    settingsIntentLedgerFromStorage,
    type SettingsIntentLedger,
} from './intent-ledger';
import { normalizeLearningTargetChosen } from './learning-target-choice';
import { createStorageCoordinationId } from '../app/gm-storage-lease';
import {
    EXPLICIT_USER_SETTINGS_STORAGE_KEY,
    SETTINGS_STORAGE_KEY,
} from './settings-authority-storage-keys';

export { EXPLICIT_USER_SETTINGS_STORAGE_KEY, SETTINGS_STORAGE_KEY };
export const SETTINGS_PERSISTENCE_STORAGE_LEASE = 'reader-settings-persistence';

const TRANSACTION_FIELD = '__yomuSettingsPersistenceTransactionV1';
const COMMIT_FIELD = '__yomuSettingsPersistenceCommitV1';

interface SerializedSnapshot {
    readonly existed: boolean;
    readonly previousValue: unknown;
    readonly localFallbackExisted: boolean;
    readonly localFallbackValue: unknown;
}

interface TransactionMarker {
    readonly version: 1;
    readonly settings: SerializedSnapshot;
    readonly intentLedger: SerializedSnapshot;
}

interface StorageSnapshot extends SerializedSnapshot {
    readonly receipt: ManagedWriteReceipt;
}

interface StorageSnapshots {
    readonly settings: StorageSnapshot;
    readonly intentLedger: StorageSnapshot;
    readonly interrupted: boolean;
}

export interface SettingsPersistenceView {
    readonly settings: unknown;
    readonly intentLedger: SettingsIntentLedger;
}

export interface SettingsBackupSnapshot {
    readonly settings: ReaderSettings;
    readonly storage: Record<string, unknown>;
}

export class InvalidSettingsBackupAuthorityError extends Error {
    override readonly name = 'InvalidSettingsBackupAuthorityError';
}

export interface CommittedSettingsStoragePair {
    readonly settings: unknown;
    readonly intentLedger: unknown;
}

interface BackupAuthority {
    readonly record: Record<string, unknown>;
    readonly hasSettings: boolean;
    readonly hasIntentLedger: boolean;
    readonly settings: Record<string, unknown>;
}

export type SettingsStorageRead = <T>(key: string, fallback: T) => Promise<T>;

/** Reads one witnessed settings/intent pair, retrying if a commit crosses the sample. */
export function readSettingsPersistenceView(): Promise<SettingsPersistenceView> {
    return readSettingsPersistenceViewFrom(readSettingsStorageValue);
}

/**
 * Exports settings and intent as one witnessed pair. Generic managed values
 * may be sampled independently, but a backup must never preserve one side of
 * a settings commit with the other side of a different commit.
 */
export async function exportSettingsBackupSnapshot(
    fallbackSettings: ReaderSettings,
): Promise<SettingsBackupSnapshot> {
    const storage = await exportManagedStoredValues();
    const view = await readSettingsPersistenceViewStrictFrom(readSettingsStorageValueStrict);
    const witnessed = objectRecord(view.settings);
    if (!witnessed) {
        if (backupContainsSettingsAuthority(storage)) {
            throw new Error('Could not capture canonical settings for backup.');
        }
        return { settings: detachedSettings(fallbackSettings), storage };
    }
    const settings = detachedSettings({
        ...fallbackSettings,
        ...witnessed,
        shortcuts: {
            ...fallbackSettings.shortcuts,
            ...objectRecord(witnessed.shortcuts),
        },
    } as ReaderSettings);
    const commit = createStorageCoordinationId();
    return {
        settings,
        storage: {
            ...storage,
            [SETTINGS_STORAGE_KEY]: withCommit(settings, commit),
            [SETTINGS_INTENT_LEDGER_STORAGE_KEY]: withCommit(view.intentLedger, commit),
        },
    };
}

function backupContainsSettingsAuthority(storage: Record<string, unknown>): boolean {
    return Object.hasOwn(storage, SETTINGS_STORAGE_KEY)
        || Object.hasOwn(storage, SETTINGS_INTENT_LEDGER_STORAGE_KEY);
}

function detachedSettings(settings: ReaderSettings): ReaderSettings {
    return structuredClone(settings);
}

export async function readSettingsPersistenceViewFrom(
    read: SettingsStorageRead,
): Promise<SettingsPersistenceView> {
    return await stableSettingsPersistenceView(read)
        ?? { settings: null, intentLedger: settingsIntentLedgerFromStorage(null, null) };
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
    return {
        settings: committed.settings,
        intentLedger: settingsIntentLedgerFromStorage(
            committed.intentLedger,
            await read<unknown>(EXPLICIT_USER_SETTINGS_STORAGE_KEY, null),
        ),
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
    if (!authority || !backupReplacesIntent(authority)) return null;
    return readSettingsPersistenceViewFrom(async <T>(key: string, fallback: T) => (
        Object.hasOwn(authority.record, key) ? authority.record[key] as T : fallback
    ));
}

function backupAuthority(values: unknown): BackupAuthority | null {
    const record = objectRecord(values);
    if (!record) return null;
    const hasSettings = Object.hasOwn(record, SETTINGS_STORAGE_KEY);
    const hasIntentLedger = Object.hasOwn(record, SETTINGS_INTENT_LEDGER_STORAGE_KEY);
    if (!hasSettings && !hasIntentLedger) return null;
    return validatedBackupAuthority(record, hasSettings, hasIntentLedger);
}

function validatedBackupAuthority(
    record: Record<string, unknown>,
    hasSettings: boolean,
    hasIntentLedger: boolean,
): BackupAuthority {
    const committed = backupCommittedPair(record);
    if (!committed) {
        throw new InvalidSettingsBackupAuthorityError(
            'Settings backup contains an incomplete settings persistence transaction.',
        );
    }
    const settings = objectRecord(committed.settings);
    if (!settings) {
        throw new InvalidSettingsBackupAuthorityError(
            'Settings backup contains a malformed canonical settings value.',
        );
    }
    validateBackupLedger(hasIntentLedger, committed.intentLedger);
    return { record, hasSettings, hasIntentLedger, settings };
}

function backupCommittedPair(record: Record<string, unknown>): CommittedSettingsStoragePair | null {
    return committedSettingsStoragePair(
        nullableBackupValue(record, SETTINGS_STORAGE_KEY),
        nullableBackupValue(record, SETTINGS_INTENT_LEDGER_STORAGE_KEY),
    );
}

function nullableBackupValue(record: Record<string, unknown>, key: string): unknown {
    return record[key] ?? null;
}

function validateBackupLedger(present: boolean, value: unknown): void {
    if (present && !validIntentLedger(value)) {
        throw new InvalidSettingsBackupAuthorityError(
            'Settings backup contains a malformed settings intent ledger.',
        );
    }
}

function backupReplacesIntent(authority: BackupAuthority): boolean {
    if (!authority.hasSettings) return false;
    if (authority.hasIntentLedger) return true;
    const legacy = settingsIntentLedgerFromStorage(
        null,
        authority.record[EXPLICIT_USER_SETTINGS_STORAGE_KEY] ?? null,
    );
    return settingsIntentKeys(legacy).some(key => Object.hasOwn(authority.settings, key));
}

function validIntentLedger(value: unknown): boolean {
    const ledger = objectRecord(value);
    const records = ledger && objectRecord(ledger.records);
    return Boolean(records
        && optionalFiniteNumber(ledger!, 'revision')
        && Object.values(records).every(item => {
            const record = objectRecord(item);
            return Boolean(record && optionalFiniteNumber(record, 'seq'));
        }));
}

function optionalFiniteNumber(record: Record<string, unknown>, key: string): boolean {
    const value = record[key];
    return !Object.hasOwn(record, key) || typeof value === 'number' && Number.isFinite(value);
}

/**
 * A marker exposes the previous pair while the ledger is staged. A matching
 * commit id exposes the new pair. Two genuinely pre-transaction values have
 * no ids and therefore also match.
 */
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
    const settingsId = commitId(settings);
    const ledgerId = commitId(intentLedger);
    return settingsId !== null && ledgerId !== null && settingsId === ledgerId
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

function withCommit(value: object, id: string | null | undefined): object {
    return id ? { ...value, [COMMIT_FIELD]: id } : value;
}

function withoutCommit(value: unknown): unknown {
    const record = objectRecord(value);
    if (!record || !Object.hasOwn(record, COMMIT_FIELD)) return value;
    const clean = { ...record };
    delete clean[COMMIT_FIELD];
    return clean;
}

/** The canonical settings write is the sole publication event. */
export async function persistSettingsStorageTransaction(
    nextIntentLedger: SettingsIntentLedger | undefined,
    settings: Partial<ReaderSettings>,
): Promise<void> {
    const journal = createManagedWriteJournal(true);
    const snapshots = await storageSnapshots(journal);
    try {
        const id = nextIntentLedger === undefined
            ? commitId(snapshots.intentLedger.previousValue)
            : createStorageCoordinationId();
        await stageIntent(nextIntentLedger, snapshots, id, journal);
        await journal.write(snapshots.settings.receipt, withCommit(settings, id));
        journal.commit();
    } catch (error) {
        await journal.reject(error, 'Settings persistence failed', true);
    }
}

async function stageIntent(
    next: SettingsIntentLedger | undefined,
    snapshots: StorageSnapshots,
    id: string | null | undefined,
    journal: ManagedWriteJournal,
): Promise<void> {
    if (next === undefined) {
        if (!snapshots.interrupted) return;
        await journal.restore(
            snapshots.intentLedger.receipt,
            'Interrupted settings intent cleanup failed.',
        );
        return;
    }
    const marker = transactionRecord(snapshots.settings, snapshots.intentLedger);
    await journal.write(snapshots.settings.receipt, marker);
    const ledger = withCommit(next, id);
    await journal.write(snapshots.intentLedger.receipt, ledger);
}

async function storageSnapshots(journal: ManagedWriteJournal): Promise<StorageSnapshots> {
    const settingsReceipt = await journal.capture(SETTINGS_STORAGE_KEY);
    const rawSettings = storageSnapshot(settingsReceipt);
    const marker = transactionMarker(rawSettings.previousValue);
    if (!marker) {
        return {
            settings: rawSettings,
            intentLedger: storageSnapshot(await journal.capture(SETTINGS_INTENT_LEDGER_STORAGE_KEY)),
            interrupted: false,
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
    return { settings, intentLedger, interrupted: true };
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
        learningTargetChosen: normalizeLearningTargetChosen(settings.existed ? previous : null),
        onboardingSeen: typeof previous.onboardingSeen === 'boolean' ? previous.onboardingSeen : false,
        [TRANSACTION_FIELD]: {
            version: 1,
            settings: serializeSnapshot(settings),
            intentLedger: serializeSnapshot(intentLedger),
        } satisfies TransactionMarker,
    };
}

function transactionMarker(value: unknown): TransactionMarker | null {
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

function serializeSnapshot(snapshot: StorageSnapshot): SerializedSnapshot {
    // Never promote raw hosted-page storage into the privileged marker.
    return {
        existed: snapshot.existed,
        previousValue: snapshot.previousValue,
        localFallbackExisted: snapshot.existed,
        localFallbackValue: snapshot.previousValue,
    };
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

function markerSnapshot(receipt: ManagedWriteReceipt, snapshot: SerializedSnapshot): StorageSnapshot {
    return { receipt, ...snapshot };
}

function snapshotValue(snapshot: SerializedSnapshot): unknown {
    return snapshot.existed ? snapshot.previousValue : null;
}

function readSettingsStorageValue<T>(key: string, fallback: T): Promise<T> {
    return isHostedYomuOrigin() ? gmStorageGet(key, fallback) : gmStorageGetShared(key, fallback);
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
