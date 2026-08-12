import type { ReaderSettings } from '../app/types';
import {
    gmStorageDelete,
    gmStorageGet,
    gmStorageGetShared,
    gmStorageSet,
    isHostedYomuOrigin,
    localFallbackStoredValue,
    restoreLocalFallbackStoredValue,
} from '../app/storage';
import {
    SETTINGS_INTENT_LEDGER_STORAGE_KEY,
    settingsIntentLedgerFromStorage,
    type SettingsIntentLedger,
} from './intent-ledger';
import { normalizeLearningTargetChosen } from './learning-target-choice';
import { createStorageCoordinationId } from '../app/gm-storage-lease';

export const SETTINGS_STORAGE_KEY = 'jpdb-popup-reader-settings';
export const EXPLICIT_USER_SETTINGS_STORAGE_KEY = 'yomu:explicit-user-settings:v1';
export const SETTINGS_PERSISTENCE_STORAGE_LEASE = 'reader-settings-persistence';

const SETTINGS_TRANSACTION_FIELD = '__yomuSettingsPersistenceTransactionV1';
const SETTINGS_COMMIT_FIELD = '__yomuSettingsPersistenceCommitV1';
const SETTINGS_STORAGE_MISSING = '\u0000yomu-settings-storage-missing:v1';
const LOCAL_FALLBACK_MISSING = Symbol('yomu-settings-local-fallback-missing');
const AUTHORITATIVE_TRANSACTION_WRITE = {
    localFallbackOnAuthoritativeFailure: 'preserve',
} as const;

interface SettingsStorageSnapshot {
    readonly key: string;
    readonly existed: boolean;
    readonly previousValue: unknown;
    readonly localFallbackExisted: boolean;
    readonly localFallbackValue: unknown;
}

interface SerializedSettingsStorageSnapshot {
    readonly existed: boolean;
    readonly previousValue: unknown;
    readonly localFallbackExisted: boolean;
    readonly localFallbackValue: unknown;
}

interface SettingsTransactionMarker {
    readonly version: 1;
    readonly settings: SerializedSettingsStorageSnapshot;
    readonly intentLedger: SerializedSettingsStorageSnapshot;
}

export interface SettingsPersistenceView {
    readonly settings: unknown;
    readonly intentLedger: SettingsIntentLedger;
}

export interface CommittedSettingsStoragePair {
    readonly settings: unknown;
    readonly intentLedger: unknown;
}

interface SettingsPersistenceSample {
    readonly beforeSettings: unknown;
    readonly beforeIntentLedger: unknown;
    readonly afterIntentLedger: unknown;
    readonly afterSettings: unknown;
}

/**
 * Reads a committed settings view. Both transaction-owned keys are sampled on
 * both sides of the read. This rejects not only a normal commit crossing but
 * also a failed transaction whose SETTINGS value returns to its original byte
 * after the staged ledger has already been observed.
 */
export async function readSettingsPersistenceView(): Promise<SettingsPersistenceView> {
    for (let attempt = 0; attempt < 3; attempt++) {
        const view = await stableSettingsPersistenceView(await readSettingsPersistenceSample());
        if (view) return view;
    }
    return {
        settings: null,
        intentLedger: settingsIntentLedgerFromStorage(null, null),
    };
}

async function readSettingsPersistenceSample(): Promise<SettingsPersistenceSample> {
    return {
        beforeSettings: await readSettingsStorageValue<unknown>(SETTINGS_STORAGE_KEY, null),
        beforeIntentLedger: await readSettingsStorageValue<unknown>(SETTINGS_INTENT_LEDGER_STORAGE_KEY, null),
        afterIntentLedger: await readSettingsStorageValue<unknown>(SETTINGS_INTENT_LEDGER_STORAGE_KEY, null),
        afterSettings: await readSettingsStorageValue<unknown>(SETTINGS_STORAGE_KEY, null),
    };
}

function stableSettingsPersistenceView(
    sample: SettingsPersistenceSample,
): Promise<SettingsPersistenceView | null> {
    return settingsPersistenceSampleIsStable(sample)
        ? settingsPersistenceView(sample.afterSettings, sample.afterIntentLedger)
        : Promise.resolve(null);
}

function settingsPersistenceSampleIsStable(sample: SettingsPersistenceSample): boolean {
    return storedValuesMatch(sample.beforeSettings, sample.afterSettings)
        && storedValuesMatch(sample.beforeIntentLedger, sample.afterIntentLedger);
}

async function settingsPersistenceView(
    storedSettings: unknown,
    storedIntentLedger: unknown,
): Promise<SettingsPersistenceView | null> {
    const committed = committedSettingsStoragePair(storedSettings, storedIntentLedger);
    if (!committed) return null;
    const intentLedger = settingsIntentLedgerFromStorage(
        committed.intentLedger,
        await readSettingsStorageValue<unknown>(EXPLICIT_USER_SETTINGS_STORAGE_KEY, null),
    );
    return { settings: committed.settings, intentLedger };
}

/**
 * Raw document-start readers use the same commit witness as `loadSettings`.
 * Both unwitnessed values are accepted for genuine pre-transaction installs;
 * one witness or two different witnesses fail closed.
 */
export function committedSettingsStoragePair(
    storedSettings: unknown,
    storedIntentLedger: unknown,
): CommittedSettingsStoragePair | null {
    const marker = settingsTransactionMarker(storedSettings);
    const committedSettings = marker
        ? storedSnapshotValue(marker.settings)
        : storedSettings;
    const committedIntentLedger = marker
        ? storedSnapshotValue(marker.intentLedger)
        : storedIntentLedger;
    return settingsCommitMatches(committedSettings, committedIntentLedger)
        ? {
            settings: withoutSettingsCommit(committedSettings),
            intentLedger: withoutSettingsCommit(committedIntentLedger),
        }
        : null;
}

function readSettingsStorageValue<T>(key: string, fallback: T): Promise<T> {
    return isHostedYomuOrigin()
        ? gmStorageGet(key, fallback)
        : gmStorageGetShared(key, fallback);
}

function storedValuesMatch(left: unknown, right: unknown): boolean {
    try {
        return JSON.stringify(left) === JSON.stringify(right);
    } catch {
        return false;
    }
}

function settingsCommitMatches(settings: unknown, intentLedger: unknown): boolean {
    const settingsId = settingsCommitId(settings);
    const ledgerId = settingsCommitId(intentLedger);
    return settingsId !== null && ledgerId !== null && settingsId === ledgerId;
}

function settingsCommitId(value: unknown): string | null | undefined {
    const record = objectRecord(value);
    return record ? recordSettingsCommitId(record) : undefined;
}

function recordSettingsCommitId(record: Record<string, unknown>): string | null | undefined {
    return Object.hasOwn(record, SETTINGS_COMMIT_FIELD)
        ? validSettingsCommitId(record[SETTINGS_COMMIT_FIELD])
        : undefined;
}

function validSettingsCommitId(value: unknown): string | null {
    return typeof value === 'string' && value ? value : null;
}

function withSettingsCommit(value: object, commitId: string | null | undefined): object {
    return commitId ? { ...value, [SETTINGS_COMMIT_FIELD]: commitId } : value;
}

function withoutSettingsCommit(value: unknown): unknown {
    const record = objectRecord(value);
    if (!record || !Object.hasOwn(record, SETTINGS_COMMIT_FIELD)) return value;
    const clean = { ...record };
    delete clean[SETTINGS_COMMIT_FIELD];
    return clean;
}

/**
 * The settings marker keeps every observer on the previous target while the
 * next intent ledger is staged. Writing the real settings blob last is the
 * single commit/publication event for loadSettings, document-start activation,
 * and the preferred-site-language gate.
 */
export async function persistSettingsStorageTransaction(
    nextIntentLedger: SettingsIntentLedger | undefined,
    settings: Partial<ReaderSettings>,
): Promise<void> {
    const [settingsSnapshot, intentLedgerSnapshot] = await settingsStorageSnapshots();
    const commitId = settingsTransactionCommitId(nextIntentLedger, intentLedgerSnapshot);
    const attempted = new Set<string>();
    try {
        await stageSettingsIntent(nextIntentLedger, settingsSnapshot, intentLedgerSnapshot, commitId, attempted);
        await gmStorageSet(
            SETTINGS_STORAGE_KEY,
            withSettingsCommit(settings, commitId),
            AUTHORITATIVE_TRANSACTION_WRITE,
        );
    } catch (error) {
        await rollbackSettingsTransaction(error, settingsSnapshot, intentLedgerSnapshot, attempted);
    }
}

function settingsTransactionCommitId(
    nextIntentLedger: SettingsIntentLedger | undefined,
    intentLedgerSnapshot: SettingsStorageSnapshot,
): string | null | undefined {
    return nextIntentLedger === undefined
        ? settingsCommitId(intentLedgerSnapshot.previousValue)
        : createStorageCoordinationId();
}

async function stageSettingsIntent(
    nextIntentLedger: SettingsIntentLedger | undefined,
    settingsSnapshot: SettingsStorageSnapshot,
    intentLedgerSnapshot: SettingsStorageSnapshot,
    commitId: string | null | undefined,
    attempted: Set<string>,
): Promise<void> {
    attempted.add(SETTINGS_STORAGE_KEY);
    if (nextIntentLedger === undefined) return;
    await gmStorageSet(
        SETTINGS_STORAGE_KEY,
        settingsTransactionRecord(settingsSnapshot, intentLedgerSnapshot),
        AUTHORITATIVE_TRANSACTION_WRITE,
    );
    attempted.add(SETTINGS_INTENT_LEDGER_STORAGE_KEY);
    await gmStorageSet(
        SETTINGS_INTENT_LEDGER_STORAGE_KEY,
        withSettingsCommit(nextIntentLedger, commitId),
        AUTHORITATIVE_TRANSACTION_WRITE,
    );
}

async function rollbackSettingsTransaction(
    error: unknown,
    settingsSnapshot: SettingsStorageSnapshot,
    intentLedgerSnapshot: SettingsStorageSnapshot,
    attempted: ReadonlySet<string>,
): Promise<never> {
    const rollbackErrors = await restoreSettingsStorageSnapshots(
        [intentLedgerSnapshot, settingsSnapshot].filter(snapshot => attempted.has(snapshot.key)),
    );
    if (!rollbackErrors.length) throw error;
    throw new AggregateError(
        [error, ...rollbackErrors],
        `Settings persistence failed and ${rollbackErrors.length} rollback operation(s) also failed.`,
    );
}

async function settingsStorageSnapshots(): Promise<[SettingsStorageSnapshot, SettingsStorageSnapshot]> {
    const rawSettingsSnapshot = await settingsStorageSnapshot(SETTINGS_STORAGE_KEY);
    const interrupted = settingsTransactionMarker(rawSettingsSnapshot.previousValue);
    if (interrupted) {
        return [
            snapshotFromMarker(SETTINGS_STORAGE_KEY, interrupted.settings),
            snapshotFromMarker(SETTINGS_INTENT_LEDGER_STORAGE_KEY, interrupted.intentLedger),
        ];
    }
    return [
        rawSettingsSnapshot,
        await settingsStorageSnapshot(SETTINGS_INTENT_LEDGER_STORAGE_KEY),
    ];
}

async function settingsStorageSnapshot(key: string): Promise<SettingsStorageSnapshot> {
    const stored = await readSettingsStorageValue<unknown>(key, SETTINGS_STORAGE_MISSING);
    const existed = stored !== SETTINGS_STORAGE_MISSING;
    const previousValue = existed ? stored : null;
    const localFallbackValue = isHostedYomuOrigin()
        ? localFallbackStoredValue<unknown>(key, LOCAL_FALLBACK_MISSING)
        : LOCAL_FALLBACK_MISSING;
    return {
        key,
        existed,
        previousValue,
        localFallbackExisted: localFallbackValue !== LOCAL_FALLBACK_MISSING,
        localFallbackValue: localFallbackValue === LOCAL_FALLBACK_MISSING ? null : localFallbackValue,
    };
}

function settingsTransactionRecord(
    settings: SettingsStorageSnapshot,
    intentLedger: SettingsStorageSnapshot,
): Record<string, unknown> {
    const previous = objectRecord(settings.previousValue) ?? {};
    return {
        ...previous,
        learningTargetChosen: normalizeLearningTargetChosen(settings.existed ? previous : null),
        onboardingSeen: typeof previous.onboardingSeen === 'boolean' ? previous.onboardingSeen : false,
        [SETTINGS_TRANSACTION_FIELD]: {
            version: 1,
            settings: serializedSnapshot(settings),
            intentLedger: serializedSnapshot(intentLedger),
        } satisfies SettingsTransactionMarker,
    };
}

function settingsTransactionMarker(value: unknown): SettingsTransactionMarker | null {
    const marker = transactionMarkerRecord(value);
    return marker?.version === 1 ? transactionMarkerSnapshots(marker) : null;
}

function transactionMarkerRecord(value: unknown): Record<string, unknown> | null {
    const record = objectRecord(value);
    return record ? objectRecord(record[SETTINGS_TRANSACTION_FIELD]) : null;
}

function transactionMarkerSnapshots(marker: Record<string, unknown>): SettingsTransactionMarker | null {
    const settings = serializedSnapshotRecord(marker.settings);
    const intentLedger = serializedSnapshotRecord(marker.intentLedger);
    return settings && intentLedger ? { version: 1, settings, intentLedger } : null;
}

function serializedSnapshot(snapshot: SettingsStorageSnapshot): SerializedSettingsStorageSnapshot {
    return {
        existed: snapshot.existed,
        previousValue: snapshot.previousValue,
        localFallbackExisted: snapshot.localFallbackExisted,
        localFallbackValue: snapshot.localFallbackValue,
    };
}

function serializedSnapshotRecord(value: unknown): SerializedSettingsStorageSnapshot | null {
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

function snapshotFromMarker(key: string, snapshot: SerializedSettingsStorageSnapshot): SettingsStorageSnapshot {
    return { key, ...snapshot };
}

function storedSnapshotValue(snapshot: SerializedSettingsStorageSnapshot): unknown {
    return snapshot.existed ? snapshot.previousValue : null;
}

async function restoreSettingsStorageSnapshots(
    snapshots: readonly SettingsStorageSnapshot[],
): Promise<unknown[]> {
    const errors: unknown[] = [];
    for (const snapshot of snapshots) {
        const snapshotErrors = await restoreSettingsStorageSnapshot(snapshot);
        errors.push(...snapshotErrors);
        // The SETTINGS marker is the remaining isolation boundary if the
        // staged ledger cannot be rolled back. Publishing the old canonical
        // settings blob here would expose that uncommitted ledger as active.
        if (snapshot.key === SETTINGS_INTENT_LEDGER_STORAGE_KEY && snapshotErrors.length) break;
    }
    return errors;
}

async function restoreSettingsStorageSnapshot(snapshot: SettingsStorageSnapshot): Promise<unknown[]> {
    const errors: unknown[] = [];
    try {
        if (snapshot.existed) {
            await gmStorageSet(snapshot.key, snapshot.previousValue, AUTHORITATIVE_TRANSACTION_WRITE);
        } else await gmStorageDelete(snapshot.key);
    } catch (error) {
        errors.push(error);
    }
    try {
        restoreLocalFallback(snapshot);
    } catch (error) {
        errors.push(error);
    }
    return errors;
}

function restoreLocalFallback(snapshot: SettingsStorageSnapshot): void {
    restoreLocalFallbackStoredValue(
        snapshot.key,
        snapshot.localFallbackValue,
        snapshot.localFallbackExisted,
    );
}

function objectRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}
