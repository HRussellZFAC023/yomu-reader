import { describe, expect, it, vi } from 'vitest';
import {
    fallbackJapaneseSegments,
    fallbackLookupTermAtOffset,
    fallbackLookupTermsForText,
    ReaderParser,
} from '../../src/reader/lookup/parser';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { deinflectJapaneseTerm } from '../../src/reader/lookup/deinflect';
import type { JPDBToken } from '../../src/reader/app/types';

function deinflected(surface: string, lemma: string) {
    const candidate = deinflectJapaneseTerm(surface).find(item => item.term === lemma);
    expect(candidate, `${surface} should deinflect to ${lemma}`).toBeTruthy();
    return candidate!;
}

/**
 * Regression coverage for the keyless local segmenter that drives parsing when
 * no Jiten/JPDB key is available. These guard against the misparses reported in
 * the 2026-06-14 P0 backlog (P0-02): dangling kana stems and over-isolated
 * single-character tiles. They assert linguistic coherence properties rather
 * than re-deriving the segmenter, so the parser keeps choosing whole words from
 * sentence context instead of fragmenting continuous Japanese.
 */
function surfaces(text: string): string[] {
    return fallbackJapaneseSegments(text).map(segment => segment.surface);
}

function publicProviderToken(text: string, spelling: string, start: number, end: number): JPDBToken {
    return {
        card: {
            vid: start + 1,
            sid: 1,
            rid: 0,
            spelling,
            reading: '',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'jiten',
        },
        start,
        end,
        length: end - start,
        rubies: [],
        pitchClass: '',
        sentence: text,
    };
}

function parserWithPublicVocabulary(parse: (paragraphs: readonly string[]) => Promise<JPDBToken[][]>): ReaderParser {
    return new ReaderParser({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            localDictionariesEnabled: false,
        }),
        jpdb: {} as never,
        jitenPublicVocabulary: { parse },
        dictionaries: {} as never,
    });
}

describe('fallback Japanese segmentation coherence (P0-02)', () => {
    it('does not leave a dangling さし stem for ややさしい', () => {
        const segs = surfaces('ややさしい');
        expect(segs).toEqual(['や', 'やさしい']);
        expect(segs).not.toContain('さし');
        // The whole continuous run is still offered as a single lookup term.
        expect(fallbackLookupTermsForText('ややさしい')).toContain('ややさしい');
    });

    it('keeps 読み取る as a single compound verb instead of 読み + 取る', () => {
        expect(surfaces('読み取る')).toEqual(['読み取る']);
    });

    // ICU's keyless 'ja' word segmenter has no kana dictionary, so it
    // over-fragments hiragana-only words on phonetic guesses (にほんご→に|ほん|ご).
    // mergeContiguousKanaSegments collapses those bogus intra-kana boundaries
    // while preserving real particle / content-word splits.
    it('collapses over-segmented kana-only nouns into one token', () => {
        expect(surfaces('にほんご')).toEqual(['にほんご']);
        expect(surfaces('じかん')).toEqual(['じかん']);
        expect(surfaces('がっこう')).toEqual(['がっこう']);
        expect(surfaces('たべもの')).toEqual(['たべもの']);
        expect(surfaces('ｶﾀｶﾅ')).toEqual(['ｶﾀｶﾅ']);
    });

    it('keeps a real particle boundary when merging kana-only runs', () => {
        expect(surfaces('にほんごのじかん')).toEqual(['にほんご', 'の', 'じかん']);
    });

    it('does not over-merge a kana adjective behind a leading particle', () => {
        // やさしい independently deinflects to a content word, so its boundary
        // survives the kana merge (regression guard against gluing や+やさしい).
        expect(surfaces('ややさしい')).toEqual(['や', 'やさしい']);
    });

    it('parses a long mixed sentence into coherent words, not isolated tiles', () => {
        const segs = surfaces('好きなものを読んで日本語を学ぶ');
        expect(segs).toEqual(['好き', 'な', 'もの', 'を', '読んで', '日本語', 'を', '学ぶ']);
        // Specifically guard against the over-isolation the user reported.
        expect(segs).toContain('日本語');
        expect(segs).toContain('読んで');
        expect(segs).toContain('学ぶ');
        for (const fragment of ['日', '本', '語', '読', 'ん', 'で', '学', 'ぶ']) {
            expect(segs).not.toContain(fragment);
        }
    });

    it('uses public Jiten parsing for no-key full-page batches before segmented fallback', async () => {
        const publicParse = vi.fn(async (paragraphs: readonly string[]): Promise<JPDBToken[][]> => paragraphs.map(text => text.includes('猫')
            ? [{
                card: {
                    vid: 1259290,
                    sid: 0,
                    rid: 0,
                    spelling: '見る',
                    reading: '',
                    frequencyRank: null,
                    partOfSpeech: [],
                    meanings: [],
                    cardState: ['not-in-deck'],
                    pitchAccent: [],
                    wordWithReading: null,
                    source: 'jiten',
                    jitenWordId: 1259290,
                    jitenReadingIndex: 0,
                },
                start: 2,
                end: 4,
                length: 2,
                rubies: [],
                pitchClass: '',
                sentence: text,
            }]
            : []));
        const jpdbParse = vi.fn();
        const findTermMatches = vi.fn();
        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: false,
            }),
            jpdb: { parse: jpdbParse } as never,
            jitenPublicVocabulary: { parse: publicParse },
            dictionaries: { findTermMatches } as never,
        });

        const parsed = await parser.parse(['本を読む。', '猫を見る。'], { allowSegmentedFallback: true });

        expect(publicParse).toHaveBeenCalledTimes(1);
        expect(publicParse).toHaveBeenCalledWith(['本を読む。', '猫を見る。']);
        expect(jpdbParse).not.toHaveBeenCalled();
        expect(findTermMatches).not.toHaveBeenCalled();
        expect(parsed[1]?.find(token => token.card.source === 'jiten')?.card).toMatchObject({ source: 'jiten', jitenWordId: 1259290 });
        expect(parsed[0]?.map(token => token.card.spelling)).toEqual(['本', 'を', '読む']);
    });

    it('repairs a credentialed remote surname fragment to the whole inflected verb span', async () => {
        const sentence = '訪れたのかもしれない。';
        const surname: JPDBToken = {
            card: {
                vid: 5639848,
                sid: 0,
                rid: 0,
                spelling: '訪',
                reading: 'ほう',
                frequencyRank: null,
                partOfSpeech: ['name'],
                meanings: [{ glosses: ['Hou'], partOfSpeech: ['surname'] }],
                cardState: ['not-in-deck'],
                pitchAccent: ['HL'],
                wordWithReading: '訪[ほう]',
                source: 'jpdb',
            },
            start: 0,
            end: 1,
            length: 1,
            rubies: [{ text: 'ほう', start: 0, end: 1, length: 1 }],
            pitchClass: 'atamadaka',
            sentence,
        };
        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'test-key',
                jitenApiKey: '',
                localDictionariesEnabled: false,
                parserProvider: 'jpdb',
            }),
            jpdb: { parse: vi.fn(async () => [[surname]]) } as never,
            dictionaries: {} as never,
        });

        const [tokens] = await parser.parse([sentence], { requireJpdb: true, allowSegmentedFallback: true });

        expect(tokens.find(token => token.start === 0)).toMatchObject({
            start: 0,
            end: 3,
            card: {
                spelling: '訪れた',
                source: 'fallback',
                fallbackLookupTerms: expect.arrayContaining(['訪れる']),
            },
        });
        expect(tokens.some(token => token.card.spelling === '訪' && token.card.reading === 'ほう')).toBe(false);
    });

    it('keeps complete authoritative lexical and auxiliary tokens instead of merging them heuristically', async () => {
        const sentence = '食べた。';
        const lexical: JPDBToken = {
            card: {
                vid: 1001, sid: 0, rid: 0,
                spelling: '食べる', reading: 'たべる',
                frequencyRank: null, partOfSpeech: ['v1'], meanings: [],
                cardState: ['not-in-deck'], pitchAccent: ['LHHH'], wordWithReading: '食[た]べる',
                source: 'jpdb',
            },
            start: 0, end: 2, length: 2,
            rubies: [{ text: 'た', start: 0, end: 1, length: 1 }],
            pitchClass: 'heiban', sentence,
        };
        const auxiliary: JPDBToken = {
            card: {
                vid: 1002, sid: 0, rid: 0,
                spelling: 'た', reading: 'た',
                frequencyRank: null, partOfSpeech: ['aux'], meanings: [],
                cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null,
                source: 'jpdb',
            },
            start: 2, end: 3, length: 1,
            rubies: [], pitchClass: '', sentence,
        };
        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'test-key',
                localDictionariesEnabled: false,
                parserProvider: 'jpdb',
            }),
            jpdb: { parse: vi.fn(async () => [[lexical, auxiliary]]) } as never,
            dictionaries: {} as never,
        });

        const [tokens] = await parser.parse([sentence], { requireJpdb: true, allowSegmentedFallback: true });

        expect(tokens).toEqual([lexical, auxiliary]);
        expect(tokens.some(token => token.card.source === 'fallback')).toBe(false);
    });

    it('preserves one parse result per input when a provider returns a short response', async () => {
        const firstText = '日本語';
        const publicToken: JPDBToken = {
            card: {
                vid: 1, sid: 1, rid: 0, spelling: firstText, reading: 'にほんご',
                frequencyRank: null, partOfSpeech: [], meanings: [], cardState: ['not-in-deck'],
                pitchAccent: [], wordWithReading: null, source: 'jiten',
            },
            start: 0,
            end: firstText.length,
            length: firstText.length,
            rubies: [],
            pitchClass: '',
            sentence: firstText,
        };
        const publicParse = vi.fn(async (): Promise<JPDBToken[][]> => [[publicToken]]);
        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: false,
            }),
            jpdb: {} as never,
            jitenPublicVocabulary: { parse: publicParse },
            dictionaries: {} as never,
        });

        const paragraphs = [firstText, 'フィード', '参加'];
        const parsed = await parser.parse(paragraphs, { allowSegmentedFallback: true });

        expect(parsed).toHaveLength(paragraphs.length);
        expect(parsed[0]?.[0]).toBe(publicToken);
        expect(parsed[1]?.map(token => token.card.spelling)).toEqual(['フィード']);
        expect(parsed[2]?.map(token => token.card.spelling)).toEqual(['参加']);
    });

    it('repairs Japanese hidden behind a provider span the renderer must reject', async () => {
        const text = '参加フィード';
        const card = (spelling: string): JPDBToken['card'] => ({
            vid: 1,
            sid: 1,
            rid: 0,
            spelling,
            reading: '',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'jiten',
        });
        const publicParse = vi.fn(async (): Promise<JPDBToken[][]> => [[
            {
                card: card('参加'),
                start: 0,
                end: 2,
                length: 2,
                rubies: [],
                pitchClass: '',
                sentence: text,
            },
            {
                card: card('参加フィード'),
                start: 1,
                end: text.length,
                length: text.length - 1,
                rubies: [],
                pitchClass: '',
                sentence: text,
            },
        ]]);
        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: false,
            }),
            jpdb: {} as never,
            jitenPublicVocabulary: { parse: publicParse },
            dictionaries: {} as never,
        });

        const [tokens] = await parser.parse([text], { allowSegmentedFallback: true });

        expect(tokens.map(token => text.slice(token.start, token.end))).toEqual(['参加', 'フィード']);
        expect(tokens.every((token, index) => index === 0 || token.start >= tokens[index - 1]!.end)).toBe(true);
    });

    it('repairs a provider span that drifts across a non-Japanese prefix', async () => {
        const text = 'r/日本';
        const publicParse = vi.fn(async (): Promise<JPDBToken[][]> => [[{
            card: {
                vid: 1,
                sid: 1,
                rid: 0,
                spelling: 'r/日',
                reading: '',
                frequencyRank: null,
                partOfSpeech: [],
                meanings: [],
                cardState: ['not-in-deck'],
                pitchAccent: [],
                wordWithReading: null,
                source: 'jiten',
            },
            start: 0,
            end: 3,
            length: 3,
            rubies: [],
            pitchClass: '',
            sentence: text,
        }]]);
        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: false,
            }),
            jpdb: {} as never,
            jitenPublicVocabulary: { parse: publicParse },
            dictionaries: {} as never,
        });

        const [tokens] = await parser.parse([text], { allowSegmentedFallback: true });

        expect(tokens.map(token => ({ start: token.start, end: token.end, surface: text.slice(token.start, token.end) })))
            .toEqual([{ start: 2, end: 4, surface: '日本' }]);
    });

    it('preserves valid halfwidth-katakana provider coverage in a mixed paragraph', async () => {
        const text = '日本 ｶﾀｶﾅ';
        const providerTokens = [
            publicProviderToken(text, '日本', 0, 2),
            publicProviderToken(text, 'ｶﾀｶﾅ', 3, 7),
        ];
        const parser = parserWithPublicVocabulary(vi.fn(async () => [providerTokens]));

        const [tokens] = await parser.parse([text], { allowSegmentedFallback: true });

        expect(tokens).toEqual(providerTokens);
    });

    it('fills a halfwidth-katakana tail omitted by the provider', async () => {
        const text = '日本 ｶﾀｶﾅ';
        const parser = parserWithPublicVocabulary(vi.fn(async () => [[
            publicProviderToken(text, '日本', 0, 2),
        ]]));

        const [tokens] = await parser.parse([text], { allowSegmentedFallback: true });

        expect(tokens.map(token => text.slice(token.start, token.end))).toEqual(['日本', 'ｶﾀｶﾅ']);
    });

    it('repairs overlapping provider coverage without leaving halfwidth kana raw', async () => {
        const text = '日本ｶﾀ';
        const parser = parserWithPublicVocabulary(vi.fn(async () => [[
            publicProviderToken(text, '本ｶﾀ', 1, 4),
        ]]));

        const [tokens] = await parser.parse([text], { allowSegmentedFallback: true });

        expect(tokens.map(token => ({ start: token.start, end: token.end, surface: text.slice(token.start, token.end) })))
            .toEqual([
                { start: 0, end: 2, surface: '日本' },
                { start: 2, end: 4, surface: 'ｶﾀ' },
            ]);
    });

    it('parses 好きなものを読む coherently', () => {
        expect(surfaces('好きなものを読む')).toEqual(['好き', 'な', 'もの', 'を', '読む']);
    });

    it('keeps 日本語 and 学ぶ whole', () => {
        expect(surfaces('日本語を学ぶ')).toEqual(['日本語', 'を', '学ぶ']);
    });

    it('keeps 時間 whole after a number (duration word, not a glued counter)', () => {
        expect(surfaces('2時間前')).toEqual(['時間', '前']);
    });

    it('splits leading particles from Segmenter particle+noun compounds', () => {
        expect(surfaces('日本語の森')).toEqual(['日本語', 'の', '森']);
    });

    it('segments compound nouns like 管理拡張を追加 without fragmenting kanji words', () => {
        expect(surfaces('管理拡張を追加')).toEqual(['管理', '拡張', 'を', '追加']);
    });

    it('does not glue episode counters into the following title words', () => {
        const text = 'ぼっちの先輩にサークル勧誘された 1〜5話おまとめ版';
        const segs = surfaces(text);

        expect(segs).toContain('話');
        expect(segs).toContain('お');
        expect(segs).toContain('まとめ');
        expect(segs).toContain('版');
        expect(segs).not.toContain('話おまとめ');
        expect(segs).not.toContain('話おまとめ版');
        expect(fallbackLookupTermAtOffset(text, text.indexOf('話'))).toBe('話');
        expect(fallbackLookupTermAtOffset(text, text.indexOf('おまとめ'))).not.toMatch(/^話/u);
    });

    it('keeps duration words whole after a number (時間/年間/分間 are words, not glued counters)', () => {
        // 3時間前 shattered into 時|間|前 on the keyless/segmented path
        // (Reddit time-ago labels), each shard coloured as its own word.
        expect(surfaces('3時間前')).toEqual(['時間', '前']);
        expect(surfaces('1時間前')).toEqual(['時間', '前']);
        expect(surfaces('5年間の記録')).toContain('年間');
        expect(surfaces('30分間待つ')).toContain('分間');
        // The glued-counter split itself must survive: 3時半 is 時 + 半.
        expect(surfaces('3時半')).toEqual(['時', '半']);
    });

    it('keeps numeric counters separate after 第-prefixed numbers too', () => {
        const text = '第12話おまけ';

        expect(surfaces(text)).not.toContain('話おまけ');
        expect(fallbackLookupTermAtOffset(text, text.indexOf('話'))).toBe('話');
    });

    // Names like 紫音 (read しおん / しいん / しのん / むらさき depending on the
    // person) must be resolved by a name dictionary, never by a hand-coded
    // reading table. The parser only emits a reading the dictionary actually
    // returns; it must never invent one. See https://jpdb.io/search?q=紫音 for
    // why a single hard-coded reading is wrong.
    function nameAwareParser(matches: unknown[]): ReaderParser {
        return new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: true,
                showPitchAccent: false,
            }),
            jpdb: {} as never,
            dictionaries: { findTermMatches: vi.fn(async () => matches) } as never,
        });
    }

    it('resolves 紫音 as one token using the reading a name dictionary supplies', async () => {
        // When a name dictionary (e.g. JMnedict) is loaded, findTermMatches /
        // nonOverlappingMatches surface the whole compound, so the parser keeps
        // it together with the dictionary's verified reading.
        const parser = nameAwareParser([
            {
                entry: { expression: '紫音', reading: 'しおん', glossary: ['Shion (name)'], dictionary: 'JMnedict' },
                start: 0,
                end: 2,
                surface: '紫音',
                deinflected: false,
            },
        ]);

        const [tokens] = await parser.parse(['紫音'], { allowSegmentedFallback: true });

        expect(tokens).toHaveLength(1);
        expect(tokens[0]?.card.spelling).toBe('紫音');
        expect(tokens[0]?.card.reading).toBe('しおん');
        expect(tokens[0]?.rubies).toEqual([{ text: 'しおん', start: 0, end: 2, length: 2 }]);
    });

    it('never fabricates a name reading the dictionaries do not provide', async () => {
        // Without a name dictionary the lookups only know the single kanji, so
        // the parser must faithfully reflect them — it must NOT invent 紫音→しおん.
        const parser = nameAwareParser([
            {
                entry: { expression: '紫', reading: 'むらさき', glossary: ['purple'], dictionary: 'JMdict' },
                start: 0,
                end: 1,
                surface: '紫',
                deinflected: false,
            },
            {
                entry: { expression: '音', reading: 'おと', glossary: ['sound'], dictionary: 'JMdict' },
                start: 1,
                end: 2,
                surface: '音',
                deinflected: false,
            },
        ]);

        const [tokens] = await parser.parse(['紫音'], { allowSegmentedFallback: true });

        expect(tokens.map(token => token.card.spelling)).toEqual(['紫', '音']);
        expect(tokens.map(token => token.card.reading)).toEqual(['むらさき', 'おと']);
        expect(tokens.some(token => token.card.spelling === '紫音')).toBe(false);
        expect(tokens.some(token => token.card.reading === 'しおん')).toBe(false);
    });

    it('fills remote coverage gaps with deinflected local-dictionary tokens, not bare segments', async () => {
        const sentence = 'パスキーを使って本人確認を行います';
        const findTermMatches = vi.fn().mockResolvedValue([
            {
                entry: { expression: '使う', reading: 'つかう', rules: 'v5u', glossary: ['to use'], dictionary: 'Jitendex' },
                start: 5,
                end: 8,
                surface: '使って',
                deinflected: deinflected('使って', '使う'),
            },
            {
                entry: { expression: '行う', reading: 'おこなう', rules: 'v5u', glossary: ['to carry out'], dictionary: 'Jitendex' },
                start: 13,
                end: 17,
                surface: '行います',
                deinflected: deinflected('行います', '行う'),
            },
        ]);
        const lookupTermMeta = vi.fn(async () => []);
        const jpdbParse = vi.fn(async (): Promise<JPDBToken[][]> => [[
            publicProviderToken(sentence, 'パスキー', 0, 4),
            publicProviderToken(sentence, '本人確認', 8, 12),
        ]]);
        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'test-key',
                jitenApiKey: '',
                localDictionariesEnabled: true,
                parserProvider: 'jpdb',
            }),
            jpdb: { parse: jpdbParse } as never,
            dictionaries: { findTermMatches, lookupTermMeta } as never,
        });

        const [tokens] = await parser.parse([sentence], { requireJpdb: true, allowSegmentedFallback: true });

        const used = tokens.find(token => sentence.slice(token.start, token.end) === '使って');
        expect(used).toMatchObject({
            card: { spelling: '使う', reading: 'つかう', source: 'local' },
            rubies: [{ text: 'つか', start: 5, end: 6, length: 1 }],
        });
        const performed = tokens.find(token => sentence.slice(token.start, token.end) === '行います');
        expect(performed).toMatchObject({
            card: { spelling: '行う', reading: 'おこなう', source: 'local' },
            rubies: [{ text: 'おこな', start: 13, end: 14, length: 1 }],
        });
        // Provider tokens keep their identity; the gaps never regress to
        // reading-less fallback cards.
        expect(tokens.find(token => token.card.spelling === 'パスキー')?.card.source).toBe('jiten');
        expect(tokens.find(token => token.card.spelling === '本人確認')?.card.source).toBe('jiten');
        expect(tokens.filter(token => token.card.source === 'fallback').every(token =>
            !/[一-龯]/.test(sentence.slice(token.start, token.end)))).toBe(true);
    });
});
