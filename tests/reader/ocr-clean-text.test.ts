import { describe, expect, it } from 'vitest';

import { cleanOcrText } from '../../src/reader/ocr/response-shared';

// Regression: a code screenshot with one embedded kanji had EVERY space in
// the line stripped ("radar updated :reply" → "radarupdated:reply"), because
// containing any Japanese used to switch the whole line to space-less
// joining. Whitespace is OCR noise only BETWEEN Japanese characters.
describe('cleanOcrText', () => {
    it('strips OCR segment spaces inside Japanese runs', () => {
        expect(cleanOcrText('日本 語 を 読む')).toBe('日本語を読む');
        expect(cleanOcrText('読む。 それ から')).toBe('読む。それから');
    });

    it('keeps Latin spacing in mixed lines with embedded Japanese', () => {
        expect(cleanOcrText('{:radar updated :reply string :options 菜单-or-nil}'))
            .toBe('{:radar updated :reply string :options 菜单-or-nil}');
        expect(cleanOcrText('Deterministic control flow; の 説明'))
            .toBe('Deterministic control flow; の説明');
    });

    it('keeps the natural space at Latin-Japanese boundaries', () => {
        expect(cleanOcrText('iPhone を 買う')).toBe('iPhone を買う');
    });

    it('collapses whitespace runs in Latin-only lines', () => {
        expect(cleanOcrText('state  machine \t grounding')).toBe('state machine grounding');
    });

    it('normalizes fullwidth ellipsis dots', () => {
        expect(cleanOcrText('それ ．．． から')).toBe('それ…から');
    });
});
