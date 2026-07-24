// Owner: locale-grc
import { defineLocaleCatalog } from "../catalog";

export const grcCatalog = defineLocaleCatalog("grc", "machine-draft", {
  setupTitle: "Παρασκεύαζε τὸ よむ κατὰ τὴν σὴν γλῶτταν",
  learnerLanguageLabel: "Ἡ σὴ γλῶττα",
  targetLanguageLabel: "Ἡ γλῶττα ἣν μανθάνεις",
  targetJapanese: "Ἰαπωνική",
  recommendedDictionariesTitle: "Τὰ αἱρετὰ λεξικὰ τῆς Ἰαπωνικῆς",
  automaticTranslationLabel: "Μεθερμήνευε αὐτομάτως εἰς {language}",
  dictionaryCountAndSize:
    "{count, plural, one {# λεξικόν} other {# λεξικά}} · {size}",
  setupProgress: "Ἡ παρασκευὴ τῆς γλώττης· {current} ἐκ {total}",
  continueAction: "Πρόβαινε",
  originalDefinitionLabel: "Τὸ πρωτότυπον ({language})",
});
