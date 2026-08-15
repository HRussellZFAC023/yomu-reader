import { OnboardingController } from '../app/onboarding';
import { enumerateDictionaryArchiveStorageKeys } from '../dictionaries/archive-cache';
import { installOfflineParsingDictionaries } from '../dictionaries/offline-setup';
import { YomitanDictionaryStore } from '../dictionaries/yomitan';
import { renderStructuredGlossaryHtml } from '../dictionaries/yomitan/structured-content';
import {
    nestedSettingsParseAlreadyRendered,
    nestedSettingsTextParsePlan,
    SETTINGS_PARSE_TARGET_LIMIT,
} from '../lookup/nested-text-parse';
import {
    parsedSettingsTargetsForCurrentPlan,
    supplementSettingsFallbackTokens,
} from '../lookup/settings-fallback-tokens';
import {
    addSettingsRubyFromRenderedReadings,
    settingsForSettingsFormParse,
} from '../lookup/settings-parse-render';
import { LookupModalAccessibility } from '../popup/modal-accessibility-impl';
import {
    hasTargetLookupSites,
    isTargetLookupLinkId,
    lookupSiteComponents,
    missingLookupComponents,
    targetLookupLinks,
    targetLookupSiteIds,
    targetLookupSites,
} from '../settings/lookup-links';
import { installDefinitionTranslationBehaviors } from '../sources/definition-translation';
import { installAcademyReaderSrsSync } from '../srs/account-sync';
import {
    registerYomuCompanion,
    yomuSettingsDialogController,
    type SettingsDialogControllerClass,
} from './registry';

/** Registers the settings capabilities shared by full and launcher-only runtimes. */
export function registerSettingsServices(
    SettingsDialogController?: SettingsDialogControllerClass,
): void {
    registerYomuCompanion('settings', {
        SettingsDialogController: SettingsDialogController ?? yomuSettingsDialogController(),
        LookupModalAccessibility,
        OnboardingController,
        installOfflineParsingDictionaries,
        installDefinitionTranslationBehaviors,
        installAcademyReaderSrsSync,
        selfEnhancement: {
            SETTINGS_PARSE_TARGET_LIMIT,
            nestedSettingsParseAlreadyRendered,
            nestedSettingsTextParsePlan,
            parsedSettingsTargetsForCurrentPlan,
            supplementSettingsFallbackTokens,
            addSettingsRubyFromRenderedReadings,
            settingsForSettingsFormParse,
        },
        lookupLinks: {
            hasTargetLookupSites,
            targetLookupSiteIds,
            isTargetLookupLinkId,
            targetLookupSites,
            targetLookupLinks,
            lookupSiteComponents,
            missingLookupComponents,
        },
    });
    registerYomuCompanion('localDictionaries', {
        YomitanDictionaryStore,
        renderStructuredGlossaryHtml,
        enumerateDictionaryArchiveStorageKeys,
    });
}
