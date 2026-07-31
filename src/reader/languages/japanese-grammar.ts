import { YOMU_GRAMMAR_REGISTRY } from '../study/grammar-registry';
import {
    createLearningTargetGrammar,
    type LearningTargetGrammarMatchContext,
} from './grammar';

const PARTICLE_CHUNK = String.raw`[^はがをにへとでもやのて、。！？!?\s]{1,24}`;
const FORM_CHUNK = String.raw`[^はがをにへとでもやのてで、。！？!?\s]{0,24}`;

export const JAPANESE_GRAMMAR = createLearningTargetGrammar({
    levelScale: {
        id: 'jlpt',
        levels: ['Core', 'N5', 'N4', 'N3', 'N2', 'N1'],
    },
    rules: YOMU_GRAMMAR_REGISTRY,
    normalizeSentence: sentence => sentence.normalize('NFKC').replace(/\s+/g, ''),
    expandPatternSource: source => source
        .replaceAll('{F}', FORM_CHUNK)
        .replaceAll('{P}', PARTICLE_CHUNK),
    shouldSkipMatch: (rule, context) => shouldSkipJapaneseGrammarMatch(rule.ruleId, context),
    learnerFacingMatch: (rule, rawMatch) => japaneseLearnerMatch(rule.name, rawMatch),
    keepOverlappingMatches: (existing, next) => (
        existing.ruleId === 'copula-desu-da' && next.priority < 50
    ),
    // The two hosted copy files are the established Japanese inventory. Other
    // targets omit this hook, so a coincidentally equal rule id cannot inherit
    // Japanese prose.
    ruleCopyIdFor: rule => rule.ruleId,
});

const BARE_MITAI_DESIRE_FALSE_POSITIVE_RE = /(?:読み|飲み|住み|休み|頼み|望み|悩み|包み|噛み|組み|編み|摘み|進み|歩み|楽しみ|悲しみ|苦しみ|試み)たい$/u;
const LEXICAL_DESIRE_TAI_RE = /^(?:いたい|痛い|冷たい|重たい|やたい)(?:です)?$/u;
const LEXICAL_NEGATIVE_NAI_RE = /(?:少ない|危ない|まかない|何気ない|さりげない|なにげない)$/u;
const LEXICAL_METHOD_KATA_RE = /(?:夕方|地方|親方|行方|方法|の方)$/u;
const LEXICAL_SUFFIX_GE_RE = /(?:からあげ|おかげ|さりげ|なにげ)$/u;
const LEXICAL_SUFFIX_MEKU_RE = /(?:きめき|きらめく|ひらめき|うごめく)$/u;
const LEXICAL_POSSIBILITY_ERU_RE = /^(?:得る|得ます|得た|得ました|得ない|得ません|得なかった|得ませんでした)$/u;
const PRONOUN_POSSESSIVE_NOMINALIZER_RE = /(?:私|僕|俺|彼|彼女|誰|何)の$/u;

type GrammarMatchSkipPredicate = (context: LearningTargetGrammarMatchContext) => boolean;

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

function shouldSkipJapaneseGrammarMatch(
    ruleId: string,
    context: LearningTargetGrammarMatchContext,
): boolean {
    return GRAMMAR_MATCH_SKIP_PREDICATES[ruleId]?.(context) ?? false;
}

function shouldSkipMethodKataMatch({
    rawMatch,
    before,
    following,
}: LearningTargetGrammarMatchContext): boolean {
    return LEXICAL_METHOD_KATA_RE.test(rawMatch)
        || (rawMatch === '方' && (
            following.startsWith('法')
            || before.endsWith('の')
            || /[夕地親行]/u.test(before.slice(-1))
        ));
}

function shouldSkipPronounPossessiveNominalizerMatch({
    rawMatch,
}: LearningTargetGrammarMatchContext): boolean {
    return PRONOUN_POSSESSIVE_NOMINALIZER_RE.test(rawMatch);
}

const LEARNER_MATCH_ENDING_NAMES = new Set([
    'たい', 'ない', 'ました', 'ます', 'た', 'よう', 'そう', '方', 'やすい / にくい', 'すぎる',
    'れる / られる', 'させる', 'させられる', 'がち', '気味', 'げ', 'っぽい', 'めく',
]);

const LEARNER_MATCH_HELPER_NAMES = new Set([
    'てください', 'ていただけませんか', 'ないでください', 'させてください', 'てほしい', 'てくれる / てもらう',
    'てしまう', 'てみる', 'ておく', 'ている', 'てある', 'てくる', 'ていく', 'てから',
]);

function japaneseLearnerMatch(name: string, rawMatch: string): string {
    let match = rawMatch.replace(/^(?:そして|それで|でも|また|しかし|それに|つまり|ただし|だから)/u, '');
    if (LEARNER_MATCH_HELPER_NAMES.has(name)) {
        const afterClauseBoundary = match.replace(/^.*(?:[、。！？!?]|たら|なら|ので|から)/u, '');
        if (afterClauseBoundary) match = afterClauseBoundary;
    }
    if (!LEARNER_MATCH_ENDING_NAMES.has(name)) return match;
    const afterLastParticle = match.replace(/^.*[はがをにへともやの]/u, '');
    return afterLastParticle || match;
}
