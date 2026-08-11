import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FROZEN_DICTIONARY_CATALOG, SLICE1_LEARNER_LANGUAGES, SLICE1_TARGET_LANGUAGES, parseDictionaryRecommendationManifest, sha256FromDictionaryObjectKey } from '../../src/reader/dictionaries/catalog';
import { RECOMMENDED_JAPANESE_DICTIONARIES, catalogRecommendedDictionaryId, findRecommendedDictionary, recommendedDictionariesForLanguageProfile, recommendedDictionariesForLearnerLanguage } from '../../src/reader/dictionaries/recommended';
import { renderSettingsForm } from '../../src/reader/settings/form';
import { normalizeReaderSettings, DEFAULT_SETTINGS } from '../../src/reader/settings';
import { LEARNING_TARGET_ROSTER } from '../../src/reader/languages';

describe('Slice 1 multilingual dictionary recommendations', () => {
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

    it('routes an English learner reading Spanish to Spanish-headword terms and IPA', () => {
        const spanish = recommendedDictionariesForLanguageProfile('en', 'es');

        expect(spanish.map(dictionary => dictionary.catalogDictionaryId)).toEqual([
            'wty-es-en',
            'wty-es-en-ipa',
        ]);
        expect(spanish.map(dictionary => dictionary.category)).toEqual(['terms', 'pronunciation']);
        expect(spanish.every(dictionary => dictionary.headwordLanguage === 'es')).toBe(true);
        expect(spanish.every(dictionary => !['jmdict-es', 'jmnedict', 'kanjidic-es'].includes(dictionary.catalogDictionaryId ?? '')))
            .toBe(true);
        expect(spanish.every(dictionary => dictionary.selectedByDefault)).toBe(true);
    });

    it('derives a usable native-headword starter for every reading-ready learner-target pair', () => {
        const ids = new Set<string>();
        const pairs = LEARNING_TARGET_ROSTER
            .filter(target => target.studyTargetReadiness !== 'planned')
            .flatMap(target => SLICE1_LEARNER_LANGUAGES.map(learner => ({ learner, target })));
        for (const { learner, target } of pairs) {
            const dictionaries = recommendedDictionariesForLanguageProfile(learner, target.id);
            const defaults = dictionaries.filter(dictionary => dictionary.selectedByDefault !== false);
            expect(defaults.length, `${learner}-${target.id}`).toBeGreaterThan(0);
            expect(defaults.every(dictionary => dictionary.headwordLanguage === target.id), `${learner}-${target.id}`)
                .toBe(true);
            for (const dictionary of dictionaries) {
                expect(dictionary.headwordLanguage, dictionary.id).toBe(target.id);
                expect(ids.has(dictionary.id), dictionary.id).toBe(false);
                ids.add(dictionary.id);
            }
        }
    });

    it('keeps every compact-runtime pair aligned with its published manifest', async () => {
        const publishedRoot = resolve(process.cwd(), 'config/dictionaries/published/v1/recommendations');
        await Promise.all(
            SLICE1_TARGET_LANGUAGES
                .flatMap(targetLanguage => SLICE1_LEARNER_LANGUAGES.map(async learnerLanguage => {
                    const manifest = parseDictionaryRecommendationManifest(JSON.parse(
                        await readFile(resolve(publishedRoot, `${learnerLanguage}-${targetLanguage}.json`), 'utf8'),
                    ));
                    const runtime = recommendedDictionariesForLanguageProfile(learnerLanguage, targetLanguage);
                    expect(
                        runtime.map(dictionary => ({
                            dictionaryId: dictionary.catalogDictionaryId,
                            role: dictionary.role,
                            selectedByDefault: dictionary.selectedByDefault,
                            definitionLanguage: dictionary.definitionLanguage,
                            translationMode: dictionary.translationMode,
                        })),
                        `${learnerLanguage}-${targetLanguage}`,
                    ).toEqual(manifest.dictionaries.map(dictionary => ({
                        dictionaryId: dictionary.dictionaryId,
                        role: dictionary.role,
                        selectedByDefault: dictionary.selectedByDefault,
                        definitionLanguage: dictionary.definitionLanguage,
                        translationMode: dictionary.translationMode,
                    })));
                })),
        );
    }, 30_000);

    it('gives all 32 language cards stable unique IDs and matching content-addressed URLs', () => {
        const cards = SLICE1_LEARNER_LANGUAGES.flatMap(language => recommendedDictionariesForLearnerLanguage(language));
        const catalogEntries = new Map(FROZEN_DICTIONARY_CATALOG.entries.map(entry => [entry.id, entry]));

        expect(cards).toHaveLength(SLICE1_LEARNER_LANGUAGES.length * 8);
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

    it('renders the active learner-language seed before preserving every curated Japanese card', () => {
        const settings = settingsForLearnerLanguage('ko');
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(settings, 'https://jpdb.io/settings');
        const seed = form.querySelector<HTMLElement>('[data-catalog-recommendation-seed="ko"]');

        expect(seed!.lang).toBe('ko');
        expect(seed!.querySelector('.jpdb-reader-catalog-seed-title')!.textContent).toBe('추천 일본어 사전');
        expect(seed!.querySelector('.jpdb-reader-catalog-seed-summary')!.textContent).toContain('사전 8개');
        expect(seed!.querySelectorAll('[data-catalog-recommendation]')).toHaveLength(8);
        expect(seed!.querySelector('[data-catalog-recommendation="jmdict-en"]')!.getAttribute('data-translation-mode')).toBe('offer');

        for (const curated of RECOMMENDED_JAPANESE_DICTIONARIES) {
            expect(form.querySelector(`[data-dictionary-id="${curated.id}"]`)).not.toBeNull();
        }
        expect(findRecommendedDictionary('jitendex')!.downloadUrl).toBe('https://github.com/stephenmk/stephenmk.github.io/releases/latest/download/jitendex-yomitan.zip');
    });

    it('renders the selected target seed without offering curated Japanese defaults', () => {
        const settings = settingsForLearnerLanguage('en', 'es');
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(settings, 'https://jpdb.io/settings', undefined, {
            expandCatalogBrowse: true,
        });

        const seed = form.querySelector<HTMLElement>('[data-catalog-recommendation-target="es"]')!;
        expect(seed.querySelectorAll('[data-catalog-recommendation]')).toHaveLength(2);
        expect(Array.from(
            seed.querySelectorAll<HTMLElement>('[data-catalog-recommendation]'),
            card => card.dataset.headwordLanguage,
        )).toEqual(['es', 'es']);
        expect(form.querySelector('[data-dictionary-id="jitendex"]')).toBeNull();
        expect(form.querySelector('[data-catalog-browse-language="es"]')
            ?.hasAttribute('data-catalog-browse-language-target')).toBe(true);
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

// MEASURED 2026-08-03. `wty-yue-en` is 28,109 bytes — a Wiktionary Cantonese
// extraction with almost nothing in it — and the selector preferred the canonical
// `wty-<target>-<definitions>` id over everything else, so that is what a Cantonese
// learner installed. It is the whole of yue's 0/47 in the multilingual parity
// baseline, against a roster average of 84.2%: not a segmentation problem, not a
// missing capability, an empty dictionary recommended by name.
//
// Content decides within the definition-language rank now. That is not a Cantonese
// special case — simulated over all 1,056 learner/target pairs it moves exactly two,
// because Wiktionary already IS the largest archive nearly everywhere. No
// threshold-free predicate isolates the degenerate case: preferring a >50x larger
// alternative would move 564 pairs, and "terms smaller than its pronunciation
// companion" 339, because a smaller archive in the learner's OWN language is
// usually the correct choice and must keep winning on definition language first.
describe('a recommendation has to contain something', () => {
    it('gives Cantonese the Words.hk dictionary instead of an empty Wiktionary extract', () => {
        const [terms] = recommendedDictionariesForLanguageProfile('en', 'yue');
        expect(terms.id).toBe(catalogRecommendedDictionaryId('en', 'yue', 'drive-cantonese-yue-en-yue-words-hk-2026-07-22-hietpkiipw'));
        expect(terms.bytes ?? 0).toBeGreaterThan(10_000_000);
        // The archive it replaced is still in the catalogue and still nearly empty;
        // this is what the old canonical-id preference chose.
        expect(findRecommendedDictionary(catalogRecommendedDictionaryId('en', 'yue', 'wty-yue-en'))?.bytes ?? 0)
            .toBeLessThan(100_000);
    });

    it('still prefers the learner\'s own definition language over a larger archive', () => {
        // The load-bearing half of the ordering: size only breaks ties WITHIN a
        // definition-language rank. A Spanish speaker studying Chinese must not be
        // handed a 106 MB Chinese-Chinese dictionary just because it is bigger.
        const [terms] = recommendedDictionariesForLanguageProfile('es', 'zh');
        expect(terms.definitionLanguage).toBe('es');
    });
});
