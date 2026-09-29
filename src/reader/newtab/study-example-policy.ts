import { type ImmersionKitExample } from '../immersion/kit';
import { immersionSentenceContainsQuery, shouldFilterImmersionExamplesBySurface } from '../immersion/query';
import type { JpdbVocabularyInfo } from '../jpdb/jpdb-vocabulary';
import { newTabCardHighlightTargets, newTabCardTarget } from './study-queue';
import { isCompleteStudySentence } from './study-sentence-source';
import type { JPDBCard } from '../app/types';

const NEW_TAB_IMMERSION_PARSE_TIMEOUT_MS = 1_200;

export function newTabShortParseOptions(): { jpdbTimeoutMs: number } {
    return { jpdbTimeoutMs: NEW_TAB_IMMERSION_PARSE_TIMEOUT_MS };
}

export function accurateNewTabImmersionExamples(query: string, examples: ImmersionKitExample[]): ImmersionKitExample[] {
    return shouldFilterImmersionExamplesBySurface(query)
        ? examples.filter(example => immersionSentenceContainsQuery(example.sentence, query))
        : examples;
}

export function normalizePromptContextSentence(value: string | undefined, card: JPDBCard): string {
    const sentence = value?.replace(/\s+/g, ' ').trim() ?? '';
    return isPromptContextSentence(sentence, card) && isCompleteStudySentence(sentence) ? sentence : '';
}

function isPromptContextSentence(sentence: string, card: JPDBCard): boolean {
    if (!newTabCardTarget(card).isLookupableText(sentence)) return false;
    const normalized = normalizedPromptSentenceText(sentence);
    const identities = newTabCardHighlightTargets(card)
        .map(normalizedPromptSentenceText)
        .filter(Boolean);
    return Boolean(normalized) && !identities.includes(normalized);
}

function normalizedPromptSentenceText(value: string): string {
    return value.replace(/\s+/g, '').trim();
}

export function jpdbExampleSentenceForPrompt(info: JpdbVocabularyInfo | null, card: JPDBCard): string {
    const examples = info?.examples ?? [];
    return examples
        .map(example => normalizePromptContextSentence(example.sentence, card))
        .find(Boolean) ?? '';
}

