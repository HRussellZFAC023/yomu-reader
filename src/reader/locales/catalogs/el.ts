// Owner: locale-el
import { defineLocaleCatalog } from "../catalog";

export const elCatalog = defineLocaleCatalog("el", "machine-draft", {
  setupTitle: "Ρυθμίστε το よむ στη γλώσσα σας",
  learnerLanguageLabel: "Η γλώσσα σας",
  targetLanguageLabel: "Γλώσσα που μαθαίνετε",
  targetJapanese: "Ιαπωνικά",
  recommendedDictionariesTitle: "Προτεινόμενα λεξικά για τα Ιαπωνικά",
  automaticTranslationLabel: "Αυτόματη μετάφραση στα {language}",
  dictionaryCountAndSize:
    "{count, plural, one {# λεξικό} other {# λεξικά}} · {size}",
  setupProgress: "Ρύθμιση γλώσσας: {current} από {total}",
  continueAction: "Συνέχεια",
  originalDefinitionLabel: "Πρωτότυπο κείμενο στα {language}",
  interfaceRtlVerificationPending: "Οι έλεγχοι διάταξης από δεξιά προς αριστερά είναι σε εξέλιξη.",
  interfaceTranslationPending: "Η μετάφραση είναι σε εξέλιξη.",
});
