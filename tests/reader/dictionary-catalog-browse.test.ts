import { describe, expect, it } from 'vitest';
import { FROZEN_DICTIONARY_CATALOG, SLICE1_LEARNER_LANGUAGES } from '../../src/reader/dictionaries/catalog';
import { catalogBrowseCardId, catalogBrowseDictionaries, catalogBrowseGroups } from '../../src/reader/dictionaries/catalog-browse';
import {
    RECOMMENDED_JAPANESE_DICTIONARIES,
    catalogBrowseGroupsForLearnerLanguage,
    findRecommendedDictionary,
    recommendedDictionariesForLearnerLanguage,
    recommendedDictionaryImportOptions,
} from '../../src/reader/dictionaries/recommended';
import { localizeSettingsForm, renderSettingsForm } from '../../src/reader/settings/form';
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../src/reader/settings';

const TARGET = FROZEN_DICTIONARY_CATALOG.targetLanguage;

const publishedTargetEntries = FROZEN_DICTIONARY_CATALOG.entries.filter(
    entry => entry.headwordLanguages.includes(TARGET) && entry.distribution.state === 'published',
);
const uniqueTargetObjects = new Set(
    publishedTargetEntries.map(entry => (entry.distribution.state === 'published' ? entry.distribution.object.sha256 : '')),
);

describe('mirrored dictionary catalogue browsing', () => {
    it('offers every mirrored Japanese archive exactly once', () => {
        const dictionaries = catalogBrowseDictionaries();

        expect(uniqueTargetObjects.size).toBeGreaterThan(100);
        expect(dictionaries).toHaveLength(uniqueTargetObjects.size);
        expect(new Set(dictionaries.map(dictionary => dictionary.sha256))).toHaveLength(uniqueTargetObjects.size);
        // The starter-pack folder re-ships archives from the Japanese collection.
        // Identical bytes must not produce a second install row.
        expect(dictionaries.filter(dictionary => dictionary.catalogDictionaryId?.startsWith('drive-starter-pack-'))).toHaveLength(0);
    });

    it('leaves dictionaries for other headword languages out of a Japanese reader', () => {
        const offered = new Set(catalogBrowseDictionaries().map(dictionary => dictionary.catalogDictionaryId));
        const otherLanguageEntries = FROZEN_DICTIONARY_CATALOG.entries.filter(entry => !entry.headwordLanguages.includes(TARGET));

        expect(otherLanguageEntries.length).toBeGreaterThan(0);
        expect(otherLanguageEntries.some(entry => offered.has(entry.id))).toBe(false);
    });

    it('resolves every browse card by ID without colliding with the recommendation seeds', () => {
        const browse = catalogBrowseDictionaries();
        const seeds = SLICE1_LEARNER_LANGUAGES.flatMap(language => recommendedDictionariesForLearnerLanguage(language));
        const ids = [...browse, ...seeds, ...RECOMMENDED_JAPANESE_DICTIONARIES].map(dictionary => dictionary.id);

        expect(new Set(ids)).toHaveLength(ids.length);
        browse.forEach(dictionary => {
            expect(dictionary.id).toBe(catalogBrowseCardId(TARGET, dictionary.catalogDictionaryId!));
            expect(findRecommendedDictionary(dictionary.id)).toBe(dictionary);
            expect(dictionary.downloadUrl).toMatch(/^https:\/\/dictionaries\.yomureader\.com\/objects\/sha256\/[a-f0-9]{64}\.zip$/);
            expect(dictionary.downloadUrl).toContain(dictionary.sha256);
            expect(recommendedDictionaryImportOptions(dictionary)).toEqual({
                integrity: { sha256: dictionary.sha256, bytes: dictionary.bytes },
            });
        });
    });

    it('never repeats a learner language’s preselected seed in the browse list', () => {
        for (const language of ['en', 'de', 'ko'] as const) {
            const seeded = recommendedDictionariesForLearnerLanguage(language).map(dictionary => dictionary.catalogDictionaryId);
            const browsed = catalogBrowseGroupsForLearnerLanguage(language)
                .flatMap(group => group.dictionaries)
                .map(dictionary => dictionary.catalogDictionaryId);

            expect(seeded.length).toBeGreaterThan(0);
            expect(browsed.filter(id => seeded.includes(id))).toEqual([]);
        }
    });

    it('ranks native definitions above Japanese and English inside a group', () => {
        const german = catalogBrowseGroups({ learnerLanguage: 'de' }).find(group => group.category === 'terms');
        const languages = german!.dictionaries.map(dictionary => dictionary.definitionLanguage);
        const firstIndexOf = (language: string) => languages.indexOf(language);

        expect(firstIndexOf('de')).toBe(0);
        expect(firstIndexOf('ja')).toBeGreaterThan(0);
        expect(firstIndexOf('ja')).toBeLessThan(firstIndexOf('en'));
    });

    it('groups the mirror by catalogue category instead of the four legacy buckets', () => {
        const categories = catalogBrowseGroups().map(group => group.category);

        expect(categories).toContain('pronunciation');
        expect(categories).toContain('grammar');
        expect(categories).toContain('encyclopedia');
        expect(categories).toContain('thesaurus');
        expect(categories.indexOf('terms')).toBeLessThan(categories.indexOf('kanji'));
    });

    it('lists the whole mirror in the Sources panel, not just the recommended handful', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(settingsForLearnerLanguage('en'), 'https://jpdb.io/settings');
        const browse = form.querySelector<HTMLElement>('[data-catalog-browse]');
        const rendered = browse!.querySelectorAll('[data-catalog-recommendation]');
        const expected = catalogBrowseGroupsForLearnerLanguage('en').flatMap(group => group.dictionaries);

        expect(rendered).toHaveLength(expected.length);
        expect(rendered.length).toBeGreaterThan(100);
        expect(browse!.querySelector('[data-catalog-browse-summary]')?.textContent).toContain(`${expected.length} more dictionaries`);
        // Titles the panel could not reach before: monolingual, pitch and grammar.
        for (const title of ['[JA-JA] 大辞林　第四版', '[Pitch] NHK2016', '[JA-JA Grammar] 日本語NET(nihongo_kyoushi)_v1_03']) {
            const card = [...rendered].find(item => item.querySelector('.jpdb-reader-recommended-name')?.textContent?.trim() === title);
            expect(card, title).toBeDefined();
            expect(card!.querySelector('button[data-action="download-recommended-dictionary"]')).not.toBeNull();
        }
    });

    it('translates the mirrored-catalogue chrome instead of leaving English behind', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(settingsForLearnerLanguage('en'), 'https://jpdb.io/settings');
        localizeSettingsForm(form, 'ja');
        const section = form.querySelector<HTMLElement>('[data-catalog-browse]')!;

        expect(section.querySelector('[data-catalog-browse-title]')?.textContent).toBe('配信中のすべての辞書');
        expect(section.querySelector('[data-catalog-browse-category="pronunciation"]')?.textContent).toBe('ピッチ辞書');
        expect(section.querySelector('[data-catalog-browse-category="encyclopedia"]')?.textContent).toBe('百科事典');
        expect(section.querySelector('[data-catalog-browse-summary]')?.textContent).toMatch(/^他[\d,]+件の辞書 · 合計/u);

        const nhk = [...section.querySelectorAll<HTMLElement>('.jpdb-reader-recommended-item')].find(
            item => item.querySelector('.jpdb-reader-recommended-name')?.textContent?.trim() === '[Pitch] NHK2016',
        );

        expect(nhk?.querySelector('.jpdb-reader-help')?.textContent).toMatch(/^日本語 · /u);
    });

    it('keeps every rendered install button wired to a resolvable dictionary', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(settingsForLearnerLanguage('ko'), 'https://jpdb.io/settings');
        const buttons = form.querySelectorAll<HTMLElement>('[data-catalog-browse] button[data-action="download-recommended-dictionary"]');

        expect(buttons.length).toBeGreaterThan(100);
        buttons.forEach(button => {
            expect(findRecommendedDictionary(button.dataset.dictionaryId ?? '')).toBeDefined();
        });
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
