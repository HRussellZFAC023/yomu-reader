import { afterEach, describe, expect, it } from 'vitest';

import { cardHighlightScopeAttributes, highlightCardTargetScopes, isCardHighlightWord, renderCardHighlightedTextHtml } from '../../src/reader/card-highlight';
import { applyNestedParsePlan, nestedTextParsePlan } from '../../src/reader/nested-text-parse';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/types';

describe('card highlight helpers', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders raw sentence highlights for the current card target', () => {
        const html = renderCardHighlightedTextHtml('昨日は日本語を読んだ。', card('日本語', 'にほんご'));

        expect(html).toContain('<mark class="jpdb-reader-example-target">日本語</mark>');
    });

    it('highlights parsed reader words inside card highlight scopes', () => {
        const current = card('日本語', 'にほんご', 10, 20);
        document.body.innerHTML = `<section ${cardHighlightScopeAttributes(current)}><p class="jpdb-reader-parseable">昨日は日本語を読んだ。</p></section>`;
        const root = document.body.querySelector<HTMLElement>('section')!;
        const plan = nestedTextParsePlan(root, 24)!;

        applyNestedParsePlan(plan, [[
            token('昨日', 0, card('昨日', 'きのう', 1, 1)),
            token('日本語', 3, card('日本語', 'にほんご', 10, 20)),
            token('読んだ', 7, card('読む', 'よむ', 2, 2)),
        ]], DEFAULT_SETTINGS);
        highlightCardTargetScopes(root);

        const words = Array.from(root.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        expect(words.map(word => [word.textContent, word.classList.contains('jpdb-reader-example-target')])).toEqual([
            ['昨日', false],
            ['日本語', true],
            ['読んだ', false],
        ]);
    });

    it('matches ruby-rendered reader words by surface text', () => {
        document.body.innerHTML = '<span class="jpdb-reader-word"><ruby>日本語<rt>にほんご</rt></ruby></span>';
        const word = document.body.querySelector<HTMLElement>('.jpdb-reader-word')!;

        expect(isCardHighlightWord(word, card('日本語', 'にほんご'))).toBe(true);
    });
});

function token(surface: string, start: number, tokenCard: JPDBCard): JPDBToken {
    return {
        card: tokenCard,
        start,
        end: start + surface.length,
        length: surface.length,
        rubies: [],
        pitchClass: '',
    };
}

function card(spelling: string, reading: string, vid = 100, sid = 200): JPDBCard {
    return {
        vid,
        sid,
        rid: 0,
        spelling,
        reading,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
    };
}
