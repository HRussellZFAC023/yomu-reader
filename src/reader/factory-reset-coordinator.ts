import { APP_NAME } from './constants';
import { uiText } from './i18n';
import { Logger } from './logger';
import {
    beginSettingsResetGuard,
    deleteSettingsStorage,
    endSettingsResetGuard,
    settingsStorageKeysStillPresent,
} from './settings';
import {
    clearManagedStoredValues,
    clearFactoryResetSignal,
    createFactoryResetSignal,
    publishFactoryResetSignal,
    subscribeToFactoryResetSignals,
    type FactoryResetSignal,
    type FactoryResetSignalSource,
} from './storage';
import type { InterfaceLanguage } from './types';

const log = Logger.scope('FactoryReset');
const FACTORY_RESET_PREPARE_DELAY_MS = 80;
const FACTORY_RESET_REMOTE_GUARD_TIMEOUT_MS = 30000;
export const FACTORY_RESET_DICTIONARY_DELETE_TIMEOUT_MS = 750;

export interface FactoryResetCoordinatorDependencies {
    isDestroyed: () => boolean;
    getLanguage: () => InterfaceLanguage;
    invalidateRuntimeStores: () => Promise<void>;
    resetDictionaryDatabase: () => Promise<unknown>;
    toast: (message: string) => void;
    reload: () => void;
}

export class FactoryResetCoordinator {
    private unsubscribe?: () => void;
    private activeResetId = '';
    private handledSignals = new Set<string>();
    private remoteGuardReleaseTimer?: number;

    constructor(private readonly dependencies: FactoryResetCoordinatorDependencies) {}

    bind(): void {
        if (this.unsubscribe) return;
        this.unsubscribe = subscribeToFactoryResetSignals((signal, source) => {
            void this.handleSignal(signal, source);
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
        try {
            await publishFactoryResetSignal(resetSignal);
            await this.dependencies.invalidateRuntimeStores();
            await delay(FACTORY_RESET_PREPARE_DELAY_MS);
            const deletedStorageValues = await clearManagedStoredValues();
            await deleteSettingsStorage();
            await this.assertSettingsStorageDeleted();
            const dictionaryReset = await this.resetDictionaryDatabaseBestEffort();
            await publishFactoryResetSignal(createFactoryResetSignal('complete', resetSignal.id));
            await clearFactoryResetSignal();
            log.info('Local data reset; reloading', { deletedStorageValues, dictionaryReset });
            this.dependencies.reload();
        } catch (error) {
            this.activeResetId = '';
            endSettingsResetGuard();
            log.warn('All-data reset failed', error);
            this.dependencies.toast(error instanceof Error ? error.message : this.text('factoryResetFailed'));
        }
    }

    private async resetDictionaryDatabaseBestEffort(): Promise<unknown> {
        try {
            return await this.dependencies.resetDictionaryDatabase();
        } catch (error) {
            log.warn('Dictionary reset failed post-settings', error);
            this.dependencies.toast(this.text('factoryResetDictionaryWarning'));
            return { cleared: false, deleted: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    private async handleSignal(signal: FactoryResetSignal, source: FactoryResetSignalSource): Promise<void> {
        if (this.dependencies.isDestroyed() || signal.id === this.activeResetId) return;
        const handledKey = `${signal.id}:${signal.phase}`;
        if (this.handledSignals.has(handledKey)) return;
        this.handledSignals.add(handledKey);
        beginSettingsResetGuard();

        log.info('Factory reset signal received', {
            phase: signal.phase,
            href: signal.href,
            remote: source.remote,
            transport: source.transport,
        });
        await this.dependencies.invalidateRuntimeStores();
        if (signal.phase === 'complete') {
            this.clearRemoteGuardReleaseTimer();
            this.dependencies.toast(this.text('factoryResetOtherTabReloading'));
            window.setTimeout(() => this.dependencies.reload(), 50);
        } else {
            this.scheduleRemoteGuardRelease();
        }
    }

    private async assertSettingsStorageDeleted(): Promise<void> {
        const settingsKeysStillPresent = await settingsStorageKeysStillPresent();
        if (!settingsKeysStillPresent.length) return;
        log.warn('Settings keys remained after reset', { settingsKeysStillPresent });
        throw new Error(this.text('factoryResetDeleteSettingsFailed'));
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

function delay(ms: number): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, ms));
}
