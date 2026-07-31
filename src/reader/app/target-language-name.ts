import { headwordLanguageName } from '../dictionaries/catalog-browse';
import { activeLearningTargetLanguage, languageSubtag } from '../languages';
import { targetLanguageOf } from '../languages/selection';
import { resolveUiLanguage } from './i18n';
import type { InterfaceLanguage, ReaderSettings } from './types';

/**
 * The name of the language the learner is studying, written in their interface
 * language — "Russian" in an English UI, 「ロシア語」in a Japanese one.
 *
 * One declaration because several labels take a `{language}` token now (the master
 * switch, the YouTube filter, the site-language redirect, the empty-scan toast) and
 * the substitution had started to appear in four places at once. Each copy is a
 * chance for one surface to drift or to leak the raw token, which is exactly what
 * happened while b20 was being fixed.
 */
export function targetLanguageDisplayName(settings: ReaderSettings): string {
    return languageDisplayNameFor(targetLanguageOf(settings), settings.interfaceLanguage);
}

/**
 * The same, for callers that have no settings object to hand and must read the
 * adopted runtime target instead.
 */
export function activeTargetLanguageDisplayName(interfaceLanguage: InterfaceLanguage): string {
    return languageDisplayNameFor(activeLearningTargetLanguage(), interfaceLanguage);
}

function languageDisplayNameFor(tag: string, interfaceLanguage: InterfaceLanguage): string {
    return headwordLanguageName(languageSubtag(tag) ?? 'ja', resolveUiLanguage(interfaceLanguage));
}
