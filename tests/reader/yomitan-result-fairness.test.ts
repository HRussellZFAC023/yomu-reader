import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { YomitanDictionaryStore } from '../../src/reader/dictionaries/yomitan';

const store = new YomitanDictionaryStore();

afterEach(async () => {
    await store.clear();
});

describe('local dictionary result-cap fairness', () => {
    it('does not let one dictionary crowd out an exact hit from another enabled dictionary', async () => {
        await store.clear();
        await store.importFile(new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [
                    {
                        tableName: 'dictionaries',
                        rows: [
                            { $: [1, { title: 'Primary', alias: 'Primary', enabled: true, priority: 0 }] },
                            { $: [2, { title: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 1 }] },
                        ],
                    },
                    {
                        tableName: 'terms',
                        rows: [
                            ...Array.from({ length: 6 }, (_, index) => ({
                                $: [index + 1, {
                                    expression: '日本',
                                    reading: 'にほん',
                                    glossary: [`primary sense ${index + 1}`],
                                    score: 100 - index,
                                    dictionary: 'Primary',
                                }],
                            })),
                            { $: [20, { expression: '日本', reading: 'にほん', glossary: ['Japan'], score: 1, dictionary: 'Jitendex' }] },
                        ],
                    },
                ],
            },
        })], 'two-dictionaries.json', { type: 'application/json' }));

        const results = await store.lookup('日本', 'にほん', 3, [
            { name: 'Primary', alias: 'Primary', enabled: true, priority: 0 },
            { name: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 1 },
        ]);

        expect(results).toHaveLength(3);
        expect(results.map(entry => entry.dictionary)).toContain('Jitendex');
        expect(results.find(entry => entry.dictionary === 'Jitendex')).toMatchObject({
            expression: '日本',
            reading: 'にほん',
        });
    });

    it('does not fabricate a result for an enabled dictionary with no exact match', async () => {
        await store.clear();
        await store.importFile(new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [{
                    tableName: 'terms',
                    rows: [
                        { $: [1, { expression: '日本', reading: 'にほん', glossary: ['Japan'], score: 10, dictionary: 'Primary' }] },
                        { $: [2, { expression: '日本人', reading: 'にほんじん', glossary: ['Japanese person'], score: 20, dictionary: 'Jitendex' }] },
                    ],
                }],
            },
        })], 'no-jitendex-match.json', { type: 'application/json' }));

        const results = await store.lookup('日本', 'にほん', 3);

        expect(results.map(entry => entry.dictionary)).toEqual(['Primary']);
    });

    it('scans past eight incompatible rows on a common reading key', async () => {
        await store.importFile(new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [{
                    tableName: 'terms',
                    rows: [
                        ...Array.from({ length: 24 }, (_, index) => ({
                            $: [index + 1, {
                                expression: `囮${index}`,
                                reading: 'かける',
                                rules: 'n',
                                glossary: [`decoy ${index}`],
                                dictionary: 'Crowders',
                            }],
                        })),
                        { $: [25, {
                            expression: '駆ける',
                            reading: 'かける',
                            rules: 'v1',
                            glossary: ['to run'],
                            dictionary: 'Primary',
                        }] },
                    ],
                }],
            },
        })], 'overloaded-reading.json', { type: 'application/json' }));

        const matches = await store.findTermMatches('かけました', 4, [
            { name: 'Crowders', alias: 'Crowders', enabled: true, priority: 0 },
            { name: 'Primary', alias: 'Primary', enabled: true, priority: 1 },
        ]);

        expect(matches).toEqual([expect.objectContaining({
            surface: 'かけました',
            entry: expect.objectContaining({
                expression: '駆ける',
                reading: 'かける',
                dictionary: 'Primary',
            }),
            deinflected: expect.objectContaining({ term: 'かける', rules: ['v1'] }),
        })]);
    });

    it('selects the highest-priority compatible row beyond the old cap', async () => {
        await store.importFile(new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [{
                    tableName: 'terms',
                    rows: [
                        ...Array.from({ length: 8 }, (_, index) => ({
                            $: [index + 1, {
                                expression: `欠ける${index}`,
                                reading: 'かける',
                                rules: 'v1',
                                glossary: [`secondary ${index}`],
                                score: 100 - index,
                                dictionary: 'Secondary',
                            }],
                        })),
                        { $: [9, {
                            expression: '駆ける',
                            reading: 'かける',
                            rules: 'v1',
                            glossary: ['to run'],
                            score: 1,
                            dictionary: 'Primary',
                        }] },
                    ],
                }],
            },
        })], 'overloaded-priority.json', { type: 'application/json' }));

        const matches = await store.findTermMatches('かけました', 4, [
            { name: 'Primary', alias: 'Primary', enabled: true, priority: 0 },
            { name: 'Secondary', alias: 'Secondary', enabled: true, priority: 1 },
        ]);

        expect(matches[0]?.entry).toMatchObject({
            expression: '駆ける',
            reading: 'かける',
            dictionary: 'Primary',
        });
    });
});
