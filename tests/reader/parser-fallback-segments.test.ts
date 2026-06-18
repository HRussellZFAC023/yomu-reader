import { describe, expect, it, vi } from 'vitest';
import {
    fallbackJapaneseSegments,
    fallbackLookupTermAtOffset,
    fallbackLookupTermsForText,
    ReaderParser,
} from '../../src/reader/lookup/parser';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

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

    it('parses 好きなものを読む coherently', () => {
        expect(surfaces('好きなものを読む')).toEqual(['好き', 'な', 'もの', 'を', '読む']);
    });

    it('keeps 日本語 and 学ぶ whole', () => {
        expect(surfaces('日本語を学ぶ')).toEqual(['日本語', 'を', '学ぶ']);
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
});
