import { SettingsDialogController } from '../settings/dialog-controller';
import { OnboardingController } from '../app/onboarding';
import { YomitanDictionaryStore } from '../dictionaries/yomitan';
import { ensureLocalDictionariesReplicated } from '../dictionaries/replication';
import { registerYomuCompanion } from './registry';

registerYomuCompanion('settings', { SettingsDialogController, OnboardingController });
registerYomuCompanion('localDictionaries', { YomitanDictionaryStore, ensureLocalDictionariesReplicated });
