import { CEFR_GRAMMAR_LEVEL_SCALE } from './cefr-grammar';
import { createLearningTargetGrammar } from './grammar';

const CERVANTES_A1_A2 = 'https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/niveles/02_gramatica_inventario_a1-a2.htm';
// A checked grammar form inside a sentence starts lower-case. That narrow
// boundary rejects proper names such as Pilar and Fernando that happen to end
// like an infinitive or gerund.
const SPANISH_INFINITIVE = String.raw`(?:ir|\p{Ll}[\p{L}\p{M}]*(?:ar|er|ir))(?:me|te|se|lo|la|los|las|le|les|nos|os)?`;
const SPANISH_PARTICIPLE = String.raw`(?:ido|\p{Ll}[\p{L}\p{M}]*(?:ado|ido)|hecho|escrito|visto)`;
const SPANISH_GERUND = String.raw`(?:yendo|\p{Ll}[\p{L}\p{M}]*(?:ando|iendo|yendo))`;

/**
 * Conservative starter patterns from Instituto Cervantes's A1-A2 inventory.
 * Each detector is intentionally narrower than the construction it names.
 */
export const SPANISH_GRAMMAR = createLearningTargetGrammar({
    levelScale: CEFR_GRAMMAR_LEVEL_SCALE,
    referenceUrl: CERVANTES_A1_A2,
    rules: [
        {
            ruleId: 'es-me-gusta-infinitive',
            level: 'A1',
            name: 'gustar + infinitive',
            displayNames: { en: 'gustar + infinitive', ja: 'gustar ＋ 不定詞' },
            patternSource: String.raw`(?<!\p{L})[Mm]e\s+gusta\s+${SPANISH_INFINITIVE}(?!\p{L})`,
            priority: 10,
            confidence: 'high',
            url: `${CERVANTES_A1_A2}#p1223a1`,
        },
        {
            ruleId: 'es-existential-hay',
            level: 'A1',
            name: 'Existence with hay',
            displayNames: { en: 'Existence with hay', ja: '存在を表す hay' },
            patternSource: String.raw`(?<!\p{L})[Hh]ay\s+(?:un(?:a|os|as)?|much(?:o|a|os|as)|poc(?:o|a|os|as)|\d+|(?:dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez))\s+\p{L}+(?!\p{L})`,
            priority: 12,
            confidence: 'high',
            url: `${CERVANTES_A1_A2}#p133a1`,
        },
        {
            ruleId: 'es-causal-porque',
            level: 'A1',
            name: 'Reason with porque',
            displayNames: { en: 'Reason with porque', ja: '理由を表す porque' },
            patternSource: String.raw`(?<!\p{L})[Pp]orque(?!\p{L})`,
            priority: 14,
            confidence: 'high',
            url: `${CERVANTES_A1_A2}#p1534a1`,
        },
        {
            ruleId: 'es-negation-no',
            level: 'A1',
            name: 'Verb negation with no',
            displayNames: { en: 'Verb negation with no', ja: 'no ＋ 動詞' },
            patternSource: String.raw`(?<!\p{L})[Nn]o\s+(?:soy|eres|es|somos|sois|son|estoy|estás|está|estamos|estáis|están|tengo|tienes|tiene|tenemos|tenéis|tienen)(?!\p{L})`,
            priority: 16,
            confidence: 'high',
            url: `${CERVANTES_A1_A2}#p133a1`,
        },
        {
            ruleId: 'es-present-perfect',
            level: 'A2',
            name: 'Present perfect',
            displayNames: { en: 'Present perfect', ja: 'haber ＋ 過去分詞' },
            patternSource: String.raw`(?<!\p{L})[Hh](?:e|as|a|emos|abéis|an)\s+${SPANISH_PARTICIPLE}(?!\p{L})`,
            priority: 18,
            confidence: 'high',
            url: `${CERVANTES_A1_A2}#p916a2`,
        },
        {
            ruleId: 'es-estar-gerundio',
            level: 'A2',
            name: 'Progressive with estar',
            displayNames: { en: 'Progressive with estar', ja: 'estar ＋ 現在分詞' },
            patternSource: String.raw`(?<!\p{L})[Ee]st(?:oy|ás|á|amos|áis|án)\s+${SPANISH_GERUND}(?!\p{L})`,
            priority: 20,
            confidence: 'high',
            url: `${CERVANTES_A1_A2}#p942a2`,
        },
        {
            ruleId: 'es-tener-que',
            level: 'A2',
            name: 'Obligation with tener que',
            displayNames: { en: 'Obligation with tener que', ja: 'tener que ＋ 不定詞' },
            patternSource: String.raw`(?<!\p{L})[Tt](?:engo|ienes|iene|enemos|enéis|ienen)\s+que\s+${SPANISH_INFINITIVE}(?!\p{L})`,
            priority: 22,
            confidence: 'high',
            url: `${CERVANTES_A1_A2}#p121a2`,
        },
        {
            ruleId: 'es-ir-a-infinitive',
            level: 'A2',
            name: 'Near future with ir a',
            displayNames: { en: 'Near future with ir a', ja: 'ir a ＋ 不定詞' },
            patternSource: String.raw`(?<!\p{L})[Vv](?:oy|as|a|amos|ais|an)\s+a\s+${SPANISH_INFINITIVE}(?!\p{L})`,
            priority: 24,
            confidence: 'high',
            url: `${CERVANTES_A1_A2}#p121a2`,
        },
    ],
});
