export const LEARNER_LANGUAGE_IDS = [
  "sq",
  "grc",
  "ar",
  "yue",
  "zh",
  "da",
  "nl",
  "en",
  "fi",
  "fr",
  "de",
  "el",
  "hu",
  "id",
  "it",
  "km",
  "ko",
  "lo",
  "la",
  "mn",
  "fa",
  "pl",
  "pt",
  "ro",
  "ru",
  "sh",
  "es",
  "sv",
  "tl",
  "th",
  "tr",
  "vi",
] as const;

export type LearnerLanguageId = (typeof LEARNER_LANGUAGE_IDS)[number];
export type TextDirection = "ltr" | "rtl";
export type TranslationReviewStatus =
  "scaffold" | "source-approved" | "machine-draft" | "native-reviewed";

export interface LearnerLanguage {
  id: LearnerLanguageId;
  runtimeLocale: string;
  englishName: string;
  nativeName: string;
  defaultScript: string;
  scripts: readonly string[];
  direction: TextDirection;
}

export interface LocaleCatalog<MessageKey extends string = string> {
  locale: LearnerLanguageId;
  reviewStatus: TranslationReviewStatus;
  sourceLocale: "en";
  messages: Readonly<Record<MessageKey, string>>;
}
