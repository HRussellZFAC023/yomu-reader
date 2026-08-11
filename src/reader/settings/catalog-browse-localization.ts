import type { InterfaceLanguage } from '../app/types';
import { catalogBrowseCopy } from '../dictionaries/catalog-browse-copy';
import { isLearnerLanguageId, learnerLanguageById } from '../locales';
import { applyCatalogBrowseFilter } from './catalog-browse-filter';
import { catalogBrowseSummaryText } from './dictionary-recommendations-view';
import type { SettingsText } from './settings-text';

interface CatalogBrowseLocalization {
    locale: string;
    direction: 'ltr' | 'rtl';
    title: string;
    searchLabel: string;
    noResults: string;
    summary: string;
}

/** Localizes both the compact disclosure and its on-demand result tree. */
export function localizeCatalogBrowse(section: HTMLElement, text: SettingsText, interfaceLanguage: InterfaceLanguage): void {
    const localization = catalogBrowseLocalization(section, text, interfaceLanguage);
    section.lang = localization.locale;
    section.dir = localization.direction;
    replaceText(section, '[data-catalog-browse-title]', localization.title);
    replaceText(section, '[data-catalog-browse-search-label]', localization.searchLabel);
    replaceText(section, '[data-catalog-browse-empty]', localization.noResults);
    localizeCatalogSummary(section, localization);
    const filter = section.querySelector<HTMLInputElement>('[data-catalog-browse-filter]');
    if (filter) applyCatalogBrowseFilter(section, filter.value);
}

function catalogBrowseLocalization(
    section: HTMLElement,
    text: SettingsText,
    interfaceLanguage: InterfaceLanguage,
): CatalogBrowseLocalization {
    if (interfaceLanguage === 'ja') return japaneseCatalogBrowseLocalization(text);
    return learnerCatalogBrowseLocalization(section.dataset.catalogBrowseLearnerLanguage);
}

function learnerCatalogBrowseLocalization(learnerValue = ''): CatalogBrowseLocalization {
    const learnerLanguageId = isLearnerLanguageId(learnerValue) ? learnerValue : 'en';
    const learnerLanguage = learnerLanguageById(learnerLanguageId);
    const copy = catalogBrowseCopy(learnerLanguageId);
    return {
        locale: learnerLanguage.runtimeLocale,
        direction: learnerLanguage.direction,
        title: copy.title,
        searchLabel: copy.searchLabel,
        noResults: copy.noResults,
        summary: copy.summary,
    };
}

function japaneseCatalogBrowseLocalization(text: SettingsText): CatalogBrowseLocalization {
    return {
        locale: 'ja',
        direction: 'ltr',
        title: text('mirroredDictionaries'),
        searchLabel: text('mirroredDictionarySearch'),
        noResults: text('mirroredDictionarySearchNoResults'),
        summary: text('mirroredDictionariesSummary'),
    };
}

function localizeCatalogSummary(
    section: HTMLElement,
    localization: CatalogBrowseLocalization,
): void {
    const count = catalogBrowseNumber(section.dataset.catalogBrowseCount);
    const bytes = catalogBrowseNumber(section.dataset.catalogBrowseBytes);
    replaceText(
        section,
        '[data-catalog-browse-summary]',
        catalogBrowseSummaryText(localization.summary, localization.locale, count, bytes),
    );
}

function catalogBrowseNumber(value = '0'): number {
    return Number(value);
}

function replaceText(root: HTMLElement, selector: string, value: string): void {
    const element = root.querySelector<HTMLElement>(selector);
    if (element) element.replaceChildren(value);
}
