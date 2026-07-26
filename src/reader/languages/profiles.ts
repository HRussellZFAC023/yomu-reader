import { canonicalLanguageTag } from './locale';
import { normalizeLearningTargetLanguage } from './registry';
import {
    DEFAULT_SLICE1_LEARNER_LANGUAGE,
    normalizeSlice1LearnerLanguage,
    slice1LanguageIdForTag,
} from './roster';
import {
    LANGUAGE_PROFILE_SCHEMA_VERSION,
    type LanguageTag,
    type LanguageProfile,
    type LanguageProfileDictionaries,
    type LocalePreference,
    type ParserProvider,
} from './types';

export const DEFAULT_LANGUAGE_PROFILE_ID = 'default-ja';

const PROFILE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u;
const PARSER_PROVIDERS = new Set<ParserProvider>(['local', 'jiten', 'jpdb', 'auto']);

export interface LanguageProfileDefaults {
    learnerLanguage?: unknown;
    uiLocale?: unknown;
    parserProvider?: unknown;
    targetLanguage?: unknown;
}

export interface NormalizedLanguageProfiles {
    profiles: LanguageProfile[];
    activeProfileId: string;
}

export interface ActivatedLanguageProfile {
    profiles: LanguageProfile[];
    activeProfileId: string;
    created: boolean;
}

export interface NewLanguageProfileValues {
    uiLocale?: LocalePreference;
    parserProvider?: ParserProvider;
    dictionaries?: LanguageProfileDictionaries;
    definitionTranslationProviderIds?: string[];
}

export function createDefaultLanguageProfile(defaults: LanguageProfileDefaults = {}): LanguageProfile {
    return {
        schemaVersion: LANGUAGE_PROFILE_SCHEMA_VERSION,
        id: DEFAULT_LANGUAGE_PROFILE_ID,
        learnerLanguage: normalizeSlice1LearnerLanguage(
            defaults.learnerLanguage,
            DEFAULT_SLICE1_LEARNER_LANGUAGE,
        ),
        targetLanguage: normalizeLearningTargetLanguage(defaults.targetLanguage),
        uiLocale: normalizeUiLocale(defaults.uiLocale, 'en'),
        parserProvider: normalizeParserProvider(defaults.parserProvider, 'local'),
        dictionaries: emptyProfileDictionaries(),
        definitionTranslationProviderIds: [],
    };
}

export function normalizeLanguageProfiles(
    value: unknown,
    activeProfileId: unknown,
    defaults: LanguageProfileDefaults = {},
): NormalizedLanguageProfiles {
    const rawProfiles = Array.isArray(value) ? value : [];
    const profiles: LanguageProfile[] = [];
    const usedIds = new Set<string>();

    for (let index = 0; index < rawProfiles.length; index += 1) {
        const profile = normalizeLanguageProfile(rawProfiles[index], index, defaults);
        if (!profile) continue;
        profile.id = uniqueProfileId(profile.id, usedIds);
        usedIds.add(profile.id);
        profiles.push(profile);
    }

    if (!profiles.length) profiles.push(createDefaultLanguageProfile(defaults));
    const requestedActiveId = typeof activeProfileId === 'string' ? activeProfileId.trim() : '';
    const active = profiles.find(profile => profile.id === requestedActiveId) ?? profiles[0]!;
    return {
        profiles,
        activeProfileId: active.id,
    };
}

export function activeLanguageProfile(
    profiles: readonly LanguageProfile[],
    activeProfileId: string,
): LanguageProfile | null {
    return profiles.find(profile => profile.id === activeProfileId) ?? profiles[0] ?? null;
}

/**
 * Selects the independent profile for a Slice 1 learner language, creating it
 * exactly once when that language has not been used before. Physical
 * dictionaries remain shared browser data, while enabled/order choices and
 * translation consent are copied into the new profile and then evolve
 * independently.
 */
export function activateLanguageProfileForLearner(
    profiles: readonly LanguageProfile[],
    activeProfileId: string,
    learnerLanguage: unknown,
    initial: NewLanguageProfileValues = {},
): ActivatedLanguageProfile {
    const canonicalLearnerLanguage = normalizeSlice1LearnerLanguage(learnerLanguage);
    const learnerLanguageId = slice1LanguageIdForTag(canonicalLearnerLanguage)
        ?? DEFAULT_SLICE1_LEARNER_LANGUAGE;
    const existing = profiles.find(profile =>
        slice1LanguageIdForTag(profile.learnerLanguage) === learnerLanguageId,
    );
    if (existing) {
        return {
            profiles: [...profiles],
            activeProfileId: existing.id,
            created: false,
        };
    }

    const base = activeLanguageProfile(profiles, activeProfileId)
        ?? createDefaultLanguageProfile();
    const usedIds = new Set(profiles.map(profile => profile.id));
    const profile: LanguageProfile = {
        ...base,
        id: uniqueProfileId(`learner-${learnerLanguageId}-ja`, usedIds),
        learnerLanguage: canonicalLearnerLanguage,
        // A new learner profile inherits what the person is already studying.
        // Switching definition language is not a decision about the target.
        targetLanguage: normalizeLearningTargetLanguage(base.targetLanguage),
        uiLocale: initial.uiLocale ?? base.uiLocale,
        parserProvider: initial.parserProvider ?? base.parserProvider,
        dictionaries: cloneProfileDictionaries(initial.dictionaries ?? base.dictionaries),
        definitionTranslationProviderIds: [
            ...(initial.definitionTranslationProviderIds ?? base.definitionTranslationProviderIds),
        ],
    };
    return {
        profiles: [...profiles, profile],
        activeProfileId: profile.id,
        created: true,
    };
}

/**
 * Narrow consumer seam for code that may receive either a profile or the
 * ReaderSettings-shaped profile collection. This keeps translation, lookup and
 * Study code independent from settings storage/migration details.
 */
export function resolveLanguageProfile(value: unknown): LanguageProfile {
    if (isRecord(value) && value.schemaVersion === LANGUAGE_PROFILE_SCHEMA_VERSION) {
        const normalized = normalizeLanguageProfiles([value], value.id, {
            learnerLanguage: value.learnerLanguage,
            uiLocale: value.uiLocale,
            parserProvider: value.parserProvider,
        });
        return normalized.profiles[0]!;
    }
    const source = isRecord(value) ? value : {};
    const normalized = normalizeLanguageProfiles(
        source.languageProfiles,
        source.activeLanguageProfileId,
        {
            learnerLanguage: source.learnerLanguage,
            uiLocale: source.interfaceLanguage,
            parserProvider: source.parserProvider,
        },
    );
    return activeLanguageProfile(normalized.profiles, normalized.activeProfileId)
        ?? createDefaultLanguageProfile();
}

export function resolvedLearnerLanguage(value: unknown): LanguageTag {
    return resolveLanguageProfile(value).learnerLanguage;
}

function normalizeLanguageProfile(
    value: unknown,
    index: number,
    defaults: LanguageProfileDefaults,
): LanguageProfile | null {
    if (!isRecord(value)) return null;
    if (value.schemaVersion !== LANGUAGE_PROFILE_SCHEMA_VERSION) return null;
    return {
        schemaVersion: LANGUAGE_PROFILE_SCHEMA_VERSION,
        id: normalizeProfileId(value.id, index),
        learnerLanguage: normalizeSlice1LearnerLanguage(
            value.learnerLanguage,
            normalizeSlice1LearnerLanguage(defaults.learnerLanguage),
        ),
        // A stored target survives only while core still has a module for it;
        // anything else degrades to the default rather than leaving the reader
        // pointed at a target nothing implements.
        targetLanguage: normalizeLearningTargetLanguage(value.targetLanguage ?? defaults.targetLanguage),
        uiLocale: normalizeUiLocale(value.uiLocale, normalizeUiLocale(defaults.uiLocale, 'en')),
        parserProvider: normalizeParserProvider(value.parserProvider, normalizeParserProvider(defaults.parserProvider, 'local')),
        dictionaries: normalizeProfileDictionaries(value.dictionaries),
        definitionTranslationProviderIds: normalizeStringIds(value.definitionTranslationProviderIds),
    };
}

function normalizeProfileId(value: unknown, index: number): string {
    const candidate = typeof value === 'string' ? value.trim() : '';
    return PROFILE_ID_RE.test(candidate) ? candidate : `profile-${index + 1}`;
}

function uniqueProfileId(candidate: string, used: ReadonlySet<string>): string {
    if (!used.has(candidate)) return candidate;
    let suffix = 2;
    while (used.has(`${candidate}-${suffix}`)) suffix += 1;
    return `${candidate}-${suffix}`;
}

function normalizeUiLocale(value: unknown, fallback: LocalePreference): LocalePreference {
    if (value === 'auto') return 'auto';
    return canonicalLanguageTag(value) ?? fallback;
}

function normalizeParserProvider(value: unknown, fallback: ParserProvider): ParserProvider {
    return PARSER_PROVIDERS.has(value as ParserProvider) ? value as ParserProvider : fallback;
}

function normalizeProfileDictionaries(value: unknown): LanguageProfileDictionaries {
    if (!isRecord(value)) return emptyProfileDictionaries();
    const enabled = normalizeStringIds(value.enabled);
    const order = normalizeStringIds(value.order);
    const installed = normalizeStringIds([
        ...normalizeStringIds(value.installed),
        ...enabled,
        ...order,
    ]);
    const installedSet = new Set(installed);
    return {
        installed,
        enabled: enabled.filter(id => installedSet.has(id)),
        order: [
            ...order.filter(id => installedSet.has(id)),
            ...installed.filter(id => !order.includes(id)),
        ],
    };
}

function emptyProfileDictionaries(): LanguageProfileDictionaries {
    return { installed: [], enabled: [], order: [] };
}

function cloneProfileDictionaries(value: LanguageProfileDictionaries): LanguageProfileDictionaries {
    return {
        installed: [...value.installed],
        enabled: [...value.enabled],
        order: [...value.order],
    };
}

function normalizeStringIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of value) {
        if (typeof item !== 'string') continue;
        const id = item.trim();
        if (!id || id.length > 160 || seen.has(id)) continue;
        seen.add(id);
        result.push(id);
    }
    return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
