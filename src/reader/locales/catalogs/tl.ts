// Owner: locale-tl
import { defineLocaleCatalog } from "../catalog";

export const tlCatalog = defineLocaleCatalog("tl", "machine-draft", {
  setupTitle: "I-set up ang Yomu sa iyong wika",
  learnerLanguageLabel: "Iyong wika",
  targetLanguageLabel: "Wikang pinag-aaralan mo",
  targetJapanese: "Wikang Hapon",
  recommendedDictionariesTitle:
    "Mga inirerekomendang diksyunaryo ng wikang Hapon",
  automaticTranslationLabel: "Awtomatikong isalin sa {language}",
  dictionaryCountAndSize:
    "{count, plural, one {# diksyunaryo} other {# diksyunaryo}} · {size}",
  setupProgress: "Pag-set up ng wika: {current} sa {total}",
  continueAction: "Magpatuloy",
  originalDefinitionLabel: "Orihinal na depinisyon ({language})",
  interfaceRtlVerificationPending: "Tumatakbo pa ang mga pagsusuri sa layout mula kanan pakaliwa.",
  interfaceTranslationPending: "Isinasalin pa ito.",
});
