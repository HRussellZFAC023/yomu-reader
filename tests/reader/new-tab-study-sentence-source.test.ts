import { describe, expect, it } from 'vitest';

import type { JPDBCard } from '../../src/reader/app/types';
import type { YomitanTermEntry } from '../../src/reader/dictionaries/yomitan';
import type { ImmersionKitExample } from '../../src/reader/immersion/kit';
import { firstStudySentenceTier, studySentenceTiers } from '../../src/reader/newtab/study-sentence-source';

const card = {
    spelling: '飲み物',
    reading: 'のみもの',
    sentence: '地元の飲み物です。',
} as JPDBCard;

const dictionaryEntry = {
    expression: '飲み物',
    reading: 'のみもの',
    glossary: ['飲料。例: 冷たい飲み物が欲しい。'],
    dictionary: 'Installed Jitendex',
} as YomitanTermEntry;

const immersion = {
    id: 'ik-1',
    sentence: '好きな飲み物を選んで。',
} as ImmersionKitExample;

describe('Study sentence source precedence', () => {
    it('prefers an installed dictionary example over Immersion Kit and local context', () => {
        const tier = firstStudySentenceTier(studySentenceTiers(card, [dictionaryEntry], [immersion]), sentence => sentence.includes('飲み物'));
        expect(tier).toMatchObject({ source: 'dictionary' });
        expect(tier?.sentences).toContain('例: 冷たい飲み物が欲しい。');
    });

    it('falls through to Immersion Kit when dictionaries have no usable example', () => {
        const definitionOnly = {
            ...dictionaryEntry,
            glossary: ['beverage; something to drink'],
        } as YomitanTermEntry;
        const tier = firstStudySentenceTier(studySentenceTiers(card, [definitionOnly], [immersion]), sentence => sentence.includes('飲み物'));
        expect(tier).toEqual({ source: 'immersion-kit', sentences: ['好きな飲み物を選んで。'] });
    });

    it('does not promote a monolingual definition containing the headword into the example tier', () => {
        const definitionOnly = {
            ...dictionaryEntry,
            glossary: ['飲み物は、飲むためのもの。'],
        } as YomitanTermEntry;
        const tier = firstStudySentenceTier(studySentenceTiers(card, [definitionOnly], [immersion]), sentence => sentence.includes('飲み物'));
        expect(tier).toEqual({ source: 'immersion-kit', sentences: ['好きな飲み物を選んで。'] });
    });

    it('does not treat a structured definition list as an example source', () => {
        const definitionOnly = {
            ...dictionaryEntry,
            glossary: [{ tag: 'ol', content: [{ tag: 'li', content: '飲み物は、飲むためのもの。' }] }],
        } as YomitanTermEntry;
        const tier = firstStudySentenceTier(studySentenceTiers(card, [definitionOnly], [immersion]), sentence => sentence.includes('飲み物'));
        expect(tier).toEqual({ source: 'immersion-kit', sentences: ['好きな飲み物を選んで。'] });
    });

    it('uses the trustworthy local card sentence last', () => {
        const tier = firstStudySentenceTier(studySentenceTiers(card, [], []), sentence => sentence.includes('飲み物'));
        expect(tier).toEqual({ source: 'local', sentences: ['地元の飲み物です。'] });
    });

    it('extracts the example block from a structured Yomitan glossary without merging its definition', () => {
        const structured = {
            ...dictionaryEntry,
            glossary: [[
                { tag: 'span', content: '飲み物とは、飲むためのもの。' },
                {
                    tag: 'div',
                    'data-sc-content': 'example-sentence',
                    content: [
                        { tag: 'span', content: '冷たい飲み物が欲しい。' },
                        { tag: 'span', content: 'I want a cold drink.' },
                    ],
                },
            ]],
        } as YomitanTermEntry;
        const tier = firstStudySentenceTier(studySentenceTiers(card, [structured], [immersion]), sentence => sentence.includes('飲み物'));
        expect(tier).toEqual({ source: 'dictionary', sentences: ['冷たい飲み物が欲しい。'] });
    });
});
