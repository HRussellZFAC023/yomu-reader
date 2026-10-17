// Is a staged recording safe and faithful enough to commit? Replays it next to
// the unredacted freeze in each engine (and, in Chromium, against the live page
// it came from), then refuses a redacted page that still holds an original
// text run or whose sampled block boxes moved more than the tolerance.
import path from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import { captureGeometrySignature, compareGeometrySignatures } from './geometry-signature.mjs';
import { STORED_LINES } from './record-live-page.mjs';
import { openRecordedPage } from './recorded-page.mjs';
import { findRedactionLeaks, hashTextRun } from './recorded-redaction.mjs';
import { keepUsedResources, readJson, writeJson } from './recording-writer.mjs';

const FIDELITY_TOLERANCE_PX = 2;
const ENGINES = { chromium, webkit, firefox };
// The gate is the acceptance rule: sampled block boxes and scroll extents. Line
// boxes are reported, not gated: replaced text ends its lines a few pixels apart.
const BLOCKS_ONLY = { tolerancePx: FIDELITY_TOLERANCE_PX, ignore: ['paragraphs'] };
const LINES_ONLY = { tolerancePx: FIDELITY_TOLERANCE_PX, ignore: ['document', 'blocks', 'paged'] };

export async function measureFidelity(staging, original, live, { engines, diffSample = 5 }) {
    const fidelity = {};
    const geometry = readJson(path.join(staging, 'geometry.json'));
    const used = new Set();
    for (const engine of engines) {
        const result = await engineFidelity(engine, staging, original, live, diffSample);
        if (!result) continue;
        fidelity[engine] = result.summary;
        geometry.replay[engine] = result.signature;
        result.used.forEach(url => used.add(url));
    }
    writeJson(path.join(staging, 'geometry.json'), geometry);
    keepUsedResources(staging, used);
    return fidelity;
}

async function engineFidelity(engine, staging, original, live, diffSample) {
    const browser = await ENGINES[engine].launch().catch(error => {
        console.warn(`[record-pages]   ${engine}: not available (${error.message.split('\n')[0]})`);
        return null;
    });
    if (!browser) return null;
    try {
        const replayed = await replaySignature(browser, staging, live.keys);
        const unredacted = await replaySignature(browser, original, live.keys);
        const redaction = compareGeometrySignatures(unredacted.signature, replayed.signature, BLOCKS_ONLY);
        const lines = compareGeometrySignatures(unredacted.signature, replayed.signature, LINES_ONLY);
        const summary = {
            redactionMaxDeltaPx: redaction.maxDelta,
            redactionDiffs: redaction.diffs.length,
            paragraphsWithMovedLines: lines.diffs.length,
            unrecordedRequests: replayed.unrecorded,
            ...(engine === 'chromium' ? liveFidelity(live, replayed.signature) : {}),
            diffSample: redaction.diffs.slice(0, diffSample),
        };
        console.log(`[record-pages]   ${engine}: redaction moved block boxes by ${redaction.maxDelta} px (${redaction.diffs.length} over ${FIDELITY_TOLERANCE_PX} px), lines moved in ${lines.diffs.length} paragraph(s); ${replayed.unrecorded} unrecorded request(s)`);
        return { summary, signature: replayed.signature, used: replayed.used };
    } finally {
        await browser.close();
    }
}

// A block the freeze or a host fixture removed (YouTube's own caption window is
// rebuilt by the player fixture) is not the redaction's doing; the
// redacted-against-unredacted comparison still catches anything missing there.
function liveFidelity(live, signature) {
    const replayed = new Set(signature.blocks.filter(block => !block.missing).map(block => block.key));
    const comparable = { ...live.liveSignature, blocks: live.liveSignature.blocks.filter(block => replayed.has(block.key)) };
    // Scroll extents of a script-driven app (YouTube) differ once its scripts are gone;
    // the acceptance rule is about sampled block boxes.
    const versusLive = compareGeometrySignatures(comparable, signature, { tolerancePx: FIDELITY_TOLERANCE_PX, ignore: ['paragraphs', 'document', 'paged'] });
    return { liveMaxDeltaPx: versusLive.maxDelta, liveDiffs: versusLive.diffs.length, liveDiffSample: versusLive.diffs.slice(0, 3) };
}

async function replaySignature(browser, dir, keys) {
    const run = await openRecordedPage({ browser, slug: dir, product: null, hostOptions: { autoplay: false, captions: false } });
    try {
        await run.page.waitForTimeout(1500);
        const signature = await captureGeometrySignature(run.page, { keys, maxLines: STORED_LINES });
        const entries = run.ledger.entries();
        return {
            signature,
            used: entries.filter(entry => entry.served === 'recording').map(entry => entry.url),
            unrecorded: entries.filter(entry => entry.served === 'offline').length,
        };
    } finally {
        await run.close();
    }
}

/**
 * Throws instead of letting a redacted recording out with an original text
 * run in any file, or with a sampled block box moved past the tolerance in
 * Chromium — where the live page was rendered and the redactor matched glyph
 * widths. WebKit and Firefox shape the same text a little differently; their
 * numbers stay in the manifest.
 */
export function refuseUnsafeRecording(dir, target, live, fidelity) {
    if (target.content !== 'redacted') return;
    refuseLeaks(dir, target, live);
    const chromiumResult = fidelity.chromium;
    if (!chromiumResult) throw new Error(`[record-pages] refusing to write ${target.slug}: fidelity needs a Chromium replay.`);
    const worst = Math.max(chromiumResult.redactionMaxDeltaPx, chromiumResult.liveMaxDeltaPx);
    if (worst > FIDELITY_TOLERANCE_PX) throw new Error(`[record-pages] refusing to write ${target.slug}: a sampled block box moved by ${worst} px in Chromium (limit ${FIDELITY_TOLERANCE_PX}). ${JSON.stringify([...chromiumResult.diffSample, ...chromiumResult.liveDiffSample])}`);
}

function refuseLeaks(dir, target, live) {
    const leaks = findRedactionLeaks(dir, live.redacted.hashList);
    if (!leaks.length) return;
    // Shown on this console only, so whoever records can see what slipped through.
    const leaked = new Set(leaks.map(leak => leak.hash));
    const examples = live.originalRuns.filter(run => leaked.has(hashTextRun(run))).slice(0, 3).map(run => JSON.stringify(run.slice(0, 60)));
    throw new Error(`[record-pages] refusing to write ${target.slug}: ${leaks.length} original text run(s) survived redaction (first in ${leaks[0].file}): ${examples.join(', ')}`);
}
