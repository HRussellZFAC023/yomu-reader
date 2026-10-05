import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { dictionaryRank } from '../../src/reader/dictionaries/yomitan/ranking';
import {
    collectTermMatchCandidates,
    exactTermMatchCandidates,
    indexedDbTermSource,
    type TermSource,
} from '../../src/reader/dictionaries/yomitan/term-match';
import type { YomitanExactTermCandidateRequest, YomitanTermEntry } from '../../src/reader/dictionaries/yomitan/types';
import { JAPANESE_LEARNING_TARGET } from '../../src/reader/languages/japanese';

// collectTermMatchCandidates reads term rows only through a TermSource, so a
// Dictionary Engine answers inline term matches by supplying one. The in-memory
// source below is the smallest engine that honours the contract; it must select
// exactly what the IndexedDB row store selects from the same rows.
const DB_NAME = 'term-match-source-test';

const ROWS: YomitanTermEntry[] = [
    { id: 1, expression: '食べる', reading: 'たべる', rules: 'v1', score: 1, glossary: ['to eat'], dictionary: 'Secondary' },
    { id: 2, expression: '食べる', reading: 'たべる', rules: 'v1', score: 0, glossary: ['to eat (primary)'], dictionary: 'Primary' },
    { id: 3, expression: '食べる', reading: 'たべる', rules: 'v5', score: 9, glossary: ['wrong conjugation class'], dictionary: 'Primary' },
    { id: 4, expression: '犬', reading: 'いぬ', rules: 'n', score: 0, glossary: ['dog'], dictionary: 'Primary' },
    // More rows than the eight-row fast read on one reading key, so the
    // IndexedDB source has to fall back to its cursor to reach 駆ける.
    ...Array.from({ length: 12 }, (_, index) => ({
        id: 10 + index,
        expression: `囮${index}`,
        reading: 'かける',
        rules: 'n',
        score: 0,
        glossary: [`decoy ${index}`],
        dictionary: 'Crowders',
    })),
    { id: 30, expression: '駆ける', reading: 'かける', rules: 'v1', score: 0, glossary: ['to run'], dictionary: 'Primary' },
];

const RANK = dictionaryRank([
    { name: 'Primary', alias: 'Primary', enabled: true, priority: 0 },
    { name: 'Secondary', alias: 'Secondary', enabled: true, priority: 1 },
    { name: 'Crowders', alias: 'Crowders', enabled: true, priority: 2 },
]);

function request(surface: string, term: string, rules: string[] = [], depth = 0): YomitanExactTermCandidateRequest {
    return { surface, lookupCandidate: { term, rules, reasons: depth ? ['test inflection'] : [], depth } };
}

const CANDIDATES = exactTermMatchCandidates(JAPANESE_LEARNING_TARGET, [
    request('食べました', '食べる', ['v1'], 1),
    request('かけました', 'かける', ['v1'], 1),
    request('犬', '犬'),
    request('いぬ', 'いぬ'),
]);

function memoryTermSource(rows: readonly YomitanTermEntry[]): TermSource {
    return {
        async visitTermsByKeys(keys, byReading, visit) {
            for (const key of keys) {
                for (const row of rows) if (row.expression === key) visit(key, row);
                if (!byReading) continue;
                for (const row of rows) if (row.reading === key) visit(key, row);
            }
        },
    };
}

function seededDatabase(rows: readonly YomitanTermEntry[]): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const terms = request.result.createObjectStore('terms', { keyPath: 'id', autoIncrement: true });
            terms.createIndex('expression', 'expression');
            terms.createIndex('reading', 'reading');
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('terms', 'readwrite');
            for (const row of rows) tx.objectStore('terms').add(row);
            tx.oncomplete = () => resolve(db);
            tx.onerror = () => reject(tx.error);
        };
    });
}

let openDb: IDBDatabase | undefined;

afterEach(async () => {
    openDb?.close();
    openDb = undefined;
    await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
});

describe('term match sources', () => {
    it('selects the same entries from any source that returns the same rows', async () => {
        openDb = await seededDatabase(ROWS);

        const fromIndexedDb = await collectTermMatchCandidates(indexedDbTermSource(openDb), JAPANESE_LEARNING_TARGET, CANDIDATES, RANK);
        const fromMemory = await collectTermMatchCandidates(memoryTermSource(ROWS), JAPANESE_LEARNING_TARGET, CANDIDATES, RANK);

        expect(fromMemory).toEqual(fromIndexedDb);
        // Longest key first, as the collectors are ordered.
        expect(fromIndexedDb.map(match => [match.surface, match.entry.id])).toEqual([
            // Found past the reading key's fast read.
            ['かけました', 30],
            // Rule-compatible and highest-priority dictionary, not the higher score.
            ['食べました', 2],
            // Japanese also asks the reading index.
            ['いぬ', 4],
            ['犬', 4],
        ]);
    });

    it('answers an empty candidate set without asking the source', async () => {
        const visitTermsByKeys = vi.fn(async () => undefined);

        await expect(collectTermMatchCandidates({ visitTermsByKeys }, JAPANESE_LEARNING_TARGET, new Map(), RANK)).resolves.toEqual([]);
        expect(visitTermsByKeys).not.toHaveBeenCalled();
    });
});
