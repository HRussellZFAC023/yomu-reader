import { describe, expect, it, vi } from 'vitest';
import {
    FROZEN_DICTIONARY_CATALOG,
    SLICE1_LEARNER_LANGUAGES,
    type DictionaryCatalogEntry,
    type DictionaryCatalogManifest,
} from '../../src/reader/dictionaries/catalog';
import {
    catalogBrowseCopy,
    catalogBrowseLanguageNote,
} from '../../src/reader/dictionaries/catalog-browse-copy';
import {
    applyCatalogBrowseFilter,
    installCatalogBrowseFilter,
} from '../../src/reader/settings/catalog-browse-filter';
import { CATALOG_BROWSE_PAGE_SIZE } from '../../src/reader/settings/catalog-browse-window';
import {
    catalogBrowseCardId,
    catalogBrowseDictionaries,
    catalogBrowseGroups,
    catalogBrowseLanguageSections,
    headwordLanguageName,
    type CatalogBrowseLanguageSection,
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

function isCurrentCatalogEntry(entry: DictionaryCatalogEntry): boolean {
    return !/(?:^|-)legacy(?:-|$)/iu.test(entry.id) && !/\blegacy\b/iu.test(entry.title);
}

describe('mirrored dictionary catalogue browsing', () => {
    it('can omit the exhaustive shelf without removing learner recommendations', () => {
        const html = renderSettingsForm(
            settingsForLearnerLanguage('en'),
            'https://jpdb.io/settings',
            undefined,
            { includeCatalogBrowse: false },
        );

        expect(html).toContain('data-catalog-recommendation-seed="en"');
        expect(html).not.toContain('data-catalog-browse');
    });

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

    it('puts the explicitly selected target first without changing the legacy catalogue default', () => {
        const sections = catalogBrowseLanguageSections({
            learnerLanguage: 'es',
            targetLanguage: 'es',
        });
        const targetSections = sections.filter(section => section.isTargetLanguage);
        const targetGroups = catalogBrowseGroups({
            learnerLanguage: 'es',
            targetLanguage: 'es',
        });

        expect(FROZEN_DICTIONARY_CATALOG.targetLanguage).toBe('ja');
        expect(sections[0]?.headwordLanguage).toBe('es');
        expect(targetSections.map(section => section.headwordLanguage)).toEqual(['es']);
        expect(targetGroups.flatMap(group => group.dictionaries)).not.toHaveLength(0);
        expect(targetGroups.flatMap(group => group.dictionaries).every(
            dictionary => dictionary.headwordLanguage === 'es',
        )).toBe(true);
        expect(catalogBrowseDictionaries(FROZEN_DICTIONARY_CATALOG, 'es')[0]?.headwordLanguage).toBe('es');
    });

    it('resolves every browse card by ID without colliding with the recommendation seeds', () => {
        const browse = catalogBrowseDictionaries();
        const seeds = SLICE1_LEARNER_LANGUAGES.flatMap(language => recommendedDictionariesForLearnerLanguage(language));
        const ids = [...browse, ...seeds, ...RECOMMENDED_JAPANESE_DICTIONARIES].map(dictionary => dictionary.id);

        expect(new Set(ids)).toHaveLength(ids.length);
        browse.forEach(dictionary => {
            expect(dictionary.id).toBe(catalogBrowseCardId(dictionary.headwordLanguage!, dictionary.catalogDictionaryId!));
            expect(findRecommendedDictionary(dictionary.id)).toBe(dictionary);
            expect(dictionary.downloadUrl, dictionary.id).toBeTruthy();
            expect(dictionary.catalogDictionaryId, dictionary.id).not.toMatch(/(?:^|-)legacy(?:-|$)/iu);
            expect(dictionary.name, dictionary.id).not.toMatch(/\blegacy\b/iu);
            // Installable upstream archives remain valid browse rows, but only
            // Yomu's content-addressed mirror can promise digest verification.
            if (!dictionary.sha256) {
                expect(dictionary.downloadUrl, dictionary.id).not.toContain('dictionaries.yomureader.com');
                expect(recommendedDictionaryImportOptions(dictionary), dictionary.id).toBeUndefined();
                return;
            }
            expect(dictionary.downloadUrl).toMatch(/^https:\/\/dictionaries\.yomureader\.com\/objects\/sha256\/[a-f0-9]{64}\.zip$/);
            expect(dictionary.downloadUrl).toContain(dictionary.sha256);
            expect(recommendedDictionaryImportOptions(dictionary)).toEqual({
                integrity: { sha256: dictionary.sha256, bytes: dictionary.bytes },
            });
        });
    });

    it('keeps direct upstream installs while excluding source-only and legacy rows', () => {
        const template = FROZEN_DICTIONARY_CATALOG.entries[0]!;
        const upstreamEntry = {
            ...template,
            id: 'synthetic-upstream',
            title: 'Synthetic upstream dictionary',
            headwordLanguages: ['ja'],
            distribution: {
                state: 'upstream',
                archive: { url: 'https://example.test/current.zip' },
            },
        } satisfies DictionaryCatalogEntry;
        const catalog = {
            ...FROZEN_DICTIONARY_CATALOG,
            entries: [upstreamEntry],
        } satisfies DictionaryCatalogManifest;

        expect(catalogBrowseDictionaries(catalog)).toMatchObject([{
            catalogDictionaryId: 'synthetic-upstream',
            downloadUrl: 'https://example.test/current.zip',
        }]);
        expect(catalogBrowseDictionaries({
            ...catalog,
            entries: [{ ...upstreamEntry, distribution: { state: 'source-only' } }],
        })).toEqual([]);
        expect(catalogBrowseDictionaries({
            ...catalog,
            entries: [{ ...upstreamEntry, id: 'synthetic-legacy' }],
        })).toEqual([]);
    });

    /**
     * The whole point of the panel. Every archive the mirror publishes has to be
     * reachable from Settings — as its own card, or as the byte-identical twin
     * already offered on the same shelf.
     */
    it('reaches every current published catalogue entry from the Sources panel', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(settingsForLearnerLanguage('en'), 'https://jpdb.io/settings');
        const browsedCards = catalogCardsAcrossPages(form);
        const seededCards = [...form.querySelectorAll<HTMLElement>(
            '[data-catalog-recommendation-seed] [data-catalog-recommendation]',
        )].map(catalogCardSnapshot);
        const cards = [...browsedCards, ...seededCards];
        const renderedIds = new Set(cards.map(card => card.catalogId));
        // Keyed by the card's own headword language, so a byte-identical twin
        // only excuses an entry when the reader meets it on the right shelf —
        // and so a preselected seed card counts as reached, like any other.
        const shelfDigests = catalogShelfDigests(cards);

        const supportedPublishedEntries = publishedEntries.filter(isCurrentCatalogEntry);
        expect(supportedPublishedEntries.length).toBeGreaterThan(150);
        const unreachable = unreachableCatalogEntries(supportedPublishedEntries, renderedIds, shelfDigests);

        expect(unreachable.map(entry => `${entry.headwordLanguages.join('+')} ${entry.id}`)).toEqual([]);
        expect(new Set(browsedCards.map(card => card.catalogId))).toEqual(new Set(
            catalogBrowseLanguageSectionsForLearnerLanguage('en')
                .flatMap(section => section.groups)
                .flatMap(group => group.dictionaries)
                .map(dictionary => dictionary.catalogDictionaryId!),
        ));
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

    it('maps catalogue pronunciation archives to pronunciation instead of pitch', () => {
        const pronunciation = catalogBrowseDictionaries().filter(
            dictionary => dictionary.catalogCategory === 'pronunciation',
        );
        const nonJapanese = pronunciation.filter(dictionary => dictionary.headwordLanguage !== 'ja');

        expect(nonJapanese.length).toBeGreaterThan(400);
        expect(pronunciation.every(dictionary => dictionary.category === 'pronunciation')).toBe(true);
        expect(pronunciation.some(dictionary => dictionary.category === 'pitch')).toBe(false);
    });

    it('keeps the whole mirror reachable without rendering it all at once', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(settingsForLearnerLanguage('en'), 'https://jpdb.io/settings');
        const browse = form.querySelector<HTMLElement>('[data-catalog-browse]')!;
        const expected = catalogBrowseLanguageSectionsForLearnerLanguage('en')
            .flatMap(section => section.groups)
            .flatMap(group => group.dictionaries);

        expect(browse.dataset.catalogBrowseCount).toBe(String(expected.length));
        expect(browse.querySelectorAll('[data-catalog-recommendation]')).toHaveLength(CATALOG_BROWSE_PAGE_SIZE);
        expect(browse.querySelectorAll('*').length).toBeLessThanOrEqual(450);
        expect(browse.querySelectorAll('[data-recommended-dictionary-guide]')).toHaveLength(0);
        expect(browse.textContent).not.toMatch(/\bJMdict Legacy\b/iu);
        expect(browse.querySelector('[data-catalog-browse-summary]')?.textContent)
            .toContain(`${new Intl.NumberFormat('en').format(expected.length)} more dictionaries`);
        // Titles the panel could not reach before: monolingual, pitch and grammar.
        for (const title of ['[JA-JA] 大辞林　第四版', '[Pitch] NHK2016', '[JA-JA Grammar] 日本語NET(nihongo_kyoushi)_v1_03']) {
            applyCatalogBrowseFilter(browse, title);
            const card = [...browse.querySelectorAll<HTMLElement>('[data-catalog-recommendation]')]
                .find(item => item.querySelector('.jpdb-reader-recommended-name')?.textContent?.trim() === title);
            expect(card, title).toBeDefined();
            expect(card!.querySelector('button[data-action="download-recommended-dictionary"]')).not.toBeNull();
        }
    });

    it('translates the mirrored-catalogue chrome instead of leaving English behind', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(settingsForLearnerLanguage('en'), 'https://jpdb.io/settings');
        localizeSettingsForm(form, 'ja');
        const section = form.querySelector<HTMLElement>('[data-catalog-browse]')!;

        expect(section.querySelector('[data-catalog-browse-title]')!.textContent).toBe('配信中のすべての辞書');
        applyCatalogBrowseFilter(section, '発音');
        expect(section.querySelector('[data-catalog-browse-category="pronunciation"]')!.textContent).toBe('発音辞書');
        applyCatalogBrowseFilter(section, '百科事典');
        expect(section.querySelector('[data-catalog-browse-category="encyclopedia"]')!.textContent).toBe('百科事典');
        expect(section.querySelector('[data-catalog-browse-summary]')!.textContent).toMatch(/^他[\d,]+件の辞書 · 合計/u);

        applyCatalogBrowseFilter(section, 'NHK2016');
        const nhk = [...section.querySelectorAll<HTMLElement>('.jpdb-reader-recommended-item')].find(
            item => item.querySelector('.jpdb-reader-recommended-name')?.textContent?.trim() === '[Pitch] NHK2016',
        );

        expect(nhk?.querySelector('.jpdb-reader-help')?.textContent).toMatch(/^日本語 · /u);
    });

    it('keeps every rendered install button wired to a resolvable dictionary', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(settingsForLearnerLanguage('ko'), 'https://jpdb.io/settings');
        const buttons = form.querySelectorAll<HTMLElement>('[data-catalog-browse] button[data-action="download-recommended-dictionary"]');

        expect(buttons.length).toBeGreaterThan(0);
        expect(buttons.length).toBeLessThanOrEqual(CATALOG_BROWSE_PAGE_SIZE);
        buttons.forEach(button => {
            expect(findRecommendedDictionary(button.dataset.dictionaryId ?? '')).toBeDefined();
        });
    });
});

describe('shelving mirrored dictionaries by selected target', () => {
    it('renders the Spanish target shelf first with positive Spanish copy', () => {
        const section = browseSection(renderedForm('es', 'es'));
        const shelves = [...section.querySelectorAll<HTMLElement>('[data-catalog-browse-language]')];
        const spanish = shelves[0]!;

        expect(spanish.dataset.catalogBrowseLanguage).toBe('es');
        expect(spanish.hasAttribute('data-catalog-browse-language-target')).toBe(true);
        expect(spanish.querySelector('[data-catalog-browse-language-note]')?.textContent)
            .toBe('Diccionarios para leer en español.');
        expect(section.textContent).not.toContain('Estos diccionarios no sirven para leer japonés');
    });

    it('gives every other headword language its own labelled shelf, Japanese first', () => {
        const section = browseSection(renderedForm('en'));
        const modelSections = catalogBrowseLanguageSectionsForLearnerLanguage('en');
        const languages = modelSections.map(model => model.headwordLanguage);

        expect(languages[0]).toBe(TARGET);
        expect(languages).toContain('zh');
        expect(languages).toContain('yue');
        expect(languages).toContain('lzh');
        // The Wiktionary-derived shelves: a learner of one of these can install
        // a dictionary for it without anything having been mirrored.
        for (const language of ['es', 'fr', 'de', 'ru', 'ko', 'vi']) expect(languages).toContain(language);
        for (const model of modelSections) {
            const shelf = renderModelShelf(section, model);
            expect(shelf.hasAttribute('data-catalog-browse-language-target'), model.headwordLanguage)
                .toBe(model.isTargetLanguage);
            expect(shelf.querySelector('[data-catalog-browse-language-title]')?.textContent)
                .toBe(headwordLanguageName(model.headwordLanguage, 'en'));
        }
    });

    it('describes every shelf positively by the language it can read', () => {
        const section = browseSection(renderedForm('en'));
        const copy = catalogBrowseCopy('en');

        const notes = catalogBrowseLanguageSectionsForLearnerLanguage('en').map(model => {
            const shelf = renderModelShelf(section, model);
            const note = shelf.querySelector('[data-catalog-browse-language-note]')?.textContent ?? null;
            expect(note, model.headwordLanguage).toBe(catalogBrowseLanguageNote(
                copy,
                headwordLanguageName(model.headwordLanguage, 'en'),
            ));
            return note;
        });
        expect(notes[0]).toBe('Dictionaries for reading Japanese.');
        expect(notes.join(' ')).not.toContain('not for reading');
    });

    it('never mixes another language into a Japanese category group', () => {
        const section = browseSection(renderedForm('en'));

        for (const group of section.querySelectorAll<HTMLElement>('[data-catalog-browse-group]')) {
            const shelf = group.closest<HTMLElement>('[data-catalog-browse-language]')!.dataset.catalogBrowseLanguage;
            expect(shelf, group.dataset.catalogBrowseGroup).toBeTruthy();
            for (const card of group.querySelectorAll<HTMLElement>('[data-catalog-recommendation]')) {
                const dictionary = findRecommendedDictionary(
                    card.querySelector<HTMLElement>('[data-dictionary-id]')!.dataset.dictionaryId!,
                );
                expect(dictionary!.headwordLanguage, card.dataset.catalogRecommendation).toBe(shelf);
            }
        }
    });

    it('finds a Chinese-only dictionary by title, which the panel could not show at all', () => {
        const form = renderedForm('en');
        const section = browseSection(form);

        expect(visibleCardNames(section)).not.toContain('[ZH-JA] 中日大辞典　第二版');
        expect(applyCatalogBrowseFilter(section, '中日大辞典')).toBe(1);
        expect(visibleCardNames(section)).toEqual(['[ZH-JA] 中日大辞典　第二版']);
        expect(section.querySelector<HTMLElement>('[data-catalog-browse-empty]')?.hidden).toBe(true);
    });

    it('uses the search box as the language filter, by name and by endonym', () => {
        const form = renderedForm('en');
        const section = browseSection(form);
        const cantonese = catalogBrowseDictionaries().filter(dictionary => dictionary.headwordLanguage === 'yue').length;

        expect(cantonese).toBeGreaterThan(0);
        for (const query of ['Cantonese', '粵語']) {
            expect(applyCatalogBrowseFilter(section, query), query).toBeGreaterThanOrEqual(cantonese);
            expect(visibleShelfLanguages(section), query).toContain('yue');
            const renderedCantonese = [
                ...section.querySelectorAll<HTMLElement>(
                    '[data-catalog-browse-language="yue"] .jpdb-reader-recommended-item',
                ),
            ];
            expect(renderedCantonese.length, query).toBeGreaterThan(0);
            expect(renderedCantonese.every(card => !card.hidden), query).toBe(true);
            expect(section.querySelectorAll('[data-catalog-recommendation]').length, query)
                .toBeLessThanOrEqual(CATALOG_BROWSE_PAGE_SIZE);
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

    /** Shelf captions are chrome, not card text, and stay out of search. */
    it('keeps the shelf note out of the search haystack', () => {
        const form = renderedForm('en');
        const section = browseSection(form);
        const chineseCards = catalogBrowseDictionaries().filter(dictionary => dictionary.headwordLanguage === 'zh');
        const matchingChinese = catalogCardsForQuery(section, 'japanese')
            .filter(card => card.headwordLanguage === 'zh')
            .map(card => findRecommendedDictionary(card.dictionaryId)!);

        expect(chineseCards.length).toBeGreaterThan(30);
        // Only the Chinese-Japanese dictionaries, which really do have Japanese
        // definitions printed on the card.
        expect(matchingChinese.length).toBeLessThan(chineseCards.length);
        expect(matchingChinese.length).toBeGreaterThan(0);
        expect(matchingChinese.every(dictionary => dictionary.definitionLanguage === 'ja')).toBe(true);
        expect(matchingChinese.length).toBe(chineseCards.filter(dictionary => dictionary.definitionLanguage === 'ja').length);
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

        for (const model of catalogBrowseLanguageSectionsForLearnerLanguage('en')) {
            const shelf = renderModelShelf(section, model);
            expect(shelf.querySelector('[data-catalog-browse-language-title]')!.textContent, model.headwordLanguage)
                .toBe(headwordLanguageName(model.headwordLanguage, 'ja'));
            expect(shelf.querySelector('[data-catalog-browse-language-note]')!.textContent, model.headwordLanguage)
                .toBe(`${headwordLanguageName(model.headwordLanguage, 'ja')}を読むための辞書です。`);
        }
    });

    it('localizes the shelf headings for a learner language ICU cannot fully name', () => {
        const section = browseSection(renderedForm('vi'));
        const models = new Map(
            catalogBrowseLanguageSectionsForLearnerLanguage('vi')
                .map(model => [model.headwordLanguage, model]),
        );
        const japanese = renderModelShelf(
            section,
            models.get('ja')!,
        );
        const cantonese = renderModelShelf(
            section,
            models.get('yue')!,
        );
        const literaryChinese = renderModelShelf(
            section,
            models.get('lzh')!,
        );

        expect(japanese.querySelector('[data-catalog-browse-language-title]')!.textContent).toBe('Tiếng Nhật');
        expect(cantonese.querySelector('[data-catalog-browse-language-title]')!.textContent).toBe('Tiếng Quảng Đông');
        // ICU has no Vietnamese name for Literary Chinese; the language's own
        // name is still chrome a reader can use, and 'lzh' is not.
        expect(literaryChinese.querySelector('[data-catalog-browse-language-title]')!.textContent).toBe('文言');
        expect(literaryChinese.textContent).not.toContain('lzh');
        expect(japanese.querySelector('[data-catalog-browse-language-note]')!.textContent)
            .toBe(catalogBrowseLanguageNote(catalogBrowseCopy('vi'), headwordLanguageName(TARGET, 'vi')));
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

function renderedForm(learnerLanguage: string, targetLanguage = 'ja'): HTMLFormElement {
    const form = document.createElement('form');
    form.innerHTML = renderSettingsForm(
        settingsForLearnerLanguage(learnerLanguage, targetLanguage),
        'https://jpdb.io/settings',
    );
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

interface RenderedCatalogCard {
    catalogId: string;
    dictionaryId: string;
    headwordLanguage: string;
    sha256: string | undefined;
}

function catalogCardsAcrossPages(form: HTMLFormElement): RenderedCatalogCard[] {
    installCatalogBrowseFilter(form);
    const section = browseSection(form);
    const total = Number(section.dataset.catalogBrowseCount);
    const pages = Math.ceil(total / CATALOG_BROWSE_PAGE_SIZE);
    const cards = new Map<string, RenderedCatalogCard>();

    for (let page = 0; page < pages; page++) {
        collectCatalogPage(section, cards, page);

        const next = section.querySelector<HTMLButtonElement>('[data-catalog-browse-page="next"]');
        if (page === pages - 1) {
            expect(next).toBeNull();
            continue;
        }
        expect(next, `page ${page + 1}`).not.toBeNull();
        next!.click();
        expect(section.dataset.catalogBrowseOffset).toBe(String((page + 1) * CATALOG_BROWSE_PAGE_SIZE));
    }

    expect(cards.size).toBe(total);
    return [...cards.values()];
}

function collectCatalogPage(
    section: HTMLElement,
    cards: Map<string, RenderedCatalogCard>,
    page: number,
): void {
    const rendered = [...section.querySelectorAll<HTMLElement>('[data-catalog-recommendation]')];
    expect(rendered.length, `page ${page + 1}`).toBeGreaterThan(0);
    expect(rendered.length, `page ${page + 1}`).toBeLessThanOrEqual(CATALOG_BROWSE_PAGE_SIZE);
    expect(section.querySelectorAll('*').length, `page ${page + 1}`).toBeLessThanOrEqual(450);
    for (const element of rendered) {
        const card = catalogCardSnapshot(element);
        cards.set(card.catalogId, card);
        const dictionary = findRecommendedDictionary(card.dictionaryId);
        expect(dictionary, card.catalogId).toBeDefined();
        expect(dictionary!.headwordLanguage, card.catalogId).toBe(card.headwordLanguage);
    }
}

function catalogCardsForQuery(section: HTMLElement, query: string): RenderedCatalogCard[] {
    const total = applyCatalogBrowseFilter(section, query, 0);
    const cards: RenderedCatalogCard[] = [];
    for (let offset = 0; offset < total; offset += CATALOG_BROWSE_PAGE_SIZE) {
        applyCatalogBrowseFilter(section, query, offset);
        const rendered = [...section.querySelectorAll<HTMLElement>('[data-catalog-recommendation]')];
        expect(rendered.length).toBeLessThanOrEqual(CATALOG_BROWSE_PAGE_SIZE);
        expect(section.querySelectorAll('*').length).toBeLessThanOrEqual(450);
        cards.push(...rendered.map(catalogCardSnapshot));
    }
    return cards;
}

function catalogCardSnapshot(element: HTMLElement): RenderedCatalogCard {
    return {
        catalogId: element.dataset.catalogRecommendation ?? '',
        dictionaryId: element.querySelector<HTMLElement>('[data-dictionary-id]')?.dataset.dictionaryId ?? '',
        headwordLanguage: element.dataset.headwordLanguage ?? '',
        sha256: element.dataset.sha256,
    };
}

function catalogShelfDigests(cards: readonly RenderedCatalogCard[]): Map<string, Set<string>> {
    const digests = new Map<string, Set<string>>();
    for (const card of cards) addCatalogCardDigest(digests, card);
    return digests;
}

function addCatalogCardDigest(digests: Map<string, Set<string>>, card: RenderedCatalogCard): void {
    if (!card.headwordLanguage || !card.sha256) return;
    const shelf = digests.get(card.headwordLanguage) ?? new Set<string>();
    shelf.add(card.sha256);
    digests.set(card.headwordLanguage, shelf);
}

function unreachableCatalogEntries(
    entries: readonly DictionaryCatalogEntry[],
    renderedIds: ReadonlySet<string>,
    shelfDigests: ReadonlyMap<string, ReadonlySet<string>>,
): DictionaryCatalogEntry[] {
    return entries.filter(entry => !catalogEntryReached(entry, renderedIds, shelfDigests));
}

function catalogEntryReached(
    entry: DictionaryCatalogEntry,
    renderedIds: ReadonlySet<string>,
    shelfDigests: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
    if (renderedIds.has(entry.id)) return true;
    const sha256 = publishedCatalogEntrySha(entry);
    return entry.headwordLanguages.some(language => shelfDigests.get(language)?.has(sha256) === true);
}

function publishedCatalogEntrySha(entry: DictionaryCatalogEntry): string {
    return entry.distribution.state === 'published' ? entry.distribution.object.sha256 : '';
}

function renderModelShelf(section: HTMLElement, model: CatalogBrowseLanguageSection): HTMLElement {
    const dictionaryId = model.groups[0]?.dictionaries[0]?.catalogDictionaryId;
    expect(dictionaryId, model.headwordLanguage).toBeTruthy();
    expect(applyCatalogBrowseFilter(section, dictionaryId!), model.headwordLanguage).toBeGreaterThan(0);
    const shelf = [...section.querySelectorAll<HTMLElement>('[data-catalog-browse-language]')]
        .find(candidate => candidate.dataset.catalogBrowseLanguage === model.headwordLanguage);
    expect(shelf, model.headwordLanguage).toBeDefined();
    return shelf!;
}

function settingsForLearnerLanguage(learnerLanguage: string, targetLanguage = 'ja') {
    const profile = DEFAULT_SETTINGS.languageProfiles[0]!;
    return normalizeReaderSettings({
        ...DEFAULT_SETTINGS,
        interfaceLanguage: 'en',
        languageProfiles: [{ ...profile, targetLanguage, outputLanguage: learnerLanguage }],
        activeLanguageProfileId: profile.id,
    });
}
