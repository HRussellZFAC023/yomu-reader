import { escapeHtml } from './dom';
import { Logger } from './logger';
import { getUserscriptHttpRequest } from './userscript';

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
}

export type GrammarLevel = 'Core' | 'N5' | 'N4' | 'N3' | 'N2' | 'N1';

interface GrammarPattern {
    pattern: RegExp;
    name: string;
    kind: string;
    short: string;
    detail: string;
    url: string;
    confidence: GrammarHint['confidence'];
    priority?: number;
}

type RankedGrammarHint = GrammarHint & { priority: number };

interface GrammarRuleMeta {
    ruleId: string;
    level: GrammarLevel;
}

export interface GrammarPreferences {
    knownRuleIds: string[];
    showKnown: boolean;
}

const PARTICLE_CHUNK = String.raw`[^はがをにへとでもやの、。！？\s]{1,16}`;
const FORM_CHUNK = String.raw`[ぁ-んァ-ン一-龯]{1,16}`;
const GRAMMAR_PREFERENCES_KEY = 'yomu.grammarPreferences.v1';

const GRAMMAR_PATTERNS: GrammarPattern[] = [
    { pattern: new RegExp(`${FORM_CHUNK}ことができ(?:る|ます|ない|ません|た|ました)?`, 'u'), name: 'ことができる', kind: 'Potential expression', short: 'can do something', detail: 'Turns the action before こと into an ability or possibility: "can do..."', url: 'https://www.tofugu.com/japanese-grammar/koto-ga-dekiru/', confidence: 'high', priority: 5 },
    { pattern: new RegExp(`${FORM_CHUNK}(?:なければならない|なくてはいけない|なきゃ|なければいけない)`, 'u'), name: 'なければならない', kind: 'Obligation', short: 'must or have to do', detail: 'Says an action is necessary or required. Casual forms like なきゃ carry the same basic idea.', url: 'https://www.tofugu.com/japanese-grammar/nakereba-naranai/', confidence: 'high', priority: 5 },
    { pattern: new RegExp(`${FORM_CHUNK}てはいけ(?:ない|ません)`, 'u'), name: 'てはいけない', kind: 'Prohibition', short: 'must not do', detail: 'Marks an action as not allowed or unacceptable.', url: 'https://www.tofugu.com/japanese-grammar/tewa-ikenai/', confidence: 'high', priority: 5 },
    { pattern: new RegExp(`${FORM_CHUNK}てもいい`, 'u'), name: 'てもいい', kind: 'Permission', short: 'permission or approval', detail: 'Means it is okay to do the action before てもいい.', url: 'https://www.tofugu.com/japanese-grammar/temoii/', confidence: 'high', priority: 5 },
    { pattern: new RegExp(`${FORM_CHUNK}たことがあ(?:る|ります|った|りました|りません)`, 'u'), name: 'たことがある', kind: 'Experience', short: 'has done before', detail: 'Uses a past verb plus ことがある to talk about having had an experience.', url: 'https://www.tofugu.com/japanese-grammar/ta-koto-ga-aru/', confidence: 'high', priority: 6 },
    { pattern: new RegExp(`${FORM_CHUNK}て(?:しまう|しまった|しまいます|しまいました|ちゃう|ちゃった|じゃう|じゃった)`, 'u'), name: 'てしまう', kind: 'Completion / regret', short: 'do completely or unfortunately', detail: 'Can show that an action is completed, often with a feeling of regret or surprise.', url: 'https://www.tofugu.com/japanese-grammar/te-shimau/', confidence: 'high', priority: 6 },
    { pattern: new RegExp(`${FORM_CHUNK}てみ(?:る|ます|た|ました|たい)`, 'u'), name: 'てみる', kind: 'Attempt', short: 'try doing', detail: 'Means to try an action and see what happens.', url: 'https://www.tofugu.com/japanese-grammar/te-miru/', confidence: 'high', priority: 6 },
    { pattern: new RegExp(`${FORM_CHUNK}てお(?:く|きます|いた|きました)`, 'u'), name: 'ておく', kind: 'Preparation', short: 'do in advance or leave as is', detail: 'Often marks an action done ahead of time, or a state intentionally left alone.', url: 'https://www.tofugu.com/japanese-grammar/teoku/', confidence: 'high', priority: 6 },
    { pattern: new RegExp(`${FORM_CHUNK}て(?:くれる|くださる|あげる|やる|もらう|いただく)`, 'u'), name: 'てくれる / てもらう', kind: 'Giving and receiving', short: 'favor done for someone', detail: 'Combines て-form with giving or receiving verbs to show who benefits from an action.', url: 'https://www.tofugu.com/japanese-grammar/te-kureru/', confidence: 'medium', priority: 8 },
    { pattern: new RegExp(`${FORM_CHUNK}ようにな(?:る|ります|った|りました)`, 'u'), name: 'ようになる', kind: 'Change over time', short: 'come to do or become so that', detail: 'Shows a new ability, habit, or state developing over time.', url: 'https://www.tofugu.com/japanese-grammar/you-ni-naru/', confidence: 'high', priority: 8 },
    { pattern: new RegExp(`${FORM_CHUNK}ようにす(?:る|ます|た|ました)`, 'u'), name: 'ようにする', kind: 'Effort / habit', short: 'make sure to do', detail: 'Shows an intentional effort to make an action happen regularly or reliably.', url: 'https://www.tofugu.com/japanese-grammar/you-ni-suru/', confidence: 'high', priority: 8 },
    { pattern: new RegExp(`${FORM_CHUNK}(?:させられる|[かがさざただなばまわ]せられる|[かがさざただなばまわ]される)`, 'u'), name: 'させられる', kind: 'Causative-passive', short: 'be made to do', detail: 'Combines causative and passive meaning: someone is made to do an action, often unwillingly.', url: 'https://www.tofugu.com/japanese-grammar/verb-causative-form-saseru/', confidence: 'medium', priority: 8 },
    { pattern: new RegExp(`${FORM_CHUNK}(?:させる|[かがさざただなばまわ](?:せる|す))`, 'u'), name: 'させる', kind: 'Causative', short: 'make or let someone do', detail: 'Adds a causer: someone makes, lets, or has someone else do the action.', url: 'https://www.tofugu.com/japanese-grammar/verb-causative-form-saseru/', confidence: 'medium', priority: 9 },
    { pattern: new RegExp(`${FORM_CHUNK}(?:られる|[かがさざただなばまわ]れる)`, 'u'), name: 'れる / られる', kind: 'Passive / potential', short: 'passive, potential, or honorific form', detail: 'This ending can mark passive voice, ability, or respectful speech; context decides which reading fits.', url: 'https://www.tofugu.com/japanese-grammar/verb-passive-form-rareru/', confidence: 'medium', priority: 9 },
    { pattern: new RegExp(`${FORM_CHUNK}(?:らしい|みたい|っぽい)`, 'u'), name: 'らしい / みたい', kind: 'Hearsay / likeness', short: 'seems like or apparently', detail: 'Expresses appearance, hearsay, or resemblance depending on the form and context.', url: 'https://www.tofugu.com/japanese-grammar/rashii/', confidence: 'medium', priority: 9 },
    { pattern: /(?:かもしれない|かもしれません)/u, name: 'かもしれない', kind: 'Possibility', short: 'might or maybe', detail: 'Softens a statement into a possibility rather than a firm claim.', url: 'https://www.tofugu.com/japanese-grammar/kamoshirenai/', confidence: 'high', priority: 9 },
    { pattern: /(?:でしょう|だろう)/u, name: 'でしょう / だろう', kind: 'Probability', short: 'probably or right?', detail: 'Adds probability, expectation, or a confirmation-seeking tone.', url: 'https://www.tofugu.com/japanese-grammar/deshou/', confidence: 'high', priority: 10 },
    { pattern: new RegExp(`${FORM_CHUNK}と思(?:う|います|った|いました)`, 'u'), name: 'と思う', kind: 'Quotation / thought', short: 'think that...', detail: 'Marks the content of a thought or statement before 思う.', url: 'https://www.tofugu.com/japanese-grammar/to-omou/', confidence: 'high', priority: 10 },
    { pattern: new RegExp(`${FORM_CHUNK}ようとす(?:る|ます|た|ました)`, 'u'), name: 'ようとする', kind: 'Attempt / about to', short: 'try to or be about to', detail: 'Uses the volitional form plus とする for an attempted action or something about to happen.', url: 'https://www.tofugu.com/japanese-grammar/verb-volitional-form-you/', confidence: 'medium', priority: 11 },
    { pattern: new RegExp(`${FORM_CHUNK}(?:つもり|予定)`, 'u'), name: 'つもり / 予定', kind: 'Plan / intention', short: 'intend or plan to do', detail: 'つもり points to intention, while 予定 points to a plan or schedule.', url: 'https://www.tofugu.com/japanese-grammar/tsumori/', confidence: 'medium', priority: 12 },
    { pattern: new RegExp(`${FORM_CHUNK}はず`, 'u'), name: 'はず', kind: 'Expectation', short: 'should be or expected to', detail: 'Marks a strong expectation based on what the speaker knows.', url: 'https://www.tofugu.com/japanese-grammar/hazu/', confidence: 'high', priority: 12 },
    { pattern: new RegExp(`${FORM_CHUNK}わけ(?:ではない|じゃない|がない|にはいかない|だ|です)?`, 'u'), name: 'わけ', kind: 'Reasoning', short: 'reason, conclusion, or not necessarily', detail: 'Points to a logical reason or conclusion, with negative forms often meaning "not necessarily" or "cannot reasonably."', url: 'https://www.tofugu.com/japanese-grammar/wake/', confidence: 'medium', priority: 12 },
    { pattern: new RegExp(`${FORM_CHUNK}ために`, 'u'), name: 'ために', kind: 'Purpose / benefit', short: 'for the sake of or in order to', detail: 'Links an action or noun to a purpose, goal, or beneficiary.', url: 'https://www.tofugu.com/japanese-grammar/tame-ni/', confidence: 'high', priority: 12 },
    { pattern: new RegExp(`${FORM_CHUNK}ように`, 'u'), name: 'ように', kind: 'Purpose / manner', short: 'so that or in the way that', detail: 'Can mark a goal, desired result, or manner of doing something.', url: 'https://www.tofugu.com/japanese-grammar/you-ni/', confidence: 'medium', priority: 14 },
    { pattern: new RegExp(`${FORM_CHUNK}ところ(?:だ|です|だった|でした|で|に)?`, 'u'), name: 'ところ', kind: 'Timing / situation', short: 'point in time or situation', detail: 'Frames an action as about to happen, happening now, just happened, or as a situation.', url: 'https://www.tofugu.com/japanese/tokoro-bakari/', confidence: 'medium', priority: 14 },
    { pattern: new RegExp(`${FORM_CHUNK}ながら`, 'u'), name: 'ながら', kind: 'Simultaneous action', short: 'while doing', detail: 'Connects two actions done at the same time by the same subject.', url: 'https://www.tofugu.com/japanese-grammar/nagara/', confidence: 'high', priority: 14 },
    { pattern: new RegExp(`${FORM_CHUNK}まま`, 'u'), name: 'まま', kind: 'Unchanged state', short: 'as is or while still', detail: 'Keeps a state unchanged while another action or situation continues.', url: 'https://www.tofugu.com/japanese-grammar/mama/', confidence: 'medium', priority: 15 },
    { pattern: new RegExp(`${FORM_CHUNK}たり`, 'u'), name: 'たり', kind: 'Representative list', short: 'doing things like...', detail: 'Lists example actions without claiming the list is complete.', url: 'https://www.tofugu.com/japanese-grammar/tari/', confidence: 'medium', priority: 16 },
    { pattern: new RegExp(`${FORM_CHUNK}ばかり`, 'u'), name: 'ばかり', kind: 'Limitation / recent action', short: 'only, just did, or nothing but', detail: 'Can mark a recent completed action or a sense of "only/nothing but" depending on context.', url: 'https://www.tofugu.com/japanese/tokoro-bakari/', confidence: 'medium', priority: 16 },
    { pattern: new RegExp(`${FORM_CHUNK}(?:だけ|しか)`, 'u'), name: 'だけ / しか', kind: 'Limitation', short: 'only or nothing but', detail: 'だけ means only; しか usually pairs with a negative ending to mean nothing but.', url: 'https://www.tofugu.com/japanese-grammar/dake/', confidence: 'medium', priority: 18 },
    { pattern: new RegExp(`${FORM_CHUNK}(?:ほど|くらい|ぐらい)`, 'u'), name: 'ほど / くらい', kind: 'Degree / approximation', short: 'extent or about', detail: 'Marks approximate amount or the degree to which something is true.', url: 'https://www.tofugu.com/japanese-grammar/hodo/', confidence: 'medium', priority: 18 },
    { pattern: new RegExp(`${FORM_CHUNK}として`, 'u'), name: 'として', kind: 'Role / standpoint', short: 'as or in the role of', detail: 'Marks the role, capacity, or standpoint from which something is true.', url: 'https://bunpro.jp/grammar_points/%E3%81%A8%E3%81%97%E3%81%A6', confidence: 'high', priority: 18 },
    { pattern: new RegExp(`${FORM_CHUNK}によって`, 'u'), name: 'によって', kind: 'Means / cause / by', short: 'by, depending on, or because of', detail: 'Can mark means, agent in passive sentences, cause, or variation depending on context.', url: 'https://bunpro.jp/grammar_points/%E3%81%AB%E3%82%88%E3%81%A3%E3%81%A6', confidence: 'medium', priority: 18 },
    { pattern: new RegExp(`${FORM_CHUNK}について`, 'u'), name: 'について', kind: 'Topic', short: 'about or concerning', detail: 'Marks the topic being discussed, considered, or investigated.', url: 'https://bunpro.jp/grammar_points/%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6', confidence: 'high', priority: 18 },
    { pattern: new RegExp(`${FORM_CHUNK}に対して`, 'u'), name: 'に対して', kind: 'Target / contrast', short: 'toward, against, or in contrast to', detail: 'Marks the target of an attitude/action, or sets up a contrast.', url: 'https://bunpro.jp/grammar_points/%E3%81%AB%E5%AF%BE%E3%81%97%E3%81%A6', confidence: 'medium', priority: 18 },
    { pattern: new RegExp(`${FORM_CHUNK}にもかかわらず`, 'u'), name: 'にもかかわらず', kind: 'Concession', short: 'despite or even though', detail: 'Connects two facts when the second happens despite the first.', url: 'https://bunpro.jp/grammar_points/%E3%81%AB%E3%82%82%E9%96%A2%E3%82%8F%E3%82%89%E3%81%9A', confidence: 'high', priority: 18 },
    { pattern: new RegExp(`${FORM_CHUNK}くせに`, 'u'), name: 'くせに', kind: 'Blame / contradiction', short: 'even though, with criticism', detail: 'Marks a contradiction with a blaming or critical tone.', url: 'https://bunpro.jp/grammar_points/%E3%81%8F%E3%81%9B%E3%81%AB', confidence: 'medium', priority: 18 },
    { pattern: new RegExp(`${PARTICLE_CHUNK}は`, 'u'), name: 'は', kind: 'Topic particle', short: 'sets the topic or contrast', detail: 'Read it as "as for..." and look to the rest of the sentence for the new information.', url: 'https://www.tofugu.com/japanese-grammar/particle-wa/', confidence: 'high' },
    { pattern: new RegExp(`${PARTICLE_CHUNK}が`, 'u'), name: 'が', kind: 'Subject particle', short: 'marks the doer or focus', detail: 'Highlights the subject of the clause, often when that subject is new or important.', url: 'https://www.tofugu.com/japanese-grammar/particle-ga/', confidence: 'high' },
    { pattern: new RegExp(`${PARTICLE_CHUNK}を`, 'u'), name: 'を', kind: 'Object particle', short: 'marks what receives the action', detail: 'The phrase before を is usually what the following verb acts on.', url: 'https://www.tofugu.com/japanese-grammar/particle-wo/', confidence: 'high' },
    { pattern: new RegExp(`${PARTICLE_CHUNK}で(?!き)`, 'u'), name: 'で', kind: 'Context particle', short: 'marks where or how an action happens', detail: 'Often points to the setting, tool, method, or conditions for the action.', url: 'https://www.tofugu.com/japanese-grammar/particle-de/', confidence: 'medium' },
    { pattern: new RegExp(`${PARTICLE_CHUNK}に`, 'u'), name: 'に', kind: 'Target particle', short: 'marks a target, point, time, or adverbial role', detail: 'Think of に as pinning the action to a destination, time, target, or manner.', url: 'https://www.tofugu.com/japanese-grammar/particle-ni/', confidence: 'medium' },
    { pattern: new RegExp(`${PARTICLE_CHUNK}の`, 'u'), name: 'の', kind: 'Noun linker', short: 'connects or labels nouns', detail: 'The phrase before の modifies or belongs with the noun that follows.', url: 'https://www.tofugu.com/japanese-grammar/particle-no-noun-modifier/', confidence: 'medium' },
    { pattern: new RegExp(`${FORM_CHUNK}[てで](?:い(?:る|ます|た|ない)?|る|た)`, 'u'), name: 'ている', kind: 'Verb form', short: 'ongoing action or resulting state', detail: 'Shows an action in progress, or a state that remains after something changed.', url: 'https://www.tofugu.com/japanese-grammar/verb-continuous-form-teiru/', confidence: 'high' },
    { pattern: new RegExp(`${FORM_CHUNK}(?:たい|たくない|たかった)`, 'u'), name: 'たい', kind: 'Verb ending', short: 'want to do something', detail: 'Attaches to a verb stem to say the speaker wants to do that action.', url: 'https://www.tofugu.com/japanese-grammar/tai-form/', confidence: 'high' },
    { pattern: new RegExp(`${FORM_CHUNK}(?:ない|ません|なかった|ませんでした)`, 'u'), name: 'ない', kind: 'Verb ending', short: 'negative form', detail: 'Turns the verb or expression into "do not," "is not," or "did not."', url: 'https://www.tofugu.com/japanese-grammar/verb-negative-nai-form/', confidence: 'medium' },
    { pattern: new RegExp(`${FORM_CHUNK}ました`, 'u'), name: 'ました', kind: 'Polite past', short: 'polite completed action', detail: 'A polite ます-form verb in the past tense: "did" or "was/were."', url: 'https://www.tofugu.com/japanese-grammar/masu/', confidence: 'high' },
    { pattern: new RegExp(`${FORM_CHUNK}ます`, 'u'), name: 'ます', kind: 'Polite form', short: 'polite non-past verb', detail: 'Softens the verb into polite speech; tense depends on the surrounding sentence.', url: 'https://www.tofugu.com/japanese-grammar/masu/', confidence: 'medium' },
    { pattern: new RegExp(`${FORM_CHUNK}たら`, 'u'), name: 'たら', kind: 'Clause linker', short: 'conditional or time sequence', detail: 'Turns the first clause into the condition or timing for what follows: "if," "when," or "after."', url: 'https://www.tofugu.com/japanese-grammar/conditional-form-tara/', confidence: 'high' },
    { pattern: new RegExp(`${FORM_CHUNK}(?:えば|ければ)`, 'u'), name: 'ば', kind: 'Conditional', short: 'conditional if', detail: 'Marks the condition that needs to be true for the next clause to happen.', url: 'https://www.tofugu.com/japanese-grammar/verb-conditional-form-ba/', confidence: 'high' },
    { pattern: /(?:なので|ので)/u, name: 'ので', kind: 'Clause linker', short: 'reason or cause', detail: 'Gives the reason or cause for the following statement, usually with a softer tone than から.', url: 'https://www.tofugu.com/japanese-grammar/conjunctive-particle-node/', confidence: 'high' },
    { pattern: new RegExp(`${FORM_CHUNK}から`, 'u'), name: 'から', kind: 'Particle / linker', short: 'reason, source, or starting point', detail: 'Can mean "because," "from," or "after," depending on what surrounds it.', url: 'https://www.tofugu.com/japanese-grammar/particle-kara/', confidence: 'medium' },
    { pattern: new RegExp(`${FORM_CHUNK}そう`, 'u'), name: 'そう', kind: 'Appearance', short: 'looks like something will happen', detail: 'Describes how something seems based on what the speaker can observe.', url: 'https://www.tofugu.com/japanese-grammar/verb-sou/', confidence: 'medium' },
    { pattern: new RegExp(`${FORM_CHUNK}よう`, 'u'), name: 'よう', kind: 'Volitional', short: 'volition, proposal, or invitation', detail: 'Often expresses "let us," "I will," or a suggestion to do something together.', url: 'https://www.tofugu.com/japanese-grammar/verb-volitional-form-you/', confidence: 'medium' },
    { pattern: /のに/u, name: 'のに', kind: 'Clause linker', short: 'although, despite, or frustrated expectation', detail: 'Connects two ideas when the second one is surprising or disappointing given the first.', url: 'https://www.tofugu.com/japanese-grammar/conjunctive-particle-noni/', confidence: 'high' },
    { pattern: /こと(?:が|を|に|は|も)/u, name: 'こと', kind: 'Nominalizer', short: 'abstract thing or nominalizer', detail: 'Turns an action or idea into a noun-like concept that particles can attach to.', url: 'https://www.tofugu.com/japanese-grammar/koto/', confidence: 'medium' },
];

const GRAMMAR_RULE_META = new Map<string, GrammarRuleMeta>([
    ['ことができる', { ruleId: 'potential-koto-ga-dekiru', level: 'N4' }],
    ['なければならない', { ruleId: 'obligation-nakereba-naranai', level: 'N4' }],
    ['てはいけない', { ruleId: 'prohibition-tewa-ikenai', level: 'N4' }],
    ['てもいい', { ruleId: 'permission-temo-ii', level: 'N5' }],
    ['たことがある', { ruleId: 'experience-ta-koto-ga-aru', level: 'N4' }],
    ['てしまう', { ruleId: 'completion-te-shimau', level: 'N4' }],
    ['てみる', { ruleId: 'attempt-te-miru', level: 'N4' }],
    ['ておく', { ruleId: 'preparation-te-oku', level: 'N4' }],
    ['てくれる / てもらう', { ruleId: 'benefactive-te-kureru-morau', level: 'N4' }],
    ['ようになる', { ruleId: 'change-you-ni-naru', level: 'N4' }],
    ['ようにする', { ruleId: 'habit-you-ni-suru', level: 'N4' }],
    ['させられる', { ruleId: 'voice-causative-passive', level: 'N3' }],
    ['させる', { ruleId: 'voice-causative', level: 'N4' }],
    ['れる / られる', { ruleId: 'voice-passive-potential', level: 'N4' }],
    ['らしい / みたい', { ruleId: 'evidence-rashii-mitai', level: 'N4' }],
    ['かもしれない', { ruleId: 'modality-kamoshirenai', level: 'N4' }],
    ['でしょう / だろう', { ruleId: 'modality-deshou-darou', level: 'N5' }],
    ['と思う', { ruleId: 'quotation-to-omou', level: 'N4' }],
    ['ようとする', { ruleId: 'attempt-you-to-suru', level: 'N3' }],
    ['つもり / 予定', { ruleId: 'plan-tsumori-yotei', level: 'N4' }],
    ['はず', { ruleId: 'expectation-hazu', level: 'N4' }],
    ['わけ', { ruleId: 'reasoning-wake', level: 'N3' }],
    ['ために', { ruleId: 'purpose-tame-ni', level: 'N4' }],
    ['ように', { ruleId: 'purpose-you-ni', level: 'N4' }],
    ['ところ', { ruleId: 'timing-tokoro', level: 'N4' }],
    ['ながら', { ruleId: 'simultaneous-nagara', level: 'N4' }],
    ['まま', { ruleId: 'state-mama', level: 'N3' }],
    ['たり', { ruleId: 'list-tari', level: 'N5' }],
    ['ばかり', { ruleId: 'limitation-bakari', level: 'N4' }],
    ['だけ / しか', { ruleId: 'limitation-dake-shika', level: 'N5' }],
    ['ほど / くらい', { ruleId: 'degree-hodo-kurai', level: 'N4' }],
    ['として', { ruleId: 'role-toshite', level: 'N3' }],
    ['によって', { ruleId: 'relation-ni-yotte', level: 'N3' }],
    ['について', { ruleId: 'topic-ni-tsuite', level: 'N3' }],
    ['に対して', { ruleId: 'target-ni-taishite', level: 'N3' }],
    ['にもかかわらず', { ruleId: 'concession-ni-mo-kakawarazu', level: 'N2' }],
    ['くせに', { ruleId: 'concession-kuse-ni', level: 'N3' }],
    ['は', { ruleId: 'particle-wa', level: 'N5' }],
    ['が', { ruleId: 'particle-ga', level: 'N5' }],
    ['を', { ruleId: 'particle-wo', level: 'N5' }],
    ['で', { ruleId: 'particle-de', level: 'N5' }],
    ['に', { ruleId: 'particle-ni', level: 'N5' }],
    ['の', { ruleId: 'particle-no', level: 'N5' }],
    ['ている', { ruleId: 'aspect-te-iru', level: 'N5' }],
    ['たい', { ruleId: 'desire-tai', level: 'N5' }],
    ['ない', { ruleId: 'negative-nai', level: 'N5' }],
    ['ました', { ruleId: 'polite-past-mashita', level: 'N5' }],
    ['ます', { ruleId: 'polite-masu', level: 'N5' }],
    ['たら', { ruleId: 'conditional-tara', level: 'N4' }],
    ['ば', { ruleId: 'conditional-ba', level: 'N4' }],
    ['ので', { ruleId: 'reason-node', level: 'N4' }],
    ['から', { ruleId: 'reason-kara', level: 'N5' }],
    ['そう', { ruleId: 'appearance-sou', level: 'N4' }],
    ['よう', { ruleId: 'volitional-you', level: 'N5' }],
    ['のに', { ruleId: 'concession-noni', level: 'N4' }],
    ['こと', { ruleId: 'nominalizer-koto', level: 'N5' }],
]);

const translationCache = new Map<string, string>();
const translationInFlight = new Map<string, Promise<string>>();

export function detectGrammarHints(sentence: string): GrammarHint[] {
    const normalized = sentence.replace(/\s+/g, '');
    const seenMatches = new Set<string>();
    const seenNames = new Map<string, number>();
    const hints = GRAMMAR_PATTERNS
        .flatMap(item => grammarMatches(item, normalized))
        .sort((a, b) => a.priority - b.priority || a.index - b.index || a.name.localeCompare(b.name))
        .filter(item => {
            const key = `${item.name}:${item.match}`;
            if (seenMatches.has(key)) return false;
            const count = seenNames.get(item.name) ?? 0;
            if (count >= 2) return false;
            seenMatches.add(key);
            seenNames.set(item.name, count + 1);
            return true;
        })
        .slice(0, 10)
        .sort((a, b) => a.index - b.index || a.priority - b.priority || a.name.localeCompare(b.name))
        .map(({ priority: _priority, ...hint }) => hint);
    log.debug('Grammar hints detected', { sentenceLength: sentence.length, hints: hints.map(hint => hint.name) });
    return hints;
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

export async function translateJapaneseSentence(sentence: string): Promise<string> {
    const trimmed = sentence.trim();
    if (!trimmed) return '';
    const cached = translationCache.get(trimmed);
    if (cached) {
        log.debug('Translation cache hit', { sentenceLength: trimmed.length });
        return cached;
    }
    const inFlight = translationInFlight.get(trimmed);
    if (inFlight) {
        log.debug('Translation in-flight cache hit', { sentenceLength: trimmed.length });
        return inFlight;
    }
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=en&dt=t&dt=bd&dj=1&q=${encodeURIComponent(trimmed)}`;
    const promise = (async () => {
        const done = log.time('Translate sentence', { sentenceLength: trimmed.length });
        try {
            const json = await requestJson<GoogleTranslateResponse>(url);
            const translated = (json.sentences ?? []).map(item => item.trans ?? '').join('').trim();
            if (!translated) throw new Error('No translation returned.');
            translationCache.set(trimmed, translated);
            log.info('Translation completed', { sentenceLength: trimmed.length, translationLength: translated.length });
            return translated;
        } catch (error) {
            log.warn('Translation failed', { sentenceLength: trimmed.length, error });
            throw error;
        } finally {
            done();
        }
    })();
    translationInFlight.set(trimmed, promise);
    void promise.then(() => {
        if (translationInFlight.get(trimmed) === promise) translationInFlight.delete(trimmed);
    }, () => {
        if (translationInFlight.get(trimmed) === promise) translationInFlight.delete(trimmed);
    });
    return promise;
}

export function renderGrammarHints(hints: GrammarHint[], sentence: string, preferences = readGrammarPreferences()): string {
    if (!hints.length) return '';
    const knownRuleIds = new Set(preferences.knownRuleIds);
    const visibleHints = preferences.showKnown
        ? hints
        : hints.filter(hint => !knownRuleIds.has(hint.ruleId));
    const knownCount = hints.filter(hint => knownRuleIds.has(hint.ruleId)).length;
    const hiddenKnownCount = preferences.showKnown ? 0 : knownCount;
    return `
        <div class="jpdb-reader-study-block jpdb-reader-study-sentence-block" data-grammar-sentence>
            <div class="jpdb-reader-study-original jpdb-reader-parseable">${escapeHtml(sentence)}</div>
        </div>
        <div class="jpdb-reader-grammar-toolbar" data-grammar-toolbar>
            <div class="jpdb-reader-grammar-summary">${escapeHtml(grammarSummary(visibleHints.length, hiddenKnownCount))}</div>
            ${knownCount ? `<button class="jpdb-reader-grammar-toggle" type="button" data-action="study-grammar-toggle-known-visibility" aria-pressed="${preferences.showKnown ? 'true' : 'false'}">${preferences.showKnown ? 'Hide known' : 'Show known'}</button>` : ''}
        </div>
        ${visibleHints.length ? `<ol class="jpdb-reader-study-list" data-grammar-list>
        ${visibleHints.map(hint => {
            const known = knownRuleIds.has(hint.ruleId);
            return `
            <li class="jpdb-reader-study-item${known ? ' known' : ''}" data-grammar-rule-id="${escapeHtml(hint.ruleId)}">
                <div class="jpdb-reader-study-name">
                    <span>${escapeHtml(hint.name)}</span>
                    <span class="jpdb-reader-grammar-level">${escapeHtml(hint.level)}</span>
                </div>
                <div class="jpdb-reader-study-body">
                    <div class="jpdb-reader-study-item-head">
                        <div class="jpdb-reader-study-kind">${escapeHtml(hint.kind)}</div>
                        <button class="jpdb-reader-grammar-known" type="button" data-action="study-grammar-toggle-known" data-grammar-rule-id="${escapeHtml(hint.ruleId)}" data-grammar-known="${known ? 'true' : 'false'}" aria-pressed="${known ? 'true' : 'false'}">${known ? 'Review' : 'Known'}</button>
                    </div>
                    <div class="jpdb-reader-study-short">${escapeHtml(hint.short)}</div>
                    <details class="jpdb-reader-grammar-more">
                        <summary>Details</summary>
                        <div class="jpdb-reader-study-detail">${escapeHtml(hint.detail)}</div>
                        <div class="jpdb-reader-study-match"><span>Found in</span>${escapeHtml(hint.match)}</div>
                        <a class="jpdb-reader-study-guide" href="${escapeHtml(hint.url)}" target="_blank" rel="noopener">Guide</a>
                    </details>
                </div>
            </li>`;
        }).join('')}
        </ol>` : `<div class="jpdb-reader-study-empty">All detected grammar for this sentence is marked known.</div>`}`;
}

function grammarMatches(item: GrammarPattern, sentence: string): RankedGrammarHint[] {
    const flags = item.pattern.flags.includes('g') ? item.pattern.flags : `${item.pattern.flags}g`;
    const pattern = new RegExp(item.pattern.source, flags);
    return Array.from(sentence.matchAll(pattern))
        .map(match => ({
            ruleId: grammarRuleMeta(item.name).ruleId,
            name: item.name,
            level: grammarRuleMeta(item.name).level,
            kind: item.kind,
            short: item.short,
            detail: item.detail,
            url: item.url,
            match: learnerMatch(item.name, match[0]),
            confidence: item.confidence,
            index: match.index ?? 0,
            priority: item.priority ?? 50,
        }))
        .filter(hint => hint.match.length > 0);
}

function grammarRuleMeta(name: string): GrammarRuleMeta {
    return GRAMMAR_RULE_META.get(name) ?? { ruleId: grammarRuleId(name), level: 'Core' };
}

function grammarRuleId(name: string): string {
    const slug = name.normalize('NFKC')
        .toLowerCase()
        .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
        .replace(/^-+|-+$/g, '');
    return slug ? `grammar-${slug}` : 'grammar-rule';
}

function grammarSummary(visibleCount: number, hiddenKnownCount: number): string {
    if (hiddenKnownCount) return `${visibleCount} shown · ${hiddenKnownCount} known hidden`;
    return `${visibleCount} shown`;
}

function learnerMatch(name: string, rawMatch: string): string {
    let match = rawMatch.replace(/^(?:そして|それで|でも|また)/u, '');
    if (!['たい', 'ない', 'ました', 'ます'].includes(name)) return match;
    const afterLastParticle = match.replace(/^.*[はがをにへともやの]/u, '');
    return afterLastParticle || match;
}

interface GoogleTranslateResponse {
    sentences?: Array<{ trans?: string }>;
}

function requestJson<T>(url: string): Promise<T> {
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
        log.debug('Translation request using userscript request');
        return new Promise((resolve, reject) => {
            userscriptRequest({
                method: 'GET',
                url,
                responseType: 'json',
                timeout: 8000,
                onload: response => {
                    if (response.status >= 200 && response.status < 300) {
                        log.debug('Translation request completed', { status: response.status });
                        resolve((response.response ?? JSON.parse(String(response.responseText ?? '{}'))) as T);
                    } else {
                        log.warn('Translation request returned HTTP error', { status: response.status });
                        reject(new Error(`Translation request failed (${response.status}).`));
                    }
                },
                onerror: error => {
                    log.warn('Translation request failed', { error });
                    reject(error);
                },
                ontimeout: () => {
                    log.warn('Translation request timed out');
                    reject(new Error('Translation timed out.'));
                },
            });
        });
    }
    log.debug('Translation request using fetch');
    return fetch(url).then(async response => {
        if (!response.ok) {
            log.warn('Translation request returned HTTP error', { status: response.status });
            throw new Error(`Translation request failed (${response.status}).`);
        }
        log.debug('Translation request completed', { status: response.status });
        return response.json() as Promise<T>;
    });
}
