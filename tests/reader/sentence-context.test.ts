import '../../src/reader/companions/register-build-companions';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    applyTokensToScanTarget,
    applyTokensToTextNode,
    collectFragmentTextTargetsIn,
    collectTextTargetsIn,
    nearestReadableSentenceForElement,
    renderTokensToHtml,
    sentenceAroundRange,
    setInnerHtml,
} from '../../src/reader/dom/index';
import { readRenderedWordPrivateState } from '../../src/reader/dom/rendered-word-private-state';
import { ReaderApp } from '../../src/reader/app/main';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';
import { readerWordSurfaceText } from "../../src/reader/dom/reader-word";
import { assignSentenceInfo } from "../../src/reader/jpdb/jpdb-parser-sentences";
import { pointerTextLookupFromRenderedWord, pointerTextLookupFromRenderedWordStart } from "../../src/reader/lookup/pointer-text-lookup";
import { unconfirmedRenderedWordSpan } from "../../src/reader/main/rendered-word-lookup";
import { exampleSentenceLookupTokens } from "../../src/reader/lookup/example-sentence-tokens";

interface PointerTextCardInternals {
    showCard: (card: JPDBCard, sentence: string | undefined, anchor: HTMLElement | undefined, options: unknown) => Promise<void>;
    renderedWordSentence(word: HTMLElement): string | undefined;
    renderedWordDisplayContext(
        word: HTMLElement,
        options: { trigger?: 'click' | 'hover' },
        insideReaderPopup: boolean,
    ): { sentence?: string; trigger: 'modal' | 'hover' };
    showPointerTextCard(
        card: JPDBCard,
        sentence: string,
        candidate: { text: string; offset: number; start: number; end: number; anchor: HTMLElement },
        range: { start: number; end: number },
        trigger: 'modal' | 'hover',
        options: Record<string, unknown>,
    ): Promise<void>;
}

describe('reader sentence context', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('extracts the sentence around the reviewed occurrence in long page text', () => {
        const text = [
            'ウィキペディア フリー百科事典 QWikipedia内を検索 日本語 目次 非表示 閲覧 編集 履歴を表示 ツール',
            'この項目では、日本国内などで使用されている言語について説明しています。',
            '日本語の言語教育のための教科書については「にっぽんご」をご覧ください。',
        ].join(' ');
        const start = text.indexOf('日本語の言語教育');

        expect(sentenceAroundRange(text, start, start + '日本語'.length))
            .toBe('日本語の言語教育のための教科書については「にっぽんご」をご覧ください。');
    });

    it('stores a sentence-sized lookup context when applying scan tokens', () => {
        document.body.innerHTML = '<article><p>今日は静かな喫茶店で日本語を読みました。明日は友だちと英語を話します。</p></article>';
        const target = collectFragmentTextTargetsIn(document.querySelector('article')!, 10, false)[0]!;
        const start = target.text.indexOf('日本語');

        applyTokensToScanTarget(target, [token('日本語', start, target.text)], DEFAULT_SETTINGS);

        expect(document.querySelector<HTMLElement>('.jpdb-reader-word')?.dataset.sentence)
            .toBe('今日は静かな喫茶店で日本語を読みました。');
        expect(document.querySelector<HTMLElement>('.jpdb-reader-word')?.getAttribute('tabindex')).toBe('-1');
        expect(document.querySelector<HTMLElement>('.jpdb-reader-word')?.hasAttribute('role')).toBe(false);
    });

    it('marks the only mineable unknown token in a sentence as i+1', () => {
        const sentence = '今日本読む';
        const tokens = [
            token('今日', 0, sentence, { vid: 10, sid: 1, cardState: ['known'] }),
            token('本', 2, sentence, { vid: 11, sid: 1, cardState: ['new'] }),
            token('読む', 3, sentence, { vid: 12, sid: 1, cardState: ['known'] }),
        ];

        setInnerHtml(document.body, renderTokensToHtml(sentence, tokens, DEFAULT_SETTINGS));

        const insight = document.querySelector<HTMLElement>('.jpdb-reader-i-plus-one')!;
        expect(insight?.textContent).toBe('本');
        expect(insight?.dataset.miningInsight).toBe('i-plus-one');
    });

    it('does not mark i+1 when a sentence has multiple unknown cards', () => {
        const sentence = '今日本読む';
        const tokens = [
            token('今日', 0, sentence, { vid: 10, sid: 1, cardState: ['known'] }),
            token('本', 2, sentence, { vid: 11, sid: 1, cardState: ['new'] }),
            token('読む', 3, sentence, { vid: 12, sid: 1, cardState: ['not-in-deck'] }),
        ];

        setInnerHtml(document.body, renderTokensToHtml(sentence, tokens, DEFAULT_SETTINGS));

        expect(document.querySelector('.jpdb-reader-i-plus-one')).toBeNull();
    });

    it('marks i+1 during live text-node rendering', () => {
        const sentence = '今日本読む';
        document.body.innerHTML = `<p>${sentence}</p>`;
        const [target] = collectTextTargetsIn(document.querySelector('p')!, 6, false);
        const tokens = [
            token('今日', 0, sentence, { vid: 10, sid: 1, cardState: ['known'] }),
            token('本', 2, sentence, { vid: 11, sid: 1, cardState: ['new'] }),
            token('読む', 3, sentence, { vid: 12, sid: 1, cardState: ['known'] }),
        ];

        applyTokensToTextNode(target, tokens, DEFAULT_SETTINGS);

        expect(document.querySelector<HTMLElement>('.jpdb-reader-i-plus-one')?.textContent).toBe('本');
    });

    it('adds provider-neutral card metadata while preserving legacy ids', () => {
        const html = renderTokensToHtml('読む', [
            token('読む', 0, '読む', {
                source: 'jiten',
                vid: 999,
                sid: 9,
                jitenWordId: 42,
                jitenReadingIndex: 2,
            }),
        ], DEFAULT_SETTINGS);

        setInnerHtml(document.body, html);
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(readRenderedWordPrivateState(word)).toMatchObject({
            vid: '999',
            sid: '9',
            cardSource: 'jiten',
            cardId: '42',
            readingIndex: '2',
        });
    });

    it('uses the clicked rendered word occurrence when a surface appears more than once', () => {
        document.body.innerHTML = '<p>日本語の資料です。今日は静かな喫茶店で<span class="jpdb-reader-word" data-sentence="日本語">日本語</span>を読みました。</p>';

        expect(nearestReadableSentenceForElement(document.querySelector<HTMLElement>('.jpdb-reader-word')!, '日本語'))
            .toBe('今日は静かな喫茶店で日本語を読みました。');
    });

    it('replaces broad pointer-text context with the parsed token sentence', async () => {
        const app = new ReaderApp();
        const text = [
            'ウィキペディア フリー百科事典 QWikipedia内を検索 日本語 目次 非表示 閲覧 編集 履歴を表示 ツール',
            'この項目では、日本国内などで使用されている言語について説明しています。',
            '日本語の言語教育のための教科書については「にっぽんご」をご覧ください。',
        ].join(' ');
        const start = text.indexOf('日本語の言語教育');
        const internals = app as unknown as PointerTextCardInternals;
        internals.showCard = vi.fn(async () => undefined);

        try {
            await internals.showPointerTextCard(card('日本語'), text, {
                text,
                offset: start,
                start: 0,
                end: text.length,
                anchor: document.body,
            }, { start, end: start + '日本語'.length }, 'modal', {});

            expect(internals.showCard).toHaveBeenCalledWith(
                expect.anything(),
                '日本語の言語教育のための教科書については「にっぽんご」をご覧ください。',
                document.body,
                expect.objectContaining({ trigger: 'modal' }),
            );
        } finally {
            app.destroy();
        }
    });

    it('keeps noisy YouTube chrome out of rendered word translation context', () => {
        const app = new ReaderApp();
        const title = '【ASMR】評価が悪い美容室のヘアカット✂💈【ロールプレイ】';
        const internals = app as unknown as PointerTextCardInternals;
        document.body.innerHTML = `
            <section>
                <span>・動画全編を視聴</span>
                <span>36:35</span><span>33:17</span><span>9:02</span><span>3:02</span>
                <span class="jpdb-reader-word" data-sentence="${title}" data-expression="美容">美容</span>
                <span>${title}</span>
            </section>
        `;

        try {
            expect(internals.renderedWordSentence(document.querySelector<HTMLElement>('.jpdb-reader-word')!))
                .toBe(title);
        } finally {
            app.destroy();
        }
    });

    it('uses the token sentence for hover context without running rich sentence extraction', () => {
        const app = new ReaderApp();
        const internals = app as unknown as PointerTextCardInternals;
        document.body.innerHTML = `
            <section>
                <p>前置きの長い説明文です。<span class="jpdb-reader-word" data-sentence="今日は日本語を読む。" data-expression="日本語">日本語</span>の練習をします。</p>
            </section>
        `;
        internals.renderedWordSentence = vi.fn(() => {
            throw new Error('hover should not run rich sentence extraction');
        });

        try {
            const context = internals.renderedWordDisplayContext(
                document.querySelector<HTMLElement>('.jpdb-reader-word')!,
                { trigger: 'hover' },
                false,
            );

            expect(context).toEqual(expect.objectContaining({
                trigger: 'hover',
                sentence: '今日は日本語を読む。',
            }));
            expect(internals.renderedWordSentence).not.toHaveBeenCalled();
        } finally {
            app.destroy();
        }
    });

    it('keeps the subtitle track-status line out of subtitle sentence context', () => {
        const app = new ReaderApp();
        const cue = '無駄な動きは一切なく、それぞれの腕は';
        const internals = app as unknown as PointerTextCardInternals;
        // The cue ends without sentence punctuation, so without the
        // surface-ignore stamp the ancestor walk reaches the player root and
        // appends the chrome status ("2 subtitle tracks detected") to the
        // sentence sent to translation (user-reported).
        document.body.innerHTML = `
            <div class="jpdb-subtitle-player" data-jpdb-reader-root="true">
                <div class="jpdb-subtitle-text">
                    <div class="jpdb-subtitle-primary"><span class="jpdb-reader-word" data-sentence="${cue}" data-expression="無駄">無駄</span>な動きは一切なく、それぞれの腕は</div>
                    <button class="jpdb-subtitle-secondary" type="button">It moves with no wasted motion.</button>
                </div>
                <div class="jpdb-subtitle-status" aria-live="polite" data-jpdb-reader-surface-ignore="true">2 subtitle tracks detected</div>
            </div>
        `;

        try {
            expect(internals.renderedWordSentence(document.querySelector<HTMLElement>('.jpdb-reader-word')!))
                .toBe(cue);
        } finally {
            app.destroy();
        }
    });

    it('uses the parsed Immersion Kit example sentence instead of popup chrome', () => {
        const app = new ReaderApp();
        const internals = app as unknown as PointerTextCardInternals;
        document.body.innerHTML = `
            <section class="jpdb-reader-popover" data-jpdb-reader-root="true">
                <details data-immersion-kit open>
                    <summary>Immersion Kit Princess Mononoke 2/6 ‹ ›</summary>
                    <div class="jpdb-reader-example-card" data-immersion-sentence="うでが痛むんで？">
                        <button>JPDB</button>
                        <button>Jisho</button>
                        <div class="jpdb-reader-example-sentence jpdb-reader-parseable">
                            う<span class="jpdb-reader-word" data-expression="で">で</span>が痛むんで？
                        </div>
                    </div>
                </details>
            </section>
        `;

        try {
            expect(internals.renderedWordSentence(document.querySelector<HTMLElement>('.jpdb-reader-word')!))
                .toBe('うでが痛むんで？');
        } finally {
            app.destroy();
        }
    });

    it('uses the clicked OCR line text instead of the whole image OCR sentence', () => {
        const app = new ReaderApp();
        const internals = app as unknown as PointerTextCardInternals;
        document.body.innerHTML = `
            <div class="jpdb-ocr-line" data-ocr-text="読" data-sentence="読む 読 読">
                <span class="jpdb-reader-word" data-expression="読">読</span>
            </div>
        `;

        try {
            expect(internals.renderedWordSentence(document.querySelector<HTMLElement>('.jpdb-reader-word')!))
                .toBe('読');
        } finally {
            app.destroy();
        }
    });
});

function token(surface: string, start: number, sentence: string, cardOverrides: Partial<JPDBCard> = {}): JPDBToken {
    return {
        card: { ...card(surface), ...cardOverrides },
        start,
        end: start + surface.length,
        length: surface.length,
        rubies: [],
        pitchClass: '',
        sentence,
    };
}

function card(spelling: string): JPDBCard {
    return {
        vid: 1,
        sid: 2,
        rid: 3,
        spelling,
        reading: spelling,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'fallback',
    };
}

describe('rendered word position inside its own sentence', () => {
    // A painted word records its token range from the start of the text the parser
    // read (a whole paragraph), while data-sentence holds only its own sentence.
    // The two agree in a paragraph's first sentence and nowhere after it, which is
    // how hovering 練習 in the lookup-perf-gate page never opened a popup while
    // 図書館 and 漢字 in the sentence before it did. Paint records where the
    // sentence starts (data-sentence-start) so a Lookup subtracts it exactly.

    afterEach(() => document.body.replaceChildren());

    const GATE_PARAGRAPH = '図書館で漢字を調べています。練習をします。図書館は静かです。';
    const GATE_WORDS = ['図書館', '漢字', '調べています', '練習', 'します', '図書館', '静か'];

    it.each([
        ['the HTML paint', paintParagraph],
        ['the page scan paint', scanParagraph],
    ])('starts a pointer lookup on every word of a multi-sentence paragraph through %s', (_path, paint) => {
        const words = paint(GATE_PARAGRAPH, GATE_WORDS);

        expect(words.map(word => word.dataset.tokenStart)).toEqual(['0', '4', '7', '14', '17', '21', '25']);
        expect(words.map(word => word.dataset.sentenceStart)).toEqual([undefined, undefined, undefined, '14', '14', '21', '21']);
        for (const word of words) {
            const surface = readerWordSurfaceText(word);
            const lookup = pointerTextLookupFromRenderedWordStart(word);
            expect(lookup, surface).not.toBeNull();
            expect(lookup!.text).toBe(word.dataset.sentence);
            expect(lookup!.text.slice(lookup!.offset, lookup!.offset + surface.length)).toBe(surface);
        }
    });

    // The page scan paints a word inside <b> into the <b>, alone. Its surface
    // 本 also opens the sentence inside 本屋, so any lookup that searched for
    // the surface opened 本屋 on a click, tap or hover of the bold 本.
    it('places a word alone in an inline element at its own offset, not at an earlier match of its surface', () => {
        document.body.innerHTML = '<p>はい。本屋と<b>本</b>を読む。</p>';
        const words = scanTarget(['はい', '本屋', 'と', '本', 'を', '読む']);
        const book = words.find(word => word.parentElement?.tagName === 'B')!;
        book.getBoundingClientRect = () => new DOMRect(0, 0, 16, 16);

        expect(readerWordSurfaceText(book)).toBe('本');
        // Tap or keyboard activation without a point, then a click or hover at the glyph.
        expect(pointerTextLookupFromRenderedWordStart(book)).toMatchObject({ text: '本屋と本を読む。', offset: 3 });
        expect(pointerTextLookupFromRenderedWord(book, 8, 8)).toMatchObject({ text: '本屋と本を読む。', offset: 3 });
        expect(unconfirmedRenderedWordSpan(book, undefined)).toEqual({ sentence: '本屋と本を読む。', start: 3, end: 4 });
        expect(book.dataset).toMatchObject({ tokenStart: '6', sentence: '本屋と本を読む。', sentenceStart: '3' });
    });

    it('re-resolves an unconfirmed word at its own position, not at its paragraph offset', () => {
        // Painted at paragraph offset 7, which inside its sentence is 調べ.
        const kanji = paintParagraph('はい。図書館で漢字を調べています。', ['図書館', '漢字', '調べています'])[1];

        const span = unconfirmedRenderedWordSpan(kanji, undefined);

        expect(span).toEqual({ sentence: '図書館で漢字を調べています。', start: 4, end: 6 });
    });

    it('keeps each occurrence of a repeated surface at its own place in the sentence', () => {
        const [, first, , second] = paintParagraph('本だ。本と本を読む。', ['本', '本', 'と', '本', '読む']);

        expect(unconfirmedRenderedWordSpan(first, undefined)).toMatchObject({ start: 0, end: 1 });
        expect(unconfirmedRenderedWordSpan(second, undefined)).toMatchObject({ start: 2, end: 3 });
    });

    it('declines a word whose sentence no longer holds it at its recorded place', () => {
        const [, practice] = paintParagraph('はい。練習をします。', ['はい', '練習']);
        practice.dataset.sentence = '図書館で練習をします。';

        expect(pointerTextLookupFromRenderedWordStart(practice)).toBeNull();
        expect(unconfirmedRenderedWordSpan(practice, undefined)).toBeNull();
    });


    /** Paints `surfaces` in order through the production HTML path, with the
     * parser's own sentence assignment, and returns the painted words. */
    function paintParagraph(paragraph: string, surfaces: string[]): HTMLElement[] {
        const tokens = paragraphTokens(paragraph, surfaces);
        const host = document.createElement('p');
        setInnerHtml(host, renderTokensToHtml(paragraph, tokens, DEFAULT_SETTINGS));
        document.body.replaceChildren(host);
        return [...host.querySelectorAll<HTMLElement>('.jpdb-reader-word')];
    }

    /** Paints `surfaces` through the page scan, as the reader paints a page. */
    function scanParagraph(paragraph: string, surfaces: string[]): HTMLElement[] {
        const host = document.createElement('p');
        host.textContent = paragraph;
        document.body.replaceChildren(host);
        return scanTarget(surfaces);
    }

    function scanTarget(surfaces: string[]): HTMLElement[] {
        const [target] = collectFragmentTextTargetsIn(document.body, 10, false, '', { allowUiText: true, minLength: 1 });
        applyTokensToScanTarget(target, paragraphTokens(target.text, surfaces), DEFAULT_SETTINGS);
        return [...document.querySelectorAll<HTMLElement>('.jpdb-reader-word')];
    }

    function paragraphTokens(paragraph: string, surfaces: string[]): JPDBToken[] {
        let cursor = 0;
        const tokens = surfaces.map((surface, index): JPDBToken => {
            const start = paragraph.indexOf(surface, cursor);
            cursor = start + surface.length;
            return { card: fallbackCard(surface, index), start, end: cursor, length: surface.length, rubies: [], pitchClass: 'unknown' };
        });
        assignSentenceInfo([paragraph], [tokens]);
        return tokens;
    }

    function fallbackCard(spelling: string, index: number): JPDBCard {
        return {
            vid: -(index + 1),
            sid: -(index + 1),
            rid: 0,
            source: 'fallback',
            spelling,
            reading: '',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
        };
    }
});

describe('exampleSentenceLookupTokens', () => {
    it('removes short particle tokens from example sentence lookup targets', () => {
        const sentence = 'うでが痛むんで？';
        const target = testCard({ vid: 10, sid: 10, spelling: '痛む', reading: 'いたむ' });
        const tokens = [
            testToken(sentence, testCard({ vid: 1, sid: 1, spelling: 'で', partOfSpeech: ['Particle', 'Conjunction'] }), 6, 7),
            testToken(sentence, target, 3, 5),
        ];

        expect(exampleSentenceLookupTokens(tokens, target).map(token => token.card.spelling)).toEqual(['痛む']);
    });

    it('keeps a short particle when it is the target card', () => {
        const sentence = 'ここで読む。';
        const particle = testCard({ vid: 2, sid: 2, spelling: 'で', partOfSpeech: ['Particle'] });

        expect(exampleSentenceLookupTokens([testToken(sentence, particle, 2, 3)], particle)).toHaveLength(1);
    });


    function testCard(overrides: Partial<JPDBCard>): JPDBCard {
        return {
            vid: overrides.vid ?? 1,
            sid: overrides.sid ?? 1,
            rid: overrides.rid ?? 0,
            spelling: overrides.spelling ?? '読む',
            reading: overrides.reading ?? '',
            frequencyRank: null,
            partOfSpeech: overrides.partOfSpeech ?? [],
            meanings: [],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'jpdb',
        };
    }

    function testToken(sentence: string, card: JPDBCard, start: number, end: number): JPDBToken {
        return {
            card,
            start,
            end,
            length: end - start,
            rubies: [],
            pitchClass: '',
            sentence,
        };
    }
});
