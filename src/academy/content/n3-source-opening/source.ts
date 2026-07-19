import type {
  N3SourceOpeningSourceRecord,
  N3SourceOpeningStage,
  N3SourceOpeningStageProvenance,
} from "./types";

export const N3_SOURCE_OPENING_TRANCHE_ID = "n3-source-opening-v1" as const;
export const N3_SOURCE_OPENING_SOURCE_RECORD =
  "module-local:n3-source-opening/source.ts" as const;

export const N3_SOURCE_OPENING_SOURCE_CATALOG: readonly N3SourceOpeningSourceRecord[] =
  Object.freeze([
    source({
      id: "yomu-academy:moodle-raw-manifest",
      scope: "yomu-academy",
      role: "chronology-anchor",
      title: "Yomu Academy Moodle raw manifest",
      relativePath: "moodle-raw/manifest.json",
      sha256:
        "1dd65b2a8ec6894610dfc05e989f7fd7e2acf8fe511a267e943d775f784e9835",
      bytes: 17136,
      permission: "user-permitted-local-educational-use",
      delivery: "not-delivered",
    }),
    source({
      id: "japanese-library:tobira-main-textbook",
      scope: "japanese-library",
      role: "delivered-excerpt",
      title: "TOBIRA: Gateway to Advanced Japanese, Chapter 1 日本の地理",
      relativePath:
        "Resource Packs/Japanese Language Learning Pack - Learn Japanese!/07 Japanese N3-N1/TOBIRA - Gateway to Advanced Japanese/TOBIRA - Gateway to Advanced Japanese.pdf",
      sha256:
        "954dfd010fa9c77e5f276fdc42021c6305cc8d9e7c3ae9009825c302cc420d52",
      bytes: 206162548,
      permission: "user-permitted-local-educational-use",
      delivery: "reviewed-excerpts",
    }),
    source({
      id: "japanese-library:tobira-l01-reading-audio",
      scope: "japanese-library",
      role: "verification-copy",
      title: "TOBIRA Chapter 1 reading audio, local copy",
      relativePath:
        "Resource Packs/Japanese Language Learning Pack - Learn Japanese!/07 Japanese N3-N1/TOBIRA - Gateway to Advanced Japanese/Tobira_Gateway_to_Advanced_Japanese-Audio/L01/L01/L01-1_yomimono.mp3",
      sha256:
        "5cd11fe268f87343d9855161576743891a2d4452cbcbb40640c39bbbc20632b8",
      bytes: 6729268,
      durationSeconds: 280.293917,
      permission: "user-permitted-local-educational-use",
      delivery: "not-delivered",
    }),
    source({
      id: "official-web:tobira-l01-reading-audio",
      scope: "official-web",
      role: "delivered-remote-media",
      title: "TOBIRA Chapter 1 reading audio, publisher-hosted",
      url: "https://tobiraweb.9640.jp/wp-content/uploads/2015/02/L01-1_yomimono.mp3",
      originPageUrl:
        "https://tobiraweb.9640.jp/contents/%E9%9F%B3%E5%A3%B0%E6%95%99%E6%9D%90/%E7%AC%AC1%E8%AA%B2/",
      sha256:
        "5cd11fe268f87343d9855161576743891a2d4452cbcbb40640c39bbbc20632b8",
      bytes: 6729268,
      durationSeconds: 280.293917,
      permission: "official-reference-use",
      delivery: "official-remote",
    }),
    source({
      id: "soya-research:n3-mock1-grammar",
      scope: "soya-research",
      role: "delivered-excerpt",
      title: "Soya JLPT N3 mock 1 grammar",
      relativePath: "data/courses/jlpt_n3/mock1_grammar.js",
      sha256:
        "f70938aba899028c5712a2f05fcac54bca4bec5353c5e13bf0f04cb4fb655281",
      bytes: 11012,
      permission: "user-permitted-local-educational-use",
      delivery: "reviewed-excerpts",
    }),
    source({
      id: "soya-research:n3-mock1-reading",
      scope: "soya-research",
      role: "delivered-excerpt",
      title: "Soya JLPT N3 mock 1 reading",
      relativePath: "data/courses/jlpt_n3/mock1_reading.js",
      sha256:
        "b438b2dffb09fb7db8f5b5e671ae61e97ad1b838627118614bf83c64d22b7b35",
      bytes: 25924,
      permission: "user-permitted-local-educational-use",
      delivery: "reviewed-excerpts",
    }),
    source({
      id: "japanese-library:shin-kanzen-n3-grammar",
      scope: "japanese-library",
      role: "private-reference",
      title: "新完全マスター文法 N3",
      relativePath:
        "Resource Packs/Japanese Language Learning Pack - Learn Japanese!/07 Japanese N3-N1/新完全マスター N3-N1. Shin kanzen masutā/新完全マスター N3/新完全マスター文法, N3 Shin kanzen masutā bunpō, N3.pdf",
      sha256:
        "d6949f176d46e07618ee71957dec2e08871c60b0ca04dcf900024fab38c4d0f7",
      bytes: 241479375,
      permission: "user-permitted-local-educational-use",
      delivery: "not-delivered",
    }),
    source({
      id: "japanese-library:sou-matome-n3-grammar",
      scope: "japanese-library",
      role: "private-reference",
      title: "日本語総まとめ N3 文法",
      relativePath:
        "Resource Packs/Japanese Language Learning Pack - Learn Japanese!/07 Japanese N3-N1/日本語総まとめ N1-N3. Nihongo sōmatome/日本語総まとめ N3/日本語総まとめ N3, 文法  Nihongo sōmatome N3, Bunpō.pdf",
      sha256:
        "45d212ee9730b3e2257e63d02c3d83d5ef13b9ac3d45061f45b8afa213ac1fc2",
      bytes: 26324715,
      permission: "user-permitted-local-educational-use",
      delivery: "not-delivered",
    }),
    officialJlptSource(
      "official-jlpt:n3-2009-question-book",
      "Official JLPT N3 2009 sample question book",
      "N3-mondai.pdf",
      "ba622e5b3a1d0de40cc390c1abe3aba7928948a3242b88e3afe45b391e8b7444",
      3283021,
    ),
    officialJlptSource(
      "official-jlpt:n3-2009-listening",
      "Official JLPT N3 2009 sample listening",
      "N3Sample.mp3",
      "c637ea91f6f6e51aa085214712642138d76f6d5590ee6518b8d4d635102be3c0",
      11570390,
    ),
    officialJlptSource(
      "official-jlpt:n3-2009-answer-sheet",
      "Official JLPT N3 2009 sample answer sheet",
      "N3-kaitou.pdf",
      "0c03f0ae90fef2669ca96f611e4ebeae0823409eb4e504ba4f731fe16d53d12b",
      379110,
    ),
    officialJlptSource(
      "official-jlpt:n3-2009-listening-script",
      "Official JLPT N3 2009 sample listening script",
      "N3-script.pdf",
      "46d69fb5969fd5e38dc394b23c626139908fc7d0b1eecd97ed9196438cbb8b97",
      1402451,
    ),
    officialJlptSource(
      "official-jlpt:n3-2009-answer-key",
      "Official JLPT N3 2009 sample answer key",
      "N3-seikai.pdf",
      "d143b461b95ecc347fe674251aed30ce4eef1a79af4327c9ce0ee6af6f8861d5",
      39783,
    ),
  ]);

export const N3_SOURCE_OPENING_TOWN_FLOW_ITEMS = Object.freeze([
  townItem(
    "mock1_g_19",
    "【文章の文法 1/5】先月、新しい町に引っ越して（　　　）。",
    ["きました", "いきました", "みました", "おきました"],
    "きました",
    "I moved to a new town last month.",
    "「〜てくる」は話し手の現在地に近づく移動を表します。今この町にいるので『引っ越してきた』が自然です。",
  ),
  townItem(
    "mock1_g_20",
    "【文章の文法 2/5】この町は、自然が豊かで（　　　）、とても静かです。",
    ["そのうえ", "それとも", "それでは", "そのかわり"],
    "そのうえ",
    "This town is rich in nature, and on top of that, it's very quiet.",
    "「そのうえ」は情報を追加する累加の接続詞です。『豊かだ』＋『静かだ』と良い点を重ねています。",
  ),
  townItem(
    "mock1_g_21",
    "【文章の文法 3/5】最初は道が分からなくて困りましたが、近所の人が親切に（　　　）。",
    [
      "教えてくれました",
      "教えてもらいました",
      "教えてあげました",
      "教えさせました",
    ],
    "教えてくれました",
    "At first I had trouble not knowing the roads, but a neighbor kindly taught me.",
    "主語が『近所の人**が**』なので、相手が主語の授受表現『〜てくれる』が正しいです。『もらう』の場合は『近所の人**に**教えてもらった』となります。",
  ),
  townItem(
    "mock1_g_22",
    "【文章の文法 4/5】おかげで、今ではすっかりこの町が（　　　）。",
    ["好きになりました", "好きにしました", "好きそうです", "好きらしいです"],
    "好きになりました",
    "Thanks to that, I have come to like this town completely.",
    "「〜になる」は自然な変化を表します。自分の気持ちが自然に変わったことを示すので『好きになりました』が正しいです。",
  ),
  townItem(
    "mock1_g_23",
    "【文章の文法 5/5】これからも、ここで楽しく（　　　）と思っています。",
    ["暮らしていこう", "暮らしてこよう", "暮らしてしまう", "暮らしておく"],
    "暮らしていこう",
    "I plan to continue living happily here.",
    "「〜ていこう」は『これから先も続けていく意志』を表します。『暮らしていこうと思っている』＝これからも住み続けたいという気持ち。",
  ),
]);

export const N3_SOURCE_OPENING_TOBIRA_EVIDENCE = Object.freeze([
  evidence(
    "tobira-l01-page-4-islands",
    "日本の国土は、北海道、本州、四国、九州と呼ばれる四つの大きい島と6000以上の小さい島でできています。",
    "Japan consists of the four large islands called Hokkaido, Honshu, Shikoku, and Kyushu, together with more than 6,000 smaller islands.",
  ),
  evidence(
    "tobira-l01-page-5-climate",
    "日本は南北に長い国なので、南と北では気候が大きく違い、沖縄や九州で泳げる時に、北海道では雪が降っていることもあります。",
    "Because Japan stretches a long way north to south, the climates differ greatly; there are times when people can swim in Okinawa or Kyushu while snow is falling in Hokkaido.",
  ),
  evidence(
    "tobira-l01-page-5-cherry-blossoms",
    "だから、日本人が大好きな桜の花がいつ頃咲くかは、場所によって違います。沖縄では1月の終わりに咲き始めますが、北海道では5月になってからです。",
    "That is why the time when cherry blossoms bloom differs by place: they begin at the end of January in Okinawa, but not until May in Hokkaido.",
  ),
  evidence(
    "tobira-l01-page-5-himeji",
    "例えば、兵庫県にある姫路城は日本で最も美しいと言われているお城で、1993年にユネスコの世界遺産に選ばれました。",
    "For example, Himeji Castle in Hyogo Prefecture is said to be Japan's most beautiful castle and was selected as a UNESCO World Heritage Site in 1993.",
  ),
]);

export const N3_SOURCE_OPENING_TOBIRA_MEDIA = Object.freeze({
  id: "tobira-l01-audio",
  officialUrl:
    "https://tobiraweb.9640.jp/wp-content/uploads/2015/02/L01-1_yomimono.mp3",
  sha256: "5cd11fe268f87343d9855161576743891a2d4452cbcbb40640c39bbbc20632b8",
  bytes: 6729268,
});

export const N3_SOURCE_OPENING_ECO_READING = Object.freeze({
  sourceItemIds: Object.freeze([
    "mock1_r_11",
    "mock1_r_12",
    "mock1_r_13",
    "mock1_r_14",
  ]),
  passage:
    "　「エコバッグ」を持ち歩く人が増えています。スーパーやコンビニで買い物をしたとき、プラスチックのレジ袋をもらわずに、自分のバッグに品物を入れるためです。日本でもレジ袋が有料になり、環境問題への意識が高まりました。\n　しかし、エコバッグが本当に環境に良いのかどうかについては、さまざまな意見があります。ある研究によると、綿（コットン）で作られたエコバッグは、製造する過程で大量の水やエネルギーを使います。そのため、プラスチックのレジ袋と同じくらい環境に優しくなるためには、何百回も繰り返し使わなければならないと言われています。\n　また、エコバッグの中に肉や魚の汁がこぼれたりすると、菌が繁殖して不衛生になることもあります。定期的に洗わなければなりませんが、洗うためにも水や洗剤が必要です。\n　もちろん、プラスチックごみを減らすことは海や動物を守るために重要です。しかし、「エコバッグを持っていればそれだけで環境に良い」と考えるのは少し早いかもしれません。大切なのは、一つのものを大切に、長く使い続けることではないでしょうか。",
  questions: Object.freeze([
    readingItem(
      "mock1_r_11",
      "日本でエコバッグを持ち歩く人が増えた理由として、本文に書かれていることは何か。",
      [
        "エコバッグのデザインがかっこよくなったから。",
        "レジ袋が有料になり、環境問題への意識が高まったから。",
        "スーパーでエコバッグが無料で配られているから。",
        "プラスチックのレジ袋が店からなくなったから。",
      ],
      "レジ袋が有料になり、環境問題への意識が高まったから。",
      "According to the text, why do more people carry eco-bags in Japan?",
      "「日本でもレジ袋が有料になり、環境問題への意識が高まりました」と理由が書かれています。",
    ),
    readingItem(
      "mock1_r_12",
      "綿のエコバッグについて、ある研究は何と言っているか。",
      [
        "プラスチックのレジ袋よりも安く作ることができる。",
        "洗わなくても菌が繁殖しないので衛生的だ。",
        "何百回も使わないと、レジ袋と同じくらい環境に優しくならない。",
        "製造過程で水やエネルギーを全く使わない。",
      ],
      "何百回も使わないと、レジ袋と同じくらい環境に優しくならない。",
      "What does one study say about cotton eco-bags?",
      "「プラスチックのレジ袋と同じくらい環境に優しくなるためには、何百回も繰り返し使わなければならないと言われています」とあります。",
    ),
    readingItem(
      "mock1_r_13",
      "エコバッグの衛生面について、筆者はどう述べているか。",
      [
        "肉や魚は絶対に入れないほうがいい。",
        "洗剤を使うとエコバッグが壊れてしまう。",
        "定期的に洗わないと不衛生になることがある。",
        "プラスチック袋よりもずっと衛生的だ。",
      ],
      "定期的に洗わないと不衛生になることがある。",
      "What does the author state about eco-bag hygiene?",
      "「菌が繁殖して不衛生になることもあります。定期的に洗わなければなりませんが…」と述べられています。",
    ),
    readingItem(
      "mock1_r_14",
      "この文章で筆者が一番伝えたいことは何か。",
      [
        "エコバッグを使うのは今すぐやめるべきだということ。",
        "プラスチックのレジ袋の方が環境に良いということ。",
        "一つのものを長く使い続けることが大切だということ。",
        "エコバッグは毎日洗わなければならないということ。",
      ],
      "一つのものを長く使い続けることが大切だということ。",
      "What is the author's main point?",
      "最終文「大切なのは、一つのものを大切に、長く使い続けることではないでしょうか」が筆者の主な主張です。",
    ),
  ]),
});

export const N3_SOURCE_OPENING_ITEM_HASHES = Object.freeze({
  townFlow: "14b864410c6472b054b967c2a275bdd0b80080c7d537c488f97ce167ba63be2e",
  tobiraEvidence:
    "1a34a572bb8fb3e5c387b3bdc3a24a47a207cbae08f91e8fe394ed2dcbc41c46",
  ecoReading:
    "5366aaea7f876cb38011e611a65e3224d3da61a8c026a716299ee401e7b79450",
});

export const N3_SOURCE_OPENING_STAGE_PROVENANCE: Readonly<
  Record<N3SourceOpeningStage, N3SourceOpeningStageProvenance>
> = Object.freeze({
  "town-flow": provenance(
    "n3-source-opening-01",
    "town-flow",
    [
      "yomu-academy:moodle-raw-manifest",
      "soya-research:n3-mock1-grammar",
      "japanese-library:shin-kanzen-n3-grammar",
      "japanese-library:sou-matome-n3-grammar",
    ],
    N3_SOURCE_OPENING_TOWN_FLOW_ITEMS.map((item) => item.id),
    N3_SOURCE_OPENING_ITEM_HASHES.townFlow,
  ),
  "geography-listening": provenance(
    "n3-source-opening-02",
    "geography-listening",
    [
      "japanese-library:tobira-main-textbook",
      "japanese-library:tobira-l01-reading-audio",
      "official-web:tobira-l01-reading-audio",
      "official-jlpt:n3-2009-listening",
      "official-jlpt:n3-2009-listening-script",
    ],
    [
      N3_SOURCE_OPENING_TOBIRA_MEDIA.id,
      ...N3_SOURCE_OPENING_TOBIRA_EVIDENCE.map((item) => item.id),
    ],
    N3_SOURCE_OPENING_ITEM_HASHES.tobiraEvidence,
  ),
  "evidence-reading": provenance(
    "n3-source-opening-03",
    "evidence-reading",
    [
      "soya-research:n3-mock1-reading",
      "japanese-library:shin-kanzen-n3-grammar",
      "japanese-library:sou-matome-n3-grammar",
      "official-jlpt:n3-2009-question-book",
      "official-jlpt:n3-2009-answer-sheet",
      "official-jlpt:n3-2009-answer-key",
    ],
    N3_SOURCE_OPENING_ECO_READING.sourceItemIds,
    N3_SOURCE_OPENING_ITEM_HASHES.ecoReading,
  ),
});

export function canonicalN3SourceOpeningTownFlowPayload(): string {
  return `${JSON.stringify(N3_SOURCE_OPENING_TOWN_FLOW_ITEMS)}\n`;
}

export function canonicalN3SourceOpeningTobiraEvidencePayload(): string {
  return `${JSON.stringify({ media: N3_SOURCE_OPENING_TOBIRA_MEDIA, evidence: N3_SOURCE_OPENING_TOBIRA_EVIDENCE })}\n`;
}

export function canonicalN3SourceOpeningEcoReadingPayload(): string {
  return `${JSON.stringify(N3_SOURCE_OPENING_ECO_READING)}\n`;
}

function source(
  record: N3SourceOpeningSourceRecord,
): N3SourceOpeningSourceRecord {
  return Object.freeze(record);
}

function officialJlptSource(
  id: string,
  title: string,
  filename: string,
  sha256: string,
  bytes: number,
): N3SourceOpeningSourceRecord {
  return source({
    id,
    scope: "japanese-library",
    role: "task-calibration",
    title,
    relativePath: `Official Sources/N3 Opening 2026-07-18/JLPT 2009/${filename}`,
    originPageUrl: "https://www.jlpt.jp/e/samples/sample09.html?mode=pc",
    retrievedAt: "2026-07-18",
    sha256,
    bytes,
    permission: "official-reference-use",
    delivery: "not-delivered",
  });
}

function townItem(
  id: string,
  display: string,
  choices: readonly string[],
  answer: string,
  english: string,
  explanation: string,
) {
  return Object.freeze({
    id,
    display,
    choices: Object.freeze([...choices]),
    answer,
    english,
    explanation,
  });
}

function evidence(id: string, japanese: string, translation: string) {
  return Object.freeze({ id, japanese, translation });
}

function readingItem(
  id: string,
  question: string,
  options: readonly string[],
  answer: string,
  english: string,
  explanation: string,
) {
  return Object.freeze({
    id,
    question,
    options: Object.freeze([...options]),
    answer,
    english,
    explanation,
  });
}

function provenance(
  packageId: N3SourceOpeningStageProvenance["packageId"],
  stage: N3SourceOpeningStage,
  sourceRefs: readonly string[],
  sourceItemIds: readonly string[],
  sourceItemSha256: string,
): N3SourceOpeningStageProvenance {
  return Object.freeze({
    trancheId: N3_SOURCE_OPENING_TRANCHE_ID,
    packageId,
    stage,
    sourceRecord: N3_SOURCE_OPENING_SOURCE_RECORD,
    sourceRefs: Object.freeze([...sourceRefs]),
    sourceItemIds: Object.freeze([...sourceItemIds]),
    sourceItemSha256,
  });
}
