// Owner: locale-vi
import { defineLocaleCatalog } from "../catalog";

export const viCatalog = defineLocaleCatalog("vi", "machine-draft", {
  setupTitle: "Thiết lập Yomu bằng ngôn ngữ của bạn",
  learnerLanguageLabel: "Ngôn ngữ của bạn",
  targetLanguageLabel: "Ngôn ngữ bạn đang học",
  targetJapanese: "Tiếng Nhật",
  recommendedDictionariesTitle: "Từ điển tiếng Nhật được đề xuất",
  automaticTranslationLabel: "Tự động dịch sang {language}",
  dictionaryCountAndSize:
    "{count, plural, other {# từ điển}} · {size}",
  setupProgress: "Thiết lập ngôn ngữ: {current} trên {total}",
  continueAction: "Tiếp tục",
  originalDefinitionLabel: "Định nghĩa gốc ({language})",
  interfaceRtlVerificationPending: "Việc kiểm tra bố cục từ phải sang trái vẫn đang diễn ra.",
  interfaceTranslationPending: "Bản dịch vẫn đang được thực hiện.",
});
