import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    GRAMMAR_PREFERENCES_KEY,
    readGrammarKnowledge,
    readGrammarPreferences,
    setGrammarRuleKnowledge,
    setGrammarRuleKnown,
} from '../../src/reader/study/grammar-knowledge';

describe('shared grammar knowledge state', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.stubGlobal('GM_getValue', undefined);
        vi.stubGlobal('GM_setValue', undefined);
    });

    afterEach(() => {
        localStorage.clear();
        vi.unstubAllGlobals();
    });

    it('migrates the Reader boolean preference into the canonical knowledge map', () => {
        localStorage.setItem(GRAMMAR_PREFERENCES_KEY, JSON.stringify({
            knownRuleIds: ['particle-wa', 'not-a-real-rule'],
            showKnown: true,
        }));

        expect(readGrammarKnowledge()).toEqual({
            entries: {
                'particle-wa': {
                    knowledge: 'known',
                    at: 0,
                    changeId: 'grammar-known:legacy:particle-wa',
                },
            },
            showKnown: true,
        });
        expect(readGrammarPreferences()).toEqual({ knownRuleIds: ['particle-wa'], showKnown: true });
    });

    it('uses GM storage as the cross-origin source while retaining old-reader compatibility', () => {
        const values = new Map<string, unknown>();
        vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => values.get(key) ?? fallback));
        vi.stubGlobal('GM_setValue', vi.fn((key: string, value: unknown) => { values.set(key, value); }));

        setGrammarRuleKnowledge('particle-wa', 'mastered', { at: 42, changeId: 'grammar:test:42' });
        localStorage.clear();

        expect(readGrammarKnowledge().entries['particle-wa']).toEqual({
            knowledge: 'mastered',
            at: 42,
            changeId: 'grammar:test:42',
        });
        expect(values.get(GRAMMAR_PREFERENCES_KEY)).toMatchObject({
            version: 2,
            knownRuleIds: ['particle-wa'],
        });
    });

    it('makes the Reader known toggle update the same knowledge entry', () => {
        expect(setGrammarRuleKnown('particle-wa', true).knownRuleIds).toEqual(['particle-wa']);
        expect(readGrammarKnowledge().entries['particle-wa']?.knowledge).toBe('known');

        expect(setGrammarRuleKnown('particle-wa', false).knownRuleIds).toEqual([]);
        expect(readGrammarKnowledge().entries['particle-wa']?.knowledge).toBe('unknown');
    });

    it('does not rewrite an exact shared grammar fact', () => {
        const fact = { at: 42, changeId: 'grammar:test:42' };
        setGrammarRuleKnowledge('particle-wa', 'known', fact);
        const before = localStorage.getItem(GRAMMAR_PREFERENCES_KEY);

        setGrammarRuleKnowledge('particle-wa', 'known', fact);

        expect(localStorage.getItem(GRAMMAR_PREFERENCES_KEY)).toBe(before);
        expect(readGrammarKnowledge().entries['particle-wa']).toEqual({ knowledge: 'known', ...fact });
    });
});
