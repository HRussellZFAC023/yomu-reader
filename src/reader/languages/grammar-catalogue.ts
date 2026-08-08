import type { LearnerLanguageId } from '../locales';
import { FRENCH_GRAMMAR } from './french-grammar';
import { GERMAN_GRAMMAR } from './german-grammar';
import { FOUNDATION_GRAMMAR_BY_TARGET } from './grammar-foundations';
import { RUSSIAN_GRAMMAR } from './russian-grammar';
import { SPANISH_GRAMMAR } from './spanish-grammar';
import type { LearningTargetGrammar } from './types';

/**
 * One honest Grammar Adapter for every non-Japanese target in the fixed roster.
 * Each target owns its scale, checked inventory, detector and source link;
 * shared Study code remains unaware of the selected language.
 */
const GRAMMAR_BY_TARGET = Object.freeze({
    sq: FOUNDATION_GRAMMAR_BY_TARGET.sq,
    grc: FOUNDATION_GRAMMAR_BY_TARGET.grc,
    ar: FOUNDATION_GRAMMAR_BY_TARGET.ar,
    yue: FOUNDATION_GRAMMAR_BY_TARGET.yue,
    zh: FOUNDATION_GRAMMAR_BY_TARGET.zh,
    da: FOUNDATION_GRAMMAR_BY_TARGET.da,
    nl: FOUNDATION_GRAMMAR_BY_TARGET.nl,
    en: FOUNDATION_GRAMMAR_BY_TARGET.en,
    fi: FOUNDATION_GRAMMAR_BY_TARGET.fi,
    fr: FRENCH_GRAMMAR,
    de: GERMAN_GRAMMAR,
    el: FOUNDATION_GRAMMAR_BY_TARGET.el,
    hu: FOUNDATION_GRAMMAR_BY_TARGET.hu,
    id: FOUNDATION_GRAMMAR_BY_TARGET.id,
    it: FOUNDATION_GRAMMAR_BY_TARGET.it,
    km: FOUNDATION_GRAMMAR_BY_TARGET.km,
    ko: FOUNDATION_GRAMMAR_BY_TARGET.ko,
    lo: FOUNDATION_GRAMMAR_BY_TARGET.lo,
    la: FOUNDATION_GRAMMAR_BY_TARGET.la,
    mn: FOUNDATION_GRAMMAR_BY_TARGET.mn,
    fa: FOUNDATION_GRAMMAR_BY_TARGET.fa,
    pl: FOUNDATION_GRAMMAR_BY_TARGET.pl,
    pt: FOUNDATION_GRAMMAR_BY_TARGET.pt,
    ro: FOUNDATION_GRAMMAR_BY_TARGET.ro,
    ru: RUSSIAN_GRAMMAR,
    sh: FOUNDATION_GRAMMAR_BY_TARGET.sh,
    es: SPANISH_GRAMMAR,
    sv: FOUNDATION_GRAMMAR_BY_TARGET.sv,
    tl: FOUNDATION_GRAMMAR_BY_TARGET.tl,
    th: FOUNDATION_GRAMMAR_BY_TARGET.th,
    tr: FOUNDATION_GRAMMAR_BY_TARGET.tr,
    vi: FOUNDATION_GRAMMAR_BY_TARGET.vi,
} satisfies Readonly<Record<LearnerLanguageId, LearningTargetGrammar>>);

export function grammarForRosterTarget(language: LearnerLanguageId): LearningTargetGrammar {
    return GRAMMAR_BY_TARGET[language];
}
