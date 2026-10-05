// Use the canonical cross-directory path so the split userscript build can
// substitute the i18n companion facade. A same-directory `./i18n` import
// bypasses that alias and duplicates the full copy catalogue in core.
import { cardStateLabel, uiText } from '../app/i18n';
import type { InterfaceLanguage } from './types';

/** A provider's state for a word: Academy keeps a saved word "in deck" with no schedule, which Library and Stats call "Saved". */
export function providerCardStateLabel(providerId: string, state: string, language: InterfaceLanguage): string {
    return providerId === 'yomu-local' && state === 'in-deck' ? uiText(language, 'savedWord') : cardStateLabel(state, language);
}
