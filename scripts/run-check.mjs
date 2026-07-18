#!/usr/bin/env node
// Parallel `npm run check` orchestrator. The old chain ran 8 stages back to back;
// the stage graph actually has three independent lanes that only join at verify:
//
//   lane typecheck: tsc --noEmit
//   lane tests:     test:ci  ->  test:academy       (serialized: both fork-heavy)
//   lane build:     build -> sync-docs-userscript -> build:academy* -> docs:build
//   join:           verify
//
// *build:academy here skips academy:lessons:validate because the tests lane runs
// the full academy suite (a strict superset) in the same check. Standalone
// `npm run build:academy` keeps its gate.
//
// Wall clock becomes max(lanes) instead of sum(stages). The tests lane keeps
// vitest fork counts at cores-2 (see run-ci-tests.mjs / vitest configs), leaving
// headroom for the build lane; suites never run concurrently with each other,
// which is what historically OOM-killed workers (exit 137).
//
// YOMU_CHECK_RELEASE=1 (set by check:release) forces byte-level hashing and full
// academy re-sync in every stage that supports caching.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LOG_DIR = join(ROOT, 'artifacts', 'check-logs');
mkdirSync(LOG_DIR, { recursive: true });
const startedAt = Date.now();
const timings = [];

function stage(name, command) {
    return { name, command };
}

function runStage({ name, command }) {
    const start = Date.now();
    console.log(`[check] start ${name}`);
    return new Promise((resolve, reject) => {
        const child = spawn('sh', ['-c', command], { cwd: ROOT, env: process.env });
        const output = [];
        child.stdout.on('data', chunk => output.push(chunk));
        child.stderr.on('data', chunk => output.push(chunk));
        child.on('error', reject);
        child.on('exit', code => {
            const seconds = (Date.now() - start) / 1000;
            timings.push({ name, seconds });
            // Full per-stage output always lands on disk, pass or fail, so a
            // green run's test/build logs stay inspectable.
            writeFileSync(join(LOG_DIR, `${name.replace(/[^a-z0-9:-]+/gi, '_')}.log`), Buffer.concat(output));
            if (code === 0) {
                console.log(`[check] pass  ${name} (${seconds.toFixed(1)}s)`);
                resolve();
            } else {
                // Print the failing stage's FULL output — never truncate failures.
                process.stderr.write(`\n[check] FAIL ${name} (exit ${code}, ${seconds.toFixed(1)}s) — full output:\n`);
                process.stderr.write(Buffer.concat(output));
                reject(new Error(`${name} failed with exit ${code}`));
            }
        });
    });
}

async function lane(...stages) {
    for (const s of stages) await runStage(s);
}

const lanes = [
    lane(stage('typecheck', 'npm run -s typecheck')),
    lane(
        stage('test:ci', 'npm run -s test:ci'),
        stage('test:academy', 'npm run -s test:academy'),
    ),
    lane(
        stage('build', 'npm run -s build'),
        stage('sync-docs-userscript', 'node scripts/sync-docs-userscript.cjs'),
    ),
];

const results = await Promise.allSettled(lanes);
const failures = results.filter(r => r.status === 'rejected');
if (failures.length) {
    for (const f of failures) console.error(`[check] ${f.reason.message}`);
    printSummary(false);
    process.exit(1);
}

// The tail stays serial and AFTER both test suites: sync-academy destructively
// rm+cp's docs/public/academy, which ~70 academy test files read — running it in
// a lane concurrent with test:academy is a guaranteed race on the release path.
try {
    await runStage(stage('build:academy (prevalidated)', 'npm run -s build:academy:prevalidated'));
    await runStage(stage('docs:build', 'npm run -s docs:build'));
    await runStage(stage('verify', 'npm run -s verify'));
} catch {
    printSummary(false);
    process.exit(1);
}
printSummary(true);

function printSummary(passed) {
    const total = (Date.now() - startedAt) / 1000;
    console.log('\n[check] stage timings:');
    for (const t of timings.sort((a, b) => b.seconds - a.seconds)) {
        console.log(`  ${t.seconds.toFixed(1).padStart(7)}s  ${t.name}`);
    }
    console.log(`[check] ${passed ? 'PASS' : 'FAIL'} in ${total.toFixed(1)}s (wall clock)`);
}
