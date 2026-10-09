import { GRAMMAR_PATTERN_DATA } from './grammar-data';

export type GrammarLevel = 'Core' | 'N5' | 'N4' | 'N3' | 'N2' | 'N1';
export type GrammarConfidence = 'high' | 'medium';

export interface GrammarExample {
    readonly japanese: string;
    readonly english: string;
    readonly note?: string;
}

export interface YomuGrammarRule {
    readonly ruleId: string;
    readonly level: GrammarLevel;
    readonly name: string;
    readonly patternSource: string;
    readonly priority: number;
    readonly confidence: GrammarConfidence;
    readonly url: string;
    readonly examples: readonly GrammarExample[];
}

function expandGrammarGuideUrl(url: string): string {
    if (!url) return '';
    return url
        .replace('@g/', 'https://www.tofugu.com/japanese-grammar/')
        .replace('@j/', 'https://www.tofugu.com/japanese/');
}

function parseGrammarRule(row: string): YomuGrammarRule {
    const [ruleId, level, name, patternSource, priority, confidence = 'm', url = ''] = row.split('\t');
    if (!ruleId || !name || !patternSource || !priority) throw new TypeError(`Invalid Yomu grammar registry row: ${row}`);
    if (!['Core', 'N5', 'N4', 'N3', 'N2', 'N1'].includes(level)) {
        throw new TypeError(`Invalid Yomu grammar level for ${ruleId}: ${level}`);
    }
    return Object.freeze({
        ruleId,
        level: level as GrammarLevel,
        name,
        patternSource,
        priority: parseInt(priority, 36),
        confidence: confidence === 'h' ? 'high' : 'medium',
        url: expandGrammarGuideUrl(url),
        // Per-rule examples ship only as test fixtures (tests/reader/fixtures/
        // grammar-rule-examples.ts); the reader render path uses remote copy JSON.
        examples: Object.freeze([]),
    });
}

/**
 * Parses the tab-separated rule table. Leading spaces are not part of a row:
 * the extension compiler indents template-literal text along with the code,
 * which otherwise prefixed every rule id after the first with four spaces.
 */
export function parseGrammarRegistry(data: string): readonly YomuGrammarRule[] {
    const rules = data.trim().split('\n').map(row => parseGrammarRule(row.replace(/^ +/u, '')));
    const ids = new Set(rules.map(rule => rule.ruleId));
    if (ids.size !== rules.length) throw new TypeError('Yomu grammar registry contains duplicate rule ids.');
    return Object.freeze(rules);
}

/** Canonical metadata for every grammar rule detected by Yomu Reader. */
export const YOMU_GRAMMAR_REGISTRY = parseGrammarRegistry(GRAMMAR_PATTERN_DATA);

const GRAMMAR_RULES_BY_ID = new Map(YOMU_GRAMMAR_REGISTRY.map(rule => [rule.ruleId, rule]));

export function isYomuGrammarRuleId(ruleId: string): boolean {
    return GRAMMAR_RULES_BY_ID.has(ruleId);
}

export function getYomuGrammarRule(ruleId: string): YomuGrammarRule {
    const rule = GRAMMAR_RULES_BY_ID.get(ruleId);
    if (!rule) throw new TypeError(`Unknown Yomu grammar rule: ${ruleId}`);
    return rule;
}
