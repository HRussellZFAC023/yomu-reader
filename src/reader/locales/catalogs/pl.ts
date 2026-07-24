// Owner: locale-pl
import { defineLocaleCatalog } from "../catalog";

export const plCatalog = defineLocaleCatalog("pl", "machine-draft", {
  setupTitle: "Skonfiguruj Yomu w swoim języku",
  learnerLanguageLabel: "Twój język",
  targetLanguageLabel: "Język, którego się uczysz",
  targetJapanese: "Japoński",
  recommendedDictionariesTitle: "Polecane słowniki języka japońskiego",
  automaticTranslationLabel: "Tłumacz automatycznie na język {language}",
  dictionaryCountAndSize:
    "{count, plural, one {# słownik} few {# słowniki} many {# słowników} other {# słownika}} · {size}",
  setupProgress: "Konfiguracja języka: {current} z {total}",
  continueAction: "Kontynuuj",
  originalDefinitionLabel: "Oryginalna definicja ({language})",
});
