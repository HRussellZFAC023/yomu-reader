import type { ReaderSettings } from '../app/types';
import { activeLanguageProfile } from '../languages/profiles';

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
