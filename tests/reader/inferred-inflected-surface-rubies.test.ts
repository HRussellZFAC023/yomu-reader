import { describe, expect, it } from 'vitest';
import { inferredInflectedSurfaceRubies } from '../../src/reader/dom/index';

describe('inferredInflectedSurfaceRubies', () => {
    it('covers a kanji-only spelling inflected with a kana suffix (接続して)', () => {
        expect(inferredInflectedSurfaceRubies('接続して', '接続', 'せつぞく')).toEqual([
            { text: 'せつぞく', start: 0, end: 2, length: 2 },
        ]);
    });

    it('covers a kanji-only stem inflected with a single kana (練習し)', () => {
        expect(inferredInflectedSurfaceRubies('練習し', '練習', 'れんしゅう')).toEqual([
            { text: 'れんしゅう', start: 0, end: 2, length: 2 },
        ]);
    });

    it('covers a kanji-only na-adjective (理想的な)', () => {
        expect(inferredInflectedSurfaceRubies('理想的な', '理想的', 'りそうてき')).toEqual([
            { text: 'りそうてき', start: 0, end: 3, length: 3 },
        ]);
    });

    it('covers a suru-verb kanji spelling (追加する)', () => {
        expect(inferredInflectedSurfaceRubies('追加する', '追加', 'ついか')).toEqual([
            { text: 'ついか', start: 0, end: 2, length: 2 },
        ]);
    });

    it('covers a masu-form kanji spelling (開始します)', () => {
        expect(inferredInflectedSurfaceRubies('開始します', '開始', 'かいし')).toEqual([
            { text: 'かいし', start: 0, end: 2, length: 2 },
        ]);
    });

    it('declines when the surface remainder after the spelling contains kanji', () => {
        // 接続先 is a different compound, not an inflection of 接続.
        expect(inferredInflectedSurfaceRubies('接続先', '接続', 'せつぞく')).toEqual([]);
    });

    it('still aligns spellings that carry trailing kana okurigana (見る → 見)', () => {
        expect(inferredInflectedSurfaceRubies('見', '見る', 'みる')).toEqual([
            { text: 'み', start: 0, end: 1, length: 1 },
        ]);
    });

    it('still aligns an inflected okurigana surface (話した for 話す)', () => {
        expect(inferredInflectedSurfaceRubies('話した', '話す', 'はなす')).toEqual([
            { text: 'はな', start: 0, end: 1, length: 1 },
        ]);
    });
});
