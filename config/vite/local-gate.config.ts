import { defineConfig } from 'vitest/config';
import { readerTestDefines } from './reader-test';
import { localNode, localReader, localAcademy } from './local-gate-selection';
import { createRequire } from 'node:module';
const { workerBudget } = createRequire(import.meta.url)('../../scripts/lib/test-workers.mjs') as { workerBudget(): number };

// All lanes share one transform graph and one fork queue. Only Node files use
// the Node environment; the runner installs Reader setup only in Reader jsdom.
export default defineConfig({
    define: { ...readerTestDefines },
    test: {
        include: [...new Set([...localNode, ...localReader, ...localAcademy])],
        environment: 'jsdom',
        environmentMatchGlobs: localNode.map(file => [file, 'node']),
        runner: 'config/vite/local-gate-runner.ts',
        setupFiles: [], globals: true, retry: 0, testTimeout: 30_000,
        minWorkers: 1,
        maxWorkers: Number(process.env.YOMU_CI_MAX_WORKERS ?? process.env.VITEST_MAX_FORKS) || workerBudget(),
        pool: './scripts/lib/local-gate-pool.mjs',
        poolOptions: { forks: { isolate: true, execArgv: [`--max-old-space-size=${process.env.YOMU_VITEST_FORK_HEAP_MB ?? 2304}`] } },
    },
});
