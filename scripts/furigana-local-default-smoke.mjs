#!/usr/bin/env node
// Regression smoke: a default install that finished the onboarding offline
// setup (parserProvider 'local' + imported term/pitch dictionaries) must still
// decorate page text automatically — furigana on difficult kanji (including
// deinflected verbs) and pitch-accent classes at rest, with no API keys.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    createSmokePaths,
    launchSmokeBrowser,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from './lib/smoke-test-helpers.mjs';

const { root: ROOT, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH } = createSmokePaths(import.meta.dirname);
const SETTINGS_COMPANION_PATH = path.join(ROOT, 'dist', 'greasyfork', 'yomu-settings-surface.user.js');
const PAGE_PATH = '/furigana-local-default.html';
const SENTENCE = '図書館で漢字を調べています。練習をします。';
const NOUNS = ['図書館', '漢字', '練習'];

const settings = {
    // Everything else stays at DEFAULT_SETTINGS: parserProvider 'local',
    // localDictionariesEnabled true, furiganaMode 'difficult-kanji',
    // showPitchAccent true — the real post-onboarding keyless profile.
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    jitenApiKey: '',
    audioEnabled: false,
    autoPlayAudio: false,
    immersionKitEnabled: false,
    showFloatingButton: false,
    enableLogging: Boolean(process.env.SMOKE_DEBUG),
};

mkdirSync(ARTIFACTS, { recursive: true });
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH], ROOT, 'Run npm run build first.');

const server = await startLoopbackServer((request, response) => {
    if (new URL(request.url ?? '/', 'http://127.0.0.1').pathname !== PAGE_PATH) {
        response.writeHead(404, { 'content-type': 'text/plain' });
        return response.end('Not found');
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>furigana local default smoke</title></head>
<body><main><p data-smoke-sentence>${SENTENCE}</p></main></body></html>`);
}, 'Could not bind furigana local default smoke server');
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });

try {
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1024, height: 768 } });
    const page = await context.newPage();
    if (process.env.SMOKE_DEBUG) {
        page.on('console', message => console.error('[console]', message.type(), message.text().slice(0, 300)));
        page.on('pageerror', error => console.error('[pageerror]', error.message.slice(0, 300)));
    }
    const externalRequests = [];
    await page.exposeFunction('__yomuFuriganaLocalSmokeRequest', request => {
        externalRequests.push(request.url);
        return { status: 503, responseText: '' };
    });
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: settings,
        requestBridgeName: '__yomuFuriganaLocalSmokeRequest',
    });

    const inject = async () => {
        await installUserscriptCssResource(page, CSS_PATH);
        await addScriptTagWithCspFallback(page, SETTINGS_COMPANION_PATH);
        await addScriptTagWithCspFallback(page, SCRIPT_PATH);
        await page.waitForFunction(() => Boolean(window.__yomuReaderAppInitialized || document.getElementById('jpdb-reader-runtime-owner')), null, { timeout: 8000 });
    };

    await page.goto(`${server.origin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
    await inject();

    // Import the mini offline dictionaries the way onboarding/settings does.
    // Re-dispatch until the panel exists: the settings-surface companion
    // registers its listener asynchronously after the runtime owner appears,
    // so a single dispatch can be lost on slow CI runners.
    await page.waitForFunction(() => {
        if (document.querySelector('.jpdb-reader-settings')) return true;
        window.dispatchEvent(new CustomEvent('yomu-open-settings', { detail: { panel: 'backup' } }));
        return false;
    }, null, { timeout: 30_000, polling: 500 });
    const importButton = page.locator('[data-action="import-yomitan-dictionary"]');
    await importButton.scrollIntoViewIfNeeded();
    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 10_000 });
    await importButton.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
        name: 'mini-jitendex.zip',
        mimeType: 'application/zip',
        buffer: miniDictionaryZip(),
    });
    await page.waitForFunction(() => {
        const statusText = [...document.querySelectorAll('.jpdb-reader-settings [data-import-status], .jpdb-reader-settings [data-dictionary-status], .jpdb-reader-settings [role="status"]')]
            .map(element => element.textContent ?? '')
            .join(' ');
        return /Imported [\d,]+|インポートしました/.test(statusText);
    }, null, { timeout: 30_000 });

    // Fresh page load: the parser must confirm the local store and decorate
    // automatically, offline, without any manual scan.
    await page.goto(`${server.origin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
    await inject();
    await page.waitForFunction(() => document.querySelectorAll('[data-smoke-sentence] .jpdb-reader-word').length >= 4, null, { timeout: 20_000 });

    const wordState = async () => page.evaluate(nouns => {
        const words = [...document.querySelectorAll('[data-smoke-sentence] .jpdb-reader-word')].map(word => {
            const ruby = word.querySelector('ruby rt');
            const rubyVisible = ruby instanceof HTMLElement
                && getComputedStyle(ruby).display !== 'none'
                && getComputedStyle(ruby).visibility !== 'hidden'
                && (ruby.textContent ?? '').trim().length > 0
                && ruby.getBoundingClientRect().height > 0;
            return {
                surface: word.getAttribute('data-surface') ?? word.textContent ?? '',
                expression: word.getAttribute('data-expression') ?? '',
                source: word.getAttribute('data-card-source') ?? '',
                hasFuri: word.classList.contains('jpdb-reader-has-furi'),
                rubyVisible,
                pitchClass: word.getAttribute('data-pitch-class') ?? '',
                pitchAccent: word.getAttribute('data-pitch-accent') ?? '',
            };
        });
        const bySurface = surface => words.find(word => word.expression === surface || word.surface.startsWith(surface));
        return { words, nouns: nouns.map(noun => ({ noun, word: bySurface(noun) })), verb: words.find(word => word.expression === '調べる' || word.surface.startsWith('調')) };
    }, NOUNS);

    let state = await wordState();
    assert(state.words.length >= 4, 'Local-first parse did not annotate the fixture sentence', state);

    // Furigana must be present at rest immediately after the scan applies.
    for (const { noun, word } of state.nouns) {
        assert(word, `No reader word rendered for ${noun}`, state);
        assert(word.source === 'local', `${noun} was not parsed by the local dictionary`, word);
        assert(word.hasFuri && word.rubyVisible, `${noun} lost its at-rest furigana in local-first parsing`, word);
    }
    assert(state.verb, 'No reader word rendered for the inflected verb 調べて', state);
    assert(state.verb.hasFuri && state.verb.rubyVisible, 'Deinflected verb 調べて lost its furigana in local-first parsing', state.verb);

    // Pitch accent must resolve from the imported pitch bank shortly after
    // apply (local IndexedDB enrichment — no network involved).
    await page.waitForFunction(() => {
        const word = [...document.querySelectorAll('[data-smoke-sentence] .jpdb-reader-word')]
            .find(candidate => candidate.getAttribute('data-expression') === '図書館');
        if (!word) return false;
        const pitchClass = word.getAttribute('data-pitch-class') ?? '';
        return pitchClass !== '' && pitchClass !== 'unknown';
    }, null, { timeout: 15_000 });
    state = await wordState();

    const screenshotPath = path.join(ARTIFACTS, 'furigana-local-default-smoke.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    const report = {
        ok: true,
        sentence: SENTENCE,
        words: state.words,
        externalRequests,
        screenshot: screenshotPath,
    };
    writeFileSync(path.join(ARTIFACTS, 'furigana-local-default-smoke.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log('furigana-local-default smoke passed');
    await context.close();
} finally {
    await closeSmokeBrowserAndServer(browser, server.server);
}

// Minimal Yomitan-format ZIP (stored entries) with a term bank and a
// Kanjium-style pitch bank covering the fixture words.
function miniDictionaryZip() {
    return zipBuffer({
        'index.json': { title: 'Mini Jitendex', format: 3, revision: 'smoke-1' },
        'term_bank_1.json': [
            ['図書館', 'としょかん', '', '', 10, ['library'], 1, ''],
            ['漢字', 'かんじ', '', '', 10, ['kanji'], 2, ''],
            ['調べる', 'しらべる', '', 'v1', 10, ['to look up'], 3, ''],
            ['練習', 'れんしゅう', '', 'vs', 10, ['practice'], 4, ''],
        ],
        'term_meta_bank_1.json': [
            ['図書館', 'pitch', { reading: 'としょかん', pitches: [{ position: 2 }] }],
            ['漢字', 'pitch', { reading: 'かんじ', pitches: [{ position: 0 }] }],
            ['調べる', 'pitch', { reading: 'しらべる', pitches: [{ position: 3 }] }],
            ['練習', 'pitch', { reading: 'れんしゅう', pitches: [{ position: 0 }] }],
        ],
    });
}

function zipBuffer(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    for (const [name, value] of Object.entries(files)) {
        const nameBytes = Buffer.from(encoder.encode(name));
        const data = Buffer.from(encoder.encode(typeof value === 'string' ? value : JSON.stringify(value)));
        const crc = crc32(data);
        const local = Buffer.alloc(30 + nameBytes.length);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(0, 8); // stored
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBytes.length, 26);
        nameBytes.copy(local, 30);
        localParts.push(local, data);
        const central = Buffer.alloc(46 + nameBytes.length);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(0, 10);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(data.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(nameBytes.length, 28);
        central.writeUInt32LE(offset, 42);
        nameBytes.copy(central, 46);
        centralParts.push(central);
        offset += local.length + data.length;
    }
    const centralSize = centralParts.reduce((size, part) => size + part.length, 0);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(Object.keys(files).length, 8);
    end.writeUInt16LE(Object.keys(files).length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...localParts, ...centralParts, end]);
}

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}
