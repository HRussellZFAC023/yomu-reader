import { afterEach, describe, expect, it } from 'vitest';

import { applyTokensToScanTarget, collectFormControlTextTargetsIn, collectFragmentTextTargetsIn, collectTextTargetsIn, type FragmentTextTarget } from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

describe('generic reader layout overflow guards', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('keeps residual readable prose ruby-enabled for mobile overflow handling', () => {
        document.body.innerHTML = `
            <main id="content" role="main">
                <div id="mw-content-text" class="mw-parser-output">
                    <p>今日は日本語の文章を読みます。</p>
                </div>
            </main>
        `;
        const target = collectTargets().find(candidate => candidate.text.includes('今日は日本語'));

        expect(target).toBeTruthy();
        expect(target?.suppressRuby).not.toBe(true);
        expect(target?.passiveInteraction).not.toBe(true);

        applyTokensToScanTarget(target!, [token('日本語', target!.text.indexOf('日本語'), target!.text, 'にほんご')], {
            ...DEFAULT_SETTINGS,
            showFurigana: true,
            furiganaMode: 'all',
        });

        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(word.querySelector('rt')?.textContent).toBe('にほんご');
    });

    it('treats account chooser rows as compact passive chrome with ruby suppressed', () => {
        document.body.innerHTML = `
            <nav class="account-chooser" role="navigation">
                <a id="account-row" href="/accounts" style="display:inline-flex;align-items:center;height:36px;max-height:36px;overflow:hidden;white-space:nowrap">
                    <span>アカウントを選択</span>
                </a>
            </nav>
        `;
        const target = collectTargets().find(candidate => candidate.text.includes('アカウント'));

        expect(target).toBeTruthy();
        expect(target?.suppressRuby).toBe(true);
        expect(target?.passiveInteraction).toBe(true);

        applyTokensToScanTarget(target!, [
            token('アカウント', target!.text.indexOf('アカウント'), target!.text, 'アカウント'),
            token('選択', target!.text.indexOf('選択'), target!.text, 'せんたく'),
        ], {
            ...DEFAULT_SETTINGS,
            showFurigana: true,
            furiganaMode: 'all',
        });

        const row = document.querySelector<HTMLElement>('#account-row')!;
        expect(row.dataset.jpdbReaderPassiveChrome).toBe('true');
        expect(row.querySelectorAll('.jpdb-reader-word')).toHaveLength(2);
        expect(row.querySelector('rt,.jpdb-reader-furi')).toBeNull();
        expect(Array.from(row.querySelectorAll<HTMLElement>('.jpdb-reader-word')).every(word => word.dataset.jpdbReaderPassive === 'true')).toBe(true);
    });

    it('does not collect composer/editor placeholder text as page prose', () => {
        document.body.innerHTML = `
            <main>
                <article><p>普通の日本語本文です。</p></article>
                <div class="composer-shell">
                    <div class="ProseMirror prompt-textarea" contenteditable="true" data-placeholder="メッセージを入力">
                        <p>メッセージを入力</p>
                    </div>
                    <button id="composer-send" type="button" aria-label="送信">送信</button>
                </div>
            </main>
        `;
        const targets = collectTargets();

        expect(targets.map(target => target.text)).toContain('普通の日本語本文です。');
        expect(targets.map(target => target.text)).not.toContain('メッセージを入力');
        expect(targets.map(target => target.text)).not.toContain('送信');
        expect(collectTextTargetsIn(document.body, 20, false, { includeReaderRoot: false }).map(target => target.text)).not.toContain('送信');
    });

    it('keeps readable prose under composer-named containers annotatable', () => {
        document.body.innerHTML = `
            <section class="article-composer-notes">
                <p>作曲家についての日本語本文です。</p>
                <button type="button">閉じる</button>
            </section>
        `;

        const targets = collectTargets();

        expect(targets.map(target => target.text)).toContain('作曲家についての日本語本文です。');
        expect(collectTextTargetsIn(document.body, 20, false, { includeReaderRoot: false }).map(target => target.text)).toContain('作曲家についての日本語本文です。');
    });

    it('does not collect input or textarea placeholders as control mirrors', () => {
        document.body.innerHTML = `
            <form>
                <input type="search" placeholder="日本語を検索" value="">
                <textarea placeholder="質問する"></textarea>
                <select>
                    <option selected>日本語</option>
                </select>
            </form>
        `;

        const targets = collectFormControlTextTargetsIn(document.body, 20, false);

        expect(targets.map(target => target.text)).toEqual(['日本語']);
    });

});

function collectTargets(root: Node = document.body): FragmentTextTarget[] {
    return collectFragmentTextTargetsIn(root, 20, false, '', {
        allowUiText: true,
        includeUiChrome: true,
        includeTabChrome: true,
        includePassiveInteractions: true,
        heading: true,
        minLength: 1,
    });
}

function token(surface: string, start: number, sentence: string, reading: string): JPDBToken {
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
        vid: spelling.charCodeAt(0),
        sid: spelling.charCodeAt(0),
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
