#!/usr/bin/env node
// NHK "unreadable" framework-mirror overlap repro.
//
// NHK (news.web.nhk) is a React article page: every element carries a fiber
// expando so elementIsFrameworkManaged() is TRUE, but it is NOT a conversation
// surface, so scanHostIsLiveFrameworkRegion() is FALSE. Yomu therefore paints
// such a paragraph DESTRUCTIVELY inline until scanHostIsRepaintLooping() trips
// (REPAINT_LOOP_THRESHOLD=4 re-scans of the SAME host+text within 3s), at which
// point it switches to the absolutely-positioned overlay MIRROR and CONCEALS
// the host's own text.
//
// The user saw bold coloured word fragments DUPLICATED and OFFSET over the
// plain paragraph, furigana on, on a paragraph of inline ▽-prefixed items that
// WRAP across several lines. This probe reproduces the exact React lifecycle:
//   1) build a framework-managed <p> of wrapping ▽ items,
//   2) rescan it repeatedly (the repaint-loop trip → mirror creation),
//   3) then keep REPLACING its text node (React reconcile) on a timer, and
//   4) probe CONTINUOUSLY (mid-churn, not at rest) for:
//        (a) concealFail  — host own text VISIBLE while a mirror is present
//                           (the double image),
//        (b) doubleMirror — two mirrors over the same host,
//        (c) geometryDrift — mirror top/left drifts from host after reflow.
// Real layout, furigana on, Chromium AND WebKit.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CSS_PATH = path.join(ROOT, 'dist', 'yomu.css');
const tempDir = mkdtempSync(path.join(tmpdir(), 'yomu-nhk-mirror-smoke-'));
const entryPath = path.join(tempDir, 'probe.ts');
const bundlePath = path.join(tempDir, 'probe.js');

writeFileSync(entryPath, `
    import {
        applyTokensToScanTarget,
        collectTextTargetsIn,
        removeNonDestructiveScanMirrors,
    } from ${JSON.stringify(path.join(ROOT, 'src/reader/dom/index.ts'))};
    import { DEFAULT_SETTINGS } from ${JSON.stringify(path.join(ROOT, 'src/reader/settings/index.ts'))};
    import type { JPDBCard, JPDBToken } from ${JSON.stringify(path.join(ROOT, 'src/reader/app/types.ts'))};

    const SETTINGS = { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' };

    // A paragraph of inline ▽-prefixed items, like the live NHK "60メートル以上
    // では、▽屋外で行動するのは極めて危険 ▽走行中のトラックは横転 …" list. Long
    // enough to WRAP across several lines in the fixed-width column.
    const TEXT = '60メートル以上では、▽屋外で行動するのは極めて危険 ▽走行中のトラックは横転する ▽多くの樹木や電柱などが倒れる ▽鉄骨で造られた住宅でも倒壊するものがある';

    function card(spelling: string, reading: string): JPDBCard {
        return {
            vid: 1, sid: 1, rid: 0, spelling, reading, frequencyRank: null,
            partOfSpeech: [], meanings: [], cardState: ['new'], pitchAccent: [],
            wordWithReading: null, source: 'jpdb',
        };
    }
    // Coarse tokens with readings across the whole span so ruby is rendered and
    // words are coloured (state 'new'), matching the user's "bold coloured".
    function tokensFor(text: string): JPDBToken[] {
        // A FEW coarse tokens only, so the mirror stays under the 60-element
        // conceal cap and the host takes the concealTextOnly (color:transparent)
        // path — the path where an injected opaque child paints a double image.
        const out: JPDBToken[] = [];
        const re = /[一-龯々]{2,}/gu;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) && out.length < 8) {
            const word = m[0].slice(0, 2);
            out.push({
                card: card(word, word),
                start: m.index, end: m.index + word.length, length: word.length,
                rubies: [{ text: 'か', start: m.index, end: m.index + word.length, length: word.length }],
                pitchClass: 'heiban', sentence: text,
            });
        }
        return out;
    }

    function paint(host: HTMLElement): void {
        const target = collectTextTargetsIn(host, 60, false).find(c => c.text.includes('▽'));
        if (!target) return;
        applyTokensToScanTarget(target, tokensFor(target.text), SETTINGS);
    }

    function mirror(host: HTMLElement): HTMLElement | null {
        return host.querySelector<HTMLElement>('.jpdb-reader-text-mirror');
    }
    function mirrorCount(host: HTMLElement): number {
        return host.querySelectorAll('.jpdb-reader-text-mirror').length;
    }

    // Does the host paint its OWN text visibly (opaque colour, not concealed to
    // transparent, not visibility:hidden), while ALSO carrying a mirror?
    let lastVisibleReason = '';
    function hostOwnTextVisible(host: HTMLElement): boolean {
        lastVisibleReason = '';
        if (safeVisibility(host) === 'hidden') { lastVisibleReason = 'host-hidden'; return false; }
        // Walk the host's native (non-mirror) text nodes; if any has a
        // non-transparent computed fill colour AND non-zero area, it paints.
        const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                if (parent.closest('.jpdb-reader-text-mirror')) return NodeFilter.FILTER_REJECT;
                return (node.textContent ?? '').trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            },
        });
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const parent = (n as Text).parentElement!;
            const cs = getComputedStyle(parent);
            if (safeVisibility(parent) === 'hidden') continue;
            // Text paints iff its EFFECTIVE fill colour is opaque. -webkit-text-
            // fill-color overrides color when set; if unset it falls back to color.
            const fill = cs.webkitTextFillColor && cs.webkitTextFillColor !== 'currentcolor'
                ? cs.webkitTextFillColor : cs.color;
            if (isOpaque(fill)) {
                const range = document.createRange();
                range.selectNode(n);
                const r = range.getBoundingClientRect();
                if (r.width > 1 && r.height > 1) { lastVisibleReason = 'opaque:' + fill + ' ' + parent.tagName; return true; }
            }
        }
        lastVisibleReason = 'none-opaque';
        return false;
    }
    function safeVisibility(el: HTMLElement): string {
        let cur: HTMLElement | null = el;
        while (cur) { if (getComputedStyle(cur).visibility === 'hidden') return 'hidden'; cur = cur.parentElement; }
        return 'visible';
    }
    function isOpaque(color: string): boolean {
        if (!color) return false;
        if (color === 'transparent') return false;
        const m = color.match(/rgba?\\(([^)]+)\\)/);
        if (!m) return color !== 'transparent';
        const parts = m[1].split(',').map(s => parseFloat(s.trim()));
        if (parts.length === 4) return parts[3] > 0.05;
        return true;
    }

    let churnTimer = 0;
    let renderEpoch = 0;
    let worstConcealFail = 0;
    let worstDoubleMirror = 0;
    let worstDrift = 0;
    let samples = 0;
    let sawMirror = false;

    Object.assign(window, {
        setupHost() {
            removeNonDestructiveScanMirrors(document);
            const host = document.getElementById('article-para')!;
            // Tag as framework-managed (fake React fiber expando) on the host and
            // an ancestor — exactly what elementIsFrameworkManaged() detects.
            (host as any)['__reactFiber$abc123'] = { tag: 5 };
            (host.parentElement as any)['__reactProps$abc123'] = {};
            host.textContent = TEXT;
            return { text: TEXT };
        },
        // Trip the repaint loop: rescan the SAME host+text 5 times (threshold 4).
        tripRepaintLoop() {
            const host = document.getElementById('article-para')!;
            for (let i = 0; i < 6; i++) paint(host);
            sawMirror = mirrorCount(host) > 0;
            return { mirrorCount: mirrorCount(host), sawMirror };
        },
        // Simulate React reconcile: replace the host's text node with a fresh
        // Text node of the same string (React re-render), then let Yomu's
        // observer/rescan react. We do NOT call paint() here on purpose for the
        // "no rescan yet" window; a separate driver calls paint() to simulate
        // the throttled stale rescan landing.
        // mode 'text-replace': React replaceChild — remove native content, insert
        //   a fresh single text node (clean re-render; the mirror stays).
        // mode 'react-crash': React inserts a fresh text node but does NOT remove
        //   Yomu's destructive word-spans (they are not in React's fiber tree, so
        //   its removeChild targeted a node that moved) → DUPLICATE native text.
        reactReconcile(mode: string) {
            const host = document.getElementById('article-para')!;
            renderEpoch += 1;
            const mir = mirror(host);
            if (mode === 'text-replace') {
                for (const child of Array.from(host.childNodes)) {
                    if (child instanceof HTMLElement && child.classList.contains('jpdb-reader-text-mirror')) continue;
                    child.remove();
                }
                const fresh = document.createTextNode(TEXT);
                if (mir) host.insertBefore(fresh, mir); else host.appendChild(fresh);
                paint(host);
            } else if (mode === 'react-crash') {
                // Leave whatever destructive spans exist; ALSO insert a fresh
                // opaque native text node at the front (React re-render).
                const fresh = document.createElement('span');
                fresh.style.color = '#222';
                fresh.textContent = TEXT;
                (fresh as any)['__reactFiber$abc123'] = { tag: 6 };
                host.insertBefore(fresh, host.firstChild);
                // No rescan: this is the raw transient before Yomu reacts.
            }
            return { renderEpoch };
        },
        probeOverlap() {
            const host = document.getElementById('article-para')!;
            const mir = mirror(host);
            const hasMirror = Boolean(mir);
            const ownVisible = hostOwnTextVisible(host);
            const concealFail = hasMirror && ownVisible ? 1 : 0;
            const doubleMirror = mirrorCount(host) > 1 ? 1 : 0;
            let drift = 0;
            if (mir) {
                const hr = host.getBoundingClientRect();
                const mr = mir.getBoundingClientRect();
                drift = Math.max(Math.abs(mr.top - hr.top), Math.abs(mr.left - hr.left));
            }
            samples += 1;
            worstConcealFail = Math.max(worstConcealFail, concealFail);
            worstDoubleMirror = Math.max(worstDoubleMirror, doubleMirror);
            worstDrift = Math.max(worstDrift, drift);
            if (hasMirror) sawMirror = true;
            return { hasMirror, ownVisible, concealFail, doubleMirror, mirrorCount: mirrorCount(host), drift, reason: lastVisibleReason, children: host.childElementCount };
        },
        summary() {
            return { samples, sawMirror, worstConcealFail, worstDoubleMirror, worstDrift };
        },
        hostMode() {
            const host = document.getElementById('article-para')!;
            const mir = mirror(host);
            const allWords = host.querySelectorAll('.jpdb-reader-word').length;
            const mirrorWords = mir ? mir.querySelectorAll('.jpdb-reader-word').length : 0;
            return {
                inlineVisibility: host.style.getPropertyValue('visibility'),
                inlineColor: host.style.getPropertyValue('color'),
                childCount: host.querySelectorAll('*').length,
                totalWords: allWords,
                mirrorWords,
                // Destructive word-spans OUTSIDE the mirror = leftover inline paint
                // that was never torn down when the mirror took over.
                strayDestructiveWords: allWords - mirrorWords,
            };
        },
        diagFirstChild() {
            const host = document.getElementById('article-para')!;
            const first = host.firstElementChild as HTMLElement | null;
            if (!first || first.classList.contains('jpdb-reader-text-mirror')) return { none: true, tag: first?.tagName };
            const cs = getComputedStyle(first);
            const hostCs = getComputedStyle(host);
            const range = document.createRange(); range.selectNodeContents(first);
            const r = range.getBoundingClientRect();
            return {
                tag: first.tagName,
                inlineColor: first.style.color,
                inlineFill: first.style.getPropertyValue('-webkit-text-fill-color'),
                computedColor: cs.color,
                computedFill: cs.webkitTextFillColor,
                hostColor: hostCs.color,
                hostFill: hostCs.webkitTextFillColor,
                rectW: r.width, rectH: r.height,
                inConcealSet: 'unknown',
            };
        },
    });
`);

await esbuild.build({ entryPoints: [entryPath], bundle: true, outfile: bundlePath, format: 'iife', platform: 'browser', logLevel: 'silent' });

const FIXTURE = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
  body { font: 17px/1.7 "Hiragino Kaku Gothic ProN", sans-serif; margin: 0; }
  #app { width: 340px; margin: 40px auto; }
  #article-para { margin: 0; padding: 0; color: #222; }
</style></head><body>
  <div id="app"><article><p id="article-para"></p></article></div>
</body></html>`;

const RESULTS = [];
function log(name, obj) { console.log(`[${name}]`, JSON.stringify(obj)); }

async function runEngine(name, browserType) {
    const browser = await browserType.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
        await page.route('https://nhk-mirror.example/**', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FIXTURE }));
        await page.goto('https://nhk-mirror.example/', { waitUntil: 'domcontentloaded' });
        await page.addStyleTag({ content: readFileSync(CSS_PATH, 'utf8') });
        await page.addScriptTag({ path: bundlePath });

        log(`${name} setup`, await page.evaluate(() => window.setupHost()));
        // Trip the mirror via repeated clean re-renders (repaint loop: 4 same
        // host+text within 3s). Between renders, no rescan removes the mirror.
        for (let i = 0; i < 6; i++) await page.evaluate(() => window.reactReconcile('text-replace'));
        log(`${name} tripped`, await page.evaluate(() => window.probeOverlap()));
        log(`${name} hostMode`, await page.evaluate(() => window.hostMode()));

        for (let cycle = 0; cycle < 40; cycle++) {
            // Every 3rd cycle: a react-crash reconcile (fresh opaque native text
            // inserted, Yomu's spans left, NO rescan yet) — the transient the
            // user photographed. Other cycles: a clean re-render (mirror kept).
            const mode = cycle % 3 === 0 ? 'react-crash' : 'text-replace';
            await page.evaluate(m => window.reactReconcile(m), mode);
            // Probe the instant AFTER reconcile, before the observer's async
            // stale timer / rescan — this is the transient overlap window.
            log(`${name} probe#${cycle}`, await page.evaluate(() => window.probeOverlap()));
            if (mode === 'react-crash' && cycle === 0) log(`${name} diag#${cycle}`, await page.evaluate(() => window.diagFirstChild()));
            // Reflow: shrink/grow the column so wrapping changes under the mirror.
            if (cycle % 5 === 0) {
                await page.evaluate(w => { document.getElementById('app').style.width = w; }, cycle % 10 === 0 ? '260px' : '340px');
                log(`${name} reflow-probe#${cycle}`, await page.evaluate(() => window.probeOverlap()));
            }
            await page.waitForTimeout(40); // let observer microtasks + timers run
            log(`${name} settle-probe#${cycle}`, await page.evaluate(() => window.probeOverlap()));
        }
        // Scroll churn.
        await page.mouse.wheel(0, 300);
        await page.waitForTimeout(50);
        log(`${name} scroll-probe`, await page.evaluate(() => window.probeOverlap()));

        const summary = await page.evaluate(() => window.summary());
        log(`${name} SUMMARY`, summary);
        RESULTS.push({ name, ...summary });

        // Screenshot final state for visual inspection (opt-in via env).
        if (process.env.NHK_MIRROR_SHOT) await page.screenshot({ path: path.join(ROOT, `nhk-mirror-${name}.png`) });
    } finally {
        await browser.close();
    }
}

let failed = false;
try {
    await runEngine('chromium', chromium);
    await runEngine('webkit', webkit);
} finally {
    rmSync(tempDir, { recursive: true, force: true });
}

for (const r of RESULTS) {
    if (!r.sawMirror) { console.error(`FAIL: ${r.name} never created a mirror (repaint loop did not trip)`); failed = true; }
    if (r.worstConcealFail) { console.error(`FAIL: ${r.name} concealment failed — host own text visible with a mirror present (DOUBLE IMAGE)`); failed = true; }
    if (r.worstDoubleMirror) { console.error(`FAIL: ${r.name} two mirrors over the same host`); failed = true; }
    if (r.worstDrift > 2) { console.error(`FAIL: ${r.name} mirror geometry drift ${r.worstDrift.toFixed(1)}px after reflow`); failed = true; }
}
if (failed) { console.error('nhk-framework-mirror-overlap smoke FAILED (repro)'); process.exit(1); }
console.log('nhk-framework-mirror-overlap smoke passed (no overlap)');
