// Owner: locale-nl
import { defineLocaleCatalog } from "../catalog";

export const nlCatalog = defineLocaleCatalog("nl", "machine-draft", {
  setupTitle: "Stel よむ in jouw taal in",
  learnerLanguageLabel: "Jouw taal",
  targetLanguageLabel: "Taal die je leert",
  targetJapanese: "Japans",
  recommendedDictionariesTitle: "Aanbevolen Japanse woordenboeken",
  automaticTranslationLabel: "Automatisch vertalen naar {language}",
  dictionaryCountAndSize:
    "{count, plural, one {# woordenboek} other {# woordenboeken}} · {size}",
  setupProgress: "Taal instellen: {current} van {total}",
  continueAction: "Doorgaan",
  originalDefinitionLabel: "Oorspronkelijke definitie ({language})",
  interfaceRtlVerificationPending: "De controles voor rechts-naar-links-opmaak lopen nog.",
  interfaceTranslationPending: "De vertaling is nog bezig.",
});
