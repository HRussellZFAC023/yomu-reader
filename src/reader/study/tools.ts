import { pruneOldestCacheEntries } from '../core/cache-utils';
import { DOCS_BASE_URL } from '../constants';
import { escapeHtml } from '../dom';
import { grammarRuleText, uiText, type UiCopyKey } from '../i18n';
import { Logger } from '../logger';
import { requestJson as requestReaderJson } from '../reader-http';
import {
    renderStudyEmpty,
    renderStudyList,
    renderStudySentenceAudioButton,
    renderStudySentenceBlock,
} from './section-render';
import type { InterfaceLanguage } from '../types';

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
    url: string;
    confidence: GrammarHint['confidence'];
    priority: number;
}

interface GrammarRuleData {
    kind: string;
    short: string;
    detail: string;
    url?: string;
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

export interface LocalGrammarRuleSummary {
    ruleId: string;
    name: string;
    level: GrammarLevel;
    exampleCount: number;
}

const PARTICLE_CHUNK = String.raw`[^はがをにへとでもやのて、。！？!?\s]{1,24}`;
const FORM_CHUNK = String.raw`[^はがをにへとでもやのてで、。！？!?\s]{0,24}`;
const GRAMMAR_PREFERENCES_KEY = 'yomu.grammarPreferences.v1';
const MAX_LOCAL_GRAMMAR_HINTS = 12;
const GRAMMAR_HINT_CACHE_LIMIT = 240;
const TRANSLATION_CACHE_LIMIT = 160;
const TRANSLATION_TIMEOUT_MS = 5000;
const GRAMMAR_RULE_DATA_TIMEOUT_MS = 15000;
const EN_GRAMMAR_RULE_DATA_URL = `${DOCS_BASE_URL}data/en-grammar-rule-copy.json`;
const ENGLISH_TEXT_RE = /[A-Za-z]{3,}/u;
const JAPANESE_TEXT_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;

function gp(
    ruleId: string,
    level: GrammarLevel,
    name: string,
    source: string,
    url = '',
    confidence: GrammarHint['confidence'] = 'medium',
    priority = 30,
): GrammarPattern {
    return { ruleId, level, pattern: new RegExp(source, 'gu'), name, url, confidence, priority };
}

function grammarPatternFromRow(row: string): GrammarPattern {
    const [ruleId, level, name, source, priority, confidence = 'm', url = ''] = row.split('\t');
    return gp(
        ruleId,
        level as GrammarLevel,
        name,
        source.replaceAll('{F}', FORM_CHUNK).replaceAll('{P}', PARTICLE_CHUNK),
        expandGrammarGuideUrl(url),
        confidence === 'h' ? 'high' : 'medium',
        parseInt(priority, 36),
    );
}

function expandGrammarGuideUrl(url: string): string {
    if (!url) return '';
    return url
        .replace('@g/', 'https://www.tofugu.com/japanese-grammar/')
        .replace('@j/', 'https://www.tofugu.com/japanese/');
}

const GRAMMAR_PATTERN_DATA = String.raw`
potential-koto-ga-dekiru	N4	ことができる	{F}ことができ(?:る|ます|ない|ません|た|ました|なかった|ませんでした)?	5	h	@g/koto-ga-dekiru/
potential-dekiru	N4	できる	{P}でき(?:る|ます|た|ました|ない|ません|なかった|ませんでした)	8	h
obligation-nakereba-naranai	N4	なければならない	{F}(?:なければならない|なければなりません|なくてはならない|なくてはなりません|なくてはいけない|なくてはいけません|なければいけない|なければいけません|なきゃ(?:いけない|だめ)?|なくちゃ(?:いけない|だめ)?|ないといけない|ねばならない)	4	h	@g/nakereba-naranai/
permission-not-required-nakutemo-ii	N5	なくてもいい	{F}なくても(?:いい|よい|大丈夫)(?:です)?	4	h
prohibition-tewa-ikenai	N4	てはいけない	{F}(?:(?:[てで]は|ちゃ|じゃ)いけ(?:ない|ません|なかった|ませんでした)|(?:[てで]は|ちゃ|じゃ)なら(?:ない|ません)|(?:[てで]は|ちゃ|じゃ)だめ(?:だ|です)?)	5	h	@g/tewa-ikenai/
permission-temo-ii	N5	てもいい	{F}[てで]も(?:いい|よい|よかった|よくない|よくありません|大丈夫(?:です)?|かまわない|かまいません|構わない|構いません)(?:です)?	5	h	@g/temoii/
request-te-kudasai	N5	てください	{F}[てで]ください(?:ませんか)?	6	h
polite-request-te-itadakemasen-ka	N4	ていただけませんか	{F}[てで](?:いただけませんか|くださいませんか)	6	h
request-naide-kudasai	N5	ないでください	{F}ないでください	5	h
advice-hou-ga-ii	N4	方がいい	{F}ほうが(?:いい|よい)(?:です)?	6	h
command-nasai	N4	なさい	{F}なさい	6	h
experience-ta-koto-ga-aru	N4	たことがある	{F}たことが(?:あ(?:る|ります|った|りました|りません|りませんでした)|ない|なかった|ありません|ありませんでした)	6	h	@g/ta-koto-ga-aru/
completion-te-shimau	N4	てしまう	(?:{F}[てで]しま(?:う|います|った|いました|わない|いません|わなかった|いませんでした)|{F}(?:ちゃう|ちゃいます|ちゃった|ちゃいました|ちゃわない|ちゃいません|ちゃわなかった|ちゃいませんでした|じゃう|じゃいます|じゃった|じゃいました|じゃわない|じゃいません|じゃわなかった|じゃいませんでした))	6	h	@g/te-shimau/
attempt-te-miru	N4	てみる	{F}[てで]み(?:る|ます|た|ました|たい|ない|ません|なかった|ませんでした)	6	h	@g/te-miru/
preparation-te-oku	N4	ておく	(?:{F}[てで]お(?:く|きます|いた|きました|かない|きません|かなかった|きませんでした)|{F}(?:とく|ときます|といた|ときました|とかない|ときません|とかなかった|ときませんでした|どく|どきます|どいた|どきました|どかない|どきません|どかなかった|どきませんでした))	6	h	@g/teoku/
desire-other-te-hoshii	N4	てほしい	{F}[てで]ほし(?:い|いです|かった|かったです|くない|くありません|くなかった|くありませんでした)	7	h
benefactive-te-kureru-morau	N4	てくれる / てもらう	{F}[てで](?:くれ(?:る|ます|た|ました|ない|ません|なかった|ませんでした)|くださ(?:る|います|った|いました|らない|いません|らなかった|いませんでした)|あげ(?:る|ます|た|ました|ない|ません|なかった|ませんでした)|や(?:る|ります|った|りました|らない|りません|らなかった|りませんでした)|もら(?:う|います|った|いました|わない|いません|わなかった|いませんでした|え(?:る|ます|た|ました|ない|ません|なかった|ませんでした))|いただ(?:く|きます|いた|きました|かない|きません|かなかった|きませんでした|け(?:る|ます|た|ました|ない|ません|なかった|ませんでした)))	8	m	@g/te-kureru/
change-you-ni-naru	N4	ようになる	{F}ようにな(?:る|ります|った|りました|らない|りません|らなかった|りませんでした|っている|っています|っていない|っていません)	8	h	@g/you-ni-naru/
habit-you-ni-suru	N4	ようにする	{F}ように(?:す(?:る|ます|た|ました)|し(?:ます|た|ました|ている|ています|ていない|ていません|ない|ません|なかった|ませんでした))	8	h	@g/you-ni-suru/
verb-suru	N5	する	(?:{P}を)?{P}(?:す(?:る|れば|るな|るの|ること|るため|る前|る後)|し(?:ます|ました|ません|ませんでした|た|て|ない|なかった|なければ|よう|ろ)|され(?:る|ます|た|ました)|させ(?:る|ます|た|ました)|でき(?:る|ます|た|ました|ない|ません))	1d	h	@g/suru/
choice-ni-suru	N4	にする	{P}に(?:す(?:る|ます|た|ました)|し(?:ます|た|ました|ている|ています|ない|ません|なかった|ませんでした))	a	h
change-ku-suru	N4	くする	{P}く(?:す(?:る|ます|た|ました)|し(?:ます|た|ました|ている|ています|ない|ません|なかった|ませんでした))	a	h
change-ku-naru-ni-naru	N5	くなる / になる	(?:{P}くな(?:る|ります|った|りました|らない|りません|らなかった|りませんでした|っている|っています)|{P}(?<!よう)にな(?:る|ります|った|りました|らない|りません|らなかった|りませんでした|っている|っています)|{P}とな(?:る|ります|った|りました))	a	h
copula-desu-da	N5	です / だ	(?:です|でした|だ|だった)(?=$|[、。！？!?よねな])	17	h	@g/desu/
negative-copula-dewa-nai	N5	ではない / じゃない	(?:では|じゃ)(?:ない|ありません|なかった|ありませんでした)	c	h
formal-copula-de-aru	N3	である	であ(?:る|ります|った|りました)	k	h
voice-causative-passive	N3	させられる	{F}(?:させられ(?:る|ます|た|ました|ない|ません|なかった|ませんでした)|[かがさざただなばまらわ]せられ(?:る|ます|た|ました|ない|ません|なかった|ませんでした)|[かがさざただなばまらわ]され(?:る|ます|た|ました|ない|ません|なかった|ませんでした))	8	m	@g/verb-causative-form-saseru/
voice-causative	N4	させる	{F}(?:させ(?:る|ます|た|ました|ない|ません|なかった|ませんでした)|[かがさざただなばまらわ]せ(?:る|ます|た|ました|ない|ません|なかった|ませんでした))	9	m	@g/verb-causative-form-saseru/
voice-passive-potential	N4	れる / られる	{F}(?:られ(?:る|ます|た|ました|ない|ません|なかった|ませんでした)|[かがさざただなばまわ]れ(?:る|ます|た|ました|ない|ません|なかった|ませんでした))	9	m	@g/verb-passive-form-rareru/
evidence-rashii-mitai	N4	らしい / みたい	(?:{F}らし(?:い|かった|くない|く)|{F}みたい(?:だ|です|でした|じゃない|ではない|に|な)?(?=$|[、。！？!?ねよ]))	9	m	@g/rashii/
modality-kamoshirenai	N4	かもしれない	(?:かもしれない|かもしれません|かも)	9	h	@g/kamoshirenai/
modality-deshou-darou	N5	でしょう / だろう	(?:でしょう|でしょうか|だろう|だろうか)	a	h	@g/deshou/
quotation-to-omou	N4	と思う	{F}と思(?:う|います|った|いました|っている|っています|わない|いません|わなかった|いませんでした)	a	h	@g/to-omou/
attempt-you-to-suru	N3	ようとする	{F}ようと(?:す(?:る|ます|た|ました|ている|ています)|し(?:ます|た|ました|ている|ています|ない|ません|なかった|ませんでした))	b	m	@g/verb-volitional-form-you/
plan-tsumori-yotei	N4	つもり / 予定	{F}(?:つもり|予定)(?:だ|です|だった|でした)?	c	m	@g/tsumori/
expectation-hazu	N4	はず	{F}はず(?:だ|です|だった|でした|がない|はない)?	c	h	@g/hazu/
reasoning-wake	N3	わけ	{F}わけ(?:ではない|じゃない|がない|にはいかない|だ|です)?	o	m	@g/wake/
reasoning-wake-dewa-nai	N3	わけではない	{F}わけ(?:では|じゃ)(?:ない|ありません)	b	h
impossibility-wake-ga-nai	N3	わけがない	{F}わけが(?:ない|ありません)	b	h
constraint-wake-ni-wa-ikanai	N3	わけにはいかない	{F}わけにはい(?:かない|きません)	b	h
purpose-tame-ni	N4	ために	{F}ために	c	h	@g/tame-ni/
purpose-you-ni	N4	ように	{F}ように	s	m	@g/you-ni/
timing-tokoro	N4	ところ	{F}ところ(?:だ|です|だった|でした|で|に)?	e	m	@j/tokoro-bakari/
simultaneous-nagara	N4	ながら	{F}(?<!残念)ながら	e	h	@g/nagara/
state-mama	N3	まま	{F}まま	f	m	@g/mama/
list-tari	N5	たり	(?:[^、。！？!?\\s]{1,30}?[だた]り[^、。！？!?\\s]{1,30}?[だた]り(?:する|します|した|しました|しない|しません|しなかった|しませんでした)?|{F}[だた]り(?:する|します|した|しました|しない|しません|しなかった|しませんでした))	g	m	@g/tari/
limitation-bakari	N4	ばかり	{F}ばかり	g	m	@j/tokoro-bakari/
recent-ta-bakari	N4	たばかり	{F}たばかり(?:だ|です|だった|でした)?	c	h	@j/tokoro-bakari/
limitation-dake-shika	N5	だけ / しか	{F}(?:だけ|しか)	i	m	@g/dake/
degree-hodo-kurai	N4	ほど / くらい	{F}(?:ほど|くらい|ぐらい)	i	m	@g/hodo/
role-toshite	N3	として	{F}として	i	h
relation-ni-yotte	N3	によって	{F}によ(?:って|る)	i
topic-ni-tsuite	N3	について	{F}について	i	h
target-ni-taishite	N3	に対して	{F}に対(?:して|する|し)	i
concession-ni-mo-kakawarazu	N2	にもかかわらず	{F}にもかかわらず	i	h
concession-kuse-ni	N3	くせに	{F}くせに	i
suffix-tachi	N5	たち / 達	{P}(?:たち|(?<!友)達)	1e
particle-wa	N5	は	{P}は(?!ず)	1j	h	@g/particle-wa/
particle-ga	N5	が	{P}が	1j	h	@g/particle-ga/
particle-wo	N5	を	{P}を	1j	h	@g/particle-wo/
particle-de	N5	で	{P}(?<![まん])で(?!き|す|し)	1j	m	@g/particle-de/
particle-ni	N5	に	{P}に(?!なる)	1j	m	@g/particle-ni/
particle-e	N5	へ	{P}へ	1j
particle-to	N5	と	{P}(?<![っッこコ])と(?!して|いう|思)	1j	m	@g/particle-to/
particle-no	N5	の	{P}の	1j	m	@g/particle-no-noun-modifier/
particle-mo	N5	も	{P}も	1j
particle-ya	N5	や	{P}や	1j
aspect-te-iru	N5	ている	{F}[てで](?:いる|います|いた|いました|いない|いません|いなかった|いませんでした|る|た)	14	h	@g/verb-continuous-form-teiru/
aspect-te-aru	N4	てある	{F}[てで]あ(?:る|ります|った|りました|らない|りません|らなかった|りませんでした)	c	h
aspect-te-kuru	N4	てくる	{F}[てで](?:くる|きます|きた|きました|こない|きません|こなかった|きませんでした)	k
aspect-te-iku	N4	ていく	{F}[てで]い(?:く|きます|った|きました|かない|きません|かなかった|きませんでした)	k
desire-tai	N5	たい	{F}(?:たい(?:です)?|たく(?:ない|ありません|なかった|ありませんでした)|たかった(?:です)?)	18	h	@g/tai-form/
ease-yasui-nikui	N4	やすい / にくい	{F}(?:やすい|にくい|づらい)	m	h
excess-sugiru	N4	すぎる	{F}すぎ(?:る|ます|た|ました|て|ない|ません|なかった|ませんでした|だ|です)	m	h
method-kata	N5	方	{F}方	1c
negative-nai	N5	ない	{F}(?:ない|ません|なかった|ませんでした)	1a	m	@g/verb-negative-nai-form/
polite-past-mashita	N5	ました	{F}ました	18	h	@g/masu/
polite-masu	N5	ます	{F}ます	19	m	@g/masu/
conditional-tara	N4	たら	{F}たら	h	h	@g/conditional-form-tara/
conditional-ba	N4	ば	{F}(?:えば|ければ)	i	h	@g/verb-conditional-form-ba/
conditional-ba-ii	N4	ばいい / ばよかった	{F}(?:えば|ければ|[えけげせてねべめれ]ば)(?:いい|よい|よかった)(?:です)?	d
conditional-nara	N4	なら	{F}なら(?:ば)?	i	h
conditional-to	N4	と	{F}と(?=、)	12
concession-temo-demo	N4	ても / でも	{F}[てで]も	s	m	@g/temo/
reason-node	N4	ので	(?:なので|ので)(?!は)	m	h	@g/conjunctive-particle-node/
reason-kara	N5	から	{F}から	z	m	@g/particle-kara/
appearance-sou	N4	そう	{F}そう(?:に|な)?	u	m	@g/verb-sou/
hearsay-sou-da	N4	そうだ	{F}(?:る|い|だ|た|ない)そう(?:だ|です)	j
volitional-you	N5	よう	{F}(?:よう|ろう)	19	m	@g/verb-volitional-form-you/
concession-noni	N4	のに	のに	k	h	@g/conjunctive-particle-noni/
nominalizer-koto	N5	こと	こと(?:が|を|に|は|も)	16	m	@g/koto/
plain-past-ta	N5	た	(?:{F}(?:かった|だった|った|いた|いだ|(?<!で)した|んだ|[きぎしじちにびみりえけげせてねべめれ]た|[来見寝出]た)|(?<!で)した)(?![いらり])	1b
sequence-te-kara	N5	てから	{F}[てで]から	d	h
time-mae-ni	N5	前に	{F}前に	m
time-ato-de-ni	N5	後で / 後に	{F}後(?:で|に)	m
time-toki	N5	とき	{F}とき	m
limit-made-made-ni	N5	まで / までに	{F}まで(?:に)?	s
comparison-yori-nohou	N5	より / の方が	{F}(?:より|のほうが|の方が)	u
superlative-ichiban	N5	一番	一番	m	h
question-ka-douka	N4	かどうか	{F}かどうか	d	h
purpose-masu-stem-ni-iku	N5	に行く / に来る	{F}[いきぎしじちにびみりえけげせてねべめ見寝出]に(?:行(?:く|きます|った|きました)|来(?:る|ます|た|ました)|帰(?:る|ります|った|りました))	e	h
nominalizer-no	N5	の	{F}の(?=[はがをにも])	i	m	@g/no-nominalizer/
quotation-to-iu	N4	という	{F}という	e
casual-tte	N4	って	{F}って(?=(?:言|聞|思|呼|書|いう|こと|、|。|？|!|！|$))	o
explanation-n-desu	N5	んです / のです	{F}(?:ん|の)です	m
explanation-no-da	N4	のだ / んだ	{F}(?:の|ん)(?:だ|だった|じゃない|ではない)	m
existence-ga-aru-iru	N5	がある / がいる	{P}が(?:あ(?:る|ります|った|りました|らない|りません|らなかった|りませんでした)|い(?:る|ます|た|ました|ない|ません|なかった|ませんでした))	o	h
skill-ga-suki-jouzu-heta	N5	が好き / が上手 / が下手	{P}が(?:好き|すき|上手|じょうず|下手|へた)(?:だ|です|ではない|じゃない)?	i	h
skill-no-ga-suki	N5	のが好き	{F}のが(?:好き|すき|嫌い|きらい|上手|じょうず|下手|へた|得意|苦手)(?:だ|です|ではない|じゃない)?	g	h
invitation-mashou	N5	ましょう / ましょうか	{F}ましょう(?:か)?	c	h
invitation-masen-ka	N5	ませんか	{F}ませんか	b	h
relief-te-yokatta	N4	てよかった	{F}[てで]よかった(?:です)?	a	h
without-zuni	N4	ずに	{F}ずに	c	h
without-naide	N4	ないで	{F}ないで(?!ください)	g	h
apology-te-sumimasen	N4	てすみません	{F}[てで]すみません	a	h
necessity-ga-hitsuyou	N4	が必要	{P}が必要(?:だ|です|だった|でした)?	f	h
sensation-ga-suru	N4	がする	{P}が(?:す(?:る|ます|た|ました)|し(?:ます|た|ました|ている|ています|ない|ません|なかった|ませんでした))	d	h
case-baai	N4	場合	{F}場合(?:は|には)?	g	h
examples-nado	N4	など	{P}など	g	h
examples-toka	N4	とか	{F}とか(?:{F}とか)?	i
hearsay-to-iwarete-iru	N4	と言われている	{F}と言われてい(?:る|ます|ない|ません)|{F}と言われ(?:た|ました)	a	h
hearsay-to-kiita	N4	と聞いた	{F}と聞(?:いた|きました|いている|いています)	c	h
similarity-you-da	N4	ようだ / ような	{F}よう(?:だ|です|な|に)	t
permission-sasete-kudasai	N4	させてください	{F}させてください	5	h
decision-koto-ni-suru	N4	ことにする	{F}ことに(?:す(?:る|ます|た|ました|ている|ています)|し(?:ます|た|ました|ている|ています|ていない|ていません|ない|ません|なかった|ませんでした))	9	h
arrangement-koto-ni-naru	N4	ことになる	{F}ことにな(?:る|ります|った|りました|らない|りません|らなかった|りませんでした|っている|っています)	9	h
honorific-o-go-ni-naru-suru	N3	お〜になる / お〜する	(?:お|ご){F}(?:になる|になります|する|します|いたす|いたします|ください)	8
polite-gozaimasu	N5	ございます	{F}ござい(?:ます|ました|ません|ませんでした)	u
advice-beki	N3	べき	{F}べき(?:だ|です|ではない|じゃない)?	f	h
time-aida-aida-ni	N4	間 / 間に	{F}間(?:に|は)?	m
time-uchi-ni	N3	うちに	{F}うちに	e
time-saichuu-ni	N3	最中に	{F}最中に	g	h
repetition-tabi-ni	N3	たびに	{F}たびに	e	h
incidental-tsuide-ni	N3	ついでに	{F}ついでに	e
phase-compound-verb	N4	始める / 続ける / 終わる	{F}(?:(?:始め|続け)(?:る|ます|た|ました|ている|ています|ていない|ていません|ない|ません|なかった|ませんでした)|(?:出し|終わ)(?:る|ます|た|ました))	i
state-ppanashi	N3	っぱなし	{F}っぱなし	e	h
covered-darake	N3	だらけ	{F}だらけ	f	h
fresh-tate	N3	たて	{F}たて	i
elapsed-buri-ni	N3	ぶりに	{F}ぶりに	e	h
interval-goto-ni	N3	ごとに	{F}ごとに	e	h
interval-oki-ni	N3	おきに	{F}おきに	f	h
emphasis-kara-koso	N3	からこそ	{F}からこそ	c	h
source-ni-yoru-to	N3	によると / によれば	{F}によ(?:ると|れば)	c	h
topic-ni-kansuru	N3	に関する	{F}に関する	d	h
context-ni-okeru	N3	における	{F}における	d	h
standard-ni-shite-wa	N3	にしては	{F}にしては	e	h
simultaneous-to-douji-ni	N3	と同時に	{F}と同時に	c	h
supposition-to-shitara	N3	としたら / とすれば	{F}と(?:したら|すれば|すると)	d	h
almost-tokoro-datta	N3	ところだった	{F}ところ(?:だった|でした)	c	h
nonlimiting-wa-mochiron	N3	はもちろん	{F}はもちろん	e	h
pretend-furi-wo-suru	N3	ふりをする	{F}ふりを(?:す(?:る|ます|た|ました)|し(?:ます|た|ました|ている|ています))	c	h
instant-ta-totan-ni	N3	たとたんに	{F}たとたん(?:に)?	c	h
difficulty-gatai	N3	がたい	{F}がたい	i	h
only-shika-nai	N3	しかない	{F}しか(?:ない|ありません|なかった|ありませんでした)	c	h
emphasis-sae	N3	さえ / でさえ	[^、。！？!?\s]{1,24}(?:で)?さえ	i
emphasis-koso	N3	こそ	{P}こそ	i
try-te-goran	N3	てごらん	{F}[てで]ごらん	d	h
cause-sei-okage-de	N3	せいで / おかげで	{F}(?:せい|おかげ)で	e	h
manner-toori	N3	とおり	{F}(?:とおり|通り)(?:に|だ|です)?	g	h
certainty-ni-chigai-nai	N3	に違いない	{F}に違い(?:ない|ありません)	f	h
certainty-ni-kimatte-iru	N3	に決まっている	{F}に決まってい(?:る|ます)	f	h
qualification-to-wa-kagiranai	N3	とは限らない	{F}とは限(?:らない|りません)	f	h
contrast-ippou-de	N3	一方で	{F}一方(?:で)?	g
contrast-hanmen	N3	反面	{F}反面	g
substitution-kawari-ni	N3	かわりに	{F}かわりに	g
topic-ni-kanshite	N3	に関して	{F}に関して	h	h
comparison-ni-kurabete	N3	に比べて	{F}に比べて	h	h
basis-ni-motozuite	N3	に基づいて	{F}に基づいて	h	h
following-ni-sotte	N3	に沿って	{F}に沿って	h
following-change-ni-shitagatte	N3	に従って	{F}に従って	h
change-ni-tsurete	N3	につれて	{F}につれて	h
together-to-tomo-ni	N3	とともに	{F}とともに	h
context-ni-oite	N3	において	{F}において	h	h
means-wo-tsuujite-tooshite	N3	を通じて / を通して	{F}を通(?:じて|して)	h
representative-wo-hajime	N3	をはじめ	{F}をはじめ	h
limit-ni-kagiru-kagirazu	N3	に限る / に限らず	{F}に限(?:る|ります|らない|らず|って)	h
suffix-gachi	N3	がち	{F}がち	o
suffix-gimi	N3	気味	{F}気味	o
suffix-ge	N3	げ	{F}げ	o
suffix-ppoi	N3	っぽい	{F}っぽい	o
negative-youni-nai	N3	ようがない	{F}ようが(?:ない|ありません)	g	h
impossible-kkonai	N3	っこない	{F}っこない	i
condition-kara-ni-wa	N2	からには	{F}からには	c	h
qualification-kara-to-itte	N2	からといって	{F}からといって	c	h
condition-nai-kagiri	N2	ない限り	{F}ない限り	c	h
condition-ijou-wa	N2	以上は	{F}以上は	b	h
condition-ue-wa	N2	上は	{F}上は	c	h
sequence-ue-de	N2	上で	{F}上で	d	h
addition-ue-ni	N2	上に	{F}上に	d	h
viewpoint-kara-miru-to	N2	から見ると / からすると	{F}から(?:見ると|見れば|すると|すれば|言うと|言えば)	g
starting-kara-shite	N2	からして	{F}からして	g
concession-ni-shitemo-toshitemo	N2	にしても / としても	{F}(?:にしても|としても)	e	h
concession-ni-shiro-ni-seyo	N2	にしろ / にせよ	{F}に(?:しろ|せよ)	e	h
after-all-ageku	N2	あげく	{F}あげく(?:に)?	d	h
after-effort-sue-ni	N2	末に	{F}末に	d	h
only-ni-suginai	N2	にすぎない	{F}にすぎ(?:ない|ません)	e	h
essence-ni-hoka-naranai	N2	にほかならない	{F}にほかならない	e	h
necessity-zaru-wo-enai	N2	ざるを得ない	{F}ざるを得(?:ない|ません)	a	h
compulsion-zu-ni-wa-irarenai	N2	ずにはいられない	{F}(?:ずには|ないでは)いられ(?:ない|ません|なかった|ませんでした)	a	h
possibility-eru-enai	N2	得る / 得ない	{F}得(?:る|ます|た|ました|ない|ません|なかった|ませんでした)	k
risk-kanenai	N2	かねない	{F}かね(?:ない|ません)	e	h
difficulty-kaneru	N2	かねる	{F}かね(?:る|ます|た|ました)	e	h
emotion-te-naranai	N2	てならない	{F}[てで]ならない	e
emotion-te-tamaranai	N2	てたまらない	{F}[てで]たまらない	e
emotion-te-shouganai	N2	てしょうがない	{F}[てで](?:しょうがない|仕方がない)	e
timing-shidai	N2	次第	{F}次第	g
time-sai-ni	N2	際に	{F}際に	g	h
occasion-ni-atatte	N2	にあたって	{F}にあたって	g	h
occasion-ni-saishite	N2	に際して	{F}に際して	g	h
prior-ni-sakidatte	N2	に先立って	{F}に先立って	g	h
trigger-wo-kikkake-ni	N2	をきっかけに	{F}をきっかけに	g	h
trigger-wo-keiki-ni	N2	を契機に	{F}を契機に	g
span-ni-watatte	N2	にわたって	{F}にわたって	h	h
accompany-ni-tomonatte	N2	に伴って	{F}に伴って	h	h
response-ni-oujite	N2	に応じて	{F}に応じて	h
basis-wo-fumaete	N2	を踏まえて	{F}を踏まえて	h	h
merit-dake-atte	N2	だけあって	{F}だけあって	g
because-dake-ni	N2	だけに	{F}だけに	g
concession-youga-maiga	N1	ようが / まいが	{F}(?:ろうが|ようが){F}まいが	8	h
concession-nagara-mo	N2	ながらも	{F}ながらも	g
continuation-tsutsu	N2	つつ / つつある	{F}つつ(?:ある)?	i
cause-bakari-ni	N2	ばかりに	{F}ばかりに	f	h
contrast-dokoro-ka	N2	どころか	{F}どころか	f	h
impossible-dokoro-dewa-nai	N2	どころではない	{F}どころではない	f	h
nonlimiting-dake-denaku	N3	だけでなく	{F}だけでなく	k	h
regardless-ni-kakawarazu	N2	にかかわらず	{F}にかかわらず	g	h
contrary-ni-hanshite	N2	に反して	{F}に反して	g	h
addition-ni-kuwaete	N2	に加えて	{F}に加えて	g	h
target-ni-kotaete	N2	に応えて	{F}に(?:応|こた)えて	h
center-wo-chuushin-ni	N2	を中心に	{F}を中心に	h	h
regardless-wo-toyazu	N2	を問わず	{F}を問わず	g	h
topic-wo-megutte	N2	をめぐって	{F}をめぐって	g	h
direction-muke-muki	N3	向け / 向き	{F}向(?:け|き)	m
relative-wari-ni	N2	わりに	{F}わりに	i
memory-kke	N2	っけ	{F}っけ	s
quote-to-iu-yori	N2	というより	{F}というより	i
example-to-itta	N2	といった	{F}といった(?=[^、。！？!?\\s])	k
topic-to-ieba	N2	といえば	{F}といえば	k
thing-mono-da	N2	ものだ	{F}もの(?:だ|です)	o
cause-mono-dakara	N2	ものだから	{F}ものだから	g
concession-mono-no	N2	ものの	{F}ものの	g	h
advice-koto-da	N2	ことだ	{F}こと(?:だ|です)	m
unnecessary-koto-wa-nai	N2	ことはない	{F}ことは(?:ない|ありません)	e	h
double-negative-nai-koto-wa-nai	N2	ないことはない	{F}ないことは(?:ない|ありません)	d	h
explanation-to-iu-koto-da	N2	ということだ	{F}ということ(?:だ|です)	g
nature-to-iu-mono-da	N2	というものだ	{F}というもの(?:だ|です)	g
not-nature-to-iu-mono-dewa-nai	N2	というものではない	{F}というものでは(?:ない|ありません)	f
wish-nai-mono-ka	N2	ないものか	{F}ないものか	g
instant-ga-hayai-ka	N1	が早いか	{F}が早いか	8	h
instant-ya-inaya	N1	や否や	{F}や否や	8	h
instant-nari	N1	なり	{F}なり	c
repetition-soba-kara	N1	そばから	{F}そばから	a	h
unexpected-ka-to-omoi-kiya	N1	かと思いきや	{F}かと思いきや	a	h
incidental-katagata	N1	かたがた	{F}かたがた	e
incidental-gatera	N1	がてら	{F}がてら	e
starting-wo-kawakiri-ni	N1	を皮切りに	{F}を皮切りに	e	h
endpoint-wo-kagiri-ni	N1	を限りに	{F}を限りに	e	h
means-wo-motte	N1	をもって	{F}をもって	e	h
turning-wo-sakai-ni	N1	を境に	{F}を境に	f
range-ni-itaru-made	N1	に至るまで	{F}に至るまで	e	h
stage-ni-itatte	N1	に至って	{F}に至って(?:は|も)?	f
context-ni-atte	N1	にあって	{F}にあって	g
standard-ni-sokushite	N1	に即して	{F}に即して	f	h
exclusive-wo-oite	N1	をおいて	{F}をおいて	d	h
defiance-wo-mono-to-mo-sezu	N1	をものともせず	{F}をものともせず	c	h
forced-wo-yogi-naku-sareru	N1	を余儀なくされる	{F}を余儀なくされ(?:る|ます|た|ました)	a	h
force-wo-yogi-naku-saseru	N1	を余儀なくさせる	{F}を余儀なくさせ(?:る|ます|た|ました)	a	h
emotion-ni-taenai	N1	に堪えない	{F}に堪え(?:ない|ません)	e
reluctance-ni-shinobinai	N1	に忍びない	{F}に忍びない	d	h
easy-inference-ni-katagunai	N1	に難くない	{F}に難くない	d	h
worthy-ni-ataru	N1	に値する	{F}に値する	d	h
sufficient-ni-taru	N1	に足る	{F}に足る	d
utmost-no-itari	N1	の至り	{F}の至り	g
extreme-kiwamaru-kiwamarinai	N1	極まる / 極まりない	{F}(?:極まる|極まりない)	g
deep-wish-te-yamanai	N1	てやまない	{F}[てで]や(?:まない|みません)	c	h
since-te-kara-to-iu-mono	N1	てからというもの	{F}[てで]からというもの	a	h
consequence-zu-ni-wa-okanai	N1	ずにはおかない	{F}(?:ずには|ないでは)おかない	a	h
consequence-zu-ni-wa-sumanai	N1	ずにはすまない	{F}(?:ずには|ないでは)すまない	a	h
prohibition-bekarazu	N1	べからず	{F}べからず	c	h
improper-majiki	N1	まじき	{F}まじき	c	h
role-taru-mono	N1	たるもの	{F}たるもの	c	h
surprise-tomo-arou-mono-ga	N1	ともあろうものが	{F}ともあろうものが	c	h
stage-tomo-naru-to	N1	ともなると	{F}ともなると	e
any-de-are	N1	であれ	{F}であれ	g
pair-to-ii-to-ii	N1	といい	[^、。！？!?\\s]{1,24}といい[^、。！？!?\\s]{1,24}といい	i
concession-to-wa-ie	N1	とはいえ	{F}とはいえ	e	h
without-nakushite	N1	なくして	{F}なくして	d	h
basis-atte-no	N1	あっての	{F}あっての	d
unique-nara-dewa	N1	ならでは	{F}ならでは	d	h
covered-mamire	N1	まみれ	{F}まみれ	k
full-zukume	N1	ずくめ	{F}ずくめ	k
depending-ikan	N1	いかん	{F}いかん(?:だ|で|によって|にかかわらず)?	g
result-shimatsu-da	N1	始末だ	{F}始末(?:だ|です)	i
rhetorical-denakute-nandarou	N1	でなくてなんだろう	{F}でなくてなんだろう	i
extreme-to-ittara-nai	N1	といったらない	{F}といったらない	i
extreme-tara-aryashinai	N1	たらありゃしない	{F}たらありゃしない	i
best-ni-koshita-koto-wa-nai	N2	に越したことはない	{F}に越したことは(?:ない|ありません)	e	h
excess-ni-mo-hodo-ga-aru	N1	にもほどがある	{F}にもほどがある	e	h
emphatic-no-nanno	N1	のなんの	{F}のなんの	m
minimal-tari-tomo	N1	たりとも	{F}たりとも	e	h
minimal-dani	N1	だに	{F}だに	k
minimal-sura	N1	すら	{F}すら	k
comparison-gotoki	N1	ごとき	{F}ごとき	k
suffix-meku	N1	めく	{F}め(?:く|いて|き)	k
unnecessary-made-mo-nai	N1	までもない	{F}までもない	e	h
unnecessary-ni-wa-oyobanai	N1	には及ばない	{F}には及(?:ばない|びません)	g
situation-tokoro-wo	N1	ところを	{F}ところを	e	h
`;

const GRAMMAR_PATTERNS: GrammarPattern[] = GRAMMAR_PATTERN_DATA.trim().split('\n').map(grammarPatternFromRow);

const GRAMMAR_RULE_EXAMPLES: Record<string, GrammarExample[]> = {
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

const translationCache = new Map<string, string>();
const translationInFlight = new Map<string, Promise<string>>();
const grammarHintCache = new Map<string, GrammarHint[]>();
let grammarRuleDataPromise: Promise<Record<string, GrammarRuleData>> | undefined;

export function listLocalGrammarRuleExamples(): LocalGrammarRuleExample[] {
    return GRAMMAR_PATTERNS.flatMap(rule => (GRAMMAR_RULE_EXAMPLES[rule.ruleId] ?? []).map(example => ({
        ruleId: rule.ruleId,
        name: rule.name,
        level: rule.level,
        example,
    })));
}

export function listLocalGrammarRules(): LocalGrammarRuleSummary[] {
    return GRAMMAR_PATTERNS.map(rule => ({
        ruleId: rule.ruleId,
        name: rule.name,
        level: rule.level,
        exampleCount: GRAMMAR_RULE_EXAMPLES[rule.ruleId]?.length ?? 0,
    }));
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
    if (hints.length) void loadGrammarRuleData().catch(() => undefined);
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
    if (shouldKeepOverlappingGrammarHint(existing, next)) return false;
    return shouldSuppressLooseGrammarHint(existing, next)
        || shouldSuppressContainedGrammarHint(existing, next);
}

function sameGrammarHintLocation(existing: GrammarHint, next: GrammarHint): boolean {
    return existing.match === next.match && existing.index === next.index;
}

function grammarHintRangesOverlap(a: GrammarHint, b: GrammarHint): boolean {
    const aEnd = a.index + a.match.length;
    const bEnd = b.index + b.match.length;
    return a.index < bEnd && b.index < aEnd;
}

function shouldKeepOverlappingGrammarHint(existing: RankedGrammarHint, next: RankedGrammarHint): boolean {
    return isCopulaPriorityException(existing, next) || areBothHighConfidenceGrammarHints(existing, next);
}

function isCopulaPriorityException(existing: RankedGrammarHint, next: RankedGrammarHint): boolean {
    return existing.ruleId === 'copula-desu-da' && next.priority < 50;
}

function areBothHighConfidenceGrammarHints(existing: RankedGrammarHint, next: RankedGrammarHint): boolean {
    return existing.priority < 40 && next.priority < 40;
}

function shouldSuppressLooseGrammarHint(existing: RankedGrammarHint, next: RankedGrammarHint): boolean {
    return next.priority >= 40 && existing.priority < next.priority;
}

function shouldSuppressContainedGrammarHint(existing: RankedGrammarHint, next: RankedGrammarHint): boolean {
    return grammarHintContains(existing, next)
        && existing.priority <= next.priority
        && existing.match.length > next.match.length;
}

function grammarHintContains(outer: GrammarHint, inner: GrammarHint): boolean {
    return inner.index >= outer.index && grammarHintEnd(inner) <= grammarHintEnd(outer);
}

function grammarHintEnd(hint: GrammarHint): number {
    return hint.index + hint.match.length;
}

function readGrammarPreferences(): GrammarPreferences {
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

function writeGrammarPreferences(preferences: GrammarPreferences): void {
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
    const requestSentence = normalizeSentenceForTranslationRequest(trimmed);
    const targetLanguage = translationTargetLanguage(language);
    const cacheKey = `${targetLanguage}:${requestSentence}`;
    const cached = translationCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    const inFlight = translationInFlight.get(cacheKey);
    if (inFlight) {
        return inFlight;
    }
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=${targetLanguage}&dt=t&dt=bd&dj=1&q=${encodeURIComponent(requestSentence)}`;
    const promise = (async () => {
        const done = log.time('Translate sentence', { sentenceLength: trimmed.length });
        try {
            const json = await requestJson<GoogleTranslateResponse>(url);
            const translated = (json.sentences ?? []).map(item => item.trans ?? '').join('').trim();
            if (!translated) throw new Error('No translation returned.');
            translationCache.set(cacheKey, translated);
            pruneOldestCacheEntries(translationCache, TRANSLATION_CACHE_LIMIT);
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

function translationTargetLanguage(_language: InterfaceLanguage): string {
    // The source is Japanese; Japanese UI is immersion chrome, not a translation target.
    return 'en';
}

function normalizeSentenceForTranslationRequest(sentence: string): string {
    return sentence
        .replace(/[「『]/g, '"')
        .replace(/[」』]/g, '"');
}

export async function renderGrammarHints(hints: GrammarHint[], sentence: string, preferences = readGrammarPreferences(), language: InterfaceLanguage = 'en', options: { audioEnabled?: boolean } = {}): Promise<string> {
    if (!hints.length) return '';
    const knownRuleIds = new Set(preferences.knownRuleIds);
    const visibleHints = visibleGrammarHints(hints, knownRuleIds, preferences.showKnown);
    const visibleGroups = groupGrammarHintsByRule(visibleHints);
    const knownCount = countKnownGrammarHints(hints, knownRuleIds);
    const audioEnabled = options.audioEnabled ?? true;
    return `
        ${renderGrammarSentence(sentence, language, audioEnabled)}
        ${renderGrammarToolbar(visibleGroups.length, knownCount, preferences.showKnown, language)}
        ${await renderGrammarHintList(visibleGroups, knownRuleIds, language, audioEnabled)}`;
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

function renderGrammarSentence(sentence: string, language: InterfaceLanguage, audioEnabled: boolean): string {
    return renderStudySentenceBlock(sentence, language, { audioEnabled }, 'data-grammar-sentence');
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

async function renderGrammarHintList(visibleGroups: GroupedGrammarHint[], knownRuleIds: Set<string>, language: InterfaceLanguage, audioEnabled: boolean): Promise<string> {
    if (!visibleGroups.length) return renderStudyEmpty(uiText(language, 'allDetectedGrammarKnown'));
    const items = await Promise.all(visibleGroups.map(group => renderGrammarHintItem(group, knownRuleIds.has(group.hint.ruleId), language, audioEnabled)));
    return renderStudyList(items, 'data-grammar-list');
}

async function renderGrammarHintItem(group: GroupedGrammarHint, known: boolean, language: InterfaceLanguage, audioEnabled: boolean): Promise<string> {
    const { hint, count } = group;
    const details = await grammarHintDetails(hint, language);
    const displayName = grammarDisplayName(hint, language);
    return `
            <li class="jpdb-reader-study-item${known ? ' known' : ''}" data-grammar-rule-id="${escapeHtml(hint.ruleId)}">
                <div class="jpdb-reader-study-name">
                    <span>${escapeHtml(displayName)}</span>
                    <span class="jpdb-reader-grammar-level">${escapeHtml(grammarLevelText(hint.level, language))}</span>
                </div>
                <div class="jpdb-reader-study-body">
                    <div class="jpdb-reader-study-item-head">
                        <div class="jpdb-reader-study-kind">${escapeHtml(details.kind)}</div>
                        <div class="jpdb-reader-grammar-actions">
                            ${renderGrammarRepeatCount(count)}
                            <button class="jpdb-reader-grammar-known" type="button" data-action="study-grammar-toggle-known" data-grammar-rule-id="${escapeHtml(hint.ruleId)}" data-grammar-known="${known ? 'true' : 'false'}" aria-pressed="${known ? 'true' : 'false'}">${known ? uiText(language, 'grammarReview') : uiText(language, 'grammarKnown')}</button>
                        </div>
                    </div>
                    <div class="jpdb-reader-study-short jpdb-reader-parseable">${escapeHtml(details.short)}</div>
                    <details class="jpdb-reader-grammar-more">
                        <summary>${escapeHtml(uiText(language, 'grammarDetails'))}</summary>
                        <div class="jpdb-reader-study-detail jpdb-reader-parseable">${escapeHtml(details.detail)}</div>
                        <div class="jpdb-reader-study-match"><span>${escapeHtml(uiText(language, 'grammarFoundIn'))}</span><span class="jpdb-reader-study-match-text jpdb-reader-parseable">${escapeHtml(hint.match)}</span></div>
                        ${renderGrammarHintExamples(details.examples, language, audioEnabled)}
                        ${renderGrammarHintGuide(details.url ?? '', language)}
                    </details>
                </div>
            </li>`;
}

function renderGrammarRepeatCount(count: number): string {
    return count > 1 ? `<span class="jpdb-reader-grammar-repeat">x${count}</span>` : '';
}

async function grammarHintDetails(hint: GrammarHint, language: InterfaceLanguage): Promise<GrammarRuleData> {
    const fallback = grammarHintFallbackData(hint, language);
    const englishData = await loadGrammarRuleData()
        .then(data => data[hint.ruleId])
        .catch(() => undefined);
    const base = englishData ? { ...fallback, ...englishData } : fallback;
    if (language !== 'ja') return base;
    const ruleCopy = await grammarRuleText(language, hint.ruleId);
    if (ruleCopy) return { ...base, ...ruleCopy };
    const name = grammarDisplayName(hint, language);
    return {
        ...base,
        kind: uiText(language, 'grammar'),
        short: interpolateUiText(language, 'grammarGenericShort', { name, match: hint.match }),
        detail: interpolateUiText(language, 'grammarGenericDetail', { name, match: hint.match }),
    };
}

function grammarHintFallbackData(hint: GrammarHint, language: InterfaceLanguage): GrammarRuleData {
    return {
        kind: hint.kind || uiText(language, 'grammar'),
        short: hint.short || grammarDisplayName(hint, language),
        detail: hint.detail || grammarDisplayName(hint, language),
        url: hint.url || undefined,
        examples: hint.examples ?? [],
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

function renderGrammarHintExamples(examples: GrammarExample[], language: InterfaceLanguage, audioEnabled: boolean): string {
    const visibleExamples = examples.slice(0, 2);
    if (!visibleExamples.length) return '';
    return `<div class="jpdb-reader-grammar-examples"><span>${escapeHtml(uiText(language, 'grammarExample'))}</span>${visibleExamples.map(example => renderGrammarExample(example, language, audioEnabled)).join('')}</div>`;
}

function renderGrammarExample(example: GrammarExample, language: InterfaceLanguage, audioEnabled: boolean): string {
    const english = language === 'ja' || !example.english ? '' : `<div>${escapeHtml(example.english)}</div>`;
    const note = language === 'ja' || !example.note || ENGLISH_TEXT_RE.test(example.note) ? '' : `<div>${escapeHtml(example.note)}</div>`;
    return `<div class="jpdb-reader-grammar-example jpdb-reader-parseable">
        <div class="jpdb-reader-grammar-example-japanese">
            <span class="jpdb-reader-parseable">${escapeHtml(example.japanese)}</span>
            ${renderStudySentenceAudioButton(language, { audioEnabled, sentence: example.japanese })}
        </div>
        ${english}${note}
    </div>`;
}

function renderGrammarHintGuide(url: string, language: InterfaceLanguage): string {
    return url ? `<a class="jpdb-reader-study-guide" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(uiText(language, 'grammarGuide'))}</a>` : '';
}

const BARE_MITAI_DESIRE_FALSE_POSITIVE_RE = /(?:読み|飲み|住み|休み|頼み|望み|悩み|包み|噛み|組み|編み|摘み|進み|歩み|楽しみ|悲しみ|苦しみ|試み)たい$/u;
const LEXICAL_DESIRE_TAI_RE = /^(?:いたい|痛い|冷たい|重たい|やたい)(?:です)?$/u;
const LEXICAL_NEGATIVE_NAI_RE = /(?:少ない|危ない|まかない|何気ない|さりげない|なにげない)$/u;
const LEXICAL_METHOD_KATA_RE = /(?:夕方|地方|親方|行方|方法|の方)$/u;
const LEXICAL_SUFFIX_GE_RE = /(?:からあげ|おかげ|さりげ|なにげ)$/u;
const LEXICAL_SUFFIX_MEKU_RE = /(?:きめき|きらめく|ひらめき|うごめく)$/u;
const LEXICAL_POSSIBILITY_ERU_RE = /^(?:得る|得ます|得た|得ました|得ない|得ません|得なかった|得ませんでした)$/u;
const PRONOUN_POSSESSIVE_NOMINALIZER_RE = /(?:私|僕|俺|彼|彼女|誰|何)の$/u;

interface GrammarMatchContext {
    rawMatch: string;
    before: string;
    following: string;
}

type GrammarMatchSkipPredicate = (context: GrammarMatchContext) => boolean;

const GRAMMAR_MATCH_SKIP_PREDICATES: Readonly<Record<string, GrammarMatchSkipPredicate>> = {
    'appearance-sou': ({ rawMatch }) => rawMatch === 'そう' || /(?:かわいそう|ごちそう)$/u.test(rawMatch),
    'hearsay-sou-da': ({ rawMatch }) => /(?:かわいそう|ごちそう)/u.test(rawMatch),
    'volitional-you': ({ rawMatch }) => rawMatch === 'よう' || rawMatch === 'さよう',
    'similarity-you-da': ({ rawMatch }) => rawMatch.startsWith('さよう'),
    'conditional-nara': ({ rawMatch }) => rawMatch.endsWith('さようなら'),
    'desire-tai': ({ rawMatch }) => LEXICAL_DESIRE_TAI_RE.test(rawMatch),
    'without-naide': ({ rawMatch, following }) => rawMatch.endsWith('ないで') && following.startsWith('す'),
    'negative-nai': ({ rawMatch }) => LEXICAL_NEGATIVE_NAI_RE.test(rawMatch),
    'method-kata': shouldSkipMethodKataMatch,
    'suffix-ge': ({ rawMatch }) => LEXICAL_SUFFIX_GE_RE.test(rawMatch),
    'state-mama': ({ rawMatch, before }) => rawMatch.includes('わがまま') || (rawMatch === 'まま' && before.endsWith('わが')),
    'difficulty-gatai': ({ rawMatch }) => rawMatch.endsWith('ありがたい'),
    'substitution-kawari-ni': ({ rawMatch }) => rawMatch.endsWith('おかわりに'),
    'suffix-meku': ({ rawMatch }) => LEXICAL_SUFFIX_MEKU_RE.test(rawMatch),
    'possibility-eru-enai': ({ rawMatch }) => LEXICAL_POSSIBILITY_ERU_RE.test(rawMatch) || rawMatch.startsWith('心得'),
    'suffix-gimi': ({ rawMatch }) => rawMatch.endsWith('不気味'),
    'fresh-tate': ({ rawMatch }) => rawMatch === 'たて',
    'elapsed-buri-ni': ({ rawMatch }) => rawMatch.endsWith('すぶりに'),
    'ease-yasui-nikui': ({ rawMatch }) => rawMatch === 'やすい',
    'examples-toka': ({ following }) => following.startsWith('言') || following.startsWith('聞') || following.startsWith('思'),
    'explanation-no-da': ({ rawMatch }) => /(?:私|僕|俺|彼|彼女|誰|何)の(?:だ|だった|じゃない|ではない)$/u.test(rawMatch),
    'skill-no-ga-suki': shouldSkipPronounPossessiveNominalizerMatch,
    'nominalizer-no': shouldSkipPronounPossessiveNominalizerMatch,
    'sensation-ga-suru': ({ rawMatch }) => /(?:彼|彼女|私|僕|俺|君|あなた|先生|友だち|子ども)がす/u.test(rawMatch),
    'standard-ni-shite-wa': ({ following }) => /^(?:いけ|なら|だめ)/u.test(following),
    'emphasis-sae': ({ rawMatch }) => rawMatch.endsWith('ささえ'),
    'emphasis-koso': ({ rawMatch }) => rawMatch.endsWith('ようこそ'),
    'evidence-rashii-mitai': ({ rawMatch }) => BARE_MITAI_DESIRE_FALSE_POSITIVE_RE.test(rawMatch),
};

function shouldSkipGrammarMatch(item: GrammarPattern, sentence: string, match: RegExpMatchArray): boolean {
    const predicate = GRAMMAR_MATCH_SKIP_PREDICATES[item.ruleId];
    if (!predicate) return false;
    return predicate(grammarMatchContext(sentence, match));
}

function grammarMatchContext(sentence: string, match: RegExpMatchArray): GrammarMatchContext {
    const rawMatch = match[0];
    const start = match.index ?? 0;
    const end = start + rawMatch.length;
    return {
        rawMatch,
        before: sentence.slice(Math.max(0, start - 4), start),
        following: sentence.slice(end, end + 6),
    };
}

function shouldSkipMethodKataMatch({ rawMatch, before, following }: GrammarMatchContext): boolean {
    return LEXICAL_METHOD_KATA_RE.test(rawMatch)
        || (rawMatch === '方' && (following.startsWith('法') || before.endsWith('の') || /[夕地親行]/u.test(before.slice(-1))));
}

function shouldSkipPronounPossessiveNominalizerMatch({ rawMatch }: GrammarMatchContext): boolean {
    return PRONOUN_POSSESSIVE_NOMINALIZER_RE.test(rawMatch);
}

function grammarMatches(item: GrammarPattern, sentence: string): RankedGrammarHint[] {
    return Array.from(sentence.matchAll(item.pattern))
        .filter(match => !shouldSkipGrammarMatch(item, sentence, match))
        .map(match => {
            const rawMatch = match[0];
            const learnerFacingMatch = learnerMatch(item.name, rawMatch);
            const learnerOffset = rawMatch.lastIndexOf(learnerFacingMatch);
            const indexOffset = learnerOffset > 0 ? learnerOffset : 0;
            return {
                ruleId: item.ruleId,
                name: item.name,
                level: item.level,
                kind: 'Grammar',
                short: item.name,
                detail: item.name,
                url: item.url,
                match: learnerFacingMatch,
                confidence: item.confidence,
                index: (match.index ?? 0) + indexOffset,
                priority: item.priority,
                examples: [],
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

async function loadGrammarRuleData(): Promise<Record<string, GrammarRuleData>> {
    grammarRuleDataPromise ??= requestJson<Record<string, GrammarRuleData>>(EN_GRAMMAR_RULE_DATA_URL, {
        timeoutMs: GRAMMAR_RULE_DATA_TIMEOUT_MS,
        failureLabel: 'English grammar rule data request',
        timeoutLabel: 'Grammar rule data timed out.',
    })
        .then(normalizeGrammarRuleData)
        .catch(() => {
            grammarRuleDataPromise = undefined;
            return {};
        });
    return grammarRuleDataPromise;
}

function normalizeGrammarRuleData(value: unknown): Record<string, GrammarRuleData> {
    if (!isObjectRecord(value)) return {};
    const data: Record<string, GrammarRuleData> = {};
    for (const [ruleId, item] of Object.entries(value)) {
        const normalized = normalizeGrammarRuleDataItem(item);
        if (normalized) data[ruleId] = normalized;
    }
    return data;
}

function normalizeGrammarRuleDataItem(item: unknown): GrammarRuleData | undefined {
    if (!isObjectRecord(item)) return undefined;
    const candidate = item as Partial<Record<keyof GrammarRuleData, unknown>>;
    if (!hasRequiredGrammarRuleData(candidate)) return undefined;
    return {
        kind: candidate.kind,
        short: candidate.short,
        detail: candidate.detail,
        url: grammarRuleDataUrl(candidate.url),
        examples: normalizeGrammarExamples(candidate.examples),
    };
}

function hasRequiredGrammarRuleData(
    candidate: Partial<Record<keyof GrammarRuleData, unknown>>,
): candidate is Partial<Record<keyof GrammarRuleData, unknown>> & Pick<GrammarRuleData, 'kind' | 'short' | 'detail'> {
    return typeof candidate.kind === 'string'
        && typeof candidate.short === 'string'
        && typeof candidate.detail === 'string';
}

function grammarRuleDataUrl(value: unknown): string | undefined {
    return typeof value === 'string' && value ? value : undefined;
}

function normalizeGrammarExamples(value: unknown): GrammarExample[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const candidate = item as Partial<Record<keyof GrammarExample, unknown>>;
        if (typeof candidate.japanese !== 'string' || typeof candidate.english !== 'string') return [];
        return [{
            japanese: candidate.japanese,
            english: candidate.english,
            ...(typeof candidate.note === 'string' ? { note: candidate.note } : {}),
        }];
    });
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

interface GoogleTranslateResponse {
    sentences?: Array<{ trans?: string }>;
}

interface StudyJsonRequestOptions {
    timeoutMs?: number;
    failureLabel?: string;
    timeoutLabel?: string;
}

function requestJson<T>(url: string, options: StudyJsonRequestOptions = {}): Promise<T> {
    return requestReaderJson(url, {
        timeoutMs: options.timeoutMs ?? TRANSLATION_TIMEOUT_MS,
        allowDirectCrossOrigin: true,
        allowConfiguredProxy: false,
        allowPublicProxies: false,
        preferFetch: true,
        failureLabel: options.failureLabel ?? 'Translation request',
        timeoutLabel: options.timeoutLabel ?? 'Translation timed out.',
    }) as Promise<T>;
}
