import { describe, expect, it } from "vitest";
import languageConfig from "../../../config/multilingual/languages.json";
import {
  LEARNER_LANGUAGES,
  LEARNER_LANGUAGE_IDS,
  SLICE_ONE_LEARNER_LANGUAGE_COUNT,
  SLICE_ONE_TARGET_LANGUAGE,
  learnerLanguageById,
  resolveLearnerLanguage,
} from "../../../src/reader/locales";

const EXPECTED_IDS = [
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

describe("Slice 1 learner-language roster", () => {
  it("freezes the accepted 32 languages in one deterministic order", () => {
    expect(LEARNER_LANGUAGE_IDS).toEqual(EXPECTED_IDS);
    expect(LEARNER_LANGUAGES.map((language) => language.id)).toEqual(
      EXPECTED_IDS,
    );
    expect(languageConfig.languages.map((language) => language.id)).toEqual(
      EXPECTED_IDS,
    );
    expect(LEARNER_LANGUAGES).toHaveLength(32);
    expect(SLICE_ONE_LEARNER_LANGUAGE_COUNT).toBe(32);
    expect(languageConfig.expectedLearnerLanguageCount).toBe(32);
  });

  it("keeps Japanese as the target and Old Irish outside the learner roster", () => {
    expect(SLICE_ONE_TARGET_LANGUAGE).toBe("ja");
    expect(languageConfig.targetLanguage).toBe("ja");
    expect(LEARNER_LANGUAGE_IDS).not.toContain("ja");
    expect(LEARNER_LANGUAGE_IDS).not.toContain("sga");
    expect(languageConfig.derivation.excluded).toEqual([
      expect.objectContaining({ id: "ja" }),
      expect.objectContaining({ id: "sga" }),
    ]);
  });

  it("records unique native labels, valid runtime locales, scripts, and directions", () => {
    expect(new Set(LEARNER_LANGUAGES.map((language) => language.id)).size).toBe(
      32,
    );
    for (const language of LEARNER_LANGUAGES) {
      expect(language.englishName.trim()).not.toBe("");
      expect(language.nativeName.trim()).not.toBe("");
      expect(() =>
        Intl.getCanonicalLocales(language.runtimeLocale),
      ).not.toThrow();
      expect(language.defaultScript).toMatch(/^[A-Z][a-z]{3}$/);
      expect(language.scripts).toContain(language.defaultScript);
      expect(
        language.scripts.every((script) => /^[A-Z][a-z]{3}$/.test(script)),
      ).toBe(true);
      expect(["ltr", "rtl"]).toContain(language.direction);
    }
  });

  it("makes script and direction decisions explicit for the non-default cases", () => {
    expect(learnerLanguageById("zh")).toMatchObject({
      runtimeLocale: "zh-Hans",
      defaultScript: "Hans",
      scripts: ["Hans", "Hant"],
    });
    expect(learnerLanguageById("yue")).toMatchObject({
      runtimeLocale: "yue-Hant",
      defaultScript: "Hant",
    });
    expect(learnerLanguageById("sh")).toMatchObject({
      runtimeLocale: "sr-Latn",
      scripts: ["Latn", "Cyrl"],
    });
    expect(learnerLanguageById("tl").runtimeLocale).toBe("fil");
    expect(
      LEARNER_LANGUAGES.filter((language) => language.direction === "rtl").map(
        (language) => language.id,
      ),
    ).toEqual(["ar", "fa"]);
  });

  it("resolves browser locales without changing the frozen catalogue IDs", () => {
    expect(resolveLearnerLanguage("ko-KR").id).toBe("ko");
    expect(resolveLearnerLanguage("zh-TW").id).toBe("zh");
    expect(resolveLearnerLanguage("fil-PH").id).toBe("tl");
    expect(resolveLearnerLanguage("sr-Cyrl").id).toBe("sh");
    expect(resolveLearnerLanguage("hr-HR").id).toBe("sh");
    expect(resolveLearnerLanguage("not-a-language").id).toBe("en");
    expect(resolveLearnerLanguage(null).id).toBe("en");
  });
});
