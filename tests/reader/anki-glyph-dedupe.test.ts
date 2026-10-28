import { describe, expect, it } from 'vitest';

import { pruneRedundantAnkiGlyphRepeats } from '../../src/reader/anki/render';

// UT-49: RTK-style kanji templates repeat the glyph in decorative fonts that
// cannot load here — collapse the exact duplicates.
describe('pruneRedundantAnkiGlyphRepeats', () => {
    it('keeps one glyph from a multi-font repeat row (real RRTK front shape)', () => {
        const html = '<span style="font-family:YUMIN;font-size:100px;">一</span> '
            + '<span style="font-family:YUGOTHB;font-size:100px;">一</span><br> '
            + '<span style="font-family:HGRKK;font-size:100px;">一</span> '
            + '<span style="font-family:KanjiStrokeOrders; font-size: 100px; ">一</span> '
            + '<tts service="sapi5js"></tts>';
        const pruned = pruneRedundantAnkiGlyphRepeats(html);
        expect(pruned.match(/一/g)?.length).toBe(1);
        expect(pruned).not.toContain('<tts');
    });

    it('leaves sentences and distinct words alone', () => {
        const html = '<span>読む</span><span>読み方</span><div>毎日本を読むのは楽しい。</div>';
        expect(pruneRedundantAnkiGlyphRepeats(html)).toBe(html);
    });

    it('does not collapse non-Japanese or long repeats', () => {
        const html = '<span>ABC</span><span>ABC</span><span>これはとても長い言葉です</span><span>これはとても長い言葉です</span>';
        expect(pruneRedundantAnkiGlyphRepeats(html)).toBe(html);
    });
});
