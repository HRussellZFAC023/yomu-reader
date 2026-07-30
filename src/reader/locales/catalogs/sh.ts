// Owner: locale-sh
import { defineLocaleCatalog } from "../catalog";

export const shCatalog = defineLocaleCatalog("sh", "machine-draft", {
  setupTitle: "Podesite Yomu na svom jeziku",
  learnerLanguageLabel: "Vaš jezik",
  targetLanguageLabel: "Jezik koji učite",
  targetJapanese: "Japanski",
  recommendedDictionariesTitle: "Preporučeni japanski rečnici",
  automaticTranslationLabel: "Automatski prevod na jezik {language}",
  dictionaryCountAndSize:
    "{count, plural, one {# rečnik} few {# rečnika} other {# rečnika}} · {size}",
  setupProgress: "Podešavanje jezika: {current} od {total}",
  continueAction: "Nastavi",
  originalDefinitionLabel: "Originalna definicija ({language})",
  interfaceRtlVerificationPending: "Provjere rasporeda s desna na lijevo još su u toku.",
  interfaceTranslationPending: "Prijevod je još u toku.",
});
