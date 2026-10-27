#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { run } from './lib/ci-utils.mjs';

const require = createRequire(import.meta.url);
const { GREASY_FORK_LIBRARIES } = require('./lib/greasyfork-libraries.cjs');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = path.join(root, 'node_modules', '.bin', 'vite');

// Every library has a distinct output file and no public-directory copy.
// Bound concurrency rather than starting thirteen Rollup graphs at once.
const pending = [...GREASY_FORK_LIBRARIES];
const workers = Array.from({ length: 3 }, async () => {
    while (pending.length) {
        const library = pending.shift();
        const started = performance.now();
        await run(viteBin, ['build', '--config', 'config/vite/greasyfork-library.config.ts'], {
        cwd: root,
        env: {
            ...process.env,
            YOMU_GREASYFORK_LIBRARY_ID: library.id,
        },
        });
        console.log(`[build:profile] companion:${library.id} ${((performance.now() - started) / 1000).toFixed(2)}s`);
    }
});
const results = await Promise.allSettled(workers);
const failure = results.find(result => result.status === 'rejected');
if (failure) throw failure.reason;
