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

    function carouselMetrics() {
        const viewport = document.querySelector<HTMLElement>('[data-carousel-viewport]');
        const track = document.querySelector<HTMLElement>('[data-carousel-track]');
        const title = document.querySelector<HTMLElement>('[data-bookwalker-title]');
        const viewportRect = viewport?.getBoundingClientRect();
        const titleRect = title?.getBoundingClientRect();
        return {
            viewportClientWidth: viewport?.clientWidth ?? 0,
            viewportScrollWidth: viewport?.scrollWidth ?? 0,
            trackClientWidth: track?.clientWidth ?? 0,
            trackScrollWidth: track?.scrollWidth ?? 0,
            titleClientWidth: title?.clientWidth ?? 0,
            titleScrollWidth: title?.scrollWidth ?? 0,
            viewportRight: viewportRect?.right ?? 0,
            titleRight: titleRect?.right ?? 0,
            rubyCount: document.querySelectorAll('[data-bookwalker-title] rt,.jpdb-reader-furi').length,
            passiveCount: document.querySelectorAll('[data-bookwalker-title] .jpdb-reader-passive-word').length,
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
        runYomuBookwalkerCarouselProbe() {
            const before = carouselMetrics();
            const sentence = '日本語漫画フェア';
            const targets = collectScanTargets(20, 'https://bookwalker.jp/');
            const target = targets.find(candidate => candidate.text.includes(sentence));
            if (!target) throw new Error('BookWalker carousel title target was not collected.');
            applyTokensToScanTarget(target, [
                token(sentence, '日本語', 'にほんごのことば', 0, 3),
                token(sentence, '漫画', 'まんがたいとる', 3, 5),
            ], { ...DEFAULT_SETTINGS, interfaceLanguage: 'en', showFurigana: true, furiganaMode: 'all' });
            return {
                before,
                after: carouselMetrics(),
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
        const result = await runBrowserProbe(browser, bookwalkerCarouselFixture(), 'runYomuBookwalkerCarouselProbe', 'bookwalker-carousel-overflow-smoke.png');
        const forcedRuby = await runBrowserProbe(browser, bookwalkerCarouselFixture({ forceRuby: true }), 'runYomuBookwalkerCarouselProbe');
        const readableScroll = await runBrowserProbe(browser, readableScrollFixture(), 'runYomuReadableScrollProbe');

        assert(result.before.viewportScrollWidth <= result.before.viewportClientWidth + 2, 'fixture starts without overflow', result);
        assert(result.target.suppressRuby, 'wide image carousel target should suppress ruby generically', result);
        assert(result.target.passiveInteraction, 'wide image carousel target should be passive', result);
        assert(result.after.rubyCount === 0, 'carousel title rendered ruby and can widen the image carousel', result);
        assert(result.after.passiveCount >= 2, 'carousel title words should still be lookupable as passive words', result);
        assert(result.after.viewportScrollWidth <= result.after.viewportClientWidth + 2, 'carousel overflowed after Yomu rendered words', result);
        assert(result.after.titleRight <= result.after.viewportRight + 2, 'carousel title painted outside the clipped viewport', result);

        assert(forcedRuby.after.rubyCount > 0, 'control fixture did not render ruby', forcedRuby);
        assert(
            forcedRuby.after.viewportScrollWidth > forcedRuby.after.viewportClientWidth + 2
                || forcedRuby.after.titleRight > forcedRuby.after.viewportRight + 2,
            'control fixture with forced ruby should demonstrate the overflow risk',
            forcedRuby,
        );

        assert(!readableScroll.target.suppressRuby, 'readable prose in a scroll/banner container should keep ruby', readableScroll);
        assert(!readableScroll.target.passiveInteraction, 'readable prose in a scroll/banner container should stay interactive', readableScroll);
        assert(readableScroll.after.rubyCount > 0, 'readable prose lost furigana in a scroll/banner container', readableScroll);

        console.log(JSON.stringify({ result, forcedRuby, readableScroll }, null, 2));
        console.log('BookWalker carousel overflow smoke passed');
    } finally {
        await browser.close();
    }
} finally {
    rmSync(tempDir, { recursive: true, force: true });
}

async function runBrowserProbe(browser, html, probeName, screenshotName) {
    const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
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

function bookwalkerCarouselFixture({ forceRuby = false } = {}) {
    const forceRubyAttribute = forceRuby ? ' data-yomu-furigana-mode="all"' : '';
    return `
        <!doctype html>
        <html lang="ja">
        <head>
            <meta charset="utf-8">
            <style>
                * { box-sizing: border-box; }
                body { margin: 0; font-family: system-ui, sans-serif; }
                .bookwalker-home { width: 760px; margin: 32px auto; }
                .image-carousel {
                    width: 760px;
                    overflow-x: hidden;
                    overflow-y: visible;
                    border: 1px solid #d8dee8;
                }
                .image-carousel__track {
                    display: flex;
                    width: 760px;
                }
                .image-carousel__slide {
                    display: flex;
                    align-items: center;
                    flex: 0 0 760px;
                    min-width: 0;
                    height: 214px;
                    background: #f6f8fb;
                }
                .image-carousel__art {
                    flex: 0 0 518px;
                    width: 518px;
                    height: 214px;
                    object-fit: cover;
                    background: linear-gradient(135deg, #27364a, #8fc7d7);
                }
                .image-carousel__copy {
                    flex: 0 0 auto;
                    margin-left: 16px;
                    color: #172033;
                    font-size: 28px;
                    font-weight: 800;
                    line-height: 1.2;
                    white-space: nowrap;
                }
            </style>
        </head>
        <body>
            <main class="bookwalker-home">
                <section class="image-carousel" data-carousel-viewport>
                    <div class="image-carousel__track" data-carousel-track>
                        <article class="image-carousel__slide">
                            <img class="image-carousel__art" alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='518' height='214'%3E%3Crect width='518' height='214' fill='%238fc7d7'/%3E%3C/svg%3E">
                            <h2 class="image-carousel__copy" data-bookwalker-title${forceRubyAttribute}>日本語漫画フェア</h2>
                        </article>
                    </div>
                </section>
            </main>
        </body>
        </html>
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

function assert(condition, message, details) {
    if (!condition) {
        throw new Error(`${message}\n${JSON.stringify(details, null, 2)}`);
    }
}
