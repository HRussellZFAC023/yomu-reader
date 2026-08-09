#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { availableParallelism, loadavg } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boundedSizeBalancedBatches, firstNonzeroStatus } from './lib/ci-test-batches.mjs';
import { formatDuration, readPositiveInt } from './lib/ci-utils.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const READER_TESTS_DIR = join(ROOT, 'tests/reader');
// The jpdb suite runs on its own CI matrix (serial, its own API-port range) so it
// is sharded separately from every other reader test. Everything under this dir
// is the jpdb lane; everything else is "regular".
const JPDB_TESTS_DIR = join(ROOT, 'tests/reader/jpdb');

// These tests cannot safely share a fork yet. The leading group still uses
// vi.mock against shared reader modules; the remainder depend on indexedDB absence,
// ReaderApp internals, or large fixtures whose state leaked in the fork-reuse
// hunt. settings-form.test.ts was later split into eight real files, so keep all
// eight in the equivalent isolated pass until repeated isolate:false runs prove
// a narrower boundary.
const ISOLATED_PASS_FILES = [
    // MEASURED 2026-08-02: these two expand the 2.6 MB published dictionary
    // catalogue into JS objects and peak at 1,676 MB and 1,032 MB resident ON
    // THEIR OWN, against a 2,304 MB --max-old-space-size cap. They are here to
    // keep the two largest allocations out of a fork that other files also share.
    //
    // This REDUCES the pressure; it does not remove it. The reusable pass runs
    // isolate:false, so a fork accumulates heap across every file it handles. On
    // 2026-08-03 the 485-file/4-worker pass reported 484 files green while one
    // worker died at the V8 heap limit. Earlier runs lost different files at the
    // same boundary, proving that quarantining whichever file happened to be last
    // only chases the victim. runAllTests now bounds each reusable Vitest process
    // and restarts its forks between batches instead of raising the heap cap.
    //
    // If a bounded batch still dies, scripts/run-ci-suite.mjs remains the
    // backstop that reports the runtime death instead of calling it a test red.
    join(ROOT, 'tests/reader/dictionary-catalog-browse.test.ts'),
    join(ROOT, 'tests/reader/catalog-browse-search-and-locale.test.ts'),
    // Selects the active learning target through mocked modules, so it must not
    // share a host with the reader pass that reads the real registry.
    join(ROOT, 'tests/reader/languages/learning-target-selection.test.ts'),
    // Builds a live overlay and asserts a reading reaches it. Passes alone; inherits
    // overlay/document state from earlier files in the fork-reuse pass.
    join(ROOT, 'tests/reader/late-enrichment-projection.test.ts'),
    // These overlay lifecycle suites pass alone but inherit enough document and
    // observer state in the reusable pass to exhaust their fake-timer callbacks.
    join(ROOT, 'tests/reader/detached-reading-overlay.test.ts'),
    join(ROOT, 'tests/reader/page-activity-parking.test.ts'),
    join(ROOT, 'tests/reader/reader-boot.test.ts'),
    join(ROOT, 'tests/reader/academy-account-settings.test.ts'),
    // The late bridge test owns storage-bridge globals and is deterministic
    // alone, but can inherit stale state in the fork-reuse pass.
    join(ROOT, 'tests/reader/newtab-runtime-onboarding.test.ts'),
    // Dynamic storage mocks retain dependent module graphs after doUnmock;
    // a reused fork can otherwise hand the next file a stale epoch closure.
    join(ROOT, 'tests/reader/managed-indexeddb-atomicity.test.ts'),
    join(ROOT, 'tests/reader/reader-boot-storage-barrier.test.ts'),
    join(ROOT, 'tests/reader/scan-reveal-continuation.test.ts'),
    join(ROOT, 'tests/reader/settings-dialog-controller.test.ts'),
    join(ROOT, 'tests/reader/cloud-sync-web.test.ts'),
    join(ROOT, 'tests/reader/jisho-audio.test.ts'),
    join(ROOT, 'tests/reader/runtime-health.test.ts'),
    join(ROOT, 'tests/reader/origin-graph-interactions.test.ts'),
    join(ROOT, 'tests/reader/kanji-origin-client.test.ts'),
    join(ROOT, 'tests/reader/anki.test.ts'),
    join(ROOT, 'tests/reader/reader-shortcuts.test.ts'),
    join(ROOT, 'tests/reader/public-vocabulary-repaint.test.ts'),
    join(ROOT, 'tests/reader/bridge-fetch-fallback.test.ts'),
    join(ROOT, 'tests/reader/mirror-text-fidelity.test.ts'),
    join(ROOT, 'tests/reader/startup-hosted-language.test.ts'),
    join(ROOT, 'tests/reader/settings-form/01-help-panel.test.ts'),
    join(ROOT, 'tests/reader/settings-form/02-recommended-dictionaries.test.ts'),
    join(ROOT, 'tests/reader/settings-form/03-source-display-names.test.ts'),
    join(ROOT, 'tests/reader/settings-form/04-frequency-preferences.test.ts'),
    join(ROOT, 'tests/reader/settings-form/05-localization-layout-scan.test.ts'),
    join(ROOT, 'tests/reader/settings-form/06-localization-reader-controls.test.ts'),
    join(ROOT, 'tests/reader/settings-form/07-localization-mining-japanese.test.ts'),
    join(ROOT, 'tests/reader/settings-form/08-anki-connect-diagnosis.test.ts'),
    // A40. "keeps the settings tab you were on when a snapshot restore
    // re-renders" passes alone AND as a whole file, and failed inside the shared
    // pass on this commit and its parent — the signature this list exists for.
    // The file imports the gaming renderer ONCE in beforeAll and shares one app
    // instance, one #app element and one localStorage across eleven tests, so it
    // inherits whatever a neighbour leaves in the document. Isolating it costs
    // one fork; an intermittently red release costs a release nobody can
    // schedule, and a minor tag is what reaches the frozen stores.
    join(ROOT, 'tests/reader/gaming-first-run.test.ts'),
    // Exercises ReaderApp reconciliation under fake timers and the shared
    // reader fixture. It deterministically leaves the next reused-fork file
    // unable to advance real timers, so isolate the producer rather than
    // whichever unrelated async consumer happens to follow it.
    join(ROOT, 'tests/reader/late-card-reconciliation.test.ts'),
    // MEASURED 2026-08-03: all 99 hover cases pass, but their cumulative
    // ReaderApp/mock lifecycle leaves a reused fork's next RAF-owning suite in
    // a stale state. `hover-lookup -> projection-sibling-realign` reproduces
    // deterministically: projection case 1 passes, then cases 2-6 time out.
    // Either half of the hover file followed by projection passes, so isolate
    // this measured producer instead of quarantining the projection consumer.
    join(ROOT, 'tests/reader/hover-lookup.test.ts'),
    // Imports fake IndexedDB and Yomitan at module scope. In an isolate:false
    // host, the cached Yomitan module can resolve nextTask's timer against an
    // earlier jsdom realm after that realm is torn down, so the final import
    // yield never settles. The same three cases pass alone and in a fresh realm.
    // Production keeps one page/background realm, so isolate this harness
    // boundary instead of changing the runtime yield or its timeout.
    join(ROOT, 'tests/reader/yomitan-exact-candidate-lookup.test.ts'),
];

const args = parseArgs(process.argv.slice(2));
const kind = args.kind ?? 'regular';
const shard = readPositiveInt(args.shard ?? process.env.CI_TEST_SHARD ?? '1', 'shard');
const total = readPositiveInt(args.total ?? process.env.CI_TEST_TOTAL ?? '1', 'total');
const apiPort = args['no-api']
    ? undefined
    : readPositiveInt(args['api-port'] ?? process.env.YOMU_VITEST_API_PORT ?? defaultApiPort(kind, shard), 'Vitest API port');
// kind=all orchestrates the ENTIRE reader suite; the historical 540s default
// was a PER-SHARD budget across 12 processes, so each bounded batch retains the
// larger ceiling. An explicit env/flag always wins.
const kindForTimeout = args.kind ?? 'regular';
const defaultTimeoutMs = kindForTimeout === 'all' ? '1500000' : '540000';
const testTimeoutMs = readPositiveInt(args['timeout-ms'] ?? process.env.YOMU_CI_TEST_TIMEOUT_MS ?? defaultTimeoutMs, 'YOMU_CI_TEST_TIMEOUT_MS');
if (shard > total) throw new Error(`shard ${shard} cannot be greater than total ${total}`);

// Tests are now plain files sharded by Vitest scheduling; there is nothing to
// pre-generate, so --prepare (kept for the legacy run-ci-suite sharded path) is a
// no-op. --reuse is likewise ignored.
if (args['validate-isolated-pass']) {
    const files = allReaderTestFiles();
    validateIsolatedPass(files);
    console.log(`[ci-tests] Reader isolated-pass conformance passed (${files.length} files, ${ISOLATED_PASS_FILES.length} isolated).`);
}
else if (kind === 'regular' && args.prepare) { /* no-op: real files need no generation */ }
else if (kind === 'regular') runRegularShard(shard, total);
else if (kind === 'jpdb' && args.prepare) { /* no-op */ }
else if (kind === 'jpdb') runJpdbShard(shard, total);
else if (kind === 'all') runAllTests();
else throw new Error(`Unknown CI test kind: ${kind}`);

// Run the reusable majority through bounded isolate:false hosts, then the small
// incompatible set through a per-file-isolated host. Restarting after each
// reusable batch caps cumulative jsdom/module heap while every reusable file
// still shares a fork with peers. Reader tests are real files; scheduling the
// files inside each batch is left to Vitest.
function runAllTests() {
    const allFiles = allReaderTestFiles();
    validateIsolatedPass(allFiles);
    const isolated = new Set(ISOLATED_PASS_FILES);
    const reusableFiles = allFiles.filter(file => !isolated.has(file));
    const maxWorkers = readPositiveInt(
        process.env.YOMU_CI_MAX_WORKERS ?? String(Math.max(2, spareParallelism() - 2)),
        'YOMU_CI_MAX_WORKERS',
    );
    // 60 is a memory budget, and here is the measurement behind it. Sampling fork
    // RSS every 2s across full passes of the same 486 files, before batching existed:
    //
    //   3 forks  ~162 files each  peak 2,626 MB  = 114% of the 2,304 MB cap  -> aborted
    //   6 forks   ~81 files each  peak 2,086 MB  =  91% of the cap           -> clean
    //
    // Those fit a ~1,540 MB fixed baseline per fork — module graph, jsdom, the reader
    // bundle, none of it reclaimable — plus ~6.7 MB retained per file, because a
    // reused isolate:false fork never gives it back. So 60 files lands near 1,940 MB,
    // about 84% of the cap, and the restart between batches is what stops it
    // compounding. Raising this walks back toward the abort: 80 files is ~91%, and
    // 162 is where it died. Do not answer a future abort by raising
    // YOMU_VITEST_FORK_HEAP_MB either — that hides the next casualty, not the cause.
    const reusableFilesPerWorker = readPositiveInt(
        process.env.YOMU_CI_REUSABLE_FILES_PER_WORKER ?? '60',
        'YOMU_CI_REUSABLE_FILES_PER_WORKER',
    );
    const reusableBatches = boundedSizeBalancedBatches(
        reusableFiles,
        maxWorkers * reusableFilesPerWorker,
        fileSize,
    );
    const statuses = [];
    for (const [index, files] of reusableBatches.entries()) {
        const batchWorkers = Math.min(maxWorkers, files.length);
        const context = {
            label: `reader fork-reuse batch ${index + 1}/${reusableBatches.length} (${files.length} files, ${batchWorkers} workers)`,
            files,
            apiPort: apiPortAtOffset(index),
        };
        const result = spawnVitest(
            ['run', ...files.map(file => relative(ROOT, file)), '--minWorkers=1', `--maxWorkers=${batchWorkers}`],
            { VITEST_ISOLATE: '0' },
            context,
        );
        statuses.push(vitestResultStatus(result, context));
    }
    const isolatedContext = {
        label: `reader isolated pass (${ISOLATED_PASS_FILES.length} files)`,
        files: ISOLATED_PASS_FILES,
        apiPort: apiPortAtOffset(reusableBatches.length),
    };
    const isolatedResult = spawnVitest(
        ['run', ...ISOLATED_PASS_FILES.map(file => relative(ROOT, file)), '--minWorkers=1', '--maxWorkers=2'],
        { VITEST_ISOLATE: '1' },
        isolatedContext,
    );
    statuses.push(vitestResultStatus(isolatedResult, isolatedContext));
    process.exit(firstNonzeroStatus(statuses));
}

function runRegularShard(currentShard, shardTotal) {
    const filesForShard = sizeBalancedBuckets(regularShardSourceFiles(), shardTotal, fileSize)[currentShard - 1] ?? [];
    const maxWorkers = readPositiveInt(process.env.YOMU_CI_REGULAR_MAX_WORKERS ?? String(defaultRegularMaxWorkers()), 'YOMU_CI_REGULAR_MAX_WORKERS');
    runVitest(
        ['run', ...filesForShard.map(file => relative(ROOT, file)), '--minWorkers=1', `--maxWorkers=${maxWorkers}`],
        { VITEST_ISOLATE: '1' },
        { label: `regular shard ${currentShard}/${shardTotal}`, files: filesForShard },
    );
}

// jpdb tests share a mock API server + fake-indexeddb, so each shard runs its
// files serially (its own API port avoids cross-shard collisions).
function runJpdbShard(currentShard, shardTotal) {
    const filesForShard = sizeBalancedBuckets(jpdbShardSourceFiles(), shardTotal, fileSize)[currentShard - 1] ?? [];
    runVitest(
        ['run', ...filesForShard.map(file => relative(ROOT, file)), '--minWorkers=1', '--maxWorkers=1', '--no-file-parallelism'],
        { VITEST_ISOLATE: '1' },
        { label: `JPDB shard ${currentShard}/${shardTotal}`, files: filesForShard },
    );
}

// Each regular shard runs its own Vitest process with this many forks. The suite
// launches several shards concurrently (see run-ci-suite.mjs), so the aggregate
// fork count is roughly shardConcurrency * maxWorkers. Sizing workers to
// cores / concurrency keeps that aggregate at or under the core count instead of
// oversubscribing memory-heavy jsdom forks, which is what pushes a slow CI runner
// into thrash and a suite-child timeout under load. Clamp to [2, 4] so a small
// box still gets intra-shard parallelism and a large box does not over-fan a
// setup-bound suite. An explicit YOMU_CI_REGULAR_MAX_WORKERS always wins.
/**
 * Cores this machine can actually spare right now, not cores it has.
 *
 * Worker counts were sized from `availableParallelism()` alone, which is correct on a
 * dedicated CI box and wrong here: this repository is routinely gated while several
 * agent sessions compile and test in their own worktrees on the same cores. The
 * sizing comment below already predicted the failure — "a suite-child timeout under
 * load" — it just had no way to see the load.
 *
 * Measured 2026-07-31 with three agent sessions running: `test:ci` blew the runner's
 * 25-minute wall clock (exit 124) after 2,582 s with ZERO test failures, individual
 * files stretched 3-6x (youtube-filter 16,771 ms against ~4,900 ms quiet), and one
 * test whose body measures 4.80 s exceeded a 30,000 ms budget three runs in a row.
 * A gate that cannot report is worse than a flaky one: it looks like a failure and
 * carries no information (A46).
 *
 * So subtract the 1-minute load average from the core count. Fewer workers on a busy
 * machine finishes slower and finishes HONESTLY, which is the trade worth making —
 * the alternative is a red that means nothing. Floor of 2 keeps some parallelism, and
 * YOMU_CI_MAX_WORKERS / YOMU_CI_REGULAR_MAX_WORKERS still win outright so CI can pin
 * whatever it wants.
 */
function spareParallelism() {
    const cores = availableParallelism();
    // loadavg is unavailable (returns 0) on some platforms; treating that as "idle"
    // keeps the old behaviour rather than silently throttling to the floor.
    const busy = Math.max(0, Math.round(loadavg()[0]));
    const spare = cores - busy;
    if (busy >= cores) {
        // Be honest about the limit of this mitigation. Sizing our own workers down
        // stops the gate ADDING to the thrash, but it cannot rescue a machine that is
        // already oversubscribed by other work — the suite will still be starved, and
        // a timeout here will say nothing about the code. Measured 2026-07-31: load
        // average 36 on 10 cores, with three agent sessions gating in their own
        // worktrees. That run blew the 25-minute wall clock with zero test failures.
        console.warn(
            `[ci-tests] WARNING: load average ${busy} already exceeds ${cores} cores. `
            + 'This run may time out for reasons unrelated to the code, so a failure here is not evidence. '
            + 'Re-run on a quiet machine before believing a red.',
        );
    } else if (busy > 0 && spare < cores - 1) {
        console.log(`[ci-tests] load average ${busy} of ${cores} cores already busy; sizing workers to the remainder.`);
    }
    return Math.max(2, spare);
}

function defaultRegularMaxWorkers() {
    const shardConcurrency = regularShardConcurrency();
    const perShard = Math.floor(spareParallelism() / shardConcurrency);
    return Math.max(2, Math.min(4, perShard));
}

function regularShardConcurrency() {
    const shardTotal = readPositiveInt(process.env.YOMU_CI_REGULAR_SHARDS ?? '4', 'YOMU_CI_REGULAR_SHARDS');
    const fallback = Math.max(1, Math.min(4, shardTotal, availableParallelism()));
    return readPositiveInt(process.env.YOMU_CI_REGULAR_CONCURRENCY ?? String(fallback), 'YOMU_CI_REGULAR_CONCURRENCY');
}

function allReaderTestFiles() {
    return collectTestFiles(READER_TESTS_DIR).filter(file => !isGeneratedShardPath(file));
}

// vi.mock registrations leak across files in a reused fork. Keep the explicit
// quarantine honest: a newly-added reader vi.mock must either be removed in
// favour of dependency injection or added to ISOLATED_PASS_FILES.
function validateIsolatedPass(allFiles) {
    const all = new Set(allFiles);
    const missing = ISOLATED_PASS_FILES.filter(file => !all.has(file));
    if (missing.length) {
        throw new Error(`Reader isolated-pass files do not exist:\n${formatFileList(missing)}`);
    }
    const isolated = new Set(ISOLATED_PASS_FILES);
    const unisolatedMocks = allFiles.filter(file => {
        if (isolated.has(file)) return false;
        return /(^|\n)\s*vi\.(?:do)?mock\s*\(/m.test(readFileSync(file, 'utf8'));
    });
    if (unisolatedMocks.length) {
        throw new Error(`Reader tests using vi.mock/vi.doMock must run in the isolated pass:\n${formatFileList(unisolatedMocks)}`);
    }
}

function formatFileList(files) {
    return files.map(file => `  - ${relative(ROOT, file)}`).join('\n');
}

function regularShardSourceFiles() {
    return allReaderTestFiles().filter(file => !isJpdbTestFile(file));
}

function jpdbShardSourceFiles() {
    return allReaderTestFiles().filter(isJpdbTestFile);
}

function isJpdbTestFile(file) {
    return file.startsWith(JPDB_TESTS_DIR + '/');
}

// Defensive: never collect a stray generated shard dir left by a removed
// generator (`tests/reader/.vitest-*-shards/`) as if it were a real test file.
function isGeneratedShardPath(file) {
    return /\/\.vitest-[^/]*-shards\//.test(file);
}

function sizeBalancedBuckets(items, count, sizeForItem) {
    const buckets = Array.from({ length: count }, () => ({ size: 0, items: [] }));
    const sorted = [...items].sort((left, right) => sizeForItem(right) - sizeForItem(left));
    for (const item of sorted) {
        const bucket = buckets.reduce((smallest, candidate) => candidate.size < smallest.size ? candidate : smallest, buckets[0]);
        bucket.items.push(item);
        bucket.size += sizeForItem(item);
    }
    return buckets.map(bucket => bucket.items.sort());
}

function fileSize(file) {
    return statSync(file).size;
}

function collectTestFiles(dir) {
    return readdirSync(dir, { withFileTypes: true })
        .flatMap(entry => {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) return collectTestFiles(fullPath);
            return entry.isFile() && entry.name.endsWith('.test.ts') ? [fullPath] : [];
        })
        .sort();
}

function defaultApiPort(testKind, currentShard) {
    const basePort = readPositiveInt(process.env.YOMU_CI_VITEST_API_BASE_PORT ?? '55200', 'YOMU_CI_VITEST_API_BASE_PORT');
    const kindOffset = testKind === 'jpdb' ? 100 : 0;
    return String(basePort + kindOffset + currentShard);
}

function runVitest(vitestArgs, envOverrides = {}, context = {}) {
    exitWithVitestResult(spawnVitest(vitestArgs, envOverrides, context), context);
}

// Return the result so --kind all can run both passes and report either failure.
function spawnVitest(vitestArgs, envOverrides = {}, context = {}) {
    const selectedApiPort = context.apiPort ?? apiPort;
    const apiArgs = selectedApiPort === undefined ? [] : ['--api', String(selectedApiPort)];
    const commandArgs = [join(ROOT, 'node_modules/vitest/vitest.mjs'), ...vitestArgs, ...apiArgs];
    logVitestRun(context, commandArgs);
    return spawnSync(process.execPath, commandArgs, {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, ...envOverrides },
        timeout: testTimeoutMs,
    });
}

function apiPortAtOffset(offset) {
    return apiPort === undefined ? undefined : apiPort + offset;
}

function vitestResultStatus(result, context) {
    const errorStatus = vitestErrorStatus(result.error, context);
    if (errorStatus !== undefined) return errorStatus;
    if (result.signal) return vitestSignalStatus(result.signal, context);
    return result.status ?? 1;
}

function exitWithVitestResult(result, context) {
    const errorStatus = vitestErrorStatus(result.error, context);
    if (errorStatus !== undefined) process.exit(errorStatus);
    if (result.signal) process.exit(vitestSignalStatus(result.signal, context));
    process.exit(result.status ?? 1);
}

function vitestErrorStatus(error, context) {
    if (!error) return undefined;
    if (error.code === 'ETIMEDOUT') return vitestTimeoutStatus(context);
    console.error(`[ci-tests] Failed to run ${context.label ?? 'Vitest shard'}:`);
    console.error(error);
    return 1;
}

function vitestTimeoutStatus(context) {
    console.error(`[ci-tests] ${context.label ?? 'Vitest shard'} timed out after ${formatDuration(testTimeoutMs)}.`);
    logShardFiles(context.files);
    return 124;
}

function vitestSignalStatus(signal, context) {
    console.error(`[ci-tests] ${context.label ?? 'Vitest shard'} exited from signal ${signal}.`);
    return 1;
}

function logVitestRun(context, commandArgs) {
    console.log(`[ci-tests] Running ${context.label ?? 'Vitest shard'} with timeout ${formatDuration(testTimeoutMs)}.`);
    logShardFiles(context.files);
    console.log(`[ci-tests] Command: ${[process.execPath, ...commandArgs].map(shellQuote).join(' ')}`);
}

function logShardFiles(files = []) {
    if (!files.length) return;
    console.log('[ci-tests] Shard files:');
    for (const file of files) {
        console.log(`  - ${relative(ROOT, file)}`);
    }
}

function shellQuote(value) {
    return /^[A-Za-z0-9_./:=@-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

function parseArgs(rawArgs) {
    const parsed = {};
    for (let index = 0; index < rawArgs.length; index += 1) {
        const arg = rawArgs[index];
        if (!arg.startsWith('--')) continue;
        const parsedArg = readCliArg(rawArgs, index);
        parsed[parsedArg.key] = parsedArg.value;
        if (parsedArg.consumesNext) index += 1;
    }
    return parsed;
}

function readCliArg(rawArgs, index) {
    const keyValue = rawArgs[index].slice(2).split('=');
    const nextValue = rawArgs[index + 1];
    const consumesNext = keyValue.length === 1 && isExplicitCliValue(nextValue);
    return {
        key: keyValue[0],
        value: keyValue.length > 1 ? keyValue.slice(1).join('=') : consumesNext ? nextValue : true,
        consumesNext,
    };
}

function isExplicitCliValue(value) {
    return typeof value === 'string' && !value.startsWith('--');
}
