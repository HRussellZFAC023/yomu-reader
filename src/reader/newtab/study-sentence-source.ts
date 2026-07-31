import { isRecord } from '../core/object-utils';
import type { JPDBCard } from '../app/types';
import type { YomitanTermEntry } from '../dictionaries/yomitan';
import type { ImmersionKitExample } from '../immersion/kit';
import { newTabCardTarget } from './study-queue';

export type StudySentenceSource = 'dictionary' | 'immersion-kit' | 'local';

export interface StudySentenceTier {
    source: StudySentenceSource;
    sentences: string[];
}

/**
 * Study clozes need a complete thought, not an arbitrary subtitle slice. A
 * fragment is worse than a word-only production prompt because it teaches the
 * learner to reproduce Japanese that no speaker actually finished saying.
 */
export function isCompleteStudySentence(value: string): boolean {
    const sentence = value.replace(/\s+/gu, ' ').trim();
    if (sentence.length < 4) return false;
    if (!balancedStudySentenceMarks(sentence)) return false;
    if (/[、,，:：;；…]$/u.test(sentence)) return false;
    if (/[♪♫♬♩]/u.test(sentence)) return false;
    // Subtitle speaker/stage labels are context metadata, not sentence starts.
    if (/^[（(][^）)]{1,32}[）)]\s*/u.test(sentence)) return false;
    // An unpunctuated noun/title ending is usually a caption or lyric slice,
    // not a sentence. Normal verb/adjective/casual endings end in kana.
    if (!/[。！？!?」』]$/u.test(sentence) && /[\p{Script=Han}\p{Script=Katakana}]$/u.test(sentence)) return false;
    // Common subtitle/API truncation tails. Keep ordinary unpunctuated spoken
    // sentences (行く, そうです, 分かったよ), but reject connective particles
    // and continuative forms such as the reported 「同じ説明をし」.
    if (/(?:をし|にし|として|について|によって|による|ながら|つつ|ので|のに|けど|けれど|たり|って|ばかり|ばっかり|[をにへでとがはも])$/u.test(sentence)) return false;
    return true;
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
        .filter(sentence => newTabCardTarget(card).isLookupableText(sentence));
}

function dictionaryGlossarySentences(value: unknown): string[] {
    const explicitExamples = structuredExampleTexts(value);
    const texts = explicitExamples.length
        ? explicitExamples
        : structuredLeafTexts(value).filter(hasExampleLabel);
    return texts.flatMap(splitStudySentences);
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


function splitStudySentences(value: string): string[] {
    return value
        .replace(/\r\n?/gu, '\n')
        .split(/(?<=[\u3002\uff01\uff1f.!?])\s*|\n+/u)
        .map(sentence => sentence.trim())
        .filter(sentence => sentence.length >= 4 && sentence.length <= 220);
}

function uniqueSentences(values: readonly string[]): string[] {
    const seen = new Set<string>();
    const sentences: string[] = [];
    for (const value of values) {
        const sentence = value.replace(/\s+/gu, ' ').trim();
        if (!isCompleteStudySentence(sentence) || seen.has(sentence)) continue;
        seen.add(sentence);
        sentences.push(sentence);
    }
    return sentences;
}

function balancedStudySentenceMarks(value: string): boolean {
    const pairs: ReadonlyArray<readonly [string, string]> = [
        ['「', '」'],
        ['『', '』'],
        ['（', '）'],
        ['(', ')'],
        ['［', '］'],
        ['[', ']'],
    ];
    return pairs.every(([open, close]) => countMark(value, open) === countMark(value, close));
}

function countMark(value: string, mark: string): number {
    return Array.from(value).filter(character => character === mark).length;
}
