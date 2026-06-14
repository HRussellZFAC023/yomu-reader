#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeServer,
    createSmokePaths,
    jsonHttpResponse,
    launchSmokeBrowser,
    mockJpdbParseFromVocabulary,
    readJsonBody,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const {
    root: ROOT,
    artifacts: ARTIFACTS,
    scriptPath: SCRIPT_PATH,
    cssPath: CSS_PATH,
    newTabDir: NEWTAB_DIR,
} = createSmokePaths(import.meta.dirname);
const NEWTAB_CSS_PATH = path.join(NEWTAB_DIR, 'styles.css');
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH, NEWTAB_CSS_PATH], ROOT, 'Run npm run build first.');
mkdirSync(ARTIFACTS, { recursive: true });

const VOCABULARY = [
    ['日本語', '日本語', 'にほんご', 'Japanese', ['n'], 100, ['not-in-deck'], ['LHHH']],
    ['読む', '読む', 'よむ', 'to read', ['v5m'], 400, ['not-in-deck'], ['LH']],
    ['青空', '青空', 'あおぞら', 'blue sky', ['n'], 1200, ['not-in-deck'], ['LHHH']],
    ['辞書', '辞書', 'じしょ', 'dictionary', ['n'], 900, ['not-in-deck'], ['LHH']],
    ['追加', '追加', 'ついか', 'add', ['n'], 850, ['not-in-deck'], ['LHH']],
    ['設定', '設定', 'せってい', 'settings', ['n'], 650, ['not-in-deck'], ['LHHH']],
    ['開く', '開く', 'ひらく', 'open', ['v5k'], 700, ['not-in-deck'], ['LHH']],
    ['手順', '手順', 'てじゅん', 'steps', ['n'], 1100, ['not-in-deck'], ['LHHH']],
    ['検索', '検索', 'けんさく', 'search', ['n'], 500, ['not-in-deck'], ['LHHH']],
    ['復習', '復習', 'ふくしゅう', 'review', ['n'], 820, ['not-in-deck'], ['LHHH']],
];

const SETTINGS = {
    onboardingSeen: true,
    interfaceLanguage: 'ja',
    apiKey: 'mock-jpdb-token',
    jitenApiKey: '',
    jpdbDefinitionsEnabled: false,
    localDictionariesEnabled: false,
    ankiEnabled: false,
    ankiSectionEnabled: false,
    newTabAnkiEnabled: false,
    audioEnabled: false,
    autoPlayAudio: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    lookupOnClick: true,
    lookupOnHover: false,
    popupActivationMode: 'click',
    showFloatingButton: false,
    showFurigana: true,
    furiganaMode: 'all',
    showPitchAccent: true,
    wordHighlightColorSource: 'off',
    wordUnderlineColorSource: 'pitch',
    wordTextColorSource: 'pitch',
    enableLogging: Boolean(process.env.SMOKE_DEBUG),
};

const server = await startLoopbackServer(serveFixture, 'Could not bind enhancement coverage smoke server');
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
const requests = [];

try {
    const docs = await runCoveragePage('/yomu-reader/', 'docs');
    const newtab = await runCoveragePage('/yomu-reader/newtab-smoke/?q=%E3%82%88%E3%82%80', 'newtab');
    const report = { docs, newtab, requests };
    const reportPath = path.join(ARTIFACTS, 'enhancement-coverage.json');
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    console.log(`Enhancement coverage smoke passed: ${reportPath}`);
} finally {
    await browser.close().catch(() => undefined);
    server.server.closeAllConnections?.();
    server.server.closeIdleConnections?.();
    await closeServer(server.server);
}

async function runCoveragePage(pagePath, name) {
    const context = await browser.newContext({
        bypassCSP: true,
        locale: 'ja-JP',
        viewport: { width: 1100, height: 760 },
        deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.on('console', message => {
        if (process.env.SMOKE_DEBUG) console.error(`[${name}]`, message.type(), message.text());
    });
    page.on('pageerror', error => {
        if (process.env.SMOKE_DEBUG) console.error(`[${name} pageerror]`, error.message);
    });
    await page.exposeFunction('__yomuEnhancementCoverageRequest', request => handleYomuRequest(request, requests));
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: SETTINGS,
        requestBridgeName: '__yomuEnhancementCoverageRequest',
    });
    await page.goto(`${server.origin}${pagePath}`, { waitUntil: 'domcontentloaded' });
    await installUserscriptCssResource(page, CSS_PATH);
    await page.addStyleTag({ path: NEWTAB_CSS_PATH });
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
    await page.waitForFunction(() => document.querySelectorAll('.jpdb-reader-word.jpdb-pitch-heiban, .jpdb-reader-word.jpdb-pitch-atamadaka, .jpdb-reader-word.jpdb-pitch-nakadaka').length >= 4, null, { timeout: 20_000 });
    await page.waitForTimeout(180);

    const state = await page.evaluate(() => {
        const words = [...document.querySelectorAll('.jpdb-reader-word')].filter(word => word instanceof HTMLElement);
        return {
            url: location.href,
            wordCount: words.length,
            rubyCount: words.filter(word => word.querySelector('rt,.jpdb-reader-furi')).length,
            pitchCount: words.filter(word => /\bjpdb-pitch-(?:heiban|atamadaka|nakadaka|odaka|kifuku)\b/u.test(word.className)).length,
            surfaces: words.map(word => ({
                text: word.dataset.expression || word.textContent?.trim() || '',
                passive: word.dataset.jpdbReaderPassive === 'true',
                hasRuby: Boolean(word.querySelector('rt,.jpdb-reader-furi')),
                pitch: word.dataset.pitchClass || '',
                scope: scopeName(word),
            })),
            underline: underlineMeasures(words),
        };

        function scopeName(word) {
            if (word.closest('.VPHomeHero')) return 'hero';
            if (word.closest('.yomu-link-card')) return 'card';
            if (word.closest('.yomu-install-step-link')) return 'install';
            if (word.closest('button')) return 'button';
            if (word.closest('[data-newtab-fixture]')) return 'newtab';
            return 'other';
        }

        function underlineMeasures(words) {
            return words
                .filter(word => ['hero', 'card', 'install', 'button', 'newtab'].includes(scopeName(word)))
                .map(word => {
                    const rect = word.getBoundingClientRect();
                    const style = getComputedStyle(word);
                    const after = getComputedStyle(word, '::after');
                    return {
                        text: word.dataset.expression || word.textContent?.trim() || '',
                        scope: scopeName(word),
                        hasRuby: Boolean(word.querySelector('rt,.jpdb-reader-furi')),
                        lineHeight: style.lineHeight,
                        lineTop: Math.round(rect.top),
                        bottom: Math.round(rect.bottom * 100) / 100,
                        insetBlockEnd: after.insetBlockEnd || after.bottom,
                        borderBlockEndColor: after.borderBlockEndColor || after.borderBottomColor,
                    };
                });
        }
    });

    const screenshot = path.join(ARTIFACTS, `enhancement-coverage-${name}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await context.close();

    assert(state.wordCount >= 8, `${name} page did not render enough reader words`, state);
    assert(state.rubyCount >= 4, `${name} page did not render enough ruby coverage`, state);
    assert(state.pitchCount >= 4, `${name} page did not render enough pitch-colored words`, state);
    assertExpectedSurfaces(name, state);
    assertUnderlineBaselines(name, state);
    return { ...state, screenshot };
}

function assertExpectedSurfaces(name, state) {
    const expected = name === 'docs'
        ? [
            ['日本語', 'hero'],
            ['辞書', 'card'],
            ['追加', 'install'],
            ['設定', 'button'],
        ]
        : [
            ['検索', 'newtab'],
            ['日本語', 'newtab'],
            ['復習', 'newtab'],
            ['読む', 'newtab'],
        ];
    for (const [text, scope] of expected) {
        const match = state.surfaces.find(surface => surface.text === text && surface.scope === scope);
        assert(match, `${name} page did not enhance ${scope} text "${text}"`, { expected, surfaces: state.surfaces });
        assert(match.hasRuby, `${name} page enhanced ${text} without ruby`, match);
        assert(match.pitch && match.pitch !== 'unknown', `${name} page enhanced ${text} without pitch`, match);
    }
}

function assertUnderlineBaselines(name, state) {
    const visible = state.underline.filter(item => !isTransparentColor(item.borderBlockEndColor));
    assert(visible.length >= 4, `${name} page did not paint enough pitch underlines`, { underline: state.underline });
    for (const [scope, items] of groupedByLine(visible)) {
        if (items.length < 2) continue;
        const bottoms = items.map(item => item.bottom);
        const spread = Math.max(...bottoms) - Math.min(...bottoms);
        assert(spread <= 1.5, `${name} ${scope} underline baselines drifted`, { spread, items });
    }
}

function groupedByLine(items) {
    const groups = new Map();
    for (const item of items) {
        const key = `${item.scope}:${item.lineTop}`;
        const scoped = groups.get(key) ?? [];
        scoped.push(item);
        groups.set(key, scoped);
    }
    return groups;
}

function isTransparentColor(value) {
    const normalized = String(value).replace(/\s+/g, '').toLowerCase();
    return !normalized || normalized === 'transparent' || normalized === 'rgba(0,0,0,0)';
}

async function handleYomuRequest(request, requestsLog) {
    const url = new URL(request.url);
    if (url.origin === 'https://jpdb.io' && url.pathname === '/api/v1/parse') {
        const body = readJsonBody(request.data);
        requestsLog.push({ kind: 'jpdb-parse', text: body.text });
        return jsonHttpResponse(mockJpdbParseFromVocabulary(body, VOCABULARY));
    }
    if (url.origin === 'https://jpdb.io' && url.pathname === '/search') {
        requestsLog.push({ kind: 'jpdb-public-pitch', url: request.url });
        return { status: 200, responseText: '<!doctype html><html><body></body></html>', contentType: 'text/html; charset=utf-8' };
    }
    requestsLog.push({ kind: 'unexpected', url: request.url });
    return { status: 404, responseText: '' };
}

function serveFixture(request, response) {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/yomu-reader/' || url.pathname === '/yomu-reader/index.html') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(docsFixtureHtml());
        return;
    }
    if (url.pathname === '/yomu-reader/newtab-smoke/' || url.pathname === '/yomu-reader/newtab-smoke/index.html') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(newtabFixtureHtml());
        return;
    }
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
}

function docsFixtureHtml() {
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>よむ docs smoke</title>
<style>
body { margin: 0; font: 18px/1.45 system-ui, sans-serif; color: #172033; }
main { padding: 42px; --jpdb-reader-source-pitch-decoration: #d33682; --jpdb-reader-source-pitch-color: #172033; }
.VPHomeHero { max-width: 760px; margin-bottom: 28px; }
.VPHomeHero .heading { margin: 0 0 8px; font-size: 42px; line-height: 1.18; }
.VPHomeHero .tagline { margin: 0; font-size: 24px; line-height: 1.36; }
.VPFeatures { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; max-width: 760px; }
.yomu-link-card, .yomu-install-step-link, button { display: inline-block; color: inherit; text-decoration: none; border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px 16px; background: #fff; }
.yomu-link-card h2 { margin: 0 0 6px; font-size: 22px; line-height: 1.3; }
.yomu-link-card p { margin: 0; line-height: 1.45; }
.yomu-install-step-link, button { margin-top: 18px; margin-right: 12px; font: inherit; }
</style></head><body>
<main class="jpdb-reader-word-underline-pitch jpdb-reader-word-text-pitch">
  <section class="VPHomeHero">
    <h1 class="heading">日本語を読む</h1>
    <p class="tagline">青空の下で本を読む</p>
  </section>
  <section class="VPFeatures">
    <a class="item yomu-link-card" href="/guide/"><h2>次の手順</h2><p>辞書を追加する</p></a>
    <a class="item yomu-link-card" href="/review/"><h2>復習の流れ</h2><p>日本語を読む</p></a>
  </section>
  <a class="yomu-install-step-link" href="/install/">今すぐ追加</a>
  <button type="button">設定を開く</button>
</main></body></html>`;
}

function newtabFixtureHtml() {
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>よむ newtab smoke</title>
<style>
body { margin: 0; font: 18px/1.45 system-ui, sans-serif; color: #172033; background: #f8fafc; }
main { padding: 42px; --jpdb-reader-source-pitch-decoration: #0f766e; --jpdb-reader-source-pitch-color: #172033; }
[data-newtab-fixture] { display: grid; gap: 16px; max-width: 820px; }
.jpdb-reader-newtab-search-card, .jpdb-reader-newtab-next-card { display: block; padding: 16px 18px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; }
h1 { margin: 0; font-size: 36px; line-height: 1.2; }
p { margin: 0; font-size: 21px; }
button { width: max-content; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px 14px; background: #fff; font: inherit; }
</style></head><body>
<main class="jpdb-reader-word-underline-pitch jpdb-reader-word-text-pitch" data-newtab-fixture>
  <h1>検索 よむ</h1>
  <section class="jpdb-reader-newtab-search-card">日本語を読む</section>
  <section class="jpdb-reader-newtab-next-card">復習の手順</section>
  <button type="button">辞書を追加</button>
</main></body></html>`;
}
