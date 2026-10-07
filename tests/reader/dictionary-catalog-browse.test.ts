import { describe, expect, it } from 'vitest';
import {
    FROZEN_DICTIONARY_CATALOG,
    SLICE1_LEARNER_LANGUAGES,
    type DictionaryCatalogEntry,
    type DictionaryCatalogManifest,
} from '../../src/reader/dictionaries/catalog';

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
        // The hand-picked Japanese cards install mirror archives too, so the
        // browse leaves those out rather than offering them twice.
        const curatedCards = RECOMMENDED_JAPANESE_DICTIONARIES
            .filter(dictionary => dictionary.sha256 && form.querySelector(`[data-dictionary-id="${dictionary.id}"]`))
            .map(dictionary => ({ catalogId: '', dictionaryId: dictionary.id, headwordLanguage: 'ja', sha256: dictionary.sha256 }));
        expect(curatedCards).toHaveLength(5);
        const cards = [...browsedCards, ...seededCards, ...curatedCards];
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

function browseSection(form: HTMLFormElement): HTMLElement {
    const section = form.querySelector<HTMLElement>('[data-catalog-browse]');
    expect(section).not.toBeNull();
    return section!;
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

function settingsForLearnerLanguage(learnerLanguage: string, targetLanguage = 'ja') {
    const profile = DEFAULT_SETTINGS.languageProfiles[0]!;
    return normalizeReaderSettings({
        ...DEFAULT_SETTINGS,
        interfaceLanguage: 'en',
        languageProfiles: [{ ...profile, targetLanguage, outputLanguage: learnerLanguage }],
        activeLanguageProfileId: profile.id,
    });
}
