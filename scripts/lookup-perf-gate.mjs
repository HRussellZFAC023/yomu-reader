#!/usr/bin/env node
// An ASSERTING counter gate for the hover-lookup hot path.
//
// scripts/profile-performance.mjs measures wall-clock latency and prints it. That
// is the right tool for "is it fast today", and the wrong one for "did someone
// re-add the work we removed": timings on a shared CI runner are too noisy to
// assert on, so the profiler asserts nothing and a regression re-lands unnoticed.
// This gate counts OPERATIONS instead, against the built userscript on a real
// annotated page, because operation counts are exact and machine-independent.
//
// What it counts, per ONE hover lookup:
//
//   gmReads          GM_getValue round trips. Under Tampermonkey each is an IPC
//                    hop to the extension worker. The dictionary store used to
//                    take the managed-state MUTATION fence twice per handle
//                    acquisition, which cost 9 of these per lookup on two
//                    control keys that cannot change without a factory reset;
//                    and every managed value read used to be bracketed by an
//                    epoch read on BOTH sides, so a read cost three round trips
//                    and a fan-out of N keys cost 3N.
//   idbTransactions  IndexedDB read transactions.
//   elementFromPoint Hit tests. The OCR pointer path asked the same point three
//                    separate times before the per-event memo.
//   readerQuerySelectorAll  Document-wide selector sweeps, which is where the
//                    attribute-substring [style*="background-image"] census that
//                    ran per pointermove would show up again.
//
// Ceilings are the numbers this gate measured after the 1.8.82 lookup-path work,
// plus 50% headroom, rounded up. They are a RATCHET, not a target: if the real
// counts drop further, tighten them. If a change genuinely needs more work per
// lookup, raise the ceiling in the same commit and say why in the message.
//
// Nightly, not check:release: it needs a Playwright browser and a full build.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
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
import { miniLookupDictionaryZip } from './lib/lookup-perf-fixture.mjs';

const { root: ROOT, artifacts: ARTIFACTS, scriptPath: SCRIPT_PATH, cssPath: CSS_PATH } = createSmokePaths(import.meta.dirname);
const SETTINGS_COMPANION_PATH = path.join(ROOT, 'dist', 'greasyfork', 'yomu-settings-surface.user.js');
const PAGE_PATH = '/lookup-perf-gate.html';
// Long enough that the annotation pass is a realistic one, and every word is in
// the mini dictionary so the hovered word always resolves locally.
const SENTENCE = '図書館で漢字を調べています。練習をします。図書館は静かです。';
const HOVER_WORD = '漢字';

// The window each counter is attributed over, used for BOTH the idle baseline
// and the post-hover tail.
const IDLE_WINDOW_MS = 800;

// Measured, +50%, rounded up. Across local runs: gmReads 31-33, the other three
// exactly 12 / 6 / 4 every time. The GM count drifts by a couple because the
// study panel re-renders its grammar hints a variable number of times depending
// on when the popover body resolves, and each render re-reads its preferences
// key, so the headroom covers that plus host and build variation.
//
// gmReads was 43-46 before the epoch-read work, with 33-35 of those on
// `yomu:state-epoch`: every managed value read was bracketed by an epoch read on
// BOTH sides, so ~10 real value reads cost four times that in round trips. The
// after-fence is gone for reads (a read cannot observe a newer epoch — see
// src/reader/app/managed-read-path.ts), a read pass now takes one fence for N
// keys instead of one each, and the synchronous path no longer asks for the same
// epoch twice in one turn. 21 of the remaining 33 are still `yomu:state-epoch`.
//
// The next two bites are both CALLER-side, not storage-side: the study grammar
// panel renders 4x per hover (4 epoch + 4 value reads for one preferences key),
// and the parser sweeps the dictionary 7x per hover, each sweep taking its own
// handle fence. Fix those in their own callers, not by weakening a fence.
//
// Update deliberately, never to make a red gate green.
const CEILINGS = {
    gmReads: 47,
    idbTransactions: 18,
    elementFromPoint: 9,
    readerQuerySelectorAll: 6,
};

const settings = {
    onboardingSeen: true,
    interfaceLanguage: 'en',
    apiKey: '',
    jitenApiKey: '',
    audioEnabled: false,
    autoPlayAudio: false,
    immersionKitEnabled: false,
    showFloatingButton: false,
    lookupOnHover: true,
    popupActivationMode: 'hover',
    hoverOpenDelayMs: 0,
    enableLogging: Boolean(process.env.SMOKE_DEBUG),
};

mkdirSync(ARTIFACTS, { recursive: true });
assertBuiltArtifacts([SCRIPT_PATH, CSS_PATH, SETTINGS_COMPANION_PATH], ROOT, 'Run npm run build first.');

const server = await startLoopbackServer((request, response) => {
    if (new URL(request.url ?? '/', 'http://127.0.0.1').pathname !== PAGE_PATH) {
        response.writeHead(404, { 'content-type': 'text/plain' });
        return response.end('Not found');
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>lookup perf gate</title>
<style>body{font-family:system-ui,sans-serif;margin:48px;line-height:2.4}main{max-width:720px}
/* Decorative background images: the shape that made the OCR pointer path census
   the whole document on every pointermove. */
.deco{background-image:url(data:image/gif;base64,R0lGODlhAQABAAAAACw=);height:8px}</style></head>
<body><main><p data-gate-sentence>${SENTENCE}</p>
<div class="deco"></div><div class="deco"></div><div class="deco"></div></main></body></html>`);
}, 'Could not bind lookup perf gate server');
const browser = await launchSmokeBrowser(chromium, 'chromium', { headless: true });

try {
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1024, height: 768 } });
    const page = await context.newPage();
    if (process.env.SMOKE_DEBUG) {
        page.on('console', message => console.error('[console]', message.type(), message.text().slice(0, 300)));
        page.on('pageerror', error => console.error('[pageerror]', error.message.slice(0, 300)));
    }
    await page.exposeFunction('__yomuLookupPerfGateRequest', () => ({ status: 503, responseText: '' }));
    await addGmStorageBridgeInitScript(page, {
        key: YOMU_SETTINGS_KEY,
        value: settings,
        requestBridgeName: '__yomuLookupPerfGateRequest',
    });

    const inject = async () => {
        await installUserscriptCssResource(page, CSS_PATH);
        await addScriptTagWithCspFallback(page, SETTINGS_COMPANION_PATH);
        await addScriptTagWithCspFallback(page, SCRIPT_PATH);
        await page.waitForFunction(
            () => Boolean(window.__yomuReaderAppInitialized || document.getElementById('jpdb-reader-runtime-owner')),
            null,
            { timeout: 15_000 },
        );
    };

    await page.goto(`${server.origin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
    await inject();
    await importGateDictionary(page);

    // Fresh load so the measured lookup runs against a settled, already-annotated
    // page rather than through the first-import path.
    await page.goto(`${server.origin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
    await inject();
    await page.waitForFunction(
        () => document.querySelectorAll('[data-gate-sentence] .jpdb-reader-word').length >= 4,
        null,
        { timeout: 30_000 },
    );
    // Let the annotation pass and its follow-up sweeps go quiet, so the counters
    // attribute their work to the hover and not to a scan still in flight.
    await page.waitForTimeout(1200);

    await installCounters(page);
    const word = page.locator('[data-gate-sentence] .jpdb-reader-word', { hasText: HOVER_WORD }).first();
    assert(await word.count() > 0, `The gate fixture never annotated "${HOVER_WORD}".`);

    // An idle window of the same length first. Background polls and settle timers
    // also touch storage and the DOM, and a gate that folded those into the hover
    // would be measuring the clock, not the lookup.
    await page.evaluate(() => window.__yomuLookupPerfCounters.reset());
    await page.waitForTimeout(IDLE_WINDOW_MS);
    const idle = await page.evaluate(() => window.__yomuLookupPerfCounters.read());

    await page.evaluate(() => window.__yomuLookupPerfCounters.reset());
    await word.hover();
    await page.waitForFunction(() => Boolean(document.querySelector('.jpdb-reader-popover')), null, { timeout: 15_000 });
    // The popover shell can paint before the definition body resolves; give the
    // remaining reads a moment so they are counted rather than missed.
    await page.waitForTimeout(IDLE_WINDOW_MS);
    const observed = await page.evaluate(() => window.__yomuLookupPerfCounters.read());
    const counts = Object.fromEntries(Object.keys(CEILINGS)
        .map(name => [name, Math.max(0, observed[name] - idle[name])]));

    const report = {
        measuredAt: new Date().toISOString(),
        hoverWord: HOVER_WORD,
        idleWindowMs: IDLE_WINDOW_MS,
        idle,
        observed,
        counts,
        gmReadsByKey: observed.gmReadsByKey,
        ceilings: CEILINGS,
    };
    writeFileSync(path.join(ARTIFACTS, 'lookup-perf-gate.json'), `${JSON.stringify(report, null, 2)}\n`);

    const failures = Object.entries(CEILINGS)
        .filter(([name, ceiling]) => counts[name] > ceiling)
        .map(([name, ceiling]) => `${name}: ${counts[name]} > ceiling ${ceiling}`);

    console.log('[lookup-perf] one hover lookup on an annotated page:');
    for (const [name, ceiling] of Object.entries(CEILINGS)) {
        console.log(`  ${name.padEnd(24)} ${String(counts[name]).padStart(5)}  (ceiling ${ceiling})`);
    }
    console.log(`  (idle baseline over the same ${IDLE_WINDOW_MS}ms window: ${JSON.stringify(Object.fromEntries(Object.keys(CEILINGS).map(name => [name, idle[name]])))})`);
    const byKey = Object.entries(observed.gmReadsByKey ?? {}).sort((a, b) => b[1] - a[1]);
    if (byKey.length) {
        console.log('  GM reads by key (hover window, raw):');
        for (const [key, reads] of byKey) console.log(`    ${String(reads).padStart(4)}  ${key}`);
    }

    if (failures.length) {
        console.error('\n[lookup-perf] FAIL: the hover lookup does more work than the ceiling allows.');
        for (const failure of failures) console.error(`  ${failure}`);
        console.error('\nEither the added work is unnecessary — the usual answer — or it is genuinely'
            + ' required, in which case raise the ceiling in the same commit and justify it there.');
        process.exit(1);
    }

    const tightenable = Object.entries(CEILINGS)
        .filter(([name, ceiling]) => counts[name] * 2 < ceiling)
        .map(([name, ceiling]) => `${name} ${ceiling} -> ${Math.max(1, Math.ceil(counts[name] * 1.5))}`);
    if (tightenable.length) {
        console.log('\n[lookup-perf] Ceilings can be tightened (an unlowered ratchet stops ratcheting):');
        for (const entry of tightenable) console.log(`  ${entry}`);
    }
    console.log('\n[lookup-perf] PASS');
} finally {
    await closeSmokeBrowserAndServer(browser, server.server);
}

// Import the mini dictionary the way onboarding does, through the settings
// surface, so the store the gate measures is one a real install produces.
async function importGateDictionary(page) {
    await page.waitForFunction(() => {
        if (document.querySelector('.jpdb-reader-settings')) return true;
        window.dispatchEvent(new CustomEvent('yomu-open-settings', { detail: { panel: 'backup' } }));
        return false;
    }, null, { timeout: 45_000, polling: 500 });
    const importButton = page.locator('[data-action="import-yomitan-dictionary"]');
    await importButton.scrollIntoViewIfNeeded();
    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 15_000 });
    await importButton.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
        name: 'mini-lookup-perf.zip',
        mimeType: 'application/zip',
        buffer: miniLookupDictionaryZip(),
    });
    await page.waitForFunction(() => {
        const statusText = [...document.querySelectorAll('.jpdb-reader-settings [data-import-status], .jpdb-reader-settings [data-dictionary-status], .jpdb-reader-settings [role="status"]')]
            .map(element => element.textContent ?? '')
            .join(' ');
        return /Imported [\d,]+|インポートしました/.test(statusText);
    }, null, { timeout: 45_000 });
}

// Wrapper injection rather than a source-level counter: the gate must measure
// the SHIPPED bundle, including work added by a call site nobody remembered.
async function installCounters(page) {
    await page.evaluate(() => {
        const counters = {
            gmReads: 0,
            gmReadsByKey: {},
            idbTransactions: 0,
            elementFromPoint: 0,
            readerQuerySelectorAll: 0,
        };
        const originalGetValue = window.GM_getValue;
        if (typeof originalGetValue === 'function') {
            window.GM_getValue = function countedGetValue(key, fallback) {
                counters.gmReads++;
                counters.gmReadsByKey[key] = (counters.gmReadsByKey[key] ?? 0) + 1;
                return originalGetValue.call(this, key, fallback);
            };
        }
        const originalTransaction = IDBDatabase.prototype.transaction;
        IDBDatabase.prototype.transaction = function countedTransaction(...args) {
            counters.idbTransactions++;
            return originalTransaction.apply(this, args);
        };
        const originalElementFromPoint = document.elementFromPoint.bind(document);
        document.elementFromPoint = function countedElementFromPoint(x, y) {
            counters.elementFromPoint++;
            return originalElementFromPoint(x, y);
        };
        const originalQuerySelectorAll = Document.prototype.querySelectorAll;
        Document.prototype.querySelectorAll = function countedQuerySelectorAll(selector) {
            counters.readerQuerySelectorAll++;
            return originalQuerySelectorAll.call(this, selector);
        };
        window.__yomuLookupPerfCounters = {
            reset() {
                counters.gmReads = 0;
                counters.gmReadsByKey = {};
                counters.idbTransactions = 0;
                counters.elementFromPoint = 0;
                counters.readerQuerySelectorAll = 0;
            },
            read() {
                return { ...counters, gmReadsByKey: { ...counters.gmReadsByKey } };
            },
        };
    });
}
