import { afterEach, describe, expect, it, vi } from 'vitest';

import { allowsGenericVisibleAutoScan, shouldAutoScanImageOcr } from '../../src/reader/app/main-helpers';
import {
    collectScanTargets,
    getMatchingSiteParsers,
    isBookWalkerReaderPage,
    isBookWalkerStorefrontPage,
} from '../../src/reader/app/site-parsers';
import { applyTokensToScanTarget } from '../../src/reader/dom/index';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';
import { isReaderRasterPage } from '../../src/reader/ocr/canvas-readers';

const BOOKWALKER_HOME_URL = 'https://bookwalker.jp/?srsltid=AfmBOopUErpf8ha1DqKVCveBWJDa_h95s78MnReCkPmS9WOVKOouIfFX';
const BOOKWALKER_WWW_HOME_URL = 'https://www.bookwalker.jp/';
const WORD_JOINER = '\u2060';

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
                .toEqual(['bookwalker-storefront']);
            expect(getMatchingSiteParsers(BOOKWALKER_WWW_HOME_URL).map(profile => profile.id))
                .toEqual(['bookwalker-storefront']);
            const expected = ['ストアトップ', 'ランキング', 'ログイン', '異世界漫画フェア', '今すぐ読む', '次へ', 'ジャンルで探す'];
            for (const url of [BOOKWALKER_HOME_URL, BOOKWALKER_WWW_HOME_URL]) {
                const targets = collectScanTargets(20, url);
                expect(targets.map(target => target.text)).toEqual(expected);
                expect(targets.every(target => 'parserId' in target && target.parserId === 'residual-visible-japanese-parser')).toBe(true);
                expect(targets.every(target => target.passiveInteraction)).toBe(true);
                const carouselHeading = targets.find(target => target.text === '異世界漫画フェア');
                expect(carouselHeading?.suppressRuby).toBeFalsy();
                expect(targets.every(target => target.nonDestructive !== true)).toBe(true);
            }
        } finally {
            restoreRects();
        }
    });

    it('keeps narrow storefront shelf titles lookupable without adding ruby height', () => {
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
                parserId: 'bookwalker-storefront',
                passiveInteraction: true,
            });
            expect(title?.suppressRuby).toBeFalsy();
            expect(title?.nonDestructive).not.toBe(true);
        } finally {
            restoreRects();
        }
    });

    it('keeps BookWalker product-page text native instead of hiding it behind mirrors', () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = `
            <header>
                <nav>
                    <a href="/read/">読み放題</a>
                    <a href="/novel/">小説・ビジネス</a>
                    <button type="button">カート</button>
                </nav>
            </header>
            <main>
                <section class="book-detail">
                    <h1 class="m-bookDetailTitle">あなた達それでも先生ですかっ！【期間限定無料】 1</h1>
                    <p class="m-bookDetailLead">2026年6月30日までの期間限定無料お試し版です。新語校の女子教員として使用されることになった旅館。</p>
                    <aside>
                        <a href="/cart/" class="cart-button">カートを見る</a>
                        <button type="button">無料会員登録</button>
                        <button type="button">シリーズ予約</button>
                    </aside>
                </section>
            </main>
        `;

        try {
            const expectedText = [
                '読み放題',
                '小説・ビジネス',
                'カート',
                'あなた達それでも先生ですかっ！【期間限定無料】 1',
                '2026年6月30日までの期間限定無料お試し版です。新語校の女子教員として使用されることになった旅館。',
                'カートを見る',
                '無料会員登録',
                'シリーズ予約',
            ];
            const targets = collectScanTargets(40, BOOKWALKER_HOME_URL);
            expect(targets.length).toBeGreaterThanOrEqual(expectedText.length);

            for (const target of targets) {
                const token = firstJapaneseToken(target.text);
                if (!token) continue;
                applyTokensToScanTarget(target, [token], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
            }

            const withoutFurigana = document.body.cloneNode(true) as HTMLElement;
            withoutFurigana.querySelectorAll('rt,rp,.jpdb-reader-furi').forEach(node => node.remove());
            const bodyText = normalizedRenderedText(withoutFurigana.textContent ?? '');
            for (const text of expectedText) {
                expect(bodyText).toContain(text);
            }
            expect(document.querySelector('.jpdb-reader-text-mirror')).toBeNull();
            expect(Array.from(document.querySelectorAll<HTMLElement>('[style]'))
                .filter(element => element.style.getPropertyValue('visibility') === 'hidden')).toEqual([]);
            // Content prose (title/lead) now keeps its furigana on product pages.
            expect(document.querySelector('.m-bookDetailLead rt,.m-bookDetailTitle rt')).not.toBeNull();
            expect(document.querySelectorAll('.jpdb-reader-passive-word').length).toBeGreaterThan(0);
        } finally {
            restoreRects();
        }
    });

    it('scans BookWalker reader metadata and keeps settings controls passive', () => {
        const restoreRects = mockVisibleElementRects();
        const readerUrl = 'https://viewer.bookwalker.jp/03/1/viewer.html';
        document.body.innerHTML = `
            <div id="viewer"><div id="renderer">
                <div id="viewport0" class="currentScreen"><canvas width="1200" height="1600"></canvas></div>
            </div></div>
            <header class="viewer-title-bar">
                <div class="bookTitleText">あなた達それでも先生ですかっ！【期間限定無料】</div>
                <div id="bookDescription">今日は静かな喫茶店で新しい本を読みました。</div>
            </header>
            <div class="settings-popover">
                <button type="button">ページ移動方向</button>
                <button type="button">横</button>
                <button type="button">縦</button>
                <label>タップ設定</label>
                <label><input type="checkbox">ページ送り方向を反転</label>
                <span>見開き表示</span>
                <p>見開きはページ移動方向を横にした時のみ有効になります</p>
            </div>
            <span id="pageSliderCounter">13/195</span>`;
        stubLocation(readerUrl);

        try {
            const targets = collectScanTargets(20, readerUrl);

            expect(isBookWalkerReaderPage()).toBe(true);
            expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
                'あなた達それでも先生ですかっ！【期間限定無料】',
                '今日は静かな喫茶店で新しい本を読みました。',
                'ページ移動方向',
                '横',
                '縦',
                'タップ設定',
                '見開き表示',
            ]));
            expect(targets.every(target => 'parserId' in target && target.parserId === 'bookwalker-reader')).toBe(true);

            const title = targets.find(target => target.text.includes('あなた達それでも先生ですかっ'))!;
            applyTokensToScanTarget(title, [bookWalkerTitleToken(title.text)], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
            const titleHost = document.querySelector<HTMLElement>('.bookTitleText')!;
            expect(titleHost.querySelector('ruby .jpdb-reader-ruby-base')?.textContent).toBe('達');
            expect(titleHost.querySelector('rt')?.textContent).toBe('たち');
            expect(titleHost.querySelector('.jpdb-reader-word')?.getAttribute('data-pitch-class')).toBe('heiban');

            const settingsTarget = targets.find(target => target.text === 'ページ移動方向')!;
            expect(settingsTarget).toMatchObject({
                suppressRuby: true,
                passiveInteraction: true,
            });
            applyTokensToScanTarget(settingsTarget, [firstJapaneseToken(settingsTarget.text)!], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
            expect(document.querySelector('.settings-popover ruby')).toBeNull();
            expect(document.querySelector('.settings-popover .jpdb-reader-passive-word')).not.toBeNull();
        } finally {
            restoreRects();
        }
    });

    it('keeps compact card-grid and positioned storefront titles passive with ruby allowed', () => {
        const restoreRects = mockVisibleElementRects();
        document.body.innerHTML = `
            <main>
                <section class="product-grid" style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));">
                    <article class="product-card">
                        <img alt="" src="/cover-a.jpg">
                        <h3 data-grid-title>日本語漫画フェア</h3>
                    </article>
                    <article class="product-card">
                        <img alt="" src="/cover-b.jpg">
                        <h3>英語タイトル</h3>
                    </article>
                </section>
                <aside class="sidebar-rail" style="position:absolute;right:0;top:0;width:220px;">
                    <article class="compact-card">
                        <img alt="" src="/banner.jpg">
                        <span data-positioned-title>今日のおすすめ漫画</span>
                    </article>
                </aside>
            </main>
        `;

        try {
            const targets = collectScanTargets(20, BOOKWALKER_HOME_URL);
            const gridTitle = targets.find(target => target.text === '日本語漫画フェア');
            const positionedTitle = targets.find(target => target.text === '今日のおすすめ漫画');

            expect(gridTitle).toMatchObject({
                parserId: 'residual-visible-japanese-parser',
                passiveInteraction: true,
            });
            expect(gridTitle?.suppressRuby).toBeFalsy();
            expect(positionedTitle).toMatchObject({
                parserId: 'residual-visible-japanese-parser',
                passiveInteraction: true,
            });
            expect(positionedTitle?.suppressRuby).toBeFalsy();
        } finally {
            restoreRects();
        }
    });

    it('keeps storefront product-gallery titles passive with ruby allowed through neutral wrappers', () => {
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
                passiveInteraction: true,
            });
            expect(title?.suppressRuby).toBeFalsy();
        } finally {
            restoreRects();
        }
    });

    it('keeps deeply wrapped live-gallery titles passive with ruby allowed', () => {
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
                passiveInteraction: true,
            });
            expect(title?.suppressRuby).toBeFalsy();
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
            .toEqual(['bookwalker-reader']);
        expect(isBookWalkerReaderPage(viewerUrl)).toBe(true);
        expect(isReaderRasterPage('viewer.bookwalker.jp')).toBe(true);
    });

    it('allows image OCR auto-scan on BookWalker reader canvases and Japanese storefront pages', () => {
        stubLocation(BOOKWALKER_HOME_URL);
        document.body.innerHTML = '<main><h1>本を探す</h1><img src="/cover.jpg" width="240" height="340"></main>';

        expect(isBookWalkerStorefrontPage()).toBe(true);
        expect(shouldAutoScanImageOcr(false)).toBe(false);
        expect(shouldAutoScanImageOcr(true)).toBe(true);

        stubLocation('https://viewer.bookwalker.jp/03/1/viewer.html?cty=2');
        document.body.innerHTML = `
            <div id="viewer"><div id="renderer">
                <div id="viewport0" class="currentScreen"><canvas width="1200" height="1600"></canvas></div>
            </div></div>
            <span id="pageSliderCounter">13/195</span>`;

        expect(isBookWalkerReaderPage()).toBe(true);
        expect(allowsGenericVisibleAutoScan()).toBe(false);
        expect(shouldAutoScanImageOcr(false)).toBe(true);
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
                const targets = collectScanTargets(20, url);
                expect(targets.map(target => target.text)).toEqual(expect.arrayContaining([
                    'ページ移動方向',
                    'タップ設定',
                    '見開き表示',
                ]));
                expect(targets.every(target => 'parserId' in target && target.parserId === 'bookwalker-reader')).toBe(true);
                expect(targets.every(target => target.suppressRuby)).toBe(true);
                expect(targets.every(target => target.passiveInteraction)).toBe(true);
            }
        } finally {
            restoreRects();
        }
    });

    it('keeps generic visible auto-scan on storefront pages and off reader viewers', () => {
        stubLocation(BOOKWALKER_HOME_URL);
        expect(allowsGenericVisibleAutoScan()).toBe(true);
        expect(isBookWalkerStorefrontPage()).toBe(true);
        expect(isBookWalkerReaderPage()).toBe(false);

        stubLocation(BOOKWALKER_WWW_HOME_URL);
        expect(allowsGenericVisibleAutoScan()).toBe(true);
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

function bookWalkerTitleToken(sentence: string): JPDBToken {
    const start = sentence.indexOf('達');
    return {
        card: bookWalkerCard(),
        start,
        end: start + 1,
        length: 1,
        rubies: [{ text: 'たち', start, end: start + 1, length: 1 }],
        pitchClass: 'heiban',
        sentence,
    };
}

function normalizedRenderedText(text: string): string {
    return text.split(WORD_JOINER).join('');
}

function firstJapaneseToken(sentence: string): JPDBToken | null {
    const match = /[一-龯ぁ-んァ-ヶー]{1,}/u.exec(sentence);
    if (!match || match.index === undefined) return null;
    const spelling = match[0].slice(0, Math.min(3, match[0].length));
    return {
        card: {
            vid: match.index + 1,
            sid: match.index + 1,
            rid: 0,
            spelling,
            reading: 'よむ',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'jpdb',
        },
        start: match.index,
        end: match.index + spelling.length,
        length: spelling.length,
        rubies: [{ text: 'よむ', start: match.index, end: match.index + spelling.length, length: spelling.length }],
        pitchClass: 'heiban',
        sentence,
    };
}

function bookWalkerCard(): JPDBCard {
    return {
        vid: 1,
        sid: 1,
        rid: 0,
        spelling: '達',
        reading: 'たち',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['new'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
    };
}
