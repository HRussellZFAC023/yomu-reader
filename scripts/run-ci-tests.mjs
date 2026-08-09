#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
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

// Keep these tests in a dedicated release-scheduling pass. The main batches now
// use per-file isolation too; this list remains useful for separating the two
// largest catalogue allocations, mock-heavy graphs, and historically expensive
// lifecycle suites from the balanced main batches. Retune the list only from
// measured release-gate evidence, not by moving whichever file reports a red.
const DEDICATED_PASS_FILES = [
    // MEASURED 2026-08-02: these two expand the 2.6 MB published dictionary
    // catalogue into JS objects and peak at 1,676 MB and 1,032 MB resident ON
    // THEIR OWN, against a 2,304 MB --max-old-space-size cap. They are here to
    // keep the two largest allocations out of the balanced main schedule.
    //
    // The former isolate:false runner accumulated heap across files. On
    // 2026-08-03 the 485-file/4-worker pass reported 484 files green while one
    // worker died at the V8 heap limit, and different runs lost different files.
    // Per-file isolation now removes that accumulation; the dedicated placement
    // still keeps these measured outliers away from ordinary batch timing.
    //
    // If a bounded batch still dies, scripts/run-ci-suite.mjs remains the
    // backstop that reports the runtime death instead of calling it a test red.
    join(ROOT, 'tests/reader/dictionary-catalog-browse.test.ts'),
    join(ROOT, 'tests/reader/catalog-browse-search-and-locale.test.ts'),
    // Selects the active learning target through mocked modules; retain its
    // measured graph in the dedicated release schedule.
    join(ROOT, 'tests/reader/languages/learning-target-selection.test.ts'),
    // Builds a live overlay and asserts a reading reaches it. Passes alone; inherits
    // overlay/document state in the historical fork-reuse pass. Retained here as
    // a known lifecycle-heavy scheduling outlier.
    join(ROOT, 'tests/reader/late-enrichment-projection.test.ts'),
    // These overlay lifecycle suites pass alone but inherit enough document and
    // observer state in the historical reusable pass to exhaust fake timers.
    join(ROOT, 'tests/reader/detached-reading-overlay.test.ts'),
    join(ROOT, 'tests/reader/page-activity-parking.test.ts'),
    join(ROOT, 'tests/reader/reader-boot.test.ts'),
    join(ROOT, 'tests/reader/academy-account-settings.test.ts'),
    // The late bridge test owns storage-bridge globals and is deterministic
    // alone, but inherited stale state in the historical fork-reuse pass.
    join(ROOT, 'tests/reader/newtab-runtime-onboarding.test.ts'),
    // Dynamic storage mocks retain dependent module graphs after doUnmock;
    // the former reused fork could hand the next file a stale epoch closure.
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
    // inherited whatever a neighbour left in the document. Per-file isolation
    // now closes that boundary; its measured lifecycle remains dedicated.
    join(ROOT, 'tests/reader/gaming-first-run.test.ts'),
    // Exercises ReaderApp reconciliation under fake timers and the shared
    // reader fixture. It historically left a reused fork's next file unable to
    // advance timers; retain the measured producer in the dedicated schedule.
    join(ROOT, 'tests/reader/late-card-reconciliation.test.ts'),
    // MEASURED 2026-08-03: all 99 hover cases pass, but their cumulative
    // ReaderApp/mock lifecycle left a reused fork's next RAF-owning suite in
    // a stale state. `hover-lookup -> projection-sibling-realign` reproduces
    // deterministically: projection case 1 passes, then cases 2-6 time out.
    // Either half of the hover file followed by projection passed. Keep this
    // measured lifecycle outlier in the dedicated schedule.
    join(ROOT, 'tests/reader/hover-lookup.test.ts'),
    // Imports fake IndexedDB and Yomitan at module scope. The former
    // isolate:false host retained that runtime graph across torn-down jsdom
    // environments; a later zero-delay timer user then stalled. Production and
    // the current per-file-isolated runner keep one live realm.
    join(ROOT, 'tests/reader/yomitan-exact-candidate-lookup.test.ts'),
    // This suite was the sole reusable-pass owner that started the subtitle
    // housekeeping tick, including a destroy + same-instance re-init case. A
    // release-gate run reported its tick after jsdom teardown; lifecycle tracing
    // and three reruns confirmed the normal final destroy without reproducing
    // the escape. Retain this lifecycle-heavy suite in the dedicated schedule.
    join(ROOT, 'tests/reader/subtitles-controller/09-parse-cache-warmup-seek.test.ts'),
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
if (args['validate-dedicated-pass'] || args['validate-isolated-pass']) {
    const files = allReaderTestFiles();
    validateDedicatedPass(files);
    console.log(`[ci-tests] Reader dedicated-pass conformance passed (${files.length} files, ${DEDICATED_PASS_FILES.length} dedicated).`);
}
else if (kind === 'regular' && args.prepare) { /* no-op: real files need no generation */ }
else if (kind === 'regular') runRegularShard(shard, total);
else if (kind === 'jpdb' && args.prepare) { /* no-op */ }
else if (kind === 'jpdb') runJpdbShard(shard, total);
else if (kind === 'all') runAllTests();
else throw new Error(`Unknown CI test kind: ${kind}`);

// Run the main suite in bounded, per-file-isolated batches, then the dedicated
// scheduling group in another per-file-isolated host. In the old isolate:false
// boundary cached graphs crossed replaced jsdom environments, after which later
// timer users stalled. Reader tests are real files; scheduling inside each batch
// is left to Vitest.
function runAllTests() {
    const allFiles = allReaderTestFiles();
    validateDedicatedPass(allFiles);
    const dedicated = new Set(DEDICATED_PASS_FILES);
    const mainFiles = allFiles.filter(file => !dedicated.has(file));
    const maxWorkers = readPositiveInt(
        process.env.YOMU_CI_MAX_WORKERS
            ?? String(Math.min(10, Math.max(2, spareParallelism() - 2))),
        'YOMU_CI_MAX_WORKERS',
    );
    // Keep the measured batch size while changing its correctness boundary. In
    // the old isolate:false runner, 60 files per worker was a heap budget: 81
    // retained files reached ~2,086 MB and 162 exceeded the 2,304 MB cap. The
    // current runner recycles the worker and jsdom for every file, so this limit
    // now bounds each Vitest invocation's scheduling, transform cache, progress,
    // and failure scope instead of permitting cross-file runtime reuse.
    //
    //   3 forks  ~162 files each  peak 2,626 MB  = 114% of the 2,304 MB cap  -> aborted
    //   6 forks   ~81 files each  peak 2,086 MB  =  91% of the cap           -> clean
    //
    // This is now a legacy/misnamed compatibility knob: it bounds isolated main
    // scheduling, not runtime reuse. Keep it so existing CI configuration does
    // not silently change batch sizes; do not add another public override merely
    // to rename it during a release repair.
    const mainFilesPerWorker = readPositiveInt(
        process.env.YOMU_CI_REUSABLE_FILES_PER_WORKER ?? '60',
        'YOMU_CI_REUSABLE_FILES_PER_WORKER',
    );
    const mainBatches = boundedSizeBalancedBatches(
        mainFiles,
        maxWorkers * mainFilesPerWorker,
        fileSize,
    );
    const statuses = [];
    for (const [index, files] of mainBatches.entries()) {
        const batchWorkers = Math.min(maxWorkers, files.length);
        const context = {
            label: `reader bounded isolated main batch ${index + 1}/${mainBatches.length} (${files.length} files, ${batchWorkers} workers)`,
            files,
            apiPort: apiPortAtOffset(index),
        };
        const result = spawnVitest(
            ['run', ...files.map(file => relative(ROOT, file)), '--minWorkers=1', `--maxWorkers=${batchWorkers}`],
            { VITEST_ISOLATE: '1' },
            context,
        );
        statuses.push(vitestResultStatus(result, context));
    }
    const dedicatedContext = {
        label: `reader dedicated isolated pass (${DEDICATED_PASS_FILES.length} files)`,
        files: DEDICATED_PASS_FILES,
        apiPort: apiPortAtOffset(mainBatches.length),
    };
    const dedicatedResult = spawnVitest(
        ['run', ...DEDICATED_PASS_FILES.map(file => relative(ROOT, file)), '--minWorkers=1', '--maxWorkers=2'],
        { VITEST_ISOLATE: '1' },
        dedicatedContext,
    );
    statuses.push(vitestResultStatus(dedicatedResult, dedicatedContext));
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

// Keep the explicit, measured dedicated schedule honest. Per-file isolation
// means a new vi.mock does not need quarantine; add files here only when release
// timing or memory evidence warrants dedicated scheduling.
function validateDedicatedPass(allFiles) {
    const all = new Set(allFiles);
    const missing = DEDICATED_PASS_FILES.filter(file => !all.has(file));
    if (missing.length) {
        throw new Error(`Reader dedicated-pass files do not exist:\n${formatFileList(missing)}`);
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
