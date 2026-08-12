import { SETTINGS_CHANGE_EVENT, USERSCRIPT_STORAGE_BRIDGE_READY_EVENT } from '../app/constants';
import { createAsyncReconciliation } from '../app/async-reconciliation';
import { gmStorageGetShared, gmStorageGetSharedSync, isHostedYomuOrigin } from '../app/storage';
import type { ReaderSettings } from '../app/types';
import { isRecord } from '../core/object-utils';
import { addWindowEventListener, removeWindowEventListener } from '../platform/window-events';
import { SETTINGS_INTENT_LEDGER_STORAGE_KEY } from '../settings/intent-ledger';
import { normalizeReaderSettings, SETTINGS_STORAGE_KEY } from '../settings/index';
import { committedSettingsStoragePair } from '../settings/settings-persistence-transaction';

/** Owns the page-owned/stored-choice boundary for document-start companions. */
export function installDocumentStartTargetPolicy(
    pageOwnsTarget: boolean,
    activate: () => void,
): void {
    if (pageOwnsTarget) {
        activate();
        return;
    }
    if (activateFromStoredSettings(readCommittedSettingsSync(), activate)) return;
    installTargetChoiceHints(activate);
}

function readCommittedSettingsSync(): unknown {
    return committedSettingsStoragePair(
        gmStorageGetSharedSync<unknown>(SETTINGS_STORAGE_KEY, null),
        gmStorageGetSharedSync<unknown>(SETTINGS_INTENT_LEDGER_STORAGE_KEY, null),
    )?.settings;
}

async function readCommittedSettings(): Promise<unknown> {
    const [settings, intentLedger] = await Promise.all([
        gmStorageGetShared<unknown>(SETTINGS_STORAGE_KEY, null),
        gmStorageGetShared<unknown>(SETTINGS_INTENT_LEDGER_STORAGE_KEY, null),
    ]);
    return committedSettingsStoragePair(settings, intentLedger)?.settings;
}

function installTargetChoiceHints(activate: () => void): void {
    const hostedBridge = isHostedYomuOrigin();
    const reconciliation = createAsyncReconciliation(async () => {
        if (!activateFromStoredSettings(await readCommittedSettings(), activate)) return;
        removeListeners();
    });
    const onHint = (): void => reconciliation.request();
    const removeListeners = (): void => {
        removeWindowEventListener(SETTINGS_CHANGE_EVENT, onHint);
        if (hostedBridge) removeWindowEventListener(USERSCRIPT_STORAGE_BRIDGE_READY_EVENT, onHint);
        reconciliation.stop();
    };
    addWindowEventListener(SETTINGS_CHANGE_EVENT, onHint);
    if (hostedBridge) addWindowEventListener(USERSCRIPT_STORAGE_BRIDGE_READY_EVENT, onHint);
    reconciliation.request();
}

function activateFromStoredSettings(value: unknown, activate: () => void): boolean {
    if (!storedSettingsChooseLearningTarget(value)) return false;
    activate();
    return true;
}

function storedSettingsChooseLearningTarget(value: unknown): boolean {
    if (!isRecord(value)) return false;
    try {
        return normalizeReaderSettings(value as Partial<ReaderSettings>).learningTargetChosen;
    } catch {
        return false;
    }
}
