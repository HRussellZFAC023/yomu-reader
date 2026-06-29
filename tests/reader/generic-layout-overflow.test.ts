import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyTokensToScanTarget, collectFormControlTextTargetsIn, collectFragmentTextTargetsIn, collectTextTargetsIn, makeRoomForRubyInCroppedRows, type FragmentTextTarget, type ScanTextTarget } from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

describe('generic reader layout overflow guards', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
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
            <div role="dialog" aria-modal="true" class="account-chooser">
                <div id="account-row" role="link" tabindex="0">
                    <span>アカウントを選択</span>
                </div>
            </div>
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
        expect(row.querySelector('.jpdb-reader-text-mirror')).toBeNull();
        expect(row.textContent?.replace(/\s+/g, '').trim()).toBe('アカウントを選択');
        expect(row.querySelector('rt,.jpdb-reader-furi')).toBeNull();
        expect(Array.from(row.querySelectorAll<HTMLElement>('.jpdb-reader-word')).every(word => word.dataset.jpdbReaderPassive === 'true')).toBe(true);
    });

    it('suppresses ruby on compact stacked app helper text above action chips', () => {
        document.body.innerHTML = `
            <section id="assistant-panel" class="assistant-question-panel" role="region">
                <p id="helper" class="answer-notice">不正確な情報を表示することがあるため、生成された回答を再確認してください</p>
                <div class="suggestion-chips">
                    <button type="button">Why is this important?</button>
                    <button type="button">What does it mean?</button>
                </div>
            </section>
        `;
        const panel = document.querySelector<HTMLElement>('#assistant-panel')!;
        const helper = document.querySelector<HTMLElement>('#helper')!;
        mockRect(panel, { width: 390, height: 150 });
        mockRect(helper, { width: 340, height: 44 });
        const target = collectTargets().find(candidate => candidate.text.includes('不正確な情報'));

        expect(target).toBeTruthy();
        expect(target?.suppressRuby).toBe(true);
        expect(target?.passiveInteraction).toBe(true);

        applyTokensToScanTarget(target!, [
            token('不正確', target!.text.indexOf('不正確'), target!.text, 'ふせいかく'),
            token('情報', target!.text.indexOf('情報'), target!.text, 'じょうほう'),
        ], {
            ...DEFAULT_SETTINGS,
            showFurigana: true,
            furiganaMode: 'all',
        });

        expect(panel.dataset.jpdbReaderPassiveChrome).toBe('true');
        expect(helper.querySelectorAll('.jpdb-reader-word')).toHaveLength(2);
        expect(helper.querySelector('rt,.jpdb-reader-furi')).toBeNull();
    });

    it('suppresses ruby on mobile YouTube question helper rows without suppressing media titles', () => {
        vi.stubGlobal('location', {
            href: 'https://m.youtube.com/watch?v=clip',
            origin: 'https://m.youtube.com',
            hostname: 'm.youtube.com',
            pathname: '/watch',
        });
        document.body.innerHTML = `
            <div id="question-panel" class="ytm-ai-question-panel" role="region">
                <div id="youtube-helper" class="answer-notice">生成された回答を再確認してください</div>
                <button type="button">What does this mean?</button>
            </div>
            <ytm-watch-metadata>
                <h1 id="video-title">日本語のニュース</h1>
                <button type="button">共有</button>
            </ytm-watch-metadata>
        `;
        const panel = document.querySelector<HTMLElement>('#question-panel')!;
        const helper = document.querySelector<HTMLElement>('#youtube-helper')!;
        const metadata = document.querySelector<HTMLElement>('ytm-watch-metadata')!;
        const title = document.querySelector<HTMLElement>('#video-title')!;
        mockRect(panel, { width: 390, height: 120 });
        mockRect(helper, { width: 330, height: 38 });
        mockRect(metadata, { width: 390, height: 130 });
        mockRect(title, { width: 360, height: 36 });
        const targets = collectTargets();
        const helperTarget = targets.find(candidate => candidate.text.includes('生成された回答'));
        const titleTarget = targets.find(candidate => candidate.text.includes('日本語のニュース'));

        expect(helperTarget).toBeTruthy();
        expect(helperTarget?.suppressRuby).toBe(true);
        expect(titleTarget).toBeTruthy();
        expect(titleTarget?.suppressRuby).not.toBe(true);
    });

    it('reserves room for unclamped YouTube section headings with ruby mirrors', () => {
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
            pathname: '/',
        });
        document.body.innerHTML = `
            <ytd-rich-section-renderer>
                <h2 id="section-title">
                    <span id="heading-host" class="ytAttributedStringHost">その他のトピック</span>
                </h2>
            </ytd-rich-section-renderer>
        `;
        const heading = document.querySelector<HTMLElement>('#section-title')!;
        const host = document.querySelector<HTMLElement>('#heading-host')!;
        mockRect(heading, { width: 180, height: 20 });
        mockRect(host, { width: 180, height: 20 });
        const target: ScanTextTarget = {
            node: host.firstChild as Text,
            parent: host,
            text: 'その他のトピック',
            nonDestructive: true,
        };

        applyTokensToScanTarget(target, [
            token('他', target.text.indexOf('他'), target.text, 'ほか'),
        ], {
            ...DEFAULT_SETTINGS,
            showFurigana: true,
            furiganaMode: 'all',
        });

        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror).toBeTruthy();
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(word.querySelector('rt')).toBeTruthy();
        expect(heading.querySelector('.jpdb-reader-text-mirror')).toBe(mirror);
        mockOverflow(host, 20, 20);
        mockOverflow(heading, 58, 20);
        mockOverflow(mirror, 58, 58);

        expect(makeRoomForRubyInCroppedRows(document)).toBe(1);
        expect(heading.style.minHeight).toBe('58px');
    });

    it('marks compact media tiles as passive chrome so highlights cannot resize card layouts', () => {
        document.body.innerHTML = `
            <section class="book-carousel">
                <article class="book-card" style="width:156px">
                    <a id="book-link" class="book-link" href="/book/1" style="display:block;overflow:hidden;height:210px">
                        <img src="/cover.jpg" alt="">
                        <span id="book-title" class="book-title" style="display:block;overflow:hidden;line-height:18px;height:36px">日本語の漫画タイトル</span>
                    </a>
                </article>
            </section>
        `;
        const card = document.querySelector<HTMLElement>('.book-card')!;
        const link = document.querySelector<HTMLElement>('#book-link')!;
        const title = document.querySelector<HTMLElement>('#book-title')!;
        mockRect(card, { width: 156, height: 240 });
        mockRect(link, { width: 148, height: 210 });
        mockRect(title, { width: 140, height: 36 });

        const target = collectTargets().find(candidate => candidate.text.includes('日本語の漫画タイトル'));

        expect(target).toBeTruthy();
        expect(target?.suppressRuby).toBe(true);
        expect(target?.passiveInteraction).toBe(true);
        expect(link.dataset.jpdbReaderPassiveChrome).toBe('true');

        applyTokensToScanTarget(target!, [
            token('日本語', target!.text.indexOf('日本語'), target!.text, 'にほんご'),
            token('漫画', target!.text.indexOf('漫画'), target!.text, 'まんが'),
        ], {
            ...DEFAULT_SETTINGS,
            showFurigana: true,
            furiganaMode: 'all',
        });

        const words = Array.from(link.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        expect(words).toHaveLength(2);
        expect(words.every(word => word.dataset.jpdbReaderPassive === 'true')).toBe(true);
        expect(link.querySelector('.jpdb-reader-text-mirror')).toBeNull();
        expect(link.textContent?.replace(/\s+/g, '').trim()).toBe('日本語の漫画タイトル');
        expect(link.querySelector('rt,.jpdb-reader-furi')).toBeNull();
    });

    it('suppresses ruby on compact tabindex and onclick controls without named button roles', () => {
        document.body.innerHTML = `
            <section class="mobile-market">
                <div id="trade-chip" tabindex="0" onclick="void 0" style="display:flex;align-items:center;justify-content:center;width:112px;height:34px;max-height:34px;overflow:hidden;white-space:nowrap">
                    注文確認
                </div>
            </section>
        `;
        const chip = document.querySelector<HTMLElement>('#trade-chip')!;
        mockRect(chip, { width: 112, height: 34 });

        const target = collectTargets().find(candidate => candidate.text.includes('注文確認'));

        expect(target).toBeTruthy();
        expect(target?.suppressRuby).toBe(true);
        expect(target?.passiveInteraction).toBe(true);

        applyTokensToScanTarget(target!, [
            token('注文', target!.text.indexOf('注文'), target!.text, 'ちゅうもん'),
            token('確認', target!.text.indexOf('確認'), target!.text, 'かくにん'),
        ], {
            ...DEFAULT_SETTINGS,
            showFurigana: true,
            furiganaMode: 'all',
        });

        expect(chip.dataset.jpdbReaderPassiveChrome).toBe('true');
        expect(chip.querySelectorAll('.jpdb-reader-word')).toHaveLength(2);
        expect(chip.querySelector('.jpdb-reader-text-mirror')).toBeNull();
        expect(chip.textContent?.replace(/\s+/g, '').trim()).toBe('注文確認');
        expect(chip.querySelector('rt,.jpdb-reader-furi')).toBeNull();
        expect(Array.from(chip.querySelectorAll<HTMLElement>('.jpdb-reader-word')).every(word => word.dataset.jpdbReaderPassive === 'true')).toBe(true);
    });

    it('re-renders mutated compact controls inline without duplicate mirrors or ruby', () => {
        document.body.innerHTML = `
            <nav class="mobile-actions" role="navigation">
                <button id="action-chip" type="button" style="display:inline-flex;align-items:center;justify-content:center;width:118px;height:34px;max-height:34px;overflow:hidden;white-space:nowrap">
                    注文確認
                </button>
            </nav>
        `;
        const chip = document.querySelector<HTMLElement>('#action-chip')!;
        mockRect(chip, { width: 118, height: 34 });

        const initialTarget = collectTargets().find(candidate => candidate.text.includes('注文確認'));
        expect(initialTarget).toBeTruthy();
        applyTokensToScanTarget(initialTarget!, [
            token('注文', initialTarget!.text.indexOf('注文'), initialTarget!.text, 'ちゅうもん'),
            token('確認', initialTarget!.text.indexOf('確認'), initialTarget!.text, 'かくにん'),
        ], {
            ...DEFAULT_SETTINGS,
            showFurigana: true,
            furiganaMode: 'all',
        });

        chip.textContent = '取引詳細';
        const updatedTarget = collectTargets().find(candidate => candidate.text.includes('取引詳細'));
        expect(updatedTarget).toBeTruthy();
        expect(updatedTarget?.suppressRuby).toBe(true);
        expect(updatedTarget?.passiveInteraction).toBe(true);
        applyTokensToScanTarget(updatedTarget!, [
            token('取引', updatedTarget!.text.indexOf('取引'), updatedTarget!.text, 'とりひき'),
            token('詳細', updatedTarget!.text.indexOf('詳細'), updatedTarget!.text, 'しょうさい'),
        ], {
            ...DEFAULT_SETTINGS,
            showFurigana: true,
            furiganaMode: 'all',
        });

        expect(chip.dataset.jpdbReaderPassiveChrome).toBe('true');
        expect(chip.querySelectorAll('.jpdb-reader-word')).toHaveLength(2);
        expect(chip.querySelector('.jpdb-reader-text-mirror')).toBeNull();
        expect(chip.querySelector('rt,.jpdb-reader-furi')).toBeNull();
        expect(chip.textContent?.replace(/\s+/g, '').trim()).toBe('取引詳細');
        expect(Array.from(chip.querySelectorAll<HTMLElement>('.jpdb-reader-word')).every(word => word.dataset.jpdbReaderPassive === 'true')).toBe(true);
    });

    it('does not reserve ruby room on generic clipped boxes', () => {
        document.body.innerHTML = `
            <div id="clipped" style="overflow:hidden;height:22px;max-height:22px;line-height:22px">
                日本語の通知
            </div>
        `;
        const clipped = document.querySelector<HTMLElement>('#clipped')!;
        mockOverflow(clipped, 44, 22);
        const target = collectTargets().find(candidate => candidate.text.includes('日本語の通知'));

        expect(target).toBeTruthy();
        applyTokensToScanTarget(target!, [
            token('日本語', target!.text.indexOf('日本語'), target!.text, 'にほんご'),
        ], {
            ...DEFAULT_SETTINGS,
            showFurigana: true,
            furiganaMode: 'all',
        });

        expect(clipped.querySelector('rt,.jpdb-reader-furi')).not.toBeNull();
        expect(makeRoomForRubyInCroppedRows(document)).toBe(0);
        expect(clipped.style.height).toBe('22px');
        expect(clipped.style.maxHeight).toBe('22px');
        expect(clipped.dataset.yomuRubyRoom).toBeUndefined();
    });

    it('lets non-destructive mirrors inherit host color after late theme changes', () => {
        document.body.innerHTML = `
            <div id="message" class="message-content" style="color: rgb(128, 128, 128)">
                日本語の回答
            </div>
        `;
        const host = document.querySelector<HTMLElement>('#message')!;
        const target = collectTargets(host).find(candidate => candidate.text.includes('日本語の回答'));

        expect(target).toBeTruthy();
        applyTokensToScanTarget({ ...target!, nonDestructive: true }, [
            token('日本語', target!.text.indexOf('日本語'), target!.text, 'にほんご'),
        ], {
            ...DEFAULT_SETTINGS,
            showFurigana: true,
            furiganaMode: 'all',
        });

        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror).toBeTruthy();
        expect(mirror.style.color).not.toBe('rgb(128, 128, 128)');
        host.style.color = 'rgb(20, 20, 20)';
        expect(getComputedStyle(mirror).color).toBe('rgb(20, 20, 20)');
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
        const sendButton = document.querySelector<HTMLElement>('#composer-send')!;

        expect(targets.map(target => target.text)).toContain('普通の日本語本文です。');
        expect(targets.map(target => target.text)).not.toContain('メッセージを入力');
        expect(targets.map(target => target.text)).not.toContain('送信');
        expect(collectTextTargetsIn(document.body, 20, false, { includeReaderRoot: false }).map(target => target.text)).not.toContain('送信');
        expect(collectTargets(sendButton)).toEqual([]);
    });

    it('does not collect mirrored searchbox placeholder text from editable control surfaces', () => {
        document.body.innerHTML = `
            <main>
                <article><p>通常の検索説明文です。</p></article>
                <div role="searchbox" aria-placeholder="日本語を検索" contenteditable="true">
                    <span>日本語を検索</span>
                </div>
                <div role="textbox" data-placeholder="メッセージを入力" contenteditable="true">
                    <p>メッセージを入力</p>
                </div>
            </main>
        `;

        const targets = collectTargets();

        expect(targets.map(target => target.text)).toContain('通常の検索説明文です。');
        expect(targets.map(target => target.text)).not.toContain('日本語を検索');
        expect(targets.map(target => target.text)).not.toContain('メッセージを入力');
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

function mockOverflow(element: HTMLElement, scrollHeight: number, clientHeight: number): void {
    Object.defineProperty(element, 'scrollHeight', { value: scrollHeight, configurable: true });
    Object.defineProperty(element, 'clientHeight', { value: clientHeight, configurable: true });
}

function mockRect(element: HTMLElement, rect: Pick<DOMRect, 'width' | 'height'>): void {
    Object.defineProperty(element, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: rect.width,
            bottom: rect.height,
            width: rect.width,
            height: rect.height,
            toJSON: () => ({}),
        }) as DOMRect,
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
