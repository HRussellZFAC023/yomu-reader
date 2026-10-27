#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boundedSizeBalancedBatches, firstNonzeroStatus } from './lib/ci-test-batches.mjs';
import { formatDuration, readPositiveInt } from './lib/ci-utils.mjs';
import { workerBudget } from './lib/test-workers.mjs';
import { readerNodeFiles } from '../config/vite/reader-test.ts';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const READER_TESTS_DIR = join(ROOT, 'tests/reader');
const NODE_FILES = new Set(readerNodeFiles.map(file => join(ROOT, file)));
// The jpdb suite runs on its own CI matrix (serial, its own API-port range) so it
// is sharded separately from every other reader test. Everything under this dir
// is the jpdb lane; everything else is "regular".
const JPDB_TESTS_DIR = join(ROOT, 'tests/reader/jpdb');

// These catalogue allocations measured 1,676 MB and 1,032 MB on their own.
// Every jsdom file is already isolated; ordinary mock/lifecycle suites need no
// second scheduling pass. Retain only the measured memory outliers here.
const DEDICATED_PASS_FILES = [
    join(ROOT, 'tests/reader/dictionary-catalog-browse.test.ts'),
    join(ROOT, 'tests/reader/catalog-browse-search-and-locale.test.ts'),
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
    const mainFiles = allFiles.filter(file => !dedicated.has(file) && !NODE_FILES.has(file));
    const maxWorkers = readPositiveInt(
        process.env.YOMU_CI_MAX_WORKERS
            ?? String(workerBudget()),
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
    // Vitest sizes each pool independently. Run the projects sequentially so
    // six budgeted workers cannot become six threads plus six jsdom forks.
    const nodeFiles = allFiles.filter(file => NODE_FILES.has(file));
    const nodeContext = { label: `reader Node project (${nodeFiles.length} files)`, files: nodeFiles, apiPort: apiPortAtOffset(0) };
    const nodeResult = spawnVitest(
        ['run', '--project', 'reader-node', ...nodeFiles.map(file => relative(ROOT, file)), '--minWorkers=1', `--maxWorkers=${maxWorkers}`],
        {}, nodeContext,
    );
    statuses.push(vitestResultStatus(nodeResult, nodeContext));
    for (const [index, files] of mainBatches.entries()) {
        const batchWorkers = Math.min(maxWorkers, files.length);
        const context = {
            label: `reader bounded isolated main batch ${index + 1}/${mainBatches.length} (${files.length} files, ${batchWorkers} workers)`,
            files,
            apiPort: apiPortAtOffset(index + 1),
        };
        const result = spawnVitest(
            ['run', '--project', 'reader-jsdom', ...files.map(file => relative(ROOT, file)), '--minWorkers=1', `--maxWorkers=${batchWorkers}`],
            { VITEST_ISOLATE: '1' },
            context,
        );
        statuses.push(vitestResultStatus(result, context));
    }
    const dedicatedContext = {
        label: `reader dedicated isolated pass (${DEDICATED_PASS_FILES.length} files)`,
        files: DEDICATED_PASS_FILES,
        apiPort: apiPortAtOffset(mainBatches.length + 1),
    };
    const dedicatedResult = spawnVitest(
        ['run', '--project', 'reader-jsdom', ...DEDICATED_PASS_FILES.map(file => relative(ROOT, file)), '--minWorkers=1', `--maxWorkers=${Math.min(maxWorkers, 2)}`],
        { VITEST_ISOLATE: '1' },
        dedicatedContext,
    );
    statuses.push(vitestResultStatus(dedicatedResult, dedicatedContext));
    process.exit(firstNonzeroStatus(statuses));
}

function runRegularShard(currentShard, shardTotal) {
    const filesForShard = sizeBalancedBuckets(regularShardSourceFiles(), shardTotal, fileSize)[currentShard - 1] ?? [];
    const maxWorkers = readPositiveInt(process.env.YOMU_CI_REGULAR_MAX_WORKERS ?? String(defaultRegularMaxWorkers()), 'YOMU_CI_REGULAR_MAX_WORKERS');
    const statuses = [];
    for (const project of ['reader-node', 'reader-jsdom']) {
        const files = filesForShard.filter(file => NODE_FILES.has(file) === (project === 'reader-node'));
        if (!files.length) continue;
        const context = { label: `regular shard ${currentShard}/${shardTotal} ${project}`, files };
        const result = spawnVitest(
            ['run', '--project', project, ...files.map(file => relative(ROOT, file)), '--minWorkers=1', `--maxWorkers=${maxWorkers}`],
            { VITEST_ISOLATE: '1' }, context,
        );
        statuses.push(vitestResultStatus(result, context));
    }
    process.exit(firstNonzeroStatus(statuses));
}

// jpdb tests share a mock API server + fake-indexeddb, so each shard runs its
// files serially (its own API port avoids cross-shard collisions).
function runJpdbShard(currentShard, shardTotal) {
    const filesForShard = sizeBalancedBuckets(jpdbShardSourceFiles(), shardTotal, fileSize)[currentShard - 1] ?? [];
    runVitest(
        ['run', '--project', 'reader-jsdom', ...filesForShard.map(file => relative(ROOT, file)), '--minWorkers=1', '--maxWorkers=1', '--no-file-parallelism'],
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
function defaultRegularMaxWorkers() {
    const shardConcurrency = regularShardConcurrency();
    return Math.max(1, Math.min(4, Math.floor(workerBudget() / shardConcurrency)));
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
    const missing = [...DEDICATED_PASS_FILES, ...NODE_FILES].filter(file => !all.has(file));
    if (missing.length) {
        throw new Error(`Reader project/scheduling files do not exist:\n${formatFileList(missing)}`);
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
    mkdirSync(join(ROOT, 'artifacts/check-profile'), { recursive: true });
    const report = (context.label ?? 'suite').replace(/[^a-z0-9]+/gi, '-');
    const commandArgs = [join(ROOT, 'node_modules/vitest/vitest.mjs'), ...vitestArgs, ...apiArgs,
        '--reporter=default', '--reporter=json', `--outputFile.json=artifacts/check-profile/${report}.json`];
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
