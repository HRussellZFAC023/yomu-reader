import { YOMU_GRAMMAR_REGISTRY, type GrammarExample } from '../../../src/reader/study/grammar-registry';
import type { LocalGrammarRuleExample, LocalGrammarRuleSummary } from '../../../src/reader/study/tools';

// Canonical per-rule example table. Test-only: the reader render path uses the
// remote grammar-copy JSON, so keeping these fixtures out of the shipped bundle
// (~74KB) is deliberate. Detection and coverage tests join them onto the registry.
export const GRAMMAR_RULE_EXAMPLES: Record<string, GrammarExample[]> = {
    "potential-koto-ga-dekiru": [
        {
            "japanese": "日本語を話すことができます。",
            "english": "I can speak Japanese.",
            "note": "Verb + ことができる marks ability."
        }
    ],
    "potential-dekiru": [
        {
            "japanese": "一人で勉強できます。",
            "english": "I can study by myself.",
            "note": "Noun + できる often marks the potential form of a する verb."
        }
    ],
    "obligation-nakereba-naranai": [
        {
            "japanese": "明日までに払わなければならない。",
            "english": "I have to pay by tomorrow.",
            "note": "The first clause is required."
        }
    ],
    "permission-not-required-nakutemo-ii": [
        {
            "japanese": "今日は来なくてもいいです。",
            "english": "You do not have to come today.",
            "note": "Negative て-form + もいい removes obligation."
        }
    ],
    "prohibition-tewa-ikenai": [
        {
            "japanese": "ここで写真を撮ってはいけません。",
            "english": "You must not take photos here.",
            "note": "てはいけない is a direct prohibition."
        }
    ],
    "permission-temo-ii": [
        {
            "japanese": "水を飲んでもいいです。",
            "english": "It is okay to drink water.",
            "note": "て-form + もいい grants permission."
        }
    ],
    "request-te-kudasai": [
        {
            "japanese": "ゆっくり話してください。",
            "english": "Please speak slowly.",
            "note": "て-form + ください requests an action."
        }
    ],
    "polite-request-te-itadakemasen-ka": [
        {
            "japanese": "もう一度説明していただけませんか。",
            "english": "Could you please explain it one more time?",
            "note": "ていただけませんか is a polite request form."
        }
    ],
    "request-naide-kudasai": [
        {
            "japanese": "ここで走らないでください。",
            "english": "Please do not run here.",
            "note": "ないでください is the negative request form."
        }
    ],
    "advice-hou-ga-ii": [
        {
            "japanese": "早く寝たほうがいいです。",
            "english": "It is better to go to bed early.",
            "note": "Often follows past tense for advice."
        }
    ],
    "command-nasai": [
        {
            "japanese": "宿題をしなさい。",
            "english": "Do your homework.",
            "note": "Stem + なさい gives an instruction."
        }
    ],
    "experience-ta-koto-ga-aru": [
        {
            "japanese": "京都に行ったことがあります。",
            "english": "I have been to Kyoto.",
            "note": "Past verb + ことがある marks experience."
        }
    ],
    "completion-te-shimau": [
        {
            "japanese": "財布を忘れてしまいました。",
            "english": "I unfortunately forgot my wallet.",
            "note": "てしまう can add regret or completion."
        }
    ],
    "attempt-te-miru": [
        {
            "japanese": "新しい店で食べてみます。",
            "english": "I will try eating at the new shop.",
            "note": "て-form + みる is experimental trying."
        }
    ],
    "preparation-te-oku": [
        {
            "japanese": "旅行の前に予約しておきます。",
            "english": "I will make a reservation before the trip.",
            "note": "ておく prepares for later."
        }
    ],
    "desire-other-te-hoshii": [
        {
            "japanese": "もう少し待ってほしいです。",
            "english": "I want you to wait a little longer.",
            "note": "てほしい points desire at someone else's action."
        }
    ],
    "benefactive-te-kureru-morau": [
        {
            "japanese": "先生が説明してくださいました。",
            "english": "The teacher kindly explained it.",
            "note": "The helper verb shows benefit and direction."
        }
    ],
    "change-you-ni-naru": [
        {
            "japanese": "漢字が読めるようになりました。",
            "english": "I became able to read kanji.",
            "note": "Often describes gradual change."
        }
    ],
    "habit-you-ni-suru": [
        {
            "japanese": "毎日復習するようにしています。",
            "english": "I try to review every day.",
            "note": "ようにする describes deliberate effort."
        }
    ],
    "verb-suru": [
        {
            "japanese": "質問する答えを探す。",
            "english": "Find answers to questions.",
            "note": "する can attach to a noun to create an action verb."
        }
    ],
    "choice-ni-suru": [
        {
            "japanese": "飲み物はお茶にします。",
            "english": "I will have tea.",
            "note": "Noun + にする is used for choosing or making something a certain way."
        }
    ],
    "change-ku-suru": [
        {
            "japanese": "部屋を明るくしました。",
            "english": "I made the room brighter.",
            "note": "い-adjective stem + くする marks intentional change."
        }
    ],
    "change-ku-naru-ni-naru": [
        {
            "japanese": "日本語が少し上手になりました。",
            "english": "My Japanese got a little better.",
            "note": "Noun/な-adjective + になる and い-adjective + くなる mark change."
        }
    ],
    "copula-desu-da": [
        {
            "japanese": "今日は休みです。",
            "english": "Today is a day off.",
            "note": "です is the polite copula."
        }
    ],
    "negative-copula-dewa-nai": [
        {
            "japanese": "これは私の本じゃない。",
            "english": "This is not my book.",
            "note": "じゃない is the casual contraction of ではない."
        }
    ],
    "formal-copula-de-aru": [
        {
            "japanese": "これは重要な問題である。",
            "english": "This is an important problem.",
            "note": "である is a formal version of だ/です."
        }
    ],
    "voice-causative-passive": [
        {
            "japanese": "子どものころ、野菜を食べさせられました。",
            "english": "When I was a child, I was made to eat vegetables.",
            "note": "Regex can only flag the form; context decides the exact verb."
        }
    ],
    "voice-causative": [
        {
            "japanese": "母は子どもを遊ばせた。",
            "english": "The mother let the child play.",
            "note": "Causative can mean make or let."
        }
    ],
    "voice-passive-potential": [
        {
            "japanese": "この漢字はよく見られます。",
            "english": "This kanji is often seen.",
            "note": "Surface regex cannot fully disambiguate passive, potential, and honorific."
        }
    ],
    "evidence-rashii-mitai": [
        {
            "japanese": "明日は雨らしいです。",
            "english": "Apparently it will rain tomorrow.",
            "note": "らしい often reports what one has heard."
        }
    ],
    "modality-kamoshirenai": [
        {
            "japanese": "彼は来ないかもしれません。",
            "english": "He might not come.",
            "note": "かも is a casual short form."
        }
    ],
    "modality-deshou-darou": [
        {
            "japanese": "明日は晴れるでしょう。",
            "english": "It will probably be sunny tomorrow.",
            "note": "でしょう is polite; だろう is plainer."
        }
    ],
    "quotation-to-omou": [
        {
            "japanese": "これは便利だと思います。",
            "english": "I think this is convenient.",
            "note": "The phrase before と is the thought content."
        }
    ],
    "attempt-you-to-suru": [
        {
            "japanese": "出かけようとした時、電話が鳴った。",
            "english": "Just as I was about to go out, the phone rang.",
            "note": "Volitional + とする marks trying or being about to act."
        }
    ],
    "plan-tsumori-yotei": [
        {
            "japanese": "来年日本へ行くつもりです。",
            "english": "I intend to go to Japan next year.",
            "note": "つもり is intention; 予定 is a plan."
        }
    ],
    "expectation-hazu": [
        {
            "japanese": "彼はもう着いたはずです。",
            "english": "He should have arrived already.",
            "note": "はず signals a reasoned expectation."
        }
    ],
    "reasoning-wake": [
        {
            "japanese": "高いわけではありません。",
            "english": "It is not necessarily expensive.",
            "note": "Specific わけ forms may be more precise if also detected."
        }
    ],
    "reasoning-wake-dewa-nai": [
        {
            "japanese": "嫌いなわけではない。",
            "english": "It is not that I dislike it.",
            "note": "Often softens or qualifies a previous implication."
        }
    ],
    "impossibility-wake-ga-nai": [
        {
            "japanese": "彼が知らないわけがない。",
            "english": "There is no way he does not know.",
            "note": "わけがない rejects the possibility."
        }
    ],
    "constraint-wake-ni-wa-ikanai": [
        {
            "japanese": "約束を破るわけにはいかない。",
            "english": "I cannot break the promise.",
            "note": "The barrier is often social or practical."
        }
    ],
    "purpose-tame-ni": [
        {
            "japanese": "家族のために働いています。",
            "english": "I work for my family.",
            "note": "ために marks purpose or benefit."
        }
    ],
    "purpose-you-ni": [
        {
            "japanese": "忘れないようにメモします。",
            "english": "I will write a note so I do not forget.",
            "note": "This is broader than ようになる and ようにする."
        }
    ],
    "timing-tokoro": [
        {
            "japanese": "今、出かけるところです。",
            "english": "I am just about to go out.",
            "note": "ところ focuses on the moment or situation."
        }
    ],
    "simultaneous-nagara": [
        {
            "japanese": "音楽を聞きながら勉強します。",
            "english": "I study while listening to music.",
            "note": "ながら joins simultaneous actions."
        }
    ],
    "state-mama": [
        {
            "japanese": "電気をつけたまま寝てしまった。",
            "english": "I fell asleep with the light still on.",
            "note": "まま preserves the previous state."
        }
    ],
    "list-tari": [
        {
            "japanese": "週末は映画を見たり本を読んだりします。",
            "english": "On weekends I do things like watch movies and read books.",
            "note": "たり usually appears in pairs but can be single."
        }
    ],
    "limitation-bakari": [
        {
            "japanese": "彼はゲームばかりしています。",
            "english": "He does nothing but play games.",
            "note": "ばかり can also mean just did after past tense."
        }
    ],
    "recent-ta-bakari": [
        {
            "japanese": "日本に来たばかりです。",
            "english": "I just came to Japan.",
            "note": "Past form + ばかり focuses on recent completion."
        }
    ],
    "limitation-dake-shika": [
        {
            "japanese": "百円しかありません。",
            "english": "I have only 100 yen.",
            "note": "しか expects a negative predicate."
        }
    ],
    "degree-hodo-kurai": [
        {
            "japanese": "一時間ぐらい待ちました。",
            "english": "I waited about an hour.",
            "note": "ほど often emphasizes degree; くらい can be approximate."
        }
    ],
    "role-toshite": [
        {
            "japanese": "医者として働いています。",
            "english": "I work as a doctor.",
            "note": "として marks role or capacity."
        }
    ],
    "relation-ni-yotte": [
        {
            "japanese": "国によって習慣が違います。",
            "english": "Customs differ depending on the country.",
            "note": "によって is highly context-dependent."
        }
    ],
    "topic-ni-tsuite": [
        {
            "japanese": "日本の歴史について調べています。",
            "english": "I am researching Japanese history.",
            "note": "について is a topic marker."
        }
    ],
    "target-ni-taishite": [
        {
            "japanese": "子どもに対して優しい。",
            "english": "She is kind toward children.",
            "note": "に対して points at the target."
        }
    ],
    "concession-ni-mo-kakawarazu": [
        {
            "japanese": "雨にもかかわらず試合は行われた。",
            "english": "The game was held despite the rain.",
            "note": "Formal concessive connector."
        }
    ],
    "concession-kuse-ni": [
        {
            "japanese": "知らないくせに文句を言う。",
            "english": "He complains even though he does not know.",
            "note": "くせに often sounds critical."
        }
    ],
    "suffix-tachi": [
        {
            "japanese": "私たちは学生です。",
            "english": "We are students.",
            "note": "Often used for people or animate groups."
        }
    ],
    "particle-wa": [
        {
            "japanese": "私は学生です。",
            "english": "I am a student.",
            "note": "は marks the topic, not always the grammatical subject."
        }
    ],
    "particle-ga": [
        {
            "japanese": "猫が走ります。",
            "english": "The cat runs.",
            "note": "が often introduces or focuses a subject."
        }
    ],
    "particle-wo": [
        {
            "japanese": "水を飲みます。",
            "english": "I drink water.",
            "note": "を marks the direct object."
        }
    ],
    "particle-de": [
        {
            "japanese": "駅で待ちます。",
            "english": "I will wait at the station.",
            "note": "で marks place, means, cause, or context."
        }
    ],
    "particle-ni": [
        {
            "japanese": "駅に行きます。",
            "english": "I go to the station.",
            "note": "に anchors time, target, or direction."
        }
    ],
    "particle-e": [
        {
            "japanese": "学校へ行きます。",
            "english": "I go to school.",
            "note": "へ emphasizes direction more than arrival."
        }
    ],
    "particle-to": [
        {
            "japanese": "友だちと話します。",
            "english": "I talk with my friend.",
            "note": "と has several basic particle uses."
        }
    ],
    "particle-no": [
        {
            "japanese": "私の本です。",
            "english": "It is my book.",
            "note": "の links nouns or nominalizes phrases."
        }
    ],
    "particle-mo": [
        {
            "japanese": "私も行きます。",
            "english": "I will go too.",
            "note": "も adds another item to the conversation."
        }
    ],
    "particle-ya": [
        {
            "japanese": "パンや卵を買いました。",
            "english": "I bought bread, eggs, and things like that.",
            "note": "や creates a non-exhaustive list."
        }
    ],
    "aspect-te-iru": [
        {
            "japanese": "今、本を読んでいます。",
            "english": "I am reading a book now.",
            "note": "ている can be progressive or resultative."
        }
    ],
    "aspect-te-aru": [
        {
            "japanese": "窓が開けてあります。",
            "english": "The window has been opened and left that way.",
            "note": "てある suggests an intentional prepared state."
        }
    ],
    "aspect-te-kuru": [
        {
            "japanese": "雨が降ってきました。",
            "english": "It has started raining.",
            "note": "てくる can be physical or temporal."
        }
    ],
    "aspect-te-iku": [
        {
            "japanese": "これからも勉強していきます。",
            "english": "I will keep studying from now on.",
            "note": "ていく often looks forward or outward."
        }
    ],
    "desire-tai": [
        {
            "japanese": "日本へ行きたいです。",
            "english": "I want to go to Japan.",
            "note": "たい describes the speaker's desire."
        }
    ],
    "ease-yasui-nikui": [
        {
            "japanese": "この本は読みやすいです。",
            "english": "This book is easy to read.",
            "note": "Stem + やすい or にくい describes ease."
        }
    ],
    "excess-sugiru": [
        {
            "japanese": "食べすぎました。",
            "english": "I ate too much.",
            "note": "Stem/adjective + すぎる marks excess."
        }
    ],
    "method-kata": [
        {
            "japanese": "使い方を教えてください。",
            "english": "Please teach me how to use it.",
            "note": "Stem + 方 creates a method noun."
        }
    ],
    "negative-nai": [
        {
            "japanese": "今日は行きません。",
            "english": "I will not go today.",
            "note": "ない and ません are negative endings."
        }
    ],
    "polite-past-mashita": [
        {
            "japanese": "昨日、勉強しました。",
            "english": "I studied yesterday.",
            "note": "ました is polite past."
        }
    ],
    "polite-masu": [
        {
            "japanese": "毎日勉強します。",
            "english": "I study every day.",
            "note": "ます is polite non-past."
        }
    ],
    "conditional-tara": [
        {
            "japanese": "雨が降ったら、行きません。",
            "english": "If it rains, I will not go.",
            "note": "たら can mean if, when, or after."
        }
    ],
    "conditional-ba": [
        {
            "japanese": "安ければ買います。",
            "english": "If it is cheap, I will buy it.",
            "note": "ば creates a conditional clause."
        }
    ],
    "conditional-ba-ii": [
        {
            "japanese": "もっと早く聞けばよかった。",
            "english": "I should have asked earlier.",
            "note": "ばよかった often expresses regret."
        }
    ],
    "conditional-nara": [
        {
            "japanese": "日本へ行くなら、春がいいです。",
            "english": "If you are going to Japan, spring is good.",
            "note": "なら often responds to or narrows a topic."
        }
    ],
    "conditional-to": [
        {
            "japanese": "このボタンを押すと、音が出ます。",
            "english": "When you press this button, a sound plays.",
            "note": "と conditionals often describe predictable results."
        }
    ],
    "concession-temo-demo": [
        {
            "japanese": "雨が降っても行きます。",
            "english": "I will go even if it rains.",
            "note": "て-form + も creates even if."
        }
    ],
    "reason-node": [
        {
            "japanese": "電車が遅れたので、遅刻しました。",
            "english": "The train was late, so I was late.",
            "note": "ので is often softer than から."
        }
    ],
    "reason-kara": [
        {
            "japanese": "寒いから、上着を着ます。",
            "english": "It is cold, so I will wear a jacket.",
            "note": "から is broad and context-dependent."
        }
    ],
    "appearance-sou": [
        {
            "japanese": "このケーキはおいしそうです。",
            "english": "This cake looks delicious.",
            "note": "そう describes appearance when attached to a stem."
        }
    ],
    "hearsay-sou-da": [
        {
            "japanese": "ニュースによると、雪が降るそうです。",
            "english": "According to the news, it will snow.",
            "note": "Plain-form clause + そうだ reports hearsay."
        }
    ],
    "volitional-you": [
        {
            "japanese": "一緒に帰ろう。",
            "english": "Let us go home together.",
            "note": "Volitional forms can be proposals or intentions."
        }
    ],
    "concession-noni": [
        {
            "japanese": "勉強したのに、忘れました。",
            "english": "Even though I studied, I forgot.",
            "note": "のに often carries disappointment."
        }
    ],
    "nominalizer-koto": [
        {
            "japanese": "泳ぐことが好きです。",
            "english": "I like swimming.",
            "note": "こと nominalizes actions or ideas."
        }
    ],
    "plain-past-ta": [
        {
            "japanese": "昨日、映画を見た。",
            "english": "I watched a movie yesterday.",
            "note": "This is a broad detector for past forms."
        }
    ],
    "sequence-te-kara": [
        {
            "japanese": "手を洗ってから食べます。",
            "english": "I eat after washing my hands.",
            "note": "てから emphasizes the first action is completed first."
        }
    ],
    "time-mae-ni": [
        {
            "japanese": "寝る前に歯を磨きます。",
            "english": "I brush my teeth before sleeping.",
            "note": "Dictionary form + 前に means before doing."
        }
    ],
    "time-ato-de-ni": [
        {
            "japanese": "仕事の後で会いましょう。",
            "english": "Let us meet after work.",
            "note": "後で is common for after."
        }
    ],
    "time-toki": [
        {
            "japanese": "困ったとき、友だちに相談します。",
            "english": "When I am in trouble, I consult a friend.",
            "note": "とき marks the time of a situation."
        }
    ],
    "limit-made-made-ni": [
        {
            "japanese": "五時までに帰ります。",
            "english": "I will return by five.",
            "note": "までに means by a deadline."
        }
    ],
    "comparison-yori-nohou": [
        {
            "japanese": "犬より猫の方が好きです。",
            "english": "I like cats more than dogs.",
            "note": "Comparison often uses both より and 方が."
        }
    ],
    "superlative-ichiban": [
        {
            "japanese": "寿司が一番好きです。",
            "english": "I like sushi the most.",
            "note": "一番 marks the top choice or degree."
        }
    ],
    "question-ka-douka": [
        {
            "japanese": "行くかどうかまだ決めていません。",
            "english": "I have not decided whether I will go.",
            "note": "かどうか embeds uncertainty."
        }
    ],
    "purpose-masu-stem-ni-iku": [
        {
            "japanese": "映画を見に行きます。",
            "english": "I will go to see a movie.",
            "note": "The stem before に marks what someone goes to do."
        }
    ],
    "nominalizer-no": [
        {
            "japanese": "泳ぐのは楽しいです。",
            "english": "Swimming is fun.",
            "note": "の nominalizes the action before は."
        }
    ],
    "quotation-to-iu": [
        {
            "japanese": "田中さんという人に会いました。",
            "english": "I met a person called Tanaka.",
            "note": "という connects quoted, named, or defined content."
        }
    ],
    "casual-tte": [
        {
            "japanese": "明日来るって聞きました。",
            "english": "I heard that he is coming tomorrow.",
            "note": "って is casual and broad."
        }
    ],
    "explanation-n-desu": [
        {
            "japanese": "頭が痛いんです。",
            "english": "The thing is, my head hurts.",
            "note": "んです often explains or asks for explanation."
        }
    ],
    "explanation-no-da": [
        {
            "japanese": "今日は行けないんだ。",
            "english": "The thing is, I cannot go today.",
            "note": "んだ gives the statement explanatory context."
        }
    ],
    "existence-ga-aru-iru": [
        {
            "japanese": "机の上に本があります。",
            "english": "There is a book on the desk.",
            "note": "がある marks existence or possession."
        }
    ],
    "skill-ga-suki-jouzu-heta": [
        {
            "japanese": "妹は料理が上手です。",
            "english": "My younger sister is good at cooking.",
            "note": "The evaluated skill or liked thing is marked with が."
        }
    ],
    "skill-no-ga-suki": [
        {
            "japanese": "走るのが好きです。",
            "english": "I like running.",
            "note": "の turns the action into the thing being evaluated."
        }
    ],
    "invitation-mashou": [
        {
            "japanese": "一緒に帰りましょう。",
            "english": "Let's go home together.",
            "note": "ます-stem + ましょう makes a polite invitation."
        }
    ],
    "invitation-masen-ka": [
        {
            "japanese": "コーヒーを飲みませんか。",
            "english": "Would you like to drink coffee?",
            "note": "ませんか is a common polite invitation."
        }
    ],
    "relief-te-yokatta": [
        {
            "japanese": "会えてよかったです。",
            "english": "I'm glad I could see you.",
            "note": "てよかった means it was good that the action happened."
        }
    ],
    "without-zuni": [
        {
            "japanese": "朝ご飯を食べずに出た。",
            "english": "I left without eating breakfast.",
            "note": "ずに is a formal/literary negative connector."
        }
    ],
    "without-naide": [
        {
            "japanese": "傘を持たないで出かけた。",
            "english": "I went out without taking an umbrella.",
            "note": "ないで can mean without doing."
        }
    ],
    "apology-te-sumimasen": [
        {
            "japanese": "遅れてすみません。",
            "english": "I'm sorry for being late.",
            "note": "てすみません gives the reason for the apology."
        }
    ],
    "necessity-ga-hitsuyou": [
        {
            "japanese": "予約が必要です。",
            "english": "A reservation is necessary.",
            "note": "が marks the thing that is needed."
        }
    ],
    "sensation-ga-suru": [
        {
            "japanese": "いい匂いがする。",
            "english": "It smells good.",
            "note": "がする often marks a perceived sensation."
        }
    ],
    "case-baai": [
        {
            "japanese": "雨の場合は中止です。",
            "english": "In case of rain, it will be cancelled.",
            "note": "場合 means case or situation."
        }
    ],
    "examples-nado": [
        {
            "japanese": "本などを読みます。",
            "english": "I read books and things like that.",
            "note": "など softens or leaves the list open."
        }
    ],
    "examples-toka": [
        {
            "japanese": "週末は映画とか見ます。",
            "english": "On weekends I watch things like movies.",
            "note": "とか is a casual example marker."
        }
    ],
    "hearsay-to-iwarete-iru": [
        {
            "japanese": "彼は天才と言われている。",
            "english": "He is said to be a genius.",
            "note": "と言われている reports a common statement."
        }
    ],
    "hearsay-to-kiita": [
        {
            "japanese": "明日は雨だと聞きました。",
            "english": "I heard that it will rain tomorrow.",
            "note": "と聞いた marks the heard content."
        }
    ],
    "similarity-you-da": [
        {
            "japanese": "彼は疲れているようだ。",
            "english": "He seems tired.",
            "note": "ようだ can mean seems like or resembles."
        }
    ],
    "permission-sasete-kudasai": [
        {
            "japanese": "少し考えさせてください。",
            "english": "Please let me think for a bit.",
            "note": "Causative て-form + ください asks to be allowed."
        }
    ],
    "decision-koto-ni-suru": [
        {
            "japanese": "毎朝走ることにしました。",
            "english": "I decided to run every morning.",
            "note": "ことにする marks personal decision."
        }
    ],
    "arrangement-koto-ni-naru": [
        {
            "japanese": "来月転勤することになりました。",
            "english": "It has been decided that I will transfer next month.",
            "note": "Often implies an external decision."
        }
    ],
    "honorific-o-go-ni-naru-suru": [
        {
            "japanese": "社長がお帰りになります。",
            "english": "The president will return.",
            "note": "Regex can flag the construction, but politeness role depends on the verb."
        }
    ],
    "polite-gozaimasu": [
        {
            "japanese": "質問がございます。",
            "english": "I have a question.",
            "note": "ございます is very polite."
        }
    ],
    "advice-beki": [
        {
            "japanese": "約束は守るべきです。",
            "english": "You should keep promises.",
            "note": "べき is stronger and more formal than 方がいい."
        }
    ],
    "time-aida-aida-ni": [
        {
            "japanese": "夏休みの間に本を三冊読みました。",
            "english": "I read three books during summer vacation.",
            "note": "間に focuses on something happening within the interval."
        }
    ],
    "time-uchi-ni": [
        {
            "japanese": "明るいうちに帰りましょう。",
            "english": "Let us go home while it is still light.",
            "note": "うちに warns the condition may change."
        }
    ],
    "time-saichuu-ni": [
        {
            "japanese": "会議の最中に電話が鳴った。",
            "english": "The phone rang in the middle of the meeting.",
            "note": "最中に emphasizes interruption during an event."
        }
    ],
    "repetition-tabi-ni": [
        {
            "japanese": "彼に会うたびに元気をもらう。",
            "english": "Every time I meet him, I feel encouraged.",
            "note": "たびに repeats with each occurrence."
        }
    ],
    "incidental-tsuide-ni": [
        {
            "japanese": "買い物のついでに郵便局へ行きます。",
            "english": "I will go to the post office while I am out shopping.",
            "note": "ついでに adds a convenient side task."
        }
    ],
    "phase-compound-verb": [
        {
            "japanese": "雨が降り始めました。",
            "english": "It started raining.",
            "note": "Verb stem + 始める marks the start of an action."
        }
    ],
    "state-ppanashi": [
        {
            "japanese": "電気をつけっぱなしにした。",
            "english": "I left the light on.",
            "note": "っぱなし often has a negative nuance."
        }
    ],
    "covered-darake": [
        {
            "japanese": "服が泥だらけだ。",
            "english": "My clothes are covered in mud.",
            "note": "だらけ often marks an unpleasant abundance."
        }
    ],
    "fresh-tate": [
        {
            "japanese": "焼きたてのパンを買った。",
            "english": "I bought freshly baked bread.",
            "note": "たて attaches to a verb stem."
        }
    ],
    "elapsed-buri-ni": [
        {
            "japanese": "三年ぶりに友だちに会った。",
            "english": "I met my friend for the first time in three years.",
            "note": "ぶりに measures time since the previous occurrence."
        }
    ],
    "interval-goto-ni": [
        {
            "japanese": "会うごとに日本語が上手になる。",
            "english": "Every time we meet, your Japanese gets better.",
            "note": "ごとに means each or every."
        }
    ],
    "interval-oki-ni": [
        {
            "japanese": "一日おきに運動します。",
            "english": "I exercise every other day.",
            "note": "おきに marks spacing between occurrences."
        }
    ],
    "emphasis-kara-koso": [
        {
            "japanese": "大切だからこそ厳しく言う。",
            "english": "I say it strictly precisely because it is important.",
            "note": "からこそ strengthens the reason."
        }
    ],
    "source-ni-yoru-to": [
        {
            "japanese": "ニュースによると雪です。",
            "english": "According to the news, it will snow.",
            "note": "によると introduces the information source."
        }
    ],
    "topic-ni-kansuru": [
        {
            "japanese": "環境に関する問題を話し合う。",
            "english": "We discuss problems related to the environment.",
            "note": "に関する is the noun-modifying form of に関して."
        }
    ],
    "context-ni-okeru": [
        {
            "japanese": "現代における課題です。",
            "english": "It is an issue in the present day.",
            "note": "における modifies a following noun."
        }
    ],
    "standard-ni-shite-wa": [
        {
            "japanese": "子どもにしては上手です。",
            "english": "For a child, they are skilled.",
            "note": "にしては compares against expectations."
        }
    ],
    "simultaneous-to-douji-ni": [
        {
            "japanese": "卒業と同時に働き始めた。",
            "english": "I started working at the same time as graduation.",
            "note": "と同時に links simultaneous events."
        }
    ],
    "supposition-to-shitara": [
        {
            "japanese": "行くとしたら明日です。",
            "english": "If I were to go, it would be tomorrow.",
            "note": "としたら sets a supposition."
        }
    ],
    "almost-tokoro-datta": [
        {
            "japanese": "電車に遅れるところだった。",
            "english": "I almost missed the train.",
            "note": "ところだった marks a near event."
        }
    ],
    "nonlimiting-wa-mochiron": [
        {
            "japanese": "日本語はもちろん英語も必要です。",
            "english": "English is necessary, not only Japanese.",
            "note": "はもちろん often pairs with も."
        }
    ],
    "pretend-furi-wo-suru": [
        {
            "japanese": "知らないふりをした。",
            "english": "I pretended not to know.",
            "note": "ふりをする means to pretend."
        }
    ],
    "instant-ta-totan-ni": [
        {
            "japanese": "外に出たとたん雨が降った。",
            "english": "The moment I went outside, it started raining.",
            "note": "たとたんに marks an immediate result."
        }
    ],
    "difficulty-gatai": [
        {
            "japanese": "信じがたい話です。",
            "english": "It is a hard-to-believe story.",
            "note": "がたい attaches to a verb stem."
        }
    ],
    "only-shika-nai": [
        {
            "japanese": "やるしかない。",
            "english": "There is nothing to do but do it.",
            "note": "しかない creates a strong only-choice meaning."
        }
    ],
    "emphasis-sae": [
        {
            "japanese": "子どもでさえ知っています。",
            "english": "Even children know it.",
            "note": "さえ highlights an unexpected minimum or extreme."
        }
    ],
    "emphasis-koso": [
        {
            "japanese": "今こそ始めよう。",
            "english": "Now is exactly the time to begin.",
            "note": "こそ gives focused emphasis."
        }
    ],
    "try-te-goran": [
        {
            "japanese": "食べてごらん。",
            "english": "Try eating it.",
            "note": "てごらん is often used by adults toward children or close listeners."
        }
    ],
    "cause-sei-okage-de": [
        {
            "japanese": "先生のおかげで合格できました。",
            "english": "Thanks to my teacher, I was able to pass.",
            "note": "おかげで is positive; せいで is negative."
        }
    ],
    "manner-toori": [
        {
            "japanese": "説明のとおりに操作してください。",
            "english": "Please operate it as explained.",
            "note": "とおり means following a model."
        }
    ],
    "certainty-ni-chigai-nai": [
        {
            "japanese": "彼は医者に違いない。",
            "english": "He must be a doctor.",
            "note": "に違いない is strong certainty."
        }
    ],
    "certainty-ni-kimatte-iru": [
        {
            "japanese": "彼なら勝つに決まっている。",
            "english": "If it is him, he is sure to win.",
            "note": "Often sounds emphatic or subjective."
        }
    ],
    "qualification-to-wa-kagiranai": [
        {
            "japanese": "高いものが良いとは限りません。",
            "english": "Expensive things are not necessarily good.",
            "note": "とは限らない denies universality."
        }
    ],
    "contrast-ippou-de": [
        {
            "japanese": "収入が増えた一方で、忙しくなった。",
            "english": "My income increased, but on the other hand I became busier.",
            "note": "一方で compares two sides."
        }
    ],
    "contrast-hanmen": [
        {
            "japanese": "便利な反面、危険もある。",
            "english": "It is convenient, but on the other hand there are dangers.",
            "note": "反面 marks the opposite side."
        }
    ],
    "substitution-kawari-ni": [
        {
            "japanese": "映画に行くかわりに家で休みます。",
            "english": "Instead of going to a movie, I will rest at home.",
            "note": "かわりに marks replacement or exchange."
        }
    ],
    "topic-ni-kanshite": [
        {
            "japanese": "仕事に関して相談があります。",
            "english": "I have something to discuss about work.",
            "note": "に関して is formal topic marking."
        }
    ],
    "comparison-ni-kurabete": [
        {
            "japanese": "去年に比べて暑いです。",
            "english": "It is hot compared with last year.",
            "note": "に比べて sets comparison baseline."
        }
    ],
    "basis-ni-motozuite": [
        {
            "japanese": "データに基づいて判断します。",
            "english": "We will decide based on data.",
            "note": "に基づいて is formal."
        }
    ],
    "following-ni-sotte": [
        {
            "japanese": "計画に沿って進めます。",
            "english": "We will proceed according to the plan.",
            "note": "に沿って follows a route or plan."
        }
    ],
    "following-change-ni-shitagatte": [
        {
            "japanese": "説明に従って操作してください。",
            "english": "Please operate it according to the instructions.",
            "note": "Can also mean as something changes."
        }
    ],
    "change-ni-tsurete": [
        {
            "japanese": "寒くなるにつれて人が減った。",
            "english": "As it got colder, fewer people came.",
            "note": "につれて links gradual changes."
        }
    ],
    "together-to-tomo-ni": [
        {
            "japanese": "時代とともに言葉も変わる。",
            "english": "Language changes along with the times.",
            "note": "Formal together/change marker."
        }
    ],
    "context-ni-oite": [
        {
            "japanese": "現代社会において重要です。",
            "english": "It is important in modern society.",
            "note": "において is formal and written."
        }
    ],
    "means-wo-tsuujite-tooshite": [
        {
            "japanese": "一年を通して暖かいです。",
            "english": "It is warm throughout the year.",
            "note": "を通じて/通して can mean through or throughout."
        }
    ],
    "representative-wo-hajime": [
        {
            "japanese": "東京をはじめ多くの都市で行われた。",
            "english": "It was held in many cities, starting with Tokyo.",
            "note": "をはじめ introduces a representative item."
        }
    ],
    "limit-ni-kagiru-kagirazu": [
        {
            "japanese": "疲れた時は寝るに限る。",
            "english": "When tired, sleeping is best.",
            "note": "に限る can also recommend the best option."
        }
    ],
    "suffix-gachi": [
        {
            "japanese": "忙しいと食事を忘れがちです。",
            "english": "When busy, I tend to forget meals.",
            "note": "がち often marks an undesirable tendency."
        }
    ],
    "suffix-gimi": [
        {
            "japanese": "今日は疲れ気味です。",
            "english": "I am a bit tired today.",
            "note": "気味 is a slight tendency or condition."
        }
    ],
    "suffix-ge": [
        {
            "japanese": "彼は寂しげに笑った。",
            "english": "He smiled sadly.",
            "note": "げ often describes visible mood."
        }
    ],
    "suffix-ppoi": [
        {
            "japanese": "この服は子どもっぽい。",
            "english": "These clothes look childish.",
            "note": "っぽい is casual and broad."
        }
    ],
    "negative-youni-nai": [
        {
            "japanese": "壊れすぎて直しようがない。",
            "english": "It is too broken to fix.",
            "note": "Stem + ようがない means no way to do."
        }
    ],
    "impossible-kkonai": [
        {
            "japanese": "彼が負けっこない。",
            "english": "There is no way he will lose.",
            "note": "っこない is casual and emphatic."
        }
    ],
    "condition-kara-ni-wa": [
        {
            "japanese": "やるからには最後までやります。",
            "english": "Since I am doing it, I will do it to the end.",
            "note": "からには often implies commitment."
        }
    ],
    "qualification-kara-to-itte": [
        {
            "japanese": "安いからといって、買うとは限らない。",
            "english": "Just because it is cheap does not mean I will buy it.",
            "note": "Often pairs with a negative or limiting conclusion."
        }
    ],
    "condition-nai-kagiri": [
        {
            "japanese": "雨が降らない限り、試合は行われます。",
            "english": "Unless it rains, the match will be held.",
            "note": "ない限り means unless."
        }
    ],
    "condition-ijou-wa": [
        {
            "japanese": "約束した以上は守るべきだ。",
            "english": "Since you promised, you should keep it.",
            "note": "以上は is formal and firm."
        }
    ],
    "condition-ue-wa": [
        {
            "japanese": "引き受けた上は全力を尽くします。",
            "english": "Now that I have accepted, I will do my best.",
            "note": "上は is formal."
        }
    ],
    "sequence-ue-de": [
        {
            "japanese": "内容を確認した上で署名します。",
            "english": "I will sign after confirming the contents.",
            "note": "上で often means after careful action."
        }
    ],
    "addition-ue-ni": [
        {
            "japanese": "彼は親切な上に面白い。",
            "english": "He is kind and, on top of that, funny.",
            "note": "上に stacks positive or negative facts."
        }
    ],
    "viewpoint-kara-miru-to": [
        {
            "japanese": "専門家から見ると簡単です。",
            "english": "From an expert's view, it is simple.",
            "note": "から見ると introduces a viewpoint."
        }
    ],
    "starting-kara-shite": [
        {
            "japanese": "名前からして怪しい。",
            "english": "Even the name sounds suspicious.",
            "note": "からして can mean judging from or even."
        }
    ],
    "concession-ni-shitemo-toshitemo": [
        {
            "japanese": "行くにしても、早めに連絡してください。",
            "english": "Even if you go, please contact me early.",
            "note": "にしても and としても introduce a conceded case."
        }
    ],
    "concession-ni-shiro-ni-seyo": [
        {
            "japanese": "賛成にせよ反対にせよ、理由を説明してください。",
            "english": "Whether you agree or disagree, please explain why.",
            "note": "Often repeats for A or B alternatives."
        }
    ],
    "after-all-ageku": [
        {
            "japanese": "長く迷ったあげく、買わないことにした。",
            "english": "After much hesitation, I decided not to buy it.",
            "note": "あげく often carries a negative result."
        }
    ],
    "after-effort-sue-ni": [
        {
            "japanese": "何度も話し合った末に、計画を変更した。",
            "english": "After many discussions, we changed the plan.",
            "note": "末に emphasizes the process before the result."
        }
    ],
    "only-ni-suginai": [
        {
            "japanese": "これは一例にすぎません。",
            "english": "This is nothing more than one example.",
            "note": "にすぎない minimizes."
        }
    ],
    "essence-ni-hoka-naranai": [
        {
            "japanese": "成功は努力の結果にほかならない。",
            "english": "Success is nothing other than the result of effort.",
            "note": "Formal emphatic conclusion."
        }
    ],
    "necessity-zaru-wo-enai": [
        {
            "japanese": "予定を変更せざるを得ない。",
            "english": "We have no choice but to change the plan.",
            "note": "ざるを得ない is formal necessity."
        }
    ],
    "compulsion-zu-ni-wa-irarenai": [
        {
            "japanese": "笑わずにはいられなかった。",
            "english": "I could not help laughing.",
            "note": "Often used for emotions or impulses."
        }
    ],
    "possibility-eru-enai": [
        {
            "japanese": "事故は起こり得る。",
            "english": "An accident can happen.",
            "note": "得る is read うる or える depending on form."
        }
    ],
    "risk-kanenai": [
        {
            "japanese": "このままでは失敗しかねない。",
            "english": "At this rate, we might fail.",
            "note": "かねない is used for undesirable possibilities."
        }
    ],
    "difficulty-kaneru": [
        {
            "japanese": "その質問には答えかねます。",
            "english": "I am unable to answer that question.",
            "note": "Often used in formal refusal."
        }
    ],
    "emotion-te-naranai": [
        {
            "japanese": "心配でならない。",
            "english": "I cannot help being worried.",
            "note": "Used with feelings and sensations."
        }
    ],
    "emotion-te-tamaranai": [
        {
            "japanese": "眠くてたまらない。",
            "english": "I am unbearably sleepy.",
            "note": "てたまらない intensifies feeling."
        }
    ],
    "emotion-te-shouganai": [
        {
            "japanese": "楽しみでしょうがない。",
            "english": "I am extremely excited.",
            "note": "Casual form of intense feeling."
        }
    ],
    "timing-shidai": [
        {
            "japanese": "準備ができ次第、出発します。",
            "english": "We will leave as soon as preparations are ready.",
            "note": "次第 is context-dependent."
        }
    ],
    "time-sai-ni": [
        {
            "japanese": "申し込む際に必要です。",
            "english": "It is needed when applying.",
            "note": "際に is formal when/occasion."
        }
    ],
    "occasion-ni-atatte": [
        {
            "japanese": "開始にあたって説明します。",
            "english": "I will explain before we begin.",
            "note": "にあたって often marks an important occasion."
        }
    ],
    "occasion-ni-saishite": [
        {
            "japanese": "卒業に際して一言述べます。",
            "english": "I will say a few words on the occasion of graduation.",
            "note": "に際して is formal."
        }
    ],
    "prior-ni-sakidatte": [
        {
            "japanese": "会議に先立って資料を配った。",
            "english": "Materials were distributed before the meeting.",
            "note": "Formal prior-to marker."
        }
    ],
    "trigger-wo-kikkake-ni": [
        {
            "japanese": "留学をきっかけに日本語を始めた。",
            "english": "Studying abroad triggered me to start Japanese.",
            "note": "きっかけ is a trigger or opportunity."
        }
    ],
    "trigger-wo-keiki-ni": [
        {
            "japanese": "受賞を契機に仕事が増えた。",
            "english": "After the award, work increased.",
            "note": "契機 is formal turning point."
        }
    ],
    "span-ni-watatte": [
        {
            "japanese": "会議は三日間にわたって行われた。",
            "english": "The conference was held over three days.",
            "note": "にわたって emphasizes breadth or duration."
        }
    ],
    "accompany-ni-tomonatte": [
        {
            "japanese": "人口の増加に伴って問題も増えた。",
            "english": "Problems increased along with the population.",
            "note": "に伴って is formal."
        }
    ],
    "response-ni-oujite": [
        {
            "japanese": "年齢に応じて料金が変わります。",
            "english": "The fee changes according to age.",
            "note": "に応じて means responding to a condition."
        }
    ],
    "basis-wo-fumaete": [
        {
            "japanese": "結果を踏まえて改善します。",
            "english": "We will improve based on the results.",
            "note": "を踏まえて means taking into account."
        }
    ],
    "merit-dake-atte": [
        {
            "japanese": "有名なだけあって、おいしい。",
            "english": "As expected from its fame, it is delicious.",
            "note": "だけあって praises or acknowledges a reason."
        }
    ],
    "because-dake-ni": [
        {
            "japanese": "大切なだけに失敗したくない。",
            "english": "Because it is important, I do not want to fail.",
            "note": "だけに intensifies the reason."
        }
    ],
    "concession-youga-maiga": [
        {
            "japanese": "雨が降ろうが降るまいが行きます。",
            "english": "I will go whether it rains or not.",
            "note": "Volitional-like form + が pairs with まいが."
        }
    ],
    "concession-nagara-mo": [
        {
            "japanese": "狭いながらも快適な部屋です。",
            "english": "It is a small but comfortable room.",
            "note": "ながらも is concessive."
        }
    ],
    "continuation-tsutsu": [
        {
            "japanese": "状況は改善しつつある。",
            "english": "The situation is gradually improving.",
            "note": "つつある marks ongoing change."
        }
    ],
    "cause-bakari-ni": [
        {
            "japanese": "一言言ったばかりに誤解された。",
            "english": "Just because I said one word, I was misunderstood.",
            "note": "ばかりに usually has regret."
        }
    ],
    "contrast-dokoro-ka": [
        {
            "japanese": "暇どころか、忙しすぎます。",
            "english": "Far from being free, I am too busy.",
            "note": "どころか heightens contrast."
        }
    ],
    "impossible-dokoro-dewa-nai": [
        {
            "japanese": "遊ぶどころではない。",
            "english": "This is no time to play.",
            "note": "どころではない rejects possibility due to circumstances."
        }
    ],
    "nonlimiting-dake-denaku": [
        {
            "japanese": "彼は日本語だけでなく韓国語も話せる。",
            "english": "He can speak not only Japanese but also Korean.",
            "note": "Often pairs with も."
        }
    ],
    "regardless-ni-kakawarazu": [
        {
            "japanese": "年齢にかかわらず参加できます。",
            "english": "You can participate regardless of age.",
            "note": "Do not confuse with にもかかわらず (despite)."
        }
    ],
    "contrary-ni-hanshite": [
        {
            "japanese": "予想に反して売れた。",
            "english": "It sold contrary to expectations.",
            "note": "に反して means against or contrary to."
        }
    ],
    "addition-ni-kuwaete": [
        {
            "japanese": "家賃に加えて光熱費も必要です。",
            "english": "Utilities are needed in addition to rent.",
            "note": "に加えて is formal addition."
        }
    ],
    "target-ni-kotaete": [
        {
            "japanese": "期待に応えて頑張ります。",
            "english": "I will work hard in response to expectations.",
            "note": "に応えて responds to people or expectations."
        }
    ],
    "center-wo-chuushin-ni": [
        {
            "japanese": "東京を中心に活動しています。",
            "english": "We operate mainly around Tokyo.",
            "note": "を中心に marks the center."
        }
    ],
    "regardless-wo-toyazu": [
        {
            "japanese": "経験を問わず応募できます。",
            "english": "You can apply regardless of experience.",
            "note": "を問わず is formal."
        }
    ],
    "topic-wo-megutte": [
        {
            "japanese": "予算をめぐって議論が続いた。",
            "english": "Debate continued over the budget.",
            "note": "Often used with disputes or discussion."
        }
    ],
    "direction-muke-muki": [
        {
            "japanese": "これは初心者向けの本です。",
            "english": "This is a book for beginners.",
            "note": "向け targets; 向き suits."
        }
    ],
    "relative-wari-ni": [
        {
            "japanese": "値段のわりにおいしい。",
            "english": "It is tasty considering the price.",
            "note": "わりに compares against expectation."
        }
    ],
    "memory-kke": [
        {
            "japanese": "明日の会議は何時だっけ。",
            "english": "What time was tomorrow's meeting again?",
            "note": "っけ is casual recollection."
        }
    ],
    "quote-to-iu-yori": [
        {
            "japanese": "彼は静かというより無口だ。",
            "english": "He is not so much quiet as taciturn.",
            "note": "というより adjusts the label."
        }
    ],
    "example-to-itta": [
        {
            "japanese": "京都や奈良といった古い町。",
            "english": "Old cities such as Kyoto and Nara.",
            "note": "といった lists examples."
        }
    ],
    "topic-to-ieba": [
        {
            "japanese": "日本の食べ物といえば寿司です。",
            "english": "Speaking of Japanese food, sushi comes to mind.",
            "note": "といえば sets up an association."
        }
    ],
    "thing-mono-da": [
        {
            "japanese": "時間が経つのは早いものです。",
            "english": "Time really does pass quickly.",
            "note": "ものだ is context-sensitive."
        }
    ],
    "cause-mono-dakara": [
        {
            "japanese": "道が混んでいたものだから遅れました。",
            "english": "I was late because the road was crowded.",
            "note": "ものだから softens an explanation."
        }
    ],
    "concession-mono-no": [
        {
            "japanese": "買ったものの、まだ使っていない。",
            "english": "Although I bought it, I have not used it yet.",
            "note": "ものの is written-style concession."
        }
    ],
    "advice-koto-da": [
        {
            "japanese": "上達したいなら練習することだ。",
            "english": "If you want to improve, you should practice.",
            "note": "ことだ can be advice."
        }
    ],
    "unnecessary-koto-wa-nai": [
        {
            "japanese": "そんなに心配することはない。",
            "english": "There is no need to worry so much.",
            "note": "ことはない removes necessity."
        }
    ],
    "double-negative-nai-koto-wa-nai": [
        {
            "japanese": "できないことはない。",
            "english": "It is not that I cannot do it.",
            "note": "Often means possible, but not easily or enthusiastically."
        }
    ],
    "explanation-to-iu-koto-da": [
        {
            "japanese": "つまり中止ということです。",
            "english": "In other words, it means it is cancelled.",
            "note": "Can be explanation or hearsay."
        }
    ],
    "nature-to-iu-mono-da": [
        {
            "japanese": "それが親切というものだ。",
            "english": "That is what kindness is.",
            "note": "Often makes a normative evaluation."
        }
    ],
    "not-nature-to-iu-mono-dewa-nai": [
        {
            "japanese": "高ければ良いというものではない。",
            "english": "Expensive does not necessarily mean good.",
            "note": "否定 of というものだ."
        }
    ],
    "wish-nai-mono-ka": [
        {
            "japanese": "もっと簡単にできないものか。",
            "english": "Is there no way to do it more easily?",
            "note": "Often expresses longing for a solution."
        }
    ],
    "instant-ga-hayai-ka": [
        {
            "japanese": "ドアを開けるが早いか、犬が飛び出した。",
            "english": "No sooner had I opened the door than the dog jumped out.",
            "note": "Literary immediate sequence."
        }
    ],
    "instant-ya-inaya": [
        {
            "japanese": "ベルが鳴るや否や、生徒が立ち上がった。",
            "english": "As soon as the bell rang, the students stood up.",
            "note": "Formal/literary immediate sequence."
        }
    ],
    "instant-nari": [
        {
            "japanese": "彼は帰るなり寝てしまった。",
            "english": "As soon as he got home, he fell asleep.",
            "note": "N1 なり differs from listing なり."
        }
    ],
    "repetition-soba-kara": [
        {
            "japanese": "覚えたそばから忘れる。",
            "english": "I forget things as soon as I learn them.",
            "note": "Often negative or frustrating."
        }
    ],
    "unexpected-ka-to-omoi-kiya": [
        {
            "japanese": "終わったかと思いきや、また問題が出た。",
            "english": "Just when I thought it was over, another problem appeared.",
            "note": "思いきや signals reversal."
        }
    ],
    "incidental-katagata": [
        {
            "japanese": "お礼かたがた伺いました。",
            "english": "I visited also to express my thanks.",
            "note": "Formal combined purpose."
        }
    ],
    "incidental-gatera": [
        {
            "japanese": "散歩がてら買い物に行く。",
            "english": "I will go shopping while taking a walk.",
            "note": "がてら is like ついでに but more lexical."
        }
    ],
    "starting-wo-kawakiri-ni": [
        {
            "japanese": "東京を皮切りに全国で上映される。",
            "english": "Starting with Tokyo, it will be shown nationwide.",
            "note": "皮切り is the opening event."
        }
    ],
    "endpoint-wo-kagiri-ni": [
        {
            "japanese": "今日を限りに退職します。",
            "english": "As of today, I will resign.",
            "note": "を限りに marks an endpoint."
        }
    ],
    "means-wo-motte": [
        {
            "japanese": "本日をもって終了します。",
            "english": "This ends as of today.",
            "note": "をもって is formal."
        }
    ],
    "turning-wo-sakai-ni": [
        {
            "japanese": "結婚を境に生活が変わった。",
            "english": "My life changed after marriage.",
            "note": "境 marks a boundary."
        }
    ],
    "range-ni-itaru-made": [
        {
            "japanese": "細部に至るまで確認した。",
            "english": "I checked everything down to the details.",
            "note": "に至るまで emphasizes breadth."
        }
    ],
    "stage-ni-itatte": [
        {
            "japanese": "事態がここに至っては手遅れだ。",
            "english": "At this stage, it is too late.",
            "note": "に至っては emphasizes a reached state."
        }
    ],
    "context-ni-atte": [
        {
            "japanese": "困難な状況にあって冷静だった。",
            "english": "He was calm in a difficult situation.",
            "note": "Formal written expression."
        }
    ],
    "standard-ni-sokushite": [
        {
            "japanese": "現実に即して考える。",
            "english": "Think in line with reality.",
            "note": "に即して is formal."
        }
    ],
    "exclusive-wo-oite": [
        {
            "japanese": "彼をおいて適任者はいない。",
            "english": "There is no one more suitable than him.",
            "note": "Often used with いない or ない."
        }
    ],
    "defiance-wo-mono-to-mo-sezu": [
        {
            "japanese": "悪天候をものともせず進んだ。",
            "english": "They advanced despite the bad weather.",
            "note": "Heroic or formal tone."
        }
    ],
    "forced-wo-yogi-naku-sareru": [
        {
            "japanese": "計画の変更を余儀なくされた。",
            "english": "We were forced to change the plan.",
            "note": "Noun + を余儀なくされる."
        }
    ],
    "force-wo-yogi-naku-saseru": [
        {
            "japanese": "大雪が中止を余儀なくさせた。",
            "english": "Heavy snow forced the cancellation.",
            "note": "Cause version of 余儀なくされる."
        }
    ],
    "emotion-ni-taenai": [
        {
            "japanese": "感謝に堪えません。",
            "english": "I cannot thank you enough.",
            "note": "Often formal with 感謝 or 遺憾."
        }
    ],
    "reluctance-ni-shinobinai": [
        {
            "japanese": "彼に真実を言うに忍びない。",
            "english": "I cannot bear to tell him the truth.",
            "note": "Emotional reluctance."
        }
    ],
    "easy-inference-ni-katagunai": [
        {
            "japanese": "彼の苦労は想像に難くない。",
            "english": "His hardship is not hard to imagine.",
            "note": "Usually with 想像 or 理解."
        }
    ],
    "worthy-ni-ataru": [
        {
            "japanese": "この本は読むに値する。",
            "english": "This book is worth reading.",
            "note": "に値する means worth doing/evaluating."
        }
    ],
    "sufficient-ni-taru": [
        {
            "japanese": "信頼に足る人物です。",
            "english": "He is a person worthy of trust.",
            "note": "Formal sufficiency/worth."
        }
    ],
    "utmost-no-itari": [
        {
            "japanese": "光栄の至りです。",
            "english": "It is the height of honor.",
            "note": "Formal set expression."
        }
    ],
    "extreme-kiwamaru-kiwamarinai": [
        {
            "japanese": "失礼極まりない態度だ。",
            "english": "That is an extremely rude attitude.",
            "note": "N1 formal intensifier."
        }
    ],
    "deep-wish-te-yamanai": [
        {
            "japanese": "成功を願ってやみません。",
            "english": "I sincerely wish for your success.",
            "note": "Formal with wishes and feelings."
        }
    ],
    "since-te-kara-to-iu-mono": [
        {
            "japanese": "犬を飼ってからというもの、毎日が楽しい。",
            "english": "Ever since getting a dog, every day has been fun.",
            "note": "Emphasizes lasting change."
        }
    ],
    "consequence-zu-ni-wa-okanai": [
        {
            "japanese": "この映画は人を感動させずにはおかない。",
            "english": "This movie is sure to move people.",
            "note": "Often means cannot fail to affect."
        }
    ],
    "consequence-zu-ni-wa-sumanai": [
        {
            "japanese": "謝らずにはすまない。",
            "english": "I cannot avoid apologizing.",
            "note": "Duty or consequence cannot be avoided."
        }
    ],
    "prohibition-bekarazu": [
        {
            "japanese": "ここに入るべからず。",
            "english": "Do not enter here.",
            "note": "Literary/formal prohibition."
        }
    ],
    "improper-majiki": [
        {
            "japanese": "教師にあるまじき行為だ。",
            "english": "That is behavior unbecoming of a teacher.",
            "note": "Formal judgment of impropriety."
        }
    ],
    "role-taru-mono": [
        {
            "japanese": "リーダーたるもの責任を持つべきだ。",
            "english": "A leader should take responsibility.",
            "note": "Formal role-based expectation."
        }
    ],
    "surprise-tomo-arou-mono-ga": [
        {
            "japanese": "医者ともあろうものが不注意だった。",
            "english": "A doctor, of all people, was careless.",
            "note": "Critical surprise."
        }
    ],
    "stage-tomo-naru-to": [
        {
            "japanese": "大人ともなると責任が増える。",
            "english": "Once you become an adult, responsibilities increase.",
            "note": "Marks a stage or status."
        }
    ],
    "any-de-are": [
        {
            "japanese": "理由が何であれ、許されない。",
            "english": "Whatever the reason, it is not allowed.",
            "note": "Often pairs with repeated alternatives."
        }
    ],
    "pair-to-ii-to-ii": [
        {
            "japanese": "デザインといい性能といい素晴らしい。",
            "english": "Both the design and performance are excellent.",
            "note": "Usually repeats といい."
        }
    ],
    "concession-to-wa-ie": [
        {
            "japanese": "春とはいえ、まだ寒い。",
            "english": "Although it is spring, it is still cold.",
            "note": "Formal concession."
        }
    ],
    "without-nakushite": [
        {
            "japanese": "努力なくして成功はない。",
            "english": "There is no success without effort.",
            "note": "Formal without-condition."
        }
    ],
    "basis-atte-no": [
        {
            "japanese": "皆さんの協力あっての成功です。",
            "english": "This success is thanks to everyone's cooperation.",
            "note": "AあってのB = B exists because of A."
        }
    ],
    "unique-nara-dewa": [
        {
            "japanese": "京都ならではの雰囲気。",
            "english": "An atmosphere unique to Kyoto.",
            "note": "Often positive uniqueness."
        }
    ],
    "covered-mamire": [
        {
            "japanese": "泥まみれになった。",
            "english": "I got covered in mud.",
            "note": "Often negative physical covering."
        }
    ],
    "full-zukume": [
        {
            "japanese": "今日はいいことずくめだった。",
            "english": "Today was full of good things.",
            "note": "ずくめ means entirely filled with."
        }
    ],
    "depending-ikan": [
        {
            "japanese": "結果いかんで判断します。",
            "english": "We will decide depending on the result.",
            "note": "いかん is formal and noun-based."
        }
    ],
    "result-shimatsu-da": [
        {
            "japanese": "最後には怒り出す始末だ。",
            "english": "In the end, he even got angry.",
            "note": "Often negative outcome."
        }
    ],
    "rhetorical-denakute-nandarou": [
        {
            "japanese": "これが愛でなくてなんだろう。",
            "english": "What could this be if not love?",
            "note": "Rhetorical affirmation."
        }
    ],
    "extreme-to-ittara-nai": [
        {
            "japanese": "うれしいといったらない。",
            "english": "I was indescribably happy.",
            "note": "Casual/emphatic extreme degree."
        }
    ],
    "extreme-tara-aryashinai": [
        {
            "japanese": "面倒くさいったらありゃしない。",
            "english": "It is unbelievably troublesome.",
            "note": "Often colloquial."
        }
    ],
    "best-ni-koshita-koto-wa-nai": [
        {
            "japanese": "早いに越したことはない。",
            "english": "The earlier, the better.",
            "note": "に越したことはない recommends ideal condition."
        }
    ],
    "excess-ni-mo-hodo-ga-aru": [
        {
            "japanese": "冗談にもほどがある。",
            "english": "There is a limit to joking.",
            "note": "Used for criticism."
        }
    ],
    "emphatic-no-nanno": [
        {
            "japanese": "忙しいのなんの。",
            "english": "I was incredibly busy.",
            "note": "Colloquial intensity."
        }
    ],
    "minimal-tari-tomo": [
        {
            "japanese": "一秒たりとも無駄にしない。",
            "english": "I will not waste even one second.",
            "note": "Strong minimal emphasis."
        }
    ],
    "minimal-dani": [
        {
            "japanese": "想像だにしなかった。",
            "english": "I had not even imagined it.",
            "note": "Literary and limited use."
        }
    ],
    "minimal-sura": [
        {
            "japanese": "彼は名前すら書けない。",
            "english": "He cannot even write his name.",
            "note": "すら is similar to さえ but formal/literary."
        }
    ],
    "comparison-gotoki": [
        {
            "japanese": "私ごときには無理です。",
            "english": "It is impossible for someone like me.",
            "note": "Often humble or dismissive."
        }
    ],
    "suffix-meku": [
        {
            "japanese": "春めいてきました。",
            "english": "It has started to feel like spring.",
            "note": "Often seasonal or atmospheric."
        }
    ],
    "unnecessary-made-mo-nai": [
        {
            "japanese": "言うまでもない。",
            "english": "It goes without saying.",
            "note": "までもない removes need."
        }
    ],
    "unnecessary-ni-wa-oyobanai": [
        {
            "japanese": "心配するには及びません。",
            "english": "There is no need to worry.",
            "note": "Formal expression."
        }
    ],
    "situation-tokoro-wo": [
        {
            "japanese": "お忙しいところをありがとうございます。",
            "english": "Thank you despite being busy.",
            "note": "Common polite set pattern."
        }
    ],
};

export function listLocalGrammarRuleExamples(): LocalGrammarRuleExample[] {
    return YOMU_GRAMMAR_REGISTRY.flatMap(rule => (GRAMMAR_RULE_EXAMPLES[rule.ruleId] ?? []).map(example => ({
        ruleId: rule.ruleId,
        name: rule.name,
        level: rule.level,
        example,
    })));
}

export function listLocalGrammarRules(): LocalGrammarRuleSummary[] {
    return YOMU_GRAMMAR_REGISTRY.map(rule => ({
        ruleId: rule.ruleId,
        name: rule.name,
        level: rule.level,
        exampleCount: (GRAMMAR_RULE_EXAMPLES[rule.ruleId] ?? []).length,
    }));
}
