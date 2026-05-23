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
