import type { ReaderSettings } from '../app/types';
import { normalizeReaderSettings } from './index';
import { subscribeToSettingsChanges, type SettingsChangeDetail } from './settings-change-bus';
import {
    syncFontFamilyControls,
    syncSubtitlePreview,
} from './form';

interface LiveSettingsSyncDependencies {
    isActive: () => boolean;
    getSettings: () => ReaderSettings;
    adoptSettings: (settings: ReaderSettings) => void;
    syncAdoptedLanguageProfile: (previousSettings: ReaderSettings, settings: ReaderSettings) => void;
    applyTheme: (theme: ReaderSettings['theme']) => void;
}

interface SettingsPreviewBaselineDependencies {
    getSettings: () => ReaderSettings;
    setSettings: (settings: ReaderSettings, options?: { transient?: boolean }) => void;
    installFab: () => void;
    beginSettingsPreview: (
        accent: string,
        language: ReaderSettings['interfaceLanguage'],
        theme: ReaderSettings['theme'],
    ) => void;
}

/**
 * Owns the detached durable snapshot behind an open Settings form. Preview
 * consumers may mutate host settings, but never this baseline.
 */
export class SettingsPreviewBaseline {
    private stableSettings: ReaderSettings;
    private interfaceLanguagePreviewed = false;

    constructor(
        private readonly dependencies: SettingsPreviewBaselineDependencies,
        private readonly currentForm: () => HTMLFormElement | undefined,
    ) {
        this.stableSettings = snapshotDurableSettings(dependencies.getSettings());
    }

    get settings(): ReaderSettings {
        return this.stableSettings;
    }

    start(settings: ReaderSettings): void {
        const replacingActivePreview = this.currentForm()?.isConnected === true;
        this.restoreInterfaceLanguagePreview();
        if (replacingActivePreview) {
            this.restoreTransient();
            return;
        }
        this.capture(settings);
    }

    capture(settings: ReaderSettings): void {
        this.stableSettings = snapshotDurableSettings(settings);
    }

    publish(): void {
        this.dependencies.setSettings(snapshotDurableSettings(this.stableSettings));
    }

    stage(settings: ReaderSettings): void {
        this.capture(settings);
        this.publish();
    }

    restoreTransient(): void {
        this.dependencies.setSettings(snapshotDurableSettings(this.stableSettings), { transient: true });
    }

    refreshHost(): void {
        if (this.currentForm()?.isConnected !== true) return;
        const settings = this.stableSettings;
        this.dependencies.beginSettingsPreview(settings.accentColor, settings.interfaceLanguage, settings.theme);
    }

    adoptLive(settings: ReaderSettings): void {
        this.stage(settings);
        this.refreshHost();
    }

    markInterfaceLanguagePreviewed(): void {
        this.interfaceLanguagePreviewed = true;
    }

    restoreInterfaceLanguagePreview(): void {
        if (!this.interfaceLanguagePreviewed) return;
        this.interfaceLanguagePreviewed = false;
        this.dependencies.installFab();
    }
}

/**
 * Keeps an open Settings form aligned with durable changes published by another
 * page or companion module. Target-dependent controls are re-evaluated only
 * after the incoming settings have been adopted, so their implicit defaults
 * cannot lag behind a cross-site target change.
 */
export function bindLiveSettingsSync(
    form: HTMLFormElement,
    dependencies: LiveSettingsSyncDependencies,
): void {
    let adoptedSettings = snapshotDurableSettings(dependencies.getSettings());
    subscribeToSettingsChanges(detail => {
        if (!dependencies.isActive()) return;
        if (detail.preview !== true) {
            const previousSettings = adoptedSettings;
            const settings = { ...previousSettings, ...detail.settings };
            dependencies.adoptSettings(settings);
            syncFormFromSettings(form, previousSettings, settings);
            dependencies.syncAdoptedLanguageProfile(previousSettings, settings);
            syncSubtitlePreview(form);
            syncFontFamilyControls(form);
            adoptedSettings = snapshotDurableSettings(settings);
        }
        const theme = themeFromSettingsChange(detail);
        if (theme) dependencies.applyTheme(theme);
    });
}

function snapshotDurableSettings(settings: ReaderSettings): ReaderSettings {
    return normalizeReaderSettings(settings);
}

function syncFormFromSettings(
    form: HTMLFormElement,
    previousSettings: ReaderSettings,
    settings: ReaderSettings,
): void {
    for (const key of changedSettingKeys(previousSettings, settings)) {
        if (key === 'theme') continue;
        const val = settings[key];
        if (typeof val !== 'string' && typeof val !== 'number' && typeof val !== 'boolean') continue;
        const elements = form.elements.namedItem(key);
        if (elements instanceof HTMLInputElement) {
            if (elements.type === 'checkbox') elements.checked = Boolean(val);
            else if (elements.type === 'radio') elements.checked = elements.value === String(val);
            else elements.value = String(val);
        } else if (elements instanceof RadioNodeList || (elements instanceof NodeList && elements.length > 0)) {
            const list = elements instanceof RadioNodeList ? Array.from(elements) : Array.from(elements as NodeListOf<Node>);
            for (const node of list) {
                if (node instanceof HTMLInputElement && node.type === 'radio') {
                    node.checked = node.value === String(val);
                }
            }
        } else if (elements instanceof HTMLSelectElement) {
            elements.value = String(val);
        }
    }
}

function changedSettingKeys(
    previousSettings: ReaderSettings,
    settings: ReaderSettings,
): Array<keyof ReaderSettings> {
    return (Object.keys(settings) as Array<keyof ReaderSettings>)
        .filter(key => !Object.is(previousSettings[key], settings[key]));
}

function themeFromSettingsChange(detail: SettingsChangeDetail): ReaderSettings['theme'] | undefined {
    const theme = detail.settings.theme;
    return theme === 'auto' || theme === 'dark' || theme === 'light' ? theme : undefined;
}
