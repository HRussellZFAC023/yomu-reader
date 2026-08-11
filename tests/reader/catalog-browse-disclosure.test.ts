import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogBrowseDictionaries } from '../../src/reader/dictionaries/catalog-browse';
import { catalogBrowseCopy } from '../../src/reader/dictionaries/catalog-browse-copy';
import {
    applyCatalogBrowseFilter,
    installCatalogBrowseFilter,
} from '../../src/reader/settings/catalog-browse-filter';
import {
    captureDictionaryPanelView,
    syncExpandedCatalogBrowseSearch,
    toggleCatalogBrowseDisclosure,
} from '../../src/reader/settings/catalog-browse-disclosure';
import { CATALOG_BROWSE_PAGE_SIZE } from '../../src/reader/settings/catalog-browse-window';
import {
    applySettingsSearch,
    localizeSettingsForm,
    renderSettingsForm,
} from '../../src/reader/settings/form';
import { normalizeReaderSettings } from '../../src/reader/settings';
import { testEnSettings } from './helpers/settings-fixture';

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
        expect(section!.dataset.catalogBrowseCount).toBe('1600');
        expect(section!.dataset.catalogBrowseExpanded).toBe('false');
        expect(section!.querySelector('[data-catalog-browse-filter]')).toBeNull();
        expect(section!.querySelector('[data-action="toggle-catalog-browse"]')?.getAttribute('aria-expanded')).toBe('false');
    });

    it('keeps collapsed aliases searchable and localizes English, Japanese, and RTL chrome without cards', () => {
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

        const rtlSection = browseSection(renderedForm('fa'));
        expect(rtlSection.dir).toBe('rtl');
        expect(rtlSection.lang).toBe('fa');
        expect(rtlSection.querySelector('[data-catalog-browse-title]')!.textContent).toBe(catalogBrowseCopy('fa').title);
        expect(rtlSection.querySelectorAll('[data-catalog-recommendation]')).toHaveLength(0);
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
