// Owner: locale-hu
import { defineLocaleCatalog } from "../catalog";

export const huCatalog = defineLocaleCatalog("hu", "machine-draft", {
  setupTitle: "A よむ beállítása az Ön nyelvén",
  learnerLanguageLabel: "Az Ön nyelve",
  targetLanguageLabel: "A tanult nyelv",
  targetJapanese: "Japán",
  recommendedDictionariesTitle: "Ajánlott japán szótárak",
  automaticTranslationLabel: "Automatikus fordítás {language} nyelvre",
  dictionaryCountAndSize:
    "{count, plural, one {# szótár} other {# szótár}} · {size}",
  setupProgress: "Nyelvi beállítás: {current}/{total}",
  continueAction: "Folytatás",
  originalDefinitionLabel: "Eredeti meghatározás ({language})",
  interfaceRtlVerificationPending: "A jobbról balra elrendezés ellenőrzése még folyik.",
  interfaceTranslationPending: "A fordítás még folyamatban van.",
});
