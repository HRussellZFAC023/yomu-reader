import type { ReaderSettings } from '../app/types';
import {
    DEFAULT_LANGUAGE_PROFILE_ID,
    normalizeLanguageProfiles,
} from '../languages/profiles';
import { SLICE1_TARGET_LANGUAGE } from '../languages/roster';
import { isSupportedLanguageProfileSchemaVersion } from '../languages/types';
import { HOSTED_DEMO_READER_SETTINGS } from '../app/hosted-demo-settings';
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
// them unless they match the exact demo policy excluded below.
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

const ACADEMY_READER_DEFAULTS = {
    showFurigana: true,
    furiganaMode: 'all',
    showPitchAccent: true,
} as const;

const HOSTED_APPEARANCE_CHOICES: Readonly<Record<string, ReadonlySet<unknown>>> = {
    interfaceLanguage: new Set(['auto', 'en', 'ja']),
    theme: new Set(['auto', 'dark', 'light']),
};
const HOSTED_ACCENT_COLOR_RE = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/iu;

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

function isPassiveHostedSettingsRecord(record: Record<string, unknown>): boolean {
    return Object.entries(record).every(isHostedAppearanceEntry)
        || extendsHostedPolicy(record, ACADEMY_READER_DEFAULTS)
        || extendsHostedPolicy(record, HOSTED_DEMO_READER_SETTINGS);
}

function extendsHostedPolicy(
    record: Record<string, unknown>,
    policy: Record<string, unknown>,
): boolean {
    return Object.entries(policy).every(([key, value]) => record[key] === value)
        && Object.entries(record).every(entry => hasOwn(policy, entry[0]) || isHostedAppearanceEntry(entry));
}

function isHostedAppearanceEntry([key, value]: [string, unknown]): boolean {
    return isHostedAppearanceChoice(key, value) || isHostedAccentColor(key, value);
}

function isHostedAppearanceChoice(key: string, value: unknown): boolean {
    return HOSTED_APPEARANCE_CHOICES[key]?.has(value) === true;
}

function isHostedAccentColor(key: string, value: unknown): boolean {
    if (key !== 'accentColor') return false;
    return typeof value === 'string' ? HOSTED_ACCENT_COLOR_RE.test(value) : false;
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
