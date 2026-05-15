import { APP_NAME } from './constants';
import { Logger } from './logger';
import {
    clearManagedStoredValues,
    createFactoryResetSignal,
    publishFactoryResetSignal,
    subscribeToFactoryResetSignals,
    type FactoryResetSignal,
    type FactoryResetSignalSource,
} from './storage';

const log = Logger.scope('FactoryReset');
const FACTORY_RESET_PREPARE_DELAY_MS = 80;

export interface FactoryResetCoordinatorDependencies {
    isDestroyed: () => boolean;
    invalidateRuntimeStores: () => Promise<void>;
    resetDictionaryDatabase: () => Promise<unknown>;
    toast: (message: string) => void;
    reload: () => void;
}

export class FactoryResetCoordinator {
    private unsubscribe?: () => void;
    private activeResetId = '';
    private handledSignals = new Set<string>();

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
    }

    async resetAllData(): Promise<void> {
        const confirmed = window.confirm([
            `Reset all ${APP_NAME} data?`,
            '',
            'This deletes settings, cached cards, local dictionaries, and other local/GM storage for the userscript.',
        ].join('\n'));
        if (!confirmed) return;

        const resetSignal = createFactoryResetSignal('prepare');
        this.activeResetId = resetSignal.id;
        try {
            await publishFactoryResetSignal(resetSignal);
            await this.dependencies.invalidateRuntimeStores();
            await delay(FACTORY_RESET_PREPARE_DELAY_MS);
            const dictionaryReset = await this.dependencies.resetDictionaryDatabase();
            const deletedStorageValues = await clearManagedStoredValues();
            await publishFactoryResetSignal(createFactoryResetSignal('complete', resetSignal.id));
            log.info('All local data reset', { deletedStorageValues, dictionaryReset });
            this.dependencies.reload();
        } catch (error) {
            this.activeResetId = '';
            log.warn('All-data reset failed', error);
            this.dependencies.toast(error instanceof Error ? error.message : 'Reset failed.');
        }
    }

    private async handleSignal(signal: FactoryResetSignal, source: FactoryResetSignalSource): Promise<void> {
        if (this.dependencies.isDestroyed() || signal.id === this.activeResetId) return;
        const handledKey = `${signal.id}:${signal.phase}`;
        if (this.handledSignals.has(handledKey)) return;
        this.handledSignals.add(handledKey);

        log.info('Factory reset signal received', {
            phase: signal.phase,
            href: signal.href,
            remote: source.remote,
            transport: source.transport,
        });
        await this.dependencies.invalidateRuntimeStores();
        if (signal.phase === 'complete') {
            this.dependencies.toast('よむ was reset in another tab. Reloading...');
            window.setTimeout(() => this.dependencies.reload(), 50);
        }
    }
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, ms));
}
