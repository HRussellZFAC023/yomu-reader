#!/usr/bin/env node
// Constrained-row mirror gate smoke: on engines where in-place ruby distorts
// clipped rows, only VISUALLY BARE hosts may be routed through the host-hiding
// text mirror. Styled hosts (pill background/border, dark bars, SVG chevrons,
// ::before separators) must keep painting their own box — the reading is
// suppressed there instead. Runs real layout in Chromium AND WebKit with the
// engine verdict forced on, plus a healthy-engine control round.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CSS_PATH = path.join(ROOT, 'dist', 'yomu.css');
const tempDir = mkdtempSync(path.join(tmpdir(), 'yomu-constrained-gate-smoke-'));
const entryPath = path.join(tempDir, 'probe.ts');
const bundlePath = path.join(tempDir, 'probe.js');

writeFileSync(entryPath, `
    import {
        applyTokensToScanTarget,
        collectTextTargetsIn,
        removeNonDestructiveScanMirrors,
        setRubyDistortsConstrainedRowsForTest,
    } from ${JSON.stringify(path.join(ROOT, 'src/reader/dom/index.ts'))};
    import { DEFAULT_SETTINGS } from ${JSON.stringify(path.join(ROOT, 'src/reader/settings/index.ts'))};
    import type { JPDBCard, JPDBToken } from ${JSON.stringify(path.join(ROOT, 'src/reader/app/types.ts'))};

    const TEXT = '日本語';
    function token(): JPDBToken {
        const card: JPDBCard = {
            vid: 1, sid: 1, rid: 0, spelling: TEXT, reading: 'にほんご', frequencyRank: null,
            partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'jpdb',
        };
        return { card, start: 0, end: TEXT.length, length: TEXT.length, rubies: [{ text: 'にほんご', start: 0, end: TEXT.length, length: TEXT.length }], pitchClass: 'heiban', sentence: TEXT };
    }

    function paintHost(host: HTMLElement): void {
        const target = collectTextTargetsIn(host, 40, false).find(candidate => candidate.text.trim() === TEXT);
        if (!target) throw new Error('target not collected for ' + host.id);
        applyTokensToScanTarget(target, [token()], { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' });
    }

    function snapshotHost(host: HTMLElement) {
        const style = getComputedStyle(host);
        const mirror = host.querySelector('.jpdb-reader-text-mirror');
        return {
            id: host.id,
            mirror: Boolean(mirror),
            mirrorReading: mirror?.querySelector('rt,.jpdb-reader-detached-furi')?.textContent ?? '',
            reading: host.querySelector('rt,.jpdb-reader-detached-furi')?.textContent ?? '',
            hostHidden: style.visibility === 'hidden',
            background: style.backgroundColor,
            words: host.querySelectorAll('.jpdb-reader-word').length,
            inPlaceRt: Boolean(host.querySelector(':scope > .jpdb-reader-word :is(rt,.jpdb-reader-detached-furi), :scope > * > .jpdb-reader-word :is(rt,.jpdb-reader-detached-furi)')
                && !host.querySelector('.jpdb-reader-text-mirror :is(rt,.jpdb-reader-detached-furi)')),
            svgIntact: host.querySelector('svg') ? getComputedStyle(host.querySelector('svg')!).visibility !== 'hidden' : null,
        };
    }

    Object.assign(window, {
        runConcealProbe() {
            removeNonDestructiveScanMirrors(document);
            const host = document.querySelector<HTMLElement>('#conceal-host')!;
            host.textContent = TEXT;
            host.insertAdjacentHTML('beforeend', '<svg width="12" height="12" viewBox="0 0 12 12"><path fill="currentColor" d="M3 2l5 4-5 4"/></svg>');
            (host as unknown as Record<string, unknown>).__reactFiber$probe = {};
            (host as unknown as Record<string, unknown>).__reactProps$probe = {};
            paintHost(host);
            const style = getComputedStyle(host);
            const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror');
            const word = mirror?.querySelector<HTMLElement>('.jpdb-reader-word');
            const svg = host.querySelector('svg');
            return {
                mirror: Boolean(mirror),
                mirrorReading: mirror?.querySelector('rt,.jpdb-reader-detached-furi')?.textContent ?? '',
                hostVisibility: style.visibility,
                hostColor: style.color,
                hostBackground: style.backgroundColor,
                hostBorderWidth: style.borderTopWidth,
                wordColor: word ? getComputedStyle(word).color : '',
                svgColor: svg ? getComputedStyle(svg).color : '',
            };
        },
        runConstrainedGateProbe(forceVerdict: boolean | null) {
            setRubyDistortsConstrainedRowsForTest(null);
            removeNonDestructiveScanMirrors(document);
            for (const host of document.querySelectorAll<HTMLElement>('[data-fixture]')) {
                host.textContent = TEXT;
                if (host.dataset.fixture === 'nav-svg') host.insertAdjacentHTML('beforeend', '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 2l5 4-5 4"/></svg>');
                host.removeAttribute('style');
                host.style.cssText = host.dataset.baseStyle ?? '';
            }
            if (forceVerdict !== null) setRubyDistortsConstrainedRowsForTest(forceVerdict);
            const results: Record<string, unknown> = {};
            for (const host of document.querySelectorAll<HTMLElement>('[data-fixture]')) {
                paintHost(host);
                results[host.id] = snapshotHost(host);
            }
            return results;
        },
    });
`);

await esbuild.build({ entryPoints: [entryPath], bundle: true, outfile: bundlePath, format: 'iife', platform: 'browser', logLevel: 'silent' });

const FIXTURE = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
body { font: 16px/1.4 sans-serif; width: 240px; }
.clip { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; height: 22px; }
#pill { background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 999px; padding: 2px 10px; }
#dark-bar { background: rgb(31, 41, 55); color: #fff; }
#before-row::before { content: '•'; margin-right: 6px; }
</style></head><body>
<div id="bare-title" class="clip" data-fixture="bare" data-base-style=""></div>
<div id="pill" class="clip" data-fixture="pill"></div>
<div id="dark-bar" class="clip" data-fixture="dark"></div>
<div id="nav-item" class="clip" data-fixture="nav-svg"></div>
<div id="before-row" class="clip" data-fixture="before"></div>
<div data-message-author-role="assistant"><div id="conceal-host" style="background: rgb(31, 41, 55); border: 1px solid rgb(99, 102, 241); color: rgb(229, 231, 235); padding: 4px 8px;"></div></div>
</body></html>`;

function fail(message, details) {
    console.error(message, JSON.stringify(details, null, 2));
    process.exitCode = 1;
}

async function runEngine(name, browserType) {
    const browser = await browserType.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.route('https://constrained-gate.example/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FIXTURE }));
        await page.goto('https://constrained-gate.example/', { waitUntil: 'domcontentloaded' });
        await page.addStyleTag({ content: readFileSync(CSS_PATH, 'utf8') });
        await page.addScriptTag({ path: bundlePath });

        const natural = await page.evaluate(() => window.runConstrainedGateProbe(null));
        const forced = await page.evaluate(() => window.runConstrainedGateProbe(true));
        const healthy = await page.evaluate(() => window.runConstrainedGateProbe(false));

        // Every clipped row keeps its authored box and gains an out-of-flow
        // detached reading; no engine verdict is allowed to discard it.
        for (const id of ['bare-title', 'pill', 'dark-bar', 'nav-item', 'before-row']) {
            const snap = forced[id];
            if (snap.hostHidden || snap.words < 1 || snap.reading !== 'にほんご') {
                fail(`${name}: clipped host ${id} lost its base or detached reading`, snap);
            }
            if (id === 'nav-item' && snap.svgIntact === false) fail(`${name}: nav chevron SVG hidden`, snap);
        }
        // Healthy and forced rounds share the same geometry-safe contract.
        for (const id of ['bare-title', 'pill', 'dark-bar', 'nav-item', 'before-row']) {
            if (healthy[id].mirror || healthy[id].hostHidden) fail(`${name}: healthy engine mirrored ${id}`, healthy[id]);
            if (healthy[id].reading !== 'にほんご') fail(`${name}: healthy engine lost detached reading on ${id}`, healthy[id]);
        }

        // Styled framework host: the additive mirror preserves host-owned text,
        // box paint, and icons. Its duplicate base glyphs stay transparent;
        // only detached readings and pitch decoration are painted by Yomu.
        const conceal = await page.evaluate(() => window.runConcealProbe());
        if (!conceal.mirror || conceal.mirrorReading !== 'にほんご') fail(`${name}: styled framework host was not mirrored with a reading`, conceal);
        if (conceal.hostVisibility === 'hidden') fail(`${name}: styled framework host was visibility-hidden (box paint erased)`, conceal);
        if (/rgba\(0, 0, 0, 0\)|transparent/.test(conceal.hostColor) || !conceal.hostColor) fail(`${name}: styled framework host text was concealed`, conceal);
        if (conceal.hostBackground !== 'rgb(31, 41, 55)') fail(`${name}: styled framework host lost its background`, conceal);
        if (conceal.hostBorderWidth === '0px') fail(`${name}: styled framework host lost its border`, conceal);
        if (!/rgba\(0, 0, 0, 0\)|transparent/.test(conceal.wordColor)) fail(`${name}: additive mirror repainted duplicate base text`, conceal);
        if (/rgba\(0, 0, 0, 0\)|transparent/.test(conceal.svgColor) || !conceal.svgColor) fail(`${name}: host icon inherited the transparent text colour`, conceal);

        console.log(`${name}: natural verdict = ${JSON.stringify({ bareMirrored: natural['bare-title'].mirror, pillMirrored: natural.pill.mirror })}, forced + healthy rounds ${process.exitCode ? 'FAILED' : 'passed'}`);
    } finally {
        await browser.close();
    }
}

try {
    await runEngine('chromium', chromium);
    await runEngine('webkit', webkit);
} finally {
    rmSync(tempDir, { recursive: true, force: true });
}
if (process.exitCode) {
    console.error('constrained-row mirror gate smoke FAILED');
} else {
    console.log('constrained-row mirror gate smoke passed');
}
