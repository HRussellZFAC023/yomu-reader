#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const VITEST_API_BASE_PORT = readPositiveInt(process.env.YOMU_CI_VITEST_API_BASE_PORT ?? '55200', 'YOMU_CI_VITEST_API_BASE_PORT');

runShard('regular', 1, REGULAR_SHARD_TOTAL, ['--prepare']);
await runParallelShards('regular', REGULAR_SHARD_TOTAL, REGULAR_CONCURRENCY, shard => [
    '--reuse',
    '--api-port',
    String(VITEST_API_BASE_PORT + shard),
]);
runShard('jpdb', 1, SHARD_TOTAL, ['--prepare']);
await runParallelShards('jpdb', SHARD_TOTAL, JPDB_CONCURRENCY, shard => [
    '--reuse',
    '--api-port',
    String(VITEST_API_BASE_PORT + REGULAR_SHARD_TOTAL + shard),
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

async function runParallelShards(kind, total, concurrency, extraArgsForShard = () => []) {
    const pending = Array.from({ length: total }, (_, index) => index + 1);
    const active = new Set();
    let failureStatus = 0;
    await new Promise(resolve => {
        const maybeStart = () => {
            if (failureStatus) pending.length = 0;
            while (!failureStatus && active.size < concurrency && pending.length) {
                startShard(pending.shift(), maybeStart);
            }
            if (!active.size && !pending.length) resolve();
        };
        maybeStart();
    });
    if (failureStatus) process.exit(failureStatus);

    function startShard(shard, onDone) {
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
        active.add(child);
        child.on('exit', code => {
            active.delete(child);
            if (code !== 0 && !failureStatus) failureStatus = code ?? 1;
            onDone();
        });
        child.on('error', error => {
            active.delete(child);
            console.error(error);
            if (!failureStatus) failureStatus = 1;
            onDone();
        });
    }
}

function readPositiveInt(value, label) {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer`);
    return parsed;
}
