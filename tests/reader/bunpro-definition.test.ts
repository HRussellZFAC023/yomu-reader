import { describe, expect, it } from 'vitest';
import { BunproApiError } from '../../src/reader/bunpro/bunpro';
import { lookupBunproDefinition, normalizeBunproDefinitionSearch, normalizeBunproExampleSentences, renderBunproDefinitionSource } from '../../src/reader/bunpro/definition';
import type { JPDBCard } from '../../src/reader/app/types';
import type { BunproClient } from '../../src/reader/bunpro/bunpro';

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
                    jmdict_pos: ['n', 'Godan verb'],
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
            partOfSpeech: ['noun', 'Godan verb'],
            jlptLevel: 'N5',
            sourceUrl: `https://bunpro.jp/vocabs/${encodeURIComponent('読む')}`,
        });
    });

    it('renders vocabulary meaning and nuance without review-answer duplication or a second action pill', () => {
        const info = normalizeBunproDefinitionSearch({
            vocabs: { data: [{ id: 42, attributes: { id: 42, title: '読む', kana: 'よむ', slug: '読む', meaning: 'to read', nuance: 'written material', accepted_answers: ['to read'], jlpt_level: 'unclassified', jmdict_pos: ['n', 'unc'] } }] },
        }, '読む', 'よむ');
        const html = renderBunproDefinitionSource(card, key => `data-source-state="${key}"`, info, 'en');

        expect(html).toContain('data-source="bunpro"');
        expect(html).toContain('to read');
        expect(html).toContain('written material');
        expect(html).toContain('>noun<');
        expect(html).not.toContain('UNCLASSIFIED');
        expect(html).not.toContain('>n<');
        expect(html).not.toContain('unclassified');
        expect(html).not.toContain('Accepted answers');
        expect(html).not.toContain('Accepted inputs');
        expect(html).not.toContain('jpdb-reader-action-pill');
        expect(html).not.toContain('Bunpro ↗');
    });

    it('keeps only genuinely distinct grammar accepted inputs after normalized dedupe', () => {
        const info = normalizeBunproDefinitionSearch({
            grammar_points: { data: [{ id: 43, attributes: {
                id: 43,
                title: 'に違いない',
                furigana: 'にちがいない',
                meaning: 'must be; no doubt',
                accepted_answers: [' Must be ', 'ｍｕｓｔ　ｂｅ', 'No doubt'],
            } }] },
        }, 'に違いない', 'にちがいない');
        const html = renderBunproDefinitionSource({ ...card, spelling: 'に違いない', reading: 'にちがいない' }, key => `data-source-state="${key}"`, info, 'en');

        expect(html).toContain('Accepted inputs');
        expect(html.match(/Must be/g)).toHaveLength(1);
        expect(html).toContain('No doubt');
    });

    it('dedupes identical meaning and nuance text while retaining distinct translations', () => {
        const info = normalizeBunproDefinitionSearch({
            vocabs: { data: [{ id: 42, attributes: {
                id: 42,
                title: '読む',
                kana: 'よむ',
                meaning: 'to read',
                nuance: ' TO  READ ',
                nuance_translation: '文章を読む',
            } }] },
        }, '読む', 'よむ');
        const html = renderBunproDefinitionSource(card, key => `data-source-state="${key}"`, info, 'en');

        expect(html.match(/to read/gi)).toHaveLength(1);
        expect(html).toContain('文章を読む');
    });

    it('uses a known Bunpro id/type to disambiguate grammar from vocabulary', () => {
        const raw = {
            vocabs: { data: [{ id: 1, attributes: { id: 1, title: 'そう', kana: 'そう', meaning: 'appearance' } }] },
            grammar_points: { data: [{ id: 2, attributes: { id: 2, title: 'そう', furigana: 'そう', meaning: 'hearsay' } }] },
        };

        expect(normalizeBunproDefinitionSearch(raw, 'そう', 'そう')).toBeNull();
        expect(normalizeBunproDefinitionSearch(raw, 'そう', 'そう', { id: 2, kind: 'grammar' })).toMatchObject({
            id: 2,
            kind: 'grammar',
            meaning: 'hearsay',
        });
    });

    it('returns null instead of displaying the first fuzzy result', () => {
        const raw = { vocabs: { data: [{ id: 42, attributes: { id: 42, title: '読む', kana: 'よむ', meaning: 'to read' } }] } };
        expect(normalizeBunproDefinitionSearch(raw, '幻語', 'げんご')).toBeNull();
    });

    it('does not accept an exact-spelling homograph with the wrong reading', () => {
        const raw = { vocabs: { data: [{ id: 42, attributes: { id: 42, title: '生', kana: 'せい', meaning: 'life' } }] } };
        expect(normalizeBunproDefinitionSearch(raw, '生', 'なま')).toBeNull();
        expect(normalizeBunproDefinitionSearch(raw, '生')).toMatchObject({ id: 42, reading: 'せい' });
    });
});

describe('Bunpro example sentences', () => {
    const vocabDetail = {
        data: { id: '963', type: 'vocab' },
        included: [{
            id: '163746',
            type: 'study_question',
            attributes: {
                id: 163746,
                content: "<span class='vocab-popout' data-vocab-id='78'>クラス</span>メイトは楽譜（がくふ）を<span class='gp-popout vocab-popout' data-vocab-id='963'><strong>読（よ）む</strong></span>ことができる。",
                answer: '',
                question_type: 'readonly',
                sentence_order: 5,
                male_audio_url: 'https://dk3kgylsgq3k1.cloudfront.net/audio/vocab/tts/male.mp3',
                female_audio_url: 'https://dk3kgylsgq3k1.cloudfront.net/audio/vocab/tts/female.mp3',
                translation: 'My classmate can <strong>read</strong> music.',
            },
        }, {
            id: 'x',
            type: 'vocab',
            attributes: { id: 963 },
        }],
    };

    it('normalizes vocab study questions into ordered example sentences', () => {
        const examples = normalizeBunproExampleSentences(vocabDetail);
        expect(examples).toHaveLength(1);
        expect(examples[0]).toMatchObject({
            text: 'クラスメイトは楽譜を読むことができる。',
            translation: 'My classmate can read music.',
            audioUrls: [
                'https://dk3kgylsgq3k1.cloudfront.net/audio/vocab/tts/female.mp3',
                'https://dk3kgylsgq3k1.cloudfront.net/audio/vocab/tts/male.mp3',
            ],
        });
        expect(examples[0]?.parts).toEqual([
            { text: 'クラスメイトは楽譜（がくふ）を', target: false },
            { text: '読（よ）む', target: true },
            { text: 'ことができる。', target: false },
        ]);
    });

    it('fills grammar cloze blanks with the kanji answer as the target segment', () => {
        const examples = normalizeBunproExampleSentences({
            included: [{
                type: 'study_question',
                attributes: {
                    id: 9209,
                    content: '____焼（や）かれるところだった。',
                    answer: 'いきながら',
                    kanji_answer: '生（い）きながら',
                    question_type: 'cloze',
                    sentence_order: 0,
                    male_audio_url: null,
                    female_audio_url: 'https://dk3kgylsgq3k1.cloudfront.net/audio/grammar/n1/a.mp3',
                    translation: 'I was nearly burned alive.',
                },
            }],
        });
        expect(examples).toHaveLength(1);
        expect(examples[0]).toMatchObject({
            text: '生きながら焼かれるところだった。',
            audioUrls: ['https://dk3kgylsgq3k1.cloudfront.net/audio/grammar/n1/a.mp3'],
        });
        expect(examples[0]?.parts[0]).toEqual({ text: '生（い）きながら', target: true });
    });

    it('sorts by sentence order, drops non-Japanese rows, and caps the list', () => {
        const rows = Array.from({ length: 14 }, (_, index) => ({
            type: 'study_question',
            attributes: { content: `文${index}です。`, sentence_order: 13 - index, translation: '', female_audio_url: '' },
        }));
        const examples = normalizeBunproExampleSentences({ included: [
            ...rows,
            { type: 'study_question', attributes: { content: 'English only.', sentence_order: -1 } },
        ] });
        expect(examples).toHaveLength(10);
        expect(examples[0]?.text).toBe('文13です。');
    });

    it('dedupes equivalent rows and merges distinct upstream recordings deterministically', () => {
        const examples = normalizeBunproExampleSentences({ included: [{
            id: 'one',
            type: 'study_question',
            attributes: { content: '日本　代表です。', translation: 'Japanese representative', sentence_order: 2, female_audio_url: 'https://audio.example.test/female.mp3' },
        }, {
            id: 'two',
            type: 'study_question',
            attributes: { content: ' 日本 代表です。 ', translation: ' japanese   representative ', sentence_order: 3, male_audio_url: 'https://audio.example.test/male.mp3' },
        }] });

        expect(examples).toHaveLength(1);
        expect(examples[0]?.audioUrls).toEqual([
            'https://audio.example.test/female.mp3',
            'https://audio.example.test/male.mp3',
        ]);
    });

    it('renders examples with hot-linked audio buttons like Jiten/JPDB sources', () => {
        const info = normalizeBunproDefinitionSearch({
            vocabs: { data: [{ id: 42, attributes: { id: 42, title: '読む', kana: 'よむ', slug: '読む', meaning: 'to read' } }] },
        }, '読む', 'よむ');
        if (!info) throw new Error('expected info');
        info.examples = normalizeBunproExampleSentences(vocabDetail);
        info.examplesAvailability = 'loaded';
        const html = renderBunproDefinitionSource(card, key => `data-source-state="${key}"`, info, 'en');

        expect(html).toContain('data-example-provider="bunpro"');
        expect(html).toContain('data-examples-availability="loaded"');
        expect(html).toContain('data-source-state="definition-source:__bunpro__:examples"');
        expect(html).not.toContain('jpdb-reader-bunpro-examples-group');
        expect(html).toContain('Example sentences');
        expect(html).toContain('data-action="bunpro-audio"');
        expect(html).toContain('data-audio-url="https://dk3kgylsgq3k1.cloudfront.net/audio/vocab/tts/female.mp3"');
        expect(html).toContain('data-study-sentence="クラスメイトは楽譜を読むことができる。"');
        expect(html).toContain('<rt class="jpdb-reader-furi">がくふ</rt>');
        expect(html).toContain('My classmate can read music.');
        expect(html).toContain('jpdb-reader-example-target');
        expect(html).not.toContain('Used in vocabulary');
        expect(html).not.toContain('Composed of');
    });

    it('distinguishes authoritative empty examples from auth, network, and schema failures', async () => {
        const client = {
            search: async () => ({ vocabs: { data: [{ id: 42, attributes: { id: 42, title: '読む', kana: 'よむ', slug: '読む', meaning: 'to read' } }] } }),
            getVocab: async () => vocabDetail,
            getGrammarPoint: async () => { throw new Error('unused'); },
        } as unknown as BunproClient;
        const info = await lookupBunproDefinition(client, card);
        expect(info?.examplesAvailability).toBe('loaded');
        expect(info?.examples).toHaveLength(1);

        const empty = await lookupBunproDefinition({ ...client, getVocab: async () => ({ included: [] }) } as unknown as BunproClient, card);
        expect(empty).toMatchObject({ examplesAvailability: 'empty', examples: [], examplesUnavailableReason: '' });

        const auth = await lookupBunproDefinition({ ...client, getVocab: async () => { throw new BunproApiError('denied', 401); } } as unknown as BunproClient, card);
        expect(auth).toMatchObject({ examplesAvailability: 'unavailable', examples: [], examplesUnavailableReason: 'auth' });

        const network = await lookupBunproDefinition({ ...client, getVocab: async () => { throw new Error('offline'); } } as unknown as BunproClient, card);
        expect(network).toMatchObject({ examplesAvailability: 'unavailable', examples: [], examplesUnavailableReason: 'network' });

        const schema = await lookupBunproDefinition({ ...client, getVocab: async () => ({ data: {} }) } as unknown as BunproClient, card);
        expect(schema).toMatchObject({ examplesAvailability: 'unavailable', examples: [], examplesUnavailableReason: 'schema' });

        const unavailableHtml = renderBunproDefinitionSource(card, key => `data-source-state="${key}"`, network, 'en');
        expect(unavailableHtml).toContain('Example sentences unavailable');
        expect(unavailableHtml).toContain('data-examples-unavailable-reason="network"');
        const emptyHtml = renderBunproDefinitionSource(card, key => `data-source-state="${key}"`, empty, 'en');
        expect(emptyHtml).toContain('No example sentences');
        expect(emptyHtml).not.toContain('Example sentences unavailable');
        const japaneseHtml = renderBunproDefinitionSource(card, key => `data-source-state="${key}"`, network, 'ja');
        expect(japaneseHtml).toContain('例文を読み込めません');
        expect(japaneseHtml).not.toContain('未翻訳');
    });
});
