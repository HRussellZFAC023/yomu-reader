import {
    beginStoredValuesImport,
    type StoredValuesImportTransaction,
} from '../app/storage';
import {
    InvalidSettingsBackupAuthorityError,
    readBackupSettingsPersistenceView,
    type SettingsPersistenceView,
} from './settings-persistence-transaction';
import { settingsIntentKeys } from './intent-ledger';
import { changedSettingsKeys } from './store-reconciliation';
import { normalizeReaderSettings, type SaveSettingsOptions } from './index';
import type { ReaderSettings } from '../app/types';

export interface SettingsRestoreTransactionOptions {
    readonly storage: unknown;
    readonly allowInvalidSettingsAuthorityFallback?: boolean;
    readonly prepareSettings?: (importedView: SettingsPersistenceView | null) => void | Promise<void>;
    readonly stageBeforeSettings?: () => Promise<void>;
    readonly rollbackBeforeSettings?: () => Promise<void>;
    readonly publishSettings: (importedView: SettingsPersistenceView | null) => Promise<void>;
}

export interface SettingsRestoreTransactionResult {
    readonly restoredValues: number;
}

const READER_SETTINGS_BACKUP_FORMATS = new Set([
    'yomu-reader-settings',
    'jpdb-popup-reader-settings',
]);

export function readerStorageRestorePayload(value: unknown): unknown {
    if (!isStorageBackupRecord(value)) return null;
    const record = value as { formatName?: string; storage?: unknown };
    return READER_SETTINGS_BACKUP_FORMATS.has(record.formatName ?? '')
        ? record.storage
        : null;
}

function isStorageBackupRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function settingsRestoreSaveOptions(
    previous: ReaderSettings,
    next: ReaderSettings,
    importedView: SettingsPersistenceView | null,
): SaveSettingsOptions {
    const persistPreferredJapaneseSiteLanguage = importedView !== null
        || previous.preferJapaneseSiteLanguage !== next.preferJapaneseSiteLanguage;
    if (!importedView) {
        return {
            persistPreferredJapaneseSiteLanguage,
            explicitUserChoiceKeys: changedSettingsKeys(previous, next),
        };
    }
    const normalizedKeys = Object.keys(next) as Array<keyof ReaderSettings>;
    const knownKeys = new Set<string>(normalizedKeys);
    const explicitUserChoiceKeys = settingsIntentKeys(importedView.intentLedger)
        .filter((key): key is keyof ReaderSettings => knownKeys.has(key));
    return {
        persistPreferredJapaneseSiteLanguage,
        clearExplicitUserChoiceKeys: normalizedKeys,
        explicitUserChoiceKeys,
    };
}

export function witnessedSettingsRestoreCandidate(
    previous: ReaderSettings,
    fallback: ReaderSettings,
    importedView: SettingsPersistenceView | null,
): ReaderSettings {
    if (!importedView) return fallback;
    const witnessed = importedView.settings as Partial<ReaderSettings>;
    return normalizeReaderSettings({
        ...previous,
        ...witnessed,
        shortcuts: { ...previous.shortcuts, ...(witnessed.shortcuts ?? {}) },
    });
}

/**
 * Runs one in-process compensated restore. Generic managed values are
 * reversible staging, optional IndexedDB work is compensated next, and the
 * witnessed settings/intent pair is the final publication event. A process
 * termination cannot run the in-memory compensation journal.
 */
export async function runSettingsRestoreTransaction(
    options: SettingsRestoreTransactionOptions,
): Promise<SettingsRestoreTransactionResult> {
    // Reject a witnessed half-commit before any durable store is touched.
    const importedView = await restoreSettingsPersistenceView(options);
    await options.prepareSettings?.(importedView);
    const storedValues = await beginStoredValuesImport(options.storage);
    try {
        await options.stageBeforeSettings?.();
        await options.publishSettings(importedView);
        storedValues.commit();
        return { restoredValues: storedValues.count };
    } catch (error) {
        return rollbackSettingsRestore(error, storedValues, options.rollbackBeforeSettings);
    }
}

async function restoreSettingsPersistenceView(
    options: SettingsRestoreTransactionOptions,
): Promise<SettingsPersistenceView | null> {
    try {
        return await readBackupSettingsPersistenceView(options.storage);
    } catch (error) {
        if (options.allowInvalidSettingsAuthorityFallback
            && error instanceof InvalidSettingsBackupAuthorityError) return null;
        throw error;
    }
}

async function rollbackSettingsRestore(
    error: unknown,
    storedValues: StoredValuesImportTransaction,
    rollbackBeforeSettings: (() => Promise<void>) | undefined,
): Promise<never> {
    const rollbackErrors = await collectRollbackErrors([
        rollbackBeforeSettings ?? noRollback,
        () => storedValues.rollback(),
    ]);
    if (!rollbackErrors.length) throw error;
    throw new AggregateError(
        [error, ...rollbackErrors],
        `Settings restore failed and ${rollbackErrors.length} rollback operation(s) also failed.`,
    );
}

async function collectRollbackErrors(
    operations: ReadonlyArray<() => Promise<void>>,
): Promise<unknown[]> {
    const failures: unknown[] = [];
    for (const operation of operations) {
        try {
            await operation();
        } catch (error) {
            failures.push(error);
        }
    }
    return failures;
}

async function noRollback(): Promise<void> {}
