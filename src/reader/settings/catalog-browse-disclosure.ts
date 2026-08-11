import type { InterfaceLanguage, ReaderSettings } from '../app/types';
import { userFacingErrorText } from '../app/user-facing-errors';
import type { LearningTargetRosterId } from '../languages';
import type { LearnerLanguageId } from '../locales';
import { applyCatalogBrowseFilter } from './catalog-browse-filter';
import {
    dictionaryStatusElements,
    renderDictionaryStatusElements,
    type DictionaryPanelRenderContext,
    type DictionaryStatusElements,
    type DictionaryStatusSummary,
} from './dictionary-status-view';

interface CatalogBrowseRenderState {
    expanded: boolean;
    query: string;
    offset: number;
    filterFocused: boolean;
}

interface CatalogBrowseControls {
    section: HTMLElement | null;
    button: HTMLButtonElement | null;
    filter: HTMLInputElement | null;
}

interface ExpandedCatalogBrowseControls extends CatalogBrowseControls {
    section: HTMLElement;
    filter: HTMLInputElement;
}

export interface DictionaryPanelView {
    render(
        summary: DictionaryStatusSummary,
        settings: ReaderSettings,
        learnerLanguage: LearnerLanguageId,
        targetLanguage: LearningTargetRosterId,
    ): void;
    showUnavailable(error: unknown, language: InterfaceLanguage): void;
}

export const COLLAPSED_CATALOG_BROWSE_RENDER = { expandCatalogBrowse: false } as const;

export interface DictionaryPanelRefreshRequest {
    form: HTMLFormElement;
    current(): boolean;
    loadSummary(): Promise<DictionaryStatusSummary>;
    prepareSummary(summary: DictionaryStatusSummary): Promise<void>;
    refreshStyles(): Promise<void>;
    renderContext(): DictionaryPanelRenderContext;
    afterRender(): void;
    interfaceLanguage(): InterfaceLanguage;
    reportError(error: unknown): void;
}

/**
 * Captures the current dictionary panel before an async summary refresh. The
 * view owns replacing that exact panel and preserving an open catalogue, its
 * query, and keyboard focus across the refresh.
 */
export function captureDictionaryPanelView(form: HTMLFormElement): DictionaryPanelView {
    const elements = dictionaryStatusElements(form);
    return {
        render: (summary, settings, learnerLanguage, targetLanguage) => {
            renderDictionaryPanel(elements, summary, settings, learnerLanguage, targetLanguage);
        },
        showUnavailable: (error, language) => {
            if (elements.status) {
                elements.status.textContent = userFacingErrorText(language, 'dictionaryStatusUnavailable', error);
            }
        },
    };
}

/** Owns the guarded async lifecycle for one dictionary-panel refresh. */
export async function refreshDictionaryPanel(request: DictionaryPanelRefreshRequest): Promise<boolean> {
    const view = captureDictionaryPanelView(request.form);
    try {
        return await renderCurrentDictionaryPanel(view, request);
    } catch (error) {
        return handleDictionaryPanelRefreshError(view, request, error);
    }
}

async function renderCurrentDictionaryPanel(
    view: DictionaryPanelView,
    request: DictionaryPanelRefreshRequest,
): Promise<boolean> {
    const summary = await request.loadSummary();
    if (!request.current()) return false;
    await request.prepareSummary(summary);
    if (!request.current()) return false;
    await request.refreshStyles();
    if (!request.current()) return false;
    const context = request.renderContext();
    view.render(summary, context.settings, context.learnerLanguage, context.targetLanguage);
    request.afterRender();
    return true;
}

function handleDictionaryPanelRefreshError(
    view: DictionaryPanelView,
    request: DictionaryPanelRefreshRequest,
    error: unknown,
): boolean {
    if (!request.current()) return false;
    request.reportError(error);
    view.showUnavailable(error, request.interfaceLanguage());
    return false;
}

/** Recognizes and completes the catalogue disclosure action for the dialog. */
export function handleCatalogBrowseDisclosureAction(
    action: string,
    form: HTMLFormElement,
    control: HTMLElement | null | undefined,
    refreshDictionaryStatus: () => Promise<boolean>,
): Promise<true> | false {
    if (action !== 'toggle-catalog-browse') return false;
    return toggleCatalogBrowseDisclosure(form, control, refreshDictionaryStatus).then(() => true);
}

/** Keeps an already expanded catalogue aligned with Settings' top-level search. */
export function syncExpandedCatalogBrowseSearch(form: HTMLFormElement, query: string): void {
    const section = form.querySelector<HTMLElement>('[data-catalog-browse-expanded="true"]');
    const filter = section?.querySelector<HTMLInputElement>('[data-catalog-browse-filter]');
    if (!section || !filter || filter.value === query) return;
    filter.value = query;
    applyCatalogBrowseFilter(section, query);
}

/**
 * Owns the disclosure lifecycle while the controller supplies the async
 * dictionary refresh. Collapse stays synchronous; expansion recovers to a
 * truthful, usable button if refresh or re-rendering cannot materialize it.
 */
export async function toggleCatalogBrowseDisclosure(
    form: HTMLFormElement,
    control: HTMLElement | null | undefined,
    refreshDictionaryStatus: () => Promise<boolean>,
): Promise<void> {
    const section = control?.closest<HTMLElement>('[data-catalog-browse]');
    if (!section) return;
    const button = actionButton(control);

    if (section.dataset.catalogBrowseExpanded === 'true') {
        collapseCatalogBrowse(section, button);
        return;
    }

    await expandCatalogBrowseDisclosure(form, section, button, refreshDictionaryStatus);
}

async function expandCatalogBrowseDisclosure(
    form: HTMLFormElement,
    section: HTMLElement,
    button: HTMLButtonElement | null,
    refreshDictionaryStatus: () => Promise<boolean>,
): Promise<void> {
    setCatalogBrowseExpansionPending(section, button);
    const refreshed = await refreshDictionaryStatus();
    if (!form.isConnected) return;
    const controls = expandedCatalogBrowseControls(refreshed, form);
    if (!controls) {
        collapseCurrentCatalogBrowse(form, section, button);
        return;
    }

    seedCatalogBrowseFilterFromSettings(form, controls.section, controls.filter);
    controls.filter.focus();
}

function catalogBrowseRenderState(recommended: HTMLElement | null): CatalogBrowseRenderState {
    if (!recommended) return collapsedCatalogBrowseState();
    const section = recommended.querySelector<HTMLElement>('[data-catalog-browse]');
    if (!section) return collapsedCatalogBrowseState();
    return catalogBrowseSectionRenderState(section);
}

function catalogBrowseSectionRenderState(section: HTMLElement): CatalogBrowseRenderState {
    const filter = section.querySelector<HTMLInputElement>('[data-catalog-browse-filter]');
    return {
        expanded: section.dataset.catalogBrowseExpanded === 'true',
        query: catalogBrowseFilterQuery(filter),
        offset: catalogBrowseOffset(section),
        filterFocused: catalogBrowseFilterFocused(filter),
    };
}

function collapsedCatalogBrowseState(): CatalogBrowseRenderState {
    return { expanded: false, query: '', offset: 0, filterFocused: false };
}

function catalogBrowseFilterQuery(filter: HTMLInputElement | null): string {
    return filter?.value ?? '';
}

function catalogBrowseOffset(section: HTMLElement): number {
    return Number(section.dataset.catalogBrowseOffset ?? 0);
}

function catalogBrowseFilterFocused(filter: HTMLInputElement | null): boolean {
    return filter !== null && filter.ownerDocument.activeElement === filter;
}

function renderDictionaryPanel(
    elements: DictionaryStatusElements,
    summary: DictionaryStatusSummary,
    settings: ReaderSettings,
    learnerLanguage: LearnerLanguageId,
    targetLanguage: LearningTargetRosterId,
): void {
    const browseState = catalogBrowseRenderState(elements.recommended);
    renderDictionaryStatusElements(
        elements,
        summary,
        settings,
        learnerLanguage,
        targetLanguage,
        browseState.expanded,
    );
    if (!elements.recommended) return;
    restoreCatalogBrowseState(elements.recommended, browseState);
}

function restoreCatalogBrowseState(recommended: HTMLElement, state: CatalogBrowseRenderState): void {
    const controls = catalogBrowseControls(recommended);
    if (!controls.section || !controls.filter) return;
    controls.filter.value = state.query;
    applyCatalogBrowseFilter(controls.section, state.query, state.offset);
    if (state.filterFocused) controls.filter.focus();
}

function actionButton(control: HTMLElement | null | undefined): HTMLButtonElement | null {
    return control instanceof HTMLButtonElement ? control : control?.closest<HTMLButtonElement>('button') ?? null;
}

function collapseCatalogBrowse(section: HTMLElement, button: HTMLButtonElement | null): void {
    section.dataset.catalogBrowseExpanded = 'false';
    section.querySelector('[data-catalog-browse-search]')?.remove();
    section.querySelector('[data-catalog-browse-results]')?.remove();
    section.querySelector('[data-catalog-browse-empty]')?.remove();
    button?.setAttribute('aria-expanded', 'false');
    button?.removeAttribute('aria-controls');
    button?.removeAttribute('aria-busy');
    button?.removeAttribute('disabled');
    button?.focus();
}

function collapseCurrentCatalogBrowse(
    form: HTMLFormElement,
    fallbackSection: HTMLElement,
    fallbackButton: HTMLButtonElement | null,
): void {
    const current = catalogBrowseControls(form);
    collapseCatalogBrowse(current.section ?? fallbackSection, current.button ?? fallbackButton);
}

function catalogBrowseControls(root: ParentNode): CatalogBrowseControls {
    const section = root.querySelector<HTMLElement>('[data-catalog-browse]');
    return {
        section,
        button: section?.querySelector<HTMLButtonElement>('[data-action="toggle-catalog-browse"]') ?? null,
        filter: section?.querySelector<HTMLInputElement>('[data-catalog-browse-filter]') ?? null,
    };
}

function expandedCatalogBrowseControls(
    refreshed: boolean,
    form: HTMLFormElement,
): ExpandedCatalogBrowseControls | null {
    if (!refreshed) return null;
    const controls = catalogBrowseControls(form);
    if (!controls.section || !controls.filter) return null;
    return { ...controls, section: controls.section, filter: controls.filter };
}

function setCatalogBrowseExpansionPending(section: HTMLElement, button: HTMLButtonElement | null): void {
    section.dataset.catalogBrowseExpanded = 'true';
    button?.setAttribute('aria-expanded', 'true');
    button?.setAttribute('aria-controls', 'jpdb-reader-catalog-browse-results');
    button?.setAttribute('aria-busy', 'true');
    button?.setAttribute('disabled', 'true');
}

function seedCatalogBrowseFilterFromSettings(
    form: HTMLFormElement,
    section: HTMLElement,
    filter: HTMLInputElement,
): void {
    const query = form.querySelector<HTMLInputElement>('[data-settings-search]')?.value.trim() ?? '';
    if (!query) return;
    filter.value = query;
    applyCatalogBrowseFilter(section, query);
}
