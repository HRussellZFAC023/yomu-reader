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
});
