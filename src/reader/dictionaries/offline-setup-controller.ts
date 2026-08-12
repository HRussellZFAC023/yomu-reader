import { uiText, type UiCopyKey } from '../app/i18n';
import type { ReaderSettings } from '../app/types';
import { yomuSettingsSurfaceCompanion } from '../companions/registry';
import type {
    OfflineDictionarySetupResult,
    OfflineDictionarySetupStore,
} from './offline-setup';

interface OfflineDictionarySetupControllerOptions {
    dictionaries: OfflineDictionarySetupStore;
    getSettings: () => ReaderSettings;
    applySettings: (settings: ReaderSettings) => Promise<void> | void;
    notify: (message: string) => void;
    afterInstalled: () => Promise<void> | void;
}

/** Owns the one-at-a-time offline starter-dictionary installation lifecycle. */
export class OfflineDictionarySetupController {
    private running = false;

    constructor(private readonly options: OfflineDictionarySetupControllerOptions) {}

    async run(): Promise<void> {
        if (this.running) return;
        const install = yomuSettingsSurfaceCompanion()?.installOfflineParsingDictionaries;
        if (!install) return;
        this.running = true;
        try {
            const result = await install({
                dictionaries: this.options.dictionaries,
                getSettings: this.options.getSettings,
                applySettings: this.options.applySettings,
                onProgress: this.options.notify,
            });
            await this.finish(result);
        } finally {
            this.running = false;
        }
    }

    private async finish(result: OfflineDictionarySetupResult): Promise<void> {
        if (result.installed.length) await this.options.afterInstalled();
        const copyKey = offlineDictionarySetupCopyKey(result);
        if (copyKey) this.options.notify(uiText(this.options.getSettings().interfaceLanguage, copyKey));
    }
}

function offlineDictionarySetupCopyKey(result: OfflineDictionarySetupResult): UiCopyKey | undefined {
    if (result.failed.length) return 'offlineDictionarySetupFailed';
    if (result.installed.length) return 'offlineDictionarySetupComplete';
    return undefined;
}
