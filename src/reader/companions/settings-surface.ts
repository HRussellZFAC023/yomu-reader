import './learning-targets';
import { SettingsDialogController } from '../settings/dialog-controller';
import { LookupModalAccessibility } from '../popup/modal-accessibility-impl';
import { OnboardingController } from '../app/onboarding';
import { installOfflineParsingDictionaries } from '../dictionaries/offline-setup';
import { YomitanDictionaryStore } from '../dictionaries/yomitan';
import { ensureLocalDictionariesReplicated } from '../dictionaries/replication';
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
});
registerYomuCompanion('localDictionaries', { YomitanDictionaryStore, ensureLocalDictionariesReplicated });
