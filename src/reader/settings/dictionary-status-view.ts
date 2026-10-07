import type { ReaderSettings } from '../app/types';
import { formatUiText, uiText } from '../app/i18n';
import { setInnerHtml } from '../dom/index';
import type { LearningTargetRosterId } from '../languages';
import type { LearnerLanguageId } from '../locales';
import type { LocalDictionaryStore } from '../dictionaries/local-store';
import {
    readFormSettings,
    renderDictionarySourceRows,
    renderKanjiSourceRows,
    renderLookupPillsEditor,
    renderRecommendedDictionaries,
} from './form';

export type DictionaryStatusSummary = Awaited<ReturnType<LocalDictionaryStore['summary']>>;

export interface DictionaryStatusElements {
    status: HTMLElement | null;
    priorities: HTMLElement | null;
    kanjiPriorities: HTMLElement | null;
    lookupPills: HTMLElement | null;
    recommended: HTMLElement | null;
}

export interface DictionaryPanelRenderContext {
    settings: ReaderSettings;
    learnerLanguage: LearnerLanguageId;
    targetLanguage: LearningTargetRosterId;
}

export function dictionaryStatusElements(form: HTMLFormElement): DictionaryStatusElements {
    return {
        status: form.querySelector<HTMLElement>('[data-dictionary-status]'),
        priorities: form.querySelector<HTMLElement>('[data-definition-source-editor]'),
        kanjiPriorities: form.querySelector<HTMLElement>('[data-kanji-source-editor]'),
        lookupPills: form.querySelector<HTMLElement>('.jpdb-reader-lookup-links'),
        recommended: form.querySelector<HTMLElement>('[data-recommended-dictionaries]'),
    };
}

function liveDictionarySettings(
    form: HTMLFormElement,
    settings: ReaderSettings,
): ReaderSettings {
    const live = readFormSettings(new FormData(form), settings);
    const missing = new Map(settings.dictionaryPreferences.map(item => [item.name, item]));
    live.dictionaryPreferences = live.dictionaryPreferences.filter(item => missing.delete(item.name));
    live.dictionaryPreferences.push(...missing.values());
    return live;
}

export function liveDictionaryPanelContext(
    form: HTMLFormElement,
    settings: ReaderSettings,
): DictionaryPanelRenderContext {
    return {
        settings: liveDictionarySettings(form, settings),
        // Japanese dictionaries with English definitions (ADR-0024).
        learnerLanguage: 'en',
        targetLanguage: 'ja',
    };
}

export function renderDictionaryStatusElements(
    elements: DictionaryStatusElements,
    summary: DictionaryStatusSummary,
    settings: ReaderSettings,
    learnerLanguage: LearnerLanguageId,
    targetLanguage: LearningTargetRosterId,
    expandCatalogBrowse?: boolean,
): void {
    renderDictionaryStatusLine(elements.status, summary, settings);
    renderDictionaryPriorities(elements, settings);
    renderDictionaryLookupPills(elements.lookupPills, summary, settings);
    renderDictionaryRecommendations(
        elements.recommended,
        summary,
        learnerLanguage,
        targetLanguage,
        expandCatalogBrowse,
    );
}

function renderDictionaryStatusLine(
    element: HTMLElement | null,
    summary: DictionaryStatusSummary,
    settings: ReaderSettings,
): void {
    if (!element) return;
    element.textContent = summary.dictionaries.length
        ? formatUiText(settings.interfaceLanguage, 'dictionaryStatusSummary', {
            dictionaries: summary.dictionaries.length.toLocaleString(),
            terms: summary.terms.toLocaleString(),
            kanji: summary.kanji.toLocaleString(),
            metadata: summary.termMeta.toLocaleString(),
        })
        : uiText(settings.interfaceLanguage, 'noLocalDictionariesImported');
}

/**
 * The Sources and Kanji editors split the shelf between them, each submitting
 * its dictionaries as `dictionaryPreferences.<index>` of the shelf it was
 * rendered from, so a changed shelf re-renders both or their indices collide.
 */
function renderDictionaryPriorities(elements: DictionaryStatusElements, settings: ReaderSettings): void {
    if (elements.priorities) setInnerHtml(elements.priorities, renderDictionarySourceRows(settings));
    if (elements.kanjiPriorities) setInnerHtml(elements.kanjiPriorities, renderKanjiSourceRows(settings));
}

function renderDictionaryLookupPills(
    element: HTMLElement | null,
    summary: DictionaryStatusSummary,
    settings: ReaderSettings,
): void {
    if (!element) return;
    setInnerHtml(element, renderLookupPillsEditor(settings, summary.dictionaries));
}

function renderDictionaryRecommendations(
    element: HTMLElement | null,
    summary: DictionaryStatusSummary,
    learnerLanguage: LearnerLanguageId,
    targetLanguage: LearningTargetRosterId,
    expandCatalogBrowse?: boolean,
): void {
    if (!element) return;
    setInnerHtml(
        element,
        renderRecommendedDictionaries(
            summary.dictionaries,
            learnerLanguage,
            true,
            targetLanguage,
            expandCatalogBrowse,
        ),
    );
}
