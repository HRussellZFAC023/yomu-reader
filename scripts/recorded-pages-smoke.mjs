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
import { listRecordings, loadRecording, openRecordedPage, releaseProduct, worktreeProduct } from './lib/recorded-page.mjs';

const TOLERANCE_PX = 2;
// YouTube refused the recording machine's caption requests (docs/dev/recorded-pages.md,
// Follow-ups). Until youtube-watch lands the caption case warns; after this date
// it fails, so the gate the W1 caption items rely on cannot stay missing unnoticed.
const YOUTUBE_WATCH_DUE = '2026-10-31';
const STORED_LINES = 24;
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
        if (listRecordings().includes('youtube-watch')) await reproduceCaptionFlash(browser, product, report);
        else missingYouTubeWatch();
    } finally {
        await browser.close();
    }
}

function missingYouTubeWatch() {
    const message = `youtube-watch is not recorded, so 2.1.6's caption flash is not reproduced (due ${YOUTUBE_WATCH_DUE}): node scripts/record-pages.mjs youtube-watch`;
    if (new Date().toISOString().slice(0, 10) > YOUTUBE_WATCH_DUE) check(false, message);
    else console.log(`${process.env.GITHUB_ACTIONS ? '::warning::' : 'WARN '}${message}`);
}

async function reproduceOnWikipedia(browser, product, report) {
    const run = await openRecordedPage({ browser, slug: 'ja-wikipedia-nihongo', product });
    try {
        const sampler = await startMainThreadSampler(run.page, { engine: 'chromium', spin: false });
        await run.page.waitForTimeout(15_000);
        const cost = await sampler.stop();
        console.log(`INFO ${product.label} ja-wikipedia-nihongo: main thread ${cost.cdp.taskMsPerSec} ms/s of tasks over the first 15 s (style ${cost.cdp.recalcStyleMsPerSec}, layout ${cost.cdp.layoutMsPerSec})`);
        const lens = run.ledger.requests({ host: 'lensfrontend-pa.googleapis.com', method: 'POST', beforeInteraction: true });
        report(lens.length >= 1, `${product.label} ja-wikipedia-nihongo: ${lens.length} Lens upload(s) before any interaction (2.1.6 uploads page images)`);
        const coverage = await kanjiReadingCoverage(run.page, { root: '#mw-content-text' });
        const jiten = servedCounts(run.ledger.requests({ host: 'jiten.moe', channel: 'gm' }));
        // Sparse readings must come from the product, not from a replay that answered nothing.
        report((jiten.offline ?? 0) <= 2 && coverage.painted >= 1, `${product.label} ja-wikipedia-nihongo: the recorded jiten traffic answered the product ${JSON.stringify(jiten)}, ${coverage.painted} kanji word(s) painted`);
        report(coverage.ratio < 0.2, `${product.label} ja-wikipedia-nihongo: ${coverage.covered}/${coverage.kanjiRuns} visible kanji runs under a painted reading after 15 s (2.1.6: under 20%; ${coverage.painted}/${coverage.kanjiWords} of the product's kanji words painted, ${coverage.dataReadingOnly} with data-reading only)`);
        await checkTrustedInteraction(run);
    } finally {
        await run.close();
    }
}

function servedCounts(entries) {
    const counts = {};
    for (const entry of entries) counts[entry.served] = (counts[entry.served] ?? 0) + 1;
    return counts;
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
    const flags = Object.fromEntries(probes.map(entry => [new URL(entry.url).pathname.slice(1), entry.trustedInteractionBefore]));
    const expected = { 'before-page': false, 'before-gm': false, 'after-page': true, 'after-gm': true };
    check(JSON.stringify(flags, Object.keys(expected)) === JSON.stringify(expected), `ledger: a real key press makes later page and GM requests count as after a trusted interaction ${JSON.stringify(flags)}`);
}

async function reproduceCaptionFlash(browser, product, report) {
    const run = await openRecordedPage({ browser, slug: 'youtube-watch', product, hostOptions: { captions: true } });
    try {
        await startCaptionFrameLog(run.page);
        await run.page.waitForTimeout(30_000);
        const flash = captionFlashFrames(await readCaptionFrames(run.page));
        const committedAt = flash.firstCommitAt === null ? 'never' : `${flash.firstCommitAt.toFixed(2)} s`;
        report(flash.flashFrames.length >= 1, `${product.label} youtube-watch: YouTube's caption painted in ${flash.flashFrames.length} of ${flash.gapFrames} inter-cue gap frame(s) after the first commit at ${committedAt} (2.1.6 flashes)`);
    } finally {
        await run.close();
    }
}
