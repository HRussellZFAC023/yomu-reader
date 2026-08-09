import { availableParallelism } from 'node:os';

type TestConfigEnv = Readonly<Record<string, string | undefined>>;

export function readerTestConfig(
    env: TestConfigEnv = process.env,
    parallelism = availableParallelism(),
) {
    return {
        environment: 'jsdom',
        include: ['tests/reader/**/*.test.ts'],
        // Guard against a stray generated shard dir left by a removed generator.
        exclude: ['tests/reader/**/.vitest-*-shards/**'],
        setupFiles: ['tests/reader/setup.ts'],
        globals: true,
        // A handful of timing-sensitive audio/bridge tests pass in isolation but
        // can flake when scheduling shifts under the full sequential run; retry
        // absorbs that without masking a genuine, repeatable failure.
        retry: 2,
        pool: 'forks',
        // Keep the default at the top-level Vitest option. A pool-specific
        // maxForks takes precedence over --maxWorkers, which made the release
        // runner's advertised one-worker limit silently launch one fork per core.
        maxWorkers: readMaxWorkers(env, parallelism),
        poolOptions: {
            forks: {
                // Direct, targeted, sharded, and release-gate commands are
                // per-file isolated. VITEST_ISOLATE=0 remains available only for
                // deliberate diagnostics; it is not a supported CI boundary
                // because cached runtime graphs can outlive their jsdom realm.
                isolate: env.VITEST_ISOLATE !== '0',
                // Cap any single file's fork so a leak fails loudly instead of
                // OOM-killing the machine (historical tinypool exit-137 deaths).
                // Small CI runners can tighten this limit explicitly.
                execArgv: [`--max-old-space-size=${forkHeapMb(env)}`],
            },
        },
    };
}

function forkHeapMb(env: TestConfigEnv): number {
    const override = Number.parseInt(env.YOMU_VITEST_FORK_HEAP_MB ?? '', 10);
    return Number.isInteger(override) && override >= 256 ? override : 2304;
}

function readMaxWorkers(env: TestConfigEnv, parallelism: number): number {
    const override = Number.parseInt(env.VITEST_MAX_FORKS ?? '', 10);
    if (Number.isInteger(override) && override >= 1) return override;
    return Math.max(2, Math.min(10, parallelism));
}
