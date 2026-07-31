import { CEFR_GRAMMAR_LEVEL_SCALE } from './cefr-grammar';
import { createLearningTargetGrammar } from './grammar';

const EAQUALS_PDF = 'https://www.eaquals.org/wp-content/uploads/Inventaire_ONLINE_full.pdf';
const EAQUALS_A1 = `${EAQUALS_PDF}#page=58`;
const EAQUALS_A1_EXAMPLES = `${EAQUALS_PDF}#page=66`;
const EAQUALS_A1_EXISTENCE = `${EAQUALS_PDF}#page=67`;
const A1_PROGRESSIVE_INFINITIVE = String.raw`(?:manger|préparer|étudier)`;
const A1_NEAR_FUTURE_INFINITIVE = String.raw`(?:manger|regarder|jouer)`;
const A1_RECENT_PAST_INFINITIVE = String.raw`(?:finir|manger)`;
const A1_IL_FAUT_INFINITIVE = String.raw`(?:bien\s+apprendre|apprendre|crier)`;
const A1_POLITE_CONDITIONAL = String.raw`(?:[Jj]e\s+voudrais|[Jj]['’]aimerais|[Oo]n\s+pourrait\s+avoir\s+l['’]addition)`;
const A1_EXISTENTIAL_COMPLEMENT = String.raw`(?:un\s+canapé|un\s+fauteuil|une\s+table|cinq\s+personnes|beaucoup\s+de\s+restaurants|du\s+soleil)`;

/**
 * Conservative A1 starter patterns from the CIEP/Eaquals CEFR inventory.
 * The inventory names the constructions; these bounded forms avoid claiming
 * broader French parsing than the checked examples support.
 */
export const FRENCH_GRAMMAR = createLearningTargetGrammar({
    levelScale: CEFR_GRAMMAR_LEVEL_SCALE,
    referenceUrl: EAQUALS_A1,
    rules: [
        {
            ruleId: 'fr-present-progressive',
            level: 'A1',
            name: 'Present progressive (être en train de)',
            displayNames: { en: 'Present progressive (être en train de)', ja: 'être en train de ＋ 不定詞' },
            patternSource: String.raw`(?<!\p{L})(?:[Jj]e\s+suis|[Tt]u\s+es|[Ii]l\s+est|[Ee]lle\s+est|[Nn]ous\s+sommes|[Vv]ous\s+êtes|[Ii]ls\s+sont|[Ee]lles\s+sont)\s+en\s+train\s+d(?:e\s+|['’])${A1_PROGRESSIVE_INFINITIVE}(?!\p{L})`,
            priority: 10,
            confidence: 'high',
            url: EAQUALS_A1_EXAMPLES,
        },
        {
            ruleId: 'fr-near-future',
            level: 'A1',
            name: 'Near future (aller + infinitive)',
            displayNames: { en: 'Near future (aller + infinitive)', ja: 'aller ＋ 不定詞' },
            patternSource: String.raw`(?<!\p{L})(?:[Jj]e\s+vais|[Tt]u\s+vas|[Ii]l\s+va|[Ee]lle\s+va|[Nn]ous\s+allons|[Vv]ous\s+allez|[Ii]ls\s+vont|[Ee]lles\s+vont)\s+${A1_NEAR_FUTURE_INFINITIVE}(?!\p{L})`,
            priority: 12,
            confidence: 'high',
            url: EAQUALS_A1_EXAMPLES,
        },
        {
            ruleId: 'fr-recent-past',
            level: 'A1',
            name: 'Recent past (venir de + infinitive)',
            displayNames: { en: 'Recent past (venir de + infinitive)', ja: 'venir de ＋ 不定詞' },
            patternSource: String.raw`(?<!\p{L})(?:[Jj]e\s+viens|[Tt]u\s+viens|[Ii]l\s+vient|[Ee]lle\s+vient|[Nn]ous\s+venons|[Vv]ous\s+venez|[Ii]ls\s+viennent|[Ee]lles\s+viennent)\s+d(?:e\s+|['’])${A1_RECENT_PAST_INFINITIVE}(?!\p{L})`,
            priority: 14,
            confidence: 'high',
            url: EAQUALS_A1_EXAMPLES,
        },
        {
            ruleId: 'fr-est-ce-que-question',
            level: 'A1',
            name: 'Question with est-ce que',
            displayNames: { en: 'Question with est-ce que', ja: 'est-ce que 疑問文' },
            patternSource: String.raw`(?<!\p{L})[Ee]st-ce\s+qu(?:e(?!\p{L})|['’])`,
            priority: 16,
            confidence: 'high',
            url: EAQUALS_A1_EXAMPLES,
        },
        {
            ruleId: 'fr-ne-pas-negation',
            level: 'A1',
            name: 'Negation with ne … pas/jamais',
            displayNames: { en: 'Negation with ne … pas/jamais', ja: 'ne … pas / jamais の否定' },
            patternSource: String.raw`(?<!\p{L})(?:[Jj]e|[Tt]u|[Ii]l|[Ee]lle|[Nn]ous|[Vv]ous|[Ii]ls|[Ee]lles)\s+n(?:e\s+|['’])\p{L}+(?:\s+\p{L}+){0,2}\s+(?:pas|jamais)(?!\p{L})`,
            priority: 18,
            confidence: 'high',
            url: EAQUALS_A1_EXAMPLES,
        },
        {
            ruleId: 'fr-il-faut-infinitive',
            level: 'A1',
            name: 'Obligation with il faut',
            displayNames: { en: 'Obligation with il faut', ja: 'il faut ＋ 不定詞' },
            patternSource: String.raw`(?<!\p{L})[Ii]l\s+faut\s+${A1_IL_FAUT_INFINITIVE}(?!\p{L})`,
            priority: 20,
            confidence: 'high',
            url: EAQUALS_A1_EXAMPLES,
        },
        {
            ruleId: 'fr-polite-conditional',
            level: 'A1',
            name: 'Polite conditional',
            displayNames: { en: 'Polite conditional', ja: '丁寧表現の条件法' },
            patternSource: String.raw`(?<!\p{L})${A1_POLITE_CONDITIONAL}(?!\p{L})`,
            priority: 22,
            confidence: 'high',
            url: EAQUALS_A1_EXAMPLES,
        },
        {
            ruleId: 'fr-existential-il-y-a',
            level: 'A1',
            name: 'Existence with il y a',
            displayNames: { en: 'Existence with il y a', ja: '存在を表す il y a' },
            patternSource: String.raw`(?<!\p{L})[Ii]l\s+y\s+a\s+${A1_EXISTENTIAL_COMPLEMENT}(?!\p{L})`,
            priority: 24,
            confidence: 'high',
            url: EAQUALS_A1_EXISTENCE,
        },
    ],
});
