import { cardStateLabel, uiText } from './i18n';
import type { InterfaceLanguage } from './types';

/** A provider's state for a word: Academy keeps a saved word "in deck" with no schedule, which Library and Stats call "Saved". */
export function providerCardStateLabel(providerId: string, state: string, language: InterfaceLanguage): string {
    return providerId === 'yomu-local' && state === 'in-deck' ? uiText(language, 'savedWord') : cardStateLabel(state, language);
}
