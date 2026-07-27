import { describe, expect, it } from 'vitest';
import { readerTestConfig } from '../../config/vite/reader-test';

describe('reader Vitest worker limits', () => {
    it('resolves the release environment to one overridable top-level worker', () => {
        const config = readerTestConfig({
            VITEST_MAX_FORKS: '1',
            YOMU_VITEST_FORK_HEAP_MB: '2304',
        }, 10);

        expect(config.maxWorkers).toBe(1);
        expect(config.poolOptions.forks).not.toHaveProperty('maxForks');
        expect(config.poolOptions.forks.execArgv).toEqual(['--max-old-space-size=2304']);
    });

    it('bounds the default without installing a pool-specific CLI override', () => {
        const config = readerTestConfig({}, 32);

        expect(config.maxWorkers).toBe(10);
        expect(config.poolOptions.forks).not.toHaveProperty('maxForks');
        expect(config.poolOptions.forks.execArgv).toEqual(['--max-old-space-size=2304']);
    });
});
