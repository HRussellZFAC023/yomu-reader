import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    registerReaderHelpersCleanup,
    AUTO_SCAN_OBSERVER_OPTIONS,
    DEFAULT_SETTINGS,
    NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT,
    ReaderApp,
    SITE_PARSER_PROFILES,
    YOUTUBE_WATCH_TEST_URL,
    allowsFrequentVisibleAutoScan,
    allowsGenericVisibleAutoScan,
    applyTokensToScanTarget,
    card,
    collectFragmentTextTargetsIn,
    collectScanTargets,
    collectYouTubeTargets,
    collectYouTubeWatchTargets,
    expectRenderedPitchWord,
    getMatchingSiteParsers,
    hostedDocsCardToken,
    mockElementBoundingClientRect,
    mutationLooksLikeReaderRenderRejection,
    mutationMayAffectJpdbPageEnhancements,
    mutationMayContainJapaneseText,
    readerRenderRejectionRescanDelay,
    readerTextMirrorForSource,
    readerWordsForSource,
    readerWordSurfaceText,
    renderedWordPrivateValue,
    visibleAutoScanInitialDelay,
    visibleAutoScanMutationDelay,
} from './fixtures';
import type {
    JPDBToken,
    ReaderSettings,
    ScanTextTarget,
} from './fixtures';

registerReaderHelpersCleanup();
afterEach(() => document.documentElement.removeAttribute('data-yomu-annotation-scope'));

function isContinuableActiveTarget(target: ScanTextTarget): boolean {
    return target.passiveInteraction !== true && target.singlePassScan !== true;
}

function hasDirectTextNode(host: HTMLElement, text: string): boolean {
    return Array.from(host.childNodes).some(node =>
        node.nodeType === Node.TEXT_NODE && node.textContent === text);
}

function expectActiveNonDestructiveTarget(target: ScanTextTarget): void {
    expect(target).toMatchObject({ nonDestructive: true });
    expect(target.passiveInteraction).not.toBe(true);
    expect(target.forceInlineRender).not.toBe(true);
    expect(target.suppressRepaintLoopMirror).not.toBe(true);
}

function expectElementText(root: ParentNode, selector: string, text: string): void {
    expect(root.querySelector(selector)?.textContent).toBe(text);
}

describe('reader helpers', () => {
    it('scans Google Docs menubar entries as passive ruby targets', () => {
        const rectSpy = mockElementBoundingClientRect({ width: 96, height: 28 });
        document.body.innerHTML = `
            <div id="docs-menubar" role="menubar" class="docs-menubar goog-container goog-container-horizontal" tabindex="0" style="user-select: none; max-width: 840px;">
                <div id="docs-file-menu" role="menuitem" class="menu-button goog-control goog-inline-block" aria-disabled="false" aria-expanded="false" aria-haspopup="true">ファイル</div>
                <div id="docs-edit-menu" role="menuitem" class="menu-button goog-control goog-inline-block" aria-disabled="false" aria-expanded="false" aria-haspopup="true">編集</div>
                <div id="docs-view-menu" role="menuitem" class="menu-button goog-control goog-inline-block" aria-disabled="false" aria-expanded="false" aria-haspopup="true">表示</div>
                <div id="docs-tools-menu" role="menuitem" class="menu-button goog-control goog-inline-block" aria-disabled="false" aria-expanded="false" aria-haspopup="true">ツール</div>
                <div id="docs-gemini-menu" role="menuitem" class="menu-button goog-control goog-inline-block" style="display: none;" aria-hidden="true" aria-disabled="false" aria-expanded="false" aria-haspopup="true">Gemini</div>
                <div id="docs-help-menu" role="menuitem" class="menu-button goog-control goog-inline-block" aria-disabled="false" aria-expanded="false" aria-haspopup="true">ヘルプ</div>
            </div>
        `;

        const targets = collectScanTargets(10, 'https://docs.google.com/document/d/test/edit');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual(['ファイル', '編集', '表示', 'ツール', 'ヘルプ']);
        const editTarget = targets.find(target => target.text === '編集')!;
        expect('passiveInteraction' in editTarget && editTarget.passiveInteraction).toBe(true);

        applyTokensToScanTarget(editTarget, [{
            card: { ...card, spelling: '編集', reading: 'へんしゅう', cardState: ['known'] },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'へんしゅう', start: 0, end: 2, length: 2 }],
            pitchClass: '',
            sentence: '編集',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const word = document.querySelector<HTMLElement>('#docs-edit-menu .jpdb-reader-word')!;
        expect(word.dataset.jpdbReaderPassive).toBe('true');
        expect(word.tabIndex).toBe(-1);
        expect(word.querySelector('ruby rt')).toBeNull();
        expect(word.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('へんしゅう');
    });

    it('keeps inline prose links clickable without making surrounding prose passive', () => {
        const rectSpy = mockElementBoundingClientRect();
        document.body.innerHTML = `
            <main>
                <article>
                    <p>今日は<a href="/more">続きを読む</a>本文を読みます。</p>
                </article>
            </main>
        `;

        const targets = collectScanTargets(10, 'https://example.com/article');
        rectSpy.mockRestore();

        const target = targets.find(candidate => candidate.text === '今日は続きを読む本文を読みます。');
        expect(target).toBeTruthy();
        expect('passiveInteraction' in target! && target.passiveInteraction).not.toBe(true);

        applyTokensToScanTarget(target!, [
            {
                card: { ...card, cardState: ['known'], spelling: '今日', reading: 'きょう' },
                start: 0,
                end: 2,
                length: 2,
                rubies: [{ text: 'きょう', start: 0, end: 2, length: 2 }],
                pitchClass: '',
                sentence: '今日は続きを読む本文を読みます。',
            },
            {
                card: { ...card, cardState: ['not-in-deck'], spelling: '続き', reading: 'つづき' },
                start: 3,
                end: 5,
                length: 2,
                rubies: [{ text: 'つづき', start: 3, end: 5, length: 2 }],
                pitchClass: '',
                sentence: '今日は続きを読む本文を読みます。',
            },
            {
                card: { ...card, cardState: ['known'], spelling: '本文', reading: 'ほんぶん' },
                start: 8,
                end: 10,
                length: 2,
                rubies: [{ text: 'ほんぶん', start: 8, end: 10, length: 2 }],
                pitchClass: '',
                sentence: '今日は続きを読む本文を読みます。',
            },
        ], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const activeWord = document.querySelector<HTMLElement>('p > .jpdb-reader-word')!;
        const linkWord = document.querySelector<HTMLElement>('a[href="/more"] .jpdb-reader-word')!;
        expect(activeWord.dataset.jpdbReaderPassive).toBeUndefined();
        expect(activeWord.tabIndex).toBe(-1);
        expect(activeWord.querySelector('rt')?.textContent).toBe('きょう');
        expect(linkWord.dataset.jpdbReaderPassive).toBe('true');
        expect(linkWord.tabIndex).toBe(-1);
        expect(linkWord.querySelector('rt')?.textContent).toBe('つづ');
    });

    it('marks compact onclick controls passive in whole-page fallback scans', () => {
        const rectSpy = mockElementBoundingClientRect({ width: 220, height: 40 });
        document.body.innerHTML = '<div><span onclick="window.openMore?.()">続きを読む</span></div>';

        const targets = collectScanTargets(10, 'https://example.com/tools');
        rectSpy.mockRestore();

        const target = targets.find(candidate => candidate.text === '続きを読む');
        expect(target).toBeTruthy();
        expect('passiveInteraction' in target! && target.passiveInteraction).toBe(true);

        applyTokensToScanTarget(target!, [{
            card: { ...card, cardState: ['not-in-deck'], spelling: '続き', reading: 'つづき' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'つづき', start: 0, end: 2, length: 2 }],
            pitchClass: '',
            sentence: '続きを読む',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const word = document.querySelector<HTMLElement>('[onclick] .jpdb-reader-word')!;
        expect(word.dataset.jpdbReaderPassive).toBe('true');
        expect(word.tabIndex).toBe(-1);
        expect(word.querySelector('rt')?.textContent).toBe('つづ');
    });

    it('skips aria-hidden control feedback without hiding a sole painted label', () => {
        const rectSpy = mockElementBoundingClientRect({ width: 220, height: 40 });
        document.body.innerHTML = `
            <button>
                <span aria-hidden="true"><span>押下中</span></span>
                <span>字幕を表示</span>
            </button>
            <button>
                <span aria-hidden="true"><span>購読</span></span>
            </button>
        `;

        const targets = collectScanTargets(10, 'https://example.com/controls');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
            '字幕を表示',
            '購読',
        ]));
        expect(targets.map(target => target.text)).not.toContain('押下中');
    });

    it('collects only declared Try Me content on hosted docs', () => {
        const rectSpy = mockElementBoundingClientRect();
        document.documentElement.setAttribute('data-yomu-annotation-scope', 'surface');
        document.body.innerHTML = `
            <main>
                <section class="VPHero has-image">
                    <h1 style="text-align:center;font-size:48px;line-height:1.1">
                        <span class="name">よむ</span>
                        <span class="text">好きなものを読んで日本語を学ぶ</span>
                    </h1>
                    <p class="tagline">Tap a word anywhere, understand it in context, save it for review, and keep reading. よむ turns real Japanese pages into study text.</p>
                </section>
                <section class="VPFeatures">
                    <div class="item">
                        <p>Extensive reading works because よむ removes just enough friction.</p>
                    </div>
                </section>
            </main>
            <div class="vp-doc">
                <div class="yomu-install-panel">
                    <div class="yomu-install-copy">
                        <strong>Install よむ as a userscript</strong>
                        <p>Use Tampermonkey or Userscripts, install よむ, then refresh a Japanese page.</p>
                    </div>
                    <div class="yomu-install-steps">
                        <a class="yomu-install-step-link" href="/yomu-reader/yomu.user.js"><b>2</b> <span>Install よむ</span></a>
                    </div>
                </div>
                <h2>What It Does</h2>
                <p>よむ runs inside your browser. Point it at Japanese text and it opens a clean popup.</p>
                <div class="yomu-try-me">
                    <strong>Try me</strong>
                    <div class="yomu-try-me-text" data-yomu-runtime-surface>
                        <h3>青空の下で本を読む</h3>
                        <p>今日は静かな喫茶店で新しい本を読みました。</p>
                    </div>
                </div>
            </div>
        `;

        const targets = collectScanTargets(20, 'http://127.0.0.1:5178/');
        rectSpy.mockRestore();

        const texts = targets.map(target => target.text);
        // Collection never wraps text in place.
        expect(document.querySelector('.yomu-try-me .jpdb-reader-word')).toBeNull();
        const chromeSamples = ['好きなものを読んで日本語を学ぶ', 'Install よむ as a userscript', 'よむ runs inside your browser'];
        for (const sample of chromeSamples) {
            expect(texts.some(text => text.includes(sample)), `site copy "${sample}" must not be scanned`).toBe(false);
        }
        expect(texts).toContain('青空の下で本を読む');
        expect(texts).toContain('今日は静かな喫茶店で新しい本を読みました。');
    });

    it('collects nothing on hosted docs pages without a declared Reader Surface', () => {
        const rectSpy = mockElementBoundingClientRect();
        document.documentElement.setAttribute('data-yomu-annotation-scope', 'surface');
        document.body.innerHTML = `
            <main>
                <div class="vp-doc">
                    <h1>機能</h1>
                    <p>よむは日本語テキスト、字幕、漫画画像を同じポップアップで読めます。</p>
                    <p>Video player and new tab links should remain normal navigation.</p>
                    <div class="yomu-link-grid">
                        <a class="yomu-link-card" href="newtab/index.html"><strong>よむを学習に使う</strong></a>
                    </div>
                </div>
            </main>
        `;

        const targets = collectScanTargets(20, 'http://127.0.0.1:5178/yomu-reader/features/');
        const activeAppParsers = [
            ...getMatchingSiteParsers('http://127.0.0.1:5178/yomu-reader/newtab/index.html'),
            ...getMatchingSiteParsers('http://127.0.0.1:5178/yomu-reader/video-player/index.html'),
        ];
        rectSpy.mockRestore();

        const texts = targets.map(target => target.text);
        expect(targets.some(target => 'parserId' in target && target.parserId === 'generic-prose-parser')).toBe(false);
        expect(texts).not.toContain('機能');
        expect(texts.some(text => text.includes('よむは日本語テキスト'))).toBe(false);
        expect(targets.some(target => target.text.includes('よむを学習に使う'))).toBe(false);
        expect(activeAppParsers.map(parser => parser.id)).not.toContain('yomu-demo-lookup-parser');
        expect(activeAppParsers.map(parser => parser.id)).toContain('yomu-video-player-parser');
    });

    it('lets annotated hosted docs card links wrap while staying passive', () => {
        const rectSpy = mockElementBoundingClientRect();
        const copy = 'ユーザースクリプト管理拡張を入れ、よむを追加して、最初の検索を試します。';
        document.documentElement.setAttribute('data-yomu-annotation-scope', 'surface');
        document.body.innerHTML = `
            <main>
                <div class="vp-doc">
                    <div class="yomu-link-grid">
                        <a class="yomu-link-card" href="/getting-started">
                            <strong>よむをセットアップ</strong>
                            <span>${copy}</span>
                        </a>
                    </div>
                </div>
            </main>
        `;

        const targets = collectScanTargets(20, 'http://127.0.0.1:5178/yomu-reader/');
        rectSpy.mockRestore();

        expect(targets.some(target => target.text.includes(copy))).toBe(false);
        const host = document.querySelector<HTMLElement>('.yomu-link-card span')!;
        const cardTarget: ScanTextTarget = {
            node: host.firstChild as Text,
            parent: host,
            text: copy,
            passiveInteraction: true,
        };

        const sentence = cardTarget.text;
        applyTokensToScanTarget(cardTarget, [
            hostedDocsCardToken(sentence, 'ユーザースクリプト管理拡張', 'ゆーざーすくりぷとかんりかくちょう'),
            hostedDocsCardToken(sentence, '追加', 'ついか'),
            hostedDocsCardToken(sentence, '検索', 'けんさく'),
        ], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const words = Array.from(document.querySelectorAll<HTMLElement>('.yomu-link-card span .jpdb-reader-word'));
        expect(words).toHaveLength(3);
        expect(words.every(word => word.classList.contains('jpdb-reader-passive-word'))).toBe(true);
        expect(words.every(word => word.classList.contains('jpdb-reader-scan-word'))).toBe(true);
        expect(words.every(word => word.dataset.jpdbReaderPassive === 'true')).toBe(true);
        expect(words[0]?.querySelector('rt')?.textContent).toBe('ゆーざーすくりぷとかんりかくちょう');
    });

    it('lets hosted docs Try Me text opt into visible furigana under default settings', () => {
        const copy = '青空と読書を楽しみます。';
        document.body.innerHTML = `<div class="yomu-try-me-text" data-yomu-furigana-mode="all">${copy}</div>`;
        const host = document.querySelector<HTMLElement>('.yomu-try-me-text')!;
        const target: ScanTextTarget = {
            node: host.firstChild as Text,
            parent: host,
            text: copy,
            suppressRuby: true,
            passiveInteraction: true,
        };

        applyTokensToScanTarget(target, [
            hostedDocsCardToken(copy, '青空', 'あおぞら'),
            hostedDocsCardToken(copy, '読書', 'どくしょ'),
        ], DEFAULT_SETTINGS);

        const words = Array.from(document.querySelectorAll<HTMLElement>('.yomu-try-me-text .jpdb-reader-word'));
        expect(words).toHaveLength(2);
        expect(words.every(word => word.dataset.jpdbReaderPassive === 'true')).toBe(true);
        expect(words[0]?.querySelector('rt')?.textContent).toBe('あおぞら');
        expect(words[1]?.querySelector('rt')?.textContent).toBe('どくしょ');
    });

    it('leaves hosted docs overflow chrome and prose unannotated', () => {
        const rectSpy = mockElementBoundingClientRect();
        document.documentElement.setAttribute('data-yomu-annotation-scope', 'surface');
        document.body.innerHTML = `
            <main><div class="vp-doc"><p>今日は本を読みます。</p></div></main>
            <div class="yomu-hosted-overflow-group">
                <button type="button" class="yomu-hosted-overflow-link">設定</button>
                <a class="yomu-hosted-overflow-link" href="/yomu-reader/video-player/index.html">動画プレイヤー</a>
            </div>
        `;

        const targets = collectScanTargets(20, 'http://127.0.0.1:5178/yomu-reader/');
        rectSpy.mockRestore();

        const texts = targets.map(target => target.text);
        for (const label of ['設定', '動画プレイヤー']) {
            expect(targets.some(item => item.text.includes(label)), `overflow label "${label}" must not be scanned`).toBe(false);
        }
        expect(texts).not.toContain('今日は本を読みます。');
    });

    it('scans hosted video-player Japanese empty-state and control text', () => {
        const rectSpy = mockElementBoundingClientRect();
        document.body.innerHTML = `
            <main data-app>
                <label class="file-button">動画を開く<input type="file"></label>
                <button type="button" data-subtitle-open>字幕</button>
                <button type="button" data-settings-trigger>設定</button>
                <details data-overflow-menu>
                    <summary>メニュー</summary>
                    <a href="/yomu-reader/">学習</a>
                </details>
                <section class="stage" data-stage data-yomu-video-frame aria-label="動画">
                    <button class="empty" type="button" data-empty-open>
                        <div>
                            <strong>動画を開くかドロップ</strong>
                            <span class="status" data-status>動画を開いたあと、字幕ボタンから日本語字幕と母語字幕ファイルを追加できます。</span>
                        </div>
                    </button>
                </section>
            </main>
        `;

        try {
            const targets = collectScanTargets(20, 'http://127.0.0.1:5178/yomu-reader/video-player/index.html');
            const texts = targets.map(target => target.text);

            expect(texts).toContain('動画を開くかドロップ');
            expect(texts.some(text => text.includes('日本語字幕と母語字幕ファイル'))).toBe(true);
            expect(texts).toEqual(expect.arrayContaining(['動画を開く', '字幕', '設定']));
            expect(targets.every(target => 'parserId' in target && target.parserId === 'yomu-video-player-parser')).toBe(true);
            expect(targets.some(target => 'passiveInteraction' in target && target.passiveInteraction)).toBe(true);
        } finally {
            rectSpy.mockRestore();
        }
    });

    it('stops rescanning a tokenized Try Me surface without escaping to surrounding prose', () => {
        const rectSpy = mockElementBoundingClientRect();
        document.documentElement.setAttribute('data-yomu-annotation-scope', 'surface');
        document.body.innerHTML = `
            <main>
                <div class="vp-doc">
                    <p>好きなものを読んで日本語を学ぶ</p>
                    <div class="yomu-try-me">
	                    <strong>Try me</strong>
	                    <div class="yomu-try-me-text" data-yomu-runtime-surface>
	                        <h3>青空</h3>
	                        <p>読書</p>
	                    </div>
	                </div>
	            </div>
            </main>
	    `;

	        try {
	            const targets = collectScanTargets(20, 'http://127.0.0.1:5178/yomu-reader/');
	            const tryMeTargets = targets.filter(target => target.parent.closest('.yomu-try-me'));
	            expect(targets.map(target => target.text)).not.toContain('好きなものを読んで日本語を学ぶ');
	            expect(tryMeTargets.map(target => target.text)).toEqual(['青空', '読書']);
	            tryMeTargets.forEach(target => {
	                const reading = target.text === '青空' ? 'あおぞら' : 'どくしょ';
                applyTokensToScanTarget(target, [{
                    card: { ...card, spelling: target.text, reading, cardState: ['known'], pitchAccent: ['LH'] },
                    start: 0,
                    end: target.text.length,
                    length: target.text.length,
                    rubies: [{ text: reading, start: 0, end: target.text.length, length: target.text.length }],
                    pitchClass: 'heiban',
                    sentence: target.text,
                }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
            });

            expect(document.querySelectorAll('.yomu-try-me .jpdb-reader-word')).toHaveLength(2);
            expect(document.querySelectorAll('.yomu-try-me rt').length).toBeGreaterThan(0);
            const remainingTargets = collectScanTargets(20, 'http://127.0.0.1:5178/yomu-reader/');
            expect(remainingTargets.map(target => target.text)).not.toContain('好きなものを読んで日本語を学ぶ');
            expect(remainingTargets.some(target => target.parent.closest('.yomu-try-me'))).toBe(false);
        } finally {
            rectSpy.mockRestore();
        }
    });

    it('scans all visible NHK Easy Japanese text with the site parser', () => {
        const visibleRect = {
            left: 0,
            right: 800,
            top: 0,
            bottom: 200,
            width: 800,
            height: 200,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect;
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(visibleRect);
        document.body.innerHTML = `
            <header id="nhk-one-header">
                <button>メニュー</button>
                <nav><a href="/news">ニュース</a></nav>
            </header>
            <main>
                <article>
                    <h1 class="article-title">東京でニュースを読む</h1>
                    <div id="js-article-body">
                        <p>今日は本を読みます。</p>
                    </div>
                    <div class="article-buttons">
                        <div><a class="listen-news" href="#audio">ニュースを聞く</a></div>
                        <div><button>漢字の読み方を消す</button></div>
                    </div>
                </article>
            </main>
            <aside>
                <h2>災害で気をつけること</h2>
                <a href="/typhoon">台風</a>
            </aside>
            <footer id="nhk-one-footer">
                <p>許可なく転載することを禁じます。</p>
            </footer>
        `;
        document.querySelectorAll<HTMLButtonElement>('button')
            .forEach(button => { button.getBoundingClientRect = () => visibleRect; });

        const targets = collectScanTargets(10, 'https://news.web.nhk/news/easy/ne2026050812537/ne2026050812537.html');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual([
            'メニュー',
            'ニュース',
            '東京でニュースを読む',
            '今日は本を読みます。',
            'ニュースを聞く',
            '漢字の読み方を消す',
            '災害で気をつけること',
            '台風',
            '許可なく転載することを禁じます。',
        ]);
        expect(targets.every(target => 'parserId' in target && target.parserId === 'nhk-parser')).toBe(true);
        expect(targets.find(target => target.text === 'メニュー')).toMatchObject({ passiveInteraction: true });
        expect(targets.find(target => target.text === 'ニュース')).toMatchObject({ passiveInteraction: true });
        expect(targets.find(target => target.text === '東京でニュースを読む')).not.toMatchObject({ passiveInteraction: true });
    });

    it('scans NHK Easy article audio and ruby controls as passive labels', () => {
        const visibleRect = {
            left: 0,
            right: 800,
            top: 0,
            bottom: 200,
            width: 800,
            height: 200,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect;
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(visibleRect);
        document.body.innerHTML = `
            <main>
                <article>
                    <h1 class="article-title"><ruby>東京<rt>とうきょう</rt></ruby>でニュースを読む</h1>
                    <div class="article-top-tool">
                        <div class="article-buttons">
                            <a href="#" class="article-buttons__audio js-open-audio">
                                <span>ニュースを<ruby>聞<rt>き</rt></ruby>く</span>
                            </a>
                            <a href="#" class="article-buttons__ruby js-toggle-ruby is-ruby --pc">
                                <ruby>漢字<rt>かんじ</rt></ruby>の<ruby>読<rt>よ</rt></ruby>み<ruby>方<rt>かた</rt></ruby>を<ruby>消<rt>け</rt></ruby>す
                            </a>
                        </div>
                        <a href="#" class="article-buttons__ruby js-toggle-ruby is-ruby --sp">
                            <ruby>漢字<rt>かんじ</rt></ruby>の<ruby>読<rt>よ</rt></ruby>み<ruby>方<rt>かた</rt></ruby>を<ruby>消<rt>け</rt></ruby>す
                        </a>
                        <div class="audio-player" id="js-audio-wrapper">
                            <div id="js-audio-inner">音声</div>
                        </div>
                    </div>
                    <div id="js-article-body">
                        <p><ruby>今日は<rt>きょうは</rt></ruby>本を読みます。</p>
                    </div>
                </article>
            </main>
        `;

        const targets = collectScanTargets(10, 'https://news.web.nhk/news/easy/ne2026051413177/ne2026051413177.html');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual([
            '東京でニュースを読む',
            'ニュースを聞く',
            '漢字の読み方を消す',
            '漢字の読み方を消す',
            '音声',
            '今日は本を読みます。',
        ]);
        expect(targets.find(target => target.text === 'ニュースを聞く')).toMatchObject({ passiveInteraction: true });
        expect(targets.filter(target => target.text === '漢字の読み方を消す')).toHaveLength(2);
        expect(targets.filter(target => target.text === '漢字の読み方を消す')
            .every(target => 'passiveInteraction' in target && target.passiveInteraction)).toBe(true);
        expect(targets.find(target => target.text === '音声')).toMatchObject({ passiveInteraction: true });
    });

    it('scans JPDB native Immersion Kit examples and passive audio controls', () => {
        const visibleRect = {
            left: 0,
            right: 800,
            top: 0,
            bottom: 240,
            width: 800,
            height: 240,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect;
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(visibleRect);
        document.body.innerHTML = `
            <main>
                <div class="result vocabulary">
                    <div class="subsection-usages">今日は本を読みます。</div>
                    <div class="subsection-immersion-kit">
                        <button class="immersion-audio-control">音声を聞く</button>
                        <div class="sentence">今日は忙しいです。</div>
                    </div>
                </div>
            </main>
        `;

        const targets = collectScanTargets(10, 'https://jpdb.io/vocabulary/1/%E4%BB%8A%E6%97%A5/%E3%81%8D%E3%82%87%E3%81%86');
        rectSpy.mockRestore();

        expect(targets.map(target => target.text)).toEqual(['今日は本を読みます。', '音声を聞く', '今日は忙しいです。']);
        expect(targets.find(target => target.text === '音声を聞く')).toMatchObject({ passiveInteraction: true });
        expect(targets.find(target => target.text === '今日は忙しいです。')).not.toMatchObject({ passiveInteraction: true });
    });

    it('keeps scanned JPDB native links and controls passive so clicks pass through', () => {
        const visibleRect = {
            left: 0,
            right: 800,
            top: 0,
            bottom: 240,
            width: 800,
            height: 240,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect;
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(visibleRect);
        vi.stubGlobal('location', {
            href: 'https://jpdb.io/search?q=%E6%97%A5%E6%9C%AC%E8%AA%9E',
            origin: 'https://jpdb.io',
            hostname: 'jpdb.io',
            pathname: '/search',
        });
        document.body.innerHTML = `
            <main>
                <div class="results">
                    <div class="result vocabulary">
                        <a class="result-link" href="/vocabulary/1578580/%E6%97%A5%E6%9C%AC%E8%AA%9E/%E3%81%AB%E3%81%BB%E3%82%93%E3%81%94">
                            <span class="term">日本語</span>
                        </a>
                        <button class="icon-link" type="button">音声</button>
                    </div>
                </div>
            </main>
        `;

        const targets = collectScanTargets(10, 'https://jpdb.io/search?q=%E6%97%A5%E6%9C%AC%E8%AA%9E');
        const linkTarget = targets.find(target => target.text.trim() === '日本語');
        const controlTarget = targets.find(target => target.text.trim() === '音声');
        expect(linkTarget).toBeTruthy();
        expect(controlTarget).toBeTruthy();
        expect(linkTarget).toMatchObject({ passiveInteraction: true });
        expect(controlTarget).toMatchObject({ passiveInteraction: true });

        applyTokensToScanTarget(linkTarget!, [{
            card: { ...card, vid: 1578580, sid: 0, spelling: '日本語', reading: 'にほんご', cardState: ['known'] },
            start: 0,
            end: 3,
            length: 3,
            rubies: [{ text: 'にほんご', start: 0, end: 3, length: 3 }],
            pitchClass: 'heiban',
            sentence: '日本語',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        applyTokensToScanTarget(controlTarget!, [{
            card: { ...card, vid: 1, sid: 0, spelling: '音声', reading: 'おんせい', cardState: ['known'] },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'おんせい', start: 0, end: 2, length: 2 }],
            pitchClass: '',
            sentence: '音声',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const word = document.querySelector<HTMLElement>('a.result-link .jpdb-reader-word')!;
        const nativeControl = document.querySelector<HTMLElement>('button.icon-link')!;
        const nativeControlWord = document.querySelector<HTMLElement>('button.icon-link .jpdb-reader-word')!;
        const app = new ReaderApp();
        const showWord = vi.fn(async () => undefined);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            showWord: typeof showWord;
            bindEvents(): void;
        };
        internals.settings = { ...DEFAULT_SETTINGS, lookupOnClick: true, lookupOnHover: true, shortcuts: { ...DEFAULT_SETTINGS.shortcuts, hoverLookup: 'shift' } };
        internals.showWord = showWord;
        internals.bindEvents();

        try {
            expect(word.dataset.jpdbReaderPassive).toBe('true');
            expect(word.tabIndex).toBe(-1);
            expect(nativeControlWord.dataset.jpdbReaderPassive).toBe('true');
            expect(nativeControlWord.tabIndex).toBe(-1);

            const wordClick = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 80, clientY: 24 });
            expect(word.dispatchEvent(wordClick)).toBe(true);
            expect(wordClick.defaultPrevented).toBe(false);
            expect(showWord).not.toHaveBeenCalled();

            const modifierClick = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 80, clientY: 24, shiftKey: true });
            expect(word.dispatchEvent(modifierClick)).toBe(true);
            expect(modifierClick.defaultPrevented).toBe(false);
            expect(showWord).not.toHaveBeenCalled();

            showWord.mockClear();
            const nativeWordClick = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 200, clientY: 24 });
            expect(nativeControlWord.dispatchEvent(nativeWordClick)).toBe(true);
            expect(nativeWordClick.defaultPrevented).toBe(false);
            expect(showWord).not.toHaveBeenCalled();

            const nativeClick = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 200, clientY: 24 });
            expect(nativeControl.dispatchEvent(nativeClick)).toBe(true);
            expect(nativeClick.defaultPrevented).toBe(false);
            expect(showWord).not.toHaveBeenCalled();
        } finally {
            app.destroy();
            vi.unstubAllGlobals();
            rectSpy.mockRestore();
            document.body.replaceChildren();
        }
    });

    it('keeps Discord-shaped clickable message prose active so pitch underlines persist at rest', () => {
        const visibleRect = {
            left: 0,
            right: 760,
            top: 0,
            bottom: 120,
            width: 760,
            height: 120,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect;
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(visibleRect);
        document.body.innerHTML = `
            <main role="main">
                <ol class="messagesWrapper">
                    <li role="article" class="messageListItem">
                        <h3 class="username">lov</h3>
                        <div role="button" tabindex="0" class="messageContent">
                            跳梁跋扈
                        </div>
                    </li>
                </ol>
            </main>
        `;

        try {
            const targets = collectScanTargets(10, 'https://discord.com/channels/1/2/3');
            const target = targets.find(candidate => candidate.text.trim() === '跳梁跋扈');
            expect(target).toBeTruthy();
            expect(target).not.toMatchObject({ passiveInteraction: true });

            applyTokensToScanTarget(target!, [{
                card: { ...card, vid: 44, sid: 0, spelling: '跳梁跋扈', reading: 'ちょうりょうばっこ', cardState: ['known'], pitchAccent: ['LHHHLLL'] },
                start: 0,
                end: 4,
                length: 4,
                rubies: [{ text: 'ちょうりょうばっこ', start: 0, end: 4, length: 4 }],
                pitchClass: 'nakadaka',
                sentence: '跳梁跋扈',
            }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

            const word = document.querySelector<HTMLElement>('.messageContent .jpdb-reader-word')!;
            expect(word.classList.contains('jpdb-reader-passive-word')).toBe(false);
            expect(word.dataset.jpdbReaderPassive).toBeUndefined();
            expect(word.classList.contains('jpdb-pitch-nakadaka')).toBe(true);
        } finally {
            rectSpy.mockRestore();
            document.body.replaceChildren();
        }
    });

    it('rescans Japanese text when NHK menu visibility attributes change', () => {
        const dialog = document.createElement('dialog');
        dialog.textContent = 'メニュー';
        const mutation = {
            type: 'attributes',
            attributeName: 'open',
            target: dialog,
            addedNodes: [],
        } as unknown as MutationRecord;

        expect(AUTO_SCAN_OBSERVER_OPTIONS.attributes).toBe(true);
        expect(AUTO_SCAN_OBSERVER_OPTIONS.attributeFilter).toContain('open');
        // Class E (2026-07-11, deliberate pin update): style/class ARE watched
        // now — menus/sheets that keep their DOM and toggle display/class were
        // invisible to the scan trigger. The noise risk the old pin guarded
        // against is handled by the reveal-shape filter (oldValue hidden →
        // shown, value actually changed, element renders now) instead of by
        // not observing at all.
        expect(AUTO_SCAN_OBSERVER_OPTIONS.attributeFilter).toContain('class');
        expect(AUTO_SCAN_OBSERVER_OPTIONS.attributeFilter).toContain('style');
        expect(AUTO_SCAN_OBSERVER_OPTIONS.attributeOldValue).toBe(true);
        expect(mutationMayContainJapaneseText(mutation)).toBe(true);
    });

    it('detects Japanese text in large dynamic nodes without relying on one textContent slice', () => {
        const container = document.createElement('div');
        container.append(document.createTextNode('Loading '.repeat(360)));
        const comment = document.createElement('yt-attributed-string');
        comment.id = 'content-text';
        comment.textContent = '先生いつもありがとうございました。';
        container.append(comment);
        const mutation = {
            type: 'childList',
            target: document.body,
            addedNodes: [container],
            removedNodes: [],
        } as unknown as MutationRecord;

        expect(mutationMayContainJapaneseText(mutation)).toBe(true);
    });

    it('detects YouTube player caption mutations for page text rescans', () => {
        document.body.innerHTML = `
            <div id="movie_player">
                <div class="ytp-caption-window-container">
                    <span id="caption">字幕が出ます。</span>
                </div>
            </div>
        `;
        const caption = document.getElementById('caption')!;
        const mutation = {
            type: 'childList',
            target: caption,
            addedNodes: Array.from(caption.childNodes),
            removedNodes: [],
        } as unknown as MutationRecord;

        expect(mutationMayContainJapaneseText(mutation)).toBe(true);
    });

    it('detects newly streamed YouTube feed text for visible rescans', () => {
        const card = document.createElement('ytd-rich-item-renderer');
        card.innerHTML = '<a id="video-title-link" href="/watch?v=next">新しい日本語動画</a>';
        const mutation = {
            type: 'childList',
            target: document.body,
            addedNodes: [card],
            removedNodes: [],
        } as unknown as MutationRecord;

        expect(mutationMayContainJapaneseText(mutation)).toBe(true);
    });

    it('does not recreate JPDB page addons for attribute-only JPDB mutations', () => {
        const result = document.createElement('div');
        result.className = 'result vocabulary';
        result.textContent = '今日は本を読む';
        const mutation = {
            type: 'attributes',
            attributeName: 'class',
            target: result,
            addedNodes: [],
            removedNodes: [],
        } as unknown as MutationRecord;

        expect(mutationMayContainJapaneseText(mutation)).toBe(false);
        expect(mutationMayAffectJpdbPageEnhancements(mutation)).toBe(false);
    });

    it('recognizes host text restorations after reader-word rendering as churn', () => {
        document.body.innerHTML = '<yt-attributed-string id="content-text">先生いつもありがとうございました。</yt-attributed-string>';
        const [target] = collectFragmentTextTargetsIn(document.body, 10, false, '', { allowUiText: true });
        applyTokensToScanTarget(target, [{
            card: { ...card, cardState: ['known'], spelling: '先生', reading: 'せんせい' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'せんせい', start: 0, end: 2, length: 2 }],
            pitchClass: '',
            sentence: '先生いつもありがとうございました。',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const host = document.querySelector<HTMLElement>('#content-text')!;
        const removedNodes = Array.from(host.childNodes);
        host.textContent = '先生いつもありがとうございました。';
        const mutation = {
            type: 'childList',
            target: host,
            addedNodes: Array.from(host.childNodes),
            removedNodes,
        } as unknown as MutationRecord;

        expect(mutationMayContainJapaneseText(mutation)).toBe(true);
        expect(mutationLooksLikeReaderRenderRejection(mutation)).toBe(true);
        expect(readerRenderRejectionRescanDelay(mutation)).toBeGreaterThan(0);
    });

    it('repairs damaged reader ruby when the host leaves only furigana behind', () => {
        document.body.innerHTML = '<yt-attributed-string id="content-text">質や正確性にはばらつきがあります。</yt-attributed-string>';
        const [target] = collectFragmentTextTargetsIn(document.body, 10, false, '', { allowUiText: true });
        applyTokensToScanTarget(target, [{
            card: { ...card, cardState: ['known'], spelling: '質', reading: 'しつ' },
            start: 0,
            end: 1,
            length: 1,
            rubies: [{ text: 'しつ', start: 0, end: 1, length: 1 }],
            pitchClass: '',
            sentence: '質や正確性にはばらつきがあります。',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const host = document.querySelector<HTMLElement>('#content-text')!;
        const word = host.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const rubyBase = word.querySelector<HTMLElement>('.jpdb-reader-ruby-base')!;
        const removedNodes = [rubyBase.firstChild!];
        rubyBase.textContent = '';
        const mutation = {
            type: 'childList',
            target: rubyBase,
            addedNodes: [],
            removedNodes,
        } as unknown as MutationRecord;

        expect(mutationLooksLikeReaderRenderRejection(mutation)).toBe(true);
        expect(readerRenderRejectionRescanDelay(mutation)).toBeGreaterThan(0);
        expect(host.textContent).toBe('質や正確性にはばらつきがあります。');
    });

    it('refreshes JPDB page addons for target visibility changes', () => {
        const answer = document.createElement('div');
        answer.className = 'answer';
        answer.textContent = '答えは今日です。';
        const mutation = {
            type: 'attributes',
            attributeName: 'hidden',
            target: answer,
            addedNodes: [],
            removedNodes: [],
        } as unknown as MutationRecord;

        expect(mutationMayAffectJpdbPageEnhancements(mutation)).toBe(true);
    });

    it('refreshes JPDB page addons when result content is added', () => {
        const result = document.createElement('div');
        result.className = 'result vocabulary';
        result.innerHTML = '<div class="subsection-meanings">today</div>';
        const mutation = {
            type: 'childList',
            target: document.body,
            addedNodes: [result],
            removedNodes: [],
        } as unknown as MutationRecord;

        expect(mutationMayAffectJpdbPageEnhancements(mutation)).toBe(true);
    });

    it('ignores Immersion Kit subtree changes on JPDB pages', () => {
        document.body.innerHTML = `
            <div class="result vocabulary">
                <div class="subsection-meanings">today</div>
                <div class="subsection-immersion-kit">
                    <div class="examples">Loading examples...</div>
                </div>
            </div>
        `;
        const target = document.querySelector('.subsection-immersion-kit .examples')!;
        const example = document.createElement('div');
        example.textContent = '今日は忙しいです。';
        const mutation = {
            type: 'childList',
            target,
            addedNodes: [example],
            removedNodes: [],
        } as unknown as MutationRecord;

        expect(mutationMayAffectJpdbPageEnhancements(mutation)).toBe(false);
    });

    it('does not refresh JPDB page addons when a Yomu popover is added to body', () => {
        document.body.innerHTML = `
            <div class="result vocabulary">
                <div class="subsection-meanings">today</div>
            </div>
        `;
        const popover = document.createElement('div');
        popover.dataset.jpdbReaderRoot = 'true';
        popover.className = 'jpdb-reader-popover';
        popover.textContent = '今日';
        const mutation = {
            type: 'childList',
            target: document.body,
            addedNodes: [popover],
            removedNodes: [],
        } as unknown as MutationRecord;

        expect(mutationMayAffectJpdbPageEnhancements(mutation)).toBe(false);
    });

    it('ports the supported site parser list from anki-jpdb.reader, including the newer NHK host', () => {
        expect(SITE_PARSER_PROFILES.map(profile => profile.id)).toEqual(expect.arrayContaining([
            'jpdb-parser',
            'jisho-parser',
            'jiten-parser',
            'weblio-parser',
            'kotobank-parser',
            'takoboto-parser',
            'wiktionary-ja-parser',
            'luna-translator-parser',
            'texthooker-parser',
            'exstatic-parser',
            'readwok-parser',
            'ttsu-parser',
            'youtube-comments-parser',
            'mokuro-parser',
            'wikipedia-parser',
            'satori-reader-parser',
            'nhk-parser',
            'bunpro-parser',
            'asbplayer-parser',
        ]));
        expect(getMatchingSiteParsers('https://news.web.nhk/news/easy/ne2026050812537/ne2026050812537.html').map(profile => profile.id))
            .toContain('nhk-parser');
        expect(getMatchingSiteParsers('file:///Users/me/mokuro/book/index.html').map(profile => profile.id))
            .toContain('mokuro-parser');
        expect(getMatchingSiteParsers('https://jisho.org/search/%E8%AA%AD%E3%82%80').map(profile => profile.id))
            .toContain('jisho-parser');
        expect(getMatchingSiteParsers('https://jiten.moe/parse?text=%E8%AA%AD%E3%82%80').map(profile => profile.id))
            .toContain('jiten-parser');
        expect(getMatchingSiteParsers('https://www.weblio.jp/content/%E8%AA%AD%E3%82%80').map(profile => profile.id))
            .toContain('weblio-parser');
        expect(getMatchingSiteParsers('https://dictionary.goo.ne.jp/srch/all/%E8%AA%AD%E3%82%80/m0u/').map(profile => profile.id))
            .not.toContain('goo-dictionary-parser');
        expect(getMatchingSiteParsers('https://kotobank.jp/word/%E8%AA%AD%E3%82%80').map(profile => profile.id))
            .toContain('kotobank-parser');
        expect(getMatchingSiteParsers('https://takoboto.jp/?q=%E8%AA%AD%E3%82%80').map(profile => profile.id))
            .toContain('takoboto-parser');
        expect(getMatchingSiteParsers('https://ja.wiktionary.org/wiki/%E8%AA%AD%E3%82%80').map(profile => profile.id))
            .toContain('wiktionary-ja-parser');
        expect(getMatchingSiteParsers('https://en.wiktionary.org/wiki/%E8%AA%AD%E3%82%80').map(profile => profile.id))
            .not.toContain('wiktionary-ja-parser');
        expect(getMatchingSiteParsers('https://www.youtube.com/results?search_query=%E6%97%A5%E6%9C%AC%E8%AA%9E').map(profile => profile.id))
            .toContain('youtube-comments-parser');
        expect(getMatchingSiteParsers('https://m.youtube.com/').map(profile => profile.id))
            .toContain('youtube-comments-parser');
        expect(getMatchingSiteParsers('https://consent.youtube.com/d?hl=ja').map(profile => profile.id))
            .not.toContain('youtube-comments-parser');
    });

    it('uses viewport-bounded, continuable discovery for the main YouTube surface', () => {
        const profile = SITE_PARSER_PROFILES.find(candidate => candidate.id === 'youtube-comments-parser');
        expect(profile).toBeTruthy();
        expect(profile?.visibleOnly).toBe(true);
        expect(profile?.singlePassScan).not.toBe(true);
    });

    it('scans YouTube watch titles, descriptions, and comments with JPDB ruby and pitch', () => {
        const targets = collectYouTubeWatchTargets(`
            <main>
            <ytd-watch-metadata>
                <h1><yt-formatted-string title="新卒エンジニア、仕事終わりにプログラミング勉強をする！！">新卒エンジニア、仕事終わりにプログラミング勉強をする！！</yt-formatted-string></h1>
                <div class="metadata-row">118,245 回視聴 2 時間前 チャンネル登録</div>
                <div id="description">
                    <span>118,245 回視聴 2 時間前 チャンネル登録</span>
                    <div id="description-inline-expander">
                        <yt-attributed-string id="attributed-snippet-text">Webアプリ開発を目指して、日本語で勉強中の新卒エンジニアです！</yt-attributed-string>
                    </div>
                </div>
            </ytd-watch-metadata>
            </main>
            <ytd-comment-view-model>
                <yt-attributed-string id="content-text">今夜も配信見なかったごめんね。</yt-attributed-string>
            </ytd-comment-view-model>
        `);

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
            '新卒エンジニア、仕事終わりにプログラミング勉強をする！！',
            'Webアプリ開発を目指して、日本語で勉強中の新卒エンジニアです！',
            '今夜も配信見なかったごめんね。',
        ]));
        // Watch metadata chrome (view counts, subscribe labels) is no longer
        // dropped: the residual pass collects it as a passive non-destructive
        // target so every visible Japanese surface gets decoration.
        const metadataRow = targets.find(target => /回視聴|チャンネル登録/u.test(target.text));
        expect(metadataRow).toBeTruthy();
        expect(metadataRow!.passiveInteraction).toBe(true);
        expect(metadataRow!.nonDestructive).toBe(true);
        expect(targets.some(isContinuableActiveTarget)).toBe(true);

        const title = targets.find(target => target.text === '新卒エンジニア、仕事終わりにプログラミング勉強をする！！');
        const description = targets.find(target => target.text.startsWith('Webアプリ開発'));
        expect(title).toBeTruthy();
        expect(description).toBeTruthy();
        expect(title).toMatchObject({ nonDestructive: true });
        expect(description).toMatchObject({ nonDestructive: true });
        applyTokensToScanTarget(title!, [{
            card: { ...card, cardState: ['known'], spelling: '新卒', reading: 'しんそつ', source: 'jpdb' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'しんそつ', start: 0, end: 2, length: 2 }],
            pitchClass: 'heiban',
            sentence: '新卒エンジニア、仕事終わりにプログラミング勉強をする！！',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        applyTokensToScanTarget(description!, [{
            card: { ...card, cardState: ['known'], spelling: 'アプリ', reading: 'アプリ' },
            start: 3,
            end: 6,
            length: 3,
            rubies: [],
            pitchClass: '',
            sentence: 'Webアプリ開発を目指して、日本語で勉強中の新卒エンジニアです！',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const titleHost = document.querySelector<HTMLElement>('ytd-watch-metadata h1 yt-formatted-string')!;
        expect(hasDirectTextNode(
            titleHost,
            '新卒エンジニア、仕事終わりにプログラミング勉強をする！！',
        )).toBe(true);
        expect(titleHost.querySelectorAll('.jpdb-reader-text-mirror')).toHaveLength(1);
        const titleWord = document.querySelector<HTMLElement>('ytd-watch-metadata h1 .jpdb-reader-word')!;
        expect(readerWordSurfaceText(titleWord)).toBe('新卒');
        expect(renderedWordPrivateValue(titleWord, 'cardSource')).toBe('jpdb');
        expect(titleWord.dataset.cardSource).toBeUndefined();
        expectElementText(titleWord, 'rt, .jpdb-reader-detached-furi', 'しんそつ');
        expectRenderedPitchWord(titleWord, 'heiban');
        applyTokensToScanTarget(title!, [{
            card: { ...card, cardState: ['known'], spelling: '新卒', reading: 'しんそつ', source: 'jpdb' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'しんそつ', start: 0, end: 2, length: 2 }],
            pitchClass: 'heiban',
            sentence: '新卒エンジニア、仕事終わりにプログラミング勉強をする！！',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        expect(titleHost.querySelectorAll('.jpdb-reader-text-mirror')).toHaveLength(1);
        expect(titleHost.querySelectorAll('.jpdb-reader-word')).toHaveLength(1);
        expect(document.querySelector('.jpdb-reader-word .jpdb-reader-word')).toBeNull();
        expect(document.querySelector('ruby ruby')).toBeNull();
        expect(Array.from(document.querySelectorAll<HTMLElement>('ytd-watch-metadata .jpdb-reader-word'))
            .some(word => readerWordSurfaceText(word) === '視聴')).toBe(false);
        expectElementText(document, 'ytd-watch-metadata #description-inline-expander .jpdb-reader-word.jpdb-known', 'アプリ');
    });

    it('keeps non-destructive YouTube mirrors visible until native title rerenders are rescanned', async () => {
        const targets = collectYouTubeWatchTargets(`
            <ytd-watch-metadata>
                <h1><yt-formatted-string>日本語タイトルを読む</yt-formatted-string></h1>
            </ytd-watch-metadata>
        `);
        const title = targets.find(target => target.text === '日本語タイトルを読む')!;
        expect(title).toMatchObject({ nonDestructive: true });

        applyTokensToScanTarget(title, [{
            card: { ...card, cardState: ['known'], spelling: '日本語', reading: 'にほんご', source: 'jpdb' },
            start: 0,
            end: 3,
            length: 3,
            rubies: [{ text: 'にほんご', start: 0, end: 3, length: 3 }],
            pitchClass: 'heiban',
            sentence: '日本語タイトルを読む',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const titleHost = document.querySelector<HTMLElement>('yt-formatted-string')!;
        const staleEvents: Event[] = [];
        const recordStaleEvent = (event: Event) => staleEvents.push(event);
        document.addEventListener('jpdb-reader-text-mirror-stale', recordStaleEvent);
        expect(titleHost.querySelectorAll('.jpdb-reader-text-mirror')).toHaveLength(1);
        expect(titleHost.style.getPropertyValue('visibility')).toBe('');

        titleHost.firstChild!.textContent = '更新後の日本語タイトル';
        await new Promise(resolve => setTimeout(resolve, 0));
        document.removeEventListener('jpdb-reader-text-mirror-stale', recordStaleEvent);

        expect(staleEvents).toHaveLength(1);
        expect(titleHost.querySelectorAll('.jpdb-reader-text-mirror')).toHaveLength(1);
        expect(titleHost.style.getPropertyValue('visibility')).toBe('');
        expect(titleHost.firstChild?.textContent).toBe('更新後の日本語タイトル');
        expect(readerWordSurfaceText(titleHost.querySelector<HTMLElement>('.jpdb-reader-word')!)).toBe('日本語');

        const rectSpy = mockElementBoundingClientRect({ width: 1000, height: 240 });
        let updatedTitle: ScanTextTarget | undefined;
        try {
            updatedTitle = collectScanTargets(10, YOUTUBE_WATCH_TEST_URL)
                .find(target => target.text === '更新後の日本語タイトル');
        } finally {
            rectSpy.mockRestore();
        }
        expect(updatedTitle).toBeTruthy();
        applyTokensToScanTarget(updatedTitle!, [{
            card: { ...card, cardState: ['known'], spelling: '更新', reading: 'こうしん', source: 'jpdb' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'こうしん', start: 0, end: 2, length: 2 }],
            pitchClass: 'heiban',
            sentence: '更新後の日本語タイトル',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        expect(titleHost.querySelectorAll('.jpdb-reader-text-mirror')).toHaveLength(1);
        expect(titleHost.querySelectorAll('.jpdb-reader-word')).toHaveLength(1);
        expect(readerWordSurfaceText(titleHost.querySelector<HTMLElement>('.jpdb-reader-word')!)).toBe('更新');
        expect(document.querySelector('.jpdb-reader-word .jpdb-reader-word')).toBeNull();
        expect(document.querySelector('ruby ruby')).toBeNull();
    });

    it('uses generic discovery plus frequent rescans on YouTube', () => {
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/watch?v=abc123',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
        });

        try {
            expect(allowsGenericVisibleAutoScan()).toBe(true);
            expect(allowsFrequentVisibleAutoScan()).toBe(true);
            expect(visibleAutoScanMutationDelay()).toBe(320);
            expect(visibleAutoScanInitialDelay()).toBe(220);
        } finally {
            vi.unstubAllGlobals();
        }

        vi.stubGlobal('location', {
            href: 'https://news.web.nhk/news/easy/example.html',
            origin: 'https://news.web.nhk',
            hostname: 'news.web.nhk',
        });

        try {
            expect(allowsFrequentVisibleAutoScan()).toBe(true);
            expect(visibleAutoScanMutationDelay()).toBe(450);
            expect(visibleAutoScanInitialDelay()).toBe(600);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('scans mobile YouTube titles and watch controls with ruby-capable targets', () => {
        const targets = collectYouTubeTargets(`
            <ytm-watch-metadata>
                <ytm-slim-video-metadata-section-renderer>
                    <h1 id="title">日本語タイトル</h1>
                    <div class="slim-video-metadata-info" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                        52,551回視聴 2026/06/12
                    </div>
                    <ytm-button-renderer>
                        <button><span>質問する</span></button>
                    </ytm-button-renderer>
                </ytm-slim-video-metadata-section-renderer>
                <ytm-expandable-video-description-body-renderer>
                    <p>説明文です</p>
                    <ytm-video-description-transcript-section-renderer>
                        <button class="yt-spec-button-shape-next">文字起こしを表示</button>
                    </ytm-video-description-transcript-section-renderer>
                </ytm-expandable-video-description-body-renderer>
            </ytm-watch-metadata>
            <ytm-pivot-bar-renderer>
                <ytm-pivot-bar-item-renderer><span>登録</span></ytm-pivot-bar-item-renderer>
            </ytm-pivot-bar-renderer>
            <ytm-comment-renderer>
                <yt-attributed-string id="content-text">先生いつも配信ありがとうございました。</yt-attributed-string>
                <span class="more-button" slot="more-button">続きを読む</span>
            </ytm-comment-renderer>
        `, 'https://m.youtube.com/watch?v=TAorfFcb8_g', undefined);

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
            '日本語タイトル',
            '説明文です',
            '質問する',
            '文字起こしを表示',
            '登録',
            '先生いつも配信ありがとうございました。',
            '続きを読む',
        ]));

        const title = targets.find(target => target.text === '日本語タイトル')!;
        const ask = targets.find(target => target.text === '質問する')!;
        const transcript = targets.find(target => target.text === '文字起こしを表示')!;
        const nav = targets.find(target => target.text === '登録')!;
        const comment = targets.find(target => target.text === '先生いつも配信ありがとうございました。')!;
        const more = targets.find(target => target.text === '続きを読む')!;
        expect(ask).toMatchObject({ passiveInteraction: true, nonDestructive: true });
        expect(transcript).toMatchObject({ passiveInteraction: true, nonDestructive: true });
        expect(nav).toMatchObject({ passiveInteraction: true, nonDestructive: true });
        expectActiveNonDestructiveTarget(comment);
        expect(more).toMatchObject({ passiveInteraction: true, nonDestructive: true });
        applyTokensToScanTarget(title, [{
            card: { ...card, cardState: ['known'], spelling: '日本語', reading: 'にほんご', source: 'jpdb' },
            start: 0,
            end: 3,
            length: 3,
            rubies: [{ text: 'にほんご', start: 0, end: 3, length: 3 }],
            pitchClass: 'heiban',
            sentence: '日本語タイトル',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        applyTokensToScanTarget(ask, [{
            card: { ...card, cardState: ['known'], spelling: '質問', reading: 'しつもん', source: 'jpdb' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'しつもん', start: 0, end: 2, length: 2 }],
            pitchClass: 'heiban',
            sentence: '質問する',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        applyTokensToScanTarget(transcript, [{
            card: { ...card, cardState: ['known'], spelling: '文字', reading: 'もじ', source: 'jpdb' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'もじ', start: 0, end: 2, length: 2 }],
            pitchClass: 'heiban',
            sentence: '文字起こしを表示',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        applyTokensToScanTarget(nav, [{
            card: { ...card, cardState: ['known'], spelling: '登録', reading: 'とうろく', source: 'jpdb' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'とうろく', start: 0, end: 2, length: 2 }],
            pitchClass: 'heiban',
            sentence: '登録',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        applyTokensToScanTarget(comment, [{
            card: { ...card, cardState: ['known'], spelling: '配信', reading: 'はいしん', source: 'jpdb' },
            start: 5,
            end: 7,
            length: 2,
            rubies: [{ text: 'はいしん', start: 5, end: 7, length: 2 }],
            pitchClass: 'heiban',
            sentence: '先生いつも配信ありがとうございました。',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const titleWord = document.querySelector<HTMLElement>('ytm-slim-video-metadata-section-renderer h1 .jpdb-reader-word')!;
        expect(readerWordSurfaceText(titleWord)).toBe('日本語');
        expect(renderedWordPrivateValue(titleWord, 'cardSource')).toBe('jpdb');
        expect(titleWord.dataset.cardSource).toBeUndefined();
        expectElementText(titleWord, 'rt, .jpdb-reader-detached-furi', 'にほんご');
        expectRenderedPitchWord(titleWord, 'heiban');
        expect(document.querySelector('ytm-button-renderer .jpdb-reader-word rt')).toBeNull();
        expectElementText(document, 'ytm-button-renderer .jpdb-reader-detached-furi', 'しつもん');
        expect(document.querySelector('ytm-video-description-transcript-section-renderer .jpdb-reader-word rt')).toBeNull();
        expectElementText(document, 'ytm-video-description-transcript-section-renderer .jpdb-reader-detached-furi', 'もじ');
        expectElementText(document, 'ytm-pivot-bar-renderer .jpdb-reader-word rt, ytm-pivot-bar-renderer .jpdb-reader-detached-furi', 'とうろく');
        const commentHost = document.querySelector<HTMLElement>('ytm-comment-renderer #content-text')!;
        const commentMirror = readerTextMirrorForSource(commentHost)!;
        const commentWord = readerWordsForSource(commentHost)[0]!;
        expect(readerWordSurfaceText(commentWord)).toBe('配信');
        expectElementText(commentWord, 'rt, .jpdb-reader-detached-furi', 'はいしん');
        expectRenderedPitchWord(commentWord, 'heiban');
        expect(commentMirror).toBeTruthy();
        expect(commentHost.contains(commentMirror)).toBe(false);
        expect(document.querySelector('.slim-video-metadata-info .jpdb-reader-word')).toBeNull();
    });

    it('scans desktop YouTube guide navigation with ruby-capable targets', () => {
        const targets = collectYouTubeTargets(`
            <ytd-guide-renderer>
                <a id="endpoint" href="/feed/subscriptions"><span class="title">登録チャンネル</span></a>
            </ytd-guide-renderer>
            <ytd-mini-guide-renderer>
                <a id="endpoint" href="/"><span class="title">ホーム</span></a>
            </ytd-mini-guide-renderer>
        `, YOUTUBE_WATCH_TEST_URL, undefined);

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
            '登録チャンネル',
            'ホーム',
        ]));
        const subscriptions = targets.find(target => target.text === '登録チャンネル')!;
        const home = targets.find(target => target.text === 'ホーム')!;
        expect('parserId' in subscriptions && subscriptions.parserId).toMatch(/^youtube-(comments|watch-guide|chrome)-parser$/);
        expect('parserId' in home && home.parserId).toMatch(/^youtube-(comments|watch-guide|chrome)-parser$/);
        expect(subscriptions.suppressRuby).not.toBe(true);
        expect(home.suppressRuby).not.toBe(true);
    });

    it('scans YouTube comment action controls as passive hover targets while comment text remains active', () => {
        const targets = collectYouTubeWatchTargets(`
            <ytd-comment-view-model>
                <yt-attributed-string id="content-text">今夜も配信見なかったごめんね。</yt-attributed-string>
                <span class="more-button style-scope ytd-comment-view-model" slot="more-button">詳細</span>
                <ytd-tri-state-button-view-model class="translate-button style-scope ytd-comment-view-model" state="untoggled">
                    <tp-yt-paper-button noink class="style-scope ytd-tri-state-button-view-model" role="button" tabindex="0" aria-disabled="false">
                        英語に翻訳
                    </tp-yt-paper-button>
                </ytd-tri-state-button-view-model>
                <button type="button">
                    <yt-touch-feedback-shape aria-hidden="true"><div>押下中</div></yt-touch-feedback-shape>
                    <span>返信</span>
                </button>
            </ytd-comment-view-model>
        `);

        const comment = targets.find(target => target.text === '今夜も配信見なかったごめんね。');
        const more = targets.find(target => target.text === '詳細');
        const translate = targets.find(target => target.text === '英語に翻訳');
        const reply = targets.find(target => target.text === '返信');
        expect(comment).toBeTruthy();
        expect(more).toMatchObject({ passiveInteraction: true, nonDestructive: true });
        expect(translate).toMatchObject({ passiveInteraction: true, nonDestructive: true });
        expect(reply).toMatchObject({ passiveInteraction: true, nonDestructive: true });
        expect(targets.map(target => target.text)).not.toContain('押下中');
        expect('passiveInteraction' in comment! && comment.passiveInteraction).not.toBe(true);
        expect(comment).toMatchObject({ nonDestructive: true });
        expect('forceInlineRender' in comment! && comment.forceInlineRender).not.toBe(true);
        expect('suppressRepaintLoopMirror' in comment! && comment.suppressRepaintLoopMirror).not.toBe(true);

        applyTokensToScanTarget(comment!, [{
            card: { ...card, cardState: ['known'], spelling: '配信', reading: 'はいしん', source: 'jpdb' },
            start: 3,
            end: 5,
            length: 2,
            rubies: [{ text: 'はいしん', start: 3, end: 5, length: 2 }],
            pitchClass: 'heiban',
            sentence: '今夜も配信見なかったごめんね。',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        applyTokensToScanTarget(more!, [{
            card: { ...card, cardState: ['known'], spelling: '詳細', reading: 'しょうさい', source: 'jpdb' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'しょうさい', start: 0, end: 2, length: 2 }],
            pitchClass: 'heiban',
            sentence: '詳細',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        applyTokensToScanTarget(translate!, [{
            card: { ...card, cardState: ['known'], spelling: '英語', reading: 'えいご', source: 'jpdb' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'えいご', start: 0, end: 2, length: 2 }],
            pitchClass: 'heiban',
            sentence: '英語に翻訳',
        }, {
            card: { ...card, vid: card.vid + 1, sid: card.sid + 1, cardState: ['known'], spelling: '翻訳', reading: 'ほんやく', source: 'jpdb' },
            start: 3,
            end: 5,
            length: 2,
            rubies: [{ text: 'ほんやく', start: 3, end: 5, length: 2 }],
            pitchClass: 'heiban',
            sentence: '英語に翻訳',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        const commentHost = document.querySelector<HTMLElement>('#content-text')!;
        const commentMirror = readerTextMirrorForSource(commentHost)!;
        const commentWord = readerWordsForSource(commentHost)[0]!;
        expect(readerWordSurfaceText(commentWord)).toBe('配信');
        expect(commentWord.querySelector('rt, .jpdb-reader-detached-furi')?.textContent).toBe('はいしん');
        expectRenderedPitchWord(commentWord, 'heiban');
        expect(commentWord.dataset.jpdbReaderPassive).toBeUndefined();
        expect(commentWord.tabIndex).toBe(-1);
        expect(commentMirror).toBeTruthy();
        expect(commentHost.contains(commentMirror)).toBe(false);
        const moreWord = document.querySelector<HTMLElement>('.more-button .jpdb-reader-word')!;
        expect(readerWordSurfaceText(moreWord)).toBe('詳細');
        expect(moreWord.dataset.jpdbReaderPassive).toBe('true');
        const translateWords = Array.from(document.querySelectorAll<HTMLElement>('ytd-tri-state-button-view-model .jpdb-reader-word'));
        expect(translateWords.map(word => readerWordSurfaceText(word))).toEqual(['英語', '翻訳']);
        expect(translateWords.every(word => word.dataset.jpdbReaderPassive === 'true')).toBe(true);
        expect(document.querySelector('yt-touch-feedback-shape .jpdb-reader-word')).toBeNull();
    });

    it('scans long YouTube watch comment threads while keeping the video title scan target', () => {
        const targets = collectYouTubeTargets(`
            <ytd-watch-metadata>
                <h1><yt-formatted-string>日本語タイトル</yt-formatted-string></h1>
                <div id="description-inline-expander">
                    <yt-attributed-string id="attributed-snippet-text">概要文です</yt-attributed-string>
                </div>
            </ytd-watch-metadata>
            ${Array.from({ length: 120 }, (_, index) => `
                <ytd-comment-view-model>
                    <yt-attributed-string id="content-text">コメント${index}です</yt-attributed-string>
                </ytd-comment-view-model>
            `).join('')}
        `, YOUTUBE_WATCH_TEST_URL, undefined);

        expect(targets).toHaveLength(122);
        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
            '日本語タイトル',
            '概要文です',
        ]));
        expect(targets.map(target => target.text)).toContain('コメント119です');
    });

    it('scans Japanese YouTube live chat including chat UI controls', () => {
        const targets = collectYouTubeTargets(`
            <ytd-watch-metadata>
                <ytd-watch-info-text role="button"><span>226 人が</span><span>視聴中</span></ytd-watch-info-text>
            </ytd-watch-metadata>
            <yt-live-chat-app>
                <yt-live-chat-header-renderer>
                    <div id="primary-content"><span id="title">チャット</span></div>
                </yt-live-chat-header-renderer>
                <yt-live-chat-renderer>
                    <div id="chat-messages">
                        <yt-live-chat-viewer-engagement-message-renderer>
                            <yt-formatted-string id="message">会話に参加して、クリエイターや、このライブ配信を視聴している人たちと交流する。</yt-formatted-string>
                            <button aria-label="パネルを開く">パネルを開く</button>
                        </yt-live-chat-viewer-engagement-message-renderer>
                        <yt-live-chat-text-message-renderer>
                            <span id="author-name">先生</span>
                            <yt-formatted-string id="message">今日はライブで日本語を聞いています。</yt-formatted-string>
                            <button aria-label="返信">返信</button>
                        </yt-live-chat-text-message-renderer>
                    </div>
                </yt-live-chat-renderer>
            </yt-live-chat-app>
        `, YOUTUBE_WATCH_TEST_URL, undefined);

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
            '226 人が視聴中',
            'チャット',
            '会話に参加して、クリエイターや、このライブ配信を視聴している人たちと交流する。',
            '先生',
            '今日はライブで日本語を聞いています。',
        ]));
        expect(targets.some(target => target.parent.matches('yt-live-chat-renderer #chat-messages'))).toBe(false);
        expect(targets.map(target => target.text)).toContain('返信');
        expect(targets.map(target => target.text)).toContain('パネルを開く');

        const viewerCount = targets.find(target => target.text === '226 人が視聴中')!;
        const engagement = targets.find(target => target.text.startsWith('会話に参加して'))!;
        expect(viewerCount).toMatchObject({ nonDestructive: true });
        expect(engagement).toMatchObject({ nonDestructive: true });
        applyTokensToScanTarget(viewerCount, [{
            card: { ...card, cardState: ['known'], spelling: '視聴', reading: 'しちょう', source: 'jpdb' },
            start: 6,
            end: 8,
            length: 2,
            rubies: [{ text: 'しちょう', start: 6, end: 8, length: 2 }],
            pitchClass: 'heiban',
            sentence: '226 人が視聴中',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        applyTokensToScanTarget(engagement, [{
            card: { ...card, cardState: ['known'], spelling: '会話', reading: 'かいわ', source: 'jpdb' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'かいわ', start: 0, end: 2, length: 2 }],
            pitchClass: 'heiban',
            sentence: '会話に参加して、クリエイターや、このライブ配信を視聴している人たちと交流する。',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const viewerWord = document.querySelector<HTMLElement>('ytd-watch-info-text .jpdb-reader-text-mirror .jpdb-reader-word')!;
        const engagementHost = document.querySelector<HTMLElement>('yt-live-chat-viewer-engagement-message-renderer #message')!;
        const engagementMirror = readerTextMirrorForSource(engagementHost)!;
        const engagementWord = readerWordsForSource(engagementHost)[0]!;
        expect(document.querySelector('ytd-watch-info-text .jpdb-reader-text-mirror')).not.toBeNull();
        expect(readerWordSurfaceText(viewerWord)).toBe('視聴');
        // The viewer-count chip is a control (role="button"); its reading is
        // rendered through the detached channel so the chip is not resized.
        expect(viewerWord.querySelector('rt')).toBeNull();
        expect(document.querySelector('ytd-watch-info-text .jpdb-reader-detached-furi')?.textContent).toBe('しちょう');
        expectRenderedPitchWord(viewerWord, 'heiban');
        // The engagement message is reading content, so it keeps inline ruby.
        expect(readerWordSurfaceText(engagementWord)).toBe('会話');
        expect(engagementWord.querySelector('rt, .jpdb-reader-detached-furi')?.textContent).toBe('かいわ');
        expect(engagementHost.contains(engagementMirror)).toBe(false);
        expect(document.querySelector('yt-live-chat-viewer-engagement-message-renderer button .jpdb-reader-word')).toBeNull();
    });

    it('scans YouTube subscriber-only live-chat notices as separate ruby-capable rows', () => {
        const notice = 'チャンネル登録者のみモード。このチャンネルの登録期間が5分以上のユーザーからのメッセージが表示されます。';
        const targets = collectYouTubeTargets(`
            <yt-live-chat-app>
                <yt-live-chat-restricted-participation-renderer>
                    <yt-formatted-string id="message">チャンネル登<span>録者</span>のみモード。このチャンネルの登録期間が5分以上のユーザーからのメッセージが表示されます。</yt-formatted-string>
                    <span id="subtext" role="button">詳細</span>
                </yt-live-chat-restricted-participation-renderer>
            </yt-live-chat-app>
        `, YOUTUBE_WATCH_TEST_URL, undefined);

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
            notice,
            '詳細',
        ]));
        expect(targets.filter(target => target.text.includes('チャンネル登録者のみ'))).toHaveLength(1);
        const noticeTarget = targets.find(target => target.text === notice)!;
        const detailTarget = targets.find(target => target.text === '詳細')!;
        expect(noticeTarget).toMatchObject({ nonDestructive: true });
        expect(detailTarget).toMatchObject({ nonDestructive: true, passiveInteraction: true });
        expect('fragments' in noticeTarget ? noticeTarget.fragments.length : 0).toBeGreaterThan(1);

        applyTokensToScanTarget(noticeTarget, [{
            card: { ...card, cardState: ['known'], spelling: '登録者', reading: 'とうろくしゃ', source: 'jpdb' },
            start: notice.indexOf('登録者'),
            end: notice.indexOf('登録者') + '登録者'.length,
            length: '登録者'.length,
            rubies: [{ text: 'とうろくしゃ', start: notice.indexOf('登録者'), end: notice.indexOf('登録者') + '登録者'.length, length: '登録者'.length }],
            pitchClass: 'heiban',
            sentence: notice,
        }, {
            card: { ...card, vid: card.vid + 1, sid: card.sid + 1, cardState: ['known'], spelling: '期間', reading: 'きかん', source: 'jpdb' },
            start: notice.indexOf('期間'),
            end: notice.indexOf('期間') + '期間'.length,
            length: '期間'.length,
            rubies: [{ text: 'きかん', start: notice.indexOf('期間'), end: notice.indexOf('期間') + '期間'.length, length: '期間'.length }],
            pitchClass: 'heiban',
            sentence: notice,
        }, {
            card: { ...card, vid: card.vid + 2, sid: card.sid + 2, cardState: ['known'], spelling: '表示', reading: 'ひょうじ', source: 'jpdb' },
            start: notice.indexOf('表示'),
            end: notice.indexOf('表示') + '表示'.length,
            length: '表示'.length,
            rubies: [{ text: 'ひょうじ', start: notice.indexOf('表示'), end: notice.indexOf('表示') + '表示'.length, length: '表示'.length }],
            pitchClass: 'heiban',
            sentence: notice,
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        applyTokensToScanTarget(detailTarget, [{
            card: { ...card, cardState: ['known'], spelling: '詳細', reading: 'しょうさい', source: 'jpdb' },
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'しょうさい', start: 0, end: 2, length: 2 }],
            pitchClass: 'heiban',
            sentence: '詳細',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const noticeHost = document.querySelector<HTMLElement>('yt-live-chat-restricted-participation-renderer #message')!;
        const noticeMirror = readerTextMirrorForSource(noticeHost)!;
        const noticeWords = readerWordsForSource(noticeHost);
        expect(noticeWords.map(word => readerWordSurfaceText(word))).toEqual(['登録者', '期間', '表示']);
        expect(noticeWords.map(word => word.querySelector('rt, .jpdb-reader-detached-furi')?.textContent)).toEqual(['とうろくしゃ', 'きかん', 'ひょうじ']);
        expect(noticeHost.contains(noticeMirror)).toBe(false);
        expect(document.querySelectorAll('yt-live-chat-restricted-participation-renderer > .jpdb-reader-text-mirror')).toHaveLength(0);
        const detailWord = document.querySelector<HTMLElement>('yt-live-chat-restricted-participation-renderer #subtext .jpdb-reader-word')!;
        expect(readerWordSurfaceText(detailWord)).toBe('詳細');
        expect(detailWord.dataset.jpdbReaderPassive).toBe('true');
        // The 詳細 subtext is a control (role="button"): detached reading, no
        // inline ruby, so the notice row keeps its authored height.
        expect(detailWord.querySelector('rt')).toBeNull();
        expect(document.querySelector('yt-live-chat-restricted-participation-renderer #subtext .jpdb-reader-detached-furi')?.textContent).toBe('しょうさい');
    });

    it('uses YouTube watch-info aria labels instead of hidden rolling-number text', async () => {
        const targets = collectYouTubeTargets(`
            <ytd-watch-metadata>
                <ytd-watch-info-text role="button">
                    <div id="info-container">
                        <div id="view-count" aria-label="226 人が視聴中">
                            <yt-animated-rolling-number aria-hidden="true">
                                <animated-rolling-character>12345678901234567890123456789</animated-rolling-character>
                            </yt-animated-rolling-number>
                            <yt-formatted-string aria-hidden="true">人が視聴中</yt-formatted-string>
                        </div>
                        <div id="date-text" aria-label="35 分前にライブ配信開始">
                            <yt-animated-rolling-number aria-hidden="true">
                                <animated-rolling-character>12345678901234567890123456789</animated-rolling-character>
                            </yt-animated-rolling-number>
                            <yt-formatted-string aria-hidden="true">分前にライブ配信開始</yt-formatted-string>
                        </div>
                    </div>
                </ytd-watch-info-text>
            </ytd-watch-metadata>
        `, YOUTUBE_WATCH_TEST_URL, undefined);

        const watchInfo = targets.find(target => target.parent.matches('ytd-watch-info-text'))!;
        expect(watchInfo.text).toBe('226 人が視聴中 • 35 分前にライブ配信開始');
        expect(watchInfo.text).not.toContain('12345678901234567890123456789');

        const host = document.querySelector<HTMLElement>('ytd-watch-info-text')!;
        let staleEvents = 0;
        host.addEventListener(NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, () => staleEvents += 1);
        applyTokensToScanTarget(watchInfo, [{
            card: { ...card, cardState: ['known'], spelling: '視聴', reading: 'しちょう', source: 'jpdb' },
            start: 6,
            end: 8,
            length: 2,
            rubies: [{ text: 'しちょう', start: 6, end: 8, length: 2 }],
            pitchClass: 'heiban',
            sentence: '226 人が視聴中 • 35 分前にライブ配信開始',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        document.querySelector('animated-rolling-character')!.textContent = '98765432109876543210987654321';
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(staleEvents).toBe(0);
        expect(document.querySelectorAll('ytd-watch-info-text .jpdb-reader-text-mirror')).toHaveLength(1);
        expect(document.querySelector('ytd-watch-info-text .jpdb-reader-text-mirror')!.textContent).not.toContain('9876543210');
    });

    it('keeps YouTube channel and metadata mirrors narrow without annotating subscriber counts', () => {
        const targets = collectYouTubeWatchTargets(`
            <ytd-watch-metadata>
                <div id="owner">
                    <ytd-channel-name>
                        <yt-formatted-string id="text">にほんごのじかん | Japanese Comprehensible Input</yt-formatted-string>
                    </ytd-channel-name>
                    <yt-formatted-string id="owner-sub-count">チャンネル登録者数 2040人</yt-formatted-string>
                </div>
                <div id="metadata-line" class="ytContentMetadataViewModelMetadataRow">
                    <span class="yt-core-attributed-string ytAttributedStringHost">1 日前</span>
                </div>
            </ytd-watch-metadata>
        `);

        expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
            '1 日前',
        ]));
        expect(targets.some(target => target.text.includes('にほんごのじかん | Japanese Comprehensible Input'))).toBe(true);
        // Subscriber chrome is collected as a passive mirror target now — it
        // must ride its own target, never bleed into the channel-name text.
        const subCountTarget = targets.find(target => target.text.includes('チャンネル登録者数 2040人'));
        expect(subCountTarget).toMatchObject({ nonDestructive: true, passiveInteraction: true });

        const channel = targets.find(target => target.text.includes('にほんごのじかん | Japanese Comprehensible Input'))!;
        const metadataAge = targets.find(target => target.text === '1 日前')!;
        expect(channel).toMatchObject({ nonDestructive: true });
        expect(metadataAge).toMatchObject({ nonDestructive: true });

        const settings: ReaderSettings = { ...DEFAULT_SETTINGS, furiganaMode: 'all' };
        const channelToken: JPDBToken = {
            card: { ...card, cardState: ['known'], spelling: 'にほんご', reading: 'にほんご', source: 'jpdb' },
            start: 0,
            end: 4,
            length: 4,
            rubies: [],
            pitchClass: 'heiban',
            sentence: channel.text,
        };
        const ageToken: JPDBToken = {
            card: { ...card, cardState: ['known'], spelling: '日', reading: 'にち', source: 'jpdb' },
            start: 2,
            end: 3,
            length: 1,
            rubies: [{ text: 'にち', start: 2, end: 3, length: 1 }],
            pitchClass: 'heiban',
            sentence: '1 日前',
        };

        applyTokensToScanTarget(channel, [channelToken], settings);
        applyTokensToScanTarget(metadataAge, [ageToken], settings);
        applyTokensToScanTarget(channel, [channelToken], settings);
        applyTokensToScanTarget(metadataAge, [ageToken], settings);

        const ownerHost = document.querySelector<HTMLElement>('#owner')!;
        const channelHost = document.querySelector<HTMLElement>('ytd-channel-name yt-formatted-string')!;
        const subscriberHost = document.querySelector<HTMLElement>('#owner-sub-count')!;
        const metadataHost = document.querySelector<HTMLElement>('.ytAttributedStringHost')!;
        expect(ownerHost.textContent).toContain('にほんごのじかん | Japanese Comprehensible Input');
        expect(ownerHost.textContent).toContain('チャンネル登録者数 2040人');
        expect(ownerHost.querySelectorAll(':scope > .jpdb-reader-text-mirror')).toHaveLength(0);
        expect(channelHost.querySelectorAll('.jpdb-reader-text-mirror')).toHaveLength(1);
        expect(subscriberHost.querySelector('.jpdb-reader-word')).toBeNull();
        expect(metadataHost.querySelectorAll('.jpdb-reader-text-mirror')).toHaveLength(1);
        const channelWord = channelHost.querySelector<HTMLElement>('.jpdb-reader-text-mirror .jpdb-reader-word')!;
        const metadataWord = metadataHost.querySelector<HTMLElement>('.jpdb-reader-text-mirror .jpdb-reader-word')!;
        expect(readerWordSurfaceText(channelWord)).toBe('にほんご');
        expect(readerWordSurfaceText(metadataWord)).toBe('日');
        expectRenderedPitchWord(channelWord, 'heiban');
        expectRenderedPitchWord(metadataWord, 'heiban');
        expect(document.querySelector('.jpdb-reader-word .jpdb-reader-word')).toBeNull();
        expect(document.querySelector('ruby ruby')).toBeNull();
    });

});
