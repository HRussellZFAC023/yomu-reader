import type { ReaderSettings } from '../app/types';
import { activeLanguageProfile } from '../languages/profiles';

/** Keeps a hosted page's explicit interface locale page-owned. */
export function newTabSettingsWithPageInterfaceLanguage(
    settings: ReaderSettings,
    interfaceLanguage: ReaderSettings['interfaceLanguage'] | undefined,
): ReaderSettings {
    if (!interfaceLanguage || settings.interfaceLanguage === interfaceLanguage) return settings;
    return { ...settings, interfaceLanguage };
}

/** Applies a hosted lesson's target without turning it into learner-owned state. */
export function newTabSettingsWithPageTarget(
    settings: ReaderSettings,
    targetLanguage: 'ja',
): ReaderSettings {
    const active = activeLanguageProfile(settings.languageProfiles, settings.activeLanguageProfileId);
    if (!active) return settings;
    return {
        ...settings,
        languageProfiles: settings.languageProfiles.map(profile => profile === active
            ? { ...profile, targetLanguage }
            : profile),
    };
}
