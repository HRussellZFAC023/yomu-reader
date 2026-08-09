#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import {
    assert,
    assertBuiltArtifacts,
    createSmokePaths,
    gmStorageBridgeInitProgram,
    launchSmokeBrowser,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addUserscriptGraphInitScripts } from './lib/smoke-test-helpers.mjs';

const { scriptPath, cssPath, root, artifacts } = createSmokePaths(import.meta.dirname);
assertBuiltArtifacts([scriptPath, cssPath], root);

const outputDir = join(artifacts, 'youtube-dom-safe', process.env.YOMU_YOUTUBE_DOM_SAFE_LABEL ?? 'latest');
mkdirSync(outputDir, { recursive: true });

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    jitenApiKey: '',
    ankiEnabled: false,
    audioEnabled: false,
    localDictionariesEnabled: false,
    showFloatingButton: false,
    youtubeImmersionEnabled: true,
    youtubeShowFilterNotice: true,
    youtubeShowChannelRecommendations: false,
    enableLogging: false,
};

console.error('[youtube-dom-safe] launching Chromium');
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
console.error('[youtube-dom-safe] creating context');
const context = await browser.newContext({
    bypassCSP: true,
    locale: 'ja-JP',
    viewport: { width: 1366, height: 900 },
});
context.setDefaultTimeout(15_000);
context.setDefaultNavigationTimeout(15_000);

try {
    console.error('[youtube-dom-safe] installing routes');
    const prefixContent = gmStorageBridgeInitProgram({
        key: YOMU_SETTINGS_KEY,
        value: settings,
        css: readFileSync(cssPath, 'utf8'),
    });
    // A userscript manager installs the CSS/GM bridge first, then executes each
    // immutable @require in metadata order before core. Keep this fixture on
    // that exact graph: a hand-written companion list silently stopped loading
    // the aggregate runtime when the split changed.
    await addUserscriptGraphInitScripts(context, scriptPath, { prefixContent });
    await context.route('https://www.youtube.com/oembed**', route => route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: '{}',
    }));
    await context.route('https://www.youtube.com/**', route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/watch') {
            return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: watchFixtureHtml() });
        }
        return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: homeFixtureHtml() });
    });

    const homePage = await context.newPage();
    const homeLogs = capturePageDiagnostics(homePage, 'home');
    console.error('[youtube-dom-safe] loading home fixture');
    await homePage.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded' });
    await waitForYomuYoutubeFilter(homePage, homeLogs);
    await homePage.screenshot({ path: join(outputDir, 'home-after.png'), fullPage: false });
    const home = await homePage.evaluate(homeEvidence);

    const watchPage = await context.newPage();
    const watchLogs = capturePageDiagnostics(watchPage, 'watch');
    console.error('[youtube-dom-safe] loading watch fixture');
    await watchPage.goto('https://www.youtube.com/watch?v=watch123', { waitUntil: 'domcontentloaded' });
    await waitForYomuYoutubeFilter(watchPage, watchLogs);
    await watchPage.screenshot({ path: join(outputDir, 'watch-after.png'), fullPage: false });
    const watch = await watchPage.evaluate(watchEvidence);

    const evidence = {
        context: {
            browser: 'chromium',
            signedIn: false,
            locale: 'ja-JP',
            viewport: '1366x900',
            pages: ['https://www.youtube.com/', 'https://www.youtube.com/watch?v=watch123'],
        },
        home,
        watch,
        artifacts: {
            homeScreenshot: join(outputDir, 'home-after.png'),
            watchScreenshot: join(outputDir, 'watch-after.png'),
        },
    };
    writeFileSync(join(outputDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);

    assert(home.inlineReaderWords === 0, 'Home/feed YouTube-owned text was inline-mutated outside a mirror', home);
    assert(home.mirrorReaderWords > 0, 'Home/feed YouTube text did not receive mirrored parsed words', home);
    assert(home.chipClicks === 1, 'Native YouTube chip click did not dispatch', home);
    assert(home.visibleJapaneseTitles >= 3, 'Japanese feed titles did not remain visible', home);
    assert(home.maxVisibleBlankGap < 120, 'Home/feed has a large blank gap after filtering', home);
    assert(home.englishCardsCollapsed >= 3, 'Non-Japanese feed cards were not collapsed', home);
    assert(watch.inlineReaderWords === 0, 'Watch YouTube-owned text was inline-mutated outside a mirror', watch);
    assert(watch.mirrorReaderWords > 0, 'Watch YouTube text did not receive mirrored parsed words', watch);
    assert(watch.titleVisible && watch.metadataVisible && watch.descriptionVisible && watch.commentVisible, 'Watch text disappeared', watch);
    assert(watch.nativeTitleText === '日本語の習慣を学ぶ', 'Watch title text changed', watch);
    assert(watch.maxVisibleBlankGap < 120, 'Watch page has a large blank gap after filtering', watch);
    assert(!watch.noticeVisible, 'Watch page rendered a video-covering filter notice', watch);

    console.log(JSON.stringify(evidence, null, 2));
} finally {
    await browser.close();
}

function capturePageDiagnostics(page, label) {
    const logs = [];
    page.on('console', message => logs.push(`[${label}:console:${message.type()}] ${message.text()}`));
    page.on('pageerror', error => logs.push(`[${label}:pageerror] ${String(error)}`));
    return logs;
}

async function waitForYomuYoutubeFilter(page, logs) {
    try {
        await page.waitForFunction(() => (
            document.documentElement.classList.contains('jpdb-youtube-filter-active')
            && document.querySelector('.jpdb-youtube-filtered, .jpdb-youtube-filter-bar, .jpdb-youtube-filter-collapsed')
        ), undefined, { timeout: 10_000 });
    } catch (error) {
        const state = await page.evaluate(() => ({
            htmlClass: document.documentElement.className,
            bodyText: document.body?.textContent?.slice(0, 500),
            cards: document.querySelectorAll('ytd-rich-item-renderer,ytd-compact-video-renderer').length,
            yomuRoots: document.querySelectorAll('[data-jpdb-reader-root]').length,
            filtered: document.querySelectorAll('.jpdb-youtube-filtered').length,
            storage: localStorage.getItem('jpdb-popup-reader-settings') ?? sessionStorage.getItem('jpdb-popup-reader-settings'),
        })).catch(evaluateError => ({ evaluateError: String(evaluateError) }));
        throw new Error(`Timed out waiting for Yomu YouTube filter\n${JSON.stringify({ state, logs }, null, 2)}\n${String(error)}`);
    }
    await page.waitForTimeout(1200);
}

function homeEvidence() {
    document.querySelector('[data-test-chip]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const visible = element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const nativeTextExcludingMirrors = root => {
        if (!root) return '';
        let text = '';
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                return node.parentElement?.closest('.jpdb-reader-text-mirror')
                    ? NodeFilter.FILTER_REJECT
                    : NodeFilter.FILTER_ACCEPT;
            },
        });
        for (let node = walker.nextNode(); node; node = walker.nextNode()) text += node.textContent || '';
        return text.replace(/\s+/g, ' ').trim();
    };
    const visibleCards = [...document.querySelectorAll('ytd-rich-item-renderer')].filter(visible);
    const visibleRects = visibleCards.map(card => card.getBoundingClientRect()).sort((a, b) => a.top - b.top);
    const gaps = visibleRects.slice(1).map((rect, index) => Math.max(0, rect.top - visibleRects[index].bottom));
    return {
        inlineReaderWords: document.querySelectorAll('ytd-app .jpdb-reader-word:not(.jpdb-reader-text-mirror .jpdb-reader-word):not([data-jpdb-reader-root] .jpdb-reader-word)').length,
        mirrorReaderWords: document.querySelectorAll('ytd-app .jpdb-reader-text-mirror .jpdb-reader-word').length,
        mirrors: document.querySelectorAll('ytd-app .jpdb-reader-text-mirror').length,
        chipClicks: window.__chipClicks ?? 0,
        visibleJapaneseTitles: [...document.querySelectorAll('ytd-rich-item-renderer:not(.jpdb-youtube-filtered) #video-title')]
            .filter(title => title.textContent?.includes('日本語') || title.textContent?.includes('東京')).length,
        englishCardsCollapsed: document.querySelectorAll('ytd-rich-item-renderer.jpdb-youtube-filter-collapsed').length,
        maxVisibleBlankGap: gaps.length ? Math.max(...gaps) : 0,
        titleTexts: [...document.querySelectorAll('ytd-rich-item-renderer:not(.jpdb-youtube-filtered) #video-title')]
            .map(title => nativeTextExcludingMirrors(title)).filter(Boolean),
    };
}

function watchEvidence() {
    const visible = selector => {
        const element = document.querySelector(selector);
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const mirroredVisible = selector => visible(`${selector} .jpdb-reader-text-mirror`) || visible(selector);
    const nativeTextExcludingMirrors = root => {
        if (!root) return '';
        let text = '';
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                return node.parentElement?.closest('.jpdb-reader-text-mirror')
                    ? NodeFilter.FILTER_REJECT
                    : NodeFilter.FILTER_ACCEPT;
            },
        });
        for (let node = walker.nextNode(); node; node = walker.nextNode()) text += node.textContent || '';
        return text.replace(/\s+/g, ' ').trim();
    };
    const visibleCards = [...document.querySelectorAll('ytd-compact-video-renderer')].filter(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.opacity !== '0';
    });
    const visibleRects = visibleCards.map(card => card.getBoundingClientRect()).sort((a, b) => a.top - b.top);
    const gaps = visibleRects.slice(1).map((rect, index) => Math.max(0, rect.top - visibleRects[index].bottom));
    return {
        inlineReaderWords: document.querySelectorAll('ytd-watch-flexy .jpdb-reader-word:not(.jpdb-reader-text-mirror .jpdb-reader-word):not([data-jpdb-reader-root] .jpdb-reader-word)').length,
        mirrorReaderWords: document.querySelectorAll('ytd-watch-flexy .jpdb-reader-text-mirror .jpdb-reader-word').length,
        mirrors: document.querySelectorAll('ytd-watch-flexy .jpdb-reader-text-mirror').length,
        nativeTitleText: nativeTextExcludingMirrors(document.querySelector('ytd-watch-metadata h1')),
        titleVisible: mirroredVisible('ytd-watch-metadata h1'),
        metadataVisible: mirroredVisible('ytd-watch-metadata #metadata-line'),
        descriptionVisible: mirroredVisible('ytd-watch-metadata #description'),
        commentVisible: mirroredVisible('ytd-comments #content-text'),
        noticeVisible: Boolean(document.querySelector('.jpdb-youtube-filter-bar')),
        englishRecommendationsCollapsed: document.querySelectorAll('ytd-compact-video-renderer.jpdb-youtube-filter-collapsed').length,
        maxVisibleBlankGap: gaps.length ? Math.max(...gaps) : 0,
    };
}

function fixtureStyles() {
    return `
        html, body { margin: 0; background: #fff; color: #0f0f0f; font: 14px/1.4 Arial, sans-serif; }
        ytd-app, ytd-watch-flexy, ytd-rich-grid-renderer, ytd-rich-item-renderer, ytd-watch-metadata,
        ytd-compact-video-renderer, ytd-comments, ytd-comment-renderer, ytd-mini-guide-renderer,
        ytd-feed-filter-chip-bar-renderer { display: block; box-sizing: border-box; }
        ytd-mini-guide-renderer { position: fixed; inset: 0 auto 0 0; width: 76px; padding-top: 16px; border-right: 1px solid #ddd; background: #fff; }
        ytd-mini-guide-renderer a { display: block; padding: 14px 6px; color: inherit; text-decoration: none; text-align: center; }
        ytd-feed-filter-chip-bar-renderer { margin-left: 96px; padding: 16px 24px 8px; }
        ytd-feed-filter-chip-bar-renderer button { min-height: 32px; margin-right: 8px; border: 0; border-radius: 16px; padding: 0 14px; background: #eee; }
        ytd-rich-grid-renderer #contents { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-left: 96px; padding: 16px 24px 48px; }
        ytd-rich-item-renderer { min-height: 168px; border-radius: 8px; background: #f7f7f7; overflow: hidden; }
        ytd-rich-item-renderer .thumb, ytd-compact-video-renderer .thumb { display: block; height: 96px; background: #d9d9d9; }
        ytd-rich-item-renderer a, ytd-compact-video-renderer a { display: block; padding: 10px; color: inherit; text-decoration: none; font-weight: 700; }
        #movie_player { height: 380px; background: #111; margin: 24px; }
        ytd-watch-metadata { margin: 0 24px 20px; max-width: 820px; }
        ytd-watch-metadata h1 { font-size: 24px; margin: 0 0 8px; }
        ytd-watch-metadata #metadata-line, ytd-watch-metadata #description { margin-top: 8px; color: #606060; }
        #secondary { position: absolute; top: 24px; left: 900px; width: 360px; }
        ytd-compact-video-renderer { min-height: 90px; margin-bottom: 12px; background: #f7f7f7; }
        ytd-compact-video-renderer .thumb { float: left; width: 132px; height: 74px; margin-right: 8px; }
        ytd-comments { display: block; margin: 24px; max-width: 820px; }
        ytd-comment-renderer { display: block; padding: 12px 0; border-top: 1px solid #eee; }
    `;
}

function homeFixtureHtml() {
    const cards = [
        ['jp-1', '日本語の朝ごはんを作る', '東京チャンネル'],
        ['en-1', 'Desk setup tour', 'English channel'],
        ['jp-2', '東京カフェ散歩', '日本語チャンネル'],
        ['en-2', 'Football highlights', 'Sports channel'],
        ['jp-3', '日本語で読むニュース', 'ニュース'],
        ['en-3', 'How I edit photos', 'Creator channel'],
        ['jp-4', '春の京都旅行', '旅チャンネル'],
        ['en-4', 'Morning productivity routine', 'Work channel'],
    ];
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>YouTube fixture</title><style>${fixtureStyles()}</style></head><body>
        <ytd-app>
            <ytd-mini-guide-renderer>
                <a id="endpoint" href="/"><span class="title">ホーム</span></a>
                <a id="endpoint" href="/feed/subscriptions"><span class="title">登録チャンネル</span></a>
            </ytd-mini-guide-renderer>
            <ytd-feed-filter-chip-bar-renderer>
                <button data-test-chip type="button" onclick="window.__chipClicks=(window.__chipClicks||0)+1">日本語</button>
                <button type="button">最近アップロードされた動画</button>
            </ytd-feed-filter-chip-bar-renderer>
            <ytd-rich-grid-renderer elements-per-row="4">
                <div id="contents">
                    ${cards.map(([id, title, channel]) => `
                        <ytd-rich-item-renderer items-per-row="4">
                            <a href="/watch?v=${id}"><span class="thumb"></span><span id="video-title">${title}</span></a>
                            <span id="channel-name">${channel}</span>
                        </ytd-rich-item-renderer>
                    `).join('')}
                </div>
            </ytd-rich-grid-renderer>
        </ytd-app>
    </body></html>`;
}

function watchFixtureHtml() {
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Watch fixture</title><style>${fixtureStyles()}</style></head><body>
        <ytd-watch-flexy>
            <div id="movie_player"></div>
            <ytd-watch-metadata>
                <h1><yt-formatted-string id="title">日本語の習慣を学ぶ</yt-formatted-string></h1>
                <div id="owner"><ytd-channel-name><a href="/@nihongo">日本語チャンネル</a></ytd-channel-name></div>
                <div id="metadata-line"><span>12万回視聴</span><span>昨日</span></div>
                <div id="description"><yt-attributed-string id="attributed-description-text">説明文で日本語の学習方法を紹介します。</yt-attributed-string></div>
            </ytd-watch-metadata>
            <div id="secondary">
                <ytd-compact-video-renderer><a href="/watch?v=side-jp"><span class="thumb"></span><span id="video-title">おすすめ日本語講座</span></a></ytd-compact-video-renderer>
                <ytd-compact-video-renderer><a href="/watch?v=side-en"><span class="thumb"></span><span id="video-title">English tech review</span></a></ytd-compact-video-renderer>
                <ytd-compact-video-renderer><a href="/watch?v=side-jp2"><span class="thumb"></span><span id="video-title">東京散歩ライブ</span></a></ytd-compact-video-renderer>
            </div>
            <ytd-comments>
                <ytd-comment-renderer><yt-attributed-string id="content-text">この動画で日本語を勉強しました。</yt-attributed-string></ytd-comment-renderer>
            </ytd-comments>
        </ytd-watch-flexy>
    </body></html>`;
}
