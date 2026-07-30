// Owner: locale-pt
import { defineLocaleCatalog } from "../catalog";

export const ptCatalog = defineLocaleCatalog("pt", "machine-draft", {
  setupTitle: "Configure o Yomu no seu idioma",
  learnerLanguageLabel: "O seu idioma",
  targetLanguageLabel: "Idioma que está a aprender",
  targetJapanese: "Japonês",
  recommendedDictionariesTitle: "Dicionários de japonês recomendados",
  automaticTranslationLabel: "Traduzir automaticamente para {language}",
  dictionaryCountAndSize:
    "{count, plural, one {# dicionário} other {# dicionários}} · {size}",
  setupProgress: "Configuração do idioma: {current} de {total}",
  continueAction: "Continuar",
  originalDefinitionLabel: "Definição original ({language})",
  interfaceRtlVerificationPending: "As verificações do layout da direita para a esquerda ainda estão em andamento.",
  interfaceTranslationPending: "A tradução ainda está em andamento.",
});
