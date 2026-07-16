import type { JPDBCard } from '../app/types';
import type { YomitanTermEntry } from '../dictionaries/yomitan';
import type { ImmersionKitExample } from '../immersion/kit';

export type StudySentenceSource = 'dictionary' | 'immersion-kit' | 'local';

export interface StudySentenceTier {
    source: StudySentenceSource;
    sentences: string[];
}

export function studySentenceTiers(
    card: JPDBCard,
    dictionaryEntries: readonly YomitanTermEntry[],
    immersionExamples: readonly ImmersionKitExample[],
): StudySentenceTier[] {
    return [
        { source: 'dictionary', sentences: dictionaryExampleSentences(card, dictionaryEntries) },
        { source: 'immersion-kit', sentences: uniqueSentences(immersionExamples.map(example => example.sentence)) },
        { source: 'local', sentences: uniqueSentences([card.sentence ?? '']) },
    ];
}

export function firstStudySentenceTier(
    tiers: readonly StudySentenceTier[],
    accepts: (sentence: string) => boolean,
): StudySentenceTier | null {
    for (const tier of tiers) {
        const sentences = tier.sentences.filter(accepts);
        if (sentences.length) return { ...tier, sentences };
    }
    return null;
}

function dictionaryExampleSentences(card: JPDBCard, entries: readonly YomitanTermEntry[]): string[] {
    const targets = [card.spelling, card.reading, ...(card.fallbackLookupTerms ?? [])]
        .map(value => value.trim())
        .filter(Boolean);
    return uniqueSentences(entries.flatMap(entry => entry.glossary.flatMap(dictionaryGlossarySentences)))
        .filter(sentence => targets.some(target => sentence.includes(target)))
        .filter(sentence => /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(sentence));
}

function dictionaryGlossarySentences(value: unknown): string[] {
    const explicitExamples = structuredExampleTexts(value);
    const texts = explicitExamples.length
        ? explicitExamples
        : structuredLeafTexts(value).filter(hasExampleLabel);
    return texts.flatMap(splitJapaneseSentences);
}

function structuredExampleTexts(value: unknown): string[] {
    if (Array.isArray(value)) return value.flatMap(structuredExampleTexts);
    if (!isRecord(value)) return [];
    if (isExampleRecord(value)) return structuredLeafTexts(value.text ?? value.content);
    return Object.values(value).flatMap(structuredExampleTexts);
}

function structuredLeafTexts(value: unknown): string[] {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(structuredLeafTexts);
    if (!isRecord(value)) return [];
    if (typeof value.text === 'string') return [value.text];
    return 'content' in value ? structuredLeafTexts(value.content) : [];
}

function hasExampleLabel(value: string): boolean {
    return /(?:例文?|用例|examples?)\s*[:：]/iu.test(value);
}

function isExampleRecord(value: Record<string, unknown>): boolean {
    return ['data-sc-content', 'data-content', 'class', 'className']
        .some(key => typeof value[key] === 'string' && /example|sentence|\u4f8b\u6587/iu.test(value[key]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function splitJapaneseSentences(value: string): string[] {
    return value
        .replace(/\r\n?/gu, '\n')
        .split(/(?<=[\u3002\uff01\uff1f!?])\s*|\n+/u)
        .map(sentence => sentence.trim())
        .filter(sentence => sentence.length >= 4 && sentence.length <= 220);
}

function uniqueSentences(values: readonly string[]): string[] {
    const seen = new Set<string>();
    const sentences: string[] = [];
    for (const value of values) {
        const sentence = value.replace(/\s+/gu, ' ').trim();
        if (!sentence || seen.has(sentence)) continue;
        seen.add(sentence);
        sentences.push(sentence);
    }
    return sentences;
}
