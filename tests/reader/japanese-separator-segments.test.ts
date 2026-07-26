import { describe, expect, it } from 'vitest';
import { fallbackJapaneseSegments } from '../../src/reader/lookup/parser';

/**
 * Separator punctuation must break tokens.
 *
 * Reported from the owner's Yomu lookup popover on a Discord blurb: the run
 * ボイス・ビデオ・テキストコミュニケーションサービス rendered as ONE headword,
 * so the popover said "Exact pitch unavailable" — no dictionary carries the
 * glued blob. The katakana middle dot ・ is a word separator, and it was being
 * treated as a katakana letter because it lives inside the katakana Unicode
 * block (U+30A0-U+30FF), which every katakana character class in
 * japanese-segments.ts is built from.
 *
 * ENGINE INDEPENDENCE. `Intl.Segmenter` is ICU4C in Chromium/WebKit and ICU4X in
 * Firefox, and they disagree hard on this input — measured 2026-07-26:
 *
 *   Chromium  ボイス|・|ビデオ|・|テキスト|コミュニケーション|サービス
 *   Firefox   ボイス|・|ビデオ|・|テキストコミュニケーションサービス
 *
 * So every assertion below is on OUR repair layer's output, never on raw ICU
 * boundaries, and the repair is a hard split rather than a guard inside the
 * katakana merge — a merge-side guard would be a no-op on any engine that hands
 * back a dotted run as a single segment. The expectations here were verified
 * identical in both real engines by injecting the built pipeline into Firefox
 * and Chromium via Playwright, not just under node's ICU4C.
 *
 * KNOWN REMAINING GAP, deliberately pinned rather than hidden. The owner's
 * string ideally reads as five words (ボイス/ビデオ/テキスト/コミュニケーション/
 * サービス). Only three are reachable here: the trailing chunk carries no
 * separator, and Firefox returns it as a single ICU segment, so there is no
 * boundary left to trust on that engine. Splitting a separator-free katakana
 * compound needs a dictionary-backed longest match, which is a different fix in
 * a different layer. If that lands, the first expectation below fails loudly and
 * should be updated on purpose.
 */
function surfaces(text: string): string[] {
    return fallbackJapaneseSegments(text).map(segment => segment.surface);
}

const OWNER_MISPARSE = 'ボイス・ビデオ・テキストコミュニケーションサービス';
const OWNER_SENTENCE = 'Discordとは、アメリカで開発されたボイス・ビデオ・テキストコミュニケーションサービスです。';
// ・ U+30FB, ･ U+FF65, ゠ U+30A0 all sit inside the kana blocks; · U+00B7 and
// • U+2022 are the Latin-typeset stand-ins that turn up in the same role.
const SEPARATORS = ['・', '･', '゠', '·', '•'];

describe('separator punctuation is a hard token boundary', () => {
    it('splits the reported Discord run instead of gluing it into one headword', () => {
        expect(surfaces(OWNER_MISPARSE)).toEqual([
            'ボイス',
            'ビデオ',
            'テキストコミュニケーションサービス',
        ]);
    });

    it('splits the same run inside its source sentence', () => {
        const segments = surfaces(OWNER_SENTENCE);
        expect(segments).toContain('ボイス');
        expect(segments).toContain('ビデオ');
        expect(segments).not.toContain(OWNER_MISPARSE);
    });

    it('breaks tokens on every separator, not just the one that was reported', () => {
        // The bug class is "separator punctuation must break tokens". ･/·/• were
        // already correct by luck (they fall outside every Japanese character
        // class, so the run regex never picked them up); ・ and ゠ were broken
        // because they alone live inside a letter block. All five must agree.
        for (const separator of SEPARATORS) {
            expect(surfaces(`ボイス${separator}ビデオ${separator}テキスト`), separator)
                .toEqual(['ボイス', 'ビデオ', 'テキスト']);
        }
    });

    it('never emits a separator as a lookup-able token of its own', () => {
        // 株式会社・A used to emit a bare '・' token: the dot passes
        // JAPANESE_CHARACTER_RE, so isUsefulJapaneseSegment kept it as a word.
        expect(surfaces('株式会社・A')).toEqual(['株式会社']);
        expect(surfaces('アニメ・漫画')).toEqual(['アニメ', '漫画']);
        expect(surfaces('・')).toEqual([]);
        for (const separator of SEPARATORS) {
            expect(surfaces(`ボイス${separator}`), separator).toEqual(['ボイス']);
            expect(surfaces(`${separator}ボイス`), separator).toEqual(['ボイス']);
        }
        for (const surface of surfaces(OWNER_SENTENCE)) {
            expect(SEPARATORS.some(separator => surface.includes(separator)), surface).toBe(false);
        }
    });

    it('keeps a trailing separator from collapsing the run through the coverage guard', () => {
        // segmentJapaneseRun bails to "whole run as one token" unless the last
        // segment reaches the end of the run. Dropping the trailing ・ before
        // that check would reproduce the exact bug, so the split has to run
        // after it, inside finalizeJapaneseRunSegments.
        expect(surfaces('ボイス・ビデオ・')).toEqual(['ボイス', 'ビデオ']);
        expect(surfaces('サン・テグジュペリの星の王子さま')).toContain('サン');
    });

    it('leaves the separator uncovered so it is never annotated', () => {
        const segments = fallbackJapaneseSegments(OWNER_MISPARSE);
        expect(segments.map(segment => [segment.start, segment.end])).toEqual([[0, 3], [4, 7], [8, 25]]);
        for (const segment of segments) {
            expect(OWNER_MISPARSE.slice(segment.start, segment.end)).toBe(segment.surface);
        }
    });

    it('does not split compounds that contain no separator', () => {
        // Regression guard on the katakana run merge: ICU4C over-splits loanword
        // compounds phonetically, so a separator-free katakana run stays one
        // orthographic word and dictionary lookup decomposes it downstream.
        expect(surfaces('コミュニケーションサービス')).toEqual(['コミュニケーションサービス']);
        expect(surfaces('テキストコミュニケーションサービス')).toEqual(['テキストコミュニケーションサービス']);
        expect(surfaces('イマージョンキット')).toEqual(['イマージョンキット']);
        expect(surfaces('イマージョンキットで学ぶ')).toEqual(['イマージョンキット', 'で', '学ぶ']);
        expect(surfaces('アニメで日本語')).toEqual(['アニメ', 'で', '日本語']);
        expect(surfaces('にほんごのじかん')).toEqual(['にほんご', 'の', 'じかん']);
    });
});
