#!/usr/bin/env node
// (Re)records the Recorded Pages under scripts/fixtures/recorded/ from the
// live sites. Needs the network, and ffmpeg for the YouTube clip.
//
//   node scripts/record-pages.mjs                         # every target
//   node scripts/record-pages.mjs ja-wikipedia-nihongo    # one or more slugs
//   node scripts/record-pages.mjs ja-wikipedia-nihongo --product-traffic-only --product-traffic=v2.1.6
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
 */
async function recordProductTraffic(target, productRef) {
    const product = productRef === 'worktree' ? worktreeProduct() : releaseProduct(productRef);
    const seconds = Number(options['product-seconds'] ?? 25);
    console.log(`[record-pages] ${target.slug}: product traffic of ${product.label} for ${seconds} s (${target.productTrafficHosts.join(', ')})`);
    const browser = await chromium.launch();
    try {
        const run = await openRecordedPage({ browser, slug: target.slug, product, gmNetwork: 'record', recordHosts: target.productTrafficHosts });
        await run.page.waitForTimeout(seconds * 1000);
        rmSync(path.join(RECORDINGS_ROOT, target.slug, 'product-resources'), { recursive: true, force: true });
        const count = run.saveProductTraffic('product-traffic.har');
        await run.close();
        const manifestPath = path.join(RECORDINGS_ROOT, target.slug, 'manifest.json');
        const productTraffic = { har: 'product-traffic.har', product: product.label, seconds, hosts: target.productTrafficHosts, recordedAt: new Date().toISOString() };
        writeJson(manifestPath, { ...readJson(manifestPath), productTraffic }, 2);
        console.log(`[record-pages]   kept ${count} product request(s)`);
    } finally {
        await browser.close();
    }
}
