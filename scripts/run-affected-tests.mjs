#!/usr/bin/env node
import { join } from 'node:path';
import { run } from './lib/ci-utils.mjs';
import { readJson } from './lib/stage-cache.mjs';
import { workerBudget } from './lib/test-workers.mjs';
import { readerNodeFiles } from '../config/vite/reader-test.ts';
import { academyIsolatedFiles } from '../config/vite/academy-test.ts';

const root = join(import.meta.dirname, '..');
const suite = process.argv[2] ?? 'reader';
const plan = readJson(join(root, `artifacts/check-logs/affected-tests-${suite}.json`));
if (!plan || !Array.isArray(plan.changed)) throw new Error('Missing affected-test plan');
if (plan.full || !Array.isArray(plan.tests)) throw new Error('Missing proved test selection');
const workers = process.env.YOMU_CI_MAX_WORKERS ?? process.env.VITEST_MAX_FORKS ?? String(workerBudget());
console.log(`[affected-tests] ${plan.changed.length} changed inputs since the last full pass; ${workers} workers; ${plan.reason}`);

async function vitest(files, args = [], isolate = '1') {
    await run(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...files, '--minWorkers=1', `--maxWorkers=${workers}`, ...args], {
        cwd: root, env: { ...process.env, VITEST_ISOLATE: isolate, VITEST_MAX_FORKS: workers },
    });
}

if (suite === 'reader') {
    if (process.env.YOMU_CHECK_RELEASE === '1' && plan.changed.length) {
        // A changed release stage retains the full catalogue memory schedule.
        await run(process.execPath, ['scripts/run-ci-suite.mjs'], {
            cwd: root, env: { ...process.env, VITEST_ISOLATE: '1', VITEST_MAX_FORKS: workers, YOMU_CI_MAX_WORKERS: workers },
        });
    } else if (process.env.YOMU_CHECK_RELEASE !== '1') {
        // Each project owns a separate pool. Bound memory by running them in
        // sequence, retaining the complete pure-logic project on local checks.
        await vitest([...readerNodeFiles], ['--project', 'reader-node']);
        const node = new Set(readerNodeFiles);
        const browser = plan.tests.filter(file => !node.has(file));
        if (browser.length) await vitest(browser, ['--project', 'reader-jsdom']);
    }
} else if (suite === 'academy') {
    // Preserve the normal Academy realm policy, including the one mock owner.
    const isolated = new Set(academyIsolatedFiles);
    const shared = plan.tests.filter(file => !isolated.has(file));
    const owned = plan.tests.filter(file => isolated.has(file));
    if (shared.length) await vitest(shared, ['--config', 'config/vite/academy.config.ts'], '0');
    if (owned.length) await vitest(owned, ['--config', 'config/vite/academy.config.ts']);
} else if (suite === 'workers') {
    if (plan.tests.length) await vitest(plan.tests, ['--config', 'config/dictionaries/vitest.config.ts']);
} else throw new Error(`Unknown test suite: ${suite}`);
