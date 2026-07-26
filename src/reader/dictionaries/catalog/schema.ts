import {
    DICTIONARY_CATALOG_SCHEMA_VERSION,
    DICTIONARY_CATALOG_TARGET_LANGUAGE,
    SLICE1_LEARNER_LANGUAGES,
    isSlice1LearnerLanguage,
    type CatalogLanguage,
    type DictionaryCatalogEntry,
    type DictionaryCatalogManifest,
    type DictionaryCategory,
    type DictionaryLanguageManifest,
    type DictionaryRecommendation,
    type DictionaryRecommendationManifest,
    type Slice1LearnerLanguage,
} from './types';
import { dictionaryObjectKeyMatchesHash, isSha256Hex } from './integrity';

const LANGUAGE_TAG_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SCRIPT_PATTERN = /^[A-Z][a-z]{3}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const CATEGORIES = new Set<DictionaryCategory>([
    'terms',
    'names',
    'grammar',
    'kanji',
    'frequency',
    'pronunciation',
    'examples',
    'thesaurus',
    'encyclopedia',
    'utility',
]);
const RECOMMENDATION_ROLES = new Set([
    'primary-terms',
    'fallback-terms',
    'monolingual',
    'names',
    'kanji',
    'grammar',
    'frequency',
    'pronunciation',
    'examples',
]);

class DictionaryManifestError extends Error {
    constructor(path: string, message: string) {
        super(`${path}: ${message}`);
        this.name = 'DictionaryManifestError';
    }
}

export function parseDictionaryCatalogManifest(input: unknown): DictionaryCatalogManifest {
    const root = record(input, '$');
    schemaVersion(root.schemaVersion, '$.schemaVersion');
    literal(root.targetLanguage, DICTIONARY_CATALOG_TARGET_LANGUAGE, '$.targetLanguage');
    const entries = array(root.entries, '$.entries').map((entry, index) => parseCatalogEntry(entry, `$.entries[${index}]`));
    assertUnique(entries.map(entry => entry.id), '$.entries', 'dictionary id');
    const sourceSnapshot = record(root.sourceSnapshot, '$.sourceSnapshot');
    const catalogueCommit = text(sourceSnapshot.catalogueCommit, '$.sourceSnapshot.catalogueCommit');
    if (!/^[a-f0-9]{40}$/.test(catalogueCommit)) {
        fail('$.sourceSnapshot.catalogueCommit', 'must be a 40-character lowercase Git commit hash');
    }
    return {
        schemaVersion: DICTIONARY_CATALOG_SCHEMA_VERSION,
        revision: text(root.revision, '$.revision'),
        generatedAt: isoDate(root.generatedAt, '$.generatedAt'),
        targetLanguage: DICTIONARY_CATALOG_TARGET_LANGUAGE,
        objectsBaseUrl: httpsUrl(root.objectsBaseUrl, '$.objectsBaseUrl'),
        sourceSnapshot: {
            catalogueRepository: httpsUrl(sourceSnapshot.catalogueRepository, '$.sourceSnapshot.catalogueRepository'),
            catalogueCommit,
            catalogueFile: text(sourceSnapshot.catalogueFile, '$.sourceSnapshot.catalogueFile'),
            driveFolderUrl: httpsUrl(sourceSnapshot.driveFolderUrl, '$.sourceSnapshot.driveFolderUrl'),
            capturedAt: isoDate(sourceSnapshot.capturedAt, '$.sourceSnapshot.capturedAt'),
        },
        entries,
    };
}

export function parseDictionaryLanguageManifest(input: unknown): DictionaryLanguageManifest {
    const root = record(input, '$');
    schemaVersion(root.schemaVersion, '$.schemaVersion');
    literal(root.targetLanguage, DICTIONARY_CATALOG_TARGET_LANGUAGE, '$.targetLanguage');
    if (root.count !== SLICE1_LEARNER_LANGUAGES.length) fail('$.count', 'must equal 32');
    const languages = array(root.languages, '$.languages').map((language, index) => parseCatalogLanguage(language, `$.languages[${index}]`));
    if (languages.length !== SLICE1_LEARNER_LANGUAGES.length) fail('$.languages', 'must contain exactly 32 records');
    assertUnique(languages.map(language => language.tag), '$.languages', 'language tag');
    const actual = languages.map(language => language.tag);
    if (actual.some((tag, index) => tag !== SLICE1_LEARNER_LANGUAGES[index])) {
        fail('$.languages', `must use the frozen Slice 1 order: ${SLICE1_LEARNER_LANGUAGES.join(', ')}`);
    }
    return {
        schemaVersion: DICTIONARY_CATALOG_SCHEMA_VERSION,
        revision: text(root.revision, '$.revision'),
        generatedAt: isoDate(root.generatedAt, '$.generatedAt'),
        targetLanguage: DICTIONARY_CATALOG_TARGET_LANGUAGE,
        count: 32,
        languages,
    };
}

export function parseDictionaryRecommendationManifest(input: unknown): DictionaryRecommendationManifest {
    const root = record(input, '$');
    schemaVersion(root.schemaVersion, '$.schemaVersion');
    const learnerLanguage = language(root.learnerLanguage, '$.learnerLanguage');
    literal(root.targetLanguage, DICTIONARY_CATALOG_TARGET_LANGUAGE, '$.targetLanguage');
    literal(root.strategy, 'native-first', '$.strategy');
    const readiness = oneOf(root.readiness, ['ready', 'blocked'] as const, '$.readiness');
    const blockers = stringArray(root.blockers, '$.blockers');
    if (readiness === 'ready' && blockers.length) fail('$.blockers', 'must be empty when readiness is ready');
    if (readiness === 'blocked' && !blockers.length) fail('$.blockers', 'must explain why readiness is blocked');
    const dictionaries = array(root.dictionaries, '$.dictionaries')
        .map((entry, index) => parseRecommendation(entry, `$.dictionaries[${index}]`));
    assertUnique(dictionaries.map(entry => entry.dictionaryId), '$.dictionaries', 'dictionary id');
    for (let index = 1; index < dictionaries.length; index += 1) {
        if (dictionaries[index - 1].priority > dictionaries[index].priority) {
            fail('$.dictionaries', 'must be sorted by ascending priority');
        }
    }
    return {
        schemaVersion: DICTIONARY_CATALOG_SCHEMA_VERSION,
        catalogRevision: text(root.catalogRevision, '$.catalogRevision'),
        learnerLanguage,
        targetLanguage: DICTIONARY_CATALOG_TARGET_LANGUAGE,
        strategy: 'native-first',
        readiness,
        blockers,
        dictionaries,
    };
}

export function assertRecommendationReferencesCatalog(
    recommendation: DictionaryRecommendationManifest,
    catalog: DictionaryCatalogManifest,
): void {
    const ids = new Set(catalog.entries.map(entry => entry.id));
    for (const entry of recommendation.dictionaries) {
        if (!ids.has(entry.dictionaryId)) {
            fail('$.dictionaries', `references unknown dictionary "${entry.dictionaryId}"`);
        }
    }
    if (recommendation.catalogRevision !== catalog.revision) {
        fail('$.catalogRevision', `must match catalog revision "${catalog.revision}"`);
    }
}

function parseCatalogEntry(input: unknown, path: string): DictionaryCatalogEntry {
    const entry = record(input, path);
    const id = text(entry.id, `${path}.id`);
    if (!ID_PATTERN.test(id)) fail(`${path}.id`, 'must be a lowercase kebab-case id');
    literal(entry.format, 'yomitan', `${path}.format`);
    const categories = array(entry.categories, `${path}.categories`).map((category, index) => {
        const value = text(category, `${path}.categories[${index}]`);
        if (!CATEGORIES.has(value as DictionaryCategory)) fail(`${path}.categories[${index}]`, 'is not a supported category');
        return value as DictionaryCategory;
    });
    if (!categories.length) fail(`${path}.categories`, 'must contain at least one category');
    const source = record(entry.source, `${path}.source`);
    const license = record(entry.license, `${path}.license`);
    const redistribution = oneOf(license.redistribution, ['allowed', 'pending', 'blocked'] as const, `${path}.license.redistribution`);
    const distribution = parseDistribution(entry.distribution, `${path}.distribution`, redistribution);
    return {
        id,
        title: text(entry.title, `${path}.title`),
        format: 'yomitan',
        version: text(entry.version, `${path}.version`),
        categories,
        headwordLanguages: languageTagArray(entry.headwordLanguages, `${path}.headwordLanguages`),
        definitionLanguages: languageTagArray(entry.definitionLanguages, `${path}.definitionLanguages`),
        source: {
            acquisitionId: text(source.acquisitionId, `${path}.source.acquisitionId`),
            url: httpsUrl(source.url, `${path}.source.url`),
            ...(optionalText(source.projectUrl, `${path}.source.projectUrl`) ? { projectUrl: httpsUrl(source.projectUrl, `${path}.source.projectUrl`) } : {}),
            ...(optionalText(source.catalogueSection, `${path}.source.catalogueSection`) ? { catalogueSection: text(source.catalogueSection, `${path}.source.catalogueSection`) } : {}),
        },
        license: {
            spdx: nullableText(license.spdx, `${path}.license.spdx`),
            attribution: text(license.attribution, `${path}.license.attribution`),
            sourceUrl: httpsUrl(license.sourceUrl, `${path}.license.sourceUrl`),
            ...(optionalText(license.licenseUrl, `${path}.license.licenseUrl`) ? { licenseUrl: httpsUrl(license.licenseUrl, `${path}.license.licenseUrl`) } : {}),
            redistribution,
            ...(optionalText(license.reviewNote, `${path}.license.reviewNote`) ? { reviewNote: text(license.reviewNote, `${path}.license.reviewNote`) } : {}),
        },
        distribution,
    };
}

function parseDistribution(input: unknown, path: string, redistribution: 'allowed' | 'pending' | 'blocked'): DictionaryCatalogEntry['distribution'] {
    const distribution = record(input, path);
    const state = oneOf(distribution.state, ['source-only', 'blocked', 'published'] as const, `${path}.state`);
    if (state === 'source-only') return { state };
    if (state === 'blocked') return { state, reason: text(distribution.reason, `${path}.reason`) };
    if (redistribution !== 'allowed') fail(path, 'cannot publish until redistribution review is allowed');
    const object = record(distribution.object, `${path}.object`);
    const sha256 = text(object.sha256, `${path}.object.sha256`);
    if (!isSha256Hex(sha256)) fail(`${path}.object.sha256`, 'must be a lowercase SHA-256 digest');
    const key = text(object.key, `${path}.object.key`);
    if (!dictionaryObjectKeyMatchesHash(key, sha256)) fail(`${path}.object.key`, 'must be content-addressed by object.sha256');
    literal(object.contentType, 'application/zip', `${path}.object.contentType`);
    return {
        state,
        object: {
            key,
            sha256,
            bytes: positiveInteger(object.bytes, `${path}.object.bytes`),
            contentType: 'application/zip',
        },
    };
}

function parseCatalogLanguage(input: unknown, path: string): CatalogLanguage {
    const value = record(input, path);
    const tag = language(value.tag, `${path}.tag`);
    literal(value.targetLanguage, DICTIONARY_CATALOG_TARGET_LANGUAGE, `${path}.targetLanguage`);
    literal(value.status, 'slice1', `${path}.status`);
    const defaultScript = optionalText(value.defaultScript, `${path}.defaultScript`);
    if (defaultScript && !SCRIPT_PATTERN.test(defaultScript)) fail(`${path}.defaultScript`, 'must be an ISO 15924 script code');
    const catalogueEvidence = stringArray(value.catalogueEvidence, `${path}.catalogueEvidence`);
    if (!catalogueEvidence.length) fail(`${path}.catalogueEvidence`, 'must contain at least one source note');
    return {
        tag,
        englishName: text(value.englishName, `${path}.englishName`),
        nativeName: text(value.nativeName, `${path}.nativeName`),
        direction: oneOf(value.direction, ['ltr', 'rtl'] as const, `${path}.direction`),
        ...(defaultScript ? { defaultScript } : {}),
        targetLanguage: DICTIONARY_CATALOG_TARGET_LANGUAGE,
        status: 'slice1',
        catalogueEvidence,
    };
}

function parseRecommendation(input: unknown, path: string): DictionaryRecommendation {
    const value = record(input, path);
    const role = text(value.role, `${path}.role`);
    if (!RECOMMENDATION_ROLES.has(role)) fail(`${path}.role`, 'is not a supported recommendation role');
    return {
        dictionaryId: text(value.dictionaryId, `${path}.dictionaryId`),
        role: role as DictionaryRecommendation['role'],
        priority: nonNegativeInteger(value.priority, `${path}.priority`),
        selectedByDefault: boolean(value.selectedByDefault, `${path}.selectedByDefault`),
        definitionLanguage: languageTag(value.definitionLanguage, `${path}.definitionLanguage`),
        translationMode: oneOf(value.translationMode, ['off', 'offer'] as const, `${path}.translationMode`),
    };
}

function schemaVersion(value: unknown, path: string): void {
    if (value !== DICTIONARY_CATALOG_SCHEMA_VERSION) fail(path, `must equal ${DICTIONARY_CATALOG_SCHEMA_VERSION}`);
}

function language(value: unknown, path: string): Slice1LearnerLanguage {
    const tag = text(value, path);
    if (!isSlice1LearnerLanguage(tag)) fail(path, 'is not in the frozen 32-language roster');
    return tag;
}

function languageTagArray(value: unknown, path: string): string[] {
    const result = array(value, path).map((entry, index) => languageTag(entry, `${path}[${index}]`));
    if (!result.length) fail(path, 'must contain at least one language');
    assertUnique(result, path, 'language tag');
    return result;
}

function languageTag(value: unknown, path: string): string {
    const tag = text(value, path);
    if (!LANGUAGE_TAG_PATTERN.test(tag)) fail(path, 'must be a BCP-47-shaped language tag');
    return tag;
}

function record(value: unknown, path: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object');
    return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
    if (!Array.isArray(value)) fail(path, 'must be an array');
    return value;
}

function text(value: unknown, path: string): string {
    if (typeof value !== 'string' || !value.trim()) fail(path, 'must be a non-empty string');
    return value;
}

function nullableText(value: unknown, path: string): string | null {
    if (value === null) return null;
    return text(value, path);
}

function optionalText(value: unknown, path: string): string | undefined {
    if (value === undefined) return undefined;
    return text(value, path);
}

function boolean(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') fail(path, 'must be a boolean');
    return value;
}

function positiveInteger(value: unknown, path: string): number {
    if (!Number.isSafeInteger(value) || Number(value) <= 0) fail(path, 'must be a positive safe integer');
    return Number(value);
}

function nonNegativeInteger(value: unknown, path: string): number {
    if (!Number.isSafeInteger(value) || Number(value) < 0) fail(path, 'must be a non-negative safe integer');
    return Number(value);
}

function isoDate(value: unknown, path: string): string {
    const date = text(value, path);
    if (!ISO_DATE_PATTERN.test(date) || Number.isNaN(Date.parse(date))) fail(path, 'must be an ISO-8601 UTC timestamp');
    return date;
}

function httpsUrl(value: unknown, path: string): string {
    const raw = text(value, path);
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        fail(path, 'must be an absolute HTTPS URL');
    }
    if (parsed.protocol !== 'https:') fail(path, 'must use HTTPS');
    return raw;
}

function literal<T extends string>(value: unknown, expected: T, path: string): T {
    if (value !== expected) fail(path, `must equal "${expected}"`);
    return expected;
}

function oneOf<T extends string>(value: unknown, values: readonly T[], path: string): T {
    if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) {
        fail(path, `must be one of: ${values.join(', ')}`);
    }
    return value as T;
}

function stringArray(value: unknown, path: string): string[] {
    return array(value, path).map((entry, index) => text(entry, `${path}[${index}]`));
}

function assertUnique(values: readonly string[], path: string, label: string): void {
    const seen = new Set<string>();
    for (const value of values) {
        if (seen.has(value)) fail(path, `contains duplicate ${label} "${value}"`);
        seen.add(value);
    }
}

function fail(path: string, message: string): never {
    throw new DictionaryManifestError(path, message);
}
