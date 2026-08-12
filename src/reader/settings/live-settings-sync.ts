import type { ReaderSettings } from '../app/types';
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
    let adoptedSettings = snapshotLiveSettings(dependencies.getSettings());
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
            adoptedSettings = snapshotLiveSettings(settings);
        }
        const theme = themeFromSettingsChange(detail);
        if (theme) dependencies.applyTheme(theme);
    });
}

/**
 * The dialog baseline must not share the nested language records that a host
 * may replace or mutate before publishing its durable event. Other live-form
 * facets are scalar, so the top-level copy is their complete snapshot.
 */
function snapshotLiveSettings(settings: ReaderSettings): ReaderSettings {
    return {
        ...settings,
        languageProfiles: settings.languageProfiles.map(profile => ({
            ...profile,
            dictionaries: {
                installed: [...profile.dictionaries.installed],
                enabled: [...profile.dictionaries.enabled],
                order: [...profile.dictionaries.order],
            },
            definitionTranslationProviderIds: [...profile.definitionTranslationProviderIds],
        })),
        dictionaryLookupLinks: settings.dictionaryLookupLinks.map(link => ({ ...link })),
    };
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
