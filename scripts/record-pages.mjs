#!/usr/bin/env node
// (Re)records the Recorded Pages under scripts/fixtures/recorded/ from the
// live sites. Needs the network, and ffmpeg for the YouTube clip.
//
//   node scripts/record-pages.mjs                         # every target
//   node scripts/record-pages.mjs ja-wikipedia-nihongo    # one or more slugs
//   node scripts/record-pages.mjs ja-wikipedia-nihongo --product-traffic-only --product-traffic=v2.1.6
//       [--product-seconds=25] [--product-runs=20] [--product-settled-runs=4]
//   node scripts/record-pages.mjs piccoma-web --keep-staging   # keep the staging copies to debug a refusal
//   node scripts/record-pages.mjs youtube-watch --captions-from=<dir>   # json3 tracks saved elsewhere (see prepareYouTubeWatch)
//
// For each page: load it live in Chromium, bring it to its reading state,
// pick geometry sample keys and measure the live page, freeze the DOM (no
// site scripts), redact it if the site is copyrighted, then replay what would
// be committed in Chromium, WebKit and Firefox next to the unredacted freeze
// and refuse to write when the redaction moved a sampled block box by more
// than 2 px or a committed file still holds an original text run.
// docs/dev/recorded-pages.md has the rules.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { captureLivePage } from './lib/record-live-page.mjs';
import { createHarWriter } from './lib/recorded-har.mjs';
import { RECORDINGS_ROOT, openRecordedPage, releaseProduct, worktreeProduct } from './lib/recorded-page.mjs';
import { measureFidelity, refuseUnsafeRecording } from './lib/recording-fidelity.mjs';
import { RECORDING_TARGETS, recordingTarget } from './lib/recording-targets.mjs';
import { publishRecording, readJson, writeJson, writeRecording } from './lib/recording-writer.mjs';

const args = process.argv.slice(2);
const options = Object.fromEntries(args.filter(arg => arg.startsWith('--')).map(arg => {
    const [name, value = true] = arg.slice(2).split('=');
    return [name, value];
}));
const slugs = args.filter(arg => !arg.startsWith('--'));
const targets = slugs.length ? slugs.map(recordingTarget) : RECORDING_TARGETS;
const engines = (options.engines ?? 'chromium,webkit,firefox').split(',');
const PRODUCT_RUNS = {
    seconds: Number(options['product-seconds'] ?? 25),
    max: Number(options['product-runs'] ?? 20),
    settled: Number(options['product-settled-runs'] ?? 4),
};

for (const target of targets) {
    if (!options['product-traffic-only']) await recordTarget(target);
    if (options['product-traffic'] && target.productTrafficHosts) await recordProductTraffic(target, options['product-traffic']);
}

async function recordTarget(target) {
    console.log(`\n[record-pages] ${target.slug}: ${decodeURI(target.url)}`);
    const browser = await chromium.launch();
    const live = await captureLivePage(browser, target, { captionsFrom: options['captions-from'] }).finally(() => browser.close());
    const staging = mkdtempSync(path.join(tmpdir(), `yomu-recording-${target.slug}-`));
    const original = mkdtempSync(path.join(tmpdir(), `yomu-recording-${target.slug}-original-`));
    try {
        writeRecording(staging, target, live, { redacted: target.content === 'redacted' });
        writeRecording(original, target, live, { redacted: false });
        const fidelity = await measureFidelity(staging, original, live, { engines, diffSample: options['keep-staging'] ? 40 : 5 });
        const manifestPath = path.join(staging, 'manifest.json');
        writeJson(manifestPath, { ...readJson(manifestPath), fidelity }, 2);
        refuseUnsafeRecording(staging, target, live, fidelity);
        publishRecording(staging, target.slug);
    } finally {
        removeStaging([staging, original]);
    }
}

function removeStaging(dirs) {
    if (options['keep-staging']) {
        console.log(`[record-pages]   staging kept: ${dirs.join(' ')}`);
        return;
    }
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
}

/**
 * The product's own GM traffic on the recorded page, from the live services,
 * for the hosts a target allows (their answers may be committed). Replays then
 * answer the same requests offline.
 *
 * One run is not enough: the product batches its parse requests in whatever
 * order its scan met the page, and a replay of one order answers nothing when
 * the next run takes another (every request goes 'offline', which looks like
 * sparse readings but is an outage). So it runs the product again, each time
 * in a fresh context, merging new requests into one HAR, until settledRuns runs
 * in a row add nothing (or maxRuns; the manifest says whether it settled).
 * After the first run, requests already kept are answered from the HAR as a
 * replay would answer them, so later runs take a replay's timing and the
 * requests only that timing makes reach the network and are kept too.
 */
async function recordProductTraffic(target, productRef) {
    const product = productRef === 'worktree' ? worktreeProduct() : releaseProduct(productRef);
    console.log(`[record-pages] ${target.slug}: product traffic of ${product.label}, ${PRODUCT_RUNS.seconds} s a run (${target.productTrafficHosts.join(', ')})`);
    const recorder = createHarWriter({ creator: 'yomu recorded-page product traffic', unique: true });
    const { runs, settled } = await runProductUntilSettled(target, product, recorder);
    // A rare request left out costs a replay one dropped answer, which the reproduce smoke counts.
    if (!settled) console.warn(`[record-pages]   WARN product traffic still changing after ${runs} runs; replays may drop a rare request (raise --product-runs)`);
    const dir = path.join(RECORDINGS_ROOT, target.slug);
    rmSync(path.join(dir, 'product-resources'), { recursive: true, force: true });
    const count = recorder.write(dir, 'product-traffic.har', 'product-resources');
    const productTraffic = { har: 'product-traffic.har', product: product.label, seconds: PRODUCT_RUNS.seconds, runs, settled, hosts: target.productTrafficHosts, recordedAt: new Date().toISOString() };
    writeJson(path.join(dir, 'manifest.json'), { ...readJson(path.join(dir, 'manifest.json')), productTraffic }, 2);
    console.log(`[record-pages]   kept ${count} product request(s) from ${runs} runs`);
}

async function runProductUntilSettled(target, product, recorder) {
    const browser = await chromium.launch();
    let runs = 0;
    let quiet = 0;
    try {
        for (; runs < PRODUCT_RUNS.max && quiet < PRODUCT_RUNS.settled; runs += 1) {
            const before = recorder.size();
            const run = await openRecordedPage({ browser, slug: target.slug, product, gmNetwork: 'record', recordHosts: target.productTrafficHosts, recorder });
            await run.page.waitForTimeout(PRODUCT_RUNS.seconds * 1000);
            await run.close();
            const added = recorder.size() - before;
            quiet = added ? 0 : quiet + 1;
            console.log(`[record-pages]   run ${runs + 1}: ${added} new request(s), ${recorder.size()} in all`);
        }
    } finally {
        await browser.close();
    }
    return { runs, settled: quiet >= PRODUCT_RUNS.settled };
}
