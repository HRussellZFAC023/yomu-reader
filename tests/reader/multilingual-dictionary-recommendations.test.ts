import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FROZEN_DICTIONARY_CATALOG, SLICE1_LEARNER_LANGUAGES, SLICE1_TARGET_LANGUAGES, parseDictionaryRecommendationManifest, sha256FromDictionaryObjectKey } from '../../src/reader/dictionaries/catalog';
import { RECOMMENDED_JAPANESE_DICTIONARIES, catalogRecommendedDictionaryId, findRecommendedDictionary, recommendedDictionariesForLanguageProfile, recommendedDictionariesForLearnerLanguage } from '../../src/reader/dictionaries/recommended';
import { renderSettingsForm } from '../../src/reader/settings/form';
import { normalizeReaderSettings, DEFAULT_SETTINGS } from '../../src/reader/settings';

describe('Japanese dictionaries across definition languages', () => {
    it('uses explicit English fallback dictionaries with a translation offer for Korean', () => {
        const korean = recommendedDictionariesForLearnerLanguage('ko');

        expect(
            korean
                .filter(dictionary => dictionary.role === 'fallback-terms' || dictionary.role === 'names' || dictionary.role === 'kanji')
                .map(dictionary => ({
                    id: dictionary.catalogDictionaryId,
                    definitionLanguage: dictionary.definitionLanguage,
                    translationMode: dictionary.translationMode,
                })),
        ).toEqual([
            { id: 'jmdict-en', definitionLanguage: 'en', translationMode: 'offer' },
            { id: 'jmnedict', definitionLanguage: 'en', translationMode: 'offer' },
            { id: 'kanjidic-en', definitionLanguage: 'en', translationMode: 'offer' },
        ]);
        expect(korean[0]?.description).toContain('한국어');
    });

    it('prefers native term dictionaries for German and Spanish', () => {
        const german = recommendedDictionariesForLearnerLanguage('de');
        const spanish = recommendedDictionariesForLearnerLanguage('es');

        expect(german[0]).toMatchObject({
            catalogDictionaryId: 'jmdict-de',
            definitionLanguage: 'de',
            role: 'primary-terms',
            translationMode: 'off',
        });
        expect(spanish[0]).toMatchObject({
            catalogDictionaryId: 'jmdict-es',
            definitionLanguage: 'es',
            role: 'primary-terms',
            translationMode: 'off',
        });
        expect(spanish[2]).toMatchObject({
            catalogDictionaryId: 'kanjidic-es',
            definitionLanguage: 'es',
            translationMode: 'off',
        });
    });

    it('publishes Ancient Greek fallback dictionaries without a broken translation offer', () => {
        const ancientGreek = recommendedDictionariesForLearnerLanguage('grc');

        expect(ancientGreek.every(dictionary => dictionary.translationMode === 'off')).toBe(true);
        expect(ancientGreek.every(dictionary => !dictionary.description?.includes(' · '))).toBe(true);
    });

    it('offers no reading recommendations for retired non-Japanese targets', () => {
        for (const target of SLICE1_TARGET_LANGUAGES.filter(language => language !== 'ja')) {
            expect(recommendedDictionariesForLanguageProfile('en', target), target).toEqual([]);
        }
    });

    it('keeps every Japanese definition-language recommendation aligned with its published manifest', async () => {
        const publishedRoot = resolve(process.cwd(), 'config/dictionaries/published/v1/recommendations');
        await Promise.all(SLICE1_LEARNER_LANGUAGES.map(async learnerLanguage => {
            const manifest = parseDictionaryRecommendationManifest(JSON.parse(
                await readFile(resolve(publishedRoot, `${learnerLanguage}-ja.json`), 'utf8'),
            ));
            const runtime = recommendedDictionariesForLanguageProfile(learnerLanguage, 'ja');
            expect(runtime.some(dictionary => dictionary.selectedByDefault !== false)).toBe(true);
            expect(runtime.every(dictionary => dictionary.headwordLanguage === 'ja')).toBe(true);
            expect(runtime.map(dictionary => ({
                dictionaryId: dictionary.catalogDictionaryId,
                role: dictionary.role,
                selectedByDefault: dictionary.selectedByDefault,
                definitionLanguage: dictionary.definitionLanguage,
                translationMode: dictionary.translationMode,
            })), learnerLanguage).toEqual(manifest.dictionaries.map(dictionary => ({
                dictionaryId: dictionary.dictionaryId,
                role: dictionary.role,
                selectedByDefault: dictionary.selectedByDefault,
                definitionLanguage: dictionary.definitionLanguage,
                translationMode: dictionary.translationMode,
            })));
        }));
    });

    it('gives each supported definition-language card a unique ID and verified download identity', () => {
        const cards = SLICE1_LEARNER_LANGUAGES.flatMap(language => recommendedDictionariesForLearnerLanguage(language));
        const catalogEntries = new Map(FROZEN_DICTIONARY_CATALOG.entries.map(entry => [entry.id, entry]));

        expect(cards.length).toBeGreaterThan(0);
        expect(new Set(cards.map(dictionary => dictionary.id))).toHaveLength(cards.length);
        cards.forEach(dictionary => {
            expect(dictionary.id).toBe(catalogRecommendedDictionaryId(dictionary.learnerLanguage!, 'ja', dictionary.catalogDictionaryId!));
            expect(findRecommendedDictionary(dictionary.id)).toBe(dictionary);
            expect(dictionary.downloadUrl).toMatch(/^https:\/\/dictionaries\.yomureader\.com\/objects\/sha256\/[a-f0-9]{64}\.zip$/);
            expect(dictionary.downloadUrl).toContain(dictionary.sha256);
            expect(dictionary.bytes).toBeGreaterThan(0);

            const catalogEntry = catalogEntries.get(dictionary.catalogDictionaryId!);
            expect(catalogEntry?.distribution.state).toBe('published');
            if (catalogEntry?.distribution.state !== 'published') return;
            expect(dictionary.sha256).toBe(catalogEntry.distribution.object.sha256);
            expect(dictionary.sha256).toBe(sha256FromDictionaryObjectKey(catalogEntry.distribution.object.key));
        });
    });

    it('normalizes a legacy learner-language profile to the English interface without hiding Japanese dictionaries', () => {
        const settings = settingsForLearnerLanguage('ko');
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(settings, 'https://jpdb.io/settings');
        const seed = form.querySelector<HTMLElement>('[data-catalog-recommendation-seed="en"]');

        expect(seed!.lang).toBe('en');
        expect(seed!.querySelectorAll('[data-catalog-recommendation]')).toHaveLength(recommendedDictionariesForLearnerLanguage('en').length);
        expect(seed!.querySelector('[data-catalog-recommendation="jmdict-en"]')!.getAttribute('data-translation-mode')).toBe('off');

        for (const curated of RECOMMENDED_JAPANESE_DICTIONARIES) {
            expect(form.querySelector(`[data-dictionary-id="${curated.id}"]`)).not.toBeNull();
        }
        expect(findRecommendedDictionary('jitendex')!.downloadUrl).toBe('https://dictionaries.yomureader.com/objects/sha256/807d911114af9d2154d270702972aafb2b6a6c2dc2400afa98db870d035c1a0b.zip');
    });

    it('renders Japanese recommendations for a legacy non-Japanese target profile', () => {
        const settings = settingsForLearnerLanguage('en', 'es');
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(settings, 'https://jpdb.io/settings', undefined, {
            expandCatalogBrowse: true,
        });

        const seed = form.querySelector<HTMLElement>('[data-catalog-recommendation-target="ja"]')!;
        expect(seed.querySelectorAll('[data-catalog-recommendation]')).toHaveLength(recommendedDictionariesForLearnerLanguage('en').length);
        expect(Array.from(
            seed.querySelectorAll<HTMLElement>('[data-catalog-recommendation]'),
            card => card.dataset.headwordLanguage,
        ).every(language => language === 'ja')).toBe(true);
        expect(form.querySelector('[data-dictionary-id="jitendex"]')).not.toBeNull();
        expect(form.querySelector('[data-catalog-browse-language="es"]')).toBeNull();
    });
});

function settingsForLearnerLanguage(learnerLanguage: string, targetLanguage = 'ja') {
    const profile = DEFAULT_SETTINGS.languageProfiles[0]!;
    return normalizeReaderSettings({
        ...DEFAULT_SETTINGS,
        interfaceLanguage: 'en',
        languageProfiles: [{
            ...profile,
            outputLanguage: learnerLanguage,
            learnerLanguage,
            targetLanguage,
        }],
        activeLanguageProfileId: profile.id,
    });
}
