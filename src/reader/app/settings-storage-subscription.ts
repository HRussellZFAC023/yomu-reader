import { loadSettings, subscribeToSettingsStorageChanges } from '../settings/index';
import type { ReaderSettings } from './types';
import { USERSCRIPT_STORAGE_BRIDGE_READY_EVENT } from './constants';
import { addWindowEventListener, removeWindowEventListener } from '../platform/window-events';
import { isHostedYomuOrigin } from './storage';
import { createAsyncReconciliation } from './async-reconciliation';

/**
 * One settings subscription that also reconciles a userscript storage bridge
 * installed after the page runtime. Cleanup invalidates an in-flight bridge
 * read, so a replaced or destroyed Reader cannot receive a stale callback.
 */
export function subscribeToReaderSettingsChanges(
    onSettings: (settings: ReaderSettings) => void,
): () => void {
    let active = true;
    const receive = (settings: ReaderSettings): void => {
        if (active) onSettings(settings);
    };
    const unsubscribeStoredChanges = subscribeToSettingsStorageChanges(receive);
    const hostedBridge = isHostedYomuOrigin();
    const reconciliation = createAsyncReconciliation(async () => {
        if (!active) return;
        receive(await loadSettings());
    }, () => undefined);
    const onStorageBridgeReady = (): void => reconciliation.request();
    if (hostedBridge) addWindowEventListener(USERSCRIPT_STORAGE_BRIDGE_READY_EVENT, onStorageBridgeReady);
    // Subscribe first, then sample. A bridge can become ready between the
    // caller's initial load and listener installation; without this pass the
    // ready event is lost and a hosted Study tab can remain on provisional
    // defaults until another settings write happens.
    if (hostedBridge) reconciliation.request();
    return () => {
        active = false;
        reconciliation.stop();
        unsubscribeStoredChanges();
        if (hostedBridge) removeWindowEventListener(USERSCRIPT_STORAGE_BRIDGE_READY_EVENT, onStorageBridgeReady);
    };
}
