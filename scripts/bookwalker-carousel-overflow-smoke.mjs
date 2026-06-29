#!/usr/bin/env node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const ARTIFACTS = path.join(ROOT, 'artifacts', 'yomu-reader');
const tempDir = mkdtempSync(path.join(tmpdir(), 'yomu-carousel-smoke-'));
const entryPath = path.join(tempDir, 'probe.ts');
const bundlePath = path.join(tempDir, 'probe.js');

mkdirSync(ARTIFACTS, { recursive: true });
writeFileSync(entryPath, `
    import { collectScanTargets } from '${path.join(ROOT, 'src/reader/app/site-parsers.ts')}';
    import { applyTokensToScanTarget } from '${path.join(ROOT, 'src/reader/dom/index.ts')}';
    import { DEFAULT_SETTINGS } from '${path.join(ROOT, 'src/reader/settings/index.ts')}';
    import type { JPDBToken } from '${path.join(ROOT, 'src/reader/app/types.ts')}';

    function token(sentence: string, spelling: string, reading: string, start: number, end: number): JPDBToken {
        return {
            card: {
                vid: -start - 1,
                sid: -start - 1,
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
            },
            start,
            end,
            length: end - start,
            rubies: [{ text: reading, start, end, length: end - start }],
            pitchClass: 'heiban',
            sentence,
        };
    }

    function firstJapaneseToken(sentence: string): JPDBToken | null {
        const match = /[一-龯ぁ-んァ-ヶー]{2,}/u.exec(sentence);
        if (!match || match.index === undefined) return null;
        const spelling = match[0].slice(0, Math.min(3, match[0].length));
        return token(sentence, spelling, 'にほんごのことば', match.index, match.index + spelling.length);
    }

    function rectMetric(element: HTMLElement | null) {
        const rect = element?.getBoundingClientRect();
        if (!rect) return null;
        return {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
        };
    }

    function rectMetrics(selector: string) {
        return Array.from(document.querySelectorAll<HTMLElement>(selector)).map(rectMetric);
    }

    function storefrontMetrics() {
        const root = document.querySelector<HTMLElement>('[data-bookwalker-storefront]');
        const viewport = document.querySelector<HTMLElement>('[data-carousel-viewport]');
        const track = document.querySelector<HTMLElement>('[data-carousel-track]');
        const title = document.querySelector<HTMLElement>('[data-bookwalker-title]');
        const viewportRect = viewport?.getBoundingClientRect();
        const titleRect = title?.getBoundingClientRect();
        const scoped = root ?? document.body;
        const inlineWordCount = Array.from(scoped.querySelectorAll<HTMLElement>('.jpdb-reader-word'))
            .filter(word => !word.closest('.jpdb-reader-text-mirror')).length;
        const overflowVisibleHosts = Array.from(scoped.querySelectorAll<HTMLElement>('[style]'))
            .filter(element => !element.matches('.jpdb-reader-text-mirror')
                && !element.closest('.jpdb-reader-text-mirror')
                && element.style.getPropertyValue('overflow') === 'visible').length;
        const hiddenNativeHosts = Array.from(scoped.querySelectorAll<HTMLElement>('[style]'))
            .filter(element => !element.matches('.jpdb-reader-text-mirror')
                && !element.closest('.jpdb-reader-text-mirror')
                && element.style.getPropertyValue('visibility') === 'hidden').length;
        return {
            carousel: {
                viewportClientWidth: viewport?.clientWidth ?? 0,
                viewportScrollWidth: viewport?.scrollWidth ?? 0,
                trackClientWidth: track?.clientWidth ?? 0,
                trackScrollWidth: track?.scrollWidth ?? 0,
                titleClientWidth: title?.clientWidth ?? 0,
                titleScrollWidth: title?.scrollWidth ?? 0,
                viewportRight: viewportRect?.right ?? 0,
                titleRight: titleRect?.right ?? 0,
            },
            layout: rectMetric(document.querySelector<HTMLElement>('[data-bookwalker-layout]')),
            grid: rectMetrics('[data-bookwalker-grid-item]'),
            titles: rectMetrics('[data-bookwalker-product-title]'),
            side: rectMetrics('[data-bookwalker-side-card]'),
            rubyCount: scoped.querySelectorAll('rt,.jpdb-reader-furi').length,
            passiveCount: scoped.querySelectorAll('.jpdb-reader-passive-word').length,
            passiveChromeHostCount: scoped.querySelectorAll('[data-jpdb-reader-passive-chrome="true"]').length,
            mirrorCount: scoped.querySelectorAll('.jpdb-reader-text-mirror').length,
            inlineWordCount,
            overflowVisibleHosts,
            hiddenNativeHosts,
            text: scoped.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
        };
    }

    function productGalleryMetrics() {
        const grid = document.querySelector<HTMLElement>('[data-product-gallery]');
        const card = document.querySelector<HTMLElement>('[data-product-card]');
        const title = document.querySelector<HTMLElement>('[data-product-title]');
        const cta = document.querySelector<HTMLElement>('[data-product-cta]');
        const titleRect = title?.getBoundingClientRect();
        const ctaRect = cta?.getBoundingClientRect();
        return {
            gridClientWidth: grid?.clientWidth ?? 0,
            gridScrollWidth: grid?.scrollWidth ?? 0,
            cardHeight: card?.getBoundingClientRect().height ?? 0,
            cardScrollHeight: card?.scrollHeight ?? 0,
            titleClientHeight: title?.clientHeight ?? 0,
            titleScrollHeight: title?.scrollHeight ?? 0,
            titleBottom: titleRect?.bottom ?? 0,
            ctaTop: ctaRect?.top ?? 0,
            rubyCount: document.querySelectorAll('[data-product-title] rt,.jpdb-reader-furi').length,
            passiveCount: document.querySelectorAll('[data-product-title] .jpdb-reader-passive-word').length,
            passiveChromeHostCount: document.querySelectorAll('[data-product-card] [data-jpdb-reader-passive-chrome="true"]').length,
        };
    }

    function readableScrollMetrics() {
        const prose = document.querySelector<HTMLElement>('[data-readable-scroll-prose]');
        return {
            rubyCount: prose?.querySelectorAll('rt,.jpdb-reader-furi').length ?? 0,
            passiveCount: prose?.querySelectorAll('.jpdb-reader-passive-word').length ?? 0,
        };
    }

    Object.assign(window, {
        runYomuBookwalkerStorefrontProbe() {
            const before = storefrontMetrics();
            const targets = collectScanTargets(80, 'https://bookwalker.jp/');
            let applied = 0;
            for (const target of targets) {
                const candidate = firstJapaneseToken(target.text);
                if (!candidate) continue;
                applyTokensToScanTarget(target, [candidate], {
                    ...DEFAULT_SETTINGS,
                    interfaceLanguage: 'en',
                    showFurigana: true,
                    furiganaMode: 'all',
                });
                applied += 1;
            }
            return {
                before,
                after: storefrontMetrics(),
                applied,
                targets: {
                    count: targets.length,
                    allStorefrontSafe: targets.every(target => 'parserId' in target && (
                        target.parserId === 'bookwalker-storefront-no-dom-parser'
                        || target.parserId === 'residual-visible-japanese-parser'
                    )),
                    allSuppressRuby: targets.every(target => target.suppressRuby === true),
                    allPassive: targets.every(target => target.passiveInteraction === true),
                    allNativeInline: targets.every(target => target.nonDestructive !== true),
                    sample: targets.slice(0, 8).map(target => ({
                        text: target.text,
                        suppressRuby: target.suppressRuby === true,
                        passiveInteraction: target.passiveInteraction === true,
                        nativeInline: target.nonDestructive !== true,
                        parserId: 'parserId' in target ? target.parserId : null,
                    })),
                },
            };
        },
        runYomuBookwalkerProductGalleryProbe() {
            const before = productGalleryMetrics();
            const sentence = 'あなた達それでも先生ですかっ！';
            const targets = collectScanTargets(20, 'https://bookwalker.jp/');
            const target = targets.find(candidate => candidate.text.includes(sentence));
            if (!target) throw new Error('BookWalker product-gallery title target was not collected.');
            applyTokensToScanTarget(target, [
                token(sentence, 'あなた達', 'あなたたち', 0, 4),
                token(sentence, '先生', 'せんせい', 8, 10),
            ], { ...DEFAULT_SETTINGS, interfaceLanguage: 'en', showFurigana: true, furiganaMode: 'all' });
            return {
                before,
                after: productGalleryMetrics(),
                target: {
                    text: target.text,
                    suppressRuby: target.suppressRuby === true,
                    passiveInteraction: target.passiveInteraction === true,
                    parserId: 'parserId' in target ? target.parserId : null,
                },
            };
        },
        runYomuReadableScrollProbe() {
            const sentence = '今日は新しい本を読みました。';
            const targets = collectScanTargets(20, 'https://example.jp/article');
            const target = targets.find(candidate => candidate.text.includes(sentence));
            if (!target) throw new Error('Readable scroll prose target was not collected.');
            applyTokensToScanTarget(target, [
                token(sentence, '今日', 'きょう', 0, 2),
                token(sentence, '新しい', 'あたらしい', 3, 6),
            ], { ...DEFAULT_SETTINGS, interfaceLanguage: 'en', showFurigana: true, furiganaMode: 'all' });
            return {
                after: readableScrollMetrics(),
                target: {
                    text: target.text,
                    suppressRuby: target.suppressRuby === true,
                    passiveInteraction: target.passiveInteraction === true,
                    parserId: 'parserId' in target ? target.parserId : null,
                },
            };
        },
    });
`);

try {
    await esbuild.build({
        entryPoints: [entryPath],
        outfile: bundlePath,
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: 'es2020',
        logLevel: 'silent',
    });

    const browser = await chromium.launch({ headless: true });
    try {
        const result = await runBrowserProbe(browser, bookwalkerStorefrontFixture(), 'runYomuBookwalkerStorefrontProbe', 'bookwalker-carousel-overflow-smoke.png');
        const forcedRuby = await runBrowserProbe(browser, bookwalkerStorefrontFixture({ forceRuby: true }), 'runYomuBookwalkerStorefrontProbe');
        const productGallery = await runBrowserProbe(browser, bookwalkerProductGalleryFixture(), 'runYomuBookwalkerProductGalleryProbe', 'bookwalker-product-gallery-overflow-smoke.png');
        const readableScroll = await runBrowserProbe(browser, readableScrollFixture(), 'runYomuReadableScrollProbe');

        assert(result.before.carousel.viewportScrollWidth <= result.before.carousel.viewportClientWidth + 2, 'fixture starts without carousel overflow', result);
        assert(result.targets.count >= 10, 'BookWalker fixture did not collect enough storefront targets', result);
        assert(result.targets.allStorefrontSafe, 'BookWalker storefront should use only storefront-safe target parsers', result);
        assert(result.targets.allSuppressRuby, 'BookWalker storefront targets should suppress ruby', result);
        assert(result.targets.allPassive, 'BookWalker storefront targets should be passive', result);
        assert(result.targets.allNativeInline, 'BookWalker storefront targets should keep native text visible instead of using mirrors', result);
        assert(result.applied >= 8, 'BookWalker storefront smoke did not annotate enough targets', result);
        assert(result.after.rubyCount === 0, 'BookWalker storefront rendered ruby in compact commerce layout', result);
        assert(result.after.passiveCount >= 8, 'BookWalker storefront words should still be lookupable as passive words', result);
        assert(result.after.passiveChromeHostCount >= 1, 'BookWalker storefront should mark compact media hosts as passive chrome', result);
        assert(result.after.mirrorCount === 0, 'BookWalker storefront should not hide native text behind text mirrors', result);
        assert(result.after.inlineWordCount >= 8, 'BookWalker storefront should render passive lookup words inline with native text', result);
        assert(result.after.hiddenNativeHosts === 0, 'BookWalker storefront should not hide native text hosts', result);
        assert(result.after.text.includes('無料会員登録はこちら'), 'BookWalker sidebar text disappeared after annotation', result);
        assert(result.after.text.includes('あなた達それでも先生ですかっ！【期間限定無料】 1'), 'BookWalker product title disappeared after annotation', result);
        assert(result.after.overflowVisibleHosts === 0, 'ruby-suppressed passive storefront words should not force host overflow visible', result);
        assert(result.after.carousel.viewportScrollWidth <= result.after.carousel.viewportClientWidth + 2, 'carousel overflowed after Yomu rendered words', result);
        assert(result.after.carousel.titleRight <= result.after.carousel.viewportRight + 2, 'carousel title painted outside the clipped viewport', result);
        assertStableRects(result.before.grid, result.after.grid, 'product grid item geometry changed', result);
        assertStableRects(result.before.titles, result.after.titles, 'product title geometry changed', result);
        assertStableRects(result.before.side, result.after.side, 'sidebar card geometry changed', result);
        assertStableRect(result.before.layout, result.after.layout, 'two-column layout geometry changed', result);

        assert(forcedRuby.after.rubyCount > 0, 'control fixture did not render forced ruby', forcedRuby);
        assert(
            forcedRuby.after.carousel.titleScrollWidth > forcedRuby.after.carousel.titleClientWidth + 2,
            'control fixture with forced ruby should demonstrate compact-title sizing pressure',
            forcedRuby,
        );

        assert(productGallery.target.suppressRuby, 'product gallery target should suppress ruby generically', productGallery);
        assert(productGallery.target.passiveInteraction, 'product gallery target should remain passive', productGallery);
        assert(productGallery.after.rubyCount === 0, 'product gallery rendered ruby in compact card text', productGallery);
        assert(productGallery.after.passiveCount >= 2, 'product gallery words should still be lookupable', productGallery);
        assert(productGallery.after.passiveChromeHostCount >= 1, 'product gallery should mark compact media hosts as passive chrome', productGallery);
        assert(productGallery.after.gridScrollWidth <= productGallery.after.gridClientWidth + 2, 'product gallery overflowed after Yomu rendered words', productGallery);
        assert(productGallery.after.titleScrollHeight <= productGallery.after.titleClientHeight + 2, 'product gallery title height expanded after annotation', productGallery);
        assert(productGallery.after.cardScrollHeight <= productGallery.after.cardHeight + 2, 'product gallery card height expanded after annotation', productGallery);
        assert(productGallery.after.titleBottom <= productGallery.after.ctaTop, 'product gallery title overlapped CTA after annotation', productGallery);

        assert(!readableScroll.target.suppressRuby, 'readable prose in a scroll/banner container should keep ruby', readableScroll);
        assert(!readableScroll.target.passiveInteraction, 'readable prose in a scroll/banner container should stay interactive', readableScroll);
        assert(readableScroll.after.rubyCount > 0, 'readable prose lost furigana in a scroll/banner container', readableScroll);

        console.log(JSON.stringify({ result, forcedRuby, productGallery, readableScroll }, null, 2));
        console.log('BookWalker carousel overflow smoke passed');
    } finally {
        await browser.close();
    }
} finally {
    rmSync(tempDir, { recursive: true, force: true });
}

async function runBrowserProbe(browser, html, probeName, screenshotName) {
    const page = await browser.newPage({ viewport: { width: 940, height: 760 } });
    try {
        await page.setContent(html, { waitUntil: 'domcontentloaded' });
        await page.addStyleTag({ content: readFileSync(path.join(ROOT, 'src/reader/styles/reader-words-ocr.css'), 'utf8') });
        await page.addScriptTag({ path: bundlePath });
        const result = await page.evaluate(name => window[name](), probeName);
        if (screenshotName) await page.screenshot({ path: path.join(ARTIFACTS, screenshotName), fullPage: true });
        return result;
    } finally {
        await page.close();
    }
}

function assert(condition, message, details) {
    if (condition) return;
    const error = new Error(message);
    error.details = details;
    console.error(JSON.stringify(details, null, 2));
    throw error;
}

function assertStableRect(before, after, message, details) {
    assert(before && after, message, details);
    const maxDelta = Math.max(
        Math.abs(before.left - after.left),
        Math.abs(before.top - after.top),
        Math.abs(before.width - after.width),
        Math.abs(before.height - after.height),
        Math.abs(before.right - after.right),
        Math.abs(before.bottom - after.bottom),
    );
    assert(maxDelta <= 1, `${message}: max delta ${maxDelta}`, details);
}

function assertStableRects(before, after, message, details) {
    assert(before.length === after.length, `${message}: element count changed`, details);
    before.forEach((rect, index) => assertStableRect(rect, after[index], `${message} at ${index}`, details));
}

function bookwalkerStorefrontFixture({ forceRuby = false } = {}) {
    const forceRubyAttribute = forceRuby ? ' data-yomu-furigana-mode="all"' : '';
    return `
        <!doctype html>
        <html lang="ja">
        <head>
            <meta charset="utf-8">
            <style>
                * { box-sizing: border-box; }
                body { margin: 0; font-family: system-ui, sans-serif; color: #172033; background: #fff; }
                .bookwalker-home { width: 880px; margin: 24px auto 48px; }
                .global-nav {
                    display: flex;
                    gap: 18px;
                    align-items: center;
                    height: 42px;
                    overflow: hidden;
                    border-bottom: 1px solid #d8dee8;
                }
                .global-nav a,
                .global-nav button {
                    font: inherit;
                    color: inherit;
                    background: transparent;
                    border: 0;
                    text-decoration: none;
                    white-space: nowrap;
                }
                .image-carousel {
                    width: 880px;
                    overflow-x: hidden;
                    overflow-y: visible;
                    border: 1px solid #d8dee8;
                    margin-top: 18px;
                }
                .image-carousel__track {
                    display: flex;
                    width: 880px;
                }
                .image-carousel__slide {
                    display: flex;
                    align-items: center;
                    flex: 0 0 880px;
                    min-width: 0;
                    height: 214px;
                    background: #f6f8fb;
                }
                .image-carousel__art {
                    flex: 0 0 616px;
                    width: 616px;
                    height: 214px;
                    object-fit: cover;
                    background: linear-gradient(135deg, #27364a, #8fc7d7);
                }
                .image-carousel__copy {
                    flex: 0 0 auto;
                    max-width: 236px;
                    margin-left: 16px;
                    color: #172033;
                    font-size: 28px;
                    font-weight: 800;
                    line-height: 1.2;
                    white-space: nowrap;
                    overflow: hidden;
                }
                .t-l-layout-2-column {
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) 216px;
                    gap: 24px;
                    align-items: start;
                    margin-top: 24px;
                }
                .t-c-main-section {
                    min-width: 0;
                    overflow: hidden;
                }
                .t-c-main-section__title {
                    margin: 0 0 12px;
                    font-size: 20px;
                    line-height: 1.3;
                    white-space: nowrap;
                    overflow: hidden;
                }
                .t-c-grid-shelf {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 16px;
                }
                .t-c-grid-shelf__item {
                    min-width: 0;
                    overflow: hidden;
                    border: 1px solid #d8dee8;
                    padding: 10px;
                }
                .t-c-tile-card__main {
                    display: grid;
                    grid-template-columns: 72px minmax(0, 1fr);
                    gap: 10px;
                    min-width: 0;
                }
                .t-c-book-cover-general {
                    width: 72px;
                    height: 102px;
                    background: #c7d5e7;
                }
                .t-o-heading-book-title {
                    margin: 0;
                    min-width: 0;
                    font-size: 13px;
                    line-height: 18px;
                }
                .t-o-heading-book-title__link {
                    display: -webkit-box;
                    -webkit-box-orient: vertical;
                    -webkit-line-clamp: 2;
                    height: 36px;
                    overflow: hidden;
                    color: inherit;
                    text-decoration: none;
                }
                .t-c-tile-card__badge {
                    display: block;
                    width: 82px;
                    height: 20px;
                    margin-top: 8px;
                    overflow: hidden;
                    font-size: 12px;
                    line-height: 20px;
                    white-space: nowrap;
                }
                .t-l-layout-2-column__side {
                    position: relative;
                    width: 216px;
                    min-height: 250px;
                }
                .t-c-sidebar-login,
                .t-c-sidebar-card {
                    position: absolute;
                    left: 0;
                    width: 216px;
                    border: 1px solid #d8dee8;
                    background: #fff;
                    overflow: hidden;
                }
                .t-c-sidebar-login {
                    top: 0;
                    height: 68px;
                    padding: 10px;
                }
                .t-c-sidebar-card {
                    top: 84px;
                    height: 96px;
                    padding: 10px;
                }
                .t-c-sidebar-card__title {
                    margin: 0 0 8px;
                    overflow: hidden;
                    white-space: nowrap;
                    font-size: 14px;
                    line-height: 18px;
                }
                .t-c-sidebar-card a,
                .t-c-sidebar-login a {
                    display: block;
                    overflow: hidden;
                    white-space: nowrap;
                    color: inherit;
                    text-decoration: none;
                    font-size: 13px;
                    line-height: 20px;
                }
            </style>
        </head>
        <body>
            <main class="bookwalker-home" data-bookwalker-storefront>
                <nav class="global-nav">
                    <a href="/top/">ストアトップ</a>
                    <a href="/ranking/">ランキング</a>
                    <a href="/genre/">ジャンルで探す</a>
                    <button type="button">ログイン</button>
                </nav>
                <section class="image-carousel" data-carousel-viewport>
                    <div class="image-carousel__track" data-carousel-track>
                        <article class="image-carousel__slide">
                            <img class="image-carousel__art" alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='616' height='214'%3E%3Crect width='616' height='214' fill='%238fc7d7'/%3E%3C/svg%3E">
                            <h2 class="image-carousel__copy" data-bookwalker-title${forceRubyAttribute}>日本語漫画フェア</h2>
                        </article>
                    </div>
                </section>
                <div class="t-l-layout-2-column" data-bookwalker-layout>
                    <section class="t-c-main-section">
                        <h2 class="t-c-main-section__title">注目の無料作品</h2>
                        <div class="t-c-grid-shelf --pc">
                            ${bookwalkerGridItem('あなた達それでも先生ですかっ！【期間限定無料】 1', '無料試し読み')}
                            ${bookwalkerGridItem('異世界で姉に名前を奪われました【分冊版】', '人気作品')}
                            ${bookwalkerGridItem('青春ブタ野郎はランドセルガールの夢を見ない', '新着おすすめ')}
                            ${bookwalkerGridItem('転生王女と天才令嬢の魔法革命', '期間限定')}
                            ${bookwalkerGridItem('本好きの下剋上 司書になるためには手段を選んでいられません', 'セール対象')}
                            ${bookwalkerGridItem('魔導具師ダリヤはうつむかない 今日から自由な職人ライフ', '話題作')}
                        </div>
                    </section>
                    <aside class="t-l-layout-2-column__side">
                        <div class="t-c-sidebar-login" data-bookwalker-side-card>
                            <a href="/login/">ログインして本棚を見る</a>
                            <a href="/account/">無料会員登録はこちら</a>
                        </div>
                        <div class="t-c-sidebar-card" data-bookwalker-side-card>
                            <h3 class="t-c-sidebar-card__title">電子書籍ランキング</h3>
                            <a href="/rank/1/">少年漫画ランキング</a>
                            <a href="/rank/2/">女性向け漫画ランキング</a>
                            <a href="/rank/3/">ライトノベルランキング</a>
                        </div>
                    </aside>
                </div>
            </main>
        </body>
        </html>
    `;
}

function bookwalkerProductGalleryFixture() {
    return `
        <!doctype html>
        <html lang="ja">
        <head>
            <meta charset="utf-8">
            <style>
                * { box-sizing: border-box; }
                body { margin: 0; font-family: system-ui, sans-serif; }
                .bookwalker-home { width: 760px; margin: 32px auto; }
                .product-gallery {
                    display: grid;
                    grid-template-columns: repeat(4, 160px);
                    gap: 24px;
                    overflow: hidden;
                    width: 760px;
                    border: 1px solid #d8dee8;
                    padding: 16px;
                }
                .product-entry {
                    width: 160px;
                    min-width: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .cover-link,
                .cover-link img {
                    display: block;
                    width: 148px;
                    height: 214px;
                    background: linear-gradient(135deg, #e8eff8, #bcd2e8);
                }
                .details-shell {
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                    gap: 5px;
                }
                .genre-badge,
                .price-label {
                    margin: 0;
                    font-size: 12px;
                    line-height: 16px;
                }
                .title-wrap {
                    margin: 0;
                    font-size: 14px;
                    line-height: 18px;
                    min-width: 0;
                }
                .title-link {
                    display: block;
                    width: 148px;
                    height: 36px;
                    overflow: hidden;
                    line-height: 18px;
                    color: #164a7a;
                    text-decoration: none;
                }
                .product-entry button {
                    height: 32px;
                    border: 0;
                    border-radius: 4px;
                    background: #d93434;
                    color: white;
                    font-weight: 700;
                }
            </style>
        </head>
        <body>
            <main class="bookwalker-home">
                <section class="product-gallery" data-product-gallery>
                    <article class="product-entry" data-product-card>
                        <div class="media-shell">
                            <a class="cover-link" href="/books/free-title/">
                                <img alt="あなた達それでも先生ですかっ！" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='148' height='214'%3E%3Crect width='148' height='214' fill='%23bcd2e8'/%3E%3C/svg%3E">
                            </a>
                        </div>
                        <div class="details-shell">
                            <p class="genre-badge">マンガ</p>
                            <h3 class="title-wrap">
                                <a data-product-title class="title-link" href="/books/free-title/">あなた達それでも先生ですかっ！</a>
                            </h3>
                            <p class="price-label">2冊無料</p>
                            <button data-product-cta type="button">無料で読む</button>
                        </div>
                    </article>
                </section>
            </main>
        </body>
        </html>
    `;
}

function bookwalkerGridItem(title, badge) {
    return `
        <div class="t-c-grid-shelf__item" data-bookwalker-grid-item>
            <article class="t-c-tile-card --free">
                <div class="t-c-tile-card__main">
                    <div class="t-c-book-cover-general"></div>
                    <h3 class="t-o-heading-book-title">
                        <a class="t-o-heading-book-title__link --12" href="/book/" data-bookwalker-product-title>${title}</a>
                    </h3>
                </div>
                <span class="t-c-tile-card__badge">${badge}</span>
            </article>
        </div>
    `;
}

function readableScrollFixture() {
    return `
        <!doctype html>
        <html lang="ja">
        <head>
            <meta charset="utf-8">
            <style>
                body { margin: 0; font-family: system-ui, sans-serif; }
                main { width: 760px; margin: 32px auto; }
                .article-scroll.banner {
                    overflow-x: auto;
                    padding: 24px;
                    border: 1px solid #d8dee8;
                }
                .article-scroll img {
                    float: right;
                    width: 180px;
                    height: 110px;
                    margin: 0 0 12px 20px;
                    background: #d6e8f0;
                }
                .article-scroll p {
                    font-size: 20px;
                    line-height: 1.8;
                }
            </style>
        </head>
        <body>
            <main>
                <article class="article-scroll banner">
                    <img alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='110'%3E%3Crect width='180' height='110' fill='%23d6e8f0'/%3E%3C/svg%3E">
                    <p data-readable-scroll-prose>今日は新しい本を読みました。</p>
                </article>
            </main>
        </body>
        </html>
    `;
}
