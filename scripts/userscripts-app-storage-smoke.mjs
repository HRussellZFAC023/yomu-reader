#!/usr/bin/env node
// Regression smoke for the Userscripts app for Safari (iPhone, iPad, Mac), the
// manager Yomu's install guide recommends there. That manager runs the script in
// its own extension's content world, through
//   Function(`{GM,GM_info,...}`, code)(apis)
// so `GM` and `GM_info` are function PARAMETERS, never properties of globalThis,
// it has no synchronous GM_* storage, and `browser.runtime.id` in that world is
// the manager's own extension id. Yomu 1.9.1-2.0.12 looked only at globalThis.GM,
// took the manager's runtime id for its own browser extension, never installed
// Study's storage responder, and so left every such Reader on its first-run
// "Finish setup in Study" prompt: setup in Study could not reach it.
//
// The emulation below runs the built @require graph + core in a CDP isolated
// world (shared DOM, separate globals, like a content script) with that exact
// wrapper and a persistent cross-origin GM store. These are deterministic
// fixtures for storage behaviour, not visual QA evidence.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    assert,
    assertBuiltArtifacts,
    createSmokePaths,
    launchSmokeBrowser,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { userscriptCompanionPaths } from './lib/smoke-test-helpers.mjs';

const { root: ROOT, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH, newTabDir: NEWTAB_DIR } = createSmokePaths(import.meta.dirname);
const COMPANION_PATHS = userscriptCompanionPaths(SCRIPT_PATH);
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH, ...COMPANION_PATHS, path.join(NEWTAB_DIR, 'index.html'), path.join(NEWTAB_DIR, 'app.js')], ROOT);

const WORLD = 'userscripts-app-content-world';
const MANAGER_RUNTIME_ID = 'com.userscripts.macos.Userscripts-Extension (J74Q8V8V8N)';
const READER_PAGE_URL = 'https://reader.example/article';
const STUDY_URL = 'https://yomureader.com/study/';
const USERSCRIPT_GRAPH = [...COMPANION_PATHS, SCRIPT_PATH].map(file => readFileSync(file, 'utf8')).join('\n;\n');
const CONTENT_TYPES = new Map([['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json']]);
const DEBUG = Boolean(process.env.SMOKE_DEBUG);

const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });
try {
    const fresh = await freshInstallSetupInStudy();
    const configured = await configuredReaderBoots();
    console.log(JSON.stringify({ fixture: true, fresh, configured }, null, 2));
    console.log('Userscripts app storage smoke passed');
} finally {
    await browser.close().catch(() => undefined);
}

/** A fresh install: setup completed in Study must reach the installed Reader. */
async function freshInstallSetupInStudy() {
    const manager = await openManagedPage({});
    const { page, store } = manager;

    await manager.goto(STUDY_URL);
    const study = await page.evaluate(() => ({
        announced: document.getElementById('jpdb-reader-installed-runtime')?.dataset.yomuInstalledRuntimeKind ?? '',
        responder: document.documentElement.dataset.yomuUserscriptStorageBridge ?? '',
        responderKind: document.documentElement.dataset.yomuStorageBridgeKind ?? '',
    }));
    assert(study.announced === 'userscript', 'The Userscripts app was announced as a browser extension', study);
    assert(study.responder === 'true' && study.responderKind === 'userscript', 'Study has no installed-Reader storage responder', study);

    // Study either asks for first-run setup or opens straight away; it must
    // never stop at "Could not load settings", which is where it waited for a
    // storage responder that never came.
    const surface = await page.waitForFunction(() => {
        if (document.querySelector('.jpdb-reader-extension-settings-recovery')) return 'recovery';
        if (document.querySelector('.jpdb-reader-onboarding select[name="targetLanguage"]')) return 'setup';
        if (document.querySelector('.jpdb-reader-onboarding')) return 'welcome';
        return document.querySelector('.jpdb-reader-newtab-shell .jpdb-reader-newtab-study') ? 'study' : null;
    }, null, { timeout: 25_000 }).then(handle => handle.jsonValue());
    assert(surface !== 'recovery', 'Study could not load the installed Reader settings', { surface });
    if (surface === 'setup') {
        await page.locator('.jpdb-reader-onboarding select[name="targetLanguage"]').selectOption('ja');
        await page.locator('input[name="onboardingInstallOfflineDictionaries"]').uncheck();
        await page.locator('[data-onboarding-action="without-api"]').click();
        await page.waitForFunction(() => !document.querySelector('.jpdb-reader-onboarding'), null, { timeout: 20_000 });
        const saved = await waitFor(() => recordValue(store.get(YOMU_SETTINGS_KEY)), 15_000);
        assert(saved?.learningTargetChosen === true && saved?.onboardingSeen === true, 'Study setup did not reach the Userscripts app store', { keys: [...store.keys()] });
    }

    await manager.goto(READER_PAGE_URL);
    const reader = await readerState(page);
    assert(!reader.setupPrompt, 'The Reader still asked to finish setup in Study after Study saved it', reader);
    assert(reader.health === 'ready' && reader.fab, 'The Reader did not start after setup', reader);
    await page.context().close();
    return { study, surface, savedKeys: [...store.keys()].filter(key => key.startsWith('jpdb') || key.startsWith('yomu:settings')).sort(), reader };
}

/** An installed Reader whose store already holds a chosen target starts at once. */
async function configuredReaderBoots() {
    const manager = await openManagedPage({
        [YOMU_SETTINGS_KEY]: {
            onboardingSeen: true,
            learningTargetChosen: true,
            interfaceLanguage: 'en',
            localDictionariesEnabled: false,
            showFloatingButton: true,
        },
    });
    await manager.goto(READER_PAGE_URL);
    const reader = await readerState(manager.page);
    assert(!reader.setupPrompt, 'A configured Userscripts app Reader asked to finish setup in Study', reader);
    assert(reader.health === 'ready' && reader.fab, 'A configured Userscripts app Reader did not start', reader);
    await manager.page.locator('.jpdb-reader-fab').click();
    await manager.page.locator('[data-radial-id="settings"]').click();
    const settingsUrl = await waitFor(() => manager.opened[0], 5_000);
    assert(settingsUrl === `${STUDY_URL}#settings=appearance`, 'Settings did not go directly to Study through the manager API', { settingsUrl });
    assert(await manager.page.locator('[data-sensitive-settings-launcher]').count() === 0, 'A redundant Settings launcher was mounted');
    await manager.page.context().close();
    return reader;
}

async function readerState(page) {
    await page.waitForFunction(() => document.querySelector('.jpdb-reader-onboarding-trusted-launcher')
        || document.querySelector('#jpdb-reader-runtime-owner[data-yomu-runtime-health="ready"]'), null, { timeout: 20_000 });
    await page.waitForTimeout(500);
    return page.evaluate(() => ({
        setupPrompt: Boolean(document.querySelector('.jpdb-reader-onboarding-trusted-launcher')),
        health: document.querySelector('#jpdb-reader-runtime-owner')?.getAttribute('data-yomu-runtime-health') ?? '',
        runtimeKind: document.querySelector('#jpdb-reader-runtime-owner')?.getAttribute('data-yomu-runtime-kind') ?? '',
        fab: Boolean(document.querySelector('.jpdb-reader-fab')),
    }));
}

async function openManagedPage(initialStore) {
    const context = await browser.newContext({ viewport: { width: 1100, height: 820 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    if (DEBUG) {
        page.on('console', message => console.error('[page]', message.type(), message.text().slice(0, 400)));
        page.on('pageerror', error => console.error('[pageerror]', error.message.slice(0, 400)));
    }
    await installRoutes(page);
    const store = new Map(Object.entries(initialStore));
    const extensionStore = new Map();
    const opened = [];
    const cdp = await context.newCDPSession(page);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Runtime.addBinding', { name: '__userscriptsAppWrite', executionContextName: WORLD });
    cdp.on('Runtime.bindingCalled', ({ name, payload }) => {
        if (name !== '__userscriptsAppWrite') return;
        const { area, op, key, value, url } = JSON.parse(payload);
        if (area === 'tab' && op === 'open') { opened.push(url); return; }
        const target = area === 'extension' ? extensionStore : store;
        if (op === 'set') target.set(key, value);
        else if (op === 'delete') target.delete(key);
    });
    let scriptId;
    const goto = async url => {
        if (scriptId) await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: scriptId });
        ({ identifier: scriptId } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
            source: managerSource(Object.fromEntries(store), Object.fromEntries(extensionStore)),
            worldName: WORLD,
        }));
        await page.goto(url, { waitUntil: 'domcontentloaded' });
    };
    return { page, store, goto, opened };
}

// The Userscripts app's content-world injection, reduced to what Yomu sees.
function managerSource(gmSnapshot, extensionSnapshot) {
    return `(() => {
  const report = message => globalThis.__userscriptsAppWrite(JSON.stringify(message));
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const store = new Map(Object.entries(${JSON.stringify(gmSnapshot)}));
  const extensionStore = new Map(Object.entries(${JSON.stringify(extensionSnapshot)}));
  const info = { scriptHandler: 'Userscripts', version: '4.7.0', script: { name: 'よむ' } };
  const xmlHttpRequest = details => {
    fetch(details.url, { method: details.method || 'GET', headers: details.headers, body: details.data })
      .then(async response => {
        const text = await response.text();
        details.onload?.({ status: response.status, response: details.responseType === 'json' ? JSON.parse(text || 'null') : text, responseText: text, finalUrl: response.url });
      })
      .catch(error => details.onerror?.(error));
    return { abort() {} };
  };
  const GM = {
    info,
    getValue: async (key, fallback) => store.has(key) ? clone(store.get(key)) : fallback,
    setValue: async (key, value) => { store.set(key, clone(value)); report({ area: 'gm', op: 'set', key, value }); },
    deleteValue: async key => { store.delete(key); report({ area: 'gm', op: 'delete', key }); },
    listValues: async () => [...store.keys()],
    openInTab: async url => { report({ area: 'tab', op: 'open', url }); return { url }; },
    xmlHttpRequest,
  };
  // Not shadowed by the manager: the content world's own extension API, whose
  // runtime id and storage belong to the Userscripts app, not to Yomu.
  globalThis.browser = {
    runtime: {
      id: ${JSON.stringify(MANAGER_RUNTIME_ID)},
      getURL: path => 'safari-web-extension://userscripts-app/' + path,
      sendMessage: async () => { throw new Error('Not Yomu.'); },
      onMessage: { addListener() {}, removeListener() {} },
    },
    storage: {
      local: {
        get: async key => key == null ? Object.fromEntries(extensionStore) : (extensionStore.has(key) ? { [key]: clone(extensionStore.get(key)) } : {}),
        set: async values => { for (const [key, value] of Object.entries(values)) { extensionStore.set(key, clone(value)); report({ area: 'extension', op: 'set', key, value }); } },
        remove: async key => { extensionStore.delete(key); report({ area: 'extension', op: 'delete', key }); },
      },
      onChanged: { addListener() {}, removeListener() {} },
    },
  };
  const apis = { GM, GM_info: info, GM_xmlhttpRequest: xmlHttpRequest };
  const code = '(async () => { try {\\n' + ${JSON.stringify(USERSCRIPT_GRAPH)} + '\\n} catch (error) { console.error("yomu.user.js", error); } })();';
  Function('{' + Object.keys(apis).join(',') + '}', code)(apis);
})();`;
}

async function installRoutes(page) {
    await page.route('**/*', route => route.abort());
    await page.route(READER_PAGE_URL, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: readerFixtureHtml() }));
    await page.route('https://yomureader.com/**', route => {
        const url = new URL(route.request().url());
        const file = hostedFile(url.pathname);
        if (!file) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ contentType: CONTENT_TYPES.get(path.extname(file)) ?? 'application/octet-stream', body: readFileSync(file) });
    });
}

function hostedFile(pathname) {
    if (pathname === '/study' || pathname === '/study/' || pathname === '/study/index.html') return path.join(NEWTAB_DIR, 'index.html');
    if (pathname.startsWith('/study/')) {
        const file = path.join(NEWTAB_DIR, pathname.slice('/study/'.length));
        return file.startsWith(NEWTAB_DIR) ? safeExisting(file) : null;
    }
    if (/^\/yomu(?:\.[a-f0-9]+)?\.css$/u.test(pathname)) return CSS_PATH;
    return null;
}

function safeExisting(file) {
    try {
        readFileSync(file);
        return file;
    } catch {
        return null;
    }
}

function readerFixtureHtml() {
    return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Reader fixture</title></head>'
        + '<body><main><h1>日本語のページ</h1><p>これは日本語の本文です。</p></main></body></html>';
}

function recordValue(value) {
    if (!value || typeof value !== 'object') return null;
    return value;
}

async function waitFor(read, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = read();
        if (value || Date.now() > deadline) return value;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

