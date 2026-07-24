// Owner: locale-ko
import { defineLocaleCatalog } from "../catalog";

export const koCatalog = defineLocaleCatalog("ko", "machine-draft", {
  setupTitle: "내 언어로 よむ 설정하기",
  learnerLanguageLabel: "사용 언어",
  targetLanguageLabel: "학습할 언어",
  targetJapanese: "일본어",
  recommendedDictionariesTitle: "추천 일본어 사전",
  automaticTranslationLabel: "{language}로 자동 번역",
  dictionaryCountAndSize:
    "{count, plural, one {사전 #개} other {사전 #개}} · {size}",
  setupProgress: "언어 설정: {total}단계 중 {current}단계",
  continueAction: "계속",
  originalDefinitionLabel: "원문({language})",
});
