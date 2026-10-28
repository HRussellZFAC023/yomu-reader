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
