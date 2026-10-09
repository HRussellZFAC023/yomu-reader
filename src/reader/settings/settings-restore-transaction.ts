import {
    beginStoredValuesImport,
    type StoredValuesImportTransaction,
} from '../app/storage';
import {
    readBackupSettingsPersistenceView,
    type SettingsPersistenceView,
} from './settings-persistence-transaction';
import { settingsIntentKeys } from './intent-ledger';
import { changedSettingsKeys } from './store-reconciliation';
import { adoptCurrentDefaults } from './retired-defaults';
import { DEFAULT_SETTINGS, normalizeReaderSettings, type SaveSettingsOptions } from './index';
import type { ReaderSettings } from '../app/types';

export interface SettingsRestoreTransactionOptions {
    readonly storage: unknown;
    readonly prepareSettings?: (importedView: SettingsPersistenceView | null) => void | Promise<void>;
    readonly stageBeforeSettings?: () => Promise<void>;
    readonly rollbackBeforeSettings?: () => Promise<void>;
    readonly publishSettings: (importedView: SettingsPersistenceView | null) => Promise<void>;
}

export interface SettingsRestoreTransactionResult {
    readonly restoredValues: number;
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

/**
 * The settings a restore adopts, for every restore path (settings file, Google
 * Drive). A default a release retired (ADR-0026) that the backup merely carried
 * is no choice: with the backup's ledger it reads as today's default, as the
 * next load would read it; a settings-only backup has no ledger, so that
 * setting stays as it is now rather than being declared the learner's.
 */
export function witnessedSettingsRestoreCandidate(
    previous: ReaderSettings,
    fallback: ReaderSettings,
    importedView: SettingsPersistenceView | null,
): ReaderSettings {
    if (!importedView) return adoptCurrentDefaults(fallback, { revision: 0, records: {} }, previous);
    const witnessed = importedView.settings as Partial<ReaderSettings>;
    const candidate = normalizeReaderSettings({
        ...previous,
        ...witnessed,
        shortcuts: { ...previous.shortcuts, ...(witnessed.shortcuts ?? {}) },
    });
    return adoptCurrentDefaults(candidate, importedView.intentLedger, DEFAULT_SETTINGS);
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
    const importedView = await readBackupSettingsPersistenceView(options.storage);
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
