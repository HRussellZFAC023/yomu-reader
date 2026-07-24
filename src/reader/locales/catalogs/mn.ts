// Owner: locale-mn
import { defineLocaleCatalog } from "../catalog";

export const mnCatalog = defineLocaleCatalog("mn", "machine-draft", {
  setupTitle: "よむ-г өөрийн хэлээр тохируулах",
  learnerLanguageLabel: "Таны хэл",
  targetLanguageLabel: "Таны сурч буй хэл",
  targetJapanese: "Япон хэл",
  recommendedDictionariesTitle: "Санал болгож буй япон хэлний толь бичгүүд",
  automaticTranslationLabel: "{language} хэл рүү автоматаар орчуулах",
  dictionaryCountAndSize:
    "{count, plural, one {# толь бичиг} other {# толь бичиг}} · {size}",
  setupProgress: "Хэлний тохиргоо: {current}/{total}",
  continueAction: "Үргэлжлүүлэх",
  originalDefinitionLabel: "Эх тайлбар ({language})",
});
