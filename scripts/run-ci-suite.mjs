#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SHARD_TOTAL = 8;

runShard('regular', 1, 1);
for (let shard = 1; shard <= SHARD_TOTAL; shard += 1) {
    runShard('jpdb', shard, SHARD_TOTAL);
}

function runShard(kind, shard, total) {
    const result = spawnSync(process.execPath, [
        join(ROOT, 'scripts/run-ci-tests.mjs'),
        '--kind', kind,
        '--shard', String(shard),
        '--total', String(total),
    ], {
        cwd: ROOT,
        stdio: 'inherit',
        env: process.env,
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
}
