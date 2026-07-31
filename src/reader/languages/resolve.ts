import { activeLearningTarget, registeredLearningTargetModules } from './target-runtime';
import { languageDisplayName, languageSubtag } from './locale';
import type { LanguageTag } from './types';

/**
 * Small capability resolvers for core call sites that used to fall back to a
 * hardcoded Japanese literal. They exist so the "user setting, else the
 * target's default" rule is written once instead of at every provider.
 */

/** OCR request language: the configured tag, else the active target's default. */
export function targetOcrLanguageTag(configured?: string | null): LanguageTag {
    return configured?.trim() || activeLearningTarget().ocr.defaultLanguage;
}

/**
 * Bare language hint for OCR providers that only accept a two-letter code.
 * Derives from the configured tag when there is one, exactly as the providers
 * used to do by slicing their own hardcoded default.
 */
export function targetOcrLanguageHint(configured?: string | null): string {
    const target = activeLearningTarget().ocr;
    return (configured?.trim() || target.languageHint).slice(0, 2);
}

/**
 * Whether a configured OCR tag says no more than a registered target's own
 * default already says.
 *
 * Nothing in Yomu ever offers this tag as a choice — the settings field is
 * hidden — so a value that is exactly some target's default OCR language was
 * written by machinery, not by a person, and holding on to it only pins OCR to
 * a language the reader may have since stopped studying. Anything else was put
 * there deliberately (a hand-edited settings file, an import) and is left
 * alone. Used by the settings migration that unpins those stored defaults.
 */
export function isTargetDefaultOcrLanguageTag(value: string | null | undefined): boolean {
    const tag = value?.trim().toLowerCase();
    if (!tag) return false;
    return registeredLearningTargetModules()
        .some(module => module.capabilities.ocr && module.ocr.defaultLanguage.toLowerCase() === tag);
}

/**
 * The name of the language being studied, written in `locale`, for copy that
 * used to name Japanese in a string literal. Interface copy that says the
 * target out loud stays true when the reader switches target instead of
 * quietly describing a product they are not using.
 */
export function targetLanguageName(locale = 'en'): string {
    return languageDisplayName(activeLearningTarget().language, locale);
}

/** `SpeechSynthesisUtterance.lang` for target-language playback. */
export function targetSpeechSynthesisLocale(): LanguageTag {
    return activeLearningTarget().audio.speechSynthesisLocale;
}

/** Value substituted for `{language}` in user-configured audio URL templates. */
export function targetAudioTemplateLanguageToken(): string {
    return activeLearningTarget().audio.templateLanguageToken;
}

/** BCP-47 value to stamp in `lang=` on rendered target-language content. */
export function targetContentLocale(): LanguageTag {
    return activeLearningTarget().typography.contentLocale;
}

/** Locale used when sorting target-language strings. */
export function targetCollationLocale(): LanguageTag {
    return activeLearningTarget().collationLocale;
}

/**
 * The subtitle language code that means "the target language". Used as the
 * translation destination when a track carries no language of its own.
 */
export function targetSubtitleLanguageTag(): LanguageTag {
    return activeLearningTarget().subtitles.languageTag;
}

/**
 * Whether a subtitle language code/label means "the target language".
 *
 * The regional branch is unreachable for Japanese — every `ja`/`jp`/`jpn`
 * spelling is already folded to a bare `ja` by the subtitle source
 * normalizer before it gets here — so this stays byte-identical to the
 * `language === 'ja'` comparison it replaced, while a target whose codes are
 * not folded (`ko-KR`) still resolves.
 */
export function isTargetSubtitleLanguage(value: string | undefined): boolean {
    if (!value) return false;
    const subtitles = activeLearningTarget().subtitles;
    if (value === subtitles.languageTag) return true;
    if (subtitles.languageAliases.includes(value.toLowerCase())) return true;
    return /[-_]/.test(value) && languageSubtag(value) === subtitles.languageTag;
}
