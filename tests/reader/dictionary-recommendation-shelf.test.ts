import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    FROZEN_DICTIONARY_CATALOG,
    FROZEN_DICTIONARY_RECOMMENDATIONS,
    SLICE1_LEARNER_LANGUAGES,
    parseDictionaryRecommendationManifest,
    sha256FromDictionaryObjectKey,
    type RecommendationRole,
} from '../../src/reader/dictionaries/catalog';
import {
    RECOMMENDATION_SHELF_SLOTS,
    extendRecommendationManifest,
} from '../../src/reader/dictionaries/catalog/recommendation-shelf';
import { recommendedDictionariesForLearnerLanguage } from '../../src/reader/dictionaries/recommended';

const SHELF_ROLES: readonly RecommendationRole[] = ['monolingual', 'grammar', 'frequency', 'pronunciation', 'examples'];

describe('published recommendations cover a whole reading shelf', () => {
    it('recommends monolingual, grammar, frequency, pitch and example titles for every learner language', () => {
        for (const language of SLICE1_LEARNER_LANGUAGES) {
            const roles = FROZEN_DICTIONARY_RECOMMENDATIONS[language].dictionaries.map(dictionary => dictionary.role);

            expect(roles.filter(role => role === 'primary-terms' || role === 'fallback-terms'), language).toHaveLength(1);
            expect(roles, language).toContain('names');
            expect(roles, language).toContain('kanji');
            for (const role of SHELF_ROLES) expect(roles, `${language}/${role}`).toContain(role);
        }
    });

    // The published manifests are a build artefact, not hand-written JSON: the
    // pre-release manifest plus the frozen shelf policy must reproduce them
    // exactly, or a release that regenerates them would silently drop the shelf.
    it('reproduces every published manifest from the pre-release manifest and the frozen catalogue', () => {
        for (const language of SLICE1_LEARNER_LANGUAGES) {
            const source = parseDictionaryRecommendationManifest(
                JSON.parse(readFileSync(`config/dictionaries/manifests/v1/recommendations/${language}-ja.json`, 'utf8')),
            );

            expect(extendRecommendationManifest(source, FROZEN_DICTIONARY_CATALOG).dictionaries, language)
                .toEqual(FROZEN_DICTIONARY_RECOMMENDATIONS[language].dictionaries);
        }
    });

    it('leaves the pre-release manifest alone until the catalogue actually mirrors a shelf title', () => {
        const source = parseDictionaryRecommendationManifest(
            JSON.parse(readFileSync('config/dictionaries/manifests/v1/recommendations/en-ja.json', 'utf8')),
        );
        const unmirrored = {
            ...FROZEN_DICTIONARY_CATALOG,
            entries: FROZEN_DICTIONARY_CATALOG.entries.map(entry => ({ ...entry, distribution: { state: 'source-only' } as const })),
        };

        expect(extendRecommendationManifest(source, unmirrored).dictionaries).toEqual(source.dictionaries);
    });

    it('never offers to machine-translate a frequency or pitch list, and never translates into a language Google cannot reach', () => {
        const byRole = (language: typeof SLICE1_LEARNER_LANGUAGES[number], role: RecommendationRole) =>
            FROZEN_DICTIONARY_RECOMMENDATIONS[language].dictionaries.find(dictionary => dictionary.role === role);

        for (const language of SLICE1_LEARNER_LANGUAGES) {
            expect(byRole(language, 'frequency')?.translationMode, language).toBe('off');
            expect(byRole(language, 'pronunciation')?.translationMode, language).toBe('off');
        }
        expect(byRole('ko', 'monolingual')?.translationMode).toBe('offer');
        expect(byRole('ko', 'examples')?.translationMode).toBe('offer');
        // Ancient Greek has no machine-translation provider, so a Japanese-only
        // monolingual must not promise a translation it can never deliver.
        expect(byRole('grc', 'monolingual')?.translationMode).toBe('off');
        expect(byRole('grc', 'examples')?.translationMode).toBe('off');
    });

    it('installs every shelf title from a content-addressed mirror object', () => {
        for (const slot of RECOMMENDATION_SHELF_SLOTS) {
            const entry = FROZEN_DICTIONARY_CATALOG.entries.find(candidate => candidate.id === slot.dictionaryId);

            expect(entry, slot.dictionaryId).toBeDefined();
            expect(entry!.headwordLanguages).toContain('ja');
            expect(entry!.distribution.state).toBe('published');
            if (entry!.distribution.state !== 'published') continue;
            expect(sha256FromDictionaryObjectKey(entry!.distribution.object.key)).toBe(entry!.distribution.object.sha256);
        }
    });

    it('files the shelf into the Settings buckets a reader actually browses', () => {
        const english = recommendedDictionariesForLearnerLanguage('en');
        const categoryOf = (role: RecommendationRole) => english.find(dictionary => dictionary.role === role)?.category;

        expect(categoryOf('monolingual')).toBe('terms');
        expect(categoryOf('grammar')).toBe('terms');
        expect(categoryOf('examples')).toBe('terms');
        expect(categoryOf('frequency')).toBe('frequency');
        expect(categoryOf('pronunciation')).toBe('pitch');
        english.forEach(dictionary => {
            expect(dictionary.downloadUrl, dictionary.id).toMatch(/^https:\/\/dictionaries\.yomureader\.com\/objects\/sha256\/[a-f0-9]{64}\.zip$/);
        });
    });
});
