import { defineConfig } from 'vitest/config';
import { readerTestDefines } from './reader-test';
import { createRequire } from 'node:module';
const { workerBudget } = createRequire(import.meta.url)('../../scripts/lib/test-workers.mjs') as { workerBudget(): number };

// One fork queue for Node, Reader jsdom and Academy. Vitest's separate threads
// and forks pools each enforce their own cap; using one pool makes the budget
// global and lets a finishing lane give every spare worker to the others.
export default defineConfig({
    define: { ...readerTestDefines },
    test: {
        workspace: 'config/vite/local-gate-workspace.ts',
        minWorkers: 1,
        maxWorkers: Number(process.env.YOMU_CI_MAX_WORKERS ?? process.env.VITEST_MAX_FORKS) || workerBudget(),
        pool: 'forks',
        poolOptions: { forks: { isolate: true, execArgv: [`--max-old-space-size=${process.env.YOMU_VITEST_FORK_HEAP_MB ?? 2304}`] } },
    },
});
