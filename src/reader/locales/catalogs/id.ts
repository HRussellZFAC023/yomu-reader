// Owner: locale-id
import { defineLocaleCatalog } from "../catalog";

export const idCatalog = defineLocaleCatalog("id", "machine-draft", {
  setupTitle: "Siapkan Yomu dalam bahasa Anda",
  learnerLanguageLabel: "Bahasa Anda",
  targetLanguageLabel: "Bahasa yang sedang Anda pelajari",
  targetJapanese: "Bahasa Jepang",
  recommendedDictionariesTitle: "Kamus bahasa Jepang yang direkomendasikan",
  automaticTranslationLabel: "Terjemahkan secara otomatis ke {language}",
  dictionaryCountAndSize:
    "{count, plural, one {# kamus} other {# kamus}} · {size}",
  setupProgress: "Penyiapan bahasa {current} dari {total}",
  continueAction: "Lanjutkan",
  originalDefinitionLabel: "Definisi asli dalam {language}",
  interfaceRtlVerificationPending: "Pemeriksaan tata letak kanan ke kiri masih berjalan.",
  interfaceTranslationPending: "Penerjemahan masih berlangsung.",
});
