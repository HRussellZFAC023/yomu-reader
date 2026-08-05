import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLocalDictionaryStore } from '../../src/reader/dictionaries/local-store';
import {
    YomitanDictionaryStore,
    type YomitanExactTermCandidateRequest,
    type YomitanTermEntry,
} from '../../src/reader/dictionaries/yomitan';
import { JAPANESE_LEARNING_TARGET } from '../../src/reader/languages/japanese';

const store = new YomitanDictionaryStore();

afterEach(async () => {
    await store.clear();
});

function request(
    surface: string,
    term: string,
    rules: string[] = [],
    depth = 0,
): YomitanExactTermCandidateRequest {
    return {
        surface,
        lookupCandidate: { term, rules, reasons: depth ? ['test inflection'] : [], depth },
    };
}

async function importTerms(terms: YomitanTermEntry[], name: string): Promise<void> {
    await store.importFile(new File([JSON.stringify({
        formatName: 'dexie',
        data: {
            data: [{
                tableName: 'terms',
                rows: terms.map((entry, index) => ({ $: [index + 1, entry] })),
            }],
        },
    })], name, { type: 'application/json' }));
}

describe('exact local candidate lookup', () => {
    it('preserves request identity and index without sweeping the source surface', async () => {
        await importTerms([
            {
                expression: '食べる', reading: 'たべる', rules: 'v1',
                glossary: ['to eat'], dictionary: 'Primary',
            },
            {
                expression: '食べ物', reading: 'たべもの', rules: 'n',
                glossary: ['food'], dictionary: 'Primary',
            },
            {
                expression: '優しい', reading: 'やさしい', rules: 'adj-i',
                glossary: ['kind'], dictionary: 'Primary',
            },
            {
                expression: '言葉', reading: 'ことば', rules: 'n',
                glossary: ['word'], dictionary: 'Primary',
            },
        ], 'exact-candidates.json');

        const compatible = request('食べました', '食べる', ['v1'], 1);
        const wrongRules = request('食べました', '食べる', ['v5m', 'v5'], 1);
        const wouldSweep = request('優しい言葉', '優しい言葉');
        const repeated = request('食べました', '食べる', ['v1'], 1);
        const requests = [compatible, wrongRules, wouldSweep, repeated] as const;
        const lookupCandidates = vi.fn(() => {
            throw new Error('exact requests must not be deinflected again');
        });
        const exactTarget = { ...JAPANESE_LEARNING_TARGET, lookupCandidates };

        const matches = await store.lookupExactTermCandidates(
            requests,
            [{ name: 'Primary', alias: 'Primary', enabled: true, priority: 0 }],
            exactTarget,
        );

        expect(matches.map(match => ({ requestIndex: match.requestIndex, expression: match.entry.expression })))
            .toEqual([
                { requestIndex: 0, expression: '食べる' },
                { requestIndex: 3, expression: '食べる' },
            ]);
        expect(matches[0]?.request).toBe(compatible);
        expect(matches[1]?.request).toBe(repeated);
        expect(lookupCandidates).not.toHaveBeenCalled();
    });

    it('continues an overloaded reading index until the exact candidate is found', async () => {
        await importTerms([
            ...Array.from({ length: 24 }, (_, index) => ({
                expression: `囮${index}`,
                reading: 'かける',
                rules: 'n',
                glossary: [`decoy ${index}`],
                dictionary: 'Crowders',
            })),
            {
                expression: '駆ける', reading: 'かける', rules: 'v1',
                glossary: ['to run'], dictionary: 'Primary',
            },
        ], 'exact-candidate-overflow.json');
        const candidate = request('かけました', 'かける', ['v1'], 1);

        const matches = await store.lookupExactTermCandidates(
            [candidate],
            [
                { name: 'Crowders', alias: 'Crowders', enabled: true, priority: 0 },
                { name: 'Primary', alias: 'Primary', enabled: true, priority: 1 },
            ],
            JAPANESE_LEARNING_TARGET,
        );

        expect(matches).toEqual([expect.objectContaining({
            request: candidate,
            requestIndex: 0,
            entry: expect.objectContaining({ expression: '駆ける', rules: 'v1' }),
        })]);
    });

    it('returns no confirmations when the local-dictionary companion is absent', async () => {
        const host = globalThis as typeof globalThis & { __yomuCompanions?: Record<string, unknown> };
        const previous = Object.getOwnPropertyDescriptor(host, '__yomuCompanions');
        // An EMPTY registry, not a deleted one: the resolver falls back to a
        // module-level sandbox copy, so deleting the global still handed back
        // the real store and this case passed without ever reaching the
        // companion-less path.
        host.__yomuCompanions = {};
        try {
            const inert = createLocalDictionaryStore(() => '', () => 'en');
            await expect(inert.lookupExactTermCandidates([
                request('猫', '猫'),
            ], [], JAPANESE_LEARNING_TARGET)).resolves.toEqual([]);
        } finally {
            if (previous) Object.defineProperty(host, '__yomuCompanions', previous);
            else delete host.__yomuCompanions;
        }
    });
});
