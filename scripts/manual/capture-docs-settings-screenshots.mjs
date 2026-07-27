#!/usr/bin/env node
// Capture the docs settings screenshots from the real built Yomu settings dialog.
//
// The operator-run capture in scripts/manual/capture-real-screenshots.mjs drives live
// sites (Wikipedia, YouTube, CIJ, manga hosts) and needs a human plus real API keys, so
// the settings shots it owns went stale for two months. Settings needs none of that: the
// dialog is the same built userscript UI whether it is opened over Wikipedia or over the
// hosted Study page, so this script opens it on the locally served Study build and clips
// the dialog. Same harness as scripts/manual/settings-layout-smoke.mjs, same fixture
// server, same jpdb/jiten mocks - it just writes docs/public/screenshots instead of
// qa-artifacts, and it asserts the panel actually rendered before it writes a file.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import {
    YOMU_SETTINGS_KEY,
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    createSmokePaths,
    escapeHtml,
    serveFile,
    startLoopbackServer,
} from '../lib/smoke-harness.mjs';

const paths = createSmokePaths(import.meta.dirname);
const NEWTAB_DIR = paths.newTabDir;
const PUBLIC_DIR = path.join(paths.root, 'docs', 'public');
const SCREENSHOT_DIR = path.join(PUBLIC_DIR, 'screenshots');
const NEWTAB_BASE_PATH = '/yomu-reader/newtab/';
const JPDB_ORIGIN = 'https://jpdb.io';
const JITEN_ORIGIN = 'https://api.jiten.moe';
const YOMU_PUBLIC_PROXY_ORIGIN = 'https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev';
const STATIC_CONTENT_TYPES = new Map([
    ['.js', 'text/javascript; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.svg', 'image/svg+xml; charset=utf-8'],
    ['.png', 'image/png'],
]);
const VOCABULARY_READINGS = new Map([
    ['設定', 'せってい'],
    ['音声', 'おんせい'],
    ['表示', 'ひょうじ'],
    ['再生', 'さいせい'],
    ['翻訳', 'ほんやく'],
    ['画像', 'がぞう'],
    ['例文', 'れいぶん'],
    ['検索', 'けんさく'],
    ['外観', 'がいかん'],
    ['単語', 'たんご'],
    ['漢字', 'かんじ'],
    ['読み取る', 'よみとる'],
]);
const JITEN_FIXTURES = new Map();

const DOCS_VERSION_URL = 'https://hrussellzfac023.github.io/yomu-reader/study/version.json';
const YOMU_VERSION = JSON.parse(readFileSync(path.join(paths.root, 'package.json'), 'utf8')).version;

const BASE_SETTINGS = {
    onboardingSeen: true,
    theme: 'dark',
    interfaceLanguage: 'en',
    apiKey: '',
    jitenApiKey: '',
    jpdbDefinitionsEnabled: false,
    localDictionariesEnabled: true,
    ankiEnabled: false,
    ankiSectionEnabled: false,
    newTabEnabled: true,
    newTabAnkiEnabled: false,
    audioEnabled: true,
    autoPlayAudio: false,
    audioEnableDefaultSources: true,
    lookupOnClick: false,
    showFloatingButton: false,
    enableLogging: false,
};

const SCENARIOS = [
    {
        id: 'dictionaries',
        panel: 'dictionaries',
        output: 'real-dictionaries.png',
        clip: '.jpdb-reader-settings',
        viewport: { width: 1120, height: 940 },
        // The Sources tab is only worth publishing once the real dictionary catalogue has
        // rendered; an empty shell would ship a screenshot of a loading state.
        requireRows: '[data-settings-panel="dictionaries"]:not([hidden]) [data-dictionary-id]',
        minimumRows: 3,
    },
    {
        id: 'ocr',
        panel: 'media',
        output: 'real-ocr-settings.png',
        clip: '#jpdb-reader-settings-panel-ocr',
        viewport: { width: 1120, height: 940 },
    },
    {
        id: 'help',
        panel: 'help',
        output: 'real-help-settings.png',
        clip: '.jpdb-reader-settings',
        viewport: { width: 1120, height: 940 },
    },
];

const requestedIds = parseScenarioIds(process.argv.slice(2));
const scenarios = requestedIds.length
    ? SCENARIOS.filter(scenario => requestedIds.includes(scenario.id))
    : SCENARIOS;
assert(scenarios.length > 0, `No capture scenarios matched ${requestedIds.join(',')}`);

assertBuiltArtifacts([
    path.join(NEWTAB_DIR, 'index.html'),
    path.join(NEWTAB_DIR, 'app.js'),
    path.join(NEWTAB_DIR, 'styles.css'),
], paths.root);
mkdirSync(SCREENSHOT_DIR, { recursive: true });

let browser;
let server;
try {
    server = await startLoopbackServer(serveHostedNewTabRequest, 'Could not bind docs screenshot server');
    browser = await chromium.launch();
    const captured = [];
    for (const scenario of scenarios) captured.push(await capture(browser, server.baseUrl, scenario));
    console.log(JSON.stringify({ ok: true, captured }, null, 2));
} finally {
    if (browser && server) await closeSmokeBrowserAndServer(browser, server);
    else if (browser) await browser.close().catch(() => undefined);
    else if (server) await server.close?.().catch(() => undefined);
}

function parseScenarioIds(argv) {
    return argv
        .flatMap(arg => (arg.startsWith('--scenario=') ? arg.slice('--scenario='.length).split(',') : []))
        .map(id => id.trim())
        .filter(Boolean);
}

async function capture(browserInstance, baseUrl, scenario) {
    const context = await browserInstance.newContext({
        bypassCSP: true,
        viewport: scenario.viewport,
        deviceScaleFactor: 2,
        colorScheme: 'dark',
    });
    const page = await context.newPage();
    const requests = [];
    await page.addInitScript(({ key, value }) => {
        localStorage.setItem(key, JSON.stringify(value));
    }, { key: YOMU_SETTINGS_KEY, value: BASE_SETTINGS });
    // Docs readers run Yomu under a userscript manager, so the Help tab they see reports a
    // manager-backed update flow. A bare headless page reports "no userscript manager was
    // detected here", which would be a true statement about this harness and a false one
    // about the product. Seed the same GM surface a real install exposes and answer the
    // hosted version check locally, so the captured Help tab is the one users get.
    await page.addInitScript(handler => {
        Object.defineProperty(window, 'GM_info', {
            value: { scriptHandler: handler, version: '5.3.3' },
            configurable: true,
        });
        window.GM_openInTab = () => undefined;
    }, 'Tampermonkey');
    await page.route(`${DOCS_VERSION_URL}*`, route => route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ version: YOMU_VERSION, build: YOMU_VERSION }),
        headers: { 'access-control-allow-origin': '*' },
    }));
    await page.route('https://jpdb.io/**', route => route.fulfill(mockedJpdbRoute(route.request(), requests)));
    await page.route('https://api.jiten.moe/**', route => route.fulfill(mockedJitenRoute(route.request(), requests)));
    await page.route(`${YOMU_PUBLIC_PROXY_ORIGIN}/**`, route => route.fulfill(mockedProxyRoute(route.request(), requests)));
    try {
        await page.goto(`${baseUrl}${NEWTAB_BASE_PATH}index.html?q=${encodeURIComponent('読み取る')}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-jpdb-reader-root].jpdb-reader-newtab', { timeout: 15_000 });
        await openSettingsFromNewTabMenu(page);
        await selectSettingsPanel(page, scenario.panel);
        if (scenario.requireRows) await waitForPanelRows(page, scenario.requireRows, scenario.minimumRows ?? 1);
        await page.waitForTimeout(600);
        const target = page.locator(scenario.clip).first();
        await target.waitFor({ state: 'visible', timeout: 10_000 });
        await target.scrollIntoViewIfNeeded();
        await page.waitForTimeout(250);
        const box = await target.boundingBox();
        assert(box && box.width > 320 && box.height > 200, `${scenario.id} clip target is too small to publish`, { box });
        const output = path.join(SCREENSHOT_DIR, scenario.output);
        await target.screenshot({ path: output });
        return { id: scenario.id, panel: scenario.panel, output, box, requestCount: requests.length };
    } finally {
        await context.close();
    }
}

async function openSettingsFromNewTabMenu(page) {
    await page.locator('.jpdb-reader-newtab-more summary').click();
    await page.locator('.jpdb-reader-newtab-menu-item[data-newtab-action="settings"]').first().click();
    await page.waitForSelector('.jpdb-reader-settings', { timeout: 10_000 });
}

async function selectSettingsPanel(page, panel) {
    const selector = `.jpdb-reader-settings [data-action="settings-panel"][data-panel="${panel}"]`;
    await page.waitForSelector(selector, { state: 'attached', timeout: 10_000 });
    await page.evaluate(tabSelector => {
        document.querySelector(tabSelector)?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }, selector);
    await page.waitForSelector(`.jpdb-reader-settings [data-settings-panel="${panel}"]:not([hidden])`, { timeout: 10_000 });
}

async function waitForPanelRows(page, selector, minimumRows) {
    await page.waitForFunction(
        ({ rowSelector, minimum }) => document.querySelectorAll(rowSelector).length >= minimum,
        { rowSelector: selector, minimum: minimumRows },
        { timeout: 30_000 },
    );
}

function serveHostedNewTabRequest(request, response) {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === NEWTAB_BASE_PATH || url.pathname === `${NEWTAB_BASE_PATH}index.html`) {
        serveFile(response, path.join(NEWTAB_DIR, 'index.html'), 'text/html; charset=utf-8', request.method);
        return;
    }
    if (url.pathname.startsWith(NEWTAB_BASE_PATH)) {
        const filePath = path.join(NEWTAB_DIR, url.pathname.slice(NEWTAB_BASE_PATH.length));
        if (serveOptionalFile(response, filePath, contentTypeForFile(filePath), request.method)) return;
    }
    const publicPath = path.join(PUBLIC_DIR, url.pathname.replace(/^\/yomu-reader\//, ''));
    if (serveOptionalFile(response, publicPath, contentTypeForFile(publicPath), request.method)) return;
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
}

function serveOptionalFile(response, filePath, contentType, method = 'GET') {
    if (!existsSync(filePath)) return false;
    serveFile(response, filePath, contentType, method);
    return true;
}

function contentTypeForFile(filePath) {
    return [...STATIC_CONTENT_TYPES].find(([extension]) => filePath.endsWith(extension))?.[1]
        ?? 'application/octet-stream';
}

function mockedJpdbRoute(request, requests) {
    requests.push({ method: request.method(), url: request.url() });
    return corsJson(mockedJpdbResponse(request.url()));
}

function mockedJitenRoute(request, requests) {
    requests.push({ method: request.method(), url: request.url() });
    return corsJson(mockedJitenResponse(request.url(), request.method()));
}

function mockedProxyRoute(request, requests) {
    const proxyUrl = new URL(request.url());
    const targetUrl = proxyUrl.searchParams.get('url') ?? '';
    requests.push({ method: request.method(), url: request.url(), targetUrl });
    if (!targetUrl) return corsJson({ status: 404, contentType: 'application/json; charset=utf-8', body: '{}' });
    const target = new URL(targetUrl);
    if (target.origin === JPDB_ORIGIN) return corsJson(mockedJpdbResponse(target.href));
    if (target.origin === JITEN_ORIGIN) return corsJson(mockedJitenResponse(target.href, request.method()));
    return corsJson({ status: 404, contentType: 'application/json; charset=utf-8', body: '{}' });
}

function corsJson(response) {
    return { ...response, headers: { 'access-control-allow-origin': '*' } };
}

function mockedJitenResponse(rawUrl, method = 'GET') {
    const url = new URL(rawUrl, JITEN_ORIGIN);
    if (method === 'OPTIONS') return { status: 204, contentType: 'text/plain; charset=utf-8', body: '' };
    if (url.pathname === '/api/vocabulary/parse') {
        return jsonBody(jitenParseWords(url.searchParams.get('text') ?? ''));
    }
    const match = url.pathname.match(/^\/api\/vocabulary\/(\d+)\/(\d+)\/info$/u);
    if (match) return jsonBody(jitenVocabularyInfo(Number(match[1]), Number(match[2])));
    return { status: 404, contentType: 'application/json; charset=utf-8', body: '{}' };
}

function jsonBody(value) {
    return { status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(value) };
}

function mockedJpdbResponse(rawUrl) {
    const url = new URL(rawUrl, JPDB_ORIGIN);
    const query = url.searchParams.get('q') || vocabularyFromPath(url.pathname).spelling || '設定';
    const { spelling, reading } = vocabularyForQuery(query);
    return { status: 200, contentType: 'text/html; charset=utf-8', body: jpdbVocabularyHtml(spelling, reading) };
}

function vocabularyForQuery(query) {
    const normalized = query.replace(/\s+/g, '').trim();
    const direct = VOCABULARY_READINGS.get(normalized);
    if (direct) return { spelling: normalized, reading: direct };
    const kanji = normalized.match(/[一-龯々〆ヶ]{1,6}/u)?.[0] ?? normalized.match(/[ぁ-んァ-ンー]{2,}/u)?.[0] ?? '設定';
    return { spelling: kanji, reading: VOCABULARY_READINGS.get(kanji) ?? 'よみ' };
}

function vocabularyFromPath(pathname) {
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] !== 'vocabulary') return { spelling: '', reading: '' };
    return { spelling: decodeURIComponent(parts[2] ?? ''), reading: decodeURIComponent(parts[3] ?? '') };
}

function jpdbVocabularyHtml(spelling, reading) {
    const href = `/vocabulary/${stableVocabularyId(spelling)}/${encodeURIComponent(spelling)}/${encodeURIComponent(reading)}#a`;
    return `<!doctype html>
<html lang="ja">
<head><link rel="canonical" href="https://jpdb.io${href}"></head>
<body>
  <div class="results search">
    <div class="result vocabulary">
      <a href="${href}">${escapeHtml(spelling)}</a>
      <div class="subsection-headword">
        <div class="primary-spelling"><div class="spelling">${rubyHtml(spelling, reading)}</div></div>
      </div>
      <div class="subsection-meanings">
        <div class="part-of-speech"><div>Noun</div></div>
        <div class="description">1. docs screenshot fixture vocabulary</div>
      </div>
      <div class="subsection-pitch-accent">
        <div class="subsection">
          <div>
            <div>
              <div style="background-image: linear-gradient(to top,var(--pitch-low-s),var(--pitch-low-e));"><div>${escapeHtml(firstMora(reading))}</div></div>
              <div style="background-image: linear-gradient(to bottom,var(--pitch-high-s),var(--pitch-high-e));"><div>${escapeHtml(restMorae(reading))}</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function jitenParseWords(text) {
    const fixtures = [];
    const seen = new Set();
    const add = spelling => {
        const fixture = jitenFixtureForSpelling(spelling);
        if (!fixture || seen.has(fixture.wordId)) return;
        seen.add(fixture.wordId);
        fixtures.push(fixture);
    };
    for (const [spelling] of VOCABULARY_READINGS) {
        if (text.includes(spelling)) add(spelling);
    }
    for (const match of text.matchAll(/[一-龯々〆ヶぁ-んァ-ンー]{2,}/gu)) add(match[0]);
    return fixtures.map(fixture => ({
        wordId: fixture.wordId,
        originalText: fixture.spelling,
        readingIndex: 0,
        conjugations: [],
    }));
}

function jitenVocabularyInfo(wordId, readingIndex) {
    const fixture = [...JITEN_FIXTURES.values()].find(item => item.wordId === wordId);
    if (!fixture) return {};
    const { spelling, reading } = fixture;
    return {
        wordId,
        mainReading: {
            text: spelling === reading ? spelling : `${spelling}[${reading}]`,
            readingIndex,
            frequencyRank: 1000 + readingIndex,
            usedInMediaAmount: 1,
        },
        alternativeReadings: [],
        partsOfSpeech: ['n'],
        definitions: [{ index: 1, meanings: ['docs screenshot fixture vocabulary'], partsOfSpeech: ['noun'] }],
        pitchAccents: [pitchPositionForReading(reading)],
        knownStates: [],
        composedOf: [],
        usedIn: [],
        usedInTotal: 0,
    };
}

function jitenFixtureForSpelling(rawSpelling) {
    const spelling = String(rawSpelling || '').replace(/\s+/g, '').trim();
    if (!spelling) return null;
    const existing = JITEN_FIXTURES.get(spelling);
    if (existing) return existing;
    const reading = VOCABULARY_READINGS.get(spelling)
        ?? (/^[ぁ-んァ-ンー]+$/u.test(spelling) ? spelling : 'よみ');
    const fixture = { wordId: stableVocabularyId(spelling), spelling, reading };
    JITEN_FIXTURES.set(spelling, fixture);
    return fixture;
}

function pitchPositionForReading(reading) {
    return Math.min(2, Math.max(0, Array.from(reading).length - 1));
}

function rubyHtml(spelling, reading) {
    if (!/[一-龯々〆ヶ]/u.test(spelling)) return escapeHtml(spelling);
    return `<ruby>${escapeHtml(spelling)}<rt>${escapeHtml(reading)}</rt></ruby>`;
}

function firstMora(reading) {
    return Array.from(reading || 'よ')[0] ?? 'よ';
}

function restMorae(reading) {
    const rest = Array.from(reading || 'み').slice(1).join('');
    return rest || 'み';
}

function stableVocabularyId(value) {
    let hash = 0;
    for (const char of value) hash = (hash * 31 + char.codePointAt(0)) % 900_000;
    return 100_000 + hash;
}
