// Owner: locale-zh
import { defineLocaleCatalog } from "../catalog";

export const zhCatalog = defineLocaleCatalog("zh", "machine-draft", {
  setupTitle: "用您的语言设置よむ",
  learnerLanguageLabel: "您的语言",
  targetLanguageLabel: "您正在学习的语言",
  targetJapanese: "日语",
  recommendedDictionariesTitle: "推荐日语词典",
  automaticTranslationLabel: "自动翻译为{language}",
  dictionaryCountAndSize:
    "{count, plural, one {#部词典} other {#部词典}} · {size}",
  setupProgress: "语言设置：第{current}步，共{total}步",
  continueAction: "继续",
  originalDefinitionLabel: "{language}原文",
});
