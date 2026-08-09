import { SETTINGS_CHANGE_EVENT } from '../app/constants';
import type { ReaderSettings } from '../app/types';
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
    window.addEventListener(SETTINGS_CHANGE_EVENT, event => {
        if (!dependencies.isActive()) return;
        const detail = (event as CustomEvent<{ settings?: Partial<ReaderSettings>; preview?: boolean }>).detail;
        if (detail?.settings && detail.preview !== true) {
            const previousSettings = dependencies.getSettings();
            const settings = { ...previousSettings, ...detail.settings };
            dependencies.adoptSettings(settings);
            syncFormFromSettings(form, previousSettings, settings);
            dependencies.syncAdoptedLanguageProfile(previousSettings, settings);
            syncSubtitlePreview(form);
            syncFontFamilyControls(form);
        }
        const theme = themeFromSettingsChangeEvent(event);
        if (theme) dependencies.applyTheme(theme);
    });
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

function themeFromSettingsChangeEvent(event: Event): ReaderSettings['theme'] | undefined {
    const theme = (event as CustomEvent<{ settings?: { theme?: unknown } }>).detail?.settings?.theme;
    return theme === 'auto' || theme === 'dark' || theme === 'light' ? theme : undefined;
}
