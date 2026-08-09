import type { ReaderSettings } from '../app/types';
import { setInnerHtml } from '../dom/index';
import {
    activeLanguageProfile,
    type LearningTargetRosterId,
} from '../languages';
import {
    activeLearnerLanguageId,
    activeTargetLanguageId,
    localizeSettingsForm,
    lookupLinkRows,
    renderDictionaryLookupLinkEditor,
} from './form';
import { dictionaryLookupLinksForTarget } from './dictionary';
import { syncLanguageFamilyDom } from './language-gating';
import { syncYoutubeImmersionTarget } from './youtube-panel';

export type LanguageProfileFormSyncRequest =
    | { source: 'durable-settings' }
    | { source: 'target-picker'; targetLanguage: LearningTargetRosterId };

interface LanguageProfileFormSyncDependencies {
    refreshTargetControls: (targetLanguage: LearningTargetRosterId) => void;
}

/**
 * Atomically re-stamps every live form surface owned by the active language
 * profile. It deliberately updates DOM without dispatching a change event: a
 * durable SETTINGS_CHANGE_EVENT is an adoption, not another user preview.
 */
export function syncLanguageProfileForm(
    form: HTMLFormElement,
    settings: ReaderSettings,
    request: LanguageProfileFormSyncRequest,
    dependencies: LanguageProfileFormSyncDependencies,
): void {
    const targetLanguage = targetLanguageForRequest(settings, request);
    if (request.source === 'durable-settings') syncAdoptedProfileControls(form, settings);
    syncLanguageFamilyDom(form, targetLanguage);
    syncYoutubeImmersionTarget(form, settings, targetLanguage, request.source === 'durable-settings');
    syncLookupPills(form, settings, request, targetLanguage);
    localizeSettingsForm(form, settings.interfaceLanguage);
    dependencies.refreshTargetControls(targetLanguage);
}

function targetLanguageForRequest(
    settings: ReaderSettings,
    request: LanguageProfileFormSyncRequest,
): LearningTargetRosterId {
    return request.source === 'target-picker'
        ? request.targetLanguage
        : activeTargetLanguageId(settings);
}

function syncAdoptedProfileControls(form: HTMLFormElement, settings: ReaderSettings): void {
    const profile = activeLanguageProfile(settings.languageProfiles, settings.activeLanguageProfileId);
    const profileControls = profile
        ? {
            parserProvider: profile.parserProvider,
            translationProviderIds: profile.definitionTranslationProviderIds,
        }
        : {
            parserProvider: settings.parserProvider,
            translationProviderIds: [],
        };
    setSelectValue(form, 'targetLanguage', activeTargetLanguageId(settings));
    setSelectValue(form, 'learnerLanguage', activeLearnerLanguageId(settings));
    setSelectValue(form, 'parserProvider', profileControls.parserProvider);
    syncTranslationProviders(form, profileControls.translationProviderIds);
}

function setSelectValue(form: HTMLFormElement, name: string, value: string): void {
    const select = form.querySelector<HTMLSelectElement>(`select[name="${name}"]`);
    if (select) select.value = value;
}

function syncTranslationProviders(form: HTMLFormElement, enabledProviderIds: readonly string[]): void {
    const enabled = new Set(enabledProviderIds);
    form.querySelectorAll<HTMLInputElement>('input[name="definitionTranslationProviderIds"]')
        .forEach(input => { input.checked = enabled.has(input.value); });
}

function syncLookupPills(
    form: HTMLFormElement,
    settings: ReaderSettings,
    request: LanguageProfileFormSyncRequest,
    targetLanguage: LearningTargetRosterId,
): void {
    const container = form.querySelector<HTMLElement>('.jpdb-reader-lookup-links');
    if (!container) return;
    const sourceLinks = request.source === 'durable-settings'
        ? settings.dictionaryLookupLinks
        : lookupLinkRows(new FormData(form));
    setInnerHtml(container, renderDictionaryLookupLinkEditor(
        dictionaryLookupLinksForTarget(sourceLinks, targetLanguage),
        [],
        targetLanguage,
    ));
}
