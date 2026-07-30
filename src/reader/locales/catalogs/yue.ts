// Owner: locale-yue
import { defineLocaleCatalog } from "../catalog";

export const yueCatalog = defineLocaleCatalog("yue", "machine-draft", {
  setupTitle: "用你嘅語言設定よむ",
  learnerLanguageLabel: "你嘅語言",
  targetLanguageLabel: "你學緊嘅語言",
  targetJapanese: "日文",
  recommendedDictionariesTitle: "推薦嘅日文字典",
  automaticTranslationLabel: "自動翻譯做{language}",
  dictionaryCountAndSize:
    "{count, plural, one {# 本字典} other {# 本字典}} · {size}",
  setupProgress: "語言設定：第{current}步，共{total}步",
  continueAction: "繼續",
  originalDefinitionLabel: "原文（{language}）",
  interfaceRtlVerificationPending: "由右至左排版檢查仲進行中。",
  interfaceTranslationPending: "翻譯仲進行中。",
});
