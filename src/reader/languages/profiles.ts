import { canonicalLanguageTag } from './locale';
import {
    isSupportedLanguageProfileSchemaVersion,
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
    /** OUTPUT axis default. `learnerLanguage` is the revision-1 alias. */
    outputLanguage?: unknown;
    learnerLanguage?: unknown;
    uiLocale?: unknown;
    parserProvider?: unknown;
    targetLanguage?: unknown;
}

/**
 * Reads the OUTPUT axis off a record written by either profile revision.
 *
 * The stamped revision decides which field is authoritative, not a fixed
 * preference order. That matters on the downgrade path: a build that only knows
 * revision 1 rewrites `learnerLanguage` and re-stamps `schemaVersion: 1`,
 * leaving a now-stale `outputLanguage` beside it. Preferring the canonical name
 * unconditionally would silently discard the choice that older build recorded.
 *
 * Revision 2 writes both names and keeps them equal, so they only disagree when
 * one of the two versions of Yomu has been behind the other.
 */
function readOutputLanguageField(source: {
    schemaVersion?: unknown;
    outputLanguage?: unknown;
    learnerLanguage?: unknown;
}): unknown {
    return source.schemaVersion === 1
        ? source.learnerLanguage ?? source.outputLanguage
        : source.outputLanguage ?? source.learnerLanguage;
}

export interface NormalizedLanguageProfiles {
    profiles: LanguageProfile[];
    activeProfileId: string;
}

export function createDefaultLanguageProfile(defaults: LanguageProfileDefaults = {}): LanguageProfile {
    return {
        schemaVersion: LANGUAGE_PROFILE_SCHEMA_VERSION,
        id: DEFAULT_LANGUAGE_PROFILE_ID,
        ...outputLanguageFields(storedOutputLanguage(readOutputLanguageField(defaults))),
        targetLanguage: storedTargetLanguage(defaults.targetLanguage),
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

/**
 * The one place that writes the OUTPUT axis, so the canonical field and the
 * revision-1 compatibility mirror can never drift apart.
 */
function outputLanguageFields(outputLanguage: LanguageTag): Pick<LanguageProfile, 'outputLanguage' | 'learnerLanguage'> {
    return { outputLanguage, learnerLanguage: outputLanguage };
}

export function activeLanguageProfile(
    profiles: readonly LanguageProfile[],
    activeProfileId: string,
): LanguageProfile | null {
    return profiles.find(profile => profile.id === activeProfileId) ?? profiles[0] ?? null;
}

/**
 * Narrow consumer seam for code that may receive either a profile or the
 * ReaderSettings-shaped profile collection. This keeps translation, lookup and
 * Study code independent from settings storage/migration details.
 */
export function resolveLanguageProfile(value: unknown): LanguageProfile {
    if (isRecord(value) && isSupportedLanguageProfileSchemaVersion(value.schemaVersion)) {
        const normalized = normalizeLanguageProfiles([value], value.id, {
            outputLanguage: readOutputLanguageField(value),
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
            outputLanguage: readOutputLanguageField(source),
            uiLocale: source.interfaceLanguage,
            parserProvider: source.parserProvider,
        },
    );
    return activeLanguageProfile(normalized.profiles, normalized.activeProfileId)
        ?? createDefaultLanguageProfile();
}

function normalizeLanguageProfile(
    value: unknown,
    index: number,
    defaults: LanguageProfileDefaults,
): LanguageProfile | null {
    if (!isRecord(value)) return null;
    if (!isSupportedLanguageProfileSchemaVersion(value.schemaVersion)) return null;
    return {
        schemaVersion: LANGUAGE_PROFILE_SCHEMA_VERSION,
        id: normalizeProfileId(value.id, index),
        ...outputLanguageFields(storedOutputLanguage(readOutputLanguageField(value) ?? readOutputLanguageField(defaults))),
        targetLanguage: storedTargetLanguage(value.targetLanguage ?? defaults.targetLanguage),
        uiLocale: normalizeUiLocale(value.uiLocale, normalizeUiLocale(defaults.uiLocale, 'en')),
        parserProvider: normalizeParserProvider(value.parserProvider, normalizeParserProvider(defaults.parserProvider, 'local')),
        dictionaries: normalizeProfileDictionaries(value.dictionaries),
        definitionTranslationProviderIds: normalizeStringIds(value.definitionTranslationProviderIds),
    };
}

/**
 * Yomu reads Japanese with English definitions (ADR-0024), and nothing reads
 * these two fields at runtime. What an earlier Yomu stored is kept verbatim, so
 * Saving settings never rewrites what the learner once chose.
 */
function storedTargetLanguage(value: unknown): LanguageTag {
    return canonicalLanguageTag(value) ?? 'ja';
}

function storedOutputLanguage(value: unknown): LanguageTag {
    return canonicalLanguageTag(value) ?? 'en';
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
