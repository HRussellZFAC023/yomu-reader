#!/usr/bin/env node
// Accent colour and underline choice, up front (W1-60).
//
// Drives the BUILT Study app (dist/newtab, served as https://yomureader.com/study/)
// like a learner: Settings → Appearance must lead with the accent swatches and
// the Underline choice, a tap on 藍 must repaint within one frame, Pitch must
// paint pitch underlines on page and subtitle words without opening Tuning,
// Save must persist both, and a reload must keep them. Then the BUILT
// userscript graph reads those saved values on a reader page and paints the
// puck, the popup and the word underlines with them. Runs in Chromium at desktop
// size and in WebKit at iPad size with touch, in light and dark, English and
// Japanese.
//
// The reader page is accent-underline-mechanism-fixture: a paragraph of plain
// prose with a mocked parse, because what it proves (saved settings reach the
// reader's root, puck and popup) does not depend on a host page's shape.
//
// Prove it fails on an older build:
//   YOMU_ACCENT_SMOKE_STUDY_DIR=/path/to/v2.1.6/docs/public/study node scripts/accent-quick-row-smoke.mjs
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
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
import { addUserscriptGraphInitScripts, userscriptCompanionPaths } from './lib/smoke-test-helpers.mjs';

const {
    root: ROOT,
    artifacts: ARTIFACTS,
    scriptPath: SCRIPT_PATH,
    cssPath: CSS_PATH,
    newTabDir: NEWTAB_DIR,
} = createSmokePaths(import.meta.dirname);
const STUDY_DIR = process.env.YOMU_ACCENT_SMOKE_STUDY_DIR
    ? path.resolve(process.env.YOMU_ACCENT_SMOKE_STUDY_DIR)
    : NEWTAB_DIR;
const STUDY_URL = 'https://yomureader.com/study/';
const AI = '#1f4f8f';
const FIXTURE_PATH = '/accent-underline-mechanism-fixture.html';
const PITCH_PATTERNS = ['heiban', 'atamadaka', 'nakadaka', 'odaka'];
const IPAD_USER_AGENT = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const CONFIGS = [
    { name: 'chromium-desktop-light-en', engine: 'chromium', viewport: { width: 1280, height: 800 }, colorScheme: 'light', language: 'en', touch: false },
    { name: 'chromium-desktop-dark-ja', engine: 'chromium', viewport: { width: 1280, height: 800 }, colorScheme: 'dark', language: 'ja', touch: false },
    { name: 'webkit-ipad-light-ja', engine: 'webkit', viewport: { width: 820, height: 1180 }, colorScheme: 'light', language: 'ja', touch: true },
    { name: 'webkit-ipad-dark-en', engine: 'webkit', viewport: { width: 820, height: 1180 }, colorScheme: 'dark', language: 'en', touch: true },
];
const ENGINES = new Set((process.env.YOMU_ACCENT_SMOKE_ENGINES ?? 'chromium,webkit').split(',').map(value => value.trim()));
const VOCABULARY = [
    ['日本語', '日本語', 'にほんご', 'Japanese', ['n'], 100, ['not-in-deck'], ['LHHH']],
    ['毎日', '毎日', 'まいにち', 'every day', ['n'], 300, ['not-in-deck'], ['HLLL']],
    ['読む', '読む', 'よむ', 'to read', ['v5m'], 400, ['not-in-deck'], ['HL']],
];
const FIXTURE_HTML = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>accent-underline-mechanism-fixture</title>
<style>body { margin: 0; padding: 48px 24px; font: 22px/1.9 system-ui, sans-serif; }</style>
</head><body><main><p id="prose">毎日日本語を読む。</p></main></body></html>`;

mkdirSync(ARTIFACTS, { recursive: true });
assertBuiltArtifacts([
    SCRIPT_PATH,
    CSS_PATH,
    ...userscriptCompanionPaths(SCRIPT_PATH),
    path.join(STUDY_DIR, 'index.html'),
    path.join(STUDY_DIR, 'app.js'),
    path.join(STUDY_DIR, 'styles.css'),
], ROOT, 'Run npm run build first.');

const server = await startLoopbackServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    response.writeHead(url.pathname === FIXTURE_PATH ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
    response.end(url.pathname === FIXTURE_PATH ? FIXTURE_HTML : 'Not found');
}, 'Could not bind accent quick row smoke server');
const results = [];
try {
    for (const engine of ['chromium', 'webkit']) {
        if (!ENGINES.has(engine)) continue;
        const browser = await launchSmokeBrowser(engine === 'webkit' ? webkit : chromium, engine, { headless: true });
        try {
            for (const config of CONFIGS.filter(candidate => candidate.engine === engine)) {
                const study = await runStudy(browser, config);
                const reader = await runReaderPage(browser, config, study.saved);
                results.push({ config: config.name, study: study.report, reader });
            }
        } finally {
            await browser.close();
        }
    }
    assert(results.length > 0, 'No accent quick row configuration ran', { engines: [...ENGINES] });
    console.log(JSON.stringify({ ok: true, studyDir: path.relative(ROOT, STUDY_DIR) || STUDY_DIR, results }, null, 2));
} finally {
    await closeServer(server.server);
}

function contextOptions(config) {
    return {
        viewport: config.viewport,
        colorScheme: config.colorScheme,
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
    try {
        await context.addInitScript(({ key, language }) => {
            if (location.origin !== 'https://yomureader.com' || sessionStorage.getItem('__yomuAccentSmokeSeeded')) return;
            sessionStorage.setItem('__yomuAccentSmokeSeeded', 'true');
            localStorage.setItem(key, JSON.stringify({ onboardingSeen: true, learningTargetChosen: true, interfaceLanguage: language }));
        }, { key: YOMU_SETTINGS_KEY, language: config.language });
        // Study is served from the build; nothing else leaves the machine.
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin !== 'https://yomureader.com') return route.abort();
            const file = studyAssetPath(url.pathname);
            if (!file) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
            return route.fulfill({ status: 200, contentType: contentTypeFor(file), body: readFileSync(file) });
        });
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        await openAppearance(page, false);

        const row = await quickRowState(page);
        assert(row.firstRowIsQuick, 'Appearance does not lead with the accent and underline row', row);
        assert(row.accentGroup && !row.accentGroupInDetails && row.accentGroupVisible,
            'The accent swatches are not a visible radiogroup outside Tuning', row);
        assert(row.swatches.length === 6 && row.swatches.every(swatch => swatch.name && !swatch.name.includes('未翻訳')),
            'The accent row does not offer six named swatches', row);
        assert(row.custom?.type === 'color' && row.custom.hitTestable && row.custom.name,
            'The custom swatch is not a tappable native colour input', row);
        assert(row.underlineChoices.join() === 'status,pitch,off', 'The Underline choice is not Status / Pitch / Off', row);
        assert(!row.panelText.includes('未翻訳'), 'Appearance shows untranslated copy', { panelText: row.panelText.slice(0, 400) });
        if (config.language === 'ja') {
            assert(row.swatches.find(swatch => swatch.id === 'ai')?.name.startsWith('藍'), 'The 藍 swatch has no Japanese name', row);
        }
        const rowBox = await page.locator('[data-appearance-quick]').boundingBox();
        await page.screenshot({ path: path.join(ARTIFACTS, `accent-quick-row-${config.name}.png`), clip: paddedClip(rowBox, config.viewport) });

        await page.evaluate(() => {
            document.addEventListener('click', event => {
                if (!(event.target instanceof Element) || !event.target.matches('[data-accent-swatch="ai"]')) return;
                requestAnimationFrame(() => {
                    const value = element => element ? getComputedStyle(element).getPropertyValue('--jpdb-reader-accent').trim() : null;
                    window.__yomuAccentFrameProbe = {
                        root: value(document.documentElement),
                        settings: value(document.querySelector('.jpdb-reader-settings')),
                        study: value(document.querySelector('[data-jpdb-reader-root].jpdb-reader-newtab, .jpdb-reader-newtab-shell')),
                    };
                });
            }, { capture: true, once: true });
        });
        await activate(page.locator('[data-accent-swatch="ai"]'), config);
        const frame = await (await page.waitForFunction(() => window.__yomuAccentFrameProbe, undefined, { timeout: 5_000 })).jsonValue();
        assert(Object.values(frame).every(value => value === AI), 'Picking 藍 did not repaint Study within one frame', frame);

        const before = await underlineState(page);
        await activate(page.locator('[data-underline-quick] input[value="pitch"]'), config);
        await page.waitForFunction(() => document.documentElement.classList.contains('jpdb-reader-word-underline-pitch'), undefined, { timeout: 5_000 });
        const after = await underlineState(page);
        assert(!after.tuningOpen, 'Choosing Pitch opened Tuning', after);
        assert(after.channels.word === 'pitch' && after.channels.subtitle === 'pitch', 'Pitch did not set both underline channels', after);
        assert(after.rootClasses.includes('jpdb-reader-subtitle-underline-pitch') && after.subtitlePreviewClass.includes('jpdb-reader-subtitle-underline-pitch'),
            'Pitch did not reach the subtitle underline', after);
        for (const word of after.pageWords) {
            assert(word.underline === word.pitch && word.underline !== 'transparent', 'A page word does not paint its pitch underline', { word, after });
        }
        for (const [index, word] of after.subtitleWords.entries()) {
            assert(word.underline === word.pitchDecoration && word.underline !== before.subtitleWords[index]?.underline,
                'A subtitle word does not paint its pitch underline', { word, before: before.subtitleWords[index] });
        }

        await page.locator('.jpdb-reader-settings button[type="submit"]').click();
        const saved = await (await page.waitForFunction(({ key, accent }) => {
            try {
                const value = JSON.parse(localStorage.getItem(key) ?? '{}');
                return value.accentColor === accent && value.wordUnderlineColorSource === 'pitch' && value.subtitleUnderlineColorSource === 'pitch'
                    ? { accentColor: value.accentColor, wordUnderlineColorSource: value.wordUnderlineColorSource, subtitleUnderlineColorSource: value.subtitleUnderlineColorSource }
                    : null;
            } catch { return null; }
        }, { key: YOMU_SETTINGS_KEY, accent: AI }, { timeout: 10_000 })).jsonValue();

        await openAppearance(page, true);
        const reloaded = await page.evaluate(() => ({
            accent: getComputedStyle(document.documentElement).getPropertyValue('--jpdb-reader-accent').trim(),
            swatch: document.querySelector('input[name="accentSwatch"]:checked')?.getAttribute('data-accent-swatch') ?? null,
            underline: document.querySelector('input[name="underlineQuick"]:checked')?.getAttribute('value') ?? null,
        }));
        assert(reloaded.accent === AI && reloaded.swatch === 'ai' && reloaded.underline === 'pitch',
            '藍 and Pitch did not survive a reload', reloaded);
        assert(pageErrors.length === 0, 'Study threw while choosing an accent', { pageErrors });
        await page.screenshot({ path: path.join(ARTIFACTS, `accent-quick-row-${config.name}-saved.png`), clip: paddedClip(await page.locator('[data-appearance-quick]').boundingBox(), config.viewport) });
        return { saved, report: { swatches: row.swatches.map(swatch => swatch.name), frame, reloaded } };
    } finally {
        await context.close();
    }
}

async function openAppearance(page, reload) {
    // Study drops the #settings hash once the dialog opens, so a reload goes
    // through a fresh document load of the same deep link.
    if (reload) await page.goto('about:blank');
    await page.goto(`${STUDY_URL}#settings=appearance`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.jpdb-reader-settings [data-settings-panel="appearance"]:not([hidden])', { timeout: 20_000 });
}

function quickRowState(page) {
    return page.evaluate(() => {
        const panel = document.querySelector('.jpdb-reader-settings [data-settings-panel="appearance"]');
        const first = Array.from(panel?.children ?? []).find(child => child.tagName !== 'LEGEND');
        const group = panel?.querySelector('[role="radiogroup"][data-accent-swatches]');
        const groupBox = group?.getBoundingClientRect();
        const custom = panel?.querySelector('[data-accent-custom]');
        let hitTestable = false;
        if (custom) {
            custom.scrollIntoView({ block: 'center' });
            const box = custom.getBoundingClientRect();
            hitTestable = box.width >= 24 && box.height >= 24
                && document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === custom
                && !custom.disabled && getComputedStyle(custom).pointerEvents !== 'none';
        }
        const nameOf = element => element.getAttribute('aria-label')
            || (element.getAttribute('aria-labelledby') ?? '').split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ').trim();
        return {
            firstRowIsQuick: Boolean(first?.matches('[data-appearance-quick]')),
            accentGroup: Boolean(group),
            accentGroupName: group ? nameOf(group) : null,
            accentGroupInDetails: Boolean(group?.closest('details')),
            accentGroupVisible: Boolean(groupBox && groupBox.width > 0 && groupBox.height > 0),
            swatches: Array.from(group?.querySelectorAll('input[type="radio"]') ?? [], input => ({
                id: input.getAttribute('data-accent-swatch'), value: input.value, name: nameOf(input),
            })),
            custom: custom ? { type: custom.type, name: nameOf(custom), hitTestable } : null,
            underlineChoices: Array.from(panel?.querySelectorAll('[data-underline-quick] input[type="radio"]') ?? [], input => input.value),
            panelText: `${panel?.textContent ?? ''} ${Array.from(panel?.querySelectorAll('[aria-label]') ?? [], element => element.getAttribute('aria-label')).join(' ')}`,
        };
    });
}

function underlineState(page) {
    return page.evaluate(patterns => {
        const root = getComputedStyle(document.documentElement);
        const pitchOf = word => patterns.find(pattern => word.classList.contains(`jpdb-pitch-${pattern}`));
        const underline = word => getComputedStyle(word).getPropertyValue('--jpdb-reader-word-underline').trim();
        return {
            tuningOpen: Boolean(document.querySelector('[data-settings-tuning="appearance"]')?.open),
            channels: {
                word: document.querySelector('select[name="wordUnderlineColorSource"]')?.value,
                subtitle: document.querySelector('select[name="subtitleUnderlineColorSource"]')?.value,
            },
            rootClasses: document.documentElement.className,
            subtitlePreviewClass: document.querySelector('[data-subtitle-preview]')?.className ?? '',
            // The Appearance preview words that draw an underline at all (the
            // default look leaves known words plain).
            pageWords: Array.from(document.querySelectorAll('[data-yomu-appearance-preview] .jpdb-reader-word'))
                .filter(word => pitchOf(word) && !word.matches('.jpdb-known, .jpdb-never-forget'))
                .map(word => ({ text: word.textContent, underline: underline(word), pitch: root.getPropertyValue(`--jpdb-reader-pitch-${pitchOf(word)}`).trim() })),
            subtitleWords: Array.from(document.querySelectorAll('[data-subtitle-preview] .jpdb-reader-word'))
                .filter(word => pitchOf(word))
                .map(word => ({
                    text: word.textContent,
                    underline: underline(word),
                    pitchDecoration: getComputedStyle(word).getPropertyValue('--jpdb-reader-source-pitch-decoration').trim(),
                })),
        };
    }, PITCH_PATTERNS);
}

async function runReaderPage(browser, config, saved) {
    const context = await browser.newContext({ ...contextOptions(config), bypassCSP: true });
    const requests = [];
    try {
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        await page.exposeFunction('__yomuAccentQuickRowRequest', request => readerRequest(request, requests));
        await addGmStorageBridgeInitScript(page, {
            key: YOMU_SETTINGS_KEY,
            css: readFileSync(CSS_PATH, 'utf8'),
            requestBridgeName: '__yomuAccentQuickRowRequest',
            value: {
                onboardingSeen: true,
                learningTargetChosen: true,
                interfaceLanguage: config.language,
                apiKey: 'mock-jpdb-token',
                audioEnabled: false,
                autoPlayAudio: false,
                immersionKitEnabled: false,
                ankiEnabled: false,
                lookupOnClick: true,
                lookupOnHover: false,
                showFloatingButton: true,
                furiganaMode: 'all',
                // Exactly what Study saved.
                ...saved,
            },
        });
        await addUserscriptGraphInitScripts(page, SCRIPT_PATH);
        await page.goto(`${server.origin}${FIXTURE_PATH}`, { waitUntil: 'domcontentloaded' });
        const wordSelector = '#prose .jpdb-reader-word.jpdb-pitch-heiban, #prose .jpdb-reader-word.jpdb-pitch-atamadaka';
        await page.waitForSelector(wordSelector, { timeout: 20_000 });
        await page.waitForSelector('.jpdb-reader-fab', { state: 'attached', timeout: 10_000 });
        const state = await page.evaluate(({ selector, patterns }) => {
            const accent = element => element ? getComputedStyle(element).getPropertyValue('--jpdb-reader-accent').trim() : null;
            const root = getComputedStyle(document.documentElement);
            const words = Array.from(document.querySelectorAll(selector)).map(word => {
                const pattern = patterns.find(candidate => word.classList.contains(`jpdb-pitch-${candidate}`));
                const style = getComputedStyle(word);
                return {
                    text: word.textContent,
                    underline: style.getPropertyValue('--jpdb-reader-word-underline').trim(),
                    pitch: root.getPropertyValue(`--jpdb-reader-pitch-${pattern}`).trim(),
                };
            });
            return {
                root: accent(document.documentElement),
                puck: accent(document.querySelector('.jpdb-reader-fab')),
                classes: document.documentElement.className,
                words,
            };
        }, { selector: wordSelector, patterns: PITCH_PATTERNS });
        assert(state.root === AI && state.puck === AI, 'The saved accent did not reach the reader page and puck', state);
        assert(state.classes.includes('jpdb-reader-word-underline-pitch') && state.classes.includes('jpdb-reader-subtitle-underline-pitch'),
            'The saved underline choice did not reach the page and subtitle channels', state);
        // A page underline keeps its pitch hue but may be deepened for the
        // page's own background (dom/word-contrast.ts).
        assert(state.words.length > 0 && state.words.every(word => word.pitch && /^#[0-9a-f]{6}$/u.test(word.underline)
            && hueDistance(word.underline, word.pitch) <= 15),
        'Reader words do not paint pitch underlines', state);
        await activate(page.locator(wordSelector).first(), config);
        const popup = page.locator('.jpdb-reader-popover').last();
        await popup.waitFor({ state: 'visible', timeout: 10_000 });
        const popupAccent = await popup.evaluate(element => getComputedStyle(element).getPropertyValue('--jpdb-reader-accent').trim());
        assert(popupAccent === AI, 'The popup does not use the saved accent', { popupAccent });
        assert(pageErrors.length === 0, 'The reader threw on the fixture page', { pageErrors });
        await page.screenshot({ path: path.join(ARTIFACTS, `accent-quick-row-${config.name}-reader.png`) });
        return { ...state, popup: popupAccent, parseRequests: requests.length };
    } finally {
        await context.close();
    }
}

function readerRequest(request, requests) {
    const url = new URL(request.url);
    if (url.origin === 'https://jpdb.io' && url.pathname === '/api/v1/parse') {
        requests.push(url.pathname);
        return jsonHttpResponse(mockJpdbParseFromVocabulary(readJsonBody(request.data), VOCABULARY));
    }
    if (url.origin === 'https://jpdb.io' && url.pathname.startsWith('/api/v1/')) return jsonHttpResponse({});
    return { status: 404, responseText: '' };
}

function hueDistance(a, b) {
    const distance = Math.abs(hue(a) - hue(b)) % 360;
    return Math.min(distance, 360 - distance);
}

function hue(color) {
    const [r, g, b] = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const delta = max - Math.min(r, g, b);
    if (!delta) return 0;
    const sector = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    return (sector * 60 + 360) % 360;
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

function paddedClip(box, viewport, padding = 16) {
    const x = Math.max(0, Math.floor(box.x - padding));
    const y = Math.max(0, Math.floor(box.y - padding));
    return {
        x,
        y,
        width: Math.min(viewport.width - x, Math.ceil(box.width + padding * 2)),
        height: Math.min(viewport.height - y, Math.ceil(box.height + padding * 2)),
    };
}
