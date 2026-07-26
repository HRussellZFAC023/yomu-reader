#!/usr/bin/env node
// Parallel `npm run check` orchestrator. The old chain ran 8 stages back to back;
// the stage graph actually has three independent lanes that only join at verify:
//
//   lane typecheck: tsc --noEmit
//   lane tests:     test:ci
//   lane build:     build -> sync-docs-userscript
//   serial tail:    build:academy* -> test:academy -> docs:build
//   join:           verify
//
// *build:academy here skips academy:lessons:validate because the full Academy
// suite (a strict superset) runs against that deterministic build. Standalone
// `npm run build:academy` keeps its gate.
//
// Wall clock becomes max(lanes) instead of sum(stages). The tests lane keeps
// vitest fork counts at cores-2 (see run-ci-tests.mjs / vitest configs), leaving
// headroom for the build lane; suites never run concurrently with each other,
// which is what historically OOM-killed workers (exit 137).
//
// YOMU_CHECK_RELEASE=1 (set by check:release) forces byte-level hashing and full
// academy re-sync in every stage that supports caching.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vitestOutputIndicatesFailure } from './lib/check-log-guard.mjs';
import { GENERATED_ARTIFACT_PATHS } from './lib/generated-artifacts.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LOG_DIR = join(ROOT, 'artifacts', 'check-logs');
mkdirSync(LOG_DIR, { recursive: true });
const startedAt = Date.now();
const timings = [];

// Whether the tree matched HEAD when the gate started, captured before any
// stage can rebuild anything. This is what makes the artifact-drift guard at
// the end meaningful: on a clean tree the build lane regenerating a tracked
// file can only mean the committed copy was stale.
const startedClean = workingTreeIsClean();

function stage(name, command, options = {}) {
    return { name, command, ...options };
}

// Test stages keep a log-content backstop: if a future child prints a Vitest
// failure summary but still exits 0, the gate must fail anyway. The 2026-07-18
// report was traced to zsh pipeline status outside this process, not an
// in-repo swallow path. Never turns a failure into a pass.
function testStage(name, command) {
    return stage(name, command, { guardTestLog: true });
}

function runStage({ name, command, guardTestLog = false }) {
    const start = Date.now();
    console.log(`[check] start ${name}`);
    return new Promise((resolve, reject) => {
        const child = spawn('sh', ['-c', command], { cwd: ROOT, env: process.env });
        const output = [];
        child.stdout.on('data', chunk => output.push(chunk));
        child.stderr.on('data', chunk => output.push(chunk));
        child.on('error', reject);
        // 'close' (not 'exit') so stdio is fully drained before the log is
        // written and scanned — 'exit' can fire with output still in flight.
        child.on('close', (code, signal) => {
            const seconds = (Date.now() - start) / 1000;
            timings.push({ name, seconds });
            // Full per-stage output always lands on disk, pass or fail, so a
            // green run's test/build logs stay inspectable.
            writeFileSync(join(LOG_DIR, `${name.replace(/[^a-z0-9:-]+/gi, '_')}.log`), Buffer.concat(output));
            if (code === 0 && signal == null && guardTestLog) {
                const swallowed = vitestOutputIndicatesFailure(Buffer.concat(output).toString('utf8'));
                if (swallowed) {
                    process.stderr.write(`\n[check] FAIL ${name} (exit 0 but ${swallowed}, ${seconds.toFixed(1)}s) — full output:\n`);
                    process.stderr.write(Buffer.concat(output));
                    reject(new Error(`${name} exited 0 but ${swallowed}`));
                    return;
                }
            }
            if (code === 0 && signal == null) {
                console.log(`[check] pass  ${name} (${seconds.toFixed(1)}s)`);
                resolve();
            } else {
                // Print the failing stage's FULL output — never truncate failures.
                const cause = signal ? `signal ${signal}` : `exit ${code}`;
                process.stderr.write(`\n[check] FAIL ${name} (${cause}, ${seconds.toFixed(1)}s) — full output:\n`);
                process.stderr.write(Buffer.concat(output));
                reject(new Error(`${name} failed with ${cause}`));
            }
        });
    });
}

async function lane(...stages) {
    for (const s of stages) await runStage(s);
}

// Both of these read the repository as it is, so they run before the build lane
// can regenerate anything. check:artifacts reads committed bytes out of git and
// so is immune to stage order; running it first just fails fast.
try {
    await runStage(stage('repository-hygiene', 'npm run -s check:repository'));
    await runStage(stage('committed-artifacts', 'npm run -s check:artifacts'));
} catch {
    printSummary(false);
    process.exit(1);
}

// Release-path academy scope (owner rule): the release gate runs
// build:academy:prevalidated below, NOT the full academy test suite. The
// suite depends on local-only corpora (yomu-academy:moodle-raw-manifest
// lives outside the repository), so on a CI tag build it can never pass —
// including it failed every Release workflow since v1.6.241 and silently
// stopped GitHub release publishing while Deploy Docs kept shipping.
// Local `npm run check` keeps the full suite.
const releaseCheck = process.env.YOMU_CHECK_RELEASE === '1';

const lanes = [
    lane(stage('typecheck', 'npm run -s typecheck')),
    lane(testStage('test:ci', 'npm run -s test:ci')),
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

// The tail stays serial after the parallel lanes. Academy provenance tests read
// dist/academy/app.js and the synced hosted bytes, so build those exact artifacts
// before the suite; sync-academy must never race the tests that inspect them.
try {
    await runStage(stage('build:academy (prevalidated)', 'npm run -s build:academy:prevalidated'));
    if (!releaseCheck) await runStage(testStage('test:academy', 'npm run -s test:academy'));
    await runStage(stage('docs:build', 'npm run -s docs:build'));
    await runStage(stage('verify', 'npm run -s verify'));
} catch {
    printSummary(false);
    process.exit(1);
}

if (!reportArtifactDrift()) {
    printSummary(false);
    process.exit(1);
}
printSummary(true);

// The gate rebuilds and re-syncs the artifacts it then verifies, so `verify`
// only ever compares freshly written bytes with freshly written bytes. What it
// cannot see -- and what this reports -- is the gate quietly rewriting tracked
// build output on its way through, which means the committed copy was stale.
//
// On a clean tree that is a hard failure: nothing but a stale artifact can
// explain it. On a dirty tree it is expected (you changed something the build
// output depends on), so it prints the exact paths to stage instead. Directory
// paths matter there: a new content-addressed companion is a NEW file, and
// `git add -u` would ship a userscript pinning a URL that 404s.
function reportArtifactDrift() {
    const drifted = dirtyArtifactPaths();
    if (drifted.length === 0) return true;
    const list = drifted.map(path => `  ${path}`).join('\n');
    if (!startedClean) {
        console.log(`\n[check] this run regenerated tracked build output:\n${list}`);
        console.log(`[check] stage it with your change: git add -f -- ${GENERATED_ARTIFACT_PATHS.join(' ')}`);
        return true;
    }
    console.error(`\n[check] FAIL artifact-drift — the tree was clean, but this run rewrote tracked build output:\n${list}`);
    console.error('[check] HEAD ships stale artifacts. Commit the regenerated files above.');
    return false;
}

function dirtyArtifactPaths() {
    try {
        return execFileSync('git', ['status', '--porcelain', '--', ...GENERATED_ARTIFACT_PATHS], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
            .split('\n')
            .filter(Boolean)
            .map(line => line.slice(3).trim());
    } catch {
        return [];
    }
}

function workingTreeIsClean() {
    try {
        return execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim() === '';
    } catch {
        // No git (or no repository) means there is no committed baseline to
        // compare against; the drift guard stays quiet rather than guessing.
        return false;
    }
}

function printSummary(passed) {
    const total = (Date.now() - startedAt) / 1000;
    console.log('\n[check] stage timings:');
    for (const t of timings.sort((a, b) => b.seconds - a.seconds)) {
        console.log(`  ${t.seconds.toFixed(1).padStart(7)}s  ${t.name}`);
    }
    console.log(`[check] ${passed ? 'PASS' : 'FAIL'} in ${total.toFixed(1)}s (wall clock)`);
}
