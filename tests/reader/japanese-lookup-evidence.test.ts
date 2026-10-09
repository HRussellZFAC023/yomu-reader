import 'fake-indexeddb/auto';
import { File as NodeFile } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { createLocalDictionaryStore } from '../../src/reader/dictionaries/local-store-factory';
import catalog from '../../config/dictionaries/published/v1/catalog.json';
import evidence from './fixtures/japanese-lookup-evidence.json';

// The Japanese slice of the former 33-target ratchet, with its original
// archive-derived terms, sentence provenance and exact miss ledger intact.
// This is compact replay, not a fresh full-archive measurement or live-page QA.
describe('Japanese published-dictionary lookup evidence', () => {
    it('retains its frozen dictionary identity and attribution', () => {
        const dictionary = catalog.entries.find(entry => entry.id === evidence.dictionary.id)!;
        expect(dictionary.distribution).toMatchObject({
            state: 'published',
            object: { sha256: evidence.dictionary.sha256, bytes: evidence.dictionary.bytes },
        });
        expect(evidence.dictionary.license.attribution).toContain('EDRDG');
        expect(evidence.corpus.source.reviewStatus).toBe('machine-drafted-2026-07-31');
    });

    it('keeps the recorded exact word spans through the production import and matcher', async () => {
        const store = createLocalDictionaryStore();
        await store.clear();
        try {
            await store.importFile(new NodeFile([JSON.stringify({
                formatName: 'yomu-yomitan-dictionaries', formatVersion: 2, terms: evidence.terms,
            })], 'japanese-published-evidence.json', { type: 'application/json' }) as unknown as File);
            const misses: Array<{ sentenceId: string; word: string; start: number; end: number }> = [];
            let contentWords = 0;
            for (const sentence of evidence.corpus.sentences) {
                const matches = await store.findTermMatches(sentence.text, 256);
                const occupied: Array<{ start: number; end: number }> = [];
                for (const word of sentence.contentWords) {
                    let start = sentence.text.indexOf(word);
                    while (start >= 0 && occupied.some(span => start < span.end && start + word.length > span.start)) {
                        start = sentence.text.indexOf(word, start + 1);
                    }
                    expect(start, `${sentence.id}: ${word} must occur without overlapping another ledger word`).toBeGreaterThanOrEqual(0);
                    const end = start + word.length;
                    occupied.push({ start, end });
                    contentWords++;
                    if (!matches.some(match => match.start === start && match.end === end)) {
                        misses.push({ sentenceId: sentence.id, word, start, end });
                    }
                }
            }
            expect({ annotated: contentWords - misses.length, contentWords, misses }).toEqual(evidence.expected);
        } finally {
            await store.clear();
        }
    }, 30_000);
});
