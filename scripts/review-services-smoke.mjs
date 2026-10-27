#!/usr/bin/env node
// Connecting a review service is obvious (W1-61).
//
// Drives the BUILT Study app (dist/newtab, served as https://yomureader.com/study/)
// the way a learner sets up grading: Settings → Reviews, in English and
// Japanese, in Chromium at desktop size and in WebKit at iPad size with touch.
//
//   * The tab says Reviews / 復習, and nothing visible on any Settings tab
//     (text, accessible names, titles) says "API" or "Academy" or is
//     untranslated (未翻訳). Nadeshiko and Google Cloud Vision really take API
//     keys, so their own fields may say so.
//   * One row per service, in order: よむ deck, JPDB, Jiten, Anki, WaniKani,
//     Bunpro, each with a named status dot and named "adds" icons.
//   * "Preferred grading service" is absent with no key and with one key, and
//     present once the learner has typed both a JPDB and a Jiten key; after
//     Save and a reload the stored keys still show it.
//   * Study pings AnkiConnect exactly once when Settings opens, which marks
//     Anki ready to connect; Connect turns on Anki mining. The script's
//     @connect header names AnkiConnect's host: Tampermonkey asks the learner
//     about any host it does not name (`@connect *` only adds an "allow all"
//     button to that question), and nobody asked for this ping.
//   * "Show review buttons" and the grade scale sit in Reviews.
//
// Study runs as learners have it: the built userscript graph is installed and
// bridges Study's AnkiConnect requests, as it does on yomureader.com. Nothing
// leaves the machine: Study is served from the build and AnkiConnect answers
// through the userscript's request bridge. Prove it fails on an older build:
//   YOMU_REVIEW_SERVICES_SMOKE_STUDY_DIR=/path/to/v2.1.6/newtab \
//   YOMU_REVIEW_SERVICES_SMOKE_SCRIPT=/path/to/v2.1.6/yomu.user.js node scripts/review-services-smoke.mjs
import { assertAccentQuickRow } from './lib/review-appearance-cells.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    createSmokePaths,
    jsonHttpResponse,
    launchSmokeBrowser,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addUserscriptGraphInitScripts, userscriptCompanionPaths } from './lib/smoke-test-helpers.mjs';

const { root: ROOT, artifacts: ARTIFACTS, newTabDir: NEWTAB_DIR, scriptPath: BUILT_SCRIPT_PATH, cssPath: BUILT_CSS_PATH } = createSmokePaths(import.meta.dirname);
const SCRIPT_PATH = process.env.YOMU_REVIEW_SERVICES_SMOKE_SCRIPT ? path.resolve(process.env.YOMU_REVIEW_SERVICES_SMOKE_SCRIPT) : BUILT_SCRIPT_PATH;
const CSS_PATH = process.env.YOMU_REVIEW_SERVICES_SMOKE_CSS ? path.resolve(process.env.YOMU_REVIEW_SERVICES_SMOKE_CSS) : BUILT_CSS_PATH;
const REQUEST_BRIDGE_NAME = '__yomuReviewServicesSmokeRequest';
const STUDY_DIR = process.env.YOMU_REVIEW_SERVICES_SMOKE_STUDY_DIR
    ? path.resolve(process.env.YOMU_REVIEW_SERVICES_SMOKE_STUDY_DIR)
    : NEWTAB_DIR;
const ARTIFACT_DIR = path.join(ARTIFACTS, 'review-services');
const STUDY_URL = 'https://yomureader.com/study/';
const ANKI_ORIGIN = 'http://127.0.0.1:8765';
const SERVICE_ORDER = ['yomu', 'jpdb', 'jiten', 'anki', 'wanikani', 'bunpro'];
const IPAD_USER_AGENT = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const CONFIGS = [
    { name: 'chromium-desktop-en', engine: 'chromium', viewport: { width: 1280, height: 860 }, language: 'en', touch: false },
    { name: 'chromium-desktop-ja', engine: 'chromium', viewport: { width: 1280, height: 860 }, language: 'ja', touch: false },
    { name: 'webkit-ipad-ja', engine: 'webkit', viewport: { width: 820, height: 1180 }, language: 'ja', touch: true },
];
const ENGINES = new Set((process.env.YOMU_REVIEW_SERVICES_SMOKE_ENGINES ?? 'chromium,webkit').split(',').map(value => value.trim()));
// Nadeshiko and Google Cloud Vision are services whose own keys are API keys.
const REAL_API_KEY_COPY = /Nadeshiko|Cloud Vision/u;
const DECLARED_CONNECT_HOSTS = declaredConnectHosts(readFileSync(SCRIPT_PATH, 'utf8'));

const TEXT = {
    en: { tab: 'Reviews', yomuDeck: 'よむ deck', preferred: 'Preferred grading service', reviewButtons: 'Show review buttons' },
    ja: { tab: '復習', yomuDeck: 'よむデッキ', preferred: '優先採点サービス', reviewButtons: '復習ボタンを表示' },
};

mkdirSync(ARTIFACT_DIR, { recursive: true });
assertBuiltArtifacts([
    SCRIPT_PATH,
    CSS_PATH,
    ...userscriptCompanionPaths(SCRIPT_PATH),
    path.join(STUDY_DIR, 'index.html'),
    path.join(STUDY_DIR, 'app.js'),
], ROOT, 'Run npm run build first.');

const results = [];
for (const engine of ['chromium', 'webkit']) {
    if (!ENGINES.has(engine)) continue;
    const browser = await launchSmokeBrowser(engine === 'webkit' ? webkit : chromium, engine, { headless: true });
    try {
        await assertAccentQuickRow(browser, engine);
        for (const config of CONFIGS.filter(candidate => candidate.engine === engine)) results.push(await runStudy(browser, config));
    } finally {
        await browser.close();
    }
}
assert(results.length > 0, 'No review services configuration ran', { engines: [...ENGINES] });
writeFileSync(path.join(ARTIFACT_DIR, 'report.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ ok: true, studyDir: path.relative(ROOT, STUDY_DIR) || STUDY_DIR, results }, null, 2));

function contextOptions(config) {
    return {
        viewport: config.viewport,
        hasTouch: config.touch,
        locale: config.language === 'ja' ? 'ja-JP' : 'en-US',
        deviceScaleFactor: 1,
        serviceWorkers: 'block',
        ...(config.touch ? { userAgent: IPAD_USER_AGENT } : {}),
    };
}

async function activate(locator, config) {
    if (config.touch) await locator.tap();
    else await locator.click();
}

async function runStudy(browser, config) {
    const context = await browser.newContext(contextOptions(config));
    const ankiPings = [];
    const undeclaredHosts = new Set();
    try {
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin !== 'https://yomureader.com') return route.abort();
            const file = studyAssetPath(url.pathname);
            if (!file) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
            return route.fulfill({ status: 200, contentType: contentTypeFor(file), body: readFileSync(file) });
        });
        const page = await context.newPage();
        // A running desktop Anki with AnkiConnect answers its version; every
        // other userscript request (key checks, deck lists) finds nothing.
        await page.exposeFunction(REQUEST_BRIDGE_NAME, request => {
            const url = new URL(request.url);
            if (!isDeclaredConnectHost(url.hostname)) undeclaredHosts.add(url.hostname);
            if (url.origin !== ANKI_ORIGIN) return { status: 404, responseText: '' };
            ankiPings.push(JSON.parse(request.data || '{}').action ?? '');
            return jsonHttpResponse({ result: 6, error: null });
        });
        await addGmStorageBridgeInitScript(page, {
            key: YOMU_SETTINGS_KEY,
            value: { onboardingSeen: true, learningTargetChosen: true, interfaceLanguage: config.language },
            css: readFileSync(CSS_PATH, 'utf8'),
            requestBridgeName: REQUEST_BRIDGE_NAME,
            storagePrefix: 'yomu-review-services-smoke:',
            initialize: 'ifMissing',
        });
        await addUserscriptGraphInitScripts(page, SCRIPT_PATH);
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));

        // Study itself never pings Anki; only opening Settings does.
        await page.goto(STUDY_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-jpdb-reader-root].jpdb-reader-newtab', { state: 'attached', timeout: 20_000 });
        await page.waitForTimeout(1_500);
        assert(ankiPings.length === 0, 'Study pinged AnkiConnect before Settings opened', { ankiPings });

        await openReviews(page, true);
        const text = TEXT[config.language];
        const keyless = await reviewsState(page);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, `${config.name}-keyless.png`), fullPage: false });
        assert(keyless.tabLabel === text.tab, 'The integrations tab is not called Reviews', { tabLabel: keyless.tabLabel });
        assertCleanCopy(keyless, config);
        const tabsScanned = await assertEveryTabClean(page, config);
        assert(keyless.rows.map(row => row.id).join() === SERVICE_ORDER.join(), 'Reviews does not list one row per service in order', keyless.rows);
        assert(keyless.rows[0].name === text.yomuDeck, 'The local deck row is not called よむ deck', keyless.rows[0]);
        assert(keyless.rows.every(row => row.dot && row.adds.length > 0 && row.adds.every(Boolean)),
            'A service row has no named status dot or no named "adds" icons', keyless.rows);
        assert(keyless.rows.find(row => row.id === 'jpdb').adds.length === 4, 'JPDB does not name grades, word colours, decks and pitch', keyless.rows);
        assert(keyless.reviewButtonsInPanel && keyless.gradeScaleInPanel, 'Show review buttons and the grade scale are not in Reviews', keyless);
        assert(!keyless.preferredVisible, 'Preferred grading service shows with no key', keyless);
        assert(['jpdb', 'jiten', 'wanikani', 'bunpro'].every(id => keyless.rows.find(row => row.id === id).state === 'off' && keyless.rows.find(row => row.id === id).connectVisible),
            'An unconnected service offers no Connect link to its key page', keyless.rows);

        // Study's one AnkiConnect ping found a running Anki: ready to connect.
        await page.waitForFunction(() => document.querySelector('[data-review-service="anki"]')?.getAttribute('data-service-state') === 'available', undefined, { timeout: 10_000 });
        assert(ankiPings.length === 1 && ankiPings[0] === 'version', 'Study did not ping AnkiConnect exactly once', { ankiPings });
        const pingsWhenReady = ankiPings.length;
        await activate(page.locator('[data-review-service-enable="anki"]'), config);
        await page.waitForFunction(() => document.querySelector('[data-review-service="anki"]')?.getAttribute('data-service-state') === 'on', undefined, { timeout: 5_000 });
        const ankiOn = await page.evaluate(() => document.querySelector('input[name="ankiEnabled"]')?.checked ?? false);
        assert(ankiOn, 'Connect on a reachable Anki did not turn on Anki mining');

        // One key: still nothing to prefer. Both keys: the preference appears.
        await typeKey(page, 'apiCredentialJpdb', 'review-services-smoke-jpdb', config);
        const oneKey = await reviewsState(page);
        assert(!oneKey.preferredVisible, 'Preferred grading service shows with one key', oneKey);
        assert(oneKey.rows.find(row => row.id === 'jpdb').state === 'on' && !oneKey.rows.find(row => row.id === 'jpdb').connectVisible,
            'Typing a JPDB key did not mark JPDB connected', oneKey.rows);
        await typeKey(page, 'apiCredentialJiten', 'ak_review-services-smoke-jiten', config);
        const twoKeys = await reviewsState(page);
        assert(twoKeys.preferredVisible && twoKeys.preferredLabel.includes(text.preferred), 'Preferred grading service is absent with JPDB and Jiten keys', twoKeys);
        assertCleanCopy(twoKeys, config);
        await page.locator('[data-preferred-grading-service]').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(ARTIFACT_DIR, `${config.name}-two-keys.png`), fullPage: false });
        // Switching Jiten's grading off leaves one grading service: nothing to prefer.
        await activate(page.locator('input[name="jitenMiningEnabled"]'), config);
        assert(!(await reviewsState(page)).preferredVisible, 'Preferred grading service shows with only one service grading');
        await activate(page.locator('input[name="jitenMiningEnabled"]'), config);

        await page.locator('.jpdb-reader-settings button[type="submit"]').click();
        await page.waitForFunction(key => {
            try {
                return JSON.parse(localStorage.getItem(key) ?? '{}').ankiEnabled === true;
            } catch { return false; }
        }, `yomu-review-services-smoke:${YOMU_SETTINGS_KEY}`, { timeout: 10_000 });
        await openReviews(page, true);
        const reloaded = await reviewsState(page);
        assert(reloaded.preferredVisible, 'Preferred grading service is absent after a reload with both keys stored', reloaded);
        assert(['jpdb', 'jiten', 'anki'].every(id => reloaded.rows.find(row => row.id === id).state === 'on'), 'Saved services do not show connected after a reload', reloaded.rows);
        assert(pageErrors.length === 0, 'Study threw while connecting review services', { pageErrors });
        assert(!undeclaredHosts.has(new URL(ANKI_ORIGIN).hostname), 'The userscript does not declare AnkiConnect\'s host in @connect, so Tampermonkey would ask the learner about Study\'s ping', { undeclaredHosts: [...undeclaredHosts], declared: DECLARED_CONNECT_HOSTS });
        return {
            config: config.name,
            tab: keyless.tabLabel,
            tabsScanned,
            rows: keyless.rows.map(row => ({ id: row.id, name: row.name, dot: row.dot, adds: row.adds })),
            ankiPingsBeforeConnect: pingsWhenReady,
            undeclaredHosts: [...undeclaredHosts],
            preferred: { keyless: keyless.preferredVisible, oneKey: oneKey.preferredVisible, twoKeys: twoKeys.preferredVisible, reloaded: reloaded.preferredVisible },
        };
    } finally {
        await context.close();
    }
}

async function openReviews(page, reload) {
    // Study drops the #settings hash once the dialog opens, and a hash change
    // alone is no reload, so a fresh load uses Study's other address.
    const other = new URL(page.url()).pathname.endsWith('index.html') ? '' : 'index.html';
    await page.goto(`${STUDY_URL}${reload ? other : ''}#settings=api`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.jpdb-reader-settings [data-settings-panel="api"]:not([hidden])', { timeout: 20_000 });
}

async function typeKey(page, name, value, config) {
    const field = page.locator(`input[name="${name}"]`);
    await field.scrollIntoViewIfNeeded();
    await activate(field, config);
    await field.fill(value);
    await field.dispatchEvent('change');
}

function offendingCopy(texts) {
    return texts.filter(text => /Academy|未翻訳/u.test(text) || (/API/u.test(text) && !REAL_API_KEY_COPY.test(text)));
}

function assertCleanCopy(state, config) {
    const offending = offendingCopy(state.visibleText);
    assert(offending.length === 0, `Reviews shows "API", "Academy" or untranslated copy (${config.language})`, { offending });
}

// Every Settings tab, opened as a learner opens it; Reviews is left open again.
async function assertEveryTabClean(page, config) {
    const panels = await page.locator('.jpdb-reader-settings-tabs [data-panel]').evaluateAll(tabs => tabs.map(tab => tab.getAttribute('data-panel')));
    const offending = {};
    for (const panel of panels) {
        await activate(page.locator(`.jpdb-reader-settings-tabs [data-panel="${panel}"]`), config);
        await page.waitForSelector(`.jpdb-reader-settings [data-settings-panel="${panel}"]:not([hidden])`, { timeout: 5_000 });
        const found = offendingCopy(await visibleCopy(page, [`[data-settings-panel="${panel}"]`]));
        if (found.length) offending[panel] = found;
    }
    await activate(page.locator('.jpdb-reader-settings-tabs [data-panel="api"]'), config);
    assert(Object.keys(offending).length === 0, `A Settings tab shows "API", "Academy" or untranslated copy (${config.language})`, { offending });
    return panels.length;
}

// Everything a learner can see or hear under these roots: rendered text, the
// options of visible selects, and the names and tooltips of controls and icons.
function visibleCopy(page, selectors) {
    return page.evaluate(rootSelectors => {
        const settings = document.querySelector('.jpdb-reader-settings');
        const visible = element => {
            if (!(element instanceof HTMLElement || element instanceof SVGElement)) return false;
            if (element.closest('[hidden]')) return false;
            const style = getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            const box = element.getBoundingClientRect();
            return box.width > 0 && box.height > 0;
        };
        const texts = [];
        for (const root of rootSelectors.map(selector => settings?.querySelector(selector))) {
            if (!root) continue;
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const value = node.textContent?.trim();
                if (value && visible(node.parentElement) && !node.parentElement.closest('select')) texts.push(value);
            }
            for (const select of root.querySelectorAll('select')) {
                if (visible(select)) texts.push(...[...select.options].map(option => option.textContent?.trim() ?? ''));
            }
            for (const element of root.querySelectorAll('[aria-label], [title], [placeholder]')) {
                if (!visible(element)) continue;
                for (const attribute of ['aria-label', 'title', 'placeholder']) {
                    const value = element.getAttribute(attribute)?.trim();
                    if (value) texts.push(value);
                }
            }
        }
        return texts;
    }, selectors);
}

async function reviewsState(page) {
    const visibleText = await visibleCopy(page, ['.jpdb-reader-settings-tabs', '[data-settings-panel="api"]']);
    const state = await page.evaluate(() => {
        const settings = document.querySelector('.jpdb-reader-settings');
        const panel = settings?.querySelector('[data-settings-panel="api"]');
        const tabs = settings?.querySelector('.jpdb-reader-settings-tabs');
        const visible = element => {
            if (!(element instanceof HTMLElement || element instanceof SVGElement)) return false;
            if (element.closest('[hidden]')) return false;
            const style = getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            const box = element.getBoundingClientRect();
            return box.width > 0 && box.height > 0;
        };
        const rows = [...(panel?.querySelectorAll('[data-review-service]') ?? [])].map(row => ({
            id: row.getAttribute('data-review-service'),
            state: row.getAttribute('data-service-state'),
            name: row.querySelector('.jpdb-reader-review-service-name')?.textContent?.trim() ?? '',
            dot: row.querySelector('[data-review-service-dot]')?.getAttribute('aria-label') ?? '',
            adds: [...row.querySelectorAll('[data-review-service-feature]')].map(icon => icon.getAttribute('aria-label') ?? ''),
            connectVisible: visible(row.querySelector('[data-review-service-connect]')),
        }));
        const preferred = panel?.querySelector('select[name="apiGradingProvider"]');
        return {
            tabLabel: tabs?.querySelector('[data-panel="api"]')?.textContent?.trim() ?? '',
            rows,
            preferredVisible: visible(preferred),
            preferredLabel: preferred?.closest('label')?.textContent?.trim() ?? '',
            reviewButtonsInPanel: Boolean(panel?.querySelector('input[name="enableReviews"]')),
            gradeScaleInPanel: Boolean(panel?.querySelector('select[name="twoButtonReviews"]')),
        };
    });
    return { ...state, visibleText };
}

function studyAssetPath(pathname) {
    const relative = pathname === '/study' || pathname === '/study/' ? 'index.html' : pathname.replace(/^\/study\//u, '');
    if (relative === pathname) return null;
    const candidate = path.resolve(STUDY_DIR, relative);
    return candidate.startsWith(`${path.resolve(STUDY_DIR)}${path.sep}`) && existsSync(candidate) ? candidate : null;
}

function contentTypeFor(file) {
    return {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.webmanifest': 'application/manifest+json',
        '.svg': 'image/svg+xml',
    }[path.extname(file)] ?? 'application/octet-stream';
}

// Tampermonkey's @connect rule: a named domain also allows its subdomains.
function declaredConnectHosts(script) {
    const header = script.slice(0, script.indexOf('// ==/UserScript=='));
    return [...header.matchAll(/^\/\/ @connect\s+(\S+)/gmu)].map(match => match[1]).filter(host => host !== '*');
}

function isDeclaredConnectHost(hostname) {
    return DECLARED_CONNECT_HOSTS.some(host => hostname === host || hostname.endsWith(`.${host}`));
}
