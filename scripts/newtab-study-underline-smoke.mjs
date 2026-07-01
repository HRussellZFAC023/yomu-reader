#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
    assert,
    assertBuiltArtifacts,
    serveFile,
    startLoopbackServer,
    YOMU_SETTINGS_KEY,
} from './lib/smoke-harness.mjs';
import { createYomuPaths } from './lib/paths.mjs';

const {
    appRoot: ROOT,
    docsPublicRoot: DOCS_PUBLIC_ROOT,
    qaArtifactsRoot: QA_ARTIFACTS_ROOT,
} = createYomuPaths(import.meta.dirname);

const NEWTAB_DIR = path.join(DOCS_PUBLIC_ROOT, 'newtab');
const ARTIFACT_DIR = path.join(QA_ARTIFACTS_ROOT, 'newtab-study-underline', 'latest');
const NEW_TAB_CACHE_KEY = 'jpdb-reader-newtab-card-cache';
const NEW_TAB_UI_KEY = 'jpdb-reader-newtab-ui';
const PITCH_COLOR = '#ef4444';

const STUDY_CARDS = [
    card({ spelling: '音楽', reading: 'おんがく', pitchAccent: ['HLLL'], meaning: 'music', frequencyRank: 1200 }),
    card({ spelling: '学習能力', reading: 'がくしゅうのうりょく', pitchAccent: ['LHHHHHHH'], meaning: 'learning ability', frequencyRank: 16_000 }),
    card({ spelling: '読み取る', reading: 'よみとる', pitchAccent: ['LHHH'], meaning: 'to read; to grasp', frequencyRank: 5200 }),
    card({ spelling: 'よむ', reading: 'よむ', pitchAccent: ['HL'], meaning: 'to read', frequencyRank: 900 }),
];

assertBuiltArtifacts([
    path.join(NEWTAB_DIR, 'index.html'),
    path.join(NEWTAB_DIR, 'app.js'),
    path.join(NEWTAB_DIR, 'styles.css'),
], ROOT, 'Run npm run build and node scripts/sync-docs-userscript.cjs first.');

mkdirSync(ARTIFACT_DIR, { recursive: true });

console.error('[newtab-study-underline] starting hosted docs server');
const server = await startHostedDocsServer();
console.error('[newtab-study-underline] launching chromium');
const browser = await chromium.launch({ headless: true });

try {
    const results = [];
    for (const studyCard of STUDY_CARDS) {
        console.error(`[newtab-study-underline] verifying ${studyCard.spelling}`);
        results.push(await verifyStudyCard(browser, server.origin, studyCard));
    }
    const summary = {
        ok: results.every(result => result.ok),
        url: `${server.origin}/newtab/index.html?smoke=newtab-study-underline`,
        hostedPath: '/newtab/index.html',
        results,
    };
    writeFileSync(path.join(ARTIFACT_DIR, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    console.log(JSON.stringify(summary, null, 2));
    assert(summary.ok, 'New-tab study term underline smoke failed', summary);
} finally {
    await browser.close().catch(() => undefined);
    await new Promise(resolve => server.server.close(resolve));
}

async function verifyStudyCard(browser, origin, studyCard) {
    const context = await browser.newContext({
        bypassCSP: true,
        serviceWorkers: 'block',
        locale: 'ja-JP',
        viewport: { width: 980, height: 760 },
        deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const browserErrors = [];
    page.on('pageerror', error => browserErrors.push(String(error).slice(0, 240)));
    page.on('console', message => {
        if (message.type() === 'error' && !/^Failed to load resource:/u.test(message.text())) {
            browserErrors.push(message.text().slice(0, 240));
        }
    });
    await blockExternalApis(page);
    await seedHostedStudyCard(page, studyCard);

    const slug = safeSlug(studyCard.spelling);
    try {
        const url = `${origin}/newtab/index.html?smoke=newtab-study-underline&term=${encodeURIComponent(studyCard.spelling)}`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.waitForSelector('[data-jpdb-reader-root].jpdb-reader-newtab[data-newtab-bound="true"]', { timeout: 15_000 });
        await openWordStep(page);
        await page.waitForFunction(expected => {
            const word = document.querySelector('.jpdb-reader-newtab-term .jpdb-reader-word');
            return word?.getAttribute('data-expression') === expected || word?.textContent?.trim() === expected;
        }, studyCard.spelling, { timeout: 15_000 });
        await page.waitForTimeout(180);

        let before = null;
        if (studyCard.spelling === '音楽') {
            before = await captureShadowRegressionBefore(page, slug);
        }
        const after = await captureFixedState(page, slug);
        const ok = after.expression === studyCard.spelling
            && after.textShadow === 'none'
            && after.boxShadow === 'none'
            && isTransparentColor(after.textDecorationColor)
            && !isTransparentColor(after.afterBorderBlockEndColor)
            && Number.parseFloat(after.afterBorderBlockEndWidth) > 0
            && after.pitchClass !== 'unknown'
            && after.fontWeight >= 800
            && after.fontSize >= 40
            && !browserErrors.length;

        assert(ok, `${studyCard.spelling} rendered a duplicate or missing study-term underline layer`, {
            before,
            after,
            browserErrors,
        });

        return { ok, term: studyCard.spelling, before, after, browserErrors };
    } finally {
        await context.close().catch(() => undefined);
    }
}

async function openWordStep(page) {
    const wordStep = page.locator('[data-newtab-action="study-step"][data-study-step-kind="word"]').first();
    if (!await wordStep.count()) return;
    if (await wordStep.getAttribute('aria-current') === 'step') return;
    await wordStep.click();
    await page.waitForSelector('[data-study-step-kind="word"][aria-current="step"]', { timeout: 10_000 });
}

async function captureShadowRegressionBefore(page, slug) {
    const handle = await page.addStyleTag({
        content: '.jpdb-reader-newtab-term .jpdb-reader-word { text-shadow: 0 1px 2px var(--jpdb-reader-shadow-soft) !important; }',
    });
    await page.waitForTimeout(50);
    const snapshot = await studyTermSnapshot(page);
    snapshot.screenshot = path.join(ARTIFACT_DIR, `${slug}-before-shadow-repro.png`);
    snapshot.wordScreenshot = path.join(ARTIFACT_DIR, `${slug}-before-shadow-word.png`);
    await page.screenshot({ path: snapshot.screenshot, fullPage: true });
    await page.locator('.jpdb-reader-newtab-term').screenshot({ path: snapshot.wordScreenshot });
    await handle.evaluate(node => node.remove());
    await page.waitForTimeout(50);
    return snapshot;
}

async function captureFixedState(page, slug) {
    const snapshot = await studyTermSnapshot(page);
    snapshot.screenshot = path.join(ARTIFACT_DIR, `${slug}-after-fixed.png`);
    snapshot.wordScreenshot = path.join(ARTIFACT_DIR, `${slug}-after-fixed-word.png`);
    await page.screenshot({ path: snapshot.screenshot, fullPage: true });
    await page.locator('.jpdb-reader-newtab-term').screenshot({ path: snapshot.wordScreenshot });
    return snapshot;
}

async function studyTermSnapshot(page) {
    return page.evaluate(() => {
        const term = document.querySelector('.jpdb-reader-newtab-term');
        const word = document.querySelector('.jpdb-reader-newtab-term .jpdb-reader-word');
        if (!(term instanceof HTMLElement) || !(word instanceof HTMLElement)) {
            throw new Error('study term word missing');
        }
        const style = getComputedStyle(word);
        const after = getComputedStyle(word, '::after');
        return {
            url: location.href,
            expression: word.dataset.expression ?? '',
            termText: term.textContent?.trim() ?? '',
            dom: term.outerHTML,
            className: word.className,
            pitchClass: word.dataset.pitchClass ?? '',
            textShadow: style.textShadow,
            boxShadow: style.boxShadow,
            textDecorationLine: style.textDecorationLine,
            textDecorationColor: style.textDecorationColor,
            textDecorationThickness: style.textDecorationThickness,
            textUnderlineOffset: style.textUnderlineOffset,
            afterBorderBlockEndColor: after.borderBlockEndColor,
            afterBorderBlockEndWidth: after.borderBlockEndWidth,
            afterBorderBlockEndStyle: after.borderBlockEndStyle,
            afterBoxShadow: after.boxShadow,
            afterBottom: after.bottom || after.insetBlockEnd,
            fontSize: Number.parseFloat(style.fontSize),
            fontWeight: Number.parseFloat(style.fontWeight),
        };
    });
}

async function seedHostedStudyCard(page, studyCard) {
    await page.addInitScript(({ settingsKey, cacheKey, uiKey, settings, cache, uiState }) => {
        localStorage.setItem(settingsKey, JSON.stringify(settings));
        localStorage.setItem(cacheKey, JSON.stringify(cache));
        localStorage.setItem(uiKey, JSON.stringify(uiState));
        delete window.GM;
        delete window.GM_getValue;
        delete window.GM_setValue;
        delete window.GM_deleteValue;
        delete window.GM_listValues;
        delete window.GM_xmlhttpRequest;
    }, {
        settingsKey: YOMU_SETTINGS_KEY,
        cacheKey: NEW_TAB_CACHE_KEY,
        uiKey: NEW_TAB_UI_KEY,
        settings: {
            onboardingSeen: true,
            newTabEnabled: true,
            newTabOfflineEnabled: true,
            newTabOfflineLimit: 4,
            interfaceLanguage: 'en',
            theme: 'light',
            apiKey: '',
            jitenApiKey: '',
            newTabSource: 'dictionary',
            localDictionariesEnabled: false,
            newTabAnkiEnabled: false,
            ankiEnabled: false,
            newTabParsingEnabled: false,
            immersionKitEnabled: false,
            studyTranslationEnabled: false,
            studyGrammarEnabled: false,
            audioEnabled: false,
            showPitchAccent: true,
            wordUnderlineColorSource: 'pitch',
            wordHighlightColorSource: 'off',
            wordTextColorSource: 'off',
            accentColor: PITCH_COLOR,
            pitchColorAtamadaka: PITCH_COLOR,
            pitchColorHeiban: PITCH_COLOR,
            pitchColorNakadaka: PITCH_COLOR,
            pitchColorOdaka: PITCH_COLOR,
            pitchColorKifuku: PITCH_COLOR,
            pitchColorUnknown: '#94a3b8',
        },
        cache: {
            at: Date.now(),
            sourceLabel: 'Dictionary',
            cards: [studyCard],
        },
        uiState: {
            mode: 'word',
            sort: 'frequency',
            filter: 'study',
            source: 'dictionary',
            revealAnswer: false,
        },
    });
}

async function blockExternalApis(page) {
    const emptyJson = JSON.stringify({ cards: [], vocabulary: [], tokens: [] });
    await page.route('**/api.jiten.moe/**', route => route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: emptyJson,
    }));
    await page.route('**/jpdb.io/**', route => route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><title>empty jpdb fixture</title>',
    }));
    await page.route('**/yomu-jpdb-public-proxy.**', route => route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: emptyJson,
    }));
}

async function startHostedDocsServer() {
    const routes = new Map([
        ['/newtab', [path.join(NEWTAB_DIR, 'index.html'), 'text/html; charset=utf-8']],
        ['/newtab/index.html', [path.join(NEWTAB_DIR, 'index.html'), 'text/html; charset=utf-8']],
        ['/newtab/app.js', [path.join(NEWTAB_DIR, 'app.js'), 'text/javascript; charset=utf-8']],
        ['/newtab/styles.css', [path.join(NEWTAB_DIR, 'styles.css'), 'text/css; charset=utf-8']],
        ['/newtab/sw.js', [path.join(NEWTAB_DIR, 'sw.js'), 'text/javascript; charset=utf-8']],
        ['/newtab/version.json', [path.join(NEWTAB_DIR, 'version.json'), 'application/json; charset=utf-8']],
        ['/yomu-icon.svg', [path.join(DOCS_PUBLIC_ROOT, 'yomu-icon.svg'), 'image/svg+xml']],
        ['/favicon-32x32.png', [path.join(DOCS_PUBLIC_ROOT, 'favicon-32x32.png'), 'image/png']],
        ['/favicon.ico', [path.join(DOCS_PUBLIC_ROOT, 'favicon-32x32.png'), 'image/png']],
    ]);
    return startLoopbackServer((request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        const route = routes.get(url.pathname.replace(/\/+$/u, '') || '/');
        if (!route || !existsSync(route[0])) {
            response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
            response.end(`Not found: ${url.pathname}`);
            return;
        }
        serveFile(response, route[0], route[1], request.method ?? 'GET');
    }, 'Could not bind new-tab study underline smoke server');
}

function card({ spelling, reading, pitchAccent, meaning, frequencyRank }) {
    const id = stableId(spelling);
    return {
        vid: id,
        sid: id,
        rid: 0,
        spelling,
        reading,
        frequencyRank,
        partOfSpeech: [],
        meanings: [{ glosses: [meaning], partOfSpeech: [] }],
        cardState: ['not-in-deck'],
        pitchAccent,
        wordWithReading: null,
        source: 'local',
        reviewSource: 'dictionary',
        sentence: spelling,
    };
}

function stableId(value) {
    let hash = 0;
    for (const char of value) hash = ((hash * 31) + char.codePointAt(0)) | 0;
    return hash || 1;
}

function isTransparentColor(value) {
    const compact = String(value).replace(/\s+/g, '').toLowerCase();
    return compact === 'transparent'
        || compact === 'rgba(0,0,0,0)'
        || compact === 'rgb(0,0,0,0)'
        || compact.endsWith(',0)');
}

function safeSlug(value) {
    return [...value].map(char => char.codePointAt(0).toString(16)).join('-');
}
