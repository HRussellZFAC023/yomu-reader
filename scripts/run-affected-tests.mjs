#!/usr/bin/env node
import { join } from 'node:path';
import { run } from './lib/ci-utils.mjs';
import { readJson } from './lib/stage-cache.mjs';
import { workerBudget } from './lib/test-workers.mjs';

const root = join(import.meta.dirname, '..');
const suite = process.argv[2] ?? 'reader';
const plan = readJson(join(root, `artifacts/check-logs/affected-tests-${suite}.json`));
if (!plan || !Array.isArray(plan.changed)) throw new Error('Missing affected-test plan');
const vitest = 'node_modules/vitest/vitest.mjs';
const workers = process.env.YOMU_CI_MAX_WORKERS ?? process.env.VITEST_MAX_FORKS ?? String(workerBudget());
console.log(`[affected-tests] ${plan.changed.length} changed inputs since the last full pass; ${workers} workers`);
if (suite === 'reader' && process.env.YOMU_CHECK_RELEASE === '1') {
    // Release selection stays complete, including the catalogue memory schedule.
    // The stage cache may reuse an exact full pass; a changed stage runs all files.
    await run(process.execPath, ['scripts/run-ci-suite.mjs'], {
        cwd: root,
        env: { ...process.env, VITEST_ISOLATE: '1', VITEST_MAX_FORKS: workers, YOMU_CI_MAX_WORKERS: workers },
    });
    process.exit(0);
}
// Vitest 1.6 filterTestsBySource selects a file when it is itself in `related`
// OR its import dependencies intersect `related`. Changed test files therefore
// run even when they have no imports; no second duplicate invocation is needed.
for (const [name, args] of [
    ['reader', []],
    ['workers', ['--config', 'config/dictionaries/vitest.config.ts']],
    ...(process.env.YOMU_CHECK_RELEASE === '1' ? [] : [['academy', ['--config', 'config/vite/academy.config.ts']]]),
]) {
    if (name !== suite) continue;
    const selections = name === 'reader'
        ? [
            ['run', '--project', 'reader-node'],
            ...(plan.changed.length ? [['related', ...plan.changed, '--run', '--project', 'reader-jsdom']] : []),
        ]
        : plan.changed.length ? [['related', ...plan.changed, '--run']] : [];
    for (const selection of selections) {
        await run(process.execPath, [vitest, ...selection, '--passWithNoTests', '--minWorkers=1', `--maxWorkers=${workers}`, ...args], {
            cwd: root, env: { ...process.env, VITEST_ISOLATE: '1', VITEST_MAX_FORKS: workers },
        });
    }
}
