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
    elements: DictionaryStatusElements,
    settings: ReaderSettings,
): ReaderSettings {
    if (!elements.lookupPills?.isConnected) return settings;
    const live = readFormSettings(new FormData(form), settings);
    const currentNames = new Set(settings.dictionaryPreferences.map(preference => preference.name));
    const livePreferences = live.dictionaryPreferences.filter(preference => currentNames.has(preference.name));
    const liveNames = new Set(livePreferences.map(preference => preference.name));
    return {
        ...live,
        // The form owns unsaved order, toggles, aliases, and translation
        // choices. The current settings own installed membership, so append a
        // just-imported row and omit one that a concurrent delete removed.
        dictionaryPreferences: [
            ...livePreferences,
            ...settings.dictionaryPreferences.filter(preference => !liveNames.has(preference.name)),
        ],
    };
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
