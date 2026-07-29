import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEARNING_TARGET_ROSTER } from '../../src/reader/languages/roster';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLISHED_CATALOGUE_FILE = 'config/dictionaries/published/v1/catalog.json';
const PUBLISHED_RECOMMENDATIONS_DIRECTORY = 'config/dictionaries/published/v1/recommendations';

interface PublishedCatalogueEntry {
    headwordLanguages?: unknown;
    distribution?: { state?: unknown };
}

interface PublishedCatalogue {
    entries?: unknown;
}

interface PublishedRecommendation {
    learnerLanguage?: unknown;
    dictionaries?: unknown;
}

export interface HeroStudyLanguage {
    id: string;
    locale: string;
    englishName: string;
    nativeName: string;
    direction: 'ltr' | 'rtl';
}

function readProjectJson(relativePath: string): unknown {
    return JSON.parse(readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8'));
}

function baseLanguage(value: string): string {
    return value.trim().toLowerCase().replace(/_/g, '-').split('-')[0] ?? '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function acquirableHeadwordLanguages(value: unknown): ReadonlySet<string> {
    const catalogue = isRecord(value) ? value as PublishedCatalogue : {};
    const entries = Array.isArray(catalogue.entries) ? catalogue.entries : [];
    const languages = new Set<string>();

    for (const value of entries) {
        if (!isRecord(value)) continue;
        const entry = value as PublishedCatalogueEntry;
        const state = entry.distribution?.state;
        if (state !== 'published' && state !== 'upstream') continue;
        if (!Array.isArray(entry.headwordLanguages)) continue;
        for (const language of entry.headwordLanguages) {
            if (typeof language === 'string') languages.add(baseLanguage(language));
        }
    }
    return languages;
}

/**
 * Public study-target copy is the intersection of what the shipped picker
 * exposes and what the published catalogue can actually look up.
 */
export function heroStudyLanguages(
    catalogue: unknown = readProjectJson(PUBLISHED_CATALOGUE_FILE),
): readonly HeroStudyLanguage[] {
    const publishedHeadwords = acquirableHeadwordLanguages(catalogue);
    const languages = LEARNING_TARGET_ROSTER
        .filter(language => publishedHeadwords.has(baseLanguage(language.runtimeLocale)))
        .map(language => ({
            id: language.id,
            locale: language.runtimeLocale,
            englishName: language.englishName,
            nativeName: language.nativeName,
            direction: language.direction,
        }));
    if (!languages.length) {
        throw new Error('The shipped target roster and published dictionary catalogue have no language in common.');
    }
    return languages;
}

/**
 * Count learner-language shelves that contain at least one definition written
 * in that shelf's learner language. Readiness flags are intentionally ignored.
 */
export function measuredDefinitionLanguageCount(
    recommendationsDirectory = path.join(PROJECT_ROOT, PUBLISHED_RECOMMENDATIONS_DIRECTORY),
): number {
    return readdirSync(recommendationsDirectory)
        .filter(file => file.endsWith('.json'))
        .map(file => JSON.parse(readFileSync(path.join(recommendationsDirectory, file), 'utf8')) as PublishedRecommendation)
        .filter(recommendation => {
            if (typeof recommendation.learnerLanguage !== 'string') return false;
            if (!Array.isArray(recommendation.dictionaries)) return false;
            return recommendation.dictionaries.some(dictionary =>
                isRecord(dictionary)
                && dictionary.definitionLanguage === recommendation.learnerLanguage,
            );
        })
        .length;
}
