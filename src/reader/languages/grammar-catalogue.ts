import type { LearnerLanguageId } from '../locales';
import { FRENCH_GRAMMAR } from './french-grammar';
import { GERMAN_GRAMMAR } from './german-grammar';
import { createLearningTargetGrammar } from './grammar';
import { RUSSIAN_GRAMMAR } from './russian-grammar';
import { SPANISH_GRAMMAR } from './spanish-grammar';
import type { LearningTargetGrammar } from './types';

function referenceOnly(referenceUrl: string): LearningTargetGrammar {
    return createLearningTargetGrammar({ referenceUrl });
}

/**
 * One honest Grammar Adapter for every non-Japanese target in the fixed roster.
 * A reference-only Adapter intentionally has zero rules, so the derived
 * capability remains false while Study can still offer a useful next step.
 */
const GRAMMAR_BY_TARGET = Object.freeze({
    sq: referenceOnly('https://lrc.la.utexas.edu/eieol_toc/albol'),
    grc: referenceOnly('https://en.wikipedia.org/wiki/Ancient_Greek_grammar'),
    ar: referenceOnly('https://en.wikipedia.org/wiki/Arabic_grammar'),
    yue: referenceOnly('https://en.wikipedia.org/wiki/Cantonese_grammar'),
    zh: referenceOnly('https://en.wikipedia.org/wiki/Chinese_grammar'),
    da: referenceOnly('https://en.wikipedia.org/wiki/Danish_grammar'),
    nl: referenceOnly('https://en.wikipedia.org/wiki/Dutch_grammar'),
    en: referenceOnly('https://en.wikipedia.org/wiki/English_grammar'),
    fi: referenceOnly('https://en.wikipedia.org/wiki/Finnish_grammar'),
    fr: FRENCH_GRAMMAR,
    de: GERMAN_GRAMMAR,
    el: referenceOnly('https://en.wikipedia.org/wiki/Modern_Greek_grammar'),
    hu: referenceOnly('https://en.wikipedia.org/wiki/Hungarian_grammar'),
    id: referenceOnly('https://seasite.niu.edu/indonesian/TataBahasa/'),
    it: referenceOnly('https://en.wikipedia.org/wiki/Italian_grammar'),
    km: referenceOnly('https://en.wikipedia.org/wiki/Khmer_grammar'),
    ko: referenceOnly('https://en.wikipedia.org/wiki/Korean_grammar'),
    lo: referenceOnly('https://en.wikipedia.org/wiki/Lao_grammar'),
    la: referenceOnly('https://en.wikipedia.org/wiki/Latin_grammar'),
    mn: referenceOnly('https://www.mongolianlanguage.mn/free-lessons/mongolian-grammar-forms'),
    fa: referenceOnly('https://en.wikipedia.org/wiki/Persian_grammar'),
    pl: referenceOnly('https://en.wikipedia.org/wiki/Polish_grammar'),
    pt: referenceOnly('https://en.wikipedia.org/wiki/Portuguese_grammar'),
    ro: referenceOnly('https://en.wikipedia.org/wiki/Romanian_grammar'),
    ru: RUSSIAN_GRAMMAR,
    sh: referenceOnly('https://en.wikipedia.org/wiki/Serbo-Croatian_grammar'),
    es: SPANISH_GRAMMAR,
    sv: referenceOnly('https://en.wikipedia.org/wiki/Swedish_grammar'),
    tl: referenceOnly('https://en.wikipedia.org/wiki/Tagalog_grammar'),
    th: referenceOnly('https://www.chula.ac.th/en/highlight/123363/'),
    tr: referenceOnly('https://en.wikipedia.org/wiki/Turkish_grammar'),
    vi: referenceOnly('https://en.wikipedia.org/wiki/Vietnamese_grammar'),
} satisfies Readonly<Record<LearnerLanguageId, LearningTargetGrammar>>);

export function grammarForRosterTarget(language: LearnerLanguageId): LearningTargetGrammar {
    return GRAMMAR_BY_TARGET[language];
}
