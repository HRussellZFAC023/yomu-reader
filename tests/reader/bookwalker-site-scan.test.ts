import { afterEach, describe, expect, it, vi } from 'vitest';

import { allowsGenericVisibleAutoScan } from '../../src/reader/app/main-helpers';
import {
    collectScanTargets,
    getMatchingSiteParsers,
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
            .not.toContain('bookwalker-storefront-no-dom-parser');
        expect(isReaderRasterPage('viewer.bookwalker.jp')).toBe(true);
    });

    it('disables generic visible auto-scan scheduling on BookWalker storefront pages only', () => {
        stubLocation(BOOKWALKER_HOME_URL);
        expect(allowsGenericVisibleAutoScan()).toBe(false);
        expect(isBookWalkerStorefrontPage()).toBe(true);

        stubLocation(BOOKWALKER_WWW_HOME_URL);
        expect(allowsGenericVisibleAutoScan()).toBe(false);
        expect(isBookWalkerStorefrontPage()).toBe(true);

        stubLocation('https://viewer.bookwalker.jp/03/1/viewer.html');
        expect(allowsGenericVisibleAutoScan()).toBe(true);
        expect(isBookWalkerStorefrontPage()).toBe(false);
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
