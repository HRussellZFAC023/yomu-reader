import './learning-targets';
import '../dom/register-decoration-policy-runtime';
import { SettingsDialogController } from '../settings/dialog-controller';
import { LookupModalAccessibility } from '../popup/modal-accessibility-impl';
import { OnboardingController } from '../app/onboarding';
import { installOfflineParsingDictionaries } from '../dictionaries/offline-setup';
import { YomitanDictionaryStore } from '../dictionaries/yomitan';
import { ensureLocalDictionariesReplicated } from '../dictionaries/replication';
import { enumerateDictionaryArchiveStorageKeys } from '../dictionaries/archive-cache';
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
import { installDefinitionTranslationBehaviors } from '../sources/definition-translation';
import { installAcademyReaderSrsSync } from '../srs/account-sync';
import {
    hasTargetLookupSites,
    isTargetLookupLinkId,
    lookupSiteComponents,
    missingLookupComponents,
    targetLookupLinks,
    targetLookupSiteIds,
    targetLookupSites,
} from '../settings/lookup-links';
import { registerYomuCompanion } from './registry';

registerYomuCompanion('settings', {
    SettingsDialogController,
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
    ensureLocalDictionariesReplicated,
    enumerateDictionaryArchiveStorageKeys,
});
