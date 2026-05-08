#!/usr/bin/env node
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ARTIFACTS = path.join(ROOT, 'qa-artifacts');
const SETTINGS_KEY = 'jpdb-popup-reader-settings';
const SCRIPT_PATH = path.join(DIST, 'yomu.user.js');
const API_KEY = process.env.YOMU_TEST_API_KEY?.trim() ?? '';

const baseSettings = {
    onboardingSeen: true,
    apiKey: API_KEY,
    accentColor: '#5ea780',
    audioEnabled: false,
    autoPlayAudio: false,
    audioSources: [],
    audioEnableDefaultSources: false,
    audioViaBlob: true,
    audioTimeoutMs: 6000,
    audioSelectionMode: 'random',
    parseSelection: true,
    popupActivationMode: 'modifier',
    scanModifierKey: 'shift',
    autoScanJapanese: true,
    scanVisiblePage: true,
    showFloatingButton: false,
    showFurigana: true,
    showPitchAccent: true,
    hideKnownFurigana: false,
    ocrEnabled: false,
    ocrAutoScanImages: true,
    ocrShowTextOverlay: false,
    ocrProvider: 'google-lens',
    ocrEndpointUrl: '',
    ocrEngine: 'auto',
    ocrCloudVisionApiKey: '',
    ocrLanguage: 'ja-JP',
    ocrMaxImagePixels: 1200000,
    ocrMinImageArea: 12000,
    ocrMaxImagesPerPage: 3,
    ocrPrefetchMargin: 700,
    localDictionariesEnabled: false,
    localDictionaryMaxResults: 12,
    localDictionaryShowKanji: true,
    dictionaryPreferences: [],
    subtitlePlayerEnabled: true,
    subtitleAutoDetect: true,
    subtitleOverlayVisible: true,
    subtitleSecondaryVisible: true,
    subtitleFontSize: 28,
    subtitleBottomOffset: 12,
    subtitleMiningPause: true,
    subtitleSeekPadding: 0.08,
    youtubeImmersionEnabled: false,
    youtubeShowFilterNotice: true,
    theme: 'auto',
    popupMode: 'auto',
    miningDeck: 'forq',
    neverForgetDeck: 'never-forget',
    blacklistDeck: 'blacklist',
    addToForq: false,
    enableReviews: true,
    twoButtonReviews: false,
    shortcuts: {
        scanPage: 'Alt+J',
        openSettings: 'Alt+Shift+J',
        playAudio: 'A',
        closePopup: 'Escape',
        previousSubtitle: 'Alt+ArrowLeft',
        nextSubtitle: 'Alt+ArrowRight',
        copySubtitle: 'Alt+C',
        toggleOcr: 'Alt+O',
        scanImages: 'Alt+I',
        gradeNothing: '1',
        gradeSomething: '2',
        gradeHard: '3',
        gradeOkay: '4',
        gradeEasy: '5',
        gradeFail: '1',
        gradePass: '2',
    },
};

const results = [];
let userscript = '';

function record(name, status, detail = '') {
    results.push({ name, status, detail });
    const marker = status === 'pass' ? 'PASS' : status === 'skip' ? 'SKIP' : 'FAIL';
    console.log(`${marker} ${name}${detail ? ` - ${detail}` : ''}`);
}

function assertAudit(condition, message) {
    if (!condition) throw new Error(message);
}

async function waitForAudit(page, predicate, timeoutMs, message) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const value = await page.evaluate(predicate).catch(() => false);
        if (value) return value;
        await page.waitForTimeout(200);
    }
    throw new Error(message);
}

function dataUrl(html) {
    return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

async function startStaticServer(root) {
    const server = createServer(async (req, res) => {
        try {
            const url = new URL(req.url ?? '/', 'http://127.0.0.1');
            const requested = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
            const filePath = path.join(root, requested === '/' ? 'reader-test.html' : requested);
            const body = await readFile(filePath);
            res.statusCode = 200;
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', contentType(filePath));
            res.end(body);
        } catch {
            res.statusCode = 404;
            res.end('Not found');
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    return {
        origin: `http://127.0.0.1:${address.port}`,
        close: () => new Promise(resolve => server.close(resolve)),
    };
}

function contentType(filePath) {
    if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
    if (filePath.endsWith('.vtt')) return 'text/vtt; charset=utf-8';
    if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
    if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
    return 'application/octet-stream';
}

async function newAuditedPage(browser, settings = baseSettings) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    const requests = [];
    await page.exposeFunction('__yomuQaRequest', async request => {
        const response = await fetch(request.url, {
            method: request.method,
            headers: request.headers,
            body: request.data,
        });
        const buffer = Buffer.from(await response.arrayBuffer());
        requests.push({
            method: request.method,
            url: request.url.replace(API_KEY, '[redacted]'),
            status: response.status,
        });
        return {
            status: response.status,
            responseText: buffer.toString('utf8'),
            bytes: [...buffer],
            contentType: response.headers.get('content-type') ?? '',
        };
    });
    await page.addInitScript(({ settings, settingsKey }) => {
        const store = { [settingsKey]: settings };
        window.GM_getValue = (key, fallback) => key in store ? store[key] : fallback;
        window.GM_setValue = (key, value) => { store[key] = value; };
        window.GM_addStyle = css => {
            const style = document.createElement('style');
            style.textContent = css;
            document.head.append(style);
            return style;
        };
        window.GM_registerMenuCommand = () => undefined;
        window.GM_xmlhttpRequest = options => {
            window.__yomuQaRequest({
                method: options.method || 'GET',
                url: options.url,
                headers: options.headers || {},
                data: options.data,
            }).then(result => {
                const bytes = new Uint8Array(result.bytes);
                const response = options.responseType === 'arraybuffer'
                    ? bytes.buffer
                    : options.responseType === 'blob'
                        ? new Blob([bytes], { type: result.contentType })
                        : result.responseText;
                options.onload?.({
                    status: result.status,
                    response,
                    responseText: result.responseText,
                });
            }).catch(error => options.onerror?.(error));
        };
    }, { settings, settingsKey: SETTINGS_KEY });
    return { page, requests };
}

async function injectUserscript(page) {
    await page.addScriptTag({ content: userscript });
}

async function auditNoSecretLeak() {
    if (!API_KEY) {
        record('secret leak scan', 'skip', 'YOMU_TEST_API_KEY is not set');
        return;
    }
    const files = await listFiles(ROOT, new Set(['.git', 'node_modules', 'qa-artifacts']));
    const offenders = [];
    for (const file of files) {
        if (!/\.(?:ts|js|mjs|cjs|json|md|html|yml|yaml|css|user\.js)$/.test(file)) continue;
        const text = await readFile(file, 'utf8').catch(() => '');
        if (text.includes(API_KEY)) offenders.push(path.relative(ROOT, file));
    }
    assertAudit(!offenders.length, `test API key is present in source files: ${offenders.join(', ')}`);
    record('secret leak scan', 'pass', 'test key is only supplied by environment');
}

async function listFiles(dir, ignoredNames) {
    const entries = await readdir(dir);
    const files = [];
    for (const entry of entries) {
        if (ignoredNames.has(entry)) continue;
        const full = path.join(dir, entry);
        const info = await stat(full);
        if (info.isDirectory()) files.push(...await listFiles(full, ignoredNames));
        else files.push(full);
    }
    return files;
}

async function auditSettings(browser, server) {
    const { page } = await newAuditedPage(browser, { ...baseSettings, apiKey: '', showFloatingButton: true, ocrEnabled: true });
    await page.goto(`${server.origin}/reader-test.html`, { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    await page.waitForSelector('.jpdb-reader-settings', { timeout: 6000 });

    const snapshot = await page.evaluate(() => {
        const form = document.querySelector('.jpdb-reader-settings');
        const save = form?.querySelector('button[type="submit"]');
        const cancel = form?.querySelector('[data-action="cancel"]');
        const rect = form?.getBoundingClientRect();
        const saveRect = save?.getBoundingClientRect();
        const passFailRows = [...document.querySelectorAll('[data-review-scale="pass-fail"]')].filter(el => !el.hidden).length;
        const fiveRows = [...document.querySelectorAll('[data-review-scale="five"]')].filter(el => !el.hidden).length;
        return {
            title: form?.getAttribute('aria-label'),
            saveText: save?.textContent?.trim(),
            cancelText: cancel?.textContent?.trim(),
            formBottom: rect?.bottom ?? 0,
            saveBottom: saveRect?.bottom ?? 0,
            viewportHeight: innerHeight,
            passFailRows,
            fiveRows,
            localOcrHidden: [...document.querySelectorAll('[data-local-ocr]')].every(el => el.hidden),
            cloudOcrHidden: [...document.querySelectorAll('[data-cloud-ocr]')].every(el => el.hidden),
        };
    });
    assertAudit(snapshot.title === 'よむ Settings', 'settings dialog title is wrong');
    assertAudit(snapshot.saveText === 'Save' && snapshot.cancelText === 'Cancel', 'settings actions are missing');
    assertAudit(snapshot.saveBottom <= snapshot.viewportHeight, 'settings Save button is below the visible viewport');
    assertAudit(snapshot.fiveRows > 0 && snapshot.passFailRows === 0, 'five-grade and pass/fail shortcut settings are both visible');
    assertAudit(snapshot.localOcrHidden && snapshot.cloudOcrHidden, 'irrelevant OCR provider fields are visible by default');
    await page.screenshot({ path: path.join(ARTIFACTS, 'settings.png'), fullPage: false });
    await page.close();
    record('settings dialog', 'pass', 'actions visible, irrelevant provider fields hidden');
}

async function auditBloomeeAutoScan(browser) {
    assertAudit(API_KEY, 'YOMU_TEST_API_KEY is required for JPDB scan audit');
    const { page, requests } = await newAuditedPage(browser, { ...baseSettings, showFloatingButton: false, ocrEnabled: false });
    await page.goto('https://bloomeelife.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await injectUserscript(page);
    await page.waitForTimeout(3500);
    await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            if ((node.textContent || '').includes('食卓やリビング')) {
                node.parentElement?.scrollIntoView({ block: 'center' });
                break;
            }
        }
    });
    await waitForAudit(page, () => {
        const paragraph = [...document.querySelectorAll('p.point__itembox-txt')]
            .find(el => el.textContent?.includes('リビング'));
        return (paragraph?.querySelectorAll('.jpdb-reader-word').length ?? 0) >= 3;
    }, 12000, 'Bloomee visible paragraph was not wrapped after automatic scroll scan');

    const snapshot = await page.evaluate(() => {
        const paragraph = [...document.querySelectorAll('p.point__itembox-txt')]
            .find(el => el.textContent?.includes('リビング'));
        return {
            wrappedWords: paragraph?.querySelectorAll('.jpdb-reader-word').length ?? 0,
            furigana: paragraph?.querySelectorAll('.jpdb-reader-furi').length ?? 0,
            visibleWrappedWords: [...(paragraph?.querySelectorAll('.jpdb-reader-word') ?? [])].filter(el => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= innerHeight;
            }).length,
        };
    });
    assertAudit(snapshot.wrappedWords >= 3, 'Bloomee paragraph has too few wrapped words');
    assertAudit(snapshot.furigana >= 1, 'Bloomee wrapped paragraph has no furigana');
    assertAudit(requests.some(request => request.url.includes('jpdb.io/api/v1/parse') && request.status === 200), 'JPDB parse request did not complete');
    await page.screenshot({ path: path.join(ARTIFACTS, 'bloomee-auto-scan.png'), fullPage: false });
    await page.close();
    record('Bloomee auto page scan', 'pass', `${snapshot.wrappedWords} wrapped words, ${snapshot.furigana} furigana nodes`);
}

async function auditHoverLookup(browser) {
    assertAudit(API_KEY, 'YOMU_TEST_API_KEY is required for hover lookup audit');
    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
        body{font:24px/1.8 system-ui;margin:40px;color:#171a1f}
    </style></head><body><p>今日は静かな喫茶店で新しい本を読みました。</p></body></html>`;
    const { page } = await newAuditedPage(browser, { ...baseSettings, popupActivationMode: 'modifier', scanModifierKey: 'shift' });
    await page.goto(dataUrl(html));
    await injectUserscript(page);
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-reader-word').length > 0, 10000, 'fixture text was not scanned');
    const firstWord = await page.locator('.jpdb-reader-word').first().boundingBox();
    assertAudit(firstWord, 'no scanned word bounding box found');
    await page.keyboard.down('Shift');
    await page.mouse.move(firstWord.x + firstWord.width / 2, firstWord.y + firstWord.height / 2);
    await page.waitForTimeout(700);
    await page.keyboard.up('Shift');
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 6000 });
    const text = await page.locator('.jpdb-reader-popover').innerText();
    assertAudit(/JPDB|Add|Never|Blacklist/.test(text), 'hover popup did not render mining actions');
    await page.screenshot({ path: path.join(ARTIFACTS, 'hover-lookup.png'), fullPage: false });
    await page.close();
    record('hold-key hover lookup', 'pass', 'Shift hover opens the mining popup');
}

async function auditOcrFixture(browser) {
    assertAudit(API_KEY, 'YOMU_TEST_API_KEY is required for OCR lookup audit');
    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
        body{margin:0;padding:32px;background:#15191f;color:white;font-family:system-ui}
        img{display:block;width:520px;height:360px;object-fit:cover;border:1px solid #333}
    </style></head><body>
        <img alt="今日は学校へ行きます。" data-ocr-lines='[
            {"text":"今日は学校へ行きます。","box":{"left":0.08,"top":0.12,"width":0.76,"height":0.18},"vertical":false},
            {"text":"友だちと本を読む。","box":{"left":0.14,"top":0.58,"width":0.68,"height":0.18},"vertical":false}
        ]' src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='520' height='360'><rect width='520' height='360' fill='%23f4f0e7'/><text x='40' y='90' font-size='42'>今日は学校へ行きます。</text><text x='72' y='245' font-size='42'>友だちと本を読む。</text></svg>">
    </body></html>`;
    const { page } = await newAuditedPage(browser, { ...baseSettings, ocrEnabled: true, ocrAutoScanImages: true, ocrShowTextOverlay: false });
    await page.goto(dataUrl(html));
    await injectUserscript(page);
    await waitForAudit(page, () => document.querySelectorAll('.jpdb-ocr-line').length >= 2, 10000, 'OCR fixture lines were not created');
    const overlay = await page.evaluate(() => {
        const image = document.querySelector('img');
        const line = document.querySelector('.jpdb-ocr-line');
        const imageRect = image?.getBoundingClientRect();
        const lineRect = line?.getBoundingClientRect();
        return {
            lineCount: document.querySelectorAll('.jpdb-ocr-line').length,
            visibleTextOverlays: document.querySelectorAll('.jpdb-ocr-line-visible').length,
            imageRect,
            lineRect,
            lineTitle: line?.getAttribute('title'),
        };
    });
    assertAudit(overlay.lineCount >= 2, 'OCR line count is wrong');
    assertAudit(overlay.visibleTextOverlays === 0, 'OCR text is visibly painted by default');
    assertAudit(overlay.lineTitle?.includes('学校'), 'OCR line text is missing');
    await page.locator('.jpdb-ocr-line').first().click();
    await page.waitForSelector('.jpdb-reader-popover', { timeout: 6000 });
    await page.screenshot({ path: path.join(ARTIFACTS, 'ocr-fixture.png'), fullPage: false });
    await page.close();
    record('OCR fixture', 'pass', 'transparent regions appear and open lookup on click');
}

async function auditVideoFixture(browser, server) {
    assertAudit(API_KEY, 'YOMU_TEST_API_KEY is required for subtitle audit');
    const { page } = await newAuditedPage(browser, { ...baseSettings, subtitlePlayerEnabled: true, subtitleAutoDetect: true, showFloatingButton: false });
    await page.goto(`${server.origin}/reader-video-test.html`, { waitUntil: 'domcontentloaded' });
    await injectUserscript(page);
    await page.waitForSelector('.jpdb-subtitle-player', { timeout: 6000 });
    const snapshot = await page.evaluate(() => {
        const root = document.querySelector('.jpdb-subtitle-player');
        const rect = root?.getBoundingClientRect();
        const buttons = [...document.querySelectorAll('.jpdb-subtitle-rail button')].map(button => button.textContent?.trim());
        return {
            hidden: root?.hidden,
            rect: rect ? { width: rect.width, height: rect.height, bottom: rect.bottom } : null,
            buttons,
            menuHidden: document.querySelector('.jpdb-subtitle-menu')?.hasAttribute('hidden'),
        };
    });
    assertAudit(snapshot.hidden === false, 'subtitle player is hidden on a page with video');
    assertAudit((snapshot.rect?.width ?? 0) > 200, 'subtitle player is not laid out');
    assertAudit(snapshot.buttons.includes('Lines') && snapshot.buttons.includes('...'), 'subtitle controls are missing');
    await page.screenshot({ path: path.join(ARTIFACTS, 'video-fixture.png'), fullPage: false });
    await page.close();
    record('subtitle player fixture', 'pass', 'controls render without covering the whole video');
}

async function runAudit(name, fn) {
    try {
        await fn();
    } catch (error) {
        record(name, 'fail', error instanceof Error ? error.message : String(error));
    }
}

async function main() {
    await mkdir(ARTIFACTS, { recursive: true });
    userscript = await readFile(SCRIPT_PATH, 'utf8');
    if (!API_KEY) {
        console.error('YOMU_TEST_API_KEY is required for the full QA audit.');
        process.exitCode = 1;
        return;
    }

    const server = await startStaticServer(DIST);
    const browser = await chromium.launch({ headless: true });
    try {
        await runAudit('secret leak scan', auditNoSecretLeak);
        await runAudit('settings dialog', () => auditSettings(browser, server));
        await runAudit('Bloomee auto page scan', () => auditBloomeeAutoScan(browser));
        await runAudit('hold-key hover lookup', () => auditHoverLookup(browser));
        await runAudit('OCR fixture', () => auditOcrFixture(browser));
        await runAudit('subtitle player fixture', () => auditVideoFixture(browser, server));
    } finally {
        await browser.close();
        await server.close();
    }

    const failed = results.filter(result => result.status === 'fail');
    console.log(`\nQA artifacts: ${ARTIFACTS}`);
    console.log(`QA summary: ${results.length - failed.length}/${results.length} passed`);
    if (failed.length) process.exitCode = 1;
}

await main();
