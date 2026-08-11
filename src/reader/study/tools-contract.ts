export interface GrammarHint {
    ruleId: string;
    name: string;
    displayNames?: Readonly<{ en: string; ja: string }>;
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

/** Opaque level name from the active target's declared scale. */
export type GrammarLevel = string;

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

export interface SentenceTranslationResult {
    text: string;
    outputLanguage: string;
}
