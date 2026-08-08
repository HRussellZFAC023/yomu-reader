import type { LearnerLanguageId } from '../locales';
import { CEFR_GRAMMAR_LEVEL_SCALE } from './cefr-grammar';
import { createLearningTargetGrammar, type LearningTargetGrammarRuleSpec } from './grammar';
import type {
    LearningTargetGrammar,
    LearningTargetGrammarLevelScale,
} from './types';

type FoundationGrammarTargetId = Exclude<LearnerLanguageId, 'de' | 'es' | 'fr' | 'ru'>;

const FOUNDATION_LEVEL = 'Foundation';
const HSK_STANDARD_COURSE_LEVEL_SCALE = Object.freeze({
    id: 'hsk-standard-course',
    levels: Object.freeze(['HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6']),
});
const YEE_CEFR_BAND_LEVEL_SCALE = Object.freeze({
    id: 'tr-yee-cefr-band',
    levels: Object.freeze(['A1–A2']),
});

function foundationScale(id: string): LearningTargetGrammarLevelScale {
    return Object.freeze({ id, levels: Object.freeze([FOUNDATION_LEVEL]) });
}

function oneRuleGrammar(
    referenceUrl: string,
    levelScale: LearningTargetGrammarLevelScale,
    rule: LearningTargetGrammarRuleSpec,
): LearningTargetGrammar {
    return createLearningTargetGrammar({ referenceUrl, levelScale, rules: [rule] });
}

function foundationGrammar(
    targetScaleId: string,
    referenceUrl: string,
    rule: Omit<LearningTargetGrammarRuleSpec, 'level'>,
): LearningTargetGrammar {
    return oneRuleGrammar(referenceUrl, foundationScale(targetScaleId), {
        ...rule,
        level: FOUNDATION_LEVEL,
    });
}

const ALBANIAN_EXISTENTIALS = 'https://edizionicafoscari.unive.it/media/pdf/journals/balcania-et-slavia/2024/1/iss-4-1-2024.pdf#page=18';
const CLASSICAL_GREEK_ONLINE = 'https://lrc.la.utexas.edu/eieol/grkol/0';
const MSA_NOMINAL_SENTENCES = 'https://openbooks.lib.msu.edu/elemarabicll/chapter/grammar-2/';
const CUHK_CANTONESE_NEGATION = 'https://www.cuhk.edu.hk/lin/cbrc/CantoneseGrammar/multimedia/13.htm';
const HSK_STANDARD_COURSE_3 = 'https://www.hskstandardcourse.com/hsk-standard-course-level-3/';
const PRINCETON_YUELAIYUE = 'https://commons.princeton.edu/chinesecharacters/%E8%B6%8A%E6%9D%A5%E8%B6%8A/';
const DANISH_PRESENTATIVE_DER = 'https://ordnet.dk/ddo/ordbog/der';
const DUTCH_PRESENTATIVE_ER = 'https://onzetaal.nl/taalloket/wel-of-geen-er';
const BRITISH_COUNCIL_THERE = 'https://learnenglish.britishcouncil.org/free-resources/grammar/a1-a2/using-there-there-are';
const FINNISH_POSSESSION = 'https://kielitoimistonohjepankki.fi/ohje/lauseenvastikkeet-tehdakseen-rakenne-pelaan-voittaakseni-rakenteen-tekija/';
const GREEK_NEGATION = 'https://www.greek-language.gr/digitalResources/modern_greek/tools/lexica/glossology_edu/iframe.html?heading=2&id=173';
const HUNGARIAN_POSSESSION = 'https://www.gutenberg.org/files/76725/76725-h/76725-h.htm';
const INDONESIAN_NEGATIVE_EXISTENTIAL = 'https://seasite.niu.edu/flin/archive/103_handouts/sentences_and_phrases.htm';
const ITALIAN_PRESENTATIVE_CI = 'https://www.treccani.it/enciclopedia/ci_%28La-grammatica-italiana%29/';
const KHMER_NEGATION = 'https://seasite.niu.edu/khmer/grammar_note/grammar_note7/grammar_note7_text.htm';
const KOREAN_DESIRE = 'https://krdict.korean.go.kr/eng/dicSearch/SearchView?ParaWordNo=62657';
const LAO_NEGATION = 'https://seasite.niu.edu/lao/LaoLanguage/grammar_notes/grammar2.htm';
const LATIN_NEGATIVE_COPULA = 'https://www.usu.edu/markdamen/Latin1000/Presentation/transcriptions/04T.pdf';
const MONGOLIAN_NEGATION = 'https://library.huree.edu.mn/data/201021/2023-05-19/An%20Elementary%20Mongolian%20Grammar%20%28%20PDFDrive.com%20%29.pdf';
const PERSIAN_NEGATIVE_COPULA = 'https://sites.la.utexas.edu/persian_online_resources/verbs/long-copulas-1/';
const POLISH_NEGATIVE_EXISTENTIAL = 'https://zpe.gov.pl/a/odmiana-rzeczownika-i-przymiotnika/D1DL299KT';
const PORTUGUESE_EXISTENTIAL_HAVER = 'https://ciberduvidas.iscte-iul.pt/consultorio/perguntas/haverexistir/3409';
const ROMANIAN_NECESSITY = 'https://slaviccenters.duke.edu/sites/slaviccenters.duke.edu/files/site-images/2016_romanian_verbs_conjugated.pdf';
const CROATIAN_EXISTENTIAL_NEMA = 'https://bosnian.coerll.utexas.edu/c8/m2/lekcija1/grammar/';
const SWEDISH_PRESENTATIVE_FINNS = 'https://svenska.se/grammatik/';
const TAGALOG_EXISTENTIALS = 'https://seasite.niu.edu/trans/tagalog/Grammar%201/Sentences1/Existential_Sentences.htm';
const THAI_COPULAR_NEGATION = 'https://seasite.niu.edu/thai/FLTH/1styearthai.htm';
const YEE_A1_A2 = 'https://turkceninsesi.yee.org.tr/programlar/hayatin-icinden-turkce.';
const YEE_VAR_YOK = 'https://turkceninsesi.yee.org.tr/programlar/hayatin-icinden4/hayatin-icinden4';
const VIETNAMESE_COMPLETION = 'https://seasite.niu.edu/vietnamese/uniLesson8/L8_grammar.htm';

/**
 * One deliberately narrow, source-checked construction for every target that
 * previously had only a reference link. `Foundation` is a catalogue scope,
 * not a claim of equivalence between proficiency systems.
 */
export const FOUNDATION_GRAMMAR_BY_TARGET = Object.freeze({
    sq: foundationGrammar('sq-foundation', ALBANIAN_EXISTENTIALS, {
        ruleId: 'sq-existential-ka-ketu',
        name: 'Existence with ka … këtu',
        displayNames: { en: 'Existence with ka … këtu', ja: 'ka … këtu の存在文' },
        patternSource: String.raw`(?<!\p{L})[Kk]a\s+\p{L}+(?:-\p{L}+)?\s+këtu(?!\p{L})`,
        priority: 20,
        confidence: 'high',
        url: ALBANIAN_EXISTENTIALS,
    }),
    grc: foundationGrammar('grc-classical-foundation', CLASSICAL_GREEK_ONLINE, {
        ruleId: 'grc-negation-ou',
        name: 'Negation with οὐ',
        displayNames: { en: 'Negation with οὐ', ja: 'οὐ による否定' },
        patternSource: String.raw`(?<!\p{L})(?:[Οο]ὐ|[Οο]ὐκ|[Οο]ὐχ)(?!\p{L})`,
        priority: 20,
        confidence: 'high',
        url: CLASSICAL_GREEK_ONLINE,
    }),
    ar: foundationGrammar('ar-msa-foundation', MSA_NOMINAL_SENTENCES, {
        ruleId: 'ar-msa-laysa-negation',
        name: 'Nominal negation with laysa',
        displayNames: { en: 'Nominal negation with laysa', ja: 'laysa（ليس）による名詞文の否定' },
        patternSource: String.raw`(?<!\p{L})(?:ليس|ليست|لست|لسنا|لستم|لستن|ليسا|ليستا|ليسوا|لسن)(?!\p{L})`,
        priority: 20,
        confidence: 'high',
        url: MSA_NOMINAL_SENTENCES,
    }),
    yue: foundationGrammar('yue-foundation', CUHK_CANTONESE_NEGATION, {
        ruleId: 'yue-copular-negation-m-haih',
        name: 'Copular negation with 唔係',
        displayNames: { en: 'Copular negation with 唔係', ja: '唔係 によるコピュラ否定' },
        patternSource: String.raw`唔係`,
        priority: 20,
        confidence: 'high',
        url: CUHK_CANTONESE_NEGATION,
    }),
    zh: oneRuleGrammar(HSK_STANDARD_COURSE_3, HSK_STANDARD_COURSE_LEVEL_SCALE, {
        ruleId: 'zh-hsk3-yuelaiyue',
        level: 'HSK 3',
        name: 'Increasing degree with 越来越',
        displayNames: { en: 'Increasing degree with 越来越', ja: '越来越 による程度変化' },
        patternSource: String.raw`(?:越来越|越來越)(?:冷|热|熱|好|忙|难|難|喜欢|喜歡|想)`,
        priority: 20,
        confidence: 'high',
        url: PRINCETON_YUELAIYUE,
    }),
    da: foundationGrammar('da-foundation', DANISH_PRESENTATIVE_DER, {
        ruleId: 'da-presentative-der-er',
        name: 'Presentative der er',
        displayNames: { en: 'Presentative der er', ja: 'der er の存在構文' },
        patternSource: String.raw`(?:^|(?<=[.!?…]\s))[Dd]er\s+er\s+(?:en|et|mange|ingen|to|tre|\d+)\s+\p{L}+(?!\p{L})`,
        priority: 20,
        confidence: 'high',
        url: DANISH_PRESENTATIVE_DER,
    }),
    nl: foundationGrammar('nl-foundation', DUTCH_PRESENTATIVE_ER, {
        ruleId: 'nl-presentative-er-is-zijn',
        name: 'Presentative er is / er zijn',
        displayNames: { en: 'Presentative er is / er zijn', ja: 'er is / er zijn の存在構文' },
        patternSource: String.raw`(?<!\p{L})[Ee]r\s+(?:is|zijn)\s+(?:een|geen|veel|twee|drie|\d+)\s+\p{L}+(?!\p{L})`,
        priority: 20,
        confidence: 'high',
        url: DUTCH_PRESENTATIVE_ER,
    }),
    en: oneRuleGrammar(BRITISH_COUNCIL_THERE, CEFR_GRAMMAR_LEVEL_SCALE, {
        ruleId: 'en-a1-there-is-are',
        level: 'A1',
        name: 'Existence with there is / there are',
        displayNames: { en: 'Existence with there is / there are', ja: 'there is / there are の存在文' },
        patternSource: String.raw`(?<!\p{L})[Tt]here\s+(?:is|are)\s+(?:a|an|some|many|no|one|two|three|\d+)\s+\p{L}+(?!\p{L})`,
        priority: 20,
        confidence: 'high',
        url: BRITISH_COUNCIL_THERE,
    }),
    fi: foundationGrammar('fi-foundation', FINNISH_POSSESSION, {
        ruleId: 'fi-adessive-possession',
        name: 'Possession with adessive + on',
        displayNames: { en: 'Possession with adessive + on', ja: '接格 ＋ on の所有文' },
        patternSource: String.raw`(?<!\p{L})(?:[Mm]inulla|[Ss]inulla|[Hh]änellä|[Mm]eillä|[Tt]eillä|[Hh]eillä)\s+on(?!\p{L})`,
        priority: 20,
        confidence: 'high',
        url: FINNISH_POSSESSION,
    }),
    el: foundationGrammar('el-modern-foundation', GREEK_NEGATION, {
        ruleId: 'el-indicative-negation-den',
        name: 'Indicative negation with δεν',
        displayNames: { en: 'Indicative negation with δεν', ja: 'δεν による直説法の否定' },
        patternSource: String.raw`(?<!\p{L})[Δδ]εν\s+\p{L}{2,}(?!\p{L})`,
        priority: 20,
        confidence: 'high',
        url: GREEK_NEGATION,
    }),
    hu: foundationGrammar('hu-foundation', HUNGARIAN_POSSESSION, {
        ruleId: 'hu-dative-possession-van',
        name: 'Possession with dative + van',
        displayNames: { en: 'Possession with dative + van', ja: '与格 ＋ van の所有文' },
        patternSource: String.raw`(?<!\p{L})(?:[Nn]ekem|[Nn]eked|[Nn]eki|[Nn]ekünk|[Nn]ektek|[Nn]ekik)\s+van(?!\p{L})`,
        priority: 20,
        confidence: 'high',
        url: HUNGARIAN_POSSESSION,
    }),
    id: foundationGrammar('id-foundation', INDONESIAN_NEGATIVE_EXISTENTIAL, {
        ruleId: 'id-negative-existential-tidak-ada',
        name: 'Negative existence with tidak ada',
        displayNames: { en: 'Negative existence with tidak ada', ja: 'tidak ada の否定存在文' },
        patternSource: String.raw`(?<!\p{L})[Tt]idak\s+ada(?!\p{L})`,
        priority: 20,
        confidence: 'high',
        url: INDONESIAN_NEGATIVE_EXISTENTIAL,
    }),
    it: foundationGrammar('it-foundation', ITALIAN_PRESENTATIVE_CI, {
        ruleId: 'it-presentative-ci',
        name: 'Presentative c’è / ci sono',
        displayNames: { en: 'Presentative c’è / ci sono', ja: 'c’è / ci sono の存在構文' },
        patternSource: String.raw`(?<!\p{L})(?:[Cc][’']è|[Cc]i\s+sono)\s+(?:un|uno|una|due|tre|molti|molte|alcuni|alcune)\s+\p{L}+(?!\p{L})`,
        priority: 20,
        confidence: 'high',
        url: ITALIAN_PRESENTATIVE_CI,
    }),
    km: foundationGrammar('km-foundation', KHMER_NEGATION, {
        ruleId: 'km-discontinuous-negation',
        name: 'Discontinuous negation with មិន … ទេ',
        displayNames: { en: 'Discontinuous negation with មិន … ទេ', ja: 'មិន … ទេ の呼応否定' },
        patternSource: String.raw`មិន[^\n។៕!?]{1,50}?ទេ`,
        priority: 20,
        confidence: 'high',
        url: KHMER_NEGATION,
    }),
    ko: foundationGrammar('ko-foundation', KOREAN_DESIRE, {
        ruleId: 'ko-desire-go-sipda',
        name: 'Desire with -고 싶다',
        displayNames: { en: 'Desire with -고 싶다', ja: '-고 싶다（希望）' },
        patternSource: String.raw`[가-힣]{1,8}고\s+싶(?:다|어요|습니다|어|었어요|었다|습니까|니|죠)(?![가-힣])`,
        priority: 20,
        confidence: 'high',
        url: KOREAN_DESIRE,
    }),
    lo: foundationGrammar('lo-foundation', LAO_NEGATION, {
        ruleId: 'lo-preverbal-negation-bo',
        name: 'Preverbal negation with ບໍ່',
        displayNames: { en: 'Preverbal negation with ບໍ່', ja: 'ບໍ່ による動詞・形容詞の否定' },
        patternSource: String.raw`ບໍ່\s*(?:ແມ່ນ|ໄປ|ມາ|ມັກ|ດີ|ງາມ|ຮູ້)`,
        priority: 20,
        confidence: 'high',
        url: LAO_NEGATION,
    }),
    la: foundationGrammar('la-classical-foundation', LATIN_NEGATIVE_COPULA, {
        ruleId: 'la-negative-copula-non-est',
        name: 'Negative copula with nōn est',
        displayNames: { en: 'Negative copula with nōn est', ja: 'nōn est によるコピュラ否定' },
        patternSource: String.raw`(?<!\p{L})[Nn][oō]n\s+est(?!\p{L})`,
        priority: 20,
        confidence: 'high',
        url: LATIN_NEGATIVE_COPULA,
    }),
    mn: foundationGrammar('mn-khalkha-foundation', MONGOLIAN_NEGATION, {
        ruleId: 'mn-nominal-negation-bish',
        name: 'Nominal negation with биш',
        displayNames: { en: 'Nominal negation with биш', ja: 'биш による名詞文の否定' },
        patternSource: String.raw`(?<!\p{L})биш(?!\p{L})`,
        priority: 20,
        confidence: 'high',
        url: MONGOLIAN_NEGATION,
    }),
    fa: foundationGrammar('fa-iranian-foundation', PERSIAN_NEGATIVE_COPULA, {
        ruleId: 'fa-negative-long-copula',
        name: 'Negative long copula',
        displayNames: { en: 'Negative long copula', ja: '否定長形コピュラ نیست' },
        patternSource: String.raw`(?<!\p{L})نیست(?:م|ی|یم|ید|ند)?(?!\p{L})`,
        priority: 20,
        confidence: 'high',
        url: PERSIAN_NEGATIVE_COPULA,
    }),
    pl: foundationGrammar('pl-foundation', POLISH_NEGATIVE_EXISTENTIAL, {
        ruleId: 'pl-negative-existential-nie-ma',
        name: 'Absence or non-possession with nie ma + genitive',
        displayNames: { en: 'Absence or non-possession with nie ma + genitive', ja: 'nie ma ＋ 生格（不在・非所有）' },
        patternSource: String.raw`(?<!\p{L})[Nn]ie\s+ma(?!\p{L})`,
        priority: 20,
        confidence: 'high',
        url: POLISH_NEGATIVE_EXISTENTIAL,
    }),
    pt: foundationGrammar('pt-foundation', PORTUGUESE_EXISTENTIAL_HAVER, {
        ruleId: 'pt-existential-ha',
        name: 'Existence with impersonal há',
        displayNames: { en: 'Existence with impersonal há', ja: '非人称 há の存在文' },
        patternSource: String.raw`(?<!\p{L})[Hh]á\s+(?:um|uma|dois|duas|três|muitos|muitas|alguns|algumas)\s+(?:pessoas?|problemas?|livros?|casas?|lugares?)(?!\p{L})`,
        priority: 20,
        confidence: 'high',
        url: PORTUGUESE_EXISTENTIAL_HAVER,
    }),
    ro: foundationGrammar('ro-foundation', ROMANIAN_NECESSITY, {
        ruleId: 'ro-necessity-trebuie-sa',
        name: 'Necessity with trebuie să',
        displayNames: { en: 'Necessity with trebuie să', ja: 'trebuie să による必要・義務' },
        patternSource: String.raw`(?<!\p{L})[Tt]rebuie\s+să\s+\p{Ll}{2,}(?!\p{L})`,
        priority: 20,
        confidence: 'high',
        url: ROMANIAN_NECESSITY,
    }),
    sh: foundationGrammar('sh-shtokavian-foundation', CROATIAN_EXISTENTIAL_NEMA, {
        ruleId: 'sh-existential-nema-genitive',
        name: 'Absence or non-possession with nema + genitive',
        displayNames: { en: 'Absence or non-possession with nema + genitive', ja: 'nema ＋ 生格（不在・非所有）' },
        patternSource: String.raw`(?<!\p{L})[Nn]ema\s+(?:kave|kruha|vode|problema|vremena|ljudi)(?!\p{L})`,
        priority: 20,
        confidence: 'high',
        url: CROATIAN_EXISTENTIAL_NEMA,
    }),
    sv: foundationGrammar('sv-foundation', SWEDISH_PRESENTATIVE_FINNS, {
        ruleId: 'sv-presentative-det-finns',
        name: 'Presentative det finns',
        displayNames: { en: 'Presentative det finns', ja: 'det finns の存在構文' },
        patternSource: String.raw`(?<!\p{L})[Dd]et\s+finns\s+(?:en|ett|många|inga|två|tre|\d+)\s+\p{L}+(?!\p{L})`,
        priority: 20,
        confidence: 'high',
        url: SWEDISH_PRESENTATIVE_FINNS,
    }),
    tl: foundationGrammar('tl-tagalog-foundation', TAGALOG_EXISTENTIALS, {
        ruleId: 'tl-existential-may-mayroon',
        name: 'Existence with may / mayroon',
        displayNames: { en: 'Existence with may / mayroon', ja: 'may / mayroon の存在文' },
        patternSource: String.raw`(?<!\p{L})(?:[Mm]ay|[Mm]ayroon(?:g)?)\s+(?:isang|mga|dalawang|tatlong|\p{L}{3,})(?!\p{L})`,
        priority: 20,
        confidence: 'high',
        url: TAGALOG_EXISTENTIALS,
    }),
    th: foundationGrammar('th-foundation', THAI_COPULAR_NEGATION, {
        ruleId: 'th-copular-negation-mai-chai',
        name: 'Copular negation with ไม่ใช่',
        displayNames: { en: 'Copular negation with ไม่ใช่', ja: 'ไม่ใช่ によるコピュラ否定' },
        patternSource: String.raw`ไม่ใช่`,
        priority: 20,
        confidence: 'high',
        url: THAI_COPULAR_NEGATION,
    }),
    tr: oneRuleGrammar(YEE_A1_A2, YEE_CEFR_BAND_LEVEL_SCALE, {
        ruleId: 'tr-a1-a2-existence-var-yok',
        level: 'A1–A2',
        name: 'Existence or possession with var / yok',
        displayNames: { en: 'Existence or possession with var / yok', ja: 'var / yok の存在・所有文' },
        patternSource: String.raw`(?<!\p{L})(?:bir\s+)?\p{L}{2,}\s+(?:var|yok)(?!\p{L})`,
        priority: 20,
        confidence: 'high',
        url: YEE_VAR_YOK,
    }),
    vi: foundationGrammar('vi-foundation', VIETNAMESE_COMPLETION, {
        ruleId: 'vi-completed-da-roi',
        name: 'Completed action with đã … rồi',
        displayNames: { en: 'Completed action with đã … rồi', ja: 'đã … rồi の完了表現' },
        patternSource: String.raw`(?<!\p{L})[Đđ]ã\s+[^\n.!?]{1,50}?\s+rồi(?!\p{L})`,
        priority: 20,
        confidence: 'high',
        url: VIETNAMESE_COMPLETION,
    }),
} satisfies Readonly<Record<FoundationGrammarTargetId, LearningTargetGrammar>>);
