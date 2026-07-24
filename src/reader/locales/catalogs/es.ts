// Owner: locale-es
import { defineLocaleCatalog } from "../catalog";

export const esCatalog = defineLocaleCatalog("es", "machine-draft", {
  setupTitle: "Configura Yomu en tu idioma",
  learnerLanguageLabel: "Tu idioma",
  targetLanguageLabel: "Idioma que estás aprendiendo",
  targetJapanese: "Japonés",
  recommendedDictionariesTitle: "Diccionarios de japonés recomendados",
  automaticTranslationLabel: "Traducir automáticamente al {language}",
  dictionaryCountAndSize:
    "{count, plural, one {# diccionario} other {# diccionarios}} · {size}",
  setupProgress: "Configuración del idioma: {current} de {total}",
  continueAction: "Continuar",
  originalDefinitionLabel: "Definición original ({language})",
});
