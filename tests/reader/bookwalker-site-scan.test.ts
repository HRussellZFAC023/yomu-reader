import { afterEach, describe, expect, it, vi } from 'vitest';

import { allowsGenericVisibleAutoScan } from '../../src/reader/app/main-helpers';
import {
    collectScanTargets,
    getMatchingSiteParsers,
    isBookWalkerReaderPage,
    isBookWalkerStorefrontPage,
} from '../../src/reader/app/site-parsers';
import { isReaderRasterPage } from '../../src/reader/ocr/canvas-readers';

const BOOKWALKER_HOME_URL = 'https://bookwalker.jp/?srsltid=AfmBOopUErpf8ha1DqKVCveBWJDa_h95s78MnReCkPmS9WOVKOouIfFX';
const BOOKWALKER_WWW_HOME_URL = 'https://www.bookwalker.jp/';

afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
});

describe('BookWalker site scan boundaries', () => {
    it('collects storefront carousel and commerce chrome DOM text as passive residual targets', () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = `
            <header>
                <nav>
                    <a href="/top/">ストアトップ</a>
                    <a href="/ranking/">ランキング</a>
                    <button type="button">ログイン</button>
                </nav>
            </header>
            <main>
                <section class="top-carousel">
                    <a href="/de123/"><h2>異世界漫画フェア</h2><span>今すぐ読む</span></a>
                    <button type="button" aria-label="次のおすすめ">次へ</button>
                </section>
                <aside class="sidebar"><a href="/genre/">ジャンルで探す</a></aside>
            </main>
        `;

        try {
            expect(getMatchingSiteParsers(BOOKWALKER_HOME_URL).map(profile => profile.id))
                .toEqual(['bookwalker-storefront-no-dom-parser']);
            expect(getMatchingSiteParsers(BOOKWALKER_WWW_HOME_URL).map(profile => profile.id))
                .toEqual(['bookwalker-storefront-no-dom-parser']);
            const expected = ['ストアトップ', 'ランキング', 'ログイン', '異世界漫画フェア', '今すぐ読む', '次へ', 'ジャンルで探す'];
            for (const url of [BOOKWALKER_HOME_URL, BOOKWALKER_WWW_HOME_URL]) {
                const targets = collectScanTargets(20, url);
                expect(targets.map(target => target.text)).toEqual(expected);
                expect(targets.every(target => 'parserId' in target && target.parserId === 'residual-visible-japanese-parser')).toBe(true);
                expect(targets.every(target => target.passiveInteraction)).toBe(true);
                expect(targets.every(target => target.nonDestructive)).toBe(true);
            }
        } finally {
            restoreRects();
        }
    });

    it('marks narrow storefront shelf titles beside cover links as passive ruby-suppressed targets', () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = `
            <main>
                <section class="t-c-main-section">
                    <div class="t-c-grid-shelf --pc">
                        <div class="t-c-grid-shelf__item">
                            <article class="t-c-tile-card --free">
                                <div class="t-c-tile-card__main" style="display:flex;width:149px">
                                    <div class="t-c-book-cover-general">
                                        <a class="t-o-thumbnail" href="/dea4e6ab95/">
                                            <img alt="あなた達それでも先生ですかっ！【期間限定無料】 1" src="/cover.jpg">
                                        </a>
                                    </div>
                                    <h3 class="t-o-heading-book-title --heading3">
                                        <a class="t-o-heading-book-title__link --12" href="/dea4e6ab95/" style="display:flow-root;overflow:hidden;line-height:18px;height:36px">
                                            あなた達それでも先生ですかっ！【期間限定無料】 1
                                        </a>
                                    </h3>
                                </div>
                            </article>
                        </div>
                    </div>
                </section>
            </main>
        `;

        try {
            const targets = collectScanTargets(20, BOOKWALKER_HOME_URL);
            const title = targets.find(target => target.text.includes('あなた達それでも先生ですかっ'));

            expect(title).toBeTruthy();
            expect(title).toMatchObject({
                parserId: 'residual-visible-japanese-parser',
                suppressRuby: true,
                passiveInteraction: true,
                nonDestructive: true,
            });
        } finally {
            restoreRects();
        }
    });

    it('marks storefront product-gallery titles through neutral wrappers as passive ruby-suppressed targets', () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = `
            <main>
                <section class="product-gallery">
                    <article class="product-entry" style="width:160px">
                        <div class="media-shell">
                            <a class="cover-link" href="/dea4e6ab95/">
                                <img alt="あなた達それでも先生ですかっ！【期間限定無料】 1" src="/cover.jpg">
                            </a>
                        </div>
                        <div class="details-shell">
                            <p class="genre-badge">マンガ</p>
                            <h3 class="title-wrap">
                                <a class="title-link" href="/dea4e6ab95/" style="display:block;overflow:hidden;line-height:18px;height:36px;width:148px">
                                    あなた達それでも先生ですかっ！【期間限定無料】 1
                                </a>
                            </h3>
                            <p class="price-label">2冊無料</p>
                            <button type="button">無料で読む</button>
                        </div>
                    </article>
                </section>
            </main>
        `;

        try {
            const targets = collectScanTargets(20, BOOKWALKER_HOME_URL);
            const title = targets.find(target => target.text.includes('あなた達それでも先生ですかっ'));

            expect(title).toBeTruthy();
            expect(title).toMatchObject({
                parserId: 'residual-visible-japanese-parser',
                suppressRuby: true,
                passiveInteraction: true,
                nonDestructive: true,
            });
        } finally {
            restoreRects();
        }
    });

    it('marks deeply wrapped live-gallery titles as passive ruby-suppressed targets', () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = `
            <main>
                <section class="product-gallery">
                    <article>
                        <a class="cover-link" href="/dea4e6ab95/">
                            <img alt="あなた達それでも先生ですかっ！【期間限定無料】 1" src="/cover.jpg">
                        </a>
                        <div class="shell-a">
                            <div class="shell-b">
                                <div class="shell-c">
                                    <div class="shell-d">
                                        <h3>
                                            <a class="title-link" href="/dea4e6ab95/" style="display:block;width:148px">
                                                <span>あなた達それでも先生ですかっ！【期間限定無料】 1</span>
                                            </a>
                                        </h3>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </article>
                </section>
            </main>
        `;

        try {
            const targets = collectScanTargets(20, BOOKWALKER_HOME_URL);
            const title = targets.find(target => target.text.includes('あなた達それでも先生ですかっ'));

            expect(title).toBeTruthy();
            expect(title).toMatchObject({
                parserId: 'residual-visible-japanese-parser',
                suppressRuby: true,
                passiveInteraction: true,
                nonDestructive: true,
            });
        } finally {
            restoreRects();
        }
    });

    it('marks tall vertical storefront control labels as passive ruby-suppressed targets', () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = `
            <main>
                <button class="reader-mode" type="button" style="writing-mode:vertical-rl">縦書き</button>
            </main>
        `;
        const button = document.querySelector<HTMLElement>('button')!;
        button.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            width: 34,
            height: 220,
            top: 0,
            right: 34,
            bottom: 220,
            left: 0,
            toJSON: () => ({}),
        } as DOMRect);

        try {
            const targets = collectScanTargets(20, BOOKWALKER_HOME_URL);
            const control = targets.find(target => target.text.includes('縦書き'));

            expect(control).toBeTruthy();
            expect(control).toMatchObject({
                parserId: 'residual-visible-japanese-parser',
                suppressRuby: true,
                passiveInteraction: true,
                nonDestructive: true,
            });
        } finally {
            restoreRects();
        }
    });

    it('keeps the same generic DOM scan available away from BookWalker storefronts', () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = `
            <main>
                <article>
                    <h1>異世界漫画フェア</h1>
                    <p>今日は静かな喫茶店で新しい本を読みました。</p>
                </article>
            </main>
        `;

        try {
            expect(collectScanTargets(20, 'https://example.com/article').map(target => target.text))
                .toEqual(['異世界漫画フェア', '今日は静かな喫茶店で新しい本を読みました。']);
        } finally {
            restoreRects();
        }
    });

    it('leaves BookWalker viewer OCR classification untouched', () => {
        const viewerUrl = 'https://viewer.bookwalker.jp/03/1/viewer.html';

        expect(isBookWalkerStorefrontPage(viewerUrl)).toBe(false);
        expect(getMatchingSiteParsers(viewerUrl).map(profile => profile.id))
            .toEqual(['bookwalker-reader-no-dom-parser']);
        expect(isBookWalkerReaderPage(viewerUrl)).toBe(true);
        expect(isReaderRasterPage('viewer.bookwalker.jp')).toBe(true);
    });

    it('does not annotate BookWalker reader settings chrome as residual page text', () => {
        const restoreRects = mockVisibleElementRects();
        const readerUrls = [
            'https://viewer.bookwalker.jp/03/1/viewer.html',
            'https://bookwalker.jp/de_modes/',
        ];

        try {
            for (const url of readerUrls) {
                document.body.innerHTML = `
                    <div id="viewer"><div id="renderer">
                        <div id="viewport0" class="currentScreen"><canvas width="1200" height="1600"></canvas></div>
                    </div></div>
                    <div class="settings-popover">
                        <button type="button">ページ移動方向</button>
                        <label>タップ設定</label>
                        <span>見開き表示</span>
                    </div>
                    <span id="pageSliderCounter">13/195</span>`;
                stubLocation(url);

                expect(isBookWalkerReaderPage()).toBe(true);
                expect(isBookWalkerStorefrontPage()).toBe(false);
                expect(allowsGenericVisibleAutoScan()).toBe(false);
                expect(collectScanTargets(20, url)).toEqual([]);
            }
        } finally {
            restoreRects();
        }
    });

    it('disables generic visible auto-scan scheduling on BookWalker storefront and reader pages', () => {
        stubLocation(BOOKWALKER_HOME_URL);
        expect(allowsGenericVisibleAutoScan()).toBe(false);
        expect(isBookWalkerStorefrontPage()).toBe(true);
        expect(isBookWalkerReaderPage()).toBe(false);

        stubLocation(BOOKWALKER_WWW_HOME_URL);
        expect(allowsGenericVisibleAutoScan()).toBe(false);
        expect(isBookWalkerStorefrontPage()).toBe(true);
        expect(isBookWalkerReaderPage()).toBe(false);

        stubLocation('https://viewer.bookwalker.jp/03/1/viewer.html');
        expect(allowsGenericVisibleAutoScan()).toBe(false);
        expect(isBookWalkerStorefrontPage()).toBe(false);
        expect(isBookWalkerReaderPage()).toBe(true);
    });
});

function mockVisibleElementRects(): () => void {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = () => ({
        x: 0,
        y: 0,
        width: 180,
        height: 32,
        top: 0,
        right: 180,
        bottom: 32,
        left: 0,
        toJSON: () => ({}),
    } as DOMRect);
    return () => {
        HTMLElement.prototype.getBoundingClientRect = originalRect;
    };
}

function stubLocation(href: string): void {
    const url = new URL(href);
    vi.stubGlobal('location', {
        href: url.href,
        origin: url.origin,
        hostname: url.hostname,
        pathname: url.pathname,
        protocol: url.protocol,
    });
}
