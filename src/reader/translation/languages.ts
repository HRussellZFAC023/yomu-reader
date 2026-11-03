import type { ReaderSettings } from '../app/types';
import { activeLanguageProfile } from '../languages/profiles';
import { LEARNER_LANGUAGES } from '../locales/roster';
import { googleTranslationLanguageCapability } from './google';

/** Offer only destinations already supported by the translation adapter. */
export const TRANSLATION_LANGUAGES = LEARNER_LANGUAGES.filter(language =>
    googleTranslationLanguageCapability(language.runtimeLocale).supported,
);

export function isSupportedTranslationLanguage(language: string): boolean {
    try {
        return new Intl.Locale(language).language !== 'ja'
            && googleTranslationLanguageCapability(language).supported;
    } catch {
        return false;
    }
}

/** Translation output is independent of Japanese lookup and UI copy. */
export function translationOutputLanguage(settings: Pick<ReaderSettings, 'languageProfiles' | 'activeLanguageProfileId'>): string {
    const saved = activeLanguageProfile(settings.languageProfiles, settings.activeLanguageProfileId)?.outputLanguage;
    return saved && isSupportedTranslationLanguage(saved) ? saved : 'en';
}
