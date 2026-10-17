#!/usr/bin/env node
// Recorded Pages harness self-test.
//
//   replay      every recording replays in Chromium, WebKit and Firefox and lays
//               out as it did when it was recorded (geometry signature, 2 px);
//               a redacted page's sampled block boxes are within 2 px of the
//               live page it was recorded from (Chromium, same platform).
//   reproduce   the harness sees the failures 2.1.6 shipped with, driving the
//               2.1.6 build read out of git: Google Lens uploads before any
//               interaction and sparse readings on ja.wikipedia 日本語, and
//               YouTube's own caption flashing in the gaps between cues. 2.1.6
//               never changes, so these stay true; a gate built on this harness
//               that cannot see them could not see anything.
//
//   node scripts/recorded-pages-smoke.mjs [replay|reproduce] [--engines=chromium,webkit]
//   node scripts/recorded-pages-smoke.mjs reproduce --product=worktree   # numbers for this build, no assertions
import { chromium, firefox, webkit } from 'playwright';
import { captureGeometrySignature, compareGeometrySignatures } from './lib/geometry-signature.mjs';
import { startMainThreadSampler } from './lib/main-thread-sampler.mjs';
import { captionFlashFrames, kanjiReadingCoverage, readCaptionFrames, startCaptionFrameLog } from './lib/recorded-page-probes.mjs';
import { listRecordings, loadRecording, openAnsweredRecordedPage, openRecordedPage, releaseProduct, worktreeProduct } from './lib/recorded-page.mjs';

const TOLERANCE_PX = 2;
const STORED_LINES = 24;
// 2.1.6's scan order changes from load to load, and with it its coverage
// (7.5% to 19.4% of runs on 日本語); the median of three answered loads is judged.
const COVERAGE_LOADS = 3;
// A load whose scan order the recording does not hold is discarded and loaded again.
const LOAD_ATTEMPTS = 4;
const ENGINES = { chromium, webkit, firefox };
const args = process.argv.slice(2);
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1];
const cases = args.filter(arg => !arg.startsWith('--'));
const runCase = name => !cases.length || cases.includes(name);
const engines = (option('engines') ?? 'chromium,webkit,firefox').split(',');
const productRef = option('product') ?? 'v2.1.6';
const failures = [];

const check = (condition, message) => {
    console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
    if (!condition) failures.push(message);
};

if (runCase('replay')) {
    for (const engine of engines) await replayEveryRecording(engine);
}
if (runCase('reproduce')) await reproduceShippedFailures();

if (failures.length) {
    console.error(`\n[recorded-pages] ${failures.length} failure(s)`);
    process.exit(1);
}
console.log('\n[recorded-pages] all checks passed');

async function replayEveryRecording(engine) {
    const browser = await ENGINES[engine].launch();
    try {
        for (const slug of listRecordings()) await replayRecording(browser, engine, slug);
    } finally {
        await browser.close();
    }
}

async function replayRecording(browser, engine, slug) {
    const recording = loadRecording(slug);
    const geometry = recording.geometry();
    const run = await openRecordedPage({ browser, slug, product: null, hostOptions: { autoplay: false, captions: false } });
    try {
        await run.page.waitForTimeout(1500);
        const signature = await captureGeometrySignature(run.page, { keys: geometry.keys, maxLines: STORED_LINES });
        const stored = recording.manifest.recorder.platform === process.platform ? geometry.replay[engine] : null;
        if (stored) checkReplayGeometry(engine, recording, geometry, stored, signature);
        else check(signature.blocks.some(block => !block.missing), `${engine} ${slug}: replays (geometry recorded on ${recording.manifest.recorder.platform}, not compared here)`);
    } finally {
        await run.close();
    }
}

function checkReplayGeometry(engine, recording, geometry, stored, signature) {
    const replay = compareGeometrySignatures(stored, signature, { tolerancePx: TOLERANCE_PX });
    check(replay.ok, `${engine} ${recording.slug}: replays as recorded (max ${replay.maxDelta} px)${replay.ok ? '' : ` ${JSON.stringify(replay.diffs.slice(0, 2))}`}`);
    if (engine !== 'chromium' || recording.manifest.content !== 'redacted') return;
    const live = compareGeometrySignatures(geometry.live, signature, { tolerancePx: TOLERANCE_PX, ignore: ['paragraphs', 'document', 'paged'] });
    check(live.ok, `chromium ${recording.slug}: redacted block boxes within ${TOLERANCE_PX} px of the live page (max ${live.maxDelta} px)`);
}

async function reproduceShippedFailures() {
    const product = productRef === 'worktree' ? worktreeProduct() : releaseProduct(productRef);
    // Only 2.1.6's failures are known; another build's numbers are printed, not judged.
    const report = (condition, message) => (productRef === 'v2.1.6' ? check(condition, message) : console.log(`INFO ${message}`));
    const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    try {
        await reproduceOnWikipedia(browser, product, report);
        await reproduceCaptionFlash(browser, product, report);
    } finally {
        await browser.close();
    }
}

async function reproduceOnWikipedia(browser, product, report) {
    const loads = [];
    for (let load = 0; load < COVERAGE_LOADS; load += 1) loads.push(await wikipediaLoad(browser, product, report, load === 0));
    if (loads.includes(null)) return;
    const median = [...loads].sort((left, right) => left.ratio - right.ratio)[Math.floor(loads.length / 2)];
    const all = loads.map(coverage => `${coverage.covered}/${coverage.kanjiRuns}`).join(', ');
    report(median.ratio < 0.2, `${product.label} ja-wikipedia-nihongo: median ${median.covered}/${median.kanjiRuns} visible kanji runs under a painted reading after 15 s over ${loads.length} loads (${all}; 2.1.6: under 20%; ${median.painted}/${median.kanjiWords} of the product's kanji words painted, ${median.dataReadingOnly} with data-reading only)`);
}

// One 15 s load the recorded jiten traffic answered: its coverage. The first
// load also measures main-thread cost, Lens uploads and the ledger's
// trusted-interaction flag. null when no load in LOAD_ATTEMPTS was answered.
async function wikipediaLoad(browser, product, report, first) {
    const { run, sampler } = await answeredWikipediaLoad(browser, product, report, first);
    if (!run) return null;
    try {
        if (first) await reportFirstLoadCost(run, product, report, sampler);
        const coverage = await kanjiReadingCoverage(run.page, { root: '#mw-content-text' });
        // Sparse readings must come from the product, not from a replay that answered nothing.
        report(coverage.painted >= 1, `${product.label} ja-wikipedia-nihongo: the recorded jiten traffic answered the product ${JSON.stringify(run.productTraffic().served)}, ${coverage.painted} kanji word(s) painted`);
        if (first) await checkTrustedInteraction(run);
        return coverage;
    } finally {
        await run.close();
    }
}

async function answeredWikipediaLoad(browser, product, report, first) {
    const onOpen = run => (first ? startMainThreadSampler(run.page, { engine: 'chromium', spin: false }) : null);
    const { run, context: sampler, discarded } = await openAnsweredRecordedPage({ browser, slug: 'ja-wikipedia-nihongo', product }, { settleMs: 15_000, attempts: LOAD_ATTEMPTS, onOpen });
    if (discarded) console.log(`INFO ${product.label} ja-wikipedia-nihongo: ${discarded} load(s) took a scan order the recorded jiten traffic does not hold and were loaded again`);
    if (!run) report(false, `${product.label} ja-wikipedia-nihongo: none of ${LOAD_ATTEMPTS} loads was answered by the recorded jiten traffic; record it again (docs/dev/recorded-pages.md, Limits of a replay)`);
    return { run, sampler };
}

// Main-thread cost over the first 15 s, and Lens uploads before any interaction.
async function reportFirstLoadCost(run, product, report, sampler) {
    logMainThreadCost(product, await sampler.stop());
    reportLensUploads(run, product, report);
}

function logMainThreadCost(product, cost) {
    console.log(`INFO ${product.label} ja-wikipedia-nihongo: main thread ${cost.cdp.taskMsPerSec} ms/s of tasks over the first 15 s (style ${cost.cdp.recalcStyleMsPerSec}, layout ${cost.cdp.layoutMsPerSec})`);
}

function reportLensUploads(run, product, report) {
    const lens = run.ledger.requests({ host: 'lensfrontend-pa.googleapis.com', method: 'POST', beforeInteraction: true });
    report(lens.length >= 1, `${product.label} ja-wikipedia-nihongo: ${lens.length} Lens upload(s) before any interaction (2.1.6 uploads page images)`);
}

// The ledger marks a request from either channel as after a trusted
// interaction only once a real key press has happened.
async function checkTrustedInteraction(run) {
    const sendProbes = tag => run.page.evaluate(url => {
        fetch(`${url}-page`).catch(() => undefined);
        window.GM_xmlhttpRequest?.({ url: `${url}-gm`, onload() {}, onerror() {} });
    }, `https://ledger-probe.invalid/${tag}`);
    await sendProbes('before');
    await run.page.waitForTimeout(200);
    await run.page.keyboard.press('Shift');
    await sendProbes('after');
    await run.page.waitForTimeout(500);
    const probes = run.ledger.requests({ host: 'ledger-probe.invalid' });
    const flags = Object.fromEntries(probes.map(entry => [new URL(entry.url).pathname.slice(1), entry.trustedInteractionBefore && entry.lastInteraction?.type]));
    const expected = { 'before-page': false, 'before-gm': false, 'after-page': 'keydown', 'after-gm': 'keydown' };
    check(JSON.stringify(flags, Object.keys(expected)) === JSON.stringify(expected), `ledger: a real key press makes later page and GM requests count as after a trusted interaction, naming it ${JSON.stringify(flags)}`);
}

async function reproduceCaptionFlash(browser, product, report) {
    const run = await openRecordedPage({ browser, slug: 'youtube-watch', product, hostOptions: { captions: true } });
    try {
        await startCaptionFrameLog(run.page);
        // 2.1.6 commits its first line about 8 s in, and flashes for a frame or two in some gaps: 45 s sees several.
        await run.page.waitForTimeout(45_000);
        const flash = captionFlashFrames(await readCaptionFrames(run.page));
        const committedAt = flash.firstCommitAt === null ? 'never' : `${flash.firstCommitAt.toFixed(2)} s`;
        const timings = run.recording.manifest.host.captionTimings ?? 'recorded';
        report(flash.flashFrames.length >= 1, `${product.label} youtube-watch: YouTube's caption painted in ${flash.flashFrames.length} of ${flash.gapFrames} inter-cue gap frame(s) after the first commit at ${committedAt} (2.1.6 flashes; caption timings ${timings})`);
    } finally {
        await run.close();
    }
}
