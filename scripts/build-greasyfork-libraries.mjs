#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { GREASY_FORK_LIBRARIES } = require('./greasyfork-libraries.cjs');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = path.join(root, 'node_modules', '.bin', 'vite');

for (const library of GREASY_FORK_LIBRARIES) {
    await run(viteBin, ['build', '--config', 'vite.greasyfork-library.config.ts'], {
        ...process.env,
        YOMU_GREASYFORK_LIBRARY_ID: library.id,
    });
}

function run(command, args, env) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: root,
            env,
            stdio: 'inherit',
        });
        child.on('error', reject);
        child.on('exit', code => {
            if (code === 0) resolve();
            else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
        });
    });
}
