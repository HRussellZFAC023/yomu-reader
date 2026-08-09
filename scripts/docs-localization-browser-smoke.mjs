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
    const pageErrors = [];
    page.on('console', message => {
        if (/hydration|mismatch/i.test(message.text())) hydrationMessages.push(message.text());
    });
    page.on('pageerror', error => {
        pageErrors.push(error.stack || error.message);
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
    await assertHostedRuntimeOrder(page, {
        surface: 'Japanese homepage',
        annotationSelector: '.yomu-try-me-text .jpdb-reader-word',
        exerciseLookup: true,
    });

    await chooseLocale(page, '言語を変更', '/');
    await assertHomepage(page, '/', 'en');
    await assertNoWrongLanguageFrame(page);

    await chooseLocale(page, 'Change language', '/ja/');
    await assertHomepage(page, '/ja/', 'ja');
    await assertNoWrongLanguageFrame(page);

    await page.goto(`${ORIGIN}/learn/reading`, { waitUntil: 'networkidle' });
    await assertRoute(page, '/learn/reading', 'en');
    await assertLocaleHref(page, '日本語', '/ja/learn/reading');
    await assertRouteMetadata(page, '/learn/reading', 'en');
    await chooseLocale(page, 'Change language', '/ja/learn/reading');
    await assertRoute(page, '/ja/learn/reading', 'ja');
    await assertRouteMetadata(page, '/ja/learn/reading', 'ja');
    await assertJapaneseThemeAccessibility(page);

    await page.goto(`${ORIGIN}/privacy/`, { waitUntil: 'networkidle' });
    await assertRoute(page, '/privacy/', 'en');
    await assertLocaleHref(page, '日本語', '/ja/');
    await chooseLocale(page, 'Change language', '/ja/');
    await assertHomepage(page, '/ja/', 'ja');
    await assertNoWrongLanguageFrame(page);
    const frames = await page.evaluate(() => window.__yomuLocaleFrames?.length ?? 0);
    assert.ok(frames >= 1, 'first-frame probe did not observe the final route rendering');

    await page.goto(`${ORIGIN}/academy/`, { waitUntil: 'networkidle' });
    await assertAcademyReaderCold(page);
    await page.evaluate(() => localStorage.setItem('yomu:academy:language:v1', 'ja'));
    await page.goto(`${ORIGIN}/academy/`, { waitUntil: 'networkidle' });
    await assertHostedRuntimeOrder(page, {
        surface: 'Academy',
        annotationSelector: '.academy-root .academy-title[data-yomu-runtime-surface] .jpdb-reader-word',
        exerciseLookup: false,
    });
    assert.deepEqual(hydrationMessages, [], `Vue hydration warning: ${hydrationMessages.join('\n')}`);
    assert.deepEqual(pageErrors, [], `Public page error: ${pageErrors.join('\n')}`);

    console.log(`Docs locale browser smoke passed: SSR/hydration, route metadata, accessible copy, and reviewed-route fallback (${frames} painted-frame snapshots).`);
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
            requestAnimationFrame(() => requestAnimationFrame(capture));
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
    const [navigationResponse] = await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.locator(`.VPNavBarTranslations a[href="${href}"]`).click(),
    ]);
    assert.ok(
        navigationResponse?.ok(),
        `locale choice ${href} did not load its server-rendered document`,
    );
    assert.equal(new URL(navigationResponse.url()).pathname, href);
}

async function assertHomepage(page, pathname, lang) {
    await page.waitForFunction(
        ({ pathname: expectedPath, lang: expectedLang, expected }) => {
            const heading = document.querySelector('#yomu-home-title[data-yomu-hero-rotator="on"]')
                ?.textContent?.trim() ?? '';
            return [
                location.pathname === expectedPath,
                document.documentElement.lang === expectedLang,
                heading.startsWith(expected.prefix),
                heading.endsWith(expected.suffix),
                heading.length > expected.prefix.length + expected.suffix.length,
            ].every(Boolean);
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
    const openGraphLocale = { en: 'en_US', ja: 'ja_JP' }[lang];
    await page.waitForFunction(
        ({ canonical: expectedCanonical, openGraphLocale: expectedLocale }) => {
            const script = document.querySelector('script[type="application/ld+json"][data-yomu-route-head]');
            if (!script) return false;
            const breadcrumb = JSON.parse(script.textContent ?? '{}');
            return [
                document.querySelector('link[rel="canonical"]')?.getAttribute('href') === expectedCanonical,
                document.querySelector('meta[property="og:url"]')?.getAttribute('content') === expectedCanonical,
                document.querySelector('meta[property="og:locale"]')?.getAttribute('content') === expectedLocale,
                breadcrumb?.itemListElement?.[1]?.item === expectedCanonical,
            ].every(Boolean);
        },
        { canonical, openGraphLocale },
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
    const pathname = new URL(page.url()).pathname;
    await page.waitForFunction(
        expectedPath => window.__yomuLocaleFrames?.some(frame => frame.path === expectedPath),
        pathname,
    );
    const frames = await page.evaluate(() => window.__yomuLocaleFrames ?? []);
    const mismatches = frames.filter(isWrongLanguageFrame);
    assert.deepEqual(mismatches, [], `wrong-language painted frame: ${JSON.stringify(mismatches)}`);
}

function isWrongLanguageFrame(frame) {
    const expected = EXPECTED_ROUTE_FRAMES[frame.path];
    if (!expected) return false;
    if (frame.lang !== expected.lang) return true;
    if (frame.heading === expected.staticHeading) return false;
    return !dynamicHeadingMatches(frame.heading, expected);
}

function dynamicHeadingMatches(heading, expected) {
    return [
        heading.startsWith(expected.prefix),
        heading.endsWith(expected.suffix),
        heading.length > expected.prefix.length + expected.suffix.length,
    ].every(Boolean);
}

async function assertHostedRuntimeOrder(page, { surface, annotationSelector, exerciseLookup }) {
    await page.waitForFunction(() =>
        document.querySelector('#jpdb-reader-runtime-owner[data-yomu-runtime-health="ready"]'),
    null,
    { timeout: 20_000 });
    const scripts = await page.evaluate(() => Array.from(
        document.querySelectorAll('script[data-yomu-hosted-runtime-role]'),
        script => ({
            role: script.getAttribute('data-yomu-hosted-runtime-role'),
            state: script.getAttribute('data-yomu-hosted-runtime-state'),
            src: script.getAttribute('src'),
        }),
    ));
    assert.ok(scripts.length >= 2, `${surface} did not load a dependency plus core`);
    assert.ok(scripts.slice(0, -1).every(script => script.role === 'dependency'), `${surface} runtime dependency order is invalid`);
    assert.equal(scripts.at(-1)?.role, 'core', `${surface} did not append core last`);
    assert.ok(scripts.every(script => script.state === 'loaded'), `${surface} runtime graph did not settle`);
    assert.ok(
        scripts.slice(0, -1).every(script => /\/greasyfork\/[a-z\d.-]+\.[a-f\d]{12}\.user\.js(?:[?#]|$)/u.test(script.src ?? '')),
        `${surface} did not use immutable final-userscript dependencies`,
    );
    if (surface === 'Academy') await assertAcademyRuntimeRevision(page);
    const annotatedWord = page.locator(annotationSelector).first();
    await annotatedWord.waitFor({ state: 'visible', timeout: 20_000 });
    if (!exerciseLookup) return;
    await annotatedWord.hover();
    await page.locator('.jpdb-reader-popover').first().waitFor({ state: 'visible', timeout: 8_000 });
    await page.keyboard.press('Escape');
}

async function assertAcademyRuntimeRevision(page) {
    const revisions = await page.evaluate(() => {
        const revision = selector => {
            const src = document.querySelector(selector)?.getAttribute(selector.startsWith('link') ? 'href' : 'src');
            return src ? new URL(src, location.href).searchParams.get('v') : null;
        };
        return {
            core: revision('script[data-yomu-hosted-runtime-role="core"]'),
            css: revision('link[data-yomu-hosted-academy-css]'),
            graph: revision('script[src*="/hosted-runtime-graph.js"]'),
        };
    });
    assert.match(revisions.graph ?? '', /^s1-[a-f\d]{12}$/u, 'Academy graph has no content revision');
    assert.equal(revisions.core, revisions.graph, 'Academy core did not bypass an older controlling service worker');
    assert.equal(revisions.css, revisions.graph, 'Academy Reader CSS did not bypass an older controlling service worker');
}

async function assertAcademyReaderCold(page) {
    await page.locator('.academy-root').waitFor({ state: 'visible' });
    await page.waitForTimeout(750);
    const state = await page.evaluate(() => ({
        graphError: document.documentElement.dataset.yomuHostedRuntimeGraphError,
        marker: Boolean(document.getElementById('jpdb-reader-runtime-owner')),
        runtimeScripts: document.querySelectorAll('script[data-yomu-hosted-runtime-role]').length,
    }));
    assert.deepEqual(state, {
        graphError: undefined,
        marker: false,
        runtimeScripts: 0,
    }, 'English Academy eagerly booted the optional Reader without a reading surface');
}
