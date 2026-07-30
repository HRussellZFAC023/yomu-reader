import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { learningTargetModuleFor } from '../../src/reader/languages/registry';
import { LEARNING_TARGET_ROSTER } from '../../src/reader/languages/roster';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLISHED_RECOMMENDATIONS_DIRECTORY = 'config/dictionaries/published/v1/recommendations';

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

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/**
 * Public study-target copy is exactly what the shipped lookup capability can
 * open. Catalogue supply is audited separately; it must never be used as a
 * proxy for an interactive capability again.
 */
export function heroStudyLanguages(): readonly HeroStudyLanguage[] {
    const languages = LEARNING_TARGET_ROSTER
        .filter(language => learningTargetModuleFor(language.runtimeLocale)?.capabilities['term-lookup'])
        .map(language => ({
            id: language.id,
            locale: language.runtimeLocale,
            englishName: language.englishName,
            nativeName: language.nativeName,
            direction: language.direction,
        }));
    if (!languages.length) {
        throw new Error('The shipped target roster exposes no term-lookup capability.');
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
