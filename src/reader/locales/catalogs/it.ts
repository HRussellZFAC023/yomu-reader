// Owner: locale-it
import { defineLocaleCatalog } from "../catalog";

export const itCatalog = defineLocaleCatalog("it", "machine-draft", {
  setupTitle: "Configura よむ nella tua lingua",
  learnerLanguageLabel: "La tua lingua",
  targetLanguageLabel: "Lingua che stai imparando",
  targetJapanese: "Giapponese",
  recommendedDictionariesTitle: "Dizionari di giapponese consigliati",
  automaticTranslationLabel: "Traduci automaticamente in {language}",
  dictionaryCountAndSize:
    "{count, plural, one {# dizionario} other {# dizionari}} · {size}",
  setupProgress: "Configurazione della lingua: {current} di {total}",
  continueAction: "Continua",
  originalDefinitionLabel: "Definizione originale in {language}",
  interfaceRtlVerificationPending: "I controlli del layout da destra a sinistra sono ancora in corso.",
  interfaceTranslationPending: "La traduzione è ancora in corso.",
});
