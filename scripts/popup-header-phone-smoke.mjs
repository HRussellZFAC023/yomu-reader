#!/usr/bin/env node
// The word popup's header on a 390px phone, from the built userscript with its
// default lookup links. Copy is an icon beside audio on a 44px target, and the
// lookup pills fit one line: the less-used destinations wait behind "More"
// (word-pills.ts). Copy once wrapped onto a second row by itself.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    createSmokePaths,
    jsonHttpResponse,
    mockJpdbParseFromVocabulary,
    readJsonBody,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, userscriptCompanionPaths } from './lib/smoke-test-helpers.mjs';

const { root: ROOT, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH } = createSmokePaths(import.meta.dirname);
const PAGE_PATH = '/popup-header-phone.html';
const LOOKUP_WORD = '日本語';
const VOCABULARY = [
    [LOOKUP_WORD, LOOKUP_WORD, 'にほんご', 'Japanese (language)', ['n'], 400, ['not-in-deck'], ['LHHH']],
];

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: 'mock-jpdb-key',
    jitenApiKey: '',
    showFurigana: true,
    furiganaMode: 'all',
    showPitchAccent: true,
    jpdbMiningEnabled: false,
    jpdbDefinitionsEnabled: false,
    jitenDefinitionsEnabled: false,
    localDictionariesEnabled: false,
    ankiEnabled: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    lookupOnHover: false,
    lookupOnClick: true,
    popupActivationMode: 'click',
    showFloatingButton: false,
    enableLogging: false,
    // The keyless default row (a JPDB key alone turns Copy off by default).
    dictionaryLookupLinks: [
        { id: 'yomu-search', label: 'Yomu', urlTemplate: 'https://yomureader.com/study/index.html?q={query}', enabled: true },
        { id: 'jiten', label: 'Jiten', urlTemplate: 'https://jiten.moe/parse?text={query}', enabled: true },
        { id: 'jpdb', label: 'JPDB', urlTemplate: 'https://jpdb.io/search?q={query}', enabled: true },
        { id: 'bunpro', label: 'Bunpro', urlTemplate: 'https://bunpro.jp/search?query={query}', enabled: true },
        { id: 'copy', label: 'Copy', urlTemplate: '', enabled: true, action: 'copy' },
    ],
};

mkdirSync(ARTIFACTS, { recursive: true });
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH], ROOT, 'Run npm run build first.');
assertBuiltArtifacts(userscriptCompanionPaths(SCRIPT_PATH), ROOT, 'Run npm run build first.');

const server = await startLoopbackServer((request, response) => {
    if (new URL(request.url ?? '/', 'http://127.0.0.1').pathname !== PAGE_PATH) {
        response.writeHead(404, { 'content-type': 'text/plain' });
        response.end('Not found');
        return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>popup header phone</title></head>
<body><main><p data-smoke-sentence style="font: 18px/1.8 system-ui; margin: 24px 16px;">日本語は東アジアの言語です。</p></main></body></html>`);
}, 'Could not bind popup header phone smoke server');

// A finger, not a mouse: the coarse-pointer rules give touch targets 44px.
const browser = await chromium.launch({
    channel: 'chromium',
    headless: true,
    args: ['--blink-settings=primaryPointerType=2,availablePointerTypes=2,primaryHoverType=1,availableHoverTypes=1'],
});

try {
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.exposeFunction('__yomuPopupHeaderPhoneRequest', request => handleYomuRequest(request));
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: settings,
        css: readFileSync(CSS_PATH, 'utf8'),
        requestBridgeName: '__yomuPopupHeaderPhoneRequest',
    });
    await page.goto(`${server.origin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ path: CSS_PATH });
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);
    const word = page.locator(`[data-smoke-sentence] .jpdb-reader-word[data-expression="${LOOKUP_WORD}"]`).first();
    await word.waitFor({ timeout: 15_000 });
    await word.tap();
    const header = await (await page.waitForFunction(() => {
        const popover = document.querySelector('.jpdb-reader-popover');
        const row = popover?.querySelector('.jpdb-reader-header .jpdb-reader-word-pills');
        const audio = popover?.querySelector('.jpdb-reader-header .jpdb-reader-audio-control');
        if (!(row instanceof HTMLElement) || !(audio instanceof HTMLElement) || !row.children.length) return null;
        const box = element => {
            const rect = element.getBoundingClientRect();
            return { top: Math.round(rect.top), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width), height: Math.round(rect.height) };
        };
        const pills = [...row.children].map(child => ({ text: child.textContent?.replace(/\s+/g, ' ').trim() ?? '', className: child.className, ...box(child) }));
        const copy = popover.querySelector('.jpdb-reader-header [data-action="copy-word"]');
        return {
            viewportWidth: innerWidth,
            popover: box(popover),
            pills,
            moreLinks: [...row.querySelectorAll('.jpdb-reader-pill-more > a')].map(link => link.textContent?.trim() ?? ''),
            audio: box(audio),
            copy: copy instanceof HTMLElement ? { ...box(copy), besideAudio: copy.parentElement === audio.parentElement, inPills: Boolean(copy.closest('.jpdb-reader-word-pills')), label: copy.getAttribute('aria-label') ?? '' } : null,
        };
    }, null, { timeout: 15_000 })).jsonValue();

    const tops = new Set(header.pills.map(pill => pill.top));
    assert(tops.size === 1, 'The lookup pills wrap onto more than one line at 390px', header);
    assert(header.pills.every(pill => pill.right <= header.popover.right), 'A lookup pill runs past the popup edge at 390px', header);
    assert(header.copy && header.copy.besideAudio && !header.copy.inPills, 'Copy is not an icon beside the audio button', header);
    assert(Math.abs(header.copy.top - header.audio.top) <= 4, 'Copy does not sit on the audio button row', header);
    assert(header.copy.width >= 44 && header.copy.height >= 44, 'Copy is smaller than a 44px touch target', header);
    assert(/^Copy word: /u.test(header.copy.label), 'Copy has no accessible name', header);
    assert(header.moreLinks.includes('Yomu') && header.moreLinks.includes('Bunpro'), 'Yomu search and Bunpro do not wait behind More', header);

    const screenshot = path.join(ARTIFACTS, 'popup-header-phone.png');
    await page.screenshot({ path: screenshot, fullPage: false });
    const report = { ok: true, header, screenshot };
    writeFileSync(path.join(ARTIFACTS, 'popup-header-phone-smoke.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await context.close();
} finally {
    await closeSmokeBrowserAndServer(browser, server.server);
}

function handleYomuRequest(request) {
    const url = new URL(request.url);
    if (url.origin === 'https://jpdb.io' && url.pathname === '/api/v1/parse') {
        return jsonHttpResponse(mockJpdbParseFromVocabulary(readJsonBody(request.data), VOCABULARY, {
            tokenReading: () => [['日本語', 'にほんご']],
        }));
    }
    return { status: 404, responseText: '' };
}
