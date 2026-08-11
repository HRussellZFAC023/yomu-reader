import type { ReaderSettings } from '../app/types';
import { formatUiText, uiText } from '../app/i18n';
import { setInnerHtml } from '../dom/index';
import { isLearningTargetRosterId, type LearningTargetRosterId } from '../languages';
import { isLearnerLanguageId, type LearnerLanguageId } from '../locales';
import type { YomitanDictionaryStore } from '../dictionaries/yomitan';
import {
    activeLearnerLanguageId,
    activeTargetLanguageId,
    readFormSettings,
    renderDictionarySourceRows,
    renderLookupPillsEditor,
    renderRecommendedDictionaries,
} from './form';

export type DictionaryStatusSummary = Awaited<ReturnType<YomitanDictionaryStore['summary']>>;

export interface DictionaryStatusElements {
    status: HTMLElement | null;
    priorities: HTMLElement | null;
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
        learnerLanguage: selectedLearnerLanguage(form, settings),
        targetLanguage: selectedTargetLanguage(form, settings),
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
    renderDictionaryPriorities(elements.priorities, settings);
    renderDictionaryLookupPills(elements.lookupPills, summary, settings, targetLanguage);
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

function renderDictionaryPriorities(element: HTMLElement | null, settings: ReaderSettings): void {
    if (!element) return;
    setInnerHtml(element, renderDictionarySourceRows(settings));
}

function renderDictionaryLookupPills(
    element: HTMLElement | null,
    summary: DictionaryStatusSummary,
    settings: ReaderSettings,
    targetLanguage: LearningTargetRosterId,
): void {
    if (!element) return;
    setInnerHtml(element, renderLookupPillsEditor(settings, summary.dictionaries, targetLanguage));
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

function selectedLearnerLanguage(form: HTMLFormElement, settings: ReaderSettings): LearnerLanguageId {
    const value = form.querySelector<HTMLSelectElement>('select[name="learnerLanguage"]')?.value;
    return value && isLearnerLanguageId(value) ? value : activeLearnerLanguageId(settings);
}

export function selectedTargetLanguage(form: HTMLFormElement, settings: ReaderSettings): LearningTargetRosterId {
    const value = form.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')?.value;
    return value && isLearningTargetRosterId(value) ? value : activeTargetLanguageId(settings);
}
