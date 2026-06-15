#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    createSmokePaths,
    launchSmokeBrowser,
    serveFile,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';

const { root: ROOT, dist: DIST, artifacts: ARTIFACTS, newTabDir: NEWTAB_DIR } = createSmokePaths(import.meta.dirname);
const ARTIFACT_SUFFIX = (process.env.YOMU_JITEN_KEYLESS_ARTIFACT_SUFFIX || '').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-|-$/g, '');
const ARTIFACT_DIR = path.join(ARTIFACTS, ['jiten-keyless-definition', ARTIFACT_SUFFIX].filter(Boolean).join('-'));
const EXPECT_CONTENT = process.env.YOMU_JITEN_KEYLESS_EXPECT !== 'baseline';
const TERM = '復習';
const READING = 'ふくしゅう';
const REQUEST_BRIDGE_NAME = '__yomuJitenKeylessDefinitionSmokeRequest';
const BUILT_ARTIFACTS = [
    path.join(NEWTAB_DIR, 'index.html'),
    path.join(NEWTAB_DIR, 'app.js'),
    path.join(NEWTAB_DIR, 'styles.css'),
    path.join(NEWTAB_DIR, 'sw.js'),
];
const STATIC_ROUTES = new Map([
    ['/seed', [null, 'text/html; charset=utf-8']],
    ['/newtab', [path.join(NEWTAB_DIR, 'index.html'), 'text/html; charset=utf-8']],
    ['/newtab/index.html', [path.join(NEWTAB_DIR, 'index.html'), 'text/html; charset=utf-8']],
    ['/newtab/app.js', [path.join(NEWTAB_DIR, 'app.js'), 'text/javascript; charset=utf-8']],
    ['/newtab/styles.css', [path.join(NEWTAB_DIR, 'styles.css'), 'text/css; charset=utf-8']],
    ['/newtab/sw.js', [path.join(NEWTAB_DIR, 'sw.js'), 'text/javascript; charset=utf-8']],
    ['/yomu-icon.svg', [path.join(DIST, 'yomu-icon.svg'), 'image/svg+xml']],
    ['/favicon-32x32.png', [path.join(DIST, 'favicon-32x32.png'), 'image/png']],
]);

const keylessSettings = {
    onboardingSeen: true,
    newTabEnabled: true,
    newTabSource: 'dictionary',
    interfaceLanguage: 'ja',
    apiKey: '',
    jitenApiKey: '',
    jpdbDefinitionsEnabled: false,
    jitenDefinitionsEnabled: true,
    localDictionariesEnabled: true,
    dictionaryPreferences: [
        { name: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 0, type: 'terms' },
    ],
    ankiEnabled: false,
    ankiSectionEnabled: false,
    newTabAnkiEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    immersionKitEnabled: false,
    audioEnabled: false,
    showFloatingButton: false,
    enableLogging: false,
};

mkdirSync(ARTIFACT_DIR, { recursive: true });
assertBuiltArtifacts(BUILT_ARTIFACTS, ROOT, 'Run npm run build first.');

const server = await startLoopbackServer(serveRequest, 'Could not bind Jiten keyless definition smoke server');
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
const externalRequests = [];

try {
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1100, height: 820 } });
    const page = await context.newPage();
    await page.exposeFunction(REQUEST_BRIDGE_NAME, request => {
        externalRequests.push(request.url);
        return { status: 503, responseText: '' };
    });
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: keylessSettings,
        requestBridgeName: REQUEST_BRIDGE_NAME,
    });
    await page.route(/https?:\/\/(?:[^/]*api\.jiten\.moe|[^/]*jpdb\.io|[^/]*workers\.dev)\//, route => {
        externalRequests.push(route.request().url());
        return route.abort();
    });

    await page.goto(`${server.origin}/seed`, { waitUntil: 'domcontentloaded' });
    await seedJitendexDictionary(page);
    await page.goto(`${server.origin}/newtab/index.html?smoke=jiten-keyless-${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-newtab-action="mode"][data-mode="search"]').click({ timeout: 20_000 });
    await page.locator('[data-newtab-search-input]').fill(TERM);
    await page.locator('[data-newtab-search]').evaluate(form => form.requestSubmit());
    await page.waitForSelector('[data-newtab-search-results]', { timeout: 20_000 });
    const wordButton = page.locator('[data-newtab-action="search-result-word"]', { hasText: TERM }).first();
    await wordButton.waitFor({ state: 'visible', timeout: 20_000 });
    await wordButton.click();

    const detail = page.locator('[data-newtab-search-detail]:not([hidden])').first();
    await detail.waitFor({ state: 'visible', timeout: 8_000 });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'before-keyless-jiten-detail.png'), fullPage: true });
    const beforeDom = await detail.evaluate(node => ({
        text: node.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        hasJiten: Boolean(node.querySelector('[data-source="jiten"]')),
        loading: Boolean(node.querySelector('[data-card-details-loading]')),
    }));
    writeFileSync(path.join(ARTIFACT_DIR, 'before-keyless-jiten-detail.json'), JSON.stringify(beforeDom, null, 2));

    await detail.locator('[data-source="jiten"]').waitFor({ state: 'attached', timeout: 12_000 });
    await detail.locator('[data-source="jiten"]').evaluate(node => node.setAttribute('open', ''));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'after-keyless-jiten-detail.png'), fullPage: true });
    const afterDom = await detail.evaluate(node => {
        const jiten = node.querySelector('[data-source="jiten"]');
        return {
            detailText: node.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            jitenText: jiten?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            sourceTitles: Array.from(node.querySelectorAll('.jpdb-reader-source-card > summary, .jpdb-reader-local-title'))
                .map(summary => summary.textContent?.replace(/\s+/g, ' ').trim() ?? '')
                .filter(Boolean),
            hasJiten: Boolean(jiten),
            hasExternalOnlyReplacement: Boolean(jiten) && !/review; revision|毎日復習する/.test(jiten?.textContent ?? ''),
            reading: jiten?.querySelector('.jpdb-reader-jiten-headword rt')?.textContent ?? '',
            externalLabel: jiten?.querySelector('.jpdb-reader-jiten-external-lookup')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            localGlossaryHtml: jiten?.querySelector('.jpdb-reader-jiten-local-definitions')?.innerHTML ?? '',
        };
    });
    writeFileSync(path.join(ARTIFACT_DIR, 'after-keyless-jiten-detail.json'), JSON.stringify(afterDom, null, 2));

    assert(afterDom.hasJiten, 'No-key search detail did not render a Jiten source', afterDom);
    assert(!externalRequests.some(url => /api\.jiten\.moe/.test(url)), 'No-key smoke unexpectedly called the Jiten API', { externalRequests });
    if (EXPECT_CONTENT) {
        assert(afterDom.jitenText.includes('review; revision'), 'No-key Jiten source did not render the Jitendex meaning', afterDom);
        assert(afterDom.jitenText.includes('毎日復習する'), 'No-key Jiten source did not render the Jitendex example', afterDom);
        assert(afterDom.reading === READING || afterDom.jitenText.includes(READING), 'No-key Jiten source did not render the reading', afterDom);
        assert(!afterDom.hasExternalOnlyReplacement, 'No-key Jiten source still rendered an external button as replacement content', afterDom);
    }

    const report = {
        ok: true,
        term: TERM,
        expectation: EXPECT_CONTENT ? 'content' : 'baseline',
        settings: keylessSettings,
        sourceState: {
            newTabSource: keylessSettings.newTabSource,
            jpdbDefinitionsEnabled: keylessSettings.jpdbDefinitionsEnabled,
            jitenDefinitionsEnabled: keylessSettings.jitenDefinitionsEnabled,
            localDictionariesEnabled: keylessSettings.localDictionariesEnabled,
            dictionaryPreferences: keylessSettings.dictionaryPreferences,
        },
        beforeDom,
        afterDom,
        externalRequests,
        artifacts: {
            beforeScreenshot: path.join(ARTIFACT_DIR, 'before-keyless-jiten-detail.png'),
            beforeDom: path.join(ARTIFACT_DIR, 'before-keyless-jiten-detail.json'),
            afterScreenshot: path.join(ARTIFACT_DIR, 'after-keyless-jiten-detail.png'),
            afterDom: path.join(ARTIFACT_DIR, 'after-keyless-jiten-detail.json'),
        },
    };
    writeFileSync(path.join(ARTIFACT_DIR, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await context.close();
} finally {
    await closeSmokeBrowserAndServer(browser, server.server);
}

function serveRequest(request, response) {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const route = STATIC_ROUTES.get(url.pathname.replace(/\/+$/, '') || '/');
    if (!route) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
    }
    if (route[0] === null) {
        response.writeHead(200, { 'content-type': route[1] });
        response.end('<!doctype html><html><head><meta charset="utf-8"><title>seed</title></head><body>seed</body></html>');
        return;
    }
    if (!existsSync(route[0])) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Missing built artifact');
        return;
    }
    serveFile(response, route[0], route[1], request.method ?? 'GET');
}

async function seedJitendexDictionary(page) {
    await page.evaluate(async ({ term, reading }) => {
        const deleteRequest = indexedDB.deleteDatabase('jpdb-popup-reader-yomitan');
        await new Promise((resolve, reject) => {
            deleteRequest.onsuccess = () => resolve();
            deleteRequest.onerror = () => reject(deleteRequest.error);
            deleteRequest.onblocked = () => resolve();
        });
        const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('jpdb-popup-reader-yomitan', 4);
            request.onupgradeneeded = () => {
                const db = request.result;
                const tx = request.transaction;
                const ensureStore = name => db.objectStoreNames.contains(name)
                    ? tx.objectStore(name)
                    : db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
                const ensureIndex = (store, name, keyPath) => {
                    if (!store.indexNames.contains(name)) store.createIndex(name, keyPath);
                };
                const terms = ensureStore('terms');
                ensureIndex(terms, 'expression', 'expression');
                ensureIndex(terms, 'reading', 'reading');
                ensureIndex(terms, 'dictionary', 'dictionary');
                const termSearch = ensureStore('termSearch');
                ensureIndex(termSearch, 'token', 'token');
                ensureIndex(termSearch, 'dictionary', 'dictionary');
                const termKanji = ensureStore('termKanji');
                ensureIndex(termKanji, 'character', 'character');
                ensureIndex(termKanji, 'dictionary', 'dictionary');
                const termMeta = ensureStore('termMeta');
                ensureIndex(termMeta, 'expression', 'expression');
                ensureIndex(termMeta, 'dictionary', 'dictionary');
                const kanji = ensureStore('kanji');
                ensureIndex(kanji, 'character', 'character');
                ensureIndex(kanji, 'dictionary', 'dictionary');
                if (!db.objectStoreNames.contains('dictionaryInfo')) db.createObjectStore('dictionaryInfo', { keyPath: 'title' });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        await new Promise((resolve, reject) => {
            const tx = db.transaction(['dictionaryInfo', 'terms', 'termSearch', 'termKanji'], 'readwrite');
            const entry = {
                expression: term,
                reading,
                glossary: [
                    'review; revision',
                    { type: 'structured-content', content: { tag: 'div', content: '毎日復習する。' } },
                ],
                score: 10,
                dictionary: 'Jitendex',
            };
            tx.objectStore('dictionaryInfo').put({ title: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 0, type: 'terms', counts: { terms: 1 } });
            tx.objectStore('terms').add(entry);
            for (const token of [term, reading, 'review', 'revision']) tx.objectStore('termSearch').add({ ...entry, token });
            for (const character of Array.from(term)) tx.objectStore('termKanji').add({ ...entry, character });
            tx.oncomplete = () => {
                db.close();
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });
    }, { term: TERM, reading: READING });
}
