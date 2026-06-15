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
const STATIC_CONTENT_TYPES = new Map([
    ['.js', 'text/javascript; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.svg', 'image/svg+xml; charset=utf-8'],
    ['.png', 'image/png'],
]);

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
    wordUnderlineColorSource: 'pitch',
    wordTextColorSource: 'pitch',
    lookupOnHover: false,
    lookupOnClick: false,
    showFloatingButton: false,
    enableLogging: false,
};

const VIEWPORTS = [
    { name: 'desktop', viewport: { width: 1360, height: 900 }, hasTouch: false, isMobile: false, panel: 'media' },
    { name: 'tablet', viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: false, panel: 'media' },
    { name: 'mobile', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, panel: 'media' },
    { name: 'desktop-appearance', viewport: { width: 1360, height: 900 }, hasTouch: false, isMobile: false, panel: 'appearance' },
];

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
    try {
        await page.goto(`${baseUrl}${NEWTAB_BASE_PATH}index.html?q=${encodeURIComponent('読み取る')}&settings-layout=${scenario.name}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-jpdb-reader-root].jpdb-reader-newtab', { timeout: 12_000 });
        await openSettingsFromNewTabMenu(page);
        await selectSettingsPanel(page, scenario.panel);
        await waitForRealSettingsRubyAndPitch(page, scenario.panel, requests, browserMessages);
        await exerciseNativeSettingsControls(page, scenario.panel);

        const snapshot = await settingsLayoutSnapshot(page, scenario.panel);
        const screenshotPath = path.join(ARTIFACT_DIR, `settings-layout-${scenario.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });

        assert(snapshot.dialog.visible, `${scenario.name} settings dialog did not open`, snapshot);
        assert(snapshot.panel.visible, `${scenario.name} ${scenario.panel} settings panel is not visible`, snapshot);
        assert(snapshot.rubyCount >= 4, `${scenario.name} settings did not render real ruby/furigana`, snapshot);
        assert(snapshot.pitchWordCount >= 2, `${scenario.name} settings did not hydrate pitch classes`, snapshot);
        if (scenario.panel === 'media') {
            assert(snapshot.controlGridCount >= 5, `${scenario.name} compact media grids were not rendered`, snapshot);
            assert(snapshot.mediaFieldsetCount >= 5, `${scenario.name} did not expose all media settings groups`, snapshot);
        }
        assert(snapshot.nativeControls.selectChanged, `${scenario.name} native select interaction did not work`, snapshot);
        assert(snapshot.nativeControls.checkboxChanged, `${scenario.name} native checkbox interaction did not work`, snapshot);
        assert(snapshot.popoverCount === 0, `${scenario.name} settings layout smoke opened an unrelated lookup popover`, snapshot);
        assert(snapshot.issues.length === 0, `${scenario.name} settings layout issues`, snapshot);
        return {
            name: scenario.name,
            panel: scenario.panel,
            viewport: scenario.viewport,
            rubyCount: snapshot.rubyCount,
            pitchWordCount: snapshot.pitchWordCount,
            gridCount: snapshot.controlGridCount,
            requestCount: requests.length,
            screenshotPath,
        };
    } finally {
        await context.close();
    }
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
    await page.waitForSelector(selector, { timeout: 8_000 });
    await page.evaluate(({ tabSelector }) => {
        document.querySelector(tabSelector)?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }, { tabSelector: selector });
    await page.waitForSelector(`.jpdb-reader-settings [data-settings-panel="${panel}"]:not([hidden])`, { timeout: 8_000 });
}

async function waitForRealSettingsRubyAndPitch(page, panel, requests, browserMessages) {
    try {
        await page.waitForFunction(({ panelName }) => {
        const root = document.querySelector(`.jpdb-reader-settings [data-settings-panel="${panelName}"]:not([hidden])`);
        if (!root) return false;
        const rubyCount = root.querySelectorAll('.jpdb-reader-word.jpdb-reader-has-furi rt').length;
        const pitchCount = [...root.querySelectorAll('.jpdb-reader-word')]
            .filter(word => [...word.classList].some(className => /^jpdb-pitch-(?:heiban|atamadaka|nakadaka|odaka|kifuku)$/.test(className))).length;
        return rubyCount >= 4 && pitchCount >= 2;
        }, { panelName: panel }, { timeout: 15_000 });
    } catch (error) {
        const snapshot = await settingsHydrationSnapshot(page, panel);
        throw new Error(`Settings ruby/pitch did not hydrate for ${panel}: ${error.message}\n${JSON.stringify({ snapshot, requests, browserMessages }, null, 2)}`);
    }
}

async function settingsHydrationSnapshot(page, panel) {
    return await page.evaluate(panelName => {
        const root = document.querySelector(`.jpdb-reader-settings [data-settings-panel="${panelName}"]:not([hidden])`);
        const words = [...(root?.querySelectorAll('.jpdb-reader-word') ?? [])];
        return {
            hasRoot: Boolean(root),
            text: root?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 600) ?? '',
            wordCount: words.length,
            fallbackCount: words.filter(word => word.getAttribute('data-card-source') === 'fallback').length,
            rubyCount: root?.querySelectorAll('.jpdb-reader-word.jpdb-reader-has-furi rt').length ?? 0,
            pitchCount: words.filter(word => [...word.classList].some(className => /^jpdb-pitch-(?:heiban|atamadaka|nakadaka|odaka|kifuku)$/.test(className))).length,
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
        const select = root.querySelector('select');
        const checkbox = root.querySelector('input[type="checkbox"]');
        if (select instanceof HTMLSelectElement && select.options.length > 1) {
            const before = select.value;
            const next = [...select.options].find(option => option.value !== before)?.value ?? before;
            select.value = next;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            select.dataset.settingsLayoutSmokeChanged = String(select.value !== before);
        }
        if (checkbox instanceof HTMLInputElement) {
            const before = checkbox.checked;
            checkbox.click();
            checkbox.dataset.settingsLayoutSmokeChanged = String(checkbox.checked !== before);
        }
    }, panel);
    await page.waitForTimeout(100);
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

        for (const element of visibleElements(`.jpdb-reader-settings [data-settings-panel="${panelName}"]:not([hidden]) legend, .jpdb-reader-settings [data-settings-panel="${panelName}"]:not([hidden]) .jpdb-reader-local-title, .jpdb-reader-settings [data-settings-panel="${panelName}"]:not([hidden]) .jpdb-reader-settings-label-text, .jpdb-reader-settings [data-settings-panel="${panelName}"]:not([hidden]) .jpdb-reader-select-options-meta, .jpdb-reader-settings [data-settings-panel="${panelName}"]:not([hidden]) button`)) {
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

        const words = [...(panelRoot?.querySelectorAll('.jpdb-reader-word') ?? [])];
        return {
            dialog: { visible: isVisible(dialog), rect: dialogRect },
            panel: { visible: isVisible(panelRoot), name: panelName },
            mediaFieldsetCount: visibleElements('.jpdb-reader-settings fieldset[data-settings-panel="media"]:not([hidden])').length,
            controlGridCount: grids.length,
            rubyCount: panelRoot?.querySelectorAll('.jpdb-reader-word.jpdb-reader-has-furi rt').length ?? 0,
            pitchWordCount: words.filter(word => [...word.classList].some(className => /^jpdb-pitch-(?:heiban|atamadaka|nakadaka|odaka|kifuku)$/.test(className))).length,
            popoverCount: visibleElements('.jpdb-reader-popover').length,
            nativeControls: {
                selectChanged: Boolean(panelRoot?.querySelector('select[data-settings-layout-smoke-changed="true"]')),
                checkboxChanged: Boolean(panelRoot?.querySelector('input[type="checkbox"][data-settings-layout-smoke-changed="true"]')),
            },
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
