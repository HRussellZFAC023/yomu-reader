import { describe, expect, it, vi } from 'vitest';
import { FROZEN_DICTIONARY_CATALOG, SLICE1_LEARNER_LANGUAGES } from '../../src/reader/dictionaries/catalog';
import { catalogBrowseCopy } from '../../src/reader/dictionaries/catalog-browse-copy';
import { applyCatalogBrowseFilter } from '../../src/reader/settings/catalog-browse-filter';
import {
    catalogBrowseCardId,
    catalogBrowseDictionaries,
    catalogBrowseGroups,
    catalogBrowseLanguageSections,
} from '../../src/reader/dictionaries/catalog-browse';
import {
    RECOMMENDED_JAPANESE_DICTIONARIES,
    catalogBrowseGroupsForLearnerLanguage,
    catalogBrowseLanguageSectionsForLearnerLanguage,
    findRecommendedDictionary,
    recommendedDictionariesForLearnerLanguage,
    recommendedDictionaryImportOptions,
} from '../../src/reader/dictionaries/recommended';
import { localizeSettingsForm, renderSettingsForm } from '../../src/reader/settings/form';
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../src/reader/settings';

const TARGET = FROZEN_DICTIONARY_CATALOG.targetLanguage;

const publishedEntries = FROZEN_DICTIONARY_CATALOG.entries.filter(entry => entry.distribution.state === 'published');
const publishedTargetEntries = publishedEntries.filter(entry => entry.headwordLanguages.includes(TARGET));
const uniqueTargetObjects = new Set(
    publishedTargetEntries.map(entry => (entry.distribution.state === 'published' ? entry.distribution.object.sha256 : '')),
);
const otherLanguageEntries = publishedEntries.filter(entry => !entry.headwordLanguages.includes(TARGET));

describe('mirrored dictionary catalogue browsing', () => {
    it('offers every mirrored Japanese archive exactly once on the Japanese shelf', () => {
        const dictionaries = catalogBrowseGroups().flatMap(group => group.dictionaries);
        const published = dictionaries.filter(dictionary => dictionary.sha256);

        expect(uniqueTargetObjects.size).toBeGreaterThan(100);
        expect(published).toHaveLength(uniqueTargetObjects.size);
        expect(new Set(published.map(dictionary => dictionary.sha256))).toHaveLength(uniqueTargetObjects.size);
        expect(dictionaries.every(dictionary => dictionary.headwordLanguage === TARGET)).toBe(true);
        // The starter-pack folder re-ships archives from the Japanese collection.
        // Identical bytes must not produce a second install row.
        expect(dictionaries.filter(dictionary => dictionary.catalogDictionaryId?.startsWith('drive-starter-pack-'))).toHaveLength(0);
    });

    /**
     * The mirror pays to serve Mandarin, Cantonese and Literary Chinese archives
     * that Settings used to hide, because browse membership was keyed to the
     * catalogue's target language. They belong on their own shelves, not in the
     * Japanese one and not behind a URL only the catalogue JSON knows.
     */
    it('shelves every other headword language instead of dropping it', () => {
        const sections = catalogBrowseLanguageSections();
        const offered = new Map(
            catalogBrowseDictionaries().map(dictionary => [dictionary.catalogDictionaryId, dictionary]),
        );

        expect(otherLanguageEntries.length).toBeGreaterThan(0);
        expect(sections[0]?.headwordLanguage).toBe(TARGET);
        expect(sections[0]?.isTargetLanguage).toBe(true);
        expect(sections.slice(1).every(section => !section.isTargetLanguage)).toBe(true);
        expect(sections.map(section => section.headwordLanguage)).toEqual([...new Set(sections.map(section => section.headwordLanguage))]);
        for (const entry of otherLanguageEntries) {
            const card = offered.get(entry.id);
            expect(card, entry.id).toBeDefined();
            expect(card!.headwordLanguage, entry.id).toBe(entry.headwordLanguages[0]);
        }
    });

    it('resolves every browse card by ID without colliding with the recommendation seeds', () => {
        const browse = catalogBrowseDictionaries();
        const seeds = SLICE1_LEARNER_LANGUAGES.flatMap(language => recommendedDictionariesForLearnerLanguage(language));
        const ids = [...browse, ...seeds, ...RECOMMENDED_JAPANESE_DICTIONARIES].map(dictionary => dictionary.id);

        expect(new Set(ids)).toHaveLength(ids.length);
        browse.forEach(dictionary => {
            expect(dictionary.id).toBe(catalogBrowseCardId(dictionary.headwordLanguage!, dictionary.catalogDictionaryId!));
            expect(findRecommendedDictionary(dictionary.id)).toBe(dictionary);
            // Entries the mirror has not published carry no object to install;
            // everything we do serve is fetched from the mirror, by digest.
            if (!dictionary.sha256) {
                expect(dictionary.downloadUrl, dictionary.id).toBeUndefined();
                return;
            }
            expect(dictionary.downloadUrl).toMatch(/^https:\/\/dictionaries\.yomureader\.com\/objects\/sha256\/[a-f0-9]{64}\.zip$/);
            expect(dictionary.downloadUrl).toContain(dictionary.sha256);
            expect(recommendedDictionaryImportOptions(dictionary)).toEqual({
                integrity: { sha256: dictionary.sha256, bytes: dictionary.bytes },
            });
        });
    });

    /**
     * The whole point of the panel. Every archive the mirror publishes has to be
     * reachable from Settings — as its own card, or as the byte-identical twin
     * already offered on the same shelf.
     */
    it('reaches every published catalogue entry from the Sources panel', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(settingsForLearnerLanguage('en'), 'https://jpdb.io/settings');
        const cards = [...form.querySelectorAll<HTMLElement>('[data-catalog-recommendation]')];
        const renderedIds = new Set(cards.map(card => card.dataset.catalogRecommendation));
        // Keyed by the card's own headword language, so a byte-identical twin
        // only excuses an entry when the reader meets it on the right shelf —
        // and so a preselected seed card counts as reached, like any other.
        const shelfDigests = new Map<string, Set<string>>();
        for (const card of cards) {
            const shelf = card.dataset.headwordLanguage;
            const sha256 = card.dataset.sha256;
            if (!shelf || !sha256) continue;
            const digests = shelfDigests.get(shelf) ?? new Set<string>();
            digests.add(sha256);
            shelfDigests.set(shelf, digests);
        }

        expect(publishedEntries.length).toBeGreaterThan(150);
        const unreachable = publishedEntries.filter(entry => {
            if (renderedIds.has(entry.id)) return false;
            const sha256 = entry.distribution.state === 'published' ? entry.distribution.object.sha256 : '';
            return !entry.headwordLanguages.some(language => shelfDigests.get(language)?.has(sha256));
        });

        expect(unreachable.map(entry => `${entry.headwordLanguages.join('+')} ${entry.id}`)).toEqual([]);
    });

    it('never shows the same object twice on one shelf', () => {
        for (const section of catalogBrowseLanguageSections()) {
            const digests = section.groups
                .flatMap(group => group.dictionaries)
                .map(dictionary => dictionary.sha256)
                .filter((sha256): sha256 is string => Boolean(sha256));

            expect(new Set(digests).size, section.headwordLanguage).toBe(digests.length);
        }
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
        const expected = catalogBrowseLanguageSectionsForLearnerLanguage('en')
            .flatMap(section => section.groups)
            .flatMap(group => group.dictionaries);

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

describe('shelving mirrored dictionaries the reader is not studying', () => {
    it('gives every other headword language its own labelled shelf, Japanese first', () => {
        const section = browseSection(renderedForm('en'));
        const shelves = [...section.querySelectorAll<HTMLElement>('[data-catalog-browse-language]')];
        const languages = shelves.map(shelf => shelf.dataset.catalogBrowseLanguage);

        expect(languages[0]).toBe(TARGET);
        expect(languages).toContain('zh');
        expect(languages).toContain('yue');
        expect(languages).toContain('lzh');
        expect(shelves[0]!.hasAttribute('data-catalog-browse-language-target')).toBe(true);
        expect(shelves.slice(1).some(shelf => shelf.hasAttribute('data-catalog-browse-language-target'))).toBe(false);
        expect(shelves.map(shelf => shelf.querySelector('[data-catalog-browse-language-title]')?.textContent))
            .toEqual(['Japanese', 'Chinese', 'Cantonese', 'Literary Chinese']);
    });

    /**
     * Reachable is not the same as recommended. A Cantonese dictionary a
     * Japanese reader can install must say, in the reader's own language, that
     * it is not part of the setup they are being sold above it.
     */
    it('marks the other shelves as not part of the Japanese setup', () => {
        const section = browseSection(renderedForm('en'));
        const shelves = [...section.querySelectorAll<HTMLElement>('[data-catalog-browse-language]')];
        const notes = shelves.map(shelf => shelf.querySelector('[data-catalog-browse-language-note]')?.textContent ?? null);

        expect(notes[0]).toBeNull();
        expect(notes.slice(1)).toEqual(notes.slice(1).map(() => 'These dictionaries are not for reading Japanese.'));
        expect(notes.slice(1).length).toBeGreaterThan(0);
    });

    it('never mixes another language into a Japanese category group', () => {
        const section = browseSection(renderedForm('en'));

        for (const group of section.querySelectorAll<HTMLElement>('[data-catalog-browse-group]')) {
            const shelf = group.closest<HTMLElement>('[data-catalog-browse-language]')?.dataset.catalogBrowseLanguage;
            expect(shelf, group.dataset.catalogBrowseGroup).toBeTruthy();
            for (const card of group.querySelectorAll<HTMLElement>('[data-catalog-recommendation]')) {
                const dictionary = findRecommendedDictionary(
                    card.querySelector<HTMLElement>('[data-dictionary-id]')?.dataset.dictionaryId ?? '',
                );
                expect(dictionary?.headwordLanguage, card.dataset.catalogRecommendation).toBe(shelf);
            }
        }
    });

    it('finds a Chinese-only dictionary by title, which the panel could not show at all', () => {
        const form = renderedForm('en');
        const section = browseSection(form);

        expect(applyCatalogBrowseFilter(section, '中日大辞典')).toBe(1);
        expect(visibleCardNames(section)).toEqual(['[ZH-JA] 中日大辞典　第二版']);
        expect(section.querySelector<HTMLElement>('[data-catalog-browse-empty]')?.hidden).toBe(true);
    });

    it('uses the search box as the language filter, by name and by endonym', () => {
        const form = renderedForm('en');
        const section = browseSection(form);
        const cantonese = catalogBrowseLanguageSectionsForLearnerLanguage('en')
            .find(shelf => shelf.headwordLanguage === 'yue')!
            .groups.reduce((total, group) => total + group.dictionaries.length, 0);

        expect(cantonese).toBeGreaterThan(0);
        for (const query of ['Cantonese', '粵語']) {
            expect(applyCatalogBrowseFilter(section, query), query).toBe(cantonese);
            expect(visibleShelfLanguages(section), query).toEqual(['yue']);
        }
    });

    it('matches a shelf by its BCP-47 tag as well', () => {
        const form = renderedForm('en');
        const section = browseSection(form);

        applyCatalogBrowseFilter(section, 'yue');
        const shown = [...section.querySelectorAll<HTMLElement>('[data-catalog-browse-language="yue"] [data-catalog-recommendation]')];

        // A bare tag is three letters and the panel also matches catalogue IDs,
        // so the tag can pull in a stray row; every Cantonese card is still here.
        expect(shown.length).toBeGreaterThan(0);
        expect(shown.every(card => !card.hidden)).toBe(true);
        expect(visibleShelfLanguages(section)).toContain('yue');
    });

    /**
     * The "not for reading Japanese" note is chrome, not card text. If it were
     * searchable, one search for "japanese" would return every dictionary that
     * is explicitly not Japanese.
     */
    it('keeps the shelf note out of the search haystack', () => {
        const form = renderedForm('en');
        const section = browseSection(form);
        const chineseShelf = section.querySelector<HTMLElement>('[data-catalog-browse-language="zh"]')!;
        const chineseCards = chineseShelf.querySelectorAll<HTMLElement>('[data-catalog-recommendation]');

        applyCatalogBrowseFilter(section, 'japanese');
        const stillShown = [...chineseCards].filter(card => !card.hidden);

        expect(chineseCards.length).toBeGreaterThan(30);
        // Only the Chinese-Japanese dictionaries, which really do have Japanese
        // definitions printed on the card.
        expect(stillShown.length).toBeLessThan(chineseCards.length);
        expect(stillShown.every(card => card.dataset.definitionLanguage === 'ja')).toBe(true);
        expect(stillShown.length).toBe([...chineseCards].filter(card => card.dataset.definitionLanguage === 'ja').length);
    });

    it('hides a shelf heading once its last card is filtered away', () => {
        const form = renderedForm('en');
        const section = browseSection(form);

        expect(applyCatalogBrowseFilter(section, '新選国語辞典')).toBe(1);

        expect(visibleShelfLanguages(section)).toEqual([TARGET]);

        applyCatalogBrowseFilter(section, '');
        expect([...section.querySelectorAll<HTMLElement>('[data-catalog-browse-language]')].every(shelf => !shelf.hidden)).toBe(true);
    });

    it('localizes the shelf headings and the note for a Japanese dialog', () => {
        const form = renderedForm('en');
        localizeSettingsForm(form, 'ja');
        const section = browseSection(form);
        const shelves = [...section.querySelectorAll<HTMLElement>('[data-catalog-browse-language]')];

        expect(shelves.map(shelf => shelf.querySelector('[data-catalog-browse-language-title]')?.textContent))
            .toEqual(['日本語', '中国語', '広東語', '漢文']);
        expect(shelves.slice(1).map(shelf => shelf.querySelector('[data-catalog-browse-language-note]')?.textContent))
            .toEqual(shelves.slice(1).map(() => '日本語を読むための辞書ではありません。'));
        expect(shelves[0]!.querySelector('[data-catalog-browse-language-note]')).toBeNull();
    });

    it('localizes the shelf headings for a learner language ICU cannot fully name', () => {
        const section = browseSection(renderedForm('vi'));
        const titles = [...section.querySelectorAll<HTMLElement>('[data-catalog-browse-language-title]')]
            .map(title => title.textContent);

        expect(titles[0]).toBe('Tiếng Nhật');
        expect(titles).toContain('Tiếng Quảng Đông');
        // ICU has no Vietnamese name for Literary Chinese; the language's own
        // name is still chrome a reader can use, and 'lzh' is not.
        expect(titles).toContain('文言');
        expect(titles).not.toContain('lzh');
        expect(section.querySelector('[data-catalog-browse-language-note]')?.textContent)
            .toBe(catalogBrowseCopy('vi').otherLanguageNote);
    });

    it('renders and localizes the whole panel without touching the network', () => {
        const fetchSpy = vi.fn(() => {
            throw new Error('Settings must not fetch while opening.');
        });
        vi.stubGlobal('fetch', fetchSpy);
        const openSpy = vi.spyOn(XMLHttpRequest.prototype, 'open');
        const form = renderedForm('vi');
        localizeSettingsForm(form, 'ja');
        applyCatalogBrowseFilter(browseSection(form), '粵語');

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(openSpy).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });
});

function renderedForm(learnerLanguage: string): HTMLFormElement {
    const form = document.createElement('form');
    form.innerHTML = renderSettingsForm(settingsForLearnerLanguage(learnerLanguage), 'https://jpdb.io/settings');
    return form;
}

function browseSection(form: HTMLFormElement): HTMLElement {
    const section = form.querySelector<HTMLElement>('[data-catalog-browse]');
    expect(section).not.toBeNull();
    return section!;
}

function visibleShelfLanguages(section: HTMLElement): (string | undefined)[] {
    return [...section.querySelectorAll<HTMLElement>('[data-catalog-browse-language]')]
        .filter(shelf => !shelf.hidden)
        .map(shelf => shelf.dataset.catalogBrowseLanguage);
}

function visibleCardNames(section: HTMLElement): string[] {
    return [...section.querySelectorAll<HTMLElement>('.jpdb-reader-recommended-item')]
        .filter(card => !card.hidden && !card.closest<HTMLElement>('[data-catalog-browse-group]')?.hidden)
        .map(card => card.querySelector('.jpdb-reader-recommended-name')?.textContent?.trim() ?? '');
}

function settingsForLearnerLanguage(learnerLanguage: string) {
    const profile = DEFAULT_SETTINGS.languageProfiles[0]!;
    return normalizeReaderSettings({
        ...DEFAULT_SETTINGS,
        interfaceLanguage: 'en',
        languageProfiles: [{ ...profile, learnerLanguage }],
        activeLanguageProfileId: profile.id,
    });
}
