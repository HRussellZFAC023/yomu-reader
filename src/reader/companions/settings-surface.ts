import './learning-targets';
import '../dom/register-decoration-policy-runtime';
import { SettingsDialogController } from '../settings/dialog-controller';
import { registerSettingsServices } from './settings-services';

registerSettingsServices(SettingsDialogController);
