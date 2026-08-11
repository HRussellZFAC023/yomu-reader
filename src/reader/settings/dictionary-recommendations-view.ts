import { uiText } from '../app/i18n';
import { escapeHtml } from '../dom/index';
import type { DictionaryCategory } from '../dictionaries/catalog';
import {
    catalogBrowseDescription,
    catalogBrowseSectionGroups,
    catalogBrowseTotalBytes,
    formatDictionaryBytes,
    headwordLanguageEndonym,
    headwordLanguageName,
    type CatalogBrowseLanguageSection,
} from '../dictionaries/catalog-browse';
import {
    catalogBrowseCopy,
    catalogBrowseLanguageNote,
    type CatalogBrowseCopy,
} from '../dictionaries/catalog-browse-copy';
import {
    RECOMMENDED_JAPANESE_DICTIONARIES,
    catalogBrowseLanguageSectionsForLearnerLanguage,
    recommendedDictionariesForLanguageProfile,
    type RecommendedDictionary,
} from '../dictionaries/recommended';
import type { YomitanDictionaryInfo } from '../dictionaries/yomitan';
import type { LearningTargetRosterId } from '../languages';
import {
    LOCALE_CATALOGS,
    learnerLanguageById,
    type LearnerLanguageId,
} from '../locales';
import { externalLinkIcon } from '../ui/icons';
import {
    CATALOG_BROWSE_CATEGORY_TEXT_KEYS,
    CATALOG_BROWSE_PAGE_SIZE,
    catalogBrowseIndexForLanguageProfile,
    type CatalogBrowseWindow,
} from './catalog-browse-window';

const AUTOFILL_IGNORE_ATTRIBUTE_HTML = ' data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-protonpass-ignore="true" data-form-type="other"';
const DICTIONARY_PLURAL_TEMPLATE_PATTERN = /^([\s\S]*?)\{count,\s*plural,\s*((?:(?:=?[a-z0-9]+)\s*\{[^{}]*\}\s*)+)\}([\s\S]*)$/iu;

/**
 * Renders the compact starter recommendations plus the exhaustive catalogue.
 * The latter stays behind an explicit disclosure so ordinary Settings opens do
 * not construct thousands of catalogue nodes.
 */
export function renderRecommendedDictionaries(
    installed: YomitanDictionaryInfo[],
    learnerLanguage: LearnerLanguageId = 'en',
    includeCatalogBrowse = true,
    targetLanguage: LearningTargetRosterId = 'ja',
    expandCatalogBrowse = true,
): string {
    const groups: Array<[RecommendedDictionary['category'], string]> = [
        ['terms', 'Term dictionaries'],
        ['kanji', 'Kanji dictionaries'],
        ['pitch', 'Pitch dictionaries'],
        ['pronunciation', 'Pronunciation dictionaries'],
        ['frequency', 'Frequency dictionaries'],
    ];
    const catalogRecommendations = recommendedDictionariesForLanguageProfile(learnerLanguage, targetLanguage);

    return `
        ${renderCatalogRecommendationSeed(catalogRecommendations, installed, learnerLanguage, targetLanguage)}
        ${targetLanguage === 'ja' ? `
        <div class="jpdb-reader-recommended-title">Recommended Japanese dictionaries</div>
        <div class="jpdb-reader-help jpdb-reader-recommended-note" data-recommended-dictionary-help>${escapeHtml(uiText('en', 'dictionaryInstallQueueHelp'))}</div>
        ${groups
            .map(([category, label]) => {
                const dictionaries = RECOMMENDED_JAPANESE_DICTIONARIES.filter(dictionary => dictionary.category === category);
                if (!dictionaries.length) return '';
                return `
                <div class="jpdb-reader-recommended-group">
                    <div class="jpdb-reader-recommended-group-title" data-recommended-category="${category}">${escapeHtml(label)}</div>
                    ${dictionaries.map(dictionary => renderRecommendedDictionary(dictionary, installed)).join('')}
                </div>
            `;
            })
            .join('')}` : ''}
        ${includeCatalogBrowse
            ? renderCatalogBrowseSection(
                catalogBrowseLanguageSectionsForLearnerLanguage(learnerLanguage, targetLanguage),
                installed,
                learnerLanguage,
                targetLanguage,
                expandCatalogBrowse,
            )
            : ''}
    `;
}

function renderCatalogBrowseSection(
    sections: readonly CatalogBrowseLanguageSection[],
    installed: YomitanDictionaryInfo[],
    learnerLanguageId: LearnerLanguageId,
    targetLanguage: LearningTargetRosterId,
    expanded: boolean,
): string {
    const groups = catalogBrowseSectionGroups(sections);
    const count = groups.reduce((total, group) => total + group.dictionaries.length, 0);
    if (!count) return '';
    const learnerLanguage = learnerLanguageById(learnerLanguageId);
    const copy = catalogBrowseCopy(learnerLanguageId);
    const locale = learnerLanguage.runtimeLocale;
    const bytes = catalogBrowseTotalBytes(groups);
    const installedIds = installedCatalogDictionaryIds(sections, installed);
    return `
        <section class="jpdb-reader-catalog-browse" data-catalog-browse data-catalog-browse-expanded="${expanded}" data-catalog-browse-count="${count}" data-catalog-browse-bytes="${bytes}" data-catalog-browse-learner-language="${escapeHtml(learnerLanguageId)}" data-catalog-browse-target-language="${escapeHtml(targetLanguage)}" data-catalog-browse-installed-ids="${escapeHtml(JSON.stringify([...installedIds]))}" data-catalog-browse-offset="0" lang="${escapeHtml(locale)}" dir="${learnerLanguage.direction}">
            <button class="jpdb-reader-catalog-browse-toggle" type="button" data-action="toggle-catalog-browse" aria-expanded="${expanded}"${catalogBrowseToggleControls(expanded)}>
                <span class="jpdb-reader-catalog-browse-toggle-copy">
                    <span class="jpdb-reader-recommended-title" data-catalog-browse-title>${escapeHtml(copy.title)}</span>
                    <span class="jpdb-reader-help jpdb-reader-catalog-browse-summary" data-catalog-browse-summary>${escapeHtml(catalogBrowseSummaryText(copy.summary, locale, count, bytes))}</span>
                </span>
                <span class="jpdb-reader-catalog-browse-chevron" aria-hidden="true"></span>
            </button>
            ${renderExpandedCatalogBrowse(sections, learnerLanguageId, targetLanguage, locale, installedIds, copy, expanded)}
        </section>
    `;
}

function catalogBrowseToggleControls(expanded: boolean): string {
    return expanded ? ' aria-controls="jpdb-reader-catalog-browse-results"' : '';
}

function renderExpandedCatalogBrowse(
    sections: readonly CatalogBrowseLanguageSection[],
    learnerLanguageId: LearnerLanguageId,
    targetLanguage: LearningTargetRosterId,
    locale: string,
    installedIds: ReadonlySet<string>,
    copy: CatalogBrowseCopy,
    expanded: boolean,
): string {
    if (!expanded) return '';
    const initialWindow = catalogBrowseIndexForLanguageProfile(sections, learnerLanguageId, targetLanguage).select('');
    return `<div class="jpdb-reader-catalog-browse-search" data-catalog-browse-search>
        <label>
            <span class="jpdb-reader-settings-label-text" data-catalog-browse-search-label>${escapeHtml(copy.searchLabel)}</span>
            <input type="search" data-catalog-browse-filter autocomplete="off" aria-controls="jpdb-reader-catalog-browse-results"${AUTOFILL_IGNORE_ATTRIBUTE_HTML}>
        </label>
    </div>
    <div id="jpdb-reader-catalog-browse-results" data-catalog-browse-results>
        ${renderCatalogBrowseResultWindow(initialWindow, learnerLanguageId, locale, installedIds)}
    </div>
    <div class="jpdb-reader-help" data-catalog-browse-empty role="status" aria-live="polite" hidden>${escapeHtml(copy.noResults)}</div>`;
}

/** Renders one bounded, grouped page from the pre-indexed catalogue model. */
export function renderCatalogBrowseResultWindow(
    window: CatalogBrowseWindow,
    learnerLanguageId: LearnerLanguageId,
    locale: string,
    installedIds: ReadonlySet<string>,
): string {
    const copy = catalogBrowseCopyForLocale(learnerLanguageId, locale);
    return `
        ${window.sections.map(section => renderCatalogBrowseLanguage(section, copy, locale, installedIds)).join('')}
        ${renderCatalogBrowseNavigation(window, copy, locale)}
    `;
}

function renderCatalogBrowseLanguage(
    section: CatalogBrowseLanguageSection,
    copy: CatalogBrowseCopy,
    locale: string,
    installedIds: ReadonlySet<string>,
): string {
    const language = section.headwordLanguage;
    return `
        <div class="jpdb-reader-recommended-group jpdb-reader-catalog-browse-language" data-catalog-browse-language="${escapeHtml(language)}" data-catalog-browse-language-endonym="${escapeHtml(headwordLanguageEndonym(language))}"${section.isTargetLanguage ? ' data-catalog-browse-language-target' : ''}>
            <div class="jpdb-reader-recommended-title" data-catalog-browse-language-title>${escapeHtml(headwordLanguageName(language, locale))}</div>
            <div class="jpdb-reader-help" data-catalog-browse-language-note>${escapeHtml(catalogBrowseLanguageNote(copy, headwordLanguageName(language, locale)))}</div>
            ${section.groups
                .map(group => `
                    <div class="jpdb-reader-recommended-group" data-catalog-browse-group="${escapeHtml(group.category)}">
                        <div class="jpdb-reader-recommended-group-title" data-catalog-browse-category="${escapeHtml(group.category)}">${escapeHtml(copy.categories[group.category])}</div>
                        ${group.dictionaries.map(dictionary => renderRecommendedDictionary(dictionary, installedIds.has(dictionary.id), locale)).join('')}
                    </div>
                `)
                .join('')}
        </div>
    `;
}

function renderCatalogBrowseNavigation(
    window: CatalogBrowseWindow,
    copy: CatalogBrowseCopy,
    locale: string,
): string {
    if (!window.matchingCount) return '';
    const progress = catalogBrowseRange(window.first, window.last, window.matchingCount, locale);
    const previousFirst = Math.max(1, window.first - CATALOG_BROWSE_PAGE_SIZE);
    const previousLast = Math.max(1, window.first - 1);
    const nextFirst = window.last + 1;
    const nextLast = Math.min(window.matchingCount, window.last + CATALOG_BROWSE_PAGE_SIZE);
    const previous = window.hasPrevious
        ? catalogBrowsePageButton('previous', previousFirst, previousLast, window.matchingCount, copy.title, locale)
        : '';
    const next = window.hasNext
        ? catalogBrowsePageButton('next', nextFirst, nextLast, window.matchingCount, copy.title, locale)
        : '';
    return `<div class="jpdb-reader-catalog-browse-navigation" data-catalog-browse-navigation role="group" aria-label="${escapeHtml(copy.title)}">
        ${previous}
        <span class="jpdb-reader-help" data-catalog-browse-progress role="status" aria-live="polite">${escapeHtml(progress)}</span>
        ${next}
    </div>`;
}

function catalogBrowsePageButton(
    direction: 'previous' | 'next',
    first: number,
    last: number,
    total: number,
    title: string,
    locale: string,
): string {
    const range = catalogBrowseRange(first, last, total, locale);
    return `<button class="jpdb-reader-btn" type="button" data-catalog-browse-page="${direction}" aria-label="${escapeHtml(`${title}: ${range}`)}">${escapeHtml(range)}</button>`;
}

function catalogBrowseRange(first: number, last: number, total: number, locale: string): string {
    return `${localizedNumber(first, locale)}–${localizedNumber(last, locale)} / ${localizedNumber(total, locale)}`;
}

function catalogBrowseCopyForLocale(learnerLanguageId: LearnerLanguageId, locale: string): CatalogBrowseCopy {
    if (locale !== 'ja') return catalogBrowseCopy(learnerLanguageId);
    return {
        title: uiText('ja', 'mirroredDictionaries'),
        summary: uiText('ja', 'mirroredDictionariesSummary'),
        searchLabel: uiText('ja', 'mirroredDictionarySearch'),
        noResults: uiText('ja', 'mirroredDictionarySearchNoResults'),
        languageNote: uiText('ja', 'mirroredDictionaryLanguageNote'),
        categories: Object.fromEntries(
            (Object.keys(CATALOG_BROWSE_CATEGORY_TEXT_KEYS) as DictionaryCategory[])
                .map(category => [category, uiText('ja', CATALOG_BROWSE_CATEGORY_TEXT_KEYS[category])]),
        ) as Readonly<Record<DictionaryCategory, string>>,
    };
}

export function catalogBrowseSummaryText(template: string, locale: string, count: number, bytes: number): string {
    return template
        .replaceAll('{count}', localizedNumber(count, locale))
        .replaceAll('{size}', formatDictionaryBytes(bytes, locale));
}

function renderCatalogRecommendationSeed(
    dictionaries: readonly RecommendedDictionary[],
    installed: YomitanDictionaryInfo[],
    learnerLanguageId: LearnerLanguageId,
    targetLanguage: LearningTargetRosterId,
): string {
    if (!dictionaries.length) return '';
    const learnerLanguage = learnerLanguageById(learnerLanguageId);
    const messages = LOCALE_CATALOGS[learnerLanguageId].messages;
    const title = targetLanguage === 'ja'
        ? messages.recommendedDictionariesTitle
        : headwordLanguageName(targetLanguage, learnerLanguage.runtimeLocale);
    const size = completeDictionarySeedSize(dictionaries, learnerLanguage.runtimeLocale);
    const countAndSize = formatDictionaryCountAndSize(messages.dictionaryCountAndSize, dictionaries.length, size, learnerLanguage.runtimeLocale);
    return `
        <section class="jpdb-reader-recommended-group jpdb-reader-catalog-seed" data-catalog-recommendation-seed="${learnerLanguageId}" data-catalog-recommendation-target="${escapeHtml(targetLanguage)}" lang="${escapeHtml(learnerLanguage.runtimeLocale)}" dir="${learnerLanguage.direction}">
            <div class="jpdb-reader-catalog-seed-title">${escapeHtml(title)}</div>
            <div class="jpdb-reader-help jpdb-reader-catalog-seed-summary">${escapeHtml(countAndSize)}</div>
            ${dictionaries.map(dictionary => renderRecommendedDictionary(dictionary, installed)).join('')}
        </section>
    `;
}

function renderRecommendedDictionary(
    dictionary: RecommendedDictionary,
    installed: YomitanDictionaryInfo[] | boolean,
    locale?: string,
): string {
    const alreadyInstalled = typeof installed === 'boolean'
        ? installed
        : isRecommendedDictionaryInstalled(dictionary, installed);
    return `
        <div class="jpdb-reader-recommended-item"${catalogRecommendationAttributes(dictionary)}>
            <div>
                <div class="jpdb-reader-recommended-name">
                    <span>${escapeHtml(dictionary.name)}</span>
                </div>
                <div class="jpdb-reader-help">${escapeHtml(recommendedDictionaryDescription(dictionary, locale))}</div>
                <div class="jpdb-reader-recommended-status" data-recommended-dictionary-status role="status" aria-live="polite" hidden></div>
            </div>
            ${recommendedDictionaryAction(dictionary, alreadyInstalled)}
        </div>
    `;
}

function recommendedDictionaryAction(dictionary: RecommendedDictionary, alreadyInstalled: boolean): string {
    if (dictionary.downloadUrl) {
        return `<button class="jpdb-reader-btn" type="button" data-action="download-recommended-dictionary" data-dictionary-id="${escapeHtml(dictionary.id)}" data-installed="${alreadyInstalled}">
                ${alreadyInstalled ? 'Update' : 'Install'}
            </button>`;
    }
    if (!dictionary.helpUrl) return '';
    return `<a class="jpdb-reader-btn" href="${escapeHtml(dictionary.helpUrl)}" target="_blank" rel="noopener" data-dictionary-id="${escapeHtml(dictionary.id)}" data-recommended-dictionary-guide>${externalButtonLabel('Guide')}</a>`;
}

function recommendedDictionaryDescription(dictionary: RecommendedDictionary, locale?: string): string {
    const localized = localizedCatalogBrowseDescription(dictionary, locale);
    if (localized !== undefined) return localized;
    return staticRecommendedDictionaryDescription(dictionary);
}

function localizedCatalogBrowseDescription(
    dictionary: RecommendedDictionary,
    locale: string | undefined,
): string | undefined {
    if (!locale) return undefined;
    if (dictionary.origin !== 'catalog') return undefined;
    return catalogBrowseDescription(dictionary, locale);
}

function staticRecommendedDictionaryDescription(dictionary: RecommendedDictionary): string {
    if (dictionary.description !== undefined) return dictionary.description;
    if (dictionary.descriptionKey) return uiText('en', dictionary.descriptionKey);
    return '';
}

function installedCatalogDictionaryIds(
    sections: readonly CatalogBrowseLanguageSection[],
    installed: YomitanDictionaryInfo[],
): ReadonlySet<string> {
    return new Set(sections.flatMap(section => section.groups.flatMap(group => group.dictionaries
        .filter(dictionary => isRecommendedDictionaryInstalled(dictionary, installed))
        .map(dictionary => dictionary.id))));
}

function catalogRecommendationAttributes(dictionary: RecommendedDictionary): string {
    if (dictionary.origin !== 'catalog') return '';
    return [
        catalogDataAttribute('catalog-recommendation', dictionary.catalogDictionaryId),
        catalogDataAttribute('learner-language', dictionary.learnerLanguage),
        catalogDataAttribute('target-language', dictionary.targetLanguage),
        catalogDataAttribute('headword-language', dictionary.headwordLanguage),
        catalogDataAttribute('definition-language', dictionary.definitionLanguage),
        catalogDataAttribute('translation-mode', dictionary.translationMode),
        catalogShaAttribute(dictionary.sha256),
    ].join('');
}

function catalogDataAttribute(name: string, value = ''): string {
    return ` data-${name}="${escapeHtml(value)}"`;
}

function catalogShaAttribute(sha256 = ''): string {
    if (!sha256) return '';
    return catalogDataAttribute('sha256', sha256);
}

function externalButtonLabel(label: string): string {
    return `<span>${escapeHtml(label)}</span>${externalLinkIcon()}`;
}

function completeDictionarySeedSize(dictionaries: readonly RecommendedDictionary[], locale: string): string | undefined {
    if (dictionaries.some(dictionary => dictionary.bytes === undefined)) return undefined;
    const bytes = dictionaries.reduce((total, dictionary) => total + (dictionary.bytes ?? 0), 0);
    if (!bytes) return undefined;
    const megabytes = bytes / (1024 * 1024);
    if (megabytes >= 1) return `${localizedDecimal(megabytes, locale)} MB`;
    return `${localizedDecimal(bytes / 1024, locale)} KB`;
}

function localizedDecimal(value: number, locale: string): string {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

function formatDictionaryCountAndSize(template: string, count: number, size: string | undefined, locale: string): string {
    const plural = dictionaryPluralVariants(template, count, locale);
    if (!plural) return size
        ? template.replace('{count}', localizedNumber(count, locale)).replace('{size}', size)
        : localizedNumber(count, locale);
    if (!size) return plural.withoutSize;
    return plural.withSize.replace('{size}', size).trim();
}

interface DictionaryPluralVariants {
    withoutSize: string;
    withSize: string;
}

interface DictionaryPluralTemplate {
    prefix: string;
    branches: Map<string, string>;
    suffix: string;
}

function dictionaryPluralVariants(template: string, count: number, locale: string): DictionaryPluralVariants | undefined {
    const plural = parseDictionaryPluralTemplate(template);
    if (!plural) return malformedDictionaryPluralVariants(template, count, locale);
    const branch = selectDictionaryPluralBranch(plural.branches, count, locale);
    const countText = branch.replaceAll('#', localizedNumber(count, locale));
    return {
        withoutSize: `${plural.prefix}${countText}`.trim(),
        withSize: `${plural.prefix}${countText}${plural.suffix}`,
    };
}

function parseDictionaryPluralTemplate(template: string): DictionaryPluralTemplate | undefined {
    const match = DICTIONARY_PLURAL_TEMPLATE_PATTERN.exec(template);
    if (!match) return undefined;
    const [, prefix = '', branchSource = '', suffix = ''] = match;
    const branches = new Map(
        Array.from(branchSource.matchAll(/(=?[a-z0-9]+)\s*\{([^{}]*)\}/giu), branch => [branch[1], branch[2]]),
    );
    return { prefix, branches, suffix };
}

function selectDictionaryPluralBranch(branches: Map<string, string>, count: number, locale: string): string {
    return branches.get(`=${count}`)
        ?? branches.get(pluralCategoryForCount(count, locale))
        ?? branches.get('other')
        ?? String(count);
}

function malformedDictionaryPluralVariants(
    template: string,
    count: number,
    locale: string,
): DictionaryPluralVariants | undefined {
    if (!template.includes('{count, plural,')) return undefined;
    const value = localizedNumber(count, locale);
    return { withoutSize: value, withSize: value };
}

function pluralCategoryForCount(count: number, locale: string): Intl.LDMLPluralRule {
    try {
        return new Intl.PluralRules(locale).select(count);
    } catch {
        return new Intl.PluralRules('en').select(count);
    }
}

function localizedNumber(value: number, locale: string): string {
    try {
        return new Intl.NumberFormat(locale).format(value);
    } catch {
        return new Intl.NumberFormat('en').format(value);
    }
}

function isRecommendedDictionaryInstalled(dictionary: RecommendedDictionary, installed: YomitanDictionaryInfo[]): boolean {
    return installed.some(item => recommendedDictionaryMatchesInstalled(dictionary, item));
}

function recommendedDictionaryMatchesInstalled(dictionary: RecommendedDictionary, installed: YomitanDictionaryInfo): boolean {
    if (dictionary.downloadUrl && installed.downloadUrl === dictionary.downloadUrl) return true;
    const tokenSets = recommendedDictionaryMatchTokenSets(dictionary);
    return [installed.title, installed.alias]
        .map(dictionaryTitleTokens)
        .some(tokens => tokenSets.some(required => required.every(token => tokens.has(token))));
}

const RECOMMENDED_DICTIONARY_MATCH_TOKENS: Record<string, string[][]> = {
    jitendex: [['jitendex']],
    jmdict: [['jmdict']],
    jmnedict: [['jmnedict']],
    'wty-ja-ja': [['wty', 'ja']],
    'pixiv-light': [['pixiv', 'light']],
    kanjidic: [['kanjidic']],
    'jpdb-kanji': [['jpdb', 'kanji']],
    'kanjium-pitch': [['kanjium', 'pitch'], ['kanjium'], ['pitch', 'accents']],
    jiten: [['jiten']],
    'jpdbv2-kana': [['jpdb', 'v2'], ['jpdbv2']],
    bccwj: [['bccwj']],
};

function recommendedDictionaryMatchTokenSets(dictionary: RecommendedDictionary): string[][] {
    return RECOMMENDED_DICTIONARY_MATCH_TOKENS[dictionary.id] ?? [Array.from(dictionaryTitleTokens(dictionary.name))];
}

function dictionaryTitleTokens(value: string): Set<string> {
    return new Set(value.toLowerCase().match(/[a-z0-9]+|[ぁ-んァ-ン一-龯]+/g) ?? []);
}
