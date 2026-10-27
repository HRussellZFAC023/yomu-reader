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
import { afterEach, vi } from "vitest";
import { catalogBrowseCopy } from "../../src/reader/dictionaries/catalog-browse-copy";
import { captureDictionaryPanelView, syncExpandedCatalogBrowseSearch, toggleCatalogBrowseDisclosure } from "../../src/reader/settings/catalog-browse-disclosure";
import { applySettingsSearch } from "../../src/reader/settings/form";
import { testEnSettings } from "./helpers/settings-fixture";
import { catalogBrowseIndexForLanguageProfile } from "../../src/reader/settings/catalog-browse-window";

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
        expect(supportedPublishedEntries.length).toBeGreaterThan(0);
        expect(supportedPublishedEntries.every(entry => entry.headwordLanguages.includes('ja'))).toBe(true);
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
        expect(pronunciation.length).toBeGreaterThan(0);
        expect(pronunciation.every(dictionary => dictionary.headwordLanguage === 'ja')).toBe(true);
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

describe('the exhaustive dictionary catalogue disclosure', () => {
    afterEach(() => {
        document.body.replaceChildren();
        vi.restoreAllMocks();
    });

    it('keeps the exhaustive catalogue out of the initial Settings DOM', () => {
        const form = renderedForm('en');

        const section = form.querySelector<HTMLElement>('[data-catalog-browse]');
        expect(section).not.toBeNull();

        const catalogueElementCount = section!.querySelectorAll('*').length;
        const catalogueCardCount = section!.querySelectorAll('[data-catalog-recommendation]').length;
        expect(
            catalogueElementCount,
            `initial catalogue DOM contained ${catalogueElementCount} elements and ${catalogueCardCount} cards`,
        ).toBe(5);
        expect(catalogueCardCount).toBe(0);
        const available = catalogBrowseLanguageSectionsForLearnerLanguage('en', 'ja')
            .flatMap(shelf => shelf.groups).flatMap(group => group.dictionaries);
        expect(available.length).toBeGreaterThan(0);
        expect(Number(section!.dataset.catalogBrowseCount)).toBe(available.length);
        expect(section!.dataset.catalogBrowseExpanded).toBe('false');
        expect(section!.querySelector('[data-catalog-browse-filter]')).toBeNull();
        expect(section!.querySelector('[data-action="toggle-catalog-browse"]')?.getAttribute('aria-expanded')).toBe('false');
    });

    it('keeps collapsed aliases searchable and localizes supported interfaces without cards', () => {
        const englishForm = renderedForm('en');
        const englishSection = browseSection(englishForm);

        expect(englishSection.querySelector('[data-catalog-browse-title]')!.textContent).toBe(catalogBrowseCopy('en').title);
        applySettingsSearch(englishForm, '文法辞書');
        expect(englishForm.querySelector<HTMLFieldSetElement>('[data-settings-panel="dictionaries"]')!.hidden).toBe(false);
        expect(englishSection.querySelectorAll('[data-catalog-recommendation]')).toHaveLength(0);

        localizeSettingsForm(englishForm, 'ja');
        expect(englishSection.lang).toBe('ja');
        expect(englishSection.dir).toBe('ltr');
        expect(englishSection.querySelector('[data-catalog-browse-title]')!.textContent).toBe('配信中のすべての辞書');
        expect(englishSection.querySelector('[data-catalog-browse-summary]')!.textContent).not.toContain('0 辞書');
        expect(englishSection.querySelectorAll('[data-catalog-recommendation]')).toHaveLength(0);

        const legacyLocaleSection = browseSection(renderedForm('fa'));
        expect(legacyLocaleSection.dir).toBe('ltr');
        expect(legacyLocaleSection.lang).toBe('en');
        expect(legacyLocaleSection.querySelector('[data-catalog-browse-title]')!.textContent).toBe(catalogBrowseCopy('en').title);
        expect(legacyLocaleSection.querySelectorAll('[data-catalog-recommendation]')).toHaveLength(0);
    });

    it('materializes on demand and preserves search, focus, and installed state across refreshes', async () => {
        const dictionary = catalogBrowseDictionaries().find(candidate => candidate.name.includes('大辞林') && candidate.downloadUrl);
        expect(dictionary).toBeDefined();
        const settings = testEnSettings();
        const form = renderedForm('en');
        document.body.append(form);
        const settingsSearch = form.querySelector<HTMLInputElement>('[data-settings-search]')!;
        settingsSearch.value = dictionary!.name;
        applySettingsSearch(form, settingsSearch.value);

        const summary = {
            dictionaries: [{
                title: dictionary!.name,
                alias: dictionary!.name,
                enabled: true,
                priority: 0,
                type: 'terms' as const,
                downloadUrl: dictionary!.downloadUrl,
            }],
            terms: 1,
            kanji: 0,
            termMeta: 0,
            kanjiMeta: 0,
        };
        const refresh = vi.fn(async () => {
            captureDictionaryPanelView(form).render(summary, settings, 'en', 'ja');
            localizeSettingsForm(form, 'en');
            installCatalogBrowseFilter(form);
            return true;
        });

        await toggleCatalogBrowseDisclosure(
            form,
            browseSection(form).querySelector<HTMLButtonElement>('[data-action="toggle-catalog-browse"]'),
            refresh,
        );

        let section = browseSection(form);
        let filter = section.querySelector<HTMLInputElement>('[data-catalog-browse-filter]')!;
        const installedButton = Array.from(section.querySelectorAll<HTMLButtonElement>('[data-dictionary-id]'))
            .find(button => button.dataset.dictionaryId === dictionary!.id);
        expect({
            refreshes: refresh.mock.calls.length,
            expanded: section.dataset.catalogBrowseExpanded,
            cards: section.querySelectorAll('[data-catalog-recommendation]').length,
            query: filter.value,
            focused: document.activeElement === filter,
            installed: installedButton?.dataset.installed,
        }).toEqual({
            refreshes: 1,
            expanded: 'true',
            cards: 1,
            query: dictionary!.name,
            focused: true,
            installed: 'true',
        });
        expect(installedButton?.textContent?.trim()).toBe('Update');

        syncExpandedCatalogBrowseSearch(form, 'no such dictionary');
        expect(filter.value).toBe('no such dictionary');
        expect(section.querySelectorAll<HTMLElement>('[data-catalog-recommendation]:not([hidden])')).toHaveLength(0);

        settingsSearch.value = '';
        filter.value = '大辞林';
        applyCatalogBrowseFilter(section, filter.value);
        filter.focus();
        captureDictionaryPanelView(form).render(summary, settings, 'en', 'ja');
        localizeSettingsForm(form, 'en');
        installCatalogBrowseFilter(form);

        section = browseSection(form);
        filter = section.querySelector<HTMLInputElement>('[data-catalog-browse-filter]')!;
        expect(filter.value).toBe('大辞林');
        expect(document.activeElement).toBe(filter);
        expect(section.querySelectorAll<HTMLElement>('[data-catalog-recommendation]')).toHaveLength(2);

        const collapseRefresh = vi.fn(async () => true);
        await toggleCatalogBrowseDisclosure(
            form,
            section.querySelector<HTMLButtonElement>('[data-action="toggle-catalog-browse"]'),
            collapseRefresh,
        );
        section = browseSection(form);
        expect(collapseRefresh).not.toHaveBeenCalled();
        expect(section.dataset.catalogBrowseExpanded).toBe('false');
        expect(section.querySelector('[data-catalog-browse-results]')).toBeNull();
        expect(section.querySelectorAll('[data-catalog-recommendation]')).toHaveLength(0);
        expect(document.activeElement).toBe(section.querySelector('[data-action="toggle-catalog-browse"]'));
    });

    it('restores a bounded catalogue page across a status refresh', () => {
        const form = document.createElement('form');
        const settings = testEnSettings();
        form.innerHTML = renderSettingsForm(settings, 'https://jpdb.io/settings', undefined, {
            expandCatalogBrowse: true,
        });
        document.body.append(form);
        installCatalogBrowseFilter(form);
        let section = browseSection(form);
        let next = section.querySelector<HTMLButtonElement>('[data-catalog-browse-page="next"]')!;
        next.focus();
        next.click();
        next = section.querySelector<HTMLButtonElement>('[data-catalog-browse-page="next"]')!;

        expect(section.dataset.catalogBrowseOffset).toBe(String(CATALOG_BROWSE_PAGE_SIZE));
        expect(section.querySelectorAll('[data-catalog-recommendation]')).toHaveLength(CATALOG_BROWSE_PAGE_SIZE);
        expect(document.activeElement).toBe(next);

        captureDictionaryPanelView(form).render({
            dictionaries: [],
            terms: 0,
            kanji: 0,
            termMeta: 0,
            kanjiMeta: 0,
        }, settings, 'en', 'ja');
        localizeSettingsForm(form, 'en');
        installCatalogBrowseFilter(form);

        section = browseSection(form);
        expect(section.dataset.catalogBrowseOffset).toBe(String(CATALOG_BROWSE_PAGE_SIZE));
        expect(section.querySelectorAll('[data-catalog-recommendation]')).toHaveLength(CATALOG_BROWSE_PAGE_SIZE);
        expect(section.querySelector('[data-catalog-browse-progress]')?.textContent)
            .toContain(`${CATALOG_BROWSE_PAGE_SIZE + 1}–${CATALOG_BROWSE_PAGE_SIZE * 2}`);
    });

    it('recovers the disclosure button when catalogue materialization fails', async () => {
        const form = renderedForm('en');
        document.body.append(form);
        const toggle = browseSection(form).querySelector<HTMLButtonElement>('[data-action="toggle-catalog-browse"]')!;

        await toggleCatalogBrowseDisclosure(form, toggle, async () => false);

        const recovered = browseSection(form).querySelector<HTMLButtonElement>('[data-action="toggle-catalog-browse"]')!;
        expect(browseSection(form).dataset.catalogBrowseExpanded).toBe('false');
        expect(recovered.disabled).toBe(false);
        expect(recovered.getAttribute('aria-expanded')).toBe('false');
        expect(recovered.hasAttribute('aria-busy')).toBe(false);
    });


    function renderedForm(learnerLanguage: string): HTMLFormElement {
        const base = testEnSettings();
        const activeProfile = base.languageProfiles.find(profile => profile.id === base.activeLanguageProfileId)
            ?? base.languageProfiles[0]!;
        const settings = normalizeReaderSettings({
            ...base,
            languageProfiles: base.languageProfiles.map(profile => profile.id === activeProfile.id
                ? { ...profile, outputLanguage: learnerLanguage }
                : profile),
        });
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(settings, 'https://jpdb.io/settings', undefined, {
            expandCatalogBrowse: false,
        });
        return form;
    }

    function browseSection(form: HTMLFormElement): HTMLElement {
        const section = form.querySelector<HTMLElement>('[data-catalog-browse]');
        expect(section).not.toBeNull();
        return section!;
    }
});

describe('searching the mirrored dictionary catalogue', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('gives the panel a labelled search field that never becomes settings data', () => {
        const form = renderedForm('en');
        const section = browseSection(form);
        const input = section.querySelector<HTMLInputElement>('[data-catalog-browse-filter]')!;

        expect(input.type).toBe('search');
        expect(input.closest('label')?.textContent?.trim()).toBe(catalogBrowseCopy('en').searchLabel);
        // No name: the filter is a view control, so it must not reach
        // readFormSettings or a saved settings payload.
        expect(input.name).toBe('');
        expect([...new FormData(form).keys()].some(key => key.includes('catalog-browse'))).toBe(false);
        expect(input.getAttribute('aria-controls')).toBe(section.querySelector('[data-catalog-browse-results]')?.id);
    });

    it('reuses only the current language-profile index and evicts the previous profile', () => {
        const japanese = catalogBrowseLanguageSectionsForLearnerLanguage('en', 'ja');
        const first = catalogBrowseIndexForLanguageProfile(japanese, 'en', 'ja');

        expect(catalogBrowseIndexForLanguageProfile(japanese, 'en', 'ja')).toBe(first);

        const spanish = catalogBrowseLanguageSectionsForLearnerLanguage('en', 'es');
        const next = catalogBrowseIndexForLanguageProfile(spanish, 'en', 'es');
        const reloaded = catalogBrowseIndexForLanguageProfile(japanese, 'en', 'ja');

        expect(next).not.toBe(first);
        expect(reloaded).not.toBe(first);
        expect(reloaded.total).toBe(first.total);
    });

    it('searches the full model while keeping one bounded result window in the DOM', () => {
        const form = renderedForm('en');
        const section = browseSection(form);

        const before = visibleCardNames(section);
        const total = Number(section.dataset.catalogBrowseCount);
        expect(before).toHaveLength(CATALOG_BROWSE_PAGE_SIZE);
        expect(total).toBeGreaterThan(CATALOG_BROWSE_PAGE_SIZE);

        const visible = applyCatalogBrowseFilter(section, '新選国語辞典');

        expect(visible).toBe(1);
        expect(visibleCardNames(section)).toEqual(['[JA-JA] 新選国語辞典　第十版']);
        expect(section.querySelector<HTMLElement>('[data-catalog-browse-empty]')?.hidden).toBe(true);
        // Groups with nothing left must not leave a stranded heading behind.
        expect([...section.querySelectorAll<HTMLElement>('[data-catalog-browse-group]')].filter(group => !group.hidden)).toHaveLength(1);

        expect(applyCatalogBrowseFilter(section, '')).toBe(total);
        expect(visibleCardNames(section)).toEqual(before);
        expect(section.querySelectorAll('*').length).toBeLessThanOrEqual(450);
    });

    it('matches the localized category heading, not only the title', () => {
        const form = renderedForm('en');
        const section = browseSection(form);

        const pronunciation = applyCatalogBrowseFilter(section, 'pronunciation dictionaries');

        // One pronunciation group per language shelf now, so the claim is that
        // nothing OTHER than pronunciation survives the filter — not that a
        // single group does.
        const visible = [...section.querySelectorAll<HTMLElement>('[data-catalog-browse-group]')].filter(group => !group.hidden);

        expect(pronunciation).toBeGreaterThan(0);
        expect(visible.length).toBeGreaterThan(0);
        expect([...new Set(visible.map(group => group.dataset.catalogBrowseGroup))]).toEqual(['pronunciation']);

        localizeSettingsForm(form, 'ja');

        expect(applyCatalogBrowseFilter(section, '発音')).toBe(pronunciation);
    });

    it('announces an empty result instead of showing a blank panel', () => {
        const form = renderedForm('en');
        const section = browseSection(form);
        const empty = section.querySelector<HTMLElement>('[data-catalog-browse-empty]')!;

        expect(applyCatalogBrowseFilter(section, 'no such dictionary exists')).toBe(0);
        expect(empty.hidden).toBe(false);
        expect(empty.getAttribute('aria-live')).toBe('polite');
        expect(empty.textContent).toBe(catalogBrowseCopy('en').noResults);

        applyCatalogBrowseFilter(section, '');
        expect(empty.hidden).toBe(true);
    });

    it('filters from typing alone, without any network request', () => {
        const fetchSpy = vi.fn(() => {
            throw new Error('Settings must not fetch while filtering.');
        });
        vi.stubGlobal('fetch', fetchSpy);
        const openSpy = vi.spyOn(XMLHttpRequest.prototype, 'open');
        const form = renderedForm('en');
        const section = browseSection(form);
        installCatalogBrowseFilter(form);
        const input = section.querySelector<HTMLInputElement>('[data-catalog-browse-filter]')!;

        input.value = 'NHK';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        expect(visibleCardNames(section).every(name => name.toLowerCase().includes('nhk'))).toBe(true);
        expect(visibleCardNames(section).length).toBeGreaterThan(0);
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(openSpy).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it('keeps one filter binding across a re-rendered Sources panel', () => {
        const form = renderedForm('en');
        installCatalogBrowseFilter(form);
        installCatalogBrowseFilter(form);
        const section = browseSection(form);
        const input = section.querySelector<HTMLInputElement>('[data-catalog-browse-filter]')!;

        input.value = '大辞林';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        // Both 大辞林 archives, and nothing else out of a hundred-plus cards.
        expect(visibleCardNames(section)).toEqual(['[JA-JA] 大辞林　第四版', '[Pitch] 大辞林第四版']);
    });


    function renderedForm(learnerLanguage: string): HTMLFormElement {
        const form = document.createElement('form');
        const profile = DEFAULT_SETTINGS.languageProfiles[0]!;
        form.innerHTML = renderSettingsForm(
            normalizeReaderSettings({
                ...DEFAULT_SETTINGS,
                interfaceLanguage: 'en',
                languageProfiles: [{ ...profile, outputLanguage: learnerLanguage }],
                activeLanguageProfileId: profile.id,
            }),
            'https://jpdb.io/settings',
            undefined,
            { expandCatalogBrowse: true },
        );
        return form;
    }

    function browseSection(form: HTMLFormElement): HTMLElement {
        const section = form.querySelector<HTMLElement>('[data-catalog-browse]');
        expect(section).not.toBeNull();
        return section!;
    }

    function visibleCardNames(section: HTMLElement): string[] {
        return [...section.querySelectorAll<HTMLElement>('.jpdb-reader-recommended-item')]
            .filter(card => !card.hidden && !card.closest<HTMLElement>('[data-catalog-browse-group]')?.hidden)
            .map(card => card.querySelector('.jpdb-reader-recommended-name')?.textContent?.trim() ?? '');
    }
});
