#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeDeathReason } from './lib/check-log-guard.mjs';
import { formatDuration, readPositiveInt } from './lib/ci-utils.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REGULAR_SHARD_TOTAL = readPositiveInt(process.env.YOMU_CI_REGULAR_SHARDS ?? '4', 'YOMU_CI_REGULAR_SHARDS');
const SHARD_TOTAL = readPositiveInt(process.env.YOMU_CI_JPDB_SHARDS ?? '8', 'YOMU_CI_JPDB_SHARDS');
const REGULAR_CONCURRENCY = readPositiveInt(
    process.env.YOMU_CI_REGULAR_CONCURRENCY ?? String(Math.max(1, Math.min(4, REGULAR_SHARD_TOTAL, availableParallelism()))),
    'YOMU_CI_REGULAR_CONCURRENCY',
);
const JPDB_CONCURRENCY = readPositiveInt(
    process.env.YOMU_CI_JPDB_CONCURRENCY ?? String(Math.max(1, Math.min(4, SHARD_TOTAL, availableParallelism()))),
    'YOMU_CI_JPDB_CONCURRENCY',
);
const USE_VITEST_API = process.env.YOMU_CI_VITEST_API === '1';
const VITEST_API_BASE_PORT = readPositiveInt(process.env.YOMU_CI_VITEST_API_BASE_PORT ?? '55200', 'YOMU_CI_VITEST_API_BASE_PORT');
const TEST_TIMEOUT_MS = readPositiveInt(process.env.YOMU_CI_TEST_TIMEOUT_MS ?? '540000', 'YOMU_CI_TEST_TIMEOUT_MS');
// The suite-child (outer) timeout must sit comfortably above the inner Vitest
// spawnSync timeout so a genuinely slow shard reports a clean Vitest ETIMEDOUT
// (exit 124 with the offending shard files logged) instead of being SIGTERM'd
// from underneath. 30s of headroom is tight when a loaded runner is thrashing
// and slow to service the inner timer; 90s guarantees the inner one always wins
// the race and we never mask which shard hung.
const SUITE_CHILD_TIMEOUT_MS = readPositiveInt(process.env.YOMU_CI_SUITE_CHILD_TIMEOUT_MS ?? String(TEST_TIMEOUT_MS + 90000), 'YOMU_CI_SUITE_CHILD_TIMEOUT_MS');
const SUITE_CHILD_KILL_GRACE_MS = readPositiveInt(process.env.YOMU_CI_SUITE_CHILD_KILL_GRACE_MS ?? '5000', 'YOMU_CI_SUITE_CHILD_KILL_GRACE_MS');
// Written through unchanged; retained only far enough back to still contain the
// abort message, which V8 prints immediately before the process dies. Declared
// up here with the other constants because teeShardOutput runs on the child's
// FIRST chunk: a `const` further down the file is still in its temporal dead
// zone at that point, and reading it threw ReferenceError — which crashed the
// runner on exactly the path that was supposed to explain the crash.
const SHARD_TAIL_BYTES = 64 * 1024;
const targetedVitestArgs = process.argv.slice(2);

if (targetedVitestArgs.length) {
    runTargetedVitest(targetedVitestArgs);
    process.exit(0);
}

if (process.env.YOMU_CI_SHARDED === '1') {
    // Legacy multi-process sharding: several Vitest hosts each re-transform the
    // shared module graph. Kept for CI runners that matrix shards across
    // machines; single-machine runs use the bounded local path below.
    runShard('regular', 1, REGULAR_SHARD_TOTAL, ['--prepare']);
    await runParallelShards('regular', REGULAR_SHARD_TOTAL, REGULAR_CONCURRENCY, shard => [
        '--reuse',
        ...ciTestVitestApiArgs(VITEST_API_BASE_PORT + shard),
    ]);
    runShard('jpdb', 1, SHARD_TOTAL, ['--prepare']);
    await runParallelShards('jpdb', SHARD_TOTAL, JPDB_CONCURRENCY, shard => [
        '--reuse',
        ...ciTestVitestApiArgs(VITEST_API_BASE_PORT + REGULAR_SHARD_TOTAL + shard),
    ]);
} else {
    await runBoundedLocalPass();
}

async function runBoundedLocalPass() {
    const { status, deathReason } = await runTeedChild([
        join(ROOT, 'scripts/run-ci-tests.mjs'),
        '--kind', 'all',
        ...ciTestVitestApiArgs(VITEST_API_BASE_PORT),
    ], 'the reader suite');
    if (status !== 0) process.exit(status ?? 1);
    if (deathReason) process.exit(1);
}

/**
 * Spawn a child with its output written straight through AND readable here.
 *
 * `stdio: 'inherit'` is invisible to this process, which is why a dead worker
 * could look exactly like a failing test: the only evidence is in the child's
 * own output. Piping and echoing costs nothing at this volume and lets
 * reportRuntimeDeath say what actually happened.
 */
function runTeedChild(args, label) {
    return new Promise(resolve => {
        const child = spawn(process.execPath, args, {
            cwd: ROOT,
            stdio: ['inherit', 'pipe', 'pipe'],
            env: process.env,
        });
        const context = { label, deathReason: null };
        teeShardOutput(child, context);
        child.on('error', error => {
            console.error(error);
            resolve({ status: 1, deathReason: context.deathReason });
        });
        child.on('exit', (code, signal) => {
            // A SIGKILL'd child reports code null; the OS killed it, which is
            // itself a runtime death rather than a test result.
            if (!context.deathReason && signal) context.deathReason = `a worker was killed by signal ${signal}`;
            if (context.deathReason) reportRuntimeDeath(context);
            resolve({ status: code ?? 1, deathReason: context.deathReason });
        });
    });
}

function runShard(kind, shard, total, extraArgs = []) {
    const result = spawnSync(process.execPath, [
        join(ROOT, 'scripts/run-ci-tests.mjs'),
        '--kind', kind,
        '--shard', String(shard),
        '--total', String(total),
        ...extraArgs,
    ], {
        cwd: ROOT,
        stdio: 'inherit',
        env: process.env,
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
}

function runTargetedVitest(args) {
    const apiArgs = hasVitestApiArg(args) ? [] : directVitestApiArgs(VITEST_API_BASE_PORT);
    const result = spawnSync(process.execPath, [
        join(ROOT, 'node_modules/vitest/vitest.mjs'),
        'run',
        ...args,
        ...apiArgs,
    ], {
        cwd: ROOT,
        stdio: 'inherit',
        env: process.env,
        timeout: TEST_TIMEOUT_MS,
    });
    reportTargetedVitestFailure(result);
    process.exit(targetedVitestStatus(result));
}

function reportTargetedVitestFailure(result) {
    if (result.error) {
        console.error('[ci-suite] Targeted Vitest run failed:');
        console.error(result.error);
        return;
    }
    if (result.signal) {
        console.error(`[ci-suite] Targeted Vitest run exited from signal ${result.signal}.`);
    }
}

function targetedVitestStatus(result) {
    return [
        targetedVitestErrorStatus(result),
        targetedVitestSignalStatus(result),
        result.status ?? 1,
    ].find(status => status !== null);
}

function targetedVitestErrorStatus(result) {
    if (!result.error) return null;
    return result.error.code === 'ETIMEDOUT' ? 124 : 1;
}

function targetedVitestSignalStatus(result) {
    return result.signal ? 1 : null;
}

function hasVitestApiArg(args) {
    return args.some(arg => arg === '--api' || arg.startsWith('--api=') || arg.startsWith('--api.'));
}

function ciTestVitestApiArgs(port) {
    return USE_VITEST_API ? ['--api-port', String(port)] : ['--no-api'];
}

function directVitestApiArgs(port) {
    return USE_VITEST_API ? ['--api', String(port)] : [];
}

async function runParallelShards(kind, total, concurrency, extraArgsForShard = () => []) {
    const pending = Array.from({ length: total }, (_, index) => index + 1);
    const active = new Map();
    let failureStatus = 0;
    await new Promise(resolve => {
        const maybeStart = () => {
            if (failureStatus) pending.length = 0;
            else startPendingShards(pending, active, concurrency, shard => startShard(shard, maybeStart));
            if (allShardsFinished(pending, active)) resolve();
        };
        maybeStart();
    });
    if (failureStatus) process.exit(failureStatus);

    function startShard(shard, onDone) {
        const label = `${kind} shard ${shard}/${total}`;
        const startedAt = Date.now();
        console.log(`[ci-suite] Starting ${label}.`);
        const child = spawn(process.execPath, [
            join(ROOT, 'scripts/run-ci-tests.mjs'),
            '--kind', kind,
            '--shard', String(shard),
            '--total', String(total),
            ...extraArgsForShard(shard),
        ], {
            cwd: ROOT,
            // Piped rather than inherited so the runner can READ what the shard
            // printed. A fork that dies of heap exhaustion produces an
            // all-passing summary and exit 1, which is indistinguishable from a
            // real test failure unless someone scans the output — see
            // runtimeDeathReason below. Everything is written straight through,
            // so the console is unchanged.
            stdio: ['inherit', 'pipe', 'pipe'],
            env: process.env,
        });
        const context = { label, startedAt, timeout: undefined, killTimer: undefined, timedOut: false, stoppingAfterFailure: false, deathReason: null };
        teeShardOutput(child, context);
        context.timeout = setTimeout(() => {
            context.timedOut = true;
            console.error(`[ci-suite] ${label} exceeded ${formatDuration(SUITE_CHILD_TIMEOUT_MS)}; terminating.`);
            child.kill('SIGTERM');
            context.killTimer = setTimeout(() => child.kill('SIGKILL'), SUITE_CHILD_KILL_GRACE_MS);
            context.killTimer.unref?.();
        }, SUITE_CHILD_TIMEOUT_MS);
        context.timeout.unref?.();
        active.set(child, context);
        child.on('exit', code => {
            failureStatus = handleShardExit({ active, child, code, context, failureStatus, onDone });
        });
        child.on('error', error => {
            failureStatus = handleShardError({ active, child, error, context, failureStatus, onDone });
        });
    }
}

function handleShardExit({ active, child, code, context, failureStatus, onDone }) {
    finishShard(active, child, context);
    const status = shardExitStatus(code, context);
    logShardExit(code, context, status);
    const nextFailureStatus = shardFailureStatus(status, failureStatus, active, child);
    onDone();
    return nextFailureStatus;
}

function handleShardError({ active, child, error, context, failureStatus, onDone }) {
    finishShard(active, child, context);
    console.error(error);
    const nextFailureStatus = shardFailureStatus(1, failureStatus, active, child);
    onDone();
    return nextFailureStatus;
}

function finishShard(active, child, context) {
    clearTimeout(context.timeout);
    clearTimeout(context.killTimer);
    active.delete(child);
}

function shardExitStatus(code, context) {
    return context.timedOut ? 124 : code ?? 1;
}

function logShardExit(code, context, status) {
    const suffix = context.timedOut ? 'timed out' : code === 0 ? 'passed' : `failed with exit ${status}`;
    console.log(`[ci-suite] Finished ${context.label} in ${formatDuration(Date.now() - context.startedAt)} (${suffix}).`);
    if (code !== 0 && context.deathReason) reportRuntimeDeath(context);
}

// A worker that dies takes its files' results with it. Reported here rather than
// left to the reader of a summary that looks green.
function reportRuntimeDeath(context) {
    console.error('');
    console.error(`[ci-suite] ${context.label} DID NOT FINISH: ${context.deathReason}.`);
    console.error('[ci-suite] This is NOT a test failure — some files never ran, so the pass count');
    console.error('[ci-suite] above is smaller than the suite and proves nothing about them.');
    console.error('[ci-suite] Compare "Test Files N passed (M)": any M > N are the files that died.');
    console.error('[ci-suite] Re-run those files alone on a quiet machine. The reader gate already');
    console.error('[ci-suite] isolates every file, so do not quarantine or change a test until the');
    console.error('[ci-suite] runtime death is classified as a file leak, host load, or runner fault.');
    console.error('');
}

function teeShardOutput(child, context) {
    let tail = '';
    const consume = (chunk, sink) => {
        const text = String(chunk);
        sink.write(text);
        if (context.deathReason) return;
        tail = (tail + text).slice(-SHARD_TAIL_BYTES);
        context.deathReason = runtimeDeathReason(tail);
    };
    child.stdout?.on('data', chunk => consume(chunk, process.stdout));
    child.stderr?.on('data', chunk => consume(chunk, process.stderr));
}

function shardFailureStatus(status, failureStatus, active, child) {
    if (status === 0 || failureStatus) return failureStatus;
    stopOtherActiveShards(active, child);
    return status;
}

function stopOtherActiveShards(active, failedChild) {
    for (const [child, context] of active) {
        if (child === failedChild || context.stoppingAfterFailure) continue;
        context.stoppingAfterFailure = true;
        console.error(`[ci-suite] Stopping ${context.label} because another shard failed.`);
        child.kill('SIGTERM');
    }
}

function startPendingShards(pending, active, concurrency, startShard) {
    while (active.size < concurrency && pending.length) {
        startShard(pending.shift());
    }
}

function allShardsFinished(pending, active) {
    return !active.size && !pending.length;
}
