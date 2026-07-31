import { APP_NAME } from './constants';
import { uiText } from '../app/i18n';
import { userFacingErrorText } from './user-facing-errors';
import { Logger } from './logger';
import { delay } from '../core/async-utils';
import {
    beginSettingsResetGuard,
    deleteSettingsStorage,
    endSettingsResetGuard,
} from '../settings/index';
import {
    clearManagedStoredValues,
    clearFactoryResetSignal,
    commitManagedStateResetEpoch,
    createFactoryResetSignal,
    ManagedStateResetError,
    managedStateResetEpochMayHaveCommitted,
    managedStoredKeysStillPresent,
    publishFactoryResetSignal,
    subscribeToFactoryResetSignals,
    type FactoryResetSignal,
} from './storage';
import type { InterfaceLanguage } from './types';

const log = Logger.scope('FactoryReset');
const FACTORY_RESET_PREPARE_DELAY_MS = 80;
const FACTORY_RESET_REMOTE_GUARD_TIMEOUT_MS = 30000;
const FACTORY_RESET_DICTIONARY_DELETE_TIMEOUT_MS = 750;

export interface FactoryResetCoordinatorDependencies {
    isDestroyed: () => boolean;
    getLanguage: () => InterfaceLanguage;
    invalidateRuntimeStores: () => Promise<void>;
    resetDictionaryDatabase: () => Promise<unknown>;
    toast: (message: string) => void;
    reload: () => void;
}

export interface FactoryResetDictionaryStore {
    deleteDatabase(options: { timeoutMs: number }): Promise<unknown>;
}

export interface FactoryResetRuntimeOptions {
    dictionaries: FactoryResetDictionaryStore;
    getLanguage: () => InterfaceLanguage;
    invalidateRuntimeStores: () => Promise<void>;
    isDestroyed: () => boolean;
    reload: () => void;
    toast: (message: string) => void;
}

function resetFactoryResetDictionaryDatabase(dictionaries: FactoryResetDictionaryStore): Promise<{ deleted: true }> {
    return dictionaries.deleteDatabase({ timeoutMs: FACTORY_RESET_DICTIONARY_DELETE_TIMEOUT_MS })
        .then(() => ({ deleted: true }));
}

export function createFactoryResetCoordinator(options: FactoryResetRuntimeOptions): FactoryResetCoordinator {
    return new FactoryResetCoordinator({
        isDestroyed: options.isDestroyed,
        getLanguage: options.getLanguage,
        invalidateRuntimeStores: options.invalidateRuntimeStores,
        resetDictionaryDatabase: () => resetFactoryResetDictionaryDatabase(options.dictionaries),
        toast: options.toast,
        reload: options.reload,
    });
}

export class FactoryResetCoordinator {
    private unsubscribe?: () => void;
    private activeResetId = '';
    private handledSignals = new Set<string>();
    private remoteGuardReleaseTimer?: number;

    constructor(private readonly dependencies: FactoryResetCoordinatorDependencies) {}

    bind(): void {
        if (this.unsubscribe) return;
        this.unsubscribe = subscribeToFactoryResetSignals(signal => {
            void this.handleSignal(signal);
        });
    }

    destroy(): void {
        this.unsubscribe?.();
        this.unsubscribe = undefined;
        this.clearRemoteGuardReleaseTimer();
    }

    async resetAllData(): Promise<void> {
        const confirmed = window.confirm(this.text('factoryResetConfirm', { appName: APP_NAME }));
        if (!confirmed) return;

        const resetSignal = createFactoryResetSignal('prepare');
        this.activeResetId = resetSignal.id;
        beginSettingsResetGuard();
        let epochCommitted = false;
        try {
            await publishFactoryResetSignal(resetSignal);
            await this.dependencies.invalidateRuntimeStores();
            await delay(FACTORY_RESET_PREPARE_DELAY_MS);
            await clearManagedStoredValues();
            await deleteSettingsStorage();
            await this.assertManagedStateDeleted();
            await this.dependencies.resetDictionaryDatabase();
            await commitManagedStateResetEpoch(resetSignal.id);
            epochCommitted = true;
            // Close the narrow delete/commit race: a stale importer can reopen
            // IndexedDB after the first delete but before the epoch advances.
            // A second delete after commit removes that recreation; failure is
            // best-effort because the DB's own epoch marker clears it on reboot.
            await this.dependencies.resetDictionaryDatabase()
                .catch(error => log.warn('Final dictionary reset failed after epoch commit', error));
            await publishFactoryResetSignal(createFactoryResetSignal('complete', resetSignal.id))
                .catch(error => log.warn('Factory reset completion signal failed after epoch commit', error));
            await clearFactoryResetSignal()
                .catch(error => log.warn('Factory reset signal cleanup failed after epoch commit', error));
            this.dependencies.reload();
        } catch (error) {
            if (epochCommitted || managedStateResetEpochMayHaveCommitted(error)) {
                log.warn('Factory reset finalization failed after epoch commit; reloading stale realm', error);
                await clearFactoryResetSignal().catch(signalError => log.warn('Factory reset signal cleanup failed', signalError));
                this.dependencies.reload();
                return;
            }
            this.activeResetId = '';
            await clearFactoryResetSignal().catch(signalError => log.warn('Factory reset signal cleanup failed', signalError));
            endSettingsResetGuard();
            log.warn('All-data reset failed', error);
            this.dependencies.toast(userFacingErrorText(this.dependencies.getLanguage(), 'factoryResetFailed', error));
        }
    }

    private async handleSignal(signal: FactoryResetSignal): Promise<void> {
        if (this.dependencies.isDestroyed() || signal.id === this.activeResetId) return;
        const handledKey = `${signal.id}:${signal.phase}`;
        if (this.handledSignals.has(handledKey)) return;
        this.handledSignals.add(handledKey);
        beginSettingsResetGuard();

        await this.dependencies.invalidateRuntimeStores();
        if (signal.phase === 'complete') {
            this.clearRemoteGuardReleaseTimer();
            this.dependencies.toast(this.text('factoryResetOtherTabReloading'));
            window.setTimeout(() => this.dependencies.reload(), 50);
        } else {
            this.scheduleRemoteGuardRelease();
        }
    }

    private async assertManagedStateDeleted(): Promise<void> {
        const managedKeysStillPresent = await managedStoredKeysStillPresent();
        if (!managedKeysStillPresent.length) return;
        log.warn('Managed keys remained after reset', { managedKeysStillPresent });
        throw new ManagedStateResetError(`Managed keys remained after reset: ${managedKeysStillPresent.join(', ')}`);
    }

    private text(key: Parameters<typeof uiText>[1], values: Record<string, string> = {}): string {
        return uiText(this.dependencies.getLanguage(), key).replace(/\{(\w+)\}/g, (_match: string, name: string) => values[name] ?? '');
    }

    private scheduleRemoteGuardRelease(): void {
        this.clearRemoteGuardReleaseTimer();
        this.remoteGuardReleaseTimer = window.setTimeout(() => {
            this.remoteGuardReleaseTimer = undefined;
            endSettingsResetGuard();
        }, FACTORY_RESET_REMOTE_GUARD_TIMEOUT_MS);
    }

    private clearRemoteGuardReleaseTimer(): void {
        if (this.remoteGuardReleaseTimer === undefined) return;
        window.clearTimeout(this.remoteGuardReleaseTimer);
        this.remoteGuardReleaseTimer = undefined;
    }
}
