#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    createSmokePaths,
    jsonHttpResponse,
    mockJpdbParseFromVocabulary,
    readJsonBody,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';

const { root: ROOT, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH } = createSmokePaths(import.meta.dirname);
const PAGE_PATH = '/popover-action-pills.html';
const LOOKUP_WORD = '先生';
const VOCABULARY = [
    ['先生', '先生', 'せんせい', 'teacher', ['noun'], 1200, ['not-in-deck'], ['heiban']],
    ['日本語', '日本語', 'にほんご', 'Japanese language', ['noun'], 800, ['known'], ['heiban']],
];

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: 'mock-jpdb-key',
    jitenApiKey: '',
    jpdbDefinitionsEnabled: false,
    showPitchAccent: false,
    localDictionariesEnabled: false,
    ankiEnabled: false,
    ankiSectionEnabled: false,
    newTabAnkiEnabled: false,
    audioEnabled: false,
    autoPlayAudio: false,
    lookupOnHover: true,
    lookupOnClick: true,
    hoverOpenDelayMs: 0,
    hoverCloseDelayMs: 300,
    popupActivationMode: 'hover',
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    showFloatingButton: false,
    enableLogging: false,
    dictionaryLookupLinks: [
        { id: 'yomu-search', label: 'Yomu', urlTemplate: 'https://hrussellzfac023.github.io/yomu-reader/newtab/index.html?q={query}', enabled: true },
        { id: 'jiten', label: 'Jiten', urlTemplate: 'https://jiten.moe/parse?text={query}', enabled: true },
        { id: 'jpdb', label: 'JPDB', urlTemplate: 'https://jpdb.io/search?q={query}', enabled: true },
        { id: 'bunpro', label: 'Bunpro', urlTemplate: 'https://bunpro.jp/search?query={query}', enabled: true },
        { id: 'jisho', label: 'Jisho', urlTemplate: 'https://jisho.org/search/{query}', enabled: true },
        { id: 'copy', label: 'Copy', urlTemplate: '', enabled: true, action: 'copy' },
    ],
};

mkdirSync(ARTIFACTS, { recursive: true });
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH], ROOT, 'Run npm run build first.');

const server = await startLoopbackServer((request, response) => {
    if (new URL(request.url ?? '/', 'http://127.0.0.1').pathname !== PAGE_PATH) {
        response.writeHead(404, { 'content-type': 'text/plain' });
        response.end('Not found');
        return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>popover action pills</title></head>
<body><main><p data-smoke-sentence>日本語の先生がゆっくり話します。</p></main></body></html>`);
}, 'Could not bind popover action pill smoke server');

const requests = [];
const browser = await chromium.launch({ headless: true });

try {
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1024, height: 768 } });
    const page = await context.newPage();
    await page.exposeFunction('__yomuPopoverActionRequest', request => handleYomuRequest(request, requests));
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: settings,
        requestBridgeName: '__yomuPopoverActionRequest',
    });
    await page.addInitScript(() => {
        window.__yomuOpenedTabs = [];
        window.GM_openInTab = (url, options) => {
            window.__yomuOpenedTabs.push({ url: String(url), options });
            return { close: () => undefined };
        };
        window.open = (url, target, features) => {
            window.__yomuOpenedTabs.push({ url: String(url), options: { target, features, via: 'window.open' } });
            return { opener: null, close: () => undefined };
        };
        window.GM = { ...(window.GM ?? {}), openInTab: window.GM_openInTab };
    });
    await page.goto(`${server.origin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ path: CSS_PATH });
    await page.addScriptTag({ path: SCRIPT_PATH });
    await page.waitForFunction(() => document.querySelectorAll('[data-smoke-sentence] .jpdb-reader-word').length >= 2, null, { timeout: 15_000 });

    const word = page.locator('[data-smoke-sentence] .jpdb-reader-word', { hasText: LOOKUP_WORD }).first();
    await word.hover();
    await waitForPopoverHeading(page, LOOKUP_WORD);

    const opened = [];
    for (const [label, urlPrefix] of expectedPillTargets(LOOKUP_WORD)) {
        opened.push(await clickActionPillAndAssertOpen(page, word, LOOKUP_WORD, label, urlPrefix));
    }
    let toastText = '';
    if (!process.env.YOMU_PILLS_LINKS_ONLY) {
        await word.hover();
        await waitForPopoverHeading(page, LOOKUP_WORD);
        await page.locator('.jpdb-reader-popover .jpdb-reader-copy-pill').first().click();
        await page.waitForFunction(() => Array.from(document.querySelectorAll('.jpdb-reader-toast'))
            .some(toast => /Copied word/i.test(toast.textContent ?? '')), null, { timeout: 5_000 });
        toastText = await page.evaluate(() => Array.from(document.querySelectorAll('.jpdb-reader-toast'))
            .map(toast => toast.textContent?.trim() ?? '')
            .find(text => /Copied word/i.test(text)) ?? '');
        assert(/Copied word/i.test(toastText), 'Copy pill did not show visible feedback', { toastText });
    }

    const report = { ok: true, word: LOOKUP_WORD, opened, toastText, requests };
    writeFileSync(path.join(ARTIFACTS, 'popover-action-pills-smoke.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await context.close();
} finally {
    await closeSmokeBrowserAndServer(browser, server.server);
}

function handleYomuRequest(request, requestsLog) {
    const url = new URL(request.url);
    if (url.origin === 'https://jpdb.io' && url.pathname === '/api/v1/parse') {
        const body = readJsonBody(request.data);
        requestsLog.push({ kind: 'jpdb-parse', text: body.text });
        return jsonHttpResponse(mockJpdbParseFromVocabulary(body, VOCABULARY));
    }
    if (url.origin === 'https://jpdb.io' && url.pathname === '/search') {
        requestsLog.push({ kind: 'jpdb-public', url: request.url });
        return { status: 200, responseText: '<!doctype html><html><body></body></html>', contentType: 'text/html; charset=utf-8' };
    }
    requestsLog.push({ kind: 'unexpected', url: request.url });
    return { status: 404, responseText: '' };
}

function expectedPillTargets(query) {
    const encoded = encodeURIComponent(query);
    return [
        ['Jiten', `https://jiten.moe/parse?text=${encoded}`],
        ['JPDB', 'https://jpdb.io/vocabulary/'],
        ['Bunpro', `https://bunpro.jp/search?query=${encoded}`],
        ['Jisho', `https://jisho.org/search/${encoded}`],
        ['Yomu', `https://hrussellzfac023.github.io/yomu-reader/newtab/index.html?q=${encoded}`],
    ];
}

async function waitForPopoverHeading(page, query) {
    await page.waitForFunction(
        value => document.querySelector('.jpdb-reader-popover .jpdb-reader-spelling')?.textContent?.includes(value),
        query,
        { timeout: 8_000 },
    );
}

async function clickActionPillAndAssertOpen(page, word, query, label, urlPrefix) {
    await word.hover();
    await waitForPopoverHeading(page, query);
    const popover = page.locator('.jpdb-reader-popover')
        .filter({ has: page.locator('.jpdb-reader-spelling', { hasText: query }) })
        .last();
    const link = popover.locator('a.jpdb-reader-action-pill', { hasText: label }).first();
    const href = await link.getAttribute('href');
    assert(String(href ?? '').startsWith(urlPrefix), `${label} pill href does not target the expected URL`, { href, urlPrefix });
    const before = await page.evaluate(() => (window.__yomuOpenedTabs ?? []).length);
    const popupPromise = page.waitForEvent('popup', { timeout: 2_000 }).catch(() => null);
    await link.click();
    const recorded = await page.waitForFunction(
        ({ count, prefix }) => (window.__yomuOpenedTabs ?? []).length > count
            && (window.__yomuOpenedTabs ?? []).some(item => String(item.url).startsWith(prefix)),
        { count: before, prefix: urlPrefix },
        { timeout: 1_500 },
    ).then(() => true).catch(() => false);
    const popup = recorded ? null : await popupPromise;
    assert(recorded || Boolean(popup), `${label} pill did not dispatch a tab/window open`, {
        href,
        openedTabs: await page.evaluate(() => window.__yomuOpenedTabs ?? []),
    });
    await popup?.close().catch(() => undefined);
    return { label, href };
}
