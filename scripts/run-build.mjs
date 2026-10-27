#!/usr/bin/env node
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { StageRunner, buildEnv, cacheOptions } from './lib/stage-runner.mjs';
import { run } from './lib/ci-utils.mjs';

const root = join(import.meta.dirname, '..');
const runner = new StageRunner(root, { ...cacheOptions(), prefix: 'build' });
const stage = {
    name: 'userscript', command: 'node scripts/run-build.mjs --execute',
    inputs: ['src/**', 'public/**', 'config/**', '!config/ci/content-addressed-retention.json', 'vite.config.ts', 'tsconfig*.json', 'scripts/**', '!scripts/fixtures/**'],
    env: buildEnv,
    // The gate's Academy build and Study sync own these namespaces after us.
    outputs: ['dist/**', '!dist/academy/**', '!dist/newtab/index.html', '!dist/newtab/sw.js', '!dist/newtab/version.json', '!dist/newtab/manifest.webmanifest'],
};
try {
    if (process.argv.includes('--execute')) await build();
    else await runner.run(stage);
    runner.summary(true);
} catch (error) {
    console.error(error);
    runner.summary(false);
    process.exitCode = 1;
}

async function build() {
    // Empty once before starting parallel writers. Letting Vite wipe dist while
    // Study/companions write beneath it loses files nondeterministically.
    mkdirSync(join(root, 'dist'), { recursive: true });
    for (const name of readdirSync(join(root, 'dist'))) {
        if (name !== 'academy') rmSync(join(root, 'dist', name), { recursive: true, force: true });
    }
    const step = async (name, args) => {
        const start = performance.now();
        await run(process.execPath, args, { cwd: root });
        console.log(`[build:profile] ${name} ${((performance.now() - start) / 1000).toFixed(2)}s`);
    };
    await step('runtime-catalog', ['scripts/dictionaries/build-runtime-catalog.mjs']);
    const vite = 'node_modules/vite/bin/vite.js';
    const results = await Promise.allSettled([
        step('core', [vite, 'build', '--emptyOutDir', 'false']),
        step('study', [vite, 'build', '--config', 'config/vite/newtab.config.ts']),
        step('css', ['scripts/build-reader-css.mjs']),
        step('companions', ['scripts/build-greasyfork-libraries.mjs']),
    ]);
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    for (const script of ['format-userscript-css.cjs', 'annotate-userscript-compliance.cjs', 'trim-userscript-indent.cjs', 'annotate-greasyfork-requires.cjs']) {
        await step(script, [`scripts/${script}`]);
    }
}
