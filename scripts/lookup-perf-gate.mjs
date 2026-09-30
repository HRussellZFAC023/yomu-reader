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
// Ceilings are the numbers this gate measured on 2.0.0, plus 50% headroom,
// rounded up. They are a RATCHET, not a target: if the real counts drop
// further, tighten them. If a change genuinely needs more work per lookup,
// raise the ceiling in the same commit and say why in the message.
//
// The dictionary is seeded as a page-local store rather than imported: an
// ordinary page never shows the import control (see lookup-perf-fixture.mjs).
//
// Nightly, not check:release: it needs a Playwright browser and a full build.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
import { MINI_LOOKUP_DICTIONARY_TITLE, miniLookupDictionarySettings, seedMiniLookupDictionary } from './lib/lookup-perf-fixture.mjs';

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
// Every scan re-runs its document-wide geometry sweep once, this long after it
// applies. Settling for less put that one-shot sweep in the idle baseline, whose
// seven selector sweeps then cancelled the hover's own out of the count.
const SETTLE_AFTER_SCAN_MS = scannerDelayedSweepMs() + 500;

// Measured, +50%, rounded up. On 2.0.0 every local run gave the same counts,
// also with three gates running at once: gmReads 8 (5 `yomu:state-epoch`, 2
// grammar preferences, 1 mining context), idbTransactions 12, elementFromPoint 4,
// readerQuerySelectorAll 5. The selector count includes a recurring asbplayer
// overlay probe that lands in the hover window once or twice, so that ceiling
// stays at 6 rather than growing to 5 * 1.5.
//
// History: gmReads was 43-46 before the 1.8.x epoch-read work, 33-35 of them on
// `yomu:state-epoch`, because every managed value read was bracketed by an epoch
// read on BOTH sides. Reads lost the after-fence (a read cannot observe a newer
// epoch — see src/reader/app/managed-read-path.ts) and a read pass takes one
// fence for N keys, which left 31-33. That gate named two caller-side bites: the
// study grammar panel rendering 4x per hover, and the parser taking a handle
// fence on each of its 7 dictionary sweeps. Fix such costs in their callers, not
// by weakening a fence.
//
// Update deliberately, never to make a red gate green.
const CEILINGS = {
    gmReads: 12,
    idbTransactions: 18,
    elementFromPoint: 6,
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
    ...miniLookupDictionarySettings(),
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
        // The Reader commits settings with its intent ledger; re-seeding only
        // the settings value on the second load would tear that pair.
        initialize: 'ifMissing',
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

    const waitForAnnotatedSentence = () => page.waitForFunction(
        () => document.querySelectorAll('[data-gate-sentence] .jpdb-reader-word').length >= 4,
        null,
        { timeout: 30_000 },
    );
    await page.goto(`${server.origin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
    await seedMiniLookupDictionary(page);
    await inject();
    await waitForAnnotatedSentence();

    // Fresh load so the measured lookup runs against a settled store that the
    // first load already migrated, rather than through that first open.
    await page.goto(`${server.origin}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
    await inject();
    await waitForAnnotatedSentence();
    // Let the annotation pass and its follow-up sweeps go quiet, so the counters
    // attribute their work to the hover and not to a scan still in flight.
    await page.waitForTimeout(SETTLE_AFTER_SCAN_MS);

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
    // Read after the counters: the counts only mean something if the hover was
    // the local-dictionary lookup this gate prices, not a failed or online one.
    const localCard = await page.evaluate(({ title, gloss }) => {
        const card = [...document.querySelectorAll('.jpdb-reader-popover [data-source="local-dictionary"]')]
            .find(candidate => candidate.getAttribute('data-dictionary') === title);
        const text = (card?.querySelector('[data-definition-translation-text]')?.textContent ?? '').replace(/\s+/g, ' ').trim();
        return { rendered: Boolean(card), hasGloss: text.includes(gloss), text };
    }, { title: MINI_LOOKUP_DICTIONARY_TITLE, gloss: 'kanji' });
    assert(localCard.rendered && localCard.hasGloss, `The hover on "${HOVER_WORD}" did not render the seeded local dictionary.`, localCard);
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

function scannerDelayedSweepMs() {
    const source = path.join(ROOT, 'src', 'reader', 'app', 'visible-page-scanner.ts');
    const delay = Number(readFileSync(source, 'utf8').match(/^const VISIBLE_SCAN_CLAMP_SWEEP_DELAY_MS = (\d+);/m)?.[1]);
    if (!Number.isFinite(delay) || delay <= 0) throw new Error(`Could not read the delayed scan sweep from ${source}`);
    return delay;
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
