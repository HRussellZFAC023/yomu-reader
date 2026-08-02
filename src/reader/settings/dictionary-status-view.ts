import type { ReaderSettings } from '../app/types';
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

export function dictionaryStatusElements(form: HTMLFormElement): DictionaryStatusElements {
    return {
        status: form.querySelector<HTMLElement>('[data-dictionary-status]'),
        priorities: form.querySelector<HTMLElement>('[data-definition-source-editor]'),
        lookupPills: form.querySelector<HTMLElement>('.jpdb-reader-lookup-links'),
        recommended: form.querySelector<HTMLElement>('[data-recommended-dictionaries]'),
    };
}

export function dictionaryStatusSettingsForRender(
    form: HTMLFormElement,
    settings: ReaderSettings,
): ReaderSettings {
    const live = readFormSettings(new FormData(form), settings);
    const missing = new Map(settings.dictionaryPreferences.map(preference => [preference.name, preference]));
    live.dictionaryPreferences = live.dictionaryPreferences.filter(preference => missing.delete(preference.name));
    live.dictionaryPreferences.push(...missing.values());
    return live;
}

export function renderDictionaryStatusElements(
    elements: DictionaryStatusElements,
    summary: DictionaryStatusSummary,
    settings: ReaderSettings,
    learnerLanguage: LearnerLanguageId,
    targetLanguage: LearningTargetRosterId,
    statusText: string,
): void {
    if (elements.status) elements.status.textContent = statusText;
    if (elements.priorities) setInnerHtml(elements.priorities, renderDictionarySourceRows(settings));
    if (elements.lookupPills) {
        setInnerHtml(elements.lookupPills, renderLookupPillsEditor(settings, summary.dictionaries, targetLanguage));
    }
    if (elements.recommended) {
        setInnerHtml(
            elements.recommended,
            renderRecommendedDictionaries(summary.dictionaries, learnerLanguage, true, targetLanguage),
        );
    }
}

export function selectedLearnerLanguage(form: HTMLFormElement, settings: ReaderSettings): LearnerLanguageId {
    const value = form.querySelector<HTMLSelectElement>('select[name="learnerLanguage"]')?.value;
    return value && isLearnerLanguageId(value) ? value : activeLearnerLanguageId(settings);
}

export function selectedTargetLanguage(form: HTMLFormElement, settings: ReaderSettings): LearningTargetRosterId {
    const value = form.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')?.value;
    return value && isLearningTargetRosterId(value) ? value : activeTargetLanguageId(settings);
}
