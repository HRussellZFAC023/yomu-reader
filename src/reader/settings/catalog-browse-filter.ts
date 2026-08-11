import { setInnerHtml } from '../dom';
import { catalogBrowseLanguageSectionsForLearnerLanguage } from '../dictionaries/recommended';
import { isLearningTargetRosterId, type LearningTargetRosterId } from '../languages';
import {
    isLearnerLanguageId,
    learnerLanguageById,
    type LearnerLanguageId,
} from '../locales';
import {
    CATALOG_BROWSE_PAGE_SIZE,
    catalogBrowseIndexForLanguageProfile,
    normalizeSearchQuery,
    type CatalogBrowseIndex,
} from './catalog-browse-window';
import { renderCatalogBrowseResultWindow } from './dictionary-recommendations-view';

export { normalizeSearchQuery } from './catalog-browse-window';

interface CatalogBrowseSession {
    readonly index: CatalogBrowseIndex;
    readonly learnerLanguage: LearnerLanguageId;
    readonly installedIds: ReadonlySet<string>;
    normalizedQuery: string;
    offset: number;
}

type CatalogBrowsePageDirection = 'previous' | 'next';

const CATALOG_BROWSE_PAGE_DELTAS: Readonly<Record<CatalogBrowsePageDirection, number>> = {
    previous: -CATALOG_BROWSE_PAGE_SIZE,
    next: CATALOG_BROWSE_PAGE_SIZE,
};

const catalogBrowseSessions = new WeakMap<HTMLElement, CatalogBrowseSession>();

/**
 * Searches the pre-indexed catalogue model and replaces one bounded result
 * window. Returns the total match count, including archives outside the DOM.
 */
export function applyCatalogBrowseFilter(
    section: HTMLElement,
    query: string,
    requestedOffset?: number,
): number {
    const session = catalogBrowseSession(section);
    const window = selectCatalogBrowseWindow(session, query, requestedOffset);
    renderCatalogBrowseWindow(section, session, window);
    recordCatalogBrowseWindow(section, session, query, window);
    return window.matchingCount;
}

/** Lets Settings search the full catalogue without serializing it into the DOM. */
export function catalogBrowseMatchesQuery(section: HTMLElement, query: string): boolean {
    return catalogBrowseSession(section).index.select(query).matchingCount > 0;
}

function selectCatalogBrowseWindow(
    session: CatalogBrowseSession,
    query: string,
    requestedOffset: number | undefined,
) {
    const normalized = normalizeSearchQuery(query);
    const retainedOffset = normalized === session.normalizedQuery ? session.offset : 0;
    return session.index.select(query, requestedOffset ?? retainedOffset);
}

function renderCatalogBrowseWindow(
    section: HTMLElement,
    session: CatalogBrowseSession,
    window: ReturnType<CatalogBrowseIndex['select']>,
): void {
    const results = section.querySelector<HTMLElement>('[data-catalog-browse-results]');
    if (!results) return;
    setInnerHtml(results, renderCatalogBrowseResultWindow(
        window,
        session.learnerLanguage,
        catalogBrowseLocale(section, session.learnerLanguage),
        session.installedIds,
    ));
}

function recordCatalogBrowseWindow(
    section: HTMLElement,
    session: CatalogBrowseSession,
    query: string,
    window: ReturnType<CatalogBrowseIndex['select']>,
): void {
    const normalized = normalizeSearchQuery(query);
    session.normalizedQuery = normalized;
    session.offset = window.offset;
    section.dataset.catalogBrowseOffset = String(window.offset);
    section.dataset.catalogBrowseMatches = String(window.matchingCount);
    section.dataset.catalogBrowseRendered = String(window.last - window.first + (window.last ? 1 : 0));
    section.dataset.catalogBrowseFiltering = normalized ? 'true' : 'false';
    const empty = section.querySelector<HTMLElement>('[data-catalog-browse-empty]');
    if (empty) empty.hidden = window.matchingCount > 0;
    section.dispatchEvent(new CustomEvent('yomu-catalog-browse-rendered', { bubbles: true }));
}

function catalogBrowseLocale(section: HTMLElement, learnerLanguage: LearnerLanguageId): string {
    return section.lang || learnerLanguageById(learnerLanguage).runtimeLocale;
}

/** Wires indexed search and bounded previous/next result windows once. */
export function installCatalogBrowseFilter(root: ParentNode): void {
    const section = root.querySelector<HTMLElement>('[data-catalog-browse]');
    const input = section?.querySelector<HTMLInputElement>('[data-catalog-browse-filter]');
    if (!section || !input || section.dataset.catalogBrowseBound === 'true') return;
    section.dataset.catalogBrowseBound = 'true';
    input.addEventListener('input', () => applyCatalogBrowseFilter(section, input.value));
    // A search input's native clear button fires `search`, not `input`, in
    // WebKit, and Enter must never submit the settings dialog from here.
    input.addEventListener('search', () => applyCatalogBrowseFilter(section, input.value));
    input.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        applyCatalogBrowseFilter(section, input.value);
    });
    section.addEventListener('click', event => pageCatalogBrowse(section, input, event));
    applyCatalogBrowseFilter(section, input.value, numericData(section.dataset.catalogBrowseOffset));
}

function pageCatalogBrowse(section: HTMLElement, input: HTMLInputElement, event: Event): void {
    const direction = catalogBrowsePageDirection(event);
    if (!direction) return;
    const session = catalogBrowseSession(section);
    applyCatalogBrowseFilter(section, input.value, session.offset + CATALOG_BROWSE_PAGE_DELTAS[direction]);
    focusCatalogBrowsePageControl(section, input, direction);
}

function catalogBrowsePageDirection(event: Event): CatalogBrowsePageDirection | undefined {
    if (!(event.target instanceof Element)) return undefined;
    const direction = event.target.closest<HTMLElement>('[data-catalog-browse-page]')?.dataset.catalogBrowsePage;
    if (direction === 'previous' || direction === 'next') return direction;
    return undefined;
}

function focusCatalogBrowsePageControl(
    section: HTMLElement,
    input: HTMLInputElement,
    direction: CatalogBrowsePageDirection,
): void {
    const preferred = section.querySelector<HTMLButtonElement>(`[data-catalog-browse-page="${direction}"]`);
    const fallback = section.querySelector<HTMLButtonElement>('[data-catalog-browse-page]');
    (preferred ?? fallback ?? input).focus();
}

function catalogBrowseSession(section: HTMLElement): CatalogBrowseSession {
    const active = catalogBrowseSessions.get(section);
    if (active) return active;
    const learnerLanguage = learnerLanguageId(section.dataset.catalogBrowseLearnerLanguage);
    const targetLanguage = targetLanguageId(section.dataset.catalogBrowseTargetLanguage);
    const sections = catalogBrowseLanguageSectionsForLearnerLanguage(learnerLanguage, targetLanguage);
    const session = {
        index: catalogBrowseIndexForLanguageProfile(sections, learnerLanguage, targetLanguage),
        learnerLanguage,
        installedIds: installedCatalogIds(section.dataset.catalogBrowseInstalledIds),
        normalizedQuery: '',
        offset: numericData(section.dataset.catalogBrowseOffset),
    };
    catalogBrowseSessions.set(section, session);
    return session;
}

function learnerLanguageId(value = ''): LearnerLanguageId {
    return isLearnerLanguageId(value) ? value : 'en';
}

function targetLanguageId(value = ''): LearningTargetRosterId {
    return isLearningTargetRosterId(value) ? value : 'ja';
}

function installedCatalogIds(value = ''): ReadonlySet<string> {
    try {
        const parsed: unknown = JSON.parse(value);
        return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []);
    } catch {
        return new Set();
    }
}

function numericData(value = '0'): number {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
}
