import type { ReaderSettings } from '../app/types';
import { uiText } from '../app/i18n';
import { activeLanguageProfile } from '../languages/profiles';
import { isSupportedTranslationLanguage, TRANSLATION_LANGUAGES } from '../translation/languages';
import { select } from './form-controls';

export function renderTranslationLanguageControl(settings: ReaderSettings): string {
    const saved = activeLanguageProfile(settings.languageProfiles, settings.activeLanguageProfileId)?.outputLanguage ?? 'en';
    const options: [string, string][] = TRANSLATION_LANGUAGES.map(language => [
        language.runtimeLocale,
        language.nativeName === language.englishName ? language.nativeName : `${language.nativeName} · ${language.englishName}`,
    ]);
    // Retain a saved region/script or retired destination verbatim on an untouched Save.
    if (!options.some(([tag]) => tag === saved)) {
        options.push([saved, isSupportedTranslationLanguage(saved) ? saved : `${saved} · ${uiText(settings.interfaceLanguage, 'unavailable')}`]);
    }
    return `<div class="grid">${select('translationLanguage', uiText(settings.interfaceLanguage, 'translationLanguage'), saved, options)}</div>
        <div class="jpdb-reader-help" data-help-key="translationLanguageHelp">${uiText(settings.interfaceLanguage, 'translationLanguageHelp')}</div>`;
}
