import type { ReaderSettings } from '../app/types';
import { activeLanguageProfile, normalizeLanguageProfiles } from '../languages/profiles';
import {
    isPersistedLanguageProfile,
    languageProfileHasIndependentState,
} from './learning-target-choice';
import { languageProfileDictionariesFromPreferences } from './language-profile-dictionaries';

interface LanguageProfileSettingsDefaults {
    interfaceLanguage: ReaderSettings['interfaceLanguage'];
    parserProvider: ReaderSettings['parserProvider'];
}

type NormalizedLanguageProfileSettings = Pick<
    ReaderSettings,
    'languageProfiles' | 'activeLanguageProfileId' | 'parserProvider' | 'interfaceLanguage' | 'dictionaryPreferences'
>;

/**
 * Reconciles the legacy flat settings with profile-owned state. A profile only
 * wins once it contains durable independent choices; untouched compatibility
 * profiles continue to inherit the old flat parser, locale, and dictionaries.
 */
export function normalizeLanguageProfileSettings(
    value: Partial<ReaderSettings> | null,
    parserProvider: ReaderSettings['parserProvider'],
    dictionaryPreferences: ReaderSettings['dictionaryPreferences'],
    defaults: LanguageProfileSettingsDefaults,
): NormalizedLanguageProfileSettings {
    const interfaceLanguage = storedInterfaceLanguage(value, defaults.interfaceLanguage);
    const normalized = normalizeLanguageProfiles(
        value?.languageProfiles,
        value?.activeLanguageProfileId,
        { outputLanguage: 'en', uiLocale: interfaceLanguage, parserProvider },
    );
    const active = activeLanguageProfile(normalized.profiles, normalized.activeProfileId);
    if (!active) return missingActiveProfileSettings(normalized, parserProvider, interfaceLanguage, dictionaryPreferences);
    return normalizedActiveProfileSettings(
        value,
        normalized,
        active,
        parserProvider,
        dictionaryPreferences,
        defaults,
    );
}

function normalizedActiveProfileSettings(
    value: Partial<ReaderSettings> | null,
    normalized: ReturnType<typeof normalizeLanguageProfiles>,
    active: ReaderSettings['languageProfiles'][number],
    parserProvider: ReaderSettings['parserProvider'],
    dictionaryPreferences: ReaderSettings['dictionaryPreferences'],
    defaults: LanguageProfileSettingsDefaults,
): NormalizedLanguageProfileSettings {
    const authoritative = profilesAreAuthoritative(value, normalized.profiles, defaults);
    if (!authoritative) inheritLegacyProfileSettings(active, value, parserProvider, dictionaryPreferences, defaults);
    return activeProfileSettings(value, normalized, active, authoritative, dictionaryPreferences, defaults);
}

function storedInterfaceLanguage(
    value: Partial<ReaderSettings> | null,
    fallback: ReaderSettings['interfaceLanguage'],
): ReaderSettings['interfaceLanguage'] {
    if (!value) return fallback;
    return value.interfaceLanguage ?? fallback;
}

function profilesAreAuthoritative(
    value: Partial<ReaderSettings> | null,
    profiles: ReaderSettings['languageProfiles'],
    defaults: LanguageProfileSettingsDefaults,
): boolean {
    if (!hasPersistedProfiles(value)) return false;
    return profiles.some(profile => languageProfileHasIndependentState(profile, defaults));
}

function hasPersistedProfiles(value: Partial<ReaderSettings> | null): boolean {
    const profiles = value?.languageProfiles;
    return Array.isArray(profiles) && profiles.some(isPersistedLanguageProfile);
}

function inheritLegacyProfileSettings(
    active: ReaderSettings['languageProfiles'][number],
    value: Partial<ReaderSettings> | null,
    parserProvider: ReaderSettings['parserProvider'],
    dictionaryPreferences: ReaderSettings['dictionaryPreferences'],
    defaults: LanguageProfileSettingsDefaults,
): void {
    active.parserProvider = parserProvider;
    active.uiLocale = normalizedInterfaceLanguage(value?.interfaceLanguage, defaults.interfaceLanguage);
    active.dictionaries = languageProfileDictionariesFromPreferences(dictionaryPreferences);
}

function missingActiveProfileSettings(
    normalized: ReturnType<typeof normalizeLanguageProfiles>,
    parserProvider: ReaderSettings['parserProvider'],
    interfaceLanguage: ReaderSettings['interfaceLanguage'],
    dictionaryPreferences: ReaderSettings['dictionaryPreferences'],
): NormalizedLanguageProfileSettings {
    return {
        languageProfiles: normalized.profiles,
        activeLanguageProfileId: normalized.activeProfileId,
        parserProvider,
        interfaceLanguage,
        dictionaryPreferences,
    };
}

function activeProfileSettings(
    value: Partial<ReaderSettings> | null,
    normalized: ReturnType<typeof normalizeLanguageProfiles>,
    active: ReaderSettings['languageProfiles'][number],
    authoritative: boolean,
    dictionaryPreferences: ReaderSettings['dictionaryPreferences'],
    defaults: LanguageProfileSettingsDefaults,
): NormalizedLanguageProfileSettings {
    return {
        languageProfiles: normalized.profiles,
        activeLanguageProfileId: normalized.activeProfileId,
        parserProvider: active.parserProvider,
        interfaceLanguage: profileInterfaceLanguage(active.uiLocale, value?.interfaceLanguage, defaults.interfaceLanguage),
        dictionaryPreferences: authoritative
            ? dictionaryPreferencesForLanguageProfile(dictionaryPreferences, active.dictionaries)
            : dictionaryPreferences,
    };
}

function dictionaryPreferencesForLanguageProfile(
    preferences: ReaderSettings['dictionaryPreferences'],
    dictionaries: ReaderSettings['languageProfiles'][number]['dictionaries'],
): ReaderSettings['dictionaryPreferences'] {
    // Empty is the migration/uninitialized state. A profile becomes
    // authoritative after it captures at least one installed dictionary.
    if (!dictionaries.installed.length) return preferences;
    const installed = new Set(dictionaries.installed.map(normalizedProfileDictionaryId));
    const enabled = new Set(dictionaries.enabled.map(normalizedProfileDictionaryId));
    const priorities = profileOrderedPriorities(preferences, dictionaries.order);
    return preferences
        .map(preference => {
            const key = normalizedProfileDictionaryId(preference.name);
            return {
                ...preference,
                enabled: installed.has(key) && enabled.has(key),
                priority: priorities.get(preference.name) ?? preference.priority,
            };
        })
        .sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name));
}

/**
 * The profile decides the ORDER of its dictionaries, not their numbers.
 *
 * A preference's priority is its place in the one list the definition-source
 * editor numbers, shared with the built-in sources (Jiten 0, JPDB 1, ...), so
 * the profile's indices (0, 1, ...) cannot stand in for it: they tie with the
 * built-ins, and the name tie-break then moved a dictionary placed after them
 * back above Jiten on the next load (GitHub #43). The dictionaries' own
 * priorities are dealt back out in profile order instead, so each keeps its
 * slot among the built-ins.
 */
function profileOrderedPriorities(
    preferences: ReaderSettings['dictionaryPreferences'],
    order: string[],
): Map<string, number> {
    const rank = new Map(order.map((id, index) => [normalizedProfileDictionaryId(id), index]));
    const ordered = preferences
        .filter(preference => rank.has(normalizedProfileDictionaryId(preference.name)))
        .sort((left, right) => rank.get(normalizedProfileDictionaryId(left.name))! - rank.get(normalizedProfileDictionaryId(right.name))!);
    const slots = ordered.map(preference => preference.priority).sort((left, right) => left - right);
    return new Map(ordered.map((preference, index) => [preference.name, slots[index]!]));
}

function normalizedProfileDictionaryId(value: string): string {
    return value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

function profileInterfaceLanguage(
    value: ReaderSettings['languageProfiles'][number]['uiLocale'],
    fallback: ReaderSettings['interfaceLanguage'] | undefined,
    defaultLanguage: ReaderSettings['interfaceLanguage'],
): ReaderSettings['interfaceLanguage'] {
    if (isInterfaceLanguage(value)) return value;
    if (isInterfaceLanguage(fallback)) return fallback;
    return defaultLanguage;
}

function normalizedInterfaceLanguage(
    value: unknown,
    fallback: ReaderSettings['interfaceLanguage'],
): ReaderSettings['interfaceLanguage'] {
    return isInterfaceLanguage(value) ? value : fallback;
}

function isInterfaceLanguage(value: unknown): value is ReaderSettings['interfaceLanguage'] {
    return value === 'auto' || value === 'en' || value === 'ja';
}
