import { activeLearningTarget } from './target-runtime';
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
 * Bare language hint for OCR providers that want a short code rather than a full
 * BCP-47 tag (Cloud Vision `languageHints`, the local service's
 * `two_letter_code`, the Lens `Accept-Language`).
 *
 * This used to end in `.slice(0, 2)`, which silently mangled every target whose
 * subtag is three letters: `fil` became `fi` — Finnish, a real language an OCR
 * engine will happily weight toward — and `yue`/`grc` became `yu`/`gr`, codes no
 * engine knows (b19). Targets whose own subtag no engine recognises declare an
 * engine-recognised hint in their module instead of being truncated into one.
 */
export function targetOcrLanguageHint(configured?: string | null): string {
    const configuredTag = configured?.trim();
    // A target's declared hint is already the code to send and is used verbatim.
    // Passing it back through `languageSubtag` would undo the point: Intl
    // canonicalises the deprecated `tl` to `fil`, so Tagalog's hint of `tl` came
    // straight back as `fil` again.
    if (!configuredTag) return activeLearningTarget().ocr.languageHint;
    return languageSubtag(configuredTag) ?? configuredTag;
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
    // Revision 9 only auto-wrote defaults for the two OCR-capable targets it
    // declared. Revision 10 makes OCR target-locale for every target, but that
    // must not retroactively reinterpret an explicit `de-DE` (or any other
    // newly supported tag) as machine-owned and erase it during migration.
    return LEGACY_MACHINE_WRITTEN_OCR_DEFAULTS.has(tag);
}

const LEGACY_MACHINE_WRITTEN_OCR_DEFAULTS = new Set(['ja-jp', 'ko-kr']);

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

/** Translation destination: track tag, fallback tag, or active target. */
export function targetSubtitleLanguageTag(track?: { targetLanguage?: string; language?: string }): LanguageTag {
    if (!track) return activeLearningTarget().subtitles.languageTag;
    return track.targetLanguage || track.language || activeLearningTarget().subtitles.languageTag;
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
