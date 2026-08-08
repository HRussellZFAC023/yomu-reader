#!/usr/bin/env node
// Live-site smoke: inject the built userscript into real multilingual sites and
// assert the Japanese site-language preference redirects to the Japanese URL.
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    createSmokePaths,
    launchSmokeBrowser,
    YOMU_SETTINGS_KEY,
} from '../lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback } from '../lib/smoke-test-helpers.mjs';

const {
    scriptPath: SCRIPT_PATH,
    root: ROOT,
} = createSmokePaths(import.meta.dirname);
const PREFERENCE_CACHE_KEY = 'yomu:prefer-japanese-site-language';
const OPT_OUT_FIXTURE_URL = 'https://japanese-site-language-smoke.test/en-US/docs?locale=en-US&region=GB';
assertBuiltArtifacts([SCRIPT_PATH], ROOT);

const SITES = [
    {
        name: 'youtube-watch',
        url: 'https://www.youtube.com/watch?v=f2Q5tPfiSAE',
        expects: url => url.hostname.endsWith('youtube.com')
            && url.searchParams.get('hl') === 'ja'
            && url.searchParams.get('gl') === 'JP',
    },
    {
        name: 'google-search',
        url: 'https://www.google.com/search?q=nihongo&hl=en&gl=US',
        expects: url => url.hostname === 'www.google.com'
            && url.searchParams.get('hl') === 'ja'
            && url.searchParams.get('gl') === 'JP',
    },
    {
        name: 'google-news',
        url: 'https://news.google.com/home?hl=en-US&gl=US&ceid=US%3Aen',
        expects: expectsGoogleNewsJapaneseUrl,
    },
    {
        name: 'mdn',
        url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
        expects: url => url.hostname === 'developer.mozilla.org' && url.pathname.startsWith('/ja/'),
    },
    {
        name: 'github-docs',
        url: 'https://docs.github.com/en/get-started/start-your-journey/about-github-and-git',
        expects: url => url.hostname === 'docs.github.com' && url.pathname.startsWith('/ja/'),
    },
    {
        name: 'microsoft-learn',
        url: 'https://learn.microsoft.com/en-us/windows/apps/',
        expects: url => url.hostname === 'learn.microsoft.com' && url.pathname.startsWith('/ja-jp/'),
    },
    {
        name: 'wikipedia-alternate',
        url: 'https://en.wikipedia.org/wiki/Japanese_language',
        expects: url => url.hostname === 'ja.wikipedia.org',
    },
    {
        name: 'unsupported-japanese-alternate',
        url: 'https://handbook.lengualytics.com',
        expects: url => url.hostname === 'handbook.lengualytics.com'
            && (url.pathname === '/en' || url.pathname === '/en/'),
        settleMs: 2500,
    },
];

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    preferJapaneseSiteLanguage: true,
    showFloatingButton: false,
    ankiEnabled: false,
    audioEnabled: false,
    enableLogging: false,
};

const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
const failures = [];

try {
    await runBuiltArtifactOptOutRegression(browser);
} catch (error) {
    failures.push(`built-artifact-opt-out: ${String(error).slice(0, 400)}`);
}

for (const site of SITES) {
    const context = await browser.newContext({ bypassCSP: true, locale: 'en-GB' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => {
        if (message.type() === 'error' && /yomu|jpdb/i.test(message.text())) errors.push(message.text());
    });
    try {
        await addConsentCookies(context, site.url);
        await addGmStorageBridgeInitScript(page, { key: YOMU_SETTINGS_KEY, value: settings });
        await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await injectBuiltJapaneseSiteLanguageRuntime(page);
        const finalUrl = await waitForExpectedUrl(page, site.expects, site.settleMs);
        const problems = errors.length ? [`console errors: ${errors.slice(0, 3).join(' | ')}`] : [];
        console.log(JSON.stringify({ site: site.name, startUrl: site.url, finalUrl, problems }, null, 2));
        if (problems.length) failures.push(`${site.name}: ${problems.join('; ')}`);
    } catch (error) {
        failures.push(`${site.name}: ${String(error).slice(0, 240)}`);
    } finally {
        await context.close();
    }
}

await browser.close();

if (failures.length) {
    console.error(`FAILURES:\n${failures.join('\n')}`);
    process.exit(1);
}

console.log('japanese-site-language smoke passed');

async function runBuiltArtifactOptOutRegression(browserInstance) {
    const context = await browserInstance.newContext({ bypassCSP: true, locale: 'en-GB' });
    const page = await context.newPage();
    const topLevelNavigations = [];
    page.on('framenavigated', frame => {
        if (frame === page.mainFrame() && frame.url() !== 'about:blank') topLevelNavigations.push(frame.url());
    });

    try {
        await page.route('https://japanese-site-language-smoke.test/**', route => route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: '<!doctype html><html lang="en"><head><title>Yomu opt-out smoke</title></head><body>English fixture</body></html>',
        }));
        await page.addInitScript(cacheKey => {
            localStorage.setItem(cacheKey, 'true');
        }, PREFERENCE_CACHE_KEY);
        await addGmStorageBridgeInitScript(page, {
            key: YOMU_SETTINGS_KEY,
            value: { ...settings, preferJapaneseSiteLanguage: false },
        });
        await page.goto(OPT_OUT_FIXTURE_URL, { waitUntil: 'domcontentloaded', timeout: 15_000 });

        const staleCache = await page.evaluate(cacheKey => localStorage.getItem(cacheKey), PREFERENCE_CACHE_KEY);
        assert(staleCache === 'true', 'opt-out fixture did not start with the stale per-origin enabled cache', { staleCache });

        await injectBuiltJapaneseSiteLanguageRuntime(page);
        await page.waitForTimeout(750);

        const finalState = await page.evaluate(cacheKey => ({
            cache: localStorage.getItem(cacheKey),
            language: navigator.language,
            languages: [...navigator.languages],
        }), PREFERENCE_CACHE_KEY);
        const finalUrl = page.url();
        const unexpectedNavigations = topLevelNavigations.filter(url => url !== OPT_OUT_FIXTURE_URL);
        assert(finalUrl === OPT_OUT_FIXTURE_URL, 'stored opt-out did not retain the non-Japanese fixture URL', {
            finalUrl,
            topLevelNavigations,
        });
        assert(unexpectedNavigations.length === 0, 'stored opt-out transiently redirected to another URL', {
            unexpectedNavigations,
            topLevelNavigations,
        });
        assert(finalState.cache === 'false', 'stored opt-out did not reconcile the stale per-origin cache', finalState);
        assert(!/^ja(?:-|$)/i.test(finalState.language), 'stored opt-out retained Japanese navigator locale hints', finalState);
        console.log(JSON.stringify({
            site: 'built-artifact-opt-out',
            startUrl: OPT_OUT_FIXTURE_URL,
            finalUrl,
            topLevelNavigations,
            finalState,
            problems: [],
        }, null, 2));
    } finally {
        await context.close();
    }
}

async function injectBuiltJapaneseSiteLanguageRuntime(page) {
    // The @require header is the shipping dependency graph. Derive every
    // companion from it so a future split cannot silently leave this smoke
    // exercising a runtime configuration no userscript manager actually runs.
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
}

async function waitForExpectedUrl(page, expects, settleMs = 0) {
    const deadline = Date.now() + 12_000;
    let lastUrl = page.url();
    let matchingSince = 0;
    while (Date.now() < deadline) {
        lastUrl = page.url();
        const parsed = new URL(lastUrl);
        if (expects(parsed)) {
            if (!settleMs) return parsed.href;
            matchingSince ||= Date.now();
            if (Date.now() - matchingSince >= settleMs) return parsed.href;
        } else {
            matchingSince = 0;
        }
        await page.waitForTimeout(250);
    }
    assert(false, 'site did not redirect to its Japanese URL', { lastUrl });
}

function expectsGoogleNewsJapaneseUrl(url) {
    if (url.hostname === 'news.google.com') {
        return url.searchParams.get('hl') === 'ja'
            && url.searchParams.get('gl') === 'JP'
            && url.searchParams.get('ceid') === 'JP:ja';
    }
    if (url.hostname !== 'consent.google.com') return false;
    if (url.searchParams.get('hl') !== 'ja' || url.searchParams.get('gl') !== 'JP') return false;
    const continueHref = url.searchParams.get('continue');
    if (!continueHref) return false;
    const continued = new URL(continueHref);
    return continued.hostname === 'news.google.com'
        && continued.searchParams.get('hl') === 'ja'
        && continued.searchParams.get('gl') === 'JP'
        && continued.searchParams.get('ceid') === 'JP:ja';
}

async function addConsentCookies(context, sourceUrl) {
    const hostname = new URL(sourceUrl).hostname;
    const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
    const cookies = [];
    if (hostname.endsWith('youtube.com')) {
        cookies.push({
            name: 'CONSENT',
            value: 'YES+cb.20240101-08-p0.ja+FX+667',
            domain: '.youtube.com',
            path: '/',
            expires,
            sameSite: 'Lax',
            secure: true,
        });
    }
    if (hostname.endsWith('google.com')) {
        cookies.push({
            name: 'CONSENT',
            value: 'YES+cb.20240101-08-p0.ja+FX+667',
            domain: '.google.com',
            path: '/',
            expires,
            sameSite: 'Lax',
            secure: true,
        });
    }
    if (cookies.length) await context.addCookies(cookies);
}
