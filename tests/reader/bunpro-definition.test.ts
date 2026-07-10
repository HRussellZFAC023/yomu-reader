import { describe, expect, it } from 'vitest';
import { normalizeBunproDefinitionSearch, renderBunproDefinitionSource } from '../../src/reader/bunpro/definition';
import type { JPDBCard } from '../../src/reader/app/types';

const card: JPDBCard = {
    vid: 1,
    sid: 2,
    rid: 3,
    spelling: '読む',
    reading: 'よむ',
    frequencyRank: null,
    partOfSpeech: [],
    meanings: [],
    cardState: ['new'],
    pitchAccent: [],
    wordWithReading: null,
};

describe('Bunpro definition source', () => {
    it('normalizes the live frontend search envelope and prefers an exact reading', () => {
        const info = normalizeBunproDefinitionSearch({
            vocabs: { data: [{
                id: '42',
                type: 'vocab',
                attributes: {
                    id: 42,
                    title: '読む',
                    kana: 'よむ',
                    slug: '読む',
                    meaning: 'to read',
                    nuance: 'To read written material',
                    nuance_translation: '本などを読むこと',
                    accepted_answers: ['読む', 'よむ', 'to read'],
                    jmdict_pos: ['Godan verb'],
                    jlpt_level: 'n5',
                },
            }] },
            grammar_points: { data: [] },
        }, '読む', 'よむ');

        expect(info).toMatchObject({
            id: 42,
            kind: 'vocabulary',
            expression: '読む',
            reading: 'よむ',
            meaning: 'to read',
            acceptedAnswers: ['読む', 'よむ', 'to read'],
            partOfSpeech: ['Godan verb'],
            jlptLevel: 'n5',
            sourceUrl: `https://bunpro.jp/vocabs/${encodeURIComponent('読む')}`,
        });
    });

    it('renders meaning, nuance, accepted answers, and a Bunpro link as an ordered source card', () => {
        const info = normalizeBunproDefinitionSearch({
            vocabs: { data: [{ id: 42, attributes: { id: 42, title: '読む', kana: 'よむ', slug: '読む', meaning: 'to read', nuance: 'written material', accepted_answers: ['to read'] } }] },
        }, '読む', 'よむ');
        const html = renderBunproDefinitionSource(card, key => `data-source-state="${key}"`, info, 'en');

        expect(html).toContain('data-source="bunpro"');
        expect(html).toContain('to read');
        expect(html).toContain('written material');
        expect(html).toContain('Accepted answers');
        expect(html).toContain('https://bunpro.jp/vocabs/');
    });
});
