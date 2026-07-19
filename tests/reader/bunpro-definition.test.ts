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
        expect(html).toContain('My classmate can read music.');
        expect(html).toContain('jpdb-reader-example-target');
        expect(html).toContain('</article>\n            <div class="jpdb-reader-jpdb-extras jpdb-reader-bunpro-extras">');
        expect(html.indexOf('jpdb-reader-bunpro-extras')).toBeLessThan(html.indexOf('data-example-provider="bunpro"'));
        expect(html).not.toContain('Used in vocabulary');
        expect(html).not.toContain('Composed of');
    });

    it('feeds plain text plus a passive parseable target so our annotation system owns furigana', () => {
        const info = normalizeBunproDefinitionSearch({
            vocabs: { data: [{ id: 42, attributes: { id: 42, title: '読む', kana: 'よむ', slug: '読む', meaning: 'to read' } }] },
        }, '読む', 'よむ');
        if (!info) throw new Error('expected info');
        info.examples = normalizeBunproExampleSentences(vocabDetail);
        info.examplesAvailability = 'loaded';
        const html = renderBunproDefinitionSource(card, key => `data-source-state="${key}"`, info, 'en');

        // The sentence is rendered inside the shared parseable container.
        expect(html).toContain('jpdb-reader-example-sentence jpdb-reader-parseable');
        expect(html).toContain('data-provider-example-sentence');
        // Non-target text is plain: no baked ruby, no full-width kana parens.
        expect(html).not.toContain('（がくふ）');
        expect(html).not.toContain('がくふ');
        expect(html).toContain('クラスメイトは楽譜を');
        // The target's ruby comes from the shared bracket-annotation utility.
        expect(html).toContain('<rt class="jpdb-reader-furi">よ</rt>');
        // The target is a passive reader-word (not a plain <mark>) carrying
        // expression/reading so it survives re-parse and looks up correctly.
        expect(html).not.toContain('<mark');
        expect(html).toContain('jpdb-reader-word jpdb-reader-passive-word jpdb-reader-parseable jpdb-reader-has-furi jpdb-reader-example-target jpdb-reader-bunpro-example-target');
        expect(html).toContain('data-expression="読む"');
        expect(html).toContain('data-reading="よむ"');
        expect(html).toContain('data-sentence="クラスメイトは楽譜を読むことができる。"');
        expect(html).toContain('data-dictionary="Bunpro"');
    });

    it('strips inline markup and kana annotations from the Japanese nuance and renders it parseable', () => {
        const info = normalizeBunproDefinitionSearch({
            vocabs: { data: [{ id: 42, attributes: {
                id: 42,
                title: '言葉',
                kana: 'ことば',
                slug: '言葉',
                meaning: 'word; language',
                nuance: 'ある言語（げんご）の構成（こうせい）要素（ようそ）として<strong>分類（ぶんるい）</strong>されるもの。',
                nuance_translation: 'A unit classified as a component of a language.',
            } }] },
        }, '言葉', 'ことば');
        const html = renderBunproDefinitionSource({ ...card, spelling: '言葉', reading: 'ことば' }, key => `data-source-state="${key}"`, info, 'en');

        expect(html).not.toContain('&lt;strong&gt;');
        expect(html).not.toContain('（げんご）');
        expect(html).not.toContain('（ぶんるい）');
        expect(html).toContain('<div class="jpdb-reader-parseable">ある言語の構成要素として分類されるもの。</div>');
        expect(html).toContain('<div>A unit classified as a component of a language.</div>');
    });

    it('renders the headword as a passive parseable reference with word audio from the detail payload', async () => {
        const client = {
            search: async () => ({ vocabs: { data: [{ id: 42, attributes: { id: 42, title: '言葉', kana: 'ことば', slug: '言葉', meaning: 'word' } }] } }),
            getVocab: async () => ({
                data: { id: '42', type: 'vocab', attributes: {
                    pitch_accent_stress: 'LHH',
                    frequency_general: 157,
                    frequency_anime: 494,
                    male_audio_url: 'https://dk3kgylsgq3k1.cloudfront.net/audio/vocab/tts/male.mp3',
                    female_audio_url: 'https://dk3kgylsgq3k1.cloudfront.net/audio/vocab/tts/female.mp3',
                    jmdict_data: { sense: [{ related: [['言語']], antonym: [['無言']] }] },
                } },
                included: [],
            }),
            getGrammarPoint: async () => { throw new Error('unused'); },
        } as unknown as BunproClient;
        const info = await lookupBunproDefinition(client, { ...card, spelling: '言葉', reading: 'ことば' });
        if (!info) throw new Error('expected info');
        expect(info.pitchAccentStress).toBe('LHH');
        expect(info.frequencies).toEqual([{ list: 'general', rank: 157 }, { list: 'anime', rank: 494 }]);
        expect(info.relatedWords).toEqual([{ text: '言語', relation: 'related' }, { text: '無言', relation: 'antonym' }]);

        const html = renderBunproDefinitionSource(card, key => `data-source-state="${key}"`, info, 'en');
        // Headword is a passive parseable reader-word, like Jiten's.
        expect(html).toContain('jpdb-reader-bunpro-headword-target');
        expect(html).toContain('data-expression="言葉"');
        expect(html).toContain('data-reading="ことば"');
        // Word audio button hot-links the detail recording.
        expect(html).toContain('data-action="bunpro-audio"');
        expect(html).toContain('data-audio-url="https://dk3kgylsgq3k1.cloudfront.net/audio/vocab/tts/female.mp3"');
        // Frequency is owned by the shared word-pill row, not duplicated as
        // provider-specific tags inside the Bunpro definition card.
        expect(html).not.toContain('General #157');
        expect(html).not.toContain('Anime #494');
        // JMdict related/antonym render via the shared related-words pattern.
        expect(html).toContain('Related words');
        expect(html).toContain('jpdb-reader-jpdb-used-in-group');
        expect(html).toContain('data-dictionary-lookup="言語"');
        expect(html).toContain('data-dictionary-lookup="無言"');
        expect(html).toContain('>Antonym<');
    });

    it('surfaces grammar caution, register, structure, and related grammar from the detail payload', async () => {
        const client = {
            search: async () => ({ grammar_points: { data: [{ id: 132, attributes: { id: 132, title: 'れる・られる', furigana: 'れる・られる', slug: 'れる・られる', meaning: 'potential' } }] } }),
            getVocab: async () => { throw new Error('unused'); },
            getGrammarPoint: async () => ({
                data: { id: '132', type: 'grammar_point', attributes: {
                    caution: 'In Japanese, the potential is considered to be <strong>beyond</strong> the control of a person.',
                    register: '一般',
                    register_translation: 'Standard',
                    polite_structure: '動詞（どうし） + られます<br>見（み）る + られます',
                    casual_structure: '動詞（どうし） + られる',
                    previous_grammar_point: { id: 131, title: 'たがる', slug: 'たがる' },
                    next_grammar_point: { id: 133, title: 'ことができる', slug: 'ことができる' },
                } },
                included: [],
            }),
        } as unknown as BunproClient;
        const info = await lookupBunproDefinition(client, { ...card, spelling: 'れる・られる', reading: 'れる・られる' });
        if (!info) throw new Error('expected info');
        expect(info.structures).toEqual([
            { label: 'polite', lines: ['動詞 + られます', '見る + られます'] },
            { label: 'casual', lines: ['動詞 + られる'] },
        ]);
        expect(info.relatedGrammar).toEqual([
            { id: 131, title: 'たがる', slug: 'たがる' },
            { id: 133, title: 'ことができる', slug: 'ことができる' },
        ]);

        const html = renderBunproDefinitionSource(card, key => `data-source-state="${key}"`, info, 'en');
        expect(html).toContain('Caution');
        expect(html).toContain('beyond');
        expect(html).not.toContain('<strong>beyond</strong>');
        expect(html).toContain('>Standard<');
        expect(html).toContain('Structure');
        expect(html).toContain('<div class="jpdb-reader-parseable">動詞 + られます</div>');
        expect(html).toContain('Related grammar');
        expect(html).toContain('data-dictionary-lookup="たがる"');
        expect(html).toContain('data-dictionary-lookup="ことができる"');

        const jaHtml = renderBunproDefinitionSource(card, key => `data-source-state="${key}"`, info, 'ja');
        expect(jaHtml).toContain('>一般<');
        expect(jaHtml).toContain('関連文法');
    });

    it('resolves a bounded set of grammar coverage vocab into a Used in section', async () => {
        const vocabById: Record<number, { word?: string; kana: string; meaning: string }> = {
            9101: { word: '食べる', kana: 'たべる', meaning: 'to eat' },
            9102: { kana: 'クラス', meaning: 'class' },
            9104: { word: '見る', kana: 'みる', meaning: 'to see' },
            9105: { word: '行く', kana: 'いく', meaning: 'to go' },
        };
        const getVocab = vi.fn(async (id: number) => {
            const entry = vocabById[id];
            if (!entry) throw new Error(`no vocab ${id}`);
            return { data: { id: String(id), type: 'vocab', attributes: entry } };
        });
        const client = {
            search: async () => ({ grammar_points: { data: [{ id: 132, attributes: { id: 132, title: 'れる・られる', furigana: 'れる・られる', slug: 'れる・られる', meaning: 'potential' } }] } }),
            getVocab,
            getGrammarPoint: async () => ({
                data: { id: '132', type: 'grammar_point', attributes: {
                    coverage_vocab_ids: [9101, 9102, 9103, 9104, 9105, 9106, 9107],
                } },
                included: [],
            }),
        } as unknown as BunproClient;

        const info = await lookupBunproDefinition(client, { ...card, spelling: 'れる・られる', reading: 'れる・られる' });
        if (!info) throw new Error('expected info');

        // Only the first five ids are ever requested (9106/9107 stay unfetched)
        // and the one failing id (9103) drops silently instead of breaking the rest.
        expect(getVocab.mock.calls.map(call => call[0])).toEqual([9101, 9102, 9103, 9104, 9105]);
        expect(info.coverageVocabIds).toEqual([9101, 9102, 9103, 9104, 9105, 9106, 9107]);
        expect(info.usedInVocab.map(entry => entry.text)).toEqual(['食べる', 'クラス', '見る', '行く']);
        expect(info.usedInVocab[0]).toEqual({ id: 9101, text: '食べる', reading: 'たべる', meaning: 'to eat' });
        expect(info.usedInVocab[1].reading).toBe('');

        const html = renderBunproDefinitionSource(card, key => `data-source-state="${key}"`, info, 'en');
        expect(html).toContain('Used in');
        expect(html).toContain('jpdb-reader-jpdb-used-in-group');
        expect(html).toContain('data-dictionary-lookup="食べる"');
        expect(html).toContain('<small lang="ja">たべる</small>');
        expect(html).toContain('<small>to eat</small>');
        const jaHtml = renderBunproDefinitionSource(card, key => `data-source-state="${key}"`, info, 'ja');
        expect(jaHtml).toContain('使われている単語');

        // Reopening the same grammar entry resolves from the LRU cache: no new
        // requests for the ids that already succeeded (only the failed 9103 retries).
        getVocab.mockClear();
        const again = await lookupBunproDefinition(client, { ...card, spelling: 'れる・られる', reading: 'れる・られる' });
        expect(again?.usedInVocab.map(entry => entry.text)).toEqual(['食べる', 'クラス', '見る', '行く']);
        expect(getVocab.mock.calls.map(call => call[0])).toEqual([9103]);
    });

    it('never resolves coverage vocab for vocabulary entries', async () => {
        const getVocabCalls: unknown[] = [];
        const client = {
            search: async () => ({ vocabs: { data: [{ id: 42, attributes: { id: 42, title: '言葉', kana: 'ことば', slug: '言葉', meaning: 'word' } }] } }),
            getVocab: async (id: unknown) => {
                getVocabCalls.push(id);
                return { data: { id: '42', type: 'vocab', attributes: { coverage_vocab_ids: [1, 2, 3] } }, included: [] };
            },
            getGrammarPoint: async () => { throw new Error('unused'); },
        } as unknown as BunproClient;
        const info = await lookupBunproDefinition(client, { ...card, spelling: '言葉', reading: 'ことば' });
        if (!info) throw new Error('expected info');
        // Exactly one vocab request: the entry's own detail — never coverage fan-out.
        expect(getVocabCalls).toHaveLength(1);
        expect(info.usedInVocab).toEqual([]);
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

        // Empty and failed example collections render NO examples section at
        // all — no count-0 header, no placeholder row (loaded sections keep
        // rendering, asserted above via the 'loaded' info fixture).
        const loadedHtml = renderBunproDefinitionSource(card, key => `data-source-state="${key}"`, info!, 'en');
        expect(loadedHtml).toContain('jpdb-reader-jpdb-examples-group');
        for (const [collection, language] of [[network, 'en'], [empty, 'en'], [network, 'ja']] as const) {
            const html = renderBunproDefinitionSource(card, key => `data-source-state="${key}"`, collection!, language);
            expect(html).not.toContain('jpdb-reader-jpdb-examples-group');
            expect(html).not.toContain('Example sentences unavailable');
            expect(html).not.toContain('No example sentences');
            expect(html).not.toContain('例文を読み込めません');
        }
    });
});
