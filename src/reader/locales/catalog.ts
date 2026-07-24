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

export function extractMessagePlaceholders(message: string): readonly string[] {
  return Object.freeze(
    [...message.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)(?:\s*,|\})/g)]
      .map((match) => match[1])
      .filter(
        (placeholder, index, values) => values.indexOf(placeholder) === index,
      )
      .sort(),
  );
}

export interface LocaleCatalogValidationIssue {
  kind: "missing-key" | "extra-key" | "placeholder-mismatch";
  key: string;
  expected?: readonly string[];
  actual?: readonly string[];
}

export function validateLocaleCatalog(
  candidate: Readonly<Record<string, string>>,
  source: LocaleMessages = ENGLISH_FALLBACK_MESSAGES,
): readonly LocaleCatalogValidationIssue[] {
  const issues: LocaleCatalogValidationIssue[] = [];
  const sourceKeys = Object.keys(source);
  const candidateKeys = Object.keys(candidate);

  for (const key of sourceKeys) {
    if (!(key in candidate)) {
      issues.push({ kind: "missing-key", key });
      continue;
    }
    const expected = extractMessagePlaceholders(
      source[key as LocaleMessageKey],
    );
    const actual = extractMessagePlaceholders(candidate[key]);
    if (expected.join("\u0000") !== actual.join("\u0000")) {
      issues.push({ kind: "placeholder-mismatch", key, expected, actual });
    }
  }
  for (const key of candidateKeys) {
    if (!(key in source)) issues.push({ kind: "extra-key", key });
  }
  return Object.freeze(issues);
}
