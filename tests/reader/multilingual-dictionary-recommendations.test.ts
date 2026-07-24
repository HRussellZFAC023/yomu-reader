import { describe, expect, it } from 'vitest';
import { FROZEN_DICTIONARY_CATALOG, SLICE1_LEARNER_LANGUAGES, sha256FromDictionaryObjectKey } from '../../src/reader/dictionaries/catalog';
import { RECOMMENDED_JAPANESE_DICTIONARIES, catalogRecommendedDictionaryId, findRecommendedDictionary, recommendedDictionariesForLearnerLanguage } from '../../src/reader/dictionaries/recommended';
import { renderSettingsForm } from '../../src/reader/settings/form';
import { normalizeReaderSettings, DEFAULT_SETTINGS } from '../../src/reader/settings';

describe('Slice 1 multilingual dictionary recommendations', () => {
    it('uses explicit English fallback dictionaries with a translation offer for Korean', () => {
        const korean = recommendedDictionariesForLearnerLanguage('ko');

        expect(korean).toHaveLength(3);
        expect(
            korean.map(dictionary => ({
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

        expect(ancientGreek).toHaveLength(3);
        expect(ancientGreek.every(dictionary => dictionary.translationMode === 'off')).toBe(true);
        expect(ancientGreek.every(dictionary => !dictionary.description?.includes(' · '))).toBe(true);
    });

    it('gives all 32 language cards stable unique IDs and matching content-addressed URLs', () => {
        const cards = SLICE1_LEARNER_LANGUAGES.flatMap(language => recommendedDictionariesForLearnerLanguage(language));
        const catalogEntries = new Map(FROZEN_DICTIONARY_CATALOG.entries.map(entry => [entry.id, entry]));

        expect(cards).toHaveLength(96);
        expect(new Set(cards.map(dictionary => dictionary.id))).toHaveLength(96);
        cards.forEach(dictionary => {
            expect(dictionary.id).toBe(catalogRecommendedDictionaryId(dictionary.learnerLanguage!, dictionary.catalogDictionaryId!));
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

    it('renders the active learner-language seed before preserving every curated Japanese card', () => {
        const settings = settingsForLearnerLanguage('ko');
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(settings, 'https://jpdb.io/settings');
        const seed = form.querySelector<HTMLElement>('[data-catalog-recommendation-seed="ko"]');

        expect(seed?.lang).toBe('ko');
        expect(seed?.querySelector('.jpdb-reader-catalog-seed-title')?.textContent).toBe('추천 일본어 사전');
        expect(seed?.querySelector('.jpdb-reader-catalog-seed-summary')?.textContent).toContain('사전 3개');
        expect(seed?.querySelectorAll('[data-catalog-recommendation]')).toHaveLength(3);
        expect(seed?.querySelector('[data-catalog-recommendation="jmdict-en"]')?.getAttribute('data-translation-mode')).toBe('offer');

        for (const curated of RECOMMENDED_JAPANESE_DICTIONARIES) {
            expect(form.querySelector(`[data-dictionary-id="${curated.id}"]`)).not.toBeNull();
        }
        expect(findRecommendedDictionary('jitendex')?.downloadUrl).toBe('https://github.com/stephenmk/stephenmk.github.io/releases/latest/download/jitendex-yomitan.zip');
    });
});

function settingsForLearnerLanguage(learnerLanguage: string) {
    const profile = DEFAULT_SETTINGS.languageProfiles[0]!;
    return normalizeReaderSettings({
        ...DEFAULT_SETTINGS,
        interfaceLanguage: 'en',
        languageProfiles: [{ ...profile, learnerLanguage }],
        activeLanguageProfileId: profile.id,
    });
}
