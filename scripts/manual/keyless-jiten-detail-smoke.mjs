#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    addGmStorageBridgeInitScript,
    assert,
    assertBuiltArtifacts,
    closeSmokeBrowserAndServer,
    createSmokePaths,
    jsonHttpResponse,
    launchSmokeBrowser,
    YOMU_SETTINGS_KEY,
} from '../lib/smoke-harness.mjs';
import { addScriptTagWithCspFallback, installUserscriptCssResource } from '../lib/smoke-test-helpers.mjs';
import { youtubeWatchHtml } from '../fixtures/youtube-fixtures.mjs';

const {
    root: ROOT,
    artifacts: ARTIFACTS,
    scriptPath: SCRIPT_PATH,
    cssPath: CSS_PATH,
} = createSmokePaths(import.meta.dirname);

const WATCH_URL = 'https://www.youtube.com/watch?v=keyless-jiten-detail';
const EXPECT_MODE = process.env.YOMU_KEYLESS_JITEN_EXPECT === 'broken' ? 'broken' : 'fixed';
const REPORT_NAME = EXPECT_MODE === 'broken'
    ? 'keyless-jiten-detail-repro-before.json'
    : 'keyless-jiten-detail-fixed.json';
const SCREENSHOT_NAME = EXPECT_MODE === 'broken'
    ? 'keyless-jiten-detail-repro-before.png'
    : 'keyless-jiten-detail-fixed.png';

const TARGETS = [
    { surface: '日本語', text: '日本[にほん]語[ご]', wordId: 1001, readingIndex: 0, pitchAccents: [0] },
    { surface: '動画', text: '動画[どうが]', wordId: 1002, readingIndex: 0, pitchAccents: [0] },
    { surface: '見る', text: '見[み]る', wordId: 1003, readingIndex: 0, pitchAccents: [1] },
    { surface: '練習', text: '練習[れんしゅう]', wordId: 1004, readingIndex: 0, pitchAccents: [0] },
    { surface: '英会話', text: '英[えい]会[かい]話[わ]', wordId: 1005, readingIndex: 0, pitchAccents: [3] },
];
const TARGET_BY_WORD_ID = new Map(TARGETS.map(target => [target.wordId, target]));
const TITLE = '日本語の動画を見る練習';
const DESCRIPTION = '英会話も日本語で練習します。';

const SETTINGS = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    jitenApiKey: '',
    jpdbDefinitionsEnabled: false,
    localDictionariesEnabled: false,
    ankiEnabled: false,
    ankiSectionEnabled: false,
    newTabAnkiEnabled: false,
    audioEnabled: false,
    autoPlayAudio: false,
    immersionKitEnabled: false,
    studyTranslationEnabled: false,
    studyGrammarEnabled: false,
    subtitlePlayerEnabled: false,
    ocrEnabled: false,
    lookupOnClick: true,
    lookupOnHover: false,
    popupActivationMode: 'click',
    showFloatingButton: false,
    showFurigana: true,
    furiganaMode: 'all',
    showPitchAccent: true,
    wordHighlightColorSource: 'off',
    wordUnderlineColorSource: 'pitch',
    wordTextColorSource: 'pitch',
    enableLogging: Boolean(process.env.SMOKE_DEBUG),
};

mkdirSync(ARTIFACTS, { recursive: true });
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH], ROOT, 'Run npm run build first.');

const requests = [];
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });

try {
    const context = await browser.newContext({
        bypassCSP: true,
        locale: 'ja-JP',
        viewport: { width: 1100, height: 720 },
        deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    if (process.env.SMOKE_DEBUG) {
        page.on('console', message => console.error('[keyless-jiten]', message.type(), message.text().slice(0, 300)));
        page.on('pageerror', error => console.error('[keyless-jiten pageerror]', error.message.slice(0, 300)));
    }
    await page.exposeFunction('__yomuKeylessJitenRequest', request => handleYomuRequest(request, requests));
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: SETTINGS,
        requestBridgeName: '__yomuKeylessJitenRequest',
    });
    await installRoutes(page, requests);
    await page.goto(WATCH_URL, { waitUntil: 'domcontentloaded' });
    await installUserscriptCssResource(page, CSS_PATH);
    await addScriptTagWithCspFallback(page, SCRIPT_PATH);

    await page.waitForFunction(() => document.querySelectorAll('ytd-watch-metadata .jpdb-reader-word').length >= 3, null, { timeout: 20_000 });
    if (EXPECT_MODE === 'fixed') {
        await page.waitForFunction(() => {
            const words = [...document.querySelectorAll('ytd-watch-metadata .jpdb-reader-word')];
            return words.filter(word => word.querySelector('rt,.jpdb-reader-furi')).length >= 3
                && words.filter(word => word instanceof HTMLElement && word.dataset.pitchClass && word.dataset.pitchClass !== 'unknown').length >= 3;
        }, null, { timeout: 20_000 });
    } else {
        await page.waitForTimeout(1200);
    }

    const state = await readState(page);
    const report = {
        ok: EXPECT_MODE === 'broken' ? state.missingDetail : state.hydrated,
        expect: EXPECT_MODE,
        ...state,
        requests,
        screenshot: path.join(ARTIFACTS, SCREENSHOT_NAME),
    };
    await page.screenshot({ path: report.screenshot, fullPage: false });
    writeFileSync(path.join(ARTIFACTS, REPORT_NAME), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));

    if (EXPECT_MODE === 'broken') {
        assert(state.missingDetail, 'Expected keyless public Jiten words to be missing detail before the fix.', report);
    } else {
        assert(state.hydrated, 'Keyless public Jiten words did not hydrate furigana and pitch.', report);
        assert(state.detailRequests <= 5, 'Keyless detail hydration made too many public detail requests for this page.', report);
    }
    await context.close();
} finally {
    await closeSmokeBrowserAndServer(browser, { close: callback => callback?.() });
}

async function installRoutes(page, requestsLog) {
    await page.route('**/*', route => {
        const url = route.request().url();
        requestsLog.push({ kind: 'blocked', url });
        return route.abort();
    });
    await page.route(WATCH_URL, route => route.fulfill({
        body: youtubeWatchHtml({
            fixture: 'keyless-jiten-detail',
            title: TITLE,
            description: DESCRIPTION,
        }),
        contentType: 'text/html; charset=utf-8',
    }));
    await page.route('https://api.jiten.moe/api/**', route => {
        const response = handleJitenUrl(route.request().url(), requestsLog);
        return route.fulfill({
            status: response.status,
            body: response.responseText,
            contentType: response.contentType,
            headers: { 'access-control-allow-origin': '*' },
        });
    });
}

function handleYomuRequest(request, requestsLog) {
    if (request.url.startsWith('https://api.jiten.moe/api/')) return handleJitenUrl(request.url, requestsLog);
    requestsLog.push({ kind: 'blocked-gm', url: request.url });
    return { status: 404, responseText: '', contentType: 'text/plain' };
}

function handleJitenUrl(urlString, requestsLog) {
    const url = new URL(urlString);
    if (url.pathname.endsWith('/vocabulary/parse')) {
        const text = url.searchParams.get('text') ?? '';
        const words = parseWordsForText(text);
        requestsLog.push({ kind: 'jiten-parse', text, surfaces: words.map(word => word.originalText) });
        return jsonHttpResponse(words);
    }
    const detail = url.pathname.match(/\/vocabulary\/(\d+)\/(\d+)\/info$/u);
    if (detail) {
        const wordId = Number(detail[1]);
        const target = TARGET_BY_WORD_ID.get(wordId);
        requestsLog.push({ kind: 'jiten-detail', wordId, readingIndex: Number(detail[2]) });
        return jsonHttpResponse(jitenDetail(target));
    }
    requestsLog.push({ kind: 'unexpected-jiten', url: urlString });
    return { status: 404, responseText: '{}', contentType: 'application/json; charset=utf-8' };
}

function parseWordsForText(text) {
    const words = [];
    for (let index = 0; index < text.length;) {
        const target = TARGETS.find(candidate => text.startsWith(candidate.surface, index));
        if (!target) {
            index += 1;
            continue;
        }
        words.push({
            wordId: target.wordId,
            readingIndex: target.readingIndex,
            originalText: target.surface,
        });
        index += target.surface.length;
    }
    return words;
}

function jitenDetail(target) {
    if (!target) return {};
    return {
        wordId: target.wordId,
        mainReading: { text: target.text, frequencyRank: 1000 + target.wordId },
        partsOfSpeech: ['n'],
        definitions: [{ meanings: [`${target.surface} definition`], partsOfSpeech: ['noun'] }],
        pitchAccents: target.pitchAccents,
    };
}

async function readState(page) {
    return await page.evaluate(() => {
        const words = [...document.querySelectorAll('ytd-watch-metadata .jpdb-reader-word')]
            .filter(word => word instanceof HTMLElement)
            .map(word => ({
                text: word.textContent?.trim() ?? '',
                expression: word.dataset.expression ?? '',
                reading: word.dataset.reading ?? '',
                source: word.dataset.cardSource ?? '',
                pitchClass: word.dataset.pitchClass ?? '',
                hasRuby: Boolean(word.querySelector('rt,.jpdb-reader-furi')),
                html: word.innerHTML,
            }));
        const parseRequests = window.__yomuKeylessJitenRequests?.filter?.(request => request.kind === 'jiten-parse').length ?? 0;
        return {
            wordCount: words.length,
            words,
            rubyCount: words.filter(word => word.hasRuby).length,
            pitchCount: words.filter(word => word.pitchClass && word.pitchClass !== 'unknown').length,
            hydrated: words.length >= 3
                && words.filter(word => word.hasRuby).length >= 3
                && words.filter(word => word.pitchClass && word.pitchClass !== 'unknown').length >= 3,
            missingDetail: words.length >= 3
                && words.filter(word => !word.hasRuby || !word.pitchClass || word.pitchClass === 'unknown').length >= 3,
            parseRequests,
            detailRequests: 0,
        };
    }).then(state => ({
        ...state,
        parseRequests: requests.filter(request => request.kind === 'jiten-parse').length,
        detailRequests: requests.filter(request => request.kind === 'jiten-detail').length,
    }));
}
