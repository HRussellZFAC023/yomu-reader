import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from "../../domain/activity-runtime";
import type { MiningRequest } from "../../integration/yomu-bridge";
import {
  N3_SOURCE_OPENING_ECO_READING,
  N3_SOURCE_OPENING_SOURCE_CATALOG,
  N3_SOURCE_OPENING_STAGE_PROVENANCE,
  N3_SOURCE_OPENING_TOBIRA_EVIDENCE,
  N3_SOURCE_OPENING_TOWN_FLOW_ITEMS,
} from "./source";
import type {
  N3SourceOpeningActivityMode,
  N3SourceOpeningModel,
  N3SourceOpeningPackage,
  N3SourceOpeningPackageId,
  N3SourceOpeningPrerequisite,
  N3SourceOpeningQuestion,
  N3SourceOpeningReaderSrsProjection,
  N3SourceOpeningReviewTarget,
  N3SourceOpeningStage,
  N3SourceOpeningTeachingPoint,
} from "./types";

const TOBIRA_AUDIO_URL = requiredSource(
  "official-web:tobira-l01-reading-audio",
).url!;

const TOWN_CONCEPTS = Object.freeze([
  "grammar:n3-te-kuru-viewpoint",
  "discourse:n3-sono-ue",
  "grammar:n3-benefactive-kureru",
  "grammar:n3-change-ni-naru",
  "grammar:n3-te-ikou-intention",
]);

const GEOGRAPHY_CONCEPTS = Object.freeze([
  "listening:n3-authentic-geography-gist",
  "reading:n3-geography-contrast",
  "grammar:n3-to-iwarete-iru",
]);

const EVIDENCE_CONCEPTS = Object.freeze([
  "reading:n3-causal-evidence",
  "reading:n3-source-attribution",
  "reading:n3-qualified-claim",
  "reading:n3-main-claim",
  "writing:n3-bounded-source-summary",
]);

export const N3_SOURCE_OPENING_PACKAGE_IDS: readonly N3SourceOpeningPackageId[] =
  Object.freeze([
    "n3-source-opening-01",
    "n3-source-opening-02",
    "n3-source-opening-03",
  ]);

export function createN3SourceOpeningPackage(
  id: N3SourceOpeningPackageId,
): N3SourceOpeningPackage {
  switch (id) {
    case "n3-source-opening-01":
      return townFlowPackage();
    case "n3-source-opening-02":
      return geographyListeningPackage();
    case "n3-source-opening-03":
      return evidenceReadingPackage();
    default:
      throw new TypeError(`Unknown N3 source-opening package: ${String(id)}`);
  }
}

function townFlowPackage(): N3SourceOpeningPackage {
  const stage = "town-flow" as const;
  const questions = N3_SOURCE_OPENING_TOWN_FLOW_ITEMS.map((item, index) =>
    sourceQuestion(
      item.id,
      item.id,
      "cloze-select",
      item.display,
      `Select the source completion for item ${index + 1}.`,
      item.choices,
      item.answer,
      item.explanation,
      item.english,
      [
        "town-viewpoint",
        "town-addition",
        "town-benefactive",
        "town-change",
        "town-forward-intention",
      ][index],
      TOWN_CONCEPTS[index],
    ),
  );
  const teaching = Object.freeze([
    teachingPoint(
      "視点を動かす",
      "Track the viewpoint",
      "町へ引っ越してきた。これからも住んでいこう。",
      "「〜てくる」は今いる所までの動き、「〜ていく」は今から先への動きを表せます。",
      "Te kuru can lead movement toward the speaker's current point; te iku can project movement or continuation forward.",
    ),
    teachingPoint(
      "情報を重ねる",
      "Add information in the same direction",
      "駅に近い。そのうえ、店も多い。",
      "「そのうえ」は、同じ方向の情報をもう一つ加えます。",
      "Sono ue adds another point in the same direction.",
    ),
    teachingPoint(
      "主語と受け手を追う",
      "Track the giver and receiver",
      "近所の人が教えてくれた。",
      "「人が〜てくれる」では、その人が話し手のために行動します。",
      "With hito ga te kureru, that person acts for the speaker or the speaker's group.",
    ),
  ]);
  const reviewTargets = Object.freeze(
    N3_SOURCE_OPENING_TOWN_FLOW_ITEMS.map((item, index) =>
      reviewTarget(
        `town-${index + 1}`,
        TOWN_CONCEPTS[index],
        item.answer,
        undefined,
        [item.english],
        item.display.replace("（　　　）", item.answer),
        [questions[index].errorTag],
        "n3-source-opening-01",
      ),
    ),
  );
  return packageRecord({
    id: "n3-source-opening-01",
    ordinal: 1,
    stage,
    concepts: TOWN_CONCEPTS,
    prerequisites: Object.freeze([
      prerequisite(
        "grammar:n4-te-kuru",
        "「〜てくる」の基本的な移動・変化を学習済みであること。",
        "Has learned the basic movement and change use of te kuru.",
      ),
      prerequisite(
        "grammar:n4-adversative-kedo",
        "「が／けれども」で前後の流れを追えること。",
        "Can follow a clause transition marked by ga or keredomo.",
      ),
      prerequisite(
        "reading:n4-main-claim",
        "短い文章を文ごとにつないで読んだ経験があること。",
        "Has linked sentences across a short N4 text.",
      ),
    ]),
    prompt: {
      ja: "引っ越し後の五文をつなぎ、視点・追加・授受・変化・これからの意志を追いましょう。",
      en: "Build the five-sentence moving-town sequence by tracking viewpoint, addition, benefaction, change, and forward intention.",
    },
    teaching,
    stimulus: Object.freeze({
      kind: "cloze-sequence" as const,
      title: Object.freeze({
        ja: "Soya N3 文章の文法: 新しい町",
        en: "Soya N3 text grammar: a new town",
      }),
      sourceItemIds: Object.freeze(
        N3_SOURCE_OPENING_TOWN_FLOW_ITEMS.map((item) => item.id),
      ),
    }),
    questions: Object.freeze(questions),
    passScore: 0.8,
    feedback: feedback(
      "五文の流れを保ったまま、話し手の視点と情報のつながりを選べました。",
      "You kept the five sentences coherent while tracking viewpoint and information flow.",
      "空所だけでなく、「先月」「そのうえ」「近所の人が」「おかげで」「これからも」を順に見直しましょう。",
      "Re-read the sequence through sengetsu, sono ue, kinjo no hito ga, okage de, and korekara mo.",
      "各文で、時間・接続・主語・変化・意志のどれが答えを決めるか印を付けてください。",
      "Mark whether time, connection, subject, change, or intention decides each completion.",
      "先月ここへ来ました。そのうえ、友達もできたので、これからも勉強していこうと思います。",
      "I came here last month. On top of that, I made friends, so I intend to keep studying here.",
    ),
    reviewTargets,
    readerSrs: readerSrs(
      "n3-source-opening-01",
      N3_SOURCE_OPENING_TOWN_FLOW_ITEMS.map(
        (item) => `reader:n3-source-opening-01:answer:${item.id}`,
      ),
      N3_SOURCE_OPENING_TOWN_FLOW_ITEMS.map((item, index) =>
        mining(
          item.answer,
          item.display.replace("（　　　）", item.answer),
          `Soya N3 mock 1 grammar: ${item.id}`,
          [TOWN_CONCEPTS[index]],
        ),
      ),
    ),
  });
}

function geographyListeningPackage(): N3SourceOpeningPackage {
  const stage = "geography-listening" as const;
  const questions = Object.freeze([
    authoredQuestion(
      "tobira-geography-gist",
      "tobira-l01-audio",
      "listening-gist",
      "読み物全体の中心に最も近いものはどれですか。",
      "Choose the closest overall focus of the reading.",
      [
        "日本の地理、地域差、各地の特色。",
        "東京の電車の乗り方だけ。",
        "一人の旅行者の一日の予定。",
      ],
      0,
      "日本の島、都道府県、気候、各地の名所が順に説明されています。",
      "The reading moves through Japan's islands, prefectures, climate, and regional landmarks.",
      "geography-gist",
      GEOGRAPHY_CONCEPTS[0],
    ),
    authoredQuestion(
      "tobira-climate-evidence",
      "tobira-l01-page-5-climate",
      "map-evidence-match",
      "南北に長いことの結果として、音声が述べている地域差を選びましょう。",
      "Select the regional contrast that the audio links to Japan's north-south length.",
      [
        "同じ時期でも、南で泳げる一方、北では雪が降ることがある。",
        "日本中で気候も桜の時期も必ず同じになる。",
        "北海道は沖縄よりいつも暑い。",
      ],
      0,
      "音声は、沖縄や九州で泳げる時に北海道では雪が降ることもある、と対比しています。",
      "The audio contrasts swimming weather in Okinawa or Kyushu with possible snow in Hokkaido at the same time.",
      "climate-contrast",
      GEOGRAPHY_CONCEPTS[1],
    ),
    authoredQuestion(
      "tobira-reported-status",
      "tobira-l01-page-5-himeji",
      "source-status-choice",
      "「姫路城は日本で最も美しいと言われている」が保っている情報の強さはどれですか。",
      "What source status is preserved by to iwarete iru in the Himeji Castle sentence?",
      [
        "一般にそう言われているという紹介で、筆者自身の絶対的な証明ではない。",
        "世界中の全員が必ず同じ意見だという証明である。",
        "姫路城が存在しないという疑いを表している。",
      ],
      0,
      "「と言われている」は、広く伝えられている評価として紹介します。",
      "To iwarete iru presents the evaluation as something that is said, rather than as the writer's absolute proof.",
      "reported-source-status",
      GEOGRAPHY_CONCEPTS[2],
    ),
  ]);
  const reviewTargets = Object.freeze([
    reviewTarget(
      "geography-gist",
      GEOGRAPHY_CONCEPTS[0],
      "日本の国土",
      "にほんのこくど",
      ["the territory of Japan"],
      N3_SOURCE_OPENING_TOBIRA_EVIDENCE[0].japanese,
      ["geography-gist"],
      "n3-source-opening-02",
    ),
    reviewTarget(
      "place-ni-yotte",
      GEOGRAPHY_CONCEPTS[1],
      "場所によって違います",
      "ばしょによってちがいます",
      ["differs depending on the place"],
      N3_SOURCE_OPENING_TOBIRA_EVIDENCE[2].japanese,
      ["climate-contrast"],
      "n3-source-opening-02",
    ),
    reviewTarget(
      "to-iwarete-iru",
      GEOGRAPHY_CONCEPTS[2],
      "と言われている",
      undefined,
      ["is said to be"],
      N3_SOURCE_OPENING_TOBIRA_EVIDENCE[3].japanese,
      ["reported-source-status"],
      "n3-source-opening-02",
    ),
  ]);
  return packageRecord({
    id: "n3-source-opening-02",
    ordinal: 2,
    previousPackageId: "n3-source-opening-01",
    stage,
    concepts: GEOGRAPHY_CONCEPTS,
    prerequisites: Object.freeze([
      prerequisite(
        "grammar:n3-te-kuru-viewpoint",
        "前段で、現在地から出来事を捉える視点を試行済みであること。",
        "Has attempted viewpoint tracking in the preceding package.",
      ),
      prerequisite(
        "discourse:n3-sono-ue",
        "前段で、説明文の情報を足し合わせた経験があること。",
        "Has combined additive information in the preceding package.",
      ),
      prerequisite(
        "reading:n4-main-claim",
        "短い説明文の中心を選べること。",
        "Can select the main focus of a short explanatory text.",
      ),
    ]),
    prompt: {
      ja: "Tobira第1課の音声を聞き、日本の地理の全体像、地域差、伝聞の強さを捉えましょう。",
      en: "Listen to Tobira Chapter 1 for the geographic overview, regional contrasts, and the strength of reported claims.",
    },
    teaching: Object.freeze([
      teachingPoint(
        "最初は全体を聞く",
        "Listen once for the whole",
        "島、都道府県、気候、名所",
        "一回目は数字を全部取らず、話題がどう進むかを追います。",
        "On the first listen, follow how the topics progress instead of collecting every number.",
      ),
      teachingPoint(
        "地域差の合図",
        "Notice regional contrast cues",
        "南と北では〜が違う。",
        "「南北に長いので」「場所によって」は、同じ国の中の違いを導きます。",
        "Nanboku ni nagai node and basho ni yotte introduce differences within one country.",
      ),
      teachingPoint(
        "情報源の強さ",
        "Keep the strength of the source",
        "〜と言われている。",
        "伝聞の形は、書き手自身の断定と、広く言われる評価を分けます。",
        "Reported-speech forms separate the writer's own assertion from a circulating evaluation.",
      ),
    ]),
    stimulus: Object.freeze({
      kind: "official-audio" as const,
      title: Object.freeze({
        ja: "Tobira 第1課 読み物「日本の地理」",
        en: "Tobira Chapter 1 reading: Japanese geography",
      }),
      audioUrl: TOBIRA_AUDIO_URL,
      evidenceExcerpts: N3_SOURCE_OPENING_TOBIRA_EVIDENCE,
    }),
    questions,
    passScore: 1,
    feedback: feedback(
      "全体像、地域差、伝聞の強さを、長い音声の中で区別できました。",
      "You distinguished the overall topic, regional contrast, and reported status in extended audio.",
      "音声を「国土」「気候」「名所」の三つに分け、「と言われている」の直前を聞き直しましょう。",
      "Divide the audio into territory, climate, and landmarks, then replay the lead-in to to iwarete iru.",
      "答えを決める語を一つだけメモしてから、選択肢を比べてください。",
      "Write one decisive cue before comparing the options.",
      "南北に長い国なので、場所によって季節の進み方が違うと言われています。",
      "Because the country stretches north to south, the seasons are said to progress differently by place.",
    ),
    reviewTargets,
    readerSrs: readerSrs(
      "n3-source-opening-02",
      N3_SOURCE_OPENING_TOBIRA_EVIDENCE.map(
        (item) => `reader:n3-source-opening-02:evidence:${item.id}`,
      ),
      [
        mining(
          "場所によって違います",
          N3_SOURCE_OPENING_TOBIRA_EVIDENCE[2].japanese,
          "TOBIRA Chapter 1: 日本の地理",
          [GEOGRAPHY_CONCEPTS[1]],
          TOBIRA_AUDIO_URL,
        ),
        mining(
          "と言われている",
          N3_SOURCE_OPENING_TOBIRA_EVIDENCE[3].japanese,
          "TOBIRA Chapter 1: 日本の地理",
          [GEOGRAPHY_CONCEPTS[2]],
          TOBIRA_AUDIO_URL,
        ),
      ],
    ),
  });
}

function evidenceReadingPackage(): N3SourceOpeningPackage {
  const stage = "evidence-reading" as const;
  const modes: readonly N3SourceOpeningActivityMode[] = [
    "cause-choice",
    "source-claim-choice",
    "hygiene-evidence-choice",
    "main-claim-choice",
  ];
  const concepts = [
    EVIDENCE_CONCEPTS[0],
    EVIDENCE_CONCEPTS[1],
    EVIDENCE_CONCEPTS[2],
    EVIDENCE_CONCEPTS[3],
  ];
  const tags = [
    "eco-cause",
    "eco-source-claim",
    "eco-qualified-risk",
    "eco-main-claim",
  ];
  const questions = Object.freeze(
    N3_SOURCE_OPENING_ECO_READING.questions.map((item, index) =>
      sourceQuestion(
        item.id,
        item.id,
        modes[index],
        item.question,
        item.english,
        item.options,
        item.answer,
        item.explanation,
        item.english,
        tags[index],
        concepts[index],
      ),
    ),
  );
  const production = Object.freeze({
    authorship: "original-yomu-n3-source-transfer" as const,
    prompt: Object.freeze({
      ja: "資料A・Bを使い、「〜によると」で情報源を示し、「かもしれません」「とは限りません」「〜によって違います」のどれかで範囲を限定した1〜2文を書いてください。",
      en: "Using Sources A and B, write one or two Japanese sentences that attribute a claim with ni yoru to and bound it with kamoshiremasen, to wa kagirimasen, or ni yotte chigaimasu.",
    }),
    facts: Object.freeze([
      "資料A：地域の調査では、使い捨てカップを減らした店が増えています。",
      "資料B：ただし、洗浄に使う水の量は店によって違います。",
    ]),
    minimumCharacters: 24,
    modelAnswer:
      "地域の調査によると、使い捨てカップを減らした店が増えています。ただし、環境への効果は洗浄に使う水の量によって違うかもしれません。",
    attributionErrorTag: "transfer-attribution",
    boundaryErrorTag: "transfer-boundary",
    substanceErrorTag: "transfer-substance",
    conceptId: EVIDENCE_CONCEPTS[4],
  });
  const passageParagraphs = Object.freeze(
    N3_SOURCE_OPENING_ECO_READING.passage.split("\n"),
  );
  const reviewTargets = Object.freeze([
    reviewTarget(
      "tame-desu",
      EVIDENCE_CONCEPTS[0],
      "ためです",
      undefined,
      ["this is because ..."],
      passageParagraphs[0],
      ["eco-cause"],
      "n3-source-opening-03",
    ),
    reviewTarget(
      "kenkyuu-ni-yoru-to",
      EVIDENCE_CONCEPTS[1],
      "ある研究によると",
      "あるけんきゅうによると",
      ["according to one study"],
      passageParagraphs[1],
      ["eco-source-claim", "transfer-attribution"],
      "n3-source-opening-03",
    ),
    reviewTarget(
      "koto-mo-arimasu",
      EVIDENCE_CONCEPTS[2],
      "こともあります",
      undefined,
      ["there are also cases where ..."],
      passageParagraphs[2],
      ["eco-qualified-risk"],
      "n3-source-opening-03",
    ),
    reviewTarget(
      "kamoshiremasen",
      EVIDENCE_CONCEPTS[3],
      "かもしれません",
      undefined,
      ["might; may"],
      passageParagraphs[3],
      ["eco-main-claim"],
      "n3-source-opening-03",
    ),
    reviewTarget(
      "bounded-source-summary",
      EVIDENCE_CONCEPTS[4],
      "調査によると〜かもしれません",
      "ちょうさによると〜かもしれません",
      ["according to the survey, ... may ..."],
      production.modelAnswer,
      ["transfer-attribution", "transfer-boundary"],
      "n3-source-opening-03",
    ),
    reviewTarget(
      "source-substance",
      EVIDENCE_CONCEPTS[4],
      "使い捨てカップ／洗浄に使う水",
      "つかいすてカップ／せんじょうにつかうみず",
      [
        "the disposable cups and washing-water facts supplied by Sources A and B",
      ],
      production.modelAnswer,
      ["transfer-substance"],
      "n3-source-opening-03",
    ),
  ]);
  return packageRecord({
    id: "n3-source-opening-03",
    ordinal: 3,
    previousPackageId: "n3-source-opening-02",
    stage,
    concepts: EVIDENCE_CONCEPTS,
    prerequisites: Object.freeze([
      prerequisite(
        "listening:n3-authentic-geography-gist",
        "前段で、長い資料の全体像を先に捉えたこと。",
        "Has first captured the overall shape of an extended source.",
      ),
      prerequisite(
        "reading:n3-geography-contrast",
        "前段で、場所による差を根拠と結び付けたこと。",
        "Has linked place-based contrast to its evidence.",
      ),
      prerequisite(
        "grammar:n3-to-iwarete-iru",
        "前段で、伝聞と筆者自身の断定を区別したこと。",
        "Has distinguished a reported claim from the writer's own assertion.",
      ),
    ]),
    prompt: {
      ja: "エコバッグの長文で、理由・研究の主張・限定・筆者の結論を分け、別資料へ転移しましょう。",
      en: "Separate reason, research claim, qualification, and conclusion in the eco-bag reading, then transfer that discipline to new sources.",
    },
    teaching: Object.freeze([
      teachingPoint(
        "誰の情報か",
        "Whose information is it?",
        "ある調査によると、〜と言われています。",
        "「〜によると」は情報源、「と言われています」は伝えられている主張を示します。",
        "Ni yoru to marks the source; to iwarete imasu marks a reported claim.",
      ),
      teachingPoint(
        "断定を広げない",
        "Do not over-expand a claim",
        "〜こともあります。〜かもしれません。",
        "「も」「かもしれません」は、いつも・必ずという読みを防ぎます。",
        "Mo and kamoshiremasen prevent an always or certainly interpretation.",
      ),
      teachingPoint(
        "最後の問いを主張として読む",
        "Read the final question as a stance",
        "〜ではないでしょうか。",
        "疑問の形でも、筆者が控えめに提案する結論になることがあります。",
        "Even in question form, dewa nai deshou ka can present the writer's restrained conclusion.",
      ),
    ]),
    stimulus: Object.freeze({
      kind: "source-reading" as const,
      title: Object.freeze({
        ja: "Soya N3 長文: エコバッグ",
        en: "Soya N3 long reading: eco-bags",
      }),
      paragraphs: passageParagraphs,
      postAttemptNote: Object.freeze({
        ja: "選択肢の根拠を、本文の情報源・限定表現・最終文に戻して確認してください。",
        en: "Check each answer against the passage's source attribution, qualification, or final sentence.",
      }),
    }),
    questions,
    production,
    passScore: 1,
    feedback: feedback(
      "情報源と主張の範囲を守りながら、読解から短い資料統合へ転移できました。",
      "You preserved source and claim boundaries while transferring from reading to a short source synthesis.",
      "「によると」「こともある」「かもしれない」「ではないでしょうか」に線を引き、誰がどこまで述べているか分けましょう。",
      "Underline ni yoru to, koto mo aru, kamoshirenai, and dewa nai deshou ka, then separate who says what and how far.",
      "選択問題では根拠の一文を指し、作文では情報源と限定を一つずつ明示してください。",
      "Point to one evidence sentence for each choice, and make one source and one boundary explicit in the production.",
      "調査によると利用者は増えていますが、効果は地域によって違うかもしれません。",
      "According to the survey, use is increasing, but the effect may differ by region.",
    ),
    reviewTargets,
    readerSrs: readerSrs(
      "n3-source-opening-03",
      passageParagraphs.map(
        (_, index) =>
          `reader:n3-source-opening-03:passage:paragraph-${index + 1}`,
      ),
      [
        mining(
          "ある研究によると",
          passageParagraphs[1],
          "Soya N3 mock 1 reading: mock1_r_11-r_14",
          [EVIDENCE_CONCEPTS[1]],
        ),
        mining(
          "かもしれません",
          passageParagraphs[3],
          "Soya N3 mock 1 reading: mock1_r_11-r_14",
          [EVIDENCE_CONCEPTS[2], EVIDENCE_CONCEPTS[3]],
        ),
        mining(
          "調査によると",
          production.modelAnswer,
          "Yomu original N3 source-transfer prompt",
          [EVIDENCE_CONCEPTS[4]],
        ),
      ],
    ),
  });
}

interface PackageInput {
  readonly id: N3SourceOpeningPackageId;
  readonly ordinal: 1 | 2 | 3;
  readonly previousPackageId?: N3SourceOpeningPackageId;
  readonly stage: N3SourceOpeningStage;
  readonly concepts: readonly string[];
  readonly prerequisites: readonly N3SourceOpeningPrerequisite[];
  readonly prompt: Readonly<{ ja: string; en: string }>;
  readonly teaching: readonly N3SourceOpeningTeachingPoint[];
  readonly stimulus: N3SourceOpeningModel["payload"]["stimulus"];
  readonly questions: readonly N3SourceOpeningQuestion[];
  readonly production?: N3SourceOpeningModel["payload"]["production"];
  readonly passScore: number;
  readonly feedback: N3SourceOpeningModel["payload"]["feedback"];
  readonly reviewTargets: readonly N3SourceOpeningReviewTarget[];
  readonly readerSrs: N3SourceOpeningReaderSrsProjection;
}

function packageRecord(input: PackageInput): N3SourceOpeningPackage {
  const activity: N3SourceOpeningModel = Object.freeze({
    id: `activity:${input.id}`,
    kind: "academy-n3-source-opening" as const,
    sourceQuestionId: `source:${N3_SOURCE_OPENING_STAGE_PROVENANCE[input.stage].sourceItemSha256}`,
    conceptIds: Object.freeze([...input.concepts]),
    responseKind: "n3-source-opening-v1" as const,
    curriculumPhase: input.production
      ? ("assessed-production" as const)
      : ("assessed-recognition" as const),
    prompt: Object.freeze(input.prompt),
    answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
    teachingSupport: Object.freeze({
      kind: "pattern" as const,
      title: Object.freeze({
        ja: "N3資料読解の手がかり",
        en: "Cues for N3 source reading",
      }),
      entries: Object.freeze(
        input.teaching.map((item) =>
          Object.freeze({
            japanese: item.example,
            translation: item.explanation.en,
          }),
        ),
      ),
    }),
    provenance: N3_SOURCE_OPENING_STAGE_PROVENANCE[input.stage],
    payload: Object.freeze({
      stage: input.stage,
      teaching: input.teaching,
      stimulus: input.stimulus,
      questions: input.questions,
      ...(input.production ? { production: input.production } : {}),
      passScore: input.passScore,
      feedback: input.feedback,
      reviewTargets: input.reviewTargets,
    }),
  });
  return Object.freeze({
    id: input.id,
    band: "N3" as const,
    sequence: Object.freeze({
      ordinal: input.ordinal,
      ...(input.previousPackageId
        ? { previousPackageId: input.previousPackageId }
        : {}),
    }),
    prerequisites: input.prerequisites,
    activity,
    readerSrs: input.readerSrs,
  });
}

function prerequisite(
  conceptId: string,
  ja: string,
  en: string,
): N3SourceOpeningPrerequisite {
  return Object.freeze({
    conceptId,
    minimumEvidence: "introduced-and-attempted",
    reason: Object.freeze({ ja, en }),
  });
}

function teachingPoint(
  ja: string,
  en: string,
  example: string,
  explanationJa: string,
  explanationEn: string,
): N3SourceOpeningTeachingPoint {
  return Object.freeze({
    title: Object.freeze({ ja, en }),
    example,
    explanation: Object.freeze({ ja: explanationJa, en: explanationEn }),
  });
}

function sourceQuestion(
  id: string,
  sourceItemId: string,
  activityMode: N3SourceOpeningActivityMode,
  ja: string,
  en: string,
  optionLabels: readonly string[],
  correctLabel: string,
  explanationJa: string,
  explanationEn: string,
  errorTag: string,
  conceptId: string,
): N3SourceOpeningQuestion {
  const correctIndex = optionLabels.indexOf(correctLabel);
  if (correctIndex < 0) throw new TypeError(`Missing source answer for ${id}.`);
  return authoredQuestion(
    id,
    sourceItemId,
    activityMode,
    ja,
    en,
    optionLabels,
    correctIndex,
    explanationJa,
    explanationEn,
    errorTag,
    conceptId,
  );
}

function authoredQuestion(
  id: string,
  sourceItemId: string,
  activityMode: N3SourceOpeningActivityMode,
  ja: string,
  en: string,
  optionLabels: readonly string[],
  correctIndex: number,
  explanationJa: string,
  explanationEn: string,
  errorTag: string,
  conceptId: string,
): N3SourceOpeningQuestion {
  const options = Object.freeze(
    optionLabels.map((label, index) =>
      Object.freeze({ id: `${id}-option-${index + 1}`, label }),
    ),
  );
  return Object.freeze({
    id,
    sourceItemId,
    activityMode,
    prompt: Object.freeze({ ja, en }),
    options,
    correctOptionId: options[correctIndex].id,
    explanation: Object.freeze({ ja: explanationJa, en: explanationEn }),
    errorTag,
    conceptId,
  });
}

function feedback(
  passJa: string,
  passEn: string,
  lapseJa: string,
  lapseEn: string,
  repairJa: string,
  repairEn: string,
  nearbyJa: string,
  nearbyEn: string,
): N3SourceOpeningModel["payload"]["feedback"] {
  return Object.freeze({
    pass: Object.freeze({
      explanation: Object.freeze({ ja: passJa, en: passEn }),
    }),
    lapse: Object.freeze({
      explanation: Object.freeze({ ja: lapseJa, en: lapseEn }),
      repairPrompt: Object.freeze({ ja: repairJa, en: repairEn }),
      nearbyExample: Object.freeze({ ja: nearbyJa, en: nearbyEn }),
    }),
  });
}

function reviewTarget(
  suffix: string,
  conceptId: string,
  expression: string,
  reading: string | undefined,
  meanings: readonly string[],
  sentence: string,
  repairFor: readonly string[],
  packageId: N3SourceOpeningPackageId,
): N3SourceOpeningReviewTarget {
  return Object.freeze({
    id: `review:${packageId}:${suffix}`,
    conceptId,
    expression,
    ...(reading ? { reading } : {}),
    meanings: Object.freeze([...meanings]),
    sentence,
    repairFor: Object.freeze([...repairFor]),
  });
}

function readerSrs(
  packageId: N3SourceOpeningPackageId,
  readerSurfaceIds: readonly string[],
  miningRequests: readonly MiningRequest[],
): N3SourceOpeningReaderSrsProjection {
  if (readerSurfaceIds.some((id) => !id.includes(packageId)))
    throw new TypeError(`Reader surface ids must belong to ${packageId}.`);
  return Object.freeze({
    readerSurfaceIds: Object.freeze([...readerSurfaceIds]),
    miningRequests: Object.freeze([...miningRequests]),
  });
}

function mining(
  expression: string,
  sentence: string,
  sourceTitle: string,
  conceptIds: readonly string[],
  sourceUrl?: string,
): MiningRequest {
  return Object.freeze({
    expression,
    sentence,
    sourceTitle,
    ...(sourceUrl ? { sourceUrl } : {}),
    conceptIds: Object.freeze([...conceptIds]),
  });
}

function requiredSource(id: string) {
  const found = N3_SOURCE_OPENING_SOURCE_CATALOG.find(
    (record) => record.id === id,
  );
  if (!found)
    throw new TypeError(`Missing N3 source-opening provenance record: ${id}`);
  return found;
}
