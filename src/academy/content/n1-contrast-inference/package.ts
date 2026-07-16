import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from "../../domain/activity-runtime";
import type { MiningRequest } from "../../integration/yomu-bridge";
import {
  N1_CONTRAST_INFERENCE_PACKAGE_ID,
  N1_CONTRAST_INFERENCE_PROVENANCE,
} from "./source";
import type {
  N1ContrastInferencePackage,
  N1ContrastInferencePrerequisite,
  N1ContrastInferenceReaderSrsProjection,
} from "./types";

const TRANSFER = Object.freeze([
  "港に近い町では、以前は車で通り抜ける人を増やすことが商店街の利益につながると考えられていた。ところが、週末に歩いて訪れる人を調べると、短い滞在でも店を二、三軒回る人が少なくないことが分かった。",
  "市は車道をすべてなくすのではなく、朝と夕方を除く時間だけ水辺の一部を歩行者に開く案を出した。この案だけで売り上げが必ず伸びるとは言えないが、滞在の仕方を比べる材料にはなる。",
]);

const PREREQUISITES: readonly N1ContrastInferencePrerequisite[] = Object.freeze(
  [
    prerequisite(
      "grammar:n2-contrast-tokoroga",
      "対比表現の後で、話題の方向が変わることを追える。",
      "Can follow a change of direction after a contrast marker.",
    ),
    prerequisite(
      "reading:n2-claim-and-evidence",
      "主張と、それを支える観察を分けて読める。",
      "Can separate a claim from the observation that supports it.",
    ),
    prerequisite(
      "reading:n2-qualified-conclusion",
      "本文の根拠を超えない結論を選べる。",
      "Can choose a conclusion that does not exceed the passage evidence.",
    ),
  ],
);

export function createN1ContrastInferencePackage(): N1ContrastInferencePackage {
  const activity = Object.freeze({
    id: "activity:n1-contrast-inference",
    kind: "academy-n1-contrast-inference" as const,
    sourceQuestionId: N1_CONTRAST_INFERENCE_PROVENANCE.sourceId,
    conceptIds: [
      "reading:n1-contrast-structure",
      "reading:n1-observation-and-claim",
      "reading:n1-qualified-inference",
      "production:n1-evidence-bound-summary",
    ],
    responseKind: "n1-contrast-inference-v1" as const,
    curriculumPhase: "assessed-production" as const,
    prompt: {
      ja: "対比の流れを追い、根拠の範囲を守って要約しましょう。",
      en: "Track the contrast, then summarize without exceeding the evidence.",
    },
    answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
    provenance: N1_CONTRAST_INFERENCE_PROVENANCE,
    payload: {
      teaching: [
        teaching(
          "対比の両側を置く",
          "Name both sides of a contrast",
          "以前は〜と考えられていた。ところが、〜ことが分かった。",
          "前後を一つの意見に混ぜず、変わった点を追います。",
          "Do not merge both sides into one opinion; track what changed.",
        ),
        teaching(
          "観察と主張を分ける",
          "Separate observation from claim",
          "〜人が少なくないことが分かった。",
          "観察は、結論を支える材料ですが、結論そのものではありません。",
          "An observation supports a conclusion; it is not the conclusion itself.",
        ),
        teaching(
          "断定を狭める",
          "Keep the conclusion qualified",
          "必ず伸びるとは言えない。",
          "本文が保留したことを、選択肢で確定させません。",
          "Do not turn a reservation in the text into certainty in an option.",
        ),
      ],
      contrastMap: [
        {
          side: "before" as const,
          claim: "通り抜ける車を増やすことが商店街の利益につながる。",
        },
        {
          side: "after" as const,
          claim: "歩いて訪れる人の滞在の仕方にも注目する必要がある。",
        },
      ],
      transfer: {
        title: {
          ja: "オリジナル N1 転移文: 水辺の通り",
          en: "Original N1 transfer: the waterfront route",
        },
        paragraphs: TRANSFER,
        playbackText: TRANSFER.join(" "),
        authorship: "original-yomu-n1-transfer" as const,
      },
      production: {
        prompt: {
          ja: "二文で、本文が直接言えることと、まだ言えないことを分けて書いてください。",
          en: "In two sentences, separate what the passage supports directly from what it does not yet establish.",
        },
        guidance: {
          ja: "これはあなたの表現を残すための未採点メモです。自動採点は行いません。",
          en: "This is an ungraded note for your own wording. It is not automatically scored.",
        },
        fieldLabel: { ja: "根拠を守る要約", en: "Evidence-bounded summary" },
        authorship: "learner-authored-ungraded" as const,
      },
      questions: [
        question(
          "map-before",
          "contrast-map",
          "対比の前に置かれている考えはどれですか。",
          "Which idea appears before the contrast?",
          ["more-through-cars", "close-waterfront", "sales-certain"],
          "more-through-cars",
          "contrast-before",
        ),
        question(
          "map-after",
          "contrast-map",
          "対比の後で、新しく注目されるのは何ですか。",
          "What receives new attention after the contrast?",
          ["walking-stays", "all-cars-banned", "sales-certain"],
          "walking-stays",
          "contrast-after",
        ),
        question(
          "observation",
          "contrast-map",
          "「少なくないことが分かった」は、本文でどの役割ですか。",
          'What role does "was found to be not uncommon" have?',
          ["observation", "guarantee", "policy-decision"],
          "observation",
          "observation-not-claim",
        ),
        question(
          "qualified",
          "transfer",
          "本文の根拠を超えない判断はどれですか。",
          "Which judgment stays within the passage evidence?",
          ["route-material", "sales-certain", "all-cars-banned"],
          "route-material",
          "qualified-inference",
        ),
        question(
          "scope",
          "transfer",
          "市の案について本文が述べているのはどれですか。",
          "What does the passage state about the city proposal?",
          ["limited-opening", "all-day-closure", "guaranteed-sales"],
          "limited-opening",
          "policy-scope",
        ),
      ],
      passScore: 1 as const,
      feedback: {
        pass: {
          explanation: {
            ja: "対比、観察、限定された結論を分けて読み、根拠の範囲を守れました。",
            en: "You separated contrast, observation, and a qualified conclusion while keeping to the evidence.",
          },
        },
        lapse: {
          explanation: {
            ja: "対比の前後、観察、本文が保留したことを別々に確認しましょう。",
            en: "Check the two sides of the contrast, the observation, and what the passage leaves open separately.",
          },
          repairPrompt: {
            ja: "「ところが」「分かった」「とは言えない」「だけ」の周りに線を引いてください。",
            en: "Underline the clauses around tokoroga, wakatta, to wa ienai, and dake.",
          },
          nearbyExample: {
            ja: "利用者が増えた。しかし、制度を変えるべきだとまでは言えない。",
            en: "Use increased. However, that alone does not establish that the system should change.",
          },
        },
      },
      reviewTargets: [
        review(
          "tokoroga",
          "reading:n1-contrast-structure",
          "ところが",
          ["however; a shift from the preceding expectation"],
          TRANSFER[0],
          ["contrast-before", "contrast-after"],
        ),
        review(
          "sukunakunai",
          "reading:n1-observation-and-claim",
          "少なくないことが分かった",
          ["it was found to be not uncommon"],
          TRANSFER[0],
          ["observation-not-claim"],
        ),
        review(
          "to-wa-ienai",
          "reading:n1-qualified-inference",
          "必ず伸びるとは言えない",
          ["cannot say it will necessarily increase"],
          TRANSFER[1],
          ["qualified-inference"],
        ),
        review(
          "dake",
          "production:n1-evidence-bound-summary",
          "朝と夕方を除く時間だけ",
          ["only during times excluding morning and evening"],
          TRANSFER[1],
          ["policy-scope"],
        ),
      ],
    },
  });
  return Object.freeze({
    id: N1_CONTRAST_INFERENCE_PACKAGE_ID,
    band: "N1" as const,
    prerequisites: PREREQUISITES,
    activity,
    readerSrs: readerSrsProjection(),
  });
}

function prerequisite(
  conceptId: string,
  ja: string,
  en: string,
): N1ContrastInferencePrerequisite {
  return Object.freeze({
    conceptId,
    minimumEvidence: "introduced-and-attempted",
    reason: Object.freeze({ ja, en }),
  });
}
function teaching(
  ja: string,
  en: string,
  example: string,
  explanationJa: string,
  explanationEn: string,
) {
  return Object.freeze({
    title: Object.freeze({ ja, en }),
    example,
    explanation: Object.freeze({ ja: explanationJa, en: explanationEn }),
  });
}
function option(id: string, ja: string, en: string) {
  return Object.freeze({ id, label: Object.freeze({ ja, en }) });
}
function question(
  id: string,
  stage: "contrast-map" | "transfer",
  ja: string,
  en: string,
  optionIds: readonly string[],
  correctOptionId: string,
  errorTag: string,
) {
  const labels: Record<string, readonly [string, string]> = {
    "more-through-cars": [
      "通り抜ける車を増やすこと。",
      "Increasing through-traffic by car.",
    ],
    "close-waterfront": ["水辺を閉じること。", "Closing the waterfront."],
    "walking-stays": [
      "歩いて訪れる人の滞在の仕方。",
      "How walking visitors spend their time.",
    ],
    observation: [
      "結論を支える観察。",
      "An observation supporting a conclusion.",
    ],
    guarantee: [
      "必ず起こるという保証。",
      "A guarantee that something will happen.",
    ],
    "policy-decision": ["すでに決まった政策。", "A policy already decided."],
    "route-material": [
      "滞在の仕方を比べる材料になる。",
      "It can provide material for comparing ways of staying.",
    ],
    "sales-certain": [
      "売り上げが必ず伸びる。",
      "Sales will certainly increase.",
    ],
    "all-cars-banned": [
      "車道をすべてなくす。",
      "All roads for cars will be removed.",
    ],
    "limited-opening": [
      "朝夕以外だけ水辺の一部を開く。",
      "Open part of the waterfront only outside morning and evening.",
    ],
    "all-day-closure": ["一日中、車道を閉じる。", "Close the road all day."],
    "guaranteed-sales": [
      "売り上げの増加を保証する。",
      "Guarantee increased sales.",
    ],
  };
  return Object.freeze({
    id,
    stage,
    prompt: Object.freeze({ ja, en }),
    options: Object.freeze(optionIds.map((key) => option(key, ...labels[key]))),
    correctOptionId,
    errorTag,
  });
}
function review(
  suffix: string,
  conceptId: string,
  expression: string,
  meanings: readonly string[],
  sentence: string,
  repairFor: readonly string[],
) {
  return Object.freeze({
    id: `review:${N1_CONTRAST_INFERENCE_PACKAGE_ID}:${suffix}`,
    conceptId,
    expression,
    meanings: Object.freeze([...meanings]),
    sentence,
    repairFor: Object.freeze([...repairFor]),
  });
}
function readerSrsProjection(): N1ContrastInferenceReaderSrsProjection {
  return Object.freeze({
    readerSurfaceIds: Object.freeze([
      "reader:n1-contrast-inference-01:transfer:paragraph-1",
      "reader:n1-contrast-inference-01:transfer:paragraph-2",
    ]),
    miningRequests: Object.freeze(miningRequests()),
  });
}
function miningRequests(): MiningRequest[] {
  return [
    {
      expression: "少なくないことが分かった",
      sentence: TRANSFER[0],
      sourceTitle: "Yomu original N1 transfer: 水辺の通り",
      conceptIds: [
        "reading:n1-observation-and-claim",
        "reading:n1-contrast-structure",
      ],
    },
    {
      expression: "必ず伸びるとは言えない",
      sentence: TRANSFER[1],
      sourceTitle: "Yomu original N1 transfer: 水辺の通り",
      conceptIds: [
        "reading:n1-qualified-inference",
        "production:n1-evidence-bound-summary",
      ],
    },
  ];
}
