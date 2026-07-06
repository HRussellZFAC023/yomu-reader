#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
const SUITE_CHILD_TIMEOUT_MS = readPositiveInt(process.env.YOMU_CI_SUITE_CHILD_TIMEOUT_MS ?? String(TEST_TIMEOUT_MS + 30000), 'YOMU_CI_SUITE_CHILD_TIMEOUT_MS');
const SUITE_CHILD_KILL_GRACE_MS = readPositiveInt(process.env.YOMU_CI_SUITE_CHILD_KILL_GRACE_MS ?? '5000', 'YOMU_CI_SUITE_CHILD_KILL_GRACE_MS');
const targetedVitestArgs = process.argv.slice(2);

if (targetedVitestArgs.length) {
    runTargetedVitest(targetedVitestArgs);
    process.exit(0);
}

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
            stdio: 'inherit',
            env: process.env,
        });
        const context = { label, startedAt, timeout: undefined, killTimer: undefined, timedOut: false, stoppingAfterFailure: false };
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
