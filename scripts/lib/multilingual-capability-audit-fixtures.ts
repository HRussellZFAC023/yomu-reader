import type { LearningTargetRosterId } from "../../src/reader/languages/roster";

export interface TargetAuditFixture {
  readonly probe: string;
  readonly grammar: {
    readonly ruleId: string;
    readonly sentence: string;
  };
  readonly morphology?: {
    readonly input: string;
    readonly expected: string;
    readonly via: "candidates" | "subsegments";
  };
}

/**
 * One native-script lookup and one source-checked grammar surface per target.
 * The record is deliberately exhaustive: adding or removing a roster target
 * fails the contract audit until a human supplies behavior evidence for it.
 */
export const TARGET_AUDIT_FIXTURES: Readonly<
  Record<LearningTargetRosterId, TargetAuditFixture>
> = Object.freeze({
  ja: {
    probe: "猫",
    grammar: { ruleId: "particle-to", sentence: "友だちと話します。" },
    morphology: { input: "食べました", expected: "食べる", via: "candidates" },
  },
  sq: {
    probe: "ujë",
    grammar: { ruleId: "sq-existential-ka-ketu", sentence: "Ka mace këtu." },
  },
  grc: {
    probe: "ὕδωρ",
    grammar: { ruleId: "grc-negation-ou", sentence: "ὁ βίος οὐ βιωτὸς." },
  },
  ar: {
    probe: "كِتاب",
    grammar: { ruleId: "ar-msa-laysa-negation", sentence: "البيت ليس كبيرًا." },
    morphology: { input: "والكتاب", expected: "كتاب", via: "candidates" },
  },
  yue: {
    probe: "食飯",
    grammar: {
      ruleId: "yue-copular-negation-m-haih",
      sentence: "佢唔係學生。",
    },
  },
  zh: {
    probe: "學習",
    grammar: { ruleId: "zh-hsk3-yuelaiyue", sentence: "天氣越來越冷了。" },
  },
  da: {
    probe: "blå",
    grammar: {
      ruleId: "da-presentative-der-er",
      sentence: "Der er en bog på bordet.",
    },
  },
  nl: {
    probe: "café",
    grammar: {
      ruleId: "nl-presentative-er-is-zijn",
      sentence: "Er is een probleem.",
    },
  },
  en: {
    probe: "water",
    grammar: {
      ruleId: "en-a1-there-is-are",
      sentence: "There are two cafés nearby.",
    },
  },
  fi: {
    probe: "yö",
    grammar: {
      ruleId: "fi-adessive-possession",
      sentence: "Minulla on rahaa.",
    },
  },
  fr: {
    probe: "élève",
    grammar: {
      ruleId: "fr-present-progressive",
      sentence: "Nous sommes en train de manger.",
    },
  },
  de: {
    probe: "Bär",
    grammar: {
      ruleId: "de-a1-es-gibt",
      sentence: "Es gibt hier einen Bahnhof.",
    },
    morphology: { input: "gemacht", expected: "machen", via: "candidates" },
  },
  el: {
    probe: "νερό",
    grammar: {
      ruleId: "el-indicative-negation-den",
      sentence: "Δεν είναι εδώ.",
    },
  },
  hu: {
    probe: "víz",
    grammar: {
      ruleId: "hu-dative-possession-van",
      sentence: "Nekem van tollam.",
    },
  },
  id: {
    probe: "air",
    grammar: {
      ruleId: "id-negative-existential-tidak-ada",
      sentence: "Tidak ada burung di pohon itu.",
    },
  },
  it: {
    probe: "perché",
    grammar: { ruleId: "it-presentative-ci", sentence: "C’è un problema." },
  },
  km: {
    probe: "ទឹក",
    grammar: { ruleId: "km-discontinuous-negation", sentence: "ខ្ញុំមិនទៅទេ។" },
  },
  ko: {
    probe: "물",
    grammar: { ruleId: "ko-desire-go-sipda", sentence: "한국에 가고 싶어요." },
    morphology: { input: "학생이", expected: "학생", via: "subsegments" },
  },
  lo: {
    probe: "ເສືອ",
    grammar: { ruleId: "lo-preverbal-negation-bo", sentence: "ຂ້ອຍບໍ່ໄປ." },
  },
  la: {
    probe: "cūrā",
    grammar: {
      ruleId: "la-negative-copula-non-est",
      sentence: "Bellum non est bellum.",
    },
  },
  mn: {
    probe: "үг",
    grammar: {
      ruleId: "mn-nominal-negation-bish",
      sentence: "Энэ миний ном биш.",
    },
  },
  fa: {
    probe: "آب",
    grammar: {
      ruleId: "fa-negative-long-copula",
      sentence: "این کتاب خوب نیست.",
    },
  },
  pl: {
    probe: "żółć",
    grammar: {
      ruleId: "pl-negative-existential-nie-ma",
      sentence: "W naszym mieście nie ma muzeów.",
    },
  },
  pt: {
    probe: "água",
    grammar: {
      ruleId: "pt-existential-ha",
      sentence: "Há três pessoas na sala.",
    },
  },
  ro: {
    probe: "apă",
    grammar: {
      ruleId: "ro-necessity-trebuie-sa",
      sentence: "Trebuie să învăț.",
    },
  },
  ru: {
    probe: "ёлка",
    grammar: { ruleId: "ru-a1-kto-chto-eto", sentence: "Кто это?" },
    morphology: { input: "книгами", expected: "книга", via: "candidates" },
  },
  sh: {
    probe: "kuća",
    grammar: { ruleId: "sh-existential-nema-genitive", sentence: "Nema kave." },
  },
  es: {
    probe: "año",
    grammar: { ruleId: "es-me-gusta-infinitive", sentence: "Me gusta bailar." },
    morphology: { input: "hablando", expected: "hablar", via: "candidates" },
  },
  sv: {
    probe: "blå",
    grammar: {
      ruleId: "sv-presentative-det-finns",
      sentence: "Det finns en bok på bordet.",
    },
  },
  tl: {
    probe: "áso",
    grammar: {
      ruleId: "tl-existential-may-mayroon",
      sentence: "May aklat sa mesa.",
    },
  },
  th: {
    probe: "น้ำ",
    grammar: {
      ruleId: "th-copular-negation-mai-chai",
      sentence: "เขาไม่ใช่ครู",
    },
  },
  tr: {
    probe: "ağız",
    grammar: {
      ruleId: "tr-a1-a2-existence-var-yok",
      sentence: "Sınıfta tahta var.",
    },
  },
  vi: {
    probe: "nước",
    grammar: { ruleId: "vi-completed-da-roi", sentence: "Tôi đã ăn cơm rồi." },
  },
});
