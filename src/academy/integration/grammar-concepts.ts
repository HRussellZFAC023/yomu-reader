import {
    getYomuGrammarRule,
    isYomuGrammarRuleId,
    YOMU_GRAMMAR_REGISTRY,
    type GrammarLevel,
} from '../../reader/study/grammar-registry';

const ACADEMY_GRAMMAR_CONCEPT_PREFIX = 'concept:grammar:';

export interface AcademyGrammarConcept {
    readonly conceptId: string;
    readonly ruleId: string;
    readonly name: string;
    readonly level: GrammarLevel;
    readonly exampleCount: number;
}

export interface AcademyGrammarConceptHome {
    readonly lessonId: 'authored-week:l1-l01';
    readonly sourceQuestionId: string;
    readonly activityId: string;
    readonly conceptId: string;
    readonly ruleId: string;
    readonly role: 'guided-practice' | 'cumulative-review';
}

export function grammarConceptId(ruleId: string): string {
    getYomuGrammarRule(ruleId);
    return `${ACADEMY_GRAMMAR_CONCEPT_PREFIX}${ruleId}`;
}

export function grammarRuleIdForConcept(conceptId: string): string | undefined {
    if (!conceptId.startsWith(ACADEMY_GRAMMAR_CONCEPT_PREFIX)) return undefined;
    const ruleId = conceptId.slice(ACADEMY_GRAMMAR_CONCEPT_PREFIX.length);
    return isYomuGrammarRuleId(ruleId) ? ruleId : undefined;
}

/** Total Academy identity projection over Yomu Reader's canonical grammar registry. */
export const ACADEMY_GRAMMAR_CONCEPTS: readonly AcademyGrammarConcept[] = Object.freeze(
    YOMU_GRAMMAR_REGISTRY.map(rule => Object.freeze({
        conceptId: grammarConceptId(rule.ruleId),
        ruleId: rule.ruleId,
        name: rule.name,
        level: rule.level,
        exampleCount: rule.examples.length,
    })),
);

function home(
    sourceQuestionId: string,
    ruleId: string,
    role: AcademyGrammarConceptHome['role'],
): AcademyGrammarConceptHome {
    return Object.freeze({
        lessonId: 'authored-week:l1-l01',
        sourceQuestionId,
        activityId: `authored:${sourceQuestionId}`,
        conceptId: grammarConceptId(ruleId),
        ruleId,
        role,
    });
}

/** First honest playable homes; unmapped registry rules remain concepts, not pretend lessons. */
export const ACADEMY_GRAMMAR_PLAYABLE_SLICE: readonly AcademyGrammarConceptHome[] = Object.freeze([
    home('l1-l01/ex-grammar-particle', 'particle-wa', 'guided-practice'),
    home('l1-l01/ex-grammar-negative', 'negative-copula-dewa-nai', 'guided-practice'),
    home('l1-l01/ex-review-desu', 'copula-desu-da', 'cumulative-review'),
]);

const PLAYABLE_CONCEPT_BY_SOURCE_QUESTION = new Map(
    ACADEMY_GRAMMAR_PLAYABLE_SLICE.map(item => [item.sourceQuestionId, item.conceptId]),
);

export function grammarConceptForAuthoredQuestion(sourceQuestionId: string): string | undefined {
    return PLAYABLE_CONCEPT_BY_SOURCE_QUESTION.get(sourceQuestionId);
}
