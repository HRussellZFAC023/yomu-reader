#!/usr/bin/env node
// Real-page browser proof for settings durability. Every assertion below reads
// the freshly built userscript's state after a full navigation, rather than
// sampling the in-memory object immediately after a click.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    createSmokePaths,
    firstErrorLine,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from '../lib/smoke-harness.mjs';
import {
    addScriptTagWithCspFallback,
    installUserscriptCssResource,
} from '../lib/smoke-test-helpers.mjs';

const require = createRequire(import.meta.url);
const { GREASY_FORK_LIBRARIES, greasyForkLibraryPath } = require('../lib/greasyfork-libraries.cjs');
const {
    artifacts: ARTIFACTS,
    cssPath: CSS_PATH,
    dist: DIST,
    root: ROOT,
    scriptPath: SCRIPT_PATH,
} = createSmokePaths(import.meta.dirname);
const COMPANION_SCRIPT_PATHS = GREASY_FORK_LIBRARIES
    .filter(library => library.fileName === 'yomu-settings-surface.user.js')
    .map(library => path.join(DIST, greasyForkLibraryPath(library.fileName)));
const BUILT_ARTIFACTS = [SCRIPT_PATH, CSS_PATH, ...COMPANION_SCRIPT_PATHS];
const REQUEST_BRIDGE = '__yomuSettingsPersistenceRequest';
const PUCK = '.jpdb-reader-fab';
const POWER = '.jpdb-reader-fab-radial-item[data-radial-id="power"]';
const SETTINGS_FORM = 'form.jpdb-reader-settings';

const SETTINGS = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    showFloatingButton: true,
    showFurigana: true,
    furiganaMode: 'all',
    puckFuriganaModeBeforeHide: '',
    annotationsPaused: false,
    manualScanEnabled: false,
    popupMode: 'auto',
    apiKey: '',
    ankiEnabled: false,
    audioEnabled: false,
    autoPlayAudio: false,
    jpdbDefinitionsEnabled: false,
    jitenDefinitionsEnabled: false,
    localDictionariesEnabled: false,
    immersionKitEnabled: false,
    lookupOnClick: false,
    lookupOnHover: false,
    showPitchAccent: false,
    enableLogging: false,
    shortcuts: { openSettings: 'Ctrl+Shift+J' },
};

assertBuiltArtifacts(BUILT_ARTIFACTS, ROOT);
mkdirSync(ARTIFACTS, { recursive: true });

const fixture = await startLoopbackServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html>
        <html lang="ja">
        <meta charset="utf-8">
        <title>よむ settings persistence smoke</title>
        <main style="font: 24px/1.8 system-ui; margin: 48px;">
            <h1>日本語を読む</h1>
            <p>東京で本を読みます。設定は再読み込みの後も残ります。</p>
        </main>`);
}, 'Could not bind settings persistence smoke server');
const REAL_PAGE_URL = fixture.baseUrl;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
    bypassCSP: true,
    locale: 'ja-JP',
    viewport: { width: 1180, height: 820 },
});
const page = await context.newPage();
const browserMessages = [];
page.on('pageerror', error => browserMessages.push(`pageerror: ${firstErrorLine(error)}`));
page.on('console', message => {
    if (message.type() === 'error') browserMessages.push(`console: ${message.text()}`);
});
await page.exposeFunction(REQUEST_BRIDGE, async () => ({
    status: 503,
    responseText: '',
    response: null,
    responseHeaders: '',
}));
await addGmStorageBridgeInitScript(page, {
    key: YOMU_SETTINGS_KEY,
    value: SETTINGS,
    css: readFileSync(CSS_PATH, 'utf8'),
    initialize: 'ifMissing',
    requestBridgeName: REQUEST_BRIDGE,
    storagePrefix: 'yomu-settings-persistence-smoke:',
});

try {
    await page.goto(`${REAL_PAGE_URL}?yomu-settings-smoke=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
    });
    await injectBuiltRuntime();

    const before = await readStateFromSettingsUi();
    assertState(before, {
        annotationsPaused: false,
        furiganaMode: 'all',
        pageScanMode: 'auto',
        popupMode: 'auto',
        puckState: 'on',
    }, 'initial state');

    await cyclePuckTo('no-furigana');
    await reloadBuiltRuntime();
    const afterFuriganaReload = await readStateFromSettingsUi();
    assertState(afterFuriganaReload, {
        annotationsPaused: false,
        furiganaMode: 'off',
        pageScanMode: 'auto',
        popupMode: 'auto',
        puckState: 'no-furigana',
    }, 'puck furigana reload');

    await saveFormChoice('pageScanMode', 'off');
    await reloadBuiltRuntime();
    const afterAnnotationsReload = await readStateFromSettingsUi();
    assertState(afterAnnotationsReload, {
        annotationsPaused: true,
        furiganaMode: 'off',
        pageScanMode: 'off',
        popupMode: 'auto',
        puckState: 'paused',
    }, 'annotations reload');

    await cyclePuckTo('on');
    await reloadBuiltRuntime();
    const afterPuckResumeReload = await readStateFromSettingsUi();
    assertState(afterPuckResumeReload, {
        annotationsPaused: false,
        furiganaMode: 'all',
        pageScanMode: 'auto',
        popupMode: 'auto',
        puckState: 'on',
    }, 'puck resume reload');

    await saveFormChoice('popupMode', 'sheet');
    await reloadBuiltRuntime();
    const afterDropdownReload = await readStateFromSettingsUi();
    assertState(afterDropdownReload, {
        annotationsPaused: false,
        furiganaMode: 'all',
        pageScanMode: 'auto',
        popupMode: 'sheet',
        puckState: 'on',
    }, 'normal dropdown reload');

    const report = {
        page: REAL_PAGE_URL,
        pageKind: 'deterministic normal-page loopback fixture',
        artifact: 'freshly built dist/yomu.user.js plus current settings companion',
        before,
        afterFuriganaReload,
        afterAnnotationsReload,
        afterPuckResumeReload,
        afterDropdownReload,
        browserMessages,
    };
    const artifactPath = path.join(ARTIFACTS, 'settings-persistence-smoke.json');
    writeFileSync(artifactPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(`settings persistence smoke passed: ${artifactPath}`);
} finally {
    await context.close().catch(() => undefined);
    await closeSmokeBrowserAndServer(browser, fixture.server);
}

async function injectBuiltRuntime() {
    await installUserscriptCssResource(page, CSS_PATH).catch(() => page.addStyleTag({ path: CSS_PATH }));
    for (const scriptPath of COMPANION_SCRIPT_PATHS) {
        await addScriptTagWithCspFallback(page, scriptPath);
    }
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
    await page.waitForSelector(PUCK, { timeout: 15_000 });
}

async function reloadBuiltRuntime() {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    await injectBuiltRuntime();
}

async function openSettings() {
    await page.keyboard.press('Control+Shift+J');
    await page.waitForSelector(SETTINGS_FORM, { timeout: 10_000 });
}

async function closeSettings() {
    await page.keyboard.press('Escape');
    await page.waitForSelector(SETTINGS_FORM, { state: 'detached', timeout: 10_000 });
}

async function readStateFromSettingsUi() {
    await openSettings();
    const state = await page.evaluate(({ formSelector, settingsKey }) => {
        const form = document.querySelector(formSelector);
        const stored = window.GM_getValue(settingsKey, {});
        const checkedScanMode = form?.querySelector('input[name="pageScanMode"]:checked');
        const puck = document.querySelector('.jpdb-reader-fab');
        const puckState = puck?.classList.contains('jpdb-reader-fab--paused')
            ? 'paused'
            : puck?.classList.contains('jpdb-reader-fab--no-furigana')
                ? 'no-furigana'
                : puck?.classList.contains('jpdb-reader-fab--on')
                    ? 'on'
                    : 'unknown';
        return {
            annotationsPaused: Boolean(stored.annotationsPaused),
            furiganaMode: form?.querySelector('select[name="furiganaMode"]')?.value ?? '',
            pageScanMode: checkedScanMode?.value ?? '',
            popupMode: form?.querySelector('select[name="popupMode"]')?.value ?? '',
            puckState,
            stored: {
                annotationsPaused: Boolean(stored.annotationsPaused),
                furiganaMode: stored.furiganaMode ?? '',
                popupMode: stored.popupMode ?? '',
                puckFuriganaModeBeforeHide: stored.puckFuriganaModeBeforeHide ?? '',
            },
        };
    }, { formSelector: SETTINGS_FORM, settingsKey: YOMU_SETTINGS_KEY });
    await closeSettings();
    return state;
}

async function saveFormChoice(name, value) {
    await openSettings();
    const radio = page.locator(`${SETTINGS_FORM} input[name="${name}"][value="${value}"]`);
    if (await radio.count()) await radio.check();
    else await page.locator(`${SETTINGS_FORM} select[name="${name}"]`).selectOption(value);
    await page.locator(`${SETTINGS_FORM} button[type="submit"]`).click();
    await page.waitForSelector(SETTINGS_FORM, { state: 'detached', timeout: 10_000 });
}

async function cyclePuckTo(expectedState) {
    await page.locator(PUCK).click();
    await page.locator(POWER).click();
    try {
        await page.waitForFunction(({ selector, state }) => {
            const puck = document.querySelector(selector);
            if (state === 'paused') return puck?.classList.contains('jpdb-reader-fab--paused');
            if (state === 'no-furigana') return puck?.classList.contains('jpdb-reader-fab--no-furigana');
            return puck?.classList.contains('jpdb-reader-fab--on');
        }, { selector: PUCK, state: expectedState }, { timeout: 10_000 });
        // The puck repaints synchronously, while its durable write completes
        // asynchronously. Wait for the write before navigating so the reload
        // tests acknowledged persistence rather than deliberately aborting an
        // in-flight user action.
        await page.waitForFunction(({ settingsKey, state }) => {
            const stored = window.GM_getValue(settingsKey, {});
            if (state === 'paused') return stored.annotationsPaused === true;
            if (state === 'no-furigana') {
                return stored.annotationsPaused === false
                    && stored.furiganaMode === 'off'
                    && Boolean(stored.puckFuriganaModeBeforeHide);
            }
            return stored.annotationsPaused === false
                && stored.furiganaMode !== 'off'
                && stored.puckFuriganaModeBeforeHide === '';
        }, { settingsKey: YOMU_SETTINGS_KEY, state: expectedState }, { timeout: 10_000 });
        await page.waitForFunction(() =>
            !window.GM_listValues().some(key => key.startsWith('yomu:lease:')), undefined, { timeout: 10_000 });
    } catch (error) {
        const diagnostic = await page.evaluate(settingsKey => ({
            leaseKeys: window.GM_listValues().filter(key => key.startsWith('yomu:lease:')),
            stored: window.GM_getValue(settingsKey, {}),
            toasts: Array.from(document.querySelectorAll('.jpdb-reader-toast')).map(element => element.textContent ?? ''),
        }), YOMU_SETTINGS_KEY);
        throw new Error(`Puck reached ${expectedState} visually but its durable write did not settle.\n${JSON.stringify({ ...diagnostic, browserMessages }, null, 2)}`, { cause: error });
    }
}

function assertState(actual, expected, label) {
    for (const [key, value] of Object.entries(expected)) {
        assert(actual[key] === value, `${label}: ${key} did not survive the reload`, { actual, expected });
    }
}
