// Owner: locale-ru
import { defineLocaleCatalog } from "../catalog";

export const ruCatalog = defineLocaleCatalog("ru", "machine-draft", {
  setupTitle: "Настройте Yomu на своём языке",
  learnerLanguageLabel: "Ваш язык",
  targetLanguageLabel: "Язык, который вы изучаете",
  targetJapanese: "Японский",
  recommendedDictionariesTitle: "Рекомендуемые словари японского языка",
  automaticTranslationLabel: "Автоматически переводить на {language}",
  dictionaryCountAndSize:
    "{count, plural, one {# словарь} few {# словаря} many {# словарей} other {# словаря}} · {size}",
  setupProgress: "Настройка языка: {current} из {total}",
  continueAction: "Продолжить",
  originalDefinitionLabel: "Оригинал определения ({language})",
  interfaceRtlVerificationPending: "Проверки вёрстки справа налево ещё идут.",
  interfaceTranslationPending: "Перевод ещё выполняется.",
});
