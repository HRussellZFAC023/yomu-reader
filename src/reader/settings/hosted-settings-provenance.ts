import type { ReaderSettings } from '../app/types';
import { gmStorageGetSharedStrict, gmStorageGetStrict, hasAsyncGmStorageBackend, withGmStorageLease } from '../app/storage';
import { applySettingsIntent, recordSettingsIntent } from './intent-ledger';
import { persistSettingsStorageTransaction, readSettingsPersistenceViewStrictFrom, SETTINGS_PERSISTENCE_LEASE_OPTIONS, SETTINGS_PERSISTENCE_STORAGE_LEASE } from './settings-persistence-transaction';

export async function persistHostedSharedSettingsPatch(patch: Record<string, unknown>, userChoice: boolean): Promise<void> {
    await withGmStorageLease(SETTINGS_PERSISTENCE_STORAGE_LEASE, async () => {
        const read = hasAsyncGmStorageBackend() ? gmStorageGetSharedStrict : gmStorageGetStrict;
        const view = await readSettingsPersistenceViewStrictFrom(read);
        if (view.settings == null && !userChoice) return;
        const shared = view.settings ?? { learningTargetChosen: false, onboardingSeen: false };
        if (typeof shared !== 'object' || Array.isArray(shared)) throw new Error('Invalid hosted settings authority.');
        const merged = { ...shared, ...patch };
        const ledger = recordSettingsIntent(view.intentLedger, userChoice ? Object.keys(patch) as (keyof ReaderSettings)[] : [], merged);
        const settings = applySettingsIntent(merged, ledger);
        // Storage notifications echo through the hosted appearance listeners.
        if (ledger === view.intentLedger && JSON.stringify(settings) === JSON.stringify(shared)) return;
        await persistSettingsStorageTransaction(ledger, settings);
    }, SETTINGS_PERSISTENCE_LEASE_OPTIONS);
}
