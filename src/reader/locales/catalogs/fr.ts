// Owner: locale-fr
import { defineLocaleCatalog } from "../catalog";

export const frCatalog = defineLocaleCatalog("fr", "machine-draft", {
  setupTitle: "Configurez よむ dans votre langue",
  learnerLanguageLabel: "Votre langue",
  targetLanguageLabel: "Langue que vous apprenez",
  targetJapanese: "Japonais",
  recommendedDictionariesTitle: "Dictionnaires de japonais recommandés",
  automaticTranslationLabel: "Traduire automatiquement en {language}",
  dictionaryCountAndSize:
    "{count, plural, one {# dictionnaire} other {# dictionnaires}} · {size}",
  setupProgress: "Configuration de la langue : {current} sur {total}",
  continueAction: "Continuer",
  originalDefinitionLabel: "Définition originale en {language}",
  interfaceRtlVerificationPending: "Les vérifications de la mise en page de droite à gauche sont en cours.",
  interfaceTranslationPending: "La traduction est en cours.",
});
