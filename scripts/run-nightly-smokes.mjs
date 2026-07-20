#!/usr/bin/env node
// Nightly aggregate smoke runner (NB-50).
//
// Runs every headless-capable regression-guard smoke that is NOT already gated
// by ci.yml / check / smoke:release / smoke:p0 / smoke:layout-regressions.
// These guards each reproduce a historical bug against the built userscript in
// a fixture-served headless browser (no signed-in real sites, no display
// server). They run once nightly (see .github/workflows/nightly.yml) rather
// than on every push so the fast CI gate stays fast.
//
// Contract: run each script sequentially with a per-script timeout, print a
// summary table, continue past failures, and exit non-zero if any failed.
//
// Usage:
//   node scripts/run-nightly-smokes.mjs            # run all
//   node scripts/run-nightly-smokes.mjs smoke:anki # run a subset (by npm name)
//   NIGHTLY_SMOKE_TIMEOUT_MS=240000 node scripts/run-nightly-smokes.mjs

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The (a) set: headless-capable regression guards. Kept in sync with the NB-50
// triage table in docs/nuclear-backlog-2026-07-16.md. Each name is an npm
// script of the form `node scripts/<name>.mjs`.
export const NIGHTLY_SMOKES = [
    'smoke:anki',
    'smoke:anki-template',
    'smoke:bookwalker-cty2-scroll',
    'smoke:bookwalker-tap-passthrough',
    'smoke:bookwalker-tap-retry',
    'smoke:bookwalker-modes-ocr',
    'smoke:definition-sources',
    'smoke:enrichment-concurrency',
    'smoke:grading-provider',
    'smoke:hosted-settings',
    'smoke:jiten-keyless-definition',
    'smoke:late-content',
    'smoke:local-dictionary-upgrade',
    'smoke:mobile-docs',
    'smoke:ocr-provider-matrix',
    'smoke:onboarding-popover',
    'smoke:pitch-underline',
    'smoke:popover-headword-furigana',
    'smoke:study-personas',
    'smoke:subtitle-network',
    'smoke:transcript-drawer',
    'smoke:youtube-dom-safe',
];

const TIMEOUT_MS = Number(process.env.NIGHTLY_SMOKE_TIMEOUT_MS || 240000);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runOne(name) {
    return new Promise((resolve) => {
        const start = Date.now();
        const child = spawn('npm', ['run', name], {
            cwd: repoRoot,
            stdio: 'inherit',
            detached: true,
            env: { ...process.env, YOMU_PLAYWRIGHT_CHANNEL: process.env.YOMU_PLAYWRIGHT_CHANNEL || 'chrome' },
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
