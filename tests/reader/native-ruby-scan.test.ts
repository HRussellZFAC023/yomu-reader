import { afterEach, describe, expect, it } from 'vitest';

import { applyTokensToScanTarget, collectFragmentTextTargetsIn, readerWordSurfaceText } from '../../src/reader/dom/index';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

describe('native ruby scan rendering', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('keeps interleaved native ruby annotations inside the rendered word', () => {
        document.body.innerHTML = '<p><ruby>最<rt>さい</rt>初<rt>しょ</rt></ruby></p>';
        const [target] = collectFragmentTextTargetsIn(document.body, 10, false, '', { allowUiText: true, minLength: 1 });

        expect(target.text).toBe('最初');

        applyTokensToScanTarget(target, [token('最初', 0, target.text)], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(readerWordSurfaceText(word)).toBe('最初');
        expect(Array.from(word.querySelectorAll('rt')).map(rt => rt.textContent)).toEqual(['さい', 'しょ']);
        expect(word.querySelector('.jpdb-reader-furi')).toBeNull();
        expect(Array.from(document.querySelectorAll('rt')).every(rt => rt.closest('.jpdb-reader-word') === word)).toBe(true);
    });

    it('keeps JPDB native ruby compounds as one rendered word', () => {
        document.body.innerHTML = '<div><ruby class="v">発<rt>はっ</rt>行<rt>こう</rt></ruby></div>';
        const [target] = collectFragmentTextTargetsIn(document.body, 10, false, '', { allowUiText: true, minLength: 1 });

        expect(target.text).toBe('発行');

        applyTokensToScanTarget(target, [token('発行', 0, target.text, 'はっこう')], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const words = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        expect(words).toHaveLength(1);
        expect(readerWordSurfaceText(words[0]!)).toBe('発行');
        expect(Array.from(words[0]!.querySelectorAll('rt')).map(rt => rt.textContent)).toEqual(['はっ', 'こう']);
        expect(words[0]!.querySelector('.jpdb-reader-furi')).toBeNull();
    });

    it('keeps highlighted native ruby base and annotation together', () => {
        document.body.innerHTML = '<p><ruby>最<rt>さい</rt></ruby><span class="highlight"><ruby>初<rt>しょ</rt></ruby></span></p>';
        const [target] = collectFragmentTextTargetsIn(document.body, 10, false, '', { allowUiText: true, minLength: 1 });

        expect(target.text).toBe('最初');

        applyTokensToScanTarget(target, [token('最初', 0, target.text)], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const highlighted = word.querySelector<HTMLElement>('.highlight')!;
        expect(readerWordSurfaceText(word)).toBe('最初');
        expect(highlighted.querySelector('rt')?.textContent).toBe('しょ');
        expect(Array.from(document.querySelectorAll('.highlight rt')).filter(rt => !rt.closest('.jpdb-reader-word'))).toHaveLength(0);
        expect(Array.from(document.querySelectorAll('rt')).every(rt => rt.closest('.jpdb-reader-word') === word)).toBe(true);
    });

    it('does not move annotations into words for partial native ruby matches', () => {
        document.body.innerHTML = '<p><ruby>日本<rt>にほん</rt>語<rt>ご</rt></ruby></p>';
        const [target] = collectFragmentTextTargetsIn(document.body, 10, false, '', { allowUiText: true, minLength: 1 });

        expect(target.text).toBe('日本語');

        applyTokensToScanTarget(target, [token('本語', 1, target.text)], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const words = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        expect(words.map(word => readerWordSurfaceText(word))).toEqual(['本', '語']);
        expect(words.every(word => word.querySelector('rt') === null)).toBe(true);
        expect(Array.from(document.querySelectorAll('rt')).every(rt => rt.parentElement?.tagName === 'RUBY')).toBe(true);
    });
});

function token(surface: string, start: number, sentence: string, reading = 'さいしょ'): JPDBToken {
    return {
        card: card(surface, reading),
        start,
        end: start + surface.length,
        length: surface.length,
        rubies: [{ text: reading, start, end: start + surface.length, length: surface.length }],
        pitchClass: 'heiban',
        sentence,
    };
}

function card(spelling: string, reading: string): JPDBCard {
    return {
        vid: 1293990,
        sid: 1293990,
        rid: 0,
        spelling,
        reading,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'fallback',
    };
}
