import type {
  LearnerLanguageId,
  LocaleCatalog,
  TranslationReviewStatus,
} from "./types";

export const ENGLISH_FALLBACK_MESSAGES = {
  setupTitle: "Set up Yomu in your language",
  learnerLanguageLabel: "Your language",
  targetLanguageLabel: "Language you are learning",
  targetJapanese: "Japanese",
  recommendedDictionariesTitle: "Recommended Japanese dictionaries",
  automaticTranslationLabel: "Translate automatically into {language}",
  dictionaryCountAndSize:
    "{count, plural, one {# dictionary} other {# dictionaries}} · {size}",
  setupProgress: "Language setup {current} of {total}",
  continueAction: "Continue",
  originalDefinitionLabel: "Original {language}",
  // D43: a locale that is in scope but not yet selectable says why, in its own
  // language, so the person who came looking for it can read the answer. The
  // interface never offers one of these and then quietly speaks English.
  interfaceRtlVerificationPending:
    "Right-to-left layout checks are still running.",
  interfaceTranslationPending: "Translation is still in progress.",
} as const;

export type LocaleMessageKey = keyof typeof ENGLISH_FALLBACK_MESSAGES;
export type LocaleMessages = Readonly<Record<LocaleMessageKey, string>>;
export type YomuLocaleCatalog = LocaleCatalog<LocaleMessageKey>;

export function defineLocaleCatalog(
  locale: LearnerLanguageId,
  reviewStatus: TranslationReviewStatus,
  messages: LocaleMessages,
): YomuLocaleCatalog {
  return Object.freeze({
    locale,
    reviewStatus,
    sourceLocale: "en",
    messages: Object.freeze(messages),
  });
}
