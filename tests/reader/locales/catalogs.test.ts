import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import ownershipConfig from "../../../config/multilingual/locale-ownership.json";
import {
  ENGLISH_FALLBACK_MESSAGES,
  LEARNER_LANGUAGE_IDS,
  LOCALE_CATALOGS,
  extractMessagePlaceholders,
  validateLocaleCatalog,
} from "../../../src/reader/locales";

describe("Slice 1 locale catalogues", () => {
  it("has one catalogue and one exclusive owner for every roster language", () => {
    expect(Object.keys(LOCALE_CATALOGS)).toEqual([...LEARNER_LANGUAGE_IDS]);
    expect(
      ownershipConfig.catalogues.map((catalogue) => catalogue.locale),
    ).toEqual([...LEARNER_LANGUAGE_IDS]);
    expect(
      new Set(ownershipConfig.catalogues.map((catalogue) => catalogue.path))
        .size,
    ).toBe(32);
    expect(
      new Set(ownershipConfig.catalogues.map((catalogue) => catalogue.owner))
        .size,
    ).toBe(32);

    const ownedFiles = readdirSync("src/reader/locales/catalogs")
      .filter((file) => file.endsWith(".ts") && file !== "index.ts")
      .sort();
    const manifestFiles = ownershipConfig.catalogues
      .map((catalogue) => basename(catalogue.path))
      .sort();
    expect(ownedFiles).toEqual(manifestFiles);
  });

  it("keeps every owned file present, correctly labelled, and outside Academy", () => {
    for (const catalogue of ownershipConfig.catalogues) {
      expect(existsSync(catalogue.path), catalogue.path).toBe(true);
      const source = readFileSync(catalogue.path, "utf8");
      expect(source.split("\n")[0]).toBe(`// Owner: ${catalogue.owner}`);
      expect(catalogue.path.toLowerCase()).not.toContain("academy");
      expect(source.toLowerCase()).not.toContain("academy");
    }
  });

  it("enforces key and placeholder parity across all 32 catalogues", () => {
    for (const language of LEARNER_LANGUAGE_IDS) {
      const catalogue = LOCALE_CATALOGS[language];
      expect(catalogue.locale).toBe(language);
      expect(catalogue.sourceLocale).toBe("en");
      expect(validateLocaleCatalog(catalogue.messages), language).toEqual([]);
      if (language === "en") {
        expect(catalogue.reviewStatus).toBe("source-approved");
      } else {
        expect(["scaffold", "machine-draft"]).toContain(
          catalogue.reviewStatus,
        );
      }
    }
  });

  it("does not mistake English-backed scaffolds for completed translations", () => {
    expect(
      Object.values(LOCALE_CATALOGS).filter(
        (catalogue) => catalogue.reviewStatus === "native-reviewed",
      ),
    ).toEqual([]);
    const nonEnglish = Object.values(LOCALE_CATALOGS).filter(
      (catalogue) => catalogue.locale !== "en",
    );
    expect(
      nonEnglish.filter(
        (catalogue) =>
          catalogue.reviewStatus === "scaffold" ||
          catalogue.reviewStatus === "machine-draft",
      ),
    ).toHaveLength(31);
  });

  it("extracts unique named placeholders deterministically", () => {
    expect(extractMessagePlaceholders("{count} of {total}: {count}")).toEqual([
      "count",
      "total",
    ]);
    expect(
      extractMessagePlaceholders(
        "{count, plural, one {# item} other {# items}} · {size}",
      ),
    ).toEqual(["count", "size"]);
    expect(extractMessagePlaceholders("No variables")).toEqual([]);
  });

  it("reports missing, extra, and placeholder-drift defects", () => {
    const broken = {
      ...ENGLISH_FALLBACK_MESSAGES,
      automaticTranslationLabel: "Translate automatically into {locale}",
      unexpected: "Not in the source",
    };
    delete (broken as Partial<typeof broken>).setupTitle;

    expect(validateLocaleCatalog(broken)).toEqual([
      { kind: "missing-key", key: "setupTitle" },
      {
        kind: "placeholder-mismatch",
        key: "automaticTranslationLabel",
        expected: ["language"],
        actual: ["locale"],
      },
      { kind: "extra-key", key: "unexpected" },
    ]);
  });

  it("keeps the foundation message namespace outside Academy scope", () => {
    expect(
      Object.keys(ENGLISH_FALLBACK_MESSAGES).some((key) =>
        key.toLowerCase().includes("academy"),
      ),
    ).toBe(false);
  });
});
