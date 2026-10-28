import { describe, expect, it } from 'vitest';
import { GRAMMAR_PATTERN_DATA } from '../../src/reader/study/grammar-data';
import { parseGrammarRegistry, YOMU_GRAMMAR_REGISTRY } from '../../src/reader/study/grammar-registry';

describe('grammar registry in the compiled extension', () => {
    // UserScript Compiler indents the whole userscript body by four spaces,
    // template-literal text included, so the packaged content script sees
    // every rule row after the first with leading spaces.
    it('keeps the authored rule ids when the rule table arrives indented', () => {
        const compiled = GRAMMAR_PATTERN_DATA.split('\n').map(line => `    ${line}`).join('\n');
        const ids = parseGrammarRegistry(compiled).map(rule => rule.ruleId);
        expect(ids).toEqual(YOMU_GRAMMAR_REGISTRY.map(rule => rule.ruleId));
        expect(ids.every(id => id === id.trim())).toBe(true);
    });
});
