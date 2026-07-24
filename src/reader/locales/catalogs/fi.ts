// Owner: locale-fi
import { defineLocaleCatalog } from "../catalog";

export const fiCatalog = defineLocaleCatalog("fi", "machine-draft", {
  setupTitle: "Ota よむ käyttöön omalla kielelläsi",
  learnerLanguageLabel: "Oma kielesi",
  targetLanguageLabel: "Opiskelemasi kieli",
  targetJapanese: "Japani",
  recommendedDictionariesTitle: "Suositellut japanin kielen sanakirjat",
  automaticTranslationLabel: "Käännä automaattisesti: {language}",
  dictionaryCountAndSize:
    "{count, plural, one {# sanakirja} other {# sanakirjaa}} · {size}",
  setupProgress: "Kieliasetukset: vaihe {current}/{total}",
  continueAction: "Jatka",
  originalDefinitionLabel: "Alkuperäinen määritelmä ({language})",
});
