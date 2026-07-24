// Owner: locale-th
import { defineLocaleCatalog } from "../catalog";

export const thCatalog = defineLocaleCatalog("th", "machine-draft", {
  setupTitle: "ตั้งค่า Yomu ในภาษาของคุณ",
  learnerLanguageLabel: "ภาษาของคุณ",
  targetLanguageLabel: "ภาษาที่คุณกำลังเรียน",
  targetJapanese: "ภาษาญี่ปุ่น",
  recommendedDictionariesTitle: "พจนานุกรมภาษาญี่ปุ่นที่แนะนำ",
  automaticTranslationLabel: "แปลเป็น{language}โดยอัตโนมัติ",
  dictionaryCountAndSize:
    "{count, plural, other {พจนานุกรม # รายการ}} · {size}",
  setupProgress: "ตั้งค่าภาษา {current} จาก {total}",
  continueAction: "ดำเนินการต่อ",
  originalDefinitionLabel: "คำจำกัดความต้นฉบับ ({language})",
});
