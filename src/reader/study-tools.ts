import { escapeHtml } from './dom';
import { grammarRuleText, uiText, type UiCopyKey } from './i18n';
import { Logger } from './logger';
import { requestJson as requestReaderJson } from './reader-http';
import type { InterfaceLanguage } from './types';

const log = Logger.scope('StudyTools');

export interface GrammarHint {
    ruleId: string;
    name: string;
    level: GrammarLevel;
    kind: string;
    short: string;
    detail: string;
    url: string;
    match: string;
    confidence: 'high' | 'medium';
    index: number;
    examples?: GrammarExample[];
}

export interface GrammarExample {
    japanese: string;
    english: string;
    note?: string;
}

export type GrammarLevel = 'Core' | 'N5' | 'N4' | 'N3' | 'N2' | 'N1';

interface GrammarPattern {
    ruleId: string;
    level: GrammarLevel;
    pattern: RegExp;
    name: string;
    kind: string;
    short: string;
    detail: string;
    url: string;
    confidence: GrammarHint['confidence'];
    priority: number;
    examples: GrammarExample[];
}

type RankedGrammarHint = GrammarHint & { priority: number };

interface GroupedGrammarHint {
    hint: GrammarHint;
    count: number;
}

export interface GrammarPreferences {
    knownRuleIds: string[];
    showKnown: boolean;
}

export interface LocalGrammarRuleExample {
    ruleId: string;
    name: string;
    level: GrammarLevel;
    example: GrammarExample;
}

const PARTICLE_CHUNK = String.raw`[^はがをにへとでもやのて、。！？!?\s]{1,24}`;
const FORM_CHUNK = String.raw`[^はがをにへとでもやのてで、。！？!?\s]{0,24}`;
const GRAMMAR_PREFERENCES_KEY = 'yomu.grammarPreferences.v1';
const MAX_LOCAL_GRAMMAR_HINTS = 12;
const GRAMMAR_HINT_CACHE_LIMIT = 240;
const TRANSLATION_CACHE_LIMIT = 160;
const TRANSLATION_TIMEOUT_MS = 5000;
const ENGLISH_TEXT_RE = /[A-Za-z]{3,}/u;
const JAPANESE_TEXT_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;

function gp(
    ruleId: string,
    level: GrammarLevel,
    name: string,
    source: string,
    kind: string,
    short: string,
    detail: string,
    url: string,
    examples: GrammarExample[],
    confidence: GrammarHint['confidence'] = 'medium',
    priority = 30,
): GrammarPattern {
    return { ruleId, level, pattern: new RegExp(source, 'gu'), name, kind, short, detail, url, confidence, priority, examples };
}

function ex(japanese: string, english: string, note?: string): GrammarExample[] {
    return note ? [{ japanese, english, note }] : [{ japanese, english }];
}

const GRAMMAR_PATTERNS: GrammarPattern[] = [
    gp("potential-koto-ga-dekiru", "N4", "ことができる", `${FORM_CHUNK}ことができ(?:る|ます|ない|ません|た|ました|なかった|ませんでした)?`, "Potential expression", "can do something", "Turns the action before こと into an ability or possibility: \"can do...\"", "https://www.tofugu.com/japanese-grammar/koto-ga-dekiru/", ex("日本語を話すことができます。", "I can speak Japanese.", "Verb + ことができる marks ability."), "high", 5),
    gp("obligation-nakereba-naranai", "N4", "なければならない", `${FORM_CHUNK}(?:なければならない|なければなりません|なくてはならない|なくてはなりません|なくてはいけない|なくてはいけません|なければいけない|なければいけません|なきゃ(?:いけない|だめ)?|なくちゃ(?:いけない|だめ)?|ないといけない|ねばならない)`, "Obligation", "must or have to do", "Says an action is necessary or required. Casual forms like なきゃ and なくちゃ carry the same basic idea.", "https://www.tofugu.com/japanese-grammar/nakereba-naranai/", ex("明日までに払わなければならない。", "I have to pay by tomorrow.", "The first clause is required."), "high", 4),
    gp("permission-not-required-nakutemo-ii", "N5", "なくてもいい", `${FORM_CHUNK}なくても(?:いい|よい|大丈夫)(?:です)?`, "Permission / no obligation", "do not have to", "Says the action is not required, or that not doing it is okay.", "", ex("今日は来なくてもいいです。", "You do not have to come today.", "Negative て-form + もいい removes obligation."), "high", 4),
    gp("prohibition-tewa-ikenai", "N4", "てはいけない", `${FORM_CHUNK}(?:(?:[てで]は|ちゃ|じゃ)いけ(?:ない|ません|なかった|ませんでした)|(?:[てで]は|ちゃ|じゃ)だめ(?:だ|です)?)`, "Prohibition", "must not do", "Marks an action as not allowed or unacceptable. Casual ちゃだめ and じゃだめ are included.", "https://www.tofugu.com/japanese-grammar/tewa-ikenai/", ex("ここで写真を撮ってはいけません。", "You must not take photos here.", "てはいけない is a direct prohibition."), "high", 5),
    gp("permission-temo-ii", "N5", "てもいい", `${FORM_CHUNK}[てで]も(?:いい|よい|よかった|よくない|よくありません)(?:です)?`, "Permission", "permission or approval", "Means it is okay to do the action before てもいい. Negative variants can ask or say whether it is not okay.", "https://www.tofugu.com/japanese-grammar/temoii/", ex("水を飲んでもいいです。", "It is okay to drink water.", "て-form + もいい grants permission."), "high", 5),
    gp("request-te-kudasai", "N5", "てください", `${FORM_CHUNK}[てで]ください(?:ませんか)?`, "Request", "please do", "Makes a direct but polite request. くださいませんか is softer.", "", ex("ゆっくり話してください。", "Please speak slowly.", "て-form + ください requests an action."), "high", 6),
    gp("polite-request-te-itadakemasen-ka", "N4", "ていただけませんか", `${FORM_CHUNK}[てで](?:いただけませんか|くださいませんか)`, "Polite request", "could you please do", "A softer request that asks someone to do something for you politely.", "", ex("もう一度説明していただけませんか。", "Could you please explain it one more time?", "ていただけませんか is a polite request form."), "high", 6),
    gp("request-naide-kudasai", "N5", "ないでください", `${FORM_CHUNK}ないでください`, "Negative request", "please do not do", "Politely asks someone not to do an action.", "", ex("ここで走らないでください。", "Please do not run here.", "ないでください is the negative request form."), "high", 5),
    gp("advice-hou-ga-ii", "N4", "方がいい", `${FORM_CHUNK}ほうが(?:いい|よい)(?:です)?`, "Advice", "better to do", "Gives advice or says one option is better.", "", ex("早く寝たほうがいいです。", "It is better to go to bed early.", "Often follows past tense for advice."), "high", 6),
    gp("command-nasai", "N4", "なさい", `${FORM_CHUNK}なさい`, "Command", "do this", "A command form often used by adults toward children or in instructions.", "", ex("宿題をしなさい。", "Do your homework.", "Stem + なさい gives an instruction."), "high", 6),
    gp("experience-ta-koto-ga-aru", "N4", "たことがある", `${FORM_CHUNK}たことが(?:あ(?:る|ります|った|りました|りません|りませんでした)|ない|なかった|ありません|ありませんでした)`, "Experience", "has done before", "Uses a past verb plus ことがある to talk about having had an experience.", "https://www.tofugu.com/japanese-grammar/ta-koto-ga-aru/", ex("京都に行ったことがあります。", "I have been to Kyoto.", "Past verb + ことがある marks experience."), "high", 6),
    gp("completion-te-shimau", "N4", "てしまう", `(?:${FORM_CHUNK}[てで]しま(?:う|います|った|いました|わない|いません)|${FORM_CHUNK}(?:ちゃう|ちゃいます|ちゃった|ちゃいました|じゃう|じゃいます|じゃった|じゃいました))`, "Completion / regret", "do completely or unfortunately", "Can show that an action is completed, often with a feeling of regret, surprise, or accident.", "https://www.tofugu.com/japanese-grammar/te-shimau/", ex("財布を忘れてしまいました。", "I unfortunately forgot my wallet.", "てしまう can add regret or completion."), "high", 6),
    gp("attempt-te-miru", "N4", "てみる", `${FORM_CHUNK}[てで]み(?:る|ます|た|ました|たい|ない|ません)`, "Attempt", "try doing", "Means to try an action and see what happens.", "https://www.tofugu.com/japanese-grammar/te-miru/", ex("新しい店で食べてみます。", "I will try eating at the new shop.", "て-form + みる is experimental trying."), "high", 6),
    gp("preparation-te-oku", "N4", "ておく", `(?:${FORM_CHUNK}[てで]お(?:く|きます|いた|きました|かない|きません)|${FORM_CHUNK}(?:とく|ときます|といた|ときました|どく|どきます|どいた|どきました))`, "Preparation", "do in advance or leave as is", "Often marks an action done ahead of time, or a state intentionally left alone. Casual とく and どく are included.", "https://www.tofugu.com/japanese-grammar/teoku/", ex("旅行の前に予約しておきます。", "I will make a reservation before the trip.", "ておく prepares for later."), "high", 6),
    gp("desire-other-te-hoshii", "N4", "てほしい", `${FORM_CHUNK}[てで]ほしい`, "Desire / request", "want someone to do", "Says the speaker wants someone else to do the action.", "", ex("もう少し待ってほしいです。", "I want you to wait a little longer.", "てほしい points desire at someone else's action."), "high", 7),
    gp("benefactive-te-kureru-morau", "N4", "てくれる / てもらう", `${FORM_CHUNK}[てで](?:くれ(?:る|ます|た|ました|ない|ません)|くださ(?:る|います|った|いました)|あげ(?:る|ます|た|ました)|や(?:る|ります|った|りました)|もら(?:う|います|った|いました)|いただ(?:く|きます|いた|きました))`, "Giving and receiving", "favor done for someone", "Combines て-form with giving or receiving verbs to show who benefits from an action.", "https://www.tofugu.com/japanese-grammar/te-kureru/", ex("先生が説明してくださいました。", "The teacher kindly explained it.", "The helper verb shows benefit and direction."), "medium", 8),
    gp("change-you-ni-naru", "N4", "ようになる", `${FORM_CHUNK}ようにな(?:る|ります|った|りました|らない|りません)`, "Change over time", "come to do or become so that", "Shows a new ability, habit, or state developing over time.", "https://www.tofugu.com/japanese-grammar/you-ni-naru/", ex("漢字が読めるようになりました。", "I became able to read kanji.", "Often describes gradual change."), "high", 8),
    gp("habit-you-ni-suru", "N4", "ようにする", `${FORM_CHUNK}ように(?:す(?:る|ます|た|ました)|し(?:ている|ています|た|ました))`, "Effort / habit", "make sure to do", "Shows an intentional effort to make an action happen regularly or reliably.", "https://www.tofugu.com/japanese-grammar/you-ni-suru/", ex("毎日復習するようにしています。", "I try to review every day.", "ようにする describes deliberate effort."), "high", 8),
    gp("voice-causative-passive", "N3", "させられる", `${FORM_CHUNK}(?:させられ(?:る|ます|た|ました)|[かがさざただなばまらわ]せられ(?:る|ます|た|ました)|[かがさざただなばまらわ]され(?:る|ます|た|ました))`, "Causative-passive", "be made to do", "Combines causative and passive meaning: someone is made to do an action, often unwillingly.", "https://www.tofugu.com/japanese-grammar/verb-causative-form-saseru/", ex("子どものころ、野菜を食べさせられました。", "When I was a child, I was made to eat vegetables.", "Regex can only flag the form; context decides the exact verb."), "medium", 8),
    gp("voice-causative", "N4", "させる", `${FORM_CHUNK}(?:させ(?:る|ます|た|ました)|[かがさざただなばまらわ]せ(?:る|ます|た|ました))`, "Causative", "make or let someone do", "Adds a causer: someone makes, lets, or has someone else do the action.", "https://www.tofugu.com/japanese-grammar/verb-causative-form-saseru/", ex("母は子どもを遊ばせた。", "The mother let the child play.", "Causative can mean make or let."), "medium", 9),
    gp("voice-passive-potential", "N4", "れる / られる", `${FORM_CHUNK}(?:られる|られます|[かがさざただなばまわ]れる|[かがさざただなばまわ]れます)`, "Passive / potential", "passive, potential, or honorific form", "This ending can mark passive voice, ability, or respectful speech; context decides which reading fits.", "https://www.tofugu.com/japanese-grammar/verb-passive-form-rareru/", ex("この漢字はよく見られます。", "This kanji is often seen.", "Surface regex cannot fully disambiguate passive, potential, and honorific."), "medium", 9),
    gp("evidence-rashii-mitai", "N4", "らしい / みたい", `(?:${FORM_CHUNK}らしい|${FORM_CHUNK}みたい(?:だ|です|に|な))`, "Hearsay / likeness", "seems like or apparently", "Expresses appearance, hearsay, tendency, or resemblance depending on the form and context.", "https://www.tofugu.com/japanese-grammar/rashii/", ex("明日は雨らしいです。", "Apparently it will rain tomorrow.", "らしい often reports what one has heard."), "medium", 9),
    gp("modality-kamoshirenai", "N4", "かもしれない", "(?:かもしれない|かもしれません|かも)", "Possibility", "might or maybe", "Softens a statement into a possibility rather than a firm claim.", "https://www.tofugu.com/japanese-grammar/kamoshirenai/", ex("彼は来ないかもしれません。", "He might not come.", "かも is a casual short form."), "high", 9),
    gp("modality-deshou-darou", "N5", "でしょう / だろう", "(?:でしょう|でしょうか|だろう|だろうか)", "Probability", "probably or right?", "Adds probability, expectation, or a confirmation-seeking tone.", "https://www.tofugu.com/japanese-grammar/deshou/", ex("明日は晴れるでしょう。", "It will probably be sunny tomorrow.", "でしょう is polite; だろう is plainer."), "high", 10),
    gp("quotation-to-omou", "N4", "と思う", `${FORM_CHUNK}と思(?:う|います|った|いました|っている|っています)`, "Quotation / thought", "think that...", "Marks the content of a thought or statement before 思う.", "https://www.tofugu.com/japanese-grammar/to-omou/", ex("これは便利だと思います。", "I think this is convenient.", "The phrase before と is the thought content."), "high", 10),
    gp("attempt-you-to-suru", "N3", "ようとする", `${FORM_CHUNK}ようと(?:す(?:る|ます|た|ました|ている|ています)|し(?:た|ました|ている|ています))`, "Attempt / about to", "try to or be about to", "Uses the volitional form plus とする for an attempted action or something about to happen.", "https://www.tofugu.com/japanese-grammar/verb-volitional-form-you/", ex("出かけようとした時、電話が鳴った。", "Just as I was about to go out, the phone rang.", "Volitional + とする marks trying or being about to act."), "medium", 11),
    gp("plan-tsumori-yotei", "N4", "つもり / 予定", `${FORM_CHUNK}(?:つもり|予定)(?:だ|です|だった|でした)?`, "Plan / intention", "intend or plan to do", "つもり points to intention, while 予定 points to a plan or schedule.", "https://www.tofugu.com/japanese-grammar/tsumori/", ex("来年日本へ行くつもりです。", "I intend to go to Japan next year.", "つもり is intention; 予定 is a plan."), "medium", 12),
    gp("expectation-hazu", "N4", "はず", `${FORM_CHUNK}はず(?:だ|です|だった|でした|がない|はない)?`, "Expectation", "should be or expected to", "Marks a strong expectation based on what the speaker knows.", "https://www.tofugu.com/japanese-grammar/hazu/", ex("彼はもう着いたはずです。", "He should have arrived already.", "はず signals a reasoned expectation."), "high", 12),
    gp("reasoning-wake", "N3", "わけ", `${FORM_CHUNK}わけ(?:ではない|じゃない|がない|にはいかない|だ|です)?`, "Reasoning", "reason, conclusion, or not necessarily", "Points to a logical reason or conclusion, with negative forms often meaning not necessarily or cannot reasonably.", "https://www.tofugu.com/japanese-grammar/wake/", ex("高いわけではありません。", "It is not necessarily expensive.", "Specific わけ forms may be more precise if also detected."), "medium", 24),
    gp("reasoning-wake-dewa-nai", "N3", "わけではない", `${FORM_CHUNK}わけ(?:では|じゃ)(?:ない|ありません)`, "Qualification", "not necessarily", "Says a statement is not fully or necessarily true.", "", ex("嫌いなわけではない。", "It is not that I dislike it.", "Often softens or qualifies a previous implication."), "high", 11),
    gp("impossibility-wake-ga-nai", "N3", "わけがない", `${FORM_CHUNK}わけが(?:ない|ありません)`, "Impossibility", "there is no way", "Strongly denies possibility or reasonableness.", "", ex("彼が知らないわけがない。", "There is no way he does not know.", "わけがない rejects the possibility."), "high", 11),
    gp("constraint-wake-ni-wa-ikanai", "N3", "わけにはいかない", `${FORM_CHUNK}わけにはい(?:かない|きません)`, "Social constraint", "cannot reasonably do", "Says one cannot do something because of duty, social pressure, or circumstances.", "", ex("約束を破るわけにはいかない。", "I cannot break the promise.", "The barrier is often social or practical."), "high", 11),
    gp("purpose-tame-ni", "N4", "ために", `${FORM_CHUNK}ために`, "Purpose / benefit", "for the sake of or in order to", "Links an action or noun to a purpose, goal, or beneficiary.", "https://www.tofugu.com/japanese-grammar/tame-ni/", ex("家族のために働いています。", "I work for my family.", "ために marks purpose or benefit."), "high", 12),
    gp("purpose-you-ni", "N4", "ように", `${FORM_CHUNK}ように`, "Purpose / manner", "so that or in the way that", "Can mark a goal, desired result, or manner of doing something.", "https://www.tofugu.com/japanese-grammar/you-ni/", ex("忘れないようにメモします。", "I will write a note so I do not forget.", "This is broader than ようになる and ようにする."), "medium", 28),
    gp("timing-tokoro", "N4", "ところ", `${FORM_CHUNK}ところ(?:だ|です|だった|でした|で|に)?`, "Timing / situation", "point in time or situation", "Frames an action as about to happen, happening now, just happened, or as a situation.", "https://www.tofugu.com/japanese/tokoro-bakari/", ex("今、出かけるところです。", "I am just about to go out.", "ところ focuses on the moment or situation."), "medium", 14),
    gp("simultaneous-nagara", "N4", "ながら", `${FORM_CHUNK}ながら`, "Simultaneous action", "while doing", "Connects two actions done at the same time by the same subject.", "https://www.tofugu.com/japanese-grammar/nagara/", ex("音楽を聞きながら勉強します。", "I study while listening to music.", "ながら joins simultaneous actions."), "high", 14),
    gp("state-mama", "N3", "まま", `${FORM_CHUNK}まま`, "Unchanged state", "as is or while still", "Keeps a state unchanged while another action or situation continues.", "https://www.tofugu.com/japanese-grammar/mama/", ex("電気をつけたまま寝てしまった。", "I fell asleep with the light still on.", "まま preserves the previous state."), "medium", 15),
    gp("list-tari", "N5", "たり", `${FORM_CHUNK}たり`, "Representative list", "doing things like...", "Lists example actions without claiming the list is complete.", "https://www.tofugu.com/japanese-grammar/tari/", ex("週末は映画を見たり本を読んだりします。", "On weekends I do things like watch movies and read books.", "たり usually appears in pairs but can be single."), "medium", 16),
    gp("limitation-bakari", "N4", "ばかり", `${FORM_CHUNK}ばかり`, "Limitation / recent action", "only, just did, or nothing but", "Can mark a recent completed action or a sense of only or nothing but depending on context.", "https://www.tofugu.com/japanese/tokoro-bakari/", ex("彼はゲームばかりしています。", "He does nothing but play games.", "ばかり can also mean just did after past tense."), "medium", 16),
    gp("limitation-dake-shika", "N5", "だけ / しか", `${FORM_CHUNK}(?:だけ|しか)`, "Limitation", "only or nothing but", "だけ means only; しか usually pairs with a negative ending to mean nothing but.", "https://www.tofugu.com/japanese-grammar/dake/", ex("百円しかありません。", "I have only 100 yen.", "しか expects a negative predicate."), "medium", 18),
    gp("degree-hodo-kurai", "N4", "ほど / くらい", `${FORM_CHUNK}(?:ほど|くらい|ぐらい)`, "Degree / approximation", "extent or about", "Marks approximate amount or the degree to which something is true.", "https://www.tofugu.com/japanese-grammar/hodo/", ex("一時間ぐらい待ちました。", "I waited about an hour.", "ほど often emphasizes degree; くらい can be approximate."), "medium", 18),
    gp("role-toshite", "N3", "として", `${FORM_CHUNK}として`, "Role / standpoint", "as or in the role of", "Marks the role, capacity, or standpoint from which something is true.", "", ex("医者として働いています。", "I work as a doctor.", "として marks role or capacity."), "high", 18),
    gp("relation-ni-yotte", "N3", "によって", `${FORM_CHUNK}によって`, "Means / cause / by", "by, depending on, or because of", "Can mark means, agent in passive sentences, cause, or variation depending on context.", "", ex("国によって習慣が違います。", "Customs differ depending on the country.", "によって is highly context-dependent."), "medium", 18),
    gp("topic-ni-tsuite", "N3", "について", `${FORM_CHUNK}について`, "Topic", "about or concerning", "Marks the topic being discussed, considered, or investigated.", "", ex("日本の歴史について調べています。", "I am researching Japanese history.", "について is a topic marker."), "high", 18),
    gp("target-ni-taishite", "N3", "に対して", `${FORM_CHUNK}に対して`, "Target / contrast", "toward, against, or in contrast to", "Marks the target of an attitude or action, or sets up a contrast.", "", ex("子どもに対して優しい。", "She is kind toward children.", "に対して points at the target."), "medium", 18),
    gp("concession-ni-mo-kakawarazu", "N2", "にもかかわらず", `${FORM_CHUNK}にもかかわらず`, "Concession", "despite or even though", "Connects two facts when the second happens despite the first.", "", ex("雨にもかかわらず試合は行われた。", "The game was held despite the rain.", "Formal concessive connector."), "high", 18),
    gp("concession-kuse-ni", "N3", "くせに", `${FORM_CHUNK}くせに`, "Blame / contradiction", "even though, with criticism", "Marks a contradiction with a blaming or critical tone.", "", ex("知らないくせに文句を言う。", "He complains even though he does not know.", "くせに often sounds critical."), "medium", 18),
    gp("suffix-tachi", "N5", "たち / 達", `${PARTICLE_CHUNK}(?:たち|(?<!友)達)`, "Plural / group suffix", "marks a group or plural set", "Attaches to a person, pronoun, or animate noun to point to that person and their group, or to a plural group.", "", ex("私たちは学生です。", "We are students.", "Often used for people or animate groups."), "medium", 50),
    gp("particle-wa", "N5", "は", `${PARTICLE_CHUNK}は(?!ず)`, "Topic particle", "sets the topic or contrast", "Read it as as for and look to the rest of the sentence for the new information.", "https://www.tofugu.com/japanese-grammar/particle-wa/", ex("私は学生です。", "I am a student.", "は marks the topic, not always the grammatical subject."), "high", 55),
    gp("particle-ga", "N5", "が", `${PARTICLE_CHUNK}が`, "Subject particle", "marks the doer or focus", "Highlights the subject of the clause, often when that subject is new or important.", "https://www.tofugu.com/japanese-grammar/particle-ga/", ex("猫がいます。", "There is a cat.", "が often introduces or focuses a subject."), "high", 55),
    gp("particle-wo", "N5", "を", `${PARTICLE_CHUNK}を`, "Object particle", "marks what receives the action", "The phrase before を is usually what the following verb acts on.", "https://www.tofugu.com/japanese-grammar/particle-wo/", ex("水を飲みます。", "I drink water.", "を marks the direct object."), "high", 55),
    gp("particle-de", "N5", "で", `${PARTICLE_CHUNK}(?<![まん])で(?!き|す|し)`, "Context particle", "marks where or how an action happens", "Often points to the setting, tool, method, or conditions for the action.", "https://www.tofugu.com/japanese-grammar/particle-de/", ex("駅で待ちます。", "I will wait at the station.", "で marks place, means, cause, or context."), "medium", 55),
    gp("particle-ni", "N5", "に", `${PARTICLE_CHUNK}に(?!なる)`, "Target particle", "marks a target, point, time, or adverbial role", "Think of に as pinning the action to a destination, time, target, or manner.", "https://www.tofugu.com/japanese-grammar/particle-ni/", ex("駅に行きます。", "I go to the station.", "に anchors time, target, or direction."), "medium", 55),
    gp("particle-e", "N5", "へ", `${PARTICLE_CHUNK}へ`, "Direction particle", "toward or to", "Marks the direction or destination of movement.", "", ex("学校へ行きます。", "I go to school.", "へ emphasizes direction more than arrival."), "medium", 55),
    gp("particle-to", "N5", "と", `${PARTICLE_CHUNK}(?<![っッこコ])と(?!して|いう|思)`, "Quote / partner particle", "marks with, and, or quoted content", "Can mark who someone does something with, exact quoted content, comparison, or a complete list.", "https://www.tofugu.com/japanese-grammar/particle-to/", ex("友だちと話します。", "I talk with my friend.", "と has several basic particle uses."), "medium", 55),
    gp("particle-no", "N5", "の", `${PARTICLE_CHUNK}の`, "Noun linker", "connects or labels nouns", "The phrase before の modifies or belongs with the noun that follows.", "https://www.tofugu.com/japanese-grammar/particle-no-noun-modifier/", ex("私の本です。", "It is my book.", "の links nouns or nominalizes phrases."), "medium", 55),
    gp("particle-mo", "N5", "も", `${PARTICLE_CHUNK}も`, "Inclusion particle", "also or too", "Adds the marked item to a set, or emphasizes extent with quantities.", "", ex("私も行きます。", "I will go too.", "も adds another item to the conversation."), "medium", 55),
    gp("particle-ya", "N5", "や", `${PARTICLE_CHUNK}や`, "Open list particle", "and things like", "Lists examples without implying the list is complete.", "", ex("パンや卵を買いました。", "I bought bread, eggs, and things like that.", "や creates a non-exhaustive list."), "medium", 55),
    gp("aspect-te-iru", "N5", "ている", `${FORM_CHUNK}[てで](?:いる|います|いた|いました|いない|いません|いなかった|いませんでした|る|た)`, "Verb form", "ongoing action or resulting state", "Shows an action in progress, or a state that remains after something changed.", "https://www.tofugu.com/japanese-grammar/verb-continuous-form-teiru/", ex("今、本を読んでいます。", "I am reading a book now.", "ている can be progressive or resultative."), "high", 40),
    gp("aspect-te-aru", "N4", "てある", `${FORM_CHUNK}[てで]あ(?:る|ります|った|りました)`, "Resulting state", "has been done and remains", "Shows a result intentionally left in place after an action.", "", ex("窓が開けてあります。", "The window has been opened and left that way.", "てある suggests an intentional prepared state."), "high", 12),
    gp("aspect-te-kuru", "N4", "てくる", `${FORM_CHUNK}[てで](?:くる|きます|きた|きました)`, "Movement / development", "come to do or develop toward now", "Shows movement toward the speaker or a change developing up to now.", "", ex("雨が降ってきました。", "It has started raining.", "てくる can be physical or temporal."), "medium", 20),
    gp("aspect-te-iku", "N4", "ていく", `${FORM_CHUNK}[てで]い(?:く|きます|った|きました)`, "Movement / development", "go on doing or develop away", "Shows movement away from the speaker or a change continuing into the future.", "", ex("これからも勉強していきます。", "I will keep studying from now on.", "ていく often looks forward or outward."), "medium", 20),
    gp("desire-tai", "N5", "たい", `${FORM_CHUNK}(?:たい(?:です)?|たく(?:ない|ありません|なかった|ありませんでした)|たかった(?:です)?)`, "Verb ending", "want to do something", "Attaches to a verb stem to say the speaker wants to do that action.", "https://www.tofugu.com/japanese-grammar/tai-form/", ex("日本へ行きたいです。", "I want to go to Japan.", "たい describes the speaker's desire."), "high", 44),
    gp("ease-yasui-nikui", "N4", "やすい / にくい", `${FORM_CHUNK}(?:やすい|にくい|づらい)`, "Ease / difficulty", "easy or hard to do", "Shows that an action is easy, difficult, or psychologically hard to do.", "", ex("この本は読みやすいです。", "This book is easy to read.", "Stem + やすい or にくい describes ease."), "high", 22),
    gp("excess-sugiru", "N4", "すぎる", `${FORM_CHUNK}すぎ(?:る|ます|た|ました|ない)`, "Excess", "too much", "Shows that something goes beyond a suitable amount or degree.", "", ex("食べすぎました。", "I ate too much.", "Stem/adjective + すぎる marks excess."), "high", 22),
    gp("method-kata", "N5", "方", `${FORM_CHUNK}方`, "Method", "way of doing", "Attaches to a verb stem to mean the way to do that action.", "", ex("使い方を教えてください。", "Please teach me how to use it.", "Stem + 方 creates a method noun."), "medium", 48),
    gp("negative-nai", "N5", "ない", `${FORM_CHUNK}(?:ない|ません|なかった|ませんでした)`, "Verb ending", "negative form", "Turns the verb or expression into do not, is not, or did not.", "https://www.tofugu.com/japanese-grammar/verb-negative-nai-form/", ex("今日は行きません。", "I will not go today.", "ない and ません are negative endings."), "medium", 46),
    gp("polite-past-mashita", "N5", "ました", `${FORM_CHUNK}ました`, "Polite past", "polite completed action", "A polite ます-form verb in the past tense: did or was/were.", "https://www.tofugu.com/japanese-grammar/masu/", ex("昨日、勉強しました。", "I studied yesterday.", "ました is polite past."), "high", 44),
    gp("polite-masu", "N5", "ます", `${FORM_CHUNK}ます`, "Polite form", "polite non-past verb", "Softens the verb into polite speech; tense depends on the surrounding sentence.", "https://www.tofugu.com/japanese-grammar/masu/", ex("毎日勉強します。", "I study every day.", "ます is polite non-past."), "medium", 45),
    gp("conditional-tara", "N4", "たら", `${FORM_CHUNK}たら`, "Clause linker", "conditional or time sequence", "Turns the first clause into the condition or timing for what follows: if, when, or after.", "https://www.tofugu.com/japanese-grammar/conditional-form-tara/", ex("雨が降ったら、行きません。", "If it rains, I will not go.", "たら can mean if, when, or after."), "high", 17),
    gp("conditional-ba", "N4", "ば", `${FORM_CHUNK}(?:えば|ければ)`, "Conditional", "conditional if", "Marks the condition that needs to be true for the next clause to happen.", "https://www.tofugu.com/japanese-grammar/verb-conditional-form-ba/", ex("安ければ買います。", "If it is cheap, I will buy it.", "ば creates a conditional clause."), "high", 18),
    gp("conditional-ba-ii", "N4", "ばいい / ばよかった", `${FORM_CHUNK}(?:えば|ければ|[えけげせてねべめれ]ば)(?:いい|よい|よかった)(?:です)?`, "Advice / regret", "should do or should have done", "Can give advice, ask what to do, or express regret about what should have happened.", "", ex("もっと早く聞けばよかった。", "I should have asked earlier.", "ばよかった often expresses regret."), "medium", 13),
    gp("reason-node", "N4", "ので", "(?:なので|ので)", "Clause linker", "reason or cause", "Gives the reason or cause for the following statement, usually with a softer tone than から.", "https://www.tofugu.com/japanese-grammar/conjunctive-particle-node/", ex("電車が遅れたので、遅刻しました。", "The train was late, so I was late.", "ので is often softer than から."), "high", 22),
    gp("reason-kara", "N5", "から", `${FORM_CHUNK}から`, "Particle / linker", "reason, source, or starting point", "Can mean because, from, or after, depending on what surrounds it.", "https://www.tofugu.com/japanese-grammar/particle-kara/", ex("寒いから、上着を着ます。", "It is cold, so I will wear a jacket.", "から is broad and context-dependent."), "medium", 35),
    gp("appearance-sou", "N4", "そう", `${FORM_CHUNK}そう(?:に|な)?`, "Appearance / hearsay", "looks like or I heard", "Describes how something seems from appearance, or reports hearsay when attached to a full clause.", "https://www.tofugu.com/japanese-grammar/verb-sou/", ex("このケーキはおいしそうです。", "This cake looks delicious.", "そう is ambiguous; context decides appearance or hearsay."), "medium", 30),
    gp("hearsay-sou-da", "N4", "そうだ", `${FORM_CHUNK}そう(?:だ|です)`, "Hearsay", "I hear that", "Reports information heard from another source.", "", ex("ニュースによると、雪が降るそうです。", "According to the news, it will snow.", "This overlaps with appearance そう, so context matters."), "medium", 19),
    gp("volitional-you", "N5", "よう", `${FORM_CHUNK}(?:よう|ろう)`, "Volitional", "volition, proposal, or invitation", "Often expresses let us, I will, or a suggestion to do something together.", "https://www.tofugu.com/japanese-grammar/verb-volitional-form-you/", ex("一緒に帰ろう。", "Let us go home together.", "Volitional forms can be proposals or intentions."), "medium", 45),
    gp("concession-noni", "N4", "のに", "のに", "Clause linker", "although, despite, or frustrated expectation", "Connects two ideas when the second one is surprising or disappointing given the first.", "https://www.tofugu.com/japanese-grammar/conjunctive-particle-noni/", ex("勉強したのに、忘れました。", "Even though I studied, I forgot.", "のに often carries disappointment."), "high", 20),
    gp("nominalizer-koto", "N5", "こと", "こと(?:が|を|に|は|も)", "Nominalizer", "abstract thing or nominalizer", "Turns an action or idea into a noun-like concept that particles can attach to.", "https://www.tofugu.com/japanese-grammar/koto/", ex("泳ぐことが好きです。", "I like swimming.", "こと nominalizes actions or ideas."), "medium", 42),
    gp("plain-past-ta", "N5", "た", `(?:${FORM_CHUNK}(?:かった|だった|った|いた|いだ|(?<!で)した|んだ|[きぎしじちにびみりえけげせてねべめれ]た|[来見寝出]た)|(?<!で)した)(?![いらり])`, "Plain past", "plain completed action or past state", "Marks a plain past-tense action or state. Common verb endings include した, った, いた, いだ, and んだ.", "", ex("昨日、映画を見た。", "I watched a movie yesterday.", "This is a broad detector for past forms."), "medium", 47),
    gp("sequence-te-kara", "N5", "てから", `${FORM_CHUNK}[てで]から`, "Sequence", "after doing", "Says one action happens after another action is completed.", "", ex("手を洗ってから食べます。", "I eat after washing my hands.", "てから emphasizes the first action is completed first."), "high", 13),
    gp("time-mae-ni", "N5", "前に", `${FORM_CHUNK}前に`, "Time relation", "before doing", "Marks an action or event that happens before another.", "", ex("寝る前に歯を磨きます。", "I brush my teeth before sleeping.", "Dictionary form + 前に means before doing."), "medium", 22),
    gp("time-ato-de-ni", "N5", "後で / 後に", `${FORM_CHUNK}後(?:で|に)`, "Time relation", "after doing", "Marks an action or event that happens after another.", "", ex("仕事の後で会いましょう。", "Let us meet after work.", "後で is common for after."), "medium", 22),
    gp("time-toki", "N5", "とき", `${FORM_CHUNK}(?:とき|時)`, "Time relation", "when", "Marks the time or occasion when something happens.", "", ex("困ったとき、友だちに相談します。", "When I am in trouble, I consult a friend.", "とき marks the time of a situation."), "medium", 22),
    gp("limit-made-made-ni", "N5", "まで / までに", `${FORM_CHUNK}まで(?:に)?`, "Limit", "until or by", "まで marks an endpoint; までに marks a deadline.", "", ex("五時までに帰ります。", "I will return by five.", "までに means by a deadline."), "medium", 28),
    gp("comparison-yori-nohou", "N5", "より / の方が", `${FORM_CHUNK}(?:より|のほうが|の方が)`, "Comparison", "than or more than", "Compares two things; より marks the thing being compared against, while の方が marks the preferred or greater side.", "", ex("犬より猫の方が好きです。", "I like cats more than dogs.", "Comparison often uses both より and 方が."), "medium", 30),
    gp("superlative-ichiban", "N5", "一番", "一番", "Superlative", "the most", "Marks the highest degree among a group.", "", ex("寿司が一番好きです。", "I like sushi the most.", "一番 marks the top choice or degree."), "high", 22),
    gp("question-ka-douka", "N4", "かどうか", `${FORM_CHUNK}かどうか`, "Embedded question", "whether or not", "Embeds a yes-or-no question inside a larger sentence.", "", ex("行くかどうかまだ決めていません。", "I have not decided whether I will go.", "かどうか embeds uncertainty."), "high", 13),
    gp("quotation-to-iu", "N4", "という", `${FORM_CHUNK}という`, "Quotation / naming", "called or saying that", "Marks a name, definition, quote, or explanation.", "", ex("田中さんという人に会いました。", "I met a person called Tanaka.", "という connects quoted, named, or defined content."), "medium", 14),
    gp("casual-tte", "N4", "って", `${FORM_CHUNK}って(?=(?:言|聞|思|呼|書|いう|こと|、|。|？|!|！|$))`, "Casual quote / topic", "casual quote or topic marker", "Casual marker for quoting, naming, or setting a topic.", "", ex("明日来るって聞きました。", "I heard that he is coming tomorrow.", "って is casual and broad."), "medium", 24),
    gp("explanation-n-desu", "N5", "んです / のです", `${FORM_CHUNK}(?:ん|の)です`, "Explanation", "explanatory tone", "Adds an explanatory or context-seeking tone.", "", ex("頭が痛いんです。", "The thing is, my head hurts.", "んです often explains or asks for explanation."), "medium", 22),
    gp("permission-sasete-kudasai", "N4", "させてください", `${FORM_CHUNK}させてください`, "Permission request", "please let me do", "Asks permission to do something.", "", ex("少し考えさせてください。", "Please let me think for a bit.", "Causative て-form + ください asks to be allowed."), "high", 5),
    gp("decision-koto-ni-suru", "N4", "ことにする", `${FORM_CHUNK}ことに(?:す(?:る|ます|た|ました|ている|ています)|し(?:ます|た|ました|ている|ています))`, "Decision", "decide to do", "Shows that someone decides on an action or policy.", "", ex("毎朝走ることにしました。", "I decided to run every morning.", "ことにする marks personal decision."), "high", 9),
    gp("arrangement-koto-ni-naru", "N4", "ことになる", `${FORM_CHUNK}ことにな(?:る|ります|った|りました|っている|っています)`, "Decision / arrangement", "it has been decided", "Shows an arrangement or outcome decided by circumstances or others.", "", ex("来月転勤することになりました。", "It has been decided that I will transfer next month.", "Often implies an external decision."), "high", 9),
    gp("honorific-o-go-ni-naru-suru", "N3", "お〜になる / お〜する", `(?:お|ご)${FORM_CHUNK}(?:になる|になります|する|します|いたす|いたします|ください)`, "Honorific / humble", "respectful or humble set phrase", "Uses お or ご with a verb noun or stem for respectful or humble speech.", "", ex("社長がお帰りになります。", "The president will return.", "Regex can flag the construction, but politeness role depends on the verb."), "medium", 18),
    gp("polite-gozaimasu", "N5", "ございます", `${FORM_CHUNK}ございます`, "Polite speech", "polite equivalent of ある", "A very polite form related to ある or です in set expressions.", "", ex("質問がございます。", "I have a question.", "ございます is very polite."), "medium", 30),
    gp("advice-beki", "N3", "べき", `${FORM_CHUNK}べき(?:だ|です|ではない|じゃない)?`, "Norm / advice", "should do", "Expresses what is proper, expected, or advisable.", "", ex("約束は守るべきです。", "You should keep promises.", "べき is stronger and more formal than 方がいい."), "high", 15),
    gp("time-aida-aida-ni", "N4", "間 / 間に", `${FORM_CHUNK}間(?:に|は)?`, "Time span", "while or during", "Marks a period during which something happens.", "", ex("夏休みの間に本を三冊読みました。", "I read three books during summer vacation.", "間に focuses on something happening within the interval."), "medium", 22),
    gp("time-uchi-ni", "N3", "うちに", `${FORM_CHUNK}うちに`, "Time limit", "while still or before it changes", "Says to act while a condition still holds.", "", ex("明るいうちに帰りましょう。", "Let us go home while it is still light.", "うちに warns the condition may change."), "medium", 14),
    gp("time-saichuu-ni", "N3", "最中に", `${FORM_CHUNK}最中に`, "Middle of action", "right in the middle of", "Marks that something happens right in the middle of another action.", "", ex("会議の最中に電話が鳴った。", "The phone rang in the middle of the meeting.", "最中に emphasizes interruption during an event."), "high", 16),
    gp("repetition-tabi-ni", "N3", "たびに", `${FORM_CHUNK}たびに`, "Repetition", "every time", "Marks something that happens each time another thing occurs.", "", ex("彼に会うたびに元気をもらう。", "Every time I meet him, I feel encouraged.", "たびに repeats with each occurrence."), "high", 14),
    gp("incidental-tsuide-ni", "N3", "ついでに", `${FORM_CHUNK}ついでに`, "Incidental action", "while you are at it", "Adds an extra action done along with the main action.", "", ex("買い物のついでに郵便局へ行きます。", "I will go to the post office while I am out shopping.", "ついでに adds a convenient side task."), "medium", 14),
    gp("cause-sei-okage-de", "N3", "せいで / おかげで", `${FORM_CHUNK}(?:せい|おかげ)で`, "Cause", "because of, thanks to", "せいで gives a negative cause; おかげで gives a beneficial cause.", "", ex("先生のおかげで合格できました。", "Thanks to my teacher, I was able to pass.", "おかげで is positive; せいで is negative."), "high", 14),
    gp("manner-toori", "N3", "とおり", `${FORM_CHUNK}(?:とおり|通り)(?:に|だ|です)?`, "Manner", "as or just as", "Says something happens in the same way as a model or statement.", "", ex("説明のとおりに操作してください。", "Please operate it as explained.", "とおり means following a model."), "high", 16),
    gp("certainty-ni-chigai-nai", "N3", "に違いない", `${FORM_CHUNK}に違い(?:ない|ありません)`, "Certainty", "must be true", "Shows strong certainty based on evidence or reasoning.", "", ex("彼は医者に違いない。", "He must be a doctor.", "に違いない is strong certainty."), "high", 15),
    gp("certainty-ni-kimatte-iru", "N3", "に決まっている", `${FORM_CHUNK}に決まってい(?:る|ます)`, "Certainty", "obviously must be", "Expresses strong, often emphatic certainty.", "", ex("彼なら勝つに決まっている。", "If it is him, he is sure to win.", "Often sounds emphatic or subjective."), "high", 15),
    gp("qualification-to-wa-kagiranai", "N3", "とは限らない", `${FORM_CHUNK}とは限(?:らない|りません)`, "Qualification", "not necessarily", "Says something is not always or not necessarily true.", "", ex("高いものが良いとは限りません。", "Expensive things are not necessarily good.", "とは限らない denies universality."), "high", 15),
    gp("contrast-ippou-de", "N3", "一方で", `${FORM_CHUNK}一方(?:で)?`, "Contrast / one side", "on the other hand or while", "Marks contrast, parallel facts, or one aspect of a situation.", "", ex("収入が増えた一方で、忙しくなった。", "My income increased, but on the other hand I became busier.", "一方で compares two sides."), "medium", 16),
    gp("contrast-hanmen", "N3", "反面", `${FORM_CHUNK}反面`, "Contrast", "on the other hand", "Contrasts one side of something with another side.", "", ex("便利な反面、危険もある。", "It is convenient, but on the other hand there are dangers.", "反面 marks the opposite side."), "medium", 16),
    gp("substitution-kawari-ni", "N3", "かわりに", `${FORM_CHUNK}かわりに`, "Substitution / tradeoff", "instead of or in exchange for", "Marks a substitute action or a tradeoff.", "", ex("映画に行くかわりに家で休みます。", "Instead of going to a movie, I will rest at home.", "かわりに marks replacement or exchange."), "medium", 16),
    gp("topic-ni-kanshite", "N3", "に関して", `${FORM_CHUNK}に関して`, "Topic", "about or concerning", "Marks the topic of discussion or concern.", "", ex("仕事に関して相談があります。", "I have something to discuss about work.", "に関して is formal topic marking."), "high", 17),
    gp("comparison-ni-kurabete", "N3", "に比べて", `${FORM_CHUNK}に比べて`, "Comparison", "compared with", "Marks the basis for comparison.", "", ex("去年に比べて暑いです。", "It is hot compared with last year.", "に比べて sets comparison baseline."), "high", 17),
    gp("basis-ni-motozuite", "N3", "に基づいて", `${FORM_CHUNK}に基づいて`, "Basis", "based on", "Marks the basis or evidence for an action or judgment.", "", ex("データに基づいて判断します。", "We will decide based on data.", "に基づいて is formal."), "high", 17),
    gp("following-ni-sotte", "N3", "に沿って", `${FORM_CHUNK}に沿って`, "Following", "along with or in line with", "Shows that something follows a rule, plan, or path.", "", ex("計画に沿って進めます。", "We will proceed according to the plan.", "に沿って follows a route or plan."), "medium", 17),
    gp("following-change-ni-shitagatte", "N3", "に従って", `${FORM_CHUNK}に従って`, "Following / change", "following or as", "Marks following a rule, person, or gradual change.", "", ex("説明に従って操作してください。", "Please operate it according to the instructions.", "Can also mean as something changes."), "medium", 17),
    gp("change-ni-tsurete", "N3", "につれて", `${FORM_CHUNK}につれて`, "Gradual change", "as something changes", "Shows one change happening together with another.", "", ex("寒くなるにつれて人が減った。", "As it got colder, fewer people came.", "につれて links gradual changes."), "medium", 17),
    gp("together-to-tomo-ni", "N3", "とともに", `${FORM_CHUNK}とともに`, "Together / change", "together with or as", "Marks doing something together or a change occurring alongside another.", "", ex("時代とともに言葉も変わる。", "Language changes along with the times.", "Formal together/change marker."), "medium", 17),
    gp("context-ni-oite", "N3", "において", `${FORM_CHUNK}において`, "Context", "in or at", "Formal marker for place, field, time, or context.", "", ex("現代社会において重要です。", "It is important in modern society.", "において is formal and written."), "high", 17),
    gp("means-wo-tsuujite-tooshite", "N3", "を通じて / を通して", `${FORM_CHUNK}を通(?:じて|して)`, "Means / span", "through or throughout", "Marks a means, mediator, or time span.", "", ex("一年を通して暖かいです。", "It is warm throughout the year.", "を通じて/通して can mean through or throughout."), "medium", 17),
    gp("representative-wo-hajime", "N3", "をはじめ", `${FORM_CHUNK}をはじめ`, "Representative example", "starting with", "Introduces a leading example from a larger group.", "", ex("東京をはじめ多くの都市で行われた。", "It was held in many cities, starting with Tokyo.", "をはじめ introduces a representative item."), "medium", 17),
    gp("limit-ni-kagiru-kagirazu", "N3", "に限る / に限らず", `${FORM_CHUNK}に限(?:る|ります|らない|らず|って)`, "Limit / recommendation", "limited to, not limited to, or best", "Marks limitation, non-limitation, special cases, or a strong recommendation.", "", ex("疲れた時は寝るに限る。", "When tired, sleeping is best.", "に限る can also recommend the best option."), "medium", 17),
    gp("suffix-gachi", "N3", "がち", `${FORM_CHUNK}がち`, "Tendency", "tend to", "Shows a repeated tendency, often negative.", "", ex("忙しいと食事を忘れがちです。", "When busy, I tend to forget meals.", "がち often marks an undesirable tendency."), "medium", 24),
    gp("suffix-gimi", "N3", "気味", `${FORM_CHUNK}気味`, "Slight tendency", "a little, somewhat", "Shows that something is a little in a certain state.", "", ex("今日は疲れ気味です。", "I am a bit tired today.", "気味 is a slight tendency or condition."), "medium", 24),
    gp("suffix-ge", "N3", "げ", `${FORM_CHUNK}げ`, "Appearance suffix", "seeming", "Adds a sense that someone or something appears a certain way.", "", ex("彼は寂しげに笑った。", "He smiled sadly.", "げ often describes visible mood."), "medium", 24),
    gp("suffix-ppoi", "N3", "っぽい", `${FORM_CHUNK}っぽい`, "Tendency / likeness", "-ish or prone to", "Shows something seems like, is prone to, or has a quality.", "", ex("この服は子どもっぽい。", "These clothes look childish.", "っぽい is casual and broad."), "medium", 24),
    gp("negative-youni-nai", "N3", "ようがない", `${FORM_CHUNK}ようが(?:ない|ありません)`, "Impossibility", "no way to do", "Says there is no method or possibility for doing something.", "", ex("壊れすぎて直しようがない。", "It is too broken to fix.", "Stem + ようがない means no way to do."), "high", 16),
    gp("impossible-kkonai", "N3", "っこない", `${FORM_CHUNK}っこない`, "Impossibility", "no chance of doing", "Casually says something will not or cannot happen.", "", ex("彼が負けっこない。", "There is no way he will lose.", "っこない is casual and emphatic."), "medium", 18),
    gp("condition-kara-ni-wa", "N2", "からには", `${FORM_CHUNK}からには`, "Commitment condition", "now that / since", "Sets a condition that creates obligation, resolve, or expectation.", "", ex("やるからには最後までやります。", "Since I am doing it, I will do it to the end.", "からには often implies commitment."), "high", 12),
    gp("condition-ijou-wa", "N2", "以上は", `${FORM_CHUNK}以上は`, "Commitment condition", "now that / as long as", "Sets a condition that creates obligation or consequence.", "", ex("約束した以上は守るべきだ。", "Since you promised, you should keep it.", "以上は is formal and firm."), "high", 11),
    gp("condition-ue-wa", "N2", "上は", `${FORM_CHUNK}上は`, "Commitment condition", "now that", "Means now that something is true, a certain responsibility follows.", "", ex("引き受けた上は全力を尽くします。", "Now that I have accepted, I will do my best.", "上は is formal."), "high", 12),
    gp("sequence-ue-de", "N2", "上で", `${FORM_CHUNK}上で`, "After / basis", "after doing or on the basis of", "Means after doing something, or after considering something as a basis.", "", ex("内容を確認した上で署名します。", "I will sign after confirming the contents.", "上で often means after careful action."), "high", 13),
    gp("addition-ue-ni", "N2", "上に", `${FORM_CHUNK}上に`, "Addition", "on top of that", "Adds another fact, often intensifying the evaluation.", "", ex("彼は親切な上に面白い。", "He is kind and, on top of that, funny.", "上に stacks positive or negative facts."), "high", 13),
    gp("viewpoint-kara-miru-to", "N2", "から見ると / からすると", `${FORM_CHUNK}から(?:見ると|見れば|すると|すれば|言うと|言えば)`, "Viewpoint", "from the point of view of", "Marks the standpoint or basis for judgment.", "", ex("専門家から見ると簡単です。", "From an expert's view, it is simple.", "から見ると introduces a viewpoint."), "medium", 16),
    gp("starting-kara-shite", "N2", "からして", `${FORM_CHUNK}からして`, "Even starting with", "judging from or even", "Marks a representative starting point for judgment.", "", ex("名前からして怪しい。", "Even the name sounds suspicious.", "からして can mean judging from or even."), "medium", 16),
    gp("only-ni-suginai", "N2", "にすぎない", `${FORM_CHUNK}にすぎ(?:ない|ません)`, "Limitation", "nothing more than", "Says something is only a certain thing and should not be overestimated.", "", ex("これは一例にすぎません。", "This is nothing more than one example.", "にすぎない minimizes."), "high", 14),
    gp("essence-ni-hoka-naranai", "N2", "にほかならない", `${FORM_CHUNK}にほかならない`, "Essence / conclusion", "nothing other than", "States the true identity or central cause of something.", "", ex("成功は努力の結果にほかならない。", "Success is nothing other than the result of effort.", "Formal emphatic conclusion."), "high", 14),
    gp("necessity-zaru-wo-enai", "N2", "ざるを得ない", `${FORM_CHUNK}ざるを得(?:ない|ません)`, "Necessity", "have no choice but to", "Says there is no choice but to do something.", "", ex("予定を変更せざるを得ない。", "We have no choice but to change the plan.", "ざるを得ない is formal necessity."), "high", 10),
    gp("compulsion-zu-ni-wa-irarenai", "N2", "ずにはいられない", `${FORM_CHUNK}(?:ずには|ないでは)いられ(?:ない|ません|なかった|ませんでした)`, "Compulsion", "cannot help doing", "Says one cannot resist doing or feeling something.", "", ex("笑わずにはいられなかった。", "I could not help laughing.", "Often used for emotions or impulses."), "high", 10),
    gp("possibility-eru-enai", "N2", "得る / 得ない", `${FORM_CHUNK}得(?:る|ます|ない|ません)`, "Possibility", "can happen / cannot happen", "Marks something as possible or impossible, often in formal writing.", "", ex("事故は起こり得る。", "An accident can happen.", "得る is read うる or える depending on form."), "medium", 20),
    gp("risk-kanenai", "N2", "かねない", `${FORM_CHUNK}かね(?:ない|ません)`, "Risk", "might happen, usually bad", "Warns that a negative result could happen.", "", ex("このままでは失敗しかねない。", "At this rate, we might fail.", "かねない is used for undesirable possibilities."), "high", 14),
    gp("difficulty-kaneru", "N2", "かねる", `${FORM_CHUNK}かね(?:る|ます)`, "Difficulty / refusal", "unable to do", "Politely says something is difficult or impossible to do.", "", ex("その質問には答えかねます。", "I am unable to answer that question.", "Often used in formal refusal."), "high", 14),
    gp("emotion-te-naranai", "N2", "てならない", `${FORM_CHUNK}[てで]ならない`, "Strong feeling", "cannot help feeling", "Expresses a strong spontaneous feeling or state.", "", ex("心配でならない。", "I cannot help being worried.", "Used with feelings and sensations."), "medium", 14),
    gp("emotion-te-tamaranai", "N2", "てたまらない", `${FORM_CHUNK}[てで]たまらない`, "Strong feeling", "unbearably", "Expresses an intense feeling or sensation.", "", ex("眠くてたまらない。", "I am unbearably sleepy.", "てたまらない intensifies feeling."), "medium", 14),
    gp("emotion-te-shouganai", "N2", "てしょうがない", `${FORM_CHUNK}[てで](?:しょうがない|仕方がない)`, "Strong feeling", "cannot help / extremely", "Expresses an uncontrollable or very strong feeling.", "", ex("楽しみでしょうがない。", "I am extremely excited.", "Casual form of intense feeling."), "medium", 14),
    gp("timing-shidai", "N2", "次第", `${FORM_CHUNK}次第`, "Timing / dependence", "as soon as or depending on", "Can mean as soon as something happens, or depending on something.", "", ex("準備ができ次第、出発します。", "We will leave as soon as preparations are ready.", "次第 is context-dependent."), "medium", 16),
    gp("time-sai-ni", "N2", "際に", `${FORM_CHUNK}際に`, "Occasion", "on the occasion of", "Formal marker for when doing something or when something happens.", "", ex("申し込む際に必要です。", "It is needed when applying.", "際に is formal when/occasion."), "high", 16),
    gp("occasion-ni-atatte", "N2", "にあたって", `${FORM_CHUNK}にあたって`, "Occasion / preparation", "when doing", "Formal marker for a special occasion, often with preparation.", "", ex("開始にあたって説明します。", "I will explain before we begin.", "にあたって often marks an important occasion."), "high", 16),
    gp("occasion-ni-saishite", "N2", "に際して", `${FORM_CHUNK}に際して`, "Occasion", "on the occasion of", "Formal marker for a special time or event.", "", ex("卒業に際して一言述べます。", "I will say a few words on the occasion of graduation.", "に際して is formal."), "high", 16),
    gp("prior-ni-sakidatte", "N2", "に先立って", `${FORM_CHUNK}に先立って`, "Prior action", "before / prior to", "Marks something done before an event.", "", ex("会議に先立って資料を配った。", "Materials were distributed before the meeting.", "Formal prior-to marker."), "high", 16),
    gp("trigger-wo-kikkake-ni", "N2", "をきっかけに", `${FORM_CHUNK}をきっかけに`, "Trigger", "triggered by", "Marks an event that becomes the trigger for change.", "", ex("留学をきっかけに日本語を始めた。", "Studying abroad triggered me to start Japanese.", "きっかけ is a trigger or opportunity."), "high", 16),
    gp("trigger-wo-keiki-ni", "N2", "を契機に", `${FORM_CHUNK}を契機に`, "Trigger", "taking as an opportunity", "Formal version of using something as a turning point or trigger.", "", ex("受賞を契機に仕事が増えた。", "After the award, work increased.", "契機 is formal turning point."), "medium", 16),
    gp("span-ni-watatte", "N2", "にわたって", `${FORM_CHUNK}にわたって`, "Span", "over / across", "Marks a span of time, place, or range.", "", ex("会議は三日間にわたって行われた。", "The conference was held over three days.", "にわたって emphasizes breadth or duration."), "high", 17),
    gp("accompany-ni-tomonatte", "N2", "に伴って", `${FORM_CHUNK}に伴って`, "Accompanying change", "along with", "Shows one change accompanying another.", "", ex("人口の増加に伴って問題も増えた。", "Problems increased along with the population.", "に伴って is formal."), "high", 17),
    gp("response-ni-oujite", "N2", "に応じて", `${FORM_CHUNK}に応じて`, "Response / variation", "according to or depending on", "Shows something changes in response to a condition.", "", ex("年齢に応じて料金が変わります。", "The fee changes according to age.", "に応じて means responding to a condition."), "medium", 17),
    gp("basis-wo-fumaete", "N2", "を踏まえて", `${FORM_CHUNK}を踏まえて`, "Basis", "based on / taking into account", "Marks information used as a basis for judgment or action.", "", ex("結果を踏まえて改善します。", "We will improve based on the results.", "を踏まえて means taking into account."), "high", 17),
    gp("merit-dake-atte", "N2", "だけあって", `${FORM_CHUNK}だけあって`, "As expected", "as expected of", "Says a result is natural given the quality or status.", "", ex("有名なだけあって、おいしい。", "As expected from its fame, it is delicious.", "だけあって praises or acknowledges a reason."), "medium", 16),
    gp("because-dake-ni", "N2", "だけに", `${FORM_CHUNK}だけに`, "Because / all the more", "precisely because", "Shows a result is especially true because of the reason.", "", ex("大切なだけに失敗したくない。", "Because it is important, I do not want to fail.", "だけに intensifies the reason."), "medium", 16),
    gp("concession-youga-maiga", "N1", "ようが / まいが", `${FORM_CHUNK}(?:ろうが|ようが)${FORM_CHUNK}まいが`, "Indifference / concession", "whether or not", "Says that the result is the same regardless of which condition occurs.", "", ex("雨が降ろうが降るまいが行きます。", "I will go whether it rains or not.", "Volitional-like form + が pairs with まいが."), "high", 8),
    gp("concession-nagara-mo", "N2", "ながらも", `${FORM_CHUNK}ながらも`, "Concession", "although", "Connects a fact with a contrasting result.", "", ex("狭いながらも快適な部屋です。", "It is a small but comfortable room.", "ながらも is concessive."), "medium", 16),
    gp("continuation-tsutsu", "N2", "つつ / つつある", `${FORM_CHUNK}つつ(?:ある)?`, "Continuation / contrast", "while or gradually", "Can mean while doing, although, or gradually developing with つつある.", "", ex("状況は改善しつつある。", "The situation is gradually improving.", "つつある marks ongoing change."), "medium", 18),
    gp("cause-bakari-ni", "N2", "ばかりに", `${FORM_CHUNK}ばかりに`, "Regrettable cause", "just because", "Marks a cause that led to an unfortunate result.", "", ex("一言言ったばかりに誤解された。", "Just because I said one word, I was misunderstood.", "ばかりに usually has regret."), "high", 15),
    gp("contrast-dokoro-ka", "N2", "どころか", `${FORM_CHUNK}どころか`, "Strong contrast", "far from / not just", "Rejects one idea and gives a stronger or opposite fact.", "", ex("暇どころか、忙しすぎます。", "Far from being free, I am too busy.", "どころか heightens contrast."), "high", 15),
    gp("impossible-dokoro-dewa-nai", "N2", "どころではない", `${FORM_CHUNK}どころではない`, "No time for", "this is no time for", "Says the situation makes something impossible or inappropriate.", "", ex("遊ぶどころではない。", "This is no time to play.", "どころではない rejects possibility due to circumstances."), "high", 15),
    gp("nonlimiting-dake-denaku", "N3", "だけでなく", `${FORM_CHUNK}だけでなく`, "Addition", "not only", "Adds another thing beyond the first.", "", ex("彼は日本語だけでなく韓国語も話せる。", "He can speak not only Japanese but also Korean.", "Often pairs with も."), "high", 20),
    gp("regardless-ni-kakawarazu", "N2", "にかかわらず", `${FORM_CHUNK}にかかわらず`, "Regardless", "regardless of", "Says the result is the same regardless of a condition.", "", ex("年齢にかかわらず参加できます。", "You can participate regardless of age.", "Do not confuse with にもかかわらず (despite)."), "high", 16),
    gp("contrary-ni-hanshite", "N2", "に反して", `${FORM_CHUNK}に反して`, "Contrary to", "against / contrary to", "Marks a result contrary to expectation, rule, or intention.", "", ex("予想に反して売れた。", "It sold contrary to expectations.", "に反して means against or contrary to."), "high", 16),
    gp("addition-ni-kuwaete", "N2", "に加えて", `${FORM_CHUNK}に加えて`, "Addition", "in addition to", "Adds another item or fact.", "", ex("家賃に加えて光熱費も必要です。", "Utilities are needed in addition to rent.", "に加えて is formal addition."), "high", 16),
    gp("target-ni-kotaete", "N2", "に応えて", `${FORM_CHUNK}に(?:応|こた)えて`, "Response", "in response to", "Acts in response to expectations, requests, or support.", "", ex("期待に応えて頑張ります。", "I will work hard in response to expectations.", "に応えて responds to people or expectations."), "medium", 17),
    gp("center-wo-chuushin-ni", "N2", "を中心に", `${FORM_CHUNK}を中心に`, "Center", "centered on", "Marks the central person, place, or topic.", "", ex("東京を中心に活動しています。", "We operate mainly around Tokyo.", "を中心に marks the center."), "high", 17),
    gp("regardless-wo-toyazu", "N2", "を問わず", `${FORM_CHUNK}を問わず`, "Regardless", "regardless of", "Says a distinction does not matter.", "", ex("経験を問わず応募できます。", "You can apply regardless of experience.", "を問わず is formal."), "high", 16),
    gp("topic-wo-megutte", "N2", "をめぐって", `${FORM_CHUNK}をめぐって`, "Surrounding issue", "over / concerning", "Marks an issue around which discussion, conflict, or movement occurs.", "", ex("予算をめぐって議論が続いた。", "Debate continued over the budget.", "Often used with disputes or discussion."), "high", 16),
    gp("direction-muke-muki", "N3", "向け / 向き", `${FORM_CHUNK}向(?:け|き)`, "Target audience / suitability", "for or suitable for", "向け means aimed at; 向き means suitable for.", "", ex("これは初心者向けの本です。", "This is a book for beginners.", "向け targets; 向き suits."), "medium", 22),
    gp("relative-wari-ni", "N2", "わりに", `${FORM_CHUNK}わりに`, "Unexpected comparison", "considering / for", "Shows something is unexpected relative to a standard.", "", ex("値段のわりにおいしい。", "It is tasty considering the price.", "わりに compares against expectation."), "medium", 18),
    gp("memory-kke", "N2", "っけ", `${FORM_CHUNK}っけ`, "Memory check", "what was it again?", "Casually checks memory or confirms something.", "", ex("明日の会議は何時だっけ。", "What time was tomorrow's meeting again?", "っけ is casual recollection."), "medium", 28),
    gp("quote-to-iu-yori", "N2", "というより", `${FORM_CHUNK}というより`, "Correction", "rather than", "Corrects or reframes the previous description.", "", ex("彼は静かというより無口だ。", "He is not so much quiet as taciturn.", "というより adjusts the label."), "medium", 18),
    gp("example-to-itta", "N2", "といった", `${FORM_CHUNK}といった`, "Examples", "such as", "Introduces representative examples.", "", ex("京都や奈良といった古い町。", "Old cities such as Kyoto and Nara.", "といった lists examples."), "medium", 20),
    gp("topic-to-ieba", "N2", "といえば", `${FORM_CHUNK}といえば`, "Speaking of", "speaking of", "Introduces something associated with a topic.", "", ex("日本の食べ物といえば寿司です。", "Speaking of Japanese food, sushi comes to mind.", "といえば sets up an association."), "medium", 20),
    gp("thing-mono-da", "N2", "ものだ", `${FORM_CHUNK}もの(?:だ|です)`, "General truth / emotion", "it is natural / used to", "Can express general truths, emotional reflection, or past habits.", "", ex("時間が経つのは早いものです。", "Time really does pass quickly.", "ものだ is context-sensitive."), "medium", 24),
    gp("cause-mono-dakara", "N2", "ものだから", `${FORM_CHUNK}ものだから`, "Excuse / reason", "because", "Gives a reason, often as an excuse or explanation.", "", ex("道が混んでいたものだから遅れました。", "I was late because the road was crowded.", "ものだから softens an explanation."), "medium", 16),
    gp("concession-mono-no", "N2", "ものの", `${FORM_CHUNK}ものの`, "Concession", "although", "States a fact but contrasts it with an unexpected result.", "", ex("買ったものの、まだ使っていない。", "Although I bought it, I have not used it yet.", "ものの is written-style concession."), "high", 16),
    gp("advice-koto-da", "N2", "ことだ", `${FORM_CHUNK}こと(?:だ|です)`, "Advice / importance", "should do", "Gives advice or states what is important.", "", ex("上達したいなら練習することだ。", "If you want to improve, you should practice.", "ことだ can be advice."), "medium", 22),
    gp("unnecessary-koto-wa-nai", "N2", "ことはない", `${FORM_CHUNK}ことは(?:ない|ありません)`, "No need", "there is no need to", "Says there is no need to do something.", "", ex("そんなに心配することはない。", "There is no need to worry so much.", "ことはない removes necessity."), "high", 14),
    gp("double-negative-nai-koto-wa-nai", "N2", "ないことはない", `${FORM_CHUNK}ないことは(?:ない|ありません)`, "Qualified possibility", "it is not impossible", "Double negative that gives a qualified yes.", "", ex("できないことはない。", "It is not that I cannot do it.", "Often means possible, but not easily or enthusiastically."), "high", 13),
    gp("explanation-to-iu-koto-da", "N2", "ということだ", `${FORM_CHUNK}ということ(?:だ|です)`, "Explanation / hearsay", "it means / I heard", "Explains a conclusion or reports information.", "", ex("つまり中止ということです。", "In other words, it means it is cancelled.", "Can be explanation or hearsay."), "medium", 16),
    gp("nature-to-iu-mono-da", "N2", "というものだ", `${FORM_CHUNK}というもの(?:だ|です)`, "Evaluation", "that is what X is", "States a general evaluation or conclusion.", "", ex("それが親切というものだ。", "That is what kindness is.", "Often makes a normative evaluation."), "medium", 16),
    gp("not-nature-to-iu-mono-dewa-nai", "N2", "というものではない", `${FORM_CHUNK}というものでは(?:ない|ありません)`, "Qualification", "not necessarily", "Says something is not simply or always the case.", "", ex("高ければ良いというものではない。", "Expensive does not necessarily mean good.", "否定 of というものだ."), "medium", 15),
    gp("wish-nai-mono-ka", "N2", "ないものか", `${FORM_CHUNK}ないものか`, "Wish", "is there no way?", "Expresses a wish that something could happen.", "", ex("もっと簡単にできないものか。", "Is there no way to do it more easily?", "Often expresses longing for a solution."), "medium", 16),
    gp("instant-ga-hayai-ka", "N1", "が早いか", `${FORM_CHUNK}が早いか`, "Immediate sequence", "no sooner than", "Shows one action happens immediately after another.", "", ex("ドアを開けるが早いか、犬が飛び出した。", "No sooner had I opened the door than the dog jumped out.", "Literary immediate sequence."), "high", 8),
    gp("instant-ya-inaya", "N1", "や否や", `${FORM_CHUNK}や否や`, "Immediate sequence", "as soon as", "Shows an action happens immediately after another.", "", ex("ベルが鳴るや否や、生徒が立ち上がった。", "As soon as the bell rang, the students stood up.", "Formal/literary immediate sequence."), "high", 8),
    gp("instant-nari", "N1", "なり", `${FORM_CHUNK}なり`, "Immediate sequence", "as soon as", "Shows one action immediately follows another, often unexpectedly.", "", ex("彼は帰るなり寝てしまった。", "As soon as he got home, he fell asleep.", "N1 なり differs from listing なり."), "medium", 12),
    gp("repetition-soba-kara", "N1", "そばから", `${FORM_CHUNK}そばから`, "Repeated frustration", "as soon as, repeatedly", "Shows something happens repeatedly right after another action, often frustratingly.", "", ex("覚えたそばから忘れる。", "I forget things as soon as I learn them.", "Often negative or frustrating."), "high", 10),
    gp("unexpected-ka-to-omoi-kiya", "N1", "かと思いきや", `${FORM_CHUNK}かと思いきや`, "Unexpected turn", "just when I thought", "Introduces an unexpected result contrary to what one thought.", "", ex("終わったかと思いきや、また問題が出た。", "Just when I thought it was over, another problem appeared.", "思いきや signals reversal."), "high", 10),
    gp("incidental-katagata", "N1", "かたがた", `${FORM_CHUNK}かたがた`, "Combined purpose", "also as", "Marks an action done also for another purpose, often formal visits or thanks.", "", ex("お礼かたがた伺いました。", "I visited also to express my thanks.", "Formal combined purpose."), "medium", 14),
    gp("incidental-gatera", "N1", "がてら", `${FORM_CHUNK}がてら`, "While doing", "while / on the same occasion", "Marks doing something while also doing another activity.", "", ex("散歩がてら買い物に行く。", "I will go shopping while taking a walk.", "がてら is like ついでに but more lexical."), "medium", 14),
    gp("starting-wo-kawakiri-ni", "N1", "を皮切りに", `${FORM_CHUNK}を皮切りに`, "Starting point", "starting with", "Marks the first in a series.", "", ex("東京を皮切りに全国で上映される。", "Starting with Tokyo, it will be shown nationwide.", "皮切り is the opening event."), "high", 14),
    gp("endpoint-wo-kagiri-ni", "N1", "を限りに", `${FORM_CHUNK}を限りに`, "Final point", "as of / ending with", "Marks a final point or last occurrence.", "", ex("今日を限りに退職します。", "As of today, I will resign.", "を限りに marks an endpoint."), "high", 14),
    gp("means-wo-motte", "N1", "をもって", `${FORM_CHUNK}をもって`, "Formal means / endpoint", "by means of / as of", "Formal marker for means, reason, or endpoint.", "", ex("本日をもって終了します。", "This ends as of today.", "をもって is formal."), "high", 14),
    gp("turning-wo-sakai-ni", "N1", "を境に", `${FORM_CHUNK}を境に`, "Turning point", "from / since", "Marks a boundary after which things change.", "", ex("結婚を境に生活が変わった。", "My life changed after marriage.", "境 marks a boundary."), "medium", 15),
    gp("range-ni-itaru-made", "N1", "に至るまで", `${FORM_CHUNK}に至るまで`, "Range", "all the way to", "Emphasizes a range reaching even to a point.", "", ex("細部に至るまで確認した。", "I checked everything down to the details.", "に至るまで emphasizes breadth."), "high", 14),
    gp("stage-ni-itatte", "N1", "に至って", `${FORM_CHUNK}に至って(?:は|も)?`, "Stage", "only when / at the stage of", "Marks reaching a serious or notable stage.", "", ex("事態がここに至っては手遅れだ。", "At this stage, it is too late.", "に至っては emphasizes a reached state."), "medium", 15),
    gp("context-ni-atte", "N1", "にあって", `${FORM_CHUNK}にあって`, "In a situation", "in / under", "Formal marker for being in a special situation or position.", "", ex("困難な状況にあって冷静だった。", "He was calm in a difficult situation.", "Formal written expression."), "medium", 16),
    gp("standard-ni-sokushite", "N1", "に即して", `${FORM_CHUNK}に即して`, "According to", "in line with", "Shows action follows facts, rules, or reality closely.", "", ex("現実に即して考える。", "Think in line with reality.", "に即して is formal."), "high", 15),
    gp("exclusive-wo-oite", "N1", "をおいて", `${FORM_CHUNK}をおいて`, "Exclusivity", "except for / no one but", "Says there is no better or other option than the marked item.", "", ex("彼をおいて適任者はいない。", "There is no one more suitable than him.", "Often used with いない or ない."), "high", 13),
    gp("defiance-wo-mono-to-mo-sezu", "N1", "をものともせず", `${FORM_CHUNK}をものともせず`, "Defiance", "in defiance of", "Says someone acts without being daunted by difficulty.", "", ex("悪天候をものともせず進んだ。", "They advanced despite the bad weather.", "Heroic or formal tone."), "high", 12),
    gp("forced-wo-yogi-naku-sareru", "N1", "を余儀なくされる", `${FORM_CHUNK}を余儀なくされ(?:る|ます|た|ました)`, "Forced result", "be forced to", "Says someone is forced by circumstances into a result.", "", ex("計画の変更を余儀なくされた。", "We were forced to change the plan.", "Noun + を余儀なくされる."), "high", 10),
    gp("force-wo-yogi-naku-saseru", "N1", "を余儀なくさせる", `${FORM_CHUNK}を余儀なくさせ(?:る|ます|た|ました)`, "Force result", "force someone to", "Says circumstances force someone into a result.", "", ex("大雪が中止を余儀なくさせた。", "Heavy snow forced the cancellation.", "Cause version of 余儀なくされる."), "high", 10),
    gp("emotion-ni-taenai", "N1", "に堪えない", `${FORM_CHUNK}に堪え(?:ない|ません)`, "Deep feeling", "cannot bear / deeply", "Can express unbearable negativity or deep positive emotion depending on noun.", "", ex("感謝に堪えません。", "I cannot thank you enough.", "Often formal with 感謝 or 遺憾."), "medium", 14),
    gp("reluctance-ni-shinobinai", "N1", "に忍びない", `${FORM_CHUNK}に忍びない`, "Reluctance", "cannot bear to", "Says one cannot bring oneself to do something emotionally.", "", ex("彼に真実を言うに忍びない。", "I cannot bear to tell him the truth.", "Emotional reluctance."), "high", 13),
    gp("easy-inference-ni-katagunai", "N1", "に難くない", `${FORM_CHUNK}に難くない`, "Easy inference", "not hard to imagine", "Says something is easy to imagine or understand.", "", ex("彼の苦労は想像に難くない。", "His hardship is not hard to imagine.", "Usually with 想像 or 理解."), "high", 13),
    gp("worthy-ni-ataru", "N1", "に値する", `${FORM_CHUNK}に値する`, "Worthiness", "worthy of", "Marks something as deserving an evaluation or action.", "", ex("この本は読むに値する。", "This book is worth reading.", "に値する means worth doing/evaluating."), "high", 13),
    gp("sufficient-ni-taru", "N1", "に足る", `${FORM_CHUNK}に足る`, "Sufficiency", "enough to / worthy of", "Shows something is sufficient or worthy for a judgment.", "", ex("信頼に足る人物です。", "He is a person worthy of trust.", "Formal sufficiency/worth."), "medium", 13),
    gp("utmost-no-itari", "N1", "の至り", `${FORM_CHUNK}の至り`, "Utmost", "the height of", "Expresses an extreme degree, often in set phrases.", "", ex("光栄の至りです。", "It is the height of honor.", "Formal set expression."), "medium", 16),
    gp("extreme-kiwamaru-kiwamarinai", "N1", "極まる / 極まりない", `${FORM_CHUNK}(?:極まる|極まりない)`, "Extreme degree", "extremely", "Expresses an extreme degree, often negative or formal.", "", ex("失礼極まりない態度だ。", "That is an extremely rude attitude.", "N1 formal intensifier."), "medium", 16),
    gp("deep-wish-te-yamanai", "N1", "てやまない", `${FORM_CHUNK}[てで]や(?:まない|みません)`, "Deep wish / feeling", "sincerely", "Expresses a deep, continuing wish or feeling.", "", ex("成功を願ってやみません。", "I sincerely wish for your success.", "Formal with wishes and feelings."), "high", 12),
    gp("since-te-kara-to-iu-mono", "N1", "てからというもの", `${FORM_CHUNK}[てで]からというもの`, "Since then", "ever since", "Says that after an event, a state has continued.", "", ex("犬を飼ってからというもの、毎日が楽しい。", "Ever since getting a dog, every day has been fun.", "Emphasizes lasting change."), "high", 10),
    gp("consequence-zu-ni-wa-okanai", "N1", "ずにはおかない", `${FORM_CHUNK}(?:ずには|ないでは)おかない`, "Inevitable action", "will surely / cannot not", "Says something will inevitably cause an action or reaction.", "", ex("この映画は人を感動させずにはおかない。", "This movie is sure to move people.", "Often means cannot fail to affect."), "high", 10),
    gp("consequence-zu-ni-wa-sumanai", "N1", "ずにはすまない", `${FORM_CHUNK}(?:ずには|ないでは)すまない`, "Unavoidable duty", "must / cannot avoid", "Says one cannot get away without doing something.", "", ex("謝らずにはすまない。", "I cannot avoid apologizing.", "Duty or consequence cannot be avoided."), "high", 10),
    gp("prohibition-bekarazu", "N1", "べからず", `${FORM_CHUNK}べからず`, "Prohibition", "must not", "Old/formal prohibition often seen on signs or set phrases.", "", ex("ここに入るべからず。", "Do not enter here.", "Literary/formal prohibition."), "high", 12),
    gp("improper-majiki", "N1", "まじき", `${FORM_CHUNK}まじき`, "Improper", "unbecoming / must not", "Marks behavior as inappropriate for a role or status.", "", ex("教師にあるまじき行為だ。", "That is behavior unbecoming of a teacher.", "Formal judgment of impropriety."), "high", 12),
    gp("role-taru-mono", "N1", "たるもの", `${FORM_CHUNK}たるもの`, "Role standard", "one who is", "States what is expected of someone in a role.", "", ex("リーダーたるもの責任を持つべきだ。", "A leader should take responsibility.", "Formal role-based expectation."), "high", 12),
    gp("surprise-tomo-arou-mono-ga", "N1", "ともあろうものが", `${FORM_CHUNK}ともあろうものが`, "Role disappointment", "of all people", "Expresses criticism or surprise that someone of a status did something.", "", ex("医者ともあろうものが不注意だった。", "A doctor, of all people, was careless.", "Critical surprise."), "high", 12),
    gp("stage-tomo-naru-to", "N1", "ともなると", `${FORM_CHUNK}ともなると`, "Stage / status", "when it comes to", "Says that once something reaches a level, things change.", "", ex("大人ともなると責任が増える。", "Once you become an adult, responsibilities increase.", "Marks a stage or status."), "medium", 14),
    gp("any-de-are", "N1", "であれ", `${FORM_CHUNK}であれ`, "Regardless / even if", "whoever or whatever", "Formal marker meaning even if or no matter what.", "", ex("理由が何であれ、許されない。", "Whatever the reason, it is not allowed.", "Often pairs with repeated alternatives."), "medium", 16),
    gp("pair-to-ii-to-ii", "N1", "といい", `${FORM_CHUNK}といい`, "Pair evaluation", "both...and", "Picks two examples to evaluate the whole.", "", ex("デザインといい性能といい素晴らしい。", "Both the design and performance are excellent.", "Usually repeats といい."), "medium", 18),
    gp("concession-to-wa-ie", "N1", "とはいえ", `${FORM_CHUNK}とはいえ`, "Concession", "although / be that as it may", "Acknowledges a fact but introduces a contrasting point.", "", ex("春とはいえ、まだ寒い。", "Although it is spring, it is still cold.", "Formal concession."), "high", 14),
    gp("without-nakushite", "N1", "なくして", `${FORM_CHUNK}なくして`, "Without", "without / without which", "Says something cannot happen without the marked thing.", "", ex("努力なくして成功はない。", "There is no success without effort.", "Formal without-condition."), "high", 13),
    gp("basis-atte-no", "N1", "あっての", `${FORM_CHUNK}あっての`, "Dependent on", "possible because of", "Says something exists thanks to another thing.", "", ex("皆さんの協力あっての成功です。", "This success is thanks to everyone's cooperation.", "AあってのB = B exists because of A."), "medium", 13),
    gp("unique-nara-dewa", "N1", "ならでは", `${FORM_CHUNK}ならでは`, "Unique to", "unique to", "Marks something as unique to the source.", "", ex("京都ならではの雰囲気。", "An atmosphere unique to Kyoto.", "Often positive uniqueness."), "high", 13),
    gp("covered-mamire", "N1", "まみれ", `${FORM_CHUNK}まみれ`, "Covered in", "covered with", "Says something is covered in an unpleasant substance.", "", ex("泥まみれになった。", "I got covered in mud.", "Often negative physical covering."), "medium", 20),
    gp("full-zukume", "N1", "ずくめ", `${FORM_CHUNK}ずくめ`, "Full of", "all / nothing but", "Says everything is of one kind, often color or events.", "", ex("今日はいいことずくめだった。", "Today was full of good things.", "ずくめ means entirely filled with."), "medium", 20),
    gp("depending-ikan", "N1", "いかん", `${FORM_CHUNK}いかん(?:だ|で|によって|にかかわらず)?`, "Depending / regardless", "depending on / regardless of", "Formal expression for depending on how something is, or regardless of it.", "", ex("結果いかんで判断します。", "We will decide depending on the result.", "いかん is formal and noun-based."), "medium", 16),
    gp("result-shimatsu-da", "N1", "始末だ", `${FORM_CHUNK}始末(?:だ|です)`, "Bad result", "ended up", "Describes a bad final result after a sequence of events.", "", ex("最後には怒り出す始末だ。", "In the end, he even got angry.", "Often negative outcome."), "medium", 18),
    gp("rhetorical-denakute-nandarou", "N1", "でなくてなんだろう", `${FORM_CHUNK}でなくてなんだろう`, "Rhetorical emphasis", "what else could it be?", "Strongly asserts that something is exactly the named thing.", "", ex("これが愛でなくてなんだろう。", "What could this be if not love?", "Rhetorical affirmation."), "medium", 18),
    gp("extreme-to-ittara-nai", "N1", "といったらない", `${FORM_CHUNK}といったらない`, "Extreme degree", "indescribably", "Expresses an extreme degree that is hard to describe.", "", ex("うれしいといったらない。", "I was indescribably happy.", "Casual/emphatic extreme degree."), "medium", 18),
    gp("extreme-tara-aryashinai", "N1", "たらありゃしない", `${FORM_CHUNK}たらありゃしない`, "Extreme degree", "extremely", "Casual emphatic expression meaning extremely.", "", ex("面倒くさいったらありゃしない。", "It is unbelievably troublesome.", "Often colloquial."), "medium", 18),
    gp("best-ni-koshita-koto-wa-nai", "N2", "に越したことはない", `${FORM_CHUNK}に越したことは(?:ない|ありません)`, "Best option", "nothing is better than", "Says that a certain option is best if possible.", "", ex("早いに越したことはない。", "The earlier, the better.", "に越したことはない recommends ideal condition."), "high", 14),
    gp("excess-ni-mo-hodo-ga-aru", "N1", "にもほどがある", `${FORM_CHUNK}にもほどがある`, "Excess criticism", "there is a limit", "Criticizes something as going too far.", "", ex("冗談にもほどがある。", "There is a limit to joking.", "Used for criticism."), "high", 14),
    gp("emphatic-no-nanno", "N1", "のなんの", `${FORM_CHUNK}のなんの`, "Extreme emphasis", "extremely", "Casual emphatic expression for a strong feeling or state.", "", ex("忙しいのなんの。", "I was incredibly busy.", "Colloquial intensity."), "medium", 22),
    gp("minimal-tari-tomo", "N1", "たりとも", `${FORM_CHUNK}たりとも`, "Even one", "not even", "Emphasizes even the smallest amount, often with negatives.", "", ex("一秒たりとも無駄にしない。", "I will not waste even one second.", "Strong minimal emphasis."), "high", 14),
    gp("minimal-dani", "N1", "だに", `${FORM_CHUNK}だに`, "Even / just", "even just", "Literary marker often in set phrases like 想像だにしない.", "", ex("想像だにしなかった。", "I had not even imagined it.", "Literary and limited use."), "medium", 20),
    gp("minimal-sura", "N1", "すら", `${FORM_CHUNK}すら`, "Even", "even", "Emphasizes an extreme or minimal example.", "", ex("彼は名前すら書けない。", "He cannot even write his name.", "すら is similar to さえ but formal/literary."), "medium", 20),
    gp("comparison-gotoki", "N1", "ごとき", `${FORM_CHUNK}ごとき`, "Like / such as", "like or such a", "Formal/literary expression meaning like, or dismissively such as.", "", ex("私ごときには無理です。", "It is impossible for someone like me.", "Often humble or dismissive."), "medium", 20),
    gp("suffix-meku", "N1", "めく", `${FORM_CHUNK}め(?:く|いて|き)`, "Become like", "take on the air of", "Means to become like or show signs of something.", "", ex("春めいてきました。", "It has started to feel like spring.", "Often seasonal or atmospheric."), "medium", 20),
    gp("unnecessary-made-mo-nai", "N1", "までもない", `${FORM_CHUNK}までもない`, "No need", "no need to", "Says something is so obvious or unnecessary that it need not be done.", "", ex("言うまでもない。", "It goes without saying.", "までもない removes need."), "high", 14),
    gp("unnecessary-ni-wa-oyobanai", "N1", "には及ばない", `${FORM_CHUNK}には及(?:ばない|びません)`, "No need / cannot match", "no need or not equal to", "Can mean no need to do, or not reaching the level of something.", "", ex("心配するには及びません。", "There is no need to worry.", "Formal expression."), "medium", 16),
    gp("situation-tokoro-wo", "N1", "ところを", `${FORM_CHUNK}ところを`, "At a moment", "at a time when", "Politely acknowledges someone's situation, often in thanks or apology.", "", ex("お忙しいところをありがとうございます。", "Thank you despite being busy.", "Common polite set pattern."), "high", 14)
];

const translationCache = new Map<string, string>();
const translationInFlight = new Map<string, Promise<string>>();
const grammarHintCache = new Map<string, GrammarHint[]>();

export function listLocalGrammarRuleExamples(): LocalGrammarRuleExample[] {
    return GRAMMAR_PATTERNS.flatMap(rule => rule.examples.map(example => ({
        ruleId: rule.ruleId,
        name: rule.name,
        level: rule.level,
        example,
    })));
}

export function detectGrammarHints(sentence: string): GrammarHint[] {
    const normalized = sentence.normalize('NFKC').replace(/\s+/g, '');
    const cached = grammarHintCache.get(normalized);
    if (cached) return cached;

    const seenMatches = new Set<string>();
    const seenNames = new Map<string, number>();
    const selected: RankedGrammarHint[] = [];
    const ranked = GRAMMAR_PATTERNS
        .flatMap(item => grammarMatches(item, normalized))
        .sort(compareRankedGrammarHints);
    for (const item of ranked) {
        const key = `${item.ruleId}:${item.match}:${item.index}`;
        if (seenMatches.has(key)) continue;
        const count = seenNames.get(item.ruleId) ?? 0;
        if (count >= 2) continue;
        if (selected.some(existing => shouldSuppressOverlappingGrammarHint(existing, item))) continue;
        seenMatches.add(key);
        seenNames.set(item.ruleId, count + 1);
        selected.push(item);
        if (selected.length >= MAX_LOCAL_GRAMMAR_HINTS) break;
    }
    const hints = selected
        .sort(compareGrammarHints)
        .map(({ priority: _priority, ...hint }) => hint);
    cacheGrammarHints(normalized, hints);
    return hints;
}

export function preloadGrammarResources(sentence: string, language: InterfaceLanguage = 'en'): GrammarHint[] {
    const hints = detectGrammarHints(sentence);
    if (language === 'ja' && hints.length) {
        void grammarRuleText(language, hints[0].ruleId).catch(() => undefined);
    }
    return hints;
}

export function preloadJapaneseSentenceTranslation(sentence: string, language: InterfaceLanguage = 'en'): void {
    void translateJapaneseSentence(sentence, language).catch(() => undefined);
}

function cacheGrammarHints(key: string, hints: GrammarHint[]): void {
    if (!key) return;
    grammarHintCache.set(key, hints);
    if (grammarHintCache.size <= GRAMMAR_HINT_CACHE_LIMIT) return;
    const oldest = grammarHintCache.keys().next().value;
    if (typeof oldest === 'string') grammarHintCache.delete(oldest);
}

function compareRankedGrammarHints(a: RankedGrammarHint, b: RankedGrammarHint): number {
    return a.priority - b.priority
        || a.index - b.index
        || b.match.length - a.match.length
        || a.name.localeCompare(b.name);
}

function compareGrammarHints(a: GrammarHint, b: GrammarHint): number {
    return a.index - b.index || a.name.localeCompare(b.name);
}

function shouldSuppressOverlappingGrammarHint(existing: RankedGrammarHint, next: RankedGrammarHint): boolean {
    if (!grammarHintRangesOverlap(existing, next)) return false;
    if (sameGrammarHintLocation(existing, next)) return true;
    if (existing.priority < 40 && next.priority < 40) return false;
    const nextIsLooseEndingOrParticle = next.priority >= 40;
    if (nextIsLooseEndingOrParticle && existing.priority < next.priority) return true;
    const nextEnd = next.index + next.match.length;
    const existingEnd = existing.index + existing.match.length;
    const nextInsideExisting = next.index >= existing.index && nextEnd <= existingEnd;
    return nextInsideExisting && existing.priority <= next.priority && existing.match.length > next.match.length;
}

function sameGrammarHintLocation(existing: GrammarHint, next: GrammarHint): boolean {
    return existing.match === next.match && existing.index === next.index;
}

function grammarHintRangesOverlap(a: GrammarHint, b: GrammarHint): boolean {
    const aEnd = a.index + a.match.length;
    const bEnd = b.index + b.match.length;
    return a.index < bEnd && b.index < aEnd;
}

export function readGrammarPreferences(): GrammarPreferences {
    const fallback: GrammarPreferences = { knownRuleIds: [], showKnown: false };
    try {
        const raw = globalThis.localStorage?.getItem(GRAMMAR_PREFERENCES_KEY);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw) as Partial<GrammarPreferences>;
        return {
            knownRuleIds: Array.isArray(parsed.knownRuleIds)
                ? parsed.knownRuleIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
                : [],
            showKnown: parsed.showKnown === true,
        };
    } catch (error) {
        log.warn('Grammar preference read failed', { error });
        return fallback;
    }
}

export function writeGrammarPreferences(preferences: GrammarPreferences): void {
    try {
        const uniqueKnownRuleIds = Array.from(new Set(preferences.knownRuleIds)).sort();
        globalThis.localStorage?.setItem(GRAMMAR_PREFERENCES_KEY, JSON.stringify({
            knownRuleIds: uniqueKnownRuleIds,
            showKnown: preferences.showKnown,
        }));
    } catch (error) {
        log.warn('Grammar preference write failed', { error });
    }
}

export function setGrammarRuleKnown(ruleId: string, known: boolean): GrammarPreferences {
    const preferences = readGrammarPreferences();
    const knownRuleIds = new Set(preferences.knownRuleIds);
    if (known) knownRuleIds.add(ruleId);
    else knownRuleIds.delete(ruleId);
    const next = { ...preferences, knownRuleIds: Array.from(knownRuleIds) };
    writeGrammarPreferences(next);
    return next;
}

export function setKnownGrammarVisible(showKnown: boolean): GrammarPreferences {
    const next = { ...readGrammarPreferences(), showKnown };
    writeGrammarPreferences(next);
    return next;
}

export async function translateJapaneseSentence(sentence: string, language: InterfaceLanguage = 'en'): Promise<string> {
    const trimmed = sentence.trim();
    if (!trimmed) return '';
    const targetLanguage = translationTargetLanguage(language);
    const cacheKey = `${targetLanguage}:${trimmed}`;
    const cached = translationCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    const inFlight = translationInFlight.get(cacheKey);
    if (inFlight) {
        return inFlight;
    }
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=${targetLanguage}&dt=t&dt=bd&dj=1&q=${encodeURIComponent(trimmed)}`;
    const promise = (async () => {
        const done = log.time('Translate sentence', { sentenceLength: trimmed.length });
        try {
            const json = await requestJson<GoogleTranslateResponse>(url);
            const translated = (json.sentences ?? []).map(item => item.trans ?? '').join('').trim();
            if (!translated) throw new Error('No translation returned.');
            translationCache.set(cacheKey, translated);
            pruneOldestMapEntries(translationCache, TRANSLATION_CACHE_LIMIT);
            log.info('Translation completed', { sentenceLength: trimmed.length, translationLength: translated.length });
            return translated;
        } catch (error) {
            log.warn('Translation failed', { sentenceLength: trimmed.length, error });
            throw error;
        } finally {
            done();
        }
    })();
    translationInFlight.set(cacheKey, promise);
    void promise.then(() => {
        if (translationInFlight.get(cacheKey) === promise) translationInFlight.delete(cacheKey);
    }, () => {
        if (translationInFlight.get(cacheKey) === promise) translationInFlight.delete(cacheKey);
    });
    return promise;
}

function translationTargetLanguage(language: InterfaceLanguage): string {
    return language === 'ja' ? 'ja' : 'en';
}

export async function renderGrammarHints(hints: GrammarHint[], sentence: string, preferences = readGrammarPreferences(), language: InterfaceLanguage = 'en'): Promise<string> {
    if (!hints.length) return '';
    const knownRuleIds = new Set(preferences.knownRuleIds);
    const visibleHints = visibleGrammarHints(hints, knownRuleIds, preferences.showKnown);
    const visibleGroups = groupGrammarHintsByRule(visibleHints);
    const knownCount = countKnownGrammarHints(hints, knownRuleIds);
    return `
        ${renderGrammarSentence(sentence)}
        ${renderGrammarToolbar(visibleGroups.length, knownCount, preferences.showKnown, language)}
        ${await renderGrammarHintList(visibleGroups, knownRuleIds, language)}`;
}

function visibleGrammarHints(hints: GrammarHint[], knownRuleIds: Set<string>, showKnown: boolean): GrammarHint[] {
    return showKnown ? hints : hints.filter(hint => !knownRuleIds.has(hint.ruleId));
}

function countKnownGrammarHints(hints: GrammarHint[], knownRuleIds: Set<string>): number {
    return new Set(hints.filter(hint => knownRuleIds.has(hint.ruleId)).map(hint => hint.ruleId)).size;
}

function groupGrammarHintsByRule(hints: GrammarHint[]): GroupedGrammarHint[] {
    const groups = new Map<string, GroupedGrammarHint>();
    for (const hint of hints) {
        const existing = groups.get(hint.ruleId);
        if (existing) {
            existing.count += 1;
            continue;
        }
        groups.set(hint.ruleId, { hint, count: 1 });
    }
    return Array.from(groups.values());
}

function renderGrammarSentence(sentence: string): string {
    return `
        <div class="jpdb-reader-study-block jpdb-reader-study-sentence-block" data-grammar-sentence>
            <div class="jpdb-reader-study-original jpdb-reader-parseable">${escapeHtml(sentence)}</div>
        </div>`;
}

function renderGrammarToolbar(visibleCount: number, knownCount: number, showKnown: boolean, language: InterfaceLanguage): string {
    const hiddenKnownCount = showKnown ? 0 : knownCount;
    return `
        <div class="jpdb-reader-grammar-toolbar" data-grammar-toolbar>
            <div class="jpdb-reader-grammar-summary">${escapeHtml(grammarSummary(visibleCount, hiddenKnownCount, language))}</div>
            ${renderGrammarKnownVisibilityButton(knownCount, showKnown, language)}
        </div>`;
}

function renderGrammarKnownVisibilityButton(knownCount: number, showKnown: boolean, language: InterfaceLanguage): string {
    if (!knownCount) return '';
    const label = showKnown ? uiText(language, 'grammarHideKnown') : uiText(language, 'grammarShowKnown');
    return `<button class="jpdb-reader-grammar-toggle" type="button" data-action="study-grammar-toggle-known-visibility" aria-pressed="${showKnown ? 'true' : 'false'}">${label}</button>`;
}

async function renderGrammarHintList(visibleGroups: GroupedGrammarHint[], knownRuleIds: Set<string>, language: InterfaceLanguage): Promise<string> {
    if (!visibleGroups.length) return `<div class="jpdb-reader-study-empty">${escapeHtml(uiText(language, 'allDetectedGrammarKnown'))}</div>`;
    const items = await Promise.all(visibleGroups.map(group => renderGrammarHintItem(group, knownRuleIds.has(group.hint.ruleId), language)));
    return `<ol class="jpdb-reader-study-list" data-grammar-list>
        ${items.join('')}
        </ol>`;
}

async function renderGrammarHintItem(group: GroupedGrammarHint, known: boolean, language: InterfaceLanguage): Promise<string> {
    const { hint, count } = group;
    const copy = await grammarHintCopy(hint, language);
    const displayName = grammarDisplayName(hint, language);
    return `
            <li class="jpdb-reader-study-item${known ? ' known' : ''}" data-grammar-rule-id="${escapeHtml(hint.ruleId)}">
                <div class="jpdb-reader-study-name">
                    <span>${escapeHtml(displayName)}</span>
                    <span class="jpdb-reader-grammar-level">${escapeHtml(grammarLevelText(hint.level, language))}</span>
                </div>
                <div class="jpdb-reader-study-body">
                    <div class="jpdb-reader-study-item-head">
                        <div class="jpdb-reader-study-kind">${escapeHtml(copy.kind)}</div>
                        <div class="jpdb-reader-grammar-actions">
                            ${renderGrammarRepeatCount(count)}
                            <button class="jpdb-reader-grammar-known" type="button" data-action="study-grammar-toggle-known" data-grammar-rule-id="${escapeHtml(hint.ruleId)}" data-grammar-known="${known ? 'true' : 'false'}" aria-pressed="${known ? 'true' : 'false'}">${known ? uiText(language, 'grammarReview') : uiText(language, 'grammarKnown')}</button>
                        </div>
                    </div>
                    <div class="jpdb-reader-study-short">${escapeHtml(copy.short)}</div>
                    <details class="jpdb-reader-grammar-more">
                        <summary>${escapeHtml(uiText(language, 'grammarDetails'))}</summary>
                        <div class="jpdb-reader-study-detail">${escapeHtml(copy.detail)}</div>
                        <div class="jpdb-reader-study-match"><span>${escapeHtml(uiText(language, 'grammarFoundIn'))}</span>${escapeHtml(hint.match)}</div>
                        ${renderGrammarHintExamples(hint, language)}
                        ${renderGrammarHintGuide(hint, language)}
                    </details>
                </div>
            </li>`;
}

function renderGrammarRepeatCount(count: number): string {
    return count > 1 ? `<span class="jpdb-reader-grammar-repeat">x${count}</span>` : '';
}

async function grammarHintCopy(hint: GrammarHint, language: InterfaceLanguage): Promise<{ kind: string; short: string; detail: string }> {
    const fallback = { kind: hint.kind, short: hint.short, detail: hint.detail };
    if (language !== 'ja') return fallback;
    const ruleCopy = await grammarRuleText(language, hint.ruleId);
    if (ruleCopy) return ruleCopy;
    const name = grammarDisplayName(hint, language);
    return {
        kind: hint.kind === 'Hanabira grammar' ? uiText(language, 'grammarKindHanabira') : uiText(language, 'grammar'),
        short: interpolateUiText(language, 'grammarGenericShort', { name, match: hint.match }),
        detail: interpolateUiText(language, 'grammarGenericDetail', { name, match: hint.match }),
    };
}

function grammarLevelText(level: GrammarLevel, language: InterfaceLanguage): string {
    return language === 'ja' && level === 'Core' ? uiText(language, 'grammarLevelCore') : level;
}

function grammarDisplayName(hint: GrammarHint, language: InterfaceLanguage): string {
    if (language !== 'ja' || !ENGLISH_TEXT_RE.test(hint.name)) return hint.name;
    if (JAPANESE_TEXT_RE.test(hint.match)) return hint.match;
    return japaneseGrammarText(hint.name) || hint.name;
}

function japaneseGrammarText(value: string): string {
    return (value.match(/[ぁ-んァ-ヶ一-龯々〆ヵヶー〜]+/gu) ?? []).join(' / ');
}

function interpolateUiText(language: InterfaceLanguage, key: UiCopyKey, values: Record<string, string>): string {
    return uiText(language, key).replace(/\{(\w+)}/g, (_, name: string) => values[name] ?? '');
}

function renderGrammarHintExamples(hint: GrammarHint, language: InterfaceLanguage): string {
    const examples = (hint.examples ?? []).slice(0, 2);
    if (!examples.length) return '';
    return `<div class="jpdb-reader-grammar-examples"><span>${escapeHtml(uiText(language, 'grammarExample'))}</span>${examples.map(example => renderGrammarExample(example, language)).join('')}</div>`;
}

function renderGrammarExample(example: GrammarExample, language: InterfaceLanguage): string {
    const english = language === 'ja' || !example.english ? '' : `<div>${escapeHtml(example.english)}</div>`;
    const note = language === 'ja' || !example.note || ENGLISH_TEXT_RE.test(example.note) ? '' : `<div>${escapeHtml(example.note)}</div>`;
    return `<div class="jpdb-reader-grammar-example jpdb-reader-parseable"><div>${escapeHtml(example.japanese)}</div>${english}${note}</div>`;
}

function renderGrammarHintGuide(hint: GrammarHint, language: InterfaceLanguage): string {
    return hint.url ? `<a class="jpdb-reader-study-guide" href="${escapeHtml(hint.url)}" target="_blank" rel="noopener">${escapeHtml(uiText(language, 'grammarGuide'))}</a>` : '';
}

function grammarMatches(item: GrammarPattern, sentence: string): RankedGrammarHint[] {
    return Array.from(sentence.matchAll(item.pattern))
        .map(match => {
            const rawMatch = match[0];
            const learnerFacingMatch = learnerMatch(item.name, rawMatch);
            const learnerOffset = rawMatch.lastIndexOf(learnerFacingMatch);
            const indexOffset = learnerOffset > 0 ? learnerOffset : 0;
            return {
                ruleId: item.ruleId,
                name: item.name,
                level: item.level,
                kind: item.kind,
                short: item.short,
                detail: item.detail,
                url: item.url,
                match: learnerFacingMatch,
                confidence: item.confidence,
                index: (match.index ?? 0) + indexOffset,
                priority: item.priority,
                examples: item.examples,
            };
        })
        .filter(hint => hint.match.length > 0);
}


function grammarSummary(visibleCount: number, hiddenKnownCount: number, language: InterfaceLanguage): string {
    const shown = `${visibleCount} ${uiText(language, 'grammarShown')}`;
    if (hiddenKnownCount) return `${shown} · ${hiddenKnownCount} ${uiText(language, 'grammarKnownHidden')}`;
    return shown;
}

const LEARNER_MATCH_ENDING_NAMES = new Set([
    'たい', 'ない', 'ました', 'ます', 'た', 'よう', 'そう', '方', 'やすい / にくい', 'すぎる',
    'れる / られる', 'させる', 'させられる', 'がち', '気味', 'げ', 'っぽい', 'めく',
]);

const LEARNER_MATCH_HELPER_NAMES = new Set([
    'てください', 'ていただけませんか', 'ないでください', 'させてください', 'てほしい', 'てくれる / てもらう',
    'てしまう', 'てみる', 'ておく', 'ている', 'てある', 'てくる', 'ていく', 'てから',
]);

function learnerMatch(name: string, rawMatch: string): string {
    let match = rawMatch.replace(/^(?:そして|それで|でも|また|しかし|それに|つまり|ただし|だから)/u, '');
    if (LEARNER_MATCH_HELPER_NAMES.has(name)) {
        const afterClauseBoundary = match.replace(/^.*(?:[、。！？!?]|たら|なら|ので|から)/u, '');
        if (afterClauseBoundary) match = afterClauseBoundary;
    }
    if (!LEARNER_MATCH_ENDING_NAMES.has(name)) return match;
    const afterLastParticle = match.replace(/^.*[はがをにへともやの]/u, '');
    return afterLastParticle || match;
}

interface GoogleTranslateResponse {
    sentences?: Array<{ trans?: string }>;
}

function requestJson<T>(url: string): Promise<T> {
    return requestReaderJson(url, {
        timeoutMs: TRANSLATION_TIMEOUT_MS,
        allowDirectCrossOrigin: true,
        allowConfiguredProxy: false,
        allowPublicProxies: false,
        preferFetch: true,
        failureLabel: 'Translation request',
        timeoutLabel: 'Translation timed out.',
    }) as Promise<T>;
}

function pruneOldestMapEntries<TKey, TValue>(cache: Map<TKey, TValue>, limit: number): void {
    while (cache.size > limit) {
        const oldest = cache.keys().next().value as TKey | undefined;
        if (oldest === undefined) break;
        cache.delete(oldest);
    }
}
