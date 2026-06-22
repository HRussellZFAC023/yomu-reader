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
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback } from './lib/smoke-test-helpers.mjs';

const { scriptPath: SCRIPT_PATH, root: ROOT } = createSmokePaths(import.meta.dirname);
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
        await addScriptTagWithCspFallback(page, SCRIPT_PATH);
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
