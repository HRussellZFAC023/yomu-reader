import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const ORIGIN = process.env.YOMU_DOCS_PREVIEW_URL || 'http://127.0.0.1:4199';
const JA_STATIC_HEADING = '日本語を学ぶための、すべてがそろう。';
const EN_STATIC_HEADING = 'A complete system for learning 日本語.';
const EXPECTED_ROUTE_FRAMES = Object.freeze({
    '/': { lang: 'en', staticHeading: EN_STATIC_HEADING, prefix: 'Read ', suffix: ' with Yomu.' },
    '/ja/': { lang: 'ja', staticHeading: JA_STATIC_HEADING, prefix: 'よむで', suffix: 'を読む。' },
});
const browser = await chromium.launch({ headless: true });

try {
    const page = await browser.newPage();
    const hydrationMessages = [];
    page.on('console', message => {
        if (/hydration|mismatch/i.test(message.text())) hydrationMessages.push(message.text());
    });
    page.on('pageerror', error => {
        if (/hydration|mismatch/i.test(error.message)) hydrationMessages.push(error.message);
    });

    await installFirstFrameProbe(page);
    const response = await page.goto(`${ORIGIN}/ja/`, { waitUntil: 'domcontentloaded' });
    assert.ok(response?.ok(), 'Japanese route response failed');
    const initialHtml = await response.text();
    assert.ok(initialHtml.includes(JA_STATIC_HEADING), 'Japanese is absent from initial server HTML');
    assert.equal(initialHtml.includes(EN_STATIC_HEADING), false, 'English headline leaked into initial Japanese HTML');
    await assertHomepage(page, '/ja/', 'ja');
    await assertNoWrongLanguageFrame(page);

    await chooseLocale(page, '言語を変更', '/');
    await assertHomepage(page, '/', 'en');
    await assertNoWrongLanguageFrame(page);

    await chooseLocale(page, 'Change language', '/ja/');
    await assertHomepage(page, '/ja/', 'ja');
    await assertNoWrongLanguageFrame(page);

    await page.goto(`${ORIGIN}/learn/reading`, { waitUntil: 'domcontentloaded' });
    await assertRoute(page, '/learn/reading', 'en');
    await assertLocaleHref(page, '日本語', '/ja/learn/reading');
    await assertRouteMetadata(page, '/learn/reading', 'en');
    await chooseLocale(page, 'Change language', '/ja/learn/reading');
    await assertRoute(page, '/ja/learn/reading', 'ja');
    await assertRouteMetadata(page, '/ja/learn/reading', 'ja');
    await assertJapaneseThemeAccessibility(page);

    await page.goto(`${ORIGIN}/privacy/`, { waitUntil: 'domcontentloaded' });
    await assertLocaleHref(page, '日本語', '/ja/');
    await chooseLocale(page, 'Change language', '/ja/');
    await assertHomepage(page, '/ja/', 'ja');
    assert.deepEqual(hydrationMessages, [], `Vue hydration warning: ${hydrationMessages.join('\n')}`);

    const frames = await page.evaluate(() => window.__yomuLocaleFrames?.length ?? 0);
    assert.ok(frames >= 3, 'first-frame probe did not observe route rendering');
    console.log(`Docs locale browser smoke passed: SSR/hydration, SPA metadata, accessible copy, and reviewed-route fallback (${frames} painted-frame snapshots).`);
} finally {
    await browser.close();
}

async function installFirstFrameProbe(page) {
    await page.addInitScript(() => {
        window.__yomuLocaleFrames = [];
        let scheduled = false;
        const capture = () => {
            scheduled = false;
            const heading = document.querySelector('#yomu-home-title')?.textContent?.trim() ?? '';
            if (!heading) return;
            window.__yomuLocaleFrames.push({
                path: location.pathname,
                lang: document.documentElement.lang,
                heading,
            });
        };
        const schedule = () => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(capture);
        };
        new MutationObserver(schedule).observe(document, {
            attributes: true,
            childList: true,
            characterData: true,
            subtree: true,
        });
        document.addEventListener('DOMContentLoaded', schedule, { once: true });
    });
}

async function chooseLocale(page, label, href) {
    await page.locator(`.VPNavBarTranslations button[aria-label="${label}"]`).click();
    await Promise.all([
        page.waitForURL(url => url.pathname === href),
        page.locator(`.VPNavBarTranslations a[href="${href}"]`).click(),
    ]);
}

async function assertHomepage(page, pathname, lang) {
    await page.waitForFunction(
        ({ pathname: expectedPath, lang: expectedLang, expected }) => {
            const heading = document.querySelector('#yomu-home-title[data-yomu-hero-rotator="on"]')
                ?.textContent?.trim() ?? '';
            return location.pathname === expectedPath
                && document.documentElement.lang === expectedLang
                && heading.startsWith(expected.prefix)
                && heading.endsWith(expected.suffix)
                && heading.length > expected.prefix.length + expected.suffix.length;
        },
        { pathname, lang, expected: EXPECTED_ROUTE_FRAMES[pathname] },
    );
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function assertRoute(page, pathname, lang) {
    await page.waitForFunction(
        ({ pathname: expectedPath, lang: expectedLang }) =>
            location.pathname === expectedPath
            && document.documentElement.lang === expectedLang,
        { pathname, lang },
    );
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function assertLocaleHref(page, label, href) {
    await page.waitForFunction(
        ({ label: expectedLabel, href: expectedHref }) => {
            const links = [...document.querySelectorAll('.VPNavBarTranslations a[href]')];
            return links.some(link =>
                link.textContent?.trim() === expectedLabel
                && link.getAttribute('href') === expectedHref);
        },
        { label, href },
    );
}

async function assertRouteMetadata(page, pathname, lang) {
    const canonical = new URL(pathname, 'https://yomureader.com').href;
    await page.waitForFunction(
        ({ canonical: expectedCanonical, lang: expectedLang }) => {
            const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"][data-yomu-route-head]')]
                .map(script => {
                    try { return JSON.parse(script.textContent || '{}'); } catch { return {}; }
                });
            const breadcrumb = jsonLd.find(block => block['@type'] === 'BreadcrumbList');
            return document.querySelector('link[rel="canonical"]')?.getAttribute('href') === expectedCanonical
                && document.querySelector('meta[property="og:url"]')?.getAttribute('content') === expectedCanonical
                && document.querySelector('meta[property="og:locale"]')?.getAttribute('content')
                    === (expectedLang === 'ja' ? 'ja_JP' : 'en_US')
                && breadcrumb?.itemListElement?.[1]?.item === expectedCanonical;
        },
        { canonical, lang },
    );
}

async function assertJapaneseThemeAccessibility(page) {
    const labels = await page.evaluate(() => ({
        main: document.getElementById('main-nav-aria-label')?.textContent?.trim(),
        extra: document.querySelector('.VPNavBarExtra > button')?.getAttribute('aria-label'),
        mobile: document.querySelector('.VPNavBarHamburger')?.getAttribute('aria-label'),
    }));
    assert.deepEqual(labels, {
        main: 'メインナビゲーション',
        extra: 'メニュー',
        mobile: 'モバイルナビゲーション',
    });
}

async function assertNoWrongLanguageFrame(page) {
    const frames = await page.evaluate(() => window.__yomuLocaleFrames ?? []);
    const mismatches = frames.filter(isWrongLanguageFrame);
    assert.deepEqual(mismatches, [], `wrong-language painted frame: ${JSON.stringify(mismatches)}`);
}

function isWrongLanguageFrame(frame) {
    const expected = EXPECTED_ROUTE_FRAMES[frame.path];
    if (!expected) return false;
    if (frame.lang !== expected.lang) return true;
    if (frame.heading === expected.staticHeading) return false;
    return !frame.heading.startsWith(expected.prefix)
        || !frame.heading.endsWith(expected.suffix)
        || frame.heading.length <= expected.prefix.length + expected.suffix.length;
}
