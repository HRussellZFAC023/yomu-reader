import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readerTestConfig } from '../../config/vite/reader-test';

describe('reader Vitest worker limits', () => {
    it('resolves the release environment to one overridable top-level worker', () => {
        const config = readerTestConfig({
            VITEST_MAX_FORKS: '1',
            YOMU_VITEST_FORK_HEAP_MB: '2304',
        }, 10);

        expect(config.minWorkers).toBe(1);
        expect(config.maxWorkers).toBe(1);
        expect(config.poolOptions.forks.isolate).toBe(true);
        expect(config.poolOptions.forks).not.toHaveProperty('maxForks');
        expect(config.poolOptions.forks.execArgv).toEqual(['--max-old-space-size=2304']);
    });

    it('bounds the default without installing a pool-specific CLI override', () => {
        const config = readerTestConfig({}, 32);

        expect(config.minWorkers).toBe(1);
        expect(config.maxWorkers).toBe(10);
        expect(config.poolOptions.forks).not.toHaveProperty('maxForks');
        expect(config.poolOptions.forks.execArgv).toEqual(['--max-old-space-size=2304']);
    });

    it('keeps the bounded main release batches per-file isolated', () => {
        const runner = readFileSync('scripts/run-ci-tests.mjs', 'utf8');
        const runAllTests = runner.match(
            /function runAllTests\(\) \{([\s\S]*?)\n\}\n\nfunction runRegularShard/,
        )?.[1];
        const mainBatch = runner.match(
            /for \(const \[index, files\] of mainBatches\.entries\(\)\) \{([\s\S]*?)\n    \}\n    const dedicatedContext/,
        )?.[1];

        expect(runAllTests, 'runner should contain runAllTests').toBeDefined();
        expect(runAllTests).not.toContain("{ VITEST_ISOLATE: '0' }");
        expect(runAllTests).toContain('Math.min(10, Math.max(2, spareParallelism() - 2))');
        expect(mainBatch, 'runAllTests should contain the bounded main-batch loop').toBeDefined();
        expect(mainBatch).toContain('reader bounded isolated main batch');
        expect(mainBatch).toContain("{ VITEST_ISOLATE: '1' }");
        expect(mainBatch).not.toContain("{ VITEST_ISOLATE: '0' }");
    });
});
