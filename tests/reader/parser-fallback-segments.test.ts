import { describe, expect, it } from 'vitest';
import { fallbackJapaneseSegments, fallbackLookupTermsForText } from '../../src/reader/lookup/parser';

/**
 * Regression coverage for the keyless local segmenter that drives parsing when
 * no JPDB/Jiten key is available. These guard against the misparses reported in
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
});
