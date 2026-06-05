import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    applyTokensToScanTarget,
    collectFragmentTextTargetsIn,
    nearestReadableSentenceForElement,
    sentenceAroundRange,
} from '../../src/reader/dom';
import { ReaderApp } from '../../src/reader/main';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/types';

interface PointerTextCardInternals {
    showCard: (card: JPDBCard, sentence: string | undefined, anchor: HTMLElement | undefined, options: unknown) => Promise<void>;
    renderedWordSentence(word: HTMLElement): string | undefined;
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

function token(surface: string, start: number, sentence: string): JPDBToken {
    return {
        card: card(surface),
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
