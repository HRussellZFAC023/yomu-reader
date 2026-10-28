#!/usr/bin/env node
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { StageRunner, buildEnv, cacheOptions } from './lib/stage-runner.mjs';
import { readerBuildInputs, javascriptBuildInputs } from './lib/gate-inputs.mjs';
import { createRequire } from 'node:module';
import { run } from './lib/ci-utils.mjs';

const root = join(import.meta.dirname, '..');
const runner = new StageRunner(root, { ...cacheOptions(), prefix: 'build' });
const stage = {
    name: 'userscript', command: 'node scripts/run-build.mjs --execute',
    inputs: readerBuildInputs(root),
    env: buildEnv,
    restoreOutputs: true, canonicalizesOutputs: true,
    // The gate's Academy build and Study sync own these namespaces after us.
    outputs: ['config/dictionaries/published/v1/runtime-catalog.json', 'dist/**', '!dist/academy/**', '!dist/newtab/index.html', '!dist/newtab/sw.js', '!dist/newtab/version.json', '!dist/newtab/manifest.webmanifest'],
};
try {
    if (process.argv.includes('--code')) await buildCode();
    else if (process.argv.includes('--execute')) await build();
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
    await step('runtime-catalog', ['scripts/dictionaries/build-runtime-catalog.mjs']);
    runner.refresh();
    const { GREASY_FORK_LIBRARIES } = createRequire(import.meta.url)('./lib/greasyfork-libraries.cjs');
    const entries = ['src/reader/userscript/entry.ts', 'src/reader/newtab/entrypoint.ts', ...GREASY_FORK_LIBRARIES.map(library => library.entry)];
    const results = await Promise.allSettled([
        runner.run({ name: 'javascript', command: 'node scripts/run-build.mjs --code',
            inputs: javascriptBuildInputs(root, readerBuildInputs(root), entries), env: buildEnv, restoreOutputs: true,
            outputs: ['dist/**', '!dist/academy/**', '!dist/yomu.css', '!dist/newtab/styles.css', '!dist/newtab/index.html', '!dist/newtab/sw.js', '!dist/newtab/version.json', '!dist/newtab/manifest.webmanifest'],
        }),
        step('css', ['scripts/build-reader-css.mjs']),
    ]);
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    await step('annotate-greasyfork-requires.cjs', ['scripts/annotate-greasyfork-requires.cjs']);
}
async function step(name, args) {
    const start = performance.now();
    await run(process.execPath, args, { cwd: root });
    console.log(`[build:profile] ${name} ${((performance.now() - start) / 1000).toFixed(2)}s`);
}
async function buildCode() {
    const vite = 'node_modules/vite/bin/vite.js';
    const results = await Promise.allSettled([
        step('core', [vite, 'build', '--emptyOutDir', 'false']),
        step('study', [vite, 'build', '--config', 'config/vite/newtab.config.ts']),
        step('companions', ['scripts/build-greasyfork-libraries.mjs']),
    ]);
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    for (const script of ['format-userscript-css.cjs', 'annotate-userscript-compliance.cjs', 'trim-userscript-indent.cjs']) await step(script, [`scripts/${script}`]);
}
