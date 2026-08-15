import { loadSettingsWithWitnessedAuthority, subscribeToSettingsStorageChanges } from '../settings/index';
import type { ReaderSettings } from './types';
import { USERSCRIPT_STORAGE_BRIDGE_READY_EVENT } from './constants';
import { addWindowEventListener, removeWindowEventListener } from '../platform/window-events';
import { isHostedYomuOrigin } from './storage';
import { createAsyncReconciliation } from './async-reconciliation';

const DORMANT_TARGET_POLL_MS = 5_000;

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
        receive(await loadSettingsWithWitnessedAuthority());
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

/**
 * Fresh top-level pages listen only for the first persisted target choice.
 * Other settings remain deliberately invisible until that policy boundary is
 * crossed, preserving a neutral and surface-free dismissed setup state.
 */
export function subscribeToFirstPersistedLearningTarget(
    currentSettings: () => ReaderSettings,
    onTarget: (settings: ReaderSettings) => void,
): () => void {
    let active = true;
    const receive = (settings: ReaderSettings): void => {
        if (active && !currentSettings().learningTargetChosen && settings.learningTargetChosen) onTarget(settings);
    };
    const unsubscribe = subscribeToReaderSettingsChanges(receive);
    const stopPolling = pollForFirstPersistedTarget(receive);
    // The target may have been persisted while the chooser was still open,
    // before this dormant subscription existed. Subscribe first, then reconcile
    // a snapshot so a write on either side of this boundary cannot be missed.
    void loadSettingsWithWitnessedAuthority().then(receive).catch(() => undefined);
    return () => {
        active = false;
        stopPolling();
        unsubscribe();
    };
}

// Greasemonkey 4 has shared GM storage but no value-change listener. Poll only
// while this page is dormant, and reconcile immediately when it becomes
// visible, so choosing a target elsewhere can still wake the open page.
function pollForFirstPersistedTarget(receive: (settings: ReaderSettings) => void): () => void {
    let inFlight = false;
    const reconcile = (): void => {
        if (inFlight) return;
        inFlight = true;
        void loadSettingsWithWitnessedAuthority()
            .then(receive)
            .catch(() => undefined)
            .finally(() => { inFlight = false; });
    };
    const timer = window.setInterval(reconcile, DORMANT_TARGET_POLL_MS);
    const onVisibilityChange = (): void => {
        if (document.visibilityState === 'visible') reconcile();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
        window.clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisibilityChange);
    };
}

/** Owns the one-way dormant -> initialized transition for a top-level Reader. */
export class TopLevelTargetLifecycle {
    private initialized = false;

    canWaitForTarget(destroyed: boolean, embedded: boolean, targetPolicyActive: boolean): boolean {
        return !destroyed && !embedded && !this.initialized && !targetPolicyActive;
    }

    beginTargetOwnedSurfaces(destroyed: boolean, embedded: boolean, targetPolicyActive: boolean): boolean {
        if (!targetPolicyActive || !this.canWaitForTarget(destroyed, embedded, false)) return false;
        this.initialized = true;
        return true;
    }
}

export function shouldWakeTopLevelTarget(
    embedded: boolean,
    targetPolicyActive: boolean,
    settings: ReaderSettings,
): boolean {
    return !embedded && !targetPolicyActive && settings.learningTargetChosen;
}

export async function applyTargetSurfaceSettingsChange(
    wakesTarget: boolean,
    embedded: boolean,
    initialize: () => Promise<void>,
    installFab: () => void,
    refresh: () => void,
): Promise<boolean> {
    if (wakesTarget) {
        await initialize();
        return true;
    }
    if (!embedded) installFab();
    refresh();
    return false;
}
