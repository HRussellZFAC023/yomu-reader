#!/usr/bin/env node
// Nightly aggregate smoke runner.
//
// Extended browser coverage, outside the local gate and release preflight.
// Layout hosts also run in PR CI when deleted jsdom geometry tests rely on them.
// Built products run on recorded pages or labelled mechanism fixtures, without
// signed-in live sites. See .github/workflows/nightly.yml.
//
// Contract: run each script sequentially with a per-script timeout, print a
// summary table, continue past failures, and exit non-zero if any failed.
//
// Usage:
//   node scripts/run-nightly-smokes.mjs            # run all
//   node scripts/run-nightly-smokes.mjs smoke:anki # run a subset (by npm name)
//   NIGHTLY_SMOKE_TIMEOUT_MS=600000 node scripts/run-nightly-smokes.mjs

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Canonical hosts only. Merged aliases must not restart the same browser suite.
export const NIGHTLY_SMOKES = [
    'docs:locales:browser',
    'smoke:anki',
    'smoke:anki-known-interval',
    'smoke:anki-template',
    'smoke:annotation-power',
    'smoke:annotation-scroll',
    'smoke:annotation-typography',
    'smoke:background-network',
    'smoke:bookwalker-modes-ocr',
    'smoke:chip-mirror',
    'smoke:css-has-invalidation',
    'smoke:definition-sources',
    'smoke:drag-handle',
    'smoke:enrichment-concurrency',
    'smoke:feedback',
    'smoke:furigana-local-default',
    'smoke:furigana-tapband',
    'smoke:google-search-reader',
    'smoke:grading-provider',
    'smoke:hosted-settings',
    'smoke:ignored-words',
    'smoke:ja-docs-perf',
    'smoke:late-content',
    'smoke:layout-neutral-scan',
    'smoke:local-dictionary-upgrade',
    'smoke:long-page-perf',
    'smoke:lookup-perf',
    'smoke:mobile-docs',
    'smoke:ocr-honesty',
    'smoke:ocr-line-register',
    'smoke:ocr-provider-matrix',
    'smoke:ocr-upload-failure',
    'smoke:page-ruby-metrics',
    'smoke:parser-glyph-identity',
    'smoke:pdf-reader',
    'smoke:piccoma-host-armour',
    'smoke:popover-headword-furigana',
    'smoke:popup-lifecycle',
    'smoke:popup-word-detail',
    'smoke:prose-portal',
    'smoke:recorded-pages',
    'smoke:recorded-pages:probes',
    'smoke:recorded-pages:reproduce',
    'smoke:reddit-chrome',
    'smoke:review-services',
    'smoke:study-personas',
    'smoke:subtitle-network',
    'smoke:tatoeba-contract',
    'smoke:transcript-drawer',
    'smoke:trusted-form-submit-order',
    'smoke:userscript-csp',
    'smoke:youtube-controls-wake',
    'smoke:youtube-dom-safe',
    'smoke:youtube-ruby-proof',
];

// One timeout covers a whole merged host, including both engines and its
// extended matrix. Release selects its separate minimal scenarios.
const TIMEOUT_MS = Number(process.env.NIGHTLY_SMOKE_TIMEOUT_MS || 600000);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runOne(name) {
    return new Promise((resolve) => {
        const start = Date.now();
        const child = spawn('npm', ['run', name], {
            cwd: repoRoot,
            stdio: 'inherit',
            detached: true,
            env: {
                ...process.env,
                // Worktrees can live directly below /tmp, where the generic
                // workspace fallback points outside the writable checkout.
                // Keep nightly evidence inside this repository unless the
                // caller explicitly chooses a shared workspace root.
                YOMU_WORKSPACE_ROOT: process.env.YOMU_WORKSPACE_ROOT || repoRoot,
                YOMU_PLAYWRIGHT_CHANNEL: process.env.YOMU_PLAYWRIGHT_CHANNEL || 'chrome',
            },
        });
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
        }, TIMEOUT_MS);
        child.on('close', (code) => {
            clearTimeout(timer);
            const secs = ((Date.now() - start) / 1000).toFixed(1);
            resolve({ name, ok: !timedOut && code === 0, secs, status: timedOut ? 'TIMEOUT' : (code === 0 ? 'PASS' : `FAIL(${code})`) });
        });
    });
}

const only = process.argv.slice(2);
const unknown = only.filter(name => !NIGHTLY_SMOKES.includes(name));
if (unknown.length) throw new Error(`Unknown nightly smoke script(s): ${unknown.join(', ')}`);
const toRun = only.length ? NIGHTLY_SMOKES.filter((n) => only.includes(n)) : NIGHTLY_SMOKES;

console.log(`\n=== nightly smokes: running ${toRun.length} guard(s), ${TIMEOUT_MS / 1000}s timeout each ===\n`);

const results = [];
for (const name of toRun) {
    console.log(`\n----- ${name} -----`);
    results.push(await runOne(name));
}

console.log('\n=== nightly smoke summary ===');
const namePad = Math.max(...results.map((r) => r.name.length));
for (const r of results) {
    console.log(`${r.status.padEnd(10)} ${r.secs.padStart(8)}s  ${r.name.padEnd(namePad)}`);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed.`);
if (failed.length) {
    console.log(`Failed: ${failed.map((r) => r.name).join(', ')}`);
    process.exit(1);
}
