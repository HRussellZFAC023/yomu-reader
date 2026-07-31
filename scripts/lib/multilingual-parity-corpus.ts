import { createHash } from 'node:crypto';

import partA from '../../config/quality/multilingual-lookup-corpus/part-a.json';
import partB from '../../config/quality/multilingual-lookup-corpus/part-b.json';
import partC from '../../config/quality/multilingual-lookup-corpus/part-c.json';
import { LEARNING_TARGET_ROSTER } from '../../src/reader/languages/roster';
import { sixTargetLookupCorpus } from '../manual/multilingual-lookup-coverage';

export const MULTILINGUAL_PARITY_CORPUS_RULE =
    'An occurrence counts only when a definition match has exactly the ledgered content-word span.';

export interface MultilingualParitySentence {
    id: string;
    text: string;
    contentWords: string[];
}

export interface MultilingualParityCorpusSource {
    kind: string;
    story: string;
    license: string;
    reviewStatus: string;
}

export interface MultilingualParityTargetCorpus {
    language: string;
    source: MultilingualParityCorpusSource;
    sentences: MultilingualParitySentence[];
}

export interface MultilingualParityGoldSpan {
    sentenceId: string;
    word: string;
    start: number;
    end: number;
}

const EXISTING_SIX_SOURCE: MultilingualParityCorpusSource = {
    kind: 'project-authored-translation',
    story: 'maria-market-v1',
    license: 'MIT',
    reviewStatus: 'repository-reviewed-2026-07-30',
};

const existingSix: MultilingualParityTargetCorpus[] = Object.entries(sixTargetLookupCorpus)
    .map(([language, sentences]) => ({
        language,
        source: EXISTING_SIX_SOURCE,
        sentences: sentences.map(sentence => ({
            id: sentence.id,
            text: sentence.text,
            contentWords: [...sentence.contentWords],
        })),
    }));

const combined = [
    ...existingSix,
    ...partA,
    ...partB,
    ...partC,
] as MultilingualParityTargetCorpus[];

export function multilingualParityCorpus(): readonly MultilingualParityTargetCorpus[] {
    validateMultilingualParityCorpus(combined);
    return combined;
}

export function multilingualParityCorpusSha256(
    corpus: readonly MultilingualParityTargetCorpus[] = multilingualParityCorpus(),
): string {
    return createHash('sha256').update(JSON.stringify(corpus)).digest('hex');
}

export function multilingualParityGoldSpans(sentence: MultilingualParitySentence): MultilingualParityGoldSpan[] {
    const spans: MultilingualParityGoldSpan[] = [];
    const occupied: Array<{ start: number; end: number }> = [];
    for (const word of sentence.contentWords) {
        let start = sentence.text.indexOf(word);
        while (
            start >= 0
            && occupied.some(span => start < span.end && start + word.length > span.start)
        ) {
            start = sentence.text.indexOf(word, start + 1);
        }
        if (start < 0) {
            throw new Error(`${sentence.id}: content-word ledger entry "${word}" is absent or overlaps another entry.`);
        }
        const span = { sentenceId: sentence.id, word, start, end: start + word.length };
        spans.push(span);
        occupied.push(span);
    }
    return spans;
}

export function validateMultilingualParityCorpus(corpus: readonly MultilingualParityTargetCorpus[]): void {
    const roster = LEARNING_TARGET_ROSTER.map(target => target.id).sort();
    const languages = corpus.map(target => target.language).sort();
    if (new Set(languages).size !== languages.length) {
        throw new Error('The multilingual parity corpus contains a duplicate target.');
    }
    if (JSON.stringify(languages) !== JSON.stringify(roster)) {
        throw new Error(`Corpus targets differ from the learning-target roster.\nCorpus: ${languages.join(' ')}\nRoster: ${roster.join(' ')}`);
    }
    const sentenceIds = new Set<string>();
    for (const target of corpus) {
        if (target.sentences.length !== 10) {
            throw new Error(`${target.language}: expected exactly ten sentences, found ${target.sentences.length}.`);
        }
        if (!target.source.kind || !target.source.story || !target.source.license || !target.source.reviewStatus) {
            throw new Error(`${target.language}: corpus provenance is incomplete.`);
        }
        for (const sentence of target.sentences) {
            if (sentenceIds.has(sentence.id)) throw new Error(`Duplicate corpus sentence id: ${sentence.id}.`);
            sentenceIds.add(sentence.id);
            if (!sentence.text.trim()) throw new Error(`${sentence.id}: sentence text is empty.`);
            if (sentence.contentWords.length < 1) throw new Error(`${sentence.id}: content-word ledger is empty.`);
            multilingualParityGoldSpans(sentence);
        }
    }
}
