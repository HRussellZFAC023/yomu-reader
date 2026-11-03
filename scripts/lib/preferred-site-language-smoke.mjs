import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addUserscriptGraphInitScripts } from './smoke-test-helpers.mjs';

const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const PREFERENCE_KEY = 'yomu:prefer-japanese-site-language:v1';
const CACHE_KEY = 'yomu:prefer-japanese-site-language';
const OWNED_CACHE_KEY = `yomu:web-owner:v2:userscript:${CACHE_KEY}`;
const REDDIT_DEFAULT = 'https://www.reddit.com/r/LearnJapanese/';
const REDDIT_JAPANESE = `${REDDIT_DEFAULT}?locale=ja-JP`;
const SETTINGS = {
    onboardingSeen: true, learningTargetChosen: true, interfaceLanguage: 'en',
    showFloatingButton: true, localDictionariesEnabled: false,
    ankiEnabled: false, audioEnabled: false, enableLogging: false,
    preferJapaneseSiteLanguage: true,
};

// Labelled local-network fixtures run the shipping graph at real adapter URLs.
// A Node-owned GM store survives reloads and origins, unlike page localStorage.
export async function runPreferredSiteLanguageRegressions(browser, { scriptPath, cssPath }) {
    const reports = [];
    const urls = [
        'https://en.wikipedia.org/wiki/Japanese_language',
        'https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E',
        'https://developer.mozilla.org/ja/docs/Web/JavaScript',
        'https://www.google.com/search?q=nihongo&hl=ja&gl=JP',
        'https://www.youtube.com/watch?v=yomu-language-fixture&hl=ja&gl=JP',
        REDDIT_JAPANESE,
        'https://en.wikipedia.org/wiki/Japanese_language',
    ];
    const cold = await openFixture(browser, { scriptPath, cssPath, enabled: false });
    try {
        for (const url of urls) {
            const before = cold.navigations.length;
            await cold.page.goto(url, { waitUntil: 'domcontentloaded' });
            await ready(cold.page);
            await cold.page.waitForTimeout(300);
            assert.equal(cold.page.url(), url, 'cold scalar opt-out navigated from its adapter URL');
            assert.deepEqual(cold.navigations.slice(before), [url], 'cold opt-out bounced between locale URLs');
            const state = await cold.page.evaluate(({ cache, ownedCache }) => ({
                rawCache: localStorage.getItem(cache),
                cache: localStorage.getItem(ownedCache),
                language: navigator.language,
                startupLanguage: globalThis.siteLanguageFixtureStartupLanguage,
            }), { cache: CACHE_KEY, ownedCache: OWNED_CACHE_KEY });
            assert.equal(state.rawCache, null, 'v1.9.3 raw cache was not migrated');
            assert.equal(state.cache, 'false', 'stale enabled cache did not reconcile to the scalar');
            assert.equal(state.language, 'en-GB', 'cold opt-out spoofed Japanese locale hints');
            assert.equal(state.startupLanguage, 'en-GB', 'cold opt-out exposed stale Japanese hints to site startup');
            reports.push({ scenario: 'cold-scalar-false-stale-true', url, ...state });
        }
    } finally { await cold.context.close(); }

    const toggle = await openFixture(browser, { scriptPath, cssPath, enabled: true });
    try {
        await toggle.page.goto(REDDIT_JAPANESE, { waitUntil: 'domcontentloaded' });
        await ready(toggle.page);
        toggle.holdOptOut();
        await clickPreference(toggle.page);
        await toggle.waitForOptOut();
        await toggle.page.waitForTimeout(300);
        assert.equal(toggle.store.get(PREFERENCE_KEY), true, 'fixture committed the opt-out before its release');
        assert.equal(toggle.page.url(), REDDIT_JAPANESE, 'puck opt-out navigated before its dedicated write committed');
        toggle.releaseOptOut();
        await toggle.page.waitForURL(REDDIT_DEFAULT);
        await ready(toggle.page);
        assert.equal(toggle.store.get(PREFERENCE_KEY), false, 'puck opt-out did not persist');
        await toggle.page.reload({ waitUntil: 'domcontentloaded' });
        await ready(toggle.page);
        assert.equal(toggle.page.url(), REDDIT_DEFAULT, 'saved off preference bounced on reload');
        await clickPreference(toggle.page);
        await toggle.page.waitForURL(REDDIT_JAPANESE);
        await ready(toggle.page);
        assert.equal(toggle.store.get(PREFERENCE_KEY), true, 'puck opt-in did not persist');
        await toggle.page.reload({ waitUntil: 'domcontentloaded' });
        await ready(toggle.page);
        assert.equal(toggle.page.url(), REDDIT_JAPANESE, 'saved Japanese preference did not converge');
        reports.push({ scenario: 'puck-delayed-save-off-reload-on-reload', navigations: toggle.navigations });
    } finally {
        toggle.releaseOptOut();
        await toggle.context.close();
    }
    return reports;
}

async function openFixture(browser, { scriptPath, cssPath, enabled }) {
    const context = await browser.newContext({ bypassCSP: true, locale: 'en-GB' });
    const page = await context.newPage();
    const store = new Map([[SETTINGS_KEY, SETTINGS], [PREFERENCE_KEY, enabled]]);
    const navigations = [];
    let hold = false;
    let release = () => {};
    let notifyStarted;
    const started = new Promise(resolve => { notifyStarted = resolve; });
    await page.exposeFunction('__siteLanguageFixtureGet', (key, fallback) => store.has(key) ? store.get(key) : fallback);
    await page.exposeFunction('__siteLanguageFixtureSet', async (key, value) => {
        if (hold && key === PREFERENCE_KEY && value === false) {
            notifyStarted();
            await new Promise(resolve => { release = resolve; });
        }
        store.set(key, value);
    });
    await page.exposeFunction('__siteLanguageFixtureDelete', key => { store.delete(key); });
    await page.exposeFunction('__siteLanguageFixtureKeys', () => [...store.keys()]);
    await page.route('**/*', route => route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><html lang="en"><head><title>Site language convergence fixture</title>'
            + (new URL(route.request().url()).hostname.endsWith('.wikipedia.org')
                ? '<link rel="alternate" hreflang="ja" href="https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E">'
                    + '<link rel="alternate" hreflang="x-default" href="https://en.wikipedia.org/wiki/Japanese_language">'
                : '')
            + '<script>window.siteLanguageFixtureStartupLanguage = navigator.language</script>'
            + '</head><body><main>Fixture content</main></body></html>',
    }));
    const prefixContent = `(${installFixtureBridge.toString()})(${JSON.stringify({ css: readFileSync(cssPath, 'utf8'), cache: CACHE_KEY })});`;
    await addUserscriptGraphInitScripts(page, scriptPath, { prefixContent });
    page.on('framenavigated', frame => {
        if (frame === page.mainFrame() && frame.url() !== 'about:blank') navigations.push(frame.url());
    });
    return {
        context, page, store, navigations,
        holdOptOut: () => { hold = true; },
        waitForOptOut: async () => {
            let timer;
            try {
                await Promise.race([
                    started,
                    new Promise((_, reject) => {
                        timer = setTimeout(() => reject(new Error(`puck did not start a dedicated preference write; navigations: ${JSON.stringify(navigations)}`)), 5000);
                    }),
                ]);
            } finally { clearTimeout(timer); }
        },
        releaseOptOut: () => { hold = false; release(); },
    };
}

function installFixtureBridge({ css, cache }) {
    // Seed each origin once exactly as an earlier installed Reader left it.
    if (!localStorage.getItem('site-language-fixture-seeded')) {
        localStorage.setItem('site-language-fixture-seeded', 'true');
        localStorage.setItem('yomu:web-storage-epoch:v1:local', '0:legacy');
        localStorage.setItem(cache, 'true');
    }
    globalThis.unsafeWindow = window;
    globalThis.GM = {
        getValue: (key, fallback) => globalThis.__siteLanguageFixtureGet(key, fallback),
        setValue: (key, value) => globalThis.__siteLanguageFixtureSet(key, value),
        deleteValue: key => globalThis.__siteLanguageFixtureDelete(key),
        listValues: () => globalThis.__siteLanguageFixtureKeys(),
        getResourceText: async () => css,
        registerMenuCommand: () => {},
    };
    globalThis.GM_getResourceText = () => css;
    globalThis.GM_addStyle = text => {
        const style = document.createElement('style');
        style.textContent = text;
        (document.head || document.documentElement).append(style);
        return style;
    };
}

async function ready(page) {
    await page.waitForSelector('#jpdb-reader-runtime-owner[data-yomu-runtime-health="ready"]', { state: 'attached' });
    await page.locator('.jpdb-reader-fab').waitFor();
}

async function clickPreference(page) {
    await page.locator('.jpdb-reader-fab').click();
    await page.locator('[data-radial-id="japanese-site"]').click();
}
