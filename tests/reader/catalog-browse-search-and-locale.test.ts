import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEARNER_LANGUAGE_IDS, learnerLanguageById } from '../../src/reader/locales';
import {
    CATALOG_BROWSE_CATEGORY_ORDER,
    CATALOG_BROWSE_COPY,
    catalogBrowseCopy,
} from '../../src/reader/dictionaries/catalog-browse-copy';
import {
    applyCatalogBrowseFilter,
    installCatalogBrowseFilter,
} from '../../src/reader/settings/catalog-browse-filter';
import { localizeSettingsForm, renderSettingsForm } from '../../src/reader/settings/form';
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../src/reader/settings';

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

    it('narrows a hundred-plus cards to the one dictionary the reader typed', () => {
        const form = renderedForm('en');
        const section = browseSection(form);

        const before = visibleCardNames(section);
        expect(before.length).toBeGreaterThan(100);

        const visible = applyCatalogBrowseFilter(section, '新選国語辞典');

        expect(visible).toBe(1);
        expect(visibleCardNames(section)).toEqual(['[JA-JA] 新選国語辞典　第十版']);
        expect(section.querySelector<HTMLElement>('[data-catalog-browse-empty]')?.hidden).toBe(true);
        // Groups with nothing left must not leave a stranded heading behind.
        expect([...section.querySelectorAll<HTMLElement>('[data-catalog-browse-group]')].filter(group => !group.hidden)).toHaveLength(1);

        expect(applyCatalogBrowseFilter(section, '')).toBe(before.length);
        expect(visibleCardNames(section)).toEqual(before);
    });

    it('matches the localized category heading, not only the title', () => {
        const form = renderedForm('en');
        const section = browseSection(form);

        const pitch = applyCatalogBrowseFilter(section, 'pitch dictionaries');

        expect(pitch).toBeGreaterThan(0);
        expect([...section.querySelectorAll<HTMLElement>('[data-catalog-browse-group]')].filter(group => !group.hidden)
            .map(group => group.dataset.catalogBrowseGroup)).toEqual(['pronunciation']);

        localizeSettingsForm(form, 'ja');

        expect(applyCatalogBrowseFilter(section, 'ピッチ')).toBe(pitch);
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
});

describe('mirrored catalogue chrome speaks every learner language', () => {
    it('renders the panel in the learner language, not English', () => {
        const form = renderedForm('vi');
        const section = browseSection(form);
        const copy = catalogBrowseCopy('vi');

        expect(section.querySelector('[data-catalog-browse-title]')?.textContent).toBe(copy.title);
        expect(section.querySelector('[data-catalog-browse-search-label]')?.textContent).toBe(copy.searchLabel);
        expect(section.querySelector('[data-catalog-browse-category="pronunciation"]')?.textContent).toBe(copy.categories.pronunciation);
        expect(section.querySelector('[data-catalog-browse-summary]')?.textContent).toContain('từ điển');
        expect(section.lang).toBe(learnerLanguageById('vi').runtimeLocale);
    });

    it('does not let the English fallback interface language overwrite the learner language', () => {
        const form = renderedForm('vi');
        const copy = catalogBrowseCopy('vi');

        for (const language of ['en', 'auto'] as const) {
            localizeSettingsForm(form, language);
            const section = browseSection(form);

            expect(section.querySelector('[data-catalog-browse-title]')?.textContent, language).toBe(copy.title);
            expect(section.querySelector('[data-catalog-browse-category="grammar"]')?.textContent, language).toBe(copy.categories.grammar);
            expect(section.querySelector('[data-catalog-browse-empty]')?.textContent, language).toBe(copy.noResults);
        }
    });

    it('hands the panel to Japanese when the whole dialog is Japanese', () => {
        const form = renderedForm('vi');
        localizeSettingsForm(form, 'ja');
        const section = browseSection(form);

        expect(section.querySelector('[data-catalog-browse-title]')?.textContent).toBe('配信中のすべての辞書');
        expect(section.querySelector('[data-catalog-browse-search-label]')?.textContent).toBe('辞書を検索');
        expect(section.querySelector('[data-catalog-browse-empty]')?.textContent).toBe('検索に一致する辞書がありません。');
        expect(section.lang).toBe('ja');
        expect(section.dir).toBe('ltr');
    });

    it('keeps a right-to-left learner’s panel right-to-left', () => {
        const section = browseSection(renderedForm('fa'));

        expect(section.dir).toBe('rtl');
        expect(section.querySelector('[data-catalog-browse-title]')?.textContent).toBe(catalogBrowseCopy('fa').title);
    });

    it('covers all 32 learner languages with distinct, complete copy', () => {
        expect(Object.keys(CATALOG_BROWSE_COPY)).toEqual([...LEARNER_LANGUAGE_IDS]);
        const titles = new Set<string>();
        for (const language of LEARNER_LANGUAGE_IDS) {
            const copy = CATALOG_BROWSE_COPY[language];
            titles.add(copy.title);

            expect(copy.title.trim(), language).not.toBe('');
            expect(copy.searchLabel.trim(), language).not.toBe('');
            expect(copy.noResults.trim(), language).not.toBe('');
            expect(copy.otherLanguageNote.trim(), language).not.toBe('');
            expect(copy.summary, language).toContain('{count}');
            expect(copy.summary, language).toContain('{size}');
            for (const category of CATALOG_BROWSE_CATEGORY_ORDER) {
                expect(copy.categories[category]?.trim(), `${language}/${category}`).not.toBe('');
            }
            if (language === 'en') continue;
            // A locale that silently reuses the English string is an untranslated
            // locale wearing a translated locale's tag.
            expect(copy.title, language).not.toBe(CATALOG_BROWSE_COPY.en.title);
            expect(copy.searchLabel, language).not.toBe(CATALOG_BROWSE_COPY.en.searchLabel);
            expect(copy.otherLanguageNote, language).not.toBe(CATALOG_BROWSE_COPY.en.otherLanguageNote);
        }
        expect(titles.size).toBe(LEARNER_LANGUAGE_IDS.length);
    });
});

function renderedForm(learnerLanguage: string): HTMLFormElement {
    const form = document.createElement('form');
    const profile = DEFAULT_SETTINGS.languageProfiles[0]!;
    form.innerHTML = renderSettingsForm(
        normalizeReaderSettings({
            ...DEFAULT_SETTINGS,
            interfaceLanguage: 'en',
            languageProfiles: [{ ...profile, learnerLanguage }],
            activeLanguageProfileId: profile.id,
        }),
        'https://jpdb.io/settings',
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
