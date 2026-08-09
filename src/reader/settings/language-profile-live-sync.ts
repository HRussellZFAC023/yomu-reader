import type { DictionaryLookupLink, ReaderSettings } from '../app/types';
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
import {
    dictionaryLookupLinksForTarget,
    normalizeDictionaryLookupLinks,
} from './dictionary';
import { syncLanguageFamilyDom } from './language-gating';
import { syncYoutubeImmersionTarget } from './youtube-panel';

export type LanguageProfileFormSyncRequest =
    | { source: 'durable-settings'; previousSettings: ReaderSettings }
    | { source: 'target-picker'; targetLanguage: LearningTargetRosterId };

interface LanguageProfileFormSyncDependencies {
    refreshTargetControls: (targetLanguage: LearningTargetRosterId) => void;
}

interface LanguageProfileFormFacetChanges {
    profileControls: boolean;
    targetLanguage: boolean;
    lookupLinks: boolean;
    interfaceLocalization: boolean;
    youtubeBaseline: boolean;
    dependentControls: boolean;
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
    if (request.source === 'target-picker') {
        syncPickedTarget(form, settings, request.targetLanguage, dependencies);
        return;
    }
    syncAdoptedLanguageProfileForm(form, request.previousSettings, settings, dependencies);
}

function syncPickedTarget(
    form: HTMLFormElement,
    settings: ReaderSettings,
    targetLanguage: LearningTargetRosterId,
    dependencies: LanguageProfileFormSyncDependencies,
): void {
    syncLanguageFamilyDom(form, targetLanguage);
    syncYoutubeImmersionTarget(form, settings, targetLanguage);
    syncLookupPills(form, settings, 'live-form', targetLanguage);
    localizeSettingsForm(form, settings.interfaceLanguage);
    dependencies.refreshTargetControls(targetLanguage);
}

function syncAdoptedLanguageProfileForm(
    form: HTMLFormElement,
    previousSettings: ReaderSettings,
    settings: ReaderSettings,
    dependencies: LanguageProfileFormSyncDependencies,
): void {
    const targetLanguage = activeTargetLanguageId(settings);
    const changes = languageProfileFormFacetChanges(previousSettings, settings);
    syncAdoptedLanguageFacets(form, settings, targetLanguage, changes);
    syncAdoptedPresentationFacets(form, settings, targetLanguage, changes, dependencies);
}

function syncAdoptedLanguageFacets(
    form: HTMLFormElement,
    settings: ReaderSettings,
    targetLanguage: LearningTargetRosterId,
    changes: LanguageProfileFormFacetChanges,
): void {
    if (changes.profileControls) syncAdoptedProfileControls(form, settings);
    if (changes.targetLanguage) syncLanguageFamilyDom(form, targetLanguage);
    if (changes.lookupLinks) syncLookupPills(form, settings, 'durable-settings', targetLanguage);
}

function syncAdoptedPresentationFacets(
    form: HTMLFormElement,
    settings: ReaderSettings,
    targetLanguage: LearningTargetRosterId,
    changes: LanguageProfileFormFacetChanges,
    dependencies: LanguageProfileFormSyncDependencies,
): void {
    if (changes.youtubeBaseline) syncYoutubeImmersionTarget(form, settings, targetLanguage, true);
    if (changes.interfaceLocalization) localizeSettingsForm(form, settings.interfaceLanguage);
    if (changes.dependentControls) dependencies.refreshTargetControls(targetLanguage);
}

function languageProfileFormFacetChanges(
    previousSettings: ReaderSettings,
    settings: ReaderSettings,
): LanguageProfileFormFacetChanges {
    return {
        profileControls: profileControlsKey(previousSettings) !== profileControlsKey(settings),
        targetLanguage: activeTargetLanguageId(previousSettings) !== activeTargetLanguageId(settings),
        lookupLinks: lookupSurfaceKey(previousSettings) !== lookupSurfaceKey(settings),
        interfaceLocalization: localizationSurfaceKey(previousSettings) !== localizationSurfaceKey(settings),
        youtubeBaseline: youtubeBaselineKey(previousSettings) !== youtubeBaselineKey(settings),
        dependentControls: dependentControlsKey(previousSettings) !== dependentControlsKey(settings),
    };
}

function profileControlsKey(settings: ReaderSettings): string {
    const profile = activeLanguageProfile(settings.languageProfiles, settings.activeLanguageProfileId);
    if (!profile) {
        return JSON.stringify([
            settings.activeLanguageProfileId,
            activeTargetLanguageId(settings),
            activeLearnerLanguageId(settings),
            settings.parserProvider,
            [],
        ]);
    }
    return JSON.stringify([
        settings.activeLanguageProfileId,
        activeTargetLanguageId(settings),
        activeLearnerLanguageId(settings),
        profile.parserProvider,
        [...profile.definitionTranslationProviderIds].sort(),
    ]);
}

function lookupSurfaceKey(settings: ReaderSettings): string {
    const targetLanguage = activeTargetLanguageId(settings);
    // Persisting an unrelated machine update emits a full normalized settings
    // value. Compare the surface we would actually render, not the raw stored
    // array, so adding missing built-ins during that normalization does not
    // masquerade as a lookup-pill edit and erase an unsaved live reorder.
    const renderedLinks = normalizeDictionaryLookupLinks(
        settings.dictionaryLookupLinks,
        false,
        targetLanguage,
    );
    return JSON.stringify([
        targetLanguage,
        renderedLinks.map(dictionaryLookupLinkKey),
    ]);
}

function dictionaryLookupLinkKey(link: DictionaryLookupLink): readonly unknown[] {
    return [
        link.id,
        link.label,
        link.urlTemplate,
        link.enabled,
        link.action ?? null,
        link.priority ?? null,
    ];
}

function localizationSurfaceKey(settings: ReaderSettings): string {
    return JSON.stringify([
        settings.interfaceLanguage,
        activeTargetLanguageId(settings),
        activeLearnerLanguageId(settings),
    ]);
}

function youtubeBaselineKey(settings: ReaderSettings): string {
    return JSON.stringify([
        activeTargetLanguageId(settings),
        settings.youtubeImmersionEnabled,
        settings.youtubeImmersionEnabledChosen,
    ]);
}

function dependentControlsKey(settings: ReaderSettings): string {
    return JSON.stringify([
        settings.activeLanguageProfileId,
        activeTargetLanguageId(settings),
        activeLearnerLanguageId(settings),
    ]);
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
    source: 'durable-settings' | 'live-form',
    targetLanguage: LearningTargetRosterId,
): void {
    const container = form.querySelector<HTMLElement>('.jpdb-reader-lookup-links');
    if (!container) return;
    const sourceLinks = source === 'durable-settings'
        ? settings.dictionaryLookupLinks
        : dictionaryLookupLinksForTarget(lookupLinkRows(new FormData(form)), targetLanguage);
    setInnerHtml(container, renderDictionaryLookupLinkEditor(
        sourceLinks,
        [],
        targetLanguage,
    ));
}
