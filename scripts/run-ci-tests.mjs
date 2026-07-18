#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatDuration, readPositiveInt } from './lib/ci-utils.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const READER_TESTS_DIR = join(ROOT, 'tests/reader');
// The jpdb suite runs on its own CI matrix (serial, its own API-port range) so it
// is sharded separately from every other reader test. Everything under this dir
// is the jpdb lane; everything else is "regular".
const JPDB_TESTS_DIR = join(ROOT, 'tests/reader/jpdb');

const args = parseArgs(process.argv.slice(2));
const kind = args.kind ?? 'regular';
const shard = readPositiveInt(args.shard ?? process.env.CI_TEST_SHARD ?? '1', 'shard');
const total = readPositiveInt(args.total ?? process.env.CI_TEST_TOTAL ?? '1', 'total');
const apiPort = args['no-api'] ? '' : args['api-port'] ?? process.env.YOMU_VITEST_API_PORT ?? defaultApiPort(kind, shard);
// kind=all runs the ENTIRE reader suite in one process; the historical 540s
// default was a PER-SHARD budget across 12 processes, so the single run gets a
// proportionally larger default. An explicit env/flag always wins.
const kindForTimeout = args.kind ?? 'regular';
const defaultTimeoutMs = kindForTimeout === 'all' ? '1500000' : '540000';
const testTimeoutMs = readPositiveInt(args['timeout-ms'] ?? process.env.YOMU_CI_TEST_TIMEOUT_MS ?? defaultTimeoutMs, 'YOMU_CI_TEST_TIMEOUT_MS');
if (shard > total) throw new Error(`shard ${shard} cannot be greater than total ${total}`);

// Tests are now plain files sharded by Vitest scheduling; there is nothing to
// pre-generate, so --prepare (kept for the legacy run-ci-suite sharded path) is a
// no-op. --reuse is likewise ignored.
if (kind === 'regular' && args.prepare) { /* no-op: real files need no generation */ }
else if (kind === 'regular') runRegularShard(shard, total);
else if (kind === 'jpdb' && args.prepare) { /* no-op */ }
else if (kind === 'jpdb') runJpdbShard(shard, total);
else if (kind === 'all') runAllTests();
else throw new Error(`Unknown CI test kind: ${kind}`);

// Whole reader suite in ONE Vitest process: one vite host transforms the shared
// src/ module graph once (instead of many shard processes each re-transforming it)
// and its forks share the transform cache; scheduling is left to Vitest.
function runAllTests() {
    const files = allReaderTestFiles();
    const maxWorkers = readPositiveInt(
        process.env.YOMU_CI_MAX_WORKERS ?? String(Math.max(2, availableParallelism() - 2)),
        'YOMU_CI_MAX_WORKERS',
    );
    runVitest(
        ['run', ...files.map(file => relative(ROOT, file)), '--minWorkers=1', `--maxWorkers=${maxWorkers}`],
        {},
        { label: `full reader suite (${files.length} files, ${maxWorkers} workers)` },
    );
}

function runRegularShard(currentShard, shardTotal) {
    const filesForShard = sizeBalancedBuckets(regularShardSourceFiles(), shardTotal, fileSize)[currentShard - 1] ?? [];
    const maxWorkers = readPositiveInt(process.env.YOMU_CI_REGULAR_MAX_WORKERS ?? String(defaultRegularMaxWorkers()), 'YOMU_CI_REGULAR_MAX_WORKERS');
    runVitest(
        ['run', ...filesForShard.map(file => relative(ROOT, file)), '--minWorkers=1', `--maxWorkers=${maxWorkers}`],
        {},
        { label: `regular shard ${currentShard}/${shardTotal}`, files: filesForShard },
    );
}

// jpdb tests share a mock API server + fake-indexeddb, so each shard runs its
// files serially (its own API port avoids cross-shard collisions).
function runJpdbShard(currentShard, shardTotal) {
    const filesForShard = sizeBalancedBuckets(jpdbShardSourceFiles(), shardTotal, fileSize)[currentShard - 1] ?? [];
    runVitest(
        ['run', ...filesForShard.map(file => relative(ROOT, file)), '--minWorkers=1', '--maxWorkers=1', '--no-file-parallelism'],
        {},
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
    const perShard = Math.floor(availableParallelism() / shardConcurrency);
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
    const apiArgs = apiPort ? ['--api', String(apiPort)] : [];
    const commandArgs = [join(ROOT, 'node_modules/vitest/vitest.mjs'), ...vitestArgs, ...apiArgs];
    logVitestRun(context, commandArgs);
    const result = spawnSync(process.execPath, commandArgs, {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, ...envOverrides },
        timeout: testTimeoutMs,
    });
    exitWithVitestResult(result, context);
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
