import type { ReaderSettings } from '../app/types';
import {
    DEFAULT_LANGUAGE_PROFILE_ID,
    normalizeLanguageProfiles,
} from '../languages/profiles';
import { SLICE1_TARGET_LANGUAGE } from '../languages/roster';
import { isSupportedLanguageProfileSchemaVersion } from '../languages/types';
import { isPassiveHostedSettingsRecord } from './passive-hosted-settings-record';
import { hasOwn } from './values';

interface LearningTargetChoiceDefaults {
    interfaceLanguage: ReaderSettings['interfaceLanguage'];
    parserProvider: ReaderSettings['parserProvider'];
}

const DEFAULT_LEARNING_TARGET_CHOICE_DEFAULTS: LearningTargetChoiceDefaults = {
    interfaceLanguage: 'en',
    parserProvider: 'local',
};

// Positive evidence, not a list of every historical field. These anchors were
// present in full pre-1.9 Reader records and cover the partial Reader/subtitle
// records worth preserving. Hosted appearance/bootstrap records contain none of
// them unless they match the exact demo policy isPassiveHostedSettingsRecord
// excludes.
const LEGACY_READER_TARGET_EVIDENCE_KEYS = [
    'apiKey',
    'jitenApiKey',
    'parserProvider',
    'lookupOnClick',
    'lookupOnHover',
    'manualScanEnabled',
    'annotationsPaused',
    'popupMode',
    'subtitlePlayerEnabled',
    'subtitleAutoDetect',
    'subtitleFontSize',
    'subtitleBottomOffset',
] as const satisfies readonly (keyof ReaderSettings)[];

export function normalizeLearningTargetChosen(
    value: Partial<ReaderSettings> | null,
    defaults: LearningTargetChoiceDefaults = DEFAULT_LEARNING_TARGET_CHOICE_DEFAULTS,
): boolean {
    if (!value) return false;
    const explicit = explicitLearningTargetChoice(value);
    if (explicit !== undefined) return explicit;
    return unmarkedLegacySettingsChooseTarget(value, defaults);
}

function explicitLearningTargetChoice(value: Partial<ReaderSettings>): boolean | undefined {
    return hasOwn(value, 'learningTargetChosen') && typeof value.learningTargetChosen === 'boolean'
        ? value.learningTargetChosen
        : undefined;
}

function unmarkedLegacySettingsChooseTarget(
    value: Partial<ReaderSettings>,
    defaults: LearningTargetChoiceDefaults,
): boolean {
    if (isPassiveHostedSettingsRecord(value as Record<string, unknown>)) return false;
    if (persistedProfilesChooseLearningTarget(value, defaults)) return true;
    return legacyReaderTargetEvidenceExists(value);
}

function legacyReaderTargetEvidenceExists(value: Partial<ReaderSettings>): boolean {
    return LEGACY_READER_TARGET_EVIDENCE_KEYS.some(key => hasOwn(value, key));
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
