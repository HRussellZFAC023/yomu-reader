#!/usr/bin/env node
import { run } from './lib/ci-utils.mjs';
import { workerBudget } from './lib/test-workers.mjs';
const workers = process.env.YOMU_CI_MAX_WORKERS ?? process.env.VITEST_MAX_FORKS ?? String(workerBudget());
console.log(`[local-tests] Reader Node, Reader jsdom and Academy share ${workers} isolated forks`);
await run(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'config/vite/local-gate.config.ts'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, VITEST_MAX_FORKS: workers },
});
