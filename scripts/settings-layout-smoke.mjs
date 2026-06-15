#!/usr/bin/env node
import { mkdirSync } from 'node:fs';
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
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const paths = createSmokePaths(import.meta.dirname);
const ARTIFACT_DIR = path.join(paths.artifacts, 'settings-layout');
const OPEN_SETTINGS_EVENT = 'yomu-open-settings';
const SETTINGS_FIXTURE_HTML = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>Yomu settings layout smoke</title>
  <style>
    body { margin: 0; min-height: 100vh; background: #f5f7f8; color: #1d2730; font: 16px/1.6 system-ui, sans-serif; }
    main { width: min(760px, calc(100vw - 32px)); margin: 10vh auto; }
  </style>
</head>
<body>
  <main>
    <h1>設定レイアウト確認</h1>
    <p>日本語の設定画面でルビ付きラベルが詰まりすぎたり散らばったりしないことを確認します。</p>
  </main>
</body>
</html>`;

const BASE_SETTINGS = {
    onboardingSeen: true,
    interfaceLanguage: 'ja',
    apiKey: '',
    jitenApiKey: '',
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
    showPitchAccent: true,
    lookupOnHover: true,
    lookupOnClick: true,
    showFloatingButton: false,
    enableLogging: false,
};

const VIEWPORTS = [
    { name: 'desktop', viewport: { width: 1360, height: 900 }, hasTouch: false, isMobile: false },
    { name: 'tablet', viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: false },
    { name: 'mobile', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
];

mkdirSync(ARTIFACT_DIR, { recursive: true });
assertBuiltArtifacts([paths.scriptPath, paths.cssPath], paths.root);

let browser;
let server;
try {
    server = await startLoopbackServer(serveSettingsFixtureRequest, 'Could not bind settings layout smoke server');
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
        viewport: scenario.viewport,
        hasTouch: scenario.hasTouch,
        isMobile: scenario.isMobile,
    });
    const page = await context.newPage();
    await page.addInitScript(({ key, value }) => {
        localStorage.setItem(key, JSON.stringify(value));
    }, { key: YOMU_SETTINGS_KEY, value: BASE_SETTINGS });
    await page.goto(`${baseUrl}/settings-layout-fixture.html`, { waitUntil: 'domcontentloaded' });
    await installUserscriptCssResource(page, paths.cssPath);
    await addScriptTagWithCspFallback(page, paths.scriptPath);
    await page.waitForTimeout(350);
    await openSettings(page);
    await stressJapaneseRuby(page);
    const snapshot = await settingsLayoutSnapshot(page);
    const screenshotPath = path.join(ARTIFACT_DIR, `settings-layout-${scenario.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await context.close();

    assert(snapshot.dialog.visible, `${scenario.name} settings dialog did not open`, snapshot);
    assert(snapshot.mediaPanelCount >= 5, `${scenario.name} did not expose all media settings panels`, snapshot);
    assert(snapshot.rubyCount >= 8, `${scenario.name} Japanese ruby stress did not apply`, snapshot);
    assert(snapshot.controlGridCount >= 5, `${scenario.name} compact media grids were not rendered`, snapshot);
    assert(snapshot.issues.length === 0, `${scenario.name} settings layout issues`, snapshot);
    return {
        name: scenario.name,
        viewport: scenario.viewport,
        rubyCount: snapshot.rubyCount,
        gridCount: snapshot.controlGridCount,
        screenshotPath,
    };
}

function serveSettingsFixtureRequest(request, response) {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/' || url.pathname === '/settings-layout-fixture.html') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(SETTINGS_FIXTURE_HTML);
        return;
    }
    if (url.pathname === '/yomu.user.js') {
        serveFile(response, paths.scriptPath, 'application/javascript; charset=utf-8', request.method);
        return;
    }
    if (url.pathname === '/yomu.css') {
        serveFile(response, paths.cssPath, 'text/css; charset=utf-8', request.method);
        return;
    }
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
}

async function openSettings(page) {
    await page.evaluate(eventName => {
        window.dispatchEvent(new CustomEvent(eventName, { detail: { panel: 'media' } }));
    }, OPEN_SETTINGS_EVENT);
    await page.waitForSelector('.jpdb-reader-settings [data-settings-panel="media"]:not([hidden])', { timeout: 8000 });
}

async function stressJapaneseRuby(page) {
    await page.evaluate(() => {
        const targets = [
            ...document.querySelectorAll('.jpdb-reader-settings [data-settings-panel="media"]:not([hidden]) legend'),
            ...document.querySelectorAll('.jpdb-reader-settings [data-settings-panel="media"]:not([hidden]) .jpdb-reader-local-title'),
            ...document.querySelectorAll('.jpdb-reader-settings [data-settings-panel="media"]:not([hidden]) .jpdb-reader-settings-label-text'),
        ];
        for (const target of targets) addRubyStress(target);

        function addRubyStress(target) {
            if (!(target instanceof HTMLElement) || target.querySelector('ruby')) return;
            const text = target.textContent ?? '';
            const match = text.match(/[一-龯ぁ-んァ-ンー]{2,}/u);
            if (!match || match.index === undefined) return;
            const before = text.slice(0, match.index);
            const after = text.slice(match.index + match[0].length);
            const word = document.createElement('span');
            word.className = 'jpdb-reader-word jpdb-reader-has-furi jpdb-new jpdb-pitch-heiban';
            const ruby = document.createElement('ruby');
            const base = document.createElement('span');
            base.className = 'jpdb-reader-ruby-base';
            base.textContent = match[0];
            const rt = document.createElement('rt');
            rt.className = 'jpdb-reader-furi';
            rt.textContent = 'よみ';
            ruby.append(base, rt);
            word.append(ruby);
            target.replaceChildren(document.createTextNode(before), word, document.createTextNode(after));
        }
    });
}

async function settingsLayoutSnapshot(page) {
    return await page.evaluate(() => {
        const dialog = document.querySelector('.jpdb-reader-settings');
        const dialogRect = rectSnapshot(dialog?.getBoundingClientRect());
        const mediaPanels = visibleElements('[data-settings-panel="media"]:not([hidden])');
        const grids = visibleElements('.jpdb-reader-settings [data-settings-panel="media"]:not([hidden]) .jpdb-reader-settings-toggle-grid, .jpdb-reader-settings [data-settings-panel="media"]:not([hidden]) .jpdb-reader-settings-control-grid');
        const issues = [];
        const scroll = document.querySelector('.jpdb-reader-settings-scroll');
        const scrollRect = scroll?.getBoundingClientRect();
        const horizontalBounds = scrollRect ?? dialog?.getBoundingClientRect();

        for (const element of visibleElements('.jpdb-reader-settings [data-settings-panel="media"]:not([hidden]) legend, .jpdb-reader-settings [data-settings-panel="media"]:not([hidden]) .jpdb-reader-local-title, .jpdb-reader-settings [data-settings-panel="media"]:not([hidden]) .jpdb-reader-settings-label-text, .jpdb-reader-settings [data-settings-panel="media"]:not([hidden]) .jpdb-reader-select-options-meta, .jpdb-reader-settings [data-settings-panel="media"]:not([hidden]) button')) {
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

        return {
            dialog: { visible: isVisible(dialog), rect: dialogRect },
            mediaPanelCount: mediaPanels.length,
            controlGridCount: grids.length,
            rubyCount: document.querySelectorAll('.jpdb-reader-settings [data-settings-panel="media"]:not([hidden]) ruby, .jpdb-reader-settings [data-settings-panel="media"]:not([hidden]) rt').length,
            issues,
        };

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
                if (gap > 34) found.push({ type: 'large-grid-row-gap', grid: gridClass(grid), gap: round(gap), row: index + 1 });
            }
            return found;
        }

        function rowBounds(rects) {
            const rows = [];
            for (const rect of rects.sort((left, right) => left.top - right.top || left.left - right.left)) {
                const row = rows.find(item => Math.abs(item.top - rect.top) < 8);
                if (row) {
                    row.top = Math.min(row.top, rect.top);
                    row.bottom = Math.max(row.bottom, rect.bottom);
                } else {
                    rows.push({ top: rect.top, bottom: rect.bottom });
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
    });
}
