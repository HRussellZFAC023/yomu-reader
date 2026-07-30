// Owner: locale-tr
import { defineLocaleCatalog } from "../catalog";

export const trCatalog = defineLocaleCatalog("tr", "machine-draft", {
  setupTitle: "Yomu'yu dilinizde ayarlayın",
  learnerLanguageLabel: "Diliniz",
  targetLanguageLabel: "Öğrendiğiniz dil",
  targetJapanese: "Japonca",
  recommendedDictionariesTitle: "Önerilen Japonca sözlükler",
  automaticTranslationLabel: "Otomatik olarak {language} diline çevir",
  dictionaryCountAndSize:
    "{count, plural, one {# sözlük} other {# sözlük}} · {size}",
  setupProgress: "Dil ayarı: {current}/{total}",
  continueAction: "Devam et",
  originalDefinitionLabel: "Orijinal tanım ({language})",
  interfaceRtlVerificationPending: "Sağdan sola yerleşim denetimleri hâlâ sürüyor.",
  interfaceTranslationPending: "Çeviri hâlâ sürüyor.",
});
