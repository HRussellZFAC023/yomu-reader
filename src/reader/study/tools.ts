import { yomuKanjiStudyCompanion } from '../companions/registry';
import type { InterfaceLanguage } from '../app/types';

export interface GrammarHint {
    ruleId: string;
    name: string;
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

export type GrammarLevel = 'Core' | 'N5' | 'N4' | 'N3' | 'N2' | 'N1';

export interface GrammarPreferences {
    knownRuleIds: string[];
    showKnown: boolean;
}

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

export function resetGrammarRuleDataCacheForTests(): void {
    yomuKanjiStudyCompanion()?.resetGrammarRuleDataCacheForTests?.();
}

export function listLocalGrammarRuleExamples(): LocalGrammarRuleExample[] {
    return yomuKanjiStudyCompanion()?.listLocalGrammarRuleExamples?.() ?? [];
}

export function listLocalGrammarRules(): LocalGrammarRuleSummary[] {
    return yomuKanjiStudyCompanion()?.listLocalGrammarRules?.() ?? [];
}

export function detectGrammarHints(sentence: string): GrammarHint[] {
    return yomuKanjiStudyCompanion()?.detectGrammarHints?.(sentence) ?? [];
}

export function preloadGrammarResources(sentence: string, language: InterfaceLanguage = 'en'): GrammarHint[] {
    return yomuKanjiStudyCompanion()?.preloadGrammarResources?.(sentence, language) ?? [];
}

export function preloadJapaneseSentenceTranslation(sentence: string, language: InterfaceLanguage = 'en'): void {
    yomuKanjiStudyCompanion()?.preloadJapaneseSentenceTranslation?.(sentence, language);
}

export function setGrammarRuleKnown(ruleId: string, known: boolean): GrammarPreferences {
    return yomuKanjiStudyCompanion()?.setGrammarRuleKnown?.(ruleId, known) ?? { knownRuleIds: [], showKnown: false };
}

export function setKnownGrammarVisible(showKnown: boolean): GrammarPreferences {
    return yomuKanjiStudyCompanion()?.setKnownGrammarVisible?.(showKnown) ?? { knownRuleIds: [], showKnown };
}

export async function translateJapaneseSentence(sentence: string, language: InterfaceLanguage = 'en'): Promise<string> {
    return await (yomuKanjiStudyCompanion()?.translateJapaneseSentence?.(sentence, language) ?? Promise.resolve(sentence));
}

export async function renderGrammarHints(
    hints: GrammarHint[],
    sentence: string,
    preferences?: GrammarPreferences,
    language: InterfaceLanguage = 'en',
    options: { audioEnabled?: boolean } = {},
): Promise<string> {
    return await (yomuKanjiStudyCompanion()?.renderGrammarHints?.(hints, sentence, preferences, language, options) ?? Promise.resolve(''));
}
