import type { ReaderSettings } from '../app/types';
import {
    DEFAULT_LANGUAGE_PROFILE_ID,
    normalizeLanguageProfiles,
} from '../languages/profiles';
import { SLICE1_TARGET_LANGUAGE } from '../languages/roster';
import { isSupportedLanguageProfileSchemaVersion } from '../languages/types';
import { hasOwn } from './values';

interface LearningTargetChoiceDefaults {
    interfaceLanguage: ReaderSettings['interfaceLanguage'];
    parserProvider: ReaderSettings['parserProvider'];
}

export function normalizeLearningTargetChosen(
    value: Partial<ReaderSettings> | null,
    defaults: LearningTargetChoiceDefaults,
): boolean {
    if (!value) return false;
    if (hasOwn(value, 'learningTargetChosen')) return value.learningTargetChosen === true;
    if (value.onboardingSeen === true) return true;
    return persistedProfilesChooseLearningTarget(value, defaults);
}

function persistedProfilesChooseLearningTarget(
    value: Partial<ReaderSettings>,
    defaults: LearningTargetChoiceDefaults,
): boolean {
    const profiles = value.languageProfiles;
    if (!Array.isArray(profiles)) return false;
    if (!profiles.some(isPersistedLanguageProfile)) return false;
    const normalized = normalizeLanguageProfiles(
        profiles,
        value.activeLanguageProfileId,
        {
            outputLanguage: 'en',
            uiLocale: defaults.interfaceLanguage,
            parserProvider: defaults.parserProvider,
        },
    );
    return normalized.profiles.some(profile => languageProfileHasIndependentState(profile, defaults));
}

export function isPersistedLanguageProfile(profile: unknown): boolean {
    return Boolean(
        profile
        && typeof profile === 'object'
        && 'schemaVersion' in profile
        && isSupportedLanguageProfileSchemaVersion(profile.schemaVersion),
    );
}

// Independence means "differs from the profile Yomu would create". A stored
// Korean profile, custom parser, or installed dictionary is durable evidence;
// the untouched compatibility Japanese profile is not.
export function languageProfileHasIndependentState(
    profile: ReaderSettings['languageProfiles'][number],
    defaults: LearningTargetChoiceDefaults,
): boolean {
    return [
        profile.id !== DEFAULT_LANGUAGE_PROFILE_ID,
        profile.outputLanguage !== 'en',
        profile.targetLanguage !== SLICE1_TARGET_LANGUAGE,
        profile.uiLocale !== defaults.interfaceLanguage,
        profile.parserProvider !== defaults.parserProvider,
        profile.dictionaries.installed.length > 0,
        profile.definitionTranslationProviderIds.length > 0,
    ].includes(true);
}
