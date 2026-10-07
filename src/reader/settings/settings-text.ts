import { uiText } from '../app/i18n';
import type { InterfaceLanguage } from '../app/types';

export type SettingsText = (key: Parameters<typeof uiText>[1]) => string;

/** Every settings label, in the learner's interface language. */
export function settingsText(language: InterfaceLanguage): SettingsText {
    return key => uiText(language, key);
}
