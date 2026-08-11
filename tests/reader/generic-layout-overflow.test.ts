import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyTokensToScanTarget, collectFormControlTextTargetsIn, collectFragmentTextTargetsIn, collectTextTargetsIn, makeRoomForRubyInCroppedRows, type FragmentTextTarget, type ScanTextTarget } from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';
import {
    readerTextMirrorForSource,
    readerWordsForSource,
    readerWordsWithinSource,
} from './helpers/text-mirror';

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

    it('treats account chooser rows as compact passive chrome with detached readings', () => {
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
        expect(row.dataset.jpdbReaderPassiveAtomic).toBe('true');
        expect(row.querySelectorAll('.jpdb-reader-word')).toHaveLength(2);
        expect(row.querySelector('.jpdb-reader-text-mirror')).toBeNull();
        expect(Array.from(row.querySelectorAll<HTMLElement>('.jpdb-reader-word')).map(word => word.dataset.expression).join('')).toBe('アカウント選択');
        expect(row.querySelector('rt')).toBeNull();
        expect(row.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('せんたく');
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
        expect(helper.querySelector('rt')).toBeNull();
        expect(helper.querySelector('.jpdb-reader-detached-furi')).not.toBeNull();
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

    it('keeps unclamped YouTube section headings source-sized with detached readings', () => {
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
        expect(word.querySelector('rt, .jpdb-reader-detached-furi')).toBeTruthy();
        expect(heading.querySelector('.jpdb-reader-text-mirror')).toBe(mirror);
        mockOverflow(host, 20, 20);
        mockOverflow(heading, 58, 20);
        mockOverflow(mirror, 58, 58);

        expect(makeRoomForRubyInCroppedRows(document)).toBe(0);
        expect(heading.style.minHeight).toBe('');
    });

    it('keeps compact media tiles passive while rendering their furigana', () => {
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
        expect(target?.suppressRuby).toBeFalsy();
        expect(target?.passiveInteraction).toBe(true);
        expect(link.dataset.jpdbReaderPassiveChrome).toBeUndefined();

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
        // Paint-invariant design (third live gate): the clamped 36px title row
        // renders IN PLACE — no mirror, host text painting — with detached
        // readings that cannot grow the clamped title row.
        expect(link.querySelector('.jpdb-reader-text-mirror')).toBeNull();
        expect(link.querySelector('rt')).toBeNull();
        expect(link.querySelector('.jpdb-reader-detached-furi')).not.toBeNull();
        expect(link.querySelector('[data-yomu-ruby-room]')).toBeNull();
    });

    it('detaches readings on compact tabindex and onclick controls without named button roles', () => {
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
        expect(Array.from(chip.querySelectorAll<HTMLElement>('.jpdb-reader-word')).map(word => word.dataset.expression).join('')).toBe('注文確認');
        expect(chip.querySelector('rt')).toBeNull();
        expect(chip.querySelectorAll('.jpdb-reader-detached-furi')).toHaveLength(2);
        expect(Array.from(chip.querySelectorAll<HTMLElement>('.jpdb-reader-word')).every(word => word.dataset.jpdbReaderPassive === 'true')).toBe(true);
    });

    it('re-renders mutated compact controls inline without duplicate mirrors or in-flow ruby', () => {
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
        expect(chip.querySelector('rt')).toBeNull();
        expect(chip.querySelectorAll('.jpdb-reader-detached-furi')).toHaveLength(2);
        expect(Array.from(chip.querySelectorAll<HTMLElement>('.jpdb-reader-word')).map(word => word.dataset.expression).join('')).toBe('取引詳細');
        expect(Array.from(chip.querySelectorAll<HTMLElement>('.jpdb-reader-word')).every(word => word.dataset.jpdbReaderPassive === 'true')).toBe(true);
    });

    it('grows a generic compact clipped row that crops its ruby (metadata/notification class)', () => {
        // A tight single-line clipped chrome row (channel byline, view-count,
        // notification) that carries a furigana word crops the reading; the
        // generic compact-row detector grows it to fit WITHOUT any per-site
        // selector. This is the same bug class as the reddit/YouTube chrome
        // furigana wrap: the row must grow, not clip the reading.
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
        expect(makeRoomForRubyInCroppedRows(document)).toBe(1);
        expect(clipped.style.height).toBe('44px');
        expect(clipped.style.maxHeight).toBe('44px');
        expect(clipped.dataset.yomuRubyRoom).toBe('true');
    });

    it('does NOT reserve ruby room on clipped PROSE paragraphs (articles keep their flow)', () => {
        // Guards the prose exemption of the generic compact-row detector: a
        // clipped paragraph inside <article>/<main> must never be grown, so body
        // text layout is untouched even when a reading nominally overflows.
        document.body.innerHTML = `
            <main>
                <article>
                    <p id="para" style="overflow:hidden;height:22px;max-height:22px;line-height:22px">日本語の本文</p>
                </article>
            </main>
        `;
        const para = document.querySelector<HTMLElement>('#para')!;
        mockOverflow(para, 44, 22);
        const target = collectTargets().find(candidate => candidate.text.includes('日本語の本文'));

        expect(target).toBeTruthy();
        applyTokensToScanTarget(target!, [
            token('日本語', target!.text.indexOf('日本語'), target!.text, 'にほんご'),
        ], {
            ...DEFAULT_SETTINGS,
            showFurigana: true,
            furiganaMode: 'all',
        });

        expect(makeRoomForRubyInCroppedRows(document)).toBe(0);
        expect(para.style.height).toBe('22px');
        expect(para.style.maxHeight).toBe('22px');
        expect(para.dataset.yomuRubyRoom).toBeUndefined();
    });

    it('lets non-destructive mirrors inherit host color after late theme changes', async () => {
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

        const mirror = readerTextMirrorForSource(host)!;
        const reading = mirror.querySelector<HTMLElement>('.jpdb-reader-detached-furi')!;
        expect(mirror).toBeTruthy();
        expect(reading).toBeTruthy();
        expect(host.contains(mirror)).toBe(false);
        expect(getComputedStyle(mirror).color).toBe('rgb(128, 128, 128)');
        host.style.color = 'rgb(20, 20, 20)';
        // Host attribute observation re-stamps out-of-tree portal typography
        // before the next paint; unlike an in-host mirror it cannot inherit
        // synchronously through the DOM tree.
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(getComputedStyle(mirror).color).toBe('rgb(20, 20, 20)');
        expect(getComputedStyle(reading).color).toBe('rgb(20, 20, 20)');
    });

    it('does not duplicate block-child text in a generic non-destructive parent mirror', () => {
        document.body.innerHTML = `
            <dl>
                <dd id="postage">
                    送料無料の商品です。
                    <p id="note">※配送不可エリア 離島</p>
                </dd>
            </dl>
        `;
        const host = document.querySelector<HTMLElement>('#postage')!;
        const note = document.querySelector<HTMLElement>('#note')!;
        const targets = collectFragmentTextTargetsIn(host, 10, false);
        const parentTarget = targets.find(candidate => candidate.text.includes('送料無料')) as FragmentTextTarget | undefined;
        const noteTarget = targets.find(candidate => candidate.text.includes('配送不可')) as FragmentTextTarget | undefined;

        expect(parentTarget).toBeTruthy();
        expect(noteTarget).toBeTruthy();
        applyTokensToScanTarget({ ...parentTarget!, nonDestructive: true }, [
            token('商品', parentTarget!.text.indexOf('商品'), parentTarget!.text, 'しょうひん'),
        ], {
            ...DEFAULT_SETTINGS,
            showFurigana: true,
            furiganaMode: 'all',
        });
        applyTokensToScanTarget({ ...noteTarget!, nonDestructive: true }, [
            token('配送', noteTarget!.text.indexOf('配送'), noteTarget!.text, 'はいそう'),
            token('不可', noteTarget!.text.indexOf('不可'), noteTarget!.text, 'ふか'),
        ], {
            ...DEFAULT_SETTINGS,
            showFurigana: true,
            furiganaMode: 'all',
        });

        expect(host.querySelector(':scope > .jpdb-reader-text-mirror')).toBeNull();
        const noteMirror = readerTextMirrorForSource(note);
        expect(noteMirror).not.toBeNull();
        expect(note.contains(noteMirror)).toBe(false);
        expect(readerWordsWithinSource(host)).toHaveLength(3);
        expect(readerWordsForSource(note)).toHaveLength(2);
        const plain = host.cloneNode(true) as HTMLElement;
        plain.querySelectorAll('rt,rp,.jpdb-reader-text-mirror').forEach(child => child.remove());
        expect(plain.textContent?.replace(/\s+/g, '')).toContain('送料無料の商品です。※配送不可エリア離島');
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

    it('keeps NHK-style scrollable nav tab strips layout-neutral with detached readings', () => {
        // Guards the NHK news nav regression: a horizontally-scrolling [role=tablist]
        // of kanji tabs must decorate as inline passive chrome with NO furigana row,
        // so decoration adds neither height (no <rt>) nor width (no inline-block box).
        // Live-confirmed layout-neutral (worstDW:0, worstDH:0); jsdom can't measure the
        // box, so this locks the classification that guarantees the zero shift.
        document.body.innerHTML = `
            <nav>
                <div role="tablist" style="display:flex;gap:8px;overflow-x:auto;white-space:nowrap">
                    <a role="tab" href="#" aria-selected="true">ニュース</a>
                    <a role="tab" href="#">新着</a>
                    <a role="tab" href="#">注目</a>
                    <a role="tab" href="#">社会</a>
                    <a role="tab" href="#">気象</a>
                    <a role="tab" href="#">災害</a>
                    <a role="tab" href="#">政治</a>
                </div>
            </nav>
        `;
        const strip = document.querySelector<HTMLElement>('[role="tablist"]')!;
        const targets = collectTargets(strip);

        const kanjiTargets = targets.filter(candidate => /[一-龯々]/u.test(candidate.text));
        expect(kanjiTargets.length).toBeGreaterThan(0);
        expect(kanjiTargets.every(candidate => candidate.suppressRuby === true)).toBe(true);
        expect(kanjiTargets.every(candidate => candidate.passiveInteraction === true)).toBe(true);

        const readings: Record<string, string> = {
            '新着': 'しんちゃく',
            '注目': 'ちゅうもく',
            '社会': 'しゃかい',
            '気象': 'きしょう',
            '災害': 'さいがい',
            '政治': 'せいじ',
        };
        for (const target of kanjiTargets) {
            const match = target.text.match(/[一-龯々]+/u)!;
            applyTokensToScanTarget(target, [
                token(match[0], target.text.indexOf(match[0]), target.text, readings[match[0]]),
            ], {
                ...DEFAULT_SETTINGS,
                showFurigana: true,
                furiganaMode: 'all',
            });
        }

        const tabs = Array.from(strip.querySelectorAll<HTMLElement>('[role="tab"]'));
        const kanjiTabs = tabs.filter(tab => /[一-龯々]/u.test(tab.textContent ?? ''));
        expect(kanjiTabs.length).toBeGreaterThan(0);
        for (const tab of kanjiTabs) {
            const word = tab.querySelector<HTMLElement>('.jpdb-reader-word');
            expect(word).toBeTruthy();
            expect(word!.dataset.jpdbReaderPassive).toBe('true');
            expect(tab.querySelector('rt')).toBeNull();
            expect(tab.querySelector('.jpdb-reader-detached-furi')).not.toBeNull();
            expect(tab.querySelector('.jpdb-reader-text-mirror')).toBeNull();
            expect(tab.dataset.jpdbReaderPassiveChrome).toBe('true');
        }
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

    it('surfaces the lone Japanese option of a Latin-selected picker', () => {
        document.body.innerHTML = `
            <form>
                <select>
                    <option selected>English</option>
                    <option>日本語</option>
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
