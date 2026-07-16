import { afterEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';

import type { ReaderSettings } from '../../src/reader/app/types';
import { YomitanDictionaryStore } from '../../src/reader/dictionaries/yomitan';
import { readerWordSurfaceText, renderTokensToHtml } from '../../src/reader/dom';
import { deinflectJapaneseTerm } from '../../src/reader/lookup/deinflect';
import {
    ReaderParser,
    fallbackDictionaryLookupTermsForText,
    fallbackJapaneseSegments,
} from '../../src/reader/lookup/parser';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

const stores: YomitanDictionaryStore[] = [];

function settings(overrides: Partial<ReaderSettings> = {}): ReaderSettings {
    return {
        ...DEFAULT_SETTINGS,
        apiKey: '',
        jitenApiKey: '',
        localDictionariesEnabled: true,
        showFurigana: true,
        furiganaMode: 'all',
        showPitchAccent: true,
        ...overrides,
    };
}

function surfaces(text: string): Array<[string, number, number]> {
    return fallbackJapaneseSegments(text).map(segment => [segment.surface, segment.start, segment.end]);
}

function deinflected(surface: string, lemma: string) {
    const candidate = deinflectJapaneseTerm(surface).find(item => item.term === lemma);
    expect(candidate, `${surface} should deinflect to ${lemma}`).toBeTruthy();
    return candidate!;
}

afterEach(async () => {
    document.body.innerHTML = '';
    await Promise.all(stores.splice(0).map(store => store.clear()));
});

describe('Japanese inflection lookup boundaries', () => {
    it('stops inflected verbs before the noun they modify', () => {
        expect(surfaces('会った人')).toEqual([['会った', 0, 3], ['人', 3, 4]]);
        expect(surfaces('読んだ本')).toEqual([['読んだ', 0, 3], ['本', 3, 4]]);
        expect(surfaces('食べた物')).toEqual([['食べた', 0, 3], ['物', 3, 4]]);
        expect(surfaces('知っている人')).toEqual([['知っている', 0, 5], ['人', 5, 6]]);
        expect(surfaces('会えなかった人')).toEqual([['会えなかった', 0, 6], ['人', 6, 7]]);
    });

    it('keeps polite and suru inflections whole without swallowing nearby nouns or particles', () => {
        expect(surfaces('会いませんでしたね')).toEqual([['会いませんでした', 0, 8], ['ね', 8, 9]]);
        expect(surfaces('聞きながら')).toEqual([['聞きながら', 0, 5]]);
        expect(surfaces('ねこ')).toEqual([['ねこ', 0, 2]]);
        expect(surfaces('勉強した人')).toEqual([['勉強', 0, 2], ['した', 2, 4], ['人', 4, 5]]);
        expect(surfaces('追加できます')).toEqual([['追加', 0, 2], ['できます', 2, 6]]);
        expect(surfaces('勉強します')).toEqual([['勉強', 0, 2], ['します', 2, 5]]);
        expect(surfaces('話します')).toEqual([['話します', 0, 4]]);
        expect(surfaces('3人会った')).toEqual([['人', 1, 2], ['会った', 2, 5]]);
        expect(surfaces('がっこうのひと')).toEqual([['がっこう', 0, 4], ['の', 4, 5], ['ひと', 5, 7]]);
    });

    it('deinflects the Academy ます-stem and ながら form to the dictionary verb', () => {
        expect(deinflected('聞き', '聞く')).toMatchObject({ reasons: ['continuative stem'], depth: 1 });
        expect(deinflected('聞きながら', '聞く')).toMatchObject({ reasons: ['simultaneous action'], depth: 1 });
        expect(deinflected('食べながら', '食べる')).toMatchObject({ reasons: ['simultaneous action'], depth: 1 });
        expect(fallbackDictionaryLookupTermsForText('聞き').slice(0, 2)).toEqual(['聞き', '聞く']);
        expect(fallbackDictionaryLookupTermsForText('動き').slice(0, 2)).toEqual(['動き', '動く']);
        const nagaraTerms = fallbackDictionaryLookupTermsForText('聞きながら');
        expect(nagaraTerms).toContain('聞く');
        expect(nagaraTerms.indexOf('聞く')).toBeLessThan(nagaraTerms.indexOf('聞きながら'));
    });

    it('keeps the Academy 聞く, 言う, and 会う families as complete dictionary forms', () => {
        for (const [surface, lemma] of [
            ['聞きました', '聞く'],
            ['聞きながら', '聞く'],
            ['言いました', '言う'],
            ['言いながら', '言う'],
            ['会いました', '会う'],
            ['会いながら', '会う'],
            ['会いませんでした', '会う'],
        ]) {
            expect(deinflected(surface, lemma).depth).toBe(1);
            expect(fallbackDictionaryLookupTermsForText(surface)).toContain(lemma);
        }
        expect(surfaces('聞きました。言いました。会いませんでした。')).toEqual([
            ['聞きました', 0, 5],
            ['言いました', 6, 11],
            ['会いませんでした', 12, 20],
        ]);
    });

    it('selects deinflected verb spans and following nouns from a real local dictionary', async () => {
        const store = new YomitanDictionaryStore();
        stores.push(store);
        await store.clear();
        await store.importFile(new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [{
                    tableName: 'terms',
                    rows: [
                        { $: [1, { expression: '会う', reading: 'あう', rules: 'v5u', glossary: ['to meet'], score: 20, dictionary: 'Jitendex' }] },
                        { $: [2, { expression: '読む', reading: 'よむ', rules: 'v5m', glossary: ['to read'], score: 20, dictionary: 'Jitendex' }] },
                        { $: [3, { expression: '食べる', reading: 'たべる', rules: 'v1', glossary: ['to eat'], score: 20, dictionary: 'Jitendex' }] },
                        { $: [4, { expression: '知る', reading: 'しる', rules: 'v5r', glossary: ['to know'], score: 20, dictionary: 'Jitendex' }] },
                        { $: [5, { expression: '人', reading: 'ひと', glossary: ['person'], score: 20, dictionary: 'Jitendex' }] },
                        { $: [6, { expression: '本', reading: 'ほん', glossary: ['book'], score: 20, dictionary: 'Jitendex' }] },
                        { $: [7, { expression: '物', reading: 'もの', glossary: ['thing'], score: 20, dictionary: 'Jitendex' }] },
                    ],
                }],
            },
        })], 'inflection-boundaries.json', { type: 'application/json' }));

        const matches = await store.findTermMatches('会った人。読んだ本。食べた物。知っている人。会えなかった人。会いませんでした。', 16);

        expect(matches.map(match => [match.surface, match.entry.expression, match.start, match.end])).toEqual([
            ['会った', '会う', 0, 3],
            ['人', '人', 3, 4],
            ['読んだ', '読む', 5, 8],
            ['本', '本', 8, 9],
            ['食べた', '食べる', 10, 13],
            ['物', '物', 13, 14],
            ['知っている', '知る', 15, 20],
            ['人', '人', 20, 21],
            ['会えなかった', '会う', 22, 28],
            ['人', '人', 28, 29],
            ['会いませんでした', '会う', 30, 38],
        ]);
    });

    it('keeps local pitch and emits surface furigana for a deinflected match', async () => {
        const findTermMatches = vi.fn().mockResolvedValue([
            {
                entry: { expression: '会う', reading: 'あう', rules: 'v5u', glossary: ['to meet'], dictionary: 'Jitendex' },
                start: 2,
                end: 5,
                surface: '会った',
                deinflected: deinflected('会った', '会う'),
            },
            {
                entry: { expression: '人', reading: 'ひと', glossary: ['person'], dictionary: 'Jitendex' },
                start: 5,
                end: 6,
                surface: '人',
            },
        ]);
        const lookupTermMeta = vi.fn(async (expression: string) => expression === '会う'
            ? [{ expression: '会う', mode: 'pitch', data: { reading: 'あう', pitches: [{ position: 0 }] }, dictionary: 'Pitch' }]
            : []);
        const parser = new ReaderParser({
            getSettings: () => settings(),
            jpdb: {} as never,
            dictionaries: { findTermMatches, lookupTermMeta } as never,
        });

        const sentence = '昨日会った人';
        const [tokens] = await parser.parse([sentence], { allowSegmentedFallback: true });

        expect(tokens.map(token => [sentence.slice(token.start, token.end), token.card.spelling, token.card.source])).toEqual([
            ['昨日', '昨日', 'fallback'],
            ['会った', '会う', 'local'],
            ['人', '人', 'local'],
        ]);
        expect(tokens[1]).toMatchObject({
            start: 2,
            end: 5,
            rubies: [{ text: 'あ', start: 2, end: 3, length: 1 }],
            pitchClass: 'heiban',
            card: { reading: 'あう', pitchAccent: ['LHH'] },
        });
        expect(lookupTermMeta).toHaveBeenCalledWith('会う', expect.any(Number), DEFAULT_SETTINGS.dictionaryPreferences);

        document.body.innerHTML = renderTokensToHtml(sentence, tokens, settings());
        const words = [...document.querySelectorAll<HTMLElement>('.jpdb-reader-word')];
        expect(words.map(readerWordSurfaceText)).toEqual(['昨日', '会った', '人']);
        expect(words[1]?.querySelector('rt')?.textContent).toBe('あ');
    });

    it('carries the base card ruby and pitch onto standalone Academy 聞き', async () => {
        const parser = new ReaderParser({
            getSettings: () => settings(),
            jpdb: {} as never,
            dictionaries: {
                findTermMatches: vi.fn().mockResolvedValue([{
                    entry: { expression: '聞く', reading: 'きく', rules: 'v5k', glossary: ['to listen'], dictionary: 'Jitendex' },
                    start: 0,
                    end: 2,
                    surface: '聞き',
                    deinflected: deinflected('聞き', '聞く'),
                }]),
                lookupTermMeta: vi.fn(async () => [{
                    expression: '聞く',
                    mode: 'pitch',
                    data: { reading: 'きく', pitches: [{ position: 0 }] },
                    dictionary: 'Pitch',
                }]),
            } as never,
        });

        const [[token]] = await parser.parse(['聞き'], { allowSegmentedFallback: true });

        expect(token).toMatchObject({
            start: 0,
            end: 2,
            rubies: [{ text: 'き', start: 0, end: 1, length: 1 }],
            pitchClass: 'heiban',
            card: { spelling: '聞く', reading: 'きく', pitchAccent: ['LHH'] },
        });
        document.body.innerHTML = renderTokensToHtml('聞き', [token], settings());
        expect(document.querySelector('rt')?.textContent).toBe('き');
        expect(document.querySelector('.jpdb-reader-word')?.classList.contains('jpdb-pitch-heiban')).toBe(true);
    });

    it('keeps stem furigana and pitch on polite Academy hear, say, and meet text', async () => {
        const examples = [
            { surface: '聞きました', expression: '聞く', reading: 'きく', rules: 'v5k', ruby: 'き' },
            { surface: '言いました', expression: '言う', reading: 'いう', rules: 'v5u', ruby: 'い' },
            { surface: '会いました', expression: '会う', reading: 'あう', rules: 'v5u', ruby: 'あ' },
        ];
        let offset = 0;
        const text = examples.map(example => example.surface).join('。');
        const findTermMatches = vi.fn().mockResolvedValue(examples.map(example => {
            const start = offset;
            offset += example.surface.length + 1;
            return {
                entry: { ...example, glossary: ['Academy verb'], dictionary: 'Jitendex' },
                start,
                end: start + example.surface.length,
                surface: example.surface,
                deinflected: deinflected(example.surface, example.expression),
            };
        }));
        const parser = new ReaderParser({
            getSettings: () => settings(),
            jpdb: {} as never,
            dictionaries: {
                findTermMatches,
                lookupTermMeta: vi.fn(async () => [{
                    expression: 'Academy verb',
                    mode: 'pitch',
                    data: { reading: 'きく', pitches: [{ position: 0 }] },
                    dictionary: 'Pitch',
                }]),
            } as never,
        });

        const [tokens] = await parser.parse([text], { allowSegmentedFallback: true });

        expect(tokens.map(token => [text.slice(token.start, token.end), token.card.spelling, token.rubies[0]?.text, token.pitchClass])).toEqual([
            ['聞きました', '聞く', 'き', 'heiban'],
            ['言いました', '言う', 'い', 'heiban'],
            ['会いました', '会う', 'あ', 'heiban'],
        ]);
        document.body.innerHTML = renderTokensToHtml(text, tokens, settings());
        expect([...document.querySelectorAll('rt')].map(reading => reading.textContent)).toEqual(['き', 'い', 'あ']);
        expect(document.querySelectorAll('.jpdb-pitch-heiban')).toHaveLength(3);
    });

    it('parses authored 聞きながら text and keeps an exact noun ahead of a stem candidate', async () => {
        const store = new YomitanDictionaryStore();
        stores.push(store);
        await store.clear();
        await store.importFile(new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [{
                    tableName: 'terms',
                    rows: [
                        { $: [1, { expression: '聞く', reading: 'きく', rules: 'v5k', glossary: ['to listen'], score: 20, dictionary: 'Jitendex' }] },
                        { $: [2, { expression: '料理する', reading: 'りょうりする', rules: 'vs', glossary: ['to cook'], score: 20, dictionary: 'Jitendex' }] },
                        { $: [3, { expression: '動き', reading: 'うごき', rules: 'n', glossary: ['movement'], score: 20, dictionary: 'Jitendex' }] },
                        { $: [4, { expression: '動く', reading: 'うごく', rules: 'v5k', glossary: ['to move'], score: 20, dictionary: 'Jitendex' }] },
                    ],
                }],
            },
        })], 'academy-continuative-stems.json', { type: 'application/json' }));

        const lesson = '音楽を聞きながら料理します。聞き。動き。';
        const matches = await store.findTermMatches(lesson, 16);

        expect(matches.map(match => [match.surface, match.entry.expression])).toEqual([
            ['聞きながら', '聞く'],
            ['料理します', '料理する'],
            ['聞き', '聞く'],
            ['動き', '動き'],
        ]);
    });
});
