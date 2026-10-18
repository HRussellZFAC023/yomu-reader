#!/usr/bin/env node
// Long pages annotate without freezing: the built product on the recorded
// Aozora Bunko 『こころ』 page (the whole novel is one div), fresh install,
// default settings.
//
//   Chromium  the 30 s after the page's load event hold at most 3 s of long
//             tasks and no task over 200 ms; hovering a word 12 s in opens
//             the popover within 300 ms with no long task over 200 ms; the
//             text in view is annotated.
//   WebKit    has no Long Tasks API, so both engines are also timed by a turn
//             sampler (main-thread gaps over 50 ms) from DOMContentLoaded,
//             when Yomu starts, to 30 s after load: WebKit fires load before
//             Yomu's start-up task and Chromium after it. WebKit's gaps total
//             at most twice Chromium's.
//
// 2.1.6 annotated the whole novel in the first minute and spent 19-24 s of the
// first 30 s in long tasks, with single tasks over 3 s.
//
//   node scripts/long-page-annotation-perf-smoke.mjs
//   node scripts/long-page-annotation-perf-smoke.mjs --product=v2.1.6     # the failures 2.1.6 shipped with
//   node scripts/long-page-annotation-perf-smoke.mjs --engines=chromium --network=live
//
// --network: 'replay' (default) answers what the recording holds; this page
// has no recorded product traffic, so dictionary requests fail like a dropped
// connection and the product tokenizes locally. The main-thread cost under
// test is the scan and its paint, which runs either way. 'live' asks the real
// services (a canary; readings then arrive too).
import { chromium, webkit } from 'playwright';
import { openRecordedPage, releaseProduct, worktreeProduct } from './lib/recorded-page.mjs';

const SLUG = 'aozora-kokoro';
const WINDOW_MS = 30_000;
const HOVER_AT_MS = 12_000;
const LONG_TASK_TOTAL_BUDGET_MS = 3_000;
const LONG_TASK_MAX_MS = 200;
const HOVER_BUDGET_MS = 300;
const WEBKIT_GAP_RATIO = 2;
const VISIBLE_COVERAGE_MIN = 0.9;
// Words in the first screen that every build since 2.1.6 can look up offline
// (a word whose lookup needs a dictionary service would time a failure).
const HOVER_WORDS = ['先生', '友達', '鎌倉'];
const ENGINES = { chromium, webkit };

const args = process.argv.slice(2);
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1];
const engines = (option('engines') ?? 'chromium,webkit').split(',');
const productRef = option('product') ?? 'worktree';
const gmNetwork = option('network') ?? 'replay';
const product = productRef === 'worktree' ? worktreeProduct() : productRef.startsWith('/') ? worktreeProduct(productRef) : releaseProduct(productRef);
const productLabel = productRef.startsWith('/') ? productRef : product.label;
const failures = [];
const check = (condition, message) => {
    console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
    if (!condition) failures.push(message);
};

const results = {};
for (const engine of engines) results[engine] = await measure(engine);
console.log(JSON.stringify({ product: productLabel, network: gmNetwork, results }, null, 2));
judge(results);

if (failures.length) {
    console.error(`\n[long-page-perf] ${failures.length} failure(s) on ${productLabel}`);
    process.exit(1);
}
console.log(`\n[long-page-perf] ${productLabel} passed`);

function judge({ chromium: blink, webkit: wk }) {
    const label = `${productLabel} ${SLUG}`;
    if (blink) {
        check(blink.longTaskTotalMs <= LONG_TASK_TOTAL_BUDGET_MS, `${label} chromium: ${blink.longTaskTotalMs} ms of long tasks in the ${WINDOW_MS / 1000} s after load (budget ${LONG_TASK_TOTAL_BUDGET_MS} ms)`);
        check(blink.longestTaskMs <= LONG_TASK_MAX_MS, `${label} chromium: longest task after load ${blink.longestTaskMs} ms (budget ${LONG_TASK_MAX_MS} ms)`);
        check(blink.hover.opened && blink.hover.ms <= HOVER_BUDGET_MS, `${label} chromium: hovering ${blink.hover.word ?? 'a word'} opened the popover in ${blink.hover.ms} ms (budget ${HOVER_BUDGET_MS} ms)`);
        check(blink.hover.longestTaskMs <= LONG_TASK_MAX_MS, `${label} chromium: longest task while hovering ${blink.hover.longestTaskMs} ms (budget ${LONG_TASK_MAX_MS} ms)`);
    }
    for (const [engine, result] of Object.entries({ chromium: blink, webkit: wk })) {
        if (!result) continue;
        check(result.coverage.ratio >= VISIBLE_COVERAGE_MIN, `${label} ${engine}: ${result.coverage.covered}/${result.coverage.characters} Japanese characters in view sit in a word (at least ${VISIBLE_COVERAGE_MIN * 100}%)`);
    }
    if (blink && wk) {
        check(wk.gapTotalMs <= WEBKIT_GAP_RATIO * blink.gapTotalMs, `${label}: WebKit main-thread gaps ${wk.gapTotalMs} ms, within ${WEBKIT_GAP_RATIO}x Chromium's ${blink.gapTotalMs} ms`);
    }
}

async function measure(engine) {
    const browser = await ENGINES[engine].launch();
    const run = await openRecordedPage({ browser, slug: SLUG, product, gmNetwork, navigate: false });
    try {
        await run.page.addInitScript(mainThreadProbe);
        await run.page.goto(run.recording.manifest.url, { waitUntil: 'load' });
        const { loadAt, startedAt } = await run.page.evaluate(() => {
            const navigation = performance.getEntriesByType('navigation')[0];
            return { loadAt: navigation.loadEventStart, startedAt: navigation.domContentLoadedEventStart };
        });
        await waitUntilPageTime(run.page, loadAt + HOVER_AT_MS);
        const hover = await hoverVisibleWord(run.page);
        await waitUntilPageTime(run.page, loadAt + WINDOW_MS);
        const { longTasks, gaps } = await run.page.evaluate(() => window.__yomuLongPageProbe);
        const inWindow = ([start]) => start >= loadAt && start < loadAt + WINDOW_MS;
        const during = ([start, duration]) => start < hover.endedAt && start + duration > hover.startedAt;
        const total = entries => Math.round(entries.reduce((sum, [, duration]) => sum + duration, 0));
        const longest = entries => Math.round(entries.reduce((max, [, duration]) => Math.max(max, duration), 0));
        const windowTasks = longTasks.filter(inWindow);
        const windowGaps = gaps.filter(([start]) => start >= startedAt && start < loadAt + WINDOW_MS);
        return {
            longTaskTotalMs: total(windowTasks),
            longTaskCount: windowTasks.length,
            longestTaskMs: longest(windowTasks),
            beforeLoad: { longTaskTotalMs: total(longTasks.filter(([start]) => start < loadAt)), longestTaskMs: longest(longTasks.filter(([start]) => start < loadAt)) },
            gapTotalMs: total(windowGaps),
            longestGapMs: longest(windowGaps),
            hover: { word: hover.word, opened: hover.opened, ms: hover.ms, longestTaskMs: longest(longTasks.filter(during)) },
            coverage: await run.page.evaluate(visibleWordCoverage),
            pageErrors: run.pageErrors.slice(0, 3),
        };
    } finally {
        await run.close();
        await browser.close();
    }
}

async function waitUntilPageTime(page, time) {
    const now = await page.evaluate(() => performance.now());
    if (time > now) await page.waitForTimeout(time - now);
}

// A learner's pointer: it travels onto a word in view and stops there.
async function hoverVisibleWord(page) {
    const target = await page.evaluate(preferred => {
        const inView = rect => rect.top > 120 && rect.bottom < innerHeight - 120 && rect.width > 8;
        const words = [...document.querySelectorAll('.main_text .jpdb-reader-word')]
            .filter(word => /\p{Script=Han}/u.test(word.textContent) && inView(word.getBoundingClientRect()));
        const word = preferred.map(text => words.find(candidate => candidate.textContent === text)).find(Boolean)
            ?? words[Math.floor(words.length / 2)];
        if (!word) return null;
        const rect = word.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, word: word.textContent };
    }, HOVER_WORDS);
    if (!target) return { opened: false, ms: Number.POSITIVE_INFINITY, startedAt: 0, endedAt: 0 };
    await page.mouse.move(target.x - 240, target.y + 40);
    await page.mouse.move(target.x, target.y, { steps: 6 });
    const startedAt = await page.evaluate(() => performance.now());
    const endedAt = await page.waitForFunction(() => {
        const popover = document.querySelector('.jpdb-reader-popover');
        if (!popover || popover.getBoundingClientRect().height <= 20) return false;
        const style = getComputedStyle(popover);
        return style.visibility !== 'hidden' && style.display !== 'none' ? performance.now() : false;
    }, undefined, { polling: 'raf', timeout: 5_000 }).then(handle => handle.jsonValue(), () => null);
    return {
        word: target.word,
        opened: endedAt !== null,
        ms: endedAt === null ? Number.POSITIVE_INFINITY : Math.round(endedAt - startedAt),
        startedAt,
        endedAt: endedAt ?? startedAt + 5_000,
    };
}

// Runs in the page from document start: Long Tasks where the engine has them,
// and a turn sampler everywhere (a task chain that notes every gap over 50 ms
// between its turns).
function mainThreadProbe() {
    const probe = { longTasks: [], gaps: [] };
    window.__yomuLongPageProbe = probe;
    try {
        new PerformanceObserver(list => {
            for (const entry of list.getEntries()) probe.longTasks.push([entry.startTime, entry.duration]);
        }).observe({ type: 'longtask', buffered: true });
    } catch {
        // WebKit: the turn sampler below stands in.
    }
    let last = performance.now();
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
        const now = performance.now();
        if (now - last > 50) probe.gaps.push([last, now - last]);
        last = now;
        setTimeout(() => channel.port2.postMessage(0), 0);
    };
    channel.port2.postMessage(0);
}

// Japanese characters in the novel's text that meet the viewport, and how many
// of them sit inside a product word.
function visibleWordCoverage() {
    const root = document.querySelector('.main_text') ?? document.body;
    const range = document.createRange();
    const meetsViewport = rect => rect.bottom >= 0 && rect.top <= innerHeight && rect.right >= 0 && rect.left <= innerWidth;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let characters = 0;
    let covered = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.parentElement.closest('rt, rp, .jpdb-reader-detached-furi, [data-jpdb-reader-root]')) continue;
        const japanese = node.data.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu)?.length ?? 0;
        if (!japanese) continue;
        range.selectNodeContents(node);
        if (!meetsViewport(range.getBoundingClientRect())) continue;
        characters += japanese;
        if (node.parentElement.closest('.jpdb-reader-word')) covered += japanese;
    }
    return { characters, covered, ratio: characters ? covered / characters : 0 };
}
