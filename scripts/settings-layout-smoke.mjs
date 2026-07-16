#!/usr/bin/env node
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    YOMU_SETTINGS_KEY,
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    serveFile,
    startLoopbackServer,
} from './lib/smoke-harness.mjs';
import { createSmokePaths } from './lib/smoke-harness.mjs';

const paths = createSmokePaths(import.meta.dirname);
const ARTIFACT_DIR = path.join(paths.artifacts, 'settings-layout');
const NEWTAB_DIR = paths.newTabDir;
const PUBLIC_DIR = path.join(paths.root, 'docs', 'public');
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
    ['色', 'いろ'],
    ['単語', 'たんご'],
    ['漢字', 'かんじ'],
    ['統計', 'とうけい'],
    ['読む', 'よむ'],
    ['新しい', 'あたらしい'],
    ['言葉', 'ことば'],
    ['日本語', 'にほんご'],
    ['毎日', 'まいにち'],
    ['勉強', 'べんきょう'],
    ['上手', 'じょうず'],
    ['読み取る', 'よみとる'],
]);
const JITEN_PUBLIC_FIXTURES = new Map();

const BASE_SETTINGS = {
    onboardingSeen: true,
    interfaceLanguage: 'ja',
    apiKey: '',
    jitenApiKey: '',
    jpdbDefinitionsEnabled: false,
    localDictionariesEnabled: false,
    ankiEnabled: false,
    ankiSectionEnabled: false,
    newTabEnabled: true,
    newTabAnkiEnabled: false,
    audioEnabled: true,
    autoPlayAudio: true,
    audioAutoPlayMode: 'all',
    audioEnableDefaultSources: true,
    audioFallbackChimeEnabled: true,
    immersionKitEnabled: true,
    immersionKitShowTranslation: true,
    immersionKitRevealTranslationOnClick: true,
    immersionKitShowImages: true,
    immersionKitAutoPlayAudio: true,
    immersionKitPlayOnHover: true,
    immersionKitPlayOnImageClick: true,
    furiganaMode: 'all',
    showFurigana: true,
    showPitchAccent: true,
    theme: 'dark',
    wordUnderlineColorSource: 'pitch',
    wordTextColorSource: 'pitch',
    lookupOnHover: false,
    lookupOnClick: false,
    showFloatingButton: false,
    enableLogging: false,
};

const PANELS = ['appearance', 'api', 'dictionaries', 'media', 'mining', 'newTab', 'shortcuts', 'help'];
const VIEWPORTS = [
    { name: 'desktop', viewport: { width: 1360, height: 900 }, hasTouch: false, isMobile: false },
    { name: 'tablet', viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: false },
    { name: 'mobile', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
].flatMap(viewport => PANELS.map(panel => ({ ...viewport, name: `${viewport.name}-${panel.toLowerCase()}`, panel })));

mkdirSync(ARTIFACT_DIR, { recursive: true });
assertBuiltArtifacts([
    path.join(NEWTAB_DIR, 'index.html'),
    path.join(NEWTAB_DIR, 'app.js'),
    path.join(NEWTAB_DIR, 'styles.css'),
], paths.root);

let browser;
let server;
try {
    server = await startLoopbackServer(serveHostedNewTabRequest, 'Could not bind settings layout smoke server');
    browser = await chromium.launch();
    const results = [];
    for (const scenario of VIEWPORTS) {
        const result = await verifyViewport(browser, server.baseUrl, scenario);
        results.push(result);
    }
    console.log(JSON.stringify({ ok: true, results }, null, 2));
} finally {
    if (browser && server) await closeSmokeBrowserAndServer(browser, server);
    else if (browser) await browser.close().catch(() => undefined);
    else if (server) await server.close?.().catch(() => undefined);
}

async function verifyViewport(browserInstance, baseUrl, scenario) {
    const context = await browserInstance.newContext({
        bypassCSP: true,
        viewport: scenario.viewport,
        hasTouch: scenario.hasTouch,
        isMobile: scenario.isMobile,
        colorScheme: 'dark',
    });
    const page = await context.newPage();
    const requests = [];
    const browserMessages = [];
    page.on('console', message => {
        if (['error', 'warning'].includes(message.type())) browserMessages.push({ type: message.type(), text: message.text() });
    });
    page.on('pageerror', error => {
        browserMessages.push({ type: 'pageerror', text: error.stack || error.message });
    });
    await page.addInitScript(({ key, value }) => {
        localStorage.setItem(key, JSON.stringify(value));
    }, { key: YOMU_SETTINGS_KEY, value: BASE_SETTINGS });
    await page.route('https://jpdb.io/**', route => route.fulfill(mockedJpdbRoute(route.request(), requests)));
    await page.route('https://api.jiten.moe/**', route => route.fulfill(mockedJitenRoute(route.request(), requests)));
    await page.route(`${YOMU_PUBLIC_PROXY_ORIGIN}/**`, route => route.fulfill(mockedProxyRoute(route.request(), requests)));
    try {
        await page.goto(`${baseUrl}${NEWTAB_BASE_PATH}index.html?q=${encodeURIComponent('読み取る')}&settings-layout=${scenario.name}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-jpdb-reader-root].jpdb-reader-newtab', { timeout: 12_000 });
        await openSettingsFromNewTabMenu(page);
        await selectSettingsPanel(page, scenario.panel);
        const rubyPitchMinimums = settingsRubyPitchMinimums(scenario.panel);
        if (rubyPitchMinimums) {
            await waitForRealSettingsRubyAndPitch(page, scenario.panel, rubyPitchMinimums, requests, browserMessages);
        }

        const snapshot = await settingsLayoutSnapshot(page, scenario.panel);
        const screenshotPath = path.join(ARTIFACT_DIR, `settings-layout-${scenario.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        let middleScreenshotPath = null;
        if (scenario.panel === 'newTab') {
            await scrollSettingsToStudySteps(page);
            middleScreenshotPath = path.join(ARTIFACT_DIR, `settings-layout-${scenario.name}-steps.png`);
            await page.screenshot({ path: middleScreenshotPath, fullPage: false });
        }
        await scrollSettingsToBottom(page);
        const bottomScreenshotPath = path.join(ARTIFACT_DIR, `settings-layout-${scenario.name}-bottom.png`);
        await page.screenshot({ path: bottomScreenshotPath, fullPage: false });
        await exerciseNativeSettingsControls(page, scenario.panel);
        const interactionSnapshot = await settingsLayoutSnapshot(page, scenario.panel);

        assert(snapshot.dialog.visible, `${scenario.name} settings dialog did not open`, snapshot);
        assert(snapshot.panel.visible, `${scenario.name} ${scenario.panel} settings panel is not visible`, snapshot);
        if (rubyPitchMinimums) {
            assert(snapshot.rubyCount >= rubyPitchMinimums.ruby, `${scenario.name} settings did not render real ruby/furigana`, snapshot);
            assert(snapshot.pitchWordCount >= rubyPitchMinimums.pitch, `${scenario.name} settings did not hydrate pitch classes`, snapshot);
        }
        assert(snapshot.selectOptionMetaCount === 0, `${scenario.name} repeated select option metadata leaked into settings`, snapshot);
        assert(snapshot.longSelectMirrorCount === 0, `${scenario.name} select mirrors rendered option lists instead of selected values`, snapshot);
        if (scenario.panel === 'media') {
            assert(snapshot.controlGridCount >= 5, `${scenario.name} compact media grids were not rendered`, snapshot);
            assert(snapshot.mediaFieldsetCount >= 5, `${scenario.name} did not expose all media settings groups`, snapshot);
        }
        if (scenario.panel === 'appearance') {
            const maxPreviewRows = scenario.viewport.width <= 420 ? 4 : 3;
            assert(snapshot.preview.wordCount >= 6, `${scenario.name} appearance preview did not expose the Japanese sample words`, snapshot);
            assert(snapshot.preview.rowCount <= maxPreviewRows, `${scenario.name} appearance preview stacked Japanese words`, snapshot);
            assert(snapshot.preview.maxWordsPerRow >= 2, `${scenario.name} appearance preview did not keep words flowing together`, snapshot);
        }
        if (interactionSnapshot.nativeControls.selectCount > 0) {
            assert(interactionSnapshot.nativeControls.selectChanged, `${scenario.name} native select interaction did not work`, interactionSnapshot);
        }
        if (interactionSnapshot.nativeControls.checkboxCount > 0) {
            assert(interactionSnapshot.nativeControls.checkboxChanged, `${scenario.name} native checkbox interaction did not work`, interactionSnapshot);
        }
        assert(snapshot.popoverCount === 0, `${scenario.name} settings layout smoke opened an unrelated lookup popover`, snapshot);
        assert(snapshot.issues.length === 0, `${scenario.name} settings layout issues`, snapshot);
        return {
            name: scenario.name,
            panel: scenario.panel,
            viewport: scenario.viewport,
            rubyCount: snapshot.rubyCount,
            pitchWordCount: snapshot.pitchWordCount,
            gridCount: snapshot.controlGridCount,
            preview: {
                wordCount: snapshot.preview.wordCount,
                rowCount: snapshot.preview.rowCount,
                maxWordsPerRow: snapshot.preview.maxWordsPerRow,
            },
            requestCount: requests.length,
            screenshotPath,
            ...(middleScreenshotPath ? { middleScreenshotPath } : {}),
            bottomScreenshotPath,
        };
    } finally {
        await context.close();
    }
}

function settingsRubyPitchMinimums(panel) {
    // Require hydrated learner text only on tabs that intentionally carry
    // Japanese previews/source examples. Utility tabs are still covered for
    // layout, overflow, screenshots, and native-control interaction.
    const minimums = {
        appearance: { ruby: 4, pitch: 2 },
        api: { ruby: 4, pitch: 2 },
        dictionaries: { ruby: 4, pitch: 2 },
        newTab: { ruby: 2, pitch: 2 },
    };
    return minimums[panel] ?? null;
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

async function openSettingsFromNewTabMenu(page) {
    await page.locator('.jpdb-reader-newtab-more summary').click();
    await page.locator('[data-newtab-action="settings"]').click();
    await page.waitForSelector('.jpdb-reader-settings', { timeout: 8_000 });
}

async function selectSettingsPanel(page, panel) {
    const selector = `.jpdb-reader-settings [data-action="settings-panel"][data-panel="${panel}"]`;
    await page.waitForSelector(selector, { state: 'attached', timeout: 8_000 });
    await page.evaluate(({ tabSelector }) => {
        document.querySelector(tabSelector)?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }, { tabSelector: selector });
    await page.waitForSelector(`.jpdb-reader-settings [data-settings-panel="${panel}"]:not([hidden])`, { timeout: 8_000 });
}

async function waitForRealSettingsRubyAndPitch(page, panel, minimums, requests, browserMessages) {
    try {
        await page.waitForFunction(({ panelName, rubyMinimum, pitchMinimum }) => {
        const root = document.querySelector(`.jpdb-reader-settings [data-settings-panel="${panelName}"]:not([hidden])`);
        if (!root) return false;
        const rubyCount = root.querySelectorAll('.jpdb-reader-word.jpdb-reader-has-furi rt').length;
        const pitchCount = [...root.querySelectorAll('.jpdb-reader-word')]
            .filter(word => [...word.classList].some(className => /^jpdb-pitch-(?:heiban|atamadaka|nakadaka|odaka)$/.test(className))).length;
        return rubyCount >= rubyMinimum && pitchCount >= pitchMinimum;
        }, { panelName: panel, rubyMinimum: minimums.ruby, pitchMinimum: minimums.pitch }, { timeout: 30_000 });
    } catch (error) {
        const snapshot = await settingsHydrationSnapshot(page, panel);
        throw new Error(`Settings ruby/pitch did not hydrate for ${panel}: ${error.message}\n${JSON.stringify({ snapshot, requests, browserMessages }, null, 2)}`);
    }
}

async function settingsHydrationSnapshot(page, panel) {
    return await page.evaluate(panelName => {
        const root = document.querySelector(`.jpdb-reader-settings [data-settings-panel="${panelName}"]:not([hidden])`);
        const words = [...(root?.querySelectorAll('.jpdb-reader-word') ?? [])];
        const form = document.querySelector('.jpdb-reader-settings');
        const allWords = [...(form?.querySelectorAll('.jpdb-reader-word') ?? [])];
        const panels = [...(form?.querySelectorAll('[data-settings-panel]') ?? [])].map(panel => ({
            id: panel.id,
            panel: panel.getAttribute('data-settings-panel') ?? '',
            hidden: panel.hasAttribute('hidden'),
            words: panel.querySelectorAll('.jpdb-reader-word').length,
            fallback: [...panel.querySelectorAll('.jpdb-reader-word')]
                .filter(word => word.getAttribute('data-card-source') === 'fallback').length,
            text: panel.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? '',
        }));
        return {
            hasRoot: Boolean(root),
            text: root?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 600) ?? '',
            wordCount: words.length,
            totalWordCount: allWords.length,
            totalFallbackCount: allWords.filter(word => word.getAttribute('data-card-source') === 'fallback').length,
            panels,
            fallbackCount: words.filter(word => word.getAttribute('data-card-source') === 'fallback').length,
            rubyCount: root?.querySelectorAll('.jpdb-reader-word.jpdb-reader-has-furi rt').length ?? 0,
            pitchCount: words.filter(word => [...word.classList].some(className => /^jpdb-pitch-(?:heiban|atamadaka|nakadaka|odaka)$/.test(className))).length,
            loadingKey: document.querySelector('.jpdb-reader-settings')?.getAttribute('data-jpdb-reader-parse-loading-key') ?? '',
            parseKey: document.querySelector('.jpdb-reader-settings')?.getAttribute('data-jpdb-reader-parse-key') ?? '',
            sampleWords: words.slice(0, 12).map(word => ({
                text: word.textContent?.replace(/\s+/g, '').trim() ?? '',
                expression: word.getAttribute('data-expression') ?? '',
                reading: word.getAttribute('data-reading') ?? '',
                source: word.getAttribute('data-card-source') ?? '',
                pitchClass: word.getAttribute('data-pitch-class') ?? '',
                classes: [...word.classList],
            })),
        };
    }, panel);
}

async function exerciseNativeSettingsControls(page, panel) {
    await page.evaluate(panelName => {
        const root = document.querySelector(`.jpdb-reader-settings [data-settings-panel="${panelName}"]:not([hidden])`);
        if (!root) return;
        const visible = element => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        };
        const select = [...root.querySelectorAll('select')]
            .find(item => item instanceof HTMLSelectElement && !item.disabled && visible(item) && [...item.options].some(option => option.value !== item.value));
        const checkbox = [...root.querySelectorAll('input[type="checkbox"]')]
            .find(item => item instanceof HTMLInputElement && !item.disabled && visible(item));
        if (select instanceof HTMLSelectElement && select.options.length > 1) {
            const before = select.value;
            const next = [...select.options].find(option => option.value !== before)?.value ?? before;
            root.closest('.jpdb-reader-settings')?.setAttribute('data-settings-layout-smoke-select-changed', String(next !== before));
            select.value = next;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            select.dataset.settingsLayoutSmokeChanged = String(select.value !== before);
            root.dataset.settingsLayoutSmokeSelectChanged = String(select.value !== before);
            root.closest('.jpdb-reader-settings')?.setAttribute('data-settings-layout-smoke-select-changed', String(select.value !== before));
        }
        if (checkbox instanceof HTMLInputElement) {
            const before = checkbox.checked;
            root.closest('.jpdb-reader-settings')?.setAttribute('data-settings-layout-smoke-checkbox-changed', 'true');
            checkbox.click();
            checkbox.dataset.settingsLayoutSmokeChanged = String(checkbox.checked !== before);
            root.dataset.settingsLayoutSmokeCheckboxChanged = String(checkbox.checked !== before);
            root.closest('.jpdb-reader-settings')?.setAttribute('data-settings-layout-smoke-checkbox-changed', String(checkbox.checked !== before));
        }
    }, panel);
    await page.waitForTimeout(100);
}

async function scrollSettingsToBottom(page) {
    await page.evaluate(() => {
        const scroll = document.querySelector('.jpdb-reader-settings-scroll');
        if (scroll instanceof HTMLElement) scroll.scrollTop = scroll.scrollHeight;
    });
    await page.waitForTimeout(80);
}

async function scrollSettingsToStudySteps(page) {
    await page.evaluate(() => {
        const scroll = document.querySelector('.jpdb-reader-settings-scroll');
        const steps = document.querySelector('.jpdb-reader-settings [data-settings-panel="newTab"]:not([hidden]) .jpdb-reader-settings-study-steps');
        if (!(scroll instanceof HTMLElement) || !(steps instanceof HTMLElement)) return;
        const scrollRect = scroll.getBoundingClientRect();
        const stepsRect = steps.getBoundingClientRect();
        scroll.scrollTop += stepsRect.top - scrollRect.top - 16;
    });
    await page.waitForTimeout(80);
}

async function settingsLayoutSnapshot(page, panel) {
    return await page.evaluate(panelName => {
        const dialog = document.querySelector('.jpdb-reader-settings');
        const panelRoot = document.querySelector(`.jpdb-reader-settings [data-settings-panel="${panelName}"]:not([hidden])`);
        const dialogRect = rectSnapshot(dialog?.getBoundingClientRect());
        const grids = visibleElements(`.jpdb-reader-settings [data-settings-panel="${panelName}"]:not([hidden]) .jpdb-reader-settings-tgrid, .jpdb-reader-settings [data-settings-panel="${panelName}"]:not([hidden]) .jpdb-reader-settings-cgrid`);
        const issues = [];
        const scroll = document.querySelector('.jpdb-reader-settings-scroll');
        const horizontalBounds = scroll?.getBoundingClientRect() ?? dialog?.getBoundingClientRect();

        for (const element of visibleElements(`.jpdb-reader-settings [data-settings-panel="${panelName}"]:not([hidden]) legend, .jpdb-reader-settings [data-settings-panel="${panelName}"]:not([hidden]) .jpdb-reader-local-title, .jpdb-reader-settings [data-settings-panel="${panelName}"]:not([hidden]) .jpdb-reader-settings-label-text, .jpdb-reader-settings [data-settings-panel="${panelName}"]:not([hidden]) .jpdb-reader-control-text-mirror, .jpdb-reader-settings [data-settings-panel="${panelName}"]:not([hidden]) button`)) {
            const rect = element.getBoundingClientRect();
            if (horizontalBounds && (rect.left < horizontalBounds.left - 2 || rect.right > horizontalBounds.right + 2)) {
                issues.push({ type: 'horizontal-overflow', text: textOf(element), rect: rectSnapshot(rect), bounds: rectSnapshot(horizontalBounds) });
            }
        }

        for (const grid of grids) {
            const children = Array.from(grid.children).filter(isVisible);
            issues.push(...gridOverlapIssues(grid, children));
            issues.push(...gridGapIssues(grid, children));
        }
        issues.push(...sourceRowIssues(panelRoot));
        issues.push(...audioSourceBoxAlignmentIssues(panelRoot));
        issues.push(...gridInlineControlAlignmentIssues(panelRoot));

        const words = [...(panelRoot?.querySelectorAll('.jpdb-reader-word') ?? [])];
        const selectOptionMeta = [...(panelRoot?.querySelectorAll('[data-settings-select-options-meta]') ?? [])];
        const selectMirrors = [...(panelRoot?.querySelectorAll('.jpdb-reader-control-text-mirror') ?? [])];
        const longSelectMirrors = selectMirrors
            .map(mirror => textOf(mirror))
            .filter(text => /\s\/\s/.test(text));
        const preview = previewSnapshot(panelRoot);
        return {
            dialog: { visible: isVisible(dialog), rect: dialogRect },
            panel: { visible: isVisible(panelRoot), name: panelName },
            mediaFieldsetCount: visibleElements('.jpdb-reader-settings fieldset[data-settings-panel="media"]:not([hidden])').length,
            controlGridCount: grids.length,
            rubyCount: panelRoot?.querySelectorAll('.jpdb-reader-word.jpdb-reader-has-furi rt').length ?? 0,
            pitchWordCount: words.filter(word => [...word.classList].some(className => /^jpdb-pitch-(?:heiban|atamadaka|nakadaka|odaka)$/.test(className))).length,
            selectOptionMetaCount: selectOptionMeta.length,
            longSelectMirrorCount: longSelectMirrors.length,
            longSelectMirrors,
            popoverCount: visibleElements('.jpdb-reader-popover').length,
            nativeControls: {
                selectCount: Array.from(panelRoot?.querySelectorAll('select') ?? [])
                    .filter(item => item instanceof HTMLSelectElement && !item.disabled && isVisible(item) && Array.from(item.options).some(option => option.value !== item.value)).length,
                checkboxCount: Array.from(panelRoot?.querySelectorAll('input[type="checkbox"]') ?? [])
                    .filter(item => item instanceof HTMLInputElement && !item.disabled && isVisible(item)).length,
                selectChanged: panelRoot?.getAttribute('data-settings-layout-smoke-select-changed') === 'true'
                    || document.querySelector('.jpdb-reader-settings')?.getAttribute('data-settings-layout-smoke-select-changed') === 'true'
                    || Boolean(panelRoot?.querySelector('select[data-settings-layout-smoke-changed="true"]')),
                checkboxChanged: panelRoot?.getAttribute('data-settings-layout-smoke-checkbox-changed') === 'true'
                    || document.querySelector('.jpdb-reader-settings')?.getAttribute('data-settings-layout-smoke-checkbox-changed') === 'true'
                    || Boolean(panelRoot?.querySelector('input[type="checkbox"][data-settings-layout-smoke-changed="true"]')),
            },
            preview,
            issues,
        };

        function sourceRowIssues(root) {
            if (!root) return [];
            const found = [];
            for (const row of Array.from(root.querySelectorAll('.jpdb-reader-order-row')).filter(isVisible)) {
                const rowRect = row.getBoundingClientRect();
                const rail = row.querySelector('.jpdb-reader-row-order-tools, .jpdb-reader-row-remove-tools');
                if (rail && isVisible(rail)) {
                    const railRect = rail.getBoundingClientRect();
                    if (railRect.right > rowRect.right + 2 || railRect.left < rowRect.left - 2) {
                        found.push({ type: 'source-action-rail-overflow', row: textOf(row), rail: rectSnapshot(railRect), bounds: rectSnapshot(rowRect) });
                    }
                    for (const main of Array.from(row.querySelectorAll('.jpdb-reader-field-display, .jpdb-reader-audio-source-choice, .jpdb-reader-audio-source-fields, input[name$=".alias"]')).filter(isVisible)) {
                        const overlap = overlapArea(railRect, main.getBoundingClientRect());
                        if (overlap > 6) found.push({ type: 'source-action-rail-overlap', row: textOf(row), overlap });
                    }
                }
                if (rowRect.height > 180) {
                    found.push({ type: 'source-row-too-tall', row: textOf(row), rect: rectSnapshot(rowRect) });
                }
            }
            return found;
        }

        function audioSourceBoxAlignmentIssues(root) {
            if (!root) return [];
            const found = [];
            for (const row of Array.from(root.querySelectorAll('.jpdb-reader-audio-source-row')).filter(isVisible)) {
                const rowRect = row.getBoundingClientRect();
                if (rowRect.width < 640) continue;
                const sourceSelect = row.querySelector('.jpdb-reader-audio-source-choice select');
                const pairedControl = Array.from(row.querySelectorAll('.jpdb-reader-audio-source-fields input, .jpdb-reader-audio-source-fields select')).find(isVisible);
                if (!isVisible(sourceSelect) || !isVisible(pairedControl)) continue;
                const sourceRect = sourceSelect.getBoundingClientRect();
                const pairedRect = pairedControl.getBoundingClientRect();
                if (!sharesVisualRow(sourceRect, pairedRect)) continue;
                const topDelta = Math.abs(sourceRect.top - pairedRect.top);
                if (topDelta > 3) {
                    found.push({
                        type: 'audio-source-box-misaligned',
                        row: textOf(row),
                        source: rectSnapshot(sourceRect),
                        paired: rectSnapshot(pairedRect),
                        topDelta: round(topDelta),
                    });
                }
            }
            return found;
        }

        function previewSnapshot(root) {
            const preview = root?.querySelector('[data-yomu-appearance-preview]');
            const line = preview?.querySelector('.jpdb-reader-settings-appearance-preview-line');
            const wordRects = Array.from(preview?.querySelectorAll('.jpdb-reader-word') ?? [])
                .filter(isVisible)
                .map(word => word.getBoundingClientRect());
            const rows = rowBounds(wordRects);
            return {
                wordCount: wordRects.length,
                rowCount: rows.length,
                maxWordsPerRow: rows.reduce((max, row) => Math.max(max, row.count), 0),
                rect: rectSnapshot(preview?.getBoundingClientRect()),
                line: styleSnapshot(line),
                words: Array.from(preview?.querySelectorAll('.jpdb-reader-word') ?? [])
                    .filter(isVisible)
                    .slice(0, 6)
                    .map(word => ({ text: textOf(word), rect: rectSnapshot(word.getBoundingClientRect()), style: styleSnapshot(word) })),
            };
        }

        function styleSnapshot(element) {
            if (!(element instanceof Element)) return null;
            const style = getComputedStyle(element);
            return {
                display: style.display,
                width: style.width,
                maxWidth: style.maxWidth,
                flexBasis: style.flexBasis,
                whiteSpace: style.whiteSpace,
            };
        }

        function gridInlineControlAlignmentIssues(root) {
            if (!root) return [];
            const found = [];
            for (const grid of Array.from(root.querySelectorAll('.grid')).filter(isVisible)) {
                const controls = Array.from(grid.querySelectorAll(':scope > label:not(.inline) > input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), :scope > label:not(.inline) > select, :scope > label:not(.inline) > textarea, :scope > * > label:not(.inline) > input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), :scope > * > label:not(.inline) > select, :scope > * > label:not(.inline) > textarea'))
                    .filter(isVisible);
                const inlineLabels = Array.from(grid.querySelectorAll(':scope > label.inline, :scope > * > label.inline')).filter(isVisible);
                for (const label of inlineLabels) {
                    const labelRect = label.getBoundingClientRect();
                    const peer = controls
                        .map(control => control.getBoundingClientRect())
                        .filter(rect => sharesVisualRow(labelRect, rect))
                        .sort((left, right) => Math.abs(left.bottom - labelRect.bottom) - Math.abs(right.bottom - labelRect.bottom))[0];
                    if (!peer) continue;
                    const bottomDelta = Math.abs(peer.bottom - labelRect.bottom);
                    const centerDelta = Math.abs((peer.top + peer.bottom) / 2 - (labelRect.top + labelRect.bottom) / 2);
                    if (bottomDelta > 12 && centerDelta > 12) {
                        found.push({
                            type: 'inline-control-misaligned',
                            text: textOf(label),
                            label: rectSnapshot(labelRect),
                            peer: rectSnapshot(peer),
                            bottomDelta: round(bottomDelta),
                            centerDelta: round(centerDelta),
                        });
                    }
                }
            }
            return found;
        }

        function sharesVisualRow(left, right) {
            const overlap = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
            const shorter = Math.max(1, Math.min(left.height, right.height));
            const centerDelta = Math.abs((left.top + left.bottom) / 2 - (right.top + right.bottom) / 2);
            return overlap / shorter >= 0.35 || centerDelta <= 14;
        }

        function gridOverlapIssues(grid, children) {
            const found = [];
            const rects = children.map(child => ({ child, rect: child.getBoundingClientRect() }));
            for (let leftIndex = 0; leftIndex < rects.length; leftIndex++) {
                for (let rightIndex = leftIndex + 1; rightIndex < rects.length; rightIndex++) {
                    const overlap = overlapArea(rects[leftIndex].rect, rects[rightIndex].rect);
                    if (overlap > 6) {
                        found.push({
                            type: 'grid-overlap',
                            grid: gridClass(grid),
                            left: textOf(rects[leftIndex].child),
                            right: textOf(rects[rightIndex].child),
                            overlap,
                        });
                    }
                }
            }
            return found;
        }

        function gridGapIssues(grid, children) {
            const rows = rowBounds(children.map(child => child.getBoundingClientRect()));
            const found = [];
            for (let index = 1; index < rows.length; index++) {
                const gap = rows[index].top - rows[index - 1].bottom;
                if (gap > 72) found.push({ type: 'large-grid-row-gap', grid: gridClass(grid), gap: round(gap), row: index + 1 });
            }
            return found;
        }

        function rowBounds(rects) {
            const rows = [];
            for (const rect of rects.sort((left, right) => left.top - right.top || left.left - right.left)) {
                const center = (rect.top + rect.bottom) / 2;
                const row = rows.find(item => Math.abs(item.center - center) < 18);
                if (row) {
                    row.top = Math.min(row.top, rect.top);
                    row.bottom = Math.max(row.bottom, rect.bottom);
                    row.center = (row.top + row.bottom) / 2;
                    row.count += 1;
                } else {
                    rows.push({ top: rect.top, bottom: rect.bottom, center, count: 1 });
                }
            }
            return rows;
        }

        function visibleElements(selector) {
            return Array.from(document.querySelectorAll(selector)).filter(isVisible);
        }

        function isVisible(element) {
            if (!(element instanceof Element)) return false;
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        }

        function overlapArea(left, right) {
            const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
            const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
            return Math.round(width * height);
        }

        function rectSnapshot(rect) {
            if (!rect) return null;
            return { left: round(rect.left), top: round(rect.top), right: round(rect.right), bottom: round(rect.bottom), width: round(rect.width), height: round(rect.height) };
        }

        function gridClass(element) {
            return Array.from(element.classList).join(' ');
        }

        function textOf(element) {
            return String(element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
        }

        function round(value) {
            return Math.round(value * 100) / 100;
        }
    }, panel);
}

function mockedJpdbRoute(request, requests) {
    requests.push({ method: request.method(), url: request.url() });
    const response = mockedJpdbResponse(request.url());
    return {
        status: response.status,
        contentType: response.contentType,
        body: response.body,
        headers: { 'access-control-allow-origin': '*' },
    };
}

function mockedJitenRoute(request, requests) {
    requests.push({ method: request.method(), url: request.url() });
    const response = mockedJitenResponse(request.url(), request.method());
    return {
        status: response.status,
        contentType: response.contentType,
        body: response.body,
        headers: { 'access-control-allow-origin': '*' },
    };
}

function mockedProxyRoute(request, requests) {
    const proxyUrl = new URL(request.url());
    const targetUrl = proxyUrl.searchParams.get('url') ?? '';
    requests.push({ method: request.method(), url: request.url(), targetUrl });
    if (!targetUrl) return { status: 404, contentType: 'application/json; charset=utf-8', body: '{}' };
    const target = new URL(targetUrl);
    const response = target.origin === JPDB_ORIGIN
        ? mockedJpdbResponse(target.href)
        : target.origin === JITEN_ORIGIN
            ? mockedJitenResponse(target.href, request.method())
            : { status: 404, contentType: 'application/json; charset=utf-8', body: '{}' };
    return {
        status: response.status,
        contentType: response.contentType,
        body: response.body,
        headers: { 'access-control-allow-origin': '*' },
    };
}

function mockedJitenResponse(rawUrl, method = 'GET') {
    const url = new URL(rawUrl, JITEN_ORIGIN);
    if (method === 'OPTIONS') {
        return { status: 204, contentType: 'text/plain; charset=utf-8', body: '' };
    }
    if (url.pathname === '/api/vocabulary/parse') {
        const text = url.searchParams.get('text') ?? '';
        return {
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify(jitenParseWords(text)),
        };
    }
    const match = url.pathname.match(/^\/api\/vocabulary\/(\d+)\/(\d+)\/info$/u);
    if (match) {
        return {
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify(jitenVocabularyInfo(Number(match[1]), Number(match[2]))),
        };
    }
    return { status: 404, contentType: 'application/json; charset=utf-8', body: '{}' };
}

function mockedJpdbResponse(rawUrl) {
    const url = new URL(rawUrl, JPDB_ORIGIN);
    const query = url.searchParams.get('q') || vocabularyFromPath(url.pathname).spelling || '設定';
    const { spelling, reading } = vocabularyForQuery(query);
    return {
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: jpdbVocabularyHtml(spelling, reading),
    };
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
    return {
        spelling: decodeURIComponent(parts[2] ?? ''),
        reading: decodeURIComponent(parts[3] ?? ''),
    };
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
        <div class="description">1. settings layout smoke vocabulary</div>
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
    const fixture = [...JITEN_PUBLIC_FIXTURES.values()].find(item => item.wordId === wordId);
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
        definitions: [{ index: 1, meanings: ['settings layout smoke vocabulary'], partsOfSpeech: ['noun'] }],
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
    const existing = JITEN_PUBLIC_FIXTURES.get(spelling);
    if (existing) return existing;
    const reading = VOCABULARY_READINGS.get(spelling)
        ?? (/^[ぁ-んァ-ンー]+$/u.test(spelling) ? spelling : 'よみ');
    const fixture = {
        wordId: stableVocabularyId(spelling),
        spelling,
        reading,
    };
    JITEN_PUBLIC_FIXTURES.set(spelling, fixture);
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

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => HTML_ESCAPES[char]);
}

const HTML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};
