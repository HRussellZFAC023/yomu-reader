import { SettingsDialogController } from '../settings/dialog-controller';
import { YomitanDictionaryStore } from '../dictionaries/yomitan';
import { registerYomuCompanion } from './registry';

registerYomuCompanion('settings', { SettingsDialogController });
registerYomuCompanion('localDictionaries', { YomitanDictionaryStore });
