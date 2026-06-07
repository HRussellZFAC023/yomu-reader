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

for (const library of GREASY_FORK_LIBRARIES) {
    await run(viteBin, ['build', '--config', 'config/vite/greasyfork-library.config.ts'], {
        cwd: root,
        env: {
            ...process.env,
            YOMU_GREASYFORK_LIBRARY_ID: library.id,
        },
    });
}
