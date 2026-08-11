import { yomuKanjiStudyCompanion } from '../companions/registry';
import type { InterfaceLanguage } from '../app/types';
import type { GrammarPreferences } from './grammar-knowledge';
import type { GrammarHint, SentenceTranslationResult } from './tools-contract';

export type { GrammarPreferences } from './grammar-knowledge';
export type {
    GrammarHint,
    LocalGrammarRuleExample,
    LocalGrammarRuleSummary,
    SentenceTranslationResult,
} from './tools-contract';

export function resetGrammarRuleDataCacheForTests(): void {
    yomuKanjiStudyCompanion()?.resetGrammarRuleDataCacheForTests?.();
}

export function detectGrammarHints(sentence: string): GrammarHint[] {
    return yomuKanjiStudyCompanion()?.detectGrammarHints?.(sentence) ?? [];
}

export function preloadGrammarResources(sentence: string, language: InterfaceLanguage = 'en'): GrammarHint[] {
    return yomuKanjiStudyCompanion()?.preloadGrammarResources?.(sentence, language) ?? [];
}

export function preloadTargetSentenceTranslation(sentence: string, outputLanguage = 'en'): void {
    yomuKanjiStudyCompanion()?.preloadTargetSentenceTranslation?.(sentence, outputLanguage);
}

export async function translateJapaneseSentence(sentence: string, language = 'en'): Promise<string> {
    // Empty means "no translation to show" — never parrot the input back as
    // if it were a translation when the companion is unavailable.
    return (await translateTargetSentence(sentence, language))?.text ?? '';
}

export async function translateTargetSentence(
    sentence: string,
    outputLanguage = 'en',
): Promise<SentenceTranslationResult | null> {
    return await (yomuKanjiStudyCompanion()?.translateTargetSentence?.(sentence, outputLanguage)
        ?? Promise.resolve(null));
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
