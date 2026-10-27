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
if (plan.full || !Array.isArray(plan.tests)) throw new Error('Missing proved test selection');
console.log(`[affected-tests] ${plan.changed.length} changed inputs since the last full pass; ${workers} workers; ${plan.reason}`);
for (const [name, args] of [
    ['reader', []],
    ['workers', ['--config', 'config/dictionaries/vitest.config.ts']],
    ...(process.env.YOMU_CHECK_RELEASE === '1' ? [] : [['academy', ['--config', 'config/vite/academy.config.ts']]]),
]) {
    if (name !== suite) continue;
    if (!plan.tests.length) continue;
    await run(process.execPath, [vitest, 'run', ...plan.tests, '--minWorkers=1', `--maxWorkers=${workers}`, ...args], {
        cwd: root, env: { ...process.env, VITEST_ISOLATE: '1', VITEST_MAX_FORKS: workers },
    });
}
