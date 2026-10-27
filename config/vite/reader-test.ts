import { availableParallelism } from 'node:os';
import { createRequire } from 'node:module';

const pkg = createRequire(import.meta.url)('../../package.json') as { version: string };

export const readerTestDefines = {
    __YOMU_VERSION__: JSON.stringify(pkg.version),
    __YOMU_NEWTAB_BUILD__: JSON.stringify(false),
};

// Reviewed pure logic: no browser globals, companion registration, or module mocks.
// Keep this explicit; a new test starts in the isolated jsdom project.
export const readerNodeFiles = [
    'tests/reader/academy-build-manifest.test.ts',
    'tests/reader/anki-known-interval.test.ts',
    'tests/reader/anki-review-result.test.ts',
    'tests/reader/annotated-reading.test.ts',
    'tests/reader/annotation-power-policy.test.ts',
    'tests/reader/app-version.test.ts',
    'tests/reader/batch-receipt-ledger.test.ts',
    'tests/reader/bookwalker-assets.test.ts',
    'tests/reader/bunpro-client.test.ts',
    'tests/reader/card-state.test.ts',
    'tests/reader/compound-pitch.test.ts',
    'tests/reader/dictionary-catalog.test.ts',
    'tests/reader/dictionary-defaults.test.ts',
    'tests/reader/dictionary-preference-upgrade.test.ts',
    'tests/reader/enrichment-policy.test.ts',
    'tests/reader/gaming-settings-import.test.ts',
    'tests/reader/host-css-armour.test.ts',
    'tests/reader/immersion-query.test.ts',
    'tests/reader/japanese-input.test.ts',
    'tests/reader/japanese-script.test.ts',
    'tests/reader/jpdb-live-card.test.ts',
    'tests/reader/kanji-ruby-split.test.ts',
    'tests/reader/kanji-stroke-grader.test.ts',
    'tests/reader/kanjivg-path.test.ts',
    'tests/reader/lookup-scope-modules.test.ts',
    'tests/reader/managed-storage-keys.test.ts',
    'tests/reader/mining-language-regression.test.ts',
    'tests/reader/new-tab-card-selection.test.ts',
    'tests/reader/new-tab-sentence-furigana.test.ts',
    'tests/reader/new-tab-source-orchestrator.test.ts',
    'tests/reader/new-tab-study-hints.test.ts',
    'tests/reader/new-tab-study-sentence-source.test.ts',
    'tests/reader/new-tab-study-session.test.ts',
    'tests/reader/ocr-clean-image-blob.test.ts',
    'tests/reader/ocr-clean-text.test.ts',
    'tests/reader/ocr-dark-pass.test.ts',
    'tests/reader/ocr-lens-response.test.ts',
    'tests/reader/page-realm-injected-source.test.ts',
    'tests/reader/pitch-enrichment-priority.test.ts',
    'tests/reader/pitch-meta-variants.test.ts',
    'tests/reader/pitch-number-identity.test.ts',
    'tests/reader/pitch-pairs.test.ts',
    'tests/reader/pitch-srs.test.ts',
    'tests/reader/private-host.test.ts',
    'tests/reader/prose-selection.test.ts',
    'tests/reader/public-proxy-worker.test.ts',
    'tests/reader/radial-menu-layout.test.ts',
    'tests/reader/reading-lane-layout.test.ts',
    'tests/reader/rendered-token-furigana-repair.test.ts',
    'tests/reader/review-queue-owner.test.ts',
    'tests/reader/sensitive-settings-surface.test.ts',
    'tests/reader/settings-file-io.test.ts',
    'tests/reader/settings-legacy-coverage.test.ts',
    'tests/reader/shared-srs.test.ts',
    'tests/reader/site-library-filters.test.ts',
    'tests/reader/speaking-score.test.ts',
    'tests/reader/study-card-route.test.ts',
    'tests/reader/study-pwa-manifest.test.ts',
    'tests/reader/subtitle-batch-mining.test.ts',
    'tests/reader/subtitle-paint-state.test.ts',
    'tests/reader/subtitle-placeholder-cues.test.ts',
    'tests/reader/subtitle-twitter-x-cues.test.ts',
    'tests/reader/tadoku-catalog.test.ts',
    'tests/reader/term-span-resolver.test.ts',
    'tests/reader/user-facing-errors.test.ts',
    'tests/reader/userscript-manager-request.test.ts',
    'tests/reader/wanikani-integration.test.ts',
    'tests/reader/yomu-audio-worker.test.ts',
    'tests/reader/youtube-host.test.ts',
    'tests/reader/languages/japanese-target.test.ts',
    'tests/reader/languages/lookup-correctness.test.ts',
    'tests/reader/languages/lookup-spans.test.ts',
    'tests/reader/languages/profiles.test.ts',
    'tests/reader/languages/settings-migration.test.ts',
    'tests/reader/languages/target-text-parity.test.ts',
    'tests/reader/settings-form/11-lookup-pill-row.test.ts',
] as const;

type TestConfigEnv = Readonly<Record<string, string | undefined>>;

export function readerTestConfig(
    env: TestConfigEnv = process.env,
    parallelism = availableParallelism(),
) {
    const workers = readMaxWorkers(env, parallelism);

    return {
        environment: 'jsdom',
        include: ['tests/reader/**/*.test.ts'],
        // Guard against a stray generated shard dir left by a removed generator.
        exclude: ['tests/reader/**/.vitest-*-shards/**', ...readerNodeFiles],
        setupFiles: ['tests/reader/setup.ts'],
        globals: true,
        // Local failures are immediate; CI retries timing-sensitive flakes.
        retry: env.CI ? 2 : 0,
        pool: 'forks',
        // Keep the default at the top-level Vitest option. A pool-specific
        // maxForks takes precedence over --maxWorkers, which made the release
        // runner's advertised one-worker limit silently launch one fork per core.
        minWorkers: 1,
        maxWorkers: workers,
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

// Vitest 1.6 workspace projects. Neither project inherits the other's setup or
// environment. Only the pure Node project may retain its module graph.
export default [
    {
        define: readerTestDefines,
        test: { ...readerTestConfig(), name: 'reader-jsdom' },
    },
    {
        define: readerTestDefines,
        test: {
            name: 'reader-node',
            include: [...readerNodeFiles],
            environment: 'node',
            setupFiles: [],
            globals: true,
            retry: process.env.CI ? 2 : 0,
            pool: 'threads',
            minWorkers: 1,
            maxWorkers: readMaxWorkers(process.env, availableParallelism()),
            poolOptions: { threads: { isolate: false } },
        },
    },
];
